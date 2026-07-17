import assert from "node:assert/strict";
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
});

test("Inbox and Proposal Review expose the complete manual and partial-review controls", () => {
  const value = model();
  value.workspace = "inbox";
  value.inbox = [{
    captureId: "cap_1", phase: "NEW", originalText: "原始输入", sourceAnchorId: "anc_1", captureMethod: "CURRENT_BLOCK",
    capturedAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z", resolvedObjectIds: [],
  }];
  let html = renderApp(value);
  for (const action of ["open-capture", "formalize", "manual-proposal", "associate-capture", "defer-capture", "dismiss-capture"]) {
    assert.match(html, new RegExp(`data-action="${action}"`));
  }
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
