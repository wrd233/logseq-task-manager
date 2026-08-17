import { deterministicUuid } from "@task-copilot/contracts";
import type { ClosureAssessmentJob, ClosureAssessor, ExecutionProfile, SkillPackage, WorkObject } from "@task-copilot/contracts";
import type { SqliteStore } from "@task-copilot/sqlite";
import { aggregateClosureSemanticJudgment, computeClosureGate, currentSemanticRevision, deterministicClosureAssessment, gateSnapshot, sameGate, semanticRevisionFor } from "./closure-gate.ts";

export interface ClosureScopeGate {
  isClosureEnabled(): boolean;
  isInScope(workObjectId: string): boolean;
}

export interface ClosureAssessmentCoordinatorOptions {
  now?: () => string;
  intervalMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  skills?: { miniProject: SkillPackage; project: SkillPackage };
  scope?: ClosureScopeGate;
}

export class ClosureAssessmentCoordinator {
  readonly #store: SqliteStore;
  readonly #assessor: ClosureAssessor;
  readonly #profile: ExecutionProfile;
  readonly #now: () => string;
  readonly #intervalMs: number;
  readonly #maxAttempts: number;
  readonly #retryBackoffMs: number;
  readonly #skills: { miniProject: SkillPackage; project: SkillPackage };
  readonly #scope: ClosureScopeGate | null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #running = false;
  #remoteCallsThisRun = 0;

  constructor(store: SqliteStore, assessor: ClosureAssessor, profile: ExecutionProfile, options: ClosureAssessmentCoordinatorOptions = {}) {
    this.#store = store;
    this.#assessor = assessor;
    this.#profile = profile;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#intervalMs = options.intervalMs ?? 2_000;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryBackoffMs = options.retryBackoffMs ?? 60_000;
    if (!options.skills) throw new Error("CLOSURE_SKILLS_REQUIRED");
    this.#skills = options.skills;
    this.#scope = options.scope ?? null;
  }

