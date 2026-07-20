import {
  renderV2ProposalFiles,
  revalidateAcceptedV2Proposal,
  reviewV2ProposalGroups,
  validateV2Proposal,
  type V2Proposal,
  type V2ProposalFiles,
  type V2ProposalGroupDecision,
  type V2ProposalRevalidationResult,
  type V2ProposalScopeObservation,
} from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export interface V2StoredProposalRecord {
  proposal: V2Proposal;
  files: V2ProposalFiles;
  updatedAt: string;
}
export interface V2ProposalRepository {
  submitProposal(proposal: V2Proposal, files: V2ProposalFiles, at?: Date): { proposal: V2Proposal; replayed: boolean } | Promise<{ proposal: V2Proposal; replayed: boolean }>;
  storedProposal(proposalId: string): V2StoredProposalRecord | undefined | Promise<V2StoredProposalRecord | undefined>;
  listStoredProposals(): V2StoredProposalRecord[] | Promise<V2StoredProposalRecord[]>;
  updateStoredProposal(proposal: V2Proposal, files: V2ProposalFiles, expectedUpdatedAt: string, at?: Date): V2StoredProposalRecord | Promise<V2StoredProposalRecord>;
}

export interface V2FormalizationPlan {
  proposalId: string;
  groupId: string;
  patch: V2Proposal["groups"][number]["textPatches"][number];
  create: {
    operationId: string;
    objectType: "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT";
    text: string;
    blockUuid: string;
  };
}

function proposalApplicationError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-094", "D-185"] });
}

export function planAcceptedV2Formalization(proposal: V2Proposal): V2FormalizationPlan {
  validateV2Proposal(proposal);
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (!["ACCEPTED", "PARTIALLY_ACCEPTED", "APPLIED"].includes(proposal.status) || accepted.length !== 1) {
    throw proposalApplicationError("V2_PROPOSAL_COMMIT_SHAPE_UNSUPPORTED", "当前纵向闭环只支持一个已接受的正式化语义组。");
  }
  const group = accepted[0]!;
  const unsupported = group.semanticOperations.find((operation) => operation.kind !== "CREATE_OBJECT" && operation.kind !== "REWRITE_BLOCK");
  const creates = group.semanticOperations.filter((operation) => operation.kind === "CREATE_OBJECT");
  if (unsupported || group.textPatches.length !== 1 || creates.length !== 1) {
    throw proposalApplicationError("V2_PROPOSAL_COMMIT_OPERATION_UNSUPPORTED", "当前 Proposal Commit 尚不支持该语义操作组；没有写入 Graph 或 SQLite。");
  }
  const patch = group.textPatches[0]!;
  const create = creates[0]!;
  const objectType = create.payload.objectType;
  if (create.target.kind !== "BLOCK" || create.target.id !== patch.blockUuid || !["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"].includes(String(objectType))) {
    throw proposalApplicationError("V2_PROPOSAL_COMMIT_OPERATION_INVALID", "正式化必须将同一 Block Patch 与一个受支持对象创建绑定。");
  }
  const text = typeof create.payload.text === "string" ? create.payload.text.trim() : "";
  if (!text) throw proposalApplicationError("V2_PROPOSAL_COMMIT_OPERATION_INVALID", "正式化对象正文不能为空。");
  return {
    proposalId: proposal.proposalId,
    groupId: group.groupId,
    patch,
    create: { operationId: create.operationId, objectType: objectType as V2FormalizationPlan["create"]["objectType"], text, blockUuid: patch.blockUuid },
  };
}

export class V2ProposalApplication {
  constructor(private readonly repository: V2ProposalRepository) {}

