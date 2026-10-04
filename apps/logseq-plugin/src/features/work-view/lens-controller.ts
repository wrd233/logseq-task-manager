import { LensInputError, lensRecord, lensText } from "./lens-input.ts";
import { decodeFocusPlan, validateFocusPlan, type FocusPlan, type FocusRequest } from "./lens-plan.ts";
import { captureLensSource, sameLensScope, validateLensSource, type LensBlock, type LensScope, type LensSourcePort, type LensSourceSnapshot } from "./lens-source.ts";
import { LensState } from "./lens-state.ts";
import type { SourceRow } from "./model.mjs";
import type { ReadingBookmark, WorkViewRenderer } from "./renderer.ts";
import type { PanelCloseReason } from "../../workspace/context.ts";

export type LensResult<T = null> = { ok: true; value: T } | { ok: false; reason: string };
export interface LensHost {
  scope(): LensScope | null;
  visible(): boolean;
  committed(): { rows: readonly SourceRow[]; revision: number; availability: LensBlock["availability"] };
  refresh(): Promise<void>;
  editing(): boolean | Promise<boolean>;
  selected(): string;
  nativeBlock(): Promise<string | undefined>;
  renderer: WorkViewRenderer;
  changed(): void;
}
const failure = (error: unknown): { ok: false; reason: string } => ({ ok: false, reason: error instanceof LensInputError ? error.reason : "source-read-failed" });

