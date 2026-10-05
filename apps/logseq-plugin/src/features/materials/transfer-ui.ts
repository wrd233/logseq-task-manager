import { button, element, hostDocument } from "../../host/panel-host.ts";
import type { MaterialWorkContext } from "../../workspace/material-context.ts";
import type { SourceScope } from "../../workspace/source-protocol.ts";
import type { MaterialService } from "./service.ts";
import type { MaterialRecord } from "./store.ts";
import { makeLink, versionOf } from "./store.ts";
import { MaterialReferences, type ReferenceFact } from "./references.ts";
import { droppedPath, materialDrag, MATERIAL_MIME, supportsDrop, readDroppedFolder, type MaterialTransferPort } from "./drop.ts";
import { fileTitle } from "./names.ts";
import { materialAction } from "./ui.ts";
import { copyMaterialLink } from "../../host/clipboard.ts";

export interface MaterialTransferHost {
  service(): Promise<MaterialService>;
  context(root: string | null): Promise<MaterialWorkContext>;
  ticket(): number; assert(ticket: number): void;
  busy(id: string): boolean;
  message(text: string): void; fail(error: unknown): void;
  refresh(root: string | null): Promise<void>;
}
/** Native/iframe event adapter. File semantics and source writing stay in existing cores. */
export class MaterialTransfers {
  private port: MaterialTransferPort | null = null;
  private readonly off: Array<() => void> = [];
  private copied: {id: string; text: string; scope: SourceScope; at: number} | null = null;
  private disposed = false;
  private composing = false;
  private readonly renaming = new Set<string>();
  private hover: Element | null = null;
  private hint: HTMLElement | null = null;
  private hoverTicket = 0;
  private readonly links = new Map<string, string>();
  constructor(private readonly host: MaterialTransferHost, private readonly form: HTMLElement) {
    for (const doc of new Set([document, hostDocument()].filter((value): value is Document => !!value))) {
      const over = (event: DragEvent) => {
        const target = event.target as Element | null;
        if (!supportsDrop(event.dataTransfer) || !target?.closest) return;
        const list = target.closest('[data-material-drop-list]'), body = this.port?.body(target);
        if (!list && !body) { this.clearHover(); return; }
        event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        const surface = list ?? body!;
        if (surface === this.hover) return;
        this.clearHover(); this.hover = surface; surface.classList.add("wb-material-drag-target");
        this.hint = element("p", list ? "加入材料，正文不变" : "正在核验段落…", "wb-material-drop-hint"); this.hint.setAttribute("role", "status"); surface.append(this.hint);
        if (body && this.port) {
          const ticket = this.hoverTicket, port = this.port;
          void port.resolve(body).then(mapped => {
            if (ticket === this.hoverTicket && this.hint) this.hint.textContent = mapped && !this.composing && port.valid(mapped.scope) ? "在该段下插入链接" : "此处不能插入；文件可加入当前材料";
          }).catch(() => { if (ticket === this.hoverTicket && this.hint) this.hint.textContent = "此处不能插入；请使用材料列表"; });
        }
      };
      const drop = (event: DragEvent) => {
        const target = event.target as Element | null;
        if (!supportsDrop(event.dataTransfer) || !target?.closest) return;
        const list = target.closest<HTMLElement>('[data-material-drop-list]'), body = this.port?.body(target) ?? null;
        if (!list && !body) return;
        event.preventDefault(); event.stopPropagation();
        this.clearHover();
        // Snapshot the payload synchronously; DataTransfer is protected after dispatch.
        const files = Array.from(event.dataTransfer!.files), internal = event.dataTransfer!.getData(MATERIAL_MIME);
        const folders = new Map<number, FileSystemDirectoryEntry>();
        for (const [index, item] of Array.from(event.dataTransfer!.items ?? []).entries()) { const entry = item.webkitGetAsEntry?.(); if (entry?.isDirectory) folders.set(index, entry as FileSystemDirectoryEntry); }
        void this.drop(files, internal, list?.dataset.materialDropList ?? null, body, folders).catch(this.host.fail);
      };
      const paste = (event: ClipboardEvent) => this.nativePaste(event);
      const start = () => { this.composing = true; }, end = () => { this.composing = false; };
      const leave = (event: DragEvent) => { if (this.hover && (!(event.relatedTarget as Node | null)?.nodeType || !this.hover.contains(event.relatedTarget as Node))) this.clearHover(); };
      const finish = () => this.clearHover();
      doc.addEventListener("dragover", over, true); doc.addEventListener("drop", drop, true); doc.addEventListener("paste", paste, true);
      doc.addEventListener("compositionstart", start, true); doc.addEventListener("compositionend", end, true);
      doc.addEventListener("dragleave", leave, true); doc.addEventListener("dragend", finish, true);
      this.off.push(() => { doc.removeEventListener("dragover", over, true); doc.removeEventListener("drop", drop, true); doc.removeEventListener("paste", paste, true); doc.removeEventListener("compositionstart", start, true); doc.removeEventListener("compositionend", end, true); doc.removeEventListener("dragleave", leave, true); doc.removeEventListener("dragend", finish, true); });
    }
  }
  private clearHover(): void { this.hoverTicket++; this.hover?.classList.remove("wb-material-drag-target"); this.hover = null; this.hint?.remove(); this.hint = null; }
  setPort(port: MaterialTransferPort | null): void { this.clearHover(); this.port = port; }
  addFiles(files: File[], root: string | null): Promise<void> { return this.drop(files, "", root, null); }
  decorate(entry: HTMLElement, record: MaterialRecord, root: string | null, actions: Array<{label: string; run: () => Promise<void>}> = []): HTMLElement {
    this.links.set(record.id, makeLink(record));
    const row = element("div", "", "wb-material-entry"); row.append(entry);
    const more = element("details"), summary = element("summary", "操作"); summary.setAttribute("aria-label", `${record.title} 的材料操作`);
    more.append(summary, button("复制链接", () => void this.copy(record.id, root).catch(this.host.fail)), button("改文件名", () => void this.rename(record.id, root).catch(this.host.fail))); row.append(more);
    for (const action of actions) more.append(button(action.label, () => void action.run().catch(this.host.fail)));
    entry.draggable = !!root;
    entry.addEventListener("dragstart", event => {
      const data = (event as DragEvent).dataTransfer;
      if (!data || !root || !this.port) { event.preventDefault(); return; }
      // Scope is frozen before pointer dispatch by decorateScope; async writes never use a drag flag as authority.
      const raw = entry.dataset.materialScope;
      if (!raw) { event.preventDefault(); return; }
      data.setData(MATERIAL_MIME, JSON.stringify({schemaVersion: 1, materialId: record.id, scope: JSON.parse(raw)}));
      data.setData("text/plain", makeLink(record)); data.effectAllowed = "copyLink";
    });
    if (root && this.port) {
      const ticket = this.host.ticket();
      void this.port.scope(root).then(scope => { this.host.assert(ticket); entry.dataset.materialScope = JSON.stringify(scope); }).catch(this.host.fail);
    }
    return row;
  }
  private async drop(files: File[], internal: string, listRoot: string | null, body: Element | null, folders = new Map<number, FileSystemDirectoryEntry>()): Promise<void> {
    const queue = element("div", "", "wb-material-imports"); queue.setAttribute("role", "status");
    const rows = files.map(file => { const row = element("div", "", "wb-material-import-row"), state = element("small", "等待加入…"); row.append(element("span", file.name), state); queue.append(row); return {row, state, key: crypto.randomUUID()}; });
    if (files.length) (body ?? this.form).prepend(queue);
    const ticket = this.host.ticket(), service = await this.host.service(); this.host.assert(ticket);
    const port = this.port, target = body && port && !this.composing ? await port.resolve(body) : null;
    this.host.assert(ticket);
    const current = port?.currentScope(), root = body ? target?.scope.rootUuid ?? current?.rootUuid ?? null : listRoot || null;
    if (body && !root) { this.announce("该位置没有可靠原文映射。请拖入当前工作的材料列表，或复制链接到原生编辑器。"); return; }
    if (body && current && (await port!.scope(current.rootUuid)).graphId !== current.graphId) throw new Error("当前 Graph 已变化，文件没有加入其他工作。");
    const context = await this.host.context(root); this.host.assert(ticket);
    const ids: string[] = [], problems: string[] = []; let folderCount = 0;
    const remember = (material: {id: string; reference: string}) => { if (!ids.includes(material.id)) ids.push(material.id); this.links.set(material.id, material.reference); };
    if (internal) {
      if (!port || !root) throw new Error("请从当前工作的材料入口拖动。");
      const payload = materialDrag(internal, await port.scope(root)); this.host.assert(ticket);
      ids.push((await service.associate(payload.materialId, context)).material.id);
    } else {
      for (const [index, file] of files.entries()) {
        const progress = rows[index]!;
        try {
          const run = async () => {
            this.host.assert(ticket); progress.state.textContent = "正在加入…";
            const nativePath = (file as File & {path?: string}).path;
            if (folders.has(index) || nativePath && (await service.io.stat?.(nativePath))?.type === "directory") {
              const entry = folders.get(index);
              const result = entry && !nativePath ? await service.importFolderBytes(file.name, (await readDroppedFolder(entry)).map(item => ({relative: item.relative, bytes: () => item.file.arrayBuffer()})), context, progress.key) : await service.importDirectory(nativePath!, context, progress.key);
              for (const value of result.materials) remember(value.material);
              if (result.problems.length) throw new Error(result.problems.join("；"));
              folderCount++;
            } else {
              const path = await droppedPath(file, service.io); this.host.assert(ticket);
              const value = await service.importFile(path ? {name: file.name, path} : {name: file.name, bytes: await file.arrayBuffer()}, context, progress.key);
              remember(value.material);
            }
            this.host.assert(ticket); progress.state.textContent = "已加入";
          };
          progress.row.dataset.importState = "pending";
          const failed = (error: unknown) => {
            progress.row.dataset.importState = "failed"; progress.state.textContent = `未加入：${error instanceof Error ? error.message : String(error)}`;
            if (!progress.row.querySelector("button")) progress.row.append(button("重试", () => void run().then(async () => { await this.host.refresh(root); progress.row.remove(); }).catch(failed)));
          };
          try { await run(); progress.row.dataset.importState = "complete"; if (!body) { await this.host.refresh(root); progress.row.remove(); } }
          catch (error) { failed(error); throw error; }
        } catch (error) { this.host.assert(ticket); problems.push(`${file.name} 未加入：${error instanceof Error ? error.message : String(error)}`); }
      }
    }
    this.host.assert(ticket);
    if (body && !target) {
      this.announce(`${ids.length ? `已加入 ${ids.length} 份材料；` : ""}该位置没有可靠原文映射，正文未插入链接。${problems.join(" ")} 可复制链接继续。`);
      const continuation = element("div", "", "wb-material-result"); continuation.dataset.materialContinuation = "true";
      for (const id of ids) continuation.append(button("复制材料链接", () => void this.copy(id, root, continuation).catch(this.host.fail)));
      body.parentElement?.append(continuation); return;
    }
    if (target && port) {
      for (const id of ids) {
        this.host.assert(ticket);
        if (!port.valid(target.scope)) { problems.push("材料已关联，当前工作或原生输入已变化。请重新选择落点，或复制链接。"); break; }
        const result = await new MaterialReferences(service, port.content).insert(id, target, `material-drop:${await versionOf(JSON.stringify([target.scope, target.sourceId, target.contentVersion, id]))}`);
        if (result.status === "partial") problems.push(result.problem ?? "引用未完成。");
      }
      this.announce(problems.length ? problems.join(" ") : ids.length ? "已关联材料，并在该原文块下插入引用。" : "没有关联文件。");
      if (problems.length) {
        const row = body!.closest('.wb-row'), previous = row?.querySelector('[data-material-continuation]'); previous?.remove();
        const continuation = element("div", "", "wb-status"); continuation.dataset.materialContinuation = "true";
        for (const id of ids) continuation.append(button("复制材料链接", () => void this.copy(id, root, continuation).catch(this.host.fail)));
        continuation.append(button("定位原块继续", () => void port.navigate(target.target.blockUuid).catch(this.host.fail)), button("重新核验并补插子块", () => void (async () => {
          this.host.assert(ticket); const next = await port.resolve(body!); if (!next || !port.valid(next.scope) || JSON.stringify(next.scope) !== JSON.stringify(target.scope)) throw new Error("原文范围已变化，请重新拖入。");
          for (const id of ids) { const result = await new MaterialReferences(service, port.content).insert(id, next, `material-drop:${crypto.randomUUID()}`); this.announce(result.problem ?? "引用已插入原块的子块。"); }
        })().catch(this.host.fail)));
        row?.append(continuation);
      }
    } else { await this.host.refresh(root); this.host.message(`${ids.length ? `已加入 ${ids.length} 份材料，正文未插入链接。` : folderCount ? `文件夹已保存，其中暂无可列出的文件。` : "没有加入文件。"}${problems.length ? ` ${problems.join(" ")}` : ""}`); }
    for (const item of rows) if (item.row.dataset.importState === "complete") item.row.remove();
    if (!queue.children.length) queue.remove();
  }
  private announce(text: string): void { this.host.message(text); void logseq.UI.showMsg(text, "info"); }
  async copy(id: string, root: string | null, _fallback: HTMLElement = this.form, reference?: string): Promise<void> {
    const ticket = this.host.ticket(), cached = reference ?? this.links.get(id);
    const copying = cached ? copyMaterialLink(cached).then(() => true, () => false) : null;
    const service = await this.host.service(), material = await service.read(id); this.host.assert(ticket);
    const text = cached ?? material.reference;
    try {
      if (copying ? !await copying : !await copyMaterialLink(text).then(() => true, () => false)) throw new Error("复制失败");
    } catch {
      this.host.assert(ticket);
      if (_fallback !== this.form && _fallback.isConnected) _fallback.append(element("small", "复制未完成，请再次点击复制链接。"));
      this.host.message("复制未完成，请再次点击复制链接。");
      return;
    }
    this.host.assert(ticket);
    const scope = root && this.port ? await this.port.scope(root).catch(() => null) : null; this.host.assert(ticket);
    this.copied = scope ? {id, text, scope, at: Date.now()} : null;
    this.host.message("已复制材料链接，可粘贴到 Logseq 原文。");
  }
  private nativePaste(event: ClipboardEvent): void {
    const copied = this.copied, target = event.target as HTMLTextAreaElement | null;
    if (!copied || !this.port || this.composing || Date.now() - copied.at > 120000 || !target?.closest?.('.block-editor') || target.tagName !== "TEXTAREA" || event.clipboardData?.getData("text/plain") !== copied.text) return;
    const uuid = target.closest('.ls-block')?.getAttribute('blockid'); if (!uuid) return;
    const value = target.value, start = target.selectionStart, end = target.selectionEnd, expected = value.slice(0, start) + copied.text + value.slice(end), port = this.port;
    this.copied = null; // Does not prevent/modify native paste, selection, Undo or composition.
    const observe = async () => {
      for (let attempt = 0; attempt < 12 && !this.disposed; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (this.disposed || this.port !== port) return;
        if (await logseq.Editor.checkEditing()) continue;
        const scope = await port.scope(copied.scope.rootUuid);
        if (scope.graphId !== copied.scope.graphId) return;
        const read = await port.read(scope), block = read.blocks.find(item => item.target.blockUuid === uuid);
        if (!block?.content || block.content.replace(/\n?\s*id::[^\n]*/g, "") !== expected.replace(/\n?\s*id::[^\n]*/g, "")) continue;
        const offset = block.content.indexOf(copied.text);
        if (offset < 0 || block.content.indexOf(copied.text, offset + 1) >= 0) return;
        const fact: ReferenceFact = {key: `material-paste:${crypto.randomUUID()}`, scope, sourceId: block.sourceId, target: block.target, parentUuid: block.parentUuid, mode: "follow-filename", text: copied.text, start: offset, end: offset + copied.text.length, contentVersion: block.contentVersion!, status: "synced"};
        await new MaterialReferences(await this.host.service(), port.content).register(copied.id, fact); return;
      }
    };
    void observe().catch(() => undefined); // No proven committed paste means a normal untracked/alias link.
  }
  async rename(id: string, root: string | null): Promise<void> {
    const ticket = this.host.ticket(), service = await this.host.service(), material = await service.read(id); this.host.assert(ticket);
    if (this.host.busy(id) || this.renaming.has(id)) throw new Error("材料正在编辑或保存。请完成编辑后再改名，草稿仍保留。");
    await materialAction(this.form, "文件名称（保留扩展名）", fileTitle(material.path), "会改原文件的名称；扩展名、正文和稳定链接保留。手写引用别名不会改动。", async name => {
      this.host.assert(ticket); if (this.host.busy(id)) throw new Error("材料正在编辑，改名已暂停。");
      this.renaming.add(id);
      try {
        const result = await service.renameLocal(id, name, crypto.randomUUID()); this.host.assert(ticket);
        const sync = result.status === "success" ? await this.sync(id) : result;
        await this.host.refresh(root); this.host.message(sync.problem ?? "文件已改名，稳定链接保持可用。");
      } finally { this.renaming.delete(id); }
    });
  }
  async sync(id: string, revalidate = false): Promise<{status: "success" | "partial"; problem?: string}> {
    const service = await this.host.service(), {store, record} = await service.locate(id);
    const result = this.port ? await new MaterialReferences(service, this.port.content).sync(id, revalidate) : record.references?.length ? {status: "partial" as const, problem: "文件已改名，引用维护尚未接通。"} : {status: "success" as const};
    if (result.status === "success" && record.rename?.status === "file-renamed") await store.update(id, current => ({...current, rename: {...current.rename!, status: "complete"}}));
    return result;
  }
  async recover(id: string): Promise<{status: "success" | "partial"; problem?: string}> {
    const service = await this.host.service(), result = await service.recoverRename(id);
    const sync = result.status === "success" ? await this.sync(id, true) : result;
    return sync;
  }
  dispose(): void { this.disposed = true; this.clearHover(); this.copied = null; for (const off of this.off.splice(0)) off(); }
}
