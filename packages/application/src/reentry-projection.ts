import type {
  FocusSelection,
  V2Anchor,
  V2Association,
  V2ManagedObject,
  V2PrimaryOwnership,
} from "@task-copilot/domain";

export interface V2ReentryCommitFact {
  semanticCommitId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED" | "UNDONE";
  objectIds: string[];
  updatedAt: string;
}

export interface V2ReentryFact {
  text: string;
  sourceRefs: string[];
}

export interface V2ReentryEntryPoint {
  kind: "FOCUSED_OWNED_OBJECT";
  label: string;
  objectId: string;
  anchorId: string;
}

export type V2ReentryAction =
  | {
      intent: "OPEN_PRIMARY_ANCHOR";
      label: string;
      targetObjectId: string;
      targetAnchorId: string;
    }
  | {
      intent: "OPEN_RECOVERY_DETAILS";
      label: string;
      targetCommitId: string;
    };

export interface V2ReentryProjection {
  kind: "PROJECT" | "TASK";
  objectId: string;
  sufficiency: "SUFFICIENT" | "INSUFFICIENT";
  safetyState: "CLEAN" | "PENDING" | "RECOVERY_REQUIRED" | "CLOSED";
  headline: string;
  summary: string;
  keyEvidence: string[];
  facts: V2ReentryFact[];
  inferences: string[];
  unknowns: string[];
  entryPoints: V2ReentryEntryPoint[];
  relatedContextCount: number;
  nextActionEligible: boolean;
  primaryAction?: V2ReentryAction | undefined;
  lastFormalChangeAt: string;
  evidenceScope: {
    refs: string[];
    observedAt: string;
  };
  source: {
    kind: "DETERMINISTIC_RULE";
    ruleId: string;
    version: "1.0.0";
  };
}

export interface V2ProjectReentryInput {
  observedAt: string;
  project: V2ManagedObject;
  objects: readonly V2ManagedObject[];
  ownerships: readonly V2PrimaryOwnership[];
  associations: readonly V2Association[];
  focus: readonly FocusSelection[];
  anchors: readonly V2Anchor[];
  commits: readonly V2ReentryCommitFact[];
}

export interface V2TaskReentryInput {
  observedAt: string;
  task: V2ManagedObject;
  ownerProject?: V2ManagedObject;
  anchor?: V2Anchor;
  parentContext?: {
    text: string;
    sourceRef: string;
  };
  commits: readonly V2ReentryCommitFact[];
}

