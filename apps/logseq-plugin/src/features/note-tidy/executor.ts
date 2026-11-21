import { lookupBlockIdentity } from "../../block-identity.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { sha256, type BlockSnapshot, type SourceScope, type SourceSnapshot } from "../../workspace/source-protocol.ts";
import { formalSyntax, managedSyntax, propertyLines, todoRanges } from "../content-writeback/protection.ts";
import { saveTidySnapshot, type TidySnapshotBlock, type TidySnapshotInserted, type TidySnapshotRecord } from "./snapshots.ts";
import type { NoteTidyInput, NoteTidyPlan, NoteTidySourceBlock } from "./types.ts";

export function detectLocalBlockProtection(
  content: string,
  blockUuid: string,
  graphId: string
): { protected: boolean; reason?: string } {
  if (lookupBlockIdentity(blockUuid, graphId).kind === "FORMAL") {
    return { protected: true, reason: "formal" };
  }
  if (managedSyntax(content)) return { protected: true, reason: "managed" };
  if (formalSyntax(content)) return { protected: true, reason: "formal" };
  if (todoRanges(content).length > 0) return { protected: true, reason: "todo" };
  if (propertyLines(content).length > 0) return { protected: true, reason: "property" };
  return { protected: false };
}

export function assertSafeTidyText(text: string): void {
  if (typeof text !== "string" || !text.trim() || text.includes("\0") || text.length > 24_000) {
    throw new Error("整理后的文本为空或超出长度限制。");
  }
  if (managedSyntax(text) || formalSyntax(text) || propertyLines(text).length > 0 || todoRanges(text).length > 0) {
    throw new Error("整理文本不能包含受保护的 TODO 标记、正式对象语法或属性行。");
  }
}

export function selectSubtreeBlocks(blocks: readonly BlockSnapshot[], targetRootUuid?: string): BlockSnapshot[] {
  if (!targetRootUuid) return [...blocks];
  const root = blocks.find((b) => b.target.blockUuid === targetRootUuid);
  if (!root) return [...blocks];
  const included = new Set<string>([root.target.blockUuid]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const block of blocks) {
      if (block.parentUuid && included.has(block.parentUuid) && !included.has(block.target.blockUuid)) {
        included.add(block.target.blockUuid);
        expanded = true;
      }
    }
  }
  return blocks.filter((b) => included.has(b.target.blockUuid));
}

export function buildNoteTidyInputFromSnapshot(
  snapshot: SourceSnapshot,
  options: { instruction?: string; targetRootUuid?: string } = {}
): NoteTidyInput {
  const scoped = selectSubtreeBlocks(snapshot.blocks, options.targetRootUuid);
  const blocks: NoteTidySourceBlock[] = scoped
    .filter((b) => b.availability === "available" && typeof b.content === "string" && typeof b.contentVersion === "string")
    .map((b) => {
      const protection = detectLocalBlockProtection(b.content!, b.target.blockUuid, snapshot.scope.graphId);
      return {
        sourceId: b.sourceId,
        blockUuid: b.target.blockUuid,
        parentUuid: b.parentUuid,
        depth: b.depth,
        content: b.content!,
        contentVersion: b.contentVersion!,
        protected: protection.protected,
        ...(protection.reason ? { protectedReason: protection.reason } : {}),
      };
    });
  return {
    scope: snapshot.scope,
    structureVersion: snapshot.structureVersion,
    sourceSetVersion: snapshot.sourceSetVersion,
    ...(options.instruction?.trim() ? { instruction: options.instruction.trim() } : {}),
    ...(options.targetRootUuid ? { targetRootUuid: options.targetRootUuid } : {}),
    blocks,
  };
}

