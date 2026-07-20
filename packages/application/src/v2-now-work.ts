import type { FocusSelection, V2ManagedObject } from "@task-copilot/domain";

export interface V2NowWorkItem {
  objectId: string;
  objectType: V2ManagedObject["objectType"];
  version: number;
  text: string;
  condition: V2ManagedObject["condition"];
  dueAt?: string;
  updatedAt: string;
  reason: string;
}

export interface V2NowWorkProjection {
  generatedAt: string;
  focus: V2NowWorkItem[];
  next: V2NowWorkItem[];
  waitingReview: V2NowWorkItem[];
}

function item(object: V2ManagedObject, reason: string): V2NowWorkItem {
  return { objectId: object.objectId, objectType: object.objectType, version: object.version, text: object.text, condition: object.condition, ...(object.dueAt ? { dueAt: object.dueAt } : {}), updatedAt: object.updatedAt, reason };
}

export function projectV2NowWork(
  objects: readonly V2ManagedObject[],
  selections: readonly FocusSelection[],
  at = new Date(),
  nextLimit = 12,
): V2NowWorkProjection {
  const open = new Map(objects.filter((object) => object.lifecycle === "OPEN").map((object) => [object.objectId, object]));
  const focus = [...selections].sort((left, right) => left.rank - right.rank || left.selectedAt.localeCompare(right.selectedAt))
    .flatMap((selection) => {
      const object = open.get(selection.objectId);
      return object && (!selection.expiresAt || Date.parse(selection.expiresAt) > at.getTime()) ? [item(object, "已加入当前关注")] : [];
    });
  const focusIds = new Set(focus.map((value) => value.objectId));
  const blockedFocusByBlocker = new Map<string, V2NowWorkItem[]>();
  for (const focused of focus) {
    if (focused.condition.kind !== "BLOCKED" || !focused.condition.blockerObjectId) continue;
    const blocked = blockedFocusByBlocker.get(focused.condition.blockerObjectId) ?? [];
    blocked.push(focused);
    blockedFocusByBlocker.set(focused.condition.blockerObjectId, blocked);
  }
  const waitingReview = [...open.values()].filter((object) => {
    if (object.condition.kind === "WAITING") return Date.parse(object.condition.reviewAt) <= at.getTime() || focusIds.has(object.objectId) || blockedFocusByBlocker.has(object.objectId);
    if (object.condition.kind === "PAUSED") return (object.condition.reviewAt !== undefined && Date.parse(object.condition.reviewAt) <= at.getTime()) || blockedFocusByBlocker.has(object.objectId);
    return object.condition.kind === "BLOCKED" && (focusIds.has(object.objectId) || blockedFocusByBlocker.has(object.objectId));
  }).map((object) => {
    const blocksFocus = blockedFocusByBlocker.has(object.objectId);
    if (blocksFocus && object.condition.kind === "WAITING") return item(object, `阻碍当前关注 · 等待 ${object.condition.waitingFor}`);
    if (blocksFocus && (object.condition.kind === "BLOCKED" || object.condition.kind === "PAUSED")) return item(object, `阻碍当前关注 · ${object.condition.reason}`);
    return item(object, object.condition.kind === "WAITING" ? `复查已到 · 等待 ${object.condition.waitingFor}` : object.condition.kind === "BLOCKED" ? `阻碍当前关注 · ${object.condition.reason}` : "暂停复查已到");
  });
  const waitingIds = new Set(waitingReview.map((value) => value.objectId));
  const recentBoundary = at.getTime() - 14 * 24 * 60 * 60 * 1000;
  const dueBoundary = at.getTime() + 7 * 24 * 60 * 60 * 1000;
  const dueTime = (object: V2ManagedObject) => object.dueAt ? Date.parse(object.dueAt) : Number.POSITIVE_INFINITY;
  const next = [...open.values()]
    .filter((object) => !focusIds.has(object.objectId) && !waitingIds.has(object.objectId) && object.condition.kind === "ACTIONABLE" && ["TASK", "MINI_PROJECT", "PROJECT"].includes(object.objectType) && (Date.parse(object.updatedAt) >= recentBoundary || dueTime(object) <= dueBoundary || blockedFocusByBlocker.has(object.objectId)))
    .sort((left, right) => dueTime(left) - dueTime(right) || Number(blockedFocusByBlocker.has(right.objectId)) - Number(blockedFocusByBlocker.has(left.objectId)) || right.updatedAt.localeCompare(left.updatedAt) || left.objectId.localeCompare(right.objectId))
    .slice(0, Math.max(0, nextLimit))
    .map((object) => {
      const deadline = dueTime(object);
      if (deadline <= at.getTime()) return item(object, "明确期限已到");
      if (deadline <= dueBoundary) return item(object, `明确期限在 ${Math.max(1, Math.ceil((deadline - at.getTime()) / (24 * 60 * 60 * 1000)))} 天内`);
      const blockedFocus = blockedFocusByBlocker.get(object.objectId);
      if (blockedFocus?.length) return item(object, `阻碍当前关注 · ${blockedFocus.map((value) => value.text).join("；")}`);
      return item(object, object.createdAt === object.updatedAt ? "近期建立，可直接推进" : "近期更新，可继续推进");
    });
  return { generatedAt: at.toISOString(), focus, next, waitingReview };
}
