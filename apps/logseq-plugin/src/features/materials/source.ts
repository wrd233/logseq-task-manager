import { hostDocument } from "../../host/panel-host.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import type { MaterialWorkContext } from "../../workspace/material-context.ts";
import type { MaterialService, MaterialResult } from "./service.ts";
import { isLong, idFrom, titleOf } from "./store.ts";
import { versionOf } from "./store.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { capturePastePrompt, type CapturePrompt } from "./paste-ui.ts";
import type { ReferenceFact } from "./references.ts";

interface SourceScope {
  epoch(): number;
  graph(): string;
  assertScope(epoch: number): void;
  service(): Promise<MaterialService>;
  workContext(uuid: string | null): Promise<MaterialWorkContext>;
  fail(error: unknown): void;
  referenceRoot?(uuid: string): string;
}
/** SDK/input adapter only; file identity, conversion and authorization live in the core. */
export class MaterialSourceActions {
  private pendingCapture = false;
  private prompt: CapturePrompt | null = null;
  private composing = false;
  composition(active: boolean): void { this.composing = active; }
  cancelPrompt(): void { this.prompt?.close(); this.prompt = null; }
  constructor(private readonly scope: SourceScope) {}
  private async rememberReference(result: MaterialResult, uuid: string, epoch: number, graph: string, insertionParent?: string): Promise<void> {
    if (await this.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) throw new Error("引用登记暂停，原生输入仍保留。");
    await this.persistSource(uuid, epoch, graph);
    const block = await this.sourceAction(epoch, graph, () => logseq.Editor.getBlock(uuid));
    if (!block?.content) throw new Error("引用已写入，来源读回暂不可用。");
    const text = result.material.reference, start = block.content.indexOf(text);
    if (start < 0 || block.content.indexOf(text, start + 1) >= 0) throw new Error("引用位置无法确认，保留原文。");
    const sourceGraph = graphIdentity(await this.sourceAction(epoch, graph, () => logseq.App.getCurrentGraph()));
    const fact: ReferenceFact = {key: `material-source:${uuid}:${result.material.id}`, scope: {graphId: sourceGraph, rootUuid: this.scope.referenceRoot?.(insertionParent ?? uuid) ?? insertionParent ?? uuid}, sourceId: JSON.stringify(["logseq", sourceGraph, uuid]), target: {kind: "logseq-block", graphId: sourceGraph, blockUuid: uuid}, parentUuid: insertionParent ?? null, mode: "follow-filename", text, start, end: start + text.length, contentVersion: await versionOf(block.content), status: "synced", ...(block.content.length <= 12000 ? {sourceContent: block.content} : {}), ...(insertionParent ? {insertionParent} : {})};
    const {store} = await (await this.scope.service()).locate(result.material.id); this.scope.assertScope(epoch);
    await store.update(result.material.id, record => ({...record, references: [...(record.references ?? []).filter(item => item.key !== fact.key), fact]}));
  }
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
      // Desktop supports focus although SDK 0.3.4 omits it from its option type.
      // Programmatic references must not start a new native editing session.
      const insertion = {sibling: false, focus: false};
      if (!(block?.children ?? []).some(child => typeof child !== "object" || Array.isArray(child) ? false : idFrom(child.content ?? "") === result.material.id)) {
        const inserted = await this.sourceAction(epoch, graph, () => logseq.Editor.insertBlock(uuid, result.material.reference, insertion));
        if (inserted?.uuid) await this.rememberReference(result, inserted.uuid, epoch, graph, uuid);
      }
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
      await this.rememberReference(result, block.uuid, epoch, graph);
    } catch (error) { problem = `材料已保存，原块未替换：${String(error)}。可从材料库打开。`; }
    return problem ? {status: "partial", material: result.material, problem} : result;
  }
  onPaste(event: ClipboardEvent): void {
    if (!logseq.settings?.materialsAutoCapture || this.pendingCapture || this.composing) return;
    const target = event.target as HTMLTextAreaElement | null, data = event.clipboardData;
    if (target?.tagName !== "TEXTAREA" || !target.closest(".block-editor") || !data || data.files.length || [...data.types].some(type => type.includes("logseq"))) return;
    const plain = data.getData("text/plain"), html = data.getData("text/html");
    if (!isLong(plain, Number(logseq.settings?.materialsMinChars), Number(logseq.settings?.materialsMinLines))) return;
    if ((target.value.slice(0, target.selectionStart).match(/^\s*(```|~~~)/gm) ?? []).length % 2) return;
    const uuid = target.closest(".ls-block")?.getAttribute("blockid"); if (!uuid) return;
    const epoch = this.scope.epoch(), snapshot = {value: target.value, start: target.selectionStart, end: target.selectionEnd};
    const expected = snapshot.value.slice(0, snapshot.start) + plain + snapshot.value.slice(snapshot.end);
    const pending = `workbench:pending:${crypto.randomUUID()}`;
    try { localStorage.setItem(pending, JSON.stringify({...snapshot, uuid, plain, html, graph: this.scope.graph() || null, at: Date.now()})); }
    catch { return; } // Native paste always proceeds, including when recovery storage is unavailable.
    this.pendingCapture = true;
    // Let the native paste and undo entry commit before presenting a decision.
    setTimeout(() => void (async () => {
      const service = await this.scope.service(), graph = service.graph;
      this.scope.assertScope(epoch);
      const context = await this.scope.workContext(uuid); this.scope.assertScope(epoch);
      localStorage.setItem(pending, JSON.stringify({...snapshot, uuid, graph, context, plain, html, at: Date.now()}));
      let savedId: string | null = null;
      this.prompt = capturePastePrompt(titleOf(plain), async title => {
        this.scope.assertScope(epoch);
        localStorage.setItem(pending, JSON.stringify({...snapshot, uuid, graph, context, plain, html, title, materialId: savedId, at: Date.now()}));
        const result = await service.capture({requestKey: pending, text: plain, html, title}, context, "user");
        savedId = result.material.id;
        localStorage.setItem(pending, JSON.stringify({uuid, graph, context, plain, html, title, materialId: savedId, at: Date.now()}));
        if (result.status === "partial") throw new Error(result.problem ?? "材料保存未完成，原文仍保留；可重试保存。");
        if (epoch !== this.scope.epoch() || (await logseq.App.getCurrentGraph())?.path !== graph || !target.isConnected || target.value !== expected) return {reference: result.material.reference, problem: "材料已保存，粘贴位置已变化。原文没有替换，可复制链接继续。"};
        const block = await logseq.Editor.getBlock(uuid);
        if (epoch !== this.scope.epoch() || (await logseq.App.getCurrentGraph())?.path !== graph || target.value !== expected || !block) return {reference: result.material.reference, problem: "材料已保存，原块暂不可用。原文仍保留。"};
        this.prompt?.releaseNativeFocus(); target.focus();
        const persisted = block.properties?.id === uuid;
        if (persisted) target.setSelectionRange(snapshot.start, snapshot.start + plain.length);
        else target.select();
        const insertion = persisted ? result.material.reference : `${snapshot.value.slice(0, snapshot.start)}${result.material.reference}${snapshot.value.slice(snapshot.end)}\nid:: ${uuid}`;
        if (!hostDocument()?.execCommand("insertText", false, insertion)) return {reference: result.material.reference, problem: "材料已保存，编辑器未接受链接。原文仍保留。"};
        localStorage.removeItem(pending);
        void (async () => {
          for (let attempt = 0; attempt < 12; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 750)); this.scope.assertScope(epoch);
            if (await this.sourceAction(epoch, graph, () => logseq.Editor.checkEditing())) continue;
            await this.rememberReference(result, uuid, epoch, graph); return;
          }
        })().catch(() => undefined);
        return {};
      }, () => { if (!savedId) localStorage.removeItem(pending); });
      await this.prompt.finished; this.prompt = null;
    })().catch(error => { if (epoch === this.scope.epoch()) this.scope.fail(error); }).finally(() => { this.pendingCapture = false; }), 0);
  }
}
