import assert from "node:assert/strict";
import test from "node:test";

import type { FocusSelection, V2ManagedObject } from "@task-copilot/domain";

import { projectV2DynamicNowShadow } from "../src/dynamic-now-shadow.ts";

const at = new Date("2026-07-24T10:00:00.000Z");

function object(
  objectId: string,
  condition: V2ManagedObject["condition"] = { kind: "ACTIONABLE" },
  overrides: Partial<V2ManagedObject> = {},
): V2ManagedObject {
  return {
    objectId,
    objectType: "TASK",
    version: 1,
    lifecycle: "OPEN",
    condition,
    text: objectId,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
}

function focus(objectId: string, rank: number): FocusSelection {
  return {
    objectId,
    rank,
    selectedAt: `2026-07-24T0${rank}:00:00.000Z`,
  };
}

test("shadow Now keeps the stable three-region skeleton and never loads ordinary OPEN wholesale", () => {
  const projection = projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [
      object("focus-second"),
      object("focus-first"),
      object("ordinary-open"),
      object("quiet-waiting", {
        kind: "WAITING",
        waitingFor: "供应商",
        expectedResult: "回复",
        reviewAt: "2026-08-24T10:00:00.000Z",
      }),
    ],
    focus: [focus("focus-second", 1), focus("focus-first", 0)],
  });

  assert.equal(projection.visibility, "SHADOW");
  assert.deepEqual(projection.continueProcessing.map((item) => item.object.objectId), ["focus-first", "focus-second"]);
  assert.deepEqual(projection.needsReview, []);
  assert.deepEqual(projection.keepWaiting, []);
  assert.deepEqual(projection.suggestedAttention, []);
  assert.equal(JSON.stringify(projection).includes("ordinary-open"), false);
  assert.equal(JSON.stringify(projection).includes("quiet-waiting"), false);
  assert.equal(projection.metrics.rawOpenCount, 4);
  assert.equal(projection.metrics.projectedObjectCount, 2);
  assert.equal(projection.metrics.suppressedOpenCount, 2);
});

test("due review, near due and completed blocker enter review exactly once", () => {
  const projection = projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [
      object("waiting-due", {
        kind: "WAITING",
        waitingFor: "负责人",
        expectedResult: "确认",
        reviewAt: "2026-07-24T09:00:00.000Z",
      }),
      object("due-soon", { kind: "ACTIONABLE" }, {
        dueAt: "2026-07-27T10:00:00.000Z",
      }),
      object("blocked", {
        kind: "BLOCKED",
        reason: "等待准备工作",
        blockerObjectId: "blocker",
      }),
      object("blocker", { kind: "ACTIONABLE" }, {
        lifecycle: "COMPLETED",
      }),
    ],
    focus: [focus("waiting-due", 0), focus("due-soon", 1)],
  });

  assert.deepEqual(projection.needsReview.map((item) => item.object.objectId), [
    "blocked",
    "waiting-due",
    "due-soon",
  ]);
  assert.deepEqual(projection.continueProcessing, []);
  assert.equal(projection.needsReview[0]?.narration.nextAction?.intent, "REVIEW_BLOCKER");
  assert.equal(projection.needsReview[1]?.narration.nextAction?.intent, "REVIEW_WAITING");
  assert.equal(new Set(projection.needsReview.map((item) => item.object.objectId)).size, 3);
});

test("focused future WAITING and PAUSED stay compact while focused BLOCKED needs review", () => {
  const projection = projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [
      object("waiting", {
        kind: "WAITING",
        waitingFor: "供应商",
        expectedResult: "回复",
        reviewAt: "2026-08-24T10:00:00.000Z",
      }),
      object("paused", {
        kind: "PAUSED",
        reason: "等待新周期",
        reviewAt: "2026-08-24T10:00:00.000Z",
      }),
      object("blocked", {
        kind: "BLOCKED",
        reason: "缺少环境",
      }),
    ],
    focus: [focus("waiting", 0), focus("paused", 1), focus("blocked", 2)],
  });

  assert.deepEqual(projection.keepWaiting.map((item) => item.object.objectId), ["waiting", "paused"]);
  assert.deepEqual(projection.needsReview.map((item) => item.object.objectId), ["blocked"]);
  assert.equal(projection.keepWaiting.every((item) => item.narration.nextActionEligible === false), true);
});

