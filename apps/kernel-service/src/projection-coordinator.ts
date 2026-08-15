import type { ConfirmationProjection, NowProjection, NowProjectionItem, ObjectContextPack, SystemProjection, WorkMapNode, WorkMapProjection } from "@task-copilot/contracts";
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
    const commits = this.#store.listCommits().filter((commit) => commit.status === "COMMITTED");
    const items: NowProjectionItem[] = [];
    for (const object of objects) {
      const pending = packages.filter((pkg) => pkg.workObjectId === object.id);
      const recent = commits.filter((commit) => commit.targetId === object.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 2);
      const coverage = this.#maintenance.coverage(object.id);
      const meaningful = recent.map((commit) => {
        const after = commit.after as { engagement?: string | null; currentFocus?: string | null; title?: string } | null;
        if (commit.operationType === "CHANGE_ENGAGEMENT") return after?.engagement === "WAITING" ? "进入等待" : "恢复可推进";
        if (commit.operationType === "SET_CURRENT_FOCUS") return `推进点更新：${after?.currentFocus ?? ""}`;
        if (commit.operationType === "RENAME_WORK_OBJECT") return `标题更新为：${after?.title ?? ""}`;
        if (commit.operationType === "CREATE_WORK_OBJECT") return "已正式化";
        if (commit.operationType === "UPDATE_WORK_INTENT") return "目标或完成检查有更新";
        if (commit.operationType === "COMPLETE_WORK_OBJECT") return "已完成";
        if (commit.operationType === "CANCEL_WORK_OBJECT") return "已取消";
        if (commit.operationType === "REOPEN_WORK_OBJECT") return "已重新打开";
        return "有新的正式变化";
      });
      const whyNowParts: string[] = [];
      if (pending.length) whyNowParts.push(`有 ${pending.length} 个决定等你确认`);
      if (coverage?.hasUncoveredChanges) whyNowParts.push("自然记录有新变化，等待对齐");
      if (object.engagement === "WAITING") whyNowParts.push("正在等待，需要复查");
      if (object.currentFocus) whyNowParts.push("有明确的当前推进点");
      if (recent.length) whyNowParts.push("最近发生过正式变化");
      if (!whyNowParts.length) continue;
      items.push({
        id: `formal:${object.id}`, source: "FORMAL", workObjectId: object.id, title: object.title, kind: object.kind,
        whyNow: whyNowParts.join("；"), currentReality: this.#reality(object),
        meaningfulChanges: meaningful, continuationPoint: object.currentFocus ?? (object.engagement === "WAITING" ? (object.waitingCondition?.description ?? "等待条件") : "继续推进当前事项"),
        engagement: object.engagement, waitingSummary: object.waitingCondition?.description ?? null,
        pendingDecisionCount: pending.length, coverageHonesty: coverage?.hasUncoveredChanges ? "部分新记录尚未完成语义整理" : "现实已对齐",
        provenance: `formal-v${object.version}@${object.updatedAt}`,
      });
    }
    const candidates = this.#store.listFormalizationCandidates("OPEN").filter((candidate) => candidate.maturity === "READY_FOR_DECISION");
    for (const candidate of candidates) {
      items.push({
        id: `candidate:${candidate.id}`, source: "NATURAL_FRONTIER", workObjectId: null, title: candidate.proposedTitle ?? "一个值得正式化的方向",
        kind: candidate.recommendedKind === "UNRESOLVED" ? "FRONTIER" : candidate.recommendedKind, whyNow: "已经成熟到值得你确认", currentReality: "还是自然记录中的独立边界",
        meaningfulChanges: [`发现于 ${candidate.createdAt}`, candidate.rationaleSummary], continuationPoint: "去“待我确认”查看",
        engagement: null, waitingSummary: null, pendingDecisionCount: candidate.decisionPackageId ? 1 : 0,
        coverageHonesty: "自然边界，未正式化", provenance: `candidate-r${candidate.revision}`,
      });
    }
    items.sort((a, b) => (b.pendingDecisionCount - a.pendingDecisionCount) || (b.meaningfulChanges.length - a.meaningfulChanges.length));
    const unique = [...new Map(items.map((item) => [item.id, item])).values()];
    return { items: unique.slice(0, 4), generatedAt: at, graphAvailable: this.#broker.status().available };
  }

  objectContext(workObjectId: string): ObjectContextPack | null {
    const object = this.#store.getWorkObject(workObjectId);
    if (!object) return null;
    const commits = this.#store.listCommits().filter((commit) => commit.targetId === object.id && commit.status === "COMMITTED").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
    const changes = commits.map((commit) => {
      const after = commit.after as { currentFocus?: string | null; engagement?: string | null; title?: string } | null;
      if (commit.operationType === "CHANGE_ENGAGEMENT") return `状态变为 ${after?.engagement ?? ""}`;
      if (commit.operationType === "SET_CURRENT_FOCUS") return `当前推进：${after?.currentFocus ?? ""}`;
      if (commit.operationType === "RENAME_WORK_OBJECT") return `标题：${after?.title ?? ""}`;
      if (commit.operationType === "UPDATE_WORK_INTENT") return "目标或完成检查更新";
      return commit.operationType;
    });
    const children = this.#store.listOwnerships().filter((ownership) => ownership.ownerId === object.id).map((ownership) => this.#store.getWorkObject(ownership.childId)).filter((child): child is NonNullable<typeof child> => Boolean(child));
    const coverage = this.#maintenance.coverage(object.id);
    const issues = this.#store.listGovernanceIssues(object.id, "OPEN");
    const packages = this.#store.listDecisionPackages("OPEN").filter((pkg) => pkg.workObjectId === object.id).map((pkg) => pkg.id);
    const summary = object.engagement === "WAITING"
      ? `${object.title} 正在等待：${object.waitingCondition?.description ?? ""}`
      : object.currentFocus
        ? `${object.title} 当前推进：${object.currentFocus}`
        : `${object.title} 目前可推进，暂无明确聚焦`;
    return {
      workObjectId: object.id, title: object.title, kind: object.kind, formalVersion: object.version,
      lifecycle: object.lifecycle, engagement: object.engagement, currentFocus: object.currentFocus,
      waitingCondition: object.waitingCondition, desiredOutcome: object.desiredOutcome, completionChecks: object.completionChecks,
      recentChanges: changes,
      contextRefs: this.#store.listContextAssociations(object.id, "ACTIVE").map((association) => association.sourceRef),
      openIssues: issues, pendingDecisionPackages: packages,
      activeChildren: children.map((child) => ({ workObjectId: child.id, title: child.title, kind: child.kind, currentFocus: child.currentFocus })),
      reentrySummary: summary,
      allowedAgentActions: ["SET_CURRENT_FOCUS", "CHANGE_ENGAGEMENT", "CONTEXT_ASSOCIATION", "ADD_REFERENCE"],
      userOnlyActions: ["COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "CREATE_WORK_OBJECT", "OWNERSHIP", "UPDATE_WORK_INTENT"],
      freshness: { graphAvailable: this.#broker.status().available, sourceCoverage: coverage?.hasUncoveredChanges ? "UNCOVERED_CHANGES" : coverage ? "ALIGNED" : "UNKNOWN" },
    };
  }

  confirmations(): ConfirmationProjection {
    const at = this.#now();
    const items = this.#store.listDecisionPackages("OPEN").map((pkg) => {
      const candidate = pkg.workObjectId ? null : this.#store.getFormalizationCandidateByPackage(pkg.id);
      return {
        packageId: pkg.id, candidateId: candidate?.id ?? null, title: pkg.summary, summary: pkg.summary, impact: "会创建一个新的正式事项或改变当前正式边界",
        whyNow: candidate?.maturity === "READY_FOR_DECISION" ? "边界已经清晰，只差你的确认" : "这条确认已经准备好", evidenceCount: candidate?.evidenceRefs.length ?? 0,
        status: "OPEN" as const,
      };
    });
    return { items, generatedAt: at };
  }

  workMap(): WorkMapProjection {
    const objects = this.#store.listWorkObjects();
    const children = new Map<string, WorkMapNode[]>();
    for (const object of objects) {
      const node: WorkMapNode = {
        workObjectId: object.id, title: object.title, kind: object.kind, lifecycle: object.lifecycle, engagement: object.engagement,
        currentFocus: object.currentFocus, desiredOutcome: object.desiredOutcome, children: [],
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
    return {
      status: health.degraded > 0 || health.backlog > 5 ? "degraded" : "ok", graphAvailable: this.#broker.status().available,
      maintenancePaused: this.#maintenance.isPaused("global", null), projectionBacklog: health.backlog, projectionDegraded: health.degraded,
      lastDiscovery: last ? { id: last.id, status: last.status, remainingCount: last.remainingCount, summaryText: last.summaryText } : null,
      recoveryCount: this.#store.listRecovery().length, executorId: this.#discovery.listRuns()[0]?.executorId ?? "unknown", generatedAt: this.#now(),
    };
  }

  #attach(node: WorkMapNode, children: Map<string, WorkMapNode[]>): WorkMapNode {
    return { ...node, children: (children.get(node.workObjectId) ?? []).map((child) => this.#attach(child, children)) };
  }

  #reality(object: { engagement: string | null; waitingCondition: { description: string } | null; currentFocus: string | null; desiredOutcome: string | null }): string {
    if (object.engagement === "WAITING") return `在等待：${object.waitingCondition?.description ?? "等待条件"}`;
    if (object.currentFocus) return `当前推进：${object.currentFocus}`;
    if (object.desiredOutcome) return `目标：${object.desiredOutcome}`;
    return "保持可推进，暂无明确聚焦";
  }
}
