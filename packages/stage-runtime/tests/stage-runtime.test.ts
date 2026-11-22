import test from "node:test";
import assert from "node:assert/strict";
import { workKey, type CatalogSnapshot } from "@task-copilot/contracts";
import {
  StageEngine,
  buildColdStartAreaDrafts,
  compactGazeSummary,
  defaultAreaPosition,
  defaultAreaPositionForRole,
  flattenCatalog,
  formatWorkSubtitle,
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

  // 2. Local 0ms Inbox resonance matches the right Area and Project without stealing default focus tone
  const snap1 = engine.buildSnapshot(catalog, inbox, NOW);
  const inb1 = snap1.inbox.find((i) => i.id === "inb-1")!;
  const obsKey = workKey(catalog[0]!.works[0]!.workRef);
  assert.ok(inb1.matchProjectWorkKeys.includes(obsKey), "expected 0ms local match to obs project");
  const obsArea = snap1.areas.find((a) => a.projects.some((p) => p.workKey === obsKey))!;
  assert.ok(inb1.matchAreaIds.includes(obsArea.id));
  assert.equal(obsArea.tone, "teal", "default calm state should not let Inbox amber hijack area tone");

  // Selecting an Inbox item activates amber resonance on the matched Area
  engine.setViewport({ selectedInboxId: "inb-1" }, "dsh", NOW);
  const snapSelectedInbox = engine.buildSnapshot(catalog, inbox, NOW);
  const obsAreaResonating = snapSelectedInbox.areas.find((a) => a.id === obsArea.id)!;
  assert.equal(obsAreaResonating.tone, "amber");
  engine.setViewport({ selectedInboxId: null }, "dsh", NOW);

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

test("Four-state Areas prioritize main-line mismatch, keep maintenance calm, enforce single-main replacement, and cool >14d Inbox", () => {
  const catalog = sampleCatalog();
  const obsKey = workKey(catalog[0]!.works[0]!.workRef); // updated 1 day ago
  const learnKey = workKey(catalog[0]!.works[3]!.workRef); // updated 13 days ago
  const netKey = workKey(catalog[0]!.works[2]!.workRef); // updated 2 days ago

  const engine = new StageEngine(undefined, NOW);
  const draft = engine.proposeAreas(
    {
      agent: "attention-navigator",
      catalog,
      areas: [
        {
          name: "认证学习",
          workKeys: [learnKey],
          focusRole: "main",
          domain: "work",
          quarterGoal: "90 天内完成系统排障体系整理",
          antiGoal: "不靠熬夜压缩睡眠",
        },
        {
          name: "监控平台",
          workKeys: [obsKey],
          focusRole: "side",
          domain: "work",
        },
        {
          name: "基础设施",
          workKeys: [netKey],
          focusRole: "side",
          domain: "work",
        },
        {
          name: "健康与运动",
          workKeys: [],
          focusRole: "maintenance",
          domain: "life",
          weeklyMinimum: "每周至少运动 2 次、保证 7 小时睡眠",
        },
      ],
    },
    NOW - 30 * DAY,
  );
  engine.resolveProposals([{ proposalId: draft.id, action: "accept" }], NOW - 30 * DAY);

  const inboxWithCooled: StageInboxRawItem[] = [
    ...sampleInbox(),
    {
      id: "inb-old",
      text: "Linux 排障卡片补充一篇老笔记",
      status: "open",
      createdAt: NOW - 18 * DAY,
      updatedAt: NOW - 18 * DAY,
      sourceType: "ios-shortcut",
      sourceLabel: "iPhone 随口记",
    },
  ];

  const snap = engine.buildSnapshot(catalog, inboxWithCooled, NOW);

  // 1. Main-line mismatch (13 days idle while 监控平台/基础设施 active <= 3d) outranks everything!
  assert.equal(snap.mismatchSignals.length, 1);
  const mainArea = snap.areas.find((a) => a.focusRole === "main")!;
  assert.equal(mainArea.name, "认证学习");
  assert.equal(mainArea.tone, "mismatch");
  assert.match(mainArea.signalLabel, /主线错配/);
  assert.ok(mainArea.mismatch);
  assert.equal(mainArea.quarterGoal, "90 天内完成系统排障体系整理");
  assert.equal(mainArea.antiGoal, "不靠熬夜压缩睡眠");

  // Even when selecting a matching Inbox item, main-line mismatch keeps top priority!
  engine.setViewport({ selectedInboxId: "inb-old" }, "standalone", NOW);
  const snapWithSelected = engine.buildSnapshot(catalog, inboxWithCooled, NOW);
  assert.equal(snapWithSelected.areas.find((a) => a.id === mainArea.id)!.tone, "mismatch");

  // 2. Life maintenance area stays visible (never auto-dormant) and quiet (no cold anxiety) even after 30 days
  const lifeArea = snap.areas.find((a) => a.domain === "life")!;
  assert.equal(lifeArea.focusRole, "maintenance");
  assert.equal(lifeArea.tone, "none");
  assert.equal(lifeArea.weeklyMinimum, "每周至少运动 2 次、保证 7 小时睡眠");
  assert.doesNotMatch(lifeArea.signalLabel, /静默/);

  // 3. Cooled Inbox (>14d) flagged cleanly and excluded from active area inboxMatchCount
  assert.equal(snap.cooledInboxCount, 1);
  assert.equal(snap.inbox.find((i) => i.id === "inb-old")!.cooled, true);
  assert.equal(mainArea.inboxMatchCount, 0);

  // 4. archive-cooled-inbox returns only the cooled item ID
  const archived = engine.applyUserAction(
    { type: "archive-cooled-inbox" },
    { catalog, inbox: inboxWithCooled, now: NOW },
  );
  assert.deepEqual(archived.archivedInboxIds, ["inb-old"]);

  // 5. proposeAreaRole enforces One-In-One-Out single-main replacement via Ghost -> Resolve + 1-step Undo
  const obsArea = snap.areas.find((a) => a.name === "监控平台")!;
  const roleProposal = engine.proposeAreaRole(
    {
      agent: "attention-navigator",
      areaId: obsArea.id,
      focusRole: "main",
      demoteCurrentMainTo: "side",
      quarterGoal: "完成核心告警降噪闭环",
      reason: "近期真实投入集中在监控平台，建议扶正为主线",
    },
    NOW,
  )!;
  assert.equal(roleProposal.kind, "propose-area-role");
  // Still Ghost -> old main unchanged
  assert.equal(engine.getRegistry().areas.find((a) => a.id === mainArea.id)!.focusRole, "main");

  engine.resolveProposals([{ proposalId: roleProposal.id, action: "accept" }], NOW);
  const afterCommit = engine.getRegistry().areas;
  assert.equal(afterCommit.filter((a) => a.focusRole === "main").length, 1);
  assert.equal(afterCommit.find((a) => a.id === obsArea.id)!.focusRole, "main");
  assert.equal(afterCommit.find((a) => a.id === mainArea.id)!.focusRole, "side");

  // Undo restores previous main cleanly
  assert.equal(engine.undoLastCommit(), true);
  assert.equal(engine.getRegistry().areas.find((a) => a.id === mainArea.id)!.focusRole, "main");
  assert.equal(engine.getRegistry().areas.find((a) => a.id === obsArea.id)!.focusRole, "side");

  // 6. Legacy v1 registry without focusRole/domain parses backward-compatibly
  const legacyParsed = parseStageRegistry({
    schemaVersion: 1,
    areas: [
      { id: "a1", name: "老工作区", workKeys: [], pos: { x: 20, y: 20 }, parked: false, createdAt: NOW, updatedAt: NOW },
      { id: "a2", name: "老搁置区", workKeys: [], pos: { x: 40, y: 40 }, parked: true, createdAt: NOW, updatedAt: NOW },
    ],
    advancements: [],
    unassignedWorkKeys: [],
    updatedAt: NOW,
  });
  assert.equal(legacyParsed.areas[0]!.focusRole, "side");
  assert.equal(legacyParsed.areas[0]!.domain, "work");
  assert.equal(legacyParsed.areas[1]!.focusRole, "parked");
  assert.equal(legacyParsed.areas[1]!.parked, true);
});

test("cold-start clustering ignores shared graphName/generic words and produces non-overlapping L0 grid coordinates", () => {
  const realLikeCatalog: CatalogSnapshot[] = [
    {
      schemaVersion: 1,
      graphId: "Logseq_File.master-sync:local",
      graphName: "Logseq_File.master-sync",
      refreshedAt: NOW,
      works: [
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-z1", sourceKind: "block" },
          title: "Zabbix API 数据获取能力待系统化整理",
          objectType: "事务",
          location: "Logseq_File.master-sync / 任务-Zabbix / 推进结构",
          updatedAt: NOW - DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-z2", sourceKind: "block" },
          title: "Zabbix 结构维护与查询能力",
          objectType: "MiniProject",
          location: "Logseq_File.master-sync / Jul 8th, 2026",
          updatedAt: NOW - 2 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-a1", sourceKind: "block" },
          title: "听云用户&权限配置工作流",
          objectType: "MiniProject",
          location: "Logseq_File.master-sync / 任务-听云APM平台 / 推进结构",
          updatedAt: NOW - DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-a2", sourceKind: "block" },
          title: "听云报告自动化",
          objectType: "MiniProject",
          location: "Logseq_File.master-sync / Aug 9th, 2026",
          updatedAt: NOW - 2 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-rh", sourceKind: "block" },
          title: "Red Hat 学习包整理",
          objectType: "MiniProject",
          location: "Logseq_File.master-sync / Aug 9th, 2026",
          updatedAt: NOW - 2 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-tw", sourceKind: "block" },
          title: "推文模板的整理",
          objectType: "MiniProject",
          location: "Logseq_File.master-sync / May 28th, 2026",
          updatedAt: NOW - 3 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-pr", sourceKind: "block" },
          title: "部门宣传方法包整理",
          objectType: "MiniProject",
          location: "Logseq_File.master-sync / Aug 9th, 2026",
          updatedAt: NOW - 3 * DAY,
        },
        {
          workRef: { kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: "u-gl", sourceKind: "block" },
          title: "Graylog 日志平台调研与接入",
          objectType: "MiniProject",
          location: "Logseq_File.master-sync / Jul 14th, 2026 / ## Daily Note / ## 上午",
          updatedAt: NOW - 3 * DAY,
        },
      ],
    },
  ];

  const built = buildColdStartAreaDrafts(flattenCatalog(realLikeCatalog), 7);
  const zabbixArea = built.areas.find((a) => a.name === "任务-Zabbix")!;
  const apmArea = built.areas.find((a) => a.name === "任务-听云APM平台")!;
  assert.ok(zabbixArea, "expected 任务-Zabbix bucket");
  assert.ok(apmArea, "expected 任务-听云APM平台 bucket");

  const keyOf = (uuid: string) =>
    workKey({ kind: "logseq", graphId: "Logseq_File.master-sync:local", rootUuid: uuid, sourceKind: "block" });

  assert.ok(zabbixArea.workKeys.includes(keyOf("u-z1")));
  assert.ok(zabbixArea.workKeys.includes(keyOf("u-z2")), "genuine Zabbix note should match 任务-Zabbix");
  assert.ok(!zabbixArea.workKeys.includes(keyOf("u-rh")), "Red Hat note must NOT pollute 任务-Zabbix");
  assert.ok(!zabbixArea.workKeys.includes(keyOf("u-tw")), "推文模板 note must NOT pollute 任务-Zabbix");
  assert.ok(!zabbixArea.workKeys.includes(keyOf("u-pr")), "部门宣传 note must NOT pollute 任务-Zabbix");
  assert.ok(apmArea.workKeys.includes(keyOf("u-a2")), "genuine 听云 note should match 任务-听云APM平台");
  assert.ok(!apmArea.workKeys.includes(keyOf("u-gl")), "Graylog must NOT match 听云APM平台 via generic word 平台/调研");

  // Verify non-overlapping L0 grid coordinates
  const row0Left = defaultAreaPosition(0);
  const row0Right = defaultAreaPosition(1);
  const row1Left = defaultAreaPosition(2);
  const row2Left = defaultAreaPosition(4);
  assert.equal(row0Left.x, row1Left.x);
  assert.equal(row1Left.x, row2Left.x, "row 2 must stay aligned to column 0");
  assert.ok(row0Right.x - row0Left.x >= 300, "horizontal column spacing must exceed 274px card width");
  assert.ok(row1Left.y - row0Left.y >= 290, "vertical row spacing must avoid card overlap");

  const mainPos = defaultAreaPositionForRole(0, "main", true);
  const sideAfterMain = defaultAreaPositionForRole(0, "side", true);
  assert.ok(sideAfterMain.y - mainPos.y >= 310, "rows under main area must clear tall main cards");
});

