import assert from "node:assert/strict";
import test from "node:test";

import type { V2ManagedObject } from "@task-copilot/domain";
import { projectV2NowWork } from "../src/v2-now-work.ts";

function object(objectId: string, condition: V2ManagedObject["condition"], updatedAt: string, lifecycle: V2ManagedObject["lifecycle"] = "OPEN", dueAt?: string): V2ManagedObject {
  return { objectId, objectType: "TASK", version: 1, lifecycle, condition, text: objectId, ...(dueAt ? { dueAt } : {}), createdAt: updatedAt, updatedAt, sourceOrCreationEvent: "test" };
}

test("V2 Now Work has three explainable regions, hides ordinary Waiting, and never loads historical OPEN wholesale", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const projection = projectV2NowWork([
    object("focus", { kind: "ACTIONABLE" }, "2026-07-01T00:00:00.000Z"),
    object("next", { kind: "ACTIONABLE" }, "2026-07-19T00:00:00.000Z"),
    object("historical-open", { kind: "ACTIONABLE" }, "2026-01-01T00:00:00.000Z"),
    object("waiting-due", { kind: "WAITING", waitingFor: "平台负责人", expectedResult: "事件", reviewAt: "2026-07-20T00:00:00.000Z" }, "2026-07-10T00:00:00.000Z"),
    object("waiting-quiet", { kind: "WAITING", waitingFor: "供应商", expectedResult: "回复", reviewAt: "2026-08-20T00:00:00.000Z" }, "2026-07-10T00:00:00.000Z"),
    object("completed", { kind: "ACTIONABLE" }, "2026-07-20T00:00:00.000Z", "COMPLETED"),
  ], [{ objectId: "focus", selectedAt: "2026-07-20T01:00:00.000Z", rank: 0 }], now);
  assert.deepEqual(projection.focus.map((item) => item.objectId), ["focus"]);
  assert.deepEqual(projection.next.map((item) => item.objectId), ["next"]);
  assert.deepEqual(projection.waitingReview.map((item) => item.objectId), ["waiting-due"]);
  assert.equal(JSON.stringify(projection).includes("historical-open"), false);
  assert.equal(JSON.stringify(projection).includes("waiting-quiet"), false);
  assert.equal(JSON.stringify(projection).includes("score"), false);
});

test("V2 Now Work surfaces explicit Task deadlines without scores and sorts them by time", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const projection = projectV2NowWork([
    object("recent", { kind: "ACTIONABLE" }, "2026-07-20T11:00:00.000Z"),
    object("due-later", { kind: "ACTIONABLE" }, "2026-01-01T00:00:00.000Z", "OPEN", "2026-07-23T12:00:00.000Z"),
    object("overdue", { kind: "ACTIONABLE" }, "2026-01-01T00:00:00.000Z", "OPEN", "2026-07-19T12:00:00.000Z"),
    object("far-due", { kind: "ACTIONABLE" }, "2026-01-01T00:00:00.000Z", "OPEN", "2026-08-20T12:00:00.000Z"),
  ], [], now);
  assert.deepEqual(projection.next.map((item) => item.objectId), ["overdue", "due-later", "recent"]);
  assert.deepEqual(projection.next.map((item) => item.reason), ["明确期限已到", "明确期限在 3 天内", "近期建立，可直接推进"]);
  assert.equal(JSON.stringify(projection).includes("score"), false);
  assert.equal(JSON.stringify(projection).includes("far-due"), false);
});

test("V2 Now Work surfaces the object that blocks Focus without inventing a score", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const projection = projectV2NowWork([
    object("focus-task", { kind: "BLOCKED", reason: "需要先恢复事件", blockerObjectId: "restore-event" }, "2026-07-20T10:00:00.000Z"),
    object("restore-event", { kind: "ACTIONABLE" }, "2026-01-01T00:00:00.000Z"),
    object("recent", { kind: "ACTIONABLE" }, "2026-07-20T11:00:00.000Z"),
  ], [{ objectId: "focus-task", selectedAt: "2026-07-20T11:00:00.000Z", rank: 0 }], now);
  assert.deepEqual(projection.next.map((item) => item.objectId), ["restore-event", "recent"]);
  assert.equal(projection.next[0]?.reason, "阻碍当前关注 · focus-task");
  assert.equal(JSON.stringify(projection).includes("score"), false);
});

test("V2 Now Work wakes a quiet Waiting object when it blocks Focus", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const projection = projectV2NowWork([
    object("focus-task", { kind: "BLOCKED", reason: "等待供应商", blockerObjectId: "supplier-reply" }, "2026-07-20T10:00:00.000Z"),
    object("supplier-reply", { kind: "WAITING", waitingFor: "供应商", expectedResult: "答复", reviewAt: "2026-08-20T00:00:00.000Z" }, "2026-07-01T00:00:00.000Z"),
  ], [{ objectId: "focus-task", selectedAt: "2026-07-20T11:00:00.000Z", rank: 0 }], now);
  assert.equal(projection.waitingReview.find((item) => item.objectId === "supplier-reply")?.reason, "阻碍当前关注 · 等待 供应商");
});
