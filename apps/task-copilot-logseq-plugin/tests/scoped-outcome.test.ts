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
