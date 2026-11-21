import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { WorkspaceError, workRecord, workText, type WorkspaceDescriptor } from "@task-copilot/contracts";
import { MCP_TOOLS, type McpToolDefinition } from "./mcp-handler.ts";

export const MCP_CLIENT_IDS = ["codex", "antigravity", "claude-code", "cursor"] as const;
export type McpClientId = (typeof MCP_CLIENT_IDS)[number];

export interface McpClientConfigOutput {
  client: McpClientId;
  serverName: string;
  format: "toml" | "json";
  configPathHint: string;
  command: string;
  args: string[];
  snippet: string;
  cliCommand?: string;
}

const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const MAX_FRAME_BYTES = 10 * 1024 * 1024;
const SERVER_NAME = "task-copilot-workbench";
const SERVER_VERSION = "0.2.0";

export function isMcpClientId(value: unknown): value is McpClientId {
  return typeof value === "string" && (MCP_CLIENT_IDS as readonly string[]).includes(value);
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function resolveWorkspaceEntryPath(overridePath?: string): string {
  if (overridePath) return resolve(overridePath);
  const argvEntry = process.argv[1] ? resolve(process.argv[1]) : "";
  if (argvEntry.endsWith("workspace.mjs") && existsSync(argvEntry)) {
    return argvEntry;
  }
  const modulePath = fileURLToPath(import.meta.url);
  if (modulePath.endsWith("workspace.mjs") && existsSync(modulePath)) {
    return resolve(modulePath);
  }
  const bundledCandidate = resolve(dirname(modulePath), "../../logseq-plugin/dist/workspace.mjs");
  if (existsSync(bundledCandidate)) {
    return bundledCandidate;
  }
  if (argvEntry && /\.(?:m?js)$/u.test(argvEntry) && existsSync(argvEntry)) {
    return argvEntry;
  }
  return bundledCandidate;
}

export function renderMcpClientConfig(options: {
  client: McpClientId;
  stateDirectory: string;
  nodePath?: string;
  entryPath?: string;
}): McpClientConfigOutput {
  const command = resolve(options.nodePath ?? process.execPath);
  const entryPath = resolveWorkspaceEntryPath(options.entryPath);
  const stateDir = resolve(options.stateDirectory);
  const args = [entryPath, "workspace", "mcp", "--state-dir", stateDir, "--client", options.client];

  if (options.client === "codex") {
    const snippet = [
      `[mcp_servers.${SERVER_NAME}]`,
      `command = ${tomlString(command)}`,
      `args = [${args.map(tomlString).join(", ")}]`,
    ].join("\n");
    return {
      client: "codex",
      serverName: SERVER_NAME,
      format: "toml",
      configPathHint: "~/.codex/config.toml",
      command,
      args,
      snippet,
    };
  }

  const jsonPayload = {
    mcpServers: {
      [SERVER_NAME]: {
        command,
        args,
      },
    },
  };
  const snippet = JSON.stringify(jsonPayload, null, 2);

  if (options.client === "antigravity") {
    return {
      client: "antigravity",
      serverName: SERVER_NAME,
      format: "json",
      configPathHint: "~/.gemini/antigravity/mcp_config.json",
      command,
      args,
      snippet,
    };
  }

  if (options.client === "claude-code") {
    const cliCommand = `claude mcp add ${SERVER_NAME} -- ${shellQuote(command)} ${args.map(shellQuote).join(" ")}`;
    return {
      client: "claude-code",
      serverName: SERVER_NAME,
      format: "json",
      configPathHint: ".mcp.json（或 ~/.claude.json）",
      command,
      args,
      snippet,
      cliCommand,
    };
  }

  return {
    client: "cursor",
    serverName: SERVER_NAME,
    format: "json",
    configPathHint: "~/.cursor/mcp.json",
    command,
    args,
    snippet,
  };
}

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
}

export interface CompanionMcpTransport {
  listTools(): Promise<readonly McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>, clientId: string, requestId: string): Promise<unknown>;
}

