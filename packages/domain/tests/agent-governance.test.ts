import assert from "node:assert/strict";
import test from "node:test";

import { authorizeAgentRule, autoDowngradeAgentRule, createAgentDecision, createAgentFeedbackEvent, createAgentGovernanceSettings, createAgentRuleAuthorization, createOrRefreshAgentReviewSignal, groupCompatibleAgentFeedback, reconcileAgentReviewSignal, reviseAgentDecision, setAgentGlobalWritesPaused, setAgentRulePaused, updateAgentRuleSkill, validateAgentDecision, validateAgentDecisionEvent, validateAgentGovernanceSettings, validateAgentReviewSignal, validateAgentRuleAuthorization } from "../src/agent-governance.ts";

const observedAt = new Date("2026-08-02T02:00:00.000Z");

function input() {
  return {
    graphId: "graph-a",
    sourceRoot: {
      kind: "BLOCK" as const,
      externalId: "block-explicit-task",
      pageName: "2026-08-02",
      durableOrigin: { kind: "BLOCK_UUID" as const, value: "block-explicit-task" },
    },
    sourceSnapshotHash: "a".repeat(8),
    outcome: "CREATE_CANDIDATE" as const,
    rule: {
      id: "EXPLICIT_TASK_01",
      displayName: "明确任务标记",
      skillName: "agent-decision-governance",
      skillVersion: "1.0.0",
      skillHash: "b".repeat(64),
    },
    riskRoute: "SHADOW" as const,
    executionStatus: "NOT_EXECUTED" as const,
    evidenceSummary: "来源包含明确任务标记。",
    evidenceRefs: ["block:block-explicit-task"],
    counterSignals: [],
    closestAlternative: { outcome: "KEEP_ORDINARY" as const, reason: "若标记只是引用，应保持普通内容。" },
    context: { tier: "LOCAL" as const, truncated: false, omittedSections: [], estimatedInputTokens: 320 },
  };
}

test("one Graph Source Root keeps one Decision Thread and revises only when the judgment changes", () => {
  const first = createAgentDecision(input(), observedAt);
  const sourceRefresh = reviseAgentDecision(first, {
    ...input(),
    sourceSnapshotHash: "c".repeat(8),
    evidenceSummary: "来源正文有轻微修订，治理结论不变。",
  }, new Date("2026-08-02T02:01:00.000Z"));

  assert.equal(sourceRefresh.revised, false);
  assert.equal(sourceRefresh.decision.threadId, first.threadId);
  assert.equal(sourceRefresh.decision.decisionId, first.decisionId);
  assert.equal(sourceRefresh.decision.revision, 1);
  assert.equal(sourceRefresh.decision.sourceSnapshotHash, "c".repeat(8));

  const changed = reviseAgentDecision(sourceRefresh.decision, {
    ...input(),
    sourceSnapshotHash: "d".repeat(8),
    outcome: "NEEDS_HUMAN",
    riskRoute: "HUMAN_REVIEW",
    counterSignals: ["存在两个可能目标对象"],
  }, new Date("2026-08-02T02:02:00.000Z"));

  assert.equal(changed.revised, true);
  assert.equal(changed.decision.threadId, first.threadId);
  assert.notEqual(changed.decision.decisionId, first.decisionId);
  assert.equal(changed.decision.revision, 2);
});

test("a new Rule starts in Shadow and effective authority is always the lower Skill/local authority", () => {
  const authorization = createAgentRuleAuthorization({
    ruleId: "EXPLICIT_TASK_01",
    displayName: "明确任务标记",
    skillName: "agent-decision-governance",
    skillVersion: "1.0.0",
    skillHash: "b".repeat(64),
    skillMaxAuthority: "AUTO_APPLY",
  }, observedAt);

  assert.equal(authorization.localCurrentAuthority, "SHADOW");
  assert.equal(authorization.effectiveAuthority, "SHADOW");
  assert.equal(authorization.paused, false);
});

test("Rule authority can only auto-downgrade while promotion requires explicit user authorization", () => {
  const shadow = createAgentRuleAuthorization({
    ruleId: "EXPLICIT_TASK_01",
    displayName: "明确任务标记",
    skillName: "agent-decision-governance",
    skillVersion: "1.0.0",
    skillHash: "b".repeat(64),
    skillMaxAuthority: "AUTO_APPLY",
  }, observedAt);

  assert.throws(
    () => authorizeAgentRule(shadow, "BATCH_REVIEW", "SYSTEM", "模型建议升权", new Date("2026-08-02T02:10:00.000Z")),
    /user/i,
  );
  const authorized = authorizeAgentRule(shadow, "AUTO_APPLY", "USER", "用户明确批准", new Date("2026-08-02T02:11:00.000Z"));
  assert.equal(authorized.localCurrentAuthority, "AUTO_APPLY");
  const downgraded = autoDowngradeAgentRule(authorized, "自动 Commit 后 Undo 率升高", new Date("2026-08-02T02:12:00.000Z"));
  assert.equal(downgraded.localCurrentAuthority, "DELAYED_APPLY");
  assert.equal(downgraded.effectiveAuthority, "DELAYED_APPLY");
});

