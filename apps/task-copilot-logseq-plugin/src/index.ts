import "@logseq/libs";

import type { V2Anchor, V2Condition, V2MiniProjectClosure, V2ProjectStructure, V2Proposal } from "@task-copilot/domain";
import {
  RuntimeShapeAdapter,
  resolveLogseqPageReference,
  stripLogseqBlockIdentityProperty,
} from "@task-copilot/logseq-adapter";

import {
  MAIN_UI_ROOT_ID,
  PLUGIN_COMMIT,
  RuntimeDiagnostics,
  mountWithDiagnosticFallback,
  renderRuntimeDiagnostics,
  type RuntimeStage,
} from "./runtime-diagnostics.ts";
import { BootstrapRegistration, bindRootClick, captureUiFocus, restoreUiFocus, type BootstrapCallbacks, type BootstrapHost } from "./bootstrap-shell.ts";
import { isWorkspace, renderApp, type ActionDialogKind, type UiModel, type V2NowWorkGrouping, type V2NowWorkTypeFilter, type Workspace } from "./ui.ts";
import { createDelegatedActionHandler } from "./inbox-action-controller.ts";
import { StructuredLogger } from "./structured-logger.ts";
import {
  createElectronDescriptorReader,
  createLogseqPrivateStorageDescriptorReader,
  deriveLauncherGraphKey,
  discoverServiceRuntime,
  importServiceDescriptorToPrivateStorage,
  type ServiceLifecycleSession,
  type ServiceRuntimeClient,
} from "./service-connection.ts";
import { renderFirstRunWelcome, type FirstRunAction, type FirstRunModel } from "./first-run.ts";
import type {
  ServiceConnectionState,
  ServiceNowWork,
  ServiceSemanticCommit,
  ServiceStoredProposal,
} from "@task-copilot/service-client";
import {
  ensurePersistentBlockIdentity as ensurePersistentBlockIdentityWithoutEcho,
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
  formalizeV2Candidate,
  persistV2ExplicitCandidateDiscovery,
  prepareV2ExplicitCandidateDiscovery,
  updateExistingObjectFromV2Candidate,
  type V2ExplicitCandidatePanelState,
} from "./v2-explicit-candidate-discovery.ts";
import { createProjectWithControlledPage } from "./v2-project-creation.ts";
import { buildSelectedBlockProposalPrompt, buildSelectedBlockProposalRevisionPrompt } from "./v2-provider-analysis.ts";
import { buildMiniProjectLegacyTransferProposal } from "./v2-mini-project-legacy-transfer.ts";
import { submitV2Association, type V2AssociationSubmissionState } from "./v2-association-controller.ts";
import { collectV2ProposalGraphObservations } from "./v2-proposal-revalidation.ts";
import { commitV2Formalization, undoV2Formalization } from "./v2-proposal-commit.ts";
import { applyLowRiskV2Proposal } from "./v2-low-risk-apply.ts";
import { settleRuntimeBridgeCall } from "./runtime-bridge-guard.ts";
import { GraphReadBridgeController } from "./graph-read-bridge-controller.ts";
import { BlockFocusController } from "./block-focus-controller.ts";
import { BlockConditionController, type BlockConditionDraft } from "./block-condition-controller.ts";
import { PageContextController, type PageContextSnapshot } from "./page-context-controller.ts";
import { checksum, StructuredError } from "@task-copilot/shared";
import { deriveToolbarIntervention, type ToolbarIntervention } from "./toolbar-intervention.ts";
import { managedRuntimeEndDecision } from "./service-lifecycle-policy.ts";
import { insertSlashCreateSyntax, slashCreateContentAfterInsertion, SLASH_CREATE_SYNTAX, type SlashCreateObjectType } from "./slash-create-command.ts";
import { OriginRouteController, type OriginRouteToken } from "./origin-route-controller.ts";
import { readSelectedBlockForAnalysis, SelectedBlockAnalysisTarget } from "./selected-block-analysis.ts";
import {
  AttentionShadowSession,
  attentionShadowCurrentSignature,
  buildAttentionDetectorSnapshot,
  summarizeDynamicNowShadow,
  type AttentionShadowCycleSummary,
  type DynamicNowShadowRuntimeSummary,
} from "./attention-shadow-runtime.ts";
import { projectPluginV2ProjectReentry, type PluginProjectReentryCard } from "./reentry-runtime.ts";

let appRoot: HTMLElement | undefined;
const diagnostics = new RuntimeDiagnostics();
const bootstrapRegistration = new BootstrapRegistration();
const cleanupHooks: Array<() => void> = [];
let featureReady = false;
let uiBound = false;
let workspace: Workspace = "now";
let reviewMode: NonNullable<UiModel["reviewMode"]> = "candidates";
let v2NowWorkTypeFilter: V2NowWorkTypeFilter = "ALL";
let v2NowWorkGrouping: V2NowWorkGrouping = "mixed";
let message: string | undefined;
let latestError: string | undefined;
let recentActionCommitId: string | undefined;
let actionDialog: UiModel["actionDialog"];
const operationalLogger = new StructuredLogger(300, { pluginVersion: "0.1.0", pluginCommit: PLUGIN_COMMIT });
const attentionShadowSession = new AttentionShadowSession();
let lastAttentionShadowSummarySignature: string | undefined;
const graphReadBridgeController = new GraphReadBridgeController({
  getPage: (target) => logseq.Editor.getPage(target as never),
  getPageBlocksTree: (target) => logseq.Editor.getPageBlocksTree(target as never),
  getBlock: (target, options) => logseq.Editor.getBlock(target as never, options),
}, {
  onIssue: restrictServiceRuntimeAfterTransportFailure,
});
let firstRunMode = false;
let firstRunAction: FirstRunAction | undefined;
let firstRunDescriptorImport: FirstRunModel["descriptorImport"];
let firstRunDescriptorImportBusy = false;
let ignoredDescriptorSettingValue: string | undefined;
let serviceRuntimeClient: ServiceRuntimeClient | undefined;
let serviceLifecycleSession: ServiceLifecycleSession | undefined;
let serviceLifecycleHeartbeatTimer: ReturnType<typeof globalThis.setInterval> | undefined;
let serviceLifecycleHeartbeatBusy = false;
let configuredServiceDescriptorPath: string | undefined;
let currentGraphKey: string | undefined;
let runtimeEndedByUser = false;
let graphSwitchQueue: Promise<void> = Promise.resolve();
const pluginInstanceId = `plugin-${globalThis.crypto.randomUUID()}`;
const blockFocusController = new BlockFocusController(() => serviceRuntimeClient);
const blockConditionController = new BlockConditionController(() => serviceRuntimeClient);
const pageContextController = new PageContextController(() => serviceRuntimeClient, {
  getPage: (identity) => logseq.Editor.getPage(identity),
  getCurrentPage: () => logseq.Editor.getCurrentPage(),
  getPageBlocksTree: (identity) => logseq.Editor.getPageBlocksTree(identity),
});
const originRouteController = new OriginRouteController({
  getCurrentPage: () => logseq.Editor.getCurrentPage(),
  getPage: (identity) => logseq.Editor.getPage(identity as never),
  getBlock: (uuid) => logseq.Editor.getBlock(uuid),
  scrollToBlockInPage: async (page, blockUuid) => {
    await logseq.Editor.scrollToBlockInPage(page, blockUuid);
  },
  pushState: (route, parameters) => logseq.App.pushState(route, parameters),
  hideMainUI: () => logseq.hideMainUI(),
});
let pageContext: PageContextSnapshot | undefined;
let originRoute: OriginRouteToken | undefined;
const v2ProviderTarget = new SelectedBlockAnalysisTarget();
let serviceDiscoveryGeneration = 0;
let explicitSyncController: ExplicitSyncController | undefined;
let explicitSyncState: ExplicitSyncState = {
  pending: 0,
  transportReady: false,
  reconciliationRequired: false,
};
let v2RebindPanel: V2RebindPanelState = { status: "idle" };
let v2CandidatePanel: V2ExplicitCandidatePanelState = { status: "idle" };
let v2ProviderState: NonNullable<UiModel["v2ProviderState"]> = { status: "idle" };
let v2ProviderRevisionBusy = false;
let v2LowRiskApplyBusyProposalId: string | undefined;
const v2AssociationSubmission: V2AssociationSubmissionState = { busy: false };
let v2OwnershipCommitBusy = false;
let v2BlockConditionBusy = false;
let v2LifecycleCommitBusy = false;
let v2ClosureProposalBusy = false;
let v2LifecycleProposalBusy = false;
let v2AreaBusy = false;
let v2ClosureDraftBusy = false;
let v2ClosureDraftInput: V2MiniProjectClosure | undefined;
let v2LegacyTransferBusy = false;
let v2ClosureReviewBusy = false;
let serviceConnection: ServiceConnectionState = {
  status: "RESTRICTED",
  reasonCode: "SERVICE_DESCRIPTOR_PATH_REQUIRED",
  message: "尚未配置 Local Service descriptor 路径。",
  formalWritesAvailable: false,
  graphEditingAvailable: true,
};
let toolbarFacts: {
  nowWork?: ServiceNowWork;
  proposals: ServiceStoredProposal[];
  semanticCommits: ServiceSemanticCommit[];
  available: boolean;
} = {
  proposals: [],
  semanticCommits: [],
  available: false,
};
let toolbarIntervention: ToolbarIntervention = deriveToolbarIntervention({
  proposals: [],
  semanticCommits: [],
  formalConnectionRisk: false,
});

function requireAppRoot(): HTMLElement {
  const root = appRoot ?? document.getElementById(MAIN_UI_ROOT_ID);
  if (!root) throw new Error(`Task Copilot root element #${MAIN_UI_ROOT_ID} is unavailable.`);
  appRoot = root;
  return root;
}

function explain(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function updateToolbarIntervention(): void {
  toolbarIntervention = deriveToolbarIntervention({
    ...(toolbarFacts.nowWork ? { nowWork: toolbarFacts.nowWork } : {}),
    proposals: toolbarFacts.proposals,
    semanticCommits: toolbarFacts.semanticCommits,
    formalConnectionRisk: serviceConnection.status !== "READY"
      || !serviceConnection.formalWritesAvailable
      || !toolbarFacts.available
      || (explicitSyncController !== undefined && !explicitSyncState.transportReady),
  });
  bootstrapRegistration.updateToolbar(logseq as unknown as BootstrapHost, toolbarIntervention);
}

async function refreshToolbarInterventionFacts(): Promise<void> {
  const client = serviceRuntimeClient;
  const generation = serviceDiscoveryGeneration;
  if (serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable || !client) {
    toolbarFacts = { proposals: [], semanticCommits: [], available: false };
    updateToolbarIntervention();
    return;
  }
  try {
    const [nowWork, proposals, semanticCommits] = await Promise.all([
      client.nowWork(),
      client.listProposals(),
      client.listSemanticCommits(),
    ]);
    if (client !== serviceRuntimeClient || generation !== serviceDiscoveryGeneration) return;
    toolbarFacts = { nowWork, proposals, semanticCommits, available: true };
  } catch (error) {
    if (client !== serviceRuntimeClient || generation !== serviceDiscoveryGeneration) return;
    toolbarFacts = { proposals: [], semanticCommits: [], available: false };
    operationalLogger.log("warn", "query-refresh", "toolbar_intervention_unavailable", {
      result: "formal-connection-risk",
      errorCode: explain(error),
    });
  }
  updateToolbarIntervention();
}

async function openV2PrimaryAnchor(externalId: string): Promise<void> {
  const block = RuntimeShapeAdapter.block(await logseq.Editor.getBlock(externalId, { includeChildren: false }));
  if (!block) throw new Error("主 Anchor 已失联；没有修改对象，请进入 Anchor 修复流程。");
  if (!logseq.Editor.scrollToBlockInPage || block.page === undefined) throw new Error("当前 Logseq 运行时无法安全定位主 Anchor。");
  const page = await resolveLogseqPageReference(block.page, logseq.Editor.getPage?.bind(logseq.Editor));
  if (page.displayName === "无法解析的 Logseq 页面") throw new Error("主 Anchor 所在页面无法解析；没有修改对象。");
  await logseq.Editor.scrollToBlockInPage(page.pageUuid ?? page.pageName ?? page.displayName.replace(" · Journal", ""), externalId);
}

async function updateBlockWithoutExplicitSyncEcho(externalId: string, content: string): Promise<unknown> {
  const cancelSuppression = explicitSyncController?.suppressObservedContentWindow(externalId, checksum(stripLogseqBlockIdentityProperty(content, externalId)));
  try {
    return await logseq.Editor.updateBlock(externalId, content);
  } catch (error) {
    cancelSuppression?.();
    throw error;
  }
}

async function ensurePersistentBlockIdentity(externalId: string): Promise<void> {
  await ensurePersistentBlockIdentityWithoutEcho(logseq.Editor, externalId, explicitSyncController);
}

async function ensurePersistentBlockIdentityForExplicitSync(externalId: string): Promise<boolean> {
  return ensurePersistentBlockIdentityWithoutEcho(logseq.Editor, externalId, explicitSyncController);
}

async function loadV2CandidateSourcePreviews(candidates: readonly { candidateId: string; sourceAnchorId: string; disposition: string; deferredUntil?: string }[]): Promise<Record<string, string>> {
  if (workspace !== "review" || reviewMode !== "candidates") return {};
  const now = Date.now();
  const visible = candidates.filter(({ disposition, deferredUntil }) => disposition === "PENDING" || (disposition === "LATER" && deferredUntil !== undefined && Date.parse(deferredUntil) <= now)).slice(0, 50);
  const entries = await Promise.all(visible.map(async ({ candidateId, sourceAnchorId }) => {
    try {
      const value = await logseq.Editor.getBlock(sourceAnchorId, { includeChildren: false });
      const block = value && typeof value === "object" && !Array.isArray(value) ? value as { uuid?: unknown; content?: unknown } : undefined;
      if (block?.uuid !== sourceAnchorId || typeof block.content !== "string") return [candidateId, "原文暂不可读；请打开来源检查 Anchor。"] as const;
      const content = stripLogseqBlockIdentityProperty(block.content, sourceAnchorId).trim();
      return [candidateId, content ? content.slice(0, 2_000) : "原文为空。"] as const;
    } catch {
      return [candidateId, "原文暂不可读；请打开来源检查 Anchor。"] as const;
    }
  }));
  return Object.fromEntries(entries);
}

function renderDiagnostics(snapshot: Parameters<typeof renderRuntimeDiagnostics>[0]): string {
  const available = serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient);
  return renderRuntimeDiagnostics(snapshot, renderV2PrimaryAnchorRebindPanel(v2RebindPanel, available));
}

