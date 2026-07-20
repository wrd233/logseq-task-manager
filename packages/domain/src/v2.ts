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

export function selectFocus(objectId: string, rank: number, at = new Date(), expiresAt?: string): FocusSelection {
  requireText(objectId, "FOCUS_OBJECT_REQUIRED", "Focus 必须引用正式对象。");
  if (!Number.isSafeInteger(rank) || rank < 0) {
    throw new StructuredError({ code: "FOCUS_RANK_INVALID", message: "Focus 排序必须是非负整数。", ruleRefs: ["D-148"] });
  }
  return { objectId, selectedAt: at.toISOString(), rank, ...(expiresAt ? { expiresAt } : {}) };
}
