import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectClosureEvidenceDraft,
  type ProjectClosureEvidenceSource,
} from "../src/project-closure-evidence.ts";
import type { V2ManagedObject } from "@task-copilot/domain";

const at = "2026-07-26T01:00:00.000Z";

function object(
  objectId: string,
  objectType: V2ManagedObject["objectType"],
  text: string,
  lifecycle: V2ManagedObject["lifecycle"] = "OPEN",
): V2ManagedObject {
  return {
    objectId,
    objectType,
    version: 1,
    lifecycle,
    condition: { kind: "ACTIONABLE" },
    text,
    createdAt: at,
    updatedAt: at,
    sourceOrCreationEvent: "test",
  };
}

function source(): ProjectClosureEvidenceSource {
  const project: V2ManagedObject = {
    ...object("project-1", "PROJECT", "发布治理"),
    version: 4,
    projectStructure: {
      objectives: [
        { objectiveId: "objective-primary", text: "稳定发布", priority: "PRIMARY", successEvidence: ["恢复演练通过"] },
        { objectiveId: "objective-secondary", text: "整理历史告警", priority: "SECONDARY", successEvidence: ["历史记录可检索"] },
      ],
      deliverables: [
        { deliverableId: "deliverable-accepted", text: "发布手册", acceptance: "值班同学可独立执行", status: "ACCEPTED" },
        { deliverableId: "deliverable-planned", text: "历史数据报告", acceptance: "缺口有明确说明", status: "PLANNED" },
      ],
      workStages: [{ stageId: "stage-1", name: "验收", statusDescription: "正在收口恢复证据" }],
      currentSummary: "主链已上线，正在处理历史数据。",
      currentFocuses: ["完成恢复验收"],
      stageMappings: [],
    },
  };
  return {
    project,
    expectedVersion: 4,
    objects: [
      project,
      object("output-1", "OUTPUT", "恢复演练报告", "COMPLETED"),
      object("decision-1", "DECISION", "保留回退开关", "COMPLETED"),
      object("mini-done", "MINI_PROJECT", "新链路上线", "COMPLETED"),
      { ...object("task-waiting", "TASK", "补齐历史数据"), condition: { kind: "WAITING", waitingFor: "数据团队", expectedResult: "历史数据", reviewAt: "2026-08-01T01:00:00.000Z" } },
      object("related-output", "OUTPUT", "只有普通关联的材料", "COMPLETED"),
      object("nested-task", "TASK", "孙级对象不自动提升", "COMPLETED"),
    ],
    ownerships: [
      { ownerObjectId: "project-1", childObjectId: "output-1", assignedAt: at },
      { ownerObjectId: "project-1", childObjectId: "decision-1", assignedAt: at },
      { ownerObjectId: "project-1", childObjectId: "mini-done", assignedAt: at },
      { ownerObjectId: "project-1", childObjectId: "task-waiting", assignedAt: at },
      { ownerObjectId: "mini-done", childObjectId: "nested-task", assignedAt: at },
    ],
  };
}

test("Project Closure evidence starts from formal structure and direct ownership without inventing completion", () => {
  const draft = buildProjectClosureEvidenceDraft(source());

  assert.equal(draft.schemaVersion, "task-copilot-project-closure-evidence-v1");
  assert.equal(draft.project.objectId, "project-1");
  assert.deepEqual(draft.goalCandidates.map(({ text }) => text), ["稳定发布", "整理历史告警"]);
  assert.deepEqual(draft.deliverableCandidates.map(({ text }) => text), ["发布手册", "恢复演练报告"]);
  assert.deepEqual(draft.decisionCandidates.map(({ text }) => text), ["保留回退开关"]);
  assert.deepEqual(draft.completedWorkCandidates.map(({ text }) => text), ["新链路上线"]);
  assert.deepEqual(draft.unresolvedWork.map(({ text }) => text), ["补齐历史数据"]);
  assert.deepEqual(draft.objectiveJudgments.map(({ objective, evidence }) => ({
    objective: objective.text,
    evidence: evidence.map(({ text }) => text),
  })), [
    { objective: "稳定发布", evidence: ["恢复演练通过"] },
    { objective: "整理历史告警", evidence: ["历史记录可检索"] },
  ]);
  assert.equal(draft.objectiveJudgments.every(({ disposition }) => disposition === "NEEDS_USER_JUDGMENT"), true);
  assert.equal(draft.userJudgments.some(({ judgment }) => judgment === "ACTUAL_RESULT"), true);
  assert.equal(draft.userJudgments.some(({ judgment }) => judgment === "LEGACY_DISPOSITION"), true);
  assert.equal(draft.userJudgments.some(({ judgment }) => judgment === "FUTURE_SUMMARY"), true);
  assert.equal(draft.unknowns.some((value) => value.code === "OBJECTIVE_COMPLETION_NOT_INFERRED"), true);
  assert.equal(JSON.stringify(draft).includes("只有普通关联的材料"), false);
  assert.equal(JSON.stringify(draft).includes("孙级对象不自动提升"), false);
  assert.match(draft.evidenceScopeHash, /^[0-9a-f]{8}$/);
});

test("empty Project evidence explicitly preserves unknowns instead of filling a Closure form", () => {
  const project = {
    ...object("project-empty", "PROJECT", "边界仍不明确"),
    projectStructure: {
      objectives: [],
      deliverables: [],
      workStages: [],
      currentSummary: "尚未形成可靠边界。",
      currentFocuses: ["回到原文核对"],
      stageMappings: [],
    },
  };
  const draft = buildProjectClosureEvidenceDraft({
    project,
    expectedVersion: project.version,
    objects: [project],
    ownerships: [],
  });

  assert.deepEqual(draft.goalCandidates, []);
  assert.deepEqual(draft.deliverableCandidates, []);
  assert.deepEqual(draft.decisionCandidates, []);
  assert.equal(draft.unknowns.some(({ code }) => code === "ORIGINAL_GOAL_UNKNOWN"), true);
  assert.equal(draft.unknowns.some(({ code }) => code === "DELIVERABLE_EVIDENCE_MISSING"), true);
  assert.equal(draft.unknowns.some(({ code }) => code === "KEY_DECISION_EVIDENCE_MISSING"), true);
  assert.equal(draft.userJudgments.some(({ judgment }) => judgment === "ORIGINAL_GOAL"), true);
  assert.equal(draft.userJudgments.some(({ judgment }) => judgment === "KEY_DECISIONS"), true);
});

test("Closure evidence refuses stale, non-Project, completed, duplicate, and missing-object input", () => {
  const value = source();
  assert.throws(
    () => buildProjectClosureEvidenceDraft({ ...value, expectedVersion: 3 }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_EVIDENCE_STALE",
  );
  assert.throws(
    () => buildProjectClosureEvidenceDraft({ ...value, project: { ...value.project, objectType: "TASK" } }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_EVIDENCE_PROJECT_REQUIRED",
  );
  assert.throws(
    () => buildProjectClosureEvidenceDraft({ ...value, project: { ...value.project, lifecycle: "COMPLETED" } }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_EVIDENCE_OPEN_REQUIRED",
  );
  assert.throws(
    () => buildProjectClosureEvidenceDraft({ ...value, objects: [...value.objects, value.objects[1]!] }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_EVIDENCE_DUPLICATE_OBJECT",
  );
  assert.throws(
    () => buildProjectClosureEvidenceDraft({
      ...value,
      objects: value.objects.filter(({ objectId }) => objectId !== "output-1"),
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_EVIDENCE_OBJECT_MISSING",
  );
});
