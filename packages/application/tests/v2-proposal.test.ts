import assert from "node:assert/strict";
import test from "node:test";

import { renderV2ProposalFiles, type V2Proposal } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { V2ProposalApplication, planAcceptedV2Formalization, planAcceptedV2OwnershipChange, planAcceptedV2ProjectClosure, type V2ProposalRepository, type V2StoredProposalRecord } from "../src/index.ts";

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
