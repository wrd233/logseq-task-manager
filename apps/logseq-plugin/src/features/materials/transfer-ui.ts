import { button, element, hostDocument } from "../../host/panel-host.ts";
import type { MaterialWorkContext } from "../../workspace/material-context.ts";
import type { SourceScope } from "../../workspace/source-protocol.ts";
import type { MaterialService } from "./service.ts";
import type { MaterialRecord } from "./store.ts";
import { makeLink, versionOf } from "./store.ts";
import { MaterialReferences, type ReferenceFact } from "./references.ts";
import { droppedPath, materialDrag, MATERIAL_MIME, supportsDrop, type MaterialTransferPort } from "./drop.ts";
import { fileTitle } from "./names.ts";
import { materialPrompt } from "./ui.ts";

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
  constructor(private readonly host: MaterialTransferHost, private readonly form: HTMLElement) {
    for (const doc of new Set([document, hostDocument()].filter((value): value is Document => !!value))) {
      const over = (event: DragEvent) => {
        const target = event.target as Element | null;
        if (supportsDrop(event.dataTransfer) && (target?.closest?.('[data-material-drop-list]') || target?.closest?.('.wb-row .wb-body'))) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; }
      };
      const drop = (event: DragEvent) => {
        const target = event.target as Element | null;
        if (!supportsDrop(event.dataTransfer) || !target?.closest) return;
        const list = target.closest<HTMLElement>('[data-material-drop-list]'), body = target.closest('.wb-row .wb-body');
        if (!list && !body) return;
        event.preventDefault(); event.stopPropagation();
        // Snapshot the payload synchronously; DataTransfer is protected after dispatch.
        const files = Array.from(event.dataTransfer!.files), internal = event.dataTransfer!.getData(MATERIAL_MIME);
        void this.drop(files, internal, list?.dataset.materialDropList ?? null, body).catch(this.host.fail);
      };
      const paste = (event: ClipboardEvent) => this.nativePaste(event);
      const start = () => { this.composing = true; }, end = () => { this.composing = false; };
      doc.addEventListener("dragover", over, true); doc.addEventListener("drop", drop, true); doc.addEventListener("paste", paste, true);
      doc.addEventListener("compositionstart", start, true); doc.addEventListener("compositionend", end, true);
      this.off.push(() => { doc.removeEventListener("dragover", over, true); doc.removeEventListener("drop", drop, true); doc.removeEventListener("paste", paste, true); doc.removeEventListener("compositionstart", start, true); doc.removeEventListener("compositionend", end, true); });
    }
  }
  setPort(port: MaterialTransferPort | null): void { this.port = port; }
  decorate(entry: HTMLElement, record: MaterialRecord, root: string | null): HTMLElement {
    const row = element("div"); row.style.display = "flex"; row.style.alignItems = "start"; entry.style.flex = "1"; row.append(entry);
    const more = element("details"), summary = element("summary", "⋯"); summary.setAttribute("aria-label", `${record.title} 的材料操作`);
    more.append(summary, button("复制链接", () => void this.copy(record.id, root).catch(this.host.fail)), button("改文件名", () => void this.rename(record.id, root).catch(this.host.fail))); row.append(more);
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
  private async drop(files: File[], internal: string, listRoot: string | null, body: Element | null): Promise<void> {
    const ticket = this.host.ticket(), service = await this.host.service(); this.host.assert(ticket);
    const port = this.port, target = body && port ? await port.resolve(body) : null;
    this.host.assert(ticket);
    const root = body ? target?.scope.rootUuid ?? null : listRoot || null;
    if (body && !target) { this.announce("该位置没有可靠原文映射。请拖入当前工作的材料列表，或复制链接到原生编辑器。"); return; }
    const context = await this.host.context(root); this.host.assert(ticket);
    const ids: string[] = [];
    if (internal) {
      if (!port || !root) throw new Error("请从当前工作的材料入口拖动。");
      const payload = materialDrag(internal, await port.scope(root)); this.host.assert(ticket);
      ids.push((await service.associate(payload.materialId, context)).material.id);
    } else {
      for (const file of files) {
        let path = await droppedPath(file, service.io); this.host.assert(ticket);
        if (!path) {
          if (body) { this.announce("宿主未提供原文件路径。请先在材料列表关联原文件，再复制链接到正文。"); continue; }
          this.host.message("宿主未提供原文件路径。请指定已保存文件的路径，继续按原文件关联。");
          path = await materialPrompt(this.form, `关联 ${file.name} 的绝对文件路径`); this.host.assert(ticket);
        }
        if (path) ids.push((await service.associateFile(path, context)).material.id);
      }
    }
    this.host.assert(ticket);
    const problems: string[] = [];
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
        for (const id of ids) continuation.append(button("复制材料链接", () => void this.copy(id, root).catch(this.host.fail)));
        continuation.append(button("定位原块继续", () => void port.navigate(target.target.blockUuid).catch(this.host.fail)), button("重新核验并补插子块", () => void (async () => {
          this.host.assert(ticket); const next = await port.resolve(body!); if (!next || !port.valid(next.scope) || JSON.stringify(next.scope) !== JSON.stringify(target.scope)) throw new Error("原文范围已变化，请重新拖入。");
          for (const id of ids) { const result = await new MaterialReferences(service, port.content).insert(id, next, `material-drop:${crypto.randomUUID()}`); this.announce(result.problem ?? "引用已插入原块的子块。"); }
        })().catch(this.host.fail)));
        row?.append(continuation);
      }
    } else { await this.host.refresh(root); this.host.message(ids.length ? `已关联 ${ids.length} 份材料，正文未插入引用。` : "没有关联文件。"); }
  }
  private announce(text: string): void { this.host.message(text); void logseq.UI.showMsg(text, "info"); }
  async copy(id: string, root: string | null): Promise<void> {
    const ticket = this.host.ticket(), service = await this.host.service(), material = await service.read(id); this.host.assert(ticket);
    const text = material.reference;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("剪贴板不可用");
      await navigator.clipboard.writeText(text); this.host.assert(ticket);
      const scope = root && this.port ? await this.port.scope(root) : null; this.host.assert(ticket);
      this.copied = scope ? {id, text, scope, at: Date.now()} : null;
      this.host.message("已复制材料链接，可粘贴到 Logseq 原文。");
    } catch {
      const input = element("textarea"); input.value = text; input.readOnly = true; input.setAttribute("aria-label", "材料链接");
      this.form.append(input); input.focus(); input.select(); this.host.message("复制未完成，请选择这段链接复制。");
    }
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
    const name = await materialPrompt(this.form, "文件名称（保留扩展名）", fileTitle(material.path)); this.host.assert(ticket); if (!name) return;
    if (this.host.busy(id)) throw new Error("材料正在编辑，改名已暂停。");
    this.renaming.add(id);
    try {
      const result = await service.renameLocal(id, name, crypto.randomUUID()); this.host.assert(ticket);
      const sync = result.status === "success" ? await this.sync(id) : result;
      await this.host.refresh(root); this.host.message(sync.problem ?? "文件已改名，稳定链接保持可用。");
    } finally { this.renaming.delete(id); }
  }
  async sync(id: string, revalidate = false): Promise<{status: "success" | "partial"; problem?: string}> {
    const service = await this.host.service(), {store, record} = await service.locate(id);
    const result = this.port ? await new MaterialReferences(service, this.port.content).sync(id, revalidate) : record.references?.length ? {status: "partial" as const, problem: "文件已改名，引用维护尚未接通。"} : {status: "success" as const};
    if (result.status === "success" && record.rename?.status === "file-renamed") await store.update(id, current => ({...current, rename: {...current.rename!, status: "complete"}}));
    return result;
  }
  async recover(id: string): Promise<void> {
    const service = await this.host.service(), result = await service.recoverRename(id);
    const sync = result.status === "success" ? await this.sync(id, true) : result;
    this.host.message(sync.problem ?? "已核验改名与引用结果。");
  }
  dispose(): void { this.disposed = true; this.copied = null; for (const off of this.off.splice(0)) off(); }
}
