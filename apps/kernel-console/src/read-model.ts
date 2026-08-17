import type { ConsoleObjectEntry, ConsoleWorldSnapshot, ProjectionObligation, UserReadBaseline, WorkObject, WorkObjectKind } from "@task-copilot/contracts";

export type AnomalyKind = "ANCHOR_MISSING" | "PROJECTION_FAILED" | "RECOVERY_REQUIRED" | "GRAPH_MISMATCH";

export interface ConsoleAnomaly {
  id: string;
  workObjectId: string | null;
  kind: AnomalyKind;
  message: string;
  technical: string;
}

export interface FrontierItem {
  workObjectId: string;
  title: string;
  kind: WorkObjectKind;
  engagement: WorkObject["engagement"];
  reason: string;
}

export interface ProjectCard {
  object: WorkObject;
  currentSituation: string;
  frontier: FrontierItem[];
  meaningfulChanges: string[];
  anomalies: ConsoleAnomaly[];
  hasChildren: boolean;
  recentlyCompleted: boolean;
}

export interface IndependentMiniProjectCard {
  object: WorkObject;
  currentSituation: string;
  desiredOutcome: string | null;
  completionChecks: readonly string[];
  anomalies: ConsoleAnomaly[];
}

export interface IndependentTaskItem {
  object: WorkObject;
  currentSituation: string;
  anomalies: ConsoleAnomaly[];
}

export interface ConsoleForest {
  childrenByOwner: Map<string, ConsoleObjectEntry[]>;
  parentByChild: Map<string, string | null>;
  entryById: Map<string, ConsoleObjectEntry>;
}

export function buildForest(world: ConsoleWorldSnapshot): ConsoleForest {
  const entryById = new Map<string, ConsoleObjectEntry>();
  for (const entry of world.objects) entryById.set(entry.object.id, entry);
  const childrenByOwner = new Map<string, ConsoleObjectEntry[]>();
  const parentByChild = new Map<string, string | null>();
  for (const object of world.objects) parentByChild.set(object.object.id, null);
  for (const ownership of world.ownerships) {
    const child = entryById.get(ownership.childId);
    if (!child) continue;
    parentByChild.set(ownership.childId, ownership.ownerId);
    const list = childrenByOwner.get(ownership.ownerId) ?? [];
    list.push(child);
    childrenByOwner.set(ownership.ownerId, list);
  }
  for (const list of childrenByOwner.values()) {
    list.sort((a, b) => Number(b.object.lifecycle === "OPEN") - Number(a.object.lifecycle === "OPEN") || Number(a.object.kind === "PROJECT") - Number(b.object.kind === "PROJECT") || a.object.createdAt.localeCompare(b.object.createdAt));
  }
  return { childrenByOwner, parentByChild, entryById };
}

export function isOpen(object: WorkObject): boolean {
  return object.lifecycle === "OPEN";
}

export function isCold(object: WorkObject): boolean {
  return object.lifecycle !== "OPEN";
}

export function isRecentlyCompleted(object: WorkObject, now = new Date()): boolean {
  if (object.lifecycle !== "COMPLETED") return false;
  const updated = Date.parse(object.updatedAt);
  if (!Number.isFinite(updated)) return false;
  return now.getTime() - updated < 7 * 24 * 60 * 60 * 1000;
}

export function currentSituation(object: WorkObject, world: ConsoleWorldSnapshot): string {
  if (object.lifecycle === "COMPLETED") return `${object.title} 已完成`;
  if (object.lifecycle === "CANCELLED") return `${object.title} 已取消`;
  if (object.engagement === "WAITING" && object.waitingCondition) return `正在等待：${object.waitingCondition.description || "外部条件"}`;
  if (object.currentFocus) return `当前推进：${object.currentFocus}`;
  if (object.kind === "PROJECT") {
    const intent = world.projectIntents.find((entry) => entry.workObjectId === object.id)?.intent;
    if (intent?.currentPhase) return `当前阶段：${intent.currentPhase}`;
    if (intent?.objective) return `目标：${intent.objective}`;
    return `${object.title} 目前可推进`;
  }
  if (object.kind === "MINI_PROJECT" && object.desiredOutcome) return `目标是：${object.desiredOutcome}`;
  return `${object.title} 目前可推进`;
}

