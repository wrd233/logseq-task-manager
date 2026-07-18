import "@logseq/libs";

import {
  DeterministicDemoProvider,
  NoAgentProvider,
  TaskCopilot,
  type AgentProvider,
  type ProjectReentryView,
} from "@task-copilot/application";
import type { ConditionKind, ManagedObject, ObjectType } from "@task-copilot/domain";
import {
  LogseqContentPort,
  LogseqFileStorageBlobStore,
  type LogseqFacade,
} from "@task-copilot/logseq-adapter";
import {
  VersionedStateRepository,
  exportRecoveryBundle,
  restoreRecoveryBundle,
  type RecoveryBundle,
} from "@task-copilot/persistence";

import {
  MAIN_UI_ROOT_ID,
  PLUGIN_COMMIT,
  RuntimeDiagnostics,
  mountWithDiagnosticFallback,
  renderRuntimeDiagnostics,
  type RuntimeStage,
} from "./runtime-diagnostics.ts";
import { BootstrapRegistration, bindRootClick, type BootstrapCallbacks, type BootstrapHost } from "./bootstrap-shell.ts";
import { renderApp, type UiModel, type Workspace } from "./ui.ts";
import { InboxActionController, createDelegatedActionHandler } from "./inbox-action-controller.ts";
import { StructuredLogger } from "./structured-logger.ts";

let appRoot: HTMLElement | undefined;
let blobStore: LogseqFileStorageBlobStore;
let repository: VersionedStateRepository;
let contentPort: LogseqContentPort;
let taskCopilot: TaskCopilot | undefined;
const diagnostics = new RuntimeDiagnostics();
const bootstrapRegistration = new BootstrapRegistration();
const cleanupHooks: Array<() => void> = [];
let featureReady = false;
let uiBound = false;
let workspace: Workspace = "inbox";
let selectedObjectId: string | undefined;
let selectedProjectId: string | undefined;
let message: string | undefined;
let latestError: string | undefined;
let recoveryReport: string | undefined;
let inboxDialog: UiModel["inboxDialog"];
const operationalLogger = new StructuredLogger(300, { pluginVersion: "0.1.0", pluginCommit: PLUGIN_COMMIT });
let inboxActionController: InboxActionController | undefined;
let runtimeProbeResult: unknown = { status: "not-run" };

function requireTaskCopilot(): TaskCopilot {
  if (!taskCopilot || !featureReady) throw new Error("TASK_COPILOT_FEATURE_NOT_READY: 功能尚未就绪；请打开 Runtime Diagnostics。");
  return taskCopilot;
}

function requireAppRoot(): HTMLElement {
  const root = appRoot ?? document.getElementById(MAIN_UI_ROOT_ID);
  if (!root) throw new Error(`Task Copilot root element #${MAIN_UI_ROOT_ID} is unavailable.`);
  appRoot = root;
  return root;
}

function currentProvider(): AgentProvider {
  const mode = (logseq.settings as { agentMode?: unknown } | undefined)?.agentMode;
  return mode === "demo" ? new DeterministicDemoProvider() : new NoAgentProvider();
}

function rebuildApplication(): void {
  taskCopilot = new TaskCopilot({ store: repository, content: contentPort, provider: currentProvider() });
}

