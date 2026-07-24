import assert from "node:assert/strict";
import test from "node:test";

import {
  AttentionShadowRepository,
  type AttentionSignalCandidate,
} from "../src/attention-shadow.ts";

const HASH_A = "a".repeat(8);
const HASH_B = "b".repeat(8);
const at = "2026-07-24T03:00:00.000Z";

function candidate(overrides: Partial<AttentionSignalCandidate> = {}): AttentionSignalCandidate {
  return {
    signalType: "REVIEW_DUE",
    subjectRef: "object:task-1",
    objectId: "task-1",
    evaluationKey: "object:task-1",
    detectedAt: at,
    sourceFacts: [{
      factCode: "CONDITION_REVIEW_AT_DUE",
      sourceRef: "object:task-1@v3",
      observedAt: at,
      fingerprint: HASH_A,
    }],
    urgency: "MEDIUM",
    certainty: "FACT",
    contextRelevance: "HIGH",
    proposedDisplay: { level: "SHADOW", surface: "NONE" },
    mergeTarget: "object:task-1",
    cooldown: { policy: "ELIGIBLE" },
    provenance: {
      rule: { id: "review-at-due", version: "1.0.0" },
    },
    evidenceScope: {
      kind: "OBJECT",
      refs: ["object:task-1@v3"],
      scopeHash: HASH_A,
    },
    ...overrides,
  };
}

test("shadow signal records every required lifecycle and provenance field without a full-text slot", () => {
  const repository = new AttentionShadowRepository();
  const [record] = repository.reconcile("object:task-1", [candidate()], at);

  assert.equal(record?.firstDetectedAt, at);
  assert.equal(record?.lastConfirmedAt, at);
  assert.deepEqual(record?.invalidation, { state: "ACTIVE" });
  assert.equal(record?.shownCount, 0);
  assert.deepEqual(record?.userDisposition, { kind: "UNSEEN" });
  assert.equal(record?.proposedDisplay.level, "SHADOW");
  assert.equal(record?.proposedDisplay.surface, "NONE");
  assert.equal("text" in (record ?? {}), false);
  assert.equal("content" in (record ?? {}), false);
  assert.equal("summary" in (record ?? {}), false);
});

test("reconciliation preserves first detection, confirms the same issue, and invalidates an absent fact", () => {
  const repository = new AttentionShadowRepository();
  const [first] = repository.reconcile("object:task-1", [candidate()], at);
  const later = "2026-07-24T04:00:00.000Z";
  const [confirmed] = repository.reconcile("object:task-1", [candidate({ detectedAt: later })], later);

  assert.equal(confirmed?.signalId, first?.signalId);
  assert.equal(confirmed?.firstDetectedAt, at);
  assert.equal(confirmed?.lastConfirmedAt, later);
  assert.equal(repository.metrics().confirmed, 1);

  assert.deepEqual(repository.reconcile("object:task-1", [], "2026-07-24T05:00:00.000Z"), []);
  assert.deepEqual(repository.get(first!.signalId)?.invalidation, {
    state: "INVALIDATED",
    reasonCode: "FACT_NOT_CONFIRMED",
    invalidatedAt: "2026-07-24T05:00:00.000Z",
  });
});

test("a changed evidence scope clears cooldown but never promotes a shadow signal", () => {
  const repository = new AttentionShadowRepository();
  const [first] = repository.reconcile("object:task-1", [candidate()], at);
  repository.setCooldown(first!.signalId, "2026-07-25T03:00:00.000Z");
  repository.markShown(first!.signalId, "2026-07-24T03:05:00.000Z");
  repository.setDisposition(first!.signalId, "DISMISSED", "2026-07-24T03:06:00.000Z");

  const changed = candidate({
    detectedAt: "2026-07-24T06:00:00.000Z",
    sourceFacts: [{
      factCode: "CONDITION_REVIEW_AT_DUE",
      sourceRef: "object:task-1@v4",
      observedAt: "2026-07-24T06:00:00.000Z",
      fingerprint: HASH_B,
    }],
    evidenceScope: {
      kind: "OBJECT",
      refs: ["object:task-1@v4"],
      scopeHash: HASH_B,
    },
  });
  const [record] = repository.reconcile("object:task-1", [changed], changed.detectedAt);

  assert.deepEqual(record?.cooldown, { policy: "ELIGIBLE" });
  assert.equal(record?.shownCount, 1);
  assert.deepEqual(record?.userDisposition, {
    kind: "DISMISSED",
    recordedAt: "2026-07-24T03:06:00.000Z",
  });
  assert.deepEqual(record?.proposedDisplay, { level: "SHADOW", surface: "NONE" });
  assert.equal(repository.metrics().evidenceChanged, 1);
});

test("non-coolable recovery facts reject cooldown and shadow storage stays bounded and clearable", () => {
  const repository = new AttentionShadowRepository({ maxRecords: 2 });
  const [recovery] = repository.reconcile("object:task-1", [candidate({
    signalType: "COMMIT_RECOVERY_REQUIRED",
    cooldown: { policy: "NEVER" },
  })], at);
  assert.throws(
    () => repository.setCooldown(recovery!.signalId, "2026-07-25T03:00:00.000Z"),
    /cannot be cooled down/,
  );

  repository.reconcile("object:task-2", [candidate({
    objectId: "task-2",
    evaluationKey: "object:task-2",
    mergeTarget: "object:task-2",
  })], at);
  assert.throws(
    () => repository.reconcile("object:task-3", [candidate({
      objectId: "task-3",
      evaluationKey: "object:task-3",
      mergeTarget: "object:task-3",
    })], at),
    /capacity/,
  );
  assert.equal(repository.list().length, 2);
  repository.clear();
  assert.deepEqual(repository.list(), []);
  assert.equal(repository.metrics().cleared, 2);
});

test("shadow repository rejects user-visible candidates and plaintext-shaped evidence", () => {
  const repository = new AttentionShadowRepository();
  assert.throws(
    () => repository.reconcile("object:task-1", [candidate({
      proposedDisplay: { level: "VISIBLE", surface: "NOW" },
    })], at),
    /SHADOW.*NONE/,
  );
  assert.throws(
    () => repository.reconcile("object:task-1", [candidate({
      sourceFacts: [{
        factCode: "CONDITION_REVIEW_AT_DUE",
        sourceRef: "完整正文\n不应进入影子存储",
        observedAt: at,
        fingerprint: HASH_A,
      }],
    })], at),
    /sourceRef/,
  );
});
