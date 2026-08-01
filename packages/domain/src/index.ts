import { StructuredError, createId } from "@task-copilot/shared";

export * from "./v2.ts";
export * from "./v2-proposal.ts";
export * from "./v2-candidate.ts";
export * from "./legacy-migration.ts";
export * from "./agent-governance.ts";
export * from "./agent-governance-gate.ts";
export * from "./agent-governance-context.ts";
export * from "./agent-governance-router.ts";
export * from "./agent-governance-revalidation.ts";
export * from "./agent-governance-export.ts";

export type ObjectType =
  | "TASK"
  | "MINI_PROJECT"
  | "PROJECT"
  | "AREA"
  | "DECISION"
  | "OUTPUT"
  | "RESOURCE"
  | "EXTERNAL_ARTIFACT"
  | "PERSON_REF";

export type Phase =
  | "CLARIFY"
  | "READY"
  | "ACTIVE"
  | "CLOSING"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED"
  | "DEFINING"
  | "IDEA"
  | "PLANNED"
  | "DORMANT"
  | "RETIRED";

export type ConditionKind = "ACTIONABLE" | "WAITING" | "BLOCKED" | "PAUSED" | "NONE";

export type ExecutionCondition =
  | { kind: "ACTIONABLE" }
  | { kind: "NONE" }
  | { kind: "WAITING"; waitingFor: string; expectedResult: string; reviewAt: string; startedAt: string }
  | { kind: "BLOCKED"; reason: string; blockerObjectId?: string }
  | { kind: "PAUSED"; reason: string; reviewAt?: string };

export type AttentionSignal =
  | "OVERDUE"
  | "REVIEW_DUE"
  | "STALE"
  | "NO_NEXT_ACTION"
  | "UNASSIGNED"
  | "BOUNDARY_DRIFT"
  | "UNHARVESTED_OUTPUT"
  | "CONFLICT";

export interface ManagedObject {
  objectId: string;
  objectType: ObjectType;
  version: number;
  phase: Phase;
  condition: ExecutionCondition;
  text: string;
  completionCriteria?: string;
  nextAction?: string;
  purpose?: string;
  targetOutcome?: string;
  scopeIn?: string;
  scopeOut?: string;
  currentSummary?: string;
  dueAt?: string;
  reviewAt?: string;
  createdAt: string;
  updatedAt: string;
  sourceOrCreationEvent: string;
  primaryTextAnchorId?: string;
  lastMeaningfulEventAt: string;
  conflict?: { code: string; message: string };
  extensionData?: Record<string, unknown>;
}

export interface CreateManagedObjectInput {
  objectId?: string;
  objectType: ObjectType;
  text: string;
  completionCriteria?: string;
  nextAction?: string;
  purpose?: string;
  targetOutcome?: string;
  scopeIn?: string;
  scopeOut?: string;
  currentSummary?: string;
  dueAt?: string;
  reviewAt?: string;
  sourceOrCreationEvent?: string;
  primaryTextAnchorId?: string;
  extensionData?: Record<string, unknown>;
}

export type RelationType =
  | "primary_ownership"
  | "parent_task"
  | "parent_work"
  | "depends_on"
  | "blocks"
  | "sourced_from"
  | "contextualized_by"
  | "produces"
  | "related_to";

export interface ObjectRelation {
  relationId: string;
  fromObjectId: string;
  toObjectId: string;
  relationType: RelationType;
  createdAt: string;
  status: "ACTIVE" | "ENDED";
  endedAt?: string;
}

export type AnchorRole = "primary_text" | "source" | "context" | "event" | "output";
export type AnchorStatus = "active" | "missing" | "replaced" | "conflict";

export interface Anchor {
  anchorId: string;
  objectId: string;
  adapter: string;
  graphId: string;
  externalId: string;
  role: AnchorRole;
  contentHash: string;
  lastSeenAt: string;
  status: AnchorStatus;
  cachedPageRef?: string;
  replacedByAnchorId?: string;
  observedContentHash?: string;
  observedText?: string;
}

export interface ConditionEvidence {
  waitingFor?: string;
  expectedResult?: string;
  reviewAt?: string;
  reason?: string;
  blockerObjectId?: string;
}

export interface TransitionContext {
  hasPrimaryOwnership?: boolean;
  hasCurrentProgress?: boolean;
  hasActiveChild?: boolean;
  completionChecksPassed?: boolean;
  reason?: string;
}

