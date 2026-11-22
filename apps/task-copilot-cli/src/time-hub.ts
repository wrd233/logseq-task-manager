import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WorkspaceError } from "@task-copilot/contracts";
import {
  TimeEngine,
  dateKeyFromMs,
  parseTimeRegistry,
  weekDatesFor,
  weekKeyFor,
  type ActiveFocusSession,
  type CalendarDiagnostics,
  type CalendarShieldInfo,
  type CompletedFocusRecord,
  type StageFocusRole,
  type TimeGhostProposal,
  type TimeResolveDecision,
  type TimeSlotId,
  type TimeSnapshot,
  type TimeUserAction,
} from "@task-copilot/stage-runtime";
import { AppleCalendarBridge, type AppleCalendarBridgeOptions } from "./apple-calendar.ts";
import { activateRunningLogseq } from "./macos-focus.ts";
import { atomicJson } from "./workspace-files.ts";

export interface TimeHubOptions {
  stateDirectory: string;
  appleCalendar?: AppleCalendarBridgeOptions;
  activateLogseq?: (options: {
    stateDirectory?: string;
    graphId?: string;
  }) => Promise<{ activated: boolean; appPath: string | null; pid: number | null }>;
}

export class TimeHub {
  private readonly stateDirectory: string;
  private readonly registryPath: string;
  private readonly engine = new TimeEngine();
  private readonly calendar: AppleCalendarBridge;
  private readonly activateLogseqFn: NonNullable<TimeHubOptions["activateLogseq"]>;
  private loaded = false;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(options: TimeHubOptions) {
    this.stateDirectory = resolve(options.stateDirectory);
    this.registryPath = join(this.stateDirectory, "time-stage.json");
    this.calendar = new AppleCalendarBridge(options.appleCalendar);
    this.activateLogseqFn = options.activateLogseq ?? activateRunningLogseq;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = JSON.parse(await readFile(this.registryPath, "utf8")) as unknown;
      this.engine.replaceRegistry(parseTimeRegistry(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // Corrupt file fails open to clean operational time state; never blocks Companion.
      }
    }
  }

  private persist(): Promise<void> {
    const data = this.engine.getRegistry();
    const pending = this.writeQueue.then(() => atomicJson(this.registryPath, data));
    this.writeQueue = pending.catch(() => undefined);
    return pending;
  }

  private async readWeekCalendar(now: number, forceRefresh = false) {
    const today = dateKeyFromMs(now);
    const dates = weekDatesFor(today);
    const reg = this.engine.getRegistry();
    return this.calendar.readHardEvents({
      startDate: dates[0]!,
      endDate: dates[6]!,
      footprintCalendarName: reg.footprintCalendarName,
      footprintCalendarEnabled: reg.footprintCalendarEnabled,
      now,
      forceRefresh,
    });
  }

  async calendarStatus(forceRefresh = true): Promise<CalendarDiagnostics> {
    await this.ensureLoaded();
    const { diagnostics } = await this.readWeekCalendar(Date.now(), forceRefresh);
    return diagnostics;
  }

  async snapshot(now = Date.now(), forceRefreshCalendar = false): Promise<TimeSnapshot> {
    await this.ensureLoaded();
    const carryoverMutated = this.engine.syncCarryover(now);
    if (carryoverMutated) {
      await this.persist();
    }
    const { events, diagnostics } = await this.readWeekCalendar(now, forceRefreshCalendar);
    return this.engine.buildSnapshot(now, events, diagnostics);
  }

