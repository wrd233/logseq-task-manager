import test from "node:test";
import assert from "node:assert/strict";
import type { PageEntity } from "@logseq/libs/dist/LSPlugin";
import { appendEveningNote, collectJournalFootprints, writeEveningJournalBlock } from "../src/features/stage/evening-journal.ts";

test("Journal footprints use the native date and retain full user text", () => {
  const now = new Date("2026-11-26T17:42:00").getTime();
  const page = { "journal?": true, "journal-day": 20261126 };
  const result = collectJournalFootprints([
    { uuid: "today", content: "自己的两段\nid:: today\n\n第二段", "updated-at": now, page },
    { uuid: "older", content: "旧日记", page: { "journal?": true, "journal-day": 20261125 } },
    { uuid: "outside", content: "普通笔记", page: { ...page, "journal?": false } },
  ], now);
  assert.deepEqual(result, { date: "2026-11-26", blocks: [{ blockUuid: "today", text: "自己的两段\n\n第二段", at: now }] });
});

test("Journal save passes the user string verbatim and reuses the native request ID after retry", async () => {
  const input = { uuid: "once", text: "  第一段\n\n  第二段  ", fileGraph: true,
    page: { id: 1, name: "journal", "journal?": true } as PageEntity };
  const written: { name: string; text: string; uuid: string }[] = [];
  const port = {
    read: async (uuid: string) => written.some(row => row.uuid === uuid) ? { uuid, page: { id: 1 } } : null,
    append: async (name: string, text: string, options: { customUUID: string; properties: Record<string, string>; focus: boolean }) => {
      assert.equal(options.focus, false);
      assert.deepEqual(options.properties, { id: "once" });
      written.push({ name, text, uuid: options.customUUID });
      return { uuid: options.customUUID };
    },
  };
  assert.equal(await writeEveningJournalBlock(input, port), "once");
  assert.equal(await writeEveningJournalBlock(input, port), "once");
  assert.deepEqual(written, [{ name: "journal", text: input.text, uuid: "once" }]);
});

test("Journal save resolves the native title after creation on an older file graph", async () => {
  const previous = globalThis.logseq;
  let created = false;
  const input = { uuid: "note", text: "第一段\n\n第二段", journalDate: "2026-11-26", graphId: "lab:/graph", pages: [] };
  globalThis.logseq = {
    App: { getCurrentGraph: async () => ({ name: "lab", url: "/graph", path: "/graph" }) },
    Editor: {
      createJournalPage: async () => { throw new Error("Not existed method #createJournalPage"); },
      createPage: async (date: string, properties: object, options: object) => {
        assert.equal(date, input.journalDate);
        assert.deepEqual(properties, {});
        assert.deepEqual(options, { redirect: false, createFirstBlock: false, journal: true });
        created = true;
        return null;
      },
      getAllPages: async () => created ? [{ id: 1, name: "nov 26th, 2026", originalName: "Nov 26th, 2026", "journal?": true, journalDay: 20261126 }] : [],
      getBlock: async () => null,
      appendBlockInPage: async (name: string, text: string) => {
        assert.equal(name, "Nov 26th, 2026");
        assert.equal(text, input.text);
        return { uuid: input.uuid };
      },
    },
  } as unknown as typeof logseq;
  try {
    assert.deepEqual(await appendEveningNote(input), { blockUuid: input.uuid, pageName: "Nov 26th, 2026", journalDate: input.journalDate });
  } finally {
    globalThis.logseq = previous;
  }
});
