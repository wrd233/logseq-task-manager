import type { WorkRef } from "@task-copilot/contracts";
import type { StageFocusRole } from "./types.ts";

export type StageViewTab = "season" | "week" | "today" | "tomorrow";
export type TimeSlotId = "morning" | "afternoon" | "evening";

export interface SemanticSlotSpec {
  id: TimeSlotId;
  name: string;
  subtitle: string;
  softCap: number;
  allowEmptyHint?: string;
  nominalHours: number;
  startHour: number;
  endHour: number;
}

export interface CalendarHardEvent {
  id: string;
  title: string;
  calendarName: string;
  date: string; // YYYY-MM-DD local date
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  startAt: string; // YYYY-MM-DDTHH:mm
  endAt: string; // YYYY-MM-DDTHH:mm
  durationMinutes: number;
  slotId: TimeSlotId;
  isShield?: boolean;
}

export interface CalendarDiagnostics {
  status: "ok" | "permission-denied" | "unavailable" | "disabled" | "error";
  eventCount: number;
  footprintCalendarName: string;
  footprintCalendarEnabled: boolean;
  errorCode?: string;
  message?: string;
  guidance?: string;
  checkedAt: number;
}

export interface CalendarShieldInfo {
  eventId: string;
  calendarName: string;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: number;
}

