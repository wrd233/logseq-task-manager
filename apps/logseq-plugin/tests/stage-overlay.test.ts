import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { workKey, type CatalogSnapshot } from "@task-copilot/contracts";
import { StageEngine } from "@task-copilot/stage-runtime";
import { GlobalStageOverlay } from "../src/features/stage/overlay.ts";

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
    assert.match(document.body.textContent ?? "", /尚未建立全局领域星图/);

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
