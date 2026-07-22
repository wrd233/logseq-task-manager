import { StructuredError, checksum, stableJson } from "@task-copilot/shared";
import { validateV2MiniProjectClosure, validateV2ProjectClosure, validateV2ProjectStructure, type V2MiniProjectClosure, type V2ProjectClosure, type V2ProjectStructure } from "./v2.ts";

export type V2ProposalSourceKind = "local_llm" | "external_agent" | "user" | "migration" | "repair";
export type V2ProposalRisk = "LOW" | "MEDIUM" | "HIGH";
export type V2ProposalGroupDisposition = "PENDING" | "ACCEPTED" | "REJECTED" | "DEFERRED";
export type V2ProposalStatus = "DRAFT" | "READY" | "IN_REVIEW" | "PARTIALLY_ACCEPTED" | "ACCEPTED" | "REJECTED" | "STALE" | "APPLIED" | "FAILED" | "SUPERSEDED";
export type V2ProposalOperationKind = "REWRITE_BLOCK" | "CREATE_OBJECT" | "CHANGE_OBJECT_TYPE" | "CHANGE_OWNERSHIP" | "CREATE_DECISION" | "CREATE_OUTPUT" | "MOVE_BLOCK" | "TRANSITION_LIFECYCLE" | "REBIND_ANCHOR" | "UPDATE_PROJECT_INTERFACE" | "DELETE_CONTENT";

export interface V2ProposalScopeTarget {
  kind: "BLOCK" | "PAGE" | "OBJECT";
  id: string;
  version?: number;
  hash?: string;
}

export interface V2ProposalTextPatch {
  blockUuid: string;
  beforeText: string;
  afterText: string;
  beforeHash: string;
  afterHash: string;
}

export interface V2ProposalSemanticOperation {
  operationId: string;
  kind: V2ProposalOperationKind;
  target: V2ProposalScopeTarget;
  summary: string;
  payload: Record<string, unknown>;
  preconditions: string[];
}

export interface V2ProposalOperationGroup {
  groupId: string;
  explanation: string;
  risk: V2ProposalRisk;
  independentlyAcceptable: boolean;
  dependencies: string[];
  textPatches: V2ProposalTextPatch[];
  semanticOperations: V2ProposalSemanticOperation[];
  disposition: V2ProposalGroupDisposition;
  deferredUntil?: string;
  deferReason?: string;
}

export interface V2Proposal {
  proposalId: string;
  schemaVersion: "v2";
  title: string;
  context: string;
  understanding: string;
  objective: string;
  logic: string;
  finalPreview: string;
  unresolvedQuestions: string[];
  source: { kind: V2ProposalSourceKind; provider?: string; model?: string; skillVersion?: string; writingProfileVersion?: string; promptBundleVersion?: string };
  scope: { read: V2ProposalScopeTarget[]; modify: V2ProposalScopeTarget[] };
  preconditions: string[];
  groups: V2ProposalOperationGroup[];
  status: V2ProposalStatus;
  createdAt: string;
}

export interface V2ProposalFiles { proposalMd: string; proposalJson: string }

export interface V2ProposalScopeObservation {
  kind: V2ProposalScopeTarget["kind"];
  id: string;
  exists: boolean;
  version?: number;
  hash?: string;
}

export type V2ProposalStaleReason = "EVIDENCE_UNSPECIFIED" | "OBSERVATION_MISSING" | "TARGET_MISSING" | "VERSION_CHANGED" | "HASH_CHANGED";
export interface V2ProposalStaleIssue { kind: V2ProposalScopeTarget["kind"]; id: string; reason: V2ProposalStaleReason }
export type V2ProposalRevalidationResult =
  | { status: "VALID"; acceptedGroupIds: string[] }
  | { status: "STALE"; acceptedGroupIds: string[]; issues: V2ProposalStaleIssue[] };

export interface V2ProposalRevalidationScope {
  acceptedGroupIds: string[];
  targets: V2ProposalScopeTarget[];
}

export type V2ProposalGroupDecision =
  | { disposition: "ACCEPTED"; highImpactConfirmed?: boolean }
  | { disposition: "REJECTED" }
  | { disposition: "DEFERRED"; deferredUntil: string; reason: string };