const workObjectTypes = new Set<ObjectType>(["TASK", "MINI_PROJECT", "PROJECT", "AREA"]);

const transitions: Record<"TASK" | "MINI_PROJECT" | "PROJECT" | "AREA", Readonly<Record<string, readonly Phase[]>>> = {
  TASK: {
    CLARIFY: ["READY", "CANCELLED"],
    READY: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["READY", "COMPLETED", "CANCELLED"],
    COMPLETED: ["ACTIVE", "ARCHIVED"],
    CANCELLED: ["ARCHIVED"],
    ARCHIVED: [],
  },
  MINI_PROJECT: {
    DEFINING: ["READY", "CANCELLED"],
    READY: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["READY", "CLOSING", "CANCELLED"],
    CLOSING: ["COMPLETED", "ACTIVE", "CANCELLED"],
    COMPLETED: ["ACTIVE", "ARCHIVED"],
    CANCELLED: ["ARCHIVED"],
    ARCHIVED: [],
  },
  PROJECT: {
    IDEA: ["DEFINING", "CANCELLED"],
    DEFINING: ["PLANNED", "CANCELLED"],
    PLANNED: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["CLOSING", "CANCELLED"],
    CLOSING: ["COMPLETED", "ACTIVE", "CANCELLED"],
    COMPLETED: ["ACTIVE", "ARCHIVED"],
    CANCELLED: ["ARCHIVED"],
    ARCHIVED: [],
  },
  AREA: {
    ACTIVE: ["DORMANT", "RETIRED"],
    DORMANT: ["ACTIVE", "RETIRED"],
    RETIRED: [],
  },
};

export function allowedPhaseTransitions(object: ManagedObject): readonly Phase[] {
  if (!workObjectTypes.has(object.objectType)) return [];
  return transitions[object.objectType as keyof typeof transitions][object.phase] ?? [];
}

function initialPhase(type: ObjectType): Phase {
  switch (type) {
    case "TASK":
      return "CLARIFY";
    case "MINI_PROJECT":
      return "DEFINING";
    case "PROJECT":
      return "IDEA";
    case "AREA":
      return "ACTIVE";
    default:
      return "ACTIVE";
  }
}

function copyDefined<T extends object>(target: T, source: object): T {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      Object.assign(target, { [key]: value });
    }
  }
  return target;
}

export function createManagedObject(input: CreateManagedObjectInput, at = new Date()): ManagedObject {
  const objectId = input.objectId ?? createId("obj", at);
  if (input.text.trim().length === 0) {
    throw new StructuredError({
      code: "OBJECT_TEXT_REQUIRED",
      message: "正式对象必须保留可读的自然语言正文。",
      ruleRefs: ["PRI-002", "SEM-COMMON-003"],
    });
  }
  const timestamp = at.toISOString();
  return copyDefined(
    {
      objectId,
      objectType: input.objectType,
      version: 1,
      phase: initialPhase(input.objectType),
      condition: workObjectTypes.has(input.objectType) ? { kind: "ACTIONABLE" } : { kind: "NONE" },
      text: input.text.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMeaningfulEventAt: timestamp,
      sourceOrCreationEvent: input.sourceOrCreationEvent ?? `event_created_${objectId}`,
    },
    {
      completionCriteria: input.completionCriteria,
      nextAction: input.nextAction,
      purpose: input.purpose,
      targetOutcome: input.targetOutcome,
      scopeIn: input.scopeIn,
      scopeOut: input.scopeOut,
      currentSummary: input.currentSummary,
      dueAt: input.dueAt,
      reviewAt: input.reviewAt,
      primaryTextAnchorId: input.primaryTextAnchorId,
      extensionData: input.extensionData,
    },
  );
}

function changed(object: ManagedObject, at: Date, patch: Partial<ManagedObject>): ManagedObject {
  return { ...object, ...patch, version: object.version + 1, updatedAt: at.toISOString() };
}

