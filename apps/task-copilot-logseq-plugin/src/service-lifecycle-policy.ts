import type { ServiceSemanticCommit } from "@task-copilot/service-client";

export type ManagedRuntimeEndDecision =
  | { allowed: true }
  | { allowed: false; reason: "UNFINISHED_COMMIT" | "GRAPH_RECONCILIATION_REQUIRED"; count: number };

export type ManagedRuntimeBlockedPresentation = {
  surface: "AUDIT" | "SYSTEM_STATUS";
  message: string;
};

export function managedRuntimeEndDecision(input: {
  commits: ServiceSemanticCommit[];
  explicitSync: { pending: number; reconciliationRequired: boolean };
}): ManagedRuntimeEndDecision {
  const unfinished = input.commits.filter((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED");
  if (unfinished.length > 0) return { allowed: false, reason: "UNFINISHED_COMMIT", count: unfinished.length };
  if (input.explicitSync.pending > 0 || input.explicitSync.reconciliationRequired) {
    return { allowed: false, reason: "GRAPH_RECONCILIATION_REQUIRED", count: input.explicitSync.pending };
  }
  return { allowed: true };
}

export function managedRuntimeBlockedPresentation(
  decision: Exclude<ManagedRuntimeEndDecision, { allowed: true }>,
  operation: "RESTORE" | "END_RUNTIME",
): ManagedRuntimeBlockedPresentation {
  const stoppedAction = operation === "RESTORE" ? "Restore 没有开始" : "本地运行环境没有结束";
  if (decision.reason === "UNFINISHED_COMMIT") {
    return {
      surface: "AUDIT",
      message: `发现 ${decision.count} 项尚未完成或需要恢复的修改；已转到“最近修改与恢复”，${stoppedAction}。`,
    };
  }
  return {
    surface: "SYSTEM_STATUS",
    message: `正文连接或范围核对尚未完成；已打开系统状态，${stoppedAction}。`,
  };
}
