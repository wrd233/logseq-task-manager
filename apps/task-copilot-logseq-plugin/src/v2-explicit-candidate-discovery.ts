import { normalizeExplicitObjectBlock } from "@task-copilot/logseq-adapter";
import type { ServiceMaterializeExplicitObjectRequest, ServiceSynchronizeExplicitObjectResult } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import type { ServiceRuntimeClient } from "./service-connection.ts";

export interface V2ExplicitCandidate {
  externalId: string;
  inputVersion: string;
  contentHash: string;
  objectType: ServiceMaterializeExplicitObjectRequest["objectType"];
  marker?: ServiceMaterializeExplicitObjectRequest["marker"];
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

type CandidateClient = Pick<ServiceRuntimeClient, "listPrimaryAnchors" | "synchronizeExplicitObject">;

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
      contentHash: checksum(normalized.content),
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
    contentHash: checksum(normalized.content),
    objectType: normalized.parsed.objectType,
    ...(normalized.parsed.marker ? { marker: normalized.parsed.marker } : {}),
    text: normalized.parsed.title,
  } : undefined;
}

export async function submitV2ExplicitCandidate(
  client: CandidateClient,
  preview: V2ExplicitCandidatePreview,
  externalId: string,
  readBlock: (externalId: string) => Promise<unknown>,
  traceId: string,
): Promise<ServiceSynchronizeExplicitObjectResult> {
  const candidate = preview.candidates.find((value) => value.externalId === externalId);
  if (!candidate) throw new Error("请选择当前预览中的显式对象候选；没有执行写入。");
  const current = candidateFromBlock(await readBlock(candidate.externalId));
  if (
    !current
    || current.externalId !== candidate.externalId
    || current.inputVersion !== candidate.inputVersion
    || current.contentHash !== candidate.contentHash
    || current.objectType !== candidate.objectType
    || current.marker !== candidate.marker
    || current.text !== candidate.text
  ) {
    throw new Error("候选 Block 已在预览后变化或不再是合法显式对象；请重新扫描，旧预览没有提交。");
  }
  return client.synchronizeExplicitObject({
    objectType: current.objectType,
    text: current.text,
    ...(current.marker ? { marker: current.marker } : {}),
    externalId: current.externalId,
    inputVersion: current.inputVersion,
    contentHash: current.contentHash,
    idempotencyKey: `explicit-discovery:${current.externalId}:${current.inputVersion}:${current.contentHash}`,
    traceId,
  });
}

function escapeHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderV2ExplicitCandidateDiscoveryPanel(state: V2ExplicitCandidatePanelState, available: boolean): string {
  if (!available) return "";
  if (state.status === "idle") return `<section class="diagnostic-notice"><h2>当前页显式对象恢复</h2><p>只以当前页为范围，不扫描全 Graph；Logseq 会提供整页树，本次最多处理前 256 个 Block，不会自动写入。</p><button type="button" data-action="v2-candidate-open">扫描当前页候选</button></section>`;
  if (state.status === "loading") return `<section class="diagnostic-notice" aria-busy="true"><h2>当前页显式对象恢复</h2><p>正在读取当前页 Block tree，并按处理预算核对已知 Anchor…</p></section>`;
  if (state.status === "error") return `<section class="diagnostic-error"><h2>候选同步未执行</h2><p>${escapeHtml(state.message)}</p><button type="button" data-action="v2-candidate-open">重新扫描</button><button type="button" data-action="v2-candidate-cancel">关闭</button></section>`;
  if (state.status === "success") return `<section class="diagnostic-notice"><h2>显式对象已同步</h2><p>${escapeHtml(state.message)}</p><button type="button" data-action="v2-candidate-open">继续扫描</button><button type="button" data-action="v2-candidate-cancel">关闭</button></section>`;
  const { preview } = state;
  return `<section class="diagnostic-notice" aria-label="当前页显式对象候选"><h2>预览当前页候选</h2>
    <p>只扫描当前页：已处理当前页快照前 ${preview.scannedBlocks} 个 Block，发现 ${preview.candidates.length} 个新候选。每次只同步一项，不扫描全 Graph。</p>
    ${preview.truncated ? '<p class="muted">当前页快照超过本次处理预算；超出部分未进入候选分析。</p>' : ""}
    ${preview.invalidExplicitBlocks ? `<p class="muted">${preview.invalidExplicitBlocks} 个显式标识存在冲突或缺少标题，未列为可写候选。</p>` : ""}
    <label>选择一个候选<select data-field="v2CandidateExternalId"><option value="">请选择</option>${preview.candidates.map((candidate) => `<option value="${escapeHtml(candidate.externalId)}">${escapeHtml(candidate.objectType)} · ${escapeHtml(candidate.text)} · ${escapeHtml(candidate.externalId)}</option>`).join("")}</select></label>
    <div class="actions"><button type="button" class="primary" data-action="v2-candidate-submit"${state.busy ? ' disabled aria-busy="true"' : ""}>${state.busy ? "同步中…" : "同步选中候选"}</button>${state.busy ? '<span class="muted">正式请求已提交，请等待明确结果。</span>' : '<button type="button" data-action="v2-candidate-cancel">取消</button>'}</div>
  </section>`;
}