function explain(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function model(): Promise<UiModel> {
  const app = requireTaskCopilot();
  const [inbox, now, objects, proposals, commits, events, auditProjection] = await Promise.all([
    app.listInbox(),
    app.queryNowWork(),
    app.listObjects(),
    app.listProposals(),
    app.listCommits(),
    app.getAuditTrail(),
    app.getAuditProjection(),
  ]);
  const selectedObject = selectedObjectId ? objects.find((object) => object.objectId === selectedObjectId) : undefined;
  const selectedObjectDetail = selectedObject ? await app.getObjectDetail(selectedObject.objectId) : undefined;
  const signalsByObject = Object.fromEntries(await Promise.all(objects.map(async (object) => [object.objectId, await app.getObjectSignals(object.objectId)] as const)));
  const proposalImpacts = Object.fromEntries(
    await Promise.all(proposals.filter((proposal) => proposal.status === "OPEN").map(async (proposal) => [proposal.proposalId, await app.getProposalImpact(proposal.proposalId)] as const)),
  );
  const reentryProjects = objects.filter((object) => object.objectType === "PROJECT");
  const project = reentryProjects.find((object) => object.objectId === selectedProjectId) ?? reentryProjects[0];
  if (project) selectedProjectId = project.objectId;
  let reentry: ProjectReentryView | undefined;
  if (project) reentry = await app.getProjectReentry(project.objectId);
  return {
    workspace,
    agent: app.agentStatus(),
    inbox,
    now,
    objects,
    proposals,
    commits,
    events,
    auditProjection,
    reentryProjects,
    ...(selectedProjectId ? { selectedReentryProjectId: selectedProjectId } : {}),
    signalsByObject,
    proposalImpacts,
    ...(selectedObjectDetail ? { selectedObjectDetail } : {}),
    ...(reentry ? { reentry } : {}),
    ...(message ? { message } : {}),
    ...(latestError ? { error: latestError } : {}),
    ...(recoveryReport ? { recoveryReport } : {}),
    runtime: {
      pluginVersion: diagnostics.snapshot().plugin_version,
      runtimeStatus: diagnostics.snapshot().runtime_status,
      storeStatus: diagnostics.snapshot().store_status,
      currentGraph: diagnostics.snapshot().current_graph,
    },
    ...(inboxActionController ? { inboxActionStates: inboxActionController.snapshot() } : {}),
    ...(inboxDialog ? { inboxDialog } : {}),
  };
}

async function refresh(): Promise<void> {
  const root = requireAppRoot();
  if (!featureReady) {
    root.innerHTML = renderRuntimeDiagnostics(diagnostics.snapshot());
    return;
  }
  let primaryHtml: string;
  try {
    primaryHtml = renderApp(await model());
  } catch (error) {
    diagnostics.fail("APPLICATION_READY", error);
    featureReady = false;
    root.innerHTML = renderRuntimeDiagnostics(diagnostics.snapshot());
    return;
  }
  const mounted = mountWithDiagnosticFallback(root, () => primaryHtml, () => renderRuntimeDiagnostics(diagnostics.snapshot()));
  if (mounted.fallbackUsed) {
    diagnostics.fail("APPLICATION_READY", mounted.error);
    featureReady = false;
  }
}

function actions(): InboxActionController {
  inboxActionController ??= new InboxActionController(operationalLogger, refresh);
  return inboxActionController;
}

async function fullDiagnosticsSnapshot() {
  const base = diagnostics.snapshot();
  const state = featureReady && taskCopilot ? await taskCopilot.exportState().catch(() => undefined) : undefined;
  return {
    ...base,
    plugin_commit: PLUGIN_COMMIT,
    persistence_backend: "Logseq FileStorage checksummed A/B JSON",
    pending_semantic_commits: state?.commits.filter((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED").length ?? 0,
    source_anchor_conflicts: (state?.anchors.filter((anchor) => anchor.status === "missing" || anchor.status === "conflict").length ?? 0) + (state?.captures.filter((capture) => capture.sourceConflict).length ?? 0),
    runtime_shape_summary: runtimeProbeResult,
    event_listener_status: { rootClick: uiBound, settings: featureReady, unhandledRejection: true, globalError: true },
    recent_logs: operationalLogger.snapshot(),
    recent_action_failure: operationalLogger.latestError(),
  };
}

function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function dialogField(name: string): string {
  const element = requireAppRoot().querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-field="${name}"]`);
  return element?.value.trim() ?? "";
}

function openInboxDialog(captureId: string, kind: NonNullable<UiModel["inboxDialog"]>["kind"]): Promise<void> {
  const correlationId = `dialog-${Date.now()}`;
  operationalLogger.log("info", "ui-action", "ui_action_clicked", { correlationId, actionId: kind, captureId });
  inboxDialog = { captureId, kind };
  return refresh();
}

async function run(action: () => Promise<void>, success?: string): Promise<void> {
  latestError = undefined;
  message = undefined;
  try {
    await action();
    if (success) message = success;
  } catch (error) {
    latestError = explain(error);
  }
  await refresh();
}

function promptRequired(label: string, initial = ""): string | undefined {
  const value = window.prompt(label, initial)?.trim();
  return value ? value : undefined;
}

function workObjectType(): ObjectType | undefined {
  const raw = window.prompt("对象类型：TASK / MINI_PROJECT / PROJECT / AREA", "TASK")?.trim().toUpperCase();
  return raw && ["TASK", "MINI_PROJECT", "PROJECT", "AREA"].includes(raw) ? (raw as ObjectType) : undefined;
}

function objectChoices(objects: readonly ManagedObject[], excludeId?: string): string {
  return objects
    .filter((object) => object.objectId !== excludeId)
    .map((object) => `${object.objectId} · ${object.objectType} · ${object.text}`)
    .join("\n");
}

async function handleAction(action: string, value?: string): Promise<void> {
  if (action === "view" && value) {
    workspace = value as Workspace;
    await refresh();
    return;
  }
  if (action === "close") {
    logseq.hideMainUI();
    return;
  }
  if (action === "copy-diagnostics") {
    const value = JSON.stringify(await fullDiagnosticsSnapshot(), null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard API and copy command are unavailable.");
      }
      message = "Runtime diagnostics 已复制。";
    } catch (error) {
      console.error("[Task Copilot] copy diagnostics failed", error);
    }
    await refresh();
    return;
  }
  if (action === "export-diagnostics") {
    downloadText(`task-copilot-diagnostics-${Date.now()}.jsonl`, operationalLogger.exportJsonl(), "application/x-ndjson");
    message = "Diagnostics JSONL 已导出。";
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "clear-diagnostics") {
    operationalLogger.clear();
    message = "内存日志已清空。";
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "toggle-debug") {
    operationalLogger.setDebug(!operationalLogger.isDebugEnabled());
    message = `Debug Log 已${operationalLogger.isDebugEnabled() ? "开启" : "关闭"}。`;
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "source-resolver-probe") {
    const correlationId = `probe-${Date.now()}`;
    operationalLogger.log("info", "source-resolution", "source_resolution_started", { correlationId });
    try {
      runtimeProbeResult = await contentPort.sourceProbe();
      operationalLogger.log("info", "source-resolution", "source_resolution_succeeded", { correlationId, result: "read-only" });
    } catch (error) {
      runtimeProbeResult = { status: "failed", message: explain(error), correlationId };
      operationalLogger.log("error", "source-resolution", "source_resolution_failed", { correlationId, result: "error" }, error);
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "inbox-action-probe") {
    const correlationId = `probe-${Date.now()}`;
    operationalLogger.log("info", "ui-action", "ui_action_clicked", { correlationId, actionId: "inbox-action-probe" });
    const count = featureReady ? (await requireTaskCopilot().listInbox()).length : 0;
    runtimeProbeResult = { status: "read-only", probe: "Inbox Action", layers: { click: true, delegatedHandler: uiBound, applicationMessage: featureReady, query: featureReady }, inboxCount: count, writesExecuted: false };
    operationalLogger.log("info", "query-refresh", "query_invalidated", { correlationId, actionId: "inbox-action-probe", result: "probe-only" });
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "runtime-diagnostics") {
    await showRuntimeDiagnostics();
    return;
  }
  const taskCopilot = requireTaskCopilot();
  if (action === "cancel-inbox-dialog") {
    inboxDialog = undefined;
    await refresh();
    return;
  }
  if (value && action === "manual-formalize") return openInboxDialog(value, "formalize");
  if (value && action === "create-manual-proposal") return openInboxDialog(value, "proposal");
  if (value && action === "link-existing-object") return openInboxDialog(value, "link");
  if (value && action === "defer") return openInboxDialog(value, "defer");
  if (value && action === "no-action") return openInboxDialog(value, "dismiss");
  if (value && action === "open-source") {
    await actions().execute("open-source", value, async () => {
      await taskCopilot.openCaptureSource(value);
      message = "已按 Block UUID 定位来源；Capture 身份与来源均保留。";
      globalThis.setTimeout(() => logseq.hideMainUI(), 600);
      return message;
    });
    return;
  }
  if (value && action === "submit-formalize") {
    const objectType = dialogField("objectType") as ObjectType;
    const text = dialogField("text");
    const completionCriteria = dialogField("completionCriteria");
    const nextAction = dialogField("nextAction");
    const ownerId = dialogField("ownerId");
    await actions().execute("manual-formalize", value, async () => {
      if (!text || !completionCriteria || !nextAction) throw new Error("正式正文、完成标准和下一步不能为空。");
      const input: Parameters<TaskCopilot["createManualFormalizationProposal"]>[1] = objectType === "PROJECT"
        ? { objectType, text, purpose: text, targetOutcome: completionCriteria, scopeIn: "待确认", completionCriteria, nextAction }
        : objectType === "MINI_PROJECT"
          ? { objectType, text, targetOutcome: completionCriteria, completionCriteria, nextAction }
          : { objectType: "TASK", text, completionCriteria, nextAction };
      const proposal = await taskCopilot.createManualFormalizationProposal(value, input);
      await taskCopilot.reviewProposal(proposal.proposalId, Object.fromEntries(proposal.operations.map((operation) => [operation.operationId, operation.riskLevel === "HIGH" ? { status: "ACCEPTED", highImpactConfirmed: true } : "ACCEPTED"])));
      const commit = await taskCopilot.commitProposal(proposal.proposalId);
      if (commit.status !== "COMPLETED") throw new Error(`SemanticCommit ${commit.status}；Capture 保持可恢复，诊断请查看 Audit。`);
      const state = await taskCopilot.exportState();
      const capture = state.captures.find((candidate) => candidate.captureId === value);
      const objectId = capture?.resolvedObjectIds[0];
      if (!objectId || capture.phase !== "RESOLVED") throw new Error("对象提交后未观察到 Capture RESOLVED；请勿重复提交并检查 Diagnostics。");
      if (ownerId) {
        const ownership = await taskCopilot.createManualOwnershipProposal(objectId, ownerId);
        await taskCopilot.reviewProposal(ownership.proposalId, { [ownership.operations[0]!.operationId]: { status: "ACCEPTED", highImpactConfirmed: true } });
        const ownerCommit = await taskCopilot.commitProposal(ownership.proposalId);
        if (ownerCommit.status !== "COMPLETED") throw new Error(`对象已创建，但主归属提交为 ${ownerCommit.status}；请从 Audit 恢复。`);
      }
      selectedObjectId = objectId;
      workspace = "objects";
      inboxDialog = undefined;
      message = `已创建 ${objectType}；正文保留在原 Block，来源 Anchor 已保留，Capture 已解决。`;
      return message;
    });
    return;
  }
  if (value && action === "submit-manual-proposal") {
    const suggestedText = dialogField("suggestedText");
    await actions().execute("create-manual-proposal", value, async () => {
      if (!suggestedText) throw new Error("Proposal 至少需要一项建议正文。");
      await taskCopilot.createManualProposal(value, suggestedText);
      workspace = "review";
      inboxDialog = undefined;
      message = "手工 Proposal 已创建，可在 Proposal Review 中审查。";
      return message;
    });
    return;
  }
  if (value && action === "submit-link-existing") {
    const search = dialogField("objectSearch").toLowerCase();
    await actions().execute("link-existing-object", value, async () => {
      const objects = await taskCopilot.listObjects();
      const matches = objects.filter((object) => object.objectId.toLowerCase() === search || object.text.toLowerCase().includes(search) || object.objectType.toLowerCase() === search);
      if (matches.length !== 1) throw new Error(matches.length ? "匹配到多个对象，请输入精确对象 ID。" : "未找到对象；可按标题、类型或 ID 搜索。");
      await taskCopilot.associateCapture(value, matches[0]!.objectId);
      inboxDialog = undefined;
      message = "已建立 sourced_from 来源关系；主归属未改变，Capture 已解决。";
      return message;
    });
    return;
  }
  if (value && action === "submit-defer") {
    const raw = dialogField("deferredUntil");
    const reason = dialogField("deferReason");
    await actions().execute("defer", value, async () => {
      const date = new Date(raw);
      if (!raw || !Number.isFinite(date.getTime()) || !reason) throw new Error("请填写合法复查时间和原因。");
      await taskCopilot.deferCapture(value, date.toISOString(), reason);
      inboxDialog = undefined;
      message = `Capture 已暂缓至 ${date.toLocaleString("zh-CN")}，到期后仍可追踪。`;
      return message;
    });
    return;
  }
  if (value && action === "submit-no-action") {
    const reason = dialogField("dismissReason") || "无需行动";
    await actions().execute("no-action", value, async () => {
      await taskCopilot.dismissCapture(value, reason);
      inboxDialog = undefined;
      message = "Capture 已标记为无需行动；原始 Block 与审计历史均已保留。";
      return message;
    });
    return;
  }
  if (action === "capture") {
    await run(async () => {
      await taskCopilot.captureCurrentBlock();
      workspace = "inbox";
    }, "已捕获当前 Block；正文未移动，也未自动创建 Task。");
    return;
  }
  if (action === "formalize" && value) {
    const state = await taskCopilot.exportState();
    const capture = state.captures.find((candidate) => candidate.captureId === value);
    const objectType = workObjectType();
    if (!objectType) return;
    const text = promptRequired(`${objectType} 正文`, capture?.originalText ?? "");
    if (!text) return;
    let completionCriteria: string | undefined;
    let nextAction: string | undefined;
    let purpose: string | undefined;
    let targetOutcome: string | undefined;
    let scopeIn: string | undefined;
    if (objectType === "TASK") {
      completionCriteria = promptRequired("可判断的完成标准");
      nextAction = promptRequired("下一步行动", text);
      if (!completionCriteria || !nextAction) return;
    } else if (objectType === "MINI_PROJECT") {
      targetOutcome = promptRequired("目标结果");
      completionCriteria = promptRequired("完成判据");
      nextAction = promptRequired("当前推进");
      if (!targetOutcome || !completionCriteria || !nextAction) return;
    } else if (objectType === "PROJECT") {
      purpose = promptRequired("项目目的");
      targetOutcome = promptRequired("目标结果");
      scopeIn = promptRequired("范围内边界");
      completionCriteria = promptRequired("完成判据");
      nextAction = promptRequired("当前推进");
      if (!purpose || !targetOutcome || !scopeIn || !completionCriteria || !nextAction) return;
    } else {
      purpose = promptRequired("Area 的持续责任或目的");
      if (!purpose) return;
    }
    await run(async () => {
      await taskCopilot.createManualFormalizationProposal(value, {
        objectType,
        text,
        ...(completionCriteria ? { completionCriteria } : {}),
        ...(nextAction ? { nextAction } : {}),
        ...(purpose ? { purpose } : {}),
        ...(targetOutcome ? { targetOutcome } : {}),
        ...(scopeIn ? { scopeIn } : {}),
      });
      workspace = "review";
    }, "手工正式化 Proposal 已创建；对象、正文和 Capture 尚未改变，请逐项审查后提交。");
    return;
  }
  if (action === "generate-proposal" && value) {
    await run(async () => {
      await taskCopilot.generateProposal(value);
      workspace = "review";
    }, "Demo Proposal 已生成；它仍不是正式事实。");
    return;
  }
  if (action === "manual-proposal" && value) {
    const state = await taskCopilot.exportState();
    const capture = state.captures.find((candidate) => candidate.captureId === value);
    const suggestedText = promptRequired("输入希望审查的正式正文", capture?.originalText ?? "");
    if (!suggestedText) return;
    await run(async () => {
      await taskCopilot.createManualProposal(value, suggestedText);
      workspace = "review";
    }, "手工 Proposal 已创建；正文尚未改变，需逐项审查后提交。");
    return;
  }
  if (action === "dismiss-capture" && value) {
    await run(async () => void (await taskCopilot.dismissCapture(value)), "Capture 已标记为无需行动。");
    return;
  }
  if (action === "open-capture" && value) {
    await run(async () => taskCopilot.openCaptureSource(value));
    return;
  }
  if (action === "defer-capture" && value) {
    const deferredUntil = promptRequired("暂缓至（ISO，例如 2026-07-20T09:00:00+08:00）");
    if (!deferredUntil) return;
    await run(async () => void (await taskCopilot.deferCapture(value, deferredUntil)), `Capture 已暂缓至 ${deferredUntil}。`);
    return;
  }
  if (action === "associate-capture" && value) {
    const objects = await taskCopilot.listObjects();
    const objectId = promptRequired(`输入要关联的对象 ID：\n${objectChoices(objects)}`);
    if (!objectId) return;
    await run(async () => void (await taskCopilot.associateCapture(value, objectId)), "Capture 已关联现有对象，来源 Anchor 已保留。");
    return;
  }
  if ((action === "review-accept" || action === "review-reject") && value) {
    const [proposalId, operationId, risk] = value.split("|");
    if (!proposalId || !operationId) return;
    if (action === "review-accept" && risk === "HIGH" && !window.confirm("这是高影响操作。确认单独接受？提交前仍会进行确定性校验。")) return;
    await run(async () => {
      await taskCopilot.reviewProposal(proposalId, {
        [operationId]: action === "review-accept"
          ? { status: "ACCEPTED", highImpactConfirmed: risk === "HIGH" }
          : "REJECTED",
      });
    });
    return;
  }
  if (action === "review-edit" && value) {
    const [proposalId, operationId] = value.split("|");
    if (!proposalId || !operationId) return;
    const proposal = (await taskCopilot.listProposals()).find((candidate) => candidate.proposalId === proposalId);
    const operation = proposal?.operations.find((candidate) => candidate.operationId === operationId);
    if (!operation) return;
    const raw = window.prompt("编辑最终 operation payload（JSON）", JSON.stringify(operation.payload, null, 2));
    if (raw === null) return;
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload 必须是 JSON object");
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      latestError = explain(error);
      await refresh();
      return;
    }
    const editedHighImpact = (await taskCopilot.getEditedOperationRisk(proposalId, operationId, payload)) === "HIGH";
    if (editedHighImpact && !window.confirm("编辑后的 payload 属于高影响操作。确认最终版本？")) return;
    await run(async () => void (await taskCopilot.reviewProposal(proposalId, {
      [operationId]: { status: "EDITED", payload, highImpactConfirmed: editedHighImpact },
    })), "已保存用户确认版本；Agent 原建议仍在审计字段中保留。");
    return;
  }
  if (action === "review-defer" && value) {
    const [proposalId, operationId] = value.split("|");
    if (!proposalId || !operationId) return;
    const deferredUntil = promptRequired("复查时间（ISO）");
    const reason = promptRequired("暂缓原因");
    if (!deferredUntil || !reason) return;
    await run(async () => void (await taskCopilot.deferProposalOperation(proposalId, operationId, deferredUntil, reason)), "操作已暂缓；Proposal 保持待审查，Capture 未被解决。");
    return;
  }
  if (action === "reject-proposal" && value) {
    if (!window.confirm("确认拒绝该 Proposal 的全部未提交操作？原始 Capture 会回到 Inbox。")) return;
    const reason = promptRequired("全部拒绝原因", "当前建议不适用");
    if (!reason) return;
    await run(async () => {
      const proposal = await taskCopilot.rejectProposal(value, reason);
      message = proposal.status === "COMMITTED"
        ? "其余操作已拒绝；此前已经提交的正式变化保持不变。"
        : "Proposal 已全部拒绝；没有正式正文或领域变化。";
    });
    return;
  }
  if (action === "commit-proposal" && value) {
    await run(async () => {
      const commit = await taskCopilot.commitProposal(value);
      if (commit.status !== "COMPLETED") throw new Error(`SemanticCommit ${commit.status}：${commit.error?.message ?? "请在审计与恢复中处理"}`);
      workspace = "audit";
    }, "SemanticCommit 已完成；结果和撤销入口已记录。");
    return;
  }
  if (action === "select-object" && value) {
    selectedObjectId = value;
    workspace = "objects";
    await refresh();
    return;
  }
  if (action === "select-reentry-project" && value) {
    selectedProjectId = value;
    workspace = "reentry";
    await refresh();
    return;
  }
  if (action === "edit-object" && value) {
    const object = await taskCopilot.getObject(value);
    const text = window.prompt("对象正文（取消则保留）", object.text);
    if (text === null) return;
    const completionCriteria = window.prompt("完成标准（允许留空）", object.completionCriteria ?? "");
    if (completionCriteria === null) return;
    const nextAction = window.prompt("下一步/当前推进（允许留空）", object.nextAction ?? "");
    if (nextAction === null) return;
    const currentSummary = window.prompt("当前状态摘要（允许留空）", object.currentSummary ?? "");
    if (currentSummary === null) return;
    const purpose = window.prompt("目的/持续责任（允许留空）", object.purpose ?? "");
    if (purpose === null) return;
    const targetOutcome = window.prompt("目标结果（允许留空）", object.targetOutcome ?? "");
    if (targetOutcome === null) return;
    const scopeIn = window.prompt("范围内边界（允许留空）", object.scopeIn ?? "");
    if (scopeIn === null) return;
    const dueAt = window.prompt("due 时间（ISO，允许留空）", object.dueAt ?? "");
    if (dueAt === null) return;
    const reviewAt = window.prompt("review 时间（ISO，允许留空）", object.reviewAt ?? "");
    if (reviewAt === null) return;
    await run(
      async () => {
        await taskCopilot.createManualObjectEditProposal(value, {
          text: text.trim(), completionCriteria: completionCriteria.trim(), nextAction: nextAction.trim(), currentSummary: currentSummary.trim(),
          purpose: purpose.trim(), targetOutcome: targetOutcome.trim(), scopeIn: scopeIn.trim(), dueAt: dueAt.trim(), reviewAt: reviewAt.trim(),
        });
        workspace = "review";
      },
      "对象编辑 Proposal 已创建；Logseq 正文和 Domain State 尚未改变。",
    );
    return;
  }
  if (action === "open-object" && value) {
    await run(async () => taskCopilot.openObjectText(value));
    return;
  }
  if (action === "set-owner" && value) {
    const objects = await taskCopilot.listObjects();
    const ownerObjectId = promptRequired(`输入主归属对象 ID：\n${objectChoices(objects, value)}`);
    if (!ownerObjectId) return;
    await run(async () => {
      await taskCopilot.createManualOwnershipProposal(value, ownerObjectId);
      workspace = "review";
    }, "主归属 Proposal 已创建；接受时会要求高影响确认，正文不会移动。");
    return;
  }
  if (action === "view-audit") {
    workspace = "audit";
    await refresh();
    return;
  }
  if (action.startsWith("condition-") && value) {
    const kind = action.slice("condition-".length).toUpperCase() as ConditionKind;
    const evidence: Record<string, string> = {};
    if (kind === "WAITING") {
      const waitingFor = promptRequired("在等谁或什么？");
      const expectedResult = promptRequired("期待什么结果？");
      const reviewAt = promptRequired("复查时间（ISO，例如 2026-07-20T09:00:00+08:00）");
      if (!waitingFor || !expectedResult || !reviewAt) return;
      Object.assign(evidence, { waitingFor, expectedResult, reviewAt });
    } else if (kind === "BLOCKED" || kind === "PAUSED") {
      const reason = promptRequired(kind === "BLOCKED" ? "阻塞说明" : "暂停原因");
      if (!reason) return;
      evidence.reason = reason;
    }
    await run(async () => {
      await taskCopilot.createManualConditionProposal(value, kind, evidence);
      workspace = "review";
    }, `Condition ${kind} Proposal 已创建；状态尚未改变。`);
    return;
  }
  if (action === "advance-phase" && value) {
    const object = await taskCopilot.getObject(value);
    const available = await taskCopilot.getAvailableObjectPhases(value);
    const chosen = window.prompt(`选择合法目标 Phase：${available.join(" / ")}`, available[0] ?? "")?.trim().toUpperCase();
    const phase = available.find((candidate) => candidate === chosen);
    if (!phase) {
      latestError = available.length > 0 ? `请选择合法 Phase：${available.join(" / ")}` : `当前 ${object.phase} 没有合法后续流转。`;
      await refresh();
      return;
    }
    if (object.objectType === "PROJECT" && phase === "COMPLETED" && !window.confirm("已检查目标达成、下层对象、等待项、成果和归档入口？")) return;
    const reason = object.phase === "COMPLETED" && phase === "ACTIVE" ? promptRequired("重新打开原因") : undefined;
    if (object.phase === "COMPLETED" && phase === "ACTIVE" && !reason) return;
    await run(
      async () => {
        await taskCopilot.createManualPhaseProposal(value, phase, {
          ...(object.objectType === "PROJECT" && phase === "COMPLETED" ? { completionChecksPassed: true } : {}),
          ...(reason ? { reason } : {}),
        });
        workspace = "review";
      },
      `Phase ${phase} Proposal 已创建；状态尚未改变。`,
    );
    return;
  }
  if (action === "rebind-anchor" && value) {
    if (!window.confirm("将当前选中 Block 设为该对象新的主正文 Anchor？旧 Anchor 会保留为 replaced。")) return;
    await run(async () => void (await taskCopilot.rebindPrimaryAnchor(value)), "Anchor 已重新绑定。");
    return;
  }
  if (action === "open-anchor" && value) {
    await run(async () => taskCopilot.openAnchor(value));
    return;
  }
  if (action === "undo-commit" && value) {
    if (!window.confirm("撤销会先校验正文没有被二次编辑。确认继续？")) return;
    await run(async () => {
      const commit = await taskCopilot.undoCommit(value);
      if (commit.status !== "COMPLETED") throw new Error(`Undo SemanticCommit ${commit.status}：${commit.error?.message ?? "请在审计与恢复中处理"}`);
    }, "已创建逆向 SemanticCommit；旧历史未被改写。");
    return;
  }
  if (action === "recover-pending") {
    await run(async () => {
      const result = await taskCopilot.recoverPendingCommits();
      recoveryReport = `已安全恢复：${result.recovered.length}；仍需人工处理：${result.recoveryRequired.length}`;
    });
    return;
  }
  if (action === "scan-anchors") {
    await run(async () => {
      const result = await taskCopilot.scanAnchors();
      recoveryReport = `Anchor 扫描：active ${result.active}；missing ${result.missing}；conflict ${result.conflict}；其他 Graph ${result.unavailable}。`;
    });
    return;
  }
  if (action === "export-backup") {
    await run(async () => {
      const bundle = exportRecoveryBundle(await taskCopilot.exportState());
      await blobStore.set("task-copilot/backups/latest.json", JSON.stringify(bundle));
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `task-copilot-recovery-${bundle.createdAt.replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      recoveryReport = `恢复包已写入插件私有备份槽并下载。文件数：${Object.keys(bundle.files).length}`;
    });
    return;
  }
  if (action === "verify-backup") {
    await run(async () => {
      const raw = await blobStore.get("task-copilot/backups/latest.json");
      if (!raw) throw new Error("尚无恢复包，请先创建备份。");
      const result = restoreRecoveryBundle(JSON.parse(raw) as RecoveryBundle);
      recoveryReport = `临时 Store 恢复校验完成：对象 ${result.state.objects.length}，关系 ${result.state.relations.length}，事件 ${result.state.events.length}，Missing Anchor ${result.anchorReport.missing.length}，差异 ${result.differences.length}。`;
    });
  }
}

