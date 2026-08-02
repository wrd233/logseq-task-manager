import { stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";
import type {
  LocalServiceClient,
  ServiceCreationSessionCommitNode,
  ServiceCreationSessionCommitPreparation,
  ServiceCreationSessionCommitFinalization,
  ServiceCreationSessionUndoFinalization,
} from "@task-copilot/service-client";
import { StructuredError, checksum } from "@task-copilot/shared";

const projectPageOwner = "task-copilot-personal-mvp";
const ownerProperty = "task-copilot-owner";
const objectProperty = "task-copilot-object-id";
const commitProperty = "task-copilot-semantic-commit-id";

type CreationCommitClient = Pick<LocalServiceClient, "prepareCreationSessionCommit" | "finalizeCreationSessionCommit" | "compensateCreationSessionCommit">;
type CreationUndoClient = Pick<LocalServiceClient, "prepareCreationSessionUndo" | "finalizeCreationSessionUndo">;

export interface CreationSessionProjectPage {
  uuid: string;
  name: string;
  originalName?: string;
  properties?: Record<string, unknown>;
}

export interface CreationSessionProjectHost {
  getPage(identity: string): Promise<CreationSessionProjectPage | null>;
  createPage(pageName: string, properties: Record<string, string>, options: { redirect: false; createFirstBlock: false; journal: false }): Promise<CreationSessionProjectPage | null>;
  getPageBlocksTree(identity: string): Promise<unknown[] | null>;
  appendBlockInPage(pageIdentity: string, content: string, options?: { properties?: Record<string, unknown> }): Promise<unknown>;
  insertBlock(targetBlockUuid: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown>;
  removeBlock(blockUuid: string): Promise<unknown>;
  deletePage(pageName: string): Promise<void>;
}

export type CreationSessionProjectCommitResult =
  | (Extract<ServiceCreationSessionCommitFinalization, { status: "COMPLETED" }> & { pageName: string; pageCreated: boolean })
  | Extract<ServiceCreationSessionCommitPreparation, { status: "STALE" }>;

export type CreationSessionProjectUndoResult = ServiceCreationSessionUndoFinalization & { pageName: string };

function creationError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["CREATION-SESSION-001", "D-185", "D-188"], ...(details ? { details } : {}) });
}

function normalizedPropertyKey(value: string): string {
  return value.toLowerCase().replaceAll(/[-_]/g, "");
}

function property(properties: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!properties) return undefined;
  const normalized = normalizedPropertyKey(key);
  const entry = Object.entries(properties).find(([candidate]) => normalizedPropertyKey(candidate) === normalized);
  return typeof entry?.[1] === "string" ? entry[1] : undefined;
}

function expectedProperties(intent: { objectId: string; semanticCommitId: string }): Record<string, string> {
  return { [ownerProperty]: projectPageOwner, [objectProperty]: intent.objectId, [commitProperty]: intent.semanticCommitId };
}

function assertOwnedPage(page: CreationSessionProjectPage, intent: { pageName: string; objectId: string; semanticCommitId: string }): void {
  if ((page.originalName ?? page.name).toLowerCase() !== intent.pageName.toLowerCase()
    || property(page.properties, ownerProperty) !== projectPageOwner
    || property(page.properties, objectProperty) !== intent.objectId
    || property(page.properties, commitProperty) !== intent.semanticCommitId) {
    throw creationError("CREATION_SESSION_PROJECT_PAGE_OWNERSHIP_CONFLICT", `页面 ${intent.pageName} 已存在，但不属于这次 Creation Session；没有覆盖任何内容。`);
  }
}

function returnedUuid(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const uuid = (value as { uuid?: unknown }).uuid;
  return typeof uuid === "string" ? uuid : undefined;
}

interface RawTreeBlock { uuid: string; content: string; children: RawTreeBlock[] }

