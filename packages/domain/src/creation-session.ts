import { StructuredError, createId } from "@task-copilot/shared";

export const CREATION_SESSION_TARGET_TYPES = ["MINI_PROJECT", "PROJECT"] as const;
export type CreationSessionTargetType = (typeof CREATION_SESSION_TARGET_TYPES)[number];
export const CREATION_SESSION_STATUSES = ["DISCUSSING", "PREVIEW_READY", "CREATED", "ABANDONED"] as const;
export type CreationSessionStatus = (typeof CREATION_SESSION_STATUSES)[number];
export const CREATION_SOURCE_KINDS = ["BLANK", "BLOCK_SUBTREE", "PAGE"] as const;
export type CreationSourceKind = (typeof CREATION_SOURCE_KINDS)[number];
export const CREATION_ANSWER_STATES = ["ANSWERED", "ACCEPTED_RECOMMENDATION", "SKIPPED", "UNCERTAIN", "UNANSWERED"] as const;
export type CreationAnswerState = (typeof CREATION_ANSWER_STATES)[number];
export const CREATION_CONSENSUS_PROVENANCE = ["SOURCE_FACT", "USER_CONFIRMED", "USER_EDITED", "AGENT_SYNTHESIS", "AGENT_SUGGESTION", "UNKNOWN", "CONFLICT", "SKIPPED"] as const;
export type CreationConsensusProvenance = (typeof CREATION_CONSENSUS_PROVENANCE)[number];
export const CREATION_DRAFT_PROVENANCE = ["SOURCE_FACT", "USER_CONFIRMED", "USER_EDITED", "AGENT_SYNTHESIS", "AGENT_SUGGESTION", "UNCONFIRMED"] as const;
export type CreationDraftProvenance = (typeof CREATION_DRAFT_PROVENANCE)[number];
export const CREATION_DRAFT_OPERATIONS = ["KEEP", "MOVE", "REWRITE", "CREATE"] as const;
export type CreationDraftOperation = (typeof CREATION_DRAFT_OPERATIONS)[number];
export const CREATION_REVISION_REASONS = ["INITIAL_DRAFT", "STRUCTURE_EDIT", "USER_EDIT", "SOURCE_REFRESH", "TARGET_TYPE_CHANGE", "ADOPTED", "FINAL_CREATE"] as const;
export type CreationRevisionReason = (typeof CREATION_REVISION_REASONS)[number];

export interface CreationSourceSnapshotNode {
  nodeId: string;
  text: string;
  parentNodeId?: string;
  order: number;
  depth: number;
  relation: "PARENT" | "ROOT" | "CHILD";
}

export interface CreationSourceCapture {
  captureId: string;
  reason: "SESSION_START" | "USER_REFRESH" | "DRAFT_GENERATION" | "PRE_COMMIT";
  snapshotHash: string;
  content: string;
  hierarchy: CreationSourceSnapshotNode[];
  capturedAt: string;
}

export interface CreationSessionSource {
  sourceId: string;
  role: "PRIMARY" | "REFERENCE";
  kind: CreationSourceKind;
  externalId?: string;
  pageName?: string;
  durableOrigin?: string;
  captures: CreationSourceCapture[];
  currentCaptureId: string;
  latestKnownHash: string;
  availability: "AVAILABLE" | "CHANGED" | "DELETED" | "UNRESOLVED";
}

export interface CreationRoundQuestion {
  questionId: string;
  uncertaintyId: string;
  text: string;
  rationale: string;
  recommendation: string;
  answerState: CreationAnswerState;
  userAnswer?: string;
}

export interface CreationSessionRound {
  roundId: string;
  theme: string;
  questions: CreationRoundQuestion[];
  providerStatus: "NOT_REQUESTED" | "REQUESTING" | "COMPLETED" | "FAILED" | "CANCELLED";
  agentSynthesis?: string;
  consensusDelta: string[];
  draftDelta: string[];
  createdAt: string;
  completedAt?: string;
}

export interface CreationConsensusItem {
  consensusId: string;
  text: string;
  provenance: CreationConsensusProvenance;
  evidenceRefs: string[];
  updatedAt: string;
}

export interface CreationDraftNode {
  nodeId: string;
  text: string;
  parentNodeId?: string;
  order: number;
  nodeType: "BLOCK" | "TODO" | "PAGE_SECTION";
  provenance: CreationDraftProvenance;
  sourceBlockUuid?: string;
  operation: CreationDraftOperation;
  userEdited: boolean;
  confirmed: boolean;
}

export interface CreationDraftRevision {
  revisionId: string;
  reason: CreationRevisionReason;
  nodes: CreationDraftNode[];
  adopted: boolean;
  final: boolean;
  createdAt: string;
}

