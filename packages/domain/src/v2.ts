import { StructuredError, createId } from "@task-copilot/shared";

export const V2_OBJECT_TYPES = ["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"] as const;
export type V2ObjectType = (typeof V2_OBJECT_TYPES)[number];

export const V2_LIFECYCLES = ["OPEN", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export type Lifecycle = (typeof V2_LIFECYCLES)[number];
export const V2_EXECUTION_MARKERS = ["TODO", "NOW", "DOING", "DONE", "CANCELED", "CANCELLED", "WAITING"] as const;
export type V2ExecutionMarker = (typeof V2_EXECUTION_MARKERS)[number];

export type V2Condition =
  | { kind: "ACTIONABLE" }
  | { kind: "WAITING"; waitingFor: string; expectedResult: string; reviewAt: string }
  | { kind: "BLOCKED"; reason: string; blockerObjectId?: string }
  | { kind: "PAUSED"; reason: string; reviewAt?: string };

export interface V2ProjectClosure {
  originalGoal: string;
  actualResult: string;
  majorDeliverables: string[];
  incompleteObjectives: Array<{ objective: string; reason: string; nextStep: string }>;
  legacyDisposition: string;
  keyDecisions: string[];
  futureSummary: string;
}

export interface V2MiniProjectClosure {
  originalGoal: string;
  actualResult: string;
  remainingWork: string;
}

export interface V2ManagedObject {
  objectId: string;
  objectType: V2ObjectType;
  version: number;
  lifecycle: Lifecycle;
  condition: V2Condition;
  dueAt?: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  sourceOrCreationEvent: string;
  closure?: V2ProjectClosure | V2MiniProjectClosure;
}
export interface CreateV2ManagedObjectInput {
  objectId?: string;
  objectType: V2ObjectType;
  text: string;
  condition?: V2Condition;
  sourceOrCreationEvent?: string;
}

export interface FocusSelection {
  objectId: string;
  selectedAt: string;
  rank: number;
  expiresAt?: string;
}

export type V2AnchorRole = "primary_text" | "source" | "context" | "event" | "output";
export type V2AnchorStatus = "active" | "missing" | "replaced" | "conflict";

export interface V2Anchor {
  anchorId: string;
  objectId: string;
  graphId: string;
  externalId: string;
  role: V2AnchorRole;
  status: V2AnchorStatus;
  contentHash: string;
  lastSeenAt: string;
}

export interface V2PrimaryOwnership {
  childObjectId: string;
  ownerObjectId: string;
  assignedAt: string;
}

export interface V2Association {
  associationId: string;
  sourceObjectId: string;
  targetObjectId: string;
  associationKind: "RELATED";
  status: "ACTIVE";
  createdAt: string;
  updatedAt: string;
}

export function associateV2Objects(source: V2ManagedObject, target: V2ManagedObject, expectedVersion: number, at = new Date()): { object: V2ManagedObject; association: V2Association } {
  requireExpectedVersion(source, expectedVersion);
  if (source.objectId === target.objectId) throw new StructuredError({ code: "V2_ASSOCIATION_SELF_REFERENCE", message: "Association 不能把对象关联到自身。", ruleRefs: ["D-035", "D-047"] });
  const timestamp = at.toISOString();
  return {
    object: { ...source, version: source.version + 1, updatedAt: timestamp },
    association: { associationId: createId("rel"), sourceObjectId: source.objectId, targetObjectId: target.objectId, associationKind: "RELATED", status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp },
  };
}

function requireText(value: string, code: string, message: string): void {
  if (!value.trim()) {
    throw new StructuredError({ code, message, ruleRefs: ["D-220"] });
  }
}

export function validateV2Condition(condition: V2Condition): V2Condition {
  switch (condition.kind) {
    case "ACTIONABLE":
      return condition;
    case "WAITING":
      requireText(condition.waitingFor, "WAITING_FOR_REQUIRED", "WAITING 必须说明正在等待谁或什么。");
      requireText(condition.expectedResult, "WAITING_RESULT_REQUIRED", "WAITING 必须说明期望结果。");
      requireText(condition.reviewAt, "WAITING_REVIEW_REQUIRED", "WAITING 必须有复查时间。");
      if (!Number.isFinite(Date.parse(condition.reviewAt))) throw new StructuredError({ code: "WAITING_REVIEW_INVALID", message: "WAITING 复查时间必须是合法时间。", ruleRefs: ["D-151", "D-220"] });
      return condition;
    case "BLOCKED":
      requireText(condition.reason, "BLOCKED_REASON_REQUIRED", "BLOCKED 必须说明阻碍。");
      if (condition.blockerObjectId !== undefined) requireText(condition.blockerObjectId, "BLOCKER_OBJECT_ID_INVALID", "阻碍对象 ID 不能为空。");
      return { kind: "BLOCKED", reason: condition.reason.trim(), ...(condition.blockerObjectId ? { blockerObjectId: condition.blockerObjectId.trim() } : {}) };
    case "PAUSED":
      requireText(condition.reason, "PAUSED_REASON_REQUIRED", "PAUSED 必须说明暂停原因。");
      if (condition.reviewAt && !Number.isFinite(Date.parse(condition.reviewAt))) throw new StructuredError({ code: "PAUSED_REVIEW_INVALID", message: "PAUSED 复查时间必须是合法时间。", ruleRefs: ["D-151", "D-220"] });
      return condition;
  }
}

export function changeV2Condition(object: V2ManagedObject, condition: V2Condition, expectedVersion: number, at = new Date()): V2ManagedObject {
  if (object.version !== expectedVersion) throw new StructuredError({ code: "V2_OBJECT_VERSION_CONFLICT", message: "对象版本已变化；Condition 没有更新。", ruleRefs: ["D-185"] });
  if (object.lifecycle !== "OPEN") throw new StructuredError({ code: "V2_CONDITION_OBJECT_CLOSED", message: "已关闭对象不能改变当前 Condition。", ruleRefs: ["D-148", "D-220"] });
  const validated = validateV2Condition(condition);
  if (validated.kind === "BLOCKED" && validated.blockerObjectId === object.objectId) throw new StructuredError({ code: "BLOCKER_OBJECT_SELF_REFERENCE", message: "对象不能把自己设为阻碍来源。", ruleRefs: ["D-151", "D-220"] });
  return { ...object, condition: validated, version: object.version + 1, updatedAt: at.toISOString() };
}

export function changeV2DueAt(object: V2ManagedObject, dueAt: string | undefined, expectedVersion: number, at = new Date()): V2ManagedObject {
  if (object.version !== expectedVersion) throw new StructuredError({ code: "V2_OBJECT_VERSION_CONFLICT", message: "对象版本已变化；期限没有更新。", ruleRefs: ["D-185"] });
  if (object.lifecycle !== "OPEN") throw new StructuredError({ code: "V2_DEADLINE_OBJECT_CLOSED", message: "已关闭对象不能改变期限。", ruleRefs: ["D-148", "D-220"] });
  if (object.objectType !== "TASK") throw new StructuredError({ code: "V2_DEADLINE_TASK_ONLY", message: "明确期限当前只属于 Task。", ruleRefs: ["D-075", "D-220"] });
  if (dueAt !== undefined && !Number.isFinite(Date.parse(dueAt))) throw new StructuredError({ code: "V2_DEADLINE_INVALID", message: "期限必须是合法时间。", ruleRefs: ["D-145", "D-220"] });
  const { dueAt: _currentDueAt, ...withoutDueAt } = object;
  void _currentDueAt;
  return { ...withoutDueAt, ...(dueAt === undefined ? {} : { dueAt }), version: object.version + 1, updatedAt: at.toISOString() };
}

export function createV2ManagedObject(input: CreateV2ManagedObjectInput, at = new Date()): V2ManagedObject {
  requireText(input.text, "V2_OBJECT_TEXT_REQUIRED", "正式对象必须保留可读的自然语言正文。");
  const objectId = input.objectId ?? createId("obj", at);
  const timestamp = at.toISOString();
  return {
    objectId,
    objectType: input.objectType,
    version: 1,
    lifecycle: "OPEN",
    condition: validateV2Condition(input.condition ?? { kind: "ACTIONABLE" }),
    text: input.text.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceOrCreationEvent: input.sourceOrCreationEvent ?? `event_created_${objectId}`,
  };
}

export function lifecycleForV2ExecutionMarker(
  objectType: V2ObjectType,
  current: Lifecycle,
  marker: V2ExecutionMarker | undefined,
): Lifecycle {
  if (marker === undefined || marker === "TODO" || marker === "NOW" || marker === "DOING" || marker === "WAITING") return current;
  if (objectType === "PROJECT" || objectType === "MINI_PROJECT") {
    throw new StructuredError({
      code: "V2_COMPLEX_CLOSURE_REQUIRES_PROPOSAL",
      message: `${objectType} 的 ${marker} Marker 只表示关闭请求；必须进入可审阅关闭流程。`,
      ruleRefs: ["D-183", "D-220"],
    });
  }
  if (objectType !== "TASK") {
    throw new StructuredError({
      code: "V2_MARKER_LIFECYCLE_UNSUPPORTED",
      message: `${objectType} 不使用 TODO Marker 改变 Lifecycle。`,
      ruleRefs: ["D-183", "D-220"],
    });
  }
  const requested = marker === "DONE" ? "COMPLETED" : "CANCELLED";
  if (current === requested) return current;
  if (requested === "CANCELLED" && current === "OPEN") {
    throw new StructuredError({
      code: "V2_TASK_CANCELLATION_REASON_REQUIRED",
      message: "CANCELED Marker 只表示取消请求；需要记录取消原因后再改变 Lifecycle。",
      ruleRefs: ["D-183", "D-220"],
    });
  }
  if (current !== "OPEN") {
    throw new StructuredError({
      code: "V2_MARKER_TERMINAL_CONFLICT",
      message: `Marker 请求 ${requested}，但对象已是 ${current}；不会静默改写终态。`,
      ruleRefs: ["D-183", "D-220"],
    });
  }
  return requested;
}

const lifecycleTransitions: Readonly<Record<Lifecycle, readonly Lifecycle[]>> = {
  OPEN: ["COMPLETED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function transitionV2Lifecycle(
  object: V2ManagedObject,
  next: Lifecycle,
  expectedVersion: number,
  at = new Date(),
): V2ManagedObject {
  if (object.version !== expectedVersion) {
    throw new StructuredError({
      code: "V2_OBJECT_VERSION_CONFLICT",
      message: `对象版本已从 ${expectedVersion} 变为 ${object.version}。`,
      ruleRefs: ["D-185", "D-188"],
    });
  }
  if (!lifecycleTransitions[object.lifecycle].includes(next)) {
    if (object.lifecycle === "OPEN" && next === "CANCELLED") {
      throw new StructuredError({
        code: "V2_CANCELLATION_REASON_REQUIRED",
        message: "取消对象必须通过显式命令记录原因。",
        ruleRefs: ["D-055", "D-220"],
      });
    }
    throw new StructuredError({
      code: "V2_ILLEGAL_LIFECYCLE_TRANSITION",
      message: `不允许从 ${object.lifecycle} 流转到 ${next}。`,
      ruleRefs: ["D-220"],
    });
  }
  if (object.objectType === "PROJECT" && object.lifecycle === "OPEN" && next === "COMPLETED") {
    throw new StructuredError({
      code: "V2_PROJECT_CLOSURE_REQUIRED",
      message: "Project 必须通过经审阅的 Closure 完成。",
      ruleRefs: ["D-207", "D-220"],
    });
  }
  return { ...object, lifecycle: next, version: object.version + 1, updatedAt: at.toISOString() };
}

function validateLifecycleReason(reason: unknown, action: "取消" | "重开"): string {
  if (typeof reason !== "string" || !reason.trim()) {
    throw new StructuredError({ code: `V2_${action === "取消" ? "CANCELLATION" : "REOPEN"}_REASON_REQUIRED`, message: `${action}对象必须记录原因。`, ruleRefs: ["D-055", "D-220"] });
  }
  const normalized = reason.trim();
  if (normalized.length > 4_000) throw new StructuredError({ code: "V2_LIFECYCLE_REASON_TOO_LONG", message: `${action}原因过长。`, ruleRefs: ["D-055", "D-220"] });
  return normalized;
}

export function cancelV2Lifecycle(object: V2ManagedObject, reason: string, expectedVersion: number, at = new Date()): V2ManagedObject {
  requireExpectedVersion(object, expectedVersion);
  validateLifecycleReason(reason, "取消");
  if (object.lifecycle !== "OPEN") throw new StructuredError({ code: "V2_ILLEGAL_LIFECYCLE_TRANSITION", message: `不允许从 ${object.lifecycle} 取消对象。`, ruleRefs: ["D-220"] });
  return { ...object, lifecycle: "CANCELLED", version: object.version + 1, updatedAt: at.toISOString() };
}

export function reopenV2Lifecycle(object: V2ManagedObject, reason: string, expectedVersion: number, at = new Date()): V2ManagedObject {
  requireExpectedVersion(object, expectedVersion);
  validateLifecycleReason(reason, "重开");
  if (object.lifecycle !== "COMPLETED" && object.lifecycle !== "CANCELLED") throw new StructuredError({ code: "V2_ILLEGAL_LIFECYCLE_TRANSITION", message: `不允许从 ${object.lifecycle} 重开对象。`, ruleRefs: ["D-220"] });
  const { closure: _historicalClosure, ...withoutClosure } = object;
  void _historicalClosure;
  return { ...withoutClosure, lifecycle: "OPEN", version: object.version + 1, updatedAt: at.toISOString() };
}

export function restoreV2LifecycleFromUndo(
  object: V2ManagedObject,
  previous: { lifecycle: "OPEN" | "COMPLETED" | "CANCELLED"; closure?: V2ProjectClosure | V2MiniProjectClosure },
  expectedVersion: number,
  at = new Date(),
): V2ManagedObject {
  requireExpectedVersion(object, expectedVersion);
  const validInverse = (object.lifecycle === "CANCELLED" && previous.lifecycle === "OPEN")
    || (object.lifecycle === "OPEN" && (previous.lifecycle === "COMPLETED" || previous.lifecycle === "CANCELLED"));
  if (!validInverse) throw new StructuredError({ code: "V2_LIFECYCLE_UNDO_INVALID", message: `当前 ${object.lifecycle} 不能恢复为 ${previous.lifecycle}。`, ruleRefs: ["D-185", "D-220"] });
  let closure: V2ManagedObject["closure"];
  if (previous.lifecycle === "COMPLETED" && object.objectType === "PROJECT") closure = validateV2ProjectClosure(previous.closure as V2ProjectClosure);
  else if (previous.lifecycle === "COMPLETED" && object.objectType === "MINI_PROJECT") closure = validateV2MiniProjectClosure(previous.closure as V2MiniProjectClosure);
  else if (previous.closure !== undefined) throw new StructuredError({ code: "V2_LIFECYCLE_UNDO_SNAPSHOT_INVALID", message: "Lifecycle Undo 的 Closure 快照与对象类型或目标状态不一致。", ruleRefs: ["D-185", "D-220"] });
  return { ...object, lifecycle: previous.lifecycle, version: object.version + 1, updatedAt: at.toISOString(), ...(closure ? { closure } : {}) };
}

function boundedClosureText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new StructuredError({ code: "V2_PROJECT_CLOSURE_FIELD_REQUIRED", message: `Project Closure 必须说明${label}。`, ruleRefs: ["D-207", "D-220"] });
  const text = value.trim();
  if (!text) throw new StructuredError({ code: "V2_PROJECT_CLOSURE_FIELD_REQUIRED", message: `Project Closure 必须说明${label}。`, ruleRefs: ["D-207", "D-220"] });
  if (text.length > 4_000) throw new StructuredError({ code: "V2_PROJECT_CLOSURE_FIELD_TOO_LONG", message: `Project Closure ${label}过长。`, ruleRefs: ["D-207", "D-220"] });
  return text;
}

export function validateV2ProjectClosure(closure: V2ProjectClosure): V2ProjectClosure {
  if (!Array.isArray(closure.majorDeliverables) || closure.majorDeliverables.length === 0 || closure.majorDeliverables.length > 64 || !Array.isArray(closure.incompleteObjectives) || closure.incompleteObjectives.length > 64 || !Array.isArray(closure.keyDecisions) || closure.keyDecisions.length === 0 || closure.keyDecisions.length > 64) {
    throw new StructuredError({ code: "V2_PROJECT_CLOSURE_LIST_INVALID", message: "Project Closure 列表必须是有界数组。", ruleRefs: ["D-207", "D-220"] });
  }
  if (closure.incompleteObjectives.some((value) => !value || typeof value !== "object" || Array.isArray(value))) {
    throw new StructuredError({ code: "V2_PROJECT_CLOSURE_LIST_INVALID", message: "Project Closure 未完成 Objective 必须是结构化条目。", ruleRefs: ["D-207", "D-220"] });
  }
  return {
    originalGoal: boundedClosureText(closure.originalGoal, "原始目标"),
    actualResult: boundedClosureText(closure.actualResult, "实际结果"),
    majorDeliverables: closure.majorDeliverables.map((value) => boundedClosureText(value, "主要 Deliverable / Output")),
    incompleteObjectives: closure.incompleteObjectives.map((value) => ({
      objective: boundedClosureText(value.objective, "未完成 Objective"),
      reason: boundedClosureText(value.reason, "未完成 Objective 的原因"),
      nextStep: boundedClosureText(value.nextStep, "未完成 Objective 的后续"),
    })),
    legacyDisposition: boundedClosureText(closure.legacyDisposition, "遗留去向"),
    keyDecisions: closure.keyDecisions.map((value) => boundedClosureText(value, "关键 Decision")),
    futureSummary: boundedClosureText(closure.futureSummary, "面向未来的总结"),
  };
}

export function completeV2Project(object: V2ManagedObject, closure: V2ProjectClosure, expectedVersion: number, at = new Date()): V2ManagedObject {
  if (object.version !== expectedVersion) throw new StructuredError({ code: "V2_OBJECT_VERSION_CONFLICT", message: `对象版本已从 ${expectedVersion} 变为 ${object.version}。`, ruleRefs: ["D-185", "D-188"] });
  if (object.objectType !== "PROJECT") throw new StructuredError({ code: "V2_PROJECT_CLOSURE_PROJECT_ONLY", message: "只有 Project 可以通过 Project Closure 完成。", ruleRefs: ["D-207", "D-220"] });
  if (object.lifecycle !== "OPEN") throw new StructuredError({ code: "V2_PROJECT_CLOSURE_NOT_OPEN", message: "只有 OPEN Project 可以形成 Closure。", ruleRefs: ["D-207", "D-220"] });
  return { ...object, lifecycle: "COMPLETED", closure: validateV2ProjectClosure(closure), version: object.version + 1, updatedAt: at.toISOString() };
}

function requireExpectedVersion(object: V2ManagedObject, expectedVersion: number): void {
  if (object.version !== expectedVersion) {
    throw new StructuredError({
      code: "V2_OBJECT_VERSION_CONFLICT",
      message: `对象版本已从 ${expectedVersion} 变为 ${object.version}。`,
      ruleRefs: ["D-185", "D-188"],
    });
  }
}

export function bindV2PrimaryAnchor(
  object: V2ManagedObject,
  input: Omit<V2Anchor, "anchorId" | "objectId" | "role" | "status" | "lastSeenAt"> & { anchorId?: string },
  expectedVersion: number,
  at = new Date(),
): { object: V2ManagedObject; anchor: V2Anchor } {
  requireExpectedVersion(object, expectedVersion);
  requireText(input.graphId, "V2_ANCHOR_GRAPH_REQUIRED", "Primary Anchor 必须包含 Graph identity。");
  requireText(input.externalId, "V2_ANCHOR_EXTERNAL_ID_REQUIRED", "Primary Anchor 必须包含外部 Block identity。");
  requireText(input.contentHash, "V2_ANCHOR_HASH_REQUIRED", "Primary Anchor 必须包含正文 hash。");
  const timestamp = at.toISOString();
  return {
    object: { ...object, version: object.version + 1, updatedAt: timestamp },
    anchor: {
      anchorId: input.anchorId ?? createId("anc", at),
      objectId: object.objectId,
      graphId: input.graphId,
      externalId: input.externalId,
      role: "primary_text",
      status: "active",
      contentHash: input.contentHash,
      lastSeenAt: timestamp,
    },
  };
}

export function observeV2PrimaryAnchor(
  object: V2ManagedObject,
  anchor: V2Anchor,
  status: Extract<V2AnchorStatus, "active" | "missing" | "conflict">,
  expectedVersion: number,
  at = new Date(),
): { object: V2ManagedObject; anchor: V2Anchor } {
  requireExpectedVersion(object, expectedVersion);
  if (anchor.objectId !== object.objectId || anchor.role !== "primary_text") {
    throw new StructuredError({
      code: "V2_PRIMARY_ANCHOR_INVALID",
      message: "Anchor 观察必须引用该对象的 Primary Anchor。",
      ruleRefs: ["D-030", "D-033", "D-185"],
    });
  }
  if (anchor.status === "replaced") {
    throw new StructuredError({
      code: "V2_REPLACED_ANCHOR_IMMUTABLE",
      message: "replaced Anchor 只作为历史证据保留，不能被观察路径复活。",
      ruleRefs: ["D-030", "D-033", "D-185"],
    });
  }
  const timestamp = at.toISOString();
  return {
    object: { ...object, version: object.version + 1, updatedAt: timestamp },
    anchor: {
      ...anchor,
      status,
      ...(status === "missing" ? {} : { lastSeenAt: timestamp }),
    },
  };
}

export function rebindV2PrimaryAnchor(
  object: V2ManagedObject,
  previousAnchor: V2Anchor,
  input: Omit<V2Anchor, "anchorId" | "objectId" | "role" | "status" | "lastSeenAt"> & {
    anchorId?: string;
    objectType: V2ObjectType;
    text: string;
  },
  expectedVersion: number,
  at = new Date(),
): { object: V2ManagedObject; previousAnchor: V2Anchor; anchor: V2Anchor } {
  requireExpectedVersion(object, expectedVersion);
  if (previousAnchor.objectId !== object.objectId || previousAnchor.role !== "primary_text" || previousAnchor.status === "replaced") {
    throw new StructuredError({
      code: "V2_PRIMARY_ANCHOR_INVALID",
      message: "重新绑定必须引用该对象当前未被替换的 Primary Anchor。",
      ruleRefs: ["D-030", "D-033", "D-185"],
    });
  }
  if (input.objectType !== object.objectType) {
    throw new StructuredError({
      code: "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL",
      message: `显式类型从 ${object.objectType} 变为 ${input.objectType}；必须形成可审阅 Proposal。`,
      ruleRefs: ["D-079", "D-185"],
    });
  }
  requireText(input.text, "V2_OBJECT_TEXT_REQUIRED", "正式对象必须保留可读的自然语言正文。");
  requireText(input.graphId, "V2_ANCHOR_GRAPH_REQUIRED", "Primary Anchor 必须包含 Graph identity。");
  requireText(input.externalId, "V2_ANCHOR_EXTERNAL_ID_REQUIRED", "Primary Anchor 必须包含外部 Block identity。");
  requireText(input.contentHash, "V2_ANCHOR_HASH_REQUIRED", "Primary Anchor 必须包含正文 hash。");
  if (input.graphId !== previousAnchor.graphId) {
    throw new StructuredError({ code: "V2_ANCHOR_GRAPH_MISMATCH", message: "Primary Anchor 不能跨 Graph 重新绑定。", ruleRefs: ["D-030", "D-190"] });
  }
  if (input.externalId === previousAnchor.externalId) {
    throw new StructuredError({ code: "V2_REBIND_TARGET_UNCHANGED", message: "新的 Primary Anchor 必须引用不同 Block。", ruleRefs: ["D-030", "D-185"] });
  }
  const timestamp = at.toISOString();
  return {
    object: { ...object, text: input.text.trim(), version: object.version + 1, updatedAt: timestamp },
    previousAnchor: { ...previousAnchor, status: "replaced" },
    anchor: {
      anchorId: input.anchorId ?? createId("anc", at),
      objectId: object.objectId,
      graphId: input.graphId,
      externalId: input.externalId,
      role: "primary_text",
      status: "active",
      contentHash: input.contentHash,
      lastSeenAt: timestamp,
    },
  };
}

export function synchronizeV2ExplicitObject(
  object: V2ManagedObject,
  anchor: V2Anchor,
  input: { objectType: V2ObjectType; text: string; contentHash: string; marker?: V2ExecutionMarker },
  expectedVersion: number,
  at = new Date(),
): { object: V2ManagedObject; anchor: V2Anchor } {
  requireExpectedVersion(object, expectedVersion);
  if (
    anchor.objectId !== object.objectId ||
    anchor.role !== "primary_text" ||
    anchor.status === "replaced"
  ) {
    throw new StructuredError({
      code: "V2_PRIMARY_ANCHOR_INVALID",
      message: "显式对象同步必须引用该对象未被替换的唯一 Primary Anchor。",
      ruleRefs: ["D-030", "D-033", "D-185"],
    });
  }
  if (input.objectType !== object.objectType) {
    throw new StructuredError({
      code: "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL",
      message: `显式类型从 ${object.objectType} 变为 ${input.objectType}；必须形成可审阅 Proposal。`,
      ruleRefs: ["D-079", "D-185"],
    });
  }
  requireText(input.text, "V2_OBJECT_TEXT_REQUIRED", "正式对象必须保留可读的自然语言正文。");
  requireText(input.contentHash, "V2_ANCHOR_HASH_REQUIRED", "Primary Anchor 必须包含正文 hash。");
  const timestamp = at.toISOString();
  const lifecycle = lifecycleForV2ExecutionMarker(object.objectType, object.lifecycle, input.marker);
  return {
    object: {
      ...object,
      lifecycle,
      text: input.text.trim(),
      version: object.version + 1,
      updatedAt: timestamp,
    },
    anchor: {
      ...anchor,
      status: "active",
      contentHash: input.contentHash,
      lastSeenAt: timestamp,
    },
  };
}

export function completeV2MiniProjectFromReviewedMarker(
  object: V2ManagedObject,
  anchor: V2Anchor,
  input: { objectType: V2ObjectType; text: string; contentHash: string; marker?: V2ExecutionMarker; closure: V2MiniProjectClosure },
  expectedVersion: number,
  at = new Date(),
): { object: V2ManagedObject; anchor: V2Anchor } {
  requireExpectedVersion(object, expectedVersion);
  if (object.objectType !== "MINI_PROJECT" || input.objectType !== "MINI_PROJECT" || input.marker !== "DONE") {
    throw new StructuredError({
      code: "V2_REVIEWED_MINI_PROJECT_CLOSURE_INVALID",
      message: "审阅后关闭命令只接受 MiniProject 的 DONE Marker。",
      ruleRefs: ["D-183", "D-220"],
    });
  }
  if (anchor.objectId !== object.objectId || anchor.role !== "primary_text" || anchor.status !== "active" || anchor.contentHash !== input.contentHash) {
    throw new StructuredError({
      code: "V2_PRIMARY_ANCHOR_INVALID",
      message: "审阅后关闭必须引用该 MiniProject 当前 active 且正文 hash 一致的 Primary Anchor。",
      ruleRefs: ["D-030", "D-033", "D-185"],
    });
  }
  requireText(input.text, "V2_OBJECT_TEXT_REQUIRED", "正式对象必须保留可读的自然语言正文。");
  requireText(input.contentHash, "V2_ANCHOR_HASH_REQUIRED", "Primary Anchor 必须包含正文 hash。");
  const completed = completeV2MiniProject(object, input.closure, expectedVersion, at);
  const timestamp = at.toISOString();
  return {
    object: { ...completed, text: input.text.trim() },
    anchor: { ...anchor, status: "active", contentHash: input.contentHash, lastSeenAt: timestamp },
  };
}

export function completeV2MiniProject(
  object: V2ManagedObject,
  closureValue: V2MiniProjectClosure,
  expectedVersion: number,
  at = new Date(),
): V2ManagedObject {
  requireExpectedVersion(object, expectedVersion);
  if (object.objectType !== "MINI_PROJECT") throw new StructuredError({ code: "V2_MINI_PROJECT_CLOSURE_MINI_PROJECT_ONLY", message: "仅 MiniProject 可使用三问 Closure。", ruleRefs: ["D-048", "D-206"] });
  if (object.lifecycle !== "OPEN") throw new StructuredError({ code: "V2_REVIEWED_MINI_PROJECT_CLOSURE_CONFLICT", message: `MiniProject 已是 ${object.lifecycle}；审阅后关闭没有写入。`, ruleRefs: ["D-048", "D-185", "D-206"] });
  const closure = validateV2MiniProjectClosure(closureValue);
  return { ...object, lifecycle: "COMPLETED", closure, version: object.version + 1, updatedAt: at.toISOString() };
}

export function validateV2MiniProjectClosure(value: V2MiniProjectClosure): V2MiniProjectClosure {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StructuredError({ code: "V2_MINI_PROJECT_CLOSURE_INVALID", message: "MiniProject Closure 必须包含三问答案。", ruleRefs: ["D-048", "D-206"] });
  const requireAnswer = (answer: unknown, label: string): string => {
    if (typeof answer !== "string" || !answer.trim() || answer.length > 4000) throw new StructuredError({ code: "V2_MINI_PROJECT_CLOSURE_FIELD_REQUIRED", message: `MiniProject Closure 必须填写有界的${label}。`, ruleRefs: ["D-048", "D-206"] });
    return answer.trim();
  };
  return {
    originalGoal: requireAnswer(value.originalGoal, "原目标"),
    actualResult: requireAnswer(value.actualResult, "实际结果"),
    remainingWork: requireAnswer(value.remainingWork, "遗留或转移说明；没有遗留时请明确写无"),
  };
}

const allowedPrimaryOwners: Readonly<Record<V2ObjectType, readonly V2ObjectType[]>> = {
  TASK: ["MINI_PROJECT", "PROJECT", "AREA"],
  MINI_PROJECT: ["PROJECT", "AREA"],
  PROJECT: ["AREA"],
  AREA: [],
  DECISION: [],
  OUTPUT: [],
};

export function assignV2PrimaryOwner(
  child: V2ManagedObject,
  owner: V2ManagedObject,
  expectedVersion: number,
  at = new Date(),
): { object: V2ManagedObject; ownership: V2PrimaryOwnership } {
  requireExpectedVersion(child, expectedVersion);
  if (child.objectId === owner.objectId || !allowedPrimaryOwners[child.objectType].includes(owner.objectType)) {
    throw new StructuredError({
      code: "V2_PRIMARY_OWNERSHIP_NOT_ALLOWED",
      message: `${child.objectType} 不能以 ${owner.objectType} 作为 Primary Owner。`,
      ruleRefs: ["D-035", "D-047"],
    });
  }
  const timestamp = at.toISOString();
  return {
    object: { ...child, version: child.version + 1, updatedAt: timestamp },
    ownership: { childObjectId: child.objectId, ownerObjectId: owner.objectId, assignedAt: timestamp },
  };
}

export function restoreV2PrimaryOwner(
  child: V2ManagedObject,
  previousOwner: V2ManagedObject | undefined,
  expectedVersion: number,
  at = new Date(),
): { object: V2ManagedObject; ownership?: V2PrimaryOwnership } {
  requireExpectedVersion(child, expectedVersion);
  const timestamp = at.toISOString();
  if (!previousOwner) return { object: { ...child, version: child.version + 1, updatedAt: timestamp } };
  const restored = assignV2PrimaryOwner(child, previousOwner, expectedVersion, at);
  return { object: restored.object, ownership: restored.ownership };
}

export function selectFocus(objectId: string, rank: number, at = new Date(), expiresAt?: string): FocusSelection {
  requireText(objectId, "FOCUS_OBJECT_REQUIRED", "Focus 必须引用正式对象。");
  if (!Number.isSafeInteger(rank) || rank < 0) {
    throw new StructuredError({ code: "FOCUS_RANK_INVALID", message: "Focus 排序必须是非负整数。", ruleRefs: ["D-148"] });
  }
  return { objectId, selectedAt: at.toISOString(), rank, ...(expiresAt ? { expiresAt } : {}) };
}
