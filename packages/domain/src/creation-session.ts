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

export interface CreationSourceChangeSummary {
  added: number;
  modified: number;
  deleted: number;
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
  changeSummary?: CreationSourceChangeSummary;
}

export interface CreationRoundQuestion {
  questionId: string;
  uncertaintyId: string;
  text: string;
  rationale: string;
  recommendation: string;
  answerRequirement: string;
  evidenceRefs?: string[];
  alternativeImpact?: string;
  answerState: CreationAnswerState;
  userAnswer?: string;
}

export interface CreationSessionRound {
  roundId: string;
  theme: string;
  questions: CreationRoundQuestion[];
  userNarrativeAnswer?: string;
  providerStatus: "NOT_REQUESTED" | "REQUESTING" | "COMPLETED" | "FAILED" | "CANCELLED";
  agentSynthesis?: string;
  consensusDelta: string[];
  draftDelta: string[];
  unresolvedBranches: string[];
  abstentions: string[];
  summary?: {
    confirmed: string;
    unresolved: string;
    draftChange: string;
    nextSuggestion: string;
  };
  createdAt: string;
  completedAt?: string;
}

export interface CreationConsensusItem {
  consensusId: string;
  uncertaintyId?: string;
  text: string;
  provenance: CreationConsensusProvenance;
  evidenceRefs: string[];
  updatedAt: string;
}

export interface CreationDraftNode {
  nodeId: string;
  semanticKey: string;
  text: string;
  parentNodeId?: string;
  order: number;
  nodeType: "BLOCK" | "TODO" | "PAGE_SECTION";
  provenance: CreationDraftProvenance;
  sourceBlockUuid?: string;
  operation: CreationDraftOperation;
  userEdited: boolean;
  confirmed: boolean;
  evidenceRefs: string[];
}

export interface CreationDraftConflict {
  nodeId: string;
  kind: "USER_TEXT_PROTECTED" | "USER_STRUCTURE_PROTECTED" | "USER_NODE_RETAINED";
  summary: string;
  proposedText?: string;
}

export interface CreationDraftRevision {
  revisionId: string;
  generationIds: string[];
  reason: CreationRevisionReason;
  nodes: CreationDraftNode[];
  conflicts: CreationDraftConflict[];
  unusedMaterials: string[];
  warnings: string[];
  maturity: { level: "EARLY" | "WORKABLE" | "READY"; missing: string[] };
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
    if (source.changeSummary) {
      const counts = [source.changeSummary.added, source.changeSummary.modified, source.changeSummary.deleted];
      if (source.availability === "AVAILABLE" || counts.some((count) => !Number.isSafeInteger(count) || count < 0 || count > 256)) throw creationError("CREATION_SESSION_SOURCE_CHANGE_INVALID", "来源变化摘要必须有界且只属于非当前来源。");
    }
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

function clearSourceChangeSummary(source: CreationSessionSource): CreationSessionSource {
  const current = { ...source };
  delete current.changeSummary;
  return current;
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
    boundedText(question.answerRequirement, "回答要求", 800);
    boundedText(question.alternativeImpact, "另一选择影响", 1_200, true);
    if (question.evidenceRefs && (question.evidenceRefs.length > 16 || question.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 256))) throw creationError("CREATION_SESSION_QUESTION_EVIDENCE_INVALID", "问题证据引用无效或超界。");
    if (!CREATION_ANSWER_STATES.includes(question.answerState)) throw creationError("CREATION_SESSION_ANSWER_STATE_INVALID", "问题回答状态无效。");
    if (["ANSWERED", "ACCEPTED_RECOMMENDATION"].includes(question.answerState) && !question.userAnswer?.trim()) throw creationError("CREATION_SESSION_ANSWER_REQUIRED", "已回答或已接受推荐的问题必须保存明确答案。");
    if (question.answerState === "UNANSWERED" && question.userAnswer !== undefined) throw creationError("CREATION_SESSION_UNANSWERED_HAS_VALUE", "未回答的问题不能静默保存答案。");
  }
  if (!["NOT_REQUESTED", "REQUESTING", "COMPLETED", "FAILED", "CANCELLED"].includes(round.providerStatus)) throw creationError("CREATION_SESSION_PROVIDER_STATUS_INVALID", "轮次 Provider 状态无效。");
  boundedText(round.userNarrativeAnswer, "整轮自然语言回答", 8_000, true);
  if (round.consensusDelta.length > 64 || round.draftDelta.length > 32 || round.unresolvedBranches.length > 32 || round.abstentions.length > 32) throw creationError("CREATION_SESSION_ROUND_DELTA_TOO_LARGE", "轮次结果超出有界范围。");
  round.consensusDelta.forEach((value) => boundedText(value, "轮次共识引用", 128));
  round.draftDelta.forEach((value) => boundedText(value, "草稿变化", 1_000));
  round.unresolvedBranches.forEach((value) => boundedText(value, "未解决分支", 1_000));
  round.abstentions.forEach((value) => boundedText(value, "信息不足说明", 1_000));
  validTime(round.createdAt, "轮次创建时间");
  if (round.completedAt) validTime(round.completedAt, "轮次完成时间");
  if (round.summary) {
    boundedText(round.summary.confirmed, "本轮确认摘要", 2_000);
    boundedText(round.summary.unresolved, "待澄清摘要", 2_000);
    boundedText(round.summary.draftChange, "草稿变化摘要", 2_000);
    boundedText(round.summary.nextSuggestion, "下一轮建议", 1_000);
  }
}