const onRootClick = createDelegatedActionHandler(handleAction);

function bindUi(): void {
  if (uiBound) return;
  const unbind = bindRootClick(requireAppRoot(), onRootClick);
  uiBound = true;
  cleanupHooks.push(() => {
    unbind();
    uiBound = false;
    if (appRoot) appRoot.replaceChildren();
  });
}

async function showTaskCopilot(): Promise<void> {
  logseq.showMainUI({ autoFocus: true });
  await refresh();
}

async function showRuntimeDiagnostics(): Promise<void> {
  logseq.showMainUI({ autoFocus: true });
  requireAppRoot().innerHTML = renderRuntimeDiagnostics(await fullDiagnosticsSnapshot());
}

async function captureFromCommand(): Promise<void> {
  await requireTaskCopilot().captureCurrentBlock();
  workspace = "inbox";
  await showTaskCopilot();
}

async function openWorkspace(target: Workspace): Promise<void> {
  if (!featureReady) {
    await showRuntimeDiagnostics();
    return;
  }
  workspace = target;
  await showTaskCopilot();
}

async function guardedFeatureCommand(action: () => Promise<void>): Promise<void> {
  if (!featureReady) {
    console.warn("[Task Copilot] feature command unavailable; opening Runtime Diagnostics");
    diagnostics.setNotice({
      code: "FEATURE_NOT_READY",
      message: "Task Copilot 功能尚未就绪；本次命令未执行，也未写入 Graph 或 Store。",
      next_step: "请查看失败阶段和最近错误，然后使用 Copy diagnostics。",
    });
    await showRuntimeDiagnostics();
    return;
  }
  try {
    await action();
  } catch (error) {
    latestError = explain(error);
    await showTaskCopilot();
  }
}

