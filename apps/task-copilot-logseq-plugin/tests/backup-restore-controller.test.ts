import assert from "node:assert/strict";
import test from "node:test";

import { StructuredError } from "@task-copilot/shared";

import { BackupRestoreController, backupRestoreFailureDisposition, type BackupRestoreClient } from "../src/backup-restore-controller.ts";

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

test("Restore failure disposition distinguishes preflight, ambiguous apply validation, safe rollback, and manual recovery", () => {
  const remote = (remoteCode: string) => new StructuredError({
    code: "SERVICE_HTTP_ERROR",
    message: "remote restore failure",
    ruleRefs: ["D-216"],
    details: { status: 500, remoteCode },
  });
  assert.deepEqual(backupRestoreFailureDisposition(remote("V2_BACKUP_VALIDATION_FAILED")), {
    kind: "OUTCOME_UNKNOWN",
    restartRuntime: true,
    message: "Restore Apply 阶段的快照校验未通过；尚不能假定原 Service 仍在运行，正在重新连接并核验当前正式状态。",
  });
  assert.deepEqual(backupRestoreFailureDisposition(remote("V2_RESTORE_FAILED")), {
    kind: "ROLLED_BACK",
    restartRuntime: true,
    message: "恢复未完成；系统已恢复原正式状态并保留 Restore 前恢复点，正在重新连接当前 Graph。",
  });
  assert.deepEqual(backupRestoreFailureDisposition(remote("V2_RESTORE_ROLLBACK_FAILED")), {
    kind: "RECOVERY_REQUIRED",
    restartRuntime: false,
    message: "恢复和自动回滚都未能完成；Restore 前恢复点仍保留。正式写入已暂停，请从系统状态进入人工恢复。",
  });
  assert.equal(backupRestoreFailureDisposition(new Error("connection reset")).kind, "OUTCOME_UNKNOWN");
  assert.equal(backupRestoreFailureDisposition(new Error("connection reset")).restartRuntime, true);
});

test("Restore final validation transport failure never sends apply or restarts a still-valid runtime", async () => {
  const controller = new BackupRestoreController();
  const service = client();
  await controller.load(service);
  await controller.select(service, "snapshot:0");
  service.validateBackup = async () => {
    service.calls.push("validate-unavailable");
    throw new StructuredError({
      code: "SERVICE_UNAVAILABLE",
      message: "Local Service 不可用。",
      ruleRefs: ["D-216"],
    });
  };
  const error = await controller.restore(service, "snapshot:0").catch((failure: unknown) => failure);
  assert.ok(error instanceof StructuredError);
  assert.equal(error.code, "BACKUP_RESTORE_PREFLIGHT_UNAVAILABLE");
  assert.deepEqual(backupRestoreFailureDisposition(error), {
    kind: "PRE_SWITCH_REJECTED",
    restartRuntime: false,
    message: "无法完成 Restore 最终校验；没有执行恢复，当前正式状态保持不变。",
  });
  assert.equal(service.calls.some((call) => call.startsWith("restore:")), false);
  assert.equal(controller.snapshot().status, "error");
});