function rawTreeBlock(value: unknown): RawTreeBlock | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { uuid?: unknown; content?: unknown; children?: unknown };
  if (typeof record.uuid !== "string" || typeof record.content !== "string") return undefined;
  const children = Array.isArray(record.children) ? record.children.map(rawTreeBlock) : [];
  if (children.some((child) => !child)) return undefined;
  return { uuid: record.uuid, content: record.content, children: children as RawTreeBlock[] };
}

function isOwnedMetadataBlock(block: RawTreeBlock, intent: { objectId: string; semanticCommitId: string }): boolean {
  if (block.children.length > 0) return false;
  const properties = new Map<string, string>();
  for (const line of block.content.split("\n").map((item) => item.trim()).filter(Boolean)) {
    const match = /^([^:\n]+)::\s*(.*)$/u.exec(line);
    if (!match || properties.has(normalizedPropertyKey(match[1]!))) return false;
    properties.set(normalizedPropertyKey(match[1]!), match[2]!);
  }
  const expected = expectedProperties(intent);
  return properties.size === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => properties.get(normalizedPropertyKey(key)) === value);
}

function expectedChildren(nodes: ServiceCreationSessionCommitNode[], parentNodeId?: string): ServiceCreationSessionCommitNode[] {
  return nodes.filter((node) => node.parentNodeId === parentNodeId).sort((left, right) => left.order - right.order);
}

function treeMatches(blocksValue: unknown[], nodes: ServiceCreationSessionCommitNode[], intent: { objectId: string; semanticCommitId: string }): boolean {
  const normalized = blocksValue.map(rawTreeBlock);
  if (normalized.some((block) => !block)) return false;
  const roots = (normalized as RawTreeBlock[]).filter((block) => !isOwnedMetadataBlock(block, intent));
  const matches = (actual: RawTreeBlock[], expected: ServiceCreationSessionCommitNode[]): boolean => actual.length === expected.length && actual.every((block, index) => {
    const node = expected[index]!;
    return block.uuid === node.blockUuid
      && checksum(stripLogseqBlockIdentityProperty(block.content, block.uuid)) === node.contentHash
      && matches(block.children, expectedChildren(nodes, node.nodeId));
  });
  return matches(roots, expectedChildren(nodes));
}

function treeIsControlledPartial(blocksValue: unknown[], nodes: ServiceCreationSessionCommitNode[], intent: { objectId: string; semanticCommitId: string }): boolean {
  const normalized = blocksValue.map(rawTreeBlock);
  if (normalized.some((block) => !block)) return false;
  const stagingContent = `task-copilot-creation-session-staging:: ${intent.semanticCommitId}`;
  const roots = (normalized as RawTreeBlock[]).filter((block) => !isOwnedMetadataBlock(block, intent) && block.content !== stagingContent);
  const isPartial = (actual: RawTreeBlock[], expected: ServiceCreationSessionCommitNode[]): boolean => actual.length <= expected.length && actual.every((block, index) => {
    const node = expected[index]!;
    return block.uuid === node.blockUuid
      && checksum(stripLogseqBlockIdentityProperty(block.content, block.uuid)) === node.contentHash
      && isPartial(block.children, expectedChildren(nodes, node.nodeId));
  });
  return (normalized as RawTreeBlock[]).filter(({ content }) => content === stagingContent).length <= 1
    && isPartial(roots, expectedChildren(nodes));
}

function pageContentHash(input: { pageName: string; pageExternalId: string; objectId: string; semanticCommitId: string; nodes: ServiceCreationSessionCommitNode[] }): string {
  return checksum({
    pageName: input.pageName,
    pageExternalId: input.pageExternalId,
    properties: expectedProperties(input),
    nodes: input.nodes.map(({ nodeId, blockUuid, parentNodeId, order, text, contentHash }) => ({ nodeId, blockUuid, ...(parentNodeId ? { parentNodeId } : {}), order, text, contentHash })),
  });
}

