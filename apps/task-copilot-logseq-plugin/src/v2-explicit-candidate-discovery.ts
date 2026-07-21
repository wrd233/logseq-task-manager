import { normalizeExplicitObjectBlock, stripLogseqBlockIdentityProperty, type LogseqTodoMarker } from "@task-copilot/logseq-adapter";
import type { ServiceCandidateDiscoveryRequest } from "@task-copilot/service-client";
import type { V2Candidate } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import type { ServiceRuntimeClient } from "./service-connection.ts";

export interface V2ExplicitCandidate {
  externalId: string;
  inputVersion: string;
  contentHash: string;
  objectType: "AREA" | "PROJECT" | "MINI_PROJECT" | "TASK" | "DECISION" | "OUTPUT";
  marker?: LogseqTodoMarker;
  text: string;
}

export interface V2ExplicitCandidatePreview {
  candidates: V2ExplicitCandidate[];
  scannedBlocks: number;
  invalidExplicitBlocks: number;
  truncated: boolean;
}

export type V2ExplicitCandidatePanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: V2ExplicitCandidatePreview; serviceGeneration: number; busy?: boolean }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type CandidateClient = Pick<ServiceRuntimeClient, "listPrimaryAnchors" | "discoverCandidate">;
type CandidateUpdateClient = Pick<ServiceRuntimeClient, "listObjects" | "listPrimaryAnchors" | "discoverCandidate" | "updateCandidate">;

interface DiscoveryLimits {
  maxBlocks: number;
  maxAnchorPages: number;
}

const DEFAULT_LIMITS: DiscoveryLimits = { maxBlocks: 256, maxAnchorPages: 4 };

function childrenOf(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const children = (value as { children?: unknown }).children;
  return Array.isArray(children) ? children : [];
}

function uuidTupleOf(value: unknown): string | undefined {
  return Array.isArray(value) && value.length === 2 && value[0] === "uuid" && typeof value[1] === "string"
    ? value[1]
    : undefined;
}

function requireLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_024) throw new Error(`${label} 必须是 1..1024 的有界整数。`);
}

export async function prepareV2ExplicitCandidateDiscovery(
  client: CandidateClient,
  readCurrentPageBlocksTree: () => Promise<unknown>,
  readBlockByUuid: (externalId: string) => Promise<unknown>,
  limits: DiscoveryLimits = DEFAULT_LIMITS,
): Promise<V2ExplicitCandidatePreview> {
  requireLimit(limits.maxBlocks, "maxBlocks");
  requireLimit(limits.maxAnchorPages, "maxAnchorPages");
  const roots = await readCurrentPageBlocksTree();
  if (!Array.isArray(roots)) throw new Error("当前页 Block tree 不可读；没有扫描 Graph 或执行写入。");

  const knownExternalIds = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < limits.maxAnchorPages; pageIndex += 1) {
    const page = await client.listPrimaryAnchors(cursor, true);
    for (const anchor of page.anchors) knownExternalIds.add(anchor.externalId);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  if (cursor) throw new Error("已知 Anchor 超过本次有界查询上限；无法可靠区分新候选，没有生成预览或执行写入。");

  const stack = [...roots].reverse();
  const candidates: V2ExplicitCandidate[] = [];
  let scannedBlocks = 0;
  let invalidExplicitBlocks = 0;
  while (stack.length > 0 && scannedBlocks < limits.maxBlocks) {
    let block = stack.pop();
    scannedBlocks += 1;
    const referencedUuid = uuidTupleOf(block);
    if (Array.isArray(block) && !referencedUuid) {
      throw new Error("当前页包含无法识别的 Block 引用形态；没有生成部分预览或执行写入。");
    }
    if (referencedUuid) {
      block = await readBlockByUuid(referencedUuid);
      if (!block) throw new Error(`当前页中的 Block 引用 ${referencedUuid} 已不可读；没有生成部分预览或执行写入。`);
      const resolvedUuid = !Array.isArray(block) && typeof block === "object" && typeof (block as { uuid?: unknown }).uuid === "string"
        ? (block as { uuid: string }).uuid
        : undefined;
      if (resolvedUuid !== referencedUuid) {
        throw new Error(`当前页中的 Block 引用 ${referencedUuid} 返回了不匹配的实体；没有生成部分预览或执行写入。`);
      }
    }
    const children = childrenOf(block);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    const normalized = normalizeExplicitObjectBlock(block);
    if (!normalized) continue;
    if (normalized.parsed.kind === "INVALID") {
      invalidExplicitBlocks += 1;
      continue;
    }
    if (normalized.parsed.kind !== "OBJECT" || knownExternalIds.has(normalized.externalId)) continue;
    candidates.push({
      externalId: normalized.externalId,
      inputVersion: normalized.inputVersion,
      contentHash: checksum(stripLogseqBlockIdentityProperty(normalized.content, normalized.externalId)),
      objectType: normalized.parsed.objectType,
      ...(normalized.parsed.marker ? { marker: normalized.parsed.marker } : {}),
      text: normalized.parsed.title,
    });
  }
  if (candidates.length === 0) throw new Error("当前页有界范围内没有新的合法显式对象候选；没有执行写入。");
  return { candidates, scannedBlocks, invalidExplicitBlocks, truncated: stack.length > 0 };
}

