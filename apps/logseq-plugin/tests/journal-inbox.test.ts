import test from "node:test";
import assert from "node:assert/strict";
import {
  collectJournalInboxSignals,
  formatJournalDayToIso,
  isJournalRecallCandidate,
  type JournalBlockCandidate,
} from "../src/features/agent-workspace/journal-inbox.ts";

test("isJournalRecallCandidate recalls TODO and any **[xx]** prefixes while excluding formal anchors and DONE/CANCELED", () => {
  assert.equal(isJournalRecallCandidate("TODO 给郭工开一下权限"), true);
  assert.equal(isJournalRecallCandidate("**[注]** 大数据的那几个服务器注意一下，明天要创好，下午和庆南说过了"), true);
  assert.equal(isJournalRecallCandidate("**[想法]** 统一工作区上下文同步"), true);
  assert.equal(isJournalRecallCandidate("[急] 下班前回运维群审批"), true);

  // Excluded: completed, canceled, formal work anchors, plain prose, templates
  assert.equal(isJournalRecallCandidate("DONE 已经完成的任务"), false);
  assert.equal(isJournalRecallCandidate("CANCELED 取消了"), false);
  assert.equal(isJournalRecallCandidate("**[任务]** 监控平台升级"), false);
  assert.equal(isJournalRecallCandidate("**[Project]** 个人工作台重构"), false);
  assert.equal(isJournalRecallCandidate("**[MiniProject]** 告警降噪"), false);
  assert.equal(isJournalRecallCandidate("今天天气不错，随便写一句日记"), false);
  assert.equal(isJournalRecallCandidate("[[普通页面链接]] 不是行首标记"), false);
  assert.equal(isJournalRecallCandidate("**[想法]** 模板项\ntemplate:: daily"), false);
});

test("collectJournalInboxSignals filters to recent 30-day journal pages, extracts wikilinks, and skips archived/non-journal pages", () => {
  const now = new Date(2026, 10, 24, 15, 0, 0).getTime();
  assert.equal(formatJournalDayToIso(20261124), "2026-11-24");
  assert.equal(formatJournalDayToIso(20261399), null);

  const blocks: JournalBlockCandidate[] = [
    {
      uuid: "u-recent-note",
      content: "**[注]** 明天把 [[监控平台]] 的服务器创好，下午和庆南说过了\nid:: u-recent-note",
      "updated-at": now - 3600_000,
      page: { name: "2026-11-24", originalName: "2026-11-24", "journal?": true, journalDay: 20261124 },
    },
    {
      uuid: "u-recent-todo",
      content: "TODO 回一下微信里郭工的消息",
      "updated-at": now - 7200_000,
      page: { name: "2026-11-23", originalName: "2026-11-23", "journal?": true, journalDay: 20261123 },
    },
    {
      uuid: "u-formal-anchor",
      content: "**[任务]** 正式任务锚点不应进入随想池",
      "updated-at": now - 1000,
      page: { name: "2026-11-24", originalName: "2026-11-24", "journal?": true, journalDay: 20261124 },
    },
    {
      uuid: "u-old-journal",
      content: "**[想法]** 45 天前的旧日记不应回捞",
      "updated-at": now - 45 * 86_400_000,
      page: { name: "2026-10-01", originalName: "2026-10-01", "journal?": true, journalDay: 20261001 },
    },
    {
      uuid: "u-non-journal",
      content: "**[注]** 普通页面上的注记不通过日记回捞",
      "updated-at": now - 1000,
      page: { name: "某普通页面", originalName: "某普通页面", "journal?": false },
    },
    {
      uuid: "u-archived-page",
      content: "**[注]** 归档页不回捞",
      "updated-at": now - 1000,
      page: { name: "2026-11-22", originalName: "2026-11-22", "journal?": true, journalDay: 20261122 },
    },
  ];

  const signals = collectJournalInboxSignals({
    blocks,
    archivedPageNames: new Set(["2026-11-22"]),
    now,
    windowDays: 30,
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]!.blockUuid, "u-recent-note");
  assert.equal(signals[0]!.journalDate, "2026-11-24");
  assert.deepEqual(signals[0]!.links, ["监控平台"]);
  assert.doesNotMatch(signals[0]!.text, /id::/);
  assert.equal(signals[1]!.blockUuid, "u-recent-todo");
});
