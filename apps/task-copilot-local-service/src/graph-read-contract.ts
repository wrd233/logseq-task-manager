import type { ServiceGraphBlockExcerpt, ServiceGraphReadQuery, ServiceGraphReadResult, ServiceGraphSnapshot } from "@task-copilot/service-client";
import { stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";
import { StructuredError, checksum } from "@task-copilot/shared";

function graphError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-132", "D-133", "D-135"] });
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31);
  });
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export function parseGraphReadQuery(value: unknown): ServiceGraphReadQuery {
  const source = object(value);
  if (!source || !boundedText(source.target, 512)) throw graphError("GRAPH_READ_REQUEST_INVALID", "Graph 读取请求必须包含受控目标。");
  const keys = Object.keys(source).sort().join(",");
  if (source.kind === "PAGE" && keys === "depth,kind,target" && Number.isSafeInteger(source.depth) && Number(source.depth) >= 0 && Number(source.depth) <= 5) {
    return { kind: "PAGE", target: source.target, depth: Number(source.depth) };
  }
  if (source.kind === "BLOCK" && keys === "includeChildren,kind,parents,target" && typeof source.includeChildren === "boolean" && Number.isSafeInteger(source.parents) && Number(source.parents) >= 0 && Number(source.parents) <= 8 && safeId(source.target)) {
    return { kind: "BLOCK", target: source.target, includeChildren: source.includeChildren, parents: Number(source.parents) };
  }
  if (source.kind === "RESOLVE" && keys === "kind,target") return { kind: "RESOLVE", target: source.target };
  throw graphError("GRAPH_READ_REQUEST_INVALID", "Graph 读取仅支持有界 page、block 或 resolve 查询。");
}

function parseBlock(value: unknown): ServiceGraphBlockExcerpt {
  const source = object(value);
  if (!source) throw graphError("GRAPH_READ_RESULT_INVALID", "Graph Block 结果不是对象。");
  const allowed = new Set(["uuid", "content", "contentHash", "relation", "depth", "parentUuid", "pageUuid", "pageName"]);
  if (Object.keys(source).some((key) => !allowed.has(key)) || !safeId(source.uuid) || typeof source.content !== "string" || Buffer.byteLength(source.content) > 64 * 1024
    || typeof source.contentHash !== "string" || source.contentHash !== checksum(stripLogseqBlockIdentityProperty(source.content, source.uuid as string))
    || !["PARENT", "ROOT", "CHILD"].includes(String(source.relation)) || !Number.isSafeInteger(source.depth) || Number(source.depth) < 0 || Number(source.depth) > 256
    || (source.parentUuid !== undefined && !safeId(source.parentUuid)) || (source.pageUuid !== undefined && !safeId(source.pageUuid)) || (source.pageName !== undefined && !boundedText(source.pageName, 512))) {
    throw graphError("GRAPH_READ_RESULT_INVALID", "Graph Block 结果字段无效、超界或哈希不匹配。");
  }
  return source as unknown as ServiceGraphBlockExcerpt;
}

function parseSnapshot(value: unknown): ServiceGraphSnapshot {
  const source = object(value);
  if (!source || Object.keys(source).sort().join(",") !== "blocks,kind,readAt,requestedTarget,resolved,scopeHash,truncated"
    || !["PAGE", "BLOCK"].includes(String(source.kind)) || !boundedText(source.requestedTarget, 512)
    || !Array.isArray(source.blocks) || source.blocks.length > 256 || typeof source.truncated !== "boolean"
    || typeof source.readAt !== "string" || !Number.isFinite(Date.parse(source.readAt)) || typeof source.scopeHash !== "string" || !/^[0-9a-f]{8}$/.test(source.scopeHash)) {
    throw graphError("GRAPH_READ_RESULT_INVALID", "Graph Snapshot 结果字段无效或超界。");
  }
  const resolved = object(source.resolved);
  if (!resolved || !["PAGE", "BLOCK"].includes(String(resolved.kind)) || !boundedText(resolved.id, 512)
    || (resolved.name !== undefined && !boundedText(resolved.name, 512))
    || (resolved.version !== undefined && (!Number.isSafeInteger(resolved.version) || Number(resolved.version) < 0))
    || (resolved.kind === "PAGE" ? typeof resolved.evidenceHash !== "string" || !/^[0-9a-f]{8}$/.test(resolved.evidenceHash) : resolved.evidenceHash !== undefined)
    || Object.keys(resolved).some((key) => !["kind", "id", "name", "version", "evidenceHash"].includes(key))) {
    throw graphError("GRAPH_READ_RESULT_INVALID", "Graph Snapshot 解析目标无效。");
  }
  const blocks = source.blocks.map(parseBlock);
  const bytes = blocks.reduce((sum, block) => sum + Buffer.byteLength(block.content), 0);
  if (bytes > 1024 * 1024 || new Set(blocks.map(({ uuid }) => uuid)).size !== blocks.length) throw graphError("GRAPH_READ_RESULT_INVALID", "Graph Snapshot 重复或超过 1 MiB 限制。");
  const expectedScopeHash = checksum({ kind: source.kind, resolved, blocks, truncated: source.truncated });
  if (source.scopeHash !== expectedScopeHash) throw graphError("GRAPH_READ_RESULT_INVALID", "Graph Snapshot scope hash 不匹配。");
  return { kind: source.kind as "PAGE" | "BLOCK", requestedTarget: source.requestedTarget, resolved: resolved as unknown as ServiceGraphSnapshot["resolved"], blocks, truncated: source.truncated, readAt: source.readAt, scopeHash: source.scopeHash };
}

export function parseGraphReadResult(value: unknown): ServiceGraphReadResult {
  const source = object(value);
  if (!source || !safeId(source.requestId) || !["FOUND", "NOT_FOUND", "ERROR"].includes(String(source.status))) throw graphError("GRAPH_READ_RESULT_INVALID", "Graph 只读桥接结果无效。");
  const keys = Object.keys(source).sort().join(",");
  if (source.status === "FOUND" && keys === "requestId,snapshot,status") return { requestId: source.requestId, status: "FOUND", snapshot: parseSnapshot(source.snapshot) };
  if (source.status === "NOT_FOUND" && keys === "requestId,status") return { requestId: source.requestId, status: "NOT_FOUND" };
  if (source.status === "ERROR" && keys === "errorCode,message,requestId,status" && typeof source.errorCode === "string" && /^GRAPH_READ_[A-Z_]+$/.test(source.errorCode) && boundedText(source.message, 512)) {
    return { requestId: source.requestId, status: "ERROR", errorCode: source.errorCode, message: source.message };
  }
  throw graphError("GRAPH_READ_RESULT_INVALID", "Graph 只读桥接结果形态无效。");
}
