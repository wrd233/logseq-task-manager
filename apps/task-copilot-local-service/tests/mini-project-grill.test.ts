import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { buildMiniProjectGrillGeneration, buildMiniProjectGrillPreviewGeneration, buildMiniProjectSourcePositions, type MiniProjectGrillSource } from "../src/mini-project-grill.ts";

const subject: V2ManagedObject = {
  objectId: "mini-1", objectType: "MINI_PROJECT", version: 3, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" },
  text: "整理托管设备记录", createdAt: "2026-07-24T10:00:00.000Z", updatedAt: "2026-07-24T11:00:00.000Z", sourceOrCreationEvent: "block:block-root",
};
const anchors: V2Anchor[] = [{
  anchorId: "anchor-mini", objectId: "mini-1", graphId: "graph-1", externalId: "block-root", role: "primary_text", status: "active",
  contentHash: checksum("[MiniProject] 整理托管设备记录"), lastSeenAt: "2026-07-24T11:00:00.000Z",
}];

function source(answers: MiniProjectGrillSource["answers"] = []): MiniProjectGrillSource {
  return {
    observedAt: "2026-07-24T14:00:00.000Z",
    subject,
    objects: [subject],
    anchors,
    graphSnapshot: {
      kind: "BLOCK", requestedTarget: "block-root", resolved: { kind: "BLOCK", id: "block-root" }, truncated: false,
      readAt: "2026-07-24T13:59:59.000Z", scopeHash: checksum("scope"),
      blocks: [
        { uuid: "block-root", content: "[MiniProject] 整理托管设备记录", contentHash: checksum("root"), relation: "ROOT", depth: 0 },
        { uuid: "block-loose", content: "厂家参数尚未归类", contentHash: checksum("loose"), relation: "CHILD", depth: 1, parentUuid: "block-root" },
      ],
    },
    contextPackage: {
      manifest: { schemaVersion: 1, generatedAt: "2026-07-24T14:00:00.000Z", scope: { kind: "project", id: "mini-1" }, authority: "READ_ONLY_DERIVATIVE", formalFactsSource: "SQLITE", graphExcerptStatus: "AVAILABLE_FROM_LOGSEQ_BRIDGE", includedObjectCount: 1, files: [] },
      files: { "objects.json": JSON.stringify({ formalFacts: [subject] }), "graph/block.json": JSON.stringify({ blocks: [{ uuid: "block-loose", content: "厂家参数尚未归类" }] }), "workspace-semantics.md": "not configured", "writing-profile.md": "not configured" },
    },
    contextFingerprint: "c".repeat(64),
    coreSkill: { name: "task-copilot-core", version: "1.0.0", description: "core", sha256: "d".repeat(64), content: "formal writes remain controlled" },
    grillSkill: { name: "mini-project-modeling", version: "1.0.0", description: "grill", sha256: "e".repeat(64), content: "ask the largest material-specific uncertainty" },
    answers,
  };
}

test("MiniProject Grill authority comes from the exact Primary Anchor subtree and prioritizes its real loose material", () => {
  const generation = buildMiniProjectGrillGeneration(source());
  const subject = generation.authority.subject;
  if (subject.kind !== "MINI_PROJECT") assert.fail("MiniProject generation cannot become another Grill subject.");
  assert.equal(subject.objectId, "mini-1");
  assert.equal(generation.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "boundary")?.priority, 5);
  assert.deepEqual(generation.authority.unclassifiedMaterialRefs, ["block:block-loose"]);
  assert.doesNotMatch(generation.runtimeContext.content, /Proposal|CHANGE_OWNERSHIP/);
  assert.match(generation.runtimeContext.content, /厂家参数尚未归类/);
});

test("bounded user answers become session facts and resolve only their exact machine uncertainties", () => {
  const partial = buildMiniProjectGrillGeneration(source([{ uncertaintyId: "boundary", text: "只覆盖当前设备清单。" }]));
  assert.equal(partial.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "boundary")?.status, "RESOLVED");
  assert.equal(partial.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "outcome")?.status, "OPEN");
  assert.match(partial.authority.facts.find(({ factId }) => factId === "answer-boundary")?.sourceRefs[0] ?? "", /^answer:[a-f0-9]{16}$/);

  const ready = buildMiniProjectGrillGeneration(source([
    { uncertaintyId: "boundary", text: "只覆盖当前设备清单。" },
    { uncertaintyId: "outcome", text: "形成可维护的设备记录。" },
    { uncertaintyId: "completion-evidence", text: "每台设备都有型号和参数来源。" },
    { uncertaintyId: "material-disposition", text: "厂家参数归入对应设备记录。" },
  ]));
  assert.equal(ready.authority.uncertainties.every(({ status }) => status === "RESOLVED"), true);
  assert.deepEqual(ready.authority.unclassifiedMaterialRefs, []);
  assert.notEqual(ready.authority.sourceFingerprint, partial.authority.sourceFingerprint);
});

