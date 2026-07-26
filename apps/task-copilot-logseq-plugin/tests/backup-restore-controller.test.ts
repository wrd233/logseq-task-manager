import assert from "node:assert/strict";
import test from "node:test";

import { BackupRestoreController, type BackupRestoreClient } from "../src/backup-restore-controller.ts";

function client(): BackupRestoreClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listBackups() {
      calls.push("list");
      return {
        backups: [
          { backupId: "backup_20260726120000000_11111111111111111111111111111111", createdAt: "2026-07-26T12:00:00.000Z", status: "VALID", schemaVersion: 12, objectCount: 4 },
          { backupId: "backup_20260725120000000_22222222222222222222222222222222", createdAt: "2026-07-25T12:00:00.000Z", status: "INVALID" },
        ],
        total: 2,
        limited: false,
      };
    },
    async createBackup() {
      calls.push("create");
      return {
        backupId: "backup_20260726120000000_11111111111111111111111111111111",
        createdAt: "2026-07-26T12:00:00.000Z",
        validation: { status: "PASS", graphId: "graph", schemaVersion: 12, integrity: "ok", foreignKeyViolations: 0, objectCount: 4 },
      };
    },
    async validateBackup(backupId) {
      calls.push(`validate:${backupId}`);
      return {
        backupId,
        validation: { status: "PASS", graphId: "graph", schemaVersion: 12, integrity: "ok", foreignKeyViolations: 0, objectCount: 4 },
      };
    },
    async restoreBackup(backupId, confirmation) {
      calls.push(`restore:${backupId}:${confirmation}`);
      return {
        status: "RESTORED_SERVICE_STOPPING",
        backupId,
        recoveryBackupId: "backup_20260726130000000_33333333333333333333333333333333",
        validation: { status: "PASS", graphId: "graph", schemaVersion: 12, integrity: "ok", foreignKeyViolations: 0, objectCount: 4 },
      };
    },
  };
}

test("backup catalog exposes session tokens and user metadata without leaking server IDs or paths", async () => {
  const controller = new BackupRestoreController();
  const service = client();
  await controller.load(service);
  const state = controller.snapshot();
  assert.deepEqual(state.backups.map(({ token, status }) => ({ token, status })), [
    { token: "snapshot:0", status: "VALID" },
    { token: "snapshot:1", status: "INVALID" },
  ]);
  assert.doesNotMatch(JSON.stringify(state), /backup_|\\.db|task-copilot/);
  await assert.rejects(() => controller.select(service, "snapshot:1"), /不可用/);
  await assert.rejects(() => controller.select(service, "snapshot:99"), /不可用/);
});

test("restore revalidates the same selected server-owned snapshot and keeps fixed confirmation internal", async () => {
  const controller = new BackupRestoreController();
  const service = client();
  await controller.load(service);
  await controller.select(service, "snapshot:0");
  const selected = controller.snapshot();
  assert.equal(selected.selectedToken, "snapshot:0");
  assert.doesNotMatch(JSON.stringify(selected), /backup_/);
  const result = await controller.restore(service, "snapshot:0");
  assert.equal(result.status, "RESTORED_SERVICE_STOPPING");
  assert.deepEqual(service.calls, [
    "list",
    "validate:backup_20260726120000000_11111111111111111111111111111111",
    "validate:backup_20260726120000000_11111111111111111111111111111111",
    "restore:backup_20260726120000000_11111111111111111111111111111111:RESTORE_AND_STOP_SERVICE",
  ]);
});

test("creating a current snapshot reloads the bounded catalog and cancellation clears identity mapping", async () => {
  const controller = new BackupRestoreController();
  const service = client();
  await controller.create(service);
  assert.deepEqual(service.calls, ["create", "list"]);
  assert.match(controller.snapshot().message ?? "", /新的可恢复快照/);
  controller.clear();
  assert.deepEqual(controller.snapshot(), { status: "idle", backups: [], total: 0, limited: false });
  await assert.rejects(() => controller.select(service, "snapshot:0"), /不可用/);
});
