import type { ApplyResult, SourceScope, SourceSnapshot } from "../content-writeback/protocol.ts";

export type StageFile = {
  id: string; title: string; path: string; role: string; availability: "available" | "unavailable";
  version: string | null; content: string | null; size: number | null; hash: string | null;
  editing: {user: boolean; agent: boolean}; problem: string | null;
  retention: "text-snapshot" | "record-only";
};
export type StageStart = {
  id: string; scope: SourceScope; goal: string; at: string; source: SourceSnapshot; files: StageFile[];
  previousStageId: string | null; previousRevisionId: string | null;
};
export type StageRevision = {
  id: string; parent: string; at: string; source: SourceSnapshot; files: StageFile[];
  facts: ApplyResult[]; fingerprint: string; requestKey: string;
  inputDigest: string;
  correctionOf: {stageId: string; revisionId: string; sourceId: string} | null;
};
export type StageAcceptance = {
  id: string; revisionId: string; revisionHash: string; at: string;
  origin: {kind: "local-user-command"; command: "stage-accept"};
};
export type StageEvent = {
  schemaVersion: 1; id: string; scope: SourceScope; stageId: string;
} & (
  | {kind: "begin"; start: StageStart; expectedStageId: string | null; focusParent: string | null}
  | {kind: "select"; focusParent: string | null}
  | {kind: "revision"; revision: StageRevision}
  | {kind: "acceptance"; acceptance: StageAcceptance}
  | {kind: "candidate"; revision: StageRevision; reason: string}
);
export type Stage = {
  start: StageStart; revisions: StageRevision[]; acceptances: StageAcceptance[];
  candidates: StageRevision[]; problems: string[];
};
export type StageHistory = {stages: Stage[]; current: string | null; currentEventId: string | null; problems: string[]};
export interface StageStorage {
  getItem(key: string): Promise<unknown>; setItem(key: string, text: string): Promise<void>; allKeys(): Promise<unknown>;
}
export interface StageSources {
  scope(): SourceScope | null;
  lifetime?(): unknown;
  read(): Promise<SourceSnapshot>;
  result(requestId: string): Promise<ApplyResult | null>;
  history(): Promise<ApplyResult[]>;
  file(id: string): Promise<StageFile>;
}
