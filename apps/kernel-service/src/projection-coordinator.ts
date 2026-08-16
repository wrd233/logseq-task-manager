import type { ClosureAssessment, ClosureCheckAssessment, ConfirmationProjection, DecisionCandidate, DecisionPackage, NowProjection, NowProjectionItem, ObjectContextPack, ProjectIntent, SystemProjection, WorkMapNode, WorkMapProjection } from "@task-copilot/contracts";
import type { Kernel } from "@task-copilot/kernel";
import type { SqliteStore } from "@task-copilot/sqlite";
import type { DiscoveryCoordinator } from "./discovery-coordinator.ts";
import type { GraphRequestBroker } from "./graph-broker.ts";
import type { MaintenanceCoordinator } from "./maintenance-coordinator.ts";

export interface ProjectionCoordinatorOptions { now?: () => string }

export class ProjectionCoordinator {
  readonly #store: SqliteStore;
  readonly #kernel: Kernel;
  readonly #discovery: DiscoveryCoordinator;
  readonly #maintenance: MaintenanceCoordinator;
  readonly #broker: GraphRequestBroker;
  readonly #now: () => string;

  constructor(store: SqliteStore, kernel: Kernel, discovery: DiscoveryCoordinator, maintenance: MaintenanceCoordinator, broker: GraphRequestBroker, options: ProjectionCoordinatorOptions = {}) {
    this.#store = store;
    this.#kernel = kernel;
    this.#discovery = discovery;
    this.#maintenance = maintenance;
    this.#broker = broker;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  now(): NowProjection {
    const at = this.#now();
    const packages = this.#store.listDecisionPackages("OPEN");
    const objects = this.#store.listWorkObjects().filter((object) => object.lifecycle === "OPEN");
    const allCommits = this.#store.listCommits().filter((commit) => commit.status === "COMMITTED");
    const items: NowProjectionItem[] = [];
    for (const object of objects) {
      const pending = packages.filter((pkg) => pkg.workObjectId === object.id);
      const objectCommits = allCommits.filter((commit) => commit.targetId === object.id).sort((a, b) => ((a.after as { version?: number } | null)?.version ?? 0) - ((b.after as { version?: number } | null)?.version ?? 0) || a.id.localeCompare(b.id));
      const baseline = this.#store.getUserReadBaseline(object.id);
      const recent = baseline
        ? objectCommits.filter((commit) => ((commit.after as { version?: number } | null)?.version ?? 0) > baseline.lastViewedFormalVersion || (commit.operationType === "UPDATE_PROJECT_INTENT" && commit.updatedAt > baseline.lastViewedAt))
        : objectCommits.filter((commit) => ((commit.after as { version?: number } | null)?.version ?? 0) > 0).slice(-2);
      const waitingRecentlyChanged = recent.some((commit) => commit.operationType === "CHANGE_ENGAGEMENT" && (commit.after as { engagement?: string | null } | null)?.engagement === "WAITING");
      const reviewDue = object.waitingCondition?.reviewAt !== null && object.waitingCondition?.reviewAt !== undefined && object.waitingCondition.reviewAt <= at;
      const coverage = this.#maintenance.coverage(object.id);
      const childCount = this.#store.listOwnerships().filter((ownership) => ownership.ownerId === object.id).length;
      const hasUncoveredChanges = coverage?.hasUncoveredChanges ?? false;
      const hasPendingDecision = pending.length > 0;
      const hasRecentMeaningfulChange = recent.length > 0;
      const resurfacedWaiting = object.engagement === "WAITING" && (waitingRecentlyChanged || reviewDue || hasUncoveredChanges);
      const actionableSignal = object.engagement !== "WAITING" && (hasRecentMeaningfulChange || hasUncoveredChanges);
      const pendingWithRealitySignal = hasPendingDecision && (hasRecentMeaningfulChange || hasUncoveredChanges || resurfacedWaiting);
      if (!(resurfacedWaiting || actionableSignal || pendingWithRealitySignal)) continue;
      const meaningful = recent.map((commit) => {
        const after = commit.after as { engagement?: string | null; currentFocus?: string | null; title?: string; lifecycle?: string | null } | null;
        if (commit.operationType === "CHANGE_ENGAGEMENT") return after?.engagement === "WAITING" ? `进入等待：${(after as { waitingCondition?: { description?: string } | null } | null)?.waitingCondition?.description ?? ""}` : "恢复可推进";
        if (commit.operationType === "SET_CURRENT_FOCUS") return "当前推进已更新";
        if (commit.operationType === "RENAME_WORK_OBJECT") return `标题更新为「${after?.title ?? ""}」`;
        if (commit.operationType === "CREATE_WORK_OBJECT") return "已正式化";
        if (commit.operationType === "UPDATE_WORK_INTENT") return "目标或完成标准有更新";
        if (commit.operationType === "UPDATE_PROJECT_INTENT") return "项目目标或阶段有更新";
        if (commit.operationType === "ASSIGN_PARENT") return "正式归属有更新";
        if (commit.operationType === "COMPLETE_WORK_OBJECT") return "已完成";
        if (commit.operationType === "CANCEL_WORK_OBJECT") return "已取消";
        if (commit.operationType === "REOPEN_WORK_OBJECT") return "已重新打开";
        return "有新的正式变化";
      });
      const whyNowParts: string[] = [];
      if (hasPendingDecision && pendingWithRealitySignal) whyNowParts.push(`有 ${pending.length} 个决定需要你确认`);
      if (hasUncoveredChanges) whyNowParts.push("自然记录有新变化，等待对齐");
      if (resurfacedWaiting) whyNowParts.push(object.engagement === "WAITING" ? "等待有变化，值得回来复查" : "");
      if (hasRecentMeaningfulChange && baseline) whyNowParts.push("上次看过以后有新的正式变化");
      if (!baseline && hasRecentMeaningfulChange) whyNowParts.push(object.kind === "PROJECT" ? `新正式化的项目，包含 ${childCount} 个子项` : "新正式化，可以从这里恢复");
      if (!whyNowParts.length) whyNowParts.push("当前现实值得恢复");
      items.push({
        id: `formal:${object.id}`, source: "FORMAL", workObjectId: object.id, title: object.title, kind: object.kind,
        whyNow: whyNowParts.filter(Boolean).join("；"), currentReality: this.#reality(object, childCount, this.#store.getProjectIntent(object.id)),
        meaningfulChanges: meaningful, continuationPoint: object.currentFocus ?? (object.engagement === "WAITING" ? (object.waitingCondition?.description ?? "复查等待条件") : object.kind === "PROJECT" ? "和 Agent 讨论项目下一步" : "和 Agent 讨论下一步"),
        engagement: object.engagement, waitingSummary: object.waitingCondition?.description ?? null,
        pendingDecisionCount: pending.length, coverageHonesty: hasUncoveredChanges ? "部分新记录尚未完成语义整理" : "现实已对齐",
        provenance: `formal-v${object.version}@${object.updatedAt}`, lastSeenAt: baseline?.lastViewedAt ?? null, changesSinceLastSeen: baseline ? recent.length : 0,
      });
    }
    const candidates = this.#store.listFormalizationCandidates("OPEN").filter((candidate) => candidate.maturity === "READY_FOR_DECISION" && !candidate.decisionPackageId);
    for (const candidate of candidates) {
      items.push({
        id: `candidate:${candidate.id}`, source: "NATURAL_FRONTIER", workObjectId: null, title: candidate.proposedTitle ?? "一个值得正式化的方向",
        kind: candidate.recommendedKind === "UNRESOLVED" ? "FRONTIER" : candidate.recommendedKind, whyNow: "有一个自然边界已经成熟，但还没有生成确认", currentReality: "还是自然记录中的独立边界",
        meaningfulChanges: [`发现于 ${candidate.createdAt}`, candidate.rationaleSummary], continuationPoint: "继续观察或整理今天",
        engagement: null, waitingSummary: null, pendingDecisionCount: 0,
        coverageHonesty: "自然边界，未正式化", provenance: `candidate-r${candidate.revision}`, lastSeenAt: null, changesSinceLastSeen: 0,
      });
    }
    items.sort((a, b) => {
      const weight = (item: NowProjectionItem) => (item.pendingDecisionCount > 0 ? 4 : 0) + (item.engagement === "WAITING" ? 2 : 0) + (item.changesSinceLastSeen > 0 ? 1 : 0) + (item.kind === "PROJECT" ? 1 : 0) + (item.source === "NATURAL_FRONTIER" ? 2 : 0);
      return weight(b) - weight(a) || b.provenance.localeCompare(a.provenance);
    });
    const unique = [...new Map(items.map((item) => [item.id, item])).values()];
    return { items: unique.slice(0, 3), generatedAt: at, graphAvailable: this.#broker.status().available };
  }

  closureAssessment(workObjectId: string): ClosureAssessment | null {
    const object = this.#store.getWorkObject(workObjectId);
    if (!object) return null;
    const projectIntent = object.kind === "PROJECT" ? this.#store.getProjectIntent(workObjectId) : null;
    const semanticRevision = object.kind === "PROJECT" ? `${object.version}:${projectIntent?.revision ?? 0}` : String(object.version);
    const evidence = this.#store.listEvidence(workObjectId);
    const openChildren = this.#openDescendants(workObjectId);
    const issues = this.#store.listGovernanceIssues(workObjectId, "OPEN");
    const conflict = issues.find((issue) => issue.type === "CONFLICT") ?? null;
    const blockers: string[] = [];
    let readiness: ClosureAssessment["readiness"];
    let checks: ClosureCheckAssessment[] = [];
    if (conflict) {
      readiness = "CONFLICT";
      blockers.push(conflict.summary);
    } else if (object.kind === "TASK") {
      readiness = "READY";
    } else if (object.kind === "MINI_PROJECT") {
      if (!object.desiredOutcome && object.completionChecks.length === 0) {
        readiness = "UNKNOWN";
        blockers.push("这个子项目的最终结果还没有写清。");
      } else if (openChildren.length) {
        readiness = "NOT_READY";
        blockers.push(...openChildren.map((child) => `${child.title} 还在进行。`));
      } else {
        checks = object.completionChecks.map((text) => ({ text, status: evidence.length >= object.completionChecks.length ? "SATISFIED" as const : "UNKNOWN" as const, evidenceIds: evidence.map((item) => item.id) }));
        readiness = object.completionChecks.length > 0 && evidence.length >= object.completionChecks.length ? "READY" : "UNKNOWN";
        if (readiness !== "READY") blockers.push("完成检查还缺少足够冻结依据。");
      }
    } else {
      if (!projectIntent?.objective) {
        readiness = "UNKNOWN";
        blockers.push("项目目标还没有写清，无法判断是否完成。");
      } else if (openChildren.length) {
        readiness = "NOT_READY";
        blockers.push(...openChildren.map((child) => `${child.title} 还在进行。`));
      } else {
        const requiredEvidence = Math.max(1, projectIntent.keyResults.length);
        const objectiveOnly = projectIntent.keyResults.length === 0;
        readiness = evidence.length >= requiredEvidence ? "READY" : objectiveOnly ? "UNKNOWN" : "NOT_READY";
        if (readiness !== "READY") blockers.push(objectiveOnly ? "项目目标还缺少足够冻结依据。" : "结果边界还缺少足够冻结依据。");
      }
    }
    const assessment: ClosureAssessment = {
      workObjectId: object.id, kind: object.kind, readiness, semanticRevision, assessedAt: this.#now(),
      blockers, checks, contradictionSummary: conflict?.summary ?? null, evidenceIds: evidence.map((item) => item.id), provenance: "DETERMINISTIC",
    };
    this.#store.putClosureAssessment(assessment);
    return assessment;
  }

  #openDescendants(workObjectId: string): Array<{ id: string; title: string }> {
    const result: Array<{ id: string; title: string }> = [];
    const queue = [workObjectId];
    while (queue.length) {
      const owner = queue.shift()!;
      for (const ownership of this.#store.listOwnerships().filter((item) => item.ownerId === owner)) {
        const child = this.#store.getWorkObject(ownership.childId);
        if (!child) continue;
        if (child.lifecycle === "OPEN") result.push({ id: child.id, title: child.title });
        queue.push(child.id);
      }
    }
    return result;
  }

