import assert from "node:assert/strict";
import test from "node:test";

import {
  detectDeterministicAttentionSignals,
  materializeCrossObjectShadowCandidates,
  mergeDeterministicAttentionSignals,
  type AttentionDetectorSnapshot,
  type CrossObjectObservationDraft,
} from "../src/index.ts";

const observedAt = "2026-07-26T03:00:00.000Z";

function draft(overrides: Partial<CrossObjectObservationDraft> = {}): CrossObjectObservationDraft {
  return {
    kind: "TASK_CLUSTER_CANDIDATE",
    subjectRefs: ["object:task-1@v2", "object:task-2@v4", "object:mini-1@v3"],
    scope: { kind: "PROJECT", rootRef: "object:mini-1@v3" },
    primaryObjectId: "task-1",
    evidenceFacts: [{
      factCode: "SHARED_BOUNDED_CONTEXT",
      sourceRef: "project:project-1",
      observedAt,
      fingerprint: "aaaaaaaa",
    }, {
      factCode: "OWNERSHIP_MISSING",
      sourceRef: "object:task-1@v2",
      observedAt,
      fingerprint: "bbbbbbbb",
    }],
    confidence: "MEDIUM",
    provenance: {
      skill: { id: "cross-object-observation", version: "0.1.0" },
      prompt: { id: "cross-object-shadow", version: "0.1.0" },
      model: { provider: "deepseek", id: "deepseek-v4-flash", version: "configured" },
    },
    ...overrides,
  };
}

test("cross-object observations materialize only bounded inference signals with no write or prose slot", () => {
  const [candidate] = materializeCrossObjectShadowCandidates([draft()], observedAt);

  assert.equal(candidate?.signalType, "LLM_CROSS_OBJECT");
  assert.equal(candidate?.certainty, "INFERENCE");
  assert.equal(candidate?.objectId, "task-1");
  assert.equal(candidate?.mergeTarget, "object:task-1");
  assert.equal(candidate?.evidenceScope.kind, "PROJECT");
  assert.deepEqual(candidate?.proposedDisplay, { level: "SHADOW", surface: "NONE" });
  assert.deepEqual(candidate?.cooldown, { policy: "ELIGIBLE" });
  assert.equal(candidate?.sourceFacts.length, 2);
  assert.deepEqual(candidate?.provenance, {
    rule: { id: "cross-object-shadow", version: "1.0.0" },
    skill: { id: "cross-object-observation", version: "0.1.0" },
    prompt: { id: "cross-object-shadow", version: "0.1.0" },
    model: { provider: "deepseek", id: "deepseek-v4-flash", version: "configured" },
  });
  const serialized = JSON.stringify(candidate);
  for (const forbidden of ["summary", "content", "reasoning", "operation", "ownershipTarget", "focus"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("cross-object shadow rejects unbounded, duplicate, identity-inconsistent and prose-shaped observations", () => {
  assert.throws(
    () => materializeCrossObjectShadowCandidates(
      Array.from({ length: 9 }, (_, index) => draft({
        subjectRefs: [`object:task-${index}@v1`, `object:mini-${index}@v1`],
        primaryObjectId: `task-${index}`,
      })),
      observedAt,
    ),
    /at most 8/,
  );
  assert.throws(
    () => materializeCrossObjectShadowCandidates([
      draft({ subjectRefs: ["object:task-1@v2", "object:task-1@v2"] }),
    ], observedAt),
    /unique/,
  );
  assert.throws(
    () => materializeCrossObjectShadowCandidates([
      draft({ primaryObjectId: "task-outside" }),
    ], observedAt),
    /primaryObjectId/,
  );
  assert.throws(
    () => materializeCrossObjectShadowCandidates([
      { ...draft(), summary: "模型生成的自由正文不得进入 shadow 候选" } as CrossObjectObservationDraft,
    ], observedAt),
    /unsupported field summary/,
  );
});

test("cross-object observations join the existing attention shadow and lose priority to formal risk facts", () => {
  const snapshot: AttentionDetectorSnapshot = {
    observedAt,
    graph: { graphKey: "test-graph", binding: "MATCH" },
    objects: [{
      objectId: "task-1",
      objectType: "TASK",
      version: 2,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      dueAt: "2026-07-26T02:00:00.000Z",
      updatedAt: "2026-07-26T02:00:00.000Z",
    }],
    proposals: [],
    commits: [],
    anchors: [],
    crossObjectObservations: [draft()],
  };
  const candidates = detectDeterministicAttentionSignals(snapshot);
  assert.deepEqual(candidates.map(({ signalType }) => signalType).sort(), ["DUE", "LLM_CROSS_OBJECT"]);

  const merged = mergeDeterministicAttentionSignals(candidates, [], observedAt);
  assert.equal(merged.mergedCount, 1);
  assert.equal(merged.issues[0]?.primary.signalType, "DUE");
  assert.deepEqual(merged.issues[0]?.suppressedSignalTypes, ["LLM_CROSS_OBJECT"]);
});

test("an invalid LLM observation batch fails closed without suppressing deterministic attention", () => {
  const snapshot: AttentionDetectorSnapshot = {
    observedAt,
    graph: { graphKey: "test-graph", binding: "MATCH" },
    objects: [{
      objectId: "task-1",
      objectType: "TASK",
      version: 2,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      dueAt: "2026-07-26T02:00:00.000Z",
      updatedAt: "2026-07-26T02:00:00.000Z",
    }],
    proposals: [],
    commits: [],
    anchors: [],
    crossObjectObservations: [
      { ...draft(), summary: "invalid free-form model prose" } as CrossObjectObservationDraft,
    ],
  };

  const candidates = detectDeterministicAttentionSignals(snapshot);

  assert.deepEqual(candidates.map(({ signalType }) => signalType), ["DUE"]);
});
