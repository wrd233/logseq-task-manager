import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceNowWork, ServiceNowWorkItem } from "@task-copilot/service-client";

import { projectNowFrontstageSections } from "../src/now-frontstage.ts";

const generatedAt = "2026-07-29T02:00:00.000Z";

function item(
  objectId: string,
  condition: ServiceNowWorkItem["condition"] = { kind: "ACTIONABLE" },
  overrides: Partial<ServiceNowWorkItem> = {},
): ServiceNowWorkItem {
  return {
    objectId,
    objectType: "TASK",
    version: 1,
    text: objectId,
    condition,
    updatedAt: generatedAt,
    reason: objectId,
    ...overrides,
  };
}

function nowWork(overrides: Partial<ServiceNowWork> = {}): ServiceNowWork {
  return {
    generatedAt,
    focus: [],
    next: [],
    waitingReview: [],
    conditionOptions: [],
    ...overrides,
  };
}

test("frontstage keeps actionable Focus and ordinary next work in one continuation region", () => {
  const projection = projectNowFrontstageSections(nowWork({
    focus: [item("focus")],
    next: [item("next")],
  }));

  assert.deepEqual(projection.continueProcessing.map(({ item: value }) => value.objectId), ["focus", "next"]);
  assert.equal(projection.continueProcessing[0]?.focused, true);
  assert.equal(projection.continueProcessing[1]?.focused, false);
  assert.deepEqual(projection.needsReview, []);
  assert.deepEqual(projection.keepWaiting, []);
});

test("focused future Waiting appears once under keep waiting instead of duplicating Focus", () => {
  const waiting = item("waiting", {
    kind: "WAITING",
    waitingFor: "网络组",
    expectedResult: "确认",
    reviewAt: "2026-07-30T02:00:00.000Z",
  });
  const projection = projectNowFrontstageSections(nowWork({
    focus: [waiting],
    waitingReview: [waiting],
  }));

  assert.deepEqual(projection.continueProcessing, []);
  assert.deepEqual(projection.needsReview, []);
  assert.deepEqual(projection.keepWaiting.map(({ item: value }) => value.objectId), ["waiting"]);
  assert.equal(projection.keepWaiting[0]?.focused, true);
});

test("due Waiting, paused review and blocked Focus become one review item each", () => {
  const waiting = item("waiting-due", {
    kind: "WAITING",
    waitingFor: "负责人",
    expectedResult: "回复",
    reviewAt: "2026-07-29T01:00:00.000Z",
  });
  const paused = item("paused-due", {
    kind: "PAUSED",
    reason: "下个周期继续",
    reviewAt: "2026-07-29T01:30:00.000Z",
  });
  const blocked = item("blocked", { kind: "BLOCKED", reason: "缺少环境" });
  const projection = projectNowFrontstageSections(nowWork({
    focus: [blocked],
    waitingReview: [waiting, paused, blocked],
  }));

  assert.deepEqual(
    projection.needsReview.map(({ item: value }) => value.objectId),
    ["blocked", "waiting-due", "paused-due"],
  );
  assert.equal(new Set(projection.needsReview.map(({ item: value }) => value.objectId)).size, 3);
  assert.deepEqual(projection.keepWaiting, []);
});

test("overdue next work needs review while a near deadline remains actionable", () => {
  const projection = projectNowFrontstageSections(nowWork({
    next: [
      item("overdue", { kind: "ACTIONABLE" }, { dueAt: "2026-07-29T01:00:00.000Z" }),
      item("due-soon", { kind: "ACTIONABLE" }, { dueAt: "2026-07-30T02:00:00.000Z" }),
    ],
  }));

  assert.deepEqual(projection.needsReview.map(({ item: value }) => value.objectId), ["overdue"]);
  assert.deepEqual(projection.continueProcessing.map(({ item: value }) => value.objectId), ["due-soon"]);
});

test("invalid generatedAt fails closed before rendering a misleading partition", () => {
  assert.throws(
    () => projectNowFrontstageSections(nowWork({ generatedAt: "invalid" })),
    /generatedAt/,
  );
});
