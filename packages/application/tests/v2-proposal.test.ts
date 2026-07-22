import assert from "node:assert/strict";
import test from "node:test";

import { renderV2ProposalFiles, type V2Proposal } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { V2ProposalApplication, planAcceptedV2Formalization, planAcceptedV2LifecycleTransition, planAcceptedV2ObjectUpdate, planAcceptedV2OwnershipChange, planAcceptedV2ProjectClosure, type V2ProposalRepository, type V2StoredProposalRecord } from "../src/index.ts";

function proposal(): V2Proposal {
  const beforeText = "普通正文";
  const afterText = "[任务] 普通正文";
  return { proposalId: "prop_app", schemaVersion: "v2", title: "正式化", context: "当前普通正文。", understanding: "建议 Task。", objective: "建立对象。", logic: "正文语义一起提交。", finalPreview: afterText, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-app", version: 1, hash: checksum(beforeText) }] }, preconditions: [], groups: [{ groupId: "formalize", explanation: "不可拆组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-app", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-app", version: 1, hash: checksum(beforeText) }, summary: "创建 Task", payload: { objectType: "TASK", text: "普通正文" }, preconditions: [] }], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-20T12:00:00.000Z" };
}

class MemoryProposalRepository implements V2ProposalRepository {
  value?: V2StoredProposalRecord;
  submitProposal(value: V2Proposal): { proposal: V2Proposal; replayed: boolean } {
    const replayed = Boolean(this.value);
    this.value ??= { proposal: value, files: renderV2ProposalFiles(value), updatedAt: "2026-07-20T12:00:01.000Z" };
    return { proposal: this.value.proposal, replayed };
  }
  storedProposal(): V2StoredProposalRecord | undefined { return this.value; }
  listStoredProposals(): V2StoredProposalRecord[] { return this.value ? [this.value] : []; }
  updateStoredProposal(value: V2Proposal, files: V2StoredProposalRecord["files"], expectedUpdatedAt: string, at = new Date()): V2StoredProposalRecord {
    if (this.value?.updatedAt !== expectedUpdatedAt) throw new Error("stale");
    this.value = { proposal: value, files, updatedAt: at.toISOString() };
    return this.value;
  }
}

test("Proposal Application submits only READY validated bundles and reads them back", async () => {
  const repository = new MemoryProposalRepository();
  const application = new V2ProposalApplication(repository);
  const submitted = await application.submit(proposal());
  assert.equal(submitted.replayed, false);
  assert.equal((await application.list()).length, 1);
  const draft = { ...proposal(), status: "DRAFT" as const };
  await assert.rejects(() => application.submit(draft), /READY/);
});

test("Proposal Application persists group review with optimistic concurrency", async () => {
  const repository = new MemoryProposalRepository();
  const application = new V2ProposalApplication(repository);
  const submitted = await application.submit(proposal());
  const reviewed = await application.review("prop_app", { formalize: { disposition: "ACCEPTED" } }, submitted.record.updatedAt, new Date("2026-07-20T12:01:00.000Z"));
  assert.equal(reviewed.proposal.status, "ACCEPTED");
  await assert.rejects(() => application.review("prop_app", { formalize: { disposition: "REJECTED" } }, submitted.record.updatedAt), /变化/);
});

test("Proposal Application revalidates accepted scope and persists an explicit stale state", async () => {
  const repository = new MemoryProposalRepository();
  const application = new V2ProposalApplication(repository);
  const submitted = await application.submit(proposal());
  const reviewed = await application.review("prop_app", { formalize: { disposition: "ACCEPTED" } }, submitted.record.updatedAt, new Date("2026-07-20T12:01:00.000Z"));
  const valid = await application.revalidate("prop_app", [
    { kind: "BLOCK", id: "block-app", exists: true, version: 1, hash: checksum("普通正文") },
  ], reviewed.updatedAt);
  assert.equal(valid.result.status, "VALID");
  assert.equal(valid.record.updatedAt, reviewed.updatedAt, "successful read-only revalidation does not churn review version");
  const stale = await application.revalidate("prop_app", [
    { kind: "BLOCK", id: "block-app", exists: true, version: 2, hash: checksum("用户已编辑") },
  ], reviewed.updatedAt, new Date("2026-07-20T12:02:00.000Z"));
  assert.equal(stale.result.status, "STALE");
  assert.equal(stale.record.proposal.status, "STALE");
  await assert.rejects(() => application.revalidate("prop_app", [], reviewed.updatedAt), /变化/);
});