  async applyAction(
    action: TimeUserAction,
    now = Date.now(),
  ): Promise<{
    snapshot: TimeSnapshot;
    activatedLogseq?: { activated: boolean; appPath: string | null; pid: number | null };
    shield?: CalendarShieldInfo;
    footprintWritten?: boolean;
    warning?: string;
    finishedFocus?: CompletedFocusRecord;
    startedFocus?: ActiveFocusSession;
  }> {
    await this.ensureLoaded();

    if (action.type === "create-calendar-shield") {
      const reg = this.engine.getRegistry();
      const target = reg.dayItems.find((i) => i.id === action.itemId);
      if (!target) {
        throw new WorkspaceError("INVALID_INPUT", `未找到对应的今日事项：${action.itemId}`);
      }
      if (target.calendarShield) {
        return { snapshot: await this.snapshot(now), shield: target.calendarShield };
      }
      const created = await this.calendar.createShieldEvent({
        date: target.date,
        startTime: action.startTime ?? "09:30",
        endTime: action.endTime ?? "11:30",
        title: target.title,
        now,
      });
      if (!created.ok) {
        return {
          snapshot: await this.snapshot(now),
          warning: created.guidance ? `${created.message} ${created.guidance}` : created.message,
        };
      }
      this.engine.setCalendarShield(target.id, created.shield, now);
      await this.persist();
      return { snapshot: await this.snapshot(now, true), shield: created.shield };
    }

    const res = this.engine.applyAction(action, now);
    let activatedLogseq: { activated: boolean; appPath: string | null; pid: number | null } | undefined;
    let footprintWritten: boolean | undefined;
    let warning: string | undefined;

    if (action.type === "start-focus" && res.startedFocus) {
      const workRef = res.startedFocus.workRef;
      if (workRef?.kind === "logseq" || res.startedFocus.projectWorkKey) {
        const graphId = workRef?.kind === "logseq" ? workRef.graphId : undefined;
        activatedLogseq = await this.activateLogseqFn({
          stateDirectory: this.stateDirectory,
          ...(graphId ? { graphId } : {}),
        }).catch(() => ({ activated: false, appPath: null, pid: null }));
      }
    }

    if (action.type === "finish-focus" && res.finishedFocus) {
      const reg = this.engine.getRegistry();
      const shouldWriteFootprint =
        action.writeFootprint === true || (action.writeFootprint !== false && reg.footprintCalendarEnabled);
      if (shouldWriteFootprint && res.finishedFocus.durationMinutes >= 1) {
        const fp = await this.calendar.writeFocusFootprint({
          title: res.finishedFocus.title,
          startedAt: res.finishedFocus.startedAt,
          endedAt: res.finishedFocus.endedAt,
          ...(res.finishedFocus.stopNote ? { stopNote: res.finishedFocus.stopNote } : {}),
          calendarName: reg.footprintCalendarName,
        });
        if (fp.ok) {
          this.engine.attachFootprintEventId(res.finishedFocus.id, fp.eventId);
          footprintWritten = true;
        } else {
          footprintWritten = false;
          warning = fp.message;
        }
      }
    }

    if (res.mutatedRegistry || footprintWritten) {
      await this.persist();
    }

    const snapshot = await this.snapshot(now);
    return {
      snapshot,
      ...(activatedLogseq ? { activatedLogseq } : {}),
      ...(footprintWritten !== undefined ? { footprintWritten } : {}),
      ...(warning ? { warning } : {}),
      ...(res.finishedFocus ? { finishedFocus: res.finishedFocus } : {}),
      ...(res.startedFocus ? { startedFocus: res.startedFocus } : {}),
    };
  }

  // ==================== TIME MCP OPERATIONS ====================

  private formatOverview(snap: TimeSnapshot) {
    return {
      today: snap.today,
      weekKey: snap.weekKey,
      weekCapacity: snap.weekCapacity,
      weekMoves: snap.weekMoves,
      todaySlots: snap.todaySlots.map((s) => ({
        slotId: s.spec.id,
        name: s.spec.name,
        softCap: s.spec.softCap,
        items: s.items,
        hardEvents: s.hardEvents,
        busyMinutes: s.busyMinutes,
        remainingMinutes: s.remainingMinutes,
        overSoftCap: s.overSoftCap,
        ...(s.frictionMessage ? { frictionMessage: s.frictionMessage } : {}),
      })),
      carryoverItems: snap.carryoverItems,
      repeatCarryoverItems: snap.repeatCarryoverItems,
      activeFocus: snap.activeFocus,
      recentFocusRecords: snap.recentFocusRecords,
      weeklyAreaFocusMinutes: snap.weeklyAreaFocusMinutes,
      pendingTimeProposals: snap.ghostProposals,
      footprintCalendarEnabled: snap.footprintCalendarEnabled,
      footprintCalendarName: snap.footprintCalendarName,
      calendarDiagnostics: snap.calendarDiagnostics ?? null,
      workbenchGapDays: snap.workbenchGapDays,
      restartDismissedToday: snap.restartDismissedToday,
      canUndo: snap.canUndo,
    };
  }

