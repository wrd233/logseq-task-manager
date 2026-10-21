import type { SourceSelection, WorkUiContext } from "../../workspace/copilot-ui-port.ts";

/** Module local data only. Context identifies a partition; it never grants file access. */
export type CaptureOrigin = Readonly<{
  block?: SourceSelection;
  material?: { materialId: string; version: string; reference: string };
  sessionId: string | null;
}>;
export type CaptureRevision = Readonly<{
  version: number; text: string; archived: boolean; at: string;
  requestKey: string; restoredFrom?: number;
}>;
export type CaptureRecord = Readonly<{
  id: string; original: string; createdAt: string; origin: CaptureOrigin;
  version: number; text: string; archived: boolean;
  history: readonly CaptureRevision[];
}>;
export type CaptureCommand =
  | { kind: "create"; requestKey: string; text: string; origin: CaptureOrigin }
  | { kind: "edit"; requestKey: string; id: string; expectedVersion: number; text: string }
  | { kind: "archive"; requestKey: string; id: string; expectedVersion: number; archived: boolean }
  | { kind: "restore"; requestKey: string; id: string; expectedVersion: number; restoreVersion: number };
export type CaptureReceipt =
  | { status: "saved"; record: CaptureRecord }
  | { status: "conflict"; record: CaptureRecord | null; problem: string }
  | { status: "unknown" | "partial" | "failed"; problem: string };
export type CaptureDraft = {
  text: string; requestKey: string;
  edit: { id: string; expectedVersion: number; text: string; requestKey: string } | null;
  quote: string;
  captureAttempt: Extract<CaptureCommand, { kind: "create" }> | null;
  editAttempt: Exclude<CaptureCommand, { kind: "create" }> | null;
};
export interface CaptureStore {
  list(context: WorkUiContext): Promise<readonly CaptureRecord[]>;
  execute(context: WorkUiContext, command: CaptureCommand): Promise<CaptureReceipt>;
  readDraft(context: WorkUiContext): Promise<{ version: number; draft: CaptureDraft | null }>;
  saveDraft(context: WorkUiContext, expectedVersion: number, draft: CaptureDraft): Promise<
    { status: "saved"; version: number } | { status: "conflict" | "unknown"; problem: string }
  >;
}