async function readExactTree(host: CreationSessionProjectHost, page: CreationSessionProjectPage, intent: { objectId: string; semanticCommitId: string; nodes: ServiceCreationSessionCommitNode[] }): Promise<boolean> {
  const maxAttempts = 5;
  const backoffMs = [100, 200, 400, 800];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const blocks = await host.getPageBlocksTree(page.uuid);
    if (Array.isArray(blocks) && treeMatches(blocks, intent.nodes, intent)) return true;
    const delayMs = backoffMs[attempt - 1];
    if (delayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function insertTree(host: CreationSessionProjectHost, page: CreationSessionProjectPage, nodes: ServiceCreationSessionCommitNode[], semanticCommitId: string): Promise<void> {
  const created = new Set<string>();
  const insertChildren = async (parentNodeId?: string): Promise<void> => {
    let previous: ServiceCreationSessionCommitNode | undefined;
    for (const node of expectedChildren(nodes, parentNodeId)) {
      let result: unknown;
      if (!parentNodeId) throw creationError("CREATION_SESSION_PROJECT_ROOT_INSERT_INVALID", "Project 根节点必须通过受控 staging 位置插入。");
      else if (!previous) result = await host.insertBlock(nodes.find((candidate) => candidate.nodeId === parentNodeId)!.blockUuid, node.text, { sibling: false, before: true, customUUID: node.blockUuid });
      else result = await host.insertBlock(previous.blockUuid, node.text, { sibling: true, customUUID: node.blockUuid });
      if (returnedUuid(result) !== node.blockUuid || created.has(node.blockUuid)) throw creationError("CREATION_SESSION_PROJECT_BLOCK_IDENTITY_UNVERIFIED", "Logseq 没有返回已审阅的确定 Block identity；正式对象尚未创建。", { blockUuid: node.blockUuid });
      created.add(node.blockUuid);
      await insertChildren(node.nodeId);
      previous = node;
    }
  };
  const roots = expectedChildren(nodes);
  if (roots.length === 0) throw creationError("CREATION_SESSION_PROJECT_TREE_EMPTY", "Project Draft Tree 不能为空。");
  const stagingContent = `task-copilot-creation-session-staging:: ${semanticCommitId}`;
  const staging = await host.appendBlockInPage(page.uuid, stagingContent);
  const stagingUuid = returnedUuid(staging);
  if (!stagingUuid) throw creationError("CREATION_SESSION_PROJECT_STAGING_UNVERIFIED", "Logseq 未返回受控 staging Block identity；正式对象尚未创建。");
  let previousUuid = stagingUuid;
  for (const root of roots) {
    const result = await host.insertBlock(previousUuid, root.text, { sibling: true, customUUID: root.blockUuid });
    if (returnedUuid(result) !== root.blockUuid || created.has(root.blockUuid)) throw creationError("CREATION_SESSION_PROJECT_BLOCK_IDENTITY_UNVERIFIED", "Logseq 没有返回已审阅的确定 Block identity；正式对象尚未创建。", { blockUuid: root.blockUuid });
    created.add(root.blockUuid);
    await insertChildren(root.nodeId);
    previousUuid = root.blockUuid;
  }
  await host.removeBlock(stagingUuid);
}

async function confirmPageAbsent(host: CreationSessionProjectHost, ...identities: Array<string | undefined>): Promise<boolean> {
  const exact = [...new Set(identities.filter((value): value is string => Boolean(value)))];
  for (const delayMs of [0, 50, 100, 200]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if ((await Promise.all(exact.map((identity) => host.getPage(identity)))).every((page) => !page)) return true;
  }
  return false;
}

async function removeExactOwnedPage(host: CreationSessionProjectHost, page: CreationSessionProjectPage, intent: { pageName: string; objectId: string; semanticCommitId: string; nodes: ServiceCreationSessionCommitNode[] }): Promise<void> {
  assertOwnedPage(page, intent);
  if (!await readExactTree(host, page, intent)) throw creationError("CREATION_SESSION_PROJECT_PAGE_CHANGED", "受控 Project Page 已变化；系统不会删除它，请保留现场并检查恢复状态。");
  await host.deletePage(page.originalName ?? page.name);
  if (!await confirmPageAbsent(host, page.uuid, page.originalName ?? page.name, intent.pageName)) throw creationError("CREATION_SESSION_PROJECT_PAGE_DELETE_UNCONFIRMED", "Logseq 尚未确认受控 Project Page 已移除；事务没有收口。");
}

export async function commitCreationSessionProject(
  service: CreationCommitClient,
  host: CreationSessionProjectHost,
  proposalId: string,
  expectedUpdatedAt: string,
  traceId: string,
): Promise<CreationSessionProjectCommitResult> {
  const prepared = await service.prepareCreationSessionCommit(proposalId, { confirmation: "CREATE_FROM_SESSION", expectedUpdatedAt, traceId: `${traceId}:prepare` });
  if (prepared.status === "STALE") return prepared;
  if (prepared.status === "FAILED_COMPENSATED") throw creationError("CREATION_SESSION_PROJECT_COMMIT_FAILED", "上次 Project 创建失败已安全收口；请重新发起 Creation Session Proposal。");
  if (prepared.status === "COMPLETED") return { status: "COMPLETED", semanticCommitId: prepared.semanticCommitId, session: prepared.session, object: prepared.object, anchor: prepared.anchor, record: prepared.record, replayed: true, pageName: prepared.pageName, pageCreated: false };
  const intent = { pageName: prepared.pageName, objectId: prepared.objectId, semanticCommitId: prepared.semanticCommitId, nodes: prepared.nodes };
  if (prepared.status === "RECOVERY_REQUIRED") {
    const page = await host.getPage(prepared.pageExternalId) ?? await host.getPage(prepared.pageName);
    if (page) await removeExactOwnedPage(host, page, intent);
    if (!await confirmPageAbsent(host, prepared.pageExternalId, prepared.pageName)) throw creationError("CREATION_SESSION_PROJECT_RECOVERY_PAGE_PRESENT", "受控 Project Page 尚未精确移除；没有收口恢复。");
    await service.compensateCreationSessionCommit(proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt, pageExternalId: prepared.pageExternalId, pageContentHash: prepared.pageContentHash, pageExists: false, traceId: `${traceId}:compensate` });
    throw creationError("CREATION_SESSION_PROJECT_COMMIT_FAILED_COMPENSATED", "Project 正式对象没有创建；受控 Page 与失败事务已安全收口。");
  }
  let page = prepared.pageExternalId ? await host.getPage(prepared.pageExternalId) : await host.getPage(prepared.pageName);
  let pageCreated = false;
  if (page) {
    assertOwnedPage(page, intent);
    if (!await readExactTree(host, page, intent)) throw creationError("CREATION_SESSION_PROJECT_PAGE_CHANGED", "同一事务的 Project Page 不等于已审阅 Draft Tree；没有覆盖内容。");
  } else {
    page = await host.createPage(prepared.pageName, expectedProperties(intent), { redirect: false, createFirstBlock: false, journal: false });
    pageCreated = true;
    if (!page) throw creationError("CREATION_SESSION_PROJECT_PAGE_CREATE_FAILED", "Logseq 未能创建独立 Project Page；正式对象尚未创建。");
    assertOwnedPage(page, intent);
    try {
      await insertTree(host, page, prepared.nodes, prepared.semanticCommitId);
    } catch (error) {
      const partialTree = await host.getPageBlocksTree(page.uuid);
      if (!Array.isArray(partialTree) || !treeIsControlledPartial(partialTree, prepared.nodes, intent)) {
        throw creationError("CREATION_SESSION_PROJECT_PARTIAL_TREE_CHANGED", "Project Draft Tree 写入中断且现场含有非本事务内容；系统保留页面以避免静默覆盖。", { semanticCommitId: prepared.semanticCommitId });
      }
      await host.deletePage(page.originalName ?? page.name);
      if (!await confirmPageAbsent(host, page.uuid, page.originalName ?? page.name, prepared.pageName)) {
        throw creationError("CREATION_SESSION_PROJECT_PARTIAL_CLEANUP_UNCONFIRMED", "Project Draft Tree 写入中断，受控临时页面尚未确认移除；请保留现场并重试同一 Proposal。", { semanticCommitId: prepared.semanticCommitId });
      }
      throw error;
    }
    if (!await readExactTree(host, page, intent)) throw creationError("CREATION_SESSION_PROJECT_TREE_VERIFY_FAILED", "Project Draft Tree 写入后无法精确核验；正式对象尚未创建，请保留现场并重试同一 Proposal。");
  }
  const contentHash = pageContentHash({ ...intent, pageExternalId: page.uuid });
  let finalized: ServiceCreationSessionCommitFinalization;
  try {
    finalized = await service.finalizeCreationSessionCommit(proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt, pageExternalId: page.uuid, pageContentHash: contentHash, traceId: `${traceId}:finalize` });
  } catch {
    throw creationError("CREATION_SESSION_PROJECT_FINALIZE_RECOVERY_REQUIRED", "Project Page 已按已审阅 Draft 创建，但正式对象结果尚未确认；请保留页面并从同一 Proposal 继续。", { semanticCommitId: prepared.semanticCommitId });
  }
  if (finalized.status === "COMPENSATION_REQUIRED") {
    await removeExactOwnedPage(host, page, intent);
    await service.compensateCreationSessionCommit(proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt, pageExternalId: page.uuid, pageContentHash: contentHash, pageExists: false, traceId: `${traceId}:compensate` });
    throw creationError("CREATION_SESSION_PROJECT_COMMIT_FAILED_COMPENSATED", "Project 正式对象没有创建；受控 Page 与失败事务已安全收口。");
  }
  return { ...finalized, pageName: page.originalName ?? page.name, pageCreated };
}

