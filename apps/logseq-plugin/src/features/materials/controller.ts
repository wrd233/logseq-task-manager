import { button, disclosureMenu, element, FeaturePanel, hostDocument } from "../../host/panel-host.ts";
import { desktopBridge, desktopFiles, pickMaterialDirectory } from "../../host/desktop-files.ts";
import { MaterialDirectories, type MaterialWorkContext, type MaterialBindingCommands } from "../../workspace/material-context.ts";
import { MaterialService, unavailableMaterialView, type CaptureRequest, type MaterialResult, type MaterialView, type DirectoryFileResolution } from "./service.ts";
import { captureMarkdown } from "./conversion.ts";
import { closeMaterialPrompts, materialAction, materialPrompt, renderReading, roleLabel } from "./ui.ts";
import { fileDetails, installMaterialReadingStyle, materialDropArea, materialEntry, referenceNotice } from "./reading-ui.ts";
import { fileName } from "./names.ts";
import { renderMaterialFolders } from "./folder-ui.ts";
import { parseFormalAnchor } from "../../canonical-writing.ts";
import { MaterialSourceActions } from "./source.ts";
import { MaterialTransfers } from "./transfer-ui.ts";
import type { MaterialTransferPort } from "./drop.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import type { SourceScope } from "../../workspace/source-protocol.ts";
import { panels } from "../../workspace/context.ts";
import { prepareDefaultMaterialDirectory } from "./default-directory.ts";
import { MaterialStore, ConflictError, normalizeRoot, idFrom, restoreCapture, titleOf, associationsOf, type MaterialRecord } from "./store.ts";
import {MaterialDirectoryHandles, directoryGrantFromPaste} from "../../host/directory-handles.ts";
import {renderMaterialDirectory} from "./directory-ui.ts";
import type {DirectoryLocation} from "./directory.ts";
import {MaterialPreviewReader} from "./preview/reader.ts";
import {MaterialPreviews, previewCSS} from "./preview/session.ts";
import {parsePreviewLink, previewFormat} from "./preview/paths.ts";
import type {MaterialPreviewTarget} from "./preview/types.ts";

interface MarkdownEditor { getValue(): string; setValue(text: string, clearStack?: boolean): void; destroy(): void }
interface EditorConstructor { new (root: HTMLElement, options: Record<string, unknown>): MarkdownEditor }
export interface DirectoryObservationPort {
  available(context: MaterialWorkContext): boolean;
  stop():void;
  list(context: MaterialWorkContext): Promise<{files: Array<{path:string;kind:string;availability:string;materialId:string|null}>;truncated:boolean}>;
  read(path:string,context:MaterialWorkContext):Promise<{content?:string|null;reason?:string;read?:string}>;
  associate(path:string,context:MaterialWorkContext):Promise<MaterialResult>;
}
export interface MaterialReadingUI {
  element: HTMLElement;
  show(rootUuid?: string | null, sourceContent?: string): Promise<void>;
  open(id: string): Promise<void>;
  returnToBody(): Promise<void>;
  dispose(): void;
}

export class Materials {
  private readonly transfers: MaterialTransfers;
  private readonly directoryReads = new MaterialDirectoryHandles();
  private readonly directoryPositions = new Map<string, DirectoryLocation>();
  private readonly previews = new MaterialPreviews((href, target) => this.openPreviewLink(href, target.scope.ownerUuid, target.path), error => this.fail(error));
  private previewWorkRoot: string | null | undefined;
  setTransferPort(port: MaterialTransferPort | null): void { this.transfers.setPort(port); }
  private directoryObserver:DirectoryObservationPort|null=null;
  setDirectoryObserver(port:DirectoryObservationPort|null):void {this.directoryObserver=port;}
  readonly panel: FeaturePanel;
  readonly ui: MaterialReadingUI;
  private folderCleanup: (() => void) | null = null;
  private readerMenu: ReturnType<typeof disclosureMenu> | null = null;
  private refreshList: (() => Promise<void>) | null = null;
  private listPosition: {graph: string; root: string | null; query: string; scroll: number; selected: string | null} | null = null;
  private workChrome: ((surface: HTMLElement, scope: SourceScope | null) => boolean) | null = null;
  private graphId = "";
  private beforeWorkMaterials: ((scope: SourceScope) => void) | null = null;
  private nativeWorkContext: ((uuid: string) => Promise<string | null>) | null = null;
  private linkEpoch = 0;
  setWorkChrome(mount: ((surface: HTMLElement, scope: SourceScope | null) => boolean) | null, before: ((scope: SourceScope) => void) | null = null, nativeContext: ((uuid: string) => Promise<string | null>) | null = null): void { this.workChrome = mount; this.beforeWorkMaterials = before; this.nativeWorkContext = nativeContext; }
  private mountWorkChrome(): void { this.workChrome?.(this.panel.root, this.contextUuid ? { graphId: this.graphId, rootUuid: this.contextUuid } : null); }
  private returnButton(): HTMLButtonElement { const item = button("返回正文", () => void this.returnToBody().catch(this.fail)); item.className = "wb-material-return"; return item; }
  private closeButton(): HTMLButtonElement { const item = button("关闭", () => void this.panel.close().catch(this.fail)); item.className = "wb-material-close"; return item; }
  private store: MaterialStore | null = null;
  private service: MaterialService | null = null;
  private readonly directories: MaterialDirectories;
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
  private readonly heading = element("div", "", "wb-heading wb-material-heading");
  private readonly body = element("div", "", "wb-scroll");
  private readonly editorRoot = element("div", "", "wb-editor");
  private readonly conflict = element("div", "", "wb-conflict");
  private readonly status = element("div", "", "wb-status");
  private readonly disposers: Array<() => void> = [];
  private readonly timer: number;
  private readonly sources = new MaterialSourceActions({epoch: () => this.epoch, graph: () => this.graph, assertScope: epoch => this.assertScope(epoch), service: () => this.ensureService(), workContext: uuid => this.workContext(uuid), fail: error => this.fail(error), referenceRoot: uuid => this.currentWorkRoot?.() ?? this.contextUuid ?? uuid});

