import { StructuredError } from "@task-copilot/shared";

export type V2CandidateKind = "WORK_ITEM" | "UPDATE" | "DECISION" | "OUTPUT" | "OWNERSHIP" | "CONFLICT";
export type V2CandidateDisposition = "PENDING" | "LATER" | "DISMISSED" | "NO_MORE_LIKE_THIS" | "RESOLVED";

export interface V2Candidate {
  candidateId: string;
  sourceAnchorId: string;
  sourceVersion: string;
  candidateKind: V2CandidateKind;
  reason: string;
  suggestion: string;
  disposition: V2CandidateDisposition;
  dispositionReason?: string;
  deferredUntil?: string;
  activeProposalId?: string;
  lastAnalyzedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateV2CandidateInput {
  candidateId: string;
  sourceAnchorId: string;
  sourceVersion: string;
  candidateKind: V2CandidateKind;
  reason: string;
  suggestion: string;
}

function candidateError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-017", "D-167", "D-171", "D-177"] });
}

function required(value: string, code: string, label: string, maximum = 2_048): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw candidateError(code, `${label}不能为空且不得超过 ${maximum} 字符。`);
  return normalized;
}

export function createV2Candidate(input: CreateV2CandidateInput, at = new Date()): V2Candidate {
  const kinds = new Set<V2CandidateKind>(["WORK_ITEM", "UPDATE", "DECISION", "OUTPUT", "OWNERSHIP", "CONFLICT"]);
  if (!kinds.has(input.candidateKind)) throw candidateError("V2_CANDIDATE_KIND_INVALID", "Candidate kind 不在封闭集合中。");
  const timestamp = at.toISOString();
  return {
    candidateId: required(input.candidateId, "V2_CANDIDATE_ID_INVALID", "candidate_id", 128),
    sourceAnchorId: required(input.sourceAnchorId, "V2_CANDIDATE_SOURCE_INVALID", "source_anchor_id", 512),
    sourceVersion: required(input.sourceVersion, "V2_CANDIDATE_SOURCE_INVALID", "source_version", 256),
    candidateKind: input.candidateKind,
    reason: required(input.reason, "V2_CANDIDATE_REASON_REQUIRED", "Candidate reason"),
    suggestion: required(input.suggestion, "V2_CANDIDATE_SUGGESTION_REQUIRED", "Candidate suggestion"),
    disposition: "PENDING",
    lastAnalyzedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function setV2CandidateDisposition(
  candidate: V2Candidate,
  disposition: Exclude<V2CandidateDisposition, "PENDING">,
  input: { reason?: string; deferredUntil?: string; activeProposalId?: string },
  at = new Date(),
): V2Candidate {
  if (candidate.disposition === "RESOLVED" && disposition !== "RESOLVED") throw candidateError("V2_CANDIDATE_ALREADY_RESOLVED", "已解决 Candidate 不能重新处置；来源变化后应重新分析。");
  if (candidate.activeProposalId && disposition !== "RESOLVED") throw candidateError("V2_CANDIDATE_PROPOSAL_ACTIVE", "Candidate 已有当前 Proposal；请审阅或拒绝该 Proposal，不能同时关闭或暂缓 Candidate。");
  const reason = input.reason?.trim();
  if (disposition === "LATER") {
    if (!reason || !input.deferredUntil || !Number.isFinite(Date.parse(input.deferredUntil)) || Date.parse(input.deferredUntil) <= at.getTime()) {
      throw candidateError("V2_CANDIDATE_DEFERRAL_INVALID", "暂不处理必须包含未来复查时间和原因。");
    }
  }
  if (["DISMISSED", "NO_MORE_LIKE_THIS"].includes(disposition) && !reason) throw candidateError("V2_CANDIDATE_DISPOSITION_REASON_REQUIRED", "关闭 Candidate 必须说明原因。");
  if (disposition === "RESOLVED" && !input.activeProposalId?.trim()) throw candidateError("V2_CANDIDATE_PROPOSAL_REQUIRED", "Candidate 解决必须引用已生效 Proposal。");
  return {
    ...candidate,
    disposition,
    ...(reason ? { dispositionReason: reason } : {}),
    ...(disposition === "LATER" ? { deferredUntil: new Date(input.deferredUntil!).toISOString() } : {}),
    ...(input.activeProposalId?.trim() ? { activeProposalId: input.activeProposalId.trim() } : {}),
    updatedAt: at.toISOString(),
  };
}

export function linkV2CandidateProposal(candidate: V2Candidate, proposalId: string, at = new Date()): V2Candidate {
  if (candidate.disposition !== "PENDING" && candidate.disposition !== "LATER") throw candidateError("V2_CANDIDATE_NOT_ACTIONABLE", "只有待整理或暂缓 Candidate 可以生成 Proposal。");
  const activeProposalId = required(proposalId, "V2_CANDIDATE_PROPOSAL_REQUIRED", "proposal_id", 128);
  if (candidate.activeProposalId && candidate.activeProposalId !== activeProposalId) throw candidateError("V2_CANDIDATE_PROPOSAL_EXISTS", "Candidate 已有当前 Proposal；必须修订该 Proposal，不能创建平行副本。");
  return { ...candidate, disposition: "PENDING", activeProposalId, updatedAt: at.toISOString() };
}

export function reopenV2CandidateAfterUndo(candidate: V2Candidate, proposalId: string, at = new Date()): V2Candidate {
  if (candidate.disposition !== "RESOLVED" || candidate.activeProposalId !== proposalId) throw candidateError("V2_CANDIDATE_UNDO_MISMATCH", "只有由该 Proposal 解决的 Candidate 可以在 Undo 后重新进入审阅。");
  return {
    candidateId: candidate.candidateId,
    sourceAnchorId: candidate.sourceAnchorId,
    sourceVersion: candidate.sourceVersion,
    candidateKind: candidate.candidateKind,
    reason: candidate.reason,
    suggestion: candidate.suggestion,
    disposition: "PENDING",
    lastAnalyzedAt: candidate.lastAnalyzedAt,
    createdAt: candidate.createdAt,
    updatedAt: at.toISOString(),
  };
}
