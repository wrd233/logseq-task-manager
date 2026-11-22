import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
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
