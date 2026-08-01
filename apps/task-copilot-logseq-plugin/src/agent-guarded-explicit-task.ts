import { revalidateAgentExecution, type AgentDecision, type AgentExecutionRevalidationInput, type AgentGovernanceRuntimeMode } from "@task-copilot/domain";
import type { ServiceStoredProposal } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { applyLowRiskV2Proposal, lowRiskApplyEligibility } from "./v2-low-risk-apply.ts";
import { undoV2Formalization } from "./v2-proposal-commit.ts";

type GuardedApplyClient = Parameters<typeof applyLowRiskV2Proposal>[0];
type GuardedApplyHost = Parameters<typeof applyLowRiskV2Proposal>[1];
type GuardedUndoClient = Parameters<typeof undoV2Formalization>[0];
type GuardedUndoHost = Parameters<typeof undoV2Formalization>[1];

export interface AgentGuardedFormalChain {
  apply: typeof applyLowRiskV2Proposal;
  undo: typeof undoV2Formalization;
}

const existingFormalChain: AgentGuardedFormalChain = {
  apply: applyLowRiskV2Proposal,
  undo: undoV2Formalization,
};

export interface GuardedExplicitTaskInput {
  runtimeMode: AgentGovernanceRuntimeMode;
  guardedAutomationEnabled: boolean;
  shadowEvidenceGateSatisfied: boolean;
  explicitUserAuthorization: boolean;
  decision: AgentDecision;
  proposal: ServiceStoredProposal;
  revalidation: AgentExecutionRevalidationInput;
  client: GuardedApplyClient;
  host: GuardedApplyHost;
}

export type GuardedExplicitTaskResult =
  | { status: "DISABLED"; decisionId: string; reasons: string[] }
  | { status: "STALE" | "BLOCKED" | "NO_OP"; decisionId: string; reasons: string[] }
  | { status: "FAILED_COMPENSATED"; decisionId: string; semanticCommitId?: string; undoAvailable: false }
  | { status: "COMPLETED"; decisionId: string; semanticCommitId: string; objectId?: string; undoAvailable: true };

function guardedError(message: string): Error {
  return new Error(`Guarded explicit Task: ${message}`);
}

export function guardedExplicitTaskProposalId(decision: Pick<AgentDecision, "decisionId" | "revision" | "sourceSnapshotHash">): string {
  return `proposal_agent_${checksum({ decisionId: decision.decisionId, revision: decision.revision, sourceSnapshotHash: decision.sourceSnapshotHash }).slice(0, 32)}`;
}

function activationReasons(input: GuardedExplicitTaskInput): string[] {
  const reasons: string[] = [];
  if (input.runtimeMode !== "GUARDED") reasons.push("EXPERIMENT_MODE");
  if (!input.guardedAutomationEnabled) reasons.push("GUARDED_AUTOMATION_DISABLED");
  if (!input.shadowEvidenceGateSatisfied) reasons.push("SHADOW_EVIDENCE_GATE_NOT_SATISFIED");
  if (!input.explicitUserAuthorization) reasons.push("EXPLICIT_USER_AUTHORIZATION_MISSING");
  return reasons;
}

