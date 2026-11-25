import { parseWorkRef, type WorkRef } from "@task-copilot/contracts";
import {
  DEFAULT_SEMANTIC_SLOTS,
  buildSlotFrictionPrompt,
  buildWeekFrictionPrompt,
  computeSlotRemainingMinutes,
  computeWeekCapacitySummary,
  dateKeyFromMs,
  offsetDate,
  slotDisplayLabel,
  validClockTime,
  validDate,
  weekKeyFor,
} from "./time-model.ts";
import type {
  ActiveFocusSession,
  CalendarDiagnostics,
  CalendarHardEvent,
  CalendarShieldInfo,
  CompletedFocusRecord,
  DayCandidate,
  DayPlanSubject,
  DaySlotItem,
  GentleFrictionInfo,
  SlotSnapshot,
  TimeGhostProposal,
  TimeRegistryFile,
  TimeResolveDecision,
  TimeResolveResult,
  TimeSlotId,
  TimeSnapshot,
  TimeUserAction,
  WeekMoveItem,
} from "./time-types.ts";
import type { StageFocusRole } from "./types.ts";

const DEFAULT_FOOTPRINT_CALENDAR = "Task Copilot 足迹";

function isSlotId(value: unknown): value is TimeSlotId {
  return value === "morning" || value === "afternoon" || value === "evening";
}

function cleanText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : undefined;
}

function safeWorkRef(value: unknown): WorkRef | null {
  if (!value || typeof value !== "object") return null;
  try {
    return parseWorkRef(value);
  } catch {
    return null;
  }
}

function focusRoleShortLabel(role?: StageFocusRole): string {
  switch (role) {
    case "main":
      return "主线";
    case "side":
      return "支线";
    case "maintenance":
      return "维护";
    case "parked":
      return "搁置";
    default:
      return "推进";
  }
}

export function emptyTimeRegistry(now = Date.now()): TimeRegistryFile {
  return {
    schemaVersion: 1,
    weekMoves: [],
    dayItems: [],
    activeFocus: null,
    focusHistory: [],
    footprintCalendarEnabled: false,
    footprintCalendarName: DEFAULT_FOOTPRINT_CALENDAR,
    updatedAt: now,
  };
}

