import {
  parseExplicitObjectSyntax,
  type ExplicitObjectParseResult,
} from "./explicit-object-parser.ts";
import { checksum } from "@task-copilot/shared";

export interface DebounceClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ExplicitObjectBlockChange {
  externalId: string;
  content: string;
  inputVersion: string;
  parsed: ExplicitObjectParseResult;
}

export interface ExplicitObjectChangeDebouncerOptions {
  delayMs: number;
  deliver(batch: ExplicitObjectBlockChange[]): Promise<void> | void;
  onError(error: unknown, batch: ExplicitObjectBlockChange[]): void;
  clock?: DebounceClock;
}

const systemClock: DebounceClock = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

function changedBlock(value: unknown): { uuid: string; content: string; inputVersion: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as { uuid?: unknown; content?: unknown; updatedAt?: unknown; "updated-at"?: unknown };
  if (typeof candidate.uuid !== "string" || !candidate.uuid.trim() || typeof candidate.content !== "string") return undefined;
  const observedVersion = candidate.updatedAt ?? candidate["updated-at"];
  const inputVersion = typeof observedVersion === "number" || typeof observedVersion === "string"
    ? String(observedVersion)
    : `content-${checksum(candidate.content)}`;
  return { uuid: candidate.uuid, content: candidate.content, inputVersion };
}

export class ExplicitObjectChangeDebouncer {
  private readonly pending = new Map<string, { content: string; inputVersion: string }>();
  private readonly clock: DebounceClock;
  private timer: unknown | undefined;
  private disposed = false;

  constructor(private readonly options: ExplicitObjectChangeDebouncerOptions) {
    if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error("Explicit object debounce delay must be non-negative.");
    this.clock = options.clock ?? systemClock;
  }

  enqueue(blocks: readonly unknown[]): void {
    if (this.disposed) return;
    let accepted = false;
    for (const value of blocks) {
      const block = changedBlock(value);
      if (!block) continue;
      accepted = true;
      this.pending.set(block.uuid, { content: block.content, inputVersion: block.inputVersion });
    }
    if (!accepted) return;
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.options.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer !== undefined) {
      this.clock.clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.disposed || this.pending.size === 0) return;
    const batch = [...this.pending].map(([externalId, value]) => ({
      externalId,
      content: value.content,
      inputVersion: value.inputVersion,
      parsed: parseExplicitObjectSyntax(value.content),
    }));
    this.pending.clear();
    try {
      await this.options.deliver(batch);
    } catch (error) {
      this.options.onError(error, batch);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }
}
