import assert from "node:assert/strict";
import test from "node:test";

import { requiredGrillFocus } from "@task-copilot/application";
import { checksum } from "@task-copilot/shared";

import {
  buildProjectCreationGrillGeneration,
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
});

test("answers resolve only their exact dimensions and change the machine-selected focus", () => {
  const first = buildProjectCreationGrillGeneration(source("MINI_PROJECT"));
  assert.equal(first.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "project-boundary")?.status, "OPEN");

  const second = buildProjectCreationGrillGeneration(source("MINI_PROJECT", [
    { uncertaintyId: "project-boundary", text: "这是持续维护托管设备全生命周期的 Project。" },
  ]));
  assert.equal(second.authority.uncertainties.find(({ uncertaintyId }) => uncertaintyId === "project-boundary")?.status, "RESOLVED");
  assert.equal(requiredGrillFocus({ ...second.authority, contractVersion: "1.0.0", promptVersion: "test", provider: { providerId: "test", providerVersion: "test", model: "test" } })?.uncertaintyId, "current-interface");
  assert.notEqual(second.authority.sourceFingerprint, first.authority.sourceFingerprint);
});

test("all six Project creation dimensions must resolve before preview readiness", () => {
  const ready = buildProjectCreationGrillGeneration(source("PAGE", [
    { uncertaintyId: "material-disposition", text: "现有页面内容全部作为项目背景材料保留。" },
    { uncertaintyId: "outcome", text: "形成可持续推进的托管设备治理结果。" },
    { uncertaintyId: "project-boundary", text: "只覆盖托管设备登记、核验和更新。" },
    { uncertaintyId: "completion-evidence", text: "每台设备都有负责人、状态和最后核验时间。" },
    { uncertaintyId: "internal-closure", text: "每周核验未完成项并形成下一步。" },
    { uncertaintyId: "current-interface", text: "当前界面展示本周待核验设备和阻塞。" },
  ]));

  assert.equal(ready.authority.uncertainties.length, 6);
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
