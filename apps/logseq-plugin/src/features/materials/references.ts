import type { SourceScope, BlockTarget, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { ApplyResult, Operation, Patch, TextOperation } from "../content-writeback/protocol.ts";
import type { MaterialService } from "./service.ts";
import { makeLink, versionOf } from "./store.ts";
import { idFrom } from "./links.ts";

export interface MaterialContentPort {
  scope(): SourceScope | null;
  read(scope: SourceScope): Promise<SourceSnapshot>;
  readCommitted?(scope: SourceScope): Promise<SourceSnapshot>; // Proof only; never grants writes.
  apply(patch: Patch): Promise<ApplyResult>;
  result(scope: SourceScope, requestId: string): Promise<ApplyResult | null>;
}
export type MaterialDropTarget = {scope: SourceScope; sourceId: string; target: BlockTarget; contentVersion: string; parentUuid: string | null; structureVersion: string; position: {kind: "child"} | {kind: "utf16"; offset: number}};
export type ReferenceFact = {
  key: string; scope: SourceScope; sourceId: string; target: BlockTarget;
  parentUuid: string | null; mode: "follow-filename" | "alias"; text: string;
  start: number; end: number; contentVersion: string;
  status: "pending" | "synced" | "conflict" | "unknown";
  patch?: Patch; problem?: string; insertionParent?: string; operationId?: string;
  sourceContent?: string; // Bounded, version-verified position evidence, never editable authority.
};
const same = (a: SourceScope | null, b: SourceScope) => !!a && a.graphId === b.graphId && a.rootUuid === b.rootUuid;
const isText = (operation: Operation): operation is TextOperation => operation.type === "replace-text" || operation.type === "insert-text";
export class MaterialReferences {
  constructor(private readonly service: MaterialService, private readonly port: MaterialContentPort) {}
  private async put(id: string, fact: ReferenceFact): Promise<void> {
    const {store} = await this.service.locate(id);
    await store.update(id, record => ({...record, references: [...(record.references ?? []).filter(item => item.key !== fact.key), fact]}));
  }
  async register(id: string, fact: ReferenceFact): Promise<void> {
    if (!this.port.readCommitted && !same(this.port.scope(), fact.scope)) throw new Error("当前正文维护范围未授权。");
    const read = await (this.port.readCommitted ?? this.port.read.bind(this.port))(fact.scope), block = read.blocks.find(item => item.sourceId === fact.sourceId);
    if (!block?.content || block.contentVersion !== fact.contentVersion || block.target.blockUuid !== fact.target.blockUuid || block.content.slice(fact.start, fact.end) !== fact.text) throw new Error("引用来源已变化，未登记跟随关系。");
    await this.put(id, {...fact, ...(block.content.length <= 12000 ? {sourceContent: block.content} : {})});
  }
  async insert(id: string, target: MaterialDropTarget, requestId: string): Promise<{status: "success" | "partial"; problem?: string}> {
    if (!same(this.port.scope(), target.scope)) return {status: "partial", problem: "材料已关联。请先允许维护此处正文，再补插；也可复制链接。"};
    const {store, record} = await this.service.locate(id), material = await this.service.read(id);
    // A previously verified child is reused; an unknown attempt is queried, never blindly replayed.
    const existing = [...(record.references ?? [])].reverse().find(item => same(item.scope, target.scope) && item.insertionParent === target.target.blockUuid);
    if (existing) {
      if (existing.status === "synced") {
        const read = await this.port.read(target.scope), block = read.blocks.find(b => b.target.blockUuid === existing.target.blockUuid);
        if (block?.content && idFrom(block.content) === id) return {status: "success"};
      } else if (existing.patch) {
        const known = await this.port.result(target.scope, existing.patch.requestId), status = known?.record.items[0]?.status;
        if (!known?.durable || !["NOT_APPLIED", "CONFLICT", "BLOCKED"].includes(status ?? "") || requestId === existing.patch.requestId) return this.settle(id, existing, known);
        // Only a new explicit, revalidated drop retries a proven non-write. Keep its previous fact.
      }
    }
    const read = await this.port.read(target.scope), block = read.blocks.find(item => item.sourceId === target.sourceId);
    if (!block || block.content === null || block.contentVersion !== target.contentVersion || block.target.blockUuid !== target.target.blockUuid || block.parentUuid !== target.parentUuid || read.structureVersion !== target.structureVersion) return {status: "partial", problem: "材料已关联，原文或结构已变化。请在当前段落重新选择落点。"};
    const text = material.reference, offset = target.position.kind === "utf16" ? target.position.offset : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > block.content.length || offset > 0 && /[\uD800-\uDBFF]/.test(block.content[offset - 1]!) && /[\uDC00-\uDFFF]/.test(block.content[offset]!)) throw new Error("段内位置无效。");
    const operation = target.position.kind === "child"
      ? {type: "insert-child" as const, operationId: "reference", target: block.target, expectedContentVersion: target.contentVersion, expectedParentUuid: block.parentUuid, content: text, childUuid: null}
      : {type: "insert-text" as const, operationId: "reference", target: block.target, expectedContentVersion: target.contentVersion, expectedParentUuid: block.parentUuid, range: {start: offset, end: offset}, expectedText: "", text, context: {before: block.content.slice(Math.max(0, offset - 16), offset), after: block.content.slice(offset, offset + 16)}};
    const patch: Patch = {schemaVersion: 1, requestId, scope: target.scope, operations: [operation], metadata: null};
    const fact: ReferenceFact = {key: requestId, scope: target.scope, sourceId: block.sourceId, target: block.target, parentUuid: block.parentUuid, mode: "follow-filename", text, start: offset, end: offset + text.length, contentVersion: target.contentVersion, status: "pending", patch, ...(target.position.kind === "child" ? {insertionParent: block.target.blockUuid} : {})};
    await store.update(id, current => ({...current, references: [...(current.references ?? []), fact]}));
    if (!same(this.port.scope(), target.scope)) {
      const stopped: ReferenceFact = {...fact, status: "conflict", problem: "正文维护范围已变化，未发送写入。"};
      delete stopped.patch; await this.put(id, stopped);
      return {status: "partial", problem: "材料已关联，正文维护范围已变化。请重新选择落点。"};
    }
    try { return this.settle(id, fact, await this.port.apply(patch)); }
    catch (error) { await this.put(id, {...fact, status: "unknown", problem: String(error)}); return {status: "partial", problem: `材料已关联，引用结果需核验：${String(error)}`}; }
  }
  private async settle(id: string, fact: ReferenceFact, result: ApplyResult | null): Promise<{status: "success" | "partial"; problem?: string}> {
    const item = result?.record.items.find(item => item.operationId === (fact.operationId ?? "reference"));
    if (result?.durable && item?.status === "APPLIED_VERIFIED" && item.actualContent !== null && item.actualVersion) {
      const uuid = item.childUuid ?? item.target.blockUuid;
      const op = fact.patch?.operations.find(op => op.operationId === (fact.operationId ?? "reference"));
      let start = item.actualContent.indexOf(fact.text);
      if (op && isText(op)) {
        const shift = fact.patch!.operations.reduce((sum, previous) => sum + (isText(previous) && previous.range.start < op.range.start ? previous.text.length - previous.expectedText.length : 0), 0);
        const offset = op.range.start + shift;
        if (item.actualContent.slice(offset, offset + fact.text.length) === fact.text) start = offset;
        else if (start < 0 || item.actualContent.indexOf(fact.text, start + 1) >= 0) return {status: "partial", problem: "引用已写入，但跟随名称的位置无法确认。"};
      } else if (start < 0 || item.actualContent.indexOf(fact.text, start + 1) >= 0) return {status: "partial", problem: "引用已写入，但跟随名称的位置无法确认。"};
      await this.put(id, {...fact, target: {...item.target, blockUuid: uuid}, sourceId: JSON.stringify(["logseq", fact.scope.graphId, uuid]), parentUuid: item.childUuid ? item.target.blockUuid : item.parentUuid, start, end: start + fact.text.length, contentVersion: item.actualVersion, status: "synced", ...(item.actualContent.length <= 12000 ? {sourceContent: item.actualContent} : {})});
      return {status: "success"};
    }
    const problem = item?.reason ?? result?.journalProblem ?? "引用结果尚未确认；请查看正文写回恢复，不重复导入。";
    await this.put(id, {...fact, status: !result || item?.status === "OUTCOME_UNKNOWN" ? "unknown" : "conflict", problem});
    return {status: "partial", problem: item?.reason ? "材料已关联，引用未写入。请定位原块核对当前输入和正文保护，或复制链接继续。" : problem};
  }
  async sync(id: string, revalidate = false): Promise<{status: "success" | "partial"; problem?: string}> {
    const {record} = await this.service.locate(id), text = makeLink(record);
    let pending = 0;
    const groups = new Map<string, {facts: ReferenceFact[]; patch: Patch}>();
    for (const saved of record.references ?? []) {
      const old = {...saved};
      if (old.mode === "alias") continue;
      const active = this.port.scope();
      if (!active || active.graphId !== old.scope.graphId) { pending++; continue; }
      const read = await this.port.read(active), block = read.blocks.find(b => b.sourceId === old.sourceId);
      if (!block) { pending++; continue; } // Registered source is outside the current trusted work.
      if (!old.patch || old.status === "synced") old.scope = active;
      if (old.patch && old.status !== "synced") {
        const known = await this.port.result(old.scope, old.patch.requestId);
        const item = known?.record.items.find(item => item.operationId === (old.operationId ?? "reference"));
        if (item?.status === "APPLIED_VERIFIED" && known?.durable) { await this.settle(id, old, known); pending++; continue; }
        if (!known || !known.durable || item?.status === "OUTCOME_UNKNOWN" || old.patch.operations.some(op => op.type === "insert-child")) { pending++; continue; }
        const op = old.patch.operations.find(op => op.operationId === (old.operationId ?? "reference"));
        if (op && isText(op)) { old.text = op.expectedText; old.start = op.range.start; old.end = op.range.end; }
      }
      if (block?.content !== null && block?.content !== undefined && block.contentVersion !== old.contentVersion && old.sourceContent && await versionOf(old.sourceContent) === old.contentVersion) {
        // A single bounded change outside a registered range can shift that range.
        // This maps existing evidence; it never discovers links by matching names.
        const base = old.sourceContent, current = block.content;
        let prefix = 0, suffix = 0;
        while (prefix < Math.min(base.length, current.length) && base[prefix] === current[prefix]) prefix++;
        while (suffix < Math.min(base.length, current.length) - prefix && base[base.length - 1 - suffix] === current[current.length - 1 - suffix]) suffix++;
        const end = base.length - suffix;
        if (end <= old.start || prefix >= old.end) {
          const shift = end <= old.start ? current.length - base.length : 0;
          old.start += shift; old.end += shift; old.contentVersion = block.contentVersion!; old.sourceContent = current;
        } else if (prefix >= old.start && end <= old.end) {
          await this.put(id, {...old, mode: "alias", status: "synced", problem: "引用标签已由用户修改，保留概述。"}); continue;
        }
      }
      if (!block?.content || block.content.slice(old.start, old.end) !== old.text) {
        await this.put(id, {...old, mode: "alias", status: "synced", problem: "引用标签或位置已由用户修改，保留原文。"}); continue;
      }
      if (old.text === text) continue;
      if (block.contentVersion !== old.contentVersion && !revalidate) { await this.put(id, {...old, status: "conflict", problem: "来源版本已变化，请核对当前引用。"}); pending++; continue; }
      const key = JSON.stringify([old.scope, old.target.blockUuid]);
      let group = groups.get(key);
      if (!group) { group = {facts: [], patch: {schemaVersion: 1, requestId: `material-name:${crypto.randomUUID()}`, scope: old.scope, metadata: null, operations: []}}; groups.set(key, group); }
      const operationId = `reference-${group.facts.length}`;
      const fact: ReferenceFact = {...old, text, end: old.start + text.length, contentVersion: block.contentVersion!, status: "pending", operationId, patch: group.patch};
      group.facts.push(fact);
      group.patch.operations = [...group.patch.operations, {type: "replace-text", operationId, target: old.target, expectedParentUuid: block.parentUuid, expectedContentVersion: block.contentVersion!, range: {start: old.start, end: old.end}, expectedText: old.text, text, context: null}];
    }
    for (const group of groups.values()) {
      // Persist all intentions before the one source request. The executor batches one block.
      for (const fact of group.facts) await this.put(id, fact);
      try {
        const result = await this.port.apply(group.patch);
        for (const fact of group.facts) if ((await this.settle(id, fact, result)).status !== "success") pending++;
      } catch (error) { for (const fact of group.facts) { await this.put(id, {...fact, status: "unknown", problem: String(error)}); pending++; } }
    }
    return pending ? {status: "partial", problem: `文件名称已更新，${pending} 处引用待同步。手写别名保留。`} : {status: "success"};
  }
}
