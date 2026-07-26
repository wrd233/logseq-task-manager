import { normalizeExplicitObjectBlock, stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";
import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";
import type { ServicePrimaryAnchorRebindResult } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import type { ServiceRuntimeClient } from "./service-connection.ts";
import type { PluginAnchorIssueNarration } from "./status-narration-runtime.ts";

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
  | { status: "capturing" }
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
    contentHash: checksum(stripLogseqBlockIdentityProperty(block.content, block.externalId)),
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
  if (page.anchors.some((anchor) => anchor.externalId === target.externalId && anchor.status !== "replaced")) {
    throw new Error("当前 Block 已经连接到另一个正式事项；没有进入确认，也没有执行写入。请取消本次选择，再从“开始重新连接”进入受控窗口后新建或选择替换正文。");
  }
  const objectsById = new Map(objects.map((object) => [object.objectId, object]));
  const candidates = page.anchors.flatMap((anchor) => {
    const object = objectsById.get(anchor.objectId);
    if (!object || object.objectType !== target.objectType || anchor.externalId === target.externalId || anchor.status === "replaced") return [];
    return [{ anchor: anchor as V2RebindCandidate["anchor"], object }];
  });
  if (candidates.length === 0) {
    throw new Error("当前页没有与所选 Block 同类型、可重新连接的正式事项；没有执行写入。");
  }
  return { target, candidates, moreAnchorsDeferred: Boolean(page.nextCursor) };
}

export async function submitV2PrimaryAnchorRebind(
  client: RebindClient,
  preview: V2RebindPreview,
  selectedCandidateToken: string,
  confirmed: boolean,
  readCurrentBlock: () => Promise<unknown>,
  ensurePersistentIdentity: (externalId: string) => Promise<void>,
  traceId: string,
): Promise<ServicePrimaryAnchorRebindResult> {
  if (!confirmed) throw new Error("请单独确认把这个正式事项重新连接到当前正文；没有执行写入。");
  const candidateIndex = selectedCandidateToken.match(/^candidate:([0-9]{1,2})$/)?.[1];
  const candidate = candidateIndex === undefined ? undefined : preview.candidates[Number(candidateIndex)];
  if (!candidate) throw new Error("请选择当前预览中的正式事项；没有执行写入。");
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
  await ensurePersistentIdentity(current.externalId);
  const persistent = targetFromBlock(await readCurrentBlock());
  if (
    persistent.externalId !== preview.target.externalId ||
    persistent.contentHash !== preview.target.contentHash ||
    persistent.objectType !== preview.target.objectType ||
    persistent.text !== preview.target.text
  ) {
    throw new Error("当前 Block 的持久身份建立后正文发生变化；没有提交重新绑定。");
  }
  return client.rebindPrimaryAnchor({
    previousAnchorId: candidate.anchor.anchorId,
    previewObjectVersion: candidate.object.version,
    previewAnchorStatus: candidate.anchor.status,
    previewAnchorContentHash: candidate.anchor.contentHash,
    objectType: persistent.objectType,
    text: persistent.text,
    externalId: persistent.externalId,
    inputVersion: persistent.inputVersion,
    contentHash: persistent.contentHash,
    confirmation: "REBIND_PRIMARY_ANCHOR",
    traceId,
  });
}

function escapeHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderV2PrimaryAnchorRebindPanel(state: V2RebindPanelState, available: boolean): string {
  if (!available) return "";
  if (state.status === "idle") return `<section class="diagnostic-notice"><h2>重新连接正文</h2><p>只读取当前选中 Block 与一页已知正文连接；不会扫描全 Graph。</p><button type="button" data-action="v2-rebind-open">预览重新连接当前块</button></section>`;
  if (state.status === "capturing") return `<section class="diagnostic-notice" aria-label="选择替换正文"><h2>选择替换正文</h2>
    <p>本次受控窗口会暂缓自动创建新的正式事项，最多持续 5 分钟。请回到 Logseq，新建或选中一个带有明确类型标识的替换 Block，再回来预览影响。</p>
    <p class="muted">窗口结束、取消或提交后会恢复自动同步；其他正式状态不会在这里改变。</p>
    <div class="actions"><button type="button" data-action="v2-rebind-open">预览当前选中的正文</button><button type="button" data-action="v2-rebind-cancel">取消并恢复自动同步</button></div>
  </section>`;
  if (state.status === "loading") return `<section class="diagnostic-notice" aria-busy="true"><h2>重新连接正文</h2><p>正在读取当前 Block 与已知正文连接…</p></section>`;
  if (state.status === "error") return `<section class="diagnostic-error"><h2>重新连接未执行</h2><p>${escapeHtml(state.message)}</p><button type="button" data-action="v2-rebind-open">重新预览</button><button type="button" data-action="v2-rebind-cancel">关闭</button></section>`;
  if (state.status === "success") return `<section class="diagnostic-notice"><h2>正文已重新连接</h2>
    <p>${escapeHtml(state.message)}</p>
    <p class="muted">如果选错了正文，不要删除正式事项或旧连接历史：先选中正确 Block，再次进入受控重新连接。只有需要回退整个正式状态时，才使用备份与恢复。</p>
    <div class="actions"><button type="button" data-action="v2-rebind-capture">重新选择正文</button><button type="button" data-action="backup-restore-open">查看完整恢复选项</button><button type="button" data-action="v2-rebind-cancel">关闭</button></div>
  </section>`;
  const { preview } = state;
  const statusLabel = (status: V2RebindCandidate["anchor"]["status"]): string => status === "missing"
    ? "原连接位置不可用"
    : status === "conflict"
      ? "原连接存在冲突"
      : "原连接仍可读取";
  return `<section class="diagnostic-notice" aria-label="重新连接正式事项正文"><h2>预览重新连接正文</h2>
    <p><strong>当前选中的新正文：</strong>${escapeHtml(preview.target.objectType)} · ${escapeHtml(preview.target.text)}</p>
    <label>选择要重新连接的正式事项<select data-field="v2RebindCandidateToken"><option value="">请选择</option>${preview.candidates.map(({ anchor, object }, index) => `<option value="candidate:${index}">${escapeHtml(object.text)} · ${escapeHtml(object.objectType)} · ${escapeHtml(statusLabel(anchor.status))}</option>`).join("")}</select></label>
    ${preview.moreAnchorsDeferred ? "<p class=\"muted\">候选超过当前有界页；未扫描后续页或全 Graph。</p>" : ""}
    <p>确认后，正式事项与主归属不变；旧连接保留在历史中，当前选中的 Block 成为唯一主正文。</p>
    <label class="confirm-line"><input type="checkbox" data-field="v2RebindConfirmed">我确认把这个正式事项重新连接到当前选中的正文</label>
    <div class="actions"><button type="button" class="danger" data-action="v2-rebind-submit"${state.busy ? " disabled aria-busy=\"true\"" : ""}>${state.busy ? "提交中…" : "确认重新绑定"}</button>${state.busy ? "<span class=\"muted\">正式请求已提交，请等待明确结果。</span>" : '<button type="button" data-action="v2-rebind-cancel">取消</button>'}</div>
  </section>`;
}

export function renderV2AnchorIssueStatus(
  issues: readonly PluginAnchorIssueNarration[] | "unavailable" | undefined,
  available: boolean,
): string {
  if (issues === undefined || issues === "unavailable" || issues.length === 0) return "";
  const visible = issues.slice(0, 5);
  const actionable = issues.some((issue) => issue.nextActionEligible);
  return `<section class="anchor-issue-status" aria-label="正文连接待处理">
    <div class="eyebrow">正文连接</div>
    <h2>有 ${issues.length} 个正式事项需要重新确认正文</h2>
    <p class="muted">正式事项仍保留；这里不会自动移动、覆盖或删除任何 Logseq 正文。</p>
    <div class="anchor-issue-list">${visible.map((issue) => `<article class="anchor-issue-card" data-narration-rule="${escapeHtml(issue.narrationRuleId)}">
      <h3>${escapeHtml(issue.objectText ?? "尚未读取到名称的正式事项")}</h3>
      <p>${escapeHtml(issue.conclusion)}</p>
      ${issue.keyEvidence.length ? `<p class="muted">${issue.keyEvidence.slice(0, 2).map((value) => escapeHtml(value)).join(" · ")}</p>` : ""}
      ${issue.unknowns.length ? `<p class="muted">${escapeHtml(issue.unknowns[0])}</p>` : ""}
    </article>`).join("")}</div>
    ${issues.length > visible.length ? `<p class="muted">另有 ${issues.length - visible.length} 项；修复后刷新可继续处理。</p>` : ""}
    ${available && actionable
      ? `<p>先进入受控选择窗口，再在 Logseq 中新建或选中替换正文；预览前不会自动创建另一个正式事项。</p><button type="button" data-action="v2-rebind-capture">开始重新连接</button>`
      : `<p class="muted">当前正式写入已暂停；恢复 Local Service 后再处理正文连接。</p>`}
  </section>`;
}
