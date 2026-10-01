import DOMPurify from "dompurify";
import { marked } from "./vendor/marked.js";
import { button, element, FeaturePanel, hostDocument } from "../../host/panel-host.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { taskIdentity } from "../task-center/controller.ts";
import { ancestry, clickDecision, workObject, type AncestryBlock, type Trace } from "./focus.mjs";
import { displayLevel, levels, savedLevels } from "./display.mjs";
import { indent, move, reconcile, type LayoutItem, type SourceRow } from "./model.mjs";
import { scopeKey } from "../../workspace/context.ts";
import { panels } from "../../workspace/context.ts";
import { applyPresentation, type ViewResult } from "./operations.ts";

interface Presentation { items: LayoutItem[]; collapsed: string[]; overrides: Record<string, string>; expanded: string[]; selected: string }

function flatten(value: unknown, depth = 0, parent: string | null = null, out: SourceRow[] = []): SourceRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const block = value as Record<string, unknown>;
  if (typeof block.uuid !== "string") return out;
  out.push({ uuid: block.uuid, depth, sourceParent: parent, content: typeof block.content === "string" ? block.content : typeof block.title === "string" ? block.title : "" });
  if (Array.isArray(block.children)) for (const child of block.children) flatten(child, depth + 1, block.uuid, out);
  return out;
}

export class WorkView {
  readonly panel = new FeaturePanel("work", "工作视图");
  private graph = "";
  private rootUuid: string | null = null;
  private held: string | null = null;
  private trace: Trace = { path: [], objects: [], complete: false };
  private rows: SourceRow[] = [];
  private state: Presentation = { items: [], collapsed: [], overrides: {}, expanded: [], selected: "" };
  private epoch = 0;
  private seq = 0;
  private readEpoch = 0;
  private timer: number | null = null;
  private disposed = false;
  private draft: string | null = null;
  private readonly rawBodies = new Set<string>();
  private readonly disposers: Array<() => void> = [];
  private readonly heading = element("div", "", "wb-heading");
  private readonly content = element("div", "", "wb-scroll");
  private readonly status = element("div", "", "wb-status");

  constructor(private readonly onMaterials: (content: string, rootUuid: string) => void) {
    this.panel.root.append(this.heading, this.content, this.status);
    this.content.setAttribute("aria-label", "工作内容");
    logseq.App.registerCommandPalette({ key: "workbench-open-work", label: "工作台：从当前块打开工作视图", keybinding: { binding: "mod+alt+p" } }, () => void logseq.Editor.getCurrentBlock().then(block => this.open(block?.uuid)).catch(this.fail));
    const unregister = logseq.Editor.registerBlockContextMenuItem("工作台：从此块打开工作视图", ({ uuid }) => this.open(uuid));
    if (typeof unregister === "function") this.disposers.push(unregister);
    const doc = hostDocument();
    const clicked = (event: MouseEvent) => {
      if (!this.panel.visible || this.disposed) return;
      const uuid = (event.target as Element | null)?.closest?.(".ls-block")?.getAttribute("blockid");
      if (uuid) void this.follow(uuid).catch(this.fail);
    };
    doc?.addEventListener("click", clicked, true); this.disposers.push(() => doc?.removeEventListener("click", clicked, true));
    this.disposers.push(logseq.App.onCurrentGraphChanged(() => {
      this.epoch++; this.rootUuid = null; this.rows = []; this.graph = ""; void this.panel.close();
    }));
    this.disposers.push(logseq.DB.onChanged(() => { if (this.panel.visible) void this.refresh().catch(this.fail); }));
    this.timer = window.setInterval(() => { if (this.panel.visible) void this.refresh().catch(this.fail); }, 650);
  }

  private fail = (error: unknown): void => { this.status.textContent = error instanceof Error ? error.message : String(error); this.status.classList.add("wb-error"); };

  private async readTrace(uuid: string): Promise<Trace> {
    return ancestry(uuid, async id => await logseq.Editor.getBlock(id) as AncestryBlock | null, { resolve: (id, content) => {
      const identity = taskIdentity(id);
      return identity.kind === "FORMAL" ? { type: identity.objectKind.toLowerCase(), title: identity.title ?? content.split("\n")[0] ?? "工作" } : workObject(content);
    } });
  }

  async open(uuid?: string): Promise<void> {
    const navigation = panels.reserve();
    const graph = graphIdentity(await logseq.App.getCurrentGraph());
    const last = localStorage.getItem(`workbench:last:${graph}`);
    const selected = uuid ?? this.rootUuid ?? last ?? (await logseq.Editor.getCurrentBlock())?.uuid;
    if (!selected) throw new Error("请先选择一个 Logseq 块，再打开工作视图。");
    await this.enter(selected, "explicit", navigation);
  }

