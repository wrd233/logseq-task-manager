import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceStoredProposal } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { applyLowRiskV2Proposal, lowRiskApplyEligibility } from "../src/v2-low-risk-apply.ts";

function readyRecord(risk: "LOW" | "MEDIUM" | "HIGH" = "LOW"): ServiceStoredProposal {
  const before = "核对告警";
  const after = "[任务] 核对告警";
  return { updatedAt: "2026-07-23T15:00:00.000Z", files: { proposalMd: "# 正式化", proposalJson: "{}" }, proposal: {
    proposalId: "prop-low-risk", schemaVersion: "v2", title: "正式化告警", context: "当前普通正文", understanding: "建议 Task", objective: "建立对象", logic: "单组提交", finalPreview: after, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "BLOCK", id: "block-low-risk", version: 1, hash: checksum(before) }] }, preconditions: [],
    groups: [{ groupId: "formalize", explanation: "单 Block 正式化", risk, independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-low-risk", beforeText: before, afterText: after, beforeHash: checksum(before), afterHash: checksum(after) }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-low-risk" }, summary: "创建 Task", payload: { objectType: "TASK", text: before }, preconditions: [] }], disposition: "PENDING" }],
    status: "READY", createdAt: "2026-07-23T14:59:00.000Z",
  } };
}

test("LOW one-group one-Block formalization is the only ready one-click shape", () => {
  assert.deepEqual(lowRiskApplyEligibility(readyRecord()), { eligible: true, groupId: "formalize" });
  const rewrite = readyRecord();
  rewrite.proposal.scope.modify.push({ kind: "OBJECT", id: "task-existing", version: 4 });
  rewrite.proposal.groups[0]!.semanticOperations = [{
    operationId: "rewrite",
    kind: "REWRITE_BLOCK",
    target: { kind: "BLOCK", id: "block-low-risk", version: 1, hash: checksum("核对告警") },
    summary: "更新已有 Task",
    payload: { objectId: "task-existing", objectType: "TASK", beforeText: "核对告警", text: "核对告警并记录结论" },
    preconditions: [],
  }];
  assert.deepEqual(lowRiskApplyEligibility(rewrite), { eligible: true, groupId: "formalize" });
  assert.equal(lowRiskApplyEligibility(readyRecord("MEDIUM")).eligible, false);
  const highImpact = readyRecord();
  highImpact.proposal.groups[0]!.semanticOperations[0] = {
    operationId: "move",
    kind: "CHANGE_OWNERSHIP",
    target: { kind: "OBJECT", id: "task-1", version: 2 },
    summary: "改变归属",
    payload: { ownerObjectId: "project-1" },
    preconditions: [],
  };
  assert.equal(lowRiskApplyEligibility(highImpact).eligible, false);
});