export function transitionPhase(
  object: ManagedObject,
  nextPhase: Phase,
  at = new Date(),
  context: TransitionContext = {},
): ManagedObject {
  if (!workObjectTypes.has(object.objectType)) {
    throw new StructuredError({
      code: "PHASE_NOT_SUPPORTED",
      message: `${object.objectType} 不使用工作对象状态机。`,
      ruleRefs: ["SEM-RES-001", "LIF-BASE-001"],
    });
  }
  const matrix = transitions[object.objectType as keyof typeof transitions];
  if (!(matrix[object.phase] ?? []).includes(nextPhase)) {
    throw new StructuredError({
      code: "ILLEGAL_PHASE_TRANSITION",
      message: `不允许从 ${object.phase} 流转到 ${nextPhase}。`,
      ruleRefs: ["LIF-BASE-001"],
      details: { objectId: object.objectId, from: object.phase, to: nextPhase },
    });
  }
  if (object.objectType === "TASK" && nextPhase === "READY" && !object.completionCriteria?.trim()) {
    throw new StructuredError({
      code: "TASK_COMPLETION_CRITERIA_REQUIRED",
      message: "Task 进入 READY 前必须有可判断的完成结果。",
      ruleRefs: ["SEM-TASK-001", "LIF-TASK-001"],
    });
  }
  if (object.objectType === "MINI_PROJECT" && nextPhase === "READY") {
    const missing = [object.targetOutcome, object.completionCriteria, object.nextAction].some((value) => !value?.trim());
    if (missing || context.hasPrimaryOwnership !== true) {
      throw new StructuredError({
        code: "MINI_PROJECT_READY_GATE",
        message: "MiniProject 进入 READY 前需要目标、完成判据、当前推进和主归属。",
        ruleRefs: ["SEM-MINI-001", "SEM-COMMON-003"],
      });
    }
  }
  if (object.objectType === "PROJECT" && nextPhase === "PLANNED") {
    const missing = [object.targetOutcome, object.scopeIn, object.completionCriteria].some((value) => !value?.trim());
    if (missing || context.hasPrimaryOwnership !== true) {
      throw new StructuredError({
        code: "PROJECT_PLANNED_GATE",
        message: "Project 进入 PLANNED 前需要目标、边界、完成判据和责任 Area 或明确例外。",
        ruleRefs: ["LIF-PROJ-001"],
      });
    }
  }
  if (object.objectType === "PROJECT" && nextPhase === "ACTIVE" && !context.hasCurrentProgress && !context.hasActiveChild) {
    throw new StructuredError({
      code: "PROJECT_ACTIVE_GATE",
      message: "Project 进入 ACTIVE 前需要当前推进或可执行下层对象。",
      ruleRefs: ["LIF-PROJ-002"],
    });
  }
  if (object.objectType === "PROJECT" && nextPhase === "COMPLETED" && !context.completionChecksPassed) {
    throw new StructuredError({
      code: "PROJECT_COMPLETION_GATE",
      message: "Project 完成前必须通过目标、下层对象、等待、成果和归档检查。",
      ruleRefs: ["LIF-PROJ-003", "REL-OUT-001"],
    });
  }
  if (object.phase === "COMPLETED" && nextPhase === "ACTIVE" && !context.reason?.trim()) {
    throw new StructuredError({
      code: "REOPEN_REASON_REQUIRED",
      message: "重新打开已完成对象必须记录原因。",
      ruleRefs: ["PRI-005", "AUD-EVT-001"],
    });
  }
  const ended = new Set<Phase>(["COMPLETED", "CANCELLED", "ARCHIVED", "RETIRED"]);
  return changed(object, at, {
    phase: nextPhase,
    condition: ended.has(nextPhase) ? { kind: "NONE" } : object.condition,
    lastMeaningfulEventAt: at.toISOString(),
  });
}

