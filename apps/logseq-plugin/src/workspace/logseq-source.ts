import { graphIdentity } from "../graph-adapter.ts";
import { SourceReader } from "./source-reader.ts";
import { object, identifier, MAX_BLOCKS } from "./source-protocol.ts";

/** One committed SDK provider, usable for ordinary unbound blocks as well. */
export function logseqSourceReader(): SourceReader {
  return new SourceReader({
    graphId: async () => graphIdentity(await logseq.App.getCurrentGraph()),
    getBlock: (uuid, options) => logseq.Editor.getBlock(uuid, options),
    getPage: name => logseq.Editor.getPage(name),
    getPageBlocksTree: name => logseq.Editor.getPageBlocksTree(name),
    rootPosition: async (value, check) => {
      const root = object(value), parent = object(root.parent), page = object(root.page);
      let parentUuid: string | null = null, order = 0;
      if (parent.id !== page.id) {
        const raw = typeof parent.uuid === "string" ? parent : await logseq.Editor.getBlock(parent.id as number);
        await check(); parentUuid = identifier(object(raw).uuid);
        const tree = await logseq.Editor.getBlock(parentUuid, {includeChildren: true}); await check();
        const children = object(tree).children;
        if (!Array.isArray(children)) throw new Error("WORKSPACE_SOURCE_ORDER_UNAVAILABLE");
        order = children.findIndex(child => object(child).uuid === root.uuid);
        if (order < 0) throw new Error("WORKSPACE_SOURCE_ORDER_UNAVAILABLE");
      } else {
        let left = object(root.left).id; const seen = new Set<number>();
        if (typeof parent.id !== "number") throw new Error("WORKSPACE_SOURCE_ORDER_UNAVAILABLE");
        while (left !== parent.id) {
          if (typeof left !== "number" || seen.has(left) || order >= MAX_BLOCKS) throw new Error("WORKSPACE_SOURCE_ORDER_UNAVAILABLE");
          seen.add(left); const sibling = object(await logseq.Editor.getBlock(left)); await check();
          if (object(sibling.parent).id !== parent.id) throw new Error("WORKSPACE_SOURCE_ORDER_UNAVAILABLE");
          order++; left = object(sibling.left).id;
        }
      }
      return {parentUuid, order};
    },
  });
}
