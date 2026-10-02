import { hostDocument } from "../../host/panel-host.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import type { MaterialWorkContext } from "../../workspace/material-context.ts";
import type { MaterialService, MaterialResult } from "./service.ts";
import { isLong, makeLink, idFrom, type MaterialRecord } from "./store.ts";

interface SourceScope {
  epoch(): number;
  graph(): string;
  assertScope(epoch: number): void;
  service(): Promise<MaterialService>;
  workContext(uuid: string | null): Promise<MaterialWorkContext>;
  fail(error: unknown): void;
}
/** SDK/input adapter only; file identity, conversion and authorization live in the core. */
export class MaterialSourceActions {
  private pendingCapture = false;
  constructor(private readonly scope: SourceScope) {}
  async persistSource(uuid: string, epoch: number, graph: string): Promise<void> {
    const block = await this.sourceAction(epoch, graph, () => logseq.Editor.getBlock(uuid));
    if (!block) throw new Error("来源块暂不可用。");
    await ensurePersistentSourceIdentity({ getBlock: id => this.sourceAction(epoch, graph, () => logseq.Editor.getBlock(id)), upsertBlockProperty: (id, key, value) => this.sourceAction(epoch, graph, () => logseq.Editor.upsertBlockProperty(id, key, value)) }, {uuid, content: block.content ?? "", isDbGraph: await this.sourceAction(epoch, graph, () => currentGraphIsDb(logseq.App))});
  }
  async sourceAction<T>(epoch: number, graph: string, action: () => Promise<T>): Promise<T> {
    this.scope.assertScope(epoch);
    const current = await logseq.App.getCurrentGraph(); this.scope.assertScope(epoch);
    if (current?.path !== graph) throw new Error("材料 Graph 范围已变化。");
    const value = await action(); this.scope.assertScope(epoch); return value;
  }
  async insertReference(result: MaterialResult, uuid: string, epoch: number, graph: string): Promise<MaterialResult> {
    try {
      if (await this.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("当前块正在编辑");
      await this.persistSource(uuid, epoch, graph);
      if (await this.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("当前块正在编辑");
      const block = await this.sourceAction(epoch, graph, () => logseq.Editor.getBlock(uuid, {includeChildren: true}));
      if (!(block?.children ?? []).some(child => typeof child !== "object" || Array.isArray(child) ? false : idFrom(child.content ?? "") === result.material.id)) await this.sourceAction(epoch, graph, () => logseq.Editor.insertBlock(uuid, result.material.reference, {sibling: false}));
      return result;
    } catch (error) { return {status: "partial", material: result.material, problem: `材料已保存，引用未插入：${error instanceof Error ? error.message : String(error)}。可从材料库补关联。`}; }
  }
  async captureCurrentBlock(): Promise<MaterialResult> {
    const epoch = this.scope.epoch(), service = await this.scope.service(), graph = this.scope.graph();
    if (await this.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("请先结束当前块编辑再收纳。");
    const block = await this.sourceAction(epoch, graph, () => logseq.Editor.getCurrentBlock());
    if (!block?.content?.trim()) throw new Error("请选择有正文的块。");
    const context = await this.scope.workContext(block.uuid), original = block.content;
    const result = await service.capture({requestKey: crypto.randomUUID(), text: original}, context, "user");
    if (result.status === "partial") return result;
    const located = await service.locate(result.material.id);
    await located.store.update(result.material.id, record => ({...record, restoreMode: "block"}));
    let problem = "";
    try {
      const fresh = await this.sourceAction(epoch, graph, () => logseq.Editor.getBlock(block.uuid));
      if (fresh?.content !== original || await this.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("编辑位置或内容已变化");
      await this.persistSource(block.uuid, epoch, graph);
      const verified = await this.sourceAction(epoch, graph, () => logseq.Editor.getBlock(block.uuid));
      if ((verified?.content ?? "").replace(/\n?\s*id::[^\n]*/g, "") !== original.replace(/\n?\s*id::[^\n]*/g, "") || await this.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("原块已变化");
      const properties = original.split(/\r?\n/).filter(line => /^\s*[\w-]+::/.test(line));
      await this.sourceAction(epoch, graph, () => logseq.Editor.updateBlock(block.uuid, `${result.material.reference}\n${properties.filter(line => !/^\s*id::/.test(line)).join("\n")}\nid:: ${block.uuid}`));
    } catch (error) { problem = `材料已保存，原块未替换：${String(error)}。可从材料库打开。`; }
    return problem ? {status: "partial", material: result.material, problem} : result;
  }
  onPaste(event: ClipboardEvent): void {
    if (!logseq.settings?.materialsAutoCapture || this.pendingCapture) return;
    const target = event.target as HTMLTextAreaElement | null, data = event.clipboardData;
    if (target?.tagName !== "TEXTAREA" || !target.closest(".block-editor") || !data || data.files.length || [...data.types].some(type => type.includes("logseq"))) return;
    const plain = data.getData("text/plain"), html = data.getData("text/html");
    if (!isLong(plain, Number(logseq.settings?.materialsMinChars), Number(logseq.settings?.materialsMinLines))) return;
    if ((target.value.slice(0, target.selectionStart).match(/^\s*(```|~~~)/gm) ?? []).length % 2) return;

    const uuid = target.closest(".ls-block")?.getAttribute("blockid");
    const epoch = this.scope.epoch();
    const snapshot = { value: target.value, start: target.selectionStart, end: target.selectionEnd };
    const pending = `workbench:pending:${crypto.randomUUID()}`;
    let capturedRecord: MaterialRecord | null = null;
    try { localStorage.setItem(pending, JSON.stringify({...snapshot, uuid, plain, html, graph: this.scope.graph() || null, at: Date.now()})); }
    catch (error) { this.scope.fail(error); return; } // Native paste continues when recovery cannot be retained.
    event.preventDefault(); event.stopImmediatePropagation(); this.pendingCapture = true;
    void (async () => {
      const service = await this.scope.service(), graph = this.scope.graph();
      const context = await this.scope.workContext(uuid ?? null);
      localStorage.setItem(pending, JSON.stringify({ ...snapshot, uuid, graph, context, plain, html, at: Date.now() }));
      if (!uuid) throw new Error("无法确认来源块，原文已保留在恢复记录。");
      const source = await logseq.Editor.getBlock(uuid); if (!source) throw new Error("来源块暂不可读。");
      const result = await service.capture({requestKey: pending, text: plain, html}, context, "user");
      if (result.status === "partial") throw new Error(result.problem ?? "保存未完成，原文已保留。");
      const {record} = await service.locate(result.material.id); capturedRecord = record;
      localStorage.setItem(pending, JSON.stringify({uuid, graph, context, plain, html, materialId: record.id, at: Date.now()}));
      if (epoch !== this.scope.epoch() || (await logseq.App.getCurrentGraph())?.path !== graph || !target.isConnected || target.value !== snapshot.value || target.selectionStart !== snapshot.start || target.selectionEnd !== snapshot.end || hostDocument()?.activeElement !== target) throw new Error("材料已保存，编辑位置发生变化，请从材料库打开。");
      target.focus();
      const persisted = source.properties?.id === uuid;
      if (persisted) target.setSelectionRange(snapshot.start, snapshot.end);
      else target.select();
      const insertion = persisted ? makeLink(record) : `${snapshot.value.slice(0, snapshot.start)}${makeLink(record)}${snapshot.value.slice(snapshot.end)}\nid:: ${uuid}`;
      if (!hostDocument()?.execCommand("insertText", false, insertion)) throw new Error("编辑器拒绝插入，材料和原文已保留。");
      localStorage.removeItem(pending);
    })().catch(error => {
      if (!capturedRecord && epoch === this.scope.epoch() && target.isConnected && target.value === snapshot.value && target.selectionStart === snapshot.start && target.selectionEnd === snapshot.end && hostDocument()?.activeElement === target) {
        target.setSelectionRange(snapshot.start, snapshot.end);
        hostDocument()?.execCommand("insertText", false, plain);
      }
      this.scope.fail(error);
    }).finally(() => { this.pendingCapture = false; });
  }
}
