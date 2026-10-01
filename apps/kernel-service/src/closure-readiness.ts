import type { ClosureAssessment, ClosureAssessmentJob, DecisionPackage, DecisionCandidate } from "@task-copilot/contracts";
import type { ClosureAssessmentCoordinator } from "./closure-assessment-coordinator.ts";
import type { ClosureReadinessStore } from "./store-ports.ts";
import { computeClosureGate, currentSemanticRevision, deterministicClosureAssessment, gateSnapshot, sameGate, semanticRevisionFor, type ClosureGate } from "./closure-gate.ts";

export interface ClosureAssessmentSnapshot {
  gate: ClosureGate;
  revision: string;
  watermark: number;
  cached: ClosureAssessment | null;
  queued: boolean;
  fallback?: ClosureAssessment | null;
}
export interface ClosureAssessmentState { assessment: ClosureAssessment | null; fresh: boolean; queued: boolean }

/** Pure formatting: the returned freshness describes the captured formal reality. */
export function assembleClosureAssessment(snapshot: ClosureAssessmentSnapshot | null): ClosureAssessmentState {
  if (!snapshot) return { assessment: null, fresh: false, queued: false };
  const { cached, gate, revision, watermark } = snapshot;
  const fresh = Boolean(cached && cached.semanticRevision === revision && cached.evidenceWatermark === watermark && sameGate(cached.gate, gateSnapshot(gate)) &&
    (gate.pass ? cached.provenance === "AGENT" : cached.provenance === "DETERMINISTIC" && cached.readiness === gate.readiness));
  return { assessment: cached ?? snapshot.fallback ?? null, fresh, queued: gate.pass && snapshot.queued };
}

/** Explicit synchronous state maintenance and background enqueue; never a formal command. */
export class ClosureReadiness {
  constructor(private readonly store: ClosureReadinessStore, private readonly closure: Pick<ClosureAssessmentCoordinator, "requestAssessment" | "jobs">, private readonly now: () => string) {}
  jobs(status?: ClosureAssessmentJob["status"]) { return this.closure.jobs(status); }

  /**
   * Object reads only ever see a cached assessment. Deterministic blockers are
   * persisted synchronously; a gate-passing object gets a coalesced background
   * job and the caller sees the last good (possibly stale) assessment.
   */
  ensureAssessment(workObjectId: string): ClosureAssessmentState {
    return assembleClosureAssessment(this.maintainAssessment(workObjectId));
  }

  /** This step may persist a deterministic result or enqueue a coalesced job. */
  maintainAssessment(workObjectId: string): ClosureAssessmentSnapshot | null {
    const object = this.store.getWorkObject(workObjectId);
    if (!object || object.lifecycle !== "OPEN") return null;
    const gate = computeClosureGate(this.store, object);
    const revision = semanticRevisionFor(object, object.kind === "PROJECT" ? (this.store.getProjectIntent(workObjectId)?.revision ?? 0) : null);
    const watermark = this.store.evidenceWatermark(workObjectId);
    let cached = this.store.getClosureAssessment(workObjectId);
    const initial = { gate, revision, watermark, cached, queued: false };
    if (!gate.pass) {
      if (!assembleClosureAssessment(initial).fresh) {
        cached = deterministicClosureAssessment(this.store, object, this.now());
        this.store.putClosureAssessment(cached);
      }
      return { ...initial, cached };
    }
    if (!assembleClosureAssessment(initial).fresh) this.closure.requestAssessment(workObjectId);
    const queued = this.closure.jobs("QUEUED").some(job => job.workObjectId === workObjectId) || this.closure.jobs("RUNNING").some(job => job.workObjectId === workObjectId);
    const fallback = cached ? null : { ...deterministicClosureAssessment(this.store, object, this.now()), blockers: ["完成情况正在重新评估。"] };
    return { ...initial, cached, queued, fallback };
  }

  /** Proactive fail-closed hygiene for OPEN closure packages; final Kernel checks remain authoritative. */
  sweepStaleClosurePackages(): number {
    const at = this.now();
    let stale = 0;
    for (const pkg of this.store.listDecisionPackages("OPEN")) {
      if (!pkg.workObjectId) continue;
      const candidate = this.store.listDecisionCandidates(pkg.id, "OPEN")[0] ?? null;
      if (!candidate || !["COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE"].includes(candidate.operationType)) continue;
      if (this.#closurePackageStale(pkg, candidate)) {
        this.store.transitionDecisionPackage(pkg.id, "STALE", at);
        stale += 1;
      }
    }
    return stale;
  }

  #closurePackageStale(pkg: DecisionPackage, candidate: DecisionCandidate): boolean {
    const params = candidate.parameters as { target?: { workObjectId?: string }; input?: { targetClosureRecordId?: string; evidenceIds?: readonly string[] } } | null;
    const workObjectId = params?.target?.workObjectId ?? pkg.workObjectId;
    if (!workObjectId) return true;
    const object = this.store.getWorkObject(workObjectId);
    if (!object) return true;
    if ((pkg.targetVersions[workObjectId] ?? 0) !== object.version) return true;
    if (candidate.operationType === "COMPLETE_WORK_OBJECT" || candidate.operationType === "CANCEL_WORK_OBJECT") {
      const gate = computeClosureGate(this.store, object);
      if (!gate.pass && candidate.operationType === "COMPLETE_WORK_OBJECT") return true;
    }
    if (candidate.operationType === "REOPEN_WORK_OBJECT" && object.lifecycle !== "COMPLETED" && object.lifecycle !== "CANCELLED") return true;
    if (candidate.operationType === "AMEND_CLOSURE") {
      const current = this.store.getCurrentClosureRecord(workObjectId);
      if (!current || params?.input?.targetClosureRecordId !== current.id) return true;
    }
    for (const evidenceId of params?.input?.evidenceIds ?? []) {
      const evidence = this.store.getEvidence(evidenceId);
      if (!evidence || evidence.workObjectId !== workObjectId) return true;
    }
    if (candidate.operationType === "COMPLETE_WORK_OBJECT") {
      const state = this.ensureAssessment(workObjectId);
      if (state.assessment?.readiness !== "READY" || !state.fresh) return true;
    }
    return false;
  }

  readySinceLastSeen(object: { id: string; kind: string }, lastViewedAt: string | null): boolean {
    if (object.kind === "TASK") return false;
    const stored = this.store.getWorkObject(object.id);
    if (!stored || stored.lifecycle !== "OPEN") return false;
    const gate = computeClosureGate(this.store, stored);
    if (!gate.pass) return false;
    const cached = this.store.getClosureAssessment(object.id);
    const revision = currentSemanticRevision(this.store, object.id);
    if (!cached || cached.readiness !== "READY" || cached.provenance !== "AGENT" || !cached.readinessChangedAt) return false;
    if (cached.semanticRevision !== revision || cached.evidenceWatermark !== this.store.evidenceWatermark(object.id) || !sameGate(cached.gate, gateSnapshot(gate))) return false;
    if (lastViewedAt && cached.readinessChangedAt <= lastViewedAt) return false;
    return true;
  }

}