export type CreationPlacementPlan =
  | { kind: "SOURCE_BLOCK_IN_PLACE"; sourceBlockUuid: string }
  | { kind: "SOURCE_BLOCK_CHILD"; sourceBlockUuid: string }
  | { kind: "AFTER_SELECTED_BLOCK"; selectedBlockUuid: string; selectionHash: string }
  | { kind: "PAGE_END"; pageId: string; pageName: string; pageHash?: string }
  | { kind: "NEW_PROJECT_PAGE"; pageName: string };

export interface CreationResult {
  objectId: string;
  semanticCommitId: string;
  createdAt: string;
  undoneAt?: string;
  recoveryRequired?: boolean;
}

export interface CreationSessionEvent {
  eventId: string;
  kind: "SESSION_CREATED" | "SOURCE_CAPTURED" | "ROUND_SUBMITTED" | "ROUND_COMPLETED" | "ROUND_FAILED" | "SOURCE_REFRESHED" | "SOURCE_CONFLICT_FOUND" | "DRAFT_GENERATED" | "DRAFT_EDITED" | "TARGET_TYPE_CHANGED" | "PLACEMENT_SELECTED" | "CREATE_CONFIRMED" | "CREATED" | "CREATE_FAILED" | "UNDONE" | "ABANDONED";
  occurredAt: string;
  summary: string;
}

export interface CreationSession {
  sessionId: string;
  graphId: string;
  targetType: CreationSessionTargetType;
  status: CreationSessionStatus;
  version: number;
  userTitle?: string;
  suggestedObjectTitle?: string;
  sources: CreationSessionSource[];
  rounds: CreationSessionRound[];
  consensus: CreationConsensusItem[];
  draftRevisions: CreationDraftRevision[];
  currentDraftRevisionId?: string;
  placementPlan?: CreationPlacementPlan;
  creationResult?: CreationResult;
  events: CreationSessionEvent[];
  createdAt: string;
  updatedAt: string;
}

function creationError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["CREATION-SESSION-001", "D-127", "D-185"] });
}

function boundedText(value: unknown, label: string, maximum = 4_000, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw creationError("CREATION_SESSION_TEXT_INVALID", `${label}必须是非空有界文本。`);
  return value.trim();
}

function validTime(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw creationError("CREATION_SESSION_TIME_INVALID", `${label}必须是合法时间。`);
}

function validateSources(sources: readonly CreationSessionSource[]): void {
  if (sources.length < 1 || sources.length > 4) throw creationError("CREATION_SESSION_SOURCE_LIMIT", "Creation Session 必须有一个主来源，且参考来源最多三个。");
  if (sources.filter(({ role }) => role === "PRIMARY").length !== 1 || sources.filter(({ role }) => role === "REFERENCE").length > 3) throw creationError("CREATION_SESSION_SOURCE_ROLE_INVALID", "Creation Session 必须且只能有一个主来源。");
  if (new Set(sources.map(({ sourceId }) => sourceId)).size !== sources.length) throw creationError("CREATION_SESSION_SOURCE_DUPLICATE", "Creation Session 来源不能重复。");
  for (const source of sources) {
    boundedText(source.sourceId, "来源 ID", 128);
    if (!CREATION_SOURCE_KINDS.includes(source.kind)) throw creationError("CREATION_SESSION_SOURCE_KIND_INVALID", "Creation Session 来源类型无效。");
    if (source.captures.length < 1 || source.captures.length > 8 || new Set(source.captures.map(({ captureId }) => captureId)).size !== source.captures.length) throw creationError("CREATION_SESSION_CAPTURE_LIMIT", "每个来源必须保留 1 至 8 个不重复的重要快照。");
    const current = source.captures.find(({ captureId }) => captureId === source.currentCaptureId);
    if (!current) throw creationError("CREATION_SESSION_CAPTURE_CURRENT_INVALID", "来源当前快照必须指向已保存的重要快照。");
    if (source.kind === "BLANK" && (source.externalId || current.content || current.hierarchy.length)) throw creationError("CREATION_SESSION_BLANK_SOURCE_INVALID", "空白来源不能伪装成 Graph 材料。");
    if (source.kind !== "BLANK" && (!source.externalId || !current.snapshotHash || !source.latestKnownHash)) throw creationError("CREATION_SESSION_SOURCE_IDENTITY_REQUIRED", "Graph 来源必须保留身份与快照 Hash。");
    for (const capture of source.captures) {
      boundedText(capture.captureId, "来源快照 ID", 128);
      if (!["SESSION_START", "USER_REFRESH", "DRAFT_GENERATION", "PRE_COMMIT"].includes(capture.reason)) throw creationError("CREATION_SESSION_CAPTURE_REASON_INVALID", "来源快照原因无效。");
      if (!capture.snapshotHash || capture.snapshotHash.length > 128 || capture.content.length > 256 * 1024 || capture.hierarchy.length > 256) throw creationError("CREATION_SESSION_SOURCE_TOO_LARGE", "Creation Session 来源快照超出有界范围。");
      if (new Set(capture.hierarchy.map(({ nodeId }) => nodeId)).size !== capture.hierarchy.length) throw creationError("CREATION_SESSION_SOURCE_NODE_DUPLICATE", "来源快照节点身份不能重复。");
      for (const node of capture.hierarchy) {
        boundedText(node.nodeId, "来源节点 ID", 128);
        if (node.text.length > 64 * 1024 || !Number.isSafeInteger(node.order) || node.order < 0 || !Number.isSafeInteger(node.depth) || node.depth < 0 || node.depth > 256 || !["PARENT", "ROOT", "CHILD"].includes(node.relation)) throw creationError("CREATION_SESSION_SOURCE_NODE_INVALID", "来源快照节点无效或超界。");
      }
      validTime(capture.capturedAt, "来源捕获时间");
    }
  }
}

