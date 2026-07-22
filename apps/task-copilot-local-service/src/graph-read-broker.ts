import type { ServiceGraphReadQuery, ServiceGraphReadRequest, ServiceGraphReadResult } from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

interface PendingRead {
  request: ServiceGraphReadRequest;
  resolve(result: ServiceGraphReadResult): void;
  reject(error: StructuredError): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface WaitingBridge {
  resolve(request: ServiceGraphReadRequest | undefined): void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface GraphReadBrokerOptions {
  readTimeoutMs?: number;
  bridgePollMs?: number;
  bridgeLeaseMs?: number;
  maximumPending?: number;
  now?: () => Date;
  createRequestId?: () => string;
}

function graphError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-132", "D-133", "D-135"] });
}

export class GraphReadBroker {
  private readonly queued: ServiceGraphReadRequest[] = [];
  private readonly pending = new Map<string, PendingRead>();
  private bridgeWaiter: WaitingBridge | undefined;
  private lastBridgeSeenAt = 0;
  private closed = false;

  private readonly readTimeoutMs: number;
  private readonly bridgePollMs: number;
  private readonly bridgeLeaseMs: number;
  private readonly maximumPending: number;
  private readonly now: () => Date;
  private readonly createRequestId: () => string;

  constructor(options: GraphReadBrokerOptions = {}) {
    this.readTimeoutMs = options.readTimeoutMs ?? 8_000;
    this.bridgePollMs = options.bridgePollMs ?? 15_000;
    this.bridgeLeaseMs = options.bridgeLeaseMs ?? 20_000;
    this.maximumPending = options.maximumPending ?? 8;
    this.now = options.now ?? (() => new Date());
    this.createRequestId = options.createRequestId ?? (() => `graph_read_${globalThis.crypto.randomUUID().replaceAll("-", "")}`);
  }

  async read(query: ServiceGraphReadQuery): Promise<ServiceGraphReadResult> {
    if (this.closed) throw graphError("GRAPH_READ_BRIDGE_CLOSED", "Graph 只读桥接已停止。");
    const now = this.now();
    if (!this.bridgeWaiter && now.getTime() - this.lastBridgeSeenAt > this.bridgeLeaseMs) {
      throw graphError("GRAPH_READ_BRIDGE_UNAVAILABLE", "Logseq Desktop 只读桥接未连接；没有读取 Graph 或写入正式状态。");
    }
    if (this.pending.size >= this.maximumPending) throw graphError("GRAPH_READ_BRIDGE_BUSY", "Graph 只读桥接已有过多等待请求；请稍后重试。");
    const requestId = this.createRequestId();
    const request: ServiceGraphReadRequest = {
      ...query,
      requestId,
      requestedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.readTimeoutMs).toISOString(),
    };
    return new Promise<ServiceGraphReadResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        const queuedIndex = this.queued.findIndex((candidate) => candidate.requestId === requestId);
        if (queuedIndex >= 0) this.queued.splice(queuedIndex, 1);
        reject(graphError("GRAPH_READ_TIMEOUT", "Logseq Desktop 未在时限内返回 Graph 只读结果；没有使用缓存或猜测文件映射。"));
      }, this.readTimeoutMs);
      this.pending.set(requestId, { request, resolve, reject, timeout });
      if (this.bridgeWaiter) {
        const waiter = this.bridgeWaiter;
        this.bridgeWaiter = undefined;
        clearTimeout(waiter.timeout);
        waiter.resolve(request);
      } else {
        this.queued.push(request);
      }
    });
  }

  async claim(): Promise<ServiceGraphReadRequest | undefined> {
    if (this.closed) throw graphError("GRAPH_READ_BRIDGE_CLOSED", "Graph 只读桥接已停止。");
    if (this.bridgeWaiter) throw graphError("GRAPH_READ_BRIDGE_ALREADY_CONNECTED", "已有 Logseq Desktop 只读桥接正在等待请求。");
    this.lastBridgeSeenAt = this.now().getTime();
    const request = this.queued.shift();
    if (request) return request;
    return new Promise<ServiceGraphReadRequest | undefined>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.bridgeWaiter?.resolve === resolve) this.bridgeWaiter = undefined;
        resolve(undefined);
      }, this.bridgePollMs);
      this.bridgeWaiter = { resolve, timeout };
    });
  }

  complete(result: ServiceGraphReadResult): void {
    if (this.closed) throw graphError("GRAPH_READ_BRIDGE_CLOSED", "Graph 只读桥接已停止。");
    const pending = this.pending.get(result.requestId);
    if (!pending) throw graphError("GRAPH_READ_REQUEST_NOT_FOUND", "Graph 只读请求已过期或不存在。");
    if (result.status === "FOUND" && (
      result.snapshot.requestedTarget !== pending.request.target
      || (pending.request.kind !== "RESOLVE" && result.snapshot.kind !== pending.request.kind)
    )) {
      throw graphError("GRAPH_READ_RESULT_MISMATCH", "Graph 只读结果与原请求不匹配。");
    }
    this.pending.delete(result.requestId);
    clearTimeout(pending.timeout);
    this.lastBridgeSeenAt = this.now().getTime();
    pending.resolve(result);
  }

  status(): { connected: boolean; pending: number; queued: number } {
    return {
      connected: !this.closed && (this.bridgeWaiter !== undefined || this.now().getTime() - this.lastBridgeSeenAt <= this.bridgeLeaseMs),
      pending: this.pending.size,
      queued: this.queued.length,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.bridgeWaiter) {
      clearTimeout(this.bridgeWaiter.timeout);
      this.bridgeWaiter.resolve(undefined);
      this.bridgeWaiter = undefined;
    }
    const error = graphError("GRAPH_READ_BRIDGE_CLOSED", "Graph 只读桥接已停止。");
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    this.queued.length = 0;
  }
}
