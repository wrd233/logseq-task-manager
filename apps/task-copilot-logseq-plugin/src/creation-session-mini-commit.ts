import { creationSessionMiniTreeHash } from "@task-copilot/application";
import { stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";
import type { LocalServiceClient, ServiceCreationSessionMiniGraphPlan, ServiceCreationSessionMiniTreeNode } from "@task-copilot/service-client";
import { StructuredError, checksum } from "@task-copilot/shared";

type MiniCommitClient = Pick<LocalServiceClient, "prepareCreationSessionMiniCommit" | "finalizeCreationSessionMiniCommit" | "compensateCreationSessionMiniCommit">;
type MiniUndoClient = Pick<LocalServiceClient, "prepareCreationSessionMiniUndo" | "finalizeCreationSessionMiniUndo">;

export interface CreationSessionMiniGraphHost {
  getBlock(blockUuid: string, options?: { includeChildren?: boolean }): Promise<unknown>;
  appendBlockInPage(pageIdentity: string, content: string): Promise<unknown>;
  insertBlock(targetBlockUuid: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown>;
  updateBlock(blockUuid: string, content: string): Promise<unknown>;
  moveBlock(sourceBlockUuid: string, targetBlockUuid: string, options?: { children: boolean }): Promise<unknown>;
  removeBlock(blockUuid: string): Promise<unknown>;
}

interface RawBlock { uuid: string; content: string; children: RawBlock[] }

function miniError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["CREATION-SESSION-001", "D-185", "D-188"], ...(details ? { details } : {}) });
}

function returnedUuid(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const uuid = (value as { uuid?: unknown }).uuid;
  return typeof uuid === "string" ? uuid : undefined;
}

function rawBlock(value: unknown): RawBlock | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { uuid?: unknown; content?: unknown; children?: unknown };
  if (typeof record.uuid !== "string" || typeof record.content !== "string") return undefined;
  const children = Array.isArray(record.children) ? record.children.map(rawBlock) : [];
  if (children.some((child) => !child)) return undefined;
  return { uuid: record.uuid, content: record.content, children: children as RawBlock[] };
}

function flattenTree(root: RawBlock): ServiceCreationSessionMiniTreeNode[] {
  const nodes: ServiceCreationSessionMiniTreeNode[] = [];
  const visit = (block: RawBlock, parentBlockUuid: string | undefined, order: number): void => {
    const text = stripLogseqBlockIdentityProperty(block.content, block.uuid);
    nodes.push({ blockUuid: block.uuid, text, ...(parentBlockUuid ? { parentBlockUuid } : {}), order, contentHash: checksum(text), operation: "KEEP" });
    block.children.forEach((child, index) => visit(child, block.uuid, index));
  };
  visit(root, undefined, 0);
  return nodes;
}

async function currentTree(host: CreationSessionMiniGraphHost, rootBlockUuid: string): Promise<ServiceCreationSessionMiniTreeNode[] | undefined> {
  const value = await host.getBlock(rootBlockUuid, { includeChildren: true });
  if (!value) return undefined;
  const root = rawBlock(value);
  if (!root || root.uuid !== rootBlockUuid) throw miniError("CREATION_SESSION_MINI_TREE_UNREADABLE", "Logseq 返回的 MiniProject Tree 身份无效；没有继续写入。");
  return flattenTree(root);
}

async function currentHash(host: CreationSessionMiniGraphHost, plan: ServiceCreationSessionMiniGraphPlan): Promise<string> {
  const nodes = await currentTree(host, plan.rootBlockUuid);
  return nodes ? creationSessionMiniTreeHash(plan.rootBlockUuid, nodes) : checksum({ rootBlockUuid: plan.rootBlockUuid, exists: false });
}

function children(nodes: ServiceCreationSessionMiniTreeNode[], parentBlockUuid?: string): ServiceCreationSessionMiniTreeNode[] {
  return nodes.filter((node) => node.parentBlockUuid === parentBlockUuid).sort((left, right) => left.order - right.order);
}

async function moveTo(host: CreationSessionMiniGraphHost, blockUuid: string, parentBlockUuid: string, previousSiblingUuid: string | null): Promise<void> {
  if (previousSiblingUuid === null) await host.moveBlock(blockUuid, parentBlockUuid, { children: true });
  else await host.moveBlock(blockUuid, previousSiblingUuid);
}

