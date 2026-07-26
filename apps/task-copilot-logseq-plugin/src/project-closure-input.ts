import type {
  ServiceProjectClosureEvidenceDraft,
  ServiceProjectClosureUserJudgments,
} from "@task-copilot/service-client";

export type ProjectClosureFieldReader = (name: string) => string;

function requiredText(value: string, label: string, maximum = 4_000): string {
  const text = value.trim();
  if (!text || text.length > maximum) throw new Error(`${label}必须是 1–${maximum} 字。`);
  return text;
}

export function readProjectClosureUserJudgments(
  evidence: ServiceProjectClosureEvidenceDraft,
  read: ProjectClosureFieldReader,
): ServiceProjectClosureUserJudgments {
  const objectiveDispositions = evidence.objectiveJudgments.map(({ objective }, index) => {
    const disposition = read(`projectClosureObjectiveDisposition:${index}`);
    if (disposition === "COMPLETED") {
      return { objectiveId: objective.objectiveId, disposition: "COMPLETED" as const };
    }
    if (disposition !== "INCOMPLETE") throw new Error(`请判断“${objective.text}”是否完成。`);
    return {
      objectiveId: objective.objectiveId,
      disposition: "INCOMPLETE" as const,
      reason: requiredText(read(`projectClosureObjectiveReason:${index}`), `“${objective.text}”的未完成原因`, 2_000),
      nextStep: requiredText(read(`projectClosureObjectiveNextStep:${index}`), `“${objective.text}”的后续动作`, 2_000),
    };
  });
  const legacyDisposition = requiredText(read("projectClosureLegacyDisposition"), "遗留去向");
  if (evidence.unresolvedWork.some(({ text }) => !legacyDisposition.includes(text))) {
    throw new Error("遗留去向必须逐项保留上方尚未收口的工作。");
  }
  const keyDecisions = read("projectClosureKeyDecisions")
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean);
  if (keyDecisions.length === 0 || keyDecisions.length > 16) {
    throw new Error("请用 1–16 行记录本次确认的关键决定。");
  }
  if (new Set(keyDecisions).size !== keyDecisions.length || keyDecisions.some((text) => text.length > 1_000)) {
    throw new Error("关键决定不能重复，且每行不得超过 1000 字。");
  }
  return {
    actualResult: requiredText(read("projectClosureActualResult"), "实际结果"),
    objectiveDispositions,
    legacyDisposition,
    keyDecisions,
    futureSummary: requiredText(read("projectClosureFutureSummary"), "未来重入摘要"),
  };
}

export function projectClosureProposalFailure(error: unknown): string {
  const remoteCode = error && typeof error === "object" && "details" in error
    ? (error as { details?: { remoteCode?: unknown } }).details?.remoteCode
    : undefined;
  const code = typeof remoteCode === "string" ? remoteCode : "";
  if (
    ["V2_PROJECT_CLOSURE_EVIDENCE_STALE", "V2_OBJECT_VERSION_CONFLICT", "V2_OBJECT_NOT_FOUND"].includes(code)
  ) {
    return "Project 已变化、关闭或不存在；旧证据已作废，请重新整理证据。";
  }
  if (code.startsWith("LLM_")) {
    return "智能分析暂不可用；请稍后重试。证据、Project、正文和正式状态均未改变。";
  }
  if (code.startsWith("PROJECT_CLOSURE_PROVIDER_")) {
    return "Copilot 草稿没有通过事实与权限校验；请重试。证据、Project、正文和正式状态均未改变。";
  }
  return "关闭建议没有建立；请检查当前判断后重试。Project、正文和正式状态均未改变。";
}
