import {
  renderV2ProposalFiles,
  reviewV2ProposalGroups,
  validateV2Proposal,
  type V2Proposal,
  type V2ProposalFiles,
  type V2ProposalGroupDecision,
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

function proposalApplicationError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-094", "D-185"] });
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
}
