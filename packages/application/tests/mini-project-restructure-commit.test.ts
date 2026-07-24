import assert from "node:assert/strict";
import test from "node:test";

import { reviewV2ProposalGroups } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { buildMiniProjectRestructureProposal, planAcceptedMiniProjectRestructure, type GrillPreview, type MiniProjectRestructureProposalInput } from "../src/index.ts";

const rootText = "[MiniProject] 整理设备";
const sourceText = "核对设备清单";

function acceptedProposal() {
  const rootHash = checksum(rootText);
  const sourceHash = checksum(sourceText);
  const preview: GrillPreview = {
    schemaVersion: "task-copilot-grill-preview-v1",
    finalReading: {
      title: { text: "整理设备", evidenceRefs: ["block:root-block"] }, outcome: { text: "形成可复核清单", evidenceRefs: ["answer:outcome"] },
      boundary: { included: [], excluded: [] }, completionEvidence: [{ text: "可复核", evidenceRefs: ["block:source-block"] }],
      sections: [
        { sectionId: "root", heading: "入口", purpose: "保留根", sourceMaterials: [{ materialId: "root", sourceRef: "block:root-block", contentHash: rootHash, text: rootText, preservation: "UNCHANGED" }], derivedBlocks: [] },
        { sectionId: "work", heading: "当前清单", purpose: "组织", sourceMaterials: [{ materialId: "material-2", sourceRef: "block:source-block", contentHash: sourceHash, text: sourceText, preservation: "UNCHANGED" }], derivedBlocks: [{ text: "记录参数来源", evidenceRefs: ["block:source-block"] }] },
      ],
    },
    unclassified: [], impact: { sourceMaterialCount: 2, movedMaterialCount: 1, addedDerivedBlockCount: 1, deletedMaterialCount: 0, unclassifiedMaterialCount: 0 },
    evidenceScope: { refs: ["block:root-block", "block:source-block"], scopeHash: "11111111", observedAt: "2026-07-24T18:00:00.000Z" }, authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: { contractVersion: "1.0.0", promptVersion: "prompt-v1", skillName: "mini-project-modeling", skillVersion: "1.1.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "deepseek-v4-flash", generatedAt: "2026-07-24T18:00:00.000Z" },
  };
  const input: MiniProjectRestructureProposalInput = {
    proposalId: "proposal_restructure_commit_1", createdAt: "2026-07-24T18:00:01.000Z", objectId: "mini-1", objectVersion: 3, preview, sourceScopeHash: "1234abcd",
    sourcePositions: [
      { materialId: "root", blockUuid: "root-block", parentBlockUuid: null, previousSiblingUuid: null, exactText: rootText, contentHash: rootHash, isRoot: true },
      { materialId: "material-2", blockUuid: "source-block", parentBlockUuid: "root-block", previousSiblingUuid: null, exactText: sourceText, contentHash: sourceHash, isRoot: false },
    ],
    createdBlockUuids: { "section:work": "11111111-1111-4111-8111-111111111111", "derived:work:0": "22222222-2222-4222-8222-222222222222" },
  };
  const ready = buildMiniProjectRestructureProposal(input);
  return reviewV2ProposalGroups(ready, { "restructure-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } });
}

test("accepted MiniProject structure Proposal becomes an ordered Graph plan with reverse compensation", () => {
  const plan = planAcceptedMiniProjectRestructure(acceptedProposal());
  assert.equal(plan.objectId, "mini-1");
  assert.equal(plan.expectedVersion, 3);
  assert.equal(plan.sourceRootBlockUuid, "root-block");
  assert.equal(plan.sourceScopeHash, "1234abcd");
  assert.match(plan.sourceStructureHash, /^[0-9a-f]{8}$/);
  assert.match(plan.expectedStructureHash, /^[0-9a-f]{8}$/);
  assert.notEqual(plan.sourceStructureHash, plan.expectedStructureHash);
  assert.deepEqual(plan.steps.map(({ kind }) => kind), ["CREATE_BLOCK", "MOVE_BLOCK", "CREATE_BLOCK"]);
  assert.deepEqual(plan.compensationSteps.map(({ kind }) => kind), ["REMOVE_CREATED_BLOCK", "MOVE_BLOCK", "REMOVE_CREATED_BLOCK"]);
  assert.equal(plan.steps.every(({ beforeHash, afterHash }) => beforeHash !== afterHash), true);
  assert.equal(plan.compensationSteps[1]?.kind === "MOVE_BLOCK" && plan.compensationSteps[1].toParentBlockUuid === "root-block", true);
});

test("structure planner rejects unresolved groups, forward references, mixed operations, and inconsistent scope evidence", () => {
  const unresolved = acceptedProposal();
  unresolved.groups.push({ ...structuredClone(unresolved.groups[0]!), groupId: "later", disposition: "DEFERRED", deferredUntil: "2026-07-25T00:00:00.000Z", deferReason: "later", semanticOperations: [{ ...structuredClone(unresolved.groups[0]!.semanticOperations[0]!), operationId: "later-create", payload: { ...unresolved.groups[0]!.semanticOperations[0]!.payload, newBlockUuid: "33333333-3333-4333-8333-333333333333" } }] });
  assert.throws(() => planAcceptedMiniProjectRestructure(unresolved), /独立 HIGH/);

  const forward = acceptedProposal();
  const operations = forward.groups[0]!.semanticOperations;
  forward.groups[0]!.semanticOperations = [operations[1]!, operations[0]!, operations[2]!];
  assert.throws(() => planAcceptedMiniProjectRestructure(forward), /尚未建立/);

  const mixed = acceptedProposal();
  mixed.groups[0]!.semanticOperations[2] = { ...mixed.groups[0]!.semanticOperations[2]!, kind: "UPDATE_PROJECT_INTERFACE" };
  assert.throws(() => planAcceptedMiniProjectRestructure(mixed), /只允许/);

  const inconsistent = acceptedProposal();
  inconsistent.groups[0]!.semanticOperations[1]!.payload.sourceScopeHash = "deadbeef";
  assert.throws(() => planAcceptedMiniProjectRestructure(inconsistent), /共享同一个/);
});
