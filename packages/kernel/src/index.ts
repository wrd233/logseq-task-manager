import { createHash } from "node:crypto";

import { stableHash, type Actor, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type ManagedProjection, type SemanticOperation } from "@task-copilot/contracts";
import { createWorkObject, renameWorkObject, type PrimaryAnchor, type WorkObject } from "@task-copilot/domain";
import type { SqliteStore, StoredCommit } from "@task-copilot/sqlite";

type DurableStage = "PREPARED" | "KERNEL_APPLIED" | "GRAPH_APPLIED";
export type RecoveryAction = "ABORT_PREPARED" | "RESUME_GRAPH_APPLY" | "VERIFY_GRAPH" | "MANUAL_RECONCILIATION";

export class KernelError extends Error {
  readonly code: string;
  readonly commitId: string | null;
  constructor(code: string, message: string, commitId: string | null = null) {
    super(`${code}: ${message}`); this.name = "KernelError"; this.code = code; this.commitId = commitId;
  }
}

export interface KernelOptions {
  now?: () => string;
  afterStage?: (stage: DurableStage, commitId: string) => void;
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; hex[16] = "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function projectionFor(object: WorkObject, anchor: Pick<PrimaryAnchor, "projectionContainerUuid" | "projectionTitleUuid" | "projectionStateUuid">): ManagedProjection {
  const core = {
    containerUuid: anchor.projectionContainerUuid, titleUuid: anchor.projectionTitleUuid, stateUuid: anchor.projectionStateUuid,
    title: object.title, lifecycle: object.lifecycle, engagement: object.engagement,
  };
  return { ...core, projectionHash: stableHash(core) };
}

export class Kernel {
  readonly #store: SqliteStore;
  readonly #now: () => string;
  readonly #afterStage: (stage: DurableStage, commitId: string) => void;

  constructor(store: SqliteStore, options: KernelOptions = {}) {
    this.#store = store; this.#now = options.now ?? (() => new Date().toISOString()); this.#afterStage = options.afterStage ?? (() => undefined);
  }

