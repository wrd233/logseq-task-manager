import { deterministicUuid, stableHash, type CognitionExecutor, type ContextPackItem, type ExecutionProfile, type GraphEffect, type GraphGatewayResponse, type MaintenanceReconcileOutcome, type ReconcileJob, type ReconcilePriorityClass, type SemanticJudgment, type SourceChangeObservation, type SourceCoverageState, type SourceRef } from "@task-copilot/contracts";
import type { Kernel } from "@task-copilot/kernel";
import type { SqliteStore } from "@task-copilot/sqlite";
import type { GraphRequestBroker } from "./graph-broker.ts";

function response<T extends GraphGatewayResponse["kind"]>(value: GraphGatewayResponse, kind: T): Extract<GraphGatewayResponse, { kind: T }> {
  if (value.kind !== kind) throw new Error("GRAPH_RESPONSE_KIND_MISMATCH");
  return value as Extract<GraphGatewayResponse, { kind: T }>;
}

export const FAKE_COGNITION_PROFILE: ExecutionProfile = {
  id: "builtin-fake", executor: "FAKE", remoteEnabled: false, allowedDataScope: ["formal_state", "current_workobject_context"],
  maxContextItems: 12, maxInputChars: 24_000, timeoutMs: 5_000, retryBudget: 2, credentialRef: null,
};

export interface MaintenanceCoordinatorOptions {
  now?: (() => string) | undefined;
  intervalMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  cognitionExecutor?: CognitionExecutor;
  executionProfile?: ExecutionProfile;
}

