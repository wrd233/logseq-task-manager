import { canonicalizeGraphContent } from "@task-copilot/contracts";

export interface SourceIdentityHost {
  getBlock(uuid: string): Promise<unknown>;
  upsertBlockProperty(uuid: string, key: string, value: unknown): Promise<void>;
}

export interface GraphModeHost {
  checkCurrentIsDbGraph?: () => Promise<unknown>;
  getCurrentGraph(): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function content(value: Record<string, unknown>): string | null {
  return typeof value.title === "string" ? value.title : typeof value.content === "string" ? value.content : null;
}

/**
 * `checkCurrentIsDbGraph` was added to the SDK before every supported Desktop
 * host shipped it.  File graphs still expose an absolute filesystem `path`, so
 * older hosts can be identified without querying private application state.
 * Unknown shapes fail closed instead of risking a textual id write in a DB
 * graph.
 */
export async function currentGraphIsDb(host: GraphModeHost): Promise<boolean> {
  if (typeof host.checkCurrentIsDbGraph === "function") {
    try { return Boolean(await host.checkCurrentIsDbGraph()); }
    catch (error) {
      // Older Logseq RPC proxies synthesize a callable property even when the
      // host method is absent. Only that explicit capability error may fall
      // back; every real checker failure remains fail-closed.
      if (!(error instanceof Error) || !/Not existed method #checkCurrentIsDbGraph/u.test(error.message)) throw error;
    }
  }
  const graph = record(await host.getCurrentGraph());
  const path = graph?.path;
  if (typeof path === "string" && (/^\//u.test(path) || /^[A-Za-z]:[\\/]/u.test(path))) return false;
  throw new Error("LOGSEQ_GRAPH_MODE_UNAVAILABLE");
}

/**
 * File-graph UUIDs are regenerated when a block has no persisted `id::` line.
 * Persist Logseq's native id property before creating a PrimaryAnchor. DB-graph
 * block UUIDs are already durable and need no text/property mutation.
 */
export async function ensurePersistentSourceIdentity(host: SourceIdentityHost, input: { uuid: string; content: string; isDbGraph: boolean }): Promise<{ uuid: string; content: string }> {
  const before = canonicalizeGraphContent(input.content);
  if (!input.isDbGraph) await host.upsertBlockProperty(input.uuid, "id", input.uuid);
  const stored = record(await host.getBlock(input.uuid));
  const storedContent = stored ? content(stored) : null;
  if (!stored || stored.uuid !== input.uuid || storedContent === null || canonicalizeGraphContent(storedContent) !== before) throw new Error("LOGSEQ_SOURCE_IDENTITY_VERIFY_FAILED");
  if (!input.isDbGraph) {
    const properties = record(stored.properties);
    if (properties?.id !== input.uuid) throw new Error("LOGSEQ_SOURCE_IDENTITY_NOT_PERSISTED");
  }
  return { uuid: input.uuid, content: before };
}
