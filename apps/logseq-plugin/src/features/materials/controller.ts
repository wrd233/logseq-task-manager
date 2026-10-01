import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { button, element, FeaturePanel, hostDocument } from "../../host/panel-host.ts";
import { desktopBridge, desktopFiles } from "../../host/desktop-files.ts";
import { requestTextPrompt } from "../../text-prompt.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import { panels } from "../../workspace/context.ts";
import { MaterialStore, ConflictError, normalizeRoot, isLong, makeLink, idFrom, restoreCapture, titleOf, type MaterialRecord } from "./store.ts";

interface MarkdownEditor { getValue(): string; setValue(text: string, clearStack?: boolean): void; destroy(): void }
interface EditorConstructor { new (root: HTMLElement, options: Record<string, unknown>): MarkdownEditor }

export class Materials {
  readonly panel: FeaturePanel;
  private store: MaterialStore | null = null;
  private graph = "";
  private current: MaterialRecord | null = null;
  private editor: MarkdownEditor | null = null;
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
  private pendingCapture = false;
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
  private readonly converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

  constructor() {
    this.converter.use(gfm);
    this.panel = new FeaturePanel("materials", "材料", () => this.leave());
    this.editorRoot.id = "workbench-markdown-editor"; this.editorRoot.hidden = true; this.conflict.hidden = true;
    this.conflict.append(element("p", "检测到外部版本变化，当前草稿已保留。"), button("另存草稿并继续", () => void this.keepDraft(false).catch(this.fail)), button("另存草稿后加载外部版本", () => void this.keepDraft(true).catch(this.fail)));
    this.panel.root.append(this.heading, this.conflict, this.body, this.editorRoot, this.status);
    logseq.App.registerCommandPalette({ key: "workbench-materials", label: "工作台：打开材料库" }, () => void this.library().catch(this.fail));
    logseq.App.registerCommandPalette({ key: "workbench-link-file", label: "工作台：关联已有 Markdown 文件" }, () => void this.associate().catch(this.fail));
    const doc = hostDocument();
    const link = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a,[data-href]");
      const id = idFrom(anchor?.getAttribute("href") ?? anchor?.getAttribute("data-href") ?? "");
      if (!id) return; event.preventDefault(); event.stopImmediatePropagation(); void this.openDoc(id).catch(this.fail);
    };
    const paste = (event: ClipboardEvent) => this.onPaste(event);
    doc?.addEventListener("click", link, true); document.addEventListener("click", link, true); doc?.addEventListener("paste", paste, true);
    this.disposers.push(() => { doc?.removeEventListener("click", link, true); document.removeEventListener("click", link, true); doc?.removeEventListener("paste", paste, true); });
    this.disposers.push(logseq.App.onCurrentGraphChanged(() => { this.preserveDraft(); this.epoch++; this.current = null; this.store = null; this.contextUuid = null; void this.panel.close(); }));
    this.editorRoot.addEventListener("compositionstart", () => { this.composing = true; this.cancelSave(); });
    this.editorRoot.addEventListener("compositionend", () => { this.composing = false; this.scheduleSave(); });
    for (const type of ["beforeinput", "input", "paste"]) this.editorRoot.addEventListener(type, () => { this.inputUntil = Date.now() + 1500; }, true);
    document.addEventListener("keydown", this.saveShortcut);
    this.disposers.push(() => document.removeEventListener("keydown", this.saveShortcut));
    this.timer = window.setInterval(() => void this.poll().catch(this.fail), 650);
  }
  private fail = (error: unknown): void => {
    this.status.textContent = error instanceof Error ? error.message : String(error); this.status.classList.add("wb-error");
    if (this.notifiedError !== this.status.textContent) { this.notifiedError = this.status.textContent; void logseq.UI.showMsg(this.status.textContent, "warning"); }
  };
  private message(text: string): void { this.notifiedError = null; this.status.textContent = text; this.status.classList.remove("wb-error"); }
  private saveShortcut = (event: KeyboardEvent): void => { if (this.panel.visible && (event.metaKey || event.ctrlKey) && event.key === "s") { event.preventDefault(); void this.save().catch(this.fail); } };
  private key(id = this.current?.id): string { return `workbench:draft:${this.graph}:${id}`; }
  private dirty(): boolean { return !!this.current && !!this.editor && !this.suppress && this.editor.getValue() !== this.canonical; }
  private preserveDraft(): void {
    if (!this.dirty() || !this.current || !this.editor) return;
    try { localStorage.setItem(this.key(), JSON.stringify({ text: this.editor.getValue(), base: this.base, at: Date.now() })); }
    catch { this.message("草稿缓存失败，请先保存或另存后再关闭。"); }
  }
  private cancelSave(): void { if (this.saveTimer !== null) window.clearTimeout(this.saveTimer); this.saveTimer = null; }
  private scheduleSave(): void {
    this.preserveDraft(); this.cancelSave(); if (!this.composing && this.dirty() && this.conflict.hidden) this.saveTimer = window.setTimeout(() => void this.save().catch(this.fail), 900);
  }
  private async ensureStore(): Promise<MaterialStore> {
    const graph = await logseq.App.getCurrentGraph();
    if (!graph?.path) throw new Error("请先打开本地文件 Graph。");
    const directory = String(logseq.settings?.materialsDirectory ?? "");
    if (!directory.trim()) throw new Error("请先在插件设置中配置 Graph 外的材料目录。");
    const root = normalizeRoot(directory, graph.path);
    if (!this.store || this.graph !== graph.path || this.store.root !== root) {
      this.graph = graph.path; this.store = new MaterialStore(desktopFiles(() => this.graph), root); await this.store.init();
    }
    return this.store;
  }
  async library(rootUuid: string | null = null, content = ""): Promise<void> {
    const navigation = panels.reserve();
    await this.leave(); if (!panels.isLatest(navigation)) return;
    this.epoch++; this.current = null; this.contextUuid = rootUuid; this.conflict.hidden = true;
    this.editorRoot.hidden = true; this.body.hidden = false;
    this.heading.replaceChildren(element("strong", rootUuid ? "当前工作的材料" : "材料库"), button("关联文件", () => void this.associate(rootUuid).catch(this.fail)), button("关闭", () => void this.panel.close()));
    const query = element("input"); query.type = "search"; query.placeholder = "搜索标题与正文"; query.setAttribute("aria-label", "搜索材料");
    const results = element("div"), recovery = element("div"); this.body.replaceChildren(recovery, query, results);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i); if (!key?.startsWith("workbench:pending:")) continue;
      try {
        const pending = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (typeof pending.plain !== "string") continue;
        recovery.append(button(`保存未完成粘贴：${titleOf(pending.plain)}`, () => void (async () => {
          const store = await this.ensureStore();
          const doc = await store.create(pending.plain, {graph: this.graph, original: pending.plain, originalHTML: typeof pending.html === "string" ? pending.html : ""});
          localStorage.removeItem(key); await this.openDoc(doc.id);
        })().catch(this.fail)));
      } catch { recovery.append(element("p", "一条恢复记录不可读，原记录仍保留。")); }
    }
    if (!await this.panel.open(navigation)) return;
    const related = new Set([...content.matchAll(/longdoc:\/\/([0-9a-f-]{36})/gi)].map(match => match[1]));
    let searchEpoch = 0;
    const search = async () => {
      const ticket = ++searchEpoch, epoch = this.epoch;
      try {
        const store = await this.ensureStore(), entries = await store.search(query.value, this.graph);
        if (ticket !== searchEpoch || epoch !== this.epoch) return;
        results.replaceChildren();
        const visible = rootUuid ? entries.filter(item => item.sourceUuid === rootUuid || related.has(item.id)) : entries;
        for (const item of visible) { const entry = button(item.title, () => void this.openDoc(item.id).catch(this.fail)); entry.className = "wb-material"; entry.append(element("small", `${item.kind === "reference" ? "关联文件" : "收纳文档"} · ${item.snippet}`)); results.append(entry); }
        if (!visible.length) results.append(element("p", "暂无材料。可以关联已有 Markdown，或在设置中启用长文本收纳。"));
        this.message(`${visible.length} 篇 · 原文件与收纳记录均可独立备份`);
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
  async openDoc(id: string): Promise<void> {
    const navigation = panels.reserve();
    await this.leave(); const epoch = ++this.epoch, store = await this.ensureStore();
    const [record, text] = await Promise.all([store.record(id), store.read(id)]);
    if (epoch !== this.epoch || !panels.isLatest(navigation)) return;
    this.current = record; this.base = text; this.stableExternal = null; this.conflict.hidden = true;
    this.heading.replaceChildren(button("‹ 材料库", () => void this.library(this.contextUuid).catch(this.fail)), element("strong", record.title), button("外部打开", () => void store.path(id).then(path => desktopBridge().openPath(path)).catch(this.fail)), button("来源", () => void this.locate().catch(this.fail)), button("关闭", () => void this.panel.close()));
    if (record.kind === "capture" && record.sourceUuid) this.heading.append(button("恢复收纳原文", () => void this.restore().catch(this.fail)));
    this.body.hidden = true; this.editorRoot.hidden = false; if (!await this.panel.open(navigation)) return;
    if (!this.editor) {
      const Editor = await this.loadEditor();
      if (epoch !== this.epoch || !panels.isLatest(navigation)) return;
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
  private setEditor(text: string): void { if (!this.editor) return; this.suppress = true; this.editor.setValue(text, true); this.canonical = this.editor.getValue(); this.suppress = false; }
  private async leave(): Promise<void> { this.preserveDraft(); this.cancelSave(); await this.save().catch(() => undefined); }
  private async save(): Promise<void> {
    if (this.saving) return this.saving;
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
    if (!this.panel.visible || !this.current || !this.store || !this.editor || this.pollBusy || this.saving || this.disposed) return;
    this.pollBusy = true; const epoch = this.epoch;
    try {
      const text = await this.store.read(this.current.id);
      if (epoch !== this.epoch || text === this.base) { this.stableExternal = null; return; }
      if (this.stableExternal !== text) { this.stableExternal = text; return; }
      if (this.dirty() || this.composing) { this.preserveDraft(); this.conflict.hidden = false; this.message("外部版本变化，当前草稿已保留。"); return; }
      if (Date.now() < this.inputUntil) return;
      this.base = text; this.setEditor(text); this.message("已同步外部修改");
    } finally { this.pollBusy = false; }
  }
  private async keepDraft(loadExternal: boolean): Promise<void> {
    if (!this.current || !this.editor || !this.store) return;
    const id = this.current.id, text = this.editor.getValue();
    const copy = await this.store.create(text, { graph: this.graph, title: `${this.current.title} · 草稿副本`, recoveredFrom: id });
    localStorage.removeItem(this.key()); this.canonical = text; this.conflict.hidden = true;
    await this.openDoc(loadExternal ? id : copy.id);
  }
  private async associate(uuid: string | null = this.contextUuid): Promise<void> {
    const block = uuid ? await logseq.Editor.getBlock(uuid) : await logseq.Editor.getCurrentBlock();
    if (!block) throw new Error("请先选择关联材料的工作块。");
    if (await logseq.Editor.checkEditing()) throw new Error("请先结束当前块编辑，再关联文件。");
    const path = await requestTextPrompt({ title: "关联已有 Markdown", label: "文件绝对路径", initialValue: "", confirmLabel: "关联" });
    if (!path) return;
    const store = await this.ensureStore();
    await ensurePersistentSourceIdentity({ getBlock: id => logseq.Editor.getBlock(id), upsertBlockProperty: (id, key, value) => logseq.Editor.upsertBlockProperty(id, key, value) }, { uuid: block.uuid, content: block.content ?? "", isDbGraph: await currentGraphIsDb(logseq.App) });
    const record = await store.reference(path.trim(), { graph: this.graph, sourceUuid: block.uuid });
    await logseq.Editor.insertBlock(block.uuid, makeLink(record), { sibling: false });
    await this.openDoc(record.id);
  }
  private async locate(): Promise<void> {
    if (!this.current?.sourceUuid || this.current.graph !== this.graph) throw new Error("当前材料没有此 Graph 中的来源。");
    const block = await logseq.Editor.getBlock(this.current.sourceUuid); if (!block) throw new Error("来源暂不可用。");
    const page = await logseq.Editor.getPage(block.page.id); if (page) logseq.Editor.scrollToBlockInPage(page.originalName ?? page.name, block.uuid);
  }
  private async restore(): Promise<void> {
    if (!this.current?.sourceUuid || this.current.graph !== this.graph) throw new Error("请切换到来源 Graph。");
    if (await logseq.Editor.checkEditing()) throw new Error("请先结束块编辑再恢复原文。");
    const block = await logseq.Editor.getBlock(this.current.sourceUuid); if (!block) throw new Error("来源暂不可用，捕获原文仍保留。");
    await logseq.Editor.updateBlock(block.uuid, restoreCapture(block.content ?? "", this.current)); this.message("已恢复收纳原文，外部文件保留。");
  }
  private onPaste(event: ClipboardEvent): void {
    if (!logseq.settings?.materialsAutoCapture || this.pendingCapture) return;
    const target = event.target as HTMLTextAreaElement | null, data = event.clipboardData;
    if (target?.tagName !== "TEXTAREA" || !target.closest(".block-editor") || !data || data.files.length || [...data.types].some(type => type.includes("logseq"))) return;
    const plain = data.getData("text/plain"), html = data.getData("text/html");
    if (!isLong(plain, Number(logseq.settings?.materialsMinChars), Number(logseq.settings?.materialsMinLines))) return;
    if ((target.value.slice(0, target.selectionStart).match(/^\s*(```|~~~)/gm) ?? []).length % 2) return;
    if (!String(logseq.settings?.materialsDirectory ?? "").trim()) return;
    event.preventDefault(); event.stopImmediatePropagation(); this.pendingCapture = true;
    const uuid = target.closest(".ls-block")?.getAttribute("blockid");
    const snapshot = { value: target.value, start: target.selectionStart, end: target.selectionEnd };
    const pending = `workbench:pending:${crypto.randomUUID()}`;
    let capturedRecord: MaterialRecord | null = null;
    void (async () => {
      localStorage.setItem(pending, JSON.stringify({ ...snapshot, uuid, plain, html, at: Date.now() }));
      const store = await this.ensureStore(), graph = this.graph;
      if (!uuid) throw new Error("无法确认来源块，原文已保留在恢复记录。");
      const source = await logseq.Editor.getBlock(uuid); if (!source) throw new Error("来源块暂不可读。");
      const markdown = html && !/^\s{0,3}(#{1,6}\s|```|~~~)/m.test(plain) ? this.converter.turndown(DOMPurify.sanitize(html)) || plain : plain;
      const record = await store.create(markdown, { graph, sourceUuid: uuid, original: plain, originalHTML: html }); capturedRecord = record;
      if ((await logseq.App.getCurrentGraph())?.path !== graph || !target.isConnected || target.value !== snapshot.value || target.selectionStart !== snapshot.start || target.selectionEnd !== snapshot.end || hostDocument()?.activeElement !== target) throw new Error("材料已保存，编辑位置发生变化，请从材料库打开。");
      target.focus();
      const persisted = source.properties?.id === uuid;
      if (persisted) target.setSelectionRange(snapshot.start, snapshot.end);
      else target.select();
      const insertion = persisted ? makeLink(record) : `${snapshot.value.slice(0, snapshot.start)}${makeLink(record)}${snapshot.value.slice(snapshot.end)}\nid:: ${uuid}`;
      if (!hostDocument()?.execCommand("insertText", false, insertion)) throw new Error("编辑器拒绝插入，材料和原文已保留。");
      localStorage.removeItem(pending);
    })().catch(error => {
      if (!capturedRecord && target.isConnected && target.value === snapshot.value && target.selectionStart === snapshot.start && target.selectionEnd === snapshot.end && hostDocument()?.activeElement === target) {
        target.setSelectionRange(snapshot.start, snapshot.end);
        if (hostDocument()?.execCommand("insertText", false, plain)) localStorage.removeItem(pending);
      }
      this.fail(error);
    }).finally(() => { this.pendingCapture = false; });
  }
  async linkedContext(content: string): Promise<object[]> {
    const store = await this.ensureStore(), ids = new Set([...content.matchAll(/longdoc:\/\/([0-9a-f-]{36})/gi)].map(match => match[1]).filter((id): id is string => !!id));
    const values: object[] = [];
    for (const id of ids) {
      const record = await store.record(id); if (record.graph && record.graph !== this.graph) continue;
      const text = await store.read(id), digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      values.push({ id, kind: "MARKDOWN_FILE", title: record.title, content: text, version: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""), sourceUuid: record.sourceUuid ?? null });
    }
    return values;
  }
  dispose(): void { this.disposed = true; this.epoch++; this.preserveDraft(); this.cancelSave(); window.clearInterval(this.timer); for (const off of this.disposers) off(); this.editor?.destroy(); void this.panel.close(); }
}
