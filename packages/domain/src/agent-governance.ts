import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

export type AgentDecisionOutcome =
  | "CREATE_CANDIDATE"
  | "KEEP_ORDINARY"
  | "DEFER"
  | "UPDATE_EXISTING"
  | "CREATE_OBJECT"
  | "REVIEW_SIGNAL"
  | "NO_ACTION"
  | "NEEDS_HUMAN"
  | "NEEDS_MORE_CONTEXT";

export type AgentRiskRoute = "SHADOW" | "BATCH_REVIEW" | "DELAYED_APPLY" | "AUTO_APPLY" | "HUMAN_REVIEW";
export type AgentExecutionStatus = "NOT_EXECUTED" | "SCHEDULED" | "APPLIED" | "BLOCKED" | "FAILED" | "UNDONE" | "STALE";
export type AgentContextTier = "LOCAL" | "EXPANDED" | "REVIEW";
export type AgentRuleAuthority = "SHADOW" | "BATCH_REVIEW" | "DELAYED_APPLY" | "AUTO_APPLY";
export type AgentRuleChangeLevel = "PATCH" | "NARROWING" | "EXPANDING";
export type AgentFeedbackRating = "CORRECT" | "MOSTLY_CORRECT" | "WRONG";
export type AgentFeedbackCorrectionType =
  | "SHOULD_KEEP_ORDINARY"
  | "SHOULD_CREATE_OBJECT"
  | "SHOULD_UPDATE_EXISTING"
  | "SHOULD_DEFER"
  | "WRONG_TARGET"
  | "TOO_AGGRESSIVE"
  | "TOO_CONSERVATIVE"
  | "RISK_TOO_HIGH"
  | "RISK_TOO_LOW"
  | "OTHER";
export type AgentFeedbackAction = "THIS_DECISION_ONLY" | "RECORD_RULE_FEEDBACK" | "PAUSE_RULE_AUTOMATION";

export interface AgentGovernanceSettings {
  observationEnabled: boolean;
  expandedContextEnabled: boolean;
  globalWritesPaused: boolean;
  updatedAt: string;
}

export interface AgentGovernanceRetentionPreview {
  schemaVersion: 1;
  generatedAt: string;
  policy: {
    decisions: "LONG_TERM";
    events: "LONG_TERM";
    sourceSnapshots: "NOT_STORED";
    reviewSignalIndex: "EXPIRE_60_OR_180_DAYS";
  };
  counts: {
    decisions: number;
    events: number;
    feedbackEvents: number;
    reviewSignals: number;
    activeReviewSignals: number;
    rules: number;
    approximateGovernanceBytes: number;
  };
  cleanup: {
    operation: "EXPIRE_REVIEW_SIGNAL_INDEX_ONLY";
    eligibleReviewSignals: number;
    deletesRows: false;
    deletesSourceText: false;
  };
}

export interface AgentGovernanceRetentionResult {
  preview: AgentGovernanceRetentionPreview;
  expiredReviewSignals: number;
  replayed: boolean;
}

export function createAgentGovernanceSettings(at = new Date()): AgentGovernanceSettings {
  return { observationEnabled: true, expandedContextEnabled: true, globalWritesPaused: false, updatedAt: at.toISOString() };
}

function changeAgentGovernanceSetting(
  current: AgentGovernanceSettings,
  field: "observationEnabled" | "expandedContextEnabled" | "globalWritesPaused",
  value: boolean,
  actor: "USER" | "SYSTEM",
  errorCode: string,
  errorMessage: string,
  at: Date,
): AgentGovernanceSettings {
  if (actor !== "USER") throw governanceError(errorCode, errorMessage);
  return value === current[field] ? current : { ...current, [field]: value, updatedAt: at.toISOString() };
}

export function setAgentObservationEnabled(
  current: AgentGovernanceSettings,
  enabled: boolean,
  actor: "USER" | "SYSTEM",
  at = new Date(),
): AgentGovernanceSettings {
  return changeAgentGovernanceSetting(current, "observationEnabled", enabled, actor,
    "AGENT_OBSERVATION_SETTING_REQUIRES_USER", "开启或关闭 Agent 观察必须由 USER 显式授权。", at);
}

export function setAgentExpandedContextEnabled(
  current: AgentGovernanceSettings,
  enabled: boolean,
  actor: "USER" | "SYSTEM",
  at = new Date(),
): AgentGovernanceSettings {
  return changeAgentGovernanceSetting(current, "expandedContextEnabled", enabled, actor,
    "AGENT_EXPANDED_CONTEXT_SETTING_REQUIRES_USER", "开启或关闭扩展联想必须由 USER 显式授权。", at);
}

export function setAgentGlobalWritesPaused(
  current: AgentGovernanceSettings,
  paused: boolean,
  actor: "USER" | "SYSTEM",
  at = new Date(),
): AgentGovernanceSettings {
  return changeAgentGovernanceSetting(current, "globalWritesPaused", paused, actor,
    "AGENT_GLOBAL_PAUSE_REQUIRES_USER", "暂停或恢复全部 Agent 写入必须由 USER 显式授权。", at);
}

export interface AgentFeedbackInput {
  rating: AgentFeedbackRating;
  correctionType?: AgentFeedbackCorrectionType;
  tendency?: "TOO_AGGRESSIVE" | "TOO_CONSERVATIVE";
  routeAssessment?: "TOO_HIGH" | "TOO_LOW";
  note?: string;
  action: AgentFeedbackAction;
}

export interface AgentFeedbackPayload extends AgentFeedbackInput {
  schemaVersion: "agent-feedback-v1";
  decisionRevision: number;
  ruleId: string;
  traceId: string;
}