function assertExactExplicitTaskProposal(decision: AgentDecision, record: ServiceStoredProposal): void {
  if (decision.sourceRoot.kind !== "BLOCK"
    || decision.rule.id !== "EXPLICIT-TASK-01"
    || decision.outcome !== "CREATE_OBJECT"
    || decision.riskRoute !== "AUTO_APPLY"
    || decision.executionStatus !== "NOT_EXECUTED"
    || decision.targetObjectId !== undefined
    || decision.counterSignals.length > 0
    || decision.context.truncated
    || decision.context.omittedSections.length > 0) {
    throw guardedError("Decision 不是可自动执行的明确单 Task，或存在反向信号/截断上下文。");
  }
  const proposal = record.proposal;
  if (proposal.proposalId !== guardedExplicitTaskProposalId(decision)
    || proposal.source.kind !== "local_llm"
    || proposal.source.provider !== "internal-agent-governance"
    || proposal.source.skillVersion !== decision.rule.skillVersion
    || !proposal.context.includes(`Agent Decision ${decision.decisionId} revision ${decision.revision}`)) {
    throw guardedError("Proposal 与 Decision Revision、内部 Skill 或确定性身份不匹配。");
  }
  const eligibility = lowRiskApplyEligibility(record);
  if (!eligibility.eligible) throw guardedError(`Proposal 不符合现有 LOW-risk Commit 白名单：${eligibility.reason}`);
  const group = proposal.groups[0]!;
  const patch = group.textPatches[0]!;
  const operation = group.semanticOperations[0]!;
  if (patch.blockUuid !== decision.sourceRoot.externalId
    || patch.beforeText !== patch.afterText
    || patch.beforeHash !== patch.afterHash) {
    throw guardedError("Proposal 必须保持来源正文不变，且只能绑定 Decision 的 Source Root。");
  }
  if (operation.kind !== "CREATE_OBJECT"
    || operation.target.kind !== "BLOCK"
    || operation.target.id !== decision.sourceRoot.externalId
    || operation.payload.objectType !== "TASK"
    || typeof operation.payload.text !== "string"
    || !operation.payload.text.trim()) {
    throw guardedError("Proposal 只能通过现有 CREATE_OBJECT 语义操作创建一个非空 Task。");
  }
}

export async function executeGuardedExplicitTask(
  input: GuardedExplicitTaskInput,
  chain: AgentGuardedFormalChain = existingFormalChain,
): Promise<GuardedExplicitTaskResult> {
  const disabled = activationReasons(input);
  if (disabled.length > 0) return { status: "DISABLED", decisionId: input.decision.decisionId, reasons: disabled };

  const revalidation = revalidateAgentExecution(input.revalidation);
  if (revalidation.status !== "READY") return { status: revalidation.status, decisionId: input.decision.decisionId, reasons: revalidation.reasons };
  assertExactExplicitTaskProposal(input.decision, input.proposal);
  const applied = await chain.apply(input.client, input.host, input.proposal, `agent-guarded:${input.decision.decisionId}:${input.decision.revision}`);
  if (applied.status === "STALE") return { status: "STALE", decisionId: input.decision.decisionId, reasons: ["PROPOSAL_REVALIDATION_STALE"] };
  if (applied.status === "FAILED_COMPENSATED") return { status: "FAILED_COMPENSATED", decisionId: input.decision.decisionId, ...(applied.semanticCommitId ? { semanticCommitId: applied.semanticCommitId } : {}), undoAvailable: false };
  if (!applied.semanticCommitId) throw guardedError("现有 Semantic Commit 链未返回可追溯 Commit ID，不得报告成功。");
  return {
    status: "COMPLETED",
    decisionId: input.decision.decisionId,
    semanticCommitId: applied.semanticCommitId,
    ...(applied.objectId ? { objectId: applied.objectId } : {}),
    undoAvailable: true,
  };
}

export async function undoGuardedExplicitTask(
  input: { decisionId: string; semanticCommitId: string; client: GuardedUndoClient; host: GuardedUndoHost },
  chain: AgentGuardedFormalChain = existingFormalChain,
): Promise<{
  status: "COMPLETED" | "FAILED_COMPENSATED";
  decisionId: string;
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  objectId?: string;
}> {
  const decisionId = input.decisionId.trim();
  const semanticCommitId = input.semanticCommitId.trim();
  if (!decisionId || decisionId.length > 256 || !semanticCommitId.startsWith("proposal-commit:") || semanticCommitId.length > 128) {
    throw guardedError("Undo 必须引用已完成的受控 Decision 与 Proposal Semantic Commit。");
  }
  const undone = await chain.undo(input.client, input.host, semanticCommitId, `agent-guarded-undo:${decisionId}`);
  return {
    status: undone.status,
    decisionId,
    originalSemanticCommitId: semanticCommitId,
    undoSemanticCommitId: undone.undoSemanticCommitId,
    ...(undone.objectId ? { objectId: undone.objectId } : {}),
  };
}
