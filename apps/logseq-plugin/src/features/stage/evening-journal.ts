import type { PageEntity } from "@logseq/libs/dist/LSPlugin";
import { dateKeyFromMs, type JournalTraceSource } from "@task-copilot/stage-runtime";
import { graphIdentity } from "../../graph-adapter.ts";
import { currentGraphIsDb } from "../../source-identity.ts";
import { journalDayFromMs, type JournalBlockCandidate } from "../agent-workspace/journal-inbox.ts";

export function collectJournalFootprints(blocks: JournalBlockCandidate[], now = Date.now()): { date: string; blocks: JournalTraceSource[] } {
  const day = journalDayFromMs(now);
  const unique = new Set<string>();
  const records: JournalTraceSource[] = [];
  for (const block of blocks) {
    if (!block.uuid || unique.has(block.uuid) || !block.content?.trim()) continue;
    const page = block.page;
    if (!page?.["journal?"] || (page.journalDay ?? page["journal-day"]) !== day) continue;
    const at = block["updated-at"];
    const text = block.content.split("\n").filter(line => line.trim() !== `id:: ${block.uuid}`).join("\n");
    if (!text.trim()) continue;
    unique.add(block.uuid);
    records.push({
      blockUuid: block.uuid, text: text.slice(0, 8000),
      ...(typeof at === "number" && Number.isFinite(at) && dateKeyFromMs(at) === dateKeyFromMs(now) ? { at } : {}),
    });
  }
  return { date: dateKeyFromMs(now), blocks: records.sort((a, b) => (b.at ?? -1) - (a.at ?? -1)).slice(0, 80) };
}

export async function writeEveningJournalBlock(
  input: { uuid: string; text: string; page: PageEntity; fileGraph: boolean },
  host: {
    read(uuid: string): Promise<{ uuid: string; page?: { id: number } } | null>;
    append(pageName: string, text: string, options: { customUUID: string; properties: Record<string, string>; focus: boolean }): Promise<{ uuid: string } | null>;
  },
): Promise<string> {
  const existing = await host.read(input.uuid);
  if (existing) {
    if (existing.page?.id !== input.page.id) throw new Error("手记已绑定其他日记");
    return existing.uuid;
  }
  const written = await host.append(input.page.originalName ?? input.page.name, input.text, {
    customUUID: input.uuid, properties: input.fileGraph ? { id: input.uuid } : {}, focus: false,
  });
  if (written?.uuid !== input.uuid) throw new Error("Logseq 未保存手记标识");
  return written.uuid;
}

export async function appendEveningNote(input: {
  uuid: string; text: string; journalDate: string; graphId: string; pages: readonly PageEntity[];
}): Promise<{ blockUuid: string; pageName: string; journalDate: string } | null> {
  const check = async () => {
    const graph = await logseq.App.getCurrentGraph();
    if (!graph || graphIdentity(graph) !== input.graphId) throw new Error("图谱已切换");
  };
  await check();
  const day = Number(input.journalDate.replaceAll("-", ""));
  const matchesDate = (item: PageEntity) => item["journal?"] && item.journalDay === day;
  let page = input.pages.find(matchesDate);
  if (!page) {
    const date = new Date(`${input.journalDate}T12:00:00`);
    const created = await logseq.Editor.createJournalPage?.(date).catch(() => null);
    if (created && matchesDate(created)) page = created;
    else {
      await check();
      await logseq.Editor.createPage(input.journalDate, {}, { redirect: false, createFirstBlock: false, journal: true });
      // File-graph hosts can return null when they rename the ISO title to the configured journal title.
      page = (await logseq.Editor.getAllPages())?.find(matchesDate);
    }
  }
  if (!page) return null;
  const fileGraph = !await currentGraphIsDb(logseq.App);
  const blockUuid = await writeEveningJournalBlock({ ...input, page, fileGraph }, {
    read: async uuid => { await check(); return logseq.Editor.getBlock(uuid); },
    append: async (pageName, text, options) => {
      await check();
      return logseq.Editor.appendBlockInPage(pageName, text, options);
    },
  });
  return { blockUuid, pageName: page.originalName ?? page.name, journalDate: input.journalDate };
}
