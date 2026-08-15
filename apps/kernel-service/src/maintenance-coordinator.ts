import { deterministicUuid, stableHash, type GraphGatewayResponse, type MaintenanceReconcileOutcome, type ReconcileJob, type ReconcilePriorityClass, type SourceChangeObservation, type SourceCoverageState } from "@task-copilot/contracts";
import type { Kernel } from "@task-copilot/kernel";
import type { SqliteStore } from "@task-copilot/sqlite";
import type { GraphRequestBroker } from "./graph-broker.ts";

function response<T extends GraphGatewayResponse["kind"]>(value: GraphGatewayResponse, kind: T): Extract<GraphGatewayResponse, { kind: T }> {
  if (value.kind !== kind) throw new Error("GRAPH_RESPONSE_KIND_MISMATCH");
  return value as Extract<GraphGatewayResponse, { kind: T }>;
}

export interface MaintenanceCoordinatorOptions {
  now?: (() => string) | undefined;
  intervalMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
}

export class MaintenanceCoordinator {
  readonly #kernel: Kernel;
  readonly #store: SqliteStore;
  readonly #broker: GraphRequestBroker;
  readonly #now: () => string;
  readonly #intervalMs: number;
  readonly #maxAttempts: number;
  readonly #retryBackoffMs: number;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(kernel: Kernel, store: SqliteStore, broker: GraphRequestBroker, options: MaintenanceCoordinatorOptions = {}) {
    this.#kernel = kernel;
    this.#store = store;
    this.#broker = broker;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#intervalMs = options.intervalMs ?? 1_000;
    this.#maxAttempts = options.maxAttempts ?? 5;
    this.#retryBackoffMs = options.retryBackoffMs ?? 30_000;
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => { void this.tick().catch((error) => console.warn("[maintenance] tick failed", error)); }, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  recordSourceChange(observation: SourceChangeObservation): { coverage: SourceCoverageState; job: ReconcileJob } {
    const object = this.#store.getWorkObject(observation.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new Error("MAINTENANCE_TARGET_NOT_FOUND");
    if (object.lifecycle !== "OPEN") throw new Error("MAINTENANCE_TARGET_NOT_OPEN");
    if (observation.graphId !== anchor.graphId || observation.sourceBlockUuid !== anchor.externalId) throw new Error("SOURCE_CHANGE_ANCHOR_MISMATCH");
    const snapshotId = stableHash([observation.workObjectId, observation.graphId, observation.sourceBlockUuid, observation.sourceContentHash, observation.sourceMarker ?? null, observation.observedAt]);
    const previous = this.#store.getSourceCoverage(object.id);
    const at = this.#now();
    this.#store.upsertSourceCoverage({
      workObjectId: object.id,
      lastObservedSourceSnapshotId: snapshotId,
      lastReconciledSourceSnapshotId: previous?.lastReconciledSourceSnapshotId ?? null,
      formalVersionAtLastReconcile: previous?.formalVersionAtLastReconcile ?? null,
      hasUncoveredChanges: true,
      updatedAt: at,
    });
    const job: ReconcileJob = {
      id: deterministicUuid(`reconcile:${object.id}:${snapshotId}`), workObjectId: object.id, triggerType: "WORK_BURST_ENDED",
      sourceSnapshotId: snapshotId, formalVersion: object.version, priorityClass: "NORMAL", attempt: 0, notBefore: null,
      status: "QUEUED", lastError: null, lastOutcome: null, createdAt: at, updatedAt: at,
    };
    this.#store.enqueueReconcileJob(job);
    return { coverage: this.#store.getSourceCoverage(object.id)!, job };
  }

  manualReconcile(workObjectId: string, priorityClass: ReconcilePriorityClass = "INTERACTIVE"): ReconcileJob {
    const object = this.#store.getWorkObject(workObjectId);
    if (!object || object.lifecycle !== "OPEN") throw new Error("MAINTENANCE_TARGET_NOT_FOUND");
    const coverage = this.#store.getSourceCoverage(workObjectId);
    const snapshotId = coverage?.lastObservedSourceSnapshotId ?? stableHash([workObjectId, "no-source-observation"]);
    const at = this.#now();
    const job: ReconcileJob = {
      id: deterministicUuid(`reconcile:manual:${workObjectId}:${at}`), workObjectId, triggerType: "MANUAL_RECONCILE",
      sourceSnapshotId: snapshotId, formalVersion: object.version, priorityClass, attempt: 0, notBefore: null, status: "QUEUED",
      lastError: null, lastOutcome: null, createdAt: at, updatedAt: at,
    };
    this.#store.enqueueReconcileJob(job);
    return job;
  }

  setPause(scope: "global" | "object", workObjectId: string | null, paused: boolean): void {
    const key = scope === "global" ? "global" : `object:${workObjectId ?? ""}`;
    this.#store.setMaintenancePause(key, paused, this.#now());
  }

  isPaused(scope: "global" | "object", workObjectId: string | null): boolean {
    const key = scope === "global" ? "global" : `object:${workObjectId ?? ""}`;
    return this.#store.isMaintenancePaused(key);
  }

  coverage(workObjectId: string): SourceCoverageState | null { return this.#store.getSourceCoverage(workObjectId); }
  jobs(status?: ReconcileJob["status"]): ReconcileJob[] { return this.#store.listReconcileJobs(status); }

  async tick(): Promise<ReconcileJob | null> {
    const at = this.#now();
    const job = this.#store.claimNextReconcileJob(at);
    if (!job) return null;
    const interactive = job.priorityClass === "INTERACTIVE";
    const globalPaused = this.#store.isMaintenancePaused("global");
    const objectPaused = this.#store.isMaintenancePaused(`object:${job.workObjectId}`);
    if (!interactive && (globalPaused || objectPaused)) {
      return this.#requeue(job, "MAINTENANCE_PAUSED");
    }
    try {
      const object = this.#store.getWorkObject(job.workObjectId);
      const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
      if (!object || !anchor) throw new Error("MAINTENANCE_TARGET_NOT_FOUND");
      if (object.lifecycle !== "OPEN") {
        this.#store.completeReconcileJob(job.id, object.id, job.sourceSnapshotId, object.version, this.#now(), "NO_CHANGE");
        return this.#store.getReconcileJob(job.id);
      }
      const status = this.#broker.status();
      if (!status.available || !status.graphId) throw new Error("GRAPH_ADAPTER_OFFLINE");
      const outcome = await this.#reconcileOpenObject(object.id, anchor.externalId, job);
      this.#store.completeReconcileJob(job.id, object.id, job.sourceSnapshotId, object.version, this.#now(), outcome);
      return this.#store.getReconcileJob(job.id);
    } catch (error) {
      return this.#requeue(job, error instanceof Error ? error.message.slice(0, 200) : "MAINTENANCE_FAILED");
    }
  }

  #requeue(job: ReconcileJob, reason: string): ReconcileJob {
    const next = new Date(Date.parse(this.#now()) + this.#retryBackoffMs * Math.min(2 ** Math.max(0, job.attempt - 1), 8)).toISOString();
    return this.#store.failReconcileJob(job.id, reason, next, this.#now(), this.#maxAttempts);
  }

  async #reconcileOpenObject(workObjectId: string, sourceBlockUuid: string, job: ReconcileJob): Promise<MaintenanceReconcileOutcome> {
    const target = this.#kernel.targetSnapshotInput(workObjectId);
    const snapshot = response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: target }), "READ_TARGET_SNAPSHOT").snapshot;
    const evidenceMaterial = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: target.graphId, blockUuid: sourceBlockUuid }), "READ_EVIDENCE").material;
    const evidenceId = `maintenance-evidence:${job.id}`;
    this.#kernel.freezeEvidence({ evidenceId, workObjectId, snapshot: evidenceMaterial });
    let changed = false;
    let terminalOutcome: MaintenanceReconcileOutcome = "NO_CHANGE";
    const engagementRun = await this.#kernel.runEngagementAgent({ runId: `maintenance-engagement:${job.id}`, workObjectId, evidenceIds: [evidenceId], snapshot });
    if (engagementRun.proposal && engagementRun.revision) {
      const freshEvidence = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: target.graphId, blockUuid: sourceBlockUuid }), "READ_EVIDENCE").material;
      const pending = this.#kernel.applyEngagementProposal({ operationId: `maintenance-apply:${job.id}`, proposalId: engagementRun.proposal.id, snapshot: response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: this.#kernel.targetSnapshotInput(workObjectId) }), "READ_TARGET_SNAPSHOT").snapshot, evidence: [{ evidenceId, ...freshEvidence }] });
      const applied = response(await this.#broker.request({ kind: "APPLY_EFFECT", effect: pending.graphEffect }), "APPLY_EFFECT");
      this.#kernel.complete(pending.commit.id, applied.result, applied.snapshot);
      changed = true;
    } else if (engagementRun.run.result.outcome !== "NO_PROPOSAL") {
      terminalOutcome = engagementRun.run.result.outcome === "NEEDS_MORE_CONTEXT" ? "UNKNOWN" : "UNKNOWN";
    }
    const focusRun = await this.#kernel.runCurrentFocusAgent({ runId: `maintenance-focus:${job.id}`, workObjectId, evidenceIds: [evidenceId], snapshot: response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: this.#kernel.targetSnapshotInput(workObjectId) }), "READ_TARGET_SNAPSHOT").snapshot });
    if (focusRun.proposal && focusRun.revision) {
      const freshEvidence = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: target.graphId, blockUuid: sourceBlockUuid }), "READ_EVIDENCE").material;
      const pending = this.#kernel.applyProposal({ operationId: `maintenance-focus-apply:${job.id}`, proposalId: focusRun.proposal.id, snapshot: response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: this.#kernel.targetSnapshotInput(workObjectId) }), "READ_TARGET_SNAPSHOT").snapshot, evidence: [{ evidenceId, ...freshEvidence }] });
      const applied = response(await this.#broker.request({ kind: "APPLY_EFFECT", effect: pending.graphEffect }), "APPLY_EFFECT");
      this.#kernel.complete(pending.commit.id, applied.result, applied.snapshot);
      changed = true;
    }
    if (changed) return "CONFIRMED_CHANGE";
    return terminalOutcome;
  }
}
