import assert from "node:assert/strict";
import test from "node:test";

import { reviewV2ProposalGroups, type V2Proposal } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { collectV2ProposalGraphObservations, proposalPageEvidenceHash } from "../src/v2-proposal-revalidation.ts";

function acceptedProposal(): V2Proposal {
  const before = "核对告警";
  const page = { uuid: "page-1", name: "pilot", originalName: "Pilot", updatedAt: 10 };
  const value: V2Proposal = {
    proposalId: "prop_graph_revalidation", schemaVersion: "v2", title: "正式化", context: "Pilot 页上的普通正文。", understanding: "建议 Task。", objective: "建立对象。", logic: "正文与语义同组。", finalPreview: "[任务] 核对告警", unresolvedQuestions: [], source: { kind: "user" },
    scope: { read: [{ kind: "PAGE", id: "Pilot", version: 10, hash: proposalPageEvidenceHash(page) }], modify: [{ kind: "BLOCK", id: "block-1", version: 20, hash: checksum(before) }] }, preconditions: [],
    groups: [{ groupId: "formalize", explanation: "不可拆。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-1", beforeText: before, afterText: "[任务] 核对告警", beforeHash: checksum(before), afterHash: checksum("[任务] 核对告警") }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-1", version: 20, hash: checksum(before) }, summary: "创建 Task", payload: { objectType: "TASK" }, preconditions: [] }], disposition: "PENDING" }],
    status: "READY", createdAt: "2026-07-20T12:00:00.000Z",
  };
  return reviewV2ProposalGroups(value, { formalize: { disposition: "ACCEPTED" } });
}

test("Graph revalidation rereads only accepted Block and read-scope Page evidence", async () => {
  const reads: string[] = [];
  const observations = await collectV2ProposalGraphObservations(acceptedProposal(), {
    getBlock: async (id) => { reads.push(`block:${id}`); return { uuid: id, content: "核对告警", updatedAt: 20 }; },
    getPage: async (id) => { reads.push(`page:${id}`); return { uuid: "page-1", name: "pilot", originalName: "Pilot", updatedAt: 10 }; },
  });
  assert.deepEqual(reads, ["page:Pilot", "block:block-1"]);
  assert.deepEqual(observations, [
    { kind: "PAGE", id: "Pilot", exists: true, version: 10, hash: proposalPageEvidenceHash({ uuid: "page-1", name: "pilot", originalName: "Pilot", updatedAt: 10 }) },
    { kind: "BLOCK", id: "block-1", exists: true, version: 20, hash: checksum("核对告警") },
  ]);
});

test("Graph revalidation reports missing targets and rejects an ambiguous Block identity", async () => {
  const missing = await collectV2ProposalGraphObservations(acceptedProposal(), { getBlock: async () => null, getPage: async () => null });
  assert.deepEqual(missing, [
    { kind: "PAGE", id: "Pilot", exists: false },
    { kind: "BLOCK", id: "block-1", exists: false },
  ]);
  await assert.rejects(() => collectV2ProposalGraphObservations(acceptedProposal(), {
    getBlock: async () => ({ uuid: "another-block", content: "核对告警", updatedAt: 20 }),
    getPage: async () => ({ uuid: "page-1", name: "pilot", originalName: "Pilot", updatedAt: 10 }),
  }), /identity/);
});
