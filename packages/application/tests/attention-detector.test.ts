import assert from "node:assert/strict";
import test from "node:test";

import {
  AttentionShadowRepository,
  detectDeterministicAttentionSignals,
  mergeDeterministicAttentionSignals,
  type AttentionDetectorSnapshot,
} from "../src/index.ts";

const now = "2026-07-24T08:00:00.000Z";

function snapshot(overrides: Partial<AttentionDetectorSnapshot> = {}): AttentionDetectorSnapshot {
  return {
    observedAt: now,
    graph: { graphKey: "test-graph", binding: "MATCH" },
    objects: [],
    proposals: [],
    commits: [],
    anchors: [],
    ...overrides,
  };
}

test("deterministic detector opens only due facts and merges reviewAt ahead of due for one object", () => {
  const candidates = detectDeterministicAttentionSignals(snapshot({
    objects: [
      {
        objectId: "task-both",
        objectType: "TASK",
        version: 3,
        lifecycle: "OPEN",
        condition: { kind: "WAITING", reviewAt: "2026-07-24T07:00:00.000Z" },
        dueAt: "2026-07-24T06:00:00.000Z",
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
      {
        objectId: "task-future",
        objectType: "TASK",
        version: 1,
        lifecycle: "OPEN",
        condition: { kind: "WAITING", reviewAt: "2026-07-25T00:00:00.000Z" },
        dueAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
      {
        objectId: "task-complete",
        objectType: "TASK",
        version: 2,
        lifecycle: "COMPLETED",
        condition: { kind: "ACTIONABLE" },
        dueAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
  }));

  assert.deepEqual(candidates.map((candidate) => candidate.signalType).sort(), ["DUE", "REVIEW_DUE"]);
  const merged = mergeDeterministicAttentionSignals(candidates, [], now);
  assert.equal(merged.rawCount, 2);
  assert.equal(merged.mergedCount, 1);
  assert.equal(merged.issues[0]?.primary.signalType, "REVIEW_DUE");
  assert.deepEqual(merged.issues[0]?.suppressedSignalTypes, ["DUE"]);
});

test("accepted-not-applied is derived from accepted groups and disappears after a completed commit", () => {
  const accepted = {
    proposalId: "proposal-1",
    status: "ACCEPTED" as const,
    acceptedGroupCount: 1,
    targetObjectIds: ["task-1"],
    updatedAt: "2026-07-24T07:30:00.000Z",
  };
  const before = detectDeterministicAttentionSignals(snapshot({ proposals: [accepted] }));
  assert.deepEqual(before.map((candidate) => candidate.signalType), ["ACCEPTED_NOT_APPLIED"]);

  const after = detectDeterministicAttentionSignals(snapshot({
    proposals: [accepted],
    commits: [{
      semanticCommitId: "commit-1",
      proposalId: "proposal-1",
      status: "COMPLETED",
      objectIds: ["task-1"],
      updatedAt: "2026-07-24T07:45:00.000Z",
    }],
  }));
  assert.deepEqual(after, []);
});

test("a create Proposal without a formal object stays attached to its Proposal subject instead of inventing object identity", () => {
  const [candidate] = detectDeterministicAttentionSignals(snapshot({
    proposals: [{
      proposalId: "proposal-create-1",
      status: "ACCEPTED",
      acceptedGroupCount: 1,
      targetObjectIds: [],
      updatedAt: "2026-07-24T07:30:00.000Z",
    }],
  }));

  assert.equal(candidate?.signalType, "ACCEPTED_NOT_APPLIED");
  assert.equal(candidate?.subjectRef, "proposal:proposal-create-1");
  assert.equal(candidate?.objectId, undefined);
  assert.equal(candidate?.mergeTarget, "proposal:proposal-create-1");
});

test("recovery and integrity facts outrank accepted work and can never be cooled down", () => {
  const candidates = detectDeterministicAttentionSignals(snapshot({
    proposals: [{
      proposalId: "proposal-1",
      status: "ACCEPTED",
      acceptedGroupCount: 1,
      targetObjectIds: ["task-1"],
      updatedAt: "2026-07-24T07:00:00.000Z",
    }],
    commits: [{
      semanticCommitId: "commit-recovery",
      proposalId: "proposal-1",
      status: "RECOVERY_REQUIRED",
      objectIds: ["task-1"],
      updatedAt: "2026-07-24T07:30:00.000Z",
    }],
    anchors: [{
      anchorId: "anchor-1",
      objectId: "task-1",
      status: "conflict",
      observedAt: "2026-07-24T07:40:00.000Z",
    }],
  }));
  const merged = mergeDeterministicAttentionSignals(candidates, [], now);

  assert.equal(merged.issues[0]?.primary.signalType, "COMMIT_RECOVERY_REQUIRED");
  assert.equal(merged.issues[0]?.primary.cooldown.policy, "NEVER");
  assert.deepEqual(merged.issues[0]?.suppressedSignalTypes, ["ANCHOR_CONFLICT", "ACCEPTED_NOT_APPLIED"]);
});

test("Graph mismatch is one system-level primary issue rather than one signal per object", () => {
  const candidates = detectDeterministicAttentionSignals(snapshot({
    graph: { graphKey: "test-graph", binding: "MISMATCH" },
    objects: [
      {
        objectId: "task-1",
        objectType: "TASK",
        version: 1,
        lifecycle: "OPEN",
        condition: { kind: "ACTIONABLE" },
        updatedAt: now,
      },
      {
        objectId: "task-2",
        objectType: "TASK",
        version: 1,
        lifecycle: "OPEN",
        condition: { kind: "ACTIONABLE" },
        updatedAt: now,
      },
    ],
  }));

  assert.deepEqual(candidates.map((candidate) => ({
    type: candidate.signalType,
    objectId: candidate.objectId,
    subjectRef: candidate.subjectRef,
    policy: candidate.cooldown.policy,
  })), [{
    type: "GRAPH_MISMATCH",
    objectId: undefined,
    subjectRef: "graph:test-graph",
    policy: "NEVER",
  }]);
});

test("eligible cooldown suppresses a repeated issue while new evidence clears it through reconciliation", () => {
  const firstCandidates = detectDeterministicAttentionSignals(snapshot({
    objects: [{
      objectId: "task-1",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      dueAt: "2026-07-24T07:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    }],
  }));
  const repository = new AttentionShadowRepository();
  const [record] = repository.reconcile("object:task-1", firstCandidates, now);
  repository.setCooldown(record!.signalId, "2026-07-25T08:00:00.000Z");

  const cooled = mergeDeterministicAttentionSignals(firstCandidates, repository.list(), now);
  assert.deepEqual(cooled.issues, []);
  assert.equal(cooled.cooledCount, 1);

  const changedCandidates = detectDeterministicAttentionSignals(snapshot({
    observedAt: "2026-07-24T09:00:00.000Z",
    objects: [{
      objectId: "task-1",
      objectType: "TASK",
      version: 2,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      dueAt: "2026-07-24T07:00:00.000Z",
      updatedAt: "2026-07-24T08:30:00.000Z",
    }],
  }));
  repository.reconcile("object:task-1", changedCandidates, "2026-07-24T09:00:00.000Z");
  const uncooled = mergeDeterministicAttentionSignals(
    changedCandidates,
    repository.list(),
    "2026-07-24T09:00:00.000Z",
  );
  assert.equal(uncooled.issues[0]?.primary.signalType, "DUE");
  assert.equal(uncooled.cooledCount, 0);
});

test("detector output remains shadow-only and contains structured references rather than object text", () => {
  const [candidate] = detectDeterministicAttentionSignals(snapshot({
    anchors: [{
      anchorId: "anchor-1",
      objectId: "task-1",
      status: "missing",
      observedAt: now,
    }],
  }));
  const collectKeys = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(collectKeys);
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    return [...Object.keys(record), ...Object.values(record).flatMap(collectKeys)];
  };
  const keys = collectKeys(candidate);

  assert.deepEqual(candidate?.proposedDisplay, { level: "SHADOW", surface: "NONE" });
  assert.match(candidate?.sourceFacts[0]?.sourceRef ?? "", /^anchor:/);
  assert.equal(keys.includes("text"), false);
  assert.equal(keys.includes("content"), false);
  assert.equal(keys.includes("summary"), false);
});