test("an expanding Skill change fails closed to Shadow while patch and narrowing inherit only bounded authority", () => {
  const current = authorizeAgentRule(createAgentRuleAuthorization({
    ruleId: "EXPLICIT_TASK_01",
    displayName: "明确任务标记",
    skillName: "agent-decision-governance",
    skillVersion: "1.0.0",
    skillHash: "b".repeat(64),
    skillMaxAuthority: "AUTO_APPLY",
  }, observedAt), "DELAYED_APPLY", "USER", "用户批准", new Date("2026-08-02T02:20:00.000Z"));

  const patched = updateAgentRuleSkill(current, {
    skillVersion: "1.0.1",
    skillHash: "c".repeat(64),
    skillMaxAuthority: "BATCH_REVIEW",
    changeLevel: "PATCH",
  }, new Date("2026-08-02T02:21:00.000Z"));
  assert.equal(patched.localCurrentAuthority, "DELAYED_APPLY");
  assert.equal(patched.effectiveAuthority, "BATCH_REVIEW");

  const expanded = updateAgentRuleSkill(patched, {
    skillVersion: "2.0.0",
    skillHash: "d".repeat(64),
    skillMaxAuthority: "AUTO_APPLY",
    changeLevel: "EXPANDING",
  }, new Date("2026-08-02T02:22:00.000Z"));
  assert.equal(expanded.localCurrentAuthority, "SHADOW");
  assert.equal(expanded.effectiveAuthority, "SHADOW");
});

test("Review Signal uses a 60-day active index and extends repeated or object-related evidence to 180 days", () => {
  const first = createOrRefreshAgentReviewSignal(undefined, {
    graphId: "graph-a",
    sourceRoot: input().sourceRoot,
    capturedSnapshotHash: "e".repeat(8),
    capturedText: "最近告警似乎有点多。",
    category: "POSSIBLE_ACTION",
    relatedObjectIds: [],
    revisitReason: "未来复盘可能有价值",
    createdByDecisionId: "agent-thread-a:r1",
  }, observedAt);

  assert.equal(first.occurrenceCount, 1);
  assert.equal(first.activeUntil, "2026-10-01T02:00:00.000Z");

  const repeated = createOrRefreshAgentReviewSignal(first, {
    graphId: "graph-a",
    sourceRoot: input().sourceRoot,
    capturedSnapshotHash: "f".repeat(8),
    capturedText: "告警问题再次出现。",
    category: "POSSIBLE_ACTION",
    relatedObjectIds: ["task-monitoring"],
    revisitReason: "重复出现且关联正式事项",
    createdByDecisionId: "agent-thread-a:r2",
  }, new Date("2026-08-03T02:00:00.000Z"));

  assert.equal(repeated.reviewSignalId, first.reviewSignalId);
  assert.equal(repeated.occurrenceCount, 2);
  assert.equal(repeated.retentionClass, "RELATED");
  assert.equal(repeated.activeUntil, "2027-01-30T02:00:00.000Z");
  assert.equal(reconcileAgentReviewSignal(first, { sourceExists: true }, new Date("2026-10-02T02:00:00.000Z")).status, "EXPIRED");
  assert.equal(reconcileAgentReviewSignal(repeated, { sourceExists: false }, new Date("2026-08-04T02:00:00.000Z")).status, "SOURCE_MISSING");
});

test("governance trust-boundary validators reject forged identity, retention, and effective authority", () => {
  const decision = createAgentDecision(input(), observedAt);
  assert.deepEqual(validateAgentDecision(structuredClone(decision)), decision);
  assert.throws(() => validateAgentDecision({ ...decision, threadId: "forged-thread" }), /identity/i);

  const authorization = createAgentRuleAuthorization({
    ruleId: "EXPLICIT_TASK_01", displayName: "明确任务标记", skillName: "agent-decision-governance",
    skillVersion: "1.0.0", skillHash: "b".repeat(64), skillMaxAuthority: "AUTO_APPLY",
  }, observedAt);
  assert.deepEqual(validateAgentRuleAuthorization(structuredClone(authorization)), authorization);
  assert.throws(() => validateAgentRuleAuthorization({ ...authorization, effectiveAuthority: "AUTO_APPLY" }), /effective/i);

  const signal = createOrRefreshAgentReviewSignal(undefined, {
    graphId: "graph-a", sourceRoot: input().sourceRoot, capturedSnapshotHash: "e".repeat(8), capturedText: "以后处理。",
    category: "POSSIBLE_ACTION", relatedObjectIds: [], revisitReason: "弱信号", createdByDecisionId: decision.decisionId,
  }, observedAt);
  assert.deepEqual(validateAgentReviewSignal(structuredClone(signal)), signal);
  assert.throws(() => validateAgentReviewSignal({ ...signal, activeUntil: undefined }), /retention/i);
});

