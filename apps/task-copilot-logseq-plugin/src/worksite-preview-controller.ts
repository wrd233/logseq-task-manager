import type { ServiceGraphBlockExcerpt, ServiceGraphReadRequest } from "@task-copilot/service-client";
import { stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";

import { executeGraphReadRequest, type GraphReadBridgeHost } from "./graph-read-bridge.ts";

export interface WorksitePreviewBlock {
  externalId: string;
  content: string;
  depth: number;
  marker?: string;
}

export type WorksitePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded-empty"; sourceVersion?: string }
  | {
      status: "loaded";
      sourceVersion?: string;
      blocks: WorksitePreviewBlock[];
      totalVisibleCount: number;
      truncated: boolean;
      remainingCount: number;
      readAt: string;
    }
  | { status: "unavailable"; reason: string }
  | { status: "stale"; previousVersion?: string; currentVersion?: string }
  | { status: "error"; diagnosticId?: string; safeMessage: string };

export interface WorksitePreviewControllerOptions {
  maximumConcurrency?: number;
  shortBlockLimit?: number;
  shortDepthLimit?: number;
  shortCharacterLimit?: number;
  fullBlockLimit?: number;
  fullDepthLimit?: number;
  fullByteLimit?: number;
  requestIdPrefix?: string;
  now?: () => Date;
  onStateChange?(objectId: string, mode: WorksitePreviewMode): void;
}

export type WorksitePreviewMode = "short" | "full";

interface ProjectionLimits {
  blockLimit: number;
  depthLimit: number;
  characterLimit: number;
  byteBased: boolean;
}

interface CacheEntry {
  key: string;
  objectId: string;
  short?: WorksitePreviewState;
  full?: WorksitePreviewState;
}

const DEFAULT_OPTIONS = {
  maximumConcurrency: 2,
  shortBlockLimit: 3,
  shortDepthLimit: 2,
  shortCharacterLimit: 280,
  fullBlockLimit: 12,
  fullDepthLimit: 2,
  fullByteLimit: 4_096,
  requestIdPrefix: "worksite",
};

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function markerOf(content: string): { marker?: string; text: string } {
  const match = /^(TODO|DOING|WAITING|DONE|NOW|LATER)\s+(.+)$/iu.exec(content.trim());
  return match && match[2] ? { marker: match[1]!.toUpperCase(), text: match[2]!.trim() } : { text: content.trim() };
}

export function projectWorksiteBlocks(
  excerpts: readonly ServiceGraphBlockExcerpt[],
  limits: ProjectionLimits,
): { blocks: WorksitePreviewBlock[]; totalVisibleCount: number; remainingCount: number; truncated: boolean } {
  const available: Array<ServiceGraphBlockExcerpt & { depth: number }> = [];
  let remainingCount = 0;
  for (const excerpt of excerpts) {
    if (excerpt.depth < 1) continue;
    const text = stripLogseqBlockIdentityProperty(excerpt.content, excerpt.uuid);
    if (!text.trim()) continue;
    if (excerpt.depth > limits.depthLimit) {
      remainingCount += 1;
      continue;
    }
    available.push({ ...excerpt, depth: excerpt.depth });
  }
  const blocks: WorksitePreviewBlock[] = [];
  let characters = 0;
  let truncated = false;
  let innerTruncated = false;
  for (const excerpt of available) {
    if (blocks.length >= limits.blockLimit) {
      remainingCount += 1;
      truncated = true;
      continue;
    }
    const { marker, text } = markerOf(stripLogseqBlockIdentityProperty(excerpt.content, excerpt.uuid));
    const budget = limits.byteBased ? limits.characterLimit - utf8Bytes(text) : limits.characterLimit - text.length;
    if (budget < 0 && blocks.length > 0) {
      remainingCount += 1;
      truncated = true;
      continue;
    }
    let display = text;
    const room = limits.byteBased ? limits.characterLimit - characters - utf8Bytes(text) : limits.characterLimit - characters - text.length;
    if (room < 0) {
      const allowed = limits.characterLimit - characters;
      const kept = limits.byteBased
        ? [...text].reduce((acc, char) => (utf8Bytes(acc + char) <= allowed ? acc + char : acc), "")
        : [...text].slice(0, allowed).join("");
      display = `${kept}…`;
      innerTruncated = true;
      truncated = true;
    }
    blocks.push({
      externalId: excerpt.uuid,
      content: display,
      depth: excerpt.depth,
      ...(marker ? { marker } : {}),
    });
    characters += limits.byteBased ? utf8Bytes(display) : display.length;
  }
  return {
    blocks,
    totalVisibleCount: available.length,
    remainingCount,
    truncated: truncated || innerTruncated || remainingCount > 0,
  };
}

export class WorksitePreviewController {
  private readonly options: {
    maximumConcurrency: number;
    shortBlockLimit: number;
    shortDepthLimit: number;
    shortCharacterLimit: number;
    fullBlockLimit: number;
    fullDepthLimit: number;
    fullByteLimit: number;
    requestIdPrefix: string;
    now: () => Date;
    onStateChange?: (objectId: string, mode: WorksitePreviewMode) => void;
  };
  private readonly cache = new Map<string, CacheEntry>();
  private readonly expanded = new Set<string>();
  private readonly expandedFull = new Set<string>();
  private overflowOpen = false;
  private readonly inflight = new Map<string, Promise<WorksitePreviewState>>();
  private activeReads = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly host: GraphReadBridgeHost,
    options: WorksitePreviewControllerOptions = {},
  ) {
    this.options = {
      maximumConcurrency: options.maximumConcurrency ?? DEFAULT_OPTIONS.maximumConcurrency,
      shortBlockLimit: options.shortBlockLimit ?? DEFAULT_OPTIONS.shortBlockLimit,
      shortDepthLimit: options.shortDepthLimit ?? DEFAULT_OPTIONS.shortDepthLimit,
      shortCharacterLimit: options.shortCharacterLimit ?? DEFAULT_OPTIONS.shortCharacterLimit,
      fullBlockLimit: options.fullBlockLimit ?? DEFAULT_OPTIONS.fullBlockLimit,
      fullDepthLimit: options.fullDepthLimit ?? DEFAULT_OPTIONS.fullDepthLimit,
      fullByteLimit: options.fullByteLimit ?? DEFAULT_OPTIONS.fullByteLimit,
      requestIdPrefix: options.requestIdPrefix ?? DEFAULT_OPTIONS.requestIdPrefix,
      now: options.now ?? (() => new Date()),
      ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
    };
  }

  isExpanded(objectId: string): boolean {
    return this.expanded.has(objectId);
  }

  setExpanded(objectId: string, expanded: boolean): void {
    if (expanded) this.expanded.add(objectId);
    else {
      this.expanded.delete(objectId);
      this.expandedFull.delete(objectId);
    }
  }

  setExpandedMode(objectId: string, mode: WorksitePreviewMode): void {
    if (mode === "full") {
      this.expanded.add(objectId);
      this.expandedFull.add(objectId);
    } else {
      this.expandedFull.delete(objectId);
    }
  }

  expandedMode(objectId: string): WorksitePreviewMode {
    return this.expandedFull.has(objectId) ? "full" : "short";
  }

  setOverflowOpen(open: boolean): void {
    this.overflowOpen = open;
  }

  isOverflowOpen(): boolean {
    return this.overflowOpen;
  }

  expandedObjectIds(): string[] {
    return [...this.expanded];
  }

  refreshFrom(items: ReadonlyArray<{ objectId: string; version: number; anchor?: string }>): void {
    const currentObjectIds = new Set(items.map((item) => item.objectId));
    for (const objectId of this.cache.keys()) {
      if (!currentObjectIds.has(objectId)) {
        this.cache.delete(objectId);
        this.expanded.delete(objectId);
        this.expandedFull.delete(objectId);
      }
    }
  }

  invalidate(objectId?: string): void {
    if (objectId === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(objectId);
  }

  state(objectId: string, anchor: string, version: number, mode: WorksitePreviewMode): WorksitePreviewState {
    const entry = this.cache.get(objectId);
    if (!entry || entry.key !== this.sourceKey(anchor, version)) return { status: "idle" };
    return entry[mode] ?? { status: "idle" };
  }

  prefetch(objectId: string, anchor: string, version: number): void {
    const entry = this.cache.get(objectId);
    if (entry && entry.key === this.sourceKey(anchor, version) && entry.short && entry.short.status !== "idle") return;
    void this.load(objectId, anchor, version, "short");
  }

  load(objectId: string, anchor: string, version: number, mode: WorksitePreviewMode): Promise<WorksitePreviewState> {
    const key = this.sourceKey(anchor, version);
    const existing = this.cache.get(objectId);
    if (existing && existing.key === key && existing[mode] && existing[mode]!.status !== "loading") {
      return Promise.resolve(existing[mode]!);
    }
    const inflightKey = `${objectId}:${key}:${mode}`;
    const pending = this.inflight.get(inflightKey);
    if (pending) return pending;
    const entry = existing && existing.key === key ? existing : { key, objectId };
    entry.key = key;
    entry[mode] = { status: "loading" };
    this.cache.set(objectId, entry);
    const promise = this.enqueue(() => this.read(objectId, anchor, version, key, mode));
    this.inflight.set(inflightKey, promise);
    void promise.then(
      () => this.inflight.delete(inflightKey),
      () => this.inflight.delete(inflightKey),
    );
    return promise;
  }

  private sourceKey(anchor: string, version: number): string {
    return `${anchor}@v${version}`;
  }

  private limitsFor(mode: WorksitePreviewMode): ProjectionLimits {
    return mode === "short"
      ? {
          blockLimit: this.options.shortBlockLimit,
          depthLimit: this.options.shortDepthLimit,
          characterLimit: this.options.shortCharacterLimit,
          byteBased: false,
        }
      : {
          blockLimit: this.options.fullBlockLimit,
          depthLimit: this.options.fullDepthLimit,
          characterLimit: this.options.fullByteLimit,
          byteBased: true,
        };
  }

  private async read(
    objectId: string,
    anchor: string,
    version: number,
    key: string,
    mode: WorksitePreviewMode,
  ): Promise<WorksitePreviewState> {
    const now = this.options.now();
    const requestId = `${this.options.requestIdPrefix}-${objectId}-${now.getTime()}`;
    const request: ServiceGraphReadRequest = {
      requestId,
      requestedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30_000).toISOString(),
      kind: "BLOCK",
      target: anchor,
      includeChildren: true,
      parents: 0,
    };
    const failure = (state: WorksitePreviewState): WorksitePreviewState => {
      const entry = this.cache.get(objectId);
      if (entry && entry.key === key) entry[mode] = state;
      this.options.onStateChange?.(objectId, mode);
      return state;
    };
    try {
      const result = await executeGraphReadRequest(request, this.host, now);
      if (result.status === "NOT_FOUND") return failure({ status: "unavailable", reason: "来源位置不可用" });
      if (result.status === "ERROR") {
        return failure({ status: "error", diagnosticId: requestId, safeMessage: "暂时无法读取工作记录" });
      }
      const projected = projectWorksiteBlocks(result.snapshot.blocks, this.limitsFor(mode));
      const state: WorksitePreviewState = projected.blocks.length === 0
        ? { status: "loaded-empty", sourceVersion: `v${version}` }
        : {
            status: "loaded",
            sourceVersion: `v${version}`,
            blocks: projected.blocks,
            totalVisibleCount: projected.totalVisibleCount,
            truncated: projected.truncated,
            remainingCount: projected.remainingCount,
            readAt: result.snapshot.readAt,
          };
      const entry = this.cache.get(objectId) ?? { key, objectId };
      entry.key = key;
      entry[mode] = state;
      this.cache.set(objectId, entry);
      this.options.onStateChange?.(objectId, mode);
      return state;
    } catch {
      return failure({ status: "error", diagnosticId: requestId, safeMessage: "暂时无法读取工作记录" });
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = (): void => {
        this.activeReads += 1;
        task().then(
          (value) => {
            this.activeReads -= 1;
            this.queue.shift()?.();
            resolve(value);
          },
          (error) => {
            this.activeReads -= 1;
            this.queue.shift()?.();
            reject(error);
          },
        );
      };
      if (this.activeReads < this.options.maximumConcurrency) run();
      else this.queue.push(run);
    });
  }
}
