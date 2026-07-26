import type { ProjectClosureEvidenceDraft } from "@task-copilot/application";
import type { V2Proposal, V2ProposalScopeTarget } from "@task-copilot/domain";
import { StructuredError, stableJson } from "@task-copilot/shared";

import type { V2PromptBundle } from "./llm-proposal.ts";
import type { TaskCopilotSkillDocument } from "./skill-catalog.ts";

function closureProviderError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-127", "D-130", "D-207", "D-220"] });
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

export function buildProjectClosureProposalPrompt(input: {
  evidence: ProjectClosureEvidenceDraft;
  coreSkill: TaskCopilotSkillDocument;
  designProjectSkill: TaskCopilotSkillDocument;
}): V2PromptBundle {
  const { evidence } = input;
  const missing = [
    ...(evidence.goalCandidates.length === 0 ? ["原目标证据"] : []),
    ...(evidence.deliverableCandidates.length === 0 ? ["主要交付证据"] : []),
    ...(evidence.decisionCandidates.length === 0 ? ["关键 Decision 证据"] : []),
  ];
  if (missing.length) {
    throw closureProviderError(
      "PROJECT_CLOSURE_PROVIDER_EVIDENCE_INSUFFICIENT",
      `正式证据仍缺少${missing.join("、")}；没有调用 Copilot，也没有创建 Proposal。`,
    );
  }
  const exactReadScope = projectClosureEvidenceScope(evidence);
  const exactModifyScope = [{ kind: "OBJECT" as const, id: evidence.project.objectId, version: evidence.project.version }];
  return {
    core: { version: `${input.coreSkill.name}@${input.coreSkill.version}`, content: input.coreSkill.content },
    domain: {
      version: "project-closure-provider-domain-v1",
      content: [
        "Only draft one Project Closure Proposal for review.",
        "Return exactly one HIGH group with no text patches.",
        "The group contains exactly UPDATE_PROJECT_INTERFACE with payload.closure and TRANSITION_LIFECYCLE with lifecycle COMPLETED.",
        "Both operations target the exact Project Object version supplied by the machine.",
        "Do not create, move, rewrite, own, focus, close, or infer any other Object.",
        "Objective completion is never inferred from success-evidence text. Put every not-explicitly-complete Objective in incompleteObjectives with a cautious reason and next step.",
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
  return proposal;
}