export class MaintenanceCoordinator {
  readonly #kernel: Kernel;
  readonly #store: SqliteStore;
  readonly #broker: GraphRequestBroker;
  readonly #now: () => string;
  readonly #intervalMs: number;
  readonly #maxAttempts: number;
  readonly #retryBackoffMs: number;
  readonly #cognition: CognitionExecutor;
  readonly #profile: ExecutionProfile;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(kernel: Kernel, store: SqliteStore, broker: GraphRequestBroker, options: MaintenanceCoordinatorOptions = {}, cognition: CognitionExecutor, profile: ExecutionProfile) {
    this.#kernel = kernel;
    this.#store = store;
    this.#broker = broker;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#intervalMs = options.intervalMs ?? 1_000;
    this.#maxAttempts = options.maxAttempts ?? 5;
    this.#retryBackoffMs = options.retryBackoffMs ?? 30_000;
    this.#cognition = cognition;
    this.#profile = profile;
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
    if (observation.graphId !== anchor.graphId) throw new Error("SOURCE_CHANGE_ANCHOR_MISMATCH");
    if (observation.sourceBlockUuid !== anchor.externalId) {
      const existing = this.#store.findActiveContextAssociation(object.id, observation.graphId, observation.sourceBlockUuid);
      if (!existing) {
        try {
          this.#kernel.associateContext({
            workObjectId: object.id,
            sourceRef: { graphId: observation.graphId, blockUuid: observation.sourceBlockUuid },
            sourceVersionHash: observation.sourceContentHash,
            origin: "SYSTEM_STRUCTURAL",
            at: observation.observedAt,
          });
        } catch { /* correction may block automatic association; the job below still lets reconciliation read the delta */ }
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
      sourceSnapshotId: snapshotId, sourceBlockUuid: observation.sourceBlockUuid, formalVersion: object.version, priorityClass: "NORMAL", attempt: 0, notBefore: null,
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
      sourceSnapshotId: snapshotId, sourceBlockUuid: null, formalVersion: object.version, priorityClass, attempt: 0, notBefore: null, status: "QUEUED",
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
    await this.drainProjectionObligations().catch((error) => console.warn("[maintenance] projection drain failed", error));
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
      const outcome = await this.#reconcileOpenObject(object.id, job.sourceBlockUuid ?? anchor.externalId, job);
      this.#store.completeReconcileJob(job.id, object.id, job.sourceSnapshotId, object.version, this.#now(), outcome);
      return this.#store.getReconcileJob(job.id);
    } catch (error) {
      return this.#requeue(job, error instanceof Error ? error.message.slice(0, 200) : "MAINTENANCE_FAILED");
    }
  }

  /** Drain durable projection obligations: formal truth already committed; Graph converges here. */
  async drainProjectionObligations(): Promise<number> {
    const status = this.#broker.status();
    if (!status.available) return 0;
    const at = this.#now();
    let drained = 0;
    for (const obligation of this.#store.listProjectionObligations()) {
      if (obligation.status !== "PENDING" && obligation.status !== "FAILED") continue;
      if (obligation.retryExhausted) continue;
      if (obligation.nextAttemptAt && obligation.nextAttemptAt > at) continue;
      const commit = this.#store.getCommit(obligation.commitId);
      if (!commit || commit.status !== "COMMITTED") continue;
      const effect = commit.graphEffect as GraphEffect;
      try {
        const applied = response(await this.#broker.request({ kind: "APPLY_EFFECT", effect }), "APPLY_EFFECT");
        this.#kernel.verifyFormalProjection(commit.id, applied.result, applied.snapshot);
        drained += 1;
      } catch (error) {
        this.#kernel.graphProjectionFailed(commit.id, error instanceof Error ? error.message.slice(0, 200) : "PROJECTION_APPLY_FAILED");
      }
    }
    return drained;
  }

  #requeue(job: ReconcileJob, reason: string): ReconcileJob {
    const next = new Date(Date.parse(this.#now()) + this.#retryBackoffMs * Math.min(2 ** Math.max(0, job.attempt - 1), 8)).toISOString();
    return this.#store.failReconcileJob(job.id, reason, next, this.#now(), this.#maxAttempts);
  }

  async #reconcileOpenObject(workObjectId: string, sourceBlockUuid: string, job: ReconcileJob): Promise<MaintenanceReconcileOutcome> {
    const object = this.#store.getWorkObject(workObjectId)!;
    const target = this.#kernel.targetSnapshotInput(workObjectId);
    const snapshot = response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: target }), "READ_TARGET_SNAPSHOT").snapshot;
    const pack = await this.#buildContextPack(object, target.graphId, sourceBlockUuid);
    const judgment = await this.#cognition.judge({ object, contextPack: pack, openIssues: this.#store.listGovernanceIssues(workObjectId, "OPEN"), profile: this.#profile });
    const byHandle = new Map(pack.map((item) => [item.handle, item]));
    const handles = (value: string[]): ContextPackItem[] => value.map((handle) => byHandle.get(handle)).filter((item): item is ContextPackItem => Boolean(item));
    const evidenceIds = await this.#freezeSelected(workObjectId, job.id, handles(this.#selectedHandles(judgment)));
    const issueKey = stableHash([workObjectId, judgment.kind === "NO_CHANGE" ? "no-change" : "kind" in judgment ? judgment.kind : "", "dimension" in judgment ? judgment.dimension : "", "summary" in judgment ? (judgment as { summary?: string }).summary ?? "" : "rationaleSummary" in judgment ? (judgment as { rationaleSummary?: string }).rationaleSummary ?? "" : ""]);

    if (judgment.kind === "CONFIRMED_CHANGE") {
      const evidence = await this.#freshEvidence(evidenceIds, handles(judgment.supportingContextHandles).map((item) => item.sourceRef!).filter(Boolean));
      if (judgment.proposedOperation.type === "SET_CURRENT_FOCUS") {
        const runId = `cognition-focus:${job.id}`;
        this.#kernel.startExternalAgentRun({ runId, purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId, evidenceIds, executorId: this.#cognition.id, snapshot });
        const finished = this.#kernel.finishExternalAgentRun({ runId, result: { outcome: "PROPOSAL", currentFocus: judgment.proposedOperation.currentFocus, reasonCode: "CONTEXT_AWARE_FOCUS", rationaleSummary: judgment.rationaleSummary } });
        const formal = this.#kernel.applyProposalFormal({ operationId: `cognition-focus-apply:${job.id}`, proposalId: finished.proposal!.id, snapshot: response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: this.#kernel.targetSnapshotInput(workObjectId) }), "READ_TARGET_SNAPSHOT").snapshot, evidence });
        const applied = response(await this.#broker.request({ kind: "APPLY_EFFECT", effect: formal.graphEffect }), "APPLY_EFFECT");
        this.#kernel.verifyFormalProjection(formal.commit.id, applied.result, applied.snapshot);
      } else {
        const runId = `cognition-engagement:${job.id}`;
        this.#kernel.startExternalAgentRun({ runId, purpose: "ENGAGEMENT_RECONCILIATION", workObjectId, evidenceIds, executorId: this.#cognition.id, snapshot });
        const finished = this.#kernel.finishExternalAgentRun({ runId, result: { outcome: "PROPOSAL", transition: judgment.proposedOperation.transition, reasonCode: "CONTEXT_AWARE_ENGAGEMENT", rationaleSummary: judgment.rationaleSummary } });
        const formal = this.#kernel.applyEngagementProposalFormal({ operationId: `cognition-engagement-apply:${job.id}`, proposalId: finished.proposal!.id, snapshot: response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: this.#kernel.targetSnapshotInput(workObjectId) }), "READ_TARGET_SNAPSHOT").snapshot, evidence });
        const applied = response(await this.#broker.request({ kind: "APPLY_EFFECT", effect: formal.graphEffect }), "APPLY_EFFECT");
        this.#kernel.verifyFormalProjection(formal.commit.id, applied.result, applied.snapshot);
      }
      for (const id of judgment.resolvesIssueIds ?? []) this.#resolveIssueIfMatching(workObjectId, id);
      return "CONFIRMED_CHANGE";
    }
    if (judgment.kind === "NO_CHANGE") {
      for (const id of judgment.resolvesIssueIds ?? []) this.#resolveIssueIfMatching(workObjectId, id);
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

  #selectedHandles(judgment: SemanticJudgment): string[] {
    const raw = judgment.kind === "CONFIRMED_CHANGE" ? judgment.supportingContextHandles
      : judgment.kind === "CONFLICT" ? judgment.conflictingContextHandles
      : judgment.kind === "UNKNOWN" || judgment.kind === "BOUNDARY_CANDIDATE" ? judgment.relevantContextHandles
      : judgment.supportingContextHandles ?? [];
    return [...new Set(raw)];
  }

  #resolveIssueIfMatching(workObjectId: string, issueId: string): void {
    const issue = this.#store.getGovernanceIssue(issueId);
    if (issue && issue.workObjectId === workObjectId && issue.status === "OPEN") this.#kernel.resolveGovernanceIssue(issue.id);
  }

  async #buildContextPack(object: { id: string; kind: string; title: string; lifecycle: string; engagement: string | null; waitingCondition: { description: string } | null; currentFocus: string | null; desiredOutcome: string | null; completionChecks: readonly string[]; version: number }, graphId: string, sourceBlockUuid: string): Promise<ContextPackItem[]> {
    const pack: ContextPackItem[] = [{
      handle: "F0", role: "FORMAL_STATE", sourceRef: null, sourceHash: null, workObjectId: object.id,
      content: JSON.stringify({ id: object.id, kind: object.kind, title: object.title, lifecycle: object.lifecycle, engagement: object.engagement, waitingCondition: object.waitingCondition, currentFocus: object.currentFocus, desiredOutcome: object.desiredOutcome, completionChecks: object.completionChecks, version: object.version }),
    }];
    let handleIndex = 0;
    const add = (role: ContextPackItem["role"], sourceRef: SourceRef | null, content: string, sourceHash: string | null): string => {
      const handle = role === "SOURCE_DELTA" ? "S0" : `C${++handleIndex}`;
      pack.push({ handle, role, sourceRef, sourceHash, content, workObjectId: object.id });
      return handle;
    };
    try {
      const block = response(await this.#broker.request({ kind: "READ_BLOCK", graphId, blockUuid: sourceBlockUuid }), "READ_BLOCK").block;
      add("SOURCE_DELTA", { graphId, blockUuid: sourceBlockUuid }, block.content, block.contentHash);
    } catch { /* source delta can be absent */ }
    for (const context of this.#store.listContextAssociations(object.id, "ACTIVE").slice(0, this.#profile.maxContextItems - 2)) {
      try {
        const block = response(await this.#broker.request({ kind: "READ_BLOCK", graphId: context.sourceRef.graphId, blockUuid: context.sourceRef.blockUuid }), "READ_BLOCK").block;
        add("ASSOCIATED_CONTEXT", context.sourceRef, block.content, block.contentHash);
      } catch { /* missing context must not block */ }
    }
    return pack;
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
