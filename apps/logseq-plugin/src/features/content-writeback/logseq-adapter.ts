import { snapshot } from "../../workspace/source-protocol.ts";
import type { SourceReader as CommittedSourceReader } from "../../workspace/source-reader.ts";
import { lookupBlockIdentity } from "../../block-identity.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { hostDocument } from "../../host/panel-host.ts";
import { pluginRuntime } from "../../plugin-runtime.ts";
import { reviewFieldUuid } from "../../projection-renderer.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import type { BlockSnapshot, EditingGuard, SourceRead, SourceReader, SourceScope, SourceWriter } from "./protocol.ts";
import { formalSyntax, managedSyntax, protectionFor, todoRanges } from "./protection.ts";
import { fail, limits, sha256, uuidPattern, wellFormed } from "./validation.ts";

type RawBlock = { uuid: string; content: string; id: number | null; parent: Record<string, unknown> | null; page: Record<string, unknown> | null; left: Record<string,unknown> | null; properties: Record<string, unknown>; children: unknown[] };
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : null;
}
function rawBlock(value: unknown): RawBlock | null {
  const item = record(value); if (!item) return null;
  const content = typeof item.content === "string" ? item.content : typeof item.title === "string" ? item.title : null;
  if (typeof item.uuid !== "string" || !uuidPattern.test(item.uuid) || content === null || content.length > limits.text || !wellFormed(content)) return null;
  return { uuid: item.uuid, content, id: typeof item.id === "number" ? item.id : null, parent: record(item.parent), page: record(item.page), left:record(item.left),properties: record(item.properties) ?? {}, children: Array.isArray(item.children) ? item.children : [] };
}
export type FormalOwnership = { roots: ReadonlySet<string>; managed: ReadonlySet<string> };