export function frontierForProject(projectId: string, world: ConsoleWorldSnapshot): FrontierItem[] {
  const forest = buildForest(world);
  const children = forest.childrenByOwner.get(projectId) ?? [];
  const openChildren = children.filter((entry) => isOpen(entry.object));
  const scored = openChildren.map((entry) => {
    const child = entry.object;
    const reasons: string[] = [];
    if (child.currentFocus) reasons.push("有明确推进点");
    if (child.engagement === "WAITING") reasons.push("在等待");
    if (child.engagement === "ACTIONABLE") reasons.push("可推进");
    const hasOpenChildren = (forest.childrenByOwner.get(child.id) ?? []).some((grand) => isOpen(grand.object));
    if (hasOpenChildren && child.kind === "MINI_PROJECT") reasons.push("包含活跃工作");
    const score = Number(Boolean(child.currentFocus)) * 4 + Number(child.engagement === "WAITING") * 3 + Number(hasOpenChildren) * 2 + Number(child.engagement === "ACTIONABLE");
    return { entry, score, reason: reasons.slice(0, 2).join("；") || "属于当前项目" };
  });
  scored.sort((a, b) => b.score - a.score || a.entry.object.createdAt.localeCompare(b.entry.object.createdAt));
  return scored.slice(0, 4).map((item) => ({ workObjectId: item.entry.object.id, title: item.entry.object.title, kind: item.entry.object.kind, engagement: item.entry.object.engagement, reason: item.reason }));
}

export function meaningfulChanges(object: WorkObject, baseline: UserReadBaseline | null): string[] {
  if (!baseline) return object.version > 1 ? ["正式状态有更新"] : [];
  if (object.version <= baseline.lastViewedFormalVersion) return [];
  if (object.lifecycle === "COMPLETED") return ["已完成"];
  if (object.lifecycle === "CANCELLED") return ["已取消"];
  if (object.engagement === "WAITING") return ["进入等待"];
  if (object.currentFocus) return ["当前推进有更新"];
  return ["正式状态有更新"];
}

export function isStableProjectionAnomaly(obligation: ProjectionObligation): boolean {
  if (obligation.status !== "FAILED") return false;
  if (obligation.retryExhausted) return true;
  if (obligation.nextAttemptAt === null) return true;
  if (obligation.lastError && /PROJECTION_VERIFY_MISMATCH|PRECONDITION|CONFLICT|MISMATCH/u.test(obligation.lastError)) return true;
  return false;
}

export function attentionItems(world: ConsoleWorldSnapshot): ConsoleAnomaly[] {
  const anomalies: ConsoleAnomaly[] = [];
  const graphStatus = world.environment.graphStatus;
  const expectedGraphId = world.environment.expectedGraphId;
  if (expectedGraphId && graphStatus.available && graphStatus.graphId !== expectedGraphId) {
    anomalies.push({
      id: "graph-mismatch",
      workObjectId: null,
      kind: "GRAPH_MISMATCH",
      message: "当前 Logseq Graph 与 Kernel 正式世界不匹配",
      technical: `expected=${expectedGraphId}; current=${graphStatus.graphId ?? "none"}`,
    });
  }
  for (const obligation of world.obligations) {
    if (!isStableProjectionAnomaly(obligation)) continue;
    anomalies.push({
      id: `obligation-${obligation.id}`,
      workObjectId: obligation.workObjectId,
      kind: "PROJECTION_FAILED",
      message: "Logseq 中的显示尚未恢复",
      technical: `${obligation.status} ${obligation.lastError ?? ""}`,
    });
  }
  for (const item of world.recovery) {
    if (item.action !== "MANUAL_RECONCILIATION") continue;
    anomalies.push({
      id: `recovery-${item.commit.id}`,
      workObjectId: item.commit.targetId,
      kind: "RECOVERY_REQUIRED",
      message: "需要人工协调的恢复状态",
      technical: `commit=${item.commit.id}; status=${item.commit.status}`,
    });
  }
  const canVerifyWorkspace = graphStatus.available && (!expectedGraphId || graphStatus.graphId === expectedGraphId);
  if (canVerifyWorkspace) {
    for (const entry of world.objects) {
      if (!entry.anchor) {
        anomalies.push({
          id: `anchor-missing-${entry.object.id}`,
          workObjectId: entry.object.id,
          kind: "ANCHOR_MISSING",
          message: "工作位置缺失",
          technical: "no primary anchor registered",
        });
      }
    }
  }
  return anomalies;
}

