import { identifier, object, scopeOf, sha256, snapshot, sourceId, MAX_BLOCKS, MAX_TEXT, type BlockSnapshot, type SourceScope, type SourceSnapshot } from "./source-protocol.ts";

export interface SourceReadHost {
  getBlock(uuid: string, options: {includeChildren: true}): Promise<unknown>;
  getPage?(name: string): Promise<unknown>;
  getPageBlocksTree?(name: string): Promise<unknown>;
  graphId(): Promise<string>;
}
export class ScopeExpired extends Error { constructor() { super("WORKSPACE_SCOPE_EXPIRED"); } }
/** Real host tree order only: no work-view layouts, retained blocks or editor drafts. */
export class SourceReader {
  constructor(private readonly host: SourceReadHost) {}
  async read(input: SourceScope, valid: () => boolean, pageName?: string): Promise<SourceSnapshot> {
    const scope = scopeOf(input);
    const check = async () => { if (!valid() || await this.host.graphId() !== scope.graphId || !valid()) throw new ScopeExpired(); };
    await check();
    let tree: unknown;
    try {
      if (pageName !== undefined) {
        identifier(pageName);
        if (!this.host.getPage || !this.host.getPageBlocksTree) throw new Error("WORKSPACE_PAGE_READ_UNAVAILABLE");
        const page = await this.host.getPage(pageName); await check();
        if (page === null) return this.absent(scope, "missing");
        if (object(page).uuid !== scope.rootUuid) throw new Error("WORKSPACE_PAGE_ID_CHANGED");
        const children = await this.host.getPageBlocksTree(pageName); await check();
        if (!Array.isArray(children)) throw new Error("WORKSPACE_PAGE_READ_UNAVAILABLE");
        // Page names are locators, not invented body text.
        tree = {...object(page), content: typeof object(page).content === "string" ? object(page).content : "", children};
      } else tree = await this.host.getBlock(scope.rootUuid, {includeChildren: true});
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
    await visit(tree, null, 0, 0); await check(); return snapshot(scope, blocks);
  }
  absent(scope: SourceScope, availability: "missing" | "unavailable"): Promise<SourceSnapshot> {
    return snapshot(scope, [{sourceId: sourceId(scope.graphId, scope.rootUuid), target: {kind: "logseq-block", graphId: scope.graphId, blockUuid: scope.rootUuid}, content: null, contentVersion: null, parentUuid: null, order: 0, depth: 0, availability}]);
  }
}
