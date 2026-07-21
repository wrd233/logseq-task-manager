import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceStoredProposal } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { commitV2Formalization, undoV2Formalization } from "../src/v2-proposal-commit.ts";

function record(): ServiceStoredProposal {
  const before = "核对告警";
  const after = "[任务] 核对告警";
  return { updatedAt: "2026-07-20T12:01:00.000Z", files: { proposalMd: "# 正式化", proposalJson: "{}" }, proposal: {
    proposalId: "prop_commit", schemaVersion: "v2", title: "正式化", context: "普通正文", understanding: "建议 Task", objective: "建立对象", logic: "同组提交", finalPreview: after, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-commit", version: 1, hash: checksum(before) }] }, preconditions: [],
    groups: [{ groupId: "formalize", explanation: "不可拆", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-commit", beforeText: before, afterText: after, beforeHash: checksum(before), afterHash: checksum(after) }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-commit" }, summary: "创建 Task", payload: { objectType: "TASK", text: "核对告警" }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-20T12:00:00.000Z",
  } };
}

function updateRecord(): ServiceStoredProposal {
  const before = "[任务] 核对旧告警";
  const after = "[任务] 核对新告警并记录结论";
  return { updatedAt: "2026-07-22T12:01:00.000Z", files: { proposalMd: "# 更新", proposalJson: "{}" }, proposal: {
    proposalId: "prop_update", schemaVersion: "v2", title: "更新已有任务", context: "Candidate 补充信息", understanding: "合并到已有任务", objective: "更新正文", logic: "同组提交", finalPreview: after, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [{ kind: "BLOCK", id: "source-update", version: 3, hash: checksum("补充信息") }], modify: [{ kind: "BLOCK", id: "target-update", version: 8, hash: checksum(before) }, { kind: "OBJECT", id: "task-existing", version: 4 }] }, preconditions: [],
    groups: [{ groupId: "update-existing-object", explanation: "不可拆", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "target-update", beforeText: before, afterText: after, beforeHash: checksum(before), afterHash: checksum(after) }], semanticOperations: [{ operationId: "rewrite-existing-object", kind: "REWRITE_BLOCK", target: { kind: "BLOCK", id: "target-update", version: 8, hash: checksum(before) }, summary: "更新已有 Task", payload: { objectId: "task-existing", objectType: "TASK", beforeText: "核对旧告警", text: "核对新告警并记录结论" }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-22T12:00:00.000Z",
  } };
}

test("Plugin Proposal Commit applies Graph once and reports success only after Service completion", async () => {
  let content = "核对告警";
  let updates = 0;
  const value = record();
  const result = await commitV2Formalization({
    prepareProposalCommit: async () => ({ status: "PREPARED", semanticCommitId: "proposal-commit:abc", proposalId: "prop_commit", expectedUpdatedAt: value.updatedAt, objectId: "obj-commit", plan: { proposalId: "prop_commit", groupId: "formalize", patch: value.proposal.groups[0]!.textPatches[0]!, create: { operationId: "create", objectType: "TASK", text: "核对告警", blockUuid: "block-commit" } }, replayed: false }),
    finalizeProposalCommit: async () => ({ status: "COMPLETED", semanticCommitId: "proposal-commit:abc", object: { objectId: "obj-commit", objectType: "TASK", version: 2, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "核对告警", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "proposal" }, anchor: { anchorId: "anc", objectId: "obj-commit", graphId: "graph", externalId: "block-commit", role: "primary_text", status: "active", contentHash: checksum(content), lastSeenAt: "now" }, record: value, replayed: false }),
    compensateProposalCommit: async () => { throw new Error("not expected"); },
  }, {
    getBlock: async () => ({ uuid: "block-commit", content, updatedAt: updates + 1 }), getPage: async () => null,
    updateBlock: async (_id, next) => { updates += 1; content = next; },
    ensurePersistentIdentity: async () => undefined,
  }, value, "trace");
  assert.deepEqual(result, { status: "COMPLETED", semanticCommitId: "proposal-commit:abc", objectId: "obj-commit" });
  assert.equal(content, "[任务] 核对告警");
  assert.equal(updates, 1);
});

test("Plugin Candidate UPDATE Commit rewrites the existing Anchor without issuing a new identity", async () => {
  let content = "[任务] 核对旧告警";
  let identityWrites = 0;
  const value = updateRecord();
  const patch = value.proposal.groups[0]!.textPatches[0]!;
  const result = await commitV2Formalization({
    prepareProposalCommit: async () => ({ status: "PREPARED", semanticCommitId: "proposal-commit:update", proposalId: "prop_update", expectedUpdatedAt: value.updatedAt, objectId: "task-existing", plan: { proposalId: "prop_update", groupId: "update-existing-object", patch, update: { operationId: "rewrite-existing-object", objectId: "task-existing", expectedVersion: 4, objectType: "TASK", beforeText: "核对旧告警", text: "核对新告警并记录结论", blockUuid: "target-update" } }, replayed: false }),
    finalizeProposalCommit: async () => ({ status: "COMPLETED", semanticCommitId: "proposal-commit:update", object: { objectId: "task-existing", objectType: "TASK", version: 5, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "核对新告警并记录结论", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "explicit" }, anchor: { anchorId: "anchor-existing", objectId: "task-existing", graphId: "graph", externalId: "target-update", role: "primary_text", status: "active", contentHash: checksum(content), lastSeenAt: "now" }, record: value, replayed: false }),
    compensateProposalCommit: async () => { throw new Error("not expected"); },
  }, {
    getBlock: async (id) => id === "source-update" ? ({ uuid: id, content: "补充信息", updatedAt: 3 }) : ({ uuid: id, content, updatedAt: 8 }), getPage: async () => null,
    updateBlock: async (_id, next) => { content = next; }, ensurePersistentIdentity: async () => { identityWrites += 1; },
  }, value, "trace-update");
  assert.equal(result.status, "COMPLETED");
  assert.equal(content, "[任务] 核对新告警并记录结论");
  assert.equal(identityWrites, 0, "an existing active Anchor already owns persistent identity");
});

test("Plugin Proposal Commit compensates Graph and never reports success after Domain failure", async () => {
  let content = "核对告警";
  const value = record();
  let compensated = false;
  const result = await commitV2Formalization({
    prepareProposalCommit: async () => ({ status: "PREPARED", semanticCommitId: "proposal-commit:def", proposalId: "prop_commit", expectedUpdatedAt: value.updatedAt, objectId: "obj-commit", plan: { proposalId: "prop_commit", groupId: "formalize", patch: value.proposal.groups[0]!.textPatches[0]!, create: { operationId: "create", objectType: "TASK", text: "核对告警", blockUuid: "block-commit" } }, replayed: false }),
    finalizeProposalCommit: async () => ({ status: "COMPENSATION_REQUIRED", semanticCommitId: "proposal-commit:def", proposalId: "prop_commit", expectedUpdatedAt: value.updatedAt, patch: value.proposal.groups[0]!.textPatches[0]! }),
    compensateProposalCommit: async () => { compensated = true; return { status: "FAILED_COMPENSATED", semanticCommitId: "proposal-commit:def", record: value }; },
  }, { getBlock: async () => ({ uuid: "block-commit", content, updatedAt: 2 }), getPage: async () => null, updateBlock: async (_id, next) => { content = next; }, ensurePersistentIdentity: async () => undefined }, value, "trace");
  assert.equal(result.status, "FAILED_COMPENSATED");
  assert.equal(content, "核对告警");
  assert.equal(compensated, true);
});

test("Plugin Proposal Commit resumes after restart without rewriting an already-applied Graph patch", async () => {
  let content = "[任务] 核对告警";
  let updates = 0;
  const value = record();
  const result = await commitV2Formalization({
    prepareProposalCommit: async () => ({ status: "PREPARED", semanticCommitId: "proposal-commit:restart", proposalId: "prop_commit", expectedUpdatedAt: value.updatedAt, objectId: "obj-restart", plan: { proposalId: "prop_commit", groupId: "formalize", patch: value.proposal.groups[0]!.textPatches[0]!, create: { operationId: "create", objectType: "TASK", text: "核对告警", blockUuid: "block-commit" } }, replayed: true }),
    finalizeProposalCommit: async () => ({ status: "COMPLETED", semanticCommitId: "proposal-commit:restart", object: { objectId: "obj-restart", objectType: "TASK", version: 2, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "核对告警", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "proposal" }, anchor: { anchorId: "anc", objectId: "obj-restart", graphId: "graph", externalId: "block-commit", role: "primary_text", status: "active", contentHash: checksum(content), lastSeenAt: "now" }, record: value, replayed: false }),
    compensateProposalCommit: async () => { throw new Error("not expected"); },
  }, { getBlock: async () => ({ uuid: "block-commit", content, updatedAt: 2 }), getPage: async () => null, updateBlock: async (_id, next) => { updates += 1; content = next; }, ensurePersistentIdentity: async () => undefined }, value, "trace-restart");
  assert.equal(result.status, "COMPLETED");
  assert.equal(updates, 0);
});

test("Plugin Proposal Undo restores正文, supports restart after Graph write, and waits for Service completion", async () => {
  let content = "[任务] 核对告警";
  let updates = 0;
  const patch = record().proposal.groups[0]!.textPatches[0]!;
  const client = {
    prepareProposalUndo: async () => ({ status: "PREPARED" as const, originalSemanticCommitId: "proposal-commit:abc", undoSemanticCommitId: "undo:proposal-commit:abc", proposalId: "prop_commit", objectId: "obj-commit", patch, replayed: false }),
    finalizeProposalUndo: async () => ({ status: "COMPLETED" as const, originalSemanticCommitId: "proposal-commit:abc", undoSemanticCommitId: "undo:proposal-commit:abc", objectId: "obj-commit", replayed: false }),
    compensateProposalUndo: async () => { throw new Error("not expected"); },
  };
  const host = { getBlock: async () => ({ uuid: "block-commit", content, updatedAt: updates + 1 }), getPage: async () => null, updateBlock: async (_id: string, next: string) => { updates += 1; content = next; } };
  assert.equal((await undoV2Formalization(client, host, "proposal-commit:abc", "trace")).status, "COMPLETED");
  assert.equal(content, "核对告警");
  assert.equal(updates, 1);
  assert.equal((await undoV2Formalization(client, host, "proposal-commit:abc", "trace-restart")).status, "COMPLETED", "already-restored Graph evidence is safe to finalize after restart");
  assert.equal(updates, 1);
});

test("Plugin Proposal Undo never overwrites正文 edited after the original Commit", async () => {
  const patch = record().proposal.groups[0]!.textPatches[0]!;
  let updates = 0;
  await assert.rejects(() => undoV2Formalization({
    prepareProposalUndo: async () => ({ status: "PREPARED", originalSemanticCommitId: "proposal-commit:edit", undoSemanticCommitId: "undo:proposal-commit:edit", proposalId: "prop_commit", objectId: "obj-commit", patch, replayed: false }),
    finalizeProposalUndo: async () => { throw new Error("must not finalize"); }, compensateProposalUndo: async () => { throw new Error("must not compensate"); },
  }, {
    getBlock: async () => ({ uuid: "block-commit", content: "[任务] 用户后续编辑", updatedAt: 3 }), getPage: async () => null,
    updateBlock: async () => { updates += 1; },
  }, "proposal-commit:edit", "trace-edit"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROPOSAL_UNDO_GRAPH_STALE");
  assert.equal(updates, 0);
});
