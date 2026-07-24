import type { FocusSelection, V2ManagedObject } from "@task-copilot/domain";

import {
  narrateV2ObjectStatus,
  type StatusNarration,
} from "./status-narration.ts";

export type DynamicNowReason =
  | "FOCUS_ACTIONABLE"
  | "BLOCKER_COMPLETED"
  | "REVIEW_DUE"
  | "DUE_SOON"
  | "FOCUS_BLOCKED"
  | "FOCUS_WAITING";

export interface DynamicNowShadowItem {
  object: V2ManagedObject;
  reason: DynamicNowReason;
  narration: StatusNarration;
}

export interface DynamicNowShadowProjection {
  visibility: "SHADOW";
  generatedAt: string;
  continueProcessing: DynamicNowShadowItem[];
  needsReview: DynamicNowShadowItem[];
  keepWaiting: DynamicNowShadowItem[];
  suggestedAttention: [];
  focusHint?: string;
  metrics: {
    rawOpenCount: number;
    projectedObjectCount: number;
    suppressedOpenCount: number;
    focusCount: number;
    focusOverload: boolean;
    reviewOverflowCount: number;
    waitingOverflowCount: number;
  };
}

export interface DynamicNowShadowInput {
  observedAt: string;
  objects: readonly V2ManagedObject[];
  focus: readonly FocusSelection[];
  sectionLimit?: number;
}

const SUPPORTED_TYPES = new Set<V2ManagedObject["objectType"]>(["TASK", "MINI_PROJECT", "PROJECT"]);
const DAY = 24 * 60 * 60 * 1_000;

function validAt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function item(
  object: V2ManagedObject,
  reason: DynamicNowReason,
  observedAt: string,
  objects: ReadonlyMap<string, V2ManagedObject>,
): DynamicNowShadowItem {
  const blocker = object.condition.kind === "BLOCKED" && object.condition.blockerObjectId
    ? objects.get(object.condition.blockerObjectId)
    : undefined;
  return {
    object,
    reason,
    narration: narrateV2ObjectStatus({
      observedAt,
      scene: "NOW",
      object,
      ...(blocker ? { blocker } : {}),
    }),
  };
}

function reviewReason(
  object: V2ManagedObject,
  focused: boolean,
  observedAt: number,
  objects: ReadonlyMap<string, V2ManagedObject>,
): { reason: DynamicNowReason; priority: number } | undefined {
  if (object.condition.kind === "BLOCKED" && object.condition.blockerObjectId) {
    const blocker = objects.get(object.condition.blockerObjectId);
    if (blocker?.lifecycle === "COMPLETED") return { reason: "BLOCKER_COMPLETED", priority: 70 };
  }
  if (
    (object.condition.kind === "WAITING" || object.condition.kind === "PAUSED")
    && validAt(object.condition.reviewAt) !== undefined
    && validAt(object.condition.reviewAt)! <= observedAt
  ) {
    return { reason: "REVIEW_DUE", priority: 60 };
  }
  const dueAt = validAt(object.dueAt);
  if (dueAt !== undefined && dueAt <= observedAt + 7 * DAY) {
    return { reason: "DUE_SOON", priority: 50 };
  }
  if (focused && object.condition.kind === "BLOCKED") return { reason: "FOCUS_BLOCKED", priority: 40 };
  return undefined;
}

