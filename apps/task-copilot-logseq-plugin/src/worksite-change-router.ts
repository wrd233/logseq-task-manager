import { graphEntityReference } from "./graph-read-bridge.ts";
import type { WorksitePreviewState } from "./worksite-preview-controller.ts";

export interface WorksiteChangeRouterHost {
  getBlock(target: unknown): Promise<unknown>;
}

export interface WorksiteChangeRouterOptions {
  maximumChangedBlocksPerBatch?: number;
  maximumParentDepth?: number;
  debounceMs?: number;
  parentWalkConcurrency?: number;
  now?: () => Date;
  onAffected?(objectIds: readonly string[]): void;
}

export interface WorksiteChangeRouterMetrics {
  changeEventsReceived: number;
  changedBlocksSeen: number;
  changedBlocksIgnored: number;
  batchesTruncated: number;
  parentChainReads: number;
  maxParentDepthUsed: number;
  affectedObjects: number;
  debouncedInvalidations: number;
  pendingInvalidations: number;
}

const DEFAULT_OPTIONS = {
  maximumChangedBlocksPerBatch: 64,
  maximumParentDepth: 8,
  debounceMs: 350,
  parentWalkConcurrency: 2,
};

function requireBounded(value: number | undefined, label: string, maximum: number): number {
  const resolved = value ?? 0;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error(`${label} must be a bounded integer from 1 to ${maximum}.`);
  }
  return resolved;
}

function blockUuid(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const uuid = (value as { uuid?: unknown }).uuid;
  return typeof uuid === "string" && uuid.trim() ? uuid : undefined;
}

function blockParent(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parent = (value as { parent?: unknown }).parent;
  return parent === null || parent === undefined ? undefined : parent;
}

