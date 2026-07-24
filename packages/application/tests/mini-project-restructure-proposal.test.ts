import assert from "node:assert/strict";
import test from "node:test";

import { checksum } from "@task-copilot/shared";

import { buildMiniProjectRestructureProposal, type GrillPreview, type MiniProjectRestructureProposalInput } from "../src/index.ts";

const rootText = "[MiniProject] 整理设备";
const sourceText = "核对设备清单";
const looseText = "长期维护规则待定";
const rootHash = checksum(rootText);
const sourceHash = checksum(sourceText);
const looseHash = checksum(looseText);

function preview(): GrillPreview {
  return {
    schemaVersion: "task-copilot-grill-preview-v1",
    finalReading: {
      title: { text: "整理设备", evidenceRefs: ["block:root-block"] },
      outcome: { text: "形成可复核清单", evidenceRefs: ["answer:outcome"] },
      boundary: { included: [{ text: "当前设备", evidenceRefs: ["block:source-block"] }], excluded: [{ text: "长期维护", evidenceRefs: ["answer:boundary"] }] },
      completionEvidence: [{ text: "清单可逐项复核", evidenceRefs: ["block:source-block"] }],
      sections: [
        { sectionId: "root", heading: "入口", purpose: "保留根", sourceMaterials: [{ materialId: "root", sourceRef: "block:root-block", contentHash: rootHash, text: rootText, preservation: "UNCHANGED" }], derivedBlocks: [] },
        { sectionId: "work", heading: "当前清单", purpose: "组织执行材料", sourceMaterials: [{ materialId: "material-2", sourceRef: "block:source-block", contentHash: sourceHash, text: sourceText, preservation: "UNCHANGED" }], derivedBlocks: [{ text: "逐项记录参数来源", evidenceRefs: ["block:source-block", "answer:outcome"] }] },
      ],
    },
    unclassified: [{ materialId: "material-3", sourceRef: "block:loose-block", contentHash: looseHash, text: looseText, reason: "超出本次边界", evidenceRefs: ["answer:boundary"], preservation: "UNCHANGED_IN_PLACE" }],
    impact: { sourceMaterialCount: 3, movedMaterialCount: 1, addedDerivedBlockCount: 1, deletedMaterialCount: 0, unclassifiedMaterialCount: 1 },
    evidenceScope: { refs: ["block:root-block", "block:source-block", "block:loose-block", "answer:outcome", "answer:boundary"], scopeHash: "a".repeat(8), observedAt: "2026-07-24T18:00:00.000Z" },
    authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: { contractVersion: "1.0.0", promptVersion: "prompt-v1", skillName: "mini-project-modeling", skillVersion: "1.1.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "deepseek-v4-flash", generatedAt: "2026-07-24T18:00:00.000Z" },
  };
}

function input(): MiniProjectRestructureProposalInput {
  return {
    proposalId: "proposal_restructure_mini_1", createdAt: "2026-07-24T18:00:01.000Z", objectId: "mini-1", objectVersion: 3, preview: preview(),
    sourcePositions: [
      { materialId: "root", blockUuid: "root-block", parentBlockUuid: null, previousSiblingUuid: null, exactText: rootText, contentHash: rootHash, isRoot: true },
      { materialId: "material-2", blockUuid: "source-block", parentBlockUuid: "root-block", previousSiblingUuid: null, exactText: sourceText, contentHash: sourceHash, isRoot: false },
      { materialId: "material-3", blockUuid: "loose-block", parentBlockUuid: "root-block", previousSiblingUuid: "source-block", exactText: looseText, contentHash: looseHash, isRoot: false },
    ],
    createdBlockUuids: { "section:work": "11111111-1111-4111-8111-111111111111", "derived:work:0": "22222222-2222-4222-8222-222222222222" },
  };
}

test("zero-loss preview becomes one HIGH review Proposal without rewriting or deleting source material", () => {
  const proposal = buildMiniProjectRestructureProposal(input());
  assert.equal(proposal.groups.length, 1);
  assert.equal(proposal.groups[0]?.risk, "HIGH");
  assert.deepEqual(proposal.groups[0]?.textPatches, []);
  assert.deepEqual(proposal.groups[0]?.semanticOperations.map(({ kind }) => kind), ["CREATE_BLOCK", "MOVE_BLOCK", "CREATE_BLOCK"]);
  assert.equal(proposal.groups[0]?.semanticOperations.some(({ kind }) => kind === "DELETE_CONTENT" || kind === "REWRITE_BLOCK"), false);
  assert.equal(proposal.scope.read.some(({ kind, id, version }) => kind === "OBJECT" && id === "mini-1" && version === 3), true);
  assert.equal(proposal.finalPreview.includes(looseText), true);
});

test("move operation preserves exact source hash and captures reversible before/after position", () => {
  const proposal = buildMiniProjectRestructureProposal(input());
  const move = proposal.groups[0]?.semanticOperations.find(({ kind }) => kind === "MOVE_BLOCK");
  assert.deepEqual(move?.payload, { fromParentBlockUuid: "root-block", fromPreviousSiblingUuid: null, toParentBlockUuid: "11111111-1111-4111-8111-111111111111", toPreviousSiblingUuid: null, contentHash: sourceHash });
  assert.equal(move?.target.hash, sourceHash);
});

test("changed evidence, missing material, duplicate created UUID, or impact mismatch fails before Proposal submission", () => {
  const changed = input(); changed.sourcePositions[1] = { ...changed.sourcePositions[1]!, exactText: "已被改写" };
  assert.throws(() => buildMiniProjectRestructureProposal(changed), /evidence changed/);
  const missing = input(); missing.sourcePositions.pop();
  assert.throws(() => buildMiniProjectRestructureProposal(missing), /incomplete/);
  const duplicate = input(); duplicate.createdBlockUuids["derived:work:0"] = duplicate.createdBlockUuids["section:work"]!;
  assert.throws(() => buildMiniProjectRestructureProposal(duplicate), /identity is invalid/);
  const impact = input(); impact.preview = { ...impact.preview, impact: { ...impact.preview.impact, movedMaterialCount: 0 } };
  assert.throws(() => buildMiniProjectRestructureProposal(impact), /move impact/);
});