async function insertDescendants(host: CreationSessionMiniGraphHost, plan: ServiceCreationSessionMiniGraphPlan, parent: ServiceCreationSessionMiniTreeNode): Promise<void> {
  let previous: ServiceCreationSessionMiniTreeNode | undefined;
  for (const node of children(plan.afterNodes, parent.blockUuid)) {
    const result = !previous
      ? await host.insertBlock(parent.blockUuid, node.text, { sibling: false, before: true, customUUID: node.blockUuid })
      : await host.insertBlock(previous.blockUuid, node.text, { sibling: true, customUUID: node.blockUuid });
    if (returnedUuid(result) !== node.blockUuid) throw miniError("CREATION_SESSION_MINI_BLOCK_IDENTITY_UNVERIFIED", "Logseq 没有返回已审阅的确定 Block identity；事务将恢复原树。", { blockUuid: node.blockUuid });
    await insertDescendants(host, plan, node);
    previous = node;
  }
}

async function createNewTree(host: CreationSessionMiniGraphHost, plan: ServiceCreationSessionMiniGraphPlan, semanticCommitId: string): Promise<void> {
  const root = plan.afterNodes.find(({ blockUuid }) => blockUuid === plan.rootBlockUuid)!;
  let result: unknown;
  if (plan.placement.kind === "SOURCE_BLOCK_CHILD") result = await host.insertBlock(plan.placement.sourceBlockUuid, root.text, { sibling: false, customUUID: root.blockUuid });
  else if (plan.placement.kind === "AFTER_SELECTED_BLOCK") result = await host.insertBlock(plan.placement.selectedBlockUuid, root.text, { sibling: true, customUUID: root.blockUuid });
  else if (plan.placement.kind === "PAGE_END") {
    const stagingContent = `task-copilot-creation-session-staging:: ${semanticCommitId}`;
    const staging = await host.appendBlockInPage(plan.placement.pageId, stagingContent);
    const stagingUuid = returnedUuid(staging);
    if (!stagingUuid) throw miniError("CREATION_SESSION_MINI_STAGING_UNVERIFIED", "Logseq 未返回受控 staging Block；没有创建 MiniProject Tree。");
    try {
      result = await host.insertBlock(stagingUuid, root.text, { sibling: true, customUUID: root.blockUuid });
      if (returnedUuid(result) !== root.blockUuid) throw miniError("CREATION_SESSION_MINI_BLOCK_IDENTITY_UNVERIFIED", "Logseq 没有返回已审阅的 MiniProject 根 Block identity。");
      await host.removeBlock(stagingUuid);
    } catch (error) {
      const staged = rawBlock(await host.getBlock(stagingUuid, { includeChildren: true }));
      if (staged && staged.content === stagingContent && staged.children.length === 0) await host.removeBlock(stagingUuid);
      else if (staged) throw miniError("CREATION_SESSION_MINI_STAGING_CHANGED", "受控 staging Block 已变化；系统保留现场，不会删除未知内容。");
      throw error;
    }
  } else throw miniError("CREATION_SESSION_MINI_PLACEMENT_INVALID", "新 MiniProject Tree 的 Placement 无效。");
  if (returnedUuid(result) !== root.blockUuid) throw miniError("CREATION_SESSION_MINI_BLOCK_IDENTITY_UNVERIFIED", "Logseq 没有返回已审阅的 MiniProject 根 Block identity。");
  await insertDescendants(host, plan, root);
}

async function applyInPlace(host: CreationSessionMiniGraphHost, plan: ServiceCreationSessionMiniGraphPlan): Promise<void> {
  const beforeIds = new Set(plan.beforeNodes.map(({ blockUuid }) => blockUuid));
  for (const node of plan.afterNodes.filter(({ blockUuid }) => beforeIds.has(blockUuid))) await host.updateBlock(node.blockUuid, node.text);
  const placeChildren = async (parentBlockUuid: string): Promise<void> => {
    let previous: string | null = null;
    for (const node of children(plan.afterNodes, parentBlockUuid)) {
      if (beforeIds.has(node.blockUuid)) await moveTo(host, node.blockUuid, parentBlockUuid, previous);
      else {
        const created = previous === null
          ? await host.insertBlock(parentBlockUuid, node.text, { sibling: false, before: true, customUUID: node.blockUuid })
          : await host.insertBlock(previous, node.text, { sibling: true, customUUID: node.blockUuid });
        if (returnedUuid(created) !== node.blockUuid) throw miniError("CREATION_SESSION_MINI_BLOCK_IDENTITY_UNVERIFIED", "Logseq 没有返回已审阅的确定 Block identity；事务将恢复原树。", { blockUuid: node.blockUuid });
      }
      await placeChildren(node.blockUuid);
      previous = node.blockUuid;
    }
  };
  await placeChildren(plan.rootBlockUuid);
}

