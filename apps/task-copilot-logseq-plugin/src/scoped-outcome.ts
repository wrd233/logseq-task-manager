export type ScopedOutcomeKind = "notice" | "error" | "result";
export type ScopedOutcomeLifecycle = "UNTIL_NEXT_ACTION" | "UNTIL_RECOVERY_RESOLVED";

export interface ScopedOutcome {
  actionId: string;
  scope: string;
  kind: ScopedOutcomeKind;
  lifecycle: ScopedOutcomeLifecycle;
  message?: string;
  commitId?: string;
}

export function activeOutcomeScope(input: { workspace: string; actionDialogKind?: string }): string {
  return input.actionDialogKind ? `dialog:${input.actionDialogKind}` : `workspace:${input.workspace}`;
}

export function createScopedOutcome(input: {
  actionId: string;
  scope: string;
  message?: string;
  error?: string;
  commitId?: string;
  recoveryRequired?: boolean;
}): ScopedOutcome | undefined {
  const actionId = input.actionId.trim();
  const scope = input.scope.trim();
  if (!actionId || actionId.length > 180 || !scope || scope.length > 180) return undefined;
  const lifecycle = input.recoveryRequired ? "UNTIL_RECOVERY_RESOLVED" : "UNTIL_NEXT_ACTION";
  if (input.commitId) return { actionId, scope, kind: "result", lifecycle, commitId: input.commitId };
  if (input.error) return { actionId, scope, kind: "error", lifecycle, message: input.error };
  if (input.message) return { actionId, scope, kind: "notice", lifecycle, message: input.message };
  return undefined;
}

export function outcomeForScope(outcome: ScopedOutcome | undefined, scope: string): ScopedOutcome | undefined {
  return outcome?.scope === scope ? outcome : undefined;
}
