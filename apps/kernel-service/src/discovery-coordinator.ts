import { randomUUID } from "node:crypto";

import { deterministicUuid, stableHash, type DecisionPackage, type DiscoveryExecutor, type DiscoveryExistingObject, type DiscoveryJudgment, type DiscoveryPackItem, type DiscoveryRun, type DiscoveryRunSourceOutcome, type DiscoveryScope, type ExecutionProfile, type FormalizationCandidate, type GraphGatewayResponse, type OrganizeTodayResult, type ReconcileJob } from "@task-copilot/contracts";
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
}

function isoDay(date: string): string { return date.slice(0, 10); }

function scopeKey(scope: DiscoveryScope): string {
  if (scope.kind === "TODAY") return stableHash(["TODAY", isoDay(scope.date)]);
  if (scope.kind === "RECENT_WINDOW") return stableHash(["RECENT_WINDOW", isoDay(scope.from), isoDay(scope.to)]);
  if (scope.kind === "PAGE") return stableHash(["PAGE", scope.graphId, scope.pageName]);
  if (scope.kind === "SUBTREE") return stableHash(["SUBTREE", scope.graphId, scope.pageName, scope.blockUuid]);
  return stableHash(["EXPLICIT_SOURCE_SET", ...scope.sources.map((source) => `${source.graphId}:${source.blockUuid}`).sort()]);
}

export class DiscoveryCoordinator {
  readonly #kernel: Kernel;
  readonly #store: SqliteStore;
  readonly #broker: GraphRequestBroker;
  readonly #maintenance: MaintenanceCoordinator;
  readonly #executor: DiscoveryExecutor;
  readonly #profile: ExecutionProfile;
  readonly #now: () => string;
  readonly #journalPageNames: (date: string) => string[];

  constructor(kernel: Kernel, store: SqliteStore, broker: GraphRequestBroker, maintenance: MaintenanceCoordinator, executor: DiscoveryExecutor, profile: ExecutionProfile, options: DiscoveryCoordinatorOptions = {}) {
    this.#kernel = kernel;
    this.#store = store;
    this.#broker = broker;
    this.#maintenance = maintenance;
    this.#executor = executor;
    this.#profile = profile;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#journalPageNames = options.journalPageNames ?? ((date) => [date, date.replaceAll("-", "_"), `journal/${date}`, `journal/${date.replaceAll("-", "_")}`]);
  }

