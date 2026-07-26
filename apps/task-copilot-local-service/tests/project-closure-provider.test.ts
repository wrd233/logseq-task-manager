import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectClosureEvidenceDraft } from "@task-copilot/application";
import type { V2Proposal } from "@task-copilot/domain";

import {
  buildProjectClosureProposalPrompt,
  projectClosureEvidenceScope,
  validateGeneratedProjectClosureProposal,
} from "../src/project-closure-provider.ts";
import type { TaskCopilotSkillDocument } from "../src/skill-catalog.ts";

const coreSkill: TaskCopilotSkillDocument = {
  name: "task-copilot-core",
  version: "1.0.0",
  description: "core",
  sha256: "a".repeat(64),
  content: "Proposal is not fact or authority.",
};
const designSkill: TaskCopilotSkillDocument = {
  name: "design-project",
  version: "1.3.0",
  description: "project",
  sha256: "b".repeat(64),
  content: "Closure remains review-only.",
};

function evidence(): ProjectClosureEvidenceDraft {
  return {
    schemaVersion: "task-copilot-project-closure-evidence-v1",
    project: {
      objectId: "project-closure",
      version: 4,
      text: "发布治理",
      currentSummary: "主要链路已稳定。",
      sourceRefs: ["object:project-closure@v4"],
    },
    goalCandidates: [{
      text: "稳定发布",
      sourceRefs: ["object:project-closure@v4#project-structure/objectives/objective-release"],
      evidenceKind: "PROJECT_STRUCTURE",
    }],
    deliverableCandidates: [{
      text: "发布手册",
      sourceRefs: ["object:project-closure@v4#project-structure/deliverables/runbook"],
      evidenceKind: "PROJECT_STRUCTURE",
    }],
    decisionCandidates: [{
      text: "保留回退开关",
      sourceRefs: ["object:decision-rollback@v2"],
      evidenceKind: "OWNED_OBJECT",
    }],
    completedWorkCandidates: [{
      text: "完成恢复演练",
      sourceRefs: ["object:task-rehearsal@v3"],
      evidenceKind: "OWNED_OBJECT",
    }],
    unresolvedWork: [{
      text: "补齐历史回放",
      condition: "等待：历史数据；期待：数据到齐",
      lifecycle: "OPEN",
      sourceRefs: ["object:task-history@v5"],
      evidenceKind: "OWNED_OBJECT",
    }],
    objectiveJudgments: [{
      objective: {
        objectiveId: "objective-release",
        text: "稳定发布",
        priority: "PRIMARY",
        sourceRefs: ["object:project-closure@v4#project-structure/objectives/objective-release"],
      },
      evidence: [{
        text: "恢复演练通过",
        sourceRefs: ["object:project-closure@v4#project-structure/objective-evidence/objective-release/1"],
        evidenceKind: "PROJECT_STRUCTURE",
      }],
      disposition: "NEEDS_USER_JUDGMENT",
    }],
    userJudgments: [
      { judgment: "ACTUAL_RESULT", reason: "确认实际结果。" },
      { judgment: "OBJECTIVE_DISPOSITIONS", reason: "确认 Objective 去向。" },
      { judgment: "LEGACY_DISPOSITION", reason: "确认遗留去向。" },
      { judgment: "FUTURE_SUMMARY", reason: "确认未来重入摘要。" },
    ],
    unknowns: [
      { code: "ACTUAL_RESULT_REQUIRES_CONFIRMATION", text: "实际结果仍需用户确认。" },
      { code: "OBJECTIVE_COMPLETION_NOT_INFERRED", text: "Objective 完成不能推断。" },
    ],
    evidenceScopeHash: "12345678",
    authorityBoundary: "READ_ONLY_EVIDENCE_DRAFT",
  };
}

