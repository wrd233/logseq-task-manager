import { randomUUID } from "node:crypto";

import type { GraphGatewayRequest, GraphGatewayRequestEnvelope, GraphGatewayResponse, GraphGatewayStatus } from "@task-copilot/contracts";

interface PendingRequest {
  envelope: GraphGatewayRequestEnvelope;
  delivered: boolean;
  deliveredAt: number;
  resolve: (value: GraphGatewayResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function requestGraphId(request: GraphGatewayRequest): string {
  return request.kind === "READ_TARGET_SNAPSHOT" ? request.input.graphId : request.kind === "APPLY_EFFECT" ? request.effect.graphId : request.kind === "APPLY_CURATION" ? request.curation.graphId : request.graphId;
}

function responseGraphIds(response: GraphGatewayResponse): readonly string[] {
  if (response.kind === "SEARCH") return response.matches.map((item) => item.graphId);
  if (response.kind === "READ_BLOCK") return [response.block.graphId];
  if (response.kind === "READ_PAGE") return [response.page.graphId, ...response.page.blocks.map((item) => item.graphId)];
  if (response.kind === "READ_EVIDENCE") return [response.material.graphId];
  if (response.kind === "READ_TARGET_SNAPSHOT") return [response.snapshot.graphId];
  if (response.kind === "READ_CURATION_SNAPSHOT" || response.kind === "APPLY_CURATION") return [response.snapshot.graphId];
  return [response.result.graphId, response.snapshot.graphId];
}

export class GraphBrokerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(`${code}: ${message}`); this.name = "GraphBrokerError"; this.code = code; }
}

export class GraphRequestBroker {
  readonly #now: () => string;
  readonly #offlineAfterMs: number;
  readonly #requestTimeoutMs: number;
  readonly #deliveryLeaseMs: number;
  readonly #pending = new Map<string, PendingRequest>();
  #graphId: string | null = null;
  #lastSeenAt: string | null = null;
  #lastSeenMs = 0;

  constructor(options: { now?: () => string; offlineAfterMs?: number; requestTimeoutMs?: number; deliveryLeaseMs?: number } = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#offlineAfterMs = options.offlineAfterMs ?? 3_000;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.#deliveryLeaseMs = options.deliveryLeaseMs ?? 500;
  }

  heartbeat(graphId: string): GraphGatewayStatus {
    if (!graphId.trim()) throw new GraphBrokerError("GRAPH_ID_REQUIRED", "Graph Adapter heartbeat requires graphId.");
    if (this.#graphId && this.#graphId !== graphId && (this.#pending.size > 0 || Date.now() - this.#lastSeenMs <= this.#offlineAfterMs)) throw new GraphBrokerError("GRAPH_ADAPTER_GRAPH_CONFLICT", "Another Graph Adapter is already bound to this broker.");
    this.#graphId = graphId;
    this.#lastSeenAt = this.#now();
    this.#lastSeenMs = Date.now();
    return this.status();
  }

  status(): GraphGatewayStatus {
    const available = this.#graphId !== null && Date.now() - this.#lastSeenMs <= this.#offlineAfterMs;
    return {
      available,
      reason: available ? "READY" : "GRAPH_ADAPTER_OFFLINE",
      graphId: available ? this.#graphId : null,
      capabilities: available ? ["SEARCH", "READ_BLOCK", "READ_PAGE", "FREEZE_EVIDENCE", "APPLY_KERNEL_EFFECT", "APPLY_TYPED_CURATION"] : [],
      lastSeenAt: this.#lastSeenAt,
    };
  }

  async request(request: GraphGatewayRequest): Promise<GraphGatewayResponse> {
    const status = this.status();
    if (!status.available || !status.graphId) throw new GraphBrokerError("GRAPH_ADAPTER_OFFLINE", "The trusted Logseq Graph Adapter is not connected.");
    if (requestGraphId(request) !== status.graphId) throw new GraphBrokerError("GRAPH_ID_MISMATCH", "Requested Graph is not the connected Graph Adapter.");
    const envelope = { id: randomUUID(), request, createdAt: this.#now() } satisfies GraphGatewayRequestEnvelope;
    return new Promise<GraphGatewayResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(envelope.id);
        reject(new GraphBrokerError("GRAPH_GATEWAY_TIMEOUT", "The Graph Adapter did not complete the request before timeout."));
      }, this.#requestTimeoutMs);
      this.#pending.set(envelope.id, { envelope, delivered: false, deliveredAt: 0, resolve, reject, timer });
    });
  }

  poll(graphId: string): GraphGatewayRequestEnvelope | null {
    this.heartbeat(graphId);
    const pending = [...this.#pending.values()].find((item) => !item.delivered || Date.now() - item.deliveredAt >= this.#deliveryLeaseMs);
    if (!pending) return null;
    pending.delivered = true; pending.deliveredAt = Date.now();
    return pending.envelope;
  }

  complete(graphId: string, requestId: string, response: GraphGatewayResponse): void {
    this.heartbeat(graphId);
    const pending = this.#pending.get(requestId);
    if (!pending) throw new GraphBrokerError("GRAPH_REQUEST_NOT_FOUND", "Graph request is not pending.");
    const expectedKind = pending.envelope.request.kind;
    if (response.kind !== expectedKind) throw new GraphBrokerError("GRAPH_RESPONSE_KIND_MISMATCH", "Graph response kind does not match its request.");
    const expectedGraphId = requestGraphId(pending.envelope.request);
    if (graphId !== expectedGraphId || responseGraphIds(response).some((value) => value !== expectedGraphId)) throw new GraphBrokerError("GRAPH_RESPONSE_GRAPH_MISMATCH", "Graph response is not bound to the requested Graph.");
    clearTimeout(pending.timer); this.#pending.delete(requestId); pending.resolve(response);
  }

  fail(graphId: string, requestId: string, code: string, message: string): void {
    const pending = this.#pending.get(requestId);
    if (!pending) throw new GraphBrokerError("GRAPH_REQUEST_NOT_FOUND", "Graph request is not pending.");
    if (graphId !== requestGraphId(pending.envelope.request)) throw new GraphBrokerError("GRAPH_RESPONSE_GRAPH_MISMATCH", "Graph failure is not bound to the requested Graph.");
    this.heartbeat(graphId);
    clearTimeout(pending.timer); this.#pending.delete(requestId); pending.reject(new GraphBrokerError(code, message));
  }

  close(): void {
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new GraphBrokerError("GRAPH_BROKER_CLOSED", "Graph broker is shutting down.")); }
    this.#pending.clear();
  }
}
