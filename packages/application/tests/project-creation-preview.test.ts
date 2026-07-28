import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_CREATION_PREVIEW_SCHEMA_VERSION,
  materializeProjectCreationPreview,
  type ProjectCreationPreviewAuthority,
} from "../src/project-creation-preview.ts";

const resolvedDimensions: ProjectCreationPreviewAuthority["resolvedDimensions"] = [
  { dimension: "OUTCOME", text: "持续形成可核验的托管设备记录。", evidenceRefs: ["answer:outcome"] },
  { dimension: "BOUNDARY", text: "只覆盖公司托管设备，不含私人设备。", evidenceRefs: ["answer:boundary"] },
  { dimension: "COMPLETION_EVIDENCE", text: "每月核验记录可追溯。", evidenceRefs: ["answer:completion"] },
  { dimension: "UNCLASSIFIED_MATERIAL", text: "现有材料保留为来源。", evidenceRefs: ["answer:material"] },
  { dimension: "INTERNAL_CLOSURE", text: "每月核验并处理差异。", evidenceRefs: ["answer:closure"] },
  { dimension: "CURRENT_INTERFACE", text: "先看本月待核验设备。", evidenceRefs: ["answer:interface"] },
  { dimension: "PAGE_OBJECT_RELATIONSHIP", text: "创建受控 Project Page，来源保持原位并连接。", evidenceRefs: ["answer:relationship"] },
];

function authority(sourceKind: "BLANK" | "PAGE" | "MINI_PROJECT" = "PAGE"): ProjectCreationPreviewAuthority {
  const materials = sourceKind === "BLANK"
    ? []
    : [{
        materialId: "source-1",
        sourceRef: sourceKind === "PAGE" ? "block:page-root" : "block:mini-root",
        contentHash: "a".repeat(64),
        exactText: sourceKind === "PAGE" ? "托管设备治理材料" : "[MiniProject] 整理托管设备记录",
      }];
  return {
    observedAt: "2026-07-25T14:00:00.000Z",
    contractVersion: "project-creation-preview-contract@1.0.0",
    promptVersion: "project-creation-preview-prompt@1.0.0",
    skill: { name: "project-creation-modeling", version: "1.0.0" },
    provider: { providerId: "deepseek", providerVersion: "2026-07", model: "deepseek-v4-flash" },
    sourceKind,
    sourceFingerprint: "b".repeat(64),
    readiness: "READY_FOR_PREVIEW",
    materials,
    resolvedDimensions: sourceKind === "BLANK"
      ? resolvedDimensions.map((item) => item.dimension === "UNCLASSIFIED_MATERIAL"
        ? { ...item, text: "空白创建没有来源材料。", evidenceRefs: ["session:project-creation-entry"] }
        : item)
      : resolvedDimensions,
  };
}

function draft(sourceKind: "BLANK" | "PAGE" | "MINI_PROJECT" = "PAGE") {
  return {
    schemaVersion: PROJECT_CREATION_PREVIEW_SCHEMA_VERSION,
    title: { text: "托管设备治理", evidenceRefs: ["answer:outcome"] },
    outcome: { text: "持续形成可核验的托管设备记录。", evidenceRefs: ["answer:outcome"] },
    boundary: {
      included: [{ text: "公司托管设备。", evidenceRefs: ["answer:boundary"] }],
      excluded: [{ text: "私人设备。", evidenceRefs: ["answer:boundary"] }],
    },
    completionEvidence: [{ text: "每月核验记录可追溯。", evidenceRefs: ["answer:completion"] }],
    internalClosure: { text: "每月核验并处理差异。", evidenceRefs: ["answer:closure"] },
    currentInterface: { text: "先看本月待核验设备。", evidenceRefs: ["answer:interface"] },
    pageObjectRelationship: {
      mode: sourceKind === "BLANK" ? "CREATE_DEDICATED_PROJECT_PAGE" : "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE",
      rationale: sourceKind === "BLANK" ? "创建受控 Project 页面。" : "保留来源，并在正式 Review 中确认关系。",
      evidenceRefs: [sourceKind === "BLANK" ? "session:project-creation-entry" : "answer:material"],
    },
    sourceMaterials: sourceKind === "BLANK"
      ? []
      : [{
          materialId: "source-1",
          disposition: "LINK_AS_SOURCE",
          rationale: "保留原文并作为 Project 来源。",
          evidenceRefs: ["answer:material"],
        }],
  } as const;
}

test("Blank Project creation preview is a complete zero-write reading without invented source material", () => {
  const preview = materializeProjectCreationPreview(draft("BLANK"), authority("BLANK"));
  assert.equal(preview.sourceMaterials.length, 0);
  assert.equal(preview.pageObjectRelationship.mode, "CREATE_DEDICATED_PROJECT_PAGE");
  assert.deepEqual(preview.formalImpact, { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 });
  assert.equal(preview.authorityBoundary, "SESSION_PREVIEW_ONLY");
});

test("Page and MiniProject previews preserve every bounded source exactly once and expose relationship as a proposal", () => {
  for (const sourceKind of ["PAGE", "MINI_PROJECT"] as const) {
    const preview = materializeProjectCreationPreview(draft(sourceKind), authority(sourceKind));
    assert.equal(preview.sourceMaterials.length, 1);
    assert.equal(preview.sourceMaterials[0]?.text, authority(sourceKind).materials[0]?.exactText);
    assert.equal(preview.sourceMaterials[0]?.preservation, "UNCHANGED");
    assert.equal(preview.pageObjectRelationship.authority, "PROPOSED_FOR_REVIEW");
    assert.equal(preview.formalImpact.createsObject, false);
  }
});

