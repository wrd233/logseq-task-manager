export type BlockIdentityKind = "ORDINARY" | "FORMAL";
export type BlockContextObjectKind = "TASK" | "MINI_PROJECT" | "PROJECT";

export type BlockIdentity =
  | { kind: "ORDINARY" }
  | { kind: "FORMAL"; workObjectId: string; objectKind: BlockContextObjectKind; title?: string; engagement?: string; lifecycle?: string };

export type BlockContextActionId =
  | "FORMALIZE_TASK"
  | "FORMALIZE_MINI_PROJECT"
  | "OPEN_OBJECT"
  | "DISCUSS_OBJECT"
  | "RECONCILE_OBJECT";

export interface AnchorIdentityInput {
  object: { id?: unknown; kind?: unknown; title?: unknown; engagement?: unknown; lifecycle?: unknown };
  anchor?: unknown;
}

export const CONTEXT_ACTION_LABELS: Record<BlockContextActionId, string> = {
  FORMALIZE_TASK: "Task Copilot：纳入为 Task",
  FORMALIZE_MINI_PROJECT: "Task Copilot：纳入为 MiniProject",
  OPEN_OBJECT: "Task Copilot：打开事项",
  DISCUSS_OBJECT: "Task Copilot：和 Agent 讨论",
  RECONCILE_OBJECT: "Task Copilot：重新理解这条记录",
};

export function normalizeObjectKind(value: unknown): BlockContextObjectKind | null {
  return value === "TASK" || value === "MINI_PROJECT" || value === "PROJECT" ? value : null;
}

export function buildBlockIdentityIndex(entries: readonly AnchorIdentityInput[]): Map<string, BlockIdentity> {
  const index = new Map<string, BlockIdentity>();
  for (const entry of entries) {
    const anchor = entry.anchor as { externalId?: unknown } | null | undefined;
    const externalId = anchor?.externalId;
    const workObjectId = entry.object?.id;
    const objectKind = normalizeObjectKind(entry.object?.kind);
    if (typeof externalId !== "string" || !externalId || typeof workObjectId !== "string" || !workObjectId || !objectKind) continue;
    const identity: Extract<BlockIdentity, { kind: "FORMAL" }> = { kind: "FORMAL", workObjectId, objectKind };
    if (typeof entry.object?.title === "string") identity.title = entry.object.title;
    if (typeof entry.object?.engagement === "string") identity.engagement = entry.object.engagement;
    if (typeof entry.object?.lifecycle === "string") identity.lifecycle = entry.object.lifecycle;
    index.set(externalId, identity);
  }
  return index;
}

export function contextActionsFor(identity: BlockIdentity): BlockContextActionId[] {
  if (identity.kind === "ORDINARY") return ["FORMALIZE_TASK", "FORMALIZE_MINI_PROJECT"];
  return identity.objectKind === "PROJECT" ? ["OPEN_OBJECT", "DISCUSS_OBJECT"] : ["OPEN_OBJECT", "DISCUSS_OBJECT", "RECONCILE_OBJECT"];
}

export const DEFAULT_BLOCK_CONTEXT_STALENESS_MS = 60_000;

export class BlockIdentityCache {
  readonly #entries = new Map<string, BlockIdentity>();
  readonly #observedAt = new Map<string, number>();
  #revision = 0;

  get revision(): number { return this.#revision; }

  lookup(uuid: string): BlockIdentity {
    return this.#entries.get(uuid) ?? { kind: "ORDINARY" };
  }

  lookupFormal(uuid: string): Extract<BlockIdentity, { kind: "FORMAL" }> | null {
    const identity = this.lookup(uuid);
    return identity.kind === "FORMAL" ? identity : null;
  }

  setFormal(uuid: string, identity: Extract<BlockIdentity, { kind: "FORMAL" }>, at = Date.now()): void {
    this.#entries.set(uuid, identity);
    this.#observedAt.set(uuid, at);
    this.#revision += 1;
  }

  invalidate(uuid: string): void {
    if (this.#entries.delete(uuid)) this.#revision += 1;
    this.#observedAt.delete(uuid);
  }

  replace(entries: readonly AnchorIdentityInput[], at = Date.now()): void {
    const next = buildBlockIdentityIndex(entries);
    for (const uuid of this.#entries.keys()) if (!next.has(uuid)) this.#entries.delete(uuid);
    for (const [uuid, identity] of next) { this.#entries.set(uuid, identity); this.#observedAt.set(uuid, at); }
    this.#revision += 1;
  }

  isStale(uuid: string, at = Date.now(), ttlMs = DEFAULT_BLOCK_CONTEXT_STALENESS_MS): boolean {
    if (!this.#entries.has(uuid)) return true;
    const observedAt = this.#observedAt.get(uuid);
    return typeof observedAt !== "number" || at - observedAt > ttlMs;
  }

  size(): number { return this.#entries.size; }
}
