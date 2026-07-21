import { createV2Candidate, linkV2CandidateProposal, renderV2ProposalFiles, reopenV2CandidateAfterUndo, setV2CandidateDisposition, validateV2ProposalForSubmission, type CreateV2CandidateInput, type V2Candidate, type V2CandidateDisposition, type V2Proposal, type V2ProposalFiles } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export interface V2CandidateRepository {
  upsertCandidate(candidate: V2Candidate, idempotencyKey: string): { candidate: V2Candidate; replayed: boolean } | Promise<{ candidate: V2Candidate; replayed: boolean }>;
  getCandidate(candidateId: string): V2Candidate | undefined | Promise<V2Candidate | undefined>;
  listCandidates(): V2Candidate[] | Promise<V2Candidate[]>;
  updateCandidate(candidate: V2Candidate, expectedUpdatedAt: string, idempotencyKey: string): { candidate: V2Candidate; replayed: boolean } | Promise<{ candidate: V2Candidate; replayed: boolean }>;
  submitCandidateProposal(candidate: V2Candidate, proposal: V2Proposal, files: V2ProposalFiles, expectedUpdatedAt: string, idempotencyKey: string): { candidate: V2Candidate; proposal: V2Proposal; replayed: boolean } | Promise<{ candidate: V2Candidate; proposal: V2Proposal; replayed: boolean }>;
}

export interface V2CandidateCommandEnvelope {
  actor: string;
  traceId: string;
  idempotencyKey: string;
}

function requireEnvelope(value: V2CandidateCommandEnvelope): void {
  if (!value.actor.trim() || !value.traceId.trim() || !value.idempotencyKey.trim()) throw new StructuredError({ code: "V2_CANDIDATE_COMMAND_INVALID", message: "Candidate command 缺少 actor、trace_id 或 idempotency key。", ruleRefs: ["D-017", "D-167"] });
}

export class V2CandidateApplication {
  constructor(private readonly repository: V2CandidateRepository) {}

  async discover(input: CreateV2CandidateInput, envelope: V2CandidateCommandEnvelope, at = new Date()): Promise<{ candidate: V2Candidate; replayed: boolean }> {
    requireEnvelope(envelope);
    return this.repository.upsertCandidate(createV2Candidate(input, at), envelope.idempotencyKey);
  }

  get(candidateId: string): Promise<V2Candidate | undefined> {
    return Promise.resolve(this.repository.getCandidate(candidateId));
  }

  list(): Promise<V2Candidate[]> {
    return Promise.resolve(this.repository.listCandidates());
  }

  async setDisposition(candidateId: string, disposition: Exclude<V2CandidateDisposition, "PENDING" | "RESOLVED">, input: { reason: string; deferredUntil?: string }, expectedUpdatedAt: string, envelope: V2CandidateCommandEnvelope, at = new Date()): Promise<{ candidate: V2Candidate; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireCandidate(candidateId);
    return this.repository.updateCandidate(setV2CandidateDisposition(current, disposition, input, at), expectedUpdatedAt, envelope.idempotencyKey);
  }

  async linkProposal(candidateId: string, proposalId: string, expectedUpdatedAt: string, envelope: V2CandidateCommandEnvelope, at = new Date()): Promise<{ candidate: V2Candidate; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireCandidate(candidateId);
    return this.repository.updateCandidate(linkV2CandidateProposal(current, proposalId, at), expectedUpdatedAt, envelope.idempotencyKey);
  }

  async formalize(candidateId: string, proposalValue: unknown, expectedUpdatedAt: string, envelope: V2CandidateCommandEnvelope, at = new Date()): Promise<{ candidate: V2Candidate; proposal: V2Proposal; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireCandidate(candidateId);
    const proposal = validateV2ProposalForSubmission(proposalValue);
    const linked = linkV2CandidateProposal(current, proposal.proposalId, at);
    return this.repository.submitCandidateProposal(linked, proposal, renderV2ProposalFiles(proposal), expectedUpdatedAt, envelope.idempotencyKey);
  }

  async resolve(candidateId: string, proposalId: string, expectedUpdatedAt: string, envelope: V2CandidateCommandEnvelope, at = new Date()): Promise<{ candidate: V2Candidate; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireCandidate(candidateId);
    if (current.activeProposalId !== proposalId) throw new StructuredError({ code: "V2_CANDIDATE_PROPOSAL_MISMATCH", message: "Candidate 当前 Proposal 与已生效 Proposal 不一致。", ruleRefs: ["D-017", "D-170"] });
    return this.repository.updateCandidate(setV2CandidateDisposition(current, "RESOLVED", { activeProposalId: proposalId }, at), expectedUpdatedAt, envelope.idempotencyKey);
  }

  async reopenAfterUndo(candidateId: string, proposalId: string, expectedUpdatedAt: string, envelope: V2CandidateCommandEnvelope, at = new Date()): Promise<{ candidate: V2Candidate; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireCandidate(candidateId);
    return this.repository.updateCandidate(reopenV2CandidateAfterUndo(current, proposalId, at), expectedUpdatedAt, envelope.idempotencyKey);
  }

  private async requireCandidate(candidateId: string): Promise<V2Candidate> {
    const candidate = await this.repository.getCandidate(candidateId);
    if (!candidate) throw new StructuredError({ code: "V2_CANDIDATE_NOT_FOUND", message: "Candidate 不存在。", ruleRefs: ["D-017"] });
    return candidate;
  }
}