async function model(): Promise<UiModel> {
  let v2Proposals: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listProposals"]>> = [];
  let v2Candidates: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listCandidates"]>> = [];
  let v2SemanticCommits: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listSemanticCommits"]>> = [];
  let v2Objects: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listObjects"]>> = [];
  let v2Associations: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listAssociations"]>> = [];
  let v2PrimaryOwnerships: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listPrimaryOwnerships"]>> = [];
  let v2PrimaryAnchors: V2Anchor[] = [];
  let v2ProjectReentryCards: PluginProjectReentryCard[] | undefined;
  let v2MigrationRuns: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listMigrationRuns"]>> = [];
  let v2NowWork: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["nowWork"]>> | undefined;
  let v2ProposalLoadError: string | undefined;
  let v2AuditLoadError: string | undefined;
  let v2RelationLoadError: string | undefined;
  let v2ReentryLoadError: string | undefined;
  let v2MigrationLoadError: string | undefined;
  if (serviceConnection.status === "READY" && serviceRuntimeClient) {
    try {
      [v2Proposals, v2Objects, v2NowWork, v2Candidates] = await Promise.all([
        serviceRuntimeClient.listProposals(),
        serviceRuntimeClient.listObjects(),
        serviceRuntimeClient.nowWork(),
        serviceRuntimeClient.listCandidates(),
      ]);
    } catch (error) {
      v2ProposalLoadError = explain(error);
    }
    try {
      v2SemanticCommits = await serviceRuntimeClient.listSemanticCommits();
    } catch (error) {
      v2AuditLoadError = explain(error);
    }
    try {
      [v2Associations, v2PrimaryOwnerships] = await Promise.all([
        serviceRuntimeClient.listAssociations(),
        serviceRuntimeClient.listPrimaryOwnerships(),
      ]);
    } catch (error) {
      v2RelationLoadError = explain(error);
    }
    try {
      v2PrimaryAnchors = await listAllPrimaryAnchors(serviceRuntimeClient);
    } catch (error) {
      v2ReentryLoadError = explain(error);
    }
    try {
      v2MigrationRuns = await serviceRuntimeClient.listMigrationRuns();
    } catch (error) {
      v2MigrationLoadError = explain(error);
    }
    if (currentGraphKey && v2NowWork && !v2ProposalLoadError && !v2AuditLoadError && !v2ReentryLoadError) {
      await refreshAttentionShadowRuntime({
        graphKey: currentGraphKey,
        objects: v2Objects,
        proposals: v2Proposals,
        commits: v2SemanticCommits,
        anchors: v2PrimaryAnchors,
        activeFocusObjectIds: v2NowWork.focus.map((item) => item.objectId),
      });
    }
    if (v2NowWork && !v2ProposalLoadError && !v2AuditLoadError && !v2RelationLoadError && !v2ReentryLoadError) {
      try {
        v2ProjectReentryCards = projectPluginV2ProjectReentry({
          observedAt: v2NowWork.generatedAt,
          objects: v2Objects,
          ownerships: v2PrimaryOwnerships,
          associations: v2Associations,
          anchors: v2PrimaryAnchors,
          proposals: v2Proposals,
          commits: v2SemanticCommits,
          nowWork: v2NowWork,
        });
      } catch (error) {
        v2ReentryLoadError = explain(error);
      }
    }
    if (!v2ReentryLoadError && v2ProposalLoadError) v2ReentryLoadError = v2ProposalLoadError;
    if (!v2ReentryLoadError && v2AuditLoadError) v2ReentryLoadError = v2AuditLoadError;
    if (!v2ReentryLoadError && v2RelationLoadError) v2ReentryLoadError = v2RelationLoadError;
  }
  const v2CandidateSourcePreviews = await loadV2CandidateSourcePreviews(v2Candidates);
  toolbarFacts = {
    ...(v2NowWork ? { nowWork: v2NowWork } : {}),
    proposals: v2Proposals,
    semanticCommits: v2SemanticCommits,
    available: serviceConnection.status === "READY" && !v2ProposalLoadError && !v2AuditLoadError,
  };
  updateToolbarIntervention();
  return {
    workspace,
    agent: { enabled: false, providerId: "no-agent" },
    now: { goal: "开始行动并处理高价值注意项", items: [], hidden: ["完整历史", "已结束对象", "内部属性", "低价值关联"] },
    objects: [],
    proposals: [],
    commits: [],
    events: [],
    auditProjection: { anchorConflicts: [], undoableCommitIds: [] },
    reentryProjects: [],
    signalsByObject: {},
    proposalImpacts: {},
    ...(message ? { message } : {}),
    ...(latestError ? { error: latestError } : {}),
    ...(actionDialog ? { actionDialog } : {}),
    runtime: {
      pluginVersion: diagnostics.snapshot().plugin_version,
      runtimeStatus: diagnostics.snapshot().runtime_status,
      storeStatus: diagnostics.snapshot().store_status,
      currentGraph: diagnostics.snapshot().current_graph,
    },
    v2ProjectCreationAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2AreaAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2AreaBusy,
    v2Objects,
    v2Associations,
    v2PrimaryOwnerships,
    ...(v2RelationLoadError ? { v2RelationLoadError } : {}),
    v2AssociationAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2AssociationBusy: v2AssociationSubmission.busy,
    v2OwnershipCommitBusy,
    v2BlockConditionBusy,
    v2LifecycleCommitBusy,
    v2ClosureProposalBusy,
    v2LifecycleProposalBusy,
    v2ClosureDraftBusy,
    ...(v2ClosureDraftInput ? { v2ClosureDraftInput } : {}),
    v2LegacyTransferBusy,
    v2ClosureReviewBusy,
    v2Proposals,
    v2Candidates,
    v2CandidateSourcePreviews,
    v2MigrationRuns,
    v2SemanticCommits,
    v2CandidatePanel,
    v2CandidateAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2ProviderAvailable: serviceConnection.status === "READY" && serviceConnection.capabilities.provider && Boolean(serviceRuntimeClient),
    v2ProviderState,
    v2ProviderRevisionBusy,
    ...(v2LowRiskApplyBusyProposalId ? { v2LowRiskApplyBusyProposalId } : {}),
    reviewMode,
    ...(v2NowWork ? { v2NowWork } : {}),
    v2NowWorkTypeFilter,
    v2NowWorkGrouping,
    ...(v2ProjectReentryCards !== undefined ? { v2ProjectReentryCards } : {}),
    ...(v2ReentryLoadError ? { v2ReentryLoadError } : {}),
    ...(v2ProposalLoadError ? { v2ProposalLoadError } : {}),
    ...(v2AuditLoadError ? { v2AuditLoadError } : {}),
    ...(recentActionCommitId ? { recentActionCommitId } : {}),
    ...(originRoute ? { originReturnLabel: originRoute.kind === "BLOCK" ? "返回原 Block" as const : "返回原 Page" as const } : {}),
    ...(v2MigrationLoadError ? { v2MigrationLoadError } : {}),
    ...(pageContext ? { pageContext } : {}),
    ...(serviceLifecycleSession
      ? { v2ManagedRuntimeState: "RUNNING" as const }
      : runtimeEndedByUser
        ? { v2ManagedRuntimeState: "ENDED" as const }
        : {}),
  };

}

async function listAllPrimaryAnchors(client: ServiceRuntimeClient): Promise<V2Anchor[]> {
  const anchors: V2Anchor[] = [];
  const visitedCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.listPrimaryAnchors(cursor, true);
    anchors.push(...page.anchors);
    cursor = page.nextCursor;
    if (cursor && visitedCursors.has(cursor)) throw new Error("PRIMARY_ANCHOR_CURSOR_LOOP");
    if (cursor) visitedCursors.add(cursor);
  } while (cursor);
  return anchors;
}

async function refreshAttentionShadowRuntime(input: {
  graphKey: string;
  objects: Awaited<ReturnType<ServiceRuntimeClient["listObjects"]>>;
  proposals: Awaited<ReturnType<ServiceRuntimeClient["listProposals"]>>;
  commits: Awaited<ReturnType<ServiceRuntimeClient["listSemanticCommits"]>>;
  anchors: V2Anchor[];
  activeFocusObjectIds: string[];
}): Promise<void> {
  try {
    const observedAt = new Date().toISOString();
    const summary = attentionShadowSession.run(
      buildAttentionDetectorSnapshot({
        observedAt,
        graphKey: input.graphKey,
        graphBinding: "MATCH",
        objects: input.objects,
        proposals: input.proposals,
        commits: input.commits,
        anchors: input.anchors,
      }),
    );
    const dynamicNow = summarizeDynamicNowShadow({
      observedAt,
      objects: input.objects,
      activeFocusObjectIds: input.activeFocusObjectIds,
    });
    logChangedAttentionShadowSummary(summary, dynamicNow);
  } catch (error) {
    operationalLogger.log(
      "warn",
      "attention-shadow",
      "attention_shadow_cycle_failed",
      { result: "shadow_unchanged" },
      error,
    );
  }
}

function logChangedAttentionShadowSummary(
  summary: AttentionShadowCycleSummary,
  dynamicNow: DynamicNowShadowRuntimeSummary,
): void {
  const signature = attentionShadowCurrentSignature(summary, dynamicNow);
  if (signature === lastAttentionShadowSummarySignature) return;
  lastAttentionShadowSummarySignature = signature;
  operationalLogger.log("info", "attention-shadow", "attention_shadow_cycle_changed", {
    result: "session_only_no_formal_write",
    signalRawCount: summary.rawCount,
    signalMergedCount: summary.mergedCount,
    signalCooledCount: summary.cooledCount,
    signalActiveCount: summary.activeCount,
    signalInvalidatedCount: summary.invalidatedCurrentCount,
    nowContinueCount: dynamicNow.continueCount,
    nowReviewCount: dynamicNow.reviewCount,
    nowWaitingCount: dynamicNow.waitingCount,
    nowSuggestionCount: dynamicNow.suggestionCount,
    nowSuppressedOpenCount: dynamicNow.suppressedOpenCount,
    nowReviewOverflowCount: dynamicNow.reviewOverflowCount,
    nowWaitingOverflowCount: dynamicNow.waitingOverflowCount,
    focusOverload: dynamicNow.focusOverload,
  });
}

async function refresh(): Promise<void> {
  const root = requireAppRoot();
  if (firstRunMode) {
    root.innerHTML = renderFirstRunWelcome({
      connection: serviceConnection,
      ...(firstRunAction ? { selectedAction: firstRunAction } : {}),
      ...(firstRunDescriptorImport ? { descriptorImport: firstRunDescriptorImport } : {}),
    });
    return;
  }
  if (!featureReady) {
    root.innerHTML = renderDiagnostics(await fullDiagnosticsSnapshot());
    return;
  }
  let primaryHtml: string;
  const focusToken = root.contains(document.activeElement) ? captureUiFocus(document.activeElement as HTMLElement) : undefined;
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
  } else {
    restoreUiFocus(root, focusToken);
  }
}

function enterRestrictedServiceMode(reasonCode: string, restrictedMessage: string): void {
  graphReadBridgeController.stop();
  if (v2RebindPanel.status !== "idle") v2RebindPanel = { status: "idle" };
  if (v2CandidatePanel.status !== "idle") v2CandidatePanel = { status: "idle" };
  if (v2ProviderState.status === "loading") v2ProviderState = { status: "error", message: "Local Service 在分析期间中断；旧请求已取消或结果未知，请重启 Service 后刷新审阅队列。" };
  serviceRuntimeClient = undefined;
  serviceConnection = {
    status: "RESTRICTED",
    reasonCode,
    message: restrictedMessage,
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  };
  diagnostics.setServiceConnection(serviceConnection);
  explicitSyncController?.pause();
  toolbarFacts = { proposals: [], semanticCommits: [], available: false };
  updateToolbarIntervention();
}

function restrictServiceRuntimeAfterTransportFailure(errorCode: string): void {
  if (serviceConnection.status !== "READY") return;
  operationalLogger.log("warn", "logseq-adapter", "graph_read_bridge_transport_failed", { result: "restricted", errorCode });
  enterRestrictedServiceMode(errorCode, "Local Service 连接已中断；正式写入暂停。重启 Service 并重新加载插件后可继续。");
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  featureReady = false;
  message = "Local Service 连接已中断；正式写入已暂停，Graph 正文和 SQLite 历史未受影响。";
  if (logseq.isMainUIVisible) void refresh();
}

