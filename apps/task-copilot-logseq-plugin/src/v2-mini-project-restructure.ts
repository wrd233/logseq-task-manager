import type {
  LocalServiceClient,
  ServiceMiniProjectRestructureCompensationStep,
  ServiceMiniProjectRestructurePreparation,
  ServiceMiniProjectRestructureRecoveryResult,
  ServiceMiniProjectRestructureStep,
  ServiceMiniProjectRestructureStepVerification,
} from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

type RestructureClient = Pick<LocalServiceClient,
  "prepareMiniProjectRestructure" |
  "verifyMiniProjectRestructureStep" |
  "beginMiniProjectRestructureRecovery" |
  "verifyMiniProjectRestructureCompensation"
>;
type RestructurePreparationContext = Pick<ServiceMiniProjectRestructurePreparation, "semanticCommitId" | "proposalId" | "expectedUpdatedAt" | "plan">;

export interface MiniProjectRestructureGraphHost {
  insertBlock(
    targetBlockUuid: string,
    content: string,
    options: { sibling: boolean; before?: boolean; customUUID: string },
  ): Promise<unknown>;
  moveBlock(sourceBlockUuid: string, targetBlockUuid: string, options?: { children: boolean }): Promise<unknown>;
  removeBlock(blockUuid: string): Promise<unknown>;
}

export type MiniProjectRestructureCommitResult =
  | { status: "COMPLETED"; semanticCommitId: string; proposalId: string; replayed: boolean }
  | { status: "STALE"; proposalId: string }
  | { status: "FAILED_COMPENSATED"; semanticCommitId: string; proposalId: string; replayed: boolean }
  | { status: "MANUAL_RECOVERY_REQUIRED"; semanticCommitId: string; proposalId: string; stepIndex: number; errorCode: string };

function restructureError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-185", "D-188"], ...(details ? { details } : {}) });
}

function returnedUuid(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const uuid = (value as { uuid?: unknown }).uuid;
  return typeof uuid === "string" ? uuid : undefined;
}

async function moveToPosition(
  host: MiniProjectRestructureGraphHost,
  blockUuid: string,
  parentBlockUuid: string,
  previousSiblingUuid: string | null,
): Promise<void> {
  if (previousSiblingUuid === null) {
    await host.moveBlock(blockUuid, parentBlockUuid, { children: true });
  } else {
    await host.moveBlock(blockUuid, previousSiblingUuid);
  }
}

async function applyStep(host: MiniProjectRestructureGraphHost, step: ServiceMiniProjectRestructureStep): Promise<void> {
  if (step.kind === "MOVE_BLOCK") {
    await moveToPosition(host, step.blockUuid, step.toParentBlockUuid, step.toPreviousSiblingUuid);
    return;
  }
  const created = step.previousSiblingUuid === null
    ? await host.insertBlock(step.parentBlockUuid, step.text, { sibling: false, before: true, customUUID: step.blockUuid })
    : await host.insertBlock(step.previousSiblingUuid, step.text, { sibling: true, customUUID: step.blockUuid });
  if (returnedUuid(created) !== step.blockUuid) {
    throw restructureError("V2_MINI_PROJECT_RESTRUCTURE_CREATE_IDENTITY_UNVERIFIED", "Logseq 没有返回匹配的确定 Block 身份；结构 Commit 已转入恢复。", { expectedBlockUuid: step.blockUuid });
  }
}

async function applyCompensation(host: MiniProjectRestructureGraphHost, step: ServiceMiniProjectRestructureCompensationStep): Promise<void> {
  if (step.kind === "REMOVE_CREATED_BLOCK") {
    await host.removeBlock(step.blockUuid);
    return;
  }
  await moveToPosition(host, step.blockUuid, step.toParentBlockUuid, step.toPreviousSiblingUuid);
}

function terminalRecovery(result: ServiceMiniProjectRestructureRecoveryResult): MiniProjectRestructureCommitResult | undefined {
  if (result.status === "FAILED_COMPENSATED") {
    return { status: "FAILED_COMPENSATED", semanticCommitId: result.semanticCommitId, proposalId: result.proposalId, replayed: result.replayed };
  }
  if (result.status === "MANUAL_RECOVERY_REQUIRED") {
    return { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: result.semanticCommitId, proposalId: result.proposalId, stepIndex: result.stepIndex, errorCode: result.errorCode };
  }
  return undefined;
}

