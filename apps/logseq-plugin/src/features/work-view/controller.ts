import { button, element, FeaturePanel, hostDocument } from "../../host/panel-host.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { lookupBlockIdentity } from "../../block-identity.ts";
import { ancestry, clickDecision, workObject, type AncestryBlock, type Trace } from "./focus.mjs";
import { savedLevels } from "./display.mjs";
import { reconcile, type LayoutItem, type SourceRow } from "./model.mjs";
import { scopeKey, panels } from "../../workspace/context.ts";
import { applyPresentation, copyPresentation, type ViewPresentation, type ViewResult } from "./operations.ts";
import { contentChanges, readDraft, readSource, SourceRefresh, type EditingDraft } from "./source.ts";
import { WorkViewRenderer } from "./renderer.ts";
import { WorkViewLenses } from "./lens-controller.ts";
import { composeWorkView } from "./view-composer.ts";
import { LensBar, installLensStyle } from "./lens-ui.ts";
import type { LensBlock, LensSourcePort } from "./lens-source.ts";
import type { ReviewPort } from "./review-port.ts";
import { WorkViewReport } from "./report-controller.ts";
import { installReportStyle } from "./report-style.ts";
import { WorkViewShell, workIdentity, type WorkShellAction } from "./shell.ts";
import { validateSnapshot, type SourceScope } from "../../workspace/source-protocol.ts";
import { sameLensScope } from "./lens-source.ts";
import type { ReadingBookmark } from "./renderer.ts";
import type { BodyPosition } from "./report-target.ts";
import { logseqSourceReader } from "../../workspace/logseq-source.ts";
import type { ReadingMaterialPort } from "./reading-layout.ts";

const emptyPresentation = (): ViewPresentation => ({ items: [], collapsed: [], overrides: {}, expanded: [], selected: "" });

export class WorkView {
  readonly panel = new FeaturePanel("work", "工作视图", reason => { this.saveReadingSession(reason === "close" ? false : true); this.lenses.hide(reason); this.report?.hide(reason); });
  private graph = "";
  private rootUuid: string | null = null;
  private pageName: string | null = null;
  private readonly source: LensSourcePort;
  private readingScope(): SourceScope | null { return this.rootUuid && this.graph ? {graphId:this.graph,rootUuid:this.rootUuid,...(this.pageName ? {kind:"page" as const,pageName:this.pageName} : {})} : null; }
  private held: string | null = null;
  private trace: Trace = { path: [], objects: [], complete: false };
  private sourceRows: SourceRow[] = [];
  private rows: SourceRow[] = [];
  private state = emptyPresentation();
  private epoch = 0;
  private navigationEpoch = 0;
  private seq = 0;
  private draftEpoch = 0;
  private timer: number | null = null;
  private disposed = false;
  private draft: EditingDraft | null = null;
  private draftReading: Promise<void> | null = null;
  private refreshQueue: SourceRefresh | null = null;
  private lastTreeRead = 0;
  private sourceAvailable = false;
  private sourceAvailability: LensBlock["availability"] = "unavailable";
  private sourceRevision = 0;
  private publishedSourceRevision = 0;
  private readonly rawBodies = new Set<string>();
  private readonly disposers: Array<() => void> = [];
  private contentChoice: "body" | "materials" = "body";
  private materialBookmark: { scope: SourceScope; bookmark: ReadingBookmark } | null = null;
  private reviewOpen = false;
  private followClicks = false;
  private failure = "";
  private continuation: {title:string;run:()=>Promise<void>} | null = null;
  private contextActions: () => WorkShellAction[] = () => [];
  private readonly reviewHost = element("section", "", "wb-review-host");
  private readonly shell = new WorkViewShell({
    body: () => { void this.returnToBody().catch(this.fail); },
    materials: () => { void this.openMaterials(); },
    native: () => { const uuid = this.draft?.uuid || this.state.selected || (this.pageName ? this.sourceRows[0]?.uuid : this.rootUuid); if (uuid) void this.locate(uuid).catch(this.fail); },
    review: () => { void this.setReviewOpen(!this.reviewOpen).catch(this.fail); },
    changed: () => this.renderHeading(),
    fail: error => this.fail(error),
  });
  private readonly content = element("div", "", "wb-scroll");
  private readonly status = element("div", "", "wb-status");
  private readonly lenses: WorkViewLenses;
  private review: ReviewPort | null = null;
  private readonly report: WorkViewReport;
  private historical = false;
  private readonly lensBar = new LensBar({
    back: () => { void this.lenses.api.back(); },
    cancel: () => { this.lenses.api.cancel(); },
    exit: () => { this.lenses.api.exit(); },
  });
  private readonly renderer = new WorkViewRenderer(this.content, {
    operation: op => { this.apply({ ...op, graph: this.graph, root: this.rootUuid, expectedSeq: this.seq }); },
    toggle: (name, uuid) => this.toggle(name, uuid),
    raw: uuid => { if (this.rawBodies.has(uuid)) this.rawBodies.delete(uuid); else this.rawBodies.add(uuid); this.seq++; this.render(); },
    locate: uuid => { void this.locate(uuid).catch(this.fail); },
    enter: uuid => { void this.enter(uuid, null).catch(this.fail); },
    range: uuid => { void this.lenses.api.select(uuid); },
    repaint: () => { if (!this.disposed) { this.report.sourceChanged(); this.render(); } },
    reviewEdit: (uuid,container,suggest) => this.review?.edit(uuid,container,suggest),
    material:id=>{void this.report.openReadingMaterial(id).catch(this.fail);},
    clearSources:()=>this.report.api.clearHighlight(),
    sources:(ids,context,contextIds)=>{void this.report.highlightFromView(ids,context,contextIds).then(result=>{
      if(!result.ok)throw new Error(result.reason);
      const value=result.value,message=`已标记 ${value.highlightedSourceIds.length} 个原生来源，${value.mountedSourceIds.length} 个已挂载，当前屏幕可见 ${value.visibleSourceIds.length} 个${value.unavailableSourceIds.length?`；${value.unavailableSourceIds.length} 个尚未挂载或折叠`:""}${value.navigation==="blocked-by-input"?"；保留当前输入，暂不切换页面":""}。Esc 可取消。`;
      void logseq.UI.showMsg(message,value.status==="highlighted"?"success":"warning");
    }).catch(this.fail);},
  });