test("unknown, duplicate, oversized, or mismatched source material fails before Provider use", () => {
  assert.throws(() => buildMiniProjectGrillGeneration(source([{ uncertaintyId: "title", text: "固定表单字段" }])), /answer is invalid/);
  assert.throws(() => buildMiniProjectGrillGeneration({ ...source(), graphSnapshot: { ...source().graphSnapshot, resolved: { kind: "BLOCK", id: "another-block" } } }), /Primary Anchor/);
});

test("preview generation opens only after all uncertainties resolve and preserves exact subtree material authority", () => {
  assert.throws(() => buildMiniProjectGrillPreviewGeneration(source()), /not ready/i);
  const readySource = source([
    { uncertaintyId: "boundary", text: "只覆盖当前设备清单。" },
    { uncertaintyId: "outcome", text: "形成可维护的设备记录。" },
    { uncertaintyId: "completion-evidence", text: "每台设备都有型号和参数来源。" },
    { uncertaintyId: "material-disposition", text: "厂家参数归入对应设备记录。" },
  ]);
  const preview = buildMiniProjectGrillPreviewGeneration(readySource);
  assert.equal(preview.authority.readiness, "READY_FOR_PREVIEW");
  assert.deepEqual(preview.authority.materials.map(({ materialId, sourceRef, exactText, currentSectionId, isRoot }) => ({ materialId, sourceRef, exactText, currentSectionId, isRoot })), [
    { materialId: "root", sourceRef: "block:block-root", exactText: "[MiniProject] 整理托管设备记录", currentSectionId: "root", isRoot: true },
    { materialId: "material-2", sourceRef: "block:block-loose", exactText: "厂家参数尚未归类", currentSectionId: "root", isRoot: false },
  ]);
  assert.equal(preview.authority.sessionFacts.filter(({ factId }) => factId.startsWith("answer-")).length, 4);
  assert.throws(() => buildMiniProjectGrillPreviewGeneration({ ...readySource, graphSnapshot: { ...readySource.graphSnapshot, truncated: true } }), /truncated/i);
});

test("preview and Proposal source positions share the canonical Logseq text behind the bridge content hash", () => {
  const rootUuid = "11111111-1111-4111-8111-111111111111";
  const childUuid = "22222222-2222-4222-8222-222222222222";
  const rootContent = `[MiniProject] 整理托管设备记录
id:: ${rootUuid}`;
  const childContent = `厂家参数尚未归类
id:: ${childUuid}`;
  const canonicalRoot = "[MiniProject] 整理托管设备记录";
  const canonicalChild = "厂家参数尚未归类";
  const readySource = source([
    { uncertaintyId: "boundary", text: "只覆盖当前设备清单。" },
    { uncertaintyId: "outcome", text: "形成可维护的设备记录。" },
    { uncertaintyId: "completion-evidence", text: "每台设备都有型号和参数来源。" },
    { uncertaintyId: "material-disposition", text: "厂家参数归入对应设备记录。" },
  ]);
  readySource.anchors = [{ ...anchors[0]!, externalId: rootUuid, contentHash: checksum(canonicalRoot) }];
  readySource.graphSnapshot = {
    ...readySource.graphSnapshot,
    requestedTarget: rootUuid,
    resolved: { kind: "BLOCK", id: rootUuid },
    blocks: [
      { uuid: rootUuid, content: rootContent, contentHash: checksum(canonicalRoot), relation: "ROOT", depth: 0 },
      { uuid: childUuid, content: childContent, contentHash: checksum(canonicalChild), relation: "CHILD", depth: 1, parentUuid: rootUuid },
    ],
  };

  const preview = buildMiniProjectGrillPreviewGeneration(readySource);
  const positions = buildMiniProjectSourcePositions(readySource.graphSnapshot);

  assert.deepEqual(preview.authority.materials.map(({ exactText }) => exactText), [canonicalRoot, canonicalChild]);
  assert.deepEqual(positions.map(({ exactText }) => exactText), [canonicalRoot, canonicalChild]);
  assert.deepEqual(positions.map(({ exactText, contentHash }) => checksum(exactText) === contentHash), [true, true]);
});
