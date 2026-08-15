import { randomUUID } from "node:crypto";

import { deterministicUuid, stableHash, type ContextAssociation, type DecisionPackage, type DiscoveryExecutor, type DiscoveryExistingObject, type DiscoveryJudgment, type DiscoveryOpenCandidateSummary, type DiscoveryPackItem, type DiscoveryRun, type DiscoveryRunSourceOutcome, type DiscoveryScope, type ExecutionProfile, type FormalizationCandidate, type FormalizationEvidence, type GraphGatewayResponse, type OrganizeTodayResult, type ReconcileJob } from "@task-copilot/contracts";
import type { Kernel } from "@task-copilot/kernel";
import type { SqliteStore } from "@task-copilot/sqlite";
import type { GraphRequestBroker } from "./graph-broker.ts";
import type { MaintenanceCoordinator } from "./maintenance-coordinator.ts";

function response<T extends GraphGatewayResponse["kind"]>(value: GraphGatewayResponse, kind: T): Extract<GraphGatewayResponse, { kind: T }> {
  if (value.kind !== kind) throw new Error("GRAPH_RESPONSE_KIND_MISMATCH");
  return value as Extract<GraphGatewayResponse, { kind: T }>;
}

export interface DiscoveryCoordinatorOptions {
  now?: () => string;
  journalPageNames?: (date: string) => string[];
  organizeBatchLimit?: number;
}

function isoDay(date: string): string { return date.slice(0, 10); }

function scopeKey(scope: DiscoveryScope): string {
  if (scope.kind === "TODAY") return stableHash(["TODAY", isoDay(scope.date)]);
  if (scope.kind === "RECENT_WINDOW") return stableHash(["RECENT_WINDOW", isoDay(scope.from), isoDay(scope.to)]);
  if (scope.kind === "PAGE") return stableHash(["PAGE", scope.graphId, scope.pageName]);
  if (scope.kind === "SUBTREE") return stableHash(["SUBTREE", scope.graphId, scope.pageName, scope.blockUuid]);
  return stableHash(["EXPLICIT_SOURCE_SET", ...scope.sources.map((source) => `${source.graphId}:${source.blockUuid}`).sort()]);
}

interface ResolvedBlock {
  sourceRef: ContextAssociation["sourceRef"];
  content: string;
  sourceHash: string;
  observedAt: string;
}

interface ContinuationPayload {
  refs: Array<{ graphId: string; blockUuid: string; sourceHash: string }>;
}

function encodeContinuation(refs: ResolvedBlock[]): string | null {
  if (!refs.length) return null;
  const payload: ContinuationPayload = { refs: refs.map((item) => ({ graphId: item.sourceRef.graphId, blockUuid: item.sourceRef.blockUuid, sourceHash: item.sourceHash })) };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeContinuation(token: string | null): ContinuationPayload | null {
  if (!token) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as ContinuationPayload;
    return Array.isArray(parsed.refs) ? parsed : null;
  } catch { return null; }
}

const keyOf = (ref: { graphId: string; blockUuid: string }) => `${ref.graphId}:${ref.blockUuid}`;

export class DiscoveryCoordinator {
  readonly #kernel: Kernel;
  readonly #store: SqliteStore;
  readonly #broker: GraphRequestBroker;
  readonly #maintenance: MaintenanceCoordinator;
  readonly #executor: DiscoveryExecutor;
  readonly #profile: ExecutionProfile;
  readonly #now: () => string;
  readonly #journalPageNames: (date: string) => string[];
  readonly #organizeBatchLimit: number;

  constructor(kernel: Kernel, store: SqliteStore, broker: GraphRequestBroker, maintenance: MaintenanceCoordinator, executor: DiscoveryExecutor, profile: ExecutionProfile, options: DiscoveryCoordinatorOptions = {}) {
    this.#kernel = kernel;
    this.#store = store;
    this.#broker = broker;
    this.#maintenance = maintenance;
    this.#executor = executor;
    this.#profile = profile;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#journalPageNames = options.journalPageNames ?? ((date) => [date, date.replaceAll("-", "_"), `journal/${date}`, `journal/${date.replaceAll("-", "_")}`]);
    this.#organizeBatchLimit = options.organizeBatchLimit ?? 3;
  }