export async function undoCreationSessionProject(
  service: CreationUndoClient,
  host: CreationSessionProjectHost,
  originalSemanticCommitId: string,
  traceId: string,
): Promise<CreationSessionProjectUndoResult> {
  let prepared = await service.prepareCreationSessionUndo(originalSemanticCommitId, { traceId: `${traceId}:prepare` });
  if (prepared.status === "COMPLETED") return { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, session: prepared.session, replayed: true, pageName: prepared.pageName };
  const intent = { pageName: prepared.pageName, objectId: prepared.objectId, semanticCommitId: originalSemanticCommitId, nodes: prepared.nodes };
  let page = await host.getPage(prepared.pageExternalId) ?? await host.getPage(prepared.pageName);
  if (prepared.status === "PAGE_PREFLIGHT_REQUIRED") {
    if (!page) throw creationError("CREATION_SESSION_PROJECT_UNDO_PAGE_MISSING", "独立 Project Page 已不存在；系统没有先删除正式对象。");
    assertOwnedPage(page, intent);
    if (!await readExactTree(host, page, intent)) throw creationError("CREATION_SESSION_PROJECT_UNDO_PAGE_CHANGED", "Project Page 已有后续变化；系统不会删除用户内容或正式对象。");
    prepared = await service.prepareCreationSessionUndo(originalSemanticCommitId, { traceId: `${traceId}:confirmed`, confirmedOwnedTree: true, pageExternalId: prepared.pageExternalId });
    if (prepared.status === "COMPLETED") return { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, session: prepared.session, replayed: true, pageName: prepared.pageName };
  }
  page = await host.getPage(prepared.pageExternalId) ?? await host.getPage(prepared.pageName);
  if (page) await removeExactOwnedPage(host, page, intent);
  if (!await confirmPageAbsent(host, prepared.pageExternalId, prepared.pageName)) throw creationError("CREATION_SESSION_PROJECT_UNDO_DELETE_UNCONFIRMED", "Project Page 尚未确认移除；Undo 保持可恢复状态。");
  const finalized = await service.finalizeCreationSessionUndo(originalSemanticCommitId, { undoSemanticCommitId: prepared.undoSemanticCommitId, pageExternalId: prepared.pageExternalId, pageExists: false, traceId: `${traceId}:finalize` });
  return { ...finalized, pageName: prepared.pageName };
}