export function setCondition(
  object: ManagedObject,
  kind: ConditionKind,
  evidence: ConditionEvidence,
  at = new Date(),
): ManagedObject {
  if (["COMPLETED", "CANCELLED", "ARCHIVED", "RETIRED"].includes(object.phase) && kind !== "NONE") {
    throw new StructuredError({
      code: "ENDED_OBJECT_CONDITION",
      message: "已结束对象的执行条件必须为 NONE。",
      ruleRefs: ["LIF-BASE-001"],
    });
  }
  let condition: ExecutionCondition;
  switch (kind) {
    case "ACTIONABLE":
      condition = { kind };
      break;
    case "NONE":
      condition = { kind };
      break;
    case "WAITING":
      if (!evidence.waitingFor?.trim() || !evidence.expectedResult?.trim() || !evidence.reviewAt || !Number.isFinite(Date.parse(evidence.reviewAt))) {
        throw new StructuredError({
          code: "WAITING_EVIDENCE_REQUIRED",
          message: "WAITING 必须具有 waiting_for、期待结果和 review_at。",
          ruleRefs: ["LIF-COND-001", "REL-DEP-003"],
        });
      }
      condition = {
        kind,
        waitingFor: evidence.waitingFor.trim(),
        expectedResult: evidence.expectedResult.trim(),
        reviewAt: evidence.reviewAt,
        startedAt: at.toISOString(),
      };
      break;
    case "BLOCKED":
      if (!evidence.reason?.trim()) {
        throw new StructuredError({
          code: "BLOCKER_REASON_REQUIRED",
          message: "BLOCKED 必须记录阻塞说明。",
          ruleRefs: ["LIF-COND-002", "REL-DEP-004"],
        });
      }
      condition = copyDefined({ kind, reason: evidence.reason.trim() }, { blockerObjectId: evidence.blockerObjectId });
      break;
    case "PAUSED":
      if (!evidence.reason?.trim()) {
        throw new StructuredError({
          code: "PAUSE_REASON_REQUIRED",
          message: "PAUSED 必须记录暂停原因。",
          ruleRefs: ["LIF-COND-003"],
        });
      }
      if (evidence.reviewAt && !Number.isFinite(Date.parse(evidence.reviewAt))) {
        throw new StructuredError({ code: "PAUSE_REVIEW_DATE_INVALID", message: "PAUSED 的 review_at 必须是合法日期。", ruleRefs: ["LIF-COND-003"] });
      }
      condition = copyDefined({ kind, reason: evidence.reason.trim() }, { reviewAt: evidence.reviewAt });
      break;
  }
  return changed(object, at, { condition, lastMeaningfulEventAt: at.toISOString() });
}

function objectExists(objects: readonly ManagedObject[], id: string): ManagedObject {
  const object = objects.find((candidate) => candidate.objectId === id);
  if (!object) {
    throw new StructuredError({
      code: "OBJECT_NOT_FOUND",
      message: `找不到对象 ${id}。`,
      ruleRefs: ["MAP-ANC-001"],
    });
  }
  return object;
}

function createsCycle(relations: readonly ObjectRelation[], from: string, to: string, type: RelationType): boolean {
  const adjacency = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.status !== "ACTIVE" || relation.relationType !== type) continue;
    adjacency.set(relation.fromObjectId, [...(adjacency.get(relation.fromObjectId) ?? []), relation.toObjectId]);
  }
  adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function addRelation(
  relations: readonly ObjectRelation[],
  objects: readonly ManagedObject[],
  fromObjectId: string,
  toObjectId: string,
  relationType: RelationType,
  at = new Date(),
): ObjectRelation[] {
  objectExists(objects, fromObjectId);
  objectExists(objects, toObjectId);
  if (fromObjectId === toObjectId) {
    throw new StructuredError({
      code: "SELF_RELATION",
      message: "对象不能与自身建立该关系。",
      ruleRefs: ["REL-DEP-001"],
    });
  }
  if (relationType === "primary_ownership") {
    return setPrimaryOwnership(relations, objects, fromObjectId, toObjectId, at);
  }
  if (relationType === "depends_on" && createsCycle(relations, fromObjectId, toObjectId, relationType)) {
    throw new StructuredError({
      code: "DEPENDENCY_CYCLE",
      message: "depends_on 禁止形成循环依赖。",
      ruleRefs: ["REL-DEP-001"],
    });
  }
  if (relations.some((relation) => relation.status === "ACTIVE" && relation.fromObjectId === fromObjectId && relation.toObjectId === toObjectId && relation.relationType === relationType)) {
    return [...relations];
  }
  return [
    ...relations,
    {
      relationId: createId("rel", at),
      fromObjectId,
      toObjectId,
      relationType,
      createdAt: at.toISOString(),
      status: "ACTIVE",
    },
  ];
}

