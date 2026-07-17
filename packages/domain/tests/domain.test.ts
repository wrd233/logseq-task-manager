import assert from "node:assert/strict";
import test from "node:test";

import {
  addRelation,
  calculateSignals,
  createManagedObject,
  setCondition,
  setPrimaryOwnership,
  transitionPhase,
  type ManagedObject,
  type ObjectRelation,
} from "../src/index.ts";

const at = new Date("2026-07-17T12:00:00.000Z");

function task(overrides: Partial<ManagedObject> = {}): ManagedObject {
  return createManagedObject(
    {
      objectId: "obj_task",
      objectType: "TASK",
      text: "验证告警链路",
      completionCriteria: "保存真实事件证据",
      nextAction: "选择一条非 Test 事件",
      ...overrides,
    },
    at,
  );
}

test("Task can be ACTIVE and WAITING while REVIEW_DUE remains a calculated signal", () => {
  const active = transitionPhase(transitionPhase(task(), "READY", at), "ACTIVE", at);
  const waiting = setCondition(
    active,
    "WAITING",
    { waitingFor: "厂商", expectedResult: "确认接口范围", reviewAt: "2026-07-17T11:00:00.000Z" },
    at,
  );
  assert.equal(waiting.phase, "ACTIVE");
  assert.equal(waiting.condition.kind, "WAITING");
  assert.deepEqual(calculateSignals(waiting, [], at), ["REVIEW_DUE", "UNASSIGNED"]);
});

test("READY is rejected when a Task has no judgeable completion result", () => {
  const vague = task();
  delete vague.completionCriteria;
  assert.throws(
    () => transitionPhase(vague, "READY", at),
    (error: unknown) =>
      error instanceof Error &&
      "ruleRefs" in error &&
      (error as { ruleRefs: string[] }).ruleRefs.includes("SEM-TASK-001"),
  );
});

test("WAITING, BLOCKED and PAUSED enforce their own condition evidence", () => {
  assert.throws(() => setCondition(task(), "WAITING", {}, at), /waiting_for/i);
  assert.throws(() => setCondition(task(), "WAITING", { waitingFor: "答复", expectedResult: "确认", reviewAt: "not-a-date" }, at), /review_at/i);
  assert.throws(() => setCondition(task(), "BLOCKED", {}, at), /阻塞/);
  assert.throws(() => setCondition(task(), "PAUSED", {}, at), /暂停/);
});

test("primary ownership is unique and independent from physical placement", () => {
  const objects = [
    task(),
    createManagedObject({ objectId: "obj_project_a", objectType: "PROJECT", text: "项目 A" }, at),
    createManagedObject({ objectId: "obj_project_b", objectType: "PROJECT", text: "项目 B" }, at),
  ];
  const first = setPrimaryOwnership([], objects, "obj_task", "obj_project_a", at);
  const replaced = setPrimaryOwnership(first, objects, "obj_task", "obj_project_b", at);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]?.toObjectId, "obj_project_b");
});

test("depends_on rejects cycles through the public relation operation", () => {
  const objects = [task({ objectId: "obj_a" }), task({ objectId: "obj_b" }), task({ objectId: "obj_c" })];
  let relations: ObjectRelation[] = [];
  relations = addRelation(relations, objects, "obj_a", "obj_b", "depends_on", at);
  relations = addRelation(relations, objects, "obj_b", "obj_c", "depends_on", at);
  assert.throws(
    () => addRelation(relations, objects, "obj_c", "obj_a", "depends_on", at),
    (error: unknown) =>
      error instanceof Error &&
      "ruleRefs" in error &&
      (error as { ruleRefs: string[] }).ruleRefs.includes("REL-DEP-001"),
  );
});

test("ownership type matrix and two-level Area limit are deterministic", () => {
  const objects = [
    task(),
    createManagedObject({ objectId: "obj_project", objectType: "PROJECT", text: "项目" }, at),
    createManagedObject({ objectId: "obj_area", objectType: "AREA", text: "责任区" }, at),
    createManagedObject({ objectId: "obj_parent_area", objectType: "AREA", text: "上层责任区" }, at),
    createManagedObject({ objectId: "obj_root_area", objectType: "AREA", text: "根责任区" }, at),
  ];
  assert.throws(() => setPrimaryOwnership([], objects, "obj_project", "obj_task", at), /不能直接归属于/);
  const first = setPrimaryOwnership([], objects, "obj_area", "obj_parent_area", at);
  assert.throws(
    () => setPrimaryOwnership(first, objects, "obj_parent_area", "obj_root_area", at),
    (error: unknown) =>
      error instanceof Error &&
      "ruleRefs" in error &&
      (error as { ruleRefs: string[] }).ruleRefs.includes("REL-OWN-006"),
  );
});
