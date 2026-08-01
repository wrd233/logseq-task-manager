import assert from "node:assert/strict";
import test from "node:test";

import { activeOutcomeScope, createScopedOutcome, outcomeForScope } from "../src/scoped-outcome.ts";

test("one outcome binds to one action, one active surface, and one lifecycle", () => {
  const outcome = createScopedOutcome({
    actionId: "candidate-organize:17",
    scope: activeOutcomeScope({ workspace: "review" }),
    message: "当前没有需要整理的内容。",
  });
  assert.deepEqual(outcome, {
    actionId: "candidate-organize:17",
    scope: "workspace:review",
    kind: "notice",
    lifecycle: "UNTIL_NEXT_ACTION",
    message: "当前没有需要整理的内容。",
  });
  assert.equal(outcomeForScope(outcome, "workspace:review"), outcome);
  assert.equal(outcomeForScope(outcome, "workspace:now"), undefined);
});

test("commit result wins over prose while recovery keeps an explicit longer lifecycle", () => {
  assert.deepEqual(createScopedOutcome({
    actionId: "commit:3",
    scope: "workspace:review",
    message: "旧成功文字",
    error: "旧错误文字",
    commitId: "semantic-commit-3",
    recoveryRequired: true,
  }), {
    actionId: "commit:3",
    scope: "workspace:review",
    kind: "result",
    lifecycle: "UNTIL_RECOVERY_RESOLVED",
    commitId: "semantic-commit-3",
  });
});

test("an empty result is a neutral notice with its own action and scope, never an error", () => {
  const outcome = createScopedOutcome({
    actionId: "candidate-organize:empty-1",
    scope: "workspace:review",
    message: "没有新增需要整理的内容",
  });
  assert.equal(outcome?.kind, "notice");
  assert.equal(outcome?.message, "没有新增需要整理的内容");
  assert.equal(outcomeForScope(outcome, "workspace:review")?.kind, "notice");
  assert.equal(outcomeForScope(outcome, "workspace:now"), undefined);
  assert.equal(createScopedOutcome({ actionId: "cancel:1", scope: "workspace:review", error: "已取消" })?.kind, "error");
});

test("one action owns one current outcome in a scope and a new action replaces it", () => {
  const first = createScopedOutcome({ actionId: "undo:1", scope: "workspace:review", commitId: "commit-1" });
  const second = createScopedOutcome({ actionId: "organize:2", scope: "workspace:review", message: "当前没有需要整理的内容" });
  assert.equal(first?.kind, "result");
  assert.equal(second?.kind, "notice");
  assert.notEqual(first?.actionId, second?.actionId);
  assert.equal(outcomeForScope(second, "workspace:review")?.message, "当前没有需要整理的内容");
});
