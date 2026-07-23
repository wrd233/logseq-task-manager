import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceNowWork, ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";
import { deriveToolbarIntervention, renderToolbarIntervention } from "../src/toolbar-intervention.ts";

function nowWork(): ServiceNowWork {
  return {
    generatedAt: "2026-07-24T00:00:00.000Z",
    focus: [{
      objectId: "focus-open",
      objectType: "TASK",
      version: 1,
      text: "普通 Focus",
      condition: { kind: "ACTIONABLE" },
      updatedAt: "2026-07-23T00:00:00.000Z",
      reason: "当前关注",
    }],
    next: [{
      objectId: "ordinary-open",
      objectType: "PROJECT",
      version: 1,
      text: "普通 OPEN Project",
      condition: { kind: "ACTIONABLE" },
      updatedAt: "2026-07-23T00:00:00.000Z",
      reason: "近期建立",
    }],
    waitingReview: [{
      objectId: "ordinary-waiting",
      objectType: "TASK",
      version: 1,
      text: "未到期等待",
      condition: {
        kind: "WAITING",
        waitingFor: "外部回复",
        expectedResult: "确认",
        reviewAt: "2026-07-25T00:00:00.000Z",
      },
      updatedAt: "2026-07-23T00:00:00.000Z",
      reason: "当前关注正在等待",
    }],
    conditionOptions: [],
  };
}

function proposal(
  proposalId: string,
  status: ServiceStoredProposal["proposal"]["status"],
  risk: ServiceStoredProposal["proposal"]["groups"][number]["risk"],
  disposition: ServiceStoredProposal["proposal"]["groups"][number]["disposition"],
): ServiceStoredProposal {
  return {
    updatedAt: "2026-07-24T00:00:00.000Z",
    files: { proposalMd: "# Proposal", proposalJson: "{}" },
    proposal: {
      proposalId,
      schemaVersion: "v2",
      title: "测试 Proposal",
      context: "测试上下文",
      understanding: "测试理解",
      objective: "测试目标",
      logic: "测试逻辑",
      finalPreview: "测试预览",
      unresolvedQuestions: [],
      source: { kind: "user" },
      scope: { read: [], modify: [] },
      preconditions: [],
      groups: [{
        groupId: `${proposalId}-group`,
        explanation: "独立变更",
        risk,
        independentlyAcceptable: true,
        dependencies: [],
        textPatches: [],
        semanticOperations: [],
        disposition,
      }],
      status,
      createdAt: "2026-07-24T00:00:00.000Z",
    },
  };
}

function commit(status: ServiceSemanticCommit["status"]): ServiceSemanticCommit {
  return {
    semanticCommitId: `commit-${status}`,
    status,
    beforeStateChecksum: "before",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

test("ordinary OPEN, Focus, future WAITING and ordinary Candidate totals stay silent", () => {
  const summary = deriveToolbarIntervention({
    nowWork: nowWork(),
    proposals: [],
    semanticCommits: [commit("COMPLETED")],
    formalConnectionRisk: false,
  });
  assert.deepEqual(summary, {
    mode: "quiet",
    count: 0,
    target: "now",
    title: "Task Copilot",
    counts: {
      dueReview: 0,
      pendingConfirmation: 0,
      acceptedNotApplied: 0,
      pendingCommit: 0,
      formalConnectionRisk: 0,
    },
  });
  assert.equal(renderToolbarIntervention(summary).includes("toolbar-badge"), false);
});

test("badge counts only due review, pending confirmation, HIGH accepted-not-applied, pending Commit and formal risk", () => {
  const value = nowWork();
  value.waitingReview.push({
    objectId: "review-due",
    objectType: "TASK",
    version: 2,
    text: "到期复查",
    condition: {
      kind: "PAUSED",
      reason: "等待窗口",
      reviewAt: "2026-07-23T23:00:00.000Z",
    },
    updatedAt: "2026-07-23T00:00:00.000Z",
    reason: "暂停复查已到",
  });
  const summary = deriveToolbarIntervention({
    nowWork: value,
    proposals: [
      proposal("pending", "READY", "LOW", "PENDING"),
      proposal("high-accepted", "ACCEPTED", "HIGH", "ACCEPTED"),
      proposal("low-accepted", "ACCEPTED", "LOW", "ACCEPTED"),
      proposal("applied", "APPLIED", "HIGH", "ACCEPTED"),
    ],
    semanticCommits: [commit("PENDING"), commit("COMPLETED")],
    formalConnectionRisk: true,
  });
  assert.equal(summary.mode, "attention");
  assert.equal(summary.count, 5);
  assert.deepEqual(summary.counts, {
    dueReview: 1,
    pendingConfirmation: 1,
    acceptedNotApplied: 1,
    pendingCommit: 1,
    formalConnectionRisk: 1,
  });
  assert.equal(summary.target, "diagnostics");
  assert.match(renderToolbarIntervention(summary), /toolbar-badge[^>]*>⑤</);
});

test("RECOVERY_REQUIRED replaces the number with a recovery symbol and routes directly to recovery", () => {
  const summary = deriveToolbarIntervention({
    nowWork: nowWork(),
    proposals: [proposal("pending", "READY", "LOW", "PENDING")],
    semanticCommits: [commit("RECOVERY_REQUIRED")],
    formalConnectionRisk: true,
  });
  assert.equal(summary.mode, "recovery");
  assert.equal(summary.target, "audit");
  assert.match(summary.title, /上一次修改尚未完成/);
  const html = renderToolbarIntervention(summary);
  assert.match(html, />↻</);
  assert.doesNotMatch(html, /toolbar-badge[^>]*>②</);
});

test("the highest-priority intervention decides the toolbar destination", () => {
  const due = nowWork();
  due.waitingReview[0] = {
    ...due.waitingReview[0]!,
    condition: {
      kind: "WAITING",
      waitingFor: "外部回复",
      expectedResult: "确认",
      reviewAt: "2026-07-23T00:00:00.000Z",
    },
  };
  assert.equal(deriveToolbarIntervention({
    nowWork: due,
    proposals: [],
    semanticCommits: [],
    formalConnectionRisk: false,
  }).target, "now");
  assert.equal(deriveToolbarIntervention({
    nowWork: nowWork(),
    proposals: [proposal("pending", "READY", "LOW", "PENDING")],
    semanticCommits: [],
    formalConnectionRisk: false,
  }).target, "review");
  assert.equal(deriveToolbarIntervention({
    nowWork: nowWork(),
    proposals: [],
    semanticCommits: [commit("PENDING")],
    formalConnectionRisk: false,
  }).target, "audit");
});
