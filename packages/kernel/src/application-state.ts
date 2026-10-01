import type { AssociationCorrection, ContextAssociation, UserReadBaseline } from "@task-copilot/contracts";
import { KernelError } from "./error.ts";
import { deterministicUuid } from "./identity.ts";
import type { ContextStore, ReadingStore } from "./store-ports.ts";

/** Context relations share the caller's SQLite connection and transaction. */
export class ContextAssociations {
  constructor(private readonly store: ContextStore, private readonly now: () => string) {}
  associateContext(input: { id?: string; workObjectId: string; sourceRef: ContextAssociation["sourceRef"]; sourceVersionHash: string; origin: ContextAssociation["origin"]; basisRunId?: string | null; at?: string }): ContextAssociation {
    const object = this.store.getWorkObject(input.workObjectId);
    if (!object || object.lifecycle !== "OPEN") throw new KernelError("CONTEXT_TARGET_INVALID", "Context Association requires an OPEN Formal WorkObject.");
    const correction = this.store.findActiveCorrection(input.sourceRef.graphId, input.sourceRef.blockUuid, object.id);
    if (correction) throw new KernelError("ASSOCIATION_CORRECTION_BLOCKS", "An active Association Correction prevents automatic association of this source with this WorkObject.");
    const existing = this.store.findActiveContextAssociation(object.id, input.sourceRef.graphId, input.sourceRef.blockUuid);
    if (existing) return existing;
    const at = input.at ?? this.now();
    const association: ContextAssociation = {
      id: input.id ?? deterministicUuid(`context:${object.id}:${input.sourceRef.graphId}:${input.sourceRef.blockUuid}`),
      workObjectId: object.id, sourceRef: input.sourceRef, sourceVersionHash: input.sourceVersionHash, origin: input.origin,
      ...(input.basisRunId ? { basisRunId: input.basisRunId } : {}), status: "ACTIVE", createdAt: at, updatedAt: at,
    };
    this.store.putContextAssociation(association);
    return association;
  }

  listContextAssociations(workObjectId?: string, status?: ContextAssociation["status"]): ContextAssociation[] {
    return this.store.listContextAssociations(workObjectId, status);
  }

  invalidateContextAssociation(id: string): ContextAssociation {
    const at = this.now();
    this.store.invalidateContextAssociation(id, at);
    return this.store.getContextAssociation(id)!;
  }

  recordAssociationCorrection(input: { id?: string; sourceRef: AssociationCorrection["sourceRef"]; scopeSnapshot: string; rejectedWorkObjectId: string; affirmedWorkObjectId?: string | null; userDecisionRef: string; at?: string }): AssociationCorrection {
    const object = this.store.getWorkObject(input.rejectedWorkObjectId);
    if (!object) throw new KernelError("ASSOCIATION_TARGET_NOT_FOUND", "Rejected WorkObject does not exist.");
    if (input.affirmedWorkObjectId && !this.store.getWorkObject(input.affirmedWorkObjectId)) throw new KernelError("ASSOCIATION_TARGET_NOT_FOUND", "Affirmed WorkObject does not exist.");
    const at = input.at ?? this.now();
    const correction: AssociationCorrection = {
      id: input.id ?? deterministicUuid(`correction:${input.sourceRef.graphId}:${input.sourceRef.blockUuid}:${object.id}`),
      sourceRef: input.sourceRef, scopeSnapshot: input.scopeSnapshot, rejectedWorkObjectId: object.id,
      affirmedWorkObjectId: input.affirmedWorkObjectId ?? null, userDecisionRef: input.userDecisionRef, createdAt: at,
    };
    this.store.transaction(() => {
      for (const association of this.store.listContextAssociations(object.id).filter((item) => item.sourceRef.graphId === input.sourceRef.graphId && item.sourceRef.blockUuid === input.sourceRef.blockUuid && item.status === "ACTIVE")) {
        this.store.invalidateContextAssociation(association.id, at);
      }
      this.store.putAssociationCorrection(correction);
    });
    return correction;
  }

}

/** Reading advances attention only, never the formal object or ledger. */
export class UserReading {
  constructor(private readonly store: ReadingStore, private readonly now: () => string) {}
  markViewed(workObjectId: string, at?: string): UserReadBaseline {
    const object = this.store.getWorkObject(workObjectId);
    if (!object) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Cannot mark an unknown WorkObject as viewed.");
    const viewedAt = at ?? this.now();
    const latest = this.store.listCommits({targetId:object.id,status:"COMMITTED"})
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    const baseline: UserReadBaseline = { workObjectId: object.id, lastViewedFormalVersion: object.version, lastViewedAt: viewedAt, lastSeenCommitId: latest?.id ?? null };
    this.store.putUserReadBaseline(baseline);
    return baseline;
  }

}