  async objectContext(workObjectId: string): Promise<ObjectContextPack | null> {
    const object = this.#store.getWorkObject(workObjectId);
    if (!object) return null;
    const commits = this.#store.listCommits().filter((commit) => commit.targetId === object.id && commit.status === "COMMITTED").sort((a, b) => ((a.after as { version?: number } | null)?.version ?? 0) - ((b.after as { version?: number } | null)?.version ?? 0));
    const changes = commits.slice(-3).reverse().map((commit) => {
      const after = commit.after as { currentFocus?: string | null; engagement?: string | null; title?: string } | null;
      if (commit.operationType === "CREATE_WORK_OBJECT") return "新正式化";
      if (commit.operationType === "CHANGE_ENGAGEMENT") return after?.engagement === "WAITING" ? "进入等待" : "恢复可推进";
      if (commit.operationType === "SET_CURRENT_FOCUS") return `当前推进：${after?.currentFocus ?? "已清空"}`;
      if (commit.operationType === "RENAME_WORK_OBJECT") return `标题改为「${after?.title ?? ""}」`;
      if (commit.operationType === "UPDATE_WORK_INTENT") return "目标或完成标准更新";
      if (commit.operationType === "UPDATE_PROJECT_INTENT") {
        const before = commit.before as { currentPhase?: string | null; objective?: string | null } | null;
        const afterIntent = commit.after as { currentPhase?: string | null; objective?: string | null } | null;
        if (before?.currentPhase && afterIntent?.currentPhase && before.currentPhase !== afterIntent.currentPhase) return `阶段：${before.currentPhase} → ${afterIntent.currentPhase}`;
        return before?.objective !== afterIntent?.objective ? "项目目标已更新" : "项目方向已更新";
      }
      if (commit.operationType === "ASSIGN_PARENT") return "正式归属更新";
      return "正式状态有更新";
    });
    const associations = this.#store.listContextAssociations(object.id, "ACTIVE").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)).slice(0, 6);
    const contextRefs = await Promise.all(associations.map(async (association) => {
      let snippet: string | null = null;
      let sourceHash = association.sourceVersionHash;
      try {
        const status = this.#broker.status();
        if (status.available && status.graphId === association.sourceRef.graphId) {
          const value = await this.#broker.request({ kind: "READ_BLOCK", graphId: association.sourceRef.graphId, blockUuid: association.sourceRef.blockUuid });
          if (value.kind === "READ_BLOCK") { snippet = value.block.content.slice(0, 200); sourceHash = value.block.contentHash; }
        }
      } catch { /* context pack must stay available when Graph is offline */ }
      return { sourceRef: association.sourceRef, snippet, sourceHash, role: association.origin };
    }));
    const children = this.#store.listOwnerships().filter((ownership) => ownership.ownerId === object.id).map((ownership) => this.#store.getWorkObject(ownership.childId)).filter((child): child is NonNullable<typeof child> => Boolean(child));
    const pendingPackages = this.#store.listDecisionPackages("OPEN").filter((pkg) => pkg.workObjectId === object.id);
    const allCommits = this.#store.listCommits().filter((commit) => commit.status === "COMMITTED");
    const activeChildren = children.map((child) => {
      const childCommits = allCommits.filter((commit) => commit.targetId === child.id);
      const recent = childCommits.length > 0;
      const hasPending = pendingPackages.some((pkg) => pkg.workObjectId === child.id);
      const reasons: string[] = [];
      if (hasPending) reasons.push("有决定等你确认");
      if (child.engagement === "WAITING") reasons.push("在等待");
      if (child.currentFocus) reasons.push("有明确推进点");
      if (recent) reasons.push("最近有正式变化");
      return { workObjectId: child.id, title: child.title, kind: child.kind, currentFocus: child.currentFocus, engagement: child.engagement, reason: reasons.length ? reasons.slice(0, 2).join("；") : "属于当前对象" };
    }).sort((a, b) => Number(b.reason.includes("决定")) - Number(a.reason.includes("决定")) || Number(b.engagement === "WAITING") - Number(a.engagement === "WAITING") || Number(b.reason.includes("变化")) - Number(a.reason.includes("变化")) || a.title.localeCompare(b.title)).slice(0, object.kind === "TASK" ? 0 : 3);
    const coverage = this.#maintenance.coverage(object.id);
    const issues = this.#store.listGovernanceIssues(object.id, "OPEN").slice(0, 3);
    const projectIntent = object.kind === "PROJECT" ? this.#store.getProjectIntent(object.id) : null;
    const summary = object.engagement === "WAITING"
      ? `${object.title} 正在等待：${object.waitingCondition?.description ?? ""}`
      : object.currentFocus
        ? `${object.title} 当前推进：${object.currentFocus}`
        : object.kind === "PROJECT" && projectIntent?.objective
          ? `${object.title} 目前聚焦在「${projectIntent.currentPhase ?? "项目方向"}」`
          : `${object.title} 目前可推进`;
    return {
      workObjectId: object.id, title: object.title, kind: object.kind, formalVersion: object.version,
      lifecycle: object.lifecycle, engagement: object.engagement, currentFocus: object.currentFocus,
      waitingCondition: object.waitingCondition, desiredOutcome: object.desiredOutcome, completionChecks: object.completionChecks,
      recentChanges: changes,
      contextRefs,
      openIssues: issues, pendingDecisionPackages: pendingPackages.slice(0, 3).map((pkg) => pkg.id),
      activeChildren,
      projectIntent: object.kind === "PROJECT" ? this.#store.getProjectIntent(object.id) : null,
      closureAssessment: object.lifecycle === "OPEN" ? this.closureAssessment(object.id) : null,
      reentrySummary: summary,
      allowedAgentActions: ["SET_CURRENT_FOCUS", "CHANGE_ENGAGEMENT", "CONTEXT_ASSOCIATION", "ADD_REFERENCE"],
      userOnlyActions: ["COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "CREATE_WORK_OBJECT", "OWNERSHIP", "UPDATE_WORK_INTENT"],
      freshness: { graphAvailable: this.#broker.status().available, sourceCoverage: coverage?.hasUncoveredChanges ? "UNCOVERED_CHANGES" : coverage ? "ALIGNED" : "UNKNOWN" },
    };
  }

  confirmations(): ConfirmationProjection {
    const at = this.#now();
    const items = this.#store.listDecisionPackages("OPEN").map((pkg) => {
      const candidates = this.#store.listDecisionCandidates(pkg.id, "OPEN");
      const candidate = candidates[0] ?? null;
      const formalization = pkg.workObjectId ? null : this.#store.getFormalizationCandidateByPackage(pkg.id);
      const stale = Boolean(formalization && pkg.candidateRevision !== null && formalization.revision > pkg.candidateRevision);
      return {
        packageId: pkg.id, candidateId: formalization?.id ?? null, title: pkg.summary, summary: pkg.summary,
        impact: candidate ? this.#decisionImpact(pkg, candidate) : "需要你确认的正式变化",
        whyNow: stale ? "这个建议刚刚发生了变化，请重新看一下" : formalization?.maturity === "READY_FOR_DECISION" ? "边界已经清晰，只差你的确认" : "",
        evidenceCount: candidate?.evidenceIds.length ?? formalization?.evidenceRefs.length ?? 0,
        status: stale ? "STALE" as const : "OPEN" as const,
      };
    });
    return { items, generatedAt: at };
  }