test("feedback is a bounded Decision Event and remains distinct from Undo", () => {
  const decision = createAgentDecision(input(), observedAt);
  const event = createAgentFeedbackEvent(decision, {
    rating: "WRONG",
    correctionType: "SHOULD_KEEP_ORDINARY",
    tendency: "TOO_AGGRESSIVE",
    routeAssessment: "TOO_HIGH",
    note: "这是讨论中的例子，不应正式化。",
    action: "RECORD_RULE_FEEDBACK",
  }, "trace-feedback-1", new Date("2026-08-02T05:00:00.000Z"));

  assert.equal(event.eventType, "USER_FEEDBACK_ADDED");
  assert.equal(event.actor, "USER");
  assert.equal(event.payload.rating, "WRONG");
  assert.equal(event.payload.action, "RECORD_RULE_FEEDBACK");
  assert.equal(event.payload.undoRequested, undefined);
  assert.deepEqual(validateAgentDecisionEvent(structuredClone(event)), event);
  assert.throws(() => validateAgentDecisionEvent({ ...event, payload: { ...event.payload, rating: "PERFECT" } }), /feedback/i);
});

test("bulk correction splits incompatible outcomes, rules, routes, and actions into deterministic groups", () => {
  const first = createAgentDecision(input(), observedAt);
  const differentOutcome = createAgentDecision({ ...input(), sourceRoot: { ...input().sourceRoot, externalId: "block-2", durableOrigin: { kind: "BLOCK_UUID", value: "block-2" } }, outcome: "KEEP_ORDINARY" }, observedAt);
  const differentRoute = createAgentDecision({ ...input(), sourceRoot: { ...input().sourceRoot, externalId: "block-3", durableOrigin: { kind: "BLOCK_UUID", value: "block-3" } }, riskRoute: "BATCH_REVIEW" }, observedAt);
  const groups = groupCompatibleAgentFeedback([differentRoute, first, differentOutcome], {
    rating: "WRONG",
    correctionType: "TOO_AGGRESSIVE",
    action: "RECORD_RULE_FEEDBACK",
  });

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.flatMap((group) => group.decisionIds).sort(), [first.decisionId, differentOutcome.decisionId, differentRoute.decisionId].sort());
  assert.ok(groups.every((group) => group.compatibilityKey.includes("RECORD_RULE_FEEDBACK")));
});

test("only an explicit user action can pause or resume one rule without changing its authority", () => {
  const current = authorizeAgentRule(createAgentRuleAuthorization({
    ruleId: "EXPLICIT_TASK_01", displayName: "明确任务标记", skillName: "agent-decision-governance",
    skillVersion: "1.0.0", skillHash: "b".repeat(64), skillMaxAuthority: "AUTO_APPLY",
  }, observedAt), "DELAYED_APPLY", "USER", "用户批准", observedAt);

  assert.throws(() => setAgentRulePaused(current, true, "SYSTEM", "模型建议暂停", observedAt), /USER/);
  const paused = setAgentRulePaused(current, true, "USER", "用户在反馈中明确暂停", new Date("2026-08-02T05:10:00.000Z"));
  assert.equal(paused.paused, true);
  assert.equal(paused.localCurrentAuthority, "DELAYED_APPLY");
  assert.equal(setAgentRulePaused(paused, false, "USER", "用户恢复", new Date("2026-08-02T05:11:00.000Z")).paused, false);
});

test("global Agent writes pause is explicit, validated, and independent from observation", () => {
  const current = createAgentGovernanceSettings(observedAt);
  assert.deepEqual(validateAgentGovernanceSettings(structuredClone(current)), current);
  assert.throws(() => setAgentGlobalWritesPaused(current, true, "SYSTEM", observedAt), /USER/);
  const paused = setAgentGlobalWritesPaused(current, true, "USER", new Date("2026-08-02T05:20:00.000Z"));
  assert.equal(paused.globalWritesPaused, true);
  assert.equal(setAgentGlobalWritesPaused(paused, false, "USER", new Date("2026-08-02T05:21:00.000Z")).globalWritesPaused, false);
});
