import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checksum } from "@task-copilot/shared";
import type { ServiceProjectCreationGrillResult, ServiceProjectCreationPreviewResult } from "@task-copilot/service-client";

import { MigrationScanController } from "../src/migration-scan-controller.ts";
import { cancelActionDialogReturnsToOrigin, renderApp, type UiModel } from "../src/ui.ts";
import {
  projectPluginV2ProjectReentry,
  projectPluginV2TaskReentry,
} from "../src/reentry-runtime.ts";
import { projectPluginObjectNarrations } from "../src/status-narration-runtime.ts";

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

test("focused confirmation cancellation restores its review workspace before returning to the source", () => {
  assert.equal(cancelActionDialogReturnsToOrigin("confirm-v2-commit", true), false);
  assert.equal(cancelActionDialogReturnsToOrigin("confirm-v2-undo", true), false);
  assert.equal(cancelActionDialogReturnsToOrigin("v2-condition", true), true);
  assert.equal(cancelActionDialogReturnsToOrigin("confirm-v2-commit", false), false);
});

test("shell exposes exactly four user-level primary destinations and no-agent degradation", () => {
  const value = model();
  value.workspace = "now";
  value.runtime = { pluginVersion: "0.1.0", runtimeStatus: "READY", storeStatus: "READY", currentGraph: "private-graph" };
  const html = renderApp(value);
  const primary = html.match(/<nav aria-label="主要工作区">([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.deepEqual(
    [...primary.matchAll(/data-value="([^"]+)"/g)].map((match) => match[1]),
    ["now", "review", "reentry", "more"],
  );
  for (const label of ["现在", "待我确认", "项目", "更多"]) assert.match(primary, new RegExp(`>${label}<`));
  for (const engineeringLabel of ["Now Work", "对象", "Proposal Review", "Project 重入", "迁移", "审计与恢复"]) {
    assert.doesNotMatch(primary, new RegExp(engineeringLabel));
  }
  assert.doesNotMatch(html, /data-value="inbox"/);
  assert.match(html, /Copilot 未配置/);
  assert.match(html, /基础事务系统可用/);
  assert.match(html, /<nav aria-label="主要工作区">/);
  assert.match(primary, /data-value="now" aria-current="page"/);
  assert.match(html, /整理当前页/);
  assert.match(html, /data-action="v2-candidate-open"/);
  assert.doesNotMatch(html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] ?? "", /Diagnostics/);
  assert.doesNotMatch(html, /Plugin 0\.1\.0|Runtime READY|Store READY|Graph private-graph/);
  assert.doesNotMatch(html, /data-action="capture"/);
});

test("Project LIGHT router exposes durable Condition Undo and renders a bounded confirmation", () => {
  const value = model();
  value.v2Objects = [{
    objectId: "project-condition-undo",
    objectType: "PROJECT",
    text: "可撤销状态项目",
    sourceOrCreationEvent: "controlled_project_creation",
    lifecycle: "OPEN",
    condition: { kind: "PAUSED", reason: "等待窗口" },
    version: 3,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:01:00.000Z",
    projectStructure: {
      currentSummary: "等待窗口",
      currentFocuses: ["确认窗口"],
      objectives: [],
      deliverables: [],
      workStages: [],
      stageMappings: [],
    },
  }];
  value.actionDialog = { kind: "v2-project-operation-router", value: "project-condition-undo|3" };
  const router = renderApp(value);
  assert.match(router, /data-action="v2-condition-undo-open"/);
  assert.match(router, /处理归属或关联（安全撤销补齐后开放）/);
  assert.doesNotMatch(router, /data-action="v2-project-operation-association"/);

  value.v2ConditionUndoPreparation = {
    status: "PREPARED",
    conditionChangeId: "a".repeat(64),
    objectId: "project-condition-undo",
    objectText: "可撤销状态项目",
    expectedVersion: 3,
    beforeCondition: { kind: "ACTIONABLE" },
    afterCondition: { kind: "PAUSED", reason: "等待窗口" },
    changedAt: "2026-07-26T00:01:00.000Z",
  };
  value.actionDialog = { kind: "confirm-v2-condition-undo", value: `project-condition-undo|${"a".repeat(64)}|3` };
  const confirmation = renderApp(value);
  assert.match(confirmation, /从“我先暂停”恢复为“可以行动”/);
  assert.match(confirmation, /不会改变正文、是否完成、当前关注或归属/);
  assert.match(confirmation, /data-action="submit-v2-condition-undo"/);
});

test("shell reports the controlled V2 Provider instead of the legacy demo-agent flag", () => {
  const value = model();
  value.workspace = "now";
  value.v2ProviderAvailable = true;
  const html = renderApp(value);
  assert.match(html, /Copilot 可用 · 建议需审阅/);
  assert.doesNotMatch(html, /Agent disabled/);
});

test("Project primary destination keeps reentry and formal-object capabilities reachable", () => {
  const value = model();
  value.workspace = "reentry";
  let html = renderApp(value);
  assert.match(html, /data-value="reentry" aria-current="page">项目</);
  assert.match(html, /aria-label="项目区域"/);
  assert.match(html, /data-value="reentry"[\s\S]*继续项目/);
  assert.match(html, /data-value="objects"[\s\S]*正式事项与创建/);

  value.workspace = "objects";
  html = renderApp(value);
  assert.match(html, /data-value="reentry" aria-current="page">项目</);
  assert.match(html, /data-value="objects" aria-pressed="true"/);
});

test("More is a user-facing hub and keeps maintenance capabilities reachable", () => {
  const value = model();
  value.workspace = "more";
  let html = renderApp(value);
  assert.match(html, /data-value="more" aria-current="page">更多</);
  assert.match(html, /最近修改与恢复/);
  assert.match(html, /data-value="audit"/);
  assert.match(html, /系统状态/);
  assert.match(html, /data-action="runtime-diagnostics"/);
  assert.match(html, /备份与恢复/);
  assert.match(html, /备份与恢复暂不可用/);
  assert.match(html, /data-value="migration"/);
  assert.doesNotMatch(html, /结束本次 Task Copilot/);

  value.v2ManagedRuntimeState = "RUNNING";
  html = renderApp(value);
  assert.match(html, /结束本次 Task Copilot/);
  assert.match(html, /data-action="end-task-copilot-open"/);
  assert.doesNotMatch(html, /Launcher|Service|Commit|SQLite|当前 Graph|迁移账本|技术证据/);
  value.actionDialog = { kind: "confirm-end-task-copilot", value: "current-graph" };
  html = renderApp(value);
  assert.match(html, /aria-label="结束本次 Task Copilot"/);
  assert.match(html, /data-action="submit-end-task-copilot"/);
  assert.match(html, /其他进程不受影响/);
  assert.doesNotMatch(html, /Launcher|Service|Commit|SQLite|当前 Graph/);

  delete value.actionDialog;
  value.v2ManagedRuntimeState = "ENDED";
  html = renderApp(value);
  assert.match(html, /重新启动 Task Copilot/);
  assert.match(html, /data-action="restart-task-copilot"/);
  assert.match(html, /本次使用已结束 · 正文仍可编辑/);
  assert.doesNotMatch(html, /整理当前页|data-value="now"|data-value="review"|data-value="reentry"/);
  assert.doesNotMatch(html, /Launcher|Service|Commit|SQLite|当前 Graph/);

  value.workspace = "audit";
  html = renderApp(value);
  assert.match(html, /data-value="more" aria-current="page">更多</);
  assert.match(html, /aria-label="更多区域"/);
  assert.match(html, /data-value="more"[\s\S]*更多首页/);
  assert.match(html, /data-value="migration"[\s\S]*迁移/);
});

test("V2 audit is read-only and points maintenance to the productized backup entry", () => {
  const value = model();
  value.workspace = "audit";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:v2", proposalId: "proposal:v2", status: "RECOVERY_REQUIRED", beforeStateChecksum: "before-checksum", createdAt: "2026-07-22T08:00:00.000Z", updatedAt: "2026-07-22T08:01:00.000Z", errorCode: "VERIFY_FAILED" }];
  const html = renderApp(value);
  const frontstage = html.split("<details>")[0] ?? "";
  assert.match(frontstage, /正式修改与恢复/);
  assert.doesNotMatch(frontstage, /SQLite|Local Service|Audit|Receipt|SemanticCommit/);
  assert.match(html, /维护与恢复说明[\s\S]*SQLite 单一状态源/);
  assert.match(html, /更多 → 备份与恢复/);
  assert.doesNotMatch(html, /tc backup|backup_id|数据库路径/);
  assert.match(html, /需要恢复/);
  assert.match(html, /上一次修改尚未完成/);
  assert.match(html, /技术详情[\s\S]*RECOVERY_REQUIRED[\s\S]*VERIFY_FAILED/);
  for (const action of ["export-backup", "verify-backup", "recover-pending", "scan-anchors"]) assert.doesNotMatch(html, new RegExp(`data-action="${action}"`));
});

test("backup Restore review uses session tokens, explicit impact confirmation, and no internal identity", () => {
  const value = model();
  value.workspace = "more";
  value.v2BackupRestoreAvailable = true;
  value.v2BackupRestore = {
    status: "ready",
    backups: [
      { token: "snapshot:0", createdAt: "2026-07-26T12:00:00.000Z", status: "VALID", schemaVersion: 12, objectCount: 4 },
      { token: "snapshot:1", createdAt: "2026-07-25T12:00:00.000Z", status: "INVALID" },
    ],
    total: 2,
    limited: false,
    selectedToken: "snapshot:0",
    message: "快照已通过完整性校验；请审阅最终影响。",
  };
  value.actionDialog = { kind: "v2-backup-restore", value: "current-graph" };
  const html = renderApp(value);
  assert.match(html, /4 项正式事项 · 完整性校验通过/);
  assert.match(html, /完整性校验未通过 · 不可选择/);
  assert.match(html, /恢复并自动重启/);
  assert.match(html, /当前正式状态会保留为恢复点/);
  assert.match(html, /data-value="snapshot:0"/);
  assert.doesNotMatch(html, /backup_[0-9]|RESTORE_AND_STOP_SERVICE|\\.db|objectId|SQLite|Doctor|数据库路径|内部快照标识/);
});

test("global action failure language remains accurate when an operation was rolled back after starting", () => {
  const value = model();
  value.error = "恢复未完成；原正式状态已回滚并重新可用，Restore 前恢复点仍保留。";
  const html = renderApp(value);
  assert.match(html, /未完成：/);
  assert.match(html, /原正式状态已回滚并重新可用/);
  assert.match(html, /不会静默覆盖或重复提交/);
  assert.doesNotMatch(html, /未执行：|请修正后重试/);
});

test("a receipt-backed pending Commit replaces transport jargon with the one safe user action", () => {
  const value = model();
  value.error = "Local Service 请求失败。";
  value.v2SemanticCommits = [{
    semanticCommitId: "proposal-commit:pending-user-language",
    proposalId: "proposal-pending-user-language",
    status: "PENDING",
    beforeStateChecksum: "before",
    createdAt: "2026-07-30T07:24:00.000Z",
    updatedAt: "2026-07-30T07:24:01.000Z",
  }];
  const html = renderApp(value);
  assert.match(html, /这次修改没有完成/);
  assert.match(html, /已完成步骤已经安全保存/);
  assert.match(html, /继续原修改/);
  assert.doesNotMatch(html, /Local Service|Provider|Commit|PENDING/);
});

test("recent changes leads with user intent, application result, and existing Undo instead of engineering IDs", () => {
  const value = model();
  value.workspace = "audit";
  value.v2Proposals = [{
    updatedAt: "2026-07-24T06:32:00.000Z",
    files: { proposalMd: "# proposal", proposalJson: "{}" },
    proposal: {
      proposalId: "proposal-private-1",
      schemaVersion: "v2",
      title: "整理设备托管材料",
      context: "当前材料仍是一条普通记录。",
      understanding: "整理为可推进事项。",
      objective: "建立正式事项。",
      logic: "应用一个低风险修改。",
      finalPreview: "把设备托管材料组织为 MiniProject。",
      unresolvedQuestions: [],
      source: { kind: "user" },
      scope: { read: [], modify: [{ kind: "BLOCK", id: "block-1", version: 3 }] },
      preconditions: [],
      groups: [{
        groupId: "group-private-1",
        explanation: "一次独立修改。",
        risk: "LOW",
        independentlyAcceptable: true,
        dependencies: [],
        textPatches: [],
        semanticOperations: [{
          operationId: "rewrite-1",
          kind: "REWRITE_BLOCK",
          target: { kind: "BLOCK", id: "block-1", version: 3 },
          summary: "整理正文",
          payload: { text: "整理后的正文" },
          preconditions: [],
        }],
        disposition: "ACCEPTED",
      }],
      status: "APPLIED",
      createdAt: "2026-07-24T06:30:00.000Z",
    },
  }];
  value.v2SemanticCommits = [{
    semanticCommitId: "proposal-commit:private-1",
    proposalId: "proposal-private-1",
    status: "COMPLETED",
    beforeStateChecksum: "before-private-checksum",
    afterStateChecksum: "after-private-checksum",
    createdAt: "2026-07-24T06:31:00.000Z",
    updatedAt: "2026-07-24T06:32:00.000Z",
  }];

  const html = renderApp(value);
  const cardLead = html.match(/<article class="card compact recent-change">([\s\S]*?)<details/)?.[1] ?? "";
  assert.match(cardLead, /这次修改已经应用/);
  assert.match(cardLead, /所有步骤都已完成/);
  assert.doesNotMatch(cardLead, /尚不能确认.*当前证据不足以确认是否仍满足安全撤销条件/);
  assert.match(cardLead, /可以发起撤销.*执行时会重新检查当前内容.*不会覆盖/);
  assert.match(cardLead, /整理设备托管材料/);
  assert.match(cardLead, /把设备托管材料组织为 MiniProject/);
  assert.match(cardLead, /已应用/);
  assert.doesNotMatch(cardLead, /data-action="recent-change-review"/);
  assert.match(cardLead, /data-action="v2-proposal-undo"[\s\S]*>撤销</);
  const visibleLead = cardLead.replace(/<[^>]+>/g, "");
  for (const engineeringValue of ["proposal-commit:private-1", "proposal-private-1", "before-private-checksum", "COMPLETED"]) {
    assert.doesNotMatch(visibleLead, new RegExp(engineeringValue));
  }
  assert.match(html, /技术详情[\s\S]*proposal-commit:private-1[\s\S]*proposal-private-1/);
  assert.match(html, /叙述规则：[\s\S]*commit-completed/);
});

test("V2 Proposal review leads with deterministic narration and keeps raw status in details", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Proposals = [{
    updatedAt: "2026-07-24T06:32:00.000Z",
    files: { proposalMd: "# proposal", proposalJson: "{}" },
    proposal: {
      proposalId: "proposal-accepted-1",
      schemaVersion: "v2",
      title: "整理设备托管材料",
      context: "当前材料仍是一条普通记录。",
      understanding: "整理为可推进事项。",
      objective: "建立正式事项。",
      logic: "应用一个低风险修改。",
      finalPreview: "把设备托管材料组织为 MiniProject。",
      unresolvedQuestions: [],
      source: { kind: "user" },
      scope: { read: [], modify: [{ kind: "BLOCK", id: "block-1", version: 3 }] },
      preconditions: [],
      groups: [{
        groupId: "group-accepted-1",
        explanation: "一次独立修改。",
        risk: "LOW",
        independentlyAcceptable: true,
        dependencies: [],
        textPatches: [],
        semanticOperations: [{
          operationId: "rewrite-1",
          kind: "REWRITE_BLOCK",
          target: { kind: "BLOCK", id: "block-1", version: 3 },
          summary: "整理正文",
          payload: { text: "整理后的正文" },
          preconditions: [],
        }],
        disposition: "ACCEPTED",
      }],
      status: "ACCEPTED",
      createdAt: "2026-07-24T06:30:00.000Z",
    },
  }];
  value.v2SemanticCommits = [];

  const html = renderApp(value);
  const cardLead = html.match(/<article class="card proposal v2-proposal"[^>]*>([\s\S]*?)<details class="review-evidence-details">/)?.[1] ?? "";
  assert.match(cardLead, /方案已审阅，等待确认应用/);
  assert.match(cardLead, /上一步只是确认方案/);
  assert.doesNotMatch(cardLead, />ACCEPTED</);
  assert.match(html, /查看完整依据[\s\S]*proposal-accepted-not-applied[\s\S]*ACCEPTED/);
  assert.match(html, /data-action="v2-proposal-commit"/);
});

test("immediate result resolves the same recent-change identity and keeps technical ID in details", () => {
  const value = model();
  value.workspace = "review";
  value.message = "旧的工程化成功提示";
  value.recentActionCommitId = "proposal-commit:second";
  value.v2Proposals = [
    {
      updatedAt: "2026-07-24T06:32:00.000Z",
      files: { proposalMd: "# one", proposalJson: "{}" },
      proposal: {
        proposalId: "proposal-one", schemaVersion: "v2", title: "第一项修改", context: "c", understanding: "u", objective: "o", logic: "l", finalPreview: "第一项结果", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [] }, preconditions: [],
        groups: [], status: "APPLIED", createdAt: "2026-07-24T06:30:00.000Z",
      },
    },
    {
      updatedAt: "2026-07-24T06:34:00.000Z",
      files: { proposalMd: "# two", proposalJson: "{}" },
      proposal: {
        proposalId: "proposal-two", schemaVersion: "v2", title: "第二项修改", context: "c", understanding: "u", objective: "o", logic: "l", finalPreview: "第二项结果", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [] }, preconditions: [],
        groups: [], status: "APPLIED", createdAt: "2026-07-24T06:33:00.000Z",
      },
    },
  ];
  value.v2SemanticCommits = [
    { semanticCommitId: "proposal-commit:first", proposalId: "proposal-one", status: "COMPLETED", beforeStateChecksum: "one", createdAt: "2026-07-24T06:31:00.000Z", updatedAt: "2026-07-24T06:32:00.000Z" },
    { semanticCommitId: "proposal-commit:second", proposalId: "proposal-two", status: "COMPLETED", beforeStateChecksum: "two", createdAt: "2026-07-24T06:33:00.000Z", updatedAt: "2026-07-24T06:34:00.000Z" },
  ];

  const html = renderApp(value);
  const immediateLead = html.match(/<section class="action-result"[\s\S]*?<article class="card compact recent-change">([\s\S]*?)<details/)?.[1] ?? "";
  assert.match(immediateLead, /刚刚的结果/);
  assert.match(immediateLead, /第二项修改/);
  assert.doesNotMatch(immediateLead.replace(/<[^>]+>/g, ""), /第一项修改|proposal-commit:second|旧的工程化成功提示/);
  assert.match(html, /技术详情[\s\S]*proposal-commit:second/);
});