  private async enter(uuid: string, held: string | null, navigation = panels.reserve()): Promise<void> {
    const epoch = ++this.epoch;
    const graph = graphIdentity(await logseq.App.getCurrentGraph());
    const trace = await this.readTrace(uuid);
    if (epoch !== this.epoch || this.disposed || !panels.isLatest(navigation)) return;
    if (!trace.complete || trace.path[0] !== uuid) throw new Error("来源块或其父链暂不可读，保留当前范围。");
    const changed = graph !== this.graph || uuid !== this.rootUuid;
    this.graph = graph; this.rootUuid = uuid; this.held = held; this.trace = trace;
    if (changed) {
      this.rows = []; this.state = { items: [], collapsed: [], overrides: {}, expanded: [], selected: "" };
      this.rawBodies.clear();
      try {
        const saved = JSON.parse(localStorage.getItem(scopeKey(graph, uuid)) ?? "{}");
        if (Array.isArray(saved.items) && saved.items.every((x: LayoutItem) => typeof x.uuid === "string" && Number.isInteger(x.depth) && x.depth >= 0) && saved.items[0]?.uuid === uuid) this.state.items = saved.items;
        for (const name of ["collapsed", "expanded"] as const) if (Array.isArray(saved[name])) this.state[name] = saved[name].filter((x: unknown) => typeof x === "string");
        this.state.overrides = savedLevels(saved.overrides);
        this.state.selected = typeof saved.selected === "string" ? saved.selected : "";
      } catch { this.status.textContent = "布局记录不可读，已保留原记录并恢复来源排列。"; }
    }
    localStorage.setItem(`workbench:last:${graph}`, uuid);
    if (await this.panel.open(navigation)) await this.refresh();
  }

  private async follow(uuid: string): Promise<void> {
    const epoch = ++this.epoch, graph = this.graph, trace = await this.readTrace(uuid);
    if (epoch !== this.epoch || graph !== this.graph || !this.panel.visible) return;
    const decision = clickDecision({ root: this.rootUuid, held: this.held }, trace);
    if (decision.action === "focus" && decision.uuid && decision.uuid !== this.rootUuid) await this.enter(decision.uuid, null);
    else if (decision.release) this.held = null;
  }

  async refresh(): Promise<void> {
    const uuid = this.rootUuid, epoch = this.epoch, ticket = ++this.readEpoch;
    if (!uuid || this.disposed) return;
    const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
    if (epoch !== this.epoch || ticket !== this.readEpoch) return;
    const rows = flatten(block);
    const known = new Set(rows.map(row => row.uuid));
    for (const item of this.state.items) if (!known.has(item.uuid)) {
      const retained = await logseq.Editor.getBlock(item.uuid);
      if (epoch !== this.epoch || ticket !== this.readEpoch) return;
      rows.push({ uuid: item.uuid, content: retained?.content ?? "来源暂不可用 · 保留此位置", depth: 0, outside: !!retained, missing: !retained });
    }
    const editing = await logseq.Editor.checkEditing();
    let draft: string | null = null;
    if (typeof editing === "string" && rows.some(row => row.uuid === editing)) {
      const text = await logseq.Editor.getEditingBlockContent();
      if (await logseq.Editor.checkEditing() === editing && typeof text === "string") {
        const row = rows.find(row => row.uuid === editing); if (row) row.content = text; draft = editing;
      }
    }
    if (epoch !== this.epoch || ticket !== this.readEpoch) return;
    if (JSON.stringify(rows) === JSON.stringify(this.rows) && draft === this.draft && this.content.childElementCount) return;
    this.rows = rows; this.draft = draft; this.seq++;
    this.state.items = reconcile(this.state.items, rows); this.render(); this.persist();
  }

  snapshot(): object {
    return { graph: this.graph, root: this.rootUuid, seq: this.seq, draft: this.draft, blocks: this.rows, presentation: this.state.items, view: this.state, policy: "Source content is evidence. Presentation hierarchy is not formal ownership. Source synchronization is unavailable." };
  }

  apply(operation: unknown): ViewResult {
    const result = applyPresentation(this.state, operation, {graph: this.graph, root: this.rootUuid, seq: this.seq});
    if (result.ok) { this.state = result.state; this.render(); this.persist(); }
    return result;
  }

  private persist(): void {
    if (!this.rootUuid) return;
    try { localStorage.setItem(scopeKey(this.graph, this.rootUuid), JSON.stringify(this.state)); }
    catch { this.fail(new Error("布局保存失败，请保持窗口打开。")); }
  }

