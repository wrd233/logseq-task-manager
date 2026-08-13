import { canonicalizeGraphContent, graphEvidenceProofPayload, stableHash, type AddReferenceCuration, type GraphAdapter, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type GraphSnapshotInput, type ManagedProjection, type NaturalCurationSnapshot, type TrustedGraphEvidenceMaterial } from "@task-copilot/contracts";

import { logseqBlock as normalizeLogseqBlock, readProjectionByIdentity, type LogseqBlock } from "./projection-reader.ts";
import { matchesPresentedValue, renderProjection, reviewFieldUuid, type ProjectionBlockIntent } from "./projection-renderer.ts";
import { readManagedFieldValue } from "./writing-convention.ts";

export interface LogseqGraphHost {
  getBlock(uuid: string, options?: { includeChildren: boolean }): Promise<unknown>;
  insertBlock(target: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown>;
  updateBlock(uuid: string, content: string): Promise<unknown>;
  removeBlock(uuid: string): Promise<unknown>;
}

interface ProjectionInspection {
  source: LogseqBlock;
  blocks: Map<string, LogseqBlock>;
  snapshot: GraphSnapshot;
  mode: "CURRENT" | "LEGACY" | "CONFLICT";
}

type PresentSourceMarker = Exclude<GraphSnapshot["sourceMarker"], undefined>;

function sourceMarker(content: string): PresentSourceMarker {
  return (/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(content)?.[1] ?? null) as PresentSourceMarker;
}

function semanticCore(projection: ManagedProjection): Omit<ManagedProjection, "projectionHash"> {
  const core: Partial<ManagedProjection> = { ...projection };
  delete core.projectionHash;
  return core as Omit<ManagedProjection, "projectionHash">;
}

function withHash(core: Omit<ManagedProjection, "projectionHash">, requestedHash?: string): ManagedProjection {
  const value = { ...core, projectionHash: stableHash(core) };
  if (requestedHash && requestedHash !== value.projectionHash) throw new Error("GRAPH_EFFECT_PROJECTION_HASH_INVALID");
  return value;
}

function emptyPresentation(projection: ManagedProjection): ManagedProjection {
  const core = { ...semanticCore(projection), lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [] };
  const withoutClosure: Partial<Omit<ManagedProjection, "projectionHash">> = { ...core };
  delete withoutClosure.closure;
  return withHash(withoutClosure as Omit<ManagedProjection, "projectionHash">);
}

function changedProjection(effect: Exclude<GraphEffect, { type: "UPSERT_MANAGED_PROJECTION" | "REMOVE_MANAGED_PROJECTION" }>, before: ManagedProjection): ManagedProjection {
  if (effect.resultingProjection) return effect.resultingProjection;
  const core = semanticCore(before);
  if (effect.type === "UPDATE_MANAGED_FIELD") return withHash({ ...core, title: effect.content.replace(/^标题：/u, "") }, effect.resultingProjectionHash);
  if (effect.type === "SET_CURRENT_FOCUS_FIELD") return withHash({ ...core, currentFocus: effect.content }, effect.resultingProjectionHash);
  if (effect.type === "UPDATE_WORK_INTENT_FIELDS") return withHash({ ...core, desiredOutcome: effect.desiredOutcome, completionChecks: effect.completionChecks }, effect.resultingProjectionHash);
  if (effect.type === "CHANGE_ENGAGEMENT_FIELDS") return withHash({ ...core, lifecycle: "OPEN", engagement: effect.engagement, waitingCondition: effect.waiting }, effect.resultingProjectionHash);
  if (effect.type !== "CHANGE_CLOSURE_FIELDS") throw new Error("GRAPH_EFFECT_TYPE_UNSUPPORTED");
  const closureCore = { ...core, lifecycle: effect.lifecycle, engagement: effect.engagement, waitingCondition: effect.waitingCondition, currentFocus: effect.currentFocus };
  if (effect.closure) return withHash({ ...closureCore, closure: effect.closure }, effect.resultingProjectionHash);
  const withoutClosure: Partial<Omit<ManagedProjection, "projectionHash">> = { ...closureCore };
  delete withoutClosure.closure;
  return withHash(withoutClosure as Omit<ManagedProjection, "projectionHash">, effect.resultingProjectionHash);
}

function expectedProjection(effect: Exclude<GraphEffect, { type: "UPSERT_MANAGED_PROJECTION" }>, cached: ManagedProjection | undefined): ManagedProjection {
  if (effect.expectedProjection) return effect.expectedProjection;
  if (cached && cached.projectionHash === effect.expectedProjectionHash) return cached;
  throw new Error("GRAPH_EXPECTED_PROJECTION_REQUIRED");
}

function preconditionError(effect: GraphEffect): string {
  if (effect.type === "UPDATE_MANAGED_FIELD") return "GRAPH_UPDATE_PRECONDITION_FAILED";
  if (effect.type === "SET_CURRENT_FOCUS_FIELD") return "GRAPH_FOCUS_PRECONDITION_FAILED";
  if (effect.type === "UPDATE_WORK_INTENT_FIELDS") return "GRAPH_WORK_INTENT_PRECONDITION_FAILED";
  if (effect.type === "CHANGE_ENGAGEMENT_FIELDS") return "GRAPH_ENGAGEMENT_PRECONDITION_FAILED";
  if (effect.type === "CHANGE_CLOSURE_FIELDS") return "GRAPH_CLOSURE_PRECONDITION_FAILED";
  if (effect.type === "REMOVE_MANAGED_PROJECTION") return "GRAPH_REMOVE_PRECONDITION_FAILED";
  return "GRAPH_EXPECTED_ABSENT";
}

export class LogseqGraphAdapter implements GraphAdapter {
  readonly #host: LogseqGraphHost;
  readonly #graphId: string;
  readonly #now: () => string;
  readonly #known = new Map<string, ManagedProjection>();

