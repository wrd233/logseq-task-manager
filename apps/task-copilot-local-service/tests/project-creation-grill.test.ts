import assert from "node:assert/strict";
import test from "node:test";

import { requiredGrillFocus } from "@task-copilot/application";
import { checksum } from "@task-copilot/shared";

import {
  buildProjectCreationGrillGeneration,
  buildProjectCreationPreviewGeneration,
  type ProjectCreationGrillSource,
} from "../src/project-creation-grill.ts";

function source(
  sourceKind: ProjectCreationGrillSource["sourceKind"],
  answers: ProjectCreationGrillSource["answers"] = [],
): ProjectCreationGrillSource {
  const materials = sourceKind === "BLANK"
    ? []
    : [{
      sourceRef: sourceKind === "PAGE" ? "page:project-notes" : "object:mini-1@v3",
      kind: sourceKind === "PAGE" ? "PAGE" as const : "MINI_PROJECT" as const,
      text: sourceKind === "PAGE" ? "项目资料：目标、相关人和待整理记录" : "整理托管设备记录",
      contentHash: checksum(sourceKind),
    }];
  return {
    observedAt: "2026-07-25T12:00:00.000Z",
    sourceKind,
    materials,
    contextPackage: {
      manifest: {
        schemaVersion: 1,
        generatedAt: "2026-07-25T11:59:59.000Z",
        scope: { kind: "page", id: "project-creation-entry" },
        authority: "READ_ONLY_DERIVATIVE",
        formalFactsSource: "SQLITE",
        graphExcerptStatus: sourceKind === "BLANK" ? "NOT_INCLUDED" : "AVAILABLE_FROM_LOGSEQ_BRIDGE",
        includedObjectCount: sourceKind === "MINI_PROJECT" ? 1 : 0,
        files: [],
      },
      files: {
        "source.json": JSON.stringify(materials),
        "workspace-semantics.md": "Project 是需要持续推进、可重入且有内部闭环的结果容器。",
        "writing-profile.md": "使用简洁中文。",
      },
    },
    contextFingerprint: "a".repeat(64),
    coreSkill: {
      name: "task-copilot-core",
      version: "1.0.0",
      description: "core",
      sha256: "b".repeat(64),
      content: "Never write formal state directly.",
    },
    grillSkill: {
      name: "project-creation-modeling",
      version: "1.0.0",
      description: "project creation",
      sha256: "c".repeat(64),
      content: "Follow the supplied source and largest uncertainty.",
    },
    answers,
  };
}

test("Blank, Page, and MiniProject entries expose different evidence-bounded first uncertainties without inventing an Object", () => {
  const blank = buildProjectCreationGrillGeneration(source("BLANK"));
  const page = buildProjectCreationGrillGeneration(source("PAGE"));
  const miniProject = buildProjectCreationGrillGeneration(source("MINI_PROJECT"));

  assert.deepEqual(blank.authority.subject, { kind: "PROJECT_CREATION", sourceKind: "BLANK", sourceRefs: [] });
  assert.deepEqual(page.authority.subject, { kind: "PROJECT_CREATION", sourceKind: "PAGE", sourceRefs: ["page:project-notes"] });
  assert.deepEqual(miniProject.authority.subject, { kind: "PROJECT_CREATION", sourceKind: "MINI_PROJECT", sourceRefs: ["object:mini-1@v3"] });
  assert.equal(requiredGrillFocus({ ...blank.authority, contractVersion: "1.0.0", promptVersion: "test", provider: { providerId: "test", providerVersion: "test", model: "test" } })?.uncertaintyId, "outcome");
  assert.equal(requiredGrillFocus({ ...page.authority, contractVersion: "1.0.0", promptVersion: "test", provider: { providerId: "test", providerVersion: "test", model: "test" } })?.uncertaintyId, "material-disposition");
  assert.equal(requiredGrillFocus({ ...miniProject.authority, contractVersion: "1.0.0", promptVersion: "test", provider: { providerId: "test", providerVersion: "test", model: "test" } })?.uncertaintyId, "project-boundary");
  assert.doesNotMatch(JSON.stringify([blank, page, miniProject]), /objectId|Proposal|semanticOperations/);
  assert.match(
    blank.runtimeContext.content,
    /current-interface.*实际继续.*工作.*不是页面布局.*仪表盘/s,
  );
});

