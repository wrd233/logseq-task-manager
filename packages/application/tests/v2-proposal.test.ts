import assert from "node:assert/strict";
import test from "node:test";

import { renderV2ProposalFiles, type V2Proposal } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { V2ProposalApplication, type V2ProposalRepository, type V2StoredProposalRecord } from "../src/index.ts";

function proposal(): V2Proposal {
  const beforeText = "普通正文";
  const afterText = "[任务] 普通正文";
  return { proposalId: "prop_app", schemaVersion: "v2", title: "正式化", context: "当前普通正文。", understanding: "建议 Task。", objective: "建立对象。", logic: "正文语义一起提交。", finalPreview: afterText, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-app", version: 1, hash: checksum(beforeText) }] }, preconditions: [], groups: [{ groupId: "formalize", explanation: "不可拆组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-app", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-app", version: 1, hash: checksum(beforeText) }, summary: "创建 Task", payload: { objectType: "TASK" }, preconditions: [] }], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-20T12:00:00.000Z" };
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