  constructor(private readonly returnWork?: (uuid: string) => Promise<void>, private readonly currentWorkRoot?: () => string | null, private readonly bindings?: MaterialBindingCommands) {
    this.directories = bindings?.directories ?? new MaterialDirectories(localStorage);
    this.panel = new FeaturePanel("materials", "材料", () => this.leave());
    this.ui = {element: this.panel.root, show: (root, source) => this.library(root, source), open: id => this.openDoc(id), returnToBody: () => this.returnToBody(), dispose: () => this.dispose()};
    this.disposers.push(installMaterialReadingStyle());
    const previewStyle = element("style", previewCSS); document.head.append(previewStyle); this.disposers.push(() => previewStyle.remove());
    this.transfers = new MaterialTransfers({service: () => this.ensureService(), context: root => this.workContext(root), ticket: () => this.epoch, assert: ticket => this.assertScope(ticket), busy: id => (this.current?.id === id && (this.mode === "editing" || this.composing || !!this.saving)) || !!localStorage.getItem(this.key(id)), message: text => this.message(text), fail: error => this.fail(error), refresh: root => this.contextUuid === root && this.refreshList && this.body.dataset.materialList === "true" ? this.refreshList() : this.library(root)}, this.body);
    this.editorRoot.id = "workbench-markdown-editor"; this.editorRoot.hidden = true; this.conflict.hidden = true;
    this.conflict.append(element("p", "检测到外部版本变化，当前草稿已保留。"), button("另存草稿并继续", () => void this.keepDraft(false).catch(this.fail)), button("另存草稿后加载外部版本", () => void this.keepDraft(true).catch(this.fail)));
    this.panel.root.append(this.heading, this.conflict, this.body, this.editorRoot, this.status);
    logseq.App.registerCommandPalette({ key: "workbench-materials", label: "工作台：打开材料库" }, () => void this.library().catch(this.fail));

    logseq.App.registerCommandPalette({ key: "workbench-capture-text", label: "工作台：收纳当前块长文本" }, () => {
      const epoch = this.epoch;
      void this.sources.captureCurrentBlock().then(async result => { this.assertScope(epoch); this.contextUuid = result.material.sourceUuid; await this.openDoc(result.material.id); if (result.status === "partial") this.message(result.problem ?? "引用未插入。"); }).catch(this.fail);
    });

    const doc = hostDocument();
    // A native anchor's default pointer/mouse down blurs Logseq's textarea
    // before its click reaches us. Keep the real editor and selection in place;
    // the later trusted click still opens the read-only preview.
    const preserveNativeInput = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a,[data-href]");
      const href = anchor?.getAttribute("href") ?? anchor?.getAttribute("data-href") ?? "";
      if (!this.isPreviewCandidate(href)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    doc?.addEventListener("pointerdown", preserveNativeInput, true); doc?.addEventListener("mousedown", preserveNativeInput, true);
    this.disposers.push(() => {doc?.removeEventListener("pointerdown", preserveNativeInput, true); doc?.removeEventListener("mousedown", preserveNativeInput, true);});
    // Stock Logseq's block hover re-renders its native editor when the pointer
    // leaves for a file link. Retain that exact live editor, including composition;
    // ordinary blocks and hover after editing keep their normal host behavior.
    const preserveNativeHover = (event: MouseEvent) => {
      const input = doc?.activeElement;
      if (!input?.matches("#main-content-container .block-editor textarea")) return;
      const target = event.target as Element | null, block = target?.closest?.(".ls-block");
      if (block?.contains(input)) event.stopImmediatePropagation();
    };
    doc?.addEventListener("mouseover", preserveNativeHover, true); doc?.addEventListener("mouseout", preserveNativeHover, true);
    this.disposers.push(() => {doc?.removeEventListener("mouseover", preserveNativeHover, true); doc?.removeEventListener("mouseout", preserveNativeHover, true);});
    const compositionStart = () => this.sources.composition(true), compositionEnd = () => this.sources.composition(false);
    doc?.addEventListener("compositionstart", compositionStart, true); doc?.addEventListener("compositionend", compositionEnd, true);
    this.disposers.push(() => { this.sources.cancelPrompt(); doc?.removeEventListener("compositionstart", compositionStart, true); doc?.removeEventListener("compositionend", compositionEnd, true); });
    const link = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a,[data-href]");
      const href = anchor?.getAttribute("href") ?? anchor?.getAttribute("data-href") ?? "";
      if (!this.isPreviewCandidate(href)) return; event.preventDefault(); event.stopImmediatePropagation();
      const native = (event.target as Element | null)?.closest(".ls-block")?.getAttribute("blockid"), epoch = this.epoch, ticket = ++this.linkEpoch;
      void (async () => {
        const root = native ? this.nativeWorkContext ? await this.nativeWorkContext(native) : native : this.currentWorkRoot?.() ?? this.contextUuid;
        if (epoch !== this.epoch || ticket !== this.linkEpoch || this.disposed || native && root === null) return;
        this.contextUuid = root; await this.openPreviewLink(href, root);
      })().catch(this.fail);
    };
    const paste = (event: ClipboardEvent) => this.sources.onPaste(event);
    doc?.addEventListener("click", link, true); document.addEventListener("click", link, true); doc?.addEventListener("paste", paste, true);
    this.disposers.push(() => { doc?.removeEventListener("click", link, true); document.removeEventListener("click", link, true); doc?.removeEventListener("paste", paste, true); });
    this.disposers.push(logseq.App.onCurrentGraphChanged(() => { this.previews.close(); this.directoryReads.clearMemory(); this.sources.cancelPrompt(); this.preserveDraft(); this.cancelSave(); this.composing = false; this.folderCleanup?.(); this.folderCleanup=null; this.readerMenu?.dispose(); this.readerMenu=null; this.transfers.resetScope(true); closeMaterialPrompts(this.body); this.epoch++; this.current = null; this.mode = "reading"; this.store = null; this.service = null; this.contextUuid = null; this.listPosition = null; void this.panel.close(); }));
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
  private materialBusy(id: string): boolean { return this.current?.id === id && (this.mode === "editing" || this.composing || !!this.saving) || !!localStorage.getItem(this.key(id)); }
  private preserveDraft(): boolean {
    if (!this.dirty() || !this.current || !this.editor) return true;
    try { localStorage.setItem(this.key(), JSON.stringify({ text: this.editor.getValue(), base: this.base, at: Date.now() })); return true; }
    catch { this.message("草稿缓存失败，请先保存或另存后再关闭。"); return false; }
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
    this.graphId = graphIdentity(graph);
    const directory = String(logseq.settings?.materialsDirectory ?? "").trim();
    const root = directory ? normalizeRoot(directory, graph.path) : null;
    if (!this.service || this.graph !== graph.path || this.service.globalRoot !== root) {
      this.graph = graph.path;
      const io=this.directoryReads.attach(desktopFiles(() => graph.path), graph.path, () => this.directories.roots(graph.path));
      const defaultRoot=localStorage.getItem(`workbench:default-material-directory:${graph.path}`);
      if(defaultRoot)this.directories.register(graph.path,normalizeRoot(defaultRoot,graph.path));
      this.service = new MaterialService(io, this.directories, graph.path, root, captureMarkdown, id => !this.materialBusy(id), async()=>{
        const preparationEpoch=this.epoch;
        const directory=await prepareDefaultMaterialDirectory(io,localStorage,graph.path,async problem => { this.message(problem); return pickMaterialDirectory(); });
        this.assertScope(preparationEpoch);return directory;
      });
    }
    return this.service;
  }
  private async workContext(uuid: string | null): Promise<MaterialWorkContext> {
    await this.ensureService();
    const epoch = this.epoch, graph = this.graph;
    // Nearest explicit binding wins; this is source ancestry, not formal ownership.
    let source = uuid;
    if (uuid && this.nativeWorkContext) { source = await this.nativeWorkContext(uuid) ?? uuid; this.assertScope(epoch); }
    const seen = new Set<string>();
    for (let depth = 0; source && depth < 32 && !seen.has(source); depth++) {
      seen.add(source);
      const binding = this.directories.defaultFolder(graph, source);
      if (binding) return {graph, sourceUuid: uuid, ownerUuid: source, directory: binding.directory, organization: binding.organization};
      const block = await this.sources.sourceAction(epoch, graph, () => logseq.Editor.getBlock(source!));
      if (block && parseFormalAnchor(block.content ?? "")) return {graph, sourceUuid: uuid, ownerUuid: source, directory: null, organization: "flat"};
      source = block?.parent?.id === block?.page?.id ? null : block?.parent?.id ? (await this.sources.sourceAction(epoch, graph, () => logseq.Editor.getBlock(block.parent.id)))?.uuid ?? null : null;
    }
    return {graph, sourceUuid: uuid, ...(uuid ? {ownerUuid: uuid} : {}), directory: null, organization: "flat"};
  }
  /** Trusted consumer port; preserves the existing nearest explicit binding. */
  async bindDirectory(sourceUuid: string, directory: string | null, organization: "flat" | "project" = "flat"): Promise<void> {
    const service = await this.ensureService(), epoch = this.epoch;
    const root = directory ? normalizeRoot(directory.trim(), this.graph) : null;
    if (this.bindings) {
      await this.bindings.bind({graph: this.graph, sourceUuid, directory: root, organization}); this.assertScope(epoch); return;
    }
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
  async library(rootUuid: string | null = this.currentWorkRoot?.() ?? this.contextUuid, content = "", tab: "files" | "folders" | "history" = "files"): Promise<void> {
    if (this.disposed) return;
    const navigation = panels.reserve();
    this.rememberList(); await this.leave(); if (this.disposed || !panels.isLatest(navigation)) return;
    this.folderCleanup?.(); this.folderCleanup=null; this.readerMenu?.dispose(); this.readerMenu=null; this.transfers.resetScope(); closeMaterialPrompts(this.body);
    this.epoch++; this.current = null; this.mode = "reading"; this.contextUuid = rootUuid; this.conflict.hidden = true;
    this.message("");
    this.editorRoot.hidden = true; this.body.hidden = false;
    this.refreshList = null;
    this.heading.replaceChildren(element("strong", "材料"), this.closeButton());
    const tabs = element("div", "", "wb-material-tabs"); tabs.setAttribute("role", "tablist");
    for (const [value, label] of [["files", "文件"], ["folders", "目录"], ["history", "已关联"]] as const) {
      const item = button(label, () => void this.library(rootUuid, content, value).catch(this.fail));
      item.setAttribute("role", "tab"); item.setAttribute("aria-selected", String(value === tab)); tabs.append(item);
    }
    this.heading.append(tabs);
    const epoch = this.epoch, service = await this.ensureService(), context = await this.workContext(rootUuid); this.assertScope(epoch);
    this.previews.setScope({graph: this.graph, ownerUuid: context.ownerUuid ?? context.sourceUuid});
    this.previewWorkRoot = this.currentWorkRoot?.() ?? null;
    const results = element("div"), recovery = element("details", "", "wb-material-recovery"), drop = materialDropArea(rootUuid);
    recovery.append(element("summary", "收纳恢复")); recovery.hidden = true;
    results.dataset.materialDropList = rootUuid ?? ""; this.body.dataset.materialList = String(tab !== "folders");
    this.body.replaceChildren(recovery, ...(tab === "files" ? [drop, results] : [results]));
    if (tab === "folders") {
      if (!await this.panel.open(navigation)) return;
      this.mountWorkChrome();
      const service = await this.ensureService(), context = await this.workContext(rootUuid); this.assertScope(epoch);
      this.folderCleanup=await renderMaterialFolders(results, service, context, () => this.assertScope(epoch), directory => {
        if (directory) this.directoryPositions.set(JSON.stringify([this.graph, context.ownerUuid ?? context.sourceUuid]), {root: directory, relative: ""});
        return this.library(rootUuid, content, directory ? "files" : "folders");
      });
      return;
    }
    if (tab === "files") {
      if (this.contextUuid) this.beforeWorkMaterials?.({graphId: this.graphId, rootUuid: this.contextUuid});
      if (!await this.panel.open(navigation)) return; this.mountWorkChrome();
      const positionKey = JSON.stringify([this.graph, context.ownerUuid ?? context.sourceUuid]);
      const directoryUI = await renderMaterialDirectory(results, service, context, {
        valid: () => this.assertScope(epoch), open: async path => {const resolved = await service.resolveDirectoryFile(path, context); this.assertScope(epoch); await this.openDoc(resolved.materialId);},
        grant: async (event, root) => {const pending = directoryGrantFromPaste(event, context.graph, () => desktopBridge().getClipboardData?.("NSFilenamesPboardType") ?? null, root); const grant = await pending; this.assertScope(epoch); await this.directoryReads.remember(grant); this.assertScope(epoch);},
        resume: root => this.directoryReads.resume(context.graph, root),
        decorate: (entry, record) => this.transfers.decorate(entry, record, rootUuid, [{label: "写概述", run: () => this.describe(record.id)}]),
        history: () => this.library(rootUuid, content, "history"),
        ...(this.directoryPositions.get(positionKey) ? {position: this.directoryPositions.get(positionKey)!} : {}), moved: position => this.directoryPositions.set(positionKey, position),
      });
      if (epoch !== this.epoch) {directoryUI.dispose(); return;}
      this.folderCleanup = () => directoryUI.dispose(); this.refreshList = () => directoryUI.refresh(); return;
    }
    results.append(element("p", "正在加载材料…", "wb-material-loading"));
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i); if (!key?.startsWith("workbench:pending:")) continue;
      try {
        const pending = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (typeof pending.plain !== "string" || (pending.graph && pending.graph !== this.graph)) continue;
        if (rootUuid && pending.context?.ownerUuid && pending.context.ownerUuid !== rootUuid) continue;
        recovery.hidden = false;
        recovery.append(button(`${pending.materialId ? "打开已保存材料" : "恢复未完成粘贴"}：${typeof pending.title === "string" ? pending.title : titleOf(pending.plain)}`, () => void (async () => {
          if (pending.materialId) { await this.openDoc(pending.materialId); return; }
          const service = await this.ensureService();
          const result = await service.capture({requestKey: key, text: pending.plain, html: pending.html, title: pending.title}, pending.context ?? await this.workContext(pending.uuid ?? null));
          if (result.status === "success") localStorage.removeItem(key); await this.openDoc(result.material.id);
        })().catch(this.fail)));
      } catch { recovery.hidden = false; recovery.append(element("p", "一条恢复记录不可读，原记录仍保留。")); }
    }
    if (this.contextUuid) this.beforeWorkMaterials?.({ graphId: this.graphId, rootUuid: this.contextUuid });
    if (!await this.panel.open(navigation)) return;
    this.mountWorkChrome();
    const related = new Set([...content.matchAll(/longdoc:\/\/([0-9a-f-]{36})/gi)].map(match => match[1]));
    let searchEpoch = 0;
    const search = async () => {
      const ticket = ++searchEpoch, epoch = this.epoch;
      try {
        const service = await this.ensureService(), entries = await service.list();
        if (ticket !== searchEpoch || epoch !== this.epoch) return;
        const visible = rootUuid ? entries.filter(item => associationsOf(item).some(association => association.graph === this.graph && association.sourceUuid === rootUuid) || related.has(item.id)) : entries;
        const views = await Promise.all(visible.map(item => service.read(item.id, false).catch(error => unavailableMaterialView(item, this.directories.hint(this.graph, item.id) ?? "", error))));
        if (ticket !== searchEpoch || epoch !== this.epoch) return;
        const rendered: HTMLElement[]=[];
        for (const [index, item] of visible.entries()) {
          const view = views[index]!, entry = materialEntry(view, () => {
            this.rememberList(item.id); void this.openDoc(view.id).catch(this.fail);
          }, !!localStorage.getItem(this.key(item.id)));
          const row = this.transfers.decorate(entry, item, rootUuid, [
            {label: "写概述", run: () => this.describe(item.id)},
            ...(view.capabilities.read === "external" ? [{label: "查看详情", run: () => this.openDoc(item.id)}] : []),
            ...(view.availability === "unavailable" ? [{label: "重新定位", run: async () => { await this.openDoc(item.id); await this.relocate(); }}] : []),
            ...(referenceNotice(item) ? [{label: "核验引用与改名", run: () => this.recoverMaterial(item.id)}] : []),
          ]);
          const notice = referenceNotice(item); if (notice) entry.append(element("small", notice, "wb-error")); rendered.push(row);
          if (item.references?.some(ref => ref.mode === "follow-filename")) void this.transfers.sync(item.id).catch(this.fail);
        }
        this.transfers.prune(new Set(visible.map(item=>item.id)));
        if(!visible.length)rendered.push(element("p","还没有材料，拖入文件或文件夹即可开始。"));
        const keep=new Set(rendered);for(const node of Array.from(results.children))if(!keep.has(node as HTMLElement))node.remove();
        let cursor=results.firstElementChild;for(const row of rendered){if(row!==cursor)results.insertBefore(row,cursor);cursor=row.nextElementSibling;}
        drop.classList.toggle("wb-material-drop-compact",visible.length>0);
        this.message(service.listProblems.length ? `${visible.length} 份材料 · 部分目录暂不可读，已有关联保留。` : "");
      } catch (error) { if (epoch === this.epoch) { results.replaceChildren(element("p", error instanceof Error ? error.message : String(error))); this.fail(error); } }
    };
    this.refreshList = search; await search();
    if (this.listPosition?.graph === this.graph && this.listPosition.root === rootUuid) {
      this.body.scrollTop = this.listPosition.scroll;
      if (this.listPosition.selected) results.querySelector<HTMLElement>(`[data-material-id="${this.listPosition.selected}"]`)?.focus({preventScroll: true});
    }
  }
  private async loadEditor(): Promise<EditorConstructor> {
    const target = window as Window & {Vditor?: EditorConstructor};
    if (!target.Vditor) {
      const css = element("link"); css.rel = "stylesheet"; css.href = new URL("./vditor/dist/index.css", location.href).href; document.head.append(css);
      await new Promise<void>((resolve, reject) => { const script = element("script"); script.src = new URL("./vditor/dist/index.min.js", location.href).href; script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(new Error("文档编辑器资源加载失败。")); }; document.head.append(script); });
    }
    if (!target.Vditor) throw new Error("文档编辑器初始化失败。"); return target.Vditor;
  }
  private isPreviewCandidate(href: string): boolean {
    if (idFrom(href)) return true;
    if (/^(?:https?|mailto|tel):|^#|^\[\[/iu.test(href)) return false;
    if (this.graph) return parsePreviewLink(href, this.graph, this.directories.roots(this.graph)).kind !== "other";
    return /^(?:assets:\/\/|file:\/\/|(?:\.\.\/)?assets\/)/iu.test(href) && previewFormat(href) !== "unsupported";
  }
  /** B can call this synchronously before its source-highlight handler. True means
   * this event belongs to file preview; no body/selection/clipboard write occurs. */
  delegateFileClick(event: MouseEvent, rootUuid: string | null, sourcePath?: string): boolean {
    if (event.button !== 0) return false;
    const anchor = (event.target as Element | null)?.closest("a,[data-href]");
    const href = anchor?.getAttribute("href") ?? anchor?.getAttribute("data-href") ?? "";
    if (!this.isPreviewCandidate(href)) return false;
    event.preventDefault(); event.stopImmediatePropagation(); void this.openPreviewLink(href, rootUuid, sourcePath).catch(this.fail); return true;
  }
  async resolveDirectoryFile(path: string, rootUuid: string | null = this.currentWorkRoot?.() ?? this.contextUuid): Promise<DirectoryFileResolution> {
    const epoch = this.epoch, service = await this.ensureService(), context = await this.workContext(rootUuid); this.assertScope(epoch);
    const result = await service.resolveDirectoryFile(path, context); this.assertScope(epoch); return result;
  }
  async openPreviewLink(href: string, rootUuid: string | null = this.currentWorkRoot?.() ?? this.contextUuid, sourcePath?: string): Promise<void> {
    const epoch = this.epoch, service = await this.ensureService(); this.assertScope(epoch);
    const link = parsePreviewLink(href, this.graph, this.directories.roots(this.graph), sourcePath);
    if (link.kind === "unresolved") throw new Error(link.problem);
    if (link.kind === "other") return;
    if (link.kind === "material") {await this.openDoc(link.id, rootUuid); return;}
    if (link.origin === "graph-asset") {await this.openAsset(link.path, rootUuid); return;}
    const context = await this.workContext(rootUuid); this.assertScope(epoch);
    const resolved = await service.resolveDirectoryFile(link.path, context); this.assertScope(epoch);
    await this.openDoc(resolved.materialId, rootUuid);
  }
  private async openAsset(path: string, rootUuid: string | null): Promise<void> {
    const navigation = panels.reserve(); this.rememberList(); await this.leave();
    if (this.disposed || !panels.isLatest(navigation)) return;
    this.folderCleanup?.(); this.folderCleanup = null; this.readerMenu?.dispose(); this.readerMenu = null; this.transfers.resetScope(); closeMaterialPrompts(this.body);
    const epoch = ++this.epoch; this.contextUuid = rootUuid; this.current = null; this.mode = "reading";
    const service = await this.ensureService(), context = await this.workContext(rootUuid); this.assertScope(epoch);
    const reader = new MaterialPreviewReader(service), target: MaterialPreviewTarget = reader.asset(path, {graph: this.graph, ownerUuid: context.ownerUuid ?? context.sourceUuid});
    this.heading.replaceChildren(button("‹ 材料列表", () => void this.library(rootUuid).catch(this.fail)), element("strong", fileName(path)), this.closeButton());
    if (rootUuid && this.returnWork) this.heading.append(this.returnButton());
    this.body.replaceChildren(); this.body.hidden = false; this.editorRoot.hidden = true; this.conflict.hidden = true; delete this.body.dataset.materialList;
    this.message(""); if (rootUuid) this.beforeWorkMaterials?.({graphId: this.graphId, rootUuid});
    if (!await this.panel.open(navigation)) return; this.mountWorkChrome(); this.previewWorkRoot = this.currentWorkRoot?.() ?? null; await this.previews.show(target, reader, this.body);
  }
  async openDoc(id: string, returnUuid?: string | null): Promise<void> {
    if (this.disposed) return;
    const navigation = panels.reserve();
    this.rememberList(); await this.leave(); if (this.disposed || !panels.isLatest(navigation)) return;
    delete this.body.dataset.materialList;
    if (returnUuid !== undefined) this.contextUuid = returnUuid;
    this.folderCleanup?.(); this.folderCleanup=null; this.readerMenu?.dispose(); this.readerMenu=null; this.transfers.resetScope(); closeMaterialPrompts(this.body);
    const epoch = ++this.epoch, service = await this.ensureService();
    let located: Awaited<ReturnType<MaterialService["locate"]>>;
    try { located = await service.locate(id); }
    catch (error) {
      if (epoch !== this.epoch) return;
      this.current = null; this.mode = "reading"; this.editorRoot.hidden = true; this.body.hidden = false;
      this.heading.replaceChildren(element("strong", "材料暂不可用"), button("‹ 材料库", () => void this.library(this.contextUuid).catch(this.fail)));
      if (this.contextUuid && this.returnWork) this.heading.append(this.returnButton());
      this.body.replaceChildren(element("p", error instanceof Error ? error.message : String(error)), button("登记原材料目录", () => void this.registerDirectory(id).catch(this.fail)));
      if (this.contextUuid) this.beforeWorkMaterials?.({ graphId: this.graphId, rootUuid: this.contextUuid });
      if (await this.panel.open(navigation)) this.mountWorkChrome(); return;
    }
    const {store} = located, view = await service.read(id), record = await store.record(id);
    if (epoch !== this.epoch || !panels.isLatest(navigation)) return;
    this.store = store; this.current = record; this.mode = "reading"; this.base = view.content ?? ""; this.stableExternal = null; this.conflict.hidden = true;
    if (located.record.title !== record.title && record.references?.length) void this.transfers.sync(id).catch(this.fail);
    this.heading.replaceChildren(button("‹ 材料列表", () => void this.library(this.contextUuid).catch(this.fail)), element("strong", fileName(view.path)), button("复制链接", () => void this.transfers.copy(id, this.contextUuid, this.body, view.reference).catch(this.fail)), this.closeButton());
    if (this.contextUuid && this.returnWork) this.heading.append(this.returnButton());
    const moreMenu=disclosureMenu("更多","当前材料的更多操作"); this.readerMenu=moreMenu; const more=moreMenu.content; this.heading.append(moreMenu.root);
    more.append(button("改文件名", () => void this.transfers.rename(id, this.contextUuid).catch(this.fail)), button("写概述", () => void this.describe(id).catch(this.fail)), button("同步名称与引用", () => void this.recoverMaterial(id).catch(this.fail)), button("补关联", () => void this.linkExisting(id).catch(this.fail)), button("重新定位", () => void this.relocate().catch(this.fail)), button("来源", () => void this.locate().catch(this.fail)), element("small", `${record.imported ? "导入副本" : record.kind === "reference" ? "原文件" : "收纳创建"} · ${roleLabel(record.role)}`));
    if (record.kind === "capture" && record.sourceUuid) more.append(button("恢复收纳原文", () => void this.restore().catch(this.fail)));
    this.body.hidden = false; this.editorRoot.hidden = true;
    const facts = element("div", "", "wb-material-facts"), location = element("details"), path = element("summary", fileName(view.path));
    location.append(path, element("p", view.path), button("外部打开", () => void this.openExternal(id).catch(this.fail)));
    facts.append(element("strong", fileDetails(view)), location); this.body.replaceChildren(facts);
    const notice = referenceNotice(record); if (notice) this.body.append(element("p", notice, "wb-material-result"), button("核验引用与改名", () => void this.recoverMaterial(id).catch(this.fail)));
    if (view.writeState === "pending") more.append(button("继续保存收纳", () => void store.resumeCapture(record).then(() => this.openDoc(id)).catch(this.fail)));
    if (view.content !== null && view.availability === "available") {
      if (view.writeState === "ready") { const edit = button(record.kind === "reference" && !record.imported ? "编辑原文件" : "编辑", () => void this.beginEditing().catch(this.fail)); edit.dataset.materialEdit = "true"; this.heading.append(edit); }
      this.message(view.writeState === "pending" ? "收纳保存未完成，原文仍保留。可在更多中继续保存。" : "");
    } else if (view.availability === "unavailable") {
      this.body.append(element("p", "文件失联，原关联与历史仍保留。"), button("重新定位", () => void this.relocate().catch(this.fail)));
    }
    if (this.contextUuid) this.beforeWorkMaterials?.({ graphId: this.graphId, rootUuid: this.contextUuid });
    if (!await this.panel.open(navigation)) return;
    this.mountWorkChrome();
    if (view.availability === "available") {
      const context = await this.workContext(this.contextUuid); this.assertScope(epoch);
      const reader = new MaterialPreviewReader(service);
      try {const target = await reader.material(id, {graph: this.graph, ownerUuid: context.ownerUuid ?? context.sourceUuid}); this.assertScope(epoch); this.previewWorkRoot = this.currentWorkRoot?.() ?? null; await this.previews.show(target, reader, this.body);}
      catch (error) {this.assertScope(epoch); this.body.append(element("p", error instanceof Error ? error.message : String(error), "wb-preview-notice"));}
    }
    const draft = localStorage.getItem(this.key());
    if (draft) {
      if (view.content !== null) this.heading.append(button("恢复保留草稿", () => void this.beginEditing(false).catch(this.fail)));
      else this.heading.append(button("查看保留草稿", () => {
        try {
          const saved = JSON.parse(draft); if (typeof saved.text !== "string") throw new Error("草稿记录不可读，原记录仍保留。");
          const input = element("textarea"); input.value = saved.text; input.readOnly = true; input.rows = 12; input.setAttribute("aria-label", "保留草稿"); this.body.append(input); input.focus(); input.select();
        } catch (error) { this.fail(error); }
      }));
    }
  }
  private async beginEditing(grant = true): Promise<void> {
    if (!this.current || !this.store) return;
    const epoch = this.epoch, store = this.store, id = this.current.id;
    if (grant) { const record = await store.grantEditing(id); this.assertScope(epoch); this.current = record; }
    const text = await store.read(id); this.assertScope(epoch); this.previews.clearMain();
    this.mode = "editing"; this.base = text; this.body.hidden = true; this.editorRoot.hidden = false;
    this.heading.querySelector<HTMLElement>('[data-material-edit]')?.setAttribute("hidden", "");
    if (!this.heading.querySelector('[data-material-read]')) {
      const reading = button("完成编辑", () => void this.openDoc(id).catch(this.fail)); reading.dataset.materialRead = "true"; this.heading.append(reading);
      this.heading.querySelector("details")?.append(button("允许 agent 编辑此工作稿", () => void store.grantEditing(id, true).then(record => { this.assertScope(epoch); this.current = record; this.message("已允许 agent 编辑此文件，保存仍需核对版本。"); }).catch(this.fail)));
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
  private async leave(): Promise<void> {
    if (this.disposed) return;
    if (this.composing) throw new Error("请先完成当前输入，再切换材料；草稿仍保留。");
    if (!this.preserveDraft()) throw new Error("草稿缓存暂不可写，请先保存或另存后再离开。");
    this.cancelSave(); await this.save().catch(this.fail); this.previews.clearMain(); this.folderCleanup?.(); this.folderCleanup = null;
  }
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
    // The work view can change after the material panel has closed. Its trusted
    // current root is the authority; a retained native window must then close.
    if (this.previews.hasViews && this.previewWorkRoot !== undefined && (this.currentWorkRoot?.() ?? null) !== this.previewWorkRoot) {this.previews.close(); this.previewWorkRoot = undefined;}
    if (this.mode === "reading") return; // The byte preview owns its own version checks.
    if (!this.panel.visible || !this.current || !this.store || this.pollBusy || this.saving || this.disposed) return;
    this.pollBusy = true; const epoch = this.epoch;
    try {
      const text = await this.store.read(this.current.id);
      if (epoch !== this.epoch || this.disposed) return;
      if (text === this.base) { this.stableExternal = null; return; }
      if (this.stableExternal !== text) { this.stableExternal = text; return; }
      if (this.dirty() || this.composing) { this.preserveDraft(); this.conflict.hidden = false; this.message("外部版本变化，当前草稿已保留。"); return; }
      if (Date.now() < this.inputUntil) return;
      this.base = text; this.setEditor(text); this.message("已同步外部修改");
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
  private rememberList(selected: string | null = null): void {
    if (this.body.dataset.materialList !== "true") return;
    this.listPosition = {graph: this.graph, root: this.contextUuid, query: "", scroll: this.body.scrollTop, selected: selected ?? this.listPosition?.selected ?? null};
  }
  async returnToBody(): Promise<void> {
    const root = this.contextUuid ?? this.currentWorkRoot?.();
    if (!root || !this.returnWork) throw new Error("请从一份工作的正文打开材料，再返回正文。");
    await this.leave(); await this.returnWork(root);
  }
  private async openExternal(id: string): Promise<void> {
    const epoch = this.epoch, material = await (await this.ensureService()).read(id); this.assertScope(epoch);
    if (material.availability !== "available") { await this.openDoc(id); return; }
    const result = await desktopBridge().openPath(material.path); this.assertScope(epoch);
    if (typeof result === "string" && result) throw new Error(`默认应用未打开文件：${result}`);
    this.message(`已交给默认应用：${fileName(material.path)}`);
  }
  private async describe(id: string): Promise<void> {
    const epoch = this.epoch, service = await this.ensureService(), view = await service.read(id); this.assertScope(epoch);
    await materialAction(this.body, "一句话概述", view.summary ?? "", "仅帮助认出材料；留空可清除，不改文件名、正文或引用别名。", async value => {
      this.assertScope(epoch); await service.describe(id, value); this.assertScope(epoch); await this.library(this.contextUuid);
    }, true);
  }
  private async recoverMaterial(id: string): Promise<void> {
    const epoch = this.epoch, reading = this.current?.id === id, root = this.contextUuid;
    const result = await this.transfers.recover(id); this.assertScope(epoch);
    if (reading) await this.openDoc(id); else await this.library(root);
    this.message(result.problem ?? "已核验改名与引用结果。");
  }
  async capture(request: CaptureRequest, actor: "user" | "agent" = "agent"): Promise<MaterialResult> {
    const epoch = this.epoch, service = await this.ensureService();
    const context = await this.workContext(request.sourceUuid ?? this.contextUuid);
    const result = await service.capture(request, context, actor);
    if (result.status === "partial") return result;
    if (context.sourceUuid) return this.sources.insertReference(result, context.sourceUuid, epoch, context.graph);
    return result;
  }
  async importMaterial(input: {path: string; requestKey: string; sourceUuid: string}): Promise<MaterialResult> {
    const service = await this.ensureService(), context = await this.workContext(input.sourceUuid);
    return service.importFile({name: fileName(input.path), path: input.path}, context, input.requestKey);
  }
  async listMaterials(sourceUuid: string | null = this.contextUuid, query = ""): Promise<{status: "success" | "partial"; materials: MaterialView[]; problems: string[]}> {
    const epoch = this.epoch, service = await this.ensureService(), result = await service.listViews(query, sourceUuid);
    this.assertScope(epoch); return result;
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
  private async linkExisting(id: string): Promise<void> {
    const block = this.contextUuid ? await logseq.Editor.getBlock(this.contextUuid) : await logseq.Editor.getCurrentBlock();
    if (!block) throw new Error("请先选择需要关联的工作块。");
    const result = await this.associateMaterial({id, sourceUuid: block.uuid}); this.message(result.status === "partial" ? result.problem ?? "引用未插入。" : "已关联当前工作。");
  }
  private async relocate(): Promise<void> {
    if (!this.current || !this.store) return;
    const epoch = this.epoch, id = this.current.id, store = this.store; this.body.hidden = false;
    const path = await materialPrompt(this.body, "重新定位到文件绝对路径", await store.path(id)); this.assertScope(epoch);
    if (!path) return;
    // Keep the existing draft and its base; the new file is read as an external version.
    this.preserveDraft(); await store.relocate(id, path.trim()); this.assertScope(epoch); await this.transfers.sync(id); this.assertScope(epoch); await this.openDoc(id);
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
    const before = this.epoch, service = await this.ensureService(), context = await this.workContext(this.contextUuid);
    this.assertScope(before); this.rememberList(); await this.leave(); this.assertScope(before);
    const epoch = ++this.epoch; this.current = null; this.mode = "reading"; delete this.body.dataset.materialList;
    this.editorRoot.hidden = true; this.body.hidden = false; this.conflict.hidden = true;
    if (!context.directory) throw new Error("请先绑定工作目录。");
    const sourceUuid = context.sourceUuid;
    if (!sourceUuid) throw new Error("请从当前工作的材料入口查看目录。");
    const observer=this.directoryObserver;
    const list=element("div");
    const header=()=>{
      this.heading.replaceChildren(element("strong","工作目录文件"),button("‹ 已关联材料",()=>void this.library(sourceUuid).catch(this.fail)));
      if(this.returnWork)this.heading.append(this.returnButton());
    };
    const preview=async(path:string,read:()=>Promise<{content?:string|null}>,associate:()=>Promise<MaterialResult>)=>{
      this.assertScope(epoch);
      const view=await read();this.assertScope(epoch);
      // Preview owns no material identity, editing permission or source reference.
      this.heading.replaceChildren(element("strong",path.split("/").at(-1)??"目录文件"),button("‹ 目录文件",()=>void this.directoryFiles().catch(this.fail)),button("关联当前工作",()=>{
        if(epoch!==this.epoch)return;
        void associate().then(result=>{this.assertScope(epoch);return this.openDoc(result.material.id);}).catch(this.fail);
      }));
      if(this.returnWork)this.heading.append(this.returnButton());
      const reading=view.content===null||view.content===undefined?element("p","此格式或大小不支持正文预览，可在默认应用查看。"): /\.(md|markdown)$/i.test(path)?renderReading(view.content):element("pre",view.content,"wb-reading");
      reading.style.whiteSpace=reading.tagName==="PRE"?"pre-wrap":"";
      this.body.replaceChildren(element("small","目录文件 · 尚未关联 · 只读预览"),reading,button("在默认应用打开",()=>void this.openUnassociated(path,epoch).catch(this.fail)));
      this.message("查看不会关联或授权编辑。需要使用时再关联当前工作。");
    };
    if(observer?.available(context)){
      const observed=await observer.list(context);this.assertScope(epoch);
      header();this.body.replaceChildren(list);
      for(const file of observed.files){
        if(file.kind!=="file")continue;
        const row=element("div","","wb-material-entry");row.append(element("small",file.materialId?"已关联材料":"目录文件 · 尚未关联"));
        const read=async()=>{
          this.assertScope(epoch);
          if(file.materialId){await this.openDoc(file.materialId);return;}
          await preview(file.path,()=>observer.read(file.path,context),()=>service.associateFile(file.path,context));
        };
        if(file.availability==="available")row.prepend(button(fileName(file.path),()=>void (/\.(md|markdown|txt)$/i.test(file.path)?read():this.openUnassociated(file.path,epoch)).catch(this.fail)));
        if(!file.materialId&&file.availability==="available")row.append(button("关联",()=>{
          if(epoch!==this.epoch)return;
          void service.associateFile(file.path,context).then(result=>{this.assertScope(epoch);return this.openDoc(result.material.id);}).catch(this.fail);
        }));
        list.append(row);
      }
      this.message(observed.truncated?"目录较大，仅显示部分文件。可通过关联文件入口指定路径。":"阅读不自动关联；关联后仍按原材料权限使用。");return;
    }
    const entries = await service.io.list(context.directory); this.assertScope(epoch);
    const materials=await service.list("",sourceUuid);this.assertScope(epoch);
    header();this.body.replaceChildren(list);
    for (const entry of entries.slice(0, 200)) {
      const path = entry.startsWith("/") ? entry : `${context.directory}/${entry}`;
      if (!path.startsWith(context.directory+"/") || /\/(\.longdoc|\.task-workspace|\.git)(\/|$)/.test(path)) continue;
      if (service.io.stat && (await service.io.stat(path)).type !== "file") continue;
      this.assertScope(epoch);
      const material=materials.find(record=>record.path===path);
      const row=element("div","","wb-material-entry");row.append(element("small",material?"已关联材料":"目录文件 · 尚未关联"));
      const read=async()=>{
        this.assertScope(epoch);
        if(material){await this.openDoc(material.id);return;}
        await preview(path,async()=>{
          const info=await service.io.stat?.(path);this.assertScope(epoch);
          if(!info||info.type!=="file"||info.size>262144||! /\.(md|markdown|txt)$/i.test(path))return {content:null};
          const content=await service.io.read(path);this.assertScope(epoch);return {content};
        },()=>service.associateFile(path,context));
      };
      row.prepend(button(fileName(path),()=>void (/\.(md|markdown|txt)$/i.test(path)?read():this.openUnassociated(path,epoch)).catch(this.fail)));
      if(!material)row.append(button("关联",()=>{
        if(epoch!==this.epoch)return;
        void service.associateFile(path,context).then(result=>{this.assertScope(epoch);return this.openDoc(result.material.id);}).catch(this.fail);
      }));
      list.append(row);
    }
    if(!list.childElementCount)list.append(element("p","目录中暂无可查看的文件。"));
    this.message(entries.length > 200 ? "显示前 200 项，可用关联文件入口指定其他路径。" : "阅读不自动关联；关联后原文件仍留在原处。");
  }
  private async openUnassociated(path: string, epoch: number): Promise<void> {
    this.assertScope(epoch); const service = await this.ensureService(); this.assertScope(epoch);
    path = normalizeRoot(path, this.graph);
    if (!service.io.stat || (await service.io.stat(path)).type !== "file") throw new Error("文件暂不可用，请刷新目录。");
    this.assertScope(epoch); const result = await desktopBridge().openPath(path); this.assertScope(epoch);
    if (typeof result === "string" && result) throw new Error(`默认应用未打开文件：${result}`);
    this.message("已交给默认应用；查看没有加入材料或授权编辑。");
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
    this.previews.close(); this.directoryReads.clearMemory(); this.directoryPositions.clear();
    this.folderCleanup?.(); this.readerMenu?.dispose(); closeMaterialPrompts(this.body); this.transfers.dispose();
    if (this.disposed) return;
    this.disposed = true; this.epoch++; this.preserveDraft(); this.cancelSave(); window.clearInterval(this.timer);
    for (const off of this.disposers) off();
    // An already-started save settles against its captured store before the editor is destroyed.
    const saving = this.saving;
    void this.panel.close().catch(this.fail).finally(async () => { await saving?.catch(() => undefined); this.editor?.destroy(); this.editor = null; });
  }
}
