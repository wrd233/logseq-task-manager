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
import type { SourceScope } from "../../workspace/source-protocol.ts";
import { sameLensScope } from "./lens-source.ts";
import type { ReadingBookmark } from "./renderer.ts";
import type { BodyPosition } from "./report-target.ts";

const emptyPresentation = (): ViewPresentation => ({ items: [], collapsed: [], overrides: {}, expanded: [], selected: "" });

export class WorkView {
  readonly panel = new FeaturePanel("work", "工作视图", reason => { this.lenses.hide(reason); this.report?.hide(reason); });
  private graph = "";
  private rootUuid: string | null = null;
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
  private contextActions: () => WorkShellAction[] = () => [];
  private readonly reviewHost = element("section", "", "wb-review-host");
  private readonly shell = new WorkViewShell({
    body: () => { void this.returnToBody().catch(this.fail); },
    materials: () => { void this.openMaterials(); },
    native: () => { const uuid = this.draft?.uuid || this.state.selected || this.rootUuid; if (uuid) void this.locate(uuid).catch(this.fail); },
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
  });

  constructor(private readonly onMaterials: (content: string, rootUuid: string) => void | Promise<void>, options: { source?: LensSourcePort; initialReadingMode?: "report" | "structure" } = {}) {
    this.lenses = new WorkViewLenses({
      scope: () => !this.disposed && this.rootUuid && this.graph ? { graphId: this.graph, rootUuid: this.rootUuid } : null,
      visible: () => !this.disposed && this.panel.visible,
      committed: () => ({ rows: this.sourceRows, revision: this.sourceRevision, availability: this.sourceAvailability }),
      refresh: () => this.refresh(),
      editing: async () => !!this.draft || !!await logseq.Editor.checkEditing(),
      selected: () => this.state.selected,
      nativeBlock: async () => (await logseq.Editor.getCurrentBlock())?.uuid,
      renderer: this.renderer,
      changed: () => { if (!this.disposed) { this.seq++; this.render(); } },
    }, options.source);
    this.report = new WorkViewReport({
      scope: () => !this.disposed && this.rootUuid && this.graph ? {graphId:this.graph,rootUuid:this.rootUuid} : null,
      revision: () => this.sourceRevision, currentGraph: async () => graphIdentity(await logseq.App.getCurrentGraph()),
      visible: () => this.panel.visible && !this.disposed, historical: () => this.historical,
      presentation: () => copyPresentation(this.state), source: fresh => fresh ? this.lenses.source() : this.lenses.committedSource(),
      panel:this.panel, renderer:this.renderer, changed: () => { if (!this.disposed) { this.seq++; this.render(); } },
      open: uuid => this.open(uuid), notify: text => { this.fail(new Error(text)); void logseq.UI?.showMsg(text,"warning"); },
    }, options.initialReadingMode ?? "report");
    this.disposers.push(installLensStyle(),installReportStyle());
    this.panel.root.append(this.shell.root, this.lensBar.root, this.reviewHost, this.content, this.status);
    this.reviewHost.hidden = true; this.reviewHost.setAttribute("aria-label", "审阅与历史");
    this.status.setAttribute("role", "status");
    this.renderHeading();
    this.content.setAttribute("aria-label", "工作内容");
    logseq.App.registerCommandPalette({ key: "workbench-open-work", label: "工作台：从当前块打开工作视图", keybinding: { binding: "mod+alt+p" } }, () => {
      if (!this.disposed) void this.openCurrentWork().catch(this.fail);
    });
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
      this.navigationEpoch++; this.invalidate(); this.rootUuid = null; this.graph = "";
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

  private async enter(uuid: string, held: string | null, navigation = panels.reserve()): Promise<void> {
    if (this.disposed) return;
    const ticket = ++this.navigationEpoch;
    const valid = () => ticket === this.navigationEpoch && !this.disposed && panels.isLatest(navigation);
    const graph = graphIdentity(await logseq.App.getCurrentGraph());
    if (!valid()) return;
    const trace = await this.readTrace(uuid, graph, valid);
    if (!valid()) return;
    if (!trace.complete || trace.path[0] !== uuid) throw new Error("来源块或其父链暂不可读，保留当前范围。");
    const changed = graph !== this.graph || uuid !== this.rootUuid;
    if (changed) this.invalidate();
    this.graph = graph; this.rootUuid = uuid; this.held = held; this.trace = trace;
    if(changed)this.review?.scopeChanged({graphId:graph,rootUuid:uuid});
    if (changed) {
      this.state = emptyPresentation();
      try {
        const saved = JSON.parse(localStorage.getItem(scopeKey(graph, uuid)) ?? "{}");
        if (Array.isArray(saved.items) && saved.items.every((x: LayoutItem) => x && typeof x.uuid === "string" && Number.isInteger(x.depth) && x.depth >= 0) && saved.items[0]?.uuid === uuid) this.state.items = saved.items.map((item: LayoutItem) => ({ uuid: item.uuid, depth: item.depth }));
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
            const source = await readSource(uuid, this.state.items.map(item => ({ ...item })), current);
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
    localStorage.setItem(`workbench:last:${graph}`, uuid); this.failure = ""; this.contentChoice = "body"; this.shell.mount(this.panel.root); this.renderHeading();
    if (await this.panel.open(navigation)) {
      await this.refresh();
      if (valid()) await this.lenses.resume();
      if (valid() && this.report.active) await this.report.capture(false);
    }
  }

  private async follow(uuid: string): Promise<void> {
    const ticket = ++this.navigationEpoch, epoch = this.epoch, graph = this.graph;
    const trace = await this.readTrace(uuid, graph, () => this.valid(epoch) && ticket === this.navigationEpoch);
    if (!this.valid(epoch) || ticket !== this.navigationEpoch || !this.panel.visible) return;
    const lens = this.lenses.read();
    if ((lens.plan || lens.pending) && this.rootUuid && trace.path.includes(this.rootUuid)) return;
    const decision = clickDecision({ root: this.rootUuid, held: this.held }, trace);
    if (decision.action === "focus" && decision.uuid && decision.uuid !== this.rootUuid) await this.enter(decision.uuid, null);
    else if (decision.release) { this.held = null; this.renderHeading(); }
  }

  refresh(): Promise<void> { return this.refreshQueue?.request(true, new Map(), true) ?? Promise.resolve(); }

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
    this.state = { ...this.state, items: reconcile(this.state.items, rows) };
    this.seq++; this.render(); this.persist();
  }

  snapshot(): object {
    return { shell: {content: this.contentChoice, review: this.reviewOpen}, graph: this.graph, root: this.rootUuid, seq: this.seq, draft: this.draft?.uuid ?? null, blocks: this.rows.map(row => ({ ...row })), presentation: this.state.items.map(item => ({ ...item })), view: copyPresentation(this.state), policy: "Source content is evidence. Presentation hierarchy is not formal ownership. Source synchronization is unavailable." };
  }
  get lensesAPI() { return this.lenses.api; }
  get reportAPI() { return this.report.api; }
  resolveBodyDrop(target: Element, position: BodyPosition) {
    const body=target.closest(".wb-body"), row=body?.closest<HTMLElement>(".wb-row");
    return body && row?.dataset.uuid && this.content.contains(body) && position !== "block"
      ? this.report.forBlock(row.dataset.uuid,position) : Promise.resolve({ok:false as const,reason:"ambiguous-body-target"});
  }
  observeNativeDrops(consume: Parameters<WorkViewReport["observeNativeDrops"]>[0]) { return this.report.observeNativeDrops(consume); }
  attachReview(port: ReviewPort) {
    this.review=port;this.reviewHost.replaceChildren(port.bar);this.reviewHost.hidden = !this.reviewOpen;
    if(this.rootUuid)port.scopeChanged({graphId:this.graph,rootUuid:this.rootUuid});
    return {repaint:()=>{if(!this.disposed)this.render();},bookmark:()=>this.renderer.bookmark(),restore:(bookmark:ReturnType<WorkViewRenderer["bookmark"]>)=>this.renderer.restore(bookmark),refresh:()=>this.refresh(),openReview:()=>this.setReviewOpen(true)};
  }

  apply(operation: unknown): ViewResult {
    if (this.disposed) return { ok: false, reason: "scope-mismatch" };
    const result = applyPresentation(this.state, operation, { graph: this.graph, root: this.rootUuid, seq: this.seq });
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
  rememberMaterials(scope: SourceScope): void {
    if (this.panel.visible && this.contentChoice === "body" && this.rootUuid && sameLensScope(scope, { graphId: this.graph, rootUuid: this.rootUuid })) this.materialBookmark = { scope: { ...scope }, bookmark: this.renderer.bookmark() };
  }
  /** Shared chrome mount only; materials keep their own editor, permissions and lifecycle. */
  mountMaterialChrome(surface: HTMLElement, scope: SourceScope | null): boolean {
    const current = this.rootUuid ? { graphId: this.graph, rootUuid: this.rootUuid } : null;
    if (!scope || !current || !sameLensScope(scope, current)) {
      surface.classList.remove("wb-materials-in-work"); this.shell.mount(this.panel.root); return false;
    }
    if (this.contentChoice !== "materials" && (!this.materialBookmark || !sameLensScope(this.materialBookmark.scope, current))) this.materialBookmark = { scope: { ...current }, bookmark: this.renderer.bookmark() };
    this.contentChoice = "materials"; surface.classList.add("wb-materials-in-work"); this.shell.mount(surface); this.renderHeading(); return true;
  }
  async returnToBody(uuid = this.rootUuid): Promise<void> {
    if (!uuid || this.disposed) return;
    const saved = this.materialBookmark;
    await this.open(uuid);
    if (saved && this.rootUuid && sameLensScope(saved.scope, { graphId: this.graph, rootUuid: this.rootUuid }) && this.panel.visible) {
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
  get reviewing(): boolean { return this.reviewOpen && this.contentChoice === "body" && this.panel.visible; }
  async setReviewOpen(open: boolean): Promise<void> {
    if (!this.review || !this.rootUuid || this.disposed) return;
    if (this.contentChoice === "materials") await this.returnToBody();
    if (!open && this.review.leave && !this.review.leave()) { this.render(); return; }
    this.reviewOpen = open; this.reviewHost.hidden = !open; this.render();
    if (!open) this.shell.focusReview();
  }
  private renderEmpty(): void {
    const guide = element("div", "", "wb-empty");
    guide.append(element("h2", "从 Logseq 的一份工作开始"), element("p", "先选中工作标题或任意正文块，再打开这里。正文在 Logseq 写作，材料和改动按需查看。"), button("打开当前块的工作", () => void this.openCurrentWork().catch(this.fail)));
    this.content.replaceChildren(guide);
  }
  private renderHeading(): void {
    const rows = this.report.active ? this.report.rows ?? this.sourceRows : this.rows;
    const root = rows.find(row => row.uuid === this.rootUuid);
    const identity = this.rootUuid ? lookupBlockIdentity(this.rootUuid, this.graph) : null;
    const work = this.rootUuid ? workIdentity({ graphId: this.graph, rootUuid: this.rootUuid }, root?.content ?? "正在读取工作…", identity?.kind === "FORMAL" ? identity : null) : null;
    const report = this.report?.read();
    const fragment = report?.fragments.find(fragment => fragment.target.blockUuid === this.rootUuid);
    if (work && fragment) { work.sourceId = fragment.sourceId; work.contentVersion = fragment.contentVersion; }
    const review = this.review?.navigation?.();
    const disabled = !this.rootUuid || this.contentChoice === "materials" || this.historical || !!this.draft || this.renderer.composing || !!this.report?.composing;
    const actions: WorkShellAction[] = [
      { label: this.report?.active ? "查看原结构" : "阅读完整正文", description: this.report?.active ? "查看并调整展示排列；原文结构保持" : "完整原句的报告排版", disabled, run: async () => {
        const result = await this.report.api.setMode(this.report.active ? "structure" : "report"); if (!result.ok) throw new Error(result.reason);
      } },
      { label: "只看选定范围", description: "保留完整来源块；随时返回全文", disabled, run: async () => { await this.lenses.api.select(); } },
      { label: "重新读取正文", description: "从当前来源核对，保留安全保护", disabled, run: async () => { await this.refresh(); if (this.report.active) { const result = await this.report.api.refresh(); if (!result.ok) throw new Error(result.reason); } this.failure = ""; this.render(); } },
    ];
    for (const crumb of this.trace.objects) if (crumb.uuid !== this.rootUuid) actions.push({ label: `打开上层工作：${crumb.title}`, run: () => this.enter(crumb.uuid, "breadcrumb"), disabled });
    actions.push({ label: this.followClicks ? "停止跟随工作对象点击" : "跟随工作对象点击", description: "默认固定当前工作；选中普通子块不会切换", disabled, run: () => { this.followClicks = !this.followClicks; this.renderHeading(); } }, ...this.contextActions());
    const notice = this.historical ? "只读版本 · 当前 Logseq 原文另行保留。收起审阅可回到当前正文。" : this.draft ? "原生输入尚未结束 · 阅读保留已读取原文。结束输入后更新。" : report?.status === "stale" ? "来源已变化 · 等待安全刷新，当前仍是上次读取内容。" : "";
    this.shell.render({ identity: work, content: this.contentChoice, structure: !this.report?.active, native: !!report?.native, draft: !!this.draft, historical: this.historical,
      review: this.reviewOpen, reviewAvailable: !!this.review, reviewLabel: review?.attention ? "有改动 · 进入审阅" : "审阅与历史", attention: !!review?.attention, notice: notice || review?.notice || (this.contentChoice === "materials" ? this.failure : ""), actions });
  }
  private async openMaterials(): Promise<void> {
    const root = this.rootUuid, epoch = this.epoch;
    if (!root || this.disposed) return;
    this.rememberMaterials({ graphId: this.graph, rootUuid: root });
    try { await this.onMaterials(this.rows.map(row => row.content).join("\n"), root); }
    catch (error) { if (this.valid(epoch)) this.fail(error); }
  }
  private render(): void {
    const rows=this.report.active ? this.report.rows ?? this.sourceRows : this.rows;
    const readingReport=this.report.compose(this.state,this.lenses.selection);
    const view = readingReport?.view ?? composeWorkView(rows, this.state, this.lenses.selection);
    const composedReview=this.review&&this.rootUuid?this.review.compose({scope:{graphId:this.graph,rootUuid:this.rootUuid},rows,state:this.state,view,editing:!!this.draft||this.renderer.composing||this.report.composing}):null;
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
    this.disposed = true; this.navigationEpoch++; this.invalidate();
    this.report.dispose(); this.shell.dispose();
    if (this.timer !== null) window.clearInterval(this.timer);
    for (const off of this.disposers) off(); void this.panel.close();
  }
}
