import {
  renderV2ProposalFiles,
  revalidateAcceptedV2Proposal,
  reviewV2ProposalGroups,
  validateV2Proposal,
  validateV2ProposalForSubmission,
  type V2Proposal,
  type V2ProposalFiles,
  type V2ProposalGroupDecision,
  type V2ProposalRevalidationResult,
  type V2ProposalScopeObservation,
  type V2MiniProjectClosure,
  type V2ProjectClosure,
  validateV2ProjectClosure,
  validateV2MiniProjectClosure,
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

export interface V2ObjectUpdatePlan {
  proposalId: string;
  groupId: string;
  patch: V2Proposal["groups"][number]["textPatches"][number];
  update: {
    operationId: string;
    objectId: string;
    expectedVersion: number;
    objectType: "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT";
    beforeText: string;
    text: string;
    blockUuid: string;
  };
}

export type V2ProposalCommitPlan = V2FormalizationPlan | V2ObjectUpdatePlan;

export interface V2ProjectClosurePlan {
  proposalId: string;
  groupId: string;
  objectId: string;
  expectedVersion: number;
  closure: V2ProjectClosure;
}

interface V2LifecycleTransitionPlanBase {
  proposalId: string;
  groupId: string;
  objectId: string;
  expectedVersion: number;
  lifecycle: "COMPLETED";
  objectType: "MINI_PROJECT";
  closure: V2MiniProjectClosure;
}

export type V2LifecycleTransitionPlan = V2LifecycleTransitionPlanBase & ({
  evidenceKind: "MARKER";
  text: string;
  marker: "DONE";
  externalId: string;
  contentHash: string;
} | { evidenceKind: "OBJECT_ONLY" });

export interface V2OwnershipChangePlan {
  proposalId: string; groupId: string; childObjectId: string; ownerObjectId: string; expectedVersion: number; expectedOwnerVersion: number; expectedCurrentOwnerId?: string;
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
  const explicitText = typeof create.payload.text === "string" ? create.payload.text.trim() : "";
  const text = explicitText || (proposal.status === "APPLIED" ? patch.beforeText.trim() : "");
  if (!text) throw proposalApplicationError("V2_PROPOSAL_COMMIT_OPERATION_INVALID", "正式化对象正文不能为空。");
  return {
    proposalId: proposal.proposalId,
    groupId: group.groupId,
    patch,
    create: { operationId: create.operationId, objectType: objectType as V2FormalizationPlan["create"]["objectType"], text, blockUuid: patch.blockUuid },
  };
}

export function planAcceptedV2ObjectUpdate(proposal: V2Proposal): V2ObjectUpdatePlan {
  validateV2Proposal(proposal);
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (!["ACCEPTED", "PARTIALLY_ACCEPTED", "APPLIED"].includes(proposal.status) || accepted.length !== 1) {
    throw proposalApplicationError("V2_OBJECT_UPDATE_COMMIT_SHAPE_UNSUPPORTED", "更新已有对象只支持一个已接受的语义组。");
  }
  const group = accepted[0]!;
  const rewrites = group.semanticOperations.filter((operation) => operation.kind === "REWRITE_BLOCK");
  if (group.textPatches.length !== 1 || group.semanticOperations.length !== 1 || rewrites.length !== 1) {
    throw proposalApplicationError("V2_OBJECT_UPDATE_COMMIT_OPERATION_UNSUPPORTED", "更新已有对象必须只包含一个正文 Patch 和一个 REWRITE_BLOCK 操作。");
  }
  const patch = group.textPatches[0]!;
  const rewrite = rewrites[0]!;
  const objectId = typeof rewrite.payload.objectId === "string" ? rewrite.payload.objectId : "";
  const objectType = rewrite.payload.objectType;
  const beforeText = typeof rewrite.payload.beforeText === "string" ? rewrite.payload.beforeText.trim() : "";
  const text = typeof rewrite.payload.text === "string" ? rewrite.payload.text.trim() : "";
  const objectTargets = proposal.scope.modify.filter((target) => target.kind === "OBJECT" && target.id === objectId && target.version !== undefined);
  if (rewrite.target.kind !== "BLOCK" || rewrite.target.id !== patch.blockUuid || objectTargets.length !== 1 || !objectId || !beforeText || !text) {
    throw proposalApplicationError("V2_OBJECT_UPDATE_COMMIT_TARGET_INVALID", "更新已有对象必须绑定同一 Block、唯一带版本对象和明确最终正文。");
  }
  if (!["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"].includes(String(objectType))) {
    throw proposalApplicationError("V2_OBJECT_UPDATE_COMMIT_TYPE_INVALID", "更新已有对象的对象类型不受 Block 工作流支持。");
  }
  return {
    proposalId: proposal.proposalId,
    groupId: group.groupId,
    patch,
    update: {
      operationId: rewrite.operationId,
      objectId,
      expectedVersion: objectTargets[0]!.version!,
      objectType: objectType as V2ObjectUpdatePlan["update"]["objectType"],
      beforeText,
      text,
      blockUuid: patch.blockUuid,
    },
  };
}

export function planAcceptedV2ProposalCommit(proposal: V2Proposal): V2ProposalCommitPlan {
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (accepted.length === 1 && accepted[0]!.semanticOperations.some((operation) => operation.kind === "CREATE_OBJECT")) {
    return planAcceptedV2Formalization(proposal);
  }
  return planAcceptedV2ObjectUpdate(proposal);
}

export function planAcceptedV2ProjectClosure(proposal: V2Proposal): V2ProjectClosurePlan {
  validateV2Proposal(proposal);
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (!["ACCEPTED", "PARTIALLY_ACCEPTED", "APPLIED"].includes(proposal.status) || accepted.length !== 1) throw proposalApplicationError("V2_PROJECT_CLOSURE_COMMIT_SHAPE_INVALID", "Project Closure 必须是唯一已接受的高影响语义组。");
  const group = accepted[0]!;
  const updates = group.semanticOperations.filter((operation) => operation.kind === "UPDATE_PROJECT_INTERFACE");
  const transitions = group.semanticOperations.filter((operation) => operation.kind === "TRANSITION_LIFECYCLE");
  if (group.risk !== "HIGH" || group.textPatches.length !== 0 || group.semanticOperations.length !== 2 || updates.length !== 1 || transitions.length !== 1) {
    throw proposalApplicationError("V2_PROJECT_CLOSURE_COMMIT_OPERATION_INVALID", "Project Closure 必须以一个 HIGH 组同时确认 Closure 和 COMPLETED Lifecycle。");
  }
  const update = updates[0]!;
  const transition = transitions[0]!;
  if (update.target.kind !== "OBJECT" || transition.target.kind !== "OBJECT" || update.target.id !== transition.target.id || update.target.version === undefined || transition.target.version !== update.target.version || transition.payload.lifecycle !== "COMPLETED") {
    throw proposalApplicationError("V2_PROJECT_CLOSURE_COMMIT_TARGET_INVALID", "Project Closure 必须指向同一个带版本的 Project 并转为 COMPLETED。");
  }
  const closure = update.payload.closure;
  if (!closure || typeof closure !== "object" || Array.isArray(closure)) throw proposalApplicationError("V2_PROJECT_CLOSURE_PAYLOAD_INVALID", "Project Closure payload 缺失。");
  return { proposalId: proposal.proposalId, groupId: group.groupId, objectId: update.target.id, expectedVersion: update.target.version, closure: validateV2ProjectClosure(closure as unknown as V2ProjectClosure) };
}

export function planAcceptedV2LifecycleTransition(proposal: V2Proposal): V2LifecycleTransitionPlan {
  validateV2Proposal(proposal);
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (!["ACCEPTED", "PARTIALLY_ACCEPTED", "APPLIED"].includes(proposal.status) || accepted.length !== 1) throw proposalApplicationError("V2_LIFECYCLE_COMMIT_SHAPE_INVALID", "MiniProject Lifecycle 变更必须是唯一已接受语义组。");
  const group = accepted[0]!;
  if (proposal.groups.some((candidate) => candidate.groupId !== group.groupId && candidate.disposition !== "REJECTED")) {
    throw proposalApplicationError("V2_LIFECYCLE_COMMIT_OTHER_GROUPS_UNRESOLVED", "完成 MiniProject 前必须拒绝其余未提交语义组，避免 Closure Commit 冻结独立工作。");
  }
  const transitions = group.semanticOperations.filter((operation) => operation.kind === "TRANSITION_LIFECYCLE");
  if (group.risk !== "HIGH" || group.textPatches.length !== 0 || group.semanticOperations.length !== 1 || transitions.length !== 1) throw proposalApplicationError("V2_LIFECYCLE_COMMIT_OPERATION_INVALID", "MiniProject 完成必须是独立 HIGH 组的单一 Lifecycle 变更。");
  const operation = transitions[0]!;
  const payload = operation.payload;
  const objectTarget = proposal.scope.modify.filter((target) => target.kind === "OBJECT" && target.id === operation.target.id && target.version !== undefined);
  let closure: V2MiniProjectClosure;
  try { closure = validateV2MiniProjectClosure(payload.closure as unknown as V2MiniProjectClosure); }
  catch { throw proposalApplicationError("V2_LIFECYCLE_COMMIT_CLOSURE_INVALID", "MiniProject Lifecycle Proposal 必须包含已确认的原目标、实际结果和遗留三问。"); }
  if (operation.target.kind !== "OBJECT" || operation.target.version === undefined || objectTarget.length !== 1 || objectTarget[0]!.version !== operation.target.version || payload.lifecycle !== "COMPLETED" || payload.objectType !== "MINI_PROJECT") {
    throw proposalApplicationError("V2_LIFECYCLE_COMMIT_TARGET_INVALID", "MiniProject Lifecycle Proposal 必须指向同一带版本对象。");
  }
  const base: V2LifecycleTransitionPlanBase = {
    proposalId: proposal.proposalId, groupId: group.groupId, objectId: operation.target.id, expectedVersion: operation.target.version,
    lifecycle: "COMPLETED", objectType: "MINI_PROJECT", closure,
  };
  const hasMarkerEvidence = [payload.marker, payload.text, payload.externalId, payload.contentHash].some((value) => value !== undefined);
  if (!hasMarkerEvidence) return { ...base, evidenceKind: "OBJECT_ONLY" };
  const blockEvidence = proposal.scope.read.filter((target) => target.kind === "BLOCK" && target.id === payload.externalId && target.hash === payload.contentHash);
  if (payload.marker !== "DONE" || typeof payload.text !== "string" || !payload.text.trim()
    || typeof payload.externalId !== "string" || !payload.externalId.trim() || payload.externalId.length > 512
    || typeof payload.contentHash !== "string" || !/^[0-9a-f]{8}$/.test(payload.contentHash) || blockEvidence.length !== 1) {
    throw proposalApplicationError("V2_LIFECYCLE_COMMIT_TARGET_INVALID", "Marker 驱动的 MiniProject Lifecycle Proposal 必须绑定 DONE Block 证据。");
  }
  return { ...base, evidenceKind: "MARKER", text: payload.text.trim(), marker: "DONE", externalId: payload.externalId, contentHash: payload.contentHash };
}

export function planAcceptedV2OwnershipChange(proposal: V2Proposal): V2OwnershipChangePlan {
  validateV2Proposal(proposal);
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (!["ACCEPTED", "PARTIALLY_ACCEPTED", "APPLIED"].includes(proposal.status) || accepted.length !== 1) throw proposalApplicationError("V2_OWNERSHIP_COMMIT_SHAPE_INVALID", "Primary Ownership 必须是唯一已接受的高影响语义组。");
  const group = accepted[0]!;
  const operations = group.semanticOperations.filter((operation) => operation.kind === "CHANGE_OWNERSHIP");
  if (group.risk !== "HIGH" || group.textPatches.length !== 0 || group.semanticOperations.length !== 1 || operations.length !== 1) throw proposalApplicationError("V2_OWNERSHIP_COMMIT_OPERATION_INVALID", "Primary Ownership 变更必须由一个独立 HIGH 组表达。");
  const operation = operations[0]!;
  const ownerObjectId = typeof operation.payload.ownerObjectId === "string" ? operation.payload.ownerObjectId : "";
  const expectedCurrentOwnerId = operation.payload.expectedCurrentOwnerId;
  const controlledId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
  const ownerEvidence = proposal.scope.read.filter((target) => target.kind === "OBJECT" && target.id === ownerObjectId && target.version !== undefined);
  if (operation.target.kind !== "OBJECT" || operation.target.version === undefined || !controlledId(ownerObjectId) || ownerEvidence.length !== 1 || (expectedCurrentOwnerId !== undefined && (typeof expectedCurrentOwnerId !== "string" || !controlledId(expectedCurrentOwnerId)))) throw proposalApplicationError("V2_OWNERSHIP_COMMIT_TARGET_INVALID", "Primary Ownership 变更必须指向带版本 child，并在 read scope 中提供唯一带版本新 Owner 与合法当前 Owner 前置。");
  if (operation.target.id === ownerObjectId) throw proposalApplicationError("V2_OWNERSHIP_COMMIT_TARGET_INVALID", "对象不能成为自己的 Primary Owner。");
  if (expectedCurrentOwnerId === ownerObjectId) throw proposalApplicationError("V2_OWNERSHIP_COMMIT_TARGET_INVALID", "新 Primary Owner 与当前 Owner 相同；Proposal 不表达正式变化。");
  return { proposalId: proposal.proposalId, groupId: group.groupId, childObjectId: operation.target.id, ownerObjectId, expectedVersion: operation.target.version, expectedOwnerVersion: ownerEvidence[0]!.version!, ...(typeof expectedCurrentOwnerId === "string" ? { expectedCurrentOwnerId } : {}) };
}

export class V2ProposalApplication {
  constructor(private readonly repository: V2ProposalRepository) {}

  async submit(value: unknown, at = new Date()): Promise<{ record: V2StoredProposalRecord; replayed: boolean }> {
    const proposal = validateV2ProposalForSubmission(value);
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

  async reviseSameMachineIntent(value: unknown, expectedUpdatedAt: string, at = new Date()): Promise<V2StoredProposalRecord> {
    const proposal = validateV2ProposalForSubmission(value);
    const current = await this.repository.storedProposal(proposal.proposalId);
    if (!current) throw proposalApplicationError("V2_PROPOSAL_NOT_FOUND", "待修订 Proposal 不存在。");
    if (current.updatedAt !== expectedUpdatedAt) throw proposalApplicationError("V2_PROPOSAL_REVIEW_STALE", "Proposal 已在修订前变化；没有覆盖当前机器表示。");
    if (["APPLIED", "FAILED", "REJECTED", "SUPERSEDED"].includes(current.proposal.status)) throw proposalApplicationError("V2_PROPOSAL_REVISION_NOT_ALLOWED", "已终结 Proposal 不能原位修订。");
    if (proposal.createdAt !== current.proposal.createdAt) throw proposalApplicationError("V2_PROPOSAL_REVISION_INTENT_MISMATCH", "同一机器意图修订必须保留 Proposal 创建身份。");
    return this.repository.updateStoredProposal(proposal, renderV2ProposalFiles(proposal), expectedUpdatedAt, at);
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
    for (const [groupId, decision] of Object.entries(decisions)) {
      const group = current.proposal.groups.find((candidate) => candidate.groupId === groupId);
      const miniProjectClosure = group?.semanticOperations.find((operation) => operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.objectType === "MINI_PROJECT" && operation.payload.lifecycle === "COMPLETED");
      if (decision.disposition === "ACCEPTED" && miniProjectClosure) throw proposalApplicationError("V2_MINI_PROJECT_CLOSURE_REQUIRED", "MiniProject Completion 必须通过专用三问审阅，不能使用通用接受绕过。");
    }
    const proposal = reviewV2ProposalGroups(current.proposal, decisions);
    return this.repository.updateStoredProposal(proposal, renderV2ProposalFiles(proposal), expectedUpdatedAt, at);
  }

  async reviewMiniProjectClosure(
    proposalId: string,
    groupId: string,
    closureValue: V2MiniProjectClosure,
    expectedUpdatedAt: string,
    at = new Date(),
  ): Promise<V2StoredProposalRecord> {
    const current = await this.repository.storedProposal(proposalId);
    if (!current) throw proposalApplicationError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
    if (current.updatedAt !== expectedUpdatedAt) throw proposalApplicationError("V2_PROPOSAL_REVIEW_STALE", "Proposal 已在其他审阅操作后变化；请刷新后重试。");
    const closure = validateV2MiniProjectClosure(closureValue);
    const group = current.proposal.groups.find((candidate) => candidate.groupId === groupId);
    const transition = group?.semanticOperations.length === 1 ? group.semanticOperations[0] : undefined;
    if (!group || group.risk !== "HIGH" || transition?.kind !== "TRANSITION_LIFECYCLE" || transition.payload.objectType !== "MINI_PROJECT" || transition.payload.lifecycle !== "COMPLETED") throw proposalApplicationError("V2_MINI_PROJECT_CLOSURE_REVIEW_INVALID", "三问只能写入独立 HIGH MiniProject Closure 语义组。");
    const enriched: V2Proposal = {
      ...current.proposal,
      finalPreview: `原目标：${closure.originalGoal}\n实际结果：${closure.actualResult}\n遗留：${closure.remainingWork}`,
      unresolvedQuestions: [],
      groups: current.proposal.groups.map((candidate) => candidate.groupId === groupId ? {
        ...candidate,
        semanticOperations: candidate.semanticOperations.map((operation) => operation.operationId === transition.operationId ? { ...operation, payload: { ...operation.payload, closure } } : operation),
      } : candidate),
    };
    const reviewed = reviewV2ProposalGroups(enriched, { [groupId]: { disposition: "ACCEPTED", highImpactConfirmed: true } });
    return this.repository.updateStoredProposal(reviewed, renderV2ProposalFiles(reviewed), expectedUpdatedAt, at);
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