export function setPrimaryOwnership(
  relations: readonly ObjectRelation[],
  objects: readonly ManagedObject[],
  childObjectId: string,
  ownerObjectId: string,
  at = new Date(),
): ObjectRelation[] {
  const child = objectExists(objects, childObjectId);
  const owner = objectExists(objects, ownerObjectId);
  if (!workObjectTypes.has(child.objectType) || !workObjectTypes.has(owner.objectType) || childObjectId === ownerObjectId) {
    throw new StructuredError({
      code: "ILLEGAL_PRIMARY_OWNERSHIP",
      message: "主归属必须连接两个不同的工作对象。",
      ruleRefs: ["REL-OWN-001", "REL-OWN-002"],
    });
  }
  const allowedOwners: Record<"TASK" | "MINI_PROJECT" | "PROJECT" | "AREA", readonly ObjectType[]> = {
    TASK: ["MINI_PROJECT", "PROJECT", "AREA"],
    MINI_PROJECT: ["PROJECT", "AREA"],
    PROJECT: ["AREA"],
    AREA: ["AREA"],
  };
  if (!allowedOwners[child.objectType as keyof typeof allowedOwners].includes(owner.objectType)) {
    throw new StructuredError({
      code: "PRIMARY_OWNERSHIP_TYPE_MISMATCH",
      message: `${child.objectType} 不能直接归属于 ${owner.objectType}。`,
      ruleRefs: ["REL-OWN-003", "REL-OWN-004", "REL-OWN-005"],
    });
  }
  const remaining = relations.filter(
    (relation) => !(relation.status === "ACTIVE" && relation.relationType === "primary_ownership" && relation.fromObjectId === childObjectId),
  );
  if (createsCycle(remaining, childObjectId, ownerObjectId, "primary_ownership")) {
    throw new StructuredError({
      code: "OWNERSHIP_CYCLE",
      message: "主归属树不能形成循环。",
      ruleRefs: ["REL-OWN-001", "REL-OWN-006"],
    });
  }
  const candidateOwnership = [
    ...remaining.filter((relation) => relation.status === "ACTIVE" && relation.relationType === "primary_ownership"),
    { fromObjectId: childObjectId, toObjectId: ownerObjectId },
  ];
  const areaIds = new Set(objects.filter((object) => object.objectType === "AREA").map((object) => object.objectId));
  const areaParent = new Map(
    candidateOwnership
      .filter((relation) => areaIds.has(relation.fromObjectId) && areaIds.has(relation.toObjectId))
      .map((relation) => [relation.fromObjectId, relation.toObjectId]),
  );
  for (const areaId of areaIds) {
    let current = areaId;
    let edges = 0;
    while (areaParent.has(current)) {
      edges += 1;
      current = areaParent.get(current)!;
      if (edges > 1) {
        throw new StructuredError({
          code: "AREA_DEPTH_EXCEEDED",
          message: "首版 Area 主归属最多允许两层。",
          ruleRefs: ["REL-OWN-006"],
        });
      }
    }
  }
  return [
    ...remaining,
    {
      relationId: createId("rel", at),
      fromObjectId: childObjectId,
      toObjectId: ownerObjectId,
      relationType: "primary_ownership",
      createdAt: at.toISOString(),
      status: "ACTIVE",
    },
  ];
}

export function calculateSignals(
  object: ManagedObject,
  relations: readonly ObjectRelation[],
  at = new Date(),
  staleAfterDays = 14,
): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const now = at.getTime();
  const ended = ["COMPLETED", "CANCELLED", "ARCHIVED", "RETIRED"].includes(object.phase);
  if (!ended && object.dueAt && Date.parse(object.dueAt) <= now) signals.push("OVERDUE");
  const reviewAt = object.condition.kind === "WAITING" ? object.condition.reviewAt : object.reviewAt;
  if (!ended && reviewAt && Date.parse(reviewAt) <= now) signals.push("REVIEW_DUE");
  if (!ended && ["READY", "ACTIVE"].includes(object.phase) && !object.nextAction?.trim()) signals.push("NO_NEXT_ACTION");
  if (!ended && ["READY", "ACTIVE", "PLANNED"].includes(object.phase)) {
    const staleMs = staleAfterDays * 24 * 60 * 60 * 1000;
    if (now - Date.parse(object.lastMeaningfulEventAt) > staleMs) signals.push("STALE");
  }
  if (
    !ended &&
    object.objectType !== "AREA" &&
    !relations.some(
      (relation) => relation.status === "ACTIVE" && relation.relationType === "primary_ownership" && relation.fromObjectId === object.objectId,
    )
  ) {
    signals.push("UNASSIGNED");
  }
  if (object.conflict) signals.push("CONFLICT");
  return signals;
}