async function assertControlledMixedTree(host: CreationSessionMiniGraphHost, plan: ServiceCreationSessionMiniGraphPlan): Promise<void> {
  const actual = await currentTree(host, plan.rootBlockUuid);
  if (!actual) throw miniError("CREATION_SESSION_MINI_PARTIAL_TREE_MISSING", "原位 MiniProject Tree 在写入期间消失；系统不会猜测恢复。");
  const allowed = new Map([...plan.beforeNodes, ...plan.afterNodes].map((node) => [node.blockUuid, new Set<string>()]));
  for (const node of [...plan.beforeNodes, ...plan.afterNodes]) allowed.get(node.blockUuid)!.add(node.contentHash);
  if (actual.some((node) => !allowed.get(node.blockUuid)?.has(node.contentHash))) throw miniError("CREATION_SESSION_MINI_PARTIAL_TREE_CHANGED", "MiniProject 写入现场含有非本事务内容；系统保留现场，不会静默覆盖。");
}

async function restoreBefore(host: CreationSessionMiniGraphHost, plan: ServiceCreationSessionMiniGraphPlan): Promise<void> {
  if (plan.mode === "NEW_TREE") {
    const actual = await currentTree(host, plan.rootBlockUuid);
    if (!actual) return;
    if (creationSessionMiniTreeHash(plan.rootBlockUuid, actual) !== plan.afterHash && actual.some((node) => !plan.afterNodes.some((expected) => expected.blockUuid === node.blockUuid && expected.contentHash === node.contentHash))) {
      throw miniError("CREATION_SESSION_MINI_TREE_CHANGED", "新 MiniProject Tree 含有后续或未知内容；系统不会删除它。");
    }
    await host.removeBlock(plan.rootBlockUuid);
    return;
  }
  await assertControlledMixedTree(host, plan);
  const beforeIds = new Set(plan.beforeNodes.map(({ blockUuid }) => blockUuid));
  const placeChildren = async (parentBlockUuid: string): Promise<void> => {
    let previous: string | null = null;
    for (const node of children(plan.beforeNodes, parentBlockUuid)) {
      await moveTo(host, node.blockUuid, parentBlockUuid, previous);
      await placeChildren(node.blockUuid);
      previous = node.blockUuid;
    }
  };
  await placeChildren(plan.rootBlockUuid);
  for (const node of [...plan.afterNodes].reverse()) if (!beforeIds.has(node.blockUuid) && await host.getBlock(node.blockUuid)) await host.removeBlock(node.blockUuid);
  for (const node of plan.beforeNodes) await host.updateBlock(node.blockUuid, node.text);
}

async function applyGraph(host: CreationSessionMiniGraphHost, plan: ServiceCreationSessionMiniGraphPlan, semanticCommitId: string): Promise<void> {
  const observed = await currentHash(host, plan);
  if (observed === plan.afterHash) return;
  if (observed !== plan.beforeHash) {
    await restoreBefore(host, plan);
    if (await currentHash(host, plan) !== plan.beforeHash) throw miniError("CREATION_SESSION_MINI_RECOVERY_VERIFY_FAILED", "MiniProject Tree 未恢复到审阅前状态；没有继续写入。");
  }
  try {
    if (plan.mode === "NEW_TREE") await createNewTree(host, plan, semanticCommitId);
    else await applyInPlace(host, plan);
  } catch (error) {
    await restoreBefore(host, plan);
    if (await currentHash(host, plan) !== plan.beforeHash) throw miniError("CREATION_SESSION_MINI_RECOVERY_VERIFY_FAILED", "MiniProject Tree 写入中断且自动恢复未通过；请保留现场。");
    throw error;
  }
  if (await currentHash(host, plan) !== plan.afterHash) {
    await restoreBefore(host, plan);
    throw miniError("CREATION_SESSION_MINI_TREE_VERIFY_FAILED", "MiniProject Tree 写入后无法精确核验，已恢复审阅前状态。");
  }
}