test("accepted formalization plan couples exactly one Graph patch to one Service-owned object creation", () => {
  const accepted = { ...proposal(), status: "ACCEPTED" as const, groups: proposal().groups.map((group) => ({ ...group, disposition: "ACCEPTED" as const })) };
  assert.deepEqual(planAcceptedV2Formalization(accepted), {
    proposalId: "prop_app",
    groupId: "formalize",
    patch: accepted.groups[0]!.textPatches[0],
    create: { operationId: "create", objectType: "TASK", text: "普通正文", blockUuid: "block-app" },
  });
  const unsupported = structuredClone(accepted);
  unsupported.groups[0]!.risk = "HIGH";
  unsupported.groups[0]!.semanticOperations.push({ ...unsupported.groups[0]!.semanticOperations[0]!, operationId: "move", kind: "MOVE_BLOCK" });
  assert.throws(() => planAcceptedV2Formalization(unsupported), /尚不支持/);
});

test("accepted object update plan couples one reviewed Block rewrite to one versioned existing object", () => {
  const beforeText = "[任务] 核对旧告警";
  const afterText = "[任务] 核对新告警并记录结论";
  const accepted: V2Proposal = {
    proposalId: "prop-update-existing", schemaVersion: "v2", title: "更新已有任务", context: "Candidate 提供了补充信息。", understanding: "应合并到已有任务。", objective: "更新已有对象正文。", logic: "先审阅最终正文，再以同一 Commit 更新 Graph 与对象缓存。", finalPreview: afterText, unresolvedQuestions: [], source: { kind: "user" },
    scope: { read: [{ kind: "BLOCK", id: "candidate-source", version: 3, hash: checksum("补充信息") }], modify: [{ kind: "BLOCK", id: "target-block", version: 8, hash: checksum(beforeText) }, { kind: "OBJECT", id: "task-existing", version: 4 }] }, preconditions: ["来源与目标均未变化"],
    groups: [{ groupId: "update-existing", explanation: "Graph 正文与对象缓存不可拆分。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "target-block", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }], semanticOperations: [{ operationId: "rewrite-existing", kind: "REWRITE_BLOCK", target: { kind: "BLOCK", id: "target-block", version: 8, hash: checksum(beforeText) }, summary: "更新已有 Task 正文", payload: { objectId: "task-existing", objectType: "TASK", beforeText: "核对旧告警", text: "核对新告警并记录结论" }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-22T12:00:00.000Z",
  };
  assert.deepEqual(planAcceptedV2ObjectUpdate(accepted), {
    proposalId: "prop-update-existing", groupId: "update-existing", patch: accepted.groups[0]!.textPatches[0],
    update: { operationId: "rewrite-existing", objectId: "task-existing", expectedVersion: 4, objectType: "TASK", beforeText: "核对旧告警", text: "核对新告警并记录结论", blockUuid: "target-block" },
  });
  const missingObjectScope = structuredClone(accepted); missingObjectScope.scope.modify.pop();
  assert.throws(() => planAcceptedV2ObjectUpdate(missingObjectScope), /带版本对象/);
  const typeChange = structuredClone(accepted); typeChange.groups[0]!.semanticOperations[0]!.payload.objectType = "PROJECT";
  assert.throws(() => planAcceptedV2ObjectUpdate(typeChange), /对象类型/);
  const extraOperation = structuredClone(accepted); extraOperation.groups[0]!.semanticOperations.push({ ...extraOperation.groups[0]!.semanticOperations[0]!, operationId: "extra" });
  assert.throws(() => planAcceptedV2ObjectUpdate(extraOperation), /一个正文 Patch/);
});

test("accepted Project Closure plan couples structured Closure and COMPLETED lifecycle on one versioned Project", () => {
  const closure = {
    originalGoal: "让推送可控。", actualResult: "新链路已上线。", majorDeliverables: ["推送服务"],
    incompleteObjectives: [{ objective: "历史回放", reason: "数据未齐", nextStep: "转入数据治理" }],
    legacyDisposition: "由新 Project 承接。", keyDecisions: ["保留回退"], futureSummary: "重入先查历史数据。",
  };
  const accepted: V2Proposal = {
    proposalId: "prop-closure", schemaVersion: "v2", title: "关闭告警治理", context: "Project 已完成主要交付。", understanding: "一项 Objective 转移。", objective: "形成 Closure 并完成 Project。", logic: "先审阅未完成原因和去向。", finalPreview: "新链路已上线；历史回放转移。", unresolvedQuestions: [], source: { kind: "external_agent", skillVersion: "design-project@1" },
    scope: { read: [], modify: [{ kind: "OBJECT", id: "project-closure", version: 4 }] }, preconditions: ["Project 仍为 OPEN"],
    groups: [{ groupId: "close-project", explanation: "Closure 与 Lifecycle 不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [
      { operationId: "record-closure", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: "project-closure", version: 4 }, summary: "记录 Project Closure", payload: { closure }, preconditions: [] },
      { operationId: "complete-project", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "project-closure", version: 4 }, summary: "完成 Project", payload: { lifecycle: "COMPLETED" }, preconditions: [] },
    ], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-21T12:00:00.000Z",
  };
  assert.deepEqual(planAcceptedV2ProjectClosure(accepted), { proposalId: "prop-closure", groupId: "close-project", objectId: "project-closure", expectedVersion: 4, closure });
  const partiallyAccepted = structuredClone(accepted);
  partiallyAccepted.status = "PARTIALLY_ACCEPTED";
  partiallyAccepted.groups.push({ groupId: "optional-note", explanation: "不影响 Closure。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [
    { operationId: "optional-note", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: "project-closure", version: 4 }, summary: "可选说明", payload: { note: "不采纳" }, preconditions: [] },
  ], disposition: "REJECTED" });
  assert.equal(planAcceptedV2ProjectClosure(partiallyAccepted).objectId, "project-closure");
  const split = structuredClone(accepted);
  split.groups[0]!.semanticOperations.pop();
  assert.throws(() => planAcceptedV2ProjectClosure(split), /Closure 和 COMPLETED/);
});

