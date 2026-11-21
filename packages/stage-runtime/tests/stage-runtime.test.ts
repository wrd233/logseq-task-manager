import test from "node:test";
import assert from "node:assert/strict";
import { workKey, type CatalogSnapshot } from "@task-copilot/contracts";
import {
  StageEngine,
  buildColdStartAreaDrafts,
  compactGazeSummary,
  flattenCatalog,
  parseStageRegistry,
  type StageInboxRawItem,
} from "../src/index.ts";

const NOW = 1_763_700_000_000;
const DAY = 24 * 60 * 60 * 1000;

function sampleCatalog(): CatalogSnapshot[] {
  return [
    {
      schemaVersion: 1,
      graphId: "graph:/main",
      graphName: "Main",
      refreshedAt: NOW,
      works: [
        {
          workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: "u-obs-1", sourceKind: "block" },
          title: "核心告警降噪升级",
          objectType: "MiniProject",
          location: "监控平台 / 告警治理",
          updatedAt: NOW - DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: "u-obs-2", sourceKind: "block" },
          title: "APM 慢查询看板",
          objectType: "MiniProject",
          location: "监控平台 / 观测",
          updatedAt: NOW - 4 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: "u-net-1", sourceKind: "block" },
          title: "跨区网络割接预案",
          objectType: "Project",
          location: "基础设施 / 网络",
          updatedAt: NOW - 2 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: "u-learn-1", sourceKind: "page" },
          title: "Linux 系统排障卡片",
          objectType: "Project",
          location: "认证学习 / Linux",
          updatedAt: NOW - 13 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: "u-misc-1", sourceKind: "block" },
          title: "周末查一下静音轴评测",
          objectType: "Task",
          location: "2026_11_20",
          updatedAt: NOW - 2 * DAY,
        },
      ],
    },
  ];
}

function sampleInbox(): StageInboxRawItem[] {
  return [
    {
      id: "inb-1",
      text: "告警降噪模板补一条维护窗口自动抑制规则",
      status: "open",
      createdAt: NOW - 3600_000,
      updatedAt: NOW - 3600_000,
      sourceLabel: "Capture",
    },
    {
      id: "inb-2",
      text: "跨区网络割接预案补充专线值班电话",
      status: "open",
      createdAt: NOW - 7200_000,
      updatedAt: NOW - 7200_000,
      sourceLabel: "Journal",
    },
  ];
}

test("cold-start constellation enforces anti-clutter <= 7 cap and preserves unassigned one-offs", () => {
  const catalog = sampleCatalog();
  // Add 10 extra distinct Project namespaces to verify hard cap <= 7
  for (let i = 0; i < 10; i++) {
    catalog[0]!.works.push({
      workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: `u-extra-${i}`, sourceKind: "page" },
      title: `独立领域${i}`,
      objectType: "Project",
      location: `分类${i} / 子页`,
      updatedAt: NOW - (i + 5) * DAY,
    });
  }
  const built = buildColdStartAreaDrafts(flattenCatalog(catalog), 7);
  assert.ok(built.areas.length <= 7, `expected <= 7 areas, got ${built.areas.length}`);
  assert.ok(built.unassignedWorkKeys.length >= 1, "overflow and unrelated items must stay unassigned");
});

test("StageEngine isolates Presence, Ghost staging, and Plan A Committed state with 1-step Undo", () => {
  const catalog = sampleCatalog();
  const inbox = sampleInbox();
  const engine = new StageEngine(undefined, NOW);

  // 1. Cold-start generates Ghost proposal without mutating durable registry
  const draft = engine.proposeAreas({ agent: "codex", catalog }, NOW);
  assert.equal(draft.kind, "propose-areas");
  assert.equal(engine.getRegistry().areas.length, 0);

  // Commit cold-start -> solidifies Areas
  const commitDraft = engine.resolveProposals([{ proposalId: draft.id, action: "accept" }], NOW);
  assert.equal(commitDraft.committedIds.length, 1);
  assert.ok(engine.getRegistry().areas.length >= 2);

  // 2. Local 0ms Inbox resonance matches the right Area and Project
  const snap1 = engine.buildSnapshot(catalog, inbox, NOW);
  const inb1 = snap1.inbox.find((i) => i.id === "inb-1")!;
  const obsKey = workKey(catalog[0]!.works[0]!.workRef);
  assert.ok(inb1.matchProjectWorkKeys.includes(obsKey), "expected 0ms local match to obs project");
  const obsArea = snap1.areas.find((a) => a.projects.some((p) => p.workKey === obsKey))!;
  assert.ok(inb1.matchAreaIds.includes(obsArea.id));
  assert.equal(obsArea.tone, "amber");

  // 3. Non-hijacking highlight: zoomed into Area A, highlighting Area B creates Edge Radar instead of moving viewport
  const otherArea = snap1.areas.find((a) => a.id !== obsArea.id)!;
  engine.setViewport({ zoomLevel: 2, areaId: obsArea.id, projectWorkKey: obsKey }, "dsh", NOW);
  const hl = engine.highlight({ targetIds: [otherArea.id], reason: "有新线索", agent: "antigravity" }, NOW);
  assert.equal(hl.highlighted.length, 0);
  assert.equal(hl.nudgedRadar?.targetAreaId, otherArea.id);
  assert.equal(engine.getViewport().areaId, obsArea.id, "must never hijack user's camera");

  // 4. Sprout Ghost branches -> partial accept + dismiss -> Plan A advancement committed + Inbox archived -> Undo restores!
  const sprouted = engine.sproutBranches(
    {
      agent: "codex",
      areaId: obsArea.id,
      projectWorkKey: obsKey,
      branches: [
        { title: "灰度验证抖动静默规则", reason: "低风险快速验证", sourceInboxId: "inb-1", sourceInboxText: inbox[0]!.text },
        { title: "补充边缘节点兜底阈值", reason: "防误静默" },
      ],
    },
    NOW,
  );
  assert.equal(sprouted.length, 2);
  assert.equal(engine.getRegistry().advancements.length, 0, "ghost branches must not touch durable state");

  const resolved = engine.resolveProposals(
    [
      { proposalId: sprouted[0]!.id, action: "accept", title: "灰度验证 Top 3 静默规则" },
      { proposalId: sprouted[1]!.id, action: "dismiss" },
    ],
    NOW,
  );
  assert.equal(resolved.committedIds.length, 1);
  assert.equal(resolved.dismissedIds.length, 1);
  assert.deepEqual(resolved.archivedInboxIds, ["inb-1"]);
  assert.equal(engine.getRegistry().advancements.length, 1);
  assert.equal(engine.getRegistry().advancements[0]!.title, "灰度验证 Top 3 静默规则");

  // Compact gaze summary reflects L2 view cleanly
  const snap2 = engine.buildSnapshot(catalog, inbox.slice(1), NOW);
  const gaze = compactGazeSummary(snap2);
  assert.match(gaze, /L2 结构.*核心告警降噪升级/);

  // Undo restores previous registry & re-stages proposal
  assert.equal(engine.undoLastCommit(), true);
  assert.equal(engine.getRegistry().advancements.length, 0);
  assert.ok(engine.buildSnapshot(catalog, inbox, NOW).ghostProposals.length >= 1);

  // Serialization roundtrip
  const reparsed = parseStageRegistry(JSON.parse(JSON.stringify(engine.getRegistry())));
  assert.equal(reparsed.areas.length, engine.getRegistry().areas.length);
});
