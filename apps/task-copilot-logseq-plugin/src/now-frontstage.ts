import type { ServiceNowWork, ServiceNowWorkItem } from "@task-copilot/service-client";

export interface NowFrontstageItem {
  item: ServiceNowWorkItem;
  focused: boolean;
  focusRank?: number;
}

export interface NowFrontstageSections {
  continueProcessing: NowFrontstageItem[];
  needsReview: NowFrontstageItem[];
  keepWaiting: NowFrontstageItem[];
}

function timestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function waitingNeedsReview(item: ServiceNowWorkItem, generatedAt: number): boolean {
  if (item.condition.kind === "BLOCKED") return true;
  if (item.condition.kind !== "WAITING" && item.condition.kind !== "PAUSED") return false;
  const reviewAt = timestamp(item.condition.reviewAt);
  return reviewAt !== undefined && reviewAt <= generatedAt;
}

export function projectNowFrontstageSections(nowWork: ServiceNowWork): NowFrontstageSections {
  const generatedAt = Date.parse(nowWork.generatedAt);
  if (!Number.isFinite(generatedAt)) throw new Error("Now frontstage generatedAt must be valid.");

  const focusRank = new Map(nowWork.focus.map((item, index) => [item.objectId, index]));
  const seen = new Set<string>();
  const continueProcessing: NowFrontstageItem[] = [];
  const needsReview: NowFrontstageItem[] = [];
  const keepWaiting: NowFrontstageItem[] = [];

  const append = (item: ServiceNowWorkItem, source: "FOCUS" | "NEXT" | "WAITING_REVIEW"): void => {
    if (seen.has(item.objectId)) return;
    seen.add(item.objectId);
    const rank = focusRank.get(item.objectId);
    const projected: NowFrontstageItem = {
      item,
      focused: rank !== undefined,
      ...(rank !== undefined ? { focusRank: rank } : {}),
    };
    if (
      item.condition.kind === "WAITING"
      || item.condition.kind === "PAUSED"
      || item.condition.kind === "BLOCKED"
      || source === "WAITING_REVIEW"
    ) {
      (waitingNeedsReview(item, generatedAt) ? needsReview : keepWaiting).push(projected);
      return;
    }
    const dueAt = timestamp(item.dueAt);
    if (source === "NEXT" && dueAt !== undefined && dueAt <= generatedAt) {
      needsReview.push(projected);
      return;
    }
    continueProcessing.push(projected);
  };

  for (const item of nowWork.focus) append(item, "FOCUS");
  for (const item of nowWork.waitingReview) append(item, "WAITING_REVIEW");
  for (const item of nowWork.next) append(item, "NEXT");

  return { continueProcessing, needsReview, keepWaiting };
}