  start(): void {
    if (this.#timer) return;
    this.scan();
    this.#timer = setInterval(() => { void this.tickClosure().catch((error) => console.warn("[closure-assessment] tick failed", error)); }, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  jobs(status?: ClosureAssessmentJob["status"]): ClosureAssessmentJob[] {
    return this.#store.listClosureAssessmentJobs(status);
  }

  /** Coalesced request: only the latest semantic reality survives as QUEUED. */
  requestAssessment(workObjectId: string): void {
    const object = this.#store.getWorkObject(workObjectId);
    if (!object || object.lifecycle !== "OPEN" || object.kind === "TASK") return;
    if (this.#scope && (!this.#scope.isClosureEnabled() || !this.#scope.isInScope(workObjectId))) return;
    const revision = currentSemanticRevision(this.#store, workObjectId) ?? String(object.version);
    const watermark = this.#store.evidenceWatermark(workObjectId);
    const at = this.#now();
    const job: ClosureAssessmentJob = {
      id: deterministicUuid(`closure-assessment:${workObjectId}:${revision}:${watermark}`), workObjectId, kind: object.kind,
      semanticRevision: revision, evidenceWatermark: watermark, status: "QUEUED", attempt: 0,
      lastError: null, lastOutcome: null, notBefore: null, createdAt: at, updatedAt: at,
    };
    this.#store.enqueueClosureAssessmentJob(job);
  }

  /**
   * Narrow freshness scan: deterministic blockers are persisted directly;
   * gate-passing objects with a missing/stale/mismatched assessment get one
   * coalesced background job. This is not a generic derived-job engine.
   */
  scan(): void {
    const at = this.#now();
    for (const object of this.#store.listWorkObjects()) {
      if (object.lifecycle !== "OPEN" || object.kind === "TASK") continue;
      if (this.#scope && (!this.#scope.isClosureEnabled() || !this.#scope.isInScope(object.id))) continue;
      const gate = computeClosureGate(this.#store, object);
      const revision = semanticRevisionFor(object, object.kind === "PROJECT" ? (this.#store.getProjectIntent(object.id)?.revision ?? 0) : null);
      const watermark = this.#store.evidenceWatermark(object.id);
      const snapshot = gateSnapshot(gate);
      const cached = this.#store.getClosureAssessment(object.id);
      const fresh = Boolean(cached && cached.semanticRevision === revision && cached.evidenceWatermark === watermark && sameGate(cached.gate, snapshot));
      if (!gate.pass) {
        if (!fresh || cached?.readiness !== gate.readiness || cached?.provenance !== "DETERMINISTIC") this.#persistDeterministic(object, at);
        continue;
      }
      if (!fresh || cached?.provenance !== "AGENT") this.requestAssessment(object.id);
    }
  }

  async tickClosure(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#remoteCallsThisRun = 0;
    try {
      const job = this.#store.claimNextClosureAssessmentJob(this.#now());
      if (!job) return;
      await this.#processJob(job);
    } finally {
      this.#running = false;
    }
  }

  async #processJob(job: ClosureAssessmentJob): Promise<void> {
    const at = this.#now();
    const object = this.#store.getWorkObject(job.workObjectId);
    if (!object || object.lifecycle !== "OPEN") { this.#store.completeClosureAssessmentJob(job.id, at, "TARGET_CLOSED"); return; }
    if (this.#scope && (!this.#scope.isClosureEnabled() || !this.#scope.isInScope(object.id))) {
      this.#store.completeClosureAssessmentJob(job.id, at, "SCOPE_EXCLUDED");
      return;
    }
    const revision = currentSemanticRevision(this.#store, object.id) ?? String(object.version);
    const watermark = this.#store.evidenceWatermark(object.id);
    const gate = computeClosureGate(this.#store, object);
    if (!gate.pass) {
      this.#persistDeterministic(object, at);
      this.#store.completeClosureAssessmentJob(job.id, at, "DETERMINISTIC_BLOCKER");
      return;
    }
    if (job.semanticRevision !== revision || job.evidenceWatermark !== watermark) {
      this.#store.completeClosureAssessmentJobAsSuperseded(job.id, at);
      this.requestAssessment(object.id);
      return;
    }
    try {
      this.#reserveRemoteCall();
      const projectIntent = object.kind === "PROJECT" ? this.#store.getProjectIntent(object.id) : null;
      const evidence = this.#store.listEvidence(object.id);
      const judgment = await this.#assessor.assess({
        object, projectIntent, evidence, profile: this.#profile,
        skill: object.kind === "PROJECT" ? this.#skills.project : this.#skills.miniProject,
      });
      if (this.#superseded(job)) {
        this.#store.completeClosureAssessmentJobAsSuperseded(job.id, at);
        return;
      }
      if (revision !== (currentSemanticRevision(this.#store, object.id) ?? String(object.version)) || watermark !== this.#store.evidenceWatermark(object.id) || !computeClosureGate(this.#store, object).pass) {
        this.#store.completeClosureAssessmentJobAsSuperseded(job.id, at);
        this.requestAssessment(object.id);
        return;
      }
      const assessment = aggregateClosureSemanticJudgment({
        object, projectIntent, judgment,
        allowedEvidenceIds: new Set(this.#store.listEvidence(object.id).map((item) => item.id)),
        semanticRevision: revision, evidenceWatermark: watermark, at,
      });
      this.#store.putClosureAssessment(assessment);
      this.#store.completeClosureAssessmentJob(job.id, at, assessment.readiness);
      this.#store.recordMaintenanceSuccess("closure", at);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : "CLOSURE_ASSESSMENT_FAILED";
      if (this.#superseded(job)) {
        this.#store.completeClosureAssessmentJobAsSuperseded(job.id, at);
        return;
      }
      if (message === "DEFERRED_BY_BUDGET") {
        this.#store.deferClosureAssessmentJob(job.id, message, new Date(Date.parse(at) + 3_600_000).toISOString(), at);
        return;
      }
      this.#store.recordMaintenanceFailure("closure", at);
      const next = new Date(Date.parse(at) + this.#retryBackoffMs * Math.min(2 ** Math.max(0, job.attempt - 1), 8)).toISOString();
      this.#store.failClosureAssessmentJob(job.id, message, next, at, this.#maxAttempts);
    }
  }

  #persistDeterministic(object: WorkObject, at: string): void {
    const assessment = deterministicClosureAssessment(this.#store, object, at);
    this.#store.putClosureAssessment(assessment);
  }

  #reserveRemoteCall(): void {
    if (this.#profile.executor === "FAKE" || !this.#profile.remoteEnabled) return;
    const runLimit = this.#profile.maxRemoteCallsPerRun ?? 1;
    if (this.#remoteCallsThisRun >= runLimit) throw new Error("DEFERRED_BY_BUDGET");
    const hourLimit = this.#profile.maxRemoteCallsPerHour;
    if (hourLimit && !this.#store.consumeRemoteCallBudget(`remote:${this.#profile.id}`, hourLimit, this.#now())) throw new Error("DEFERRED_BY_BUDGET");
    this.#remoteCallsThisRun += 1;
  }

  #superseded(job: ClosureAssessmentJob): boolean {
    return this.#store.hasQueuedClosureAssessmentJobNewerThan(job.workObjectId, job.id, job.createdAt);
  }
}
