import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { renderApp, type UiModel } from "../src/ui.ts";

function model(): UiModel {
  return {
    workspace: "objects",
    agent: { enabled: false, providerId: "no-agent" },
    inbox: [],
    now: { goal: "开始行动并处理高价值注意项", items: [], hidden: ["完整历史", "已结束对象", "内部属性", "低价值关联"] },
    objects: [],
    proposals: [],
    commits: [],
    events: [],
    signalsByObject: {},
    proposalImpacts: {},
    auditProjection: { anchorConflicts: [], undoableCommitIds: [] },
    reentryProjects: [],
  };
}

test("shell exposes restrained core workspaces and no-agent degradation", () => {
  const html = renderApp(model());
  for (const label of ["Inbox", "现在工作", "对象", "Proposal Review", "Project 重入", "审计与恢复"]) assert.match(html, new RegExp(label));
  assert.match(html, /Agent disabled/);
  assert.match(html, /基础事务系统可用/);
});

test("Project workspace exposes one in-context V2 creation form gated by Local Service readiness", () => {
  const unavailable = renderApp(model());
  assert.match(unavailable, /V2 · Project 原子创建/);
  assert.match(unavailable, /data-field="v2ProjectName"[^>]*disabled/);
  assert.match(unavailable, /data-action="create-v2-project"[^>]*disabled/);
  const available = model();
  available.v2ProjectCreationAvailable = true;
  const html = renderApp(available);
  assert.match(html, /data-field="v2ProjectName" placeholder="例如：告警推送治理">/);
  assert.match(html, /data-action="create-v2-project"/);
  assert.doesNotMatch(html, /data-action="create-v2-project"[^>]*disabled/);
});

test("V2 Project workspace reads formal objects without mapping Lifecycle back to V1 Phase", () => {
  const value = model();
  value.v2ProjectCreationAvailable = true;
  value.v2Objects = [{
    objectId: "project-1",
    objectType: "PROJECT",
    version: 2,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "告警推送治理",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
    sourceOrCreationEvent: "project_page:graph:page",
  }];
  const html = renderApp(value);
  assert.match(html, /告警推送治理/);
  assert.match(html, /PROJECT · OPEN · ACTIONABLE · v2/);
  assert.doesNotMatch(html, /还没有正式对象/);
  assert.doesNotMatch(html, /PROJECT · ACTIVE · ACTIONABLE/);
});

