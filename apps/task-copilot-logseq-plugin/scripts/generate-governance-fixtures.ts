/**
 * Generate static Agent Governance fixture pages for responsive checks and
 * Light/Dark screenshots. Representative fixture data only; never real Shadow
 * decisions. Output: tmp/runtime/agent-governance-interface-simplification/fixtures/
 *
 * Usage (Node 20): npx tsx scripts/generate-governance-fixtures.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentDecision, AgentReviewSignal, AgentRuleAuthorization } from "@task-copilot/domain";
import { renderAgentGovernance, type AgentGovernanceUiState } from "../src/agent-governance-ui.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const outputRoot = resolve(appRoot, "../../tmp/runtime/agent-governance-interface-simplification/fixtures");

const observedAt = "2026-08-02T08:00:00.000Z";

function decision(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    graphId: "graph-fixture",
    sourceRoot: { kind: "BLOCK", externalId: "block-fixture-1", pageName: "整理 RHCSA 容器题", durableOrigin: { kind: "BLOCK_UUID", value: "block-fixture-1" } },
    sourceSnapshotHash: "a".repeat(64),
    outcome: "KEEP_ORDINARY",
    rule: { id: "keep-ordinary", displayName: "保持普通内容", skillName: "agent-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
    riskRoute: "SHADOW",
    executionStatus: "NOT_EXECUTED",
    evidenceSummary: "这是一条不需要正式管理的随手记录，保留原样即可。",
    evidenceRefs: ["block:block-fixture-1"],
    counterSignals: [],
    closestAlternative: { outcome: "CREATE_CANDIDATE", reason: "如果后续出现明确行动意图。" },
    context: { tier: "LOCAL", truncated: false, omittedSections: [], estimatedInputTokens: 240 },
    threadId: "thread-fixture-1",
    decisionId: "decision-fixture-1",
    revision: 1,
    observedAt,
    createdAt: observedAt,
    updatedAt: observedAt,
    ...overrides,
  };
}

function authorization(overrides: Partial<AgentRuleAuthorization> = {}): AgentRuleAuthorization {
  return {
    ruleId: "explicit-task-01",
    displayName: "明确任务",
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
    reviewSignalId: "signal-fixture-1",
    graphId: "graph-fixture",
    sourceRoot: decision().sourceRoot,
    capturedSnapshotHash: "c".repeat(64),
    capturedText: "也许需要重新看看 CP4 的修订链路",
    category: "weak-intent",
    relatedObjectIds: [],
    revisitReason: "同一来源反复出现相似内容",
    firstSeenAt: "2026-06-03T08:00:00.000Z",
    lastSeenAt: observedAt,
    occurrenceCount: 6,
    retentionClass: "NORMAL",
    status: "ACTIVE",
    createdByDecisionId: "decision-fixture-1",
    ...overrides,
  };
}

const rules: AgentRuleAuthorization[] = [
  authorization({ ruleId: "explicit-task-01", displayName: "明确任务" }),
  authorization({ ruleId: "worksite-change-01", displayName: "工作区变化" }),
  authorization({ ruleId: "ordinary-source-01", displayName: "普通来源" }),
  authorization({ ruleId: "weak-signal-01", displayName: "弱信号复查" }),
  authorization({ ruleId: "multi-target-01", displayName: "多目标判断" }),
  authorization({ ruleId: "provider-reject-01", displayName: "输出校验" }),
];

const defaultDecisions: AgentDecision[] = [
  decision({
    decisionId: "decision-fixture-needs-human",
    threadId: "thread-fixture-rejected",
    outcome: "NEEDS_HUMAN",
    riskRoute: "HUMAN_REVIEW",
    executionStatus: "NOT_EXECUTED",
    sourceRoot: { kind: "BLOCK", externalId: "block-fixture-2", pageName: "RHCSA 模拟考试复盘", durableOrigin: { kind: "BLOCK_UUID", value: "block-fixture-2" } },
    evidenceSummary: "模型返回的结果没有通过结构校验，系统无法可靠确认它的真实意图。",
    counterSignals: ["目标对象无法由现有证据唯一确定"],
    updatedAt: "2026-08-02T07:30:00.000Z",
    rule: { id: "provider-reject-01", displayName: "输出校验", skillName: "agent-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
  }),
  decision({
    decisionId: "decision-fixture-explicit",
    threadId: "thread-fixture-explicit",
    outcome: "CREATE_OBJECT",
    riskRoute: "SHADOW",
    executionStatus: "NOT_EXECUTED",
    sourceRoot: { kind: "BLOCK", externalId: "block-fixture-3", pageName: "整理 RHCSA 容器题", durableOrigin: { kind: "BLOCK_UUID", value: "block-fixture-3" } },
    evidenceSummary: "来源明确表达了创建正式任务的意图，建议建立 Task 对象。",
    rule: { id: "explicit-task-01", displayName: "明确任务", skillName: "agent-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
    updatedAt: "2026-08-02T07:10:00.000Z",
  }),
  decision({
    decisionId: "decision-fixture-weak",
    threadId: "thread-fixture-weak",
    outcome: "REVIEW_SIGNAL",
    riskRoute: "SHADOW",
    executionStatus: "NOT_EXECUTED",
    sourceRoot: { kind: "BLOCK", externalId: "block-fixture-4", pageName: "CP4 运行记录", durableOrigin: { kind: "BLOCK_UUID", value: "block-fixture-4" } },
    evidenceSummary: "同一来源反复出现相似内容，先记入复盘线索。",
    rule: { id: "weak-signal-01", displayName: "弱信号复查", skillName: "agent-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
    updatedAt: "2026-08-02T06:40:00.000Z",
  }),
  decision({
    decisionId: "decision-fixture-ordinary",
    threadId: "thread-fixture-ordinary",
    sourceRoot: { kind: "BLOCK", externalId: "block-fixture-5", pageName: "今天", durableOrigin: { kind: "BLOCK_UUID", value: "block-fixture-5" } },
    updatedAt: "2026-08-01T22:10:00.000Z",
  }),
];

function denseDecisions(): AgentDecision[] {
  const names = ["RHCSA 容器题", "Logseq 插件 Release", "心理解压室视频", "机器狗宣传片", "信息中心 RSS", "RHCSA 课堂记录", "任务管理中心", "V2 迁移清单", "DeepSeek 配置", "Worksite 预览", "Attention 日志", "复盘导出"];
  return names.map((name, index) => decision({
    decisionId: `decision-fixture-dense-${index}`,
    threadId: `thread-fixture-dense-${index}`,
    sourceRoot: { kind: "BLOCK", externalId: `block-fixture-dense-${index}`, pageName: `${name} 的原始记录标题可能比较长以验证换行与省略`, durableOrigin: { kind: "BLOCK_UUID", value: `block-fixture-dense-${index}` } },
    outcome: index % 5 === 0 ? "NEEDS_HUMAN" : index % 4 === 0 ? "REVIEW_SIGNAL" : index % 3 === 0 ? "CREATE_OBJECT" : "KEEP_ORDINARY",
    executionStatus: index % 7 === 0 ? "FAILED" : "NOT_EXECUTED",
    evidenceSummary: `这是第 ${index + 1} 条代表性决策摘要，用于高密度列表的可扫描性与布局验证。`,
    updatedAt: new Date(Date.parse(observedAt) - index * 37 * 60 * 1000).toISOString(),
  }));
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
    decisions: defaultDecisions,
    rules,
    signals: [signal(), signal({ reviewSignalId: "signal-fixture-2", category: "repeated-edit", capturedText: "某页面结构被反复调整", revisitReason: "结构变化频繁", occurrenceCount: 3, sourceRoot: { kind: "BLOCK", externalId: "block-fixture-6", durableOrigin: { kind: "BLOCK_UUID", value: "block-fixture-6" } } })],
    events: [{
      eventId: "event-fixture-1",
      threadId: "thread-fixture-rejected",
      decisionId: "decision-fixture-needs-human",
      eventType: "SOURCE_OBSERVED",
      actor: "AGENT",
      payload: {},
      occurredAt: observedAt,
    }],
    selectedDecisionIds: [],
    batchMode: false,
    settingsOpen: false,
    exportMenuOpen: false,
    now: observedAt,
    ...overrides,
  };
}

interface FixtureSpec {
  name: string;
  state: AgentGovernanceUiState;
  view: "decisions" | "rules" | "review";
}

const fixtures: FixtureSpec[] = [
  { name: "decisions-default", view: "decisions", state: baseState() },
  { name: "decisions-empty", view: "decisions", state: baseState({ decisions: [], signals: [], events: [] }) },
  { name: "decisions-dense", view: "decisions", state: baseState({ decisions: denseDecisions(), events: [] }) },
  { name: "decisions-abnormal", view: "decisions", state: baseState({ decisionFilter: "FAILED", decisions: defaultDecisions.filter((item) => item.decisionId === "decision-fixture-needs-human"), events: [] }) },
  { name: "decisions-detail", view: "decisions", state: baseState({ selectedDecisionId: "decision-fixture-needs-human" }) },
  { name: "decisions-detail-tech", view: "decisions", state: baseState({ selectedDecisionId: "decision-fixture-needs-human" }) },
  { name: "decisions-feedback-expanded", view: "decisions", state: baseState({ selectedDecisionId: "decision-fixture-needs-human", expandedFeedbackDecisionId: "decision-fixture-needs-human", expandedFeedbackRating: "WRONG" }) },
  { name: "decisions-batch", view: "decisions", state: baseState({ batchMode: true, selectedDecisionIds: ["decision-fixture-needs-human", "decision-fixture-explicit", "decision-fixture-weak"] }) },
  { name: "rules", view: "rules", state: baseState({}) },
  { name: "review", view: "review", state: baseState({}) },
  { name: "review-export-open", view: "review", state: baseState({ exportMenuOpen: true }) },
  { name: "settings-open", view: "decisions", state: baseState({ settingsOpen: true }) },
];

function shellHtml(theme: "light" | "dark", css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Governance Fixture (${theme})</title>
<style>html, body { margin: 0; padding: 0; } ${css}</style>
</head>
<body>
<div id="task-copilot-personal-mvp-root" data-theme-mode="${theme}">
  <section class="app-shell">
    <header class="topbar"><div><div class="eyebrow">个人事务运行系统</div><h1>Task Copilot</h1></div><div class="top-actions"><button type="button" class="primary">整理当前页</button><button type="button" class="quiet">关闭</button></div></header>
    <div class="agent-state enabled">Copilot 可用 · 建议需审阅</div>
    <nav aria-label="主要工作区"><button type="button">现在</button><button type="button">待我确认</button><button type="button" class="active">更多</button></nav>
    <main class="workspace" data-workspace="governance">
      <nav class="section-nav" aria-label="更多区域"><button type="button">更多首页</button><button type="button" class="active">Agent 治理</button><button type="button">最近修改与恢复</button><button type="button">迁移</button></nav>
      ${body}
    </main>
  </section>
</div>
<script>
(() => {
  const root = document.getElementById("task-copilot-personal-mvp-root");
  const workspace = document.querySelector('[data-workspace="governance"]');
  const overflow = Array.from(root.querySelectorAll("*")).filter((element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return element.scrollWidth > element.clientWidth + 1;
  });
  const metrics = {
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    rootScrollWidth: root.scrollWidth,
    rootClientWidth: root.clientWidth,
    workspaceScrollWidth: workspace.scrollWidth,
    workspaceClientWidth: workspace.clientWidth,
    horizontalOverflowCount: overflow.length,
  };
  const pre = document.createElement("pre");
  pre.id = "agi-metrics";
  pre.textContent = JSON.stringify(metrics);
  document.body.appendChild(pre);
})();
</script>
</body>
</html>`;
}

async function main(): Promise<void> {
  const css = await readFile(join(appRoot, "src/index.css"), "utf8");
  await mkdir(outputRoot, { recursive: true });
  const manifest: Array<{ name: string; theme: "light" | "dark"; file: string; view: FixtureSpec["view"] }> = [];
  for (const fixture of fixtures) {
    let body = renderAgentGovernance(fixture.state);
    if (fixture.name === "decisions-detail-tech") {
      body = body
        .replace('<details class="agent-technical-details"><summary>', '<details class="agent-technical-details" open><summary>')
        .replace('<details class="agent-event-history"><summary>', '<details class="agent-event-history" open><summary>');
    }
    for (const theme of ["light", "dark"] as const) {
      const name = `${fixture.name}-${theme}`;
      const file = join(outputRoot, `${name}.html`);
      await writeFile(file, shellHtml(theme, css, body));
      manifest.push({ name: fixture.name, theme, file, view: fixture.view });
    }
  }
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated ${manifest.length} fixture pages in ${outputRoot}`);
}

void main();