function proposal(): V2Proposal {
  const source = evidence();
  const target = { kind: "OBJECT" as const, id: source.project.objectId, version: source.project.version };
  return {
    proposalId: "prop-closure-provider",
    schemaVersion: "v2",
    title: "审阅发布治理 Closure",
    context: "主要链路和恢复演练已有正式证据。",
    understanding: "历史回放仍需承接。",
    objective: "审阅 Closure 并完成 Project。",
    logic: "Closure 与完成状态不可拆分。",
    finalPreview: "稳定链路已交付；历史回放继续承接。",
    unresolvedQuestions: [],
    source: {
      kind: "local_llm",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      skillVersion: "design-project@1.3.0",
      writingProfileVersion: "project-closure-user-semantics-v1",
      promptBundleVersion: "12345678",
    },
    scope: { read: projectClosureEvidenceScope(source), modify: [target] },
    preconditions: ["Project remains OPEN"],
    groups: [{
      groupId: "close-project",
      explanation: "Closure 与完成不可拆分。",
      risk: "HIGH",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [],
      semanticOperations: [
        {
          operationId: "record-closure",
          kind: "UPDATE_PROJECT_INTERFACE",
          target,
          summary: "记录结构化 Closure",
          payload: {
            closure: {
              originalGoal: "稳定发布",
              actualResult: "主要链路和恢复演练已完成。",
              majorDeliverables: ["发布手册"],
              incompleteObjectives: [{ objective: "稳定发布", reason: "Objective 完成仍需用户确认", nextStep: "在 HIGH Review 中确认 disposition" }],
              legacyDisposition: "补齐历史回放由后续事项承接。",
              keyDecisions: ["保留回退开关"],
              futureSummary: "重入时先检查历史数据是否到齐。",
            },
          },
          preconditions: [],
        },
        {
          operationId: "complete-project",
          kind: "TRANSITION_LIFECYCLE",
          target,
          summary: "完成 Project",
          payload: { lifecycle: "COMPLETED" },
          preconditions: [],
        },
      ],
      disposition: "PENDING",
    }],
    status: "READY",
    createdAt: "2026-07-26T01:00:00.000Z",
  };
}

test("Closure Provider prompt is evidence-bounded and carries exact machine scope", () => {
  const value = evidence();
  const prompt = buildProjectClosureProposalPrompt({ evidence: value, coreSkill, designProjectSkill: designSkill });
  assert.equal(prompt.skill.version, "design-project@1.3.0");
  assert.match(prompt.domain.content, /NO_PROPOSAL/);
  assert.match(prompt.userSemantics.content, /Do not expose object IDs/);
  const runtime = JSON.parse(prompt.runtimeContext.content) as {
    authorityBoundary: string;
    exactReadScope: Array<{ id: string; version: number }>;
    exactModifyScope: Array<{ id: string; version: number }>;
    groundingContract: {
      originalGoalMustEqualOneOf: string[];
      majorDeliverablesMayOnlyUseExact: string[];
      keyDecisionsMayOnlyUseExact: string[];
      incompleteObjectivesMustContainExact: string[];
      legacyDispositionMustContainEachExact: string[];
    };
  };
  assert.equal(runtime.authorityBoundary, "PROPOSAL_ONLY_NO_FORMAL_WRITE");
  assert.deepEqual(runtime.exactReadScope.map(({ id, version }) => `${id}@${version}`), [
    "decision-rollback@2",
    "project-closure@4",
    "task-history@5",
    "task-rehearsal@3",
  ]);
  assert.deepEqual(runtime.exactModifyScope, [{ kind: "OBJECT", id: "project-closure", version: 4 }]);
  assert.deepEqual(runtime.groundingContract, {
    originalGoalMustEqualOneOf: ["稳定发布"],
    majorDeliverablesMayOnlyUseExact: ["发布手册"],
    keyDecisionsMayOnlyUseExact: ["保留回退开关"],
    incompleteObjectivesMustContainExact: ["稳定发布"],
    legacyDispositionMustContainEachExact: ["补齐历史回放"],
  });
});

