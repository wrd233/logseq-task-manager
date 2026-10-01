import type { LayoutItem, SourceRow } from "./model.mjs";

/** SDK data is normalized at this boundary, not in the presentation renderer. */
function flatten(value: unknown, depth = 0, parent: string | null = null, out: SourceRow[] = []): SourceRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const block = value as Record<string, unknown>;
  if (typeof block.uuid !== "string") return out;
  out.push({ uuid: block.uuid, depth, sourceParent: parent, content: typeof block.content === "string" ? block.content : typeof block.title === "string" ? block.title : "" });
  if (Array.isArray(block.children)) for (const child of block.children) flatten(child, depth + 1, block.uuid, out);
  return out;
}

export async function readSource(root: string, items: LayoutItem[], valid: () => boolean): Promise<{ rows: SourceRow[]; available: boolean } | null> {
  const block = await logseq.Editor.getBlock(root, { includeChildren: true });
  if (!valid()) return null;
  const rows = flatten(block), known = new Set(rows.map(row => row.uuid));
  const retained = items.filter(item => !known.has(item.uuid));
  // Four SDK reads at most; preserve layout order and stop starting reads after invalidation.
  const extra = new Array<SourceRow>(retained.length);
  let cursor = 0, failed = false;
  const reads = await Promise.allSettled(Array.from({ length: Math.min(4, retained.length) }, async () => {
    while (cursor < retained.length && valid() && !failed) {
      const index = cursor++, item = retained[index]!;
      let value;
      try { value = await logseq.Editor.getBlock(item.uuid); }
      catch (error) { failed = true; throw error; }
      if (!valid()) return;
      const normalized = flatten(value)[0];
      extra[index] = { uuid: item.uuid, content: normalized?.content ?? "来源暂不可用 · 保留此位置", depth: 0, outside: !!normalized, missing: !normalized };
    }
  }));
  const failure = reads.find((read): read is PromiseRejectedResult => read.status === "rejected");
  if (failure) throw failure.reason;
  return valid() ? { rows: rows.concat(extra), available: !!flatten(block).length } : null;
}

export interface EditingDraft { uuid: string; content: string }
export async function readDraft(rows: SourceRow[], valid: () => boolean): Promise<EditingDraft | null | undefined> {
  const editing = await logseq.Editor.checkEditing();
  if (!valid()) return undefined;
  if (typeof editing !== "string" || !rows.some(row => row.uuid === editing)) return null;
  const text = await logseq.Editor.getEditingBlockContent();
  if (!valid()) return undefined;
  const after = await logseq.Editor.checkEditing();
  if (!valid()) return undefined;
  return after === editing && typeof text === "string" ? { uuid: editing, content: text } : null;
}

/** Only explicit content-only datoms can bypass a tree read; unknown/topology events cannot. */
export function contentChanges(event: unknown): Map<string, string> | null {
  if (!event || typeof event !== "object") return null;
  const value = event as { txData?: unknown; blocks?: unknown };
  if (!Array.isArray(value.txData) || !value.txData.length || !Array.isArray(value.blocks) || !value.blocks.length) return null;
  let content = false;
  for (const datom of value.txData) {
    if (!Array.isArray(datom) || datom.length < 5 || !["block/content", "block/updated-at"].includes(datom[1])) return null;
    if (datom[1] === "block/content") content = true;
  }
  if (!content) return null;
  const changes = new Map<string, string>();
  for (const block of value.blocks) {
    if (!block || typeof block !== "object" || typeof block.uuid !== "string" || typeof block.content !== "string") return null;
    changes.set(block.uuid, block.content);
  }
  return changes;
}

interface ReadRequest { full: boolean; patches: Map<string, string> }
interface Waiter { resolve(): void; reject(error: unknown): void }
/** One queue per active Graph/root. A stopped queue settles waiters and cannot occupy a new scope. */
export class SourceRefresh {
  private stopped = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private full = false;
  private readonly patches = new Map<string, string>();
  private waiting: Waiter[] = [];
  private active: Waiter[] = [];
  constructor(private readonly read: (request: ReadRequest) => Promise<void>) {}

  request(full: boolean, patches = new Map<string, string>(), immediate = false): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.full ||= full;
    for (const [id, content] of patches) this.patches.set(id, content);
    const promise = new Promise<void>((resolve, reject) => { this.waiting.push({ resolve, reject }); });
    if (immediate && this.timer) { clearTimeout(this.timer); this.timer = null; }
    // Fixed 40ms bound: repeated events do not keep extending a quiet window.
    if (!this.running && !this.timer) {
      if (immediate) void this.pump();
      else this.timer = setTimeout(() => { this.timer = null; void this.pump(); }, 40);
    }
    return promise;
  }
  private async pump(): Promise<void> {
    if (this.stopped || this.running || !this.waiting.length) return;
    this.running = true;
    const batch = this.waiting; this.waiting = []; this.active = batch;
    const request = { full: this.full, patches: new Map(this.patches) };
    this.full = false; this.patches.clear();
    try { await this.read(request); for (const waiter of batch) waiter.resolve(); }
    catch (error) { for (const waiter of batch) waiter.reject(error); }
    finally {
      this.active = []; this.running = false;
      if (!this.stopped && this.waiting.length) void this.pump();
    }
  }
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    for (const waiter of [...this.waiting, ...this.active]) waiter.resolve();
    this.waiting = []; this.active = []; this.patches.clear();
  }
}
