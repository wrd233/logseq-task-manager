import test from "node:test";
import assert from "node:assert/strict";
import { workKey, type CatalogSnapshot } from "@task-copilot/contracts";
import {
  StageEngine,
  TimeEngine,
  buildWorkRestartDeck,
  buildWorkbenchRestartDeck,
  restartSlides,
  parseTimeRegistry,
  type StageInboxRawItem,
} from "../src/index.ts";

const DAY_MS = 86_400_000;
const BASE_NOW = new Date("2026-11-21T10:00:00").getTime();

function makeCatalog(obsAgeDays: number, netAgeDays = 1): CatalogSnapshot {
  return {
    schemaVersion: 1,
    graphId: "graph:/main",
    graphName: "主力图谱",
    refreshedAt: BASE_NOW,
    works: [
      {
        workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: "blk-obs-1", sourceKind: "block" },
        title: "核心告警降噪升级",
        objectType: "Project",
        location: "监控平台 / 告警治理",
        updatedAt: BASE_NOW - obsAgeDays * DAY_MS,
      },
      {
        workRef: { kind: "logseq", graphId: "graph:/main", rootUuid: "blk-net-1", sourceKind: "block" },
        title: "跨区网络割接预案",
        objectType: "MiniProject",
        location: "基础设施 / 网络",
        updatedAt: BASE_NOW - netAgeDays * DAY_MS,
      },
    ],
  };
}

test("Single-work recovery uses three paper pages and carries the exact native anchor", () => {
  const catalog = makeCatalog(10, 12);
  const obsKey = workKey(catalog.works[0]!.workRef);
  const engine = new StageEngine();
  const draft = engine.proposeAreas({
    agent: "codex",
    catalog: [catalog],
    areas: [
      {
        name: "监控平台",
        workKeys: [obsKey],
        focusRole: "main",
        quarterGoal: "把告警噪音压低一半",
      },
    ],
  });
  engine.resolveProposals([{ proposalId: draft.id, action: "accept" }], BASE_NOW - 10 * DAY_MS);

  const timeEngine = new TimeEngine(undefined, BASE_NOW - 10 * DAY_MS);
  // Record a focus session 10 days ago with a stop note
  timeEngine.startFocus(
    { title: "核心告警降噪升级", areaId: engine.getRegistry().areas[0]!.id, projectWorkKey: obsKey, slotId: "morning" },
    BASE_NOW - 10 * DAY_MS,
  );
  timeEngine.pauseFocus(BASE_NOW - 10 * DAY_MS + 25 * 60_000, { stopNote: "已完成阈值压测，下一步写回滚清单", lastBlockUuid: "last-native-line" });
  timeEngine.finishFocus(
    {},
    BASE_NOW - 10 * DAY_MS + 25 * 60_000,
  );

  // The middle page records the absence of changes without adding filler.
  const snapQuiet = engine.buildSnapshot([catalog], [], BASE_NOW, undefined, undefined, timeEngine.buildSnapshot(BASE_NOW));
  const areaQuiet = snapQuiet.areas[0]!;
  const projQuiet = areaQuiet.projects[0]!;
  const deckQuiet = buildWorkRestartDeck({ project: projQuiet, area: areaQuiet, snapshot: snapQuiet, now: BASE_NOW });

  assert.ok(deckQuiet);
  assert.equal(deckQuiet.kind, "work-resume");
  assert.equal(deckQuiet.hasObjectiveChanges, false);
  assert.equal(deckQuiet.slides.length, 3);
  assert.equal(deckQuiet.slides[0]!.total, 3);
  assert.match(deckQuiet.slides[1]!.lines.join(" "), /没有新增相关记录/);
  assert.equal(deckQuiet.lastBlockUuid, "last-native-line");
  assert.ok(deckQuiet.slides[2]!.lines.some((l) => l.includes("已完成阈值压测")));
  assert.equal(deckQuiet.slides[2]!.emphasis?.[0]?.source, "user");
  assert.equal(deckQuiet.primaryActionLabel, "直达上次那一行");
  for (const slide of deckQuiet.slides) {
    assert.ok(slide.lines.length <= 3, `Slide ${slide.index} must have <= 3 lines`);
    assert.doesNotMatch(`${slide.kicker} ${slide.heading} ${slide.lines.join(" ")}`, /\p{Extended_Pictographic}/u);
  }

  // Keep the recorded voice snippet on the objective-changes page.
  const voiceInbox: StageInboxRawItem[] = [
    {
      id: "icloud-voice-1",
      text: "核心告警降噪升级记得把夜班值守路由一起收敛",
      status: "open",
      createdAt: BASE_NOW - 2 * DAY_MS,
      updatedAt: BASE_NOW - 2 * DAY_MS,
      sourceType: "ios-shortcut",
      sourceLabel: "iPhone 随口记",
    },
  ];
  const snapWithVoice = engine.buildSnapshot(
    [catalog],
    voiceInbox,
    BASE_NOW,
    undefined,
    undefined,
    timeEngine.buildSnapshot(BASE_NOW),
  );
  const deckWithVoice = buildWorkRestartDeck({
    project: snapWithVoice.areas[0]!.projects[0]!,
    area: snapWithVoice.areas[0]!,
    snapshot: snapWithVoice,
    now: BASE_NOW,
  });

  assert.ok(deckWithVoice);
  assert.equal(deckWithVoice.hasObjectiveChanges, true);
  assert.equal(deckWithVoice.slides.length, 3);
  assert.match(deckWithVoice.slides[1]!.lines.join(" "), /iPhone 随口记/);
  for (const slide of deckWithVoice.slides) {
    assert.ok(slide.lines.length <= 3);
    assert.doesNotMatch(`${slide.kicker} ${slide.heading} ${slide.lines.join(" ")}`, /\p{Extended_Pictographic}/u);
  }
});