function validateDraftRevision(revision: CreationDraftRevision): void {
  boundedText(revision.revisionId, "草稿 Revision ID", 128);
  if (revision.generationIds.length > 32 || new Set(revision.generationIds).size !== revision.generationIds.length) throw creationError("CREATION_SESSION_DRAFT_GENERATION_INVALID", "草稿生成 ID 必须不重复且有界。");
  revision.generationIds.forEach((generationId) => boundedText(generationId, "草稿生成 ID", 128));
  if (!CREATION_REVISION_REASONS.includes(revision.reason)) throw creationError("CREATION_SESSION_DRAFT_REASON_INVALID", "草稿 Revision 原因无效。");
  if (revision.nodes.length < 1 || revision.nodes.length > 256) throw creationError("CREATION_SESSION_DRAFT_NODE_LIMIT", "草稿必须包含 1 至 256 个节点。");
  if (new Set(revision.nodes.map(({ nodeId }) => nodeId)).size !== revision.nodes.length || new Set(revision.nodes.map(({ semanticKey }) => semanticKey)).size !== revision.nodes.length) throw creationError("CREATION_SESSION_DRAFT_NODE_DUPLICATE", "草稿节点身份或语义键不能重复。");
  const nodeIds = new Set(revision.nodes.map(({ nodeId }) => nodeId));
  const siblingOrders = new Set<string>();
  for (const node of revision.nodes) {
    boundedText(node.nodeId, "草稿节点 ID", 128);
    boundedText(node.semanticKey, "草稿节点语义键", 128);
    boundedText(node.text, "草稿节点文本", 8_000);
    if (node.parentNodeId && (!nodeIds.has(node.parentNodeId) || node.parentNodeId === node.nodeId)) throw creationError("CREATION_SESSION_DRAFT_PARENT_INVALID", "草稿父节点不存在或形成自引用。");
    if (!Number.isSafeInteger(node.order) || node.order < 0 || node.order > 255 || siblingOrders.has(`${node.parentNodeId ?? "ROOT"}:${node.order}`)) throw creationError("CREATION_SESSION_DRAFT_ORDER_INVALID", "同级草稿节点顺序必须唯一且有界。");
    siblingOrders.add(`${node.parentNodeId ?? "ROOT"}:${node.order}`);
    if (!["BLOCK", "TODO", "PAGE_SECTION"].includes(node.nodeType) || !CREATION_DRAFT_PROVENANCE.includes(node.provenance) || !CREATION_DRAFT_OPERATIONS.includes(node.operation)) throw creationError("CREATION_SESSION_DRAFT_NODE_INVALID", "草稿节点类型、来源或操作计划无效。");
    if (node.nodeType === "TODO" && !/^TODO\s+/u.test(node.text)) throw creationError("CREATION_SESSION_DRAFT_TODO_INVALID", "TODO 草稿节点必须使用原生 TODO 前缀。");
    boundedText(node.sourceBlockUuid, "来源 Block UUID", 256, true);
    if (node.operation !== "CREATE" && !node.sourceBlockUuid) throw creationError("CREATION_SESSION_DRAFT_SOURCE_REQUIRED", "KEEP、MOVE 或 REWRITE 必须关联来源 Block UUID。");
    if (node.userEdited && (node.provenance !== "USER_EDITED" || !node.confirmed)) throw creationError("CREATION_SESSION_DRAFT_EDIT_AUTHORITY_INVALID", "用户编辑节点必须保留 USER_EDITED 与已确认权威。");
    if (node.evidenceRefs.length > 32 || node.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 256)) throw creationError("CREATION_SESSION_DRAFT_EVIDENCE_INVALID", "草稿节点证据引用无效或超界。");
  }
  if (revision.nodes.filter(({ parentNodeId }) => !parentNodeId).length !== 1) throw creationError("CREATION_SESSION_DRAFT_ROOT_INVALID", "草稿必须且只能有一个稳定根节点。");
  for (const node of revision.nodes) {
    let cursor: CreationDraftNode | undefined = node;
    const seen = new Set<string>();
    while (cursor?.parentNodeId) {
      if (seen.has(cursor.parentNodeId) || seen.size >= 16) throw creationError("CREATION_SESSION_DRAFT_CYCLE", "草稿树存在循环或超过 16 层。");
      seen.add(cursor.parentNodeId);
      cursor = revision.nodes.find(({ nodeId }) => nodeId === cursor!.parentNodeId);
    }
  }
  if (revision.conflicts.length > 64 || revision.unusedMaterials.length > 64 || revision.warnings.length > 32 || revision.maturity.missing.length > 32 || !["EARLY", "WORKABLE", "READY"].includes(revision.maturity.level)) throw creationError("CREATION_SESSION_DRAFT_METADATA_INVALID", "草稿冲突、未采用材料、警告或成熟度超出有界范围。");
  for (const conflict of revision.conflicts) {
    if (!nodeIds.has(conflict.nodeId) || !["USER_TEXT_PROTECTED", "USER_STRUCTURE_PROTECTED", "USER_NODE_RETAINED"].includes(conflict.kind)) throw creationError("CREATION_SESSION_DRAFT_CONFLICT_INVALID", "草稿冲突必须指向保留的节点。");
    boundedText(conflict.summary, "草稿冲突摘要", 1_000);
    boundedText(conflict.proposedText, "被拒绝的建议文本", 8_000, true);
  }
  revision.unusedMaterials.forEach((value) => boundedText(value, "未采用材料", 1_000));
  revision.warnings.forEach((value) => boundedText(value, "草稿警告", 1_000));
  revision.maturity.missing.forEach((value) => boundedText(value, "草稿缺口", 1_000));
  validTime(revision.createdAt, "草稿创建时间");
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
  if (new Set(session.consensus.map(({ consensusId }) => consensusId)).size !== session.consensus.length) throw creationError("CREATION_SESSION_CONSENSUS_DUPLICATE", "Creation Session 共识身份不能重复。");
  for (const item of session.consensus) {
    boundedText(item.consensusId, "共识 ID", 128);
    boundedText(item.uncertaintyId, "未知分支 ID", 128, true);
    boundedText(item.text, "共识文本", 4_000);
    if (!CREATION_CONSENSUS_PROVENANCE.includes(item.provenance) || item.evidenceRefs.length > 32 || item.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 256)) throw creationError("CREATION_SESSION_CONSENSUS_INVALID", "Creation Session 共识来源或证据引用无效。");
    validTime(item.updatedAt, "共识更新时间");
  }
  const revisionIds = new Set(session.draftRevisions.map(({ revisionId }) => revisionId));
  if (session.currentDraftRevisionId && !revisionIds.has(session.currentDraftRevisionId)) throw creationError("CREATION_SESSION_DRAFT_CURRENT_INVALID", "当前草稿必须指向已保存的重要 Revision。");
  session.draftRevisions.forEach(validateDraftRevision);
  const currentRevision = session.currentDraftRevisionId ? session.draftRevisions.find(({ revisionId }) => revisionId === session.currentDraftRevisionId) : undefined;
  if (currentRevision && !currentRevision.adopted) throw creationError("CREATION_SESSION_DRAFT_NOT_ADOPTED", "当前草稿必须是明确采用的 Revision。");
  const generationIds = session.draftRevisions.flatMap((revision) => revision.generationIds);
  if (new Set(generationIds).size !== generationIds.length) throw creationError("CREATION_SESSION_DRAFT_GENERATION_DUPLICATE", "草稿生成请求不能产生重复 Revision。");
  if (session.status === "CREATED" && !session.creationResult) throw creationError("CREATION_SESSION_RESULT_REQUIRED", "已创建会话必须关联正式对象和 Commit。");
  if (session.status !== "CREATED" && session.creationResult) throw creationError("CREATION_SESSION_RESULT_PREMATURE", "正式创建前不能写入创建结果。");
  if (session.creationResult) {
    boundedText(session.creationResult.objectId, "创建结果对象 ID", 128);
    boundedText(session.creationResult.semanticCommitId, "创建结果 Semantic Commit ID", 128);
    validTime(session.creationResult.createdAt, "创建结果时间");
    if (session.creationResult.undoneAt) validTime(session.creationResult.undoneAt, "创建结果 Undo 时间");
  }
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