export interface WeekMoveItem {
  id: string;
  weekKey: string; // Monday YYYY-MM-DD of that week
  title: string;
  areaId?: string | null;
  projectWorkKey?: string | null;
  workRef?: WorkRef | null;
  sourceAdvancementId?: string;
  sourceInboxId?: string;
  state: "open" | "done" | "dropped";
  actualMinutes: number;
  lastStopNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DayPlanSubject {
  title: string;
  weekMoveId?: string | null | undefined;
  areaId?: string | null | undefined;
  projectWorkKey?: string | null | undefined;
  workRef?: WorkRef | null | undefined;
  context?: string | undefined;
  sourceInboxId?: string | undefined;
}

export interface DayCandidate extends DayPlanSubject {
  id: string;
  date: string; // YYYY-MM-DD
  actualMinutes: number;
  carryoverCount: number;
  lastCarryoverDate?: string;
  lastStopNote?: string;
  calendarShield?: CalendarShieldInfo;
  createdAt: number;
  updatedAt: number;
}

export interface DaySlotItem extends DayCandidate {
  slotId: TimeSlotId;
  state: "open" | "done" | "dropped";
}

export interface ActiveFocusSession {
  id: string;
  title: string;
  slotId: TimeSlotId;
  roleLabel: string; // e.g. "主线" | "支线" | "维护" | "推进"
  date: string;
  dayItemId?: string | null;
  weekMoveId?: string | null;
  areaId?: string | null;
  projectWorkKey?: string | null;
  workRef?: WorkRef | null;
  status: "running" | "paused";
  startedAt: number;
  resumedAt: number;
  pausedAt?: number;
  accumulatedSeconds: number;
  pendingNavigationAt?: number;
}

export interface CompletedFocusRecord {
  id: string;
  title: string;
  slotId: TimeSlotId;
  date: string;
  weekKey: string;
  dayItemId?: string | null;
  weekMoveId?: string | null;
  areaId?: string | null;
  projectWorkKey?: string | null;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  stopNote?: string;
  footprintEventId?: string;
}

export interface TimeGhostProposal {
  id: string;
  kind: "week-add-move" | "day-place-item" | "carryover-triage" | "day-rescue";
  agent: string;
  createdAt: number;
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
  frictionWarning?: string;
}

export interface GentleFrictionInfo {
  scope: "week" | "day-slot";
  targetId: string; // weekKey or TimeSlotId
  currentCount: number;
  softCap: number;
  existingTitles: string[];
  message: string;
}

export interface TimeRegistryFile {
  schemaVersion: 1;
  weekMoves: WeekMoveItem[];
  dayItems: DaySlotItem[];
  dayCandidates?: DayCandidate[];
  activeFocus: ActiveFocusSession | null;
  focusHistory: CompletedFocusRecord[];
  footprintCalendarEnabled: boolean;
  footprintCalendarName: string;
  lastWorkbenchActiveAt?: number;
  restartDismissedDate?: string;
  updatedAt: number;
}

export interface DayCalendarOverviewEntry {
  date: string;
  weekdayLabel: string;
  isToday: boolean;
  eventCount: number;
  busyMinutes: number;
  summary: string;
}

export interface SlotSnapshot {
  spec: SemanticSlotSpec;
  items: DaySlotItem[];
  hardEvents: CalendarHardEvent[];
  busyMinutes: number;
  remainingMinutes: number;
  overSoftCap: boolean;
  frictionMessage?: string;
}

export interface WeekCapacitySummary {
  weekKey: string;
  dates: string[];
  recommendedMin: number;
  recommendedMax: number;
  isDenseWeek: boolean;
  totalHardEventMinutes: number;
  denseDayCount: number;
  openMoveCount: number;
  overCapacity: boolean;
  summary: string;
  dailyOverview: DayCalendarOverviewEntry[];
}

export interface TimeSnapshot {
  today: string;
  weekKey: string;
  weekCapacity: WeekCapacitySummary;
  weekMoves: WeekMoveItem[];
  todaySlots: SlotSnapshot[];
  tomorrowDate: string;
  tomorrowSlots: SlotSnapshot[];
  todayCandidates: DayCandidate[];
  tomorrowCandidates: DayCandidate[];
  carryoverItems: DaySlotItem[];
  repeatCarryoverItems: DaySlotItem[]; // carryoverCount >= 3
  activeFocus: ActiveFocusSession | null;
  recentFocusRecords: CompletedFocusRecord[];
  weeklyAreaFocusMinutes: Record<string, number>;
  ghostProposals: TimeGhostProposal[];
  footprintCalendarEnabled: boolean;
  footprintCalendarName: string;
  calendarDiagnostics?: CalendarDiagnostics;
  lastWorkbenchActiveAt?: number;
  workbenchGapDays: number;
  restartDismissedToday: boolean;
  canUndo: boolean;
}

export interface TimeResolveDecision {
  proposalId: string;
  action: "accept" | "dismiss";
  title?: string;
}

export interface TimeResolveResult {
  committedIds: string[];
  dismissedIds: string[];
  canUndo: boolean;
}

export type TimeUserAction =
  | {
      type: "add-week-move";
      title: string;
      weekKey?: string;
      areaId?: string | null;
      projectWorkKey?: string | null;
      workRef?: WorkRef | null;
      sourceAdvancementId?: string;
      sourceInboxId?: string;
    }
  | { type: "toggle-week-move-state"; moveId: string; state?: "open" | "done" | "dropped" }
  | { type: "remove-week-move"; moveId: string }
  | ({ type: "add-day-candidate"; date: string } & DayPlanSubject)
  | { type: "return-day-item"; itemId: string }
  | { type: "remove-day-candidate"; candidateId: string }
  | ({
      type: "place-day-item";
      date?: string;
      slotId: TimeSlotId;
      candidateId?: string;
      overflowMode?: "stack" | "replace" | "defer-tomorrow";
      replaceItemId?: string;
    } & DayPlanSubject)
  | {
      type: "move-day-item";
      itemId: string;
      date?: string;
      slotId: TimeSlotId;
      overflowMode?: "stack" | "replace" | "defer-tomorrow";
      replaceItemId?: string;
    }
  | { type: "toggle-day-item-done"; itemId: string }
  | { type: "remove-day-item"; itemId: string }
  | { type: "triage-carryover"; itemId: string; decision: "to-today" | "to-week" | "drop"; slotId?: TimeSlotId }
  | {
      type: "start-focus";
      dayItemId?: string;
      weekMoveId?: string;
      title?: string;
      slotId?: TimeSlotId;
      areaId?: string | null;
      projectWorkKey?: string | null;
      workRef?: WorkRef | null;
      focusRole?: StageFocusRole;
    }
  | { type: "pause-focus" }
  | { type: "resume-focus" }
  | { type: "finish-focus"; stopNote?: string; markDayItemDone?: boolean; writeFootprint?: boolean }
  | { type: "ack-focus-navigation" }
  | { type: "set-footprint-calendar"; enabled: boolean; calendarName?: string }
  | { type: "create-calendar-shield"; itemId: string; startTime?: string; endTime?: string }
  | { type: "resolve-time-proposals"; decisions: TimeResolveDecision[] }
  | { type: "dismiss-all-time-proposals" }
  | { type: "ack-workbench-restart"; settleCarryoverToWeek?: boolean }
  | { type: "undo-time" };