export async function applyNoteTidyPlan(options: {
  workKey: string;
  scope: SourceScope;
  plan: NoteTidyPlan;
  overrides?: ReadonlyMap<string, string>;
  checkActive(): Promise<void>;
  storage?: Pick<Storage, "getItem" | "setItem">;
}): Promise<{ appliedCount: number; snapshot: TidySnapshotRecord }> {
  const { workKey, scope, plan, overrides } = options;
  if (!plan.operations.length) {
    throw new Error("本次整理没有需要落盘的改动。");
  }

  const affectedBlockUuids = new Set<string>(
    plan.operations.map((op) => (op.type === "replace-text" ? op.blockUuid : op.parentBlockUuid))
  );

  const assertEnvironmentSafe = async () => {
    await options.checkActive();
    if (graphIdentity(await logseq.App.getCurrentGraph()) !== scope.graphId) {
      throw new Error("当前 Graph 已切换，已取消落盘。");
    }
    const editing = await logseq.Editor.checkEditing();
    if (editing && (typeof editing !== "string" || affectedBlockUuids.has(editing))) {
      throw new Error("请先结束原生编辑输入，再点击应用到左侧。");
    }
  };

  await assertEnvironmentSafe();

  // Resolve final texts (incorporating user in-place tweaks) and preflight EVERY block before writing a single byte!
  const replacePlan: Array<{
    sourceId: string;
    blockUuid: string;
    beforeContent: string;
    beforeVersion: string;
    afterContent: string;
  }> = [];
  const insertPlan: Array<{
    parentBlockUuid: string;
    afterContent: string;
  }> = [];

  for (const op of plan.operations) {
    if (op.type === "replace-text") {
      const finalText = overrides?.get(op.sourceId) ?? op.afterText;
      assertSafeTidyText(finalText);
      const live = await logseq.Editor.getBlock(op.blockUuid);
      if (!live || typeof live.content !== "string") {
        throw new Error("待更新原块已不存在或暂不可读，已安全中止（未修改任何内容）。");
      }
      const protection = detectLocalBlockProtection(live.content, op.blockUuid, scope.graphId);
      if (protection.protected) {
        throw new Error("目标块为受保护的 TODO、正式对象或属性块，已拒绝写入。");
      }
      const liveVersion = await sha256(live.content);
      if (liveVersion !== op.expectedContentVersion) {
        throw new Error("原块内容在预览期间已被修改，已安全中止落盘；你可以复制整理结果或重新整理。");
      }
      if (finalText !== live.content) {
        replacePlan.push({
          sourceId: op.sourceId,
          blockUuid: op.blockUuid,
          beforeContent: live.content,
          beforeVersion: liveVersion,
          afterContent: finalText,
        });
      }
    } else if (op.type === "insert-child") {
      const insertKey = `new:${op.operationId}`;
      const finalText = overrides?.get(insertKey) ?? op.afterText;
      assertSafeTidyText(finalText);
      const liveParent = await logseq.Editor.getBlock(op.parentBlockUuid);
      if (!liveParent || typeof liveParent.content !== "string") {
        throw new Error("待追加的父块已不存在或不可读，已安全中止。");
      }
      const liveParentVersion = await sha256(liveParent.content);
      if (liveParentVersion !== op.expectedParentContentVersion) {
        throw new Error("父块在预览期间已发生变化，已安全中止落盘。");
      }
      insertPlan.push({
        parentBlockUuid: op.parentBlockUuid,
        afterContent: finalText,
      });
    }
  }

  if (!replacePlan.length && !insertPlan.length) {
    throw new Error("内容与当前原文一致，无需写入。");
  }

  const snapshotBlocks: TidySnapshotBlock[] = [];
  const snapshotInserted: TidySnapshotInserted[] = [];

  for (const item of replacePlan) {
    await assertEnvironmentSafe();
    await logseq.Editor.updateBlock(item.blockUuid, item.afterContent);
    const readback = await logseq.Editor.getBlock(item.blockUuid);
    if (readback?.content !== item.afterContent) {
      throw new Error("写入结果读回未确认，请检查左侧原块。");
    }
    snapshotBlocks.push({
      blockUuid: item.blockUuid,
      sourceId: item.sourceId,
      beforeContent: item.beforeContent,
      beforeVersion: item.beforeVersion,
      afterContent: item.afterContent,
      afterVersion: await sha256(item.afterContent),
    });
  }

  for (const item of insertPlan) {
    await assertEnvironmentSafe();
    const created = await logseq.Editor.insertBlock(item.parentBlockUuid, item.afterContent, { sibling: false });
    if (!created?.uuid) {
      throw new Error("新增子块写入未确认，请检查左侧原块。");
    }
    snapshotInserted.push({
      blockUuid: created.uuid,
      parentBlockUuid: item.parentBlockUuid,
      content: item.afterContent,
      version: await sha256(item.afterContent),
    });
  }

  const snapshot: TidySnapshotRecord = {
    schemaVersion: 1,
    snapshotId: crypto.randomUUID(),
    workKey,
    scope,
    createdAt: new Date().toISOString(),
    summary: plan.summary,
    origin: plan.meta.origin,
    blocks: snapshotBlocks,
    inserted: snapshotInserted,
  };
  saveTidySnapshot(snapshot, options.storage ?? localStorage);

  return {
    appliedCount: snapshotBlocks.length + snapshotInserted.length,
    snapshot,
  };
}
