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
  assert.match(html, /语义组已接受，但尚未正式生效/);
  assert.match(html, /显示 Undo/);
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
