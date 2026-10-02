import { randomUUID } from "node:crypto";
import { deterministicUuid, stableHash, type CognitionExecutor, type ContextPackItem, type ExecutionProfile, type GovernanceDimension, type MaintenanceReconcileOutcome, type ReconcileJob, type ReconcilePriorityClass, type SemanticJudgment, type SourceChangeObservation, type SourceCoverageState, type SourceRef } from "@task-copilot/contracts";
import { ContextAssociations, KernelError, type Kernel } from "@task-copilot/kernel";
import type { MaintenanceStore } from "./store-ports.ts";
import type { ProjectionDelivery } from "./projection-delivery.ts";
import { currentSemanticRevision } from "./closure-gate.ts";
import { expectGraphResponse as response, type GraphRequestBroker } from "./graph-broker.ts";

export const FAKE_COGNITION_PROFILE: ExecutionProfile = {
  id: "builtin-fake", executor: "FAKE", remoteEnabled: false, allowedDataScope: ["formal_state", "current_workobject_context"],
  maxContextItems: 12, maxInputChars: 24_000, timeoutMs: 5_000, retryBudget: 2, credentialRef: null,
};

export interface MaintenanceScopeGate {
  isMaintenanceEnabled(): boolean;
  isInScope(workObjectId: string): boolean;
}

export interface MaintenanceCoordinatorOptions {
  now?: (() => string) | undefined;
  intervalMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  onRecordSourceChange?: (workObjectId: string) => void;
  cognitionExecutor?: CognitionExecutor;
  executionProfile?: ExecutionProfile;
  scope?: MaintenanceScopeGate;
  delivery: Pick<ProjectionDelivery, "drain">;
}

export class MaintenanceCoordinator {
  readonly #kernel: Kernel;
  readonly #context: ContextAssociations;
  readonly #store: MaintenanceStore;
  readonly #broker: GraphRequestBroker;
  readonly #now: () => string;
  readonly #intervalMs: number;
  readonly #maxAttempts: number;
  readonly #retryBackoffMs: number;
  readonly #onRecordSourceChange: ((workObjectId: string) => void) | null;
  readonly #cognition: CognitionExecutor;
  readonly #profile: ExecutionProfile;
  readonly #scope: MaintenanceScopeGate | null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #remoteCallsThisRun = 0;
  #tickPromise: Promise<ReconcileJob | null> | null = null;
  #stopped = false;
  #generation = 0;
  readonly #delivery: Pick<ProjectionDelivery, "drain">;

  constructor(kernel: Kernel, store: MaintenanceStore, broker: GraphRequestBroker, options: MaintenanceCoordinatorOptions, cognition: CognitionExecutor, profile: ExecutionProfile) {
    this.#kernel = kernel;
    this.#store = store;
    this.#broker = broker;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#context = new ContextAssociations(store, this.#now);
    this.#intervalMs = options.intervalMs ?? 1_000;
    this.#maxAttempts = options.maxAttempts ?? 5;
    this.#retryBackoffMs = options.retryBackoffMs ?? 30_000;
    this.#onRecordSourceChange = options.onRecordSourceChange ?? null;
    this.#cognition = cognition;
    this.#profile = profile;
    this.#scope = options.scope ?? null;
    this.#delivery = options.delivery;
  }

