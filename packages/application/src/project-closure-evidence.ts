import type {
  V2Condition,
  V2ManagedObject,
  V2PrimaryOwnership,
  V2ProjectObjective,
} from "@task-copilot/domain";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

export interface ProjectClosureEvidenceSource {
  project: V2ManagedObject;
  expectedVersion: number;
  objects: readonly V2ManagedObject[];
  ownerships: readonly V2PrimaryOwnership[];
}

export interface ProjectClosureEvidenceItem {
  text: string;
  sourceRefs: string[];
  evidenceKind: "PROJECT_STRUCTURE" | "OWNED_OBJECT";
}

export interface ProjectClosureObjectiveJudgment {
  objective: {
    objectiveId: string;
    text: string;
    priority: V2ProjectObjective["priority"];
    sourceRefs: string[];
  };
  evidence: ProjectClosureEvidenceItem[];
  disposition: "NEEDS_USER_JUDGMENT";
}

export type ProjectClosureUserJudgment =
  | "ORIGINAL_GOAL"
  | "ACTUAL_RESULT"
  | "OBJECTIVE_DISPOSITIONS"
  | "LEGACY_DISPOSITION"
  | "KEY_DECISIONS"
  | "FUTURE_SUMMARY";

export interface ProjectClosureEvidenceDraft {
  schemaVersion: "task-copilot-project-closure-evidence-v1";
  project: {
    objectId: string;
    version: number;
    text: string;
    currentSummary: string;
    sourceRefs: string[];
  };
  goalCandidates: ProjectClosureEvidenceItem[];
  deliverableCandidates: ProjectClosureEvidenceItem[];
  decisionCandidates: ProjectClosureEvidenceItem[];
  completedWorkCandidates: ProjectClosureEvidenceItem[];
  unresolvedWork: Array<ProjectClosureEvidenceItem & { condition: string; lifecycle: V2ManagedObject["lifecycle"] }>;
  objectiveJudgments: ProjectClosureObjectiveJudgment[];
  userJudgments: Array<{ judgment: ProjectClosureUserJudgment; reason: string }>;
  unknowns: Array<{
    code:
      | "ORIGINAL_GOAL_UNKNOWN"
      | "DELIVERABLE_EVIDENCE_MISSING"
      | "KEY_DECISION_EVIDENCE_MISSING"
      | "OBJECTIVE_COMPLETION_NOT_INFERRED"
      | "ACTUAL_RESULT_REQUIRES_CONFIRMATION";
    text: string;
  }>;
  evidenceScopeHash: string;
  authorityBoundary: "READ_ONLY_EVIDENCE_DRAFT";
}

function closureEvidenceError(code: string, message: string): StructuredError {
  return new StructuredError({
    code,
    message,
    ruleRefs: ["D-047", "D-207", "D-220"],
  });
}

function objectRef(object: V2ManagedObject): string {
  return `object:${object.objectId}@v${object.version}`;
}

function structureRef(project: V2ManagedObject, field: string, id?: string): string {
  return `${objectRef(project)}#project-structure/${field}${id ? `/${id}` : ""}`;
}

function ownedItem(object: V2ManagedObject): ProjectClosureEvidenceItem {
  return {
    text: object.text,
    sourceRefs: [objectRef(object)],
    evidenceKind: "OWNED_OBJECT",
  };
}

function conditionText(condition: V2Condition): string {
  if (condition.kind === "ACTIONABLE") return "可以行动";
  if (condition.kind === "WAITING") return `等待：${condition.waitingFor}；期待：${condition.expectedResult}`;
  if (condition.kind === "BLOCKED") return `被阻碍：${condition.reason}`;
  return `已暂停：${condition.reason}`;
}

function sortObjects(objects: readonly V2ManagedObject[]): V2ManagedObject[] {
  return [...objects].sort((left, right) =>
    left.objectType.localeCompare(right.objectType)
    || left.text.localeCompare(right.text)
    || left.objectId.localeCompare(right.objectId));
}