function sourceCurrentCapture(source: CreationSessionSource): CreationSourceCapture {
  return source.captures.find(({ captureId }) => captureId === source.currentCaptureId)!;
}

function validateRound(round: CreationSessionRound): void {
  boundedText(round.roundId, "轮次 ID", 128);
  boundedText(round.theme, "轮次主题", 200);
  if (round.questions.length < 1 || round.questions.length > 5) throw creationError("CREATION_SESSION_QUESTION_LIMIT", "每轮只能包含 1 至 5 个强相关问题。");
  if (new Set(round.questions.map(({ questionId }) => questionId)).size !== round.questions.length) throw creationError("CREATION_SESSION_QUESTION_DUPLICATE", "同一轮问题 ID 不能重复。");
  for (const question of round.questions) {
    boundedText(question.questionId, "问题 ID", 128);
    boundedText(question.uncertaintyId, "未知分支 ID", 128);
    boundedText(question.text, "问题", 800);
    boundedText(question.rationale, "问题原因", 800);
    boundedText(question.recommendation, "推荐答案", 1_200);
    if (!CREATION_ANSWER_STATES.includes(question.answerState)) throw creationError("CREATION_SESSION_ANSWER_STATE_INVALID", "问题回答状态无效。");
    if (["ANSWERED", "ACCEPTED_RECOMMENDATION"].includes(question.answerState) && !question.userAnswer?.trim()) throw creationError("CREATION_SESSION_ANSWER_REQUIRED", "已回答或已接受推荐的问题必须保存明确答案。");
    if (question.answerState === "UNANSWERED" && question.userAnswer !== undefined) throw creationError("CREATION_SESSION_UNANSWERED_HAS_VALUE", "未回答的问题不能静默保存答案。");
  }
  validTime(round.createdAt, "轮次创建时间");
  if (round.completedAt) validTime(round.completedAt, "轮次完成时间");
}

export function validateCreationSession(session: CreationSession): CreationSession {
  boundedText(session.sessionId, "会话 ID", 128);
  boundedText(session.graphId, "Graph identity", 256);
  if (!CREATION_SESSION_TARGET_TYPES.includes(session.targetType) || !CREATION_SESSION_STATUSES.includes(session.status)) throw creationError("CREATION_SESSION_STATE_INVALID", "Creation Session 类型或状态无效。");
  if (!Number.isSafeInteger(session.version) || session.version < 1) throw creationError("CREATION_SESSION_VERSION_INVALID", "Creation Session version 无效。");
  boundedText(session.userTitle, "会话标题", 240, true);
  boundedText(session.suggestedObjectTitle, "建议对象标题", 240, true);
  validateSources(session.sources);
  if (session.rounds.length > 64 || session.consensus.length > 256 || session.draftRevisions.length > 32 || session.events.length > 512) throw creationError("CREATION_SESSION_BOUNDS_EXCEEDED", "Creation Session 历史超出有界范围。");
  session.rounds.forEach(validateRound);
  if (new Set(session.rounds.map(({ roundId }) => roundId)).size !== session.rounds.length) throw creationError("CREATION_SESSION_ROUND_DUPLICATE", "Creation Session 轮次不能重复。");
  const revisionIds = new Set(session.draftRevisions.map(({ revisionId }) => revisionId));
  if (session.currentDraftRevisionId && !revisionIds.has(session.currentDraftRevisionId)) throw creationError("CREATION_SESSION_DRAFT_CURRENT_INVALID", "当前草稿必须指向已保存的重要 Revision。");
  if (session.status === "CREATED" && !session.creationResult) throw creationError("CREATION_SESSION_RESULT_REQUIRED", "已创建会话必须关联正式对象和 Commit。");
  if (session.status !== "CREATED" && session.creationResult) throw creationError("CREATION_SESSION_RESULT_PREMATURE", "正式创建前不能写入创建结果。");
  validTime(session.createdAt, "会话创建时间");
  validTime(session.updatedAt, "会话更新时间");
  return structuredClone(session);
}

