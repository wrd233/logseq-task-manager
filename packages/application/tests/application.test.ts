import assert from "node:assert/strict";
import test from "node:test";

import { calculateSignals, type CreateManagedObjectInput, type ManagedObject, type Proposal } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import {
  DeterministicDemoProvider,
  MemoryContentPort,
  MemoryStateStore,
  NoAgentProvider,
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

async function acceptAll(app: TaskCopilot, proposal: Proposal) {
  await app.reviewProposal(proposal.proposalId, Object.fromEntries(proposal.operations.map((operation) => [
    operation.operationId,
    operation.riskLevel === "HIGH" ? { status: "ACCEPTED", highImpactConfirmed: true } : "ACCEPTED",
  ])));
  return app.commitProposal(proposal.proposalId);
}

async function formalize(
  app: TaskCopilot,
  captureId: string,
  input: Omit<CreateManagedObjectInput, "objectId" | "sourceOrCreationEvent">,
): Promise<ManagedObject> {
  const proposal = await app.createManualFormalizationProposal(captureId, input);
  assert.equal((await acceptAll(app, proposal)).status, "COMPLETED");
  const create = proposal.operations.find((operation) => operation.operationType === "create_object")!;
  const objectId = ((create.payload.input as Record<string, unknown>).objectId) as string;
  return app.getObject(objectId);
}

test("current block capture preserves raw text and manual formalization creates an independent anchored Task", async () => {
  const { app, store } = harness();
  const capture = await app.captureCurrentBlock();
  assert.equal(capture.originalText, "下周前梳理告警链路，现有脚本还能用，但要找真实事件验证。");
  assert.equal(capture.phase, "NEW");

  const object = await formalize(app, capture.captureId, {
    objectType: "TASK",
    text: capture.originalText,
    completionCriteria: "完整链路证据已保存",
    nextAction: "选择一条非 Test 事件",
  });
  const state = await store.load();
  assert.equal(object.objectType, "TASK");
  assert.equal(state.captures[0]?.phase, "RESOLVED");
  assert.equal(state.anchors[0]?.objectId, object.objectId);
  assert.equal(state.anchors[0]?.role, "primary_text");
  const objectChange = state.commits
    .find((commit) => commit.status === "COMPLETED")
    ?.domainChanges.find((change) => change.entityType === "OBJECT" && change.entityId === object.objectId);
  assert.equal((objectChange?.after as ManagedObject | undefined)?.primaryTextAnchorId, state.anchors[0]?.anchorId);
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
  const { app, content } = harness();
  content.setCurrentBlock({ externalId: "block_project", graphId: "graph_1", text: "完成告警链路 MVP", pageRef: "Projects" });
  const capture = await app.captureCurrentBlock();
  const project = await formalize(app, capture.captureId, {
    objectType: "PROJECT",
    text: "完成告警链路 MVP",
    purpose: "形成可验证的告警链路",
    targetOutcome: "说明和证据齐备",
    currentSummary: "静态关系已完成，真实事件尚未验证。",
    nextAction: "选择一条真实事件",
    extensionData: { unresolvedQuestions: ["外部推送是否重试？"] },
  });
  const now = await app.queryNowWork();
  assert.equal(now.items.length, 1);
  assert.equal("events" in now.items[0]!, false);
  const reentry = await app.getProjectReentry(project.objectId);
  assert.equal(reentry.restoreAction, "选择一条真实事件");
  assert.ok(reentry.recentChanges.length <= 3);
  assert.equal("risks" in reentry, false);
  assert.deepEqual(reentry.unresolvedQuestions, ["外部推送是否重试？"]);
});

test("No-Agent mode still supports a manual Proposal, review, commit and Capture resolution", async () => {
  const { store, content } = harness();
  let id = 100;
  const app = new TaskCopilot({
    store,
    content,
    provider: new NoAgentProvider(),
    clock: () => new Date("2026-07-17T12:00:00.000Z"),
    idFactory: (prefix) => `${prefix}_${++id}`,
  });
  const capture = await app.captureCurrentBlock();
  const proposal = await app.createManualProposal(capture.captureId, "用户确认的正式正文");
  await app.reviewProposal(proposal.proposalId, Object.fromEntries(proposal.operations.map((operation) => [operation.operationId, "ACCEPTED"])));
  const impact = await app.getProposalImpact(proposal.proposalId);
  assert.equal(impact.executable, 2);
  const commit = await app.commitProposal(proposal.proposalId);
  assert.equal(commit.status, "COMPLETED");
  assert.equal(content.block("block_1")?.text, "用户确认的正式正文");
  assert.equal((await store.load()).captures[0]?.phase, "RESOLVED");
});

test("manual Proposal operations can be deferred or rejected without resolving the Capture", async () => {
  const { app, store, content } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.createManualProposal(capture.captureId, "暂不采用的正文");
  await app.deferProposalOperation(proposal.proposalId, proposal.operations[0]!.operationId, "2026-07-20T09:00:00+08:00", "等待上下文");
  assert.equal((await app.getProposalImpact(proposal.proposalId)).pending, 2);
  await app.rejectProposal(proposal.proposalId, "方向不合适");
  const state = await store.load();
  assert.equal(state.captures[0]?.phase, "NEW");
  assert.equal(state.proposals[0]?.status, "REJECTED");
  assert.equal(content.block("block_1")?.text, capture.originalText);
});

test("intrinsically high-impact operations require an application-level confirmation marker", async () => {
  const { app } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.generateProposal(capture.captureId);
  const ownership = proposal.operations.find((operation) => operation.operationType === "set_primary_ownership")!;
  await assert.rejects(app.reviewProposal(proposal.proposalId, { [ownership.operationId]: "ACCEPTED" }), /单独明确确认/);
  const reviewed = await app.reviewProposal(proposal.proposalId, {
    [ownership.operationId]: { status: "ACCEPTED", highImpactConfirmed: true },
  });
  assert.equal(reviewed.operations.find((operation) => operation.operationId === ownership.operationId)?.status, "ACCEPTED");
});

test("a partial Commit keeps deferred or undecided operations reviewable without re-running committed work", async () => {
  const { app, store } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.generateProposal(capture.captureId);
  const rewrite = proposal.operations.find((operation) => operation.operationType === "rewrite_content")!;
  await app.reviewProposal(proposal.proposalId, { [rewrite.operationId]: "ACCEPTED" });
  assert.equal((await app.commitProposal(proposal.proposalId)).status, "COMPLETED");
  let saved = (await store.load()).proposals[0]!;
  assert.equal(saved.status, "OPEN");
  assert.equal(saved.operations.find((operation) => operation.operationId === rewrite.operationId)?.status, "COMMITTED");
  await assert.rejects(app.reviewProposal(proposal.proposalId, { [rewrite.operationId]: "REJECTED" }), /不能重新审查/);
  await app.rejectProposal(proposal.proposalId);
  saved = (await store.load()).proposals[0]!;
  assert.equal(saved.status, "COMMITTED");
  assert.equal(saved.operations.find((operation) => operation.operationId === rewrite.operationId)?.status, "COMMITTED");
});

test("an older Proposal cannot overwrite an Anchor version committed by a newer reviewed change", async () => {
  const { app, content } = harness();
  const capture = await app.captureCurrentBlock();
  const older = await app.createManualProposal(capture.captureId, "旧 Proposal 的正文");
  const newer = await app.createManualProposal(capture.captureId, "已提交的新正文");
  await app.reviewProposal(newer.proposalId, Object.fromEntries(newer.operations.map((operation) => [operation.operationId, "ACCEPTED"])));
  assert.equal((await app.commitProposal(newer.proposalId)).status, "COMPLETED");
  await app.reviewProposal(older.proposalId, Object.fromEntries(older.operations.map((operation) => [operation.operationId, "ACCEPTED"])));
  await assert.rejects(app.commitProposal(older.proposalId), /正文权威版本已变化/);
  assert.equal(content.block("block_1")?.text, "已提交的新正文");
});

test("Area, Project ownership, phase gates, association and deferral are available through commands", async () => {
  const { app, store, content } = harness();
  content.setCurrentBlock({ externalId: "block_1", graphId: "graph_1", text: "个人系统", pageRef: "Areas" });
  const areaCapture = await app.captureCurrentBlock();
  const area = await formalize(app, areaCapture.captureId, { objectType: "AREA", text: "个人系统", purpose: "持续维护个人事务系统" });
  content.setCurrentBlock({ externalId: "block_2", graphId: "graph_1", text: "交付 Task Copilot", pageRef: "Projects" });
  const projectCapture = await app.captureCurrentBlock();
  const project = await formalize(app, projectCapture.captureId, {
    objectType: "PROJECT", text: "交付 Task Copilot", purpose: "个人可用", targetOutcome: "插件可加载", scopeIn: "MVP",
    completionCriteria: "验收通过", nextAction: "运行自动检查",
  });
  await acceptAll(app, await app.createManualOwnershipProposal(project.objectId, area.objectId));
  await acceptAll(app, await app.createManualPhaseProposal(project.objectId, "DEFINING"));
  await acceptAll(app, await app.createManualPhaseProposal(project.objectId, "PLANNED"));
  await acceptAll(app, await app.createManualPhaseProposal(project.objectId, "ACTIVE"));
  assert.equal((await app.getObject(project.objectId)).phase, "ACTIVE");
  content.setCurrentBlock({ externalId: "block_3", graphId: "graph_1", text: "补充上下文", pageRef: "Journal" });
  const associated = await app.captureCurrentBlock();
  await app.associateCapture(associated.captureId, project.objectId);
  content.setCurrentBlock({ externalId: "block_4", graphId: "graph_1", text: "稍后处理", pageRef: "Journal" });
  const deferred = await app.captureCurrentBlock();
  await app.deferCapture(deferred.captureId, "2026-07-20T09:00:00+08:00");
  await assert.rejects(app.deferCapture(deferred.captureId, "not-a-date"), /合法日期/);
  await app.openCaptureSource(deferred.captureId);
  assert.equal((await content.getCurrentBlock())?.externalId, "block_4");
  const state = await store.load();
  assert.equal(state.captures.find((candidate) => candidate.captureId === associated.captureId)?.resolvedObjectIds[0], project.objectId);
  assert.equal(state.relations.some((relation) => relation.fromObjectId === project.objectId && relation.toObjectId === area.objectId), true);
});

test("generic object edit Proposals reject identity and state-machine fields", async () => {
  const { app } = harness();
  const capture = await app.captureCurrentBlock();
  const object = await formalize(app, capture.captureId, { objectType: "TASK", text: capture.originalText, completionCriteria: "完成" });
  await assert.rejects(app.createManualObjectEditProposal(object.objectId, { objectId: "obj_hijacked" } as never), /不能通过通用更新/);
  assert.equal((await app.getObject(object.objectId)).objectId, object.objectId);
});

test("Undo persists a PENDING inverse commit before text and compensates a failed final Domain save", async () => {
  const { app, store, content } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.generateProposal(capture.captureId);
  await app.reviewProposal(
    proposal.proposalId,
    Object.fromEntries(proposal.operations.map((operation) => [operation.operationId, ["rewrite_content", "create_object", "resolve_capture"].includes(operation.operationType) ? "ACCEPTED" : "REJECTED"])),
  );
  const original = await app.commitProposal(proposal.proposalId);
  const committedText = content.block("block_1")?.text;
  store.failOnSaveNumber(store.saveCount + 2);
  const undo = await app.undoCommit(original.semanticCommitId);
  assert.equal(undo.status, "FAILED");
  assert.equal(content.block("block_1")?.text, committedText);
  const state = await store.load();
  assert.equal(state.commits.find((commit) => commit.semanticCommitId === original.semanticCommitId)?.status, "COMPLETED");
  assert.equal(state.commits.some((commit) => commit.semanticCommitId === undo.semanticCommitId && commit.operationIds[0] === `undo:${original.semanticCommitId}`), true);
});

test("manual formalization and object editing keep Logseq text and Domain text in one undoable SemanticCommit", async () => {
  const { app, store, content } = harness();
  const capture = await app.captureCurrentBlock();
  const formalization = await app.createManualFormalizationProposal(capture.captureId, {
    objectType: "TASK", text: "使用真实事件验证告警链路", completionCriteria: "证据已保存", nextAction: "选择事件",
  });
  await app.reviewProposal(formalization.proposalId, Object.fromEntries(formalization.operations.map((operation) => [operation.operationId, "ACCEPTED"])));
  const created = await app.commitProposal(formalization.proposalId);
  assert.equal(created.status, "COMPLETED");
  let state = await store.load();
  const object = state.objects[0]!;
  assert.equal(object.text, "使用真实事件验证告警链路");
  assert.equal(content.block("block_1")?.text, object.text);
  const edit = await app.createManualObjectEditProposal(object.objectId, { text: "使用生产事件验证完整告警链路", nextAction: "记录证据" });
  await app.reviewProposal(edit.proposalId, Object.fromEntries(edit.operations.map((operation) => [operation.operationId, "ACCEPTED"])));
  const edited = await app.commitProposal(edit.proposalId);
  assert.equal(edited.status, "COMPLETED");
  state = await store.load();
  assert.equal(state.objects[0]?.text, "使用生产事件验证完整告警链路");
  assert.equal(content.block("block_1")?.text, "使用生产事件验证完整告警链路");
  assert.equal(edited.domainChanges.some((change) => change.entityType === "OBJECT" && change.before && change.after), true);
  assert.equal((await app.undoCommit(edited.semanticCommitId)).status, "COMPLETED");
  state = await store.load();
  assert.equal(state.objects[0]?.text, "使用真实事件验证告警链路");
  assert.equal(content.block("block_1")?.text, "使用真实事件验证告警链路");
});

test("manual Condition, Phase and ownership changes are prevalidated Proposals with before/after and Undo", async () => {
  const { app, store, content } = harness();
  content.setCurrentBlock({ externalId: "area", graphId: "graph_1", text: "系统责任区", pageRef: "Areas" });
  const areaCapture = await app.captureCurrentBlock();
  const area = await formalize(app, areaCapture.captureId, { objectType: "AREA", text: areaCapture.originalText, purpose: "持续责任" });
  content.setCurrentBlock({ externalId: "task", graphId: "graph_1", text: "验证恢复", pageRef: "Tasks" });
  const taskCapture = await app.captureCurrentBlock();
  const task = await formalize(app, taskCapture.captureId, { objectType: "TASK", text: taskCapture.originalText, completionCriteria: "恢复证据存在" });
  const ownership = await app.createManualOwnershipProposal(task.objectId, area.objectId);
  await assert.rejects(app.reviewProposal(ownership.proposalId, { [ownership.operations[0]!.operationId]: "ACCEPTED" }), /单独明确确认/);
  await app.reviewProposal(ownership.proposalId, { [ownership.operations[0]!.operationId]: { status: "ACCEPTED", highImpactConfirmed: true } });
  const ownershipCommit = await app.commitProposal(ownership.proposalId);
  assert.equal(ownershipCommit.domainChanges[0]?.entityType, "RELATION");
  const condition = await app.createManualConditionProposal(task.objectId, "WAITING", { waitingFor: "同事", expectedResult: "确认", reviewAt: "2026-07-20T09:00:00+08:00" });
  await app.reviewProposal(condition.proposalId, { [condition.operations[0]!.operationId]: "ACCEPTED" });
  const conditionCommit = await app.commitProposal(condition.proposalId);
  assert.equal((await app.getObject(task.objectId)).condition.kind, "WAITING");
  assert.equal(conditionCommit.domainChanges[0]?.before !== undefined, true);
  assert.equal((await app.undoCommit(conditionCommit.semanticCommitId)).status, "COMPLETED");
  assert.equal((await app.getObject(task.objectId)).condition.kind, "ACTIONABLE");
  const phase = await app.createManualPhaseProposal(task.objectId, "READY");
  await app.reviewProposal(phase.proposalId, { [phase.operations[0]!.operationId]: "ACCEPTED" });
  assert.equal((await app.commitProposal(phase.proposalId)).status, "COMPLETED");
  assert.equal((await store.load()).objects.find((candidate) => candidate.objectId === task.objectId)?.phase, "READY");
});

test("edited payload risk is recalculated before confirmation", async () => {
  const { app } = harness();
  const capture = await app.captureCurrentBlock();
  const task = await formalize(app, capture.captureId, { objectType: "TASK", text: capture.originalText, completionCriteria: "完成" });
  const proposal = await app.createManualPhaseProposal(task.objectId, "READY");
  const operation = proposal.operations[0]!;
  await assert.rejects(app.reviewProposal(proposal.proposalId, {
    [operation.operationId]: { status: "EDITED", payload: { phase: "CANCELLED", context: {} } },
  }), /单独明确确认/);
});

test("a Provider cannot inject an object ID that was not issued by the Application", async () => {
  const { store, content } = harness();
  const app = new TaskCopilot({
    store,
    content,
    provider: {
      providerId: "bad-provider",
      providerVersion: "1",
      enabled: true,
      async generateProposal(context) {
        return {
          proposalId: context.createId("prop"), sourceAnchorIds: [context.anchor.anchorId], sourceObjectIds: [], summary: "bad", facts: [], assumptions: [], uncertainties: [],
          operations: [{
            operationId: context.createId("op"), operationType: "create_object", target: { kind: "CAPTURE", id: context.capture.captureId },
            payload: { input: { objectId: "provider_chosen_id", objectType: "TASK", text: "unsafe" } }, preconditions: [], dependencies: [],
            riskLevel: "MEDIUM", ruleRefs: ["PRI-012"], rationale: "bad", confidence: 1, status: "PROPOSED",
          }],
          generatedAt: context.now.toISOString(), providerId: "bad-provider", providerVersion: "1", ruleVersion: "v1", status: "OPEN",
        };
      },
    },
    clock: () => new Date("2026-07-17T12:00:00.000Z"),
  });
  const capture = await app.captureCurrentBlock();
  await assert.rejects(app.generateProposal(capture.captureId), /Application 发放/);
});

test("editing a create_object Proposal cannot replace its stable identity", async () => {
  const { app } = harness();
  const capture = await app.captureCurrentBlock();
  const proposal = await app.createManualFormalizationProposal(capture.captureId, { objectType: "TASK", text: capture.originalText, completionCriteria: "完成" });
  const create = proposal.operations.find((operation) => operation.operationType === "create_object")!;
  const input = create.payload.input as Record<string, unknown>;
  await assert.rejects(app.reviewProposal(proposal.proposalId, {
    [create.operationId]: { status: "EDITED", payload: { ...create.payload, input: { ...input, objectId: "obj_replaced" } } },
  }), /不能改变/);
});

test("Anchor scan persists missing/conflict evidence and rebind resolves the object conflict", async () => {
  const { app, store, content } = harness();
  const capture = await app.captureCurrentBlock();
  const object = await formalize(app, capture.captureId, { objectType: "TASK", text: capture.originalText, completionCriteria: "完成" });
  content.deleteBlock("block_1");
  const scan = await app.scanAnchors();
  assert.equal(scan.missing, 1);
  let state = await store.load();
  assert.equal(state.anchors[0]?.status, "missing");
  assert.equal(state.objects[0]?.conflict?.code, "ANCHOR_MISSING");
  const conflict = (await app.getAuditProjection()).anchorConflicts[0]!;
  assert.equal(conflict.expectedText, capture.originalText);
  assert.equal(conflict.currentText, undefined);
  assert.ok(conflict.options.length >= 2);
  content.setCurrentBlock({ externalId: "replacement", graphId: "graph_1", text: capture.originalText, pageRef: "Recovery" });
  await app.rebindPrimaryAnchor(object.objectId);
  state = await store.load();
  assert.equal(state.anchors.find((anchor) => anchor.externalId === "block_1")?.status, "replaced");
  assert.equal(state.anchors.find((anchor) => anchor.externalId === "replacement")?.status, "active");
  assert.equal(state.objects[0]?.conflict, undefined);
});

test("an unchanged active Anchor scan updates no recovery event", async () => {
  const { app, store } = harness();
  await app.captureCurrentBlock();
  await app.scanAnchors();
  await app.scanAnchors();
  const state = await store.load();
  assert.equal(state.events.filter((event) => event.operationType === "anchor_recovered").length, 0);
});

test("startup recovery compensates multiple applied text mutations in reverse order", async () => {
  const { app, store, content } = harness();
  content.setCurrentBlock({ externalId: "block_2", graphId: "graph_1", text: "before two", pageRef: "Journal" });
  const first = { operationId: "op_1", anchorId: "anc_1", graphId: "graph_1", externalId: "block_1", beforeText: content.block("block_1")!.text, afterText: "after one", beforeHash: checksum(content.block("block_1")!.text), afterHash: checksum("after one") };
  const second = { operationId: "op_2", anchorId: "anc_2", graphId: "graph_1", externalId: "block_2", beforeText: "before two", afterText: "after two", beforeHash: checksum("before two"), afterHash: checksum("after two") };
  await content.apply(first);
  await content.apply(second);
  const state = await store.load();
  state.commits.push({
    semanticCommitId: "commit_pending", proposalId: "prop_pending", status: "PENDING", operationIds: ["op_1", "op_2"],
    createdAt: "2026-07-17T12:00:00.000Z", updatedAt: "2026-07-17T12:00:00.000Z", beforeStateChecksum: checksum(state),
    textMutations: [first, second], domainChanges: [],
  });
  await store.save(state, state.revision);
  const result = await app.recoverPendingCommits();
  assert.deepEqual(result.recovered, ["commit_pending"]);
  assert.deepEqual(content.compensationExternalIds.slice(-2), ["block_2", "block_1"]);
});
