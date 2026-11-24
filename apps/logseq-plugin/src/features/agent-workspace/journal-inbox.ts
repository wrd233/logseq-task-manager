import type { PageEntity } from "@logseq/libs/dist/LSPlugin";
import { extractObjectNavigationLabel } from "../../canonical-writing.ts";

export interface JournalBlockCandidate {
  uuid: string;
  content: string;
  properties?: Record<string, unknown>;
  "updated-at"?: number;
  page?: {
    id?: number;
    name?: string;
    originalName?: string;
    "original-name"?: string;
    "journal?"?: boolean;
    "journal-day"?: number;
    journalDay?: number;
  };
}

export interface JournalInboxSignal {
  blockUuid: string;
  journalDate: string;
  pageName: string;
  text: string;
  links?: string[];
  updatedAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const COMPLETED_PREFIX_RE = /^(?:DONE|CANCELED|CANCELLED)\b/u;
const TODO_RECALL_RE = /^(?:TODO|LATER|NOW|DOING)\b\s+\S/u;
const BOLD_TAG_RECALL_RE = /^\*\*\[[^\]]{1,16}\]\*\*\s*[:：]?\s*\S/u;
const PLAIN_TAG_RECALL_RE = /^\[(?!\[)(?!#[ABC]\])([^\]]{1,16})\](?!\()\s*[:：]?\s*\S/u;

export function formatJournalDayToIso(journalDay?: number): string | null {
  if (typeof journalDay !== "number" || !Number.isInteger(journalDay) || journalDay < 19700101 || journalDay > 29991231) {
    return null;
  }
  const s = String(journalDay);
  if (s.length !== 8) return null;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function journalDayFromMs(ms: number): number {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function journalDayToLocalMs(journalDay: number): number | null {
  const iso = formatJournalDayToIso(journalDay);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const ts = new Date(y!, m! - 1, d!, 12, 0, 0).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function isWithinJournalRecallWindow(journalDay: number, nowMs = Date.now(), windowDays = 30): boolean {
  const dayMs = journalDayToLocalMs(journalDay);
  if (dayMs === null) return false;
  const cutoff = nowMs - windowDays * DAY_MS;
  return dayMs >= cutoff && dayMs <= nowMs + 2 * DAY_MS;
}

function stripPropertyLines(content: string): string {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^[a-zA-Z0-9_-]+::/u.test(line));
  return lines.join(" ").replace(/\s+/gu, " ").trim();
}

function extractWikiLinks(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/gu)) {
    const link = match[1]?.trim();
    if (link && !link.startsWith("$") && !out.includes(link)) {
      out.push(link.slice(0, 80));
    }
  }
  return out.slice(0, 12);
}

/**
 * Pure recall predicate for Logseq daily Journal blocks (D-63):
 * - Recalls `TODO`/`LATER`/`NOW`/`DOING` and any `**[xx]**` / `[xx]` prefix blocks.
 * - Strictly excludes `DONE`/`CANCELED` blocks, formal work anchors (`**[任务]**`, `**[Project]**`,
 *   `**[MiniProject]**`), template blocks, and empty markers.
 */
export function isJournalRecallCandidate(content: string): boolean {
  const clean = stripPropertyLines(content);
  if (!clean) return false;
  if (/^\s*template::/imu.test(content)) return false;

  const firstLine = clean.replace(/^[-*]\s+/u, "").replace(/^\[#[ABC]\]\s*/iu, "").trim();
  if (!firstLine) return false;
  if (COMPLETED_PREFIX_RE.test(firstLine)) return false;
  // Formal work anchors belong in work-catalog, never duplicated into ephemeral Inbox
  if (extractObjectNavigationLabel(content)) return false;

  return TODO_RECALL_RE.test(firstLine) || BOLD_TAG_RECALL_RE.test(firstLine) || PLAIN_TAG_RECALL_RE.test(firstLine);
}

export function collectJournalInboxSignals(input: {
  blocks: readonly JournalBlockCandidate[];
  archivedPageNames?: ReadonlySet<string>;
  now?: number;
  windowDays?: number;
}): JournalInboxSignal[] {
  const now = input.now ?? Date.now();
  const windowDays = input.windowDays ?? 30;
  const archived = input.archivedPageNames ?? new Set<string>();
  const signals: JournalInboxSignal[] = [];
  const seen = new Set<string>();

  for (const block of input.blocks) {
    if (!block?.uuid || typeof block.content !== "string" || seen.has(block.uuid)) continue;
    const page = block.page;
    if (!page || page["journal?"] !== true) continue;
    const journalDay = page.journalDay ?? page["journal-day"];
    if (typeof journalDay !== "number" || !isWithinJournalRecallWindow(journalDay, now, windowDays)) continue;

    const pageName = (page.originalName ?? page["original-name"] ?? page.name ?? "").trim();
    if (pageName && archived.has(pageName.toLocaleLowerCase())) continue;

    if (!isJournalRecallCandidate(block.content)) continue;

    const cleanText = stripPropertyLines(block.content).slice(0, 400);
    if (!cleanText) continue;
    const journalDate = formatJournalDayToIso(journalDay);
    if (!journalDate) continue;

    const fallbackTs = journalDayToLocalMs(journalDay) ?? now;
    const updatedAt =
      typeof block["updated-at"] === "number" && Number.isFinite(block["updated-at"]) && block["updated-at"] > 0
        ? block["updated-at"]
        : fallbackTs;

    const links = extractWikiLinks(cleanText);
    seen.add(block.uuid);
    signals.push({
      blockUuid: block.uuid,
      journalDate,
      pageName: pageName || journalDate,
      text: cleanText,
      ...(links.length > 0 ? { links } : {}),
      updatedAt,
    });
  }

  signals.sort((a, b) => b.updatedAt - a.updatedAt || a.blockUuid.localeCompare(b.blockUuid));
  return signals.slice(0, 200);
}

export async function readRecentJournalBlocks(
  check: () => void,
  windowDays = 30,
  now = Date.now(),
): Promise<JournalBlockCandidate[]> {
  const cutoffDay = journalDayFromMs(now - windowDays * DAY_MS);
  const query = `[:find (pull ?b [:block/uuid :block/content :block/properties :block/updated-at {:block/page [:db/id :block/name :block/original-name :block/journal? :block/journal-day]}]) :where [?p :block/journal? true] [?p :block/journal-day ?day] [(>= ?day ${cutoffDay})] [?b :block/page ?p] [?b :block/content ?content]]`;
  const rows = (await logseq.DB.datascriptQuery(query)) as Array<[JournalBlockCandidate]> | null;
  check();
  return (rows ?? []).map(([row]) => row).filter((row): row is JournalBlockCandidate => Boolean(row && row.uuid));
}

export async function appendCaptureToJournalDate(input: {
  journalDate: string;
  formattedLine: string;
  allPages?: readonly PageEntity[];
}): Promise<{ blockUuid: string; pageName: string; journalDate: string } | null> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input.journalDate.trim());
  const targetDay = match ? Number(`${match[1]}${match[2]}${match[3]}`) : journalDayFromMs(Date.now());
  const pages = input.allPages ?? (await logseq.Editor.getAllPages()) ?? [];
  const existing = pages.find((p) => p["journal?"] === true && p.journalDay === targetDay);

  let targetPageName = existing ? (existing.originalName ?? existing.name) : "";
  if (!targetPageName && match) {
    const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (typeof logseq.Editor.createJournalPage === "function") {
      const created = await logseq.Editor.createJournalPage(dt);
      if (created?.name) {
        targetPageName = created.originalName ?? created.name;
      }
    }
  }
  if (!targetPageName) {
    targetPageName = input.journalDate;
  }

  const createdBlock = await logseq.Editor.appendBlockInPage(targetPageName, input.formattedLine);
  if (!createdBlock?.uuid) return null;
  return {
    blockUuid: createdBlock.uuid,
    pageName: targetPageName,
    journalDate: input.journalDate,
  };
}
