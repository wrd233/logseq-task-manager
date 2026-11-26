import type { WorkRef } from "@task-copilot/contracts";
import { dateKeyFromMs } from "./time-model.ts";
import type { CompletedFocusRecord } from "./time-types.ts";
import type { StageInboxFlowLedgerEntry, StageInboxRawItem } from "./types.ts";

export interface JournalTraceSource {
  blockUuid: string;
  text: string;
  at?: number;
}

export interface ReflectionTrace {
  id: string;
  at?: number;
  label: string;
  summary: string;
  original: string;
  workRef?: WorkRef;
}

export interface IdeaEntry {
  id: string;
  date: string;
  text: string;
}

export interface GrowingIdea {
  id: string;
  title: string;
  entries: IdeaEntry[];
}

export interface ReflectionSnapshot {
  date: string;
  graphId?: string;
  journalAvailable: boolean;
  traces: ReflectionTrace[];
  ideas: GrowingIdea[];
  pendingNoteIds: string[];
}

export type ReflectionAction =
  | { type: "save-evening-note"; requestId: string; date: string; graphId?: string; text: string }
  | { type: "append-idea-note"; ideaId?: string; entryId: string; text: string };

function summary(text: string): string {
  const line = text.replace(/\s+/gu, " ").trim();
  return line.length > 92 ? line.slice(0, 91) + "…" : line;
}

export function reflectToday(input: {
  date: string;
  graphId?: string;
  focus?: readonly CompletedFocusRecord[];
  voice?: readonly StageInboxRawItem[];
  ledger?: readonly StageInboxFlowLedgerEntry[];
  journal?: { graphId: string; blocks: JournalTraceSource[] };
  ideas?: GrowingIdea[];
  pendingNoteIds?: string[];
}): ReflectionSnapshot {
  const traces: ReflectionTrace[] = [];
  for (const item of input.focus ?? []) {
    if (dateKeyFromMs(item.endedAt) !== input.date) continue;
    traces.push({
      id: `focus:${item.id}`, at: item.endedAt, label: "专注",
      summary: `${item.title}${item.durationMinutes ? ` · ${item.durationMinutes} 分钟` : ""}`,
      original: item.stopNote ? `${item.title}\n${item.stopNote}` : item.title,
      ...(item.workRef ? { workRef: item.workRef } : {}),
    });
  }
  for (const item of input.voice ?? []) {
    if (item.sourceType !== "ios-shortcut" || dateKeyFromMs(item.createdAt) !== input.date) continue;
    traces.push({ id: `voice:${item.id}`, at: item.createdAt, label: "随口记", summary: summary(item.text), original: item.text });
  }
  for (const item of input.ledger ?? []) {
    if (item.destination !== "sweep-done" || item.undone || dateKeyFromMs(item.at) !== input.date) continue;
    traces.push({ id: `sweep:${item.id}`, at: item.at, label: "清扫", summary: summary(item.text), original: item.text });
  }
  if (input.journal) {
    for (const item of input.journal.blocks) {
      traces.push({
        id: `journal:${item.blockUuid}`, ...(item.at !== undefined ? { at: item.at } : {}),
        label: "日记", summary: summary(item.text), original: item.text,
        workRef: { kind: "logseq", sourceKind: "block", graphId: input.journal.graphId, rootUuid: item.blockUuid },
      });
    }
  }
  traces.sort((left, right) => (left.at ?? -1) - (right.at ?? -1) || left.id.localeCompare(right.id));
  return {
    date: input.date, ...(input.graphId ? { graphId: input.graphId } : {}), journalAvailable: Boolean(input.journal), traces,
    ideas: input.ideas ?? [], pendingNoteIds: input.pendingNoteIds ?? [],
  };
}

export function growIdea(
  existing: GrowingIdea[],
  entry: IdeaEntry & { ideaId?: string },
): GrowingIdea[] {
  if (existing.some(item => item.entries.some(item => item.id === entry.id))) return existing;
  const { ideaId, ...record } = entry;
  if (ideaId) {
    if (!existing.some(item => item.id === ideaId)) throw new Error("找不到这个想法");
    return existing.map(item => item.id === ideaId ? { ...item, entries: [...item.entries, record] } : item);
  }
  return [...existing, { id: record.id, title: summary(record.text), entries: [record] }];
}