const highImpactOperations = new Set<V2ProposalOperationKind>(["CHANGE_OBJECT_TYPE", "CHANGE_OWNERSHIP", "MOVE_BLOCK", "REBIND_ANCHOR", "UPDATE_PROJECT_INTERFACE", "DELETE_CONTENT"]);
const proposalOperationKinds = new Set<V2ProposalOperationKind>(["REWRITE_BLOCK", "CREATE_OBJECT", "CHANGE_OBJECT_TYPE", "CHANGE_OWNERSHIP", "CREATE_DECISION", "CREATE_OUTPUT", "MOVE_BLOCK", "TRANSITION_LIFECYCLE", "REBIND_ANCHOR", "UPDATE_PROJECT_INTERFACE", "DELETE_CONTENT"]);
const proposalStatuses = new Set<V2ProposalStatus>(["DRAFT", "READY", "IN_REVIEW", "PARTIALLY_ACCEPTED", "ACCEPTED", "REJECTED", "STALE", "APPLIED", "FAILED", "SUPERSEDED"]);

function proposalError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-094", "D-185"], ...(details ? { details } : {}) });
}

function requireIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw proposalError("V2_PROPOSAL_IDENTIFIER_INVALID", `${label} 不是受控标识。`, { label });
}

function scopeKey(target: V2ProposalScopeTarget): string { return `${target.kind}:${target.id}`; }

