import assert from "node:assert/strict";
import test from "node:test";

import { AttentionShadowRepository, type CrossObjectObservationDraft } from "@task-copilot/application";
import type { V2Anchor, V2ManagedObject, V2Proposal } from "@task-copilot/domain";
import type { ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";

import {
  AttentionShadowSession,
  attentionShadowCurrentSignature,
  buildAttentionDetectorSnapshot,
  decodeAttentionNowPilotPrimaryValue,
  encodeAttentionNowPilotPrimaryValue,
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

test("Now Attention pilot decorates only existing timing cards and does not duplicate formal risk surfaces", () => {
  const session = new AttentionShadowSession();
  session.run(buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [
      object(),
      object({
        objectId: "task-due",
        condition: { kind: "ACTIONABLE" },
        dueAt: "2026-07-24T09:30:00.000Z",
      }),
    ],
    proposals: [proposal()],
    commits: [],
    anchors: [],
  }));

  const hints = session.projectNowPilot({
    observedAt: now,
    visibleObjectIds: ["task-1", "task-due"],
  });

  assert.deepEqual(hints.map(({ objectId, signalType }) => ({ objectId, signalType })), [
    { objectId: "task-due", signalType: "DUE" },
  ]);
});

test("Now Attention pilot cools a deferred reminder and reopens it after the bounded session cooldown", () => {
  const session = new AttentionShadowSession();
  const snapshot = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object()],
    proposals: [],
    commits: [],
    anchors: [],
  });
  session.run(snapshot);
  const first = session.projectNowPilot({ observedAt: now, visibleObjectIds: ["task-1"] });

  assert.equal(first.length, 1);
  const result = session.applyNowPilotDisposition({
    signalId: first[0]!.signalId,
    disposition: "LATER",
    recordedAt: "2026-07-24T10:01:00.000Z",
  });

  assert.deepEqual(result, {
    signalType: "REVIEW_DUE",
    disposition: "LATER",
    cooldownUntil: "2026-07-25T10:01:00.000Z",
  });
  assert.deepEqual(session.projectNowPilot({
    observedAt: "2026-07-24T10:02:00.000Z",
    visibleObjectIds: ["task-1"],
  }), []);

  session.run({ ...snapshot, observedAt: "2026-07-25T10:02:00.000Z" });
  assert.equal(session.projectNowPilot({
    observedAt: "2026-07-25T10:02:00.000Z",
    visibleObjectIds: ["task-1"],
  }).length, 1);
});

test("Now Attention pilot counts a completed primary action as engagement without claiming helpfulness", () => {
  const session = new AttentionShadowSession();
  session.run(buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object()],
    proposals: [],
    commits: [],
    anchors: [],
  }));
  const [hint] = session.projectNowPilot({ observedAt: now, visibleObjectIds: ["task-1"] });

  assert.ok(hint);
  const result = session.markNowPilotActed({
    signalId: hint.signalId,
    recordedAt: "2026-07-24T10:01:00.000Z",
  });

  assert.deepEqual(result, {
    signalType: "REVIEW_DUE",
    cooldownUntil: "2026-07-25T10:01:00.000Z",
  });
  assert.deepEqual(session.projectNowPilot({
    observedAt: "2026-07-24T10:02:00.000Z",
    visibleObjectIds: ["task-1"],
  }), []);
  assert.deepEqual(session.nowPilotQuality(), {
    shown: 1,
    acted: 1,
    later: 0,
    notRelevant: 0,
    unresolved: 0,
  });
  const serialized = JSON.stringify(session.nowPilotQuality());
  assert.equal(serialized.includes("task-1"), false);
  assert.equal(serialized.includes("完整正文"), false);
});

test("Now Attention pilot quality keeps bounded aggregate helpful and noise evidence", () => {
  const session = new AttentionShadowSession();
  session.run(buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [
      object(),
      object({ objectId: "task-later", condition: { kind: "WAITING", waitingFor: "外部", expectedResult: "稍后", reviewAt: "2026-07-24T09:05:00.000Z" } }),
      object({ objectId: "task-noise", condition: { kind: "WAITING", waitingFor: "外部", expectedResult: "无关", reviewAt: "2026-07-24T09:10:00.000Z" } }),
      object({ objectId: "task-unresolved", condition: { kind: "WAITING", waitingFor: "外部", expectedResult: "未处置", reviewAt: "2026-07-24T09:15:00.000Z" } }),
    ],
    proposals: [],
    commits: [],
    anchors: [],
  }));
  const hints = session.projectNowPilot({
    observedAt: now,
    visibleObjectIds: ["task-1", "task-later", "task-noise", "task-unresolved"],
  });
  const byObject = new Map(hints.map((hint) => [hint.objectId, hint]));

  session.markNowPilotActed({ signalId: byObject.get("task-1")!.signalId, recordedAt: "2026-07-24T10:01:00.000Z" });
  session.applyNowPilotDisposition({ signalId: byObject.get("task-later")!.signalId, disposition: "LATER", recordedAt: "2026-07-24T10:02:00.000Z" });
  session.applyNowPilotDisposition({ signalId: byObject.get("task-noise")!.signalId, disposition: "NOT_RELEVANT", recordedAt: "2026-07-24T10:03:00.000Z" });

  assert.deepEqual(session.nowPilotQuality(), {
    shown: 4,
    acted: 1,
    later: 1,
    notRelevant: 1,
    unresolved: 1,
  });
});

