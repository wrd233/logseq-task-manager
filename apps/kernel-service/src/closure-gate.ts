import type { ClosureAssessment, ClosureCheckAssessment, ClosureGateSnapshot, ClosureItemJudgment, ClosureReadiness, ClosureSemanticJudgment, ProjectIntent, WorkObject } from "@task-copilot/contracts";
import type { SqliteStore } from "@task-copilot/sqlite";

export interface OpenDescendant { id: string; title: string }

export function semanticRevisionFor(object: Pick<WorkObject, "kind" | "version">, projectIntentRevision: number | null): string {
  return object.kind === "PROJECT" ? `${object.version}:${projectIntentRevision ?? 0}` : String(object.version);
}

export function currentSemanticRevision(store: SqliteStore, workObjectId: string): string | null {
  const object = store.getWorkObject(workObjectId);
  if (!object) return null;
  return semanticRevisionFor(object, object.kind === "PROJECT" ? (store.getProjectIntent(workObjectId)?.revision ?? 0) : null);
}

export function listOpenDescendants(store: SqliteStore, workObjectId: string): OpenDescendant[] {
  const ownerships = store.listOwnerships();
  const objects = new Map(store.listWorkObjects().map((object) => [object.id, object]));
  const result: OpenDescendant[] = [];
  const queue = [workObjectId];
  while (queue.length) {
    const owner = queue.shift()!;
    for (const ownership of ownerships) {
      if (ownership.ownerId !== owner) continue;
      const child = objects.get(ownership.childId);
      if (!child) continue;
      if (child.lifecycle === "OPEN") result.push({ id: child.id, title: child.title });
      queue.push(child.id);
    }
  }
  return result;
}

export interface ClosureGate {
  pass: boolean;
  reasonCode: string | null;
  readiness: ClosureReadiness;
  blockers: string[];
  checks: ClosureCheckAssessment[];
  contradictionSummary: string | null;
  evidenceIds: string[];
}

/**
 * Stage 1 deterministic gate. It never calls a model and never decides that
 * Evidence semantically satisfies a Check/KR. When it blocks, the resulting
 * assessment is complete and durable; when it passes, a background semantic
 * assessment is required before READY can ever be produced.
 */
export function computeClosureGate(store: SqliteStore, object: WorkObject): ClosureGate {
  const conflict = store.listGovernanceIssues(object.id, "OPEN").find((issue) => issue.type === "CONFLICT") ?? null;
  const evidence = store.listEvidence(object.id);
  const evidenceIds = evidence.map((item) => item.id);
  if (conflict) {
    return { pass: false, reasonCode: "OPEN_CONFLICT_ISSUE", readiness: "CONFLICT", blockers: [conflict.summary], checks: [], contradictionSummary: conflict.summary, evidenceIds };
  }
  if (object.kind === "TASK") {
    return { pass: false, reasonCode: "TASK_LIFECYCLE", readiness: "READY", blockers: [], checks: [], contradictionSummary: null, evidenceIds };
  }
  const openChildren = listOpenDescendants(store, object.id);
  if (object.kind === "MINI_PROJECT") {
    if (!object.desiredOutcome && object.completionChecks.length === 0) {
      return { pass: false, reasonCode: "MISSING_WORK_INTENT", readiness: "UNKNOWN", blockers: ["这个子项目的最终结果还没有写清。"], checks: [], contradictionSummary: null, evidenceIds };
    }
    if (openChildren.length) {
      return { pass: false, reasonCode: "OPEN_DESCENDANTS", readiness: "NOT_READY", blockers: openChildren.map((child) => `${child.title} 还在进行。`), checks: [], contradictionSummary: null, evidenceIds };
    }
    if (!evidence.length) {
      return { pass: false, reasonCode: "NO_FROZEN_EVIDENCE", readiness: "UNKNOWN", blockers: ["还没有可分析的结果依据。"], checks: [], contradictionSummary: null, evidenceIds };
    }
    return { pass: true, reasonCode: null, readiness: "UNKNOWN", blockers: [], checks: [], contradictionSummary: null, evidenceIds };
  }
  const projectIntent = store.getProjectIntent(object.id);
  if (!projectIntent?.objective) {
    return { pass: false, reasonCode: "MISSING_PROJECT_INTENT", readiness: "UNKNOWN", blockers: ["项目目标还没有写清，无法判断是否完成。"], checks: [], contradictionSummary: null, evidenceIds };
  }
  if (openChildren.length) {
    return { pass: false, reasonCode: "OPEN_DESCENDANTS", readiness: "NOT_READY", blockers: openChildren.map((child) => `${child.title} 还在进行。`), checks: [], contradictionSummary: null, evidenceIds };
  }
  if (!evidence.length) {
    return { pass: false, reasonCode: "NO_FROZEN_EVIDENCE", readiness: "UNKNOWN", blockers: ["还没有可分析的结果依据。"], checks: [], contradictionSummary: null, evidenceIds };
  }
  return { pass: true, reasonCode: null, readiness: "UNKNOWN", blockers: [], checks: [], contradictionSummary: null, evidenceIds };
}

export function gateSnapshot(gate: ClosureGate): ClosureGateSnapshot {
  return { pass: gate.pass, reasonCode: gate.reasonCode, blockers: gate.blockers };
}

export function sameGate(left: ClosureGateSnapshot | null | undefined, right: ClosureGateSnapshot): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