/** IO/late-result bridge. An installed source port is trusted code, never an API parameter. */
export class WorkViewLenses {
  private readonly state = new LensState();
  private lifetime = 0;
  private before: ReadingBookmark | null = null;
  private suspendedAt: ReadingBookmark | null = null;
  private sourceCache: { revision: number; lifetime: number; value: Promise<LensSourceSnapshot> } | null = null;
  readonly api = {
    read: () => this.read(),
    source: () => this.source(),
    request: (input: unknown) => this.request(input),
    apply: (input: unknown) => this.apply(input),
    select: (uuid?: unknown) => this.select(uuid),
    cancel: () => this.cancel(),
    exit: () => this.exit(),
    back: () => this.back(),
  };
  constructor(private readonly host: LensHost, private readonly provider?: LensSourcePort) {}
  read() { return this.state.snapshot(this.host.scope()); }
  get selection() { return this.state.active; }
  private current(scope: LensScope, lifetime: number): boolean {
    const now = this.host.scope();
    return lifetime === this.lifetime && this.host.visible() && !!now && sameLensScope(scope, now);
  }
  request(input: unknown): LensResult<FocusRequest> {
    try {
      const raw = lensRecord(input, ["schemaVersion", "question"], "invalid-request");
      if (raw.schemaVersion !== 1) return { ok: false, reason: "unsupported-plan-schema" };
      const question = lensText(raw.question, 240).trim(), scope = this.host.scope();
      if (!scope || !this.host.visible()) return { ok: false, reason: "view-not-visible" };
      const value = this.state.begin(question, scope); this.host.changed();
      return { ok: true, value };
    } catch (error) { return failure(error); }
  }
  private async captured(refresh: boolean): Promise<LensResult<LensSourceSnapshot>> {
    const scope = this.host.scope(), lifetime = this.lifetime;
    if (!scope || !this.host.visible()) return { ok: false, reason: "view-not-visible" };
    try {
      if (refresh) await this.host.refresh();
      if (!this.current(scope, lifetime)) return { ok: false, reason: "scope-mismatch" };
      const committed = this.host.committed(), revision = committed.revision;
      let value: LensSourceSnapshot;
      if (this.provider) value = await validateLensSource(await this.provider.read({ ...scope }), scope);
      else {
        if (this.sourceCache?.revision !== revision || this.sourceCache.lifetime !== lifetime) {
          const rows = committed.rows.map(row => ({ ...row }));
          this.sourceCache = { revision, lifetime, value: captureLensSource(scope, rows, committed.availability).then(snapshot => validateLensSource(snapshot, scope)) };
        }
        value = await this.sourceCache.value;
      }
      if (!this.current(scope, lifetime)) return { ok: false, reason: "scope-mismatch" };
      if (this.host.committed().revision !== revision) return { ok: false, reason: "source-changed-during-read" };
      return { ok: true, value };
    } catch (error) { return failure(error); }
  }
  async source(): Promise<LensResult<LensSourceSnapshot>> {
    const result = await this.captured(true);
    return result.ok ? { ok: true, value: structuredClone(result.value) } : result;
  }
  /** Trusted sibling renderer consumes the same installed provider without scheduling a second refresh. */
  async committedSource(): Promise<LensResult<LensSourceSnapshot>> {
    const result = await this.captured(false);
    return result.ok ? {ok:true,value:structuredClone(result.value)} : result;
  }
  async sourceChanged(): Promise<void> {
    const active = this.state.active;
    if (!active) return;
    const result = await this.captured(false);
    if (this.state.active !== active) return;
    if (result.ok && this.state.changed(result.value)) this.host.changed();
    else if (!result.ok && result.reason !== "scope-mismatch" && this.state.active && !this.state.active.changed) {
      this.state.active.changed = true; this.host.changed();
    }
  }
  async apply(input: unknown, previous = false): Promise<LensResult> {
    let plan: FocusPlan;
    try { plan = decodeFocusPlan(input); } catch (error) {
      const result = failure(error);
      let id: unknown;
      try { id = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "requestId")?.value : undefined; } catch { /* A revoked proxy is not a request. */ }
      if (typeof id === "string" && this.state.current(id)) { this.state.notice = result.reason; this.host.changed(); }
      return result;
    }
    const pending = this.state.pending;
    if (!pending || !this.state.current(plan.requestId)) return { ok: false, reason: "superseded-request" };
    let editing: boolean;
    try { editing = await this.host.editing(); } catch (error) {
      if (!this.state.current(plan.requestId)) return { ok: false, reason: "superseded-request" };
      const result = failure(error); this.state.reject(plan.requestId, result.reason); this.host.changed(); return result;
    }
    if (!this.state.current(plan.requestId)) return { ok: false, reason: "superseded-request" };
    if (editing || this.host.renderer.composing) {
      this.state.reject(plan.requestId, "editing-in-progress"); this.host.changed();
      return { ok: false, reason: "editing-in-progress" };
    }
    const result = await this.captured(true);
    if (!this.state.current(plan.requestId)) return { ok: false, reason: "superseded-request" };
    if (!result.ok) { this.state.reject(plan.requestId, result.reason); this.host.changed(); return result; }
    try {
      const revision = this.host.committed().revision, editing = await this.host.editing();
      if (!this.state.current(plan.requestId)) return { ok: false, reason: "superseded-request" };
      if (editing || this.host.renderer.composing) throw new LensInputError("editing-in-progress");
      if (revision !== this.host.committed().revision) throw new LensInputError("source-changed-during-read");
      const focus = validateFocusPlan(plan, result.value, pending);
      const bookmark = this.host.renderer.bookmark();
      if (!this.state.active) this.before = bookmark;
      const previousBookmark = previous ? this.state.history.at(-1)?.bookmark as ReadingBookmark | undefined : undefined;
      this.state.accept(focus, bookmark, previous); this.host.changed();
      this.host.renderer.restore(previousBookmark ?? bookmark, [...focus.selected]);
      return { ok: true, value: null };
    } catch (error) {
      const result = failure(error); this.state.reject(plan.requestId, result.reason); this.host.changed(); return result;
    }
  }
  /** Explicit subtree selection, not a semantic planner. No UUID/JSON input is shown in the UI. */
  async select(input?: unknown): Promise<LensResult> {
    const scope = this.host.scope(), lifetime = this.lifetime;
    if (!scope || !this.host.visible()) return { ok: false, reason: "view-not-visible" };
    try {
      const uuid = input === undefined ? this.host.selected() || await this.host.nativeBlock() : lensText(input, 256);
      if (!this.current(scope, lifetime)) return { ok: false, reason: "scope-mismatch" };
      if (!uuid) throw new LensInputError("selection-required");
      const source = await this.captured(true); if (!source.ok) return source;
      if (!this.current(scope, lifetime)) return { ok: false, reason: "scope-mismatch" };
      const blocks = source.value.blocks, byUuid = new Map(blocks.map(block => [block.target.blockUuid, block]));
      if (byUuid.get(uuid)?.availability !== "available") throw new LensInputError("source-not-in-scope");
      const selected = new Set([uuid]), needed = new Set<string>();
      for (const block of blocks) if (block.parentUuid && selected.has(block.parentUuid)) selected.add(block.target.blockUuid);
      for (const id of selected) {
        let block = byUuid.get(id);
        while (block) { needed.add(block.target.blockUuid); block = block.parentUuid ? byUuid.get(block.parentUuid) : undefined; }
      }
      const request = this.request({ schemaVersion: 1, question: "选定范围" }); if (!request.ok) return request;
      const plan: FocusPlan = {
        ...request.value, structureVersion: source.value.structureVersion,
        sourceVersions: blocks.filter(block => needed.has(block.target.blockUuid)).map(block => ({ sourceId: block.sourceId, contentVersion: block.contentVersion! })),
        visibleRanges: blocks.filter(block => selected.has(block.target.blockUuid)).map(block => ({ unit: "block", sourceId: block.sourceId, contentVersion: block.contentVersion! })),
      };
      return await this.apply(plan);
    } catch (error) {
      const result = failure(error); this.state.notice = result.reason; this.host.changed(); return result;
    }
  }
  cancel(): LensResult {
    if (this.state.pending || this.state.notice) { this.state.cancel(); this.host.changed(); }
    return { ok: true, value: null };
  }
  exit(): LensResult {
    const changed = !!this.state.active || !!this.state.pending || !!this.state.notice;
    const before = this.before;
    this.lifetime++; this.state.clear(); this.before = null; this.suspendedAt = null; this.sourceCache = null;
    if (changed) { this.host.changed(); if (before) this.host.renderer.restore(before); }
    return { ok: true, value: null };
  }
  async back(): Promise<LensResult> {
    const last = this.state.history.at(-1);
    if (!last) return { ok: false, reason: "no-previous-question" };
    const request = this.request({ schemaVersion: 1, question: last.selection.focus.plan.question }); if (!request.ok) return request;
    const result = await this.apply({ ...last.selection.focus.plan, ...request.value }, true);
    if (!result.ok && this.state.current(request.value.requestId)) {
      this.state.cancel(); this.state.notice = result.reason; this.host.changed();
    }
    return result;
  }
  noteFold(uuid: string): boolean { return this.state.fold(uuid); }
  hide(reason: PanelCloseReason): void {
    if (reason === "close") { this.exit(); return; }
    this.suspendedAt = this.host.renderer.bookmark(); this.lifetime++; this.sourceCache = null;
    this.state.cancel(); this.state.suspended = true;
  }
  async resume(): Promise<void> {
    const scope = this.host.scope(), lifetime = this.lifetime, suspended = this.state.suspended;
    this.state.suspended = false;
    await this.sourceChanged();
    if (!scope || !this.current(scope, lifetime)) return;
    if (suspended) this.host.changed(); // A switch canceled waiting even when the source did not change.
    if (this.suspendedAt) this.host.renderer.restore(this.suspendedAt);
    this.suspendedAt = null;
  }
  reset(): void {
    this.lifetime++; this.state.clear(); this.before = null; this.suspendedAt = null; this.sourceCache = null;
  }
}
