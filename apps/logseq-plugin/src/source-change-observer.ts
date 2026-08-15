import { canonicalizeGraphContent, stableHash } from "@task-copilot/contracts";
import type { KernelClient } from "@task-copilot/client/browser";
import { graphIdentity } from "./graph-adapter.ts";

interface ChangedBlock { uuid?: unknown; content?: unknown }
export interface SourceChangeObserverHost {
  onChanged(callback: (event: { blocks?: readonly ChangedBlock[] }) => void): () => void;
  getCurrentGraph(): Promise<unknown>;
}

export interface SourceChangeObserverOptions {
  client(): Promise<KernelClient>;
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
  const pending = new Map<string, { content: string; observedAt: number }>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (!pending.size) return;
    const changed = new Map(pending);
    pending.clear();
    try {
      const client = await options.client();
      const graphId = graphIdentity(await host.getCurrentGraph());
      const index = await client.listObjectAnchorIndex();
      const anchors = new Map<string, string>();
      for (const entry of index.objects) {
        const anchor = entry.anchor && typeof entry.anchor === "object" && !Array.isArray(entry.anchor) ? entry.anchor as { externalId?: unknown } : null;
        if (typeof anchor?.externalId === "string" && anchor.externalId.trim()) anchors.set(anchor.externalId, entry.object.id);
      }
      for (const [uuid, item] of changed) {
        if (!anchors.has(uuid) || options.isSelfWritten?.(uuid)) continue;
        const canonical = canonicalizeGraphContent(item.content);
        const match = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(canonical);
        await client.recordSourceChange({
          workObjectId: anchors.get(uuid)!,
          graphId,
          sourceBlockUuid: uuid,
          sourceContentHash: stableHash(canonical),
          ...(match?.[1] ? { sourceMarker: match[1] as "TODO" | "DONE" | "DOING" | "NOW" | "LATER" | "CANCELED" | "CANCELLED" } : {}),
          observedAt: new Date(item.observedAt).toISOString(),
        });
      }
    } catch (error) {
      options.onError?.(error);
    }
  };

  const off = host.onChanged((event) => {
    for (const block of event.blocks ?? []) {
      if (typeof block.uuid !== "string" || typeof block.content !== "string") continue;
      pending.set(block.uuid, { content: block.content, observedAt: Date.now() });
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, quietMs);
  });

  return () => {
    off();
    if (timer) clearTimeout(timer);
    pending.clear();
  };
}