test("Closure Provider refuses missing required evidence before a model call can be assembled", () => {
  const value = evidence();
  value.decisionCandidates = [];
  assert.throws(
    () => buildProjectClosureProposalPrompt({ evidence: value, coreSkill, designProjectSkill: designSkill }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "PROJECT_CLOSURE_PROVIDER_EVIDENCE_INSUFFICIENT",
  );
});

test("Closure Provider accepts only the exact HIGH two-operation Project shape", () => {
  const value = evidence();
  assert.equal(validateGeneratedProjectClosureProposal(proposal(), value).proposalId, "prop-closure-provider");
  const outside = proposal();
  outside.scope.read.push({ kind: "OBJECT", id: "outside", version: 1 });
  assert.throws(
    () => validateGeneratedProjectClosureProposal(outside, value),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PROJECT_CLOSURE_PROVIDER_SCOPE_INVALID",
  );
  const extraOperation = proposal();
  extraOperation.groups[0]!.semanticOperations.push({
    operationId: "change-owner",
    kind: "CHANGE_OWNERSHIP",
    target: { kind: "OBJECT", id: "task-history", version: 5 },
    summary: "不得发生",
    payload: { ownerObjectId: "outside" },
    preconditions: [],
  });
  assert.throws(
    () => validateGeneratedProjectClosureProposal(extraOperation, value),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PROJECT_CLOSURE_PROVIDER_SHAPE_INVALID",
  );
});

test("Closure Provider grounds deliverables, decisions, and unresolved Objective dispositions in machine evidence", () => {
  const value = evidence();
  const inventedDecision = proposal();
  const inventedDecisionClosure = inventedDecision.groups[0]!.semanticOperations[0]!.payload.closure as {
    keyDecisions: string[];
  };
  inventedDecisionClosure.keyDecisions = ["模型补写的决定"];
  assert.throws(
    () => validateGeneratedProjectClosureProposal(inventedDecision, value),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "PROJECT_CLOSURE_PROVIDER_DECISION_UNGROUNDED",
  );

  const inventedDeliverable = proposal();
  const inventedDeliverableClosure = inventedDeliverable.groups[0]!.semanticOperations[0]!.payload.closure as {
    majorDeliverables: string[];
  };
  inventedDeliverableClosure.majorDeliverables = ["模型补写的交付物"];
  assert.throws(
    () => validateGeneratedProjectClosureProposal(inventedDeliverable, value),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "PROJECT_CLOSURE_PROVIDER_DELIVERABLE_UNGROUNDED",
  );

  const inferredObjectiveCompletion = proposal();
  const inferredObjectiveClosure = inferredObjectiveCompletion.groups[0]!.semanticOperations[0]!.payload.closure as {
    incompleteObjectives: unknown[];
  };
  inferredObjectiveClosure.incompleteObjectives = [];
  assert.throws(
    () => validateGeneratedProjectClosureProposal(inferredObjectiveCompletion, value),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "PROJECT_CLOSURE_PROVIDER_OBJECTIVE_DISPOSITION_MISSING",
  );

  const droppedUnresolvedWork = proposal();
  const droppedUnresolvedClosure = droppedUnresolvedWork.groups[0]!.semanticOperations[0]!.payload.closure as {
    incompleteObjectives: Array<{ objective: string; reason: string; nextStep: string }>;
    legacyDisposition: string;
    futureSummary: string;
  };
  droppedUnresolvedClosure.incompleteObjectives = [{
    objective: "稳定发布",
    reason: "Objective 完成仍需用户确认",
    nextStep: "在 HIGH Review 中确认 disposition",
  }];
  droppedUnresolvedClosure.legacyDisposition = "没有遗留事项。";
  droppedUnresolvedClosure.futureSummary = "重入时核对发布状态。";
  assert.throws(
    () => validateGeneratedProjectClosureProposal(droppedUnresolvedWork, value),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "PROJECT_CLOSURE_PROVIDER_UNRESOLVED_WORK_DROPPED",
  );
});
