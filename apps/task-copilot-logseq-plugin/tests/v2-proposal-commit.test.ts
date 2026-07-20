import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceStoredProposal } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { commitV2Formalization } from "../src/v2-proposal-commit.ts";

function record(): ServiceStoredProposal {
  const before = "核对告警";
  const after = "[任务] 核对告警";
  return { updatedAt: "2026-07-20T12:01:00.000Z", files: { proposalMd: "# 正式化", proposalJson: "{}" }, proposal: {
    proposalId: "prop_commit", schemaVersion: "v2", title: "正式化", context: "普通正文", understanding: "建议 Task", objective: "建立对象", logic: "同组提交", finalPreview: after, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-commit", version: 1, hash: checksum(before) }] }, preconditions: [],
    groups: [{ groupId: "formalize", explanation: "不可拆", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-commit", beforeText: before, afterText: after, beforeHash: checksum(before), afterHash: checksum(after) }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-commit" }, summary: "创建 Task", payload: { objectType: "TASK" }, preconditions: [] }], disposition: "ACCEPTED" }], status: "ACCEPTED", createdAt: "2026-07-20T12:00:00.000Z",
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
  }, value, "trace");
  assert.deepEqual(result, { status: "COMPLETED", semanticCommitId: "proposal-commit:abc", objectId: "obj-commit" });
  assert.equal(content, "[任务] 核对告警");
  assert.equal(updates, 1);
});

test("Plugin Proposal Commit compensates Graph and never reports success after Domain failure", async () => {
  let content = "核对告警";
  const value = record();
  let compensated = false;
  const result = await commitV2Formalization({
    prepareProposalCommit: async () => ({ status: "PREPARED", semanticCommitId: "proposal-commit:def", proposalId: "prop_commit", expectedUpdatedAt: value.updatedAt, objectId: "obj-commit", plan: { proposalId: "prop_commit", groupId: "formalize", patch: value.proposal.groups[0]!.textPatches[0]!, create: { operationId: "create", objectType: "TASK", text: "核对告警", blockUuid: "block-commit" } }, replayed: false }),
    finalizeProposalCommit: async () => ({ status: "COMPENSATION_REQUIRED", semanticCommitId: "proposal-commit:def", proposalId: "prop_commit", expectedUpdatedAt: value.updatedAt, patch: value.proposal.groups[0]!.textPatches[0]! }),
    compensateProposalCommit: async () => { compensated = true; return { status: "FAILED_COMPENSATED", semanticCommitId: "proposal-commit:def", record: value }; },
  }, { getBlock: async () => ({ uuid: "block-commit", content, updatedAt: 2 }), getPage: async () => null, updateBlock: async (_id, next) => { content = next; } }, value, "trace");
  assert.equal(result.status, "FAILED_COMPENSATED");
  assert.equal(content, "核对告警");
  assert.equal(compensated, true);
});