export function parseTimeRegistry(input: unknown, now = Date.now()): TimeRegistryFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return emptyTimeRegistry(now);
  }
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return emptyTimeRegistry(now);

  const weekMoves: WeekMoveItem[] = [];
  if (Array.isArray(raw.weekMoves)) {
    for (const item of raw.weekMoves) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const id = cleanText(rec.id, 128);
      const title = cleanText(rec.title, 200);
      const wk = validDate(rec.weekKey) ? weekKeyFor(rec.weekKey) : null;
      if (!id || !title || !wk) continue;
      const state = rec.state === "done" || rec.state === "dropped" ? rec.state : "open";
      const createdAt = typeof rec.createdAt === "number" && Number.isFinite(rec.createdAt) ? rec.createdAt : now;
      const updatedAt = typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : createdAt;
      const lastStopNote = cleanText(rec.lastStopNote, 240);
      const lastBlockUuid = cleanText(rec.lastBlockUuid, 128);
      const sourceAdvancementId = cleanText(rec.sourceAdvancementId, 128);
      const sourceInboxId = cleanText(rec.sourceInboxId, 128);
      const workRef = safeWorkRef(rec.workRef);
      weekMoves.push({
        id,
        weekKey: wk,
        title,
        areaId: typeof rec.areaId === "string" ? rec.areaId : null,
        projectWorkKey: typeof rec.projectWorkKey === "string" ? rec.projectWorkKey : null,
        ...(workRef ? { workRef } : {}),
        ...(sourceAdvancementId ? { sourceAdvancementId } : {}),
        ...(sourceInboxId ? { sourceInboxId } : {}),
        state,
        actualMinutes: typeof rec.actualMinutes === "number" && Number.isFinite(rec.actualMinutes) ? Math.max(0, Math.round(rec.actualMinutes)) : 0,
        ...(lastStopNote ? { lastStopNote } : {}),
        ...(lastBlockUuid ? { lastBlockUuid } : {}),
        createdAt,
        updatedAt,
      });
    }
  }

  const dayItems: DaySlotItem[] = [];
  const dayCandidates: DayCandidate[] = [];
  const dayEntries = [...(Array.isArray(raw.dayItems) ? raw.dayItems : []), ...(Array.isArray(raw.dayCandidates) ? raw.dayCandidates : [])];
  for (const item of dayEntries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id = cleanText(rec.id, 128);
    const title = cleanText(rec.title, 200);
    const date = validDate(rec.date) ? rec.date : null;
    const slotId = isSlotId(rec.slotId) ? rec.slotId : null;
    if (!id || !title || !date) continue;
    const state = rec.state === "done" || rec.state === "dropped" ? rec.state : "open";
    const createdAt = typeof rec.createdAt === "number" && Number.isFinite(rec.createdAt) ? rec.createdAt : now;
    const updatedAt = typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : createdAt;
    const lastStopNote = cleanText(rec.lastStopNote, 240);
    const lastBlockUuid = cleanText(rec.lastBlockUuid, 128);
    const lastCarryoverDate = validDate(rec.lastCarryoverDate) ? rec.lastCarryoverDate : undefined;
    const workRef = safeWorkRef(rec.workRef);
    let calendarShield: CalendarShieldInfo | undefined;
    if (rec.calendarShield && typeof rec.calendarShield === "object" && !Array.isArray(rec.calendarShield)) {
      const sh = rec.calendarShield as Record<string, unknown>;
      const eventId = cleanText(sh.eventId, 200);
      const calendarName = cleanText(sh.calendarName, 120);
      if (eventId && calendarName && validDate(sh.date) && validClockTime(sh.startTime) && validClockTime(sh.endTime)) {
        calendarShield = {
          eventId,
          calendarName,
          date: sh.date,
          startTime: sh.startTime,
          endTime: sh.endTime,
          createdAt: typeof sh.createdAt === "number" && Number.isFinite(sh.createdAt) ? sh.createdAt : updatedAt,
        };
      }
    }
    const context = cleanText(rec.context, 400);
    const sourceInboxId = cleanText(rec.sourceInboxId, 256);
    const entry: DayCandidate = {
      id,
      date,
      title,
      weekMoveId: typeof rec.weekMoveId === "string" ? rec.weekMoveId : null,
      areaId: typeof rec.areaId === "string" ? rec.areaId : null,
      projectWorkKey: typeof rec.projectWorkKey === "string" ? rec.projectWorkKey : null,
      ...(workRef ? { workRef } : {}),
      ...(context ? { context } : {}),
      ...(sourceInboxId ? { sourceInboxId } : {}),
      actualMinutes: typeof rec.actualMinutes === "number" && Number.isFinite(rec.actualMinutes) ? Math.max(0, Math.round(rec.actualMinutes)) : 0,
      carryoverCount: typeof rec.carryoverCount === "number" && Number.isFinite(rec.carryoverCount) ? Math.max(0, Math.floor(rec.carryoverCount)) : 0,
      ...(lastCarryoverDate ? { lastCarryoverDate } : {}),
      ...(lastStopNote ? { lastStopNote } : {}),
      ...(lastBlockUuid ? { lastBlockUuid } : {}),
      ...(calendarShield ? { calendarShield } : {}),
      createdAt,
      updatedAt,
    };
    if (slotId) dayItems.push({ ...entry, slotId, state });
    else if (rec.slotId === undefined) dayCandidates.push(entry);
  }

  let activeFocus: ActiveFocusSession | null = null;
  if (raw.activeFocus && typeof raw.activeFocus === "object" && !Array.isArray(raw.activeFocus)) {
    const af = raw.activeFocus as Record<string, unknown>;
    const id = cleanText(af.id, 128);
    const title = cleanText(af.title, 200);
    const date = validDate(af.date) ? af.date : dateKeyFromMs(now);
    const slotId = isSlotId(af.slotId) ? af.slotId : "morning";
    if (id && title) {
      const startedAt = typeof af.startedAt === "number" && Number.isFinite(af.startedAt) ? af.startedAt : now;
      const resumedAt = typeof af.resumedAt === "number" && Number.isFinite(af.resumedAt) ? af.resumedAt : startedAt;
      const workRef = safeWorkRef(af.workRef);
      const stopNote = cleanText(af.stopNote, 240);
      const lastBlockUuid = cleanText(af.lastBlockUuid, 128);
      activeFocus = {
        id,
        title,
        slotId,
        roleLabel: cleanText(af.roleLabel, 24) ?? "推进",
        date,
        dayItemId: typeof af.dayItemId === "string" ? af.dayItemId : null,
        weekMoveId: typeof af.weekMoveId === "string" ? af.weekMoveId : null,
        areaId: typeof af.areaId === "string" ? af.areaId : null,
        projectWorkKey: typeof af.projectWorkKey === "string" ? af.projectWorkKey : null,
        ...(workRef ? { workRef } : {}),
        status: af.status === "paused" ? "paused" : "running",
        startedAt,
        resumedAt,
        ...(typeof af.pausedAt === "number" && Number.isFinite(af.pausedAt) ? { pausedAt: af.pausedAt } : {}),
        accumulatedSeconds: typeof af.accumulatedSeconds === "number" && Number.isFinite(af.accumulatedSeconds) ? Math.max(0, Math.floor(af.accumulatedSeconds)) : 0,
        ...(stopNote ? { stopNote } : {}),
        ...(lastBlockUuid ? { lastBlockUuid } : {}),
        ...(typeof af.pendingNavigationAt === "number" && Number.isFinite(af.pendingNavigationAt) ? { pendingNavigationAt: af.pendingNavigationAt } : {}),
      };
    }
  }

  const focusHistory: CompletedFocusRecord[] = [];
  if (Array.isArray(raw.focusHistory)) {
    for (const item of raw.focusHistory.slice(-400)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const id = cleanText(rec.id, 128);
      const title = cleanText(rec.title, 200);
      const date = validDate(rec.date) ? rec.date : null;
      const slotId = isSlotId(rec.slotId) ? rec.slotId : "morning";
      if (!id || !title || !date) continue;
      const startedAt = typeof rec.startedAt === "number" && Number.isFinite(rec.startedAt) ? rec.startedAt : now;
      const endedAt = typeof rec.endedAt === "number" && Number.isFinite(rec.endedAt) ? rec.endedAt : startedAt;
      const stopNote = cleanText(rec.stopNote, 240);
      const lastBlockUuid = cleanText(rec.lastBlockUuid, 128);
      const workRef = safeWorkRef(rec.workRef);
      const footprintEventId = cleanText(rec.footprintEventId, 200);
      focusHistory.push({
        id,
        title,
        slotId,
        date,
        weekKey: validDate(rec.weekKey) ? weekKeyFor(rec.weekKey) : weekKeyFor(date),
        dayItemId: typeof rec.dayItemId === "string" ? rec.dayItemId : null,
        weekMoveId: typeof rec.weekMoveId === "string" ? rec.weekMoveId : null,
        areaId: typeof rec.areaId === "string" ? rec.areaId : null,
        projectWorkKey: typeof rec.projectWorkKey === "string" ? rec.projectWorkKey : null,
        startedAt,
        endedAt,
        durationMinutes: typeof rec.durationMinutes === "number" && Number.isFinite(rec.durationMinutes) ? Math.max(0, Math.round(rec.durationMinutes)) : 0,
        ...(stopNote ? { stopNote } : {}),
        ...(lastBlockUuid ? { lastBlockUuid } : {}),
        ...(workRef ? { workRef } : {}),
        ...(footprintEventId ? { footprintEventId } : {}),
      });
    }
  }

  const lastWorkbenchActiveAt =
    typeof raw.lastWorkbenchActiveAt === "number" && Number.isFinite(raw.lastWorkbenchActiveAt)
      ? raw.lastWorkbenchActiveAt
      : undefined;
  const restartDismissedDate = validDate(raw.restartDismissedDate) ? raw.restartDismissedDate : undefined;

  return {
    schemaVersion: 1,
    weekMoves,
    dayItems,
    dayCandidates,
    activeFocus,
    focusHistory,
    footprintCalendarEnabled: raw.footprintCalendarEnabled === true,
    footprintCalendarName: cleanText(raw.footprintCalendarName, 80) ?? DEFAULT_FOOTPRINT_CALENDAR,
    ...(lastWorkbenchActiveAt !== undefined ? { lastWorkbenchActiveAt } : {}),
    ...(restartDismissedDate ? { restartDismissedDate } : {}),
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

function makeId(prefix: string, seq: number, now: number): string {
  return `${prefix}-${now.toString(36)}-${seq.toString(36)}`;
}

export class TimeEngine {
  private registry: TimeRegistryFile;
  private ghostProposals: TimeGhostProposal[] = [];
  private undoSnapshot: { registry: TimeRegistryFile; restoredProposals: TimeGhostProposal[] } | null = null;
  private seq = 1;

  constructor(initial?: TimeRegistryFile, now = Date.now()) {
    this.registry = initial ? structuredClone(initial) : emptyTimeRegistry(now);
  }

  getRegistry(): TimeRegistryFile {
    return structuredClone(this.registry);
  }

  replaceRegistry(next: TimeRegistryFile): void {
    this.registry = structuredClone(next);
  }

  getGhostProposals(): TimeGhostProposal[] {
    return structuredClone(this.ghostProposals);
  }

  private captureUndo(restoredProposals: TimeGhostProposal[] = []): void {
    this.undoSnapshot = {
      registry: structuredClone(this.registry),
      restoredProposals: structuredClone(restoredProposals),
    };
  }

  /**
   * Idempotently marks open past-date day items as carryover items (incrementing carryoverCount at most once per calendar day).
   * Never snowballs unfinished items into today's 3 semantic slots!
   */
  syncCarryover(now = Date.now()): boolean {
    const today = dateKeyFromMs(now);
    let mutated = false;
    if (this.registry.lastWorkbenchActiveAt === undefined) {
      const timestamps: number[] = [];
      for (const r of this.registry.focusHistory) timestamps.push(r.endedAt);
      for (const i of this.registry.dayItems) timestamps.push(i.updatedAt);
      for (const m of this.registry.weekMoves) timestamps.push(m.updatedAt);
      if (timestamps.length > 0) {
        this.registry.lastWorkbenchActiveAt = Math.max(...timestamps);
      }
    }
    for (const item of this.registry.dayItems) {
      if (item.state !== "open") continue;
      if (item.date < today && item.lastCarryoverDate !== today) {
        item.carryoverCount = (item.carryoverCount ?? 0) + 1;
        item.lastCarryoverDate = today;
        item.updatedAt = now;
        mutated = true;
      }
    }
    if (mutated) this.registry.updatedAt = now;
    return mutated;
  }

  checkSlotFriction(date: string, slotId: TimeSlotId): GentleFrictionInfo | null {
    const openTitles = this.registry.dayItems
      .filter((i) => i.state === "open" && i.date === date && i.slotId === slotId)
      .map((i) => i.title);
    return buildSlotFrictionPrompt(slotId, openTitles);
  }

  checkWeekFriction(weekKey: string, recommendedMax = 5): GentleFrictionInfo | null {
    const wk = weekKeyFor(weekKey);
    const openTitles = this.registry.weekMoves
      .filter((m) => m.state === "open" && m.weekKey === wk)
      .map((m) => m.title);
    return buildWeekFrictionPrompt(wk, recommendedMax, openTitles);
  }

  // ==================== DIRECT USER MUTATIONS (WITH 1-STEP UNDO) ====================

  addWeekMove(
    input: {
      title: string;
      weekKey?: string;
      areaId?: string | null;
      projectWorkKey?: string | null;
      workRef?: WorkRef | null;
      sourceAdvancementId?: string;
      sourceInboxId?: string;
    },
    now = Date.now(),
    recordUndo = true,
  ): WeekMoveItem {
    const title = cleanText(input.title, 200);
    if (!title) throw new Error("WEEK_MOVE_TITLE_REQUIRED");
    if (recordUndo) this.captureUndo();
    const wk = input.weekKey && validDate(input.weekKey) ? weekKeyFor(input.weekKey) : weekKeyFor(dateKeyFromMs(now));
    const item: WeekMoveItem = {
      id: makeId("wmove", this.seq++, now),
      weekKey: wk,
      title,
      areaId: input.areaId ?? null,
      projectWorkKey: input.projectWorkKey ?? null,
      ...(input.workRef ? { workRef: input.workRef } : {}),
      ...(input.sourceAdvancementId ? { sourceAdvancementId: input.sourceAdvancementId } : {}),
      ...(input.sourceInboxId ? { sourceInboxId: input.sourceInboxId } : {}),
      state: "open",
      actualMinutes: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.registry.weekMoves.push(item);
    this.registry.lastWorkbenchActiveAt = now;
    this.registry.updatedAt = now;
    return structuredClone(item);
  }

  toggleWeekMoveState(moveId: string, state?: "open" | "done" | "dropped", now = Date.now()): boolean {
    const move = this.registry.weekMoves.find((m) => m.id === moveId);
    if (!move) return false;
    this.captureUndo();
    move.state = state ?? (move.state === "done" ? "open" : "done");
    move.updatedAt = now;
    this.registry.updatedAt = now;
    return true;
  }

  removeWeekMove(moveId: string, now = Date.now()): boolean {
    const idx = this.registry.weekMoves.findIndex((m) => m.id === moveId);
    if (idx === -1) return false;
    this.captureUndo();
    this.registry.weekMoves.splice(idx, 1);
    this.registry.updatedAt = now;
    return true;
  }

  addDayCandidate(input: DayPlanSubject & { date: string }, now = Date.now()): boolean {
    const title = cleanText(input.title, 200);
    if (!title || !validDate(input.date)) throw new Error("DAY_CANDIDATE_INVALID");
    const candidates = this.registry.dayCandidates ??= [];
    const sourceInboxId = cleanText(input.sourceInboxId, 256);
    if (sourceInboxId && (
      candidates.some((item) => item.sourceInboxId === sourceInboxId) ||
      this.registry.dayItems.some((item) => item.sourceInboxId === sourceInboxId && item.state !== "dropped")
    )) return false;

    const context = cleanText(input.context, 400);
    const workRef = safeWorkRef(input.workRef);
    this.captureUndo();
    candidates.push({
      id: makeId("dcand", this.seq++, now),
      date: input.date,
      title,
      areaId: input.areaId ?? null,
      projectWorkKey: input.projectWorkKey ?? null,
      ...(workRef ? { workRef } : {}),
      ...(context ? { context } : {}),
      ...(sourceInboxId ? { sourceInboxId } : {}),
      actualMinutes: 0,
      carryoverCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.registry.lastWorkbenchActiveAt = now;
    this.registry.updatedAt = now;
    return true;
  }

  returnDayItem(itemId: string, now = Date.now()): boolean {
    const index = this.registry.dayItems.findIndex((item) => item.id === itemId && item.state === "open");
    if (index < 0 || this.registry.activeFocus?.dayItemId === itemId) return false;
    this.captureUndo();
    const entry: Partial<DaySlotItem> & DayCandidate = { ...this.registry.dayItems[index]! };
    delete entry.slotId;
    delete entry.state;
    this.registry.dayItems.splice(index, 1);
    (this.registry.dayCandidates ??= []).push({ ...entry, updatedAt: now });
    this.registry.updatedAt = now;
    return true;
  }

  removeDayCandidate(candidateId: string, now = Date.now()): boolean {
    const candidates = this.registry.dayCandidates ?? [];
    const index = candidates.findIndex((item) => item.id === candidateId);
    if (index < 0) return false;
    this.captureUndo();
    candidates.splice(index, 1);
    this.registry.updatedAt = now;
    return true;
  }

  placeDayItem(
    input: DayPlanSubject & {
      candidateId?: string;
      date?: string;
      slotId: TimeSlotId;
      overflowMode?: "stack" | "replace" | "defer-tomorrow";
      replaceItemId?: string;
    },
    now = Date.now(),
    recordUndo = true,
  ): { item: DaySlotItem; friction: GentleFrictionInfo | null; displacedItemId?: string } {
    const candidates = this.registry.dayCandidates ?? [];
    const candidate = input.candidateId ? candidates.find((item) => item.id === input.candidateId) : undefined;
    if (input.candidateId && !candidate) throw new Error("DAY_CANDIDATE_UNAVAILABLE");
    const subject = candidate ?? input;
    const title = cleanText(subject.title, 200);
    if (!title) throw new Error("DAY_ITEM_TITLE_REQUIRED");
    const baseDate = input.date && validDate(input.date) ? input.date : dateKeyFromMs(now);
    const targetDate = input.overflowMode === "defer-tomorrow" ? offsetDate(baseDate, 1) : baseDate;
    const existingPlacement = subject.sourceInboxId
      ? this.registry.dayItems.find((item) => item.sourceInboxId === subject.sourceInboxId && item.state !== "dropped")
      : undefined;
    const friction = this.checkSlotFriction(targetDate, input.slotId);
    if (existingPlacement && !candidate) return { item: structuredClone(existingPlacement), friction };
    if (recordUndo) this.captureUndo();
    let displacedItemId: string | undefined;

    if (input.overflowMode === "replace") {
      const existing = input.replaceItemId
        ? this.registry.dayItems.find((i) => i.id === input.replaceItemId && i.date === targetDate && i.slotId === input.slotId && i.state === "open")
        : this.registry.dayItems.find((i) => i.state === "open" && i.date === targetDate && i.slotId === input.slotId);
      if (existing) {
        displacedItemId = existing.id;
        if (existing.weekMoveId) {
          // Linked week move stays intact in 本周容器; drop today's duplicate slot instance
          existing.state = "dropped";
        } else {
          existing.date = offsetDate(targetDate, 1);
        }
        existing.updatedAt = now;
      }
    }

    const linkedMove = subject.weekMoveId ? this.registry.weekMoves.find((m) => m.id === subject.weekMoveId) : undefined;
    const workRef = safeWorkRef(subject.workRef ?? linkedMove?.workRef);
    const context = cleanText(subject.context, 400);
    const sourceInboxId = cleanText(subject.sourceInboxId, 256);
    const item: DaySlotItem = {
      ...candidate,
      id: candidate?.id ?? makeId("ditem", this.seq++, now),
      date: targetDate,
      slotId: input.slotId,
      title,
      weekMoveId: subject.weekMoveId ?? null,
      areaId: subject.areaId ?? linkedMove?.areaId ?? null,
      projectWorkKey: subject.projectWorkKey ?? linkedMove?.projectWorkKey ?? null,
      ...(workRef ? { workRef } : {}),
      ...(context ? { context } : {}),
      ...(sourceInboxId ? { sourceInboxId } : {}),
      state: "open",
      actualMinutes: candidate?.actualMinutes ?? 0,
      carryoverCount: candidate?.carryoverCount ?? 0,
      createdAt: candidate?.createdAt ?? now,
      updatedAt: now,
    };
    if (candidate) candidates.splice(candidates.indexOf(candidate), 1);
    this.registry.dayItems.push(item);
    this.registry.lastWorkbenchActiveAt = now;
    this.registry.updatedAt = now;
    return {
      item: structuredClone(item),
      friction,
      ...(displacedItemId ? { displacedItemId } : {}),
    };
  }

  moveDayItem(
    input: {
      itemId: string;
      date?: string;
      slotId: TimeSlotId;
      overflowMode?: "stack" | "replace" | "defer-tomorrow";
      replaceItemId?: string;
    },
    now = Date.now(),
  ): boolean {
    const item = this.registry.dayItems.find((i) => i.id === input.itemId);
    if (!item) return false;
    this.captureUndo();
    const baseDate = input.date && validDate(input.date) ? input.date : dateKeyFromMs(now);
    const targetDate = input.overflowMode === "defer-tomorrow" ? offsetDate(baseDate, 1) : baseDate;

    if (input.overflowMode === "replace") {
      const existing = input.replaceItemId
        ? this.registry.dayItems.find((i) => i.id === input.replaceItemId && i.id !== item.id && i.state === "open")
        : this.registry.dayItems.find((i) => i.id !== item.id && i.state === "open" && i.date === targetDate && i.slotId === input.slotId);
      if (existing) {
        if (existing.weekMoveId) existing.state = "dropped";
        else existing.date = offsetDate(targetDate, 1);
        existing.updatedAt = now;
      }
    }

    item.date = targetDate;
    item.slotId = input.slotId;
    item.state = "open";
    item.updatedAt = now;
    this.registry.updatedAt = now;
    return true;
  }

  toggleDayItemDone(itemId: string, now = Date.now()): boolean {
    const item = this.registry.dayItems.find((i) => i.id === itemId);
    if (!item) return false;
    this.captureUndo();
    item.state = item.state === "done" ? "open" : "done";
    item.updatedAt = now;
    this.registry.updatedAt = now;
    return true;
  }

  removeDayItem(itemId: string, now = Date.now()): boolean {
    const idx = this.registry.dayItems.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;
    this.captureUndo();
    this.registry.dayItems.splice(idx, 1);
    this.registry.updatedAt = now;
    return true;
  }

  triageCarryover(
    input: { itemId: string; decision: "to-today" | "to-week" | "drop"; slotId?: TimeSlotId },
    now = Date.now(),
    recordUndo = true,
  ): boolean {
    const item = this.registry.dayItems.find((i) => i.id === input.itemId && i.state === "open");
    if (!item) return false;
    if (recordUndo) this.captureUndo();
    const today = dateKeyFromMs(now);
    const wk = weekKeyFor(today);

    if (input.decision === "to-today") {
      item.date = today;
      if (input.slotId) item.slotId = input.slotId;
      item.updatedAt = now;
    } else if (input.decision === "to-week") {
      const existingMove = item.weekMoveId
        ? this.registry.weekMoves.find((m) => m.id === item.weekMoveId && m.weekKey === wk && m.state === "open")
        : undefined;
      if (!existingMove) {
        this.addWeekMove(
          {
            title: item.title,
            weekKey: wk,
            areaId: item.areaId ?? null,
            projectWorkKey: item.projectWorkKey ?? null,
            workRef: item.workRef ?? null,
          },
          now,
          false,
        );
      }
      item.state = "dropped";
      item.updatedAt = now;
    } else {
      item.state = "dropped";
      item.updatedAt = now;
    }
    this.registry.lastWorkbenchActiveAt = now;
    this.registry.updatedAt = now;
    return true;
  }

  ackWorkbenchRestart(options: { settleCarryoverToWeek?: boolean } = {}, now = Date.now()): boolean {
    const today = dateKeyFromMs(now);
    const openCarryover = options.settleCarryoverToWeek
      ? this.registry.dayItems.filter((i) => i.state === "open" && i.date < today)
      : [];
    if (openCarryover.length > 0) {
      this.captureUndo();
      for (const item of openCarryover) {
        this.triageCarryover({ itemId: item.id, decision: "to-week" }, now, false);
      }
    }
    this.registry.lastWorkbenchActiveAt = now;
    this.registry.restartDismissedDate = today;
    this.registry.updatedAt = now;
    return true;
  }

  setCalendarShield(itemId: string, shield: CalendarShieldInfo, now = Date.now()): boolean {
    const item = this.registry.dayItems.find((i) => i.id === itemId);
    if (!item) return false;
    item.calendarShield = shield;
    item.updatedAt = now;
    this.registry.updatedAt = now;
    return true;
  }

  setFootprintCalendar(enabled: boolean, calendarName?: string, now = Date.now()): void {
    this.registry.footprintCalendarEnabled = enabled;
    const clean = cleanText(calendarName, 80);
    if (clean) this.registry.footprintCalendarName = clean;
    this.registry.updatedAt = now;
  }

  // ==================== FOCUS MICRO-CONTAINER ====================

  startFocus(
    input: {
      dayItemId?: string;
      weekMoveId?: string;
      title?: string;
      slotId?: TimeSlotId;
      areaId?: string | null;
      projectWorkKey?: string | null;
      workRef?: WorkRef | null;
      focusRole?: StageFocusRole;
      lastBlockUuid?: string;
    },
    now = Date.now(),
  ): { session: ActiveFocusSession; autoFinished?: CompletedFocusRecord } {
    let autoFinished: CompletedFocusRecord | undefined;
    if (this.registry.activeFocus) {
      autoFinished = this.finishFocus({}, now) ?? undefined;
    }

    const dayItem = input.dayItemId ? this.registry.dayItems.find((i) => i.id === input.dayItemId) : undefined;
    const weekMove =
      input.weekMoveId
        ? this.registry.weekMoves.find((m) => m.id === input.weekMoveId)
        : dayItem?.weekMoveId
          ? this.registry.weekMoves.find((m) => m.id === dayItem.weekMoveId)
          : undefined;

    const title = cleanText(input.title ?? dayItem?.title ?? weekMove?.title, 200);
    if (!title) throw new Error("FOCUS_TITLE_REQUIRED");

    const slotId: TimeSlotId = input.slotId ?? dayItem?.slotId ?? "morning";
    const workRef = input.workRef ?? dayItem?.workRef ?? weekMove?.workRef ?? null;
    const projectWorkKey = input.projectWorkKey ?? dayItem?.projectWorkKey ?? weekMove?.projectWorkKey ?? null;
    const areaId = input.areaId ?? dayItem?.areaId ?? weekMove?.areaId ?? null;

    const lastBlockUuid = input.lastBlockUuid ?? dayItem?.lastBlockUuid ?? weekMove?.lastBlockUuid;
    const session: ActiveFocusSession = {
      id: makeId("focus", this.seq++, now),
      title,
      slotId,
      roleLabel: focusRoleShortLabel(input.focusRole),
      date: dateKeyFromMs(now),
      dayItemId: dayItem?.id ?? null,
      weekMoveId: weekMove?.id ?? null,
      areaId,
      projectWorkKey,
      ...(workRef ? { workRef } : {}),
      status: "running",
      startedAt: now,
      resumedAt: now,
      accumulatedSeconds: 0,
      ...(lastBlockUuid ? { lastBlockUuid } : {}),
      ...(workRef || projectWorkKey || dayItem ? { pendingNavigationAt: now } : {}),
    };

    this.registry.activeFocus = session;
    this.registry.lastWorkbenchActiveAt = now;
    this.registry.updatedAt = now;
    return {
      session: structuredClone(session),
      ...(autoFinished ? { autoFinished } : {}),
    };
  }

  pauseFocus(now = Date.now(), input: { stopNote?: string; lastBlockUuid?: string; sessionId?: string } = {}): ActiveFocusSession | null {
    const active = this.registry.activeFocus;
    if (!active || (input.sessionId && input.sessionId !== active.id)) return null;
    if (active.status === "running") {
      active.accumulatedSeconds += Math.max(0, Math.floor((now - active.resumedAt) / 1000));
      active.status = "paused";
      active.pausedAt = now;
    }
    const stopNote = cleanText(input.stopNote, 240);
    const lastBlockUuid = cleanText(input.lastBlockUuid, 128);
    if (stopNote) active.stopNote = stopNote;
    if (lastBlockUuid) active.lastBlockUuid = lastBlockUuid;
    for (const item of [
      this.registry.dayItems.find((entry) => entry.id === active.dayItemId),
      this.registry.weekMoves.find((entry) => entry.id === active.weekMoveId),
    ]) {
      if (!item) continue;
      if (stopNote) item.lastStopNote = stopNote;
      if (lastBlockUuid) item.lastBlockUuid = lastBlockUuid;
    }
    this.registry.updatedAt = now;
    return structuredClone(active);
  }

  resumeFocus(now = Date.now()): ActiveFocusSession | null {
    const active = this.registry.activeFocus;
    if (!active || active.status === "running") return active ? structuredClone(active) : null;
    active.status = "running";
    active.resumedAt = now;
    delete active.pausedAt;
    this.registry.updatedAt = now;
    return structuredClone(active);
  }

  ackFocusNavigation(sessionId?: string): boolean {
    const active = this.registry.activeFocus;
    if (!active || (sessionId && active.id !== sessionId) || active.pendingNavigationAt === undefined) return false;
    delete active.pendingNavigationAt;
    return true;
  }

  finishFocus(
    input: { stopNote?: string; markDayItemDone?: boolean },
    now = Date.now(),
  ): CompletedFocusRecord | null {
    const active = this.registry.activeFocus;
    if (!active) return null;
    const runningSec = active.status === "running" ? Math.max(0, Math.floor((now - active.resumedAt) / 1000)) : 0;
    const totalSeconds = active.accumulatedSeconds + runningSec;
    const durationMinutes = totalSeconds >= 30 ? Math.max(1, Math.round(totalSeconds / 60)) : 0;
    const stopNote = cleanText(input.stopNote, 240) ?? active.stopNote;

    const record: CompletedFocusRecord = {
      id: makeId("flog", this.seq++, now),
      title: active.title,
      slotId: active.slotId,
      date: active.date,
      weekKey: weekKeyFor(active.date),
      dayItemId: active.dayItemId ?? null,
      weekMoveId: active.weekMoveId ?? null,
      areaId: active.areaId ?? null,
      projectWorkKey: active.projectWorkKey ?? null,
      startedAt: active.startedAt,
      endedAt: Math.max(now, active.startedAt),
      durationMinutes,
      ...(stopNote ? { stopNote } : {}),
      ...(active.lastBlockUuid ? { lastBlockUuid: active.lastBlockUuid } : {}),
      ...(active.workRef ? { workRef: active.workRef } : {}),
    };

    if (active.dayItemId) {
      const dayItem = this.registry.dayItems.find((i) => i.id === active.dayItemId);
      if (dayItem) {
        dayItem.actualMinutes += durationMinutes;
        if (stopNote) dayItem.lastStopNote = stopNote;
        if (input.markDayItemDone) dayItem.state = "done";
        dayItem.updatedAt = now;
      }
    }
    if (active.weekMoveId) {
      const move = this.registry.weekMoves.find((m) => m.id === active.weekMoveId);
      if (move) {
        move.actualMinutes += durationMinutes;
        if (stopNote) move.lastStopNote = stopNote;
        move.updatedAt = now;
      }
    }

    this.registry.focusHistory.push(record);
    if (this.registry.focusHistory.length > 400) {
      this.registry.focusHistory = this.registry.focusHistory.slice(-400);
    }
    this.registry.activeFocus = null;
    this.registry.lastWorkbenchActiveAt = now;
    this.registry.updatedAt = now;
    return structuredClone(record);
  }

  attachFootprintEventId(recordId: string, eventId: string): boolean {
    const rec = this.registry.focusHistory.find((r) => r.id === recordId);
    if (!rec) return false;
    rec.footprintEventId = eventId;
    return true;
  }

  // ==================== GHOST PROPOSALS (TIER 2 DRAFT -> TIER 3 COMMIT) ====================

  proposeTimePlan(
    input: {
      agent: string;
      recommendedWeekMax?: number;
      proposals: Array<{
        kind: TimeGhostProposal["kind"];
        title: string;
        reason: string;
        weekKey?: string;
        date?: string;
        slotId?: TimeSlotId;
        areaId?: string | null;
        projectWorkKey?: string | null;
        weekMoveId?: string | null;
        dayItemId?: string | null;
        replaceItemId?: string | null;
        triageAction?: "to-today" | "to-week" | "drop";
      }>;
    },
    now = Date.now(),
  ): TimeGhostProposal[] {
    const today = dateKeyFromMs(now);
    const created: TimeGhostProposal[] = [];

    for (const p of input.proposals.slice(0, 10)) {
      const title = cleanText(p.title, 160);
      const reason = cleanText(p.reason, 320);
      if (!title || !reason) continue;

      let frictionWarning: string | undefined;
      if (p.kind === "week-add-move") {
        const wk = p.weekKey && validDate(p.weekKey) ? weekKeyFor(p.weekKey) : weekKeyFor(today);
        const f = this.checkWeekFriction(wk, input.recommendedWeekMax ?? 5);
        if (f) frictionWarning = f.message;
      } else if (p.kind === "day-place-item" && p.slotId && !p.replaceItemId) {
        const d = p.date && validDate(p.date) ? p.date : today;
        const f = this.checkSlotFriction(d, p.slotId);
        if (f) frictionWarning = f.message;
      }

      const proposal: TimeGhostProposal = {
        id: makeId("tghost", this.seq++, now),
        kind: p.kind,
        agent: input.agent,
        createdAt: now,
        title,
        reason,
        ...(p.weekKey && validDate(p.weekKey) ? { weekKey: weekKeyFor(p.weekKey) } : {}),
        ...(p.date && validDate(p.date) ? { date: p.date } : {}),
        ...(p.slotId ? { slotId: p.slotId } : {}),
        ...(p.areaId !== undefined ? { areaId: p.areaId } : {}),
        ...(p.projectWorkKey !== undefined ? { projectWorkKey: p.projectWorkKey } : {}),
        ...(p.weekMoveId !== undefined ? { weekMoveId: p.weekMoveId } : {}),
        ...(p.dayItemId !== undefined ? { dayItemId: p.dayItemId } : {}),
        ...(p.replaceItemId !== undefined ? { replaceItemId: p.replaceItemId } : {}),
        ...(p.triageAction ? { triageAction: p.triageAction } : {}),
        ...(frictionWarning ? { frictionWarning } : {}),
      };
      this.ghostProposals.push(proposal);
      created.push(structuredClone(proposal));
    }
    return created;
  }

  resolveTimeProposals(decisions: readonly TimeResolveDecision[], now = Date.now()): TimeResolveResult {
    const committedIds: string[] = [];
    const dismissedIds: string[] = [];
    const affected: TimeGhostProposal[] = [];

    for (const d of decisions) {
      const found = this.ghostProposals.find((g) => g.id === d.proposalId);
      if (found) affected.push(found);
    }
    if (affected.some((p) => decisions.find((d) => d.proposalId === p.id)?.action === "accept")) {
      this.captureUndo(affected);
    }

    const today = dateKeyFromMs(now);
    const wk = weekKeyFor(today);

    for (const decision of decisions) {
      const idx = this.ghostProposals.findIndex((g) => g.id === decision.proposalId);
      if (idx === -1) continue;
      const [proposal] = this.ghostProposals.splice(idx, 1);
      if (!proposal) continue;

      if (decision.action === "dismiss") {
        dismissedIds.push(proposal.id);
        continue;
      }

      const finalTitle = cleanText(decision.title, 200) ?? proposal.title;

      if (proposal.kind === "week-add-move") {
        this.addWeekMove(
          {
            title: finalTitle,
            weekKey: proposal.weekKey ?? wk,
            areaId: proposal.areaId ?? null,
            projectWorkKey: proposal.projectWorkKey ?? null,
          },
          now,
          false,
        );
        committedIds.push(proposal.id);
        continue;
      }

      if (proposal.kind === "day-place-item") {
        this.placeDayItem(
          {
            title: finalTitle,
            date: proposal.date ?? today,
            slotId: proposal.slotId ?? "morning",
            weekMoveId: proposal.weekMoveId ?? null,
            areaId: proposal.areaId ?? null,
            projectWorkKey: proposal.projectWorkKey ?? null,
            overflowMode: proposal.replaceItemId ? "replace" : "stack",
            ...(proposal.replaceItemId ? { replaceItemId: proposal.replaceItemId } : {}),
          },
          now,
          false,
        );
        committedIds.push(proposal.id);
        continue;
      }

      if (proposal.kind === "carryover-triage" && proposal.dayItemId) {
        const ok = this.triageCarryover(
          {
            itemId: proposal.dayItemId,
            decision: proposal.triageAction ?? "to-week",
            ...(proposal.slotId ? { slotId: proposal.slotId } : {}),
          },
          now,
          false,
        );
        if (ok) committedIds.push(proposal.id);
        continue;
      }

      if (proposal.kind === "day-rescue") {
        const targetDate = proposal.date ?? today;
        // Move other open items of targetDate back to current week, keeping only the rescued item!
        const keepId = proposal.dayItemId ?? null;
        for (const item of this.registry.dayItems) {
          if (item.state !== "open" || item.date !== targetDate) continue;
          if (keepId && item.id === keepId) continue;
          if (!item.weekMoveId) {
            this.addWeekMove(
              {
                title: item.title,
                weekKey: wk,
                areaId: item.areaId ?? null,
                projectWorkKey: item.projectWorkKey ?? null,
                workRef: item.workRef ?? null,
              },
              now,
              false,
            );
          }
          item.state = "dropped";
          item.updatedAt = now;
        }
        if (!keepId) {
          this.placeDayItem(
            {
              title: finalTitle,
              date: targetDate,
              slotId: proposal.slotId ?? "afternoon",
              areaId: proposal.areaId ?? null,
              projectWorkKey: proposal.projectWorkKey ?? null,
              overflowMode: "stack",
            },
            now,
            false,
          );
        }
        this.registry.updatedAt = now;
        committedIds.push(proposal.id);
      }
    }

    return {
      committedIds,
      dismissedIds,
      canUndo: this.undoSnapshot !== null,
    };
  }

  dismissAllTimeProposals(): number {
    const count = this.ghostProposals.length;
    this.ghostProposals = [];
    return count;
  }

  findMissingProposalIds(decisions: readonly TimeResolveDecision[]): string[] {
    const pending = new Set(this.ghostProposals.map((g) => g.id));
    return decisions.map((d) => d.proposalId).filter((id) => !pending.has(id));
  }

  canUndo(): boolean {
    return this.undoSnapshot !== null;
  }

  getActiveFocus(): ActiveFocusSession | null {
    return this.registry.activeFocus ? structuredClone(this.registry.activeFocus) : null;
  }

  undoLastCommit(): boolean {
    if (!this.undoSnapshot) return false;
    this.registry = structuredClone(this.undoSnapshot.registry);
    for (const p of this.undoSnapshot.restoredProposals) {
      if (!this.ghostProposals.some((g) => g.id === p.id)) {
        this.ghostProposals.push(structuredClone(p));
      }
    }
    this.undoSnapshot = null;
    return true;
  }

  applyAction(
    action: TimeUserAction,
    now = Date.now(),
  ): {
    mutatedRegistry: boolean;
    startedFocus?: ActiveFocusSession;
    finishedFocus?: CompletedFocusRecord;
    resolved?: TimeResolveResult;
  } {
    switch (action.type) {
      case "add-week-move":
        this.addWeekMove(action, now);
        return { mutatedRegistry: true };
      case "toggle-week-move-state":
        return { mutatedRegistry: this.toggleWeekMoveState(action.moveId, action.state, now) };
      case "remove-week-move":
        return { mutatedRegistry: this.removeWeekMove(action.moveId, now) };
      case "add-day-candidate":
        return { mutatedRegistry: this.addDayCandidate(action, now) };
      case "return-day-item":
        return { mutatedRegistry: this.returnDayItem(action.itemId, now) };
      case "remove-day-candidate":
        return { mutatedRegistry: this.removeDayCandidate(action.candidateId, now) };
      case "place-day-item":
        this.placeDayItem(action, now);
        return { mutatedRegistry: true };
      case "move-day-item":
        return { mutatedRegistry: this.moveDayItem(action, now) };
      case "toggle-day-item-done":
        return { mutatedRegistry: this.toggleDayItemDone(action.itemId, now) };
      case "remove-day-item":
        return { mutatedRegistry: this.removeDayItem(action.itemId, now) };
      case "triage-carryover":
        return { mutatedRegistry: this.triageCarryover(action, now) };
      case "start-focus": {
        const res = this.startFocus(action, now);
        return {
          mutatedRegistry: true,
          startedFocus: res.session,
          ...(res.autoFinished ? { finishedFocus: res.autoFinished } : {}),
        };
      }
      case "pause-focus":
        return { mutatedRegistry: this.pauseFocus(now, action) !== null };
      case "resume-focus":
        return { mutatedRegistry: this.resumeFocus(now) !== null };
      case "finish-focus": {
        const finished = this.finishFocus(
          {
            ...(action.stopNote !== undefined ? { stopNote: action.stopNote } : {}),
            ...(action.markDayItemDone !== undefined ? { markDayItemDone: action.markDayItemDone } : {}),
          },
          now,
        );
        return { mutatedRegistry: finished !== null, ...(finished ? { finishedFocus: finished } : {}) };
      }
      case "ack-focus-navigation":
        return { mutatedRegistry: this.ackFocusNavigation(action.sessionId) };
      case "set-footprint-calendar":
        this.setFootprintCalendar(action.enabled, action.calendarName, now);
        return { mutatedRegistry: true };
      case "create-calendar-shield":
        // Handled asynchronously by TimeHub with AppleCalendarBridge; engine state updated via setCalendarShield
        return { mutatedRegistry: false };
      case "resolve-time-proposals": {
        const resolved = this.resolveTimeProposals(action.decisions, now);
        return { mutatedRegistry: resolved.committedIds.length > 0, resolved };
      }
      case "dismiss-all-time-proposals":
        this.dismissAllTimeProposals();
        return { mutatedRegistry: false };
      case "ack-workbench-restart":
        return {
          mutatedRegistry: this.ackWorkbenchRestart(
            { ...(action.settleCarryoverToWeek !== undefined ? { settleCarryoverToWeek: action.settleCarryoverToWeek } : {}) },
            now,
          ),
        };
      case "undo-time":
        return { mutatedRegistry: this.undoLastCommit() };
    }
  }

  // ==================== SNAPSHOT ====================

  buildSnapshot(
    now = Date.now(),
    hardEvents: readonly CalendarHardEvent[] = [],
    calendarDiagnostics?: CalendarDiagnostics,
  ): TimeSnapshot {
    this.syncCarryover(now);
    const today = dateKeyFromMs(now);
    const wk = weekKeyFor(today);

    const weekMoves = this.registry.weekMoves
      .filter((m) => m.weekKey === wk && m.state !== "dropped")
      .map((m) => structuredClone(m));

    const openMoveCount = weekMoves.filter((m) => m.state === "open").length;
    const weekCapacity = computeWeekCapacitySummary({
      today,
      weekKey: wk,
      hardEvents,
      openMoveCount,
    });

    const slotsForDate = (date: string): SlotSnapshot[] => DEFAULT_SEMANTIC_SLOTS.map((spec) => {
      const items = this.registry.dayItems
        .filter((i) => i.date === date && i.slotId === spec.id && i.state !== "dropped")
        .map((i) => structuredClone(i));
      const openItems = items.filter((i) => i.state === "open");
      const slotEvents = hardEvents
        .filter((e) => e.date === date && e.slotId === spec.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const { busyMinutes, remainingMinutes } = computeSlotRemainingMinutes(spec, slotEvents);
      const overSoftCap = openItems.length > spec.softCap;
      const frictionMessage = overSoftCap
        ? `${slotDisplayLabel(spec.id)}当前放入 ${openItems.length} 项（建议上限 ${spec.softCap} 项），可顺延 1 项至明天或退回本周`
        : undefined;
      return {
        spec,
        items,
        hardEvents: slotEvents,
        busyMinutes,
        remainingMinutes,
        overSoftCap,
        ...(frictionMessage ? { frictionMessage } : {}),
      };
    });

    const tomorrowDate = offsetDate(today, 1);
    const candidates = this.registry.dayCandidates ?? [];

    const carryoverItems = this.registry.dayItems
      .filter((i) => i.state === "open" && i.date < today)
      .sort((a, b) => b.carryoverCount - a.carryoverCount || a.date.localeCompare(b.date))
      .map((i) => structuredClone(i));

    const repeatCarryoverItems = carryoverItems.filter((i) => i.carryoverCount >= 3);

    const weeklyAreaFocusMinutes: Record<string, number> = {};
    for (const rec of this.registry.focusHistory) {
      if (rec.weekKey !== wk || !rec.areaId) continue;
      weeklyAreaFocusMinutes[rec.areaId] = (weeklyAreaFocusMinutes[rec.areaId] ?? 0) + rec.durationMinutes;
    }

    let effectiveLastActiveAt = this.registry.lastWorkbenchActiveAt;
    if (effectiveLastActiveAt === undefined) {
      const timestamps: number[] = [];
      for (const r of this.registry.focusHistory) timestamps.push(r.endedAt);
      for (const i of this.registry.dayItems) timestamps.push(i.updatedAt);
      for (const m of this.registry.weekMoves) timestamps.push(m.updatedAt);
      if (timestamps.length > 0) {
        effectiveLastActiveAt = Math.max(...timestamps);
      }
    }
    const workbenchGapDays =
      effectiveLastActiveAt !== undefined ? Math.max(0, Math.floor((now - effectiveLastActiveAt) / 86_400_000)) : 0;
    const restartDismissedToday = this.registry.restartDismissedDate === today;

    return {
      today,
      weekKey: wk,
      weekCapacity,
      weekMoves,
      todaySlots: slotsForDate(today),
      tomorrowDate,
      tomorrowSlots: slotsForDate(tomorrowDate),
      todayCandidates: candidates.filter((item) => item.date <= today).map((item) => structuredClone(item)),
      tomorrowCandidates: candidates.filter((item) => item.date === tomorrowDate).map((item) => structuredClone(item)),
      carryoverItems,
      repeatCarryoverItems,
      activeFocus: this.registry.activeFocus ? structuredClone(this.registry.activeFocus) : null,
      recentFocusRecords: this.registry.focusHistory.slice(-10).reverse().map((r) => structuredClone(r)),
      weeklyAreaFocusMinutes,
      ghostProposals: structuredClone(this.ghostProposals),
      footprintCalendarEnabled: this.registry.footprintCalendarEnabled,
      footprintCalendarName: this.registry.footprintCalendarName,
      ...(calendarDiagnostics ? { calendarDiagnostics } : {}),
      ...(effectiveLastActiveAt !== undefined ? { lastWorkbenchActiveAt: effectiveLastActiveAt } : {}),
      workbenchGapDays,
      restartDismissedToday,
      canUndo: this.undoSnapshot !== null,
    };
  }
}
