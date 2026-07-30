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
    assert.ok(route.releaseClass);
    assert.ok(route.userOutcome.trim());
    assert.ok(route.safetyBoundary.trim());
    assert.ok(route.nextRoute.trim());
  }
});

test("attention and scheduling changes stay light while preserving explicit undo", () => {
  for (const intent of ["FOCUS_VISIBILITY", "CONDITION", "REVIEW_AT"] as const) {
    assert.deepEqual(
      routeProjectOperation(intent),
      {
        intent,
        releaseClass: "BUILT_IN_DIRECT",
        friction: "LIGHT",
        flow: "DIRECT_WITH_UNDO",
        userOutcome: "调整当前注意力或时间状态。",
        safetyBoundary: "只调用既有版本化命令；不改正文、Ownership 或 Project 结构。",
        nextRoute: "PROJECT_ATTENTION",
      },
    );
  }
});

test("Project due and Association remain unavailable until semantics and inverse are complete", () => {
  for (const intent of ["DUE_AT", "ASSOCIATION"] as const) {
    const route = routeProjectOperation(intent);
    assert.equal(route.releaseClass, "NOT_AVAILABLE");
    assert.equal(route.flow, "NOT_AVAILABLE");
    assert.equal(route.nextRoute, "NONE");
    assert.match(route.safetyBoundary, /不开放/);
  }
});

test("bounded narration changes require review but never gain structure authority", () => {
  for (const intent of ["CURRENT_SUMMARY", "CURRENT_FOCUSES"] as const) {
    const route = routeProjectOperation(intent);
    assert.equal(route.releaseClass, "BUILT_IN_REVIEW");
    assert.equal(route.friction, "MEDIUM");
    assert.equal(route.flow, "REVIEW_THEN_APPLY");
    assert.equal(route.nextRoute, "PROJECT_NARRATION_REVIEW");
    assert.match(route.safetyBoundary, /Ownership|Lifecycle|Objectives/);
  }
});

test("built-in aggregate structure, Ownership, and Closure can never be downgraded", () => {
  for (const intent of [
    "CURRENT_INTERFACE",
    "STAGE_MAPPING",
    "OWNERSHIP",
    "OBJECTIVES_DELIVERABLES",
    "CLOSURE",
  ] as const) {
    const route = routeProjectOperation(intent);
    assert.equal(route.releaseClass, "BUILT_IN_REVIEW");
    assert.equal(route.friction, "HEAVY");
    assert.equal(route.flow, "DISCUSS_PREVIEW_COMMIT_UNDO");
    assert.match(route.safetyBoundary, /Proposal/);
    assert.match(route.safetyBoundary, /Commit/);
    assert.match(route.safetyBoundary, /Undo|Recovery/);
  }
});

test("large structural operations route to the external Agent boundary without gaining write authority", () => {
  for (const intent of ["BULK_CHILDREN", "MOVE_CONTENT", "SPLIT_MERGE", "EXTERNAL_AGENT"] as const) {
    const route = routeProjectOperation(intent);
    assert.equal(route.releaseClass, "EXTERNAL_AGENT");
    assert.equal(route.friction, "HEAVY");
    assert.equal(route.flow, "EXTERNAL_AGENT_PREVIEW_COMMIT");
    assert.equal(route.nextRoute, "EXTERNAL_AGENT_HANDOFF");
    assert.match(route.safetyBoundary, /Proposal/);
    assert.match(route.safetyBoundary, /Task Copilot/);
  }
});