test("a session-only business origin changes Close into an explicit return action without exposing identity", () => {
  const value = model();
  value.originReturnLabel = "返回原内容";
  const html = renderApp(value);
  assert.match(html, /data-action="close"[^>]*>返回原内容</);
  assert.doesNotMatch(html, /block-origin|page-origin|originRoute/);
});

test("V2 audit distinguishes a failed Service projection from an empty ledger", () => {
  const value = model();
  value.workspace = "audit";
  value.v2SemanticCommits = [];
  value.v2AuditLoadError = "service unavailable";
  const html = renderApp(value);
  assert.match(html, /正式修改历史暂时不可用/);
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
  assert.match(html, /<h2>继续项目<\/h2>/);
  assert.doesNotMatch(html, /V2 SQLite|Local Service|OPEN · ACTIONABLE|调整 Project/);
  assert.match(html, /发布 V2/);
  assert.match(html, /当前主归属事项[\s\S]*完成发布审计/);
  assert.match(html, /相关事项[\s\S]*验收报告/);
  assert.match(html, /下一步：完成发布审计/);
  for (const action of ["v2-open-primary-anchor", "v2-condition-open", "v2-focus-add"]) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.match(html, /<details><summary>更多操作<\/summary>[\s\S]*data-action="v2-condition-open"/);
});