export function validateAnchors(anchors: readonly Anchor[]): void {
  const activePrimaryByObject = new Map<string, number>();
  for (const anchor of anchors) {
    if (anchor.role === "primary_text" && anchor.status === "active") {
      activePrimaryByObject.set(anchor.objectId, (activePrimaryByObject.get(anchor.objectId) ?? 0) + 1);
    }
  }
  const invalid = [...activePrimaryByObject.entries()].find(([, count]) => count > 1);
  if (invalid) {
    throw new StructuredError({
      code: "MULTIPLE_PRIMARY_ANCHORS",
      message: `对象 ${invalid[0]} 不能拥有多个 active primary_text Anchor。`,
      ruleRefs: ["MAP-ANC-002"],
    });
  }
}

export type OperationType =
  | "rewrite_content"
  | "create_object"
  | "update_object"
  | "set_primary_ownership"
  | "set_phase"
  | "set_condition"
  | "set_dates"
  | "add_relation"
  | "remove_relation"
  | "link_anchor"
  | "move_content"
  | "resolve_capture";

export type OperationStatus = "PROPOSED" | "ACCEPTED" | "REJECTED" | "EDITED" | "DEFERRED" | "BLOCKED" | "COMMITTED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface OperationTarget {
  kind: "CAPTURE" | "OBJECT" | "ANCHOR" | "RELATION";
  id: string;
}

export interface SemanticOperation {
  operationId: string;
  operationType: OperationType;
  target: OperationTarget;
  payload: Record<string, unknown>;
  agentPayload?: Record<string, unknown>;
  preconditions: Array<{ kind: string; expected: unknown }>;
  dependencies: string[];
  riskLevel: RiskLevel;
  ruleRefs: string[];
  rationale: string;
  confidence: number;
  status: OperationStatus;
  blockedReason?: string;
  deferredUntil?: string;
  deferReason?: string;
}

const riskOrder: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function effectiveOperationRisk(operation: Pick<SemanticOperation, "operationType" | "payload" | "riskLevel">): RiskLevel {
  let intrinsic: RiskLevel = "MEDIUM";
  if (["move_content", "set_primary_ownership", "remove_relation"].includes(operation.operationType)) intrinsic = "HIGH";
  if (operation.operationType === "set_phase" && ["COMPLETED", "CANCELLED", "ARCHIVED", "RETIRED"].includes(String(operation.payload.phase))) intrinsic = "HIGH";
  return riskOrder[operation.riskLevel] >= riskOrder[intrinsic] ? operation.riskLevel : intrinsic;
}

export interface Proposal {
  proposalId: string;
  sourceAnchorIds: string[];
  sourceObjectIds: string[];
  summary: string;
  facts: string[];
  assumptions: string[];
  uncertainties: string[];
  operations: SemanticOperation[];
  generatedAt: string;
  providerId: string;
  providerVersion: string;
  ruleVersion: string;
  status: "OPEN" | "COMMITTED" | "REJECTED";
}

export interface Capture {
  captureId: string;
  phase: "NEW" | "PROPOSED" | "RESOLVED" | "DISMISSED";
  originalText: string;
  sourceAnchorId: string;
  sourcePage?: string;
  sourcePageIdentity?: {
    rawShape: string;
    pageId?: number | string;
    pageUuid?: string;
    pageName?: string;
    originalName?: string;
    journalDay?: number | string;
    displayName: string;
    resolutionPath: string[];
  };
  captureMethod: "CURRENT_BLOCK" | "QUICK_INPUT" | "IMPORT" | "MANUAL";
  capturedAt: string;
  updatedAt: string;
  proposalId?: string;
  resolvedObjectIds: string[];
  resolutionNote?: string;
  deferredUntil?: string;
  deferReason?: string;
  sourceConflict?: { code: string; message: string };
}

export interface DomainEvent {
  eventId: string;
  timestamp: string;
  actor: "user" | "agent" | "system" | "import";
  objectId?: string;
  captureId?: string;
  operationType: string;
  semanticCommitId?: string;
  beforeVersion?: number;
  afterVersion?: number;
  payload: Record<string, unknown>;
  sourceProposalId?: string;
  ruleRefs: string[];
  reversible: boolean;
}

