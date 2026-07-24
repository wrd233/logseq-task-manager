export interface ServiceRunnerOptions {
  mode: "serve";
  databasePath: string;
  graphId: string;
  descriptorPath: string;
  ownerPid?: number;
}

export interface SchemaMigrationRunnerOptions {
  mode: "migrate-schema";
  databasePath: string;
  graphId: string;
  backupPath: string;
}

export function parseServiceRunnerArgs(args: string[]): ServiceRunnerOptions | SchemaMigrationRunnerOptions {
  const mode = args[0] === "migrate-schema" ? "migrate-schema" : "serve";
  const commandArgs = mode === "migrate-schema" ? args.slice(1) : args;
  const values = new Map<string, string>();
  for (let index = 0; index < commandArgs.length; index += 1) {
    const key = commandArgs[index];
    if (!key?.startsWith("--")) throw new Error(`Unknown argument: ${key ?? ""}`);
    const value = commandArgs[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    values.set(key, value);
    index += 1;
  }
  const databasePath = values.get("--database");
  const graphId = values.get("--graph-id");
  if (mode === "migrate-schema") {
    const backupPath = values.get("--backup");
    if (!databasePath || !graphId || !backupPath || values.size !== 3) {
      throw new Error("Usage: task-copilot-service migrate-schema --database <path> --graph-id <id> --backup <new-backup-path>");
    }
    return { mode, databasePath, graphId, backupPath };
  }
  const descriptorPath = values.get("--descriptor");
  const ownerPidText = values.get("--owner-pid");
  const ownerPid = ownerPidText === undefined ? undefined : Number(ownerPidText);
  if (
    !databasePath ||
    !graphId ||
    !descriptorPath ||
    values.size !== (ownerPidText === undefined ? 3 : 4) ||
    (ownerPidText !== undefined && (!Number.isSafeInteger(ownerPid) || ownerPid! <= 0))
  ) {
    throw new Error("Usage: task-copilot-service --database <path> --graph-id <id> --descriptor <path> [--owner-pid <positive-pid>]");
  }
  return { mode, databasePath, graphId, descriptorPath, ...(ownerPid !== undefined ? { ownerPid } : {}) };
}
