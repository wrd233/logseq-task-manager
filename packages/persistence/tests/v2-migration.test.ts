import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { V2Application, V2MigrationApplication } from "@task-copilot/application";
import { previewLegacyStateMigration } from "@task-copilot/domain";

import { V2SqliteStore } from "../src/sqlite.ts";

const sourceHash = "b".repeat(64);
const createdAt = "2026-07-20T08:00:00.000Z";

async function fixture(): Promise<{ root: string; store: V2SqliteStore; migration: V2MigrationApplication }> {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-migration-"));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  store.initialize("graph-a", new Date(createdAt));
  return { root, store, migration: new V2MigrationApplication(store) };
}

function preview() {
  return previewLegacyStateMigration({
    legacyObjectId: "legacy-task-1",
    sourceBundleSha256: sourceHash,
    objectType: "TASK",
    phase: "ACTIVE",
    condition: { kind: "ACTIONABLE" },
    signals: [],
    evidenceRefs: ["object:legacy-task-1"],
  });
}

async function reviewed(application: V2MigrationApplication) {
  return application.reviewPreview({
    sourceBundleSha256: sourceHash,
    sourceCreatedAt: createdAt,
    previews: [preview()],
    decisions: [{ legacyObjectId: "legacy-task-1", action: "IMPORT" }],
  }, new Date("2026-07-21T08:00:00.000Z"));
}

function importInput(runId: string, idempotencyKey = "migration-batch-1") {
  return {
    runId,
    sourceBundleSha256: sourceHash,
    snapshotBackupId: "backup-before-v1-import",
    objectIds: ["legacy-task-1"],
    sources: [{
      object: { objectId: "legacy-task-1", text: "迁移 Task", createdAt, updatedAt: "2026-07-21T07:00:00.000Z" },
      anchors: [{
        anchorId: "legacy-anchor-1",
        objectId: "legacy-task-1",
        graphId: "graph-a",
        externalId: "legacy-block-1",
        role: "primary_text" as const,
        status: "active" as const,
        contentHash: "legacy-content-hash",
        lastSeenAt: "2026-07-21T07:00:00.000Z",
      }],
    }],
    idempotencyKey,
    actor: "migration-cli",
    traceId: `trace-${idempotencyKey}`,
  };
}

test("reviewed migration batch is atomic, idempotent, verifiable, restart-safe, and activatable", async (t) => {
  const { root, store, migration } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  const { run } = await reviewed(migration);
  const imported = await migration.importBatch(importInput(run.runId), new Date("2026-07-21T09:00:00.000Z"));
  assert.equal(imported.batch.status, "IMPORTED");
  assert.deepEqual(store.listMigrationBatches(run.runId).map(({ batchId, status }) => ({ batchId, status })), [{
    batchId: imported.batch.batchId,
    status: "IMPORTED",
  }]);
  assert.equal(store.getObject("legacy-task-1")?.text, "迁移 Task");
  assert.equal(store.auditEventCount(), 1);
  const replay = await migration.importBatch(importInput(run.runId), new Date("2026-07-21T09:30:00.000Z"));
  assert.equal(replay.replayed, true);
  assert.equal(store.auditEventCount(), 1);
  const verified = await migration.verifyBatch(run.runId, imported.batch.batchId, new Date("2026-07-21T10:00:00.000Z"));
  assert.equal(verified.status, "VERIFIED");
  assert.equal(store.migrationRun(run.runId)?.status, "VERIFIED");
  store.close();

  const reopened = await V2SqliteStore.open(join(root, "task-copilot.db"));
  reopened.initialize("graph-a");
  const activated = await new V2MigrationApplication(reopened).activate(run.runId, "ACTIVATE_V2_SQLITE", new Date("2026-07-21T11:00:00.000Z"));
  assert.equal(activated.status, "ACTIVATED");
  assert.equal(reopened.doctor().status, "PASS");
  reopened.close();
});

test("verified migration batch can undo exactly, but refuses changed current state", async (t) => {
  const { root, store, migration } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  const { run } = await reviewed(migration);
  const imported = await migration.importBatch(importInput(run.runId), new Date("2026-07-21T09:00:00.000Z"));
  await migration.verifyBatch(run.runId, imported.batch.batchId, new Date("2026-07-21T10:00:00.000Z"));
  const application = new V2Application(store);
  await application.changeCondition("legacy-task-1", { kind: "PAUSED", reason: "迁移后人工修改" }, {
    actor: "tester", expectedVersion: 1, idempotencyKey: "post-migration-change", traceId: "trace-change",
  }, new Date("2026-07-21T10:30:00.000Z"));
  assert.throws(
    () => migration.undoBatch(run.runId, imported.batch.batchId, "UNDO_MIGRATION_BATCH", new Date("2026-07-21T11:00:00.000Z")),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "MIGRATION_UNDO_TARGET_CHANGED",
  );
  assert.equal(store.getObject("legacy-task-1")?.condition.kind, "PAUSED");
  store.close();
});

