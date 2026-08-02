import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDecision, AgentDecisionEvent, AgentReviewSignal, AgentRuleAuthorization } from "@task-copilot/domain";

import { projectAgentGovernanceDashboard, renderAgentGovernance, type AgentGovernanceUiState } from "../src/agent-governance-ui.ts";
import { renderApp, type UiModel } from "../src/ui.ts";

const observedAt = "2026-08-02T08:00:00.000Z";

function decision(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    graphId: "graph-private",
    sourceRoot: { kind: "BLOCK", externalId: "block-1", pageName: "今天", durableOrigin: { kind: "BLOCK_UUID", value: "block-1" } },
    sourceSnapshotHash: "a".repeat(64),
    outcome: "KEEP_ORDINARY",
    rule: { id: "keep-ordinary", displayName: "保持普通内容", skillName: "agent-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
    riskRoute: "SHADOW",
    executionStatus: "NOT_EXECUTED",
    evidenceSummary: "这是一条不需要正式管理的随手记录。",
    evidenceRefs: ["block:block-1"],
    counterSignals: [],
    closestAlternative: { outcome: "CREATE_CANDIDATE", reason: "如果后续出现明确行动意图。" },
    context: { tier: "LOCAL", truncated: false, omittedSections: [], estimatedInputTokens: 240 },
    threadId: "thread-1",
    decisionId: "decision-1",
    revision: 1,
    observedAt,
    createdAt: observedAt,
    updatedAt: observedAt,
    ...overrides,
  };
}

function authorization(overrides: Partial<AgentRuleAuthorization> = {}): AgentRuleAuthorization {
  return {
    ruleId: "keep-ordinary",
    displayName: "保持普通内容",
    skillName: "agent-governance",
    skillVersion: "1.0.0",
    skillHash: "b".repeat(64),
    skillMaxAuthority: "SHADOW",
    localCurrentAuthority: "SHADOW",
    effectiveAuthority: "SHADOW",
    changeLevel: "PATCH",
    paused: false,
    createdAt: observedAt,
    updatedAt: observedAt,
    ...overrides,
  };
}

function signal(overrides: Partial<AgentReviewSignal> = {}): AgentReviewSignal {
  return {
    reviewSignalId: "signal-1",
    graphId: "graph-private",
    sourceRoot: decision().sourceRoot,
    capturedSnapshotHash: "c".repeat(64),
    capturedText: "稍后再看",
    category: "weak-intent",
    relatedObjectIds: [],
    revisitReason: "意图尚不明确",
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    occurrenceCount: 1,
    retentionClass: "NORMAL",
    status: "ACTIVE",
    createdByDecisionId: "decision-1",
    ...overrides,
  };
}

function baseState(overrides: Partial<AgentGovernanceUiState> = {}): AgentGovernanceUiState {
  return {
    status: "ready",
    mode: "EXPERIMENT",
    automaticWritesPaused: true,
    observationEnabled: true,
    expandedContextEnabled: true,
    globalWritesPaused: false,
    view: "decisions",
    range: "24h",
    decisionFilter: "ALL",
    decisionSearch: "",
    decisions: [],
    rules: [],
    signals: [],
    events: [],
    selectedDecisionIds: [],
    batchMode: false,
    settingsOpen: false,
    exportMenuOpen: false,
    now: observedAt,
    ...overrides,
  };
}

test("governance dashboard is exception-first with range metrics", () => {
  const ordinary = decision();
  const failed = decision({
    decisionId: "decision-failed",
    threadId: "thread-failed",
    outcome: "NEEDS_HUMAN",
    executionStatus: "FAILED",
    counterSignals: ["可能指向多个对象"],
    updatedAt: "2026-08-02T07:30:00.000Z",
  });
  const stale = decision({ decisionId: "decision-stale", threadId: "thread-stale", executionStatus: "STALE", updatedAt: "2026-07-27T07:30:00.000Z" });
  const dashboard = projectAgentGovernanceDashboard({ decisions: [ordinary, failed, stale], rules: [authorization()], signals: [], now: observedAt, range: "24h" });

  assert.equal(dashboard.decisions[0]?.decisionId, "decision-failed");
  assert.deepEqual(dashboard.metrics, { handled: 2, humanNeeded: 1, failed: 1, automatic: 0 });

  const week = projectAgentGovernanceDashboard({ decisions: [ordinary, failed, stale], rules: [authorization()], signals: [], now: observedAt, range: "7d" });
  assert.equal(week.metrics.handled, 3);
  assert.equal(week.metrics.failed, 2);
});