export function createCompanionMcpTransport(options: {
  stateDirectory: string;
  readDescriptor: (path: string) => Promise<WorkspaceDescriptor>;
  timeoutMs?: number;
}): CompanionMcpTransport {
  const descriptorFile = join(resolve(options.stateDirectory), "workspace.json");
  const timeoutMs = options.timeoutMs ?? 25_000;
  let cached: WorkspaceDescriptor | null = null;

  const loadDescriptor = async (forceRefresh = false): Promise<WorkspaceDescriptor> => {
    if (!forceRefresh && cached) return cached;
    try {
      cached = await options.readDescriptor(descriptorFile);
      return cached;
    } catch (error) {
      cached = null;
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError(
        "COMPANION_UNAVAILABLE",
        "未检测到运行中的 Companion 服务（workspace.json 不可读），请先启动 workspace serve。"
      );
    }
  };

  const postMcp = async (path: string, body: unknown): Promise<unknown> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const descriptor = await loadDescriptor(attempt > 0);
      let response: Response;
      try {
        response = await fetch(`${descriptor.baseUrl}${path}`, {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${descriptor.token}`,
            "x-workspace-instance": descriptor.instanceId,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        cached = null;
        lastError = error;
        if (attempt === 0) continue;
        throw new WorkspaceError(
          "COMPANION_UNAVAILABLE",
          "无法连接到运行中的 Companion 服务，请确认 workspace serve 正在运行。"
        );
      }
      const parsed = (await response.json()) as {
        instanceId?: string;
        value?: unknown;
        error?: { code?: string; message?: string };
      };
      if (!response.ok) {
        const code = parsed.error?.code ?? "MCP_CALL_FAILED";
        const message = parsed.error?.message ?? code;
        if ((code === "DESCRIPTOR_STALE" || code === "AUTHENTICATION_REQUIRED") && attempt === 0) {
          cached = null;
          continue;
        }
        throw new WorkspaceError(code, message);
      }
      if (parsed.instanceId !== descriptor.instanceId) {
        cached = null;
        if (attempt === 0) continue;
        throw new WorkspaceError("DESCRIPTOR_STALE");
      }
      return parsed.value;
    }
    throw lastError instanceof Error ? lastError : new WorkspaceError("COMPANION_UNAVAILABLE");
  };

  return {
    async listTools() {
      try {
        const value = (await postMcp("/mcp/tools", {})) as { tools?: McpToolDefinition[] };
        if (Array.isArray(value?.tools) && value.tools.length) return value.tools;
      } catch {
        // Static schema fallback keeps tools/list responsive even before Companion starts.
      }
      return MCP_TOOLS;
    },
    async callTool(name, args, clientId, requestId) {
      return postMcp("/mcp/call", { name, arguments: args, clientId, requestId });
    },
  };
}

export async function handleMcpJsonRpcMessage(
  raw: unknown,
  transport: CompanionMcpTransport,
  clientId: string
): Promise<Record<string, unknown> | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    };
  }
  const message = raw as JsonRpcRequest;
  const hasId = Object.prototype.hasOwnProperty.call(message, "id") && message.id !== undefined;
  const id = hasId ? (message.id as string | number | null) : undefined;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    if (!hasId) return null;
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" },
    };
  }

  // Notifications have no id and never receive a JSON-RPC response.
  if (!hasId) {
    return null;
  }

  const method = message.method;
  try {
    if (method === "initialize") {
      const params =
        message.params && typeof message.params === "object" && !Array.isArray(message.params)
          ? (message.params as { protocolVersion?: unknown })
          : {};
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        },
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      const tools = await transport.listTools();
      return {
        jsonrpc: "2.0",
        id,
        result: { tools },
      };
    }

    if (method === "tools/call") {
      const params = workRecord(message.params, ["name", "arguments", "_meta"]);
      const name = workText(params.name, 128);
      if (!MCP_TOOLS.some((tool) => tool.name === name)) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${name}` },
        };
      }
      const args =
        params.arguments === undefined
          ? {}
          : params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
            ? (params.arguments as Record<string, unknown>)
            : (() => {
                throw new WorkspaceError("INVALID_INPUT", "Tool arguments must be a JSON object.");
              })();
      try {
        const value = await transport.callTool(name, args, clientId, randomUUID());
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
            isError: false,
          },
        };
      } catch (error) {
        const code = error instanceof WorkspaceError ? error.code : "MCP_TOOL_FAILED";
        const errMessage = error instanceof Error ? error.message.slice(0, 500) : code;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ error: { code, message: errMessage } }, null, 2) }],
            isError: true,
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  } catch (error) {
    const code = error instanceof WorkspaceError ? -32602 : -32603;
    const errMessage = error instanceof Error ? error.message.slice(0, 500) : "Internal error";
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message: errMessage },
    };
  }
}

