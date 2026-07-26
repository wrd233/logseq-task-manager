import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { V2SqliteStore } from "@task-copilot/persistence/node";
import {
  armRestoreRecoveryInterlock,
  clearRestoreRecoveryInterlock,
  readRestoreRecoveryInterlock,
} from "@task-copilot/shared/node";

import { recoverRetainedRestoreState } from "../src/restore-recovery-maintenance.ts";

test("one-shot Restore maintenance restores the retained formal state, verifies Doctor, and only then clears the interlock", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-restore-recovery-maintenance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const backupRoot = join(root, ".task-copilot", "backups");
  const graphId = "graph-restore-recovery-maintenance";
  const backupId = "backup_20260726170000000_11111111111111111111111111111111";
  const occurredAt = "2026-07-26T17:00:00.000Z";

  const retained = await V2SqliteStore.open(databasePath);
  retained.initialize(graphId);
  retained.commitObject({
    object: {
      objectId: "retained-object",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "Restore 前保留的正式状态",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      sourceOrCreationEvent: "restore-recovery-maintenance-test",
    },
    expectedVersion: 0,
    idempotencyKey: "retained-object",
    audit: {
      traceId: "retained-object",
      actor: "test",
      command: "create_object",
      objectId: "retained-object",
      beforeVersion: 0,
      afterVersion: 1,
      occurredAt,
    },
  });
  await retained.backup(join(backupRoot, `${backupId}.db`));
  retained.close();

  const ambiguous = await V2SqliteStore.open(databasePath);
  ambiguous.commitObject({
    object: {
      objectId: "ambiguous-object",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "PAUSED", reason: "双重回滚失败后不可信" },
      text: "不应保留的歧义状态",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      sourceOrCreationEvent: "restore-recovery-maintenance-test",
    },
    expectedVersion: 0,
    idempotencyKey: "ambiguous-object",
    audit: {
      traceId: "ambiguous-object",
      actor: "test",
      command: "create_object",
      objectId: "ambiguous-object",
      beforeVersion: 0,
      afterVersion: 1,
      occurredAt,
    },
  });
  ambiguous.close();

  await armRestoreRecoveryInterlock(databasePath, {
    schemaVersion: 1,
    status: "RECOVERY_REQUIRED",
    graphId,
    recoveryBackupId: backupId,
    createdAt: occurredAt,
  });
  const result = await recoverRetainedRestoreState({
    databasePath,
    graphId,
    now: new Date("2026-07-26T18:00:00.000Z"),
  });
  assert.equal(result.status, "RECOVERED");
  assert.equal(result.validation.status, "PASS");
  assert.equal(await readRestoreRecoveryInterlock(databasePath), undefined);

  const restored = await V2SqliteStore.open(databasePath);
  assert.equal(restored.getObject("retained-object")?.text, "Restore 前保留的正式状态");
  assert.equal(restored.getObject("ambiguous-object"), undefined);
  assert.equal(restored.doctor().status, "PASS");
  restored.close();
  assert.equal((await readdir(backupRoot)).filter((name) => name.endsWith(".db")).length, 2);
});

test("Restore maintenance refuses ARMED, wrong-Graph, and invalid retained backups without clearing the interlock", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-restore-recovery-refusal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const graphId = "graph-restore-recovery-refusal";
  const store = await V2SqliteStore.open(databasePath);
  store.initialize(graphId);
  store.close();
  const armed = {
    schemaVersion: 1 as const,
    status: "ARMED" as const,
    graphId,
    recoveryBackupId: "backup_20260726170000000_22222222222222222222222222222222",
    createdAt: "2026-07-26T17:00:00.000Z",
  };
  await armRestoreRecoveryInterlock(databasePath, armed);
  await assert.rejects(() => recoverRetainedRestoreState({ databasePath, graphId }), /POINT_UNCONFIRMED/);
  assert.deepEqual(await readRestoreRecoveryInterlock(databasePath), armed);
  await assert.rejects(() => recoverRetainedRestoreState({ databasePath, graphId: "another-graph" }), /STATE_INVALID/);
  assert.deepEqual(await readRestoreRecoveryInterlock(databasePath), armed);
  await clearRestoreRecoveryInterlock(databasePath, armed);
  const missingRecoveryPoint = { ...armed, status: "RECOVERY_REQUIRED" as const };
  await armRestoreRecoveryInterlock(databasePath, missingRecoveryPoint);
  await assert.rejects(
    () => recoverRetainedRestoreState({ databasePath, graphId }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "V2_BACKUP_VALIDATION_FAILED",
  );
  assert.deepEqual(await readRestoreRecoveryInterlock(databasePath), missingRecoveryPoint);
});
