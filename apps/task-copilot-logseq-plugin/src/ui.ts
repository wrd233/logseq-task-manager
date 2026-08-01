import type {
  AuditProjection,
  NowWorkView,
  ObjectDetailView,
  ProposalImpactView,
  ProjectReentryView,
} from "@task-copilot/application";
import { allowedPhaseTransitions, type AttentionSignal, type DomainEvent, type ManagedObject, type Proposal, type SemanticCommit, type SemanticOperation, type V2Anchor, type V2Association, type V2Candidate, type V2Condition, type V2ManagedObject, type V2MiniProjectClosure, type V2PrimaryOwnership, type V2ProjectClosure } from "@task-copilot/domain";
import type { ServiceConditionUndoPreparation, ServiceFocusSelection, ServiceNowWork, ServiceProjectClosureEvidenceDraft, ServiceProjectClosureUserJudgments, ServiceProjectCreationPreview, ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";
import { defaultDirectoryFilterState, filterAndSortDirectoryEntries, projectGlobalObjectDirectory, type DirectoryFilterState, type DirectoryFocusFilter, type GlobalObjectDirectoryEntry } from "./global-object-directory.ts";
import { renderV2ExplicitCandidateDiscoveryPanel, type V2ExplicitCandidatePanelState } from "./v2-explicit-candidate-discovery.ts";
import { lowRiskApplyEligibility } from "./v2-low-risk-apply.ts";
import type { PageContextSnapshot } from "./page-context-controller.ts";
import { projectRecentChanges, type RecentChange } from "./recent-changes.ts";
import type {
  PluginProjectReentryCard,
  PluginTaskReentryCard,
} from "./reentry-runtime.ts";
import type { PluginMiniProjectGrillState } from "./mini-project-grill-controller.ts";
import type { PluginProjectCreationGrillState } from "./project-creation-grill-controller.ts";
import type { PluginBackupRestoreState } from "./backup-restore-controller.ts";
import type { PluginMigrationReviewItem, PluginMigrationScanState } from "./migration-scan-controller.ts";
import type { PluginMigrationExecutionState, PluginMigrationRunView } from "./migration-execution-controller.ts";
import {
  resolveProjectContextRecoveryRoute,
  type PluginProjectContextRecoveryState,
} from "./project-context-recovery-controller.ts";
import {
  projectPluginProposalNarration,
  type PluginObjectNarration,
} from "./status-narration-runtime.ts";
import { projectNowFrontstageSections, type NowFrontstageItem } from "./now-frontstage.ts";
import {
  encodeAttentionNowPilotPrimaryValue,
  type AttentionNowPilotHint,
} from "./attention-shadow-runtime.ts";
import { activeOutcomeScope, createScopedOutcome, outcomeForScope, type ScopedOutcome } from "./scoped-outcome.ts";
import type { WorksitePreviewMode, WorksitePreviewState } from "./worksite-preview-controller.ts";

export interface WorksitePreviewUiEntry {
  expanded: boolean;
  state: WorksitePreviewState;
  mode?: WorksitePreviewMode;
}

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
  | "confirm-v2-project-closure-undo"
  | "confirm-v2-project-creation"
  | "confirm-v2-project-creation-undo"
  | "confirm-v2-project-structure"
  | "confirm-v2-project-structure-undo"
  | "confirm-v2-mini-project-restructure"
  | "confirm-v2-mini-project-restructure-undo"
  | "confirm-v2-mini-project-closure"
  | "confirm-v2-reasoned-lifecycle"
  | "confirm-v2-lifecycle-undo"
  | "confirm-v2-ownership"
  | "confirm-v2-ownership-undo"
  | "confirm-v2-condition-undo"
  | "confirm-v2-undo"
  | "v2-condition"
  | "v2-block-condition-route"
  | "v2-block-condition-actionable"
  | "v2-block-condition-waiting"
  | "v2-block-condition-blocked"
  | "v2-block-condition-paused"
  | "v2-deadline"
  | "v2-review-defer"
  | "v2-provider-revise"
  | "v2-candidate-update"
  | "v2-area-edit"
  | "v2-project-operation-router"
  | "v2-project-structure-edit"
  | "v2-project-closure-evidence"
  | "v2-mini-project-grill"
  | "v2-project-creation-grill"
  | "v2-page-context"
  | "v2-page-formal-items"
  | "v2-backup-restore"
  | "confirm-end-task-copilot"
  | "v2-origin-fallback";

export function cancelActionDialogReturnsToOrigin(kind: ActionDialogKind | undefined, hasOrigin: boolean): boolean {
  if (!hasOrigin) return false;
  return kind !== "confirm-v2-commit" && kind !== "confirm-v2-undo";
}

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
  outcome?: ScopedOutcome;
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
  v2AreaAvailable?: boolean;
  v2AreaBusy?: boolean;
  v2Objects?: V2ManagedObject[];
  v2PrimaryAnchors?: V2Anchor[];
  v2FocusSelections?: ServiceFocusSelection[];
  v2DirectoryFilter?: DirectoryFilterState;
  v2Associations?: V2Association[];
  v2PrimaryOwnerships?: V2PrimaryOwnership[];
  v2RelationLoadError?: string;
  v2AssociationAvailable?: boolean;
  v2AssociationBusy?: boolean;
  v2OwnershipCommitBusy?: boolean;
  v2BlockConditionBusy?: boolean;
  v2ConditionUndoBusy?: boolean;
  v2ConditionUndoPreparation?: ServiceConditionUndoPreparation;
  v2LifecycleCommitBusy?: boolean;
  v2StructureCommitBusy?: boolean;
  v2ProjectCreationCommitBusy?: boolean;
  v2ClosureProposalBusy?: boolean;
  v2LifecycleProposalBusy?: boolean;
  v2ClosureDraftBusy?: boolean;
  v2ClosureDraftInput?: V2MiniProjectClosure;
  v2LegacyTransferBusy?: boolean;
  v2ClosureReviewBusy?: boolean;
  v2Proposals?: ServiceStoredProposal[];
  v2SemanticCommits?: ServiceSemanticCommit[];
  v2NowWork?: ServiceNowWork;
  v2AttentionNowPilot?: AttentionNowPilotHint[];
  v2NowWorkTypeFilter?: V2NowWorkTypeFilter;
  v2NowWorkGrouping?: V2NowWorkGrouping;
  v2ProjectReentryCards?: PluginProjectReentryCard[];
  v2TaskReentryCards?: Record<string, PluginTaskReentryCard>;
  v2TaskReentryLoadError?: string;
  v2WorksitePreviews?: Record<string, WorksitePreviewUiEntry>;
  v2NowWorkOverflowOpen?: boolean;
  v2ProjectContextRecovery?: Record<string, PluginProjectContextRecoveryState>;
  v2MiniProjectGrill?: Record<string, PluginMiniProjectGrillState>;
  v2MiniProjectGrillAvailable?: boolean;
  v2MiniProjectGrillPreviewAvailable?: boolean;
  v2MiniProjectGrillProposalAvailable?: boolean;
  v2ProjectCreationGrill?: Record<string, PluginProjectCreationGrillState>;
  v2ProjectCreationGrillAvailable?: boolean;
  v2ProjectCreationPreviewAvailable?: boolean;
  v2ProjectCreationProposalAvailable?: boolean;
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
  v2ProjectNarrationBusy?: boolean;
  v2ProjectClosureEvidenceBusy?: boolean;
  v2ProjectClosureEvidence?: ServiceProjectClosureEvidenceDraft;
  v2ProjectClosureProposalAvailable?: boolean;
  v2ProjectClosureProposalBusy?: boolean;
  v2ProjectClosureProposalMessage?: string;
  v2ProjectClosureUserJudgments?: ServiceProjectClosureUserJudgments;
  v2ProjectClosureDraftFields?: Record<string, string>;
  v2LowRiskApplyBusyProposalId?: string;
  reviewMode?: "candidates" | "proposals";
  v2ProposalLoadError?: string;
  v2AuditLoadError?: string;
  recentActionCommitId?: string;
  originReturnLabel?: "返回原内容" | "返回原页面";
  v2MigrationRuns?: PluginMigrationRunView[];
  v2MigrationLoadError?: string;
  v2MigrationScan?: PluginMigrationScanState;
  v2MigrationScanAvailable?: boolean;
  v2MigrationExecution?: PluginMigrationExecutionState;
  v2MigrationExecutionAvailable?: boolean;
  v2BackupRestore?: PluginBackupRestoreState;
  v2BackupRestoreAvailable?: boolean;
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

function userFacingDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "时间待确认" : parsed.toLocaleString("zh-CN");
}

export function userFacingRelativeDateTime(value: string, now = new Date()): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "时间待确认";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const dayDiff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const time = `${parsed.getHours()}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  if (dayDiff === 0) return `今天 ${time}`;
  if (dayDiff === -1) return `昨天 ${time}`;
  if (dayDiff === 1) return `明天 ${time}`;
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${time}`;
}

function localTimeHint(id: string): string {
  return `<p class="muted field-hint" id="${id}">使用当前设备的本地时间。</p>`;
}

export function isWorkspace(value: string): value is Workspace {
  return (WORKSPACE_IDS as readonly string[]).includes(value);
}

function button(label: string, action: string, value?: string, className = "", disabled = false): string {
  return `<button type="button" class="${className}" data-action="${action}"${value ? ` data-value="${escapeHtml(value)}"` : ""}${disabled ? " disabled aria-busy=\"true\"" : ""}>${escapeHtml(label)}</button>`;
}