export function observeCreationSessionSource(session: CreationSession, sourceId: string, observation: { latestKnownHash?: string; availability: CreationSessionSource["availability"]; changeSummary?: CreationSourceChangeSummary }, expectedVersion: number, at = new Date()): CreationSession {
  const source = session.sources.find((candidate) => candidate.sourceId === sourceId);
  if (!source) throw creationError("CREATION_SESSION_SOURCE_NOT_FOUND", "Creation Session 来源不存在。");
  if (source.kind === "BLANK") throw creationError("CREATION_SESSION_BLANK_OBSERVATION_INVALID", "空白来源不需要 Graph 变化检查。");
  const latestKnownHash = observation.latestKnownHash ?? source.latestKnownHash;
  const availability = observation.availability;
  const timestamp = at.toISOString();
  const changeSummary = availability === "AVAILABLE" ? undefined : observation.changeSummary;
  const changed = availability !== source.availability || latestKnownHash !== source.latestKnownHash || JSON.stringify(changeSummary) !== JSON.stringify(source.changeSummary);
  if (!changed) return structuredClone(session);
  return updateCreationSession(session, {
    sources: session.sources.map((candidate) => {
      if (candidate.sourceId !== sourceId) return candidate;
      const observed = { ...candidate, latestKnownHash, availability };
      return changeSummary ? { ...observed, changeSummary } : clearSourceChangeSummary(observed);
    }),
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
  const affectedCaptureRefs = new Set([
    priorCapture.captureId,
    `${source.sourceId}:${priorCapture.captureId}`,
    `source:${source.sourceId}:${priorCapture.captureId}`,
  ]);
  const consensus = session.consensus.map((item) => item.evidenceRefs.some((ref) => affectedCaptureRefs.has(ref)) && item.provenance === "SOURCE_FACT" ? { ...item, provenance: "CONFLICT" as const, updatedAt: at.toISOString() } : item);
  const timestamp = at.toISOString();
  return updateCreationSession(session, {
    sources: session.sources.map((candidate) => candidate.sourceId === sourceId ? clearSourceChangeSummary({ ...candidate, captures: [...candidate.captures, capture], currentCaptureId: capture.captureId, latestKnownHash: capture.snapshotHash, availability: "AVAILABLE" }) : candidate),
    consensus,
  }, expectedVersion, at, {
    eventId: createId("creation_event", at), kind: "SOURCE_REFRESHED", occurredAt: timestamp, summary: "用户纳入最新来源；旧共识依据和用户草稿均已保留",
  });
}

export function captureCreationSessionSourcesForDraft(session: CreationSession, captures: Array<{ sourceId: string; capture: CreationSourceCapture }>, expectedVersion: number, at = new Date()): CreationSession {
  const captureBySource = new Map(captures.map((item) => [item.sourceId, item.capture]));
  if (captureBySource.size !== captures.length || captures.some(({ sourceId }) => !session.sources.some((source) => source.sourceId === sourceId && source.kind !== "BLANK"))) throw creationError("CREATION_SESSION_DRAFT_CAPTURE_INVALID", "Draft 生成快照必须逐一对应当前 Graph 来源。");
  const graphSources = session.sources.filter(({ kind }) => kind !== "BLANK");
  if (captures.length !== graphSources.length) throw creationError("CREATION_SESSION_DRAFT_CAPTURE_INCOMPLETE", "生成 Draft 前必须重验所有 Graph 来源。");
  const sources = session.sources.map((source) => {
    if (source.kind === "BLANK") return source;
    const capture = captureBySource.get(source.sourceId)!;
    const current = sourceCurrentCapture(source);
    if (capture.reason !== "DRAFT_GENERATION" || capture.snapshotHash !== current.snapshotHash || source.latestKnownHash !== current.snapshotHash || source.availability !== "AVAILABLE") throw creationError("CREATION_SESSION_DRAFT_SOURCE_CHANGED", "来源已变化或不可用；必须先显式纳入最新内容。");
    const all = [...source.captures, capture];
    const retainedIds = new Set<string>([all[0]!.captureId, capture.captureId]);
    for (let index = all.length - 1; index >= 0 && retainedIds.size < 8; index -= 1) retainedIds.add(all[index]!.captureId);
    const retained = all.filter(({ captureId }) => retainedIds.has(captureId));
    return { ...source, captures: retained, currentCaptureId: capture.captureId, latestKnownHash: capture.snapshotHash, availability: "AVAILABLE" as const };
  });
  const timestamp = at.toISOString();
  return updateCreationSession(session, { sources }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "SOURCE_CAPTURED", occurredAt: timestamp, summary: "生成 Draft 前已保存并锁定重要来源快照" });
}

export function captureCreationSessionSourcesForCommit(session: CreationSession, captures: Array<{ sourceId: string; capture: CreationSourceCapture }>, expectedVersion: number, at = new Date()): CreationSession {
  const captureBySource = new Map(captures.map((item) => [item.sourceId, item.capture]));
  if (captureBySource.size !== captures.length) throw creationError("CREATION_SESSION_PRE_COMMIT_CAPTURE_INVALID", "正式创建快照不能重复引用来源。");
  const graphSources = session.sources.filter(({ kind }) => kind !== "BLANK");
  if (captures.length !== graphSources.length || captures.some(({ sourceId }) => !graphSources.some((source) => source.sourceId === sourceId))) throw creationError("CREATION_SESSION_PRE_COMMIT_CAPTURE_INCOMPLETE", "正式创建前必须重读全部 Graph 来源。");
  const sources = session.sources.map((source) => {
    if (source.kind === "BLANK") return source;
    const capture = captureBySource.get(source.sourceId)!;
    const current = sourceCurrentCapture(source);
    if (capture.reason !== "PRE_COMMIT" || capture.snapshotHash !== current.snapshotHash || source.latestKnownHash !== current.snapshotHash || source.availability !== "AVAILABLE") throw creationError("CREATION_SESSION_PRE_COMMIT_SOURCE_CHANGED", "来源已变化或不可用；必须先显式纳入最新内容并重新审阅 Draft。");
    const all = [...source.captures, capture];
    const retainedIds = new Set<string>([all[0]!.captureId, capture.captureId]);
    for (let index = all.length - 1; index >= 0 && retainedIds.size < 8; index -= 1) retainedIds.add(all[index]!.captureId);
    const retained = all.filter(({ captureId }) => retainedIds.has(captureId));
    return { ...source, captures: retained, currentCaptureId: capture.captureId, latestKnownHash: capture.snapshotHash, availability: "AVAILABLE" as const };
  });
  const timestamp = at.toISOString();
  return updateCreationSession(session, { sources }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "CREATE_CONFIRMED", occurredAt: timestamp, summary: "正式 Proposal 前已重读并冻结全部来源" });
}

