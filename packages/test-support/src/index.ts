import { createHmac } from "node:crypto";

import { graphEvidenceProofPayload, stableHash, type GraphAdapter, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type ManagedProjection, type TrustedGraphEvidenceMaterial } from "@task-copilot/contracts";

export { CLOSURE_GOLD_SET, type ClosureGoldCase } from "./closure-gold-set.ts";

type SourceMarker = Exclude<GraphSnapshot["sourceMarker"], undefined>;
interface RecordState { content: string; projection: ManagedProjection | null; marker: SourceMarker }

export class FakeGraphAdapter implements GraphAdapter {
  readonly #records = new Map<string, RecordState>();
  readonly #pages = new Map<string, Map<string, string[]>>();
  #failNext = false;
  #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) { this.#now = now; }
  #key(graphId: string, uuid: string): string { return `${graphId}:${uuid}`; }

  seedNaturalRecord(graphId: string, sourceBlockUuid: string, content: string): GraphSnapshot {
    const match = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(content);
    this.#records.set(this.#key(graphId, sourceBlockUuid), { content, projection: null, marker: match ? match[1] as Exclude<SourceMarker, null> : null });
    return this.snapshot(graphId, sourceBlockUuid);
  }

  seedPageRecord(graphId: string, pageName: string, sourceBlockUuid: string, content: string): GraphSnapshot {
    const snapshot = this.seedNaturalRecord(graphId, sourceBlockUuid, content);
    const pages = this.#pages.get(graphId) ?? new Map<string, string[]>();
    const blocks = pages.get(pageName) ?? [];
    if (!blocks.includes(sourceBlockUuid)) blocks.push(sourceBlockUuid);
    pages.set(pageName, blocks);
    this.#pages.set(graphId, pages);
    return snapshot;
  }