  listRuns(): DiscoveryRun[] { return this.#store.listDiscoveryRuns(); }
  getRun(id: string): DiscoveryRun | null { return this.#store.getDiscoveryRun(id); }
  listCandidates(status?: FormalizationCandidate["status"]): FormalizationCandidate[] { return this.#store.listFormalizationCandidates(status); }
  getCandidate(id: string): FormalizationCandidate | null { return this.#store.getFormalizationCandidate(id); }
  listCandidateEvidence(candidateId: string): FormalizationEvidence[] { return this.#store.listCandidateEvidence(candidateId); }

  async runDiscovery(scope: DiscoveryScope, input: { continuationToken?: string | null } = {}): Promise<DiscoveryRun> {
    const at = this.#now();
    const runId = `discovery:${randomUUID()}`;
    const startedMs = Date.now();
    const run: DiscoveryRun = {
      id: runId, scope, executorId: this.#executor.id, modelAlias: this.#profile.modelAlias ?? null, status: "RUNNING",
      sourceCount: 0, scopeTotal: 0, selectedCount: 0, processedCount: 0, coveredCount: 0, remainingCount: 0,
      continuationToken: input.continuationToken ?? null, associationCount: 0, noCandidateCount: 0, candidateIds: [],
      summaryText: "", latencyMs: 0, tokenUsage: null, error: null, startedAt: at, completedAt: null,
    };
    try {
      const all = await this.#readScopeBlocks(scope);
      run.scopeTotal = all.length;
      const { kept, skipped } = this.#prefilter(all);
      const continuation = decodeContinuation(input.continuationToken ?? null);
      let batch = kept.slice(0, Math.max(0, this.#profile.maxContextItems));
      if (continuation) {
        const wanted = new Map(continuation.refs.map((ref) => [keyOf(ref), ref]));
        batch = wanted.size ? [...wanted.values()].map((ref) => kept.find((item) => keyOf(item.sourceRef) === keyOf(ref))).filter((item): item is ResolvedBlock => Boolean(item)).slice(0, Math.max(0, this.#profile.maxContextItems)) : [];
      }
      const built = this.#buildItems(batch);
      run.sourceCount = built.items.length;
      run.selectedCount = built.items.length;
      run.remainingCount = Math.max(0, kept.length - built.items.length);
      run.continuationToken = encodeContinuation(kept.slice(built.items.length).slice(0, 500));
      this.#store.putDiscoveryRun(run);

      const sourceOutcomes = new Map<string, DiscoveryRunSourceOutcome>();
      const handled = new Set<string>();
      let invalid = 0;
      const mark = (handles: string[], outcome: DiscoveryRunSourceOutcome["outcome"], reason: string | null, extra: Partial<DiscoveryRunSourceOutcome> = {}) => {
        for (const handle of handles) {
          const item = built.items.find((entry) => entry.handle === handle);
          if (!item || handled.has(handle)) continue;
          handled.add(handle);
          sourceOutcomes.set(handle, { runId, sourceRef: item.sourceRef, sourceHash: item.sourceHash, outcome, reason, candidateId: extra.candidateId ?? null, targetWorkObjectId: extra.targetWorkObjectId ?? null, ...extra });
        }
      };
      for (const item of skipped) {
        sourceOutcomes.set(`skip:${keyOf(item.sourceRef)}`, { runId, sourceRef: item.sourceRef, sourceHash: item.sourceHash, outcome: "NO_CANDIDATE", reason: "ALREADY_COVERED", candidateId: null, targetWorkObjectId: null });
      }

      if (built.items.length > 0) {
        const existingObjects = this.#existingObjects(built.items.length);
        const openCandidates = this.#openCandidateSummaries(built.items.length);
        const judgments = await this.#executor.judge({ scope, contextPack: built.items, existingObjects, openCandidates, profile: this.#profile });
        run.tokenUsage = this.#executor.tokenUsage ?? null;
        run.latencyMs = Date.now() - startedMs;
        const packItem = (handle: string) => built.items.find((item) => item.handle === handle);

        for (const judgment of judgments) {
          if (judgment.kind === "ASSOCIATE_EXISTING") {
            const object = this.#store.getWorkObject(judgment.targetWorkObjectId);
            if (!object) { mark(judgment.sourceHandles, "UNRESOLVED", "TARGET_WORK_OBJECT_NOT_FOUND"); invalid += 1; continue; }
            for (const handle of judgment.sourceHandles) {
              const item = packItem(handle);
              if (!item) { invalid += 1; continue; }
              try {
                this.#kernel.associateContext({ workObjectId: object.id, sourceRef: item.sourceRef, sourceVersionHash: item.sourceHash, origin: "AGENT_INFERRED", basisRunId: runId, at: this.#now() });
                mark([handle], "ASSOCIATED", null, { targetWorkObjectId: object.id });
                run.associationCount += 1;
              } catch (error) {
                mark([handle], "UNRESOLVED", error instanceof Error ? error.message.slice(0, 200) : "ASSOCIATION_REJECTED");
                invalid += 1;
              }
            }
            continue;
          }
          if (judgment.kind === "ATTACH_TO_CANDIDATE") {
            const candidate = this.#store.getFormalizationCandidate(judgment.candidateId);
            const refs = judgment.sourceHandles.map((handle) => packItem(handle)).filter((item): item is DiscoveryPackItem => Boolean(item));
            if (!candidate || candidate.status !== "OPEN" || !refs.length || refs.length !== judgment.sourceHandles.length) {
              mark(judgment.sourceHandles, "UNRESOLVED", "CANDIDATE_ATTACH_INVALID"); invalid += 1; continue;
            }
            this.#store.addCandidateSources(candidate.id, refs.map((item) => item.sourceRef), refs.map((item) => item.sourceHash), refs.map((item) => item.content), at);
            this.#store.addCandidateDiscoveryRun(candidate.id, runId);
            this.#store.updateFormalizationCandidate(candidate.id, { lastObservedAt: at, updatedAt: at });
            mark(judgment.sourceHandles, "ATTACHED", null, { candidateId: candidate.id });
            run.candidateIds = [...new Set([...run.candidateIds, candidate.id])];
            continue;
          }
          if (judgment.kind === "NO_CANDIDATE") {
            mark(judgment.sourceHandles, "NO_CANDIDATE", judgment.reason);
            continue;
          }
          const refs = judgment.sourceHandles.map((handle) => packItem(handle)).filter((item): item is DiscoveryPackItem => Boolean(item));
          if (!refs.length || refs.length !== new Set(judgment.sourceHandles).size) { mark(judgment.sourceHandles, "UNRESOLVED", "DISCOVERY_HANDLE_INVALID"); invalid += 1; continue; }
          if ((judgment.recommendedKind !== "UNRESOLVED" && (!judgment.proposedTitle || !judgment.proposedTitle.trim())) || (judgment.recommendedOwnerId && !this.#store.getWorkObject(judgment.recommendedOwnerId))) {
            mark(judgment.sourceHandles, "UNRESOLVED", "CANDIDATE_RECOMMENDATION_INVALID"); invalid += 1; continue;
          }
          const supportingRefs = judgment.supportingHandles ? judgment.supportingHandles.map((handle) => packItem(handle)).filter((item): item is DiscoveryPackItem => Boolean(item)).map((item) => item.sourceRef) : [];
          const candidate = this.#upsertCandidate(scope, refs, judgment, supportingRefs, runId, at);
          if (candidate.status !== "OPEN") { mark(judgment.sourceHandles, "NO_CANDIDATE", "ALREADY_COVERED"); continue; }
          run.candidateIds = [...new Set([...run.candidateIds, candidate.id])];
          mark(judgment.sourceHandles, "CANDIDATE", null, { candidateId: candidate.id });
        }
        for (const source of built.items) if (!handled.has(source.handle)) { mark([source.handle], "UNRESOLVED", "JUDGMENT_DID_NOT_COVER_SOURCE"); invalid += 1; }
      }

      for (const outcome of sourceOutcomes.values()) this.#store.putDiscoveryRunSource(outcome);
      run.processedCount = handled.size + skipped.length;
      run.coveredCount = handled.size;
      run.noCandidateCount = [...sourceOutcomes.values()].filter((item) => item.outcome === "NO_CANDIDATE").length;
      run.status = invalid > 0 || run.remainingCount > 0 ? "PARTIAL" : "COMPLETED";
      run.summaryText = this.#summary(built.items.length, run.associationCount, run.remainingCount, run.status === "PARTIAL");
      run.completedAt = this.#now();
      run.latencyMs = Date.now() - startedMs;
      this.#store.putDiscoveryRun(run);
      return run;
    } catch (error) {
      run.status = "FAILED";
      run.error = error instanceof Error ? error.message.slice(0, 300) : "DISCOVERY_FAILED";
      run.summaryText = "整理未能完成：Graph 或认知执行器当前不可用，已保留现有状态。";
      run.completedAt = this.#now();
      run.latencyMs = Date.now() - startedMs;
      this.#store.putDiscoveryRun(run);
      return run;
    }
  }

  async matureCandidate(candidateId: string): Promise<{ pkg: DecisionPackage; candidate: FormalizationCandidate; evidence: FormalizationEvidence[] }> {
    const candidate = this.#store.getFormalizationCandidate(candidateId);
    if (!candidate) throw new Error("FORMALIZATION_CANDIDATE_NOT_FOUND");
    if (candidate.status !== "OPEN") throw new Error("FORMALIZATION_CANDIDATE_NOT_OPEN");
    if (candidate.maturity !== "READY_FOR_DECISION") throw new Error("FORMALIZATION_CANDIDATE_NOT_READY");
    if (candidate.recommendedKind === "UNRESOLVED") throw new Error("FORMALIZATION_CANDIDATE_KIND_UNRESOLVED");
    if (!candidate.proposedTitle?.trim()) throw new Error("FORMALIZATION_CANDIDATE_TITLE_REQUIRED");
    if (!candidate.sourceRefs.length || !candidate.sourceHashes[0]) throw new Error("FORMALIZATION_CANDIDATE_SOURCE_REQUIRED");
    if (candidate.decisionPackageId) {
      const existing = this.#store.getDecisionPackage(candidate.decisionPackageId);
      if (existing && existing.status === "OPEN") return { pkg: existing, candidate, evidence: this.#store.listCandidateEvidence(candidate.id) };
    }
    const evidenceRefs = [...(candidate.supportingSourceRefs.length ? candidate.supportingSourceRefs : [candidate.sourceRefs[0]!])];
    const frozen: FormalizationEvidence[] = [];
    for (const [index, ref] of evidenceRefs.entries()) {
      const material = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: ref.graphId, blockUuid: ref.blockUuid }), "READ_EVIDENCE").material;
      const evidence: FormalizationEvidence = {
        id: `formalization-evidence:${candidate.id}:${index}`, candidateId: candidate.id, sourceRef: ref,
        sourceHash: material.sourceContentHash, frozenContent: material.content, proof: material.proof, frozenAt: this.#now(),
      };
      this.#store.putCandidateEvidence(evidence);
      this.#store.addCandidateEvidenceRef(candidate.id, evidence.id);
      frozen.push(evidence);
    }
    const refreshed = this.#store.getFormalizationCandidate(candidate.id)!;
    const anchor = refreshed.sourceRefs[0]!;
    const sourceHash = refreshed.sourceHashes[0]!;
    const owner = refreshed.recommendedOwnerId ? this.#store.getWorkObject(refreshed.recommendedOwnerId) : null;
    const intentText = refreshed.proposedWorkIntent ? `；目标：${refreshed.proposedWorkIntent.desiredOutcome ?? "未限定"}${refreshed.proposedWorkIntent.completionChecks.length ? `（完成检查 ${refreshed.proposedWorkIntent.completionChecks.length} 项）` : ""}` : "";
    const summary = `建议创建${refreshed.recommendedKind}「${refreshed.proposedTitle}」${owner ? `，归属 ${owner.title}` : ""}${intentText}`;
    const rationale = refreshed.rationaleSummary || "该自然材料形成了独立、持续、值得重新进入的治理边界。";
    const pkg = this.#kernel.createDecisionPackage({
      id: `formalization-package:${refreshed.id}`,
      workObjectId: null,
      summary,
      rationale,
      candidates: [{
        id: `formalization-candidate:${refreshed.id}`,
        operationType: "CREATE_WORK_OBJECT",
        parameters: {
          anchor: { graphId: anchor.graphId, blockUuid: anchor.blockUuid, sourceContentHash: sourceHash },
          input: { kind: refreshed.recommendedKind, title: refreshed.proposedTitle },
          ownerId: refreshed.recommendedOwnerId,
          proposedWorkIntent: refreshed.proposedWorkIntent,
        },
        evidenceIds: refreshed.evidenceRefs,
      }],
    });
    this.#store.updateFormalizationCandidate(refreshed.id, { decisionPackageId: pkg.pkg.id, updatedAt: this.#now() });
    return { pkg: pkg.pkg, candidate: this.#store.getFormalizationCandidate(refreshed.id)!, evidence: frozen };
  }

  markMaterializedByPackage(packageId: string, workObjectId: string): FormalizationCandidate | null {
    const candidate = this.#store.getFormalizationCandidateByPackage(packageId);
    if (!candidate) return null;
    this.#store.updateFormalizationCandidate(candidate.id, { status: "MATERIALIZED", materializedWorkObjectId: workObjectId, updatedAt: this.#now(), lastObservedAt: this.#now() });
    return this.#store.getFormalizationCandidate(candidate.id);
  }

  async validateMaterializationPackage(packageId: string): Promise<boolean> {
    const candidate = this.#store.getFormalizationCandidateByPackage(packageId);
    if (!candidate || !candidate.sourceRefs.length) return true;
    for (let index = 0; index < candidate.sourceRefs.length; index += 1) {
      const ref = candidate.sourceRefs[index]!;
      try {
        const block = response(await this.#broker.request({ kind: "READ_BLOCK", graphId: ref.graphId, blockUuid: ref.blockUuid }), "READ_BLOCK").block;
        if (block.contentHash !== candidate.sourceHashes[index]) return false;
      } catch { return false; }
    }
    return true;
  }

  dismissCandidate(candidateId: string): FormalizationCandidate {
    const candidate = this.#store.getFormalizationCandidate(candidateId);
    if (!candidate) throw new Error("FORMALIZATION_CANDIDATE_NOT_FOUND");
    this.#store.transitionFormalizationCandidate(candidate.id, "DISMISSED", this.#now());
    return this.#store.getFormalizationCandidate(candidate.id)!;
  }

  absorbCandidate(candidateId: string, targetWorkObjectId: string): FormalizationCandidate {
    const candidate = this.#store.getFormalizationCandidate(candidateId);
    const target = this.#store.getWorkObject(targetWorkObjectId);
    if (!candidate) throw new Error("FORMALIZATION_CANDIDATE_NOT_FOUND");
    if (candidate.status !== "OPEN") throw new Error("FORMALIZATION_CANDIDATE_NOT_OPEN");
    if (!target) throw new Error("ABSORB_TARGET_NOT_FOUND");
    const at = this.#now();
    for (let index = 0; index < candidate.sourceRefs.length; index += 1) {
      const ref = candidate.sourceRefs[index]!;
      try { this.#kernel.associateContext({ workObjectId: target.id, sourceRef: ref, sourceVersionHash: candidate.sourceHashes[index] ?? "", origin: "AGENT_INFERRED", basisRunId: `candidate-absorb:${candidate.id}`, at }); }
      catch { /* correction may block one source */ }
    }
    this.#store.updateFormalizationCandidate(candidate.id, { status: "MATERIALIZED", materializedWorkObjectId: target.id, updatedAt: at, lastObservedAt: at });
    return this.#store.getFormalizationCandidate(candidate.id)!;
  }

  expireCandidates(): FormalizationCandidate[] {
    const at = this.#now();
    const expired = this.#store.listFormalizationCandidates("OPEN").filter((candidate) => candidate.expiresAt !== null && candidate.expiresAt < at);
    for (const candidate of expired) this.#store.transitionFormalizationCandidate(candidate.id, "EXPIRED", at);
    return expired;
  }

  async organizeToday(input: { date?: string } = {}): Promise<OrganizeTodayResult> {
    const date = isoDay(input.date ?? this.#now());
    const scope: DiscoveryScope = { kind: "TODAY", date };
    this.expireCandidates();
    const graphAvailable = this.#broker.status().available;
    const reconcileJobs: ReconcileJob[] = [];
    if (graphAvailable) {
      for (const object of this.#store.listWorkObjects().filter((item) => item.lifecycle === "OPEN")) {
        const coverage = this.#maintenance.coverage(object.id);
        if (coverage?.hasUncoveredChanges || this.#maintenance.jobs().some((job) => job.workObjectId === object.id && (job.status === "QUEUED" || job.status === "RUNNING"))) {
          reconcileJobs.push(this.#maintenance.manualReconcile(object.id, "INTERACTIVE"));
        }
      }
    }
    const runs: DiscoveryRun[] = [];
    let token: string | null = null;
    for (let batch = 0; batch < this.#organizeBatchLimit; batch += 1) {
      const run = await this.runDiscovery(scope, { continuationToken: token });
      runs.push(run);
      token = run.continuationToken;
      if (!token || run.status === "FAILED") break;
    }
    const lastRun = runs.at(-1)!;
    const packages: DecisionPackage[] = [];
    const candidateIds = [...new Set(runs.flatMap((run) => run.candidateIds))];
    for (const candidate of candidateIds.map((id) => this.#store.getFormalizationCandidate(id)).filter((candidate): candidate is FormalizationCandidate => Boolean(candidate))) {
      if (candidate.maturity === "READY_FOR_DECISION" && candidate.recommendedKind !== "UNRESOLVED" && candidate.proposedTitle?.trim() && !candidate.decisionPackageId) packages.push((await this.matureCandidate(candidate.id)).pkg);
    }
    for (const job of reconcileJobs) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const found = this.#maintenance.jobs().find((item) => item.id === job.id);
        if (found?.status === "DONE" || found?.status === "FAILED" || found?.status === "STALE") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const candidates = this.#store.listFormalizationCandidates("OPEN");
    const readyCandidates = candidates.filter((candidate) => candidate.maturity === "READY_FOR_DECISION");
    const associationRunIds = new Set(runs.map((run) => run.id));
    const associations = associationRunIds.size
      ? this.#store.listContextAssociations().filter((association) => association.basisRunId && associationRunIds.has(association.basisRunId))
      : [];
    const partial = lastRun.status === "PARTIAL" && lastRun.remainingCount > 0;
    const readyLine = readyCandidates.length
      ? `\n有 ${readyCandidates.length} 项边界建议等待你判断：${readyCandidates.map((candidate) => candidate.proposedTitle ?? candidate.id).join("、")}`
      : "";
    const summaryText = lastRun.status === "FAILED"
      ? "整理未能完成；现有正式事项和自然记录都保持原样。"
      : `${lastRun.summaryText}${partial ? "\n还有一部分新记录尚未完成语义整理，我已经保留进度，下次会继续。" : ""}${readyLine}`;
    return {
      run: lastRun, runs, scope, associations, candidates, readyCandidates, maturePackages: packages,
      reconcileJobs: this.#maintenance.jobs().filter((job) => reconcileJobs.some((queued) => queued.id === job.id)),
      graphAvailable, pauseRespected: this.#maintenance.isPaused("global", null), summaryText,
    };
  }

  async #readScopeBlocks(scope: DiscoveryScope): Promise<ResolvedBlock[]> {
    const status = this.#broker.status();
    if (!status.available || !status.graphId) throw new Error("GRAPH_ADAPTER_OFFLINE");
    const observedAt = this.#now();
    const blocks: Array<{ graphId: string; blockUuid: string; pageName: string | null; content: string; contentHash: string }> = [];
    if (scope.kind === "PAGE" || scope.kind === "SUBTREE") {
      const page = response(await this.#broker.request({ kind: "READ_PAGE", graphId: scope.graphId, pageName: scope.pageName, limit: 200 }), "READ_PAGE").page;
      if (scope.kind === "SUBTREE" && !page.blocks.some((block) => block.blockUuid === scope.blockUuid)) throw new Error("DISCOVERY_SUBTREE_ROOT_NOT_FOUND");
      blocks.push(...page.blocks.map((block) => ({ graphId: block.graphId, blockUuid: block.blockUuid, pageName: block.pageName, content: block.content, contentHash: block.contentHash })));
    } else if (scope.kind === "EXPLICIT_SOURCE_SET") {
      for (const source of scope.sources) {
        const block = response(await this.#broker.request({ kind: "READ_BLOCK", graphId: source.graphId, blockUuid: source.blockUuid }), "READ_BLOCK").block;
        blocks.push({ graphId: block.graphId, blockUuid: block.blockUuid, pageName: block.pageName, content: block.content, contentHash: block.contentHash });
      }
    } else {
      const dates = scope.kind === "TODAY" ? [isoDay(scope.date)] : this.#datesBetween(isoDay(scope.from), isoDay(scope.to));
      for (const date of dates) {
        for (const pageName of this.#journalPageNames(date)) {
          try {
            const page = response(await this.#broker.request({ kind: "READ_PAGE", graphId: status.graphId, pageName, limit: 200 }), "READ_PAGE").page;
            blocks.push(...page.blocks.map((block) => ({ graphId: block.graphId, blockUuid: block.blockUuid, pageName: block.pageName, content: block.content, contentHash: block.contentHash })));
            break;
          } catch { /* next page-name convention */ }
        }
      }
    }
    const unique = [...new Map(blocks.map((block) => [`${block.graphId}:${block.blockUuid}`, block])).values()];
    return unique.map((block) => ({ sourceRef: { graphId: block.graphId, blockUuid: block.blockUuid, pageName: block.pageName }, content: block.content, sourceHash: block.contentHash, observedAt }));
  }

  #prefilter(all: ResolvedBlock[]): { kept: ResolvedBlock[]; skipped: ResolvedBlock[] } {
    const activeAssociations = new Set(this.#store.listContextAssociations("ACTIVE").map((association) => keyOf(association.sourceRef)));
    const kept: ResolvedBlock[] = [];
    const skipped: ResolvedBlock[] = [];
    for (const item of all) {
      const content = item.content.trim();
      if (!content || /^(?:[a-zA-Z0-9_-]+::.*(?:\n|$))+$/u.test(item.content)) { skipped.push(item); continue; }
      const key = keyOf(item.sourceRef);
      if (activeAssociations.has(key)) { skipped.push(item); continue; }
      const latest = this.#store.latestDiscoverySourceOutcome(item.sourceRef.graphId, item.sourceRef.blockUuid);
      if (latest && latest.sourceHash === item.sourceHash && latest.outcome !== "UNRESOLVED") { skipped.push(item); continue; }
      if (this.#store.isMaterializedCandidateSource(item.sourceRef.graphId, item.sourceRef.blockUuid)) { skipped.push(item); continue; }
      kept.push(item);
    }
    return { kept, skipped };
  }

  #buildItems(batch: ResolvedBlock[]): { items: DiscoveryPackItem[]; omitted: number } {
    const items: DiscoveryPackItem[] = [];
    let used = 0;
    let omitted = 0;
    for (const [index, block] of batch.entries()) {
      const remaining = Math.max(0, this.#profile.maxInputChars) - used;
      if (remaining <= 0) { omitted = batch.length - index; break; }
      const content = block.content.slice(0, remaining);
      items.push({ handle: `D${index + 1}`, sourceRef: block.sourceRef, content, sourceHash: block.sourceHash, observedAt: block.observedAt, clusterHandle: `K${Math.floor(index / 3) + 1}` });
      used += content.length;
    }
    return { items, omitted };
  }

  #existingObjects(sourceCount: number): DiscoveryExistingObject[] {
    return this.#store.listWorkObjects().filter((object) => object.lifecycle === "OPEN").slice(0, Math.max(1, this.#profile.maxContextItems - sourceCount)).map((object, index) => ({
      handle: `O${index + 1}`, workObjectId: object.id, kind: object.kind, title: object.title, lifecycle: object.lifecycle, engagement: object.engagement,
      currentFocus: object.currentFocus, desiredOutcome: object.desiredOutcome,
    }));
  }

  #openCandidateSummaries(sourceCount: number): DiscoveryOpenCandidateSummary[] {
    return this.#store.listFormalizationCandidates("OPEN").slice(0, Math.max(0, this.#profile.maxContextItems - sourceCount)).map((candidate) => ({
      candidateId: candidate.id, recommendedKind: candidate.recommendedKind, proposedTitle: candidate.proposedTitle,
      recommendedOwnerId: candidate.recommendedOwnerId, rationaleSummary: candidate.rationaleSummary,
      sourceRefs: candidate.sourceRefs, sourceContents: candidate.sourceContents, lastObservedAt: candidate.lastObservedAt, maturity: candidate.maturity,
    }));
  }

  #datesBetween(from: string, to: string): string[] {
    const dates: string[] = [];
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates.slice(0, 14);
  }

  #upsertCandidate(scope: DiscoveryScope, sources: DiscoveryPackItem[], judgment: Extract<DiscoveryJudgment, { kind: "FORMALIZATION_CANDIDATE" }>, supportingRefs: readonly ContextAssociation["sourceRef"][], runId: string, at: string): FormalizationCandidate {
    const sourceRefs = [...new Map(sources.map((item) => [keyOf(item.sourceRef), item.sourceRef])).values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    const identityId = deterministicUuid(`candidate:${scopeKey(scope)}:${stableHash(sourceRefs.map(keyOf))}`);
    const byIdentity = this.#store.getFormalizationCandidate(identityId);
    if (byIdentity && byIdentity.status !== "OPEN") return byIdentity;
    const maturity = judgment.maturity && judgment.maturity !== "UNEVALUATED" ? judgment.maturity : judgment.recommendedKind === "UNRESOLVED" ? "INSUFFICIENT_BOUNDARY" : "KEEP_OBSERVING";
    const resolvedSupporting = supportingRefs.length ? supportingRefs : maturity === "READY_FOR_DECISION" ? sourceRefs : [];
    const existing = byIdentity ?? this.#store.findOpenCandidateContainingSources(sourceRefs);
    if (existing) {
      this.#store.addCandidateSources(existing.id, sourceRefs, sources.map((item) => item.sourceHash), sources.map((item) => item.content), at);
      this.#store.addCandidateDiscoveryRun(existing.id, runId);
      this.#store.putCandidateSupportingSources(existing.id, resolvedSupporting);
      const patch: Parameters<SqliteStore["updateFormalizationCandidate"]>[1] = {
        updatedAt: at, lastObservedAt: at,
        maturity: judgment.maturity && judgment.maturity !== "UNEVALUATED" ? judgment.maturity : existing.maturity,
        maturityEvaluatedAt: judgment.maturity && judgment.maturity !== "UNEVALUATED" ? at : existing.maturityEvaluatedAt,
        supportingSourceRefs: [...new Set([...existing.supportingSourceRefs, ...resolvedSupporting].map(keyOf))].map((key) => {
          const ref = [...existing.supportingSourceRefs, ...resolvedSupporting].find((item) => keyOf(item) === key);
          return ref!;
        }),
      };
      if (existing.recommendedKind === "UNRESOLVED" && judgment.recommendedKind !== "UNRESOLVED") {
        patch.recommendedKind = judgment.recommendedKind;
        patch.proposedTitle = judgment.proposedTitle ?? existing.proposedTitle;
        patch.recommendedOwnerId = judgment.recommendedOwnerId ?? existing.recommendedOwnerId;
        patch.proposedWorkIntent = judgment.proposedWorkIntent ?? existing.proposedWorkIntent;
      }
      this.#store.updateFormalizationCandidate(existing.id, patch);
      return this.#store.getFormalizationCandidate(existing.id)!;
    }
    const expiresAt = new Date(Date.parse(at) + 30 * 24 * 60 * 60 * 1000).toISOString();
    const candidate: FormalizationCandidate = {
      id: identityId, status: "OPEN", scope, sourceRefs,
      sourceHashes: sourceRefs.map((ref) => sources.find((item) => keyOf(item.sourceRef) === keyOf(ref))?.sourceHash ?? ""),
      sourceContents: sourceRefs.map((ref) => sources.find((item) => keyOf(item.sourceRef) === keyOf(ref))?.content ?? ""),
      recommendedKind: judgment.recommendedKind, recommendedOwnerId: judgment.recommendedOwnerId, proposedTitle: judgment.proposedTitle?.trim() || null,
      proposedWorkIntent: judgment.proposedWorkIntent, rationaleSummary: judgment.rationaleSummary,
      maturity, maturityEvaluatedAt: at, supportingSourceRefs: resolvedSupporting,
      createdAt: at, updatedAt: at, lastObservedAt: at, expiresAt, discoveryRunIds: [runId], evidenceRefs: [],
      materializedWorkObjectId: null, decisionPackageId: null,
    };
    this.#store.putFormalizationCandidate(candidate);
    this.#store.putCandidateSupportingSources(candidate.id, resolvedSupporting);
    return candidate;
  }

  #summary(sourceCount: number, associationCount: number, remainingCount: number, partial: boolean): string {
    const lines: string[] = [];
    if (associationCount > 0) lines.push(`${associationCount} 条新记录已经自动接回已有正式事项。`);
    if (sourceCount > 0) lines.push(`已完成 ${sourceCount} 条记录的语义整理。`);
    if (partial && remainingCount > 0) lines.push(`还有 ${remainingCount} 条记录尚未完成语义整理，已保留进度。`);
    if (associationCount === 0 && sourceCount === 0) lines.push("今天没有新的自然记录需要整理。");
    return lines.join("\n");
  }
}