export interface CreationRoundAnswerInput {
  questionId: string;
  answerState: CreationAnswerState;
  userAnswer?: string;
}

export interface CreationRoundCompletion {
  agentSynthesis: string;
  consensus: Array<Omit<CreationConsensusItem, "consensusId" | "updatedAt">>;
  draftDelta: string[];
  unresolvedBranches: string[];
  abstentions: string[];
  summary: NonNullable<CreationSessionRound["summary"]>;
  nextRound?: Omit<CreationSessionRound, "providerStatus" | "consensusDelta" | "draftDelta" | "createdAt">;
}

export function startCreationSessionRound(session: CreationSession, round: Omit<CreationSessionRound, "providerStatus" | "consensusDelta" | "draftDelta" | "createdAt">, expectedVersion: number, at = new Date()): CreationSession {
  if (session.rounds.length > 0) throw creationError("CREATION_SESSION_INITIAL_ROUND_EXISTS", "首轮已经存在；后续轮次必须处理上一轮回答。");
  const timestamp = at.toISOString();
  return updateCreationSession(session, { rounds: [{ ...round, questions: round.questions.map((question) => ({ ...question, answerState: "UNANSWERED" })), providerStatus: "NOT_REQUESTED", consensusDelta: [], draftDelta: [], createdAt: timestamp }] }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "ROUND_COMPLETED", occurredAt: timestamp, summary: "已生成第一轮相关问题" });
}