  prepare(operation: SemanticOperation, snapshot: GraphSnapshot): { commit: StoredCommit; graphEffect: GraphEffect } {
    if (operation.actor.type === "AGENT") throw new KernelError("ACTOR_NOT_AUTHORIZED", "Agent writes require a future governance policy.");
    if (operation.type === "UNDO_COMMIT") throw new KernelError("UNDO_ENTRYPOINT_REQUIRED", "Use prepareUndo for compensation commits.");
    const now = this.#now();
    const commitId = deterministicUuid(`commit:${operation.operationId}`);
    let object: WorkObject;
    let anchor: PrimaryAnchor;
    let graphEffect: GraphEffect;
    let before: WorkObject | null = null;

    if (operation.type === "CREATE_WORK_OBJECT") {
      const workObjectId = deterministicUuid(`work:${operation.operationId}`);
      object = createWorkObject({ id: workObjectId, kind: operation.input.kind, title: operation.input.title, at: now });
      anchor = {
        id: deterministicUuid(`anchor:${operation.operationId}`), workObjectId, graphId: operation.input.anchor.graphId,
        externalId: operation.input.anchor.blockUuid, sourceContentHash: operation.input.anchor.sourceContentHash,
        projectionContainerUuid: deterministicUuid(`projection:${operation.operationId}`), projectionTitleUuid: deterministicUuid(`title:${operation.operationId}`),
        projectionStateUuid: deterministicUuid(`state:${operation.operationId}`), createdAt: now, updatedAt: now,
      };
      graphEffect = { type: "UPSERT_MANAGED_PROJECTION", graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, projection: projectionFor(object, anchor) };
    } else {
      before = this.#store.getWorkObject(operation.target.workObjectId);
      if (!before) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Rename target does not exist.");
      anchor = this.#store.getAnchorForWorkObject(before.id)!;
      object = renameWorkObject(before, { title: operation.input.title, expectedVersion: operation.target.expectedVersion, at: now });
      const projection = projectionFor(object, anchor);
      graphEffect = { type: "UPDATE_MANAGED_FIELD", graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, fieldUuid: anchor.projectionTitleUuid, content: `标题：${object.title}`, projectionHash: projection.projectionHash };
    }

    const commit: StoredCommit = {
      id: commitId, status: "PREPARED", actor: operation.actor, operationType: operation.type, targetId: object.id,
      operation, preconditions: operation.preconditions, before, after: object,
      inverse: before ? { type: "RENAME_WORK_OBJECT", title: before.title, version: before.version } : { type: "UNDO_COMMIT", targetId: object.id },
      graphEffect, graphResult: null, failureReason: null, compensationFor: null, compensatedBy: null, createdAt: now, updatedAt: now,
    };
    this.#store.insertCommit(commit);
    this.#afterStage("PREPARED", commitId);

    const mismatch = snapshot.graphId !== anchor.graphId || snapshot.sourceBlockUuid !== anchor.externalId ||
      (operation.type === "CREATE_WORK_OBJECT" ? snapshot.sourceContentHash !== anchor.sourceContentHash || snapshot.projection !== null : snapshot.projection?.projectionHash !== operation.target.expectedProjectionHash);
    if (mismatch) {
      const code = operation.type === "CREATE_WORK_OBJECT" ? "SOURCE_CONTENT_HASH_MISMATCH" : "MANAGED_PROJECTION_HASH_MISMATCH";
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: now, failureReason: code });
      throw new KernelError(code, "Graph precondition does not match the operation's expected state.", commitId);
    }

    this.#store.transaction(() => {
      this.#store.putWorkObject(object);
      if (operation.type === "CREATE_WORK_OBJECT") this.#store.putAnchor(anchor);
      this.#store.transitionCommit(commitId, "KERNEL_APPLIED", { updatedAt: now });
    });
    this.#afterStage("KERNEL_APPLIED", commitId);
    return { commit: this.#store.getCommit(commitId)!, graphEffect };
  }

  prepareUndo(input: { operationId: string; actor: Actor; commitId: string }, snapshot: GraphSnapshot): { commit: StoredCommit; graphEffect: GraphEffect } {
    const original = this.#store.getCommit(input.commitId);
    if (!original || original.status !== "COMMITTED" || original.compensatedBy) throw new KernelError("UNDO_TARGET_INVALID", "Commit is not currently undoable.");
    if (original.operationType !== "CREATE_WORK_OBJECT") throw new KernelError("UNDO_OPERATION_DEFERRED", "This slice supports undo of CREATE_WORK_OBJECT only.");
    const object = this.#store.getWorkObject(original.targetId!);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("UNDO_TARGET_MISSING", "Current state for the commit is missing.");
    const expectedProjection = projectionFor(object, anchor);
    const now = this.#now();
    const commitId = deterministicUuid(`commit:${input.operationId}`);
    const effect: GraphEffect = { type: "REMOVE_MANAGED_PROJECTION", graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid, expectedProjectionHash: expectedProjection.projectionHash };
    const compensation: StoredCommit = {
      id: commitId, status: "PREPARED", actor: input.actor, operationType: "UNDO_COMMIT", targetId: object.id,
      operation: { operationId: input.operationId, type: "UNDO_COMMIT", actor: input.actor, target: { commitId: input.commitId, expectedProjectionHash: expectedProjection.projectionHash }, input: {} },
      preconditions: [{ kind: "MANAGED_PROJECTION_HASH", expected: expectedProjection.projectionHash }], before: object, after: null,
      inverse: { type: "CREATE_WORK_OBJECT", object, anchor }, graphEffect: effect, graphResult: null, failureReason: null,
      compensationFor: original.id, compensatedBy: null, createdAt: now, updatedAt: now,
    };
    this.#store.insertCommit(compensation);
    this.#afterStage("PREPARED", commitId);
    if (snapshot.graphId !== anchor.graphId || snapshot.sourceBlockUuid !== anchor.externalId || snapshot.projection?.projectionHash !== expectedProjection.projectionHash) {
      this.#store.transitionCommit(commitId, "ABORTED", { updatedAt: now, failureReason: "UNDO_GRAPH_CHANGED" });
      throw new KernelError("UNDO_GRAPH_CHANGED", "Managed projection changed after the original commit; no content was removed.", commitId);
    }
    this.#store.transaction(() => {
      this.#store.deleteWorkObject(object.id);
      this.#store.transitionCommit(commitId, "KERNEL_APPLIED", { updatedAt: now });
    });
    this.#afterStage("KERNEL_APPLIED", commitId);
    return { commit: this.#store.getCommit(commitId)!, graphEffect: effect };
  }

  complete(commitId: string, result: GraphApplyResult, actual: GraphSnapshot): StoredCommit {
    const commit = this.#store.getCommit(commitId);
    if (!commit || commit.status !== "KERNEL_APPLIED") throw new KernelError("COMMIT_STAGE_INVALID", "Commit is not waiting for Graph application.", commitId);
    const effect = commit.graphEffect as GraphEffect;
    this.#store.transitionCommit(commitId, "GRAPH_APPLIED", { updatedAt: result.appliedAt, graphResult: result });
    this.#afterStage("GRAPH_APPLIED", commitId);
    const expectedHash = effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection.projectionHash : effect.type === "UPDATE_MANAGED_FIELD" ? effect.projectionHash : null;
    const valid = actual.graphId === effect.graphId && actual.sourceBlockUuid === effect.sourceBlockUuid && (actual.projection?.projectionHash ?? null) === expectedHash && result.projectionHash === expectedHash;
    if (!valid) {
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: this.#now(), failureReason: "GRAPH_VERIFY_MISMATCH" });
      throw new KernelError("GRAPH_VERIFY_MISMATCH", "Graph result does not match the deterministic effect.", commitId);
    }
    this.#store.transitionCommit(commitId, "COMMITTED", { updatedAt: this.#now() });
    if (commit.compensationFor) this.#store.setCompensatedBy(commit.compensationFor, commitId, this.#now());
    return this.#store.getCommit(commitId)!;
  }

  recoveryList(): Array<{ commit: StoredCommit; action: RecoveryAction }> {
    return this.#store.listRecovery().map((commit) => ({ commit, action: commit.status === "PREPARED" ? "ABORT_PREPARED" : commit.status === "KERNEL_APPLIED" ? "RESUME_GRAPH_APPLY" : commit.status === "GRAPH_APPLIED" ? "VERIFY_GRAPH" : "MANUAL_RECONCILIATION" }));
  }

  verifyRecoveredGraph(commitId: string, actual: GraphSnapshot): StoredCommit {
    const commit = this.#store.getCommit(commitId);
    if (!commit || commit.status !== "GRAPH_APPLIED") throw new KernelError("COMMIT_STAGE_INVALID", "Only GRAPH_APPLIED commits can be recovered by verification.", commitId);
    const effect = commit.graphEffect as GraphEffect;
    const result = commit.graphResult as GraphApplyResult | null;
    const expectedHash = effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection.projectionHash : effect.type === "UPDATE_MANAGED_FIELD" ? effect.projectionHash : null;
    if (!result || actual.graphId !== effect.graphId || actual.sourceBlockUuid !== effect.sourceBlockUuid || (actual.projection?.projectionHash ?? null) !== expectedHash || result.projectionHash !== expectedHash) {
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: this.#now(), failureReason: "RECOVERY_GRAPH_VERIFY_MISMATCH" });
      throw new KernelError("RECOVERY_GRAPH_VERIFY_MISMATCH", "Recovered Graph state does not match the durable Graph result.", commitId);
    }
    this.#store.transitionCommit(commitId, "COMMITTED", { updatedAt: this.#now() });
    if (commit.compensationFor) this.#store.setCompensatedBy(commit.compensationFor, commitId, this.#now());
    return this.#store.getCommit(commitId)!;
  }

  abortPrepared(commitId: string): StoredCommit {
    const commit = this.#store.getCommit(commitId);
    if (!commit || commit.status !== "PREPARED") throw new KernelError("COMMIT_STAGE_INVALID", "Only PREPARED commits can be aborted.", commitId);
    this.#store.transitionCommit(commitId, "ABORTED", { updatedAt: this.#now(), failureReason: "RECOVERY_ABORTED_PREPARED" });
    return this.#store.getCommit(commitId)!;
  }
}