function markReady(stage: RuntimeStage, logMessage?: string): void {
  diagnostics.ready(stage);
  if (logMessage) console.info(`[Task Copilot] ${logMessage}`);
}

function registerBootstrapShell(): void {
  diagnostics.start("BOOTSTRAP_STARTED");
  console.info("[Task Copilot] bootstrap started");

  const host = logseq as unknown as BootstrapHost;
  const callbacks: BootstrapCallbacks = {
    open: showTaskCopilot,
    capture: () => guardedFeatureCommand(captureFromCommand),
    openInbox: () => guardedFeatureCommand(() => openWorkspace("inbox")),
    openNowWork: () => guardedFeatureCommand(() => openWorkspace("now")),
    diagnostics: showRuntimeDiagnostics,
  };

  diagnostics.start("TOOLBAR_REGISTERED");
  bootstrapRegistration.registerToolbar(host);
  markReady("TOOLBAR_REGISTERED", "toolbar registered");

  diagnostics.start("COMMANDS_REGISTERED");
  bootstrapRegistration.registerCommands(host, callbacks);
  markReady("COMMANDS_REGISTERED", "commands registered");

  diagnostics.start("MAIN_UI_REGISTERED");
  bootstrapRegistration.registerMainUi(host, callbacks);
  bindUi();
  requireAppRoot().innerHTML = renderRuntimeDiagnostics(diagnostics.snapshot());
  markReady("MAIN_UI_REGISTERED", "main UI registered");
  diagnostics.ready("BOOTSTRAP_STARTED");
}