export interface AgentFeedbackCompatibilityGroup {
  compatibilityKey: string;
  decisionIds: string[];
  threadIds: string[];
  outcome: AgentDecisionOutcome;
  ruleId: string;
  riskRoute: AgentRiskRoute;
  action: AgentFeedbackAction;
}

export interface AgentSourceRoot {
  kind: "BLOCK" | "PAGE";
  externalId: string;
  pageName?: string;
  durableOrigin: { kind: "BLOCK_UUID" | "PAGE_UUID" | "PAGE_NAME"; value: string };
}

export interface AgentDecisionRuleRef {
  id: string;
  displayName: string;
  skillName: string;
  skillVersion: string;
  skillHash: string;
}

export interface AgentDecisionContext {
  tier: AgentContextTier;
  truncated: boolean;
  omittedSections: string[];
  estimatedInputTokens: number;
  estimatedOutputTokens?: number;
}

export interface AgentDecisionInput {
  graphId: string;
  sourceRoot: AgentSourceRoot;
  sourceSnapshotHash: string;
  outcome: AgentDecisionOutcome;
  targetObjectId?: string;
  rule: AgentDecisionRuleRef;
  riskRoute: AgentRiskRoute;
  executionStatus: AgentExecutionStatus;
  evidenceSummary: string;
  evidenceRefs: string[];
  counterSignals: string[];
  closestAlternative: { outcome?: AgentDecisionOutcome; reason?: string };
  context: AgentDecisionContext;
}

export interface AgentDecision extends AgentDecisionInput {
  threadId: string;
  decisionId: string;
  revision: number;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRuleAuthorization {
  ruleId: string;
  displayName: string;
  skillName: string;
  skillVersion: string;
  skillHash: string;
  skillMaxAuthority: AgentRuleAuthority;
  localCurrentAuthority: AgentRuleAuthority;
  effectiveAuthority: AgentRuleAuthority;
  changeLevel: AgentRuleChangeLevel;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRuleAuthorizationInput {
  ruleId: string;
  displayName: string;
  skillName: string;
  skillVersion: string;
  skillHash: string;
  skillMaxAuthority: AgentRuleAuthority;
}

export interface UpdateAgentRuleSkillInput {
  skillVersion: string;
  skillHash: string;
  skillMaxAuthority: AgentRuleAuthority;
  changeLevel: AgentRuleChangeLevel;
}

export type AgentReviewSignalStatus = "ACTIVE" | "EXPIRED" | "SOURCE_MISSING";
export type AgentReviewSignalRetention = "NORMAL" | "RELATED" | "PINNED";

export interface AgentReviewSignal {
  reviewSignalId: string;
  graphId: string;
  sourceRoot: AgentSourceRoot;
  capturedSnapshotHash: string;
  capturedText: string;
  category: string;
  relatedObjectIds: string[];
  revisitReason: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  activeUntil?: string;
  retentionClass: AgentReviewSignalRetention;
  status: AgentReviewSignalStatus;
  createdByDecisionId: string;
}

export interface AgentReviewSignalInput {
  graphId: string;
  sourceRoot: AgentSourceRoot;
  capturedSnapshotHash: string;
  capturedText: string;
  category: string;
  relatedObjectIds: string[];
  revisitReason: string;
  createdByDecisionId: string;
  pinned?: boolean;
}

export type AgentDecisionEventType =
  | "SOURCE_OBSERVED"
  | "DECISION_REVISED"
  | "ROUTE_CHANGED"
  | "EXECUTION_SCHEDULED"
  | "APPLIED"
  | "BLOCKED"
  | "FAILED"
  | "UNDONE"
  | "USER_FEEDBACK_ADDED";

export interface AgentDecisionEvent {
  eventId: string;
  threadId: string;
  decisionId: string;
  eventType: AgentDecisionEventType;
  actor: "SYSTEM" | "AGENT" | "USER";
  payload: Record<string, unknown>;
  occurredAt: string;
}

function governanceError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["ADG-ARCH-01", "ADG-DATA-01"] });
}

const authorityRank: Record<AgentRuleAuthority, number> = {
  SHADOW: 0,
  BATCH_REVIEW: 1,
  DELAYED_APPLY: 2,
  AUTO_APPLY: 3,
};

export function effectiveAgentRuleAuthority(
  skillMaxAuthority: AgentRuleAuthority,
  localCurrentAuthority: AgentRuleAuthority,
): AgentRuleAuthority {
  return authorityRank[skillMaxAuthority] <= authorityRank[localCurrentAuthority] ? skillMaxAuthority : localCurrentAuthority;
}

