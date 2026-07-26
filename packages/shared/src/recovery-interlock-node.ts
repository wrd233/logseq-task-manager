import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, rm, rmdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const RESTORE_RECOVERY_INTERLOCK_FILE = ".task-copilot-restore-recovery.json";
const RESTORE_RECOVERY_INTERLOCK_LOCK = `${RESTORE_RECOVERY_INTERLOCK_FILE}.lock`;

export interface RestoreRecoveryInterlock {
  schemaVersion: 1;
  status: "ARMED" | "RECOVERY_REQUIRED";
  graphId: string;
  recoveryBackupId: string;
  createdAt: string;
}

function interlockError(code: string): Error {
  return new Error(code);
}

function boundedIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) {
    throw interlockError(`RESTORE_RECOVERY_INTERLOCK_${field.toUpperCase()}_INVALID`);
  }
  return value;
}

function validRecord(value: unknown): RestoreRecoveryInterlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw interlockError("RESTORE_RECOVERY_INTERLOCK_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "createdAt,graphId,recoveryBackupId,schemaVersion,status"
    || record.schemaVersion !== 1
    || (record.status !== "ARMED" && record.status !== "RECOVERY_REQUIRED")
    || typeof record.createdAt !== "string"
    || !Number.isFinite(Date.parse(record.createdAt))
  ) {
    throw interlockError("RESTORE_RECOVERY_INTERLOCK_INVALID");
  }
  return {
    schemaVersion: 1,
    status: record.status,
    graphId: boundedIdentifier(record.graphId, "graph"),
    recoveryBackupId: boundedIdentifier(record.recoveryBackupId, "backup"),
    createdAt: record.createdAt,
  };
}

export function restoreRecoveryInterlockPath(databasePath: string): string {
  const database = resolve(databasePath);
  return join(dirname(database), RESTORE_RECOVERY_INTERLOCK_FILE);
}

function mutationLockPath(databasePath: string): string {
  return join(dirname(resolve(databasePath)), RESTORE_RECOVERY_INTERLOCK_LOCK);
}

async function assertMutationIdle(databasePath: string): Promise<void> {
  try {
    await lstat(mutationLockPath(databasePath));
    throw interlockError("RESTORE_RECOVERY_INTERLOCK_BUSY");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    throw error;
  }
}

async function readInterlockUnlocked(path: string): Promise<RestoreRecoveryInterlock | undefined> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
      throw interlockError("RESTORE_RECOVERY_INTERLOCK_INSECURE");
    }
    return validRecord(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) throw interlockError("RESTORE_RECOVERY_INTERLOCK_INVALID");
    throw error;
  }
}

export async function readRestoreRecoveryInterlock(
  databasePath: string,
): Promise<RestoreRecoveryInterlock | undefined> {
  await assertMutationIdle(databasePath);
  const record = await readInterlockUnlocked(restoreRecoveryInterlockPath(databasePath));
  await assertMutationIdle(databasePath);
  return record;
}

export async function assertRestoreRecoveryInterlockClear(databasePath: string): Promise<void> {
  let record: RestoreRecoveryInterlock | undefined;
  try {
    record = await readRestoreRecoveryInterlock(databasePath);
  } catch {
    throw interlockError("RESTORE_RECOVERY_STATE_INVALID");
  }
  if (!record) return;
  throw interlockError(record.status === "ARMED" ? "RESTORE_RECOVERY_ARMED" : "RESTORE_RECOVERY_REQUIRED");
}

export async function armRestoreRecoveryInterlock(
  databasePath: string,
  input: RestoreRecoveryInterlock,
): Promise<void> {
  const record = validRecord(input);
  await withMutationLock(databasePath, async () => {
    const path = restoreRecoveryInterlockPath(databasePath);
    if (await readInterlockUnlocked(path)) throw interlockError("RESTORE_RECOVERY_INTERLOCK_STALE");
    await writeInterlockUnlocked(path, record);
  });
}

async function writeInterlockUnlocked(
  path: string,
  record: RestoreRecoveryInterlock,
): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
  const readBack = await readInterlockUnlocked(path);
  if (!readBack || !sameRecord(readBack, record)) {
    throw interlockError("RESTORE_RECOVERY_INTERLOCK_READBACK_FAILED");
  }
}

async function withMutationLock<T>(databasePath: string, task: () => Promise<T>): Promise<T> {
  const lockPath = mutationLockPath(databasePath);
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await chmod(lockPath, 0o700);
  } catch {
    throw interlockError("RESTORE_RECOVERY_INTERLOCK_BUSY");
  }
  try {
    return await task();
  } finally {
    await rmdir(lockPath);
    const directory = await open(dirname(lockPath), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}

function sameRecord(left: RestoreRecoveryInterlock, right: RestoreRecoveryInterlock): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.status === right.status
    && left.graphId === right.graphId
    && left.recoveryBackupId === right.recoveryBackupId
    && left.createdAt === right.createdAt;
}

export async function replaceRestoreRecoveryInterlock(
  databasePath: string,
  expected: RestoreRecoveryInterlock,
  replacement: RestoreRecoveryInterlock,
  testOnly?: { afterCompare?: () => void | Promise<void> },
): Promise<void> {
  const wanted = validRecord(expected);
  const next = validRecord(replacement);
  await withMutationLock(databasePath, async () => {
    const path = restoreRecoveryInterlockPath(databasePath);
    const current = await readInterlockUnlocked(path);
    if (!current || !sameRecord(current, wanted)) throw interlockError("RESTORE_RECOVERY_INTERLOCK_STALE");
    await testOnly?.afterCompare?.();
    await writeInterlockUnlocked(path, next);
  });
}

export async function clearRestoreRecoveryInterlock(
  databasePath: string,
  expected: RestoreRecoveryInterlock,
  testOnly?: { afterCompare?: () => void | Promise<void> },
): Promise<void> {
  const wanted = validRecord(expected);
  await withMutationLock(databasePath, async () => {
    const path = restoreRecoveryInterlockPath(databasePath);
    const current = await readInterlockUnlocked(path);
    if (!current || !sameRecord(current, wanted)) throw interlockError("RESTORE_RECOVERY_INTERLOCK_STALE");
    await testOnly?.afterCompare?.();
    await rm(path, { force: true });
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    if (await readInterlockUnlocked(path)) throw interlockError("RESTORE_RECOVERY_INTERLOCK_CLEAR_FAILED");
  });
}