export function submitCreationRoundAnswers(session: CreationSession, roundId: string, answers: CreationRoundAnswerInput[], expectedVersion: number, at = new Date(), narrativeAnswer?: string): CreationSession {
  const round = session.rounds.find((candidate) => candidate.roundId === roundId);
  if (!round) throw creationError("CREATION_SESSION_ROUND_NOT_FOUND", "Creation Session 轮次不存在。");
  if (round.providerStatus !== "NOT_REQUESTED") throw creationError("CREATION_SESSION_ROUND_ALREADY_SUBMITTED", "本轮已经提交；不能用另一组答案覆盖。");
  if (answers.length !== round.questions.length || new Set(answers.map(({ questionId }) => questionId)).size !== answers.length || answers.some(({ questionId }) => !round.questions.some((question) => question.questionId === questionId))) throw creationError("CREATION_SESSION_ROUND_ANSWERS_INCOMPLETE", "提交一轮时必须逐题保存明确状态；未回答也必须显式标记。");
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const userNarrativeAnswer = narrativeAnswer === undefined ? undefined : boundedText(narrativeAnswer, "整轮自然语言回答", 8_000)!;
  const questions = round.questions.map((question) => {
    const answer = answerByQuestion.get(question.questionId)!;
    if (answer.answerState === "ACCEPTED_RECOMMENDATION") return { ...question, answerState: answer.answerState, userAnswer: question.recommendation };
    if (answer.answerState === "ANSWERED" && answer.userAnswer?.trim()) return { ...question, answerState: answer.answerState, userAnswer: answer.userAnswer.trim() };
    if (["SKIPPED", "UNCERTAIN", "UNANSWERED"].includes(answer.answerState) && (!answer.userAnswer || answer.answerState === "UNCERTAIN")) return { ...question, answerState: answer.answerState, ...(answer.userAnswer?.trim() ? { userAnswer: answer.userAnswer.trim() } : {}) };
    throw creationError("CREATION_SESSION_ROUND_ANSWER_INVALID", "每题回答必须与显式状态一致。");
  });
  const timestamp = at.toISOString();
  return updateCreationSession(session, { rounds: session.rounds.map((candidate) => candidate.roundId === roundId ? { ...candidate, questions, ...(userNarrativeAnswer ? { userNarrativeAnswer } : {}), providerStatus: "REQUESTING" } : candidate) }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "ROUND_SUBMITTED", occurredAt: timestamp, summary: userNarrativeAnswer ? "用户整轮回答已先保存，正在整理下一轮" : "用户回答已先保存，正在整理下一轮" });
}

export function completeCreationRound(session: CreationSession, roundId: string, completion: CreationRoundCompletion, expectedVersion: number, at = new Date()): CreationSession {
  const round = session.rounds.find((candidate) => candidate.roundId === roundId);
  if (!round || round.providerStatus !== "REQUESTING") throw creationError("CREATION_SESSION_ROUND_NOT_REQUESTING", "本轮没有等待中的 Provider 请求。");
  boundedText(completion.agentSynthesis, "本轮归纳", 4_000);
  if (completion.consensus.length > 32 || completion.draftDelta.length > 32) throw creationError("CREATION_SESSION_ROUND_DELTA_TOO_LARGE", "本轮共识或草稿变化超出有界范围。");
  const timestamp = at.toISOString();
  const questionConsensus: CreationConsensusItem[] = round.questions.filter((question) => !round.userNarrativeAnswer || question.answerState !== "UNANSWERED").map((question) => ({
    consensusId: createId("creation", at),
    uncertaintyId: question.uncertaintyId,
    text: question.answerState === "SKIPPED" ? `已跳过：${question.text}` : question.answerState === "UNCERTAIN" || question.answerState === "UNANSWERED" ? `仍待确认：${question.text}` : question.userAnswer!,
    provenance: question.answerState === "SKIPPED" ? "SKIPPED" : question.answerState === "UNCERTAIN" || question.answerState === "UNANSWERED" ? "UNKNOWN" : "USER_CONFIRMED",
    evidenceRefs: [`answer:${roundId}:${question.questionId}`],
    updatedAt: timestamp,
  }));
  const narrativeConsensus: CreationConsensusItem[] = round.userNarrativeAnswer ? [{
    consensusId: createId("creation", at),
    text: `用户整轮回答：${round.userNarrativeAnswer}`,
    provenance: "USER_CONFIRMED",
    evidenceRefs: [`answer:${roundId}:narrative`],
    updatedAt: timestamp,
  }] : [];
  const answerConsensus = [...questionConsensus, ...narrativeConsensus];
  const providerConsensus: CreationConsensusItem[] = completion.consensus.map((item) => ({ ...item, consensusId: createId("creation", at), updatedAt: timestamp }));
  const consensusIds = [...answerConsensus, ...providerConsensus].map(({ consensusId }) => consensusId);
  const completedRound = { ...round, providerStatus: "COMPLETED" as const, agentSynthesis: completion.agentSynthesis, consensusDelta: consensusIds, draftDelta: [...completion.draftDelta], unresolvedBranches: [...completion.unresolvedBranches], abstentions: [...completion.abstentions], summary: completion.summary, completedAt: timestamp };
  let rounds = session.rounds.map((candidate) => candidate.roundId === roundId ? completedRound : candidate);
  if (completion.nextRound) {
    const resolvedUncertainties = new Set(round.questions.filter(({ answerState }) => ["ANSWERED", "ACCEPTED_RECOMMENDATION"].includes(answerState)).map(({ uncertaintyId }) => uncertaintyId));
    if (completion.nextRound.questions.some(({ uncertaintyId }) => resolvedUncertainties.has(uncertaintyId))) throw creationError("CREATION_SESSION_REPEATED_RESOLVED_QUESTION", "Provider 重复询问了本轮已经明确回答的问题。");
    rounds = [...rounds, { ...completion.nextRound, questions: completion.nextRound.questions.map((question) => ({ ...question, answerState: "UNANSWERED" as const })), providerStatus: "NOT_REQUESTED", consensusDelta: [], draftDelta: [], createdAt: timestamp }];
  }
  return updateCreationSession(session, { rounds, consensus: [...session.consensus, ...answerConsensus, ...providerConsensus] }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "ROUND_COMPLETED", occurredAt: timestamp, summary: completion.nextRound ? "本轮已整理并生成下一轮" : "本轮已整理，可生成当前草稿" });
}

