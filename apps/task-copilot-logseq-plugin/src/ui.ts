import type {
  NowWorkView,
  ProjectReentryView,
} from "@task-copilot/application";
import type { Capture, DomainEvent, ManagedObject, Proposal, SemanticCommit } from "@task-copilot/domain";

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
  selectedObject?: ManagedObject;
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
          ${button("手工正式化为 Task", "formalize", capture.captureId)}
          ${model.agent.enabled ? button("生成 Demo Proposal", "generate-proposal", capture.captureId) : ""}
          ${button("无需行动", "dismiss-capture", capture.captureId, "quiet")}
        </div>
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
  const object = model.selectedObject;
  if (!object) return list;
  const detail = `<aside class="drawer" aria-label="对象抽屉">
    <div class="eyebrow">${escapeHtml(object.objectType)} · v${object.version}</div>
    <h2>${escapeHtml(object.text)}</h2>
    <div class="badges"><span>${escapeHtml(object.phase)}</span><span>${escapeHtml(object.condition.kind)}</span></div>
    ${object.completionCriteria ? `<section><h3>完成标准</h3><p>${escapeHtml(object.completionCriteria)}</p></section>` : ""}
    ${object.nextAction ? `<section><h3>下一步</h3><p>${escapeHtml(object.nextAction)}</p></section>` : ""}
    ${object.currentSummary ? `<section><h3>当前状态</h3><p>${escapeHtml(object.currentSummary)}</p></section>` : ""}
    ${object.condition.kind === "WAITING" ? `<section><h3>等待</h3><p>${escapeHtml(object.condition.waitingFor)} · ${escapeHtml(object.condition.expectedResult)} · ${escapeHtml(object.condition.reviewAt)}</p></section>` : ""}
    ${object.condition.kind === "BLOCKED" ? `<section><h3>阻塞</h3><p>${escapeHtml(object.condition.reason)}</p></section>` : ""}
    <div class="actions wrap">
      ${button("设为 Actionable", "condition-actionable", object.objectId)}
      ${button("设置 Waiting", "condition-waiting", object.objectId)}
      ${button("设置 Blocked", "condition-blocked", object.objectId)}
      ${button("设置 Paused", "condition-paused", object.objectId)}
      ${button("推进 Phase", "advance-phase", object.objectId)}
      ${button("重新绑定当前块", "rebind-anchor", object.objectId, "danger")}
    </div>
  </aside>`;
  return `<div class="split">${list}${detail}</div>`;
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
        ${proposal.uncertainties.length ? `<p class="uncertain"><strong>不确定：</strong>${escapeHtml(proposal.uncertainties.join("；"))}</p>` : ""}
        <div class="operations">${proposal.operations
          .map(
            (operation) => `<div class="operation risk-${operation.riskLevel.toLowerCase()}">
              <div><code>${escapeHtml(operation.operationType)}</code><span>${escapeHtml(operation.status)}</span></div>
              <p>${escapeHtml(operation.rationale)}</p>
              <small>${escapeHtml(operation.ruleRefs.join(" · "))}${operation.dependencies.length ? ` · 依赖 ${escapeHtml(operation.dependencies.join(", "))}` : ""}</small>
              <div class="actions">
                ${button("接受", "review-accept", `${proposal.proposalId}|${operation.operationId}|${operation.riskLevel}`)}
                ${button("拒绝", "review-reject", `${proposal.proposalId}|${operation.operationId}`, "quiet")}
              </div>
            </div>`,
          )
          .join("")}</div>
        ${button("提交已确认操作", "commit-proposal", proposal.proposalId, "primary")}
      </article>`,
    )
    .join("")}</div>`;
}

function renderReentry(model: UiModel): string {
  if (!model.reentry) return empty("暂无 Project 可重入", "创建 Project 后，这里会生成行动导向的恢复包。");
  const reentry = model.reentry;
  return `<article class="reentry">
    <div class="eyebrow">${escapeHtml(reentry.phase)} · ${escapeHtml(reentry.condition.kind)}</div>
    <h2>${escapeHtml(reentry.purpose)}</h2>
    <p class="lead">${escapeHtml(reentry.currentState)}</p>
    ${reentry.boundary ? `<section><h3>边界</h3><p>${escapeHtml([reentry.boundary.in, reentry.boundary.out].filter(Boolean).join(" / "))}</p></section>` : ""}
    ${reentry.recentChanges.length ? `<section><h3>最近关键变化</h3><ol>${reentry.recentChanges.map((change) => `<li>${escapeHtml(change.summary)}</li>`).join("")}</ol></section>` : ""}
    ${reentry.waitingOrBlocked ? `<section><h3>阻塞或等待</h3><p>${escapeHtml(reentry.waitingOrBlocked)}</p></section>` : ""}
    <section class="restore"><h3>建议恢复动作</h3><p>${escapeHtml(reentry.restoreAction)}</p></section>
    ${reentry.entryPoints.length ? `<section><h3>关键入口</h3><div class="actions">${reentry.entryPoints.map((entry) => button(entry.role, "open-anchor", entry.externalId, "quiet")).join("")}</div></section>` : ""}
  </article>`;
}

function renderAudit(model: UiModel): string {
  const commits = model.commits.length
    ? `<section><h2>SemanticCommit</h2><div class="cards">${model.commits
        .slice()
        .reverse()
        .map((commit) => `<article class="card compact"><div class="eyebrow">${escapeHtml(commit.status)} · ${escapeHtml(commit.updatedAt)}</div><code>${escapeHtml(commit.semanticCommitId)}</code>${commit.status === "COMPLETED" ? button("撤销", "undo-commit", commit.semanticCommitId, "danger") : ""}</article>`)
        .join("")}</div></section>`
    : "";
  const events = model.events.length
    ? `<section><h2>最近事件</h2><ol class="timeline">${model.events.slice(0, 20).map((event) => `<li><time>${escapeHtml(event.timestamp)}</time><span>${escapeHtml(event.operationType)}</span></li>`).join("")}</ol></section>`
    : "";
  return `<div class="audit-actions">${button("创建备份并导出", "export-backup", undefined, "primary")}${button("验证最近恢复包", "verify-backup")}${button("扫描 Pending Commit", "recover-pending")}</div>
    ${model.recoveryReport ? `<div class="report">${escapeHtml(model.recoveryReport)}</div>` : ""}
    ${commits || events || empty("还没有审计事件", "捕获和正式变更会记录在这里。")}`;
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
