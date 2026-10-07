import type {MaterialPreviewReader} from "./reader.ts";
import {renderMaterialPreview} from "./render.ts";
import {parsePreviewLink} from "./paths.ts";
import {previewImageInfo} from "./images.ts";
import type {MaterialPreviewSnapshot, MaterialPreviewTarget, PreviewRenderContext, PreviewRendered, PreviewScope} from "./types.ts";

export class PreviewResources {
  readonly abort = new AbortController();
  private readonly urls = new Set<string>();
  private bytes = 0;
  context(reader: MaterialPreviewReader, target: MaterialPreviewTarget): PreviewRenderContext {
    return {signal: this.abort.signal, resourceBase: window.location.href,
      objectURL: blob => {
        this.abort.signal.throwIfAborted();
        if (this.urls.size >= 256 || this.bytes + blob.size > 80 * 1024 * 1024) throw new Error("此预览的图片与本地资源超过读取边界。");
        const url = URL.createObjectURL(blob); this.urls.add(url); this.bytes += blob.size; return url;
      }, ownsURL: url => this.urls.has(url),
      localImage: async href => {
        const link = parsePreviewLink(href, target.scope.graph, reader.service.directories.roots(target.scope.graph), target.path);
        if (link.kind !== "local-file") throw new Error(link.kind === "unresolved" ? link.problem : "本地图片位置无法可靠解析。");
        if (!reader.io.readBytes) throw new Error("此宿主不能读取原始图片字节。");
        const bytes = await reader.io.readBytes(link.path, {signal: this.abort.signal, maxBytes: 16 * 1024 * 1024}), info = previewImageInfo(bytes);
        return this.context(reader, target).objectURL(new Blob([bytes], {type: info.type}));
      }};
  }
  dispose(): void {this.abort.abort(); for (const url of this.urls) URL.revokeObjectURL(url); this.urls.clear(); this.bytes = 0;}
  get activeURLs(): number {return this.urls.size;}
}
interface PreviewView { dispose(): void; snapshot: MaterialPreviewSnapshot; root: HTMLElement }
function control(doc: Document, label: string, action: () => void): HTMLButtonElement {const button = doc.createElement("button"); button.type = "button"; button.textContent = label; button.onclick = action; return button;}
export type PreviewLinkDelegate = (href: string, source: MaterialPreviewTarget) => Promise<void>;

/** Main and native-window views each own cancellation, URLs, worker and listeners.
 * A changed file never silently substitutes the snapshot the user is reading. */
