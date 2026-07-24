import type { ServiceSemanticCommit } from "@task-copilot/service-client";

export type ManagedRuntimeEndDecision =
  | { allowed: true }
  | { allowed: false; reason: "UNFINISHED_COMMIT" | "GRAPH_RECONCILIATION_REQUIRED"; count: number };

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