function candidateFromBlock(value: unknown): V2ExplicitCandidate | undefined {
  const normalized = normalizeExplicitObjectBlock(value);
  return normalized?.parsed.kind === "OBJECT" ? {
    externalId: normalized.externalId,
    inputVersion: normalized.inputVersion,
    contentHash: checksum(stripLogseqBlockIdentityProperty(normalized.content, normalized.externalId)),
    objectType: normalized.parsed.objectType,
    ...(normalized.parsed.marker ? { marker: normalized.parsed.marker } : {}),
    text: normalized.parsed.title,
  } : undefined;
}

function sourceEvidence(value: unknown, expectedExternalId: string): { inputVersion: string; contentHash: string } {
  const block = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!block || typeof block.content !== "string" || (typeof block.uuid === "string" && block.uuid !== expectedExternalId)) throw new Error("Candidate 来源 Block 已不可读或身份不匹配；没有生成更新 Proposal。");
  const version = block.updatedAt ?? block["updated-at"];
  const contentHash = checksum(stripLogseqBlockIdentityProperty(block.content, expectedExternalId));
  return { inputVersion: typeof version === "string" || typeof version === "number" ? String(version) : `content-${contentHash}`, contentHash };
}

export async function updateExistingObjectFromV2Candidate(
  client: CandidateUpdateClient,
  candidate: V2Candidate,
  targetObjectId: string,
  afterContent: string,
  readBlock: (externalId: string) => Promise<unknown>,
  traceId: string,
): Promise<Awaited<ReturnType<CandidateUpdateClient["updateCandidate"]>>> {
  const objects = await client.listObjects();
  const targetObject = objects.find(({ objectId }) => objectId === targetObjectId);
  if (!targetObject || !["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"].includes(targetObject.objectType)) throw new Error("请选择仍存在的 Block 型正式对象；没有生成 Proposal。");
  let cursor: string | undefined;
  let targetAnchor: Awaited<ReturnType<CandidateUpdateClient["listPrimaryAnchors"]>>["anchors"][number] | undefined;
  for (let page = 0; page < DEFAULT_LIMITS.maxAnchorPages && !targetAnchor; page += 1) {
    const result = await client.listPrimaryAnchors(cursor);
    targetAnchor = result.anchors.find((anchor) => anchor.objectId === targetObject.objectId && anchor.status === "active");
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  if (!targetAnchor) throw new Error("目标对象没有位于本次有界 Anchor 查询中的 active Primary Anchor；没有生成 Proposal。");
  if (targetAnchor.externalId === candidate.sourceAnchorId) throw new Error("Candidate 来源不能同时作为目标对象主正文；没有生成 Proposal。");
  const source = sourceEvidence(await readBlock(candidate.sourceAnchorId), candidate.sourceAnchorId);
  if (!candidate.sourceVersion.endsWith(`:${source.contentHash}`)) throw new Error("Candidate 来源已变化；请重新分析后再生成更新 Proposal。");
  let currentCandidate = candidate;
  const sourceVersion = `${source.inputVersion}:${source.contentHash}`;
  if (sourceVersion !== candidate.sourceVersion) {
    const refreshed = await client.discoverCandidate({
      sourceAnchorId: candidate.sourceAnchorId,
      sourceVersion,
      candidateKind: candidate.candidateKind,
      reason: candidate.reason,
      suggestion: candidate.suggestion,
      traceId: `${traceId}:identity-refresh`,
    });
    currentCandidate = refreshed.candidate;
    if (currentCandidate.sourceAnchorId !== candidate.sourceAnchorId || currentCandidate.sourceVersion !== sourceVersion || currentCandidate.candidateKind !== candidate.candidateKind) {
      throw new Error("Candidate 身份刷新结果与当前来源不一致；没有生成更新 Proposal。");
    }
  }
  const targetValue = await readBlock(targetAnchor.externalId);
  const target = candidateFromBlock(targetValue);
  if (!target || target.objectType !== targetObject.objectType || target.contentHash !== targetAnchor.contentHash) throw new Error("目标 Primary Anchor 已变化或类型不一致；没有生成 Proposal。");
  const after = candidateFromBlock({ uuid: target.externalId, content: afterContent, "updated-at": target.inputVersion });
  if (!after || after.objectType !== targetObject.objectType) throw new Error("最终正文必须保留目标对象的显式类型和非空标题；没有生成 Proposal。");
  return client.updateCandidate(currentCandidate.candidateId, {
    sourceAnchorId: candidate.sourceAnchorId, sourceInputVersion: source.inputVersion, sourceContentHash: source.contentHash,
    targetObjectId: targetObject.objectId, targetExternalId: target.externalId, targetInputVersion: target.inputVersion, targetContentHash: target.contentHash,
    targetContent: stripLogseqBlockIdentityProperty((targetValue as { content: string }).content, target.externalId), afterContent: stripLogseqBlockIdentityProperty(afterContent, target.externalId),
    expectedUpdatedAt: currentCandidate.updatedAt, traceId,
  });
}

function candidateKindForExplicitObject(objectType: V2ExplicitCandidate["objectType"]): ServiceCandidateDiscoveryRequest["candidateKind"] {
  return objectType === "DECISION" ? "DECISION" : objectType === "OUTPUT" ? "OUTPUT" : "WORK_ITEM";
}

export async function persistV2ExplicitCandidateDiscovery(
  client: CandidateClient,
  preview: V2ExplicitCandidatePreview,
  readBlock: (externalId: string) => Promise<unknown>,
  traceId: string,
): Promise<{ candidates: V2Candidate[]; replayed: number }> {
  if (!preview.candidates.length) throw new Error("当前预览没有可保存 Candidate；没有执行写入。");
  const currentCandidates: V2ExplicitCandidate[] = [];
  for (const candidate of preview.candidates) {
    const current = candidateFromBlock(await readBlock(candidate.externalId));
    if (!current || current.externalId !== candidate.externalId || current.inputVersion !== candidate.inputVersion
      || current.contentHash !== candidate.contentHash || current.objectType !== candidate.objectType
      || current.marker !== candidate.marker || current.text !== candidate.text) {
      throw new Error(`候选 Block ${candidate.externalId} 已在预览后变化或不再合法；请重新扫描，本批尚未提交。`);
    }
    currentCandidates.push(current);
  }
  const results = [];
  for (const current of currentCandidates) {
    const candidateKind = candidateKindForExplicitObject(current.objectType);
    results.push(await client.discoverCandidate({
      sourceAnchorId: current.externalId,
      sourceVersion: `${current.inputVersion}:${current.contentHash}`,
      candidateKind,
      reason: `${current.objectType} 显式标识尚未绑定正式对象。`,
      suggestion: current.objectType === "AREA" || current.objectType === "PROJECT" ? "在审阅中心选择对应正式创建流程。" : `生成 ${current.objectType} 正式化 Proposal。`,
      traceId: `${traceId}:${current.externalId}`,
    }));
  }
  return { candidates: results.map(({ candidate }) => candidate), replayed: results.filter(({ replayed }) => replayed).length };
}

export async function formalizeV2Candidate(
  client: Pick<ServiceRuntimeClient, "discoverCandidate" | "formalizeCandidate">,
  candidate: V2Candidate,
  readBlock: (externalId: string) => Promise<unknown>,
  traceId: string,
  ensurePersistentIdentity?: (externalId: string) => Promise<void>,
) {
  const beforeIdentity = candidateFromBlock(await readBlock(candidate.sourceAnchorId));
  if (!beforeIdentity || !candidate.sourceVersion.endsWith(`:${beforeIdentity.contentHash}`) || candidateKindForExplicitObject(beforeIdentity.objectType) !== candidate.candidateKind) throw new Error("Candidate 来源 Block 已变化；请重新扫描后再生成 Proposal。");
  await ensurePersistentIdentity?.(candidate.sourceAnchorId);
  const contentValue = await readBlock(candidate.sourceAnchorId);
  const current = candidateFromBlock(contentValue);
  if (!current || current.contentHash !== beforeIdentity.contentHash || current.objectType !== beforeIdentity.objectType || current.text !== beforeIdentity.text) throw new Error("Candidate 来源 Block 在建立持久身份时发生正文变化；请重新扫描后再生成 Proposal。");
  if (!(["MINI_PROJECT", "TASK", "DECISION", "OUTPUT"] as string[]).includes(current.objectType)) throw new Error(`${current.objectType} 必须使用专属创建流程；当前 Candidate 没有生成不兼容 Proposal。`);
  const contentRecord = contentValue && typeof contentValue === "object" && !Array.isArray(contentValue) ? contentValue as { content?: unknown } : undefined;
  if (typeof contentRecord?.content !== "string") throw new Error("Candidate 来源正文不可读；没有生成 Proposal。");
  let currentCandidate = candidate;
  const sourceVersion = `${current.inputVersion}:${current.contentHash}`;
  if (sourceVersion !== candidate.sourceVersion) {
    const refreshed = await client.discoverCandidate({
      sourceAnchorId: current.externalId,
      sourceVersion,
      candidateKind: candidateKindForExplicitObject(current.objectType),
      reason: candidate.reason,
      suggestion: candidate.suggestion,
      traceId: `${traceId}:identity-refresh`,
    });
    currentCandidate = refreshed.candidate;
  }
  return client.formalizeCandidate(currentCandidate.candidateId, {
    sourceAnchorId: current.externalId,
    inputVersion: current.inputVersion,
    contentHash: current.contentHash,
    content: stripLogseqBlockIdentityProperty(contentRecord.content, current.externalId),
    objectType: current.objectType as "MINI_PROJECT" | "TASK" | "DECISION" | "OUTPUT",
    text: current.text,
    expectedUpdatedAt: currentCandidate.updatedAt,
    traceId,
  });
}

function escapeHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderV2ExplicitCandidateDiscoveryPanel(state: V2ExplicitCandidatePanelState, available: boolean, persistedCandidates: readonly V2Candidate[] = [], sourcePreviews: Readonly<Record<string, string>> = {}): string {
  if (!available) return "";
  const actionable = persistedCandidates.filter(({ disposition, deferredUntil }) => disposition === "PENDING" || (disposition === "LATER" && deferredUntil !== undefined && Date.parse(deferredUntil) <= Date.now()));
  const visible = actionable.slice(0, 50);
  const queue = visible.length ? `<section aria-label="持久 Candidate 审阅队列"><div class="eyebrow">待整理 · SQLite</div><h2>Candidate 审阅队列</h2>${actionable.length > visible.length ? `<p class="muted">当前显示前 ${visible.length} 项；处理后刷新即可继续查看其余 ${actionable.length - visible.length} 项。</p>` : ""}${visible.map((candidate) => `<article class="card compact"><div class="eyebrow">${escapeHtml(candidate.candidateKind)} · ${escapeHtml(candidate.disposition)}</div><h3>原始内容</h3><blockquote>${escapeHtml(sourcePreviews[candidate.candidateId] ?? "原文暂不可读；请打开来源检查 Anchor。")}</blockquote><p><strong>进入这里的原因：</strong>${escapeHtml(candidate.reason)}</p><p><strong>建议：</strong>${escapeHtml(candidate.suggestion)}</p><p class="muted">来源 Block：${escapeHtml(candidate.sourceAnchorId)}${candidate.deferredUntil ? ` · 复查 ${escapeHtml(new Date(candidate.deferredUntil).toLocaleString("zh-CN"))}` : ""}</p><div class="actions"><button type="button" data-action="v2-open-primary-anchor" data-value="${escapeHtml(candidate.sourceAnchorId)}">打开来源</button>${candidate.activeProposalId ? '<button type="button" class="primary" data-action="review-mode" data-value="proposals">审阅已生成 Proposal</button>' : `<button type="button" class="primary" data-action="v2-candidate-formalize" data-value="${escapeHtml(candidate.candidateId)}">正式化</button><button type="button" data-action="v2-candidate-update" data-value="${escapeHtml(candidate.candidateId)}">更新已有对象</button><button type="button" data-action="v2-candidate-later" data-value="${escapeHtml(`${candidate.candidateId}|${candidate.updatedAt}`)}">7 天后再看</button><button type="button" data-action="v2-candidate-dismiss" data-value="${escapeHtml(`${candidate.candidateId}|${candidate.updatedAt}`)}">保持普通内容</button><button type="button" data-action="v2-candidate-no-more" data-value="${escapeHtml(`${candidate.candidateId}|${candidate.updatedAt}`)}">以后不再提示</button>`}</div></article>`).join("")}</section>` : `<section class="card compact"><div class="eyebrow">待整理 · SQLite</div><h2>Candidate 审阅队列</h2><p>当前没有待处理或到期 Candidate。</p></section>`;
  if (state.status === "idle") return `${queue}<section class="card candidate-review"><div class="eyebrow">待整理 · 当前页</div><h2>发现显式对象候选</h2><p>只以当前页为范围，不扫描全 Graph；本次最多处理前 256 个 Block。扫描只保存 Candidate，不创建正式对象。</p><button type="button" data-action="v2-candidate-open">扫描当前页候选</button></section>`;
  if (state.status === "loading") return `<section class="card candidate-review" aria-busy="true"><div class="eyebrow">待整理 · 当前页</div><h2>显式对象候选</h2><p>正在读取当前页 Block tree，并按处理预算核对已知 Anchor…</p></section>`;
  if (state.status === "error") return `<section class="diagnostic-error"><h2>候选同步未执行</h2><p>${escapeHtml(state.message)}</p><button type="button" data-action="v2-candidate-open">重新扫描</button><button type="button" data-action="v2-candidate-cancel">关闭</button></section>`;
  if (state.status === "success") return `${queue}<section class="diagnostic-notice"><h2>Candidate 已保存</h2><p>${escapeHtml(state.message)}</p><button type="button" data-action="v2-candidate-open">继续扫描</button><button type="button" data-action="v2-candidate-cancel">关闭</button></section>`;
  const { preview } = state;
  return `<section class="card candidate-review" aria-label="当前页显式对象候选"><div class="eyebrow">待整理 · 当前页</div><h2>预览当前页候选</h2>
    <p>只扫描当前页、不扫描全 Graph：已处理当前页快照前 ${preview.scannedBlocks} 个 Block，发现 ${preview.candidates.length} 个候选。确认后整批保存为 Candidate，不创建正式对象。</p>
    ${preview.truncated ? '<p class="muted">当前页快照超过本次处理预算；超出部分未进入候选分析。</p>' : ""}
    ${preview.invalidExplicitBlocks ? `<p class="muted">${preview.invalidExplicitBlocks} 个显式标识存在冲突或缺少标题，未列为可写候选。</p>` : ""}
    <ul>${preview.candidates.map((candidate) => `<li>${escapeHtml(candidate.objectType)} · ${escapeHtml(candidate.text)} · ${escapeHtml(candidate.externalId)}</li>`).join("")}</ul>
    <div class="actions"><button type="button" class="primary" data-action="v2-candidate-submit"${state.busy ? ' disabled aria-busy="true"' : ""}>${state.busy ? "保存中…" : "保存本批 Candidate"}</button>${state.busy ? '<span class="muted">幂等请求已提交；失败后可安全重试。</span>' : '<button type="button" data-action="v2-candidate-cancel">取消</button>'}</div>
  </section>`;
}