export function failCreationRound(session: CreationSession, roundId: string, status: "FAILED" | "CANCELLED", expectedVersion: number, at = new Date()): CreationSession {
  const round = session.rounds.find((candidate) => candidate.roundId === roundId);
  if (!round || round.providerStatus !== "REQUESTING") throw creationError("CREATION_SESSION_ROUND_NOT_REQUESTING", "本轮没有等待中的 Provider 请求。");
  const timestamp = at.toISOString();
  return updateCreationSession(session, { rounds: session.rounds.map((candidate) => candidate.roundId === roundId ? { ...candidate, providerStatus: status } : candidate) }, expectedVersion, at, { eventId: createId("creation_event", at), kind: status === "FAILED" ? "ROUND_FAILED" : "ROUND_FAILED", occurredAt: timestamp, summary: status === "FAILED" ? "Provider 失败；回答与稳定草稿已保留" : "用户离开或取消请求；回答已保留" });
}

export function retryCreationRound(session: CreationSession, roundId: string, expectedVersion: number, at = new Date()): CreationSession {
  const round = session.rounds.find((candidate) => candidate.roundId === roundId);
  if (!round || !["FAILED", "CANCELLED"].includes(round.providerStatus)) throw creationError("CREATION_SESSION_ROUND_RETRY_INVALID", "只有失败或取消的已回答轮次可以重试。");
  return updateCreationSession(session, { rounds: session.rounds.map((candidate) => candidate.roundId === roundId ? { ...candidate, providerStatus: "REQUESTING" } : candidate) }, expectedVersion, at);
}

export interface CreationGeneratedDraftNode {
  semanticKey: string;
  text: string;
  parentSemanticKey?: string;
  order: number;
  nodeType: CreationDraftNode["nodeType"];
  provenance: CreationDraftProvenance;
  sourceBlockUuid?: string;
  operation: CreationDraftOperation;
  confirmed: boolean;
  evidenceRefs: string[];
}

export interface CreationDraftGenerationInput {
  generationId: string;
  reason: Extract<CreationRevisionReason, "INITIAL_DRAFT" | "STRUCTURE_EDIT" | "SOURCE_REFRESH" | "TARGET_TYPE_CHANGE">;
  suggestedObjectTitle?: string;
  nodes: CreationGeneratedDraftNode[];
  unusedMaterials: string[];
  warnings: string[];
  maturity: CreationDraftRevision["maturity"];
}

function normalizeDraftOrders(nodes: CreationDraftNode[]): CreationDraftNode[] {
  const byParent = new Map<string, CreationDraftNode[]>();
  for (const node of nodes) {
    const key = node.parentNodeId ?? "ROOT";
    byParent.set(key, [...(byParent.get(key) ?? []), node]);
  }
  const normalized = new Map<string, CreationDraftNode>();
  for (const siblings of byParent.values()) {
    const protectedOrders = new Set(siblings.filter(({ userEdited }) => userEdited).map(({ order }) => order));
    const occupied = new Set<number>();
    for (const node of siblings.filter(({ userEdited }) => userEdited)) {
      occupied.add(node.order);
      normalized.set(node.nodeId, node);
    }
    for (const node of siblings.filter(({ userEdited }) => !userEdited).sort((left, right) => left.order - right.order || left.semanticKey.localeCompare(right.semanticKey))) {
      let order = node.order;
      while (occupied.has(order) || protectedOrders.has(order)) order += 1;
      if (order > 255) throw creationError("CREATION_SESSION_DRAFT_ORDER_EXHAUSTED", "草稿同级节点过多，无法保留用户顺序。");
      occupied.add(order);
      normalized.set(node.nodeId, { ...node, order });
    }
  }
  return nodes.map((node) => normalized.get(node.nodeId)!);
}