test("answers resolve only their exact dimensions and change the machine-selected focus", () => {
  const first = buildProjectCreationGrillGeneration(source("MINI_PROJECT"));
  assert.equal(first.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "project-boundary")?.status, "OPEN");

  const second = buildProjectCreationGrillGeneration(source("MINI_PROJECT", [
    { uncertaintyId: "project-boundary", text: "这是持续维护托管设备全生命周期的 Project。" },
  ]));
  assert.equal(second.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "project-boundary")?.status, "RESOLVED");
  assert.equal(second.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "page-object-relationship")?.status, "RESOLVED");
  assert.equal(requiredGrillFocus({ ...second.authority, contractVersion: "1.0.0", promptVersion: "test", provider: { providerId: "test", providerVersion: "test", model: "test" } })?.uncertaintyId, "current-interface");
  assert.notEqual(second.authority.sourceFingerprint, first.authority.sourceFingerprint);
});

test("source fingerprint survives a fresh Context Package timestamp but changes with user semantics", () => {
  const base = source("PAGE");
  const firstSource = {
    ...base,
    contextPackage: {
      ...base.contextPackage,
      files: {
        ...base.contextPackage.files,
        "graph/page.json": JSON.stringify({ snapshot: { readAt: "2026-07-25T11:59:59.000Z", scopeHash: "12345678" } }),
        "objects.json": JSON.stringify({ formalFacts: [{ objectId: "task-1", version: 3, lifecycle: "OPEN" }] }),
      },
    },
  };
  const secondSource = {
    ...firstSource,
    observedAt: "2026-07-25T12:05:00.000Z",
    contextFingerprint: "d".repeat(64),
    contextPackage: {
      ...firstSource.contextPackage,
      manifest: { ...firstSource.contextPackage.manifest, generatedAt: "2026-07-25T12:04:59.000Z" },
      files: {
        ...firstSource.contextPackage.files,
        "graph/page.json": JSON.stringify({ snapshot: { readAt: "2026-07-25T12:04:59.000Z", scopeHash: "12345678" } }),
      },
    },
  };
  const first = buildProjectCreationGrillGeneration(firstSource);
  const second = buildProjectCreationGrillGeneration(secondSource);
  assert.equal(second.authority.sourceFingerprint, first.authority.sourceFingerprint);

  const changed = buildProjectCreationGrillGeneration({
    ...secondSource,
    contextPackage: {
      ...secondSource.contextPackage,
      files: { ...secondSource.contextPackage.files, "workspace-semantics.md": "Project 必须形成独立长期交付。" },
    },
  });
  assert.notEqual(changed.authority.sourceFingerprint, first.authority.sourceFingerprint);

  const formalFactChanged = buildProjectCreationGrillGeneration({
    ...secondSource,
    contextPackage: {
      ...secondSource.contextPackage,
      files: {
        ...secondSource.contextPackage.files,
        "objects.json": JSON.stringify({ formalFacts: [{ objectId: "task-1", version: 4, lifecycle: "COMPLETED" }] }),
      },
    },
  });
  assert.notEqual(formalFactChanged.authority.sourceFingerprint, first.authority.sourceFingerprint);
});

test("all seven Project creation dimensions, including Page/Object relationship, must resolve before preview readiness", () => {
  const ready = buildProjectCreationGrillGeneration(source("PAGE", [
    { uncertaintyId: "material-disposition", text: "现有页面内容全部作为项目背景材料保留。" },
    { uncertaintyId: "outcome", text: "形成可持续推进的托管设备治理结果。" },
    { uncertaintyId: "project-boundary", text: "只覆盖托管设备登记、核验和更新。" },
    { uncertaintyId: "completion-evidence", text: "每台设备都有负责人、状态和最后核验时间。" },
    { uncertaintyId: "internal-closure", text: "每周核验未完成项并形成下一步。" },
    { uncertaintyId: "current-interface", text: "当前界面展示本周待核验设备和阻塞。" },
    { uncertaintyId: "page-object-relationship", text: "创建受控 Project Page，原 Page 保留并作为来源连接。" },
  ]));

  assert.equal(ready.authority.uncertainties.length, 7);
  assert.equal(ready.authority.uncertainties.every(({ status }) => status === "RESOLVED"), true);
  assert.deepEqual(ready.authority.unclassifiedMaterialRefs, []);
});

