import type { Actor, AgentRunReceipt, FeedbackEvent, FrozenEvidence, GraphApplyResult, GraphSnapshot, Proposal, ProposalRevision, SemanticOperation, StoredCommit, TrustedGraphEvidenceMaterial, WorkObject } from "@task-copilot/contracts";

export interface KernelDescriptor { schemaVersion: 1; baseUrl: string; token: string; graphSnapshotKey: string; pid: number; startedAt: string }
export interface PendingGraphCommit { commit: StoredCommit; graphEffect: unknown }
export interface RecoveryItem { commit: StoredCommit; action: string }

export class ClientError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, message: string, status: number) { super(`${code}: ${message}`); this.name = "ClientError"; this.code = code; this.status = status; }
}

export function parseKernelDescriptor(value: unknown): KernelDescriptor {
  const candidate = value as KernelDescriptor;
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.baseUrl?.startsWith("http://127.0.0.1:") || !candidate.token || !/^[0-9a-f]{64}$/u.test(candidate.graphSnapshotKey) || !Number.isSafeInteger(candidate.pid) || !candidate.startedAt) throw new ClientError("DESCRIPTOR_INVALID", "Kernel descriptor is invalid.", 0);
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
  freezeEvidence(input: { evidenceId: string; workObjectId: string; snapshot: TrustedGraphEvidenceMaterial }): Promise<{ evidence: FrozenEvidence }> { return this.#request("POST", "/v1/evidence/freeze", input); }
  showEvidence(id: string): Promise<{ evidence: FrozenEvidence }> { return this.#request("GET", `/v1/evidence/${encodeURIComponent(id)}`); }
  runCurrentFocusAgent(input: { runId: string; workObjectId: string; evidenceIds: readonly string[]; snapshot: GraphSnapshot }): Promise<{ run: AgentRunReceipt; proposal: Proposal | null; revision: ProposalRevision | null }> { return this.#request("POST", "/v1/agent-runs/current-focus", input); }
  showAgentRun(id: string): Promise<{ run: AgentRunReceipt }> { return this.#request("GET", `/v1/agent-runs/${encodeURIComponent(id)}`); }
  showProposal(id: string): Promise<{ proposal: Proposal; revision: ProposalRevision }> { return this.#request("GET", `/v1/proposals/${encodeURIComponent(id)}`); }
  applyProposal(id: string, input: { operationId: string; snapshot: GraphSnapshot; evidence: ReadonlyArray<{ evidenceId: string } & TrustedGraphEvidenceMaterial> }): Promise<PendingGraphCommit> { return this.#request("POST", `/v1/proposals/${encodeURIComponent(id)}/apply`, input); }
  reviseProposal(id: string, input: { actor: Actor; currentFocus: string | null }): Promise<{ proposal: Proposal; revision: ProposalRevision }> { return this.#request("POST", `/v1/proposals/${encodeURIComponent(id)}/revisions`, input); }
  dismissProposal(id: string, actor: Actor): Promise<{ proposal: Proposal }> { return this.#request("POST", `/v1/proposals/${encodeURIComponent(id)}/dismiss`, { actor }); }
  listFeedback(): Promise<{ feedback: FeedbackEvent[] }> { return this.#request("GET", "/v1/feedback"); }
  prepare(operation: SemanticOperation, snapshot: GraphSnapshot): Promise<PendingGraphCommit> { return this.#request("POST", "/v1/commits/prepare", { operation, snapshot }); }
  complete(commitId: string, result: GraphApplyResult, snapshot: GraphSnapshot): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/complete`, { result, snapshot }); }
  failGraphApply(commitId: string, reason: string): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/graph-failed`, { reason }); }
  prepareUndo(commitId: string, input: { operationId: string; actor: Actor; snapshot: GraphSnapshot }): Promise<PendingGraphCommit> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/undo/prepare`, input); }
  abortPrepared(commitId: string): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/recovery/${encodeURIComponent(commitId)}/abort`); }
  verifyRecoveredGraph(commitId: string, snapshot: GraphSnapshot): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/recovery/${encodeURIComponent(commitId)}/verify`, { snapshot }); }
}
