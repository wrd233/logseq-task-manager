import { graphIdentity } from "../../graph-adapter.ts";
import type { SourceSnapshot, SourceScope } from "../../workspace/source-protocol.ts";
import type { ContentInstallation } from "../content-writeback/installer.ts";
import type { Materials } from "./controller.ts";
import type { MaterialDropTarget } from "./references.ts";
import type { WorkView } from "../work-view/controller.ts";

/** Composition adapter consuming the published report's versioned body port. */
export function installMaterialTransfers(materials: Materials, content: ContentInstallation, source: {read(scope: SourceScope): Promise<SourceSnapshot>}, work: Pick<WorkView, "snapshot" | "resolveBodyDrop"> | null): void {
  const scope = async (rootUuid: string) => ({graphId: graphIdentity(await logseq.App.getCurrentGraph()), rootUuid});
  const valid = (selected: SourceScope) => {
    const current = work?.snapshot() as {graph?: string; root?: string; draft?: string | null} | null;
    return current?.graph === selected.graphId && current.root === selected.rootUuid && !current.draft;
  };
  materials.setTransferPort({
    scope, read: input => source.read(input),
    body: element => element.closest('.wb-row .wb-body'),
    currentScope: () => {
      const current = work?.snapshot() as {graph?: string; root?: string} | null;
      return current?.graph && current.root ? {graphId: current.graph, rootUuid: current.root} : null;
    },
    valid,
    navigate: uuid => logseq.Editor.editBlock(uuid),
    content: {
      scope: () => { const selected = content.api.scope(); return selected && valid(selected) ? selected : null; }, read: input => content.api.read(input),
      readCommitted: input => source.read(input),
      apply: patch => {
        if (!valid(patch.scope)) throw new Error("当前工作或原生输入已变化，引用操作未发送。");
        return content.local.apply(patch, "material-reference");
      },
      result: async (input, requestId) => {
        const active = content.api.scope(); if (!active || active.graphId !== input.graphId || active.rootUuid !== input.rootUuid) throw new Error("正文维护范围已变化。");
        return content.api.result(requestId);
      },
    },
    resolve: async element => {
      if (!element.isConnected) return null;
      const resolved = await work?.resolveBodyDrop(element, "child");
      if (!resolved?.ok || resolved.value.position.kind !== "child" || !valid(resolved.value.scope)) return null;
      const mapped = resolved.value, selected = await scope(mapped.scope.rootUuid);
      if (selected.graphId !== mapped.scope.graphId) return null;
      const read = await source.read(selected), block = read.blocks.find(item => item.sourceId === mapped.sourceId && item.target.blockUuid === mapped.target.blockUuid);
      if (!block?.contentVersion || block.availability !== "available" || block.contentVersion !== mapped.contentVersion || read.structureVersion !== mapped.structureVersion || !valid(selected) || !element.isConnected) return null;
      return {scope: selected, sourceId: block.sourceId, target: block.target, contentVersion: block.contentVersion, parentUuid: block.parentUuid, structureVersion: read.structureVersion, position: {kind: "child"}} satisfies MaterialDropTarget;
    },
  });
}