async function fullDiagnosticsSnapshot() {
  const base = diagnostics.snapshot();
  let pendingSemanticCommits: number | "unavailable" = "unavailable";
  let recoveryRequiredCommits: number | "unavailable" = "unavailable";
  let sourceAnchorConflicts: number | "unavailable" = "unavailable";
  if (serviceConnection.status === "READY" && serviceRuntimeClient) {
    try {
      const commits = await serviceRuntimeClient.listSemanticCommits();
      pendingSemanticCommits = commits.filter((commit) => commit.status === "PENDING").length;
      recoveryRequiredCommits = commits.filter((commit) => commit.status === "RECOVERY_REQUIRED").length;
      let cursor: string | undefined;
      let conflicts = 0;
      const visitedCursors = new Set<string>();
      do {
        const page = await serviceRuntimeClient.listPrimaryAnchors(cursor, true);
        conflicts += page.anchors.filter((anchor) => anchor.status === "missing" || anchor.status === "conflict").length;
        cursor = page.nextCursor;
        if (cursor && visitedCursors.has(cursor)) throw new Error("V2_DIAGNOSTICS_ANCHOR_CURSOR_LOOP");
        if (cursor) visitedCursors.add(cursor);
      } while (cursor);
      sourceAnchorConflicts = conflicts;
    } catch (error) {
      operationalLogger.log("warn", "query-refresh", "v2_diagnostics_facts_unavailable", { result: "unavailable", errorCode: explain(error) });
    }
  }
  return {
    ...base,
    plugin_commit: PLUGIN_COMMIT,
    persistence_backend: explicitSyncController
      ? "V2 SQLite via Local Service; V1 FileStorage inactive"
      : base.store_status === "NOT_STARTED" ? "not initialized" : "V2 SQLite via Local Service; connection restricted",
    pending_semantic_commits: pendingSemanticCommits,
    recovery_required_commits: recoveryRequiredCommits,
    source_anchor_conflicts: sourceAnchorConflicts,
    event_listener_status: { rootClick: uiBound, settings: featureReady, explicitSync: explicitSyncController !== undefined, graphReadBridge: graphReadBridgeController.isActive(), unhandledRejection: true, globalError: true },
    explicit_sync: explicitSyncState,
    recent_logs: operationalLogger.snapshot(),
    recent_action_failure: operationalLogger.latestError(),
  };
}

async function refreshServiceRuntime(descriptorPath: unknown): Promise<void> {
  const generation = ++serviceDiscoveryGeneration;
  enterRestrictedServiceMode("SERVICE_DISCOVERY_IN_PROGRESS", "Local Service 正在重新发现；正式写入暂停。");
  const configuredDescriptor = typeof descriptorPath === "string" ? descriptorPath : undefined;
  configuredServiceDescriptorPath = configuredDescriptor;
  const descriptorReader = createElectronDescriptorReader()
    ?? createLogseqPrivateStorageDescriptorReader(logseq.FileStorage);
  const runtime = await discoverServiceRuntime(configuredDescriptor, descriptorReader, undefined, {
    ...(currentGraphKey ? { graphKey: currentGraphKey } : {}),
    clientInstanceId: pluginInstanceId,
  });
  if (generation !== serviceDiscoveryGeneration) {
    await runtime.lifecycle?.release().catch(() => undefined);
    return;
  }
  await replaceServiceLifecycleSession(runtime.lifecycle);
  serviceConnection = runtime.connection;
  serviceRuntimeClient = runtime.client;
  diagnostics.setServiceConnection(runtime.connection);
  if (runtime.connection.status === "READY" && runtime.connection.capabilities.graphReadBridge === true && runtime.client?.claimGraphReadRequest && runtime.client.completeGraphReadRequest) {
    graphReadBridgeController.start({
      claimGraphReadRequest: () => runtime.client!.claimGraphReadRequest!(),
      completeGraphReadRequest: (result) => runtime.client!.completeGraphReadRequest!(result),
    });
  }
  if (explicitSyncController) {
    if (runtime.client && runtime.connection.formalWritesAvailable) {
      await explicitSyncController.resume(runtime.client);
    } else {
      explicitSyncController.pause();
    }
  }
}

function stopServiceLifecycleHeartbeat(): void {
  if (serviceLifecycleHeartbeatTimer !== undefined) {
    globalThis.clearInterval(serviceLifecycleHeartbeatTimer);
    serviceLifecycleHeartbeatTimer = undefined;
  }
  serviceLifecycleHeartbeatBusy = false;
}

async function releaseServiceLifecycleSession(): Promise<void> {
  stopServiceLifecycleHeartbeat();
  const session = serviceLifecycleSession;
  serviceLifecycleSession = undefined;
  if (!session) return;
  await session.release().catch((error: unknown) => {
    operationalLogger.log("warn", "plugin-lifecycle", "launcher_lease_release_failed", {
      result: "lease_expiry_required",
      errorCode: error instanceof StructuredError ? error.code : "LAUNCHER_RELEASE_FAILED",
    });
  });
}

async function replaceServiceLifecycleSession(next: ServiceLifecycleSession | undefined): Promise<void> {
  stopServiceLifecycleHeartbeat();
  const previous = serviceLifecycleSession;
  serviceLifecycleSession = next;
  if (next) runtimeEndedByUser = false;
  if (previous && previous !== next) {
    await previous.release().catch((error: unknown) => {
      operationalLogger.log("warn", "plugin-lifecycle", "previous_launcher_lease_release_failed", {
        result: "lease_expiry_required",
        errorCode: error instanceof StructuredError ? error.code : "LAUNCHER_RELEASE_FAILED",
      });
    });
  }
  if (!next) return;
  serviceLifecycleHeartbeatTimer = globalThis.setInterval(() => {
    if (serviceLifecycleHeartbeatBusy || serviceLifecycleSession !== next) return;
    serviceLifecycleHeartbeatBusy = true;
    void next.heartbeat()
      .catch((error: unknown) => {
        if (serviceLifecycleSession !== next) return;
        stopServiceLifecycleHeartbeat();
        const errorCode = error instanceof StructuredError ? error.code : "LAUNCHER_HEARTBEAT_FAILED";
        operationalLogger.log("warn", "plugin-lifecycle", "launcher_lease_heartbeat_failed", {
          result: "rediscovering",
          errorCode,
        });
        enterRestrictedServiceMode(errorCode, "本地运行环境正在自动恢复；Graph 正文仍可正常编辑。");
        diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
        featureReady = false;
        message = "Task Copilot 本地运行环境连接中断，正在自动恢复；正式写入暂时暂停。";
        const descriptorPath = configuredServiceDescriptorPath;
        void refreshServiceRuntime(descriptorPath)
          .then(async () => {
            featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
            diagnostics.setStoreStatus(featureReady ? "READY" : "READ_ONLY_SAFE_MODE");
            await refreshToolbarInterventionFacts();
            if (logseq.isMainUIVisible) await refresh();
          })
          .catch((recoveryError: unknown) => operationalLogger.log("error", "plugin-lifecycle", "launcher_automatic_rediscovery_failed", {
            result: "restricted",
            errorCode: recoveryError instanceof StructuredError ? recoveryError.code : "LAUNCHER_REDISCOVERY_FAILED",
          }));
      })
      .finally(() => {
        serviceLifecycleHeartbeatBusy = false;
      });
  }, 2_000);
}

