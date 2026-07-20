import type { V2ManagedObject } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export const LOCAL_SERVICE_PROTOCOL_VERSION = 1;

export interface ServiceCapabilities {
  formalWrites: boolean;
  migration: boolean;
  provider: boolean;
}

export interface ServiceDescriptor {
  protocolVersion: number;
  url: string;
  token: string;
  pid: number;
  createdAt: string;
}

export interface ServiceHealth {
  status: "READY";
  protocolVersion: number;
  capabilities: ServiceCapabilities;
}

export interface ServiceStatus extends ServiceHealth {
  databaseSchemaVersion: number;
  objectCount: number;
}

export interface ServiceDoctor {
  status: "PASS" | "FAIL";
  schemaVersion: number;
  integrity: string;
  foreignKeyViolations: number;
  objectCount: number;
}

export type ServiceConnectionState =
  | { status: "READY"; capabilities: ServiceCapabilities; formalWritesAvailable: boolean; graphEditingAvailable: true }
  | { status: "RESTRICTED"; reasonCode: string; message: string; formalWritesAvailable: false; graphEditingAvailable: true };

function clientError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-216"], ...(details ? { details } : {}) });
}

export function validateServiceDescriptor(value: unknown): ServiceDescriptor {
  if (!value || typeof value !== "object") throw clientError("SERVICE_DESCRIPTOR_INVALID", "Local Service 描述符无效。");
  const candidate = value as Partial<ServiceDescriptor>;
  if (
    typeof candidate.protocolVersion !== "number" ||
    typeof candidate.url !== "string" ||
    typeof candidate.token !== "string" ||
    typeof candidate.pid !== "number" ||
    typeof candidate.createdAt !== "string" ||
    candidate.token.length < 24
  ) {
    throw clientError("SERVICE_DESCRIPTOR_INVALID", "Local Service 描述符字段不完整。");
  }
  let url: URL;
  try {
    url = new URL(candidate.url);
  } catch {
    throw clientError("SERVICE_DESCRIPTOR_INVALID", "Local Service URL 无效。");
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/") {
    throw clientError("SERVICE_DESCRIPTOR_NON_LOOPBACK", "Local Service 描述符必须指向 127.0.0.1 根地址。");
  }
  if (candidate.protocolVersion !== LOCAL_SERVICE_PROTOCOL_VERSION) {
    throw clientError("SERVICE_PROTOCOL_MISMATCH", "Local Service 描述符协议版本不兼容。", {
      expected: LOCAL_SERVICE_PROTOCOL_VERSION,
      actual: candidate.protocolVersion,
    });
  }
  return candidate as ServiceDescriptor;
}

export class LocalServiceClient {
  constructor(
    private readonly descriptor: ServiceDescriptor,
    private readonly timeoutMs = 3000,
  ) {
    validateServiceDescriptor(descriptor);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.descriptor.url}${path.slice(1)}`, {
        ...init,
        headers: { ...init?.headers, authorization: `Bearer ${this.descriptor.token}` },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw clientError("SERVICE_TIMEOUT", "Local Service 请求超时。");
      throw clientError("SERVICE_UNAVAILABLE", "Local Service 不可用；正式语义写入已受限。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw clientError("SERVICE_RESPONSE_INVALID", "Local Service 返回了非 JSON 响应。", { status: response.status });
    }
    if (!response.ok) {
      const remoteCode = body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: unknown } }).error?.code
        : undefined;
      const code = response.status === 401 ? "SERVICE_UNAUTHORIZED" : "SERVICE_HTTP_ERROR";
      throw clientError(code, response.status === 401 ? "Local Service 会话认证失败。" : "Local Service 请求失败。", {
        status: response.status,
        ...(typeof remoteCode === "string" ? { remoteCode } : {}),
      });
    }
    return body as T;
  }

  private assertProtocol(actual: number): void {
    if (actual !== LOCAL_SERVICE_PROTOCOL_VERSION) {
      throw clientError("SERVICE_PROTOCOL_MISMATCH", "Local Service 协议版本不兼容。", {
        expected: LOCAL_SERVICE_PROTOCOL_VERSION,
        actual,
      });
    }
  }

  async health(): Promise<ServiceHealth> {
    const value = await this.request<ServiceHealth>("/health");
    this.assertProtocol(value.protocolVersion);
    return value;
  }

  async status(): Promise<ServiceStatus> {
    const value = await this.request<ServiceStatus>("/status");
    this.assertProtocol(value.protocolVersion);
    return value;
  }

  doctor(): Promise<ServiceDoctor> {
    return this.request<ServiceDoctor>("/doctor", { method: "POST" });
  }

  async listObjects(): Promise<V2ManagedObject[]> {
    return (await this.request<{ objects: V2ManagedObject[] }>("/objects")).objects;
  }

  async getObject(objectId: string): Promise<V2ManagedObject | undefined> {
    try {
      return (await this.request<{ object: V2ManagedObject }>(`/objects/${encodeURIComponent(objectId)}`)).object;
    } catch (error) {
      if (error instanceof StructuredError && error.details?.remoteCode === "OBJECT_NOT_FOUND") return undefined;
      throw error;
    }
  }
}

export async function probeService(client: Pick<LocalServiceClient, "health">): Promise<ServiceConnectionState> {
  try {
    const health = await client.health();
    return {
      status: "READY",
      capabilities: health.capabilities,
      formalWritesAvailable: health.capabilities.formalWrites,
      graphEditingAvailable: true,
    };
  } catch (error) {
    return {
      status: "RESTRICTED",
      reasonCode: error instanceof StructuredError ? error.code : "SERVICE_UNKNOWN_ERROR",
      message: error instanceof Error ? error.message : String(error),
      formalWritesAvailable: false,
      graphEditingAvailable: true,
    };
  }
}
