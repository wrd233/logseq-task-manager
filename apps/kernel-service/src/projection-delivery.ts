import type { GraphEffect } from "@task-copilot/contracts";
import type { Kernel } from "@task-copilot/kernel";
import { ProjectionVerificationError } from "@task-copilot/kernel";
import { expectGraphResponse as response, type GraphRequestBroker } from "./graph-broker.ts";
import type { ProjectionDeliveryStore } from "./store-ports.ts";

/** Delivers existing durable obligations; only Kernel may verify or record failure. */
export class ProjectionDelivery {
  private inFlight: Promise<number> | null = null;
  constructor(private readonly store: ProjectionDeliveryStore, private readonly verifier: Pick<Kernel, "verifyFormalProjection" | "graphProjectionFailed">, private readonly broker: Pick<GraphRequestBroker, "status" | "request">, private readonly now: () => string) {}
  drain(canClaim: () => boolean = () => true): Promise<number> {
    if (this.inFlight) return this.inFlight;
    const promise = this.drainOnce(canClaim);
    this.inFlight = promise;
    const clear = () => { if (this.inFlight === promise) this.inFlight = null; };
    void promise.then(clear, clear);
    return promise;
  }
  /** Drain durable projection obligations: formal truth already committed; Graph converges here. */
  private async drainOnce(canClaim: () => boolean): Promise<number> {
    const status = this.broker.status();
    if (!status.available) return 0;
    const at = this.now();
    let drained = 0;
    const blocked = new Set<string>();
    const obligations = this.store.listProjectionObligations().sort((a, b) => a.formalVersion - b.formalVersion || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const obligation of obligations) {
      if (!canClaim()) break;
      if (obligation.status !== "PENDING" && obligation.status !== "FAILED") continue;
      if (blocked.has(obligation.workObjectId)) continue;
      if (obligation.retryExhausted || (obligation.nextAttemptAt && obligation.nextAttemptAt > at)) { blocked.add(obligation.workObjectId); continue; }
      const commit = this.store.getCommit(obligation.commitId);
      if (!commit || commit.status !== "COMMITTED") continue;
      const effect = commit.graphEffect as GraphEffect;
      try {
        const applied = response(await this.broker.request({ kind: "APPLY_EFFECT", effect }), "APPLY_EFFECT");
        this.verifier.verifyFormalProjection(commit.id, applied.result, applied.snapshot);
        drained += 1;
      } catch (error) {
        blocked.add(obligation.workObjectId);
        if (error instanceof ProjectionVerificationError) continue;
        this.verifier.graphProjectionFailed(commit.id, error instanceof Error ? error.message.slice(0, 200) : "PROJECTION_APPLY_FAILED");
      }
    }
    return drained;
  }

}