test("V2 Now Work renders only non-empty explainable regions without scores or button walls", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = { generatedAt: "2026-07-20T12:00:00.000Z", focus: [], waitingReview: [], conditionOptions: [], next: [{ objectId: "task-next", objectType: "TASK", version: 2, text: "核对告警", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-20T11:00:00.000Z", reason: "近期建立，可直接推进", primaryAnchorExternalId: "block-next" }] };
  const html = renderApp(value);
  assert.match(html, /接下来值得处理/);
  assert.match(html, /近期建立，可直接推进/);
  assert.doesNotMatch(html, /当前关注/);
  assert.doesNotMatch(html, /等待与复查/);
  assert.doesNotMatch(html, /score|健康分|风险分/);
  assert.match(html, /data-action="v2-open-primary-anchor" data-value="block-next"/);
  assert.match(html, /data-action="v2-focus-add" data-value="task-next\|2"/);
  assert.match(html, /data-action="v2-condition-open" data-value="task-next\|2"/);
});

test("V2 Condition is edited in one in-context form with explicit Waiting evidence", () => {
  const value = model();
  value.v2NowWork = { generatedAt: "2026-07-20T12:00:00.000Z", focus: [], next: [], waitingReview: [], conditionOptions: [{ objectId: "blocker-task", objectType: "TASK", text: "恢复真实事件" }] };
  value.actionDialog = { kind: "v2-condition", value: "task-next|2" };
  const html = renderApp(value);
  assert.match(html, /Condition 与 Lifecycle、Focus 分离/);
  for (const field of ["v2ConditionKind", "v2WaitingFor", "v2ExpectedResult", "v2ConditionReason", "v2BlockerObjectId", "v2ConditionReviewAt"]) assert.match(html, new RegExp(`data-field="${field}"`));
  assert.match(html, /TASK · 恢复真实事件/);
  assert.match(html, /data-action="submit-v2-condition" data-value="task-next\|2"/);
});

test("V2 Task deadline stays an explicit no-score action in Now Work", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = { generatedAt: "2026-07-20T12:00:00.000Z", focus: [], waitingReview: [], conditionOptions: [], next: [{ objectId: "task-due", objectType: "TASK", version: 3, text: "核对期限", condition: { kind: "ACTIONABLE" }, dueAt: "2026-07-21T09:00:00.000Z", updatedAt: "2026-07-20T11:00:00.000Z", reason: "明确期限在 1 天内" }] };
  let html = renderApp(value);
  assert.match(html, /期限：/);
  assert.match(html, /data-action="v2-deadline-open" data-value="task-due\|3\|2026-07-21T09:00:00.000Z"/);
  assert.doesNotMatch(html, /score|风险分|AI 分/);
  value.actionDialog = { kind: "v2-deadline", value: "task-due|3|2026-07-21T09:00:00.000Z" };
  html = renderApp(value);
  assert.match(html, /只影响可解释排序，不产生分数/);
  assert.match(html, /data-field="v2DueAt"/);
  assert.match(html, /data-field="v2ClearDueAt"/);
  assert.match(html, /data-action="submit-v2-deadline"/);
});

test("V2 Focus exposes compact manual ordering and removal in the same Now Work context", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = {
    generatedAt: "2026-07-20T12:00:00.000Z", next: [], waitingReview: [], conditionOptions: [],
    focus: [
      { objectId: "task-a", objectType: "TASK", version: 1, text: "先处理", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-20T11:00:00.000Z", reason: "已加入当前关注" },
      { objectId: "task-b", objectType: "TASK", version: 3, text: "后处理", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-20T10:00:00.000Z", reason: "已加入当前关注" },
    ],
  };
  const html = renderApp(value);
  assert.match(html, /data-action="v2-focus-up" data-value="task-a"[^>]*disabled/);
  assert.match(html, /data-action="v2-focus-down" data-value="task-b"[^>]*disabled/);
  assert.match(html, /data-action="v2-focus-remove" data-value="task-b\|3"/);
});

test("a Waiting projection already in Focus does not offer a duplicate Focus action", () => {
  const value = model();
  value.workspace = "now";
  const item = { objectId: "task-wait", objectType: "TASK" as const, version: 2, text: "等待样本", condition: { kind: "WAITING" as const, waitingFor: "外部事件", expectedResult: "样本", reviewAt: "2026-07-21T01:00:00.000Z" }, updatedAt: "2026-07-20T10:00:00.000Z", reason: "当前关注正在等待 · 外部事件" };
  value.v2NowWork = { generatedAt: "2026-07-20T12:00:00.000Z", focus: [item], next: [], waitingReview: [item], conditionOptions: [] };
  const html = renderApp(value);
  assert.match(html, /已在当前关注/);
  assert.doesNotMatch(html, /data-action="v2-focus-add"/);
});

test("V2 Now Work type filtering and grouping stay view-only and protect full Focus ordering", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = {
    generatedAt: "2026-07-20T12:00:00.000Z", waitingReview: [], conditionOptions: [],
    focus: [{ objectId: "project-a", objectType: "PROJECT", version: 1, text: "治理告警", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-20T11:00:00.000Z", reason: "已加入当前关注" }],
    next: [{ objectId: "task-a", objectType: "TASK", version: 2, text: "核对事件", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-20T10:00:00.000Z", reason: "近期更新，可继续推进" }],
  };
  value.v2NowWorkTypeFilter = "TASK";
  value.v2NowWorkGrouping = "type";
  const html = renderApp(value);
  assert.match(html, /aria-label="Now Work 筛选与分组"/);
  assert.match(html, /data-action="v2-now-filter" data-value="TASK"/);
  assert.match(html, /data-action="v2-now-grouping" data-value="type"/);
  assert.match(html, /<h3>Task<\/h3>/);
  assert.match(html, /核对事件/);
  assert.doesNotMatch(html, /治理告警/);
  assert.doesNotMatch(html, /data-action="v2-focus-(?:up|down)"/);
  assert.match(html, /筛选不会改变正式状态/);
});

test("Review Center owns manual current-page candidate discovery instead of Diagnostics", () => {
  const value = model();
  value.workspace = "review";
  value.v2CandidatePanel = { status: "idle" };
  value.v2CandidateAvailable = true;
  const html = renderApp(value);
  assert.match(html, /待整理 · 当前页/);
  assert.match(html, /显式对象候选/);
  assert.match(html, /data-action="v2-candidate-open"/);
  assert.match(html, /不扫描全 Graph/);
  assert.match(html, /data-action="review-mode" data-value="candidates"/);
  assert.match(html, /data-action="review-mode" data-value="proposals"/);
});

test("object drawer does not render empty optional sections", () => {
  const value = model();
  value.objects = [
    {
      objectId: "obj_1",
      objectType: "TASK",
      version: 1,
      phase: "CLARIFY",
      condition: { kind: "ACTIONABLE" },
      text: "确认服务恢复",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
      lastMeaningfulEventAt: "2026-07-17T00:00:00.000Z",
      sourceOrCreationEvent: "event_1",
    },
  ];
  value.selectedObjectDetail = { object: value.objects[0]!, anchors: [], signals: [], recentEvents: [] };
  const html = renderApp(value);
  assert.doesNotMatch(html, /<h3>完成标准<\/h3>/);
  assert.doesNotMatch(html, /<h3>等待<\/h3>/);
  assert.doesNotMatch(html, /<h3>阻塞<\/h3>/);
  for (const action of ["edit-object", "open-object", "set-owner", "view-audit"]) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.match(html, /data-action="advance-phase" data-value="obj_1\|READY\|TASK\|CLARIFY">进入 READY<\/button>/);
  assert.match(html, /data-action="advance-phase" data-value="obj_1\|CANCELLED\|TASK\|CLARIFY">进入 CANCELLED<\/button>/);
  assert.doesNotMatch(html, />推进 Phase<\/button>/);
});

test("Inbox and Proposal Review expose the complete manual and partial-review controls", () => {
  const value = model();
  value.workspace = "inbox";
  value.inbox = [{
    captureId: "cap_1", phase: "NEW", originalText: "原始输入", sourceAnchorId: "anc_1", captureMethod: "CURRENT_BLOCK",
    capturedAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z", resolvedObjectIds: [],
  }];
  let html = renderApp(value);
  for (const action of ["open-source", "manual-formalize", "create-manual-proposal", "link-existing-object", "defer", "no-action"]) {
    assert.match(html, new RegExp(`data-action="${action}"`));
  }
  assert.match(html, /type="button"/);
  value.inbox[0]!.sourcePage = "19";
  value.inboxDialog = { captureId: "cap_1", kind: "formalize" };
  value.inboxActionStates = { "manual-formalize:cap_1": { status: "error", correlationId: "TC-20260718-test", message: "failed" } };
  html = renderApp(value);
  assert.doesNotMatch(html, /来源：19/);
  assert.match(html, /来源：未知来源/);
  assert.match(html, /submit-formalize/);
  assert.match(html, /<option>AREA<\/option>/);
  assert.match(html, /data-field="ownerConfirmed"/);
  assert.match(html, /单独确认这项高影响变化/);
  assert.match(html, /诊断 ID：TC-20260718-test/);
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.proposals = [{
    proposalId: "prop_1", sourceAnchorIds: ["anc_1"], sourceObjectIds: [], summary: "手工建议", facts: ["原文"], assumptions: [], uncertainties: [],
    operations: [{ operationId: "op_1", operationType: "rewrite_content", target: { kind: "CAPTURE", id: "cap_1" }, payload: { text: "建议正文" }, preconditions: [], dependencies: [], riskLevel: "MEDIUM", ruleRefs: ["REV-PART-001"], rationale: "用户建议", confidence: 1, status: "PROPOSED" }],
    generatedAt: "2026-07-17T00:00:00.000Z", providerId: "manual-user", providerVersion: "1", ruleVersion: "v1", status: "OPEN",
  }];
  value.proposalImpacts.prop_1 = {
    executable: 1, blocked: 0, pending: 0, rejected: 0, effects: ["改写正文"], affectedObjects: [], affectedViews: ["Audit / Recovery"],
    affectedFiles: ["Logseq Block graph / block"], downstream: [], validationErrors: [], commitReady: true,
  };
  html = renderApp(value);
  assert.match(html, /建议正文/);
  assert.match(html, /readable-diff/);
  assert.match(html, /最终影响预览/);
  for (const action of ["review-accept", "review-reject", "review-edit", "review-defer", "reject-proposal", "commit-proposal"]) {
    assert.match(html, new RegExp(`data-action="${action}"`));
  }
});

test("V2 Review shows text and semantic Diff while making accepted-not-applied explicit", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Proposals = [{
    updatedAt: "2026-07-20T12:00:01.000Z",
    files: { proposalMd: "# 正式化", proposalJson: "{}" },
    proposal: {
      proposalId: "prop_v2", schemaVersion: "v2", title: "正式化告警", context: "当前普通正文。", understanding: "建议 Task。", objective: "建立对象。", logic: "正文语义一起提交。", finalPreview: "[任务] 告警", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-v2", version: 1, hash: "11111111" }] }, preconditions: [],
      groups: [{ groupId: "formalize", explanation: "不可拆组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-v2", beforeText: "告警", afterText: "[任务] 告警", beforeHash: "11111111", afterHash: "22222222" }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-v2" }, summary: "创建 Task 与 Anchor", payload: {}, preconditions: [] }], disposition: "PENDING" }],
      status: "READY", createdAt: "2026-07-20T12:00:00.000Z",
    },
  }];
  let html = renderApp(value);
  assert.match(html, /最终可读预览/);
  assert.match(html, /语义 Diff/);
  for (const action of ["v2-review-accept", "v2-review-reject", "v2-review-defer"]) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.match(html, /审阅决定只更新 Proposal；尚未修改正式正文或对象/);
  value.v2Proposals[0]!.proposal.status = "ACCEPTED";
  value.v2Proposals[0]!.proposal.groups[0]!.disposition = "ACCEPTED";
  html = renderApp(value);
  assert.match(html, /已接受的语义组尚未正式生效/);
  assert.match(html, /显示 Undo/);
  assert.match(html, /data-action="v2-proposal-revalidate"/);
  assert.match(html, /data-action="v2-proposal-commit"/);
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:abc", proposalId: "prop_v2", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "now", updatedAt: "now" }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-proposal-undo"/);
  assert.match(html, /已正式生效/);
});

test("object and high-impact actions render in-plugin forms instead of browser modals", () => {
  const value = model();
  value.objects = [{
    objectId: "obj_project", objectType: "PROJECT", version: 2, phase: "DEFINING", condition: { kind: "ACTIONABLE" }, text: "Runtime project",
    createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z", lastMeaningfulEventAt: "2026-07-19T00:00:00.000Z", sourceOrCreationEvent: "event_project",
  }, {
    objectId: "obj_area", objectType: "AREA", version: 1, phase: "ACTIVE", condition: { kind: "ACTIONABLE" }, text: "Responsibility area",
    createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z", lastMeaningfulEventAt: "2026-07-19T00:00:00.000Z", sourceOrCreationEvent: "event_area",
  }];
  value.actionDialog = { kind: "set-owner", value: "obj_project" };
  let html = renderApp(value);
  assert.match(html, /aria-label="设置主归属"/);
  assert.match(html, /data-field="ownerObjectId"/);
  assert.match(html, /value="obj_area"/);
  assert.match(html, /data-field="highImpactConfirmed"/);
  assert.match(html, /data-action="submit-set-owner"/);

  value.actionDialog = { kind: "condition-waiting", value: "obj_project" };
  html = renderApp(value);
  for (const field of ["waitingFor", "expectedResult", "conditionReviewAt"]) assert.match(html, new RegExp(`data-field="${field}"`));
  assert.match(html, /data-action="submit-condition"/);

  value.actionDialog = { kind: "confirm-review-accept", value: "prop_1|op_1" };
  html = renderApp(value);
  assert.match(html, /接受高影响操作/);
  assert.match(html, /data-field="actionConfirmed"/);
  assert.match(html, /data-action="submit-review-accept"/);
});

test("formal plugin entry does not regress to host browser prompts", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /window\.(?:prompt|confirm)\s*\(/);
  for (const kind of ["edit-object", "set-owner", "confirm-review-accept", "confirm-phase", "confirm-rebind", "confirm-undo"]) {
    assert.match(source, new RegExp(`openActionDialog\\("${kind}"`));
  }
});

test("formal V2 plugin entry keeps the writable V1 FileStorage runtime inactive", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /repository\s*=\s*new VersionedStateRepository/);
  assert.doesNotMatch(source, /blobStore\s*=\s*new LogseqFileStorageBlobStore/);
  assert.match(source, /V1 FileStorage inactive/);
  for (const token of [
    "v2-now-filter",
    "v2-now-grouping",
    "v2-candidate-open",
    "v2-candidate-submit",
    "prepareV2ExplicitCandidateDiscovery",
    "submitV2ExplicitCandidate",
    "v2-rebind-open",
    "v2-rebind-submit",
    "prepareV2PrimaryAnchorRebind",
    "submitV2PrimaryAnchorRebind",
  ]) {
    assert.match(source, new RegExp(token));
  }
  assert.match(source, /serviceRuntimeClient = undefined;[\s\S]*SERVICE_DISCOVERY_IN_PROGRESS[\s\S]*explicitSyncController\?\.pause\(\)/);
  assert.match(source, /Local Service 正在重连或已不可写；旧预览已作废/);
  assert.match(source, /Primary Anchor 预览已过期或不存在；没有执行重新绑定/);
  assert.ok(
    source.indexOf('if (action === "v2-rebind-open")') < source.indexOf("const taskCopilot = requireTaskCopilot();"),
    "V2 Anchor recovery must remain available without activating the frozen V1 runtime",
  );
  assert.ok(
    source.indexOf('if (action === "v2-candidate-open")') < source.indexOf("const taskCopilot = requireTaskCopilot();"),
    "V2 explicit candidate discovery must remain available without activating the frozen V1 runtime",
  );
});
