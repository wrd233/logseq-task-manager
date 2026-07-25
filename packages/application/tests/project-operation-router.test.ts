import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_OPERATION_INTENTS,
  routeProjectOperation,
} from "../src/project-operation-router.ts";

test("Project operation router gives every supported intent one bounded friction path", () => {
  assert.equal(PROJECT_OPERATION_INTENTS.length, 16);
  for (const intent of PROJECT_OPERATION_INTENTS) {
    const route = routeProjectOperation(intent);
    assert.equal(route.intent, intent);
    assert.ok(route.userOutcome.trim());
    assert.ok(route.safetyBoundary.trim());
    assert.ok(route.nextRoute.trim());
  }
});

test("attention and scheduling changes stay light while preserving explicit undo", () => {
  for (const intent of ["FOCUS_VISIBILITY", "CONDITION", "REVIEW_AT", "DUE_AT", "ASSOCIATION"] as const) {
    assert.deepEqual(
      routeProjectOperation(intent),
      {
        intent,
        friction: "LIGHT",
        flow: "DIRECT_WITH_UNDO",
        userOutcome: intent === "ASSOCIATION" ? "补充普通关联，不改变主归属。" : "调整当前注意力或时间状态。",
        safetyBoundary: intent === "ASSOCIATION"
          ? "只创建普通 Association；位置、Ownership、Lifecycle 与 Focus 不变。"
          : "只调用既有版本化命令；不改正文、Ownership 或 Project 结构。",
        nextRoute: intent === "ASSOCIATION" ? "PROJECT_ASSOCIATION" : "PROJECT_ATTENTION",
      },
    );
  }
});

test("bounded narration changes require review but never gain structure authority", () => {
  for (const intent of ["CURRENT_SUMMARY", "CURRENT_FOCUSES"] as const) {
    const route = routeProjectOperation(intent);
    assert.equal(route.friction, "MEDIUM");
    assert.equal(route.flow, "REVIEW_THEN_APPLY");
    assert.equal(route.nextRoute, "PROJECT_NARRATION_REVIEW");
    assert.match(route.safetyBoundary, /Ownership|Lifecycle|Objectives/);
  }
});

test("ownership, content movement, aggregate structure, and Closure can never be downgraded", () => {
  for (const intent of [
    "CURRENT_INTERFACE",
    "STAGE_MAPPING",
    "OWNERSHIP",
    "BULK_CHILDREN",
    "MOVE_CONTENT",
    "OBJECTIVES_DELIVERABLES",
    "SPLIT_MERGE",
    "CLOSURE",
    "EXTERNAL_AGENT",
  ] as const) {
    const route = routeProjectOperation(intent);
    assert.equal(route.friction, "HEAVY");
    assert.equal(route.flow, "DISCUSS_PREVIEW_COMMIT_UNDO");
    assert.match(route.safetyBoundary, /Proposal/);
    assert.match(route.safetyBoundary, /Commit/);
    assert.match(route.safetyBoundary, /Undo|Recovery/);
  }
});
