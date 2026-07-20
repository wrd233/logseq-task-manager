import assert from "node:assert/strict";
import test from "node:test";

import {
  V2_OBJECT_TYPES,
  createV2ManagedObject,
  selectFocus,
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
