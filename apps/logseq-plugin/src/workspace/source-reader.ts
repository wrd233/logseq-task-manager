import { identifier, object, scopeOf, sha256, snapshot, sourceId, MAX_BLOCKS, MAX_TEXT, type BlockSnapshot, type SourceScope, type SourceSnapshot } from "./source-protocol.ts";

export interface SourceReadHost {
  getBlock(uuid: string, options: {includeChildren: true}): Promise<unknown>;
  getPage?(name: string): Promise<unknown>;
  getPageBlocksTree?(name: string): Promise<unknown>;
  graphId(): Promise<string>;
  rootPosition?(tree: unknown, check: () => Promise<void>): Promise<{parentUuid: string | null; order: number}>;
}
export class ScopeExpired extends Error { constructor() { super("WORKSPACE_SCOPE_EXPIRED"); } }
/** Real host tree order only: no work-view layouts, retained blocks or editor drafts. */
export class SourceReader {
  constructor(private readonly host: SourceReadHost) {}
  async read(input: SourceScope, valid: () => boolean, pageName?: string): Promise<SourceSnapshot> {
    const scope = scopeOf(input);
    if(pageName!==undefined)return this.readPage({...scope,kind:"page",pageName:identifier(pageName)},valid);
    if (scope.kind === "page") return this.readPage(scope, valid);
    const check = async () => { if (!valid() || await this.host.graphId() !== scope.graphId || !valid()) throw new ScopeExpired(); };
    await check();
    let tree: unknown;
    try {
      tree = await this.host.getBlock(scope.rootUuid, {includeChildren: true});
    } catch (error) {
      await check(); if (error instanceof ScopeExpired) throw error;
      return this.absent(scope, "unavailable");
    }
    await check();
    if (tree === null || tree === undefined) return this.absent(scope, "missing");
    if (object(tree).uuid !== scope.rootUuid) throw new Error("WORKSPACE_ROOT_MISMATCH");
    const blocks: BlockSnapshot[] = [], seen = new Set<string>(); let size = 0;
    const visit = async (value: unknown, parentUuid: string | null, order: number, depth: number): Promise<void> => {
      if (!valid()) throw new ScopeExpired();
      const block = object(value), uuid = identifier(block.uuid), content = typeof block.content === "string" ? block.content : block.title;
      if (typeof content !== "string" || seen.has(uuid) || depth > 128 || blocks.length >= MAX_BLOCKS || (size += content.length) > MAX_TEXT) throw new Error("WORKSPACE_TREE_INVALID_OR_TOO_LARGE");
      seen.add(uuid);
      blocks.push({sourceId: sourceId(scope.graphId, uuid), target: {kind: "logseq-block", graphId: scope.graphId, blockUuid: uuid}, content, contentVersion: await sha256(content), parentUuid, order, depth, availability: "available"});
      if (block.children !== undefined && !Array.isArray(block.children)) throw new Error("WORKSPACE_CHILDREN_UNSUPPORTED");
      const children = (block.children ?? []) as unknown[];
      for (let i = 0; i < children.length; i++) await visit(children[i], uuid, i, depth + 1);
    };
    const position = pageName === undefined && this.host.rootPosition ? await this.host.rootPosition(tree, check) : {parentUuid: null, order: 0};
    await visit(tree, position.parentUuid, position.order, 0); await check(); return snapshot(scope, blocks);
  }
  absent(scope: SourceScope, availability: "missing" | "unavailable"): Promise<SourceSnapshot> {
    return snapshot(scope, [{sourceId: sourceId(scope.graphId, scope.rootUuid), target: {kind: "logseq-block", graphId: scope.graphId, blockUuid: scope.rootUuid}, content: null, contentVersion: null, parentUuid: null, order: 0, depth: 0, availability}]);
  }
  /** Primary page reading is a forest of real blocks, with a separate read-only page identity. */
  private async readPage(scope: SourceScope, valid: () => boolean): Promise<SourceSnapshot> {
    const check = async () => { if (!valid() || await this.host.graphId() !== scope.graphId || !valid()) throw new ScopeExpired(); };
    const absent = (availability: "missing" | "unavailable") => snapshot(scope,[],undefined,{pageUuid:scope.rootUuid,pageName:scope.pageName!,availability});
    await check();
    if (!this.host.getPage || !this.host.getPageBlocksTree) return absent("unavailable");
    let roots: unknown;
    try {
      const page=await this.host.getPage(scope.pageName!);await check();
      if (!page || object(page).uuid !== scope.rootUuid) return absent("missing");
      roots=await this.host.getPageBlocksTree(scope.pageName!);await check();
      if (!Array.isArray(roots)) return absent("unavailable");
    } catch { await check();return absent("unavailable"); }
    const blocks: BlockSnapshot[]=[], seen=new Set<string>();let size=0;
    const visit=async (value:unknown,parentUuid:string,order:number,depth:number):Promise<void>=>{
      if (!valid()) throw new ScopeExpired();
      const block=object(value),uuid=identifier(block.uuid),content=block.content;
      if (typeof content !== "string" || uuid === scope.rootUuid || seen.has(uuid) || depth > 128 || blocks.length >= MAX_BLOCKS || (size+=content.length)>MAX_TEXT) throw new Error("WORKSPACE_TREE_INVALID_OR_TOO_LARGE");
      seen.add(uuid);blocks.push({sourceId:sourceId(scope.graphId,uuid),target:{kind:"logseq-block",graphId:scope.graphId,blockUuid:uuid},content,contentVersion:await sha256(content),parentUuid,order,depth,availability:"available"});
      if (block.children !== undefined && !Array.isArray(block.children)) throw new Error("WORKSPACE_CHILDREN_UNSUPPORTED");
      const children=(block.children??[]) as unknown[];for(let i=0;i<children.length;i++)await visit(children[i],uuid,i,depth+1);
    };
    for(let i=0;i<(roots as unknown[]).length;i++)await visit((roots as unknown[])[i],scope.rootUuid,i,0);
    await check();return snapshot(scope,blocks,undefined,{pageUuid:scope.rootUuid,pageName:scope.pageName!,availability:"available"});
  }
}
