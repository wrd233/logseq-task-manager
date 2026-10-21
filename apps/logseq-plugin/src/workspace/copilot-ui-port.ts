import type { WorkObject } from "@task-copilot/domain";
import type { AgentWorkBinding } from "@task-copilot/contracts";
import { sameWorkScope } from "@task-copilot/contracts";
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

/** Identity comparison is an async UI fence, never a host authorization check. */
export function sameWorkUiContext(a: WorkUiContext, b: WorkUiContext): boolean {
  const scope = a.scope === null || b.scope === null
    ? a.scope === b.scope : sameWorkScope(a.scope, b.scope);
  const binding = a.binding === null || b.binding === null
    ? a.binding === b.binding : sameWorkScope(a.binding.scope, b.binding.scope)
      && a.binding.directory === b.binding.directory
      && a.binding.provider === b.binding.provider
      && a.binding.organization === b.binding.organization
      && a.binding.workspaceId === b.binding.workspaceId;
  const work = a.workObject === null || b.workObject === null
    ? a.workObject === b.workObject
    : a.workObject.id === b.workObject.id && a.workObject.version === b.workObject.version;
  return scope && binding && work && a.sessionId === b.sessionId && a.generation === b.generation;
}

/**
 * Capture synchronously inside the user's interaction. The host supplies current
 * context and the authoritative source opener; this adapter neither changes a
 * binding nor requests any grant. It has no dependency on either feature module.
 */
export function createSharedUiPort<Span>(options: {
  readContext(): WorkUiContext | null;
  nativeInput?: { captureInsertion(): Span; insertText(text: string, span: Span): boolean };
  returnTarget?: Pick<HTMLElement, "isConnected" | "focus"> | null;
  openSource?(source: SourceSelection, context: WorkUiContext): Promise<void>;
}): SharedUiPort {
  const { readContext, nativeInput, returnTarget, openSource } = options;
  const initial = readContext();
  if (!initial) throw new Error("WORK_UI_UNAVAILABLE");
  const expected = structuredClone(initial);
  // A detached host must never look current to a module retaining this port.
  const detached: WorkUiContext = {
    scope: null, binding: null, workObject: null, sessionId: null,
    generation: expected.generation === Number.MAX_SAFE_INTEGER ? 0 : expected.generation + 1,
  };
  let span: Span | undefined, captured = false, attempted = false;
  try {
    if (nativeInput) { span = nativeInput.captureInsertion(); captured = true; }
  } catch { /* Source navigation and return remain usable without a native draft. */ }
  const current = (): WorkUiContext | null => {
    try { const value = readContext(); return value ? structuredClone(value) : null; }
    catch { return null; }
  };
  const valid = (context: WorkUiContext): boolean => {
    try {
      const value = current();
      return value !== null && sameWorkUiContext(expected, context) && sameWorkUiContext(expected, value);
    } catch { return false; }
  };
  return {
    context: () => current() ?? structuredClone(detached),
    openSource: async (source, context) => {
      if (!valid(context)) throw new Error("WORK_UI_STALE");
      if (!openSource) throw new Error("WORK_UI_SOURCE_UNAVAILABLE");
      // The host opener must validate source ownership/version and recheck the
      // supplied context at its final navigation boundary after any awaits.
      await openSource(structuredClone(source), structuredClone(expected));
    },
    insertDraft: async (text, context) => {
      if (!valid(context)) return "stale";
      if (!captured || !nativeInput || typeof text !== "string" || text.length > 1_000_000) return "unavailable";
      if (attempted) return "busy";
      attempted = true;
      try { return nativeInput.insertText(text, span as Span) ? "inserted" : "busy"; }
      catch { return "unavailable"; }
    },
    returnFocus: context => {
      if (valid(context) && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    },
  };
}
