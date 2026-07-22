import assert from "node:assert/strict";
import test from "node:test";

import { validateV2ProposalForSubmission } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { buildMiniProjectLegacyTransferProposal } from "../src/v2-mini-project-legacy-transfer.ts";

test("MiniProject legacy transfer creates a separate review-only formalization Proposal", () => {
  const proposal = buildMiniProjectLegacyTransferProposal({
    closureProposalId: "proposal_closure_1",
    blockUuid: "empty-block-1",
    beforeText: "",
    remainingWork: "监控首日指标",
    objectType: "TASK",
    createdAt: "2026-07-22T12:00:00.000Z",
  });
  assert.doesNotThrow(() => validateV2ProposalForSubmission(proposal));
  assert.equal(proposal.status, "READY");
  assert.equal(proposal.source.kind, "user");
  assert.equal(proposal.groups.length, 1);
  assert.equal(proposal.groups[0]?.disposition, "PENDING");
  assert.equal(proposal.groups[0]?.textPatches[0]?.afterText, "[任务] 监控首日指标");
  assert.equal(proposal.groups[0]?.textPatches[0]?.beforeHash, checksum(""));
  assert.deepEqual(proposal.groups[0]?.semanticOperations[0]?.payload, { objectType: "TASK", text: "监控首日指标" });
  assert.doesNotMatch(JSON.stringify(proposal), /TRANSITION_LIFECYCLE|COMPLETED/);
});

test("legacy transfer supports the four Block object types and refuses to overwrite content", () => {
  const syntax = { TASK: "[任务]", MINI_PROJECT: "[MiniProject]", DECISION: "[决策]", OUTPUT: "[成果]" } as const;
  for (const objectType of Object.keys(syntax) as Array<keyof typeof syntax>) {
    const proposal = buildMiniProjectLegacyTransferProposal({ closureProposalId: "proposal_closure_1", blockUuid: `block-${objectType}`, beforeText: "  ", remainingWork: "转移项", objectType, createdAt: "2026-07-22T12:00:00.000Z" });
    assert.equal(proposal.finalPreview, `${syntax[objectType]} 转移项`);
  }
  assert.throws(() => buildMiniProjectLegacyTransferProposal({ closureProposalId: "proposal_closure_1", blockUuid: "occupied", beforeText: "用户正文", remainingWork: "转移项", objectType: "TASK", createdAt: "2026-07-22T12:00:00.000Z" }), /空 Block/);
  assert.throws(() => buildMiniProjectLegacyTransferProposal({ closureProposalId: "proposal_closure_1", blockUuid: "empty", beforeText: "", remainingWork: "", objectType: "TASK", createdAt: "2026-07-22T12:00:00.000Z" }), /遗留/);
});
