import { StructuredError, createId } from "@task-copilot/shared";

export const V2_OBJECT_TYPES = ["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"] as const;
export type V2ObjectType = (typeof V2_OBJECT_TYPES)[number];

export const V2_LIFECYCLES = ["OPEN", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export type Lifecycle = (typeof V2_LIFECYCLES)[number];

export type V2Condition =
  | { kind: "ACTIONABLE" }
  | { kind: "WAITING"; waitingFor: string; expectedResult: string; reviewAt: string }
  | { kind: "BLOCKED"; reason: string; blockerObjectId?: string }
  | { kind: "PAUSED"; reason: string; reviewAt?: string };

export interface V2ManagedObject {
  objectId: string;
  objectType: V2ObjectType;
  version: number;
  lifecycle: Lifecycle;
  condition: V2Condition;
  text: string;
  createdAt: string;
  updatedAt: string;
  sourceOrCreationEvent: string;
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
      return condition;
    case "BLOCKED":
      requireText(condition.reason, "BLOCKED_REASON_REQUIRED", "BLOCKED 必须说明阻碍。");
      return condition;
    case "PAUSED":
      requireText(condition.reason, "PAUSED_REASON_REQUIRED", "PAUSED 必须说明暂停原因。");
      return condition;
  }
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

const lifecycleTransitions: Readonly<Record<Lifecycle, readonly Lifecycle[]>> = {
  OPEN: ["COMPLETED", "CANCELLED"],
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
    throw new StructuredError({
      code: "V2_ILLEGAL_LIFECYCLE_TRANSITION",
      message: `不允许从 ${object.lifecycle} 流转到 ${next}。`,
      ruleRefs: ["D-220"],
    });
  }
  return { ...object, lifecycle: next, version: object.version + 1, updatedAt: at.toISOString() };
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
  input: { objectType: V2ObjectType; text: string; contentHash: string },
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
  return {
    object: {
      ...object,
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

export function selectFocus(objectId: string, rank: number, at = new Date(), expiresAt?: string): FocusSelection {
  requireText(objectId, "FOCUS_OBJECT_REQUIRED", "Focus 必须引用正式对象。");
  if (!Number.isSafeInteger(rank) || rank < 0) {
    throw new StructuredError({ code: "FOCUS_RANK_INVALID", message: "Focus 排序必须是非负整数。", ruleRefs: ["D-148"] });
  }
  return { objectId, selectedAt: at.toISOString(), rank, ...(expiresAt ? { expiresAt } : {}) };
}
