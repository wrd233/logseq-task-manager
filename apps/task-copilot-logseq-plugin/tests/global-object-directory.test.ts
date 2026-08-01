import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";
import type { ServiceFocusSelection, ServiceNowWork } from "@task-copilot/service-client";

import { defaultDirectoryFilterState, filterAndSortDirectoryEntries, projectGlobalObjectDirectory } from "../src/global-object-directory.ts";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  return {
    objectId: "obj",
    objectType: "TASK",
    version: 1,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "对象",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
}

const nowWork: ServiceNowWork = {
  generatedAt: "2026-08-01T00:00:00.000Z",
  focus: [{ objectId: "obj-focus", objectType: "TASK", version: 1, text: "关注对象", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-31T00:00:00.000Z", reason: "已加入当前关注" }],
  next: [{ objectId: "obj-next", objectType: "TASK", version: 1, text: "下一项", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-31T00:00:00.000Z", reason: "近期更新" }],
  waitingReview: [{ objectId: "obj-waiting", objectType: "TASK", version: 1, text: "等待项", condition: { kind: "WAITING", waitingFor: "回复", expectedResult: "确认", reviewAt: "2026-08-01T00:00:00.000Z" }, updatedAt: "2026-07-31T00:00:00.000Z", reason: "复查已到" }],
  conditionOptions: [],
};

test("directory projection includes every object type with stable default sort", () => {
  const objects = [
    object({ objectId: "obj-a", objectType: "AREA", updatedAt: "2026-07-30T00:00:00.000Z" }),
    object({ objectId: "obj-b", objectType: "DECISION", updatedAt: "2026-08-01T00:00:00.000Z" }),
    object({ objectId: "obj-c", objectType: "OUTPUT", updatedAt: "2026-07-31T00:00:00.000Z" }),
  ];
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships: [], focusSelections: [] });
  assert.deepEqual(entries.map((entry) => entry.objectId), ["obj-b", "obj-c", "obj-a"]);
  assert.deepEqual(new Set(entries.map((entry) => entry.objectType)), new Set(["AREA", "DECISION", "OUTPUT"]));
});

test("closed objects carry no current condition while OPEN objects keep theirs", () => {
  const objects = [
    object({ objectId: "obj-open", lifecycle: "OPEN", condition: { kind: "BLOCKED", reason: "等依赖" } }),
    object({ objectId: "obj-completed", lifecycle: "COMPLETED", condition: { kind: "ACTIONABLE" } }),
    object({ objectId: "obj-cancelled", lifecycle: "CANCELLED", condition: { kind: "WAITING", waitingFor: "x", expectedResult: "y", reviewAt: "2026-08-01T00:00:00.000Z" } }),
    object({ objectId: "obj-archived", lifecycle: "ARCHIVED", condition: { kind: "PAUSED", reason: "归档" } }),
  ];
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships: [], focusSelections: [] });
  const byId = new Map(entries.map((entry) => [entry.objectId, entry]));
  assert.deepEqual(byId.get("obj-open")?.condition, { kind: "BLOCKED", reason: "等依赖" });
  assert.equal(byId.get("obj-completed")?.condition, undefined);
  assert.equal(byId.get("obj-cancelled")?.condition, undefined);
  assert.equal(byId.get("obj-archived")?.condition, undefined);
});

test("active primary anchor wins and missing anchor falls back for honest display", () => {
  const objects = [object({ objectId: "obj-active" }), object({ objectId: "obj-missing" })];
  const anchors: V2Anchor[] = [
    { anchorId: "a1", objectId: "obj-active", role: "primary_text", graphId: "g", externalId: "block-active", status: "active", contentHash: "h", lastSeenAt: "2026-08-01T00:00:00.000Z" },
    { anchorId: "a2", objectId: "obj-missing", role: "primary_text", graphId: "g", externalId: "block-gone", status: "missing", contentHash: "h", lastSeenAt: "2026-07-01T00:00:00.000Z" },
    { anchorId: "a3", objectId: "obj-missing", role: "source", graphId: "g", externalId: "source", status: "active", contentHash: "h", lastSeenAt: "2026-08-01T00:00:00.000Z" },
  ];
  const entries = projectGlobalObjectDirectory({ objects, anchors, ownerships: [], focusSelections: [] });
  const byId = new Map(entries.map((entry) => [entry.objectId, entry]));
  assert.deepEqual(byId.get("obj-active")?.primaryAnchor, { externalId: "block-active", status: "active" });
  assert.deepEqual(byId.get("obj-missing")?.primaryAnchor, { externalId: "block-gone", status: "missing" });
});

