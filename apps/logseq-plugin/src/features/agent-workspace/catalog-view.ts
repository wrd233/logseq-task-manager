import { workKey } from "@task-copilot/contracts";
import type { NoteCatalogWork } from "./work-catalog.ts";
import { button, element, FeaturePanel, markNavigation } from "../../host/panel-host.ts";
import type { WorkView } from "../work-view/controller.ts";
import type { installCatalogPublisher } from "./catalog-publisher.ts";

type NoteCatalog = ReturnType<typeof installCatalogPublisher>;
type CatalogList = Awaited<ReturnType<NoteCatalog["read"]>>;

export class WorkCatalogView {
  private readonly panel = new FeaturePanel("work-search", "工作搜索");
  private readonly content = element("div", "", "wb-work-search");
  private readonly results = element("div", "", "wb-scroll wb-search-list");
  private readonly input = element("input");
  private readonly help = element("div", "", "wb-search-help");
  private readonly rows = element("ul", "", "wb-search-results");
  private readonly status = element("div", "", "wb-search-status");
  private readonly shortcuts = element("div", "", "wb-search-shortcuts");
  private readonly unsubscribe: () => void;
  private catalog: CatalogList | null = null;
  private request = 0;
  private focusedKey: string | null = null;
  private lastRemoved: NoteCatalogWork | null = null;
  private shown = "";
  private busy = false;

  constructor(private readonly notes: NoteCatalog, private readonly work: WorkView) {
    this.panel.root.setAttribute("aria-label", "工作搜索");
    this.input.hidden = true;
    this.input.type = "search";
    this.input.placeholder = "搜索工作";
    this.input.setAttribute("aria-label", "搜索工作");
    this.input.oninput = () => this.renderRows();
    this.input.onkeydown = event => {
      if (event.isComposing || event.key !== "ArrowDown" && event.key !== "Enter") return;
      const first = this.rows.querySelector<HTMLButtonElement>(".wb-search-entry");
      if (first) { event.preventDefault(); if (event.key === "Enter") first.click(); else first.focus(); }
    };
    this.status.setAttribute("role", "status");
    const heading = element("div", "", "wb-search-heading");
    heading.append(element("h2", "工作搜索"), this.help, this.input);
    this.results.append(this.rows);
    const footer = element("div", "", "wb-search-footer");
    this.shortcuts.append(button("加入当前页", () => void this.perform(() => notes.selectCurrentPage())));
    footer.append(this.status, this.shortcuts);
    this.content.append(heading, this.results, footer);
    this.panel.root.append(this.content);
    this.unsubscribe = notes.subscribe(() => { if (this.panel.visible) void this.load(); });
  }

  async open(): Promise<void> {
    if (!await this.panel.open()) return;
    markNavigation("发现已有工作");
    await this.load();
    if (!this.panel.visible) return;
    const row = Array.from(this.rows.children).find(node => (node as HTMLElement).dataset.key === this.focusedKey);
    const target = row?.querySelector<HTMLButtonElement>(".wb-search-entry") ??
      (this.input.hidden ? this.help.querySelector("button") : this.input);
    target?.focus({ preventScroll: true });
  }