test("relationship modes stay inside their source-specific page authority", () => {
  const page = draft("PAGE");
  assert.equal(materializeProjectCreationPreview({
    ...page,
    pageObjectRelationship: { ...page.pageObjectRelationship, mode: "REUSE_SOURCE_PAGE" },
  }, authority("PAGE")).pageObjectRelationship.mode, "REUSE_SOURCE_PAGE");
  assert.throws(
    () => materializeProjectCreationPreview({
      ...draft("MINI_PROJECT"),
      pageObjectRelationship: { ...draft("MINI_PROJECT").pageObjectRelationship, mode: "REUSE_SOURCE_PAGE" },
    }, authority("MINI_PROJECT")),
    /MiniProject source/i,
  );
  assert.throws(
    () => materializeProjectCreationPreview({
      ...draft("MINI_PROJECT"),
      pageObjectRelationship: { ...draft("MINI_PROJECT").pageObjectRelationship, mode: "REVIEW_REQUIRED" },
    }, authority("MINI_PROJECT")),
    /MiniProject source/i,
  );
  assert.throws(
    () => materializeProjectCreationPreview({
      ...draft("MINI_PROJECT"),
      sourceMaterials: [{
        ...draft("MINI_PROJECT").sourceMaterials[0],
        disposition: "REVIEW_FOR_MOVE",
      }],
    }, authority("MINI_PROJECT")),
    /cannot propose moving/i,
  );
  assert.throws(
    () => materializeProjectCreationPreview({
      ...page,
      pageObjectRelationship: { ...page.pageObjectRelationship, mode: "CREATE_DEDICATED_PROJECT_PAGE" },
    }, authority("PAGE")),
    /Page source/i,
  );
});

test("preview fails closed on missing, duplicated, or invented source material and unsupported evidence", () => {
  const base = draft("PAGE");
  assert.throws(
    () => materializeProjectCreationPreview({ ...base, sourceMaterials: [] }, authority("PAGE")),
    /preserve every source material exactly once/,
  );
  assert.throws(
    () => materializeProjectCreationPreview({ ...base, sourceMaterials: [base.sourceMaterials[0], base.sourceMaterials[0]] }, authority("PAGE")),
    /preserve every source material exactly once/,
  );
  assert.throws(
    () => materializeProjectCreationPreview({ ...base, sourceMaterials: [{ ...base.sourceMaterials[0], materialId: "invented" }] }, authority("PAGE")),
    /unknown source material/,
  );
  assert.throws(
    () => materializeProjectCreationPreview({ ...base, outcome: { ...base.outcome, evidenceRefs: ["block:outside-scope"] } }, authority("PAGE")),
    /unsupported evidence/,
  );
});

test("machine readiness and all seven resolved dimensions are mandatory", () => {
  assert.throws(
    () => materializeProjectCreationPreview(draft("PAGE"), { ...authority("PAGE"), readiness: "CONTINUE" }),
    /not ready/,
  );
  assert.throws(
    () => materializeProjectCreationPreview(draft("PAGE"), { ...authority("PAGE"), resolvedDimensions: resolvedDimensions.slice(0, 6) }),
    /seven resolved dimensions/,
  );
  assert.throws(
    () => materializeProjectCreationPreview(draft("PAGE"), {
      ...authority("PAGE"),
      resolvedDimensions: [...resolvedDimensions.slice(0, 6), { ...resolvedDimensions[0]! }],
    }),
    /seven resolved dimensions/,
  );
});

test("model cannot claim formal authority or smuggle write impact into the reading preview", () => {
  const base = draft("PAGE");
  assert.throws(
    () => materializeProjectCreationPreview({ ...base, formalImpact: { createsObject: true } }, authority("PAGE")),
    /unsupported field formalImpact/,
  );
  assert.throws(
    () => materializeProjectCreationPreview({
      ...base,
      pageObjectRelationship: { ...base.pageObjectRelationship, authority: "COMMIT_APPROVED" },
    }, authority("PAGE")),
    /unsupported field authority/,
  );
});

test("user-visible Project creation reading rejects non-Chinese model prose", () => {
  const base = draft("BLANK");
  assert.throws(
    () => materializeProjectCreationPreview({
      ...base,
      title: { ...base.title, text: "Task Copilot acceptance package" },
    }, authority("BLANK")),
    /must use natural Chinese/,
  );
});

test("user-visible Project creation reading rejects internal machine identities", () => {
  const base = draft("MINI_PROJECT");
  assert.throws(
    () => materializeProjectCreationPreview({
      ...base,
      currentInterface: {
        ...base.currentInterface,
        text: "先打开根 Block 6a622050-1ee6-4ef0-95cb-92263be67408。",
      },
    }, authority("MINI_PROJECT")),
    /machine identity.*user-visible prose/i,
  );
});

test("current Project entry rejects UI composition requirements instead of formalizing them as current work", () => {
  const base = draft("BLANK");
  assert.throws(
    () => materializeProjectCreationPreview({
      ...base,
      currentInterface: {
        text: "重入时先看到一句当前状态、一个当前推进和字段映射入口；不需要额外仪表盘。",
        evidenceRefs: ["answer:interface"],
      },
    }, authority("BLANK")),
    /concrete business action/i,
  );
  assert.equal(
    materializeProjectCreationPreview({
      ...base,
      currentInterface: {
        text: "先接入一条华为真实告警并核对字段映射。",
        evidenceRefs: ["answer:interface"],
      },
    }, authority("BLANK")).finalReading.currentInterface.text,
    "先接入一条华为真实告警并核对字段映射。",
  );
});
