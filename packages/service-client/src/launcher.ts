import { StructuredError } from "@task-copilot/shared";

import { validateServiceDescriptor, type ServiceDescriptor } from "./index.ts";

export const LAUNCHER_PROTOCOL_VERSION = 1;

export interface LauncherDescriptor {
  kind: "task-copilot-launcher";
  protocolVersion: typeof LAUNCHER_PROTOCOL_VERSION;
  url: string;
  token: string;
}

export interface LauncherHealth {
  status: "READY";
  protocolVersion: typeof LAUNCHER_PROTOCOL_VERSION;
  capabilities: {
    graphServiceLifecycle: true;
    leaseHeartbeat: true;
    ownedShutdown: true;
  };
  configuredGraphs: number;
}

export interface LauncherEnsureResult {
  leaseId: string;
  serviceDescriptor: ServiceDescriptor;
}

function launcherError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-216"], ...(details ? { details } : {}) });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) {
    throw launcherError("LAUNCHER_REQUEST_INVALID", `${field} 不是有效的 Launcher 标识符。`);
  }
  return value;
}

export async function deriveLauncherGraphKey(graphIdentity: unknown): Promise<string> {
  if (typeof graphIdentity !== "string" || !graphIdentity.trim() || graphIdentity.length > 4_096) {
    throw launcherError("LAUNCHER_GRAPH_IDENTITY_REQUIRED", "当前 Graph 缺少可用于安全绑定的稳定身份。");
  }
  const normalized = graphIdentity.trim().normalize("NFC").replace(/\/+$/, "");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `graph-${hex}`;
}

export function validateLauncherDescriptor(value: unknown): LauncherDescriptor {
  const candidate = record(value);
  if (!candidate || candidate.kind !== "task-copilot-launcher") {
    throw launcherError("LAUNCHER_DESCRIPTOR_INVALID", "Launcher 描述符类型无效。");
  }
  if (candidate.protocolVersion !== LAUNCHER_PROTOCOL_VERSION) {
    throw launcherError("LAUNCHER_PROTOCOL_MISMATCH", "Launcher 协议版本不兼容。", {
      expected: LAUNCHER_PROTOCOL_VERSION,
      actual: candidate.protocolVersion,
    });
  }
  if (typeof candidate.token !== "string" || candidate.token.length < 32 || candidate.token.length > 512) {
    throw launcherError("LAUNCHER_DESCRIPTOR_INVALID", "Launcher 描述符认证字段无效。");
  }
  if (typeof candidate.url !== "string" || candidate.url.length > 2_048) {
    throw launcherError("LAUNCHER_DESCRIPTOR_INVALID", "Launcher 描述符 URL 无效。");
  }
  let url: URL;
  try {
    url = new URL(candidate.url);
  } catch {
    throw launcherError("LAUNCHER_DESCRIPTOR_INVALID", "Launcher 描述符 URL 无效。");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw launcherError("LAUNCHER_DESCRIPTOR_NON_LOOPBACK", "Launcher URL 必须是精确的 127.0.0.1 回环根地址。");
  }
  return {
    kind: "task-copilot-launcher",
    protocolVersion: LAUNCHER_PROTOCOL_VERSION,
    url: url.href,
    token: candidate.token,
  };
}

export class LauncherClient {
  private readonly descriptor: LauncherDescriptor;

  constructor(descriptor: LauncherDescriptor, private readonly timeoutMs = 3_000) {
    this.descriptor = validateLauncherDescriptor(descriptor);
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.descriptor.url}${path.slice(1)}`, {
        ...init,
        headers: {
          ...init?.headers,
          authorization: `Bearer ${this.descriptor.token}`,
          ...(init?.body ? { "content-type": "application/json" } : {}),
        },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw launcherError("LAUNCHER_TIMEOUT", "Task Copilot Launcher 请求超时。");
      throw launcherError("LAUNCHER_UNAVAILABLE", "Task Copilot Launcher 暂时不可用。");
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401) {
      throw launcherError("LAUNCHER_UNAUTHORIZED", "Task Copilot Launcher 会话认证失败。");
    }
    if (response.status === 204) return undefined;

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw launcherError("LAUNCHER_RESPONSE_INVALID", "Task Copilot Launcher 返回了无效响应。", { status: response.status });
    }
    if (!response.ok) {
      const remoteError = record(record(value)?.error);
      const remoteCode = typeof remoteError?.code === "string" && /^[A-Z][A-Z0-9_]{2,127}$/.test(remoteError.code)
        ? remoteError.code
        : undefined;
      throw launcherError("LAUNCHER_HTTP_ERROR", "Task Copilot Launcher 无法完成请求。", {
        status: response.status,
        ...(remoteCode ? { remoteCode } : {}),
      });
    }
    return value;
  }

  async health(): Promise<LauncherHealth> {
    const value = record(await this.request("/health"));
    if (
      value?.status !== "READY" ||
      value.protocolVersion !== LAUNCHER_PROTOCOL_VERSION ||
      typeof value.configuredGraphs !== "number" ||
      !Number.isSafeInteger(value.configuredGraphs) ||
      value.configuredGraphs < 0
    ) {
      throw launcherError(
        value?.protocolVersion !== LAUNCHER_PROTOCOL_VERSION ? "LAUNCHER_PROTOCOL_MISMATCH" : "LAUNCHER_RESPONSE_INVALID",
        value?.protocolVersion !== LAUNCHER_PROTOCOL_VERSION ? "Launcher 协议版本不兼容。" : "Task Copilot Launcher 健康响应无效。",
      );
    }
    return value as unknown as LauncherHealth;
  }

  async ensure(graphKey: string, clientInstanceId: string): Promise<LauncherEnsureResult> {
    const value = record(await this.request("/sessions/ensure", {
      method: "POST",
      body: JSON.stringify({
        graphKey: identifier(graphKey, "graphKey"),
        clientInstanceId: identifier(clientInstanceId, "clientInstanceId"),
      }),
    }));
    if (!value) throw launcherError("LAUNCHER_RESPONSE_INVALID", "Task Copilot Launcher 会话响应无效。");
    return {
      leaseId: identifier(value.leaseId, "leaseId"),
      serviceDescriptor: validateServiceDescriptor(value.serviceDescriptor),
    };
  }

  async heartbeat(leaseId: string): Promise<void> {
    await this.request("/sessions/heartbeat", {
      method: "POST",
      body: JSON.stringify({ leaseId: identifier(leaseId, "leaseId") }),
    });
  }

  async release(leaseId: string): Promise<void> {
    await this.request("/sessions/release", {
      method: "POST",
      body: JSON.stringify({ leaseId: identifier(leaseId, "leaseId") }),
    });
  }
}