  async submit(value: unknown, at = new Date()): Promise<{ record: V2StoredProposalRecord; replayed: boolean }> {
    const proposal = validateV2Proposal(value);
    if (proposal.status !== "READY") throw proposalApplicationError("V2_PROPOSAL_NOT_READY", "只有 READY Proposal 可以进入审阅队列。");
    const files = renderV2ProposalFiles(proposal);
    const result = await this.repository.submitProposal(proposal, files, at);
    const record = await this.repository.storedProposal(proposal.proposalId);
    if (!record) throw proposalApplicationError("V2_PROPOSAL_PERSISTENCE_FAILED", "Proposal 提交后未能读回。");
    return { record, replayed: result.replayed };
  }

  async get(proposalId: string): Promise<V2StoredProposalRecord | undefined> {
    return this.repository.storedProposal(proposalId);
  }

  async list(): Promise<V2StoredProposalRecord[]> {
    return this.repository.listStoredProposals();
  }

  async review(
    proposalId: string,
    decisions: Readonly<Record<string, V2ProposalGroupDecision>>,
    expectedUpdatedAt: string,
    at = new Date(),
  ): Promise<V2StoredProposalRecord> {
    const current = await this.repository.storedProposal(proposalId);
    if (!current) throw proposalApplicationError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
    if (current.updatedAt !== expectedUpdatedAt) throw proposalApplicationError("V2_PROPOSAL_REVIEW_STALE", "Proposal 已在其他审阅操作后变化；请刷新后重试。");
    const proposal = reviewV2ProposalGroups(current.proposal, decisions);
    return this.repository.updateStoredProposal(proposal, renderV2ProposalFiles(proposal), expectedUpdatedAt, at);
  }

  async revalidate(
    proposalId: string,
    observations: readonly V2ProposalScopeObservation[],
    expectedUpdatedAt: string,
    at = new Date(),
  ): Promise<{ record: V2StoredProposalRecord; result: V2ProposalRevalidationResult }> {
    const current = await this.repository.storedProposal(proposalId);
    if (!current) throw proposalApplicationError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
    if (current.updatedAt !== expectedUpdatedAt) throw proposalApplicationError("V2_PROPOSAL_REVALIDATION_STALE", "Proposal 已在重验前变化；本次没有写入。");
    const result = revalidateAcceptedV2Proposal(current.proposal, observations);
    if (result.status === "VALID") return { record: current, result };
    const stale = { ...current.proposal, status: "STALE" as const };
    const record = await this.repository.updateStoredProposal(stale, renderV2ProposalFiles(stale), expectedUpdatedAt, at);
    return { record, result };
  }

  async markApplied(proposalId: string, expectedUpdatedAt: string, at = new Date()): Promise<V2StoredProposalRecord> {
    const current = await this.repository.storedProposal(proposalId);
    if (!current) throw proposalApplicationError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
    if (current.updatedAt !== expectedUpdatedAt) throw proposalApplicationError("V2_PROPOSAL_COMMIT_STALE", "Proposal 在 Commit 期间已变化。");
    if (current.proposal.status === "APPLIED") return current;
    if (current.proposal.status !== "ACCEPTED" && current.proposal.status !== "PARTIALLY_ACCEPTED") throw proposalApplicationError("V2_PROPOSAL_NOT_ACCEPTED", "Proposal 当前状态不能标记为已生效。");
    const applied = { ...current.proposal, status: "APPLIED" as const };
    return this.repository.updateStoredProposal(applied, renderV2ProposalFiles(applied), expectedUpdatedAt, at);
  }

  async markFailed(proposalId: string, expectedUpdatedAt: string, at = new Date()): Promise<V2StoredProposalRecord> {
    const current = await this.repository.storedProposal(proposalId);
    if (!current) throw proposalApplicationError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
    if (current.updatedAt !== expectedUpdatedAt) throw proposalApplicationError("V2_PROPOSAL_COMMIT_STALE", "Proposal 在补偿期间已变化。");
    if (current.proposal.status === "FAILED") return current;
    const failed = { ...current.proposal, status: "FAILED" as const };
    return this.repository.updateStoredProposal(failed, renderV2ProposalFiles(failed), expectedUpdatedAt, at);
  }
}
