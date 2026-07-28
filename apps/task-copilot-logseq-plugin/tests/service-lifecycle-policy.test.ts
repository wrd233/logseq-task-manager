import assert from "node:assert/strict";
import test from "node:test";

import {
  managedRuntimeBlockedPresentation,
  managedRuntimeEndDecision,
  managedRuntimeAllowsAutomaticRecovery,
  managedRuntimeFormalActionAvailability,
} from "../src/service-lifecycle-policy.ts";

test("explicitly ended runtime blocks formal actions even when stale ready facts remain", () => {
  assert.deepEqual(managedRuntimeFormalActionAvailability({
    runtimeEndedByUser: true,
    featureReady: true,
    connectionStatus: "READY",
    formalWritesAvailable: true,
    hasClient: true,
  }), { available: false, reason: "ENDED_BY_USER" });
});

test("formal actions require the complete ready authority boundary", () => {
  assert.deepEqual(managedRuntimeFormalActionAvailability({
    runtimeEndedByUser: false,
    featureReady: true,
    connectionStatus: "READY",
    formalWritesAvailable: true,
    hasClient: true,
  }), { available: true });
  assert.deepEqual(managedRuntimeFormalActionAvailability({
    runtimeEndedByUser: false,
    featureReady: true,
    connectionStatus: "READY",
    formalWritesAvailable: false,
    hasClient: true,
  }), { available: false, reason: "NOT_READY" });
  assert.deepEqual(managedRuntimeFormalActionAvailability({
    runtimeEndedByUser: false,
    featureReady: true,
    connectionStatus: "READY",
    formalWritesAvailable: true,
    hasClient: false,
  }), { available: false, reason: "NOT_READY" });
});

test("an explicitly ended runtime cannot be reacquired by host or settings callbacks", () => {
  assert.equal(managedRuntimeAllowsAutomaticRecovery({ runtimeEndedByUser: true }), false);
  assert.equal(managedRuntimeAllowsAutomaticRecovery({ runtimeEndedByUser: false }), true);
});

test("managed runtime can end only with no unfinished Commit or Graph reconciliation", () => {
  assert.deepEqual(managedRuntimeEndDecision({
    commits: [],
    explicitSync: { pending: 0, reconciliationRequired: false },
  }), { allowed: true });
});

test("unfinished Commit and pending Graph evidence route to recovery instead of stopping", () => {
  assert.deepEqual(managedRuntimeEndDecision({
    commits: [{
      semanticCommitId: "commit-pending",
      proposalId: "proposal-1",
      status: "PENDING",
      beforeStateChecksum: "before",
      createdAt: "now",
      updatedAt: "now",
    }],
    explicitSync: { pending: 0, reconciliationRequired: false },
  }), { allowed: false, reason: "UNFINISHED_COMMIT", count: 1 });
  assert.deepEqual(managedRuntimeEndDecision({
    commits: [],
    explicitSync: { pending: 2, reconciliationRequired: true },
  }), { allowed: false, reason: "GRAPH_RECONCILIATION_REQUIRED", count: 2 });
});

test("blocked runtime actions route unfinished commits to recovery and reconciliation to system status without a false zero count", () => {
  assert.deepEqual(managedRuntimeBlockedPresentation(
    { allowed: false, reason: "UNFINISHED_COMMIT", count: 2 },
    "RESTORE",
  ), {
    surface: "AUDIT",
    message: "发现 2 项尚未完成或需要恢复的修改；已转到“最近修改与恢复”，Restore 没有开始。",
  });
  const reconciliation = managedRuntimeBlockedPresentation(
    { allowed: false, reason: "GRAPH_RECONCILIATION_REQUIRED", count: 0 },
    "END_RUNTIME",
  );
  assert.equal(reconciliation.surface, "SYSTEM_STATUS");
  assert.match(reconciliation.message, /已打开系统状态/);
  assert.doesNotMatch(reconciliation.message, /0 项/);
});
