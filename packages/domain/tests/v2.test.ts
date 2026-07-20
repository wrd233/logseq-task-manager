import assert from "node:assert/strict";
import test from "node:test";

import {
  V2_OBJECT_TYPES,
  assignV2PrimaryOwner,
  bindV2PrimaryAnchor,
  createV2ManagedObject,
  observeV2PrimaryAnchor,
  selectFocus,
  synchronizeV2ExplicitObject,
  transitionV2Lifecycle,
  validateV2Condition,
} from "../src/v2.ts";

test("V2 exposes exactly six user-visible object types without Phase or Signal", () => {
  assert.deepEqual(V2_OBJECT_TYPES, ["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"]);
  const object = createV2ManagedObject({ objectType: "TASK", text: " [任务] 验证外部推送 " }, new Date("2026-07-20T00:00:00Z"));
  assert.equal(object.lifecycle, "OPEN");
  assert.deepEqual(object.condition, { kind: "ACTIONABLE" });
  assert.equal(object.text, "[任务] 验证外部推送");
  assert.equal("phase" in object, false);
  assert.equal("signals" in object, false);
});

test("Primary Anchor and Ownership are versioned domain changes independent of location", () => {
  const task = createV2ManagedObject({ objectId: "task-1", objectType: "TASK", text: "任务" });
  const project = createV2ManagedObject({ objectId: "project-1", objectType: "PROJECT", text: "项目" });
  const bound = bindV2PrimaryAnchor(task, {
    anchorId: "anchor-1",
    graphId: "graph-1",
    externalId: "block-uuid-1",
    contentHash: "hash-1",
  }, 1, new Date("2026-07-20T07:00:00Z"));
  assert.equal(bound.object.version, 2);
  assert.deepEqual(bound.anchor, {
    anchorId: "anchor-1",
    objectId: "task-1",
    graphId: "graph-1",
    externalId: "block-uuid-1",
    role: "primary_text",
    status: "active",
    contentHash: "hash-1",
    lastSeenAt: "2026-07-20T07:00:00.000Z",
  });
  const assigned = assignV2PrimaryOwner(bound.object, project, 2, new Date("2026-07-20T07:01:00Z"));
  assert.equal(assigned.object.version, 3);
  assert.deepEqual(assigned.ownership, {
    childObjectId: "task-1",
    ownerObjectId: "project-1",
    assignedAt: "2026-07-20T07:01:00.000Z",
  });
  assert.throws(() => assignV2PrimaryOwner(project, task, 1), /不能/);
});

test("Primary Anchor observation preserves the object and can recover the same UUID", () => {
  const initial = createV2ManagedObject({ objectId: "task-observed", objectType: "TASK", text: "核对告警" }, new Date("2026-07-20T08:00:00Z"));
  const bound = bindV2PrimaryAnchor(initial, {
    anchorId: "anchor-observed",
    graphId: "graph-1",
    externalId: "block-observed",
    contentHash: "11111111",
  }, initial.version, new Date("2026-07-20T08:01:00Z"));

  const missing = observeV2PrimaryAnchor(bound.object, bound.anchor, "missing", bound.object.version, new Date("2026-07-20T08:02:00Z"));
  assert.equal(missing.object.objectId, initial.objectId);
  assert.equal(missing.object.version, 3);
  assert.equal(missing.anchor.status, "missing");
  assert.equal(missing.anchor.contentHash, "11111111");
  assert.equal(missing.anchor.lastSeenAt, bound.anchor.lastSeenAt, "missing observation must preserve the last confirmed sighting");

  const recovered = observeV2PrimaryAnchor(missing.object, missing.anchor, "active", missing.object.version, new Date("2026-07-20T08:03:00Z"));
  assert.equal(recovered.object.version, 4);
  assert.equal(recovered.anchor.status, "active");
  assert.equal(recovered.anchor.lastSeenAt, "2026-07-20T08:03:00.000Z");

  assert.throws(() => observeV2PrimaryAnchor(recovered.object, { ...recovered.anchor, status: "replaced" }, "active", recovered.object.version), /replaced/);
});
test("V2 lifecycle is small, version-checked, and terminal objects only archive", () => {
  const open = createV2ManagedObject({ objectId: "obj_1", objectType: "TASK", text: "完成验证" });
  const completed = transitionV2Lifecycle(open, "COMPLETED", 1, new Date("2026-07-20T01:00:00Z"));
  assert.equal(completed.version, 2);
  assert.equal(completed.lifecycle, "COMPLETED");
  assert.throws(() => transitionV2Lifecycle(completed, "CANCELLED", 2), /不允许/);
  assert.throws(() => transitionV2Lifecycle(completed, "ARCHIVED", 1), /版本/);
  assert.equal(transitionV2Lifecycle(completed, "ARCHIVED", 2).lifecycle, "ARCHIVED");
});

test("Condition requires its own evidence and Focus remains independent", () => {
  assert.throws(
    () => validateV2Condition({ kind: "WAITING", waitingFor: "", expectedResult: "答复", reviewAt: "2026-07-21" }),
    /等待谁或什么/,
  );
  const focus = selectFocus("obj_1", 0, new Date("2026-07-20T02:00:00Z"), "2026-07-21T02:00:00Z");
  assert.deepEqual(focus, {
    objectId: "obj_1",
    selectedAt: "2026-07-20T02:00:00.000Z",
    rank: 0,
    expiresAt: "2026-07-21T02:00:00Z",
  });
});

test("explicit synchronization updates title and Anchor evidence but refuses silent type migration", () => {
  const initial = createV2ManagedObject({ objectId: "task-sync", objectType: "TASK", text: "旧标题" });
  const bound = bindV2PrimaryAnchor(initial, {
    anchorId: "anchor-sync",
    graphId: "graph-1",
    externalId: "block-sync",
    contentHash: "11111111",
  }, 1, new Date("2026-07-20T07:00:00Z"));
  const synchronized = synchronizeV2ExplicitObject(bound.object, bound.anchor, {
    objectType: "TASK",
    text: "新标题",
    contentHash: "22222222",
  }, 2, new Date("2026-07-20T07:01:00Z"));
  assert.equal(synchronized.object.text, "新标题");
  assert.equal(synchronized.object.version, 3);
  assert.equal(synchronized.anchor.contentHash, "22222222");
  assert.equal(synchronized.anchor.lastSeenAt, "2026-07-20T07:01:00.000Z");
  assert.throws(() => synchronizeV2ExplicitObject(synchronized.object, synchronized.anchor, {
    objectType: "MINI_PROJECT",
    text: "不得静默迁移",
    contentHash: "33333333",
  }, 3), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL");
  assert.throws(() => synchronizeV2ExplicitObject(synchronized.object, synchronized.anchor, {
    objectType: "TASK",
    text: "过期更新",
    contentHash: "44444444",
  }, 2), /版本/);
});
