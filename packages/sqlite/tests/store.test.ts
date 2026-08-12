import assert from "node:assert/strict";
import test from "node:test";

import { SqliteStore } from "../src/index.ts";

test("vNext schema stores normalized current state without embedding an anchor in WorkObject", () => {
  const store = new SqliteStore(":memory:");
  store.putWorkObject({
    id: "work-01", kind: "TASK", title: "Task", lifecycle: "OPEN", engagement: "ACTIONABLE",
    version: 1, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });
  store.putAnchor({
    id: "anchor-01", workObjectId: "work-01", graphId: "graph-01", externalId: "source-01",
    sourceContentHash: "a1b2c3d4", projectionContainerUuid: "container-01", projectionTitleUuid: "title-01",
    projectionStateUuid: "state-01", createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });

  assert.deepEqual(store.getWorkObject("work-01"), {
    id: "work-01", kind: "TASK", title: "Task", lifecycle: "OPEN", engagement: "ACTIONABLE",
    version: 1, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });
  assert.equal(store.getAnchorForWorkObject("work-01")?.externalId, "source-01");
  assert.equal(store.schemaVersion(), 1);
  store.close();
});

test("the structured ledger is append-only and exposes incomplete commits for recovery", () => {
  const store = new SqliteStore(":memory:");
  store.insertCommit({
    id: "commit-01", status: "PREPARED", actor: { type: "USER", id: "user-01" },
    operationType: "CREATE_WORK_OBJECT", targetId: "work-01", operation: { operationId: "op-01" },
    preconditions: [{ kind: "SOURCE_CONTENT_HASH", expected: "a1b2c3d4" }], before: null,
    after: { id: "work-01" }, inverse: { type: "UNDO_COMMIT" }, graphEffect: { type: "UPSERT_MANAGED_PROJECTION" },
    graphResult: null, failureReason: null, compensationFor: null, compensatedBy: null,
    createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });
  store.transitionCommit("commit-01", "KERNEL_APPLIED", { updatedAt: "2026-08-12T00:00:01.000Z" });

  assert.equal(store.getCommit("commit-01")?.status, "KERNEL_APPLIED");
  assert.deepEqual(store.listRecovery().map((commit) => commit.id), ["commit-01"]);
  assert.throws(() => store.insertCommit({ ...store.getCommit("commit-01")!, status: "PREPARED" }), /COMMIT_ALREADY_EXISTS/u);
  assert.throws(() => store.deleteCommit("commit-01"), /LEDGER_APPEND_ONLY/u);
  store.close();
});