export function createAgentRuleAuthorization(
  input: CreateAgentRuleAuthorizationInput,
  at = new Date(),
): AgentRuleAuthorization {
  const timestamp = at.toISOString();
  const skillMaxAuthority = input.skillMaxAuthority;
  const localCurrentAuthority: AgentRuleAuthority = "SHADOW";
  return {
    ruleId: bounded(input.ruleId, "ruleId", 128),
    displayName: bounded(input.displayName, "displayName", 64),
    skillName: bounded(input.skillName, "skillName", 128),
    skillVersion: bounded(input.skillVersion, "skillVersion", 128),
    skillHash: requireHash(input.skillHash, "skillHash", [64]),
    skillMaxAuthority,
    localCurrentAuthority,
    effectiveAuthority: effectiveAgentRuleAuthority(skillMaxAuthority, localCurrentAuthority),
    changeLevel: "PATCH",
    paused: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function authorizeAgentRule(
  current: AgentRuleAuthorization,
  requestedAuthority: AgentRuleAuthority,
  actor: "USER" | "SYSTEM",
  reason: string,
  at = new Date(),
): AgentRuleAuthorization {
  bounded(reason, "reason", 2_048);
  if (authorityRank[requestedAuthority] > authorityRank[current.localCurrentAuthority] && actor !== "USER") {
    throw governanceError("AGENT_RULE_PROMOTION_REQUIRES_USER", "Rule 升权必须由 USER 显式授权；系统与模型只能建议。");
  }
  return {
    ...current,
    localCurrentAuthority: requestedAuthority,
    effectiveAuthority: effectiveAgentRuleAuthority(current.skillMaxAuthority, requestedAuthority),
    updatedAt: at.toISOString(),
  };
}

export function setAgentRulePaused(
  current: AgentRuleAuthorization,
  paused: boolean,
  actor: "USER" | "SYSTEM",
  reason: string,
  at = new Date(),
): AgentRuleAuthorization {
  bounded(reason, "reason", 2_048);
  if (actor !== "USER") {
    throw governanceError("AGENT_RULE_PAUSE_REQUIRES_USER", "暂停或恢复 Rule 必须由 USER 显式授权。");
  }
  return paused === current.paused ? current : { ...current, paused, updatedAt: at.toISOString() };
}

export function autoDowngradeAgentRule(
  current: AgentRuleAuthorization,
  reason: string,
  at = new Date(),
): AgentRuleAuthorization {
  bounded(reason, "reason", 2_048);
  const nextAuthority: Record<AgentRuleAuthority, AgentRuleAuthority> = {
    AUTO_APPLY: "DELAYED_APPLY",
    DELAYED_APPLY: "BATCH_REVIEW",
    BATCH_REVIEW: "SHADOW",
    SHADOW: "SHADOW",
  };
  const localCurrentAuthority = nextAuthority[current.localCurrentAuthority];
  return {
    ...current,
    localCurrentAuthority,
    effectiveAuthority: effectiveAgentRuleAuthority(current.skillMaxAuthority, localCurrentAuthority),
    updatedAt: at.toISOString(),
  };
}

export function updateAgentRuleSkill(
  current: AgentRuleAuthorization,
  input: UpdateAgentRuleSkillInput,
  at = new Date(),
): AgentRuleAuthorization {
  const skillVersion = bounded(input.skillVersion, "skillVersion", 128);
  const skillHash = requireHash(input.skillHash, "skillHash", [64]);
  const localCurrentAuthority: AgentRuleAuthority = input.changeLevel === "EXPANDING"
    ? "SHADOW"
    : current.localCurrentAuthority;
  return {
    ...current,
    skillVersion,
    skillHash,
    skillMaxAuthority: input.skillMaxAuthority,
    localCurrentAuthority,
    effectiveAuthority: effectiveAgentRuleAuthority(input.skillMaxAuthority, localCurrentAuthority),
    changeLevel: input.changeLevel,
    updatedAt: at.toISOString(),
  };
}

function bounded(value: string, field: string, maximum = 2_048): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw governanceError("AGENT_DECISION_INPUT_INVALID", `${field} 不能为空且不得超过 ${maximum} 字符。`);
  return normalized;
}

function boundedArray(values: readonly string[], field: string, maximumItems: number, maximumLength = 512): string[] {
  if (values.length > maximumItems) throw governanceError("AGENT_DECISION_INPUT_INVALID", `${field} 超出有界数量。`);
  return values.map((value, index) => bounded(value, `${field}[${index}]`, maximumLength));
}

function requireHash(value: string, field: string, lengths: readonly number[]): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(normalized) || !lengths.includes(normalized.length)) {
    throw governanceError("AGENT_DECISION_HASH_INVALID", `${field} 不是受支持的稳定 hash。`);
  }
  return normalized;
}

function normalizeInput(input: AgentDecisionInput): AgentDecisionInput {
  if (!Number.isSafeInteger(input.context.estimatedInputTokens) || input.context.estimatedInputTokens < 0) {
    throw governanceError("AGENT_DECISION_CONTEXT_INVALID", "estimatedInputTokens 必须是非负整数。");
  }
  if (input.context.estimatedOutputTokens !== undefined
    && (!Number.isSafeInteger(input.context.estimatedOutputTokens) || input.context.estimatedOutputTokens < 0)) {
    throw governanceError("AGENT_DECISION_CONTEXT_INVALID", "estimatedOutputTokens 必须是非负整数。");
  }
  const pageName = input.sourceRoot.pageName?.trim();
  const targetObjectId = input.targetObjectId?.trim();
  const alternativeOutcome = input.closestAlternative.outcome;
  const alternativeReason = input.closestAlternative.reason?.trim();
  return {
    graphId: bounded(input.graphId, "graphId", 256),
    sourceRoot: {
      kind: input.sourceRoot.kind,
      externalId: bounded(input.sourceRoot.externalId, "sourceRoot.externalId", 512),
      ...(pageName ? { pageName: bounded(pageName, "sourceRoot.pageName", 512) } : {}),
      durableOrigin: {
        kind: input.sourceRoot.durableOrigin.kind,
        value: bounded(input.sourceRoot.durableOrigin.value, "sourceRoot.durableOrigin.value", 1_024),
      },
    },
    sourceSnapshotHash: requireHash(input.sourceSnapshotHash, "sourceSnapshotHash", [8, 64]),
    outcome: input.outcome,
    ...(targetObjectId ? { targetObjectId: bounded(targetObjectId, "targetObjectId", 256) } : {}),
    rule: {
      id: bounded(input.rule.id, "rule.id", 128),
      displayName: bounded(input.rule.displayName, "rule.displayName", 64),
      skillName: bounded(input.rule.skillName, "rule.skillName", 128),
      skillVersion: bounded(input.rule.skillVersion, "rule.skillVersion", 128),
      skillHash: requireHash(input.rule.skillHash, "rule.skillHash", [64]),
    },
    riskRoute: input.riskRoute,
    executionStatus: input.executionStatus,
    evidenceSummary: bounded(input.evidenceSummary, "evidenceSummary", 4_096),
    evidenceRefs: boundedArray(input.evidenceRefs, "evidenceRefs", 32, 512),
    counterSignals: boundedArray(input.counterSignals, "counterSignals", 16, 512),
    closestAlternative: {
      ...(alternativeOutcome ? { outcome: alternativeOutcome } : {}),
      ...(alternativeReason ? { reason: bounded(alternativeReason, "closestAlternative.reason", 2_048) } : {}),
    },
    context: {
      tier: input.context.tier,
      truncated: input.context.truncated,
      omittedSections: boundedArray(input.context.omittedSections, "context.omittedSections", 32, 128),
      estimatedInputTokens: input.context.estimatedInputTokens,
      ...(input.context.estimatedOutputTokens !== undefined ? { estimatedOutputTokens: input.context.estimatedOutputTokens } : {}),
    },
  };
}

