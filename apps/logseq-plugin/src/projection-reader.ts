import { canonicalizeGraphContent, stableHash, type ManagedProjection } from "@task-copilot/contracts";

import { renderProjection, reviewFieldUuid } from "./projection-renderer.ts";
import { readManagedFieldValue } from "./writing-convention.ts";

export interface LogseqBlock {
  uuid: string;
  content: string;
  rawContent: string;
  properties: Record<string, unknown>;
  children: LogseqBlock[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function logseqBlock(value: unknown): LogseqBlock | null {
  let candidate = object(value);
  if (!candidate && Array.isArray(value)) candidate = object(value.find((item) => object(item)?.uuid));
  if (!candidate || typeof candidate.uuid !== "string" || typeof candidate.content !== "string") return null;
  return {
    uuid: candidate.uuid,
    content: canonicalizeGraphContent(candidate.content),
    rawContent: candidate.content,
    properties: object(candidate.properties) ?? {},
    children: Array.isArray(candidate.children) ? candidate.children.map(logseqBlock).filter((item): item is LogseqBlock => item !== null) : [],
  };
}

function propertyValue(block: LogseqBlock, name: string): string | null {
  const raw = Object.entries(block.properties).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase())?.[1];
  return typeof raw === "string" ? raw.trim() : raw === undefined || raw === null ? null : JSON.stringify(raw);
}

function semanticLine(content: string, prefix: string): string | null {
  return content.split("\n").map((line) => line.trimStart()).find((line) => line.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) ?? null;
}

function legacyWaiting(block: LogseqBlock, workObjectId: string): ManagedProjection["waitingCondition"] {
  const lines = block.content.split("\n");
  const lineWith = (prefix: string) => lines.find((line) => line.trimStart().toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()))?.trimStart();
  const description = lineWith("等待：")?.slice(3).trim();
  const subject = lineWith("task-copilot-waiting-subject:: ")?.slice("task-copilot-waiting-subject:: ".length).trim() || propertyValue(block, "task-copilot-waiting-subject") || workObjectId;
  const since = lineWith("task-copilot-waiting-since:: ")?.slice("task-copilot-waiting-since:: ".length).trim() || propertyValue(block, "task-copilot-waiting-since");
  const reviewAt = lineWith("复查：")?.slice(3).trim() || null;
  const evidenceRaw = lineWith("task-copilot-waiting-evidence:: ")?.slice("task-copilot-waiting-evidence:: ".length).trim() || propertyValue(block, "task-copilot-waiting-evidence");
  if (!subject || !description || !since || !evidenceRaw) throw new Error("GRAPH_WAITING_CONDITION_INVALID");
  const evidenceIds = JSON.parse(evidenceRaw) as unknown;
  if (!Array.isArray(evidenceIds) || evidenceIds.some((id) => typeof id !== "string")) throw new Error("GRAPH_WAITING_CONDITION_INVALID");
  return { workObjectId: subject, description, since, reviewAt, evidenceIds };
}

/**
 * Bounded ownership reader for the Phase 1-5 engineering presentation. It is
 * used only to prove safe one-time convergence, never as the current semantic
 * identifier scheme.
 */