  constructor(host: LogseqGraphHost, graphId: string, now: () => string = () => new Date().toISOString()) {
    this.#host = host;
    this.#graphId = graphId;
    this.#now = now;
  }

  async #required(uuid: string, includeChildren: boolean): Promise<LogseqBlock> {
    const value = normalizeLogseqBlock(await this.#host.getBlock(uuid, { includeChildren }));
    if (!value) throw new Error(`LOGSEQ_BLOCK_NOT_FOUND:${uuid}`);
    return value;
  }

  async #optional(uuid: string, includeChildren = false): Promise<LogseqBlock | null> {
    return normalizeLogseqBlock(await this.#host.getBlock(uuid, { includeChildren }));
  }

  #assertGraph(graphId: string): void {
    if (graphId !== this.#graphId) throw new Error("GRAPH_ID_MISMATCH");
  }

  async #inspect(sourceBlockUuid: string, expected: ManagedProjection): Promise<ProjectionInspection> {
    const source = await this.#required(sourceBlockUuid, true);
    const uuids = [expected.containerUuid, expected.titleUuid, expected.stateUuid, expected.focusUuid, expected.waitingUuid, expected.outcomeUuid, expected.completionUuid, reviewFieldUuid(expected.waitingUuid)];
    const entries = await Promise.all(uuids.map(async (uuid) => [uuid, await this.#optional(uuid, true)] as const));
    const blocks = new Map(entries.filter((entry): entry is readonly [string, LogseqBlock] => entry[1] !== null));
    const read = readProjectionByIdentity(source, blocks, expected);
    return {
      source,
      blocks,
      mode: read.mode,
      snapshot: {
        graphId: this.#graphId,
        sourceBlockUuid: source.uuid,
        sourceContentHash: stableHash(source.content),
        sourceMarker: sourceMarker(source.content),
        projection: read.projection,
      },
    };
  }

  async readGraphSnapshot(input: GraphSnapshotInput): Promise<GraphSnapshot> {
    this.#assertGraph(input.graphId);
    const expected = input.expectedProjection ?? this.#known.get(input.sourceBlockUuid);
    if (expected) {
      this.#known.set(input.sourceBlockUuid, expected);
      return (await this.#inspect(input.sourceBlockUuid, expected)).snapshot;
    }
    const source = await this.#required(input.sourceBlockUuid, true);
    if (source.children.some((child) => child.content.includes("task-copilot-managed:: true"))) throw new Error("GRAPH_EXPECTED_PROJECTION_REQUIRED");
    return { graphId: this.#graphId, sourceBlockUuid: source.uuid, sourceContentHash: stableHash(source.content), sourceMarker: sourceMarker(source.content), projection: null };
  }

  /** Recovery-only readback: prove every registered projection UUID is absent. */
  async readRemovedProjectionSnapshot(input: { graphId: string; sourceBlockUuid: string; expectedProjection: ManagedProjection }): Promise<GraphSnapshot> {
    this.#assertGraph(input.graphId);
    return this.#settledRemoved(input.sourceBlockUuid, input.expectedProjection);
  }

  async readEvidenceMaterial(input: { graphId: string; blockUuid: string }, proofKey: string): Promise<TrustedGraphEvidenceMaterial> {
    this.#assertGraph(input.graphId);
    const source = await this.#required(input.blockUuid, false);
    const material = { graphId: this.#graphId, blockUuid: source.uuid, content: source.content, sourceContentHash: stableHash(source.content) };
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(proofKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const proof = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(graphEvidenceProofPayload(material))))).map((value) => value.toString(16).padStart(2, "0")).join("");
    return { ...material, proof };
  }

  async readNaturalCurationSnapshot(input: { graphId: string; rootBlockUuid: string }): Promise<NaturalCurationSnapshot> {
    this.#assertGraph(input.graphId);
    const root = await this.#required(input.rootBlockUuid, true);
    const directChildren = root.children.map((child) => ({ blockUuid: child.uuid, content: child.content, contentHash: stableHash(child.content) }));
    return { graphId: this.#graphId, rootBlockUuid: root.uuid, rootContentHash: stableHash(root.content), rootTopologyHash: stableHash(directChildren.map((child) => [child.blockUuid, child.contentHash])), directChildren };
  }

  async applyAddReferenceCuration(curation: AddReferenceCuration): Promise<{ snapshot: NaturalCurationSnapshot; createdBlockUuids: readonly string[] }> {
    this.#assertGraph(curation.graphId);
    const before = await this.readNaturalCurationSnapshot({ graphId: curation.graphId, rootBlockUuid: curation.rootBlockUuid });
    if (before.rootContentHash !== curation.expectedRootContentHash || before.rootTopologyHash !== curation.expectedRootTopologyHash) throw new Error("GRAPH_CURATION_PRECONDITION_FAILED");
    if (await this.#optional(curation.newReferenceUuid) || (curation.existingSectionUuid === null && await this.#optional(curation.newSectionUuid))) throw new Error("GRAPH_CURATION_UUID_CONFLICT");
    await this.#required(curation.referenceBlockUuid, false);
    const heading = `**[${curation.section}]**`;
    let sectionUuid = curation.existingSectionUuid;
    const created: string[] = [];
    if (sectionUuid) {
      const section = await this.#required(sectionUuid, true);
      if (!before.directChildren.some((child) => child.blockUuid === sectionUuid) || canonicalizeGraphContent(section.content) !== heading) throw new Error("GRAPH_CURATION_SECTION_CONFLICT");
      if (section.children.some((child) => canonicalizeGraphContent(child.content) === `((${curation.referenceBlockUuid}))`)) throw new Error("GRAPH_CURATION_REFERENCE_EXISTS");
    } else {
      if (before.directChildren.some((child) => canonicalizeGraphContent(child.content) === heading)) throw new Error("GRAPH_CURATION_SECTION_ID_REQUIRED");
      const inserted = normalizeLogseqBlock(await this.#host.insertBlock(curation.rootBlockUuid, heading, { sibling: false, customUUID: curation.newSectionUuid }));
      if (!inserted || inserted.uuid !== curation.newSectionUuid) throw new Error("GRAPH_CUSTOM_UUID_UNVERIFIED");
      sectionUuid = inserted.uuid; created.push(inserted.uuid);
    }
    const reference = normalizeLogseqBlock(await this.#host.insertBlock(sectionUuid, `((${curation.referenceBlockUuid}))`, { sibling: false, customUUID: curation.newReferenceUuid }));
    if (!reference || reference.uuid !== curation.newReferenceUuid) throw new Error("GRAPH_CUSTOM_UUID_UNVERIFIED");
    created.push(reference.uuid);
    const section = await this.#required(sectionUuid, true);
    if (!section.children.some((child) => child.uuid === curation.newReferenceUuid && canonicalizeGraphContent(child.content) === `((${curation.referenceBlockUuid}))`)) throw new Error("GRAPH_CURATION_VERIFY_MISMATCH");
    const after = await this.readNaturalCurationSnapshot({ graphId: curation.graphId, rootBlockUuid: curation.rootBlockUuid });
    if (after.rootContentHash !== before.rootContentHash) throw new Error("GRAPH_CURATION_VERIFY_MISMATCH");
    return { snapshot: after, createdBlockUuids: created };
  }

  async #insertIntent(sourceUuid: string, intent: ProjectionBlockIntent, previousUuid: string | null): Promise<void> {
    const created = normalizeLogseqBlock(await this.#host.insertBlock(previousUuid ?? sourceUuid, intent.content, previousUuid
      ? { sibling: true, customUUID: intent.uuid }
      : { sibling: false, before: true, customUUID: intent.uuid }));
    if (!created || created.uuid !== intent.uuid) throw new Error(`GRAPH_CUSTOM_UUID_UNVERIFIED:${intent.uuid}`);
  }

  async #freshUnchanged(block: LogseqBlock): Promise<LogseqBlock> {
    const fresh = await this.#required(block.uuid, true);
    if (stableHash(fresh) !== stableHash(block)) throw new Error(`GRAPH_MANAGED_BLOCK_CHANGED:${block.uuid}`);
    return fresh;
  }

  #transitionSafe(inspection: ProjectionInspection, before: ManagedProjection, after: ManagedProjection, allowTopologyLag = false): boolean {
    if (inspection.mode === "LEGACY") return true;
    if (inspection.blocks.has(before.containerUuid) || inspection.blocks.has(before.titleUuid)) return false;
    const direct = new Set(inspection.source.children.map((child) => child.uuid));
    const beforeByUuid = new Map(renderProjection(before).map((intent) => [intent.uuid, intent]));
    const afterByUuid = new Map(renderProjection(after).map((intent) => [intent.uuid, intent]));
    const uuids = new Set([...beforeByUuid.keys(), ...afterByUuid.keys(), before.stateUuid, before.focusUuid, before.waitingUuid, before.outcomeUuid, before.completionUuid, reviewFieldUuid(before.waitingUuid)]);
    return [...uuids].every((uuid) => {
      const block = inspection.blocks.get(uuid);
      if (!block) return !beforeByUuid.has(uuid) || !afterByUuid.has(uuid);
      if ((!direct.has(uuid) && !allowTopologyLag) || block.content.includes("\n") || block.children.length) return false;
      const actual = readManagedFieldValue(block.content);
      const beforeIntent = beforeByUuid.get(uuid); const afterIntent = afterByUuid.get(uuid);
      return Boolean((beforeIntent && matchesPresentedValue(beforeIntent, actual)) || (afterIntent && matchesPresentedValue(afterIntent, actual)));
    });
  }

  async #removeLegacy(inspection: ProjectionInspection): Promise<void> {
    const container = inspection.blocks.get(inspection.snapshot.projection!.containerUuid);
    if (!container) return;
    await this.#freshUnchanged(container);
    for (const child of [...container.children].reverse()) {
      await this.#freshUnchanged(child);
      await this.#host.removeBlock(child.uuid);
    }
    const remaining = await this.#required(container.uuid, true);
    if (remaining.children.length) throw new Error("GRAPH_LEGACY_CONTAINER_CHANGED");
    await this.#host.removeBlock(container.uuid);
  }

  async #converge(before: ManagedProjection, after: ManagedProjection): Promise<void> {
    let inspection = await this.#inspect(this.#sourceFor(), before);
    if (inspection.snapshot.projection?.projectionHash !== before.projectionHash && !this.#transitionSafe(inspection, before, after)) throw new Error("GRAPH_PRESENTATION_TRANSITION_CONFLICT");
    if (inspection.mode === "LEGACY") {
      await this.#removeLegacy(inspection);
      inspection = await this.#inspect(this.#sourceFor(), before);
    }
    const desired = renderProjection(after);
    const desiredByUuid = new Map(desired.map((intent) => [intent.uuid, intent]));
    const current = inspection.blocks;
    const possible = new Set([...renderProjection(before).map((item) => item.uuid), ...desiredByUuid.keys(), before.stateUuid, before.focusUuid, before.waitingUuid, before.outcomeUuid, before.completionUuid, reviewFieldUuid(before.waitingUuid)]);

    for (const uuid of possible) {
      const block = current.get(uuid);
      if (!block || desiredByUuid.has(uuid)) continue;
      await this.#freshUnchanged(block);
      await this.#host.removeBlock(uuid);
      current.delete(uuid);
    }

    let previousUuid: string | null = null;
    for (const intent of desired) {
      const existing = await this.#optional(intent.uuid, false);
      if (existing) {
        const direct = (await this.#required(this.#sourceFor(), true)).children.some((child) => child.uuid === intent.uuid);
        if (!direct || existing.content.includes("\n")) throw new Error(`GRAPH_MANAGED_BLOCK_CHANGED:${intent.uuid}`);
        const value = readManagedFieldValue(existing.content);
        const beforeIntent = renderProjection(before).find((item) => item.uuid === intent.uuid);
        if (!matchesPresentedValue(intent, value) && !(beforeIntent && matchesPresentedValue(beforeIntent, value))) throw new Error(`GRAPH_MANAGED_BLOCK_CHANGED:${intent.uuid}`);
        if (canonicalizeGraphContent(existing.content) !== intent.content) await this.#host.updateBlock(intent.uuid, intent.content);
      } else {
        await this.#insertIntent(this.#sourceFor(), intent, previousUuid);
      }
      previousUuid = intent.uuid;
    }
  }

  // The source UUID is intentionally held outside ManagedProjection. During an
  // effect we bind it here for small private helpers rather than contaminating
  // the renderer model.
  #activeSourceUuid: string | null = null;
  #sourceFor(): string {
    if (!this.#activeSourceUuid) throw new Error("GRAPH_SOURCE_CONTEXT_MISSING");
    return this.#activeSourceUuid;
  }

  async #settled(sourceBlockUuid: string, expected: ManagedProjection, previous?: ManagedProjection): Promise<GraphSnapshot> {
    const deadline = Date.now() + 500;
    let inspection = await this.#inspect(sourceBlockUuid, expected);
    while (inspection.snapshot.projection?.projectionHash !== expected.projectionHash && previous && this.#transitionSafe(inspection, previous, expected, true) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      inspection = await this.#inspect(sourceBlockUuid, expected);
    }
    const snapshot = inspection.snapshot;
    if (snapshot.projection?.projectionHash !== expected.projectionHash) throw new Error("GRAPH_RESULT_MISMATCH");
    return snapshot;
  }

  async #settledRemoved(sourceBlockUuid: string, before: ManagedProjection): Promise<GraphSnapshot> {
    const deadline = Date.now() + 500;
    const empty = emptyPresentation(before);
    const managedUuids = new Set([before.containerUuid, before.titleUuid, before.stateUuid, before.focusUuid, before.waitingUuid, before.outcomeUuid, before.completionUuid, reviewFieldUuid(before.waitingUuid)]);
    while (true) {
      const inspection = await this.#inspect(sourceBlockUuid, before);
      const directManaged = inspection.source.children.some((child) => managedUuids.has(child.uuid));
      if (inspection.blocks.size === 0 && !directManaged) {
        return { ...inspection.snapshot, projection: null };
      }
      if (!this.#transitionSafe(inspection, before, empty, true)) throw new Error("GRAPH_RESULT_MISMATCH");
      if (Date.now() >= deadline) throw new Error("GRAPH_RESULT_MISMATCH");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async #applyMarker(effect: Extract<GraphEffect, { type: "CHANGE_CLOSURE_FIELDS" }>): Promise<void> {
    const source = await this.#required(effect.sourceBlockUuid, false);
    const marker = sourceMarker(source.content);
    if (marker !== (effect.expectedSourceMarker ?? null) && marker !== (effect.resultingSourceMarker ?? null)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
    if (marker === (effect.resultingSourceMarker ?? null) || effect.resultingSourceMarker === effect.expectedSourceMarker) return;
    if (!effect.resultingSourceMarker) throw new Error("GRAPH_MARKER_REMOVAL_UNSUPPORTED");
    const natural = source.rawContent.replace(/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "");
    await this.#host.updateBlock(effect.sourceBlockUuid, `${effect.resultingSourceMarker} ${natural}`);
  }

  async #applyUpsert(effect: Extract<GraphEffect, { type: "UPSERT_MANAGED_PROJECTION" }>): Promise<GraphApplyResult> {
    const source = await this.#required(effect.sourceBlockUuid, true);
    const registered = [effect.projection.containerUuid, effect.projection.titleUuid, effect.projection.stateUuid, effect.projection.focusUuid, effect.projection.waitingUuid, effect.projection.outcomeUuid, effect.projection.completionUuid, reviewFieldUuid(effect.projection.waitingUuid)];
    if ((await Promise.all(registered.map((uuid) => this.#optional(uuid)))).some(Boolean) || source.children.some((child) => child.content.includes("task-copilot-managed:: true"))) throw new Error("GRAPH_EXPECTED_ABSENT");
    this.#known.set(effect.sourceBlockUuid, effect.projection);
    this.#activeSourceUuid = effect.sourceBlockUuid;
    const empty = emptyPresentation(effect.projection);
    await this.#converge(empty, effect.projection);
    await this.#settled(effect.sourceBlockUuid, effect.projection);
    return this.#result(effect, effect.projection.projectionHash);
  }

  #result(effect: GraphEffect, projectionHash: string | null): GraphApplyResult {
    return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash, appliedAt: this.#now() };
  }

  async applyGraphEffect(effect: GraphEffect): Promise<GraphApplyResult> {
    this.#assertGraph(effect.graphId);
    this.#activeSourceUuid = effect.sourceBlockUuid;
    try {
      if (effect.type === "UPSERT_MANAGED_PROJECTION") return await this.#applyUpsert(effect);
      const before = expectedProjection(effect, this.#known.get(effect.sourceBlockUuid));
      this.#known.set(effect.sourceBlockUuid, before);
      const beforeInspection = await this.#inspect(effect.sourceBlockUuid, before);
      if (effect.type === "REMOVE_MANAGED_PROJECTION") {
        if (beforeInspection.snapshot.projection?.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_REMOVE_PRECONDITION_FAILED");
        await this.#converge(before, emptyPresentation(before));
        const settled = await this.#settledRemoved(effect.sourceBlockUuid, before);
        this.#known.delete(effect.sourceBlockUuid);
        if (settled.projection !== null) throw new Error("GRAPH_RESULT_MISMATCH");
        return this.#result(effect, null);
      }

      const after = changedProjection(effect, before);
      const afterInspection = await this.#inspect(effect.sourceBlockUuid, after);
      const markerAfter = effect.type !== "CHANGE_CLOSURE_FIELDS" || afterInspection.snapshot.sourceMarker === (effect.resultingSourceMarker ?? null);
      if (afterInspection.snapshot.projection?.projectionHash === after.projectionHash && markerAfter) {
        this.#known.set(effect.sourceBlockUuid, after);
        return this.#result(effect, after.projectionHash);
      }
      if (beforeInspection.snapshot.projection?.projectionHash !== effect.expectedProjectionHash && !this.#transitionSafe(beforeInspection, before, after)) throw new Error(preconditionError(effect));
      if (effect.type === "CHANGE_CLOSURE_FIELDS") {
        await this.#applyMarker(effect);
        const fresh = await this.#inspect(effect.sourceBlockUuid, before);
        if (fresh.snapshot.projection?.projectionHash !== before.projectionHash && !this.#transitionSafe(fresh, before, after)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      }
      await this.#converge(before, after);
      this.#known.set(effect.sourceBlockUuid, after);
      const settled = await this.#settled(effect.sourceBlockUuid, after, before);
      if (effect.type === "CHANGE_CLOSURE_FIELDS" && settled.sourceMarker !== (effect.resultingSourceMarker ?? null)) throw new Error("GRAPH_RESULT_MISMATCH");
      return this.#result(effect, after.projectionHash);
    } finally {
      this.#activeSourceUuid = null;
    }
  }

  async rerenderManagedProjection(input: { graphId: string; sourceBlockUuid: string; expectedProjection: ManagedProjection }): Promise<GraphSnapshot> {
    this.#assertGraph(input.graphId);
    this.#activeSourceUuid = input.sourceBlockUuid;
    try {
      const before = await this.#inspect(input.sourceBlockUuid, input.expectedProjection);
      if (before.snapshot.projection?.projectionHash !== input.expectedProjection.projectionHash) throw new Error("GRAPH_RERENDER_CONFLICT");
      await this.#converge(input.expectedProjection, input.expectedProjection);
      this.#known.set(input.sourceBlockUuid, input.expectedProjection);
      return await this.#settled(input.sourceBlockUuid, input.expectedProjection);
    } finally {
      this.#activeSourceUuid = null;
    }
  }
}

export function graphIdentity(value: unknown): string {
  const candidate = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!candidate) throw new Error("LOGSEQ_GRAPH_SHAPE_UNSUPPORTED");
  return `${typeof candidate.name === "string" ? candidate.name : "unknown-graph"}:${typeof candidate.url === "string" ? candidate.url : "unknown-location"}`;
}

export function logseqBlock(value: unknown): { uuid: string; content: string } | null {
  const candidate = normalizeLogseqBlock(value);
  return candidate ? { uuid: candidate.uuid, content: candidate.content } : null;
}