function threadId(input: Pick<AgentDecisionInput, "graphId" | "sourceRoot">): string {
  return `agent-thread-${checksum(stableJson({
    graphId: input.graphId,
    kind: input.sourceRoot.kind,
    externalId: input.sourceRoot.externalId,
    durableOrigin: input.sourceRoot.durableOrigin,
  }))}`;
}

function sourceIdentity(input: { graphId: string; sourceRoot: AgentSourceRoot }): string {
  return checksum(stableJson({
    graphId: input.graphId,
    kind: input.sourceRoot.kind,
    externalId: input.sourceRoot.externalId,
    durableOrigin: input.sourceRoot.durableOrigin,
  }));
}

function activeUntil(at: Date, days: number): string {
  const result = new Date(at);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

export function createOrRefreshAgentReviewSignal(
  current: AgentReviewSignal | undefined,
  input: AgentReviewSignalInput,
  at = new Date(),
): AgentReviewSignal {
  const graphId = bounded(input.graphId, "graphId", 256);
  const normalizedSourceRoot: AgentSourceRoot = {
    kind: input.sourceRoot.kind,
    externalId: bounded(input.sourceRoot.externalId, "sourceRoot.externalId", 512),
    ...(input.sourceRoot.pageName?.trim() ? { pageName: bounded(input.sourceRoot.pageName, "sourceRoot.pageName", 512) } : {}),
    durableOrigin: {
      kind: input.sourceRoot.durableOrigin.kind,
      value: bounded(input.sourceRoot.durableOrigin.value, "sourceRoot.durableOrigin.value", 1_024),
    },
  };
  const identity = sourceIdentity({ graphId, sourceRoot: normalizedSourceRoot });
  const reviewSignalId = `review-signal-${identity}`;
  if (current && current.reviewSignalId !== reviewSignalId) {
    throw governanceError("AGENT_REVIEW_SIGNAL_SOURCE_MISMATCH", "Review Signal 不能跨 Graph 或 Source Root 刷新。");
  }
  const relatedObjectIds = [...new Set([
    ...(current?.relatedObjectIds ?? []),
    ...boundedArray(input.relatedObjectIds, "relatedObjectIds", 32, 256),
  ])].sort();
  const occurrenceCount = (current?.occurrenceCount ?? 0) + 1;
  const retentionClass: AgentReviewSignalRetention = input.pinned
    ? "PINNED"
    : relatedObjectIds.length > 0 || occurrenceCount > 1 ? "RELATED" : "NORMAL";
  const timestamp = at.toISOString();
  return {
    reviewSignalId,
    graphId,
    sourceRoot: normalizedSourceRoot,
    capturedSnapshotHash: requireHash(input.capturedSnapshotHash, "capturedSnapshotHash", [8, 64]),
    capturedText: bounded(input.capturedText, "capturedText", 16_384),
    category: bounded(input.category, "category", 128),
    relatedObjectIds,
    revisitReason: bounded(input.revisitReason, "revisitReason", 2_048),
    firstSeenAt: current?.firstSeenAt ?? timestamp,
    lastSeenAt: timestamp,
    occurrenceCount,
    ...(retentionClass === "PINNED" ? {} : { activeUntil: activeUntil(at, retentionClass === "RELATED" ? 180 : 60) }),
    retentionClass,
    status: "ACTIVE",
    createdByDecisionId: bounded(input.createdByDecisionId, "createdByDecisionId", 256),
  };
}

export function reconcileAgentReviewSignal(
  current: AgentReviewSignal,
  input: { sourceExists: boolean },
  at = new Date(),
): AgentReviewSignal {
  const status: AgentReviewSignalStatus = !input.sourceExists
    ? "SOURCE_MISSING"
    : current.retentionClass !== "PINNED" && current.activeUntil !== undefined && current.activeUntil <= at.toISOString()
      ? "EXPIRED"
      : "ACTIVE";
  return status === current.status ? current : { ...current, status };
}

export function createAgentDecisionEvent(
  input: Omit<AgentDecisionEvent, "eventId" | "occurredAt">,
  at = new Date(),
): AgentDecisionEvent {
  const occurredAt = at.toISOString();
  const threadIdValue = bounded(input.threadId, "threadId", 256);
  const decisionIdValue = bounded(input.decisionId, "decisionId", 256);
  const payload = structuredClone(input.payload);
  const eventId = `agent-event-${checksum(stableJson({
    threadId: threadIdValue,
    decisionId: decisionIdValue,
    eventType: input.eventType,
    actor: input.actor,
    payload,
    occurredAt,
  }))}`;
  return {
    eventId,
    threadId: threadIdValue,
    decisionId: decisionIdValue,
    eventType: input.eventType,
    actor: input.actor,
    payload,
    occurredAt,
  };
}

function normalizeAgentFeedbackInput(input: AgentFeedbackInput): AgentFeedbackInput {
  const correctionType = input.correctionType === undefined ? undefined : enumValue(input.correctionType, "feedback.correctionType", ["SHOULD_KEEP_ORDINARY", "SHOULD_CREATE_OBJECT", "SHOULD_UPDATE_EXISTING", "SHOULD_DEFER", "WRONG_TARGET", "TOO_AGGRESSIVE", "TOO_CONSERVATIVE", "RISK_TOO_HIGH", "RISK_TOO_LOW", "OTHER"]);
  const tendency = input.tendency === undefined ? undefined : enumValue(input.tendency, "feedback.tendency", ["TOO_AGGRESSIVE", "TOO_CONSERVATIVE"]);
  const routeAssessment = input.routeAssessment === undefined ? undefined : enumValue(input.routeAssessment, "feedback.routeAssessment", ["TOO_HIGH", "TOO_LOW"]);
  const note = input.note?.trim();
  return {
    rating: enumValue(input.rating, "feedback.rating", ["CORRECT", "MOSTLY_CORRECT", "WRONG"]),
    ...(correctionType ? { correctionType } : {}),
    ...(tendency ? { tendency } : {}),
    ...(routeAssessment ? { routeAssessment } : {}),
    ...(note ? { note: bounded(note, "feedback.note", 2_048) } : {}),
    action: enumValue(input.action, "feedback.action", ["THIS_DECISION_ONLY", "RECORD_RULE_FEEDBACK", "PAUSE_RULE_AUTOMATION"]),
  };
}

export function createAgentFeedbackEvent(
  decision: AgentDecision,
  input: AgentFeedbackInput,
  traceId: string,
  at = new Date(),
): AgentDecisionEvent {
  const normalized = normalizeAgentFeedbackInput(input);
  return createAgentDecisionEvent({
    threadId: decision.threadId,
    decisionId: decision.decisionId,
    eventType: "USER_FEEDBACK_ADDED",
    actor: "USER",
    payload: {
      schemaVersion: "agent-feedback-v1",
      decisionRevision: decision.revision,
      ruleId: decision.rule.id,
      traceId: bounded(traceId, "feedback.traceId", 256),
      ...normalized,
    },
  }, at);
}

export function validateAgentFeedbackPayload(value: unknown): AgentFeedbackPayload {
  const record = recordValue(value, "AgentFeedbackPayload");
  const allowed = new Set(["schemaVersion", "decisionRevision", "ruleId", "traceId", "rating", "correctionType", "tendency", "routeAssessment", "note", "action"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw governanceError("AGENT_FEEDBACK_INVALID", "Feedback 包含未知字段。");
  }
  if (record.schemaVersion !== "agent-feedback-v1") throw governanceError("AGENT_FEEDBACK_INVALID", "Feedback schemaVersion 无效。");
  const decisionRevision = Number(record.decisionRevision);
  if (!Number.isSafeInteger(decisionRevision) || decisionRevision < 1) throw governanceError("AGENT_FEEDBACK_INVALID", "Feedback decisionRevision 无效。");
  return {
    schemaVersion: "agent-feedback-v1",
    decisionRevision,
    ruleId: bounded(String(record.ruleId ?? ""), "feedback.ruleId", 128),
    traceId: bounded(String(record.traceId ?? ""), "feedback.traceId", 256),
    ...normalizeAgentFeedbackInput({
      rating: record.rating as AgentFeedbackRating,
      ...(record.correctionType !== undefined ? { correctionType: record.correctionType as AgentFeedbackCorrectionType } : {}),
      ...(record.tendency !== undefined ? { tendency: record.tendency as "TOO_AGGRESSIVE" | "TOO_CONSERVATIVE" } : {}),
      ...(record.routeAssessment !== undefined ? { routeAssessment: record.routeAssessment as "TOO_HIGH" | "TOO_LOW" } : {}),
      ...(record.note !== undefined ? { note: String(record.note) } : {}),
      action: record.action as AgentFeedbackAction,
    }),
  };
}

export function groupCompatibleAgentFeedback(
  decisions: readonly AgentDecision[],
  input: AgentFeedbackInput,
): AgentFeedbackCompatibilityGroup[] {
  const normalized = normalizeAgentFeedbackInput(input);
  const groups = new Map<string, AgentFeedbackCompatibilityGroup>();
  for (const decision of decisions) {
    const compatibilityKey = stableJson({
      outcome: decision.outcome,
      ruleId: decision.rule.id,
      riskRoute: decision.riskRoute,
      action: normalized.action,
    });
    const current = groups.get(compatibilityKey) ?? {
      compatibilityKey,
      decisionIds: [],
      threadIds: [],
      outcome: decision.outcome,
      ruleId: decision.rule.id,
      riskRoute: decision.riskRoute,
      action: normalized.action,
    };
    current.decisionIds.push(decision.decisionId);
    current.threadIds.push(decision.threadId);
    groups.set(compatibilityKey, current);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, decisionIds: [...group.decisionIds].sort(), threadIds: [...group.threadIds].sort() }))
    .sort((left, right) => left.compatibilityKey.localeCompare(right.compatibilityKey));
}

