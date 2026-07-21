import assert from "node:assert/strict";
import test from "node:test";

import { previewLegacyStateMigration, type V2ManagedObject } from "@task-copilot/domain";

import {
  V2MigrationApplication,
  type V2LegacyMigrationEvidence,
  type V2MigrationBatch,
  type V2MigrationBatchCommand,
  type V2MigrationPreviewCommand,
  type V2MigrationRepository,
  type V2MigrationRun,
} from "../src/index.ts";

const sourceHash = "a".repeat(64);
const at = new Date("2026-07-21T09:00:00.000Z");

class MemoryMigrationRepository implements V2MigrationRepository {
  run?: V2MigrationRun;
  evidence: V2LegacyMigrationEvidence[] = [];
  objects = new Map<string, V2ManagedObject>();
  command?: V2MigrationBatchCommand;

  createMigrationPreview(command: V2MigrationPreviewCommand): { run: V2MigrationRun; replayed: boolean } {
    this.run = command.run;
    this.evidence = command.evidence;
    return { run: command.run, replayed: false };
  }
  migrationRun(): V2MigrationRun | undefined { return this.run; }
  migrationEvidence(): V2LegacyMigrationEvidence[] { return this.evidence; }
  getObject(objectId: string): V2ManagedObject | undefined { return this.objects.get(objectId); }
  commitMigrationBatch(command: V2MigrationBatchCommand): { batch: V2MigrationBatch; replayed: boolean } {
    this.command = command;
    return { batch: { ...command.batch, status: "IMPORTED", importedCount: command.objects.length }, replayed: false };
  }
  verifyMigrationBatch(): V2MigrationBatch { throw new Error("not used"); }
  undoMigrationBatch(): V2MigrationBatch { throw new Error("not used"); }
  activateMigrationRun(): V2MigrationRun { throw new Error("not used"); }
}

function preview(id: string) {
  return previewLegacyStateMigration({
    legacyObjectId: id,
    sourceBundleSha256: sourceHash,
    objectType: "TASK",
    phase: "ACTIVE",
    condition: { kind: "ACTIONABLE" },
    signals: [],
    evidenceRefs: [`object:${id}`],
  });
}

test("migration review is complete, deterministic, and replay-oriented", async () => {
  const repository = new MemoryMigrationRepository();
  const application = new V2MigrationApplication(repository);
  const result = await application.reviewPreview({
    sourceBundleSha256: sourceHash,
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    previews: [preview("legacy-2"), preview("legacy-1")],
    decisions: [
      { legacyObjectId: "legacy-1", action: "IMPORT" },
      { legacyObjectId: "legacy-2", action: "DEFER", reviewNote: "稍后确认正文" },
    ],
  }, at);
  assert.equal(result.run.runId, `migration-run:${sourceHash.slice(0, 32)}`);
  assert.deepEqual(result.run.summary, { total: 2, import: 1, keepOrdinary: 0, defer: 1, exclude: 0 });
  assert.deepEqual(repository.evidence.map(({ legacyObjectId }) => legacyObjectId), ["legacy-1", "legacy-2"]);
  await assert.rejects(() => application.reviewPreview({
    sourceBundleSha256: sourceHash,
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    previews: [preview("legacy-1")],
    decisions: [],
  }, at), (error: unknown) => error instanceof Error && "code" in error && error.code === "MIGRATION_PREVIEW_DECISIONS_INCOMPLETE");
});

test("migration import materializes only reviewed scope and validates graph evidence", async () => {
  const repository = new MemoryMigrationRepository();
  const application = new V2MigrationApplication(repository);
  const reviewed = await application.reviewPreview({
    sourceBundleSha256: sourceHash,
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    previews: [preview("legacy-1")],
    decisions: [{ legacyObjectId: "legacy-1", action: "IMPORT" }],
  }, at);
  const result = await application.importBatch({
    runId: reviewed.run.runId,
    sourceBundleSha256: sourceHash,
    snapshotBackupId: "backup-20260721",
    objectIds: ["legacy-1"],
    sources: [{
      object: { objectId: "legacy-1", text: "迁移后的任务", createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-21T08:00:00.000Z" },
      anchors: [{ anchorId: "anchor-1", objectId: "legacy-1", graphId: "graph-a", externalId: "block-1", role: "primary_text", status: "active", contentHash: "hash-1", lastSeenAt: "2026-07-21T08:00:00.000Z" }],
    }],
    idempotencyKey: "batch-1",
    actor: "migration-cli",
    traceId: "trace-1",
  }, at);
  assert.equal(result.batch.status, "IMPORTED");
  assert.equal(repository.command?.objects[0]?.sourceOrCreationEvent, `v1_migration:${sourceHash}:legacy-1`);
  assert.equal(repository.command?.snapshotBackupId, "backup-20260721");

  await assert.rejects(() => application.importBatch({
    runId: reviewed.run.runId,
    sourceBundleSha256: sourceHash,
    snapshotBackupId: "backup-20260721",
    objectIds: ["legacy-1"],
    sources: [{
      object: { objectId: "legacy-1", text: "迁移后的任务", createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-21T08:00:00.000Z" },
      anchors: [{ anchorId: "anchor-1", objectId: "other", graphId: "graph-a", externalId: "block-1", role: "primary_text", status: "active", contentHash: "hash-1", lastSeenAt: "2026-07-21T08:00:00.000Z" }],
    }],
    idempotencyKey: "batch-2",
    actor: "migration-cli",
    traceId: "trace-2",
  }, at), (error: unknown) => error instanceof Error && "code" in error && error.code === "MIGRATION_BATCH_ANCHOR_INVALID");
});

test("migration destructive transitions require exact confirmation", async () => {
  const repository = new MemoryMigrationRepository();
  const application = new V2MigrationApplication(repository);
  assert.throws(() => application.undoBatch("run", "batch", "yes"), (error: unknown) => error instanceof Error && "code" in error && error.code === "MIGRATION_UNDO_CONFIRMATION_REQUIRED");
  assert.throws(() => application.activate("run", "yes"), (error: unknown) => error instanceof Error && "code" in error && error.code === "MIGRATION_ACTIVATION_CONFIRMATION_REQUIRED");
});