  pageBlockUuids(graphId: string, pageName: string): string[] {
    return [...(this.#pages.get(graphId)?.get(pageName) ?? [])];
  }

  naturalContent(graphId: string, sourceBlockUuid: string): string { return this.#record(graphId, sourceBlockUuid).content; }
  editNaturalContent(graphId: string, sourceBlockUuid: string, content: string): void { const record = this.#record(graphId, sourceBlockUuid); record.content = content; const match = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(content); record.marker = match ? match[1] as Exclude<SourceMarker, null> : null; }
  editMarker(graphId: string, sourceBlockUuid: string, marker: Exclude<SourceMarker, null>): void {
    const record = this.#record(graphId, sourceBlockUuid); const rest = record.content.replace(/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, ""); record.marker = marker; record.content = `${marker} ${rest}`;
  }
  failNextApply(): void { this.#failNext = true; }
  editManagedProjection(graphId: string, sourceBlockUuid: string, title: string): void {
    const record = this.#record(graphId, sourceBlockUuid);
    if (!record.projection) throw new Error("FAKE_PROJECTION_MISSING");
    record.projection = { ...record.projection, title, projectionHash: stableHash({ userEdited: true, title, containerUuid: record.projection.containerUuid }) };
  }

  #record(graphId: string, uuid: string): RecordState {
    const record = this.#records.get(this.#key(graphId, uuid));
    if (!record) throw new Error("FAKE_SOURCE_NOT_FOUND");
    return record;
  }

  snapshot(graphId: string, sourceBlockUuid: string): GraphSnapshot {
    const record = this.#record(graphId, sourceBlockUuid);
    return { graphId, sourceBlockUuid, sourceContentHash: stableHash(record.content), sourceMarker: record.marker, projection: record.projection ? { ...record.projection } : null };
  }

  async readGraphSnapshot(input: { graphId: string; sourceBlockUuid: string }): Promise<GraphSnapshot> { return this.snapshot(input.graphId, input.sourceBlockUuid); }

  async readEvidenceMaterial(input: { graphId: string; blockUuid: string }, proofKey: string): Promise<TrustedGraphEvidenceMaterial> {
    const content = this.#record(input.graphId, input.blockUuid).content;
    const material = { graphId: input.graphId, blockUuid: input.blockUuid, content, sourceContentHash: stableHash(content) };
    return { ...material, proof: createHmac("sha256", proofKey).update(graphEvidenceProofPayload(material)).digest("hex") };
  }

  async applyGraphEffect(effect: GraphEffect): Promise<GraphApplyResult> {
    if (this.#failNext) { this.#failNext = false; throw new Error("FAKE_GRAPH_APPLY_FAILURE"); }
    const record = this.#record(effect.graphId, effect.sourceBlockUuid);
    if (effect.type === "UPSERT_MANAGED_PROJECTION") {
      if (record.projection && record.projection.projectionHash !== effect.projection.projectionHash) throw new Error("GRAPH_EXPECTED_ABSENT");
      record.projection = { ...effect.projection };
    } else if (effect.type === "UPDATE_MANAGED_FIELD") {
      if (!record.projection || record.projection.titleUuid !== effect.fieldUuid) throw new Error("GRAPH_FIELD_NOT_FOUND");
      if (record.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_UPDATE_PRECONDITION_FAILED");
      record.projection = { ...record.projection, title: effect.content.replace(/^标题：/u, ""), projectionHash: effect.resultingProjectionHash };
    } else if (effect.type === "SET_CURRENT_FOCUS_FIELD") {
      if (!record.projection || record.projection.containerUuid !== effect.containerUuid || record.projection.focusUuid !== effect.fieldUuid) throw new Error("GRAPH_FIELD_NOT_FOUND");
      if (record.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_FOCUS_PRECONDITION_FAILED");
      record.projection = { ...record.projection, currentFocus: effect.content, projectionHash: effect.resultingProjectionHash };
    } else if (effect.type === "UPDATE_WORK_INTENT_FIELDS") {
      if (!record.projection || record.projection.containerUuid !== effect.containerUuid || record.projection.outcomeUuid !== effect.outcomeUuid || record.projection.completionUuid !== effect.completionUuid) throw new Error("GRAPH_FIELD_NOT_FOUND");
      if (record.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_WORK_INTENT_PRECONDITION_FAILED");
      record.projection = { ...record.projection, desiredOutcome: effect.desiredOutcome, completionChecks: [...effect.completionChecks], projectionHash: effect.resultingProjectionHash };
    } else if (effect.type === "CHANGE_ENGAGEMENT_FIELDS") {
      if (!record.projection || record.projection.containerUuid !== effect.containerUuid || record.projection.stateUuid !== effect.stateUuid || record.projection.waitingUuid !== effect.waitingUuid) throw new Error("GRAPH_FIELD_NOT_FOUND");
      if (record.projection.projectionHash === effect.resultingProjectionHash) return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: effect.resultingProjectionHash, appliedAt: this.#now() };
      if (record.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_ENGAGEMENT_PRECONDITION_FAILED");
      record.projection = { ...record.projection, engagement: effect.engagement, waitingCondition: effect.waiting, projectionHash: effect.resultingProjectionHash };
    } else if (effect.type === "CHANGE_CLOSURE_FIELDS") {
      if (!record.projection || record.projection.containerUuid !== effect.containerUuid || record.projection.stateUuid !== effect.stateUuid || record.projection.focusUuid !== effect.focusUuid) throw new Error("GRAPH_FIELD_NOT_FOUND");
      if (record.projection.projectionHash === effect.resultingProjectionHash && record.marker === effect.resultingSourceMarker) return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: effect.resultingProjectionHash, appliedAt: this.#now() };
      if (record.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      if (record.marker !== effect.expectedSourceMarker) throw new Error("GRAPH_MARKER_PRECONDITION_FAILED");
      if (effect.resultingSourceMarker !== null && effect.resultingSourceMarker !== undefined) this.editMarker(effect.graphId, effect.sourceBlockUuid, effect.resultingSourceMarker);
      record.projection = { ...record.projection, lifecycle: effect.lifecycle, engagement: effect.engagement, waitingCondition: effect.waitingCondition, currentFocus: effect.currentFocus, closure: effect.closure, projectionHash: effect.resultingProjectionHash };
    } else {
      if (!record.projection || record.projection.containerUuid !== effect.containerUuid || record.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_REMOVE_PRECONDITION_FAILED");
      record.projection = null;
    }
    return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: record.projection?.projectionHash ?? null, appliedAt: this.#now() };
  }
}
