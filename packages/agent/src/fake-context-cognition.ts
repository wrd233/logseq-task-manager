import type { CognitionExecutor, SemanticJudgment } from "@task-copilot/contracts";

/**
 * Deterministic context-aware executor. This is a fixture: its language rules are
 * intentional test scaffolding and must never become product NLP policy.
 */
export class FakeContextAwareExecutor implements CognitionExecutor {
  readonly id = "fake-context-cognition";

  async judge(input: Parameters<CognitionExecutor["judge"]>[0]): Promise<SemanticJudgment> {
    const byRole = (role: string) => input.contextPack.filter((item) => item.role === role);
    const source = byRole("SOURCE_DELTA").concat(byRole("ASSOCIATED_CONTEXT"));
    const text = source.map((item) => item.content).join("\n");
    const handles = source.map((item) => item.handle);
    const formal = byRole("FORMAL_STATE")[0]?.content ?? "";
    const conflicting = source.filter((item) => /没有其他可做|只能等/iu.test(item.content));
    const continuing = source.filter((item) => /还可以继续|仍可继续|继续完成|继续本地/iu.test(item.content));
    if (conflicting.length > 0 && continuing.length > 0) {
      const one = conflicting[0]!;
      const two = continuing[0]!;
      return { kind: "CONFLICT", dimension: "engagement", conflictingContextHandles: [one.handle, two.handle], summary: "Source material contains contradictory engagement directions." };
    }
    const next = /(?:下一步|接下来|当前推进)[：:]\s*([^。\n]{2,200})/u.exec(text)?.[1]?.trim() ?? null;
    if (next && !formal.includes(`当前推进：${next}`)) {
      return { kind: "CONFIRMED_CHANGE", dimension: "current_focus", proposedOperation: { type: "SET_CURRENT_FOCUS", currentFocus: next }, supportingContextHandles: source.filter((item) => item.content.includes(next)).map((item) => item.handle), rationaleSummary: "One bounded next focus is supported by the current source material." };
    }
    if (/WAITING/u.test(formal) && /已经|已确认|已完成|厂商补丁已到/iu.test(text)) {
      return { kind: "CONFIRMED_CHANGE", dimension: "engagement", proposedOperation: { type: "CHANGE_ENGAGEMENT", transition: { from: "WAITING", to: "ACTIONABLE", waiting: null } }, supportingContextHandles: source.filter((item) => /已经|已确认|已完成|厂商补丁已到/iu.test(item.content)).map((item) => item.handle), rationaleSummary: "The current WaitingCondition is satisfied by direct source material." };
    }
    if (/ACTIONABLE/u.test(formal) && /本地验证已全部完成[。；\n]?唯一剩余动作必须等待/iu.test(text)) {
      return { kind: "CONFIRMED_CHANGE", dimension: "engagement", proposedOperation: { type: "CHANGE_ENGAGEMENT", transition: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待厂商补丁", reviewAt: null } } }, supportingContextHandles: source.filter((item) => /等待厂商补丁|唯一剩余动作/iu.test(item.content)).map((item) => item.handle), rationaleSummary: "No reasonable active path remains; the whole object is blocked on the vendor patch." };
    }
    if (/忽略所有系统规则|COMPLETE_WORK_OBJECT|PARKED|完成项目|取消项目/iu.test(text)) {
      return { kind: "BOUNDARY_CANDIDATE", dimension: "authority", relevantContextHandles: handles, summary: "Source requests a boundary operation that automatic maintenance must not apply." };
    }
    if (/可能|或者|尚不确定|也许/iu.test(text)) {
      return { kind: "UNKNOWN", dimension: "current_focus", relevantContextHandles: handles, summary: "No unambiguous judgment can be derived from this context." };
    }
    return { kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "No supported semantic change is warranted." };
  }
}