export async function commitCreationSessionMini(service: MiniCommitClient, host: CreationSessionMiniGraphHost, proposalId: string, expectedUpdatedAt: string, traceId: string) {
  const prepared = await service.prepareCreationSessionMiniCommit(proposalId, { confirmation: "CREATE_FROM_SESSION", expectedUpdatedAt, traceId: `${traceId}:prepare` });
  if (prepared.status === "STALE" || prepared.status === "COMPLETED") return prepared;
  if (prepared.status === "FAILED_COMPENSATED") throw miniError("CREATION_SESSION_MINI_COMMIT_FAILED", "上次 MiniProject 创建失败已安全收口；请重新发起 Proposal。");
  if (prepared.status === "RECOVERY_REQUIRED") {
    await restoreBefore(host, prepared.graphPlan);
    if (await currentHash(host, prepared.graphPlan) !== prepared.graphPlan.beforeHash) throw miniError("CREATION_SESSION_MINI_RECOVERY_VERIFY_FAILED", "MiniProject Tree 尚未恢复，不能关闭恢复账本。");
    await service.compensateCreationSessionMiniCommit(proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt, rootBlockUuid: prepared.graphPlan.rootBlockUuid, graphContentHash: prepared.graphPlan.beforeHash, traceId: `${traceId}:compensate` });
    throw miniError("CREATION_SESSION_MINI_COMMIT_FAILED_COMPENSATED", "MiniProject 正式对象没有创建；Graph 与失败事务已安全收口。");
  }
  await applyGraph(host, prepared.graphPlan, prepared.semanticCommitId);
  let finalized;
  try {
    finalized = await service.finalizeCreationSessionMiniCommit(proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt, rootBlockUuid: prepared.graphPlan.rootBlockUuid, graphContentHash: prepared.graphPlan.afterHash, traceId: `${traceId}:finalize` });
  } catch {
    throw miniError("CREATION_SESSION_MINI_FINALIZE_RECOVERY_REQUIRED", "MiniProject Tree 已按审阅计划写入，但正式对象结果尚未确认；请从同一 Proposal 继续。");
  }
  if (finalized.status === "COMPENSATION_REQUIRED") {
    await restoreBefore(host, prepared.graphPlan);
    if (await currentHash(host, prepared.graphPlan) !== prepared.graphPlan.beforeHash) throw miniError("CREATION_SESSION_MINI_RECOVERY_VERIFY_FAILED", "MiniProject Tree 自动补偿未通过；请保留现场。");
    await service.compensateCreationSessionMiniCommit(proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt, rootBlockUuid: prepared.graphPlan.rootBlockUuid, graphContentHash: prepared.graphPlan.beforeHash, traceId: `${traceId}:compensate` });
    throw miniError("CREATION_SESSION_MINI_COMMIT_FAILED_COMPENSATED", "MiniProject 正式对象没有创建；Graph 与失败事务已安全收口。");
  }
  return finalized;
}

export async function undoCreationSessionMini(service: MiniUndoClient, host: CreationSessionMiniGraphHost, originalSemanticCommitId: string, traceId: string) {
  let prepared = await service.prepareCreationSessionMiniUndo(originalSemanticCommitId, { traceId: `${traceId}:preflight` });
  if (prepared.status === "COMPLETED") return prepared;
  if (await currentHash(host, prepared.graphPlan) !== prepared.graphPlan.afterHash) throw miniError("CREATION_SESSION_MINI_UNDO_TREE_CHANGED", "MiniProject Tree 已有后续变化；系统不会删除内容或正式对象。");
  if (prepared.status === "GRAPH_PREFLIGHT_REQUIRED") prepared = await service.prepareCreationSessionMiniUndo(originalSemanticCommitId, { traceId: `${traceId}:prepare`, confirmedGraphHash: prepared.graphPlan.afterHash });
  if (prepared.status === "COMPLETED") return prepared;
  await restoreBefore(host, prepared.graphPlan);
  if (await currentHash(host, prepared.graphPlan) !== prepared.graphPlan.beforeHash) throw miniError("CREATION_SESSION_MINI_UNDO_RESTORE_FAILED", "MiniProject Tree 未精确恢复；Undo 保持可继续状态。");
  return service.finalizeCreationSessionMiniUndo(originalSemanticCommitId, { undoSemanticCommitId: prepared.undoSemanticCommitId, graphContentHash: prepared.graphPlan.beforeHash, traceId: `${traceId}:finalize` });
}