export function generateCreationDraftRevision(session: CreationSession, input: CreationDraftGenerationInput, expectedVersion: number, at = new Date()): CreationSession {
  boundedText(input.generationId, "草稿生成 ID", 128);
  const replay = session.draftRevisions.find(({ generationIds: ids }) => ids.includes(input.generationId));
  if (replay) return structuredClone(session);
  if (session.version !== expectedVersion) throw creationError("CREATION_SESSION_VERSION_CONFLICT", "Creation Session 已变化；草稿没有覆盖新内容。");
  if (input.nodes.length < 1 || input.nodes.length > 256 || new Set(input.nodes.map(({ semanticKey }) => semanticKey)).size !== input.nodes.length) throw creationError("CREATION_SESSION_DRAFT_GENERATION_INVALID", "Provider 草稿节点为空、重复或超界。");
  const current = session.currentDraftRevisionId ? session.draftRevisions.find(({ revisionId }) => revisionId === session.currentDraftRevisionId) : undefined;
  const existingByKey = new Map((current?.nodes ?? []).map((node) => [node.semanticKey, node]));
  const generatedKeys = new Set(input.nodes.map(({ semanticKey }) => semanticKey));
  const omittedProtected = (current?.nodes ?? []).filter(({ userEdited, semanticKey }) => userEdited && !generatedKeys.has(semanticKey));
  if (omittedProtected.length) throw creationError("CREATION_SESSION_DRAFT_USER_NODE_OMITTED", "Provider 草稿遗漏了用户编辑节点；最后稳定草稿保持不变。");
  const idByKey = new Map(input.nodes.map((node) => [node.semanticKey, existingByKey.get(node.semanticKey)?.nodeId ?? createId("creation", at)]));
  const conflicts: CreationDraftConflict[] = [];
  const nodes = input.nodes.map((proposed): CreationDraftNode => {
    boundedText(proposed.semanticKey, "草稿语义键", 128);
    const parentNodeId = proposed.parentSemanticKey ? idByKey.get(proposed.parentSemanticKey) : undefined;
    if (proposed.parentSemanticKey && !parentNodeId) throw creationError("CREATION_SESSION_DRAFT_PARENT_INVALID", "Provider 草稿父语义键不存在。");
    const existing = existingByKey.get(proposed.semanticKey);
    if (existing?.userEdited) {
      if (existing.text !== proposed.text) conflicts.push({ nodeId: existing.nodeId, kind: "USER_TEXT_PROTECTED", summary: "Agent 建议改写此节点；已保留用户文本。", proposedText: proposed.text });
      if (existing.parentNodeId !== parentNodeId || existing.order !== proposed.order || existing.nodeType !== proposed.nodeType || existing.operation !== proposed.operation || existing.sourceBlockUuid !== proposed.sourceBlockUuid) conflicts.push({ nodeId: existing.nodeId, kind: "USER_STRUCTURE_PROTECTED", summary: "Agent 建议调整此节点结构或操作计划；已保留用户选择。" });
      return structuredClone(existing);
    }
    return {
      nodeId: idByKey.get(proposed.semanticKey)!, semanticKey: proposed.semanticKey, text: proposed.text,
      ...(parentNodeId ? { parentNodeId } : {}), order: proposed.order, nodeType: proposed.nodeType,
      provenance: proposed.provenance, ...(proposed.sourceBlockUuid ? { sourceBlockUuid: proposed.sourceBlockUuid } : {}),
      operation: proposed.operation, userEdited: false, confirmed: proposed.confirmed, evidenceRefs: [...proposed.evidenceRefs],
    };
  });
  const timestamp = at.toISOString();
  const sourceRefreshedAfterCurrent = Boolean(current && session.sources.some((source) => {
    return source.captures.some((capture) => capture.reason === "USER_REFRESH" && Date.parse(capture.capturedAt) > Date.parse(current.createdAt));
  }));
  const consolidate = Boolean(current && current.generationIds.length && !current.nodes.some(({ userEdited }) => userEdited) && !sourceRefreshedAfterCurrent && !current.final);
  const revision: CreationDraftRevision = {
    revisionId: consolidate ? current!.revisionId : createId("creation", at),
    generationIds: consolidate ? [...current!.generationIds, input.generationId] : [input.generationId],
    reason: !current ? "INITIAL_DRAFT" : sourceRefreshedAfterCurrent ? "SOURCE_REFRESH" : input.reason,
    nodes: normalizeDraftOrders(nodes), conflicts, unusedMaterials: [...input.unusedMaterials], warnings: [...input.warnings], maturity: structuredClone(input.maturity),
    adopted: true, final: false, createdAt: timestamp,
  };
  return updateCreationSession(session, {
    ...(input.suggestedObjectTitle?.trim() ? { suggestedObjectTitle: input.suggestedObjectTitle.trim() } : {}),
    draftRevisions: consolidate ? session.draftRevisions.map((candidate) => candidate.revisionId === current!.revisionId ? revision : candidate) : [...session.draftRevisions, revision], currentDraftRevisionId: revision.revisionId,
  }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "DRAFT_GENERATED", occurredAt: timestamp, summary: conflicts.length ? `已生成草稿并保留 ${conflicts.length} 项用户编辑` : "已生成当前 Draft Tree" });
}

export interface CreationDraftNodeEdit {
  nodeId: string;
  text?: string;
  delete?: boolean;
  parentNodeId?: string | null;
  order?: number;
  move?: "UP" | "DOWN";
}

