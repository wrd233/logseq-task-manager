import type {
  AgentDecision,
  AgentDecisionEvent,
  AgentReviewSignal,
  AgentRuleAuthorization,
} from "@task-copilot/domain";

export interface AgentGovernanceUiState {
  status: "loading" | "ready" | "error";
  error?: string;
  mode: "EXPERIMENT" | "GUARDED";
  automaticWritesPaused: boolean;
  decisions: AgentDecision[];
  rules: AgentRuleAuthorization[];
  signals: AgentReviewSignal[];
  events: AgentDecisionEvent[];
  selectedDecisionId?: string;
  selectedDecisionIds: string[];
  feedbackBusy?: boolean;
  exportBusy?: "skill" | "review";
  now: string;
}

export interface AgentGovernanceDashboard {
  decisions: AgentDecision[];
  metrics: {
    handled24h: number;
    handled7d: number;
    automatic: number;
    humanNeeded: number;
    failed: number;
    sampled: number;
  };
}

const outcomeLabels: Record<AgentDecision["outcome"], string> = {
  CREATE_CANDIDATE: "建议创建候选",
  KEEP_ORDINARY: "保持普通内容",
  DEFER: "暂缓判断",
  UPDATE_EXISTING: "建议更新已有对象",
  CREATE_OBJECT: "建议创建正式对象",
  REVIEW_SIGNAL: "记录复查信号",
  NO_ACTION: "无需处理",
  NEEDS_HUMAN: "需要人工",
  NEEDS_MORE_CONTEXT: "需要更多上下文",
};

const executionLabels: Record<AgentDecision["executionStatus"], string> = {
  NOT_EXECUTED: "未执行",
  SCHEDULED: "已排队",
  APPLIED: "已应用",
  BLOCKED: "已阻断",
  FAILED: "执行失败",
  UNDONE: "已撤销",
  STALE: "来源已变化",
};