async function boundedConcurrency(items: readonly string[], limit: number, worker: (uuid: string) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (!item) continue;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Maps Logseq Graph change events to the Worksite Preview objects they affect.
 *
 * It reuses the single DB.onChanged stream already registered for Explicit Sync
 * and never writes to the Graph or SQLite: after a bounded parent-chain lookup
 * (or a reverse index from the last loaded preview), the owning object's cache
 * is invalidated through `onAffected` after a short per-object debounce.
 */
export class WorksiteChangeRouter {
  private readonly options: {
    maximumChangedBlocksPerBatch: number;
    maximumParentDepth: number;
    debounceMs: number;
    parentWalkConcurrency: number;
    now: () => Date;
    onAffected?: (objectIds: readonly string[]) => void;
  };
  private readonly anchorIndex = new Map<string, string>();
  private readonly reverseIndex = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  private readonly trackedObjectIds = new Set<string>();
  private clearedRevision = 0;
  private active = true;
  private readonly metricsState = {
    changeEventsReceived: 0,
    changedBlocksSeen: 0,
    changedBlocksIgnored: 0,
    batchesTruncated: 0,
    parentChainReads: 0,
    maxParentDepthUsed: 0,
    affectedObjects: 0,
    debouncedInvalidations: 0,
  };

  constructor(
    private readonly host: WorksiteChangeRouterHost,
    options: WorksiteChangeRouterOptions = {},
  ) {
    this.options = {
      maximumChangedBlocksPerBatch: requireBounded(options.maximumChangedBlocksPerBatch ?? DEFAULT_OPTIONS.maximumChangedBlocksPerBatch, "maximumChangedBlocksPerBatch", 1_024),
      maximumParentDepth: requireBounded(options.maximumParentDepth ?? DEFAULT_OPTIONS.maximumParentDepth, "maximumParentDepth", 32),
      debounceMs: requireBounded(options.debounceMs ?? DEFAULT_OPTIONS.debounceMs, "debounceMs", 60_000),
      parentWalkConcurrency: requireBounded(options.parentWalkConcurrency ?? DEFAULT_OPTIONS.parentWalkConcurrency, "parentWalkConcurrency", 8),
      now: options.now ?? (() => new Date()),
      ...(options.onAffected ? { onAffected: options.onAffected } : {}),
    };
  }

  setTrackedAnchors(items: ReadonlyArray<{ objectId: string; anchor?: string }>): void {
    const next = new Map<string, string>();
    const liveObjectIds = new Set<string>();
    for (const item of items) {
      if (!item.anchor) continue;
      liveObjectIds.add(item.objectId);
      next.set(item.anchor, item.objectId);
    }
    this.trackedObjectIds.clear();
    for (const objectId of liveObjectIds) this.trackedObjectIds.add(objectId);
    this.anchorIndex.clear();
    for (const [anchor, objectId] of next) this.anchorIndex.set(anchor, objectId);
    for (const [uuid, objectId] of [...this.reverseIndex]) {
      if (!liveObjectIds.has(objectId)) this.reverseIndex.delete(uuid);
    }
    for (const [objectId, timer] of [...this.timers]) {
      if (!liveObjectIds.has(objectId)) {
        globalThis.clearTimeout(timer);
        this.timers.delete(objectId);
      }
    }
  }

  observeLoaded(objectId: string, anchor: string | undefined, state: WorksitePreviewState): void {
    if (!anchor) return;
    for (const [uuid, owner] of [...this.reverseIndex]) {
      if (owner === objectId) this.reverseIndex.delete(uuid);
    }
    if (state.status === "loaded") {
      for (const block of state.blocks) this.reverseIndex.set(block.externalId, objectId);
    }
  }

  handleChangedBlocks(blocks: readonly unknown[]): void {
    if (!this.active) return;
    this.metricsState.changeEventsReceived += 1;
    const revision = this.clearedRevision;
    const uuids: string[] = [];
    const seen = new Set<string>();
    for (const value of blocks) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const uuid = (value as { uuid?: unknown }).uuid;
      if (typeof uuid !== "string" || !uuid.trim() || seen.has(uuid)) continue;
      if (uuids.length >= this.options.maximumChangedBlocksPerBatch) {
        this.metricsState.batchesTruncated += 1;
        break;
      }
      seen.add(uuid);
      uuids.push(uuid);
    }
    if (uuids.length === 0) return;
    this.metricsState.changedBlocksSeen += uuids.length;
    void this.resolveAndSchedule(uuids, revision);
  }

  clear(): void {
    this.clearedRevision += 1;
    for (const timer of this.timers.values()) globalThis.clearTimeout(timer);
    this.timers.clear();
    this.anchorIndex.clear();
    this.reverseIndex.clear();
    this.trackedObjectIds.clear();
  }

  dispose(): void {
    this.active = false;
    this.clear();
  }

  metrics(): WorksiteChangeRouterMetrics {
    return {
      ...this.metricsState,
      pendingInvalidations: this.timers.size,
    };
  }

  private async resolveAndSchedule(uuids: readonly string[], revision: number): Promise<void> {
    const affected = new Set<string>();
    await boundedConcurrency(uuids, this.options.parentWalkConcurrency, async (uuid) => {
      const objectId = await this.resolveObjectId(uuid);
      if (objectId === undefined) this.metricsState.changedBlocksIgnored += 1;
      else affected.add(objectId);
    });
    if (this.clearedRevision !== revision || !this.active) return;
    if (affected.size === 0) return;
    this.metricsState.affectedObjects += affected.size;
    for (const objectId of affected) this.schedule(objectId);
  }

  private async resolveObjectId(uuid: string): Promise<string | undefined> {
    const direct = this.anchorIndex.get(uuid);
    if (direct !== undefined) return direct;
    const known = this.reverseIndex.get(uuid);
    if (known !== undefined) return known;
    let currentTarget: unknown = uuid;
    for (let depth = 0; depth < this.options.maximumParentDepth; depth += 1) {
      this.metricsState.parentChainReads += 1;
      let block: unknown;
      try {
        block = await this.host.getBlock(currentTarget);
      } catch {
        return undefined;
      }
      const currentUuid = blockUuid(block);
      if (!currentUuid) return undefined;
      const owner = this.anchorIndex.get(currentUuid) ?? this.reverseIndex.get(currentUuid);
      if (owner !== undefined) {
        this.metricsState.maxParentDepthUsed = Math.max(this.metricsState.maxParentDepthUsed, depth);
        return owner;
      }
      const parent = blockParent(block);
      if (parent === undefined) return undefined;
      const parentTarget = graphEntityReference(parent);
      currentTarget = parentTarget;
    }
    this.metricsState.maxParentDepthUsed = Math.max(this.metricsState.maxParentDepthUsed, this.options.maximumParentDepth);
    return undefined;
  }

  private schedule(objectId: string): void {
    if (!this.active || !this.trackedObjectIds.has(objectId)) return;
    const existing = this.timers.get(objectId);
    if (existing !== undefined) globalThis.clearTimeout(existing);
    const timer = globalThis.setTimeout(() => {
      this.timers.delete(objectId);
      this.metricsState.debouncedInvalidations += 1;
      this.options.onAffected?.([objectId]);
    }, this.options.debounceMs);
    this.timers.set(objectId, timer);
  }
}