function compact(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function objectRef(object: V2ManagedObject): string {
  return `object:${object.objectId}@v${object.version}`;
}

function anchorRef(anchor: V2Anchor): string {
  return `anchor:${anchor.anchorId}`;
}

function commitRef(commit: V2ReentryCommitFact): string {
  return `commit:${commit.semanticCommitId}`;
}

function fact(text: string, ...sourceRefs: string[]): V2ReentryFact {
  return { text, sourceRefs };
}

function requireTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be a valid timestamp.`);
}

function conditionText(object: V2ManagedObject): string | undefined {
  if (object.condition.kind === "WAITING") {
    return `等待${object.condition.waitingFor}提供${object.condition.expectedResult}`;
  }
  if (object.condition.kind === "BLOCKED") return `受阻：${object.condition.reason}`;
  if (object.condition.kind === "PAUSED") return `已暂停：${object.condition.reason}`;
  return undefined;
}

function lifecycleText(object: V2ManagedObject): string {
  if (object.lifecycle === "COMPLETED") return "已完成";
  if (object.lifecycle === "CANCELLED") return "已取消";
  return "已归档";
}

function activePrimaryAnchor(
  anchors: readonly V2Anchor[],
  objectId: string,
): V2Anchor | undefined {
  return anchors.find((value) =>
    value.objectId === objectId
    && value.role === "primary_text"
    && value.status === "active"
  );
}

function unfinishedCommit(
  commits: readonly V2ReentryCommitFact[],
  objectId: string,
): V2ReentryCommitFact | undefined {
  return commits
    .filter((value) =>
      value.objectIds.includes(objectId)
      && (value.status === "PENDING" || value.status === "RECOVERY_REQUIRED")
    )
    .sort((left, right) =>
      (right.status === "RECOVERY_REQUIRED" ? 1 : 0)
      - (left.status === "RECOVERY_REQUIRED" ? 1 : 0)
      || right.updatedAt.localeCompare(left.updatedAt)
    )[0];
}

function result(input: {
  kind: V2ReentryProjection["kind"];
  objectId: string;
  sufficiency: V2ReentryProjection["sufficiency"];
  safetyState: V2ReentryProjection["safetyState"];
  headline: string;
  summary: string;
  keyEvidence?: string[];
  facts: V2ReentryFact[];
  unknowns?: string[];
  entryPoints?: V2ReentryEntryPoint[];
  relatedContextCount?: number;
  primaryAction?: V2ReentryAction | undefined;
  lastFormalChangeAt: string;
  evidenceRefs: string[];
  observedAt: string;
  ruleId: string;
}): V2ReentryProjection {
  return {
    kind: input.kind,
    objectId: input.objectId,
    sufficiency: input.sufficiency,
    safetyState: input.safetyState,
    headline: compact(input.headline),
    summary: compact(input.summary),
    keyEvidence: (input.keyEvidence ?? []).slice(0, 2).map((value) => compact(value)),
    facts: input.facts,
    inferences: [],
    unknowns: input.unknowns ?? [],
    entryPoints: (input.entryPoints ?? []).slice(0, 3),
    relatedContextCount: input.relatedContextCount ?? 0,
    nextActionEligible: input.primaryAction !== undefined,
    ...(input.primaryAction ? { primaryAction: input.primaryAction } : {}),
    lastFormalChangeAt: input.lastFormalChangeAt,
    evidenceScope: {
      refs: [...new Set(input.evidenceRefs)].sort(),
      observedAt: input.observedAt,
    },
    source: {
      kind: "DETERMINISTIC_RULE",
      ruleId: input.ruleId,
      version: "1.0.0",
    },
  };
}

function validateCommon(
  observedAt: string,
  objects: readonly V2ManagedObject[],
  anchors: readonly V2Anchor[],
  commits: readonly V2ReentryCommitFact[],
): void {
  requireTimestamp(observedAt, "Reentry observedAt");
  const objectIds = objects.map(({ objectId }) => objectId);
  if (new Set(objectIds).size !== objectIds.length) throw new Error("Reentry objects contain duplicate identity.");
  const anchorIds = anchors.map(({ anchorId }) => anchorId);
  if (new Set(anchorIds).size !== anchorIds.length) throw new Error("Reentry Anchors contain duplicate identity.");
  const commitIds = commits.map(({ semanticCommitId }) => semanticCommitId);
  if (new Set(commitIds).size !== commitIds.length) throw new Error("Reentry Commits contain duplicate identity.");
  for (const commit of commits) requireTimestamp(commit.updatedAt, "Reentry Commit updatedAt");
}

export function projectV2ProjectReentry(input: V2ProjectReentryInput): V2ReentryProjection {
  if (input.project.objectType !== "PROJECT") throw new Error("Project reentry requires a Project object.");
  validateCommon(
    input.observedAt,
    [input.project, ...input.objects],
    input.anchors,
    input.commits,
  );
  requireTimestamp(input.project.updatedAt, "Project updatedAt");
  const focusIds = input.focus.map(({ objectId }) => objectId);
  if (new Set(focusIds).size !== focusIds.length) throw new Error("Project reentry Focus contains duplicate identity.");
  for (const selection of input.focus) {
    requireTimestamp(selection.selectedAt, "Project reentry Focus selectedAt");
    if (selection.expiresAt) requireTimestamp(selection.expiresAt, "Project reentry Focus expiresAt");
  }
  const projectSource = objectRef(input.project);
  const projectAnchor = activePrimaryAnchor(input.anchors, input.project.objectId);
  const relevantCommit = unfinishedCommit(input.commits, input.project.objectId);
  if (relevantCommit) {
    const recovery = relevantCommit.status === "RECOVERY_REQUIRED";
    return result({
      kind: "PROJECT",
      objectId: input.project.objectId,
      sufficiency: "SUFFICIENT",
      safetyState: recovery ? "RECOVERY_REQUIRED" : "PENDING",
      headline: `${input.project.text}｜${recovery ? "上一次修改需要恢复" : "上一次修改尚未完成"}`,
      summary: recovery
        ? "相关写入已停止；必须沿用同一恢复记录，不能建立重复操作。"
        : "已完成步骤保存在原 Commit 中；不要重复提交相同修改。",
      keyEvidence: [
        recovery ? "相关正式写入已停止" : "正式应用尚未完整完成",
        "原 Commit 与恢复证据仍保留",
      ],
      facts: [
        fact(
          recovery ? "Project 有需要恢复的正式 Commit" : "Project 有尚未完成的正式 Commit",
          projectSource,
          commitRef(relevantCommit),
        ),
      ],
      primaryAction: {
        intent: "OPEN_RECOVERY_DETAILS",
        label: recovery ? "查看差异与恢复记录" : "查看并继续原修改",
        targetCommitId: relevantCommit.semanticCommitId,
      },
      lastFormalChangeAt: input.project.updatedAt,
      evidenceRefs: [projectSource, commitRef(relevantCommit)],
      observedAt: input.observedAt,
      ruleId: recovery ? "project-reentry-recovery-required" : "project-reentry-commit-pending",
    });
  }

  if (input.project.lifecycle !== "OPEN") {
    const closureSummary = input.project.closure
      && "actualResult" in input.project.closure
      ? input.project.closure.actualResult
      : `Project ${lifecycleText(input.project)}`;
    return result({
      kind: "PROJECT",
      objectId: input.project.objectId,
      sufficiency: "SUFFICIENT",
      safetyState: "CLOSED",
      headline: `${input.project.text}｜${lifecycleText(input.project)}`,
      summary: closureSummary,
      keyEvidence: ["正式 Lifecycle 已关闭"],
      facts: [
        fact(`Project 正式状态为${lifecycleText(input.project)}`, projectSource),
        ...(input.project.closure
          ? [fact("Project Closure 仍作为正式回顾证据保留", projectSource)]
          : []),
      ],
      primaryAction: projectAnchor
        ? {
            intent: "OPEN_PRIMARY_ANCHOR",
            label: "打开项目正文",
            targetObjectId: input.project.objectId,
            targetAnchorId: projectAnchor.anchorId,
          }
        : undefined,
      lastFormalChangeAt: input.project.updatedAt,
      evidenceRefs: [projectSource, ...(projectAnchor ? [anchorRef(projectAnchor)] : [])],
      observedAt: input.observedAt,
      ruleId: "project-reentry-closed",
    });
  }

  const objectById = new Map(input.objects.map((value) => [value.objectId, value]));
  const ownedIds = new Set(
    input.ownerships
      .filter(({ ownerObjectId }) => ownerObjectId === input.project.objectId)
      .map(({ childObjectId }) => childObjectId),
  );
  const at = Date.parse(input.observedAt);
  const focusRank = new Map(
    input.focus
      .filter(({ expiresAt }) => !expiresAt || Date.parse(expiresAt) > at)
      .map(({ objectId, rank }) => [objectId, rank]),
  );
  const entryPoints = [...ownedIds]
    .map((objectId) => objectById.get(objectId))
    .filter((value): value is V2ManagedObject =>
      value !== undefined
      && value.lifecycle === "OPEN"
      && focusRank.has(value.objectId)
    )
    .sort((left, right) =>
      (focusRank.get(left.objectId) ?? Number.MAX_SAFE_INTEGER)
      - (focusRank.get(right.objectId) ?? Number.MAX_SAFE_INTEGER)
      || left.objectId.localeCompare(right.objectId)
    )
    .flatMap((value): V2ReentryEntryPoint[] => {
      const valueAnchor = activePrimaryAnchor(input.anchors, value.objectId);
      return valueAnchor
        ? [{
            kind: "FOCUSED_OWNED_OBJECT",
            label: compact(value.text, 80),
            objectId: value.objectId,
            anchorId: valueAnchor.anchorId,
          }]
        : [];
    })
    .slice(0, 3);
  const structure = input.project.projectStructure;
  const hasStructuralBoundary = Boolean(
    structure
    && (
      structure.objectives.length
      || structure.deliverables.length
      || structure.workStages.length
    ),
  );
  const exactCondition = conditionText(input.project);
  const sufficient = Boolean(exactCondition || hasStructuralBoundary || entryPoints.length);
  const firstEntry = entryPoints[0]
    ? `继续${entryPoints[0].label}`
    : hasStructuralBoundary
      ? structure!.currentFocuses[0]
      : undefined;
  const headline = sufficient
    ? `${input.project.text}｜${exactCondition ?? firstEntry ?? "当前接口已建立"}`
    : "当前进入点不明确";
  const summary = hasStructuralBoundary
    ? structure!.currentSummary
    : exactCondition
      ? `Project 当前${exactCondition}`
      : `最近一次正式变化：${input.project.updatedAt}`;
  const keyEvidence = [
    ...(exactCondition ? [exactCondition] : []),
    ...(hasStructuralBoundary ? structure!.currentFocuses.slice(0, 1) : []),
    ...(entryPoints[0] ? [`Focus 中的直属事项：${entryPoints[0].label}`] : []),
  ].slice(0, 2);
  const relatedContextCount = input.associations.filter((association) =>
    association.status === "ACTIVE"
    && (
      association.sourceObjectId === input.project.objectId
      || association.targetObjectId === input.project.objectId
    )
  ).length;
  const evidenceRefs = [
    projectSource,
    ...(projectAnchor ? [anchorRef(projectAnchor)] : []),
    ...entryPoints.flatMap((entry) => [
      `object:${entry.objectId}`,
      `anchor:${entry.anchorId}`,
    ]),
  ];
  return result({
    kind: "PROJECT",
    objectId: input.project.objectId,
    sufficiency: sufficient ? "SUFFICIENT" : "INSUFFICIENT",
    safetyState: "CLEAN",
    headline,
    summary,
    keyEvidence,
    facts: [
      fact("Project 当前正式接口来自同一版本化对象", projectSource),
      ...(exactCondition ? [fact(`Project 正式 Condition：${exactCondition}`, projectSource)] : []),
      ...(entryPoints.length
        ? [fact(`Focus 中有 ${entryPoints.length} 个可打开的直属事项`, projectSource)]
        : []),
      ...(relatedContextCount
        ? [fact(`有 ${relatedContextCount} 个普通关联只作为背景上下文`, projectSource)]
        : []),
    ],
    unknowns: sufficient
      ? []
      : ["尚未形成有证据支撑的 Project 当前边界或进入点"],
    entryPoints,
    relatedContextCount,
    primaryAction: projectAnchor
      ? {
          intent: "OPEN_PRIMARY_ANCHOR",
          label: sufficient ? "打开当前项目" : "打开项目原文",
          targetObjectId: input.project.objectId,
          targetAnchorId: projectAnchor.anchorId,
        }
      : undefined,
    lastFormalChangeAt: input.project.updatedAt,
    evidenceRefs,
    observedAt: input.observedAt,
    ruleId: sufficient ? "project-reentry-sufficient" : "project-reentry-insufficient",
  });
}

export function projectV2TaskReentry(input: V2TaskReentryInput): V2ReentryProjection {
  if (input.task.objectType !== "TASK") throw new Error("Task reentry requires a Task object.");
  validateCommon(
    input.observedAt,
    [input.task, ...(input.ownerProject ? [input.ownerProject] : [])],
    input.anchor ? [input.anchor] : [],
    input.commits,
  );
  requireTimestamp(input.task.updatedAt, "Task updatedAt");
  if (input.ownerProject && input.ownerProject.objectType !== "PROJECT") {
    throw new Error("Task reentry owner must be a Project.");
  }
  if (input.anchor && input.anchor.objectId !== input.task.objectId) {
    throw new Error("Anchor evidence does not match the Task.");
  }
  const taskSource = objectRef(input.task);
  const ownerSource = input.ownerProject ? objectRef(input.ownerProject) : undefined;
  const exactCondition = conditionText(input.task);
  const relevantCommit = unfinishedCommit(input.commits, input.task.objectId);
  if (relevantCommit) {
    const recovery = relevantCommit.status === "RECOVERY_REQUIRED";
    return result({
      kind: "TASK",
      objectId: input.task.objectId,
      sufficiency: "SUFFICIENT",
      safetyState: recovery ? "RECOVERY_REQUIRED" : "PENDING",
      headline: `${input.task.text}｜${recovery ? "上一次修改需要恢复" : "上一次修改尚未完成"}`,
      summary: "必须沿用原 Commit 核对，不能重复提交相同修改。",
      facts: [fact("Task 有未完成的正式 Commit", taskSource, commitRef(relevantCommit))],
      primaryAction: {
        intent: "OPEN_RECOVERY_DETAILS",
        label: recovery ? "查看差异与恢复记录" : "查看并继续原修改",
        targetCommitId: relevantCommit.semanticCommitId,
      },
      lastFormalChangeAt: input.task.updatedAt,
      evidenceRefs: [taskSource, commitRef(relevantCommit)],
      observedAt: input.observedAt,
      ruleId: recovery ? "task-reentry-recovery-required" : "task-reentry-commit-pending",
    });
  }
  if (input.task.lifecycle !== "OPEN") {
    return result({
      kind: "TASK",
      objectId: input.task.objectId,
      sufficiency: "SUFFICIENT",
      safetyState: "CLOSED",
      headline: `${input.task.text}｜${lifecycleText(input.task)}`,
      summary: `Task ${lifecycleText(input.task)}`,
      facts: [fact(`Task 正式状态为${lifecycleText(input.task)}`, taskSource)],
      primaryAction: input.anchor?.status === "active"
        ? {
            intent: "OPEN_PRIMARY_ANCHOR",
            label: "打开原文",
            targetObjectId: input.task.objectId,
            targetAnchorId: input.anchor.anchorId,
          }
        : undefined,
      lastFormalChangeAt: input.task.updatedAt,
      evidenceRefs: [taskSource, ...(input.anchor ? [anchorRef(input.anchor)] : [])],
      observedAt: input.observedAt,
      ruleId: "task-reentry-closed",
    });
  }
  if (
    input.parentContext
    && (
      !input.parentContext.text.trim()
      || input.parentContext.text.length > 4_000
      || !/^(block|page):[^\s]{1,256}$/.test(input.parentContext.sourceRef)
    )
  ) {
    throw new Error("Task reentry parent context must contain bounded text and a machine source reference.");
  }
  const sufficient = exactCondition !== undefined || input.parentContext !== undefined;
  const evidenceRefs = [
    taskSource,
    ...(input.anchor ? [anchorRef(input.anchor)] : []),
    ...(ownerSource ? [ownerSource] : []),
    ...(input.parentContext ? [input.parentContext.sourceRef] : []),
  ];
  const keyEvidence = [
    ...(exactCondition ? [exactCondition] : []),
    ...(input.parentContext ? [`父级正文：${compact(input.parentContext.text)}`] : []),
    ...(input.ownerProject ? [`所属 Project：${input.ownerProject.text}`] : []),
  ].slice(0, 2);
  return result({
    kind: "TASK",
    objectId: input.task.objectId,
    sufficiency: sufficient ? "SUFFICIENT" : "INSUFFICIENT",
    safetyState: "CLEAN",
    headline: sufficient && exactCondition
      ? `${input.task.text}｜${exactCondition}`
      : sufficient
        ? input.task.text
        : "当前进入点不明确",
    summary: exactCondition
      ? `Task 当前${exactCondition}`
      : input.parentContext
        ? `当前正文位于：${compact(input.parentContext.text)}`
        : `最近一次正式变化：${input.task.updatedAt}`,
    keyEvidence,
    facts: [
      fact("Task 正式状态已读取", taskSource),
      ...(exactCondition ? [fact(`Task 正式 Condition：${exactCondition}`, taskSource)] : []),
      ...(input.parentContext
        ? [fact(`已读取父级正文：${input.parentContext.text}`, input.parentContext.sourceRef)]
        : []),
      ...(input.ownerProject && ownerSource
        ? [fact(`Task 的 Primary Owner 是 ${input.ownerProject.text}`, taskSource, ownerSource)]
        : []),
    ],
    unknowns: sufficient ? [] : ["需要打开原文才能判断从哪里继续"],
    primaryAction: input.anchor?.status === "active"
      ? {
          intent: "OPEN_PRIMARY_ANCHOR",
          label: "打开原文",
          targetObjectId: input.task.objectId,
          targetAnchorId: input.anchor.anchorId,
        }
      : undefined,
    lastFormalChangeAt: input.task.updatedAt,
    evidenceRefs,
    observedAt: input.observedAt,
    ruleId: sufficient ? "task-reentry-sufficient" : "task-reentry-insufficient",
  });
}
