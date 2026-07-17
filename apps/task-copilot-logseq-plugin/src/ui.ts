import type {
  AuditProjection,
  NowWorkView,
  ObjectDetailView,
  ProposalImpactView,
  ProjectReentryView,
} from "@task-copilot/application";
import type { AttentionSignal, Capture, DomainEvent, ManagedObject, Proposal, SemanticCommit, SemanticOperation } from "@task-copilot/domain";

export type Workspace = "inbox" | "now" | "objects" | "review" | "reentry" | "audit";

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
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function button(label: string, action: string, value?: string, className = ""): string {
  return `<button class="${className}" data-action="${action}"${value ? ` data-value="${escapeHtml(value)}"` : ""}>${escapeHtml(label)}</button>`;
}

function empty(title: string, detail: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function renderInbox(model: UiModel): string {
  if (model.inbox.length === 0) return empty("Inbox 已清空", "选择一个 Logseq Block 后使用“捕获当前块”。");
  return `<div class="cards">${model.inbox
    .map(
      (capture) => `<article class="card">
        <div class="eyebrow">${escapeHtml(capture.phase)} · ${escapeHtml(new Date(capture.capturedAt).toLocaleString("zh-CN"))}</div>
        <p class="natural-text">${escapeHtml(capture.originalText)}</p>
        ${capture.sourcePage ? `<p class="muted">来源：${escapeHtml(capture.sourcePage)}</p>` : ""}
        <div class="actions">
          ${button("打开来源", "open-capture", capture.captureId, "quiet")}
          ${button("手工正式化", "formalize", capture.captureId)}
          ${button("创建手工 Proposal", "manual-proposal", capture.captureId, "quiet")}
          ${model.agent.enabled ? button("生成 Demo Proposal", "generate-proposal", capture.captureId) : ""}
          ${button("关联现有对象", "associate-capture", capture.captureId, "quiet")}
          ${button("暂缓", "defer-capture", capture.captureId, "quiet")}
          ${button("无需行动", "dismiss-capture", capture.captureId, "quiet")}
        </div>
        ${capture.deferredUntil ? `<p class="muted">暂缓至：${escapeHtml(capture.deferredUntil)}</p>` : ""}
      </article>`,
    )
    .join("")}</div>`;
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
      ${button("推进 Phase", "advance-phase", object.objectId)}
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

export function renderApp(model: UiModel): string {
  const labels: Array<[Workspace, string]> = [
    ["inbox", "Inbox"],
    ["now", "现在工作"],
    ["objects", "对象"],
    ["review", "Proposal Review"],
    ["reentry", "Project 重入"],
    ["audit", "审计与恢复"],
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
      <div class="top-actions">${button("捕获当前块", "capture", undefined, "primary")}${button("关闭", "close", undefined, "quiet")}</div>
    </header>
    <div class="agent-state ${model.agent.enabled ? "enabled" : "disabled"}">Agent ${model.agent.enabled ? `Demo · ${escapeHtml(model.agent.providerId)}` : "disabled · 基础事务系统可用"}</div>
    ${model.message ? `<div class="notice">${escapeHtml(model.message)}</div>` : ""}
    ${model.error ? `<div class="error"><strong>未执行：</strong>${escapeHtml(model.error)}<span>请修正后重试；系统不会静默覆盖。</span></div>` : ""}
    <nav>${labels.map(([id, label]) => `<button class="${model.workspace === id ? "active" : ""}" data-action="view" data-value="${id}">${label}</button>`).join("")}</nav>
    <main class="workspace" data-workspace="${model.workspace}">${body}</main>
  </section>`;
}
