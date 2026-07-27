import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceProjectClosureEvidenceDraft } from "@task-copilot/service-client";

import { projectClosureProposalFailure, readProjectClosureUserJudgments } from "../src/project-closure-input.ts";

function evidence(): ServiceProjectClosureEvidenceDraft {
  return {
    schemaVersion: "task-copilot-project-closure-evidence-v1",
    project: {
      objectId: "project-release",
      version: 3,
      text: "发布治理",
      currentSummary: "恢复演练已完成，历史回放待处理。",
      sourceRefs: ["object:project-release@v3"],
    },
    goalCandidates: [{ text: "稳定发布", sourceRefs: ["objective:release"], evidenceKind: "PROJECT_STRUCTURE" }],
    deliverableCandidates: [{ text: "发布手册", sourceRefs: ["deliverable:runbook"], evidenceKind: "PROJECT_STRUCTURE" }],
    decisionCandidates: [],
    completedWorkCandidates: [],
    unresolvedWork: [{
      text: "补齐历史回放",
      condition: "等待脱敏样本",
      lifecycle: "OPEN",
      sourceRefs: ["object:task-history@v2"],
      evidenceKind: "OWNED_OBJECT",
    }],
    objectiveJudgments: [
      {
        objective: { objectiveId: "objective-release", text: "稳定发布", priority: "PRIMARY", sourceRefs: ["objective:release"] },
        evidence: [{ text: "恢复演练通过", sourceRefs: ["objective-evidence:release"], evidenceKind: "PROJECT_STRUCTURE" }],
        disposition: "NEEDS_USER_JUDGMENT",
      },
      {
        objective: { objectiveId: "objective-docs", text: "交接可独立执行", priority: "SECONDARY", sourceRefs: ["objective:docs"] },
        evidence: [],
        disposition: "NEEDS_USER_JUDGMENT",
      },
    ],
    userJudgments: [],
    unknowns: [],
    evidenceScopeHash: "closureinput1",
    authorityBoundary: "READ_ONLY_EVIDENCE_DRAFT",
  };
}

test("Closure input maps dynamic Objective judgments without exposing identities to the user", () => {
  const fields = new Map([
    ["projectClosureActualResult", "发布手册已经可用于恢复演练。"],
    ["projectClosureObjectiveDisposition:0", "INCOMPLETE"],
    ["projectClosureObjectiveReason:0", "历史回放尚未补齐。"],
    ["projectClosureObjectiveNextStep:0", "取得样本后完成回放。"],
    ["projectClosureObjectiveDisposition:1", "COMPLETED"],
    ["projectClosureObjectiveReason:1", "这个字段不应进入结果"],
    ["projectClosureObjectiveNextStep:1", "这个字段不应进入结果"],
    ["projectClosureLegacyDisposition", "补齐历史回放继续作为明确遗留，不在关闭时丢弃。"],
    ["projectClosureKeyDecisions", "继续保留人工回退开关\n使用发布手册作为恢复入口"],
    ["projectClosureFutureSummary", "未来重入先核对历史回放和回退开关。"],
  ]);

  assert.deepEqual(readProjectClosureUserJudgments(evidence(), (name) => fields.get(name) ?? ""), {
    actualResult: "发布手册已经可用于恢复演练。",
    objectiveDispositions: [
      {
        objectiveId: "objective-release",
        disposition: "INCOMPLETE",
        reason: "历史回放尚未补齐。",
        nextStep: "取得样本后完成回放。",
      },
      { objectiveId: "objective-docs", disposition: "COMPLETED" },
    ],
    legacyDisposition: "补齐历史回放继续作为明确遗留，不在关闭时丢弃。",
    keyDecisions: ["继续保留人工回退开关", "使用发布手册作为恢复入口"],
    futureSummary: "未来重入先核对历史回放和回退开关。",
  });
});

test("Closure input refuses missing real judgments before the Provider can be called", () => {
  const value = evidence();
  const complete = new Map([
    ["projectClosureActualResult", "发布手册已经可用于演练。"],
    ["projectClosureObjectiveDisposition:0", "INCOMPLETE"],
    ["projectClosureObjectiveReason:0", "历史回放尚未补齐。"],
    ["projectClosureObjectiveNextStep:0", "取得样本后完成回放。"],
    ["projectClosureObjectiveDisposition:1", "COMPLETED"],
    ["projectClosureLegacyDisposition", "补齐历史回放继续作为明确遗留。"],
    ["projectClosureKeyDecisions", "继续保留回退开关"],
    ["projectClosureFutureSummary", "未来先核对历史回放。"],
  ]);
  const read = (name: string) => complete.get(name) ?? "";

  complete.set("projectClosureActualResult", "");
  assert.throws(() => readProjectClosureUserJudgments(value, read), /实际结果/);
  complete.set("projectClosureActualResult", "发布手册已经可用于演练。");
  complete.set("projectClosureObjectiveReason:0", "");
  assert.throws(() => readProjectClosureUserJudgments(value, read), /未完成原因/);
  complete.set("projectClosureObjectiveReason:0", "历史回放尚未补齐。");
  complete.set("projectClosureLegacyDisposition", "另行处理。");
  assert.throws(() => readProjectClosureUserJudgments(value, read), /逐项保留/);
  complete.set("projectClosureLegacyDisposition", "补齐历史回放继续作为明确遗留。");
  complete.set("projectClosureKeyDecisions", "");
  assert.throws(() => readProjectClosureUserJudgments(value, read), /关键决定/);
});

test("Closure Provider failures become bounded user messages without remote detail leakage", () => {
  const stale = projectClosureProposalFailure({ details: { remoteCode: "V2_OBJECT_VERSION_CONFLICT" } });
  assert.match(stale, /关闭材料不再适用/);
  assert.doesNotMatch(stale, /Project|证据|正式状态/);
  const provider = projectClosureProposalFailure({
    message: "secret raw response",
    details: { remoteCode: "PROJECT_CLOSURE_PROVIDER_USER_JUDGMENT_CHANGED" },
  });
  assert.match(provider, /无法安全使用/);
  assert.doesNotMatch(provider, /Provider|Proposal|Validator|正式状态/);
  assert.doesNotMatch(provider, /secret|USER_JUDGMENT_CHANGED/);
  const transport = projectClosureProposalFailure({
    message: "private transport path",
    details: { remoteCode: "LLM_PROVIDER_TIMEOUT" },
  });
  assert.match(transport, /关闭方案没有整理完成/);
  assert.doesNotMatch(transport, /Provider|Proposal|LLM|正式状态/);
  assert.doesNotMatch(transport, /private|TIMEOUT/);
});
