import type {
  CalendarHardEvent,
  DayCalendarOverviewEntry,
  GentleFrictionInfo,
  SemanticSlotSpec,
  TimeSlotId,
  WeekCapacitySummary,
} from "./time-types.ts";

/**
 * Host-neutral pure semantic time model hoisted from DSH planner-model.mjs conventions:
 * local YYYY-MM-DD dates, Monday-based weeks, human durations, three energy-textured daily slots,
 * Apple Calendar hard-event bucketing, dynamic weekly capacity, and gentle friction prompts.
 */

export const DEFAULT_SEMANTIC_SLOTS: readonly SemanticSlotSpec[] = [
  {
    id: "morning",
    name: "上午 · 深潜",
    subtitle: "护住当天 1 项主线硬骨头",
    softCap: 1,
    nominalHours: 3,
    startHour: 8,
    endHour: 12,
  },
  {
    id: "afternoon",
    name: "下午 · 推进",
    subtitle: "中轻度推进、沟通与 Inbox 整理",
    softCap: 2,
    nominalHours: 4,
    startHour: 13,
    endHour: 18,
  },
  {
    id: "evening",
    name: "晚上 · 轻放",
    subtitle: "阅读或个人事，显式允许留白",
    softCap: 1,
    allowEmptyHint: "允许留白，给明天保留余量",
    nominalHours: 2,
    startHour: 19,
    endHour: 22,
  },
];

export const SEMANTIC_SLOT_BY_ID: Readonly<Record<TimeSlotId, SemanticSlotSpec>> = {
  morning: DEFAULT_SEMANTIC_SLOTS[0]!,
  afternoon: DEFAULT_SEMANTIC_SLOTS[1]!,
  evening: DEFAULT_SEMANTIC_SLOTS[2]!,
};

export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateKeyFromMs(ms: number): string {
  return dateKey(new Date(ms));
}

export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function validClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

