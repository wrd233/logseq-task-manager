import {
  ExplicitObjectChangeDebouncer,
  type DebounceClock,
  type ExplicitObjectBlockChange,
} from "@task-copilot/logseq-adapter";
import type {
  ServiceMaterializeExplicitObjectRequest,
  ServiceSynchronizeExplicitObjectResult,
} from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

export interface ExplicitSyncTransport {
  synchronizeExplicitObject(input: ServiceMaterializeExplicitObjectRequest): Promise<ServiceSynchronizeExplicitObjectResult>;
}

export interface ExplicitSyncIssue {
  code: string;
  externalId?: string;
  message: string;
}

export interface ExplicitSyncState {
  pending: number;
  transportReady: boolean;
  reconciliationRequired: boolean;
}

export interface ExplicitSyncControllerOptions {
  delayMs?: number;
  maximumPending?: number;
  clock?: DebounceClock;
  createTraceId?: () => string;
  onIssue?(issue: ExplicitSyncIssue): void;
  onState?(state: ExplicitSyncState): void;
}

export interface ExplicitSyncEventHost {
  DB: {
    onChanged(callback: (event: { blocks?: unknown[] }) => void): () => void;
  };
}

export function registerExplicitSyncEvents(
  host: ExplicitSyncEventHost,
  controller: Pick<ExplicitSyncController, "onBlocksChanged">,
): () => void {
  return host.DB.onChanged((event) => controller.onBlocksChanged(event.blocks ?? []));
}

type PendingSync = ServiceMaterializeExplicitObjectRequest;

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const details = "details" in error ? (error as { details?: unknown }).details : undefined;
    if (details && typeof details === "object" && "remoteCode" in details && typeof (details as { remoteCode?: unknown }).remoteCode === "string") {
      return (details as { remoteCode: string }).remoteCode;
    }
    if ("code" in error && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  }
  return "EXPLICIT_SYNC_DELIVERY_FAILED";
}

export class ExplicitSyncController {
  private readonly pending = new Map<string, PendingSync>();
  private readonly maximumPending: number;
  private readonly createTraceId: () => string;
  private readonly debouncer: ExplicitObjectChangeDebouncer;
  private transport: ExplicitSyncTransport | undefined;
  private drainPromise: Promise<void> | undefined;
  private disposed = false;
  private needsReconciliation = false;

  constructor(private readonly options: ExplicitSyncControllerOptions = {}) {
    this.maximumPending = options.maximumPending ?? 256;
    if (!Number.isSafeInteger(this.maximumPending) || this.maximumPending < 1) {
      throw new Error("Explicit sync maximum pending count must be a positive integer.");
    }
    this.createTraceId = options.createTraceId ?? (() => `explicit-sync-${Date.now()}-${globalThis.crypto.randomUUID()}`);
    this.debouncer = new ExplicitObjectChangeDebouncer({
      delayMs: options.delayMs ?? 300,
      ...(options.clock ? { clock: options.clock } : {}),
      deliver: async (batch) => this.acceptBatch(batch),
      onError: (error, batch) => {
        this.needsReconciliation = true;
        this.issue(errorCode(error), "显式对象事件批次处理失败；需要一致性检查。", batch[0]?.externalId);
        this.emitState();
      },
    });
    this.emitState();
  }

  onBlocksChanged(blocks: readonly unknown[]): void {
    if (!this.disposed) this.debouncer.enqueue(blocks);
  }

  async flush(): Promise<void> {
    if (this.disposed) return;
    await this.debouncer.flush();
    await this.drain();
  }

  async resume(transport: ExplicitSyncTransport): Promise<void> {
    if (this.disposed) return;
    this.transport = transport;
    this.emitState();
    await this.drain();
  }

  pause(): void {
    this.transport = undefined;
    this.emitState();
  }

  snapshot(): ExplicitSyncState {
    return {
      pending: this.pending.size,
      transportReady: this.transport !== undefined,
      reconciliationRequired: this.needsReconciliation,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.transport = undefined;
    this.pending.clear();
    this.debouncer.dispose();
    this.emitState();
  }

  private async acceptBatch(batch: ExplicitObjectBlockChange[]): Promise<void> {
    for (const change of batch) {
      if (change.parsed.kind === "INVALID") {
        this.needsReconciliation = true;
        this.issue(change.parsed.code, "显式对象标识存在结构异常；正文未被修改。", change.externalId);
        continue;
      }
      if (change.parsed.kind === "NONE") continue;
      const request: PendingSync = {
        objectType: change.parsed.objectType,
        text: change.parsed.title,
        externalId: change.externalId,
        inputVersion: change.inputVersion,
        contentHash: checksum(change.content),
        idempotencyKey: `explicit-sync:${change.externalId}:${change.inputVersion}:${checksum(`${change.parsed.objectType}\0${change.parsed.title.normalize("NFKC").replace(/\s+/gu, " ")}`)}`,
        traceId: this.createTraceId(),
      };
      if (!this.pending.has(change.externalId) && this.pending.size >= this.maximumPending) {
        this.needsReconciliation = true;
        this.issue("EXPLICIT_SYNC_QUEUE_CAPACITY_EXCEEDED", "显式同步待恢复队列已达上限；正文保持不变，需要一致性检查。", change.externalId);
        continue;
      }
      this.pending.set(change.externalId, request);
    }
    this.emitState();
    await this.drain();
  }

  private drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.performDrain().finally(() => {
      this.drainPromise = undefined;
      this.emitState();
    });
    return this.drainPromise;
  }

  private async performDrain(): Promise<void> {
    while (!this.disposed && this.transport && this.pending.size > 0) {
      const next = this.pending.entries().next().value as [string, PendingSync] | undefined;
      if (!next) return;
      const [externalId, request] = next;
      try {
        await this.transport.synchronizeExplicitObject(request);
        if (this.pending.get(externalId) === request) this.pending.delete(externalId);
      } catch (error) {
        const code = errorCode(error);
        this.needsReconciliation = true;
        if (code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL") {
          if (this.pending.get(externalId) === request) this.pending.delete(externalId);
          this.issue(code, "显式类型变化未提交；需要在 Proposal 管道中审阅。", externalId);
          continue;
        }
        this.transport = undefined;
        this.issue(code, "显式对象同步未提交；正文保持可编辑，连接恢复后将重试。", externalId);
        return;
      }
    }
  }

  private issue(code: string, message: string, externalId?: string): void {
    this.options.onIssue?.({ code, message, ...(externalId ? { externalId } : {}) });
  }

  private emitState(): void {
    this.options.onState?.(this.snapshot());
  }
}
