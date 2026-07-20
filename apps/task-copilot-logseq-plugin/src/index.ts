import "@logseq/libs";

import type {
  TaskCopilot,
  ProjectReentryView,
} from "@task-copilot/application";
import type { ConditionKind, ObjectType, Phase } from "@task-copilot/domain";
import type { LogseqContentPort, LogseqFileStorageBlobStore } from "@task-copilot/logseq-adapter";
import {
  exportRecoveryBundle,
  restoreRecoveryBundle,
  type RecoveryBundle,
  type VersionedStateRepository,
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
import { renderApp, type ActionDialogKind, type UiModel, type Workspace } from "./ui.ts";
import { InboxActionController, createDelegatedActionHandler } from "./inbox-action-controller.ts";
import { StructuredLogger } from "./structured-logger.ts";
import {
  createElectronDescriptorReader,
  createLogseqPrivateStorageDescriptorReader,
  discoverServiceRuntime,
  type ServiceRuntimeClient,
} from "./service-connection.ts";
import { renderFirstRunWelcome, type FirstRunAction } from "./first-run.ts";
import type { ServiceConnectionState } from "@task-copilot/service-client";
import {
  ExplicitSyncController,
  registerExplicitSyncEvents,
  type ExplicitSyncEventHost,
  type ExplicitSyncState,
} from "./explicit-sync-controller.ts";
import {
  prepareV2PrimaryAnchorRebind,
  renderV2PrimaryAnchorRebindPanel,
  submitV2PrimaryAnchorRebind,
  type V2RebindPanelState,
} from "./v2-anchor-rebind.ts";
import {
  prepareV2ExplicitCandidateDiscovery,
  renderV2ExplicitCandidateDiscoveryPanel,
  submitV2ExplicitCandidate,
  type V2ExplicitCandidatePanelState,
} from "./v2-explicit-candidate-discovery.ts";
import { createProjectWithControlledPage } from "./v2-project-creation.ts";
import { collectV2ProposalGraphObservations } from "./v2-proposal-revalidation.ts";

let appRoot: HTMLElement | undefined;
const v1Runtime: {
  blobStore?: LogseqFileStorageBlobStore;
  repository?: VersionedStateRepository;
  contentPort?: LogseqContentPort;
} = {};
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
let actionDialog: UiModel["actionDialog"];
const operationalLogger = new StructuredLogger(300, { pluginVersion: "0.1.0", pluginCommit: PLUGIN_COMMIT });
let inboxActionController: InboxActionController | undefined;
let runtimeProbeResult: unknown = { status: "not-run" };
const inboxProbeWaiters = new Map<string, () => void>();
let previousSlotRecoveryArmedAt: number | undefined;
let firstRunMode = false;
let firstRunAction: FirstRunAction | undefined;
let serviceRuntimeClient: ServiceRuntimeClient | undefined;
let serviceDiscoveryGeneration = 0;
let explicitSyncController: ExplicitSyncController | undefined;
let explicitSyncState: ExplicitSyncState = {
  pending: 0,
  transportReady: false,
  reconciliationRequired: false,
};
let v2RebindPanel: V2RebindPanelState = { status: "idle" };
let v2CandidatePanel: V2ExplicitCandidatePanelState = { status: "idle" };
let serviceConnection: ServiceConnectionState = {
  status: "RESTRICTED",
  reasonCode: "SERVICE_DESCRIPTOR_PATH_REQUIRED",
  message: "尚未配置 Local Service descriptor 路径。",
  formalWritesAvailable: false,
  graphEditingAvailable: true,
};

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

function explain(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderDiagnostics(snapshot: Parameters<typeof renderRuntimeDiagnostics>[0]): string {
  const available = serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient);
  return renderRuntimeDiagnostics(snapshot, [
    renderV2ExplicitCandidateDiscoveryPanel(v2CandidatePanel, available),
    renderV2PrimaryAnchorRebindPanel(v2RebindPanel, available),
  ].join(""));
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
  let v2Proposals: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listProposals"]>> = [];
  let v2ProposalLoadError: string | undefined;
  if (serviceConnection.status === "READY" && serviceRuntimeClient) {
    try { v2Proposals = await serviceRuntimeClient.listProposals(); } catch (error) { v2ProposalLoadError = explain(error); }
  }
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
    ...(actionDialog ? { actionDialog } : {}),
    v2ProjectCreationAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2Proposals,
    ...(v2ProposalLoadError ? { v2ProposalLoadError } : {}),
  };
}