  start(): void {
    if (this.#timer) return;
    this.#stopped = false;
    this.#timer = setInterval(() => { void this.tick().catch((error) => console.warn("[maintenance] tick failed", error)); }, this.#intervalMs);
  }

  settled(): Promise<void> { return this.#tickPromise?.then(() => undefined) ?? Promise.resolve(); }

  stop(): void {
    this.#stopped = true; this.#generation++;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  recordSourceChange(observation: SourceChangeObservation): { coverage: SourceCoverageState; job: ReconcileJob } {
    const object = this.#store.getWorkObject(observation.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new Error("MAINTENANCE_TARGET_NOT_FOUND");
    if (object.lifecycle !== "OPEN") throw new Error("MAINTENANCE_TARGET_NOT_OPEN");
    if (observation.graphId !== anchor.graphId) throw new Error("SOURCE_CHANGE_ANCHOR_MISMATCH");
    if (observation.sourceBlockUuid !== anchor.externalId && this.#autonomousAllowed(object.id)) {
      const existing = this.#store.findActiveContextAssociation(object.id, observation.graphId, observation.sourceBlockUuid);
      if (!existing) {
        try {
          this.#context.associateContext({
            workObjectId: object.id,
            sourceRef: { graphId: observation.graphId, blockUuid: observation.sourceBlockUuid },
            sourceVersionHash: observation.sourceContentHash,
            origin: "SYSTEM_STRUCTURAL",
            at: observation.observedAt,
          });
        } catch (error) {
          if (!(error instanceof KernelError && error.code === "ASSOCIATION_CORRECTION_BLOCKS")) throw error;
          // Reconciliation still reads the delta when a user correction blocks association.
        }
      }
    }
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
      sourceSnapshotId: snapshotId, sourceBlockUuid: observation.sourceBlockUuid, formalVersion: object.version, semanticRevision: currentSemanticRevision(this.#store, object.id) ?? "missing", priorityClass: "NORMAL", attempt: 0, notBefore: null,
      status: "QUEUED", lastError: null, lastOutcome: null, createdAt: at, updatedAt: at,
    };
    this.#store.enqueueReconcileJob(job);
    this.#onRecordSourceChange?.(object.id);
    return { coverage: this.#store.getSourceCoverage(object.id)!, job };
  }

  manualReconcile(workObjectId: string, priorityClass: ReconcilePriorityClass = "INTERACTIVE"): ReconcileJob {
    const object = this.#store.getWorkObject(workObjectId);
    if (!object || object.lifecycle !== "OPEN") throw new Error("MAINTENANCE_TARGET_NOT_FOUND");
    const coverage = this.#store.getSourceCoverage(workObjectId);
    const snapshotId = coverage?.lastObservedSourceSnapshotId ?? stableHash([workObjectId, "no-source-observation"]);
    const at = this.#now();
    const job: ReconcileJob = {
      id: `reconcile:manual:${workObjectId}:${randomUUID()}`, workObjectId, triggerType: "MANUAL_RECONCILE",
      sourceSnapshotId: snapshotId, sourceBlockUuid: null, formalVersion: object.version, semanticRevision: currentSemanticRevision(this.#store, workObjectId) ?? "missing", priorityClass, attempt: 0, notBefore: null, status: "QUEUED",
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

  tick(): Promise<ReconcileJob | null> {
    if (this.#stopped) return Promise.resolve(null);
    if (this.#tickPromise) return this.#tickPromise;
    const promise = this.#tick(this.#generation);
    this.#tickPromise = promise;
    const clear = () => { if (this.#tickPromise === promise) this.#tickPromise = null; };
    void promise.then(clear, clear);
    return promise;
  }

  async #tick(generation: number): Promise<ReconcileJob | null> {
    this.#remoteCallsThisRun = 0;
    await this.#delivery.drain(() => !this.#stopped && generation === this.#generation).catch((error) => console.warn("[maintenance] projection drain failed", error));
    if (this.#stopped || generation !== this.#generation) return null;
    const at = this.#now();
    const job = this.#store.claimNextReconcileJob(at);
    if (!job) return null;
    const interactive = job.priorityClass === "INTERACTIVE";
    const globalPaused = this.#store.isMaintenancePaused("global");
    const objectPaused = this.#store.isMaintenancePaused(`object:${job.workObjectId}`);
    if (!interactive && (globalPaused || objectPaused)) {
      return this.#requeue(job, "MAINTENANCE_PAUSED");
    }
    if (!interactive && !this.#autonomousAllowed(job.workObjectId)) {
      return this.#store.completeReconcileJobSkipped(job.id, this.#now(), "SKIPPED_BY_DOGFOOD_SCOPE");
    }
    try {
      const object = this.#store.getWorkObject(job.workObjectId);
      const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
      if (!object || !anchor) throw new Error("MAINTENANCE_TARGET_NOT_FOUND");
      if (object.lifecycle !== "OPEN") {
        return this.#store.completeReconcileJobAsSuperseded(job.id, this.#now());
      }
      const revision = currentSemanticRevision(this.#store, object.id) ?? "missing";
      if (job.semanticRevision && job.semanticRevision !== revision) {
        const next = new Date(Date.parse(at) + this.#retryBackoffMs).toISOString();
        return this.#store.refreshReconcileJobSemanticRevision(job.id, object.version, revision, next, at);
      }
      const status = this.#broker.status();
      if (!status.available || !status.graphId) throw new Error("GRAPH_ADAPTER_OFFLINE");
      const expectedObserved = this.#store.getSourceCoverage(object.id)?.lastObservedSourceSnapshotId ?? null;
      const observed = { snapshotId: "" };
      const outcome = await this.#reconcileOpenObject(object.id, job.sourceBlockUuid ?? anchor.externalId, job, observed);
      if (outcome === "SUPERSEDED") return this.#store.getReconcileJob(job.id);
      this.#store.completeReconcileJob(job.id, object.id, observed.snapshotId, this.#store.getWorkObject(object.id)!.version, this.#now(), outcome, expectedObserved);
      this.#store.recordMaintenanceSuccess("global", this.#now());
      return this.#store.getReconcileJob(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : "MAINTENANCE_FAILED";
      if (message === "RECONCILE_SOURCE_SUPERSEDED") return this.#store.completeReconcileJobAsSuperseded(job.id, this.#now());
      if (message === "DEFERRED_BY_BUDGET") return this.#defer(job, "DEFERRED_BY_BUDGET", new Date(Date.parse(at) + 3_600_000).toISOString());
      this.#store.recordMaintenanceFailure("global", this.#now());
      return this.#requeue(job, message);
    }
  }

  /** Supported callers share the same serialized delivery capability. */
  drainProjectionObligations(): Promise<number> { return this.#delivery.drain(() => !this.#stopped); }

  #requeue(job: ReconcileJob, reason: string): ReconcileJob {
    const next = new Date(Date.parse(this.#now()) + this.#retryBackoffMs * Math.min(2 ** Math.max(0, job.attempt - 1), 8)).toISOString();
    return this.#store.failReconcileJob(job.id, reason, next, this.#now(), this.#maxAttempts);
  }

  #defer(job: ReconcileJob, reason: string, nextNotBefore: string): ReconcileJob {
    return this.#store.deferReconcileJob(job.id, reason, nextNotBefore, this.#now());
  }

  /** Autonomous governance is allowed only when no rollout scope is configured or the object is currently inside the configured dogfood scope. */
  #autonomousAllowed(workObjectId: string): boolean {
    return !this.#scope || (this.#scope.isMaintenanceEnabled() && this.#scope.isInScope(workObjectId));
  }

  async #reconcileOpenObject(workObjectId: string, sourceBlockUuid: string, job: ReconcileJob, observed: { snapshotId: string }): Promise<MaintenanceReconcileOutcome> {
    const object = this.#store.getWorkObject(workObjectId)!;
    const target = this.#kernel.targetSnapshotInput(workObjectId);
    const snapshot = response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: target }), "READ_TARGET_SNAPSHOT").snapshot;
    if (this.#superseded(job)) {
      this.#store.completeReconcileJobAsSuperseded(job.id, this.#now());
      return "SUPERSEDED";
    }
    const pack = await this.#buildContextPack(object, target.graphId, sourceBlockUuid);
    const delta = pack.find((item) => item.role === "SOURCE_DELTA");
    if (sourceBlockUuid !== target.sourceBlockUuid && !delta) throw new Error("RECONCILE_SOURCE_NOT_OBSERVED");
    observed.snapshotId = stableHash([workObjectId, target.graphId, sourceBlockUuid, delta?.sourceHash ?? snapshot.sourceContentHash, snapshot.sourceMarker ?? null, pack.filter((item) => item.sourceRef).map((item) => [item.sourceRef, item.sourceHash])]);
    this.#reserveRemoteCall();
    const judgment = await this.#cognition.judge({ object, contextPack: pack, openIssues: this.#store.listGovernanceIssues(workObjectId, "OPEN"), profile: this.#profile });
    if (this.#superseded(job) || this.#store.getWorkObject(workObjectId)?.version !== object.version) {
      this.#store.completeReconcileJobAsSuperseded(job.id, this.#now());
      return "SUPERSEDED";
    }
    const byHandle = new Map(pack.map((item) => [item.handle, item]));
    const handles = (value: string[]): ContextPackItem[] => value.map((handle) => byHandle.get(handle)).filter((item): item is ContextPackItem => Boolean(item));
    const selectedItems = handles(this.#selectedHandles(judgment));
    const evidenceIds = await this.#freezeSelected(workObjectId, job.id, selectedItems);
    const dimension = judgment.dimension;
    const issueKey = stableHash([workObjectId, judgment.kind, dimension, ...selectedItems.map((item) => {
      if (item.sourceRef) return `source:${item.sourceRef.graphId}:${item.sourceRef.blockUuid}`;
      if (item.role === "FORMAL_STATE") return `formal-state:${item.workObjectId ?? "unknown"}`;
      throw new Error("CONTEXT_ITEM_SOURCE_IDENTITY_MISSING");
    }).sort()]);

    if (judgment.kind === "CONFIRMED_CHANGE") {
      if (this.#superseded(job)) {
        this.#store.completeReconcileJobAsSuperseded(job.id, this.#now());
        return "SUPERSEDED";
      }
      const evidence = await this.#freshEvidence(evidenceIds, handles(judgment.supportingContextHandles).map((item) => item.sourceRef!).filter(Boolean));
      if (judgment.proposedOperation.type === "SET_CURRENT_FOCUS") {
        const runId = `cognition-focus:${job.id}`;
        this.#kernel.startExternalAgentRun({ runId, purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId, evidenceIds, executorId: this.#cognition.id, snapshot });
        const finished = this.#kernel.finishExternalAgentRun({ runId, result: { outcome: "PROPOSAL", currentFocus: judgment.proposedOperation.currentFocus, reasonCode: "CONTEXT_AWARE_FOCUS", rationaleSummary: judgment.rationaleSummary } });
        this.#kernel.applyProposalFormal({ operationId: `cognition-focus-apply:${job.id}`, proposalId: finished.proposal!.id, snapshot: response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: this.#kernel.targetSnapshotInput(workObjectId) }), "READ_TARGET_SNAPSHOT").snapshot, evidence });
        await this.#delivery.drain(() => !this.#stopped);
      } else {
        const runId = `cognition-engagement:${job.id}`;
        this.#kernel.startExternalAgentRun({ runId, purpose: "ENGAGEMENT_RECONCILIATION", workObjectId, evidenceIds, executorId: this.#cognition.id, snapshot });
        const finished = this.#kernel.finishExternalAgentRun({ runId, result: { outcome: "PROPOSAL", transition: judgment.proposedOperation.transition, reasonCode: "CONTEXT_AWARE_ENGAGEMENT", rationaleSummary: judgment.rationaleSummary } });
        this.#kernel.applyEngagementProposalFormal({ operationId: `cognition-engagement-apply:${job.id}`, proposalId: finished.proposal!.id, snapshot: response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: this.#kernel.targetSnapshotInput(workObjectId) }), "READ_TARGET_SNAPSHOT").snapshot, evidence });
        await this.#delivery.drain(() => !this.#stopped);
      }
      for (const id of judgment.resolvesIssueIds ?? []) this.#resolveIssueIfMatching(workObjectId, id, judgment.dimension);
      return "CONFIRMED_CHANGE";
    }
    if (judgment.kind === "NO_CHANGE") {
      for (const id of judgment.resolvesIssueIds ?? []) this.#resolveIssueIfMatching(workObjectId, id, judgment.dimension);
      return "NO_CHANGE";
    }
    if (judgment.kind === "UNKNOWN") {
      this.#kernel.upsertGovernanceIssue({ workObjectId, dimension: judgment.dimension, type: "UNKNOWN", summary: judgment.summary, evidenceIds, sourceSnapshotId: issueKey, formalVersion: object.version, correlationId: job.id });
      return "UNKNOWN";
    }
    if (judgment.kind === "CONFLICT") {
      this.#kernel.upsertGovernanceIssue({ workObjectId, dimension: judgment.dimension, type: "CONFLICT", summary: judgment.summary, evidenceIds, sourceSnapshotId: issueKey, formalVersion: object.version, correlationId: job.id });
      return "CONFLICT";
    }
    this.#kernel.upsertGovernanceIssue({ workObjectId, dimension: judgment.dimension, type: "BOUNDARY_CANDIDATE", summary: judgment.summary, evidenceIds, sourceSnapshotId: issueKey, formalVersion: object.version, correlationId: job.id });
    return "BOUNDARY_CANDIDATE";
  }

  #superseded(job: ReconcileJob): boolean {
    return this.#store.hasQueuedReconcileJobNewerThan(job.workObjectId, job.id, job.createdAt);
  }

  #reserveRemoteCall(): void {
    if (this.#profile.executor === "FAKE" || !this.#profile.remoteEnabled) return;
    const runLimit = this.#profile.maxRemoteCallsPerRun ?? 1;
    if (this.#remoteCallsThisRun >= runLimit) throw new Error("DEFERRED_BY_BUDGET");
    const hourLimit = this.#profile.maxRemoteCallsPerHour;
    if (hourLimit && !this.#store.consumeRemoteCallBudget(`remote:${this.#profile.id}`, hourLimit, this.#now())) throw new Error("DEFERRED_BY_BUDGET");
    this.#remoteCallsThisRun += 1;
  }

  #selectedHandles(judgment: SemanticJudgment): string[] {
    const raw = judgment.kind === "CONFIRMED_CHANGE" ? judgment.supportingContextHandles
      : judgment.kind === "CONFLICT" ? judgment.conflictingContextHandles
      : judgment.kind === "UNKNOWN" || judgment.kind === "BOUNDARY_CANDIDATE" ? judgment.relevantContextHandles
      : judgment.supportingContextHandles ?? [];
    return [...new Set(raw)];
  }

  #resolveIssueIfMatching(workObjectId: string, issueId: string, dimension: GovernanceDimension): void {
    const issue = this.#store.getGovernanceIssue(issueId);
    if (issue && issue.workObjectId === workObjectId && issue.status === "OPEN" && issue.dimension === dimension) this.#kernel.resolveGovernanceIssue(issue.id);
  }

  async #buildContextPack(object: { id: string; kind: string; title: string; lifecycle: string; engagement: string | null; waitingCondition: { description: string } | null; currentFocus: string | null; desiredOutcome: string | null; completionChecks: readonly string[]; version: number }, graphId: string, sourceBlockUuid: string): Promise<ContextPackItem[]> {
    const scope = new Set(this.#profile.allowedDataScope);
    const pack: ContextPackItem[] = [];
    if (scope.has("FORMAL_STATE") || scope.has("formal_state")) {
      pack.push({ handle: "F0", role: "FORMAL_STATE", sourceRef: null, sourceHash: null, workObjectId: object.id, content: JSON.stringify({ id: object.id, kind: object.kind, title: object.title, lifecycle: object.lifecycle, engagement: object.engagement, waitingCondition: object.waitingCondition, currentFocus: object.currentFocus, desiredOutcome: object.desiredOutcome, completionChecks: object.completionChecks, version: object.version }) });
    }
    let handleIndex = 0;
    const add = (role: ContextPackItem["role"], sourceRef: SourceRef | null, content: string, sourceHash: string | null): string => {
      const handle = role === "SOURCE_DELTA" ? "S0" : `C${++handleIndex}`;
      pack.push({ handle, role, sourceRef, sourceHash, content, workObjectId: object.id });
      return handle;
    };
    if (scope.has("SOURCE_DELTA") || scope.has("current_workobject_context")) {
      const block = response(await this.#broker.request({ kind: "READ_BLOCK", graphId, blockUuid: sourceBlockUuid }), "READ_BLOCK").block;
      add("SOURCE_DELTA", { graphId, blockUuid: sourceBlockUuid }, block.content, block.contentHash);
    }
    if (scope.has("CURRENT_WORKOBJECT_CONTEXT") || scope.has("current_workobject_context")) {
      for (const context of this.#store.listContextAssociations(object.id, "ACTIVE").slice(0, this.#profile.maxContextItems)) {
        try {
          const block = response(await this.#broker.request({ kind: "READ_BLOCK", graphId: context.sourceRef.graphId, blockUuid: context.sourceRef.blockUuid }), "READ_BLOCK").block;
          add("ASSOCIATED_CONTEXT", context.sourceRef, block.content, block.contentHash);
        } catch { /* missing context must not block */ }
      }
      const recentEvidence = this.#store.listEvidence(object.id).sort((a, b) => b.frozenAt.localeCompare(a.frozenAt) || b.id.localeCompare(a.id)).slice(0, 3);
      for (const evidence of recentEvidence) {
        add("HISTORICAL_EVIDENCE", { graphId: evidence.graphId, blockUuid: evidence.locator.blockUuid }, evidence.frozenContent, evidence.contentHash);
      }
    }
    const capped = pack.slice(0, Math.max(0, this.#profile.maxContextItems));
    const truncated: ContextPackItem[] = [];
    let used = 0;
    for (const item of capped) {
      const remaining = Math.max(0, this.#profile.maxInputChars) - used;
      if (remaining <= 0) break;
      truncated.push({ ...item, content: item.content.slice(0, Math.max(0, remaining)) });
      used += truncated[truncated.length - 1]!.content.length;
    }
    return truncated;
  }

  async #freezeSelected(workObjectId: string, jobId: string, items: ContextPackItem[]): Promise<string[]> {
    const ids: string[] = [];
    for (const [index, item] of items.filter((entry) => entry.sourceRef).entries()) {
      const id = `cognition-evidence:${jobId}:${index}`;
      const material = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: item.sourceRef!.graphId, blockUuid: item.sourceRef!.blockUuid }), "READ_EVIDENCE").material;
      this.#kernel.freezeEvidence({ evidenceId: id, workObjectId, snapshot: material });
      ids.push(id);
    }
    return ids;
  }

  async #freshEvidence(evidenceIds: string[], refs: Array<SourceRef>): Promise<Array<{ evidenceId: string } & { graphId: string; blockUuid: string; content: string; sourceContentHash: string; proof: string }>> {
    const result: Array<{ evidenceId: string } & { graphId: string; blockUuid: string; content: string; sourceContentHash: string; proof: string }> = [];
    for (const [index, id] of evidenceIds.entries()) {
      const ref = refs[index];
      if (!ref) continue;
      const material = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: ref.graphId, blockUuid: ref.blockUuid }), "READ_EVIDENCE").material;
      result.push({ evidenceId: id, ...material });
    }
    return result;
  }
}
