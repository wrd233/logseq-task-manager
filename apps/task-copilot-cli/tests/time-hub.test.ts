import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dateKeyFromMs } from "@task-copilot/stage-runtime";
import { AppleCalendarBridge, MACOS_CALENDAR_TCC_GUIDANCE } from "../src/apple-calendar.ts";
import { startWorkspaceServer } from "../src/workspace-server.ts";
import { TimeHub } from "../src/time-hub.ts";

test("AppleCalendarBridge reads timed events, creates single shield, writes opt-in footprint, and fails open on TCC denial", async () => {
  const today = dateKeyFromMs(Date.now());
  let calls = 0;
  const bridge = new AppleCalendarBridge({
    platform: "darwin",
    disabled: false,
    cacheTtlMs: 60_000,
    runOsascript: async (script, args) => {
      calls++;
      if (script.includes("alldayEvent")) {
        return JSON.stringify([
          { id: "ev-1", title: "团队周会", calendarName: "工作", date: today, startTime: "14:00", endTime: "15:30", durationMinutes: 90 },
          { id: "ev-2", title: "[主线护盾] 架构设计", calendarName: "工作", date: today, startTime: "09:30", endTime: "11:30", durationMinutes: 120 },
        ]);
      }
      if (script.includes("NO_WRITABLE_CALENDAR")) {
        assert.equal(args[0], today);
        assert.equal(args[1], "09:30");
        assert.equal(args[2], "11:30");
        assert.match(args[3]!, /^\[主线护盾\] /);
        return JSON.stringify({ eventId: "shield-uid-1", calendarName: "工作" });
      }
      return JSON.stringify({ eventId: "fp-uid-1", calendarName: args[0] });
    },
  });

  // Layer 1: Read hard events + cache
  const read1 = await bridge.readHardEvents({
    startDate: today,
    endDate: today,
    footprintCalendarName: "Task Copilot 足迹",
    footprintCalendarEnabled: false,
  });
  assert.equal(read1.diagnostics.status, "ok");
  assert.equal(read1.events.length, 2);
  assert.equal(read1.events[0]!.isShield, true);
  assert.equal(read1.events[1]!.slotId, "afternoon");
  assert.equal(calls, 1);

  // Cached hit does not re-run osascript
  await bridge.readHardEvents({
    startDate: today,
    endDate: today,
    footprintCalendarName: "Task Copilot 足迹",
    footprintCalendarEnabled: false,
  });
  assert.equal(calls, 1);

  // Layer 2: Create morning shield block
  const shieldRes = await bridge.createShieldEvent({ date: today, title: "核心告警降噪" });
  assert.equal(shieldRes.ok, true);
  if (shieldRes.ok) {
    assert.equal(shieldRes.shield.eventId, "shield-uid-1");
    assert.equal(shieldRes.shield.startTime, "09:30");
    assert.equal(shieldRes.shield.endTime, "11:30");
  }

  // Layer 3: Write optional focus footprint
  const now = Date.now();
  const fpRes = await bridge.writeFocusFootprint({
    title: "核心告警降噪",
    startedAt: now - 25 * 60_000,
    endedAt: now,
    stopNote: "完成噪声规则收敛",
    calendarName: "Task Copilot 足迹",
  });
  assert.equal(fpRes.ok, true);

  // Fail Open on macOS TCC -1743 denial
  const deniedBridge = new AppleCalendarBridge({
    platform: "darwin",
    disabled: false,
    runOsascript: async () => {
      throw new Error("execution error: Not authorized to send Apple events to Calendar. (-1743)");
    },
  });
  const denied = await deniedBridge.readHardEvents({
    startDate: today,
    endDate: today,
    footprintCalendarName: "Task Copilot 足迹",
    footprintCalendarEnabled: false,
  });
  assert.deepEqual(denied.events, []);
  assert.equal(denied.diagnostics.status, "permission-denied");
  assert.equal(denied.diagnostics.guidance, MACOS_CALENDAR_TCC_GUIDANCE);
});

