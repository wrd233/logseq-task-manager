import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { workKey, type CatalogSnapshot } from "@task-copilot/contracts";
import { StageEngine, TimeEngine, parseTimeRegistry, type StageSnapshot } from "@task-copilot/stage-runtime";
import { GlobalStageOverlay } from "../src/features/stage/overlay.ts";
import { QuietFocusCapsule, formatFocusStatusLine } from "../src/features/stage/focus-capsule.ts";

function installDom() {
  const win = new Window({ url: "http://localhost/" });
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevHTMLElement = globalThis.HTMLElement;
  const prevCSS = globalThis.CSS;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    CSS: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") },
  });
  return () => {
    Object.assign(globalThis, {
      window: prevWindow,
      document: prevDocument,
      HTMLElement: prevHTMLElement,
      CSS: prevCSS,
    });
    void win.close();
  };
}

function makeCatalog(): CatalogSnapshot {
  const now = Date.now();
  return {
    schemaVersion: 1,
    graphId: "graph:/lsq-test",
    graphName: "Test Graph",
    refreshedAt: now,
    works: [
      {
        workRef: { kind: "logseq", graphId: "graph:/lsq-test", rootUuid: "blk-obs-1", sourceKind: "block" },
        title: "核心告警降噪升级",
        objectType: "MiniProject",
        location: "监控平台 / 告警治理",
        updatedAt: now - 3_600_000,
      },
      {
        workRef: { kind: "logseq", graphId: "graph:/lsq-test", rootUuid: "blk-net-1", sourceKind: "block" },
        title: "跨区网络割接预案",
        objectType: "Project",
        location: "基础设施 / 网络",
        updatedAt: now - 86_400_000,
      },
    ],
  };
}

test("Logseq GlobalStageOverlay fails open offline, anchors zoom-out, and promotes Plan A TODO explicitly", async () => {
  const restore = installDom();
  const catalog = makeCatalog();
  const obsKey = workKey(catalog.works[0]!.workRef);
  const opened: string[] = [];
  const promoted: string[] = [];
  const notices: string[] = [];

  try {
    // 1. Offline fail-open mode (remote throws)
    const offlineOverlay = new GlobalStageOverlay({
      remote: {
        stageState: () => Promise.reject(new Error("COMPANION_OFFLINE")),
        stageAction: () => Promise.reject(new Error("COMPANION_OFFLINE")),
        stageAnchor: () => Promise.reject(new Error("COMPANION_OFFLINE")),
      },
      readLocalCatalog: async () => catalog,
      openProject: async (p) => { opened.push(p.title); },
      promoteTodo: async (item) => { promoted.push(item.title); },
      openExternalUrl: async () => undefined,
      notify: (m) => { notices.push(m); },
    });

    await offlineOverlay.open(obsKey);
    assert.equal(offlineOverlay.isOpen, true);
    assert.match(document.body.textContent ?? "", /尚未建立季节领域星图/);
    assert.doesNotMatch(document.body.textContent ?? "", /\p{Extended_Pictographic}/u, "Stage overlay UI must stay zero-emoji");

    // Trigger cold-start & solidify locally
    const csBtn = document.querySelector<HTMLButtonElement>("[data-tcs-empty-coldstart]");
    assert.ok(csBtn);
    csBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    const commitBtn = document.querySelector<HTMLButtonElement>("[data-cs-commit]");
    assert.ok(commitBtn, "cold-start commit button should render");
    commitBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.match(document.body.textContent ?? "", /监控平台/);
    offlineOverlay.dispose();
    assert.equal(offlineOverlay.isOpen, false);

    // 2. Online remote anchored mode + L2/L3 promoteTodo & openProject
    const engine = new StageEngine();
    const draft = engine.proposeAreas({ agent: "codex", catalog: [catalog] });
    engine.resolveProposals([{ proposalId: draft.id, action: "accept" }]);
    const sprouted = engine.sproutBranches({
      agent: "codex",
      projectWorkKey: obsKey,
      branches: [{ title: "灰度验证 Top 3 规则", reason: "低风险验证" }],
    });
    engine.resolveProposals([{ proposalId: sprouted[0]!.id, action: "accept" }]);

    const onlineOverlay = new GlobalStageOverlay({
      remote: {
        stageState: async () => engine.buildSnapshot([catalog], [], Date.now()),
        stageAction: async (action) => {
          const r = engine.applyUserAction(action, { catalog: [catalog], inbox: [] });
          return { snapshot: engine.buildSnapshot([catalog], [], Date.now()), archivedInboxIds: r.archivedInboxIds };
        },
        stageAnchor: async (key) => {
          engine.anchorFromWorkKey(key, "logseq");
          return engine.buildSnapshot([catalog], [], Date.now());
        },
      },
      readLocalCatalog: async () => catalog,
      openProject: async (p) => { opened.push(p.title); },
      promoteTodo: async (item) => { promoted.push(item.title); },
      openExternalUrl: async () => undefined,
      notify: (m) => { notices.push(m); },
    });

    await onlineOverlay.open(obsKey);
    // Should land anchored on L1 of the owning Area!
    assert.equal(engine.getViewport().zoomLevel, 1);

    // Drill into L2 project
    const projCard = document.querySelector<HTMLElement>("[data-project-open]");
    assert.ok(projCard);
    projCard.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(engine.getViewport().zoomLevel, 2);

    // Open L3 on the committed Plan A advancement and click "写入 Logseq TODO"
    const l3Trigger = document.querySelector<HTMLElement>("[data-l3-open]");
    assert.ok(l3Trigger);
    l3Trigger.click();
    await new Promise((r) => setTimeout(r, 20));
    const promoteBtn = document.querySelector<HTMLButtonElement>("[data-promote-adv]");
    assert.ok(promoteBtn);
    promoteBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(promoted, ["灰度验证 Top 3 规则"]);
    assert.ok(notices.some((n) => n.includes("已写入 Logseq TODO")));

    // Click "回到 Logseq 原文现场" closes overlay and navigates
    const openWorkBtn = document.querySelector<HTMLButtonElement>("[data-l3-open-work]");
    assert.ok(openWorkBtn);
    openWorkBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(opened, ["核心告警降噪升级"]);
    assert.equal(onlineOverlay.isOpen, false);

    onlineOverlay.dispose();
  } finally {
    restore();
  }
});

