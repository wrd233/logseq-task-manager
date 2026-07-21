import type { AttentionSignal, ExecutionCondition, ObjectType, Phase } from "./index.ts";
import type { Lifecycle, V2Condition, V2ObjectType } from "./v2.ts";

const v2Types = new Set<V2ObjectType>(["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"]);
const progressPhases = new Set<Phase>(["CLARIFY", "READY", "ACTIVE", "CLOSING", "DEFINING", "IDEA", "PLANNED", "DORMANT", "RETIRED"]);

export interface LegacyMigrationEvidence {
  legacyObjectId: string;
  sourceBundleSha256: string;
  objectType: ObjectType;
  phase: Phase;
  condition: ExecutionCondition;
  signals: AttentionSignal[];
  evidenceRefs: string[];
  completionEvidenceConsistent?: boolean;
  cancellationEvidence?: boolean;
  archiveEvidence?: boolean;
  stateConflict?: string;
  explicitFocusEvidence?: string;
}

export interface LegacyMigrationPreview {
  legacyObjectId: string;
  sourceBundleSha256: string;
  classification: "DIRECT_BIND" | "NEEDS_CONFIRMATION" | "KEEP_ORDINARY" | "STRUCTURAL_ERROR";
  suggestedObjectType?: V2ObjectType;
  oldPhase: Phase;
  oldCondition: ExecutionCondition;
  oldSignals: AttentionSignal[];
  suggestedLifecycle?: Lifecycle;
  suggestedCondition?: V2Condition;
  suggestedFocus: { reason: string } | null;
  reasonCodes: string[];
  evidenceRefs: string[];
  informationLoss: string[];
  conflicts: string[];
  decision: "PENDING_REVIEW";
  rollbackRef: null;
}

function conditionPreview(condition: ExecutionCondition, reasons: string[], loss: string[], conflicts: string[]): V2Condition | undefined {
  switch (condition.kind) {
    case "ACTIONABLE":
      reasons.push("EXPLICIT_ACTIONABLE");
      return { kind: "ACTIONABLE" };
    case "NONE":
      reasons.push("LEGACY_CONDITION_NONE");
      loss.push("Legacy NONE does not prove that the object is actionable.");
      return undefined;
    case "WAITING":
      if (!condition.waitingFor.trim() || !condition.expectedResult.trim() || !Number.isFinite(Date.parse(condition.reviewAt))) {
        conflicts.push("WAITING_EVIDENCE_INCOMPLETE");
        loss.push("Waiting evidence is incomplete; no V2 Condition was suggested.");
        return undefined;
      }
      reasons.push("EXPLICIT_WAITING");
      return { kind: "WAITING", waitingFor: condition.waitingFor.trim(), expectedResult: condition.expectedResult.trim(), reviewAt: condition.reviewAt };
    case "BLOCKED":
      if (!condition.reason.trim()) {
        conflicts.push("BLOCKED_REASON_MISSING");
        return undefined;
      }
      reasons.push("EXPLICIT_BLOCKED");
      return { kind: "BLOCKED", reason: condition.reason.trim(), ...(condition.blockerObjectId?.trim() ? { blockerObjectId: condition.blockerObjectId.trim() } : {}) };
    case "PAUSED":
      if (!condition.reason.trim() || (condition.reviewAt !== undefined && !Number.isFinite(Date.parse(condition.reviewAt)))) {
        conflicts.push("PAUSED_EVIDENCE_INCOMPLETE");
        return undefined;
      }
      reasons.push("EXPLICIT_PAUSED");
      return { kind: "PAUSED", reason: condition.reason.trim(), ...(condition.reviewAt ? { reviewAt: condition.reviewAt } : {}) };
  }
}

