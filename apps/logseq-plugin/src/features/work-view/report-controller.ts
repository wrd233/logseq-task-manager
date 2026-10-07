import { NativeEditorHost } from "../../host/native-editor.ts";
import type { FeaturePanel } from "../../host/panel-host.ts";
import { sha256, type SourceScope, type SourceSnapshot } from "../../workspace/source-protocol.ts";
import { logseqSourceId, sameLensScope } from "./lens-source.ts";
import { lensArray, lensRecord, lensText, requireLens } from "./lens-input.ts";
import type { LensResult } from "./lens-controller.ts";
import type { ReadingBookmark, WorkViewRenderer } from "./renderer.ts";
import type { ViewPresentation } from "./operations.ts";
import type { ComposedView, LensSelection } from "./view-composer.ts";
import type { SourceRow } from "./model.mjs";
import { composeReport, defaultReportFolds, reportFragment, reportFragments } from "./report-model.ts";
import { reportFailure, resolveBodyTarget, type BodyPosition, type BodyTarget } from "./report-target.ts";
import { ReadingPlanController } from "./reading-controller.ts";
import type { ReadingMaterial, ReadingMaterialPort } from "./reading-layout.ts";
import { readingSourceSet } from "./reading-plan.ts";
import { NativeSourceSetHost, type NativeSourceLocation } from "../../host/native-source-set.ts";

