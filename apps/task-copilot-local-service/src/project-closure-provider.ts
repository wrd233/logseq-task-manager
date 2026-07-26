import type { ProjectClosureEvidenceDraft } from "@task-copilot/application";
import type { V2ProjectClosure, V2Proposal, V2ProposalScopeTarget } from "@task-copilot/domain";
import { StructuredError, stableJson } from "@task-copilot/shared";

import type { V2PromptBundle } from "./llm-proposal.ts";
import type { TaskCopilotSkillDocument } from "./skill-catalog.ts";

function closureProviderError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-127", "D-130", "D-207", "D-220"] });
}

export interface ProjectClosureUserJudgments {
  actualResult: string;
  objectiveDispositions: Array<
    | { objectiveId: string; disposition: "COMPLETED" }
    | { objectiveId: string; disposition: "INCOMPLETE"; reason: string; nextStep: string }
  >;
  legacyDisposition: string;
  keyDecisions: string[];
  futureSummary: string;
}

type ObjectScopeTarget = V2ProposalScopeTarget & { kind: "OBJECT"; version: number };

function objectScopeFromRef(sourceRef: string): ObjectScopeTarget | undefined {
  const match = sourceRef.match(/^object:([A-Za-z0-9][A-Za-z0-9._:-]{0,127})@v([1-9][0-9]*)(?:#|$)/);
  if (!match?.[1] || !match[2]) return undefined;
  return { kind: "OBJECT", id: match[1], version: Number(match[2]) };
}

export function projectClosureEvidenceScope(evidence: ProjectClosureEvidenceDraft): ObjectScopeTarget[] {
  const refs = [
    ...evidence.project.sourceRefs,
    ...evidence.goalCandidates.flatMap(({ sourceRefs }) => sourceRefs),
    ...evidence.deliverableCandidates.flatMap(({ sourceRefs }) => sourceRefs),
    ...evidence.decisionCandidates.flatMap(({ sourceRefs }) => sourceRefs),
    ...evidence.completedWorkCandidates.flatMap(({ sourceRefs }) => sourceRefs),
    ...evidence.unresolvedWork.flatMap(({ sourceRefs }) => sourceRefs),
    ...evidence.objectiveJudgments.flatMap(({ objective, evidence: items }) => [
      ...objective.sourceRefs,
      ...items.flatMap(({ sourceRefs }) => sourceRefs),
    ]),
  ];
  const byKey = new Map<string, ObjectScopeTarget>();
  for (const ref of refs) {
    const target = objectScopeFromRef(ref);
    if (target) byKey.set(`${target.id}@${target.version}`, target);
  }
  return [...byKey.values()].sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
}

function boundedJudgmentText(value: unknown, label: string, maximum = 4_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw closureProviderError("PROJECT_CLOSURE_USER_JUDGMENTS_INVALID", `${label}必须是非空有界文本。`);
  }
  return value.trim();
}

export function validateProjectClosureUserJudgments(
  value: ProjectClosureUserJudgments,
  evidence: ProjectClosureEvidenceDraft,
): ProjectClosureUserJudgments {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "actualResult,futureSummary,keyDecisions,legacyDisposition,objectiveDispositions"
    || !Array.isArray(value.objectiveDispositions)
    || !Array.isArray(value.keyDecisions)
    || value.keyDecisions.length === 0
    || value.keyDecisions.length > 16) {
    throw closureProviderError("PROJECT_CLOSURE_USER_JUDGMENTS_INVALID", "Closure 用户判断缺少必需字段或超出有界范围。");
  }
  const objectiveById = new Map(evidence.objectiveJudgments.map(({ objective }) => [objective.objectiveId, objective]));
  if (value.objectiveDispositions.length !== objectiveById.size) {
    throw closureProviderError("PROJECT_CLOSURE_USER_JUDGMENTS_INVALID", "每个 Objective 都必须且只能有一个用户 disposition。");
  }
  const seen = new Set<string>();
  const objectiveDispositions = value.objectiveDispositions.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || typeof item.objectiveId !== "string"
      || seen.has(item.objectiveId)
      || !objectiveById.has(item.objectiveId)) {
      throw closureProviderError("PROJECT_CLOSURE_USER_JUDGMENTS_INVALID", "Objective disposition identity 无效、重复或不属于当前证据。");
    }
    seen.add(item.objectiveId);
    if (item.disposition === "COMPLETED" && Object.keys(item).sort().join(",") === "disposition,objectiveId") {
      return { objectiveId: item.objectiveId, disposition: "COMPLETED" as const };
    }
    if (item.disposition === "INCOMPLETE" && Object.keys(item).sort().join(",") === "disposition,nextStep,objectiveId,reason") {
      return {
        objectiveId: item.objectiveId,
        disposition: "INCOMPLETE" as const,
        reason: boundedJudgmentText(item.reason, "未完成原因", 2_000),
        nextStep: boundedJudgmentText(item.nextStep, "未完成后续", 2_000),
      };
    }
    throw closureProviderError("PROJECT_CLOSURE_USER_JUDGMENTS_INVALID", "Objective disposition 只接受 COMPLETED 或带原因与后续的 INCOMPLETE。");
  });
  const keyDecisions = value.keyDecisions.map((text) => boundedJudgmentText(text, "关键 Decision", 1_000));
  if (new Set(keyDecisions).size !== keyDecisions.length) {
    throw closureProviderError("PROJECT_CLOSURE_USER_JUDGMENTS_INVALID", "关键 Decision 不能重复。");
  }
  const legacyDisposition = boundedJudgmentText(value.legacyDisposition, "遗留去向");
  if (evidence.unresolvedWork.some(({ text }) => !legacyDisposition.includes(text))) {
    throw closureProviderError("PROJECT_CLOSURE_USER_JUDGMENTS_INVALID", "遗留去向必须逐项保留当前正式未决工作。");
  }
  return {
    actualResult: boundedJudgmentText(value.actualResult, "实际结果"),
    objectiveDispositions,
    legacyDisposition,
    keyDecisions,
    futureSummary: boundedJudgmentText(value.futureSummary, "未来重入摘要"),
  };
}

