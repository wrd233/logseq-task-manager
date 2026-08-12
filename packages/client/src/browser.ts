import type { Actor, GraphApplyResult, GraphSnapshot, SemanticOperation } from "@task-copilot/contracts";
import type { WorkObject } from "@task-copilot/domain";
import type { StoredCommit } from "@task-copilot/sqlite";

export interface KernelDescriptor { schemaVersion: 1; baseUrl: string; token: string; pid: number; startedAt: string }
export interface PendingGraphCommit { commit: StoredCommit; graphEffect: unknown }
export interface RecoveryItem { commit: StoredCommit; action: string }

export class ClientError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, message: string, status: number) { super(`${code}: ${message}`); this.name = "ClientError"; this.code = code; this.status = status; }
}

export function parseKernelDescriptor(value: unknown): KernelDescriptor {
  const candidate = value as KernelDescriptor;
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.baseUrl?.startsWith("http://127.0.0.1:") || !candidate.token || !Number.isSafeInteger(candidate.pid) || !candidate.startedAt) throw new ClientError("DESCRIPTOR_INVALID", "Kernel descriptor is invalid.", 0);
  return candidate;
}

export class KernelClient {
  readonly #descriptor: KernelDescriptor;
  constructor(descriptor: KernelDescriptor) { this.#descriptor = descriptor; }
  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, headers: { authorization: `Bearer ${this.#descriptor.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    const response = await fetch(`${this.#descriptor.baseUrl}${path}`, init);
    const value = await response.json() as { error?: { code: string; message: string } } & T;
    if (!response.ok) throw new ClientError(value.error?.code ?? "HTTP_ERROR", value.error?.message ?? response.statusText, response.status);
    return value;
  }
  status(): Promise<{ status: "ok"; schemaVersion: number; pid: number }> { return this.#request("GET", "/v1/status"); }
  listObjects(): Promise<{ objects: WorkObject[] }> { return this.#request("GET", "/v1/objects"); }
  showObject(id: string): Promise<{ object: WorkObject; anchor: unknown }> { return this.#request("GET", `/v1/objects/${encodeURIComponent(id)}`); }
  showCommit(id: string): Promise<{ commit: StoredCommit }> { return this.#request("GET", `/v1/commits/${encodeURIComponent(id)}`); }
  listRecovery(): Promise<{ recovery: RecoveryItem[] }> { return this.#request("GET", "/v1/recovery"); }
  prepare(operation: SemanticOperation, snapshot: GraphSnapshot): Promise<PendingGraphCommit> { return this.#request("POST", "/v1/commits/prepare", { operation, snapshot }); }
  complete(commitId: string, result: GraphApplyResult, snapshot: GraphSnapshot): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/complete`, { result, snapshot }); }
  prepareUndo(commitId: string, input: { operationId: string; actor: Actor; snapshot: GraphSnapshot }): Promise<PendingGraphCommit> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/undo/prepare`, input); }
  abortPrepared(commitId: string): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/recovery/${encodeURIComponent(commitId)}/abort`); }
  verifyRecoveredGraph(commitId: string, snapshot: GraphSnapshot): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/recovery/${encodeURIComponent(commitId)}/verify`, { snapshot }); }
}
