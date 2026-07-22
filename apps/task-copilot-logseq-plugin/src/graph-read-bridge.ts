import type { ServiceGraphBlockExcerpt, ServiceGraphReadRequest, ServiceGraphReadResult, ServiceGraphSnapshot } from "@task-copilot/service-client";
import { stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";
import { checksum } from "@task-copilot/shared";

import { proposalPageEvidenceHash } from "./v2-proposal-revalidation.ts";

export interface GraphReadBridgeHost {
  getPage(target: unknown): Promise<unknown>;
  getPageBlocksTree(target: unknown): Promise<unknown>;
  getBlock(target: unknown, options?: { includeChildren: boolean }): Promise<unknown>;
}

interface PageIdentity {
  id: string;
  uuid?: string;
  name: string;
  version?: number;
  evidenceHash: string;
}

interface RawBlock {
  uuid: string;
  content: string;
  parent?: unknown;
  page?: unknown;
  children: unknown[];
}

const maximumBlocks = 256;
const maximumBlockBytes = 64 * 1024;
const maximumExcerptBytes = 1024 * 1024;

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function blockReference(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.length === 2 && typeof value[1] === "string" ? value[1] : value[0];
}

async function normalizeBlock(value: unknown, host: GraphReadBridgeHost): Promise<RawBlock | undefined> {
  let source = record(value);
  if (!source) source = record(await host.getBlock(blockReference(value), { includeChildren: false }));
  if (!source) return undefined;
  const uuid = stringField(source, "uuid");
  if (!uuid || typeof source.content !== "string") return undefined;
  if (utf8Bytes(source.content) > maximumBlockBytes) throw new Error("GRAPH_READ_BLOCK_TOO_LARGE");
  return {
    uuid,
    content: source.content,
    ...(source.parent !== undefined ? { parent: source.parent } : {}),
    ...(source.page !== undefined ? { page: source.page } : {}),
    children: Array.isArray(source.children) ? source.children : [],
  };
}

function normalizePage(value: unknown): PageIdentity | undefined {
  const source = record(value);
  if (!source) return undefined;
  const name = stringField(source, "originalName") ?? stringField(source, "name");
  const uuid = stringField(source, "uuid");
  if (!name) return undefined;
  const versionValue = source.updatedAt ?? source["updated-at"];
  const version = typeof versionValue === "string" && /^\d+$/.test(versionValue) ? Number(versionValue) : versionValue;
  return { id: uuid ?? name, ...(uuid ? { uuid } : {}), name, ...(Number.isSafeInteger(version) && Number(version) >= 0 ? { version: Number(version) } : {}), evidenceHash: proposalPageEvidenceHash(source) };
}

function excerpt(block: RawBlock, relation: ServiceGraphBlockExcerpt["relation"], depth: number, page: PageIdentity | undefined, parentUuid?: string): ServiceGraphBlockExcerpt {
  return {
    uuid: block.uuid,
    content: block.content,
    contentHash: checksum(stripLogseqBlockIdentityProperty(block.content, block.uuid)),
    relation,
    depth,
    ...(parentUuid ? { parentUuid } : {}),
    ...(page?.uuid ? { pageUuid: page.uuid } : {}),
    ...(page?.name ? { pageName: page.name } : {}),
  };
}

async function pageSnapshot(request: Extract<ServiceGraphReadRequest, { kind: "PAGE" }>, host: GraphReadBridgeHost, at: Date): Promise<ServiceGraphSnapshot | undefined> {
  const page = normalizePage(await host.getPage(request.target));
  if (!page) return undefined;
  const tree = await host.getPageBlocksTree(page.uuid ?? page.name);
  if (!Array.isArray(tree)) throw new Error("GRAPH_READ_PAGE_TREE_INVALID");
  const blocks: ServiceGraphBlockExcerpt[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  let truncated = false;
  let capacityReached = false;
  const visit = async (value: unknown, depth: number, parentUuid?: string): Promise<void> => {
    if (capacityReached) return;
    const block = await normalizeBlock(value, host);
    if (!block || seen.has(block.uuid)) return;
    if (blocks.length >= maximumBlocks) { truncated = true; capacityReached = true; return; }
    bytes += utf8Bytes(block.content);
    if (bytes > maximumExcerptBytes) { truncated = true; capacityReached = true; return; }
    seen.add(block.uuid);
    blocks.push(excerpt(block, depth === 0 ? "ROOT" : "CHILD", depth, page, parentUuid));
    if (depth >= request.depth) {
      if (block.children.length > 0) truncated = true;
      return;
    }
    for (const child of block.children) await visit(child, depth + 1, block.uuid);
  };
  for (const root of tree) await visit(root, 0);
  const resolved = { kind: "PAGE" as const, id: page.id, name: page.name, ...(page.version !== undefined ? { version: page.version } : {}), evidenceHash: page.evidenceHash };
  const scopeHash = checksum({ kind: "PAGE", resolved, blocks, truncated });
  return { kind: "PAGE", requestedTarget: request.target, resolved, blocks, truncated, readAt: at.toISOString(), scopeHash };
}

async function blockSnapshot(request: Extract<ServiceGraphReadRequest, { kind: "BLOCK" }>, host: GraphReadBridgeHost, at: Date): Promise<ServiceGraphSnapshot | undefined> {
  const root = await normalizeBlock(await host.getBlock(request.target, { includeChildren: request.includeChildren }), host);
  if (!root) return undefined;
  const page = root.page === undefined ? undefined : normalizePage(await host.getPage(root.page));
  const parents: ServiceGraphBlockExcerpt[] = [];
  const seen = new Set<string>([root.uuid]);
  let parentReference = root.parent;
  for (let distance = 1; distance <= request.parents && parentReference !== undefined; distance += 1) {
    const parent = await normalizeBlock(await host.getBlock(parentReference, { includeChildren: false }), host);
    if (!parent || seen.has(parent.uuid)) break;
    seen.add(parent.uuid);
    parents.unshift(excerpt(parent, "PARENT", distance, page));
    parentReference = parent.parent;
  }
  const descendants: ServiceGraphBlockExcerpt[] = [];
  let bytes = utf8Bytes(root.content) + parents.reduce((sum, item) => sum + utf8Bytes(item.content), 0);
  let truncated = false;
  const visitChildren = async (block: RawBlock, depth: number): Promise<void> => {
    for (const childValue of block.children) {
      if (truncated) return;
      const child = await normalizeBlock(childValue, host);
      if (!child || seen.has(child.uuid)) continue;
      if (parents.length + descendants.length + 1 >= maximumBlocks) { truncated = true; return; }
      bytes += utf8Bytes(child.content);
      if (bytes > maximumExcerptBytes) { truncated = true; return; }
      seen.add(child.uuid);
      descendants.push(excerpt(child, "CHILD", depth, page, block.uuid));
      await visitChildren(child, depth + 1);
    }
  };
  if (request.includeChildren) await visitChildren(root, 1);
  const blocks = [...parents, excerpt(root, "ROOT", 0, page), ...descendants];
  const resolved = { kind: "BLOCK" as const, id: root.uuid };
  const scopeHash = checksum({ kind: "BLOCK", resolved, blocks, truncated });
  return { kind: "BLOCK", requestedTarget: request.target, resolved, blocks, truncated, readAt: at.toISOString(), scopeHash };
}

export async function executeGraphReadRequest(request: ServiceGraphReadRequest, host: GraphReadBridgeHost, at = new Date()): Promise<ServiceGraphReadResult> {
  try {
    let snapshot: ServiceGraphSnapshot | undefined;
    if (request.kind === "PAGE") snapshot = await pageSnapshot(request, host, at);
    else if (request.kind === "BLOCK") snapshot = await blockSnapshot(request, host, at);
    else {
      const blockTarget = /^\(\(([^()]+)\)\)$/.exec(request.target.trim())?.[1] ?? request.target;
      const blockRequest: Extract<ServiceGraphReadRequest, { kind: "BLOCK" }> = { ...request, kind: "BLOCK", target: blockTarget, includeChildren: false, parents: 0 };
      snapshot = await blockSnapshot(blockRequest, host, at);
      if (!snapshot) {
        const pageRequest: Extract<ServiceGraphReadRequest, { kind: "PAGE" }> = { ...request, kind: "PAGE", target: request.target, depth: 0 };
        snapshot = await pageSnapshot(pageRequest, host, at);
      }
    }
    return snapshot ? { requestId: request.requestId, status: "FOUND", snapshot } : { requestId: request.requestId, status: "NOT_FOUND" };
  } catch (error) {
    const errorCode = error instanceof Error && /^GRAPH_READ_[A-Z_]+$/.test(error.message) ? error.message : "GRAPH_READ_ADAPTER_FAILED";
    return { requestId: request.requestId, status: "ERROR", errorCode, message: "Logseq Desktop 无法完成受控 Graph 读取；没有返回缓存内容或执行写入。" };
  }
}