export function previewLegacyStateMigration(evidence: LegacyMigrationEvidence): LegacyMigrationPreview {
  const reasonCodes: string[] = [];
  const informationLoss: string[] = [];
  const conflicts = evidence.stateConflict?.trim() ? [`STATE_CONFLICT:${evidence.stateConflict.trim()}`] : [];
  const suggestedObjectType = v2Types.has(evidence.objectType as V2ObjectType) ? evidence.objectType as V2ObjectType : undefined;
  if (!suggestedObjectType) {
    reasonCodes.push("OBJECT_TYPE_NOT_IN_V2");
    informationLoss.push(`${evidence.objectType} remains ordinary or historical content; it is not a V2 object type.`);
  }

  let suggestedLifecycle: Lifecycle | undefined;
  if (evidence.phase === "COMPLETED") {
    if (evidence.completionEvidenceConsistent === true) {
      suggestedLifecycle = "COMPLETED";
      reasonCodes.push("COMPLETION_EVIDENCE_CONSISTENT");
    } else conflicts.push("COMPLETION_EVIDENCE_REQUIRED");
  } else if (evidence.phase === "CANCELLED") {
    if (evidence.cancellationEvidence === true) {
      suggestedLifecycle = "CANCELLED";
      reasonCodes.push("EXPLICIT_CANCELLATION");
    } else conflicts.push("CANCELLATION_EVIDENCE_REQUIRED");
  } else if (evidence.phase === "ARCHIVED") {
    if (evidence.archiveEvidence === true) {
      suggestedLifecycle = "ARCHIVED";
      reasonCodes.push("EXPLICIT_ARCHIVE");
    } else conflicts.push("ARCHIVE_EVIDENCE_REQUIRED");
  } else if (progressPhases.has(evidence.phase)) {
    suggestedLifecycle = "OPEN";
    reasonCodes.push("PHASE_IS_PROGRESS_ONLY");
    informationLoss.push(`${evidence.phase} is retained only as legacy narrative, not as a V2 state axis.`);
  }

  const suggestedCondition = conditionPreview(evidence.condition, reasonCodes, informationLoss, conflicts);
  const signalReasons: Record<AttentionSignal, string> = {
    OVERDUE: "SIGNAL_RECOMPUTE_FROM_DUE_AT",
    REVIEW_DUE: "SIGNAL_RECOMPUTE_FROM_REVIEW_AT",
    STALE: "SIGNAL_RECOMPUTE_FROM_ACTIVITY",
    NO_NEXT_ACTION: "SIGNAL_RECOMPUTE_FROM_CONTENT",
    UNASSIGNED: "SIGNAL_UNASSIGNED_TO_OWNERSHIP_ISSUE",
    BOUNDARY_DRIFT: "SIGNAL_BOUNDARY_DRIFT_TO_MIGRATION_ISSUE",
    UNHARVESTED_OUTPUT: "SIGNAL_UNHARVESTED_OUTPUT_TO_MIGRATION_CANDIDATE",
    CONFLICT: "SIGNAL_CONFLICT_TO_MIGRATION_ISSUE",
  };
  for (const signal of [...new Set(evidence.signals)].sort()) reasonCodes.push(signalReasons[signal]);
  if (evidence.signals.length > 0) informationLoss.push("Legacy Signals are recomputed or reported as issues; none are persisted as V2 state.");

  const suggestedFocus = evidence.explicitFocusEvidence?.trim() ? { reason: evidence.explicitFocusEvidence.trim() } : null;
  if (suggestedFocus) reasonCodes.push("EXPLICIT_FOCUS_CANDIDATE");
  if (evidence.phase === "ACTIVE" && !suggestedFocus) reasonCodes.push("ACTIVE_DOES_NOT_IMPLY_FOCUS");

  const classification = !suggestedObjectType
    ? "KEEP_ORDINARY"
    : conflicts.length > 0
      ? "STRUCTURAL_ERROR"
      : suggestedLifecycle && suggestedCondition
        ? "DIRECT_BIND"
        : "NEEDS_CONFIRMATION";
  return {
    legacyObjectId: evidence.legacyObjectId,
    sourceBundleSha256: evidence.sourceBundleSha256,
    classification,
    ...(suggestedObjectType ? { suggestedObjectType } : {}),
    oldPhase: evidence.phase,
    oldCondition: evidence.condition,
    oldSignals: [...new Set(evidence.signals)].sort(),
    ...(suggestedLifecycle ? { suggestedLifecycle } : {}),
    ...(suggestedCondition ? { suggestedCondition } : {}),
    suggestedFocus,
    reasonCodes: [...new Set(reasonCodes)],
    evidenceRefs: [...new Set(evidence.evidenceRefs)].sort(),
    informationLoss: [...new Set(informationLoss)],
    conflicts,
    decision: "PENDING_REVIEW",
    rollbackRef: null,
  };
}
