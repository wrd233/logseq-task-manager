import { graphIdentity } from "../../graph-adapter.ts";
import type { SourceSnapshot, SourceScope } from "../../workspace/source-protocol.ts";
import type { ContentInstallation } from "../content-writeback/installer.ts";
import type { Materials } from "./controller.ts";
import type { MaterialDropTarget } from "./references.ts";

/** Minimal composition adapter for the current main block-level report.
 * Branch 01 can replace resolve with a version-bound fragment/native port. */
export function installMaterialTransfers(materials: Materials, content: ContentInstallation, source: {read(scope: SourceScope): Promise<SourceSnapshot>}, work: {snapshot(): unknown} | null): void {
  const scope = async (rootUuid: string) => ({graphId: graphIdentity(await logseq.App.getCurrentGraph()), rootUuid});
  const valid = (selected: SourceScope) => {
    const current = work?.snapshot() as {graph?: string; root?: string; draft?: string | null} | null;
    return current?.graph === selected.graphId && current.root === selected.rootUuid && !current.draft;
  };
  materials.setTransferPort({
    scope, read: input => source.read(input),
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
      const body = element.closest('.wb-row .wb-body'), row = body?.closest<HTMLElement>('.wb-row');
      if (!row?.dataset.uuid || row.classList.contains('wb-review-history')) return null;
      const before = work?.snapshot() as {graph?: string; root?: string; draft?: string | null; blocks?: Array<{uuid: string; content: string}>} | null;
      if (!before?.root || !before.graph || before.draft) return null;
      const selected = await scope(before.root); if (selected.graphId !== before.graph) return null;
      const read = await source.read(selected), block = read.blocks.find(item => item.target.blockUuid === row.dataset.uuid);
      const after = work?.snapshot() as typeof before;
      if (!block?.contentVersion || block.availability !== "available" || after?.root !== before.root || after.graph !== before.graph || !row.isConnected) return null;
      // A row UUID alone is not a source mapping. Confirm current displayed source bytes.
      const shown = before.blocks?.find(item => item.uuid === row.dataset.uuid);
      if (!shown || shown.content !== block.content) return null;
      return {scope: selected, sourceId: block.sourceId, target: block.target, contentVersion: block.contentVersion, parentUuid: block.parentUuid, structureVersion: read.structureVersion, position: {kind: "child"}} satisfies MaterialDropTarget;
    },
  });
}
