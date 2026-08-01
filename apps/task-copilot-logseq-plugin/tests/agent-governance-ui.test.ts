import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDecision, AgentDecisionEvent, AgentReviewSignal, AgentRuleAuthorization } from "@task-copilot/domain";

import { projectAgentGovernanceDashboard, renderAgentGovernance } from "../src/agent-governance-ui.ts";
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

test("governance dashboard is exception-first and exposes honest run boundaries", () => {
  const ordinary = decision();
  const failed = decision({
    decisionId: "decision-failed",
    threadId: "thread-failed",
    outcome: "NEEDS_HUMAN",
    executionStatus: "FAILED",
    counterSignals: ["可能指向多个对象"],
    updatedAt: "2026-08-02T07:30:00.000Z",
  });
  const dashboard = projectAgentGovernanceDashboard({ decisions: [ordinary, failed], rules: [authorization()], signals: [], now: observedAt });

  assert.equal(dashboard.decisions[0]?.decisionId, "decision-failed");
  assert.deepEqual(dashboard.metrics, { handled24h: 2, handled7d: 2, automatic: 0, humanNeeded: 1, failed: 1, sampled: 0 });

  const html = renderAgentGovernance({
    status: "ready",
    mode: "EXPERIMENT",
    automaticWritesPaused: true,
    globalWritesPaused: false,
    decisionFilter: "ALL",
    decisionSearch: "",
    decisions: [ordinary, failed],
    rules: [authorization()],
    signals: [],
    events: [],
    selectedDecisionIds: [],
    now: observedAt,
  });
  assert.match(html, /观察模式/);
  assert.match(html, /自动写入已关闭/);
  assert.match(html, /需要人工/);
  assert.match(html, /执行失败/);
  assert.ok(html.indexOf("decision-failed") < html.indexOf("decision-1"));
  assert.doesNotMatch(html, /撤销这条反馈|反馈并撤销/);
});

test("governance filters, searches, and exposes recoverable rule/global pause controls", () => {
  const ordinary = decision({ decisionId: "decision-ordinary", evidenceSummary: "普通记录无需处理" });
  const failed = decision({ decisionId: "decision-failed", threadId: "thread-failed", outcome: "NEEDS_HUMAN", executionStatus: "FAILED", evidenceSummary: "告警来源需要人工判断" });
  const html = renderAgentGovernance({
    status: "ready", mode: "EXPERIMENT", automaticWritesPaused: true, globalWritesPaused: true,
    decisionFilter: "FAILED", decisionSearch: "告警", decisions: [ordinary, failed], rules: [authorization()], signals: [], events: [], selectedDecisionIds: [], now: observedAt,
  });
  assert.match(html, /全部 Agent 写入已暂停/);
  assert.match(html, /data-action="agent-global-pause" data-value="resume"/);
  assert.match(html, /data-field="agentDecisionFilter"/);
  assert.match(html, /data-field="agentDecisionSearch"/);
  assert.match(html, /decision-failed/);
  assert.doesNotMatch(html, /decision-ordinary/);
  assert.match(html, /data-action="agent-rule-pause"/);
});

test("selected decision shows evidence, event history, single feedback and compatible bulk controls", () => {
  const first = decision();
  const second = decision({ decisionId: "decision-2", threadId: "thread-2", sourceRoot: { kind: "BLOCK", externalId: "block-2", durableOrigin: { kind: "BLOCK_UUID", value: "block-2" } } });
  const event: AgentDecisionEvent = {
    eventId: "event-1",
    threadId: first.threadId,
    decisionId: first.decisionId,
    eventType: "SOURCE_OBSERVED",
    actor: "AGENT",
    payload: {},
    occurredAt: observedAt,
  };
  const signal: AgentReviewSignal = {
    reviewSignalId: "signal-1",
    graphId: "graph-private",
    sourceRoot: first.sourceRoot,
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
    createdByDecisionId: first.decisionId,
  };

  const html = renderAgentGovernance({
    status: "ready",
    mode: "EXPERIMENT",
    automaticWritesPaused: true,
    globalWritesPaused: false,
    decisionFilter: "ALL",
    decisionSearch: "",
    decisions: [first, second],
    rules: [authorization()],
    signals: [signal],
    events: [event],
    selectedDecisionId: first.decisionId,
    selectedDecisionIds: [first.decisionId, second.decisionId],
    now: observedAt,
  });
  for (const label of ["判断依据", "反向信号", "最接近的备选", "Skill 1.0.0", "事件历史", "记录反馈", "批量反馈"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /data-action="agent-feedback-submit"/);
  assert.match(html, /data-action="agent-bulk-feedback-submit"/);
  assert.match(html, /data-action="agent-source-open"/);
  assert.match(html, /将兼容决策分组提交/);
  assert.match(html, /复记、写入或上下文不兼容时不会强行合并/);
});

test("governance view has bounded loading, failure, empty and export states", () => {
  const state = { mode: "EXPERIMENT" as const, automaticWritesPaused: true, globalWritesPaused: false, decisionFilter: "ALL" as const, decisionSearch: "", decisions: [], rules: [], signals: [], events: [], selectedDecisionIds: [], now: observedAt };
  assert.match(renderAgentGovernance({ status: "loading", ...state }), /正在读取决策记录/);
  assert.match(renderAgentGovernance({ status: "error", error: "SERVICE_DOWN", ...state }), /不能读取 Agent 治理数据/);
  const empty = renderAgentGovernance({ status: "ready", ...state });
  assert.match(empty, /尚无决策记录/);
  assert.match(empty, /data-action="agent-export-skill"/);
  assert.match(empty, /data-action="agent-export-review"/);
  assert.match(empty, /导出 60 天复查证据/);
  assert.match(empty, /导出 180 天复查证据/);
});

test("governance stays under More and renders through the existing plugin shell", () => {
  const base: UiModel = {
    workspace: "more",
    agent: { enabled: false, providerId: "no-agent" },
    now: { goal: "开始行动并处理高价值注意项", items: [], hidden: ["完整历史", "已结束对象", "内部属性", "低价值关联"] },
    objects: [], proposals: [], commits: [], events: [], signalsByObject: {}, proposalImpacts: {},
    auditProjection: { anchorConflicts: [], undoableCommitIds: [] }, reentryProjects: [],
  };
  const more = renderApp(base);
  assert.match(more, /data-action="view" data-value="governance"[^>]*>打开 Agent 治理/);
  assert.doesNotMatch(more.match(/<nav aria-label="主要工作区">([\s\S]*?)<\/nav>/)?.[1] ?? "", /data-value="governance"/);

  const governance = renderApp({
    ...base,
    workspace: "governance",
    agentGovernance: { status: "ready", mode: "EXPERIMENT", automaticWritesPaused: true, globalWritesPaused: false, decisionFilter: "ALL", decisionSearch: "", decisions: [], rules: [], signals: [], events: [], selectedDecisionIds: [], now: observedAt },
  });
  assert.match(governance, /data-workspace="governance"/);
  assert.match(governance, /aria-label="更多区域"/);
  assert.match(governance, /Agent Decision Governance/);
});