test("invalid source claims, duplicate answers, and unknown questionnaire fields fail before Provider use", () => {
  assert.throws(
    () => buildProjectCreationGrillGeneration({ ...source("BLANK"), materials: source("PAGE").materials }),
    /Blank/i,
  );
  assert.throws(
    () => buildProjectCreationGrillGeneration({ ...source("PAGE"), materials: [] }),
    /source material/i,
  );
  assert.throws(
    () => buildProjectCreationGrillGeneration(source("PAGE", [{ uncertaintyId: "title", text: "固定标题字段" }])),
    /answer is invalid/i,
  );
  assert.throws(
    () => buildProjectCreationGrillGeneration(source("PAGE", [
      { uncertaintyId: "outcome", text: "结果一" },
      { uncertaintyId: "outcome", text: "结果二" },
    ])),
    /answers are invalid/i,
  );
});

test("Project creation preview authority opens only after every source-specific uncertainty is resolved", () => {
  const pageAnswers = [
    { uncertaintyId: "material-disposition", text: "原 Page 保留为 Project 来源。" },
    { uncertaintyId: "page-object-relationship", text: "创建受控 Project Page，并连接原 Page。" },
    { uncertaintyId: "outcome", text: "持续形成可核验的治理结果。" },
    { uncertaintyId: "project-boundary", text: "只覆盖托管设备登记、核验和更新。" },
    { uncertaintyId: "completion-evidence", text: "每台设备都有负责人、状态和最后核验时间。" },
    { uncertaintyId: "internal-closure", text: "每周核验差异并形成下一步。" },
    { uncertaintyId: "current-interface", text: "先看本周待核验设备和阻塞。" },
  ];
  assert.throws(
    () => buildProjectCreationPreviewGeneration(source("PAGE", pageAnswers.slice(0, 6))),
    /not ready/i,
  );

  const page = buildProjectCreationPreviewGeneration(source("PAGE", pageAnswers));
  assert.equal(page.authority.readiness, "READY_FOR_PREVIEW");
  assert.equal(page.authority.sourceKind, "PAGE");
  assert.equal(page.authority.materials.length, 1);
  assert.equal(page.authority.materials[0]?.exactText, "项目资料：目标、相关人和待整理记录");
  assert.equal(page.authority.resolvedDimensions.length, 7);
  assert.deepEqual(
    new Set(page.authority.resolvedDimensions.map(({ dimension }) => dimension)),
    new Set(["OUTCOME", "BOUNDARY", "COMPLETION_EVIDENCE", "UNCLASSIFIED_MATERIAL", "INTERNAL_CLOSURE", "CURRENT_INTERFACE", "PAGE_OBJECT_RELATIONSHIP"]),
  );

  const blank = buildProjectCreationPreviewGeneration(source("BLANK", [
    { uncertaintyId: "outcome", text: "持续形成可核验的治理结果。" },
    { uncertaintyId: "project-boundary", text: "只覆盖托管设备登记、核验和更新。" },
    { uncertaintyId: "completion-evidence", text: "每台设备都有最后核验时间。" },
    { uncertaintyId: "internal-closure", text: "每周核验差异并形成下一步。" },
    { uncertaintyId: "current-interface", text: "先看本周待核验设备。" },
  ]));
  assert.equal(blank.authority.materials.length, 0);
  assert.equal(blank.authority.resolvedDimensions.find(({ dimension }) => dimension === "PAGE_OBJECT_RELATIONSHIP")?.evidenceRefs[0], "contract:project-page-creation-v1");
  assert.equal(blank.authority.resolvedDimensions.find(({ dimension }) => dimension === "UNCLASSIFIED_MATERIAL")?.evidenceRefs[0], "session:project-creation-entry");

  const miniProject = buildProjectCreationPreviewGeneration(source("MINI_PROJECT", [
    { uncertaintyId: "project-boundary", text: "升级为持续维护托管设备全生命周期的 Project。" },
    { uncertaintyId: "current-interface", text: "先看当前结论、风险与唯一下一步。" },
    { uncertaintyId: "internal-closure", text: "每轮核验后更新结论与下一步。" },
    { uncertaintyId: "outcome", text: "持续形成可复核的设备治理结果。" },
    { uncertaintyId: "completion-evidence", text: "版本化结论、风险和证据均可读回。" },
    { uncertaintyId: "material-disposition", text: "原 MiniProject 正文与正式对象保持原样，只作为来源。" },
  ]));
  assert.equal(miniProject.authority.readiness, "READY_FOR_PREVIEW");
  assert.equal(miniProject.authority.resolvedDimensions.find(({ dimension }) => dimension === "PAGE_OBJECT_RELATIONSHIP")?.text.includes("只允许另建"), true);
  assert.equal(miniProject.authority.resolvedDimensions.find(({ dimension }) => dimension === "PAGE_OBJECT_RELATIONSHIP")?.evidenceRefs[0], "contract:project-page-creation-v1");
});