function validateScopeTarget(target: V2ProposalScopeTarget): void {
  if (!target.id.trim() || target.id.length > 512) throw proposalError("V2_PROPOSAL_SCOPE_INVALID", "Proposal scope target 无效。");
  if (target.version !== undefined && (!Number.isSafeInteger(target.version) || target.version < 0)) throw proposalError("V2_PROPOSAL_SCOPE_INVALID", "Proposal scope version 无效。");
  if (target.hash !== undefined && !/^[0-9a-f]{8}$/.test(target.hash)) throw proposalError("V2_PROPOSAL_SCOPE_INVALID", "Proposal scope hash 无效。");
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

export function validateV2Proposal(value: unknown): V2Proposal {
  if (!isRecord(value)) throw proposalError("V2_PROPOSAL_SHAPE_INVALID", "Proposal 必须是 JSON object。");
  const proposal = value as unknown as V2Proposal;
  if (
    typeof proposal.proposalId !== "string" || typeof proposal.schemaVersion !== "string" || typeof proposal.title !== "string"
    || typeof proposal.context !== "string" || typeof proposal.understanding !== "string" || typeof proposal.objective !== "string"
    || typeof proposal.logic !== "string" || typeof proposal.finalPreview !== "string" || !Array.isArray(proposal.unresolvedQuestions)
    || !isRecord(proposal.source) || !["local_llm", "external_agent", "user", "migration", "repair"].includes(proposal.source.kind)
    || !isRecord(proposal.scope) || !Array.isArray(proposal.scope.read) || !Array.isArray(proposal.scope.modify)
    || !Array.isArray(proposal.preconditions) || !Array.isArray(proposal.groups) || typeof proposal.status !== "string" || !proposalStatuses.has(proposal.status) || typeof proposal.createdAt !== "string"
  ) throw proposalError("V2_PROPOSAL_SHAPE_INVALID", "Proposal 顶层字段不完整或类型无效。");
  if (proposal.unresolvedQuestions.some((question) => typeof question !== "string") || proposal.preconditions.some((condition) => typeof condition !== "string")) throw proposalError("V2_PROPOSAL_SHAPE_INVALID", "Proposal 问题和前置条件必须是字符串数组。");
  for (const target of [...proposal.scope.read, ...proposal.scope.modify]) {
    if (!isRecord(target) || !["BLOCK", "PAGE", "OBJECT"].includes(target.kind) || typeof target.id !== "string") throw proposalError("V2_PROPOSAL_SCOPE_INVALID", "Proposal scope target shape 无效。");
  }
  for (const group of proposal.groups) {
    if (!isRecord(group) || typeof group.groupId !== "string" || typeof group.explanation !== "string" || !["LOW", "MEDIUM", "HIGH"].includes(group.risk)
      || typeof group.independentlyAcceptable !== "boolean" || !Array.isArray(group.dependencies) || !Array.isArray(group.textPatches) || !Array.isArray(group.semanticOperations)
      || !["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"].includes(group.disposition) || group.dependencies.some((dependency) => typeof dependency !== "string")) {
      throw proposalError("V2_PROPOSAL_GROUP_SHAPE_INVALID", "Proposal operation group shape 无效。");
    }
    for (const patch of group.textPatches) {
      if (!isRecord(patch) || [patch.blockUuid, patch.beforeText, patch.afterText, patch.beforeHash, patch.afterHash].some((field) => typeof field !== "string")) throw proposalError("V2_PROPOSAL_PATCH_SHAPE_INVALID", "Proposal text patch shape 无效。");
    }
    for (const operation of group.semanticOperations) {
      if (!isRecord(operation) || typeof operation.operationId !== "string" || typeof operation.kind !== "string" || !proposalOperationKinds.has(operation.kind) || !isRecord(operation.target) || typeof operation.summary !== "string" || !isRecord(operation.payload) || !Array.isArray(operation.preconditions) || operation.preconditions.some((condition) => typeof condition !== "string")) throw proposalError("V2_PROPOSAL_OPERATION_SHAPE_INVALID", "Proposal semantic operation shape 无效。");
    }
  }
  requireIdentifier(proposal.proposalId, "proposal_id");
  if (proposal.schemaVersion !== "v2") throw proposalError("V2_PROPOSAL_SCHEMA_UNSUPPORTED", "Proposal schema_version 必须为 v2。");
  for (const [label, value] of Object.entries({ title: proposal.title, context: proposal.context, understanding: proposal.understanding, objective: proposal.objective, logic: proposal.logic, finalPreview: proposal.finalPreview })) {
    if (typeof value !== "string" || !value.trim() || value.length > 20_000) throw proposalError("V2_PROPOSAL_NARRATIVE_INVALID", `Proposal ${label} 不能为空或过长。`);
  }
  if (!Number.isFinite(Date.parse(proposal.createdAt))) throw proposalError("V2_PROPOSAL_TIME_INVALID", "Proposal created_at 无效。");
  if (proposal.scope.modify.length === 0) throw proposalError("V2_PROPOSAL_MODIFY_SCOPE_REQUIRED", "Proposal 必须显式声明 modify scope。");
  const scope = [...proposal.scope.read, ...proposal.scope.modify];
  scope.forEach(validateScopeTarget);
  const modifyKeys = new Set(proposal.scope.modify.map(scopeKey));
  if (modifyKeys.size !== proposal.scope.modify.length) throw proposalError("V2_PROPOSAL_SCOPE_DUPLICATE", "Proposal modify scope 不能重复。");
  if (proposal.groups.length === 0 || proposal.groups.length > 64) throw proposalError("V2_PROPOSAL_GROUPS_INVALID", "Proposal 必须包含 1 到 64 个语义操作组。");
  const groupIds = new Set<string>();
  const operationIds = new Set<string>();
  for (const group of proposal.groups) {
    requireIdentifier(group.groupId, "group_id");
    if (groupIds.has(group.groupId)) throw proposalError("V2_PROPOSAL_GROUP_DUPLICATE", "Proposal group_id 不能重复。", { groupId: group.groupId });
    groupIds.add(group.groupId);
    if (!group.explanation.trim() || group.textPatches.length + group.semanticOperations.length === 0) throw proposalError("V2_PROPOSAL_GROUP_EMPTY", "每个语义操作组必须有说明和至少一项变化。", { groupId: group.groupId });
    if (group.disposition === "DEFERRED" && (!group.deferredUntil || !Number.isFinite(Date.parse(group.deferredUntil)) || !group.deferReason?.trim())) throw proposalError("V2_PROPOSAL_DEFERRAL_INVALID", "暂缓组必须包含复查时间和原因。", { groupId: group.groupId });
    for (const patch of group.textPatches) {
      if (!modifyKeys.has(`BLOCK:${patch.blockUuid}`)) throw proposalError("V2_PROPOSAL_SCOPE_VIOLATION", "文本 Patch 超出 modify scope。", { groupId: group.groupId, blockUuid: patch.blockUuid });
      if (patch.beforeHash !== checksum(patch.beforeText) || patch.afterHash !== checksum(patch.afterText)) throw proposalError("V2_PROPOSAL_PATCH_HASH_INVALID", "文本 Patch 的 before/after hash 与正文不一致。", { groupId: group.groupId, blockUuid: patch.blockUuid });
    }
    for (const operation of group.semanticOperations) {
      requireIdentifier(operation.operationId, "operation_id");
      if (operationIds.has(operation.operationId)) throw proposalError("V2_PROPOSAL_OPERATION_DUPLICATE", "Proposal operation_id 不能重复。", { operationId: operation.operationId });
      operationIds.add(operation.operationId);
      validateScopeTarget(operation.target);
      if (!modifyKeys.has(scopeKey(operation.target))) throw proposalError("V2_PROPOSAL_SCOPE_VIOLATION", "语义操作超出 modify scope。", { groupId: group.groupId, operationId: operation.operationId });
      if (!operation.summary.trim()) throw proposalError("V2_PROPOSAL_OPERATION_INVALID", "语义操作必须包含人类可读说明。", { operationId: operation.operationId });
      if (highImpactOperations.has(operation.kind) && group.risk !== "HIGH") throw proposalError("V2_PROPOSAL_RISK_DOWNGRADE", "高影响语义操作不能降级风险。", { groupId: group.groupId, operationId: operation.operationId });
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(proposal.groups.map((group) => [group.groupId, group]));
  const visit = (groupId: string): void => {
    if (visited.has(groupId)) return;
    if (visiting.has(groupId)) throw proposalError("V2_PROPOSAL_GROUP_DEPENDENCY_CYCLE", "Proposal 操作组依赖不能形成循环。", { groupId });
    visiting.add(groupId);
    for (const dependency of byId.get(groupId)?.dependencies ?? []) {
      if (!byId.has(dependency)) throw proposalError("V2_PROPOSAL_GROUP_DEPENDENCY_MISSING", "Proposal 操作组依赖不存在。", { groupId, dependency });
      visit(dependency);
    }
    visiting.delete(groupId);
    visited.add(groupId);
  };
  proposal.groups.forEach((group) => visit(group.groupId));
  return proposal;
}

export function validateV2ProposalForSubmission(value: unknown): V2Proposal {
  const proposal = validateV2Proposal(value);
  let miniProjectCompletionCount = 0;
  for (const group of proposal.groups) {
    for (const operation of group.semanticOperations) {
      if (operation.kind === "CREATE_OBJECT" && (typeof operation.payload.objectType !== "string" || typeof operation.payload.text !== "string" || !operation.payload.text.trim())) {
        throw proposalError("V2_PROPOSAL_CREATE_OBJECT_PAYLOAD_INVALID", "CREATE_OBJECT 必须明确声明最终对象类型与正文，不能依赖 Graph 回声补全。");
      }
      if (operation.kind === "TRANSITION_LIFECYCLE" && !["OPEN", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(String(operation.payload.lifecycle))) {
        throw proposalError("V2_PROPOSAL_LIFECYCLE_PAYLOAD_INVALID", "TRANSITION_LIFECYCLE 必须明确声明合法的终态。");
      }
      if (operation.kind === "TRANSITION_LIFECYCLE" && (operation.payload.lifecycle === "CANCELLED" || operation.payload.lifecycle === "OPEN")) {
        const isCancellation = operation.payload.lifecycle === "CANCELLED" && operation.payload.action === "CANCEL";
        const isReopen = operation.payload.lifecycle === "OPEN" && operation.payload.action === "REOPEN";
        const reason = typeof operation.payload.reason === "string" ? operation.payload.reason.trim() : "";
        const fromLifecycle = operation.payload.fromLifecycle;
        const fromStateValid = isCancellation ? fromLifecycle === "OPEN" : fromLifecycle === "COMPLETED" || fromLifecycle === "CANCELLED";
        if ((!isCancellation && !isReopen) || !fromStateValid || !reason || reason.length > 4_000 || group.textPatches.length !== 0 || group.semanticOperations.length !== 1 || operation.target.kind !== "OBJECT" || operation.target.version === undefined || !["TASK", "MINI_PROJECT", "PROJECT"].includes(String(operation.payload.objectType))) {
          throw proposalError("V2_PROPOSAL_REASONED_LIFECYCLE_SHAPE_INVALID", "取消或重开必须是指向带版本对象、记录原因的独立 Lifecycle 语义组。");
        }
        if ((operation.payload.objectType === "PROJECT" || operation.payload.objectType === "MINI_PROJECT") && group.risk !== "HIGH") throw proposalError("V2_PROPOSAL_RISK_DOWNGRADE", "Project 或 MiniProject 的取消与重开必须独立按 HIGH 审阅。");
      }
      if (operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.objectType === "MINI_PROJECT" && operation.payload.lifecycle === "COMPLETED") {
        miniProjectCompletionCount += 1;
        if (miniProjectCompletionCount > 1) throw proposalError("V2_PROPOSAL_MINI_PROJECT_CLOSURE_MULTIPLE", "一个 Proposal 只能关闭一个 MiniProject；其他关闭意图必须拆成独立 Proposal。");
        if (group.risk !== "HIGH" || group.textPatches.length !== 0 || group.semanticOperations.length !== 1 || operation.target.kind !== "OBJECT" || operation.target.version === undefined) {
          throw proposalError("V2_PROPOSAL_MINI_PROJECT_CLOSURE_SHAPE_INVALID", "MiniProject Completion 必须是指向带版本对象的独立 HIGH 组。");
        }
        const hasMarkerEvidence = [operation.payload.marker, operation.payload.text, operation.payload.externalId, operation.payload.contentHash].some((item) => item !== undefined);
        if (hasMarkerEvidence) {
          const blockEvidence = proposal.scope.read.filter((target) => target.kind === "BLOCK" && target.id === operation.payload.externalId && target.hash === operation.payload.contentHash);
          if (typeof operation.payload.text !== "string" || !operation.payload.text.trim() || operation.payload.marker !== "DONE"
            || typeof operation.payload.externalId !== "string" || !operation.payload.externalId.trim() || operation.payload.externalId.length > 512
            || typeof operation.payload.contentHash !== "string" || !/^[0-9a-f]{8}$/.test(operation.payload.contentHash) || blockEvidence.length !== 1) {
            throw proposalError("V2_PROPOSAL_MINI_PROJECT_CLOSURE_MARKER_INVALID", "Marker 驱动的 MiniProject Completion 必须绑定 DONE Block 证据。");
          }
        }
        if ("closure" in operation.payload) validateV2MiniProjectClosure(operation.payload.closure as V2MiniProjectClosure);
      }
      if (operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload) {
        const closure = operation.payload.closure;
        if (!closure || typeof closure !== "object" || Array.isArray(closure)) throw proposalError("V2_PROPOSAL_PROJECT_CLOSURE_INVALID", "Project Closure payload 必须是结构化对象。");
        validateV2ProjectClosure(closure as unknown as V2ProjectClosure);
      }
      if (operation.kind === "UPDATE_PROJECT_INTERFACE" && "projectStructure" in operation.payload) {
        validateV2ProjectStructure(operation.payload.projectStructure as unknown as V2ProjectStructure);
        validateV2ProjectStructure(operation.payload.previousProjectStructure as unknown as V2ProjectStructure);
      }
    }
  }
  return proposal;
}

function bullet(values: readonly string[], fallback = "无"): string { return values.length ? values.map((value) => `- ${value}`).join("\n") : `- ${fallback}`; }

export function renderV2ProposalFiles(proposal: V2Proposal): V2ProposalFiles {
  validateV2Proposal(proposal);
  const impacts = proposal.groups.flatMap((group) => group.semanticOperations.map((operation) => `${operation.kind}：${operation.summary}`));
  const highImpact = proposal.groups.filter((group) => group.risk === "HIGH").map((group) => `${group.groupId}：${group.explanation}`);
  const versions = [...proposal.scope.read, ...proposal.scope.modify].map((target) => `${scopeKey(target)}${target.version !== undefined ? ` v${target.version}` : ""}${target.hash ? ` #${target.hash}` : ""}`);
  const proposalMd = `# ${proposal.title}\n\n## 当前上下文\n\n${proposal.context}\n\n## 理解摘要\n\n${proposal.understanding}\n\n## 修改目标\n\n${proposal.objective}\n\n## 修改逻辑\n\n${proposal.logic}\n\n## 最终可读预览\n\n${proposal.finalPreview}\n\n## 语义影响\n\n${bullet(impacts)}\n\n## 高影响操作\n\n${bullet(highImpact)}\n\n## 未解决问题\n\n${bullet(proposal.unresolvedQuestions)}\n\n## 版本与来源摘要\n\n- 来源：${proposal.source.kind}\n- Schema：${proposal.schemaVersion}\n${bullet(versions)}\n`;
  return { proposalMd, proposalJson: `${stableJson(proposal)}\n` };
}

export function reviewV2ProposalGroups(
  proposal: V2Proposal,
  decisions: Readonly<Record<string, V2ProposalGroupDecision>>,
): V2Proposal {
  validateV2Proposal(proposal);
  if (!["READY", "IN_REVIEW", "PARTIALLY_ACCEPTED"].includes(proposal.status)) throw proposalError("V2_PROPOSAL_NOT_REVIEWABLE", "Proposal 当前状态不可审阅。");
  const unknown = Object.keys(decisions).find((groupId) => !proposal.groups.some((group) => group.groupId === groupId));
  if (unknown) throw proposalError("V2_PROPOSAL_GROUP_NOT_FOUND", "审阅决定引用了不存在的操作组。", { groupId: unknown });
  const groups = proposal.groups.map((group) => {
    const decision = decisions[group.groupId];
    if (!decision) return group;
    const withoutDeferral = { ...group };
    delete withoutDeferral.deferredUntil;
    delete withoutDeferral.deferReason;
    if (decision.disposition === "ACCEPTED") {
      if (group.risk === "HIGH" && decision.highImpactConfirmed !== true) throw proposalError("V2_PROPOSAL_HIGH_IMPACT_CONFIRMATION_REQUIRED", "高影响操作组必须独立确认。", { groupId: group.groupId });
      return { ...withoutDeferral, disposition: "ACCEPTED" as const };
    }
    if (decision.disposition === "REJECTED") return { ...withoutDeferral, disposition: "REJECTED" as const };
    if (!Number.isFinite(Date.parse(decision.deferredUntil)) || !decision.reason.trim()) throw proposalError("V2_PROPOSAL_DEFERRAL_INVALID", "暂缓组必须包含复查时间和原因。", { groupId: group.groupId });
    return { ...group, disposition: "DEFERRED" as const, deferredUntil: decision.deferredUntil, deferReason: decision.reason.trim() };
  });
  const byId = new Map(groups.map((group) => [group.groupId, group]));
  for (const group of groups.filter((candidate) => candidate.disposition === "ACCEPTED")) {
    const unavailable = group.dependencies.find((dependency) => byId.get(dependency)?.disposition !== "ACCEPTED");
    if (unavailable) throw proposalError("V2_PROPOSAL_DEPENDENCY_NOT_ACCEPTED", "不能只接受依赖链的后半段。", { groupId: group.groupId, dependency: unavailable });
    if (!group.independentlyAcceptable && groups.some((candidate) => candidate.disposition !== "ACCEPTED")) throw proposalError("V2_PROPOSAL_GROUP_NOT_INDEPENDENT", "该操作组不能脱离其余 Proposal 单独接受。", { groupId: group.groupId });
  }
  const accepted = groups.filter((group) => group.disposition === "ACCEPTED").length;
  const rejected = groups.filter((group) => group.disposition === "REJECTED").length;
  const pending = groups.length - accepted - rejected;
  const status: V2ProposalStatus = accepted === groups.length
    ? "ACCEPTED"
    : rejected === groups.length
      ? "REJECTED"
      : accepted > 0
        ? "PARTIALLY_ACCEPTED"
        : pending > 0
          ? "IN_REVIEW"
          : "REJECTED";
  return { ...proposal, groups, status };
}

export function requiredV2ProposalRevalidationScope(proposal: V2Proposal): V2ProposalRevalidationScope {
  validateV2Proposal(proposal);
  if (proposal.status !== "ACCEPTED" && proposal.status !== "PARTIALLY_ACCEPTED") {
    throw proposalError("V2_PROPOSAL_NOT_ACCEPTED", "只有包含已接受语义组的 Proposal 可以进入提交前重验。");
  }
  const acceptedGroups = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (acceptedGroups.length === 0) throw proposalError("V2_PROPOSAL_NOT_ACCEPTED", "Proposal 没有已接受的语义组。");
  const acceptedGroupIds = acceptedGroups.map((group) => group.groupId);
  const acceptedModifyKeys = new Set<string>();
  for (const group of acceptedGroups) {
    for (const patch of group.textPatches) acceptedModifyKeys.add(`BLOCK:${patch.blockUuid}`);
    for (const operation of group.semanticOperations) acceptedModifyKeys.add(scopeKey(operation.target));
  }
  const targets = new Map<string, V2ProposalScopeTarget>();
  for (const target of [...proposal.scope.read, ...proposal.scope.modify.filter((candidate) => acceptedModifyKeys.has(scopeKey(candidate)))]) {
    const existing = targets.get(scopeKey(target));
    targets.set(scopeKey(target), existing ? { ...existing, ...target } : target);
  }
  return { acceptedGroupIds, targets: [...targets.values()] };
}

export function revalidateAcceptedV2Proposal(
  proposal: V2Proposal,
  observations: readonly V2ProposalScopeObservation[],
): V2ProposalRevalidationResult {
  const { acceptedGroupIds, targets: requiredTargets } = requiredV2ProposalRevalidationScope(proposal);
  const requiredByKey = new Map(requiredTargets.map((target) => [scopeKey(target), target]));
  const observationByKey = new Map<string, V2ProposalScopeObservation>();
  for (const observation of observations) {
    if (!isRecord(observation) || !["BLOCK", "PAGE", "OBJECT"].includes(observation.kind) || typeof observation.id !== "string" || typeof observation.exists !== "boolean") {
      throw proposalError("V2_PROPOSAL_OBSERVATION_INVALID", "Proposal 重验证据形状无效。");
    }
    validateScopeTarget(observation);
    const key = scopeKey(observation);
    if (!requiredByKey.has(key)) throw proposalError("V2_PROPOSAL_OBSERVATION_SCOPE_VIOLATION", "Proposal 重验证据超出已接受修改与读取 scope。", { target: key });
    if (observationByKey.has(key)) throw proposalError("V2_PROPOSAL_OBSERVATION_DUPLICATE", "Proposal 重验证据不能重复。", { target: key });
    observationByKey.set(key, observation);
  }
  const issues: V2ProposalStaleIssue[] = [];
  for (const target of requiredTargets) {
    const identity = { kind: target.kind, id: target.id };
    if (target.version === undefined && target.hash === undefined) {
      issues.push({ ...identity, reason: "EVIDENCE_UNSPECIFIED" });
      continue;
    }
    const observed = observationByKey.get(scopeKey(target));
    if (!observed) {
      issues.push({ ...identity, reason: "OBSERVATION_MISSING" });
      continue;
    }
    if (!observed.exists) {
      issues.push({ ...identity, reason: "TARGET_MISSING" });
      continue;
    }
    if (target.version !== undefined && observed.version !== target.version) issues.push({ ...identity, reason: "VERSION_CHANGED" });
    if (target.hash !== undefined && observed.hash !== target.hash) issues.push({ ...identity, reason: "HASH_CHANGED" });
  }
  return issues.length > 0 ? { status: "STALE", acceptedGroupIds, issues } : { status: "VALID", acceptedGroupIds };
}
