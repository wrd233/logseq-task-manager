import { execFile } from "node:child_process";
import process from "node:process";
import {
  classifyClockToSlot,
  validClockTime,
  validDate,
  type CalendarDiagnostics,
  type CalendarHardEvent,
  type CalendarShieldInfo,
} from "@task-copilot/stage-runtime";

export const MACOS_CALENDAR_TCC_GUIDANCE =
  "请在 macOS「系统设置 -> 隐私与安全性 -> 日历」及「自动化」中，允许当前终端或宿主应用访问「日历」；若暂不使用日历协同，系统会自动以纯语义模式运行。";

export type OsascriptRunner = (script: string, args: string[]) => Promise<string>;

export interface AppleCalendarBridgeOptions {
  platform?: NodeJS.Platform;
  disabled?: boolean;
  cacheTtlMs?: number;
  runOsascript?: OsascriptRunner;
}

const DEFAULT_CACHE_TTL_MS = 60_000;
const OSASCRIPT_TIMEOUT_MS = 6_000;

function defaultRunOsascript(script: string, args: string[]): Promise<string> {
  return new Promise((resolveDone, rejectDone) => {
    execFile(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", script, ...args],
      { timeout: OSASCRIPT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || error.message || "").trim();
          rejectDone(Object.assign(new Error(detail || "OSASCRIPT_FAILED"), { code: (error as NodeJS.ErrnoException).code }));
          return;
        }
        resolveDone(stdout);
      },
    );
  });
}

function isCalendarPermissionError(message: string, code?: string): boolean {
  if (code === "EPERM" || code === "EACCES") return true;
  return /(?:-1743|not authorized|permission|denied|not permitted|不允许|未经授权)/iu.test(message);
}

const READ_HARD_EVENTS_JXA = `
function run(argv) {
  var startParts = String(argv[0]).split("-").map(Number);
  var endParts = String(argv[1]).split("-").map(Number);
  var excludeName = String(argv[2] || "");
  var rangeStart = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0);
  var rangeEnd = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);
  var app = Application("Calendar");
  var cals = app.calendars();
  var pad = function(n) { return n < 10 ? "0" + n : String(n); };
  var fmtDate = function(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var fmtTime = function(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  var out = [];
  for (var i = 0; i < cals.length; i++) {
    var cal = cals[i];
    var calName = "";
    try { calName = String(cal.name()); } catch (e) { continue; }
    if (excludeName && calName === excludeName) continue;
    var events = [];
    try {
      events = cal.events.whose({
        _and: [
          { startDate: { _greaterThanEquals: rangeStart } },
          { startDate: { _lessThanEquals: rangeEnd } }
        ]
      })();
    } catch (e) { continue; }
    for (var j = 0; j < events.length; j++) {
      var ev = events[j];
      try {
        if (ev.alldayEvent()) continue;
        var s = ev.startDate();
        var eDate = ev.endDate();
        if (!s || !eDate || eDate.getTime() <= s.getTime()) continue;
        var dur = Math.round((eDate.getTime() - s.getTime()) / 60000);
        if (dur <= 0 || dur >= 1440) continue;
        var uid = "";
        try { uid = String(ev.uid()); } catch (e2) { uid = calName + "-" + s.getTime() + "-" + j; }
        var title = "";
        try { title = String(ev.summary() || ""); } catch (e3) { title = ""; }
        if (!title.trim()) continue;
        out.push({
          id: uid,
          title: title.trim().slice(0, 160),
          calendarName: calName.slice(0, 80),
          date: fmtDate(s),
          startTime: fmtTime(s),
          endTime: fmtTime(eDate),
          durationMinutes: dur
        });
      } catch (e4) {}
    }
  }
  return JSON.stringify(out);
}
`;

const CREATE_SHIELD_JXA = `
function run(argv) {
  var dateStr = String(argv[0]);
  var startStr = String(argv[1]);
  var endStr = String(argv[2]);
  var title = String(argv[3]);
  var preferredCal = String(argv[4] || "");
  var notes = String(argv[5] || "");
  var dp = dateStr.split("-").map(Number);
  var sp = startStr.split(":").map(Number);
  var ep = endStr.split(":").map(Number);
  var startDate = new Date(dp[0], dp[1] - 1, dp[2], sp[0], sp[1], 0, 0);
  var endDate = new Date(dp[0], dp[1] - 1, dp[2], ep[0], ep[1], 0, 0);
  var app = Application("Calendar");
  var cals = app.calendars();
  var target = null;
  if (preferredCal) {
    for (var i = 0; i < cals.length; i++) {
      try { if (String(cals[i].name()) === preferredCal && cals[i].writable()) { target = cals[i]; break; } } catch (e) {}
    }
  }
  if (!target) {
    for (var j = 0; j < cals.length; j++) {
      try {
        var nm = String(cals[j].name());
        if (cals[j].writable() && nm !== "Birthdays" && nm !== "生日" && nm !== "Siri Suggestions") {
          target = cals[j];
          break;
        }
      } catch (e2) {}
    }
  }
  if (!target) throw new Error("NO_WRITABLE_CALENDAR");
  var ev = app.Event({
    summary: title,
    startDate: startDate,
    endDate: endDate,
    description: notes
  });
  target.events.push(ev);
  return JSON.stringify({ eventId: String(ev.uid()), calendarName: String(target.name()) });
}
`;