async function recover(
  client: RestructureClient,
  host: MiniProjectRestructureGraphHost,
  prepared: RestructurePreparationContext,
  failedStepIndex: number,
  failureCode: "GRAPH_WRITE_FAILED" | "GRAPH_VERIFY_FAILED" | "DESKTOP_DISCONNECTED",
  traceId: string,
): Promise<MiniProjectRestructureCommitResult> {
  const input = {
    semanticCommitId: prepared.semanticCommitId,
    expectedUpdatedAt: prepared.expectedUpdatedAt,
    failedStepIndex,
    failureCode,
    traceId: `${traceId}:recovery:begin`,
  } as const;
  const started = await client.beginMiniProjectRestructureRecovery(prepared.proposalId, input);
  const terminal = terminalRecovery(started);
  if (terminal) return terminal;
  if (started.status !== "COMPENSATION_REQUIRED") {
    throw restructureError("V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_PROTOCOL_INVALID", "结构恢复没有返回可执行的逆向计划。", { status: started.status });
  }
  for (const { stepIndex, step } of started.compensations) {
    const verifyInput = { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: prepared.expectedUpdatedAt, traceId: `${traceId}:recovery:${stepIndex}` };
    let observed = await client.verifyMiniProjectRestructureCompensation(prepared.proposalId, stepIndex, verifyInput);
    const observedTerminal = terminalRecovery(observed);
    if (observedTerminal) return observedTerminal;
    if (observed.status === "COMPENSATED") continue;
    if (observed.status !== "NOT_COMPENSATED") {
      throw restructureError("V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_PROTOCOL_INVALID", "结构恢复核验没有返回可继续的状态。", { status: observed.status, stepIndex });
    }
    try {
      await applyCompensation(host, step);
    } catch {
      return { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_COMPENSATION_WRITE_FAILED" };
    }
    observed = await client.verifyMiniProjectRestructureCompensation(prepared.proposalId, stepIndex, { ...verifyInput, traceId: `${verifyInput.traceId}:after` });
    const afterTerminal = terminalRecovery(observed);
    if (afterTerminal) return afterTerminal;
    if (observed.status !== "COMPENSATED") {
      return {
        status: "MANUAL_RECOVERY_REQUIRED",
        semanticCommitId: prepared.semanticCommitId,
        proposalId: prepared.proposalId,
        stepIndex,
        errorCode: observed.status === "MANUAL_RECOVERY_REQUIRED" ? observed.errorCode : "V2_MINI_PROJECT_RESTRUCTURE_COMPENSATION_VERIFY_FAILED",
      };
    }
  }
  throw restructureError("V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_PROTOCOL_INVALID", "逆向计划结束后 Service 没有关闭恢复账本。");
}

function completed(result: ServiceMiniProjectRestructureStepVerification): MiniProjectRestructureCommitResult | undefined {
  if (result.status !== "COMPLETED") return undefined;
  return { status: "COMPLETED", semanticCommitId: result.semanticCommitId, proposalId: result.proposalId, replayed: result.replayed };
}

export async function commitMiniProjectRestructure(
  client: RestructureClient,
  host: MiniProjectRestructureGraphHost,
  proposalId: string,
  expectedUpdatedAt: string,
  traceId: string,
): Promise<MiniProjectRestructureCommitResult> {
  const preparation = await client.prepareMiniProjectRestructure(proposalId, {
    expectedUpdatedAt,
    confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE",
    traceId: `${traceId}:prepare`,
  });
  if (preparation.status === "STALE") return { status: "STALE", proposalId };
  if (preparation.status === "COMPLETED") return { status: "COMPLETED", semanticCommitId: preparation.semanticCommitId, proposalId: preparation.proposalId, replayed: true };
  if (preparation.status === "FAILED_COMPENSATED") return { status: "FAILED_COMPENSATED", semanticCommitId: preparation.semanticCommitId, proposalId: preparation.proposalId, replayed: true };
  if (preparation.status === "RECOVERY_REQUIRED") return recover(client, host, preparation, preparation.failedStepIndex, "DESKTOP_DISCONNECTED", traceId);
  for (const [stepIndex, step] of preparation.plan.steps.entries()) {
    const verifyInput = { semanticCommitId: preparation.semanticCommitId, expectedUpdatedAt: preparation.expectedUpdatedAt, traceId: `${traceId}:step:${stepIndex}` };
    let verification: ServiceMiniProjectRestructureStepVerification;
    try {
      verification = await client.verifyMiniProjectRestructureStep(proposalId, stepIndex, verifyInput);
    } catch {
      return recover(client, host, preparation, stepIndex, "DESKTOP_DISCONNECTED", traceId);
    }
    const alreadyCompleted = completed(verification);
    if (alreadyCompleted) return alreadyCompleted;
    if (verification.status === "RECOVERY_REQUIRED") return recover(client, host, preparation, verification.stepIndex, "GRAPH_VERIFY_FAILED", traceId);
    if (verification.status === "VERIFIED") continue;
    try {
      await applyStep(host, step);
    } catch {
      return recover(client, host, preparation, stepIndex, "GRAPH_WRITE_FAILED", traceId);
    }
    try {
      verification = await client.verifyMiniProjectRestructureStep(proposalId, stepIndex, { ...verifyInput, traceId: `${verifyInput.traceId}:after` });
    } catch {
      return recover(client, host, preparation, stepIndex, "GRAPH_VERIFY_FAILED", traceId);
    }
    const justCompleted = completed(verification);
    if (justCompleted) return justCompleted;
    if (verification.status === "VERIFIED") continue;
    return recover(client, host, preparation, verification.status === "RECOVERY_REQUIRED" ? verification.stepIndex : stepIndex, "GRAPH_VERIFY_FAILED", traceId);
  }
  throw restructureError("V2_MINI_PROJECT_RESTRUCTURE_COMMIT_PROTOCOL_INVALID", "所有结构 step 已核验，但 Service 没有返回 Commit 完成状态。");
}