test("migration projection detects a later incoming Association before Undo", async (t) => {
  const { root, store, migration } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  const { run } = await reviewed(migration);
  const imported = await migration.importBatch(importInput(run.runId), new Date("2026-07-21T09:00:00.000Z"));
  await migration.verifyBatch(run.runId, imported.batch.batchId, new Date("2026-07-21T10:00:00.000Z"));
  const application = new V2Application(store);
  const source = await application.createObject({ objectId: "decision-after-migration", objectType: "DECISION", text: "迁移后关联" }, {
    actor: "tester", expectedVersion: 0, idempotencyKey: "create-after-migration", traceId: "trace-create-after-migration",
  });
  await application.addAssociation(source.objectId, "legacy-task-1", {
    actor: "tester", expectedVersion: source.version, idempotencyKey: "associate-after-migration", traceId: "trace-associate-after-migration",
  });
  assert.throws(
    () => migration.undoBatch(run.runId, imported.batch.batchId, "UNDO_MIGRATION_BATCH", new Date("2026-07-21T11:00:00.000Z")),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "MIGRATION_UNDO_TARGET_CHANGED",
  );
  assert.equal(store.getObject("legacy-task-1")?.version, 1, "incoming Association must be detected without mutating the migrated target version");
  store.close();
});

test("unchanged verified migration batch undoes projection but preserves evidence and audit history", async (t) => {
  const { root, store, migration } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  const { run } = await reviewed(migration);
  const imported = await migration.importBatch(importInput(run.runId), new Date("2026-07-21T09:00:00.000Z"));
  await migration.verifyBatch(run.runId, imported.batch.batchId, new Date("2026-07-21T10:00:00.000Z"));
  const undone = await migration.undoBatch(run.runId, imported.batch.batchId, "UNDO_MIGRATION_BATCH", new Date("2026-07-21T11:00:00.000Z"));
  assert.equal(undone.status, "UNDONE");
  assert.equal(store.getObject("legacy-task-1"), undefined);
  assert.equal(store.migrationEvidence(run.runId)[0]?.targetObjectId, undefined);
  assert.equal(store.migrationRun(run.runId)?.status, "PREVIEWED");
  assert.equal(store.auditEventCount(), 2);
  assert.equal(store.doctor().status, "PASS");
  const retried = await migration.importBatch(importInput(run.runId, "migration-batch-retry"), new Date("2026-07-21T12:00:00.000Z"));
  await migration.verifyBatch(run.runId, retried.batch.batchId, new Date("2026-07-21T13:00:00.000Z"));
  assert.equal((await migration.activate(run.runId, "ACTIVATE_V2_SQLITE", new Date("2026-07-21T14:00:00.000Z"))).status, "ACTIVATED");
  store.close();
});

test("migration batch constraint failure rolls back object, evidence, audit, and ledger together", async (t) => {
  const { root, store, migration } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  const secondPreview = previewLegacyStateMigration({
    legacyObjectId: "legacy-task-2", sourceBundleSha256: sourceHash, objectType: "TASK", phase: "ACTIVE",
    condition: { kind: "ACTIONABLE" }, signals: [], evidenceRefs: ["object:legacy-task-2"],
  });
  const { run } = await migration.reviewPreview({
    sourceBundleSha256: sourceHash, sourceCreatedAt: createdAt, previews: [preview(), secondPreview],
    decisions: [{ legacyObjectId: "legacy-task-1", action: "IMPORT" }, { legacyObjectId: "legacy-task-2", action: "IMPORT" }],
  }, new Date("2026-07-21T08:00:00.000Z"));
  const baseSource = importInput(run.runId).sources[0]!;
  await assert.rejects(() => migration.importBatch({
    ...importInput(run.runId),
    objectIds: ["legacy-task-1", "legacy-task-2"],
    sources: [baseSource, {
      object: { objectId: "legacy-task-2", text: "第二个迁移 Task", createdAt, updatedAt: "2026-07-21T07:00:00.000Z" },
      anchors: [{ ...baseSource.anchors[0]!, anchorId: "legacy-anchor-2", objectId: "legacy-task-2" }],
    }],
  }, new Date("2026-07-21T09:00:00.000Z")));
  assert.equal(store.getObject("legacy-task-1"), undefined);
  assert.equal(store.getObject("legacy-task-2"), undefined);
  assert.equal(store.auditEventCount(), 0);
  assert.equal(store.migrationRun(run.runId)?.status, "PREVIEWED");
  assert.equal(store.migrationEvidence(run.runId).every((item) => item.targetObjectId === undefined), true);
  store.close();
});

test("locked migration batch is a structured zero-write failure and remains retryable", async (t) => {
  const { root, store: initial, migration: initialMigration } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  const { run } = await reviewed(initialMigration);
  initial.close();
  const path = join(root, "task-copilot.db");
  const store = await V2SqliteStore.open(path, { busyTimeoutMs: 0 });
  store.initialize("graph-a");
  const migration = new V2MigrationApplication(store);
  const lock = new Database(path);
  lock.exec("BEGIN IMMEDIATE");
  await assert.rejects(
    () => migration.importBatch(importInput(run.runId), new Date("2026-07-21T09:00:00.000Z")),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_DATABASE_LOCKED",
  );
  lock.exec("ROLLBACK");
  lock.close();
  assert.equal(store.getObject("legacy-task-1"), undefined);
  assert.equal(store.auditEventCount(), 0);
  assert.equal((await migration.importBatch(importInput(run.runId), new Date("2026-07-21T09:30:00.000Z"))).batch.status, "IMPORTED");
  store.close();
});