export interface TextMutationRecord {
  anchorId: string;
  graphId: string;
  externalId: string;
  beforeText: string;
  afterText: string;
  beforeHash: string;
  afterHash: string;
}

export interface DomainChangeRecord {
  entityType: "OBJECT" | "CAPTURE" | "RELATION" | "ANCHOR" | "PROPOSAL";
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export interface SemanticCommit {
  semanticCommitId: string;
  proposalId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED" | "UNDONE";
  operationIds: string[];
  createdAt: string;
  updatedAt: string;
  beforeStateChecksum: string;
  afterStateChecksum?: string;
  textMutations: TextMutationRecord[];
  domainChanges: DomainChangeRecord[];
  error?: { code: string; message: string };
  compensation?: { attempted: boolean; completed: boolean; message?: string };
  undoCommitId?: string;
}

export function reviewOperation(
  operation: SemanticOperation,
  status: "ACCEPTED" | "REJECTED" | "EDITED",
  editedPayload?: Record<string, unknown>,
): SemanticOperation {
  if (status === "EDITED" && !editedPayload) {
    throw new StructuredError({
      code: "EDITED_PAYLOAD_REQUIRED",
      message: "编辑后接受必须提供用户确认的最终内容。",
      ruleRefs: ["REV-PART-005"],
    });
  }
  if (status === "EDITED") {
    return {
      ...operation,
      agentPayload: operation.agentPayload ?? operation.payload,
      payload: editedPayload ?? {},
      status,
    };
  }
  return { ...operation, status };
}

export function deferOperation(operation: SemanticOperation, deferredUntil: string, reason: string): SemanticOperation {
  if (!Number.isFinite(Date.parse(deferredUntil)) || !reason.trim()) {
    throw new StructuredError({
      code: "INVALID_OPERATION_DEFERRAL",
      message: "暂缓操作必须提供合法复查时间和原因。",
      ruleRefs: ["REV-PART-001"],
    });
  }
  return { ...operation, status: "DEFERRED", deferredUntil, deferReason: reason.trim() };
}

export interface OperationResolution {
  executable: SemanticOperation[];
  rejected: SemanticOperation[];
  blocked: SemanticOperation[];
  pending: SemanticOperation[];
}

export function resolveOperations(operations: readonly SemanticOperation[]): OperationResolution {
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  if (byId.size !== operations.length) {
    throw new StructuredError({
      code: "DUPLICATE_OPERATION_ID",
      message: "Proposal 中的 operation_id 必须唯一。",
      ruleRefs: ["COM-OP-002"],
    });
  }
  const rejected = operations.filter((operation) => operation.status === "REJECTED");
  const pending = operations.filter((operation) => operation.status === "PROPOSED" || operation.status === "DEFERRED");
  const accepted = operations.filter((operation) => operation.status === "ACCEPTED" || operation.status === "EDITED");
  const blocked: SemanticOperation[] = [];
  const candidates = new Map<string, SemanticOperation>();
  for (const operation of accepted) {
    const missing = operation.dependencies.find((dependency) => {
      const required = byId.get(dependency);
      return !required || !["ACCEPTED", "EDITED", "COMMITTED"].includes(required.status);
    });
    if (missing) {
      blocked.push({
        ...operation,
        status: "BLOCKED",
        blockedReason: `依赖操作 ${missing} 未被接受。`,
      });
    } else {
      candidates.set(operation.operationId, operation);
    }
  }

  const executable: SemanticOperation[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (operation: SemanticOperation): void => {
    if (visited.has(operation.operationId)) return;
    if (visiting.has(operation.operationId)) {
      throw new StructuredError({
        code: "OPERATION_DEPENDENCY_CYCLE",
        message: "SemanticOperation 依赖图不能形成循环。",
        ruleRefs: ["COM-OP-002"],
      });
    }
    visiting.add(operation.operationId);
    for (const dependency of operation.dependencies) {
      const required = candidates.get(dependency);
      if (required) visit(required);
    }
    visiting.delete(operation.operationId);
    visited.add(operation.operationId);
    executable.push(operation);
  };
  for (const operation of accepted) {
    const candidate = candidates.get(operation.operationId);
    if (candidate) visit(candidate);
  }
  return { executable, rejected, blocked, pending };
}