function initializeExplicitSync(): void {
  explicitSyncController = new ExplicitSyncController({
    reconciliationDelayMs: 5_000,
    readBlock: (externalId) => logseq.Editor.getBlock(externalId),
    ensurePersistentIdentity: ensurePersistentBlockIdentityForExplicitSync,
    onIssue(issue) {
      operationalLogger.log("warn", "plugin-lifecycle", "explicit_sync_issue", {
        result: "deferred",
        errorCode: issue.code,
        ...(issue.externalId ? { blockUuid: issue.externalId } : {}),
      });
    },
    onState(state) {
      explicitSyncState = state;
      updateToolbarIntervention();
    },
  });
  cleanupHooks.push(registerExplicitSyncEvents(logseq as unknown as ExplicitSyncEventHost, explicitSyncController));
  const reconciliationTimer = globalThis.setInterval(() => {
    void explicitSyncController?.reconcileKnownAnchors();
  }, 5 * 60 * 1000);
  cleanupHooks.push(() => globalThis.clearInterval(reconciliationTimer));
  cleanupHooks.push(() => {
    graphReadBridgeController.stop();
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

function dialogSelectedVersion(name: string): number | undefined {
  const value = requireAppRoot().querySelector<HTMLSelectElement>(`[data-field="${name}"]`)?.selectedOptions[0]?.dataset.version;
  if (!value) return undefined;
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

async function run(action: () => Promise<void>, success?: string): Promise<void> {
  latestError = undefined;
  message = undefined;
  recentActionCommitId = undefined;
  try {
    await action();
    if (success) message = success;
  } catch (error) {
    latestError = explain(error);
  }
  await refresh();
}

function openActionDialog(kind: ActionDialogKind, value: string): Promise<void> {
  if (kind === "v2-mini-project-closure-review") v2ClosureDraftInput = undefined;
  actionDialog = { kind, value };
  return refresh();
}

async function handleAction(action: string, value?: string): Promise<void> {
  if (action === "first-run-import-descriptor") {
    if (firstRunDescriptorImportBusy) return;
    firstRunAction = "start";
    const input = requireAppRoot().querySelector<HTMLInputElement>('[data-field="serviceDescriptorFile"]');
    const file = input?.files?.[0];
    if (!file) {
      firstRunDescriptorImport = { status: "error", message: "请选择 Local Service 启动时生成的 descriptor JSON 文件；正式写入仍保持关闭。" };
      await refresh();
      return;
    }
    if (file.size < 2 || file.size > 16_384) {
      firstRunDescriptorImport = { status: "error", message: "所选 descriptor 文件大小不在安全范围内；没有读取或保存。" };
      await refresh();
      return;
    }
    firstRunDescriptorImportBusy = true;
    firstRunDescriptorImport = { status: "loading" };
    await refresh();
    try {
      const rawDescriptor = await file.text();
      const imported = await importServiceDescriptorToPrivateStorage(logseq.FileStorage, rawDescriptor);
      await refreshServiceRuntime(imported.storageKey);
      if (serviceConnection.status !== "READY" || !serviceRuntimeClient) {
        throw new Error(serviceConnection.status === "RESTRICTED"
          ? serviceConnection.message
          : "Local Service 未返回 READY；正式写入仍保持关闭。");
      }
      await activateConnectedFeatureRuntime();
      ignoredDescriptorSettingValue = imported.storageKey;
      logseq.updateSettings({ serviceDescriptorPath: imported.storageKey });
      firstRunMode = false;
      firstRunDescriptorImport = undefined;
      message = "本地 Service 已安全连接；descriptor token 只保存在插件私有存储。";
      markReady("EVENTS_READY");
      markReady("PLUGIN_READY", "V2 Local Service connected through private descriptor import");
      operationalLogger.log("info", "plugin-lifecycle", "service_descriptor_imported", {
        result: "ready",
      });
    } catch (error) {
      firstRunDescriptorImport = {
        status: "error",
        message: `${explain(error)} 正式写入仍保持关闭；可选择新的 descriptor 重试。`,
      };
      operationalLogger.log("error", "plugin-lifecycle", "service_descriptor_import_failed", { result: "restricted" }, error);
    } finally {
      firstRunDescriptorImportBusy = false;
    }
    await refresh();
    return;
  }
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
    workspace = "review";
    reviewMode = "candidates";
    const client = serviceRuntimeClient;
    const generation = serviceDiscoveryGeneration;
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2CandidatePanel = { status: "error", message: "Local Service 未处于可正式写入的 READY 状态；没有扫描或写入。" };
      await refresh();
      return;
    }
    v2CandidatePanel = { status: "loading" };
    await refresh();
    try {
      const targetPage = value ? requirePageContext(value) : undefined;
      if (targetPage) await pageContextController.revalidate(targetPage);
      const preview = await prepareV2ExplicitCandidateDiscovery(
        client,
        () => targetPage
          ? logseq.Editor.getPageBlocksTree(targetPage.pageUuid)
          : logseq.Editor.getCurrentPageBlocksTree(),
        (blockId) => logseq.Editor.getBlock(blockId, { includeChildren: true }),
      );
      if (generation !== serviceDiscoveryGeneration || client !== serviceRuntimeClient) {
        throw new Error("Local Service 已在扫描期间重连；旧候选已作废，没有执行写入。");
      }
      v2CandidatePanel = { status: "ready", preview, serviceGeneration: generation };
    } catch (error) {
      v2CandidatePanel = { status: "error", message: explain(error) };
    }
    await refresh();
    return;
  }
  if (action === "v2-candidate-cancel") {
    if (v2CandidatePanel.status === "ready" && v2CandidatePanel.busy) return;
    v2CandidatePanel = { status: "idle" };
    workspace = "review";
    await refresh();
    return;
  }
  if (action === "v2-candidate-submit") {
    const client = serviceRuntimeClient;
    const currentPanel = v2CandidatePanel;
    if (currentPanel.status === "ready" && currentPanel.busy) return;
    if (currentPanel.status !== "ready") {
      v2CandidatePanel = { status: "error", message: "当前页候选预览已过期或不存在；没有保存 Candidate。" };
      workspace = "review";
      await refresh();
      return;
    }
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2CandidatePanel = { status: "error", message: "Local Service 正在重连或已不可写；旧候选已作废，没有保存 Candidate。" };
      workspace = "review";
      await refresh();
      return;
    }
    if (currentPanel.serviceGeneration !== serviceDiscoveryGeneration) {
      v2CandidatePanel = { status: "error", message: "Local Service 已在扫描后重连；旧候选已作废，没有执行写入。" };
      workspace = "review";
      await refresh();
      return;
    }
    v2CandidatePanel = { ...currentPanel, busy: true };
    workspace = "review";
    await refresh();
    const traceId = `v2-candidate-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    try {
      const result = await persistV2ExplicitCandidateDiscovery(client, currentPanel.preview, (blockId) => logseq.Editor.getBlock(blockId), traceId);
      v2CandidatePanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "success", message: `${result.candidates.length} 个 Candidate 已保存（${result.replayed} 个为幂等重放）；没有创建正式对象。` }
        : { status: "error", message: "Local Service 在提交期间重连；旧会话已返回成功，请先在 Audit/Doctor 核对，不要立即重试。" };
      operationalLogger.log("info", "ui-action", "v2_candidates_persisted", { correlationId: traceId, actionId: "v2-candidate-submit", result: `success:${result.candidates.length}:replayed:${result.replayed}` });
    } catch (error) {
      v2CandidatePanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "error", message: explain(error) }
        : { status: "error", message: "Local Service 在提交期间重连；旧会话结果不确定，请先在 Audit/Doctor 核对，不要立即重试。" };
      operationalLogger.log("error", "ui-action", "v2_candidate_persistence_failed", { correlationId: traceId, actionId: "v2-candidate-submit", result: "error" }, error);
    }
    await refresh();
    return;
  }
  if ((action === "v2-candidate-later" || action === "v2-candidate-dismiss" || action === "v2-candidate-no-more") && value) {
    const [candidateId, expectedUpdatedAt] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client || !candidateId || !expectedUpdatedAt) throw new Error("Candidate 审阅上下文已失效；没有保存决定。");
      const traceId = `v2-candidate-disposition-${Date.now()}-${globalThis.crypto.randomUUID()}`;
      const disposition = action === "v2-candidate-later" ? "LATER" : action === "v2-candidate-dismiss" ? "DISMISSED" : "NO_MORE_LIKE_THIS";
      const reason = action === "v2-candidate-later" ? "用户选择稍后复查" : action === "v2-candidate-dismiss" ? "用户选择保持普通内容" : "用户选择以后不再对该来源提出此类建议";
      await client.setCandidateDisposition(candidateId, {
        disposition,
        reason,
        ...(disposition === "LATER" ? { deferredUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString() } : {}),
        expectedUpdatedAt,
        traceId,
      });
      workspace = "review";
      reviewMode = "candidates";
    }, action === "v2-candidate-later" ? "Candidate 已安排 7 天后复查。" : action === "v2-candidate-dismiss" ? "Candidate 已保留为普通内容；没有正式写入。" : "偏好已保存；该来源的同类建议不会因普通编辑再次出现。");
    return;
  }
  if (action === "v2-candidate-update" && value) return openActionDialog("v2-candidate-update", value);
  if (action === "submit-v2-candidate-update" && value) {
    const targetObjectId = dialogField("v2CandidateUpdateTarget");
    const afterContent = dialogField("v2CandidateUpdateContent");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client || !targetObjectId || !afterContent) throw new Error("请选择目标对象并填写完整最终正文；没有生成 Proposal。");
      const candidate = (await client.listCandidates()).find(({ candidateId }) => candidateId === value);
      if (!candidate) throw new Error("Candidate 已变化或不存在；没有生成 Proposal。");
      const result = await updateExistingObjectFromV2Candidate(client, candidate, targetObjectId, afterContent, (blockId) => logseq.Editor.getBlock(blockId, { includeChildren: false }), `v2-candidate-update-${Date.now()}-${globalThis.crypto.randomUUID()}`);
      actionDialog = undefined;
      workspace = "review";
      reviewMode = "proposals";
      message = `更新 Proposal ${result.record.proposal.proposalId} 已进入审阅队列；来源和目标正式对象尚未变化。`;
    });
    return;
  }
  if (action === "v2-candidate-formalize" && value) {
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client) throw new Error("Local Service 未就绪；没有生成 Proposal。");
      const candidate = (await client.listCandidates()).find(({ candidateId }) => candidateId === value);
      if (!candidate) throw new Error("Candidate 已变化或不存在；没有生成 Proposal。");
      const result = await formalizeV2Candidate(client, candidate, (blockId) => logseq.Editor.getBlock(blockId, { includeChildren: false }), `v2-candidate-formalize-${Date.now()}-${globalThis.crypto.randomUUID()}`, ensurePersistentBlockIdentity);
      workspace = "review";
      reviewMode = "proposals";
      message = `Proposal ${result.record.proposal.proposalId} 已进入审阅队列；正式对象尚未创建。`;
    });
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
      const result = await submitV2PrimaryAnchorRebind(client, currentPanel.preview, previousAnchorId, confirmed, () => logseq.Editor.getCurrentBlock(), ensurePersistentBlockIdentity, traceId);
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
  if (action === "recent-change-review") {
    recentActionCommitId = undefined;
    workspace = "review";
    reviewMode = "proposals";
    await refresh();
    return;
  }
  if (action === "view" && value) {
    if (!isWorkspace(value)) throw new Error("未知工作区；没有改变当前页面。");
    recentActionCommitId = undefined;
    workspace = value;
    await refresh();
    return;
  }
  if (action === "v2-provider-analyze-current-block") {
    const targetBlockUuid = v2ProviderTarget.consume();
    workspace = "review";
    reviewMode = "candidates";
    const client = serviceRuntimeClient;
    if (v2ProviderState.status === "loading") return;
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.capabilities.provider) {
      v2ProviderState = { status: "error", message: "Local Service Provider 未启用或正在重连；没有发起模型请求，也没有写入。" };
      await refresh();
      return;
    }
    v2ProviderState = { status: "loading", message: "正在分析当前选中 Block；Logseq 正文仍可编辑。" };
    await refresh();
    const traceId = `v2-provider-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    try {
      const selected = targetBlockUuid
        ? await readSelectedBlockForAnalysis(logseq.Editor, targetBlockUuid)
        : await (async () => {
            const block = RuntimeShapeAdapter.block(await logseq.Editor.getCurrentBlock());
            if (!block) throw new Error("请先选中一个有正文的 Logseq Block；没有调用 Provider。");
            return {
              blockUuid: block.uuid,
              text: stripLogseqBlockIdentityProperty(block.content, block.uuid).trim(),
            };
          })();
      const result = await client.generateProposal(buildSelectedBlockProposalPrompt(selected));
      if (result.generated.kind === "NO_PROPOSAL") {
        v2ProviderState = { status: "success", message: `未创建 Proposal：${result.generated.reason}` };
        operationalLogger.log("info", "proposal", "v2_provider_no_proposal", { correlationId: traceId, actionId: "v2-provider-analyze-current-block", result: "no-proposal", blockUuid: selected.blockUuid });
      } else {
        if (!("record" in result)) throw new Error("Provider 返回缺少审阅记录；没有修改正式状态。");
        reviewMode = "proposals";
        v2ProviderState = { status: "success", message: `Proposal ${result.record.proposal.proposalId} 已进入待审阅；尚未修改正文或正式状态。` };
        operationalLogger.log("info", "proposal", "v2_provider_proposal_ready", { correlationId: traceId, actionId: "v2-provider-analyze-current-block", result: "success", blockUuid: selected.blockUuid, proposalId: result.record.proposal.proposalId });
      }
    } catch (error) {
      v2ProviderState = { status: "error", message: `${explain(error)} 正文和正式 Store 未改变。` };
      operationalLogger.log("error", "proposal", "v2_provider_analysis_failed", { correlationId: traceId, actionId: "v2-provider-analyze-current-block", result: "error" }, error);
    }
    await refresh();
    return;
  }
  if (action === "v2-provider-revise-open" && value) {
    return openActionDialog("v2-provider-revise", value);
  }
  if (action === "submit-v2-provider-revise" && value) {
    if (v2ProviderRevisionBusy) return;
    const client = serviceRuntimeClient;
    const [proposalId, expectedUpdatedAt] = value.split("|");
    const instruction = dialogField("v2ProviderRevisionInstruction").trim();
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.capabilities.provider || !proposalId || !expectedUpdatedAt) {
      latestError = "Local Service Provider 未启用或正在重连；没有调用 Agent，也没有修改 Proposal。";
      await refresh();
      return;
    }
    if (!instruction || instruction.length > 2_000) {
      latestError = "请用不超过 2000 字的一句话说明调整要求；没有调用 Agent。";
      await refresh();
      return;
    }
    const generation = serviceDiscoveryGeneration;
    const traceId = `v2-provider-revise-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    try {
      const current = await client.getProposal(proposalId);
      if (!current || current.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请关闭对话框并从最新卡片重新调整。");
      const group = current.proposal.groups.length === 1 ? current.proposal.groups[0] : undefined;
      const patch = group?.textPatches.length === 1 ? group.textPatches[0] : undefined;
      if (!patch) throw new Error("当前 Proposal 不是可调整的单 Block 正式化建议。");
      const block = RuntimeShapeAdapter.block(await logseq.Editor.getBlock(patch.blockUuid, { includeChildren: false }));
      if (!block || block.uuid !== patch.blockUuid) throw new Error("原 Block 已不可读；没有修改 Proposal。");
      const text = stripLogseqBlockIdentityProperty(block.content, block.uuid).trim();
      const prompt = buildSelectedBlockProposalRevisionPrompt({ blockUuid: block.uuid, text }, current.proposal, instruction);
      v2ProviderRevisionBusy = true;
      latestError = undefined;
      message = undefined;
      await refresh();
      const result = await client.reviseGeneratedProposal(proposalId, expectedUpdatedAt, prompt);
      if (generation !== serviceDiscoveryGeneration) throw new Error("Local Service 在 Agent 调整期间重连；请刷新审阅队列核对结果。");
      actionDialog = undefined;
      workspace = "review";
      reviewMode = "proposals";
      message = `Proposal ${result.record.proposal.proposalId} 已原位调整并重置审阅；正文和正式状态均未改变。`;
      operationalLogger.log("info", "proposal", "v2_provider_proposal_revised", { correlationId: traceId, actionId: "submit-v2-provider-revise", result: "success", proposalId });
    } catch (error) {
      latestError = `${explain(error)} 正文和正式 Store 未改变。`;
      operationalLogger.log("error", "proposal", "v2_provider_proposal_revision_failed", { correlationId: traceId, actionId: "submit-v2-provider-revise", result: "error", proposalId }, error);
    } finally {
      v2ProviderRevisionBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "review-mode" && (value === "candidates" || value === "proposals")) {
    workspace = "review";
    reviewMode = value;
    await refresh();
    return;
  }
  if (action === "v2-now-filter" && value && ["ALL", "AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"].includes(value)) {
    workspace = "now";
    v2NowWorkTypeFilter = value as V2NowWorkTypeFilter;
    await refresh();
    return;
  }
  if (action === "v2-now-grouping" && (value === "mixed" || value === "type")) {
    workspace = "now";
    v2NowWorkGrouping = value;
    await refresh();
    return;
  }
  if (action === "close") {
    recentActionCommitId = undefined;
    await returnToBusinessOrigin();
    return;
  }
  if (action === "v2-page-context-back" && value) {
    const current = requirePageContext(value);
    pageContext = await pageContextController.open(current.pageUuid);
    actionDialog = { kind: "v2-page-context", value: pageContext.pageUuid };
    await refresh();
    return;
  }
  if (action === "v2-page-formal-items-open" && value) {
    const current = requirePageContext(value);
    pageContext = await pageContextController.open(current.pageUuid);
    actionDialog = { kind: "v2-page-formal-items", value: pageContext.pageUuid };
    await refresh();
    return;
  }
  if (action === "v2-page-organize" && value) {
    const current = requirePageContext(value);
    await pageContextController.revalidate(current);
    actionDialog = undefined;
    await handleAction("v2-candidate-open", current.pageUuid);
    return;
  }
  if (action === "v2-page-project-create-route" && value) {
    const current = requirePageContext(value);
    await pageContextController.revalidate(current);
    actionDialog = undefined;
    workspace = "objects";
    message = `已打开受控 Project 创建入口。P0 不直接转换“${current.pageName}”；创建成功后会进入新的 Project Page。`;
    await refresh();
    return;
  }
  if (action === "v2-page-project-update" && value) {
    const current = requirePageContext(value);
    pageContext = await pageContextController.open(current.pageUuid);
    const project = pageContext.project;
    if (!project || project.lifecycle !== "OPEN") {
      throw new Error("当前页已不再对应可编辑的 OPEN Project；没有创建 Proposal。");
    }
    actionDialog = { kind: "v2-project-structure-edit", value: `${project.objectId}|${project.objectVersion}` };
    workspace = "objects";
    await refresh();
    return;
  }
  if (action === "v2-page-project-discuss" && value) {
    const current = requirePageContext(value);
    pageContext = await pageContextController.open(current.pageUuid);
    const project = pageContext.project;
    if (!project || project.lifecycle !== "OPEN") {
      throw new Error("当前页已不再对应可讨论的 OPEN Project；没有创建 Proposal。");
    }
    workspace = "review";
    reviewMode = "proposals";
    actionDialog = undefined;
    message = `“${project.objectText}”的结构讨论在 P0 复用 HIGH Proposal 审阅闭环：先用“更新项目当前状态”生成建议，再在这里独立审阅与 Commit。`;
    await refresh();
    return;
  }
  if (action === "v2-page-project-operations" && value) {
    const current = requirePageContext(value);
    pageContext = await pageContextController.open(current.pageUuid);
    const project = pageContext.project;
    if (!project) throw new Error("当前页已不再对应 Project；没有执行项目操作。");
    workspace = "objects";
    actionDialog = undefined;
    message = `已从 ${pageContext.pageName} 打开“${project.objectText}”的正式对象操作；关闭 Task Copilot 后仍回原 Page。`;
    await refresh();
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
  if (action === "runtime-diagnostics") {
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "end-task-copilot-open") {
    if (!serviceLifecycleSession || !serviceRuntimeClient || serviceConnection.status !== "READY") {
      message = "当前连接不是 Launcher 管理的运行环境，或已经结束；没有停止任何进程。";
      await refresh();
      return;
    }
    await openActionDialog("confirm-end-task-copilot", "current-graph");
    return;
  }
  if (action === "submit-end-task-copilot") {
    const client = serviceRuntimeClient;
    if (!serviceLifecycleSession || !client || serviceConnection.status !== "READY") {
      actionDialog = undefined;
      message = "本地运行环境已经变化；没有停止任何进程。";
      await refresh();
      return;
    }
    const decision = managedRuntimeEndDecision({
      commits: await client.listSemanticCommits(),
      explicitSync: {
        pending: explicitSyncState.pending,
        reconciliationRequired: explicitSyncState.reconciliationRequired,
      },
    });
    if (!decision.allowed) {
      actionDialog = undefined;
      workspace = "audit";
      message = decision.reason === "UNFINISHED_COMMIT"
        ? `发现 ${decision.count} 项尚未完成或需要恢复的修改；已转到“最近修改与恢复”，本地运行环境没有结束。`
        : `仍有 ${decision.count} 项正文核对或范围核对未完成；已转到恢复视图，本地运行环境没有结束。`;
      await refresh();
      return;
    }
    await releaseServiceLifecycleSession();
    runtimeEndedByUser = true;
    actionDialog = undefined;
    enterRestrictedServiceMode("SERVICE_ENDED_BY_USER", "本次 Task Copilot 已安全结束；Graph 正文仍可正常编辑。");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    featureReady = false;
    message = "本次 Task Copilot 已安全结束；当前 Graph 正文和 SQLite 历史保持不变。";
    await refresh();
    return;
  }
  if (action === "restart-task-copilot") {
    if (!runtimeEndedByUser) {
      message = "当前本地运行环境不需要重新启动。";
      await refresh();
      return;
    }
    await refreshServiceRuntime(configuredServiceDescriptorPath);
    featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
    diagnostics.setStoreStatus(featureReady ? "READY" : "READ_ONLY_SAFE_MODE");
    message = featureReady
      ? "当前 Graph 的 Task Copilot 已重新启动。"
      : "本地运行环境尚未恢复；Graph 正文仍可编辑，请查看系统状态。";
    await refresh();
    return;
  }
  if (action === "v2-open-primary-anchor" && value) {
    await run(async () => openV2PrimaryAnchor(value), "已定位到主正文；Now Work 和正式状态未改变。");
    return;
  }
  if (action === "v2-focus-add" && value) {
    const [objectId, rawVersion] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      const expectedVersion = Number(rawVersion);
      if (!client || !objectId || !Number.isSafeInteger(expectedVersion)) throw new Error("Focus 上下文已失效；没有写入。");
      const current = await client.nowWork();
      await client.selectFocus(objectId, expectedVersion, current.focus.length);
      workspace = "now";
    }, "已加入当前关注；对象正式状态与正文未改变。");
    return;
  }
  if (action === "v2-focus-remove" && value) {
    const [objectId, rawVersion] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      const expectedVersion = Number(rawVersion);
      if (!client || !objectId || !Number.isSafeInteger(expectedVersion)) throw new Error("Focus 上下文已失效；没有写入。");
      await client.removeFocus(objectId, expectedVersion);
      workspace = "now";
    }, "已移出当前关注；对象正式状态与正文未改变。");
    return;
  }
  if ((action === "v2-focus-up" || action === "v2-focus-down") && value) {
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client) throw new Error("V2 Local Service 未就绪；Focus 顺序未改变。");
      const current = await client.nowWork();
      const expectedObjectIds = current.focus.map((item) => item.objectId);
      const index = expectedObjectIds.indexOf(value);
      const target = action === "v2-focus-up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= expectedObjectIds.length) throw new Error("Focus 顺序已变化；请刷新后重试。");
      const objectIds = [...expectedObjectIds];
      [objectIds[index], objectIds[target]] = [objectIds[target]!, objectIds[index]!];
      await client.reorderFocus(expectedObjectIds, objectIds);
      workspace = "now";
    }, "当前关注顺序已保存。");
    return;
  }
  if (action === "v2-condition-open" && value) return openActionDialog("v2-condition", value);
  if (action === "v2-block-condition-intent" && value) {
    const [intent, ...context] = value.split("|");
    if (typeof intent !== "string" || !["WAITING", "BLOCKED", "PAUSED"].includes(intent) || context.length !== 3) {
      throw new Error("状态意图上下文无效；没有保存，原状态未改变。");
    }
    actionDialog = {
      kind: intent === "WAITING" ? "v2-block-condition-waiting"
        : intent === "BLOCKED" ? "v2-block-condition-blocked"
        : "v2-block-condition-paused",
      value: context.join("|"),
    };
    await refresh();
    return;
  }
  if (action === "submit-v2-block-condition" && value) {
    if (v2BlockConditionBusy) return;
    const [objectId, rawVersion, blockUuid] = value.split("|");
    const expectedVersion = Number(rawVersion);
    const dialogKind = actionDialog?.kind;
    if (
      !objectId
      || !blockUuid
      || !Number.isSafeInteger(expectedVersion)
      || !["v2-block-condition-waiting", "v2-block-condition-blocked", "v2-block-condition-paused"].includes(dialogKind ?? "")
    ) {
      throw new Error("状态表单上下文无效；没有保存，原状态未改变。");
    }
    const draft: BlockConditionDraft = dialogKind === "v2-block-condition-waiting"
      ? {
        intent: "WAITING",
        summary: dialogField("v2BlockWaitingSummary"),
        reviewAt: dialogField("v2BlockConditionReviewAt"),
      }
      : dialogKind === "v2-block-condition-blocked"
        ? {
          intent: "BLOCKED",
          reason: dialogField("v2BlockConditionReason"),
          ...(dialogField("v2BlockerObjectId") ? { blockerObjectId: dialogField("v2BlockerObjectId") } : {}),
        }
        : {
          intent: "PAUSED",
          reason: dialogField("v2BlockConditionReason"),
          reviewAt: dialogField("v2BlockConditionReviewAt"),
        };
    v2BlockConditionBusy = true;
    await refresh();
    try {
      const result = await blockConditionController.apply({ blockUuid, objectId, expectedVersion, draft });
      message = result.message;
      latestError = undefined;
      actionDialog = undefined;
      operationalLogger.log("info", "ui-action", "block_condition_changed", {
        actionId: "submit-v2-block-condition",
        result: result.status,
        blockUuid: result.blockUuid,
        objectId: result.objectId,
      });
      await showBlockContextMessage(result.message, "success");
      await returnToBusinessOrigin();
    } catch (error) {
      latestError = explain(error);
      operationalLogger.log("error", "ui-action", "block_condition_change_failed", {
        actionId: "submit-v2-block-condition",
        result: "error",
        blockUuid,
        objectId,
      }, error);
    } finally {
      v2BlockConditionBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "v2-deadline-open" && value) return openActionDialog("v2-deadline", value);
  if (action === "submit-v2-condition" && value) {
    const [objectId, rawVersion] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      const expectedVersion = Number(rawVersion);
      const kind = dialogField("v2ConditionKind") as V2Condition["kind"];
      const reviewRaw = dialogField("v2ConditionReviewAt");
      const reviewAt = reviewRaw ? new Date(reviewRaw) : undefined;
      if (!client || !objectId || !Number.isSafeInteger(expectedVersion) || !["ACTIONABLE", "WAITING", "BLOCKED", "PAUSED"].includes(kind)) throw new Error("Condition 上下文已失效；没有写入。");
      if (reviewAt && !Number.isFinite(reviewAt.getTime())) throw new Error("请填写合法复查时间。");
      const condition: V2Condition = kind === "ACTIONABLE" ? { kind }
        : kind === "WAITING" ? { kind, waitingFor: dialogField("v2WaitingFor"), expectedResult: dialogField("v2ExpectedResult"), reviewAt: reviewAt?.toISOString() ?? "" }
        : kind === "BLOCKED" ? { kind, reason: dialogField("v2ConditionReason"), ...(dialogField("v2BlockerObjectId") ? { blockerObjectId: dialogField("v2BlockerObjectId") } : {}) }
        : { kind, reason: dialogField("v2ConditionReason"), ...(reviewAt ? { reviewAt: reviewAt.toISOString() } : {}) };
      await client.changeCondition(objectId, expectedVersion, condition);
      actionDialog = undefined;
      workspace = "now";
    }, "状态已正式保存；Now Work 已按新 Condition 重算。");
    return;
  }
  if (action === "submit-v2-deadline" && value) {
    const [objectId, rawVersion] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      const expectedVersion = Number(rawVersion);
      const clear = dialogChecked("v2ClearDueAt");
      const rawDueAt = dialogField("v2DueAt");
      const dueAt = rawDueAt ? new Date(rawDueAt) : undefined;
      if (!client || !objectId || !Number.isSafeInteger(expectedVersion)) throw new Error("期限上下文已失效；没有写入。");
      if (!clear && (!dueAt || !Number.isFinite(dueAt.getTime()))) throw new Error("请填写合法期限，或选择清除现有期限。");
      await client.changeDeadline(objectId, expectedVersion, clear ? undefined : dueAt!.toISOString());
      actionDialog = undefined;
      workspace = "now";
    }, "期限已正式保存；Now Work 已按明确时间重算，未产生分数。");
    return;
  }
  if (action === "v2-mini-project-closure-propose" && value) {
    if (v2ClosureProposalBusy) return;
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    v2ClosureProposalBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable || !objectId || !Number.isSafeInteger(expectedVersion)) throw new Error("MiniProject Closure 上下文已失效；没有创建 Proposal。");
        const result = await client.createMiniProjectClosureProposal(objectId, { expectedVersion });
        workspace = "review";
        reviewMode = "proposals";
        message = result.replayed ? "已打开该 MiniProject 现有的 Closure Proposal；正式对象和正文均未改变。" : "Closure Proposal 已创建；请填写三问并独立审阅，正式对象和正文均未改变。";
      });
    } finally {
      v2ClosureProposalBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "v2-lifecycle-propose-open" && value) return openActionDialog("v2-lifecycle-reason", value);
  if (action === "submit-v2-lifecycle-proposal" && value) {
    if (v2LifecycleProposalBusy) return;
    const [objectId, rawVersion, rawAction] = value.split("|");
    const expectedVersion = Number(rawVersion);
    const lifecycleAction = rawAction === "CANCEL" || rawAction === "REOPEN" ? rawAction : undefined;
    const reason = dialogField("v2LifecycleReason");
    v2LifecycleProposalBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client || !objectId || !Number.isSafeInteger(expectedVersion) || !lifecycleAction || !reason.trim()) throw new Error("请填写取消或重开原因；没有创建 Proposal。");
        const result = await client.createLifecycleProposal(objectId, { expectedVersion, action: lifecycleAction, reason });
        actionDialog = undefined;
        workspace = "review";
        reviewMode = "proposals";
        message = result.replayed ? "已打开现有 Lifecycle Proposal；正式状态未改变。" : "Lifecycle Proposal 已创建；原因将在审阅后随正式 Commit 保留，当前状态未改变。";
      });
    } finally {
      v2LifecycleProposalBusy = false;
      await refresh();
    }
    return;
  }
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
      message = `${result.pageName} 已创建并验证；Project 正式状态已写入 SQLite，可重试且不会重复。`;
      pageContext = undefined;
      originRoute = undefined;
      actionDialog = undefined;
      logseq.App.pushState("page", { name: result.pageName });
      logseq.hideMainUI();
    });
    return;
  }
  if (action === "create-v2-area") {
    if (v2AreaBusy) return;
    const text = dialogField("v2AreaText");
    v2AreaBusy = true;
    try {
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) throw new Error("V2 Local Service 未就绪；Area 没有创建。");
        if (!text) throw new Error("Area 责任描述不能为空。");
        const result = await client.createArea({ text, traceId: `area-create-ui-${Date.now()}` });
        workspace = "objects";
        message = result.replayed ? `已打开现有 Area ${result.object.objectId}。` : `Area ${result.object.objectId} 已写入 SQLite；未创建 Graph 副本。`;
      });
    } finally {
      v2AreaBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "v2-area-edit-open" && value) return openActionDialog("v2-area-edit", value);
  if (action === "v2-project-structure-open" && value) return openActionDialog("v2-project-structure-edit", value);
  if (action === "submit-v2-project-structure" && value) {
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!dialogChecked("actionConfirmed")) throw new Error("请先确认完整的 Project 当前接口。");
      if (!client || !objectId || !Number.isSafeInteger(expectedVersion)) throw new Error("Project 当前接口上下文已失效；没有创建 Proposal。");
      const current = (await client.listObjects()).find((object) => object.objectId === objectId);
      if (!current || current.objectType !== "PROJECT" || current.lifecycle !== "OPEN" || current.version !== expectedVersion || !current.projectStructure) { actionDialog = undefined; throw new Error("Project 已变化、关闭或不存在；请刷新后重新编辑。"); }
      const lines = (name: string) => dialogField(name).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const parts = (line: string, expected: number, label: string) => {
        const values = line.split("｜").map((item) => item.trim());
        if (values.length !== expected || values.some((item) => !item)) throw new Error(`${label} 每行必须包含 ${expected} 个非空字段，并使用全角 ｜ 分隔。`);
        return values;
      };
      const stamp = Date.now();
      const objectiveLines = lines("v2ProjectObjectives");
      const deliverableLines = lines("v2ProjectDeliverables");
      const stageLines = lines("v2ProjectStages");
      const objectives = objectiveLines.map((line, index) => {
        const [priority, text, evidence] = parts(line, 3, "Objective") as [string, string, string];
        if (priority !== "PRIMARY" && priority !== "SECONDARY") throw new Error("Objective 优先级必须是 PRIMARY 或 SECONDARY。");
        const existing = current.projectStructure!.objectives.find((item) => item.text === text) ?? current.projectStructure!.objectives[index];
        return { objectiveId: existing?.objectiveId ?? `objective-ui-${stamp}-${index + 1}`, text, priority: priority as "PRIMARY" | "SECONDARY", successEvidence: evidence.split("；").map((item) => item.trim()).filter(Boolean) };
      });
      const deliverables = deliverableLines.map((line, index) => {
        const [status, text, acceptance] = parts(line, 3, "Deliverable") as [string, string, string];
        if (!["PLANNED", "AVAILABLE", "ACCEPTED", "SUPERSEDED"].includes(status)) throw new Error("Deliverable 状态必须是 PLANNED、AVAILABLE、ACCEPTED 或 SUPERSEDED。");
        const existing = current.projectStructure!.deliverables.find((item) => item.text === text) ?? current.projectStructure!.deliverables[index];
        return { deliverableId: existing?.deliverableId ?? `deliverable-ui-${stamp}-${index + 1}`, text, acceptance, status: status as "PLANNED" | "AVAILABLE" | "ACCEPTED" | "SUPERSEDED" };
      });
      const workStages = stageLines.map((line, index) => {
        const [name, statusDescription] = parts(line, 2, "Work Stage") as [string, string];
        const existing = current.projectStructure!.workStages.find((item) => item.name === name) ?? current.projectStructure!.workStages[index];
        return { stageId: existing?.stageId ?? `stage-ui-${stamp}-${index + 1}`, name, statusDescription };
      });
      const stageIds = new Set(workStages.map(({ stageId }) => stageId));
      const ownedChildren = (await client.listPrimaryOwnerships()).filter((ownership) => ownership.ownerObjectId === objectId).map(({ childObjectId }) => childObjectId);
      const stageMappings = ownedChildren.map((childObjectId) => ({ objectId: childObjectId, stageId: dialogField(`v2ProjectStageMapping:${childObjectId}`) })).filter((mapping) => mapping.stageId && stageIds.has(mapping.stageId));
      const structure: V2ProjectStructure = { objectives, deliverables, workStages, currentSummary: dialogField("v2ProjectCurrentSummary"), currentFocuses: lines("v2ProjectCurrentFocuses"), stageMappings };
      const createdAt = new Date().toISOString();
      const proposal: V2Proposal = { proposalId: `project-interface-${checksum(`${objectId}:${expectedVersion}:${stamp}`)}`, schemaVersion: "v2", title: `更新 ${current.text} 当前接口`, context: "用户在 Project 工作区编辑了一屏当前接口。", understanding: "Objectives、Deliverables、Work Stages 与当前推进作为一个版本化聚合一起审阅。", objective: "保持 Project 可重入并明确当前推进。", logic: "只生成一个 HIGH UPDATE_PROJECT_INTERFACE；不修改 Graph、归属或位置。", finalPreview: `${structure.currentSummary}\n当前推进：${structure.currentFocuses.join("；")}`, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "OBJECT", id: objectId, version: expectedVersion }] }, preconditions: ["Project 仍为 OPEN 且版本未变化"], groups: [{ groupId: "update-project-interface", explanation: "一屏当前接口共同表达 Project 当前事实，不拆成平行写入。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "update-project-interface", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: objectId, version: expectedVersion }, summary: "更新 Project 当前接口", payload: { previousProjectStructure: current.projectStructure, projectStructure: structure }, preconditions: ["Object version unchanged"] }], disposition: "PENDING" }], status: "READY", createdAt };
      await client.submitProposal(proposal);
      actionDialog = undefined;
      workspace = "review";
      reviewMode = "proposals";
      message = "Project 当前接口 Proposal 已创建；正式状态仍未改变，请独立接受 HIGH 语义组并最终 Commit。";
    });
    return;
  }
  if (action === "submit-v2-area-edit" && value) {
    if (v2AreaBusy) return;
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    const text = dialogField("v2AreaEditText");
    v2AreaBusy = true;
    try {
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) throw new Error("V2 Local Service 未就绪；Area 没有修改。");
        if (!objectId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !text) throw new Error("Area 编辑上下文无效；没有写入。");
        const current = (await client.listObjects()).find((object) => object.objectId === objectId);
        if (!current || current.objectType !== "AREA" || current.version !== expectedVersion || current.lifecycle !== "OPEN") {
          actionDialog = undefined;
          throw new Error("Area 已变化、关闭或不存在；请刷新后重新编辑。");
        }
        let result: Awaited<ReturnType<typeof client.editArea>>;
        try {
          result = await client.editArea(objectId, { text, expectedVersion, traceId: `area-edit-ui-${Date.now()}` });
        } catch (error) {
          if (error instanceof StructuredError && error.details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT") actionDialog = undefined;
          throw error;
        }
        actionDialog = undefined;
        message = result.replayed ? `Area ${objectId} 已是该版本。` : `Area ${objectId} 已更新为 v${result.object.version}；Graph 未改写。`;
      });
    } finally {
      v2AreaBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "v2-association-add") {
    if (v2AssociationSubmission.busy) return;
    const sourceObjectId = dialogField("v2AssociationSource");
    const expectedVersion = dialogSelectedVersion("v2AssociationSource");
    const targetObjectId = dialogField("v2AssociationTarget");
    const confirmed = dialogChecked("v2AssociationConfirmed");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) throw new Error("V2 Local Service 未就绪；Association 未创建。");
      await submitV2Association(v2AssociationSubmission, client, {
        sourceObjectId, targetObjectId, expectedVersion, confirmed, traceId: `v2-association-ui-${Date.now()}`,
      }, async () => refresh());
      workspace = "objects";
    }, "Association 已添加；Primary Ownership、位置、Lifecycle 与 Focus 均未改变。");
    return;
  }
  if (action === "v2-low-risk-apply" && value) {
    if (v2LowRiskApplyBusyProposalId) return;
    const [proposalId, expectedUpdatedAt] = value.split("|");
    if (!proposalId || !expectedUpdatedAt) return;
    v2LowRiskApplyBusyProposalId = proposalId;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) throw new Error("Local Service 未就绪；没有接受或应用 Proposal。");
        const stored = await client.getProposal(proposalId);
        if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请重新检查最新内容。");
        const result = await applyLowRiskV2Proposal(client, {
          getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }),
          getPage: (id) => logseq.Editor.getPage(id),
          updateBlock: updateBlockWithoutExplicitSyncEcho,
          ensurePersistentIdentity: ensurePersistentBlockIdentity,
        }, stored, `v2-low-risk-apply-ui-${Date.now()}`);
        workspace = "review";
        recentActionCommitId = "semanticCommitId" in result ? result.semanticCommitId : undefined;
        if (result.status === "COMPLETED") {
          message = `已接受并应用 LOW 风险变更；对象 ${result.objectId ?? "已创建或更新"} 已正式写入，可在当前卡片撤销。`;
        } else if (result.status === "STALE") {
          message = "应用前检查发现正文或版本已变化；没有写入，请重新检查 Proposal。";
        } else {
          message = "领域写入未完成，正文已安全恢复；Proposal 与恢复记录已保留，没有报告成功。";
        }
      });
    } finally {
      v2LowRiskApplyBusyProposalId = undefined;
      await refresh();
    }
    return;
  }
  if ((action === "v2-review-accept" || action === "v2-review-reject") && value) {
    const [proposalId, groupId, expectedUpdatedAt, risk, reviewKind] = value.split("|");
    if (!proposalId || !groupId || !expectedUpdatedAt) return;
    if (action === "v2-review-accept" && risk === "HIGH") return openActionDialog(reviewKind === "MINI_PROJECT_CLOSURE" ? "v2-mini-project-closure-review" : "confirm-v2-review-accept", value);
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
  if (action === "v2-proposal-commit" && value) return openActionDialog("confirm-v2-commit", value);
  if (action === "v2-project-closure-commit" && value) return openActionDialog("confirm-v2-project-closure", value);
  if (action === "v2-project-structure-commit" && value) return openActionDialog("confirm-v2-project-structure", value);
  if (action === "v2-project-structure-undo" && value) return openActionDialog("confirm-v2-project-structure-undo", value);
  if (action === "v2-mini-project-closure-commit" && value) return openActionDialog("confirm-v2-mini-project-closure", value);
  if (action === "v2-reasoned-lifecycle-commit" && value) return openActionDialog("confirm-v2-reasoned-lifecycle", value);
  if (action === "v2-lifecycle-undo" && value) return openActionDialog("confirm-v2-lifecycle-undo", value);
  if (action === "v2-ownership-commit" && value) return openActionDialog("confirm-v2-ownership", value);
  if (action === "v2-ownership-undo" && value) return openActionDialog("confirm-v2-ownership-undo", value);
  if (action === "submit-v2-ownership-undo" && value) {
    if (v2OwnershipCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认恢复审阅前的 Primary Ownership。"; await refresh(); return; }
    v2OwnershipCommitBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client) throw new Error("Primary Ownership Undo 上下文已失效；没有写入。");
        const result = await client.undoPrimaryOwnership(value, { confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: `v2-ownership-undo-ui-${Date.now()}` });
        actionDialog = undefined;
        workspace = "review";
        recentActionCommitId = result.originalSemanticCommitId;
        message = "Primary Ownership 已恢复到审阅前状态；正文位置、Anchor 与 Association 未改变。";
      });
    } finally {
      v2OwnershipCommitBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-lifecycle-undo" && value) {
    if (v2LifecycleCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认恢复 Lifecycle 变化。"; await refresh(); return; }
    v2LifecycleCommitBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client) throw new Error("Lifecycle Undo 上下文已失效；没有写入。" );
        const result = await client.undoLifecycle(value, { confirmation: "UNDO_LIFECYCLE", traceId: `v2-lifecycle-undo-ui-${Date.now()}` });
        actionDialog = undefined;
        workspace = "review";
        recentActionCommitId = result.originalSemanticCommitId;
        message = "Lifecycle 已恢复到正向 Commit 之前；正文、Anchor、Condition、Focus 与 Ownership 未改变。";
      });
    } finally {
      v2LifecycleCommitBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-ownership" && value) {
    if (v2OwnershipCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认新的 Primary Ownership。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    v2OwnershipCommitBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!proposalId || !expectedUpdatedAt || !client) throw new Error("Primary Ownership 上下文已失效；没有写入。");
        const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
        if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新检查 Primary Ownership。");
        const observations = await collectV2ProposalGraphObservations(stored.proposal, {
          getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }),
          getPage: (id) => logseq.Editor.getPage(id),
        });
        const result = await client.commitPrimaryOwnership(proposalId, { expectedUpdatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations, traceId: `v2-ownership-ui-${Date.now()}` });
        if (result.status === "STALE") {
          message = "Primary Ownership 的对象或上下文版本已变化；Proposal 已标记 STALE，没有改变归属。";
          return;
        }
        if (result.status === "FAILED") {
          actionDialog = undefined;
          workspace = "review";
          recentActionCommitId = result.semanticCommitId;
          message = `Primary Ownership Commit 已安全终止（${result.errorCode}）；没有改变归属。`;
          return;
        }
        actionDialog = undefined;
        workspace = "review";
        recentActionCommitId = result.semanticCommitId;
        message = "Primary Ownership 已通过 Proposal Commit 更新；位置、Anchor 与 Association 未改变。";
      });
    } finally {
      v2OwnershipCommitBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-project-closure" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认 Project Closure 与未完成 Objective 的后续去向。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!proposalId || !expectedUpdatedAt || !client) throw new Error("Project Closure 上下文已失效；没有写入。");
      const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
      if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新检查 Project Closure。");
      const observations = await collectV2ProposalGraphObservations(stored.proposal, {
        getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }),
        getPage: (id) => logseq.Editor.getPage(id),
      });
      const result = await client.commitProjectClosure(proposalId, { expectedUpdatedAt, confirmation: "COMPLETE_PROJECT_WITH_CLOSURE", observations, traceId: `v2-project-closure-ui-${Date.now()}` });
      actionDialog = undefined;
      workspace = "review";
      if (result.status === "COMPLETED") recentActionCommitId = result.semanticCommitId;
      message = result.status === "COMPLETED" ? `Project Closure 已生效；${result.object.text} 已退出活跃视图，Logseq 页面保留。` : "Project 版本已变化；Proposal 已标记 STALE，没有完成对象。";
    });
    return;
  }
  if (action === "submit-v2-project-structure-commit" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认完整的 Project 当前接口。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!proposalId || !expectedUpdatedAt || !client) throw new Error("Project 当前接口上下文已失效；没有写入。");
      const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
      if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新检查 Project 当前接口。");
      const observations = await collectV2ProposalGraphObservations(stored.proposal, { getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }), getPage: (id) => logseq.Editor.getPage(id) });
      const result = await client.commitProjectStructure(proposalId, { expectedUpdatedAt, confirmation: "UPDATE_PROJECT_INTERFACE", observations, traceId: `v2-project-structure-ui-${Date.now()}` });
      actionDialog = undefined;
      workspace = result.status === "COMPLETED" ? "reentry" : "review";
      if (result.status === "COMPLETED") recentActionCommitId = result.semanticCommitId;
      message = result.status === "COMPLETED" ? `Project ${result.object.text} 当前接口已更新为 v${result.object.version}；Graph、位置与归属未改变。` : "Project 版本已变化；Proposal 已标记 STALE，没有更新当前接口。";
    });
    return;
  }
  if (action === "submit-v2-project-structure-undo" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认恢复审阅前的 Project 当前接口。"; await refresh(); return; }
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client) throw new Error("Project 当前接口 Undo 上下文已失效；没有写入。");
      const result = await client.undoProjectStructure(value, { confirmation: "UNDO_PROJECT_INTERFACE", traceId: `v2-project-structure-undo-ui-${Date.now()}` });
      actionDialog = undefined;
      workspace = "reentry";
      recentActionCommitId = result.originalSemanticCommitId;
      message = `Project ${result.object.text} 已恢复审阅前的当前接口；Graph、位置与归属未改变。`;
    });
    return;
  }
  if (action === "submit-v2-mini-project-closure" && value) {
    if (v2LifecycleCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认 MiniProject 关闭请求。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    v2LifecycleCommitBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!proposalId || !expectedUpdatedAt || !client) throw new Error("MiniProject 关闭上下文已失效；没有写入。");
        const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
        if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新检查 MiniProject 关闭。");
        const observations = await collectV2ProposalGraphObservations(stored.proposal, {
          getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }),
          getPage: (id) => logseq.Editor.getPage(id),
        });
        const result = await client.commitLifecycleTransition(proposalId, { expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations, traceId: `v2-mini-project-closure-ui-${Date.now()}` });
        actionDialog = undefined;
        workspace = "review";
        if (result.status === "COMPLETED") recentActionCommitId = result.semanticCommitId;
        message = result.status === "COMPLETED" ? `MiniProject ${result.object.text} 已完成；${result.anchor ? "Marker 移除不会自动重开" : "Logseq 正文未被改写"}。` : "MiniProject 版本或所需 Graph 证据已变化；Proposal 已标记 STALE，没有完成对象。";
      });
    } finally {
      v2LifecycleCommitBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-reasoned-lifecycle" && value) {
    if (v2LifecycleCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认已审阅取消或重开原因。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt, rawAction] = value.split("|");
    const lifecycleAction = rawAction === "CANCEL" || rawAction === "REOPEN" ? rawAction : undefined;
    v2LifecycleCommitBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!proposalId || !expectedUpdatedAt || !lifecycleAction || !client) throw new Error("Lifecycle Commit 上下文已失效；没有写入。");
        const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
        if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新检查原因。");
        const observations = await collectV2ProposalGraphObservations(stored.proposal, { getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }), getPage: (id) => logseq.Editor.getPage(id) });
        const confirmation = lifecycleAction === "CANCEL" ? "CANCEL_OBJECT" : "REOPEN_OBJECT";
        const result = await client.commitLifecycleTransition(proposalId, { expectedUpdatedAt, confirmation, observations, traceId: `v2-reasoned-lifecycle-ui-${Date.now()}` });
        actionDialog = undefined;
        workspace = "review";
        if (result.status === "COMPLETED") recentActionCommitId = result.semanticCommitId;
        message = result.status === "COMPLETED" ? `${lifecycleAction === "CANCEL" ? "取消" : "重开"}已正式生效；原因保留在已应用 Proposal，正文与其他状态轴未改变。` : "对象版本已变化；Proposal 已标记 STALE，没有改变 Lifecycle。";
      });
    } finally {
      v2LifecycleCommitBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-proposal-commit" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认最终 Commit。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!proposalId || !expectedUpdatedAt || !client) throw new Error("V2 Commit 上下文已失效；没有写入。");
      const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
      if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新审阅。");
      const result = await commitV2Formalization(client, {
        getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }), getPage: (id) => logseq.Editor.getPage(id),
        updateBlock: updateBlockWithoutExplicitSyncEcho,
        ensurePersistentIdentity: ensurePersistentBlockIdentity,
      }, stored, `v2-proposal-commit-ui-${Date.now()}`);
      actionDialog = undefined;
      workspace = "review";
      recentActionCommitId = result.semanticCommitId;
      message = result.status === "COMPLETED" ? `最终 Commit 已生效；对象 ${result.objectId} 已写入，可在当前卡片撤销。` : result.status === "STALE" ? "提交前重验失败；没有写入。" : "领域写入失败，正文已安全恢复；未报告成功。";
    });
    return;
  }
  if (action === "v2-proposal-undo" && value) return openActionDialog("confirm-v2-undo", value);
  if (action === "submit-v2-proposal-undo" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认创建逆向 Commit。"; await refresh(); return; }
    actionDialog = undefined;
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client) throw new Error("V2 Undo 上下文已失效；没有写入。");
      const result = await undoV2Formalization(client, {
        getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }), getPage: (id) => logseq.Editor.getPage(id),
        updateBlock: updateBlockWithoutExplicitSyncEcho,
      }, value, `v2-proposal-undo-ui-${Date.now()}`);
      workspace = "review";
      recentActionCommitId = value;
      message = result.status === "COMPLETED" ? "Undo 已作为新的逆向 Commit 生效；正文与当前对象投影均已恢复，历史 Audit 保留。" : "Undo 领域写入失败，正文已恢复为 Commit 后状态；原 Commit 仍有效。";
    });
    return;
  }
  if (action === "submit-v2-review-accept" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请独立确认高影响语义组。"; await refresh(); return; }
    const [proposalId, groupId, expectedUpdatedAt] = value.split("|");
    const miniProjectClosure = actionDialog?.kind === "v2-mini-project-closure-review" ? {
      originalGoal: dialogField("miniClosureOriginalGoal").trim(),
      actualResult: dialogField("miniClosureActualResult").trim(),
      remainingWork: dialogField("miniClosureRemainingWork").trim(),
    } : undefined;
    if (miniProjectClosure && v2ClosureReviewBusy) return;
    const submitReview = async () => run(async () => {
      if (!proposalId || !groupId || !expectedUpdatedAt || !serviceRuntimeClient) throw new Error("V2 审阅上下文已失效；请刷新后重试。");
      if (miniProjectClosure && (!miniProjectClosure.originalGoal || !miniProjectClosure.actualResult || !miniProjectClosure.remainingWork)) throw new Error("请完整填写 MiniProject 原目标、实际结果和遗留三问。");
      await serviceRuntimeClient.reviewProposal(proposalId, { [groupId]: { disposition: "ACCEPTED", highImpactConfirmed: true } }, expectedUpdatedAt, miniProjectClosure);
      if (miniProjectClosure) v2ClosureDraftInput = undefined;
      actionDialog = undefined;
      workspace = "review";
    }, "高影响语义组已接受，但尚未正式生效；最终 Commit 仍需版本重验。");
    if (!miniProjectClosure) await submitReview();
    else {
      v2ClosureReviewBusy = true;
      try { await refresh(); await submitReview(); }
      finally { v2ClosureReviewBusy = false; await refresh(); }
    }
    return;
  }
  if (action === "v2-mini-project-closure-draft" && value) {
    if (v2ClosureDraftBusy) return;
    const [proposalId, groupId, expectedUpdatedAt] = value.split("|");
    v2ClosureDraftInput = {
      originalGoal: dialogField("miniClosureOriginalGoal").trim(),
      actualResult: dialogField("miniClosureActualResult").trim(),
      remainingWork: dialogField("miniClosureRemainingWork").trim(),
    };
    v2ClosureDraftBusy = true;
    latestError = undefined;
    message = undefined;
    try {
      await refresh();
      const client = serviceRuntimeClient;
      if (!client || serviceConnection.status !== "READY" || !serviceConnection.capabilities.provider || !proposalId || !groupId || !expectedUpdatedAt) throw new Error("Agent 草稿上下文已失效；没有修改 Proposal。");
      const result = await client.draftMiniProjectClosure(proposalId, { expectedUpdatedAt, draft: v2ClosureDraftInput });
      actionDialog = { kind: "v2-mini-project-closure-review", value: `${proposalId}|${groupId}|${result.record.updatedAt}|HIGH` };
      v2ClosureDraftInput = undefined;
      workspace = "review";
      reviewMode = "proposals";
      message = "Agent 三问草稿已写入同一 Proposal；请修改并独立确认，正文和正式状态均未改变。";
    } catch (error) {
      latestError = `${explain(error)} 正文和正式 Store 未改变。`;
    } finally {
      v2ClosureDraftBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "v2-mini-project-legacy-transfer" && value) {
    if (v2LegacyTransferBusy) return;
    const [proposalId, , expectedUpdatedAt] = value.split("|");
    v2ClosureDraftInput = {
      originalGoal: dialogField("miniClosureOriginalGoal").trim(),
      actualResult: dialogField("miniClosureActualResult").trim(),
      remainingWork: dialogField("miniClosureRemainingWork").trim(),
    };
    const objectType = dialogField("miniClosureLegacyObjectType") as "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT";
    v2LegacyTransferBusy = true;
    latestError = undefined;
    message = undefined;
    try {
      await refresh();
      const client = serviceRuntimeClient;
      if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable || !proposalId || !expectedUpdatedAt) throw new Error("遗留转移上下文已失效；没有创建 Proposal。");
      const block = RuntimeShapeAdapter.block(await logseq.Editor.getCurrentBlock());
      if (!block) throw new Error("请先在 Logseq 新建并选中一个空 Block。");
      const proposal = buildMiniProjectLegacyTransferProposal({
        closureProposalId: proposalId,
        blockUuid: block.uuid,
        beforeText: stripLogseqBlockIdentityProperty(block.content, block.uuid),
        remainingWork: v2ClosureDraftInput.remainingWork,
        objectType,
        createdAt: expectedUpdatedAt,
      });
      const result = await client.submitProposal(proposal);
      workspace = "review";
      reviewMode = "proposals";
      message = result.replayed
        ? "已打开同一遗留承接 Proposal；MiniProject Closure、正文和正式状态均未改变。"
        : "遗留承接已作为独立 Proposal 进入审阅；它与 MiniProject 关闭分开提交，当前未改正文或创建对象。";
    } catch (error) {
      latestError = `${explain(error)} 正文、Closure Proposal 和正式 Store 未改变。`;
    } finally {
      v2LegacyTransferBusy = false;
      await refresh();
    }
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
  if (action === "cancel-action-dialog") {
    const returnToOrigin = originRoute !== undefined;
    v2ClosureDraftInput = undefined;
    actionDialog = undefined;
    pageContext = undefined;
    if (returnToOrigin) {
      await returnToBusinessOrigin();
      return;
    }
    await refresh();
    return;
  }
  throw new Error(`V2_UI_ACTION_UNSUPPORTED: 未注册操作 ${action}；没有执行写入。`);
}

const onRootClick = createDelegatedActionHandler(handleAction, (error) => {
  const correlationId = `TC-unhandled-${Date.now()}`;
  latestError = `界面操作失败：${explain(error)}。Graph 正文与 SQLite 正式状态保持安全。诊断 ID：${correlationId}`;
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

async function showTaskCopilotFromGeneralEntry(): Promise<void> {
  originRoute = undefined;
  v2ProviderTarget.clear();
  await showTaskCopilot();
}

async function openFromToolbar(): Promise<void> {
  originRoute = undefined;
  v2ProviderTarget.clear();
  if (toolbarIntervention.target === "diagnostics" || !featureReady) {
    await showRuntimeDiagnostics();
    return;
  }
  workspace = toolbarIntervention.target;
  await showTaskCopilot();
}

async function showRuntimeDiagnostics(): Promise<void> {
  logseq.showMainUI({ autoFocus: true });
  requireAppRoot().innerHTML = renderDiagnostics(await fullDiagnosticsSnapshot());
}

async function showRuntimeDiagnosticsFromGeneralEntry(): Promise<void> {
  originRoute = undefined;
  v2ProviderTarget.clear();
  await showRuntimeDiagnostics();
}

async function processCurrentBlockFromCommand(): Promise<void> {
  const block = RuntimeShapeAdapter.block(await logseq.Editor.getCurrentBlock());
  if (!block) throw new Error("请先选中一个有正文的 Logseq Block；没有调用 Provider。");
  originRoute = await originRouteController.captureBlock(block.uuid);
  v2ProviderTarget.bind(block.uuid);
  try {
    await showTaskCopilot();
    await handleAction("v2-provider-analyze-current-block");
  } finally {
    v2ProviderTarget.clear();
  }
}

async function processBlockFromContext(blockUuid: string): Promise<void> {
  originRoute = await originRouteController.captureBlock(blockUuid);
  v2ProviderTarget.bind(blockUuid);
  try {
    await showTaskCopilot();
    await handleAction("v2-provider-analyze-current-block");
  } finally {
    v2ProviderTarget.clear();
  }
}

async function returnToBusinessOrigin(): Promise<void> {
  const token = originRoute;
  originRoute = undefined;
  if (!token) {
    logseq.hideMainUI();
    return;
  }
  const result = await originRouteController.returnTo(token);
  operationalLogger.log(result.status === "RETURNED" ? "info" : "warn", "ui-action", "business_origin_returned", {
    actionId: "return-business-origin",
    result: result.status.toLowerCase(),
  });
  if (result.status === "SOURCE_UNAVAILABLE") {
    await showBlockContextMessage(result.label, "warning");
  }
}

async function insertExplicitObjectSyntax(objectType: SlashCreateObjectType): Promise<void> {
  const syntax = SLASH_CREATE_SYNTAX[objectType];
  let cancelSuppression: (() => void) | undefined;
  try {
    const [current, editingContent, cursor] = await Promise.all([
      logseq.Editor.getCurrentBlock(),
      logseq.Editor.getEditingBlockContent(),
      logseq.Editor.getEditingCursorPosition(),
    ]);
    const block = RuntimeShapeAdapter.block(current);
    if (!block || !cursor) throw new Error("当前编辑 Block 或光标不可用；没有插入对象语法。");
    const intermediateContent = slashCreateContentAfterInsertion(editingContent, cursor.pos, objectType);
    cancelSuppression = explicitSyncController?.suppressObservedContentWindow(
      block.uuid,
      checksum(stripLogseqBlockIdentityProperty(intermediateContent, block.uuid)),
    );
    await insertSlashCreateSyntax(logseq.Editor, objectType);
  } catch (error) {
    cancelSuppression?.();
    operationalLogger.log("error", "ui-action", "slash_explicit_syntax_insert_failed", {
      actionId: "slash-explicit-syntax-insert",
      result: "error",
      command: syntax,
    }, error);
    await showBlockContextMessage(`未能插入 ${syntax}；当前 Block 和正式状态均未改变。`, "error");
  }
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

function requirePageContext(pageUuid: string): PageContextSnapshot {
  if (!pageContext || pageContext.pageUuid !== pageUuid) {
    throw new Error("Page Context 已过期；没有执行操作。请从当前页菜单重新打开。");
  }
  return pageContext;
}

async function showBlockContextMessage(content: string, status: "success" | "warning" | "error"): Promise<void> {
  try {
    await logseq.UI.showMsg(content, status, { timeout: 6500 });
  } catch (error) {
    operationalLogger.log("warn", "ui-action", "block_context_feedback_failed", { result: "feedback-unavailable", errorCode: explain(error) });
  }
}

interface BlockContextActionResult {
  status: string;
  blockUuid: string;
  objectId: string;
  message: string;
}

async function runBlockContextAction(actionId: string, action: () => Promise<BlockContextActionResult>): Promise<void> {
  const correlationId = `TC-block-${Date.now()}`;
  if (!featureReady) {
    diagnostics.setNotice({
      code: "FEATURE_NOT_READY",
      message: "Task Copilot 功能尚未就绪；Block 右键操作未执行。",
      next_step: "请打开 Task Copilot 查看系统状态和失败阶段。",
    });
    operationalLogger.log("warn", "ui-action", "block_context_action_unavailable", { correlationId, actionId, result: "feature-not-ready" });
    await showBlockContextMessage("Task Copilot 尚未就绪；当前关注没有改变。请打开 Task Copilot 查看系统状态。", "warning");
    return;
  }
  try {
    const result = await action();
    message = result.message;
    latestError = undefined;
    operationalLogger.log("info", "ui-action", "block_context_action_completed", {
      correlationId,
      actionId,
      result: result.status,
      blockUuid: result.blockUuid,
      objectId: result.objectId,
    });
    await showBlockContextMessage(result.message, "success");
    void refreshToolbarInterventionFacts();
  } catch (error) {
    const explanation = explain(error);
    latestError = explanation;
    operationalLogger.log("error", "ui-action", "block_context_action_failed", {
      correlationId,
      actionId,
      result: "error",
    }, error);
    await showBlockContextMessage(`${explanation} 原 Block 保持原位。`, "error");
  }
}

async function toggleBlockFocusFromContext(blockUuid: string): Promise<void> {
  await runBlockContextAction("block-focus-toggle", () => blockFocusController.toggle(blockUuid));
}

async function toggleCurrentBlockFocusFromCommand(): Promise<void> {
  const block = RuntimeShapeAdapter.block(await logseq.Editor.getCurrentBlock());
  if (!block) {
    await showBlockContextMessage("请先选中一个已正式化的 Task 或 MiniProject；当前关注没有改变。", "warning");
    return;
  }
  await toggleBlockFocusFromContext(block.uuid);
}

async function undoBlockFocusFromContext(): Promise<void> {
  await runBlockContextAction("block-focus-undo", () => blockFocusController.undoLast());
}

async function openBlockConditionFromContext(blockUuid: string): Promise<void> {
  const correlationId = `TC-block-condition-${Date.now()}`;
  if (!featureReady) {
    diagnostics.setNotice({
      code: "FEATURE_NOT_READY",
      message: "Task Copilot 功能尚未就绪；Block 状态未改变。",
      next_step: "请打开 Task Copilot 查看系统状态和失败阶段。",
    });
    operationalLogger.log("warn", "ui-action", "block_condition_open_unavailable", {
      correlationId,
      actionId: "block-condition-open",
      result: "feature-not-ready",
    });
    await showBlockContextMessage("Task Copilot 尚未就绪；原状态未改变。请打开 Task Copilot 查看系统状态。", "warning");
    return;
  }
  try {
    const capturedOrigin = await originRouteController.captureBlock(blockUuid);
    const prepared = await blockConditionController.prepare(blockUuid);
    originRoute = capturedOrigin;
    actionDialog = {
      kind: "v2-block-condition-route",
      value: `${prepared.objectId}|${prepared.objectVersion}|${prepared.blockUuid}`,
    };
    latestError = undefined;
    operationalLogger.log("info", "ui-action", "block_condition_opened", {
      correlationId,
      actionId: "block-condition-open",
      result: "ready",
      blockUuid,
      objectId: prepared.objectId,
    });
    await showTaskCopilot();
  } catch (error) {
    const explanation = explain(error);
    latestError = explanation;
    operationalLogger.log("error", "ui-action", "block_condition_open_failed", {
      correlationId,
      actionId: "block-condition-open",
      result: "error",
      blockUuid,
    }, error);
    await showBlockContextMessage(`${explanation} 原 Block 保持原位。`, "error");
  }
}

async function undoBlockConditionFromContext(): Promise<void> {
  await runBlockContextAction("block-condition-undo", () => blockConditionController.undoLast());
}

async function openPageContextFromMenu(page: string): Promise<void> {
  await guardedFeatureCommand(async () => {
    pageContext = await pageContextController.open(page);
    originRoute = originRouteController.capturePage(pageContext);
    actionDialog = { kind: "v2-page-context", value: pageContext.pageUuid };
    latestError = undefined;
    operationalLogger.log("info", "ui-action", "page_context_opened", {
      actionId: "page-context-open",
      result: pageContext.kind,
      pageRefShape: "uuid",
      ...(pageContext.project ? { objectId: pageContext.project.objectId } : {}),
    });
    await showTaskCopilot();
  });
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
    open: showTaskCopilotFromGeneralEntry,
    openToolbar: openFromToolbar,
    processCurrentBlock: () => guardedFeatureCommand(processCurrentBlockFromCommand),
    openReview: () => {
      originRoute = undefined;
      return guardedFeatureCommand(() => openWorkspace("review"));
    },
    openNowWork: () => {
      originRoute = undefined;
      return guardedFeatureCommand(() => openWorkspace("now"));
    },
    toggleCurrentBlockFocus: toggleCurrentBlockFocusFromCommand,
    diagnostics: showRuntimeDiagnosticsFromGeneralEntry,
    createTask: () => insertExplicitObjectSyntax("TASK"),
    createMiniProject: () => insertExplicitObjectSyntax("MINI_PROJECT"),
    createDecision: () => insertExplicitObjectSyntax("DECISION"),
    createOutput: () => insertExplicitObjectSyntax("OUTPUT"),
    processBlock: (blockUuid) => guardedFeatureCommand(() => processBlockFromContext(blockUuid)),
    toggleBlockFocus: toggleBlockFocusFromContext,
    undoBlockFocus: undoBlockFocusFromContext,
    openBlockCondition: openBlockConditionFromContext,
    undoBlockCondition: undoBlockConditionFromContext,
    openPageContext: openPageContextFromMenu,
  };

  diagnostics.start("TOOLBAR_REGISTERED");
  bootstrapRegistration.registerToolbar(host);
  markReady("TOOLBAR_REGISTERED", "toolbar registered");

  diagnostics.start("COMMANDS_REGISTERED");
  bootstrapRegistration.registerCommands(host, callbacks);
  bootstrapRegistration.registerBlockContextMenus(host, callbacks);
  bootstrapRegistration.registerPageContextMenu(host, callbacks);
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
    settleRuntimeBridgeCall(logseq.App.getCurrentGraph()).catch(() => null),
    settleRuntimeBridgeCall(logseq.App.getInfo("version")).catch(() => "unavailable"),
  ]);
  const graphShape = graph as { name?: unknown; url?: unknown; path?: unknown } | null;
  const graphLabel = graphShape && typeof graphShape.name === "string" ? graphShape.name : "unavailable";
  const graphIdentity = graphShape && typeof graphShape.path === "string"
    ? graphShape.path
    : graphShape?.url;
  currentGraphKey = typeof graphIdentity === "string"
    ? await deriveLauncherGraphKey(graphIdentity).catch(() => undefined)
    : undefined;
  diagnostics.setEnvironment(graphLabel || "available (identity shape unavailable)", typeof version === "string" ? version : JSON.stringify(version));
}

async function handleCurrentGraphChanged(): Promise<void> {
  originRoute = undefined;
  v2ProviderTarget.clear();
  attentionShadowSession.clear();
  lastAttentionShadowSummarySignature = undefined;
  enterRestrictedServiceMode("GRAPH_SWITCH_IN_PROGRESS", "正在为新的 Graph 重新绑定本地运行环境；正式写入暂停。");
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  featureReady = false;
  runtimeEndedByUser = false;
  await releaseServiceLifecycleSession();
  currentGraphKey = undefined;
  await environmentInfo();
  await refreshServiceRuntime(configuredServiceDescriptorPath);
  featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
  diagnostics.setStoreStatus(featureReady ? "READY" : "READ_ONLY_SAFE_MODE");
  message = featureReady
    ? "已为当前 Graph 重新绑定 Task Copilot；未复用上一 Graph 的数据库会话。"
    : "当前 Graph 尚未配置 Task Copilot 本地数据库；正式写入保持关闭，Graph 正文仍可编辑。";
  await refreshToolbarInterventionFacts();
  if (logseq.isMainUIVisible) await refresh();
}

async function activateConnectedFeatureRuntime(): Promise<void> {
  diagnostics.start("RUNTIME_ADAPTER_READY");
  markReady("RUNTIME_ADAPTER_READY", "V2 Logseq event adapter ready; V1 content commands inactive");

  diagnostics.start("PERSISTENCE_READY");
  diagnostics.setStoreSchema("V2 SQLite owned by Local Service");
  diagnostics.setStoreStatus(serviceConnection.status === "READY" ? "READY" : "READ_ONLY_SAFE_MODE");
  diagnostics.setRecoveryState("V1 FileStorage inactive; V2 consistency is reported by Local Service Doctor and SemanticCommit evidence");
  markReady("PERSISTENCE_READY", "V2 persistence authority remains behind Local Service");

  diagnostics.start("MIGRATION_READY");
  markReady("MIGRATION_READY", "no automatic migration performed");

  diagnostics.start("APPLICATION_READY");
  markReady("APPLICATION_READY", "formal explicit synchronization delegated to V2 Local Service");

  if (serviceRuntimeClient && serviceConnection.formalWritesAvailable) {
    await explicitSyncController!.resume(serviceRuntimeClient);
  }
  featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
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
      title: "V2 本地运行环境 descriptor 私有存储 key",
      description: "仅填写 Launcher 配对 descriptor（推荐）或兼容 Service descriptor 在 Task Copilot 私有 FileStorage 中的文件名；token 不写入设置、Graph 或日志。",
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
  cleanupHooks.push(logseq.App.onCurrentGraphChanged(() => {
    graphSwitchQueue = graphSwitchQueue
      .then(handleCurrentGraphChanged)
      .catch((error: unknown) => {
        operationalLogger.log("error", "plugin-lifecycle", "graph_switch_rebind_failed", {
          result: "restricted",
          errorCode: error instanceof StructuredError ? error.code : "GRAPH_SWITCH_REBIND_FAILED",
        });
        enterRestrictedServiceMode("GRAPH_SWITCH_REBIND_FAILED", "当前 Graph 的本地运行环境无法安全绑定；正式写入保持关闭。");
      });
  }));

  if (typeof descriptorPath !== "string" || !descriptorPath.trim()) {
    firstRunMode = true;
    cleanupHooks.push(logseq.onSettingsChanged(() => {
      const nextDescriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
      if (nextDescriptorPath === ignoredDescriptorSettingValue) {
        ignoredDescriptorSettingValue = undefined;
        return;
      }
      void refreshServiceRuntime(nextDescriptorPath)
        .then(async () => {
          featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
          firstRunAction = "start";
          await refreshToolbarInterventionFacts();
          if (logseq.isMainUIVisible) void refresh();
        })
        .catch((error: unknown) => operationalLogger.log("error", "plugin-lifecycle", "service_connection_refresh_failed", { result: "error" }, error));
    }));
    markReady("EVENTS_READY");
    markReady("PLUGIN_READY", "first-run welcome ready; no Graph scan, migration, or model call performed");
    await refreshToolbarInterventionFacts();
    return;
  }

  await activateConnectedFeatureRuntime();
  await refreshToolbarInterventionFacts();
  cleanupHooks.push(logseq.onSettingsChanged(() => {
    const nextDescriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
    if (nextDescriptorPath === ignoredDescriptorSettingValue) {
      ignoredDescriptorSettingValue = undefined;
      return;
    }
    void refreshServiceRuntime(nextDescriptorPath)
      .then(async () => {
        featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
        diagnostics.setStoreStatus(serviceConnection.status === "READY" ? "READY" : "READ_ONLY_SAFE_MODE");
        message = `设置已更新；V2 Local Service ${serviceConnection.status}，正式领域状态与历史未受影响。`;
        await refreshToolbarInterventionFacts();
        if (logseq.isMainUIVisible) void refresh();
      })
      .catch((error: unknown) => operationalLogger.log("error", "plugin-lifecycle", "service_connection_refresh_failed", { result: "error" }, error));
  }));
  markReady("EVENTS_READY");
  featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
  markReady("PLUGIN_READY", "V2 Local Service runtime ready; V1 FileStorage is migration-only");
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
    await releaseServiceLifecycleSession();
    featureReady = false;
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
    toolbarFacts = { proposals: [], semanticCommits: [], available: false };
    updateToolbarIntervention();
    console.error(`[Task Copilot] initialization failed at ${failedStage}`, error);
    try {
      requireAppRoot().innerHTML = renderRuntimeDiagnostics(diagnostics.snapshot());
    } catch (renderError) {
      console.error("[Task Copilot] diagnostic fallback render failed", renderError);
    }
  }
}

void logseq.ready().then(main).catch((error: unknown) => console.error("[Task Copilot] bootstrap failed before fallback UI became available", error));