test("Stage 3-tab switcher (Season/Week/Today), gentle friction, and Logseq QuietFocusCapsule work cleanly with zero emoji", async () => {
  const restore = installDom();
  const catalog = makeCatalog();
  const engine = new StageEngine();
  const timeEngine = new TimeEngine();
  const navigated: string[] = [];
  const notices: string[] = [];
  const lifecycleEvents: string[] = [];
  let openedStageCount = 0;

  const buildSnap = (now = Date.now()): StageSnapshot =>
    engine.buildSnapshot([catalog], [], now, undefined, undefined, timeEngine.buildSnapshot(now));

  try {
    const capsule = new QuietFocusCapsule({
      fetchSnapshot: async () => buildSnap(),
      dispatch: async (action) => {
        if (action.type === "time") timeEngine.applyAction(action.action, Date.now());
        else engine.applyUserAction(action, { catalog: [catalog], inbox: [], now: Date.now() });
        return buildSnap();
      },
      onOpenStage: () => { openedStageCount++; },
      onNavigateWork: async (session) => { navigated.push(session.title); },
      onEnterFocusMode: (session) => { lifecycleEvents.push(`enter:${session.title}`); },
      onZenModeChange: (enabled) => { lifecycleEvents.push(`zen:${enabled}`); },
      onExitFocusMode: (prev) => { lifecycleEvents.push(`exit:${prev?.title ?? ""}`); },
      notify: (m) => { notices.push(m); },
    });

    const overlay = new GlobalStageOverlay({
      remote: {
        stageState: async () => buildSnap(),
        stageAction: async (action) => {
          if (action.type === "time") timeEngine.applyAction(action.action, Date.now());
          else engine.applyUserAction(action, { catalog: [catalog], inbox: [], now: Date.now() });
          return { snapshot: buildSnap(), archivedInboxIds: [] };
        },
        stageAnchor: async (key) => {
          engine.anchorFromWorkKey(key, "logseq");
          return buildSnap();
        },
      },
      readLocalCatalog: async () => catalog,
      openProject: async () => undefined,
      openFocusWork: async (session) => { navigated.push(session.title); },
      onSnapshot: (snap) => capsule.syncFromSnapshot(snap),
      promoteTodo: async () => undefined,
      openExternalUrl: async () => undefined,
      notify: (m) => { notices.push(m); },
    });

    // 1. Open Stage and switch to "本周容器" then "今日容器"
    await overlay.open();
    const weekTab = document.querySelector<HTMLButtonElement>('[data-tcs-tab="week"]');
    assert.ok(weekTab);
    weekTab.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.match(document.body.textContent ?? "", /本周推进块/);
    assert.doesNotMatch(document.body.textContent ?? "", /\p{Extended_Pictographic}/u);

    const todayTab = document.querySelector<HTMLButtonElement>('[data-tcs-tab="today"]');
    assert.ok(todayTab);
    todayTab.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.match(document.body.textContent ?? "", /上午 · 深潜/);
    assert.match(document.body.textContent ?? "", /下午 · 推进/);
    assert.match(document.body.textContent ?? "", /晚上 · 轻放/);
    assert.match(document.body.textContent ?? "", /允许留白/);

    // 2. Place 1st morning item, then verify Gentle Friction appears when attempting a 2nd morning item
    timeEngine.placeDayItem({
      title: "完成核心告警降噪闭环",
      slotId: "morning",
      workRef: catalog.works[0]!.workRef,
    });
    await overlay.open();
    const morningForm = document.querySelector<HTMLFormElement>('[data-slot-add-form="morning"]')!;
    const morningInput = morningForm.querySelector<HTMLInputElement>('input[name="title"]')!;
    morningInput.value = "临时塞进来的第二件事";
    morningForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    assert.match(document.body.textContent ?? "", /替换当前/);
    assert.match(document.body.textContent ?? "", /顺延至明天/);

    // 3. Click "开始专注" -> closes overlay, navigates Logseq work, and shows QuietFocusCapsule!
    const startFocusBtn = document.querySelector<HTMLButtonElement>("[data-day-focus]")!;
    assert.ok(startFocusBtn);
    startFocusBtn.click();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(overlay.isOpen, false);
    assert.ok(navigated.includes("完成核心告警降噪闭环"));

    const capsuleEl = document.querySelector<HTMLElement>(".tcs-lsq-focus-bar");
    assert.ok(capsuleEl, "QuietFocusCapsule should mount when focus is active");
    assert.doesNotMatch(capsuleEl.textContent ?? "", /\p{Extended_Pictographic}/u);
    assert.match(capsuleEl.textContent ?? "", /上午 · .*完成核心告警降噪闭环 · 已进行 \d+m/);

    // Verify titlebar clickability CSS (-webkit-app-region: no-drag) and Zen focus mode activation
    const capsuleStyleText = document.getElementById("tcs-lsq-focus-style")?.textContent ?? "";
    assert.match(capsuleStyleText, /-webkit-app-region:\s*no-drag/);
    assert.match(capsuleStyleText, /pointer-events:\s*auto/);
    assert.equal(document.body.classList.contains("tc-focus-zen"), true, "Zen class should activate on running focus");
    assert.ok(lifecycleEvents.includes("enter:完成核心告警降噪闭环"));

    // Toggle 静心 off and back on without stopping focus
    capsuleEl.querySelector<HTMLButtonElement>("[data-fc-zen]")!.click();
    assert.equal(document.body.classList.contains("tc-focus-zen"), false);
    assert.ok(lifecycleEvents.includes("zen:false"));
    capsuleEl.querySelector<HTMLButtonElement>("[data-fc-zen]")!.click();
    assert.equal(document.body.classList.contains("tc-focus-zen"), true);
    assert.ok(lifecycleEvents.includes("zen:true"));

    // Pause lifts Zen dimming cleanly; resume restores it
    capsuleEl.querySelector<HTMLButtonElement>("[data-fc-pause]")!.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(document.body.classList.contains("tc-focus-zen"), false);
    capsuleEl.querySelector<HTMLButtonElement>("[data-fc-pause]")!.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(document.body.classList.contains("tc-focus-zen"), true);

    // Verify exact 28m count-up formatting helper
    const sampleLine = formatFocusStatusLine(
      {
        id: "f-1",
        title: "架构梳理",
        slotId: "morning",
        roleLabel: "主线",
        date: "2026-11-21",
        status: "running",
        startedAt: 0,
        resumedAt: 1000,
        accumulatedSeconds: 28 * 60,
      },
      1000,
    );
    assert.equal(sampleLine, "上午 · 主线：架构梳理 · 已进行 28m");

    // 4. Zoom-out button on capsule opens Stage
    capsuleEl.querySelector<HTMLButtonElement>("[data-fc-zoom]")!.click();
    assert.equal(openedStageCount, 1);

    // 5. Finish focus with stop note removes capsule, lifts Zen class, restores scene, and records stopNote
    capsuleEl.querySelector<HTMLButtonElement>("[data-fc-finish-open]")!.click();
    const stopInput = document.querySelector<HTMLInputElement>("[data-fc-stop-input]")!;
    assert.ok(stopInput);
    stopInput.value = "已写完核心验证，明日继续收尾";
    const finishForm = document.querySelector<HTMLFormElement>("[data-fc-finish-form]")!;
    finishForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(document.querySelector(".tcs-lsq-focus-bar"), null);
    assert.equal(document.body.classList.contains("tc-focus-zen"), false);
    assert.ok(lifecycleEvents.includes("exit:完成核心告警降噪闭环"));
    assert.equal(timeEngine.buildSnapshot().recentFocusRecords[0]!.stopNote, "已写完核心验证，明日继续收尾");

    capsule.dispose();
    overlay.dispose();
  } finally {
    restore();
  }
});

