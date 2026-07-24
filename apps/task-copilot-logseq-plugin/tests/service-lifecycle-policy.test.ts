import assert from "node:assert/strict";
import test from "node:test";

import { managedRuntimeEndDecision } from "../src/service-lifecycle-policy.ts";

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