export function buildProjectClosureProposalPrompt(input: {
  evidence: ProjectClosureEvidenceDraft;
  coreSkill: TaskCopilotSkillDocument;
  designProjectSkill: TaskCopilotSkillDocument;
  userJudgments?: ProjectClosureUserJudgments;
}): V2PromptBundle {
  const { evidence } = input;
  const userJudgments = input.userJudgments
    ? validateProjectClosureUserJudgments(input.userJudgments, evidence)
    : undefined;
  const missing = [
    ...(evidence.goalCandidates.length === 0 ? ["原目标证据"] : []),
    ...(evidence.deliverableCandidates.length === 0 ? ["主要交付证据"] : []),
    ...(!userJudgments && evidence.decisionCandidates.length === 0 ? ["关键 Decision 证据"] : []),
  ];
  if (missing.length) {
    throw closureProviderError(
      "PROJECT_CLOSURE_PROVIDER_EVIDENCE_INSUFFICIENT",
      `正式证据仍缺少${missing.join("、")}；没有调用 Copilot，也没有创建 Proposal。`,
    );
  }
  const exactReadScope = projectClosureEvidenceScope(evidence);
  const exactModifyScope = [{ kind: "OBJECT" as const, id: evidence.project.objectId, version: evidence.project.version }];
  const objectiveById = new Map(evidence.objectiveJudgments.map(({ objective }) => [objective.objectiveId, objective]));
  const incompleteObjectives = userJudgments
    ? userJudgments.objectiveDispositions
      .filter((item): item is Extract<typeof item, { disposition: "INCOMPLETE" }> => item.disposition === "INCOMPLETE")
      .map(({ objectiveId }) => objectiveById.get(objectiveId)!.text)
    : evidence.objectiveJudgments.map(({ objective }) => objective.text);
  const keyDecisions = userJudgments?.keyDecisions ?? evidence.decisionCandidates.map(({ text }) => text);
  return {
    core: { version: `${input.coreSkill.name}@${input.coreSkill.version}`, content: input.coreSkill.content },
    domain: {
      version: "project-closure-provider-domain-v4",
      content: [
        "Only draft one Project Closure Proposal for review.",
        "Return exactly one HIGH group with no text patches.",
        "The group contains exactly UPDATE_PROJECT_INTERFACE with payload.closure and TRANSITION_LIFECYCLE with lifecycle COMPLETED.",
        "Both operations target the exact Project Object version supplied by the machine.",
        "Do not create, move, rewrite, own, focus, close, or infer any other Object.",
        "Objective completion is never inferred from success-evidence text. Put every not-explicitly-complete Objective in incompleteObjectives with a cautious reason and next step.",
        "The runtime groundingContract is machine-enforced: copy its exact strings into the named Closure fields and include every required legacy string verbatim.",
        "If the evidence cannot support a truthful Closure, return NO_PROPOSAL.",
      ].join("\n"),
    },
    skill: { version: `${input.designProjectSkill.name}@${input.designProjectSkill.version}`, content: input.designProjectSkill.content },
    userSemantics: {
      version: "project-closure-user-semantics-v1",
      content: "Use concise Chinese. Separate formal evidence from cautious synthesis. Do not expose object IDs, hashes, machine keys, storage terms, or hidden reasoning in user-facing prose.",
    },
    runtimeContext: {
      version: `project-closure-evidence-v1:${evidence.evidenceScopeHash}`,
      content: stableJson({
        task: "DRAFT_PROJECT_CLOSURE_PROPOSAL_FOR_REVIEW",
        authorityBoundary: "PROPOSAL_ONLY_NO_FORMAL_WRITE",
        exactReadScope,
        exactModifyScope,
        exactOperations: [
          { operationId: "record-closure", kind: "UPDATE_PROJECT_INTERFACE", target: exactModifyScope[0] },
          { operationId: "complete-project", kind: "TRANSITION_LIFECYCLE", target: exactModifyScope[0], payload: { lifecycle: "COMPLETED" } },
        ],
        groundingContract: {
          originalGoalMustEqualOneOf: evidence.goalCandidates.map(({ text }) => text),
          majorDeliverablesMayOnlyUseExact: evidence.deliverableCandidates.map(({ text }) => text),
          keyDecisionsMayOnlyUseExact: keyDecisions,
          incompleteObjectivesMustContainExact: incompleteObjectives,
          legacyDispositionMustContainEachExact: evidence.unresolvedWork.map(({ text }) => text),
          ...(userJudgments ? {
            actualResultMustEqual: userJudgments.actualResult,
            keyDecisionsMustEqualExact: userJudgments.keyDecisions,
            legacyDispositionMustEqual: userJudgments.legacyDisposition,
            futureSummaryMustEqual: userJudgments.futureSummary,
          } : {}),
        },
        ...(userJudgments ? {
          userJudgments: { ...userJudgments, authority: "USER_CONFIRMED_FOR_REVIEW" },
        } : {}),
        evidence,
      }),
    },
  };
}