test("Stage overlay supports direct zero-copy DSH jump across Area/Project/Nested Child and cross-area secondary projection", async () => {
  const restore = installDom();
  const now = Date.now();
  const gId = "graph:/para-dsh";
  const catalog: CatalogSnapshot = {
    schemaVersion: 1,
    graphId: gId,
    graphName: "MainGraph",
    refreshedAt: now,
    works: [
      {
        workRef: { kind: "logseq", graphId: gId, rootUuid: "pg-area-ops", sourceKind: "page" },
        title: "Area/运维能力",
        objectType: "Area",
        location: "MainGraph / Area/运维能力",
        updatedAt: now - 1000,
        lifecycleState: "active",
      },
      {
        workRef: { kind: "logseq", graphId: gId, rootUuid: "pg-area-ai", sourceKind: "page" },
        title: "Area/AI 自动化能力",
        objectType: "Area",
        location: "MainGraph / Area/AI 自动化能力",
        updatedAt: now - 2000,
        lifecycleState: "active",
      },
      {
        workRef: { kind: "logseq", graphId: gId, rootUuid: "pg-agent", sourceKind: "page" },
        title: "任务-运维智能体开发",
        objectType: "Project",
        location: "MainGraph / 任务-运维智能体开发",
        directory: "/tmp/work-agent",
        updatedAt: now - 500,
        parentAreas: ["Area/运维能力", "Area/AI 自动化能力"],
        lifecycleState: "active",
      },
      {
        workRef: { kind: "logseq", graphId: gId, rootUuid: "blk-sub-1", sourceKind: "block" },
        title: "Dify + Zabbix 同步联调",
        objectType: "事务",
        location: "MainGraph / 任务-运维智能体开发 / **[推进结构]** / **[阶段]** 联调验证",
        updatedAt: now - 100,
        parentAreas: ["Area/运维能力"],
      },
    ],
  };

  const engine = new StageEngine();
  const draft = engine.proposeAreas({ agent: "user", catalog: [catalog] }, now);
  engine.resolveProposals([{ proposalId: draft.id, action: "accept" }], now);

  const dshOpened: string[] = [];
  const discussed: string[] = [];

  try {
    const overlay = new GlobalStageOverlay({
      remote: {
        stageState: async () => engine.buildSnapshot([catalog], [], now),
        stageAction: async (action) => {
          const r = engine.applyUserAction(action, { catalog: [catalog], inbox: [], now });
          return { snapshot: engine.buildSnapshot([catalog], [], now), archivedInboxIds: r.archivedInboxIds };
        },
        stageAnchor: async () => engine.buildSnapshot([catalog], [], now),
      },
      readLocalCatalog: async () => catalog,
      openProject: async () => undefined,
      openInDsh: async (target) => { dshOpened.push(target.title); },
      openTargetInLogseq: async () => undefined,
      discussInDsh: async (summary) => { discussed.push(summary); },
      promoteTodo: async () => undefined,
      openExternalUrl: async () => undefined,
      notify: () => undefined,
    });

    await overlay.open();

    // Top bar discuss button dispatches directly to DSH without clipboard copy
    const discussBtn = document.querySelector<HTMLButtonElement>("[data-tcs-discuss]")!;
    assert.match(discussBtn.textContent ?? "", /在 DSH 讨论当前画面/);
    discussBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(discussed.length, 1);

    // Drill into Area 运维能力 (L1) -> open Area directly in DSH & click secondary chip to jump to AI 自动化能力
    const opsCard = Array.from(document.querySelectorAll<HTMLElement>("[data-area-open]")).find((el) =>
      (el.textContent ?? "").includes("运维能力"),
    )!;
    opsCard.click();
    await new Promise((r) => setTimeout(r, 20));
    document.querySelector<HTMLButtonElement>("[data-open-dsh-area]")!.click();
    document.querySelector<HTMLButtonElement>("[data-open-dsh-proj]")!.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(dshOpened, ["Area/运维能力", "任务-运维智能体开发"]);

    // Click secondary Area pill -> lands in AI 自动化能力 L1 with cross-area projection card
    document.querySelector<HTMLButtonElement>("[data-sec-area-open]")!.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.match(document.body.textContent ?? "", /跨领域关联/);
    assert.match(document.body.textContent ?? "", /主归：运维能力/);

    // Click cross-area card -> enters same Project L2 with nested child branch and clean subtitle!
    document.querySelector<HTMLElement>(".tcs-cross-card")!.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.match(document.body.textContent ?? "", /原生嵌套子对象（1）/);
    assert.match(document.body.textContent ?? "", /Dify \+ Zabbix 同步联调/);
    assert.match(document.body.textContent ?? "", /联调验证/);
    assert.doesNotMatch(document.body.textContent ?? "", /MainGraph \/ 任务-运维智能体开发 \/ \*\*\[推进结构\]\*\*/);

    // Click nested child "在 DSH 打开" directly opens child work in DSH!
    document.querySelector<HTMLButtonElement>("[data-open-dsh-child]")!.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(dshOpened.at(-1), "Dify + Zabbix 同步联调");

    overlay.dispose();
  } finally {
    restore();
  }
});

