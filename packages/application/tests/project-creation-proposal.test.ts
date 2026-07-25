import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectCreationProposal,
  planAcceptedV2ProjectCreation,
  type ProjectCreationPreview,
} from "../src/index.ts";
import { checksum } from "@task-copilot/shared";

function preview(mode: ProjectCreationPreview["pageObjectRelationship"]["mode"]): ProjectCreationPreview {
  const claim = (text: string, evidenceRefs = ["answer:outcome"]) => ({ text, evidenceRefs });
  return {
    schemaVersion: "task-copilot-project-creation-preview-v1",
    finalReading: {
      title: claim("设备治理"),
      outcome: claim("持续形成可核验的设备治理结果。"),
      boundary: { included: [claim("测试设备。")], excluded: [claim("生产设备。")] },
      completionEvidence: [claim("每月核验记录可追溯。")],
      internalClosure: claim("每月处理核验差异。"),
      currentInterface: claim("先查看本月尚未核验的设备。"),
    },
    pageObjectRelationship: {
      mode,
      rationale: mode === "REUSE_SOURCE_PAGE" ? "当前 Page 已是独立工作现场。" : "创建独立受控 Project Page。",
      evidenceRefs: ["answer:page-object-relationship"],
      authority: "PROPOSED_FOR_REVIEW",
    },
    sourceMaterials: mode === "CREATE_DEDICATED_PROJECT_PAGE" ? [] : [{
      materialId: "source-1",
      sourceRef: "block:page-root",
      contentHash: checksum("设备治理材料"),
      text: "设备治理材料",
      disposition: "KEEP_IN_PLACE",
      rationale: "保留现有正文。",
      evidenceRefs: ["block:page-root"],
      preservation: "UNCHANGED",
    }],
    formalImpact: { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 },
    evidenceScope: { refs: ["answer:outcome", "answer:page-object-relationship", "block:page-root"], scopeHash: checksum("scope"), observedAt: "2026-07-25T14:00:00.000Z" },
    authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: {
      contractVersion: "1.0.0",
      promptVersion: "1.0.0",
      skillName: "project-creation-modeling",
      skillVersion: "1.1.0",
      providerId: "deepseek",
      providerVersion: "chat-completions-v1",
      model: "deepseek-v4-flash",
      generatedAt: "2026-07-25T14:00:00.000Z",
    },
  };
}

test("Project creation Preview becomes one server-owned HIGH Proposal without creating formal state", () => {
  const result = buildProjectCreationProposal({
    proposalId: "proposal_project_creation_reuse",
    preview: preview("REUSE_SOURCE_PAGE"),
    source: { sourceKind: "PAGE", page: { id: "page-device-governance", name: "设备治理材料", version: 7, hash: checksum("page evidence") } },
    sourceFingerprint: "a".repeat(64),
  });

  assert.equal(result.status, "READY");
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.risk, "HIGH");
  assert.equal(result.groups[0]?.independentlyAcceptable, true);
  assert.equal(result.groups[0]?.semanticOperations.length, 1);
  assert.equal(result.groups[0]?.semanticOperations[0]?.kind, "CREATE_OBJECT");
  assert.equal(result.groups[0]?.semanticOperations[0]?.target.kind, "PAGE");
  assert.equal(result.groups[0]?.semanticOperations[0]?.target.id, "page-device-governance");
  assert.deepEqual(result.groups[0]?.semanticOperations[0]?.payload, {
    objectType: "PROJECT",
    text: "设备治理",
    pageName: "设备治理材料",
    targetExpectation: "PRESENT",
    relationshipMode: "REUSE_SOURCE_PAGE",
    sourceKind: "PAGE",
    sourceFingerprint: "a".repeat(64),
    previewScopeHash: preview("REUSE_SOURCE_PAGE").evidenceScope.scopeHash,
    projectStructure: {
      objectives: [{
        objectiveId: "primary-outcome",
        text: "持续形成可核验的设备治理结果。",
        priority: "PRIMARY",
        successEvidence: ["每月核验记录可追溯。"],
      }],
      deliverables: [],
      workStages: [],
      currentSummary: "每月处理核验差异。",
      currentFocuses: ["先查看本月尚未核验的设备。"],
      stageMappings: [],
    },
  });
  assert.deepEqual(result.scope.modify, [{ kind: "PAGE", id: "page-device-governance", expectedExistence: "PRESENT", version: 7, hash: checksum("page evidence") }]);
  assert.deepEqual(result.scope.read, [
    { kind: "PAGE", id: "page-device-governance", expectedExistence: "PRESENT", version: 7, hash: checksum("page evidence") },
    { kind: "BLOCK", id: "page-root", hash: checksum("设备治理材料") },
  ]);
});