async function environmentInfo(): Promise<void> {
  const [graph, version] = await Promise.all([
    logseq.App.getCurrentGraph().catch(() => null),
    logseq.App.getInfo("version").catch(() => "unavailable"),
  ]);
  const graphShape = graph as { name?: unknown; url?: unknown } | null;
  const graphLabel = graphShape && typeof graphShape.name === "string" ? graphShape.name : "unavailable";
  diagnostics.setEnvironment(graphLabel || "available (identity shape unavailable)", typeof version === "string" ? version : JSON.stringify(version));
}

async function initializeFeatures(): Promise<void> {
  diagnostics.start("SETTINGS_READY");
  logseq.useSettingsSchema([
    {
      key: "agentMode",
      type: "enum",
      title: "Agent 模式",
      description: "No Agent 保持基础系统完整可用；Demo 只生成确定性本地 Proposal。",
      default: "none",
      enumChoices: ["none", "demo"],
      enumPicker: "radio",
    },
  ]);
  markReady("SETTINGS_READY");

  diagnostics.start("RUNTIME_ADAPTER_READY");
  const facade = logseq as unknown as LogseqFacade;
  contentPort = new LogseqContentPort(facade);
  markReady("RUNTIME_ADAPTER_READY");

  diagnostics.start("PERSISTENCE_READY");
  blobStore = new LogseqFileStorageBlobStore(facade.FileStorage);
  repository = new VersionedStateRepository(blobStore);
  const persistence = await repository.initialize();
  diagnostics.setStoreSchema("v1 (observed and validated)");
  if (persistence.initializedNewStore) diagnostics.setRecoveryState("initialized_new_store");
  markReady("PERSISTENCE_READY", "persistence ready");

  diagnostics.start("MIGRATION_READY");
  // load() validates the supported schema without rewriting damaged or newer data.
  markReady("MIGRATION_READY");

  diagnostics.start("APPLICATION_READY");
  rebuildApplication();
  const recovery = await taskCopilot!.initialize();
  diagnostics.setStoreStatus("READY");
  diagnostics.setRecoveryState(`${persistence.initializedNewStore ? "initialized_new_store; " : ""}recovered ${recovery.recovered.length}; recovery required ${recovery.recoveryRequired.length}`);
  if (recovery.recovered.length || recovery.recoveryRequired.length) {
    recoveryReport = `启动扫描：已恢复 ${recovery.recovered.length}，需人工处理 ${recovery.recoveryRequired.length}。`;
  }
  markReady("APPLICATION_READY");

  diagnostics.start("EVENTS_READY");
  cleanupHooks.push(logseq.onSettingsChanged(() => {
    rebuildApplication();
    message = "Agent 模式已切换；正式领域状态与历史未受影响。";
    if (logseq.isMainUIVisible) void refresh();
  }));
  markReady("EVENTS_READY");
  featureReady = true;
  markReady("PLUGIN_READY", "plugin ready");
}