const eventLabels: Record<AgentDecisionEvent["eventType"], string> = {
  SOURCE_OBSERVED: "读取来源",
  DECISION_REVISED: "修订决策",
  ROUTE_CHANGED: "调整风险路由",
  EXECUTION_SCHEDULED: "进入执行队列",
  APPLIED: "已应用",
  BLOCKED: "已阻断",
  FAILED: "执行失败",
  UNDONE: "已撤销",
  USER_FEEDBACK_ADDED: "用户反馈",
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function button(label: string, action: string, value?: string, kind: "primary" | "quiet" = "quiet", disabled = false): string {
  return `<button type="button" class="${kind}" data-action="${action}"${value ? ` data-value="${escapeHtml(value)}"` : ""}${disabled ? " disabled aria-busy=\"true\"" : ""}>${escapeHtml(label)}</button>`;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decisionSeverity(decision: AgentDecision): number {
  if (decision.executionStatus === "FAILED") return 90;
  if (decision.executionStatus === "BLOCKED" || decision.executionStatus === "STALE") return 80;
  if (decision.outcome === "NEEDS_HUMAN") return 70;
  if (decision.counterSignals.length > 0) return 60;
  if (decision.outcome === "NEEDS_MORE_CONTEXT") return 50;
  return 0;
}

export function projectAgentGovernanceDashboard(input: {
  decisions: readonly AgentDecision[];
  rules: readonly AgentRuleAuthorization[];
  signals: readonly AgentReviewSignal[];
  now: string;
}): AgentGovernanceDashboard {
  const now = timestamp(input.now);
  const day = 24 * 60 * 60 * 1_000;
  const recent = (range: number) => input.decisions.filter((decision) => now - timestamp(decision.updatedAt) >= 0 && now - timestamp(decision.updatedAt) <= range);
  const decisions = [...input.decisions].sort((left, right) => {
    const severity = decisionSeverity(right) - decisionSeverity(left);
    return severity || timestamp(right.updatedAt) - timestamp(left.updatedAt) || left.decisionId.localeCompare(right.decisionId);
  });
  const week = recent(7 * day);
  return {
    decisions,
    metrics: {
      handled24h: recent(day).length,
      handled7d: week.length,
      automatic: week.filter((decision) => decision.riskRoute === "AUTO_APPLY" && decision.executionStatus === "APPLIED").length,
      humanNeeded: week.filter((decision) => decision.outcome === "NEEDS_HUMAN" || decision.riskRoute === "HUMAN_REVIEW").length,
      failed: week.filter((decision) => decision.executionStatus === "FAILED").length,
      sampled: week.filter((decision) => decision.riskRoute === "BATCH_REVIEW").length,
    },
  };
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : value;
}

function statusMarker(decision: AgentDecision): string {
  if (decision.executionStatus === "FAILED") return "×";
  if (decision.executionStatus === "BLOCKED" || decision.executionStatus === "STALE" || decision.outcome === "NEEDS_HUMAN") return "!";
  if (decision.executionStatus === "APPLIED") return "✓";
  return "·";
}

function renderFeedbackFields(prefix: string, includeAction: boolean): string {
  return `<label>判断准确度<select data-field="${prefix}-rating">
      <option value="CORRECT">正确</option><option value="MOSTLY_CORRECT">大体正确</option><option value="WRONG">错误</option>
    </select></label>
    <label>修正类型<select data-field="${prefix}-correction-type">
      <option value="">无需修正</option><option value="SHOULD_KEEP_ORDINARY">应保持普通内容</option><option value="SHOULD_CREATE_OBJECT">应创建正式对象</option><option value="SHOULD_UPDATE_EXISTING">应更新已有对象</option><option value="SHOULD_DEFER">应暂缓</option><option value="WRONG_TARGET">目标错误</option><option value="TOO_AGGRESSIVE">过于激进</option><option value="TOO_CONSERVATIVE">过于保守</option><option value="RISK_TOO_HIGH">风险判定过高</option><option value="RISK_TOO_LOW">风险判定过低</option><option value="OTHER">其他</option>
    </select></label>
    ${includeAction ? `<label>处理范围<select data-field="${prefix}-action"><option value="THIS_DECISION_ONLY">仅记录这条决策</option><option value="RECORD_RULE_FEEDBACK">记入规则反馈</option><option value="PAUSE_RULE_AUTOMATION">记录并暂停该规则</option></select></label>` : ""}
    <label class="agent-feedback-note">备注（可选）<textarea data-field="${prefix}-note" maxlength="2048" placeholder="说明你会怎样判断。"></textarea></label>`;
}

function renderDecisionDetails(state: AgentGovernanceUiState, decision: AgentDecision): string {
  const events = state.events
    .filter((event) => event.threadId === decision.threadId)
    .sort((left, right) => timestamp(left.occurredAt) - timestamp(right.occurredAt));
  const counters = decision.counterSignals.length ? decision.counterSignals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join("") : "<li>无</li>";
  const evidenceRefs = decision.evidenceRefs.map((ref) => `<li>${escapeHtml(ref)}</li>`).join("");
  const alternative = decision.closestAlternative.outcome
    ? `${outcomeLabels[decision.closestAlternative.outcome]}${decision.closestAlternative.reason ? `：${escapeHtml(decision.closestAlternative.reason)}` : ""}`
    : "无必要的备选。";
  return `<section class="agent-decision-detail" aria-label="决策详情">
    <div class="agent-detail-grid">
      <section><h4>判断依据</h4><p>${escapeHtml(decision.evidenceSummary)}</p><ul>${evidenceRefs}</ul></section>
      <section><h4>反向信号</h4><ul>${counters}</ul></section>
      <section><h4>最接近的备选</h4><p>${alternative}</p></section>
      <section><h4>上下文与规则</h4><p>${escapeHtml(decision.context.tier)} · 预估 ${escapeHtml(decision.context.estimatedInputTokens)} tokens${decision.context.truncated ? " · 已截断" : ""}</p><p>${escapeHtml(decision.rule.displayName)} · Skill ${escapeHtml(decision.rule.skillVersion)}</p><code>${escapeHtml(decision.rule.id)}</code></section>
    </div>
    <details class="agent-event-history" open><summary>事件历史 · ${events.length}</summary>${events.length ? `<ol>${events.map((event) => `<li><span>${escapeHtml(formatTime(event.occurredAt))}</span><strong>${eventLabels[event.eventType]}</strong><small>${escapeHtml(event.actor)}</small></li>`).join("")}</ol>` : "<p class=\"muted\">暂无可显示事件。</p>"}</details>
    <form class="agent-feedback-form" data-agent-feedback-decision="${escapeHtml(decision.decisionId)}">
      <div><div class="eyebrow">记录反馈</div><h4>这条判断对吗？</h4><p class="muted">反馈用于复查与规则改进；不会自动撤销任何正式变化。</p></div>
      <div class="agent-feedback-fields">${renderFeedbackFields("agent-feedback", true)}</div>
      <div class="actions">${button(state.feedbackBusy ? "正在记录…" : "提交这条反馈", "agent-feedback-submit", decision.decisionId, "primary", state.feedbackBusy)}</div>
    </form>
  </section>`;
}

function renderDecisionRow(state: AgentGovernanceUiState, decision: AgentDecision): string {
  const expanded = state.selectedDecisionId === decision.decisionId;
  const checked = state.selectedDecisionIds.includes(decision.decisionId);
  const issue = decisionSeverity(decision) > 0;
  const source = decision.sourceRoot.pageName ?? `${decision.sourceRoot.kind === "BLOCK" ? "Block" : "Page"} ${decision.sourceRoot.externalId}`;
  return `<article class="agent-decision-row${issue ? " has-issue" : ""}${expanded ? " expanded" : ""}" data-decision-id="${escapeHtml(decision.decisionId)}">
    <div class="agent-decision-select">${button(checked ? "已选" : "选择", "agent-decision-select", decision.decisionId, "quiet")}</div>
    <button class="agent-decision-main" data-action="agent-decision-detail" data-value="${escapeHtml(decision.decisionId)}" aria-expanded="${expanded}">
      <span class="agent-status-mark" aria-hidden="true">${statusMarker(decision)}</span>
      <span class="agent-decision-copy"><span class="agent-decision-title">${escapeHtml(outcomeLabels[decision.outcome])}</span><span>${escapeHtml(decision.evidenceSummary)}</span><small>${escapeHtml(source)} · ${escapeHtml(decision.rule.displayName)} · ${escapeHtml(formatTime(decision.updatedAt))}</small></span>
      <span class="agent-decision-state"><strong>${escapeHtml(executionLabels[decision.executionStatus])}</strong><small>${escapeHtml(decision.riskRoute)}</small></span>
    </button>
    ${expanded ? renderDecisionDetails(state, decision) : ""}
  </article>`;
}

function renderBulkFeedback(state: AgentGovernanceUiState): string {
  if (state.selectedDecisionIds.length < 2) return "";
  return `<section class="agent-bulk-feedback" aria-label="批量反馈">
    <div><div class="eyebrow">批量反馈</div><h3>已选 ${state.selectedDecisionIds.length} 条决策</h3><p>将兼容决策分组提交。复记、写入或上下文不兼容时不会强行合并。</p></div>
    <div class="agent-feedback-fields">${renderFeedbackFields("agent-bulk-feedback", true)}</div>
    <div class="actions">${button(state.feedbackBusy ? "正在分组提交…" : "提交批量反馈", "agent-bulk-feedback-submit", undefined, "primary", state.feedbackBusy)}${button("清除选择", "agent-decision-selection-clear")}</div>
  </section>`;
}

function renderRules(rules: readonly AgentRuleAuthorization[], decisions: readonly AgentDecision[]): string {
  if (!rules.length) return `<div class="empty agent-compact-empty"><strong>暂无规则授权记录</strong><span>第一次 Agent 观察后会在这里显示。</span></div>`;
  return `<div class="agent-rule-list">${rules.map((rule) => {
    const count = decisions.filter((decision) => decision.rule.id === rule.ruleId).length;
    return `<article><span class="agent-status-mark" aria-hidden="true">${rule.paused ? "‖" : "·"}</span><div><strong>${escapeHtml(rule.displayName)}</strong><small>${escapeHtml(rule.ruleId)} · Skill ${escapeHtml(rule.skillVersion)}</small></div><div><strong>${rule.paused ? "已暂停" : escapeHtml(rule.effectiveAuthority)}</strong><small>${count} 条决策</small></div></article>`;
  }).join("")}</div>`;
}

function renderSignals(signals: readonly AgentReviewSignal[]): string {
  const active = signals.filter((signal) => signal.status === "ACTIVE");
  if (!active.length) return `<p class="muted">当前没有待复查的弱信号。</p>`;
  return `<ul class="agent-signal-list">${active.slice(0, 8).map((signal) => `<li><strong>${escapeHtml(signal.category)}</strong><span>${escapeHtml(signal.capturedText)}</span><small>${escapeHtml(signal.revisitReason)} · 出现 ${signal.occurrenceCount} 次</small></li>`).join("")}</ul>`;
}

export function renderAgentGovernance(state: AgentGovernanceUiState): string {
  const modeLabel = state.mode === "EXPERIMENT" ? "观察模式" : "受控执行";
  const boundary = state.automaticWritesPaused ? "自动写入已关闭" : "自动写入按规则授权";
  const heading = `<header class="agent-governance-head"><div><div class="eyebrow">Agent Decision Governance</div><h2>Agent 治理</h2><p>了解 Agent 处理了什么、为什么这样判断，并对规则给出可追溯反馈。</p></div><div class="agent-run-state"><strong>${modeLabel}</strong><span>${boundary}</span><small>${state.mode === "EXPERIMENT" ? "当前决策只记录，不会写入正式对象。" : "仅明确授权且通过风险门的规则可执行。"}</small></div></header>`;
  if (state.status === "loading") return `${heading}<div class="empty agent-governance-loading" role="status"><strong>正在读取决策记录…</strong><span>正式事项不受影响。</span></div>`;
  if (state.status === "error") return `${heading}<section class="error agent-governance-error" role="alert"><strong>不能读取 Agent 治理数据</strong><span>${escapeHtml(state.error ?? "未知错误")}；没有修改任何正式事项。</span>${button("重试", "agent-governance-refresh", undefined, "primary")}</section>`;

  const dashboard = projectAgentGovernanceDashboard({ decisions: state.decisions, rules: state.rules, signals: state.signals, now: state.now });
  const selected = new Set(state.selectedDecisionIds);
  const decisions = dashboard.decisions.map((decision) => renderDecisionRow({ ...state, selectedDecisionIds: [...selected] }, decision)).join("");
  return `${heading}
    <section class="agent-metrics" aria-label="近期 Agent 运行摘要">
      <div><span>24h 处理</span><strong>${dashboard.metrics.handled24h}</strong></div><div><span>7d 处理</span><strong>${dashboard.metrics.handled7d}</strong></div><div><span>自动应用</span><strong>${dashboard.metrics.automatic}</strong></div><div><span>需要人工</span><strong>${dashboard.metrics.humanNeeded}</strong></div><div><span>执行失败</span><strong>${dashboard.metrics.failed}</strong></div><div><span>批量采样</span><strong>${dashboard.metrics.sampled}</strong></div>
    </section>
    ${renderBulkFeedback(state)}
    <div class="agent-governance-layout">
      <section class="agent-decision-stream"><div class="agent-section-head"><div><div class="eyebrow">异常优先</div><h3>最近决策</h3></div>${button("刷新", "agent-governance-refresh")}</div>${decisions || `<div class="empty"><strong>尚无决策记录</strong><span>观察模式运行后，可追溯决策会在这里出现。</span></div>`}</section>
      <aside class="agent-governance-side">
        <section><div class="eyebrow">规则与表现</div><h3>当前授权</h3>${renderRules(state.rules, state.decisions)}</section>
        <section><div class="eyebrow">稍后复查</div><h3>弱信号</h3>${renderSignals(state.signals)}</section>
        <section class="agent-export-panel"><div class="eyebrow">评审与改进</div><h3>导出治理证据</h3><p>导出前会校验文件清单、大小和校验和，并移除凭据形式的内容。</p><div class="actions">${button(state.exportBusy === "skill" ? "正在导出…" : "导出 30 天 Skill 反馈", "agent-export-skill", "30", "quiet", Boolean(state.exportBusy))}${button(state.exportBusy === "review" ? "正在准备…" : "导出 60 天复查证据", "agent-export-review", "60", "quiet", Boolean(state.exportBusy))}</div></section>
      </aside>
    </div>`;
}