function decisionId(threadIdValue: string, revision: number): string {
  return `${threadIdValue}:r${revision}`;
}

function judgmentFingerprint(input: AgentDecisionInput): string {
  return checksum(stableJson({
    outcome: input.outcome,
    targetObjectId: input.targetObjectId,
    ruleId: input.rule.id,
    skillVersion: input.rule.skillVersion,
    skillHash: input.rule.skillHash,
    riskRoute: input.riskRoute,
  }));
}

export function createAgentDecision(input: AgentDecisionInput, at = new Date()): AgentDecision {
  const normalized = normalizeInput(input);
  const timestamp = at.toISOString();
  const threadIdValue = threadId(normalized);
  return {
    ...normalized,
    threadId: threadIdValue,
    decisionId: decisionId(threadIdValue, 1),
    revision: 1,
    observedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function reviseAgentDecision(
  current: AgentDecision,
  input: AgentDecisionInput,
  at = new Date(),
): { decision: AgentDecision; revised: boolean } {
  const normalized = normalizeInput(input);
  const expectedThreadId = threadId(normalized);
  if (expectedThreadId !== current.threadId) {
    throw governanceError("AGENT_DECISION_SOURCE_ROOT_MISMATCH", "Decision Revision 不能改变 Graph 或 Source Root；应创建另一条 Decision Thread。");
  }
  const revised = judgmentFingerprint(normalized) !== judgmentFingerprint(current);
  const revision = revised ? current.revision + 1 : current.revision;
  const timestamp = at.toISOString();
  return {
    revised,
    decision: {
      ...normalized,
      threadId: current.threadId,
      decisionId: revised ? decisionId(current.threadId, revision) : current.decisionId,
      revision,
      observedAt: timestamp,
      createdAt: current.createdAt,
      updatedAt: timestamp,
    },
  };
}

function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw governanceError("AGENT_GOVERNANCE_SHAPE_INVALID", `${field} 必须是 object。`);
  return value as Record<string, unknown>;
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw governanceError("AGENT_GOVERNANCE_ENUM_INVALID", `${field} 不是受支持的枚举值。`);
  return value as T;
}

function isoValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw governanceError("AGENT_GOVERNANCE_TIME_INVALID", `${field} 必须是 canonical ISO timestamp。`);
  }
  return value;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw governanceError("AGENT_GOVERNANCE_SHAPE_INVALID", `${field} 必须是 boolean。`);
  return value;
}