export function projectV2DynamicNowShadow(input: DynamicNowShadowInput): DynamicNowShadowProjection {
  const observedAt = Date.parse(input.observedAt);
  if (!Number.isFinite(observedAt)) throw new Error("Dynamic Now observedAt must be a valid timestamp.");
  const sectionLimit = input.sectionLimit ?? 12;
  if (!Number.isInteger(sectionLimit) || sectionLimit < 1 || sectionLimit > 100) {
    throw new Error("Dynamic Now sectionLimit must be an integer between 1 and 100.");
  }
  const objectIds = input.objects.map((object) => object.objectId);
  if (new Set(objectIds).size !== objectIds.length) {
    throw new Error("Dynamic Now objects must have unique identities.");
  }
  const focusIds = input.focus.map((selection) => selection.objectId);
  if (new Set(focusIds).size !== focusIds.length) {
    throw new Error("Dynamic Now Focus must contain each object at most once.");
  }
  if (input.focus.some((selection) =>
    selection.expiresAt !== undefined && !Number.isFinite(Date.parse(selection.expiresAt))
  )) {
    throw new Error("Dynamic Now Focus expiresAt must be a valid timestamp.");
  }

  const openObjects = input.objects.filter((object) => object.lifecycle === "OPEN");
  const objectsById = new Map(input.objects.map((object) => [object.objectId, object]));
  const openById = new Map(openObjects.map((object) => [object.objectId, object]));
  const activeFocus = [...input.focus]
    .filter((selection) => !selection.expiresAt || Date.parse(selection.expiresAt) > observedAt)
    .sort((left, right) =>
      left.rank - right.rank
      || left.selectedAt.localeCompare(right.selectedAt)
      || left.objectId.localeCompare(right.objectId)
    );
  const focusRank = new Map(activeFocus.map((selection, index) => [selection.objectId, index]));

  const reviewCandidates = openObjects
    .filter((object) => SUPPORTED_TYPES.has(object.objectType))
    .flatMap((object) => {
      const review = reviewReason(object, focusRank.has(object.objectId), observedAt, objectsById);
      return review ? [{ object, ...review }] : [];
    })
    .sort((left, right) =>
      right.priority - left.priority
      || left.object.objectId.localeCompare(right.object.objectId)
    );
  const reviewIds = new Set(reviewCandidates.map(({ object }) => object.objectId));
  const needsReview = reviewCandidates
    .slice(0, sectionLimit)
    .map(({ object, reason }) => item(object, reason, input.observedAt, objectsById));

  const continueProcessing = activeFocus.flatMap((selection) => {
    const object = openById.get(selection.objectId);
    return object
      && SUPPORTED_TYPES.has(object.objectType)
      && object.condition.kind === "ACTIONABLE"
      && !reviewIds.has(object.objectId)
      ? [item(object, "FOCUS_ACTIONABLE", input.observedAt, objectsById)]
      : [];
  });

  const waitingCandidates = activeFocus.flatMap((selection) => {
    const object = openById.get(selection.objectId);
    return object
      && SUPPORTED_TYPES.has(object.objectType)
      && (object.condition.kind === "WAITING" || object.condition.kind === "PAUSED")
      && !reviewIds.has(object.objectId)
      ? [object]
      : [];
  });
  const keepWaiting = waitingCandidates
    .slice(0, sectionLimit)
    .map((object) => item(object, "FOCUS_WAITING", input.observedAt, objectsById));

  const projectedIds = new Set([
    ...continueProcessing.map(({ object }) => object.objectId),
    ...needsReview.map(({ object }) => object.objectId),
    ...keepWaiting.map(({ object }) => object.objectId),
  ]);
  const focusCount = activeFocus.length;
  return {
    visibility: "SHADOW",
    generatedAt: input.observedAt,
    continueProcessing,
    needsReview,
    keepWaiting,
    suggestedAttention: [],
    ...(focusCount > 7
      ? { focusHint: `当前关注已有 ${focusCount} 项；可以在方便时自行整理，系统不会自动移出。` }
      : {}),
    metrics: {
      rawOpenCount: openObjects.length,
      projectedObjectCount: projectedIds.size,
      suppressedOpenCount: Math.max(0, openObjects.length - projectedIds.size),
      focusCount,
      focusOverload: focusCount > 7,
      reviewOverflowCount: Math.max(0, reviewCandidates.length - needsReview.length),
      waitingOverflowCount: Math.max(0, waitingCandidates.length - keepWaiting.length),
    },
  };
}