/** SDK/default adapter, independent of starting the formal runtime. */
export class LogseqContentAdapter implements SourceReader, SourceWriter, EditingGuard {
  private readonly composing = new Set<EventTarget | null>();
  private readonly documents: Document[];
  private readonly onStart = (event: Event) => { this.composing.add(event.target); };
  private readonly onEnd = (event: Event) => { this.composing.delete(event.target); };
  constructor(private readonly ownership: ((scope: SourceScope) => Promise<FormalOwnership | null>) | null = null, private readonly committed?: CommittedSourceReader) {
    this.documents = [...new Set([document, hostDocument()].filter((value): value is Document => !!value))];
    for (const doc of this.documents) { doc.addEventListener("compositionstart", this.onStart, true); doc.addEventListener("compositionend", this.onEnd, true); }
  }
  dispose(): void { for (const doc of this.documents) { doc.removeEventListener("compositionstart",this.onStart,true); doc.removeEventListener("compositionend",this.onEnd,true); } this.composing.clear(); }
  async assertGraph(scope: SourceScope, valid: () => boolean): Promise<void> {
    if (!valid()) fail("SCOPE_REVOKED");
    const graph = await logseq.App.getCurrentGraph();
    if (!valid() || graphIdentity(graph) !== scope.graphId) fail("GRAPH_SCOPE_CHANGED");
  }
  private async call<T>(scope: SourceScope, valid: () => boolean, action: () => Promise<T>): Promise<T> {
    await this.assertGraph(scope, valid); if (!valid()) fail("SCOPE_REVOKED");
    const result = await action(); await this.assertGraph(scope, valid); return result;
  }
  private async parentUuid(scope: SourceScope, block: RawBlock, valid: () => boolean): Promise<string | null> {
    const parent = block.parent;
    if (!parent || parent.id === block.page?.id) return null;
    if (typeof parent.uuid === "string" && uuidPattern.test(parent.uuid)) return parent.uuid;
    if (typeof parent.id !== "number") fail("PARENT_UNAVAILABLE");
    const raw = await this.call(scope,valid,() => logseq.Editor.getBlock(parent.id as number));
    const parsed = rawBlock(raw); if (!parsed) fail("PARENT_UNAVAILABLE"); return parsed.uuid;
  }
  async block(scope: SourceScope, uuid: string, valid: () => boolean): Promise<Pick<BlockSnapshot,"content"|"contentVersion"|"parentUuid"> | null> {
    const raw = await this.call(scope,valid,() => logseq.Editor.getBlock(uuid));
    if (!raw) return null;
    const block = rawBlock(raw); if (!block || block.uuid !== uuid) fail("SOURCE_SHAPE_UNSUPPORTED");
    const parentUuid = await this.parentUuid(scope,block,valid), version = await sha256(block.content);
    if (!valid()) fail("SCOPE_REVOKED");
    return {content:block.content,contentVersion:version,parentUuid};
  }
  private async formalOwnership(scope: SourceScope, valid: () => boolean): Promise<FormalOwnership | null> {
    if (this.ownership) { const value = await this.ownership(scope); if (!valid()) fail("SCOPE_REVOKED"); return value; }
    // A fresh Kernel index supplies identity even if labels have been edited.
    // Failure grants nothing: the SDK-only conservative rule remains in force.
    if (!logseq.settings?.kernelDescriptorJson) return null;
    try {
      const api = await pluginRuntime.client(); if (!valid()) fail("SCOPE_REVOKED");
      const response = await api.listObjectAnchorIndex(); if (!valid()) fail("SCOPE_REVOKED");
      const roots = new Set<string>(), managed = new Set<string>();
      for (const item of response.objects) {
        const anchor = record(item.anchor); if (anchor?.graphId !== scope.graphId || typeof anchor.externalId !== "string") continue;
        roots.add(anchor.externalId);
        for (const [key,value] of Object.entries(anchor)) if (/^projection.*Uuid$/u.test(key) && typeof value === "string") managed.add(value);
        if(typeof anchor.projectionWaitingUuid==="string")managed.add(reviewFieldUuid(anchor.projectionWaitingUuid));
      }
      return {roots,managed};
    } catch { if (!valid()) fail("SCOPE_REVOKED"); return null; }
  }
  async read(scope: SourceScope, valid: () => boolean): Promise<SourceRead> {
    const raw = await this.call(scope,valid,() => logseq.Editor.getBlock(scope.rootUuid,{includeChildren:true}));
    const root = rawBlock(raw);
    if (raw && (!root || root.uuid !== scope.rootUuid)) fail("SOURCE_SHAPE_UNSUPPORTED");
    const rows: BlockSnapshot[] = [], raws = new Map<string,RawBlock>(), paths = new Map<string,readonly string[]>(), children = new Map<string,readonly string[]>();
    const protections = new Map<string, ReturnType<typeof protectionFor>>();
    const ancestors: RawBlock[] = [];
    let ancestor = root;
    const seenParents = new Set<string>();
    while (ancestor) {
      const parentUuid = await this.parentUuid(scope,ancestor,valid);
      if (!parentUuid) break;
      if (seenParents.has(parentUuid) || ancestors.length >= limits.depth) fail("INVALID_ANCESTRY");
      seenParents.add(parentUuid);
      ancestor = rawBlock(await this.call(scope,valid,() => logseq.Editor.getBlock(parentUuid,{includeChildren:true})));
      if (!ancestor) fail("PARENT_UNAVAILABLE"); ancestors.unshift(ancestor);
    }
    const ownership = await this.formalOwnership(scope,valid);
    const isDeclaredFormal = (node: RawBlock) => ownership?.roots.has(node.uuid) || formalSyntax(node.content) || lookupBlockIdentity(node.uuid,scope.graphId).kind === "FORMAL";
    const isFormal = (node: RawBlock) => isDeclaredFormal(node) || node.children.some(value => {const child=rawBlock(value);return child && managedSyntax(child.content,child.properties);});
    const isManaged = (node: RawBlock) => ownership?.managed.has(node.uuid) || managedSyntax(node.content,node.properties);
    const isAmbiguous = (node: RawBlock, parent: RawBlock | null) => !!parent && !ownership?.roots.has(parent.uuid) && isFormal(parent) && !isDeclaredFormal(node) && (node.children.length > 0 || !node.content.includes("\n"));
    const visit = async (node: RawBlock, parent: string | null, order: number, depth: number, chain: RawBlock[]) => {
      if (!valid()) fail("SCOPE_REVOKED");
      if (depth > limits.depth || rows.length >= limits.blocks || raws.has(node.uuid)) fail("INVALID_SUBTREE");
      const parentNode = chain.at(-1) ?? null;
      if (parentNode && node.parent && typeof node.parent.id === "number" && parentNode.id !== null && node.parent.id !== parentNode.id) fail("SUBTREE_PARENT_MISMATCH");
      const childNodes = node.children.map(value => {const child=rawBlock(value);if (!child) fail("SOURCE_SHAPE_UNSUPPORTED");return child;});
      raws.set(node.uuid,node); children.set(node.uuid,childNodes.map(child=>child.uuid)); paths.set(node.uuid,[...chain.map(node=>node.uuid),node.uuid]);
      rows.push({sourceId:JSON.stringify(["logseq",scope.graphId,node.uuid]),target:{kind:"logseq-block",graphId:scope.graphId,blockUuid:node.uuid},content:node.content,contentVersion:await sha256(node.content),parentUuid:parent,order,depth,availability:"available"});
      protections.set(node.uuid,protectionFor(node.content,{
        formal:!!isFormal(node), managed:!!isManaged(node)||chain.some(isManaged), ambiguous:!!isAmbiguous(node,parentNode)||chain.some((ancestor,index)=>isAmbiguous(ancestor,chain[index-1]??null)),
        todoAncestor:chain.some(node=>todoRanges(node.content).some(range=>range.start===0) && !isFormal(node)),
      }));
      for (const [index,child] of childNodes.entries()) await visit(child,node.uuid,index,depth+1,[...chain,node]);
    };
    let rootOrder=0;
    if(root){
      if(ancestors.length){rootOrder=ancestors.at(-1)!.children.findIndex(value=>record(value)?.uuid===root.uuid);if(rootOrder<0)fail("SOURCE_ORDER_UNAVAILABLE");}
      else {
        // A page root may be the third sibling. Follow native left links rather
        // than publishing a layout-local zero as its real source order.
        let left=root.left?.id;const seen=new Set<number>();
        if(typeof left!=="number"||typeof root.parent?.id!=="number")fail("SOURCE_ORDER_UNAVAILABLE");
        while(left!==root.parent.id){
          if(typeof left!=="number"||seen.has(left)||rootOrder>=limits.blocks)fail("SOURCE_ORDER_UNAVAILABLE");
          seen.add(left);const sibling=rawBlock(await this.call(scope,valid,()=>logseq.Editor.getBlock(left as number)));
          if(!sibling||sibling.parent?.id!==root.parent.id)fail("SOURCE_ORDER_UNAVAILABLE");
          rootOrder++;left=sibling.left?.id;
        }
      }
      await visit(root,await this.parentUuid(scope,root,valid),rootOrder,0,ancestors);
    }
    else rows.push({sourceId:JSON.stringify(["logseq",scope.graphId,scope.rootUuid]),target:{kind:"logseq-block",graphId:scope.graphId,blockUuid:scope.rootUuid},content:null,contentVersion:null,parentUuid:null,order:0,depth:0,availability:"missing"});
    const facts = await snapshot(scope, rows);
    const committed = this.committed ? await this.committed.read(scope, valid) : facts;
    // Protection/ancestry facts must describe the same committed version.
    if (committed.structureVersion !== facts.structureVersion || committed.sourceSetVersion !== facts.sourceSetVersion) fail("SOURCE_CHANGED_DURING_READ");
    await this.assertGraph(scope,valid);
    return {snapshot: committed, protections, children, paths};
  }
  async assertSafe(scope: SourceScope, affected: readonly string[], valid: () => boolean): Promise<void> {
    const composing = () => [...this.composing].some(target => {
      const node = target as Element | null;
      const id = typeof node?.closest === "function" ? node.closest(".ls-block")?.getAttribute("blockid") : null;
      return !id || affected.includes(id);
    });
    if (composing()) fail("NATIVE_COMPOSITION_ACTIVE");
    const editing = await this.call(scope,valid,() => logseq.Editor.checkEditing());
    if (editing && (typeof editing !== "string" || affected.includes(editing))) fail("NATIVE_EDITING_ACTIVE");
    const after = await this.call(scope,valid,() => logseq.Editor.checkEditing());
    if (composing() || (after && (typeof after !== "string" || affected.includes(after)))) fail("NATIVE_EDITING_ACTIVE");
  }
  private async write<T>(scope: SourceScope, uuid: string, valid: () => boolean, action: () => Promise<T>): Promise<T> {
    await this.assertGraph(scope,valid);
    const runtimeScope = pluginRuntime.identities.scope();
    return logseq.settings?.tasksEnabled !== false && runtimeScope.graphId === scope.graphId
      ? pluginRuntime.withSelfWrite(uuid,() => this.call(scope,valid,action),false,runtimeScope)
      : this.call(scope,valid,action);
  }
  async update(scope: SourceScope, uuid: string, content: string, valid: () => boolean): Promise<void> {
    await this.write(scope,uuid,valid,() => logseq.Editor.updateBlock(uuid,content));
  }
  async insert(scope: SourceScope, parent: string, lastChild: string | null, uuid: string, content: string, valid: () => boolean): Promise<void> {
    await this.write(scope,uuid,valid,() => logseq.Editor.insertBlock(lastChild ?? parent,content,{sibling:!!lastChild,before:false,customUUID:uuid}));
  }
  async persistIdentity(scope: SourceScope, uuid: string, content: string, valid: () => boolean): Promise<void> {
    const isDbGraph = await this.call(scope,valid,() => currentGraphIsDb(logseq.App));
    await ensurePersistentSourceIdentity({
      getBlock:id=>this.call(scope,valid,()=>logseq.Editor.getBlock(id)),
      upsertBlockProperty:(id,key,value)=>this.write(scope,id,valid,()=>logseq.Editor.upsertBlockProperty(id,key,value)),
    },{uuid,content,isDbGraph});
  }
  async needsRootIdentity(scope: SourceScope, valid: () => boolean): Promise<boolean> {
    const isDbGraph = await this.call(scope,valid,() => currentGraphIsDb(logseq.App));
    if(isDbGraph)return false;
    const current = rawBlock(await this.call(scope,valid,() => logseq.Editor.getBlock(scope.rootUuid)));
    if(!current)fail("SOURCE_UNAVAILABLE");
    if(Object.hasOwn(current.properties,"id")&&current.properties.id!==scope.rootUuid)fail("SOURCE_IDENTITY_CONFLICT");
    return current.properties.id !== scope.rootUuid;
  }
}
