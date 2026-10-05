import { NativeEditorHost } from "../../host/native-editor.ts";
import type { FeaturePanel } from "../../host/panel-host.ts";
import { sha256, type SourceScope, type SourceSnapshot } from "../../workspace/source-protocol.ts";
import { logseqSourceId, sameLensScope } from "./lens-source.ts";
import type { LensResult } from "./lens-controller.ts";
import type { ReadingBookmark, WorkViewRenderer } from "./renderer.ts";
import type { ViewPresentation } from "./operations.ts";
import type { ComposedView, LensSelection } from "./view-composer.ts";
import type { SourceRow } from "./model.mjs";
import { composeReport, defaultReportFolds, reportFragment, reportFragments } from "./report-model.ts";
import { reportFailure, resolveBodyTarget, type BodyPosition, type BodyTarget } from "./report-target.ts";

interface ReportHost {
  scope(): SourceScope | null; revision(): number; currentGraph(): Promise<string>;
  visible(): boolean; historical(): boolean; presentation(): ViewPresentation;
  source(fresh: boolean): Promise<LensResult<SourceSnapshot>>;
  navigationSource(): Promise<LensResult<SourceSnapshot>>;
  panel: FeaturePanel; renderer: WorkViewRenderer; changed(): void;
  open(root: string): Promise<void>; notify(text: string): void;
}
const deny = (reason: string): {ok:false;reason:string} => ({ok:false,reason});