test("Blank creation targets a new controlled Project page while Page review-required remains non-actionable", () => {
  const blank = buildProjectCreationProposal({
    proposalId: "proposal_project_creation_blank",
    preview: preview("CREATE_DEDICATED_PROJECT_PAGE"),
    source: { sourceKind: "BLANK" },
    sourceFingerprint: "b".repeat(64),
  });
  assert.deepEqual(blank.scope.modify, [{ kind: "PAGE", id: "Project/设备治理", expectedExistence: "ABSENT" }]);
  assert.equal(blank.groups[0]?.semanticOperations[0]?.payload.pageName, "Project/设备治理");

  assert.throws(() => buildProjectCreationProposal({
    proposalId: "proposal_project_creation_unresolved",
    preview: preview("REVIEW_REQUIRED"),
    source: { sourceKind: "PAGE", page: { id: "page-device-governance", name: "设备治理材料", hash: checksum("page evidence") } },
    sourceFingerprint: "c".repeat(64),
  }), /关系仍需确认/);
});

test("Project creation Proposal rejects relationship/source mismatches and changed preview authority", () => {
  assert.throws(() => buildProjectCreationProposal({
    proposalId: "proposal_project_creation_bad_blank",
    preview: preview("REUSE_SOURCE_PAGE"),
    source: { sourceKind: "BLANK" },
    sourceFingerprint: "d".repeat(64),
  }), /来源不匹配/);
  assert.throws(() => buildProjectCreationProposal({
    proposalId: "proposal_project_creation_bad_page",
    preview: preview("CREATE_DEDICATED_PROJECT_PAGE"),
    source: { sourceKind: "PAGE", page: { id: "page-device-governance", name: "设备治理材料", hash: checksum("page evidence") } },
    sourceFingerprint: "e".repeat(64),
  }), /来源不匹配/);
  assert.throws(() => buildProjectCreationProposal({
    proposalId: "proposal_project_creation_bad_authority",
    preview: { ...preview("REUSE_SOURCE_PAGE"), authorityBoundary: "SESSION_PREVIEW_ONLY", formalImpact: { createsObject: true } } as unknown as ProjectCreationPreview,
    source: { sourceKind: "PAGE", page: { id: "page-device-governance", name: "设备治理材料", hash: checksum("page evidence") } },
    sourceFingerprint: "f".repeat(64),
  }), /零正式影响/);
  assert.throws(() => buildProjectCreationProposal({
    proposalId: "proposal_project_creation_bad_material_ref",
    preview: {
      ...preview("REUSE_SOURCE_PAGE"),
      sourceMaterials: [{ ...preview("REUSE_SOURCE_PAGE").sourceMaterials[0]!, sourceRef: "page-root" }],
    },
    source: { sourceKind: "PAGE", page: { id: "page-device-governance", name: "设备治理材料", hash: checksum("page evidence") } },
    sourceFingerprint: "a".repeat(64),
  }), /identity\/hash/);
});

test("accepted Project creation Proposal becomes one exact formal creation plan", () => {
  const ready = buildProjectCreationProposal({
    proposalId: "proposal_project_creation_plan",
    preview: preview("REUSE_SOURCE_PAGE"),
    source: { sourceKind: "PAGE", page: { id: "page-device-governance", name: "设备治理材料", version: 7, hash: checksum("page evidence") } },
    sourceFingerprint: "a".repeat(64),
  });
  ready.status = "ACCEPTED";
  ready.groups[0]!.disposition = "ACCEPTED";
  const plan = planAcceptedV2ProjectCreation(ready);
  assert.equal(plan.title, "设备治理");
  assert.equal(plan.pageName, "设备治理材料");
  assert.equal(plan.relationshipMode, "REUSE_SOURCE_PAGE");
  assert.equal(plan.pageTarget.id, "page-device-governance");
  assert.equal(plan.sourcePageTarget?.version, 7);
  assert.deepEqual(plan.sourceBlockTargets, [{ kind: "BLOCK", id: "page-root", hash: checksum("设备治理材料") }]);
  assert.equal(plan.projectStructure.currentFocuses[0], "先查看本月尚未核验的设备。");
});

test("Project creation planner refuses unresolved review, changed relationship, and incomplete source authority", () => {
  const ready = buildProjectCreationProposal({
    proposalId: "proposal_project_creation_plan_invalid",
    preview: preview("CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE"),
    source: { sourceKind: "MINI_PROJECT", objectId: "mini-source", objectVersion: 3 },
    sourceFingerprint: "b".repeat(64),
  });
  assert.throws(() => planAcceptedV2ProjectCreation(ready), /唯一已接受/);
  ready.status = "ACCEPTED";
  ready.groups[0]!.disposition = "ACCEPTED";
  ready.groups[0]!.semanticOperations[0]!.payload.relationshipMode = "REUSE_SOURCE_PAGE";
  assert.throws(() => planAcceptedV2ProjectCreation(ready), /关系/);
  const missingObject = structuredClone(ready);
  missingObject.groups[0]!.semanticOperations[0]!.payload.relationshipMode = "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE";
  missingObject.scope.read = missingObject.scope.read.filter((target) => target.kind !== "OBJECT");
  assert.throws(() => planAcceptedV2ProjectCreation(missingObject), /来源证据/);
});
