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
  panel: FeaturePanel; renderer: WorkViewRenderer; changed(): void;
  open(root: string): Promise<void>; notify(text: string): void;
}
const deny = (reason: string): {ok:false;reason:string} => ({ok:false,reason});

/** Session presentation/navigation. No source writes, material store, formal state or additional provider. */
export class WorkViewReport {
  private mode: "report" | "structure" = "structure";
  private source: SourceSnapshot | null = null;
  private sourceRevision = -1;
  private reading: Promise<LensResult<SourceSnapshot>> | null = null;
  private readTicket = 0;
  private refreshQueued = false;
  private lifetime = 0;
  private navigation = 0;
  private disposed = false;
  private yielding = false;
  private folds = new Set<string>();
  private native: {scope:SourceScope; bookmark:ReadingBookmark; mode:"beside" | "switch"} | null = null;
  private notice: string | null = null;
  private readonly editor = new NativeEditorHost(() => {
    void this.resume().then(result => { if (!result.ok) this.host.notify(result.reason === "editing-in-progress" ? "请先结束原生输入，再返回正文。" : `报告暂不能恢复：${result.reason}`); });
  },() => this.sourceChanged());
  readonly api = {
    read: () => this.read(), setMode: (mode: unknown) => this.setMode(mode),
    refresh: () => this.capture(true), resolve: (input: unknown) => this.resolve(input),
    openNative: (input: unknown) => this.openNative(input), resume: () => this.resume(),
  };
  constructor(private readonly host: ReportHost, private readonly initialMode: "report" | "structure" = "structure") { this.mode = initialMode; }
  get active(): boolean { return this.mode === "report"; }
  get nativeActive(): boolean { return !!this.native; }
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
    if (this.host.renderer.composing) return deny("editing-in-progress");
    if (!fresh && this.sourceRevision === this.host.revision() && this.source) return {ok:true,value:structuredClone(this.source)};
    if (!fresh && this.reading) return this.reading;
    const ticket = ++this.readTicket;
    const reading = (async (): Promise<LensResult<SourceSnapshot>> => {
      const result = await this.host.source(fresh);
      if (!this.valid(scope,lifetime)) return deny("scope-mismatch");
      if (ticket !== this.readTicket) return deny("superseded-source-read");
      if (this.host.renderer.composing) return deny("editing-in-progress");
      if (!result.ok) { this.notice=result.reason; this.host.changed(); return result; }
      if (!sameLensScope(result.value.scope,scope)) return deny("scope-mismatch");
      if ((result.value.page?.availability ?? result.value.blocks[0]?.availability) !== "available") { this.notice="source-unavailable";this.host.changed();return deny("source-unavailable"); }
      this.source=structuredClone(result.value); this.sourceRevision=this.host.revision(); this.notice=null; this.host.changed();
      return {ok:true,value:structuredClone(this.source)};
    })();
    this.reading=reading;
    try { return await reading; } finally {
      if (this.reading === reading) {
        this.reading=null;
        if (this.refreshQueued) { this.refreshQueued=false; this.sourceChanged(); }
      }
    }
  }
  sourceChanged(): void {
    if (this.active && this.host.visible() && !this.host.renderer.composing) {
      if (this.reading) this.refreshQueued=true;
      else void this.capture(false);
    }
  }
  async setMode(mode: unknown): Promise<LensResult> {
    if (mode !== "report" && mode !== "structure") return deny("invalid-reading-mode");
    if (this.disposed || !this.host.visible()) return deny("view-not-visible");
    if (this.editor.isComposing || this.host.renderer.composing) return deny("editing-in-progress");
    if (this.host.historical()) return deny("historical-view");
    const bookmark = this.host.renderer.bookmark();
    if (mode !== this.mode) {
      if (mode === "report") this.folds=defaultReportFolds();
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
  sessionFolds(): string[] { return [...this.folds]; }
  restoreFolds(values: unknown[]): void {
    const available=new Set(this.source?.blocks.map(block=>block.target.blockUuid)??[]);
    this.folds=new Set(values.filter((id):id is string=>typeof id==="string"&&available.has(id)));this.host.changed();
  }
  async resolve(input: unknown): Promise<LensResult<BodyTarget>> {
    if (this.host.historical()) return deny("historical-view");
    if (this.editor.isComposing || this.host.renderer.composing) return deny("editing-in-progress");
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
      this.native={scope:{...scope},bookmark,mode}; this.editor.showReturn();
      if (currentEditing) {
        if (!this.editor.focusExisting(uuid,current)) return deny("native-input-unavailable");
      } else await this.editor.open(uuid,page.originalName ?? page.name,current,async()=>{
        if (!current() || await this.host.currentGraph() !== scope.graphId || !current()) return false;
        const latest=await logseq.Editor.getBlock(uuid);
        return !!latest && typeof latest.content === "string" && await sha256(latest.content) === resolved.value.contentVersion && current();
      });
      if (!valid()) return deny("scope-mismatch");
      return {ok:true,value:null};
    } catch (error) { return reportFailure(error); }
  }
  async resume(): Promise<LensResult> {
    try {
    if (this.disposed) return deny("scope-mismatch");
    if (this.host.renderer.composing) return deny("editing-in-progress");
    const native=this.native, scope=this.host.scope(), lifetime=this.lifetime;
    if (!scope || (native && !sameLensScope(native.scope,scope))) return deny("scope-mismatch");
    await this.host.open(scope.rootUuid);
    if (!this.valid(scope,lifetime)) return deny("scope-mismatch");
    if (this.active) { const source=await this.capture(true); if (!source.ok) return source; }
    this.native=null; this.editor.hideReturn();
    if (native) this.host.renderer.restore(native.bookmark);
    return {ok:true,value:null};
    } catch (error) { return reportFailure(error); }
  }
  reset(): void {
    this.mode=this.initialMode; this.lifetime++; this.navigation++; this.readTicket++; this.refreshQueued=false; this.native=null; this.editor.hideReturn(); this.source=null; this.sourceRevision=-1; this.reading=null; this.folds.clear(); this.notice=null;
  }
  hide(reason: "switch" | "close"): void {
    if (!this.yielding) this.navigation++;
    if (reason === "close") { this.native=null; this.editor.hideReturn(); }
  }
  dispose(): void { this.disposed=true; this.reset(); this.editor.dispose(); }
}
