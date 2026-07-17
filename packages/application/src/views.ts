import { calculateSignals, type AttentionSignal, type ManagedObject } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

import type { SystemState } from "./ports.ts";

export interface NowWorkItem {
  objectId: string;
  objectType: ManagedObject["objectType"];
  text: string;
  phase: ManagedObject["phase"];
  condition: ManagedObject["condition"];
  signals: AttentionSignal[];
  nextAction?: string;
  completionCriteria?: string;
}

export interface NowWorkView {
  goal: "开始行动并处理高价值注意项";
  items: NowWorkItem[];
  hidden: ["完整历史", "已结束对象", "内部属性", "低价值关联"];
}

export function projectNowWork(state: SystemState, now: Date): NowWorkView {
  const ended = new Set(["COMPLETED", "CANCELLED", "ARCHIVED", "RETIRED"]);
  const attention = new Set<AttentionSignal>(["OVERDUE", "REVIEW_DUE", "NO_NEXT_ACTION", "CONFLICT"]);
  const items = state.objects
    .filter((object) => !ended.has(object.phase))
    .map((object) => ({ object, signals: calculateSignals(object, state.relations, now) }))
    .filter(({ object, signals }) => object.condition.kind === "ACTIONABLE" || signals.some((signal) => attention.has(signal)))
    .map(({ object, signals }) => ({
      objectId: object.objectId,
      objectType: object.objectType,
      text: object.text,
      phase: object.phase,
      condition: object.condition,
      signals: signals.filter((signal) => attention.has(signal)),
      ...(object.nextAction ? { nextAction: object.nextAction } : {}),
      ...(object.completionCriteria ? { completionCriteria: object.completionCriteria } : {}),
    }));
  return { goal: "开始行动并处理高价值注意项", items, hidden: ["完整历史", "已结束对象", "内部属性", "低价值关联"] };
}

export interface ProjectReentryView {
  objectId: string;
  purpose: string;
  currentState: string;
  phase: ManagedObject["phase"];
  condition: ManagedObject["condition"];
  recentChanges: Array<{ at: string; summary: string }>;
  restoreAction: string;
  entryPoints: Array<{ anchorId: string; externalId: string; role: string }>;
  boundary?: { in?: string; out?: string };
  waitingOrBlocked?: string;
  unresolvedQuestions?: string[];
}

export function projectReentry(state: SystemState, objectId: string): ProjectReentryView {
  const object = state.objects.find((candidate) => candidate.objectId === objectId);
  if (!object || object.objectType !== "PROJECT") {
    throw new StructuredError({
      code: "PROJECT_NOT_FOUND",
      message: "只能为现有 Project 生成重入包。",
      ruleRefs: ["VIEW-RE-001"],
    });
  }
  const recentChanges = state.events
    .filter((event) => event.objectId === objectId)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 3)
    .map((event) => ({ at: event.timestamp, summary: event.operationType }));
  const entryPoints = state.anchors
    .filter((anchor) => anchor.objectId === objectId && anchor.status === "active")
    .slice(0, 3)
    .map((anchor) => ({ anchorId: anchor.anchorId, externalId: anchor.externalId, role: anchor.role }));
  const waitingOrBlocked =
    object.condition.kind === "WAITING"
      ? `等待 ${object.condition.waitingFor}：${object.condition.expectedResult}`
      : object.condition.kind === "BLOCKED"
        ? object.condition.reason
        : undefined;
  const questions = object.extensionData?.unresolvedQuestions;
  return {
    objectId,
    purpose: object.purpose ?? object.targetOutcome ?? object.text,
    currentState: object.currentSummary ?? object.text,
    phase: object.phase,
    condition: object.condition,
    recentChanges,
    restoreAction: object.nextAction ?? "打开主正文并确认当前推进",
    entryPoints,
    ...(object.scopeIn || object.scopeOut
      ? { boundary: { ...(object.scopeIn ? { in: object.scopeIn } : {}), ...(object.scopeOut ? { out: object.scopeOut } : {}) } }
      : {}),
    ...(waitingOrBlocked ? { waitingOrBlocked } : {}),
    ...(Array.isArray(questions) && questions.every((question) => typeof question === "string")
      ? { unresolvedQuestions: questions as string[] }
      : {}),
  };
}