test("explicit PARA Area pages anchor L0 constellation, nest Projects under declared Areas, auto-tag life Areas, and preserve >7 Areas in dormant bar", () => {
  const gId = "Logseq_File:local";
  const areaNames = [
    "Area/运维能力",
    "Area/AI 自动化能力",
    "Area/生产效率",
    "Area/职场能力",
    "Area/心理健康",
    "Area/身体健康",
    "Area/亲密关系",
    "Area/输入系统",
    "Area/输出系统",
  ];
  const works: CatalogSnapshot["works"] = [
    ...areaNames.map((name, i) => ({
      workRef: { kind: "logseq" as const, graphId: gId, rootUuid: `pg-area-${i}`, sourceKind: "page" as const },
      title: name,
      objectType: "Area",
      location: `Main / ${name}`,
      updatedAt: NOW - i * DAY,
      lifecycleState: "active",
    })),
    {
      workRef: { kind: "logseq", graphId: gId, rootUuid: "pg-haisi", sourceKind: "page" },
      title: "项目-海丝",
      objectType: "Project",
      location: "Main / 项目-海丝",
      updatedAt: NOW - DAY,
      parentAreas: ["Area/运维能力"],
      lifecycleState: "active",
    },
    {
      workRef: { kind: "logseq", graphId: gId, rootUuid: "blk-haisi-sub", sourceKind: "block" },
      title: "完成到货清点并确认安装前条件",
      objectType: "事务",
      location: "Main / 项目-海丝 / 阶段",
      updatedAt: NOW,
      parentAreas: ["Area/运维能力"],
      lifecycleState: "active",
    },
    {
      workRef: { kind: "logseq", graphId: gId, rootUuid: "pg-tc", sourceKind: "page" },
      title: "任务-Task Copilot",
      objectType: "Project",
      location: "Main / 任务-Task Copilot",
      updatedAt: NOW - DAY,
      parentAreas: ["Area/生产效率", "Area/AI 自动化能力"],
      lifecycleState: "active",
    },
    {
      workRef: { kind: "logseq", graphId: gId, rootUuid: "pg-fit", sourceKind: "page" },
      title: "日常健身与饮食",
      objectType: "Project",
      location: "Main / 日常健身与饮食",
      updatedAt: NOW - 5 * DAY,
      parentAreas: ["Area/身体健康"],
      lifecycleState: "paused",
    },
  ];
  const catalog: CatalogSnapshot[] = [{ schemaVersion: 1, graphId: gId, graphName: "Main", refreshedAt: NOW, works }];

  const built = buildColdStartAreaDrafts(flattenCatalog(catalog), 7);
  assert.equal(built.areas.length, 7, "active L0 Areas capped at 7");
  assert.equal(built.dormantAreas.length, 2, "overflow explicit Areas preserved in dormantAreas");

  const ops = built.areas.find((a) => a.name === "运维能力")!;
  assert.ok(ops, "L0 must be anchored on explicit Area 运维能力, not 项目-海丝");
  assert.equal(ops.workKeys.length, 1, "child sub-blocks inside 项目-海丝 must not duplicate L1 project cards");
  assert.equal(ops.anchorTitles[0], "项目-海丝");

  const body = built.areas.find((a) => a.name === "身体健康")!;
  assert.equal(body.domain, "life");
  assert.equal(body.focusRole, "maintenance");

  // Commit through StageEngine and verify dormant Areas appear in snap.dormantAreas & unpark cleanly
  const engine = new StageEngine(undefined, NOW);
  const proposal = engine.proposeAreas({ agent: "user", catalog }, NOW);
  assert.equal(proposal.proposedAreas?.length, 7);
  assert.equal(proposal.proposedDormantAreas?.length, 2);
  engine.resolveProposals([{ proposalId: proposal.id, action: "accept" }], NOW);

  const snap = engine.buildSnapshot(catalog, [], NOW);
  assert.equal(snap.areas.length, 7);
  assert.equal(snap.dormantAreas.length, 2);

  // Verify Area workRef, L2 nested childWorks, clean semantic subtitle, and secondary cross-area projection
  const opsSnap = snap.areas.find((a) => a.name === "运维能力")!;
  assert.equal(opsSnap.areaPageTitle, "Area/运维能力");
  assert.ok(opsSnap.areaWorkRef);
  const haisi = opsSnap.projects.find((p) => p.title === "项目-海丝")!;
  assert.equal(haisi.childWorks.length, 1, "nested child block must appear in project.childWorks");
  assert.equal(haisi.childWorks[0]!.title, "完成到货清点并确认安装前条件");
  assert.match(haisi.subtitle, /进行中.*含 1 项子事务/);
  assert.equal(
    snap.unassignedWorks.some((u) => u.title === "完成到货清点并确认安装前条件"),
    false,
    "nested child block must not leak into unassignedWorks",
  );

  const effSnap = snap.areas.find((a) => a.name === "生产效率")!;
  const aiSnap = snap.areas.find((a) => a.name === "AI 自动化能力")!;
  const tcProj = effSnap.projects.find((p) => p.title === "任务-Task Copilot")!;
  assert.equal(tcProj.secondaryAreas.length, 1);
  assert.equal(tcProj.secondaryAreas[0]!.areaName, "AI 自动化能力");
  assert.equal(aiSnap.projects.some((p) => p.title === "任务-Task Copilot"), false, "must not double-count in primary projects");
  assert.equal(aiSnap.crossAreaProjects.length, 1, "must project as secondary cross-area reference");
  assert.equal(aiSnap.crossAreaProjects[0]!.title, "任务-Task Copilot");
  assert.equal(aiSnap.crossAreaProjects[0]!.primaryAreaName, "生产效率");

  // Verify noisy raw Logseq outline path is cleaned into crisp 1-line subtitle
  const cleanedChildSub = formatWorkSubtitle(
    {
      workRef: { kind: "logseq", graphId: gId, rootUuid: "blk-x", sourceKind: "block" },
      title: "完成 30 天试运行并形成试运行结论",
      objectType: "任务",
      graphName: "Logseq_File.master-sync",
      location:
        "Logseq_File.master-sync / 项目-海丝 / **[旧项目内容]** 原海丝项目页面（2026-08-09 重组前内容） / **[资源列表]**:<事务处理过程中你可以用到的资源> / 项目进度规划 / **[阶段]** 试运行与验收交付 / **[子阶段]** 30 天试运行",
    },
    { omitPageTitle: "项目-海丝" },
  );
  assert.equal(cleanedChildSub, "试运行与验收交付 › 30 天试运行");
  assert.doesNotMatch(cleanedChildSub, /Logseq_File|旧项目内容|资源列表|\*\*</);

  const dormantId = snap.dormantAreas[0]!.id;
  engine.toggleParkArea(dormantId, false, undefined, NOW);
  const snapAfterWake = engine.buildSnapshot(catalog, [], NOW);
  assert.equal(snapAfterWake.areas.length, 8);
  assert.equal(snapAfterWake.dormantAreas.length, 1);
});
