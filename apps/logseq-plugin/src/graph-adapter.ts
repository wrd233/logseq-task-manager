import { stableHash, type GraphAdapter, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type ManagedProjection } from "@task-copilot/contracts";

export interface LogseqGraphHost {
  getBlock(uuid: string, options?: { includeChildren: boolean }): Promise<unknown>;
  insertBlock(target: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown>;
  updateBlock(uuid: string, content: string): Promise<unknown>;
  removeBlock(uuid: string): Promise<unknown>;
}

interface Block { uuid: string; content: string; children: Block[] }
const containerContent = "> [Task Copilot]\ntask-copilot-managed:: true";

function semanticContent(content: string): string {
  return content.split("\n").filter((line) => !/^\s*id::\s+[0-9a-f-]+\s*$/iu.test(line)).join("\n").trimEnd();
}

function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function block(value: unknown): Block | null {
  let candidate = object(value);
  if (!candidate && Array.isArray(value)) candidate = object(value.find((item) => object(item)?.uuid));
  if (!candidate || typeof candidate.uuid !== "string" || typeof candidate.content !== "string") return null;
  return { uuid: candidate.uuid, content: semanticContent(candidate.content), children: Array.isArray(candidate.children) ? candidate.children.map(block).filter((item): item is Block => item !== null) : [] };
}

function engagement(value: string): ManagedProjection["engagement"] {
  if (value === "ACTIONABLE" || value === "WAITING" || value === "PARKED") return value;
  if (value === "null") return null;
  throw new Error("GRAPH_PROJECTION_STATE_INVALID");
}

function projectionFromContainer(container: Block): ManagedProjection {
  const title = container.children.find((child) => child.content.startsWith("标题："));
  const state = container.children.find((child) => child.content.startsWith("状态："));
  if (!title || !state) throw new Error("GRAPH_PROJECTION_INCOMPLETE");
  const match = /^状态：(OPEN|COMPLETED|CANCELLED) · (ACTIONABLE|WAITING|PARKED|null)$/u.exec(state.content);
  if (!match) throw new Error("GRAPH_PROJECTION_STATE_INVALID");
  const core = { containerUuid: container.uuid, titleUuid: title.uuid, stateUuid: state.uuid, title: title.content.slice(3), lifecycle: match[1] as ManagedProjection["lifecycle"], engagement: engagement(match[2]!) };
  const ownedExactly = container.content === containerContent && container.children.length === 2;
  return { ...core, projectionHash: ownedExactly ? stableHash(core) : stableHash({ core, actual: container }) };
}

export class LogseqGraphAdapter implements GraphAdapter {
  readonly #host: LogseqGraphHost;
  readonly #graphId: string;
  readonly #now: () => string;
  constructor(host: LogseqGraphHost, graphId: string, now: () => string = () => new Date().toISOString()) { this.#host = host; this.#graphId = graphId; this.#now = now; }

  async #required(uuid: string, includeChildren: boolean): Promise<Block> {
    const value = block(await this.#host.getBlock(uuid, { includeChildren }));
    if (!value) throw new Error(`LOGSEQ_BLOCK_NOT_FOUND:${uuid}`);
    return value;
  }

  async readGraphSnapshot(input: { graphId: string; sourceBlockUuid: string }): Promise<GraphSnapshot> {
    if (input.graphId !== this.#graphId) throw new Error("GRAPH_ID_MISMATCH");
    const source = await this.#required(input.sourceBlockUuid, true);
    const managedRef = source.children.find((child) => child.content.includes("task-copilot-managed:: true"));
    const managed = managedRef ? await this.#required(managedRef.uuid, true) : null;
    return { graphId: this.#graphId, sourceBlockUuid: source.uuid, sourceContentHash: stableHash(source.content), projection: managed ? projectionFromContainer(managed) : null };
  }

  async #ensureBlock(target: string, uuid: string, content: string, options: { sibling: boolean; before?: boolean }): Promise<void> {
    const existing = block(await this.#host.getBlock(uuid, { includeChildren: false }));
    if (existing) {
      if (existing.content !== content) throw new Error(`GRAPH_MANAGED_BLOCK_CHANGED:${uuid}`);
      return;
    }
    const created = block(await this.#host.insertBlock(target, content, { ...options, customUUID: uuid }));
    if (!created || created.uuid !== uuid) throw new Error(`GRAPH_CUSTOM_UUID_UNVERIFIED:${uuid}`);
  }

  async applyGraphEffect(effect: GraphEffect): Promise<GraphApplyResult> {
    if (effect.graphId !== this.#graphId) throw new Error("GRAPH_ID_MISMATCH");
    if (effect.type === "UPSERT_MANAGED_PROJECTION") {
      const projection = effect.projection;
      await this.#ensureBlock(effect.sourceBlockUuid, projection.containerUuid, containerContent, { sibling: false });
      await this.#ensureBlock(projection.containerUuid, projection.titleUuid, `标题：${projection.title}`, { sibling: false, before: true });
      await this.#ensureBlock(projection.titleUuid, projection.stateUuid, `状态：${projection.lifecycle} · ${projection.engagement ?? "null"}`, { sibling: true });
    } else if (effect.type === "UPDATE_MANAGED_FIELD") {
      const before = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (!before.projection || before.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_UPDATE_PRECONDITION_FAILED");
      const existing = await this.#required(effect.fieldUuid, false);
      if (!existing.content.startsWith("标题：")) throw new Error("GRAPH_MANAGED_FIELD_CHANGED");
      await this.#host.updateBlock(effect.fieldUuid, effect.content);
    } else {
      const before = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (!before.projection || before.projection.containerUuid !== effect.containerUuid || before.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_REMOVE_PRECONDITION_FAILED");
      await this.#host.removeBlock(effect.containerUuid);
    }
    const actual = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
    const expectedHash = effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection.projectionHash : effect.type === "UPDATE_MANAGED_FIELD" ? effect.resultingProjectionHash : null;
    if ((actual.projection?.projectionHash ?? null) !== expectedHash) throw new Error("GRAPH_EFFECT_VERIFY_FAILED");
    return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: expectedHash, appliedAt: this.#now() };
  }
}

export function graphIdentity(value: unknown): string {
  const candidate = object(value);
  if (!candidate) throw new Error("LOGSEQ_GRAPH_SHAPE_UNSUPPORTED");
  return `${typeof candidate.name === "string" ? candidate.name : "unknown-graph"}:${typeof candidate.url === "string" ? candidate.url : "unknown-location"}`;
}

export function logseqBlock(value: unknown): { uuid: string; content: string } | null {
  const candidate = block(value); return candidate ? { uuid: candidate.uuid, content: candidate.content } : null;
}