export function projectCards(world: ConsoleWorldSnapshot): ProjectCard[] {
  const forest = buildForest(world);
  const projects = world.objects.filter((entry) => entry.object.kind === "PROJECT" && isOpen(entry.object));
  const recently = world.objects.filter((entry) => entry.object.kind === "PROJECT" && isRecentlyCompleted(entry.object));
  const selected = [...projects, ...recently.filter((entry) => !projects.some((item) => item.object.id === entry.object.id))];
  return selected.map((entry) => ({
    object: entry.object,
    currentSituation: currentSituation(entry.object, world),
    frontier: frontierForProject(entry.object.id, world),
    meaningfulChanges: meaningfulChanges(entry.object, entry.baseline),
    anomalies: attentionItems(world).filter((item) => item.workObjectId === entry.object.id),
    hasChildren: (forest.childrenByOwner.get(entry.object.id) ?? []).length > 0,
    recentlyCompleted: isRecentlyCompleted(entry.object),
  }));
}

export function independentMiniProjects(world: ConsoleWorldSnapshot): IndependentMiniProjectCard[] {
  const forest = buildForest(world);
  return world.objects
    .filter((entry) => entry.object.kind === "MINI_PROJECT" && isOpen(entry.object) && forest.parentByChild.get(entry.object.id) === null)
    .map((entry) => ({
      object: entry.object,
      currentSituation: currentSituation(entry.object, world),
      desiredOutcome: entry.object.desiredOutcome,
      completionChecks: entry.object.completionChecks,
      anomalies: attentionItems(world).filter((item) => item.workObjectId === entry.object.id),
    }));
}

export function independentTasks(world: ConsoleWorldSnapshot): IndependentTaskItem[] {
  const forest = buildForest(world);
  return world.objects
    .filter((entry) => entry.object.kind === "TASK" && isOpen(entry.object) && forest.parentByChild.get(entry.object.id) === null)
    .map((entry) => ({
      object: entry.object,
      currentSituation: currentSituation(entry.object, world),
      anomalies: attentionItems(world).filter((item) => item.workObjectId === entry.object.id),
    }));
}

export function childrenOf(world: ConsoleWorldSnapshot, ownerId: string): ConsoleObjectEntry[] {
  return buildForest(world).childrenByOwner.get(ownerId) ?? [];
}

export function parentOf(world: ConsoleWorldSnapshot, childId: string): string | null {
  return buildForest(world).parentByChild.get(childId) ?? null;
}

export function evidenceFor(world: ConsoleWorldSnapshot, workObjectId: string) {
  return world.evidence.filter((item) => item.workObjectId === workObjectId);
}

export function contextFor(world: ConsoleWorldSnapshot, workObjectId: string) {
  return world.contextAssociations.filter((item) => item.workObjectId === workObjectId && item.status === "ACTIVE");
}

export function kindLabel(kind: WorkObjectKind): string {
  return kind === "PROJECT" ? "Project" : kind === "MINI_PROJECT" ? "MiniProject" : "Task";
}