  #decisionImpact(pkg: DecisionPackage, candidate: DecisionCandidate): string {
    if (candidate.operationType === "CREATE_WORK_OBJECT") {
      const params = candidate.parameters as { input?: { kind?: string; title?: string }; ownerId?: string | null } | null;
      const owner = params?.ownerId ? this.#store.getWorkObject(params.ownerId) : null;
      return `新建一个正式${params?.input?.kind === "PROJECT" ? "项目" : params?.input?.kind === "MINI_PROJECT" ? "MiniProject" : "任务"}「${params?.input?.title ?? pkg.summary}」${owner ? `，归入「${owner.title}」` : ""}；原始笔记不移动。`;
    }
    if (candidate.operationType === "ASSIGN_PARENT") {
      const params = candidate.parameters as { childId?: string; ownerId?: string } | null;
      const child = params?.childId ? this.#store.getWorkObject(params.childId) : null;
      const owner = params?.ownerId ? this.#store.getWorkObject(params.ownerId) : null;
      return `把「${child?.title ?? "该事项"}」正式归入「${owner?.title ?? "指定项目"}」；自然笔记不移动。`;
    }
    if (candidate.operationType === "UPDATE_WORK_INTENT") {
      const params = candidate.parameters as { input?: { desiredOutcome?: string | null; completionChecks?: readonly string[] } } | null;
      const checks = params?.input?.completionChecks?.length ? `，并把完成标准设为 ${params.input.completionChecks.length} 项` : "";
      return params?.input?.desiredOutcome ? `把期望结果更新为「${params.input.desiredOutcome}」${checks}` : `清空期望结果${checks}`;
    }
    if (candidate.operationType === "UPDATE_PROJECT_INTENT") {
      const params = candidate.parameters as { input?: { objective?: string | null; keyResults?: readonly { text: string }[]; scope?: string | null; currentPhase?: string | null } } | null;
      const objective = params?.input?.objective ? `把项目目标定为「${params.input.objective}」` : "清空项目目标";
      const krs = params?.input?.keyResults?.length ? `，并设置 ${params.input.keyResults.length} 项结果边界` : "";
      const phase = params?.input?.currentPhase ? `；当前阶段：${params.input.currentPhase}` : "";
      return `${objective}${krs}${phase}。只改变正式项目方向，不移动任何笔记。`;
    }
    if (candidate.operationType === "CHANGE_ENGAGEMENT") {
      const params = candidate.parameters as { input?: { from?: string; to?: string; waiting?: { description?: string } | null } } | null;
      return params?.input?.to === "WAITING" ? `进入等待：${params.input.waiting?.description ?? "等待外部条件"}` : "恢复为可推进";
    }
    if (candidate.operationType === "RENAME_WORK_OBJECT") return "只修改正式标题，其他都不动";
    if (candidate.operationType === "COMPLETE_WORK_OBJECT") return "正式关闭这个任务，并记录完成结果";
    if (candidate.operationType === "CANCEL_WORK_OBJECT") return "正式取消这个任务，并记录取消原因";
    if (candidate.operationType === "REOPEN_WORK_OBJECT") return "重新打开这个任务";
    if (candidate.operationType === "AMEND_CLOSURE") return "修订这个任务的结算说明，原记录保留";
    return "执行一条已准备好的正式变化";
  }

  workMap(): WorkMapProjection {
    const objects = this.#store.listWorkObjects();
    const children = new Map<string, WorkMapNode[]>();
    for (const object of objects) {
      const node: WorkMapNode = {
        workObjectId: object.id, title: object.title, kind: object.kind, lifecycle: object.lifecycle, engagement: object.engagement,
        currentFocus: object.currentFocus, desiredOutcome: object.desiredOutcome, currentPhase: object.kind === "PROJECT" ? this.#store.getProjectIntent(object.id)?.currentPhase ?? null : null, children: [],
      };
      const owner = this.#store.getOwnershipByChild(object.id);
      if (owner) {
        const list = children.get(owner.ownerId) ?? [];
        list.push(node); children.set(owner.ownerId, list);
      } else {
        const list = children.get("ROOT") ?? [];
        list.push(node); children.set("ROOT", list);
      }
    }
    const roots = (children.get("ROOT") ?? []).map((root) => this.#attach(root, children));
    return { roots: roots.sort((a, b) => (a.kind === "PROJECT" ? -1 : b.kind === "PROJECT" ? 1 : 0) || a.title.localeCompare(b.title)), total: objects.length, generatedAt: this.#now() };
  }

  system(): SystemProjection {
    const health = this.#kernel.projectionHealth();
    const runs = this.#discovery.listRuns();
    const last = runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
    const queued = this.#maintenance.jobs("QUEUED").length;
    const failed = this.#maintenance.jobs("FAILED").length;
    const runtimeHealth = this.#store.getRuntimeHealth("global");
    const paused = this.#maintenance.isPaused("global", null);
    const degraded = health.degraded > 0 || runtimeHealth.consecutiveFailures >= 2;
    const runtimeStatus: SystemProjection["runtimeStatus"] = paused ? "PAUSED" : degraded ? "DEGRADED" : queued > 0 || health.backlog > 0 ? "CATCHING_UP" : "HEALTHY";
    const runtimeSummary = runtimeStatus === "PAUSED" ? "后台维护已暂停；你的笔记仍会正常记录，恢复后会继续追上。"
      : runtimeStatus === "DEGRADED" ? "后台理解暂时不可用；你的笔记不受影响，恢复后会继续追上。"
      : runtimeStatus === "CATCHING_UP" ? "正在补齐最近的变化。"
      : "一切正常，后台维护中。";
    return {
      status: degraded || health.backlog > 5 ? "degraded" : "ok", graphAvailable: this.#broker.status().available,
      maintenancePaused: paused, projectionBacklog: health.backlog, projectionDegraded: health.degraded,
      lastDiscovery: last ? { id: last.id, status: last.status, remainingCount: last.remainingCount, summaryText: last.summaryText } : null,
      recoveryCount: this.#store.listRecovery().length, executorId: this.#discovery.listRuns()[0]?.executorId ?? "unknown",
      runtimeStatus, runtimeSummary, runtimeQueuedJobs: queued, runtimeFailedJobs: failed, generatedAt: this.#now(),
    };
  }

  #attach(node: WorkMapNode, children: Map<string, WorkMapNode[]>): WorkMapNode {
    return { ...node, children: (children.get(node.workObjectId) ?? []).map((child) => this.#attach(child, children)) };
  }

  #reality(object: { kind: string; engagement: string | null; waitingCondition: { description: string } | null; currentFocus: string | null; desiredOutcome: string | null }, childCount = 0, projectIntent: ProjectIntent | null = null): string {
    if (object.engagement === "WAITING") return `在等待：${object.waitingCondition?.description ?? "等待条件"}`;
    if (object.currentFocus) return `当前推进：${object.currentFocus}`;
    if (object.desiredOutcome) return `目标：${object.desiredOutcome}`;
    if (object.kind === "PROJECT" && projectIntent?.objective) return `目标：${projectIntent.objective}${projectIntent.currentPhase ? `；当前：${projectIntent.currentPhase}` : ""}`;
    if (object.kind === "PROJECT" && childCount > 0) return `${childCount} 个子项在推进，项目方向还没写下来`;
    return "还没有明确推进点";
  }
}
