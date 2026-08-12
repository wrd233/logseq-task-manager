import { stableHash, type GraphAdapter, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type ManagedProjection } from "@task-copilot/contracts";

interface RecordState { content: string; projection: ManagedProjection | null }

export class FakeGraphAdapter implements GraphAdapter {
  readonly #records = new Map<string, RecordState>();
  #failNext = false;
  #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) { this.#now = now; }
  #key(graphId: string, uuid: string): string { return `${graphId}:${uuid}`; }

  seedNaturalRecord(graphId: string, sourceBlockUuid: string, content: string): GraphSnapshot {
    this.#records.set(this.#key(graphId, sourceBlockUuid), { content, projection: null });
    return this.snapshot(graphId, sourceBlockUuid);
  }

  naturalContent(graphId: string, sourceBlockUuid: string): string { return this.#record(graphId, sourceBlockUuid).content; }
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
    return { graphId, sourceBlockUuid, sourceContentHash: stableHash(record.content), projection: record.projection ? { ...record.projection } : null };
  }

  async readGraphSnapshot(input: { graphId: string; sourceBlockUuid: string }): Promise<GraphSnapshot> { return this.snapshot(input.graphId, input.sourceBlockUuid); }

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
    } else {
      if (!record.projection || record.projection.containerUuid !== effect.containerUuid || record.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_REMOVE_PRECONDITION_FAILED");
      record.projection = null;
    }
    return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: record.projection?.projectionHash ?? null, appliedAt: this.#now() };
  }
}