async function refresh(): Promise<void> {
  const root = requireAppRoot();
  if (firstRunMode) {
    root.innerHTML = renderFirstRunWelcome({ connection: serviceConnection, ...(firstRunAction ? { selectedAction: firstRunAction } : {}) });
    return;
  }
  if (!featureReady) {
    root.innerHTML = renderDiagnostics(await fullDiagnosticsSnapshot());
    return;
  }
  let primaryHtml: string;
  try {
    const renderedModel = await model();
    primaryHtml = renderApp(renderedModel);
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
    persistence_backend: explicitSyncController
      ? "V2 SQLite via Local Service; V1 FileStorage inactive"
      : base.store_status === "NOT_STARTED" ? "not initialized" : "Logseq FileStorage checksummed A/B JSON",
    pending_semantic_commits: state?.commits.filter((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED").length ?? 0,
    source_anchor_conflicts: (state?.anchors.filter((anchor) => anchor.status === "missing" || anchor.status === "conflict").length ?? 0) + (state?.captures.filter((capture) => capture.sourceConflict).length ?? 0),
    runtime_shape_summary: runtimeProbeResult,
    event_listener_status: { rootClick: uiBound, settings: featureReady, explicitSync: explicitSyncController !== undefined, unhandledRejection: true, globalError: true },
    explicit_sync: explicitSyncState,
    recent_logs: operationalLogger.snapshot(),
    recent_action_failure: operationalLogger.latestError(),
  };
}

async function refreshServiceRuntime(descriptorPath: unknown): Promise<void> {
  const generation = ++serviceDiscoveryGeneration;
  if (v2RebindPanel.status !== "idle") v2RebindPanel = { status: "idle" };
  if (v2CandidatePanel.status !== "idle") v2CandidatePanel = { status: "idle" };
  serviceRuntimeClient = undefined;
  serviceConnection = {
    status: "RESTRICTED",
    reasonCode: "SERVICE_DISCOVERY_IN_PROGRESS",
    message: "Local Service 正在重新发现；正式写入暂停。",
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  };
  diagnostics.setServiceConnection(serviceConnection);
  explicitSyncController?.pause();
  const configuredDescriptor = typeof descriptorPath === "string" ? descriptorPath : undefined;
  const descriptorReader = createElectronDescriptorReader()
    ?? createLogseqPrivateStorageDescriptorReader(logseq.FileStorage);
  const runtime = await discoverServiceRuntime(configuredDescriptor, descriptorReader);
  if (generation !== serviceDiscoveryGeneration) return;
  serviceConnection = runtime.connection;
  serviceRuntimeClient = runtime.client;
  diagnostics.setServiceConnection(runtime.connection);
  if (explicitSyncController) {
    if (runtime.client && runtime.connection.formalWritesAvailable) {
      await explicitSyncController.resume(runtime.client);
    } else {
      explicitSyncController.pause();
    }
  }
}

function initializeExplicitSync(): void {
  explicitSyncController = new ExplicitSyncController({
    readBlock: (externalId) => logseq.Editor.getBlock(externalId),
    onIssue(issue) {
      operationalLogger.log("warn", "plugin-lifecycle", "explicit_sync_issue", {
        result: "deferred",
        errorCode: issue.code,
        ...(issue.externalId ? { blockUuid: issue.externalId } : {}),
      });
    },
    onState(state) {
      explicitSyncState = state;
    },
  });
  cleanupHooks.push(registerExplicitSyncEvents(logseq as unknown as ExplicitSyncEventHost, explicitSyncController));
  const reconciliationTimer = globalThis.setInterval(() => {
    void explicitSyncController?.reconcileKnownAnchors();
  }, 5 * 60 * 1000);
  cleanupHooks.push(() => globalThis.clearInterval(reconciliationTimer));
  cleanupHooks.push(() => {
    explicitSyncController?.dispose();
    explicitSyncController = undefined;
    serviceRuntimeClient = undefined;
  });
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

function dialogChecked(name: string): boolean {
  return requireAppRoot().querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.checked === true;
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

function openActionDialog(kind: ActionDialogKind, value: string): Promise<void> {
  actionDialog = { kind, value };
  return refresh();
}

async function handleAction(action: string, value?: string): Promise<void> {
  if (action === "first-run-start" || action === "first-run-migrate") {
    firstRunAction = action === "first-run-start" ? "start" : "migrate";
    await refresh();
    return;
  }
  if (action === "first-run-status") {
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-candidate-open") {
    const client = serviceRuntimeClient;
    const generation = serviceDiscoveryGeneration;
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2CandidatePanel = { status: "error", message: "Local Service 未处于可正式写入的 READY 状态；没有扫描或写入。" };
      await showRuntimeDiagnostics();
      return;
    }
    v2CandidatePanel = { status: "loading" };
    await showRuntimeDiagnostics();
    try {
      const preview = await prepareV2ExplicitCandidateDiscovery(
        client,
        () => logseq.Editor.getCurrentPageBlocksTree(),
        (blockId) => logseq.Editor.getBlock(blockId, { includeChildren: true }),
      );
      if (generation !== serviceDiscoveryGeneration || client !== serviceRuntimeClient) {
        throw new Error("Local Service 已在扫描期间重连；旧候选已作废，没有执行写入。");
      }
      v2CandidatePanel = { status: "ready", preview, serviceGeneration: generation };
    } catch (error) {
      v2CandidatePanel = { status: "error", message: explain(error) };
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-candidate-cancel") {
    if (v2CandidatePanel.status === "ready" && v2CandidatePanel.busy) return;
    v2CandidatePanel = { status: "idle" };
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-candidate-submit") {
    const client = serviceRuntimeClient;
    const currentPanel = v2CandidatePanel;
    if (currentPanel.status === "ready" && currentPanel.busy) return;
    if (currentPanel.status !== "ready") {
      v2CandidatePanel = { status: "error", message: "当前页候选预览已过期或不存在；没有执行同步。" };
      await showRuntimeDiagnostics();
      return;
    }
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2CandidatePanel = { status: "error", message: "Local Service 正在重连或已不可写；旧候选已作废，没有执行同步。" };
      await showRuntimeDiagnostics();
      return;
    }
    if (currentPanel.serviceGeneration !== serviceDiscoveryGeneration) {
      v2CandidatePanel = { status: "error", message: "Local Service 已在扫描后重连；旧候选已作废，没有执行写入。" };
      await showRuntimeDiagnostics();
      return;
    }
    const externalId = dialogField("v2CandidateExternalId");
    v2CandidatePanel = { ...currentPanel, busy: true };
    await showRuntimeDiagnostics();
    const traceId = `v2-candidate-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    try {
      const result = await submitV2ExplicitCandidate(client, currentPanel.preview, externalId, (blockId) => logseq.Editor.getBlock(blockId), traceId);
      v2CandidatePanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "success", message: `${result.operation}：对象 ${result.object.objectId} 已绑定到 Block ${result.anchor.externalId}。其余候选未写入。` }
        : { status: "error", message: "Local Service 在提交期间重连；旧会话已返回成功，请先在 Audit/Doctor 核对，不要立即重试。" };
      operationalLogger.log("info", "ui-action", "v2_explicit_candidate_synchronized", { correlationId: traceId, actionId: "v2-candidate-submit", result: "success", blockUuid: result.anchor.externalId, objectId: result.object.objectId });
    } catch (error) {
      v2CandidatePanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "error", message: explain(error) }
        : { status: "error", message: "Local Service 在提交期间重连；旧会话结果不确定，请先在 Audit/Doctor 核对，不要立即重试。" };
      operationalLogger.log("error", "ui-action", "v2_explicit_candidate_sync_failed", { correlationId: traceId, actionId: "v2-candidate-submit", result: "error", ...(externalId ? { blockUuid: externalId } : {}) }, error);
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-rebind-open") {
    const client = serviceRuntimeClient;
    const generation = serviceDiscoveryGeneration;
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2RebindPanel = { status: "error", message: "Local Service 未处于可正式写入的 READY 状态；没有执行重新绑定。" };
      await showRuntimeDiagnostics();
      return;
    }
    v2RebindPanel = { status: "loading" };
    await showRuntimeDiagnostics();
    try {
      const preview = await prepareV2PrimaryAnchorRebind(client, () => logseq.Editor.getCurrentBlock());
      if (generation !== serviceDiscoveryGeneration || client !== serviceRuntimeClient) {
        throw new Error("Local Service 已在预览期间重连；旧预览已作废，没有执行写入。");
      }
      v2RebindPanel = { status: "ready", preview, serviceGeneration: generation };
    } catch (error) {
      v2RebindPanel = { status: "error", message: explain(error) };
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-rebind-cancel") {
    if (v2RebindPanel.status === "ready" && v2RebindPanel.busy) return;
    v2RebindPanel = { status: "idle" };
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-rebind-submit") {
    const client = serviceRuntimeClient;
    const currentPanel = v2RebindPanel;
    if (currentPanel.status === "ready" && currentPanel.busy) return;
    if (currentPanel.status !== "ready") {
      v2RebindPanel = { status: "error", message: "Primary Anchor 预览已过期或不存在；没有执行重新绑定。" };
      await showRuntimeDiagnostics();
      return;
    }
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2RebindPanel = { status: "error", message: "Local Service 正在重连或已不可写；旧预览已作废，没有执行重新绑定。" };
      await showRuntimeDiagnostics();
      return;
    }
    if (currentPanel.serviceGeneration !== serviceDiscoveryGeneration) {
      v2RebindPanel = { status: "error", message: "Local Service 已在预览后重连；旧预览已作废，没有执行写入。" };
      await showRuntimeDiagnostics();
      return;
    }
    const previousAnchorId = dialogField("v2RebindPreviousAnchorId");
    const confirmed = dialogChecked("v2RebindConfirmed");
    v2RebindPanel = { ...currentPanel, busy: true };
    await showRuntimeDiagnostics();
    const traceId = `v2-rebind-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    try {
      const result = await submitV2PrimaryAnchorRebind(client, currentPanel.preview, previousAnchorId, confirmed, () => logseq.Editor.getCurrentBlock(), traceId);
      v2RebindPanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "success", message: `对象 ${result.object.objectId} 已绑定到 Block ${result.anchor.externalId}；旧 Anchor 保留为 replaced。` }
        : { status: "error", message: "Local Service 在提交期间重连；旧会话已返回成功，请先在 Audit/Doctor 核对，不要立即重试。" };
      operationalLogger.log("info", "ui-action", "v2_primary_anchor_rebound", { correlationId: traceId, actionId: "v2-rebind-submit", result: "success", blockUuid: result.anchor.externalId });
    } catch (error) {
      v2RebindPanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "error", message: explain(error) }
        : { status: "error", message: "Local Service 在提交期间重连；旧会话结果不确定，请先在 Audit/Doctor 核对，不要立即重试。" };
      operationalLogger.log("error", "ui-action", "v2_primary_anchor_rebind_failed", { correlationId: traceId, actionId: "v2-rebind-submit", result: "error" }, error);
    }
    await showRuntimeDiagnostics();
    return;
  }
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
    const correlationId = `TC-copy-${Date.now()}`;
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
      latestError = `复制诊断失败：${explain(error)}。诊断数据仍保留在内存中。诊断 ID：${correlationId}`;
      operationalLogger.log("error", "ui-action", "copy_diagnostics_failed", { correlationId, actionId: "copy-diagnostics", result: "error" }, error);
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "export-diagnostics") {
    downloadText(`task-copilot-diagnostics-${Date.now()}.jsonl`, operationalLogger.exportJsonl(), "application/x-ndjson");
    message = "Diagnostics JSONL 已导出。";
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "recover-previous-slot") {
    const repository = v1Runtime.repository;
    if (!repository) throw new Error("V1 Persistence Repository 未启用，无法恢复。");
    const now = Date.now();
    if (!previousSlotRecoveryArmedAt || now - previousSlotRecoveryArmedAt > 30_000) {
      previousSlotRecoveryArmedAt = now;
      diagnostics.setNotice({
        code: "PREVIOUS_SLOT_RECOVERY_CONFIRM_REQUIRED",
        message: "尚未执行恢复。只有 active payload 已损坏时才可切换；损坏 Slot 会保留作为证据。",
        next_step: "如确认继续，请在 30 秒内再次点击“恢复上一可读 Slot”。",
      });
      await showRuntimeDiagnostics();
      return;
    }
    previousSlotRecoveryArmedAt = undefined;
    try {
      const recovered = await repository.recoverPreviousSlot();
      diagnostics.setRecoveryState(`explicit previous-slot recovery: generation ${recovered.previousGeneration}, ${recovered.previousActiveSlot} -> ${recovered.recoveredSlot}, revision ${recovered.recoveredRevision}`);
      diagnostics.setNotice({
        code: "PREVIOUS_SLOT_RECOVERED",
        message: `已切换到 ${recovered.recoveredSlot}，revision ${recovered.recoveredRevision}；损坏 Slot 未删除。`,
        next_step: "请在 Logseq 插件页禁用并重新启用 Task Copilot，再扫描 Pending Commit。",
      });
      operationalLogger.log("info", "plugin-lifecycle", "previous_slot_recovered", { result: "success", ...recovered });
    } catch (error) {
      latestError = explain(error);
      operationalLogger.log("error", "plugin-lifecycle", "previous_slot_recovery_failed", { result: "error" }, error);
    }
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
      const contentPort = v1Runtime.contentPort;
      if (!contentPort) throw new Error("V1 Logseq Content Adapter 未启用。");
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
    const token = `${correlationId}-${Math.random().toString(16).slice(2)}`;
    const delegated = new Promise<boolean>((resolve) => {
      inboxProbeWaiters.set(token, () => resolve(true));
      globalThis.setTimeout(() => { inboxProbeWaiters.delete(token); resolve(false); }, 500);
    });
    const probeButton = document.createElement("button");
    probeButton.type = "button";
    probeButton.dataset.action = "inbox-probe-ping";
    probeButton.dataset.value = token;
    probeButton.hidden = true;
    requireAppRoot().append(probeButton);
    probeButton.click();
    const delegatedHandler = await delegated;
    probeButton.remove();
    const count = featureReady ? (await requireTaskCopilot().listInbox()).length : 0;
    runtimeProbeResult = { status: delegatedHandler && featureReady ? "read-only-pass" : "read-only-fail", probe: "Inbox Action", layers: { domClick: true, delegatedHandler, applicationQuery: featureReady }, inboxCount: count, writesExecuted: false };
    operationalLogger.log("info", "query-refresh", "query_invalidated", { correlationId, actionId: "inbox-action-probe", result: "probe-only" });
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "runtime-diagnostics") {
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "inbox-probe-ping" && value) {
    inboxProbeWaiters.get(value)?.();
    inboxProbeWaiters.delete(value);
    return;
  }
  const taskCopilot = requireTaskCopilot();
  if (action === "create-v2-project") {
    const name = dialogField("v2ProjectName");
    await run(async () => {
      if (!name) throw new Error("Project 名称不能为空。");
      const client = serviceRuntimeClient;
      if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
        throw new Error("V2 Local Service 未就绪；没有创建页面或 SQLite 对象。");
      }
      const traceId = `project-create-ui-${Date.now()}`;
      const result = await createProjectWithControlledPage(client, {
        getPage: (pageName) => logseq.Editor.getPage(pageName),
        createPage: (pageName, properties, options) => logseq.Editor.createPage(pageName, properties, options),
        getPageBlocksTree: (pageName) => logseq.Editor.getPageBlocksTree(pageName),
      }, name, traceId);
      workspace = "objects";
      message = `${result.pageName} 已创建并验证；Project ${result.object.objectId} 已正式写入 SQLite，可重试且不会重复。`;
    });
    return;
  }
  if ((action === "v2-review-accept" || action === "v2-review-reject") && value) {
    const [proposalId, groupId, expectedUpdatedAt, risk] = value.split("|");
    if (!proposalId || !groupId || !expectedUpdatedAt) return;
    if (action === "v2-review-accept" && risk === "HIGH") return openActionDialog("confirm-v2-review-accept", value);
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client) throw new Error("V2 Local Service 未就绪；审阅决定未保存。");
      await client.reviewProposal(proposalId, { [groupId]: { disposition: action === "v2-review-accept" ? "ACCEPTED" : "REJECTED" } }, expectedUpdatedAt);
      workspace = "review";
    }, action === "v2-review-accept" ? "语义组已接受，但尚未正式生效；最终 Commit 仍需版本重验。" : "语义组已拒绝；没有修改正式状态。");
    return;
  }
  if (action === "v2-review-defer" && value) return openActionDialog("v2-review-defer", value);
  if (action === "v2-proposal-revalidate" && value) {
    const [proposalId, expectedUpdatedAt] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!proposalId || !expectedUpdatedAt || !client) throw new Error("V2 重验上下文已失效；没有修改正文或正式状态。");
      const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
      if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新检查。");
      const observations = await collectV2ProposalGraphObservations(stored.proposal, {
        getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }),
        getPage: (id) => logseq.Editor.getPage(id),
      });
      const result = await client.revalidateProposal(proposalId, observations, expectedUpdatedAt);
      workspace = "review";
      if (result.result.status === "STALE") {
        message = `提交前检查未通过：${result.result.issues.map((issue) => `${issue.kind}:${issue.id} ${issue.reason}`).join("；")}。Proposal 已标记 STALE，没有正式生效。`;
        return;
      }
      message = "提交前版本与 scope 检查通过；仍未正式生效，下一步是在同一审阅上下文确认最终 Commit。";
    });
    return;
  }
  if (action === "submit-v2-review-accept" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请独立确认高影响语义组。"; await refresh(); return; }
    const [proposalId, groupId, expectedUpdatedAt] = value.split("|");
    await run(async () => {
      if (!proposalId || !groupId || !expectedUpdatedAt || !serviceRuntimeClient) throw new Error("V2 审阅上下文已失效；请刷新后重试。");
      await serviceRuntimeClient.reviewProposal(proposalId, { [groupId]: { disposition: "ACCEPTED", highImpactConfirmed: true } }, expectedUpdatedAt);
      actionDialog = undefined;
      workspace = "review";
    }, "高影响语义组已接受，但尚未正式生效；最终 Commit 仍需版本重验。");
    return;
  }
  if (action === "submit-v2-review-defer" && value) {
    const [proposalId, groupId, expectedUpdatedAt] = value.split("|");
    const raw = dialogField("v2DeferredUntil");
    const reason = dialogField("v2DeferReason");
    await run(async () => {
      const deferredUntil = new Date(raw);
      if (!proposalId || !groupId || !expectedUpdatedAt || !serviceRuntimeClient || !raw || !Number.isFinite(deferredUntil.getTime()) || !reason) throw new Error("请填写合法复查时间和原因。");
      await serviceRuntimeClient.reviewProposal(proposalId, { [groupId]: { disposition: "DEFERRED", deferredUntil: deferredUntil.toISOString(), reason } }, expectedUpdatedAt);
      actionDialog = undefined;
      workspace = "review";
    }, "语义组已暂缓；没有修改正式状态。");
    return;
  }
  if (action === "cancel-inbox-dialog") {
    inboxDialog = undefined;
    await refresh();
    return;
  }
  if (action === "cancel-action-dialog") {
    actionDialog = undefined;
    await refresh();
    return;
  }
  if (action === "submit-edit-object" && value) {
    const text = dialogField("objectText");
    if (!text) {
      latestError = "对象正文不能为空。";
      await refresh();
      return;
    }
    await run(async () => {
      await taskCopilot.createManualObjectEditProposal(value, {
        text,
        completionCriteria: dialogField("objectCompletionCriteria"),
        nextAction: dialogField("objectNextAction"),
        currentSummary: dialogField("objectCurrentSummary"),
        purpose: dialogField("objectPurpose"),
        targetOutcome: dialogField("objectTargetOutcome"),
        scopeIn: dialogField("objectScopeIn"),
        dueAt: dialogField("objectDueAt"),
        reviewAt: dialogField("objectReviewAt"),
      });
      actionDialog = undefined;
      workspace = "review";
    }, "对象编辑 Proposal 已创建；Logseq 正文和 Domain State 尚未改变。");
    return;
  }
  if (action === "submit-set-owner" && value) {
    const ownerObjectId = dialogField("ownerObjectId");
    if (!ownerObjectId || !dialogChecked("highImpactConfirmed")) {
      latestError = "请选择主归属，并单独确认这项高影响变化。";
      await refresh();
      return;
    }
    await run(async () => {
      await taskCopilot.createManualOwnershipProposal(value, ownerObjectId);
      actionDialog = undefined;
      workspace = "review";
    }, "主归属 Proposal 已创建；正文不会移动，正式归属尚未改变。");
    return;
  }
  if (action === "submit-condition" && value) {
    const [objectId, rawKind] = value.split("|");
    if (!objectId || !rawKind) return;
    const kind = rawKind as ConditionKind;
    const evidence: Record<string, string> = kind === "WAITING"
      ? { waitingFor: dialogField("waitingFor"), expectedResult: dialogField("expectedResult"), reviewAt: dialogField("conditionReviewAt") }
      : { reason: dialogField("conditionReason") };
    if (Object.values(evidence).some((field) => !field)) {
      latestError = "Condition 证据字段不能为空。";
      await refresh();
      return;
    }
    await run(async () => {
      await taskCopilot.createManualConditionProposal(objectId, kind, evidence);
      actionDialog = undefined;
      workspace = "review";
    }, `Condition ${kind} Proposal 已创建；状态尚未改变。`);
    return;
  }
  if (action === "submit-review-edit" && value) {
    const [proposalId, operationId] = value.split("|");
    if (!proposalId || !operationId) return;
    if (!dialogChecked("finalPayloadConfirmed")) {
      latestError = "请确认编辑后的最终 payload。";
      await refresh();
      return;
    }
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(dialogField("operationPayload")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload 必须是 JSON object");
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      latestError = explain(error);
      await refresh();
      return;
    }
    await run(async () => {
      const editedHighImpact = (await taskCopilot.getEditedOperationRisk(proposalId, operationId, payload)) === "HIGH";
      await taskCopilot.reviewProposal(proposalId, {
        [operationId]: { status: "EDITED", payload, highImpactConfirmed: editedHighImpact },
      });
      actionDialog = undefined;
    }, "已保存用户确认版本；Agent 原建议仍在审计字段中保留。");
    return;
  }
  if (action === "submit-review-defer" && value) {
    const [proposalId, operationId] = value.split("|");
    const deferredUntil = dialogField("operationDeferredUntil");
    const reason = dialogField("operationDeferReason");
    if (!proposalId || !operationId || !deferredUntil || !reason) {
      latestError = "请填写复查时间和暂缓原因。";
      await refresh();
      return;
    }
    await run(async () => {
      await taskCopilot.deferProposalOperation(proposalId, operationId, deferredUntil, reason);
      actionDialog = undefined;
    }, "操作已暂缓；Proposal 保持待审查，Capture 未被解决。");
    return;
  }
  if (action === "submit-reject-proposal" && value) {
    const reason = dialogField("proposalRejectReason");
    if (!reason) {
      latestError = "全部拒绝原因不能为空。";
      await refresh();
      return;
    }
    await run(async () => {
      const proposal = await taskCopilot.rejectProposal(value, reason);
      actionDialog = undefined;
      message = proposal.status === "COMMITTED"
        ? "其余操作已拒绝；此前已经提交的正式变化保持不变。"
        : "Proposal 已全部拒绝；没有正式正文或领域变化。";
    });
    return;
  }
  if (action === "submit-review-accept" && value) {
    const [proposalId, operationId] = value.split("|");
    if (!proposalId || !operationId || !dialogChecked("actionConfirmed")) {
      latestError = "请单独确认这个高影响操作。";
      await refresh();
      return;
    }
    await run(async () => {
      await taskCopilot.reviewProposal(proposalId, { [operationId]: { status: "ACCEPTED", highImpactConfirmed: true } });
      actionDialog = undefined;
    });
    return;
  }
  if (action === "submit-phase" && value) {
    const [objectId, requestedPhase, renderedObjectType, renderedPhase] = value.split("|");
    if (!objectId || !requestedPhase || !renderedObjectType || !renderedPhase) return;
    if (requestedPhase === "COMPLETED" && !dialogChecked("actionConfirmed")) {
      latestError = "请确认 Project 完成检查。";
      await refresh();
      return;
    }
    const reason = renderedPhase === "COMPLETED" && requestedPhase === "ACTIVE" ? dialogField("phaseReason") : "";
    if (renderedPhase === "COMPLETED" && requestedPhase === "ACTIVE" && !reason) {
      latestError = "重新打开原因不能为空。";
      await refresh();
      return;
    }
    const object = await taskCopilot.getObject(objectId);
    const available = await taskCopilot.getAvailableObjectPhases(objectId);
    if (object.objectType !== renderedObjectType || object.phase !== renderedPhase || !available.includes(requestedPhase as Phase)) {
      actionDialog = undefined;
      latestError = `对象状态已变化；已刷新合法 Phase，请重新选择。`;
      await refresh();
      return;
    }
    await run(async () => {
      await taskCopilot.createManualPhaseProposal(objectId, requestedPhase as Phase, {
        ...(requestedPhase === "COMPLETED" ? { completionChecksPassed: true } : {}),
        ...(reason ? { reason } : {}),
      });
      actionDialog = undefined;
      workspace = "review";
    }, `Phase ${requestedPhase} Proposal 已创建；状态尚未改变。`);
    return;
  }
  if (action === "submit-rebind-anchor" && value) {
    if (!dialogChecked("actionConfirmed")) {
      latestError = "请确认重新绑定主正文 Anchor。";
      await refresh();
      return;
    }
    await run(async () => {
      await taskCopilot.rebindPrimaryAnchor(value);
      actionDialog = undefined;
    }, "Anchor 已重新绑定。");
    return;
  }
  if (action === "submit-undo-commit" && value) {
    if (!dialogChecked("actionConfirmed")) {
      latestError = "请确认撤销 SemanticCommit。";
      await refresh();
      return;
    }
    await run(async () => {
      const commit = await taskCopilot.undoCommit(value);
      if (commit.status !== "COMPLETED") throw new Error(`Undo SemanticCommit ${commit.status}：${commit.error?.message ?? "请在审计与恢复中处理"}`);
      actionDialog = undefined;
    }, "已创建逆向 SemanticCommit；旧历史未被改写。");
    return;
  }
  if (value && action === "manual-formalize") return openInboxDialog(value, "formalize");
  if (value && action === "create-manual-proposal") return openInboxDialog(value, "proposal");
  if (value && action === "link-existing-object") return openInboxDialog(value, "link");
  if (value && action === "defer") return openInboxDialog(value, "defer");
  if (value && action === "no-action") return openInboxDialog(value, "dismiss");
  if (value && action === "open-source") {
    await actions().execute("open-source", value, async (correlationId) => {
      await taskCopilot.openCaptureSource(value, { correlationId });
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
    const ownerConfirmed = dialogChecked("ownerConfirmed");
    await actions().execute("manual-formalize", value, async (correlationId) => {
      if (!text) throw new Error("正式正文不能为空。");
      if (objectType !== "AREA" && (!completionCriteria || !nextAction)) throw new Error("Task、MiniProject 和 Project 的完成标准与下一步不能为空。");
      const input: Parameters<TaskCopilot["createManualFormalizationProposal"]>[1] = objectType === "AREA"
        ? { objectType, text, purpose: text }
        : objectType === "PROJECT"
        ? { objectType, text, purpose: text, targetOutcome: completionCriteria, scopeIn: "待确认", completionCriteria, nextAction }
        : objectType === "MINI_PROJECT"
          ? { objectType, text, targetOutcome: completionCriteria, completionCriteria, nextAction }
          : { objectType: "TASK", text, completionCriteria, nextAction };
      if (ownerId && !ownerConfirmed) throw new Error("主归属是高影响变化，必须单独勾选确认。");
      const context = { correlationId };
      const proposal = await taskCopilot.createManualFormalizationProposal(value, input, ownerId || undefined, context);
      await taskCopilot.reviewProposal(proposal.proposalId, Object.fromEntries(proposal.operations.map((operation) => [operation.operationId, operation.riskLevel === "HIGH" ? { status: "ACCEPTED", highImpactConfirmed: true } : "ACCEPTED"])), context);
      const commit = await taskCopilot.commitProposal(proposal.proposalId, context);
      if (commit.status !== "COMPLETED") throw new Error(`SemanticCommit ${commit.status}；Capture 保持可恢复，诊断请查看 Audit。`);
      const state = await taskCopilot.exportState();
      const capture = state.captures.find((candidate) => candidate.captureId === value);
      const objectId = capture?.resolvedObjectIds[0];
      if (!objectId || capture.phase !== "RESOLVED") throw new Error("对象提交后未观察到 Capture RESOLVED；请勿重复提交并检查 Diagnostics。");
      selectedObjectId = objectId;
      workspace = "objects";
      inboxDialog = undefined;
      message = `已创建 ${objectType}；正文位于原 Block（如有编辑已在同一 Commit 更新），来源 Anchor 已保留，Capture 已解决。`;
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
  if (action === "generate-proposal" && value) {
    await run(async () => {
      await taskCopilot.generateProposal(value);
      workspace = "review";
    }, "Demo Proposal 已生成；它仍不是正式事实。");
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
  if ((action === "review-accept" || action === "review-reject") && value) {
    const [proposalId, operationId, risk] = value.split("|");
    if (!proposalId || !operationId) return;
    if (action === "review-accept" && risk === "HIGH") return openActionDialog("confirm-review-accept", `${proposalId}|${operationId}`);
    await run(async () => {
      await taskCopilot.reviewProposal(proposalId, {
        [operationId]: action === "review-accept"
          ? { status: "ACCEPTED", highImpactConfirmed: false }
          : "REJECTED",
      });
    });
    return;
  }
  if (action === "review-edit" && value) {
    return openActionDialog("review-edit", value);
  }
  if (action === "review-defer" && value) {
    return openActionDialog("review-defer", value);
  }
  if (action === "reject-proposal" && value) {
    return openActionDialog("reject-proposal", value);
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
    return openActionDialog("edit-object", value);
  }
  if (action === "open-object" && value) {
    await run(async () => taskCopilot.openObjectText(value));
    return;
  }
  if (action === "set-owner" && value) {
    return openActionDialog("set-owner", value);
  }
  if (action === "view-audit") {
    workspace = "audit";
    await refresh();
    return;
  }
  if (action.startsWith("condition-") && value) {
    const kind = action.slice("condition-".length).toUpperCase() as ConditionKind;
    if (kind === "WAITING" || kind === "BLOCKED" || kind === "PAUSED") return openActionDialog(`condition-${kind.toLowerCase()}` as ActionDialogKind, value);
    await run(async () => {
      await taskCopilot.createManualConditionProposal(value, kind, {});
      workspace = "review";
    }, `Condition ${kind} Proposal 已创建；状态尚未改变。`);
    return;
  }
  if (action === "advance-phase" && value) {
    const [objectId, requestedPhase, renderedObjectType, renderedPhase] = value.split("|");
    if (!objectId || !requestedPhase || !renderedObjectType || !renderedPhase) return;
    if (renderedObjectType === "PROJECT" && requestedPhase === "COMPLETED") return openActionDialog("confirm-phase", value);
    if (renderedPhase === "COMPLETED" && requestedPhase === "ACTIVE") return openActionDialog("reopen-phase", value);

    const object = await taskCopilot.getObject(objectId);
    const available = await taskCopilot.getAvailableObjectPhases(objectId);
    const phase = available.find((candidate) => candidate === requestedPhase);
    if (object.objectType !== renderedObjectType || object.phase !== renderedPhase) {
      latestError = `对象已从 ${renderedPhase} 变为 ${object.phase}；已刷新合法 Phase，请重新选择。`;
      await refresh();
      return;
    }
    if (!phase) {
      latestError = available.length > 0 ? `请选择合法 Phase：${available.join(" / ")}` : `当前 ${object.phase} 没有合法后续流转。`;
      await refresh();
      return;
    }
    await run(
      async () => {
        await taskCopilot.createManualPhaseProposal(objectId, phase, {
          ...(object.objectType === "PROJECT" && phase === "COMPLETED" ? { completionChecksPassed: true } : {}),
        });
        workspace = "review";
      },
      `Phase ${phase} Proposal 已创建；状态尚未改变。`,
    );
    return;
  }
  if (action === "rebind-anchor" && value) {
    return openActionDialog("confirm-rebind", value);
  }
  if (action === "open-anchor" && value) {
    await run(async () => taskCopilot.openAnchor(value));
    return;
  }
  if (action === "undo-commit" && value) {
    return openActionDialog("confirm-undo", value);
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
      const blobStore = v1Runtime.blobStore;
      if (!blobStore) throw new Error("V1 FileStorage 未启用；请使用只读迁移导出工具。");
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
      const blobStore = v1Runtime.blobStore;
      if (!blobStore) throw new Error("V1 FileStorage 未启用；请使用只读迁移导出工具。");
      const raw = await blobStore.get("task-copilot/backups/latest.json");
      if (!raw) throw new Error("尚无恢复包，请先创建备份。");
      const result = restoreRecoveryBundle(JSON.parse(raw) as RecoveryBundle);
      recoveryReport = `临时 Store 恢复校验完成：对象 ${result.state.objects.length}，关系 ${result.state.relations.length}，事件 ${result.state.events.length}，Missing Anchor ${result.anchorReport.missing.length}，差异 ${result.differences.length}。`;
    });
  }
}

const onRootClick = createDelegatedActionHandler(handleAction, (error) => {
  const correlationId = `TC-unhandled-${Date.now()}`;
  latestError = `界面操作失败：${explain(error)}。Capture 与原始 Logseq 内容保持安全。诊断 ID：${correlationId}`;
  operationalLogger.log("error", "ui-action", "ui_action_unhandled", { correlationId, result: "error" }, error);
  void refresh().catch((refreshError) => {
    operationalLogger.log("error", "query-refresh", "ui_refresh_failed", { correlationId, result: "error" }, refreshError);
    void showRuntimeDiagnostics();
  });
});

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
  requireAppRoot().innerHTML = renderDiagnostics(await fullDiagnosticsSnapshot());
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
    {
      key: "serviceDescriptorPath",
      type: "string",
      title: "V2 Local Service descriptor 私有存储 key",
      description: "仅填写 Service 写入 Task Copilot 私有 FileStorage 的文件名；token 不写入设置或 Graph，FileStorage 不作为领域状态源。",
      default: "",
    },
  ]);
  markReady("SETTINGS_READY");

  diagnostics.start("SERVICE_CONNECTION_READY");
  const descriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
  await refreshServiceRuntime(descriptorPath);
  markReady("SERVICE_CONNECTION_READY", `V2 service ${serviceConnection.status.toLowerCase()}`);
  diagnostics.start("EVENTS_READY");
  initializeExplicitSync();

  if (typeof descriptorPath !== "string" || !descriptorPath.trim()) {
    firstRunMode = true;
    cleanupHooks.push(logseq.onSettingsChanged(() => {
      const nextDescriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
      void refreshServiceRuntime(nextDescriptorPath)
        .then(() => {
          firstRunAction = "start";
          if (logseq.isMainUIVisible) void refresh();
        })
        .catch((error: unknown) => operationalLogger.log("error", "plugin-lifecycle", "service_connection_refresh_failed", { result: "error" }, error));
    }));
    markReady("EVENTS_READY");
    markReady("PLUGIN_READY", "first-run welcome ready; no Graph scan, migration, or model call performed");
    return;
  }

  diagnostics.start("RUNTIME_ADAPTER_READY");
  markReady("RUNTIME_ADAPTER_READY", "V2 Logseq event adapter ready; V1 content commands inactive");

  diagnostics.start("PERSISTENCE_READY");
  diagnostics.setStoreSchema("V2 SQLite owned by Local Service");
  diagnostics.setStoreStatus(serviceConnection.status === "READY" ? "READY" : "READ_ONLY_SAFE_MODE");
  diagnostics.setRecoveryState("V1 FileStorage inactive; V2 consistency check pending Slice B4");
  markReady("PERSISTENCE_READY", "V2 persistence authority remains behind Local Service");

  diagnostics.start("MIGRATION_READY");
  markReady("MIGRATION_READY", "no automatic migration performed");

  diagnostics.start("APPLICATION_READY");
  markReady("APPLICATION_READY", "formal explicit synchronization delegated to V2 Local Service");

  if (serviceRuntimeClient && serviceConnection.formalWritesAvailable) await explicitSyncController!.resume(serviceRuntimeClient);
  cleanupHooks.push(logseq.onSettingsChanged(() => {
    const nextDescriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
    void refreshServiceRuntime(nextDescriptorPath)
      .then(() => {
        diagnostics.setStoreStatus(serviceConnection.status === "READY" ? "READY" : "READ_ONLY_SAFE_MODE");
        message = `设置已更新；V2 Local Service ${serviceConnection.status}，正式领域状态与历史未受影响。`;
        if (logseq.isMainUIVisible) void refresh();
      })
      .catch((error: unknown) => operationalLogger.log("error", "plugin-lifecycle", "service_connection_refresh_failed", { result: "error" }, error));
  }));
  markReady("EVENTS_READY");
  featureReady = false;
  markReady("PLUGIN_READY", "V2 explicit synchronization ready; V1 write UI remains inactive");
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