test("Now Attention pilot primary-action transport preserves the existing action value", () => {
  assert.deepEqual(
    decodeAttentionNowPilotPrimaryValue(
      encodeAttentionNowPilotPrimaryValue("task-1|3", "attention_review"),
    ),
    { value: "task-1|3", signalId: "attention_review" },
  );
  assert.deepEqual(
    decodeAttentionNowPilotPrimaryValue("block-uuid"),
    { value: "block-uuid" },
  );
  assert.deepEqual(
    decodeAttentionNowPilotPrimaryValue("block-uuid|attention="),
    { value: "block-uuid|attention=" },
  );
});

test("Now Attention pilot invalidates resolved facts and lets changed evidence bypass an old disposition", () => {
  const session = new AttentionShadowSession();
  const base = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object()],
    proposals: [],
    commits: [],
    anchors: [],
  });
  session.run(base);
  const first = session.projectNowPilot({ observedAt: now, visibleObjectIds: ["task-1"] });
  session.applyNowPilotDisposition({
    signalId: first[0]!.signalId,
    disposition: "NOT_RELEVANT",
    recordedAt: "2026-07-24T10:01:00.000Z",
  });
  assert.deepEqual(session.projectNowPilot({
    observedAt: "2026-07-24T10:02:00.000Z",
    visibleObjectIds: ["task-1"],
  }), []);

  session.run(buildAttentionDetectorSnapshot({
    observedAt: "2026-07-24T10:03:00.000Z",
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object({
      version: 4,
      condition: {
        kind: "WAITING",
        waitingFor: "外部",
        expectedResult: "变化后的事件",
        reviewAt: "2026-07-24T09:30:00.000Z",
      },
    })],
    proposals: [],
    commits: [],
    anchors: [],
  }));
  assert.equal(session.projectNowPilot({
    observedAt: "2026-07-24T10:03:00.000Z",
    visibleObjectIds: ["task-1"],
  }).length, 1);

  session.run(buildAttentionDetectorSnapshot({
    observedAt: "2026-07-24T10:04:00.000Z",
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object({ version: 5, condition: { kind: "ACTIONABLE" } })],
    proposals: [],
    commits: [],
    anchors: [],
  }));
  assert.deepEqual(session.projectNowPilot({
    observedAt: "2026-07-24T10:04:00.000Z",
    visibleObjectIds: ["task-1"],
  }), []);
});

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

test("a fresh shadow session recomputes the same current projection without persisted history", () => {
  const snapshot = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [object()],
    proposals: [proposal()],
    commits: [],
    anchors: [],
  });
  const currentSession = new AttentionShadowRepository();
  const beforeReload = runAttentionShadowCycle(currentSession, snapshot);
  const reloadedSession = new AttentionShadowRepository();
  const recomputed = runAttentionShadowCycle(reloadedSession, {
    ...snapshot,
    observedAt: "2026-07-24T10:05:00.000Z",
  });
  const dynamicNow = summarizeDynamicNowShadow({
    observedAt: now,
    objects: [object()],
    activeFocusObjectIds: [],
  });

  assert.equal(
    attentionShadowCurrentSignature(beforeReload, dynamicNow),
    attentionShadowCurrentSignature(recomputed, dynamicNow),
  );
  assert.deepEqual(
    currentSession.list().map(({ signalId, signalType, evidenceScope }) => ({ signalId, signalType, scopeHash: evidenceScope.scopeHash })),
    reloadedSession.list().map(({ signalId, signalType, evidenceScope }) => ({ signalId, signalType, scopeHash: evidenceScope.scopeHash })),
    "signal identity and current evidence are recomputed from formal facts rather than persisted shadow state",
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

test("bounded cross-object observations enter the existing session shadow as count-only telemetry", () => {
  const crossObjectObservations: CrossObjectObservationDraft[] = [{
    kind: "OWNERSHIP_CANDIDATE",
    subjectRefs: ["object:task-1@v3", "object:mini-1@v2"],
    scope: { kind: "OBJECT", rootRef: "object:task-1@v3" },
    primaryObjectId: "task-1",
    evidenceFacts: [{
      factCode: "OWNERSHIP_MISSING",
      sourceRef: "object:task-1@v3",
      observedAt: now,
      fingerprint: "aaaaaaaa",
    }, {
      factCode: "BOUNDED_CONTEXT_MATCH",
      sourceRef: "object:mini-1@v2",
      observedAt: now,
      fingerprint: "bbbbbbbb",
    }],
    confidence: "MEDIUM",
    provenance: {
      skill: { id: "cross-object-observation", version: "0.1.0" },
      prompt: { id: "cross-object-shadow", version: "0.1.0" },
      model: { provider: "deepseek", id: "deepseek-v4-flash", version: "configured" },
    },
  }];
  const snapshot = buildAttentionDetectorSnapshot({
    observedAt: now,
    graphKey: "graph-key",
    graphBinding: "MATCH",
    objects: [],
    proposals: [],
    commits: [],
    anchors: [],
    crossObjectObservations,
  });
  const summary = runAttentionShadowCycle(new AttentionShadowRepository(), snapshot);

  assert.equal(summary.rawCount, 1);
  assert.equal(summary.mergedCount, 1);
  assert.deepEqual(summary.primaryByType, { LLM_CROSS_OBJECT: 1 });
  const serialized = JSON.stringify(summary);
  for (const privateValue of ["task-1", "mini-1", "object:", "OWNERSHIP_MISSING"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});