  private async load(): Promise<void> {
    const request = ++this.request;
    try {
      const catalog = await this.notes.read();
      if (request !== this.request || !this.panel.visible) return;
      if (catalog.graphId !== this.catalog?.graphId) {
        this.input.value = ""; this.focusedKey = null; this.lastRemoved = null;
        this.status.replaceChildren();
      }
      const changeHelp = !this.catalog || catalog.enabled !== this.catalog.enabled;
      this.catalog = catalog;
      if (changeHelp) this.renderHelp();
      this.renderRows();
    } catch (error) {
      if (request !== this.request || !this.panel.visible) return;
      this.status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private renderHelp(): void {
    if (this.catalog?.enabled) { this.help.replaceChildren(); return; }
    const enable = button("开启自动发现", () => void this.perform(async () => {
      await this.notes.setEnabled(true);
    }).then(() => { if (this.panel.visible && this.catalog?.enabled) this.input.focus({ preventScroll: true }); }));
    enable.className = "wb-primary";
    this.help.replaceChildren(element("p", "用已有的项目标签和工作标记找到笔记。收录保存在工作搜索中。"), enable);
  }

  private renderRows(): void {
    const query = this.input.value.trim().toLocaleLowerCase();
    const works = (this.catalog?.works ?? []).filter(work =>
      query.split(/\s+/u).every(word => `${work.title} ${work.location} ${work.reason ?? ""}`.toLocaleLowerCase().includes(word)));
    works.sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, "zh-CN"));
    const visible = works.slice(0, 100), enabled = !!this.catalog?.enabled;
    this.input.hidden = !enabled && !visible.length;
    const signature = JSON.stringify([visible.map(work => [work.workRef, work.title, work.reason, work.location, work.pageSourceUuid]), query, enabled, works.length > visible.length]);
    if (signature === this.shown) return;
    this.shown = signature;
    const focused = document.activeElement as HTMLElement | null;
    const row = focused?.closest<HTMLElement>(".wb-search-results > li");
    const key = row?.dataset.key, action = focused?.dataset.action;
    const scrollTop = this.results.scrollTop;
    const nodes = visible.map(work => this.renderWork(work));
    if (!visible.length && (query || enabled)) {
      nodes.push(element("li", query ? "没有找到匹配的工作。" : "还没有匹配的笔记。你也可以加入当前页。", "wb-search-empty"));
    } else if (works.length > visible.length) {
      nodes.push(element("li", "输入名称以缩小搜索范围。", "wb-search-empty"));
    }
    this.rows.replaceChildren(...nodes);
    this.results.scrollTop = scrollTop;
    if (key) {
      const replacement = nodes.find(node => node.dataset.key === key);
      const sameAction = Array.from(replacement?.querySelectorAll("button") ?? []).find(item => item.dataset.action === action);
      (sameAction ?? this.input).focus({ preventScroll: true });
    }
  }

  private renderWork(work: NoteCatalogWork): HTMLLIElement {
    const row = element("li", "", "wb-search-row");
    const key = workKey(work.workRef);
    row.dataset.key = key;
    const missing = work.workRef.kind === "logseq" && work.workRef.sourceKind === "page" && !work.pageSourceUuid;
    const open = button("", () => void this.perform(async () => {
      this.focusedKey = key;
      if (missing) { await this.notes.selectCurrentPage(false, work); return; }
      const source = await this.notes.resolve(work);
      if (!source) throw new Error("暂时找不到原笔记，请刷新后再试。");
      if (source.kind === "page") await this.work.openPage(source.name, true);
      else await this.work.open(source.uuid, true);
      this.work.focusReading();
    }));
    open.className = "wb-search-entry";
    open.dataset.action = "read";
    open.title = work.title;
    open.append(element("span", work.title, "wb-search-title"), element("small", missing ? "找不到原笔记 · 用当前页重新关联" : work.reason ?? work.location));
    const original = button("原文", () => void this.perform(async () => {
      this.focusedKey = key;
      const source = await this.notes.resolve(work);
      if (!source) throw new Error("暂时找不到原笔记。");
      if (await logseq.Editor.checkEditing()) throw new Error("请先结束当前输入，再打开另一篇笔记。");
      await this.panel.close();
      await logseq.App.pushState("page", { name: source.name }, source.kind === "block" ? { anchor: `block-content-${source.uuid}` } : undefined);
    }));
    original.dataset.action = "source"; original.title = "打开原文"; original.setAttribute("aria-label", `打开原文 · ${work.title}`); original.hidden = missing;
    const remove = button("移出", () => void this.perform(async () => {
      await this.notes.setExcluded(work, true); this.lastRemoved = work;
    }));
    remove.dataset.action = "remove"; remove.title = "移出工作搜索"; remove.setAttribute("aria-label", `移出工作搜索 · ${work.title}`);
    row.append(open, original, remove);
    return row;
  }

  private async perform(operation: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await operation();
      if (!this.panel.visible) return;
      await this.load();
      if (this.lastRemoved) {
        const removed = this.lastRemoved;
        this.status.replaceChildren(element("span", `已移出 ${removed.title}`), button("撤销", () => void this.perform(async () => {
          await this.notes.setExcluded(removed, false); this.lastRemoved = null;
        })));
      } else this.status.replaceChildren();
    } catch (error) {
      if (this.panel.visible) this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally { this.busy = false; }
  }

  dispose(): void { this.request++; this.unsubscribe(); void this.panel.dispose(); }
}