test("Companion TimeHub serves time_* MCP tools, Apple Calendar 3-layer synergy, macos-focus handoff, and persists across restart", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-time-hub-")));
  const stateDir = join(root, "state");
  const inboxDir = join(root, "inbox");
  const icloudDir = join(root, "icloud");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await mkdir(inboxDir, { recursive: true, mode: 0o700 });
  await mkdir(icloudDir, { recursive: true, mode: 0o700 });

  const today = dateKeyFromMs(Date.now());
  const activatedCalls: Array<{ stateDirectory?: string; graphId?: string }> = [];
  const footprintWrites: string[] = [];

  const mockOsascript = async (script: string, args: string[]) => {
    if (script.includes("alldayEvent")) {
      return JSON.stringify([
        { id: "ev-meet", title: "架构评审", calendarName: "工作", date: today, startTime: "14:00", endTime: "15:30", durationMinutes: 90 },
      ]);
    }
    if (script.includes("NO_WRITABLE_CALENDAR")) {
      return JSON.stringify({ eventId: "sh-101", calendarName: "工作" });
    }
    footprintWrites.push(`${args[0]}:${args[1]}`);
    return JSON.stringify({ eventId: "fp-202", calendarName: args[0] });
  };

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: inboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { platform: "darwin", disabled: false, runOsascript: mockOsascript },
    activateLogseq: async (opts) => {
      activatedCalls.push(opts);
      return { activated: true, appPath: "/Applications/Logseq.app", pid: 4242 };
    },
  });
  const { baseUrl, token, instanceId } = server.descriptor;
  const cliHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-workspace-instance": instanceId,
  };

  const callMcpRaw = async (name: string, args: Record<string, unknown>) => {
    const res = await fetch(`${baseUrl}/mcp/call`, {
      method: "POST",
      headers: cliHeaders,
      body: JSON.stringify({ name, arguments: args, clientId: "attention-navigator" }),
    });
    const json = (await res.json()) as { value?: Record<string, unknown>; error?: { code?: string; message: string } };
    return { status: res.status, json };
  };
  const callMcp = async (name: string, args: Record<string, unknown>) => {
    const { status, json } = await callMcpRaw(name, args);
    assert.equal(status, 200, JSON.stringify(json));
    return json.value!;
  };

  try {
    // 1. Standalone /stage/app serves the shared three-day switcher and the season view
    const htmlRes = await fetch(`${baseUrl}/stage/app?token=${token}`);
    const html = await htmlRes.text();
    assert.match(html, /季节星区/);
    assert.match(html, /data-tcs-tab="week">本周/);
    assert.match(html, /data-tcs-tab="today">今日 · 早间拍板/);
    assert.match(html, /data-tcs-tab="tomorrow">明日 · 前晚构思/);
    assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);

    // 2. /stage/calendar-status exposes Apple Calendar read status
    const calRes = await fetch(`${baseUrl}/stage/calendar-status`, {
      method: "POST",
      headers: cliHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(calRes.status, 200);
    const calJson = (await calRes.json()) as { value: { status: string; eventCount: number } };
    assert.equal(calJson.value.status, "ok");
    assert.equal(calJson.value.eventCount, 1);

    // 3. time_get_overview reflects Apple Calendar hard event in afternoon slot
    const overview1 = await callMcp("time_get_overview", {});
    const slots1 = overview1.todaySlots as Array<{ slotId: string; busyMinutes: number; hardEvents: unknown[] }>;
    assert.equal(slots1.find((s) => s.slotId === "afternoon")!.busyMinutes, 90);
    assert.equal(slots1.find((s) => s.slotId === "afternoon")!.hardEvents.length, 1);

    // 3b. Guardrails on empty day & idle focus:
    const emptyRescue = await callMcpRaw("time_propose_plan", {
      proposals: [{ kind: "day-rescue", title: "无事项可救火", reason: "测试前置条件" }],
    });
    assert.equal(emptyRescue.status, 400);
    assert.equal(emptyRescue.json.error?.code, "INVALID_INPUT");

    const idleFinish = await callMcpRaw("time_focus_control", { command: "finish" });
    assert.equal(idleFinish.status, 400);
    assert.equal(idleFinish.json.error?.code, "NO_ACTIVE_FOCUS");

    const badTimeResolve = await callMcpRaw("time_resolve_proposals", {
      decisions: [{ proposalId: "tghost-nonexistent", action: "accept" }],
    });
    assert.equal(badTimeResolve.status, 400);
    assert.equal(badTimeResolve.json.error?.code, "PROPOSAL_NOT_FOUND");

    // 4. time_propose_plan (Ghost) -> time_resolve_proposals (Commit) -> undoLast -> re-commit
    const proposed = await callMcp("time_propose_plan", {
      proposals: [
        { kind: "week-add-move", title: "落地核心告警降噪", areaId: "area-1", reason: "本周主线推进块" },
        { kind: "day-place-item", title: "完成 Top 3 噪声规则验证", slotId: "morning", areaId: "area-1", projectWorkKey: "logseq:graph:/main:blk-1", reason: "护住上午深潜" },
      ],
    });
    assert.equal(proposed.writesFormalState, false);
    const proposals = proposed.proposals as Array<{ id: string }>;
    assert.equal(proposals.length, 2);

    const resolved = await callMcp("time_resolve_proposals", {
      decisions: proposals.map((p) => ({ proposalId: p.id, action: "accept" })),
    });
    assert.equal((resolved.committedIds as string[]).length, 2);
    assert.equal(typeof resolved.version, "number");

    const undoneTime = await callMcp("time_resolve_proposals", { undoLast: true });
    assert.equal(undoneTime.undone, true);
    assert.equal(undoneTime.canUndo, false);
    assert.equal(typeof undoneTime.version, "number");
    // Re-accept restored proposals so the rest of the test proceeds cleanly
    await callMcp("time_resolve_proposals", {
      decisions: proposals.map((p) => ({ proposalId: p.id, action: "accept" })),
    });

    const overview2 = await callMcp("time_get_overview", {});
    const morningItem = ((overview2.todaySlots as Array<{ slotId: string; items: Array<{ id: string }> }>).find(
      (s) => s.slotId === "morning",
    )!.items)[0]!;

    // 5. Single-click morning calendar shield via time_focus_control
    const shieldOut = await callMcp("time_focus_control", {
      command: "create_shield",
      dayItemId: morningItem.id,
      startTime: "09:30",
      endTime: "11:30",
    });
    assert.equal((shieldOut.shield as { eventId: string }).eventId, "sh-101");

    // 6. Start focus triggers macos-focus activateLogseq + finish records stopNote
    const started = await callMcp("time_focus_control", {
      command: "start",
      dayItemId: morningItem.id,
      focusRole: "main",
    });
    assert.equal(activatedCalls.length, 1, "starting focus on a project-linked item must activate Logseq");
    assert.equal((started.startedFocus as { roleLabel: string }).roleLabel, "主线");

    await callMcp("time_focus_control", { command: "pause" });
    await callMcp("time_focus_control", { command: "resume" });

    // Finish focus with stopNote & verify unified overview schema (pendingTimeProposals, not raw ghostProposals)
    const finished = await callMcp("time_focus_control", {
      command: "finish",
      stopNote: "已完成 3 条规则，待补充回放测试",
    });
    assert.equal((finished.finishedFocus as { stopNote: string }).stopNote, "已完成 3 条规则，待补充回放测试");
    assert.ok(Array.isArray((finished.overview as { pendingTimeProposals: unknown[] }).pendingTimeProposals));
    assert.equal((finished.overview as Record<string, unknown>).ghostProposals, undefined);
  } finally {
    await server.close();
  }

  // 7. Restart Companion -> week move, morning item, calendar shield, stopNote & focus history survive on disk!
  const restarted = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: inboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { disabled: true },
  });
  try {
    const snap = await restarted.timeHub.snapshot();
    assert.equal(snap.weekMoves.length, 1);
    const morning = snap.todaySlots.find((s) => s.spec.id === "morning")!;
    assert.equal(morning.items.length, 1);
    assert.equal(morning.items[0]!.calendarShield?.eventId, "sh-101");
    assert.equal(morning.items[0]!.lastStopNote, "已完成 3 条规则，待补充回放测试");
    assert.equal(snap.recentFocusRecords.length, 1);
  } finally {
    await restarted.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("TimeHub asks Apple Calendar for next Monday on Sunday without changing the seven-day week", async () => {
  const root = await mkdtemp(join(tmpdir(), "tc-time-sunday-"));
  try {
    const sunday = new Date(2026, 10, 29, 17);
    const hub = new TimeHub({
      stateDirectory: root,
      appleCalendar: {
        platform: "darwin", disabled: false,
        runOsascript: async (_script, args) => {
          assert.deepEqual(args.slice(0, 2), ["2026-11-23", "2026-11-30"]);
          return JSON.stringify([
            { id: "monday", title: "周一评审", calendarName: "工作", date: "2026-11-30", startTime: "09:00", endTime: "10:00", durationMinutes: 60 },
          ]);
        },
      },
    });
    const snapshot = await hub.snapshot(sunday.getTime());
    assert.equal(snapshot.weekCapacity.dailyOverview.length, 7);
    assert.equal(snapshot.weekCapacity.totalHardEventMinutes, 0);
    assert.equal(snapshot.tomorrowDate, "2026-11-30");
    assert.equal(snapshot.tomorrowSlots[0]?.hardEvents[0]?.title, "周一评审");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