interface ReportHost {
  scope(): SourceScope | null; revision(): number; currentGraph(): Promise<string>;
  scopeVersion?():string;
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
  private materialPort:ReadingMaterialPort|null=null;
  private materialViews=new Map<string,ReadingMaterial>();
  private readonly plans:ReadingPlanController;
  private readonly sourceSet=new NativeSourceSetHost();
  private readonly editor = new NativeEditorHost(() => {
    void this.resume().then(result => { if (!result.ok) this.host.notify(result.reason === "editing-in-progress" ? "请先结束原生输入，再返回正文。" : `报告暂不能恢复：${result.reason}`); });
  },() => this.sourceChanged());
  readonly api = {
    read: () => this.read(), setMode: (mode: unknown) => this.setMode(mode),
    refresh: () => this.capture(true), resolve: (input: unknown) => this.resolve(input),
    openNative: (input: unknown) => this.openNative(input), resume: () => this.resume(),
    compare: (input: unknown) => this.compare(input), showNative: () => this.showNative(),
    highlight:(input:unknown)=>this.highlight(input),clearHighlight:()=>this.sourceSet.clear(),
  };
  constructor(private readonly host: ReportHost, private readonly defaultMode: "report" | "structure" = "report") {
    this.mode=defaultMode;
    this.plans=new ReadingPlanController({scope:()=>this.disposed?null:this.host.scope(),version:()=>this.host.scopeVersion?.()??"",
      unavailable:()=>this.host.historical()?"historical-view":this.host.renderer.composing||this.editor.isComposing?"editing-in-progress":null,
      source:async()=>{
        const scope=this.host.scope(),lifetime=this.lifetime;
        if(!scope||this.disposed)return deny("scope-mismatch");
        const source=await this.host.navigationSource();
        if(!this.valid(scope,lifetime))return deny("scope-mismatch");
        if(source.ok) {this.source=structuredClone(source.value);this.sourceRevision=this.host.revision();this.notice=null;this.plans.noteSource(this.source);this.host.changed();}
        return source;
      },materials:async()=>{
        const scope=this.host.scope(),lifetime=this.lifetime,port=this.materialPort;
        if(!scope||!port) {this.materialViews.clear();return new Set<string>();}
        const views=await port.list(scope);
        if(!this.valid(scope,lifetime)||port!==this.materialPort)throw new Error("READING_MATERIAL_SCOPE_CHANGED");
        requireLens(views.length<=2000&&new Set(views.map(view=>view.id)).size===views.length,"invalid-reading-material-list");
        this.materialViews=new Map(views.map(view=>[view.id,view]));return new Set(this.materialViews.keys());
      },changed:()=>this.host.changed()});
  }
  readonly readingAPI={
    read:()=>this.plans.api.read(),request:(input:unknown)=>this.plans.api.request(input),
    submit:async(input:unknown)=>{
      const bookmark=this.host.renderer.bookmark(),result=await this.plans.api.submit(input);
      if(result.ok) {this.mode="report";this.host.changed();this.host.renderer.restore(bookmark,[],false);}
      return result;
    },select:async(id:unknown)=>{
      const bookmark=this.host.renderer.bookmark(),result=await this.plans.api.select(id);
      if(result.ok) {this.mode="report";this.host.changed();this.host.renderer.restore(bookmark,[],false);}
      return result;
    },cancel:(requestId?:unknown)=>this.plans.api.cancel(requestId),
  };
  setReadingMaterials(port:ReadingMaterialPort|null):void {this.materialPort=port;this.materialViews.clear();this.plans.api.cancel();}
  async openReadingMaterial(id:string):Promise<void> {
    const scope=this.host.scope(),port=this.materialPort,lifetime=this.lifetime;
    if(!scope||!port||this.host.historical()||!this.materialViews.has(id))throw new Error("READING_MATERIAL_UNAVAILABLE");
    const materials=await port.list(scope);
    if(!this.valid(scope,lifetime)||port!==this.materialPort||!materials.some(view=>view.id===id))throw new Error("READING_MATERIAL_SCOPE_CHANGED");
    await port.open(id,scope);
  }
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
      native:this.native ? {scope:{...this.native.scope}, mode:this.host.visible() ? this.native.mode : "switch"} : null, sourceLocation:this.sourceSet.read(), notice:this.notice};
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
      this.source=structuredClone(result.value); this.sourceRevision=this.host.revision(); this.notice=null;this.plans.noteSource(this.source); this.host.changed();
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
    if(this.sourceRevision!==this.host.revision())this.sourceSet.clear();
    if (this.active && this.host.visible() && !this.host.renderer.composing) {
      if (this.reading) this.refreshQueued=true;
      else { this.refreshQueued=false; void this.capture(false); }
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
  highlightFromView(sourceIds:readonly string[],includeContext:boolean,contextSourceIds:readonly string[]=[]):Promise<LensResult<NativeSourceLocation>> {
    if(!this.source)return Promise.resolve(deny("source-unavailable"));
    return this.highlight({schemaVersion:1,sourceIds:[...sourceIds],includeContext,contextSourceIds:[...contextSourceIds],structureVersion:this.source.structureVersion,sourceSetVersion:this.source.sourceSetVersion});
  }
  async highlight(input:unknown):Promise<LensResult<NativeSourceLocation>> {
    try {
      const raw=lensRecord(input,["schemaVersion","sourceIds","contextSourceIds","includeContext","structureVersion","sourceSetVersion"]);
      requireLens(raw.schemaVersion===1,"unsupported-reading-schema");requireLens(typeof raw.includeContext==="boolean","invalid-source-set");
      const basis=this.source,scope=this.host.scope(),lifetime=this.lifetime,witness=this.host.scopeVersion?.()??"";
      requireLens(basis&&scope&&!this.disposed,"source-unavailable");requireLens(!this.host.historical(),"historical-view");
      requireLens(raw.structureVersion===basis.structureVersion&&raw.sourceSetVersion===basis.sourceSetVersion,"stale-source-set");
      const ids=lensArray(raw.sourceIds,10_000,1).map(id=>lensText(id,4096));
      const contextIds=raw.contextSourceIds===undefined?[]:lensArray(raw.contextSourceIds,10_000).map(id=>lensText(id,4096));
      const byId=new Map(basis.blocks.map(block=>[block.sourceId,block]));
      for(const id of contextIds)requireLens(byId.has(id),"source-not-in-scope");
      // Context is an exact union, never an instruction to expand an ancestor's unrelated descendants.
      const expanded=new Set([...readingSourceSet(basis,ids,raw.includeContext),...contextIds]);
      const selected=basis.blocks.filter(block=>expanded.has(block.sourceId)).map(block=>block.sourceId);
      const current=()=>this.valid(scope,lifetime)&&!this.host.historical()&&(this.host.scopeVersion?.()??"")===witness;
      const verify=async()=>{
        const fresh=await this.host.navigationSource();
        return current()&&fresh.ok&&sameLensScope(fresh.value.scope,scope)&&fresh.value.structureVersion===basis.structureVersion&&fresh.value.sourceSetVersion===basis.sourceSetVersion&&await this.host.currentGraph()===scope.graphId&&current();
      };
      requireLens(await verify(),"stale-source-set");
      const first=byId.get(ids[0]!)!,block=await logseq.Editor.getBlock(first.target.blockUuid);
      requireLens(current()&&block,"source-unavailable");
      requireLens(typeof block.content==="string"&&await sha256(block.content)===first.contentVersion,"stale-content");
      const page=await logseq.Editor.getPage(block.page.id);requireLens(current()&&page,"source-unavailable");
      // A draft or composition keeps its existing layout, focus and input node.
      // Highlight already mounted bodies without invoking the native editing port.
      if(!this.editor.isComposing&&!await this.editor.editing()) {
        const exposed=await this.showNative();if(!exposed.ok)return exposed;
      }
      requireLens(current(),"scope-mismatch");
      const location=await this.sourceSet.locate(selected.map(id=>({sourceId:id,uuid:byId.get(id)!.target.blockUuid,page:page.originalName??page.name})),current,verify,ids[0]);
      requireLens(current(),"scope-mismatch");
      return {ok:true,value:location};
    } catch(error) {return reportFailure(error);}
  }
  compose(personal: ViewPresentation, lens: LensSelection | null, overlay?: ComposedView) {
    if(!this.active||!this.source)return null;
    const report=composeReport(this.source,personal,lens,this.folds,overlay),reading=!overlay?this.plans.active(this.source):null;
    if(!reading)return report;
    const byUuid=new Map(report.view.items.map(item=>[item.uuid,item])),byId=new Map(this.source.blocks.map(block=>[block.sourceId,block]));
    return {...report,headings:[],view:{...report.view,items:reading.primarySourceIds.map(id=>byUuid.get(byId.get(id)!.target.blockUuid)!)},reading:{verified:reading,materials:this.materialViews}};
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
        let target: BodyTarget;
        try { target=resolveBodyTarget(input,this.source); }
        catch (error) {
          const reason=reportFailure(error).reason;
          if (reason !== "stale-content" && reason !== "stale-structure") throw error;
          const raw=lensRecord(input,["schemaVersion","scope","sourceId","contentVersion","structureVersion","position"],"invalid-report-target");
          const position=lensRecord(raw.position,["kind"],"invalid-report-position");
          if (typeof existing !== "string" || position.kind !== "block" || raw.sourceId !== logseqSourceId(scope.graphId,existing)) return deny("editing-in-progress");
          const fragment=reportFragment(this.source,raw.sourceId);
          if (!fragment) return deny("source-not-in-scope");
          // A saved report may have advanced while this exact textarea kept its
          // lease. Renew only its read-only focus target; writes still resolve
          // the caller's original versions through resolveBodyTarget.
          target=resolveBodyTarget({...raw,contentVersion:fragment.contentVersion,structureVersion:this.source.structureVersion},this.source);
        }
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
    if (this.host.renderer.composing) return deny("editing-in-progress");
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
    this.lifetime++; this.navigation++; this.readTicket++; this.refreshQueued=false; this.native=null; this.editor.hideReturn(); this.source=null; this.sourceRevision=-1; this.reading=null; this.folds.clear(); this.notice=null;this.plans.reset();this.materialViews.clear();this.sourceSet.clear();
  }
  hide(reason: "switch" | "close"): void {
    if (!this.yielding) {
      this.navigation++; this.suspended=this.native?.bookmark??this.host.renderer.bookmark(); this.remember(); this.editor.hideReturn();
    }
    if (reason === "close") this.native=null;
  }
  dispose(): void { this.disposed=true; this.reset(); this.sessions.clear(); this.editor.dispose();this.plans.dispose();this.sourceSet.dispose(); }
}