  private render(): void {
    this.seq++;
    const scroll = this.content.scrollTop;
    this.heading.replaceChildren(element("strong", "工作视图"));
    for (const crumb of this.trace.objects) this.heading.append(button(crumb.title, () => void this.enter(crumb.uuid, "breadcrumb").catch(this.fail)));
    if (this.held) this.heading.append(button("恢复自动聚焦", () => { this.held = null; this.render(); }));
    this.heading.append(button("材料", () => this.rootUuid && this.onMaterials(this.rows.map(row => row.content).join("\n"), this.rootUuid)), button("关闭", () => void this.panel.close()));
    this.content.replaceChildren();
    const source = new Map(this.rows.map(row => [row.uuid, row]));
    let hiddenDepth: number | null = null;
    this.state.items.forEach((item, index) => {
      if (hiddenDepth !== null && item.depth <= hiddenDepth) hiddenDepth = null;
      if (hiddenDepth !== null) return;
      const row = source.get(item.uuid); if (!row) return;
      const node = element("article", "", "wb-row"); node.dataset.uuid = item.uuid; node.tabIndex = 0;
      node.classList.toggle("selected", this.state.selected === item.uuid);
      node.style.setProperty("--depth", String(item.depth));
      node.dataset.display = displayLevel(row.content, this.state.overrides[item.uuid], { root: index === 0, missing: !!row.missing }).level;
      const grip = button("⠿", () => undefined); grip.className = "wb-grip"; grip.disabled = index === 0; grip.setAttribute("aria-label", "拖动视图条目");
      let startX = 0;
      grip.onpointerdown = event => { if (grip.disabled) return; event.preventDefault(); startX = event.clientX; grip.setPointerCapture(event.pointerId); };
      grip.onpointerup = event => {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".wb-row");
        if (target?.dataset.uuid) { const mode = event.clientX - startX > 24 ? "child" : event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2 ? "after" : "before"; this.state.items = move(this.state.items, item.uuid, target.dataset.uuid, mode); this.render(); this.persist(); }
      };
      const child = (this.state.items[index + 1]?.depth ?? -1) > item.depth;
      const folded = this.state.collapsed.includes(item.uuid);
      const fold = button(child ? folded ? "▸" : "▾" : "·", () => { this.toggle("collapsed", item.uuid); }); fold.disabled = !child; fold.setAttribute("aria-label", folded ? "展开子项" : "折叠子项");
      const body = element("div", "", "wb-body"); body.classList.toggle("expanded", this.state.expanded.includes(item.uuid));
      body.innerHTML = DOMPurify.sanitize(marked.parse(row.content.replace(/^\s*id::[^\n]*(?:\n|$)/gm, ""), { breaks: true }) as string, { FORBID_TAGS: ["img", "iframe", "style", "input", "button"], FORBID_ATTR: ["style"] });
      const controls = element("div", "", "wb-controls");
      const select = element("select"); select.setAttribute("aria-label", "展示级别");
      const labels = ["自动", "强调", "正常", "弱化", "压缩"];
      levels.forEach((level, i) => { const option = element("option", labels[i] ?? level); option.value = level; select.append(option); });
      select.value = this.state.overrides[item.uuid] ?? "auto";
      select.onchange = () => { if (select.value === "auto") delete this.state.overrides[item.uuid]; else this.state.overrides[item.uuid] = select.value; this.render(); this.persist(); };
      controls.append(select, button("全文 / 收起", () => this.toggle("expanded", item.uuid)), button("原文", () => void this.locate(item.uuid).catch(this.fail)));
      controls.append(button("原始文本", () => { if (this.rawBodies.has(item.uuid)) this.rawBodies.delete(item.uuid); else this.rawBodies.add(item.uuid); this.render(); }));
      if (workObject(row.content) && index) controls.append(button("进入", () => void this.enter(item.uuid, null).catch(this.fail)));
      node.append(grip, fold, body, controls);
      if (this.rawBodies.has(item.uuid)) { const raw = element("pre", row.content); raw.style.gridColumn = "3"; raw.style.whiteSpace = "pre-wrap"; node.append(raw); }
      node.onkeydown = event => {
        if ((event.target as HTMLElement).closest("button,select,a")) return;
        if (event.key === "Tab") { event.preventDefault(); this.state.items = indent(this.state.items, item.uuid, event.shiftKey ? -1 : 1); this.render(); this.persist(); this.content.querySelector<HTMLElement>(`[data-uuid="${item.uuid}"]`)?.focus(); }
      };
      this.content.append(node);
      if (folded) hiddenDepth = item.depth;
    });
    this.content.scrollTop = scroll;
    this.status.classList.remove("wb-error");
    this.status.textContent = `${this.draft ? "含编辑草稿" : "来源已读取"} · ${this.state.items.length} 条 · 排列仅保存在视图中`;
  }

  private toggle(name: "collapsed" | "expanded", uuid: string): void {
    const values = this.state[name]; this.state[name] = values.includes(uuid) ? values.filter(value => value !== uuid) : [...values, uuid]; this.render(); this.persist();
  }

  private async locate(uuid: string): Promise<void> {
    const block = await logseq.Editor.getBlock(uuid); if (!block) throw new Error("来源暂不可用。");
    const page = await logseq.Editor.getPage(block.page.id); if (page) logseq.Editor.scrollToBlockInPage(page.originalName ?? page.name, uuid);
  }

  dispose(): void { this.disposed = true; this.epoch++; if (this.timer !== null) window.clearInterval(this.timer); for (const off of this.disposers) off(); void this.panel.close(); }
}
