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
  | "USER_FEEDBACK_ADDED"
  | "RULE_AUTHORITY_CHANGED"
  | "RULE_AUTO_DOWNGRADED";

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