test("governance defaults to decisions, keeps one status, and omits permanent selectors and side panels", () => {
  const ordinary = decision();
  const failed = decision({ decisionId: "decision-failed", threadId: "thread-failed", outcome: "NEEDS_HUMAN", executionStatus: "FAILED", updatedAt: "2026-08-02T07:30:00.000Z" });
  const html = renderAgentGovernance(baseState({ decisions: [ordinary, failed], rules: [authorization()], selectedDecisionIds: [] }));

  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"[^>]*>决策/);
  assert.match(html, /data-action="agent-governance-view" data-value="rules"/);
  assert.match(html, /data-action="agent-governance-view" data-value="review"/);
  assert.match(html, /观察中 · 自动写入关闭 · 扩展联想开启/);
  assert.match(html, /data-action="agent-governance-settings-toggle"/);
  assert.match(html, /过去 24 小时处理 <strong>2<\/strong> 条/);
  assert.match(html, /需要查看 <strong>1<\/strong>/);
  assert.match(html, /正式写入 <strong>0<\/strong>/);
  assert.doesNotMatch(html, /data-action="agent-decision-select"/);
  assert.doesNotMatch(html, /agent-governance-side/);
  assert.doesNotMatch(html, /agent-metrics/);
  assert.doesNotMatch(html, /agent-run-state/);
  assert.doesNotMatch(html, /data-action="agent-export-skill"/);
  assert.doesNotMatch(html, /data-action="agent-export-review"/);

  const ordinaryRow = html.slice(html.indexOf('data-decision-id="decision-1"'), html.indexOf('data-decision-id="decision-1"') + 700);
  assert.ok(ordinaryRow.indexOf("今天") < ordinaryRow.indexOf("Agent 判断"));
  assert.ok(ordinaryRow.indexOf("Agent 判断") < ordinaryRow.indexOf("观察中"));
  assert.ok(html.indexOf("decision-failed") < html.indexOf("decision-1"));
  assert.match(html, /agent-status-badge tone-danger">异常</);
});

test("source title falls back safely without exposing a bare UUID", () => {
  const unnamed = decision({
    sourceRoot: { kind: "BLOCK", externalId: "uuid-abc-123", durableOrigin: { kind: "BLOCK_UUID", value: "uuid-abc-123" } },
  });
  const html = renderAgentGovernance(baseState({ decisions: [unnamed], rules: [], selectedDecisionIds: [] }));
  const row = html.slice(html.indexOf("agent-decision-row"), html.indexOf("agent-decision-row") + 600);
  assert.match(row, /agent-decision-title">未命名来源</);
  assert.doesNotMatch(row, /agent-decision-title">[^<]*uuid-abc-123/);
});

test("settings and batch mode are explicit surfaces with keyboard semantics", () => {
  const first = decision();
  const second = decision({ decisionId: "decision-2", threadId: "thread-2", sourceRoot: { kind: "BLOCK", externalId: "block-2", durableOrigin: { kind: "BLOCK_UUID", value: "block-2" } } });
  const closed = renderAgentGovernance(baseState({ decisions: [first, second], rules: [authorization()], selectedDecisionIds: [] }));
  assert.doesNotMatch(closed, /设置与运行控制/);
  assert.doesNotMatch(closed, /data-action="agent-observation-toggle"/);

  const settings = renderAgentGovernance(baseState({ decisions: [first, second], rules: [authorization()], settingsOpen: true }));
  assert.match(settings, /aria-label="设置与运行控制"/);
  assert.match(settings, /data-action="agent-observation-toggle" data-value="disable"/);
  assert.match(settings, /data-action="agent-expanded-context-toggle" data-value="disable"/);
  assert.match(settings, /data-action="agent-global-pause" data-value="pause"/);
  assert.match(settings, /观察模式/);

  const batch = renderAgentGovernance(baseState({ decisions: [first, second], rules: [authorization()], batchMode: true, selectedDecisionIds: [first.decisionId] }));
  assert.match(batch, /data-action="agent-decision-select"/);
  assert.match(batch, /已选择 1 条决策/);
  assert.match(batch, /data-action="agent-bulk-feedback-submit"/);
  assert.match(batch, /data-action="agent-governance-batch"/);
});

test("selected decision narrates judgment, why and impact with collapsed technical fields and quick feedback", () => {
  const first = decision({ outcome: "NEEDS_HUMAN", executionStatus: "NOT_EXECUTED", evidenceSummary: "模型返回的结果没有通过结构校验，系统无法可靠确认它的真实意图。" });
  const event: AgentDecisionEvent = {
    eventId: "event-1",
    threadId: first.threadId,
    decisionId: first.decisionId,
    eventType: "SOURCE_OBSERVED",
    actor: "AGENT",
    payload: {},
    occurredAt: observedAt,
  };
  const html = renderAgentGovernance(baseState({
    decisions: [first],
    rules: [authorization()],
    events: [event],
    selectedDecisionId: first.decisionId,
  }));

  assert.match(html, /<h4>Agent 的判断<\/h4>/);
  assert.match(html, /<h4>为什么<\/h4>/);
  assert.match(html, /<h4>对正式系统的影响<\/h4>/);
  assert.match(html, /未执行；正式任务系统没有变化/);
  assert.match(html, /Agent 判断：需要查看/);
  assert.match(html, /data-action="agent-source-open"/);
  assert.match(html, /<summary>技术详情<\/summary>/);
  assert.match(html, /<summary>事件历史 · 1<\/summary>/);
  assert.doesNotMatch(html, /<details class="agent-event-history" open>/);
  assert.match(html, /data-action="agent-feedback-quick"/);
  assert.match(html, /这条判断对吗/);
  assert.doesNotMatch(html, /data-action="agent-feedback-submit"/);
  assert.doesNotMatch(html, /撤销这条反馈|反馈并撤销/);

  const expanded = renderAgentGovernance(baseState({
    decisions: [first],
    rules: [authorization()],
    events: [event],
    selectedDecisionId: first.decisionId,
    expandedFeedbackDecisionId: first.decisionId,
    expandedFeedbackRating: "WRONG",
  }));
  assert.match(expanded, /data-action="agent-feedback-submit"/);
  assert.match(expanded, /data-field="agent-feedback-correction-type"/);
  assert.match(expanded, /data-action="agent-feedback-collapse"/);
  assert.match(expanded, /<option value="WRONG" selected>/);

  const technical = html.slice(html.indexOf("agent-technical-details"), html.indexOf("agent-technical-details") + 1200);
  assert.match(technical, /keep-ordinary/);
  assert.match(technical, /预估 Tokens/);
  assert.match(technical, /decision-1/);
});

test("rules view shows uniform mode summary and per-row pause controls", () => {
  const rules = [authorization(), authorization({ ruleId: "explicit-task", displayName: "明确任务" })];
  const html = renderAgentGovernance(baseState({ view: "rules", decisions: [decision()], rules, selectedDecisionIds: [] }));
  assert.match(html, /全部规则当前处于观察模式/);
  assert.match(html, /当前规则版本 1.0/);
  assert.match(html, /明确任务/);
  assert.match(html, /1 条决策/);
  assert.match(html, /data-action="agent-rule-pause"/);
  assert.doesNotMatch(html, /当前：观察模式 · /);
  assert.match(html, /规则详情/);
  assert.match(html, /Rule ID/);
  assert.doesNotMatch(html, /agent-decision-list/);
});

test("review view user-izes signals and merges export behind one entry", () => {
  const html = renderAgentGovernance(baseState({ view: "review", signals: [signal()], selectedDecisionIds: [] }));
  assert.match(html, /可能值得以后复盘/);
  assert.match(html, /稍后再看/);
  assert.match(html, /过去 60 天出现 1 次/);
  assert.match(html, /相关主题：意图尚不明确/);
  assert.match(html, /data-action="agent-export-menu-toggle"/);
  assert.doesNotMatch(html, /data-field="agentExportType"/);
  assert.doesNotMatch(html, /导出 60 天复查证据/);
  assert.doesNotMatch(html, /导出 180 天复查证据/);

  const open = renderAgentGovernance(baseState({ view: "review", signals: [signal()], exportMenuOpen: true, selectedDecisionIds: [] }));
  assert.match(open, /data-field="agentExportType"/);
  assert.match(open, /data-field="agentExportRange"/);
  assert.match(open, /data-action="agent-export-go"/);
});

test("governance view has bounded loading, failure and empty states", () => {
  const base = { mode: "EXPERIMENT" as const, automaticWritesPaused: true, observationEnabled: true, expandedContextEnabled: true, globalWritesPaused: false, view: "decisions" as const, range: "24h" as const, decisionFilter: "ALL" as const, decisionSearch: "", decisions: [], rules: [], signals: [], events: [], selectedDecisionIds: [], batchMode: false, settingsOpen: false, exportMenuOpen: false, now: observedAt };
  assert.match(renderAgentGovernance({ status: "loading", ...base }), /正在读取决策记录/);
  assert.match(renderAgentGovernance({ status: "error", error: "SERVICE_DOWN", ...base }), /不能读取 Agent 治理数据/);
  const empty = renderAgentGovernance({ status: "ready", ...base });
  assert.match(empty, /尚无决策记录/);
  assert.doesNotMatch(empty, /data-action="agent-export-skill"/);
  assert.match(empty, /data-action="agent-governance-batch"/);
});

test("governance stays under More and renders through the existing plugin shell", () => {
  const uiBase: UiModel = {
    workspace: "more",
    agent: { enabled: false, providerId: "no-agent" },
    now: { goal: "开始行动并处理高价值注意项", items: [], hidden: ["完整历史", "已结束对象", "内部属性", "低价值关联"] },
    objects: [], proposals: [], commits: [], events: [], signalsByObject: {}, proposalImpacts: {},
    auditProjection: { anchorConflicts: [], undoableCommitIds: [] }, reentryProjects: [],
  };
  const more = renderApp(uiBase);
  assert.match(more, /data-action="view" data-value="governance"[^>]*>打开 Agent 治理/);
  assert.doesNotMatch(more.match(/<nav aria-label="主要工作区">([\s\S]*?)<\/nav>/)?.[1] ?? "", /data-value="governance"/);

  const governance = renderApp({
    ...uiBase,
    workspace: "governance",
    agentGovernance: baseState({ decisions: [], rules: [], selectedDecisionIds: [] }),
  });
  assert.match(governance, /data-workspace="governance"/);
  assert.match(governance, /aria-label="更多区域"/);
  assert.match(governance, /Agent Decision Governance/);
  assert.match(governance, /role="tablist"/);
});