test("one-click apply accepts, revalidates and reports success only after the existing SemanticCommit completes", async () => {
  const ready = readyRecord();
  const accepted: ServiceStoredProposal = {
    ...ready,
    updatedAt: "2026-07-23T15:00:01.000Z",
    proposal: {
      ...ready.proposal,
      status: "ACCEPTED",
      groups: [{ ...ready.proposal.groups[0]!, disposition: "ACCEPTED" }],
    },
  };
  const calls: string[] = [];
  let content = "核对告警";
  const result = await applyLowRiskV2Proposal({
    reviewProposal: async (_proposalId, decisions, expectedUpdatedAt) => {
      calls.push(`review:${expectedUpdatedAt}:${decisions.formalize?.disposition}`);
      return accepted;
    },
    revalidateProposal: async (_proposalId, observations, expectedUpdatedAt) => {
      calls.push(`revalidate:${expectedUpdatedAt}:${observations[0]?.hash}`);
      return { record: accepted, result: { status: "VALID", acceptedGroupIds: ["formalize"] } };
    },
    prepareProposalCommit: async (_proposalId, _observations, expectedUpdatedAt) => {
      calls.push(`prepare:${expectedUpdatedAt}`);
      return { status: "PREPARED", semanticCommitId: "proposal-commit:low", proposalId: accepted.proposal.proposalId, expectedUpdatedAt: accepted.updatedAt, objectId: "task-low", plan: { proposalId: accepted.proposal.proposalId, groupId: "formalize", patch: accepted.proposal.groups[0]!.textPatches[0]!, create: { operationId: "create", objectType: "TASK", text: "核对告警", blockUuid: "block-low-risk" } }, replayed: false };
    },
    finalizeProposalCommit: async () => {
      calls.push("finalize");
      return { status: "COMPLETED", semanticCommitId: "proposal-commit:low", object: { objectId: "task-low", objectType: "TASK", version: 1, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "核对告警", createdAt: "now", updatedAt: "now", sourceOrCreationEvent: "proposal" }, anchor: { anchorId: "anchor-low", objectId: "task-low", graphId: "graph", externalId: "block-low-risk", role: "primary_text", status: "active", contentHash: checksum(content), lastSeenAt: "now" }, record: accepted, replayed: false };
    },
    compensateProposalCommit: async () => { throw new Error("not expected"); },
  }, {
    getBlock: async () => ({ uuid: "block-low-risk", content, updatedAt: 1 }),
    getPage: async () => null,
    updateBlock: async (_id, next) => { calls.push("graph"); content = next; },
    ensurePersistentIdentity: async () => { calls.push("identity"); },
  }, ready, "low-risk-ui");
  assert.deepEqual(result, { status: "COMPLETED", semanticCommitId: "proposal-commit:low", objectId: "task-low" });
  assert.equal(content, "[任务] 核对告警");
  assert.deepEqual(calls.map((call) => call.split(":")[0]), ["review", "revalidate", "identity", "prepare", "graph", "finalize"]);
});

test("stale scope stops before prepare and keeps the result explicit", async () => {
  const ready = readyRecord();
  const accepted: ServiceStoredProposal = { ...ready, updatedAt: "accepted", proposal: { ...ready.proposal, status: "ACCEPTED", groups: [{ ...ready.proposal.groups[0]!, disposition: "ACCEPTED" }] } };
  let prepared = false;
  const result = await applyLowRiskV2Proposal({
    reviewProposal: async () => accepted,
    revalidateProposal: async () => ({ record: { ...accepted, proposal: { ...accepted.proposal, status: "STALE" } }, result: { status: "STALE", acceptedGroupIds: ["formalize"], issues: [{ kind: "BLOCK", id: "block-low-risk", reason: "HASH_CHANGED" }] } }),
    prepareProposalCommit: async () => { prepared = true; throw new Error("must not prepare"); },
    finalizeProposalCommit: async () => { throw new Error("must not finalize"); },
    compensateProposalCommit: async () => { throw new Error("must not compensate"); },
  }, {
    getBlock: async () => ({ uuid: "block-low-risk", content: "用户后续编辑", updatedAt: 2 }),
    getPage: async () => null,
    updateBlock: async () => { throw new Error("must not write"); },
    ensurePersistentIdentity: async () => undefined,
  }, ready, "stale");
  assert.deepEqual(result, { status: "STALE", issues: [{ kind: "BLOCK", id: "block-low-risk", reason: "HASH_CHANGED" }] });
  assert.equal(prepared, false);
});

test("ambiguous accept transport is never retried and tells the user to recheck", async () => {
  const ready = readyRecord();
  let reviewCalls = 0;
  await assert.rejects(() => applyLowRiskV2Proposal({
    reviewProposal: async () => { reviewCalls += 1; throw new Error("connection closed"); },
    revalidateProposal: async () => { throw new Error("must not revalidate"); },
    prepareProposalCommit: async () => { throw new Error("must not prepare"); },
    finalizeProposalCommit: async () => { throw new Error("must not finalize"); },
    compensateProposalCommit: async () => { throw new Error("must not compensate"); },
  }, {
    getBlock: async () => null, getPage: async () => null,
    updateBlock: async () => { throw new Error("must not write"); },
    ensurePersistentIdentity: async () => { throw new Error("must not write"); },
  }, ready, "ambiguous"), /结果未知.*不会自动重试.*刷新审阅队列/);
  assert.equal(reviewCalls, 1);
});
