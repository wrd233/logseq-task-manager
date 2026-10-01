import { canonicalizeGraphContent, stableHash } from "@task-copilot/contracts";
import type { KernelClient } from "@task-copilot/client/browser";
import type { GraphScope } from "./block-identity.ts";

interface ChangedBlock { uuid?: unknown; content?: unknown }
export interface BlockContext { pageName: string | null; content: string }
export interface SourceChangeObserverHost {
  onChanged(callback: (event: { blocks?: readonly ChangedBlock[] }) => void): () => void;
  getBlockContext?(uuid: string): Promise<BlockContext | null>;
  getPageBlocksTree?(pageName: string): Promise<Array<{ uuid: string; content?: string; children?: unknown[] }> | null>;
}

export interface SourceChangeObserverOptions {
  client(): Promise<KernelClient>;
  scope(): GraphScope;
  isCurrent(scope: GraphScope): boolean;
  quietMs?: number;
  isSelfWritten?: (uuid: string) => boolean;
  onError?: (error: unknown) => void;
}

/**
 * Mechanical Graph-change observation only: coalesce substantive block changes,
 * wait for a quiet period, then report a source-change observation for any
 * changed block that is a Formal WorkObject Primary Anchor. Natural work
 * continues whether or not the Kernel is reachable.
 */
export function startSourceChangeObserver(host: SourceChangeObserverHost, options: SourceChangeObserverOptions): () => void {
  const quietMs = options.quietMs ?? 1_200;
  const pending = new Map<string, { content: string; observedAt: number; scope: GraphScope }>();
  let stopped = false;
  let flushing = false;
  const valid = (scope: GraphScope) => !stopped && options.isCurrent(scope);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (stopped || flushing || !pending.size) return;
    flushing = true;
    const changed = new Map(pending);
    pending.clear();
    const scope = changed.values().next().value!.scope;
    try {
      if (!valid(scope)) return;
      const client = await options.client();
      if (!valid(scope)) return;
      const graphId = scope.graphId;
      const index = await client.listObjectAnchorIndex();
      if (!valid(scope)) return;
      const anchors = new Map<string, string>();
      for (const entry of index.objects) {
        const anchor = entry.anchor && typeof entry.anchor === "object" && !Array.isArray(entry.anchor) ? entry.anchor as { externalId?: unknown; graphId?: unknown } : null;
        if (anchor?.graphId === graphId && typeof anchor.externalId === "string" && anchor.externalId.trim()) anchors.set(anchor.externalId, entry.object.id);
      }
      const ancestryCache = new Map<string, Map<string, string | null>>();
      const ancestorOwner = async (uuid: string): Promise<{ workObjectId: string; contextBlockUuid: string } | null> => {
        if (anchors.has(uuid)) return { workObjectId: anchors.get(uuid)!, contextBlockUuid: uuid };
        if (!host.getBlockContext || !host.getPageBlocksTree) return null;
        if (!valid(scope)) return null;
        const context = await host.getBlockContext(uuid);
        if (!valid(scope)) return null;
        if (!context?.pageName) return null;
        let parentByUuid = ancestryCache.get(context.pageName);
        if (!parentByUuid) {
          const built = new Map<string, string | null>();
          const visit = (blocks: Array<{ uuid: string; children?: unknown[] }>, parent: string | null) => {
            for (const block of blocks) {
              built.set(block.uuid, parent);
              if (Array.isArray(block.children)) visit(block.children as Array<{ uuid: string; children?: unknown[] }>, block.uuid);
            }
          };
          const roots = await host.getPageBlocksTree(context.pageName);
          if (!valid(scope)) return null;
          if (roots) visit(roots, null);
          parentByUuid = built;
          ancestryCache.set(context.pageName, built);
        }
        let current: string | null | undefined = uuid;
        while (current) {
          current = parentByUuid.get(current) ?? null;
          if (current && anchors.has(current)) return { workObjectId: anchors.get(current)!, contextBlockUuid: uuid };
        }
        return null;
      };
      for (const [uuid, item] of changed) {
        if (!valid(scope)) return;
        if (item.scope.graphId !== scope.graphId || item.scope.generation !== scope.generation) continue;
        const owner = await ancestorOwner(uuid);
        if (!valid(scope)) return;
        if (!owner || options.isSelfWritten?.(uuid)) continue;
        const canonical = canonicalizeGraphContent(item.content);
        const match = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(canonical);
        if (owner.contextBlockUuid !== uuid) {
          try {
            await client.associateContext({
              workObjectId: owner.workObjectId,
              sourceRef: { graphId, blockUuid: uuid },
              sourceVersionHash: stableHash(canonical),
              origin: "SYSTEM_STRUCTURAL",
            });
          } catch { /* correction may block automatic association; still report the source change for reconciliation */ }
        }
        if (!valid(scope)) return;
        await client.recordSourceChange({
          workObjectId: owner.workObjectId,
          graphId,
          sourceBlockUuid: uuid,
          sourceContentHash: stableHash(canonical),
          ...(match?.[1] ? { sourceMarker: match[1] as "TODO" | "DONE" | "DOING" | "NOW" | "LATER" | "CANCELED" | "CANCELLED" } : {}),
          observedAt: new Date(item.observedAt).toISOString(),
        });
      }
    } catch (error) {
      if (valid(scope)) options.onError?.(error);
    } finally {
      flushing = false;
      if (!stopped && pending.size) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void flush(); }, quietMs);
      }
    }
  };

  const off = host.onChanged((event) => {
    const scope = options.scope();
    if (!valid(scope) || !scope.graphId) return;
    for (const [uuid, item] of pending) if (!valid(item.scope)) pending.delete(uuid);
    for (const block of event.blocks ?? []) {
      if (typeof block.uuid !== "string" || typeof block.content !== "string" || options.isSelfWritten?.(block.uuid)) continue;
      pending.set(block.uuid, { content: block.content, observedAt: Date.now(), scope });
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, quietMs);
  });

  return () => {
    stopped = true;
    off();
    if (timer) clearTimeout(timer);
    pending.clear();
  };
}
