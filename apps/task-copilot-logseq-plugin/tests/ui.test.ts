import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { renderApp, type UiModel } from "../src/ui.ts";

function model(): UiModel {
  return {
    workspace: "objects",
    agent: { enabled: false, providerId: "no-agent" },
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
  for (const label of ["现在工作", "对象", "Proposal Review", "Project 重入", "迁移", "审计与恢复"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /data-value="inbox"/);
  assert.match(html, /Agent disabled/);
  assert.match(html, /基础事务系统可用/);
  assert.match(html, /<nav aria-label="主要工作区">/);
  assert.match(html, /data-value="objects" aria-current="page"/);
  assert.match(html, /整理当前页/);
  assert.match(html, /data-action="v2-candidate-open"/);
  assert.doesNotMatch(html, /data-action="capture"/);
});

test("V2 audit is read-only and delegates recovery to the Local Service CLI", () => {
  const value = model();
  value.workspace = "audit";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:v2", proposalId: "proposal:v2", status: "RECOVERY_REQUIRED", beforeStateChecksum: "before-checksum", createdAt: "2026-07-22T08:00:00.000Z", updatedAt: "2026-07-22T08:01:00.000Z", errorCode: "VERIFY_FAILED" }];
  const html = renderApp(value);
  assert.match(html, /SQLite 单一权威/);
  assert.match(html, /tc backup/);
  assert.match(html, /RECOVERY_REQUIRED/);
  assert.match(html, /VERIFY_FAILED/);
  for (const action of ["export-backup", "verify-backup", "recover-pending", "scan-anchors"]) assert.doesNotMatch(html, new RegExp(`data-action="${action}"`));
});

test("V2 audit distinguishes a failed Service projection from an empty ledger", () => {
  const value = model();
  value.workspace = "audit";
  value.v2SemanticCommits = [];
  value.v2AuditLoadError = "service unavailable";
  const html = renderApp(value);
  assert.match(html, /SemanticCommit 投影不可用/);
  assert.match(html, /service unavailable/);
  assert.doesNotMatch(html, /还没有 V2 SemanticCommit/);
});

test("Project reentry is projected from V2 objects, ownership, associations, and Now Work", () => {
  const value = model();
  value.workspace = "reentry";
  value.v2Objects = [
    { objectId: "project_1", objectType: "PROJECT", version: 3, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "发布 V2", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T01:00:00.000Z", sourceOrCreationEvent: "event_1" },
    { objectId: "task_1", objectType: "TASK", version: 1, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "完成发布审计", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T01:00:00.000Z", sourceOrCreationEvent: "event_2" },
    { objectId: "output_1", objectType: "OUTPUT", version: 1, lifecycle: "COMPLETED", condition: { kind: "ACTIONABLE" }, text: "验收报告", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T01:00:00.000Z", sourceOrCreationEvent: "event_3" },
  ];
  value.v2PrimaryOwnerships = [{ ownerObjectId: "project_1", childObjectId: "task_1", assignedAt: "2026-07-22T01:00:00.000Z" }];
  value.v2Associations = [{ associationId: "rel_1", sourceObjectId: "project_1", targetObjectId: "output_1", associationKind: "RELATED", status: "ACTIVE", createdAt: "2026-07-22T01:00:00.000Z", updatedAt: "2026-07-22T01:00:00.000Z" }];
  value.v2NowWork = {
    generatedAt: "2026-07-22T01:00:00.000Z",
    focus: [],
    next: [{ objectId: "project_1", objectType: "PROJECT", version: 3, text: "发布 V2", condition: { kind: "ACTIONABLE" }, updatedAt: "2026-07-22T01:00:00.000Z", reason: "下一步：完成发布审计", primaryAnchorExternalId: "block-project" }],
    waitingReview: [],
    conditionOptions: [],
  };
  const html = renderApp(value);
  assert.match(html, /V2 SQLite 实时投影/);
  assert.match(html, /发布 V2/);
  assert.match(html, /当前主归属对象[\s\S]*完成发布审计/);
  assert.match(html, /相关对象[\s\S]*验收报告/);
  assert.match(html, /下一步：完成发布审计/);
  for (const action of ["v2-open-primary-anchor", "v2-condition-open", "v2-focus-add"]) assert.match(html, new RegExp(`data-action="${action}"`));
});

test("Migration workspace projects the Service ledger without accepting bundle content or direct writes", () => {
  const value = model();
  value.workspace = "migration";
  value.v2MigrationRuns = [{
    runId: "migration-run:abc", sourceBundleSha256: "a".repeat(64), sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    status: "IMPORTING", summary: { total: 3, import: 2, keepOrdinary: 0, defer: 1, exclude: 0 }, snapshotBackupId: "backup_20260721080000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    createdAt: "2026-07-21T08:00:00.000Z", updatedAt: "2026-07-21T09:00:00.000Z",
  }];
  const html = renderApp(value);
  assert.match(html, /V1 → V2 迁移/);
  assert.match(html, /IMPORTING/);
  assert.match(html, /3 项已审阅 · 2 项导入 · 1 项暂缓/);
  assert.match(html, /Service 重启后可继续/);
  assert.match(html, /backup_20260721080000000/);
  assert.doesNotMatch(html, /textarea|type="file"|data-action="migration-(?:import|activate|undo)"/);
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

test("Area workspace exposes controlled creation and versioned edit without inventing a Graph page", () => {
  const unavailable = renderApp(model());
  assert.match(unavailable, /V2 · Area 受控入口/);
  assert.match(unavailable, /data-field="v2AreaText"[^>]*disabled/);
  assert.match(unavailable, /data-action="create-v2-area"[^>]*disabled/);

  const value = model();
  value.v2AreaAvailable = true;
  value.v2Objects = [{ objectId: "area-health", objectType: "AREA", version: 2, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "健康管理", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "controlled_area_entry" }];
  let html = renderApp(value);
  assert.match(html, /data-field="v2AreaText" placeholder="例如：维持稳定作息与健康检查">/);
  assert.match(html, /data-action="v2-area-edit-open" data-value="area-health\|2"/);
  assert.doesNotMatch(html, /Area\//);

  value.actionDialog = { kind: "v2-area-edit", value: "area-health|2" };
  html = renderApp(value);
  assert.match(html, /aria-label="编辑 Area 责任描述"/);
  assert.match(html, /data-field="v2AreaEditText">\s*健康管理/);
  assert.match(html, /data-action="submit-v2-area-edit" data-value="area-health\|2"/);

  value.v2AreaBusy = true;
  html = renderApp(value);
  assert.match(html, /正在保存…/);
  assert.match(html, /data-action="submit-v2-area-edit"[^>]*disabled[^>]*aria-busy="true"/);
});

test("V2 Project workspace reads formal objects without mapping Lifecycle back to V1 Phase", () => {
  const value = model();
  value.v2ProjectCreationAvailable = true;
  value.v2AssociationAvailable = true;
  value.v2Associations = [{
    associationId: "rel-project-output", sourceObjectId: "project-1", targetObjectId: "output-1", associationKind: "RELATED", status: "ACTIVE",
    createdAt: "2026-07-20T12:05:00.000Z", updatedAt: "2026-07-20T12:05:00.000Z",
  }];
  value.v2PrimaryOwnerships = [{ childObjectId: "output-1", ownerObjectId: "project-1", assignedAt: "2026-07-20T12:04:00.000Z" }];
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
  }, {
    objectId: "output-1", objectType: "OUTPUT", version: 1, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "验证记录",
    createdAt: "2026-07-20T12:00:00.000Z", updatedAt: "2026-07-20T12:00:00.000Z", sourceOrCreationEvent: "output",
  }];
  const html = renderApp(value);
  assert.match(html, /告警推送治理/);
  assert.match(html, /PROJECT · OPEN · ACTIONABLE · v2/);
  assert.doesNotMatch(html, /还没有正式对象/);
  assert.doesNotMatch(html, /PROJECT · ACTIVE · ACTIONABLE/);
  assert.match(html, /只表达“相关”，不会改变 Primary Ownership/);
  assert.match(html, /data-action="v2-association-add"/);
  assert.match(html, /data-field="v2AssociationConfirmed"/);
  assert.match(html, /PROJECT · 告警推送治理 → OUTPUT · 验证记录/);
  assert.match(html, /RELATED · ACTIVE/);
  assert.match(html, /OUTPUT · 验证记录 → PROJECT · 告警推送治理/);
  assert.match(html, /唯一主归属/);
});

test("OPEN MiniProject exposes one sidebar Closure Proposal entry and completed objects do not", () => {
  const value = model();
  value.v2Objects = [{ objectId: "mini-open", objectType: "MINI_PROJECT", version: 4, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "侧栏关闭验收", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "test" }];
  let html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-closure-propose" data-value="mini-open\|4"/);
  assert.match(html, /完成 MiniProject/);
  value.v2ClosureProposalBusy = true;
  html = renderApp(value);
  assert.match(html, /正在发起…/);
  assert.match(html, /data-action="v2-mini-project-closure-propose"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2Objects[0] = { ...value.v2Objects[0]!, lifecycle: "COMPLETED", closure: { originalGoal: "完成验收", actualResult: "已完成", remainingWork: "无遗留" } };
  value.v2ClosureProposalBusy = false;
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-mini-project-closure-propose"/);
});

test("V2 objects and Review expose reasoned cancellation and explicit reopen without generic Commit", () => {
  const value = model();
  value.v2Objects = [
    { objectId: "task-open", objectType: "TASK", version: 2, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "旧路径", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "test" },
    { objectId: "task-cancelled", objectType: "TASK", version: 3, lifecycle: "CANCELLED", condition: { kind: "ACTIONABLE" }, text: "已取消路径", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "test" },
  ];
  let html = renderApp(value);
  assert.match(html, /data-action="v2-lifecycle-propose-open" data-value="task-open\|2\|CANCEL"/);
  assert.match(html, /data-action="v2-lifecycle-propose-open" data-value="task-cancelled\|3\|REOPEN"/);
  value.actionDialog = { kind: "v2-lifecycle-reason", value: "task-open|2|CANCEL" };
  html = renderApp(value);
  assert.match(html, /data-field="v2LifecycleReason"/);
  assert.match(html, /只创建可审阅 Proposal/);

  value.workspace = "review";
  value.reviewMode = "proposals";
  delete value.actionDialog;
  value.v2Proposals = [{ updatedAt: "2026-07-22T13:00:01.000Z", files: { proposalMd: "# cancel", proposalJson: "{}" }, proposal: {
    proposalId: "prop-cancel", schemaVersion: "v2", title: "取消 Task", context: "用户发起。", understanding: "显式取消。", objective: "记录原因后取消。", logic: "版本重验后提交。", finalPreview: "取消原因：需求撤销", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "task-open", version: 2 }] }, preconditions: [],
    groups: [{ groupId: "cancel-object", explanation: "原因与取消不可拆分。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "cancel-object", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "task-open", version: 2 }, summary: "取消 Task", payload: { action: "CANCEL", lifecycle: "CANCELLED", objectType: "TASK", reason: "需求撤销" }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-22T13:00:00.000Z",
  } }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-reasoned-lifecycle-commit"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  assert.match(html, /记录原因并改变 Lifecycle，不改写 Graph/);
  value.actionDialog = { kind: "confirm-v2-reasoned-lifecycle", value: "prop-cancel|2026-07-22T13:00:01.000Z|CANCEL" };
  html = renderApp(value);
  assert.match(html, /data-action="submit-v2-reasoned-lifecycle"/);
  assert.match(html, /单一 Domain Commit/);

  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:cancel", proposalId: "prop-cancel", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "now", updatedAt: "now" }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-lifecycle-undo" data-value="proposal-commit:cancel"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  value.actionDialog = { kind: "confirm-v2-lifecycle-undo", value: "proposal-commit:cancel" };
  html = renderApp(value);
  assert.match(html, /data-action="submit-v2-lifecycle-undo"/);
  assert.match(html, /不改写正文、Anchor、Condition、Focus 或 Ownership/);
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
  assert.match(html, /role="group" aria-label="审阅中心视图"/);
  assert.match(html, /data-value="candidates" aria-pressed="true"/);
  assert.match(html, /data-value="proposals" aria-pressed="false"/);
  assert.doesNotMatch(html, /role="tablist"/);
});

test("Review Center renders persisted Candidate decisions and Proposal generation without direct formal writes", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "candidates";
  value.v2CandidatePanel = { status: "idle" };
  value.v2CandidateAvailable = true;
  value.v2Candidates = [{ candidateId: "candidate-ui", sourceAnchorId: "block-ui", sourceVersion: "7:abc12345", candidateKind: "WORK_ITEM", reason: "显式标识", suggestion: "生成 Task Proposal", disposition: "PENDING", lastAnalyzedAt: "2026-07-21T00:00:00.000Z", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:01:00.000Z" }];
  value.v2CandidateSourcePreviews = { "candidate-ui": "[任务] 核对真实原文" };
  const html = renderApp(value);
  for (const action of ["v2-candidate-formalize", "v2-candidate-update", "v2-candidate-later", "v2-candidate-dismiss", "v2-candidate-no-more"]) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.match(html, /保持普通内容/);
  assert.match(html, /以后不再提示/);
  assert.match(html, /扫描只保存 Candidate，不创建正式对象/);
  assert.ok(html.indexOf("核对真实原文") < html.indexOf("显式标识") && html.indexOf("显式标识") < html.indexOf("生成 Task Proposal"), "original content precedes reason and Agent suggestion");
});

test("Candidate update dialog selects one existing Block object and explains Proposal-only behavior", () => {
  const value = model();
  value.workspace = "review";
  value.v2Candidates = [{ candidateId: "candidate-ui", sourceAnchorId: "block-ui", sourceVersion: "7:abc12345", candidateKind: "UPDATE", reason: "补充事实", suggestion: "更新已有", disposition: "PENDING", lastAnalyzedAt: "2026-07-21T00:00:00.000Z", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:01:00.000Z" }];
  value.v2CandidateSourcePreviews = { "candidate-ui": "供应商补充" };
  value.v2Objects = [{ objectId: "task-target", objectType: "TASK", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, version: 2, text: "核对告警", sourceOrCreationEvent: "test", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z" }];
  value.actionDialog = { kind: "v2-candidate-update", value: "candidate-ui" };
  const html = renderApp(value);
  assert.match(html, /供应商补充/);
  assert.match(html, /TASK · 核对告警/);
  assert.match(html, /data-field="v2CandidateUpdateContent"/);
  assert.match(html, /只生成 Proposal/);
  assert.match(html, /data-action="submit-v2-candidate-update"/);
});

test("Review Center exposes Provider analysis only when capability is enabled and shows observable state", () => {
  const unavailable = model();
  unavailable.workspace = "review";
  unavailable.reviewMode = "candidates";
  assert.doesNotMatch(renderApp(unavailable), /v2-provider-analyze-current-block/);

  const available = model();
  available.workspace = "review";
  available.reviewMode = "candidates";
  available.v2ProviderAvailable = true;
  available.v2ProviderState = { status: "loading", message: "正在分析当前选中 Block；Logseq 正文仍可编辑。" };
  const html = renderApp(available);
  assert.match(html, /局部语义 · DeepSeek Provider/);
  assert.match(html, /data-action="v2-provider-analyze-current-block"[^>]*disabled aria-busy="true"/);
  assert.match(html, /只生成可审阅 Proposal/);
  assert.match(html, /正文仍可编辑/);
});

test("local LLM Proposal exposes one-machine revision with observable busy state", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2ProviderAvailable = true;
  value.v2Proposals = [{ updatedAt: "2026-07-22T07:01:00.000Z", files: { proposalMd: "# revise", proposalJson: "{}" }, proposal: {
    proposalId: "prop-revise", schemaVersion: "v2", title: "确认范围", context: "当前 Block。", understanding: "这是 Task。", objective: "形成对象。", logic: "局部正式化。", finalPreview: "[任务] 明天确认范围。", unresolvedQuestions: [],
    source: { kind: "local_llm", provider: "deepseek", model: "deepseek-v4-flash" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-revise", hash: "12345678" }] }, preconditions: [], status: "READY", createdAt: "2026-07-22T07:00:00.000Z",
    groups: [{ groupId: "formalize", explanation: "正式化。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], disposition: "PENDING", textPatches: [{ blockUuid: "block-revise", beforeText: "明天确认范围。", afterText: "[任务] 明天确认范围。", beforeHash: "12345678", afterHash: "87654321" }], semanticOperations: [{ operationId: "create-object", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-revise", hash: "12345678" }, summary: "创建 Task", payload: { objectType: "TASK", text: "[任务] 明天确认范围。" }, preconditions: [] }] }],
  } }];
  let html = renderApp(value);
  assert.match(html, /data-action="v2-provider-revise-open" data-value="prop-revise\|2026-07-22T07:01:00.000Z"/);
  value.actionDialog = { kind: "v2-provider-revise", value: "prop-revise|2026-07-22T07:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /data-field="v2ProviderRevisionInstruction"/);
  assert.match(html, /同一个 proposal_id、Block 和 scope/);
  assert.match(html, /data-action="submit-v2-provider-revise"/);
  value.v2ProviderRevisionBusy = true;
  html = renderApp(value);
  assert.match(html, /Agent 调整中…/);
  assert.match(html, /data-action="submit-v2-provider-revise"[^>]*disabled aria-busy="true"/);
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

test("Proposal Review exposes the complete partial-review controls", () => {
  const value = model();
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
  const html = renderApp(value);
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
      groups: [{ groupId: "formalize", explanation: "不可拆组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-v2", beforeText: "告警", afterText: "[任务] 告警", beforeHash: "11111111", afterHash: "22222222" }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-v2" }, summary: "创建 Task 与 Anchor", payload: { objectType: "TASK", text: "告警" }, preconditions: [] }], disposition: "PENDING" }],
      status: "READY", createdAt: "2026-07-20T12:00:00.000Z",
    },
  }];
  let html = renderApp(value);
  assert.match(html, /最终可读预览/);
  assert.match(html, /语义 Diff/);
  for (const action of ["v2-review-accept", "v2-review-reject", "v2-review-defer"]) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.match(html, /审阅决定只更新 Proposal；尚未修改正式正文或对象/);
  value.v2Proposals[0]!.proposal.status = "IN_REVIEW";
  value.v2Proposals[0]!.proposal.groups[0] = {
    ...value.v2Proposals[0]!.proposal.groups[0]!,
    disposition: "DEFERRED",
    deferredUntil: "2026-07-30T01:30:00.000Z",
    deferReason: "等待验收负责人确认",
  };
  html = renderApp(value);
  assert.match(html, /暂缓至 .*2026.*7.*30.*等待验收负责人确认/);
  assert.match(html, /data-action="v2-review-accept"/);
  assert.match(html, /data-action="v2-review-defer"/);
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

test("Project Closure Review shows the external Agent outcome and uses a dedicated completion confirmation", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  const closure = { originalGoal: "推送可控", actualResult: "新链路上线", majorDeliverables: ["推送服务"], incompleteObjectives: [{ objective: "历史回放", reason: "数据未齐", nextStep: "转入数据治理" }], legacyDisposition: "新 Project 承接", keyDecisions: ["保留回退"], futureSummary: "重入先查数据" };
  value.v2Proposals = [{ updatedAt: "2026-07-21T12:01:00.000Z", files: { proposalMd: "# Closure", proposalJson: "{}" }, proposal: {
    proposalId: "prop-closure", schemaVersion: "v2", title: "关闭告警治理", context: "主要交付已完成。", understanding: "历史回放转移。", objective: "完成 Project。", logic: "Closure 与 Lifecycle 同时生效。", finalPreview: "新链路上线；历史回放转移。", unresolvedQuestions: [], source: { kind: "external_agent", skillVersion: "design-project@1" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "project-1", version: 4 }] }, preconditions: [],
    groups: [{ groupId: "close", explanation: "不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [
      { operationId: "closure", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: "project-1", version: 4 }, summary: "记录 Closure", payload: { closure }, preconditions: [] },
      { operationId: "complete", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "project-1", version: 4 }, summary: "完成 Project", payload: { lifecycle: "COMPLETED" }, preconditions: [] },
    ], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-21T12:00:00.000Z",
  } }];
  let html = renderApp(value);
  assert.match(html, /external_agent/);
  assert.match(html, /历史回放转移/);
  assert.match(html, /data-action="v2-project-closure-commit"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.actionDialog = { kind: "confirm-v2-project-closure", value: "prop-closure|2026-07-21T12:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /未完成 Objective 的原因与去向/);
  assert.match(html, /data-action="submit-v2-project-closure"/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.groups[0]!.disposition = "REJECTED";
  value.v2Proposals[0]!.proposal.groups.push({ groupId: "ordinary", explanation: "普通独立变更。", risk: "LOW", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [], disposition: "ACCEPTED" });
  value.v2Proposals[0]!.proposal.status = "PARTIALLY_ACCEPTED";
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-project-closure-commit"/);
  assert.match(html, /data-action="v2-proposal-commit"/);
});

test("MiniProject DONE Review uses a dedicated final confirmation and does not expose generic Undo", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Proposals = [{ updatedAt: "2026-07-22T08:01:00.000Z", files: { proposalMd: "# MiniProject Completion", proposalJson: "{}" }, proposal: {
    proposalId: "prop-mini-close", schemaVersion: "v2", title: "完成 MiniProject", context: "Logseq Marker 已改为 DONE。", understanding: "这是关闭请求。", objective: "审阅后完成 MiniProject。", logic: "重验对象、Block 与 Anchor 后原子生效。", finalPreview: "MiniProject 将变为 COMPLETED。", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [{ kind: "BLOCK", id: "block-mini", hash: "done-hash" }], modify: [{ kind: "OBJECT", id: "mini-1", version: 3 }] }, preconditions: [],
    groups: [{ groupId: "complete-mini-project", explanation: "高影响关闭请求。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "complete-mini", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "mini-1", version: 3 }, summary: "完成 MiniProject", payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT", text: "收尾", marker: "DONE", externalId: "block-mini", contentHash: "done-hash", closure: { originalGoal: "完成收尾", actualResult: "收尾完成", remainingWork: "无遗留" } }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-22T08:00:00.000Z",
  } }];
  let html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-closure-commit"/);
  assert.match(html, /原子记录 MiniProject 三问 Closure 与 Lifecycle，并保留 Anchor 证据/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.actionDialog = { kind: "v2-mini-project-closure-review", value: "prop-mini-close|complete-mini-project|2026-07-22T08:01:00.000Z|HIGH" };
  value.v2ProviderAvailable = true;
  value.v2CandidateAvailable = true;
  html = renderApp(value);
  assert.match(html, /data-field="miniClosureOriginalGoal"/);
  assert.match(html, /data-field="miniClosureActualResult"/);
  assert.match(html, /data-field="miniClosureRemainingWork"/);
  assert.match(html, /<textarea data-field="miniClosureActualResult">收尾完成<\/textarea>/);
  assert.match(html, /data-action="v2-mini-project-closure-draft"/);
  assert.match(html, /Agent 只生成可编辑草稿，不会接受或提交/);
  assert.match(html, /data-field="miniClosureLegacyObjectType"/);
  assert.match(html, /data-action="v2-mini-project-legacy-transfer"/);
  assert.match(html, /新建并选中一个空 Block/);
  assert.match(html, /保存三问并接受/);
  value.v2ClosureDraftBusy = true;
  html = renderApp(value);
  assert.match(html, /Agent 正在草拟…/);
  assert.match(html, /data-action="v2-mini-project-closure-draft"[^>]*disabled[^>]*aria-busy="true"/);
  assert.match(html, /data-action="submit-v2-review-accept"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2ClosureDraftBusy = false;
  value.v2ClosureReviewBusy = true;
  html = renderApp(value);
  assert.match(html, /正在保存…/);
  assert.match(html, /data-action="submit-v2-review-accept"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2ClosureReviewBusy = false;
  value.actionDialog = { kind: "confirm-v2-mini-project-closure", value: "prop-mini-close|2026-07-22T08:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /原目标、实际结果和遗留三问/);
  assert.match(html, /data-action="submit-v2-mini-project-closure"/);
  delete value.actionDialog;
  value.v2LifecycleCommitBusy = true;
  html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-closure-commit"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2LifecycleCommitBusy = false;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:mini", proposalId: "prop-mini-close", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "now", updatedAt: "now" }];
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  assert.match(html, /移除 Marker 不会自动重开/);
});

test("MiniProject Closure waits until every other group is explicitly rejected", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Proposals = [{ updatedAt: "now", files: { proposalMd: "# Closure", proposalJson: "{}" }, proposal: {
    proposalId: "prop-mini-partial", schemaVersion: "v2", title: "完成 MiniProject", context: "对象级关闭。", understanding: "三问已确认。", objective: "完成 MiniProject。", logic: "独立提交。", finalPreview: "完成。", unresolvedQuestions: [], source: { kind: "external_agent" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "mini-partial", version: 2 }] }, preconditions: [], status: "PARTIALLY_ACCEPTED", createdAt: "now",
    groups: [
      { groupId: "close", explanation: "关闭。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "close", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "mini-partial", version: 2 }, summary: "完成", payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT", closure: { originalGoal: "目标", actualResult: "结果", remainingWork: "另行处理" } }, preconditions: [] }], disposition: "ACCEPTED" },
      { groupId: "remaining", explanation: "创建后续对象。", risk: "LOW", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [], disposition: "PENDING" },
    ],
  } }];
  let html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-mini-project-closure-commit"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  assert.match(html, /请先拒绝这些组，或将其拆成独立 Proposal/);
  value.v2Proposals[0]!.proposal.groups[1]!.disposition = "REJECTED";
  html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-closure-commit"/);
});

test("object-only MiniProject Closure explains version revalidation without claiming Graph writes", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Objects = [{ objectId: "mini-agent", objectType: "MINI_PROJECT", text: "外部交付", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, version: 2, createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "test" }];
  value.v2Proposals = [{ updatedAt: "2026-07-22T10:01:00.000Z", files: { proposalMd: "# Closure", proposalJson: "{}" }, proposal: {
    proposalId: "prop-mini-agent", schemaVersion: "v2", title: "关闭外部交付", context: "对象级关闭。", understanding: "需要三问。", objective: "完成 MiniProject。", logic: "仅重验对象版本。", finalPreview: "等待审阅。", unresolvedQuestions: [], source: { kind: "external_agent" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "mini-agent", version: 2 }] }, preconditions: [],
    groups: [{ groupId: "complete-mini-project", explanation: "高影响关闭。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "complete-mini", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "mini-agent", version: 2 }, summary: "完成", payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT", closure: { originalGoal: "外部交付", actualResult: "已完成", remainingWork: "无遗留" } }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-22T10:00:00.000Z",
  } }];
  let html = renderApp(value);
  assert.match(html, /且不改写 Graph/);
  value.actionDialog = { kind: "confirm-v2-mini-project-closure", value: "prop-mini-agent|2026-07-22T10:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /重验对象版本且不会改写 Logseq 正文/);
  assert.doesNotMatch(html, /重验 Block、Anchor/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:agent", proposalId: "prop-mini-agent", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "now", updatedAt: "now" }];
  html = renderApp(value);
  assert.match(html, /本次对象级关闭未改写 Logseq 正文/);
});

test("HIGH Ownership Review uses a dedicated confirmation and never falls through to generic formalization", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Proposals = [{ updatedAt: "2026-07-21T13:01:00.000Z", files: { proposalMd: "# Ownership", proposalJson: "{}" }, proposal: {
    proposalId: "prop-owner", schemaVersion: "v2", title: "改变任务主归属", context: "Task 当前未归属。", understanding: "归入现有 Project。", objective: "建立唯一主归属。", logic: "只改变 Ownership。", finalPreview: "Task 将归入 Owner Project。", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [{ kind: "OBJECT", id: "owner-1", version: 2 }], modify: [{ kind: "OBJECT", id: "task-1", version: 4 }] }, preconditions: [],
    groups: [{ groupId: "owner", explanation: "高影响独立审阅。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "change-owner", kind: "CHANGE_OWNERSHIP", target: { kind: "OBJECT", id: "task-1", version: 4 }, summary: "设置主归属", payload: { ownerObjectId: "owner-1" }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-21T13:00:00.000Z",
  } }];
  let html = renderApp(value);
  assert.match(html, /data-action="v2-ownership-commit"/);
  assert.match(html, /确认改变主归属/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.actionDialog = { kind: "confirm-v2-ownership", value: "prop-owner|2026-07-21T13:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /位置、Anchor 和 Association 不会改变/);
  assert.match(html, /data-action="submit-v2-ownership"/);
  value.v2OwnershipCommitBusy = true;
  delete value.actionDialog;
  html = renderApp(value);
  assert.match(html, /data-action="v2-ownership-commit"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2OwnershipCommitBusy = false;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:owner", proposalId: "prop-owner", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "now", updatedAt: "now" }];
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  assert.match(html, /data-action="v2-ownership-undo"/);
  assert.match(html, /可恢复到审阅前主归属/);
  value.actionDialog = { kind: "confirm-v2-ownership-undo", value: "proposal-commit:owner" };
  html = renderApp(value);
  assert.match(html, /恢复为未归属/);
  assert.match(html, /data-action="submit-v2-ownership-undo"/);
  delete value.actionDialog;
  value.v2SemanticCommits.push({ semanticCommitId: "ownership-undo:proposal-commit:owner", proposalId: "prop-owner", status: "FAILED", beforeStateChecksum: "before", createdAt: "now", updatedAt: "now" });
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-ownership-undo"/);
  assert.match(html, /后续变化；Undo 已安全终止/);
  value.v2SemanticCommits.pop();
  value.v2SemanticCommits[0]!.status = "UNDONE";
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-ownership-undo"/);
  assert.match(html, /原 Commit 已撤销/);
});

test("completed Project keeps its readable Closure in the formal object workspace", () => {
  const value = model();
  value.workspace = "objects";
  value.v2Objects = [{ objectId: "project-closed", objectType: "PROJECT", version: 5, lifecycle: "COMPLETED", condition: { kind: "ACTIONABLE" }, text: "告警治理", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-21T12:00:00.000Z", sourceOrCreationEvent: "project", closure: {
    originalGoal: "推送可控", actualResult: "新链路上线", majorDeliverables: ["推送服务"], incompleteObjectives: [{ objective: "历史回放", reason: "数据未齐", nextStep: "转入数据治理" }], legacyDisposition: "新 Project 承接", keyDecisions: ["保留回退"], futureSummary: "重入先查数据",
  } }];
  const html = renderApp(value);
  for (const text of ["Project Closure", "推送可控", "新链路上线", "历史回放", "数据未齐", "转入数据治理", "新 Project 承接", "保留回退", "重入先查数据"]) assert.match(html, new RegExp(text));
});

test("completed MiniProject keeps the three-question Closure readable in the formal object workspace", () => {
  const value = model();
  value.workspace = "objects";
  value.v2Objects = [{ objectId: "mini-closed", objectType: "MINI_PROJECT", version: 4, lifecycle: "COMPLETED", condition: { kind: "ACTIONABLE" }, text: "发布核对", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T01:00:00.000Z", sourceOrCreationEvent: "block", closure: {
    originalGoal: "发布前完成全部核对", actualResult: "检查项全部通过", remainingWork: "监控首日指标",
  } }];
  const html = renderApp(value);
  for (const text of ["MiniProject Closure", "发布前完成全部核对", "检查项全部通过", "监控首日指标"]) assert.match(html, new RegExp(text));
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

test("Association creation exposes an observable busy state and disables duplicate submission", () => {
  const value = model();
  value.workspace = "objects";
  value.v2Objects = [
    { objectId: "task-association-source", objectType: "TASK", text: "来源", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, version: 2, createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z", sourceOrCreationEvent: "test" },
    { objectId: "decision-association-target", objectType: "DECISION", text: "目标", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, version: 1, createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z", sourceOrCreationEvent: "test" },
  ];
  value.v2AssociationAvailable = true;
  value.v2AssociationBusy = true;
  const html = renderApp(value);
  assert.match(html, /正在添加…/);
  assert.match(html, /data-action="v2-association-add" disabled aria-busy="true"/);
  assert.match(html, /data-version="2"/);
});

test("relation projection failure is explicit without hiding formal objects", () => {
  const value = model();
  value.v2Objects = [{ objectId: "task-visible", objectType: "TASK", text: "仍可见", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, version: 1, createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z", sourceOrCreationEvent: "test" }];
  value.v2RelationLoadError = "关系查询暂时失败";
  const html = renderApp(value);
  assert.match(html, /关系投影暂不可用/);
  assert.match(html, /仍可见/);
  assert.match(html, /没有执行关系写入/);
});

test("formal plugin entry does not regress to host browser prompts", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /window\.(?:prompt|confirm)\s*\(/);
  for (const kind of ["v2-candidate-update", "confirm-v2-commit", "confirm-v2-undo", "v2-condition", "v2-deadline"]) {
    assert.match(source, new RegExp(`openActionDialog\\("${kind}"`));
  }
});

test("formal V2 plugin entry excludes the writable V1 runtime", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  for (const token of ["@task-copilot/application", "VersionedStateRepository", "LogseqFileStorageBlobStore", "exportRecoveryBundle", "restoreRecoveryBundle", "requireTaskCopilot", "let taskCopilot", "const taskCopilot", "@task-copilot/persistence"]) assert.doesNotMatch(source, new RegExp(token));
  assert.match(source, /V1 FileStorage inactive/);
  for (const token of [
    "v2-now-filter",
    "v2-now-grouping",
    "v2-candidate-open",
    "v2-candidate-submit",
    "prepareV2ExplicitCandidateDiscovery",
    "persistV2ExplicitCandidateDiscovery",
    "v2-rebind-open",
    "v2-rebind-submit",
    "prepareV2PrimaryAnchorRebind",
    "submitV2PrimaryAnchorRebind",
  ]) {
    assert.match(source, new RegExp(token));
  }
  assert.match(source, /function enterRestrictedServiceMode[\s\S]*serviceRuntimeClient = undefined;[\s\S]*explicitSyncController\?\.pause\(\)/);
  assert.match(source, /enterRestrictedServiceMode\("SERVICE_DISCOVERY_IN_PROGRESS"/);
  assert.match(source, /Local Service 正在重连或已不可写；旧预览已作废/);
  assert.match(source, /Primary Anchor 预览已过期或不存在；没有执行重新绑定/);
  assert.match(source, /V2_UI_ACTION_UNSUPPORTED/);
  assert.match(source, /listSemanticCommits\(\)/);
  assert.match(source, /listPrimaryAnchors\(cursor, true\)/);
});
