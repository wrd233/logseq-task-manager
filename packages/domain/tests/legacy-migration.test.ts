import assert from "node:assert/strict";
import test from "node:test";

import { previewLegacyStateMigration, type AttentionSignal, type ExecutionCondition, type Phase } from "../src/index.ts";

const hash = "a".repeat(64);
const base = { legacyObjectId: "legacy-1", sourceBundleSha256: hash, objectType: "TASK" as const, signals: [] as AttentionSignal[], evidenceRefs: ["object:legacy-1"] };

test("all legacy Phase values map deterministically without recreating a progress state axis", () => {
  const progress: Phase[] = ["CLARIFY", "READY", "ACTIVE", "CLOSING", "DEFINING", "IDEA", "PLANNED", "DORMANT", "RETIRED"];
  for (const phase of progress) {
    const preview = previewLegacyStateMigration({ ...base, phase, condition: { kind: "ACTIONABLE" } });
    assert.equal(preview.suggestedLifecycle, "OPEN");
    assert.equal(preview.oldPhase, phase);
    assert.match(preview.informationLoss.join(" "), new RegExp(phase));
    if (phase === "ACTIVE") assert.equal(preview.suggestedFocus, null);
  }
  assert.equal(previewLegacyStateMigration({ ...base, phase: "COMPLETED", condition: { kind: "ACTIONABLE" }, completionEvidenceConsistent: true }).suggestedLifecycle, "COMPLETED");
  assert.equal(previewLegacyStateMigration({ ...base, phase: "CANCELLED", condition: { kind: "ACTIONABLE" }, cancellationEvidence: true }).suggestedLifecycle, "CANCELLED");
  assert.equal(previewLegacyStateMigration({ ...base, phase: "ARCHIVED", condition: { kind: "ACTIONABLE" }, archiveEvidence: true }).suggestedLifecycle, "ARCHIVED");
  assert.equal(previewLegacyStateMigration({ ...base, phase: "COMPLETED", condition: { kind: "ACTIONABLE" } }).classification, "STRUCTURAL_ERROR");
});

test("legacy Conditions preserve complete evidence and refuse incomplete waiting, blocked, or paused facts", () => {
  const cases: Array<{ input: ExecutionCondition; expected: string }> = [
    { input: { kind: "ACTIONABLE" }, expected: "ACTIONABLE" },
    { input: { kind: "WAITING", waitingFor: "审批", expectedResult: "批准", reviewAt: "2026-07-22T08:00:00.000Z", startedAt: "2026-07-21T08:00:00.000Z" }, expected: "WAITING" },
    { input: { kind: "BLOCKED", reason: "依赖未完成", blockerObjectId: "task-2" }, expected: "BLOCKED" },
    { input: { kind: "PAUSED", reason: "下周恢复", reviewAt: "2026-07-28T08:00:00.000Z" }, expected: "PAUSED" },
  ];
  for (const { input, expected } of cases) assert.equal(previewLegacyStateMigration({ ...base, phase: "ACTIVE", condition: input }).suggestedCondition?.kind, expected);
  assert.equal(previewLegacyStateMigration({ ...base, phase: "ACTIVE", condition: { kind: "NONE" } }).classification, "NEEDS_CONFIRMATION");
  assert.equal(previewLegacyStateMigration({ ...base, phase: "ACTIVE", condition: { kind: "WAITING", waitingFor: "", expectedResult: "批准", reviewAt: "bad", startedAt: "" } }).classification, "STRUCTURAL_ERROR");
});

test("every legacy Signal becomes recomputation or issue evidence and never persistent V2 state", () => {
  const signals: AttentionSignal[] = ["OVERDUE", "REVIEW_DUE", "STALE", "NO_NEXT_ACTION", "UNASSIGNED", "BOUNDARY_DRIFT", "UNHARVESTED_OUTPUT", "CONFLICT"];
  const preview = previewLegacyStateMigration({ ...base, phase: "ACTIVE", condition: { kind: "ACTIONABLE" }, signals, explicitFocusEvidence: "用户明确标为本周关注" });
  assert.equal(preview.oldSignals.length, signals.length);
  assert.equal(preview.reasonCodes.filter((code) => code.startsWith("SIGNAL_")).length, signals.length);
  assert.deepEqual(preview.suggestedFocus, { reason: "用户明确标为本周关注" });
  assert.equal("signals" in preview, false);
});

test("non-V2 legacy object types remain ordinary and conflicts never become direct binds", () => {
  const ordinary = previewLegacyStateMigration({ ...base, objectType: "RESOURCE", phase: "ACTIVE", condition: { kind: "ACTIONABLE" } });
  assert.equal(ordinary.classification, "KEEP_ORDINARY");
  assert.equal(ordinary.suggestedObjectType, undefined);
  const conflict = previewLegacyStateMigration({ ...base, phase: "ACTIVE", condition: { kind: "ACTIONABLE" }, stateConflict: "Phase and Commit disagree" });
  assert.equal(conflict.classification, "STRUCTURAL_ERROR");
  assert.deepEqual(conflict.decision, "PENDING_REVIEW");
  assert.equal(conflict.rollbackRef, null);
});