const WRITE_FOOTPRINT_JXA = `
function run(argv) {
  var calName = String(argv[0] || "Task Copilot 足迹");
  var title = String(argv[1]);
  var startMs = Number(argv[2]);
  var endMs = Number(argv[3]);
  var notes = String(argv[4] || "");
  var app = Application("Calendar");
  var cals = app.calendars();
  var target = null;
  for (var i = 0; i < cals.length; i++) {
    try { if (String(cals[i].name()) === calName) { target = cals[i]; break; } } catch (e) {}
  }
  if (!target) {
    target = app.Calendar({ name: calName });
    app.calendars.push(target);
  }
  var ev = app.Event({
    summary: title,
    startDate: new Date(startMs),
    endDate: new Date(endMs),
    description: notes
  });
  target.events.push(ev);
  return JSON.stringify({ eventId: String(ev.uid()), calendarName: calName });
}
`;

export function parseRawHardEvents(rawJson: string): CalendarHardEvent[] {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!Array.isArray(parsed)) return [];
  const out: CalendarHardEvent[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : null;
    const title = typeof rec.title === "string" && rec.title.trim() ? rec.title.trim().slice(0, 160) : null;
    const calendarName = typeof rec.calendarName === "string" && rec.calendarName.trim() ? rec.calendarName.trim().slice(0, 80) : "日历";
    if (!id || !title || !validDate(rec.date) || !validClockTime(rec.startTime) || !validClockTime(rec.endTime)) continue;
    const durationMinutes =
      typeof rec.durationMinutes === "number" && Number.isFinite(rec.durationMinutes) && rec.durationMinutes > 0
        ? Math.round(rec.durationMinutes)
        : 30;
    out.push({
      id,
      title,
      calendarName,
      date: rec.date,
      startTime: rec.startTime,
      endTime: rec.endTime,
      startAt: `${rec.date}T${rec.startTime}`,
      endAt: `${rec.date}T${rec.endTime}`,
      durationMinutes,
      slotId: classifyClockToSlot(rec.startTime),
      ...(title.startsWith("[主线护盾]") ? { isShield: true } : {}),
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  return out;
}

export class AppleCalendarBridge {
  private readonly platform: NodeJS.Platform;
  private readonly disabled: boolean;
  private readonly cacheTtlMs: number;
  private readonly runOsascript: OsascriptRunner;
  private cache: {
    key: string;
    expiresAt: number;
    events: CalendarHardEvent[];
    diagnostics: CalendarDiagnostics;
  } | null = null;

  constructor(options: AppleCalendarBridgeOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.disabled = options.disabled ?? process.env.TASK_COPILOT_DISABLE_APPLE_CALENDAR === "1";
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.runOsascript = options.runOsascript ?? defaultRunOsascript;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  async readHardEvents(input: {
    startDate: string;
    endDate: string;
    footprintCalendarName: string;
    footprintCalendarEnabled: boolean;
    now?: number;
    forceRefresh?: boolean;
  }): Promise<{ events: CalendarHardEvent[]; diagnostics: CalendarDiagnostics }> {
    const now = input.now ?? Date.now();
    const cacheKey = `${input.startDate}|${input.endDate}|${input.footprintCalendarName}|${input.footprintCalendarEnabled}`;
    if (!input.forceRefresh && this.cache && this.cache.key === cacheKey && this.cache.expiresAt > now) {
      return {
        events: structuredClone(this.cache.events),
        diagnostics: structuredClone(this.cache.diagnostics),
      };
    }

    if (this.disabled) {
      const diagnostics: CalendarDiagnostics = {
        status: "disabled",
        eventCount: 0,
        footprintCalendarName: input.footprintCalendarName,
        footprintCalendarEnabled: input.footprintCalendarEnabled,
        message: "已通过配置关闭 Apple 日历桥接，当前以纯语义模式运行。",
        checkedAt: now,
      };
      this.cache = { key: cacheKey, expiresAt: now + this.cacheTtlMs, events: [], diagnostics };
      return { events: [], diagnostics };
    }

    if (this.platform !== "darwin") {
      const diagnostics: CalendarDiagnostics = {
        status: "unavailable",
        eventCount: 0,
        footprintCalendarName: input.footprintCalendarName,
        footprintCalendarEnabled: input.footprintCalendarEnabled,
        message: "当前非 macOS 环境，跳过 Apple 日历协同（纯语义模式运行）。",
        checkedAt: now,
      };
      this.cache = { key: cacheKey, expiresAt: now + this.cacheTtlMs, events: [], diagnostics };
      return { events: [], diagnostics };
    }

    try {
      const stdout = await this.runOsascript(READ_HARD_EVENTS_JXA, [
        input.startDate,
        input.endDate,
        input.footprintCalendarName,
      ]);
      const events = parseRawHardEvents(stdout.trim() || "[]");
      const diagnostics: CalendarDiagnostics = {
        status: "ok",
        eventCount: events.length,
        footprintCalendarName: input.footprintCalendarName,
        footprintCalendarEnabled: input.footprintCalendarEnabled,
        checkedAt: now,
      };
      this.cache = { key: cacheKey, expiresAt: now + this.cacheTtlMs, events, diagnostics };
      return { events: structuredClone(events), diagnostics: structuredClone(diagnostics) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as NodeJS.ErrnoException)?.code;
      const denied = isCalendarPermissionError(message, code);
      const diagnostics: CalendarDiagnostics = {
        status: denied ? "permission-denied" : "error",
        eventCount: 0,
        footprintCalendarName: input.footprintCalendarName,
        footprintCalendarEnabled: input.footprintCalendarEnabled,
        ...(code ? { errorCode: code } : {}),
        message: denied
          ? "读取 Apple 日历被系统权限拦截（Fail Open，未影响语义时间容器）。"
          : `读取 Apple 日历失败：${message.slice(0, 160)}`,
        ...(denied ? { guidance: MACOS_CALENDAR_TCC_GUIDANCE } : {}),
        checkedAt: now,
      };
      this.cache = { key: cacheKey, expiresAt: now + Math.min(this.cacheTtlMs, 15_000), events: [], diagnostics };
      return { events: [], diagnostics };
    }
  }

  async createShieldEvent(input: {
    date: string;
    startTime?: string;
    endTime?: string;
    title: string;
    calendarName?: string;
    notes?: string;
    now?: number;
  }): Promise<
    | { ok: true; shield: CalendarShieldInfo }
    | { ok: false; status: "permission-denied" | "unavailable" | "disabled" | "error"; message: string; guidance?: string }
  > {
    const now = input.now ?? Date.now();
    const startTime = input.startTime ?? "09:30";
    const endTime = input.endTime ?? "11:30";
    if (!validDate(input.date) || !validClockTime(startTime) || !validClockTime(endTime) || endTime <= startTime) {
      return { ok: false, status: "error", message: "护盾块日期或起止时间无效。" };
    }
    if (this.disabled) {
      return { ok: false, status: "disabled", message: "Apple 日历桥接已禁用，未写入护盾块。" };
    }
    if (this.platform !== "darwin") {
      return { ok: false, status: "unavailable", message: "当前非 macOS 环境，无法写入 Apple 日历。" };
    }
    const summary = input.title.startsWith("[主线护盾]") ? input.title : `[主线护盾] ${input.title}`;
    try {
      const stdout = await this.runOsascript(CREATE_SHIELD_JXA, [
        input.date,
        startTime,
        endTime,
        summary.slice(0, 160),
        input.calendarName ?? "",
        (input.notes ?? "由 Task Copilot 创建的单个上午主线保护块。").slice(0, 300),
      ]);
      const parsed = JSON.parse(stdout.trim()) as { eventId?: string; calendarName?: string };
      this.invalidateCache();
      return {
        ok: true,
        shield: {
          eventId: parsed.eventId || `shield-${now.toString(36)}`,
          calendarName: parsed.calendarName || input.calendarName || "日历",
          date: input.date,
          startTime,
          endTime,
          createdAt: now,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as NodeJS.ErrnoException)?.code;
      const denied = isCalendarPermissionError(message, code);
      return {
        ok: false,
        status: denied ? "permission-denied" : "error",
        message: denied ? "写入 Apple 日历护盾块被系统权限拦截。" : `写入日历护盾失败：${message.slice(0, 160)}`,
        ...(denied ? { guidance: MACOS_CALENDAR_TCC_GUIDANCE } : {}),
      };
    }
  }

  async writeFocusFootprint(input: {
    title: string;
    startedAt: number;
    endedAt: number;
    stopNote?: string;
    calendarName: string;
  }): Promise<{ ok: true; eventId: string } | { ok: false; message: string }> {
    if (this.disabled || this.platform !== "darwin") {
      return { ok: false, message: "Apple 日历足迹未启用或不可用。" };
    }
    if (!Number.isFinite(input.startedAt) || !Number.isFinite(input.endedAt) || input.endedAt - input.startedAt < 60_000) {
      return { ok: false, message: "专注时长不足 1 分钟，跳过写入足迹。" };
    }
    try {
      const stdout = await this.runOsascript(WRITE_FOOTPRINT_JXA, [
        input.calendarName,
        input.title.slice(0, 160),
        String(Math.floor(input.startedAt)),
        String(Math.floor(input.endedAt)),
        (input.stopNote ? `停点便条：${input.stopNote}` : "由 Task Copilot 记录的真实专注足迹。").slice(0, 300),
      ]);
      const parsed = JSON.parse(stdout.trim()) as { eventId?: string };
      return { ok: true, eventId: parsed.eventId || `footprint-${Date.now().toString(36)}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message.slice(0, 160) : "写入专注足迹失败。" };
    }
  }
}
