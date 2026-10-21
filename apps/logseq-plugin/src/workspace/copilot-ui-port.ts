import type { WorkObject } from "@task-copilot/domain";
import type { AgentWorkBinding } from "@task-copilot/contracts";
import type { StageHistory } from "../features/stage-workbench/protocol.ts";
import type { BlockSnapshot, SourceScope } from "./source-protocol.ts";

/** UI identity snapshot only. This is neither a read grant nor a Formal capability. */
export type WorkUiContext = Readonly<{
  scope: SourceScope | null;
  binding: AgentWorkBinding | null;
  workObject: Pick<WorkObject, "id" | "version"> | null;
  sessionId: string | null;
  generation: number;
}>;

/** Existing Logseq block identity; files, materials and sessions keep their own references. */
export type SourceSelection = Readonly<
  Pick<BlockSnapshot, "sourceId" | "target" | "contentVersion">
>;

/**
 * Host adapters belong to the integration owner. Create a port for the originating
 * interaction and preserve its native insertion span before any async work.
 * Recheck session, scope, binding and generation before acting; never replace or
 * submit the native draft. Modules keep their own scroll and selection state.
 */
export interface SharedUiPort {
  context(): WorkUiContext;
  openSource(source: SourceSelection, context: WorkUiContext): Promise<void>;
  insertDraft(
    text: string,
    context: WorkUiContext,
  ): Promise<"inserted" | "busy" | "stale" | "unavailable">;
  returnFocus(context: WorkUiContext): void;
}

/** Verified existing history only; never authorize, refresh or record to fill gaps. */
export interface StageHistoryPort {
  read(context: WorkUiContext): Promise<StageHistory>;
}