export function createCreationSession(input: { graphId: string; targetType: CreationSessionTargetType; primarySource: CreationSessionSource; userTitle?: string; sessionId?: string }, at = new Date()): CreationSession {
  const timestamp = at.toISOString();
  const sessionId = input.sessionId ?? createId("creation", at);
  return validateCreationSession({
    sessionId,
    graphId: input.graphId,
    targetType: input.targetType,
    status: "DISCUSSING",
    version: 1,
    ...(input.userTitle?.trim() ? { userTitle: input.userTitle.trim() } : {}),
    sources: [{ ...input.primarySource, role: "PRIMARY" }],
    rounds: [],
    consensus: [],
    draftRevisions: [],
    events: [{ eventId: createId("creation_event", at), kind: "SESSION_CREATED", occurredAt: timestamp, summary: `创建 ${input.targetType === "MINI_PROJECT" ? "MiniProject" : "Project"} 会话` }],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function addCreationSessionSource(session: CreationSession, source: CreationSessionSource, expectedVersion: number, at = new Date()): CreationSession {
  if (source.role !== "REFERENCE") throw creationError("CREATION_SESSION_REFERENCE_REQUIRED", "新增来源必须是用户选择的参考来源。");
  if (session.sources.some(({ sourceId, kind, externalId }) => sourceId === source.sourceId || (source.kind !== "BLANK" && kind === source.kind && externalId === source.externalId))) throw creationError("CREATION_SESSION_SOURCE_DUPLICATE", "这个来源已经在当前 Creation Session 中。");
  const timestamp = at.toISOString();
  return updateCreationSession(session, {
    sources: [...session.sources, source],
  }, expectedVersion, at, {
    eventId: createId("creation_event", at), kind: "SOURCE_CAPTURED", occurredAt: timestamp, summary: "用户添加参考来源",
  });
}

export function observeCreationSessionSource(session: CreationSession, sourceId: string, observation: { latestKnownHash?: string; availability: CreationSessionSource["availability"] }, expectedVersion: number, at = new Date()): CreationSession {
  const source = session.sources.find((candidate) => candidate.sourceId === sourceId);
  if (!source) throw creationError("CREATION_SESSION_SOURCE_NOT_FOUND", "Creation Session 来源不存在。");
  if (source.kind === "BLANK") throw creationError("CREATION_SESSION_BLANK_OBSERVATION_INVALID", "空白来源不需要 Graph 变化检查。");
  const latestKnownHash = observation.latestKnownHash ?? source.latestKnownHash;
  const availability = observation.availability;
  const timestamp = at.toISOString();
  const changed = availability !== source.availability || latestKnownHash !== source.latestKnownHash;
  if (!changed) return structuredClone(session);
  return updateCreationSession(session, {
    sources: session.sources.map((candidate) => candidate.sourceId === sourceId ? { ...candidate, latestKnownHash, availability } : candidate),
  }, expectedVersion, at, {
    eventId: createId("creation_event", at), kind: availability === "CHANGED" ? "SOURCE_CONFLICT_FOUND" : "SOURCE_REFRESHED", occurredAt: timestamp,
    summary: availability === "DELETED" ? "来源已删除，正式创建被暂停" : availability === "CHANGED" ? "来源自上次快照后发生变化" : "来源可用性已更新",
  });
}

export function refreshCreationSessionSource(session: CreationSession, sourceId: string, capture: CreationSourceCapture, expectedVersion: number, at = new Date()): CreationSession {
  const source = session.sources.find((candidate) => candidate.sourceId === sourceId);
  if (!source || source.kind === "BLANK") throw creationError("CREATION_SESSION_SOURCE_NOT_FOUND", "没有可纳入最新内容的 Graph 来源。");
  if (capture.reason !== "USER_REFRESH") throw creationError("CREATION_SESSION_REFRESH_REASON_INVALID", "主动纳入最新来源必须保存 USER_REFRESH 快照。");
  const priorCapture = sourceCurrentCapture(source);
  if (capture.snapshotHash === priorCapture.snapshotHash) return observeCreationSessionSource(session, sourceId, { latestKnownHash: capture.snapshotHash, availability: "AVAILABLE" }, expectedVersion, at);
  const affectedCaptureRefs = new Set([priorCapture.captureId, `${source.sourceId}:${priorCapture.captureId}`]);
  const consensus = session.consensus.map((item) => item.evidenceRefs.some((ref) => affectedCaptureRefs.has(ref)) && item.provenance === "SOURCE_FACT" ? { ...item, provenance: "CONFLICT" as const, updatedAt: at.toISOString() } : item);
  const timestamp = at.toISOString();
  return updateCreationSession(session, {
    sources: session.sources.map((candidate) => candidate.sourceId === sourceId ? { ...candidate, captures: [...candidate.captures, capture], currentCaptureId: capture.captureId, latestKnownHash: capture.snapshotHash, availability: "AVAILABLE" } : candidate),
    consensus,
  }, expectedVersion, at, {
    eventId: createId("creation_event", at), kind: "SOURCE_REFRESHED", occurredAt: timestamp, summary: "用户纳入最新来源；旧共识依据和用户草稿均已保留",
  });
}

export function updateCreationSession(session: CreationSession, patch: Partial<Pick<CreationSession, "userTitle" | "suggestedObjectTitle" | "sources" | "rounds" | "consensus" | "draftRevisions" | "currentDraftRevisionId" | "placementPlan">>, expectedVersion: number, at = new Date(), event?: CreationSessionEvent): CreationSession {
  if (session.version !== expectedVersion) throw creationError("CREATION_SESSION_VERSION_CONFLICT", "Creation Session 已在其他入口变化；本次修改未覆盖新内容。");
  if (["CREATED", "ABANDONED"].includes(session.status)) throw creationError("CREATION_SESSION_READ_ONLY", "已创建或已放弃的 Creation Session 只读。");
  const draftRevisions = patch.draftRevisions ?? session.draftRevisions;
  const currentDraftRevisionId = patch.currentDraftRevisionId ?? session.currentDraftRevisionId;
  const status: CreationSessionStatus = currentDraftRevisionId ? "PREVIEW_READY" : "DISCUSSING";
  return validateCreationSession({ ...session, ...patch, draftRevisions, ...(currentDraftRevisionId ? { currentDraftRevisionId } : {}), status, version: session.version + 1, updatedAt: at.toISOString(), ...(event ? { events: [...session.events, event] } : {}) });
}

export function abandonCreationSession(session: CreationSession, expectedVersion: number, at = new Date()): CreationSession {
  if (session.status === "CREATED") throw creationError("CREATION_SESSION_ALREADY_CREATED", "已创建会话不能改为已放弃。");
  if (session.status === "ABANDONED") return structuredClone(session);
  if (session.version !== expectedVersion) throw creationError("CREATION_SESSION_VERSION_CONFLICT", "Creation Session 已变化；没有放弃旧版本。");
  const timestamp = at.toISOString();
  return validateCreationSession({ ...session, status: "ABANDONED", version: session.version + 1, updatedAt: timestamp, events: [...session.events, { eventId: createId("creation_event", at), kind: "ABANDONED", occurredAt: timestamp, summary: "用户放弃创建会话" }] });
}

export function completeCreationSession(session: CreationSession, result: CreationResult, expectedVersion: number, at = new Date()): CreationSession {
  if (session.version !== expectedVersion) throw creationError("CREATION_SESSION_VERSION_CONFLICT", "Creation Session 已变化；创建结果没有绑定到旧版本。");
  if (session.status !== "PREVIEW_READY" || !session.currentDraftRevisionId || !session.placementPlan) throw creationError("CREATION_SESSION_NOT_READY", "Creation Session 缺少已采用草稿或 Placement，不能标记已创建。");
  if (session.sources.some((source) => source.kind !== "BLANK" && (source.availability !== "AVAILABLE" || source.latestKnownHash !== sourceCurrentCapture(source).snapshotHash))) throw creationError("CREATION_SESSION_SOURCE_NOT_CURRENT", "来源已变化、删除或不可解析；正式创建前必须重新读取并明确处理。");
  const timestamp = at.toISOString();
  return validateCreationSession({ ...session, status: "CREATED", creationResult: result, version: session.version + 1, updatedAt: timestamp, events: [...session.events, { eventId: createId("creation_event", at), kind: "CREATED", occurredAt: timestamp, summary: "正式对象已通过 Semantic Commit 创建" }] });
}
