import test from "node:test";
import assert from "node:assert/strict";
import {
  TimeEngine,
  classifyClockToSlot,
  compactHours,
  compactMinutes,
  computeWeekCapacitySummary,
  dateKeyFromMs,
  offsetDate,
  parseTimeRegistry,
  weekKeyFor,
  type CalendarHardEvent,
} from "../src/index.ts";

const TODAY_MS = new Date(2026, 10, 21, 10, 0, 0).getTime(); // 2026-11-21 (Saturday)
const TODAY = dateKeyFromMs(TODAY_MS);
const YESTERDAY = offsetDate(TODAY, -1);
const TWO_DAYS_AGO = offsetDate(TODAY, -2);
const TOMORROW = offsetDate(TODAY, 1);

function makeHardEvent(date: string, startTime: string, endTime: string, durationMinutes: number, title = "固定会议"): CalendarHardEvent {
  return {
    id: `ev-${date}-${startTime}`,
    title,
    calendarName: "Work",
    date,
    startTime,
    endTime,
    startAt: `${date}T${startTime}`,
    endAt: `${date}T${endTime}`,
    durationMinutes,
    slotId: classifyClockToSlot(startTime),
  };
}

test("Pure semantic time model buckets hard events and narrows capacity on dense calendar weeks", () => {
  assert.equal(classifyClockToSlot("09:30"), "morning");
  assert.equal(classifyClockToSlot("14:00"), "afternoon");
  assert.equal(classifyClockToSlot("19:30"), "evening");
  assert.equal(compactHours(0), "空");
  assert.equal(compactHours(90), "1.5h");
  assert.equal(compactMinutes(75), "1h15m");

  const wk = weekKeyFor(TODAY);
  const normal = computeWeekCapacitySummary({
    today: TODAY,
    weekKey: wk,
    hardEvents: [makeHardEvent(TODAY, "14:00", "15:00", 60)],
    openMoveCount: 3,
  });
  assert.equal(normal.isDenseWeek, false);
  assert.equal(normal.recommendedMin, 3);
  assert.equal(normal.recommendedMax, 5);
  assert.equal(normal.overCapacity, false);

  // Dense week: >= 3 days with >= 2.5h hard events -> capacity narrows to 1-3 moves!
  const denseEvents: CalendarHardEvent[] = [
    makeHardEvent(wk, "09:30", "12:00", 150),
    makeHardEvent(offsetDate(wk, 1), "14:00", "17:00", 180),
    makeHardEvent(offsetDate(wk, 2), "10:00", "12:30", 150),
  ];
  const dense = computeWeekCapacitySummary({
    today: TODAY,
    weekKey: wk,
    hardEvents: denseEvents,
    openMoveCount: 4,
  });
  assert.equal(dense.isDenseWeek, true);
  assert.equal(dense.recommendedMin, 1);
  assert.equal(dense.recommendedMax, 3);
  assert.equal(dense.overCapacity, true);
});

