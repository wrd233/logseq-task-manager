import type { WaitingCondition, WorkObject } from "@task-copilot/domain";

export type UserCorrectionOperation =
  | { operationType: "CHANGE_ENGAGEMENT"; input: { from: WorkObject["engagement"]; to: "ACTIONABLE" | "WAITING"; waiting: WaitingCondition | null } }
  | { operationType: "SET_CURRENT_FOCUS"; input: { currentFocus: string | null } };

function normalize(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function extractAfter(value: string, markers: readonly string[]): string | null {
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index >= 0) {
      const rest = value.slice(index + marker.length).replace(/^[:：,，.。]+\s*/u, "").replace(/^是/u, "").trim();
      if (rest) return rest;
    }
  }
  return null;
}

/**
 * Minimal deterministic parser for Production Dogfood natural-language
 * corrections. It intentionally supports only the two low-risk automatic
 * maintenance dimensions: engagement (ACTIONABLE/WAITING) and current_focus.
 * Anything else returns null so the caller can ask for clarification.
 */
export function parseUserCorrectionUtterance(object: WorkObject, utterance: string): UserCorrectionOperation | null {
  const text = normalize(utterance);
  if (!text) return null;

  const isNegative = /不是|不对|没等|没有等待|不需要等|不用等|还能继续|可以继续|仍可|继续做|继续推进|还在做|仍然有/u.test(text);
  const wantsWaiting = /等待|要等|需要等|卡住|等不到|等审批|等回复|等厂商|等新版/u.test(text);
  const wantsFocus = /当前推进|现在做|重点在做|正在做|推进点|实际在做|改为/u.test(text);
  const wantsClearFocus = /清空推进|没有推进|无推进/u.test(text);

  if (wantsWaiting && !isNegative) {
    const description = extractAfter(text, ["等待", "等", "卡住"]) ?? text.replace(/^(请|系统|现在|目前)/u, "").trim();
    const waiting: WaitingCondition = {
      workObjectId: object.id,
      description: description.slice(0, 200),
      since: new Date().toISOString(),
      reviewAt: null,
      evidenceIds: [],
    };
    return {
      operationType: "CHANGE_ENGAGEMENT",
      input: { from: object.engagement, to: "WAITING", waiting },
    };
  }

  if (isNegative && object.engagement === "WAITING") {
    return {
      operationType: "CHANGE_ENGAGEMENT",
      input: { from: object.engagement, to: "ACTIONABLE", waiting: null },
    };
  }

  if (wantsClearFocus) {
    return { operationType: "SET_CURRENT_FOCUS", input: { currentFocus: null } };
  }

  if (wantsFocus) {
    const currentFocus = extractAfter(text, ["当前推进", "现在做", "重点在做", "正在做", "推进点", "实际在做", "改为", "是"]) ?? text;
    return { operationType: "SET_CURRENT_FOCUS", input: { currentFocus: currentFocus.slice(0, 200) } };
  }

  if (isNegative && object.engagement !== "WAITING") {
    return {
      operationType: "CHANGE_ENGAGEMENT",
      input: { from: object.engagement, to: "ACTIONABLE", waiting: null },
    };
  }

  return null;
}