export function deterministicClosureAssessment(store: SqliteStore, object: WorkObject, at: string): ClosureAssessment {
  const gate = computeClosureGate(store, object);
  return {
    workObjectId: object.id,
    kind: object.kind,
    readiness: gate.readiness,
    semanticRevision: semanticRevisionFor(object, object.kind === "PROJECT" ? (store.getProjectIntent(object.id)?.revision ?? 0) : null),
    evidenceWatermark: store.evidenceWatermark(object.id),
    assessedAt: at,
    blockers: gate.blockers,
    checks: gate.checks,
    contradictionSummary: gate.contradictionSummary,
    evidenceIds: gate.evidenceIds,
    provenance: "DETERMINISTIC",
    gate: gateSnapshot(gate),
    readinessChangedAt: null,
  };
}

interface ExpectedClosureItem { key: string; text: string }

/**
 * Stage 2 host aggregation. The model only interprets Evidence; this function
 * alone decides readiness. It never repairs semantics: invalid coverage or
 * invalid Evidence references throw; SATISFIED items without support become
 * UNKNOWN instead of borrowing evidence.
 */
export function aggregateClosureSemanticJudgment(input: {
  object: WorkObject;
  projectIntent: ProjectIntent | null;
  judgment: ClosureSemanticJudgment;
  allowedEvidenceIds: ReadonlySet<string>;
  semanticRevision: string;
  evidenceWatermark: number;
  at: string;
}): ClosureAssessment {
  const { object, projectIntent, judgment, allowedEvidenceIds } = input;
  const expected = expectedClosureItems(object, projectIntent);
  if (judgment.kind !== (object.kind === "PROJECT" ? "PROJECT" : "MINI_PROJECT")) throw new Error("CLOSURE_RESULT_KIND_MISMATCH");
  const byKey = new Map<string, ClosureItemJudgment>();
  for (const item of judgment.items) {
    if (byKey.has(item.key)) throw new Error("CLOSURE_RESULT_DUPLICATE_ITEM");
    byKey.set(item.key, item);
  }
  const checks: ClosureCheckAssessment[] = expected.map((item) => {
    const raw = byKey.get(item.key);
    if (!raw) throw new Error("CLOSURE_RESULT_ITEM_MISSING");
    if (raw.supportingEvidenceIds.some((id) => !allowedEvidenceIds.has(id))) throw new Error("CLOSURE_RESULT_EVIDENCE_REF_INVALID");
    const status = raw.status === "SATISFIED" && raw.supportingEvidenceIds.length === 0 ? "UNKNOWN" as const : raw.status;
    return { text: item.text, status, evidenceIds: raw.supportingEvidenceIds, rationale: raw.rationale };
  });
  const objectiveRequired = object.kind === "PROJECT" || Boolean(object.desiredOutcome);
  const contradictions = [
    ...checks.filter((check) => check.status === "CONTRADICTED").map((check) => `「${check.text}」与最新依据冲突`),
    ...(judgment.objectiveJudgment.objectiveContradiction ? [judgment.objectiveJudgment.objectiveContradiction] : []),
    ...(judgment.objectiveJudgment.outcomeContradiction ? [judgment.objectiveJudgment.outcomeContradiction] : []),
    ...(judgment.objectiveJudgment.scopeMismatch ? [judgment.objectiveJudgment.scopeMismatch] : []),
  ];
  let readiness: ClosureAssessment["readiness"];
  let blockers: string[] = [];
  if (contradictions.length) {
    readiness = "CONFLICT";
    blockers = [...new Set(contradictions)];
  } else if (checks.some((check) => check.status === "UNSATISFIED")) {
    readiness = "NOT_READY";
    blockers = checks.filter((check) => check.status === "UNSATISFIED").map((check) => `「${check.text}」尚未满足：${check.rationale || "缺少结果依据"}`);
  } else if (checks.some((check) => check.status === "UNKNOWN")) {
    readiness = "UNKNOWN";
    blockers = checks.filter((check) => check.status === "UNKNOWN").map((check) => `「${check.text}」还缺少可证明的依据：${check.rationale || "尚无支持证据"}`);
  } else if (!objectiveRequired) {
    readiness = "READY";
  } else if (judgment.objectiveJudgment.status === "CONTRADICTED") {
    readiness = "CONFLICT";
    blockers = [judgment.objectiveJudgment.objectiveContradiction ?? judgment.objectiveJudgment.summary ?? "结果与目标存在冲突"];
  } else if (judgment.objectiveJudgment.status === "UNSATISFIED") {
    readiness = "NOT_READY";
    blockers = [judgment.objectiveJudgment.summary || "结果边界已满足，但目标尚未兑现"];
  } else if (judgment.objectiveJudgment.status === "SATISFIED") {
    readiness = "READY";
  } else {
    readiness = "UNKNOWN";
    blockers = [judgment.objectiveJudgment.summary || "还无法确认目标已经兑现"];
  }
  const evidenceIds = [...new Set(checks.filter((check) => check.status === "SATISFIED").flatMap((check) => [...check.evidenceIds]))];
  return {
    workObjectId: object.id, kind: object.kind, readiness, semanticRevision: input.semanticRevision, evidenceWatermark: input.evidenceWatermark, assessedAt: input.at,
    blockers, checks, contradictionSummary: contradictions.length ? [...new Set(contradictions)].join("；") : null,
    evidenceIds, provenance: "AGENT",
    gate: { pass: true, reasonCode: null, blockers: [] },
    readinessChangedAt: null,
  };
}

function expectedClosureItems(object: WorkObject, projectIntent: ProjectIntent | null): ExpectedClosureItem[] {
  if (object.kind === "PROJECT") {
    return (projectIntent?.keyResults ?? []).map((kr, index) => ({ key: kr.id ?? `K${index}`, text: kr.text }));
  }
  return object.completionChecks.map((text, index) => ({ key: `C${index}`, text }));
}