test("MiniProject closure review requires three answers before producing one accepted versioned plan", async () => {
  const accepted: V2Proposal = {
    ...proposal(),
    proposalId: "prop-marker-close",
    title: "完成 MiniProject",
    context: "Logseq 中的显式 MiniProject 已改为 DONE。",
    understanding: "DONE 是关闭请求，不能绕过审阅。",
    objective: "审阅后完成同一 MiniProject。",
    logic: "重验 Block hash 和 Object version 后使用单一 Domain Commit。",
    finalPreview: "Marker Desktop Gate 将从 OPEN 变为 COMPLETED。",
    scope: { read: [{ kind: "BLOCK", id: "block-mini", hash: "12345678" }], modify: [{ kind: "OBJECT", id: "mini-1", version: 3 }] },
    groups: [{ groupId: "complete-mini", explanation: "MiniProject 关闭需要独立审阅。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{
      operationId: "complete-mini", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "mini-1", version: 3 }, summary: "完成 MiniProject",
      payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT", text: "Marker Desktop Gate", marker: "DONE", externalId: "block-mini", contentHash: "12345678", closure: { originalGoal: "完成 Gate", actualResult: "Gate 通过", remainingWork: "无遗留" } }, preconditions: [],
    }], disposition: "ACCEPTED" }],
    status: "ACCEPTED",
  };
  assert.deepEqual(planAcceptedV2LifecycleTransition(accepted), {
    proposalId: "prop-marker-close", groupId: "complete-mini", objectId: "mini-1", expectedVersion: 3, lifecycle: "COMPLETED",
    objectType: "MINI_PROJECT", evidenceKind: "MARKER", text: "Marker Desktop Gate", marker: "DONE", externalId: "block-mini", contentHash: "12345678", closure: { originalGoal: "完成 Gate", actualResult: "Gate 通过", remainingWork: "无遗留" },
  });
  const externalAgent = structuredClone(accepted);
  externalAgent.proposalId = "prop-agent-close";
  externalAgent.source = { kind: "external_agent", skillVersion: "task-copilot-core@1" };
  externalAgent.scope.read = [];
  const externalPayload = externalAgent.groups[0]!.semanticOperations[0]!.payload;
  delete externalPayload.text; delete externalPayload.marker; delete externalPayload.externalId; delete externalPayload.contentHash;
  assert.deepEqual(planAcceptedV2LifecycleTransition(externalAgent), {
    proposalId: "prop-agent-close", groupId: "complete-mini", objectId: "mini-1", expectedVersion: 3, lifecycle: "COMPLETED",
    objectType: "MINI_PROJECT", evidenceKind: "OBJECT_ONLY", closure: { originalGoal: "完成 Gate", actualResult: "Gate 通过", remainingWork: "无遗留" },
  });
  const downgraded = structuredClone(accepted); downgraded.groups[0]!.risk = "MEDIUM";
  assert.throws(() => planAcceptedV2LifecycleTransition(downgraded), /HIGH/);
  const projectBypass = structuredClone(accepted); projectBypass.groups[0]!.semanticOperations[0]!.payload.objectType = "PROJECT";
  assert.throws(() => planAcceptedV2LifecycleTransition(projectBypass), /MiniProject/);
  const ready = structuredClone(accepted);
  ready.status = "READY";
  ready.groups[0]!.disposition = "PENDING";
  const prefilledRepository = new MemoryProposalRepository();
  const prefilledApplication = new V2ProposalApplication(prefilledRepository);
  const prefilled = await prefilledApplication.submit(ready);
  await assert.rejects(() => prefilledApplication.review(ready.proposalId, { "complete-mini": { disposition: "ACCEPTED", highImpactConfirmed: true } }, prefilled.record.updatedAt), /专用三问/);
  delete ready.groups[0]!.semanticOperations[0]!.payload.closure;
  ready.unresolvedQuestions = ["原目标？", "实际结果？", "遗留？"];
  const repository = new MemoryProposalRepository();
  const application = new V2ProposalApplication(repository);
  const submitted = await application.submit(ready);
  await assert.rejects(() => application.review(ready.proposalId, { "complete-mini": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt), /三问/);
  const reviewed = await application.reviewMiniProjectClosure(ready.proposalId, "complete-mini", { originalGoal: "完成 Gate", actualResult: "Gate 通过", remainingWork: "无遗留" }, submitted.record.updatedAt);
  assert.equal(reviewed.proposal.status, "ACCEPTED");
  assert.deepEqual(planAcceptedV2LifecycleTransition(reviewed.proposal).closure, { originalGoal: "完成 Gate", actualResult: "Gate 通过", remainingWork: "无遗留" });

  const withRemaining = structuredClone(ready);
  withRemaining.proposalId = "prop-mini-with-remaining";
  withRemaining.groups.push({ groupId: "remaining-work", explanation: "遗留工作必须拆为独立 Proposal。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "remaining-note", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: "mini-1", version: 3 }, summary: "记录待拆分遗留", payload: { note: "另行创建对象" }, preconditions: [] }], disposition: "PENDING" });
  const remainingApplication = new V2ProposalApplication(new MemoryProposalRepository());
  const remainingSubmitted = await remainingApplication.submit(withRemaining);
  const closureAccepted = await remainingApplication.reviewMiniProjectClosure(withRemaining.proposalId, "complete-mini", { originalGoal: "完成 Gate", actualResult: "Gate 通过", remainingWork: "另行处理" }, remainingSubmitted.record.updatedAt);
  assert.throws(() => planAcceptedV2LifecycleTransition(closureAccepted.proposal), /拒绝其余未提交语义组/);
  const remainingRejected = await remainingApplication.review(withRemaining.proposalId, { "remaining-work": { disposition: "REJECTED" } }, closureAccepted.updatedAt);
  assert.equal(planAcceptedV2LifecycleTransition(remainingRejected.proposal).groupId, "complete-mini");
});

test("accepted Ownership plan requires one versioned HIGH operation and explicit current-owner evidence", () => {
  const accepted: V2Proposal = { ...proposal(), proposalId: "prop-owner", status: "ACCEPTED", scope: { read: [{ kind: "OBJECT", id: "area-owner", version: 3 }], modify: [{ kind: "OBJECT", id: "task-child", version: 2 }] }, groups: [{ groupId: "change-owner", explanation: "独立审阅主归属。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "owner", kind: "CHANGE_OWNERSHIP", target: { kind: "OBJECT", id: "task-child", version: 2 }, summary: "改归属", payload: { ownerObjectId: "area-owner", expectedCurrentOwnerId: "project-old" }, preconditions: [] }], disposition: "ACCEPTED" }] };
  assert.deepEqual(planAcceptedV2OwnershipChange(accepted), { proposalId: "prop-owner", groupId: "change-owner", childObjectId: "task-child", ownerObjectId: "area-owner", expectedVersion: 2, expectedOwnerVersion: 3, expectedCurrentOwnerId: "project-old" });
  const unsafe = structuredClone(accepted); unsafe.groups[0]!.risk = "MEDIUM";
  assert.throws(() => planAcceptedV2OwnershipChange(unsafe), /不能降级风险/);
  const missingOwnerEvidence = structuredClone(accepted); missingOwnerEvidence.scope.read = [];
  assert.throws(() => planAcceptedV2OwnershipChange(missingOwnerEvidence), /read scope/);
  const unversionedOwner = structuredClone(accepted); delete unversionedOwner.scope.read[0]!.version;
  assert.throws(() => planAcceptedV2OwnershipChange(unversionedOwner), /read scope/);
  const invalidOwner = structuredClone(accepted); invalidOwner.groups[0]!.semanticOperations[0]!.payload.ownerObjectId = " ";
  assert.throws(() => planAcceptedV2OwnershipChange(invalidOwner), /read scope/);
  const unchangedOwner = structuredClone(accepted); unchangedOwner.groups[0]!.semanticOperations[0]!.payload.expectedCurrentOwnerId = "area-owner";
  assert.throws(() => planAcceptedV2OwnershipChange(unchangedOwner), /不表达正式变化/);
  const selfOwner = structuredClone(accepted); selfOwner.groups[0]!.semanticOperations[0]!.target.id = "area-owner"; selfOwner.scope.modify[0]!.id = "area-owner";
  assert.throws(() => planAcceptedV2OwnershipChange(selfOwner), /不能成为自己的/);
});

test("Proposal Application records applied and compensated terminal states with review concurrency", async () => {
  const repository = new MemoryProposalRepository();
  const application = new V2ProposalApplication(repository);
  const submitted = await application.submit(proposal());
  const reviewed = await application.review("prop_app", { formalize: { disposition: "ACCEPTED" } }, submitted.record.updatedAt, new Date("2026-07-20T12:01:00.000Z"));
  const applied = await application.markApplied("prop_app", reviewed.updatedAt, new Date("2026-07-20T12:02:00.000Z"));
  assert.equal(applied.proposal.status, "APPLIED");
  await assert.rejects(() => application.markFailed("prop_app", reviewed.updatedAt), /变化/);
  const failedRepository = new MemoryProposalRepository();
  const failedApplication = new V2ProposalApplication(failedRepository);
  const failedSubmitted = await failedApplication.submit(proposal());
  const failedReviewed = await failedApplication.review("prop_app", { formalize: { disposition: "ACCEPTED" } }, failedSubmitted.record.updatedAt, new Date("2026-07-20T12:01:00.000Z"));
  assert.equal((await failedApplication.markFailed("prop_app", failedReviewed.updatedAt)).proposal.status, "FAILED");
});