test("Workbench gap >= 3d builds restartDeck (3 slides), does not trigger on fresh install, and settles cleanly on ack", () => {
  const catalog = makeCatalog(1, 2);
  const obsKey = workKey(catalog.works[0]!.workRef);
  const engine = new StageEngine();
  const draft = engine.proposeAreas({
    agent: "codex",
    catalog: [catalog],
    areas: [{ name: "监控平台", workKeys: [obsKey], focusRole: "main", quarterGoal: "Q4 告警收敛" }],
  });
  engine.resolveProposals([{ proposalId: draft.id, action: "accept" }], BASE_NOW - 6 * DAY_MS);

  // 1. Fresh empty TimeEngine must NOT trigger workbench-gap restart
  const freshTime = new TimeEngine(undefined, BASE_NOW);
  const freshSnap = engine.buildSnapshot([catalog], [], BASE_NOW, undefined, undefined, freshTime.buildSnapshot(BASE_NOW));
  assert.equal(freshSnap.time?.workbenchGapDays, 0);
  assert.equal(freshSnap.restartDeck, undefined);

  // 2. Legacy time registry from 5 days ago (without lastWorkbenchActiveAt field) preserves gap across syncCarryover!
  const fiveDaysAgo = BASE_NOW - 5 * DAY_MS;
  const legacyReg = parseTimeRegistry(
    {
      schemaVersion: 1,
      weekMoves: [],
      dayItems: [
        {
          id: "old-item-1",
          date: "2026-11-16",
          slotId: "morning",
          title: "补齐告警分级文档",
          state: "open",
          actualMinutes: 0,
          carryoverCount: 0,
          createdAt: fiveDaysAgo,
          updatedAt: fiveDaysAgo,
        },
      ],
      activeFocus: null,
      focusHistory: [
        {
          id: "f-old",
          title: "核心告警降噪升级",
          slotId: "morning",
          date: "2026-11-16",
          weekKey: "2026-11-16",
          projectWorkKey: obsKey,
          startedAt: fiveDaysAgo - 20 * 60_000,
          endedAt: fiveDaysAgo,
          durationMinutes: 20,
          stopNote: "留了一个待核对指标表",
        },
      ],
      footprintCalendarEnabled: false,
      footprintCalendarName: "Task Copilot 足迹",
      updatedAt: fiveDaysAgo,
    },
    fiveDaysAgo,
  );
  const gappedTime = new TimeEngine(legacyReg, BASE_NOW);
  const gappedSnap = engine.buildSnapshot([catalog], [], BASE_NOW, undefined, undefined, gappedTime.buildSnapshot(BASE_NOW));

  assert.equal(gappedSnap.time?.workbenchGapDays, 5);
  assert.ok(gappedSnap.restartDeck, "Should emit workbench-gap restartDeck on >= 3d gap");
  assert.equal(gappedSnap.restartDeck!.kind, "workbench-gap");
  assert.equal(gappedSnap.restartDeck!.slides.length, 3, "Carryover + catalog updates produce 3 slides");
  assert.equal(gappedSnap.restartDeck!.canSettleCarryover, true);
  assert.ok(gappedSnap.restartDeck!.slides[2]!.lines.some((l) => l.includes("留了一个待核对指标表")));
  assert.ok(gappedSnap.restartDeck!.slides[1]!.lines.some((l) => l.includes("昨日遗留")));

  // 3. A quiet interval keeps the middle page available.
  const quietCatalog = makeCatalog(10, 12);
  const quietTime = new TimeEngine(
    parseTimeRegistry(
      {
        schemaVersion: 1,
        weekMoves: [],
        dayItems: [],
        activeFocus: null,
        focusHistory: [],
        footprintCalendarEnabled: false,
        footprintCalendarName: "Task Copilot 足迹",
        lastWorkbenchActiveAt: BASE_NOW - 4 * DAY_MS,
        updatedAt: BASE_NOW - 4 * DAY_MS,
      },
      BASE_NOW,
    ),
    BASE_NOW,
  );
  const quietWbSnap = engine.buildSnapshot([quietCatalog], [], BASE_NOW, undefined, undefined, quietTime.buildSnapshot(BASE_NOW));
  const quietWbDeck = buildWorkbenchRestartDeck({ snapshot: quietWbSnap, now: BASE_NOW });
  assert.ok(quietWbDeck);
  assert.equal(quietWbDeck.hasObjectiveChanges, false);
  assert.equal(quietWbDeck.slides.length, 3);

  // 4. Acknowledge with settleCarryoverToWeek clears carryover to week and suppresses deck for today
  gappedTime.applyAction({ type: "ack-workbench-restart", settleCarryoverToWeek: true }, BASE_NOW);
  const afterAck = engine.buildSnapshot([catalog], [], BASE_NOW, undefined, undefined, gappedTime.buildSnapshot(BASE_NOW));
  assert.equal(afterAck.time?.carryoverItems.length, 0);
  assert.equal(afterAck.time?.weekMoves.length, 1);
  assert.equal(afterAck.time?.weekMoves[0]!.title, "补齐告警分级文档");
  assert.equal(afterAck.time?.restartDismissedToday, true);
  assert.equal(afterAck.restartDeck, undefined);

  // 1-step Undo restores carryover cleanly
  assert.equal(gappedTime.undoLastCommit(), true);
  assert.equal(gappedTime.buildSnapshot(BASE_NOW).carryoverItems.length, 1);
});


test("restart emphasis never exceeds three fragments per page and recomposes exact slide text", () => {
  const repeated = {
    heading: "恢复",
    lines: Array.from({ length: 4 }, (_, index) => ({ text: `目标${index}卡点`, focus: "目标", risk: "卡点" })),
  };
  for (const page of restartSlides(repeated, repeated, repeated)) {
    assert.equal(page.lines.length, 3);
    const fragments = page.emphasis!.flatMap(line => line.fragments.filter(fragment => fragment.tone));
    assert.equal(fragments.length, 3);
    assert.deepEqual(page.emphasis!.map(line => line.fragments.map(fragment => fragment.text).join("")), page.lines);
  }
});
