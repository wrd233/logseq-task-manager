import assert from "node:assert/strict";
import test from "node:test";

import { revalidateAgentExecution } from "../src/agent-governance-revalidation.ts";

const valid = {
  sourceExists: true,
  expectedSourceHash: "a".repeat(64),
  currentSourceHash: "a".repeat(64),
  targetRequired: true,
  targetExists: true,
  expectedTargetVersion: 2,
  currentTargetVersion: 2,
  anchorStatus: "ACTIVE" as const,
  ruleAuthorizationExists: true,
  rulePaused: false,
  skillVersionValid: true,
  runtimeModeAllowsWrite: true,
  globalWritesPaused: false,
  degraded: false,
  expectedScope: ["object-1"],
  currentScope: ["object-1"],
  equivalentActionCompleted: false,
};

test("revalidation returns READY only when every current fact still matches", () => {
  assert.deepEqual(revalidateAgentExecution(valid), { status: "READY", reasons: [] });
});

test("source or target drift becomes STALE rather than silently applying", () => {
  for (const drift of [
    { ...valid, sourceExists: false },
    { ...valid, currentSourceHash: "b".repeat(64) },
    { ...valid, currentTargetVersion: 3 },
  ]) {
    const result = revalidateAgentExecution(drift);
    assert.equal(result.status, "STALE");
  }
});

test("missing/conflicting Anchor, revoked authority, pause, degraded mode, and scope expansion block", () => {
  for (const blocked of [
    { ...valid, anchorStatus: "MISSING" as const },
    { ...valid, anchorStatus: "CONFLICT" as const },
    { ...valid, ruleAuthorizationExists: false },
    { ...valid, rulePaused: true },
    { ...valid, skillVersionValid: false },
    { ...valid, runtimeModeAllowsWrite: false },
    { ...valid, globalWritesPaused: true },
    { ...valid, degraded: true },
    { ...valid, currentScope: ["object-1", "object-2"] },
  ]) {
    const result = revalidateAgentExecution(blocked);
    assert.equal(result.status, "BLOCKED");
  }
});

test("an equivalent user action is an idempotent NO_OP", () => {
  assert.deepEqual(revalidateAgentExecution({ ...valid, equivalentActionCompleted: true }), {
    status: "NO_OP",
    reasons: ["EQUIVALENT_ACTION_COMPLETED"],
  });
});