  listRuns(): DiscoveryRun[] { return this.#store.listDiscoveryRuns(); }
  getRun(id: string): DiscoveryRun | null { return this.#store.getDiscoveryRun(id); }
  listCandidates(status?: FormalizationCandidate["status"]): FormalizationCandidate[] { return this.#store.listFormalizationCandidates(status); }
  getCandidate(id: string): FormalizationCandidate | null { return this.#store.getFormalizationCandidate(id); }

  async runDiscovery(scope: DiscoveryScope): Promise<DiscoveryRun> {
    const at = this.#now();
    const runId = `discovery:${randomUUID()}`;
    const startedMs = Date.now();
    const run: DiscoveryRun = {
      id: runId, scope, executorId: this.#executor.id, modelAlias: this.#profile.modelAlias ?? null, status: "RUNNING",
      sourceCount: 0, associationCount: 0, noCandidateCount: 0, candidateIds: [], summaryText: "", latencyMs: 0,
      tokenUsage: null, error: null, startedAt: at, completedAt: null,
    };
    try {
      const sources = await this.#resolveSources(scope);
      run.sourceCount = sources.length;
      this.#store.putDiscoveryRun(run);
      if (sources.length === 0) {
        run.summaryText = "这个范围内没有新的自然记录需要整理。";
        run.completedAt = this.#now(); run.latencyMs = Date.now() - startedMs;
        this.#store.putDiscoveryRun(run);
        return run;
      }
      const existingObjects = this.#existingObjects(sources.length);
      const judgments = await this.#executor.judge({ scope, contextPack: sources, existingObjects, profile: this.#profile });
      run.tokenUsage = this.#executor.tokenUsage ?? null;
      run.latencyMs = Date.now() - startedMs;
      const candidates: FormalizationCandidate[] = [];
      const handled = new Set<string>();
      let invalid = 0;
      const sourceOutcomes = new Map<string, DiscoveryRunSourceOutcome>();
      const mark = (handles: string[], outcome: DiscoveryRunSourceOutcome["outcome"], reason: string | null, extra: Partial<DiscoveryRunSourceOutcome> = {}) => {
        for (const handle of handles) {
          const item = sources.find((entry) => entry.handle === handle);
          if (!item || handled.has(handle)) continue;
          handled.add(handle);
          sourceOutcomes.set(handle, { runId, sourceRef: item.sourceRef, sourceHash: item.sourceHash, outcome, reason, candidateId: extra.candidateId ?? null, targetWorkObjectId: extra.targetWorkObjectId ?? null, ...extra });
        }
      };
      const packItem = (handle: string) => sources.find((item) => item.handle === handle);

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
        if (judgment.kind === "NO_CANDIDATE") {
          mark(judgment.sourceHandles, "NO_CANDIDATE", judgment.reason);
          for (const handle of judgment.sourceHandles) if (packItem(handle) && !handled.has(handle)) { /* handled inside mark */ }
          run.noCandidateCount += judgment.sourceHandles.filter((handle) => packItem(handle) && !handled.has(handle)).length;
          continue;
        }
        const refs = judgment.sourceHandles.map((handle) => packItem(handle)).filter((item): item is DiscoveryPackItem => Boolean(item));
        if (!refs.length || refs.length !== new Set(judgment.sourceHandles).size) { mark(judgment.sourceHandles, "UNRESOLVED", "DISCOVERY_HANDLE_INVALID"); invalid += 1; continue; }
        if ((judgment.recommendedKind !== "UNRESOLVED" && (!judgment.proposedTitle || !judgment.proposedTitle.trim())) || (judgment.recommendedOwnerId && !this.#store.getWorkObject(judgment.recommendedOwnerId))) {
          mark(judgment.sourceHandles, "UNRESOLVED", "CANDIDATE_RECOMMENDATION_INVALID");
          invalid += 1;
          continue;
        }
        const candidate = this.#upsertCandidate(scope, refs, judgment, runId, at);
        if (candidate.status !== "OPEN") {
          mark(judgment.sourceHandles, "NO_CANDIDATE", "ALREADY_COVERED");
          continue;
        }
        candidates.push(candidate);
        run.candidateIds = [...new Set([...run.candidateIds, candidate.id])];
        mark(judgment.sourceHandles, "CANDIDATE", null, { candidateId: candidate.id });
      }
      for (const source of sources) if (!handled.has(source.handle)) mark([source.handle], "UNRESOLVED", "JUDGMENT_DID_NOT_COVER_SOURCE");

      for (const outcome of sourceOutcomes.values()) this.#store.putDiscoveryRunSource(outcome);
      run.noCandidateCount = [...sourceOutcomes.values()].filter((item) => item.outcome === "NO_CANDIDATE").length;
      run.status = invalid > 0 ? "PARTIAL" : "COMPLETED";
      run.summaryText = this.#summary(sources.length, run.associationCount, candidates, run.noCandidateCount);
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

  matureCandidate(candidateId: string): { pkg: DecisionPackage; candidate: FormalizationCandidate } {
    const candidate = this.#store.getFormalizationCandidate(candidateId);
    if (!candidate) throw new Error("FORMALIZATION_CANDIDATE_NOT_FOUND");
    if (candidate.status !== "OPEN") throw new Error("FORMALIZATION_CANDIDATE_NOT_OPEN");
    if (candidate.recommendedKind === "UNRESOLVED") throw new Error("FORMALIZATION_CANDIDATE_KIND_UNRESOLVED");
    if (!candidate.proposedTitle?.trim()) throw new Error("FORMALIZATION_CANDIDATE_TITLE_REQUIRED");
    if (!candidate.sourceRefs.length || !candidate.sourceHashes[0]) throw new Error("FORMALIZATION_CANDIDATE_SOURCE_REQUIRED");
    if (candidate.decisionPackageId) {
      const existing = this.#store.getDecisionPackage(candidate.decisionPackageId);
      if (existing && existing.status === "OPEN") return { pkg: existing, candidate };
    }
    const anchor = candidate.sourceRefs[0]!;
    const sourceHash = candidate.sourceHashes[0]!;
    const owner = candidate.recommendedOwnerId ? this.#store.getWorkObject(candidate.recommendedOwnerId) : null;
    const intentText = candidate.proposedWorkIntent ? `；目标：${candidate.proposedWorkIntent.desiredOutcome ?? "未限定"}${candidate.proposedWorkIntent.completionChecks.length ? `（完成检查 ${candidate.proposedWorkIntent.completionChecks.length} 项）` : ""}` : "";
    const summary = `建议创建${candidate.recommendedKind}「${candidate.proposedTitle}」${owner ? `，归属 ${owner.title}` : ""}${intentText}`;
    const rationale = candidate.rationaleSummary || "该自然材料形成了独立、持续、值得重新进入的治理边界。";
    const pkg = this.#kernel.createDecisionPackage({
      id: `formalization-package:${candidate.id}`,
      workObjectId: null,
      summary,
      rationale,
      candidates: [{
        id: `formalization-candidate:${candidate.id}`,
        operationType: "CREATE_WORK_OBJECT",
        parameters: {
          anchor: { graphId: anchor.graphId, blockUuid: anchor.blockUuid, sourceContentHash: sourceHash },
          input: { kind: candidate.recommendedKind, title: candidate.proposedTitle },
          ownerId: candidate.recommendedOwnerId,
          proposedWorkIntent: candidate.proposedWorkIntent,
        },
        evidenceIds: [],
      }],
    });
    this.#store.updateFormalizationCandidate(candidate.id, { decisionPackageId: pkg.pkg.id, updatedAt: this.#now() });
    return { pkg: pkg.pkg, candidate: this.#store.getFormalizationCandidate(candidate.id)! };
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
      try {
        this.#kernel.associateContext({ workObjectId: target.id, sourceRef: ref, sourceVersionHash: candidate.sourceHashes[index] ?? "", origin: "AGENT_INFERRED", basisRunId: `candidate-absorb:${candidate.id}`, at });
      } catch { /* correction may block one source; the rest remain absorbable */ }
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
    const run = await this.runDiscovery(scope);
    const packages: DecisionPackage[] = [];
    for (const candidate of run.candidateIds.map((id) => this.#store.getFormalizationCandidate(id)).filter((candidate): candidate is FormalizationCandidate => Boolean(candidate))) {
      if (candidate.recommendedKind !== "UNRESOLVED" && candidate.proposedTitle?.trim() && !candidate.decisionPackageId) packages.push(this.matureCandidate(candidate.id).pkg);
    }
    for (const job of reconcileJobs) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const found = this.#maintenance.jobs().find((item) => item.id === job.id);
        if (found?.status === "DONE" || found?.status === "FAILED" || found?.status === "STALE") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const candidates = this.#store.listFormalizationCandidates("OPEN");
    const associations = this.#store.listDiscoveryRunSources(run.id).filter((item) => item.outcome === "ASSOCIATED");
    const summaryText = run.status === "FAILED"
      ? "整理未能完成；现有正式事项和自然记录都保持原样。"
      : run.summaryText;
    return {
      run, scope, associations: associations.map((item) => this.#store.listContextAssociations().find((association) => association.sourceRef.graphId === item.sourceRef.graphId && association.sourceRef.blockUuid === item.sourceRef.blockUuid)!).filter(Boolean),
      candidates, maturePackages: packages, reconcileJobs: this.#maintenance.jobs().filter((job) => reconcileJobs.some((queued) => queued.id === job.id)),
      graphAvailable, pauseRespected: this.#maintenance.isPaused("global", null),
      summaryText,
    };
  }

  async #resolveSources(scope: DiscoveryScope): Promise<DiscoveryPackItem[]> {
    const status = this.#broker.status();
    if (!status.available || !status.graphId) throw new Error("GRAPH_ADAPTER_OFFLINE");
    const observedAt = this.#now();
    const blocks: Array<{ graphId: string; blockUuid: string; pageName: string | null; content: string; contentHash: string }> = [];
    if (scope.kind === "PAGE" || scope.kind === "SUBTREE") {
      const page = response(await this.#broker.request({ kind: "READ_PAGE", graphId: scope.graphId, pageName: scope.pageName, limit: 200 }), "READ_PAGE").page;
      if (scope.kind === "SUBTREE" && !page.blocks.some((block) => block.blockUuid === scope.blockUuid)) throw new Error("DISCOVERY_SUBTREE_ROOT_NOT_FOUND");
      blocks.push(...page.blocks.map((block) => ({ graphId: block.graphId, blockUuid: block.blockUuid, pageName: block.pageName, content: block.content, contentHash: block.contentHash })));
    } else if (scope.kind === "EXPLICIT_SOURCE_SET") {
      for (const source of scope.sources.slice(0, this.#profile.maxContextItems)) {
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
          } catch { /* try next page-name convention */ }
        }
      }
    }
    const unique = [...new Map(blocks.map((block) => [`${block.graphId}:${block.blockUuid}`, block])).values()];
    const capped = unique.slice(0, Math.max(0, this.#profile.maxContextItems));
    const items: DiscoveryPackItem[] = [];
    let used = 0;
    for (const [index, block] of capped.entries()) {
      const remaining = Math.max(0, this.#profile.maxInputChars) - used;
      if (remaining <= 0) break;
      const content = block.content.slice(0, remaining);
      items.push({ handle: `D${index + 1}`, sourceRef: { graphId: block.graphId, blockUuid: block.blockUuid, pageName: block.pageName }, content, sourceHash: block.contentHash, observedAt });
      used += content.length;
    }
    return items;
  }

  #existingObjects(sourceCount: number): DiscoveryExistingObject[] {
    return this.#store.listWorkObjects().filter((object) => object.lifecycle === "OPEN").slice(0, Math.max(1, this.#profile.maxContextItems - sourceCount)).map((object, index) => ({
      handle: `O${index + 1}`, workObjectId: object.id, kind: object.kind, title: object.title, lifecycle: object.lifecycle, engagement: object.engagement,
      currentFocus: object.currentFocus, desiredOutcome: object.desiredOutcome,
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

  #upsertCandidate(scope: DiscoveryScope, sources: DiscoveryPackItem[], judgment: Extract<DiscoveryJudgment, { kind: "FORMALIZATION_CANDIDATE" }>, runId: string, at: string): FormalizationCandidate {
    const sourceRefs = [...new Map(sources.map((item) => [`${item.sourceRef.graphId}:${item.sourceRef.blockUuid}`, item.sourceRef])).values()].sort((a, b) => `${a.graphId}:${a.blockUuid}`.localeCompare(`${b.graphId}:${b.blockUuid}`));
    const identityId = deterministicUuid(`candidate:${scopeKey(scope)}:${stableHash(sourceRefs.map((ref) => `${ref.graphId}:${ref.blockUuid}`))}`);
    const byIdentity = this.#store.getFormalizationCandidate(identityId);
    if (byIdentity && byIdentity.status !== "OPEN") return byIdentity;
    const existing = this.#store.findOpenCandidateContainingSources(sourceRefs);
    if (existing) {
      this.#store.addCandidateSources(existing.id, sourceRefs, sources.map((item) => item.sourceHash), at);
      this.#store.addCandidateDiscoveryRun(existing.id, runId);
      const patch: Parameters<SqliteStore["updateFormalizationCandidate"]>[1] = { updatedAt: at, lastObservedAt: at };
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
      id: identityId,
      status: "OPEN", scope, sourceRefs, sourceHashes: sourceRefs.map((ref) => sources.find((item) => item.sourceRef.graphId === ref.graphId && item.sourceRef.blockUuid === ref.blockUuid)?.sourceHash ?? ""),
      recommendedKind: judgment.recommendedKind, recommendedOwnerId: judgment.recommendedOwnerId, proposedTitle: judgment.proposedTitle?.trim() || null,
      proposedWorkIntent: judgment.proposedWorkIntent, rationaleSummary: judgment.rationaleSummary,
      createdAt: at, updatedAt: at, lastObservedAt: at, expiresAt, discoveryRunIds: [runId], evidenceRefs: [],
      materializedWorkObjectId: null, decisionPackageId: null,
    };
    this.#store.putFormalizationCandidate(candidate);
    return candidate;
  }

  #summary(sourceCount: number, associationCount: number, candidates: FormalizationCandidate[], noCandidateCount: number): string {
    const lines: string[] = [];
    if (associationCount > 0) lines.push(`${associationCount} 条新记录已经自动接回已有正式事项。`);
    const named = candidates.filter((candidate) => candidate.proposedTitle);
    if (named.length === 1) lines.push(`另有一组记录形成了比较明确的独立边界：${named[0]!.proposedTitle}（建议 ${named[0]!.recommendedKind}）。`);
    else if (named.length > 1) lines.push(`另有 ${named.length} 组记录形成了比较明确的独立边界，等待你判断是否纳入。`);
    if (associationCount === 0 && named.length === 0) lines.push("今天的记录已经和现有事项对齐；没有新的边界决定需要你处理。");
    if (noCandidateCount > 0) lines.push(`${noCandidateCount} 条记录暂时不值得正式化，已留在自然 Workspace。`);
    if (!lines.length) lines.push(`已检查 ${sourceCount} 条自然记录，未发现需要治理的变化。`);
    return lines.join("\n");
  }
}