test("ownership resolves owner text and missing relations do not throw", () => {
  const objects = [
    object({ objectId: "obj-child", text: "子事项" }),
    object({ objectId: "obj-owner", text: "父项目" }),
    object({ objectId: "obj-alone", text: "无归属" }),
  ];
  const ownerships = [{ childObjectId: "obj-child", ownerObjectId: "obj-owner", assignedAt: "2026-08-01T00:00:00.000Z" }];
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships, focusSelections: [] });
  const byId = new Map(entries.map((entry) => [entry.objectId, entry]));
  assert.deepEqual(byId.get("obj-child")?.ownership, { ownerObjectId: "obj-owner", ownerText: "父项目" });
  assert.equal(byId.get("obj-alone")?.ownership, undefined);
});

test("focus selections map by rank and now placement comes from the read-only projection", () => {
  const objects = [
    object({ objectId: "obj-focus" }),
    object({ objectId: "obj-next" }),
    object({ objectId: "obj-waiting" }),
    object({ objectId: "obj-closed-focus", lifecycle: "COMPLETED" }),
  ];
  const focusSelections: ServiceFocusSelection[] = [
    { objectId: "obj-closed-focus", selectedAt: "2026-08-01T00:00:00.000Z", rank: 0 },
    { objectId: "obj-focus", selectedAt: "2026-08-01T00:00:00.000Z", rank: 1 },
  ];
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships: [], focusSelections, nowWork });
  const byId = new Map(entries.map((entry) => [entry.objectId, entry]));
  assert.equal(byId.get("obj-focus")?.focus.selected, true);
  assert.equal(byId.get("obj-focus")?.focus.rank, 1);
  assert.equal(byId.get("obj-closed-focus")?.focus.selected, true);
  assert.deepEqual(byId.get("obj-focus")?.now, { section: "focus", reason: "已加入当前关注" });
  assert.deepEqual(byId.get("obj-next")?.now, { section: "next", reason: "近期更新" });
  assert.deepEqual(byId.get("obj-waiting")?.now, { section: "waitingReview", reason: "复查已到" });
  assert.equal(byId.get("obj-closed-focus")?.now, undefined);
  const state = defaultDirectoryFilterState();
  assert.deepEqual(filterAndSortDirectoryEntries(entries, { ...state, focus: "focus" }).map((entry) => entry.objectId), ["obj-focus"]);
});

test("due and updated summaries stay machine-readable in the projection", () => {
  const objects = [object({ objectId: "obj-due", dueAt: "2026-08-05T00:00:00.000Z" })];
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships: [], focusSelections: [] });
  assert.equal(entries[0]?.dueAt, "2026-08-05T00:00:00.000Z");
  assert.equal(entries[0]?.updatedAt, "2026-07-31T00:00:00.000Z");
});