export class MaterialPreviews {
  private main: PreviewView | null = null;
  private loading: PreviewResources | null = null;
  private readonly windows = new Map<Window, {view: PreviewView | null; resources: PreviewResources; snapshot: MaterialPreviewSnapshot}>();
  private scope: PreviewScope | null = null;
  private generation = 0;
  constructor(private readonly delegate: PreviewLinkDelegate, private readonly failed: (error: unknown) => void) {}
  setScope(scope: PreviewScope): void {
    if (this.scope?.graph !== scope.graph || this.scope.ownerUuid !== scope.ownerUuid) {this.close(); this.scope = {...scope};}
  }
  clearMain(): void {this.generation++; this.loading?.dispose(); this.loading = null; this.main?.dispose(); this.main = null;}
  async show(target: MaterialPreviewTarget, reader: MaterialPreviewReader, parent: HTMLElement): Promise<void> {
    this.setScope(target.scope); this.clearMain();
    const generation = this.generation, resources = new PreviewResources(); this.loading = resources;
    const placeholder = document.createElement("p"); placeholder.textContent = "正在读取文件…"; placeholder.setAttribute("role", "status"); parent.append(placeholder);
    try {
      const snapshot = await reader.read(target, resources.abort.signal);
      const view = await this.view(snapshot, reader, resources, document, window, () => this.openWindow(snapshot, reader));
      if (generation !== this.generation || resources.abort.signal.aborted) {view.dispose(); return;}
      placeholder.replaceWith(view.root); this.main = view; this.loading = null;
    } catch (error) {
      resources.dispose(); if (generation !== this.generation) return;
      this.loading = null; placeholder.textContent = error instanceof Error ? error.message : String(error); placeholder.className = "wb-preview-notice";
    }
  }
  private openWindow(snapshot: MaterialPreviewSnapshot, reader: MaterialPreviewReader): void {
    for (const [native, entry] of this.windows) if (!native.closed && entry.snapshot.target.key === snapshot.target.key && entry.snapshot.version === snapshot.version) {native.focus(); return;}
    if (this.windows.size >= 4) {this.failed(new Error("已有 4 个独立预览窗口，请关闭一个后再打开。")); return;}
    // Called directly by a trusted click; no async work precedes native window creation.
    const native = window.open("about:blank", `workbench-preview-${crypto.randomUUID()}`, "width=900,height=720,resizable=yes,scrollbars=yes");
    if (!native || native.closed) {this.failed(new Error("宿主未打开独立预览窗口；当前预览仍保留。")); return;}
    const scope = this.scope, resources = new PreviewResources(), entry = {view: null as PreviewView | null, resources, snapshot};
    this.windows.set(native, entry);
    native.document.title = snapshot.target.fileName;
    const style = native.document.createElement("style"); style.textContent = previewCSS;
    native.document.head.append(style); native.document.body.className = "wb-preview-window";
    const loading = native.document.createElement("p"); loading.textContent = "正在打开只读预览…"; native.document.body.append(loading);
    const closed = () => {resources.dispose(); this.windows.get(native)?.view?.dispose(); this.windows.delete(native);};
    native.addEventListener("pagehide", closed, {once: true});
    void this.view(snapshot, reader, resources, native.document, native).then(view => {
      if (native.closed || resources.abort.signal.aborted || this.scope !== scope || scope?.graph !== snapshot.target.scope.graph) {view.dispose(); if (!native.closed) native.close(); return;}
      // Main view navigation within the same work does not retarget the independent window.
      entry.view = view; loading.replaceWith(view.root);
    }).catch(error => {resources.dispose(); if (!native.closed) loading.textContent = error instanceof Error ? error.message : String(error);});
  }
  private async view(snapshot: MaterialPreviewSnapshot, reader: MaterialPreviewReader, resources: PreviewResources, doc: Document, surfaceWindow: Window, enlarge?: () => void): Promise<PreviewView> {
    const root = doc.createElement("section"), bar = doc.createElement("div"), name = doc.createElement("strong"), status = doc.createElement("p"), notices = doc.createElement("div");
    root.className = "wb-material-preview"; bar.className = "wb-preview-tools"; name.textContent = snapshot.target.fileName; status.className = "wb-preview-notice"; status.setAttribute("role", "status");
    root.dataset.previewTarget = snapshot.target.key; root.dataset.previewVersion = snapshot.version; root.dataset.previewFormat = snapshot.target.format;
    bar.append(name); if (enlarge) bar.append(control(doc, "独立窗口", enlarge)); root.append(bar, status, notices);
    let rendered: PreviewRendered | null = null, timer: ReturnType<typeof setTimeout> | null = null, busy = false, disposed = false;
    const dispose = () => {if (disposed) return; disposed = true; if (timer) clearTimeout(timer); surfaceWindow.removeEventListener("focus", refresh); window.removeEventListener("focus", refresh); root.removeEventListener("click", click); rendered?.dispose(); resources.dispose(); root.remove();};
    const refresh = () => {
      if (disposed || busy || resources.abort.signal.aborted) return;
      if (timer) clearTimeout(timer); timer = null; busy = true;
      void reader.read(snapshot.target, resources.abort.signal).then(current => {
        if (disposed) return;
        if (current.target.path !== snapshot.target.path) status.textContent = "材料位置已变化；这里保留打开时版本，请从材料列表重新打开。";
        else if (current.version !== snapshot.version) status.textContent = "原文件已变化；这里保留打开时版本，请重新打开核对。";
        else status.textContent = snapshot.identityNotice ?? "";
      }).catch(error => {if (!disposed) status.textContent = `${error instanceof Error ? error.message : String(error)} 这里保留打开时版本，原关联与历史保留。`;}).finally(() => {busy = false; if (!disposed) timer = setTimeout(refresh, 3000);});
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest("a"); if (!anchor || !root.contains(anchor)) return;
      const href = anchor.getAttribute("href") ?? "";
      const resolved = parsePreviewLink(href, snapshot.target.scope.graph, reader.service.directories.roots(snapshot.target.scope.graph), snapshot.target.path);
      if (resolved.kind === "other") return;
      event.preventDefault(); event.stopImmediatePropagation(); void this.delegate(href, snapshot.target).catch(this.failed);
    };
    try {
      rendered = await renderMaterialPreview(snapshot, resources.context(reader, snapshot.target)); resources.abort.signal.throwIfAborted();
      status.textContent = snapshot.identityNotice ?? "";
      for (const text of rendered.notices) {const notice = doc.createElement("p"); notice.className = "wb-preview-notice"; notice.textContent = text; notices.append(notice);}
      root.dataset.previewComplete = String(rendered.complete); root.append(rendered.element);
      root.addEventListener("click", click); surfaceWindow.addEventListener("focus", refresh); if (surfaceWindow !== window) window.addEventListener("focus", refresh);
      timer = setTimeout(refresh, 3000);
      return {root, snapshot, dispose};
    } catch (error) {dispose(); throw error;}
  }
  close(): void {this.clearMain(); for (const [native, entry] of this.windows) {entry.resources.dispose(); entry.view?.dispose(); if (!native.closed) native.close();} this.windows.clear(); this.scope = null;}
  get independentWindows(): number {return this.windows.size;}
}
export const previewCSS = `
.wb-material-preview{min-width:0;max-width:100%;color:var(--ls-primary-text-color,#30323b);font:15px/1.6 system-ui,sans-serif}
.wb-preview-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;position:sticky;top:0;background:var(--ls-primary-background-color,#fff);z-index:1}
.wb-preview-tools strong{overflow-wrap:anywhere;flex:1 1 180px}.wb-preview-tools button,.wb-preview-tools input,.wb-preview-tools select{font:inherit;color:inherit;background:transparent;border:1px solid #8887;border-radius:6px;padding:4px 8px}
.wb-preview-tools button{cursor:pointer}.wb-preview-tools input{width:64px}.wb-preview-notice{font-size:13px;color:var(--ls-secondary-text-color,#62646d);overflow-wrap:anywhere}.wb-preview-document{overflow-wrap:anywhere}.wb-preview-document img{max-width:100%;height:auto}.wb-preview-document table{display:block;overflow:auto;border-collapse:collapse}.wb-preview-document td,.wb-preview-document th{border:1px solid #8887;padding:6px 10px}.wb-preview-document pre{overflow:auto;background:#8881;padding:12px;border-radius:6px}
.wb-material-preview table,.wb-material-preview td,.wb-material-preview th{color:inherit}.wb-material-preview a{color:var(--ls-link-text-color,#4778b8)}.wb-material-heading{flex-wrap:wrap}.wb-material-heading>strong{flex:1 1 100%;overflow-wrap:anywhere;order:-1}
.wb-preview-image-surface,.wb-preview-pdf-surface,.wb-preview-sheet-surface{overflow:auto;max-width:100%}.wb-preview-image-surface img{display:block;height:auto}.wb-preview-pdf canvas{display:block;max-width:none}.wb-preview-sheet table{border-collapse:collapse;font-size:13px}.wb-preview-sheet td,.wb-preview-sheet th{border:1px solid #8886;padding:4px 8px;min-width:70px;white-space:pre-wrap;max-width:320px;overflow-wrap:anywhere}.wb-preview-sheet th{background:#8882;position:sticky;top:0}.wb-preview-window{margin:0;padding:16px;background:var(--ls-primary-background-color,#fff)}
@media(prefers-color-scheme:dark){.wb-preview-window{--ls-primary-background-color:#24262b;--ls-primary-text-color:#e6e7eb;--ls-secondary-text-color:#b2b5bd}}
`;