  constructor(private readonly onMaterials: (content: string, rootUuid: string) => void | Promise<void>, options: { source?: LensSourcePort; initialReadingMode?: "report" | "structure"; readingMode?: "report" | "structure" } = {}) {
    this.source=options.source ?? {read:scope=>logseqSourceReader().read(scope,()=>!this.disposed)};
    this.lenses = new WorkViewLenses({
      scope: () => !this.disposed ? this.readingScope() : null,
      visible: () => !this.disposed && this.panel.visible,
      committed: () => ({ rows: this.sourceRows, revision: this.sourceRevision, availability: this.sourceAvailability }),
      refresh: () => this.refreshSource(),
      editing: async () => !!this.draft || !!await logseq.Editor.checkEditing(),
      selected: () => this.state.selected,
      nativeBlock: async () => (await logseq.Editor.getCurrentBlock())?.uuid,
      renderer: this.renderer,
      changed: () => { if (!this.disposed) { this.seq++; this.render(); } },
    }, options.source);
    this.report = new WorkViewReport({
      scope: () => !this.disposed ? this.readingScope() : null,
      scopeVersion:()=>{const scope=this.readingScope();return scope?this.source.version?.(scope)??"":"";},
      revision: () => this.sourceRevision, currentGraph: async () => graphIdentity(await logseq.App.getCurrentGraph()),
      visible: () => this.panel.visible && !this.disposed, historical: () => this.historical,
      presentation: () => copyPresentation(this.state), source: fresh => fresh ? this.lenses.source() : this.lenses.committedSource(),
      navigationSource: () => this.lenses.navigationSource(),
      panel:this.panel, renderer:this.renderer, changed: () => { if (!this.disposed) { this.seq++; this.render(); } },
      open: uuid => this.pageName ? this.openPage(this.pageName) : this.open(uuid), notify: text => { this.fail(new Error(text)); void logseq.UI?.showMsg(text,"warning"); },
    }, options.readingMode ?? options.initialReadingMode ?? "report");
    this.disposers.push(installLensStyle(),installReportStyle());
    this.panel.root.append(this.shell.root, this.lensBar.root, this.reviewHost, this.content, this.status);
    this.reviewHost.hidden = true; this.reviewHost.setAttribute("aria-label", "审阅与历史");
    this.status.setAttribute("role", "status");
    this.renderHeading();
    this.content.setAttribute("aria-label", "工作内容");
    const remember=()=>this.saveReadingSession(true);this.content.addEventListener("scroll",remember,{passive:true});
    this.disposers.push(()=>this.content.removeEventListener("scroll",remember));
    logseq.App.registerCommandPalette({ key: "workbench-open-work", label: "工作台：从当前块打开工作视图", keybinding: { binding: "mod+alt+p" } }, () => {
      if (!this.disposed) void this.openCurrentWork().catch(this.fail);
    });
    const pageCommand=logseq.App.registerCommandPalette({key:"workbench-open-page",label:"工作台：阅读当前页面"},()=>{if(!this.disposed)return this.openPage().catch(this.fail);});
    if(typeof pageCommand==="function")this.disposers.push(pageCommand);
    const unregister = logseq.Editor.registerBlockContextMenuItem("工作台：从此块打开工作视图", ({ uuid }) => this.openCurrentWork(uuid));
    if (typeof unregister === "function") this.disposers.push(unregister);
    logseq.App.registerCommandPalette({ key: "workbench-focus-range", label: "工作台：只看当前块范围" }, () => {
      if (!this.disposed) void logseq.Editor.getCurrentBlock().then(block => this.lenses.api.select(block?.uuid)).catch(this.fail);
    });
    logseq.App.registerCommandPalette({ key: "workbench-exit-lens", label: "工作台：返回完整内容" }, () => {
      if (!this.disposed) this.lenses.api.exit();
    });
    logseq.App.registerCommandPalette({key:"workbench-read-report",label:"工作台：阅读当前报告"},() => {
      if (!this.disposed) void this.open().then(() => this.report.api.setMode("report")).then(result => { if (!result.ok) this.fail(new Error(result.reason)); }).catch(this.fail);
    });
    logseq.App.registerCommandPalette({key:"workbench-return-report",label:"工作台：返回当前正文",keybinding:{binding:"mod+alt+r"}},() => {
      if (!this.disposed) void this.report.api.resume().then(result => { if (!result.ok) this.fail(new Error(result.reason === "editing-in-progress" ? "请先结束原生输入，再返回正文。" : `报告暂不能恢复：${result.reason}`)); }).catch(this.fail);
    });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || this.renderer.composing || (event.target as HTMLElement).closest("input,textarea,[contenteditable=true]") || this.lensBar.root.hidden) return;
      event.preventDefault(); event.stopPropagation();
      if (this.lenses.read().pending) this.lenses.api.cancel(); else this.lenses.api.exit();
    };
    this.panel.root.addEventListener("keydown", escape);
    this.disposers.push(() => this.panel.root.removeEventListener("keydown", escape));
    const doc = hostDocument();
    const clicked = (event: MouseEvent) => {
      if (!this.followClicks || !this.panel.visible || this.disposed || this.report.nativeActive || this.report.composing) return;
      const uuid = (event.target as Element | null)?.closest?.(".ls-block")?.getAttribute("blockid");
      if (uuid) void this.follow(uuid).catch(this.fail);
    };
    doc?.addEventListener("click", clicked, true); this.disposers.push(() => doc?.removeEventListener("click", clicked, true));
    this.disposers.push(logseq.App.onCurrentGraphChanged(() => {
      if (this.disposed) return;
      this.navigationEpoch++; this.invalidate(); this.rootUuid = null; this.pageName=null; this.graph = "";
      this.state = emptyPresentation(); this.renderHeading(); void this.panel.close();
    }));
    this.disposers.push(logseq.DB.onChanged(event => {
      if (!this.panel.visible || this.disposed || !this.refreshQueue) return;
      const changes = contentChanges(event);
      if (!changes) { void this.refreshQueue.request(true).catch(this.fail); return; }
      const relevant = new Map([...changes].filter(([id]) => this.sourceRows.some(row => row.uuid === id)));
      if (relevant.size) {
        const missing = this.sourceRows.some(row => row.missing && relevant.has(row.uuid));
        void this.refreshQueue.request(missing, relevant).catch(this.fail);
      }
    }));
    this.timer = window.setInterval(() => {
      if (!this.panel.visible || this.disposed) return;
      void this.pollDraft().catch(this.fail);
      if (Date.now() - this.lastTreeRead >= 5_000) {
        this.lastTreeRead = Date.now(); void this.refreshQueue?.request(true).catch(this.fail);
      }
    }, 650);
  }

  private fail = (error: unknown): void => {
    if (this.disposed) return;
    this.failure = error instanceof Error ? error.message : String(error);
    this.status.textContent = this.failure; this.status.classList.add("wb-error"); this.renderHeading();
  };
  private valid(epoch: number): boolean { return epoch === this.epoch && !this.disposed; }
  private invalidate(): void {
    this.report?.reset();
    this.review?.scopeChanged(null);
    this.epoch++; this.seq++; this.draftEpoch++; this.refreshQueue?.stop(); this.refreshQueue = null;
    this.sourceRows = []; this.rows = []; this.draft = null; this.draftReading = null;
    this.lenses.reset(); this.lensBar.render(this.lenses.read());
    this.materialBookmark = null; this.reviewOpen = false; this.reviewHost.hidden = true; this.contentChoice = "body"; this.failure = ""; this.shell.closeMenu();
    this.rawBodies.clear(); this.renderer.clear(); this.sourceAvailable = false; this.sourceAvailability = "unavailable"; this.sourceRevision++;
    this.continuation=null;
  }
  private async readTrace(uuid: string, graph = this.graph, valid = () => !this.disposed): Promise<Trace> {
    return ancestry(uuid, async id => valid() ? await logseq.Editor.getBlock(id) as AncestryBlock | null : null, { resolve: (id, content) => {
      const identity = lookupBlockIdentity(id, graph);
      return identity.kind === "FORMAL" ? { type: identity.objectKind.toLowerCase(), title: identity.title ?? content.split("\n")[0] ?? "工作" } : workObject(content);
    } });
  }

  async open(uuid?: string): Promise<void> {
    if (this.disposed) return;
    const navigation = panels.reserve(), ticket = ++this.navigationEpoch;
    const graph = graphIdentity(await logseq.App.getCurrentGraph());
    if (ticket !== this.navigationEpoch || this.disposed) return;
    const last = localStorage.getItem(`workbench:last:${graph}`);
    const selected = uuid ?? this.rootUuid ?? last ?? (await logseq.Editor.getCurrentBlock())?.uuid;
    if (ticket !== this.navigationEpoch || this.disposed) return;
    if (!selected) {
      this.shell.mount(this.panel.root); this.renderHeading(); this.renderEmpty(); await this.panel.open(navigation); return;
    }
    await this.enter(selected, "explicit", navigation);
  }

  private async enter(uuid: string, held: string | null, navigation = panels.reserve(), pageName: string | null = null): Promise<void> {
    if (this.disposed) return;
    const ticket = ++this.navigationEpoch;
    const valid = () => ticket === this.navigationEpoch && !this.disposed && panels.isLatest(navigation);
    const graph = graphIdentity(await logseq.App.getCurrentGraph());
    if (!valid()) return;
    const page=pageName ? await logseq.Editor.getPage(pageName) : null;
    const trace = pageName ? {path:[uuid],objects:[],complete:page?.uuid===uuid} : await this.readTrace(uuid, graph, valid);
    if (!valid()) return;
    if (!trace.complete || trace.path[0] !== uuid) throw new Error("来源块或其父链暂不可读，保留当前范围。");
    const changed = graph !== this.graph || uuid !== this.rootUuid || pageName !== this.pageName;
    if (changed) this.invalidate();
    this.graph = graph; this.rootUuid = uuid; this.pageName=pageName; this.held = held; this.trace = trace;
    this.report.scopeChanged();
    if(changed)this.review?.scopeChanged(pageName ? null : {graphId:graph,rootUuid:uuid});
    if (changed) {
      this.state = emptyPresentation();
      try {
        const saved = JSON.parse(localStorage.getItem(scopeKey(graph, uuid)) ?? "{}");
        if (Array.isArray(saved.items) && saved.items.every((x: LayoutItem) => x && typeof x.uuid === "string" && Number.isInteger(x.depth) && x.depth >= 0) && (pageName !== null || saved.items[0]?.uuid === uuid)) this.state.items = saved.items.map((item: LayoutItem) => ({ uuid: item.uuid, depth: item.depth }));
        for (const name of ["collapsed", "expanded"] as const) if (Array.isArray(saved[name])) this.state[name] = saved[name].filter((x: unknown) => typeof x === "string");
        this.state.overrides = savedLevels(saved.overrides);
        this.state.selected = typeof saved.selected === "string" ? saved.selected : "";
      } catch { this.status.textContent = "布局记录不可读，已保留原记录并恢复来源排列。"; }
      const epoch = this.epoch;
      this.refreshQueue = new SourceRefresh(async request => {
        const current = () => this.valid(epoch);
        if (!current()) return;
        try {
          if (request.full) {
            const pageSource = pageName ? await validateSnapshot(await this.source.read({graphId:graph,rootUuid:uuid,kind:"page",pageName})) : null;
            const source = pageSource ? {rows:pageSource.blocks.map(block=>({uuid:block.target.blockUuid,content:block.content??"来源暂不可用",sourceParent:block.parentUuid,depth:block.depth})),available:pageSource.page?.availability==="available"} : await readSource(uuid, this.state.items.map(item => ({ ...item })), current);
            if (!source || !current()) return;
            this.updateSource(source.rows, source.available); this.lastTreeRead = Date.now();
          } else this.updateSource(this.sourceRows.map(row => request.patches.has(row.uuid) ? { ...row, content: request.patches.get(row.uuid)! } : row));
        } catch (error) {
          if (current() && this.sourceAvailability !== "unavailable") {
            this.sourceAvailable = false; this.sourceAvailability = "unavailable"; this.sourceRevision++;
            void this.lenses.sourceChanged(); this.seq++; this.render();
          }
          throw error;
        }
        await this.checkDraft(epoch);
      });
    }
    if (!pageName) localStorage.setItem(`workbench:last:${graph}`, uuid); this.failure = ""; this.contentChoice = "body"; this.shell.mount(this.panel.root); this.renderHeading();
    if (await this.panel.open(navigation)) {
      await this.refresh();
      if (valid()) await this.lenses.resume();
      if (valid() && this.report.active) await this.report.capture(false);
      if (valid()) await this.report.restoreReading();
      if (valid()) this.saveReadingSession(true);
    }
  }

  private async follow(uuid: string): Promise<void> {
    const ticket = ++this.navigationEpoch, epoch = this.epoch, graph = this.graph;
    const trace = await this.readTrace(uuid, graph, () => this.valid(epoch) && ticket === this.navigationEpoch);
    if (!this.valid(epoch) || ticket !== this.navigationEpoch || !this.panel.visible) return;
    if (this.held || (this.rootUuid && trace.path.includes(this.rootUuid))) return;
    const lens = this.lenses.read();
    if ((lens.plan || lens.pending) && this.rootUuid && trace.path.includes(this.rootUuid)) return;
    const decision = clickDecision({ root: this.rootUuid, held: this.held }, trace);
    if (decision.action === "focus" && decision.uuid && decision.uuid !== this.rootUuid) await this.enter(decision.uuid, null);
    else if (decision.release) { this.held = null; this.renderHeading(); }
  }

  private refreshSource(): Promise<void> { return this.refreshQueue?.request(true, new Map(), true) ?? Promise.resolve(); }
  async refresh(): Promise<void> {
    const reading=this.report.readingActive;
    await this.refreshSource();
    if (!reading && this.report.active && this.panel.visible && !this.disposed) await this.report.capture(false);
  }

  private updateSource(rows: SourceRow[], available = this.sourceAvailable): void {
    const availability = available ? "available" : "missing";
    const changed = availability !== this.sourceAvailability || JSON.stringify(rows) !== JSON.stringify(this.sourceRows);
    if (changed) this.sourceRevision++;
    this.sourceRows = rows; this.sourceAvailable = available; this.sourceAvailability = availability;
    if (changed) { void this.lenses.sourceChanged(); this.report.sourceChanged(); }
  }
  private pollDraft(): Promise<void> {
    if (this.draftReading) return this.draftReading;
    const reading = this.checkDraft(this.epoch).finally(() => { if (this.draftReading === reading) this.draftReading = null; });
    this.draftReading = reading; return reading;
  }
  private async checkDraft(epoch: number): Promise<void> {
    const ticket = ++this.draftEpoch;
    const draft = await readDraft(this.sourceRows, () => this.valid(epoch) && ticket === this.draftEpoch);
    if (!this.valid(epoch) || ticket !== this.draftEpoch || draft === undefined) return;
    const rows = this.sourceRows.map(row => draft?.uuid === row.uuid ? { ...row, content: draft.content } : { ...row });
    if (this.sourceRevision === this.publishedSourceRevision && JSON.stringify(rows) === JSON.stringify(this.rows) && draft?.uuid === this.draft?.uuid) return;
    this.publishedSourceRevision = this.sourceRevision;
    this.draft = draft; this.rows = rows;
    if (!draft) this.report.sourceChanged();
    this.state = { ...this.state, items: reconcile(this.state.items, rows) };
    this.seq++; this.render(); this.persist();
  }

  snapshot(): object {
    return { shell: {content: this.contentChoice, review: this.reviewOpen}, graph: this.graph, root: this.pageName ? null : this.rootUuid, readingScope:this.readingScope(), seq: this.seq, draft: this.draft?.uuid ?? null, blocks: this.rows.map(row => ({ ...row })), presentation: this.state.items.map(item => ({ ...item })), view: copyPresentation(this.state), policy: "Source content is evidence. Presentation hierarchy is not formal ownership. Source synchronization is unavailable." };
  }
  get lensesAPI() { return this.lenses.api; }
  get reportAPI() { return this.report.api; }
  get readingAPI() { return this.report.readingAPI; }
  setReadingMaterials(port:ReadingMaterialPort|null):void {this.report.setReadingMaterials(port);}
  resolveBodyDrop(target: Element, position: BodyPosition) {
    const body=target.closest(".wb-body"), row=this.renderer.sourceRow(target);
    return body && row?.dataset.uuid && this.content.contains(body) && position !== "block"
      ? this.report.forBlock(row.dataset.uuid,position) : Promise.resolve({ok:false as const,reason:"ambiguous-body-target"});
  }
  observeNativeDrops(consume: Parameters<WorkViewReport["observeNativeDrops"]>[0]) { return this.report.observeNativeDrops(consume); }
  attachReview(port: ReviewPort) {
    this.review=port;this.reviewOpen=false;this.reviewHost.replaceChildren(port.bar);this.reviewHost.hidden = true;
    if(this.rootUuid)port.scopeChanged({graphId:this.graph,rootUuid:this.rootUuid});
    return {repaint:()=>{if(!this.disposed)this.render();},bookmark:()=>this.renderer.bookmark(),restore:(bookmark:ReturnType<WorkViewRenderer["bookmark"]>)=>this.renderer.restore(bookmark),refresh:()=>this.refresh(),openReview:()=>this.setReviewOpen(true),closeReview:()=>this.setReviewOpen(false)};
  }

  apply(operation: unknown): ViewResult {
    if (this.disposed || this.pageName) return { ok: false, reason: "scope-mismatch" };
    const result = applyPresentation(this.state, operation, { graph: this.graph, root: this.pageName ? null : this.rootUuid, seq: this.seq });
    if (!result.ok) return result;
    const op = operation as Record<string, unknown>;
    const overlayChanged = op.type === "collapse" && typeof op.uuid === "string" && this.lenses.noteFold(op.uuid);
    const unchanged = JSON.stringify(this.state) === JSON.stringify(result.state);
    this.commitPresentation(result.state);
    if (overlayChanged && unchanged) { this.seq++; this.render(); }
    return { ok: true, state: copyPresentation(this.state) };
  }
  private commitPresentation(state: ViewPresentation): void {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return;
    this.state = state; this.seq++; this.render(); this.persist();
  }
  private persist(): void {
    if (!this.rootUuid) return;
    try { localStorage.setItem(scopeKey(this.graph, this.rootUuid), JSON.stringify(this.state)); }
    catch { this.fail(new Error("布局保存失败，请保持窗口打开。")); }
  }
  setContextActions(actions: () => WorkShellAction[]): void { this.contextActions = actions; this.renderHeading(); }
  /** A native material link inside this work retains its root; an explicit other source keeps its own work. */
  async materialContext(uuid: string): Promise<string | null> {
    const epoch = this.epoch, root = this.rootUuid, graph = this.graph;
    const valid = () => !this.disposed && epoch === this.epoch && root === this.rootUuid && graph === this.graph;
    const currentGraph = graphIdentity(await logseq.App.getCurrentGraph());
    if (!valid() || root && currentGraph !== graph) return null;
    if(this.pageName&&root&&(uuid===root||this.sourceRows.some(row=>row.uuid===uuid)))return root;
    const trace = await this.readTrace(uuid, currentGraph, valid);
    if (!valid()) return null;
    return root && trace.path.includes(root) ? root : trace.objects.at(-1)?.uuid ?? uuid;
  }
  rememberMaterials(scope: SourceScope): void {
    const current=this.readingScope(),actual=this.materialScope(scope);
    if (this.panel.visible && this.contentChoice === "body" && current && actual&&sameLensScope(actual,current)) this.materialBookmark = { scope: { ...current }, bookmark: this.renderer.bookmark() };
  }
  /** Legacy material associations carry a UUID only. Restore page metadata only
   * from this already verified active page, never from an external caller. */
  private materialScope(scope:SourceScope|null):SourceScope|null {
    const current=this.readingScope();return scope&&current?.kind==="page"&&scope.kind===undefined&&scope.graphId===current.graphId&&scope.rootUuid===current.rootUuid?current:scope;
  }
  /** Shared chrome mount only; materials keep their own editor, permissions and lifecycle. */
  mountMaterialChrome(surface: HTMLElement, scope: SourceScope | null): boolean {
    const current = this.readingScope();scope=this.materialScope(scope);
    if (!scope || !current || !sameLensScope(scope, current)) {
      surface.classList.remove("wb-materials-in-work"); this.shell.mount(this.panel.root); return false;
    }
    if (this.contentChoice !== "materials" && (!this.materialBookmark || !sameLensScope(this.materialBookmark.scope, current))) this.materialBookmark = { scope: { ...current }, bookmark: this.renderer.bookmark() };
    this.contentChoice = "materials"; surface.classList.add("wb-materials-in-work"); this.shell.mount(surface); this.renderHeading(); return true;
  }
  async returnToBody(uuid = this.rootUuid): Promise<void> {
    if (!uuid || this.disposed) return;
    const saved = this.materialBookmark;
    if (this.pageName && uuid === this.rootUuid) await this.openPage(this.pageName); else await this.open(uuid);
    if (saved && this.readingScope() && sameLensScope(saved.scope, this.readingScope()!) && this.panel.visible) {
      this.renderer.restore(saved.bookmark); this.materialBookmark = null;
    }
  }
  async openCurrentWork(uuid?: string): Promise<void> {
    const ticket = ++this.navigationEpoch, graph = graphIdentity(await logseq.App.getCurrentGraph());
    const block = uuid ? await logseq.Editor.getBlock(uuid) : await logseq.Editor.getCurrentBlock();
    if (this.disposed || ticket !== this.navigationEpoch) return;
    if (!block) { this.fail(new Error("在 Logseq 选中工作标题或正文块，再点“打开当前块的工作”。")); return; }
    const trace = await this.readTrace(block.uuid, graph, () => ticket === this.navigationEpoch && !this.disposed);
    if (ticket !== this.navigationEpoch || this.disposed) return;
    await this.open(trace.objects.at(-1)?.uuid ?? block.uuid);
  }
  async openPage(name?: string): Promise<void> {
    const ticket=++this.navigationEpoch,page=name ? await logseq.Editor.getPage(name) : await logseq.Editor.getCurrentPage();
    if(this.disposed || ticket!==this.navigationEpoch)return;
    if(!page?.uuid || !page.name)throw new Error("当前页面暂不可读。");
    await this.enter(page.uuid,"page",panels.reserve(),String(page.originalName??page.name));
  }
  async openToolbar(): Promise<void> {
    const ticket=++this.navigationEpoch,graph=graphIdentity(await logseq.App.getCurrentGraph());
    const native=hostDocument()?.activeElement?.closest(".ls-block")?.getAttribute("blockid");
    const block=native ? await logseq.Editor.getBlock(native) : null,page=typeof logseq.Editor.getCurrentPage==="function" ? await logseq.Editor.getCurrentPage() : null;
    if(this.disposed || ticket!==this.navigationEpoch)return;
    if(block && (!page || block.page?.id===page.id)) {
      const trace=await this.readTrace(block.uuid,graph,()=>ticket===this.navigationEpoch&&!this.disposed);
      if(ticket!==this.navigationEpoch || this.disposed)return;
      if(trace.objects.length){await this.open(trace.objects.at(-1)!.uuid);return;}
    }
    const name=String(page?.originalName??page?.name??"");
    if(name && /(?:^|[\s/])(?:Project|Area)(?:[\s/:]|$)/iu.test(name)){await this.openPage(name);return;}
    this.saveReadingSession(this.panel.visible || this.report.nativeActive);
    this.invalidate();this.rootUuid=null;this.pageName=null;this.graph=graph;this.state=emptyPresentation();
    this.shell.mount(this.panel.root);this.renderHeading();this.renderEmpty();
    let saved;try{saved=JSON.parse(localStorage.getItem(`workbench:reading-session:${graph}`)??"null");}catch{ /* Fall back to the previous block entry. */ }
    const savedScope=saved?.schemaVersion===1 && saved.scope?.graphId===graph && typeof saved.scope.rootUuid==="string" && ["report","structure"].includes(saved.mode) ? saved.scope as SourceScope : null;
    const last=savedScope?.rootUuid ?? localStorage.getItem(`workbench:last:${graph}`);
    const source=savedScope?.kind==="page" && typeof savedScope.pageName==="string" ? await logseq.Editor.getPage(savedScope.pageName) : last ? await logseq.Editor.getBlock(last) : null;
    if(ticket!==this.navigationEpoch || this.disposed)return;
    if(source?.uuid && (savedScope?.kind==="page" || source.uuid===last)) {
      const title=savedScope?.kind==="page" ? String(savedScope.pageName) : "content" in source && typeof source.content==="string" ? workIdentity({graphId:graph,rootUuid:source.uuid},source.content).title : "上次工作";
      this.continuation={title,run:()=>savedScope ? this.restoreReadingSession(false) : this.open(source.uuid)};
      this.renderEmpty();
    }
    await this.panel.open();
  }
  private saveReadingSession(open: boolean): void {
    const scope=this.readingScope();if(!scope || this.disposed || this.historical || !this.panel.visible && !this.report.nativeActive)return;
    const bookmark=this.renderer.bookmark();
    try{localStorage.setItem(`workbench:reading-session:${scope.graphId}`,JSON.stringify({schemaVersion:1,scope,open,mode:this.report.read().mode,folds:this.report.sessionFolds(),bookmark:{uuid:bookmark.uuid,offset:bookmark.offset,scrollTop:bookmark.scrollTop,fallback:bookmark.fallback}}));}catch{ /* The live reading remains usable when storage is unavailable. */ }
  }
  async restoreReadingSession(requireOpen = true): Promise<void> {
    const graph=graphIdentity(await logseq.App.getCurrentGraph()),ticket=++this.navigationEpoch;
    let saved;try{saved=JSON.parse(localStorage.getItem(`workbench:reading-session:${graph}`)??"null");}catch{return;}
    if(!saved || saved.schemaVersion!==1 || requireOpen && !saved.open || saved.scope?.graphId!==graph || typeof saved.scope.rootUuid!=="string" || ![undefined,"page"].includes(saved.scope.kind) || saved.scope.kind==="page" && typeof saved.scope.pageName!=="string" || !["report","structure"].includes(saved.mode))return;
    const scope=saved.scope as SourceScope;
    const source=scope.kind==="page" ? await logseq.Editor.getPage(scope.pageName!) : await logseq.Editor.getBlock(scope.rootUuid);
    if(this.disposed || ticket!==this.navigationEpoch || !source?.uuid || scope.kind!=="page" && source.uuid!==scope.rootUuid)return;
    // File Graph page UUIDs can change on restart. Resolve the saved page name in
    // this Graph and read its current real identity; never retain a stale page UUID.
    const actualScope=scope.kind==="page" ? {...scope,rootUuid:source.uuid} : scope;
    await this.enter(actualScope.rootUuid,"restore",panels.reserve(),scope.kind==="page"?scope.pageName!:null);
    if(this.disposed || !this.panel.visible || !sameLensScope(actualScope,this.readingScope()!))return;
    await this.report.api.setMode(saved.mode);
    if(Array.isArray(saved.folds))this.report.restoreFolds(saved.folds);
    const b=saved.bookmark;
    if(b && (b.uuid===null || typeof b.uuid==="string") && Number.isFinite(b.offset) && Number.isFinite(b.scrollTop) && Array.isArray(b.fallback))this.renderer.restore({...b,fallback:b.fallback.filter((id:unknown)=>typeof id==="string"),focused:null});
    this.saveReadingSession(true);
  }
  get reviewing(): boolean { return this.reviewOpen && this.contentChoice === "body" && this.panel.visible; }
  async setReviewOpen(open: boolean): Promise<void> {
    if (!this.review || !this.rootUuid || this.pageName || this.disposed) return;
    if (this.contentChoice === "materials") await this.returnToBody();
    if (!open && this.review.leave && !this.review.leave()) { this.render(); return; }
    if (open) this.review.enter?.();
    this.reviewOpen = open; this.reviewHost.hidden = !open; this.render();
    if (!open) this.shell.focusReview();
  }
  private renderEmpty(): void {
    const guide = element("div", "", "wb-empty");
    guide.append(element("h2", "从 Logseq 的一份工作开始"), element("p", "先选中工作标题或任意正文块，再打开这里。正文在 Logseq 写作，材料和改动按需查看。"), button("打开当前块的工作", () => void this.openCurrentWork().catch(this.fail)));
    if(this.continuation){const entry=this.continuation;guide.append(button(`继续阅读：${entry.title}`,()=>void entry.run().catch(this.fail)));}
    this.content.replaceChildren(guide);
  }
  private renderHeading(): void {
    const rows = this.report.active ? this.report.rows ?? this.sourceRows : this.rows;
    const root = rows.find(row => row.uuid === this.rootUuid);
    const identity = this.rootUuid ? lookupBlockIdentity(this.rootUuid, this.graph) : null;
    const work = this.pageName && this.readingScope() ? {scope:this.readingScope()!,title:this.pageName,kind:"整页"} : this.rootUuid ? workIdentity({ graphId: this.graph, rootUuid: this.rootUuid }, root?.content ?? "正在读取工作…", identity?.kind === "FORMAL" ? identity : null) : null;
    const report = this.report?.read();
    const fragment = report?.fragments.find(fragment => fragment.target.blockUuid === this.rootUuid);
    if (work && fragment) { work.sourceId = fragment.sourceId; work.contentVersion = fragment.contentVersion; }
    const review = this.review?.navigation?.();
    const parent=this.trace.objects.filter(crumb=>crumb.uuid!==this.rootUuid && ["miniproject","mini_project"].includes(crumb.type)).at(-1);
    const disabled = !!this.pageName || !this.rootUuid || this.contentChoice === "materials" || this.historical || !!this.draft || this.renderer.composing || !!this.report?.composing;
    const actions: WorkShellAction[] = [
      { label: this.report?.active ? "查看原结构" : "阅读完整正文", description: this.report?.active ? "查看并调整展示排列；原文结构保持" : "完整原句的报告排版", disabled, run: async () => {
        const result = await this.report.api.setMode(this.report.active ? "structure" : "report"); if (!result.ok) throw new Error(result.reason);
      } },
      { label: "只看选定范围", description: "保留完整来源块；随时返回全文", disabled, run: async () => { await this.lenses.api.select(); } },
      { label: "重新读取正文", description: "从当前来源核对，保留安全保护", disabled, run: async () => { await this.refresh(); if (this.report.active) { const result = await this.report.api.refresh(); if (!result.ok) throw new Error(result.reason); } this.failure = ""; this.render(); } },
      { label: "显示原生页面", description: "继续当前原生输入，保留阅读位置", disabled: !this.rootUuid || this.contentChoice === "materials" || this.historical, preserveInputFocus: true, run: async () => {
        const result = await this.report.api.showNative(); if (!result.ok) throw new Error(result.reason);
      } },
    ];
    const reading=this.report.readingAPI.read();
    for(const plan of reading.plans)actions.push({group:"阅读方案",label:plan.name,description:plan.status==="current"?"保留完整原句与来源，切换读法":plan.status==="material-unavailable"?"关联材料需重新核验":"来源已变化，需要重新读取后编排",
      disabled:!this.readingScope()||this.historical||this.renderer.composing||this.report.composing||plan.status!=="current",
      run:async()=>{const result=await this.report.readingAPI.select(plan.planId);if(!result.ok)throw new Error(result.reason);}});
    if(reading.activePlanId)actions.push({group:"阅读方案",label:"返回默认全文读法",description:"保留来源，取消当前编排",disabled:this.historical||this.renderer.composing||this.report.composing,
      run:async()=>{const result=await this.report.readingAPI.select(null);if(!result.ok)throw new Error(result.reason);}});
    for (const crumb of this.trace.objects) if (crumb.uuid !== this.rootUuid) actions.push({ label: `打开上层工作：${crumb.title}`, run: () => this.enter(crumb.uuid, "breadcrumb"), disabled: !this.rootUuid || this.historical });
    actions.push({ label: this.followClicks ? "停止跟随工作对象点击" : "跟随工作对象点击", description: "默认固定当前工作；选中普通子块不会切换", disabled, run: () => { this.followClicks = !this.followClicks; this.renderHeading(); } }, ...this.contextActions());
    const notice = this.historical ? "只读版本 · 当前 Logseq 原文另行保留。收起审阅可回到当前正文。" : this.draft ? "原生输入尚未结束 · 当前输入保存后更新，阅读显示已保存原文。" : report?.status === "stale" ? "来源已变化 · 等待安全刷新，当前仍是上次读取内容。" : "";
    this.shell.render({ parent:parent ? {title:parent.title,run:()=>this.enter(parent.uuid,"breadcrumb")} : undefined, identity: work, content: this.contentChoice, structure: !this.report?.active, native: !!report?.native, draft: !!this.draft, historical: this.historical,
      review: this.reviewOpen, reviewAvailable: !!this.review && !this.pageName, reviewLabel: review?.attention ? "有改动 · 进入审阅" : "审阅与历史", attention: !!review?.attention, notice: notice || review?.notice || (this.contentChoice === "materials" ? this.failure : ""), actions });
  }
  private async openMaterials(): Promise<void> {
    const root = this.rootUuid, epoch = this.epoch;
    if (!root || this.disposed) return;
    this.rememberMaterials(this.readingScope()!);
    try { await this.onMaterials(this.rows.map(row => row.content).join("\n"), root); }
    catch (error) { if (this.valid(epoch)) this.fail(error); }
  }
  private render(): void {
    const rows=this.report.active ? this.report.rows ?? this.sourceRows : this.rows;
    const readingReport=this.report.compose(this.state,this.lenses.selection);
    const view = readingReport?.view ?? composeWorkView(rows, this.state, this.lenses.selection);
    const composedReview=this.review&&this.rootUuid&&!this.pageName?this.review.compose({scope:{graphId:this.graph,rootUuid:this.rootUuid},rows,state:this.state,view,editing:!!this.draft||this.renderer.composing||this.report.composing}):null;
    if (composedReview?.historical) this.reviewOpen = true;
    const review = this.reviewOpen ? composedReview : null;
    this.reviewHost.hidden = !this.reviewOpen;
    this.historical=!!review?.historical;
    this.renderHeading();
    const report=this.historical ? null : review && readingReport ? this.report.compose(this.state,this.lenses.selection,review.view) : readingReport;
    this.renderer.render(review?.rows??rows,review?.state??this.state,this.rawBodies,report?.view??review?.view??view,review??undefined,report??undefined);
    // Only a single-line object title can be represented by the source-mapped chrome.
    // Multi-line roots, ordinary prose and historical text remain in the report owner's body.
    const root = rows.find(row => row.uuid === this.rootUuid);
    const titleOnly = !!report && !this.historical && !!root && !!workObject(root.content) && root.content.split("\n").filter(line => line.trim() && !/^\s*[\w-]+::/.test(line)).length === 1 && !this.rawBodies.has(root.uuid);
    for (const node of Array.from(this.content.querySelectorAll<HTMLElement>(".wb-row"))) {
      const paragraph = node.querySelector<HTMLElement>(".wb-body > p:first-child");
      paragraph?.classList.toggle("wb-root-title-in-heading", titleOnly && node.dataset.uuid === this.rootUuid);
      node.classList.toggle("wb-root-heading-row", titleOnly && node.dataset.uuid === this.rootUuid);
    }
    this.lensBar.render(this.lenses.read());
    this.status.classList.toggle("wb-error", !!this.failure);
    const displayed = report?.view ?? review?.view ?? view;
    const reportState = this.report.read();
    const count = displayed.items.filter(item => !item.hidden).length;
    this.status.textContent = this.failure || (!this.sourceAvailable || this.report.active && reportState.status === "unavailable"
      ? "来源暂不可用 · 保留最后已知内容。可在工作选项中重新读取。"
      : count < displayed.items.length ? `显示 ${count} / ${displayed.items.length} 条 · 当前范围已收窄，可展开或返回完整内容。` : "");
    if (!this.rootUuid) this.renderEmpty();
  }
  private toggle(name: "collapsed" | "expanded", uuid: string): void {
    if (name === "collapsed") {
      if (this.report.active && !this.historical) { this.lenses.noteFold(uuid); this.report.toggleFold(uuid); return; }
      const folded = composeWorkView(this.rows, this.state, this.lenses.selection).items.find(item => item.uuid === uuid)?.folded ?? false;
      this.apply({ type: "collapse", uuid, collapsed: !folded, graph: this.graph, root: this.rootUuid, expectedSeq: this.seq }); return;
    }
    const state = copyPresentation(this.state), values = state.expanded;
    state.expanded = values.includes(uuid) ? values.filter(value => value !== uuid) : [...values, uuid];
    this.commitPresentation(state);
  }
  private async locate(uuid: string): Promise<void> {
    const result=await this.report.navigate(uuid);
    if (!result.ok) throw new Error(result.reason === "editing-in-progress" ? "请先结束原生输入，再切换原块。" : `原文暂不能打开：${result.reason}`);
  }
  dispose(): void {
    if (this.disposed) return;
    this.saveReadingSession(this.panel.visible || this.report.nativeActive);
    this.disposed = true; this.navigationEpoch++; this.invalidate();
    this.report.dispose(); this.shell.dispose();
    if (this.timer !== null) window.clearInterval(this.timer);
    for (const off of this.disposers) off(); void this.panel.close(true,"close",false).then(()=>this.panel.dispose());
  }
}
