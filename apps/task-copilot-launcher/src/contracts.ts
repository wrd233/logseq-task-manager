import { isAbsolute } from "node:path";

export {
  LAUNCHER_PROTOCOL_VERSION,
  validateLauncherDescriptor,
  type LauncherDescriptor,
} from "@task-copilot/service-client/launcher";

export interface LauncherGraphConfig {
  graphKey: string;
  graphId: string;
  databasePath: string;
}

export interface LauncherConfig {
  schemaVersion: 1;
  listenPort: number;
  token: string;
  serviceEntryPath: string;
  runtimeRoot: string;
  descriptorPath: string;
  leaseTtlMs: number;
  graphs: LauncherGraphConfig[];
}

function fail(field: string, detail: string): never {
  throw new Error(`LAUNCHER_CONFIG_INVALID: ${field} ${detail}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field, "must be an object");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum = 1024): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail(field, `must be a non-empty string up to ${maximum} characters`);
  return value;
}

function absolutePath(value: unknown, field: string): string {
  const path = text(value, field, 4096);
  if (!isAbsolute(path)) fail(field, "must be absolute");
  if (path === "/tmp" || path.startsWith("/tmp/") || path === "/private/tmp" || path.startsWith("/private/tmp/") || path === "/var/tmp" || path.startsWith("/var/tmp/")) {
    fail(field, "must not be inside a shared temporary directory");
  }
  return path;
}

function identifier(value: unknown, field: string): string {
  const result = text(value, field, 256);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(result)) fail(field, "contains unsupported characters");
  return result;
}

export function parseLauncherConfig(value: unknown): LauncherConfig {
  const input = record(value, "config");
  if (input.schemaVersion !== 1) fail("schemaVersion", "must equal 1");
  const listenPort = input.listenPort;
  if (typeof listenPort !== "number" || !Number.isSafeInteger(listenPort) || listenPort < 1024 || listenPort > 65_535) {
    fail("listenPort", "must be an integer from 1024 through 65535");
  }
  const token = text(input.token, "token", 512);
  if (token.length < 32) fail("token", "must contain at least 32 characters");
  const serviceEntryPath = absolutePath(input.serviceEntryPath, "serviceEntryPath");
  const runtimeRoot = absolutePath(input.runtimeRoot, "runtimeRoot");
  const descriptorPath = absolutePath(input.descriptorPath, "descriptorPath");
  const leaseTtlMs = input.leaseTtlMs;
  if (typeof leaseTtlMs !== "number" || !Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 5_000 || leaseTtlMs > 120_000) {
    fail("leaseTtlMs", "must be an integer from 5000 through 120000");
  }
  if (!Array.isArray(input.graphs) || input.graphs.length < 1 || input.graphs.length > 64) fail("graphs", "must contain 1 through 64 mappings");
  const graphKeys = new Set<string>();
  const graphIds = new Set<string>();
  const databasePaths = new Set<string>();
  const graphs = input.graphs.map((value, index): LauncherGraphConfig => {
    const graph = record(value, `graphs[${index}]`);
    const graphKey = identifier(graph.graphKey, `graphs[${index}].graphKey`);
    const graphId = identifier(graph.graphId, `graphs[${index}].graphId`);
    const databasePath = absolutePath(graph.databasePath, `graphs[${index}].databasePath`);
    if (graphKeys.has(graphKey)) fail("graphs", `contains duplicate graphKey ${graphKey}`);
    if (graphIds.has(graphId)) fail("graphs", `contains duplicate graphId ${graphId}`);
    if (databasePaths.has(databasePath)) fail("graphs", "contains a databasePath bound to more than one Graph");
    graphKeys.add(graphKey);
    graphIds.add(graphId);
    databasePaths.add(databasePath);
    return { graphKey, graphId, databasePath };
  });
  return { schemaVersion: 1, listenPort, token, serviceEntryPath, runtimeRoot, descriptorPath, leaseTtlMs, graphs };
}

export function parseLauncherRunnerArgs(args: string[]): { configPath: string } {
  if (args.length !== 2 || args[0] !== "--config" || !args[1]) {
    throw new Error("Usage: task-copilot-launcher --config <absolute-config-path>");
  }
  if (!isAbsolute(args[1])) throw new Error("Launcher config path must be absolute.");
  return { configPath: args[1] };
}