  async mcpGetOverview(now = Date.now()) {
    const snap = await this.snapshot(now);
    return this.formatOverview(snap);
  }

  async mcpProposePlan(input: {
    agent: string;
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
  }) {
    await this.ensureLoaded();
    const now = Date.now();
    const snapBefore = await this.snapshot(now);
    const reg = this.engine.getRegistry();
    for (const p of input.proposals) {
      if (p.kind === "carryover-triage") {
        if (!p.dayItemId || !snapBefore.carryoverItems.some((c) => c.id === p.dayItemId)) {
          throw new WorkspaceError("INVALID_INPUT", "carryover-triage 需指定当前遗留抽屉中存在的 dayItemId。");
        }
      }
      if (p.kind === "day-rescue") {
        const targetDate = p.date ?? snapBefore.today;
        const openOnTarget = reg.dayItems.filter((i) => i.state === "open" && i.date === targetDate);
        if (openOnTarget.length === 0) {
          throw new WorkspaceError(
            "INVALID_INPUT",
            `日期 ${targetDate} 的三槽当前为空，没有需要退回本周的事项；请改用 day-place-item 直接安排。`,
          );
        }
        if (p.dayItemId && !openOnTarget.some((i) => i.id === p.dayItemId)) {
          throw new WorkspaceError("INVALID_INPUT", `未在 ${targetDate} 的待办槽位中找到保留项 dayItemId：${p.dayItemId}`);
        }
      }
    }
    const proposals = this.engine.proposeTimePlan(
      {
        agent: input.agent,
        recommendedWeekMax: snapBefore.weekCapacity.recommendedMax,
        proposals: input.proposals,
      },
      now,
    );
    return {
      proposals,
      writesFormalState: false,
      weekCapacitySummary: snapBefore.weekCapacity.summary,
    };
  }

  async mcpResolveProposals(decisions: readonly TimeResolveDecision[]) {
    await this.ensureLoaded();
    const missing = this.engine.findMissingProposalIds(decisions);
    if (missing.length > 0) {
      throw new WorkspaceError("PROPOSAL_NOT_FOUND", `未找到待确认的时间虚态提议：${missing.join(", ")}`);
    }
    const result = this.engine.resolveTimeProposals(decisions, Date.now());
    if (result.committedIds.length > 0) {
      await this.persist();
    }
    return { ...result, operationalLayer: "companion-time-stage" };
  }

  async mcpUndoLastCommit() {
    await this.ensureLoaded();
    if (!this.engine.canUndo()) {
      throw new WorkspaceError("NOTHING_TO_UNDO", "当前没有可撤销的上一步时间层凝固操作。");
    }
    const undone = this.engine.undoLastCommit();
    if (undone) {
      await this.persist();
    }
    return {
      undone,
      canUndo: this.engine.canUndo(),
      operationalLayer: "companion-time-stage",
    };
  }

