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

const emptyPresentation = (): ViewPresentation => ({ items: [], collapsed: [], overrides: {}, expanded: [], selected: "" });

export class WorkView {
  readonly panel = new FeaturePanel("work", "工作视图", reason => this.lenses.hide(reason));
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
  private readonly heading = element("div", "", "wb-heading");
  private headingSignature = "";
  private readonly content = element("div", "", "wb-scroll");
  private readonly status = element("div", "", "wb-status");
  private readonly lenses: WorkViewLenses;
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
    repaint: () => { if (!this.disposed) this.render(); },
  });

  constructor(private readonly onMaterials: (content: string, rootUuid: string) => void | Promise<void>, options: { source?: LensSourcePort } = {}) {
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
    this.disposers.push(installLensStyle());
    this.panel.root.append(this.heading, this.lensBar.root, this.content, this.status);
    this.content.setAttribute("aria-label", "工作内容");
    logseq.App.registerCommandPalette({ key: "workbench-open-work", label: "工作台：从当前块打开工作视图", keybinding: { binding: "mod+alt+p" } }, () => {
      if (!this.disposed) void logseq.Editor.getCurrentBlock().then(block => this.open(block?.uuid)).catch(this.fail);
    });
    const unregister = logseq.Editor.registerBlockContextMenuItem("工作台：从此块打开工作视图", ({ uuid }) => this.open(uuid));
    if (typeof unregister === "function") this.disposers.push(unregister);
    logseq.App.registerCommandPalette({ key: "workbench-focus-range", label: "工作台：只看当前块范围" }, () => {
      if (!this.disposed) void logseq.Editor.getCurrentBlock().then(block => this.lenses.api.select(block?.uuid)).catch(this.fail);
    });
    logseq.App.registerCommandPalette({ key: "workbench-exit-lens", label: "工作台：返回完整内容" }, () => {
      if (!this.disposed) this.lenses.api.exit();
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
      if (!this.panel.visible || this.disposed) return;
      const uuid = (event.target as Element | null)?.closest?.(".ls-block")?.getAttribute("blockid");
      if (uuid) void this.follow(uuid).catch(this.fail);
    };
    doc?.addEventListener("click", clicked, true); this.disposers.push(() => doc?.removeEventListener("click", clicked, true));
    this.disposers.push(logseq.App.onCurrentGraphChanged(() => {
      if (this.disposed) return;
      this.navigationEpoch++; this.invalidate(); this.rootUuid = null; this.graph = "";
      this.state = emptyPresentation(); this.heading.replaceChildren(); void this.panel.close();
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
    this.status.textContent = error instanceof Error ? error.message : String(error); this.status.classList.add("wb-error");
  };
  private valid(epoch: number): boolean { return epoch === this.epoch && !this.disposed; }
  private invalidate(): void {
    this.epoch++; this.seq++; this.draftEpoch++; this.refreshQueue?.stop(); this.refreshQueue = null;
    this.sourceRows = []; this.rows = []; this.draft = null; this.draftReading = null;
    this.lenses.reset(); this.lensBar.render(this.lenses.read());
    this.headingSignature = "";
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
    if (!selected) throw new Error("请先选择一个 Logseq 块，再打开工作视图。");
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
    localStorage.setItem(`workbench:last:${graph}`, uuid); this.renderHeading();
    if (await this.panel.open(navigation)) {
      await this.refresh();
      if (valid()) await this.lenses.resume();
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
    if (changed) void this.lenses.sourceChanged();
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
    return { graph: this.graph, root: this.rootUuid, seq: this.seq, draft: this.draft?.uuid ?? null, blocks: this.rows.map(row => ({ ...row })), presentation: this.state.items.map(item => ({ ...item })), view: copyPresentation(this.state), policy: "Source content is evidence. Presentation hierarchy is not formal ownership. Source synchronization is unavailable." };
  }
  get lensesAPI() { return this.lenses.api; }

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
  private renderHeading(): void {
    const signature = JSON.stringify([this.graph, this.rootUuid, this.trace.objects, this.held]);
    if (this.headingSignature === signature) return;
    this.headingSignature = signature;
    this.heading.replaceChildren(element("strong", "工作视图"));
    for (const crumb of this.trace.objects) this.heading.append(button(crumb.title, () => void this.enter(crumb.uuid, "breadcrumb").catch(this.fail)));
    if (this.held) this.heading.append(button("恢复自动聚焦", () => { this.held = null; this.renderHeading(); }));
    this.heading.append(button("只看选定范围", () => { void this.lenses.api.select(); }), button("材料", () => { void this.openMaterials(); }), button("关闭", () => void this.panel.close()));
  }
  private async openMaterials(): Promise<void> {
    const root = this.rootUuid, epoch = this.epoch;
    if (!root || this.disposed) return;
    try { await this.onMaterials(this.rows.map(row => row.content).join("\n"), root); }
    catch (error) { if (this.valid(epoch)) this.fail(error); }
  }
  private render(): void {
    const view = composeWorkView(this.rows, this.state, this.lenses.selection);
    this.renderer.render(this.rows, this.state, this.rawBodies, view);
    this.lensBar.render(this.lenses.read());
    this.status.classList.remove("wb-error");
    this.status.textContent = `${this.draft ? "含编辑草稿" : this.sourceAvailable ? "来源已读取" : "来源暂不可用 · 保留视图位置"} · ${this.state.items.length} 条 · 排列仅保存在视图中`;
  }
  private toggle(name: "collapsed" | "expanded", uuid: string): void {
    if (name === "collapsed") {
      const folded = composeWorkView(this.rows, this.state, this.lenses.selection).items.find(item => item.uuid === uuid)?.folded ?? false;
      this.apply({ type: "collapse", uuid, collapsed: !folded, graph: this.graph, root: this.rootUuid, expectedSeq: this.seq }); return;
    }
    const state = copyPresentation(this.state), values = state.expanded;
    state.expanded = values.includes(uuid) ? values.filter(value => value !== uuid) : [...values, uuid];
    this.commitPresentation(state);
  }
  private async locate(uuid: string): Promise<void> {
    const epoch = this.epoch, block = await logseq.Editor.getBlock(uuid);
    if (!this.valid(epoch)) return;
    if (!block) throw new Error("来源暂不可用。");
    const page = await logseq.Editor.getPage(block.page.id);
    if (this.valid(epoch) && page) logseq.Editor.scrollToBlockInPage(page.originalName ?? page.name, uuid);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.navigationEpoch++; this.invalidate();
    if (this.timer !== null) window.clearInterval(this.timer);
    for (const off of this.disposers) off(); void this.panel.close();
  }
}