type FrameStyle = "ndjson" | "content-length";

function encodeFrame(payload: Record<string, unknown>, style: FrameStyle): string {
  const json = JSON.stringify(payload);
  if (style === "content-length") {
    return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
  }
  return `${json}\n`;
}

export async function runWorkspaceMcpStdio(options: {
  transport: CompanionMcpTransport;
  clientId?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}): Promise<number> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const clientId = options.clientId ? workText(options.clientId, 128) : "mcp";

  let buffer: Buffer = Buffer.alloc(0);
  let writeChain = Promise.resolve();
  const inFlight = new Set<Promise<void>>();

  const writeResponse = (payload: Record<string, unknown>, style: FrameStyle) => {
    const encoded = encodeFrame(payload, style);
    writeChain = writeChain.then(
      () =>
        new Promise<void>((resolveWrite, rejectWrite) => {
          output.write(encoded, (err?: Error | null) => {
            if (err) rejectWrite(err);
            else resolveWrite();
          });
        })
    ).catch(() => undefined);
  };

  const dispatchText = (rawText: string, style: FrameStyle) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      writeResponse(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        style
      );
      return;
    }
    const task = handleMcpJsonRpcMessage(parsed, options.transport, clientId)
      .then((response) => {
        if (response) writeResponse(response, style);
      })
      .finally(() => {
        inFlight.delete(task);
      });
    inFlight.add(task);
  };

  const drainBuffer = (flushRemainder = false) => {
    while (buffer.length > 0) {
      // Skip leading blank CR/LF bytes
      let offset = 0;
      while (offset < buffer.length && (buffer[offset] === 0x0a || buffer[offset] === 0x0d)) {
        offset++;
      }
      if (offset > 0) {
        buffer = buffer.subarray(offset);
      }
      if (buffer.length === 0) break;

      const head = buffer.subarray(0, Math.min(buffer.length, 32)).toString("ascii");
      if (/^content-length\s*:/iu.test(head)) {
        let headerEnd = buffer.indexOf("\r\n\r\n");
        let sepLen = 4;
        if (headerEnd === -1) {
          headerEnd = buffer.indexOf("\n\n");
          sepLen = 2;
        }
        if (headerEnd === -1) break;
        const headers = buffer.subarray(0, headerEnd).toString("ascii");
        const match = /^content-length\s*:\s*(\d+)\s*$/imu.exec(headers);
        if (!match) {
          buffer = buffer.subarray(headerEnd + sepLen);
          writeResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid Content-Length header" } }, "content-length");
          continue;
        }
        const byteLength = Number(match[1]);
        if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_FRAME_BYTES) {
          buffer = Buffer.alloc(0);
          writeResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Frame exceeds maximum size" } }, "content-length");
          break;
        }
        const bodyStart = headerEnd + sepLen;
        if (buffer.length < bodyStart + byteLength) break;
        const bodyText = buffer.subarray(bodyStart, bodyStart + byteLength).toString("utf8");
        buffer = buffer.subarray(bodyStart + byteLength);
        dispatchText(bodyText, "content-length");
        continue;
      }

      const newlineIdx = buffer.indexOf(0x0a);
      if (newlineIdx === -1) {
        if (buffer.length > MAX_FRAME_BYTES) {
          buffer = Buffer.alloc(0);
          writeResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Frame exceeds maximum size" } }, "ndjson");
          break;
        }
        if (flushRemainder) {
          const remainder = buffer.toString("utf8");
          buffer = Buffer.alloc(0);
          dispatchText(remainder, "ndjson");
        }
        break;
      }
      const lineText = buffer.subarray(0, newlineIdx).toString("utf8");
      buffer = buffer.subarray(newlineIdx + 1);
      dispatchText(lineText, "ndjson");
    }
  };

  await new Promise<void>((resolveLoop) => {
    const onData = (chunk: Buffer | string) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
      buffer = buffer.length ? Buffer.concat([buffer, bytes]) : bytes;
      drainBuffer(false);
    };
    const onEnd = () => {
      drainBuffer(true);
      resolveLoop();
    };
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("close", onEnd);
  });

  await Promise.all([...inFlight]);
  await writeChain;
  return 0;
}