test("Restart Flip-Card Deck supports 2-slide/3-slide compression, Space/Arrow/Esc keyboard nav, start focus, and legitimate exit", async () => {
  const restore = installDom();
  const DAY_MS = 86_400_000;
  const now = Date.now();
  const staleCatalog: CatalogSnapshot = {
    schemaVersion: 1,
    graphId: "graph:/lsq-test",
    graphName: "Test Graph",
    refreshedAt: now,
    works: [
      {
        workRef: { kind: "logseq", graphId: "graph:/lsq-test", rootUuid: "blk-stale-1", sourceKind: "block" },
        title: "沉睡九天的架构重整",
        objectType: "Project",
        location: "系统演进 / 架构",
        updatedAt: now - 9 * DAY_MS,
      },
    ],
  };
  const staleKey = workKey(staleCatalog.works[0]!.workRef);
  const engine = new StageEngine();
  const draft = engine.proposeAreas({
    agent: "codex",
    catalog: [staleCatalog],
    areas: [{ name: "系统演进", workKeys: [staleKey], focusRole: "main", quarterGoal: "完成架构解耦" }],
  });
  engine.resolveProposals([{ proposalId: draft.id, action: "accept" }], now - 9 * DAY_MS);

  // Workbench untouched for 5 days with zero external changes -> 2-slide compressed workbench-gap deck!
  const timeEngine = new TimeEngine(
    parseTimeRegistry(
      {
        schemaVersion: 1,
        weekMoves: [],
        dayItems: [],
        activeFocus: null,
        focusHistory: [],
        footprintCalendarEnabled: false,
        footprintCalendarName: "Task Copilot 足迹",
        lastWorkbenchActiveAt: now - 5 * DAY_MS,
        updatedAt: now - 5 * DAY_MS,
      },
      now,
    ),
    now,
  );

  const navigated: string[] = [];
  const buildSnap = (): StageSnapshot =>
    engine.buildSnapshot([staleCatalog], [], now, undefined, undefined, timeEngine.buildSnapshot(now));

  try {
    const overlay = new GlobalStageOverlay({
      remote: {
        stageState: async () => buildSnap(),
        stageAction: async (action) => {
          if (action.type === "time") timeEngine.applyAction(action.action, now);
          else engine.applyUserAction(action, { catalog: [staleCatalog], inbox: [], now });
          return { snapshot: buildSnap(), archivedInboxIds: [] };
        },
        stageAnchor: async (key) => {
          engine.anchorFromWorkKey(key, "logseq", now);
          return buildSnap();
        },
      },
      readLocalCatalog: async () => staleCatalog,
      openProject: async () => undefined,
      openFocusWork: async (session) => { navigated.push(session.title); },
      promoteTodo: async () => undefined,
      openExternalUrl: async () => undefined,
      notify: () => undefined,
    });

    // 1. Opening Stage triggers 2-slide workbench-gap deck
    await overlay.open();
    const card1 = document.querySelector<HTMLElement>(".tcs-restart-card");
    assert.ok(card1, "Workbench >3d gap should open Restart Flip-Card");
    assert.equal(card1.dataset.restartKind, "workbench-gap");
    assert.equal(document.querySelector("[data-restart-counter]")?.textContent, "1 / 2");
    assert.doesNotMatch(card1.textContent ?? "", /\p{Extended_Pictographic}/u);

    // Space advances to slide 2 / 2
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    assert.equal(document.querySelector("[data-restart-counter]")?.textContent, "2 / 2");
    assert.match(document.querySelector(".tcs-restart-card")?.textContent ?? "", /进入现场，开始专注/);

    // ArrowLeft steps back to 1 / 2
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    assert.equal(document.querySelector("[data-restart-counter]")?.textContent, "1 / 2");

    // Esc skips restart deck WITHOUT closing the Stage overlay!
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(document.querySelector(".tcs-restart-card"), null);
    assert.equal(overlay.isOpen, true, "Esc should only dismiss the restart deck, not close the whole Stage");
    assert.equal(timeEngine.buildSnapshot(now).restartDismissedToday, true);

    // 2. Drill into L2 of the 9-day stale project -> triggers single-work >7d restart deck!
    const areaId = engine.getRegistry().areas[0]!.id;
    engine.setViewport({ zoomLevel: 2, areaId, projectWorkKey: staleKey });
    await overlay.open();
    const workCard = document.querySelector<HTMLElement>(".tcs-restart-card");
    assert.ok(workCard, "Stale >7d project should open work-resume flip-card");
    assert.equal(workCard.dataset.restartKind, "work-resume");
    assert.equal(document.querySelector("[data-restart-counter]")?.textContent, "1 / 2");
    assert.match(workCard.textContent ?? "", /沉睡九天的架构重整/);

    // ArrowRight to final slide -> test "进入现场，开始专注"
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const startBtn = document.querySelector<HTMLButtonElement>("[data-restart-start]");
    assert.ok(startBtn);
    startBtn.click();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(overlay.isOpen, false, "Starting focus from restart card closes overlay");
    assert.ok(navigated.includes("沉睡九天的架构重整"));
    assert.equal(timeEngine.buildSnapshot(now).activeFocus?.title, "沉睡九天的架构重整");

    // 3. Re-open L2 and click explicit "久别重启" button -> test legitimate exit "不再重要 · 移入搁置"
    await overlay.open();
    const reopenRestart = document.querySelector<HTMLButtonElement>("[data-l2-restart]");
    assert.ok(reopenRestart, "L2 stale project should offer manual 久别重启 trigger");
    reopenRestart.click();
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const parkExitBtn = document.querySelector<HTMLButtonElement>('[data-restart-exit="parked"]');
    assert.ok(parkExitBtn);
    parkExitBtn.click();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(engine.getRegistry().areas[0]!.focusRole, "parked");

    overlay.dispose();
  } finally {
    restore();
  }
});