/** Session presentation/navigation. No source writes, material store, formal state or additional provider. */
export class WorkViewReport {
  private mode: "report" | "structure";
  private source: SourceSnapshot | null = null;
  private sourceRevision = -1;
  private reading: Promise<LensResult<SourceSnapshot>> | null = null;
  private readTicket = 0;
  private refreshQueued = false;
  private lifetime = 0;
  private navigation = 0;
  private disposed = false;
  private yielding = false;
  private folds = defaultReportFolds();
  private boundScope: SourceScope | null = null;
  private suspended: ReadingBookmark | null = null;
  private readonly sessions = new Map<string, {mode:"report" | "structure"; folds:string[]; bookmark:ReadingBookmark}>();
  private native: {scope:SourceScope; bookmark:ReadingBookmark; mode:"beside" | "switch"} | null = null;
  private notice: string | null = null;
  private readonly editor = new NativeEditorHost(() => {
    void this.resume().then(result => { if (!result.ok) this.host.notify(result.reason === "editing-in-progress" ? "请先结束原生输入，再返回正文。" : `报告暂不能恢复：${result.reason}`); });
  },() => this.sourceChanged());
  readonly api = {
    read: () => this.read(), setMode: (mode: unknown) => this.setMode(mode),
    refresh: () => this.capture(true), resolve: (input: unknown) => this.resolve(input),
    openNative: (input: unknown) => this.openNative(input), resume: () => this.resume(),
    compare: (input: unknown) => this.compare(input), showNative: () => this.showNative(),
  };
  constructor(private readonly host: ReportHost, private readonly defaultMode: "report" | "structure" = "report") { this.mode=defaultMode; }
  private remember(): void {
    const scope=this.boundScope;
    if (!scope || this.host.historical()) return;
    const key=JSON.stringify([scope.graphId,scope.rootUuid]);
    this.sessions.delete(key);
    this.sessions.set(key,{mode:this.mode,folds:[...this.folds],bookmark:this.native?.bookmark??this.suspended??this.host.renderer.bookmark()});
    if (this.sessions.size>12) this.sessions.delete(this.sessions.keys().next().value!);
  }
  scopeChanged(): void {
    const scope=this.host.scope();
    if (!scope || (this.boundScope && sameLensScope(this.boundScope,scope))) return;
    this.boundScope={...scope};
    const saved=this.sessions.get(JSON.stringify([scope.graphId,scope.rootUuid]));
    this.mode=saved?.mode??this.defaultMode; this.folds=new Set(saved?.folds??[]); this.suspended=saved?.bookmark??null;
  }
  async restoreReading(): Promise<void> {
    const bookmark=this.suspended, scope=this.host.scope(), lifetime=this.lifetime;
    if (!bookmark || !scope || this.host.historical()) return;
    const focus=await this.editor.available();
    if (this.valid(scope,lifetime) && this.host.visible() && this.suspended===bookmark) {
      if (focus && this.native) { this.native=null; this.editor.hideReturn(); this.host.changed(); }
      this.host.renderer.restore(bookmark,[],focus); this.suspended=null;
    }
  }
  get active(): boolean { return this.mode === "report"; }
  get nativeActive(): boolean { return !!this.native; }
  get readingActive(): boolean { return !!this.reading; }
  get composing(): boolean { return this.editor.isComposing; }
  get rows(): SourceRow[] | null {
    return this.active && this.source ? this.source.blocks.map(block => ({uuid:block.target.blockUuid,content:block.content ?? "来源暂不可用",sourceParent:block.parentUuid,depth:block.depth})) : null;
  }
  read() {
    return {schemaVersion:1, scope:this.host.scope(), mode:this.mode,
      status:this.notice === "source-unavailable" ? "unavailable" : this.source ? !this.notice && this.sourceRevision === this.host.revision() ? "current" : "stale" : this.reading ? "loading" : "unavailable",
      structureVersion:this.source?.structureVersion ?? null, sourceSetVersion:this.source?.sourceSetVersion ?? null,
      fragments:this.source ? reportFragments(this.source) : [],
      native:this.native ? {scope:{...this.native.scope}, mode:this.host.visible() ? this.native.mode : "switch"} : null, notice:this.notice};
  }
  private valid(scope: SourceScope, lifetime: number): boolean {
    const current = this.host.scope();
    return !this.disposed && this.lifetime === lifetime && !!current && sameLensScope(current,scope);
  }
  async capture(fresh: boolean): Promise<LensResult<SourceSnapshot>> {
    const scope = this.host.scope(), lifetime = this.lifetime;
    if (!scope || this.disposed || !this.host.visible()) return deny("view-not-visible");
    if (this.editor.isComposing || this.host.renderer.composing) return deny("editing-in-progress");
    if (this.source && await this.editor.editing()) { this.refreshQueued=true; return deny("editing-in-progress"); }
    if (!this.valid(scope,lifetime)) return deny("scope-mismatch");
    if (!fresh && this.sourceRevision === this.host.revision() && this.source) return {ok:true,value:structuredClone(this.source)};
    if (!fresh && this.reading) return this.reading;
    const ticket = ++this.readTicket;
    const reading = (async (): Promise<LensResult<SourceSnapshot>> => {
      const result = await this.host.source(fresh);
      if (!this.valid(scope,lifetime)) return deny("scope-mismatch");
      if (ticket !== this.readTicket) return deny("superseded-source-read");
      if (this.editor.isComposing || this.host.renderer.composing) return deny("editing-in-progress");
      const revision=this.host.revision();
      if (this.source && await this.editor.editing()) { this.refreshQueued=true; return deny("editing-in-progress"); }
      if (!this.valid(scope,lifetime) || ticket !== this.readTicket) return deny("scope-mismatch");
      if (revision !== this.host.revision()) { this.refreshQueued=true; return deny("source-changed-during-read"); }
      if (!result.ok) { this.notice=result.reason; this.host.changed(); return result; }
      if (!sameLensScope(result.value.scope,scope)) return deny("scope-mismatch");
      if (result.value.blocks[0]?.availability !== "available") { this.notice="source-unavailable";this.host.changed();return deny("source-unavailable"); }
      this.source=structuredClone(result.value); this.sourceRevision=this.host.revision(); this.notice=null; this.host.changed();
      return {ok:true,value:structuredClone(this.source)};
    })();
    this.reading=reading;
    try { return await reading; } finally {
      if (this.reading === reading) {
        this.reading=null;
        if (this.refreshQueued) this.sourceChanged();
      }
    }
  }
  sourceChanged(): void {
    if (this.active && this.host.visible() && !this.editor.isComposing && !this.host.renderer.composing) {
      if (this.reading) this.refreshQueued=true;
      else {
        const scope=this.host.scope(), lifetime=this.lifetime;
        void this.editor.editing().then(editing => {
          if (!scope || !this.valid(scope,lifetime) || !this.host.visible()) return;
          if (editing || this.editor.isComposing) { this.refreshQueued=true; return; }
          this.refreshQueued=false; void this.capture(false);
        }).catch(() => { if (scope && this.valid(scope,lifetime)) { this.notice="source-unavailable";this.host.changed(); } });
      }
    }
  }
  async setMode(mode: unknown): Promise<LensResult> {
    if (mode !== "report" && mode !== "structure") return deny("invalid-reading-mode");
    if (this.disposed || !this.host.visible()) return deny("view-not-visible");
    if (this.editor.isComposing || this.host.renderer.composing || await this.editor.editing()) return deny("editing-in-progress");
    if (this.host.historical()) return deny("historical-view");
    const bookmark = this.host.renderer.bookmark();
    if (mode !== this.mode) {
      this.mode=mode; this.host.changed();
    }
    if (mode === "report") {
      const source = await this.capture(true); if (!source.ok) return source;
    }
    this.host.renderer.restore(bookmark); return {ok:true,value:null};
  }
  compose(personal: ViewPresentation, lens: LensSelection | null, overlay?: ComposedView) {
    return this.active && this.source ? composeReport(this.source,personal,lens,this.folds,overlay) : null;
  }
  toggleFold(uuid: string): void {
    if (this.folds.has(uuid)) this.folds.delete(uuid); else this.folds.add(uuid);
    this.host.changed();
  }
  /** A temporary view of the exact captured raw block; comparison never routes or writes. */
  compare(input: unknown): LensResult<{target:BodyTarget; content:string; status:string}> {
    if (this.host.historical()) return deny("historical-view");
    if (!this.host.visible() || !this.source || this.disposed) return deny("view-not-visible");
    try {
      const target=resolveBodyTarget(input,this.source);
      if (target.position.kind !== "block") return deny("native-navigation-requires-block");
      return {ok:true,value:{target,content:this.source.blocks.find(block=>block.sourceId===target.sourceId)!.content!,status:this.read().status}};
    } catch (error) { return reportFailure(error); }
  }
  /** Layout only: let native writing continue, including an already active draft. */
  async showNative(): Promise<LensResult> {
    const scope=this.host.scope(), lifetime=this.lifetime;
    if (!scope || !this.host.visible() || this.disposed) return deny("view-not-visible");
    if (this.host.historical()) return deny("historical-view");
    const editing=await this.editor.editing();
    if (!this.valid(scope,lifetime)) return deny("scope-mismatch");
    if (!this.host.visible()) return deny("view-not-visible");
    if (this.host.historical()) return deny("historical-view");
    // A work-menu action can leave focus in the iframe even with pointer guards.
    // Reuse only the existing input; this view action never routes or resets it.
    const focus=() => { if (typeof editing === "string") this.editor.focusExisting(editing,() => this.valid(scope,lifetime) && !this.host.historical()); };
    focus();
    const bookmark=this.native?.bookmark??this.host.renderer.bookmark();
    this.yielding=true;
    try {
      const mode=await this.editor.expose(this.host.panel);
      if (!this.valid(scope,lifetime)) return deny("scope-mismatch");
      focus();
      this.native={scope:{...scope},bookmark,mode}; this.host.changed(); return {ok:true,value:null};
    } finally { this.yielding=false; }
  }
  async resolve(input: unknown): Promise<LensResult<BodyTarget>> {
    if (this.host.historical()) return deny("historical-view");
    try {
      const source = await this.capture(true);
      if (!this.host.visible()) return deny("view-not-visible");
      if (this.host.historical()) return deny("historical-view");
      return source.ok ? {ok:true,value:resolveBodyTarget(input,source.value)} : source;
    } catch (error) { return reportFailure(error); }
  }
  /** Called by a real source row, not a display section or screen coordinate. */
  async forBlock(uuid: string, position: BodyPosition = "block"): Promise<LensResult<BodyTarget>> {
    const scope=this.host.scope(); if (!scope) return deny("scope-mismatch");
    let source=this.source;
    if (!source || !this.active) { const result=await this.capture(true); if (!result.ok) return result; source=result.value; }
    const fragment=reportFragment(source,logseqSourceId(scope.graphId,uuid));
    if (!fragment) return deny("source-not-in-scope");
    return this.resolve({schemaVersion:1,scope:fragment.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,
      structureVersion:source.structureVersion,position:{kind:position}});
  }
  async navigate(uuid: string): Promise<LensResult> {
    if (this.source && await this.editor.editing() === uuid) {
      const fragment=reportFragment(this.source,logseqSourceId(this.source.scope.graphId,uuid));
      if (!fragment) return deny("source-not-in-scope");
      return this.openNative({schemaVersion:1,scope:fragment.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:this.source.structureVersion,position:{kind:"block"}});
    }
    const target=await this.forBlock(uuid);
    if (!target.ok) return target;
    const {schemaVersion,scope,sourceId,contentVersion,structureVersion,position}=target.value;
    return this.openNative({schemaVersion,scope,sourceId,contentVersion,structureVersion,position});
  }
  observeNativeDrops(consume: (event: DragEvent, resolve: (position: Exclude<BodyPosition,"block">) => Promise<LensResult<BodyTarget>>) => void): () => void {
    return this.editor.observeDrops((event,uuid)=>{
      const scope=this.host.scope(),lifetime=this.lifetime,source=this.source;
      if (!scope || !source || this.host.historical()) return;
      const fragment=reportFragment(source,logseqSourceId(scope.graphId,uuid));if (!fragment) return;
      consume(event,async position=>{
        if (!this.valid(scope,lifetime) || await this.host.currentGraph() !== scope.graphId) return deny("scope-mismatch");
        if (!await this.editor.available()) return deny("editing-in-progress");
        return this.resolve({schemaVersion:1,scope:fragment.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,
          structureVersion:source.structureVersion,position:{kind:position}});
      });
    });
  }
  async openNative(input: unknown): Promise<LensResult> {
    const ticket=++this.navigation, lifetime=this.lifetime, scope=this.host.scope();
    if (!scope || !this.host.visible() || this.disposed) return deny("view-not-visible");
    if (this.host.historical()) return deny("historical-view");
    const valid=()=>ticket===this.navigation && this.valid(scope,lifetime);
    try {
      if (this.host.renderer.composing || this.editor.isComposing) return deny("editing-in-progress");
      const existing=await this.editor.editing();
      if (!valid()) return deny("scope-mismatch");
      // A live input is a lease on that UUID. Do not refresh the displayed
      // snapshot, route again or reload its value just to continue writing.
      if (existing) {
        if (!this.source) return deny("editing-in-progress");
        const target=resolveBodyTarget(input,this.source);
        if (target.position.kind !== "block" || existing !== target.target.blockUuid) return deny("editing-in-progress");
        const latest=await this.host.navigationSource();
        if (!valid() || await this.host.currentGraph() !== scope.graphId || !valid()) return deny("scope-mismatch");
        if (!latest.ok) return latest;
        // Desktop can autosave while this same input remains open. Continuing
        // its lease is a focus action, so require current membership/identity,
        // rather than reloading a newer body into the active draft.
        if (!sameLensScope(latest.value.scope,scope)) return deny("scope-mismatch");
        const member=latest.value.blocks.find(block=>block.sourceId===target.sourceId && block.target.blockUuid===existing);
        if (!member) return deny("source-not-in-scope");
        if (member.availability !== "available") return deny("source-unavailable");
        if (await this.editor.editing() !== existing || this.editor.isComposing || !valid()) return deny("editing-in-progress");
        const exposed=await this.showNative(); if (!exposed.ok || !valid()) return exposed.ok ? deny("scope-mismatch") : exposed;
        if (!this.editor.focusExisting(existing,valid)) return deny("native-input-unavailable");
        return {ok:true,value:null};
      }
      const resolved=await this.resolve(input); if (!resolved.ok) return resolved;
      const revision=this.host.revision(), current=()=>valid() && revision === this.host.revision();
      if (!valid() || await this.host.currentGraph() !== scope.graphId || !valid()) return deny("scope-mismatch");
      if (resolved.value.position.kind !== "block") return deny("native-navigation-requires-block");
      const uuid=resolved.value.target.blockUuid, editing=await this.editor.editing();
      if (editing && editing !== uuid) return deny("editing-in-progress");
      const block=await logseq.Editor.getBlock(uuid);
      if (!valid() || !block) return deny("source-unavailable");
      if (typeof block.content !== "string" || await sha256(block.content) !== resolved.value.contentVersion) return deny("stale-content");
      const page=await logseq.Editor.getPage(block.page.id);
      const currentEditing=await this.editor.editing();
      if (!valid() || !page || this.editor.isComposing || (currentEditing && currentEditing !== uuid)) return deny("editing-in-progress");
      if (await this.host.currentGraph() !== scope.graphId || !valid()) return deny("scope-mismatch");
      if (!current()) return deny("source-changed-during-read");
      const bookmark=this.host.renderer.bookmark();
      this.yielding=true;
      let mode: "beside" | "switch";
      try { mode=await this.editor.expose(this.host.panel); } finally { this.yielding=false; }
      if (!valid()) return deny("scope-mismatch");
      this.native={scope:{...scope},bookmark,mode};
      if (currentEditing) {
        if (!this.editor.focusExisting(uuid,current)) return deny("native-input-unavailable");
      } else await this.editor.open(uuid,page.originalName ?? page.name,current,async()=>{
        if (!current() || await this.host.currentGraph() !== scope.graphId || !current()) return false;
        const latest=await this.host.navigationSource();
        if (!latest.ok || !current()) return false;
        try { resolveBodyTarget(input,latest.value); } catch { return false; }
        const block=await logseq.Editor.getBlock(uuid);
        return !!block && typeof block.content === "string" && await sha256(block.content) === resolved.value.contentVersion && current();
      });
      if (!valid()) return deny("scope-mismatch");
      return {ok:true,value:null};
    } catch (error) { return reportFailure(error); }
  }
  async resume(): Promise<LensResult> {
    try {
    if (this.disposed) return deny("scope-mismatch");
    if (this.host.renderer.composing || !await this.editor.available()) return deny("editing-in-progress");
    const native=this.native, scope=this.host.scope(), lifetime=this.lifetime;
    if (!scope || (native && !sameLensScope(native.scope,scope))) return deny("scope-mismatch");
    if (await this.host.currentGraph() !== scope.graphId || !this.valid(scope,lifetime)) return deny("scope-mismatch");
    await this.host.open(scope.rootUuid);
    if (!this.valid(scope,lifetime)) return deny("scope-mismatch");
    if (this.active) { const source=await this.capture(true); if (!source.ok) return source; }
    this.native=null; this.editor.hideReturn();
    this.host.changed();
    if (native) this.host.renderer.restore(native.bookmark);
    return {ok:true,value:null};
    } catch (error) { return reportFailure(error); }
  }
  reset(): void {
    this.remember(); this.boundScope=null; this.suspended=null;
    this.lifetime++; this.navigation++; this.readTicket++; this.refreshQueued=false; this.native=null; this.editor.hideReturn(); this.source=null; this.sourceRevision=-1; this.reading=null; this.folds.clear(); this.notice=null;
  }
  hide(reason: "switch" | "close"): void {
    if (reason === "close") this.reset();
    else if (!this.yielding) {
      this.navigation++; this.suspended=this.native?.bookmark??this.host.renderer.bookmark(); this.remember(); this.editor.hideReturn();
    }
  }
  dispose(): void { this.disposed=true; this.reset(); this.sessions.clear(); this.editor.dispose(); }
}
