export type WorkObjectKind = "TASK" | "MINI_PROJECT" | "PROJECT";
export type Lifecycle = "OPEN" | "COMPLETED" | "CANCELLED";
export type Engagement = "ACTIONABLE" | "WAITING" | "PARKED" | null;
export interface DomainActor { type: "USER" | "SYSTEM" | "AGENT"; id: string }

export interface WaitingCondition {
  workObjectId: string;
  description: string;
  since: string;
  reviewAt: string | null;
  evidenceIds: readonly string[];
}

export interface WorkObject {
  id: string;
  kind: WorkObjectKind;
  title: string;
  lifecycle: Lifecycle;
  engagement: Engagement;
  waitingCondition: WaitingCondition | null;
  currentFocus: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrimaryAnchor {
  id: string;
  workObjectId: string;
  graphId: string;
  externalId: string;
  sourceContentHash: string;
  projectionContainerUuid: string;
  projectionTitleUuid: string;
  projectionStateUuid: string;
  projectionFocusUuid: string;
  projectionWaitingUuid: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceReference {
  id: string;
  workObjectId: string;
  graphId: string;
  externalId: string;
  sourceType: "LOGSEQ_BLOCK";
  frozenContent: string;
  contentHash: string;
  locator: { graphId: string; blockUuid: string };
  createdAt: string;
}

export interface CompletionRecord {
  id: string;
  workObjectId: string;
  completedAt: string;
  outcomeSummary: string;
  evidenceIds: readonly string[];
  createdBy: DomainActor;
}

export interface CancellationRecord {
  id: string;
  workObjectId: string;
  cancelledAt: string;
  reason: string;
  replacementWorkObjectId: string | null;
  remainingWorkNote: string | null;
  evidenceIds: readonly string[];
  createdBy: DomainActor;
}

export type ClosureRecord = CompletionRecord | CancellationRecord;

export interface ClosureAmendment {
  id: string;
  workObjectId: string;
  targetClosureRecordId: string;
  reason: string;
  replacementOutcomeSummary: string | null;
  replacementCancellationReason: string | null;
  addEvidenceIds: readonly string[];
  amendedAt: string;
  createdBy: DomainActor;
}

export interface ReopenRecord {
  id: string;
  workObjectId: string;
  previousClosureType: "COMPLETED" | "CANCELLED";
  previousClosureRecordId: string;
  reason: string;
  reopenedAt: string;
  createdBy: DomainActor;
}

export interface PrimaryOwnership {
  childId: string;
  ownerId: string;
  createdAt: string;
}

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "DomainError";
    this.code = code;
  }
}

const kinds = new Set<WorkObjectKind>(["TASK", "MINI_PROJECT", "PROJECT"]);

function required(value: string, code: string, label: string, maximum = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new DomainError(code, `${label} is required.`);
  if (normalized.length > maximum) throw new DomainError(`${code}_TOO_LONG`, `${label} exceeds ${maximum} characters.`);
  return normalized;
}

function timestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new DomainError("TIMESTAMP_INVALID", "Timestamp must be ISO-compatible.");
  return new Date(value).toISOString();
}

function actor(value: DomainActor): DomainActor {
  if (value.type !== "USER" && value.type !== "SYSTEM" && value.type !== "AGENT") throw new DomainError("ACTOR_TYPE_INVALID", "Actor type is unsupported.");
  return { type: value.type, id: required(value.id, "ACTOR_ID_REQUIRED", "Actor id", 128) };
}

function evidenceIds(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((id) => required(id, "CLOSURE_EVIDENCE_ID_REQUIRED", "Closure Evidence id", 128)))];
}