  async mcpFocusControl(input: {
    command: "start" | "pause" | "resume" | "finish" | "create_shield";
    dayItemId?: string;
    weekMoveId?: string;
    title?: string;
    slotId?: TimeSlotId;
    areaId?: string | null;
    projectWorkKey?: string | null;
    focusRole?: StageFocusRole;
    stopNote?: string;
    markDayItemDone?: boolean;
    writeFootprint?: boolean;
    startTime?: string;
    endTime?: string;
  }) {
    await this.ensureLoaded();
    const now = Date.now();
    const formatFocusResult = (
      out: Awaited<ReturnType<TimeHub["applyAction"]>>,
    ) => ({
      command: input.command,
      activeFocus: out.snapshot.activeFocus,
      overview: this.formatOverview(out.snapshot),
      ...(out.startedFocus ? { startedFocus: out.startedFocus } : {}),
      ...(out.finishedFocus ? { finishedFocus: out.finishedFocus } : {}),
      ...(out.shield ? { shield: out.shield } : {}),
      ...(out.activatedLogseq ? { activatedLogseq: out.activatedLogseq } : {}),
      ...(out.footprintWritten !== undefined ? { footprintWritten: out.footprintWritten } : {}),
      ...(out.warning ? { warning: out.warning } : {}),
    });

    if (input.command === "start") {
      const out = await this.applyAction(
        {
          type: "start-focus",
          ...(input.dayItemId ? { dayItemId: input.dayItemId } : {}),
          ...(input.weekMoveId ? { weekMoveId: input.weekMoveId } : {}),
          ...(input.title ? { title: input.title } : {}),
          ...(input.slotId ? { slotId: input.slotId } : {}),
          ...(input.areaId !== undefined ? { areaId: input.areaId } : {}),
          ...(input.projectWorkKey !== undefined ? { projectWorkKey: input.projectWorkKey } : {}),
          ...(input.focusRole ? { focusRole: input.focusRole } : {}),
        },
        now,
      );
      return formatFocusResult(out);
    }
    if (input.command === "pause") {
      const active = this.engine.getActiveFocus();
      if (!active) throw new WorkspaceError("NO_ACTIVE_FOCUS", "当前没有进行中的专注会话。");
      if (active.status === "paused") throw new WorkspaceError("FOCUS_ALREADY_PAUSED", "当前专注会话已处于暂停状态。");
      return formatFocusResult(await this.applyAction({ type: "pause-focus" }, now));
    }
    if (input.command === "resume") {
      const active = this.engine.getActiveFocus();
      if (!active) throw new WorkspaceError("NO_ACTIVE_FOCUS", "当前没有进行中的专注会话。");
      if (active.status === "running") throw new WorkspaceError("FOCUS_ALREADY_RUNNING", "当前专注会话正在进行中。");
      return formatFocusResult(await this.applyAction({ type: "resume-focus" }, now));
    }
    if (input.command === "finish") {
      const active = this.engine.getActiveFocus();
      if (!active) throw new WorkspaceError("NO_ACTIVE_FOCUS", "当前没有进行中的专注会话。");
      return formatFocusResult(
        await this.applyAction(
          {
            type: "finish-focus",
            ...(input.stopNote !== undefined ? { stopNote: input.stopNote } : {}),
            ...(input.markDayItemDone !== undefined ? { markDayItemDone: input.markDayItemDone } : {}),
            ...(input.writeFootprint !== undefined ? { writeFootprint: input.writeFootprint } : {}),
          },
          now,
        ),
      );
    }
    if (input.command === "create_shield") {
      if (!input.dayItemId) {
        throw new WorkspaceError("INVALID_INPUT", "create_shield 需要提供目标今日事项 dayItemId。");
      }
      return formatFocusResult(
        await this.applyAction(
          {
            type: "create-calendar-shield",
            itemId: input.dayItemId,
            ...(input.startTime ? { startTime: input.startTime } : {}),
            ...(input.endTime ? { endTime: input.endTime } : {}),
          },
          now,
        ),
      );
    }
    throw new WorkspaceError("INVALID_INPUT", `未知的专注控制命令：${String(input.command)}`);
  }

  /** Helper exposing current week key for tests and diagnostics. */
  currentWeekKey(now = Date.now()): string {
    return weekKeyFor(dateKeyFromMs(now));
  }
}
