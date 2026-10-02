import { button, element, FeaturePanel, hostDocument } from "../../host/panel-host.ts";
import { desktopBridge, desktopFiles } from "../../host/desktop-files.ts";
import { MaterialDirectories, type MaterialWorkContext } from "../../workspace/material-context.ts";
import { MaterialService, type CaptureRequest, type MaterialResult, type MaterialView } from "./service.ts";
import { captureMarkdown } from "./conversion.ts";
import { materialPrompt, renderReading, roleLabel } from "./ui.ts";
import { MaterialSourceActions } from "./source.ts";
import { panels } from "../../workspace/context.ts";
import { MaterialStore, ConflictError, normalizeRoot, idFrom, restoreCapture, titleOf, associationsOf, type MaterialRecord } from "./store.ts";

interface MarkdownEditor { getValue(): string; setValue(text: string, clearStack?: boolean): void; destroy(): void }
interface EditorConstructor { new (root: HTMLElement, options: Record<string, unknown>): MarkdownEditor }
export interface DirectoryObservationPort {
  available(context: MaterialWorkContext): boolean;
  list(context: MaterialWorkContext): Promise<{files: Array<{path:string;kind:string;availability:string;materialId:string|null}>;truncated:boolean}>;
  read(path:string,context:MaterialWorkContext):Promise<{content?:string|null;reason?:string;read?:string}>;
  associate(path:string,context:MaterialWorkContext):Promise<MaterialResult>;
}

export class Materials {
  private directoryObserver:DirectoryObservationPort|null=null;
  setDirectoryObserver(port:DirectoryObservationPort|null):void {this.directoryObserver=port;}
  readonly panel: FeaturePanel;
  private store: MaterialStore | null = null;
  private service: MaterialService | null = null;
  private readonly directories = new MaterialDirectories(localStorage);
  private mode: "reading" | "editing" = "reading";
  private graph = "";
  private current: MaterialRecord | null = null;
  private editor: MarkdownEditor | null = null;
  private editorDocument: string | null = null;
  private base = "";
  private canonical = "";
  private suppress = false;
  private composing = false;
  private epoch = 0;
  private saveTimer: number | null = null;
  private saving: Promise<void> | null = null;
  private pollBusy = false;
  private stableExternal: string | null = null;
  private inputUntil = 0;
  private disposed = false;
  private notifiedError: string | null = null;
  private contextUuid: string | null = null;
  private readonly heading = element("div", "", "wb-heading");
  private readonly body = element("div", "", "wb-scroll");
  private readonly editorRoot = element("div", "", "wb-editor");
  private readonly conflict = element("div", "", "wb-conflict");
  private readonly status = element("div", "", "wb-status");
  private readonly disposers: Array<() => void> = [];
  private readonly timer: number;
  private readonly sources = new MaterialSourceActions({epoch: () => this.epoch, graph: () => this.graph, assertScope: epoch => this.assertScope(epoch), service: () => this.ensureService(), workContext: uuid => this.workContext(uuid), fail: error => this.fail(error)});

