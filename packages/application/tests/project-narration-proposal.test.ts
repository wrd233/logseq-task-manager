import assert from "node:assert/strict";
import test from "node:test";

import type { V2ManagedObject } from "@task-copilot/domain";

import {
  buildProjectNarrationProposal,
  planAcceptedV2ProjectStructure,
  type UnifiedUxOutput,
} from "../src/index.ts";

const project: V2ManagedObject = {
  objectId: "project-1",
  objectType: "PROJECT",
  text: "发布治理",
  lifecycle: "OPEN",
  condition: { kind: "ACTIONABLE" },
  version: 3,
  sourceOrCreationEvent: "event-1",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T01:00:00.000Z",
  projectStructure: {
    objectives: [{ objectiveId: "objective-1", text: "稳定发布", priority: "PRIMARY", successEvidence: ["恢复演练通过"] }],
    deliverables: [{ deliverableId: "deliverable-1", text: "发布手册", acceptance: "可独立执行", status: "AVAILABLE" }],
    workStages: [{ stageId: "stage-1", name: "验收", statusDescription: "正在验证恢复路径" }],
    currentSummary: "核心链路已完成，正在继续验收。",
    currentFocuses: ["完成恢复演练"],
    stageMappings: [],
  },
};

const output: UnifiedUxOutput = {
  schemaVersion: "task-copilot-ux-output-v1",
  summary: "核心链路已经完成，当前只需收口恢复验收。",
  facts: [{ text: "Project 当前摘要：核心链路已完成，正在继续验收。", sourceRefs: ["object:project-1@v3"] }],
  inferences: [{ text: "恢复验收是当前唯一需要收口的工作。", evidenceRefs: ["object:project-1@v3"] }],
  unknowns: ["尚不能确认最终发布时间。"],
  suggestedChanges: [],
  nextActionEligible: false,
  riskLevel: "MEDIUM",
  requiresDiscussion: false,
  requiresReview: true,
  evidenceScope: { refs: ["object:project-1@v3"], observedAt: "2026-07-26T02:00:00.000Z", scopeHash: "scope-1" },
  provenance: {
    kind: "LLM_DRAFT",
    contractVersion: "1.0.0",
    promptVersion: "prompt-1",
    skillName: "recover-context",
    skillVersion: "1.1.0",
    providerId: "deepseek",
    providerVersion: "1",
    model: "test-model",
    generatedAt: "2026-07-26T02:00:00.000Z",
  },
};

test("LLM Project narration becomes one MEDIUM review proposal without changing structure", () => {
  const proposal = buildProjectNarrationProposal({ project, output, createdAt: "2026-07-26T02:00:00.000Z" });
  assert.equal(proposal.groups[0]?.risk, "MEDIUM");
  assert.equal(proposal.groups[0]?.semanticOperations[0]?.kind, "UPDATE_PROJECT_NARRATION");
  assert.equal(proposal.source.kind, "local_llm");
  assert.match(proposal.finalPreview, /原摘要/);
  assert.match(proposal.finalPreview, /建议摘要/);

  const accepted = {
    ...proposal,
    status: "ACCEPTED" as const,
    groups: proposal.groups.map((group) => ({ ...group, disposition: "ACCEPTED" as const })),
  };
  const plan = planAcceptedV2ProjectStructure(accepted);
  assert.equal(plan.structure.currentSummary, output.summary);
  assert.deepEqual(plan.structure.currentFocuses, project.projectStructure?.currentFocuses);
  assert.deepEqual(plan.structure.objectives, project.projectStructure?.objectives);
});

test("MEDIUM narration rejects structural change and no-op output", () => {
  assert.throws(
    () => buildProjectNarrationProposal({
      project,
      output: { ...output, summary: project.projectStructure!.currentSummary },
      createdAt: "2026-07-26T02:00:00.000Z",
    }),
    /重复 Proposal/,
  );
  const proposal = buildProjectNarrationProposal({ project, output, createdAt: "2026-07-26T02:00:00.000Z" });
  const operation = proposal.groups[0]!.semanticOperations[0]!;
  const unsafe = {
    ...proposal,
    status: "ACCEPTED" as const,
    groups: [{
      ...proposal.groups[0]!,
      disposition: "ACCEPTED" as const,
      semanticOperations: [{
        ...operation,
        payload: {
          ...operation.payload,
          projectStructure: {
            ...operation.payload.projectStructure as typeof project.projectStructure,
            objectives: [],
          },
        },
      }],
    }],
  };
  assert.throws(() => planAcceptedV2ProjectStructure(unsafe), /不能修改 Objectives/);
});