test("directory filters combine search, focus, type, lifecycle and condition", () => {
  const objects = [
    object({ objectId: "task-a", objectType: "TASK", text: "整理RedHat题目", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-31T00:00:00.000Z" }),
    object({ objectId: "task-b", objectType: "TASK", text: "等待发布窗口", lifecycle: "OPEN", condition: { kind: "WAITING", waitingFor: "窗口", expectedResult: "确认", reviewAt: "2026-08-02T00:00:00.000Z" }, updatedAt: "2026-07-30T00:00:00.000Z" }),
    object({ objectId: "project-done", objectType: "PROJECT", text: "已交付项目", lifecycle: "COMPLETED", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-29T00:00:00.000Z" }),
  ];
  const focusSelections: ServiceFocusSelection[] = [{ objectId: "task-a", selectedAt: "2026-08-01T00:00:00.000Z", rank: 0 }];
  const testNowWork: ServiceNowWork = {
    generatedAt: "2026-08-01T00:00:00.000Z",
    focus: [{ objectId: "task-a", objectType: "TASK", version: 1, text: "整理RedHat题目", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-31T00:00:00.000Z", reason: "已加入当前关注" }],
    next: [{ objectId: "task-b", objectType: "TASK", version: 1, text: "等待发布窗口", condition: { kind: "WAITING", waitingFor: "窗口", expectedResult: "确认", reviewAt: "2026-08-02T00:00:00.000Z" }, updatedAt: "2026-07-30T00:00:00.000Z", reason: "近期更新" }],
    waitingReview: [],
    conditionOptions: [],
  };
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships: [], focusSelections, nowWork: testNowWork });
  const state = defaultDirectoryFilterState();

  assert.deepEqual(filterAndSortDirectoryEntries(entries, state).map((entry) => entry.objectId), ["task-a", "task-b", "project-done"]);

  const searched = filterAndSortDirectoryEntries(entries, { ...state, search: "REDHAT" });
  assert.deepEqual(searched.map((entry) => entry.objectId), ["task-a"]);

  const focused = filterAndSortDirectoryEntries(entries, { ...state, focus: "focus" });
  assert.deepEqual(focused.map((entry) => entry.objectId), ["task-a"]);

  const inNow = filterAndSortDirectoryEntries(entries, { ...state, focus: "now" });
  assert.deepEqual(inNow.map((entry) => entry.objectId), ["task-a", "task-b"]);

  const typed = filterAndSortDirectoryEntries(entries, { ...state, type: "PROJECT" });
  assert.deepEqual(typed.map((entry) => entry.objectId), ["project-done"]);

  const lifecycle = filterAndSortDirectoryEntries(entries, { ...state, lifecycle: "COMPLETED" });
  assert.deepEqual(lifecycle.map((entry) => entry.objectId), ["project-done"]);

  const waiting = filterAndSortDirectoryEntries(entries, { ...state, condition: "WAITING" });
  assert.deepEqual(waiting.map((entry) => entry.objectId), ["task-b"]);

  const combined = filterAndSortDirectoryEntries(entries, { ...state, focus: "focus", type: "TASK", condition: "ACTIONABLE" });
  assert.deepEqual(combined.map((entry) => entry.objectId), ["task-a"]);

  const none = filterAndSortDirectoryEntries(entries, { ...state, search: "不存在" });
  assert.deepEqual(none, []);
});

test("directory sorts cover title, type, lifecycle, due and focus priority", () => {
  const objects = [
    object({ objectId: "b", text: "贝塔", objectType: "MINI_PROJECT", updatedAt: "2026-07-30T00:00:00.000Z" }),
    object({ objectId: "a", text: "阿尔法", objectType: "TASK", dueAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" }),
    object({ objectId: "c", text: "伽马", objectType: "PROJECT", lifecycle: "COMPLETED", updatedAt: "2026-08-01T00:00:00.000Z" }),
    object({ objectId: "d", text: "德尔塔", objectType: "DECISION", dueAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" }),
  ];
  const focusSelections: ServiceFocusSelection[] = [{ objectId: "d", selectedAt: "2026-08-01T00:00:00.000Z", rank: 0 }];
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships: [], focusSelections });
  const state = defaultDirectoryFilterState();

  assert.deepEqual(filterAndSortDirectoryEntries(entries, { ...state, sort: "title" }).map((entry) => entry.objectId), ["a", "b", "d", "c"]);
  assert.deepEqual(filterAndSortDirectoryEntries(entries, { ...state, sort: "type" }).map((entry) => entry.objectId), ["c", "b", "a", "d"]);
  assert.deepEqual(filterAndSortDirectoryEntries(entries, { ...state, sort: "lifecycle" }).map((entry) => entry.objectId), ["a", "b", "d", "c"]);
  assert.deepEqual(filterAndSortDirectoryEntries(entries, { ...state, sort: "due" }).map((entry) => entry.objectId), ["d", "a", "c", "b"]);
  assert.deepEqual(filterAndSortDirectoryEntries(entries, { ...state, sort: "focus" }).map((entry) => entry.objectId), ["d", "c", "a", "b"]);
});

test("directory projection and filters stay correct and bounded at 500 objects", () => {
  const objects: V2ManagedObject[] = Array.from({ length: 500 }, (_, index) => object({
    objectId: `obj-${String(index).padStart(3, "0")}`,
    objectType: index % 5 === 0 ? "PROJECT" : "TASK",
    text: index % 3 === 0 ? `GOD 性能验证 ${index}` : `普通事项 ${index}`,
    lifecycle: index % 7 === 0 ? "COMPLETED" : "OPEN",
    condition: { kind: "ACTIONABLE" },
    updatedAt: `2026-08-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
  }));
  const focusSelections: ServiceFocusSelection[] = [{ objectId: "obj-042", selectedAt: "2026-08-01T00:00:00.000Z", rank: 0 }];
  const started = performance.now();
  const entries = projectGlobalObjectDirectory({ objects, anchors: [], ownerships: [], focusSelections });
  const state = defaultDirectoryFilterState();
  const searched = filterAndSortDirectoryEntries(entries, { ...state, search: "GOD 性能验证", type: "TASK" });
  const lifecycle = filterAndSortDirectoryEntries(entries, { ...state, lifecycle: "COMPLETED" });
  const sorted = filterAndSortDirectoryEntries(entries, { ...state, sort: "title" });
  const elapsed = performance.now() - started;
  assert.equal(entries.length, 500);
  assert.ok(searched.length > 0 && searched.every((entry) => entry.text.includes("GOD 性能验证") && entry.objectType === "TASK"));
  assert.ok(lifecycle.every((entry) => entry.lifecycle === "COMPLETED"));
  assert.equal(sorted.length, 500);
  assert.ok(elapsed < 2_000, `500-object projection/filter/sort took ${elapsed.toFixed(0)}ms`);
});