export function readLegacyEngineeringProjection(container: LogseqBlock, expected: ManagedProjection): ManagedProjection | null {
  const identity = /^> \[Task Copilot\]\ntask-copilot-managed:: true(?:\ntask-copilot-focus-uuid:: ([0-9a-f-]+))?(?:\ntask-copilot-waiting-uuid:: ([0-9a-f-]+))?$/u.exec(container.content);
  if (!identity) return null;
  const title = container.children.find((child) => semanticLine(child.content, "标题："));
  const state = container.children.find((child) => semanticLine(child.content, "状态："));
  const focus = container.children.find((child) => child.uuid === expected.focusUuid && semanticLine(child.content, "当前推进："));
  const waitingBlock = container.children.find((child) => child.uuid === expected.waitingUuid && semanticLine(child.content, "等待："));
  if (!title || !state || title.uuid !== expected.titleUuid || state.uuid !== expected.stateUuid || container.uuid !== expected.containerUuid) return null;
  if (identity[1] && identity[1] !== expected.focusUuid) return null;
  if (identity[2] && identity[2] !== expected.waitingUuid) return null;
  const stateMatch = /^状态：(OPEN|COMPLETED|CANCELLED) · (ACTIONABLE|WAITING|PARKED|null)$/u.exec(semanticLine(state.content, "状态：") ?? "");
  if (!stateMatch) return null;
  if (title.content.includes("\n") || focus?.content.includes("\n") || waitingBlock?.children.length || title.children.length || state.children.length || focus?.children.length) return null;
  const categories = state.content.split("\n").map((line) => {
    const value = line.trimStart().toLocaleLowerCase();
    if (value.startsWith("状态：")) return "state";
    if (value.startsWith("等待：")) return "waiting";
    if (value.startsWith("复查：")) return "review";
    if (value.startsWith("完成：")) return "completion";
    if (value.startsWith("取消：")) return "cancellation";
    if (value.startsWith("task-copilot-waiting-subject::")) return "subject";
    if (value.startsWith("task-copilot-waiting-since::")) return "since";
    if (value.startsWith("task-copilot-waiting-evidence::")) return "evidence";
    if (value.startsWith("task-copilot-closure::")) return "closure";
    return "unknown";
  });
  if (categories.includes("unknown") || new Set(categories).size !== categories.length) return null;
  const engagement = stateMatch[2] === "null" ? null : stateMatch[2] as ManagedProjection["engagement"];
  const embeddedWaiting = semanticLine(state.content, "等待：") ? legacyWaiting(state, expected.waitingCondition?.workObjectId ?? "") : null;
  const waitingCondition = embeddedWaiting ?? (waitingBlock ? legacyWaiting(waitingBlock, expected.waitingCondition?.workObjectId ?? "") : null);
  const closureRaw = semanticLine(state.content, "task-copilot-closure:: ")?.slice("task-copilot-closure:: ".length) || propertyValue(state, "task-copilot-closure");
  let closure: ManagedProjection["closure"] = null;
  if (closureRaw) {
    try { closure = JSON.parse(closureRaw) as ManagedProjection["closure"]; } catch { return null; }
  }
  const value = {
    containerUuid: container.uuid,
    titleUuid: title.uuid,
    stateUuid: state.uuid,
    focusUuid: expected.focusUuid,
    waitingUuid: expected.waitingUuid,
    title: semanticLine(title.content, "标题：")!.slice(3),
    lifecycle: stateMatch[1] as ManagedProjection["lifecycle"],
    engagement,
    waitingCondition,
    currentFocus: focus ? semanticLine(focus.content, "当前推进：")!.slice(5).trim() || null : null,
    ...(closure ? { closure } : {}),
  };
  const allowed = new Set([expected.titleUuid, expected.stateUuid, ...(focus ? [expected.focusUuid] : []), ...(waitingBlock ? [expected.waitingUuid] : [])]);
  if (container.children.some((child) => !allowed.has(child.uuid))) return null;
  return { ...value, projectionHash: stableHash(value) };
}

function canonicalSemantic(projection: ManagedProjection): unknown {
  const semantic: Partial<ManagedProjection> = { ...projection };
  delete semantic.projectionHash;
  return semantic;
}

function sameSemantic(actual: ManagedProjection, expected: ManagedProjection): boolean {
  return stableHash(canonicalSemantic(actual)) === stableHash(canonicalSemantic(expected));
}

export interface ProjectionReadResult {
  projection: ManagedProjection;
  mode: "CURRENT" | "LEGACY" | "CONFLICT";
}

export function readProjectionByIdentity(source: LogseqBlock, registeredBlocks: ReadonlyMap<string, LogseqBlock>, expected: ManagedProjection): ProjectionReadResult {
  const legacyRef = source.children.find((child) => child.uuid === expected.containerUuid);
  if (legacyRef) {
    const legacy = readLegacyEngineeringProjection(registeredBlocks.get(expected.containerUuid) ?? legacyRef, expected);
    if (legacy && sameSemantic(legacy, expected)) return { projection: expected, mode: "LEGACY" };
    return { projection: { ...expected, projectionHash: stableHash({ conflict: "legacy", expected: canonicalSemantic(expected), actual: legacyRef }) }, mode: "CONFLICT" };
  }

  const intents = renderProjection(expected);
  const expectedByUuid = new Map(intents.map((intent) => [intent.uuid, intent]));
  const managedUuids = new Set([expected.containerUuid, expected.titleUuid, expected.stateUuid, expected.focusUuid, expected.waitingUuid, reviewFieldUuid(expected.waitingUuid)]);
  const directUuids = new Set(source.children.map((child) => child.uuid));
  const observations = [...managedUuids].map((uuid) => {
    const block = registeredBlocks.get(uuid);
    const direct = directUuids.has(uuid);
    const intent = expectedByUuid.get(uuid);
    const singleLine = block ? !block.content.includes("\n") : true;
    const value = block ? readManagedFieldValue(block.content) : null;
    const valid = intent ? Boolean(block && direct && singleLine && block.children.length === 0 && value === intent.value) : !block;
    return { uuid, present: Boolean(block), direct, value, expected: intent?.value ?? null, valid };
  });
  const equivalent = observations.every((item) => item.valid);
  return equivalent
    ? { projection: expected, mode: "CURRENT" }
    : { projection: { ...expected, projectionHash: stableHash({ conflict: "writing-language-v1", identity: canonicalSemantic(expected), observations }) }, mode: "CONFLICT" };
}
