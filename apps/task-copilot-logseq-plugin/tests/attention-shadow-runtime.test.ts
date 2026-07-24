import assert from "node:assert/strict";
import test from "node:test";

import { AttentionShadowRepository } from "@task-copilot/application";
import type { V2Anchor, V2ManagedObject, V2Proposal } from "@task-copilot/domain";
import type { ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";

import {
  attentionShadowCurrentSignature,
  buildAttentionDetectorSnapshot,
  runAttentionShadowCycle,
  summarizeDynamicNowShadow,
} from "../src/attention-shadow-runtime.ts";

const now = "2026-07-24T10:00:00.000Z";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  return {
    objectId: "task-1",
    objectType: "TASK",
    version: 3,
    lifecycle: "OPEN",
    condition: {
      kind: "WAITING",
      waitingFor: "外部",
      expectedResult: "事件",
      reviewAt: "2026-07-24T09:00:00.000Z",
    },
    text: "这段完整正文绝不能进入 shadow telemetry",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
}

function proposal(overrides: Partial<V2Proposal> = {}): ServiceStoredProposal {
  const value: V2Proposal = {
    proposalId: "proposal-1",
    schemaVersion: "v2",
    title: "不能进入 shadow telemetry 的标题",
    context: "context",
    understanding: "understanding",
    objective: "objective",
    logic: "logic",
    finalPreview: "preview",
    unresolvedQuestions: [],
    source: { kind: "user" },
    scope: {
      read: [{ kind: "BLOCK", id: "block-1", hash: "aaaaaaaa" }],
      modify: [{ kind: "OBJECT", id: "task-1", version: 3 }],
    },
    preconditions: [],
    groups: [{
      groupId: "group-1",
      explanation: "explanation",
      risk: "LOW",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [],
      semanticOperations: [],
      disposition: "ACCEPTED",
    }],
    status: "ACCEPTED",
    createdAt: "2026-07-24T08:00:00.000Z",
    ...overrides,
  };
  return { proposal: value, files: { proposalMd: "private", proposalJson: "private" }, updatedAt: "2026-07-24T09:30:00.000Z" };
}

test("runtime adapter projects only structured Service facts and derives existing object targets", () => {
  const snapshot = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object()],
    proposals: [proposal()],
    commits: [],
    anchors: [{
      anchorId: "anchor-1",
      objectId: "task-1",
      graphId: "graph-key",
      externalId: "block-1",
      role: "primary_text",
      contentHash: "aaaaaaaa",
      status: "active",
      lastSeenAt: now,
    }],
  });

  assert.deepEqual(snapshot.proposals[0]?.targetObjectIds, ["task-1"]);
  assert.equal(snapshot.objects[0]?.condition.reviewAt, "2026-07-24T09:00:00.000Z");
  const serialized = JSON.stringify(snapshot);
  for (const privateValue of ["这段完整正文绝不能进入", "不能进入 shadow telemetry 的标题", "private"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("create Proposal and unscoped Commit retain Proposal/Commit subjects without invented object IDs", () => {
  const create = proposal({
    proposalId: "proposal-create",
    scope: {
      read: [{ kind: "BLOCK", id: "block-create", hash: "bbbbbbbb" }],
      modify: [{ kind: "BLOCK", id: "block-create", hash: "bbbbbbbb" }],
    },
  });
  const commits: ServiceSemanticCommit[] = [{
    semanticCommitId: "commit-create",
    proposalId: "proposal-create",
    status: "PENDING",
    beforeStateChecksum: "aaaaaaaa",
    createdAt: now,
    updatedAt: now,
  }];
  const snapshot = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [],
    proposals: [create],
    commits,
    anchors: [],
  });
  const summary = runAttentionShadowCycle(new AttentionShadowRepository(), snapshot);

  assert.deepEqual(snapshot.proposals[0]?.targetObjectIds, []);
  assert.deepEqual(snapshot.commits[0]?.objectIds, []);
  assert.equal(summary.rawCount, 2);
  assert.equal(summary.mergedCount, 2);
  assert.deepEqual(summary.primaryByType, {
    ACCEPTED_NOT_APPLIED: 1,
    COMMIT_PENDING: 1,
  });
});