test("unsupported, closed, expired Focus and far deadlines are excluded", () => {
  const projection = projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [
      object("area", { kind: "ACTIONABLE" }, { objectType: "AREA" }),
      object("closed", { kind: "ACTIONABLE" }, { lifecycle: "COMPLETED" }),
      object("expired-focus"),
      object("far-due", { kind: "ACTIONABLE" }, { dueAt: "2026-08-24T10:00:00.000Z" }),
    ],
    focus: [
      focus("area", 0),
      focus("closed", 1),
      { ...focus("expired-focus", 2), expiresAt: "2026-07-24T09:00:00.000Z" },
    ],
  });

  assert.equal(projection.metrics.rawOpenCount, 3);
  assert.equal(projection.metrics.projectedObjectCount, 0);
  assert.equal(JSON.stringify(projection).includes("area"), false);
  assert.equal(JSON.stringify(projection).includes("closed"), false);
  assert.equal(JSON.stringify(projection).includes("expired-focus"), false);
  assert.equal(JSON.stringify(projection).includes("far-due"), false);
});

test("Focus remains user-owned and only receives a gentle overload fact after seven items", () => {
  const objects = Array.from({ length: 8 }, (_, index) => object(`focus-${index}`));
  const selections = objects.map((value, index) => focus(value.objectId, index));
  const projection = projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects,
    focus: selections,
  });

  assert.equal(projection.continueProcessing.length, 8);
  assert.equal(projection.metrics.focusCount, 8);
  assert.equal(projection.metrics.focusOverload, true);
  assert.equal(projection.focusHint, "当前关注已有 8 项；可以在方便时自行整理，系统不会自动移出。");
  assert.deepEqual(selections.map((item) => item.objectId), objects.map((item) => item.objectId));
});

test("review and waiting sections are bounded without truncating user Focus continuation", () => {
  const dueObjects = Array.from({ length: 15 }, (_, index) => object(
    `due-${String(index).padStart(2, "0")}`,
    { kind: "ACTIONABLE" },
    { dueAt: "2026-07-25T10:00:00.000Z" },
  ));
  const focusObjects = Array.from({ length: 14 }, (_, index) => object(`focus-${index}`));
  const projection = projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [...dueObjects, ...focusObjects],
    focus: focusObjects.map((value, index) => focus(value.objectId, index)),
    sectionLimit: 12,
  });

  assert.equal(projection.needsReview.length, 12);
  assert.equal(projection.continueProcessing.length, 14);
  assert.equal(projection.metrics.reviewOverflowCount, 3);
});

test("invalid timestamps and section bounds fail before projection", () => {
  assert.throws(() => projectV2DynamicNowShadow({
    observedAt: "not-a-time",
    objects: [],
    focus: [],
  }), /observedAt/);
  assert.throws(() => projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [],
    focus: [],
    sectionLimit: 0,
  }), /sectionLimit/);
  assert.throws(() => projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [object("duplicate"), object("duplicate")],
    focus: [],
  }), /unique/);
  assert.throws(() => projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [object("duplicate-focus")],
    focus: [focus("duplicate-focus", 0), focus("duplicate-focus", 1)],
  }), /at most once/);
  assert.throws(() => projectV2DynamicNowShadow({
    observedAt: at.toISOString(),
    objects: [object("invalid-expiry")],
    focus: [{ ...focus("invalid-expiry", 0), expiresAt: "not-a-time" }],
  }), /expiresAt/);
});
