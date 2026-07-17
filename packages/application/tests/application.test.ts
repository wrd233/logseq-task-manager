import assert from "node:assert/strict";
import test from "node:test";

import { calculateSignals } from "@task-copilot/domain";

import {
  DeterministicDemoProvider,
  MemoryContentPort,
  MemoryStateStore,
  TaskCopilot,
} from "../src/index.ts";

function harness() {
  const store = new MemoryStateStore();
  const content = new MemoryContentPort({
    externalId: "block_1",
    graphId: "graph_1",
    text: "下周前梳理告警链路，现有脚本还能用，但要找真实事件验证。",
    pageRef: "2026_07_17",
  });
  let id = 0;
  const app = new TaskCopilot({
    store,
    content,
    provider: new DeterministicDemoProvider(),
    clock: () => new Date("2026-07-17T12:00:00.000Z"),
    idFactory: (prefix) => `${prefix}_${++id}`,
  });
  return { app, store, content };
}

test("current block capture preserves raw text and manual formalization creates an independent anchored Task", async () => {
  const { app, store } = harness();
  const capture = await app.captureCurrentBlock();
  assert.equal(capture.originalText, "下周前梳理告警链路，现有脚本还能用，但要找真实事件验证。");
  assert.equal(capture.phase, "NEW");

  const object = await app.formalizeCapture(capture.captureId, {
    objectType: "TASK",
    text: "使用真实事件验证告警链路，并保存证据。",
    completionCriteria: "完整链路证据已保存",
    nextAction: "选择一条非 Test 事件",
  });
  const state = await store.load();
  assert.equal(object.objectType, "TASK");
  assert.equal(state.captures[0]?.phase, "RESOLVED");
  assert.equal(state.anchors[0]?.objectId, object.objectId);
  assert.equal(state.anchors[0]?.role, "primary_text");
});

test("demo proposal accepts rewrite and object creation, rejects move and ownership, commits, and safely undoes", async () => {
  const { app, store, content } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.generateProposal(capture.captureId);
  const decisions = Object.fromEntries(
    proposal.operations.map((operation) => [
      operation.operationId,
      operation.operationType === "rewrite_content" || operation.operationType === "create_object" || operation.operationType === "resolve_capture"
        ? "ACCEPTED"
        : "REJECTED",
    ]),
  );
  await app.reviewProposal(proposal.proposalId, decisions);
  const result = await app.commitProposal(proposal.proposalId);
  assert.equal(result.status, "COMPLETED");
  assert.match(content.block("block_1")?.text ?? "", /告警生成/);
  let state = await store.load();
  assert.equal(state.objects.length, 1);
  assert.deepEqual(calculateSignals(state.objects[0]!, state.relations, new Date("2026-07-17T12:00:00.000Z")), ["UNASSIGNED"]);
  assert.equal(state.captures[0]?.phase, "RESOLVED");

  await app.undoCommit(result.semanticCommitId);
  state = await store.load();
  assert.equal(state.objects.length, 0);
  assert.equal(state.captures[0]?.phase, "PROPOSED");
  assert.equal(content.block("block_1")?.text, capture.originalText);
});

test("a Domain Store failure after Logseq write compensates text and never reports success", async () => {
  const { app, store, content } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.generateProposal(capture.captureId);
  await app.reviewProposal(
    proposal.proposalId,
    Object.fromEntries(
      proposal.operations.map((operation) => [operation.operationId, operation.operationType === "rewrite_content" ? "ACCEPTED" : "REJECTED"]),
    ),
  );
  store.failOnSaveNumber(store.saveCount + 2);
  const commit = await app.commitProposal(proposal.proposalId);
  assert.equal(commit.status, "FAILED");
  assert.equal(commit.compensation?.completed, true);
  assert.equal(content.block("block_1")?.text, capture.originalText);
});

test("compensation failure is explicit recovery_required and can be recovered on restart", async () => {
  const { app, store, content } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.generateProposal(capture.captureId);
  await app.reviewProposal(
    proposal.proposalId,
    Object.fromEntries(
      proposal.operations.map((operation) => [operation.operationId, operation.operationType === "rewrite_content" ? "ACCEPTED" : "REJECTED"]),
    ),
  );
  store.failOnSaveNumber(store.saveCount + 2);
  content.failNextCompensation();
  const commit = await app.commitProposal(proposal.proposalId);
  assert.equal(commit.status, "RECOVERY_REQUIRED");
  const report = await app.recoverPendingCommits();
  assert.equal(report.recovered.length, 1);
  assert.equal(content.block("block_1")?.text, capture.originalText);
});

test("Now Work is a restrained projection and Project re-entry is action-oriented", async () => {
  const { app } = harness();
  const capture = await app.captureCurrentBlock();
  const project = await app.formalizeCapture(capture.captureId, {
    objectType: "PROJECT",
    text: "完成告警链路 MVP",
    purpose: "形成可验证的告警链路",
    targetOutcome: "说明和证据齐备",
    currentSummary: "静态关系已完成，真实事件尚未验证。",
    nextAction: "选择一条真实事件",
  });
  const now = await app.queryNowWork();
  assert.equal(now.items.length, 1);
  assert.equal("events" in now.items[0]!, false);
  const reentry = await app.getProjectReentry(project.objectId);
  assert.equal(reentry.restoreAction, "选择一条真实事件");
  assert.ok(reentry.recentChanges.length <= 3);
  assert.equal("risks" in reentry, false);
});
