import { BlockIdentityCache, type AnchorIdentityInput, type BlockIdentity } from "./block-context.ts";

export interface GraphScope { readonly graphId: string; readonly generation: number }

/** Only the active Graph is retained. A switch also invalidates in-flight reads. */
export class GraphIdentityState {
  private readonly cache = new BlockIdentityCache();
  private current: GraphScope = { graphId: "", generation: 0 };

  scope(): GraphScope { return { ...this.current }; }
  isCurrent(scope: GraphScope): boolean { return scope.graphId === this.current.graphId && scope.generation === this.current.generation; }
  activate(graphId: string): GraphScope {
    if (graphId !== this.current.graphId) this.invalidateScope(graphId);
    return this.scope();
  }
  invalidateScope(graphId = ""): void {
    this.current = { graphId, generation: this.current.generation + 1 };
    this.cache.replace([]);
  }
  lookup(uuid: string, graphId = this.current.graphId): BlockIdentity {
    return graphId === this.current.graphId ? this.cache.lookup(uuid) : { kind: "ORDINARY" };
  }
  lookupFormal(uuid: string): Extract<BlockIdentity, { kind: "FORMAL" }> | null {
    const identity = this.lookup(uuid);
    return identity.kind === "FORMAL" ? identity : null;
  }
  isStale(uuid: string): boolean { return this.cache.isStale(uuid); }
  setFormal(uuid: string, identity: Extract<BlockIdentity, { kind: "FORMAL" }>, scope: GraphScope): void {
    if (this.isCurrent(scope)) this.cache.setFormal(uuid, identity);
  }
  invalidate(uuid: string, scope: GraphScope): void { if (this.isCurrent(scope)) this.cache.invalidate(uuid); }
  replace(entries: readonly AnchorIdentityInput[], scope: GraphScope): void {
    if (!this.isCurrent(scope)) return;
    this.cache.replace(entries.filter(entry => (entry.anchor as { graphId?: unknown } | null)?.graphId === scope.graphId));
  }
}

export const blockIdentityCache = new GraphIdentityState();

// Presentation only; formal commands always revalidate through the Kernel.
export function lookupBlockIdentity(uuid: string, graphId?: string): BlockIdentity {
  return blockIdentityCache.lookup(uuid, graphId);
}
