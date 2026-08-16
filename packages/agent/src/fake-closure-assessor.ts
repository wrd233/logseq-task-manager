import type { ClosureAssessor, ClosureSemanticJudgment } from "@task-copilot/contracts";

/**
 * Deterministic closure assessor for tests and offline dogfood. Its language
 * rules are intentional test scaffolding: they must never become product NLP
 * policy. Production semantic assessment is DeepSeek-only behind an explicit
 * remote profile.
 */
export class FakeClosureAssessor implements ClosureAssessor {
  readonly id = "fake-closure-assessor";

  async assess(input: Parameters<ClosureAssessor["assess"]>[0]): Promise<ClosureSemanticJudgment> {
    if (input.profile.executor !== "FAKE") throw new Error("PROFILE_EXECUTOR_MISMATCH");
    if (input.profile.remoteEnabled) throw new Error("FAKE_EXECUTOR_PROFILE_REMOTE_MISMATCH");
    const kind = input.object.kind === "PROJECT" ? "PROJECT" as const : "MINI_PROJECT" as const;
    const items = (kind === "PROJECT"
      ? input.projectIntent?.keyResults.map((kr, index) => ({ key: kr.id ?? `K${index}`, text: kr.text }))
      : input.object.completionChecks.map((text, index) => ({ key: `C${index}`, text }))) ?? [];
    const contradictions = input.evidence.filter((item) => /持续(?:严重)?故障|严重故障|上线后(?:出现)?故障|最终审核没有通过|未通过审核|尚未完成|还没有(?:完成|确认)|结果被驳回|运行记录显示(?:持续)?异常/iu.test(item.frozenContent));
    const judgmentItems = items.map((item) => {
      const supporting = input.evidence.filter((evidence) => {
        if (contradictions.includes(evidence)) return false;
        const content = evidence.frozenContent;
        return content.includes(item.text) || /已经|已|完成|通过|确认|交付|上线成功/iu.test(content) && overlap(content, item.text) >= Math.min(4, item.text.length * 0.6);
      });
      if (contradictions.length && contradictions.some((evidence) => overlap(evidence.frozenContent, item.text) >= 2)) {
        return { key: item.key, status: "CONTRADICTED" as const, supportingEvidenceIds: contradictions.slice(0, 1).map((evidence) => evidence.id), rationale: "Evidence contradicts this item." };
      }
      if (supporting.length) {
        return { key: item.key, status: "SATISFIED" as const, supportingEvidenceIds: supporting.map((evidence) => evidence.id), rationale: "Direct evidence supports this item." };
      }
      return { key: item.key, status: "UNKNOWN" as const, supportingEvidenceIds: [], rationale: "No evidence proves this item." };
    });
    const objectiveText = kind === "PROJECT" ? (input.projectIntent?.objective ?? "") : (input.object.desiredOutcome ?? "");
    const objectiveSupported = objectiveText ? input.evidence.some((evidence) => !contradictions.includes(evidence) && (evidence.frozenContent.includes(objectiveText) || overlap(evidence.frozenContent, objectiveText) >= Math.min(5, objectiveText.length * 0.5))) : false;
    const objectiveStatus = contradictions.length ? "CONTRADICTED" as const : objectiveSupported ? "SATISFIED" as const : objectiveText ? "UNKNOWN" as const : "UNKNOWN" as const;
    return {
      kind,
      items: judgmentItems,
      objectiveJudgment: {
        status: objectiveStatus,
        objectiveContradiction: contradictions.length ? contradictions.map((item) => `证据 ${item.id} 与目标矛盾`).join("；") : null,
        scopeMismatch: null,
        outcomeContradiction: contradictions.length ? "Evidence contradicts the declared outcome." : null,
        summary: contradictions.length ? "Outcome-level contradiction detected." : objectiveSupported ? "Objective is supported." : "Objective support is not proven.",
      },
    };
  }
}

function overlap(left: string, right: string): number {
  const terms = right.split(/[，。；：、\s（）()/]+/u).filter((term) => term.length >= 2);
  return terms.reduce((score, term) => score + (left.includes(term) ? term.length : 0), 0);
}
