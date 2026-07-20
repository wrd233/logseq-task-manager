import {
  ExplicitObjectChangeDebouncer,
  parseExplicitObjectSyntax,
  type DebounceClock,
  type ExplicitObjectBlockChange,
} from "@task-copilot/logseq-adapter";
import type {
  ServiceMaterializeExplicitObjectRequest,
  ServicePrimaryAnchorPage,
  ServiceSynchronizeExplicitObjectResult,
} from "@task-copilot/service-client";
import type { V2Anchor } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

export interface ExplicitSyncTransport {
  synchronizeExplicitObject(input: ServiceMaterializeExplicitObjectRequest): Promise<ServiceSynchronizeExplicitObjectResult>;
  listPrimaryAnchors?(cursor?: string): Promise<ServicePrimaryAnchorPage>;
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
  readBlock?(externalId: string): Promise<unknown>;
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
  private reconciliationPromise: Promise<void> | undefined;
  private reconciliationCursor: string | undefined;
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
    await this.reconcileKnownAnchors();
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

  reconcileKnownAnchors(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.reconciliationPromise) return this.reconciliationPromise;
    this.reconciliationPromise = this.performKnownAnchorReconciliation().finally(() => {
      this.reconciliationPromise = undefined;
      if (!this.disposed) this.emitState();
    });
    return this.reconciliationPromise;
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
      if (!this.disposed) this.emitState();
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
        if (this.disposed) return;
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

  private async performKnownAnchorReconciliation(): Promise<void> {
    const transport = this.transport;
    const listPrimaryAnchors = transport?.listPrimaryAnchors;
    const readBlock = this.options.readBlock;
    if (!transport || !listPrimaryAnchors || !readBlock) return;
    let page: ServicePrimaryAnchorPage;
    try {
      page = await listPrimaryAnchors.call(transport, this.reconciliationCursor);
    } catch (error) {
      if (this.disposed) return;
      this.transport = undefined;
      this.needsReconciliation = true;
      this.issue(errorCode(error), "Primary Anchor 清单读取失败；未执行全 Graph 扫描。", undefined);
      return;
    }
    if (this.disposed) return;
    const anchors: V2Anchor[] = page.anchors;
    if (page.nextCursor) {
      this.needsReconciliation = true;
      this.issue("EXPLICIT_SYNC_RECONCILIATION_PAGE_DEFERRED", "已知 Primary Anchor 将在下一轮继续分页检查；未执行全 Graph 扫描。");
    }
    for (const anchor of anchors) {
      if (this.disposed) return;
      let value: unknown;
      try {
        value = await readBlock(anchor.externalId);
      } catch (error) {
        if (this.disposed) return;
        this.needsReconciliation = true;
        this.issue(errorCode(error), "Primary Anchor 对应 Block 读取失败；其余已知 Anchor 继续检查。", anchor.externalId);
        continue;
      }
      if (this.disposed) return;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        this.needsReconciliation = true;
        this.issue("EXPLICIT_SYNC_PRIMARY_ANCHOR_MISSING", "Primary Anchor 对应 Block 不可用；对象未删除。", anchor.externalId);
        continue;
      }
      const block = value as { uuid?: unknown; content?: unknown };
      if (block.uuid !== anchor.externalId || typeof block.content !== "string") {
        this.needsReconciliation = true;
        this.issue("EXPLICIT_SYNC_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 返回了不一致的 Block 形态；正式状态未修改。", anchor.externalId);
        continue;
      }
      if (checksum(block.content) === anchor.contentHash) continue;
      const parsed = parseExplicitObjectSyntax(block.content);
      if (parsed.kind !== "OBJECT") {
        this.needsReconciliation = true;
        this.issue(parsed.kind === "INVALID" ? parsed.code : "EXPLICIT_SYNC_MARKER_REMOVED", "已绑定 Block 的显式对象语法已改变；需要审阅。", anchor.externalId);
        continue;
      }
      this.onBlocksChanged([value]);
    }
    this.reconciliationCursor = page.nextCursor;
    if (this.disposed) return;
    await this.debouncer.flush();
    await this.drain();
  }

  private issue(code: string, message: string, externalId?: string): void {
    this.options.onIssue?.({ code, message, ...(externalId ? { externalId } : {}) });
  }

  private emitState(): void {
    this.options.onState?.(this.snapshot());
  }
}