  constructor(private readonly returnWork?: (uuid: string) => Promise<void>, private readonly currentWorkRoot?: () => string | null) {
    this.panel = new FeaturePanel("materials", "材料", () => this.leave());
    this.editorRoot.id = "workbench-markdown-editor"; this.editorRoot.hidden = true; this.conflict.hidden = true;
    this.conflict.append(element("p", "检测到外部版本变化，当前草稿已保留。"), button("另存草稿并继续", () => void this.keepDraft(false).catch(this.fail)), button("另存草稿后加载外部版本", () => void this.keepDraft(true).catch(this.fail)));
    this.panel.root.append(this.heading, this.conflict, this.body, this.editorRoot, this.status);
    logseq.App.registerCommandPalette({ key: "workbench-materials", label: "工作台：打开材料库" }, () => void this.library().catch(this.fail));
    logseq.App.registerCommandPalette({ key: "workbench-link-file", label: "工作台：关联已有文件" }, () => void this.associate().catch(this.fail));
    logseq.App.registerCommandPalette({ key: "workbench-capture-text", label: "工作台：收纳当前块长文本" }, () => {
      const epoch = this.epoch;
      void this.sources.captureCurrentBlock().then(async result => { this.assertScope(epoch); this.contextUuid = result.material.sourceUuid; await this.openDoc(result.material.id); if (result.status === "partial") this.message(result.problem ?? "引用未插入。"); }).catch(this.fail);
    });
    logseq.App.registerCommandPalette({ key: "workbench-bind-material-directory", label: "工作台：绑定当前工作的材料目录" }, () => void this.bindCurrentDirectory().catch(this.fail));
    const doc = hostDocument();
    const link = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a,[data-href]");
      const id = idFrom(anchor?.getAttribute("href") ?? anchor?.getAttribute("data-href") ?? "");
      if (!id) return; event.preventDefault(); event.stopImmediatePropagation(); this.contextUuid = (event.target as Element | null)?.closest(".ls-block")?.getAttribute("blockid") ?? this.currentWorkRoot?.() ?? this.contextUuid; void this.openDoc(id).catch(this.fail);
    };
    const paste = (event: ClipboardEvent) => this.sources.onPaste(event);
    doc?.addEventListener("click", link, true); document.addEventListener("click", link, true); doc?.addEventListener("paste", paste, true);
    this.disposers.push(() => { doc?.removeEventListener("click", link, true); document.removeEventListener("click", link, true); doc?.removeEventListener("paste", paste, true); });
    this.disposers.push(logseq.App.onCurrentGraphChanged(() => { this.preserveDraft(); this.cancelSave(); this.composing = false; this.epoch++; this.current = null; this.mode = "reading"; this.store = null; this.service = null; this.contextUuid = null; void this.panel.close(); }));
    this.editorRoot.addEventListener("compositionstart", () => { this.composing = true; this.cancelSave(); });
    this.editorRoot.addEventListener("compositionend", () => { this.composing = false; this.scheduleSave(); });
    for (const type of ["beforeinput", "input", "paste"]) this.editorRoot.addEventListener(type, () => { this.inputUntil = Date.now() + 1500; }, true);
    document.addEventListener("keydown", this.saveShortcut);
    this.disposers.push(() => document.removeEventListener("keydown", this.saveShortcut));
    this.timer = window.setInterval(() => void this.poll().catch(this.fail), 650);
  }
  private fail = (error: unknown): void => {
    if (this.disposed) return;
    this.status.textContent = error instanceof Error ? error.message : String(error); this.status.classList.add("wb-error");
    if (this.notifiedError !== this.status.textContent) { this.notifiedError = this.status.textContent; void logseq.UI.showMsg(this.status.textContent, "warning"); }
  };
  private message(text: string): void { this.notifiedError = null; this.status.textContent = text; this.status.classList.remove("wb-error"); }
  private saveShortcut = (event: KeyboardEvent): void => { if (this.panel.visible && (event.metaKey || event.ctrlKey) && event.key === "s") { event.preventDefault(); void this.save().catch(this.fail); } };
  private key(id = this.current?.id): string { return `workbench:draft:${this.graph}:${id}`; }
  private dirty(): boolean { return this.mode === "editing" && !!this.current && !!this.editor && !this.suppress && this.editor.getValue() !== this.canonical; }
  private preserveDraft(): void {
    if (!this.dirty() || !this.current || !this.editor) return;
    try { localStorage.setItem(this.key(), JSON.stringify({ text: this.editor.getValue(), base: this.base, at: Date.now() })); }
    catch { this.message("草稿缓存失败，请先保存或另存后再关闭。"); }
  }
  private cancelSave(): void { if (this.saveTimer !== null) window.clearTimeout(this.saveTimer); this.saveTimer = null; }
  private scheduleSave(): void {
    this.preserveDraft(); this.cancelSave(); if (!this.disposed && !this.composing && this.dirty() && this.conflict.hidden) this.saveTimer = window.setTimeout(() => void this.save().catch(this.fail), 900);
  }
  private async ensureService(): Promise<MaterialService> {
    const epoch = this.epoch;
    if (this.disposed) throw new Error("材料模块已关闭。");
    const graph = await logseq.App.getCurrentGraph(); this.assertScope(epoch);
    if (!graph?.path) throw new Error("请先打开本地文件 Graph。");
    const directory = String(logseq.settings?.materialsDirectory ?? "").trim();
    const root = directory ? normalizeRoot(directory, graph.path) : null;
    if (!this.service || this.graph !== graph.path || this.service.globalRoot !== root) {
      this.graph = graph.path;
      this.service = new MaterialService(desktopFiles(() => graph.path), this.directories, graph.path, root, captureMarkdown);
    }
    return this.service;
  }
  private async workContext(uuid: string | null): Promise<MaterialWorkContext> {
    await this.ensureService();
    const epoch = this.epoch, graph = this.graph;
    // Nearest explicit binding wins; this is source ancestry, not formal ownership.
    let source = uuid;
    const seen = new Set<string>();
    for (let depth = 0; source && depth < 32 && !seen.has(source); depth++) {
      seen.add(source);
      const binding = this.directories.binding(graph, source);
      if (binding) return {graph, sourceUuid: uuid, directory: binding.directory, organization: binding.organization};
      const block = await this.sources.sourceAction(epoch, graph, () => logseq.Editor.getBlock(source!));
      source = block?.parent?.id === block?.page?.id ? null : block?.parent?.id ? (await this.sources.sourceAction(epoch, graph, () => logseq.Editor.getBlock(block.parent.id)))?.uuid ?? null : null;
    }
    return {graph, sourceUuid: uuid, directory: null, organization: "flat"};
  }
  /** Trusted consumer port; preserves the existing nearest explicit binding. */
  workspaceContext(uuid: string): Promise<MaterialWorkContext> { return this.workContext(uuid); }
  async bindDirectory(sourceUuid: string, directory: string | null, organization: "flat" | "project" = "flat"): Promise<void> {
    const service = await this.ensureService(), epoch = this.epoch;
    const root = directory ? normalizeRoot(directory.trim(), this.graph) : null;
    if (root) {
      const io = service.io;
      if (io.stat && (await io.stat(root)).type !== "directory") throw new Error("请选择已有工作目录。");
      await io.list(root); this.assertScope(epoch);
      if (await this.sources.sourceAction(epoch, this.graph, () => logseq.Editor.checkEditing())) throw new Error("请先结束块编辑再绑定目录。");
      await this.sources.persistSource(sourceUuid, epoch, this.graph);
      this.directories.register(this.graph, root);
    }
    this.directories.bind({graph: this.graph, sourceUuid, directory: root, organization});
  }
  private async bindCurrentDirectory(): Promise<void> {
    const block = this.contextUuid ? await logseq.Editor.getBlock(this.contextUuid) : await logseq.Editor.getCurrentBlock();
    if (!block) throw new Error("请先选择工作块。");
    await this.library(block.uuid);
    const epoch = this.epoch;
    const directory = await materialPrompt(this.body, "已有工作目录的绝对路径", this.directories.binding(this.graph, block.uuid)?.directory ?? "");
    this.assertScope(epoch); if (!directory) return;
    const identity = block.content ?? "";
    const project = /\*\*\[(MiniProject|Project|项目|小项目)\]\*\*/i.test(identity);
    await this.bindDirectory(block.uuid, directory, project ? "project" : "flat"); await this.library(block.uuid);
  }
  async library(rootUuid: string | null = null, content = ""): Promise<void> {
    if (this.disposed) return;
    const navigation = panels.reserve();
    await this.leave(); if (this.disposed || !panels.isLatest(navigation)) return;
    this.epoch++; this.current = null; this.mode = "reading"; this.contextUuid = rootUuid; this.conflict.hidden = true;
    this.editorRoot.hidden = true; this.body.hidden = false;
    this.heading.replaceChildren(element("strong", rootUuid ? "当前工作的材料" : "材料库"), button("收纳文本", () => void this.captureTextPrompt().catch(this.fail)), button("关联文件", () => void this.associate(rootUuid).catch(this.fail)), button("关闭", () => void this.panel.close()));
    const management = element("details"), summary = element("summary", "目录与查找"); management.append(summary); this.heading.append(management);
    if (rootUuid) {
      this.heading.append(button("查找全部材料", () => void this.library().catch(this.fail)));
      management.append(button("工作目录", () => void this.bindCurrentDirectory().catch(this.fail)), button("查看目录文件", () => void this.directoryFiles().catch(this.fail)), button("解除目录绑定", () => void this.bindDirectory(rootUuid, null).then(() => this.library(rootUuid)).catch(this.fail)));
    }
    management.append(button("登记材料目录", () => void this.registerDirectory().catch(this.fail)));
    const query = element("input"); query.type = "search"; query.placeholder = "搜索标题与正文"; query.setAttribute("aria-label", "搜索材料");
    await this.ensureService();
    const results = element("div"), recovery = element("div"); this.body.replaceChildren(recovery, query, results);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i); if (!key?.startsWith("workbench:pending:")) continue;
      try {
        const pending = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (typeof pending.plain !== "string" || (pending.graph && pending.graph !== this.graph)) continue;
        recovery.append(button(`${pending.materialId ? "打开已保存材料" : "恢复未完成粘贴"}：${titleOf(pending.plain)}`, () => void (async () => {
          if (pending.materialId) { await this.openDoc(pending.materialId); return; }
          const service = await this.ensureService();
          const result = await service.capture({requestKey: key, text: pending.plain, html: pending.html}, pending.context ?? await this.workContext(pending.uuid ?? null));
          if (result.status === "success") localStorage.removeItem(key); await this.openDoc(result.material.id);
        })().catch(this.fail)));
      } catch { recovery.append(element("p", "一条恢复记录不可读，原记录仍保留。")); }
    }
    if (!await this.panel.open(navigation)) return;
    const related = new Set([...content.matchAll(/longdoc:\/\/([0-9a-f-]{36})/gi)].map(match => match[1]));
    let searchEpoch = 0;
    const search = async () => {
      const ticket = ++searchEpoch, epoch = this.epoch;
      try {
        const service = await this.ensureService(), entries = await service.list(query.value);
        if (ticket !== searchEpoch || epoch !== this.epoch) return;
        results.replaceChildren();
        const visible = rootUuid ? entries.filter(item => associationsOf(item).some(association => association.graph === this.graph && association.sourceUuid === rootUuid) || related.has(item.id)) : entries;
        for (const item of visible) { const entry = button(item.title, () => void this.openDoc(item.id).catch(this.fail)); entry.className = "wb-material"; entry.append(element("small", `${item.kind === "reference" ? "原文件" : "收纳"} · ${roleLabel(item.role)} · ${item.snippet}`)); results.append(entry); }
        if (!visible.length) results.append(element("p", "暂无材料。可以收纳文本或关联已有文件。"));
        this.message(service.listProblems.length ? `${visible.length} 篇 · 部分材料目录暂不可读，请检查目录。` : `${visible.length} 篇`);
      } catch (error) { if (epoch === this.epoch) { results.replaceChildren(element("p", error instanceof Error ? error.message : String(error))); this.fail(error); } }
    };
    query.oninput = () => void search(); await search();
  }
  private async loadEditor(): Promise<EditorConstructor> {
    const target = window as Window & {Vditor?: EditorConstructor};
    if (!target.Vditor) {
      const css = element("link"); css.rel = "stylesheet"; css.href = new URL("./vditor/dist/index.css", location.href).href; document.head.append(css);
      await new Promise<void>((resolve, reject) => { const script = element("script"); script.src = new URL("./vditor/dist/index.min.js", location.href).href; script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(new Error("文档编辑器资源加载失败。")); }; document.head.append(script); });
    }
    if (!target.Vditor) throw new Error("文档编辑器初始化失败。"); return target.Vditor;
  }
  async openDoc(id: string, returnUuid?: string | null): Promise<void> {
    if (this.disposed) return;
    const navigation = panels.reserve();
    await this.leave(); if (this.disposed || !panels.isLatest(navigation)) return;
    if (returnUuid !== undefined) this.contextUuid = returnUuid;
    const epoch = ++this.epoch, service = await this.ensureService();
    let located: Awaited<ReturnType<MaterialService["locate"]>>;
    try { located = await service.locate(id); }
    catch (error) {
      if (epoch !== this.epoch) return;
      this.current = null; this.mode = "reading"; this.editorRoot.hidden = true; this.body.hidden = false;
      this.heading.replaceChildren(element("strong", "材料暂不可用"), button("‹ 材料库", () => void this.library(this.contextUuid).catch(this.fail)));
      this.body.replaceChildren(element("p", error instanceof Error ? error.message : String(error)), button("登记原材料目录", () => void this.registerDirectory(id).catch(this.fail)));
      await this.panel.open(navigation); return;
    }
    const {store, record} = located, view = await service.read(id);
    if (epoch !== this.epoch || !panels.isLatest(navigation)) return;
    this.store = store; this.current = record; this.mode = "reading"; this.base = view.content ?? ""; this.stableExternal = null; this.conflict.hidden = true;
    this.heading.replaceChildren(button("‹ 材料库", () => void this.library(this.contextUuid).catch(this.fail)), element("strong", record.title), button("外部打开", () => void store.path(id).then(path => desktopBridge().openPath(path)).catch(this.fail)), button("来源", () => void this.locate().catch(this.fail)), button("关闭", () => void this.panel.close()));
    if (this.contextUuid && this.returnWork) this.heading.append(button("返回工作", () => void this.returnWork!(this.contextUuid!).catch(this.fail)));
    const more = element("details"), summary = element("summary", "更多"); more.append(summary); this.heading.append(more);
    more.append(button("改标题", () => void this.renameTitle().catch(this.fail)), button("补关联", () => void this.linkExisting(id).catch(this.fail)), button("重新定位", () => void this.relocate().catch(this.fail)));
    if (record.kind === "capture" && record.sourceUuid) more.append(button("恢复收纳原文", () => void this.restore().catch(this.fail)));
    this.body.hidden = false; this.editorRoot.hidden = true;
    this.body.replaceChildren(element("small", `${record.kind === "reference" ? "原文件" : "收纳创建"} · ${roleLabel(record.role)} · ${view.path}`));
    if (view.writeState === "pending") more.append(button("继续保存收纳", () => void store.resumeCapture(record).then(() => this.openDoc(id)).catch(this.fail)));
    if (view.content !== null && view.availability === "available") {
      this.body.append(renderReading(view.content));
      if (view.writeState === "ready") this.heading.append(button(record.kind === "reference" ? "编辑原文件" : "编辑", () => void this.beginEditing().catch(this.fail)));
      this.message(view.writeState === "pending" ? "收纳保存未完成，原文仍保留。可在更多中继续保存。" : "阅读中");
    } else this.body.append(element("p", view.availability === "unavailable" ? "文件暂不可用，关联与历史仍保留。请选择重新定位。" : "此格式支持关联与外部打开。"));
    if (!await this.panel.open(navigation)) return;
    const draft = localStorage.getItem(this.key());
    if (view.content !== null && draft) await this.beginEditing(false);
  }
  private async beginEditing(grant = true): Promise<void> {
    if (!this.current || !this.store) return;
    const epoch = this.epoch, store = this.store, id = this.current.id;
    if (grant) { const record = await store.grantEditing(id); this.assertScope(epoch); this.current = record; }
    const text = await store.read(id); this.assertScope(epoch);
    this.mode = "editing"; this.base = text; this.body.hidden = true; this.editorRoot.hidden = false;
    if (!this.heading.querySelector('[data-material-read]')) {
      const reading = button("完成编辑", () => void this.openDoc(id).catch(this.fail)); reading.dataset.materialRead = "true"; this.heading.append(reading);
      this.heading.append(button("允许 agent 编辑此工作稿", () => void store.grantEditing(id, true).then(record => { this.assertScope(epoch); this.current = record; this.message("已允许 agent 编辑此文件，保存仍需核对版本。"); }).catch(this.fail)));
    }
    if (!this.editor) {
      const Editor = await this.loadEditor();
      if (epoch !== this.epoch) return;
      this.suppress = true;
      await new Promise<void>(resolve => {
        this.editor = new Editor(this.editorRoot, { height: "100%", mode: "ir", value: text, cdn: new URL("./vditor", location.href).href, lang: "zh_CN", cache: { enable: false }, toolbar: ["headings", "bold", "italic", "link", "list", "quote", "code", "table", "|", "undo", "redo"], preview: { markdown: { sanitize: true }, hljs: { enable: false } }, input: () => { if (!this.suppress) this.scheduleSave(); }, after: () => resolve() });
      });
    }
    if (epoch !== this.epoch) return;
    this.setEditor(text); this.message("已读取 · 编辑后自动保存");
    const draft = localStorage.getItem(this.key());
    if (draft) {
      try {
        const saved = JSON.parse(draft) as { text: string; base: string };
        if (typeof saved.text !== "string" || typeof saved.base !== "string") throw new Error("草稿记录无效。");
        if (saved.text === text) localStorage.removeItem(this.key());
        else { this.suppress = true; this.editor?.setValue(saved.text, true); this.suppress = false; this.base = saved.base; if (saved.base !== text) { this.conflict.hidden = false; this.message("已恢复草稿，外部版本另有修改。"); } else this.scheduleSave(); }
      } catch (error) { this.suppress = false; this.fail(error); }
    }
  }
  private setEditor(text: string): void {
    if (!this.editor) return;
    this.suppress = true;
    // Reused documents retain focus/undo; switching documents still clears the old undo stack.
    if (this.editor.getValue() !== text || (this.editorDocument !== null && this.editorDocument !== this.current?.id)) this.editor.setValue(text, true);
    this.editorDocument = this.current?.id ?? null; this.canonical = this.editor.getValue(); this.suppress = false;
  }
  private async leave(): Promise<void> { this.preserveDraft(); this.cancelSave(); await this.save().catch(this.fail); }
  private async save(): Promise<void> {
    if (this.saving) return this.saving;
    if (this.disposed) return;
    if (!this.current || !this.editor || !this.store || !this.dirty() || this.composing || !this.conflict.hidden) return;
    const epoch = this.epoch, record = this.current, store = this.store, text = this.editor.getValue(), expected = this.base;
    this.preserveDraft(); this.message("保存中…");
    this.saving = (async () => {
      try { await store.save(record.id, expected, text); if (epoch === this.epoch) { this.base = text; this.canonical = text; if (!this.dirty()) localStorage.removeItem(this.key(record.id)); else this.scheduleSave(); this.message("已保存"); } }
      catch (error) { if (epoch === this.epoch) { this.preserveDraft(); if (error instanceof ConflictError) this.conflict.hidden = false; } throw error; }
      finally { this.saving = null; }
    })(); return this.saving;
  }
  private async poll(): Promise<void> {
    if (!this.panel.visible || !this.current || !this.store || this.pollBusy || this.saving || this.disposed) return;
    this.pollBusy = true; const epoch = this.epoch;
    try {
      if (!this.body.querySelector(".wb-reading") && this.mode === "reading") return;
      const text = await this.store.read(this.current.id);
      if (epoch !== this.epoch || this.disposed) return;
      if (text === this.base) { this.stableExternal = null; return; }
      if (this.stableExternal !== text) { this.stableExternal = text; return; }
      if (this.dirty() || this.composing) { this.preserveDraft(); this.conflict.hidden = false; this.message("外部版本变化，当前草稿已保留。"); return; }
      if (Date.now() < this.inputUntil) return;
      this.base = text; if (this.mode === "editing") this.setEditor(text); else { const reading = this.body.querySelector(".wb-reading"); reading?.replaceWith(renderReading(text)); } this.message("已同步外部修改");
    } finally { this.pollBusy = false; }
  }
  private async keepDraft(loadExternal: boolean): Promise<void> {
    if (!this.current || !this.editor || !this.store) return;
    const epoch = this.epoch, id = this.current.id, key = this.key(), text = this.editor.getValue();
    const copy = await this.store.create(text, { graph: this.graph, title: `${this.current.title} · 草稿副本`, recoveredFrom: id, role: "draft", sourceUuid: this.current.sourceUuid, associations: associationsOf(this.current) });
    if (epoch !== this.epoch || this.disposed) return;
    localStorage.removeItem(key); this.canonical = text; this.conflict.hidden = true;
    await this.openDoc(loadExternal ? id : copy.id);
  }
  private assertScope(epoch: number): void {
    if (epoch !== this.epoch || this.disposed) throw new Error("材料 Graph 范围已变化。");
  }
  private async associate(uuid: string | null = this.contextUuid): Promise<void> {
    const epoch = this.epoch, currentGraph = await logseq.App.getCurrentGraph(); this.assertScope(epoch);
    if (!currentGraph?.path) throw new Error("请先打开本地文件 Graph。");
    const graph = currentGraph.path;
    const block = await this.sources.sourceAction(epoch, graph, () => uuid ? logseq.Editor.getBlock(uuid) : logseq.Editor.getCurrentBlock());
    if (!block) throw new Error("请先选择关联材料的工作块。");
    if (await this.sources.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("请先结束当前块编辑，再关联文件。");
    await this.library(block.uuid); const operationEpoch = this.epoch;
    const path = await materialPrompt(this.body, "文件绝对路径（Markdown、PDF、图片等）");
    this.assertScope(operationEpoch); if (!path) return;
    const service = await this.ensureService(), context = await this.workContext(block.uuid);
    const result = await service.associateFile(path.trim(), context); this.assertScope(operationEpoch);
    const linked = await this.sources.insertReference(result, block.uuid, operationEpoch, graph); this.assertScope(operationEpoch);
    await this.openDoc(linked.material.id); if (linked.status === "partial") this.message(linked.problem ?? "文件已登记，可稍后补关联。");
  }
  async capture(request: CaptureRequest, actor: "user" | "agent" = "agent"): Promise<MaterialResult> {
    const epoch = this.epoch, service = await this.ensureService();
    const context = await this.workContext(request.sourceUuid ?? this.contextUuid);
    const result = await service.capture(request, context, actor);
    if (result.status === "partial") return result;
    if (context.sourceUuid) return this.sources.insertReference(result, context.sourceUuid, epoch, context.graph);
    return result;
  }
  async listMaterials(sourceUuid: string | null = this.contextUuid, query = ""): Promise<{status: "success" | "partial"; materials: MaterialView[]; problems: string[]}> {
    const service = await this.ensureService(), records = await service.list(query, sourceUuid);
    const problems = [...service.listProblems];
    const materials = await Promise.all(records.map(record => service.read(record.id)));
    return {status: problems.length ? "partial" : "success", materials, problems};
  }
  async readMaterial(id: string): Promise<Awaited<ReturnType<MaterialService["read"]>>> { return (await this.ensureService()).read(id); }
  async saveMaterial(id: string, expectedVersion: string, expectedContent: string, next: string): Promise<MaterialResult> {
    return (await this.ensureService()).save(id, expectedVersion, expectedContent, next, "agent");
  }
  async associateMaterial(input: {id?: string; path?: string; sourceUuid: string}): Promise<MaterialResult> {
    const epoch = this.epoch, service = await this.ensureService(), context = await this.workContext(input.sourceUuid);
    const result = input.id ? await service.associate(input.id, context) : input.path ? await service.associateFile(input.path, context) : (() => {throw new Error("请提供材料身份或文件路径。");})();
    return this.sources.insertReference(result, input.sourceUuid, epoch, context.graph);
  }
  private async captureTextPrompt(): Promise<void> {
    const epoch = this.epoch, graph = this.graph, pending = `workbench:pending:${crypto.randomUUID()}`, uuid = this.contextUuid;
    const text = await materialPrompt(this.body, "收纳文本", "", true, value => localStorage.setItem(pending, JSON.stringify({graph, uuid, plain: value, html: "", at: Date.now()}))); this.assertScope(epoch);
    if (!text) return;
    const service = await this.ensureService(), context = await this.workContext(uuid);
    localStorage.setItem(pending, JSON.stringify({graph: this.graph, uuid, context, plain: text, html: "", at: Date.now()}));
    const saved = await service.capture({requestKey: pending, text}, context, "user");
    const result = saved.status === "success" && uuid ? await this.sources.insertReference(saved, uuid, epoch, context.graph) : saved;
    if (result.status === "success") localStorage.removeItem(pending);
    else localStorage.setItem(pending, JSON.stringify({graph: context.graph, uuid, context, plain: text, html: "", materialId: result.material.id, at: Date.now()}));
    this.assertScope(epoch); await this.openDoc(result.material.id); if (result.status === "partial") this.message(result.problem ?? "引用未插入。");
  }
  private async linkExisting(id: string): Promise<void> {
    const block = this.contextUuid ? await logseq.Editor.getBlock(this.contextUuid) : await logseq.Editor.getCurrentBlock();
    if (!block) throw new Error("请先选择需要关联的工作块。");
    const result = await this.associateMaterial({id, sourceUuid: block.uuid}); this.message(result.status === "partial" ? result.problem ?? "引用未插入。" : "已关联当前工作。");
  }
  private async renameTitle(): Promise<void> {
    if (!this.current || !this.store) return;
    const epoch = this.epoch, id = this.current.id, store = this.store;
    this.body.hidden = false;
    const title = await materialPrompt(this.body, "显示标题", this.current.title); this.assertScope(epoch);
    if (!title) return;
    await store.update(id, record => ({...record, title: titleOf(title)})); this.assertScope(epoch); await this.openDoc(id);
  }
  private async relocate(): Promise<void> {
    if (!this.current || !this.store) return;
    const epoch = this.epoch, id = this.current.id, store = this.store; this.body.hidden = false;
    const path = await materialPrompt(this.body, "重新定位到文件绝对路径", await store.path(id)); this.assertScope(epoch);
    if (!path) return;
    // Keep the existing draft and its base; the new file is read as an external version.
    this.preserveDraft(); await store.relocate(id, path.trim()); this.assertScope(epoch); await this.openDoc(id);
  }
  private async registerDirectory(id?: string): Promise<void> {
    const epoch = this.epoch; await this.ensureService(); this.body.hidden = false;
    const directory = await materialPrompt(this.body, "已有材料目录（包含 .longdoc 记录）"); this.assertScope(epoch);
    if (!directory) return;
    const root = normalizeRoot(directory.trim(), this.graph), service = await this.ensureService();
    await service.io.list(`${root}/.longdoc`); this.assertScope(epoch); this.directories.register(this.graph, root);
    if (id) { const store = new MaterialStore(service.io, root); await store.record(id); this.assertScope(epoch); this.directories.remember(this.graph, id, root); await this.openDoc(id); }
    else await this.library(this.contextUuid);
  }
  private async directoryFiles(): Promise<void> {
    const epoch = this.epoch, service = await this.ensureService(), context = await this.workContext(this.contextUuid);
    if (!context.directory) throw new Error("请先绑定工作目录。");
    const observer=this.directoryObserver;
    if(observer?.available(context)){
      const observed=await observer.list(context);this.assertScope(epoch);
      const list=element("div");this.body.replaceChildren(list);
      list.append(button("‹ 已关联材料",()=>void this.library(this.contextUuid).catch(this.fail)));
      for(const file of observed.files){
        if(file.kind!=="file")continue;
        const row=element("div","","wb-material"),label=element("span",file.path);row.append(label);
        const read=async()=>{
          if(file.materialId){await this.openDoc(file.materialId);return;}
          const view=await observer.read(file.path,context);this.assertScope(epoch);
          const body=element("pre",view.content??"此文件仅支持元信息；可关联后用原生应用打开。","wb-reading");body.style.whiteSpace="pre-wrap";
          this.body.replaceChildren(button("‹ 目录文件",()=>void this.directoryFiles().catch(this.fail)),body);
        };
        if(file.availability==="available")row.append(button("阅读",()=>void read().catch(this.fail)));
        if(!file.materialId&&file.availability==="available")row.append(button("关联",()=>void observer.associate(file.path,context).then(result=>{this.assertScope(epoch);return this.openDoc(result.material.id);}).catch(this.fail)));
        list.append(row);
      }
      this.message(observed.truncated?"目录过大，部分范围未列出。可通过 agent 查询具体路径。":"已连接此工作；文件直接可见，关联后沿用材料权限。大小与时间相同不表示正文未变。");return;
    }
    const entries = await service.io.list(context.directory); this.assertScope(epoch);
    const list = element("div"); this.body.replaceChildren(list);
    list.append(button("‹ 已关联材料", () => void this.library(this.contextUuid).catch(this.fail)));
    for (const entry of entries.slice(0, 200)) {
      const path = entry.startsWith("/") ? entry : `${context.directory}/${entry}`;
      if (path.includes("/.longdoc/") || path.endsWith("/.longdoc")) continue;
      if (service.io.stat && (await service.io.stat(path)).type !== "file") continue;
      this.assertScope(epoch);
      list.append(button(path.slice(context.directory.length + 1), () => void this.associateMaterial({path, sourceUuid: context.sourceUuid!}).then(result => { this.assertScope(epoch); return this.openDoc(result.material.id); }).catch(this.fail)));
    }
    this.message(entries.length > 200 ? "显示前 200 项，可用关联文件入口指定其他路径。" : "选择文件即可关联，原文件保留在原处。");
  }
  private async locate(): Promise<void> {
    const record = this.current, graph = this.graph, epoch = this.epoch;
    if (!record?.sourceUuid || record.graph !== graph) throw new Error("当前材料没有此 Graph 中的来源。");
    const block = await this.sources.sourceAction(epoch, graph, () => logseq.Editor.getBlock(record.sourceUuid!));
    if (!block) throw new Error("来源暂不可用。");
    const page = await this.sources.sourceAction(epoch, graph, () => logseq.Editor.getPage(block.page.id));
    if (page) await this.sources.sourceAction(epoch, graph, async () => logseq.Editor.scrollToBlockInPage(page.originalName ?? page.name, block.uuid));
  }
  private async restore(): Promise<void> {
    const record = this.current, graph = this.graph, epoch = this.epoch;
    if (!record?.sourceUuid || record.graph !== graph) throw new Error("请切换到来源 Graph。");
    if (await this.sources.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("请先结束块编辑再恢复原文。");
    const block = await this.sources.sourceAction(epoch, graph, () => logseq.Editor.getBlock(record.sourceUuid!));
    if (!block) throw new Error("来源暂不可用，捕获原文仍保留。");
    if (await this.sources.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("当前块正在编辑，原文仍保留。");
    await this.sources.sourceAction(epoch, graph, () => logseq.Editor.updateBlock(block.uuid, restoreCapture(block.content ?? "", record))); this.message("已恢复收纳原文，外部文件保留。");
  }
  async linkedContext(content: string): Promise<object[]> {
    const epoch = this.epoch, service = await this.ensureService(), ids = new Set([...content.matchAll(/longdoc:\/\/([0-9a-f-]{36})/gi)].map(match => match[1]!));
    const values: object[] = [];
    for (const id of ids) {
      try { const material = await service.read(id); this.assertScope(epoch); values.push({...material, kind: material.capabilities.read === "markdown" ? "MARKDOWN_FILE" : "EXTERNAL_FILE"}); }
      catch (error) { this.assertScope(epoch); values.push({id, availability: "unavailable", problem: String(error)}); }
    }
    return values;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.epoch++; this.preserveDraft(); this.cancelSave(); window.clearInterval(this.timer);
    for (const off of this.disposers) off();
    // An already-started save settles against its captured store before the editor is destroyed.
    void this.panel.close().catch(this.fail).finally(() => { this.editor?.destroy(); this.editor = null; });
  }
}
