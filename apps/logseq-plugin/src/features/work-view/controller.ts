import { button, element, FeaturePanel, markNavigation, showCurrentWorkEntry } from "../../host/panel-host.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { lookupBlockIdentity } from "../../block-identity.ts";
import { ancestry, workObject, type AncestryBlock, type Trace } from "./focus.mjs";
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
import type { ReadingBookmark, ReadingFocus } from "./renderer.ts";
import type { BodyPosition } from "./report-target.ts";
import { logseqSourceReader } from "../../workspace/logseq-source.ts";
import type { ReadingMaterialPort } from "./reading-layout.ts";
import { WorkReadingAI, type ReadingAiPort } from "./reading-ai.ts";
import { rememberPageWork, workPositionKey } from "../../workspace/page-identity.ts";

const emptyPresentation = (): ViewPresentation => ({ items: [], collapsed: [], overrides: {}, expanded: [], selected: "" });
interface RecentReading {title:string;excerpt:string;scope:SourceScope}

export class WorkView {
  readonly panel = new FeaturePanel("work", "工作视图", reason => { this.saveReadingSession(reason === "close" ? false : true); this.lenses.hide(reason); this.report?.hide(reason); });
  private graph = "";
  private rootUuid: string | null = null;
  private pageName: string | null = null;
  private readonly source: LensSourcePort;
  private readingScope(): SourceScope | null { return this.rootUuid && this.graph ? {graphId:this.graph,rootUuid:this.rootUuid,...(this.pageName ? {kind:"page" as const,pageName:this.pageName} : {})} : null; }
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
  private materialTarget:SourceScope|null=null;
  private reviewOpen = false;
  private browsingPage = "";
  private initialBrowsingPage = "";
  private workOriginPage = "";
  private failure = "";
  private discoverWorks: (() => void) | null = null;
  private contextActions: () => WorkShellAction[] = () => [];
  private readonly reviewHost = element("section", "", "wb-review-host");
  private readonly shell = new WorkViewShell({
    body: () => { void this.returnToBody().catch(this.fail); },
    materials: () => { void this.openMaterials(); },
    native: () => { const uuid = this.draft?.uuid ?? (this.pageName ? this.sourceRows[0]?.uuid : this.rootUuid); if (uuid) void this.locate(uuid).catch(this.fail); else if(this.pageName)void this.report.openPageReference(this.pageName).catch(this.fail); },
    review: () => { void this.setReviewOpen(!this.reviewOpen).catch(this.fail); },
    changed: () => this.renderHeading(),
    fail: error => this.fail(error),
  });
  private readonly content = element("div", "", "wb-scroll");
  private readonly status = element("div", "", "wb-status");
  private readonly lenses: WorkViewLenses;
  private review: ReviewPort | null = null;
  private readonly report: WorkViewReport;
  private readingAI:WorkReadingAI|null=null;
  private historical = false;
  private readonly lensBar = new LensBar({
    back: () => { void this.lenses.api.back(); },
    cancel: () => { this.lenses.api.cancel(); },
    exit: () => { this.lenses.api.exit(); },
  });
  private readonly renderer = new WorkViewRenderer(this.content, {
    operation: op => { this.apply({ ...op, graph: this.graph, root: this.rootUuid, expectedSeq: this.seq }); },
    toggle: (name, uuid, collapsed) => this.toggle(name, uuid, collapsed),
    raw: uuid => { if (this.rawBodies.has(uuid)) this.rawBodies.delete(uuid); else this.rawBodies.add(uuid); this.seq++; this.render(); },
    locate: (uuid, control) => { void this.locate(uuid, control).catch(this.fail); },
    pageReference: name => { void this.report.openPageReference(name).catch(this.fail); },
    enter: uuid => { void this.enter(uuid).catch(this.fail); },
    range: uuid => { void this.lenses.api.select(uuid); },
    repaint: () => { if (!this.disposed) { this.report.sourceChanged(); this.render(); } },
    reviewEdit: (uuid,container,suggest) => this.review?.edit(uuid,container,suggest),
    material:id=>{void this.report.openReadingMaterial(id).catch(this.fail);},
    candidate:anchor=>this.readingAI?.reviewCandidate(anchor),
    fileClick:event=>this.report.delegateFileClick(event),
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
    const unregisterTidy = logseq.Editor.registerBlockContextMenuItem("工作台：整理此段笔记", async ({ uuid }) => {
      if (this.disposed) return;
      try {
        if (!this.panel.visible || !this.sourceRows.some(row => row.uuid === uuid)) {
          await this.openCurrentWork(uuid);
        }
        if (!this.disposed) await this.tidyNotes(uuid);
      } catch (error) {
        this.fail(error);
      }
    });
    if (typeof unregisterTidy === "function") this.disposers.push(unregisterTidy);
    logseq.App.registerCommandPalette({ key: "workbench-focus-range", label: "工作台（高级）：限定当前块范围" }, () => {
      if (!this.disposed) void logseq.Editor.getCurrentBlock().then(block => this.lenses.api.select(block?.uuid)).catch(this.fail);
    });
    logseq.App.registerCommandPalette({ key: "workbench-exit-lens", label: "工作台：返回完整内容" }, () => {
      if (!this.disposed) this.lenses.api.exit();
    });
    logseq.App.registerCommandPalette({key:"workbench-return-report",label:"工作台：返回当前文章",keybinding:{binding:"mod+alt+r"}},() => {
      if (!this.disposed) void this.report.api.resume().then(result => { if (!result.ok) this.fail(new Error(result.reason === "editing-in-progress" ? "请先完成当前写作，再返回文章。" : "文章暂不能恢复，请重新打开当前工作。")); }).catch(this.fail);
    });
    const readingKey = (event: KeyboardEvent) => {
      if (event.isComposing || this.renderer.composing || (event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
      if (event.key === "ArrowLeft" && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey &&
          this.panel.visible && this.discoverWorks) {
        event.preventDefault(); event.stopPropagation();
        void this.returnToSearch().catch(this.fail);
      }
      if (event.key === "Escape" && !this.lensBar.root.hidden) {
        event.preventDefault(); event.stopPropagation();
        if (this.lenses.read().pending) this.lenses.api.cancel(); else this.lenses.api.exit();
      }
    };
    this.panel.root.addEventListener("keydown", readingKey);
    this.disposers.push(() => this.panel.root.removeEventListener("keydown", readingKey));
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
      void this.refreshBrowsing().catch(()=>undefined);
      if (Date.now() - this.lastTreeRead >= 5_000) {
        this.lastTreeRead = Date.now(); void this.refreshActiveSource().catch(this.fail);
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
    this.materialBookmark = null;this.materialTarget=null; this.reviewOpen = false; this.reviewHost.hidden = true; this.contentChoice = "body"; this.failure = ""; this.shell.closeMenu();
    this.rawBodies.clear(); this.renderer.clear(); this.sourceAvailable = false; this.sourceAvailability = "unavailable"; this.sourceRevision++;
    this.browsingPage="";this.initialBrowsingPage="";this.workOriginPage="";
  }
  private async readTrace(uuid: string, graph = this.graph, valid = () => !this.disposed): Promise<Trace> {
    return ancestry(uuid, async id => valid() ? await logseq.Editor.getBlock(id) as AncestryBlock | null : null, { resolve: (id, content) => {
      const identity = lookupBlockIdentity(id, graph);
      return identity.kind === "FORMAL" ? { type: identity.objectKind.toLowerCase(), title: identity.title ?? content.split("\n")[0] ?? "工作" } : workObject(content);
    } });
  }

  async open(uuid?: string, fromSearch = false): Promise<void> {
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
    await this.enter(selected, navigation, null, fromSearch);
  }

  private async enter(uuid: string, navigation = panels.reserve(), pageName: string | null = null, _fromSearch = false): Promise<void> {
    void _fromSearch;
    if (this.disposed) return;
    const ticket = ++this.navigationEpoch;
    const valid = () => ticket === this.navigationEpoch && !this.disposed && panels.isLatest(navigation);
    const currentGraph=await logseq.App.getCurrentGraph(),graph = graphIdentity(currentGraph);
    if (!valid()) return;
    const page=pageName ? await logseq.Editor.getPage(pageName) : null;
    const trace = pageName ? {path:[uuid],objects:[],complete:page?.uuid===uuid} : await this.readTrace(uuid, graph, valid);
    if (!valid()) return;
    if (!trace.complete || trace.path[0] !== uuid) throw new Error("来源块或其父链暂不可读，保留当前范围。");
    const changed = graph !== this.graph || uuid !== this.rootUuid || pageName !== this.pageName;
    if (changed) {this.saveReadingSession(true);this.invalidate();}
    this.graph = graph; this.rootUuid = uuid; this.pageName=pageName; this.trace = trace;
    if(pageName)rememberPageWork(this.readingScope()!,currentGraph?.path??graph);
    const savedPosition=changed?this.loadWorkPosition(this.readingScope()!):null;
    this.report.scopeChanged();
    if(changed)this.report.preferArticle();
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
      if (changed&&valid()) await this.restoreWorkPosition(this.readingScope()!,savedPosition);
      if (valid()) void this.refreshBrowsing().catch(()=>undefined);
      if (valid()) this.saveReadingSession(true);
    }
  }

  private async refreshBrowsing():Promise<void> {
    const epoch=this.epoch,root=this.rootUuid;if(!root||!this.panel.visible)return;
    const page=await logseq.Editor.getCurrentPage();if(!this.valid(epoch))return;
    const browsing=String(page?.originalName??page?.name??"");
    if(!this.workOriginPage){
      const block=this.pageName?null:await logseq.Editor.getBlock(root),origin=block?.page?.id?await logseq.Editor.getPage(block.page.id):null;
      if(!this.valid(epoch))return;
      this.workOriginPage=this.pageName??String(origin?.originalName??origin?.name??"");
    }
    if(!this.initialBrowsingPage)this.initialBrowsingPage=browsing;
    if(browsing!==this.browsingPage){this.browsingPage=browsing;this.renderHeading();}
  }

  private refreshSource(): Promise<void> { return this.refreshQueue?.request(true, new Map(), true) ?? Promise.resolve(); }
  /** Logseq may return the cached page UUID at startup, then replace it during
   * file Graph indexing. Follow the same named page, not the native browsing
   * location, after the actual host identity settles. */
  private async followPageIdentity():Promise<boolean>{
    const scope=this.readingScope(),navigation=panels.activeToken("work"),epoch=this.navigationEpoch;
    if(scope?.kind!=="page"||navigation===null||!this.panel.visible||this.draft||this.report.nativeActive||this.report.composing||this.renderer.composing)return false;
    const valid=()=>!this.disposed&&this.panel.visible&&epoch===this.navigationEpoch&&panels.isLatest(navigation)&&!this.draft&&!this.report.nativeActive&&!this.report.composing&&!this.renderer.composing;
    const page=await logseq.Editor.getPage(scope.pageName!);
    if(!valid()||!page?.uuid||page.uuid===scope.rootUuid)return false;
    if(graphIdentity(await logseq.App.getCurrentGraph())!==scope.graphId||!valid())return false;
    await this.enter(page.uuid,navigation,scope.pageName!);return true;
  }
  private async refreshActiveSource():Promise<void>{
    if(!await this.followPageIdentity())await this.refreshQueue?.request(true);
  }
  async refresh(): Promise<void> {
    if(await this.followPageIdentity())return;
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
    return { shell: {content: this.contentChoice, review: this.reviewOpen}, graph: this.graph, root: this.pageName ? null : this.rootUuid, readingScope:this.readingScope(), browsingPage:this.browsingPage, seq: this.seq, draft: this.draft?.uuid ?? null, blocks: this.rows.map(row => ({ ...row })), presentation: this.state.items.map(item => ({ ...item })), view: copyPresentation(this.state), policy: "Source content is evidence. Presentation hierarchy is not formal ownership. Source synchronization is unavailable." };
  }
  get lensesAPI() { return this.lenses.api; }
  get reportAPI() { return this.report.api; }
  get readingAPI() { return this.report.readingAPI; }
  setReadingMaterials(port:ReadingMaterialPort|null):void {this.report.setReadingMaterials(port);}
  async openAssociatedNote(id:string):Promise<void>{await this.returnToBody();await this.report.openReadingMaterial(id);}
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
  setReadingAI(port:ReadingAiPort):void {
    this.readingAI?.dispose();this.readingAI=new WorkReadingAI(this.report.readingAPI,port,{locate:uuid=>void this.locate(uuid).catch(this.fail),material:id=>void this.report.openReadingMaterial(id).catch(this.fail),refresh:()=>this.refresh()});
    this.panel.root.insertBefore(this.readingAI.root,this.content);this.renderHeading();
  }
  async tidyNotes(targetRootUuid?: string): Promise<void> {
    if (!this.readingAI) throw new Error("整理助手未启用。");
    await this.readingAI.tidyLeftNotes(targetRootUuid);
  }
  async openTidySnapshots(): Promise<void> {
    if (!this.readingAI) throw new Error("整理助手未启用。");
    await this.readingAI.openTidySnapshots();
  }
  async navigateFromCompanion(
    scope: SourceScope,
    options: { intent?: string; blockUuid?: string; proposalId?: string } = {}
  ): Promise<{ navigated: boolean; intent: string; openedReview: boolean }> {
    if (this.disposed) throw new Error("WORKBENCH_DISPOSED");
    const currentGraph = graphIdentity(await logseq.App.getCurrentGraph());
    if (currentGraph !== scope.graphId) throw new Error("SCOPE_MISMATCH");
    const intent = options.intent ?? "open-work";
    const active = this.readingScope();
    if (!this.panel.visible || !active || !sameLensScope(active, scope) || this.contentChoice !== "body") {
      if (scope.kind === "page" && scope.pageName) await this.openPage(scope.pageName);
      else await this.open(scope.rootUuid);
    }
    if (this.disposed) return { navigated: false, intent, openedReview: false };
    let openedReview = false;
    const pushOriginPage = async () => {
      if (!this.workOriginPage) return;
      try { await Promise.resolve(logseq.App.pushState("page", { name: this.workOriginPage })); } catch { /* ignore */ }
    };
    if (intent === "review-writeback") {
      const editing = await logseq.Editor.checkEditing();
      const editingInWork = typeof editing === "string" && this.sourceRows.some(row => row.uuid === editing);
      if (!this.draft && this.workOriginPage && !editingInWork) {
        if (typeof editing === "string" && typeof logseq.Editor.exitEditingMode === "function") {
          await logseq.Editor.exitEditingMode(false).catch(() => undefined);
        }
        await pushOriginPage();
        await new Promise<void>(resolve => window.setTimeout(resolve, 60));
      }
      openedReview = (await this.readingAI?.openWritebackProposal(options.proposalId)) ?? false;
    } else if (intent === "review-candidate") {
      openedReview = (await this.readingAI?.openCandidateReview()) ?? false;
    } else if (intent === "open-block") {
      await this.locate(options.blockUuid ?? scope.rootUuid).catch(async () => {
        if (this.workOriginPage && !(await logseq.Editor.checkEditing())) {
          await pushOriginPage();
        }
      });
    } else {
      if (!this.draft && !(await logseq.Editor.checkEditing())) {
        await this.locate(scope.rootUuid).catch(async () => {
          await pushOriginPage();
        });
      }
    }
    try { window.focus?.(); } catch { /* Best effort focus inside Electron renderer */ }
    return { navigated: true, intent, openedReview };
  }
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
    if(!current||!actual||actual.graphId!==current.graphId)return;
    this.materialTarget=actual;
    if (this.panel.visible && this.contentChoice === "body") this.materialBookmark = { scope: { ...current }, bookmark: this.renderer.bookmark(true) };
  }
  /** Legacy material associations carry a UUID only. Restore page metadata only
   * from this already verified active page, never from an external caller. */
  private materialScope(scope:SourceScope|null):SourceScope|null {
    const current=this.readingScope();return scope&&current?.kind==="page"&&scope.kind===undefined&&scope.graphId===current.graphId&&scope.rootUuid===current.rootUuid?current:scope;
  }
  /** Shared chrome mount only; materials keep their own editor, permissions and lifecycle. */
  mountMaterialChrome(surface: HTMLElement, scope: SourceScope | null): boolean {
    const current = this.readingScope();scope=this.materialScope(scope);
    if (!scope || !current || scope.graphId!==current.graphId||!sameLensScope(scope,current)&&(!this.materialTarget||!sameLensScope(scope,this.materialTarget))) {
      surface.classList.remove("wb-materials-in-work"); this.shell.mount(this.panel.root); return false;
    }
    if (this.panel.visible&&this.contentChoice !== "materials" && (!this.materialBookmark || !sameLensScope(this.materialBookmark.scope, current))) this.materialBookmark = { scope: { ...current }, bookmark: this.renderer.bookmark(true) };
    this.contentChoice = "materials"; surface.classList.add("wb-materials-in-work"); this.shell.mount(surface); markNavigation("当前工作"); this.renderHeading(); return true;
  }
  private async returnToSearch(): Promise<void> {
    const epoch = this.epoch;
    if (this.report.composing || this.renderer.composing || await logseq.Editor.checkEditing()) {
      void logseq.UI.showMsg("请先结束原生输入，再返回工作搜索。", "warning");
      return;
    }
    if (this.valid(epoch) && !this.shell.root.closest("[hidden]")) this.discoverWorks?.();
  }
  async returnToBody(uuid = this.rootUuid): Promise<void> {
    if(this.contentChoice==="materials"&&this.rootUuid)uuid=this.rootUuid;
    if (!uuid || this.disposed) return;
    const saved = this.materialBookmark;
    if (!saved && uuid === this.rootUuid && this.report.nativeActive) {
      const result = await this.report.api.resume();
      if (!result.ok) throw new Error(result.reason==="editing-in-progress"?"请先完成当前写作，再返回文章。":"文章暂不能恢复，请打开当前工作后重试。");
      return;
    }
    if (this.pageName && uuid === this.rootUuid) await this.openPage(this.pageName); else await this.open(uuid);
    if (saved && this.readingScope() && sameLensScope(saved.scope, this.readingScope()!) && this.panel.visible) {
      this.renderer.restore(saved.bookmark); this.materialBookmark = null;
    }
    this.materialTarget=null;
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
  async openPage(name?: string, fromSearch = false): Promise<void> {
    const ticket=++this.navigationEpoch,page=name ? await logseq.Editor.getPage(name) : await logseq.Editor.getCurrentPage();
    if(this.disposed || ticket!==this.navigationEpoch)return;
    if(!page?.uuid || !page.name)throw new Error("当前页面暂不可读。");
    await this.enter(page.uuid,panels.reserve(),String(page.originalName??page.name),fromSearch);
  }
  async openToolbar(): Promise<void> {
    const ticket=++this.navigationEpoch,current=await logseq.App.getCurrentGraph();
    if(!current)throw Error("请先打开一个 Logseq 笔记库。");
    const graph=graphIdentity(current);
    if(ticket!==this.navigationEpoch||this.disposed)return;
    if(this.rootUuid&&this.graph===graph){
      if(!this.panel.visible||this.report.nativeActive||this.contentChoice!=="body")await this.returnToBody();
      return;
    }
    if(this.discoverWorks){this.discoverWorks();return;}
    await this.openPage();
  }
  private saveReadingSession(open: boolean): void {
    const scope=this.readingScope();if(!scope || this.disposed || this.historical || !this.panel.visible && !this.report.nativeActive)return;
    const bookmark=this.report.sessionBookmark(),title=this.pageName??workIdentity(scope,this.sourceRows.find(row=>row.uuid===scope.rootUuid)?.content??"工作").title;
    const excerpt=this.renderer.stopExcerpt()||this.sourceRows.find(row=>row.uuid===bookmark.uuid)?.content?.replace(/\s+/gu," ").slice(0,100)||"";
    const previous=this.loadWorkPosition(scope)?.bookmark;
    const progressiveFocus=bookmark.progressiveFocus??(bookmark.progressiveKey&&previous?.progressiveKey===bookmark.progressiveKey&&Math.abs(previous.scrollTop-bookmark.scrollTop)<=1?previous.progressiveFocus:undefined);
    try{const position=JSON.stringify({schemaVersion:1,scope,open,mode:this.report.read().mode,title,excerpt,...this.report.sessionFolds(),bookmark:{uuid:bookmark.uuid,offset:bookmark.offset,scrollTop:bookmark.scrollTop,fallback:bookmark.fallback,progressiveKey:bookmark.progressiveKey,progressiveFocus}});
      localStorage.setItem(this.positionKey(scope),position);localStorage.setItem(`workbench:reading-session:${scope.graphId}`,position);
      const recent:RecentReading={scope,title,excerpt};
      const others=this.recentReadings(scope.graphId).filter(item=>workPositionKey(item.scope)!==this.positionKey(scope));
      localStorage.setItem(`workbench:recent-work:${scope.graphId}`,JSON.stringify([recent,...others].slice(0,8)));
    }catch{ /* The live reading remains usable when storage is unavailable. */ }
  }
  private positionKey(scope:SourceScope){return workPositionKey(scope);}
  private loadWorkPosition(scope:SourceScope){try{return JSON.parse(localStorage.getItem(this.positionKey(scope))??"null");}catch{return null;}}
  private async restoreWorkPosition(scope:SourceScope,saved:ReturnType<WorkView["loadWorkPosition"]>){
    if(!saved||saved.schemaVersion!==1)return;
    if(Array.isArray(saved.folds))this.report.restoreFolds(saved.folds,Array.isArray(saved.unfolded)?saved.unfolded:[]);
    const b=saved.bookmark,focus=!await logseq.Editor.checkEditing();
    if(!this.readingScope()||!sameLensScope(this.readingScope()!,scope))return;
    if(b&&(b.uuid===null||typeof b.uuid==="string")&&Number.isFinite(b.scrollTop)&&Number.isFinite(b.offset)&&Array.isArray(b.fallback)){
      const uuid=scope.kind==="page"&&saved.scope?.rootUuid!==scope.rootUuid&&!this.sourceRows.some(row=>row.uuid===b.uuid)?null:b.uuid;
      this.renderer.restore({...b,uuid,fallback:b.fallback.filter((id:unknown)=>typeof id==="string"),focused:null},[],focus);
    }
  }
  lastReading(graphId:string):{title:string;excerpt:string;scope:SourceScope}|null {
    try{const value=JSON.parse(localStorage.getItem(`workbench:reading-session:${graphId}`)??"null");return value?.scope?.graphId===graphId&&value.title?{title:value.title,excerpt:value.excerpt??"",scope:value.scope}:null;}catch{return null;}
  }
  recentReadings(graphId:string):RecentReading[] {
    try {
      const saved=JSON.parse(localStorage.getItem(`workbench:recent-work:${graphId}`)??"[]") as RecentReading[];
      const last=this.lastReading(graphId);
      return last?[last,...saved.filter(item=>workPositionKey(item.scope)!==workPositionKey(last.scope))]:saved;
    }catch{return [];}
  }
  async resumeRecent(scope:SourceScope):Promise<void>{
    if(scope.graphId!==graphIdentity(await logseq.App.getCurrentGraph()))throw Error("请切回这份工作的笔记库。");
    if(scope.kind==="page")await this.openPage(scope.pageName,true);else await this.open(scope.rootUuid,true);
    this.focusReading();
  }
  async restoreReadingSession(requireOpen = true): Promise<void> {
    if(this.disposed)return;
    const ticket=++this.navigationEpoch,current=await logseq.App.getCurrentGraph();
    // A fresh normal installation has no Graph until the user chooses one.
    // This is absence, not an identity to restore or a malformed Graph to adopt.
    if(this.disposed||ticket!==this.navigationEpoch||current===null||current===undefined)return;
    const graph=graphIdentity(current);
    let saved;try{saved=JSON.parse(localStorage.getItem(`workbench:reading-session:${graph}`)??"null");}catch{return;}
    if(!saved || saved.schemaVersion!==1 || requireOpen && !saved.open || saved.scope?.graphId!==graph || typeof saved.scope.rootUuid!=="string" || ![undefined,"page"].includes(saved.scope.kind) || saved.scope.kind==="page" && typeof saved.scope.pageName!=="string" || !["report","structure"].includes(saved.mode))return;
    const scope=saved.scope as SourceScope;
    const source=scope.kind==="page" ? await logseq.Editor.getPage(scope.pageName!) : await logseq.Editor.getBlock(scope.rootUuid);
    if(this.disposed || ticket!==this.navigationEpoch || !source?.uuid || scope.kind!=="page" && source.uuid!==scope.rootUuid)return;
    // File Graph page UUIDs can change on restart. Resolve the saved page name in
    // this Graph and read its current real identity; never retain a stale page UUID.
    const actualScope=scope.kind==="page" ? {...scope,rootUuid:source.uuid} : scope;
    await this.enter(actualScope.rootUuid,panels.reserve(),scope.kind==="page"?scope.pageName!:null);
    if(this.disposed || !this.panel.visible || !sameLensScope(actualScope,this.readingScope()!))return;
    await this.restoreWorkPosition(actualScope,saved);
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
    this.status.textContent = "";
    const guide = element("div", "", "wb-empty wb-start-reading");
    const current = button("阅读当前页", () => void this.openPage().then(() => this.focusReading()).catch(this.fail));
    current.className = "wb-primary"; guide.append(current);
    if (this.discoverWorks) guide.append(button("找工作", this.discoverWorks));
    this.content.replaceChildren(guide);
  }
  setWorkSearch(open: () => void): void { this.discoverWorks = open; }
  focusReading(): void {
    if (!this.panel.visible) return;
    if(this.content.contains(document.activeElement))return;
    const title = this.panel.root.querySelector<HTMLElement>(".wb-work-title");
    if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
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
    const disabled = !this.rootUuid || this.contentChoice === "materials" || this.historical || !!this.draft || this.renderer.composing || !!this.report?.composing;
    const reading=this.report.readingAPI.read();
    this.readingAI?.render(this.readingScope(),this.panel.visible&&this.contentChoice==="body"&&!this.historical,!!reading.briefing,this.report.composing||this.renderer.composing);
    const actions: WorkShellAction[] = [
      {label: "显示 Logseq 页面", disabled: !this.rootUuid || this.contentChoice === "materials" || this.historical, preserveInputFocus: true, run: async () => {
        const result = await this.report.api.showNative(); if (!result.ok) throw new Error(result.reason);
        if(!this.draft && this.workOriginPage && !await logseq.Editor.checkEditing()) await logseq.App.pushState("page",{name:this.workOriginPage});
      } },
    ];
    if(this.review&&!this.pageName)actions.push({label: "阶段记录与确认",...(review?.attention?{description:"有阶段记录待核对"}:{}),disabled:this.reviewOpen,run:()=>this.setReviewOpen(true)});
    for(const plan of reading.plans)if(plan.planId!==reading.activePlanId)actions.push({group:"阅读成果与版本",label:plan.name,description:plan.status==="current"?"查看已保存成果":"查看保留的旧稿",
      disabled:disabled||!plan.progressive&&plan.status!=="current",
      run:async()=>{const result=await this.report.readingAPI.select(plan.planId);if(!result.ok)throw new Error(result.reason);}});
    const currentReading=reading.plans.find(plan=>plan.planId===reading.activePlanId);
    if(currentReading?.canRestore)actions.push({group:"阅读成果与版本",label:"恢复上一版文章",disabled,
      run:async()=>{const result=await this.report.readingAPI.restore(currentReading.planId);if(!result.ok)throw new Error(result.reason);}});
    if(currentReading&&!currentReading.progressive)actions.push({group:"阅读成果与版本",label:"回到原文",disabled,run:async()=>{const result=await this.report.readingAPI.select(null);if(!result.ok)throw new Error(result.reason);}});
    for (const crumb of this.trace.objects) if (crumb.uuid !== this.rootUuid && crumb.uuid!==parent?.uuid) actions.push({group:"上层工作",label: crumb.title, run: () => this.enter(crumb.uuid), disabled: !this.rootUuid || this.historical });
    actions.push(...this.contextActions());
    actions.push({group:"维护",label:"重新读取原文",description:"核对当前已保存记录",disabled,run:async()=>{await this.refresh();const result=await this.report.api.refresh();if(!result.ok)throw Error(result.reason);this.failure="";this.render();}});
    const notice = this.contentChoice === "materials" ? this.failure : this.historical ? "正在查看阶段历史。结束审阅可回到当前文章。" : this.draft ? "写作完成后这里会更新。" : report?.status === "stale" ? "正在重新读取原文…" : "";
    showCurrentWorkEntry(!!work);
    this.shell.root.hidden = !work;
    this.shell.render({ browsing:this.browsingPage&&this.browsingPage!==this.workOriginPage&&(report?.native||this.browsingPage!==this.initialBrowsingPage)?this.browsingPage:"", parent:parent ? {title:parent.title,run:()=>this.enter(parent.uuid)} : undefined, identity: work, content: this.contentChoice, native: !!report?.native, draft: !!this.draft, historical: this.historical,
      review: this.reviewOpen, reviewAvailable: !!this.review && !this.pageName, attention: !!review?.attention, notice: (this.contentChoice === "materials" ? this.failure : (reading.persistenceError?"文章未能保存，请保持窗口打开。":"") || notice || (this.reviewOpen ? review?.notice ?? "" : "")), actions });
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
      : !rows.length ? "这篇笔记还没有内容，可在 Logseq 开始写作。" : displayed.focused && count < displayed.items.length ? `显示 ${count} / ${displayed.items.length} 条 · 当前范围已收窄，可返回完整内容。` : "");
    if (!this.rootUuid) this.renderEmpty();
  }
  private toggle(name: "collapsed" | "expanded", uuid: string, collapsed?: boolean): void {
    if (name === "collapsed") {
      if (this.report.active && !this.historical) { this.lenses.noteFold(uuid); this.report.setFold(uuid, !!collapsed); return; }
      this.apply({ type: "collapse", uuid, collapsed: !!collapsed, graph: this.graph, root: this.rootUuid, expectedSeq: this.seq }); return;
    }
    const state = copyPresentation(this.state), values = state.expanded;
    state.expanded = values.includes(uuid) ? values.filter(value => value !== uuid) : [...values, uuid];
    this.commitPresentation(state);
  }
  private async locate(uuid: string, control?: ReadingFocus["control"]): Promise<void> {
    if (!this.report.composing && !this.renderer.composing && typeof logseq.Editor.exitEditingMode === "function") {
      const editing = await logseq.Editor.checkEditing();
      if (typeof editing === "string" && editing !== uuid) {
        await logseq.Editor.exitEditingMode(false).catch(() => undefined);
        for (let i = 0; i < 6 && await logseq.Editor.checkEditing(); i++) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 15));
        }
        this.draft = null;
      }
    }
    const result=await this.report.navigate(uuid, control);
    if (!result.ok) throw new Error(result.reason === "editing-in-progress" ? "请先完成当前写作，再打开另一原块。" : "原文暂不能打开，请重新读取当前记录后再试。");
  }
  dispose(): void {
    if (this.disposed) return;
    this.saveReadingSession(this.panel.visible || this.report.nativeActive);
    this.disposed = true; this.navigationEpoch++; this.invalidate();
    this.readingAI?.dispose();this.report.dispose(); this.shell.dispose();
    if (this.timer !== null) window.clearInterval(this.timer);
    for (const off of this.disposers) off(); void this.panel.close(true,"close",false).then(()=>this.panel.dispose());
  }
}
