import test from "node:test";
import assert from "node:assert/strict";
import { dateKeyFromMs, growIdea, reflectToday } from "../src/index.ts";

test("the evening view collects objective records and leaves missing sources empty", () => {
  const now = new Date("2026-11-26T17:42:00").getTime();
  const date = dateKeyFromMs(now);
  assert.deepEqual(reflectToday({ date }), { date, journalAvailable: false, traces: [], ideas: [], pendingNoteIds: [] });
  const snapshot = reflectToday({
    date,
    focus: [{
      id: "focus", title: "核对样本", slotId: "morning", date, weekKey: date,
      startedAt: now - 10 * 60_000, endedAt: now, durationMinutes: 10, stopNote: "还差两条",
    }],
    voice: [
      { id: "voice", sourceType: "ios-shortcut", status: "open", text: "原话\n两行", createdAt: now, updatedAt: now },
      { id: "old", sourceType: "ios-shortcut", status: "open", text: "昨天", createdAt: now - 86400000, updatedAt: now },
    ],
    ledger: [{ id: "clear", inboxId: "work", text: "清了核对工单", sourceType: "manual", sourceLabel: "手记", fromPocket: "sweep",
      destination: "sweep-done", destinationLabel: "办完划掉", at: now }],
    journal: { graphId: "graph", blocks: [{ blockUuid: "journal-block", text: "今天直接写的原文" }] },
  });
  assert.equal(snapshot.journalAvailable, true);
  assert.deepEqual(snapshot.traces.map(trace => trace.label), ["日记", "专注", "清扫", "随口记"]);
  assert.equal(snapshot.traces[1]?.original, "核对样本\n还差两条");
  assert.equal(snapshot.traces[3]?.original, "原话\n两行");
  assert.equal(snapshot.traces[0]?.workRef?.kind, "logseq");
});

test("an idea grows through dated append-only entries with idempotent retries", () => {
  const first = growIdea([], { id: "thread", date: "2026-11-25", text: "第一句想法" });
  const next = growIdea(first, { ideaId: "thread", id: "new", date: "2026-11-26", text: "今天再补一句" });
  assert.deepEqual(next[0]?.entries, [
    { id: "thread", date: "2026-11-25", text: "第一句想法" },
    { id: "new", date: "2026-11-26", text: "今天再补一句" },
  ]);
  assert.equal(growIdea(next, { ideaId: "thread", id: "new", date: "2026-11-26", text: "今天再补一句" }), next);
});
