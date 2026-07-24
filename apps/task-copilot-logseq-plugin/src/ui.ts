import type {
  AuditProjection,
  NowWorkView,
  ObjectDetailView,
  ProposalImpactView,
  ProjectReentryView,
} from "@task-copilot/application";
import { allowedPhaseTransitions, type AttentionSignal, type DomainEvent, type ManagedObject, type Proposal, type SemanticCommit, type SemanticOperation, type V2Association, type V2Candidate, type V2ManagedObject, type V2MiniProjectClosure, type V2PrimaryOwnership, type V2ProjectClosure } from "@task-copilot/domain";
import type { ServiceMigrationRun, ServiceNowWork, ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";
import { renderV2ExplicitCandidateDiscoveryPanel, type V2ExplicitCandidatePanelState } from "./v2-explicit-candidate-discovery.ts";
import { lowRiskApplyEligibility } from "./v2-low-risk-apply.ts";
import type { PageContextSnapshot } from "./page-context-controller.ts";
import { projectRecentChanges, type RecentChange } from "./recent-changes.ts";
import type { PluginProjectReentryCard } from "./reentry-runtime.ts";
import type { PluginMiniProjectGrillState } from "./mini-project-grill-controller.ts";
import {
  resolveProjectContextRecoveryRoute,
  type PluginProjectContextRecoveryState,
} from "./project-context-recovery-controller.ts";
import {
  projectPluginProposalNarration,
  type PluginObjectNarration,
} from "./status-narration-runtime.ts";

export const WORKSPACE_IDS = ["now", "objects", "review", "reentry", "more", "migration", "audit"] as const;
export type Workspace = typeof WORKSPACE_IDS[number];
type PrimaryWorkspace = "now" | "review" | "projects" | "more";
export type V2NowWorkTypeFilter = "ALL" | ServiceNowWork["focus"][number]["objectType"];
export type V2NowWorkGrouping = "mixed" | "type";
export type ActionDialogKind =
  | "edit-object"
  | "set-owner"
  | "condition-waiting"
  | "condition-blocked"
  | "condition-paused"
  | "review-edit"
  | "review-defer"
  | "reject-proposal"
  | "confirm-review-accept"
  | "confirm-phase"
  | "reopen-phase"
  | "confirm-rebind"
  | "confirm-undo"
  | "confirm-v2-review-accept"
  | "v2-mini-project-closure-review"
  | "v2-lifecycle-reason"
  | "confirm-v2-commit"
  | "confirm-v2-project-closure"
  | "confirm-v2-project-structure"
  | "confirm-v2-project-structure-undo"
  | "confirm-v2-mini-project-restructure"
  | "confirm-v2-mini-project-restructure-undo"
  | "confirm-v2-mini-project-closure"
  | "confirm-v2-reasoned-lifecycle"
  | "confirm-v2-lifecycle-undo"
  | "confirm-v2-ownership"
  | "confirm-v2-ownership-undo"
  | "confirm-v2-undo"
  | "v2-condition"
  | "v2-block-condition-route"
  | "v2-block-condition-waiting"
  | "v2-block-condition-blocked"
  | "v2-block-condition-paused"
  | "v2-deadline"
  | "v2-review-defer"
  | "v2-provider-revise"
  | "v2-candidate-update"
  | "v2-area-edit"
  | "v2-project-structure-edit"
  | "v2-mini-project-grill"
  | "v2-page-context"
  | "v2-page-formal-items"
  | "confirm-end-task-copilot";

export interface UiModel {
  workspace: Workspace;
  agent: { enabled: boolean; providerId: string };
  now: NowWorkView;
  objects: ManagedObject[];
  proposals: Proposal[];
  commits: SemanticCommit[];
  events: DomainEvent[];
  signalsByObject: Record<string, AttentionSignal[]>;
  proposalImpacts: Record<string, ProposalImpactView>;
  auditProjection: AuditProjection;
  reentryProjects: ManagedObject[];
  selectedReentryProjectId?: string;
  selectedObjectDetail?: ObjectDetailView;
  reentry?: ProjectReentryView;
  message?: string;
  error?: string;
  recoveryReport?: string;
  runtime?: {
    pluginVersion: string;
    runtimeStatus: string;
    storeStatus: string;
    currentGraph: string;
  };
  actionDialog?: { kind: ActionDialogKind; value: string };
  v2ProjectCreationAvailable?: boolean;
  v2AreaAvailable?: boolean;
  v2AreaBusy?: boolean;
  v2Objects?: V2ManagedObject[];
  v2Associations?: V2Association[];
  v2PrimaryOwnerships?: V2PrimaryOwnership[];
  v2RelationLoadError?: string;
  v2AssociationAvailable?: boolean;
  v2AssociationBusy?: boolean;
  v2OwnershipCommitBusy?: boolean;
  v2BlockConditionBusy?: boolean;
  v2LifecycleCommitBusy?: boolean;
  v2StructureCommitBusy?: boolean;
  v2ClosureProposalBusy?: boolean;
  v2LifecycleProposalBusy?: boolean;
  v2ClosureDraftBusy?: boolean;
  v2ClosureDraftInput?: V2MiniProjectClosure;
  v2LegacyTransferBusy?: boolean;
  v2ClosureReviewBusy?: boolean;
  v2Proposals?: ServiceStoredProposal[];
  v2SemanticCommits?: ServiceSemanticCommit[];
  v2NowWork?: ServiceNowWork;
  v2NowWorkTypeFilter?: V2NowWorkTypeFilter;
  v2NowWorkGrouping?: V2NowWorkGrouping;
  v2ProjectReentryCards?: PluginProjectReentryCard[];
  v2ProjectContextRecovery?: Record<string, PluginProjectContextRecoveryState>;
  v2MiniProjectGrill?: Record<string, PluginMiniProjectGrillState>;
  v2MiniProjectGrillAvailable?: boolean;
  v2MiniProjectGrillPreviewAvailable?: boolean;
  v2MiniProjectGrillProposalAvailable?: boolean;
  v2ReentryTargetObjectId?: string;
  v2ReentryLoadError?: string;
  v2ObjectNarrations?: Record<string, PluginObjectNarration>;
  v2StatusNarrationLoadError?: string;
  v2CandidatePanel?: V2ExplicitCandidatePanelState;
  v2Candidates?: V2Candidate[];
  v2CandidateSourcePreviews?: Record<string, string>;
  v2CandidateAvailable?: boolean;
  v2ProviderAvailable?: boolean;
  v2ProviderState?: { status: "idle" | "loading" | "success" | "error"; message?: string };
  v2ProviderRevisionBusy?: boolean;
  v2LowRiskApplyBusyProposalId?: string;
  reviewMode?: "candidates" | "proposals";
  v2ProposalLoadError?: string;
  v2AuditLoadError?: string;
  recentActionCommitId?: string;
  originReturnLabel?: "返回原 Block" | "返回原 Page";
  v2MigrationRuns?: ServiceMigrationRun[];
  v2MigrationLoadError?: string;
  pageContext?: PageContextSnapshot;
  v2ManagedRuntimeState?: "RUNNING" | "ENDED";
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isWorkspace(value: string): value is Workspace {
  return (WORKSPACE_IDS as readonly string[]).includes(value);
}

function button(label: string, action: string, value?: string, className = "", disabled = false): string {
  return `<button type="button" class="${className}" data-action="${action}"${value ? ` data-value="${escapeHtml(value)}"` : ""}${disabled ? " disabled aria-busy=\"true\"" : ""}>${escapeHtml(label)}</button>`;
}

function empty(title: string, detail: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function renderNow(model: UiModel): string {
  if (model.v2NowWork) {
    const filter = model.v2NowWorkTypeFilter ?? "ALL";
    const grouping = model.v2NowWorkGrouping ?? "mixed";
    const allItems = [...model.v2NowWork.focus, ...model.v2NowWork.next, ...model.v2NowWork.waitingReview];
    const typeOrder: Array<Exclude<V2NowWorkTypeFilter, "ALL">> = ["PROJECT", "MINI_PROJECT", "TASK", "AREA", "DECISION", "OUTPUT"];
    const typeLabels: Record<Exclude<V2NowWorkTypeFilter, "ALL">, string> = { PROJECT: "Project", MINI_PROJECT: "MiniProject", TASK: "Task", AREA: "Area", DECISION: "Decision", OUTPUT: "Output" };
    const availableTypes = typeOrder.filter((type) => allItems.some((item) => item.objectType === type));
    const filtered = (values: ServiceNowWork["next"]) => filter === "ALL" ? values : values.filter((item) => item.objectType === filter);
    const orderingAvailable = filter === "ALL" && grouping === "mixed";
    const focusIds = new Set(model.v2NowWork.focus.map((item) => item.objectId));
    const cards = (values: ServiceNowWork["next"], kind: "focus" | "candidate") => values.map((item, index) => {
      const projected = model.v2ObjectNarrations?.[item.objectId];
      const narration = projected?.objectVersion === item.version ? projected.narration : undefined;
      const nextAction = narration?.nextAction;
      const statusAction = narration?.nextActionEligible
        && nextAction
        && (
          nextAction.intent === "REVIEW_WAITING"
          || nextAction.intent === "REVIEW_BLOCKER"
          || nextAction.intent === "REVIEW_PAUSE"
        )
        && nextAction.targetObjectId === item.objectId
        ? button(nextAction.label, "v2-condition-open", `${item.objectId}|${item.version}`, "primary")
        : button("更新状态", "v2-condition-open", `${item.objectId}|${item.version}`, "quiet");
      const status = narration
        ? `<p><strong>${escapeHtml(narration.conclusion)}</strong></p>${narration.keyEvidence.length ? `<p class="muted">${narration.keyEvidence.map((value) => escapeHtml(value)).join(" · ")}</p>` : ""}${narration.unknowns.length ? `<p class="uncertain"><strong>尚不能确认：</strong>${escapeHtml(narration.unknowns.join("；"))}</p>` : ""}<details><summary>查看状态依据</summary><ul>${narration.facts.map((fact) => `<li>${escapeHtml(fact.text)}</li>`).join("")}</ul></details>`
        : `<p>${escapeHtml(item.reason)}</p>`;
      return `<article class="card compact"${narration ? ` data-narration-rule="${escapeHtml(narration.source.ruleId)}"` : ""}><div class="eyebrow">${escapeHtml(item.objectType)}</div><h3>${escapeHtml(item.text)}</h3>${status}${item.dueAt ? `<p class="muted">期限：${escapeHtml(new Date(item.dueAt).toLocaleString("zh-CN"))}</p>` : ""}<div class="actions">${item.primaryAnchorExternalId ? button("打开正文", "v2-open-primary-anchor", item.primaryAnchorExternalId, "quiet") : ""}${statusAction}${item.objectType === "TASK" ? button("设置期限", "v2-deadline-open", `${item.objectId}|${item.version}|${item.dueAt ?? ""}`, "quiet") : ""}${kind === "focus" ? `${orderingAvailable ? `${button("上移", "v2-focus-up", item.objectId, "quiet", index === 0)}${button("下移", "v2-focus-down", item.objectId, "quiet", index === values.length - 1)}` : ""}${button("移出关注", "v2-focus-remove", `${item.objectId}|${item.version}`, "quiet")}` : focusIds.has(item.objectId) ? `<span class="muted">已在当前关注</span>` : button("加入关注", "v2-focus-add", `${item.objectId}|${item.version}`, "quiet")}</div></article>`;
    }).join("");
    const section = (title: string, source: ServiceNowWork["next"], kind: "focus" | "candidate") => {
      const values = filtered(source);
      if (!values.length) return "";
      const content = grouping === "type"
        ? typeOrder.filter((type) => values.some((item) => item.objectType === type)).map((type) => `<div class="now-work-group"><h3>${escapeHtml(typeLabels[type])}</h3><div class="cards">${cards(values.filter((item) => item.objectType === type), kind)}</div></div>`).join("")
        : `<div class="cards">${cards(values, kind)}</div>`;
      return `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
    };
    const controls = `<section class="now-work-controls" aria-label="Now Work 筛选与分组"><div><strong>类型</strong><div class="actions wrap">${button("全部", "v2-now-filter", "ALL", filter === "ALL" ? "active" : "quiet")}${availableTypes.map((type) => button(typeLabels[type], "v2-now-filter", type, filter === type ? "active" : "quiet")).join("")}</div></div><div><strong>排列</strong><div class="actions">${button("混排", "v2-now-grouping", "mixed", grouping === "mixed" ? "active" : "quiet")}${button("按类型分组", "v2-now-grouping", "type", grouping === "type" ? "active" : "quiet")}</div></div>${orderingAvailable ? "" : "<p class=\"muted\">手动调整 Focus 顺序请切回“全部 · 混排”；筛选不会改变正式状态。</p>"}</section>`;
    const content = `${section("当前关注", model.v2NowWork.focus, "focus")}${section("接下来值得处理", model.v2NowWork.next, "candidate")}${section("等待与复查", model.v2NowWork.waitingReview, "candidate")}`;
    const narrationError = model.v2StatusNarrationLoadError
      ? `<div class="error"><strong>状态说明暂时不可用：</strong>${escapeHtml(model.v2StatusNarrationLoadError)}<span>继续显示 Local Service 的既有只读理由；没有改变正式状态或动作资格。</span></div>`
      : "";
    return `${controls}${narrationError}${content || empty("当前筛选下没有事项", "普通 Waiting 保持安静；可切换类型查看当前投影。")}`;
  }
  if (model.now.items.length === 0) return empty("当前没有需要推进的事项", "这里只显示 Actionable 与高价值注意项。");
  return `<div class="cards">${model.now.items
    .map(
      (item) => `<article class="card compact">
        <div class="badges"><span>${escapeHtml(item.phase)}</span><span>${escapeHtml(item.condition.kind)}</span>${item.signals
          .map((signal) => `<span class="signal">${escapeHtml(signal)}</span>`)
          .join("")}</div>
        <h3>${escapeHtml(item.text)}</h3>
        ${item.nextAction ? `<p><strong>下一步：</strong>${escapeHtml(item.nextAction)}</p>` : ""}
        ${button("打开对象", "select-object", item.objectId, "quiet")}
      </article>`,
    )
    .join("")}</div>`;
}

function renderV2ObjectClosure(object: V2ManagedObject): string {
  if (!object.closure) return "";
  if (object.objectType === "MINI_PROJECT") {
    const closure = object.closure as V2MiniProjectClosure;
    return `<details class="mini-project-closure" open><summary>MiniProject Closure</summary><p><strong>原目标：</strong>${escapeHtml(closure.originalGoal)}</p><p><strong>实际结果：</strong>${escapeHtml(closure.actualResult)}</p><p><strong>遗留或转移：</strong>${escapeHtml(closure.remainingWork)}</p></details>`;
  }
  const closure = object.closure as V2ProjectClosure;
  return `<details class="project-closure" open><summary>Project Closure</summary><p><strong>原始目标：</strong>${escapeHtml(closure.originalGoal)}</p><p><strong>实际结果：</strong>${escapeHtml(closure.actualResult)}</p><p><strong>主要交付：</strong>${escapeHtml(closure.majorDeliverables.join("；") || "无")}</p><p><strong>未完成 Objective：</strong>${closure.incompleteObjectives.length ? closure.incompleteObjectives.map((item) => `${escapeHtml(item.objective)}（${escapeHtml(item.reason)} → ${escapeHtml(item.nextStep)}）`).join("；") : "无"}</p><p><strong>遗留去向：</strong>${escapeHtml(closure.legacyDisposition)}</p><p><strong>关键 Decision：</strong>${escapeHtml(closure.keyDecisions.join("；") || "无")}</p><p><strong>未来重入：</strong>${escapeHtml(closure.futureSummary)}</p></details>`;
}

function renderV2ProjectStructure(object: V2ManagedObject): string {
  const structure = object.objectType === "PROJECT" ? object.projectStructure : undefined;
  if (!structure) return "";
  const objectives = structure.objectives.length ? `<section><h4>Objectives</h4><ul>${structure.objectives.map((item) => `<li><strong>${escapeHtml(item.priority === "PRIMARY" ? "Primary" : "Secondary")}：</strong>${escapeHtml(item.text)}${item.successEvidence.length ? ` · 成功证据：${escapeHtml(item.successEvidence.join("；"))}` : ""}</li>`).join("")}</ul></section>` : "";
  const deliverables = structure.deliverables.length ? `<section><h4>Deliverables</h4><ul>${structure.deliverables.map((item) => `<li>${escapeHtml(item.text)} · ${escapeHtml(item.status)} · 验收：${escapeHtml(item.acceptance)}</li>`).join("")}</ul></section>` : "";
  const stages = structure.workStages.length ? `<section><h4>Work Stages</h4><ul>${structure.workStages.map((item) => `<li>${escapeHtml(item.name)}：${escapeHtml(item.statusDescription)}</li>`).join("")}</ul></section>` : "";
  return `<details class="project-structure" open><summary>Project 当前接口</summary><p><strong>当前摘要：</strong>${escapeHtml(structure.currentSummary)}</p><p><strong>当前推进：</strong>${escapeHtml(structure.currentFocuses.join("；"))}</p>${objectives}${deliverables}${stages}${structure.stageMappings.length ? `<p class="muted">${structure.stageMappings.length} 个工作对象已映射主 Work Stage；阶段调整不会移动正文或改变归属。</p>` : ""}</details>`;
}

function renderObjects(model: UiModel): string {
  const relationError = model.v2RelationLoadError ? `<section class="card error" role="alert"><strong>关系投影暂不可用</strong><p>${escapeHtml(model.v2RelationLoadError)}</p><p class="muted">正式对象与其他工作区仍可使用；没有执行关系写入。</p></section>` : "";
  const projectCreator = `<section class="card project-creator" aria-label="创建 Project 页面"><div class="eyebrow">V2 · Project 原子创建</div><h3>新建 Project</h3><p class="muted">创建受控的 Project/&lt;名称&gt; 页面，并在页面验证后一次性写入 SQLite。</p><label>Project 名称<input data-field="v2ProjectName" placeholder="例如：告警推送治理"${model.v2ProjectCreationAvailable ? "" : " disabled"}></label>${button("创建 Project 与页面", "create-v2-project", undefined, "primary", !model.v2ProjectCreationAvailable)}</section>`;
  const areaCreator = `<section class="card area-creator" aria-label="创建 Area"><div class="eyebrow">V2 · Area 受控入口</div><h3>新建 Area</h3><p class="muted">记录长期责任边界并写入 SQLite；页面与 Anchor 为可选能力，此处不创建隐式 Graph 副本。</p><label>责任描述<input data-field="v2AreaText" placeholder="例如：维持稳定作息与健康检查"${model.v2AreaAvailable && !model.v2AreaBusy ? "" : " disabled"}></label>${button(model.v2AreaBusy ? "正在创建…" : "创建 Area", "create-v2-area", undefined, "primary", !model.v2AreaAvailable || model.v2AreaBusy === true)}</section>`;
  const associationCreator = model.v2Objects && model.v2Objects.length >= 2 ? `<section class="card association-creator" aria-label="添加普通 Association"><div class="eyebrow">V2 · 普通关联</div><h3>关联两个正式对象</h3><p class="muted">只表达“相关”，不会改变 Primary Ownership、位置、Lifecycle 或 Focus。</p><label>来源对象<select data-field="v2AssociationSource"><option value="">请选择</option>${model.v2Objects.map((object) => `<option value="${escapeHtml(object.objectId)}" data-version="${object.version}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)} · v${object.version}</option>`).join("")}</select></label><label>目标对象<select data-field="v2AssociationTarget"><option value="">请选择</option>${model.v2Objects.map((object) => `<option value="${escapeHtml(object.objectId)}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)}</option>`).join("")}</select></label><label class="confirm-line"><input type="checkbox" data-field="v2AssociationConfirmed" value="yes">确认添加普通 Association，不改变归属</label>${button(model.v2AssociationBusy ? "正在添加…" : "添加 Association", "v2-association-add", undefined, "primary", !model.v2AssociationAvailable || model.v2AssociationBusy)}${model.v2Associations?.length ? `<p class="muted">当前已有 ${model.v2Associations.length} 条普通 Association。</p>` : ""}</section>` : "";
  if (model.v2Objects !== undefined) {
    if (model.v2Objects.length === 0) return `${areaCreator}${projectCreator}${empty("还没有正式对象", "从 Review Center 正式化，或创建 V2 Area / Project。")}`;
    const objectLabels = new Map(model.v2Objects.map((object) => [object.objectId, `${object.objectType} · ${object.text}`]));
    const ownershipList = (model.v2PrimaryOwnerships ?? []).length ? `<section aria-label="Primary Ownership 列表"><h2>Primary Ownership</h2><div class="object-list">${(model.v2PrimaryOwnerships ?? []).slice(0, 100).map((ownership) => `<article class="object-row"><span>${escapeHtml(objectLabels.get(ownership.childObjectId) ?? ownership.childObjectId)} → ${escapeHtml(objectLabels.get(ownership.ownerObjectId) ?? ownership.ownerObjectId)}</span><small>唯一主归属</small></article>`).join("")}</div>${(model.v2PrimaryOwnerships?.length ?? 0) > 100 ? `<p class="muted">仅显示前 100 条；完整投影仍由 Local Service 提供。</p>` : ""}</section>` : "";
    const visibleAssociations = (model.v2Associations ?? []).slice(0, 100);
    const associationList = visibleAssociations.length ? `<section aria-label="普通 Association 列表"><h2>普通 Association</h2><div class="object-list">${visibleAssociations.map((association) => `<article class="object-row"><span>${escapeHtml(objectLabels.get(association.sourceObjectId) ?? association.sourceObjectId)} → ${escapeHtml(objectLabels.get(association.targetObjectId) ?? association.targetObjectId)}</span><small>${escapeHtml(association.associationKind)} · ${escapeHtml(association.status)}</small></article>`).join("")}</div>${(model.v2Associations?.length ?? 0) > visibleAssociations.length ? `<p class="muted">仅显示前 ${visibleAssociations.length} 条；完整投影仍由 Local Service 提供。</p>` : ""}</section>` : "";
    const list = `<section aria-label="V2 正式对象"><h2>正式对象</h2><div class="object-list">${model.v2Objects.map((object) => {
      const supportsReasonedLifecycle = ["TASK", "MINI_PROJECT", "PROJECT"].includes(object.objectType);
      const lifecycleActions = supportsReasonedLifecycle && object.lifecycle === "OPEN"
        ? button(model.v2LifecycleProposalBusy ? "正在发起…" : `取消 ${object.objectType}`, "v2-lifecycle-propose-open", `${object.objectId}|${object.version}|CANCEL`, "quiet", model.v2LifecycleProposalBusy === true)
        : supportsReasonedLifecycle && (object.lifecycle === "COMPLETED" || object.lifecycle === "CANCELLED")
          ? button(model.v2LifecycleProposalBusy ? "正在发起…" : `重开 ${object.objectType}`, "v2-lifecycle-propose-open", `${object.objectId}|${object.version}|REOPEN`, "quiet", model.v2LifecycleProposalBusy === true)
          : "";
      const closureAction = object.objectType === "MINI_PROJECT" && object.lifecycle === "OPEN" ? button(model.v2ClosureProposalBusy ? "正在发起…" : "完成 MiniProject", "v2-mini-project-closure-propose", `${object.objectId}|${object.version}`, "quiet", model.v2ClosureProposalBusy === true) : "";
      const grillAction = object.objectType === "MINI_PROJECT" && object.lifecycle === "OPEN" ? button(model.v2MiniProjectGrillAvailable ? "梳理 MiniProject" : "梳理暂不可用", "v2-mini-project-grill-open", `${object.objectId}|${object.version}`, "quiet", model.v2MiniProjectGrillAvailable !== true) : "";
      const areaAction = object.objectType === "AREA" && object.lifecycle === "OPEN" ? button("编辑 Area", "v2-area-edit-open", `${object.objectId}|${object.version}`, "quiet", model.v2AreaBusy === true) : "";
      const projectStructureAction = object.objectType === "PROJECT" && object.lifecycle === "OPEN" ? button("更新 Project 当前接口", "v2-project-structure-open", `${object.objectId}|${object.version}`, "quiet") : "";
      return `<article class="object-row"><span>${escapeHtml(object.text)}</span><small>${escapeHtml(object.objectType)} · ${escapeHtml(object.lifecycle)} · ${escapeHtml(object.condition.kind)} · v${escapeHtml(object.version)}</small>${lifecycleActions || closureAction || grillAction || areaAction || projectStructureAction ? `<div class="actions">${areaAction}${grillAction}${closureAction}${projectStructureAction}${lifecycleActions}</div>` : ""}${renderV2ProjectStructure(object)}${renderV2ObjectClosure(object)}</article>`;
    }).join("")}</div></section>`;
    return `${areaCreator}${projectCreator}${relationError}${associationCreator}${ownershipList}${associationList}${list}`;
  }
  if (model.objects.length === 0) return `${areaCreator}${projectCreator}${empty("还没有正式对象", "从 Proposal Review 整理当前页，或创建 V2 Area / Project。")}`;
  const list = `<div class="object-list">${model.objects
    .map(
      (object) => `<button class="object-row" data-action="select-object" data-value="${escapeHtml(object.objectId)}">
        <span>${escapeHtml(object.text)}</span><small>${escapeHtml(object.objectType)} · ${escapeHtml(object.phase)} · ${escapeHtml(object.condition.kind)}</small>
      </button>`,
    )
    .join("")}</div>`;
  const detailView = model.selectedObjectDetail;
  if (!detailView) return `${areaCreator}${projectCreator}${list}`;
  const { object, owner, anchors, signals, recentEvents, undoableCommitId } = detailView;
  const detail = `<aside class="drawer" aria-label="对象抽屉">
    <div class="eyebrow">${escapeHtml(object.objectType)} · v${object.version}</div>
    <h2>${escapeHtml(object.text)}</h2>
    <code>${escapeHtml(object.objectId)}</code>
    <div class="badges"><span>${escapeHtml(object.phase)}</span><span>${escapeHtml(object.condition.kind)}</span></div>
    ${signals.length ? `<div class="badges">${signals.map((signal) => `<span class="signal">${escapeHtml(signal)}</span>`).join("")}</div>` : ""}
    <section><h3>主归属</h3><p>${owner ? escapeHtml(owner.text) : "待确认归属"}</p></section>
    ${object.completionCriteria ? `<section><h3>完成标准</h3><p>${escapeHtml(object.completionCriteria)}</p></section>` : ""}
    ${object.nextAction ? `<section><h3>下一步</h3><p>${escapeHtml(object.nextAction)}</p></section>` : ""}
    ${object.currentSummary ? `<section><h3>当前状态</h3><p>${escapeHtml(object.currentSummary)}</p></section>` : ""}
    ${object.dueAt || object.reviewAt ? `<section><h3>日期</h3><p>${object.dueAt ? `due ${escapeHtml(object.dueAt)}` : ""}${object.dueAt && object.reviewAt ? " · " : ""}${object.reviewAt ? `review ${escapeHtml(object.reviewAt)}` : ""}</p></section>` : ""}
    ${object.condition.kind === "WAITING" ? `<section><h3>等待</h3><p>${escapeHtml(object.condition.waitingFor)} · ${escapeHtml(object.condition.expectedResult)} · ${escapeHtml(object.condition.reviewAt)}</p></section>` : ""}
    ${object.condition.kind === "BLOCKED" ? `<section><h3>阻塞</h3><p>${escapeHtml(object.condition.reason)}</p></section>` : ""}
    ${anchors.length ? `<section><h3>正文与来源</h3>${anchors.map((anchor) => `<p><code>${escapeHtml(anchor.role)}</code> · ${escapeHtml(anchor.status)} · ${escapeHtml(anchor.cachedPageRef ?? anchor.externalId)}</p>`).join("")}</section>` : ""}
    ${recentEvents.length ? `<section><h3>最近事件</h3><ol>${recentEvents.map((event) => `<li>${escapeHtml(event.timestamp)} · ${escapeHtml(event.operationType)}</li>`).join("")}</ol></section>` : ""}
    <div class="actions wrap">
      ${button("编辑对象", "edit-object", object.objectId)}
      ${button("打开正文", "open-object", object.objectId, "quiet")}
      ${button("设置主归属", "set-owner", object.objectId)}
      ${button("设为 Actionable", "condition-actionable", object.objectId)}
      ${button("设置 Waiting", "condition-waiting", object.objectId)}
      ${button("设置 Blocked", "condition-blocked", object.objectId)}
      ${button("设置 Paused", "condition-paused", object.objectId)}
      ${allowedPhaseTransitions(object)
        .map((phase) => button(`进入 ${phase}`, "advance-phase", `${object.objectId}|${phase}|${object.objectType}|${object.phase}`))
        .join("")}
      ${button("重新绑定当前块", "rebind-anchor", object.objectId, "danger")}
      ${button("查看审计", "view-audit", object.objectId, "quiet")}
      ${undoableCommitId ? button("撤销最近 Commit", "undo-commit", undoableCommitId, "danger") : ""}
    </div>
  </aside>`;
  return `${projectCreator}<div class="split">${list}${detail}</div>`;
}

function suggestedText(operation: SemanticOperation): string | undefined {
  if (operation.operationType === "rewrite_content" && typeof operation.payload.text === "string") return operation.payload.text;
  if (operation.operationType === "update_object" && typeof operation.payload.text === "string") return operation.payload.text;
  if (operation.operationType === "create_object" && operation.payload.input && typeof operation.payload.input === "object") {
    const text = (operation.payload.input as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  return undefined;
}

function impactLabel(operation: SemanticOperation): string {
  const target = `${operation.target.kind}:${operation.target.id}`;
  return `${operation.operationType} 将影响 ${target}；风险 ${operation.riskLevel}；置信度 ${Math.round(operation.confidence * 100)}%`;
}

function renderFinalImpact(impact: ProposalImpactView | undefined): string {
  if (!impact) return "最终影响预览暂不可用。";
  return [
    `最终影响预览：可执行 ${impact.executable}；阻塞 ${impact.blocked}；待决定 ${impact.pending}；拒绝 ${impact.rejected}`,
    `正式变化：${impact.effects.join("、") || "无"}`,
    `对象：${impact.affectedObjects.join("、") || "无"}`,
    `视图：${impact.affectedViews.join("、") || "无"}`,
    `正文/文件：${impact.affectedFiles.join("、") || "无"}`,
    `下游依赖：${impact.downstream.join("；") || "无"}`,
    `预校验：${impact.validationErrors.length ? impact.validationErrors.join("；") : "通过"}`,
  ].join("\n");
}

function renderReview(model: UiModel): string {
  const open = model.proposals.filter((proposal) => proposal.status === "OPEN");
  const v2 = model.v2Proposals ?? [];
  const reviewMode = model.reviewMode ?? "candidates";
  const candidatePanel = model.v2CandidatePanel ? renderV2ExplicitCandidateDiscoveryPanel(model.v2CandidatePanel, Boolean(model.v2CandidateAvailable), model.v2Candidates, model.v2CandidateSourcePreviews) : "";
  const candidateCount = (model.v2Candidates ?? []).filter(({ disposition, deferredUntil }) => disposition === "PENDING" || (disposition === "LATER" && deferredUntil !== undefined && Date.parse(deferredUntil) <= Date.now())).length;
  const proposalCount = open.length + v2.filter((record) => !["APPLIED", "REJECTED"].includes(record.proposal.status)).length;
  const reviewModeButton = (label: string, value: "candidates" | "proposals") => `<button type="button" class="${reviewMode === value ? "primary" : "quiet"}" data-action="review-mode" data-value="${value}" aria-pressed="${reviewMode === value}">${escapeHtml(label)}</button>`;
  const tabs = `<div class="actions review-modes" role="group" aria-label="审阅中心视图">${reviewModeButton(`待整理${candidateCount ? ` (${candidateCount})` : ""}`, "candidates")}${reviewModeButton(`待审阅${proposalCount ? ` (${proposalCount})` : ""}`, "proposals")}</div>`;
  if (reviewMode === "candidates") {
    const providerState = model.v2ProviderState ?? { status: "idle" as const };
    const providerPanel = model.v2ProviderAvailable
      ? `<section class="card compact"><div class="eyebrow">局部语义 · DeepSeek Provider</div><h3>分析当前选中 Block</h3><p>只生成可审阅 Proposal；普通记录会返回理由且零写入。不会自动扫描页面或修改正式状态。</p><div class="actions">${button(providerState.status === "loading" ? "分析中…" : "分析当前块", "v2-provider-analyze-current-block", undefined, "primary", providerState.status === "loading")}</div>${providerState.message ? `<div class="${providerState.status === "error" ? "error" : "notice"}">${escapeHtml(providerState.message)}</div>` : ""}</section>`
      : "";
    return `${tabs}${providerPanel}${candidatePanel || empty("当前不可扫描候选", "Local Service 就绪后，可手动扫描当前页；不会自动扫描全 Graph。")}`;
  }
  const v2LoadError = model.v2ProposalLoadError ? `<div class="error"><strong>V2 审阅队列未加载：</strong>${escapeHtml(model.v2ProposalLoadError)}<span>没有修改任何 Proposal 或正式状态。</span></div>` : "";
  const v2Cards = v2.map((record) => {
    const statusNarration = projectPluginProposalNarration(record, model.v2SemanticCommits ?? []);
    const lowRiskApply = lowRiskApplyEligibility(record);
    const lowRiskApplyBusy = model.v2LowRiskApplyBusyProposalId === record.proposal.proposalId;
    const acceptedGroups = record.proposal.groups.filter((group) => group.disposition === "ACCEPTED");
    const hasAcceptedGroup = acceptedGroups.length > 0;
    const isProjectClosure = acceptedGroups.length === 1
      && acceptedGroups[0]!.risk === "HIGH"
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length === 2
      && acceptedGroups[0]!.semanticOperations.some((operation) => operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload)
      && acceptedGroups[0]!.semanticOperations.some((operation) => operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.lifecycle === "COMPLETED");
    const isProjectStructure = acceptedGroups.length === 1
      && acceptedGroups[0]!.risk === "HIGH"
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length === 1
      && acceptedGroups[0]!.semanticOperations[0]!.kind === "UPDATE_PROJECT_INTERFACE"
      && "projectStructure" in acceptedGroups[0]!.semanticOperations[0]!.payload;
    const isMiniProjectRestructure = acceptedGroups.length === 1
      && acceptedGroups[0]!.risk === "HIGH"
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length > 0
      && acceptedGroups[0]!.semanticOperations.every((operation) => operation.kind === "CREATE_BLOCK" || operation.kind === "MOVE_BLOCK");
    const isOwnershipChange = acceptedGroups.length === 1
      && acceptedGroups[0]!.risk === "HIGH"
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length === 1
      && acceptedGroups[0]!.semanticOperations[0]!.kind === "CHANGE_OWNERSHIP";
    const acceptedMiniProjectClosureGroups = acceptedGroups.filter((group) => group.risk === "HIGH" && group.textPatches.length === 0 && group.semanticOperations.length === 1 && group.semanticOperations[0]!.kind === "TRANSITION_LIFECYCLE" && group.semanticOperations[0]!.payload.lifecycle === "COMPLETED" && group.semanticOperations[0]!.payload.objectType === "MINI_PROJECT");
    const hasAcceptedMiniProjectClosure = acceptedMiniProjectClosureGroups.length === 1;
    const miniProjectClosureGroup = acceptedMiniProjectClosureGroups[0];
    const miniProjectClosureBlockedByOtherGroups = hasAcceptedMiniProjectClosure && record.proposal.groups.some((group) => group.groupId !== miniProjectClosureGroup!.groupId && group.disposition !== "REJECTED");
    const isMiniProjectClosure = hasAcceptedMiniProjectClosure && !miniProjectClosureBlockedByOtherGroups && acceptedGroups.length === 1;
    const reasonedLifecycleOperation = acceptedGroups.length === 1 && acceptedGroups[0]!.textPatches.length === 0 && acceptedGroups[0]!.semanticOperations.length === 1
      ? acceptedGroups[0]!.semanticOperations[0]
      : undefined;
    const isReasonedLifecycle = reasonedLifecycleOperation?.kind === "TRANSITION_LIFECYCLE" && (reasonedLifecycleOperation.payload.action === "CANCEL" || reasonedLifecycleOperation.payload.action === "REOPEN");
    const miniProjectClosureOperation = hasAcceptedMiniProjectClosure ? miniProjectClosureGroup!.semanticOperations[0] : undefined;
    const isMarkerDrivenMiniProjectClosure = miniProjectClosureOperation?.payload.marker === "DONE";
    const originalCommit = model.v2SemanticCommits?.find((commit) => commit.proposalId === record.proposal.proposalId && commit.semanticCommitId.startsWith("proposal-commit:"));
    const ownershipUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `ownership-undo:${originalCommit.semanticCommitId}`) : undefined;
    const projectStructureUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `project-structure-undo:${originalCommit.semanticCommitId}`) : undefined;
    const miniProjectRestructureUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `mini-project-restructure-undo:${originalCommit.semanticCommitId}`) : undefined;
    const canCommit = hasAcceptedGroup && !miniProjectClosureBlockedByOtherGroups && (record.proposal.status === "ACCEPTED" || record.proposal.status === "PARTIALLY_ACCEPTED");
    const lifecycleUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `lifecycle-undo:${originalCommit.semanticCommitId}`) : undefined;
    const canOwnershipUndo = isOwnershipChange && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && ownershipUndoCommit?.status !== "FAILED";
    const canProjectStructureUndo = isProjectStructure && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && projectStructureUndoCommit?.status !== "FAILED";
    const canMiniProjectRestructureUndo = isMiniProjectRestructure && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && miniProjectRestructureUndoCommit?.status !== "FAILED" && miniProjectRestructureUndoCommit?.status !== "COMPLETED";
    const canLifecycleUndo = isReasonedLifecycle && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && lifecycleUndoCommit?.status !== "FAILED" && lifecycleUndoCommit?.status !== "COMPLETED";
    const canUndo = !isProjectClosure && !isProjectStructure && !isMiniProjectRestructure && !isMiniProjectClosure && !isReasonedLifecycle && !isOwnershipChange && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED";
    const canReviseWithProvider = model.v2ProviderAvailable === true && record.proposal.source.kind === "local_llm" && ["READY", "IN_REVIEW", "PARTIALLY_ACCEPTED", "ACCEPTED"].includes(record.proposal.status);
    return `<article class="card proposal v2-proposal" data-narration-rule="${escapeHtml(statusNarration.source.ruleId)}">
    <div class="eyebrow">修改建议 · ${escapeHtml(record.updatedAt)}</div>
    <h3>${escapeHtml(statusNarration.conclusion)}</h3>
    ${statusNarration.keyEvidence.length ? `<p class="muted">${statusNarration.keyEvidence.map((value) => escapeHtml(value)).join(" · ")}</p>` : ""}
    ${statusNarration.unknowns.length ? `<p class="uncertain"><strong>尚不能确认：</strong>${escapeHtml(statusNarration.unknowns.join("；"))}</p>` : ""}
    <p><strong>${escapeHtml(record.proposal.title)}</strong></p>
    <p><strong>当前上下文：</strong>${escapeHtml(record.proposal.context)}</p>
    <p><strong>理解与逻辑：</strong>${escapeHtml(record.proposal.understanding)} · ${escapeHtml(record.proposal.logic)}</p>
    <section class="suggestion"><h4>最终可读预览</h4><p>${escapeHtml(record.proposal.finalPreview)}</p></section>
    ${record.proposal.groups.map((group) => {
      const reviewKind = group.semanticOperations.some((operation) => operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.objectType === "MINI_PROJECT" && operation.payload.lifecycle === "COMPLETED") ? "MINI_PROJECT_CLOSURE" : "ORDINARY";
      const deferral = group.disposition === "DEFERRED" && group.deferredUntil
        ? `<p class="muted">暂缓至 ${escapeHtml(new Date(group.deferredUntil).toLocaleString("zh-CN"))}${group.deferReason ? ` · ${escapeHtml(group.deferReason)}` : ""}</p>`
        : "";
      return `<section class="operation risk-${group.risk.toLowerCase()}"><div><code>${escapeHtml(group.groupId)}</code><span>${escapeHtml(group.disposition)} · ${escapeHtml(group.risk)}</span></div><p>${escapeHtml(group.explanation)}</p>${deferral}${group.textPatches.map((patch) => `<div class="readable-diff"><del>${escapeHtml(patch.beforeText)}</del><ins>${escapeHtml(patch.afterText)}</ins></div>`).join("")}<div class="report"><strong>语义 Diff</strong>${group.semanticOperations.map((operation) => `<p>${escapeHtml(operation.kind)}：${escapeHtml(operation.summary)}</p>`).join("") || "<p>无</p>"}</div>${group.disposition === "PENDING" || group.disposition === "DEFERRED" ? `<div class="actions">${lowRiskApply.eligible ? button(lowRiskApplyBusy ? "正在接受并应用…" : "接受并应用", "v2-low-risk-apply", `${record.proposal.proposalId}|${record.updatedAt}`, "primary", lowRiskApplyBusy) : ""}${button("仅接受，稍后应用", "v2-review-accept", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}|${group.risk}|${reviewKind}`, "quiet", lowRiskApplyBusy)}${button("拒绝", "v2-review-reject", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}`, "quiet", lowRiskApplyBusy)}${button("暂缓", "v2-review-defer", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}`, "quiet", lowRiskApplyBusy)}</div>` : ""}</section>`;
    }).join("")}
    ${canReviseWithProvider ? `<div class="actions">${button(model.v2ProviderRevisionBusy ? "Agent 调整中…" : "调整建议", "v2-provider-revise-open", `${record.proposal.proposalId}|${record.updatedAt}`, "quiet", model.v2ProviderRevisionBusy === true)}</div>` : ""}
    ${canCommit ? `<div class="actions">${button("提交前检查", "v2-proposal-revalidate", `${record.proposal.proposalId}|${record.updatedAt}`, "quiet")}${button(isProjectClosure ? "确认完成 Project" : isProjectStructure ? "确认更新当前接口" : isMiniProjectRestructure ? "确认原位重构" : isMiniProjectClosure ? "确认完成 MiniProject" : isReasonedLifecycle ? (reasonedLifecycleOperation!.payload.action === "CANCEL" ? "确认取消对象" : "确认重开对象") : isOwnershipChange ? "确认改变主归属" : "确认最终提交", isProjectClosure ? "v2-project-closure-commit" : isProjectStructure ? "v2-project-structure-commit" : isMiniProjectRestructure ? "v2-mini-project-restructure-commit" : isMiniProjectClosure ? "v2-mini-project-closure-commit" : isReasonedLifecycle ? "v2-reasoned-lifecycle-commit" : isOwnershipChange ? "v2-ownership-commit" : "v2-proposal-commit", `${record.proposal.proposalId}|${record.updatedAt}${isReasonedLifecycle ? `|${reasonedLifecycleOperation!.payload.action}` : ""}`, "primary", (isMiniProjectRestructure && model.v2StructureCommitBusy === true) || (isOwnershipChange && model.v2OwnershipCommitBusy === true) || ((isMiniProjectClosure || isReasonedLifecycle) && model.v2LifecycleCommitBusy === true))}</div>` : canOwnershipUndo ? `<div class="actions">${button("撤销主归属变化", "v2-ownership-undo", originalCommit.semanticCommitId, "danger", model.v2OwnershipCommitBusy === true)}</div>` : canProjectStructureUndo ? `<div class="actions">${button("撤销当前接口更新", "v2-project-structure-undo", originalCommit.semanticCommitId, "danger")}</div>` : canMiniProjectRestructureUndo ? `<div class="actions">${button(model.v2StructureCommitBusy ? "正在安全撤销…" : "撤销原位重构", "v2-mini-project-restructure-undo", originalCommit.semanticCommitId, "danger", model.v2StructureCommitBusy === true)}</div>` : canLifecycleUndo ? `<div class="actions">${button(reasonedLifecycleOperation!.payload.action === "CANCEL" ? "撤销取消" : "撤销重开", "v2-lifecycle-undo", originalCommit.semanticCommitId, "danger", model.v2LifecycleCommitBusy === true)}</div>` : canUndo ? `<div class="actions">${button("撤销本次生效", "v2-proposal-undo", originalCommit.semanticCommitId, "danger")}</div>` : ""}
    <div class="notice">${canOwnershipUndo ? `Primary Ownership 已正式生效；可恢复到审阅前主归属，且不会移动正文。` : ownershipUndoCommit?.status === "FAILED" ? "对象或 Primary Ownership 已有后续变化；Undo 已安全终止且没有覆盖当前状态。" : canMiniProjectRestructureUndo ? "MiniProject 已按预览原位重构；撤销前会重验整棵子树，任何后续变化都会停止覆盖。" : miniProjectRestructureUndoCommit?.status === "FAILED" ? "结构撤销未完成，但已恢复到撤销前的已应用结构；原 Commit 仍有效。" : canLifecycleUndo ? `${reasonedLifecycleOperation!.payload.action === "CANCEL" ? "取消" : "重开"}已正式生效；可恢复 Lifecycle${reasonedLifecycleOperation!.payload.action === "REOPEN" ? " 与 Closure 快照" : ""}，不改写正文。` : lifecycleUndoCommit?.status === "FAILED" ? "对象在 Lifecycle Commit 后已有变化；Undo 已安全终止且没有覆盖当前状态。" : canUndo ? "已正式生效；可撤销且不会覆盖后续编辑。" : originalCommit?.status === "UNDONE" ? "原修改已撤销；Audit 与逆向修改历史均保留。" : isProjectClosure && record.proposal.status === "APPLIED" ? "Project Closure 已正式生效；Project 已退出活跃视图，页面保留。" : isProjectStructure && record.proposal.status === "APPLIED" ? "Project 当前接口已正式生效；Graph、归属和位置未改变。" : hasAcceptedMiniProjectClosure && record.proposal.status === "APPLIED" ? `MiniProject 三问 Closure 已正式生效；${isMarkerDrivenMiniProjectClosure ? "移除 Marker 不会自动重开" : "本次对象级关闭未改写 Logseq 正文"}，重开必须显式命令与理由。` : isReasonedLifecycle && record.proposal.status === "APPLIED" ? `${reasonedLifecycleOperation!.payload.action === "CANCEL" ? "取消" : "重开"}已正式生效；原因保留在已应用 Proposal，正文、Anchor、Condition 与 Focus 未改变。` : isOwnershipChange && record.proposal.status === "APPLIED" ? "Primary Ownership 已正式生效；位置、Anchor 与 Association 未改变。" : miniProjectClosureBlockedByOtherGroups ? "MiniProject Closure 已接受，但其余语义组仍未终结；请先拒绝这些组，或将其拆成独立 Proposal，再进行最终关闭。" : hasAcceptedGroup ? `已接受的语义组尚未正式生效；最终确认会在同一流程中重验并${isProjectClosure ? "原子记录 Closure 与完成状态" : isProjectStructure ? "原子更新版本化 Project 当前接口，不改 Graph" : isMiniProjectRestructure ? "按逐步账本原位移动材料、保留 UUID 与正文，并提供独立 inverse Undo" : isMiniProjectClosure ? `原子记录 MiniProject 三问 Closure 与 Lifecycle${isMarkerDrivenMiniProjectClosure ? "，并保留 Anchor 证据" : "，且不改写 Graph"}` : isReasonedLifecycle ? "记录原因并改变 Lifecycle，不改写 Graph" : isOwnershipChange ? "原子改变唯一 Primary Ownership" : "写入并显示 Undo"}。` : "审阅决定只更新 Proposal；尚未修改正式正文或对象。"}</div>
    <details><summary>状态依据与技术信息</summary><ul>${statusNarration.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul><p class="muted">规则 ${escapeHtml(statusNarration.source.ruleId)} · ${escapeHtml(record.proposal.source.kind)}${record.proposal.source.model ? ` · ${escapeHtml(record.proposal.source.model)}` : ""} · ${escapeHtml(record.proposal.status)}</p></details>
  </article>`;
  }).join("");
  if (open.length === 0 && v2.length === 0 && !v2LoadError) return `${tabs}${empty("没有待审查 Proposal", model.agent.enabled ? "在待整理视图分析当前 Block，或从当前页 Candidate 生成 Proposal。" : "Agent 已关闭；基础事务系统仍可使用。")}`;
  return `${tabs}${v2LoadError}<div class="cards">${v2Cards}${open
    .map(
      (proposal) => `<article class="card proposal">
        <div class="eyebrow">${escapeHtml(proposal.providerId)} · ${escapeHtml(proposal.generatedAt)}</div>
        <h3>${escapeHtml(proposal.summary)}</h3>
        <p><strong>原文：</strong>${escapeHtml(proposal.facts[0] ?? "")}</p>
        ${proposal.operations.map(suggestedText).filter((value): value is string => Boolean(value)).map((value) => `<section class="suggestion"><h4>建议正文</h4><p>${escapeHtml(value)}</p><div class="readable-diff"><del>${escapeHtml(proposal.facts[0] ?? "")}</del><ins>${escapeHtml(value)}</ins></div></section>`).join("")}
        ${proposal.uncertainties.length ? `<p class="uncertain"><strong>不确定：</strong>${escapeHtml(proposal.uncertainties.join("；"))}</p>` : ""}
        <div class="operations">${proposal.operations
          .map(
            (operation) => `<div class="operation risk-${operation.riskLevel.toLowerCase()}">
              <div><code>${escapeHtml(operation.operationType)}</code><span>${escapeHtml(operation.status)}</span></div>
              <p>${escapeHtml(operation.rationale)}</p>
              <p class="muted">${escapeHtml(impactLabel(operation))}</p>
              <small>${escapeHtml(operation.ruleRefs.join(" · "))}${operation.dependencies.length ? ` · 依赖 ${escapeHtml(operation.dependencies.join(", "))}` : ""}</small>
              ${operation.deferredUntil ? `<small>暂缓至 ${escapeHtml(operation.deferredUntil)} · ${escapeHtml(operation.deferReason ?? "")}</small>` : ""}
              ${operation.status === "COMMITTED" ? "<p class=\"muted\">已在此前 SemanticCommit 中提交。</p>" : `<div class="actions">
                ${button("接受", "review-accept", `${proposal.proposalId}|${operation.operationId}|${operation.riskLevel}`)}
                ${button("拒绝", "review-reject", `${proposal.proposalId}|${operation.operationId}`, "quiet")}
                ${button("编辑后接受", "review-edit", `${proposal.proposalId}|${operation.operationId}|${operation.riskLevel}`, "quiet")}
                ${button("暂缓", "review-defer", `${proposal.proposalId}|${operation.operationId}`, "quiet")}
              </div>`}
            </div>`,
          )
          .join("")}</div>
        <div class="report">${escapeHtml(renderFinalImpact(model.proposalImpacts[proposal.proposalId]))}</div>
        <div class="actions">${model.proposalImpacts[proposal.proposalId]?.commitReady ? button("提交已确认操作", "commit-proposal", proposal.proposalId, "primary") : ""}${button("全部拒绝", "reject-proposal", proposal.proposalId, "danger")}</div>
      </article>`,
    )
    .join("")}</div>`;
}

function renderProjectContextRecovery(
  model: UiModel,
  card: PluginProjectReentryCard,
  state: PluginProjectContextRecoveryState | undefined,
): string {
  const requestValue = `${card.project.objectId}|${card.project.version}`;
  if (!state) {
    return model.v2ProviderAvailable
      ? `<section class="restore"><div class="eyebrow">可选 Copilot · 不修改正式状态</div>${button("帮我恢复上下文", "v2-project-context-recovery", requestValue, "quiet")}</section>`
      : "";
  }
  if (state.expectedVersion !== card.project.version) {
    return `<section class="restore"><div class="error"><strong>Copilot 草稿已过期。</strong><span>Project 正式版本已变化；旧草稿没有继续显示或执行动作。</span></div>${model.v2ProviderAvailable ? `<div class="actions">${button("基于当前版本重新生成", "v2-project-context-recovery", requestValue, "quiet")}</div>` : ""}</section>`;
  }
  if (state.status === "loading") {
    return `<section class="restore" aria-live="polite"><div class="eyebrow">Copilot 正在整理 · 正式状态未改变</div><p>正在从当前受限 Context Package 生成恢复草稿…</p><div class="actions">${button("正在生成", "v2-project-context-recovery", requestValue, "quiet", true)}</div></section>`;
  }
  if (state.status === "error") {
    return `<section class="restore"><div class="error"><strong>Copilot 恢复草稿暂不可用。</strong><span>${escapeHtml(state.message)}</span><span>上方确定性重入卡仍可使用；没有修改正式状态。</span></div>${model.v2ProviderAvailable ? `<div class="actions">${button("重试", "v2-project-context-recovery", requestValue, "quiet")}</div>` : ""}</section>`;
  }
  const output = state.result.output;
  const facts = output.facts.length
    ? `<section><h4>已确认事实</h4><ul>${output.facts.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul></section>`
    : "";
  const inferences = output.inferences.length
    ? `<section><h4>Copilot 判断</h4><ul>${output.inferences.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul></section>`
    : "";
  const unknowns = output.unknowns.length
    ? `<section><h4>仍不知道</h4><ul>${output.unknowns.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`
    : "";
  const suggestions = output.suggestedChanges.length
    ? `<section><h4>可讨论建议</h4><ul>${output.suggestedChanges.map(({ summary, riskLevel }) => `<li>${escapeHtml(summary)} <small>${escapeHtml(riskLevel)} · 必须另建 Proposal 审阅</small></li>`).join("")}</ul></section>`
    : "";
  const route = resolveProjectContextRecoveryRoute(state, card);
  const action = route
    ? button(output.nextAction?.label ?? route.label, route.action, route.value, "primary")
    : output.nextActionEligible
      ? "<span class=\"muted\">建议动作已失效；请基于上方当前正式状态操作。</span>"
      : "";
  const policy = [
    output.requiresDiscussion ? "需要讨论" : undefined,
    output.requiresReview ? "正式变化需审阅" : undefined,
    output.riskLevel !== "NONE" ? `风险 ${output.riskLevel}` : undefined,
  ].filter((value): value is string => value !== undefined);
  const interactionId = state.result.interactionId;
  const feedback = interactionId ? [
    ["有帮助", "HELPFUL"],
    ["不需要", "NOT_NEEDED"],
    ["不准确", "INACCURATE"],
    ["太多了", "TOO_MUCH"],
    ["本次会话不再这样建议", "DO_NOT_REPEAT"],
  ].map(([label, disposition]) => button(
    label!,
    "v2-project-context-feedback",
    `${card.project.objectId}|${interactionId}|${disposition}`,
    state.userDisposition === disposition ? "primary" : "quiet",
    state.feedbackBusy,
  )).join("") : "";
  const feedbackStatus = state.feedbackError
    ? `<p class="muted">反馈未记录：${escapeHtml(state.feedbackError)}</p>`
    : state.userDisposition
      ? `<div class="actions"><span class="muted">反馈仅保留在当前 Service session。${state.userDisposition === "DO_NOT_REPEAT" ? "同版本建议已暂停。" : ""}</span>${button("撤回反馈", "v2-project-context-feedback", `${card.project.objectId}|${interactionId}|WITHDRAW`, "quiet", state.feedbackBusy)}</div>`
      : "";
  return `<section class="restore" data-project-context-recovery="ready">
    <div class="eyebrow">Copilot 草稿 · 不保存第二摘要</div>
    <p class="lead">${escapeHtml(output.summary)}</p>
    ${facts}${inferences}${unknowns}${suggestions}
    ${policy.length ? `<p class="muted">${escapeHtml(policy.join(" · "))}</p>` : ""}
    <div class="actions">${action}${model.v2ProviderAvailable ? button(state.userDisposition === "DO_NOT_REPEAT" ? "本次会话已暂停生成" : "重新生成", "v2-project-context-recovery", requestValue, "quiet", state.userDisposition === "DO_NOT_REPEAT") : ""}</div>
    ${feedback ? `<details><summary>这次建议怎么样？</summary><div class="actions">${feedback}</div>${feedbackStatus}</details>` : ""}
    <details><summary>查看生成依据</summary><p class="muted">${escapeHtml(`${output.provenance.skillName}@${output.provenance.skillVersion} · ${output.provenance.model} · ${output.provenance.generatedAt}`)}</p></details>
  </section>`;
}

function renderReentry(model: UiModel): string {
  if (model.v2ReentryLoadError) {
    return `<section><h2>项目重入</h2><div class="error"><strong>重入上下文暂时不可用：</strong>${escapeHtml(model.v2ReentryLoadError)}<span>没有把读取失败显示成空项目，也没有生成猜测性进入点。</span></div></section>`;
  }
  if (model.v2ProjectReentryCards) {
    if (!model.v2ProjectReentryCards.length) {
      return empty("暂无 Project 可重入", "先创建 Project；这里会从同一正式投影恢复当前停留点。");
    }
    const visibleCards = model.v2ReentryTargetObjectId
      ? model.v2ProjectReentryCards.filter(({ project }) => project.objectId === model.v2ReentryTargetObjectId)
      : model.v2ProjectReentryCards;
    if (model.v2ReentryTargetObjectId && visibleCards.length === 0) {
      return `<section><h2>项目重入</h2><div class="error"><strong>当前 Project 重入上下文已变化。</strong><span>没有回退到另一个项目；请返回当前 Page 重新打开。</span></div><div class="actions">${button("查看全部项目", "v2-reentry-show-all", undefined, "quiet")}</div></section>`;
    }
    const cards = visibleCards.map((card) => {
      const { project, projection } = card;
      const recoveryState = model.v2ProjectContextRecovery?.[project.objectId];
      const evidence = projection.keyEvidence.length
        ? `<p class="muted">${projection.keyEvidence.map((value) => escapeHtml(value)).join(" · ")}</p>`
        : "";
      const unknown = projection.unknowns.length
        ? `<p class="muted">${escapeHtml(projection.unknowns.join("；"))}</p>`
        : "";
      const entryPoints = card.entryPointRoutes.length
        ? `<section><h3>从这里继续</h3><div class="actions">${card.entryPointRoutes.map((route) => button(route.label, route.action, route.value, "quiet")).join("")}</div></section>`
        : "";
      const primary = card.primaryRoute
        ? button(card.primaryRoute.label, card.primaryRoute.action, card.primaryRoute.value, projection.safetyState === "RECOVERY_REQUIRED" ? "danger" : "primary")
        : "";
      const shortcuts = projection.safetyState === "CLEAN" && project.lifecycle === "OPEN"
        ? `${button("更新当前接口", "v2-project-structure-open", `${project.objectId}|${project.version}`, "quiet")}${!card.focused ? button("加入当前关注", "v2-focus-add", `${project.objectId}|${project.version}`, "quiet") : ""}`
        : "";
      const recoveryDraft = renderProjectContextRecovery(model, card, recoveryState);
      return `<article class="card reentry" data-reentry-sufficiency="${projection.sufficiency}">
        <div class="eyebrow">${projection.safetyState === "CLEAN" ? (projection.sufficiency === "SUFFICIENT" ? "当前停留点" : "需要恢复上下文") : "安全状态优先"} · ${escapeHtml(new Date(projection.lastFormalChangeAt).toLocaleString("zh-CN"))}</div>
        <h2>${escapeHtml(projection.headline)}</h2>
        <p class="lead">${escapeHtml(projection.summary)}</p>
        ${evidence}${unknown}${entryPoints}
        <div class="actions">${primary}${shortcuts}</div>
        ${recoveryDraft}
        <details><summary>查看依据</summary><ul>${projection.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>${projection.relatedContextCount ? `<p class="muted">${projection.relatedContextCount} 个普通关联仅作为背景，未升级为进入点。</p>` : ""}</details>
      </article>`;
    }).join("");
    return `<section><div class="eyebrow">同一正式投影 · 不保存第二摘要</div><h2>项目重入</h2><p class="muted">每个 Project 只显示一个当前结论、最多两个关键依据和最多三个可定位进入点；信息不足时直接打开原文。</p>${model.v2ReentryTargetObjectId ? `<div class="actions">${button("查看全部项目", "v2-reentry-show-all", undefined, "quiet")}</div>` : ""}<div class="cards">${cards}</div></section>`;
  }
  if (model.v2Objects) {
    const projects = model.v2Objects.filter((object) => object.objectType === "PROJECT");
    if (!projects.length) return empty("暂无 Project 可重入", "先在对象工作区创建 Project；这里会从同一 SQLite 投影恢复状态、关联和下一步。");
    const objectById = new Map(model.v2Objects.map((object) => [object.objectId, object]));
    const nowItems = model.v2NowWork ? [...model.v2NowWork.focus, ...model.v2NowWork.next, ...model.v2NowWork.waitingReview] : [];
    const focused = new Set(model.v2NowWork?.focus.map((item) => item.objectId) ?? []);
    const cards = projects.map((project) => {
      const children = (model.v2PrimaryOwnerships ?? []).filter((ownership) => ownership.ownerObjectId === project.objectId).map((ownership) => objectById.get(ownership.childObjectId)).filter((object): object is V2ManagedObject => object !== undefined);
      const related = (model.v2Associations ?? []).filter((association) => association.sourceObjectId === project.objectId || association.targetObjectId === project.objectId).map((association) => objectById.get(association.sourceObjectId === project.objectId ? association.targetObjectId : association.sourceObjectId)).filter((object): object is V2ManagedObject => object !== undefined);
      const nowItem = nowItems.find((item) => item.objectId === project.objectId);
      const condition = project.condition.kind === "ACTIONABLE" ? "可行动" : project.condition.kind === "WAITING" ? `等待：${project.condition.waitingFor}；期待 ${project.condition.expectedResult}` : project.condition.kind === "BLOCKED" ? `阻塞：${project.condition.reason}` : `暂停：${project.condition.reason}`;
      const closure = project.closure && "actualResult" in project.closure ? `<section><h3>完成回顾</h3><p>${escapeHtml(project.closure.actualResult)}</p></section>` : "";
      return `<article class="card reentry"><div class="eyebrow">${escapeHtml(project.lifecycle)} · ${escapeHtml(project.condition.kind)} · v${escapeHtml(project.version)}</div><h2>${escapeHtml(project.text)}</h2><p class="lead">${escapeHtml(condition)}</p>${renderV2ProjectStructure(project)}${children.length ? `<section><h3>当前主归属对象</h3><ul>${children.map((child) => `<li>${escapeHtml(child.objectType)} · ${escapeHtml(child.text)} · ${escapeHtml(child.lifecycle)}</li>`).join("")}</ul></section>` : ""}${related.length ? `<section><h3>相关对象</h3><ul>${related.map((object) => `<li>${escapeHtml(object.objectType)} · ${escapeHtml(object.text)}</li>`).join("")}</ul></section>` : ""}${closure}<section class="restore"><h3>建议恢复动作</h3><p>${escapeHtml(nowItem?.reason ?? (project.lifecycle === "OPEN" ? "检查 Project 当前推进、Condition 与主归属对象，明确下一步后加入当前关注。" : "查看完成回顾与关联成果；需要继续时走显式重开 Proposal。"))}</p></section><div class="actions">${nowItem?.primaryAnchorExternalId ? button("打开 Project 正文", "v2-open-primary-anchor", nowItem.primaryAnchorExternalId, "quiet") : ""}${project.lifecycle === "OPEN" ? button("更新当前接口", "v2-project-structure-open", `${project.objectId}|${project.version}`, "quiet") : ""}${project.lifecycle === "OPEN" ? button("更新状态", "v2-condition-open", `${project.objectId}|${project.version}`, "quiet") : ""}${project.lifecycle === "OPEN" && !focused.has(project.objectId) ? button("加入当前关注", "v2-focus-add", `${project.objectId}|${project.version}`, "primary") : ""}</div></article>`;
    }).join("");
    return `<section><div class="eyebrow">V2 SQLite 实时投影</div><h2>Project 重入</h2><p class="muted">状态、主归属、普通关联和 Now Work 理由均来自同一 Local Service；此页不保存恢复包副本。</p><div class="cards">${cards}</div></section>`;
  }
  if (!model.reentry) return empty("暂无 Project 可重入", "创建 Project 后，这里会生成行动导向的恢复包。");
  const reentry = model.reentry;
  const selector = `<div class="object-list">${model.reentryProjects.map((project) => `<button class="object-row ${project.objectId === model.selectedReentryProjectId ? "active" : ""}" data-action="select-reentry-project" data-value="${escapeHtml(project.objectId)}"><span>${escapeHtml(project.text)}</span><small>${escapeHtml(project.phase)}</small></button>`).join("")}</div>`;
  return `<div class="split">${selector}<article class="reentry">
    <div class="eyebrow">${escapeHtml(reentry.phase)} · ${escapeHtml(reentry.condition.kind)}</div>
    <h2>${escapeHtml(reentry.purpose)}</h2>
    <p class="lead">${escapeHtml(reentry.currentState)}</p>
    ${reentry.boundary ? `<section><h3>边界</h3><p>${escapeHtml([reentry.boundary.in, reentry.boundary.out].filter(Boolean).join(" / "))}</p></section>` : ""}
    ${reentry.recentChanges.length ? `<section><h3>最近关键变化</h3><ol>${reentry.recentChanges.map((change) => `<li>${escapeHtml(change.summary)}</li>`).join("")}</ol></section>` : ""}
    ${reentry.waitingOrBlocked ? `<section><h3>阻塞或等待</h3><p>${escapeHtml(reentry.waitingOrBlocked)}</p></section>` : ""}
    ${reentry.unresolvedQuestions?.length ? `<section><h3>未决问题</h3><ul>${reentry.unresolvedQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul></section>` : ""}
    <section class="restore"><h3>建议恢复动作</h3><p>${escapeHtml(reentry.restoreAction)}</p></section>
    ${reentry.entryPoints.length ? `<section><h3>关键入口</h3><div class="actions">${reentry.entryPoints.map((entry) => button(entry.role, "open-anchor", entry.anchorId, "quiet")).join("")}</div></section>` : ""}
  </article></div>`;
}

function recentChangeTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderRecentChange(change: RecentChange, immediate = false): string {
  const action = (item: NonNullable<RecentChange["primaryAction"] | RecentChange["secondaryAction"]>) => (
    button(item.label, item.action, item.value, item.tone)
  );
  const technical = change.technical;
  return `<article class="card compact recent-change">
    <div class="eyebrow">${immediate ? "刚刚的结果 · " : ""}${escapeHtml(recentChangeTime(change.occurredAt))} · <strong>${escapeHtml(change.statusLabel)}</strong></div>
    <h3>${escapeHtml(change.narration.conclusion)}</h3>
    ${change.narration.keyEvidence.length ? `<p class="muted">${change.narration.keyEvidence.map((value) => escapeHtml(value)).join(" · ")}</p>` : ""}
    ${change.narration.unknowns.length ? `<p class="uncertain"><strong>尚不能确认：</strong>${escapeHtml(change.narration.unknowns.join("；"))}</p>` : ""}
    <p><strong>${escapeHtml(change.intent)}</strong></p>
    <p>${escapeHtml(change.summary)}</p>
    ${change.availability ? `<p class="${change.status === "FAILED" || change.status === "RECOVERY_REQUIRED" ? "error" : "muted"}">${escapeHtml(change.availability)}</p>` : ""}
    ${change.primaryAction || change.secondaryAction ? `<div class="actions">${change.secondaryAction ? action(change.secondaryAction) : ""}${change.primaryAction ? action(change.primaryAction) : ""}</div>` : ""}
    <details><summary>技术详情</summary>
      <p>SemanticCommit：<code>${escapeHtml(technical.semanticCommitId)}</code></p>
      ${technical.proposalId ? `<p>Proposal：<code>${escapeHtml(technical.proposalId)}</code></p>` : ""}
      <p>状态：<code>${escapeHtml(technical.status)}</code>${technical.errorCode ? ` · 错误：<code>${escapeHtml(technical.errorCode)}</code>` : ""}</p>
      <p>叙述规则：<code>${escapeHtml(change.narration.source.ruleId)}</code></p>
      <p class="muted">before ${escapeHtml(technical.beforeStateChecksum.slice(0, 12))}${technical.afterStateChecksum ? ` · after ${escapeHtml(technical.afterStateChecksum.slice(0, 12))}` : ""}</p>
    </details>
  </article>`;
}

function recentChanges(model: UiModel): RecentChange[] {
  return projectRecentChanges({
    proposals: model.v2Proposals ?? [],
    commits: model.v2SemanticCommits ?? [],
  });
}

function renderImmediateResult(model: UiModel, changes: readonly RecentChange[]): string {
  if (!model.recentActionCommitId) return "";
  const change = changes.find((candidate) => candidate.commitIdentity === model.recentActionCommitId);
  return change ? `<section class="action-result" aria-label="刚刚的正式修改结果">${renderRecentChange(change, true)}</section>` : "";
}

function renderAudit(model: UiModel): string {
  if (model.v2AuditLoadError) return `<section><h2>最近修改与恢复</h2><div class="error"><strong>正式修改历史暂时不可用：</strong>${escapeHtml(model.v2AuditLoadError)}<span>没有把查询失败显示为空历史，也没有执行恢复或写入。</span></div></section>`;
  const changes = recentChanges(model);
  const guidance = `<section class="card"><div class="eyebrow">SQLite 单一权威 · Local Service 单一写入口</div><h2>最近修改与恢复</h2><p>这里按用户意图显示已经应用、尚未完成、需要恢复或已撤销的正式修改；记录来自既有 Audit、Receipt 与 SemanticCommit，不是第二份状态。</p><details><summary>维护与恢复说明</summary><p>备份、校验、Doctor 与 Restore 继续使用同一 Local Service 的 <code>tc backup</code>、<code>tc doctor</code> 和 <code>tc backup restore</code>；恢复必须继续原 Commit，不新建重复操作。</p><p class="muted">V1 Recovery Bundle 只用于只读迁移和历史兼容。</p></details></section>`;
  if (!changes.length) return `${guidance}${empty("还没有正式修改", "确认修改内容不等于已经应用；只有正式应用后才会出现在这里。")}`;
  return `${guidance}<section><h2>最近修改</h2><div class="cards">${changes.map((change) => renderRecentChange(change)).join("")}</div></section>`;
}

function renderMigration(model: UiModel): string {
  if (model.v2MigrationLoadError) return `<section><h2>V1 → V2 迁移</h2><div class="error"><strong>迁移状态不可用：</strong>${escapeHtml(model.v2MigrationLoadError)}<span>没有执行扫描、导入或状态切换。</span></div></section>`;
  const runs = model.v2MigrationRuns ?? [];
  const guidance = `<section class="card"><div class="eyebrow">手动 · 可恢复 · SQLite 单一权威</div><h2>V1 → V2 迁移</h2><p>Recovery Bundle 只由 CLI 显式读取；插件不保存正文副本，也不会自动扫描或迁移。</p><p class="muted">顺序：scan → preview → backup → import → verify → activate。导入前可用 show 查看 Run；未激活且未变化的批次可 Undo。</p></section>`;
  if (!runs.length) return `${guidance}${empty("还没有迁移 Run", "先在终端执行 tc migration scan 与 tc migration preview；完成审阅前不会写入正式状态。")}`;
  const cards = runs.map((run) => `<article class="card compact"><div class="eyebrow">${escapeHtml(run.status)} · ${escapeHtml(new Date(run.updatedAt).toLocaleString("zh-CN"))}</div><h3>${escapeHtml(run.runId)}</h3><p>${escapeHtml(run.summary.total)} 项已审阅 · ${escapeHtml(run.summary.import)} 项导入 · ${escapeHtml(run.summary.defer)} 项暂缓 · ${escapeHtml(run.summary.exclude)} 项排除</p><p class="muted">源：${escapeHtml(run.sourceBundleSha256.slice(0, 12))}…${run.snapshotBackupId ? ` · 恢复点：${escapeHtml(run.snapshotBackupId)}` : " · 尚未绑定恢复点"}</p><p>${run.status === "PREVIEWED" ? "下一步：创建并校验 Backup，再明确确认 Import。" : run.status === "IMPORTING" ? "下一步：验证已导入批次；Service 重启后可继续。" : run.status === "VERIFIED" ? "下一步：确认所有审阅结果后显式 Activate。" : run.status === "ACTIVATED" ? "V2 SQLite 已激活；V1 只保留为只读历史与恢复证据。" : "请使用 tc migration show 查看结构化错误与证据。"}</p></article>`).join("");
  return `${guidance}<section><h2>最近迁移</h2><div class="cards">${cards}</div></section>`;
}

function primaryWorkspace(workspace: Workspace): PrimaryWorkspace {
  if (workspace === "now" || workspace === "review" || workspace === "more") return workspace;
  if (workspace === "objects" || workspace === "reentry") return "projects";
  return "more";
}

function sectionNavigation(model: UiModel): string {
  if (model.workspace === "objects" || model.workspace === "reentry") {
    const entries: Array<[Workspace, string]> = [
      ["reentry", "项目列表与重入"],
      ["objects", "正式事项与创建"],
    ];
    return `<nav class="section-nav" aria-label="项目区域">${entries.map(([id, label]) => `<button class="${model.workspace === id ? "active" : ""}" data-action="view" data-value="${id}" aria-pressed="${model.workspace === id}">${label}</button>`).join("")}</nav>`;
  }
  if (model.workspace === "more" || model.workspace === "audit" || model.workspace === "migration") {
    const entries: Array<[Workspace, string]> = [
      ["more", "更多首页"],
      ["audit", "最近修改与恢复"],
      ["migration", "迁移"],
    ];
    return `<nav class="section-nav" aria-label="更多区域">${entries.map(([id, label]) => `<button class="${model.workspace === id ? "active" : ""}" data-action="view" data-value="${id}" aria-pressed="${model.workspace === id}">${label}</button>`).join("")}${button("系统状态", "runtime-diagnostics", undefined, "quiet")}</nav>`;
  }
  return "";
}

function renderMore(model: UiModel): string {
  const lifecycle = model.v2ManagedRuntimeState === "RUNNING"
    ? `<article class="card"><h3>本地运行环境</h3><p>Launcher 正在为当前 Graph 管理正式 Service。结束前会检查未完成 Commit 与正文核对，不会关闭其他进程。</p>${button("结束本次 Task Copilot", "end-task-copilot-open", undefined, "danger")}</article>`
    : model.v2ManagedRuntimeState === "ENDED"
      ? `<article class="card"><h3>本地运行环境已结束</h3><p>Graph 正文仍可编辑，SQLite 历史保持安全；需要正式能力时可重新启动当前 Graph 的 Service。</p>${button("重新启动 Task Copilot", "restart-task-copilot", undefined, "primary")}</article>`
      : "";
  return `<section><div class="eyebrow">高级与维护</div><h2>更多</h2><p class="muted">日常只需要“现在”“待我确认”和“项目”。这里保留系统状态、恢复、迁移与技术证据，不删除原有能力。</p><div class="cards more-hub">
    <article class="card"><h3>最近修改与恢复</h3><p>查看已经应用、尚未完成或需要恢复的变化，并按安全前置决定能否撤销。</p>${button("查看最近修改与恢复", "view", "audit", "primary")}</article>
    <article class="card"><h3>系统状态与技术诊断</h3><p>先说明哪些能力受影响、哪些仍可用和数据是否安全，再按需展开技术组件。</p>${button("检查系统状态与技术诊断", "runtime-diagnostics", undefined, "quiet")}</article>
    <article class="card"><h3>备份与恢复</h3><p>继续复用唯一 Local Service、Doctor、Backup 与固定确认的 Restore 安全链。</p>${button("查看备份与恢复说明", "view", "audit", "quiet")}</article>
    <article class="card"><h3>迁移现有内容</h3><p>查看手动、小批次、可验证、可恢复的 V1 → V2 迁移账本。</p>${button("查看迁移状态", "view", "migration", "quiet")}</article>
    ${lifecycle}
  </div></section>`;
}

function renderActionDialog(model: UiModel): string {
  const dialog = model.actionDialog;
  if (!dialog) return "";
  const cancel = button("取消", "cancel-action-dialog", undefined, "quiet");
  if (dialog.kind === "v2-mini-project-grill") {
    const [objectId] = dialog.value.split("|");
    const object = model.v2Objects?.find((candidate) => candidate.objectId === objectId && candidate.objectType === "MINI_PROJECT");
    const state = objectId ? model.v2MiniProjectGrill?.[objectId] : undefined;
    if (!object || !state) return "";
    const result = state.status === "ready" ? state.result : state.status === "loading" || state.status === "error" ? state.previous : undefined;
    const output = result?.output;
    const facts = output?.facts.length ? `<section><h4>已确认事实</h4><ul>${output.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul></section>` : "";
    const inferences = output?.inferences.length ? `<section><h4>当前推断</h4><ul>${output.inferences.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul></section>` : "";
    const unknowns = output?.unknowns.length ? `<section><h4>仍待澄清</h4><ul>${output.unknowns.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul></section>` : "";
    const recommendation = output?.questionGroup?.recommendation
      ? `<aside class="notice"><strong>建议：</strong>${escapeHtml(output.questionGroup.recommendation.text)}${output.questionGroup.recommendation.tradeoffs.length ? `<p class="muted">取舍：${escapeHtml(output.questionGroup.recommendation.tradeoffs.join("；"))}</p>` : ""}</aside>`
      : "";
    const error = state.status === "error" || state.status === "stale" ? `<div class="notice error" role="alert">${escapeHtml(state.message)}</div>` : "";
    const loading = state.status === "loading" ? `<div class="notice" aria-live="polite">正在结合原 Block 子树和前序回答生成下一轮；正式对象与正文保持不变。</div>` : "";
    const previewState = state.status === "ready" ? state.preview : undefined;
    const readyForPreview = output?.readiness === "READY_FOR_PREVIEW" && previewState?.status !== "ready"
      ? `<div class="notice"><strong>已具备结构预览条件。</strong><p>结构预览仍是 session draft；不会生成 Proposal 或改动正文/SQLite。</p>${previewState?.status === "loading" ? "<p aria-live=\"polite\">正在生成零丢失阅读预览…</p>" : previewState?.status === "error" ? `<p class="error">${escapeHtml(previewState.message)}</p>${button("重试结构预览", "v2-mini-project-grill-preview", object.objectId, "quiet", model.v2MiniProjectGrillPreviewAvailable !== true)}` : button("生成结构预览", "v2-mini-project-grill-preview", object.objectId, "primary", model.v2MiniProjectGrillPreviewAvailable !== true)}</div>`
      : "";
    const preview = previewState?.status === "ready" ? previewState.result.output : undefined;
    const restructureProposal = previewState?.status === "ready" ? previewState.proposal : undefined;
    const proposalCta = preview
      ? restructureProposal?.status === "loading" ? `<p class="notice" aria-live="polite">正在重验原材料并建立 HIGH 变更审阅；正文仍未修改。</p>`
        : restructureProposal?.status === "error" ? `<div class="notice error">${escapeHtml(restructureProposal.message)}</div>${button("重新进入变更审阅", "v2-mini-project-grill-proposal", object.objectId, "quiet", model.v2MiniProjectGrillProposalAvailable !== true)}`
        : restructureProposal?.status === "not-needed" ? `<div class="notice"><strong>讨论已完成，无需正式变更。</strong><p>${escapeHtml(restructureProposal.message)}</p></div>`
        : restructureProposal?.status === "ready" ? `<p class="notice">结构 Proposal 已进入“待我确认”；尚未 Commit。</p>`
        : button("进入变更审阅", "v2-mini-project-grill-proposal", object.objectId, "primary", model.v2MiniProjectGrillProposalAvailable !== true)
      : "";
    const previewSections = preview ? preview.finalReading.sections.map((section) => `<section class="grill-preview-section"><h4>${escapeHtml(section.heading)}</h4><p class="muted">${escapeHtml(section.purpose)}</p>${section.sourceMaterials.length ? `<ul>${section.sourceMaterials.map((material) => `<li>${escapeHtml(material.text || "（空 Block，原位保留）")}</li>`).join("")}</ul>` : ""}${section.derivedBlocks.map((item) => `<p>${escapeHtml(item.text)}</p>`).join("")}</section>`).join("") : "";
    const previewHtml = preview ? `<section class="grill-preview" aria-label="MiniProject 最终阅读预览"><div class="eyebrow">零丢失阅读预览 · 尚未应用</div><h3>${escapeHtml(preview.finalReading.title.text)}</h3><p><strong>要得到：</strong>${escapeHtml(preview.finalReading.outcome.text)}</p><p><strong>范围内：</strong>${escapeHtml(preview.finalReading.boundary.included.map((item) => item.text).join("；"))}</p>${preview.finalReading.boundary.excluded.length ? `<p><strong>范围外：</strong>${escapeHtml(preview.finalReading.boundary.excluded.map((item) => item.text).join("；"))}</p>` : ""}<p><strong>完成证据：</strong>${escapeHtml(preview.finalReading.completionEvidence.map((item) => item.text).join("；"))}</p><div class="badges"><span>原材料 ${preview.impact.sourceMaterialCount}</span><span>移动 ${preview.impact.movedMaterialCount}</span><span>新增归纳 ${preview.impact.addedDerivedBlockCount}</span><span>删除 ${preview.impact.deletedMaterialCount}</span><span>未分类 ${preview.impact.unclassifiedMaterialCount}</span></div>${previewSections}${preview.unclassified.length ? `<section><h4>待判断／原始材料（原位保留）</h4>${preview.unclassified.map((item) => `<blockquote>${escapeHtml(item.text || "（空 Block）")}<small>${escapeHtml(item.reason)}</small></blockquote>`).join("")}</section>` : ""}<div class="notice">这是阅读预览，不是正式变化。进入审阅后仍需 HIGH 确认；专用结构 Commit 完成验证前不会出现应用入口。原始材料全部保留，删除数由机器固定为 0。</div>${proposalCta}</section>` : "";
    const question = state.status === "ready" && output?.readiness === "CONTINUE" && output.questionGroup
      ? `<section class="grill-question"><h4>这一轮只确认一件事</h4>${output.questionGroup.questions.map((item) => `<p>${escapeHtml(item.text)}</p>`).join("")}<label>你的回答<textarea data-field="v2MiniProjectGrillAnswer" maxlength="4000" placeholder="直接说明事实、边界或完成证据"></textarea></label>${button("继续讨论", "v2-mini-project-grill-answer", object.objectId, "primary")}</section>`
      : "";
    const retry = state.status === "error" ? button("重试本轮", "v2-mini-project-grill-retry", object.objectId, "quiet") : "";
    const closeLabel = model.originReturnLabel ?? "关闭讨论";
    return `<section class="inbox-dialog action-dialog mini-project-grill" aria-label="梳理 MiniProject"><div class="eyebrow">MiniProject Grill Me · Session only</div><h3>${escapeHtml(object.text)}</h3><p class="muted">Copilot 只围绕当前材料中的真实不确定性追问。事实、推断和未知分开显示；回答不持久化，模型不能创建 Proposal 或正式操作。</p>${output ? `<blockquote>${escapeHtml(output.understanding)}</blockquote>${facts}${inferences}${unknowns}${recommendation}` : ""}${loading}${error}${readyForPreview}${previewHtml}${question}<div class="actions">${retry}${button(closeLabel, "cancel-action-dialog", undefined, "quiet")}</div></section>`;
  }
  if (dialog.kind === "confirm-end-task-copilot") {
    return `<section class="inbox-dialog action-dialog" aria-label="结束本次 Task Copilot"><h3>结束本次 Task Copilot？</h3><p>系统会再次检查未完成 Commit 与正文核对。安全时只释放当前插件租约并停止它拥有的 Service；Launcher、Graph 正文、SQLite 历史和其他进程不受影响。</p><div class="actions">${button("确认安全结束", "submit-end-task-copilot", undefined, "danger")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-page-context") {
    const context = model.pageContext;
    if (!context || context.pageUuid !== dialog.value) return "";
    const origin = `<p class="muted">执行前会再次核对当前页身份；完成或取消后仍回到 ${escapeHtml(context.pageName)}。</p>`;
    if (context.kind === "PROJECT" && context.project) {
      const unavailable = context.project.lifecycle !== "OPEN";
      return `<section class="inbox-dialog action-dialog page-context-dialog" aria-label="Project 页面操作"><div class="eyebrow">Project Page · ${escapeHtml(context.pageName)}</div><h3>${escapeHtml(context.project.objectText)}</h3>${origin}<div class="cards compact"><button type="button" data-action="v2-page-project-update" data-value="${escapeHtml(context.pageUuid)}"${unavailable ? " disabled" : ""}><strong>更新项目当前状态</strong><span>打开既有受版本保护的 Project 当前接口</span></button><button type="button" data-action="v2-page-project-discuss" data-value="${escapeHtml(context.pageUuid)}"${unavailable ? " disabled" : ""}><strong>讨论项目结构</strong><span>P0 进入既有 HIGH Proposal 审阅闭环，不直接改正式状态</span></button><button type="button" data-action="v2-page-project-operations" data-value="${escapeHtml(context.pageUuid)}"><strong>项目操作</strong><span>进入正式对象工作区继续处理</span></button></div><div class="actions">${cancel}</div></section>`;
    }
    return `<section class="inbox-dialog action-dialog page-context-dialog" aria-label="普通页面操作"><div class="eyebrow">Page · ${escapeHtml(context.pageName)}</div><h3>从当前页继续</h3>${origin}<div class="cards compact"><button type="button" data-action="v2-page-organize" data-value="${escapeHtml(context.pageUuid)}"><strong>整理当前页</strong><span>扫描当前页显式候选；先预览，不直接改正文或正式状态</span></button><button type="button" data-action="v2-page-formal-items-open" data-value="${escapeHtml(context.pageUuid)}"><strong>查看本页正式事项</strong><span>${context.formalItems.length} 项由 active Primary Anchor 关联到本页</span></button><button type="button" data-action="v2-page-project-create-route" data-value="${escapeHtml(context.pageUuid)}"><strong>将本页建立为 Project</strong><span>P0 只打开既有受控 Project 创建入口，不直接转换当前页</span></button></div><div class="actions">${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-page-formal-items") {
    const context = model.pageContext;
    if (!context || context.pageUuid !== dialog.value) return "";
    const items = context.formalItems.length
      ? `<div class="object-list">${context.formalItems.map((item) => `<article class="object-row"><span>${escapeHtml(item.objectText)}</span><small>${escapeHtml(item.objectType)} · ${escapeHtml(item.lifecycle)} · v${escapeHtml(item.objectVersion)}</small></article>`).join("")}</div>`
      : empty("本页没有正式事项", "这里只统计 active Primary Anchor 指向当前 Page 或当前页 Block 的正式对象。");
    return `<section class="inbox-dialog action-dialog page-context-dialog" aria-label="本页正式事项"><div class="eyebrow">Page · ${escapeHtml(context.pageName)}</div><h3>本页正式事项</h3><p class="muted">这是 SQLite 正式对象与 Graph Primary Anchor 的只读投影；不会把页面位置当成归属。</p>${items}<div class="actions">${button("返回页面操作", "v2-page-context-back", context.pageUuid, "quiet")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-provider-revise") {
    const [proposalId] = dialog.value.split("|");
    const record = model.v2Proposals?.find(({ proposal }) => proposal.proposalId === proposalId);
    if (!record) return "";
    return `<section class="inbox-dialog action-dialog" aria-label="调整 Agent Proposal"><h3>调整当前建议</h3><p class="muted">用一句话说明希望怎样调整。Agent 必须修订同一个 proposal_id、Block 和 scope；成功后审阅决定会重置，正文与正式状态不变。</p><blockquote>${escapeHtml(record.proposal.finalPreview)}</blockquote><label>调整说明<textarea data-field="v2ProviderRevisionInstruction" placeholder="例如：保留原句，只把标题写得更简洁"></textarea></label><div class="actions">${button(model.v2ProviderRevisionBusy ? "Agent 调整中…" : "生成调整后版本", "submit-v2-provider-revise", dialog.value, "primary", model.v2ProviderRevisionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-candidate-update") {
    const candidate = model.v2Candidates?.find(({ candidateId }) => candidateId === dialog.value);
    const targets = (model.v2Objects ?? []).filter(({ objectType }) => ["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"].includes(objectType));
    if (!candidate) return "";
    return `<section class="inbox-dialog action-dialog" aria-label="更新已有对象"><h3>更新已有对象</h3><p class="muted">来源保持只读；请选择目标并填写审阅后希望保留的完整显式 Block 正文。此操作只生成 Proposal，接受与最终 Commit 前不会改正文或 SQLite。</p><blockquote>${escapeHtml(model.v2CandidateSourcePreviews?.[candidate.candidateId] ?? "原文暂不可读；提交时会再次检查。")}</blockquote><label>目标对象<select data-field="v2CandidateUpdateTarget"><option value="">请选择</option>${targets.map((target) => `<option value="${escapeHtml(target.objectId)}">${escapeHtml(target.objectType)} · ${escapeHtml(target.text)}</option>`).join("")}</select></label><label>目标最终完整正文<textarea data-field="v2CandidateUpdateContent" placeholder="[任务] 合并后的最终正文"></textarea></label><div class="actions">${button("生成更新 Proposal", "submit-v2-candidate-update", candidate.candidateId, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-project-structure-edit") {
    const [objectId] = dialog.value.split("|");
    const project = model.v2Objects?.find((candidate) => candidate.objectId === objectId && candidate.objectType === "PROJECT");
    if (!project?.projectStructure) return "";
    const structure = project.projectStructure;
    const objectives = structure.objectives.map((item) => `${item.priority}｜${item.text}｜${item.successEvidence.join("；")}`).join("\n");
    const deliverables = structure.deliverables.map((item) => `${item.status}｜${item.text}｜${item.acceptance}`).join("\n");
    const stages = structure.workStages.map((item) => `${item.name}｜${item.statusDescription}`).join("\n");
    const children = (model.v2PrimaryOwnerships ?? []).filter((ownership) => ownership.ownerObjectId === project.objectId).map((ownership) => model.v2Objects?.find((candidate) => candidate.objectId === ownership.childObjectId)).filter((candidate): candidate is V2ManagedObject => candidate !== undefined && (candidate.objectType === "TASK" || candidate.objectType === "MINI_PROJECT"));
    const mappingByObject = new Map(structure.stageMappings.map((mapping) => [mapping.objectId, mapping.stageId]));
    const mappings = children.length && structure.workStages.length ? `<fieldset><legend>工作对象的主 Work Stage（可选）</legend>${children.map((child) => `<label>${escapeHtml(child.objectType)} · ${escapeHtml(child.text)}<select data-field="v2ProjectStageMapping:${escapeHtml(child.objectId)}"><option value="">不指定</option>${structure.workStages.map((stage) => `<option value="${escapeHtml(stage.stageId)}"${mappingByObject.get(child.objectId) === stage.stageId ? " selected" : ""}>${escapeHtml(stage.name)}</option>`).join("")}</select></label>`).join("")}</fieldset>` : "";
    return `<section class="inbox-dialog action-dialog project-structure-editor" aria-label="更新 Project 当前接口"><h3>更新 Project 当前接口</h3><p class="muted">这里保存一屏重入所需的信息。点击生成后只会进入 HIGH Proposal；接受和最终 Commit 前不会改正式状态。每项一行，使用全角分隔符 ｜。</p><label>当前摘要<textarea data-field="v2ProjectCurrentSummary">${escapeHtml(structure.currentSummary)}</textarea></label><label>当前推进（1–3 行）<textarea data-field="v2ProjectCurrentFocuses">${escapeHtml(structure.currentFocuses.join("\n"))}</textarea></label><label>Objectives：PRIMARY/SECONDARY｜目标｜成功证据（证据用；分隔）<textarea data-field="v2ProjectObjectives" placeholder="PRIMARY｜稳定发布｜恢复演练通过；无静默覆盖">${escapeHtml(objectives)}</textarea></label><label>Deliverables：PLANNED/AVAILABLE/ACCEPTED/SUPERSEDED｜交付物｜自然验收说明<textarea data-field="v2ProjectDeliverables" placeholder="PLANNED｜发布手册｜值班同学可独立执行">${escapeHtml(deliverables)}</textarea></label><label>Work Stages：阶段名｜自然语言状态<textarea data-field="v2ProjectStages" placeholder="验收｜正在验证恢复路径">${escapeHtml(stages)}</textarea></label>${mappings}<label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我确认这是要进入审阅的完整当前接口</label><div class="actions">${button("生成 HIGH Proposal", "submit-v2-project-structure", dialog.value, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-area-edit") {
    const [objectId] = dialog.value.split("|");
    const object = model.v2Objects?.find((candidate) => candidate.objectId === objectId && candidate.objectType === "AREA");
    if (!object) return "";
    return `<section class="inbox-dialog action-dialog" aria-label="编辑 Area 责任描述"><h3>编辑 Area</h3><p class="muted">保留同一 object_id，并以当前版本保护 SQLite 正式状态；不会创建或改写 Graph 页面。</p><label>责任描述<textarea data-field="v2AreaEditText">${escapeHtml(object.text)}</textarea></label><div class="actions">${button(model.v2AreaBusy ? "正在保存…" : "保存 Area", "submit-v2-area-edit", dialog.value, "primary", model.v2AreaBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-condition") {
    const objectId = dialog.value.split("|")[0];
    const current = model.v2NowWork ? [...model.v2NowWork.focus, ...model.v2NowWork.next, ...model.v2NowWork.waitingReview].find((item) => item.objectId === objectId) : undefined;
    const blockerObjectId = current?.condition.kind === "BLOCKED" ? current.condition.blockerObjectId : undefined;
    const blockers = model.v2NowWork?.conditionOptions.filter((option) => option.objectId !== objectId).map((option) => `<option value="${escapeHtml(option.objectId)}"${option.objectId === blockerObjectId ? " selected" : ""}>${escapeHtml(option.objectType)} · ${escapeHtml(option.text)}</option>`).join("") ?? "";
    return `<section class="inbox-dialog action-dialog" aria-label="更新 V2 Condition"><h3>更新状态</h3><p class="muted">Condition 与 Lifecycle、Focus 分离；保存后立即影响 Now Work 投影。</p><label>状态<select data-field="v2ConditionKind"><option>ACTIONABLE</option><option>WAITING</option><option>BLOCKED</option><option>PAUSED</option></select></label><label>等待谁或什么<input data-field="v2WaitingFor"></label><label>期待结果<input data-field="v2ExpectedResult"></label><label>原因<input data-field="v2ConditionReason"></label><label>阻碍来源（Blocked 可选）<select data-field="v2BlockerObjectId"><option value="">仅记录原因</option>${blockers}</select></label><label>复查时间（Waiting 必填）<input type="datetime-local" data-field="v2ConditionReviewAt"></label><div class="actions">${button("保存状态", "submit-v2-condition", dialog.value, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-route") {
    const [objectId] = dialog.value.split("|");
    const object = model.v2Objects?.find((candidate) => candidate.objectId === objectId);
    return `<section class="inbox-dialog action-dialog" aria-label="暂时做不了"><div class="eyebrow">当前 Block · ${escapeHtml(object?.objectType ?? "正式对象")}</div><h3>暂时做不了：${escapeHtml(object?.text ?? "当前对象")}</h3><p class="muted">先选择真实原因。Condition 与 Lifecycle、Ownership、Focus 分离；这里只会走一个受版本保护的状态命令。</p><div class="cards compact"><button type="button" data-action="v2-block-condition-intent" data-value="WAITING|${escapeHtml(dialog.value)}"><strong>等待别人</strong><span>在等谁或什么结果，并约定复查时间</span></button><button type="button" data-action="v2-block-condition-intent" data-value="BLOCKED|${escapeHtml(dialog.value)}"><strong>被问题卡住</strong><span>记录具体卡点，可选关联阻碍对象</span></button><button type="button" data-action="v2-block-condition-intent" data-value="PAUSED|${escapeHtml(dialog.value)}"><strong>我先暂停</strong><span>记录原因和重新判断时间</span></button></div><div class="actions">${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-waiting") {
    return `<section class="inbox-dialog action-dialog" aria-label="等待别人"><h3>等待别人</h3><p class="muted">用一个短语说明在等谁/什么以及期待结果；到点后回到“需要回看”。Focus 不会自动改变。</p><label>在等谁或什么结果<input data-field="v2BlockWaitingSummary" placeholder="例如：等评审人确认恢复结果"></label><label>复查时间<input type="datetime-local" data-field="v2BlockConditionReviewAt"></label><div class="actions">${button(model.v2BlockConditionBusy ? "正在保存…" : "保存为等待别人", "submit-v2-block-condition", dialog.value, "primary", model.v2BlockConditionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-blocked") {
    const [objectId] = dialog.value.split("|");
    const blockers = model.v2NowWork?.conditionOptions.filter((option) => option.objectId !== objectId).map((option) => `<option value="${escapeHtml(option.objectId)}">${escapeHtml(option.objectType)} · ${escapeHtml(option.text)}</option>`).join("") ?? "";
    return `<section class="inbox-dialog action-dialog" aria-label="被问题卡住"><h3>被问题卡住</h3><p class="muted">只记录当前卡点；不会改变 Lifecycle、Ownership 或 Focus。</p><label>具体卡点<textarea data-field="v2BlockConditionReason" placeholder="例如：测试环境暂不可用"></textarea></label><label>阻碍来源（可选）<select data-field="v2BlockerObjectId"><option value="">只记录卡点</option>${blockers}</select></label><div class="actions">${button(model.v2BlockConditionBusy ? "正在保存…" : "保存为被问题卡住", "submit-v2-block-condition", dialog.value, "primary", model.v2BlockConditionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-paused") {
    return `<section class="inbox-dialog action-dialog" aria-label="我先暂停"><h3>我先暂停</h3><p class="muted">暂停不是完成；到重新判断时间后再决定是否恢复。Focus 不会自动改变。</p><label>暂停原因<textarea data-field="v2BlockConditionReason" placeholder="例如：先完成本周发布"></textarea></label><label>重新判断时间<input type="datetime-local" data-field="v2BlockConditionReviewAt"></label><div class="actions">${button(model.v2BlockConditionBusy ? "正在保存…" : "保存为我先暂停", "submit-v2-block-condition", dialog.value, "primary", model.v2BlockConditionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-deadline") {
    const current = dialog.value.split("|")[2];
    return `<section class="inbox-dialog action-dialog" aria-label="设置 Task 期限"><h3>设置明确期限</h3><p class="muted">期限是明确承诺时间，只影响可解释排序，不产生分数。${current ? ` 当前：${escapeHtml(new Date(current).toLocaleString("zh-CN"))}` : ""}</p><label>期限<input type="datetime-local" data-field="v2DueAt"></label><label class="confirm-line"><input type="checkbox" data-field="v2ClearDueAt">清除现有期限</label><div class="actions">${button("保存期限", "submit-v2-deadline", dialog.value, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-lifecycle-reason") {
    const action = dialog.value.split("|")[2];
    const verb = action === "CANCEL" ? "取消" : "重开";
    return `<section class="inbox-dialog action-dialog" aria-label="${verb}对象"><h3>${verb}对象</h3><p class="muted">只创建可审阅 Proposal；正式状态在 Review 和最终 Commit 前不会变化。</p><label>${verb}原因<textarea data-field="v2LifecycleReason"></textarea></label><div class="actions">${button(`创建${verb} Proposal`, "submit-v2-lifecycle-proposal", dialog.value, "primary")}${cancel}</div></section>`;
  }
  const object = model.objects.find((candidate) => candidate.objectId === dialog.value);
  if (dialog.kind === "edit-object" && object) return `<section class="inbox-dialog action-dialog" aria-label="编辑对象"><h3>编辑对象</h3>
    <label>对象正文<textarea data-field="objectText">${escapeHtml(object.text)}</textarea></label>
    <label>完成标准<textarea data-field="objectCompletionCriteria">${escapeHtml(object.completionCriteria ?? "")}</textarea></label>
    <label>下一步/当前推进<textarea data-field="objectNextAction">${escapeHtml(object.nextAction ?? "")}</textarea></label>
    <label>当前状态摘要<textarea data-field="objectCurrentSummary">${escapeHtml(object.currentSummary ?? "")}</textarea></label>
    <label>目的/持续责任<textarea data-field="objectPurpose">${escapeHtml(object.purpose ?? "")}</textarea></label>
    <label>目标结果<textarea data-field="objectTargetOutcome">${escapeHtml(object.targetOutcome ?? "")}</textarea></label>
    <label>范围内边界<textarea data-field="objectScopeIn">${escapeHtml(object.scopeIn ?? "")}</textarea></label>
    <label>due 时间（ISO，允许留空）<input data-field="objectDueAt" value="${escapeHtml(object.dueAt ?? "")}"></label>
    <label>review 时间（ISO，允许留空）<input data-field="objectReviewAt" value="${escapeHtml(object.reviewAt ?? "")}"></label>
    <div class="actions">${button("创建编辑 Proposal", "submit-edit-object", object.objectId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "set-owner" && object) return `<section class="inbox-dialog action-dialog" aria-label="设置主归属"><h3>设置主归属</h3>
    <label>主归属对象<select data-field="ownerObjectId"><option value="">请选择</option>${model.objects.filter((candidate) => candidate.objectId !== object.objectId).map((candidate) => `<option value="${escapeHtml(candidate.objectId)}">${escapeHtml(candidate.objectType)} · ${escapeHtml(candidate.text)}</option>`).join("")}</select></label>
    <label class="confirm-line"><input type="checkbox" data-field="highImpactConfirmed">我单独确认这项高影响归属变化；它不会移动正文</label>
    <div class="actions">${button("创建归属 Proposal", "submit-set-owner", object.objectId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "condition-waiting" && object) return `<section class="inbox-dialog action-dialog" aria-label="设置 Waiting"><h3>设置 Waiting</h3>
    <label>在等谁或什么<input data-field="waitingFor"></label><label>期待结果<input data-field="expectedResult"></label><label>复查时间（ISO）<input data-field="conditionReviewAt" placeholder="2026-07-20T09:00:00+08:00"></label>
    <div class="actions">${button("创建 Waiting Proposal", "submit-condition", `${object.objectId}|WAITING`, "primary")}${cancel}</div></section>`;
  if ((dialog.kind === "condition-blocked" || dialog.kind === "condition-paused") && object) {
    const kind = dialog.kind === "condition-blocked" ? "BLOCKED" : "PAUSED";
    return `<section class="inbox-dialog action-dialog" aria-label="设置 ${kind}"><h3>设置 ${kind}</h3><label>原因<textarea data-field="conditionReason"></textarea></label><div class="actions">${button(`创建 ${kind} Proposal`, "submit-condition", `${object.objectId}|${kind}`, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "review-edit") {
    const [proposalId, operationId] = dialog.value.split("|");
    const operation = model.proposals.find((proposal) => proposal.proposalId === proposalId)?.operations.find((candidate) => candidate.operationId === operationId);
    if (proposalId && operationId && operation) return `<section class="inbox-dialog action-dialog" aria-label="编辑 Proposal 操作"><h3>编辑最终 operation payload</h3><label>JSON object<textarea data-field="operationPayload">${escapeHtml(JSON.stringify(operation.payload, null, 2))}</textarea></label><label class="confirm-line"><input type="checkbox" data-field="finalPayloadConfirmed">我确认这是要提交的最终版本；若风险升高，此确认仅适用于该版本</label><div class="actions">${button("保存编辑后版本", "submit-review-edit", `${proposalId}|${operationId}`, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "review-defer") return `<section class="inbox-dialog action-dialog" aria-label="暂缓 Proposal 操作"><h3>暂缓操作</h3><label>复查时间（ISO）<input data-field="operationDeferredUntil"></label><label>原因<input data-field="operationDeferReason"></label><div class="actions">${button("确认暂缓", "submit-review-defer", dialog.value, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "reject-proposal") return `<section class="inbox-dialog action-dialog" aria-label="全部拒绝 Proposal"><h3>全部拒绝 Proposal</h3><p>已提交的正式变化不会被改写；尚未提交的操作会拒绝。</p><label>原因<input data-field="proposalRejectReason" value="当前建议不适用"></label><div class="actions">${button("确认全部拒绝", "submit-reject-proposal", dialog.value, "danger")}${cancel}</div></section>`;
  if (dialog.kind === "reopen-phase") return `<section class="inbox-dialog action-dialog" aria-label="重新打开对象"><h3>重新打开对象</h3><label>重新打开原因<input data-field="phaseReason"></label><div class="actions">${button("创建 Phase Proposal", "submit-phase", dialog.value, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "v2-mini-project-closure-review") {
    const [proposalId, groupId] = dialog.value.split("|");
    const proposal = model.v2Proposals?.find((candidate) => candidate.proposal.proposalId === proposalId)?.proposal;
    const operation = proposal?.groups.find((group) => group.groupId === groupId)?.semanticOperations.find((candidate) => candidate.kind === "TRANSITION_LIFECYCLE");
    const objectText = model.v2Objects?.find(({ objectId }) => objectId === operation?.target.id)?.text;
    const storedClosure = operation?.payload.closure && typeof operation.payload.closure === "object" ? operation.payload.closure as unknown as V2MiniProjectClosure : undefined;
    const closure = model.v2ClosureDraftInput ?? storedClosure ?? { originalGoal: String(operation?.payload.text ?? objectText ?? ""), actualResult: "", remainingWork: "" };
    const draftDisabled = model.v2ClosureDraftBusy === true || model.v2ProviderAvailable !== true;
    const draftLabel = model.v2ClosureDraftBusy ? "Agent 正在草拟…" : model.v2ProviderAvailable ? "Agent 草拟三问" : "Agent 草拟不可用";
    const transferDisabled = model.v2LegacyTransferBusy === true || model.v2CandidateAvailable !== true;
    return `<section class="inbox-dialog action-dialog" aria-label="填写 MiniProject Closure 三问"><h3>确认 MiniProject Closure</h3><p class="muted">三问会进入唯一 Proposal，并随完成状态原子写入 SQLite。Agent 只生成可编辑草稿，不会接受或提交。</p><label>原本要得到什么<textarea data-field="miniClosureOriginalGoal">${escapeHtml(closure.originalGoal)}</textarea></label><label>实际得到了什么<textarea data-field="miniClosureActualResult">${escapeHtml(closure.actualResult)}</textarea></label><label>有什么遗留或需要转移<textarea data-field="miniClosureRemainingWork" placeholder="没有遗留时请明确写“无遗留”">${escapeHtml(closure.remainingWork)}</textarea></label><div class="legacy-transfer"><p class="muted">如需承接遗留：先在 Logseq 新建并选中一个空 Block，再创建独立 Proposal；不选择则只保留上方说明。</p><label>承接对象类型<select data-field="miniClosureLegacyObjectType"><option value="TASK">Task</option><option value="MINI_PROJECT">MiniProject</option><option value="DECISION">Decision</option><option value="OUTPUT">Output</option></select></label>${button(model.v2LegacyTransferBusy ? "正在创建独立 Proposal…" : "将遗留转为新对象 Proposal", "v2-mini-project-legacy-transfer", dialog.value, "quiet", transferDisabled)}</div><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我确认三问内容和当前 HIGH 关闭语义组</label><div class="actions">${button(draftLabel, "v2-mini-project-closure-draft", dialog.value, "quiet", draftDisabled)}${button(model.v2ClosureReviewBusy ? "正在保存…" : "保存三问并接受", "submit-v2-review-accept", dialog.value, "danger", model.v2ClosureReviewBusy === true || model.v2ClosureDraftBusy === true || model.v2LegacyTransferBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "confirm-v2-mini-project-closure") {
    const proposalId = dialog.value.split("|")[0];
    const operation = model.v2Proposals?.find((candidate) => candidate.proposal.proposalId === proposalId)?.proposal.groups.flatMap(({ semanticOperations }) => semanticOperations).find((candidate) => candidate.kind === "TRANSITION_LIFECYCLE" && candidate.payload.objectType === "MINI_PROJECT" && candidate.payload.lifecycle === "COMPLETED");
    const evidence = operation?.payload.marker === "DONE" ? "系统将重验 Block、Anchor 和对象版本" : "系统将重验对象版本且不会改写 Logseq 正文";
    return `<section class="inbox-dialog action-dialog" aria-label="确认完成 MiniProject"><h3>确认完成 MiniProject</h3><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">${escapeHtml(`我已审阅原目标、实际结果和遗留三问；${evidence}，然后原子记录 Closure 并完成 MiniProject`)}</label><div class="actions">${button("确认继续", "submit-v2-mini-project-closure", dialog.value, "danger")}${cancel}</div></section>`;
  }
  if (dialog.kind === "confirm-v2-reasoned-lifecycle") {
    const action = dialog.value.split("|")[2];
    const verb = action === "CANCEL" ? "取消" : "重开";
    return `<section class="inbox-dialog action-dialog" aria-label="确认${verb}对象"><h3>确认${verb}对象</h3><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我已审阅${verb}原因；系统将重验对象版本并通过单一 Domain Commit 改变 Lifecycle，不改写 Graph</label><div class="actions">${button("确认继续", "submit-v2-reasoned-lifecycle", dialog.value, "danger")}${cancel}</div></section>`;
  }
  if (dialog.kind === "confirm-v2-lifecycle-undo") {
    return `<section class="inbox-dialog action-dialog" aria-label="撤销 Lifecycle 变化"><h3>撤销 Lifecycle 变化</h3><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我确认只恢复对象的 Lifecycle 与必要的 Closure 快照；系统会校验当前对象版本，不改写正文、Anchor、Condition、Focus 或 Ownership</label><div class="actions">${button("确认继续", "submit-v2-lifecycle-undo", dialog.value, "danger")}${cancel}</div></section>`;
  }
  const confirmations: Partial<Record<ActionDialogKind, [string, string, string]>> = {
    "confirm-review-accept": ["接受高影响操作", "我单独确认接受这个高影响操作；提交前仍会进行确定性校验", "submit-review-accept"],
    "confirm-phase": ["确认完成 Project", "我已检查目标达成、下层对象、等待项、成果和归档入口", "submit-phase"],
    "confirm-rebind": ["重新绑定主正文 Anchor", "我确认将当前选中 Block 设为新的主正文 Anchor；旧 Anchor 保留为 replaced", "submit-rebind-anchor"],
    "confirm-undo": ["撤销 SemanticCommit", "我确认撤销；系统会先校验正文没有被二次编辑，并创建逆向 Commit", "submit-undo-commit"],
    "confirm-v2-review-accept": ["接受高影响语义组", "我确认接受当前高影响语义组；这仍不会绕过最终版本重验和 Commit", "submit-v2-review-accept"],
    "confirm-v2-commit": ["确认最终提交", "我已查看最终预览与 Diff；系统将再次重验后写入正文和 SQLite，并在成功后提供 Undo", "submit-v2-proposal-commit"],
    "confirm-v2-project-closure": ["确认完成 Project", "我已检查原始目标、实际结果、未完成 Objective 的原因与去向；系统将重验后原子记录 Closure 并完成 Project", "submit-v2-project-closure"],
    "confirm-v2-project-structure": ["确认更新 Project 当前接口", "我已检查 Objectives、Deliverables、Work Stages、当前摘要与 1–3 个当前推进；系统将重验版本后原子更新 SQLite，不改写 Graph", "submit-v2-project-structure-commit"],
    "confirm-v2-project-structure-undo": ["撤销 Project 当前接口更新", "我确认恢复审阅前的完整当前接口；只有 Project 没有后续正式变化时才会生效，Graph、归属和位置不会改变", "submit-v2-project-structure-undo"],
    "confirm-v2-mini-project-restructure": ["确认 MiniProject 原位重构", "我已检查最终阅读预览、移动数量与删除内容为 0；系统将重验整棵子树，逐步保留 UUID 和正文执行，并在失败时恢复", "submit-v2-mini-project-restructure"],
    "confirm-v2-mini-project-restructure-undo": ["撤销 MiniProject 原位重构", "我确认恢复原材料结构；只有整棵子树仍等于已应用结果时才会开始，并以独立 inverse Commit 留痕", "submit-v2-mini-project-restructure-undo"],
    "confirm-v2-ownership": ["确认改变 Primary Ownership", "我已确认新的主归属；系统将重验子对象、新 Owner 与当前归属版本，位置、Anchor 和 Association 不会改变", "submit-v2-ownership"],
    "confirm-v2-ownership-undo": ["撤销 Primary Ownership 变化", "我确认恢复审阅前的主归属（或恢复为未归属）；只有对象和当前归属未被后续修改时才会生效，正文、Anchor 与 Association 不会改变", "submit-v2-ownership-undo"],
    "confirm-v2-undo": ["撤销本次生效", "我确认创建逆向 Commit；只有正文、对象和 Anchor 均未被后续修改时才会生效", "submit-v2-proposal-undo"],
  };
  const confirmation = confirmations[dialog.kind];
  if (confirmation) return `<section class="inbox-dialog action-dialog" aria-label="${escapeHtml(confirmation[0])}"><h3>${escapeHtml(confirmation[0])}</h3><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">${escapeHtml(confirmation[1])}</label><div class="actions">${button("确认继续", confirmation[2], dialog.value, "danger")}${cancel}</div></section>`;
  if (dialog.kind === "v2-review-defer") return `<section class="inbox-dialog action-dialog" aria-label="暂缓 V2 语义组"><h3>暂缓语义组</h3><label>复查时间<input type="datetime-local" data-field="v2DeferredUntil"></label><label>原因<input data-field="v2DeferReason" value="等待更多上下文"></label><div class="actions">${button("确认暂缓", "submit-v2-review-defer", dialog.value, "primary")}${cancel}</div></section>`;
  return "";
}

export function renderApp(model: UiModel): string {
  const labels: Array<[PrimaryWorkspace, Workspace, string]> = [
    ["now", "now", "现在"],
    ["review", "review", "待我确认"],
    ["projects", "reentry", "项目"],
    ["more", "more", "更多"],
  ];
  const activePrimary = primaryWorkspace(model.workspace);
  const changes = recentChanges(model);
  const immediateResult = renderImmediateResult(model, changes);
  const body =
    model.workspace === "now"
        ? renderNow(model)
        : model.workspace === "objects"
          ? renderObjects(model)
          : model.workspace === "review"
            ? renderReview(model)
            : model.workspace === "reentry"
              ? renderReentry(model)
              : model.workspace === "more"
                ? renderMore(model)
              : model.workspace === "migration"
                ? renderMigration(model)
                : renderAudit(model);
  return `<section class="app-shell">
    <header class="topbar">
      <div><div class="eyebrow">个人事务运行系统</div><h1>Task Copilot</h1></div>
      <div class="top-actions">${button("整理当前页", "v2-candidate-open", undefined, "primary")}${button(model.originReturnLabel ?? "关闭", "close", undefined, "quiet")}</div>
    </header>
    ${model.runtime ? `<div class="runtime-strip"><span>Plugin ${escapeHtml(model.runtime.pluginVersion)}</span><span>Runtime ${escapeHtml(model.runtime.runtimeStatus)}</span><span>Store ${escapeHtml(model.runtime.storeStatus)}</span><span>Graph ${escapeHtml(model.runtime.currentGraph)}</span></div>` : ""}
    <div class="agent-state ${model.agent.enabled ? "enabled" : "disabled"}">Agent ${model.agent.enabled ? `Demo · ${escapeHtml(model.agent.providerId)}` : "disabled · 基础事务系统可用"}</div>
    ${model.message && !immediateResult ? `<div class="notice">${escapeHtml(model.message)}</div>` : ""}
    ${immediateResult}
    ${model.error ? `<div class="error"><strong>未执行：</strong>${escapeHtml(model.error)}<span>请修正后重试；系统不会静默覆盖。</span></div>` : ""}
    <nav aria-label="主要工作区">${labels.map(([id, target, label]) => `<button class="${activePrimary === id ? "active" : ""}" data-action="view" data-value="${target}"${activePrimary === id ? ' aria-current="page"' : ""}>${label}</button>`).join("")}</nav>
    <main class="workspace" data-workspace="${model.workspace}">${renderActionDialog(model)}${sectionNavigation(model)}${body}</main>
  </section>`;
}