async function main(): Promise<void> {
  try {
    registerBootstrapShell();
  } catch (error) {
    const failedStage = diagnostics.snapshot().stages.slice().reverse().find((stage) => stage.status === "RUNNING")?.stage ?? "BOOTSTRAP_STARTED";
    diagnostics.fail(failedStage, error);
    console.error(`[Task Copilot] initialization failed at ${failedStage}`, error);
    return;
  }

  const onUnhandledRejection = (event: PromiseRejectionEvent) => operationalLogger.log("error", "plugin-lifecycle", "unhandled_rejection", {}, event.reason);
  const onGlobalError = (event: ErrorEvent) => operationalLogger.log("error", "plugin-lifecycle", "global_error", {}, event.error ?? event.message);
  globalThis.addEventListener("unhandledrejection", onUnhandledRejection);
  globalThis.addEventListener("error", onGlobalError);
  cleanupHooks.push(() => globalThis.removeEventListener("unhandledrejection", onUnhandledRejection));
  cleanupHooks.push(() => globalThis.removeEventListener("error", onGlobalError));
  operationalLogger.log("info", "plugin-lifecycle", "event_listeners_registered", { result: "success" });

  logseq.beforeunload(async () => {
    for (const off of cleanupHooks.splice(0).reverse()) off();
    featureReady = false;
    taskCopilot = undefined;
    logseq.hideMainUI();
    operationalLogger.log("info", "plugin-lifecycle", "plugin_unloaded", { result: "success" });
  });

  try {
    await environmentInfo();
    await initializeFeatures();
  } catch (error) {
    const failedStage = diagnostics.snapshot().stages.find((stage) => stage.status === "RUNNING")?.stage ?? "APPLICATION_READY";
    diagnostics.fail(failedStage, error, "READ_ONLY_SAFE_MODE");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    diagnostics.setRecoveryState("initialization stopped; no automatic Graph write performed");
    featureReady = false;
    console.error(`[Task Copilot] initialization failed at ${failedStage}`, error);
    try {
      requireAppRoot().innerHTML = renderRuntimeDiagnostics(diagnostics.snapshot());
    } catch (renderError) {
      console.error("[Task Copilot] diagnostic fallback render failed", renderError);
    }
  }
}

void logseq.ready().then(main).catch((error: unknown) => console.error("[Task Copilot] bootstrap failed before fallback UI became available", error));
