export interface ServiceRunnerOptions {
  databasePath: string;
  graphId: string;
  descriptorPath: string;
}

export function parseServiceRunnerArgs(args: string[]): ServiceRunnerOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) throw new Error(`Unknown argument: ${key ?? ""}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    values.set(key, value);
    index += 1;
  }
  const databasePath = values.get("--database");
  const graphId = values.get("--graph-id");
  const descriptorPath = values.get("--descriptor");
  if (!databasePath || !graphId || !descriptorPath || values.size !== 3) {
    throw new Error("Usage: task-copilot-service --database <path> --graph-id <id> --descriptor <path>");
  }
  return { databasePath, graphId, descriptorPath };
}