function userJudgment(judgment: ProjectClosureUserJudgment, reason: string): {
  judgment: ProjectClosureUserJudgment;
  reason: string;
} {
  return { judgment, reason };
}

export function buildProjectClosureEvidenceDraft(
  source: ProjectClosureEvidenceSource,
): ProjectClosureEvidenceDraft {
  const { project } = source;
  if (project.objectType !== "PROJECT") {
    throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_PROJECT_REQUIRED", "Closure evidence 只接受正式 Project。");
  }
  if (project.lifecycle !== "OPEN") {
    throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_OPEN_REQUIRED", "只有 OPEN Project 可以起草 Closure evidence。");
  }
  if (project.version !== source.expectedVersion) {
    throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_STALE", "Project 已变化；Closure evidence 没有生成。");
  }
  if (!project.projectStructure) {
    throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_STRUCTURE_REQUIRED", "Project 当前接口缺失；不能从空白状态猜测 Closure。");
  }
  if (source.objects.length > 256 || source.ownerships.length > 512) {
    throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_SCOPE_TOO_LARGE", "Closure evidence 范围超过有界上限。");
  }

  const objectById = new Map<string, V2ManagedObject>();
  for (const object of source.objects) {
    if (objectById.has(object.objectId)) {
      throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_DUPLICATE_OBJECT", "Closure evidence 包含重复 Object identity。");
    }
    objectById.set(object.objectId, object);
  }
  const currentProject = objectById.get(project.objectId);
  if (!currentProject || currentProject.version !== project.version || currentProject.objectType !== "PROJECT") {
    throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_PROJECT_MISMATCH", "Closure evidence 中的 Project 投影不完整或版本不一致。");
  }

  const directOwnedIds = [...new Set(
    source.ownerships
      .filter(({ ownerObjectId }) => ownerObjectId === project.objectId)
      .map(({ childObjectId }) => childObjectId),
  )].sort();
  const directOwned = sortObjects(directOwnedIds.map((objectId) => {
    const object = objectById.get(objectId);
    if (!object) {
      throw closureEvidenceError("V2_PROJECT_CLOSURE_EVIDENCE_OBJECT_MISSING", "Primary Ownership 指向的 Object 缺失；没有猜测 Closure。");
    }
    return object;
  }));
  const structure = project.projectStructure;

  const goalCandidates = [...structure.objectives]
    .sort((left, right) =>
      (left.priority === right.priority ? 0 : left.priority === "PRIMARY" ? -1 : 1)
      || left.text.localeCompare(right.text)
      || left.objectiveId.localeCompare(right.objectiveId))
    .map((objective) => ({
      text: objective.text,
      sourceRefs: [structureRef(project, "objectives", objective.objectiveId)],
      evidenceKind: "PROJECT_STRUCTURE" as const,
    }));
  const structureDeliverables = structure.deliverables
    .filter(({ status }) => status === "AVAILABLE" || status === "ACCEPTED")
    .sort((left, right) => left.text.localeCompare(right.text) || left.deliverableId.localeCompare(right.deliverableId))
    .map((deliverable) => ({
      text: deliverable.text,
      sourceRefs: [structureRef(project, "deliverables", deliverable.deliverableId)],
      evidenceKind: "PROJECT_STRUCTURE" as const,
    }));
  const outputCandidates = directOwned
    .filter(({ objectType, lifecycle }) => objectType === "OUTPUT" && lifecycle !== "CANCELLED")
    .map(ownedItem);
  const decisionCandidates = directOwned
    .filter(({ objectType, lifecycle }) => objectType === "DECISION" && lifecycle !== "CANCELLED")
    .map(ownedItem);
  const completedWorkCandidates = directOwned
    .filter(({ objectType, lifecycle }) =>
      (objectType === "MINI_PROJECT" || objectType === "TASK") && lifecycle === "COMPLETED")
    .map(ownedItem);
  const unresolvedWork = directOwned
    .filter(({ objectType, lifecycle }) =>
      (objectType === "MINI_PROJECT" || objectType === "TASK") && lifecycle === "OPEN")
    .map((object) => ({
      ...ownedItem(object),
      condition: conditionText(object.condition),
      lifecycle: object.lifecycle,
    }));
  const objectiveJudgments: ProjectClosureObjectiveJudgment[] = structure.objectives
    .map((objective) => ({
      objective: {
        objectiveId: objective.objectiveId,
        text: objective.text,
        priority: objective.priority,
        sourceRefs: [structureRef(project, "objectives", objective.objectiveId)],
      },
      evidence: objective.successEvidence.map((text, index) => ({
        text,
        sourceRefs: [structureRef(project, "objective-evidence", `${objective.objectiveId}/${index + 1}`)],
        evidenceKind: "PROJECT_STRUCTURE" as const,
      })),
      disposition: "NEEDS_USER_JUDGMENT" as const,
    }))
    .sort((left, right) =>
      (left.objective.priority === right.objective.priority ? 0 : left.objective.priority === "PRIMARY" ? -1 : 1)
      || left.objective.text.localeCompare(right.objective.text)
      || left.objective.objectiveId.localeCompare(right.objective.objectiveId));

  const unknowns: ProjectClosureEvidenceDraft["unknowns"] = [
    {
      code: "ACTUAL_RESULT_REQUIRES_CONFIRMATION",
      text: "正式证据只能提供候选材料，实际结果仍需用户确认。",
    },
    ...(objectiveJudgments.length > 0 ? [{
      code: "OBJECTIVE_COMPLETION_NOT_INFERRED" as const,
      text: "Objective 没有独立完成状态；不得从成功证据文字或子对象状态推断完成。",
    }] : []),
    ...(goalCandidates.length === 0 ? [{
      code: "ORIGINAL_GOAL_UNKNOWN" as const,
      text: "当前 Project interface 没有 Objective，原始目标未知。",
    }] : []),
    ...(structureDeliverables.length + outputCandidates.length === 0 ? [{
      code: "DELIVERABLE_EVIDENCE_MISSING" as const,
      text: "没有 AVAILABLE/ACCEPTED Deliverable 或直接归属 Output 证据。",
    }] : []),
    ...(decisionCandidates.length === 0 ? [{
      code: "KEY_DECISION_EVIDENCE_MISSING" as const,
      text: "没有直接归属 Decision 证据；关键决定不能凭空补写。",
    }] : []),
  ];
  const userJudgments = [
    ...(goalCandidates.length === 0
      ? [userJudgment("ORIGINAL_GOAL", "需要从原文或用户确认中补齐原始目标。")]
      : []),
    userJudgment("ACTUAL_RESULT", "需要确认哪些候选证据真正构成实际结果。"),
    ...(objectiveJudgments.length > 0
      ? [userJudgment("OBJECTIVE_DISPOSITIONS", "每个 Objective 都需要明确完成或未完成及其后续。")]
      : []),
    userJudgment("LEGACY_DISPOSITION", "所有遗留工作需要明确去向。"),
    ...(decisionCandidates.length === 0
      ? [userJudgment("KEY_DECISIONS", "Closure 至少需要一个经确认的关键 Decision。")]
      : []),
    userJudgment("FUTURE_SUMMARY", "需要写出未来重入时真正有用的一段总结。"),
  ];

  const withoutHash = {
    schemaVersion: "task-copilot-project-closure-evidence-v1" as const,
    project: {
      objectId: project.objectId,
      version: project.version,
      text: project.text,
      currentSummary: structure.currentSummary,
      sourceRefs: [objectRef(project), structureRef(project, "current-summary")],
    },
    goalCandidates,
    deliverableCandidates: [...structureDeliverables, ...outputCandidates],
    decisionCandidates,
    completedWorkCandidates,
    unresolvedWork,
    objectiveJudgments,
    userJudgments,
    unknowns,
    authorityBoundary: "READ_ONLY_EVIDENCE_DRAFT" as const,
  };
  return {
    ...withoutHash,
    evidenceScopeHash: checksum(stableJson(withoutHash)),
  };
}