function sortedScope(targets: readonly V2ProposalScopeTarget[]): string {
  return stableJson([...targets].sort((left, right) =>
    left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
    || Number(left.version ?? 0) - Number(right.version ?? 0)
    || String(left.hash ?? "").localeCompare(String(right.hash ?? ""))));
}

export function validateGeneratedProjectClosureProposal(
  proposal: V2Proposal,
  evidence: ProjectClosureEvidenceDraft,
  userJudgments?: ProjectClosureUserJudgments,
): V2Proposal {
  const expectedTarget = { kind: "OBJECT" as const, id: evidence.project.objectId, version: evidence.project.version };
  const expectedRead = projectClosureEvidenceScope(evidence);
  if (proposal.source.kind !== "local_llm"
    || sortedScope(proposal.scope.read) !== sortedScope(expectedRead)
    || sortedScope(proposal.scope.modify) !== sortedScope([expectedTarget])
    || proposal.groups.length !== 1) {
    throw closureProviderError("PROJECT_CLOSURE_PROVIDER_SCOPE_INVALID", "Copilot 草稿超出正式 Closure 证据范围；没有进入审阅队列。");
  }
  const group = proposal.groups[0]!;
  const operations = group.semanticOperations;
  const recordClosure = operations.find(({ operationId }) => operationId === "record-closure");
  const completeProject = operations.find(({ operationId }) => operationId === "complete-project");
  const exactTarget = (target: V2ProposalScopeTarget): boolean =>
    target.kind === "OBJECT" && target.id === expectedTarget.id && target.version === expectedTarget.version;
  if (group.groupId !== "close-project"
    || group.risk !== "HIGH"
    || group.textPatches.length !== 0
    || operations.length !== 2
    || recordClosure?.kind !== "UPDATE_PROJECT_INTERFACE"
    || !exactTarget(recordClosure.target)
    || !("closure" in recordClosure.payload)
    || completeProject?.kind !== "TRANSITION_LIFECYCLE"
    || !exactTarget(completeProject.target)
    || completeProject.payload.lifecycle !== "COMPLETED") {
    throw closureProviderError("PROJECT_CLOSURE_PROVIDER_SHAPE_INVALID", "Copilot 草稿没有保持唯一、不可拆的 Project Closure 安全形状；没有进入审阅队列。");
  }
  const closure = recordClosure.payload.closure as V2ProjectClosure;
  const confirmed = userJudgments
    ? validateProjectClosureUserJudgments(userJudgments, evidence)
    : undefined;
  const goalCandidates = new Set(evidence.goalCandidates.map(({ text }) => text));
  const deliverableCandidates = new Set(evidence.deliverableCandidates.map(({ text }) => text));
  const decisionCandidates = new Set(confirmed?.keyDecisions ?? evidence.decisionCandidates.map(({ text }) => text));
  const unresolvedObjectives = new Set(closure.incompleteObjectives.map(({ objective }) => objective));
  if (!goalCandidates.has(closure.originalGoal)) {
    throw closureProviderError(
      "PROJECT_CLOSURE_PROVIDER_GOAL_UNGROUNDED",
      "Copilot Closure 改写或补写了原目标；没有进入审阅队列。",
    );
  }
  if (closure.majorDeliverables.some((text) => !deliverableCandidates.has(text))) {
    throw closureProviderError(
      "PROJECT_CLOSURE_PROVIDER_DELIVERABLE_UNGROUNDED",
      "Copilot Closure 改写或补写了主要交付；没有进入审阅队列。",
    );
  }
  if (closure.keyDecisions.some((text) => !decisionCandidates.has(text))) {
    throw closureProviderError(
      "PROJECT_CLOSURE_PROVIDER_DECISION_UNGROUNDED",
      "Copilot Closure 改写或补写了关键 Decision；没有进入审阅队列。",
    );
  }
  const objectiveById = new Map(evidence.objectiveJudgments.map(({ objective }) => [objective.objectiveId, objective]));
  const expectedUnresolvedObjectives = new Set(confirmed
    ? confirmed.objectiveDispositions
      .filter((item): item is Extract<typeof item, { disposition: "INCOMPLETE" }> => item.disposition === "INCOMPLETE")
      .map(({ objectiveId }) => objectiveById.get(objectiveId)!.text)
    : [...goalCandidates]);
  if (unresolvedObjectives.size !== expectedUnresolvedObjectives.size
    || [...expectedUnresolvedObjectives].some((text) => !unresolvedObjectives.has(text))) {
    throw closureProviderError(
      "PROJECT_CLOSURE_PROVIDER_OBJECTIVE_DISPOSITION_MISSING",
      "Copilot Closure 把尚未由用户确认完成的 Objective 静默移出了未完成清单；没有进入审阅队列。",
    );
  }
  const unresolvedDispositionText = [
    closure.legacyDisposition,
    closure.futureSummary,
    ...closure.incompleteObjectives.flatMap(({ objective, reason, nextStep }) => [objective, reason, nextStep]),
  ].join("\n");
  if (evidence.unresolvedWork.some(({ text }) => !unresolvedDispositionText.includes(text))) {
    throw closureProviderError(
      "PROJECT_CLOSURE_PROVIDER_UNRESOLVED_WORK_DROPPED",
      "Copilot Closure 没有逐项保留正式未决工作及其承接；没有进入审阅队列。",
    );
  }
  if (confirmed) {
    const expectedIncomplete = confirmed.objectiveDispositions
      .filter((item): item is Extract<typeof item, { disposition: "INCOMPLETE" }> => item.disposition === "INCOMPLETE")
      .map(({ objectiveId, reason, nextStep }) => ({
        objective: objectiveById.get(objectiveId)!.text,
        reason,
        nextStep,
      }));
    if (closure.actualResult !== confirmed.actualResult
      || stableJson(closure.incompleteObjectives) !== stableJson(expectedIncomplete)
      || closure.legacyDisposition !== confirmed.legacyDisposition
      || stableJson(closure.keyDecisions) !== stableJson(confirmed.keyDecisions)
      || closure.futureSummary !== confirmed.futureSummary) {
      throw closureProviderError(
        "PROJECT_CLOSURE_PROVIDER_USER_JUDGMENT_CHANGED",
        "Copilot 改写了用户已确认的 Closure 判断；没有进入审阅队列。",
      );
    }
  }
  return proposal;
}
