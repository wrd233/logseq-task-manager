import type {
  AgentDecision,
  AgentDecisionEvent,
  AgentFeedbackRating,
  AgentReviewSignal,
  AgentRuleAuthorization,
} from "@task-copilot/domain";
import {
  authorityLabels,
  contextTierLabel,
  decisionImpactStatement,
  decisionJudgmentLine,
  decisionJudgmentSentence,
  decisionPrimaryStatus,
  eventLabels,
  executionLabels,
  outcomeLabels,
  riskRouteLabels,
  signalCategoryLabel,
  signalOccurrenceLabel,
  signalUserTitle,
  sourceTitle,
} from "./agent-governance-copy.ts";
import {
  allRulesShareAuthority,
  decisionTone,
  formatTime,
  projectAgentGovernanceDashboard,
  sharedSkillVersion,
  timestamp,
  type AgentGovernanceDashboard,
  type AgentGovernanceRange,
  type AgentGovernanceView,
} from "./agent-governance-presenter.ts";

export type { AgentGovernanceDashboard, AgentGovernanceRange, AgentGovernanceView } from "./agent-governance-presenter.ts";
export { projectAgentGovernanceDashboard } from "./agent-governance-presenter.ts";

export interface AgentGovernanceUiState {
  status: "loading" | "ready" | "error";
  error?: string;
  mode: "EXPERIMENT" | "GUARDED";
  automaticWritesPaused: boolean;
  observationEnabled: boolean;
  expandedContextEnabled: boolean;
  globalWritesPaused: boolean;
  view: AgentGovernanceView;
  range: AgentGovernanceRange;
  decisionFilter: "ALL" | "NEEDS_HUMAN" | "FAILED" | "SHADOW";
  decisionSearch: string;
  decisions: AgentDecision[];
  rules: AgentRuleAuthorization[];
  signals: AgentReviewSignal[];
  events: AgentDecisionEvent[];
  selectedDecisionId?: string;
  selectedDecisionIds: string[];
  batchMode: boolean;
  settingsOpen: boolean;
  exportMenuOpen: boolean;
  expandedFeedbackDecisionId?: string;
  expandedFeedbackRating?: AgentFeedbackRating;
  feedbackBusy?: boolean;
  exportBusy?: "skill" | "review";
  mutationBusy?: boolean;
  now: string;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function button(label: string, action: string, value?: string, kind: "primary" | "quiet" | "danger" = "quiet", disabled = false): string {
  return `<button type="button" class="${kind}" data-action="${action}"${value ? ` data-value="${escapeHtml(value)}"` : ""}${disabled ? " disabled aria-busy=\"true\"" : ""}>${escapeHtml(label)}</button>`;
}

function statusMarker(decision: AgentDecision): string {
  if (decision.executionStatus === "FAILED") return "×";
  if (decision.executionStatus === "BLOCKED" || decision.executionStatus === "STALE" || decision.outcome === "NEEDS_HUMAN") return "!";
  if (decision.executionStatus === "APPLIED") return "✓";
  return "·";
}

function renderGovernanceHeader(state: AgentGovernanceUiState): string {
  const observation = state.observationEnabled ? "观察中" : "观察已关闭";
  const writes = state.globalWritesPaused
    ? "全部写入已暂停"
    : state.automaticWritesPaused
      ? "自动写入关闭"
      : "自动写入按规则授权";
  const expanded = state.expandedContextEnabled ? "扩展联想开启" : "扩展联想关闭";
  const severe = !state.observationEnabled || state.globalWritesPaused;
  return `<header class="agent-governance-head">
    <div><div class="eyebrow">Agent Decision Governance</div><h2>Agent 治理</h2><p class="agent-governance-lede">看看 Agent 最近替你处理了什么，哪些需要你查看，以及对正式任务系统的影响。</p></div>
    <div class="agent-header-actions"><span class="agent-run-line${severe ? " is-warning" : ""}" role="status">${observation} · ${writes} · ${expanded}</span>${button("设置", "agent-governance-settings-toggle", "toggle", "quiet")}</div>
  </header>`;
}

function renderGovernanceTabs(state: AgentGovernanceUiState): string {
  const entries: Array<[AgentGovernanceView, string]> = [
    ["decisions", "决策"],
    ["rules", "规则"],
    ["review", "复盘"],
  ];
  return `<div class="agent-governance-tabs" role="tablist" aria-label="Agent 治理视图" data-agent-governance-tabs>${entries.map(([id, label]) => {
    const selected = state.view === id;
    return `<button type="button" role="tab" id="agent-governance-tab-${id}" aria-selected="${selected}" aria-controls="agent-governance-panel-${id}" tabindex="${selected ? 0 : -1}" data-action="agent-governance-view" data-value="${id}">${label}</button>`;
  }).join("")}</div>`;
}

function renderSettingsPopover(state: AgentGovernanceUiState): string {
  const modeLabel = state.mode === "EXPERIMENT" ? "观察模式" : "受控执行";
  return `<section class="agent-settings-popover" aria-label="设置与运行控制">
    <div class="agent-settings-head"><div><div class="eyebrow">设置与运行控制</div><h3>Agent 运行控制</h3></div>${button("关闭", "agent-governance-settings-toggle", "toggle", "quiet")}</div>
    <p class="agent-settings-mode">当前运行模式：${modeLabel}${state.mode === "EXPERIMENT" ? " · 决策只记录，不会写入正式对象。" : " · 仅明确授权且通过风险门的规则可执行。"}</p>
    <div class="agent-setting-row"><div><strong>Agent 观察</strong><span>${state.observationEnabled ? "Graph 变化会进入有界观察队列。" : "Graph 变化仅保留最新 32 个来源水位；基础产品不受影响。"}</span></div>${button(state.observationEnabled ? "关闭观察" : "开启观察", "agent-observation-toggle", state.observationEnabled ? "disable" : "enable", "quiet", Boolean(state.mutationBusy))}</div>
    <div class="agent-setting-row"><div><strong>扩展联想</strong><span>仅在 Gate 明确要求时读取受控扩展上下文。</span></div>${button(state.expandedContextEnabled ? "关闭联想" : "开启联想", "agent-expanded-context-toggle", state.expandedContextEnabled ? "disable" : "enable", "quiet", Boolean(state.mutationBusy))}</div>
    <div class="agent-setting-row"><div><strong>全部 Agent 写入</strong><span>暂停后观察与 Shadow 继续；正式写入始终由运行模式与规则授权控制。</span></div>${button(state.globalWritesPaused ? "恢复写入" : "暂停写入", "agent-global-pause", state.globalWritesPaused ? "resume" : "pause", "quiet", Boolean(state.mutationBusy))}</div>
  </section>`;
}

function renderSummaryLine(state: AgentGovernanceUiState, metrics: AgentGovernanceDashboard["metrics"]): string {
  const zero = (count: number, label: string): string => `<span${count === 0 ? ' class="is-zero"' : ""}> · ${label} <strong>${count}</strong></span>`;
  const rangeLabel = state.range === "24h" ? "24 小时" : "7 天";
  return `<div class="agent-summary-line">
    <span class="agent-summary-text">过去 ${rangeLabel}处理 <strong>${metrics.handled}</strong> 条${zero(metrics.humanNeeded, "需要查看")}${zero(metrics.failed, "异常")}<span${metrics.automatic === 0 ? ' class="is-zero"' : ""}> · 正式写入 <strong>${metrics.automatic}</strong></span></span>
    <span class="agent-range-toggle" role="group" aria-label="时间范围"><button type="button" data-action="agent-governance-range" data-value="24h" aria-pressed="${state.range === "24h"}" class="${state.range === "24h" ? "active" : ""}">24 小时</button><button type="button" data-action="agent-governance-range" data-value="7d" aria-pressed="${state.range === "7d"}" class="${state.range === "7d" ? "active" : ""}">7 天</button></span>
    <span class="agent-view-actions">${button(state.batchMode ? "退出批量" : "批量反馈", "agent-governance-batch", "toggle", "quiet")}${button("刷新", "agent-governance-refresh", undefined, "quiet")}</span>
  </div>`;
}

function renderDecisionTools(state: AgentGovernanceUiState): string {
  return `<div class="agent-decision-tools">
    <label>筛选<select data-field="agentDecisionFilter"><option value="ALL"${state.decisionFilter === "ALL" ? " selected" : ""}>全部</option><option value="NEEDS_HUMAN"${state.decisionFilter === "NEEDS_HUMAN" ? " selected" : ""}>需要查看</option><option value="FAILED"${state.decisionFilter === "FAILED" ? " selected" : ""}>异常</option><option value="SHADOW"${state.decisionFilter === "SHADOW" ? " selected" : ""}>观察中</option></select></label>
    <label>搜索<input type="search" data-field="agentDecisionSearch" value="${escapeHtml(state.decisionSearch)}" placeholder="来源、决定或规则"></label>
  </div>`;
}

function renderFeedbackFields(prefix: "agent-feedback" | "agent-bulk-feedback", includeAction: boolean, selectedRating?: AgentFeedbackRating): string {
  return `<label>判断准确度<select data-field="${prefix}-rating">
      <option value="CORRECT"${selectedRating === "CORRECT" ? " selected" : ""}>正确</option>
      <option value="MOSTLY_CORRECT"${selectedRating === "MOSTLY_CORRECT" ? " selected" : ""}>大体正确</option>
      <option value="WRONG"${selectedRating === "WRONG" ? " selected" : ""}>错误</option>
    </select></label>
    <label>修正类型<select data-field="${prefix}-correction-type">
      <option value="">无需修正</option><option value="SHOULD_KEEP_ORDINARY">应保持普通内容</option><option value="SHOULD_CREATE_OBJECT">应创建正式对象</option><option value="SHOULD_UPDATE_EXISTING">应更新已有对象</option><option value="SHOULD_DEFER">应暂缓</option><option value="WRONG_TARGET">目标错误</option><option value="TOO_AGGRESSIVE">过于激进</option><option value="TOO_CONSERVATIVE">过于保守</option><option value="RISK_TOO_HIGH">风险判定过高</option><option value="RISK_TOO_LOW">风险判定过低</option><option value="OTHER">其他</option>
    </select></label>
    ${includeAction ? `<label>处理范围<select data-field="${prefix}-action"><option value="THIS_DECISION_ONLY">仅记录这条决策</option><option value="RECORD_RULE_FEEDBACK">记入规则反馈</option><option value="PAUSE_RULE_AUTOMATION">记录并暂停该规则</option></select></label>` : ""}
    <label class="agent-feedback-note">备注（可选）<textarea data-field="${prefix}-note" maxlength="2048" placeholder="说明你会怎样判断。"></textarea></label>`;
}

function renderDecisionFeedback(state: AgentGovernanceUiState, decision: AgentDecision): string {
  const expanded = state.expandedFeedbackDecisionId === decision.decisionId;
  return `<form class="agent-feedback-form" data-agent-feedback-decision="${escapeHtml(decision.decisionId)}">
    <div class="agent-feedback-head"><div><div class="eyebrow">反馈</div><h4>这条判断对吗？</h4></div><p class="muted">反馈用于复查与规则改进；不会自动撤销任何正式变化。</p></div>
    ${expanded
      ? `<div class="agent-feedback-fields">${renderFeedbackFields("agent-feedback", true, state.expandedFeedbackRating)}</div>
         <div class="actions">${button(state.feedbackBusy ? "正在记录…" : "提交这条反馈", "agent-feedback-submit", decision.decisionId, "primary", state.feedbackBusy)}${button("取消", "agent-feedback-collapse", decision.decisionId, "quiet")}</div>`
      : `<div class="agent-feedback-quick" role="group" aria-label="快速反馈">
          ${button("正确", "agent-feedback-quick", `${decision.decisionId}:CORRECT`, "primary", state.feedbackBusy)}
          ${button("基本正确", "agent-feedback-expand", `${decision.decisionId}:MOSTLY_CORRECT`, "quiet", state.feedbackBusy)}
          ${button("错误", "agent-feedback-expand", `${decision.decisionId}:WRONG`, "quiet", state.feedbackBusy)}
        </div>`}
  </form>`;
}

function renderTechnicalDetails(decision: AgentDecision): string {
  const refs = decision.evidenceRefs.length
    ? `<ul>${decision.evidenceRefs.map((ref) => `<li><code>${escapeHtml(ref)}</code></li>`).join("")}</ul>`
    : "";
  const omitted = decision.context.omittedSections.length
    ? decision.context.omittedSections.map((section) => escapeHtml(section)).join("；")
    : "无";
  return `<details class="agent-technical-details"><summary>技术详情</summary><div class="agent-technical-body">
    <dl>
      <dt>Rule ID</dt><dd><code>${escapeHtml(decision.rule.id)}</code></dd>
      <dt>规则版本</dt><dd>${escapeHtml(decision.rule.skillVersion)}</dd>
      <dt>Skill 名称</dt><dd>${escapeHtml(decision.rule.skillName)}</dd>
      <dt>风险路由</dt><dd>${riskRouteLabels[decision.riskRoute]}</dd>
      <dt>执行状态</dt><dd>${executionLabels[decision.executionStatus]}</dd>
      <dt>上下文范围</dt><dd>${contextTierLabel(decision.context.tier)}${decision.context.truncated ? " · 已截断" : ""}</dd>
      <dt>预估 Tokens</dt><dd>${decision.context.estimatedInputTokens}${decision.context.estimatedOutputTokens !== undefined ? ` → ${decision.context.estimatedOutputTokens}` : ""}</dd>
      <dt>省略的上下文段</dt><dd>${omitted}</dd>
      <dt>来源</dt><dd>${decision.sourceRoot.kind === "BLOCK" ? "Block" : "Page"} · <code>${escapeHtml(decision.sourceRoot.externalId)}</code></dd>
      <dt>来源快照哈希</dt><dd><code>${escapeHtml(decision.sourceSnapshotHash)}</code></dd>
      <dt>决策 ID / 修订</dt><dd><code>${escapeHtml(decision.decisionId)}</code> · r${decision.revision}</dd>
      <dt>线程 ID</dt><dd><code>${escapeHtml(decision.threadId)}</code></dd>
    </dl>
    ${refs}
  </div></details>`;
}

function renderDecisionDetails(state: AgentGovernanceUiState, decision: AgentDecision): string {
  const events = state.events
    .filter((event) => event.threadId === decision.threadId)
    .sort((left, right) => timestamp(left.occurredAt) - timestamp(right.occurredAt));
  const counters = decision.counterSignals.length
    ? `<p class="agent-detail-counters"><strong>反向信号：</strong>${decision.counterSignals.map((signal) => escapeHtml(signal)).join("；")}</p>`
    : "";
  const alternative = decision.closestAlternative.outcome || decision.closestAlternative.reason
    ? `<p class="agent-detail-alternative"><strong>最接近的备选：</strong>${escapeHtml(outcomeLabels[decision.closestAlternative.outcome ?? "NO_ACTION"])}${decision.closestAlternative.reason ? `（${escapeHtml(decision.closestAlternative.reason)}）` : ""}</p>`
    : "";
  const sourceValue = encodeURIComponent(JSON.stringify({
    kind: decision.sourceRoot.kind,
    externalId: decision.sourceRoot.externalId,
    ...(decision.sourceRoot.pageName ? { pageName: decision.sourceRoot.pageName } : {}),
  }));
  return `<section class="agent-decision-detail" aria-label="决策详情">
    <div class="agent-detail-narrative">
      <section><h4>Agent 的判断</h4><p>${escapeHtml(decisionJudgmentSentence(decision))}</p></section>
      <section><h4>为什么</h4><p>${escapeHtml(decision.evidenceSummary)}</p>${counters}${alternative}</section>
      <section><h4>对正式系统的影响</h4><p>${escapeHtml(decisionImpactStatement(decision))}</p></section>
    </div>
    <div class="agent-detail-actions">${button("打开来源", "agent-source-open", sourceValue, "primary")}</div>
    ${renderTechnicalDetails(decision)}
    <details class="agent-event-history"><summary>事件历史 · ${events.length}</summary>${events.length ? `<ol>${events.map((event) => `<li><span>${escapeHtml(formatTime(event.occurredAt))}</span><strong>${eventLabels[event.eventType]}</strong><small>${escapeHtml(event.actor)}</small></li>`).join("")}</ol>` : "<p class=\"muted\">暂无可显示事件。</p>"}</details>
    ${renderDecisionFeedback(state, decision)}
  </section>`;
}

function renderDecisionRow(state: AgentGovernanceUiState, decision: AgentDecision): string {
  const expanded = state.selectedDecisionId === decision.decisionId;
  const checked = state.selectedDecisionIds.includes(decision.decisionId);
  const tone = decisionTone(decision);
  const issue = tone !== "normal";
  const primary = decisionPrimaryStatus(decision);
  const selectColumn = state.batchMode
    ? `<div class="agent-decision-check">${button(checked ? "已选" : "选择", "agent-decision-select", decision.decisionId, "quiet")}</div>`
    : "";
  return `<article class="agent-decision-row${issue ? ` has-issue tone-${tone}` : ""}${state.batchMode ? " batch-mode" : ""}${expanded ? " expanded" : ""}" data-decision-id="${escapeHtml(decision.decisionId)}">
    ${selectColumn}
    <button class="agent-decision-main" data-action="agent-decision-detail" data-value="${escapeHtml(decision.decisionId)}" aria-expanded="${expanded}">
      <span class="agent-status-mark" aria-hidden="true">${statusMarker(decision)}</span>
      <span class="agent-decision-copy"><strong class="agent-decision-title">${escapeHtml(sourceTitle(decision))}</strong><span class="agent-decision-judgment">${escapeHtml(decisionJudgmentLine(decision))}</span><small class="agent-decision-meta"><span class="agent-status-badge tone-${primary.tone}">${escapeHtml(primary.label)}</span><span>${escapeHtml(formatTime(decision.updatedAt))}</span><span>${escapeHtml(decision.rule.displayName)}</span></small></span>
    </button>
    ${expanded ? renderDecisionDetails(state, decision) : ""}
  </article>`;
}

function renderBulkFeedback(state: AgentGovernanceUiState): string {
  const selected = state.selectedDecisionIds.length;
  return `<section class="agent-bulk-feedback" aria-label="批量反馈">
    <div><div class="eyebrow">批量模式</div><h3>已选择 ${selected} 条决策</h3><p>将兼容决策分组提交。复记、写入或上下文不兼容时不会强行合并。${selected === 0 ? "点击决策行上的“选择”按钮加入本批。" : ""}</p></div>
    <div class="agent-feedback-fields">${renderFeedbackFields("agent-bulk-feedback", true)}</div>
    <div class="actions">${button(state.feedbackBusy ? "正在分组提交…" : "提交批量反馈", "agent-bulk-feedback-submit", undefined, "primary", state.feedbackBusy || selected < 2)}${button("清除选择", "agent-decision-selection-clear", undefined, "quiet", state.feedbackBusy)}</div>
  </section>`;
}

function renderDecisionsView(state: AgentGovernanceUiState): string {
  const dashboard = projectAgentGovernanceDashboard({ decisions: state.decisions, rules: state.rules, signals: state.signals, now: state.now, range: state.range });
  const selected = new Set(state.selectedDecisionIds);
  const query = state.decisionSearch.trim().toLocaleLowerCase("zh-CN");
  const visibleDecisions = dashboard.decisions.filter((decision) => {
    const matchesFilter = state.decisionFilter === "ALL"
      || (state.decisionFilter === "NEEDS_HUMAN" && (decision.outcome === "NEEDS_HUMAN" || decision.riskRoute === "HUMAN_REVIEW"))
      || (state.decisionFilter === "FAILED" && ["FAILED", "BLOCKED", "STALE"].includes(decision.executionStatus))
      || (state.decisionFilter === "SHADOW" && decision.riskRoute === "SHADOW");
    if (!matchesFilter || !query) return matchesFilter;
    return [decision.evidenceSummary, decision.rule.displayName, decision.rule.id, decision.sourceRoot.pageName, sourceTitle(decision), outcomeLabels[decision.outcome]]
      .some((value) => String(value ?? "").toLocaleLowerCase("zh-CN").includes(query));
  });
  const rows = visibleDecisions.map((decision) => renderDecisionRow({ ...state, selectedDecisionIds: [...selected] }, decision)).join("");
  return `<section class="agent-decisions-view" role="tabpanel" id="agent-governance-panel-decisions" aria-labelledby="agent-governance-tab-decisions">
    ${renderSummaryLine(state, dashboard.metrics)}
    ${renderDecisionTools(state)}
    ${state.batchMode ? renderBulkFeedback(state) : ""}
    <div class="agent-decision-list">${rows || `<div class="empty"><strong>${state.decisions.length ? "没有符合条件的决策" : "尚无决策记录"}</strong><span>${state.decisions.length ? "调整筛选或搜索条件后重试。" : "观察模式运行后，可追溯决策会在这里出现。"}</span></div>`}</div>
  </section>`;
}

function renderRulesView(state: AgentGovernanceUiState): string {
  const { rules, decisions } = state;
  const shared = allRulesShareAuthority(rules);
  const version = sharedSkillVersion(rules);
  const summary = shared.uniform && shared.authority
    ? `<p class="agent-mode-summary">全部规则当前处于${authorityLabels[shared.authority]}${version ? ` · 当前规则版本 ${escapeHtml(version)}` : ""}</p>`
    : "";
  const rows = rules.length
    ? `<div class="agent-rule-list">${rules.map((rule) => {
        const count = decisions.filter((decision) => decision.rule.id === rule.ruleId).length;
        const authority = shared.uniform && shared.authority ? "" : `当前：${authorityLabels[rule.effectiveAuthority]} · `;
        return `<article class="agent-rule-row">
          <span class="agent-status-mark" aria-hidden="true">${rule.paused ? "‖" : "·"}</span>
          <div class="agent-rule-copy"><strong>${escapeHtml(rule.displayName)}</strong><span>${authority}${count} 条决策 · ${rule.paused ? "已暂停" : "运行中"}</span>
            <details class="agent-rule-tech"><summary>规则详情</summary><dl>
              <dt>Rule ID</dt><dd><code>${escapeHtml(rule.ruleId)}</code></dd>
              <dt>规则版本</dt><dd>${escapeHtml(rule.skillVersion)}</dd>
              <dt>授予上限 / 本地 / 有效</dt><dd>${authorityLabels[rule.skillMaxAuthority]} / ${authorityLabels[rule.localCurrentAuthority]} / ${authorityLabels[rule.effectiveAuthority]}</dd>
              <dt>变更等级</dt><dd>${escapeHtml(rule.changeLevel)}</dd>
              <dt>创建 / 更新</dt><dd>${escapeHtml(formatTime(rule.createdAt))} / ${escapeHtml(formatTime(rule.updatedAt))}</dd>
            </dl></details>
          </div>
          <div class="agent-rule-action">${button(rule.paused ? "恢复" : "暂停", "agent-rule-pause", `${rule.ruleId}:${rule.paused ? "resume" : "pause"}`, "quiet", Boolean(state.mutationBusy))}</div>
        </article>`;
      }).join("")}</div>`
    : `<div class="empty agent-compact-empty"><strong>暂无规则授权记录</strong><span>第一次 Agent 观察后会在这里显示。</span></div>`;
  return `<section class="agent-rules-view" role="tabpanel" id="agent-governance-panel-rules" aria-labelledby="agent-governance-tab-rules">
    <div class="agent-view-head"><div><div class="eyebrow">低频治理</div><h3>规则</h3><p>规则表现与授权状态；暂停与恢复仍由系统安全链控制。</p></div></div>
    ${summary}
    ${rows}
  </section>`;
}

function renderReviewView(state: AgentGovernanceUiState): string {
  const active = state.signals.filter((signal) => signal.status === "ACTIVE");
  const signals = active.length
    ? `<ul class="agent-signal-list">${active.slice(0, 8).map((signal) => `<li><strong>${signalUserTitle()}</strong><span>${escapeHtml(signal.capturedText)}</span><small>${escapeHtml(signal.revisitReason)} · ${signalOccurrenceLabel(signal)} · 相关主题：${signalCategoryLabel(signal.category)}</small>
      <details class="agent-signal-tech"><summary>技术详情</summary><dl>
        <dt>类别</dt><dd><code>${escapeHtml(signal.category)}</code></dd>
        <dt>信号 ID</dt><dd><code>${escapeHtml(signal.reviewSignalId)}</code></dd>
        <dt>来源</dt><dd>${signal.sourceRoot.kind === "BLOCK" ? "Block" : "Page"} · <code>${escapeHtml(signal.sourceRoot.externalId)}</code></dd>
        <dt>关联正式对象</dt><dd>${signal.relatedObjectIds.length ? signal.relatedObjectIds.map((id) => `<code>${escapeHtml(id)}</code>`).join("、") : "无"}</dd>
        <dt>保留级别 / 状态</dt><dd>${escapeHtml(signal.retentionClass)} / ${escapeHtml(signal.status)}</dd>
        <dt>首次 / 最近出现</dt><dd>${escapeHtml(formatTime(signal.firstSeenAt))} / ${escapeHtml(formatTime(signal.lastSeenAt))}</dd>
      </dl></details>
    </li>`).join("")}</ul>`
    : `<p class="muted">当前没有待复查的弱信号。</p>`;
  const exportMenu = state.exportMenuOpen
    ? `<div class="agent-export-menu">
        <label>导出类型<select data-field="agentExportType"><option value="skill">Skill 反馈</option><option value="review">复查证据</option></select></label>
        <label>时间范围<select data-field="agentExportRange"><option value="30">30 天</option><option value="60">60 天</option><option value="180">180 天</option></select></label>
        <div class="actions">${button(state.exportBusy ? "正在导出…" : "导出", "agent-export-go", undefined, "primary", Boolean(state.exportBusy))}${button("取消", "agent-export-menu-toggle", "toggle", "quiet")}</div>
      </div>`
    : `<div class="actions">${button(state.exportBusy ? "正在导出…" : "导出复盘素材", "agent-export-menu-toggle", "toggle", "primary", Boolean(state.exportBusy))}</div>`;
  return `<section class="agent-review-view" role="tabpanel" id="agent-governance-panel-review" aria-labelledby="agent-governance-tab-review">
    <div class="agent-view-head"><div><div class="eyebrow">主动使用的素材整理</div><h3>复盘</h3><p>复查信号与可校验导出；不会向外部回灌模型。</p></div></div>
    ${signals}
    <section class="agent-export-panel"><div class="agent-export-head"><div class="eyebrow">评审与改进</div><h3>导出复盘素材</h3></div><p>导出前会校验文件清单、大小和校验和，并移除凭据形式的内容。</p>${exportMenu}</section>
  </section>`;
}

export function renderAgentGovernance(state: AgentGovernanceUiState): string {
  const heading = renderGovernanceHeader(state);
  if (state.status === "loading") {
    return `${heading}<div class="empty agent-governance-loading" role="status"><strong>正在读取决策记录…</strong><span>正式事项不受影响。</span></div>`;
  }
  if (state.status === "error") {
    return `${heading}<section class="error agent-governance-error" role="alert"><strong>不能读取 Agent 治理数据</strong><span>${escapeHtml(state.error ?? "未知错误")}；没有修改任何正式事项。</span>${button("重试", "agent-governance-refresh", undefined, "primary")}</section>`;
  }
  const tabs = renderGovernanceTabs(state);
  const settings = state.settingsOpen ? renderSettingsPopover(state) : "";
  const body = state.view === "rules"
    ? renderRulesView(state)
    : state.view === "review"
      ? renderReviewView(state)
      : renderDecisionsView(state);
  return `${heading}${tabs}${settings}${body}`;
}