function assertTaskOpen(object: WorkObject, expectedVersion: number): void {
  if (object.version !== expectedVersion) throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${expectedVersion}, found ${object.version}.`);
  if (object.kind !== "TASK") throw new DomainError("TASK_CLOSURE_KIND_UNSUPPORTED", "Phase 5 Closure supports Task only.");
  if (object.lifecycle !== "OPEN") throw new DomainError("CLOSURE_LIFECYCLE_INVALID", "Only an open Task may be completed or cancelled.");
}

function terminalObject(object: WorkObject, lifecycle: "COMPLETED" | "CANCELLED", at: string): WorkObject {
  return { ...object, lifecycle, engagement: null, waitingCondition: null, currentFocus: null, version: object.version + 1, updatedAt: at };
}

export function completeWorkObject(object: WorkObject, input: { recordId: string; actor: DomainActor; outcomeSummary: string; evidenceIds: readonly string[]; expectedVersion: number; at: string }): { object: WorkObject; record: CompletionRecord } {
  assertTaskOpen(object, input.expectedVersion);
  const at = timestamp(input.at);
  const record: CompletionRecord = { id: required(input.recordId, "COMPLETION_RECORD_ID_REQUIRED", "Completion record id", 128), workObjectId: object.id, completedAt: at, outcomeSummary: required(input.outcomeSummary, "COMPLETION_OUTCOME_REQUIRED", "Completion outcome", 500), evidenceIds: evidenceIds(input.evidenceIds), createdBy: actor(input.actor) };
  return { object: terminalObject(object, "COMPLETED", at), record };
}

export function cancelWorkObject(object: WorkObject, input: { recordId: string; actor: DomainActor; reason: string; replacementWorkObjectId: string | null; remainingWorkNote: string | null; evidenceIds: readonly string[]; expectedVersion: number; at: string }): { object: WorkObject; record: CancellationRecord } {
  assertTaskOpen(object, input.expectedVersion);
  const at = timestamp(input.at);
  const record: CancellationRecord = {
    id: required(input.recordId, "CANCELLATION_RECORD_ID_REQUIRED", "Cancellation record id", 128), workObjectId: object.id, cancelledAt: at,
    reason: required(input.reason, "CANCELLATION_REASON_REQUIRED", "Cancellation reason", 500),
    replacementWorkObjectId: input.replacementWorkObjectId === null ? null : required(input.replacementWorkObjectId, "REPLACEMENT_WORK_OBJECT_ID_REQUIRED", "Replacement WorkObject id", 128),
    remainingWorkNote: input.remainingWorkNote?.trim() || null, evidenceIds: evidenceIds(input.evidenceIds), createdBy: actor(input.actor),
  };
  return { object: terminalObject(object, "CANCELLED", at), record };
}

export function reopenWorkObject(object: WorkObject, input: { recordId: string; previousClosureRecordId: string; actor: DomainActor; reason: string; expectedVersion: number; at: string }): { object: WorkObject; record: ReopenRecord } {
  if (object.version !== input.expectedVersion) throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  if (object.kind !== "TASK") throw new DomainError("TASK_CLOSURE_KIND_UNSUPPORTED", "Phase 5 Reopen supports Task only.");
  if (object.lifecycle !== "COMPLETED" && object.lifecycle !== "CANCELLED") throw new DomainError("REOPEN_LIFECYCLE_INVALID", "Only a completed or cancelled Task may be reopened.");
  const at = timestamp(input.at);
  const record: ReopenRecord = { id: required(input.recordId, "REOPEN_RECORD_ID_REQUIRED", "Reopen record id", 128), workObjectId: object.id, previousClosureType: object.lifecycle, previousClosureRecordId: required(input.previousClosureRecordId, "PREVIOUS_CLOSURE_RECORD_ID_REQUIRED", "Previous closure record id", 128), reason: required(input.reason, "REOPEN_REASON_REQUIRED", "Reopen reason", 500), reopenedAt: at, createdBy: actor(input.actor) };
  return { object: { ...object, lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, version: object.version + 1, updatedAt: at }, record };
}

export function amendClosure(target: ClosureRecord, input: { amendmentId: string; workObjectId: string; actor: DomainActor; reason: string; replacementOutcomeSummary?: string; replacementCancellationReason?: string; addEvidenceIds: readonly string[]; at: string }): ClosureAmendment {
  if (target.workObjectId !== input.workObjectId) throw new DomainError("CLOSURE_SUBJECT_MISMATCH", "Closure record belongs to another WorkObject.");
  const completion = "completedAt" in target;
  if (completion && input.replacementCancellationReason !== undefined) throw new DomainError("CLOSURE_AMENDMENT_TYPE_INVALID", "Completion cannot receive a cancellation reason.");
  if (!completion && input.replacementOutcomeSummary !== undefined) throw new DomainError("CLOSURE_AMENDMENT_TYPE_INVALID", "Cancellation cannot receive an outcome summary.");
  const replacementOutcomeSummary = input.replacementOutcomeSummary === undefined ? null : required(input.replacementOutcomeSummary, "COMPLETION_OUTCOME_REQUIRED", "Completion outcome", 500);
  const replacementCancellationReason = input.replacementCancellationReason === undefined ? null : required(input.replacementCancellationReason, "CANCELLATION_REASON_REQUIRED", "Cancellation reason", 500);
  const additions = evidenceIds(input.addEvidenceIds);
  if (!replacementOutcomeSummary && !replacementCancellationReason && !additions.length) throw new DomainError("CLOSURE_AMENDMENT_EMPTY", "Closure amendment must change narrative or add Evidence.");
  return { id: required(input.amendmentId, "CLOSURE_AMENDMENT_ID_REQUIRED", "Closure amendment id", 128), workObjectId: target.workObjectId, targetClosureRecordId: target.id, reason: required(input.reason, "CLOSURE_AMENDMENT_REASON_REQUIRED", "Closure amendment reason", 500), replacementOutcomeSummary, replacementCancellationReason, addEvidenceIds: additions, amendedAt: timestamp(input.at), createdBy: actor(input.actor) };
}

export function advanceClosureAmendment(object: WorkObject, input: { expectedVersion: number; at: string }): WorkObject {
  if (object.version !== input.expectedVersion) throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  if (object.kind !== "TASK") throw new DomainError("TASK_CLOSURE_KIND_UNSUPPORTED", "Phase 5 Closure Amendment supports Task only.");
  if (object.lifecycle !== "COMPLETED" && object.lifecycle !== "CANCELLED") throw new DomainError("CLOSURE_AMENDMENT_LIFECYCLE_INVALID", "Only a currently closed Task may receive a Closure Amendment.");
  return { ...object, version: object.version + 1, updatedAt: timestamp(input.at) };
}

export function restoreWorkObject(object: WorkObject, input: { previous: WorkObject; expectedVersion: number; at: string }): WorkObject {
  if (object.version !== input.expectedVersion) throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  if (object.id !== input.previous.id) throw new DomainError("WORK_OBJECT_RESTORE_SUBJECT_MISMATCH", "Restore state belongs to another WorkObject.");
  return { ...input.previous, waitingCondition: input.previous.waitingCondition ? { ...input.previous.waitingCondition, evidenceIds: [...input.previous.waitingCondition.evidenceIds] } : null, version: object.version + 1, updatedAt: timestamp(input.at) };
}

export function createWorkObject(input: {
  id: string;
  kind: WorkObjectKind;
  title: string;
  at: string;
}): WorkObject {
  if (!kinds.has(input.kind)) throw new DomainError("WORK_OBJECT_KIND_INVALID", "WorkObject kind is not supported.");
  const at = timestamp(input.at);
  return {
    id: required(input.id, "WORK_OBJECT_ID_REQUIRED", "WorkObject id", 128),
    kind: input.kind,
    title: required(input.title, "WORK_OBJECT_TITLE_REQUIRED", "WorkObject title"),
    lifecycle: "OPEN",
    engagement: "ACTIONABLE",
    waitingCondition: null,
    currentFocus: null,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

export function changeEngagement(
  object: WorkObject,
  input: {
    from: "ACTIONABLE" | "WAITING";
    to: "ACTIONABLE" | "WAITING";
    waiting: { description: string; reviewAt: string | null; evidenceIds: readonly string[] } | null;
    expectedVersion: number;
    at: string;
  },
): WorkObject {
  if (object.version !== input.expectedVersion) {
    throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  }
  if (object.lifecycle !== "OPEN") throw new DomainError("ENGAGEMENT_LIFECYCLE_INVALID", "Only open WorkObjects may change engagement.");
  if (object.engagement !== input.from) throw new DomainError("ENGAGEMENT_FROM_MISMATCH", `Expected ${input.from}, found ${object.engagement}.`);
  if (!((input.from === "ACTIONABLE" && input.to === "WAITING") || (input.from === "WAITING" && input.to === "ACTIONABLE"))) {
    throw new DomainError("ENGAGEMENT_TRANSITION_UNSUPPORTED", "Only ACTIONABLE to WAITING and WAITING to ACTIONABLE are supported.");
  }
  const at = timestamp(input.at);
  if (input.to === "WAITING") {
    if (!input.waiting) throw new DomainError("WAITING_CONDITION_REQUIRED", "WAITING requires a current WaitingCondition.");
    const evidenceIds = [...new Set(input.waiting.evidenceIds.map((id) => required(id, "WAITING_EVIDENCE_ID_REQUIRED", "Waiting Evidence id", 128)))];
    if (!evidenceIds.length) throw new DomainError("WAITING_EVIDENCE_REQUIRED", "WAITING requires supporting Evidence.");
    const reviewAt = input.waiting.reviewAt === null ? null : timestamp(input.waiting.reviewAt);
    return {
      ...object,
      engagement: "WAITING",
      waitingCondition: {
        workObjectId: object.id,
        description: required(input.waiting.description, "WAITING_DESCRIPTION_REQUIRED", "Waiting description", 200),
        since: at,
        reviewAt,
        evidenceIds,
      },
      version: object.version + 1,
      updatedAt: at,
    };
  }
  if (input.waiting !== null) throw new DomainError("WAITING_CONDITION_FORBIDDEN", "ACTIONABLE cannot carry a current WaitingCondition.");
  if (!object.waitingCondition) throw new DomainError("WAITING_CONDITION_MISSING", "Current WAITING state has no WaitingCondition.");
  return { ...object, engagement: "ACTIONABLE", waitingCondition: null, version: object.version + 1, updatedAt: at };
}

export function restoreEngagement(
  object: WorkObject,
  input: { engagement: "ACTIONABLE" | "WAITING"; waitingCondition: WaitingCondition | null; expectedVersion: number; at: string },
): WorkObject {
  if (object.version !== input.expectedVersion) throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  if ((input.engagement === "WAITING") !== Boolean(input.waitingCondition)) throw new DomainError("WAITING_INVARIANT_INVALID", "WAITING and current WaitingCondition must exist together.");
  if (input.waitingCondition?.workObjectId !== undefined && input.waitingCondition.workObjectId !== object.id) throw new DomainError("WAITING_SUBJECT_MISMATCH", "WaitingCondition belongs to another WorkObject.");
  return { ...object, engagement: input.engagement, waitingCondition: input.waitingCondition ? { ...input.waitingCondition, evidenceIds: [...input.waitingCondition.evidenceIds] } : null, version: object.version + 1, updatedAt: timestamp(input.at) };
}

export function setCurrentFocus(
  object: WorkObject,
  input: { currentFocus: string | null; expectedVersion: number; at: string },
): WorkObject {
  if (object.version !== input.expectedVersion) {
    throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  }
  if (object.lifecycle !== "OPEN") throw new DomainError("CURRENT_FOCUS_LIFECYCLE_INVALID", "Only open WorkObjects may have a current focus.");
  const normalized = input.currentFocus?.trim() || null;
  if (normalized && normalized.length > 200) throw new DomainError("CURRENT_FOCUS_TOO_LONG", "Current focus exceeds 200 characters.");
  return { ...object, currentFocus: normalized, version: object.version + 1, updatedAt: timestamp(input.at) };
}

export function renameWorkObject(
  object: WorkObject,
  input: { title: string; expectedVersion: number; at: string },
): WorkObject {
  if (object.version !== input.expectedVersion) {
    throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  }
  return {
    ...object,
    title: required(input.title, "WORK_OBJECT_TITLE_REQUIRED", "WorkObject title"),
    version: object.version + 1,
    updatedAt: timestamp(input.at),
  };
}

export function createPrimaryOwnership(input: {
  childId: string;
  ownerId: string;
  at: string;
  objects: readonly WorkObject[];
  existing: readonly PrimaryOwnership[];
}): PrimaryOwnership {
  const childId = required(input.childId, "OWNERSHIP_CHILD_ID_REQUIRED", "Ownership child id", 128);
  const ownerId = required(input.ownerId, "OWNERSHIP_OWNER_ID_REQUIRED", "Ownership owner id", 128);
  const objects = new Map(input.objects.map((object) => [object.id, object]));
  const child = objects.get(childId);
  const owner = objects.get(ownerId);
  if (!child || !owner) throw new DomainError("OWNERSHIP_OBJECT_NOT_FOUND", "Ownership endpoints must be existing WorkObjects.");
  if (childId === ownerId) throw new DomainError("OWNERSHIP_SELF_REFERENCE", "A WorkObject cannot own itself.");
  if (input.existing.some((ownership) => ownership.childId === childId)) throw new DomainError("OWNERSHIP_ALREADY_ASSIGNED", "A WorkObject may have at most one Primary Owner.");
  const kindAllowed = (owner.kind === "PROJECT" && child.kind !== "PROJECT") || (owner.kind === "MINI_PROJECT" && child.kind === "TASK");
  if (!kindAllowed) throw new DomainError("OWNERSHIP_KIND_INVALID", "Only Project to MiniProject or Task, and MiniProject to Task ownership is allowed.");

  const ownerByChild = new Map(input.existing.map((ownership) => [ownership.childId, ownership.ownerId]));
  ownerByChild.set(childId, ownerId);
  const seen = new Set<string>([childId]);
  let cursor: string | undefined = childId;
  let depth = 0;
  while ((cursor = ownerByChild.get(cursor)) !== undefined) {
    if (seen.has(cursor)) throw new DomainError("OWNERSHIP_CYCLE", "Primary Ownership must be acyclic.");
    seen.add(cursor);
    depth += 1;
    if (depth > 2) throw new DomainError("OWNERSHIP_DEPTH_EXCEEDED", "Primary Ownership may be at most Project to MiniProject to Task deep.");
  }
  return { childId, ownerId, createdAt: timestamp(input.at) };
}