export function editCreationDraftNode(session: CreationSession, revisionId: string, edit: CreationDraftNodeEdit, expectedVersion: number, at = new Date()): CreationSession {
  if (session.currentDraftRevisionId !== revisionId) throw creationError("CREATION_SESSION_DRAFT_STALE", "只能编辑当前采用的 Draft Revision。");
  const current = session.draftRevisions.find((revision) => revision.revisionId === revisionId)!;
  const target = current.nodes.find(({ nodeId }) => nodeId === edit.nodeId);
  if (!target) throw creationError("CREATION_SESSION_DRAFT_NODE_NOT_FOUND", "草稿节点不存在。");
  const changedFields = [edit.text !== undefined, edit.delete === true, edit.parentNodeId !== undefined, edit.order !== undefined, edit.move !== undefined].filter(Boolean).length;
  if (changedFields < 1 || (edit.delete || edit.move) && changedFields > 1) throw creationError("CREATION_SESSION_DRAFT_EDIT_INVALID", "草稿编辑必须明确，删除或同级移动不能与其他变化合并提交。");
  let nodes = current.nodes.map((node) => structuredClone(node));
  let reason: CreationRevisionReason = "STRUCTURE_EDIT";
  if (edit.delete) {
    if (target.parentNodeId === undefined || target.operation !== "CREATE" || !["AGENT_SYNTHESIS", "AGENT_SUGGESTION", "UNCONFIRMED"].includes(target.provenance) || nodes.some(({ parentNodeId }) => parentNodeId === target.nodeId)) throw creationError("CREATION_SESSION_DRAFT_DELETE_FORBIDDEN", "只能删除没有子节点的 Agent 新建节点。");
    nodes = nodes.filter(({ nodeId }) => nodeId !== target.nodeId);
  } else if (edit.move) {
    const siblings = nodes.filter(({ parentNodeId }) => parentNodeId === target.parentNodeId).sort((left, right) => left.order - right.order);
    const index = siblings.findIndex(({ nodeId }) => nodeId === target.nodeId);
    const adjacent = siblings[index + (edit.move === "UP" ? -1 : 1)];
    if (!adjacent) throw creationError("CREATION_SESSION_DRAFT_MOVE_BOUNDARY", "草稿节点已在当前同级边界。");
    nodes = nodes.map((node) => node.nodeId === target.nodeId
      ? { ...node, order: adjacent.order, provenance: "USER_EDITED" as const, userEdited: true, confirmed: true, evidenceRefs: [...new Set([...node.evidenceRefs, `draft-edit:${revisionId}:${node.nodeId}`])] }
      : node.nodeId === adjacent.nodeId ? { ...node, order: target.order } : node);
  } else {
    if (edit.parentNodeId === null && target.parentNodeId !== undefined) throw creationError("CREATION_SESSION_DRAFT_SECOND_ROOT", "不能把普通节点提升为第二个草稿根节点。");
    if (edit.parentNodeId && !nodes.some(({ nodeId }) => nodeId === edit.parentNodeId)) throw creationError("CREATION_SESSION_DRAFT_PARENT_INVALID", "新的草稿父节点不存在。");
    nodes = nodes.map((node) => node.nodeId === target.nodeId ? {
      ...node,
      ...(edit.text !== undefined ? { text: boundedText(edit.text, "用户草稿文本", 8_000)! } : {}),
      ...(edit.parentNodeId !== undefined ? (edit.parentNodeId ? { parentNodeId: edit.parentNodeId } : {}) : {}),
      ...(edit.order !== undefined ? { order: edit.order } : {}),
      provenance: "USER_EDITED" as const, userEdited: true, confirmed: true,
      evidenceRefs: [...new Set([...node.evidenceRefs, `draft-edit:${revisionId}:${node.nodeId}`])],
    } : node);
    reason = edit.text !== undefined && edit.parentNodeId === undefined && edit.order === undefined ? "USER_EDIT" : "STRUCTURE_EDIT";
  }
  const timestamp = at.toISOString();
  const revision: CreationDraftRevision = {
    revisionId: createId("creation", at), generationIds: [], reason, nodes: normalizeDraftOrders(nodes),
    conflicts: structuredClone(current.conflicts), unusedMaterials: [...current.unusedMaterials], warnings: [...current.warnings], maturity: structuredClone(current.maturity),
    adopted: true, final: false, createdAt: timestamp,
  };
  return updateCreationSession(session, { draftRevisions: [...session.draftRevisions, revision], currentDraftRevisionId: revision.revisionId }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "DRAFT_EDITED", occurredAt: timestamp, summary: edit.delete ? "用户删除 Agent 新建草稿节点" : "用户直接编辑 Draft Tree" });
}

export function adoptCreationDraftRevision(session: CreationSession, revisionId: string, expectedVersion: number, at = new Date()): CreationSession {
  const selected = session.draftRevisions.find((revision) => revision.revisionId === revisionId);
  if (!selected) throw creationError("CREATION_SESSION_DRAFT_NOT_FOUND", "要采用的 Draft Revision 不存在。");
  const timestamp = at.toISOString();
  const adopted: CreationDraftRevision = {
    revisionId: createId("creation", at), generationIds: [], reason: "ADOPTED", nodes: structuredClone(selected.nodes),
    conflicts: structuredClone(selected.conflicts), unusedMaterials: [...selected.unusedMaterials], warnings: [...selected.warnings], maturity: structuredClone(selected.maturity),
    adopted: true, final: false, createdAt: timestamp,
  };
  return updateCreationSession(session, { draftRevisions: [...session.draftRevisions, adopted], currentDraftRevisionId: adopted.revisionId }, expectedVersion, at, { eventId: createId("creation_event", at), kind: "DRAFT_EDITED", occurredAt: timestamp, summary: "用户采用一版重要 Draft Revision" });
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

export function undoCreationSessionResult(session: CreationSession, objectId: string, semanticCommitId: string, expectedVersion: number, at = new Date()): CreationSession {
  if (session.version !== expectedVersion) throw creationError("CREATION_SESSION_VERSION_CONFLICT", "Creation Session 已变化；Undo 没有覆盖较新结果。");
  if (session.status !== "CREATED" || !session.creationResult || session.creationResult.objectId !== objectId || session.creationResult.semanticCommitId !== semanticCommitId) throw creationError("CREATION_SESSION_UNDO_RESULT_MISMATCH", "Undo 必须精确引用当前 Creation Session 创建结果。");
  if (session.creationResult.undoneAt) return structuredClone(session);
  const timestamp = at.toISOString();
  return validateCreationSession({
    ...session,
    creationResult: { ...session.creationResult, undoneAt: timestamp },
    version: session.version + 1,
    updatedAt: timestamp,
    events: [...session.events, { eventId: createId("creation_event", at), kind: "UNDONE", occurredAt: timestamp, summary: "正式创建已撤销；Creation Session 历史保留" }],
  });
}
