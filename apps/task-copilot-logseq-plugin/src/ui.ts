import type {
  AuditProjection,
  NowWorkView,
  ObjectDetailView,
  ProposalImpactView,
  ProjectReentryView,
} from "@task-copilot/application";
import { allowedPhaseTransitions, type AttentionSignal, type Capture, type DomainEvent, type ManagedObject, type Proposal, type SemanticCommit, type SemanticOperation } from "@task-copilot/domain";
import type { ObservableActionState } from "./inbox-action-controller.ts";

export type Workspace = "inbox" | "now" | "objects" | "review" | "reentry" | "audit";
export type ActionDialogKind =
  | "edit-object"
  | "set-owner"
  | "condition-waiting"
  | "condition-blocked"
  | "condition-paused"
  | "review-edit"
  | "review-defer"
  | "reject-proposal"
  | "confirm-review-accept"
  | "confirm-phase"
  | "reopen-phase"
  | "confirm-rebind"
  | "confirm-undo";

export interface UiModel {
  workspace: Workspace;
  agent: { enabled: boolean; providerId: string };
  inbox: Capture[];
  now: NowWorkView;
  objects: ManagedObject[];
  proposals: Proposal[];
  commits: SemanticCommit[];
  events: DomainEvent[];
  signalsByObject: Record<string, AttentionSignal[]>;
  proposalImpacts: Record<string, ProposalImpactView>;
  auditProjection: AuditProjection;
  reentryProjects: ManagedObject[];
  selectedReentryProjectId?: string;
  selectedObjectDetail?: ObjectDetailView;
  reentry?: ProjectReentryView;
  message?: string;
  error?: string;
  recoveryReport?: string;
  runtime?: {
    pluginVersion: string;
    runtimeStatus: string;
    storeStatus: string;
    currentGraph: string;
  };
  inboxActionStates?: Record<string, ObservableActionState>;
  inboxDialog?: { captureId: string; kind: "formalize" | "proposal" | "link" | "defer" | "dismiss" };
  actionDialog?: { kind: ActionDialogKind; value: string };
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function button(label: string, action: string, value?: string, className = "", disabled = false): string {
  return `<button type="button" class="${className}" data-action="${action}"${value ? ` data-value="${escapeHtml(value)}"` : ""}${disabled ? " disabled aria-busy=\"true\"" : ""}>${escapeHtml(label)}</button>`;
}

function empty(title: string, detail: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function renderInbox(model: UiModel): string {
  if (model.inbox.length === 0) return empty("Inbox 已清空", "选择一个 Logseq Block 后使用“捕获当前块”。");
  return `<div class="cards">${model.inbox
    .map(
      (capture) => {
        const states = Object.entries(model.inboxActionStates ?? {}).filter(([key]) => key.endsWith(`:${capture.captureId}`)).map(([, state]) => state);
        const loading = states.some((state) => state.status === "loading");
        const feedback = states.slice().reverse().find((state) => state.status !== "idle");
        const dialog = model.inboxDialog?.captureId === capture.captureId ? renderInboxDialog(model, capture) : "";
        return `<article class="card">
        <div class="eyebrow">${escapeHtml(capture.phase)} · ${escapeHtml(new Date(capture.capturedAt).toLocaleString("zh-CN"))}</div>
        <p class="natural-text">${escapeHtml(capture.originalText)}</p>
        <p class="muted">来源：${escapeHtml(capture.sourcePage && !/^\d+$/.test(capture.sourcePage) ? capture.sourcePage : "未知来源")}</p>
        ${capture.sourceConflict ? `<p class="action-error">${escapeHtml(capture.sourceConflict.message)}</p>` : ""}
        <div class="actions">
          ${button(loading ? "处理中…" : "打开来源", "open-source", capture.captureId, "quiet", loading)}
          ${button("手工正式化", "manual-formalize", capture.captureId, "", loading)}
          ${button("创建手工 Proposal", "create-manual-proposal", capture.captureId, "quiet", loading)}
          ${model.agent.enabled ? button("生成 Demo Proposal", "generate-proposal", capture.captureId, "", loading) : ""}
          ${button("关联现有对象", "link-existing-object", capture.captureId, "quiet", loading)}
          ${button("暂缓", "defer", capture.captureId, "quiet", loading)}
          ${button("无需行动", "no-action", capture.captureId, "quiet", loading)}
        </div>
        ${capture.deferredUntil ? `<p class="muted">暂缓至：${escapeHtml(capture.deferredUntil)}${capture.deferReason ? ` · ${escapeHtml(capture.deferReason)}` : ""}</p>` : ""}
        ${feedback ? `<div class="action-feedback ${feedback.status}"><strong>${escapeHtml(feedback.status === "loading" ? "处理中" : feedback.status === "success" ? "已完成" : "操作失败")}</strong><span>${escapeHtml(feedback.message ?? "")}</span>${feedback.correlationId ? `<code>诊断 ID：${escapeHtml(feedback.correlationId)}</code>` : ""}${feedback.status === "error" ? "<small>Capture 保持安全，原始 Logseq 内容未修改。请复制 Diagnostics 后重试。</small>" : ""}</div>` : ""}
        ${dialog}
      </article>`;
      },
    )
    .join("")}</div>`;
}

function renderInboxDialog(model: UiModel, capture: Capture): string {
  const dialog = model.inboxDialog!;
  const cancel = button("取消", "cancel-inbox-dialog", capture.captureId, "quiet");
  if (dialog.kind === "formalize") return `<section class="inbox-dialog" aria-label="手工正式化"><h3>手工正式化</h3><label>对象类型<select data-field="objectType"><option>TASK</option><option>MINI_PROJECT</option><option>PROJECT</option><option>AREA</option></select></label><label>正式正文<textarea data-field="text">${escapeHtml(capture.originalText)}</textarea></label><label>完成标准<textarea data-field="completionCriteria"></textarea></label><label>下一步<textarea data-field="nextAction"></textarea></label><label>可选主归属<select data-field="ownerId"><option value="">待确认归属</option>${model.objects.map((object) => `<option value="${escapeHtml(object.objectId)}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)}</option>`).join("")}</select></label><label class="confirm-line"><input type="checkbox" data-field="ownerConfirmed" value="yes">若选择主归属，我单独确认这项高影响变化</label><div class="actions">${button("创建并解决 Capture", "submit-formalize", capture.captureId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "proposal") return `<section class="inbox-dialog" aria-label="创建手工 Proposal"><h3>创建手工 Proposal</h3><label>建议正文<textarea data-field="suggestedText">${escapeHtml(capture.originalText)}</textarea></label><div class="actions">${button("创建并进入 Review", "submit-manual-proposal", capture.captureId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "link") return `<section class="inbox-dialog" aria-label="关联现有对象"><h3>关联现有对象</h3><label>按标题、类型或 ID 选择<input data-field="objectSearch" list="objects-${escapeHtml(capture.captureId)}"></label><datalist id="objects-${escapeHtml(capture.captureId)}">${model.objects.map((object) => `<option value="${escapeHtml(object.objectId)}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)}</option>`).join("")}</datalist><div class="actions">${button("建立来源关系", "submit-link-existing", capture.captureId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "defer") return `<section class="inbox-dialog" aria-label="暂缓 Capture"><h3>暂缓</h3><label>复查时间<input type="datetime-local" data-field="deferredUntil"></label><label>原因<input data-field="deferReason" value="等待更多上下文"></label><div class="actions">${button("确认暂缓", "submit-defer", capture.captureId, "primary")}${cancel}</div></section>`;
  return `<section class="inbox-dialog" aria-label="无需行动确认"><h3>确认无需行动？</h3><p>Capture 与审计会保留，原始 Logseq Block 不会删除。</p><label>原因<input data-field="dismissReason" value="无需行动"></label><div class="actions">${button("确认并保留历史", "submit-no-action", capture.captureId, "danger")}${cancel}</div></section>`;
}

function renderNow(model: UiModel): string {
  if (model.now.items.length === 0) return empty("当前没有需要推进的事项", "这里只显示 Actionable 与高价值注意项。");
  return `<div class="cards">${model.now.items
    .map(
      (item) => `<article class="card compact">
        <div class="badges"><span>${escapeHtml(item.phase)}</span><span>${escapeHtml(item.condition.kind)}</span>${item.signals
          .map((signal) => `<span class="signal">${escapeHtml(signal)}</span>`)
          .join("")}</div>
        <h3>${escapeHtml(item.text)}</h3>
        ${item.nextAction ? `<p><strong>下一步：</strong>${escapeHtml(item.nextAction)}</p>` : ""}
        ${button("打开对象", "select-object", item.objectId, "quiet")}
      </article>`,
    )
    .join("")}</div>`;
}

function renderObjects(model: UiModel): string {
  if (model.objects.length === 0) return empty("还没有正式对象", "从 Inbox 手工正式化，或审查并提交 Proposal。");
  const list = `<div class="object-list">${model.objects
    .map(
      (object) => `<button class="object-row" data-action="select-object" data-value="${escapeHtml(object.objectId)}">
        <span>${escapeHtml(object.text)}</span><small>${escapeHtml(object.objectType)} · ${escapeHtml(object.phase)} · ${escapeHtml(object.condition.kind)}</small>
      </button>`,
    )
    .join("")}</div>`;
  const detailView = model.selectedObjectDetail;
  if (!detailView) return list;
  const { object, owner, anchors, signals, recentEvents, undoableCommitId } = detailView;
  const detail = `<aside class="drawer" aria-label="对象抽屉">
    <div class="eyebrow">${escapeHtml(object.objectType)} · v${object.version}</div>
    <h2>${escapeHtml(object.text)}</h2>
    <code>${escapeHtml(object.objectId)}</code>
    <div class="badges"><span>${escapeHtml(object.phase)}</span><span>${escapeHtml(object.condition.kind)}</span></div>
    ${signals.length ? `<div class="badges">${signals.map((signal) => `<span class="signal">${escapeHtml(signal)}</span>`).join("")}</div>` : ""}
    <section><h3>主归属</h3><p>${owner ? escapeHtml(owner.text) : "待确认归属"}</p></section>
    ${object.completionCriteria ? `<section><h3>完成标准</h3><p>${escapeHtml(object.completionCriteria)}</p></section>` : ""}
    ${object.nextAction ? `<section><h3>下一步</h3><p>${escapeHtml(object.nextAction)}</p></section>` : ""}
    ${object.currentSummary ? `<section><h3>当前状态</h3><p>${escapeHtml(object.currentSummary)}</p></section>` : ""}
    ${object.dueAt || object.reviewAt ? `<section><h3>日期</h3><p>${object.dueAt ? `due ${escapeHtml(object.dueAt)}` : ""}${object.dueAt && object.reviewAt ? " · " : ""}${object.reviewAt ? `review ${escapeHtml(object.reviewAt)}` : ""}</p></section>` : ""}
    ${object.condition.kind === "WAITING" ? `<section><h3>等待</h3><p>${escapeHtml(object.condition.waitingFor)} · ${escapeHtml(object.condition.expectedResult)} · ${escapeHtml(object.condition.reviewAt)}</p></section>` : ""}
    ${object.condition.kind === "BLOCKED" ? `<section><h3>阻塞</h3><p>${escapeHtml(object.condition.reason)}</p></section>` : ""}
    ${anchors.length ? `<section><h3>正文与来源</h3>${anchors.map((anchor) => `<p><code>${escapeHtml(anchor.role)}</code> · ${escapeHtml(anchor.status)} · ${escapeHtml(anchor.cachedPageRef ?? anchor.externalId)}</p>`).join("")}</section>` : ""}
    ${recentEvents.length ? `<section><h3>最近事件</h3><ol>${recentEvents.map((event) => `<li>${escapeHtml(event.timestamp)} · ${escapeHtml(event.operationType)}</li>`).join("")}</ol></section>` : ""}
    <div class="actions wrap">
      ${button("编辑对象", "edit-object", object.objectId)}
      ${button("打开正文", "open-object", object.objectId, "quiet")}
      ${button("设置主归属", "set-owner", object.objectId)}
      ${button("设为 Actionable", "condition-actionable", object.objectId)}
      ${button("设置 Waiting", "condition-waiting", object.objectId)}
      ${button("设置 Blocked", "condition-blocked", object.objectId)}
      ${button("设置 Paused", "condition-paused", object.objectId)}
      ${allowedPhaseTransitions(object)
        .map((phase) => button(`进入 ${phase}`, "advance-phase", `${object.objectId}|${phase}|${object.objectType}|${object.phase}`))
        .join("")}
      ${button("重新绑定当前块", "rebind-anchor", object.objectId, "danger")}
      ${button("查看审计", "view-audit", object.objectId, "quiet")}
      ${undoableCommitId ? button("撤销最近 Commit", "undo-commit", undoableCommitId, "danger") : ""}
    </div>
  </aside>`;
  return `<div class="split">${list}${detail}</div>`;
}

function suggestedText(operation: SemanticOperation): string | undefined {
  if (operation.operationType === "rewrite_content" && typeof operation.payload.text === "string") return operation.payload.text;
  if (operation.operationType === "update_object" && typeof operation.payload.text === "string") return operation.payload.text;
  if (operation.operationType === "create_object" && operation.payload.input && typeof operation.payload.input === "object") {
    const text = (operation.payload.input as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  return undefined;
}

function impactLabel(operation: SemanticOperation): string {
  const target = `${operation.target.kind}:${operation.target.id}`;
  return `${operation.operationType} 将影响 ${target}；风险 ${operation.riskLevel}；置信度 ${Math.round(operation.confidence * 100)}%`;
}

function renderFinalImpact(impact: ProposalImpactView | undefined): string {
  if (!impact) return "最终影响预览暂不可用。";
  return [
    `最终影响预览：可执行 ${impact.executable}；阻塞 ${impact.blocked}；待决定 ${impact.pending}；拒绝 ${impact.rejected}`,
    `正式变化：${impact.effects.join("、") || "无"}`,
    `对象：${impact.affectedObjects.join("、") || "无"}`,
    `视图：${impact.affectedViews.join("、") || "无"}`,
    `正文/文件：${impact.affectedFiles.join("、") || "无"}`,
    `下游依赖：${impact.downstream.join("；") || "无"}`,
    `预校验：${impact.validationErrors.length ? impact.validationErrors.join("；") : "通过"}`,
  ].join("\n");
}

function renderReview(model: UiModel): string {
  const open = model.proposals.filter((proposal) => proposal.status === "OPEN");
  if (open.length === 0) return empty("没有待审查 Proposal", model.agent.enabled ? "从 Inbox 生成确定性 Demo Proposal。" : "Agent 已关闭；基础事务能力仍可使用。");
  return `<div class="cards">${open
    .map(
      (proposal) => `<article class="card proposal">
        <div class="eyebrow">${escapeHtml(proposal.providerId)} · ${escapeHtml(proposal.generatedAt)}</div>
        <h3>${escapeHtml(proposal.summary)}</h3>
        <p><strong>原文：</strong>${escapeHtml(proposal.facts[0] ?? "")}</p>
        ${proposal.operations.map(suggestedText).filter((value): value is string => Boolean(value)).map((value) => `<section class="suggestion"><h4>建议正文</h4><p>${escapeHtml(value)}</p><div class="readable-diff"><del>${escapeHtml(proposal.facts[0] ?? "")}</del><ins>${escapeHtml(value)}</ins></div></section>`).join("")}
        ${proposal.uncertainties.length ? `<p class="uncertain"><strong>不确定：</strong>${escapeHtml(proposal.uncertainties.join("；"))}</p>` : ""}
        <div class="operations">${proposal.operations
          .map(
            (operation) => `<div class="operation risk-${operation.riskLevel.toLowerCase()}">
              <div><code>${escapeHtml(operation.operationType)}</code><span>${escapeHtml(operation.status)}</span></div>
              <p>${escapeHtml(operation.rationale)}</p>
              <p class="muted">${escapeHtml(impactLabel(operation))}</p>
              <small>${escapeHtml(operation.ruleRefs.join(" · "))}${operation.dependencies.length ? ` · 依赖 ${escapeHtml(operation.dependencies.join(", "))}` : ""}</small>
              ${operation.deferredUntil ? `<small>暂缓至 ${escapeHtml(operation.deferredUntil)} · ${escapeHtml(operation.deferReason ?? "")}</small>` : ""}
              ${operation.status === "COMMITTED" ? "<p class=\"muted\">已在此前 SemanticCommit 中提交。</p>" : `<div class="actions">
                ${button("接受", "review-accept", `${proposal.proposalId}|${operation.operationId}|${operation.riskLevel}`)}
                ${button("拒绝", "review-reject", `${proposal.proposalId}|${operation.operationId}`, "quiet")}
                ${button("编辑后接受", "review-edit", `${proposal.proposalId}|${operation.operationId}|${operation.riskLevel}`, "quiet")}
                ${button("暂缓", "review-defer", `${proposal.proposalId}|${operation.operationId}`, "quiet")}
              </div>`}
            </div>`,
          )
          .join("")}</div>
        <div class="report">${escapeHtml(renderFinalImpact(model.proposalImpacts[proposal.proposalId]))}</div>
        <div class="actions">${model.proposalImpacts[proposal.proposalId]?.commitReady ? button("提交已确认操作", "commit-proposal", proposal.proposalId, "primary") : ""}${button("全部拒绝", "reject-proposal", proposal.proposalId, "danger")}</div>
      </article>`,
    )
    .join("")}</div>`;
}

function renderReentry(model: UiModel): string {
  if (!model.reentry) return empty("暂无 Project 可重入", "创建 Project 后，这里会生成行动导向的恢复包。");
  const reentry = model.reentry;
  const selector = `<div class="object-list">${model.reentryProjects.map((project) => `<button class="object-row ${project.objectId === model.selectedReentryProjectId ? "active" : ""}" data-action="select-reentry-project" data-value="${escapeHtml(project.objectId)}"><span>${escapeHtml(project.text)}</span><small>${escapeHtml(project.phase)}</small></button>`).join("")}</div>`;
  return `<div class="split">${selector}<article class="reentry">
    <div class="eyebrow">${escapeHtml(reentry.phase)} · ${escapeHtml(reentry.condition.kind)}</div>
    <h2>${escapeHtml(reentry.purpose)}</h2>
    <p class="lead">${escapeHtml(reentry.currentState)}</p>
    ${reentry.boundary ? `<section><h3>边界</h3><p>${escapeHtml([reentry.boundary.in, reentry.boundary.out].filter(Boolean).join(" / "))}</p></section>` : ""}
    ${reentry.recentChanges.length ? `<section><h3>最近关键变化</h3><ol>${reentry.recentChanges.map((change) => `<li>${escapeHtml(change.summary)}</li>`).join("")}</ol></section>` : ""}
    ${reentry.waitingOrBlocked ? `<section><h3>阻塞或等待</h3><p>${escapeHtml(reentry.waitingOrBlocked)}</p></section>` : ""}
    ${reentry.unresolvedQuestions?.length ? `<section><h3>未决问题</h3><ul>${reentry.unresolvedQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul></section>` : ""}
    <section class="restore"><h3>建议恢复动作</h3><p>${escapeHtml(reentry.restoreAction)}</p></section>
    ${reentry.entryPoints.length ? `<section><h3>关键入口</h3><div class="actions">${reentry.entryPoints.map((entry) => button(entry.role, "open-anchor", entry.anchorId, "quiet")).join("")}</div></section>` : ""}
  </article></div>`;
}

function renderAudit(model: UiModel): string {
  const commits = model.commits.length
    ? `<section><h2>SemanticCommit</h2><div class="cards">${model.commits
        .slice()
        .reverse()
        .map((commit) => `<article class="card compact">
          <div class="eyebrow">${escapeHtml(commit.status)} · ${escapeHtml(commit.updatedAt)}</div><code>${escapeHtml(commit.semanticCommitId)}</code>
          ${commit.error ? `<p class="error">${escapeHtml(commit.error.code)} · ${escapeHtml(commit.error.message)}</p>` : ""}
          ${commit.textMutations.map((mutation) => `<details><summary>正文 before / after · ${escapeHtml(mutation.externalId)}</summary><del>${escapeHtml(mutation.beforeText)}</del><ins>${escapeHtml(mutation.afterText)}</ins></details>`).join("")}
          ${commit.domainChanges.map((change) => `<details><summary>${escapeHtml(change.entityType)} · ${escapeHtml(change.entityId)}</summary><pre>${escapeHtml(JSON.stringify({ before: change.before ?? null, after: change.after ?? null }, null, 2))}</pre></details>`).join("")}
          ${model.auditProjection.undoableCommitIds.includes(commit.semanticCommitId) ? button("撤销", "undo-commit", commit.semanticCommitId, "danger") : ""}
        </article>`)
        .join("")}</div></section>`
    : "";
  const events = model.events.length
    ? `<section><h2>最近事件</h2><ol class="timeline">${model.events.slice(0, 20).map((event) => `<li><time>${escapeHtml(event.timestamp)}</time><span>${escapeHtml(event.operationType)}</span></li>`).join("")}</ol></section>`
    : "";
  const anchorConflicts = model.auditProjection.anchorConflicts;
  const anchors = anchorConflicts.length
    ? `<section><h2>Anchor Conflict</h2><div class="cards">${anchorConflicts.map((anchor) => `<article class="card compact">
      <div class="eyebrow">${escapeHtml(anchor.status)} · ${escapeHtml(anchor.observedAt)}</div><code>${escapeHtml(anchor.anchorId)}</code>
      <p>来源：${escapeHtml(anchor.source)} · Graph ${escapeHtml(anchor.graphId)}</p>
      <details open><summary>预期版本 / 当前版本</summary><del>${escapeHtml(anchor.expectedText)}</del><ins>${escapeHtml(anchor.currentText ?? "Block 缺失，无法读取当前正文")}</ins></details>
      <p class="muted">处理选项：${escapeHtml(anchor.options.join("；"))}</p>
    </article>`).join("")}</div></section>`
    : "";
  return `<div class="audit-actions">${button("创建备份并导出", "export-backup", undefined, "primary")}${button("验证最近恢复包", "verify-backup")}${button("扫描 Pending Commit", "recover-pending")}${button("扫描 Anchor", "scan-anchors")}</div>
    ${model.recoveryReport ? `<div class="report">${escapeHtml(model.recoveryReport)}</div>` : ""}
    ${commits || events || anchors ? `${commits}${events}${anchors}` : empty("还没有审计事件", "捕获和正式变更会记录在这里。")}`;
}

function renderActionDialog(model: UiModel): string {
  const dialog = model.actionDialog;
  if (!dialog) return "";
  const cancel = button("取消", "cancel-action-dialog", undefined, "quiet");
  const object = model.objects.find((candidate) => candidate.objectId === dialog.value);
  if (dialog.kind === "edit-object" && object) return `<section class="inbox-dialog action-dialog" aria-label="编辑对象"><h3>编辑对象</h3>
    <label>对象正文<textarea data-field="objectText">${escapeHtml(object.text)}</textarea></label>
    <label>完成标准<textarea data-field="objectCompletionCriteria">${escapeHtml(object.completionCriteria ?? "")}</textarea></label>
    <label>下一步/当前推进<textarea data-field="objectNextAction">${escapeHtml(object.nextAction ?? "")}</textarea></label>
    <label>当前状态摘要<textarea data-field="objectCurrentSummary">${escapeHtml(object.currentSummary ?? "")}</textarea></label>
    <label>目的/持续责任<textarea data-field="objectPurpose">${escapeHtml(object.purpose ?? "")}</textarea></label>
    <label>目标结果<textarea data-field="objectTargetOutcome">${escapeHtml(object.targetOutcome ?? "")}</textarea></label>
    <label>范围内边界<textarea data-field="objectScopeIn">${escapeHtml(object.scopeIn ?? "")}</textarea></label>
    <label>due 时间（ISO，允许留空）<input data-field="objectDueAt" value="${escapeHtml(object.dueAt ?? "")}"></label>
    <label>review 时间（ISO，允许留空）<input data-field="objectReviewAt" value="${escapeHtml(object.reviewAt ?? "")}"></label>
    <div class="actions">${button("创建编辑 Proposal", "submit-edit-object", object.objectId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "set-owner" && object) return `<section class="inbox-dialog action-dialog" aria-label="设置主归属"><h3>设置主归属</h3>
    <label>主归属对象<select data-field="ownerObjectId"><option value="">请选择</option>${model.objects.filter((candidate) => candidate.objectId !== object.objectId).map((candidate) => `<option value="${escapeHtml(candidate.objectId)}">${escapeHtml(candidate.objectType)} · ${escapeHtml(candidate.text)}</option>`).join("")}</select></label>
    <label class="confirm-line"><input type="checkbox" data-field="highImpactConfirmed">我单独确认这项高影响归属变化；它不会移动正文</label>
    <div class="actions">${button("创建归属 Proposal", "submit-set-owner", object.objectId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "condition-waiting" && object) return `<section class="inbox-dialog action-dialog" aria-label="设置 Waiting"><h3>设置 Waiting</h3>
    <label>在等谁或什么<input data-field="waitingFor"></label><label>期待结果<input data-field="expectedResult"></label><label>复查时间（ISO）<input data-field="conditionReviewAt" placeholder="2026-07-20T09:00:00+08:00"></label>
    <div class="actions">${button("创建 Waiting Proposal", "submit-condition", `${object.objectId}|WAITING`, "primary")}${cancel}</div></section>`;
  if ((dialog.kind === "condition-blocked" || dialog.kind === "condition-paused") && object) {
    const kind = dialog.kind === "condition-blocked" ? "BLOCKED" : "PAUSED";
    return `<section class="inbox-dialog action-dialog" aria-label="设置 ${kind}"><h3>设置 ${kind}</h3><label>原因<textarea data-field="conditionReason"></textarea></label><div class="actions">${button(`创建 ${kind} Proposal`, "submit-condition", `${object.objectId}|${kind}`, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "review-edit") {
    const [proposalId, operationId] = dialog.value.split("|");
    const operation = model.proposals.find((proposal) => proposal.proposalId === proposalId)?.operations.find((candidate) => candidate.operationId === operationId);
    if (proposalId && operationId && operation) return `<section class="inbox-dialog action-dialog" aria-label="编辑 Proposal 操作"><h3>编辑最终 operation payload</h3><label>JSON object<textarea data-field="operationPayload">${escapeHtml(JSON.stringify(operation.payload, null, 2))}</textarea></label><label class="confirm-line"><input type="checkbox" data-field="finalPayloadConfirmed">我确认这是要提交的最终版本；若风险升高，此确认仅适用于该版本</label><div class="actions">${button("保存编辑后版本", "submit-review-edit", `${proposalId}|${operationId}`, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "review-defer") return `<section class="inbox-dialog action-dialog" aria-label="暂缓 Proposal 操作"><h3>暂缓操作</h3><label>复查时间（ISO）<input data-field="operationDeferredUntil"></label><label>原因<input data-field="operationDeferReason"></label><div class="actions">${button("确认暂缓", "submit-review-defer", dialog.value, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "reject-proposal") return `<section class="inbox-dialog action-dialog" aria-label="全部拒绝 Proposal"><h3>全部拒绝 Proposal</h3><p>已提交的正式变化不会被改写；尚未提交的操作会拒绝。</p><label>原因<input data-field="proposalRejectReason" value="当前建议不适用"></label><div class="actions">${button("确认全部拒绝", "submit-reject-proposal", dialog.value, "danger")}${cancel}</div></section>`;
  if (dialog.kind === "reopen-phase") return `<section class="inbox-dialog action-dialog" aria-label="重新打开对象"><h3>重新打开对象</h3><label>重新打开原因<input data-field="phaseReason"></label><div class="actions">${button("创建 Phase Proposal", "submit-phase", dialog.value, "primary")}${cancel}</div></section>`;
  const confirmations: Partial<Record<ActionDialogKind, [string, string, string]>> = {
    "confirm-review-accept": ["接受高影响操作", "我单独确认接受这个高影响操作；提交前仍会进行确定性校验", "submit-review-accept"],
    "confirm-phase": ["确认完成 Project", "我已检查目标达成、下层对象、等待项、成果和归档入口", "submit-phase"],
    "confirm-rebind": ["重新绑定主正文 Anchor", "我确认将当前选中 Block 设为新的主正文 Anchor；旧 Anchor 保留为 replaced", "submit-rebind-anchor"],
    "confirm-undo": ["撤销 SemanticCommit", "我确认撤销；系统会先校验正文没有被二次编辑，并创建逆向 Commit", "submit-undo-commit"],
  };
  const confirmation = confirmations[dialog.kind];
  if (confirmation) return `<section class="inbox-dialog action-dialog" aria-label="${escapeHtml(confirmation[0])}"><h3>${escapeHtml(confirmation[0])}</h3><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">${escapeHtml(confirmation[1])}</label><div class="actions">${button("确认继续", confirmation[2], dialog.value, "danger")}${cancel}</div></section>`;
  return "";
}

export function renderApp(model: UiModel): string {
  const labels: Array<[Workspace, string]> = [
    ["inbox", "Inbox"],
    ["now", "Now Work / 现在工作"],
    ["objects", "Projects / 对象"],
    ["review", "Proposal Review"],
    ["reentry", "Project 重入"],
    ["audit", "Audit / Recovery / 审计与恢复"],
  ];
  const body =
    model.workspace === "inbox"
      ? renderInbox(model)
      : model.workspace === "now"
        ? renderNow(model)
        : model.workspace === "objects"
          ? renderObjects(model)
          : model.workspace === "review"
            ? renderReview(model)
            : model.workspace === "reentry"
              ? renderReentry(model)
              : renderAudit(model);
  return `<section class="app-shell">
    <header class="topbar">
      <div><div class="eyebrow">个人事务运行系统</div><h1>Task Copilot</h1></div>
      <div class="top-actions">${button("捕获当前块", "capture", undefined, "primary")}${button("Diagnostics", "runtime-diagnostics", undefined, "quiet")}${button("关闭", "close", undefined, "quiet")}</div>
    </header>
    ${model.runtime ? `<div class="runtime-strip"><span>Plugin ${escapeHtml(model.runtime.pluginVersion)}</span><span>Runtime ${escapeHtml(model.runtime.runtimeStatus)}</span><span>Store ${escapeHtml(model.runtime.storeStatus)}</span><span>Graph ${escapeHtml(model.runtime.currentGraph)}</span></div>` : ""}
    <div class="agent-state ${model.agent.enabled ? "enabled" : "disabled"}">Agent ${model.agent.enabled ? `Demo · ${escapeHtml(model.agent.providerId)}` : "disabled · 基础事务系统可用"}</div>
    ${model.message ? `<div class="notice">${escapeHtml(model.message)}</div>` : ""}
    ${model.error ? `<div class="error"><strong>未执行：</strong>${escapeHtml(model.error)}<span>请修正后重试；系统不会静默覆盖。</span></div>` : ""}
    <nav>${labels.map(([id, label]) => `<button class="${model.workspace === id ? "active" : ""}" data-action="view" data-value="${id}">${label}</button>`).join("")}</nav>
    <main class="workspace" data-workspace="${model.workspace}">${renderActionDialog(model)}${body}</main>
  </section>`;
}
