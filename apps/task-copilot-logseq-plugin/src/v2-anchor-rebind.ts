import { normalizeExplicitObjectBlock } from "@task-copilot/logseq-adapter";
import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";
import type { ServicePrimaryAnchorRebindResult } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import type { ServiceRuntimeClient } from "./service-connection.ts";

export interface V2RebindCandidate {
  anchor: V2Anchor & { status: Exclude<V2Anchor["status"], "replaced"> };
  object: V2ManagedObject;
}

export interface V2RebindPreview {
  target: {
    externalId: string;
    inputVersion: string;
    contentHash: string;
    objectType: Extract<V2ManagedObject["objectType"], "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT">;
    text: string;
  };
  candidates: V2RebindCandidate[];
  moreAnchorsDeferred: boolean;
}

export type V2RebindPanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: V2RebindPreview; serviceGeneration: number; busy?: boolean }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type RebindClient = Pick<ServiceRuntimeClient, "listObjects" | "listPrimaryAnchors" | "rebindPrimaryAnchor">;

function targetFromBlock(value: unknown): V2RebindPreview["target"] {
  const block = normalizeExplicitObjectBlock(value);
  if (!block) throw new Error("当前未选中可读取的 Logseq Block；没有执行重新绑定。");
  if (block.parsed.kind !== "OBJECT") {
    throw new Error(block.parsed.kind === "INVALID"
      ? "当前 Block 的显式对象标识存在冲突或缺少标题；没有执行重新绑定。"
      : "当前 Block 不是 [任务]、[MiniProject]、[决策] 或 [成果]；没有执行重新绑定。");
  }
  return {
    externalId: block.externalId,
    inputVersion: block.inputVersion,
    contentHash: checksum(block.content),
    objectType: block.parsed.objectType,
    text: block.parsed.title,
  };
}

export async function prepareV2PrimaryAnchorRebind(
  client: RebindClient,
  readCurrentBlock: () => Promise<unknown>,
): Promise<V2RebindPreview> {
  const target = targetFromBlock(await readCurrentBlock());
  const [page, objects] = await Promise.all([client.listPrimaryAnchors(), client.listObjects()]);
  const objectsById = new Map(objects.map((object) => [object.objectId, object]));
  const candidates = page.anchors.flatMap((anchor) => {
    const object = objectsById.get(anchor.objectId);
    if (!object || object.objectType !== target.objectType || anchor.externalId === target.externalId || anchor.status === "replaced") return [];
    return [{ anchor: anchor as V2RebindCandidate["anchor"], object }];
  });
  if (candidates.length === 0) {
    throw new Error("当前页没有与所选 Block 同类型、可重新绑定的 Primary Anchor；没有执行写入。");
  }
  return { target, candidates, moreAnchorsDeferred: Boolean(page.nextCursor) };
}

export async function submitV2PrimaryAnchorRebind(
  client: RebindClient,
  preview: V2RebindPreview,
  previousAnchorId: string,
  confirmed: boolean,
  readCurrentBlock: () => Promise<unknown>,
  traceId: string,
): Promise<ServicePrimaryAnchorRebindResult> {
  if (!confirmed) throw new Error("请单独确认 Primary Anchor 重新绑定；没有执行写入。");
  const candidate = preview.candidates.find((value) => value.anchor.anchorId === previousAnchorId);
  if (!candidate) throw new Error("请选择当前预览中的旧 Primary Anchor；没有执行写入。");
  const current = targetFromBlock(await readCurrentBlock());
  if (
    current.externalId !== preview.target.externalId ||
    current.inputVersion !== preview.target.inputVersion ||
    current.contentHash !== preview.target.contentHash ||
    current.objectType !== preview.target.objectType ||
    current.text !== preview.target.text
  ) {
    throw new Error("当前 Block 已在预览后变化；请重新打开预览，旧预览没有提交。");
  }
  return client.rebindPrimaryAnchor({
    previousAnchorId: candidate.anchor.anchorId,
    previewObjectVersion: candidate.object.version,
    previewAnchorStatus: candidate.anchor.status,
    previewAnchorContentHash: candidate.anchor.contentHash,
    objectType: current.objectType,
    text: current.text,
    externalId: current.externalId,
    inputVersion: current.inputVersion,
    contentHash: current.contentHash,
    confirmation: "REBIND_PRIMARY_ANCHOR",
    traceId,
  });
}

function escapeHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderV2PrimaryAnchorRebindPanel(state: V2RebindPanelState, available: boolean): string {
  if (!available) return "";
  if (state.status === "idle") return `<section class="diagnostic-notice"><h2>Primary Anchor 修复</h2><p>只读取当前选中 Block 与 Service 返回的一页已知 Anchor；不会扫描全 Graph。</p><button type="button" data-action="v2-rebind-open">预览重新绑定当前块</button></section>`;
  if (state.status === "loading") return `<section class="diagnostic-notice" aria-busy="true"><h2>Primary Anchor 修复</h2><p>正在读取当前 Block 与已知 Anchor…</p></section>`;
  if (state.status === "error") return `<section class="diagnostic-error"><h2>重新绑定未执行</h2><p>${escapeHtml(state.message)}</p><button type="button" data-action="v2-rebind-open">重新预览</button><button type="button" data-action="v2-rebind-cancel">关闭</button></section>`;
  if (state.status === "success") return `<section class="diagnostic-notice"><h2>Primary Anchor 已重新绑定</h2><p>${escapeHtml(state.message)}</p><button type="button" data-action="v2-rebind-open">处理另一个</button><button type="button" data-action="v2-rebind-cancel">关闭</button></section>`;
  const { preview } = state;
  return `<section class="diagnostic-notice" aria-label="重新绑定 Primary Anchor"><h2>预览 Primary Anchor 重新绑定</h2>
    <p><strong>新主正文：</strong>${escapeHtml(preview.target.objectType)} · ${escapeHtml(preview.target.text)}</p>
    <p><code>${escapeHtml(preview.target.externalId)}</code> · hash ${escapeHtml(preview.target.contentHash)}</p>
    <label>选择要修复的对象与旧 Anchor<select data-field="v2RebindPreviousAnchorId"><option value="">请选择</option>${preview.candidates.map(({ anchor, object }) => `<option value="${escapeHtml(anchor.anchorId)}">${escapeHtml(object.text)} · ${escapeHtml(anchor.status)} · ${escapeHtml(anchor.externalId)}</option>`).join("")}</select></label>
    ${preview.moreAnchorsDeferred ? "<p class=\"muted\">候选超过当前有界页；未扫描后续页或全 Graph。</p>" : ""}
    <p>提交后 object_id 与 Primary Ownership 不变；旧 Anchor 保留为 replaced，新 Block 成为唯一 active Primary Anchor。</p>
    <label class="confirm-line"><input type="checkbox" data-field="v2RebindConfirmed">我单独确认这项高影响重新绑定</label>
    <div class="actions"><button type="button" class="danger" data-action="v2-rebind-submit"${state.busy ? " disabled aria-busy=\"true\"" : ""}>${state.busy ? "提交中…" : "确认重新绑定"}</button>${state.busy ? "<span class=\"muted\">正式请求已提交，请等待明确结果。</span>" : '<button type="button" data-action="v2-rebind-cancel">取消</button>'}</div>
  </section>`;
}