test("bounded Project reentry UI shows one conclusion and does not expand the full object tree", () => {
  const value = model();
  value.workspace = "reentry";
  const project = {
    objectId: "project-compact",
    objectType: "PROJECT" as const,
    version: 3,
    lifecycle: "OPEN" as const,
    condition: { kind: "ACTIONABLE" as const },
    text: "设备托管",
    projectStructure: {
      objectives: [{ objectiveId: "objective-1", text: "完成设备托管方案", priority: "PRIMARY" as const, successEvidence: ["通过评审"] }],
      deliverables: [{ deliverableId: "deliverable-1", text: "完整方案文档", acceptance: "可执行", status: "AVAILABLE" as const }],
      workStages: [{ stageId: "stage-1", name: "资源测算", statusDescription: "等待参数" }],
      currentSummary: "表格结构与业务字段已经完成。",
      currentFocuses: ["等待厂家补充功耗参数"],
      stageMappings: [],
    },
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    sourceOrCreationEvent: "test",
  };
  value.v2ProjectReentryCards = projectPluginV2ProjectReentry({
    observedAt: "2026-07-24T12:00:00.000Z",
    objects: [project],
    ownerships: [],
    associations: [],
    anchors: [{
      anchorId: "anchor-project",
      objectId: "project-compact",
      graphId: "graph-1",
      externalId: "block-project",
      role: "primary_text",
      status: "active",
      contentHash: "hash",
      lastSeenAt: "2026-07-24T12:00:00.000Z",
    }],
    proposals: [],
    commits: [],
    nowWork: {
      generatedAt: "2026-07-24T12:00:00.000Z",
      focus: [],
      next: [],
      waitingReview: [],
      conditionOptions: [],
    },
  });

  const html = renderApp(value);
  assert.match(html, /<h2>继续项目<\/h2>/);
  assert.match(html, /先看当前状态和最值得继续的入口/);
  assert.match(html, /设备托管｜等待厂家补充功耗参数/);
  assert.match(html, /表格结构与业务字段已经完成/);
  assert.match(html, /data-action="v2-project-landing-open" data-value="project-compact\|3"/);
  assert.doesNotMatch(html, /data-action="v2-open-primary-anchor" data-value="block-project">打开当前项目/);
  assert.match(html, /<details><summary>更多操作<\/summary>[\s\S]*data-action="v2-project-operation-router-open"/);
  assert.doesNotMatch(html, /同一正式投影|不保存第二摘要|每个 Project|可选 Copilot|调整 Project/);
  assert.doesNotMatch(html, /完整方案文档/);
  assert.doesNotMatch(html, /<h3>Objectives<\/h3>/);
  assert.doesNotMatch(html, /当前主归属对象/);

  value.v2ProviderAvailable = true;
  const recoveryEntry = renderApp(value);
  assert.match(recoveryEntry, /class="copilot-context"[\s\S]*data-action="v2-project-context-recovery"/);
  assert.doesNotMatch(recoveryEntry, /class="restore"[\s\S]*data-action="v2-project-context-recovery"/);
  value.v2ProjectContextRecovery = {
    "project-compact": {
      status: "ready",
      expectedVersion: 3,
      result: {
        output: {
          schemaVersion: "task-copilot-ux-output-v1",
          summary: "当前可从厂家参数等待点恢复。",
          facts: [{ text: "正式 Condition 正在等待厂家参数", sourceRefs: ["object:project-compact@v3"] }],
          inferences: [{ text: "参数到达后可继续资源测算", evidenceRefs: ["object:project-compact@v3"] }],
          unknowns: ["参数到达时间未知"],
          suggestedChanges: [{ kind: "DRAFT_PROPOSAL", summary: "讨论是否补充等待复查时间", evidenceRefs: ["object:project-compact@v3"], riskLevel: "LOW" }],
          nextActionEligible: true,
          nextAction: { intent: "OPEN_SOURCE", label: "打开当前项目", targetRef: "anchor:anchor-project" },
          riskLevel: "LOW",
          requiresDiscussion: true,
          requiresReview: true,
          evidenceScope: { refs: ["object:project-compact@v3"], observedAt: "2026-07-24T12:00:00.000Z", scopeHash: "scope-hash-private" },
          provenance: { kind: "LLM_DRAFT", contractVersion: "1.0.0", promptVersion: "prompt-hash", skillName: "recover-context", skillVersion: "1.0.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "deepseek-chat", generatedAt: "2026-07-24T12:00:00.000Z" },
        },
        provider: { model: "deepseek-chat", durationMs: 15, attempts: 1 },
        promptBundleVersion: "prompt-hash",
        contextFingerprint: "context-fingerprint-private",
        interactionId: "uxi_1234567890abcdef",
      },
    },
  };
  const withDraft = renderApp(value);
  assert.match(withDraft, /上下文恢复 · 不改变项目/);
  assert.match(withDraft, /这次建议怎么样？/);
  assert.match(withDraft, /data-action="v2-project-context-feedback"/);
  assert.match(withDraft, /已确认事实[\s\S]*正式 Condition 正在等待厂家参数/);
  assert.match(withDraft, /值得留意[\s\S]*参数到达后可继续资源测算/);
  assert.match(withDraft, /继续前仍需确认[\s\S]*参数到达时间未知/);
  assert.match(withDraft, /可选调整[\s\S]*如需修改，会先单独审阅/);
  assert.match(withDraft, /data-action="v2-project-worksite-open" data-value="project-compact\|3"/);
  assert.doesNotMatch(withDraft, /context-fingerprint-private|scope-hash-private|anchor-project/);

  const currentRecovery = value.v2ProjectContextRecovery["project-compact"];
  if (!currentRecovery || currentRecovery.status !== "ready") throw new Error("expected ready recovery fixture");
  value.v2ProjectContextRecovery["project-compact"] = { ...currentRecovery, userDisposition: "DO_NOT_REPEAT" };
  const suppressedDraft = renderApp(value);
  assert.match(suppressedDraft, /同版本建议已暂停/);
  assert.match(suppressedDraft, /本次会话已暂停生成/);
  assert.match(suppressedDraft, /disabled[^>]*>本次会话已暂停生成/);
  value.v2ProjectContextRecovery["project-compact"] = currentRecovery;

  const readyRecovery = value.v2ProjectContextRecovery["project-compact"];
  assert.equal(readyRecovery?.status, "ready");
  if (!readyRecovery || readyRecovery.status !== "ready") throw new Error("expected ready recovery fixture");
  value.v2ProjectContextRecovery["project-compact"] = {
    ...readyRecovery,
    result: {
      ...readyRecovery.result,
      output: {
        ...readyRecovery.result.output,
        nextAction: { intent: "OPEN_SOURCE", label: "越界动作", targetRef: "anchor:invented" },
      },
    },
  };
  const inventedAction = renderApp(value);
  assert.match(inventedAction, /建议动作已失效/);
  assert.doesNotMatch(inventedAction, />越界动作<\/button>/);

  value.v2ReentryTargetObjectId = "project-compact";
  const targeted = renderApp(value);
  assert.match(targeted, /data-project-landing="project-compact"/);
  assert.match(targeted, /当前状态[\s\S]*表格结构与业务字段已经完成/);
  assert.match(targeted, /现在先做什么[\s\S]*等待厂家补充功耗参数/);
  assert.match(targeted, /预期成果[\s\S]*完成设备托管方案[\s\S]*通过评审/);
  assert.match(targeted, /来源与背景[\s\S]*没有移动或改写来源正文/);
  assert.match(targeted, /Task Copilot[\s\S]*恢复上下文[\s\S]*调整项目[\s\S]*查看完整结构/);
  assert.match(targeted, /data-action="v2-project-worksite-open" data-value="project-compact\|3"/);
  assert.doesNotMatch(targeted, /object ID|Anchor|Commit|checksum|Ownership|Lifecycle/);
  assert.match(targeted, /<h2>设备托管<\/h2>/);
  assert.match(targeted, /data-action="v2-reentry-show-all"/);

  value.v2ReentryTargetObjectId = "project-stale";
  const stale = renderApp(value);
  assert.match(stale, /当前项目的进入信息已经变化/);
  assert.doesNotMatch(stale, /设备托管｜等待厂家补充功耗参数/);
});

test("Project current interface is readable in reentry and editable only through a HIGH Proposal", () => {
  const value = model();
  value.workspace = "reentry";
  const structure = { objectives: [{ objectiveId: "objective-1", text: "稳定发布", priority: "PRIMARY" as const, successEvidence: ["恢复演练通过"] }], deliverables: [{ deliverableId: "deliverable-1", text: "发布手册", acceptance: "可独立执行", status: "AVAILABLE" as const }], workStages: [{ stageId: "stage-1", name: "验收", statusDescription: "正在验证恢复路径" }], currentSummary: "核心链路已完成。", currentFocuses: ["完成恢复演练"], stageMappings: [] };
  value.v2Objects = [{ objectId: "project-structure", objectType: "PROJECT", version: 2, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "发布治理", projectStructure: structure, createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T01:00:00.000Z", sourceOrCreationEvent: "event" }];
  value.v2PrimaryOwnerships = [];
  value.v2Associations = [];
  const html = renderApp(value);
  assert.match(html, /Project 当前接口/);
  assert.match(html, /稳定发布/);
  assert.match(html, /发布手册/);
  assert.match(html, /正在验证恢复路径/);
  assert.match(html, /data-action="v2-project-operation-router-open"/);
  value.actionDialog = { kind: "v2-project-operation-router", value: "project-structure|2" };
  const router = renderApp(value);
  assert.match(router, /你想让这个项目发生什么变化/);
  assert.match(router, /更新当前状态[\s\S]*保存后可以撤销/);
  assert.match(router, /整理项目摘要[\s\S]*不改变目标、成果、正文或归属/);
  assert.match(router, /调整目标、成果和推进结构[\s\S]*未确认前不会写入/);
  assert.match(router, /结束这个项目[\s\S]*不会直接结束项目/);
  assert.match(router, /data-action="v2-condition-open"/);
  assert.match(router, /处理归属或关联（安全撤销补齐后开放）/);
  assert.doesNotMatch(router, /data-action="v2-project-operation-association"/);
  assert.match(router, /data-action="v2-project-narration-propose"/);
  assert.match(router, /data-action="v2-project-structure-open"/);
  assert.match(router, /data-action="v2-project-closure-evidence-open"/);
  const routerDialog = router.match(/<section class="inbox-dialog action-dialog project-operation-router"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(routerDialog, /低摩擦|审阅后应用|深度结构|Ownership|Lifecycle|Objectives|Commit/);
  value.v2ProjectClosureEvidence = {
    schemaVersion: "task-copilot-project-closure-evidence-v1",
    project: { objectId: "project-structure", version: 2, text: "发布治理", currentSummary: "核心链路已完成。", sourceRefs: ["object:project-structure@v2"] },
    goalCandidates: [{ text: "稳定发布", sourceRefs: ["objective:1"], evidenceKind: "PROJECT_STRUCTURE" }],
    deliverableCandidates: [{ text: "发布手册", sourceRefs: ["deliverable:1"], evidenceKind: "PROJECT_STRUCTURE" }],
    decisionCandidates: [],
    completedWorkCandidates: [],
    unresolvedWork: [{ text: "完成恢复验收", condition: "可以行动", lifecycle: "OPEN", sourceRefs: ["object:task-1@v1"], evidenceKind: "OWNED_OBJECT" }],
    objectiveJudgments: [{ objective: { objectiveId: "objective-1", text: "稳定发布", priority: "PRIMARY", sourceRefs: ["objective:1"] }, evidence: [{ text: "恢复演练通过", sourceRefs: ["objective-evidence:1"], evidenceKind: "PROJECT_STRUCTURE" }], disposition: "NEEDS_USER_JUDGMENT" }],
    userJudgments: [
      { judgment: "ACTUAL_RESULT", reason: "需要确认哪些候选证据真正构成实际结果。" },
      { judgment: "OBJECTIVE_DISPOSITIONS", reason: "每个 Objective 都需要明确完成或未完成及其后续。" },
      { judgment: "LEGACY_DISPOSITION", reason: "所有遗留工作需要明确去向。" },
      { judgment: "KEY_DECISIONS", reason: "Closure 至少需要一个经确认的关键 Decision。" },
      { judgment: "FUTURE_SUMMARY", reason: "需要写出未来重入时真正有用的一段总结。" },
    ],
    unknowns: [{ code: "KEY_DECISION_EVIDENCE_MISSING", text: "没有直接归属 Decision 证据。" }],
    evidenceScopeHash: "12345678",
    authorityBoundary: "READ_ONLY_EVIDENCE_DRAFT",
  };
  value.actionDialog = { kind: "v2-project-closure-evidence", value: "project-structure|2" };
  const closureEvidence = renderApp(value);
  assert.match(closureEvidence, /第 1 步 · 检查关闭条件/);
  assert.match(closureEvidence, /还有 5 项需要你判断/);
  assert.match(closureEvidence, /尚未正式应用[\s\S]*现在退出不会修改项目、正文或当前关注/);
  assert.match(closureEvidence, /<details class="objective-evidence-details"><summary>查看现有依据（1）<\/summary><p class="muted">恢复演练通过<\/p><\/details>/);
  assert.doesNotMatch(closureEvidence, /<p class="muted">已有证据：恢复演练通过<\/p>/);
  assert.match(closureEvidence, /查看完整依据[\s\S]*原目标[\s\S]*稳定发布/);
  assert.match(closureEvidence, /交付与成果[\s\S]*发布手册/);
  assert.match(closureEvidence, /关键决定[\s\S]*没有直接归属 Decision 证据/);
  assert.match(closureEvidence, /每个目标仍需判断[\s\S]*恢复演练通过/);
  assert.match(closureEvidence, /尚未收口的工作[\s\S]*完成恢复验收/);
  assert.match(closureEvidence, /目前无法确认[\s\S]*没有直接归属 Decision 证据/);
  assert.match(closureEvidence, /确认项目如何结束/);
  assert.match(closureEvidence, /data-field="projectClosureActualResult"/);
  assert.match(closureEvidence, /data-field="projectClosureObjectiveDisposition:0"/);
  assert.match(closureEvidence, /data-field="projectClosureObjectiveReason:0"/);
  assert.match(closureEvidence, /data-field="projectClosureObjectiveNextStep:0"/);
  assert.match(closureEvidence, /data-field="projectClosureLegacyDisposition"/);
  assert.match(closureEvidence, /data-field="projectClosureKeyDecisions"/);
  assert.match(closureEvidence, /data-field="projectClosureFutureSummary"/);
  assert.match(closureEvidence, /data-action="submit-v2-project-closure-draft"[^>]*disabled/);
  assert.doesNotMatch(closureEvidence, /data-action="v2-project-closure-commit"/);
  value.v2ProjectClosureProposalAvailable = true;
  const closureReady = renderApp(value);
  assert.match(closureReady, /data-action="submit-v2-project-closure-draft"/);
  assert.doesNotMatch(closureReady, /data-action="submit-v2-project-closure-draft"[^>]*disabled/);
  assert.match(closureReady, /下一步会先生成一份可阅读的关闭方案，仍不会直接结束项目/);
  value.v2ProjectClosureProposalBusy = true;
  const closureBusy = renderApp(value);
  assert.match(closureBusy, /正在整理关闭方案/);
  assert.match(closureBusy, /aria-live="polite"/);
  value.v2ProjectClosureProposalBusy = false;
  value.v2ProjectClosureProposalMessage = "这次关闭方案没有整理完成。项目和正文没有变化，你可以稍后重试。";
  const closureFailure = renderApp(value);
  assert.match(closureFailure, /role="alert"[\s\S]*关闭方案没有整理完成/);
  assert.match(closureFailure, /data-action="submit-v2-project-closure-draft"[\s\S]*重新整理关闭方案/);
  assert.doesNotMatch(closureFailure, /Provider|Proposal|Validator|正式状态/);
  value.v2Objects![0]!.version = 3;
  const closureStale = renderApp(value);
  assert.match(closureStale, /data-action="v2-project-closure-evidence-open" data-value="project-structure\|3"[\s\S]*重新检查关闭条件/);
  assert.doesNotMatch(closureStale, /data-action="submit-v2-project-closure-draft"/);
  value.v2Objects![0]!.version = 2;
  value.v2ProjectClosureDraftFields = {
    projectClosureActualResult: "已经填写的实际结果",
    "projectClosureObjectiveDisposition:0": "INCOMPLETE",
    "projectClosureObjectiveReason:0": "已经填写的未完成原因",
    "projectClosureObjectiveNextStep:0": "已经填写的后续动作",
    projectClosureLegacyDisposition: "完成恢复验收继续作为明确遗留。",
    projectClosureKeyDecisions: "已经填写的关键决定",
    projectClosureFutureSummary: "已经填写的未来摘要",
  };
  const preserved = renderApp(value);
  for (const text of ["已经填写的实际结果", "已经填写的未完成原因", "已经填写的后续动作", "已经填写的关键决定", "已经填写的未来摘要"]) {
    assert.match(preserved, new RegExp(text));
  }
  value.actionDialog = { kind: "v2-project-structure-edit", value: "project-structure|2" };
  const dialog = renderApp(value);
  assert.match(dialog, /审阅更新方案/);
  assert.match(dialog, /data-action="submit-v2-project-structure"/);
  assert.doesNotMatch(dialog, /直接保存正式状态/);
});

test("ordinary Page Context exposes three user intents and a page-scoped formal-item view", () => {
  const value = model();
  value.pageContext = {
    kind: "PAGE",
    originSurface: "MAIN_PAGE",
    pageUuid: "page-1",
    pageName: "Release Check",
    formalItems: [{
      objectId: "task-1",
      objectType: "TASK",
      objectText: "核对发布结果",
      objectVersion: 3,
      lifecycle: "OPEN",
    }],
  };
  value.actionDialog = { kind: "v2-page-context", value: "page-1" };
  const route = renderApp(value);
  for (const label of ["整理当前页", "查看本页正式事项", "将本页建立为项目"]) {
    assert.match(route, new RegExp(label));
  }
  for (const action of ["v2-page-organize", "v2-page-formal-items-open", "v2-page-project-create-route"]) {
    assert.match(route, new RegExp(`data-action="${action}"`));
  }
  assert.match(route, /当前页面 · Release Check/);
  assert.match(route, /1 项由 Task Copilot 关联到当前页/);
  assert.match(route, /class="intent-card primary-intent" data-action="v2-page-organize"/);
  assert.match(route, /读取当前页的相关材料/);
  assert.match(route, /先梳理并预览/);
  assert.match(route, /完成或取消后仍回到 Release Check/);
  const routeDialog = route.match(/<section class="inbox-dialog action-dialog page-context-dialog"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(routeDialog, /Page ·|active Primary Anchor|Grill Me|零写入/);

  value.actionDialog = { kind: "v2-page-formal-items", value: "page-1" };
  const items = renderApp(value);
  assert.match(items, /本页正式事项/);
  assert.match(items, /任务 · 进行中/);
  assert.match(items, /核对发布结果/);
  const itemsDialog = items.match(/<section class="inbox-dialog action-dialog page-context-dialog"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(itemsDialog, /TASK|OPEN|v3|SQLite|Graph|Primary Anchor/);
});

test("Project creation exposes one adaptive Grill entry across Blank, Page, and MiniProject sources", () => {
  const value = model();
  value.workspace = "objects";
  value.v2ProjectCreationGrillAvailable = true;
  value.v2Objects = [{
    objectId: "mini:release:1",
    objectType: "MINI_PROJECT",
    version: 4,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "发布核对",
    createdAt: "now",
    updatedAt: "now",
    sourceOrCreationEvent: "test",
  }];
  const html = renderApp(value);
  assert.match(html, /V2 · Project Grill Me/);
  assert.match(html, /data-action="v2-project-creation-grill-open" data-value="BLANK"/);
  assert.match(html, /开始梳理 Project/);
  assert.match(html, /data-action="v2-project-creation-grill-open" data-value="MINI_PROJECT:mini:release:1:4"/);
  assert.match(html, /演化为 Project/);
  assert.doesNotMatch(html, /data-action="create-v2-project"|data-field="v2ProjectName"|直接创建/);
});

test("Project Creation Grill keeps facts, inference, unknown, one question, zero-write Preview, and HIGH Review visible", () => {
  const value = model();
  value.workspace = "objects";
  value.v2ProjectCreationGrillAvailable = true;
  value.v2ProjectCreationPreviewAvailable = true;
  value.v2ProjectCreationProposalAvailable = true;
  const grillResult = {
    output: {
      schemaVersion: "task-copilot-grill-turn-v1",
      understanding: "当前材料希望建立发布治理 Project。",
      facts: [{ text: "已有发布核对材料", sourceRefs: ["page:page-1"] }],
      inferences: [{ text: "长期运营可能不在当前边界", evidenceRefs: ["page:page-1"] }],
      unknowns: [{ uncertaintyId: "outcome", dimension: "OUTCOME", text: "最终结果尚未确认" }],
      readiness: "CONTINUE",
      questionGroup: {
        focusUncertaintyId: "outcome",
        questions: [{ uncertaintyId: "outcome", text: "完成时最重要的可验收结果是什么？" }],
        recommendation: { text: "先确认一个可验收结果。", evidenceRefs: ["page:page-1"], tradeoffs: [] },
      },
      evidenceScope: { refs: ["page:page-1"], scopeHash: "scope", observedAt: "2026-07-25T08:00:00.000Z" },
      authorityBoundary: "SESSION_DRAFT_ONLY",
      provenance: {
        contractVersion: "1.0.0",
        promptVersion: "prompt",
        skillName: "project-creation-modeling",
        skillVersion: "1.1.0",
        providerId: "deepseek",
        providerVersion: "chat-completions-v1",
        model: "deepseek-v4-flash",
        generatedAt: "2026-07-25T08:00:00.000Z",
      },
    },
    provider: { model: "deepseek-v4-flash", durationMs: 10, attempts: 1 },
    promptBundleVersion: "prompt",
    contextFingerprint: "fingerprint",
  } satisfies ServiceProjectCreationGrillResult;
  value.actionDialog = { kind: "v2-project-creation-grill", value: "PAGE:page-1" };
  value.v2ProjectCreationGrill = {
    "PAGE:page-1": {
      status: "ready",
      source: { sourceKind: "PAGE", pageId: "page-1" },
      answers: [],
      result: grillResult,
    },
  };
  let html = renderApp(value);
  assert.match(html, /Project Grill Me · 基于当前页面/);
  assert.match(html, /已确认事实[\s\S]*已有发布核对材料/);
  assert.match(html, /Copilot 判断[\s\S]*长期运营可能不在当前边界/);
  assert.match(html, /仍待澄清[\s\S]*最终结果尚未确认/);
  assert.match(html, /这一轮只确认一件事/);
  assert.match(html, /data-field="v2ProjectCreationGrillAnswer"/);
  assert.match(html, /data-action="v2-project-creation-grill-answer"/);

  const readyOutput: ServiceProjectCreationGrillResult["output"] = { ...grillResult.output };
  delete readyOutput.questionGroup;
  readyOutput.readiness = "READY_FOR_PREVIEW";
  const readyResult: ServiceProjectCreationGrillResult = {
    ...grillResult,
    output: readyOutput,
  };
  value.v2ProjectCreationGrill["PAGE:page-1"] = {
    status: "ready",
    source: { sourceKind: "PAGE", pageId: "page-1" },
    answers: [],
    result: readyResult,
  };
  html = renderApp(value);
  assert.match(html, /已经可以生成最终阅读预览/);
  assert.match(html, /data-action="v2-project-creation-grill-preview"/);

  const preview = {
    output: {
      schemaVersion: "task-copilot-project-creation-preview-v1",
      finalReading: {
        title: { text: "发布治理", evidenceRefs: ["answer:outcome"] },
        outcome: { text: "形成可复核发布流程", evidenceRefs: ["answer:outcome"] },
        boundary: {
          included: [{ text: "发布核对", evidenceRefs: ["page:page-1"] }],
          excluded: [{ text: "长期运营", evidenceRefs: ["answer:boundary"] }],
        },
        completionEvidence: [{ text: "恢复演练通过", evidenceRefs: ["answer:completion"] }],
        internalClosure: { text: "每轮发布形成证据", evidenceRefs: ["answer:closure"] },
        currentInterface: { text: "从发布核对继续", evidenceRefs: ["answer:interface"] },
      },
      pageObjectRelationship: {
        mode: "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE",
        rationale: "保留来源 Page。",
        evidenceRefs: ["page:page-1"],
        authority: "PROPOSED_FOR_REVIEW",
      },
      sourceMaterials: [],
      formalImpact: { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 },
      evidenceScope: { refs: ["page:page-1"], scopeHash: "scope", observedAt: "2026-07-25T08:00:00.000Z" },
      authorityBoundary: "SESSION_PREVIEW_ONLY",
      provenance: readyResult.output.provenance,
    },
    provider: { model: "deepseek-v4-flash", durationMs: 10, attempts: 1 },
    promptBundleVersion: "prompt",
    contextFingerprint: "fingerprint",
    previewHandle: "project_creation_preview_aaaaaaaaaaaaaaaa",
  } satisfies ServiceProjectCreationPreviewResult;
  value.v2ProjectCreationGrill["PAGE:page-1"] = {
    status: "ready",
    source: { sourceKind: "PAGE", pageId: "page-1" },
    answers: [],
    result: readyResult,
    preview: { status: "ready", result: preview },
  };
  html = renderApp(value);
  assert.match(html, /项目最终阅读预览/);
  assert.match(html, /系统理解[\s\S]*形成可复核发布流程/);
  assert.match(html, /<strong>目标：<\/strong>[\s\S]*<strong>当前推进：<\/strong>/);
  assert.doesNotMatch(html, /当前先从/);
  assert.match(html, /如果确认应用[\s\S]*创建一个新项目[\s\S]*保留来源，创建独立项目页面/);
  assert.match(html, /不会改变[\s\S]*来源页面和原始材料保持不变[\s\S]*尚未创建页面或正式事项/);
  assert.match(html, /下一步[\s\S]*进入待我确认/);
  assert.match(html, /查看完整依据[\s\S]*完成证据[\s\S]*内部闭环[\s\S]*当前接口/);
  assert.doesNotMatch(html, /<details class="project-preview-evidence"[^>]*\sopen/);
  assert.doesNotMatch(html, /CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE/);
  assert.match(html, /data-action="v2-project-creation-grill-proposal"/);
  assert.match(html, /进入待我确认/);
  assert.doesNotMatch(html, /Session only|HIGH Review|Project Creation Proposal|Provider|Local Service|正式变化 0/);

  value.v2ProjectCreationGrill["PAGE:page-1"] = {
    status: "stale",
    source: { sourceKind: "PAGE", pageId: "page-1" },
    answers: [{ uncertaintyId: "outcome", text: "形成可复核发布流程" }],
    message: "来源已变化",
  };
  html = renderApp(value);
  assert.match(html, /来源已变化/);
  assert.match(html, /data-action="v2-project-creation-grill-recheck"/);
  assert.match(html, /基于最新内容重新检查/);

  value.v2ProjectCreationGrill["PAGE:page-1"] = {
    status: "error",
    source: { sourceKind: "PAGE", pageId: "page-1" },
    answers: [],
    retryable: false,
    message: "当前来源内容较多，无法完整梳理。请返回并从较小页面或空白 Project 入口继续。",
  };
  html = renderApp(value);
  assert.match(html, /当前来源内容较多/);
  assert.doesNotMatch(html, /data-action="v2-project-creation-grill-retry"/);
  assert.match(html, /data-action="cancel-action-dialog"/);
});

test("Project Page Context routes current state, structure discussion, and project operations", () => {
  const value = model();
  value.pageContext = {
    kind: "PROJECT",
    originSurface: "MAIN_PAGE",
    pageUuid: "page-project",
    pageName: "Project/Task Copilot",
    formalItems: [],
    project: {
      objectId: "project-1",
      objectText: "Task Copilot",
      objectVersion: 7,
      lifecycle: "OPEN",
    },
  };
  value.actionDialog = { kind: "v2-page-context", value: "page-project" };
  const html = renderApp(value);
  for (const label of ["更新项目当前状态", "讨论项目结构", "打开项目工作区"]) {
    assert.match(html, new RegExp(label));
  }
  for (const action of ["v2-page-project-update", "v2-page-project-discuss", "v2-page-project-operations"]) {
    assert.match(html, new RegExp(`data-action="${action}"`));
  }
  assert.match(html, /项目页面 · Project\/Task Copilot/);
  assert.match(html, /先审阅方案，确认应用后才会修改/);
  assert.match(html, /class="intent-card primary-intent" data-action="v2-page-project-operations"/);
  const projectDialog = html.match(/<section class="inbox-dialog action-dialog page-context-dialog"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(projectDialog, /Project Page|Project 当前接口|P0|HIGH Proposal|正式对象工作区/);
  assert.doesNotMatch(html, /data-action="v2-page-project-create-route"/);
});

test("Migration workspace translates the Service ledger without exposing identities and offers only bounded batch actions", () => {
  const value = model();
  value.workspace = "migration";
  value.v2MigrationExecutionAvailable = true;
  value.v2MigrationRuns = [{
    token: "migration-plan:1",
    status: "IMPORTING", summary: { total: 3, import: 2, keepOrdinary: 0, defer: 1, exclude: 0 },
    createdAt: "2026-07-21T08:00:00.000Z", updatedAt: "2026-07-21T09:00:00.000Z",
    batches: [{
      token: "migration-batch:1", status: "IMPORTED", importedCount: 2,
      updatedAt: "2026-07-21T09:00:00.000Z",
    }],
  }];
  const html = renderApp(value);
  assert.match(html, /V1 → V2 迁移/);
  assert.match(html, /导入后待验证/);
  assert.match(html, /迁移计划 1/);
  assert.match(html, /3 项已审阅 · 2 项列入迁移 · 0 项保持普通内容 · 1 项暂缓/);
  assert.match(html, /应用重启后仍可继续/);
  assert.match(html, /Recovery Bundle 始终只读/);
  assert.match(html, /data-action="migration-batch-verify"/);
  assert.doesNotMatch(html, /migration-run:abc|backup_20260721080000000|a{12,}/);
  assert.doesNotMatch(html, /textarea|data-action="migration-activate"/);
});

test("Migration workspace gives all ledger states an accurate conclusion and stage-aware counts", () => {
  const cases = [
    ["PREVIEWED", "等待确认导入", "2 项准备迁移"],
    ["IMPORTING", "导入后待验证", "2 项列入迁移"],
    ["VERIFIED", "验证通过，等待启用", "2 项已迁移并验证"],
    ["ACTIVATED", "迁移已完成", "2 项已迁移并验证"],
    ["FAILED", "迁移未完成", "系统不会自动重试，请先检查失败批次"],
    ["CANCELLED", "迁移已取消", "现有正式状态保持不变"],
  ] as const;
  for (const [status, conclusion, detail] of cases) {
    const value = model();
    value.workspace = "migration";
    value.v2MigrationRuns = [{
      token: `migration-plan:${status}`,
      status,
      summary: { total: 5, import: 2, keepOrdinary: 1, defer: 1, exclude: 1 },
      createdAt: "2026-07-21T08:00:00.000Z",
      updatedAt: "2026-07-21T09:00:00.000Z",
      batches: [],
    }];
    const html = renderApp(value);
    assert.match(html, new RegExp(conclusion));
    assert.match(html, new RegExp(detail));
    assert.match(html, /1 项保持普通内容/);
    assert.doesNotMatch(html, /migration-run:|a{12,}/);
  }
});

test("an activated Migration becomes a read-only handoff archive with no second-run controls", () => {
  const value = model();
  value.workspace = "migration";
  value.v2MigrationExecutionAvailable = true;
  value.v2MigrationScanAvailable = true;
  value.v2MigrationScan = {
    status: "ready",
    counts: { total: 1, directBind: 1, needsConfirmation: 0, keepOrdinary: 0, structuralError: 0 },
    message: "private session material",
  };
  value.v2MigrationRuns = [{
    token: "migration-plan:activated",
    status: "ACTIVATED",
    summary: { total: 2, import: 1, keepOrdinary: 1, defer: 0, exclude: 0 },
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T09:00:00.000Z",
    batches: [{
      token: "migration-batch:verified",
      status: "VERIFIED",
      importedCount: 1,
      validationObjectCount: 1,
      updatedAt: "2026-07-21T09:00:00.000Z",
    }],
  }];
  const html = renderApp(value);
  assert.match(html, /一次性迁移已完成 · 只读历史/);
  assert.match(html, /不再接受新的扫描、导入、撤销或启用操作/);
  assert.match(html, /更多 → 备份与恢复/);
  assert.doesNotMatch(html, /type="file"|migration-scan-local|migration-import-open|migration-batch-undo-open|migration-activate-open|private session material/);
});

test("Migration execution renders reselect, bounded scope, recovery, import, verify, and undo as separate user decisions", () => {
  const base = model();
  base.workspace = "migration";
  base.v2MigrationExecutionAvailable = true;
  base.v2MigrationRuns = [{
    token: "migration-plan:1",
    status: "PREVIEWED",
    summary: { total: 2, import: 1, keepOrdinary: 1, defer: 0, exclude: 0 },
    createdAt: "2026-07-26T08:00:00.000Z",
    updatedAt: "2026-07-26T09:00:00.000Z",
    batches: [],
  }];

  base.v2MigrationExecution = {
    status: "selecting-material",
    runToken: "migration-plan:1",
    message: "重新选择同一份材料。",
  };
  const selecting = renderApp(base);
  assert.match(selecting, /data-field="migrationImportBundleFile"/);
  assert.match(selecting, /data-action="migration-import-material"/);
  assert.match(selecting, /data-action="migration-import-open"/);
  assert.match(selecting, /data-action="migration-import-clear"/);

  base.v2MigrationExecution = {
    status: "material-ready",
    runToken: "migration-plan:1",
    items: [{ token: "migration-import-item:1", title: "准备导入的任务", titleTruncated: false, sourceObjectType: "TASK" }],
    selectedCount: 0,
    message: "请选择本批。",
  };
  const scope = renderApp(base);
  assert.match(scope, /data-field="migrationImportItem:migration-import-item:1"/);
  assert.match(scope, /data-action="migration-import-recovery"/);
  assert.doesNotMatch(scope, /migration-run:|backup_|a{12,}|legacy-private/);

  base.v2MigrationExecution = {
    status: "ready-to-import",
    runToken: "migration-plan:1",
    selectedCount: 1,
    recoveryPointReady: true,
    message: "恢复点已校验。",
  };
  const confirm = renderApp(base);
  assert.match(confirm, /data-field="migrationImportConfirm"/);
  assert.match(confirm, /data-action="migration-import-commit"/);
  assert.match(confirm, /尚不会启用 V2/);

  base.v2MigrationExecution = {
    status: "undo-confirm",
    runToken: "migration-plan:1",
    batchToken: "migration-batch:1",
    message: "只撤销未变化对象。",
  };
  const undo = renderApp(base);
  assert.match(undo, /data-field="migrationUndoConfirm"/);
  assert.match(undo, /data-action="migration-batch-undo"/);
  assert.match(undo, /审阅、验证与审计证据保留/);
});

test("Migration verified ledger survives reload and exposes safe verify or undo actions without formal identity", () => {
  const value = model();
  value.workspace = "migration";
  value.v2MigrationExecutionAvailable = true;
  value.v2MigrationExecution = { status: "idle" };
  value.v2MigrationRuns = [{
    token: "migration-plan:1",
    status: "VERIFIED",
    summary: { total: 2, import: 1, keepOrdinary: 1, defer: 0, exclude: 0 },
    createdAt: "2026-07-26T08:00:00.000Z",
    updatedAt: "2026-07-26T09:00:00.000Z",
    batches: [{
      token: "migration-batch:1",
      status: "VERIFIED",
      importedCount: 1,
      validationObjectCount: 1,
      updatedAt: "2026-07-26T09:00:00.000Z",
    }],
  }];
  const html = renderApp(value);
  assert.match(html, /批次 1 · 验证通过/);
  assert.match(html, /1 项已核对/);
  assert.match(html, /data-action="migration-batch-undo-open"/);
  assert.match(html, /data-action="migration-activate-open"/);
  assert.doesNotMatch(html, /migration-run:private|migration-batch:private|backup_|a{12,}|legacy-private/);
});

test("Migration activation is a separate HIGH handoff that forbids V1/V2 dual write", () => {
  const value = model();
  value.workspace = "migration";
  value.v2MigrationExecutionAvailable = true;
  value.v2MigrationRuns = [];
  value.v2MigrationExecution = {
    status: "activation-confirm",
    runToken: "migration-plan:1",
    message: "最终一致性检查。",
  };
  const html = renderApp(value);
  assert.match(html, /迁移最终切换 · HIGH/);
  assert.match(html, /data-field="migrationActivateConfirm"/);
  assert.match(html, /data-action="migration-activate"/);
  assert.match(html, /V1 只保留为只读历史与恢复证据，不建立双写/);
  assert.doesNotMatch(html, /runId|batchId|backup_|a{12,}/);
});

test("Migration workspace opens a session-only scan, bounded per-item review, and no direct formal write", () => {
  const idle = model();
  idle.workspace = "migration";
  idle.v2MigrationRuns = [];
  idle.v2MigrationScanAvailable = true;
  idle.v2MigrationScan = { status: "idle" };
  const idleHtml = renderApp(idle);
  assert.match(idleHtml, /选择 V1 Recovery Bundle/);
  assert.match(idleHtml, /type="file"/);
  assert.match(idleHtml, /data-action="migration-scan-local"/);
  assert.match(idleHtml, /这里只做只读校验与分类/);

  const ready = model();
  ready.workspace = "migration";
  ready.v2MigrationRuns = [];
  ready.v2MigrationScanAvailable = true;
  ready.v2MigrationScan = {
    status: "ready",
    counts: { total: 2, directBind: 1, needsConfirmation: 0, keepOrdinary: 0, structuralError: 1 },
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    items: [{
      token: "migration-item:1",
      title: "整理发布前检查",
      titleTruncated: false,
      sourceObjectType: "TASK",
      classification: "DIRECT_BIND",
      oldPhase: "ACTIVE",
      oldConditionKind: "ACTIONABLE",
      suggestedObjectType: "TASK",
      suggestedLifecycle: "OPEN",
      suggestedCondition: { kind: "ACTIONABLE" },
    }, {
      token: "migration-item:2",
      title: "边界冲突材料",
      titleTruncated: false,
      sourceObjectType: "RESOURCE",
      classification: "STRUCTURAL_ERROR",
      oldPhase: "ARCHIVED",
      oldConditionKind: "NONE",
    }],
    previewStatus: "idle",
    decisionsComplete: false,
    message: "只读扫描完成；请逐项确认，尚未创建迁移计划。",
  };
  const readyHtml = renderApp(ready);
  assert.match(readyHtml, /只读扫描完成 · 正式变化 0/);
  assert.match(readyHtml, /1 项初步可直接迁移 · 0 项需要确认 · 0 项建议保持普通内容 · 1 项需先处理冲突/);
  assert.match(readyHtml, /当前窗口会话内/);
  assert.match(readyHtml, /整理发布前检查/);
  assert.match(readyHtml, /可以按现有事实迁移 · 来源是任务/);
  assert.match(readyHtml, /请先处理材料冲突 · 来源是资料/);
  assert.match(readyHtml, /data-field="migrationDecisionAction:migration-item:1"/);
  assert.match(readyHtml, /data-action="migration-review-save" data-value="migration-item:2"/);
  assert.match(readyHtml, /data-field="migrationDecisionObjectType:migration-item:2"><option value="" selected>/);
  assert.match(readyHtml, /data-field="migrationDecisionLifecycle:migration-item:2"><option value="" selected>/);
  assert.match(readyHtml, /data-field="migrationDecisionCondition:migration-item:2"><option value="" selected>/);
  assert.match(readyHtml, /data-action="migration-scan-clear"/);
  assert.doesNotMatch(readyHtml, /data-action="migration-review-preview"/);
  assert.doesNotMatch(readyHtml, /data-action="migration-(?:import|verify|activate|undo)"/);
  assert.doesNotMatch(readyHtml, /DIRECT_BIND|STRUCTURAL_ERROR|legacyObjectId|sourceBundleSha256|private-object-id|run_id|backup_/);
  assert.doesNotMatch(readyHtml, /Local Service|SQLite|reload|Graph/);

  const completedItems = ready.v2MigrationScan.items ?? [];
  ready.v2MigrationScan = {
    ...ready.v2MigrationScan,
    items: completedItems.map((item) => item.token === "migration-item:1"
      ? { ...item, decision: { action: "IMPORT", objectType: "TASK", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" } } }
      : { ...item, decision: { action: "DEFER", reviewNote: "先修复来源材料冲突" } }),
    decisionsComplete: true,
  };
  const completeHtml = renderApp(ready);
  assert.match(completeHtml, /本项判断已保存/);
  assert.match(completeHtml, /保存审阅并创建迁移计划/);
  assert.match(completeHtml, /data-action="migration-review-preview"/);
  assert.match(completeHtml, /会写入逐项审阅与迁移台账，但不会导入正式对象/);
  assert.doesNotMatch(completeHtml, /data-action="migration-(?:import|verify|activate|undo)"/);

  ready.v2MigrationScan = {
    ...ready.v2MigrationScan,
    previewStatus: "uncertain",
    message: "本次请求结果无法确认；请先看下方迁移台账。",
  };
  const uncertainHtml = renderApp(ready);
  assert.match(uncertainHtml, /用相同判断重试创建计划/);
  assert.match(uncertainHtml, /下方台账是当前权威/);
  assert.match(uncertainHtml, /data-action="migration-review-save"[^>]*disabled/);
  assert.doesNotMatch(uncertainHtml, /尚未保存到迁移台账/);

  ready.v2MigrationScan = {
    status: "idle",
    message: "迁移计划已创建：2 项完成审阅，1 项准备迁移；尚未导入正式对象。",
  };
  assert.match(renderApp(ready), /迁移计划已创建：2 项完成审阅，1 项准备迁移；尚未导入正式对象/);
});

test("Migration workspace renders only the controller's bounded failure and not remote bundle internals", async () => {
  const controller = new MigrationScanController();
  const error = new Error("objects.jsonl checksum mismatch: private-object-id aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") as Error & { code: string };
  error.code = "SERVICE_HTTP_ERROR";
  await assert.rejects(() => controller.scan({
    async scanLegacyMigration() {
      throw error;
    },
  }, JSON.stringify({ bundleVersion: 1 })));
  const value = model();
  value.workspace = "migration";
  value.v2MigrationRuns = [];
  value.v2MigrationScanAvailable = true;
  value.v2MigrationScan = controller.snapshot();
  const html = renderApp(value);
  assert.match(html, /迁移材料暂时无法完成安全检查/);
  assert.doesNotMatch(html, /objects\.jsonl|checksum|private-object-id|a{12,}/);
});

test("Project workspace requires adaptive Grill and exposes no direct-creation bypass", () => {
  const unavailable = renderApp(model());
  assert.match(unavailable, /V2 · Project Grill Me/);
  assert.match(unavailable, /data-action="v2-project-creation-grill-open"[^>]*disabled/);
  const available = model();
  available.v2ProjectCreationGrillAvailable = true;
  const html = renderApp(available);
  assert.match(html, /data-action="v2-project-creation-grill-open" data-value="BLANK"/);
  assert.doesNotMatch(html, /data-action="v2-project-creation-grill-open"[^>]*disabled/);
  assert.doesNotMatch(html, /data-action="create-v2-project"|data-field="v2ProjectName"|直接创建/);
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

test("MiniProject Grill renders a session-only multi-turn boundary with loading, error recovery, and no formal action", () => {
  const value = model();
  value.v2Objects = [{ objectId: "mini-open", objectType: "MINI_PROJECT", version: 4, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "梳理发布边界", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "test" }];
  value.v2MiniProjectGrillAvailable = true;
  let html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-grill-open" data-value="mini-open\|4"/);

  const result = {
    output: {
      schemaVersion: "task-copilot-grill-turn-v1" as const,
      understanding: "当前目标是交付一个可验证的发布结果。",
      facts: [{ text: "原文列出两项交付", sourceRefs: ["block:block-mini"] }],
      inferences: [{ text: "长期治理可能超出边界", evidenceRefs: ["block:block-mini"] }],
      unknowns: [{ uncertaintyId: "boundary", dimension: "BOUNDARY" as const, text: "长期治理是否属于这次结果？" }],
      readiness: "CONTINUE" as const,
      questionGroup: { focusUncertaintyId: "boundary", questions: [{ uncertaintyId: "boundary", text: "哪些内容明确不属于本次交付？" }], recommendation: { text: "先排除长期治理。", evidenceRefs: ["block:block-mini"], tradeoffs: ["范围更窄但更可验收"] } },
      evidenceScope: { refs: ["block:block-mini"], scopeHash: "scope-hash", observedAt: "2026-07-24T12:00:00.000Z" },
      authorityBoundary: "SESSION_DRAFT_ONLY" as const,
      provenance: { contractVersion: "1.0.0", promptVersion: "prompt-hash", skillName: "mini-project-modeling", skillVersion: "1.0.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "deepseek-chat", generatedAt: "2026-07-24T12:00:00.000Z" },
    },
    provider: { model: "deepseek-chat", durationMs: 12, attempts: 1 }, promptBundleVersion: "prompt-hash", contextFingerprint: "fingerprint",
  };
  value.actionDialog = { kind: "v2-mini-project-grill", value: "mini-open|4" };
  value.originReturnLabel = "返回原内容";
  value.v2MiniProjectGrill = { "mini-open": { status: "ready", expectedVersion: 4, answers: [], result } };
  html = renderApp(value);
  assert.match(html, /事实、判断和未知分开显示/);
  assert.match(html, /当前目标是交付一个可验证的发布结果/);
  assert.match(html, /哪些内容明确不属于本次交付/);
  assert.match(html, /data-field="v2MiniProjectGrillAnswer"/);
  assert.match(html, /返回原内容/);
  assert.doesNotMatch(html, /data-action="(?:submit-v2-proposal|v2-proposal-commit|submit-v2-review-accept)"/);

  value.v2MiniProjectGrill["mini-open"] = { status: "error", expectedVersion: 4, answers: [], previous: result, message: "这次梳理没有完成。正文和正式事项没有变化，你可以重试。" };
  html = renderApp(value);
  assert.match(html, /这次梳理没有完成/);
  assert.match(html, /当前目标是交付一个可验证的发布结果/);
  assert.match(html, /data-action="v2-mini-project-grill-retry"/);

  const { questionGroup: _questionGroup, ...readyOutput } = result.output;
  void _questionGroup;
  const readyResult = { ...result, output: { ...readyOutput, readiness: "READY_FOR_PREVIEW" as const, unknowns: [] } };
  value.v2MiniProjectGrillPreviewAvailable = true;
  value.v2MiniProjectGrillProposalAvailable = true;
  value.v2MiniProjectGrill["mini-open"] = { status: "ready", expectedVersion: 4, answers: [], result: readyResult };
  html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-grill-preview"/);
  value.v2MiniProjectGrill["mini-open"] = { status: "ready", expectedVersion: 4, answers: [], result: readyResult, preview: { status: "ready", result: {
    output: {
      schemaVersion: "task-copilot-grill-preview-v1",
      finalReading: {
        title: { text: "发布边界梳理", evidenceRefs: ["block:block-mini"] }, outcome: { text: "形成可验收的发布结果", evidenceRefs: ["block:block-mini"] },
        boundary: { included: [{ text: "本次发布", evidenceRefs: ["block:block-mini"] }], excluded: [{ text: "长期治理", evidenceRefs: ["answer:boundary"] }] },
        completionEvidence: [{ text: "发布结果可复核", evidenceRefs: ["block:block-mini"] }],
        sections: [
          { sectionId: "root", heading: "原始入口", purpose: "保留原 Block", sourceMaterials: [{ materialId: "root", sourceRef: "block:block-mini", contentHash: "12345678", text: "[MiniProject] 发布边界梳理", preservation: "UNCHANGED" }], derivedBlocks: [] },
          { sectionId: "outcome", heading: "发布结果", purpose: "放置验收结论", sourceMaterials: [], derivedBlocks: [{ text: "形成可验收发布结果", evidenceRefs: ["block:block-mini"] }] },
        ],
      },
      unclassified: [{ materialId: "material-2", sourceRef: "block:block-loose", contentHash: "23456789", text: "待判断材料", reason: "去向尚未确认", evidenceRefs: ["block:block-loose"], preservation: "UNCHANGED_IN_PLACE" }],
      impact: { sourceMaterialCount: 2, movedMaterialCount: 0, addedDerivedBlockCount: 1, deletedMaterialCount: 0, unclassifiedMaterialCount: 1 },
      evidenceScope: { refs: ["block:block-mini", "block:block-loose"], scopeHash: "scope-hash", observedAt: "2026-07-24T12:00:00.000Z" }, authorityBoundary: "SESSION_PREVIEW_ONLY",
      provenance: { contractVersion: "1.0.0", promptVersion: "preview-hash", skillName: "mini-project-modeling", skillVersion: "1.0.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "deepseek-chat", generatedAt: "2026-07-24T12:00:00.000Z" },
    }, provider: { model: "deepseek-chat", durationMs: 12, attempts: 1 }, promptBundleVersion: "preview-hash", contextFingerprint: "fingerprint", previewHandle: "grill_preview_aaaaaaaaaaaaaaaaaaaaaaaa",
  } } };
  html = renderApp(value);
  assert.match(html, /零丢失阅读预览 · 尚未应用/);
  assert.match(html, /原材料 2/);
  assert.match(html, /删除 0/);
  assert.match(html, /待判断／原始材料（原位保留）/);
  assert.match(html, /data-action="v2-mini-project-grill-proposal"/);
  assert.match(html, /只有之后明确“确认应用”才会改变正文/);
  assert.match(html, /查看讨论依据/);
  assert.ok(html.indexOf("零丢失阅读预览") < html.indexOf("已确认事实"));
  const previewDialog = html.match(/<section class="inbox-dialog action-dialog mini-project-grill"[\s\S]*?<\/section>/)?.[0] ?? "";
  const visiblePreviewDialog = previewDialog.replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(visiblePreviewDialog, /Session only|Provider|Proposal|Commit|SQLite|HIGH|SESSION_DRAFT_ONLY/);
  assert.doesNotMatch(html, /data-action="(?:submit-v2-proposal|v2-proposal-commit|submit-v2-review-accept)"/);
  const readyPreview = value.v2MiniProjectGrill["mini-open"];
  if (readyPreview?.status === "ready" && readyPreview.preview?.status === "ready") {
    value.v2MiniProjectGrill["mini-open"] = {
      ...readyPreview,
      preview: {
        ...readyPreview.preview,
        proposal: { status: "not-needed", message: "当前材料已经处于预览结构，无需创建 Proposal 或改动正文。" },
      },
    };
  }
  html = renderApp(value);
  assert.match(html, /讨论已完成，无需正式变更/);
  assert.doesNotMatch(html, /data-action="v2-mini-project-grill-proposal"/);
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
  assert.match(html, /正文、当前关注、归属和位置保持不变/);
  value.actionDialog = { kind: "confirm-v2-reasoned-lifecycle", value: "prop-cancel|2026-07-22T13:00:01.000Z|CANCEL" };
  html = renderApp(value);
  assert.match(html, /data-action="submit-v2-reasoned-lifecycle"/);
  assert.match(html, /只改变是否继续，不改写正文/);
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:cancel", proposalId: "prop-cancel", status: "PENDING", beforeStateChecksum: "before", createdAt: "2026-07-22T13:00:00.000Z", updatedAt: "2026-07-22T13:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /继续上次修改/);
  assert.match(html, /沿用原记录/);
  assert.match(html, /data-action="submit-v2-reasoned-lifecycle"[^>]*>确认继续</);

  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:cancel", proposalId: "prop-cancel", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-22T13:00:00.000Z", updatedAt: "2026-07-22T13:01:00.000Z" }];
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
  assert.match(html, /继续处理/);
  assert.match(html, /近期建立，可直接推进/);
  assert.doesNotMatch(html, /来自当前关注/);
  assert.doesNotMatch(html, /需要回看/);
  assert.doesNotMatch(html, /保持等待/);
  assert.doesNotMatch(html, /score|健康分|风险分/);
  assert.match(html, /data-action="v2-open-primary-anchor" data-value="block-next"/);
  assert.match(html, /data-action="v2-focus-add" data-value="task-next\|2"/);
  assert.match(html, /data-action="v2-condition-open" data-value="task-next\|2"/);
});

test("V2 Now Work adds bounded Task owner context without replacing the single primary action", () => {
  const value = model();
  value.workspace = "now";
  const observedAt = "2026-07-31T08:00:00.000Z";
  const task = {
    objectId: "task-owned",
    objectType: "TASK" as const,
    version: 4,
    lifecycle: "OPEN" as const,
    condition: { kind: "ACTIONABLE" as const },
    text: "核对发布材料",
    sourceOrCreationEvent: "test",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  const project = {
    objectId: "project-owner",
    objectType: "PROJECT" as const,
    version: 2,
    lifecycle: "OPEN" as const,
    condition: { kind: "ACTIONABLE" as const },
    text: "发布治理",
    sourceOrCreationEvent: "test",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  value.v2NowWork = {
    generatedAt: observedAt,
    focus: [{
      objectId: task.objectId,
      objectType: task.objectType,
      version: task.version,
      text: task.text,
      condition: task.condition,
      updatedAt: task.updatedAt,
      reason: "来自用户明确关注",
      primaryAnchorExternalId: "block-task-owned",
    }],
    next: [],
    waitingReview: [],
    conditionOptions: [],
  };
  value.v2TaskReentryCards = projectPluginV2TaskReentry({
    observedAt,
    objects: [project, task],
    ownerships: [{ ownerObjectId: project.objectId, childObjectId: task.objectId, assignedAt: observedAt }],
    anchors: [{
      anchorId: "anchor-task-owned",
      objectId: task.objectId,
      graphId: "graph-1",
      externalId: "block-task-owned",
      role: "primary_text",
      status: "active",
      contentHash: "hash-task-owned",
      lastSeenAt: observedAt,
    }],
    proposals: [],
    commits: [],
  });

  const html = renderApp(value);
  const card = html.match(/<article class="card compact now-card"[\s\S]*?<\/article>/)?.[0] ?? "";
  assert.match(card, /所属项目：发布治理/);
  assert.doesNotMatch(card, /所属 Project|Anchor|Commit/);
  assert.equal((card.match(/class="primary"/g) ?? []).length, 1);
  assert.match(card, /data-action="v2-open-primary-anchor" data-value="block-task-owned"[^>]*>继续处理/);
});

test("V2 Now Work makes Task recovery the only action and hides internal recovery vocabulary", () => {
  const value = model();
  value.workspace = "now";
  const observedAt = "2026-07-31T08:00:00.000Z";
  const task = {
    objectId: "task-recovery",
    objectType: "TASK" as const,
    version: 5,
    lifecycle: "OPEN" as const,
    condition: { kind: "ACTIONABLE" as const },
    text: "恢复发布材料",
    sourceOrCreationEvent: "test",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  value.v2NowWork = {
    generatedAt: observedAt,
    focus: [{
      objectId: task.objectId,
      objectType: task.objectType,
      version: task.version,
      text: task.text,
      condition: task.condition,
      updatedAt: task.updatedAt,
      reason: "近期更新，可继续推进",
      dueAt: "2026-07-31T07:00:00.000Z",
      primaryAnchorExternalId: "block-task-recovery",
    }],
    next: [],
    waitingReview: [],
    conditionOptions: [],
  };
  value.v2AttentionNowPilot = [{
    signalId: "attention-task-recovery",
    objectId: task.objectId,
    signalType: "DUE",
  }];
  value.v2TaskReentryCards = projectPluginV2TaskReentry({
    observedAt,
    objects: [task],
    ownerships: [],
    anchors: [{
      anchorId: "anchor-task-recovery",
      objectId: task.objectId,
      graphId: "graph-1",
      externalId: "block-task-recovery",
      role: "primary_text",
      status: "active",
      contentHash: "hash-task-recovery",
      lastSeenAt: observedAt,
    }],
    proposals: [{
      updatedAt: observedAt,
      files: { proposalMd: "# recovery", proposalJson: "{}" },
      proposal: {
        proposalId: "proposal-task-recovery",
        schemaVersion: "v2",
        title: "更新发布材料",
        context: "context",
        understanding: "understanding",
        objective: "objective",
        logic: "logic",
        finalPreview: "preview",
        unresolvedQuestions: [],
        source: { kind: "user" },
        scope: { read: [], modify: [{ kind: "OBJECT", id: task.objectId, version: task.version }] },
        preconditions: [],
        groups: [],
        status: "ACCEPTED",
        createdAt: observedAt,
      },
    }],
    commits: [{
      semanticCommitId: "commit-task-recovery",
      proposalId: "proposal-task-recovery",
      status: "RECOVERY_REQUIRED",
      beforeStateChecksum: "before",
      createdAt: observedAt,
      updatedAt: observedAt,
    }],
  });

  const html = renderApp(value);
  const card = html.match(/<article class="card compact now-card"[\s\S]*?<\/article>/)?.[0] ?? "";
  assert.match(card, /上一次修改需要恢复/);
  assert.match(card, /相关写入已经停止/);
  assert.match(card, /data-action="view" data-value="audit"[^>]*>查看差异与恢复记录/);
  assert.doesNotMatch(card, /RECOVERY_REQUIRED|Commit|Proposal|Anchor|更新状态|设置期限|移出关注|打开正文|来自当前关注|Copilot 提醒|期限：/);
  assert.doesNotMatch(card, /<details class="more-actions">/);
  assert.equal((card.match(/class="primary"/g) ?? []).length, 1);
});

test("V2 Now Work ignores Task reentry projected from another Object version", () => {
  const value = model();
  value.workspace = "now";
  const observedAt = "2026-07-31T08:00:00.000Z";
  const task = {
    objectId: "task-stale-reentry",
    objectType: "TASK" as const,
    version: 3,
    lifecycle: "OPEN" as const,
    condition: { kind: "ACTIONABLE" as const },
    text: "核对版本",
    sourceOrCreationEvent: "test",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  value.v2NowWork = {
    generatedAt: observedAt,
    focus: [],
    next: [{
      objectId: task.objectId,
      objectType: task.objectType,
      version: 4,
      text: task.text,
      condition: task.condition,
      updatedAt: task.updatedAt,
      reason: "Service 当前理由",
      primaryAnchorExternalId: "block-task-stale",
    }],
    waitingReview: [],
    conditionOptions: [],
  };
  value.v2TaskReentryCards = projectPluginV2TaskReentry({
    observedAt,
    objects: [task],
    ownerships: [],
    anchors: [{
      anchorId: "anchor-task-stale",
      objectId: task.objectId,
      graphId: "graph-1",
      externalId: "block-task-stale",
      role: "primary_text",
      status: "active",
      contentHash: "hash-task-stale",
      lastSeenAt: observedAt,
    }],
    proposals: [],
    commits: [],
  });

  const html = renderApp(value);
  assert.match(html, /Service 当前理由/);
  assert.doesNotMatch(html, /当前进入点不明确|需要打开原文才能判断从哪里继续/);
  assert.match(html, /data-action="v2-open-primary-anchor" data-value="block-task-stale"/);
});

test("V2 Now Work fails closed when Task recovery facts are unavailable", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = {
    generatedAt: "2026-07-31T08:00:00.000Z",
    focus: [],
    next: [{
      objectId: "task-unavailable-reentry",
      objectType: "TASK",
      version: 2,
      text: "核对未完成修改",
      condition: { kind: "ACTIONABLE" },
      updatedAt: "2026-07-31T07:00:00.000Z",
      reason: "近期更新，可继续推进",
      dueAt: "2026-07-31T09:00:00.000Z",
      primaryAnchorExternalId: "block-task-unavailable",
    }],
    waitingReview: [],
    conditionOptions: [],
  };
  value.v2TaskReentryLoadError = "未能读取未完成修改";

  const html = renderApp(value);
  const card = html.match(/<article class="card compact now-card"[\s\S]*?<\/article>/)?.[0] ?? "";
  assert.match(card, /当前安全状态暂时无法核对/);
  assert.match(card, /正式内容没有因此改变/);
  assert.match(card, /data-action="view" data-value="audit"[^>]*>核对未完成修改/);
  assert.doesNotMatch(card, /近期更新，可继续推进|更新状态|设置期限|加入关注|打开正文|期限：/);
  assert.doesNotMatch(html, /未能读取未完成修改/);
});

test("V2 Now Work keeps the first four next items visible and folds the rest without losing them", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = {
    generatedAt: "2026-07-28T12:00:00.000Z",
    focus: [],
    waitingReview: [],
    conditionOptions: [],
    next: Array.from({ length: 6 }, (_, index) => ({
      objectId: `task-${index + 1}`,
      objectType: "TASK" as const,
      version: 1,
      text: `连续事项 ${index + 1}`,
      condition: { kind: "ACTIONABLE" as const },
      updatedAt: `2026-07-${String(28 - index).padStart(2, "0")}T12:00:00.000Z`,
      reason: "当前可以继续推进",
      primaryAnchorExternalId: `block-${index + 1}`,
    })),
  };

  const html = renderApp(value);
  assert.match(html, /查看其余 2 项/);
  assert.ok(html.indexOf("连续事项 4") < html.indexOf("now-work-overflow"));
  assert.ok(html.indexOf("连续事项 5") > html.indexOf("now-work-overflow"));
  for (let index = 1; index <= 6; index += 1) assert.match(html, new RegExp(`连续事项 ${index}`));
});

test("V2 Now Work never folds explicit Focus behind the ordinary continuation limit", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = {
    generatedAt: "2026-07-28T12:00:00.000Z",
    waitingReview: [],
    conditionOptions: [],
    focus: Array.from({ length: 6 }, (_, index) => ({
      objectId: `focus-${index + 1}`,
      objectType: "TASK" as const,
      version: 1,
      text: `用户关注 ${index + 1}`,
      condition: { kind: "ACTIONABLE" as const },
      updatedAt: `2026-07-${String(28 - index).padStart(2, "0")}T12:00:00.000Z`,
      reason: "来自用户明确关注",
      primaryAnchorExternalId: `focus-block-${index + 1}`,
    })),
    next: Array.from({ length: 6 }, (_, index) => ({
      objectId: `next-${index + 1}`,
      objectType: "TASK" as const,
      version: 1,
      text: `普通推进 ${index + 1}`,
      condition: { kind: "ACTIONABLE" as const },
      updatedAt: `2026-07-${String(20 - index).padStart(2, "0")}T12:00:00.000Z`,
      reason: "当前可以继续推进",
      primaryAnchorExternalId: `next-block-${index + 1}`,
    })),
  };

  const html = renderApp(value);
  assert.ok(html.indexOf("用户关注 6") < html.indexOf("now-work-overflow"));
  assert.ok(html.indexOf("普通推进 4") < html.indexOf("now-work-overflow"));
  assert.ok(html.indexOf("普通推进 5") > html.indexOf("now-work-overflow"));
  assert.match(html, /查看其余 2 项/);
});

test("V2 Now Work leads with version-matched Object narration and reuses the Condition handler", () => {
  const value = model();
  value.workspace = "now";
  const observedAt = "2026-07-24T12:00:00.000Z";
  const waiting = {
    objectId: "task-waiting-review",
    objectType: "TASK" as const,
    version: 5,
    lifecycle: "OPEN" as const,
    condition: {
      kind: "WAITING" as const,
      waitingFor: "厂家",
      expectedResult: "功耗参数",
      reviewAt: "2026-07-24T09:00:00.000Z",
    },
    text: "完成资源测算",
    sourceOrCreationEvent: "test",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
  };
  value.v2NowWork = {
    generatedAt: observedAt,
    focus: [],
    next: [],
    waitingReview: [{
      objectId: waiting.objectId,
      objectType: waiting.objectType,
      version: waiting.version,
      text: waiting.text,
      condition: waiting.condition,
      updatedAt: waiting.updatedAt,
      reason: "等待复查",
    }],
    conditionOptions: [],
  };
  value.v2ObjectNarrations = projectPluginObjectNarrations([waiting], observedAt);

  const html = renderApp(value);
  assert.match(html, /该确认已到复查时间/);
  assert.match(html, /等待厂家提供功耗参数/);
  assert.match(html, /data-narration-rule="condition-waiting-review-due"/);
  assert.match(html, /data-action="v2-condition-open" data-value="task-waiting-review\|5"[^>]*>确认是否已收到功耗参数/);
  assert.doesNotMatch(html, /WAITING/);
});

test("V2 Now Work does not use a narration projected from another Object version", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = {
    generatedAt: "2026-07-24T12:00:00.000Z",
    focus: [],
    next: [{
      objectId: "task-stale-narration",
      objectType: "TASK",
      version: 3,
      text: "核对版本",
      condition: { kind: "ACTIONABLE" },
      updatedAt: "2026-07-24T11:00:00.000Z",
      reason: "Service 当前理由",
    }],
    waitingReview: [],
    conditionOptions: [],
  };
  value.v2ObjectNarrations = {
    "task-stale-narration": {
      objectVersion: 2,
      narration: {
        conclusion: "不应显示的旧结论",
        keyEvidence: [],
        facts: [],
        inferences: [],
        unknowns: [],
        nextActionEligible: false,
        evidenceScope: { refs: ["object:task-stale-narration@v2"], observedAt: "2026-07-24T12:00:00.000Z" },
        source: { kind: "DETERMINISTIC_RULE", ruleId: "stale", version: "1.0.0" },
      },
    },
  };

  const html = renderApp(value);
  assert.match(html, /Service 当前理由/);
  assert.doesNotMatch(html, /不应显示的旧结论|data-narration-rule="stale"/);
});

test("V2 Condition is edited in one in-context form with explicit Waiting evidence", () => {
  const value = model();
  value.v2NowWork = { generatedAt: "2026-07-20T12:00:00.000Z", focus: [], next: [], waitingReview: [], conditionOptions: [{ objectId: "blocker-task", objectType: "TASK", text: "恢复真实事件" }] };
  value.actionDialog = { kind: "v2-condition", value: "task-next|2" };
  const html = renderApp(value);
  assert.match(html, /只记录眼下是否能继续，不会改变是否完成、当前关注或归属/);
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

test("V2 Now adds the bounded Attention pilot to an existing card instead of creating another reminder card", () => {
  const value = model();
  value.workspace = "now";
  value.v2NowWork = {
    generatedAt: "2026-07-24T12:00:00.000Z",
    focus: [],
    waitingReview: [],
    conditionOptions: [],
    next: [{
      objectId: "task-due",
      objectType: "TASK",
      version: 3,
      text: "核对期限",
      condition: { kind: "ACTIONABLE" },
      dueAt: "2026-07-24T09:00:00.000Z",
      updatedAt: "2026-07-24T08:00:00.000Z",
      reason: "期限已到",
      primaryAnchorExternalId: "block-due",
    }],
  };
  value.v2AttentionNowPilot = [{
    signalId: "attention_due",
    objectId: "task-due",
    signalType: "DUE",
  }];

  const html = renderApp(value);
  assert.equal((html.match(/核对期限/g) ?? []).length, 1);
  assert.match(html, /Copilot 提醒 · 试用/);
  assert.match(html, /data-action="v2-open-primary-anchor" data-value="block-due\|attention=attention_due"/);
  assert.match(html, /data-action="v2-attention-disposition" data-value="attention_due\|LATER"[^>]*>本次先不提醒/);
  assert.match(html, /data-action="v2-attention-disposition" data-value="attention_due\|NOT_RELEVANT"[^>]*>本次不相关/);
  assert.doesNotMatch(html, /AttentionSignal|REVIEW_DUE|\bDUE\b/);
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
  assert.match(html, /保持等待/);
  assert.match(html, /来自当前关注/);
  assert.equal((html.match(/等待样本/g) ?? []).length, 1);
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
  assert.match(html, /aria-label="现在：筛选与分组"/);
  assert.match(html, /data-action="v2-now-filter" data-value="TASK"/);
  assert.match(html, /data-action="v2-now-grouping" data-value="type"/);
  assert.match(html, /<h3>任务<\/h3>/);
  assert.match(html, /<div class="eyebrow">任务<\/div>/);
  assert.doesNotMatch(html, /<div class="eyebrow">(?:PROJECT|MINI_PROJECT|TASK|AREA|DECISION|OUTPUT)<\/div>/);
  assert.match(html, /核对事件/);
  assert.doesNotMatch(html, /治理告警/);
  assert.doesNotMatch(html, /data-action="v2-focus-(?:up|down)"/);
  assert.match(html, /手动调整“当前关注”顺序/);
  assert.doesNotMatch(html, /Now Work|Focus/);
});

test("Review Center owns manual current-page candidate discovery instead of Diagnostics", () => {
  const value = model();
  value.workspace = "review";
  value.v2CandidatePanel = { status: "idle" };
  value.v2CandidateAvailable = true;
  const html = renderApp(value);
  assert.match(html, /从当前页发现待整理内容/);
  assert.match(html, /data-action="v2-candidate-open"/);
  assert.match(html, /不扫描整个知识库/);
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
  assert.match(html, /只进入待整理列表，不会创建正式事项/);
  assert.ok(html.indexOf("核对真实原文") < html.indexOf("明确标记") && html.indexOf("明确标记") < html.indexOf("生成 任务 可审阅方案"), "original content precedes translated reason and suggestion");
  assert.doesNotMatch(html, /Proposal|Candidate/);
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
  assert.match(html, /AI 辅助 · 只读分析/);
  assert.match(html, /data-action="v2-provider-analyze-current-block"[^>]*disabled aria-busy="true"/);
  assert.match(html, /只生成一份可审阅方案/);
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
      proposalId: "prop_v2", schemaVersion: "v2", title: "正式化告警", context: "当前普通正文。", understanding: "建议 Task。", objective: "建立对象。", logic: "正文语义一起提交。", finalPreview: "[任务] 告警", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-v2", version: 1, hash: checksum("告警") }] }, preconditions: [],
      groups: [{ groupId: "formalize", explanation: "不可拆组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-v2", beforeText: "告警", afterText: "[任务] 告警", beforeHash: checksum("告警"), afterHash: checksum("[任务] 告警") }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-v2", version: 1, hash: checksum("告警") }, summary: "创建 Task 与 Anchor", payload: { objectType: "TASK", text: "告警" }, preconditions: [] }], disposition: "PENDING" }],
      status: "READY", createdAt: "2026-07-20T12:00:00.000Z",
    },
  }];
  let html = renderApp(value);
  assert.match(html, /系统理解[\s\S]*\[任务\] 告警/);
  assert.match(html, /本次会改变什么[\s\S]*更新 1 处正文/);
  assert.match(html, /查看完整依据[\s\S]*语义变化/);
  assert.doesNotMatch(html, /data-action="v2-low-risk-apply"/);
  for (const action of ["v2-review-accept", "v2-review-reject", "v2-review-defer"]) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.match(html, /审阅方案只记录你的选择，尚未修改正式内容/);
  value.v2Proposals[0]!.proposal.groups[0]!.risk = "LOW";
  html = renderApp(value);
  assert.match(html, /确认并应用/);
  assert.match(html, /data-action="v2-low-risk-apply"/);
  value.v2LowRiskApplyBusyProposalId = "prop_v2";
  html = renderApp(value);
  assert.match(html, /正在应用…/);
  assert.match(html, /data-action="v2-low-risk-apply"[^>]*disabled/);
  delete value.v2LowRiskApplyBusyProposalId;
  value.v2Proposals[0]!.proposal.groups[0]!.risk = "MEDIUM";
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
  assert.match(html, /方案已审阅，等待确认应用/);
  assert.match(html, /上一步只是确认方案/);
  assert.doesNotMatch(html, /data-action="v2-proposal-revalidate"/);
  assert.match(html, /data-action="v2-proposal-commit"/);
  value.v2SemanticCommits = [{
    semanticCommitId: "proposal-commit:pending",
    proposalId: "prop_v2",
    status: "PENDING",
    beforeStateChecksum: "before",
    createdAt: "2026-07-20T12:02:00.000Z",
    updatedAt: "2026-07-20T12:03:00.000Z",
  }];
  html = renderApp(value);
  assert.match(html, /修改尚未完成，可以继续/);
  assert.match(html, /沿用原记录/);
  assert.match(html, /data-action="v2-proposal-commit"[^>]*>继续原修改</);
  assert.doesNotMatch(html, /方案已审阅，等待确认应用|上一步只是确认方案/);
  value.actionDialog = { kind: "confirm-v2-commit", value: "prop_v2|2026-07-20T12:00:01.000Z" };
  html = renderApp(value);
  assert.match(html, /继续上次修改/);
  assert.match(html, /沿用原记录/);
  assert.match(html, /本次操作[\s\S]*正式化告警[\s\S]*更新 1 处正文/);
  assert.match(html, /data-action="submit-v2-proposal-commit"[^>]*>确认继续</);
  assert.equal(html.match(/data-action="submit-v2-proposal-commit"/g)?.length, 1);
  assert.doesNotMatch(html, /aria-label="主要工作区"|class="section-nav"|data-action="v2-proposal-commit"/);
  delete value.actionDialog;
  value.v2SemanticCommits[0]!.status = "RECOVERY_REQUIRED";
  value.v2SemanticCommits[0]!.errorCode = "VERIFY_FAILED";
  html = renderApp(value);
  assert.match(html, /上次修改需要恢复/);
  assert.match(html, /data-action="v2-proposal-commit"[^>]*>恢复到安全状态</);
  assert.doesNotMatch(html, /确认应用/);
  value.actionDialog = { kind: "confirm-v2-commit", value: "prop_v2|2026-07-20T12:00:01.000Z" };
  html = renderApp(value);
  assert.match(html, /恢复到安全状态/);
  assert.match(html, /同一恢复记录/);
  assert.match(html, /data-action="submit-v2-proposal-commit"[^>]*>确认恢复</);
  assert.doesNotMatch(html, /上次修改需要恢复|data-action="v2-proposal-commit"/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "STALE";
  value.v2SemanticCommits = [];
  html = renderApp(value);
  assert.match(html, /待审阅/);
  assert.doesNotMatch(html, /待审阅 \(1\)/);
  assert.match(html, /当前没有需要审阅的方案/);
  assert.match(html, /<details class="review-history"><summary>历史记录（1）<\/summary>/);
  assert.doesNotMatch(html.split('<details class="review-history">')[0]!, /方案已变化，需要重新检查/);
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:abc", proposalId: "prop_v2", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-20T12:00:00.000Z", updatedAt: "2026-07-20T12:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /当前没有需要审阅的方案/);
  assert.match(html, /<details class="review-history"><summary>历史记录（1）<\/summary>/);
  assert.doesNotMatch(html, /<details class="review-history"[^>]*\sopen/);
  assert.doesNotMatch(html, /Agent 已关闭/);
  assert.match(html, /基础功能仍可使用/);
  assert.match(html, /data-action="v2-proposal-undo"/);
  assert.match(html, /已正式应用/);

  value.actionDialog = { kind: "confirm-v2-undo", value: "proposal-commit:abc" };
  html = renderApp(value);
  assert.match(html, /本次操作[\s\S]*正式化告警/);
  assert.equal(html.match(/data-action="submit-v2-proposal-undo"/g)?.length, 1);
  assert.doesNotMatch(html, /aria-label="主要工作区"|class="section-nav"|data-action="v2-proposal-undo"/);
  delete value.actionDialog;
  html = renderApp(value);
  assert.match(html, /aria-label="主要工作区"/);
  assert.match(html, /data-action="v2-proposal-undo"/);

  value.v2ProviderAvailable = true;
  html = renderApp(value);
  assert.match(html, /你可以整理当前页，或从“待整理”继续处理/);
  assert.doesNotMatch(html, /Agent 已关闭/);
});

test("Project Closure Review shows the external Agent outcome and uses a dedicated completion confirmation", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  const closure = { originalGoal: "推送可控", actualResult: "新链路上线", majorDeliverables: ["推送服务"], incompleteObjectives: [{ objective: "历史回放", reason: "数据未齐", nextStep: "转入数据治理" }], legacyDisposition: "新 Project 承接", keyDecisions: ["保留回退"], futureSummary: "重入先查数据" };
  value.v2Proposals = [{ updatedAt: "2026-07-21T12:01:00.000Z", files: { proposalMd: "# Closure", proposalJson: "{}" }, proposal: {
    proposalId: "prop-closure", schemaVersion: "v2", title: "Closure Proposal: 告警治理", context: "主要交付已完成。", understanding: "历史回放转移。", objective: "完成 Project。", logic: "Closure 与 Lifecycle 同时生效。", finalPreview: "新链路上线；历史回放转移。", unresolvedQuestions: [], source: { kind: "external_agent", skillVersion: "design-project@1" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "project-1", version: 4 }] }, preconditions: [],
    groups: [{ groupId: "close", explanation: "不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [
      { operationId: "closure", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: "project-1", version: 4 }, summary: "记录 Closure", payload: { closure }, preconditions: [] },
      { operationId: "complete", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "project-1", version: 4 }, summary: "完成 Project", payload: { lifecycle: "COMPLETED" }, preconditions: [] },
    ], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-21T12:00:00.000Z",
  } }];
  let html = renderApp(value);
  assert.match(html, /结束项目：告警治理/);
  assert.doesNotMatch(html, /Closure Proposal/);
  assert.match(html, /系统理解[\s\S]*将结束这个项目，并保存结果：新链路上线 1 项未完成目标会保留明确后续/);
  assert.doesNotMatch(html.match(/<section class="review-impact"[\s\S]*?<\/section>\s*<\/section>/)?.[0] ?? "", /历史回放转移/);
  assert.match(html, /external_agent/);
  assert.match(html, /历史回放转移/);
  assert.match(html, /data-action="v2-project-closure-commit"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.actionDialog = { kind: "confirm-v2-project-closure", value: "prop-closure|2026-07-21T12:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /未完成目标的原因与去向/);
  assert.match(html, /data-action="submit-v2-project-closure"/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:project-closure", proposalId: "prop-closure", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-21T12:00:00.000Z", updatedAt: "2026-07-21T12:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-project-closure-undo"/);
  assert.match(html, /没有后续冲突时，可以从这里撤销本次应用/);
  assert.doesNotMatch(html, /当前证据不足以确认是否仍满足安全撤销条件/);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  value.v2Proposals[0]!.proposal.status = "READY";
  value.v2Proposals[0]!.proposal.groups[0]!.disposition = "PENDING";
  value.v2Proposals[0]!.proposal.groups[0]!.explanation = "Closure 和 Lifecycle 转换不可分割，合并为一个 HIGH 组。";
  value.v2SemanticCommits = [];
  html = renderApp(value);
  assert.match(html, /data-action="v2-review-accept"/);
  const closureFrontstage = html.split('<details class="review-evidence-details">')[0]!;
  assert.doesNotMatch(closureFrontstage, /Closure 和 Lifecycle 转换不可分割/);
  assert.doesNotMatch(closureFrontstage, /HIGH 组/);
  assert.match(html, /查看完整依据[\s\S]*Closure 和 Lifecycle 转换不可分割/);
  value.v2Proposals[0]!.proposal.status = "FAILED";
  value.v2Proposals[0]!.proposal.groups[0]!.disposition = "ACCEPTED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:project-closure", proposalId: "prop-closure", status: "FAILED", beforeStateChecksum: "before", errorCode: "V2_PROJECT_CLOSURE_DOMAIN_WRITE_FAILED", createdAt: "2026-07-21T12:00:00.000Z", updatedAt: "2026-07-21T12:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /当前没有需要审阅的方案/);
  assert.doesNotMatch(html, /待审阅 \(1\)/);
  assert.match(html, /<details class="review-history"><summary>历史记录（1）<\/summary>/);
  const failedClosureCurrent = html.split('<details class="review-history">')[0]!;
  const failedClosureHistory = html.split('<details class="review-history">')[1]!;
  assert.doesNotMatch(failedClosureCurrent, /这次应用没有完成|项目和正文没有变化/);
  assert.match(failedClosureHistory, /这次应用没有完成/);
  assert.match(failedClosureHistory, /项目和正文没有变化；如需继续，请重新发起结束项目/);
  assert.doesNotMatch(html, /data-action="v2-project-closure-commit"/);
  assert.doesNotMatch(failedClosureCurrent, /V2_PROJECT_CLOSURE_DOMAIN_WRITE_FAILED|Proposal|Commit|RECOVERY_REQUIRED/);
  value.v2Proposals[0]!.proposal.status = "STALE";
  html = renderApp(value);
  assert.match(html, /方案已变化，需要重新检查/);
  assert.match(html, /项目当前状态已经变化；这次没有结束项目。请重新发起结束项目/);
  assert.doesNotMatch(html, /data-action="v2-project-closure-commit"/);
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2Proposals[0]!.proposal.groups[0]!.disposition = "ACCEPTED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:project-closure", proposalId: "prop-closure", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-21T12:00:00.000Z", updatedAt: "2026-07-21T12:01:00.000Z" }];
  value.actionDialog = { kind: "confirm-v2-project-closure-undo", value: "proposal-commit:project-closure" };
  html = renderApp(value);
  assert.match(html, /data-action="submit-v2-project-closure-undo"/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "ACCEPTED";
  value.v2SemanticCommits = [];
  value.v2Proposals[0]!.proposal.groups[0]!.disposition = "REJECTED";
  value.v2Proposals[0]!.proposal.groups.push({ groupId: "ordinary", explanation: "普通独立变更。", risk: "LOW", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [], disposition: "ACCEPTED" });
  value.v2Proposals[0]!.proposal.status = "PARTIALLY_ACCEPTED";
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-project-closure-commit"/);
  assert.match(html, /data-action="v2-proposal-commit"/);
});

test("Project current interface Review has dedicated Commit and version-safe Undo controls", () => {
  const value = model();
  value.workspace = "review"; value.reviewMode = "proposals";
  const structure = { objectives: [], deliverables: [], workStages: [], currentSummary: "正在验收。", currentFocuses: ["完成恢复演练"], stageMappings: [] };
  value.v2Proposals = [{ updatedAt: "2026-07-22T13:01:00.000Z", files: { proposalMd: "# Project", proposalJson: "{}" }, proposal: { proposalId: "prop-project-structure", schemaVersion: "v2", title: "更新当前接口", context: "当前信息已编辑。", understanding: "一起审阅。", objective: "可重入。", logic: "单一聚合。", finalPreview: "正在验收。", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "project-1", version: 2 }] }, preconditions: [], groups: [{ groupId: "update-project-interface", explanation: "不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "update-project-interface", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: "project-1", version: 2 }, summary: "更新 Project 当前接口", payload: { previousProjectStructure: structure, projectStructure: structure }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-22T13:00:00.000Z" } }];
  let html = renderApp(value);
  assert.match(html, /data-action="v2-project-structure-commit"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.actionDialog = { kind: "confirm-v2-project-structure", value: "prop-project-structure|2026-07-22T13:01:00.000Z" };
  assert.match(renderApp(value), /data-action="submit-v2-project-structure-commit"/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:project-structure", proposalId: "prop-project-structure", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-22T13:00:00.000Z", updatedAt: "2026-07-22T13:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-project-structure-undo"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
});

test("MEDIUM Project narration uses the dedicated Project interface Commit and Undo controls", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  const previousStructure = { objectives: [], deliverables: [], workStages: [], currentSummary: "待明确目标。", currentFocuses: ["明确下一步"], stageMappings: [] };
  const structure = { ...previousStructure, currentSummary: "目标仍待明确，当前先梳理下一步。" };
  value.v2Proposals = [{ updatedAt: "2026-07-26T00:15:00.000Z", files: { proposalMd: "# Narration", proposalJson: "{}" }, proposal: {
    proposalId: "prop-project-narration", schemaVersion: "v2", title: "更新 Project 当前摘要", context: "使用有界 Context Package。", understanding: "只压缩当前理解。", objective: "降低重入成本。", logic: "结构字段保持不变。", finalPreview: structure.currentSummary, unresolvedQuestions: [], source: { kind: "local_llm" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "project-1", version: 2 }] }, preconditions: [],
    groups: [{ groupId: "update-project-narration", explanation: "只替换摘要。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{
      operationId: "update-project-narration", kind: "UPDATE_PROJECT_NARRATION", target: { kind: "OBJECT", id: "project-1", version: 2 }, summary: "更新 Project 当前摘要", payload: { previousProjectStructure: previousStructure, projectStructure: structure }, preconditions: [],
    }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-26T00:14:00.000Z",
  } }];

  let html = renderApp(value);
  assert.match(html, /data-action="v2-project-structure-commit"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:project-narration", proposalId: "prop-project-narration", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-26T00:14:00.000Z", updatedAt: "2026-07-26T00:15:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-project-structure-undo"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
});

test("Project creation Review uses the proposal-bound Page creation confirmation and never falls through to Block Commit", () => {
  const value = model();
  value.workspace = "review"; value.reviewMode = "proposals";
  value.v2Proposals = [{ updatedAt: "2026-07-25T15:01:00.000Z", files: { proposalMd: "# Project creation", proposalJson: "{}" }, proposal: {
    proposalId: "prop-project-creation", schemaVersion: "v2", title: "创建设备治理 Project", context: "七项边界已完成 Grill。", understanding: "创建独立受控页面。", objective: "形成持续治理 Project。", logic: "最终阅读结果进入 HIGH Review。", finalPreview: "# 设备治理\n## 成果\n每月形成可核验结果。\n## 包含\n- 发布检查\n## 来源材料\n仅技术详情显示的完整材料说明。", unresolvedQuestions: [], source: { kind: "local_llm" }, scope: { read: [], modify: [{ kind: "PAGE", id: "Project/设备治理", expectedExistence: "ABSENT" }] }, preconditions: [], groups: [{
      groupId: "create-project", explanation: "创建关系必须整体审阅。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{
        operationId: "create-project", kind: "CREATE_OBJECT", target: { kind: "PAGE", id: "Project/设备治理", expectedExistence: "ABSENT" }, summary: "创建 Project 与主 Page", payload: { objectType: "PROJECT", text: "设备治理", relationshipMode: "CREATE_DEDICATED_PROJECT_PAGE" }, preconditions: [],
      }], disposition: "ACCEPTED",
    }], status: "ACCEPTED", createdAt: "2026-07-25T15:00:00.000Z",
  } }];
  let html = renderApp(value);
  assert.match(html, /data-action="v2-project-creation-commit"/);
  assert.match(html, /创建一个新项目及其主页面/);
  assert.match(html, /来源页面和原始材料会保留/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  const impact = html.match(/<section class="review-impact"[\s\S]*?<\/section>\s*<\/section>/)?.[0] ?? "";
  assert.match(impact, /data-impact-level="high"/);
  assert.ok(impact.indexOf("本次会改变什么") < impact.indexOf("本次不会改变什么"));
  assert.ok(impact.indexOf("本次不会改变什么") < impact.indexOf("系统理解"));
  assert.match(impact, /系统理解[\s\S]*设备治理。每月形成可核验结果/);
  assert.doesNotMatch(impact, /##|仅技术详情显示的完整材料说明/);
  assert.match(html, /查看完整依据[\s\S]*完整方案：[\s\S]*仅技术详情显示的完整材料说明/);
  assert.ok(html.indexOf("上一步只是确认方案") < html.indexOf('data-action="v2-project-creation-commit"'));
  value.actionDialog = { kind: "confirm-v2-project-creation", value: "prop-project-creation|2026-07-25T15:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /最终阅读结果与页面关系/);
  assert.match(html, /data-action="submit-v2-project-creation"/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:project-creation", proposalId: "prop-project-creation", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-25T15:00:00.000Z", updatedAt: "2026-07-25T15:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-project-creation-undo"/);
  assert.match(html, /没有后续冲突时，可以从这里撤销本次应用/);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  value.actionDialog = { kind: "confirm-v2-project-creation-undo", value: "proposal-commit:project-creation" };
  html = renderApp(value);
  assert.match(html, /复用的来源页面会原样保留/);
  assert.match(html, /data-action="submit-v2-project-creation-undo"/);
});

test("HIGH Review stacks its impact summary before the Logseq narrow-window host gate", async () => {
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(
    css,
    /@media \(max-width: 1280px\)[\s\S]*\.review-impact\[data-impact-level="high"\] \{ grid-template-columns: 1fr; \}/,
  );
});

test("MiniProject restructure Review uses the recoverable Graph Commit and inverse Undo controls", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Proposals = [{ updatedAt: "2026-07-24T15:01:00.000Z", files: { proposalMd: "# MiniProject restructure", proposalJson: "{}" }, proposal: {
    proposalId: "prop-mini-restructure", schemaVersion: "v2", title: "重构设备托管 MiniProject", context: "原材料仍是松散 Block。", understanding: "保留原材料身份并建立可阅读结构。", objective: "原位重构。", logic: "先创建栏目，再移动原材料。", finalPreview: "在当前 MiniProject 下建立成果栏目并移入材料，删除 0 条。", unresolvedQuestions: [], source: { kind: "local_llm" }, scope: { read: [{ kind: "BLOCK", id: "root", hash: "root-hash" }, { kind: "BLOCK", id: "source", hash: "source-hash" }], modify: [{ kind: "OBJECT", id: "mini-1", version: 3 }, { kind: "BLOCK", id: "root", hash: "root-hash" }, { kind: "BLOCK", id: "source", hash: "source-hash" }] }, preconditions: [], groups: [{ groupId: "restructure-mini-project", explanation: "结构变更必须整体审阅。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [
      { operationId: "create-outcome", kind: "CREATE_BLOCK", target: { kind: "BLOCK", id: "root", hash: "root-hash" }, summary: "创建成果栏目", payload: { newBlockUuid: "11111111-1111-4111-8111-111111111111", parentBlockUuid: "root", previousSiblingUuid: null, text: "成果", contentHash: checksum("成果") }, preconditions: [] },
      { operationId: "move-source", kind: "MOVE_BLOCK", target: { kind: "BLOCK", id: "source", hash: "source-hash" }, summary: "移动原材料", payload: { fromParentBlockUuid: "root", fromPreviousSiblingUuid: null, toParentBlockUuid: "11111111-1111-4111-8111-111111111111", toPreviousSiblingUuid: null, contentHash: "source-hash" }, preconditions: [] },
    ], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-24T15:00:00.000Z",
  } }];

  let html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-restructure-commit"/);
  assert.match(html, /不会删除原材料；已有内容会保留原来的身份/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.actionDialog = { kind: "confirm-v2-mini-project-restructure", value: "prop-mini-restructure|2026-07-24T15:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /零删除边界/);
  assert.match(html, /data-action="submit-v2-mini-project-restructure"/);
  delete value.actionDialog;
  value.v2StructureCommitBusy = true;
  html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-restructure-commit"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2StructureCommitBusy = false;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:mini-restructure", proposalId: "prop-mini-restructure", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-24T15:00:00.000Z", updatedAt: "2026-07-24T15:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-restructure-undo"/);
  assert.match(html, /没有后续冲突时，可以从这里撤销本次应用/);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  value.actionDialog = { kind: "confirm-v2-mini-project-restructure-undo", value: "proposal-commit:mini-restructure" };
  html = renderApp(value);
  assert.match(html, /只有全部材料仍等于已应用结果时才会开始/);
  assert.match(html, /data-action="submit-v2-mini-project-restructure-undo"/);
  delete value.actionDialog;
  value.v2SemanticCommits.push({ semanticCommitId: "mini-project-restructure-undo:proposal-commit:mini-restructure", proposalId: "prop-mini-restructure", status: "FAILED", beforeStateChecksum: "undo-before", createdAt: "2026-07-24T15:02:00.000Z", updatedAt: "2026-07-24T15:03:00.000Z" });
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-mini-project-restructure-undo"/);
  assert.match(html, /撤销因后续变化已安全停止/);
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
  assert.match(html, /正文、当前关注、归属和位置保持不变/);
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
  assert.match(html, /Copilot 只帮助整理文字，最终判断仍由你确认/);
  assert.match(html, /data-field="miniClosureLegacyObjectType"/);
  assert.match(html, /data-action="v2-mini-project-legacy-transfer"/);
  assert.match(html, /新建并选中一个空 Block/);
  assert.match(html, /确认这份方案/);
  value.v2ClosureDraftBusy = true;
  html = renderApp(value);
  assert.match(html, /Copilot 正在整理…/);
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
  assert.match(html, /原目标、实际结果和遗留事项/);
  assert.match(html, /data-action="submit-v2-mini-project-closure"/);
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:mini", proposalId: "prop-mini-close", status: "RECOVERY_REQUIRED", beforeStateChecksum: "before", createdAt: "2026-07-22T08:00:00.000Z", updatedAt: "2026-07-22T08:01:00.000Z", errorCode: "VERIFY_FAILED" }];
  html = renderApp(value);
  assert.match(html, /恢复到安全状态/);
  assert.match(html, /同一恢复记录/);
  assert.match(html, /data-action="submit-v2-mini-project-closure"[^>]*>确认恢复</);
  delete value.actionDialog;
  value.v2SemanticCommits = [];
  value.v2LifecycleCommitBusy = true;
  html = renderApp(value);
  assert.match(html, /data-action="v2-mini-project-closure-commit"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2LifecycleCommitBusy = false;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:mini", proposalId: "prop-mini-close", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-22T08:00:00.000Z", updatedAt: "2026-07-22T08:01:00.000Z" }];
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  assert.match(html, /本次修改已正式应用/);
});

test("MiniProject Closure waits until every other group is explicitly rejected", () => {
  const value = model();
  value.workspace = "review";
  value.reviewMode = "proposals";
  value.v2Proposals = [{ updatedAt: "2026-07-22T09:01:00.000Z", files: { proposalMd: "# Closure", proposalJson: "{}" }, proposal: {
    proposalId: "prop-mini-partial", schemaVersion: "v2", title: "完成 MiniProject", context: "对象级关闭。", understanding: "三问已确认。", objective: "完成 MiniProject。", logic: "独立提交。", finalPreview: "完成。", unresolvedQuestions: [], source: { kind: "external_agent" }, scope: { read: [], modify: [{ kind: "OBJECT", id: "mini-partial", version: 2 }] }, preconditions: [], status: "PARTIALLY_ACCEPTED", createdAt: "2026-07-22T09:00:00.000Z",
    groups: [
      { groupId: "close", explanation: "关闭。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "close", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "mini-partial", version: 2 }, summary: "完成", payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT", closure: { originalGoal: "目标", actualResult: "结果", remainingWork: "另行处理" } }, preconditions: [] }], disposition: "ACCEPTED" },
      { groupId: "remaining", explanation: "创建后续对象。", risk: "LOW", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [], disposition: "PENDING" },
    ],
  } }];
  let html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-mini-project-closure-commit"/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  assert.match(html, /还有其他修改没有决定/);
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
  assert.match(html, /正文、当前关注、归属和位置保持不变/);
  value.actionDialog = { kind: "confirm-v2-mini-project-closure", value: "prop-mini-agent|2026-07-22T10:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /重新检查事项版本，且不会改写 Logseq 正文/);
  assert.doesNotMatch(html, /重验 Block、Anchor/);
  delete value.actionDialog;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:agent", proposalId: "prop-mini-agent", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:01:00.000Z" }];
  html = renderApp(value);
  assert.match(html, /正文、当前关注、归属和位置保持不变/);
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
  assert.match(html, /确认调整主归属/);
  assert.doesNotMatch(html, /data-action="v2-proposal-commit"/);
  value.actionDialog = { kind: "confirm-v2-ownership", value: "prop-owner|2026-07-21T13:01:00.000Z" };
  html = renderApp(value);
  assert.match(html, /正文、位置和普通关联不会改变/);
  assert.match(html, /data-action="submit-v2-ownership"/);
  value.v2OwnershipCommitBusy = true;
  delete value.actionDialog;
  html = renderApp(value);
  assert.match(html, /data-action="v2-ownership-commit"[^>]*disabled[^>]*aria-busy="true"/);
  value.v2OwnershipCommitBusy = false;
  value.v2Proposals[0]!.proposal.status = "APPLIED";
  value.v2SemanticCommits = [{ semanticCommitId: "proposal-commit:owner", proposalId: "prop-owner", status: "COMPLETED", beforeStateChecksum: "before", afterStateChecksum: "after", createdAt: "2026-07-21T13:00:00.000Z", updatedAt: "2026-07-21T13:01:00.000Z" }];
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-proposal-undo"/);
  assert.match(html, /data-action="v2-ownership-undo"/);
  assert.match(html, /没有后续冲突时，可以从这里撤销本次应用/);
  value.actionDialog = { kind: "confirm-v2-ownership-undo", value: "proposal-commit:owner" };
  html = renderApp(value);
  assert.match(html, /恢复为未归属/);
  assert.match(html, /data-action="submit-v2-ownership-undo"/);
  delete value.actionDialog;
  value.v2SemanticCommits.push({ semanticCommitId: "ownership-undo:proposal-commit:owner", proposalId: "prop-owner", status: "FAILED", beforeStateChecksum: "before", createdAt: "2026-07-21T13:02:00.000Z", updatedAt: "2026-07-21T13:03:00.000Z" });
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-ownership-undo"/);
  assert.match(html, /撤销因后续变化已安全停止/);
  value.v2SemanticCommits.pop();
  value.v2SemanticCommits[0]!.status = "UNDONE";
  html = renderApp(value);
  assert.doesNotMatch(html, /data-action="v2-ownership-undo"/);
  assert.match(html, /本次修改已经撤销/);
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

test("Block Condition router shows a bounded resume action only for non-actionable work", () => {
  const value = model();
  value.v2Objects = [{
    objectId: "task-block", objectType: "TASK", version: 3, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" },
    text: "等待评审", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "test",
  }];
  value.v2NowWork = {
    generatedAt: "now",
    focus: [],
    next: [],
    waitingReview: [],
    conditionOptions: [
      { objectId: "task-block", objectType: "TASK", text: "等待评审" },
      { objectId: "project-blocker", objectType: "PROJECT", text: "测试环境" },
    ],
  };
  value.actionDialog = { kind: "v2-block-condition-route", value: "task-block|3|block-1" };
  let html = renderApp(value);
  for (const intent of ["WAITING", "BLOCKED", "PAUSED"]) {
    assert.match(html, new RegExp(`data-action="v2-block-condition-intent" data-value="${intent}\\|task-block\\|3\\|block-1"`));
  }
  for (const label of ["等待别人", "被问题卡住", "我先暂停"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /data-value="ACTIONABLE\|task-block\|3\|block-1"/);
  assert.match(html, /当前内容 · 任务/);
  assert.match(html, /不会完成事项、移动正文或改变当前关注/);
  assert.doesNotMatch(html, /\bBlock\b|\bCondition\b|\bLifecycle\b|\bOwnership\b|\bFocus\b|Local Service/);

  value.v2Objects[0] = {
    ...value.v2Objects[0]!,
    condition: {
      kind: "WAITING",
      waitingFor: "网络组回复",
      expectedResult: "端口权限确认",
      reviewAt: "2026-07-29T02:00:00.000Z",
    },
  };
  html = renderApp(value);
  assert.match(html, /data-action="v2-block-condition-intent" data-value="ACTIONABLE\|task-block\|3\|block-1"/);
  assert.match(html, /恢复为可以行动/);
  assert.match(html, /回复已到或卡点已解除/);

  value.actionDialog = { kind: "v2-block-condition-waiting", value: "task-block|3|block-1" };
  html = renderApp(value);
  for (const field of ["v2BlockWaitingSummary", "v2BlockConditionReviewAt"]) assert.match(html, new RegExp(`data-field="${field}"`));
  for (const field of ["v2BlockConditionReason", "v2BlockerObjectId"]) assert.doesNotMatch(html, new RegExp(`data-field="${field}"`));

  value.actionDialog = { kind: "v2-block-condition-blocked", value: "task-block|3|block-1" };
  html = renderApp(value);
  for (const field of ["v2BlockConditionReason", "v2BlockerObjectId"]) assert.match(html, new RegExp(`data-field="${field}"`));
  assert.match(html, /PROJECT · 测试环境/);
  assert.doesNotMatch(html, /data-field="v2BlockConditionReviewAt"/);

  value.v2BlockConditionBusy = true;
  value.actionDialog = { kind: "v2-block-condition-paused", value: "task-block|3|block-1" };
  html = renderApp(value);
  for (const field of ["v2BlockConditionReason", "v2BlockConditionReviewAt"]) assert.match(html, new RegExp(`data-field="${field}"`));
  assert.match(html, /正在保存…/);
  assert.match(html, /data-action="submit-v2-block-condition"[^>]*disabled aria-busy="true"/);
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
  const openPrimaryText = source.match(/async function openV2PrimaryAnchor[\s\S]*?\n\}/)?.[0] ?? "";
  const projectCreationSubmit = source.match(/if \(action === "submit-v2-project-creation"[\s\S]*?if \(action === "submit-v2-project-creation-undo"/)?.[0] ?? "";
  const projectClosureSubmit = source.match(/if \(action === "submit-v2-project-closure"[\s\S]*?if \(action === "submit-v2-project-creation"/)?.[0] ?? "";
  assert.doesNotMatch(source, /window\.(?:prompt|confirm)\s*\(/);
  assert.match(openPrimaryText, /原正文连接已不可用；没有修改正式事项。请在系统状态中检查并重新连接正文/);
  assert.doesNotMatch(openPrimaryText, /\bAnchor\b|运行时|对象/);
  for (const kind of ["v2-candidate-update", "confirm-v2-commit", "confirm-v2-undo", "v2-condition", "v2-deadline"]) {
    assert.match(source, new RegExp(`openActionDialog\\("${kind}"`));
  }
  assert.match(source, /registerPageContextMenu/);
  assert.match(source, /action === "recent-change-review"[\s\S]*workspace = "review";[\s\S]*reviewMode = "proposals";/);
  assert.match(source, /getCurrentPage\(\)/);
  assert.match(source, /pushState\("page", \{ name: openedPageName \}\)/);
  assert.match(source, /action === "v2-project-landing-open"[\s\S]*current\.version !== expectedVersion[\s\S]*v2ReentryTargetObjectId = current\.objectId;[\s\S]*workspace = "reentry";/);
  assert.match(source, /async function openV2ProjectWorksite[\s\S]*listAllPrimaryAnchors\(client\)[\s\S]*Editor\.getCurrentPage\(\)[\s\S]*Editor\.getPage\(primaryAnchor\.externalId\)[\s\S]*Editor\.getPage\(`Project\/\$\{current\.text\}`\)[\s\S]*identity\.pageUuid === primaryAnchor\.externalId[\s\S]*pushState\("page"[\s\S]*openV2PrimaryAnchor\(primaryAnchor\.externalId\)/);
  assert.match(source, /action === "v2-project-worksite-open"[\s\S]*openV2ProjectWorksite\(objectId, expectedVersion\)[\s\S]*if \(!latestError\) await logseq\.hideMainUI\(\)/);
  assert.match(source, /action === "v2-open-primary-anchor"[\s\S]*decodeAttentionNowPilotPrimaryValue\(value\)[\s\S]*openV2PrimaryAnchor\(primary\.value\)[\s\S]*recordAttentionNowPilotActed\(primary\.signalId\)[\s\S]*await logseq\.hideMainUI\(\)/);
  assert.match(source, /action === "v2-condition-open"[\s\S]*openActionDialog\("v2-condition", value\)[\s\S]*action === "submit-v2-condition"[\s\S]*decodeAttentionNowPilotPrimaryValue\(value\)[\s\S]*changeCondition\([\s\S]*recordAttentionNowPilotActed\(primary\.signalId\)/);
  assert.doesNotMatch(source, /action === "v2-condition-open"[\s\S]{0,240}recordAttentionNowPilotActed/);
  assert.match(projectCreationSubmit, /v2ReentryTargetObjectId = result\.object\.objectId/);
  assert.doesNotMatch(projectCreationSubmit, /logseq\.hideMainUI\(\)/);
  assert.match(projectClosureSubmit, /actionDialog = undefined;\s*workspace = "review";\s*await run\(/);
  assert.match(projectClosureSubmit, /result\.status === "FAILED"[\s\S]*项目和正文没有变化/);
  assert.doesNotMatch(projectClosureSubmit, /"[^"\n]*(?:Project Closure|Objective|Proposal)[^"\n]*"/);
  assert.doesNotMatch(source, /action === "create-v2-project"/);
  assert.match(source, /const returnToOrigin = cancelActionDialogReturnsToOrigin\(actionDialog\?\.kind, originRoute !== undefined\);[\s\S]*if \(returnToOrigin\) \{[\s\S]*await returnToBusinessOrigin\(\);/);
  assert.match(source, /async function returnToBusinessOrigin\(\)[\s\S]*originRoute = undefined;[\s\S]*originRouteController\.returnTo\(token\)/);
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
  assert.match(source, /Task Copilot 服务正在重新连接或暂时不能应用修改；旧预览已作废/);
  assert.match(source, /正文连接预览已过期或不存在；没有执行重新连接/);
  assert.match(source, /V2_UI_ACTION_UNSUPPORTED/);
  assert.match(source, /listSemanticCommits\(\)/);
  assert.match(source, /listPrimaryAnchors\(cursor, true\)/);
  assert.match(source, /if \(v2NowWork && !v2ProposalLoadError && !v2AuditLoadError && !v2PrimaryAnchorLoadError\)[\s\S]*projectPluginV2TaskReentry\([\s\S]*ownerships: v2RelationLoadError \? \[\] : v2PrimaryOwnerships/);
  assert.match(source, /if \(!v2TaskReentryLoadError && v2AuditLoadError\) v2TaskReentryLoadError = v2AuditLoadError/);
  assert.match(source, /if \(!v2TaskReentryLoadError && v2PrimaryAnchorLoadError\) v2TaskReentryLoadError = v2PrimaryAnchorLoadError/);
  assert.match(source, /if \(!featureReady && !runtimeEndedByUser\)/);
  assert.match(source, /featureReady = serviceConnection\.status === "READY" && serviceConnection\.formalWritesAvailable && Boolean\(serviceRuntimeClient\)/);
  assert.match(
    source,
    /runtimeEndedByUser = true;[\s\S]*const releaseLifecycleSession = releaseServiceLifecycleSession\(\);[\s\S]*enterRestrictedServiceMode\("SERVICE_ENDED_BY_USER"[\s\S]*await refresh\(\);[\s\S]*await releaseLifecycleSession;/,
  );
});

test("startup stays non-blocking while host-ready events and Graph switch recover exact Graph identity", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const configuredRecovery = source.match(/async function recoverConfiguredServiceRuntime[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(
    configuredRecovery,
    /ready: \(\) => serviceConnection\.status === "READY" && serviceConnection\.formalWritesAvailable && Boolean\(serviceRuntimeClient\)/,
  );
  assert.match(
    source,
    /async function recoverCurrentGraphIdentity\(\)[\s\S]*refresh: \(\) => environmentInfo\(750\)[\s\S]*ready: \(\) => currentGraphKey !== undefined/,
  );
  assert.match(
    source,
    /async function recoverCurrentGraphRuntime\([\s\S]*await recoverCurrentGraphIdentity\(\)[\s\S]*recoverConfiguredServiceRuntime\(configuredServiceDescriptorPath\)/,
  );
  assert.match(
    source,
    /async function handleCurrentGraphChanged\(\)[\s\S]*await recoverCurrentGraphRuntime\("已为当前知识库重新建立连接/,
  );
  assert.doesNotMatch(source, /Task Copilot 已自动连接当前知识库；正式能力可以使用/);
  assert.ok(
    (source.match(/recoverCurrentGraphRuntime\(\)/g) ?? []).length >= 2,
    "routine startup and host-ready recovery should rely on the single persistent Copilot state instead of a duplicate success banner",
  );
  const graphSwitchHandler = source.match(/async function handleCurrentGraphChanged\(\)[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(graphSwitchHandler, /await refreshRestrictedGraphSwitchSurface\(\)/);
  assert.ok(
    graphSwitchHandler.indexOf("await refreshRestrictedGraphSwitchSurface()")
      < graphSwitchHandler.indexOf("await releaseServiceLifecycleSession()"),
    "Graph switch must replace the old Graph projection with a restricted surface before waiting for lease release",
  );
  assert.ok(
    graphSwitchHandler.indexOf("currentGraphKey = undefined")
      < graphSwitchHandler.indexOf("await refreshRestrictedGraphSwitchSurface()"),
    "Graph switch must invalidate the previous Graph identity before rendering or recovering",
  );
  assert.match(source, /onGraphAfterIndexed\(recoverAfterHostGraphReady\)/);
  assert.match(source, /onRouteChanged\(recoverAfterHostGraphReady\)/);
  const hostReadyHandler = source.match(/const recoverAfterHostGraphReady = \(\) => \{[\s\S]*?\n[ ]{2}\};/)?.[0] ?? "";
  assert.match(hostReadyHandler, /projectPageHeadActionController\.refreshAll\(\)/);
  assert.match(hostReadyHandler, /currentGraphKey = undefined;[\s\S]*recoverCurrentGraphRuntime/);
  assert.ok(
    hostReadyHandler.indexOf("projectPageHeadActionController.refreshAll()")
      < hostReadyHandler.indexOf('serviceConnection.status === "READY"'),
    "route-ready handling must refresh the current Project Page Head before a healthy runtime returns early",
  );
  const mainBody = source.slice(source.indexOf("async function main()"));
  assert.doesNotMatch(mainBody, /await environmentInfo\(\)/);
  assert.match(mainBody, /await initializeFeatures\(\)/);
});