function proposalContinuationStatus(model: UiModel, proposalId: string): "PENDING" | "RECOVERY_REQUIRED" | undefined {
  const status = model.v2SemanticCommits?.find((commit) => (
    commit.proposalId === proposalId
    && commit.semanticCommitId.startsWith("proposal-commit:")
    && (commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED")
  ))?.status;
  return status === "PENDING" || status === "RECOVERY_REQUIRED" ? status : undefined;
}

function empty(title: string, detail: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function compactReviewText(value: string, maximum = 120): string {
  const structuralLabels = /^(?:成果|包含|不包含|完成证据|内部闭环|当前可进入工作|页面关系|来源材料)$/u;
  const text = value
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^#{1,6}\s*/u, "").replace(/^[-*+]\s+/u, ""))
    .filter((line) => line.length > 0 && !structuralLabels.test(line))
    .slice(0, 2)
    .join("。")
    .replace(/\s+/g, " ");
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function projectPageRelationshipLabel(mode: "CREATE_DEDICATED_PROJECT_PAGE" | "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE" | "REUSE_SOURCE_PAGE" | "REVIEW_REQUIRED"): string {
  if (mode === "CREATE_DEDICATED_PROJECT_PAGE") return "创建独立项目页面";
  if (mode === "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE") return "保留来源，创建独立项目页面";
  if (mode === "REUSE_SOURCE_PAGE") return "使用当前页面作为项目页面";
  return "项目页面的使用方式仍需确认";
}

function projectCreationPreviewChanges(preview: ServiceProjectCreationPreview): string[] {
  const linkedSources = preview.sourceMaterials.filter((material) => material.disposition === "LINK_AS_SOURCE").length;
  const reviewForMove = preview.sourceMaterials.filter((material) => material.disposition === "REVIEW_FOR_MOVE").length;
  return [
    "创建一个新项目",
    projectPageRelationshipLabel(preview.pageObjectRelationship.mode),
    ...(linkedSources ? [`连接 ${linkedSources} 项来源材料`] : []),
    ...(reviewForMove ? [`审阅 ${reviewForMove} 项材料的去向后再决定是否移动`] : []),
  ];
}

function worksitePreviewValue(objectId: string, anchor: string, version: number): string {
  return `${objectId}|${anchor}|${version}`;
}

function renderWorksitePreviewBody(state: WorksitePreviewState, value: string, mode: WorksitePreviewMode): string {
  if (state.status === "loading") return `<p class="muted worksite-status">正在读取工作记录…</p>`;
  if (state.status === "loaded-empty") {
    return `<p class="muted worksite-status">暂无工作记录</p><div class="worksite-actions">${button("重新读取", "v2-worksite-refresh", value, "quiet")}</div>`;
  }
  if (state.status === "unavailable") {
    return `<p class="muted worksite-status">工作记录不可用：${escapeHtml(state.reason)}</p>${button("重新读取", "v2-worksite-refresh", value, "quiet")}`;
  }
  if (state.status === "error") {
    return `<p class="worksite-error" role="status">${escapeHtml(state.safeMessage)}</p>${button("重新读取", "v2-worksite-refresh", value, "quiet")}`;
  }
  if (state.status === "stale") {
    return `<p class="muted worksite-status">工作记录</p><div class="worksite-actions">${button("重新读取", "v2-worksite-refresh", value, "quiet")}</div>`;
  }
  if (state.status === "idle") return `<p class="muted worksite-status">工作记录</p>`;
  const list = `<ul class="now-worksite-blocks">${state.blocks.map((block) => `<li class="worksite-block" style="--worksite-depth:${Math.min(block.depth, 3)}">${block.marker ? `<span class="worksite-marker">${escapeHtml(block.marker)}</span>` : ""}<span class="worksite-content">${escapeHtml(block.content)}</span></li>`).join("")}</ul>`;
  const actions = `<div class="worksite-actions">${mode === "short" && state.truncated ? button("展开完整记录", "v2-worksite-expand-full", value, "quiet") : ""}${button("重新读取", "v2-worksite-refresh", value, "quiet")}</div>`;
  return `${list}${actions}`;
}

function renderWorksitePreview(
  objectId: string,
  anchor: string | undefined,
  version: number,
  preview: WorksitePreviewUiEntry | undefined,
  focused: boolean,
): string {
  if (!anchor) return "";
  const value = worksitePreviewValue(objectId, anchor, version);
  const state = preview?.state ?? { status: "idle" as const };
  const mode = preview?.mode ?? "short";
  if (!focused && !preview?.expanded) {
    return `<details class="now-worksite now-worksite-collapsed" data-worksite-object="${escapeHtml(objectId)}"><summary aria-expanded="false">工作记录${state.status === "loaded" && state.blocks.length ? `（${state.blocks.length}）` : ""}</summary></details>`;
  }
  const collapse = !focused ? `<div class="worksite-actions">${button("收起", "v2-worksite-collapse", objectId, "quiet")}</div>` : "";
  return `<section class="now-worksite now-worksite-open" data-worksite-object="${escapeHtml(objectId)}"><div class="now-worksite-head"><span class="worksite-label">工作记录</span>${state.status === "loaded" && state.truncated ? `<span class="muted">还有 ${state.remainingCount} 条</span>` : ""}</div>${renderWorksitePreviewBody(state, value, mode)}${collapse}</section>`;
}

function renderNow(model: UiModel): string {
  if (model.v2NowWork) {
    const filter = model.v2NowWorkTypeFilter ?? "ALL";
    const grouping = model.v2NowWorkGrouping ?? "mixed";
    const frontstage = projectNowFrontstageSections(model.v2NowWork);
    const allItems = [...frontstage.continueProcessing, ...frontstage.needsReview, ...frontstage.keepWaiting]
      .map(({ item }) => item);
    const typeOrder: Array<Exclude<V2NowWorkTypeFilter, "ALL">> = ["PROJECT", "MINI_PROJECT", "TASK", "AREA", "DECISION", "OUTPUT"];
    const typeLabels = Object.fromEntries(typeOrder.map((type) => [type, objectTypeLabel(type)])) as Record<Exclude<V2NowWorkTypeFilter, "ALL">, string>;
    const availableTypes = typeOrder.filter((type) => allItems.some((item) => item.objectType === type));
    const filtered = (values: NowFrontstageItem[]) => filter === "ALL"
      ? values
      : values.filter(({ item }) => item.objectType === filter);
    const orderingAvailable = filter === "ALL" && grouping === "mixed";
    const focusIds = new Set(model.v2NowWork.focus.map((item) => item.objectId));
    const attentionByObjectId = new Map((model.v2AttentionNowPilot ?? []).map((hint) => [hint.objectId, hint]));
    const cards = (values: NowFrontstageItem[]) => values.map(({ item, focused, focusRank }) => {
      const attentionHint = attentionByObjectId.get(item.objectId);
      const primaryValue = (value: string) => encodeAttentionNowPilotPrimaryValue(
        value,
        attentionHint?.signalId,
      );
      const projected = model.v2ObjectNarrations?.[item.objectId];
      const narration = projected?.objectVersion === item.version ? projected.narration : undefined;
      const projectedTaskReentry = item.objectType === "TASK"
        ? model.v2TaskReentryCards?.[item.objectId]
        : undefined;
      const taskReentry = projectedTaskReentry?.objectVersion === item.version
        ? projectedTaskReentry
        : undefined;
      const taskRecovery = taskReentry
        && (taskReentry.projection.safetyState === "PENDING"
          || taskReentry.projection.safetyState === "RECOVERY_REQUIRED")
        && taskReentry.primaryRoute
        ? taskReentry
        : undefined;
      const taskSafetyUnavailable = item.objectType === "TASK"
        && taskReentry === undefined
        && model.v2TaskReentryLoadError !== undefined;
      const rawTaskOwnerContext = taskReentry?.projection.safetyState === "CLEAN"
        ? taskReentry.projection.keyEvidence
          .find((evidence) => /^所属 (?:MiniProject|Project|Area)：/.test(evidence))
        : undefined;
      const taskOwnerContext = rawTaskOwnerContext
        ?.replace("所属 MiniProject：", "所属小项目：")
        .replace("所属 Project：", "所属项目：")
        .replace("所属 Area：", "所属领域：");
      const nextAction = narration?.nextAction;
      const guidedStatusAction = narration?.nextActionEligible
        && nextAction
        && (
          nextAction.intent === "REVIEW_WAITING"
          || nextAction.intent === "REVIEW_BLOCKER"
          || nextAction.intent === "REVIEW_PAUSE"
        )
        && nextAction.targetObjectId === item.objectId
        ? button(nextAction.label, "v2-condition-open", primaryValue(`${item.objectId}|${item.version}`), "primary")
        : "";
      const openLabel = item.objectType === "PROJECT" ? "打开项目" : focused ? "继续处理" : "打开正文";
      const primaryAction = taskRecovery
        ? button(
            taskRecovery.primaryRoute!.label,
            taskRecovery.primaryRoute!.action,
            taskRecovery.primaryRoute!.value,
            "primary",
          )
        : taskSafetyUnavailable
          ? button("核对未完成修改", "view", "audit", "primary")
        : guidedStatusAction
        || (item.primaryAnchorExternalId
          ? button(openLabel, "v2-open-primary-anchor", primaryValue(item.primaryAnchorExternalId), "primary")
          : button("更新当前状态", "v2-condition-open", primaryValue(`${item.objectId}|${item.version}`), "primary"));
      const explanation = narration
        ? `<details class="now-explanation"><summary aria-expanded="false">为什么现在显示它</summary>${narration.unknowns.length ? `<p class="muted">${escapeHtml(narration.unknowns.join("；"))}</p>` : ""}<ul>${narration.facts.map((fact) => `<li>${escapeHtml(fact.text)}</li>`).join("")}</ul></details>`
        : "";
      const status = taskRecovery
        ? taskRecovery.projection.safetyState === "RECOVERY_REQUIRED"
          ? "<div class=\"now-card-status status-recovery\"><p><strong>上一次修改需要恢复</strong></p><p class=\"muted\">相关写入已经停止；请先核对差异并恢复到安全状态。</p></div>"
          : "<div class=\"now-card-status status-pending\"><p><strong>上一次修改尚未完成</strong></p><p class=\"muted\">已完成的步骤仍会保留；请沿用上一次修改继续。</p></div>"
        : taskSafetyUnavailable
          ? "<div class=\"now-card-status status-unavailable\"><p><strong>当前安全状态暂时无法核对</strong></p><p class=\"muted\">正式内容没有因此改变；请先核对未完成修改。</p></div>"
        : narration
        ? `<div class="now-card-status"><p class="now-status-conclusion">${escapeHtml(narration.conclusion)}</p>${narration.keyEvidence.length ? `<p class="muted">${escapeHtml(narration.keyEvidence[0]!)}</p>` : ""}</div>`
        : `<div class="now-card-status"><p class="now-status-conclusion">${escapeHtml(item.reason)}</p></div>`;
      const taskContext = !taskSafetyUnavailable && taskOwnerContext ? `<p class="muted">${escapeHtml(taskOwnerContext)}</p>` : "";
      const secondaryStatusAction = !guidedStatusAction && !item.primaryAnchorExternalId ? "" : button("更新状态", "v2-condition-open", `${item.objectId}|${item.version}`, "quiet");
      const attentionActions = attentionHint
        ? `${button("本次先不提醒", "v2-attention-disposition", `${attentionHint.signalId}|LATER`, "quiet")}${button("本次不相关", "v2-attention-disposition", `${attentionHint.signalId}|NOT_RELEVANT`, "quiet")}`
        : "";
      const secondaryActions = taskRecovery || taskSafetyUnavailable
        ? ""
        : `${guidedStatusAction && item.primaryAnchorExternalId ? button("打开正文", "v2-open-primary-anchor", item.primaryAnchorExternalId, "quiet") : ""}${secondaryStatusAction}${item.objectType === "TASK" ? button("设置期限", "v2-deadline-open", `${item.objectId}|${item.version}|${item.dueAt ?? ""}`, "quiet") : ""}${focused ? `${orderingAvailable ? `${button("上移", "v2-focus-up", item.objectId, "quiet", focusRank === 0)}${button("下移", "v2-focus-down", item.objectId, "quiet", focusRank === model.v2NowWork!.focus.length - 1)}` : ""}${button("移出关注", "v2-focus-remove", `${item.objectId}|${item.version}`, "quiet")}` : focusIds.has(item.objectId) ? `<span class="muted">已在当前关注</span>` : button("加入关注", "v2-focus-add", `${item.objectId}|${item.version}`, "quiet")}${attentionActions}`;
      const moreActions = secondaryActions
        ? `<details class="more-actions"><summary aria-expanded="false" aria-label="更多操作">⋯</summary><div class="actions wrap">${secondaryActions}</div></details>`
        : "";
      const sourceLabel = taskRecovery || taskSafetyUnavailable
        ? ""
        : `${focused ? " · 来自当前关注" : ""}${attentionHint ? " · Copilot 提醒 · 试用" : ""}`;
      const due = !taskRecovery && !taskSafetyUnavailable && item.dueAt
        ? `<p class="muted">期限：${escapeHtml(userFacingRelativeDateTime(item.dueAt))}</p>`
        : "";
      return `<article class="card compact now-card${focused ? " current-focus" : ""}"${narration ? ` data-narration-rule="${escapeHtml(narration.source.ruleId)}"` : ""}><div class="now-card-content"><div class="eyebrow">${escapeHtml(typeLabels[item.objectType])}${sourceLabel}</div><h3>${escapeHtml(item.text)}</h3>${status}${renderWorksitePreview(item.objectId, item.primaryAnchorExternalId, item.version, model.v2WorksitePreviews?.[item.objectId], focused)}${taskContext}${due}${explanation}</div><div class="now-card-actions">${moreActions}<div class="actions">${primaryAction}</div></div></article>`;
    }).join("");
    const section = (title: string, source: NowFrontstageItem[], frontstageLimit?: number) => {
      const values = filtered(source);
      if (!values.length) return "";
      const renderValues = (current: NowFrontstageItem[]) => grouping === "type"
        ? typeOrder.filter((type) => current.some(({ item }) => item.objectType === type)).map((type) => `<div class="now-work-group"><h3>${escapeHtml(typeLabels[type])}</h3><div class="cards">${cards(current.filter(({ item }) => item.objectType === type))}</div></div>`).join("")
        : `<div class="cards">${cards(current)}</div>`;
      const visible = frontstageLimit === undefined
        ? values
        : [
            ...values.filter(({ focused }) => focused),
            ...values.filter(({ focused }) => !focused).slice(0, frontstageLimit),
          ];
      const remaining = frontstageLimit === undefined
        ? []
        : values.filter(({ focused }) => !focused).slice(frontstageLimit);
      const overflow = remaining.length
        ? `<details class="now-work-overflow"${model.v2NowWorkOverflowOpen === true ? " open" : ""}><summary>查看其余 ${remaining.length} 项</summary>${renderValues(remaining)}</details>`
        : "";
      return `<section><h2>${escapeHtml(title)}</h2>${renderValues(visible)}${overflow}</section>`;
    };
    const controls = `<details class="now-work-controls"><summary>筛选与排列</summary><div class="now-work-control-body" aria-label="现在：筛选与分组"><div><strong>类型</strong><div class="actions wrap">${button("全部", "v2-now-filter", "ALL", filter === "ALL" ? "active" : "quiet")}${availableTypes.map((type) => button(typeLabels[type], "v2-now-filter", type, filter === type ? "active" : "quiet")).join("")}</div></div><div><strong>排列</strong><div class="actions">${button("混排", "v2-now-grouping", "mixed", grouping === "mixed" ? "active" : "quiet")}${button("按类型分组", "v2-now-grouping", "type", grouping === "type" ? "active" : "quiet")}</div></div>${orderingAvailable ? "" : "<p class=\"muted\">手动调整“当前关注”顺序请切回“全部 · 混排”；筛选不会改变正式状态。</p>"}</div></details>`;
    const content = `${section("现在先做", frontstage.continueProcessing, 4)}${section("需要回看", frontstage.needsReview)}${section("保持等待", frontstage.keepWaiting)}`;
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
    return `<details class="mini-project-closure" open><summary>小项目完成回顾</summary><p><strong>原目标：</strong>${escapeHtml(closure.originalGoal)}</p><p><strong>实际结果：</strong>${escapeHtml(closure.actualResult)}</p><p><strong>遗留或转移：</strong>${escapeHtml(closure.remainingWork)}</p></details>`;
  }
  const closure = object.closure as V2ProjectClosure;
  return `<details class="project-closure" open><summary>项目完成回顾</summary><p><strong>原始目标：</strong>${escapeHtml(closure.originalGoal)}</p><p><strong>实际结果：</strong>${escapeHtml(closure.actualResult)}</p><p><strong>主要交付：</strong>${escapeHtml(closure.majorDeliverables.join("；") || "无")}</p><p><strong>未完成目标：</strong>${closure.incompleteObjectives.length ? closure.incompleteObjectives.map((item) => `${escapeHtml(item.objective)}（${escapeHtml(item.reason)} → ${escapeHtml(item.nextStep)}）`).join("；") : "无"}</p><p><strong>遗留去向：</strong>${escapeHtml(closure.legacyDisposition)}</p><p><strong>关键决定：</strong>${escapeHtml(closure.keyDecisions.join("；") || "无")}</p><p><strong>未来重入：</strong>${escapeHtml(closure.futureSummary)}</p></details>`;
}

function renderV2ProjectStructure(object: V2ManagedObject): string {
  const structure = object.objectType === "PROJECT" ? object.projectStructure : undefined;
  if (!structure) return "";
  const objectives = structure.objectives.length ? `<section><h4>目标</h4><ul>${structure.objectives.map((item) => `<li><strong>${escapeHtml(item.priority === "PRIMARY" ? "主要" : "次要")}：</strong>${escapeHtml(item.text)}${item.successEvidence.length ? ` · 完成证据：${escapeHtml(item.successEvidence.join("；"))}` : ""}</li>`).join("")}</ul></section>` : "";
  const deliverables = structure.deliverables.length ? `<section><h4>交付</h4><ul>${structure.deliverables.map((item) => `<li>${escapeHtml(item.text)} · ${escapeHtml(deliverableStatusLabel(item.status))} · 验收：${escapeHtml(item.acceptance)}</li>`).join("")}</ul></section>` : "";
  const stages = structure.workStages.length ? `<section><h4>推进阶段</h4><ul>${structure.workStages.map((item) => `<li>${escapeHtml(item.name)}：${escapeHtml(item.statusDescription)}</li>`).join("")}</ul></section>` : "";
  return `<details class="project-structure" open><summary>项目当前信息</summary><p><strong>当前摘要：</strong>${escapeHtml(structure.currentSummary)}</p><p><strong>当前推进：</strong>${escapeHtml(structure.currentFocuses.join("；"))}</p>${objectives}${deliverables}${stages}${structure.stageMappings.length ? `<p class="muted">${structure.stageMappings.length} 个工作对象已映射到主推进阶段；阶段调整不会移动正文或改变归属。</p>` : ""}</details>`;
}

function renderDirectoryRow(model: UiModel, entry: GlobalObjectDirectoryEntry): string {
  const object = model.v2Objects?.find((candidate) => candidate.objectId === entry.objectId);
  if (!object) return "";
  const supportsReasonedLifecycle = ["TASK", "MINI_PROJECT", "PROJECT"].includes(object.objectType);
  const lifecycleActions = supportsReasonedLifecycle && object.lifecycle === "OPEN"
    ? button(model.v2LifecycleProposalBusy ? "正在发起…" : `取消 ${objectTypeLabel(object.objectType)}`, "v2-lifecycle-propose-open", `${object.objectId}|${object.version}|CANCEL`, "quiet", model.v2LifecycleProposalBusy === true)
    : supportsReasonedLifecycle && (object.lifecycle === "COMPLETED" || object.lifecycle === "CANCELLED")
      ? button(model.v2LifecycleProposalBusy ? "正在发起…" : `重开 ${objectTypeLabel(object.objectType)}`, "v2-lifecycle-propose-open", `${object.objectId}|${object.version}|REOPEN`, "quiet", model.v2LifecycleProposalBusy === true)
      : "";
  const closureAction = object.objectType === "MINI_PROJECT" && object.lifecycle === "OPEN" ? button(model.v2ClosureProposalBusy ? "正在发起…" : "完成小项目", "v2-mini-project-closure-propose", `${object.objectId}|${object.version}`, "quiet", model.v2ClosureProposalBusy === true) : "";
  const grillAction = object.objectType === "MINI_PROJECT" && object.lifecycle === "OPEN" ? button(model.v2MiniProjectGrillAvailable ? "梳理小项目" : "梳理暂不可用", "v2-mini-project-grill-open", `${object.objectId}|${object.version}`, "quiet", model.v2MiniProjectGrillAvailable !== true) : "";
  const evolveProjectAction = object.objectType === "MINI_PROJECT" && object.lifecycle === "OPEN" ? button(model.v2ProjectCreationGrillAvailable ? "升级为项目" : "升级暂不可用", "v2-project-creation-grill-open", `MINI_PROJECT:${object.objectId}:${object.version}`, "quiet", model.v2ProjectCreationGrillAvailable !== true) : "";
  const areaAction = object.objectType === "AREA" && object.lifecycle === "OPEN" ? button("编辑领域", "v2-area-edit-open", `${object.objectId}|${object.version}`, "quiet", model.v2AreaBusy === true) : "";
  const projectStructureAction = object.objectType === "PROJECT" && object.lifecycle === "OPEN" ? button("调整项目", "v2-project-operation-router-open", `${object.objectId}|${object.version}`, "quiet") : "";
  const secondaryActions = `${areaAction}${grillAction}${evolveProjectAction}${closureAction}${projectStructureAction}${lifecycleActions}`;
  const meta = [
    objectTypeLabel(object.objectType),
    objectLifecycleLabel(object.lifecycle),
    ...(entry.condition ? [conditionKindLabel(entry.condition.kind)] : []),
  ].join(" · ");
  const updated = userFacingRelativeDateTime(entry.updatedAt);
  const due = entry.dueAt ? ` · 期限 ${userFacingDateTime(entry.dueAt)}` : "";
  const openSource = entry.primaryAnchor?.status === "active"
    ? button("打开原文", "v2-directory-open-source", entry.primaryAnchor.externalId, "quiet")
    : entry.primaryAnchor
      ? `<span class="muted directory-source-issue">来源需重新连接</span>`
      : "";
  const focusAction = object.lifecycle === "OPEN"
    ? entry.focus.selected
      ? button("移出关注", "v2-directory-focus-remove", `${object.objectId}|${object.version}`, "quiet")
      : button("加入关注", "v2-directory-focus-add", `${object.objectId}|${object.version}`, "quiet")
    : "";
  const focusMarker = entry.focus.selected
    ? entry.lifecycle === "OPEN"
      ? `<span class="directory-marker focus-marker">当前关注</span>`
      : `<span class="directory-marker">已关注 · 已关闭</span>`
    : "";
  const nowMarker = entry.now
    ? entry.now.section === "next"
      ? `<span class="directory-marker now-marker">接下来</span>`
      : entry.now.section === "waitingReview"
        ? `<span class="directory-marker now-marker">${entry.condition?.kind === "WAITING" ? "需要回看" : "保持等待"}</span>`
        : ""
    : "";
  const more = secondaryActions || object.projectStructure || object.closure
    ? `<details class="directory-row-more"><summary>更多</summary><div class="actions">${secondaryActions}</div>${renderV2ProjectStructure(object)}${renderV2ObjectClosure(object)}</details>`
    : "";
  return `<article class="object-row directory-row" data-object-id="${escapeHtml(object.objectId)}">
    <div class="directory-row-body">
      <h3 class="directory-row-title">${escapeHtml(object.text)}</h3>
      <p class="directory-row-meta">${meta}</p>
      ${focusMarker || nowMarker ? `<p class="directory-row-markers">${focusMarker}${nowMarker}</p>` : ""}
      <p class="directory-row-facts">${escapeHtml(updated)}${due}</p>
    </div>
    <div class="directory-row-actions">${openSource}${focusAction}${more}</div>
  </article>`;
}

function renderDirectoryToolbar(
  model: UiModel,
  filter: DirectoryFilterState,
  total: number,
  visible: number,
): string {
  const focusOptions: Array<{ value: DirectoryFocusFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "focus", label: "当前关注" },
    { value: "now", label: "在 Now" },
  ];
  const focusChips = focusOptions.map((option) => {
    const selected = filter.focus === option.value;
    return `<button type="button" class="${selected ? "primary" : "quiet"}" data-action="v2-directory-filter-focus" data-value="${option.value}" aria-pressed="${selected ? "true" : "false"}">${escapeHtml(option.label)}</button>`;
  }).join("");
  const select = (field: string, label: string, options: Array<[string, string]>, value: string): string =>
    `<label class="directory-filter-field">${escapeHtml(label)}<select data-field="${field}" aria-label="${escapeHtml(label)}">${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}"${optionValue === value ? " selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></label>`;
  const typeOptions: Array<[string, string]> = [["ALL", "全部类型"], ["AREA", "领域"], ["PROJECT", "项目"], ["MINI_PROJECT", "小项目"], ["TASK", "任务"], ["DECISION", "决定"], ["OUTPUT", "成果"]];
  const lifecycleOptions: Array<[string, string]> = [["ALL", "全部状态"], ["OPEN", "进行中"], ["COMPLETED", "已完成"], ["CANCELLED", "已取消"], ["ARCHIVED", "已归档"]];
  const conditionOptions: Array<[string, string]> = [["ALL", "全部情况"], ["ACTIONABLE", "可以行动"], ["WAITING", "等待中"], ["BLOCKED", "受阻"], ["PAUSED", "已暂停"]];
  const sortOptions: Array<[string, string]> = [["updated", "最近更新"], ["title", "标题"], ["type", "类型"], ["lifecycle", "状态"], ["due", "期限"], ["focus", "关注优先"]];
  const active = filter.search.trim() !== "" || filter.focus !== "all" || filter.type !== "ALL" || filter.lifecycle !== "ALL" || filter.condition !== "ALL" || filter.sort !== "updated";
  const count = active
    ? `<p class="directory-count" aria-live="polite">已筛选 ${visible} / ${total} 项</p>`
    : `<p class="directory-count" aria-live="polite">${total} 项</p>`;
  return `<div class="directory-toolbar">
    <label class="directory-search-field">搜索标题<input data-field="v2DirectorySearch" value="${escapeHtml(filter.search)}" placeholder="搜索标题" aria-label="搜索标题"></label>
    <div class="directory-focus-chips" role="group" aria-label="注意力筛选">${focusChips}</div>
    <div class="directory-filter-fields">${select("v2DirectoryTypeFilter", "类型", typeOptions, filter.type)}${select("v2DirectoryLifecycleFilter", "状态", lifecycleOptions, filter.lifecycle)}${select("v2DirectoryConditionFilter", "当前情况", conditionOptions, filter.condition)}${select("v2DirectorySort", "排序", sortOptions, filter.sort)}</div>
    ${active ? button("清除筛选", "v2-directory-clear-filters", undefined, "quiet") : ""}
    ${count}
  </div>`;
}

function renderDirectoryEmpty(filter: DirectoryFilterState): string {
  const active = filter.search.trim() !== "" || filter.focus !== "all" || filter.type !== "ALL" || filter.lifecycle !== "ALL" || filter.condition !== "ALL";
  return active
    ? `<div class="empty directory-empty"><strong>没有找到匹配的事项</strong><p class="muted">可以清除筛选或换一个标题再试；正式记录没有被修改。</p>${button("清除筛选", "v2-directory-clear-filters", undefined, "primary")}</div>`
    : empty("还没有正式事项", "从“待整理”或“待我确认”开始，或在下方创建领域/项目。");
}

function renderObjects(model: UiModel): string {
  const relationError = model.v2RelationLoadError ? `<section class="card error" role="alert"><strong>关系投影暂不可用</strong><p>${escapeHtml(model.v2RelationLoadError)}</p><p class="muted">正式对象与其他工作区仍可使用；没有执行关系写入。</p></section>` : "";
  const projectCreator = `<section class="card project-creator" aria-label="创建项目"><div class="eyebrow">项目梳理</div><h3>新建项目</h3><p class="muted">先说清想得到的结果、范围、完成证据和当前推进；确认最终阅读结果后再进入“待我确认”。</p>${button("开始梳理项目", "v2-project-creation-grill-open", "BLANK", "primary", model.v2ProjectCreationGrillAvailable !== true)}</section>`;
  const areaCreator = `<section class="card area-creator" aria-label="创建领域"><div class="eyebrow">新建领域</div><h3>新建领域</h3><p class="muted">记录一块长期负责的范围，例如健康、家庭或某个工作方向。</p><label>责任描述<input data-field="v2AreaText" placeholder="例如：维持稳定作息与健康检查"${model.v2AreaAvailable && !model.v2AreaBusy ? "" : " disabled"}></label>${button(model.v2AreaBusy ? "正在创建…" : "创建领域", "create-v2-area", undefined, "primary", !model.v2AreaAvailable || model.v2AreaBusy === true)}<details><summary>技术说明</summary><p class="muted">领域是独立正式事项；此入口不会创建隐式页面或正文连接。</p></details></section>`;
  const associationCreator = model.v2Objects && model.v2Objects.length >= 2 ? `<section class="card association-creator" aria-label="添加相关内容"><div class="eyebrow">相关内容</div><h3>关联两个事项</h3><p class="muted">只表达“这两项相关”，不会改变归属、位置或当前状态。</p><label>来源事项<select data-field="v2AssociationSource"><option value="">请选择</option>${model.v2Objects.map((object) => `<option value="${escapeHtml(object.objectId)}" data-version="${object.version}">${escapeHtml(objectTypeLabel(object.objectType))} · ${escapeHtml(object.text)}</option>`).join("")}</select></label><label>相关事项<select data-field="v2AssociationTarget"><option value="">请选择</option>${model.v2Objects.map((object) => `<option value="${escapeHtml(object.objectId)}">${escapeHtml(objectTypeLabel(object.objectType))} · ${escapeHtml(object.text)}</option>`).join("")}</select></label><label class="confirm-line"><input type="checkbox" data-field="v2AssociationConfirmed" value="yes">确认添加相关内容，不改变归属</label>${button(model.v2AssociationBusy ? "正在添加…" : "添加关联", "v2-association-add", undefined, "primary", !model.v2AssociationAvailable || model.v2AssociationBusy)}${model.v2Associations?.length ? `<p class="muted">当前已有 ${model.v2Associations.length} 条相关内容。</p>` : ""}<details><summary>技术说明</summary><p class="muted">“相关内容”是普通关联，不会改变主归属、位置、生命周期或当前关注。</p></details></section>` : "";
  if (model.v2Objects !== undefined) {
    const advanced = `<details class="objects-advanced"${model.v2Objects.length === 0 ? " open" : ""}><summary>整理结构（创建领域、项目与关联）</summary><div class="objects-advanced-body">${areaCreator}${projectCreator}${associationCreator}</div></details>`;
    if (model.v2Objects.length === 0) return `${relationError}${empty("还没有正式事项", "从“待整理”或“待我确认”开始，或在下方创建领域/项目。")}${advanced}`;
    const objectLabels = new Map(model.v2Objects.map((object) => [object.objectId, `${objectTypeLabel(object.objectType)} · ${object.text}`]));
    const ownershipList = (model.v2PrimaryOwnerships ?? []).length ? `<section aria-label="所属关系"><h2>所属关系</h2><div class="object-list">${(model.v2PrimaryOwnerships ?? []).slice(0, 100).map((ownership) => `<article class="object-row"><span>${escapeHtml(objectLabels.get(ownership.childObjectId) ?? ownership.childObjectId)} → ${escapeHtml(objectLabels.get(ownership.ownerObjectId) ?? ownership.ownerObjectId)}</span><small>唯一主归属</small></article>`).join("")}</div>${(model.v2PrimaryOwnerships?.length ?? 0) > 100 ? `<p class="muted">仅显示前 100 条；完整投影仍由本地服务提供。</p>` : ""}</section>` : "";
    const visibleAssociations = (model.v2Associations ?? []).slice(0, 100);
    const associationList = visibleAssociations.length ? `<section aria-label="相关内容列表"><h2>相关内容</h2><div class="object-list">${visibleAssociations.map((association) => `<article class="object-row"><span>${escapeHtml(objectLabels.get(association.sourceObjectId) ?? association.sourceObjectId)} → ${escapeHtml(objectLabels.get(association.targetObjectId) ?? association.targetObjectId)}</span><small>${escapeHtml(associationKindLabel(association.associationKind))} · ${escapeHtml(associationStatusLabel(association.status))}</small></article>`).join("")}</div>${(model.v2Associations?.length ?? 0) > visibleAssociations.length ? `<p class="muted">仅显示前 ${visibleAssociations.length} 条；完整投影仍由本地服务提供。</p>` : ""}</section>` : "";
    const entries = projectGlobalObjectDirectory({
      objects: model.v2Objects,
      anchors: model.v2PrimaryAnchors ?? [],
      ownerships: model.v2PrimaryOwnerships ?? [],
      focusSelections: model.v2FocusSelections ?? [],
      ...(model.v2NowWork ? { nowWork: model.v2NowWork } : {}),
    });
    const filter = model.v2DirectoryFilter ?? defaultDirectoryFilterState();
    const visible = filterAndSortDirectoryEntries(entries, filter);
    const list = `<section aria-label="全部事项"><h2>全部事项</h2><p class="muted">查看任务、小项目、项目和其他正式记录。</p>${renderDirectoryToolbar(model, filter, entries.length, visible.length)}${visible.length ? `<div class="object-list directory-list">${visible.map((entry) => renderDirectoryRow(model, entry)).join("")}</div>` : renderDirectoryEmpty(filter)}</section>`;
    const context = `<details class="objects-advanced objects-context"><summary>查看所属与相关内容（${(model.v2PrimaryOwnerships?.length ?? 0) + (model.v2Associations?.length ?? 0)} 条）</summary><div class="objects-advanced-body">${ownershipList}${associationList}</div></details>`;
    return `${relationError}${list}${context}${advanced}`;
  }
  if (model.objects.length === 0) return `${areaCreator}${projectCreator}${empty("还没有正式事项", "从“待整理”或“待我确认”开始，或创建领域/项目。")}`;
  const list = `<div class="object-list">${model.objects
    .map(
      (object) => `<button class="object-row" data-action="select-object" data-value="${escapeHtml(object.objectId)}">
        <span>${escapeHtml(object.text)}</span><small>${escapeHtml(objectTypeLabel(object.objectType))} · ${escapeHtml(migrationPhaseLabel(object.phase))} · ${escapeHtml(conditionKindLabel(object.condition.kind))}</small>
      </button>`,
    )
    .join("")}</div>`;
  const detailView = model.selectedObjectDetail;
  if (!detailView) return `${areaCreator}${projectCreator}${list}`;
  const { object, owner, anchors, signals, recentEvents, undoableCommitId } = detailView;
  const detail = `<aside class="drawer" aria-label="对象抽屉">
    <div class="eyebrow">${escapeHtml(objectTypeLabel(object.objectType))} · v${object.version}</div>
    <h2>${escapeHtml(object.text)}</h2>
    <code>${escapeHtml(object.objectId)}</code>
    <div class="badges"><span>${escapeHtml(object.phase)}</span><span>${escapeHtml(object.condition.kind)}</span></div>
    ${signals.length ? `<div class="badges">${signals.map((signal) => `<span class="signal">${escapeHtml(signal)}</span>`).join("")}</div>` : ""}
    <section><h3>主归属</h3><p>${owner ? escapeHtml(owner.text) : "待确认归属"}</p></section>
    ${object.completionCriteria ? `<section><h3>完成标准</h3><p>${escapeHtml(object.completionCriteria)}</p></section>` : ""}
    ${object.nextAction ? `<section><h3>下一步</h3><p>${escapeHtml(object.nextAction)}</p></section>` : ""}
    ${object.currentSummary ? `<section><h3>当前状态</h3><p>${escapeHtml(object.currentSummary)}</p></section>` : ""}
    ${object.dueAt || object.reviewAt ? `<section><h3>日期</h3><p>${object.dueAt ? `期限：${escapeHtml(userFacingDateTime(object.dueAt))}` : ""}${object.dueAt && object.reviewAt ? " · " : ""}${object.reviewAt ? `复查：${escapeHtml(userFacingDateTime(object.reviewAt))}` : ""}</p></section>` : ""}
    ${object.condition.kind === "WAITING" ? `<section><h3>等待</h3><p>${escapeHtml(object.condition.waitingFor)} · ${escapeHtml(object.condition.expectedResult)} · ${escapeHtml(userFacingDateTime(object.condition.reviewAt))}</p></section>` : ""}
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

function userFacingSemanticOperation(operation: ServiceStoredProposal["proposal"]["groups"][number]["semanticOperations"][number]): string {
  switch (operation.kind) {
    case "CREATE_OBJECT":
      return operation.payload.objectType === "PROJECT" ? "创建一个新项目及其主页面" : `创建新的 ${operation.payload.objectType}`;
    case "UPDATE_PROJECT_NARRATION":
      return "更新项目摘要";
    case "UPDATE_PROJECT_INTERFACE":
      return "更新项目的目标、成果和当前推进";
    case "TRANSITION_LIFECYCLE":
      return operation.payload.lifecycle === "COMPLETED" ? "将事项标记为已完成" : operation.payload.lifecycle === "CANCELLED" ? "取消这个事项" : "重新打开这个事项";
    case "CHANGE_OWNERSHIP":
      return "调整事项的主归属";
    case "CREATE_BLOCK":
      return "在原位置新增整理结构";
    case "MOVE_BLOCK":
      return "移动已有内容到审阅后的结构";
    default:
      return operation.summary;
  }
}

function v2ReviewChanges(record: ServiceStoredProposal): string[] {
  const visibleGroups = record.proposal.groups.filter((group) => group.disposition !== "REJECTED");
  const textPatchCount = visibleGroups.reduce((total, group) => total + group.textPatches.length, 0);
  const changes = [
    ...(textPatchCount ? [`更新 ${textPatchCount} 处正文`] : []),
    ...visibleGroups.flatMap((group) => group.semanticOperations.map(userFacingSemanticOperation)),
  ];
  return [...new Set(changes)];
}

function renderReview(model: UiModel): string {
  const open = model.proposals.filter((proposal) => proposal.status === "OPEN");
  const v2 = model.v2Proposals ?? [];
  const reviewMode = model.reviewMode ?? "candidates";
  const candidatePanel = model.v2CandidatePanel ? renderV2ExplicitCandidateDiscoveryPanel(model.v2CandidatePanel, Boolean(model.v2CandidateAvailable), model.v2Candidates, model.v2CandidateSourcePreviews) : "";
  const candidateCount = (model.v2Candidates ?? []).filter(({ disposition, deferredUntil }) => disposition === "PENDING" || (disposition === "LATER" && deferredUntil !== undefined && Date.parse(deferredUntil) <= Date.now())).length;
  const proposalCount = open.length + v2.filter((record) => !["APPLIED", "REJECTED", "STALE", "FAILED"].includes(record.proposal.status)).length;
  const reviewModeButton = (label: string, value: "candidates" | "proposals") => `<button type="button" class="${reviewMode === value ? "primary" : "quiet"}" data-action="review-mode" data-value="${value}" aria-pressed="${reviewMode === value}">${escapeHtml(label)}</button>`;
  const tabs = `<div class="actions review-modes" role="group" aria-label="审阅中心视图">${reviewModeButton(`待整理${candidateCount ? ` (${candidateCount})` : ""}`, "candidates")}${reviewModeButton(`待审阅${proposalCount ? ` (${proposalCount})` : ""}`, "proposals")}</div>`;
  if (reviewMode === "candidates") {
    const providerState = model.v2ProviderState ?? { status: "idle" as const };
    const providerPanel = model.v2ProviderAvailable
      ? `<section class="card compact"><div class="eyebrow">AI 辅助 · 只读分析</div><h3>理解当前选中内容</h3><p>只生成一份可审阅方案；普通记录会说明为什么暂不整理。不会自动扫描页面或修改正式状态。</p><div class="actions">${button(providerState.status === "loading" ? "分析中…" : providerState.status === "error" ? "重新分析" : "分析当前内容", "v2-provider-analyze-current-block", undefined, "primary", providerState.status === "loading")}${providerState.status === "error" ? button("查看系统状态", "runtime-diagnostics", undefined, "quiet") : ""}</div>${providerState.message ? `<div class="${providerState.status === "error" ? "error" : "notice"}"${providerState.status === "error" ? " role=\"alert\"" : ""}>${escapeHtml(providerState.message)}${providerState.status === "error" ? "<span>没有修改正文或正式事项。你可以重试，或查看当前系统状态。</span>" : ""}</div>` : ""}</section>`
      : "";
    return `${tabs}${providerPanel}${candidatePanel || empty("当前无法读取待整理内容", "连接恢复后可手动检查当前页；系统不会自动扫描整个知识库。")}`;
  }
  const v2LoadError = model.v2ProposalLoadError ? `<div class="error"><strong>审阅列表暂时没有加载：</strong>${escapeHtml(model.v2ProposalLoadError)}<span>现有内容和正式状态没有变化。</span></div>` : "";
  const renderV2Card = (record: ServiceStoredProposal): string => {
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
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length === 1
      && (
        (acceptedGroups[0]!.risk === "HIGH" && acceptedGroups[0]!.semanticOperations[0]!.kind === "UPDATE_PROJECT_INTERFACE")
        || (acceptedGroups[0]!.risk === "MEDIUM" && acceptedGroups[0]!.semanticOperations[0]!.kind === "UPDATE_PROJECT_NARRATION")
      )
      && "projectStructure" in acceptedGroups[0]!.semanticOperations[0]!.payload;
    const isProjectCreation = acceptedGroups.length === 1
      && acceptedGroups[0]!.risk === "HIGH"
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length === 1
      && acceptedGroups[0]!.semanticOperations[0]!.kind === "CREATE_OBJECT"
      && acceptedGroups[0]!.semanticOperations[0]!.target.kind === "PAGE"
      && acceptedGroups[0]!.semanticOperations[0]!.payload.objectType === "PROJECT";
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
    const originalCommit = model.v2SemanticCommits?.find((commit) => commit.proposalId === record.proposal.proposalId && commit.semanticCommitId.startsWith("proposal-commit:"));
    const continuationStatus = proposalContinuationStatus(model, record.proposal.proposalId);
    const pendingOriginalCommit = continuationStatus === "PENDING";
    const recoveryOriginalCommit = continuationStatus === "RECOVERY_REQUIRED";
    const ownershipUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `ownership-undo:${originalCommit.semanticCommitId}`) : undefined;
    const projectStructureUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `project-structure-undo:${originalCommit.semanticCommitId}`) : undefined;
    const projectClosureUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `project-closure-undo:${originalCommit.semanticCommitId}`) : undefined;
    const miniProjectRestructureUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `mini-project-restructure-undo:${originalCommit.semanticCommitId}`) : undefined;
    const projectCreationUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `project-creation-undo:${originalCommit.semanticCommitId}`) : undefined;
    const canCommit = hasAcceptedGroup && !miniProjectClosureBlockedByOtherGroups && (record.proposal.status === "ACCEPTED" || record.proposal.status === "PARTIALLY_ACCEPTED");
    const lifecycleUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `lifecycle-undo:${originalCommit.semanticCommitId}`) : undefined;
    const canOwnershipUndo = isOwnershipChange && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && ownershipUndoCommit?.status !== "FAILED";
    const canProjectCreationUndo = isProjectCreation && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && projectCreationUndoCommit?.status !== "FAILED";
    const canProjectStructureUndo = isProjectStructure && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && projectStructureUndoCommit?.status !== "FAILED";
    const canProjectClosureUndo = isProjectClosure && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && projectClosureUndoCommit?.status !== "FAILED" && projectClosureUndoCommit?.status !== "COMPLETED";
    const canMiniProjectRestructureUndo = isMiniProjectRestructure && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && miniProjectRestructureUndoCommit?.status !== "FAILED" && miniProjectRestructureUndoCommit?.status !== "COMPLETED";
    const canLifecycleUndo = isReasonedLifecycle && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && lifecycleUndoCommit?.status !== "FAILED" && lifecycleUndoCommit?.status !== "COMPLETED";
    const canUndo = !isProjectClosure && !isProjectStructure && !isProjectCreation && !isMiniProjectRestructure && !isMiniProjectClosure && !isReasonedLifecycle && !isOwnershipChange && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED";
    const canReviseWithProvider = model.v2ProviderAvailable === true && record.proposal.source.kind === "local_llm" && ["READY", "IN_REVIEW", "PARTIALLY_ACCEPTED", "ACCEPTED"].includes(record.proposal.status);
    const changes = v2ReviewChanges(record);
    const applied = record.proposal.status === "APPLIED";
    const failed = record.proposal.status === "FAILED";
    const stale = record.proposal.status === "STALE";
    const reviewStage = applied
      ? "已正式应用"
      : failed
        ? "这次应用没有完成"
        : stale
          ? "方案已变化，需要重新检查"
          : recoveryOriginalCommit
            ? "上次修改需要恢复"
            : pendingOriginalCommit
              ? "修改尚未完成，可以继续"
              : canCommit
                ? "方案已审阅，等待确认应用"
                : "请审阅这项方案";
    const visibleGroups = record.proposal.groups.filter((group) => group.disposition !== "REJECTED");
    const highImpact = visibleGroups.some((group) => group.risk === "HIGH");
    const operationKinds = new Set(visibleGroups.flatMap((group) => group.semanticOperations.map((operation) => operation.kind)));
    const projectClosureOperation = record.proposal.groups
      .filter((group) => group.disposition !== "REJECTED")
      .flatMap((group) => group.semanticOperations)
      .find((operation) => operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload);
    const projectClosure = projectClosureOperation?.payload.closure as V2ProjectClosure | undefined;
    const systemUnderstanding = projectClosure
      ? `将结束这个项目，并保存结果：${compactReviewText(projectClosure.actualResult)}${projectClosure.incompleteObjectives.length ? ` ${projectClosure.incompleteObjectives.length} 项未完成目标会保留明确后续。` : ""}`
      : compactReviewText(record.proposal.finalPreview);
    const reviewTitle = projectClosure
      ? `结束项目：${record.proposal.title.replace(/^Closure Proposal:\s*/iu, "")}`
      : record.proposal.title;
    const scopeBoundary = (isProjectClosure || (operationKinds.has("UPDATE_PROJECT_INTERFACE") && operationKinds.has("TRANSITION_LIFECYCLE")))
      ? "项目页面和正文不会被删除或改写。"
      : (isProjectCreation || operationKinds.has("CREATE_OBJECT"))
        ? "来源页面和原始材料会保留；不会静默删除已有内容。"
        : (isMiniProjectRestructure || operationKinds.has("MOVE_BLOCK"))
          ? "不会删除原材料；已有内容会保留原来的身份。"
          : (isOwnershipChange || operationKinds.has("CHANGE_OWNERSHIP"))
            ? "只调整主归属；正文、位置和普通关联保持不变。"
            : (isReasonedLifecycle || operationKinds.has("TRANSITION_LIFECYCLE"))
              ? "正文、当前关注、归属和位置保持不变。"
              : "未在方案中的正文、状态和关系不会改变。";
    const safetyItems = applied
      ? [scopeBoundary, "没有后续冲突时，可以从这里撤销本次应用。"]
      : recoveryOriginalCommit
        ? [scopeBoundary, "上次修改未完整收口；系统会沿用同一恢复记录，不会新建重复操作。"]
        : pendingOriginalCommit
          ? [scopeBoundary, "正式修改已经开始；继续时会沿用原记录，不会重复应用已完成步骤。"]
          : [scopeBoundary, "现在退出是安全的；只有“确认应用”后才会正式生效。"];
    const understandingSection = `<section><h4>系统理解</h4><p>${escapeHtml(systemUnderstanding)}</p></section>`;
    const changesSection = `<section><h4>本次会改变什么</h4>${changes.length ? `<ul>${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>` : "<p>不会产生正式变化。</p>"}</section>`;
    const safetySection = `<section><h4>本次不会改变什么</h4><ul>${safetyItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
    const impactSections = highImpact
      ? `${changesSection}${safetySection}${understandingSection}`
      : `${understandingSection}${changesSection}${safetySection}`;
    const currentChoices = record.proposal.groups.filter((group) => group.disposition === "PENDING" || group.disposition === "DEFERRED").map((group) => {
      const projectClosureChoice = group.textPatches.length === 0
        && group.semanticOperations.length === 2
        && group.semanticOperations.some((operation) => operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload)
        && group.semanticOperations.some((operation) => operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.lifecycle === "COMPLETED");
      const reviewKind = group.semanticOperations.some((operation) => operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.objectType === "MINI_PROJECT" && operation.payload.lifecycle === "COMPLETED") ? "MINI_PROJECT_CLOSURE" : "ORDINARY";
      const deferral = group.disposition === "DEFERRED" && group.deferredUntil
        ? `<p class="muted">暂缓至 ${escapeHtml(new Date(group.deferredUntil).toLocaleString("zh-CN"))}${group.deferReason ? ` · ${escapeHtml(group.deferReason)}` : ""}</p>`
        : "";
      return `<section class="review-choice">${projectClosureChoice ? "" : `<p><strong>${escapeHtml(group.explanation)}</strong></p>`}${deferral}<div class="actions wrap">${lowRiskApply.eligible ? button(lowRiskApplyBusy ? "正在应用…" : "确认并应用", "v2-low-risk-apply", `${record.proposal.proposalId}|${record.updatedAt}`, "primary", lowRiskApplyBusy) : button("审阅方案", "v2-review-accept", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}|${group.risk}|${reviewKind}`, "primary", lowRiskApplyBusy)}${button("不采用", "v2-review-reject", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}`, "quiet", lowRiskApplyBusy)}${button("稍后处理", "v2-review-defer", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}`, "quiet", lowRiskApplyBusy)}</div></section>`;
    }).join("");
    const commitLabel = isProjectClosure ? "确认结束项目" : isProjectStructure ? "确认更新项目" : isProjectCreation ? "确认创建项目" : isMiniProjectRestructure ? "确认整理结构" : isMiniProjectClosure ? "确认完成 MiniProject" : isReasonedLifecycle ? (reasonedLifecycleOperation!.payload.action === "CANCEL" ? "确认取消事项" : "确认重新打开") : isOwnershipChange ? "确认调整主归属" : "确认应用";
    const commitAction = isProjectClosure ? "v2-project-closure-commit" : isProjectStructure ? "v2-project-structure-commit" : isProjectCreation ? "v2-project-creation-commit" : isMiniProjectRestructure ? "v2-mini-project-restructure-commit" : isMiniProjectClosure ? "v2-mini-project-closure-commit" : isReasonedLifecycle ? "v2-reasoned-lifecycle-commit" : isOwnershipChange ? "v2-ownership-commit" : "v2-proposal-commit";
    const commitBusy = (isProjectCreation && model.v2ProjectCreationCommitBusy === true) || (isMiniProjectRestructure && model.v2StructureCommitBusy === true) || (isOwnershipChange && model.v2OwnershipCommitBusy === true) || ((isMiniProjectClosure || isReasonedLifecycle) && model.v2LifecycleCommitBusy === true);
    const resolutionLabel = recoveryOriginalCommit ? "恢复到安全状态" : pendingOriginalCommit ? "继续原修改" : commitLabel;
    const primaryResolution = canCommit
      ? `<div class="actions review-primary-action">${button(resolutionLabel, commitAction, `${record.proposal.proposalId}|${record.updatedAt}${isReasonedLifecycle ? `|${reasonedLifecycleOperation!.payload.action}` : ""}`, recoveryOriginalCommit ? "danger" : "primary", commitBusy)}</div>`
      : canOwnershipUndo ? `<div class="actions">${button("撤销主归属变化", "v2-ownership-undo", originalCommit.semanticCommitId, "danger", model.v2OwnershipCommitBusy === true)}</div>`
      : canProjectCreationUndo ? `<div class="actions">${button(model.v2ProjectCreationCommitBusy ? "正在安全撤销…" : "撤销项目创建", "v2-project-creation-undo", originalCommit.semanticCommitId, "danger", model.v2ProjectCreationCommitBusy === true)}</div>`
      : canProjectClosureUndo ? `<div class="actions">${button("撤销结束项目", "v2-project-closure-undo", originalCommit.semanticCommitId, "danger")}</div>`
      : canProjectStructureUndo ? `<div class="actions">${button("撤销项目更新", "v2-project-structure-undo", originalCommit.semanticCommitId, "danger")}</div>`
      : canMiniProjectRestructureUndo ? `<div class="actions">${button(model.v2StructureCommitBusy ? "正在安全撤销…" : "撤销结构整理", "v2-mini-project-restructure-undo", originalCommit.semanticCommitId, "danger", model.v2StructureCommitBusy === true)}</div>`
      : canLifecycleUndo ? `<div class="actions">${button(reasonedLifecycleOperation!.payload.action === "CANCEL" ? "撤销取消" : "撤销重新打开", "v2-lifecycle-undo", originalCommit.semanticCommitId, "danger", model.v2LifecycleCommitBusy === true)}</div>`
      : canUndo ? `<div class="actions">${button("撤销本次应用", "v2-proposal-undo", originalCommit.semanticCommitId, "danger")}</div>`
      : "";
    const stateNotice = miniProjectClosureBlockedByOtherGroups
      ? "还有其他修改没有决定；请先逐项选择审阅、不采用或稍后处理，再完成这个 MiniProject。"
      : projectCreationUndoCommit?.status === "RECOVERY_REQUIRED"
      ? "自动撤销没有完成；用户内容未被删除，请从恢复入口继续。"
      : [ownershipUndoCommit, projectClosureUndoCommit, projectStructureUndoCommit, miniProjectRestructureUndoCommit, lifecycleUndoCommit].some((commit) => commit?.status === "FAILED")
        ? "撤销因后续变化已安全停止，没有覆盖当前内容。"
        : originalCommit?.status === "UNDONE"
          ? "本次修改已经撤销；历史记录仍然保留。"
          : recoveryOriginalCommit
            ? "上次修改没有完整收口。请沿用同一恢复记录恢复到安全状态，不要创建重复修改。"
            : pendingOriginalCommit
              ? "原修改已经开始。继续时会沿用原记录，并跳过已经完成的步骤。"
              : canCommit
                ? "上一步只是确认方案。点击下方按钮后才会重新检查并正式应用。"
            : applied
              ? "本次修改已正式应用。"
              : failed
                ? isProjectClosure
                  ? "项目和正文没有变化；如需继续，请重新发起结束项目。"
                  : "正式内容没有变化；如需继续，请重新发起这项操作。"
                : stale
                  ? isProjectClosure
                    ? "项目当前状态已经变化；这次没有结束项目。请重新发起结束项目。"
                    : "当前内容已经变化；这次没有应用。请重新检查后再发起。"
              : "审阅方案只记录你的选择，尚未修改正式内容。";
    return `<article class="card proposal v2-proposal" data-narration-rule="${escapeHtml(statusNarration.source.ruleId)}">
      <div class="eyebrow">待我确认 · ${escapeHtml(userFacingRelativeDateTime(record.updatedAt))}</div>
      <h3>${escapeHtml(reviewStage)}</h3>
      <p class="lead"><strong>${escapeHtml(reviewTitle)}</strong></p>
      <section class="review-impact" data-impact-level="${highImpact ? "high" : "standard"}" aria-label="方案影响">
        ${impactSections}
      </section>
      <div class="notice">${escapeHtml(stateNotice)}</div>
      ${currentChoices}
      ${canReviseWithProvider ? `<div class="actions">${button(model.v2ProviderRevisionBusy ? "正在调整…" : "返回调整方案", "v2-provider-revise-open", `${record.proposal.proposalId}|${record.updatedAt}`, "quiet", model.v2ProviderRevisionBusy === true)}</div>` : ""}
      ${primaryResolution}
      <details class="review-evidence-details"><summary>查看完整依据</summary>
        <p><strong>完整方案：</strong>${escapeHtml(record.proposal.finalPreview)}</p>
        <p><strong>当前上下文：</strong>${escapeHtml(record.proposal.context)}</p>
        <p><strong>理解与逻辑：</strong>${escapeHtml(record.proposal.understanding)} · ${escapeHtml(record.proposal.logic)}</p>
        ${statusNarration.keyEvidence.length ? `<p class="muted">${statusNarration.keyEvidence.map((value) => escapeHtml(value)).join(" · ")}</p>` : ""}
        ${statusNarration.unknowns.length && !canProjectClosureUndo ? `<p class="uncertain">${escapeHtml(statusNarration.unknowns.join("；"))}</p>` : ""}
        ${record.proposal.groups.map((group) => `<section class="operation risk-${group.risk.toLowerCase()}"><div><code>${escapeHtml(group.groupId)}</code><span>${escapeHtml(group.disposition)} · ${escapeHtml(group.risk)}</span></div><p>${escapeHtml(group.explanation)}</p>${group.textPatches.map((patch) => `<div class="readable-diff"><del>${escapeHtml(patch.beforeText)}</del><ins>${escapeHtml(patch.afterText)}</ins></div>`).join("")}<div class="report"><strong>语义变化</strong>${group.semanticOperations.map((operation) => `<p>${escapeHtml(operation.kind)}：${escapeHtml(operation.summary)}</p>`).join("") || "<p>无</p>"}</div></section>`).join("")}
        <ul>${statusNarration.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>
        <p class="muted">规则 ${escapeHtml(statusNarration.source.ruleId)} · ${escapeHtml(record.proposal.source.kind)}${record.proposal.source.model ? ` · ${escapeHtml(record.proposal.source.model)}` : ""} · ${escapeHtml(record.proposal.status)}</p>
      </details>
    </article>`;
  };
  const currentV2 = v2.filter((record) => !["APPLIED", "REJECTED", "STALE", "FAILED"].includes(record.proposal.status));
  const historicalV2 = v2.filter((record) => ["APPLIED", "REJECTED", "STALE", "FAILED"].includes(record.proposal.status));
  const currentV2Cards = currentV2.map(renderV2Card).join("");
  const historicalV2Cards = historicalV2.length
    ? `<details class="review-history"><summary>历史记录（${historicalV2.length}）</summary><p class="muted">已应用、未能应用、已撤销、已失效或不再采用的方案保留在这里，不影响当前判断。</p><div class="cards">${historicalV2.map(renderV2Card).join("")}</div></details>`
    : "";
  const emptyCurrentReview = empty(
    "当前没有需要审阅的方案",
    model.v2ProviderAvailable || model.agent.enabled
      ? "历史记录已收起；你可以整理当前页，或从“待整理”继续处理。"
      : "当前没有需要处理的方案；状态、期限和恢复等基础功能仍可使用。",
  );
  if (open.length === 0 && currentV2.length === 0 && !v2LoadError) return `${tabs}${emptyCurrentReview}${historicalV2Cards}`;
  return `${tabs}${v2LoadError}<div class="cards">${currentV2Cards}${open
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
    .join("")}</div>${historicalV2Cards}`;
}

function renderProjectContextRecovery(
  model: UiModel,
  card: PluginProjectReentryCard,
  state: PluginProjectContextRecoveryState | undefined,
): string {
  const requestValue = `${card.project.objectId}|${card.project.version}`;
  if (!state) {
    return model.v2ProviderAvailable
      ? `<section class="copilot-context"><div class="actions">${button("恢复上下文", "v2-project-context-recovery", requestValue, "quiet")}</div></section>`
      : "";
  }
  if (state.expectedVersion !== card.project.version) {
    return `<section class="copilot-context"><div class="error"><strong>这份整理结果已过期。</strong><span>项目内容已经变化；旧结果没有继续显示或执行动作。</span></div>${model.v2ProviderAvailable ? `<div class="actions">${button("根据当前内容重新整理", "v2-project-context-recovery", requestValue, "quiet")}</div>` : ""}</section>`;
  }
  if (state.status === "loading") {
    return `<section class="copilot-context" aria-live="polite"><div class="eyebrow">正在整理项目上下文</div><p>正在提炼这次继续工作真正需要的信息。项目和正文不会因此改变。</p><div class="actions">${button("正在整理…", "v2-project-context-recovery", requestValue, "quiet", true)}</div></section>`;
  }
  if (state.status === "error") {
    return `<section class="copilot-context"><div class="error"><strong>这次上下文整理没有完成。</strong><span>现有项目状态没有变化，你仍可使用上方入口继续工作或稍后重试。</span></div>${model.v2ProviderAvailable ? `<div class="actions">${button("重新整理", "v2-project-context-recovery", requestValue, "quiet")}</div>` : ""}<details><summary>查看错误详情</summary><p class="muted">${escapeHtml(state.message)}</p></details></section>`;
  }
  const output = state.result.output;
  const facts = output.facts.length
    ? `<section><h4>已确认事实</h4><ul>${output.facts.slice(0, 4).map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul></section>`
    : "";
  const inferences = output.inferences.length
    ? `<section><h4>值得留意</h4><ul>${output.inferences.slice(0, 2).map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul></section>`
    : "";
  const unknowns = output.unknowns.length
    ? `<section><h4>继续前仍需确认</h4><ul>${output.unknowns.slice(0, 2).map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`
    : "";
  const suggestions = output.suggestedChanges.length
    ? `<section><h4>可选调整</h4><ul>${output.suggestedChanges.map(({ summary }) => `<li>${escapeHtml(summary)} <small>如需修改，会先单独审阅</small></li>`).join("")}</ul></section>`
    : "";
  const route = resolveProjectContextRecoveryRoute(state, card);
  const action = route
    ? button(output.nextAction?.label ?? route.label, route.action, route.value, "primary")
    : output.nextActionEligible
      ? "<span class=\"muted\">建议动作已失效；请基于上方当前正式状态操作。</span>"
      : "";
  const interactionId = state.result.interactionId;
  const feedback = interactionId ? [
    ["有帮助", "HELPFUL"],
    ["不准确", "INACCURATE"],
    ["太多了", "TOO_MUCH"],
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
  return `<section class="copilot-context" data-project-context-recovery="ready">
    <div class="eyebrow">上下文恢复 · 不改变项目</div>
    <p class="lead">${escapeHtml(output.summary)}</p>
    ${inferences}${unknowns}
    <div class="actions">${action}${model.v2ProviderAvailable ? button(state.userDisposition === "DO_NOT_REPEAT" ? "本次会话已暂停生成" : "重新生成", "v2-project-context-recovery", requestValue, "quiet", state.userDisposition === "DO_NOT_REPEAT") : ""}</div>
    ${feedback ? `<details><summary>这次建议怎么样？</summary><div class="actions">${feedback}</div>${feedbackStatus}</details>` : ""}
    <details><summary>查看依据与可选调整</summary>${facts}${suggestions}<p class="muted">${escapeHtml(`${output.provenance.generatedAt}`)}</p></details>
  </section>`;
}

function renderTargetedProjectLanding(
  model: UiModel,
  card: PluginProjectReentryCard,
  recoveryState: PluginProjectContextRecoveryState | undefined,
): string {
  const { project, projection } = card;
  const structure = project.objectType === "PROJECT" ? project.projectStructure : undefined;
  if (!structure) return "";
  const focuses = structure.currentFocuses.slice(0, 3);
  const outcomes = structure.objectives
    .filter(({ priority }) => priority === "PRIMARY")
    .concat(structure.objectives.filter(({ priority }) => priority !== "PRIMARY"))
    .slice(0, 3);
  const currentFocus = focuses.length
    ? `<ol>${focuses.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ol>`
    : "<p>暂未确定；可以先恢复上下文或调整项目。</p>";
  const expectedOutcomes = outcomes.length
    ? `<ul>${outcomes.map((item) => `<li><strong>${escapeHtml(item.text)}</strong>${item.successEvidence.length ? `<span class="muted">完成时可核对：${escapeHtml(item.successEvidence.slice(0, 2).join("；"))}</span>` : ""}</li>`).join("")}</ul>`
    : "<p>尚未明确；可以在调整项目时补充。</p>";
  const primary = card.primaryRoute
    ? button("开始当前推进", "v2-project-worksite-open", `${project.objectId}|${project.version}`, "primary")
    : "";
  const recovery = renderProjectContextRecovery(model, card, recoveryState);
  const detailedObjectives = structure.objectives.length
    ? `<section><h4>目标和完成证据</h4><ul>${structure.objectives.map((item) => `<li>${escapeHtml(item.text)}${item.successEvidence.length ? ` · ${escapeHtml(item.successEvidence.join("；"))}` : ""}</li>`).join("")}</ul></section>`
    : "";
  const detailedDeliverables = structure.deliverables.length
    ? `<section><h4>成果与验收</h4><ul>${structure.deliverables.map((item) => `<li>${escapeHtml(item.text)} · ${escapeHtml(item.acceptance)}</li>`).join("")}</ul></section>`
    : "";
  const detailedStages = structure.workStages.length
    ? `<section><h4>推进阶段</h4><ul>${structure.workStages.map((item) => `<li>${escapeHtml(item.name)}：${escapeHtml(item.statusDescription)}</li>`).join("")}</ul></section>`
    : "";
  return `<article class="card reentry project-landing" data-project-landing="${escapeHtml(project.objectId)}">
    <div class="eyebrow">项目已就绪 · ${escapeHtml(userFacingRelativeDateTime(projection.lastFormalChangeAt))}</div>
    <h2>${escapeHtml(project.text)}</h2>
    <section class="project-landing-status"><h3>当前状态</h3><p class="lead">${escapeHtml(structure.currentSummary || projection.summary)}</p></section>
    <div class="project-landing-grid">
      <section><h3>现在先做什么</h3>${currentFocus}</section>
      <section><h3>预期成果</h3>${expectedOutcomes}</section>
    </div>
    <section class="project-landing-origin"><h3>来源与背景</h3><p>本次创建没有移动或改写来源正文；项目结构来自你刚刚确认的最终阅读结果。</p></section>
    <section class="project-landing-actions"><h3>Task Copilot</h3><p class="muted">需要时恢复上下文、调整项目，或查看完整结构；这些入口不会绕过审阅和撤销边界。</p>
      <div class="actions">${primary}${project.lifecycle === "OPEN" ? button("调整项目", "v2-project-operation-router-open", `${project.objectId}|${project.version}`, "quiet") : ""}</div>
      ${recovery}
      <details class="project-landing-structure"><summary>查看完整结构</summary>${detailedObjectives}${detailedDeliverables}${detailedStages}</details>
    </section>
  </article>`;
}

function renderReentry(model: UiModel): string {
  if (model.v2ReentryLoadError) {
    return `<section><h2>继续项目</h2><div class="error"><strong>暂时无法读取项目现状。</strong><span>没有把读取失败显示成空项目，也没有生成猜测性的下一步。</span><details><summary>查看错误详情</summary><p class="muted">${escapeHtml(model.v2ReentryLoadError)}</p></details></div></section>`;
  }
  if (model.v2ProjectReentryCards) {
    if (!model.v2ProjectReentryCards.length) {
      return empty("暂无可继续的项目", "先创建项目；这里会显示当前状态和最值得继续的入口。");
    }
    const visibleCards = model.v2ReentryTargetObjectId
      ? model.v2ProjectReentryCards.filter(({ project }) => project.objectId === model.v2ReentryTargetObjectId)
      : model.v2ProjectReentryCards;
    if (model.v2ReentryTargetObjectId && visibleCards.length === 0) {
      return `<section><h2>继续项目</h2><div class="error"><strong>当前项目的进入信息已经变化。</strong><span>没有自动切换到其他项目；请返回项目页面重新打开。</span></div><div class="actions">${button("查看全部项目", "v2-reentry-show-all", undefined, "quiet")}</div></section>`;
    }
    const cards = visibleCards.map((card) => {
      const { project, projection } = card;
      const recoveryState = model.v2ProjectContextRecovery?.[project.objectId];
      const targetedLanding = model.v2ReentryTargetObjectId === project.objectId
        && projection.safetyState === "CLEAN"
        && project.lifecycle === "OPEN"
        && project.objectType === "PROJECT"
        && project.projectStructure;
      if (targetedLanding) return renderTargetedProjectLanding(model, card, recoveryState);
      const evidence = projection.keyEvidence.length
        ? `<p class="muted">${projection.keyEvidence.map((value) => escapeHtml(value)).join(" · ")}</p>`
        : "";
      const unknown = projection.unknowns.length
        ? `<p class="muted">${escapeHtml(projection.unknowns.join("；"))}</p>`
        : "";
      const primary = card.primaryRoute
        ? projection.safetyState === "CLEAN"
          && project.lifecycle === "OPEN"
          && project.objectType === "PROJECT"
          && project.projectStructure
          ? button("打开项目", "v2-project-landing-open", `${project.objectId}|${project.version}`, "primary")
          : button(card.primaryRoute.label, card.primaryRoute.action, card.primaryRoute.value, projection.safetyState === "RECOVERY_REQUIRED" ? "danger" : "primary")
        : "";
      const shortcuts = projection.safetyState === "CLEAN" && project.lifecycle === "OPEN"
        ? `${button("调整项目", "v2-project-operation-router-open", `${project.objectId}|${project.version}`, "quiet")}${!card.focused ? button("加入当前关注", "v2-focus-add", `${project.objectId}|${project.version}`, "quiet") : ""}`
        : "";
      const moreActions = `${card.entryPointRoutes.map((route) => button(route.label, route.action, route.value, "quiet")).join("")}${shortcuts}`;
      const recoveryDraft = renderProjectContextRecovery(model, card, recoveryState);
      return `<article class="card reentry" data-reentry-sufficiency="${projection.sufficiency}">
        <div class="eyebrow">${projection.safetyState === "CLEAN" ? (projection.sufficiency === "SUFFICIENT" ? "当前停留点" : "需要恢复上下文") : "安全状态优先"} · ${escapeHtml(userFacingRelativeDateTime(projection.lastFormalChangeAt))}</div>
        <h2>${escapeHtml(projection.headline)}</h2>
        <p class="lead">${escapeHtml(projection.summary)}</p>
        ${evidence}${unknown}
        <div class="actions">${primary}</div>
        ${recoveryDraft}
        ${moreActions ? `<details><summary>更多操作</summary><div class="actions">${moreActions}</div></details>` : ""}
        <details><summary>为什么现在显示它</summary><ul>${projection.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>${projection.relatedContextCount ? `<p class="muted">${projection.relatedContextCount} 个普通关联仅作为背景，未升级为进入点。</p>` : ""}</details>
      </article>`;
    }).join("");
    return `<section><h2>继续项目</h2><p class="muted">先看当前状态和最值得继续的入口；需要时再展开其他操作和依据。</p>${model.v2ReentryTargetObjectId ? `<div class="actions">${button("查看全部项目", "v2-reentry-show-all", undefined, "quiet")}</div>` : ""}<div class="cards">${cards}</div></section>`;
  }
  if (model.v2Objects) {
    const projects = model.v2Objects.filter((object) => object.objectType === "PROJECT");
    if (!projects.length) return empty("暂无可继续的项目", "先创建项目；这里会显示当前状态、关联和下一步。");
    const objectById = new Map(model.v2Objects.map((object) => [object.objectId, object]));
    const nowItems = model.v2NowWork ? [...model.v2NowWork.focus, ...model.v2NowWork.next, ...model.v2NowWork.waitingReview] : [];
    const focused = new Set(model.v2NowWork?.focus.map((item) => item.objectId) ?? []);
    const cards = projects.map((project) => {
      const children = (model.v2PrimaryOwnerships ?? []).filter((ownership) => ownership.ownerObjectId === project.objectId).map((ownership) => objectById.get(ownership.childObjectId)).filter((object): object is V2ManagedObject => object !== undefined);
      const related = (model.v2Associations ?? []).filter((association) => association.sourceObjectId === project.objectId || association.targetObjectId === project.objectId).map((association) => objectById.get(association.sourceObjectId === project.objectId ? association.targetObjectId : association.sourceObjectId)).filter((object): object is V2ManagedObject => object !== undefined);
      const nowItem = nowItems.find((item) => item.objectId === project.objectId);
      const condition = project.condition.kind === "ACTIONABLE" ? "可行动" : project.condition.kind === "WAITING" ? `等待：${project.condition.waitingFor}；期待 ${project.condition.expectedResult}` : project.condition.kind === "BLOCKED" ? `阻塞：${project.condition.reason}` : `暂停：${project.condition.reason}`;
      const lifecycle = project.lifecycle === "OPEN" ? "进行中" : project.lifecycle === "COMPLETED" ? "已完成" : "已取消";
      const closure = project.closure && "actualResult" in project.closure ? `<section><h3>完成回顾</h3><p>${escapeHtml(project.closure.actualResult)}</p></section>` : "";
      const primary = nowItem?.primaryAnchorExternalId
        ? button("打开项目", "v2-open-primary-anchor", nowItem.primaryAnchorExternalId, "primary")
        : project.lifecycle === "OPEN" && !focused.has(project.objectId)
          ? button("加入当前关注", "v2-focus-add", `${project.objectId}|${project.version}`, "primary")
          : "";
      const moreActions = `${project.lifecycle === "OPEN" ? button("调整项目", "v2-project-operation-router-open", `${project.objectId}|${project.version}`, "quiet") : ""}${project.lifecycle === "OPEN" ? button("更新状态", "v2-condition-open", `${project.objectId}|${project.version}`, "quiet") : ""}${project.lifecycle === "OPEN" && !focused.has(project.objectId) && nowItem?.primaryAnchorExternalId ? button("加入当前关注", "v2-focus-add", `${project.objectId}|${project.version}`, "quiet") : ""}`;
      return `<article class="card reentry"><div class="eyebrow">${escapeHtml(lifecycle)}</div><h2>${escapeHtml(project.text)}</h2><p class="lead">${escapeHtml(condition)}</p>${renderV2ProjectStructure(project)}${children.length ? `<section><h3>当前主归属事项</h3><ul>${children.map((child) => `<li>${escapeHtml(objectTypeLabel(child.objectType))} · ${escapeHtml(child.text)}</li>`).join("")}</ul></section>` : ""}${related.length ? `<section><h3>相关事项</h3><ul>${related.map((object) => `<li>${escapeHtml(objectTypeLabel(object.objectType))} · ${escapeHtml(object.text)}</li>`).join("")}</ul></section>` : ""}${closure}<section class="restore"><h3>建议从这里继续</h3><p>${escapeHtml(nowItem?.reason ?? (project.lifecycle === "OPEN" ? "查看当前推进和相关事项，明确下一步后再决定是否加入当前关注。" : "查看完成回顾与关联成果；需要继续时先审阅重开影响。"))}</p></section><div class="actions">${primary}</div>${moreActions ? `<details><summary>更多操作</summary><div class="actions">${moreActions}</div></details>` : ""}</article>`;
    }).join("");
    return `<section><h2>继续项目</h2><p class="muted">先看当前状态和最值得继续的入口；需要时再展开其他操作和依据。</p><div class="cards">${cards}</div></section>`;
  }
  if (!model.reentry) return empty("暂无可继续的项目", "创建项目后，这里会显示当前状态和最值得继续的入口。");
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
  const guidance = `<section class="card"><div class="eyebrow">正式修改与恢复</div><h2>最近修改与恢复</h2><p>这里按你的操作显示已经应用、尚未完成、需要恢复或已撤销的修改。</p><details><summary>维护与恢复说明</summary><p>备份、完整性校验和恢复点共用同一安全写入链；产品入口位于“更多 → 备份与恢复”。尚未完成的修改必须沿用原恢复记录，不能新建重复操作。</p><p class="muted">技术权威：SQLite 单一状态源，Local Service 单一写入口；Audit、Receipt 与 SemanticCommit 只保留为诊断和审计证据。V1 Recovery Bundle 只用于只读迁移和历史兼容。</p></details></section>`;
  if (!changes.length) return `${guidance}${empty("还没有正式修改", "确认修改内容不等于已经应用；只有正式应用后才会出现在这里。")}`;
  return `${guidance}<section><h2>最近修改</h2><div class="cards">${changes.map((change) => renderRecentChange(change)).join("")}</div></section>`;
}

function objectTypeLabel(value: string): string {
  return ({
    AREA: "领域",
    PROJECT: "项目",
    MINI_PROJECT: "小项目",
    TASK: "任务",
    DECISION: "决定",
    OUTPUT: "成果",
    RESOURCE: "资料",
  } as Record<string, string>)[value] ?? "普通内容";
}

function objectLifecycleLabel(value: string): string {
  return ({
    OPEN: "进行中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    ARCHIVED: "已归档",
  } as Record<string, string>)[value] ?? "状态待确认";
}

function conditionKindLabel(value: string): string {
  return ({
    ACTIONABLE: "可以行动",
    WAITING: "等待中",
    BLOCKED: "受阻",
    PAUSED: "已暂停",
  } as Record<string, string>)[value] ?? "状态待确认";
}

function associationKindLabel(value: string): string {
  return value === "RELATED" ? "相关" : value;
}

function associationStatusLabel(value: string): string {
  return value === "ACTIVE" ? "有效" : value === "REPLACED" ? "已被替换" : value === "MISSING" ? "已失效" : value;
}

function deliverableStatusLabel(value: string): string {
  return ({
    PLANNED: "计划中",
    AVAILABLE: "可用",
    ACCEPTED: "已接受",
    SUPERSEDED: "已替代",
  } as Record<string, string>)[value] ?? value;
}

function migrationPhaseLabel(value: string): string {
  return ({
    IDEA: "想法",
    DEFINING: "定义中",
    CLARIFY: "待澄清",
    PLANNED: "已计划",
    READY: "可开始",
    ACTIVE: "进行中",
    CLOSING: "收尾中",
    DORMANT: "暂不推进",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    ARCHIVED: "已归档",
    RETIRED: "已结束",
  } as Record<string, string>)[value] ?? "未明确";
}

function migrationLifecycleLabel(value: string): string {
  return ({
    OPEN: "开放",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    ARCHIVED: "已归档",
  } as Record<string, string>)[value] ?? "开放";
}

function migrationConditionLabel(value: string): string {
  return ({
    ACTIONABLE: "现在可行动",
    WAITING: "等待外部结果",
    BLOCKED: "被问题卡住",
    PAUSED: "主动暂停",
    NONE: "旧材料未明确",
  } as Record<string, string>)[value] ?? "旧材料未明确";
}

function migrationClassificationLabel(value: PluginMigrationReviewItem["classification"]): string {
  if (value === "DIRECT_BIND") return "可以按现有事实迁移";
  if (value === "NEEDS_CONFIRMATION") return "需要你补一项判断";
  if (value === "KEEP_ORDINARY") return "建议保持普通内容";
  return "请先处理材料冲突";
}

function migrationDateTimeLocal(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function renderMigrationReviewItem(item: PluginMigrationReviewItem, busy: boolean): string {
  const decision = item.decision;
  const action = decision?.action
    ?? (item.classification === "DIRECT_BIND" ? "IMPORT" : item.classification === "KEEP_ORDINARY" ? "KEEP_ORDINARY" : "DEFER");
  const objectType = decision?.action === "IMPORT" ? decision.objectType ?? item.suggestedObjectType : item.suggestedObjectType;
  const lifecycle = decision?.action === "IMPORT" ? decision.lifecycle ?? item.suggestedLifecycle : item.suggestedLifecycle;
  const condition = decision?.action === "IMPORT" ? decision.condition ?? item.suggestedCondition : item.suggestedCondition;
  const conditionKind = condition?.kind ?? "";
  const reviewNote = decision?.reviewNote ?? "";
  const token = escapeHtml(item.token);
  const option = (value: string, label: string, selected: string) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`;
  const actionOptions = `${item.classification === "STRUCTURAL_ERROR" ? "" : option("IMPORT", "迁移为正式对象", action)}${option("KEEP_ORDINARY", "保持普通内容", action)}${option("DEFER", "暂缓判断", action)}${option("EXCLUDE", "排除这项", action)}`;
  const objectTypeOptions = `<option value=""${objectType ? "" : " selected"}>请选择对象类型</option>${["TASK", "MINI_PROJECT", "PROJECT", "AREA", "DECISION", "OUTPUT"]
    .map((value) => option(value, objectTypeLabel(value), objectType ?? "")).join("")}`;
  const lifecycleOptions = ["OPEN", "COMPLETED", "CANCELLED", "ARCHIVED"]
    .map((value) => option(value, migrationLifecycleLabel(value), lifecycle ?? "")).join("");
  const lifecycleSelectOptions = `<option value=""${lifecycle ? "" : " selected"}>请选择生命周期</option>${lifecycleOptions}`;
  const conditionOptions = `<option value=""${conditionKind ? "" : " selected"}>请选择当前状态</option>${["ACTIONABLE", "WAITING", "BLOCKED", "PAUSED"]
    .map((value) => option(value, migrationConditionLabel(value), conditionKind)).join("")}`;
  const waiting = condition?.kind === "WAITING" ? condition : undefined;
  const blocked = condition?.kind === "BLOCKED" ? condition : undefined;
  const paused = condition?.kind === "PAUSED" ? condition : undefined;
  const structuralGuidance = item.classification === "STRUCTURAL_ERROR"
    ? `<p class="uncertain">这项材料存在结构冲突，不能直接迁移；可先暂缓、排除或保持普通内容，源材料修复后再重新检查。</p>`
    : "";
  return `<article class="card migration-review-item" aria-label="迁移材料 ${token}">
    <div class="eyebrow">${escapeHtml(migrationClassificationLabel(item.classification))} · 来源是${escapeHtml(objectTypeLabel(item.sourceObjectType))}</div>
    <h3>${escapeHtml(item.title)}${item.titleTruncated ? "…" : ""}</h3>
    <p class="muted">旧材料记录为：${escapeHtml(migrationPhaseLabel(item.oldPhase))} · ${escapeHtml(migrationConditionLabel(item.oldConditionKind))}</p>
    ${structuralGuidance}
    <div class="inbox-dialog">
      <label>这项如何处理<select data-field="migrationDecisionAction:${token}"${busy ? " disabled" : ""}>${actionOptions}</select></label>
      <details>
        <summary>迁移后的正式状态</summary>
        <p class="muted">仅在“迁移为正式对象”时使用；这里不会修改原 Recovery Bundle。</p>
        <label>对象类型<select data-field="migrationDecisionObjectType:${token}"${busy ? " disabled" : ""}>${objectTypeOptions}</select></label>
        <label>生命周期<select data-field="migrationDecisionLifecycle:${token}"${busy ? " disabled" : ""}>${lifecycleSelectOptions}</select></label>
        <label>当前状态<select data-field="migrationDecisionCondition:${token}"${busy ? " disabled" : ""}>${conditionOptions}</select></label>
        <details><summary>等待状态需要的细节</summary>
          <label>等待谁或什么<input data-field="migrationDecisionWaitingFor:${token}" maxlength="4000" value="${escapeHtml(waiting?.waitingFor ?? "")}"${busy ? " disabled" : ""}></label>
          <label>期待结果<input data-field="migrationDecisionExpectedResult:${token}" maxlength="4000" value="${escapeHtml(waiting?.expectedResult ?? "")}"${busy ? " disabled" : ""}></label>
        </details>
        <details><summary>卡住或暂停需要的细节</summary>
          <label>具体原因<input data-field="migrationDecisionReason:${token}" maxlength="4000" value="${escapeHtml(blocked?.reason ?? paused?.reason ?? "")}"${busy ? " disabled" : ""}></label>
        </details>
        <label>复查时间（等待必填，暂停可选）<input type="datetime-local" step="60" aria-describedby="migration-review-local-time" data-field="migrationDecisionReviewAt:${token}" value="${escapeHtml(migrationDateTimeLocal(waiting?.reviewAt ?? paused?.reviewAt))}"${busy ? " disabled" : ""}></label>${localTimeHint("migration-review-local-time")}
      </details>
      <label>判断依据${item.classification === "DIRECT_BIND" ? "（完整沿用全部建议时可不填；改映射必填）" : "（必填）"}<textarea data-field="migrationDecisionNote:${token}" maxlength="4000" placeholder="用一句话说明为什么这样处理"${busy ? " disabled" : ""}>${escapeHtml(reviewNote)}</textarea></label>
      <div class="actions">${button(decision ? "更新本项判断" : "保存本项判断", "migration-review-save", item.token, "quiet", busy)}</div>
      ${decision ? `<p class="action-feedback success">本项判断已保存；还没有创建迁移计划。</p>` : ""}
    </div>
  </article>`;
}

function renderMigrationExecution(model: UiModel): string {
  const state = model.v2MigrationExecution ?? { status: "idle" };
  if (state.status === "idle") return "";
  const available = model.v2MigrationExecutionAvailable === true;
  const message = state.message ? `<p aria-live="polite">${escapeHtml(state.message)}</p>` : "";
  if (state.status === "selecting-material" || (state.status === "error" && !state.batchToken)) {
    return `<section class="card" aria-label="准备迁移批次"><div class="eyebrow">只读重新核对 · 正式变化 0</div><h3>重新选择本计划的材料</h3>${message}<label>选择同一份 Recovery Bundle<input type="file" accept="application/json,.json" data-field="migrationImportBundleFile"${available ? "" : " disabled"}></label><div class="actions">${button("放弃本批准备", "migration-import-clear", undefined, "quiet")}${button(state.status === "error" ? "重新核对材料" : "核对材料与待导入范围", "migration-import-material", undefined, "primary", !available)}</div></section>`;
  }
  if (state.status === "loading-material" || state.status === "creating-recovery-point" || state.status === "importing" || state.status === "verifying" || state.status === "undoing" || state.status === "activating") {
    return `<section class="card" aria-live="polite"><div class="eyebrow">安全操作进行中</div><h3>${state.status === "loading-material" ? "核对迁移材料" : state.status === "creating-recovery-point" ? state.recoveryPointMode === "REUSED" ? "校验计划恢复基线" : "创建并校验计划恢复基线" : state.status === "importing" ? "导入本批" : state.status === "verifying" ? "验证本批" : state.status === "undoing" ? "撤销本批" : "启用 V2"}</h3>${message}</section>`;
  }
  if (state.status === "material-ready") {
    const items = state.items ?? [];
    return `<section class="card" aria-label="选择迁移批次"><div class="eyebrow">材料与计划一致 · 正式变化 0</div><h3>选择本批范围</h3>${message}<div class="cards">${items.map((item) => `<label class="card compact"><input type="checkbox" data-field="migrationImportItem:${escapeHtml(item.token)}" value="${escapeHtml(item.token)}"${available ? "" : " disabled"}><span><strong>${escapeHtml(item.title)}${item.titleTruncated ? "…" : ""}</strong><br><span class="muted">来源是${escapeHtml(objectTypeLabel(item.sourceObjectType))}</span></span></label>`).join("")}</div><p class="muted">只有选中项会进入本批；计划恢复基线校验通过前不会创建正式对象。</p><div class="actions">${button("放弃本批准备", "migration-import-clear", undefined, "quiet")}${button(state.recoveryPointMode === "REUSED" ? "校验本计划恢复基线" : "创建本计划恢复基线", "migration-import-recovery", undefined, "primary", !available || !items.length)}</div></section>`;
  }
  if (state.status === "ready-to-import" || state.status === "import-uncertain") {
    const uncertain = state.status === "import-uncertain";
    return `<section class="card" aria-label="最终确认迁移批次"><div class="eyebrow">${uncertain ? "结果待确认 · 相同批次重试" : "恢复点校验通过 · HIGH"}</div><h3>${uncertain ? "先以台账为准" : `确认导入 ${escapeHtml(state.selectedCount ?? 0)} 项`}</h3>${message}<label><input type="checkbox" data-field="migrationImportConfirm"${available ? "" : " disabled"}> 我确认只导入上述已审阅范围；导入后仍需逐项验证，尚不会启用 V2。</label><div class="actions">${uncertain ? "" : button("放弃本批准备", "migration-import-clear", undefined, "quiet")}${button(uncertain ? "用相同批次安全重试" : "导入本批", "migration-import-commit", undefined, "danger", !available)}</div></section>`;
  }
  if (state.status === "imported") {
    return `<section class="card"><div class="eyebrow">本批已导入 · 尚未验证</div><h3>${escapeHtml(state.importedCount ?? 0)} 项等待验证</h3>${message}${state.batchToken ? button("验证本批", "migration-batch-verify", state.batchToken, "primary", !available) : ""}</section>`;
  }
  if (state.status === "verified") {
    return `<section class="card"><div class="eyebrow">本批验证通过 · 尚未启用</div><h3>${escapeHtml(state.importedCount ?? 0)} 项投影完整</h3>${message}${state.batchToken ? button("准备安全撤销", "migration-batch-undo-open", state.batchToken, "quiet", !available) : ""}</section>`;
  }
  if (state.status === "undo-confirm") {
    return `<section class="card"><div class="eyebrow">撤销前最终确认 · HIGH</div><h3>安全撤销本批</h3>${message}<label><input type="checkbox" data-field="migrationUndoConfirm"${available ? "" : " disabled"}> 我确认只撤销本批未被后续修改或引用的对象；审阅、验证与审计证据保留。</label>${button("确认撤销本批", "migration-batch-undo", undefined, "danger", !available)}</section>`;
  }
  if (state.status === "undone") {
    return `<section class="card"><div class="eyebrow">本批已安全撤销</div><h3>正式对象已回到导入前范围</h3>${message}</section>`;
  }
  if (state.status === "undo-uncertain") {
    return `<section class="card"><div class="eyebrow">撤销结果待确认</div><h3>请先刷新迁移台账</h3>${message}<p class="muted">不要重复撤销或创建新批次；迁移台账会在重新载入后显示正式结论。</p></section>`;
  }
  if (state.status === "activation-confirm" || state.status === "activation-uncertain") {
    const uncertain = state.status === "activation-uncertain";
    return `<section class="card"><div class="eyebrow">${uncertain ? "启用结果待确认" : "迁移最终切换 · HIGH"}</div><h3>${uncertain ? "先以迁移台账为准" : "启用 V2 并结束 V1 日常运行"}</h3>${message}<label><input type="checkbox" data-field="migrationActivateConfirm"${available ? "" : " disabled"}> 我确认所有计划导入项都已验证；启用后 V1 只保留为只读历史与恢复证据，不建立双写。</label>${button(uncertain ? "对同一计划安全重试" : "确认启用 V2", "migration-activate", undefined, "danger", !available)}</section>`;
  }
  if (state.status === "activated") {
    return `<section class="card"><div class="eyebrow">迁移已完成</div><h3>V2 已启用</h3>${message}<p class="muted">日常工作继续留在 Logseq；旧 V1 状态不再作为当前运行权威。</p></section>`;
  }
  return `<section class="card"><div class="eyebrow">本批需要检查</div><h3>以迁移台账为准</h3>${message}</section>`;
}

function renderMigration(model: UiModel): string {
  if (model.v2MigrationLoadError) return `<section><h2>V1 → V2 迁移</h2><div class="error"><strong>迁移状态不可用：</strong>${escapeHtml(model.v2MigrationLoadError)}<span>没有执行扫描、导入或状态切换。</span></div></section>`;
  const runs = model.v2MigrationRuns ?? [];
  const activated = runs.some(({ status }) => status === "ACTIVATED");
  const guidance = activated
    ? `<section class="card"><div class="eyebrow">一次性迁移已完成 · 只读历史</div><h2>V2 已启用</h2><p>日常工作继续留在 Logseq；V1 只保留为只读历史与恢复证据，不再接受新的扫描、导入、撤销或启用操作。</p><p class="muted">下方台账仅用于说明这次交接发生了什么。需要整库回到旧快照时，请使用“更多 → 备份与恢复”。</p></section>`
    : `<section class="card"><div class="eyebrow">小批次 · 可验证 · 可恢复</div><h2>V1 → V2 迁移</h2><p>迁移只使用你明确选择的只读 Recovery Bundle；不会自动扫描知识库，也不会让 V1 与 V2 双写。</p><p class="muted">先只读检查材料，再逐项审阅；整项计划固定一个导入前恢复基线，每批导入前都重新校验它，之后才可导入、验证和启用。内部运行标识、文件摘要与恢复点编号只留在技术证据中。</p></section>`;
  const scan = model.v2MigrationScan ?? { status: "idle" };
  const scanInput = `<label>选择 V1 Recovery Bundle<input type="file" accept="application/json,.json" data-field="migrationRecoveryBundleFile"${scan.status === "loading" || model.v2MigrationScanAvailable !== true ? " disabled" : ""}></label>`;
  const previewButtonLabel = scan.previewStatus === "loading"
    ? "正在创建迁移计划…"
    : scan.previewStatus === "uncertain"
      ? "用相同判断重试创建计划"
      : "保存审阅并创建迁移计划";
  const reviewGuidance = scan.decisionsComplete
    ? scan.previewStatus === "uncertain"
      ? "上次请求结果尚未确认；如果下方已经出现新计划，无需重试。"
      : "创建计划会写入逐项审阅与迁移台账，但不会导入正式对象；导入仍需下一次明确确认和恢复点。"
    : scan.items?.length
      ? "请先保存每一项判断；全部完成后才会出现创建迁移计划入口。"
      : "这份材料没有可审阅的正式对象，不需要创建迁移计划。";
  const scanPanel = activated
    ? ""
    : model.v2MigrationScanAvailable !== true
    ? `<section class="card"><h3>检查迁移材料</h3><p>当前知识库的本地运行环境尚未就绪；正文仍可正常编辑，没有读取任何文件。</p></section>`
    : scan.status === "loading"
      ? `<section class="card" aria-live="polite"><h3>正在检查迁移材料</h3><p>${escapeHtml(scan.message ?? "只读扫描进行中；正式状态不会变化。")}</p></section>`
      : scan.status === "ready" && scan.counts
        ? `<section class="card" aria-label="迁移材料只读扫描结果"><div class="eyebrow">只读扫描完成 · 正式变化 0</div><h3>这份材料包含 ${escapeHtml(scan.counts.total)} 项</h3><p>${escapeHtml(scan.counts.directBind)} 项初步可直接迁移 · ${escapeHtml(scan.counts.needsConfirmation)} 项需要确认 · ${escapeHtml(scan.counts.keepOrdinary)} 项建议保持普通内容 · ${escapeHtml(scan.counts.structuralError)} 项需先处理冲突</p><p aria-live="polite">${escapeHtml(scan.message ?? "尚未创建迁移计划。")}</p><p class="muted">材料仅保留在当前窗口会话内；重新载入、切换知识库或放弃都会清空。每项判断先留在当前会话，创建计划时系统会重新校验全部材料。</p>${scan.items?.length ? `<div class="cards migration-review-list">${scan.items.map((item) => renderMigrationReviewItem(item, scan.previewStatus !== "idle")).join("")}</div>` : ""}<div class="actions wrap">${button("放弃这份材料", "migration-scan-clear", undefined, "quiet", scan.previewStatus === "loading")}${scan.decisionsComplete ? button(previewButtonLabel, "migration-review-preview", undefined, "primary", scan.previewStatus === "loading") : ""}</div><p class="muted">${escapeHtml(reviewGuidance)}</p>${scan.previewStatus === "uncertain" ? `<p class="uncertain" role="status">无法确认迁移计划是否已写入台账；下方台账是当前权威。若没有新计划，可用相同判断重试，或放弃后重新检查。</p>` : ""}</section>`
        : `<section class="card"><h3>检查迁移材料</h3>${scan.status === "idle" && scan.message ? `<p class="action-feedback success" aria-live="polite">${escapeHtml(scan.message)}</p>` : ""}<p>这里只做只读校验与分类，不会创建迁移计划或改变正式事项。</p>${scanInput}${button(scan.status === "error" ? "重新检查" : "只读检查", "migration-scan-local", undefined, "primary")}${scan.status === "error" ? `<p class="diagnostic-error" role="alert">${escapeHtml(scan.message ?? "迁移材料暂时无法检查。")}</p>` : ""}</section>`;
  const executionPanel = activated ? "" : renderMigrationExecution(model);
  if (!runs.length) return `${guidance}${scanPanel}${executionPanel}${empty("还没有迁移计划", "只读扫描不会创建计划；完成逐项审阅前不会写入正式状态。")}`;
  const statusLabel = (status: (typeof runs)[number]["status"]): string => {
    if (status === "PREVIEWED") return "等待确认导入";
    if (status === "IMPORTING") return "导入后待验证";
    if (status === "VERIFIED") return "验证通过，等待启用";
    if (status === "ACTIVATED") return "迁移已完成";
    if (status === "FAILED") return "迁移未完成";
    return "迁移已取消";
  };
  const nextStep = (status: (typeof runs)[number]["status"]): string => {
    if (status === "PREVIEWED") return "下一步：确认恢复点与本批范围后再导入。";
    if (status === "IMPORTING") return "下一步：验证本批结果；应用重启后仍可继续。";
    if (status === "VERIFIED") return "下一步：确认所有审阅决定后启用 V2。";
    if (status === "ACTIVATED") return "V2 已启用；V1 只保留为只读历史与恢复证据。";
    if (status === "FAILED") return "上次迁移没有完成；系统不会自动重试，请先检查失败批次和当前正式状态。";
    return "这项迁移计划已停止；系统不会自动重试，现有正式状态保持不变。";
  };
  const importCountLabel = (status: (typeof runs)[number]["status"]): string => {
    if (status === "PREVIEWED") return "准备迁移";
    if (status === "VERIFIED" || status === "ACTIVATED") return "已迁移并验证";
    if (status === "CANCELLED") return "原计划迁移";
    return "列入迁移";
  };
  const batchStatusLabel = (status: PluginMigrationRunView["batches"][number]["status"]): string => {
    if (status === "PREPARED") return "恢复点已建立";
    if (status === "IMPORTED") return "已导入，等待验证";
    if (status === "VERIFIED") return "验证通过";
    if (status === "UNDONE") return "已安全撤销";
    return "本批未完成";
  };
  const cards = runs.map((run, index) => {
    const batches = run.batches.length
      ? `<div class="cards">${run.batches.map((batch, batchIndex) => {
        const action = run.status === "ACTIVATED"
          ? ""
          : batch.status === "IMPORTED"
          ? button("验证本批", "migration-batch-verify", batch.token, "primary", model.v2MigrationExecutionAvailable !== true)
          : batch.status === "VERIFIED"
            ? button("准备安全撤销", "migration-batch-undo-open", batch.token, "quiet", model.v2MigrationExecutionAvailable !== true)
            : "";
        const validation = batch.validationObjectCount !== undefined ? ` · ${escapeHtml(batch.validationObjectCount)} 项已核对` : "";
        return `<article class="card compact"><div class="eyebrow">批次 ${batchIndex + 1} · ${escapeHtml(batchStatusLabel(batch.status))}</div><p>${escapeHtml(batch.importedCount)} 项${validation}</p><div class="actions">${action}</div></article>`;
      }).join("")}</div>`
      : "";
    const prepare = run.status === "PREVIEWED"
      ? button("准备下一批", "migration-import-open", run.token, "primary", model.v2MigrationExecutionAvailable !== true)
      : run.status === "VERIFIED"
        ? button("准备启用 V2", "migration-activate-open", run.token, "danger", model.v2MigrationExecutionAvailable !== true)
        : "";
    return `<article class="card compact"><div class="eyebrow">${escapeHtml(statusLabel(run.status))} · ${escapeHtml(new Date(run.updatedAt).toLocaleString("zh-CN"))}</div><h3>迁移计划 ${index + 1}</h3><p>${escapeHtml(run.summary.total)} 项已审阅 · ${escapeHtml(run.summary.import)} 项${escapeHtml(importCountLabel(run.status))} · ${escapeHtml(run.summary.keepOrdinary)} 项保持普通内容 · ${escapeHtml(run.summary.defer)} 项暂缓 · ${escapeHtml(run.summary.exclude)} 项排除</p><p>${escapeHtml(nextStep(run.status))}</p><div class="actions">${prepare}</div>${batches}<details><summary>查看安全边界</summary><p>Recovery Bundle 始终只读；正式状态只走系统的唯一安全写入链。导入前必须有校验通过的恢复点，未启用且没有后续变化的批次才可安全撤销。</p></details></article>`;
  }).join("");
  return `${guidance}${scanPanel}${executionPanel}<section><h2>最近迁移</h2><div class="cards">${cards}</div></section>`;
}

function primaryWorkspace(workspace: Workspace): PrimaryWorkspace {
  if (workspace === "now" || workspace === "review" || workspace === "more") return workspace;
  if (workspace === "objects" || workspace === "reentry") return "projects";
  return "more";
}

function sectionNavigation(model: UiModel): string {
  if (model.workspace === "objects" || model.workspace === "reentry") {
    const entries: Array<[Workspace, string]> = [
      ["reentry", "继续项目"],
      ["objects", "全部事项"],
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
    ? `<article class="card"><h3>本次使用</h3><p>Task Copilot 正在为当前知识库保持正式能力可用。结束前会检查未完成修改与正文核对，不会影响其他应用。</p>${button("结束本次 Task Copilot", "end-task-copilot-open", undefined, "danger")}</article>`
    : model.v2ManagedRuntimeState === "ENDED"
      ? `<article class="card"><h3>本次使用已结束</h3><p>Logseq 正文仍可编辑，历史与恢复信息保持安全；需要正式能力时可重新启动。</p>${button("重新启动 Task Copilot", "restart-task-copilot", undefined, "primary")}</article>`
      : "";
  return `<section><div class="eyebrow">高级与维护</div><h2>更多</h2><p class="muted">日常只需要“现在”“待我确认”和“项目”。这里处理最近修改、系统维护、备份恢复和一次性迁移。</p><div class="cards more-hub">
    <article class="card"><h3>最近修改与恢复</h3><p>查看已经应用、尚未完成或需要恢复的变化，并按安全前置决定能否撤销。</p>${button("查看最近修改与恢复", "view", "audit", "primary")}</article>
    <article class="card"><h3>系统状态</h3><p>先说明哪些能力受影响、哪些仍可用和数据是否安全；需要时再展开技术详情。</p>${button("检查系统状态", "runtime-diagnostics", undefined, "quiet")}</article>
    <article class="card"><h3>备份与恢复</h3><p>创建当前快照，或从已校验快照恢复；系统会先保留当前状态，再安全切换并自动重新连接。</p>${button(model.v2BackupRestoreAvailable ? "打开备份与恢复" : "备份与恢复暂不可用", "backup-restore-open", undefined, "quiet", !model.v2BackupRestoreAvailable)}</article>
    <article class="card"><h3>迁移现有内容</h3><p>查看手动、小批次、可验证、可恢复的一次性迁移进度。</p>${button("查看迁移状态", "view", "migration", "quiet")}</article>
    ${lifecycle}
  </div></section>`;
}

function focusedConfirmationContext(model: UiModel, dialog: NonNullable<UiModel["actionDialog"]>): string {
  if (dialog.kind !== "confirm-v2-commit" && dialog.kind !== "confirm-v2-undo") return "";
  const referenceId = dialog.value.split("|")[0] ?? "";
  const proposalId = dialog.kind === "confirm-v2-undo"
    ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === referenceId)?.proposalId
    : referenceId;
  const record = model.v2Proposals?.find(({ proposal }) => proposal.proposalId === proposalId);
  if (!record) return "";
  const changes = v2ReviewChanges(record).slice(0, 2);
  return `<div class="confirmation-context"><div class="eyebrow">本次操作</div><strong>${escapeHtml(record.proposal.title)}</strong>${changes.length ? `<p>${escapeHtml(changes.join("；"))}</p>` : ""}</div>`;
}

function renderActionDialog(model: UiModel): string {
  const dialog = model.actionDialog;
  if (!dialog) return "";
  const cancel = button("取消", "cancel-action-dialog", undefined, "quiet");
  if (dialog.kind === "v2-origin-fallback") {
    let fallback: { pageName?: string; label?: string };
    try {
      fallback = JSON.parse(dialog.value) as { pageName?: string; label?: string };
    } catch {
      fallback = {};
    }
    const label = fallback.label ?? "来源页面暂时无法自动定位；没有修改任何正式事项。";
    return `<section class="inbox-dialog action-dialog" aria-label="返回原工作现场"><div class="eyebrow">返回原工作现场</div><h3>来源页面暂时无法自动定位</h3><p>${escapeHtml(label)}</p>${fallback.pageName ? `<p class="muted">可以按页面名称打开：${escapeHtml(fallback.pageName)}</p>` : ""}<div class="actions">${fallback.pageName ? button("尝试打开原页面", "v2-origin-fallback-open", fallback.pageName, "primary") : ""}${button("留在当前页", "v2-origin-fallback-dismiss", undefined, "quiet")}</div></section>`;
  }
  if (dialog.kind === "v2-backup-restore") {
    const state = model.v2BackupRestore;
    if (!state || state.status === "idle" || state.status === "loading") {
      return `<section class="inbox-dialog action-dialog" aria-label="备份与恢复"><h3>备份与恢复</h3><div class="notice" aria-live="polite">${escapeHtml(state?.message ?? "正在读取当前 Graph 的可恢复快照…")}</div><div class="actions">${cancel}</div></section>`;
    }
    if (state.status === "error") {
      return `<section class="inbox-dialog action-dialog" aria-label="备份与恢复"><h3>备份与恢复</h3><div class="notice error" role="alert">${escapeHtml(state.message ?? "备份与恢复暂不可用。")}</div><p>没有切换正式状态；Graph 正文仍由 Logseq 持有。</p><div class="actions">${button("重新读取", "backup-restore-reload", undefined, "quiet")}${cancel}</div></section>`;
    }
    const choices = state.backups.length
      ? state.backups.map((backup) => {
        const when = new Date(backup.createdAt).toLocaleString("zh-CN");
        const summary = backup.status === "VALID"
          ? `${backup.objectCount ?? 0} 项正式事项 · 完整性校验通过`
          : "完整性校验未通过 · 不可选择";
        return `<article class="card compact"><div class="eyebrow">${escapeHtml(when)}</div><h4>${escapeHtml(summary)}</h4>${backup.status === "VALID" ? button(state.selectedToken === backup.token ? "已选择" : "选择并检查", "backup-restore-select", backup.token, "quiet", state.selectedToken === backup.token) : ""}</article>`;
      }).join("")
      : `<div class="empty"><strong>还没有可恢复快照</strong><p>可先创建当前正式状态快照；这不会修改 Logseq 正文。</p></div>`;
    const selection = state.selectedToken
      ? `<section class="restore"><h4>最终影响</h4><p>所选快照会替换当前正式状态；Logseq 正文不会被改写。切换前系统会自动保存当前状态为恢复点，并重启当前 Graph 的 Task Copilot。</p><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我已确认所选时间和事项数量，并理解当前正式状态会保留为恢复点</label><div class="actions">${button("恢复并自动重启", "submit-backup-restore", state.selectedToken, "danger")}</div></section>`
      : "";
    const activity = state.status === "validating" || state.status === "restoring"
      ? `<div class="notice" aria-live="polite">${escapeHtml(state.message ?? "正在处理…")}</div>`
      : state.message ? `<div class="notice">${escapeHtml(state.message)}</div>` : "";
    return `<section class="inbox-dialog action-dialog" aria-label="备份与恢复"><h3>备份与恢复</h3><p>只显示当前 Graph 的最近快照；选择要恢复的版本即可。</p>${activity}<div class="cards">${choices}</div>${state.limited ? `<p class="muted">这里只显示最近 20 个快照。</p>` : ""}${selection}<div class="actions">${button("创建当前快照", "backup-restore-create", undefined, "primary", state.status !== "ready")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-project-creation-grill") {
    const state = model.v2ProjectCreationGrill?.[dialog.value];
    if (!state) return "";
    const result = state.status === "ready" ? state.result : state.status === "loading" || state.status === "error" ? state.previous : undefined;
    const output = result?.output;
    const sourceLabel = state.source.sourceKind === "BLANK" ? "从空白开始" : state.source.sourceKind === "PAGE" ? "基于当前页面" : "由 MiniProject 演化";
    const loading = state.status === "loading" ? `<div class="notice" aria-live="polite">正在读取有界来源并生成下一轮；没有创建页面、正式事项或待确认变更。</div>` : "";
    const error = state.status === "error" || state.status === "stale" ? `<div class="notice error" role="alert">${escapeHtml(state.message)}</div>` : "";
    const facts = output?.facts.length ? `<section><h4>已确认事实</h4><ul>${output.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul></section>` : "";
    const inferences = output?.inferences.length ? `<section><h4>Copilot 判断</h4><ul>${output.inferences.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul></section>` : "";
    const unknowns = output?.unknowns.length ? `<section><h4>仍待澄清</h4><ul>${output.unknowns.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul></section>` : "";
    const recommendation = output?.questionGroup?.recommendation ? `<aside class="notice"><strong>建议：</strong>${escapeHtml(output.questionGroup.recommendation.text)}</aside>` : "";
    const reasoning = inferences || unknowns || recommendation
      ? `<details class="grill-reasoning"><summary>查看判断依据</summary>${inferences}${unknowns}${recommendation}</details>`
      : "";
    const previewState = state.status === "ready" ? state.preview : undefined;
    const readyForPreview = output?.readiness === "READY_FOR_PREVIEW" && previewState?.status !== "ready"
      ? previewState?.status === "loading" ? `<p class="notice" aria-live="polite">正在生成最终阅读预览；正式状态保持不变。</p>`
        : `<div class="notice"><strong>已经可以生成最终阅读预览。</strong><p>这一步不会改动页面或正式事项。</p>${previewState?.status === "error" ? `<p class="error">${escapeHtml(previewState.message)}</p>` : ""}${button("生成最终阅读预览", "v2-project-creation-grill-preview", dialog.value, "primary", model.v2ProjectCreationPreviewAvailable !== true)}</div>`
      : "";
    const preview = previewState?.status === "ready" ? previewState.result.output : undefined;
    const proposal = previewState?.status === "ready" ? previewState.proposal : undefined;
    const proposalCta = preview ? proposal?.status === "loading" ? `<p class="notice">正在核对最新来源并准备“待我确认”；正式状态仍未变化。</p>`
      : proposal?.status === "error" ? `<div class="notice error">${escapeHtml(proposal.message)}</div>${button("重试进入待我确认", "v2-project-creation-grill-proposal", dialog.value, "quiet", model.v2ProjectCreationProposalAvailable !== true)}`
      : proposal?.status === "ready" ? `<p class="notice">创建方案已进入“待我确认”；尚未创建正式事项或页面。</p>`
      : button("进入待我确认", "v2-project-creation-grill-proposal", dialog.value, "primary", model.v2ProjectCreationProposalAvailable !== true) : "";
    const previewHtml = preview ? (() => {
      const changeItems = projectCreationPreviewChanges(preview);
      const sourceSafety = state.source.sourceKind === "BLANK"
        ? "这是从空白开始，不会虚构或改写来源材料。"
        : "来源页面和原始材料保持不变。";
      const safetyItems = [
        sourceSafety,
        "现有事项的当前关注和主归属不会改变。",
        "当前只是阅读预览，尚未创建页面或正式事项。",
      ];
      const sourceMaterials = preview.sourceMaterials.length
        ? `<ul>${preview.sourceMaterials.map((material) => `<li>${escapeHtml(material.text || "（空内容）")} · ${escapeHtml(material.rationale)}</li>`).join("")}</ul>`
        : "<p>没有额外来源材料。</p>";
      return `<section class="grill-preview project-preview-summary" aria-label="项目最终阅读预览">
        <div class="eyebrow">阅读预览 · 尚未应用</div>
        <h3>准备创建：${escapeHtml(preview.finalReading.title.text)}</h3>
        <section class="project-preview-conclusion"><h4>系统理解</h4><p><strong>目标：</strong>${escapeHtml(preview.finalReading.outcome.text)}</p><p><strong>当前推进：</strong>${escapeHtml(preview.finalReading.currentInterface.text)}</p></section>
        <section class="project-preview-impact"><h4>如果确认应用</h4><ul>${changeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section class="project-preview-safety"><h4>不会改变</h4><ul>${safetyItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section class="project-preview-actions"><h4>下一步</h4><p>进入“待我确认”只会建立一份可审阅方案；正式应用前仍可返回。</p>${proposalCta}</section>
        <details class="project-preview-evidence"><summary>查看完整依据</summary>
          <div class="project-preview-evidence-body">
            <p><strong>范围内：</strong>${escapeHtml(preview.finalReading.boundary.included.map((item) => item.text).join("；"))}</p>
            ${preview.finalReading.boundary.excluded.length ? `<p><strong>范围外：</strong>${escapeHtml(preview.finalReading.boundary.excluded.map((item) => item.text).join("；"))}</p>` : ""}
            <p><strong>完成证据：</strong>${escapeHtml(preview.finalReading.completionEvidence.map((item) => item.text).join("；"))}</p>
            <p><strong>内部闭环：</strong>${escapeHtml(preview.finalReading.internalClosure.text)}</p>
            <p><strong>当前接口：</strong>${escapeHtml(preview.finalReading.currentInterface.text)}</p>
            <p><strong>页面关系：</strong>${escapeHtml(projectPageRelationshipLabel(preview.pageObjectRelationship.mode))} · ${escapeHtml(preview.pageObjectRelationship.rationale)}</p>
            <section><h4>来源材料</h4>${sourceMaterials}</section>
          </div>
        </details>
      </section>`;
    })() : "";
    const question = state.status === "ready" && output?.readiness === "CONTINUE" && output.questionGroup
      ? `<section class="grill-question"><h4>这一轮只确认一件事</h4>${output.questionGroup.questions.map((item) => `<p>${escapeHtml(item.text)}</p>`).join("")}<label>你的回答<textarea data-field="v2ProjectCreationGrillAnswer" maxlength="4000" placeholder="直接说明事实、边界或完成证据"></textarea></label>${button("继续讨论", "v2-project-creation-grill-answer", dialog.value, "primary")}</section>` : "";
    const retry = state.status === "error" && state.retryable ? button("重试本轮", "v2-project-creation-grill-retry", dialog.value, "quiet") : "";
    const recheck = state.status === "stale" ? button("基于最新内容重新检查", "v2-project-creation-grill-recheck", dialog.value, "primary") : "";
    const contextDetails = output
      ? `<details class="grill-context"><summary>查看系统理解与已确认事实</summary><blockquote>${escapeHtml(output.understanding)}</blockquote>${facts}${reasoning}</details>`
      : "";
    const mainContent = preview ? `${previewHtml}${contextDetails}` : `${question}${contextDetails}`;
    return `<section class="inbox-dialog action-dialog project-creation-grill" aria-label="梳理项目"><div class="eyebrow">项目梳理 · ${escapeHtml(sourceLabel)} · 本次讨论不会保存</div><h3>先把项目说清楚</h3><p class="muted">每次只回答一个与当前项目有关的问题；完整理解可以展开查看。</p>${mainContent}${loading}${error}${readyForPreview}<div class="actions">${retry}${recheck}${cancel}</div></section>`;
  }
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
    const loading = state.status === "loading" ? `<div class="notice" aria-live="polite">正在结合原始材料和前序回答生成下一轮；正式事项与正文保持不变。</div>` : "";
    const previewState = state.status === "ready" ? state.preview : undefined;
    const readyForPreview = output?.readiness === "READY_FOR_PREVIEW" && previewState?.status !== "ready"
      ? `<div class="notice"><strong>已经可以查看结构预览。</strong><p>预览只供审阅；确认应用前不会改变正文或正式事项。</p>${previewState?.status === "loading" ? "<p aria-live=\"polite\">正在生成零丢失阅读预览…</p>" : previewState?.status === "error" ? `<p class="error">${escapeHtml(previewState.message)}</p>${button("重试结构预览", "v2-mini-project-grill-preview", object.objectId, "quiet", model.v2MiniProjectGrillPreviewAvailable !== true)}` : button("生成结构预览", "v2-mini-project-grill-preview", object.objectId, "primary", model.v2MiniProjectGrillPreviewAvailable !== true)}</div>`
      : "";
    const preview = previewState?.status === "ready" ? previewState.result.output : undefined;
    const restructureProposal = previewState?.status === "ready" ? previewState.proposal : undefined;
    const proposalCta = preview
      ? restructureProposal?.status === "loading" ? `<p class="notice" aria-live="polite">正在重新检查原材料并准备变更审阅；正文仍未修改。</p>`
        : restructureProposal?.status === "error" ? `<div class="notice error">${escapeHtml(restructureProposal.message)}</div>${button("重新进入变更审阅", "v2-mini-project-grill-proposal", object.objectId, "quiet", model.v2MiniProjectGrillProposalAvailable !== true)}`
        : restructureProposal?.status === "not-needed" ? `<div class="notice"><strong>讨论已完成，无需正式变更。</strong><p>当前内容已经符合预览结构，正文和正式事项没有变化。</p></div>`
        : restructureProposal?.status === "ready" ? `<p class="notice">整理方案已进入“待我确认”；尚未应用。</p>`
        : button("进入变更审阅", "v2-mini-project-grill-proposal", object.objectId, "primary", model.v2MiniProjectGrillProposalAvailable !== true)
      : "";
    const previewSections = preview ? preview.finalReading.sections.map((section) => `<section class="grill-preview-section"><h4>${escapeHtml(section.heading)}</h4><p class="muted">${escapeHtml(section.purpose)}</p>${section.sourceMaterials.length ? `<ul>${section.sourceMaterials.map((material) => `<li>${escapeHtml(material.text || "（空 Block，原位保留）")}</li>`).join("")}</ul>` : ""}${section.derivedBlocks.map((item) => `<p>${escapeHtml(item.text)}</p>`).join("")}</section>`).join("") : "";
    const previewHtml = preview ? `<section class="grill-preview" aria-label="小项目最终阅读预览"><div class="eyebrow">零丢失阅读预览 · 尚未应用</div><h3>${escapeHtml(preview.finalReading.title.text)}</h3><p><strong>要得到：</strong>${escapeHtml(preview.finalReading.outcome.text)}</p><p><strong>范围内：</strong>${escapeHtml(preview.finalReading.boundary.included.map((item) => item.text).join("；"))}</p>${preview.finalReading.boundary.excluded.length ? `<p><strong>范围外：</strong>${escapeHtml(preview.finalReading.boundary.excluded.map((item) => item.text).join("；"))}</p>` : ""}<p><strong>完成证据：</strong>${escapeHtml(preview.finalReading.completionEvidence.map((item) => item.text).join("；"))}</p><div class="badges"><span>来源内容 ${preview.impact.sourceMaterialCount}</span><span>调整位置 ${preview.impact.movedMaterialCount}</span><span>补充总结 ${preview.impact.addedDerivedBlockCount}</span><span>删除 ${preview.impact.deletedMaterialCount}</span><span>待判断 ${preview.impact.unclassifiedMaterialCount}</span></div>${previewSections}${preview.unclassified.length ? `<section><h4>待判断／原始材料（原位保留）</h4>${preview.unclassified.map((item) => `<blockquote>${escapeHtml(item.text || "（空内容）")}<small>${escapeHtml(item.reason)}</small></blockquote>`).join("")}</section>` : ""}<div class="notice">这是阅读预览，不是正式变化。下一步只审阅方案；只有之后明确“确认应用”才会改变正文。原始材料全部保留，删除数固定为 0。</div>${proposalCta}</section>` : "";
    const discussionReasoning = inferences || unknowns || recommendation
      ? `<details class="grill-reasoning"><summary>查看判断依据</summary>${inferences}${unknowns}${recommendation}</details>`
      : "";
    const discussion = output
      ? preview
        ? `<details class="grill-preview-evidence"><summary>查看讨论依据</summary><div class="grill-preview-evidence-body"><blockquote>${escapeHtml(output.understanding)}</blockquote>${facts}${inferences}${unknowns}${recommendation}</div></details>`
        : `<details class="grill-context"><summary>查看系统理解与已确认事实</summary><blockquote>${escapeHtml(output.understanding)}</blockquote>${facts}${discussionReasoning}</details>`
      : "";
    const question = state.status === "ready" && output?.readiness === "CONTINUE" && output.questionGroup
      ? `<section class="grill-question"><h4>这一轮只确认一件事</h4>${output.questionGroup.questions.map((item) => `<p>${escapeHtml(item.text)}</p>`).join("")}<label>你的回答<textarea data-field="v2MiniProjectGrillAnswer" maxlength="4000" placeholder="直接说明事实、边界或完成证据"></textarea></label>${button("继续讨论", "v2-mini-project-grill-answer", object.objectId, "primary")}</section>`
      : "";
    const retry = state.status === "error" ? button("重试本轮", "v2-mini-project-grill-retry", object.objectId, "quiet") : "";
    const closeLabel = model.originReturnLabel ?? "关闭讨论";
    const mainContent = preview ? `${previewHtml}${discussion}` : `${question}${discussion}`;
    return `<section class="inbox-dialog action-dialog mini-project-grill" aria-label="梳理小项目"><div class="eyebrow">小项目梳理</div><h3>${escapeHtml(object.text)}</h3><p class="muted">每次只回答一个与这个小项目有关的问题；完整理解可以展开查看。本次讨论内容在结束后清除。</p>${mainContent}${loading}${error}${readyForPreview}<div class="actions">${retry}${button(closeLabel, "cancel-action-dialog", undefined, "quiet")}</div></section>`;
  }
  if (dialog.kind === "confirm-end-task-copilot") {
    return `<section class="inbox-dialog action-dialog" aria-label="结束本次 Task Copilot"><h3>结束本次 Task Copilot？</h3><p>系统会再次检查未完成修改与正文核对。安全时只结束当前知识库的 Task Copilot；Logseq 正文、历史记录和其他进程不受影响。</p><div class="actions">${button("确认安全结束", "submit-end-task-copilot", undefined, "danger")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-page-context") {
    const context = model.pageContext;
    if (!context || context.pageUuid !== dialog.value) return "";
    const origin = `<p class="muted">执行前会再次核对当前页身份；完成或取消后仍回到 ${escapeHtml(context.pageName)}。</p>`;
    if (context.kind === "PROJECT" && context.project) {
      const unavailable = context.project.lifecycle !== "OPEN";
      return `<section class="inbox-dialog action-dialog page-context-dialog" aria-label="项目页面操作"><div class="eyebrow">项目页面 · ${escapeHtml(context.pageName)}</div><h3>${escapeHtml(context.project.objectText)}</h3>${origin}<div class="cards compact"><button type="button" class="intent-card primary-intent" data-action="v2-page-project-operations" data-value="${escapeHtml(context.pageUuid)}"><strong>打开项目工作区</strong><span>查看当前推进、上下文和其他项目操作</span></button><button type="button" class="intent-card" data-action="v2-page-project-update" data-value="${escapeHtml(context.pageUuid)}"${unavailable ? " disabled" : ""}><strong>更新项目当前状态</strong><span>查看现有摘要并提出受保护的更新</span></button><button type="button" class="intent-card" data-action="v2-page-project-discuss" data-value="${escapeHtml(context.pageUuid)}"${unavailable ? " disabled" : ""}><strong>讨论项目结构</strong><span>先审阅方案，确认应用后才会修改</span></button></div><div class="actions">${cancel}</div></section>`;
    }
    return `<section class="inbox-dialog action-dialog page-context-dialog" aria-label="普通页面操作"><div class="eyebrow">当前页面 · ${escapeHtml(context.pageName)}</div><h3>从当前页继续</h3>${origin}<div class="cards compact"><button type="button" class="intent-card primary-intent" data-action="v2-page-organize" data-value="${escapeHtml(context.pageUuid)}"><strong>整理当前页</strong><span>先查看候选和预览，不直接修改正文或正式事项</span></button><button type="button" class="intent-card" data-action="v2-page-formal-items-open" data-value="${escapeHtml(context.pageUuid)}"><strong>查看本页正式事项</strong><span>${context.formalItems.length} 项由 Task Copilot 关联到当前页</span></button><button type="button" class="intent-card" data-action="v2-page-project-create-route" data-value="${escapeHtml(context.pageUuid)}"><strong>将本页建立为项目</strong><span>读取当前页的相关材料，先梳理并预览，不直接转换当前页</span></button></div><div class="actions">${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-page-formal-items") {
    const context = model.pageContext;
    if (!context || context.pageUuid !== dialog.value) return "";
    const items = context.formalItems.length
      ? `<div class="object-list">${context.formalItems.map((item) => `<article class="object-row"><span>${escapeHtml(item.objectText)}</span><small>${escapeHtml(objectTypeLabel(item.objectType))} · ${escapeHtml(objectLifecycleLabel(item.lifecycle))}</small></article>`).join("")}</div>`
      : empty("本页没有正式事项", "这里只显示由 Task Copilot 明确连接到当前页或页内 Block 的事项。");
    return `<section class="inbox-dialog action-dialog page-context-dialog" aria-label="本页正式事项"><div class="eyebrow">当前页面 · ${escapeHtml(context.pageName)}</div><h3>本页正式事项</h3><p class="muted">这里只读显示与当前页明确连接的事项；页面位置本身不会改变事项归属。</p>${items}<div class="actions">${button("返回页面操作", "v2-page-context-back", context.pageUuid, "quiet")}${cancel}</div></section>`;
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
    return `<section class="inbox-dialog action-dialog" aria-label="更新已有对象"><h3>更新已有对象</h3><p class="muted">来源保持只读；请选择目标并填写审阅后希望保留的完整显式 Block 正文。此操作只生成 Proposal，接受与最终 Commit 前不会改正文或 SQLite。</p><blockquote>${escapeHtml(model.v2CandidateSourcePreviews?.[candidate.candidateId] ?? "原文暂不可读；提交时会再次检查。")}</blockquote><label>目标对象<select data-field="v2CandidateUpdateTarget"><option value="">请选择</option>${targets.map((target) => `<option value="${escapeHtml(target.objectId)}">${escapeHtml(objectTypeLabel(target.objectType))} · ${escapeHtml(target.text)}</option>`).join("")}</select></label><label>目标最终完整正文<textarea data-field="v2CandidateUpdateContent" placeholder="[任务] 合并后的最终正文"></textarea></label><div class="actions">${button("生成更新 Proposal", "submit-v2-candidate-update", candidate.candidateId, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-project-operation-router") {
    const [objectId, rawVersion] = dialog.value.split("|");
    const project = model.v2Objects?.find((candidate) => candidate.objectId === objectId && candidate.objectType === "PROJECT" && candidate.lifecycle === "OPEN" && candidate.version === Number(rawVersion));
    if (!project) return "";
    return `<section class="inbox-dialog action-dialog project-operation-router" aria-label="调整项目"><div class="eyebrow">调整项目</div><h3>你想让这个项目发生什么变化？</h3><p class="muted">选择你的目的即可。Task Copilot 会在后台决定是否需要审阅；这里的选择本身不会修改项目或正文。</p>
      <div class="intent-list">
        <button type="button" class="intent-card" data-action="v2-condition-open" data-value="${escapeHtml(dialog.value)}"><strong>更新当前状态</strong><span>记录可以行动、等待、受阻或暂停；保存后可以撤销。</span></button>
        <button type="button" class="intent-card" data-action="v2-project-narration-propose" data-value="${escapeHtml(dialog.value)}"${model.v2ProjectNarrationBusy === true || model.v2ProviderAvailable !== true ? " disabled aria-busy=\"true\"" : ""}><strong>${model.v2ProjectNarrationBusy ? "正在整理项目摘要…" : "整理项目摘要"}</strong><span>只更新项目的当前理解，不改变目标、成果、正文或归属。</span></button>
        <button type="button" class="intent-card primary-intent" data-action="v2-project-structure-open" data-value="${escapeHtml(dialog.value)}"><strong>调整目标、成果和推进结构</strong><span>先阅读完整结果，再决定是否正式应用；未确认前不会写入。</span></button>
        <button type="button" class="intent-card" data-action="v2-project-closure-evidence-open" data-value="${escapeHtml(dialog.value)}"${model.v2ProjectClosureEvidenceBusy ? " disabled aria-busy=\"true\"" : ""}><strong>${model.v2ProjectClosureEvidenceBusy ? "正在检查关闭条件…" : "结束这个项目"}</strong><span>先检查完成证据和遗留事项；不会直接结束项目。</span></button>
      </div>
      <details><summary>更多项目操作</summary><div class="actions wrap">${button("撤销最近状态", "v2-condition-undo-open", objectId, "quiet", model.v2ConditionUndoBusy === true)}<button type="button" class="quiet" disabled aria-disabled="true">处理归属或关联（安全撤销补齐后开放）</button></div><p class="muted">正文移动、拆分合并和归属变化仍走各自的安全审阅流程，不会被降级为快捷修改。</p></details>
      <div class="actions">${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-project-closure-evidence") {
    const evidence = model.v2ProjectClosureEvidence;
    const [objectId, rawVersion] = dialog.value.split("|");
    if (!evidence || evidence.project.objectId !== objectId || evidence.project.version !== Number(rawVersion)) return "";
    const list = (title: string, items: readonly { text: string }[], emptyText: string): string =>
      `<section><h4>${escapeHtml(title)}</h4>${items.length ? `<ul>${items.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : `<p class="muted">${escapeHtml(emptyText)}</p>`}</section>`;
    const objectiveJudgments = evidence.objectiveJudgments.length
      ? `<section><h4>每个目标仍需判断</h4><ul>${evidence.objectiveJudgments.map(({ objective, evidence: objectiveEvidence }) => `<li><strong>${escapeHtml(objective.text)}</strong>${objectiveEvidence.length ? ` · 声明过的成功证据：${objectiveEvidence.map(({ text }) => escapeHtml(text)).join("；")}` : " · 没有声明成功证据"}</li>`).join("")}</ul></section>`
      : "";
    const unresolved = evidence.unresolvedWork.length
      ? `<section><h4>尚未收口的工作</h4><ul>${evidence.unresolvedWork.map(({ text, condition }) => `<li>${escapeHtml(text)} · ${escapeHtml(condition)}</li>`).join("")}</ul></section>`
      : "";
    const unknowns = evidence.unknowns.length
      ? `<section><h4>目前无法确认</h4><ul>${evidence.unknowns.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul></section>`
      : "";
    const confirmed = model.v2ProjectClosureUserJudgments;
    const draft = model.v2ProjectClosureDraftFields;
    const objectiveInputs = evidence.objectiveJudgments.map(({ objective, evidence: objectiveEvidence }, index) => {
      const disposition = confirmed?.objectiveDispositions.find((item) => item.objectiveId === objective.objectiveId);
      const incomplete = disposition?.disposition === "INCOMPLETE" ? disposition : undefined;
      const draftDisposition = draft?.[`projectClosureObjectiveDisposition:${index}`];
      const selectedDisposition = draftDisposition === "COMPLETED" || draftDisposition === "INCOMPLETE"
        ? draftDisposition
        : disposition?.disposition ?? "INCOMPLETE";
      const objectiveEvidenceDetails = objectiveEvidence.length
        ? `<details class="objective-evidence-details"><summary>查看现有依据（${objectiveEvidence.length}）</summary><p class="muted">${objectiveEvidence.map(({ text }) => escapeHtml(text)).join("；")}</p></details>`
        : `<p class="muted">当前没有声明成功证据；系统不会推断完成。</p>`;
      return `<fieldset><legend>${escapeHtml(objective.text)}</legend>${objectiveEvidenceDetails}<label>这项目标<select data-field="projectClosureObjectiveDisposition:${index}"><option value="INCOMPLETE"${selectedDisposition === "INCOMPLETE" ? " selected" : ""}>仍未完成</option><option value="COMPLETED"${selectedDisposition === "COMPLETED" ? " selected" : ""}>已经完成</option></select></label><label>若未完成，原因<textarea data-field="projectClosureObjectiveReason:${index}" placeholder="例如：历史回放样本仍未取得">${escapeHtml(draft?.[`projectClosureObjectiveReason:${index}`] ?? incomplete?.reason ?? "")}</textarea></label><label>若未完成，明确后续<textarea data-field="projectClosureObjectiveNextStep:${index}" placeholder="例如：取得样本后完成回放并重新核对">${escapeHtml(draft?.[`projectClosureObjectiveNextStep:${index}`] ?? incomplete?.nextStep ?? "")}</textarea></label></fieldset>`;
    }).join("");
    const legacyDefault = evidence.unresolvedWork.length
      ? `${evidence.unresolvedWork.map(({ text }) => text).join("；")}继续作为明确遗留，不在关闭时丢弃。`
      : "没有遗留工作。";
    const decisionDefault = draft?.projectClosureKeyDecisions ?? confirmed?.keyDecisions.join("\n") ?? evidence.decisionCandidates.map(({ text }) => text).join("\n");
    const currentProject = model.v2Objects?.find((candidate) =>
      candidate.objectId === objectId
      && candidate.objectType === "PROJECT"
      && candidate.lifecycle === "OPEN"
    );
    const evidenceNeedsRefresh = currentProject !== undefined && currentProject.version !== evidence.project.version;
    const proposalStatus = model.v2ProjectClosureProposalBusy
      ? `<div class="notice" aria-live="polite">正在整理关闭方案；项目和正文尚未改变。</div>`
      : model.v2ProjectClosureProposalMessage
        ? `<div class="notice error" role="alert">${escapeHtml(model.v2ProjectClosureProposalMessage)}</div>`
        : "";
    const proposalDisabled = model.v2ProjectClosureProposalAvailable !== true || model.v2ProjectClosureProposalBusy === true;
    const proposalAction = evidenceNeedsRefresh
      ? button("重新检查关闭条件", "v2-project-closure-evidence-open", `${objectId}|${currentProject.version}`, "primary", model.v2ProjectClosureEvidenceBusy === true)
      : button(
        model.v2ProjectClosureProposalBusy
          ? "正在整理关闭方案…"
          : model.v2ProjectClosureProposalMessage
            ? "重新整理关闭方案"
            : "审阅关闭方案",
        "submit-v2-project-closure-draft",
        dialog.value,
        "primary",
        proposalDisabled,
      );
    return `<section class="inbox-dialog action-dialog project-closure-evidence" aria-label="准备结束项目"><header class="decision-header"><div class="eyebrow">第 1 步 · 检查关闭条件</div><h3>还有 ${escapeHtml(evidence.userJudgments.length)} 项需要你判断</h3><p class="lead">${escapeHtml(evidence.project.text)}</p><p class="safety-note"><strong>尚未正式应用。</strong>现在退出不会修改项目、正文或当前关注。</p></header>
      <section class="project-closure-judgments"><h3>确认项目如何结束</h3><p class="muted">只补充现有材料无法决定的内容。下一步会先生成一份可阅读的关闭方案，仍不会直接结束项目。</p>
        <label>实际结果<textarea data-field="projectClosureActualResult" placeholder="这次真正交付或改变了什么？">${escapeHtml(draft?.projectClosureActualResult ?? confirmed?.actualResult ?? "")}</textarea></label>
        ${objectiveInputs}
        <label>遗留如何承接<textarea data-field="projectClosureLegacyDisposition">${escapeHtml(draft?.projectClosureLegacyDisposition ?? confirmed?.legacyDisposition ?? legacyDefault)}</textarea></label>
        <label>本次确认的关键决定（每行一项）<textarea data-field="projectClosureKeyDecisions" placeholder="记录未来仍需保留的关键决定">${escapeHtml(decisionDefault)}</textarea></label>
        <label>未来重入先看什么<textarea data-field="projectClosureFutureSummary" placeholder="用一小段话告诉未来的自己先核对什么">${escapeHtml(draft?.projectClosureFutureSummary ?? confirmed?.futureSummary ?? "")}</textarea></label>
      </section>
      <details class="closure-evidence-details"><summary>查看完整依据</summary>
        <p class="muted">只使用项目当前结构和直接归属事项；普通关联、更深层事项和模型判断不会被当成完成事实。</p>
        ${list("原目标", evidence.goalCandidates, "当前没有明确目标，原目标仍未知。")}
        ${list("交付与成果", evidence.deliverableCandidates, "当前没有可用的正式交付证据。")}
        ${list("关键决定", evidence.decisionCandidates, "当前没有直接归属的决定证据。")}
        ${list("已完成工作", evidence.completedWorkCandidates, "当前没有直接归属且已完成的工作。")}
        ${objectiveJudgments}${unresolved}${unknowns}
        <section><h4>为什么需要你判断</h4><ul>${evidence.userJudgments.map(({ reason }) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></section>
      </details>
      ${proposalStatus}
      ${model.v2ProjectClosureProposalAvailable === true ? "" : `<p class="muted">关闭建议暂时无法整理；你仍可阅读依据，项目和正文没有变化。</p>`}
      <div class="actions decision-actions">${proposalAction}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-project-structure-edit") {
    const [objectId] = dialog.value.split("|");
    const project = model.v2Objects?.find((candidate) => candidate.objectId === objectId && candidate.objectType === "PROJECT");
    if (!project?.projectStructure) return "";
    const structure = project.projectStructure;
    const priorityLabel = (value: "PRIMARY" | "SECONDARY"): string => value === "PRIMARY" ? "主要" : "次要";
    const deliverableStatusLabel = (value: "PLANNED" | "AVAILABLE" | "ACCEPTED" | "SUPERSEDED"): string => ({
      PLANNED: "计划中",
      AVAILABLE: "可用",
      ACCEPTED: "已接受",
      SUPERSEDED: "已替代",
    })[value];
    const objectives = structure.objectives.map((item) => `${priorityLabel(item.priority)}｜${item.text}｜${item.successEvidence.join("；")}`).join("\n");
    const deliverables = structure.deliverables.map((item) => `${deliverableStatusLabel(item.status)}｜${item.text}｜${item.acceptance}`).join("\n");
    const stages = structure.workStages.map((item) => `${item.name}｜${item.statusDescription}`).join("\n");
    const children = (model.v2PrimaryOwnerships ?? []).filter((ownership) => ownership.ownerObjectId === project.objectId).map((ownership) => model.v2Objects?.find((candidate) => candidate.objectId === ownership.childObjectId)).filter((candidate): candidate is V2ManagedObject => candidate !== undefined && (candidate.objectType === "TASK" || candidate.objectType === "MINI_PROJECT"));
    const mappingByObject = new Map(structure.stageMappings.map((mapping) => [mapping.objectId, mapping.stageId]));
    const mappings = children.length && structure.workStages.length ? `<fieldset><legend>这些事项主要属于哪个推进阶段（可选）</legend>${children.map((child) => `<label>${escapeHtml(objectTypeLabel(child.objectType))} · ${escapeHtml(child.text)}<select data-field="v2ProjectStageMapping:${escapeHtml(child.objectId)}"><option value="">不指定</option>${structure.workStages.map((stage) => `<option value="${escapeHtml(stage.stageId)}"${mappingByObject.get(child.objectId) === stage.stageId ? " selected" : ""}>${escapeHtml(stage.name)}</option>`).join("")}</select></label>`).join("")}</fieldset>` : "";
    return `<section class="inbox-dialog action-dialog project-structure-editor" aria-label="调整项目目标与结构"><div class="eyebrow">调整项目</div><h3>目标、成果和当前推进</h3><p class="muted">把未来重回项目时真正需要的信息集中在这里。下一步先审阅完整结果；确认应用前不会修改项目或正文。每项一行，使用全角分隔符 ｜。</p><label>项目摘要<textarea data-field="v2ProjectCurrentSummary">${escapeHtml(structure.currentSummary)}</textarea></label><label>现在先推进什么（1–3 行）<textarea data-field="v2ProjectCurrentFocuses">${escapeHtml(structure.currentFocuses.join("\n"))}</textarea></label><label>目标：主要/次要｜目标｜完成证据（证据用；分隔）<textarea data-field="v2ProjectObjectives" placeholder="主要｜稳定发布｜恢复演练通过；无静默覆盖">${escapeHtml(objectives)}</textarea></label><label>预期成果：计划中/可用/已接受/已替代｜成果｜验收说明<textarea data-field="v2ProjectDeliverables" placeholder="计划中｜发布手册｜值班同学可独立执行">${escapeHtml(deliverables)}</textarea></label><label>推进阶段：阶段名｜当前状态<textarea data-field="v2ProjectStages" placeholder="验收｜正在验证恢复路径">${escapeHtml(stages)}</textarea></label>${mappings}<label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我已核对以上内容，准备进入方案审阅</label><div class="actions">${button("审阅更新方案", "submit-v2-project-structure", dialog.value, "primary")}${cancel}</div></section>`;
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
    const blockers = model.v2NowWork?.conditionOptions.filter((option) => option.objectId !== objectId).map((option) => `<option value="${escapeHtml(option.objectId)}"${option.objectId === blockerObjectId ? " selected" : ""}>${escapeHtml(objectTypeLabel(option.objectType))} · ${escapeHtml(option.text)}</option>`).join("") ?? "";
    return `<section class="inbox-dialog action-dialog" aria-label="更新当前状态"><h3>更新当前状态</h3><p class="muted">只记录眼下是否能继续，不会改变是否完成、当前关注或归属。</p><label>当前状态<select data-field="v2ConditionKind"><option value="ACTIONABLE">可以行动</option><option value="WAITING">等待别人</option><option value="BLOCKED">被问题卡住</option><option value="PAUSED">我先暂停</option></select></label><label>等待谁或什么<input data-field="v2WaitingFor"></label><label>期待结果<input data-field="v2ExpectedResult"></label><label>原因<input data-field="v2ConditionReason"></label><label>阻碍来源（可选）<select data-field="v2BlockerObjectId"><option value="">仅记录原因</option>${blockers}</select></label><label>复查时间（等待时必填）<input type="datetime-local" step="60" aria-describedby="v2-condition-local-time" data-field="v2ConditionReviewAt"></label>${localTimeHint("v2-condition-local-time")}<div class="actions">${button("保存状态", "submit-v2-condition", dialog.value, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "confirm-v2-condition-undo") {
    const [objectId, changeId, rawVersion] = dialog.value.split("|");
    const prepared = model.v2ConditionUndoPreparation;
    if (
      !prepared
      || prepared.objectId !== objectId
      || prepared.conditionChangeId !== changeId
      || prepared.expectedVersion !== Number(rawVersion)
    ) return "";
    const label = (condition: V2Condition): string => condition.kind === "ACTIONABLE" ? "可以行动"
      : condition.kind === "WAITING" ? "等待别人"
      : condition.kind === "BLOCKED" ? "被问题卡住"
      : "我先暂停";
    return `<section class="inbox-dialog action-dialog" aria-label="撤销最近状态变化"><div class="eyebrow">可撤销</div><h3>撤销最近状态变化</h3><p>将“${escapeHtml(prepared.objectText)}”从“${escapeHtml(label(prepared.afterCondition))}”恢复为“${escapeHtml(label(prepared.beforeCondition))}”。</p><p class="muted">确认时会重新检查当前状态；如果后来已有变化，会安全停止。不会改变正文、是否完成、当前关注或归属。</p><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我确认恢复到这次状态变化之前</label><div class="actions">${button(model.v2ConditionUndoBusy ? "正在撤销…" : "确认撤销", "submit-v2-condition-undo", dialog.value, "danger", model.v2ConditionUndoBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-route") {
    const [objectId] = dialog.value.split("|");
    const object = model.v2Objects?.find((candidate) => candidate.objectId === objectId);
    const resume = object && object.condition.kind !== "ACTIONABLE"
      ? `<button type="button" data-action="v2-block-condition-intent" data-value="ACTIONABLE|${escapeHtml(dialog.value)}"><strong>恢复为可以行动</strong><span>回复已到或卡点已解除，重新进入可推进状态</span></button>`
      : "";
    return `<section class="inbox-dialog action-dialog" aria-label="暂时做不了"><div class="eyebrow">当前内容 · ${escapeHtml(objectTypeLabel(object?.objectType ?? ""))}</div><h3>暂时做不了：${escapeHtml(object?.text ?? "当前事项")}</h3><p class="muted">选择眼下真正的原因。这里只记录为什么暂时无法推进，不会完成事项、移动正文或改变当前关注。</p><div class="cards compact">${resume}<button type="button" data-action="v2-block-condition-intent" data-value="WAITING|${escapeHtml(dialog.value)}"><strong>等待别人</strong><span>在等谁或什么结果，并约定复查时间</span></button><button type="button" data-action="v2-block-condition-intent" data-value="BLOCKED|${escapeHtml(dialog.value)}"><strong>被问题卡住</strong><span>记录具体卡点，可选关联阻碍事项</span></button><button type="button" data-action="v2-block-condition-intent" data-value="PAUSED|${escapeHtml(dialog.value)}"><strong>我先暂停</strong><span>记录原因和重新判断时间</span></button></div><div class="actions">${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-actionable") {
    const [objectId] = dialog.value.split("|");
    const object = model.v2Objects?.find((candidate) => candidate.objectId === objectId);
    return `<section class="inbox-dialog action-dialog" aria-label="恢复为可以行动"><div class="eyebrow">当前状态将更新</div><h3>恢复为可以行动</h3><p>“${escapeHtml(object?.text ?? "当前事项")}”将重新出现在可推进事项中。</p><p class="muted">只更新眼下是否能继续；不会完成事项、移动正文或改变当前关注。保存时会重验当前版本。</p><div class="actions">${button(model.v2BlockConditionBusy ? "正在保存…" : "确认恢复", "submit-v2-block-condition", dialog.value, "primary", model.v2BlockConditionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-waiting") {
    return `<section class="inbox-dialog action-dialog" aria-label="等待别人"><h3>等待别人</h3><p class="muted">用一个短语说明在等谁或什么结果；到点后会回到“需要回看”。当前关注不会自动改变。</p><label>在等谁或什么结果<input data-field="v2BlockWaitingSummary" placeholder="例如：等评审人确认恢复结果"></label><label>复查时间<input type="datetime-local" step="60" aria-describedby="v2-block-waiting-local-time" data-field="v2BlockConditionReviewAt"></label>${localTimeHint("v2-block-waiting-local-time")}<div class="actions">${button(model.v2BlockConditionBusy ? "正在保存…" : "保存为等待别人", "submit-v2-block-condition", dialog.value, "primary", model.v2BlockConditionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-blocked") {
    const [objectId] = dialog.value.split("|");
    const blockers = model.v2NowWork?.conditionOptions.filter((option) => option.objectId !== objectId).map((option) => `<option value="${escapeHtml(option.objectId)}">${escapeHtml(objectTypeLabel(option.objectType))} · ${escapeHtml(option.text)}</option>`).join("") ?? "";
    return `<section class="inbox-dialog action-dialog" aria-label="被问题卡住"><h3>被问题卡住</h3><p class="muted">只记录当前卡点；不会完成事项、移动正文、改变归属或当前关注。</p><label>具体卡点<textarea data-field="v2BlockConditionReason" placeholder="例如：测试环境暂不可用"></textarea></label><label>阻碍事项（可选）<select data-field="v2BlockerObjectId"><option value="">只记录卡点</option>${blockers}</select></label><div class="actions">${button(model.v2BlockConditionBusy ? "正在保存…" : "保存为被问题卡住", "submit-v2-block-condition", dialog.value, "primary", model.v2BlockConditionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-block-condition-paused") {
    return `<section class="inbox-dialog action-dialog" aria-label="我先暂停"><h3>我先暂停</h3><p class="muted">暂停不是完成；到重新判断时间后再决定是否恢复。当前关注不会自动改变。</p><label>暂停原因<textarea data-field="v2BlockConditionReason" placeholder="例如：先完成本周发布"></textarea></label><label>重新判断时间<input type="datetime-local" step="60" aria-describedby="v2-block-paused-local-time" data-field="v2BlockConditionReviewAt"></label>${localTimeHint("v2-block-paused-local-time")}<div class="actions">${button(model.v2BlockConditionBusy ? "正在保存…" : "保存为我先暂停", "submit-v2-block-condition", dialog.value, "primary", model.v2BlockConditionBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-deadline") {
    const current = dialog.value.split("|")[2];
    return `<section class="inbox-dialog action-dialog" aria-label="设置 Task 期限"><h3>设置明确期限</h3><p class="muted">期限是明确承诺时间，只影响可解释排序，不产生分数。${current ? ` 当前：${escapeHtml(userFacingDateTime(current))}` : ""}</p><label>期限<input type="datetime-local" step="60" aria-describedby="v2-due-local-time" data-field="v2DueAt"></label>${localTimeHint("v2-due-local-time")}<label class="confirm-line"><input type="checkbox" data-field="v2ClearDueAt">清除现有期限</label><div class="actions">${button("保存期限", "submit-v2-deadline", dialog.value, "primary")}${cancel}</div></section>`;
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
    <label>主归属对象<select data-field="ownerObjectId"><option value="">请选择</option>${model.objects.filter((candidate) => candidate.objectId !== object.objectId).map((candidate) => `<option value="${escapeHtml(candidate.objectId)}">${escapeHtml(objectTypeLabel(candidate.objectType))} · ${escapeHtml(candidate.text)}</option>`).join("")}</select></label>
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
    const draftLabel = model.v2ClosureDraftBusy ? "Copilot 正在整理…" : model.v2ProviderAvailable ? "让 Copilot 帮我整理" : "智能整理暂不可用";
    const transferDisabled = model.v2LegacyTransferBusy === true || model.v2CandidateAvailable !== true;
    return `<section class="inbox-dialog action-dialog" aria-label="审阅 MiniProject 完成回顾"><div class="eyebrow">审阅方案 · 尚未应用</div><h3>MiniProject 完成回顾</h3><p class="muted">Copilot 只帮助整理文字，最终判断仍由你确认。这一步不会完成 MiniProject；确认应用前正式状态不会改变。</p><label>原本要得到什么<textarea data-field="miniClosureOriginalGoal">${escapeHtml(closure.originalGoal)}</textarea></label><label>实际得到了什么<textarea data-field="miniClosureActualResult">${escapeHtml(closure.actualResult)}</textarea></label><label>有什么遗留或需要转移<textarea data-field="miniClosureRemainingWork" placeholder="没有遗留时请明确写“无遗留”">${escapeHtml(closure.remainingWork)}</textarea></label><details class="legacy-transfer"><summary>把遗留整理为新事项</summary><p class="muted">先在 Logseq 新建并选中一个空 Block；不创建新事项也会保留上方遗留说明。</p><label>承接事项类型<select data-field="miniClosureLegacyObjectType"><option value="TASK">任务</option><option value="MINI_PROJECT">MiniProject</option><option value="DECISION">决定</option><option value="OUTPUT">成果</option></select></label>${button(model.v2LegacyTransferBusy ? "正在准备新事项…" : "准备新事项", "v2-mini-project-legacy-transfer", dialog.value, "quiet", transferDisabled)}</details><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我已核对这份完成回顾，准备确认方案</label><div class="actions">${button(draftLabel, "v2-mini-project-closure-draft", dialog.value, "quiet", draftDisabled)}${button(model.v2ClosureReviewBusy ? "正在保存…" : "确认这份方案", "submit-v2-review-accept", dialog.value, "primary", model.v2ClosureReviewBusy === true || model.v2ClosureDraftBusy === true || model.v2LegacyTransferBusy === true)}${cancel}</div></section>`;
  }
  if (dialog.kind === "confirm-v2-mini-project-closure") {
    const proposalId = dialog.value.split("|")[0] ?? "";
    const continuation = proposalContinuationStatus(model, proposalId);
    const recovering = continuation === "RECOVERY_REQUIRED";
    const continuing = continuation === "PENDING";
    const operation = model.v2Proposals?.find((candidate) => candidate.proposal.proposalId === proposalId)?.proposal.groups.flatMap(({ semanticOperations }) => semanticOperations).find((candidate) => candidate.kind === "TRANSITION_LIFECYCLE" && candidate.payload.objectType === "MINI_PROJECT" && candidate.payload.lifecycle === "COMPLETED");
    const evidence = operation?.payload.marker === "DONE" ? "系统会重新检查当前正文和事项版本" : "系统会重新检查事项版本，且不会改写 Logseq 正文";
    const title = recovering ? "恢复到安全状态" : continuing ? "继续上次修改" : "完成这个 MiniProject";
    const eyebrow = recovering ? "恢复操作 · 沿用同一恢复记录" : continuing ? "继续原修改 · 沿用原记录" : "确认应用 · 点击后正式生效";
    const safety = recovering
      ? "上次修改没有完整收口；这次只恢复同一记录，不会创建重复修改。"
      : continuing
        ? "正式修改已经开始；这次会沿用原记录，并跳过已完成的步骤。"
        : "现在退出不会修改正式状态。应用成功后可从历史记录中查看结果。";
    const statement = recovering
      ? "我确认沿用同一恢复记录；系统会完成安全补偿，不会创建重复修改"
      : continuing
        ? "我确认沿用原记录继续；系统会重新检查当前状态，并跳过已完成的步骤"
        : `我已审阅原目标、实际结果和遗留事项；${evidence}，然后完成这个 MiniProject`;
    const actionLabel = recovering ? "确认恢复" : continuing ? "确认继续" : "确认完成";
    return `<section class="inbox-dialog action-dialog" aria-label="${escapeHtml(title)}"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h3>${escapeHtml(title)}</h3><p class="safety-note">${escapeHtml(safety)}</p><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">${escapeHtml(statement)}</label><div class="actions">${button(actionLabel, "submit-v2-mini-project-closure", dialog.value, "danger")}${cancel}</div></section>`;
  }
  if (dialog.kind === "confirm-v2-reasoned-lifecycle") {
    const proposalId = dialog.value.split("|")[0] ?? "";
    const continuation = proposalContinuationStatus(model, proposalId);
    const recovering = continuation === "RECOVERY_REQUIRED";
    const continuing = continuation === "PENDING";
    const action = dialog.value.split("|")[2];
    const verb = action === "CANCEL" ? "取消" : "重开";
    const title = recovering ? "恢复到安全状态" : continuing ? "继续上次修改" : `确认${verb}事项`;
    const eyebrow = recovering ? "恢复操作 · 沿用同一恢复记录" : continuing ? "继续原修改 · 沿用原记录" : "确认应用 · 点击后正式生效";
    const statement = recovering
      ? "我确认沿用同一恢复记录；系统会恢复安全一致状态，不会创建重复修改"
      : continuing
        ? "我确认沿用原记录继续；系统会重新检查当前版本，不会重复完成已应用的步骤"
        : `我已审阅${verb}原因；系统会重新检查当前版本，只改变是否继续，不改写正文`;
    const actionLabel = recovering ? "确认恢复" : continuing ? "确认继续" : `确认${verb}`;
    return `<section class="inbox-dialog action-dialog" aria-label="${escapeHtml(title)}"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h3>${escapeHtml(title)}</h3><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">${escapeHtml(statement)}</label><div class="actions">${button(actionLabel, "submit-v2-reasoned-lifecycle", dialog.value, "danger")}${cancel}</div></section>`;
  }
  if (dialog.kind === "confirm-v2-lifecycle-undo") {
    return `<section class="inbox-dialog action-dialog" aria-label="撤销 Lifecycle 变化"><h3>撤销 Lifecycle 变化</h3><label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">我确认只恢复对象的 Lifecycle 与必要的 Closure 快照；系统会校验当前对象版本，不改写正文、Anchor、Condition、Focus 或 Ownership</label><div class="actions">${button("确认继续", "submit-v2-lifecycle-undo", dialog.value, "danger")}${cancel}</div></section>`;
  }
  const confirmations: Partial<Record<ActionDialogKind, [string, string, string]>> = {
    "confirm-review-accept": ["接受高影响操作", "我单独确认接受这个高影响操作；提交前仍会进行确定性校验", "submit-review-accept"],
    "confirm-phase": ["确认完成 Project", "我已检查目标达成、下层对象、等待项、成果和归档入口", "submit-phase"],
    "confirm-rebind": ["重新绑定主正文 Anchor", "我确认将当前选中 Block 设为新的主正文 Anchor；旧 Anchor 保留为 replaced", "submit-rebind-anchor"],
    "confirm-undo": ["撤销 SemanticCommit", "我确认撤销；系统会先校验正文没有被二次编辑，并创建逆向 Commit", "submit-undo-commit"],
    "confirm-v2-review-accept": ["确认这项方案", "这一步只确认系统理解与计划正确，不会正式应用；应用前仍会重新检查当前内容", "submit-v2-review-accept"],
    "confirm-v2-commit": ["确认应用", "我已查看最终结果和影响；点击后才会正式写入，成功后可以撤销", "submit-v2-proposal-commit"],
    "confirm-v2-project-closure": ["确认结束项目", "我已检查原始目标、实际结果、未完成目标的原因与去向；点击后系统会重新检查并结束项目", "submit-v2-project-closure"],
    "confirm-v2-project-closure-undo": ["撤销结束项目", "我确认恢复为进行中并移除本次完成回顾；只有项目结束后没有新变化时才会生效，页面与正文不会改变", "submit-v2-project-closure-undo"],
    "confirm-v2-project-creation": ["确认创建项目", "我已检查最终阅读结果与页面关系；系统会重新检查来源，只创建或复用已审阅的主页面", "submit-v2-project-creation"],
    "confirm-v2-project-creation-undo": ["撤销项目创建", "我确认撤销正式项目；复用的来源页面会原样保留，专用页面只有仍属于本次操作且保持为空时才会删除", "submit-v2-project-creation-undo"],
    "confirm-v2-project-structure": ["确认更新项目", "我已检查目标、成果、推进阶段、项目摘要和当前推进；系统会重新检查版本，不改写 Logseq 正文", "submit-v2-project-structure-commit"],
    "confirm-v2-project-structure-undo": ["撤销项目更新", "我确认恢复审阅前的完整项目信息；只有项目没有后续正式变化时才会生效，归属和位置不会改变", "submit-v2-project-structure-undo"],
    "confirm-v2-mini-project-restructure": ["确认整理 MiniProject", "我已检查最终阅读结果、移动数量和零删除边界；系统会重新检查全部材料，保留已有内容身份，并在失败时恢复", "submit-v2-mini-project-restructure"],
    "confirm-v2-mini-project-restructure-undo": ["撤销 MiniProject 整理", "我确认恢复原材料结构；只有全部材料仍等于已应用结果时才会开始", "submit-v2-mini-project-restructure-undo"],
    "confirm-v2-ownership": ["确认调整主归属", "我已确认新的主归属；系统会重新检查相关事项，正文、位置和普通关联不会改变", "submit-v2-ownership"],
    "confirm-v2-ownership-undo": ["撤销主归属变化", "我确认恢复审阅前的主归属（或恢复为未归属）；只有当前归属没有后续修改时才会生效，正文和位置不会改变", "submit-v2-ownership-undo"],
    "confirm-v2-undo": ["撤销本次应用", "我确认撤销；只有正文和事项均未被后续修改时才会生效", "submit-v2-proposal-undo"],
  };
  const confirmation = confirmations[dialog.kind];
  if (confirmation) {
    const isReviewOnly = dialog.kind === "confirm-v2-review-accept";
    const isUndo = dialog.kind.includes("undo");
    const proposalId = dialog.value.split("|")[0] ?? "";
    const continuation = !isReviewOnly && !isUndo ? proposalContinuationStatus(model, proposalId) : undefined;
    const recovering = continuation === "RECOVERY_REQUIRED";
    const continuing = continuation === "PENDING";
    const title = recovering ? "恢复到安全状态" : continuing ? "继续上次修改" : confirmation[0];
    const statement = recovering
      ? "我确认沿用同一恢复记录；系统会重新检查已完成步骤，并完成剩余步骤或安全补偿，不会创建重复修改"
      : continuing
        ? "我确认沿用原记录继续；系统会重新检查当前内容，并跳过已经完成的步骤"
        : confirmation[1];
    const actionLabel = recovering ? "确认恢复" : continuing ? "确认继续" : isReviewOnly ? "确认方案" : isUndo ? "确认撤销" : "确认应用";
    const eyebrow = recovering ? "恢复操作 · 沿用同一恢复记录" : continuing ? "继续原修改 · 沿用原记录" : isReviewOnly ? "审阅方案 · 尚未应用" : isUndo ? "撤销操作" : "确认应用 · 点击后正式生效";
    const context = focusedConfirmationContext(model, dialog);
    return `<section class="inbox-dialog action-dialog" aria-label="${escapeHtml(title)}"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h3>${escapeHtml(title)}</h3>${context}<label class="confirm-line"><input type="checkbox" data-field="actionConfirmed">${escapeHtml(statement)}</label><div class="actions">${button(actionLabel, confirmation[2], dialog.value, isReviewOnly ? "primary" : "danger")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-review-defer") return `<section class="inbox-dialog action-dialog" aria-label="暂缓 V2 语义组"><h3>暂缓语义组</h3><label>复查时间<input type="datetime-local" step="60" aria-describedby="v2-defer-local-time" data-field="v2DeferredUntil"></label>${localTimeHint("v2-defer-local-time")}<label>原因<input data-field="v2DeferReason" value="等待更多上下文"></label><div class="actions">${button("确认暂缓", "submit-v2-review-defer", dialog.value, "primary")}${cancel}</div></section>`;
  return "";
}

function userFacingGlobalError(model: UiModel, outcome: ScopedOutcome | undefined): string | undefined {
  const error = outcome?.kind === "error" ? outcome.message : model.outcome ? undefined : model.error;
  if (!error) return undefined;
  if (model.v2SemanticCommits?.some((commit) => commit.status === "RECOVERY_REQUIRED")) {
    return "这次修改需要先恢复到安全状态。原内容不会被静默覆盖，请按当前恢复指引处理。";
  }
  if (model.v2SemanticCommits?.some((commit) => commit.status === "PENDING")) {
    return "这次修改没有完成。已完成步骤已经安全保存，请继续原修改。";
  }
  return error;
}

export function renderApp(model: UiModel): string {
  const sessionEnded = model.v2ManagedRuntimeState === "ENDED";
  const labels: Array<[PrimaryWorkspace, Workspace, string]> = sessionEnded
    ? [["more", "more", "更多"]]
    : [
        ["now", "now", "现在"],
        ["review", "review", "待我确认"],
        ["projects", "reentry", "项目"],
        ["more", "more", "更多"],
      ];
  const activePrimary = primaryWorkspace(model.workspace);
  const changes = recentChanges(model);
  const scope = activeOutcomeScope({ workspace: model.workspace, ...(model.actionDialog?.kind ? { actionDialogKind: model.actionDialog.kind } : {}) });
  const legacyOutcome = createScopedOutcome({
    actionId: "legacy-render",
    scope,
    ...(model.message ? { message: model.message } : {}),
    ...(model.error ? { error: model.error } : {}),
    ...(model.recentActionCommitId ? { commitId: model.recentActionCommitId } : {}),
  });
  const outcome = outcomeForScope(model.outcome ?? legacyOutcome, scope);
  const immediateResult = outcome?.kind === "result" && outcome.commitId
    ? renderImmediateResult({ ...model, recentActionCommitId: outcome.commitId }, changes)
    : "";
  const globalError = userFacingGlobalError(model, outcome);
  const copilotState = sessionEnded
    ? "本次使用已结束 · 正文仍可编辑"
    : model.v2ProviderAvailable
    ? "Copilot 可用 · 建议需审阅"
    : model.agent.enabled
      ? `Agent Demo · ${escapeHtml(model.agent.providerId)}`
      : "Copilot 未配置 · 基础事务系统可用";
  if (model.actionDialog) {
    const activeSurface = renderActionDialog(model) || `<section class="inbox-dialog action-dialog" role="alert"><div class="eyebrow">当前操作已变化</div><h3>回到原工作区重新开始</h3><p>这次表单所依赖的内容已经不可用；没有执行正式修改。</p><div class="actions">${button("返回", "cancel-action-dialog", undefined, "primary")}</div></section>`;
    const dialogOutcome = outcomeForScope(model.outcome, activeOutcomeScope({ workspace: model.workspace, actionDialogKind: model.actionDialog.kind }));
    const dialogError = dialogOutcome?.kind === "error"
      ? `<div class="notice error dialog-error" role="alert"><strong>未完成：</strong>${escapeHtml(dialogOutcome.message)}<span>系统不会静默覆盖或重复提交。</span></div>`
      : "";
    return `<div class="surface-veil" aria-hidden="true"></div><section class="app-shell active-surface-shell">
      <header class="topbar">
        <div><div class="eyebrow">个人事务运行系统</div><h1>Task Copilot</h1></div>
      </header>
      ${dialogError}
      <main class="workspace active-surface" data-workspace="${model.workspace}">${activeSurface}</main>
    </section>`;
  }
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
      <div class="top-actions">${sessionEnded ? "" : button("整理当前页", "v2-candidate-open", undefined, "primary")}${button(model.originReturnLabel ?? "关闭", "close", undefined, "quiet")}</div>
    </header>
    <div class="agent-state ${!sessionEnded && (model.v2ProviderAvailable || model.agent.enabled) ? "enabled" : "disabled"}">${copilotState}</div>
    ${outcome?.kind === "notice" && outcome.message && !immediateResult ? `<div class="notice" data-outcome-scope="${escapeHtml(outcome.scope)}">${escapeHtml(outcome.message)}</div>` : ""}
    ${immediateResult}
    ${globalError ? `<div class="error"><strong>未完成：</strong>${escapeHtml(globalError)}<span>系统不会静默覆盖或重复提交。</span></div>` : ""}
    <nav aria-label="主要工作区">${labels.map(([id, target, label]) => `<button class="${activePrimary === id ? "active" : ""}" data-action="view" data-value="${target}"${activePrimary === id ? ' aria-current="page"' : ""}>${label}</button>`).join("")}</nav>
    <main class="workspace" data-workspace="${model.workspace}">${renderActionDialog(model)}${sectionNavigation(model)}${body}</main>
  </section>`;
}