export function offsetDate(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function weekDatesFor(today: string): string[] {
  const day = new Date(`${today}T12:00:00`).getDay();
  const monday = offsetDate(today, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => offsetDate(monday, index));
}

export function scheduleCalendarRange(today: string): { startDate: string; endDate: string } {
  const dates = weekDatesFor(today);
  const tomorrow = offsetDate(today, 1);
  return { startDate: dates[0]!, endDate: tomorrow > dates[6]! ? tomorrow : dates[6]! };
}

export function weekKeyFor(date: string): string {
  return weekDatesFor(date)[0]!;
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

export function weekdayShortLabel(key: string): string {
  const d = new Date(`${key}T12:00:00`).getDay();
  return WEEKDAY_NAMES[d] ?? "";
}

export function shortMonthDayLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function dateLabel(key: string): string {
  return `${shortMonthDayLabel(key)} ${weekdayShortLabel(key)}`;
}

export function relativeDateLabel(key: string, today: string): string {
  if (key === today) return "今天";
  if (key === offsetDate(today, 1)) return "明天";
  if (key === offsetDate(today, -1)) return "昨天";
  return `${shortMonthDayLabel(key)} ${weekdayShortLabel(key)}`;
}

export function compactMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h${String(rest).padStart(2, "0")}m` : `${hours}h`;
}

export function compactHours(minutes: number): string {
  if (minutes <= 0) return "空";
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)}m`;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

export function parseClockMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Maps a timed calendar event's start clock (HH:mm) to its primary semantic slot. */
export function classifyClockToSlot(startTime: string): TimeSlotId {
  const mins = parseClockMinutes(startTime);
  if (mins < 12 * 60 + 30) return "morning";
  if (mins < 18 * 60) return "afternoon";
  return "evening";
}

export function slotDisplayLabel(slotId: TimeSlotId): string {
  return SEMANTIC_SLOT_BY_ID[slotId].name;
}

export function slotShortLabel(slotId: TimeSlotId): string {
  if (slotId === "morning") return "上午";
  if (slotId === "afternoon") return "下午";
  return "晚上";
}

/**
 * Calculates weekly recommended move capacity:
 * - Default: 3-5 Major Moves
 * - Dense fixed-schedule week (>= 12h total hard events OR >= 3 days with >= 2.5h hard events): narrows to 1-3 Moves.
 */
export function computeWeekCapacitySummary(input: {
  today: string;
  weekKey: string;
  hardEvents: readonly CalendarHardEvent[];
  openMoveCount: number;
}): WeekCapacitySummary {
  const dates = weekDatesFor(input.weekKey);
  let totalHardEventMinutes = 0;
  let denseDayCount = 0;

  const dailyOverview: DayCalendarOverviewEntry[] = dates.map((date) => {
    const dayEvents = input.hardEvents.filter((e) => e.date === date && !e.isShield);
    const busyMinutes = dayEvents.reduce((sum, e) => sum + Math.max(0, e.durationMinutes), 0);
    totalHardEventMinutes += busyMinutes;
    if (busyMinutes >= 150) denseDayCount++;
    const label = weekdayShortLabel(date);
    return {
      date,
      weekdayLabel: label,
      isToday: date === input.today,
      eventCount: dayEvents.length,
      busyMinutes,
      summary: `${label} ${compactHours(busyMinutes)}`,
    };
  });

  const isDenseWeek = totalHardEventMinutes >= 12 * 60 || denseDayCount >= 3;
  const recommendedMin = isDenseWeek ? 1 : 3;
  const recommendedMax = isDenseWeek ? 3 : 5;
  const overCapacity = input.openMoveCount > recommendedMax;

  const summary = isDenseWeek
    ? `本周固定日程较密（${compactHours(totalHardEventMinutes)}），建议推进块收窄至 ${recommendedMin}–${recommendedMax} 项`
    : `常规能量周（固定日程 ${compactHours(totalHardEventMinutes)}），建议承接 ${recommendedMin}–${recommendedMax} 个推进块`;

  return {
    weekKey: input.weekKey,
    dates,
    recommendedMin,
    recommendedMax,
    isDenseWeek,
    totalHardEventMinutes,
    denseDayCount,
    openMoveCount: input.openMoveCount,
    overCapacity,
    summary,
    dailyOverview,
  };
}

export function computeSlotRemainingMinutes(slot: SemanticSlotSpec, hardEvents: readonly CalendarHardEvent[]): {
  busyMinutes: number;
  remainingMinutes: number;
} {
  const busyMinutes = hardEvents
    .filter((e) => !e.isShield)
    .reduce((sum, e) => sum + Math.max(0, e.durationMinutes), 0);
  const nominalMinutes = slot.nominalHours * 60;
  return {
    busyMinutes,
    remainingMinutes: Math.max(0, nominalMinutes - busyMinutes),
  };
}

export function buildSlotFrictionPrompt(
  slotId: TimeSlotId,
  existingTitles: readonly string[],
): GentleFrictionInfo | null {
  const spec = SEMANTIC_SLOT_BY_ID[slotId];
  if (existingTitles.length < spec.softCap) return null;
  const firstTitle = existingTitles[0] ?? "当前事项";
  const message =
    slotId === "morning"
      ? `「${spec.name}」已满（建议 ${spec.softCap} 项，当前：${firstTitle}）：替换当前主线、顺延至明天上午，还是仍然叠加？`
      : `「${spec.name}」已达建议容量（${existingTitles.length}/${spec.softCap} 项）：替换、顺延至明天，还是仍然叠加？`;
  return {
    scope: "day-slot",
    targetId: slotId,
    currentCount: existingTitles.length,
    softCap: spec.softCap,
    existingTitles: [...existingTitles],
    message,
  };
}

export function buildWeekFrictionPrompt(
  weekKey: string,
  recommendedMax: number,
  existingTitles: readonly string[],
): GentleFrictionInfo | null {
  if (existingTitles.length < recommendedMax) return null;
  return {
    scope: "week",
    targetId: weekKey,
    currentCount: existingTitles.length,
    softCap: recommendedMax,
    existingTitles: [...existingTitles],
    message: `本周容器已达建议上限（${existingTitles.length}/${recommendedMax} 块）：继续塞入容易全线分散，建议先替换或移出 1 块。`,
  };
}
