export interface ServiceProcessCapabilities {
  formalWrites: boolean;
  migration: boolean;
  provider: boolean;
  backup: boolean;
}

export interface ServiceMigrationProcessResult {
  migrated: boolean;
  fromVersion: number;
  schemaVersion: number;
  backupPath?: string;
}

const ERROR_CODE = /^[A-Z][A-Z0-9_:.-]{2,160}$/;

export function serviceReadyLine(pid: number, capabilities: ServiceProcessCapabilities): string {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("LOCAL_SERVICE_PID_INVALID");
  return JSON.stringify({
    status: "READY",
    pid,
    capabilities: {
      formalWrites: capabilities.formalWrites,
      migration: capabilities.migration,
      provider: capabilities.provider,
      backup: capabilities.backup,
    },
  });
}

export function serviceMigrationLine(result: ServiceMigrationProcessResult): string {
  return JSON.stringify({
    status: result.migrated ? "MIGRATED" : "CURRENT",
    fromVersion: result.fromVersion,
    schemaVersion: result.schemaVersion,
    backupCreated: typeof result.backupPath === "string",
  });
}

export function serviceFailureLine(error: unknown): string {
  const candidate = error && typeof error === "object" && !Array.isArray(error)
    ? (error as { code?: unknown }).code
    : undefined;
  const legacyMessage = error instanceof Error ? error.message : undefined;
  const code = typeof candidate === "string" && ERROR_CODE.test(candidate)
    ? candidate
    : typeof legacyMessage === "string" && ERROR_CODE.test(legacyMessage)
      ? legacyMessage
      : "LOCAL_SERVICE_START_FAILED";
  return JSON.stringify({ status: "FAILED", code });
}