function stringArrayValue(value: unknown, field: string, maximumItems: number, maximumLength = 512): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw governanceError("AGENT_GOVERNANCE_SHAPE_INVALID", `${field} 必须是 string array。`);
  return boundedArray(value as string[], field, maximumItems, maximumLength);
}

function sourceRootValue(value: unknown): AgentSourceRoot {
  const source = recordValue(value, "sourceRoot");
  const durable = recordValue(source.durableOrigin, "sourceRoot.durableOrigin");
  const pageName = typeof source.pageName === "string" && source.pageName.trim() ? bounded(source.pageName, "sourceRoot.pageName", 512) : undefined;
  return {
    kind: enumValue(source.kind, "sourceRoot.kind", ["BLOCK", "PAGE"]),
    externalId: bounded(String(source.externalId ?? ""), "sourceRoot.externalId", 512),
    ...(pageName ? { pageName } : {}),
    durableOrigin: {
      kind: enumValue(durable.kind, "sourceRoot.durableOrigin.kind", ["BLOCK_UUID", "PAGE_UUID", "PAGE_NAME"]),
      value: bounded(String(durable.value ?? ""), "sourceRoot.durableOrigin.value", 1_024),
    },
  };
}

export function validateAgentDecision(value: unknown): AgentDecision {
  const record = recordValue(value, "AgentDecision");
  const rule = recordValue(record.rule, "rule");
  const alternative = recordValue(record.closestAlternative, "closestAlternative");
  const context = recordValue(record.context, "context");
  const sourceRoot = sourceRootValue(record.sourceRoot);
  const estimatedInputTokens = context.estimatedInputTokens;
  const estimatedOutputTokens = context.estimatedOutputTokens;
  if (!Number.isSafeInteger(estimatedInputTokens) || Number(estimatedInputTokens) < 0
    || (estimatedOutputTokens !== undefined && (!Number.isSafeInteger(estimatedOutputTokens) || Number(estimatedOutputTokens) < 0))) {
    throw governanceError("AGENT_DECISION_CONTEXT_INVALID", "Decision context token metrics 必须是非负整数。");
  }
  const input = normalizeInput({
    graphId: bounded(String(record.graphId ?? ""), "graphId", 256),
    sourceRoot,
    sourceSnapshotHash: requireHash(String(record.sourceSnapshotHash ?? ""), "sourceSnapshotHash", [8, 64]),
    outcome: enumValue(record.outcome, "outcome", ["CREATE_CANDIDATE", "KEEP_ORDINARY", "DEFER", "UPDATE_EXISTING", "CREATE_OBJECT", "REVIEW_SIGNAL", "NO_ACTION", "NEEDS_HUMAN", "NEEDS_MORE_CONTEXT"]),
    ...(typeof record.targetObjectId === "string" && record.targetObjectId.trim() ? { targetObjectId: record.targetObjectId } : {}),
    rule: {
      id: bounded(String(rule.id ?? ""), "rule.id", 128),
      displayName: bounded(String(rule.displayName ?? ""), "rule.displayName", 64),
      skillName: bounded(String(rule.skillName ?? ""), "rule.skillName", 128),
      skillVersion: bounded(String(rule.skillVersion ?? ""), "rule.skillVersion", 128),
      skillHash: requireHash(String(rule.skillHash ?? ""), "rule.skillHash", [64]),
    },
    riskRoute: enumValue(record.riskRoute, "riskRoute", ["SHADOW", "BATCH_REVIEW", "DELAYED_APPLY", "AUTO_APPLY", "HUMAN_REVIEW"]),
    executionStatus: enumValue(record.executionStatus, "executionStatus", ["NOT_EXECUTED", "SCHEDULED", "APPLIED", "BLOCKED", "FAILED", "UNDONE", "STALE"]),
    evidenceSummary: bounded(String(record.evidenceSummary ?? ""), "evidenceSummary", 4_096),
    evidenceRefs: stringArrayValue(record.evidenceRefs, "evidenceRefs", 32),
    counterSignals: stringArrayValue(record.counterSignals, "counterSignals", 16),
    closestAlternative: {
      ...(alternative.outcome !== undefined ? { outcome: enumValue(alternative.outcome, "closestAlternative.outcome", ["CREATE_CANDIDATE", "KEEP_ORDINARY", "DEFER", "UPDATE_EXISTING", "CREATE_OBJECT", "REVIEW_SIGNAL", "NO_ACTION", "NEEDS_HUMAN", "NEEDS_MORE_CONTEXT"]) } : {}),
      ...(typeof alternative.reason === "string" && alternative.reason.trim() ? { reason: alternative.reason } : {}),
    },
    context: {
      tier: enumValue(context.tier, "context.tier", ["LOCAL", "EXPANDED", "REVIEW"]),
      truncated: booleanValue(context.truncated, "context.truncated"),
      omittedSections: stringArrayValue(context.omittedSections, "context.omittedSections", 32, 128),
      estimatedInputTokens: Number(estimatedInputTokens),
      ...(estimatedOutputTokens !== undefined ? { estimatedOutputTokens: Number(estimatedOutputTokens) } : {}),
    },
  });
  const revision = Number(record.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw governanceError("AGENT_DECISION_REVISION_INVALID", "Decision revision 必须从 1 连续计数。");
  const expectedThreadId = threadId(input);
  if (record.threadId !== expectedThreadId || record.decisionId !== decisionId(expectedThreadId, revision)) {
    throw governanceError("AGENT_DECISION_IDENTITY_INVALID", "Decision identity 与 Graph、Source Root 或 revision 不一致。");
  }
  const observedAt = isoValue(record.observedAt, "observedAt");
  const createdAt = isoValue(record.createdAt, "createdAt");
  const updatedAt = isoValue(record.updatedAt, "updatedAt");
  if (createdAt > updatedAt) throw governanceError("AGENT_DECISION_TIME_INVALID", "Decision createdAt 不得晚于 updatedAt。");
  return { ...input, threadId: expectedThreadId, decisionId: decisionId(expectedThreadId, revision), revision, observedAt, createdAt, updatedAt };
}

export function validateAgentDecisionEvent(value: unknown): AgentDecisionEvent {
  const record = recordValue(value, "AgentDecisionEvent");
  const occurredAt = isoValue(record.occurredAt, "occurredAt");
  const input = {
    threadId: bounded(String(record.threadId ?? ""), "threadId", 256),
    decisionId: bounded(String(record.decisionId ?? ""), "decisionId", 256),
    eventType: enumValue(record.eventType, "eventType", ["SOURCE_OBSERVED", "DECISION_REVISED", "ROUTE_CHANGED", "EXECUTION_SCHEDULED", "APPLIED", "BLOCKED", "FAILED", "UNDONE", "USER_FEEDBACK_ADDED"]),
    actor: enumValue(record.actor, "actor", ["SYSTEM", "AGENT", "USER"]),
    payload: recordValue(record.payload, "payload"),
  } satisfies Omit<AgentDecisionEvent, "eventId" | "occurredAt">;
  if (input.eventType === "USER_FEEDBACK_ADDED") {
    if (input.actor !== "USER") throw governanceError("AGENT_FEEDBACK_INVALID", "Feedback actor 必须是 USER。");
    input.payload = { ...validateAgentFeedbackPayload(input.payload) };
  }
  const expected = createAgentDecisionEvent(input, new Date(occurredAt));
  if (record.eventId !== expected.eventId) throw governanceError("AGENT_DECISION_EVENT_IDENTITY_INVALID", "Decision Event identity 与内容不一致。");
  return expected;
}

export function validateAgentRuleAuthorization(value: unknown): AgentRuleAuthorization {
  const record = recordValue(value, "AgentRuleAuthorization");
  const skillMaxAuthority = enumValue(record.skillMaxAuthority, "skillMaxAuthority", ["SHADOW", "BATCH_REVIEW", "DELAYED_APPLY", "AUTO_APPLY"]);
  const localCurrentAuthority = enumValue(record.localCurrentAuthority, "localCurrentAuthority", ["SHADOW", "BATCH_REVIEW", "DELAYED_APPLY", "AUTO_APPLY"]);
  const effectiveAuthority = effectiveAgentRuleAuthority(skillMaxAuthority, localCurrentAuthority);
  if (record.effectiveAuthority !== effectiveAuthority) throw governanceError("AGENT_RULE_EFFECTIVE_AUTHORITY_INVALID", "Rule effective authority 必须是 Skill 与本地授权的较低值。");
  return {
    ruleId: bounded(String(record.ruleId ?? ""), "ruleId", 128),
    displayName: bounded(String(record.displayName ?? ""), "displayName", 64),
    skillName: bounded(String(record.skillName ?? ""), "skillName", 128),
    skillVersion: bounded(String(record.skillVersion ?? ""), "skillVersion", 128),
    skillHash: requireHash(String(record.skillHash ?? ""), "skillHash", [64]),
    skillMaxAuthority,
    localCurrentAuthority,
    effectiveAuthority,
    changeLevel: enumValue(record.changeLevel, "changeLevel", ["PATCH", "NARROWING", "EXPANDING"]),
    paused: booleanValue(record.paused, "paused"),
    createdAt: isoValue(record.createdAt, "createdAt"),
    updatedAt: isoValue(record.updatedAt, "updatedAt"),
  };
}

export function validateAgentGovernanceSettings(value: unknown): AgentGovernanceSettings {
  const record = recordValue(value, "AgentGovernanceSettings");
  return {
    observationEnabled: booleanValue(record.observationEnabled, "observationEnabled"),
    expandedContextEnabled: booleanValue(record.expandedContextEnabled, "expandedContextEnabled"),
    globalWritesPaused: booleanValue(record.globalWritesPaused, "globalWritesPaused"),
    updatedAt: isoValue(record.updatedAt, "updatedAt"),
  };
}

export function validateAgentGovernanceRetentionPreview(value: unknown): AgentGovernanceRetentionPreview {
  const record = recordValue(value, "AgentGovernanceRetentionPreview");
  const policy = recordValue(record.policy, "retention.policy");
  const counts = recordValue(record.counts, "retention.counts");
  const cleanup = recordValue(record.cleanup, "retention.cleanup");
  const count = (field: keyof AgentGovernanceRetentionPreview["counts"]): number => {
    const result = Number(counts[field]);
    if (!Number.isSafeInteger(result) || result < 0) throw governanceError("AGENT_RETENTION_PREVIEW_INVALID", `Retention ${field} 必须是非负整数。`);
    return result;
  };
  const eligibleReviewSignals = Number(cleanup.eligibleReviewSignals);
  if (!Number.isSafeInteger(eligibleReviewSignals) || eligibleReviewSignals < 0
    || record.schemaVersion !== 1 || policy.decisions !== "LONG_TERM" || policy.events !== "LONG_TERM"
    || policy.sourceSnapshots !== "NOT_STORED" || policy.reviewSignalIndex !== "EXPIRE_60_OR_180_DAYS"
    || cleanup.operation !== "EXPIRE_REVIEW_SIGNAL_INDEX_ONLY" || cleanup.deletesRows !== false || cleanup.deletesSourceText !== false) {
    throw governanceError("AGENT_RETENTION_PREVIEW_INVALID", "Agent retention preview 合同无效。");
  }
  return {
    schemaVersion: 1,
    generatedAt: isoValue(record.generatedAt, "generatedAt"),
    policy: { decisions: "LONG_TERM", events: "LONG_TERM", sourceSnapshots: "NOT_STORED", reviewSignalIndex: "EXPIRE_60_OR_180_DAYS" },
    counts: {
      decisions: count("decisions"), events: count("events"), feedbackEvents: count("feedbackEvents"),
      reviewSignals: count("reviewSignals"), activeReviewSignals: count("activeReviewSignals"), rules: count("rules"),
      approximateGovernanceBytes: count("approximateGovernanceBytes"),
    },
    cleanup: { operation: "EXPIRE_REVIEW_SIGNAL_INDEX_ONLY", eligibleReviewSignals, deletesRows: false, deletesSourceText: false },
  };
}

export function validateAgentReviewSignal(value: unknown): AgentReviewSignal {
  const record = recordValue(value, "AgentReviewSignal");
  const graphId = bounded(String(record.graphId ?? ""), "graphId", 256);
  const sourceRoot = sourceRootValue(record.sourceRoot);
  const expectedId = `review-signal-${sourceIdentity({ graphId, sourceRoot })}`;
  if (record.reviewSignalId !== expectedId) throw governanceError("AGENT_REVIEW_SIGNAL_IDENTITY_INVALID", "Review Signal identity 与 Graph 或 Source Root 不一致。");
  const retentionClass = enumValue(record.retentionClass, "retentionClass", ["NORMAL", "RELATED", "PINNED"]);
  const activeUntilValue = record.activeUntil === undefined ? undefined : isoValue(record.activeUntil, "activeUntil");
  if ((retentionClass === "PINNED") === (activeUntilValue !== undefined)) {
    throw governanceError("AGENT_REVIEW_SIGNAL_RETENTION_INVALID", "Review Signal retention 要求 PINNED 无 activeUntil，其他类型必须有 activeUntil。");
  }
  const occurrenceCount = Number(record.occurrenceCount);
  if (!Number.isSafeInteger(occurrenceCount) || occurrenceCount < 1) throw governanceError("AGENT_REVIEW_SIGNAL_COUNT_INVALID", "Review Signal occurrenceCount 必须是正整数。");
  const relatedObjectIds = stringArrayValue(record.relatedObjectIds, "relatedObjectIds", 32, 256);
  return {
    reviewSignalId: expectedId,
    graphId,
    sourceRoot,
    capturedSnapshotHash: requireHash(String(record.capturedSnapshotHash ?? ""), "capturedSnapshotHash", [8, 64]),
    capturedText: bounded(String(record.capturedText ?? ""), "capturedText", 16_384),
    category: bounded(String(record.category ?? ""), "category", 128),
    relatedObjectIds,
    revisitReason: bounded(String(record.revisitReason ?? ""), "revisitReason", 2_048),
    firstSeenAt: isoValue(record.firstSeenAt, "firstSeenAt"),
    lastSeenAt: isoValue(record.lastSeenAt, "lastSeenAt"),
    occurrenceCount,
    ...(activeUntilValue ? { activeUntil: activeUntilValue } : {}),
    retentionClass,
    status: enumValue(record.status, "status", ["ACTIVE", "EXPIRED", "SOURCE_MISSING"]),
    createdByDecisionId: bounded(String(record.createdByDecisionId ?? ""), "createdByDecisionId", 256),
  };
}