test("TimeEngine handles 3 semantic slots, gentle friction, carryover tray (>=3 repeat), focus accumulation, and Ghost Undo", () => {
  const engine = new TimeEngine(undefined, TODAY_MS);

  // 1. Add week move & place into morning slot
  const move = engine.addWeekMove({ title: "完成核心告警降噪闭环", areaId: "area-main" }, TODAY_MS);
  const placed1 = engine.placeDayItem(
    { title: move.title, date: TODAY, slotId: "morning", weekMoveId: move.id, areaId: "area-main" },
    TODAY_MS,
  );
  assert.equal(placed1.friction, null);

  // 2. Gentle friction when morning slot is already full (softCap = 1)
  const friction = engine.checkSlotFriction(TODAY, "morning");
  assert.ok(friction);
  assert.match(friction.message, /上午 · 深潜.*已满/);

  // Defer-tomorrow keeps today's morning uncluttered and schedules tomorrow cleanly
  const deferred = engine.placeDayItem(
    { title: "补齐边界回归用例", date: TODAY, slotId: "morning", overflowMode: "defer-tomorrow" },
    TODAY_MS,
  );
  assert.equal(deferred.item.date, TOMORROW);

  // Replace swaps morning item safely without losing linked week move
  const replaced = engine.placeDayItem(
    { title: "先收窄 Top 3 噪声规则", date: TODAY, slotId: "morning", weekMoveId: move.id, areaId: "area-main", overflowMode: "replace" },
    TODAY_MS,
  );
  assert.equal(replaced.displacedItemId, placed1.item.id);
  const snapAfterReplace = engine.buildSnapshot(TODAY_MS, [
    makeHardEvent(TODAY, "14:00", "15:30", 90, "团队周会"),
  ]);
  const morningSlot = snapAfterReplace.todaySlots.find((s) => s.spec.id === "morning")!;
  assert.equal(morningSlot.items.length, 1);
  assert.equal(morningSlot.items[0]!.title, "先收窄 Top 3 噪声规则");
  const afternoonSlot = snapAfterReplace.todaySlots.find((s) => s.spec.id === "afternoon")!;
  assert.equal(afternoonSlot.hardEvents.length, 1);
  assert.equal(afternoonSlot.busyMinutes, 90);
  assert.equal(afternoonSlot.remainingMinutes, 150);
  const eveningSlot = snapAfterReplace.todaySlots.find((s) => s.spec.id === "evening")!;
  assert.ok(eveningSlot.spec.allowEmptyHint);

  // 3. Carryover tray: past open items never snowball into today's 3 slots; idempotent daily count
  const oldSlip = engine.placeDayItem({ title: "反复拖延的文档整理", date: TWO_DAYS_AGO, slotId: "afternoon" }, TODAY_MS);
  // Simulate already carried over twice previously
  const rawReg = engine.getRegistry();
  const slipRef = rawReg.dayItems.find((i) => i.id === oldSlip.item.id)!;
  slipRef.carryoverCount = 2;
  slipRef.lastCarryoverDate = YESTERDAY;
  engine.replaceRegistry(rawReg);

  const snapCarry1 = engine.buildSnapshot(TODAY_MS);
  assert.equal(snapCarry1.carryoverItems.length, 1);
  assert.equal(snapCarry1.carryoverItems[0]!.carryoverCount, 3);
  assert.equal(snapCarry1.repeatCarryoverItems.length, 1, "carryoverCount >= 3 must surface for 3-cause diagnosis");
  // Same-day rebuild must NOT double increment carryoverCount
  const snapCarry2 = engine.buildSnapshot(TODAY_MS + 60_000);
  assert.equal(snapCarry2.carryoverItems[0]!.carryoverCount, 3);

  // Triage carryover -> return to week
  assert.equal(engine.triageCarryover({ itemId: oldSlip.item.id, decision: "to-week" }, TODAY_MS), true);
  assert.equal(engine.buildSnapshot(TODAY_MS).carryoverItems.length, 0);

  // 4. Focus micro-container: start -> pause -> resume -> finish (28m real time) credits dayItem, weekMove & Area!
  const focusStart = TODAY_MS;
  engine.startFocus({ dayItemId: replaced.item.id, focusRole: "main" }, focusStart);
  engine.pauseFocus(focusStart + 18 * 60_000); // 18m elapsed
  engine.resumeFocus(focusStart + 25 * 60_000); // 7m paused (must NOT count!)
  const rec = engine.finishFocus({ stopNote: "已完成规则筛选，明天补验证" }, focusStart + 35 * 60_000)!; // +10m = 28m
  assert.equal(rec.durationMinutes, 28);
  assert.equal(rec.stopNote, "已完成规则筛选，明天补验证");

  const snapAfterFocus = engine.buildSnapshot(focusStart + 35 * 60_000);
  assert.equal(snapAfterFocus.activeFocus, null);
  assert.equal(snapAfterFocus.weeklyAreaFocusMinutes["area-main"], 28);
  assert.equal(snapAfterFocus.weekMoves.find((m) => m.id === move.id)!.actualMinutes, 28);
  assert.equal(snapAfterFocus.weekMoves.find((m) => m.id === move.id)!.lastStopNote, "已完成规则筛选，明天补验证");

  // 5. Ghost time proposal -> auto frictionWarning -> resolve -> 1-step Undo + parseTimeRegistry roundtrip
  const ghosts = engine.proposeTimePlan(
    {
      agent: "attention-navigator",
      proposals: [
        { kind: "day-place-item", title: "临时插队的评审", slotId: "morning", reason: "验证满载阻力提醒" },
      ],
    },
    TODAY_MS,
  );
  assert.equal(ghosts.length, 1);
  assert.ok(ghosts[0]!.frictionWarning, "proposing into a full morning slot should attach gentle frictionWarning");

  const resolved = engine.resolveTimeProposals([{ proposalId: ghosts[0]!.id, action: "accept" }], TODAY_MS);
  assert.equal(resolved.committedIds.length, 1);
  assert.equal(engine.buildSnapshot(TODAY_MS).todaySlots[0]!.items.length, 2);

  assert.equal(engine.undoLastCommit(), true);
  assert.equal(engine.buildSnapshot(TODAY_MS).todaySlots[0]!.items.length, 1);

  const reparsed = parseTimeRegistry(JSON.parse(JSON.stringify(engine.getRegistry())));
  assert.equal(reparsed.focusHistory.length, 1);
  assert.equal(reparsed.weekMoves.length, engine.getRegistry().weekMoves.length);
});
