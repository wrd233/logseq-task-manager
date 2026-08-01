export interface AgentGovernanceQueueIssue {
  code: "AGENT_GOVERNANCE_QUEUE_CAPACITY_EXCEEDED" | "AGENT_GOVERNANCE_PROCESSING_FAILED";
  message: string;
  sourceRootId?: string;
}

export interface AgentGovernanceChangeQueueOptions<T> {
  process(value: T, signal: AbortSignal): Promise<void>;
  onIssue?(issue: AgentGovernanceQueueIssue): void;
  delayMs?: number;
  maximumPendingRoots?: number;
}

interface PendingValue<T> {
  sourceRootId: string;
  value: T;
  revision: number;
}

export class AgentGovernanceChangeQueue<T> {
  private readonly pending = new Map<string, PendingValue<T>>();
  private readonly latestRevision = new Map<string, number>();
  private readonly delayMs: number;
  private readonly maximumPendingRoots: number;
  private active: { sourceRootId: string; controller: AbortController } | undefined;
  private timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private drainPromise: Promise<void> | undefined;
  private disposed = false;
  private revision = 0;

  constructor(private readonly options: AgentGovernanceChangeQueueOptions<T>) {
    this.delayMs = options.delayMs ?? 3_000;
    this.maximumPendingRoots = options.maximumPendingRoots ?? 32;
    if (!Number.isSafeInteger(this.delayMs) || this.delayMs < 2_000 || this.delayMs > 5_000) {
      throw new Error("Agent governance debounce must be an integer from 2000 to 5000 milliseconds.");
    }
    if (!Number.isSafeInteger(this.maximumPendingRoots) || this.maximumPendingRoots < 1 || this.maximumPendingRoots > 256) {
      throw new Error("Agent governance pending Source Root capacity must be from 1 to 256.");
    }
  }

  enqueue(sourceRootId: string, value: T): boolean {
    if (this.disposed) return false;
    const normalizedId = sourceRootId.trim();
    if (!normalizedId || normalizedId.length > 512) throw new Error("Agent governance Source Root identity is invalid.");
    if (!this.pending.has(normalizedId) && this.pending.size >= this.maximumPendingRoots) {
      this.options.onIssue?.({
        code: "AGENT_GOVERNANCE_QUEUE_CAPACITY_EXCEEDED",
        message: "Agent governance latest-value queue reached its bounded Source Root capacity; existing Graph consumers remain active.",
        sourceRootId: normalizedId,
      });
      return false;
    }
    this.revision += 1;
    const revision = this.revision;
    this.latestRevision.set(normalizedId, revision);
    this.pending.set(normalizedId, { sourceRootId: normalizedId, value, revision });
    if (this.active?.sourceRootId === normalizedId) this.active.controller.abort();
    this.schedule();
    return true;
  }

  async drainNow(): Promise<void> {
    if (this.disposed) return;
    if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.drain().finally(() => {
      this.drainPromise = undefined;
      if (!this.disposed && this.pending.size > 0) this.schedule();
    });
    return this.drainPromise;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
    this.timer = undefined;
    this.active?.controller.abort();
    this.active = undefined;
    this.pending.clear();
    this.latestRevision.clear();
  }

  metrics(): { pendingRoots: number; active: boolean; trackedRevisions: number } {
    return { pendingRoots: this.pending.size, active: this.active !== undefined, trackedRevisions: this.latestRevision.size };
  }

  private schedule(): void {
    if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
    this.timer = globalThis.setTimeout(() => {
      this.timer = undefined;
      void this.drainNow();
    }, this.delayMs);
  }

  private async drain(): Promise<void> {
    const batch = [...this.pending.values()];
    this.pending.clear();
    for (const item of batch) {
      if (this.disposed) return;
      if (this.latestRevision.get(item.sourceRootId) !== item.revision) continue;
      const controller = new AbortController();
      this.active = { sourceRootId: item.sourceRootId, controller };
      try {
        await this.options.process(item.value, controller.signal);
      } catch {
        if (!controller.signal.aborted) {
          this.options.onIssue?.({
            code: "AGENT_GOVERNANCE_PROCESSING_FAILED",
            message: "Agent governance processing failed inside its isolated queue; existing Graph consumers remain active.",
            sourceRootId: item.sourceRootId,
          });
        }
      } finally {
        if (this.active?.controller === controller) this.active = undefined;
        if (!this.pending.has(item.sourceRootId) && this.latestRevision.get(item.sourceRootId) === item.revision) {
          this.latestRevision.delete(item.sourceRootId);
        }
      }
    }
  }
}
