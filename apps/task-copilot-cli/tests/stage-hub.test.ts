import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workKey } from "@task-copilot/contracts";
import { startWorkspaceServer } from "../src/workspace-server.ts";

test("Companion StageHub serves stage_* MCP tools, /stage/app, SSE, Inbox resonance, and persists Plan A registry", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-stage-hub-")));
  const stateDir = join(root, "state");
  const inboxDir = join(root, "inbox");
  const icloudDir = join(root, "icloud-inbox");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await mkdir(inboxDir, { recursive: true, mode: 0o700 });
  await mkdir(icloudDir, { recursive: true, mode: 0o700 });

  // Seed one real DSH PersonalInboxStore record
  const inboxId = "11111111-1111-4111-8111-111111111111";
  await writeFile(
    join(inboxDir, `${inboxId}.json`),
    JSON.stringify({
      item: {
        schemaVersion: 1,
        id: inboxId,
        revision: 1,
        originalContent: "核心告警降噪升级里补充维护窗口自动抑制规则",
        editedContent: null,
        context: "",
        source: { type: "manual" },
        materials: [],
        workRef: null,
        status: "open",
        archivedFrom: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        outcomes: [],
      },
      previous: null,
      operations: {},
    }),
    "utf8",
  );

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: inboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { disabled: true },
  });
  const { baseUrl, token, pluginToken, instanceId } = server.descriptor;
  const cliHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-workspace-instance": instanceId,
  };
  const pluginHeaders = {
    "content-type": "application/json",
    "x-workspace-plugin": pluginToken,
    "x-workspace-instance": instanceId,
  };

  try {
    // 1. Publish catalog via plugin route (no active single-work connection needed!)
    const workRef = { kind: "logseq" as const, graphId: "graph:/demo", rootUuid: "block-obs-1", sourceKind: "block" as const };
    const obsKey = workKey(workRef);
    const pub = await fetch(`${baseUrl}/plugin/catalog`, {
      method: "POST",
      headers: pluginHeaders,
      body: JSON.stringify({
        schemaVersion: 1,
        graphId: "graph:/demo",
        graphName: "Demo",
        refreshedAt: Date.now(),
        works: [
          {
            workRef,
            title: "核心告警降噪升级",
            objectType: "MiniProject",
            location: "监控平台 / 告警治理",
            updatedAt: Date.now() - 60_000,
          },
          {
            workRef: { kind: "logseq", graphId: "graph:/demo", rootUuid: "block-net-1", sourceKind: "block" },
            title: "跨区网络割接预案",
            objectType: "Project",
            location: "基础设施 / 网络",
            updatedAt: Date.now() - 86_400_000,
          },
        ],
      }),
    });
    assert.equal(pub.status, 200);

    // 2. Standalone /stage/app auth check
    const unauthApp = await fetch(`${baseUrl}/stage/app?token=wrong`);
    assert.equal(unauthApp.status, 401);
    const okApp = await fetch(`${baseUrl}/stage/app?token=${token}`);
    assert.equal(okApp.status, 200);
    const html = await okApp.text();
    assert.match(html, /Task Copilot · 全局态势活画布/);
    assert.doesNotMatch(html, /[✨💡📖]/u, "standalone stage HTML must contain zero emojis");

    // 3. Call stage_propose_areas via /mcp/call (Codex/Antigravity path) without active single-work connection
    const callMcpRaw = async (name: string, args: Record<string, unknown>, clientId = "codex") => {
      const res = await fetch(`${baseUrl}/mcp/call`, {
        method: "POST",
        headers: cliHeaders,
        body: JSON.stringify({ name, arguments: args, clientId }),
      });
      const json = (await res.json()) as { value?: Record<string, unknown>; error?: { code: string; message: string } };
      return { status: res.status, json };
    };
    const callMcp = async (name: string, args: Record<string, unknown>, clientId = "codex") => {
      const { status, json } = await callMcpRaw(name, args, clientId);
      assert.equal(status, 200, JSON.stringify(json));
      return json.value!;
    };

    const proposed = await callMcp("stage_propose_areas", {});
    const draftId = (proposed.proposal as { id: string }).id;
    assert.equal(proposed.writesFormalState, false);

    // Confirm cold-start Areas via stage_resolve_proposals
    const solidified = await callMcp("stage_resolve_proposals", {
      decisions: [{ proposalId: draftId, action: "accept" }],
    });
    assert.deepEqual(solidified.committedIds, [draftId]);

    // 3b. Reject >1 main area in stage_propose_areas (hard rule)
    const badAreasRes = await fetch(`${baseUrl}/mcp/call`, {
      method: "POST",
      headers: cliHeaders,
      body: JSON.stringify({
        name: "stage_propose_areas",
        arguments: {
          areas: [
            { name: "领域A", workKeys: [], focusRole: "main" },
            { name: "领域B", workKeys: [], focusRole: "main" },
          ],
        },
        clientId: "codex",
      }),
    });
    assert.equal(badAreasRes.status, 400);

    // 3c. Propose four-state role update via stage_propose_area_role -> resolve -> verify persisted
    const pulseInitial = await callMcp("stage_get_pulse", {});
    const firstAreaId = ((pulseInitial.areas as Array<{ id: string }>)[0]!).id;
    const roleProposed = await callMcp("stage_propose_area_role", {
      areaId: firstAreaId,
      focusRole: "main",
      domain: "work",
      quarterGoal: "完成核心告警降噪闭环",
      antiGoal: "不增加夜间值守噪音",
      reason: "主线战役优先锁定",
    });
    const roleGhostId = (roleProposed.proposal as { id: string }).id;
    assert.equal(roleProposed.writesFormalState, false);
    await callMcp("stage_resolve_proposals", {
      decisions: [{ proposalId: roleGhostId, action: "accept" }],
    });

    // 4. Verify 0ms local Inbox resonance and four-state metadata in stage_get_pulse
    const pulse = await callMcp("stage_get_pulse", {});
    const inboxList = pulse.inbox as Array<{ id: string; matchProjectWorkKeys: string[]; matchAreaIds: string[] }>;
    assert.equal(inboxList.length, 1);
    assert.ok(inboxList[0]!.matchProjectWorkKeys.includes(obsKey));
    const mainArea = (pulse.areas as Array<{ id: string; focusRole: string; quarterGoal: string | null }>).find(
      (a) => a.id === firstAreaId,
    )!;
    assert.equal(mainArea.focusRole, "main");
    assert.equal(mainArea.quarterGoal, "完成核心告警降噪闭环");

    // 5. Anchor from Logseq plugin ("拉远 ↖") -> verify stage_get_view reflects live Shared Gaze!
    const anchorRes = await fetch(`${baseUrl}/plugin/stage/anchor`, {
      method: "POST",
      headers: pluginHeaders,
      body: JSON.stringify({ workKey: obsKey, source: "logseq" }),
    });
    assert.equal(anchorRes.status, 200);

    const view = await callMcp("stage_get_view", {}, "antigravity");
    assert.equal((view.viewport as { zoomLevel: number }).zoomLevel, 1);
    assert.match(String(view.gazeSummary), /L1 领域/);

    // 5b. /plugin/stage/open-dsh fails clearly when DSH is offline, and returns #stage-discuss=1 URL + gaze when running
    const prevSkip = process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
    process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = "1";
    try {
      const offlineRes = await fetch(`${baseUrl}/plugin/stage/open-dsh`, {
        method: "POST",
        headers: pluginHeaders,
        body: JSON.stringify({}),
      });
      assert.equal(offlineRes.status, 400);
      const offlineBody = (await offlineRes.json()) as { error?: { code?: string } };
      assert.equal(offlineBody.error?.code, "DSH_NOT_RUNNING");

      await writeFile(
        join(stateDir, "dsh-browser.json"),
        JSON.stringify({ url: "http://127.0.0.1:3080/?token=test-token", pid: process.pid }),
        { mode: 0o600 },
      );
      const onlineRes = await fetch(`${baseUrl}/plugin/stage/open-dsh`, {
        method: "POST",
        headers: pluginHeaders,
        body: JSON.stringify({}),
      });
      assert.equal(onlineRes.status, 200);
      const onlineBody = (await onlineRes.json()) as { value: { url: string; gaze: string; viewport: { zoomLevel: number } } };
      assert.equal(onlineBody.value.url, "http://127.0.0.1:3080/?token=test-token#stage-discuss=1");
      assert.match(onlineBody.value.gaze, /L1 领域/);
      assert.equal(onlineBody.value.viewport.zoomLevel, 1);
    } finally {
      if (prevSkip === undefined) delete process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
      else process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = prevSkip;
    }

    // 6. Sprout Ghost branches & verify SSE receives update
    const sseAbort = new AbortController();
    const ssePromise = fetch(`${baseUrl}/stage/events?token=${token}&instanceId=${instanceId}`, {
      signal: sseAbort.signal,
    });
    const sseRes = await ssePromise;
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body!.getReader();
    const firstChunk = await reader.read();
    const firstText = new TextDecoder().decode(firstChunk.value);
    assert.match(firstText, /event: stage/);

    const sprouted = await callMcp("stage_sprout_branches", {
      projectWorkKey: obsKey,
      branches: [{ title: "灰度验证 Top 3 静默规则", reason: "低风险快速验证", sourceInboxId: inboxId }],
    });
    const ghostId = ((sprouted.proposals as Array<{ id: string }>)[0]!).id;
    const secondChunk = await reader.read();
    const secondText = new TextDecoder().decode(secondChunk.value);
    assert.match(secondText, /灰度验证 Top 3 静默规则/);
    sseAbort.abort();

    // Commit Ghost branch -> Plan A persisted -> Inbox consumed
    const committed = await callMcp("stage_resolve_proposals", {
      decisions: [{ proposalId: ghostId, action: "accept" }],
    });
    assert.deepEqual(committed.archivedInboxIds, [inboxId]);
    assert.equal((committed.createdAdvancements as unknown[]).length, 1);

    // 6b. Strict guardrails & pagination checks:
    // - stage_propose_move rejects nonexistent targetAreaId
    const badMove = await callMcpRaw("stage_propose_move", {
      targetAreaId: "area-nonexistent-9999",
      title: "无效移动",
      reason: "测试校验",
    });
    assert.equal(badMove.status, 400);
    assert.equal(badMove.json.error?.code, "INVALID_INPUT");

    // - stage_resolve_proposals rejects nonexistent proposalId
    const badResolve = await callMcpRaw("stage_resolve_proposals", {
      decisions: [{ proposalId: "ghost-missing-9999", action: "accept" }],
    });
    assert.equal(badResolve.status, 400);
    assert.equal(badResolve.json.error?.code, "PROPOSAL_NOT_FOUND");

    // - stage_propose_area_role rejects two competing pending main proposals
    const allAreas = (await callMcp("stage_get_pulse", { projectLimit: 1 })).areas as Array<{
      id: string;
      totalProjects: number;
      projects: unknown[];
    }>;
    assert.ok(allAreas.length >= 2);
    assert.equal(allAreas[0]!.projects.length, 1);
    const drillArea = await callMcp("stage_get_pulse", { areaId: allAreas[0]!.id, projectLimit: 10 });
    assert.equal((drillArea.areas as unknown[]).length, 1);

    const firstMain = await callMcp("stage_propose_area_role", {
      areaId: allAreas[0]!.id,
      focusRole: "main",
      reason: "先提议第一个主线",
    });
    const secondMain = await callMcpRaw("stage_propose_area_role", {
      areaId: allAreas[1]!.id,
      focusRole: "main",
      reason: "同时提议第二个主线应被拦截",
    });
    assert.equal(secondMain.status, 400);
    assert.equal(secondMain.json.error?.code, "INVALID_INPUT");
    await callMcp("stage_resolve_proposals", {
      decisions: [{ proposalId: (firstMain.proposal as { id: string }).id, action: "dismiss" }],
    });

    // - stage_highlight creates radar when targeting out-of-view area & clear:true clears it
    const hl = await callMcp("stage_highlight", {
      targetIds: [allAreas[1]!.id],
      reason: "提醒视野外领域",
    });
    assert.ok(hl.nudgedRadar);
    const cleared = await callMcp("stage_highlight", { clear: true });
    assert.equal(cleared.clearedRadar, true);
    const viewAfterClear = await callMcp("stage_get_view", { projectLimit: 5 });
    assert.equal(viewAfterClear.activeRadar, null);

    // - stage_resolve_proposals({ undoLast: true }) rolls back last commit cleanly, then re-commit for restart check
    const tempBranch = await callMcp("stage_sprout_branches", {
      projectWorkKey: obsKey,
      branches: [{ title: "可撤销验证项", reason: "验证 undoLast" }],
    });
    const tempId = ((tempBranch.proposals as Array<{ id: string }>)[0]!).id;
    await callMcp("stage_resolve_proposals", { decisions: [{ proposalId: tempId, action: "accept" }] });
    const undone = await callMcp("stage_resolve_proposals", { undoLast: true });
    assert.equal(undone.undone, true);
    assert.equal(undone.canUndo, false);
    await callMcp("stage_resolve_proposals", { decisions: [{ proposalId: tempId, action: "dismiss" }] });
  } finally {
    await server.close();
  }

  // 7. Restart Companion and confirm Plan A Areas + four-state role + Advancements survived on disk!
  const restarted = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: inboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { disabled: true },
  });
  try {
    const snap = await restarted.stageHub.snapshot();
    assert.ok(snap.areas.length >= 2, "Areas must persist across restart");
    assert.equal(snap.areas.filter((a) => a.focusRole === "main").length, 1, "Main focusRole must persist across restart");
    const totalAdv = snap.areas.flatMap((a) => [...a.areaAdvancements, ...a.projects.flatMap((p) => p.advancements)]);
    assert.equal(totalAdv.length, 1, "Plan A advancement must persist across restart");
    assert.equal(snap.inbox.length, 0, "Consumed inbox item must remain archived from Stage queue");
  } finally {
    await restarted.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("D-63 Phase A: stage_capture_inbox online/offline spool with anti-echo dedup, journal recall, sweep, weekly review backlink, flow ledger undo, and AI refine", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-stage-d63-")));
  const stateDir = join(root, "state");
  const inboxDir = join(root, "inbox");
  const icloudDir = join(root, "icloud");
  const graphDir = join(root, "mock-graph");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await mkdir(inboxDir, { recursive: true, mode: 0o700 });
  await mkdir(icloudDir, { recursive: true, mode: 0o700 });
  await mkdir(join(graphDir, "pages"), { recursive: true, mode: 0o700 });

  // Configure a mock DeepSeek fast provider in providers.json (0600)
  await writeFile(
    join(stateDir, "providers.json"),
    JSON.stringify({
      schemaVersion: 1,
      routes: { fast: "mock-fast", deep: "mock-fast", local: null },
      profiles: {
        "mock-fast": {
          label: "Mock Fast",
          kind: "openai-compatible",
          locality: "remote",
          baseUrl: "https://mock.deepseek.local/v1",
          model: "deepseek-chat",
          apiKey: "test-key",
        },
      },
    }),
    { mode: 0o600 },
  );

  const mockFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: [
                  {
                    id: "logseq-block:blk-journal-1",
                    suggestedPocket: "commit",
                    summary: "明天创好大数据服务器",
                    reason: "已和庆南约定且有明日截止",
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: inboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { disabled: true },
    reading: { fetchImpl: mockFetch, dshAvailable: async () => false },
  });
  const { baseUrl, token, instanceId } = server.descriptor;
  const pluginDescriptor = JSON.parse(await readFile(join(stateDir, "workspace-plugin.json"), "utf8")) as {
    pluginToken: string;
  };
  const cliHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-workspace-instance": instanceId,
  };
  const pluginHeaders = {
    "content-type": "application/json",
    "x-workspace-plugin": pluginDescriptor.pluginToken,
    "x-workspace-instance": instanceId,
  };

  async function callMcp(name: string, args: Record<string, unknown> = {}) {
    const res = await fetch(`${baseUrl}/mcp/call`, {
      method: "POST",
      headers: cliHeaders,
      body: JSON.stringify({ name, arguments: args, clientId: "antigravity" }),
    });
    assert.equal(res.status, 200, `MCP ${name} failed`);
    return ((await res.json()) as { value: Record<string, unknown> }).value;
  }

  try {
    // 1. Offline Agent capture via stage_capture_inbox (no Logseq plugin polling yet)
    const offlineCap = await callMcp("stage_capture_inbox", {
      text: "别忘了给郭工开一下测试库权限",
      contextTitle: "运维支持",
    });
    assert.equal(offlineCap.captured, true);
    assert.equal(offlineCap.mode, "offline-spooled");
    assert.equal(offlineCap.pocket, "sweep");
    assert.equal(offlineCap.pendingJournalFlush, true);
    const offlineCapId = String(offlineCap.captureId);
    const offlineInboxId = String(offlineCap.inboxId);

    // Stage snapshot immediately reflects the offline-spooled item!
    const snapOffline = await server.stageHub.snapshot();
    assert.equal(snapOffline.inbox.some((i) => i.id === offlineInboxId && i.pendingJournalFlush === true), true);
    assert.equal(snapOffline.inboxPockets?.pendingJournalCount, 1);

    // User manually re-pockets the offline item to `commit` BEFORE Logseq comes online
    await server.stageHub.applyAction({ type: "set-inbox-pocket", inboxId: offlineInboxId, pocket: "commit" });

    // 2. Logseq comes online: publishes Journal recall signals + drains & acks pending capture
    const pubRes = await fetch(`${baseUrl}/plugin/stage/journal-signals`, {
      method: "POST",
      headers: pluginHeaders,
      body: JSON.stringify({
        graphId: "g-d63",
        graphName: "主力库",
        graphPath: graphDir,
        signals: [
          {
            blockUuid: "blk-journal-1",
            journalDate: "2026-11-24",
            pageName: "2026-11-24",
            text: "**[注]** 大数据的那几个服务器注意一下，明天要创好，下午和庆南说过了",
            updatedAt: Date.now() - 1000,
          },
          {
            blockUuid: "blk-journal-2",
            journalDate: "2026-11-24",
            pageName: "2026-11-24",
            text: "**[想法]** 给个人工作区设计一套跨端文件同步方案",
            updatedAt: Date.now() - 2000,
          },
        ],
      }),
    });
    assert.equal(pubRes.status, 200);
    const pubBody = (await pubRes.json()) as { value: { accepted: number; pendingCaptures: number } };
    assert.equal(pubBody.value.accepted, 2);
    assert.equal(pubBody.value.pendingCaptures, 1);

    const pendingRes = await fetch(`${baseUrl}/plugin/stage/pending-captures`, {
      method: "POST",
      headers: pluginHeaders,
      body: JSON.stringify({}),
    });
    const pendingBody = (await pendingRes.json()) as { value: { captures: Array<{ captureId: string }> } };
    assert.equal(pendingBody.value.captures.length, 1);
    assert.equal(pendingBody.value.captures[0]!.captureId, offlineCapId);

    // Ack flush with canonical blockUuid -> anti-echo dedup + carry over user's `commit` override!
    const ackRes = await fetch(`${baseUrl}/plugin/stage/pending-captures/ack`, {
      method: "POST",
      headers: pluginHeaders,
      body: JSON.stringify({
        captureId: offlineCapId,
        blockUuid: "blk-flushed-1",
        pageName: "2026-11-24",
        journalDate: "2026-11-24",
      }),
    });
    assert.equal(ackRes.status, 200);

    const snapFlushed = await server.stageHub.snapshot();
    assert.equal(snapFlushed.inboxPockets?.pendingJournalCount, 0);
    assert.equal(snapFlushed.inbox.some((i) => i.id === offlineInboxId), false, "pending shadow must disappear after ack");
    const canonicalFlushed = snapFlushed.inbox.find((i) => i.id === "logseq-block:blk-flushed-1");
    assert.ok(canonicalFlushed, "canonical journal block must appear");
    assert.equal(canonicalFlushed.pocket, "commit", "user offline pocket override must carry over seamlessly");

    // 3. Online Agent capture via concurrent long-poll wait + immediate ack
    const waitPromise = fetch(`${baseUrl}/plugin/stage/pending-captures/wait`, {
      method: "POST",
      headers: pluginHeaders,
      body: JSON.stringify({ timeoutMs: 5000 }),
    });
    await new Promise((r) => setTimeout(r, 40));
    const onlineCapPromise = callMcp("stage_capture_inbox", {
      text: "顺手回一下运维群里的审批消息",
      prefixHint: "急",
    });
    const waitRes = await waitPromise;
    const waitBody = (await waitRes.json()) as { value: { captures: Array<{ captureId: string; journalDate: string }> } };
    assert.equal(waitBody.value.captures.length, 1);
    await fetch(`${baseUrl}/plugin/stage/pending-captures/ack`, {
      method: "POST",
      headers: pluginHeaders,
      body: JSON.stringify({
        captureId: waitBody.value.captures[0]!.captureId,
        blockUuid: "blk-online-1",
        pageName: waitBody.value.captures[0]!.journalDate,
        journalDate: waitBody.value.captures[0]!.journalDate,
      }),
    });
    const onlineCap = await onlineCapPromise;
    assert.equal(onlineCap.mode, "journal-appended");
    assert.equal(onlineCap.blockUuid, "blk-online-1");

    // 4. Optional AI light refinement via mocked DeepSeek fast profile (non-destructive ghost hint)
    const aiOut = await server.stageHub.applyAction({ type: "refine-inbox-ai" });
    assert.equal(aiOut.warning, undefined);
    const hinted = aiOut.snapshot.inbox.find((i) => i.id === "logseq-block:blk-journal-1");
    assert.equal(hinted?.aiHint?.summary, "明天创好大数据服务器");

    // 5. Sweep complete + Flow Ledger + 1-click Undo
    const swept = await server.stageHub.applyAction({
      type: "sweep-complete",
      inboxId: "logseq-block:blk-online-1",
      disposition: "done",
    });
    assert.equal(swept.snapshot.inbox.some((i) => i.id === "logseq-block:blk-online-1"), false);
    const ledgerEntry = swept.snapshot.flowLedger?.find((e) => e.inboxId === "logseq-block:blk-online-1");
    assert.ok(ledgerEntry);
    assert.equal(ledgerEntry.destination, "sweep-done");

    const undone = await server.stageHub.applyAction({ type: "undo-ledger-entry", entryId: ledgerEntry.id });
    assert.equal(undone.snapshot.inbox.some((i) => i.id === "logseq-block:blk-online-1"), true);

    // 6. Archive spark thought to weekly review file in <graphPath>/pages/stage-reviews/复盘___YYYY-Www.md
    const reviewed = await server.stageHub.applyAction({
      type: "archive-to-review",
      inboxId: "logseq-block:blk-journal-2",
    });
    assert.ok(reviewed.reviewFilePath);
    assert.match(reviewed.reviewFilePath, /pages\/stage-reviews\/复盘___\d{4}-W\d{2}\.md$/u);
    const reviewContent = await readFile(reviewed.reviewFilePath, "utf8");
    assert.match(reviewContent, /type:: 周复盘/);
    assert.match(reviewContent, /跨端文件同步方案/);
    assert.equal(reviewed.snapshot.inbox.some((i) => i.id === "logseq-block:blk-journal-2"), false);

    // 7. stage_get_pulse exposes inboxPockets & flowLedger cleanly
    const pulse = await callMcp("stage_get_pulse");
    assert.ok(pulse.inboxPockets);
    assert.ok(Array.isArray(pulse.flowLedger) && pulse.flowLedger.length >= 2);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
