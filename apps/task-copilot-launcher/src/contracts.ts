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

export interface LauncherProviderConfig {
  providerId: "deepseek";
  baseUrl: string;
  model: string;
  apiKeyRef: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

export interface LauncherConfig {
  schemaVersion: 2;
  listenPort: number;
  token: string;
  serviceEntryPath: string;
  runtimeRoot: string;
  descriptorPath: string;
  leaseTtlMs: number;
  graphs: LauncherGraphConfig[];
  provider?: LauncherProviderConfig;
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
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) fail("schemaVersion", "must equal 1 or 2");
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
  let provider: LauncherProviderConfig | undefined;
  if (input.provider !== undefined) {
    const candidate = record(input.provider, "provider");
    const extraKeys = Object.keys(candidate).filter((key) => !["providerId", "baseUrl", "model", "apiKeyRef", "timeoutMs", "maxOutputTokens"].includes(key));
    if (extraKeys.length) fail("provider", "contains unsupported fields");
    if (candidate.providerId !== "deepseek") fail("provider.providerId", "must equal deepseek");
    const baseUrl = text(candidate.baseUrl, "provider.baseUrl", 2048).replace(/\/+$/, "");
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      fail("provider.baseUrl", "must be an absolute HTTP(S) URL");
    }
    if (!["http:", "https:"].includes(parsedUrl!.protocol) || parsedUrl!.username || parsedUrl!.password || parsedUrl!.search || parsedUrl!.hash) {
      fail("provider.baseUrl", "must be an absolute credential-free HTTP(S) URL");
    }
    const model = identifier(candidate.model, "provider.model");
    const apiKeyRef = text(candidate.apiKeyRef, "provider.apiKeyRef", 512);
    if (!/^keychain:[A-Za-z0-9._@+ -]{1,128}\/[A-Za-z0-9._@+ -]{1,128}$/.test(apiKeyRef)) {
      fail("provider.apiKeyRef", "must be a bounded Keychain reference");
    }
    const timeoutMs = candidate.timeoutMs === undefined ? undefined : Number(candidate.timeoutMs);
    if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000)) {
      fail("provider.timeoutMs", "must be an integer from 100 through 120000");
    }
    const maxOutputTokens = candidate.maxOutputTokens === undefined ? undefined : Number(candidate.maxOutputTokens);
    if (maxOutputTokens !== undefined && (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 8_192)) {
      fail("provider.maxOutputTokens", "must be an integer from 256 through 8192");
    }
    provider = {
      providerId: "deepseek",
      baseUrl,
      model,
      apiKeyRef,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    };
  }
  return {
    schemaVersion: 2,
    listenPort,
    token,
    serviceEntryPath,
    runtimeRoot,
    descriptorPath,
    leaseTtlMs,
    graphs,
    ...(provider ? { provider } : {}),
  };
}

export function parseLauncherRunnerArgs(args: string[]): { configPath: string } {
  if (args.length !== 2 || args[0] !== "--config" || !args[1]) {
    throw new Error("Usage: task-copilot-launcher --config <absolute-config-path>");
  }
  if (!isAbsolute(args[1])) throw new Error("Launcher config path must be absolute.");
  return { configPath: args[1] };
}
