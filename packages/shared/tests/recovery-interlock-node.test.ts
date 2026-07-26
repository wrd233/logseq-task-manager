import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  armRestoreRecoveryInterlock,
  assertRestoreRecoveryInterlockClear,
  clearRestoreRecoveryInterlock,
  readRestoreRecoveryInterlock,
  replaceRestoreRecoveryInterlock,
  restoreRecoveryInterlockPath,
} from "../src/recovery-interlock-node.ts";

test("Restore recovery interlock is private, read-back verified, and blocks until explicitly cleared", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-restore-interlock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databasePath = join(root, "task-copilot.sqlite");
  await writeFile(databasePath, "placeholder", { mode: 0o600 });
  const record = {
    schemaVersion: 1 as const,
    status: "ARMED" as const,
    graphId: "graph-a",
    recoveryBackupId: "backup_20260726170000000_11111111111111111111111111111111",
    createdAt: "2026-07-26T17:00:00.000Z",
  };

  await armRestoreRecoveryInterlock(databasePath, record);
  assert.deepEqual(await readRestoreRecoveryInterlock(databasePath), record);
  assert.equal((await readFile(restoreRecoveryInterlockPath(databasePath), "utf8")).includes(databasePath), false);
  await assert.rejects(() => assertRestoreRecoveryInterlockClear(databasePath, "graph-a"), /RESTORE_RECOVERY_ARMED/);

  const recoveryRequired = { ...record, status: "RECOVERY_REQUIRED" as const };
  await replaceRestoreRecoveryInterlock(databasePath, record, recoveryRequired);
  await assert.rejects(() => assertRestoreRecoveryInterlockClear(databasePath, "graph-a"), /RESTORE_RECOVERY_REQUIRED/);
  await assert.rejects(() => assertRestoreRecoveryInterlockClear(databasePath, "graph-b"), /RESTORE_RECOVERY_STATE_INVALID/);
  await assert.rejects(
    () => clearRestoreRecoveryInterlock(databasePath, record),
    /RESTORE_RECOVERY_INTERLOCK_STALE/,
  );
  await clearRestoreRecoveryInterlock(databasePath, recoveryRequired);
  await assertRestoreRecoveryInterlockClear(databasePath, "graph-a");
});

test("corrupt or insecure Restore interlock fails closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-restore-interlock-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databasePath = join(root, "task-copilot.sqlite");
  const path = restoreRecoveryInterlockPath(databasePath);
  await writeFile(path, "{not-json", { mode: 0o600 });
  await assert.rejects(() => readRestoreRecoveryInterlock(databasePath), /RESTORE_RECOVERY_INTERLOCK_INVALID/);
  await assert.rejects(() => assertRestoreRecoveryInterlockClear(databasePath, "graph-a"), /RESTORE_RECOVERY_STATE_INVALID/);
  await writeFile(path, JSON.stringify({
    schemaVersion: 1,
    status: "RECOVERY_REQUIRED",
    graphId: "graph-a",
    recoveryBackupId: "backup-a",
    createdAt: "2026-07-26T17:00:00.000Z",
  }));
  await chmod(path, 0o644);
  await assert.rejects(() => readRestoreRecoveryInterlock(databasePath), /RESTORE_RECOVERY_INTERLOCK_INSECURE/);
  await assert.rejects(() => assertRestoreRecoveryInterlockClear(databasePath, "graph-a"), /RESTORE_RECOVERY_STATE_INVALID/);
});

test("mutation lock makes compare-and-replace exclusive and initial arm never clobbers a newer record", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-restore-interlock-race-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databasePath = join(root, "task-copilot.sqlite");
  await writeFile(databasePath, "placeholder", { mode: 0o600 });
  const armed = {
    schemaVersion: 1 as const,
    status: "ARMED" as const,
    graphId: "graph-race",
    recoveryBackupId: "backup_20260726171000000_11111111111111111111111111111111",
    createdAt: "2026-07-26T17:10:00.000Z",
  };
  const required = { ...armed, status: "RECOVERY_REQUIRED" as const };
  const unrelated = {
    ...armed,
    recoveryBackupId: "backup_20260726171100000_22222222222222222222222222222222",
    createdAt: "2026-07-26T17:11:00.000Z",
  };
  await armRestoreRecoveryInterlock(databasePath, armed);

  let releaseCompare!: () => void;
  const compareGate = new Promise<void>((resolve) => { releaseCompare = resolve; });
  let comparisonReached!: () => void;
  const compared = new Promise<void>((resolve) => { comparisonReached = resolve; });
  const replacing = replaceRestoreRecoveryInterlock(databasePath, armed, required, {
    afterCompare: async () => {
      comparisonReached();
      await compareGate;
    },
  });
  await compared;
  await assert.rejects(
    () => clearRestoreRecoveryInterlock(databasePath, armed),
    /RESTORE_RECOVERY_INTERLOCK_BUSY/,
  );
  await assert.rejects(
    () => armRestoreRecoveryInterlock(databasePath, unrelated),
    /RESTORE_RECOVERY_INTERLOCK_BUSY/,
  );
  releaseCompare();
  await replacing;
  assert.deepEqual(await readRestoreRecoveryInterlock(databasePath), required);

  await assert.rejects(
    () => clearRestoreRecoveryInterlock(databasePath, armed),
    /RESTORE_RECOVERY_INTERLOCK_STALE/,
  );
  await assert.rejects(
    () => armRestoreRecoveryInterlock(databasePath, unrelated),
    /RESTORE_RECOVERY_INTERLOCK_STALE/,
  );
  assert.deepEqual(await readRestoreRecoveryInterlock(databasePath), required);
  await clearRestoreRecoveryInterlock(databasePath, required);
});

test("Restore interlocks isolate two database files that share one data directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-restore-interlock-multi-db-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databaseA = join(root, "graph-a.sqlite");
  const databaseB = join(root, "graph-b.sqlite");
  await writeFile(databaseA, "placeholder", { mode: 0o600 });
  await writeFile(databaseB, "placeholder", { mode: 0o600 });
  const recordA = {
    schemaVersion: 1 as const,
    status: "RECOVERY_REQUIRED" as const,
    graphId: "graph-a",
    recoveryBackupId: "backup_20260726173000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    createdAt: "2026-07-26T17:30:00.000Z",
  };
  const recordB = {
    schemaVersion: 1 as const,
    status: "ARMED" as const,
    graphId: "graph-b",
    recoveryBackupId: "backup_20260726173100000_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    createdAt: "2026-07-26T17:31:00.000Z",
  };

  assert.notEqual(restoreRecoveryInterlockPath(databaseA), restoreRecoveryInterlockPath(databaseB));
  await armRestoreRecoveryInterlock(databaseA, recordA);
  await assertRestoreRecoveryInterlockClear(databaseB, "graph-b");
  await armRestoreRecoveryInterlock(databaseB, recordB);
  assert.deepEqual(await readRestoreRecoveryInterlock(databaseA), recordA);
  assert.deepEqual(await readRestoreRecoveryInterlock(databaseB), recordB);
  await clearRestoreRecoveryInterlock(databaseA, recordA);
  assert.deepEqual(await readRestoreRecoveryInterlock(databaseB), recordB);
  await clearRestoreRecoveryInterlock(databaseB, recordB);
});
