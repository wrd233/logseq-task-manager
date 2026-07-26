import { chmod, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { V2SqliteStore, type SqliteDoctorReport } from "@task-copilot/persistence/node";
import { createId } from "@task-copilot/shared";
import {
  clearRestoreRecoveryInterlock,
  readRestoreRecoveryInterlock,
} from "@task-copilot/shared/node";

const backupIdPattern = /^backup_[0-9]{17}_[0-9a-f]{32}$/;

export interface RestoreRecoveryMaintenanceResult {
  status: "RECOVERED";
  validation: SqliteDoctorReport;
}

export async function recoverRetainedRestoreState(input: {
  databasePath: string;
  graphId: string;
  now?: Date;
}): Promise<RestoreRecoveryMaintenanceResult> {
  const databasePath = resolve(input.databasePath);
  const interlock = await readRestoreRecoveryInterlock(databasePath);
  if (!interlock) throw new Error("RESTORE_RECOVERY_NOT_REQUIRED");
  if (interlock.graphId !== input.graphId) throw new Error("RESTORE_RECOVERY_STATE_INVALID");
  if (interlock.status !== "RECOVERY_REQUIRED") throw new Error("RESTORE_RECOVERY_POINT_UNCONFIRMED");
  if (!backupIdPattern.test(interlock.recoveryBackupId)) throw new Error("RESTORE_RECOVERY_STATE_INVALID");

  const backupRoot = join(dirname(databasePath), "backups");
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  await chmod(backupRoot, 0o700);
  const source = join(backupRoot, `${interlock.recoveryBackupId}.db`);
  const sourceValidation = V2SqliteStore.validateBackup(source, input.graphId);
  if (sourceValidation.status !== "PASS") throw new Error("RESTORE_RECOVERY_POINT_INVALID");

  const safetyBackupId = createId("backup", input.now ?? new Date());
  const safetyPath = join(backupRoot, `${safetyBackupId}.db`);
  const restored = await V2SqliteStore.restoreOffline(
    databasePath,
    source,
    safetyPath,
    input.graphId,
  );
  if (restored.validation.status !== "PASS") throw new Error("RESTORE_RECOVERY_DOCTOR_FAILED");

  const reopened = await V2SqliteStore.open(databasePath);
  try {
    reopened.initialize(input.graphId);
    if (reopened.doctor().status !== "PASS") throw new Error("RESTORE_RECOVERY_DOCTOR_FAILED");
  } finally {
    reopened.close();
  }
  await clearRestoreRecoveryInterlock(databasePath, interlock);
  return { status: "RECOVERED", validation: restored.validation };
}
