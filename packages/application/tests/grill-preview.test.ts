import assert from "node:assert/strict";
import test from "node:test";

import {
  GRILL_PREVIEW_SCHEMA_VERSION,
  materializeGrillPreview,
  type GrillPreviewAuthority,
} from "../src/grill-preview.ts";

function authority(): GrillPreviewAuthority {
  return {
    observedAt: "2026-07-24T12:00:00.000Z",
    contractVersion: "1.0.0",
    promptVersion: "preview-v1",
    skill: { name: "mini-project-modeling", version: "1.0.0" },
    provider: { providerId: "deepseek", providerVersion: "chat-v1", model: "deepseek-v4-flash" },
    subject: { kind: "MINI_PROJECT", objectId: "mini-1", version: 3 },
    sourceFingerprint: "a".repeat(64),
    readiness: "READY_FOR_PREVIEW",
    materials: [
      { materialId: "root", sourceRef: "block:block-root", contentHash: "b".repeat(64), exactText: "[MiniProject] 完成设备托管入场材料", currentSectionId: "root", isRoot: true },
      { materialId: "step-list", sourceRef: "block:block-step", contentHash: "c".repeat(64), exactText: "- 核对设备清单\n- 记录厂家参数", currentSectionId: "root", isRoot: false },
      { materialId: "note", sourceRef: "block:block-note", contentHash: "d".repeat(64), exactText: "长期运维规则另行治理", currentSectionId: "root", isRoot: false },
    ],
    sessionFacts: [
      { factId: "answer-boundary", text: "长期运维不属于本次结果。", sourceRefs: ["answer:u-boundary"] },
      { factId: "answer-done", text: "设备清单和参数均可复核时完成。", sourceRefs: ["answer:u-completion"] },
    ],
  };
}

function claim(text: string, evidenceRefs: string[]) {
  return { text, evidenceRefs };
}

function draft() {
  return {
    schemaVersion: GRILL_PREVIEW_SCHEMA_VERSION,
    title: claim("完成设备托管入场材料", ["block:block-root"]),
    outcome: claim("形成可复核的设备清单与厂家参数记录。", ["block:block-step", "answer:u-completion"]),
    boundary: {
      included: [claim("本次清单中的设备与厂家参数", ["block:block-step"])],
      excluded: [claim("长期运维规则", ["block:block-note", "answer:u-boundary"])],
    },
    completionEvidence: [claim("清单与参数记录均可逐项复核", ["block:block-step", "answer:u-completion"])],
    sections: [
      { sectionId: "root", heading: "原始入口", purpose: "保留原 MiniProject 入口。", sourceMaterialIds: ["root"], derivedBlocks: [] },
      { sectionId: "work", heading: "执行材料", purpose: "集中本次结果所需的原始步骤。", sourceMaterialIds: ["step-list"], derivedBlocks: [claim("验收时逐项核对清单和参数。", ["block:block-step", "answer:u-completion"])] },
    ],
    unclassified: [{ materialId: "note", reason: "已确认不属于本次结果，保留在原始材料中等待后续承接。", evidenceRefs: ["block:block-note", "answer:u-boundary"] }],
  };
}

test("preview preserves every source material exactly once and computes a read-only impact summary", () => {
  const preview = materializeGrillPreview(draft(), authority());
  assert.equal(preview.authorityBoundary, "SESSION_PREVIEW_ONLY");
  assert.deepEqual(preview.impact, { sourceMaterialCount: 3, movedMaterialCount: 1, addedDerivedBlockCount: 1, deletedMaterialCount: 0, unclassifiedMaterialCount: 1 });
  assert.equal(preview.finalReading.sections[0]?.sourceMaterials[0]?.text, "[MiniProject] 完成设备托管入场材料");
  assert.equal(preview.finalReading.sections[1]?.sourceMaterials[0]?.contentHash, "c".repeat(64));
  assert.equal(preview.unclassified[0]?.text, "长期运维规则另行治理");
  assert.equal("proposal" in preview, false);
  assert.equal("operations" in preview, false);
});

test("omitted, duplicated, invented, or rewritten source material fails closed", () => {
  const omitted = draft();
  omitted.unclassified = [];
  assert.throws(() => materializeGrillPreview(omitted, authority()), /every source material exactly once/);

  const duplicated = draft();
  duplicated.sections[1]!.sourceMaterialIds.push("note");
  assert.throws(() => materializeGrillPreview(duplicated, authority()), /every source material exactly once/);

  const invented = draft();
  invented.sections[1]!.sourceMaterialIds = ["invented"];
  assert.throws(() => materializeGrillPreview(invented, authority()), /unknown source material/);

  assert.throws(() => materializeGrillPreview({ ...draft(), rewrittenSource: "删改原文" }, authority()), /unsupported field rewrittenSource/);
});

test("every derived claim must cite bounded machine evidence and the root stays at the root", () => {
  const unsupported = draft();
  unsupported.outcome.evidenceRefs = ["block:invented"];
  assert.throws(() => materializeGrillPreview(unsupported, authority()), /unsupported evidence/);

  const movedRoot = draft();
  movedRoot.sections[0]!.sourceMaterialIds = [];
  movedRoot.sections[1]!.sourceMaterialIds.unshift("root");
  assert.throws(() => materializeGrillPreview(movedRoot, authority()), /root material must remain/);
});

test("preview requires machine readiness and replaces model provenance and impact authority", () => {
  assert.throws(() => materializeGrillPreview(draft(), { ...authority(), readiness: "CONTINUE" }), /not ready/);
  assert.throws(() => materializeGrillPreview({ ...draft(), impact: { deletedMaterialCount: 2 } }, authority()), /unsupported field impact/);
  const output = materializeGrillPreview(draft(), authority());
  assert.equal(output.provenance.model, "deepseek-v4-flash");
  assert.match(output.evidenceScope.scopeHash, /^[a-f0-9]{8}$/);
});