test("runtime shadow cycle reconciles disappearance and emits counts only", () => {
  const repository = new AttentionShadowRepository();
  const active = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object()],
    proposals: [],
    commits: [],
    anchors: [],
  });
  const first = runAttentionShadowCycle(repository, active);
  assert.equal(first.rawCount, 1);
  assert.equal(first.activeCount, 1);

  const cleared = runAttentionShadowCycle(repository, {
    ...active,
    observedAt: "2026-07-24T11:00:00.000Z",
    objects: [],
  });
  assert.equal(cleared.rawCount, 0);
  assert.equal(cleared.activeCount, 0);
  assert.equal(cleared.invalidatedCurrentCount, 1);

  const serialized = JSON.stringify(cleared);
  assert.equal(serialized.includes("task-1"), false);
  assert.equal(serialized.includes("object:"), false);
  assert.equal(serialized.includes("text"), false);
});

test("runtime adapter maps only supported primary Anchor states and leaves source arrays unchanged", () => {
  const objects = [object()];
  const proposals = [proposal()];
  const commits: ServiceSemanticCommit[] = [];
  const anchors: V2Anchor[] = [{
    anchorId: "anchor-1",
    objectId: "task-1",
    graphId: "graph-key",
    externalId: "block-1",
    role: "primary_text",
    contentHash: "aaaaaaaa",
    status: "conflict",
    lastSeenAt: now,
  }];
  const sourceBefore = JSON.stringify({ objects, proposals, commits, anchors });
  const snapshot = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects,
    proposals,
    commits,
    anchors,
  });

  assert.equal(snapshot.anchors[0]?.status, "conflict");
  assert.equal(JSON.stringify({ objects, proposals, commits, anchors }), sourceBefore);
});

test("current telemetry signature ignores timestamps and cumulative confirmations", () => {
  const repository = new AttentionShadowRepository();
  const snapshot = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object()],
    proposals: [],
    commits: [],
    anchors: [],
  });
  const first = runAttentionShadowCycle(repository, snapshot);
  const repeated = runAttentionShadowCycle(repository, {
    ...snapshot,
    observedAt: "2026-07-24T10:05:00.000Z",
  });

  assert.notEqual(first.observedAt, repeated.observedAt);
  assert.notEqual(first.confirmedTotal, repeated.confirmedTotal);
  assert.equal(attentionShadowCurrentSignature(first), attentionShadowCurrentSignature(repeated));
  assert.notEqual(
    attentionShadowCurrentSignature(first),
    attentionShadowCurrentSignature({ ...repeated, activeCount: repeated.activeCount + 1 }),
  );
});

test("dynamic Now runtime summary contains only counts and preserves an empty suggestion surface", () => {
  const summary = summarizeDynamicNowShadow({
    observedAt: now,
    objects: [
      object({ objectId: "focus-actionable", condition: { kind: "ACTIONABLE" } }),
      object({
        objectId: "waiting-due",
        text: "这段正文不能进入 Now telemetry",
        condition: {
          kind: "WAITING",
          waitingFor: "外部",
          expectedResult: "答复",
          reviewAt: "2026-07-24T09:00:00.000Z",
        },
      }),
      object({ objectId: "ordinary-open", condition: { kind: "ACTIONABLE" } }),
    ],
    activeFocusObjectIds: ["focus-actionable"],
  });

  assert.deepEqual(summary, {
    continueCount: 1,
    reviewCount: 1,
    waitingCount: 0,
    suggestionCount: 0,
    suppressedOpenCount: 1,
    reviewOverflowCount: 0,
    waitingOverflowCount: 0,
    focusOverload: false,
  });
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("focus-actionable"), false);
  assert.equal(serialized.includes("waiting-due"), false);
  assert.equal(serialized.includes("这段正文"), false);
});
