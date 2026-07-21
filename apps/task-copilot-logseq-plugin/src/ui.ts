import type {
  AuditProjection,
  NowWorkView,
  ObjectDetailView,
  ProposalImpactView,
  ProjectReentryView,
} from "@task-copilot/application";
import { allowedPhaseTransitions, type AttentionSignal, type Capture, type DomainEvent, type ManagedObject, type Proposal, type SemanticCommit, type SemanticOperation, type V2Association, type V2Candidate, type V2ManagedObject, type V2PrimaryOwnership } from "@task-copilot/domain";
import type { ServiceMigrationRun, ServiceNowWork, ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";
import type { ObservableActionState } from "./inbox-action-controller.ts";
import { renderV2ExplicitCandidateDiscoveryPanel, type V2ExplicitCandidatePanelState } from "./v2-explicit-candidate-discovery.ts";

export type Workspace = "inbox" | "now" | "objects" | "review" | "reentry" | "migration" | "audit";
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
  | "confirm-v2-commit"
  | "confirm-v2-project-closure"
  | "confirm-v2-ownership"
  | "confirm-v2-ownership-undo"
  | "confirm-v2-undo"
  | "v2-condition"
  | "v2-deadline"
  | "v2-review-defer";

export interface UiModel {
  workspace: Workspace;
  agent: { enabled: boolean; providerId: string };
  inbox: Capture[];
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
  inboxActionStates?: Record<string, ObservableActionState>;
  inboxDialog?: { captureId: string; kind: "formalize" | "proposal" | "link" | "defer" | "dismiss" };
  actionDialog?: { kind: ActionDialogKind; value: string };
  v2ProjectCreationAvailable?: boolean;
  v2Objects?: V2ManagedObject[];
  v2Associations?: V2Association[];
  v2PrimaryOwnerships?: V2PrimaryOwnership[];
  v2RelationLoadError?: string;
  v2AssociationAvailable?: boolean;
  v2AssociationBusy?: boolean;
  v2OwnershipCommitBusy?: boolean;
  v2Proposals?: ServiceStoredProposal[];
  v2SemanticCommits?: ServiceSemanticCommit[];
  v2NowWork?: ServiceNowWork;
  v2NowWorkTypeFilter?: V2NowWorkTypeFilter;
  v2NowWorkGrouping?: V2NowWorkGrouping;
  v2CandidatePanel?: V2ExplicitCandidatePanelState;
  v2Candidates?: V2Candidate[];
  v2CandidateSourcePreviews?: Record<string, string>;
  v2CandidateAvailable?: boolean;
  v2ProviderAvailable?: boolean;
  v2ProviderState?: { status: "idle" | "loading" | "success" | "error"; message?: string };
  reviewMode?: "candidates" | "proposals";
  v2ProposalLoadError?: string;
  v2MigrationRuns?: ServiceMigrationRun[];
  v2MigrationLoadError?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function button(label: string, action: string, value?: string, className = "", disabled = false): string {
  return `<button type="button" class="${className}" data-action="${action}"${value ? ` data-value="${escapeHtml(value)}"` : ""}${disabled ? " disabled aria-busy=\"true\"" : ""}>${escapeHtml(label)}</button>`;
}

function empty(title: string, detail: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function renderInbox(model: UiModel): string {
  if (model.inbox.length === 0) return empty("Inbox 已清空", "选择一个 Logseq Block 后使用“捕获当前块”。");
  return `<div class="cards">${model.inbox
    .map(
      (capture) => {
        const states = Object.entries(model.inboxActionStates ?? {}).filter(([key]) => key.endsWith(`:${capture.captureId}`)).map(([, state]) => state);
        const loading = states.some((state) => state.status === "loading");
        const feedback = states.slice().reverse().find((state) => state.status !== "idle");
        const dialog = model.inboxDialog?.captureId === capture.captureId ? renderInboxDialog(model, capture) : "";
        return `<article class="card">
        <div class="eyebrow">${escapeHtml(capture.phase)} · ${escapeHtml(new Date(capture.capturedAt).toLocaleString("zh-CN"))}</div>
        <p class="natural-text">${escapeHtml(capture.originalText)}</p>
        <p class="muted">来源：${escapeHtml(capture.sourcePage && !/^\d+$/.test(capture.sourcePage) ? capture.sourcePage : "未知来源")}</p>
        ${capture.sourceConflict ? `<p class="action-error">${escapeHtml(capture.sourceConflict.message)}</p>` : ""}
        <div class="actions">
          ${button(loading ? "处理中…" : "打开来源", "open-source", capture.captureId, "quiet", loading)}
          ${button("手工正式化", "manual-formalize", capture.captureId, "", loading)}
          ${button("创建手工 Proposal", "create-manual-proposal", capture.captureId, "quiet", loading)}
          ${model.agent.enabled ? button("生成 Demo Proposal", "generate-proposal", capture.captureId, "", loading) : ""}
          ${button("关联现有对象", "link-existing-object", capture.captureId, "quiet", loading)}
          ${button("暂缓", "defer", capture.captureId, "quiet", loading)}
          ${button("无需行动", "no-action", capture.captureId, "quiet", loading)}
        </div>
        ${capture.deferredUntil ? `<p class="muted">暂缓至：${escapeHtml(capture.deferredUntil)}${capture.deferReason ? ` · ${escapeHtml(capture.deferReason)}` : ""}</p>` : ""}
        ${feedback ? `<div class="action-feedback ${feedback.status}"><strong>${escapeHtml(feedback.status === "loading" ? "处理中" : feedback.status === "success" ? "已完成" : "操作失败")}</strong><span>${escapeHtml(feedback.message ?? "")}</span>${feedback.correlationId ? `<code>诊断 ID：${escapeHtml(feedback.correlationId)}</code>` : ""}${feedback.status === "error" ? "<small>Capture 保持安全，原始 Logseq 内容未修改。请复制 Diagnostics 后重试。</small>" : ""}</div>` : ""}
        ${dialog}
      </article>`;
      },
    )
    .join("")}</div>`;
}

function renderInboxDialog(model: UiModel, capture: Capture): string {
  const dialog = model.inboxDialog!;
  const cancel = button("取消", "cancel-inbox-dialog", capture.captureId, "quiet");
  if (dialog.kind === "formalize") return `<section class="inbox-dialog" aria-label="手工正式化"><h3>手工正式化</h3><label>对象类型<select data-field="objectType"><option>TASK</option><option>MINI_PROJECT</option><option>PROJECT</option><option>AREA</option></select></label><label>正式正文<textarea data-field="text">${escapeHtml(capture.originalText)}</textarea></label><label>完成标准<textarea data-field="completionCriteria"></textarea></label><label>下一步<textarea data-field="nextAction"></textarea></label><label>可选主归属<select data-field="ownerId"><option value="">待确认归属</option>${model.objects.map((object) => `<option value="${escapeHtml(object.objectId)}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)}</option>`).join("")}</select></label><label class="confirm-line"><input type="checkbox" data-field="ownerConfirmed" value="yes">若选择主归属，我单独确认这项高影响变化</label><div class="actions">${button("创建并解决 Capture", "submit-formalize", capture.captureId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "proposal") return `<section class="inbox-dialog" aria-label="创建手工 Proposal"><h3>创建手工 Proposal</h3><label>建议正文<textarea data-field="suggestedText">${escapeHtml(capture.originalText)}</textarea></label><div class="actions">${button("创建并进入 Review", "submit-manual-proposal", capture.captureId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "link") return `<section class="inbox-dialog" aria-label="关联现有对象"><h3>关联现有对象</h3><label>按标题、类型或 ID 选择<input data-field="objectSearch" list="objects-${escapeHtml(capture.captureId)}"></label><datalist id="objects-${escapeHtml(capture.captureId)}">${model.objects.map((object) => `<option value="${escapeHtml(object.objectId)}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)}</option>`).join("")}</datalist><div class="actions">${button("建立来源关系", "submit-link-existing", capture.captureId, "primary")}${cancel}</div></section>`;
  if (dialog.kind === "defer") return `<section class="inbox-dialog" aria-label="暂缓 Capture"><h3>暂缓</h3><label>复查时间<input type="datetime-local" data-field="deferredUntil"></label><label>原因<input data-field="deferReason" value="等待更多上下文"></label><div class="actions">${button("确认暂缓", "submit-defer", capture.captureId, "primary")}${cancel}</div></section>`;
  return `<section class="inbox-dialog" aria-label="无需行动确认"><h3>确认无需行动？</h3><p>Capture 与审计会保留，原始 Logseq Block 不会删除。</p><label>原因<input data-field="dismissReason" value="无需行动"></label><div class="actions">${button("确认并保留历史", "submit-no-action", capture.captureId, "danger")}${cancel}</div></section>`;
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
    const cards = (values: ServiceNowWork["next"], kind: "focus" | "candidate") => values.map((item, index) => `<article class="card compact"><div class="eyebrow">${escapeHtml(item.objectType)} · ${escapeHtml(item.condition.kind)}</div><h3>${escapeHtml(item.text)}</h3><p>${escapeHtml(item.reason)}</p>${item.dueAt ? `<p class="muted">期限：${escapeHtml(new Date(item.dueAt).toLocaleString("zh-CN"))}</p>` : ""}<div class="actions">${item.primaryAnchorExternalId ? button("打开正文", "v2-open-primary-anchor", item.primaryAnchorExternalId, "quiet") : ""}${button("更新状态", "v2-condition-open", `${item.objectId}|${item.version}`, "quiet")}${item.objectType === "TASK" ? button("设置期限", "v2-deadline-open", `${item.objectId}|${item.version}|${item.dueAt ?? ""}`, "quiet") : ""}${kind === "focus" ? `${orderingAvailable ? `${button("上移", "v2-focus-up", item.objectId, "quiet", index === 0)}${button("下移", "v2-focus-down", item.objectId, "quiet", index === values.length - 1)}` : ""}${button("移出关注", "v2-focus-remove", `${item.objectId}|${item.version}`, "quiet")}` : focusIds.has(item.objectId) ? `<span class="muted">已在当前关注</span>` : button("加入关注", "v2-focus-add", `${item.objectId}|${item.version}`, "quiet")}</div></article>`).join("");
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
    return `${controls}${content || empty("当前筛选下没有事项", "普通 Waiting 保持安静；可切换类型查看当前投影。")}`;
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

function renderObjects(model: UiModel): string {
  const relationError = model.v2RelationLoadError ? `<section class="card error" role="alert"><strong>关系投影暂不可用</strong><p>${escapeHtml(model.v2RelationLoadError)}</p><p class="muted">正式对象与其他工作区仍可使用；没有执行关系写入。</p></section>` : "";
  const projectCreator = `<section class="card project-creator" aria-label="创建 Project 页面"><div class="eyebrow">V2 · Project 原子创建</div><h3>新建 Project</h3><p class="muted">创建受控的 Project/&lt;名称&gt; 页面，并在页面验证后一次性写入 SQLite。</p><label>Project 名称<input data-field="v2ProjectName" placeholder="例如：告警推送治理"${model.v2ProjectCreationAvailable ? "" : " disabled"}></label>${button("创建 Project 与页面", "create-v2-project", undefined, "primary", !model.v2ProjectCreationAvailable)}</section>`;
  const associationCreator = model.v2Objects && model.v2Objects.length >= 2 ? `<section class="card association-creator" aria-label="添加普通 Association"><div class="eyebrow">V2 · 普通关联</div><h3>关联两个正式对象</h3><p class="muted">只表达“相关”，不会改变 Primary Ownership、位置、Lifecycle 或 Focus。</p><label>来源对象<select data-field="v2AssociationSource"><option value="">请选择</option>${model.v2Objects.map((object) => `<option value="${escapeHtml(object.objectId)}" data-version="${object.version}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)} · v${object.version}</option>`).join("")}</select></label><label>目标对象<select data-field="v2AssociationTarget"><option value="">请选择</option>${model.v2Objects.map((object) => `<option value="${escapeHtml(object.objectId)}">${escapeHtml(object.objectType)} · ${escapeHtml(object.text)}</option>`).join("")}</select></label><label class="confirm-line"><input type="checkbox" data-field="v2AssociationConfirmed" value="yes">确认添加普通 Association，不改变归属</label>${button(model.v2AssociationBusy ? "正在添加…" : "添加 Association", "v2-association-add", undefined, "primary", !model.v2AssociationAvailable || model.v2AssociationBusy)}${model.v2Associations?.length ? `<p class="muted">当前已有 ${model.v2Associations.length} 条普通 Association。</p>` : ""}</section>` : "";
  if (model.v2Objects !== undefined) {
    if (model.v2Objects.length === 0) return `${projectCreator}${empty("还没有正式对象", "从 Review Center 正式化，或创建 V2 Project 页面。")}`;
    const objectLabels = new Map(model.v2Objects.map((object) => [object.objectId, `${object.objectType} · ${object.text}`]));
    const ownershipList = (model.v2PrimaryOwnerships ?? []).length ? `<section aria-label="Primary Ownership 列表"><h2>Primary Ownership</h2><div class="object-list">${(model.v2PrimaryOwnerships ?? []).slice(0, 100).map((ownership) => `<article class="object-row"><span>${escapeHtml(objectLabels.get(ownership.childObjectId) ?? ownership.childObjectId)} → ${escapeHtml(objectLabels.get(ownership.ownerObjectId) ?? ownership.ownerObjectId)}</span><small>唯一主归属</small></article>`).join("")}</div>${(model.v2PrimaryOwnerships?.length ?? 0) > 100 ? `<p class="muted">仅显示前 100 条；完整投影仍由 Local Service 提供。</p>` : ""}</section>` : "";
    const visibleAssociations = (model.v2Associations ?? []).slice(0, 100);
    const associationList = visibleAssociations.length ? `<section aria-label="普通 Association 列表"><h2>普通 Association</h2><div class="object-list">${visibleAssociations.map((association) => `<article class="object-row"><span>${escapeHtml(objectLabels.get(association.sourceObjectId) ?? association.sourceObjectId)} → ${escapeHtml(objectLabels.get(association.targetObjectId) ?? association.targetObjectId)}</span><small>${escapeHtml(association.associationKind)} · ${escapeHtml(association.status)}</small></article>`).join("")}</div>${(model.v2Associations?.length ?? 0) > visibleAssociations.length ? `<p class="muted">仅显示前 ${visibleAssociations.length} 条；完整投影仍由 Local Service 提供。</p>` : ""}</section>` : "";
    const list = `<section aria-label="V2 正式对象"><h2>正式对象</h2><div class="object-list">${model.v2Objects.map((object) => `<article class="object-row"><span>${escapeHtml(object.text)}</span><small>${escapeHtml(object.objectType)} · ${escapeHtml(object.lifecycle)} · ${escapeHtml(object.condition.kind)} · v${escapeHtml(object.version)}</small>${object.closure ? `<details class="project-closure" open><summary>Project Closure</summary><p><strong>原始目标：</strong>${escapeHtml(object.closure.originalGoal)}</p><p><strong>实际结果：</strong>${escapeHtml(object.closure.actualResult)}</p><p><strong>主要交付：</strong>${escapeHtml(object.closure.majorDeliverables.join("；") || "无")}</p><p><strong>未完成 Objective：</strong>${object.closure.incompleteObjectives.length ? object.closure.incompleteObjectives.map((item) => `${escapeHtml(item.objective)}（${escapeHtml(item.reason)} → ${escapeHtml(item.nextStep)}）`).join("；") : "无"}</p><p><strong>遗留去向：</strong>${escapeHtml(object.closure.legacyDisposition)}</p><p><strong>关键 Decision：</strong>${escapeHtml(object.closure.keyDecisions.join("；") || "无")}</p><p><strong>未来重入：</strong>${escapeHtml(object.closure.futureSummary)}</p></details>` : ""}</article>`).join("")}</div></section>`;
    return `${projectCreator}${relationError}${associationCreator}${ownershipList}${associationList}${list}`;
  }
  if (model.objects.length === 0) return `${projectCreator}${empty("还没有正式对象", "从 Inbox 手工正式化，或创建 V2 Project 页面。")}`;
  const list = `<div class="object-list">${model.objects
    .map(
      (object) => `<button class="object-row" data-action="select-object" data-value="${escapeHtml(object.objectId)}">
        <span>${escapeHtml(object.text)}</span><small>${escapeHtml(object.objectType)} · ${escapeHtml(object.phase)} · ${escapeHtml(object.condition.kind)}</small>
      </button>`,
    )
    .join("")}</div>`;
  const detailView = model.selectedObjectDetail;
  if (!detailView) return `${projectCreator}${list}`;
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
  const tabs = `<div class="actions review-modes" role="tablist" aria-label="审阅中心视图">${button(`待整理${candidateCount ? ` (${candidateCount})` : ""}`, "review-mode", "candidates", reviewMode === "candidates" ? "primary" : "quiet")}${button(`待审阅${proposalCount ? ` (${proposalCount})` : ""}`, "review-mode", "proposals", reviewMode === "proposals" ? "primary" : "quiet")}</div>`;
  if (reviewMode === "candidates") {
    const providerState = model.v2ProviderState ?? { status: "idle" as const };
    const providerPanel = model.v2ProviderAvailable
      ? `<section class="card compact"><div class="eyebrow">局部语义 · DeepSeek Provider</div><h3>分析当前选中 Block</h3><p>只生成可审阅 Proposal；普通记录会返回理由且零写入。不会自动扫描页面或修改正式状态。</p><div class="actions">${button(providerState.status === "loading" ? "分析中…" : "分析当前块", "v2-provider-analyze-current-block", undefined, "primary", providerState.status === "loading")}</div>${providerState.message ? `<div class="${providerState.status === "error" ? "error" : "notice"}">${escapeHtml(providerState.message)}</div>` : ""}</section>`
      : "";
    return `${tabs}${providerPanel}${candidatePanel || empty("当前不可扫描候选", "Local Service 就绪后，可手动扫描当前页；不会自动扫描全 Graph。")}`;
  }
  const v2LoadError = model.v2ProposalLoadError ? `<div class="error"><strong>V2 审阅队列未加载：</strong>${escapeHtml(model.v2ProposalLoadError)}<span>没有修改任何 Proposal 或正式状态。</span></div>` : "";
  const v2Cards = v2.map((record) => {
    const acceptedGroups = record.proposal.groups.filter((group) => group.disposition === "ACCEPTED");
    const hasAcceptedGroup = acceptedGroups.length > 0;
    const isProjectClosure = acceptedGroups.length === 1
      && acceptedGroups[0]!.risk === "HIGH"
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length === 2
      && acceptedGroups[0]!.semanticOperations.some((operation) => operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload)
      && acceptedGroups[0]!.semanticOperations.some((operation) => operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.lifecycle === "COMPLETED");
    const isOwnershipChange = acceptedGroups.length === 1
      && acceptedGroups[0]!.risk === "HIGH"
      && acceptedGroups[0]!.textPatches.length === 0
      && acceptedGroups[0]!.semanticOperations.length === 1
      && acceptedGroups[0]!.semanticOperations[0]!.kind === "CHANGE_OWNERSHIP";
    const originalCommit = model.v2SemanticCommits?.find((commit) => commit.proposalId === record.proposal.proposalId && commit.semanticCommitId.startsWith("proposal-commit:"));
    const ownershipUndoCommit = originalCommit ? model.v2SemanticCommits?.find((commit) => commit.semanticCommitId === `ownership-undo:${originalCommit.semanticCommitId}`) : undefined;
    const canCommit = hasAcceptedGroup && (record.proposal.status === "ACCEPTED" || record.proposal.status === "PARTIALLY_ACCEPTED");
    const canOwnershipUndo = isOwnershipChange && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED" && ownershipUndoCommit?.status !== "FAILED";
    const canUndo = !isProjectClosure && !isOwnershipChange && record.proposal.status === "APPLIED" && originalCommit?.status === "COMPLETED";
    return `<article class="card proposal v2-proposal">
    <div class="eyebrow">V2 · ${escapeHtml(record.proposal.source.kind)}${record.proposal.source.model ? ` · ${escapeHtml(record.proposal.source.model)}` : ""} · ${escapeHtml(record.proposal.status)} · ${escapeHtml(record.updatedAt)}</div>
    <h3>${escapeHtml(record.proposal.title)}</h3>
    <p><strong>当前上下文：</strong>${escapeHtml(record.proposal.context)}</p>
    <p><strong>理解与逻辑：</strong>${escapeHtml(record.proposal.understanding)} · ${escapeHtml(record.proposal.logic)}</p>
    <section class="suggestion"><h4>最终可读预览</h4><p>${escapeHtml(record.proposal.finalPreview)}</p></section>
    ${record.proposal.groups.map((group) => `<section class="operation risk-${group.risk.toLowerCase()}"><div><code>${escapeHtml(group.groupId)}</code><span>${escapeHtml(group.disposition)} · ${escapeHtml(group.risk)}</span></div><p>${escapeHtml(group.explanation)}</p>${group.textPatches.map((patch) => `<div class="readable-diff"><del>${escapeHtml(patch.beforeText)}</del><ins>${escapeHtml(patch.afterText)}</ins></div>`).join("")}<div class="report"><strong>语义 Diff</strong>${group.semanticOperations.map((operation) => `<p>${escapeHtml(operation.kind)}：${escapeHtml(operation.summary)}</p>`).join("") || "<p>无</p>"}</div>${group.disposition === "PENDING" || group.disposition === "DEFERRED" ? `<div class="actions">${button("接受该语义组", "v2-review-accept", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}|${group.risk}`, "primary")}${button("拒绝", "v2-review-reject", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}`, "quiet")}${button("暂缓", "v2-review-defer", `${record.proposal.proposalId}|${group.groupId}|${record.updatedAt}`, "quiet")}</div>` : ""}</section>`).join("")}
    ${canCommit ? `<div class="actions">${button("提交前检查", "v2-proposal-revalidate", `${record.proposal.proposalId}|${record.updatedAt}`, "quiet")}${button(isProjectClosure ? "确认完成 Project" : isOwnershipChange ? "确认改变主归属" : "确认最终提交", isProjectClosure ? "v2-project-closure-commit" : isOwnershipChange ? "v2-ownership-commit" : "v2-proposal-commit", `${record.proposal.proposalId}|${record.updatedAt}`, "primary", isOwnershipChange && model.v2OwnershipCommitBusy === true)}</div>` : canOwnershipUndo ? `<div class="actions">${button("撤销主归属变化", "v2-ownership-undo", originalCommit.semanticCommitId, "danger", model.v2OwnershipCommitBusy === true)}</div>` : canUndo ? `<div class="actions">${button("撤销本次生效", "v2-proposal-undo", originalCommit.semanticCommitId, "danger")}</div>` : ""}
    <div class="notice">${canOwnershipUndo ? `Primary Ownership 已正式生效 · Commit ${escapeHtml(originalCommit.semanticCommitId)}；可恢复到审阅前主归属，且不会移动正文。` : ownershipUndoCommit?.status === "FAILED" ? "对象或 Primary Ownership 已有后续变化；Undo 已安全终止且没有覆盖当前状态。" : canUndo ? `已正式生效 · Commit ${escapeHtml(originalCommit.semanticCommitId)}；可撤销且不会覆盖后续编辑。` : originalCommit?.status === "UNDONE" ? "原 Commit 已撤销；Audit 与逆向 Commit 历史均保留。" : isProjectClosure && record.proposal.status === "APPLIED" ? `Project Closure 已正式生效 · Commit ${escapeHtml(originalCommit?.semanticCommitId ?? "")}；Project 已退出活跃视图，页面保留。` : isOwnershipChange && record.proposal.status === "APPLIED" ? `Primary Ownership 已正式生效 · Commit ${escapeHtml(originalCommit?.semanticCommitId ?? "")}；位置、Anchor 与 Association 未改变。` : hasAcceptedGroup ? `已接受的语义组尚未正式生效；最终确认会在同一流程中重验并${isProjectClosure ? "原子记录 Closure 与完成状态" : isOwnershipChange ? "原子改变唯一 Primary Ownership" : "写入并显示 Undo"}。` : "审阅决定只更新 Proposal；尚未修改正式正文或对象。"}</div>
  </article>`;
  }).join("");
  if (open.length === 0 && v2.length === 0 && !v2LoadError) return `${tabs}${empty("没有待审查 Proposal", model.agent.enabled ? "从 Inbox 生成确定性 Demo Proposal。" : "Agent 已关闭；基础事务系统仍可使用。")}`;
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

function renderReentry(model: UiModel): string {
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

function renderAudit(model: UiModel): string {
  const commits = model.commits.length
    ? `<section><h2>SemanticCommit</h2><div class="cards">${model.commits
        .slice()
        .reverse()
        .map((commit) => `<article class="card compact">
          <div class="eyebrow">${escapeHtml(commit.status)} · ${escapeHtml(commit.updatedAt)}</div><code>${escapeHtml(commit.semanticCommitId)}</code>
          ${commit.error ? `<p class="error">${escapeHtml(commit.error.code)} · ${escapeHtml(commit.error.message)}</p>` : ""}
          ${commit.textMutations.map((mutation) => `<details><summary>正文 before / after · ${escapeHtml(mutation.externalId)}</summary><del>${escapeHtml(mutation.beforeText)}</del><ins>${escapeHtml(mutation.afterText)}</ins></details>`).join("")}
          ${commit.domainChanges.map((change) => `<details><summary>${escapeHtml(change.entityType)} · ${escapeHtml(change.entityId)}</summary><pre>${escapeHtml(JSON.stringify({ before: change.before ?? null, after: change.after ?? null }, null, 2))}</pre></details>`).join("")}
          ${model.auditProjection.undoableCommitIds.includes(commit.semanticCommitId) ? button("撤销", "undo-commit", commit.semanticCommitId, "danger") : ""}
        </article>`)
        .join("")}</div></section>`
    : "";
  const events = model.events.length
    ? `<section><h2>最近事件</h2><ol class="timeline">${model.events.slice(0, 20).map((event) => `<li><time>${escapeHtml(event.timestamp)}</time><span>${escapeHtml(event.operationType)}</span></li>`).join("")}</ol></section>`
    : "";
  const anchorConflicts = model.auditProjection.anchorConflicts;
  const anchors = anchorConflicts.length
    ? `<section><h2>Anchor Conflict</h2><div class="cards">${anchorConflicts.map((anchor) => `<article class="card compact">
      <div class="eyebrow">${escapeHtml(anchor.status)} · ${escapeHtml(anchor.observedAt)}</div><code>${escapeHtml(anchor.anchorId)}</code>
      <p>来源：${escapeHtml(anchor.source)} · Graph ${escapeHtml(anchor.graphId)}</p>
      <details open><summary>预期版本 / 当前版本</summary><del>${escapeHtml(anchor.expectedText)}</del><ins>${escapeHtml(anchor.currentText ?? "Block 缺失，无法读取当前正文")}</ins></details>
      <p class="muted">处理选项：${escapeHtml(anchor.options.join("；"))}</p>
    </article>`).join("")}</div></section>`
    : "";
  return `<div class="audit-actions">${button("创建备份并导出", "export-backup", undefined, "primary")}${button("验证最近恢复包", "verify-backup")}${button("扫描 Pending Commit", "recover-pending")}${button("扫描 Anchor", "scan-anchors")}</div>
    ${model.recoveryReport ? `<div class="report">${escapeHtml(model.recoveryReport)}</div>` : ""}
    ${commits || events || anchors ? `${commits}${events}${anchors}` : empty("还没有审计事件", "捕获和正式变更会记录在这里。")}`;
}

function renderMigration(model: UiModel): string {
  if (model.v2MigrationLoadError) return `<section><h2>V1 → V2 迁移</h2><div class="error"><strong>迁移状态不可用：</strong>${escapeHtml(model.v2MigrationLoadError)}<span>没有执行扫描、导入或状态切换。</span></div></section>`;
  const runs = model.v2MigrationRuns ?? [];
  const guidance = `<section class="card"><div class="eyebrow">手动 · 可恢复 · SQLite 单一权威</div><h2>V1 → V2 迁移</h2><p>Recovery Bundle 只由 CLI 显式读取；插件不保存正文副本，也不会自动扫描或迁移。</p><p class="muted">顺序：scan → preview → backup → import → verify → activate。导入前可用 show 查看 Run；未激活且未变化的批次可 Undo。</p></section>`;
  if (!runs.length) return `${guidance}${empty("还没有迁移 Run", "先在终端执行 tc migration scan 与 tc migration preview；完成审阅前不会写入正式状态。")}`;
  const cards = runs.map((run) => `<article class="card compact"><div class="eyebrow">${escapeHtml(run.status)} · ${escapeHtml(new Date(run.updatedAt).toLocaleString("zh-CN"))}</div><h3>${escapeHtml(run.runId)}</h3><p>${escapeHtml(run.summary.total)} 项已审阅 · ${escapeHtml(run.summary.import)} 项导入 · ${escapeHtml(run.summary.defer)} 项暂缓 · ${escapeHtml(run.summary.exclude)} 项排除</p><p class="muted">源：${escapeHtml(run.sourceBundleSha256.slice(0, 12))}…${run.snapshotBackupId ? ` · 恢复点：${escapeHtml(run.snapshotBackupId)}` : " · 尚未绑定恢复点"}</p><p>${run.status === "PREVIEWED" ? "下一步：创建并校验 Backup，再明确确认 Import。" : run.status === "IMPORTING" ? "下一步：验证已导入批次；Service 重启后可继续。" : run.status === "VERIFIED" ? "下一步：确认所有审阅结果后显式 Activate。" : run.status === "ACTIVATED" ? "V2 SQLite 已激活；V1 只保留为只读历史与恢复证据。" : "请使用 tc migration show 查看结构化错误与证据。"}</p></article>`).join("");
  return `${guidance}<section><h2>最近迁移</h2><div class="cards">${cards}</div></section>`;
}

function renderActionDialog(model: UiModel): string {
  const dialog = model.actionDialog;
  if (!dialog) return "";
  const cancel = button("取消", "cancel-action-dialog", undefined, "quiet");
  if (dialog.kind === "v2-condition") {
    const objectId = dialog.value.split("|")[0];
    const current = model.v2NowWork ? [...model.v2NowWork.focus, ...model.v2NowWork.next, ...model.v2NowWork.waitingReview].find((item) => item.objectId === objectId) : undefined;
    const blockerObjectId = current?.condition.kind === "BLOCKED" ? current.condition.blockerObjectId : undefined;
    const blockers = model.v2NowWork?.conditionOptions.filter((option) => option.objectId !== objectId).map((option) => `<option value="${escapeHtml(option.objectId)}"${option.objectId === blockerObjectId ? " selected" : ""}>${escapeHtml(option.objectType)} · ${escapeHtml(option.text)}</option>`).join("") ?? "";
    return `<section class="inbox-dialog action-dialog" aria-label="更新 V2 Condition"><h3>更新状态</h3><p class="muted">Condition 与 Lifecycle、Focus 分离；保存后立即影响 Now Work 投影。</p><label>状态<select data-field="v2ConditionKind"><option>ACTIONABLE</option><option>WAITING</option><option>BLOCKED</option><option>PAUSED</option></select></label><label>等待谁或什么<input data-field="v2WaitingFor"></label><label>期待结果<input data-field="v2ExpectedResult"></label><label>原因<input data-field="v2ConditionReason"></label><label>阻碍来源（Blocked 可选）<select data-field="v2BlockerObjectId"><option value="">仅记录原因</option>${blockers}</select></label><label>复查时间（Waiting 必填）<input type="datetime-local" data-field="v2ConditionReviewAt"></label><div class="actions">${button("保存状态", "submit-v2-condition", dialog.value, "primary")}${cancel}</div></section>`;
  }
  if (dialog.kind === "v2-deadline") {
    const current = dialog.value.split("|")[2];
    return `<section class="inbox-dialog action-dialog" aria-label="设置 Task 期限"><h3>设置明确期限</h3><p class="muted">期限是明确承诺时间，只影响可解释排序，不产生分数。${current ? ` 当前：${escapeHtml(new Date(current).toLocaleString("zh-CN"))}` : ""}</p><label>期限<input type="datetime-local" data-field="v2DueAt"></label><label class="confirm-line"><input type="checkbox" data-field="v2ClearDueAt">清除现有期限</label><div class="actions">${button("保存期限", "submit-v2-deadline", dialog.value, "primary")}${cancel}</div></section>`;
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
  const confirmations: Partial<Record<ActionDialogKind, [string, string, string]>> = {
    "confirm-review-accept": ["接受高影响操作", "我单独确认接受这个高影响操作；提交前仍会进行确定性校验", "submit-review-accept"],
    "confirm-phase": ["确认完成 Project", "我已检查目标达成、下层对象、等待项、成果和归档入口", "submit-phase"],
    "confirm-rebind": ["重新绑定主正文 Anchor", "我确认将当前选中 Block 设为新的主正文 Anchor；旧 Anchor 保留为 replaced", "submit-rebind-anchor"],
    "confirm-undo": ["撤销 SemanticCommit", "我确认撤销；系统会先校验正文没有被二次编辑，并创建逆向 Commit", "submit-undo-commit"],
    "confirm-v2-review-accept": ["接受高影响语义组", "我确认接受当前高影响语义组；这仍不会绕过最终版本重验和 Commit", "submit-v2-review-accept"],
    "confirm-v2-commit": ["确认最终提交", "我已查看最终预览与 Diff；系统将再次重验后写入正文和 SQLite，并在成功后提供 Undo", "submit-v2-proposal-commit"],
    "confirm-v2-project-closure": ["确认完成 Project", "我已检查原始目标、实际结果、未完成 Objective 的原因与去向；系统将重验后原子记录 Closure 并完成 Project", "submit-v2-project-closure"],
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
  const labels: Array<[Workspace, string]> = [
    ["inbox", "Inbox"],
    ["now", "Now Work / 现在工作"],
    ["objects", "Projects / 对象"],
    ["review", "Proposal Review"],
    ["reentry", "Project 重入"],
    ["migration", "迁移"],
    ["audit", "Audit / Recovery / 审计与恢复"],
  ];
  const body =
    model.workspace === "inbox"
      ? renderInbox(model)
      : model.workspace === "now"
        ? renderNow(model)
        : model.workspace === "objects"
          ? renderObjects(model)
          : model.workspace === "review"
            ? renderReview(model)
            : model.workspace === "reentry"
              ? renderReentry(model)
              : model.workspace === "migration"
                ? renderMigration(model)
                : renderAudit(model);
  return `<section class="app-shell">
    <header class="topbar">
      <div><div class="eyebrow">个人事务运行系统</div><h1>Task Copilot</h1></div>
      <div class="top-actions">${button("捕获当前块", "capture", undefined, "primary")}${button("Diagnostics", "runtime-diagnostics", undefined, "quiet")}${button("关闭", "close", undefined, "quiet")}</div>
    </header>
    ${model.runtime ? `<div class="runtime-strip"><span>Plugin ${escapeHtml(model.runtime.pluginVersion)}</span><span>Runtime ${escapeHtml(model.runtime.runtimeStatus)}</span><span>Store ${escapeHtml(model.runtime.storeStatus)}</span><span>Graph ${escapeHtml(model.runtime.currentGraph)}</span></div>` : ""}
    <div class="agent-state ${model.agent.enabled ? "enabled" : "disabled"}">Agent ${model.agent.enabled ? `Demo · ${escapeHtml(model.agent.providerId)}` : "disabled · 基础事务系统可用"}</div>
    ${model.message ? `<div class="notice">${escapeHtml(model.message)}</div>` : ""}
    ${model.error ? `<div class="error"><strong>未执行：</strong>${escapeHtml(model.error)}<span>请修正后重试；系统不会静默覆盖。</span></div>` : ""}
    <nav>${labels.map(([id, label]) => `<button class="${model.workspace === id ? "active" : ""}" data-action="view" data-value="${id}">${label}</button>`).join("")}</nav>
    <main class="workspace" data-workspace="${model.workspace}">${renderActionDialog(model)}${body}</main>
  </section>`;
}
