import "@logseq/libs";

import type { AgentFeedbackAction, AgentFeedbackCorrectionType, AgentFeedbackInput, AgentFeedbackRating, AgentGovernanceExportPackage, CreationAnswerState, Lifecycle, V2Anchor, V2Condition, V2MiniProjectClosure, V2ObjectType, V2ProjectStructure, V2Proposal } from "@task-copilot/domain";
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
import { cancelActionDialogReturnsToOrigin, isWorkspace, renderApp, type ActionDialogKind, type UiModel, type V2NowWorkGrouping, type V2NowWorkTypeFilter, type Workspace } from "./ui.ts";
import { defaultDirectoryFilterState, type DirectoryFilterState } from "./global-object-directory.ts";
import { WorksitePreviewController, type WorksitePreviewMode, type WorksitePreviewState } from "./worksite-preview-controller.ts";
import { WorksiteChangeRouter } from "./worksite-change-router.ts";
import { AgentGovernanceChangeQueue } from "./agent-governance-change-queue.ts";
import { buildAgentGovernancePackageDownload, downloadTextFile } from "./download-text.ts";
import { createDelegatedActionHandler } from "./inbox-action-controller.ts";
import { StructuredLogger, type StructuredLogEntry } from "./structured-logger.ts";
import { recoverServiceRuntime } from "./service-runtime-recovery.ts";
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
  ServiceConditionUndoPreparation,
  LocalServiceClient,
  ServiceFocusSelection,
  ServiceNowWork,
  ServiceProjectClosureEvidenceDraft,
  ServiceProjectClosureUserJudgments,
  ServiceSemanticCommit,
  ServiceStoredProposal,
} from "@task-copilot/service-client";
import type { LauncherRestoreRecoveryStatus } from "@task-copilot/service-client/launcher";
import {
  ensurePersistentBlockIdentity as ensurePersistentBlockIdentityWithoutEcho,
  ExplicitSyncController,
  registerExplicitSyncEvents,
  type ExplicitSyncEventHost,
  type ExplicitSyncState,
} from "./explicit-sync-controller.ts";
import {
  prepareV2PrimaryAnchorRebind,
  renderV2AnchorIssueStatus,
  renderV2PrimaryAnchorRebindPanel,
  submitV2PrimaryAnchorRebind,
  type V2RebindPanelState,
} from "./v2-anchor-rebind.ts";
import { V2RebindCaptureController } from "./v2-rebind-capture.ts";
import {
  formalizeV2Candidate,
  persistV2ExplicitCandidateDiscovery,
  prepareV2ExplicitCandidateDiscovery,
  updateExistingObjectFromV2Candidate,
  type V2ExplicitCandidatePanelState,
} from "./v2-explicit-candidate-discovery.ts";
import { createReviewedProjectWithPage, ownedProjectPageObjectId, projectCreationUndoMessage, undoReviewedProjectCreation } from "./v2-project-creation.ts";
import { ProjectCreationGrillController, type ProjectCreationSource } from "./project-creation-grill-controller.ts";
import { CreationSessionController, type CreationSessionClient } from "./creation-session-controller.ts";
import { commitCreationSessionProject, undoCreationSessionProject } from "./creation-session-commit.ts";
import { commitCreationSessionMini, undoCreationSessionMini } from "./creation-session-mini-commit.ts";
import {
  buildSelectedBlockProposalPrompt,
  buildSelectedBlockProposalRevisionPrompt,
  presentSelectedBlockAnalysisNotice,
} from "./v2-provider-analysis.ts";
import { buildMiniProjectLegacyTransferProposal } from "./v2-mini-project-legacy-transfer.ts";
import { submitV2Association, type V2AssociationSubmissionState } from "./v2-association-controller.ts";
import { collectV2ProposalGraphObservations } from "./v2-proposal-revalidation.ts";
import { commitV2Formalization, undoV2Formalization } from "./v2-proposal-commit.ts";
import { applyLowRiskV2Proposal } from "./v2-low-risk-apply.ts";
import { commitMiniProjectRestructure, undoMiniProjectRestructure, type MiniProjectRestructureGraphHost } from "./v2-mini-project-restructure.ts";
import { settleRuntimeBridgeCall } from "./runtime-bridge-guard.ts";
import { GraphReadBridgeController } from "./graph-read-bridge-controller.ts";
import { executeGraphReadRequest, type GraphReadBridgeHost } from "./graph-read-bridge.ts";
import { BlockFocusController, resolveBlockObject } from "./block-focus-controller.ts";
import { BlockConditionController, type BlockConditionDraft } from "./block-condition-controller.ts";
import { PageContextController, type PageContextSnapshot } from "./page-context-controller.ts";
import { checksum, StructuredError } from "@task-copilot/shared";
import { deriveToolbarIntervention, type ToolbarIntervention } from "./toolbar-intervention.ts";
import {
  managedRuntimeBlockedPresentation,
  managedRuntimeEndDecision,
  managedRuntimeAllowsAutomaticRecovery,
  managedRuntimeFormalActionAvailability,
} from "./service-lifecycle-policy.ts";
import { insertSlashCreateSyntax, slashCreateContentAfterInsertion, SLASH_CREATE_SYNTAX, type SlashCreateObjectType } from "./slash-create-command.ts";
import { projectClosureProposalFailure, readProjectClosureUserJudgments } from "./project-closure-input.ts";
import { OriginRouteController, type OriginRouteToken } from "./origin-route-controller.ts";
import type { OriginReturnTarget } from "./origin-route-controller.ts";
import { clearDurableOrigin, loadDurableOrigin, saveDurableOrigin } from "./durable-origin-storage.ts";
import { readSelectedBlockForAnalysis, SelectedBlockAnalysisTarget } from "./selected-block-analysis.ts";
import {
  AttentionShadowSession,
  attentionShadowCurrentSignature,
  buildAttentionDetectorSnapshot,
  decodeAttentionNowPilotPrimaryValue,
  summarizeDynamicNowShadow,
  type AttentionNowPilotHint,
  type AttentionShadowCycleSummary,
  type DynamicNowShadowRuntimeSummary,
} from "./attention-shadow-runtime.ts";
import {
  projectPluginV2ProjectReentry,
  projectPluginV2TaskReentry,
  type PluginProjectReentryCard,
  type PluginTaskReentryCard,
} from "./reentry-runtime.ts";
import {
  projectPluginAnchorIssueNarrations,
  projectPluginObjectNarrations,
  type PluginAnchorIssueNarration,
  type PluginObjectNarration,
} from "./status-narration-runtime.ts";
import { ProjectPageHeadActionController } from "./project-page-head-action.ts";
import { ProjectContextRecoveryController } from "./project-context-recovery-controller.ts";
import { MiniProjectGrillController } from "./mini-project-grill-controller.ts";
import { BackupRestoreController, backupRestoreFailureDisposition, type BackupRestoreClient } from "./backup-restore-controller.ts";
import { renderRestoreRecoveryGuide } from "./restore-recovery-guide.ts";
import {
  MIGRATION_BUNDLE_MAX_BYTES,
  MigrationScanController,
  type PluginMigrationDecisionInput,
  type MigrationScanClient,
} from "./migration-scan-controller.ts";
import {
  MigrationExecutionController,
  type MigrationExecutionClient,
  type PluginMigrationRunView,
} from "./migration-execution-controller.ts";
import { applyHostThemeMode, configuredThemeMode, detectSystemThemeMode, detectVisibleThemeMode, registerHostThemeModeSync } from "./theme-mode.ts";
import { activeOutcomeScope, createScopedOutcome } from "./scoped-outcome.ts";
import type { AgentGovernanceRange, AgentGovernanceUiState, AgentGovernanceView } from "./agent-governance-ui.ts";

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
let v2DirectoryFilter: DirectoryFilterState = defaultDirectoryFilterState();
let v2DirectorySearchTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let directoryFormReturnToObjects = false;
let message: string | undefined;
let latestError: string | undefined;
let recentActionCommitId: string | undefined;
let uiActionSequence = 0;
let currentUiActionId = "runtime-startup:0";
let actionDialog: UiModel["actionDialog"];
let agentSelectedDecisionId: string | undefined;
let agentSelectedDecisionIds = new Set<string>();
let agentFeedbackBusy = false;
let agentExportBusy: AgentGovernanceUiState["exportBusy"];
let agentGovernanceMutationBusy = false;
let agentGovernanceView: AgentGovernanceView = "decisions";
let agentGovernanceRange: AgentGovernanceRange = "24h";
let agentBatchFeedbackMode = false;
let agentGovernanceSettingsOpen = false;
let agentExportMenuOpen = false;
let agentFeedbackExpandedDecisionId: string | undefined;
let agentFeedbackExpandedRating: AgentFeedbackRating | undefined;
let agentDecisionFilter: AgentGovernanceUiState["decisionFilter"] = "ALL";
let agentDecisionSearch = "";
let agentDecisionSearchTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
const operationalLogger = new StructuredLogger(300, { pluginVersion: "0.1.0", pluginCommit: PLUGIN_COMMIT });
const attentionShadowSession = new AttentionShadowSession();
const backupRestoreController = new BackupRestoreController();
const migrationScanController = new MigrationScanController();
const migrationExecutionController = new MigrationExecutionController();

function isBackupRestoreClient(client: ServiceRuntimeClient | undefined): client is ServiceRuntimeClient & BackupRestoreClient {
  return Boolean(
    client
    && typeof client.listBackups === "function"
    && typeof client.createBackup === "function"
    && typeof client.validateBackup === "function"
    && typeof client.restoreBackup === "function",
  );
}

function isMigrationScanClient(client: ServiceRuntimeClient | undefined): client is ServiceRuntimeClient & MigrationScanClient {
  return Boolean(
    client
    && typeof client.scanLegacyMigration === "function"
    && typeof client.previewLegacyMigration === "function",
  );
}

function isMigrationExecutionClient(client: ServiceRuntimeClient | undefined): client is ServiceRuntimeClient & MigrationExecutionClient {
  return Boolean(
    client
    && typeof client.scanLegacyMigration === "function"
    && typeof client.getMigrationRun === "function"
    && typeof client.createBackup === "function"
    && typeof client.importLegacyMigration === "function"
    && typeof client.verifyLegacyMigrationBatch === "function"
    && typeof client.undoLegacyMigrationBatch === "function"
    && typeof client.activateLegacyMigration === "function",
  );
}

type AgentGovernanceUiClient = ServiceRuntimeClient & Required<Pick<ServiceRuntimeClient,
  | "listAgentDecisions"
  | "listAgentDecisionEvents"
  | "listAgentReviewSignals"
  | "listAgentRuleAuthorizations"
  | "getAgentGovernanceSettings"
  | "setAgentRulePaused"
  | "setAgentGlobalWritesPaused"
  | "setAgentObservationEnabled"
  | "setAgentExpandedContextEnabled"
  | "recordAgentFeedback"
  | "recordAgentBulkFeedback"
  | "exportAgentSkillFeedback"
  | "exportAgentReviewEvidence"
>>;

function isAgentGovernanceUiClient(client: ServiceRuntimeClient | undefined): client is AgentGovernanceUiClient {
  return Boolean(
    client
    && typeof client.listAgentDecisions === "function"
    && typeof client.listAgentDecisionEvents === "function"
    && typeof client.listAgentReviewSignals === "function"
    && typeof client.listAgentRuleAuthorizations === "function"
    && typeof client.getAgentGovernanceSettings === "function"
    && typeof client.setAgentRulePaused === "function"
    && typeof client.setAgentGlobalWritesPaused === "function"
    && typeof client.setAgentObservationEnabled === "function"
    && typeof client.setAgentExpandedContextEnabled === "function"
    && typeof client.recordAgentFeedback === "function"
    && typeof client.recordAgentBulkFeedback === "function"
    && typeof client.exportAgentSkillFeedback === "function"
    && typeof client.exportAgentReviewEvidence === "function",
  );
}

function beginUiAction(action: string): void {
  uiActionSequence += 1;
  currentUiActionId = `${action}:${uiActionSequence}`;
  message = undefined;
  latestError = undefined;
  recentActionCommitId = undefined;
  if (v2CandidatePanel.status === "success" || v2CandidatePanel.status === "error") {
    v2CandidatePanel = { status: "idle" };
  }
  if (v2ProviderState.status === "success" || v2ProviderState.status === "error") {
    v2ProviderState = { status: "idle" };
  }
  v2ProjectClosureProposalMessage = undefined;
}
let lastAttentionShadowSummarySignature: string | undefined;
const graphReadBridgeHost: GraphReadBridgeHost = {
  getPage: (target) => logseq.Editor.getPage(target as never),
  getPageBlocksTree: (target) => logseq.Editor.getPageBlocksTree(target as never),
  getBlock: (target, options) => logseq.Editor.getBlock(target as never, options),
};
const graphReadBridgeController = new GraphReadBridgeController(graphReadBridgeHost, {
  onIssue: restrictServiceRuntimeAfterTransportFailure,
});
let worksiteRefreshTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
const worksitePreviewController = new WorksitePreviewController(graphReadBridgeHost, {
  onStateChange: (objectId, mode, state) => {
    const item = lastNowWorkItems.find((candidate) => candidate.objectId === objectId);
    worksiteChangeRouter.observeLoaded(objectId, item?.primaryAnchorExternalId, state);
    scheduleWorksiteRefresh();
  },
});
const worksiteChangeRouter = new WorksiteChangeRouter(graphReadBridgeHost, {
  debounceMs: 350,
  onAffected: (objectIds) => {
    for (const objectId of objectIds) {
      worksitePreviewController.invalidate(objectId);
      worksitePreviewController.markStale(objectId);
      operationalLogger.log("info", "source-resolution", "worksite_invalidation", { objectId, result: "deferred" });
    }
    void refreshAffectedWorksitePreviews(objectIds);
  },
});
function worksiteMetricsFields(): Partial<StructuredLogEntry> {
  const controllerMetrics = worksitePreviewController.metrics();
  const routerMetrics = worksiteChangeRouter.metrics();
  return {
    worksiteReadsStartedCount: controllerMetrics.readsStarted,
    worksiteReadsCompletedCount: controllerMetrics.readsCompleted,
    worksiteDiscardedReadsCount: controllerMetrics.discardedReads,
    worksiteCacheHitsCount: controllerMetrics.cacheHits,
    worksiteMaxConcurrentCount: controllerMetrics.maxConcurrentReads,
    worksiteIgnoredChangesCount: routerMetrics.changedBlocksIgnored,
    worksiteParentChainReadsCount: routerMetrics.parentChainReads,
    worksiteAffectedObjectsCount: routerMetrics.affectedObjects,
    worksiteChangeEventsCount: routerMetrics.changeEventsReceived,
    worksiteDebouncedInvalidationsCount: routerMetrics.debouncedInvalidations,
  };
}
function scheduleWorksiteRefresh(): void {
  if (worksiteRefreshTimer !== undefined) return;
  worksiteRefreshTimer = globalThis.setTimeout(() => {
    worksiteRefreshTimer = undefined;
    if (logseq.isMainUIVisible && workspace === "now") void refresh();
  }, 50);
}
async function refreshAffectedWorksitePreviews(objectIds: readonly string[]): Promise<void> {
  if (!logseq.isMainUIVisible || workspace !== "now") return;
  const loads: Array<Promise<WorksitePreviewState>> = [];
  const startedAt = Date.now();
  for (const objectId of objectIds) {
    const item = lastNowWorkItems.find((candidate) => candidate.objectId === objectId);
    if (!item?.primaryAnchorExternalId) continue;
    const focused = lastNowWorkFocusIds.has(objectId);
    if (!focused && !worksitePreviewController.isExpanded(objectId)) continue;
    const loadStartedAt = Date.now();
    loads.push(worksitePreviewController.load(item.objectId, item.primaryAnchorExternalId, item.version, worksitePreviewController.expandedMode(item.objectId)).then((state) => {
      operationalLogger.log("info", "query-refresh", "worksite_auto_reload", {
        objectId,
        result: state.status,
        durationMs: Date.now() - loadStartedAt,
      });
      return state;
    }));
  }
  if (loads.length === 0) return;
  await Promise.allSettled(loads);
  operationalLogger.log("info", "query-refresh", "worksite_auto_reload_batch", {
    result: "completed",
    durationMs: Date.now() - startedAt,
    ...worksiteMetricsFields(),
  });
  scheduleWorksiteRefresh();
}
let lastNowWorkItems: Array<{ objectId: string; version: number; primaryAnchorExternalId?: string }> = [];
let lastNowWorkFocusIds = new Set<string>();
let firstRunMode = false;
let firstRunAction: FirstRunAction | undefined;
let firstRunDescriptorImport: FirstRunModel["descriptorImport"];
let firstRunDescriptorImportBusy = false;
let ignoredDescriptorSettingValue: string | undefined;
let serviceRuntimeClient: ServiceRuntimeClient | undefined;
let serviceLifecycleSession: ServiceLifecycleSession | undefined;
let restoreRecoveryStatus: LauncherRestoreRecoveryStatus | undefined;
let restoreRecoveryApply: (() => Promise<void>) | undefined;
let restoreRecoveryPrepared = false;
let restoreRecoveryBusy = false;
let serviceLifecycleHeartbeatTimer: ReturnType<typeof globalThis.setInterval> | undefined;
let serviceLifecycleHeartbeatBusy = false;
let configuredServiceDescriptorPath: string | undefined;
let currentGraphKey: string | undefined;
let runtimeEndedByUser = false;
let graphSwitchQueue: Promise<void> = Promise.resolve();
const pluginInstanceId = `plugin-${globalThis.crypto.randomUUID()}`;
const blockFocusController = new BlockFocusController(() => formalActionRuntimeClient());
const blockConditionController = new BlockConditionController(() => formalActionRuntimeClient());
const pageContextController = new PageContextController(() => serviceRuntimeClient, {
  getPage: (identity) => logseq.Editor.getPage(identity),
  getCurrentPage: () => logseq.Editor.getCurrentPage(),
  getPageBlocksTree: (identity) => logseq.Editor.getPageBlocksTree(identity),
});
const projectPageHeadActionController = new ProjectPageHeadActionController({
  checkSlotValid: (slot) => logseq.UI.checkSlotValid(slot),
  provideUi: (input) => {
    logseq.provideUI(input);
  },
}, {
  available: () => formalActionAvailability().available,
  resolveCurrentProject: async () => {
    const current = await pageContextController.resolveCurrentProject();
    return current ? { projectText: current.project.objectText } : undefined;
  },
  onIssue: (error) => operationalLogger.log("warn", "source-resolution", "project_page_head_action_unavailable", {
    result: "hidden",
    errorCode: explain(error),
  }),
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
let durableOriginLoadedGraphKey: string | undefined;
let durableOriginFallbackShownForToken: string | undefined;
let durableOriginResolvedForToken: string | undefined;
let durableOriginResolving = false;
let durableOriginLastAttemptAt = 0;
let durableOriginParkedRetryCount = 0;
let v2ReentryTargetObjectId: string | undefined;
const v2ProviderTarget = new SelectedBlockAnalysisTarget();
let serviceDiscoveryGeneration = 0;
let explicitSyncController: ExplicitSyncController | undefined;
let agentGovernanceChangeQueue: AgentGovernanceChangeQueue<{ changedBlockId: string; changedBlockCount: number }> | undefined;
let explicitSyncState: ExplicitSyncState = {
  pending: 0,
  transportReady: false,
  reconciliationRequired: false,
};
let v2RebindPanel: V2RebindPanelState = { status: "idle" };
let v2CandidatePanel: V2ExplicitCandidatePanelState = { status: "idle" };
let v2ProviderState: NonNullable<UiModel["v2ProviderState"]> = { status: "idle" };
let v2ProviderRevisionBusy = false;
let v2ProjectNarrationBusy = false;
let v2ProjectClosureEvidenceBusy = false;
let v2ProjectClosureEvidence: ServiceProjectClosureEvidenceDraft | undefined;
let v2ProjectClosureProposalBusy = false;
let v2ProjectClosureProposalMessage: string | undefined;
let v2ProjectClosureUserJudgments: ServiceProjectClosureUserJudgments | undefined;
let v2ProjectClosureDraftFields: Record<string, string> | undefined;
const projectContextRecoveryController = new ProjectContextRecoveryController(
  () => ({
    ...(serviceRuntimeClient ? { client: serviceRuntimeClient } : {}),
    providerAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.recoverProjectContext),
    generation: serviceDiscoveryGeneration,
  }),
  refresh,
);

async function bindBusinessOrigin(token: OriginRouteToken): Promise<void> {
  originRoute = token;
  durableOriginFallbackShownForToken = undefined;
  durableOriginResolvedForToken = undefined;
  durableOriginParkedRetryCount = 0;
  const graphKey = currentGraphKey;
  if (!graphKey) return;
  durableOriginLoadedGraphKey = graphKey;
  try {
    await saveDurableOrigin(logseq.FileStorage, graphKey, token);
  } catch (error) {
    operationalLogger.log("warn", "source-resolution", "durable_origin_save_failed", {
      actionId: "save-business-origin",
      result: "session-only",
      errorCode: explain(error),
    });
  }
}

async function clearBusinessOrigin(): Promise<void> {
  originRoute = undefined;
  durableOriginFallbackShownForToken = undefined;
  durableOriginResolvedForToken = undefined;
  durableOriginParkedRetryCount = 0;
  durableOriginLoadedGraphKey = currentGraphKey;
  try {
    await clearDurableOrigin(logseq.FileStorage);
  } catch (error) {
    operationalLogger.log("warn", "source-resolution", "durable_origin_clear_failed", {
      actionId: "clear-business-origin",
      result: "cleared-in-memory",
      errorCode: explain(error),
    });
  }
}

async function restoreBusinessOriginForCurrentGraph(): Promise<void> {
  const graphKey = currentGraphKey;
  if (!graphKey || durableOriginLoadedGraphKey === graphKey) return;
  const restored = await loadDurableOrigin(logseq.FileStorage, graphKey);
  if (restored) {
    originRoute = restored;
    durableOriginLoadedGraphKey = graphKey;
  }
}

async function resolveDurableOriginAfterReload(): Promise<void> {
  const graphKey = currentGraphKey;
  if (!graphKey || runtimeEndedByUser || logseq.isMainUIVisible) return;
  if (!originRoute) await restoreBusinessOriginForCurrentGraph();
  const token = originRoute;
  if (!token) return;
  const tokenSignature = `${token.kind}:${token.pageUuid}:${token.kind === "BLOCK" ? token.blockUuid : ""}`;
  if (durableOriginResolvedForToken === tokenSignature || durableOriginResolving) return;
  if (Date.now() - durableOriginLastAttemptAt < 750) return;
  durableOriginLastAttemptAt = Date.now();
  durableOriginResolving = true;
  try {
    let result: Awaited<ReturnType<OriginRouteController["resolveAfterReload"]>> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        if (logseq.isMainUIVisible) return;
      }
      result = await originRouteController.resolveAfterReload(token);
      if (result.status !== "SOURCE_UNAVAILABLE") break;
    }
    if (!result) return;
    if (result.status === "PARKED") {
      if (durableOriginParkedRetryCount < 2) {
        durableOriginParkedRetryCount += 1;
        for (const delay of [2_000, 5_000]) {
          setTimeout(() => {
            void resolveDurableOriginAfterReload();
          }, delay);
        }
      }
      return;
    }
    if (result.status === "SOURCE_UNAVAILABLE" && durableOriginFallbackShownForToken === tokenSignature) return;
    operationalLogger.log(
      result.status === "RETURNED" || result.status === "RETURNED_PAGE_ONLY" ? "info" : "warn",
      "source-resolution",
      "durable_origin_reload_resolved",
      { actionId: "resolve-durable-origin", result: result.status.toLowerCase() },
    );
    if (result.status === "RETURNED" || result.status === "RETURNED_PAGE_ONLY") {
      durableOriginResolvedForToken = tokenSignature;
      durableOriginParkedRetryCount = 0;
    }
    if (result.status === "RETURNED" && token.kind === "BLOCK") {
      const pageName = token.pageName;
      const blockUuid = token.blockUuid;
      for (const delay of [1_000, 2_500]) {
        setTimeout(() => {
          try {
            void logseq.Editor.scrollToBlockInPage(pageName, blockUuid);
          } catch {
            // Late-render scroll is best-effort; the main resolution already succeeded.
          }
        }, delay);
      }
    }
    if (result.status === "SOURCE_UNAVAILABLE") {
      durableOriginFallbackShownForToken = tokenSignature;
      actionDialog = {
        kind: "v2-origin-fallback",
        value: JSON.stringify({ pageName: token.pageName, label: result.label }),
      };
      message = undefined;
      latestError = undefined;
      await showTaskCopilot();
    }
  } finally {
    durableOriginResolving = false;
  }
}

function abandonV2RebindCaptureWithoutResume(): void {
  v2RebindCaptureController.abandon();
}

async function finishV2RebindCapture(): Promise<void> {
  const transport = serviceRuntimeClient
    && serviceConnection.status === "READY"
    && serviceConnection.formalWritesAvailable
    ? serviceRuntimeClient
    : undefined;
  await v2RebindCaptureController.finish(explicitSyncController, transport);
}

async function expireV2RebindCapture(): Promise<void> {
  try {
    await finishV2RebindCapture();
    v2RebindPanel = {
      status: "error",
      message: "受控选择窗口已在 5 分钟后结束，自动同步已经恢复；没有执行重新连接。请重新开始后再选择替换正文。",
    };
    if (logseq.isMainUIVisible) await showRuntimeDiagnostics();
  } catch (error) {
    operationalLogger.log("error", "ui-action", "v2_primary_anchor_capture_expiry_failed", {
      actionId: "v2-rebind-capture",
      result: "error",
      errorCode: explain(error),
    });
  }
}

const v2RebindCaptureController = new V2RebindCaptureController(expireV2RebindCapture);
const miniProjectGrillController = new MiniProjectGrillController(
  () => ({
    ...(serviceRuntimeClient ? { client: serviceRuntimeClient } : {}),
    providerAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.grillMiniProject),
    generation: serviceDiscoveryGeneration,
  }),
  refresh,
);
const projectCreationGrillController = new ProjectCreationGrillController(
  () => ({
    ...(serviceRuntimeClient ? { client: serviceRuntimeClient } : {}),
    providerAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.grillProjectCreation),
    generation: serviceDiscoveryGeneration,
  }),
  refresh,
);
function isCreationSessionClient(client: ServiceRuntimeClient | undefined): client is ServiceRuntimeClient & CreationSessionClient {
  return Boolean(client
    && typeof client.createCreationSession === "function"
    && typeof client.getCreationSession === "function"
    && typeof client.listCreationSessions === "function"
    && typeof client.startCreationSessionRound === "function"
    && typeof client.submitCreationSessionRound === "function"
    && typeof client.retryCreationSessionRound === "function"
    && typeof client.generateCreationSessionDraft === "function"
    && typeof client.editCreationSessionDraft === "function"
    && typeof client.adoptCreationSessionDraft === "function"
    && typeof client.updateCreationSession === "function"
    && typeof client.createCreationSessionProposal === "function"
    && typeof client.abandonCreationSession === "function");
}
const creationSessionController = new CreationSessionController(
  () => ({
    ...(isCreationSessionClient(serviceRuntimeClient) ? { client: serviceRuntimeClient } : {}),
    providerAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && isCreationSessionClient(serviceRuntimeClient),
    generation: serviceDiscoveryGeneration,
  }),
  refresh,
);
let v2LowRiskApplyBusyProposalId: string | undefined;
const v2AssociationSubmission: V2AssociationSubmissionState = { busy: false };
let v2OwnershipCommitBusy = false;
let v2BlockConditionBusy = false;
let v2ConditionUndoBusy = false;
let v2ConditionUndoPreparation: ServiceConditionUndoPreparation | undefined;
let v2LifecycleCommitBusy = false;
let v2StructureCommitBusy = false;
let v2ProjectCreationCommitBusy = false;
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

function formalActionAvailability() {
  return managedRuntimeFormalActionAvailability({
    runtimeEndedByUser,
    featureReady,
    connectionStatus: serviceConnection.status,
    formalWritesAvailable: serviceConnection.formalWritesAvailable,
    hasClient: Boolean(serviceRuntimeClient),
  });
}

function formalActionRuntimeClient(): ServiceRuntimeClient | undefined {
  return formalActionAvailability().available ? serviceRuntimeClient : undefined;
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
  if (!block) throw new Error("原正文连接已不可用；没有修改正式事项。请在系统状态中检查并重新连接正文。");
  if (!logseq.Editor.scrollToBlockInPage || block.page === undefined) throw new Error("当前 Logseq 无法安全打开这条正文；没有修改正式事项。");
  const page = await resolveLogseqPageReference(block.page, logseq.Editor.getPage?.bind(logseq.Editor));
  if (page.displayName === "无法解析的 Logseq 页面") throw new Error("正文所在页面当前无法确认；没有修改正式事项。请从系统状态检查正文连接。");
  await logseq.Editor.scrollToBlockInPage(page.pageName ?? page.displayName.replace(" · Journal", ""), externalId);
}

async function openAgentDecisionSource(value: string): Promise<void> {
  let source: { kind?: unknown; externalId?: unknown; pageName?: unknown };
  try {
    source = JSON.parse(decodeURIComponent(value)) as typeof source;
  } catch {
    throw new Error("Agent 决策来源标识无效；没有修改任何内容。");
  }
  if ((source.kind !== "BLOCK" && source.kind !== "PAGE") || typeof source.externalId !== "string" || !source.externalId) {
    throw new Error("Agent 决策来源标识无效；没有修改任何内容。");
  }
  if (source.kind === "BLOCK") {
    await openV2PrimaryAnchor(source.externalId);
    return;
  }
  const pageName = typeof source.pageName === "string" && source.pageName.trim() ? source.pageName : source.externalId;
  await logseq.App.pushState("page", { name: pageName });
}

async function openV2ProjectWorksite(objectId: string, expectedVersion: number): Promise<void> {
  const client = serviceRuntimeClient;
  if (!client) throw new Error("当前项目入口暂不可用；项目和正文没有变化。");
  const [objects, anchors] = await Promise.all([client.listObjects(), listAllPrimaryAnchors(client)]);
  const current = objects.find((object) => object.objectId === objectId);
  const primaryAnchor = anchors.find((anchor) =>
    anchor.objectId === objectId
    && anchor.role === "primary_text"
    && anchor.status === "active"
  );
  if (!current || current.objectType !== "PROJECT" || current.version !== expectedVersion || !primaryAnchor) {
    throw new Error("当前项目或工作现场已经变化；请刷新后重新打开。");
  }
  const candidatePages = [
    await logseq.Editor.getCurrentPage(),
    await logseq.Editor.getPage(primaryAnchor.externalId),
    await logseq.Editor.getPage(`Project/${current.text}`),
  ];
  let pageName: string | undefined;
  for (const candidate of candidatePages) {
    if (!candidate) continue;
    const identity = await resolveLogseqPageReference(candidate, logseq.Editor.getPage?.bind(logseq.Editor));
    if (
      identity.pageUuid === primaryAnchor.externalId
      || ownedProjectPageObjectId(candidate) === current.objectId
    ) {
      pageName = identity.pageName ?? identity.displayName.replace(" · Journal", "");
      break;
    }
  }
  if (pageName) {
    await logseq.App.pushState("page", { name: pageName });
  } else {
    await openV2PrimaryAnchor(primaryAnchor.externalId);
  }
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

function renderDiagnostics(
  snapshot: Parameters<typeof renderRuntimeDiagnostics>[0],
  anchorIssueNarrations: readonly PluginAnchorIssueNarration[] | "unavailable" = "unavailable",
): string {
  const available = serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient);
  const anchorStatus = renderV2AnchorIssueStatus(anchorIssueNarrations, available);
  const rebindPanel = v2RebindPanel.status === "idle" ? "" : renderV2PrimaryAnchorRebindPanel(v2RebindPanel, available);
  const restoreRecoveryGuide = renderRestoreRecoveryGuide(restoreRecoveryStatus, {
    prepared: restoreRecoveryPrepared,
    busy: restoreRecoveryBusy,
    applyAvailable: Boolean(restoreRecoveryApply),
  });
  return renderRuntimeDiagnostics(snapshot, "", `${restoreRecoveryGuide}${anchorStatus}${rebindPanel}`);
}

async function model(): Promise<UiModel> {
  let agentGovernance: AgentGovernanceUiState | undefined;
  let v2Proposals: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listProposals"]>> = [];
  let v2Candidates: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listCandidates"]>> = [];
  let v2SemanticCommits: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listSemanticCommits"]>> = [];
  let v2Objects: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listObjects"]>> = [];
  let v2FocusSelections: ServiceFocusSelection[] = [];
  let v2Associations: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listAssociations"]>> = [];
  let v2PrimaryOwnerships: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["listPrimaryOwnerships"]>> = [];
  let v2PrimaryAnchors: V2Anchor[] = [];
  let v2ProjectReentryCards: PluginProjectReentryCard[] | undefined;
  let v2TaskReentryCards: Record<string, PluginTaskReentryCard> | undefined;
  let v2ObjectNarrations: Record<string, PluginObjectNarration> | undefined;
  let v2MigrationRuns: PluginMigrationRunView[] = [];
  let v2NowWork: Awaited<ReturnType<NonNullable<typeof serviceRuntimeClient>["nowWork"]>> | undefined;
  let v2AttentionNowPilot: AttentionNowPilotHint[] | undefined;
  let v2ProposalLoadError: string | undefined;
  let v2AuditLoadError: string | undefined;
  let v2RelationLoadError: string | undefined;
  let v2ReentryLoadError: string | undefined;
  let v2TaskReentryLoadError: string | undefined;
  let v2PrimaryAnchorLoadError: string | undefined;
  let v2StatusNarrationLoadError: string | undefined;
  let v2MigrationLoadError: string | undefined;
  const primaryAnchorByObject = new Map<string, V2Anchor>();
  if (serviceConnection.status === "READY" && serviceRuntimeClient) {
    try {
      [v2Proposals, v2Objects, v2NowWork, v2Candidates, v2FocusSelections] = await Promise.all([
        serviceRuntimeClient.listProposals(),
        serviceRuntimeClient.listObjects(),
        serviceRuntimeClient.nowWork(),
        serviceRuntimeClient.listCandidates(),
        serviceRuntimeClient.listFocusSelections(),
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
      for (const anchor of v2PrimaryAnchors) {
        if (anchor.role !== "primary_text" || anchor.status === "replaced") continue;
        const current = primaryAnchorByObject.get(anchor.objectId);
        if (!current || (current.status !== "active" && anchor.status === "active")) {
          primaryAnchorByObject.set(anchor.objectId, anchor);
        }
      }
    } catch (error) {
      v2PrimaryAnchorLoadError = explain(error);
      v2ReentryLoadError = v2PrimaryAnchorLoadError;
    }
    try {
      const rawMigrationRuns = await serviceRuntimeClient.listMigrationRuns();
      const migrationDetails = typeof serviceRuntimeClient.getMigrationRun === "function"
        ? await Promise.all(rawMigrationRuns.map(({ runId }) => serviceRuntimeClient!.getMigrationRun!(runId)))
        : [];
      v2MigrationRuns = migrationExecutionController.bindRuns(rawMigrationRuns, migrationDetails);
    } catch (error) {
      v2MigrationLoadError = explain(error);
    }
    if (currentGraphKey && v2NowWork && !v2ProposalLoadError && !v2AuditLoadError && !v2ReentryLoadError) {
      const attentionReady = await refreshAttentionShadowRuntime({
        graphKey: currentGraphKey,
        objects: v2Objects,
        proposals: v2Proposals,
        commits: v2SemanticCommits,
        anchors: v2PrimaryAnchors,
        activeFocusObjectIds: v2NowWork.focus.map((item) => item.objectId),
      });
      if (attentionReady && workspace === "now") {
        v2AttentionNowPilot = attentionShadowSession.projectNowPilot({
          observedAt: v2NowWork.generatedAt,
          visibleObjectIds: [
            ...v2NowWork.focus.map((item) => item.objectId),
            ...v2NowWork.next.map((item) => item.objectId),
            ...v2NowWork.waitingReview.map((item) => item.objectId),
          ],
        });
      }
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
    if (v2NowWork && !v2ProposalLoadError && !v2AuditLoadError && !v2PrimaryAnchorLoadError) {
      try {
        v2TaskReentryCards = projectPluginV2TaskReentry({
          observedAt: v2NowWork.generatedAt,
          objects: v2Objects,
          ownerships: v2RelationLoadError ? [] : v2PrimaryOwnerships,
          anchors: v2PrimaryAnchors,
          proposals: v2Proposals,
          commits: v2SemanticCommits,
        });
      } catch (error) {
        v2TaskReentryLoadError = explain(error);
      }
    }
    if (v2NowWork && !v2ProposalLoadError) {
      try {
        v2ObjectNarrations = projectPluginObjectNarrations(v2Objects, v2NowWork.generatedAt);
      } catch (error) {
        v2StatusNarrationLoadError = explain(error);
      }
    }
    if (!v2ReentryLoadError && v2ProposalLoadError) v2ReentryLoadError = v2ProposalLoadError;
    if (!v2ReentryLoadError && v2AuditLoadError) v2ReentryLoadError = v2AuditLoadError;
    if (!v2ReentryLoadError && v2RelationLoadError) v2ReentryLoadError = v2RelationLoadError;
    if (!v2TaskReentryLoadError && v2ProposalLoadError) v2TaskReentryLoadError = v2ProposalLoadError;
    if (!v2TaskReentryLoadError && v2AuditLoadError) v2TaskReentryLoadError = v2AuditLoadError;
    if (!v2TaskReentryLoadError && v2PrimaryAnchorLoadError) v2TaskReentryLoadError = v2PrimaryAnchorLoadError;
  }
  if (workspace === "governance") {
    const now = new Date().toISOString();
    const client = serviceRuntimeClient;
    if (serviceConnection.status !== "READY" || !isAgentGovernanceUiClient(client)) {
      agentGovernance = {
        status: "error",
        error: "Agent 治理服务尚未就绪。请先在系统状态中恢复 Local Service 连接。",
        mode: "EXPERIMENT",
        automaticWritesPaused: true,
        observationEnabled: false,
        expandedContextEnabled: false,
        globalWritesPaused: false,
        view: agentGovernanceView,
        range: agentGovernanceRange,
        decisionFilter: agentDecisionFilter,
        decisionSearch: agentDecisionSearch,
        decisions: [], rules: [], signals: [], events: [], selectedDecisionIds: [],
        batchMode: agentBatchFeedbackMode,
        settingsOpen: agentGovernanceSettingsOpen,
        exportMenuOpen: agentExportMenuOpen,
        now,
      };
    } else {
      try {
        const [decisions, rules, signals, settings] = await Promise.all([
          client.listAgentDecisions({ limit: 100 }),
          client.listAgentRuleAuthorizations(),
          client.listAgentReviewSignals({ limit: 100 }),
          client.getAgentGovernanceSettings(),
        ]);
        const validDecisionIds = new Set(decisions.map((decision) => decision.decisionId));
        agentSelectedDecisionIds = new Set([...agentSelectedDecisionIds].filter((decisionId) => validDecisionIds.has(decisionId)));
        if (agentSelectedDecisionId && !validDecisionIds.has(agentSelectedDecisionId)) agentSelectedDecisionId = undefined;
        const selectedDecision = decisions.find((decision) => decision.decisionId === agentSelectedDecisionId);
        const events = selectedDecision ? await client.listAgentDecisionEvents(selectedDecision.threadId) : [];
        agentGovernance = {
          status: "ready",
          mode: "EXPERIMENT",
          automaticWritesPaused: true,
          observationEnabled: settings.observationEnabled,
          expandedContextEnabled: settings.expandedContextEnabled,
          globalWritesPaused: settings.globalWritesPaused,
          view: agentGovernanceView,
          range: agentGovernanceRange,
          decisionFilter: agentDecisionFilter,
          decisionSearch: agentDecisionSearch,
          decisions,
          rules,
          signals,
          events,
          ...(agentSelectedDecisionId ? { selectedDecisionId: agentSelectedDecisionId } : {}),
          selectedDecisionIds: [...agentSelectedDecisionIds],
          batchMode: agentBatchFeedbackMode,
          settingsOpen: agentGovernanceSettingsOpen,
          exportMenuOpen: agentExportMenuOpen,
          ...(agentFeedbackExpandedDecisionId ? {
            expandedFeedbackDecisionId: agentFeedbackExpandedDecisionId,
            ...(agentFeedbackExpandedRating ? { expandedFeedbackRating: agentFeedbackExpandedRating } : {}),
          } : {}),
          feedbackBusy: agentFeedbackBusy,
          mutationBusy: agentGovernanceMutationBusy,
          ...(agentExportBusy ? { exportBusy: agentExportBusy } : {}),
          now,
        };
      } catch (error) {
        agentGovernance = {
          status: "error",
          error: explain(error),
          mode: "EXPERIMENT",
          automaticWritesPaused: true,
          observationEnabled: false,
          expandedContextEnabled: false,
          globalWritesPaused: false,
          view: agentGovernanceView,
          range: agentGovernanceRange,
          decisionFilter: agentDecisionFilter,
          decisionSearch: agentDecisionSearch,
          decisions: [], rules: [], signals: [], events: [], selectedDecisionIds: [...agentSelectedDecisionIds],
          batchMode: agentBatchFeedbackMode,
          settingsOpen: agentGovernanceSettingsOpen,
          exportMenuOpen: agentExportMenuOpen,
          now,
        };
      }
    }
  }
  const v2CandidateSourcePreviews = await loadV2CandidateSourcePreviews(v2Candidates);
  let v2WorksitePreviews: Record<string, { expanded: boolean; state: WorksitePreviewState; mode?: WorksitePreviewMode }> | undefined;
  if (v2NowWork) {
    const items = [...v2NowWork.focus, ...v2NowWork.next, ...v2NowWork.waitingReview];
    const byObjectId = new Map<string, { objectId: string; version: number; primaryAnchorExternalId?: string }>();
    for (const item of items) {
      const existing = byObjectId.get(item.objectId);
      if (!existing || (!existing.primaryAnchorExternalId && item.primaryAnchorExternalId)) {
        byObjectId.set(item.objectId, {
          objectId: item.objectId,
          version: item.version,
          ...(item.primaryAnchorExternalId ? { primaryAnchorExternalId: item.primaryAnchorExternalId } : {}),
        });
      }
    }
    lastNowWorkItems = [...byObjectId.values()];
    worksitePreviewController.refreshFrom([...lastNowWorkItems]);
    worksiteChangeRouter.setTrackedAnchors(lastNowWorkItems.map((item) => ({
      objectId: item.objectId,
      ...(item.primaryAnchorExternalId ? { anchor: item.primaryAnchorExternalId } : {}),
    })));
    lastNowWorkFocusIds = new Set(v2NowWork.focus.map((item) => item.objectId));
    v2WorksitePreviews = {};
    for (const item of lastNowWorkItems) {
      if (!item.primaryAnchorExternalId) continue;
      const previewMode = worksitePreviewController.expandedMode(item.objectId);
      v2WorksitePreviews[item.objectId] = {
        expanded: worksitePreviewController.isExpanded(item.objectId),
        state: worksitePreviewController.state(item.objectId, item.primaryAnchorExternalId, item.version, previewMode),
        mode: previewMode,
      };
    }
    const prefetched = new Set<string>();
    for (const item of v2NowWork.focus) {
      if (!item.primaryAnchorExternalId || prefetched.has(item.objectId)) continue;
      prefetched.add(item.objectId);
      worksitePreviewController.prefetch(item.objectId, item.primaryAnchorExternalId, item.version);
    }
    for (const item of lastNowWorkItems) {
      if (!item.primaryAnchorExternalId || lastNowWorkFocusIds.has(item.objectId)) continue;
      if (!worksitePreviewController.isExpanded(item.objectId)) continue;
      const mode = worksitePreviewController.expandedMode(item.objectId);
      const state = worksitePreviewController.state(item.objectId, item.primaryAnchorExternalId, item.version, mode);
      if (state.status !== "stale" && state.status !== "idle") continue;
      void worksitePreviewController.load(item.objectId, item.primaryAnchorExternalId, item.version, mode);
    }
  }
  toolbarFacts = {
    ...(v2NowWork ? { nowWork: v2NowWork } : {}),
    proposals: v2Proposals,
    semanticCommits: v2SemanticCommits,
    available: serviceConnection.status === "READY" && !v2ProposalLoadError && !v2AuditLoadError,
  };
  updateToolbarIntervention();
  const outcome = createScopedOutcome({
    actionId: currentUiActionId,
    scope: activeOutcomeScope({ workspace, ...(actionDialog?.kind ? { actionDialogKind: actionDialog.kind } : {}) }),
    ...(message ? { message } : {}),
    ...(latestError ? { error: latestError } : {}),
    ...(recentActionCommitId ? { commitId: recentActionCommitId } : {}),
    recoveryRequired: v2SemanticCommits.some((commit) => commit.status === "RECOVERY_REQUIRED"),
  });
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
    ...(outcome ? { outcome } : {}),
    ...(actionDialog ? { actionDialog } : {}),
    runtime: {
      pluginVersion: diagnostics.snapshot().plugin_version,
      runtimeStatus: diagnostics.snapshot().runtime_status,
      storeStatus: diagnostics.snapshot().store_status,
      currentGraph: diagnostics.snapshot().current_graph,
    },
    v2AreaAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2AreaBusy,
    v2Objects,
    v2PrimaryAnchors: [...primaryAnchorByObject.values()],
    v2FocusSelections,
    v2DirectoryFilter,
    v2Associations,
    v2PrimaryOwnerships,
    ...(v2RelationLoadError ? { v2RelationLoadError } : {}),
    v2AssociationAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2AssociationBusy: v2AssociationSubmission.busy,
    v2OwnershipCommitBusy,
    v2BlockConditionBusy,
    v2ConditionUndoBusy,
    ...(v2ConditionUndoPreparation ? { v2ConditionUndoPreparation } : {}),
    v2LifecycleCommitBusy,
    v2StructureCommitBusy,
    v2ProjectCreationCommitBusy,
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
    v2MigrationScan: migrationScanController.snapshot(),
    v2MigrationScanAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.migration
      && isMigrationScanClient(serviceRuntimeClient),
    v2MigrationExecution: migrationExecutionController.snapshot(),
    v2MigrationExecutionAvailable: serviceConnection.status === "READY"
      && serviceConnection.formalWritesAvailable
      && serviceConnection.capabilities.migration
      && isMigrationExecutionClient(serviceRuntimeClient),
    v2BackupRestore: backupRestoreController.snapshot(),
    v2BackupRestoreAvailable: serviceConnection.status === "READY"
      && serviceConnection.formalWritesAvailable
      && Boolean(serviceLifecycleSession)
      && isBackupRestoreClient(serviceRuntimeClient),
    v2SemanticCommits,
    v2CandidatePanel,
    v2CandidateAvailable: serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
    v2ProviderAvailable: serviceConnection.status === "READY" && serviceConnection.capabilities.provider && Boolean(serviceRuntimeClient),
    v2ProviderState,
    v2ProviderRevisionBusy,
    v2ProjectNarrationBusy,
    v2ProjectClosureEvidenceBusy,
    ...(v2ProjectClosureEvidence ? { v2ProjectClosureEvidence } : {}),
    v2ProjectClosureProposalAvailable: serviceConnection.status === "READY"
      && serviceConnection.formalWritesAvailable
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.createProjectClosureProposal),
    v2ProjectClosureProposalBusy,
    ...(v2ProjectClosureProposalMessage ? { v2ProjectClosureProposalMessage } : {}),
    ...(v2ProjectClosureUserJudgments ? { v2ProjectClosureUserJudgments } : {}),
    ...(v2ProjectClosureDraftFields ? { v2ProjectClosureDraftFields } : {}),
    ...(v2LowRiskApplyBusyProposalId ? { v2LowRiskApplyBusyProposalId } : {}),
    reviewMode,
    ...(v2NowWork ? { v2NowWork } : {}),
    ...(v2AttentionNowPilot ? { v2AttentionNowPilot } : {}),
    v2NowWorkTypeFilter,
    v2NowWorkGrouping,
    ...(v2ProjectReentryCards !== undefined ? { v2ProjectReentryCards } : {}),
    ...(v2TaskReentryCards !== undefined ? { v2TaskReentryCards } : {}),
    ...(v2TaskReentryLoadError ? { v2TaskReentryLoadError } : {}),
    ...(v2WorksitePreviews ? { v2WorksitePreviews, v2NowWorkOverflowOpen: worksitePreviewController.isOverflowOpen() } : {}),
    v2ProjectContextRecovery: projectContextRecoveryController.snapshot(),
    v2MiniProjectGrill: miniProjectGrillController.snapshot(),
    v2MiniProjectGrillAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.grillMiniProject),
    v2MiniProjectGrillPreviewAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.previewMiniProjectGrill),
    v2MiniProjectGrillProposalAvailable: serviceConnection.status === "READY"
      && serviceConnection.formalWritesAvailable
      && Boolean(serviceRuntimeClient?.createMiniProjectRestructureProposal),
    v2ProjectCreationGrill: projectCreationGrillController.snapshot(),
    v2ProjectCreationGrillAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.grillProjectCreation),
    v2ProjectCreationPreviewAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && Boolean(serviceRuntimeClient?.previewProjectCreation),
    v2ProjectCreationProposalAvailable: serviceConnection.status === "READY"
      && serviceConnection.formalWritesAvailable
      && Boolean(serviceRuntimeClient?.createProjectCreationProposal),
    v2CreationSession: creationSessionController.snapshot(),
    v2CreationSessionAvailable: serviceConnection.status === "READY"
      && serviceConnection.capabilities.provider
      && isCreationSessionClient(serviceRuntimeClient),
    ...(v2ReentryTargetObjectId ? { v2ReentryTargetObjectId } : {}),
    ...(v2ReentryLoadError ? { v2ReentryLoadError } : {}),
    ...(v2ObjectNarrations !== undefined ? { v2ObjectNarrations } : {}),
    ...(v2StatusNarrationLoadError ? { v2StatusNarrationLoadError } : {}),
    ...(v2ProposalLoadError ? { v2ProposalLoadError } : {}),
    ...(v2AuditLoadError ? { v2AuditLoadError } : {}),
    ...(originRoute ? { originReturnLabel: originRoute.kind === "BLOCK" ? "返回原内容" as const : "返回原页面" as const } : {}),
    ...(v2MigrationLoadError ? { v2MigrationLoadError } : {}),
    ...(pageContext ? { pageContext } : {}),
    ...(serviceLifecycleSession
      ? { v2ManagedRuntimeState: "RUNNING" as const }
      : runtimeEndedByUser
        ? { v2ManagedRuntimeState: "ENDED" as const }
        : {}),
    ...(agentGovernance ? { agentGovernance } : {}),
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
}): Promise<boolean> {
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
    return true;
  } catch (error) {
    operationalLogger.log(
      "warn",
      "attention-shadow",
      "attention_shadow_cycle_failed",
      { result: "shadow_unchanged" },
      error,
    );
    return false;
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

function recordAttentionNowPilotActed(signalId?: string): void {
  if (!signalId) return;
  try {
    const result = attentionShadowSession.markNowPilotActed({
      signalId,
      recordedAt: new Date().toISOString(),
    });
    const quality = attentionShadowSession.nowPilotQuality();
    operationalLogger.log("info", "attention-shadow", "attention_now_pilot_acted", {
      actionId: "attention-primary-action",
      command: result.signalType,
      result: "primary_action_completed_session_only_measurement",
      attentionPilotShownCount: quality.shown,
      attentionPilotActedCount: quality.acted,
      attentionPilotLaterCount: quality.later,
      attentionPilotNotRelevantCount: quality.notRelevant,
      attentionPilotUnresolvedCount: quality.unresolved,
    });
  } catch (error) {
    operationalLogger.log(
      "warn",
      "attention-shadow",
      "attention_now_pilot_action_not_recorded",
      { result: "primary_action_preserved" },
      error,
    );
  }
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
  if (!featureReady && !runtimeEndedByUser) {
    root.innerHTML = await fullDiagnosticsHtml();
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
  abandonV2RebindCaptureWithoutResume();
  if (v2RebindPanel.status !== "idle") v2RebindPanel = { status: "idle" };
  if (v2CandidatePanel.status !== "idle") v2CandidatePanel = { status: "idle" };
  if (v2ProviderState.status === "loading") {
    v2ProviderState = {
      status: "error",
      message: "这次整理被连接中断。正文和正式状态没有变化，你可以在连接恢复后重试。",
    };
  }
  v2ProjectClosureEvidence = undefined;
  v2ProjectClosureProposalBusy = false;
  v2ProjectClosureProposalMessage = undefined;
  v2ProjectClosureUserJudgments = undefined;
  v2ProjectClosureDraftFields = undefined;
  projectContextRecoveryController.clear();
  miniProjectGrillController.clear();
  projectCreationGrillController.clear();
  creationSessionController.clear();
  backupRestoreController.clear();
  migrationScanController.clear();
  migrationExecutionController.clear();
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
  void projectPageHeadActionController.refreshAll();
}

async function refreshRestrictedGraphSwitchSurface(): Promise<void> {
  await projectPageHeadActionController.refreshAll();
  if (logseq.isMainUIVisible) await refresh();
  else await refreshMountedDiagnostics();
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

async function collectFullDiagnostics() {
  const base = diagnostics.snapshot();
  let pendingSemanticCommits: number | "unavailable" = "unavailable";
  let recoveryRequiredCommits: number | "unavailable" = "unavailable";
  let sourceAnchorConflicts: number | "unavailable" = "unavailable";
  let anchorIssueNarrations: PluginAnchorIssueNarration[] | "unavailable" = "unavailable";
  if (serviceConnection.status === "READY" && serviceRuntimeClient) {
    try {
      const commits = await serviceRuntimeClient.listSemanticCommits();
      pendingSemanticCommits = commits.filter((commit) => commit.status === "PENDING").length;
      recoveryRequiredCommits = commits.filter((commit) => commit.status === "RECOVERY_REQUIRED").length;
    } catch (error) {
      operationalLogger.log("warn", "query-refresh", "v2_diagnostics_facts_unavailable", { result: "unavailable", errorCode: explain(error) });
    }
    try {
      const anchors = await listAllPrimaryAnchors(serviceRuntimeClient);
      sourceAnchorConflicts = anchors.filter((anchor) => anchor.status === "missing" || anchor.status === "conflict").length;
      let objects: Awaited<ReturnType<ServiceRuntimeClient["listObjects"]>> = [];
      try {
        objects = await serviceRuntimeClient.listObjects();
      } catch (error) {
        operationalLogger.log("warn", "query-refresh", "v2_anchor_object_facts_unavailable", { result: "partial", errorCode: explain(error) });
      }
      anchorIssueNarrations = projectPluginAnchorIssueNarrations(objects, anchors, new Date().toISOString());
    } catch (error) {
      operationalLogger.log("warn", "query-refresh", "v2_anchor_narration_unavailable", { result: "unavailable", errorCode: explain(error) });
    }
  }
  const snapshot = {
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
  return { snapshot, anchorIssueNarrations };
}

async function fullDiagnosticsSnapshot() {
  return (await collectFullDiagnostics()).snapshot;
}

async function fullDiagnosticsHtml(): Promise<string> {
  const { snapshot, anchorIssueNarrations } = await collectFullDiagnostics();
  return renderDiagnostics(snapshot, anchorIssueNarrations);
}

async function refreshMountedDiagnostics(): Promise<void> {
  const root = appRoot ?? document.getElementById(MAIN_UI_ROOT_ID);
  if (!root?.querySelector(".diagnostics-shell")) return;
  root.innerHTML = await fullDiagnosticsHtml();
}

async function refreshServiceRuntime(descriptorPath: unknown): Promise<void> {
  if (runtimeEndedByUser) {
    enterRestrictedServiceMode("SERVICE_ENDED_BY_USER", "本次 Task Copilot 已安全结束；Logseq 正文仍可正常编辑。");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    featureReady = false;
    return;
  }
  const generation = ++serviceDiscoveryGeneration;
  restoreRecoveryStatus = undefined;
  restoreRecoveryApply = undefined;
  restoreRecoveryPrepared = false;
  enterRestrictedServiceMode("SERVICE_DISCOVERY_IN_PROGRESS", "Local Service 正在重新发现；正式写入暂停。");
  const configuredDescriptor = typeof descriptorPath === "string" ? descriptorPath : undefined;
  configuredServiceDescriptorPath = configuredDescriptor;
  if (!currentGraphKey) {
    enterRestrictedServiceMode("GRAPH_IDENTITY_PENDING", "Logseq 尚未提供当前 Graph 身份；正式写入保持关闭。");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    featureReady = false;
    return;
  }
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
  restoreRecoveryStatus = runtime.restoreRecovery;
  restoreRecoveryApply = runtime.restoreRecoveryApply;
  if (runtime.restoreRecovery?.state !== "RECOVERY_REQUIRED" || !runtime.restoreRecoveryApply) {
    restoreRecoveryPrepared = false;
    restoreRecoveryBusy = false;
  }
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

async function recoverConfiguredServiceRuntime(descriptorPath: unknown): Promise<boolean> {
  return recoverServiceRuntime({
    refresh: () => refreshServiceRuntime(descriptorPath),
    ready: () => serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient),
  });
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
  if (next && !managedRuntimeAllowsAutomaticRecovery({ runtimeEndedByUser })) {
    await next.release().catch(() => undefined);
    return;
  }
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
        void recoverConfiguredServiceRuntime(descriptorPath)
          .then(async (recovered) => {
            featureReady = recovered;
            diagnostics.setStoreStatus(featureReady ? "READY" : "READ_ONLY_SAFE_MODE");
            message = recovered
              ? "Task Copilot 本地运行环境已自动恢复；正式能力重新可用。"
              : "Task Copilot 本地运行环境仍不可用；正文保持可编辑，正式写入继续暂停。";
            await refreshToolbarInterventionFacts();
            await projectPageHeadActionController.refreshAll();
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
  const agentGovernanceQueue = new AgentGovernanceChangeQueue<{ changedBlockId: string; changedBlockCount: number }>({
    delayMs: 3_000,
    maximumPendingRoots: 32,
    process: async (input, signal) => {
      const client = serviceRuntimeClient;
      if (!client?.observeAgentGovernanceChange) throw new Error("AGENT_GOVERNANCE_SERVICE_UNAVAILABLE");
      const result = await client.observeAgentGovernanceChange(input, signal);
      operationalLogger.log("info", "source-resolution", "agent_observation_processed", {
        blockUuid: input.changedBlockId,
        result: result.status.toLowerCase(),
      });
    },
    onIssue: (issue) => operationalLogger.log("warn", "source-resolution", "agent_observation_issue", {
      result: "isolated",
      errorCode: issue.code,
      ...(issue.sourceRootId ? { blockUuid: issue.sourceRootId } : {}),
    }),
  });
  agentGovernanceChangeQueue = agentGovernanceQueue;
  cleanupHooks.push(registerExplicitSyncEvents(logseq as unknown as ExplicitSyncEventHost, explicitSyncController, {
    onGraphBlocksChanged: (blocks) => {
      worksiteChangeRouter.handleChangedBlocks(blocks);
      const seen = new Set<string>();
      for (const value of blocks) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const uuid = (value as { uuid?: unknown }).uuid;
        if (typeof uuid !== "string" || !uuid.trim() || seen.has(uuid)) continue;
        seen.add(uuid);
        agentGovernanceQueue.enqueue(uuid, { changedBlockId: uuid, changedBlockCount: blocks.length });
      }
      operationalLogger.log("info", "source-resolution", "worksite_change_event", { signalRawCount: blocks.length });
    },
  }));
  cleanupHooks.push(() => {
    agentGovernanceQueue.dispose();
    if (agentGovernanceChangeQueue === agentGovernanceQueue) agentGovernanceChangeQueue = undefined;
  });
  const reconciliationTimer = globalThis.setInterval(() => {
    void explicitSyncController?.reconcileKnownAnchors();
  }, 5 * 60 * 1000);
  cleanupHooks.push(() => globalThis.clearInterval(reconciliationTimer));
  cleanupHooks.push(() => {
    graphReadBridgeController.stop();
    abandonV2RebindCaptureWithoutResume();
    explicitSyncController?.dispose();
    explicitSyncController = undefined;
    serviceRuntimeClient = undefined;
  });
}

function downloadAgentGovernancePackage(value: AgentGovernanceExportPackage): void {
  const download = buildAgentGovernancePackageDownload(value);
  downloadTextFile(download.filename, download.content, download.type);
}

function dialogField(name: string): string {
  const element = requireAppRoot().querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-field="${name}"]`);
  return element?.value.trim() ?? "";
}

function dialogChecked(name: string): boolean {
  return requireAppRoot().querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.checked === true;
}

const creationAnswerStates = new Set<CreationAnswerState>(["ANSWERED", "ACCEPTED_RECOMMENDATION", "SKIPPED", "UNCERTAIN", "UNANSWERED"]);

function parseCreationStart(value: string): { targetType: "MINI_PROJECT" | "PROJECT"; primarySource: { kind: "BLANK" } | { kind: "PAGE" | "BLOCK"; target: string } } {
  const [targetType, sourceKind, ...targetParts] = value.split(":");
  if (targetType !== "MINI_PROJECT" && targetType !== "PROJECT") throw new Error("创建目标已失效；没有建立会话。");
  if (sourceKind === "BLANK") return { targetType, primarySource: { kind: "BLANK" } };
  const target = targetParts.join(":").trim();
  if ((sourceKind !== "PAGE" && sourceKind !== "BLOCK") || !target) throw new Error("创建来源已失效；没有建立会话。");
  return { targetType, primarySource: { kind: sourceKind, target } };
}

const agentFeedbackRatings = new Set<AgentFeedbackRating>(["CORRECT", "MOSTLY_CORRECT", "WRONG"]);
const agentFeedbackCorrectionTypes = new Set<AgentFeedbackCorrectionType>(["SHOULD_KEEP_ORDINARY", "SHOULD_CREATE_OBJECT", "SHOULD_UPDATE_EXISTING", "SHOULD_DEFER", "WRONG_TARGET", "TOO_AGGRESSIVE", "TOO_CONSERVATIVE", "RISK_TOO_HIGH", "RISK_TOO_LOW", "OTHER"]);
const agentFeedbackActions = new Set<AgentFeedbackAction>(["THIS_DECISION_ONLY", "RECORD_RULE_FEEDBACK", "PAUSE_RULE_AUTOMATION"]);

function readAgentFeedback(prefix: "agent-feedback" | "agent-bulk-feedback"): AgentFeedbackInput {
  const rawRating = dialogField(`${prefix}-rating`) as AgentFeedbackRating;
  const rawCorrectionType = dialogField(`${prefix}-correction-type`) as AgentFeedbackCorrectionType;
  const rawAction = dialogField(`${prefix}-action`) as AgentFeedbackAction;
  const note = dialogField(`${prefix}-note`);
  if (!agentFeedbackRatings.has(rawRating) || !agentFeedbackActions.has(rawAction)) throw new Error("Agent 反馈选项无效；没有记录反馈。");
  if (rawCorrectionType && !agentFeedbackCorrectionTypes.has(rawCorrectionType)) throw new Error("Agent 修正类型无效；没有记录反馈。");
  return {
    rating: rawRating,
    ...(rawCorrectionType ? { correctionType: rawCorrectionType } : {}),
    ...(note ? { note } : {}),
    action: rawAction,
  };
}

function dialogSelectedVersion(name: string): number | undefined {
  const value = requireAppRoot().querySelector<HTMLSelectElement>(`[data-field="${name}"]`)?.selectedOptions[0]?.dataset.version;
  if (!value) return undefined;
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

function migrationReviewDate(value: string, label: string): string {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`请填写有效的${label}。`);
  return date.toISOString();
}

function migrationReviewCondition(token: string): V2Condition {
  const kind = dialogField(`migrationDecisionCondition:${token}`);
  if (kind === "ACTIONABLE") return { kind: "ACTIONABLE" };
  if (kind === "WAITING") {
    const waitingFor = dialogField(`migrationDecisionWaitingFor:${token}`);
    const expectedResult = dialogField(`migrationDecisionExpectedResult:${token}`);
    const reviewAt = dialogField(`migrationDecisionReviewAt:${token}`);
    if (!waitingFor || !expectedResult) throw new Error("等待状态需要填写等待对象和期待结果。");
    return { kind: "WAITING", waitingFor, expectedResult, reviewAt: migrationReviewDate(reviewAt, "复查时间") };
  }
  if (kind === "BLOCKED") {
    const reason = dialogField(`migrationDecisionReason:${token}`);
    if (!reason) throw new Error("被问题卡住时需要填写具体原因。");
    return { kind: "BLOCKED", reason };
  }
  if (kind === "PAUSED") {
    const reason = dialogField(`migrationDecisionReason:${token}`);
    const reviewAt = dialogField(`migrationDecisionReviewAt:${token}`);
    if (!reason) throw new Error("主动暂停时需要填写具体原因。");
    return { kind: "PAUSED", reason, ...(reviewAt ? { reviewAt: migrationReviewDate(reviewAt, "复查时间") } : {}) };
  }
  throw new Error("请选择迁移后的当前状态。");
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
  if (action === "v2-worksite-expand-full" || action === "v2-worksite-refresh" || action === "v2-worksite-collapse") {
    const [objectId, anchor, rawVersion] = (value ?? "").split("|");
    const version = Number(rawVersion);
    if (action === "v2-worksite-collapse") {
      if (!objectId) {
        await refresh();
        return;
      }
      worksitePreviewController.setExpanded(objectId, false);
      await refresh();
      return;
    }
    if (!objectId || !anchor || !Number.isSafeInteger(version)) {
      await refresh();
      return;
    }
    if (action === "v2-worksite-expand-full") worksitePreviewController.setExpandedMode(objectId, "full");
    else worksitePreviewController.invalidate(objectId);
    const item = lastNowWorkItems.find((candidate) => (
      candidate.objectId === objectId
      && candidate.primaryAnchorExternalId === anchor
      && candidate.version === version
    ));
    if (!item) {
      await refresh();
      return;
    }
    const mode: WorksitePreviewMode = action === "v2-worksite-expand-full"
      ? "full"
      : worksitePreviewController.isExpanded(objectId) ? "full" : "short";
    const startedAt = Date.now();
    const state = await worksitePreviewController.load(objectId, anchor, version, mode);
    operationalLogger.log("info", "query-refresh", "worksite_manual_reload", {
      objectId,
      result: state.status,
      durationMs: Date.now() - startedAt,
      ...worksiteMetricsFields(),
    });
    await refresh();
    return;
  }
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
      await projectPageHeadActionController.refreshAll();
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
  if (action === "migration-scan-local") {
    if (migrationScanController.snapshot().status === "loading") return;
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isMigrationScanClient(client) || serviceConnection.status !== "READY" || !serviceConnection.capabilities.migration) {
      migrationScanController.rejectInput("当前知识库的迁移检查暂不可用；没有读取或保存任何文件。");
      await refresh();
      return;
    }
    const input = requireAppRoot().querySelector<HTMLInputElement>('[data-field="migrationRecoveryBundleFile"]');
    const file = input?.files?.[0];
    if (!file) {
      migrationScanController.rejectInput("请选择 V1 Recovery Bundle JSON 文件；没有读取或保存。");
      await refresh();
      return;
    }
    if (file.size < 2 || file.size > MIGRATION_BUNDLE_MAX_BYTES) {
      migrationScanController.rejectInput("所选 Recovery Bundle 大小不在安全范围内；没有读取或保存。");
      await refresh();
      return;
    }
    let rawBundle: string;
    try {
      rawBundle = await file.text();
    } catch {
      migrationScanController.rejectInput("所选 Recovery Bundle 无法读取；没有保存任何内容。");
      await refresh();
      return;
    }
    const scanning = migrationScanController.scan(client, rawBundle);
    await refresh();
    await scanning.catch(() => undefined);
    await refresh();
    return;
  }
  if (action === "migration-scan-clear") {
    migrationScanController.clear();
    message = "已放弃本次迁移材料；当前会话不再保留其内容。";
    latestError = undefined;
    await refresh();
    return;
  }
  if (action === "migration-import-open" && value) {
    latestError = undefined;
    message = undefined;
    try {
      migrationExecutionController.beginMaterial(value);
    } catch (error) {
      latestError = explain(error);
    }
    await refresh();
    return;
  }
  if (action === "migration-import-clear") {
    migrationExecutionController.clear();
    latestError = undefined;
    message = "已放弃本次批次准备；当前会话不再保留材料、范围或恢复点引用。";
    await refresh();
    return;
  }
  if (action === "migration-import-material") {
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isMigrationExecutionClient(client) || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable || !serviceConnection.capabilities.migration) {
      latestError = "当前知识库的迁移执行环境尚未就绪；没有读取材料、创建恢复点或导入正式对象。";
      await refresh();
      return;
    }
    const input = requireAppRoot().querySelector<HTMLInputElement>('[data-field="migrationImportBundleFile"]');
    const file = input?.files?.[0];
    if (!file) {
      latestError = "请选择创建这项计划时使用的 Recovery Bundle JSON；没有读取或保存。";
      await refresh();
      return;
    }
    if (file.size < 2 || file.size > MIGRATION_BUNDLE_MAX_BYTES) {
      latestError = "所选 Recovery Bundle 大小不在安全范围内；没有创建恢复点或导入正式对象。";
      await refresh();
      return;
    }
    let rawBundle: string;
    try {
      rawBundle = await file.text();
    } catch {
      latestError = "所选 Recovery Bundle 无法读取；没有创建恢复点或导入正式对象。";
      await refresh();
      return;
    }
    const loading = migrationExecutionController.loadMaterial(client, rawBundle);
    await refresh();
    await loading.catch(() => {
      latestError = migrationExecutionController.snapshot().message ?? "迁移材料暂时无法核对；没有导入正式对象。";
    });
    await refresh();
    return;
  }
  if (action === "migration-import-recovery") {
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isMigrationExecutionClient(client) || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      latestError = "当前知识库的恢复点服务尚未就绪；没有导入正式对象。";
      await refresh();
      return;
    }
    const itemTokens = Array.from(requireAppRoot().querySelectorAll<HTMLInputElement>('[data-field^="migrationImportItem:"]:checked'))
      .map((input) => input.value);
    const creating = migrationExecutionController.createRecoveryPoint(client, itemTokens);
    await refresh();
    await creating.catch(() => {
      latestError = migrationExecutionController.snapshot().message ?? "恢复点暂时无法创建；没有导入正式对象。";
    });
    await refresh();
    return;
  }
  if (action === "migration-import-commit") {
    latestError = undefined;
    message = undefined;
    const confirmed = requireAppRoot().querySelector<HTMLInputElement>('[data-field="migrationImportConfirm"]')?.checked === true;
    if (!confirmed) {
      latestError = "请先确认本批范围和恢复点；没有导入正式对象。";
      await refresh();
      return;
    }
    const client = serviceRuntimeClient;
    if (!isMigrationExecutionClient(client) || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      latestError = "当前知识库的迁移执行环境尚未就绪；没有提交新请求。";
      await refresh();
      return;
    }
    const importing = migrationExecutionController.importBatch(client);
    await refresh();
    await importing.catch(() => {
      latestError = migrationExecutionController.snapshot().message ?? "本批结果尚未确认；请刷新台账。";
    });
    await refresh();
    return;
  }
  if (action === "migration-batch-verify" && value) {
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isMigrationExecutionClient(client) || serviceConnection.status !== "READY") {
      latestError = "当前知识库暂时无法验证迁移批次；正式状态保持不变。";
      await refresh();
      return;
    }
    const verifying = migrationExecutionController.verify(client, value);
    await refresh();
    await verifying.catch(() => {
      latestError = migrationExecutionController.snapshot().message ?? "本批验证未能确认；请刷新台账。";
    });
    await refresh();
    return;
  }
  if (action === "migration-batch-undo-open" && value) {
    latestError = undefined;
    message = undefined;
    try {
      migrationExecutionController.prepareUndo(value);
    } catch (error) {
      latestError = explain(error);
    }
    await refresh();
    return;
  }
  if (action === "migration-batch-undo") {
    latestError = undefined;
    message = undefined;
    const confirmed = requireAppRoot().querySelector<HTMLInputElement>('[data-field="migrationUndoConfirm"]')?.checked === true;
    if (!confirmed) {
      latestError = "请先确认撤销边界；没有改变正式状态。";
      await refresh();
      return;
    }
    const client = serviceRuntimeClient;
    if (!isMigrationExecutionClient(client) || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      latestError = "当前知识库暂时无法安全撤销迁移批次；没有提交新请求。";
      await refresh();
      return;
    }
    const undoing = migrationExecutionController.undo(client);
    await refresh();
    await undoing.catch(() => {
      latestError = migrationExecutionController.snapshot().message ?? "撤销结果尚未确认；请刷新台账。";
    });
    await refresh();
    return;
  }
  if (action === "migration-activate-open" && value) {
    latestError = undefined;
    message = undefined;
    try {
      migrationExecutionController.prepareActivation(value);
    } catch (error) {
      latestError = explain(error);
    }
    await refresh();
    return;
  }
  if (action === "migration-activate") {
    latestError = undefined;
    message = undefined;
    const confirmed = requireAppRoot().querySelector<HTMLInputElement>('[data-field="migrationActivateConfirm"]')?.checked === true;
    if (!confirmed) {
      latestError = "请先确认 V1 的只读交接边界；没有改变迁移状态。";
      await refresh();
      return;
    }
    const client = serviceRuntimeClient;
    if (!isMigrationExecutionClient(client) || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      latestError = "当前知识库暂时无法安全启用 V2；没有提交新请求。";
      await refresh();
      return;
    }
    const activating = migrationExecutionController.activate(client);
    await refresh();
    await activating.catch(() => {
      latestError = migrationExecutionController.snapshot().message ?? "启用结果尚未确认；请刷新台账。";
    });
    await refresh();
    return;
  }
  if (action === "migration-review-save" && value) {
    latestError = undefined;
    message = undefined;
    try {
      const selectedAction = dialogField(`migrationDecisionAction:${value}`);
      if (!["IMPORT", "KEEP_ORDINARY", "DEFER", "EXCLUDE"].includes(selectedAction)) {
        throw new Error("请选择这项材料的处理方式。");
      }
      const reviewNote = dialogField(`migrationDecisionNote:${value}`);
      let input: PluginMigrationDecisionInput;
      if (selectedAction === "IMPORT") {
        const objectType = dialogField(`migrationDecisionObjectType:${value}`);
        const lifecycle = dialogField(`migrationDecisionLifecycle:${value}`);
        if (!["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"].includes(objectType)) {
          throw new Error("请选择迁移后的对象类型。");
        }
        if (!["OPEN", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(lifecycle)) {
          throw new Error("请选择迁移后的生命周期。");
        }
        input = {
          action: "IMPORT",
          objectType: objectType as V2ObjectType,
          lifecycle: lifecycle as Lifecycle,
          condition: migrationReviewCondition(value),
          ...(reviewNote ? { reviewNote } : {}),
        };
      } else {
        input = {
          action: selectedAction as Exclude<PluginMigrationDecisionInput["action"], "IMPORT">,
          ...(reviewNote ? { reviewNote } : {}),
        };
      }
      migrationScanController.saveDecision(value, input);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      latestError = /^(请|等待状态|被问题卡住|主动暂停|这项|找不到|迁移材料|迁移计划|正在)/.test(detail)
        ? detail
        : "这项判断还不完整；请核对处理方式、迁移状态和判断依据。";
    }
    await refresh();
    return;
  }
  if (action === "migration-review-preview") {
    if (migrationScanController.snapshot().previewStatus === "loading") return;
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isMigrationScanClient(client) || serviceConnection.status !== "READY" || !serviceConnection.capabilities.migration) {
      latestError = "当前知识库的迁移计划审阅暂不可用；没有导入正式对象。";
      await refresh();
      return;
    }
    const previewing = migrationScanController.createPreview(client);
    await refresh();
    await previewing.catch((error) => {
      if (migrationScanController.snapshot().previewStatus !== "uncertain") {
        latestError = error instanceof Error ? error.message : "迁移计划暂时无法创建；没有导入正式对象。";
      }
    });
    await refresh();
    return;
  }
  if (action === "v2-candidate-open") {
    workspace = "review";
    reviewMode = "candidates";
    const client = serviceRuntimeClient;
    const generation = serviceDiscoveryGeneration;
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2CandidatePanel = { status: "error", message: "Task Copilot 当前未连接到这个知识库；没有检查或修改任何内容。" };
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
        throw new Error("Task Copilot 在检查期间重新连接；本次结果已丢弃，没有修改任何内容。");
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
      v2CandidatePanel = { status: "error", message: "当前预览已经失效；没有加入待整理，也没有修改正式事项。" };
      workspace = "review";
      await refresh();
      return;
    }
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2CandidatePanel = { status: "error", message: "Task Copilot 正在重新连接；当前预览已失效，没有加入待整理。" };
      workspace = "review";
      await refresh();
      return;
    }
    if (currentPanel.serviceGeneration !== serviceDiscoveryGeneration) {
      v2CandidatePanel = { status: "error", message: "Task Copilot 已重新连接；当前预览已失效，没有修改任何内容。" };
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
        ? { status: "success", message: `${result.candidates.length} 项已加入待整理；没有创建或修改正式事项。` }
        : { status: "error", message: "Task Copilot 在保存期间重新连接；请先检查系统状态，不要立即重复提交。" };
      operationalLogger.log("info", "ui-action", "v2_candidates_persisted", { correlationId: traceId, actionId: "v2-candidate-submit", result: `success:${result.candidates.length}:replayed:${result.replayed}` });
    } catch (error) {
      v2CandidatePanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "error", message: explain(error) }
        : { status: "error", message: "Task Copilot 在保存期间重新连接；结果尚不能确认，请先检查系统状态，不要立即重试。" };
      operationalLogger.log("error", "ui-action", "v2_candidate_persistence_failed", { correlationId: traceId, actionId: "v2-candidate-submit", result: "error" }, error);
    }
    await refresh();
    return;
  }
  if ((action === "v2-candidate-later" || action === "v2-candidate-dismiss" || action === "v2-candidate-no-more") && value) {
    const [candidateId, expectedUpdatedAt] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client || !candidateId || !expectedUpdatedAt) throw new Error("这条待整理内容已经变化；没有保存本次处置。");
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
    }, action === "v2-candidate-later" ? "已安排 7 天后复查。" : action === "v2-candidate-dismiss" ? "已保留为普通内容；没有修改正式事项。" : "已记住你的选择；这段原文的同类建议不会因普通编辑再次出现。");
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
  if (action === "v2-rebind-capture") {
    const client = serviceRuntimeClient;
    const controller = explicitSyncController;
    const generation = serviceDiscoveryGeneration;
    if (!client || !controller || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2RebindPanel = { status: "error", message: "Task Copilot 服务当前不能安全应用正式修改；没有开始重新连接。" };
      await showRuntimeDiagnostics();
      return;
    }
    if (!v2RebindCaptureController.active) {
      await controller.flush();
      if (generation !== serviceDiscoveryGeneration || client !== serviceRuntimeClient) {
        v2RebindPanel = { status: "error", message: "Task Copilot 服务在准备期间重新连接；本次操作没有开始，请刷新后重试。" };
        await showRuntimeDiagnostics();
        return;
      }
    }
    v2RebindCaptureController.begin(controller);
    v2RebindPanel = value ? { status: "capturing", candidateObjectId: value } : { status: "capturing" };
    await showRuntimeDiagnostics();
    logseq.hideMainUI();
    return;
  }
  if (action === "v2-rebind-open") {
    const client = serviceRuntimeClient;
    const generation = serviceDiscoveryGeneration;
    const candidateObjectId = "candidateObjectId" in v2RebindPanel ? v2RebindPanel.candidateObjectId : undefined;
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2RebindPanel = { status: "error", message: "Task Copilot 服务当前不能安全应用正式修改；没有执行重新连接。", ...(candidateObjectId ? { candidateObjectId } : {}) };
      await showRuntimeDiagnostics();
      return;
    }
    v2RebindPanel = candidateObjectId ? { status: "loading", candidateObjectId } : { status: "loading" };
    await showRuntimeDiagnostics();
    try {
      const preview = await prepareV2PrimaryAnchorRebind(client, () => logseq.Editor.getCurrentBlock(), candidateObjectId);
      if (generation !== serviceDiscoveryGeneration || client !== serviceRuntimeClient) {
        throw new Error("Task Copilot 服务已在预览期间重新连接；旧预览已作废，没有执行写入。");
      }
      v2RebindPanel = { status: "ready", preview, serviceGeneration: generation };
    } catch (error) {
      v2RebindPanel = { status: "error", message: explain(error), ...(candidateObjectId ? { candidateObjectId } : {}) };
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-rebind-cancel") {
    if (v2RebindPanel.status === "ready" && v2RebindPanel.busy) return;
    await finishV2RebindCapture();
    v2RebindPanel = { status: "idle" };
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "v2-rebind-submit") {
    const client = serviceRuntimeClient;
    const currentPanel = v2RebindPanel;
    if (currentPanel.status === "ready" && currentPanel.busy) return;
    if (currentPanel.status !== "ready") {
      v2RebindPanel = { status: "error", message: "正文连接预览已过期或不存在；没有执行重新连接。" };
      await showRuntimeDiagnostics();
      return;
    }
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
      v2RebindPanel = { status: "error", message: "Task Copilot 服务正在重新连接或暂时不能应用修改；旧预览已作废，没有执行重新连接。" };
      await showRuntimeDiagnostics();
      return;
    }
    if (currentPanel.serviceGeneration !== serviceDiscoveryGeneration) {
      v2RebindPanel = { status: "error", message: "Task Copilot 服务已在预览后重新连接；旧预览已作废，没有执行写入。" };
      await showRuntimeDiagnostics();
      return;
    }
    const selectedCandidateToken = dialogField("v2RebindCandidateToken");
    const confirmed = dialogChecked("v2RebindConfirmed");
    v2RebindPanel = { ...currentPanel, busy: true };
    await showRuntimeDiagnostics();
    const traceId = `v2-rebind-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    try {
      const result = await submitV2PrimaryAnchorRebind(client, currentPanel.preview, selectedCandidateToken, confirmed, () => logseq.Editor.getCurrentBlock(), ensurePersistentBlockIdentity, traceId);
      v2RebindPanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "success", message: `“${result.object.text}”已重新连接到当前选中的正文；旧连接保留在历史中。`, candidateObjectId: result.object.objectId }
        : { status: "error", message: "Task Copilot 服务在应用期间重新连接；旧会话已返回成功，请先在系统状态中核对，不要立即重试。" };
      operationalLogger.log("info", "ui-action", "v2_primary_anchor_rebound", { correlationId: traceId, actionId: "v2-rebind-submit", result: "success", blockUuid: result.anchor.externalId });
    } catch (error) {
      v2RebindPanel = currentPanel.serviceGeneration === serviceDiscoveryGeneration
        ? { status: "error", message: explain(error) }
        : { status: "error", message: "Task Copilot 服务在应用期间重新连接；旧会话结果不确定，请先在系统状态中核对，不要立即重试。" };
      operationalLogger.log("error", "ui-action", "v2_primary_anchor_rebind_failed", { correlationId: traceId, actionId: "v2-rebind-submit", result: "error" }, error);
    }
    await finishV2RebindCapture();
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "recent-change-review") {
    recentActionCommitId = undefined;
    workspace = "review";
    reviewMode = "proposals";
    message = "已打开这次未完成修改的处理记录；请按当前卡片的下一步继续。";
    await refresh();
    return;
  }
  if (action === "agent-governance-view" && value) {
    if (value !== "decisions" && value !== "rules" && value !== "review") throw new Error("Agent 治理视图无效；没有改变当前页面。");
    agentGovernanceView = value;
    await refresh();
    return;
  }
  if (action === "agent-governance-range" && value) {
    if (value !== "24h" && value !== "7d") throw new Error("时间范围无效；没有改变摘要。");
    agentGovernanceRange = value;
    await refresh();
    return;
  }
  if (action === "agent-governance-settings-toggle") {
    if (value !== "toggle") throw new Error("设置入口操作无效。");
    agentGovernanceSettingsOpen = !agentGovernanceSettingsOpen;
    await refresh();
    return;
  }
  if (action === "agent-governance-batch") {
    if (value !== "toggle") throw new Error("批量模式操作无效。");
    agentBatchFeedbackMode = !agentBatchFeedbackMode;
    if (!agentBatchFeedbackMode) agentSelectedDecisionIds.clear();
    await refresh();
    return;
  }
  if (action === "agent-governance-refresh") {
    await refresh();
    return;
  }
  if (action === "agent-decision-detail" && value) {
    agentSelectedDecisionId = agentSelectedDecisionId === value ? undefined : value;
    await refresh();
    return;
  }
  if (action === "agent-decision-select" && value) {
    if (agentSelectedDecisionIds.has(value)) agentSelectedDecisionIds.delete(value);
    else agentSelectedDecisionIds.add(value);
    await refresh();
    return;
  }
  if (action === "agent-decision-selection-clear") {
    agentSelectedDecisionIds.clear();
    await refresh();
    return;
  }
  if (action === "agent-rule-pause" && value) {
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理服务尚未就绪；没有改变规则授权。");
    if (agentGovernanceMutationBusy) throw new Error("治理设置正在更新，不会重复提交。");
    const separator = value.lastIndexOf(":");
    const ruleId = separator > 0 ? value.slice(0, separator) : "";
    const operation = separator > 0 ? value.slice(separator + 1) : "";
    if (!ruleId || (operation !== "pause" && operation !== "resume")) throw new Error("规则暂停操作无效。");
    const traceId = `agent-rule-pause-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    agentGovernanceMutationBusy = true;
    await refresh();
    try {
      const result = await client.setAgentRulePaused(ruleId, { paused: operation === "pause", traceId, idempotencyKey: traceId });
      message = `规则“${result.authorization.displayName}”已${result.authorization.paused ? "暂停" : "恢复"}；Shadow 观察继续。`;
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentGovernanceMutationBusy = false;
    }
    await refresh();
    return;
  }
  if (action === "agent-global-pause" && value) {
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理服务尚未就绪；没有改变全局写入状态。");
    if (agentGovernanceMutationBusy) throw new Error("治理设置正在更新，不会重复提交。");
    if (value !== "pause" && value !== "resume") throw new Error("全局暂停操作无效。");
    const traceId = `agent-global-pause-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    agentGovernanceMutationBusy = true;
    await refresh();
    try {
      const result = await client.setAgentGlobalWritesPaused({ globalWritesPaused: value === "pause", traceId, idempotencyKey: traceId });
      message = result.settings.globalWritesPaused ? "全部 Agent 正式写入已暂停；观察和 Shadow 继续。" : "全部 Agent 写入暂停已解除；仍只按当前运行模式与逐规则授权路由。";
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentGovernanceMutationBusy = false;
    }
    await refresh();
    return;
  }
  if (action === "agent-observation-toggle" && value) {
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理服务尚未就绪；没有改变观察状态。");
    if (agentGovernanceMutationBusy) throw new Error("治理设置正在更新，不会重复提交。");
    if (value !== "enable" && value !== "disable") throw new Error("Agent 观察操作无效。");
    const traceId = `agent-observation-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    agentGovernanceMutationBusy = true;
    await refresh();
    try {
      const result = await client.setAgentObservationEnabled({ observationEnabled: value === "enable", traceId, idempotencyKey: traceId });
      if (result.settings.observationEnabled) {
        agentGovernanceChangeQueue?.requestDrain();
        message = "Agent 观察已开启；有界水位中的最新来源已开始后台补偿处理。";
      } else {
        message = "Agent 观察已关闭；基础产品保持可用，最多保留 32 个来源的最新待观察水位。";
      }
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentGovernanceMutationBusy = false;
    }
    await refresh();
    return;
  }
  if (action === "agent-expanded-context-toggle" && value) {
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理服务尚未就绪；没有改变扩展联想状态。");
    if (agentGovernanceMutationBusy) throw new Error("治理设置正在更新，不会重复提交。");
    if (value !== "enable" && value !== "disable") throw new Error("扩展联想操作无效。");
    const traceId = `agent-expanded-context-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    agentGovernanceMutationBusy = true;
    await refresh();
    try {
      const result = await client.setAgentExpandedContextEnabled({ expandedContextEnabled: value === "enable", traceId, idempotencyKey: traceId });
      message = result.settings.expandedContextEnabled
        ? "扩展联想已开启；仅在 Gate 明确要求时读取受控扩展上下文。"
        : "扩展联想已关闭；需要扩展上下文的判断会留在 LOCAL 并转人工。";
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentGovernanceMutationBusy = false;
    }
    await refresh();
    return;
  }
  if (action === "agent-source-open" && value) {
    await run(async () => openAgentDecisionSource(value));
    if (!latestError) await logseq.hideMainUI();
    return;
  }
  if (action === "agent-feedback-quick" && value) {
    const separator = value.lastIndexOf(":");
    const decisionId = value.slice(0, separator);
    const rating = value.slice(separator + 1);
    if (!decisionId || rating !== "CORRECT") throw new Error("快速反馈选项无效；没有记录反馈。");
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理服务尚未就绪；没有记录反馈。");
    if (agentFeedbackBusy) throw new Error("这条反馈正在提交，不会重复发送。");
    const feedback: AgentFeedbackInput = { rating: "CORRECT", action: "THIS_DECISION_ONLY" };
    const traceId = `agent-feedback-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    agentFeedbackBusy = true;
    await refresh();
    try {
      const result = await client.recordAgentFeedback(decisionId, { feedback, traceId, idempotencyKey: traceId });
      message = result.authorization?.paused
        ? `已记录反馈，并暂停规则“${result.authorization.displayName}”的自动化。`
        : `已记录这条 Agent 反馈${result.replayed ? "（已确认前次提交，未重复写入）" : ""}。`;
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentFeedbackBusy = false;
    }
    await refresh();
    return;
  }
  if (action === "agent-feedback-expand" && value) {
    const separator = value.lastIndexOf(":");
    const decisionId = value.slice(0, separator);
    const rating = value.slice(separator + 1);
    if (!decisionId || (rating !== "MOSTLY_CORRECT" && rating !== "WRONG")) throw new Error("反馈选项无效；没有记录反馈。");
    agentFeedbackExpandedDecisionId = decisionId;
    agentFeedbackExpandedRating = rating;
    await refresh();
    restoreUiFocus(requireAppRoot(), { field: "agent-feedback-correction-type" });
    return;
  }
  if (action === "agent-feedback-collapse" && value) {
    agentFeedbackExpandedDecisionId = undefined;
    agentFeedbackExpandedRating = undefined;
    await refresh();
    restoreUiFocus(requireAppRoot(), { action: "agent-decision-detail", value });
    return;
  }
  if (action === "agent-feedback-submit" && value) {
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理服务尚未就绪；没有记录反馈。");
    if (agentFeedbackBusy) throw new Error("这条反馈正在提交，不会重复发送。");
    const feedback = readAgentFeedback("agent-feedback");
    const traceId = `agent-feedback-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    agentFeedbackBusy = true;
    await refresh();
    try {
      const result = await client.recordAgentFeedback(value, { feedback, traceId, idempotencyKey: traceId });
      message = result.authorization?.paused
        ? `已记录反馈，并暂停规则“${result.authorization.displayName}”的自动化。`
        : `已记录这条 Agent 反馈${result.replayed ? "（已确认前次提交，未重复写入）" : ""}。`;
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentFeedbackBusy = false;
    }
    await refresh();
    return;
  }
  if (action === "agent-bulk-feedback-submit") {
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理服务尚未就绪；没有记录批量反馈。");
    if (agentFeedbackBusy) throw new Error("批量反馈正在提交，不会重复发送。");
    const decisionIds = [...agentSelectedDecisionIds];
    if (decisionIds.length < 2) throw new Error("请至少选择两条决策。");
    const feedback = readAgentFeedback("agent-bulk-feedback");
    const traceId = `agent-bulk-feedback-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;
    agentFeedbackBusy = true;
    await refresh();
    try {
      const result = await client.recordAgentBulkFeedback({ decisionIds, feedback, traceId, idempotencyKey: traceId });
      message = `已按结果、规则和风险路由分成 ${result.groups.length} 组，记录 ${result.results.length} 条反馈。`;
      agentSelectedDecisionIds.clear();
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentFeedbackBusy = false;
    }
    await refresh();
    return;
  }
  if (action === "agent-export-menu-toggle") {
    if (value !== "toggle") throw new Error("导出菜单操作无效。");
    agentExportMenuOpen = !agentExportMenuOpen;
    await refresh();
    return;
  }
  if (action === "agent-export-go") {
    const client = serviceRuntimeClient;
    if (!isAgentGovernanceUiClient(client)) throw new Error("Agent 治理导出服务尚未就绪。");
    if (agentExportBusy) throw new Error("治理证据正在导出，不会重复启动。");
    const type = dialogField("agentExportType");
    const rawDays = dialogField("agentExportRange");
    if (type !== "skill" && type !== "review") throw new Error("导出类型无效。");
    const days = Number(rawDays);
    if (!Number.isSafeInteger(days)) throw new Error("导出范围无效。");
    if (type === "skill" && days !== 30) throw new Error("Skill 反馈导出范围无效。");
    if (type === "review" && days !== 60 && days !== 180) throw new Error("复查证据导出范围无效。");
    const reviewDays: 60 | 180 = days === 180 ? 180 : 60;
    agentExportBusy = type === "skill" ? "skill" : "review";
    await refresh();
    try {
      const exported = type === "skill"
        ? await client.exportAgentSkillFeedback(30)
        : await client.exportAgentReviewEvidence(reviewDays);
      downloadAgentGovernancePackage(exported);
      message = `已生成 ${exported.manifest.includedCount} 条证据的可校验导出，共 ${exported.manifest.files.length} 个包内文件。`;
      agentExportMenuOpen = false;
    } catch (error) {
      latestError = explain(error);
    } finally {
      agentExportBusy = undefined;
    }
    await refresh();
    return;
  }
  if (action === "view" && value) {
    if (!isWorkspace(value)) throw new Error("未知工作区；没有改变当前页面。");
    recentActionCommitId = undefined;
    if (value === "reentry") v2ReentryTargetObjectId = undefined;
    workspace = value;
    await refresh();
    return;
  }
  if ((action === "creation-session-open" || action === "creation-session-create") && value) {
    actionDialog = { kind: "v2-creation-session", value };
    latestError = undefined;
    message = undefined;
    if (value === "LIST") await creationSessionController.loadActive();
    else await creationSessionController.create(parseCreationStart(value));
    return;
  }
  if (action === "creation-session-list") {
    await creationSessionController.loadActive();
    return;
  }
  if (action === "creation-session-resume" && value) {
    await creationSessionController.resume(value);
    return;
  }
  if (action === "creation-session-view" && value && ["DISCUSSION", "DRAFT", "SUMMARY", "HISTORY"].includes(value)) {
    creationSessionController.setView(value as "DISCUSSION" | "DRAFT" | "SUMMARY" | "HISTORY");
    await refresh();
    return;
  }
  if (action === "creation-session-round-start") {
    await creationSessionController.startRound();
    return;
  }
  if ((action === "creation-session-round-submit" || action === "creation-session-round-accept-all") && value) {
    const session = creationSessionController.snapshot().session;
    const round = session ? [...session.rounds].reverse().find(({ providerStatus }) => providerStatus === "NOT_REQUESTED") : undefined;
    if (!round || round.roundId !== value) throw new Error("当前问题已经变化；请以重新载入后的会话为准。");
    const answers = round.questions.map((question) => {
      const userAnswer = dialogField(`creation-answer:${question.questionId}`);
      const selected = action === "creation-session-round-accept-all"
        ? "ACCEPTED_RECOMMENDATION"
        : dialogField(`creation-answer-state:${question.questionId}`) as CreationAnswerState;
      const answerState = selected === "UNANSWERED" && userAnswer ? "ANSWERED" : selected;
      if (!creationAnswerStates.has(answerState)) throw new Error("回答状态无效；本轮没有提交。");
      if (answerState === "ANSWERED" && !userAnswer) throw new Error("标记为“已回答”的问题需要填写回答。");
      return { questionId: question.questionId, answerState, ...(userAnswer ? { userAnswer } : {}) };
    });
    await creationSessionController.submitAnswers(answers);
    return;
  }
  if (action === "creation-session-round-retry" && value) {
    await creationSessionController.retryRound(value);
    return;
  }
  if (action === "creation-session-draft-generate") {
    await creationSessionController.generateDraft();
    return;
  }
  if (action === "creation-session-draft-edit-open" && value) {
    creationSessionController.beginNodeEdit(value);
    await refresh();
    return;
  }
  if (action === "creation-session-draft-edit-cancel") {
    creationSessionController.beginNodeEdit();
    await refresh();
    return;
  }
  if (action === "creation-session-draft-edit-save" && value) {
    const [revisionId, nodeId] = value.split("|");
    const session = creationSessionController.snapshot().session;
    const revision = session?.draftRevisions.find((candidate) => candidate.revisionId === revisionId);
    const node = revision?.nodes.find((candidate) => candidate.nodeId === nodeId);
    if (!revisionId || !nodeId || !node) throw new Error("当前草稿节点已经变化；请重新载入后编辑。");
    const text = dialogField("creation-draft-text");
    const parentNodeId = node.parentNodeId ? dialogField("creation-draft-parent") : undefined;
    const edit = {
      ...(text !== node.text ? { text } : {}),
      ...(parentNodeId !== undefined && parentNodeId !== node.parentNodeId ? { parentNodeId } : {}),
    };
    if (!Object.keys(edit).length) {
      creationSessionController.beginNodeEdit();
      await refresh();
      return;
    }
    await creationSessionController.editDraft(revisionId, nodeId, edit);
    return;
  }
  if (action === "creation-session-draft-delete" && value) {
    const [revisionId, nodeId] = value.split("|");
    if (!revisionId || !nodeId || !globalThis.confirm("删除这个 Agent 新建的草稿 Block？来源材料和正式正文不会被删除。")) return;
    await creationSessionController.editDraft(revisionId, nodeId, { delete: true });
    return;
  }
  if (action === "creation-session-draft-adopt" && value) {
    await creationSessionController.adoptDraft(value);
    return;
  }
  if (action === "creation-session-placement-project") {
    const pageName = dialogField("creation-project-page-name");
    if (!pageName || pageName.includes("\n")) throw new Error("Project Page 名称不能为空或包含换行。");
    await creationSessionController.setPlacement({ kind: "NEW_PROJECT_PAGE", pageName });
    return;
  }
  if ((action === "creation-session-placement-mini-in-place" || action === "creation-session-placement-mini-child") && value) {
    await creationSessionController.setPlacement(action === "creation-session-placement-mini-in-place" ? { kind: "SOURCE_BLOCK_IN_PLACE", sourceBlockUuid: value } : { kind: "SOURCE_BLOCK_CHILD", sourceBlockUuid: value });
    return;
  }
  if (action === "creation-session-placement-page-end" && value) {
    const separator = value.indexOf("|");
    const pageId = separator >= 0 ? value.slice(0, separator) : value;
    const pageName = separator >= 0 ? value.slice(separator + 1) : value;
    if (!pageId || !pageName) throw new Error("Page 位置已经变化；请重新载入会话。");
    await creationSessionController.setPlacement({ kind: "PAGE_END", pageId, pageName });
    return;
  }
  if (action === "creation-session-placement-blank-page-end") {
    const currentPage = await logseq.Editor.getCurrentPage();
    if (!currentPage) throw new Error("当前没有可用 Page；请先打开目标 Page。");
    const pageId = RuntimeShapeAdapter.pageRef(currentPage);
    const identity = await resolveLogseqPageReference(currentPage, logseq.Editor.getPage?.bind(logseq.Editor));
    const requestedAt = new Date();
    const result = await executeGraphReadRequest({
      requestId: `creation-placement-${requestedAt.getTime()}`,
      requestedAt: requestedAt.toISOString(),
      expiresAt: new Date(requestedAt.getTime() + 30_000).toISOString(),
      kind: "PAGE",
      target: String(pageId),
      depth: 5,
    }, graphReadBridgeHost, requestedAt);
    if (result.status !== "FOUND" || result.snapshot.truncated) throw new Error("当前 Page 无法形成完整的受控位置快照；没有保存 Placement。");
    await creationSessionController.setPlacement({ kind: "PAGE_END", pageId: result.snapshot.resolved.id, pageName: identity.pageName ?? identity.displayName.replace(" · Journal", ""), pageHash: result.snapshot.scopeHash });
    return;
  }
  if (action === "creation-session-proposal-prepare") {
    await creationSessionController.prepareProposal();
    return;
  }
  if (action === "creation-session-abandon") {
    if (!globalThis.confirm("放弃这个创建会话？已保存的会话记录会保留为已放弃状态，正式事项和正文不会变化。")) return;
    await creationSessionController.abandon();
    return;
  }
  if (action === "v2-directory-filter-focus" && value) {
    if (value !== "all" && value !== "focus" && value !== "now") throw new Error("注意力筛选条件无效。");
    v2DirectoryFilter = { ...v2DirectoryFilter, focus: value };
    await refresh();
    return;
  }
  if (action === "v2-directory-clear-filters") {
    v2DirectoryFilter = defaultDirectoryFilterState();
    await refresh();
    return;
  }
  if (action === "v2-reentry-show-all") {
    v2ReentryTargetObjectId = undefined;
    workspace = "reentry";
    await refresh();
    return;
  }
  if (action === "v2-project-landing-open" && value) {
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    const client = serviceRuntimeClient;
    if (!client || !objectId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error("当前项目入口已失效；没有打开其他项目。");
    }
    const current = (await client.listObjects()).find((object) => object.objectId === objectId);
    if (
      !current
      || current.objectType !== "PROJECT"
      || current.lifecycle !== "OPEN"
      || !current.projectStructure
      || current.version !== expectedVersion
    ) {
      throw new Error("当前项目已经变化；请刷新后重新打开。");
    }
    v2ReentryTargetObjectId = current.objectId;
    workspace = "reentry";
    actionDialog = undefined;
    latestError = undefined;
    message = undefined;
    await refresh();
    return;
  }
  if (action === "v2-project-worksite-open" && value) {
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    if (!objectId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error("当前项目入口已失效；项目和正文没有变化。");
    }
    await run(async () => openV2ProjectWorksite(objectId, expectedVersion), "已回到项目工作现场；正式状态没有变化。");
    if (!latestError) await logseq.hideMainUI();
    return;
  }
  if (action === "v2-project-context-recovery" && value) {
    const [objectId, versionText] = value.split("|");
    const expectedVersion = Number(versionText);
    if (!objectId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error("Project 恢复上下文已失效；没有调用 Provider。");
    }
    await projectContextRecoveryController.generate(objectId, expectedVersion);
    const state = projectContextRecoveryController.snapshot()[objectId];
    operationalLogger.log(
      state?.status === "ready" ? "info" : "warn",
      "ui-action",
      state?.status === "ready" ? "project_context_recovery_generated" : "project_context_recovery_unavailable",
      {
        actionId: "v2-project-context-recovery",
        result: state?.status ?? "discarded",
      },
    );
    return;
  }
  if (action === "v2-project-context-feedback" && value) {
    const [objectId, interactionId, dispositionText] = value.split("|");
    const dispositions = ["HELPFUL", "NOT_NEEDED", "INACCURATE", "TOO_MUCH", "DO_NOT_REPEAT"] as const;
    const disposition = dispositions.find((candidate) => candidate === dispositionText);
    if (!objectId || !interactionId || (dispositionText !== "WITHDRAW" && !disposition)) {
      throw new Error("恢复草稿反馈已失效；没有记录处置。");
    }
    await projectContextRecoveryController.setDisposition(objectId, interactionId, disposition);
    operationalLogger.log("info", "ui-action", "project_context_recovery_feedback", {
      actionId: "v2-project-context-feedback",
      result: disposition ?? "withdrawn",
    });
    return;
  }
  if (action === "v2-mini-project-grill-open" && value) {
    const [objectId, versionText] = value.split("|");
    const expectedVersion = Number(versionText);
    if (!objectId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error("MiniProject 讨论上下文已失效；没有调用 Provider。");
    }
    actionDialog = { kind: "v2-mini-project-grill", value: `${objectId}|${expectedVersion}` };
    await miniProjectGrillController.start(objectId, expectedVersion);
    const state = miniProjectGrillController.snapshot()[objectId];
    operationalLogger.log(
      state?.status === "ready" ? "info" : "warn",
      "ui-action",
      state?.status === "ready" ? "mini_project_grill_turn_generated" : "mini_project_grill_turn_unavailable",
      { actionId: "v2-mini-project-grill-open", result: state?.status ?? "discarded" },
    );
    return;
  }
  if (action === "v2-mini-project-grill-answer" && value) {
    const answer = dialogField("v2MiniProjectGrillAnswer");
    await miniProjectGrillController.answer(answer);
    const state = miniProjectGrillController.snapshot()[value];
    operationalLogger.log(
      state?.status === "ready" ? "info" : "warn",
      "ui-action",
      state?.status === "ready" ? "mini_project_grill_turn_generated" : "mini_project_grill_turn_unavailable",
      { actionId: "v2-mini-project-grill-answer", result: state?.status ?? "discarded" },
    );
    return;
  }
  if (action === "v2-mini-project-grill-retry" && value) {
    await miniProjectGrillController.retry(value);
    return;
  }
  if (action === "v2-mini-project-grill-preview" && value) {
    await miniProjectGrillController.generatePreview(value);
    const state = miniProjectGrillController.snapshot()[value];
    operationalLogger.log(
      state?.status === "ready" && state.preview?.status === "ready" ? "info" : "warn",
      "ui-action",
      state?.status === "ready" && state.preview?.status === "ready" ? "mini_project_grill_preview_generated" : "mini_project_grill_preview_unavailable",
      { actionId: "v2-mini-project-grill-preview", result: state?.status === "ready" ? state.preview?.status ?? "missing" : state?.status ?? "discarded" },
    );
    return;
  }
  if (action === "v2-mini-project-grill-proposal" && value) {
    const result = await miniProjectGrillController.createProposal(value);
    operationalLogger.log(result ? "info" : "warn", "ui-action", result ? "mini_project_restructure_proposal_created" : "mini_project_restructure_proposal_unavailable", { actionId: "v2-mini-project-grill-proposal", result: result ? (result.replayed ? "replayed" : "created") : "unavailable" });
    if (result) {
      actionDialog = undefined;
      workspace = "review";
      reviewMode = "proposals";
      await refresh();
    }
    return;
  }
  if (action === "v2-project-creation-grill-open" && value) {
    let source: ProjectCreationSource;
    if (value === "BLANK") {
      source = { sourceKind: "BLANK" };
    } else if (value.startsWith("PAGE:") && value.length > "PAGE:".length) {
      source = { sourceKind: "PAGE", pageId: value.slice("PAGE:".length) };
    } else if (value.startsWith("MINI_PROJECT:")) {
      const versionSeparator = value.lastIndexOf(":");
      const objectId = value.slice("MINI_PROJECT:".length, versionSeparator);
      const expectedVersion = Number(value.slice(versionSeparator + 1));
      if (!objectId || versionSeparator <= "MINI_PROJECT:".length || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        throw new Error("MiniProject 演化上下文已失效；没有发送分析请求。");
      }
      source = { sourceKind: "MINI_PROJECT", objectId, expectedVersion };
    } else {
      throw new Error("Project 创建来源已失效；没有发送分析请求。");
    }
    actionDialog = { kind: "v2-project-creation-grill", value };
    await projectCreationGrillController.start(source);
    const state = projectCreationGrillController.snapshot()[value];
    operationalLogger.log(
      state?.status === "ready" ? "info" : "warn",
      "ui-action",
      state?.status === "ready" ? "project_creation_grill_turn_generated" : "project_creation_grill_turn_unavailable",
      { actionId: "v2-project-creation-grill-open", result: state?.status ?? "discarded" },
    );
    return;
  }
  if (action === "v2-project-creation-grill-answer" && value) {
    await projectCreationGrillController.answer(value, dialogField("v2ProjectCreationGrillAnswer"));
    const state = projectCreationGrillController.snapshot()[value];
    operationalLogger.log(
      state?.status === "ready" ? "info" : "warn",
      "ui-action",
      state?.status === "ready" ? "project_creation_grill_turn_generated" : "project_creation_grill_turn_unavailable",
      { actionId: "v2-project-creation-grill-answer", result: state?.status ?? "discarded" },
    );
    return;
  }
  if (action === "v2-project-creation-grill-retry" && value) {
    await projectCreationGrillController.retry(value);
    return;
  }
  if (action === "v2-project-creation-grill-recheck" && value) {
    const stale = projectCreationGrillController.snapshot()[value];
    if (stale?.status !== "stale") throw new Error("Project 来源状态已变化；无需重新检查。");
    let source = stale.source;
    if (source.sourceKind === "MINI_PROJECT") {
      const objectId = source.objectId;
      const current = (await serviceRuntimeClient?.listObjects())?.find((object) => object.objectId === objectId);
      if (!current || current.objectType !== "MINI_PROJECT" || current.lifecycle !== "OPEN") {
        throw new Error("来源 MiniProject 已不再适合演化为 Project；没有发送分析请求。");
      }
      source = { sourceKind: "MINI_PROJECT", objectId: current.objectId, expectedVersion: current.version };
    }
    const nextKey = source.sourceKind === "BLANK" ? "BLANK"
      : source.sourceKind === "PAGE" ? `PAGE:${source.pageId}`
      : `MINI_PROJECT:${source.objectId}:${source.expectedVersion}`;
    actionDialog = { kind: "v2-project-creation-grill", value: nextKey };
    await projectCreationGrillController.recheck(value, source);
    return;
  }
  if (action === "v2-project-creation-grill-preview" && value) {
    await projectCreationGrillController.generatePreview(value);
    const state = projectCreationGrillController.snapshot()[value];
    operationalLogger.log(
      state?.status === "ready" && state.preview?.status === "ready" ? "info" : "warn",
      "ui-action",
      state?.status === "ready" && state.preview?.status === "ready" ? "project_creation_preview_generated" : "project_creation_preview_unavailable",
      { actionId: "v2-project-creation-grill-preview", result: state?.status === "ready" ? state.preview?.status ?? "missing" : state?.status ?? "discarded" },
    );
    return;
  }
  if (action === "v2-project-creation-grill-proposal" && value) {
    const result = await projectCreationGrillController.createProposal(value);
    operationalLogger.log(
      result ? "info" : "warn",
      "ui-action",
      result ? "project_creation_proposal_created" : "project_creation_proposal_unavailable",
      { actionId: "v2-project-creation-grill-proposal", result: result ? (result.replayed ? "replayed" : "created") : "unavailable" },
    );
    if (result) {
      actionDialog = undefined;
      workspace = "review";
      reviewMode = "proposals";
      await refresh();
    }
    return;
  }
  if (action === "v2-provider-analyze-current-block") {
    const targetBlockUuid = v2ProviderTarget.consume();
    workspace = "review";
    reviewMode = "candidates";
    const client = serviceRuntimeClient;
    if (v2ProviderState.status === "loading") return;
    if (!client || serviceConnection.status !== "READY" || !serviceConnection.capabilities.provider) {
      v2ProviderState = {
        status: "error",
        message: "智能整理暂时不可用。没有发起分析，正文和正式状态没有变化。",
      };
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
        v2ProviderState = {
          status: "success",
          message: presentSelectedBlockAnalysisNotice(result.generated),
        };
        operationalLogger.log("info", "proposal", "v2_provider_no_proposal", { correlationId: traceId, actionId: "v2-provider-analyze-current-block", result: "no-proposal", blockUuid: selected.blockUuid });
      } else {
        if (!("record" in result)) throw new Error("Provider 返回缺少审阅记录；没有修改正式状态。");
        reviewMode = "proposals";
        v2ProviderState = {
          status: "success",
          message: presentSelectedBlockAnalysisNotice({ kind: "PROPOSAL_READY" }),
        };
        operationalLogger.log("info", "proposal", "v2_provider_proposal_ready", { correlationId: traceId, actionId: "v2-provider-analyze-current-block", result: "success", blockUuid: selected.blockUuid, proposalId: result.record.proposal.proposalId });
      }
    } catch (error) {
      v2ProviderState = {
        status: "error",
        message: "这次整理没有完成。正文和正式状态没有变化，你可以稍后重试。",
      };
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
  if (action === "v2-attention-disposition" && value) {
    const [signalId, disposition] = value.split("|");
    if (!signalId || (disposition !== "LATER" && disposition !== "NOT_RELEVANT")) {
      latestError = "这条提醒已经变化；正式事项没有改变。";
      await refresh();
      return;
    }
    try {
      const result = attentionShadowSession.applyNowPilotDisposition({
        signalId,
        disposition,
        recordedAt: new Date().toISOString(),
      });
      latestError = undefined;
      message = disposition === "LATER"
        ? "这条提醒已在本次使用中暂时收起；正式事项没有变化。"
        : "已记下这条提醒本次不相关；正式事项没有变化。";
      operationalLogger.log("info", "attention-shadow", "attention_now_pilot_disposition", {
        actionId: "v2-attention-disposition",
        command: result.signalType,
        result: result.disposition,
      });
    } catch (error) {
      latestError = "这条提醒已经变化；请以当前事项状态为准。正式事项没有改变。";
      operationalLogger.log(
        "warn",
        "attention-shadow",
        "attention_now_pilot_disposition_rejected",
        { result: "shadow_unchanged" },
        error,
      );
    }
    await refresh();
    return;
  }
  if (action === "close") {
    recentActionCommitId = undefined;
    await returnToBusinessOrigin();
    return;
  }
  if (action === "v2-origin-fallback-open" && value) {
    try {
      await logseq.App.pushState("page", { name: value });
    } finally {
      await clearBusinessOrigin();
      await logseq.hideMainUI();
    }
    return;
  }
  if (action === "v2-origin-fallback-dismiss") {
    await clearBusinessOrigin();
    await logseq.hideMainUI();
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
    await handleAction("creation-session-open", `PROJECT:PAGE:${current.pageUuid}`);
    return;
  }
  if (action === "v2-page-project-update" && value) {
    const current = requirePageContext(value);
    pageContext = await pageContextController.open(current.pageUuid);
    const project = pageContext.project;
    if (!project || project.lifecycle !== "OPEN") {
      throw new Error("当前页已不再对应可编辑的 OPEN Project；没有创建 Proposal。");
    }
    actionDialog = { kind: "v2-project-operation-router", value: `${project.objectId}|${project.objectVersion}` };
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
    downloadTextFile(`task-copilot-diagnostics-${Date.now()}.jsonl`, operationalLogger.exportJsonl(), "application/x-ndjson");
    message = "已打开系统下载窗口；是否保存以下载窗口中的最终选择为准。";
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
  if (action === "restore-recovery-refresh") {
    latestError = undefined;
    message = "正在重新核验 Restore 安全记录；不会读取 Logseq 正文或执行正式写入。";
    await refreshServiceRuntime(configuredServiceDescriptorPath);
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "restore-recovery-prepare") {
    latestError = undefined;
    message = undefined;
    if (restoreRecoveryStatus?.state !== "RECOVERY_REQUIRED" || !restoreRecoveryApply) {
      message = "Restore 恢复记录已变化；请先重新核验。";
    } else {
      restoreRecoveryPrepared = true;
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "restore-recovery-cancel") {
    restoreRecoveryPrepared = false;
    latestError = undefined;
    message = undefined;
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "restore-recovery-apply") {
    if (restoreRecoveryBusy) return;
    latestError = undefined;
    message = undefined;
    const apply = restoreRecoveryApply;
    if (!restoreRecoveryPrepared || !apply || restoreRecoveryStatus?.state !== "RECOVERY_REQUIRED") {
      message = "Restore 恢复记录已变化；没有执行恢复。";
      await showRuntimeDiagnostics();
      return;
    }
    if (!dialogChecked("restoreRecoveryConfirm")) {
      message = "请先确认恢复 Restore 前的正式状态；当前没有任何变化。";
      await showRuntimeDiagnostics();
      return;
    }
    restoreRecoveryBusy = true;
    await showRuntimeDiagnostics();
    try {
      await apply();
      restoreRecoveryPrepared = false;
      message = "已恢复 Restore 前的正式状态并通过完整性检查；正在重新连接当前 Graph。";
      const recovered = await recoverConfiguredServiceRuntime(configuredServiceDescriptorPath);
      featureReady = recovered;
      diagnostics.setStoreStatus(recovered ? "READY" : "READ_ONLY_SAFE_MODE");
      message = recovered
        ? "Restore 前的正式状态已恢复；当前 Graph 已重新连接。"
        : "恢复已完成，但当前 Graph 尚未重新连接；Logseq 正文仍可编辑。";
      if (!recovered) {
        latestError = "恢复已完成，但当前 Graph 尚未恢复连接；请重新核验系统状态。";
      }
      await refreshToolbarInterventionFacts();
      await projectPageHeadActionController.refreshAll();
    } catch (error) {
      latestError = explain(error);
      message = "恢复未完成；安全锁保持，Logseq 正文仍可编辑。";
      await refreshServiceRuntime(configuredServiceDescriptorPath);
    } finally {
      restoreRecoveryBusy = false;
    }
    await showRuntimeDiagnostics();
    return;
  }
  if (action === "backup-restore-open" || action === "backup-restore-reload") {
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isBackupRestoreClient(client) || !serviceLifecycleSession || serviceConnection.status !== "READY") {
      message = "备份与恢复需要 Launcher 管理的当前 Graph 运行环境；没有读取或修改任何快照。";
      await refresh();
      return;
    }
    actionDialog = { kind: "v2-backup-restore", value: "current-graph" };
    const loading = backupRestoreController.load(client);
    await refresh();
    await loading.catch((error: unknown) => {
      latestError = explain(error);
    });
    await refresh();
    return;
  }
  if (action === "backup-restore-create") {
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isBackupRestoreClient(client) || !serviceLifecycleSession || serviceConnection.status !== "READY") {
      message = "当前 Graph 的受管运行环境已变化；没有创建快照。";
      await refresh();
      return;
    }
    const creating = backupRestoreController.create(client);
    await refresh();
    await creating.catch((error: unknown) => {
      latestError = explain(error);
    });
    await refresh();
    return;
  }
  if (action === "backup-restore-select" && value) {
    latestError = undefined;
    message = undefined;
    const client = serviceRuntimeClient;
    if (!isBackupRestoreClient(client) || !serviceLifecycleSession || serviceConnection.status !== "READY") {
      message = "当前 Graph 的受管运行环境已变化；没有选择快照。";
      await refresh();
      return;
    }
    const selecting = backupRestoreController.select(client, value);
    await refresh();
    await selecting.catch((error: unknown) => {
      latestError = explain(error);
    });
    await refresh();
    return;
  }
  if (action === "submit-backup-restore" && value) {
    const client = serviceRuntimeClient;
    if (!dialogChecked("actionConfirmed")) {
      latestError = "请先单独确认 Restore 的最终影响。";
      await refresh();
      return;
    }
    if (!isBackupRestoreClient(client) || !serviceLifecycleSession || serviceConnection.status !== "READY") {
      actionDialog = undefined;
      message = "当前 Graph 的受管运行环境已变化；没有执行恢复。";
      await refresh();
      return;
    }
    latestError = undefined;
    message = undefined;
    await explicitSyncController?.flush();
    const decision = managedRuntimeEndDecision({
      commits: await client.listSemanticCommits(),
      explicitSync: {
        pending: explicitSyncState.pending,
        reconciliationRequired: explicitSyncState.reconciliationRequired,
      },
    });
    if (!decision.allowed) {
      actionDialog = undefined;
      const blocked = managedRuntimeBlockedPresentation(decision, "RESTORE");
      message = blocked.message;
      if (blocked.surface === "SYSTEM_STATUS") {
        await showRuntimeDiagnostics();
        return;
      }
      workspace = "audit";
      await refresh();
      return;
    }
    explicitSyncController?.pause();
    const restoring = backupRestoreController.restore(client, value);
    await refresh();
    try {
      await restoring;
      actionDialog = undefined;
      enterRestrictedServiceMode("RESTORE_RESTARTING", "正式状态已从快照恢复；正在重启当前 Graph 的运行环境。");
      diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
      featureReady = false;
      message = "恢复已完成，恢复前状态已自动保留；正在重新连接当前 Graph。";
      await releaseServiceLifecycleSession();
      const recovered = await recoverConfiguredServiceRuntime(configuredServiceDescriptorPath);
      featureReady = recovered;
      diagnostics.setStoreStatus(recovered ? "READY" : "READ_ONLY_SAFE_MODE");
      message = recovered
        ? "恢复完成；当前 Graph 的 Task Copilot 已自动重启，恢复前状态仍保留为可恢复快照。"
        : "恢复完成，但运行环境尚未自动重连；Graph 正文仍可编辑，请检查系统状态。";
      backupRestoreController.clear();
      await refreshToolbarInterventionFacts();
      await projectPageHeadActionController.refreshAll();
    } catch (error) {
      const disposition = backupRestoreFailureDisposition(error);
      operationalLogger.log("error", "ui-action", "backup_restore_failed", {
        result: disposition.kind.toLowerCase(),
        errorCode: error instanceof StructuredError && typeof error.details?.remoteCode === "string"
          ? error.details.remoteCode
          : error instanceof StructuredError ? error.code : "RESTORE_RESULT_UNKNOWN",
      });
      latestError = disposition.message;
      if (!disposition.restartRuntime) {
        if (disposition.kind === "RECOVERY_REQUIRED") {
          actionDialog = undefined;
          enterRestrictedServiceMode("V2_RESTORE_ROLLBACK_FAILED", disposition.message);
          diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
          featureReady = false;
          message = undefined;
          await releaseServiceLifecycleSession();
          // The failed Service cannot expose its retained recovery point after
          // shutdown. Rediscover through Launcher immediately so the same
          // system-status surface can render the bounded manual-recovery
          // controls without requiring a plugin reload.
          const recovered = await recoverConfiguredServiceRuntime(configuredServiceDescriptorPath);
          featureReady = recovered;
          diagnostics.setStoreStatus(recovered ? "READY" : "READ_ONLY_SAFE_MODE");
          await refreshToolbarInterventionFacts();
          await projectPageHeadActionController.refreshAll();
        } else if (serviceConnection.status === "READY" && serviceRuntimeClient === client) {
          await explicitSyncController?.resume(client).catch(() => undefined);
        }
      } else {
        actionDialog = undefined;
        enterRestrictedServiceMode(
          disposition.kind === "ROLLED_BACK" ? "RESTORE_ROLLED_BACK_RESTARTING" : "RESTORE_OUTCOME_RECHECKING",
          disposition.message,
        );
        diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
        featureReady = false;
        message = disposition.message;
        await releaseServiceLifecycleSession();
        const recovered = await recoverConfiguredServiceRuntime(configuredServiceDescriptorPath);
        featureReady = recovered;
        diagnostics.setStoreStatus(recovered ? "READY" : "READ_ONLY_SAFE_MODE");
        if (disposition.kind === "ROLLED_BACK") {
          latestError = recovered
            ? "恢复未完成；原正式状态已回滚并重新可用，Restore 前恢复点仍保留。"
            : "恢复未完成；原正式状态已回滚并保留恢复点，但运行环境尚未自动重连。Graph 正文仍可编辑，请检查系统状态。";
        } else {
          latestError = recovered
            ? "运行环境已重新连接且数据库校验通过；上次 Restore 的最终结果不确定，请先核对当前事项与最近修改。"
            : "上次 Restore 的最终结果不确定，运行环境也尚未自动重连；正式写入保持暂停，请检查系统状态。";
        }
        message = undefined;
        await refreshToolbarInterventionFacts();
        await projectPageHeadActionController.refreshAll();
      }
    }
    await refresh();
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
      const blocked = managedRuntimeBlockedPresentation(decision, "END_RUNTIME");
      message = blocked.message;
      if (blocked.surface === "SYSTEM_STATUS") {
        await showRuntimeDiagnostics();
        return;
      }
      workspace = "audit";
      await refresh();
      return;
    }
    runtimeEndedByUser = true;
    serviceDiscoveryGeneration += 1;
    workspace = "more";
    actionDialog = undefined;
    const releaseLifecycleSession = releaseServiceLifecycleSession();
    enterRestrictedServiceMode("SERVICE_ENDED_BY_USER", "本次 Task Copilot 已安全结束；Logseq 正文仍可正常编辑。");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    featureReady = false;
    message = "正在安全结束本次 Task Copilot；正式修改已暂停，Logseq 正文仍可编辑。";
    await refresh();
    await releaseLifecycleSession;
    message = "本次 Task Copilot 已安全结束；当前知识库正文和正式历史保持不变。";
    await refresh();
    return;
  }
  if (action === "restart-task-copilot") {
    if (!runtimeEndedByUser) {
      message = "当前本地运行环境不需要重新启动。";
      await refresh();
      return;
    }
    runtimeEndedByUser = false;
    await refreshServiceRuntime(configuredServiceDescriptorPath);
    featureReady = serviceConnection.status === "READY" && serviceConnection.formalWritesAvailable && Boolean(serviceRuntimeClient);
    diagnostics.setStoreStatus(featureReady ? "READY" : "READ_ONLY_SAFE_MODE");
    message = featureReady
      ? "当前知识库的 Task Copilot 已重新启动。"
      : "Task Copilot 尚未恢复；Logseq 正文仍可编辑，请查看系统状态。";
    await projectPageHeadActionController.refreshAll();
    await refresh();
    return;
  }
  if (action === "v2-open-primary-anchor" && value) {
    const primary = decodeAttentionNowPilotPrimaryValue(value);
    await run(async () => openV2PrimaryAnchor(primary.value));
    if (!latestError) {
      recordAttentionNowPilotActed(primary.signalId);
      await logseq.hideMainUI();
    }
    return;
  }
  if (action === "v2-directory-open-source" && value) {
    await run(async () => openV2PrimaryAnchor(value));
    if (!latestError) await logseq.hideMainUI();
    return;
  }
  if (action === "v2-directory-focus-add" && value) {
    const [objectId, rawVersion] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      const expectedVersion = Number(rawVersion);
      if (!client || !objectId || !Number.isSafeInteger(expectedVersion)) throw new Error("关注上下文已失效；没有写入。");
      const current = await client.nowWork();
      await client.selectFocus(objectId, expectedVersion, current.focus.length);
    }, "已加入当前关注；对象正式状态与正文未改变。");
    return;
  }
  if (action === "v2-directory-focus-remove" && value) {
    const [objectId, rawVersion] = value.split("|");
    await run(async () => {
      const client = serviceRuntimeClient;
      const expectedVersion = Number(rawVersion);
      if (!client || !objectId || !Number.isSafeInteger(expectedVersion)) throw new Error("关注上下文已失效；没有写入。");
      await client.removeFocus(objectId, expectedVersion);
    }, "已移出当前关注；对象正式状态与正文未改变。");
    return;
  }
  if (action === "v2-directory-condition-open" && value) {
    directoryFormReturnToObjects = true;
    return openActionDialog("v2-condition", value);
  }
  if (action === "v2-directory-deadline-open" && value) {
    directoryFormReturnToObjects = true;
    return openActionDialog("v2-deadline", value);
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
  if (action === "v2-condition-open" && value) {
    await openActionDialog("v2-condition", value);
    return;
  }
  if (action === "v2-block-condition-intent" && value) {
    const [intent, ...context] = value.split("|");
    if (typeof intent !== "string" || !["ACTIONABLE", "WAITING", "BLOCKED", "PAUSED"].includes(intent) || context.length !== 3) {
      throw new Error("状态意图上下文无效；没有保存，原状态未改变。");
    }
    actionDialog = {
      kind: intent === "ACTIONABLE" ? "v2-block-condition-actionable"
        : intent === "WAITING" ? "v2-block-condition-waiting"
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
      || !["v2-block-condition-actionable", "v2-block-condition-waiting", "v2-block-condition-blocked", "v2-block-condition-paused"].includes(dialogKind ?? "")
    ) {
      throw new Error("状态表单上下文无效；没有保存，原状态未改变。");
    }
    const draft: BlockConditionDraft = dialogKind === "v2-block-condition-actionable"
      ? { intent: "ACTIONABLE" }
      : dialogKind === "v2-block-condition-waiting"
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
    const primary = decodeAttentionNowPilotPrimaryValue(value);
    const [objectId, rawVersion] = primary.value.split("|");
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
      recordAttentionNowPilotActed(primary.signalId);
      actionDialog = undefined;
      workspace = directoryFormReturnToObjects ? "objects" : "now";
      directoryFormReturnToObjects = false;
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
      workspace = directoryFormReturnToObjects ? "objects" : "now";
      directoryFormReturnToObjects = false;
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
    const lifecycleAction = rawAction === "CANCEL" || rawAction === "REOPEN" || rawAction === "ARCHIVE" ? rawAction : undefined;
    const reason = dialogField("v2LifecycleReason");
    v2LifecycleProposalBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client || !objectId || !Number.isSafeInteger(expectedVersion) || !lifecycleAction || !reason.trim()) throw new Error("请填写原因；没有创建 Proposal。");
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
  if (action === "v2-project-operation-router-open" && value) return openActionDialog("v2-project-operation-router", value);
  if (action === "v2-project-closure-evidence-open" && value) {
    if (v2ProjectClosureEvidenceBusy) return;
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    v2ProjectClosureEvidenceBusy = true;
    v2ProjectClosureProposalMessage = undefined;
    v2ProjectClosureUserJudgments = undefined;
    v2ProjectClosureDraftFields = undefined;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client?.getProjectClosureEvidence || !objectId || !Number.isSafeInteger(expectedVersion)) {
          throw new Error("Project Closure 证据上下文已失效；没有生成证据预览。");
        }
        v2ProjectClosureEvidence = await client.getProjectClosureEvidence(objectId, { expectedVersion });
        actionDialog = { kind: "v2-project-closure-evidence", value };
      });
    } finally {
      v2ProjectClosureEvidenceBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-project-closure-draft" && value) {
    if (v2ProjectClosureProposalBusy) return;
    const evidence = v2ProjectClosureEvidence;
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    if (
      !evidence
      || evidence.project.objectId !== objectId
      || evidence.project.version !== expectedVersion
    ) {
      v2ProjectClosureProposalMessage = "Closure 证据已失效；请重新整理证据。";
      await refresh();
      return;
    }
    const draftFieldNames = [
      "projectClosureActualResult",
      "projectClosureLegacyDisposition",
      "projectClosureKeyDecisions",
      "projectClosureFutureSummary",
      ...evidence.objectiveJudgments.flatMap((_, index) => [
        `projectClosureObjectiveDisposition:${index}`,
        `projectClosureObjectiveReason:${index}`,
        `projectClosureObjectiveNextStep:${index}`,
      ]),
    ];
    v2ProjectClosureDraftFields = Object.fromEntries(draftFieldNames.map((name) => [name, dialogField(name)]));
    let userJudgments;
    try {
      userJudgments = readProjectClosureUserJudgments(evidence, (name) => v2ProjectClosureDraftFields?.[name] ?? "");
    } catch (error) {
      v2ProjectClosureProposalMessage = explain(error);
      await refresh();
      return;
    }
    v2ProjectClosureUserJudgments = userJudgments;
    v2ProjectClosureProposalBusy = true;
    v2ProjectClosureProposalMessage = undefined;
    await refresh();
    try {
      const client = serviceRuntimeClient;
      if (
        !client?.createProjectClosureProposal
        || serviceConnection.status !== "READY"
        || !serviceConnection.formalWritesAvailable
        || !serviceConnection.capabilities.provider
        || !objectId
        || !Number.isSafeInteger(expectedVersion)
      ) {
        v2ProjectClosureProposalMessage = "智能整理暂时不可用；关闭方案没有建立，项目和正文没有变化。";
        return;
      }
      const current = (await client.listObjects()).find((object) => object.objectId === objectId);
      if (
        !current
        || current.objectType !== "PROJECT"
        || current.lifecycle !== "OPEN"
        || current.version !== expectedVersion
      ) {
        v2ProjectClosureProposalMessage = "Project 已变化、关闭或不存在；旧证据已作废，请重新整理证据。";
        return;
      }
      const result = await client.createProjectClosureProposal(objectId, {
        expectedVersion,
        userJudgments,
      });
      if (result.kind === "NO_PROPOSAL") {
        v2ProjectClosureProposalMessage = "Copilot 没有形成可审阅的关闭建议；请核对上述判断后重试。Project 和正文未改变。";
        return;
      }
      v2ProjectClosureEvidence = undefined;
      v2ProjectClosureProposalMessage = undefined;
      v2ProjectClosureUserJudgments = undefined;
      v2ProjectClosureDraftFields = undefined;
      actionDialog = undefined;
      workspace = "review";
      reviewMode = "proposals";
      message = result.replayed
        ? "已打开同一证据与判断下的关闭建议；Project 和正文仍未改变。"
        : "关闭建议已进入“待我确认”；请先阅读最终结果，再单独接受并完成 Project。";
    } catch (error) {
      v2ProjectClosureProposalMessage = projectClosureProposalFailure(error);
    } finally {
      v2ProjectClosureProposalBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "v2-condition-undo-open" && value) {
    if (v2ConditionUndoBusy) return;
    v2ConditionUndoBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client || serviceConnection.status !== "READY" || !serviceConnection.formalWritesAvailable) {
          throw new Error("V2 Local Service 未就绪；没有准备状态撤销。");
        }
        const prepared = await client.prepareConditionUndo(value);
        v2ConditionUndoPreparation = prepared;
        actionDialog = {
          kind: "confirm-v2-condition-undo",
          value: `${prepared.objectId}|${prepared.conditionChangeId}|${prepared.expectedVersion}`,
        };
      });
    } finally {
      v2ConditionUndoBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-condition-undo" && value) {
    if (v2ConditionUndoBusy) return;
    const [objectId, conditionChangeId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    if (!dialogChecked("actionConfirmed")) {
      latestError = "请确认恢复到这次状态变化之前。";
      await refresh();
      return;
    }
    v2ConditionUndoBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        const prepared = v2ConditionUndoPreparation;
        if (
          !client
          || !objectId
          || !conditionChangeId
          || !Number.isSafeInteger(expectedVersion)
          || !prepared
          || prepared.objectId !== objectId
          || prepared.conditionChangeId !== conditionChangeId
          || prepared.expectedVersion !== expectedVersion
        ) {
          throw new Error("状态撤销上下文已失效；没有写入。");
        }
        const result = await client.undoCondition(objectId, {
          conditionChangeId,
          expectedVersion,
          confirmation: "UNDO_CONDITION",
          traceId: `condition-undo-ui-${Date.now()}`,
        });
        v2ConditionUndoPreparation = undefined;
        actionDialog = undefined;
        workspace = "now";
        message = result.replayed
          ? "最近状态变化此前已撤销；已刷新当前工作。"
          : "最近状态变化已撤销；Lifecycle、Focus、Ownership、正文和 Project 当前接口均未改变。";
      });
    } finally {
      v2ConditionUndoBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "v2-project-operation-association" && value) {
    actionDialog = undefined;
    workspace = "objects";
    message = "请在“关联两个正式对象”中选择目标；这里只建立普通 Association，不改变主归属、位置、Lifecycle 或 Focus。";
    await refresh();
    return;
  }
  if (action === "v2-project-narration-propose" && value) {
    if (v2ProjectNarrationBusy) return;
    const [objectId, rawVersion] = value.split("|");
    const expectedVersion = Number(rawVersion);
    v2ProjectNarrationBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (
          !client?.createProjectNarrationProposal
          || serviceConnection.status !== "READY"
          || !serviceConnection.formalWritesAvailable
          || !serviceConnection.capabilities.provider
          || !objectId
          || !Number.isSafeInteger(expectedVersion)
        ) {
          throw new Error("Project 当前摘要 Provider 或正式审阅链未就绪；没有生成 Proposal。");
        }
        const current = (await client.listObjects()).find((object) => object.objectId === objectId);
        if (
          !current
          || current.objectType !== "PROJECT"
          || current.lifecycle !== "OPEN"
          || current.version !== expectedVersion
          || !current.projectStructure
        ) {
          actionDialog = undefined;
          throw new Error("Project 已变化、关闭或不存在；没有调用 Provider。");
        }
        const result = await client.createProjectNarrationProposal({ objectId, expectedVersion });
        actionDialog = undefined;
        workspace = "review";
        reviewMode = "proposals";
        message = result.replayed
          ? "已打开相同证据下的当前摘要 Proposal；正式 Project 未改变。"
          : "Copilot 当前摘要建议已进入“待我确认”；结构和正文未改变，请审阅后再应用。";
      });
    } finally {
      v2ProjectNarrationBusy = false;
      await refresh();
    }
    return;
  }
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
        const [rawPriority, text, evidence] = parts(line, 3, "目标") as [string, string, string];
        const priority: V2ProjectStructure["objectives"][number]["priority"] | undefined = rawPriority === "主要" || rawPriority === "PRIMARY" ? "PRIMARY"
          : rawPriority === "次要" || rawPriority === "SECONDARY" ? "SECONDARY"
          : undefined;
        if (!priority) throw new Error("目标优先级必须是“主要”或“次要”。");
        const existing = current.projectStructure!.objectives.find((item) => item.text === text) ?? current.projectStructure!.objectives[index];
        return { objectiveId: existing?.objectiveId ?? `objective-ui-${stamp}-${index + 1}`, text, priority, successEvidence: evidence.split("；").map((item) => item.trim()).filter(Boolean) };
      });
      const deliverables = deliverableLines.map((line, index) => {
        const [rawStatus, text, acceptance] = parts(line, 3, "预期成果") as [string, string, string];
        const status = ({
          "计划中": "PLANNED",
          "可用": "AVAILABLE",
          "已接受": "ACCEPTED",
          "已替代": "SUPERSEDED",
          PLANNED: "PLANNED",
          AVAILABLE: "AVAILABLE",
          ACCEPTED: "ACCEPTED",
          SUPERSEDED: "SUPERSEDED",
        } as const)[rawStatus as "计划中" | "可用" | "已接受" | "已替代" | "PLANNED" | "AVAILABLE" | "ACCEPTED" | "SUPERSEDED"];
        if (!status) throw new Error("预期成果状态必须是“计划中”“可用”“已接受”或“已替代”。");
        const existing = current.projectStructure!.deliverables.find((item) => item.text === text) ?? current.projectStructure!.deliverables[index];
        return { deliverableId: existing?.deliverableId ?? `deliverable-ui-${stamp}-${index + 1}`, text, acceptance, status };
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
          message = "这次修改已经应用；需要时可以在刚刚的结果中撤销。";
        } else if (result.status === "STALE") {
          message = "内容已发生变化，这次修改没有应用；请重新检查。";
        } else {
          message = "这次修改没有完成；正文已恢复到安全状态。";
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
    }, action === "v2-review-accept"
      ? "方案已审阅，尚未应用；确认应用前系统会重新检查当前内容。"
      : "方案未采用；正式内容没有变化。");
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
  if (action === "v2-project-closure-undo" && value) return openActionDialog("confirm-v2-project-closure-undo", value);
  if (action === "v2-project-creation-commit" && value) return openActionDialog("confirm-v2-project-creation", value);
  if (action === "v2-project-creation-undo" && value) return openActionDialog("confirm-v2-project-creation-undo", value);
  if (action === "v2-creation-session-commit" && value) return openActionDialog("confirm-v2-creation-session", value);
  if (action === "v2-creation-session-undo" && value) return openActionDialog("confirm-v2-creation-session-undo", value);
  if (action === "v2-project-structure-commit" && value) return openActionDialog("confirm-v2-project-structure", value);
  if (action === "v2-project-structure-undo" && value) return openActionDialog("confirm-v2-project-structure-undo", value);
  if (action === "v2-mini-project-restructure-commit" && value) return openActionDialog("confirm-v2-mini-project-restructure", value);
  if (action === "v2-mini-project-restructure-undo" && value) return openActionDialog("confirm-v2-mini-project-restructure-undo", value);
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
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认结束项目及未完成目标的后续去向。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    actionDialog = undefined;
    workspace = "review";
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!proposalId || !expectedUpdatedAt || !client) throw new Error("结束项目的当前信息已失效；没有写入。");
      const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
      if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("方案已变化；请刷新后重新检查结束项目。");
      const observations = await collectV2ProposalGraphObservations(stored.proposal, {
        getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }),
        getPage: (id) => logseq.Editor.getPage(id),
      });
      const result = await client.commitProjectClosure(proposalId, { expectedUpdatedAt, confirmation: "COMPLETE_PROJECT_WITH_CLOSURE", observations, traceId: `v2-project-closure-ui-${Date.now()}` });
      if (result.status === "COMPLETED") {
        recentActionCommitId = result.semanticCommitId;
        message = `项目已结束；${result.object.text} 已退出活跃视图，Logseq 页面保留。`;
      } else if (result.status === "FAILED") {
        message = "这次没有结束项目；项目和正文没有变化。如需继续，请重新发起结束项目。";
      } else {
        message = "项目版本已变化；这次没有结束项目，请重新检查后再发起。";
      }
    });
    return;
  }
  if (action === "submit-v2-creation-session" && value) {
    if (v2ProjectCreationCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认已审阅的 Draft Tree、来源边界与独立 Project Page。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    v2ProjectCreationCommitBusy = true;
    let openedPageName: string | undefined;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!proposalId || !expectedUpdatedAt || !client) throw new Error("Creation Session 正式创建上下文已失效；没有写入。");
        const stored = (await client.listProposals()).find(({ proposal }) => proposal.proposalId === proposalId);
        const targetType = stored?.proposal.groups[0]?.semanticOperations[0]?.payload.targetType;
        if (targetType === "MINI_PROJECT") {
          if (!client.prepareCreationSessionMiniCommit || !client.finalizeCreationSessionMiniCommit || !client.compensateCreationSessionMiniCommit) throw new Error("MiniProject Creation Session 正式创建能力不可用；没有写入。");
          const result = await commitCreationSessionMini({
            prepareCreationSessionMiniCommit: client.prepareCreationSessionMiniCommit.bind(client),
            finalizeCreationSessionMiniCommit: client.finalizeCreationSessionMiniCommit.bind(client),
            compensateCreationSessionMiniCommit: client.compensateCreationSessionMiniCommit.bind(client),
          }, {
            getBlock: (uuid, options) => logseq.Editor.getBlock(uuid, options),
            appendBlockInPage: (identity, content) => logseq.Editor.appendBlockInPage(identity, content),
            insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
            updateBlock: (uuid, content) => logseq.Editor.updateBlock(uuid, content),
            moveBlock: (source, target, options) => logseq.Editor.moveBlock(source, target, options),
            removeBlock: (uuid) => logseq.Editor.removeBlock(uuid),
          }, proposalId, expectedUpdatedAt, `v2-creation-session-mini-ui-${Date.now()}`);
          actionDialog = undefined;
          if (result.status === "STALE") { workspace = "review"; message = "Creation Session、来源或放置位置已变化；没有创建 MiniProject。"; return; }
          recentActionCommitId = result.semanticCommitId;
          workspace = "reentry";
          v2ReentryTargetObjectId = result.object.objectId;
          message = `${result.object.text} 已由 Creation Session 正式创建；Graph Tree、Primary Anchor 与会话结果已在同一恢复边界收口。`;
          return;
        }
        if (!client.prepareCreationSessionCommit || !client.finalizeCreationSessionCommit || !client.compensateCreationSessionCommit) throw new Error("Project Creation Session 正式创建能力不可用；没有写入。");
        const result = await commitCreationSessionProject({
          prepareCreationSessionCommit: client.prepareCreationSessionCommit.bind(client),
          finalizeCreationSessionCommit: client.finalizeCreationSessionCommit.bind(client),
          compensateCreationSessionCommit: client.compensateCreationSessionCommit.bind(client),
        }, {
          getPage: (identity) => logseq.Editor.getPage(identity),
          createPage: (pageName, properties, options) => logseq.Editor.createPage(pageName, properties, options),
          getPageBlocksTree: (identity) => logseq.Editor.getPageBlocksTree(identity),
          appendBlockInPage: (identity, content, options) => logseq.Editor.appendBlockInPage(identity, content, options),
          insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
          removeBlock: (uuid) => logseq.Editor.removeBlock(uuid),
          deletePage: async (identity) => { await logseq.Editor.deletePage(identity); },
        }, proposalId, expectedUpdatedAt, `v2-creation-session-project-ui-${Date.now()}`);
        actionDialog = undefined;
        if (result.status === "STALE") { workspace = "review"; message = "Creation Session、来源或目标 Page 已变化；没有创建 Page 或正式对象。"; return; }
        recentActionCommitId = result.semanticCommitId;
        workspace = "reentry";
        v2ReentryTargetObjectId = result.object.objectId;
        openedPageName = result.pageName;
        message = `${result.object.text} 已由 Creation Session 正式创建；Draft Tree、Primary Anchor 与会话结果已在同一恢复边界收口。`;
      });
    } finally {
      v2ProjectCreationCommitBusy = false;
      await refresh();
    }
    if (openedPageName && !latestError) {
      pageContext = undefined;
      await clearBusinessOrigin();
      await logseq.App.pushState("page", { name: openedPageName });
    }
    return;
  }
  if (action === "submit-v2-creation-session-undo" && value) {
    if (v2ProjectCreationCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认只有 Page 与完整 Draft Tree 均未变化时才执行 Undo。"; await refresh(); return; }
    v2ProjectCreationCommitBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client) throw new Error("Creation Session Undo 上下文已失效；没有写入。");
        const original = (await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === value);
        const stored = original?.proposalId ? await client.getProposal(original.proposalId) : undefined;
        const targetType = stored?.proposal.groups[0]?.semanticOperations[0]?.payload.targetType;
        if (targetType === "MINI_PROJECT") {
          if (!client.prepareCreationSessionMiniUndo || !client.finalizeCreationSessionMiniUndo) throw new Error("MiniProject Creation Session Undo 能力不可用；没有写入。");
          const result = await undoCreationSessionMini({
            prepareCreationSessionMiniUndo: client.prepareCreationSessionMiniUndo.bind(client),
            finalizeCreationSessionMiniUndo: client.finalizeCreationSessionMiniUndo.bind(client),
          }, {
            getBlock: (uuid, options) => logseq.Editor.getBlock(uuid, options),
            appendBlockInPage: (identity, content) => logseq.Editor.appendBlockInPage(identity, content),
            insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
            updateBlock: (uuid, content) => logseq.Editor.updateBlock(uuid, content),
            moveBlock: (source, target, options) => logseq.Editor.moveBlock(source, target, options),
            removeBlock: (uuid) => logseq.Editor.removeBlock(uuid),
          }, value, `v2-creation-session-mini-undo-ui-${Date.now()}`);
          actionDialog = undefined;
          workspace = "review";
          message = "Creation Session MiniProject 创建已撤销；Graph 已精确恢复，会话和审计证据保留。";
          recentActionCommitId = result.originalSemanticCommitId;
          return;
        }
        if (!client.prepareCreationSessionUndo || !client.finalizeCreationSessionUndo) throw new Error("Project Creation Session Undo 能力不可用；没有删除 Page。");
        const result = await undoCreationSessionProject({
          prepareCreationSessionUndo: client.prepareCreationSessionUndo.bind(client),
          finalizeCreationSessionUndo: client.finalizeCreationSessionUndo.bind(client),
        }, {
          getPage: (identity) => logseq.Editor.getPage(identity),
          createPage: (pageName, properties, options) => logseq.Editor.createPage(pageName, properties, options),
          getPageBlocksTree: (identity) => logseq.Editor.getPageBlocksTree(identity),
          appendBlockInPage: (identity, content, options) => logseq.Editor.appendBlockInPage(identity, content, options),
          insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
          removeBlock: (uuid) => logseq.Editor.removeBlock(uuid),
          deletePage: async (identity) => { await logseq.Editor.deletePage(identity); },
        }, value, `v2-creation-session-project-undo-ui-${Date.now()}`);
        actionDialog = undefined;
        workspace = "review";
        message = `Creation Session Project 创建已撤销；受控 Page 与完整 Draft Tree 已移除，会话和审计证据保留。`;
        recentActionCommitId = result.originalSemanticCommitId;
      });
    } finally {
      v2ProjectCreationCommitBusy = false;
      await refresh();
    }
    return;
  }
  if (action === "submit-v2-project-creation" && value) {
    if (v2ProjectCreationCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认最终阅读结果与 Project Page 关系。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    v2ProjectCreationCommitBusy = true;
    let openedPageName: string | undefined;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!proposalId || !expectedUpdatedAt || !client?.prepareProposalProjectCreation || !client.finalizeProposalProjectCreation || !client.compensateProposalProjectCreation) {
          throw new Error("Project 创建上下文已失效；没有创建页面或正式对象。");
        }
        const result = await createReviewedProjectWithPage({
          prepareProposalProjectCreation: client.prepareProposalProjectCreation.bind(client),
          finalizeProposalProjectCreation: client.finalizeProposalProjectCreation.bind(client),
          compensateProposalProjectCreation: client.compensateProposalProjectCreation.bind(client),
        }, {
          getPage: (identity) => logseq.Editor.getPage(identity),
          createPage: (pageName, properties, options) => logseq.Editor.createPage(pageName, properties, options),
          getPageBlocksTree: (identity) => logseq.Editor.getPageBlocksTree(identity),
          deletePage: async (identity) => { await logseq.Editor.deletePage(identity); },
        }, proposalId, expectedUpdatedAt, `v2-project-creation-ui-${Date.now()}`);
        actionDialog = undefined;
        if (result.status === "STALE") {
          workspace = "review";
          message = "Project 来源或目标 Page 已变化；Proposal 已标记 STALE，没有创建页面或正式对象。";
          return;
        }
        recentActionCommitId = result.semanticCommitId;
        workspace = "reentry";
        v2ReentryTargetObjectId = result.object.objectId;
        openedPageName = result.pageName;
        message = result.pageCreated
          ? `${result.object.text} 已创建；下面先显示当前状态和最值得继续的入口。`
          : `${result.object.text} 已建立；原页面内容保持不变，下面先显示项目当前状态。`;
      });
    } finally {
      v2ProjectCreationCommitBusy = false;
      await refresh();
    }
    if (openedPageName && !latestError) {
      pageContext = undefined;
      await clearBusinessOrigin();
      await logseq.App.pushState("page", { name: openedPageName });
    }
    return;
  }
  if (action === "submit-v2-project-creation-undo" && value) {
    if (v2ProjectCreationCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认 Project 创建 Undo 的 Page 保留／删除边界。"; await refresh(); return; }
    v2ProjectCreationCommitBusy = true;
    let sourceReturnTarget: OriginReturnTarget | undefined;
    let undoResultMessage: string | undefined;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client?.prepareProposalProjectCreation || !client.finalizeProposalProjectCreation || !client.prepareProposalProjectCreationUndo || !client.finalizeProposalProjectCreationUndo) {
          throw new Error("Project 创建 Undo 上下文已失效；没有删除 Page。");
        }
        const result = await undoReviewedProjectCreation({
          prepareProposalProjectCreation: client.prepareProposalProjectCreation.bind(client),
          finalizeProposalProjectCreation: client.finalizeProposalProjectCreation.bind(client),
          prepareProposalProjectCreationUndo: client.prepareProposalProjectCreationUndo.bind(client),
          finalizeProposalProjectCreationUndo: client.finalizeProposalProjectCreationUndo.bind(client),
        }, {
          getPage: (identity) => logseq.Editor.getPage(identity),
          createPage: (pageName, properties, options) => logseq.Editor.createPage(pageName, properties, options),
          getPageBlocksTree: (identity) => logseq.Editor.getPageBlocksTree(identity),
          deletePage: async (identity) => { await logseq.Editor.deletePage(identity); },
        }, value, `v2-project-creation-undo-ui-${Date.now()}`);
        sourceReturnTarget = result.sourceReturnTarget;
        actionDialog = undefined;
        workspace = "review";
        undoResultMessage = projectCreationUndoMessage(result.pagePreserved);
        message = undoResultMessage;
      });
    } finally {
      v2ProjectCreationCommitBusy = false;
      await refresh();
    }
    if (sourceReturnTarget && !latestError) {
      const returned = await originRouteController.returnToMainTarget(sourceReturnTarget);
      operationalLogger.log(returned.status === "RETURNED" ? "info" : "warn", "source-resolution", "project_creation_undo_source_returned", {
        actionId: "submit-v2-project-creation-undo",
        result: returned.status.toLowerCase(),
      });
      await showBlockContextMessage(
        returned.status === "RETURNED"
          ? `${undoResultMessage ?? "Project 创建已撤销"} ${returned.label}`
          : returned.label,
        returned.status === "RETURNED" ? "success" : "warning",
      );
    }
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
  if (action === "submit-v2-project-closure-undo" && value) {
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认恢复 OPEN 并移除本次 Project Closure。"; await refresh(); return; }
    await run(async () => {
      const client = serviceRuntimeClient;
      if (!client) throw new Error("Project Closure Undo 上下文已失效；没有写入。");
      const result = await client.undoProjectClosure(value, { confirmation: "UNDO_PROJECT_CLOSURE", traceId: `v2-project-closure-undo-ui-${Date.now()}` });
      actionDialog = undefined;
      workspace = "reentry";
      recentActionCommitId = result.originalSemanticCommitId;
      message = `Project ${result.object.text} 已恢复 OPEN，本次 Closure 已移除；Logseq 页面和正文保持不变。`;
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
  if (action === "submit-v2-mini-project-restructure" && value) {
    if (v2StructureCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认最终阅读预览、零删除边界与原位结构影响。"; await refresh(); return; }
    const [proposalId, expectedUpdatedAt] = value.split("|");
    v2StructureCommitBusy = true;
    let returnToOrigin = false;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!proposalId || !expectedUpdatedAt || !client?.prepareMiniProjectRestructure || !client.verifyMiniProjectRestructureStep || !client.beginMiniProjectRestructureRecovery || !client.verifyMiniProjectRestructureCompensation) throw new Error("MiniProject 原位重构上下文已失效；没有写入。");
        const executorClient: Pick<LocalServiceClient, "prepareMiniProjectRestructure" | "verifyMiniProjectRestructureStep" | "beginMiniProjectRestructureRecovery" | "verifyMiniProjectRestructureCompensation"> = {
          prepareMiniProjectRestructure: client.prepareMiniProjectRestructure.bind(client),
          verifyMiniProjectRestructureStep: client.verifyMiniProjectRestructureStep.bind(client),
          beginMiniProjectRestructureRecovery: client.beginMiniProjectRestructureRecovery.bind(client),
          verifyMiniProjectRestructureCompensation: client.verifyMiniProjectRestructureCompensation.bind(client),
        };
        const host: MiniProjectRestructureGraphHost = {
          insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
          moveBlock: async (source, target, options) => { await logseq.Editor.moveBlock(source, target, options); },
          removeBlock: async (blockUuid) => { await logseq.Editor.removeBlock(blockUuid); },
        };
        const result = await commitMiniProjectRestructure(executorClient, host, proposalId, expectedUpdatedAt, `v2-mini-project-restructure-ui-${Date.now()}`);
        actionDialog = undefined;
        workspace = "review";
        if (result.status === "COMPLETED") {
          recentActionCommitId = result.semanticCommitId;
          message = "MiniProject 已按最终预览原位重构；原材料 UUID 与正文保持，独立 Undo 已可用。";
          returnToOrigin = originRoute !== undefined;
        } else if (result.status === "STALE") {
          message = "MiniProject 原材料、对象版本或结构已变化；没有开始重构。";
        } else if (result.status === "FAILED_COMPENSATED") {
          recentActionCommitId = result.semanticCommitId;
          message = "MiniProject 原位重构未完成，已恢复原结构；没有报告成功。";
        } else {
          recentActionCommitId = result.semanticCommitId;
          message = `MiniProject 结构需要恢复（${result.errorCode}）；请在系统状态继续同一 Commit，不要重复建立 Proposal。`;
        }
      });
    } finally {
      v2StructureCommitBusy = false;
      await refresh();
    }
    if (returnToOrigin && !latestError) await returnToBusinessOrigin();
    return;
  }
  if (action === "submit-v2-mini-project-restructure-undo" && value) {
    if (v2StructureCommitBusy) return;
    if (!dialogChecked("actionConfirmed")) { latestError = "请确认只在整棵子树未被后续修改时撤销原位重构。"; await refresh(); return; }
    v2StructureCommitBusy = true;
    let returnToOrigin = false;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!client?.prepareMiniProjectRestructureUndo || !client.verifyMiniProjectRestructureUndoStep || !client.beginMiniProjectRestructureUndoRecovery || !client.verifyMiniProjectRestructureUndoCompensation) throw new Error("MiniProject 原位重构 Undo 上下文已失效；没有写入。");
        const executorClient: Pick<LocalServiceClient, "prepareMiniProjectRestructureUndo" | "verifyMiniProjectRestructureUndoStep" | "beginMiniProjectRestructureUndoRecovery" | "verifyMiniProjectRestructureUndoCompensation"> = {
          prepareMiniProjectRestructureUndo: client.prepareMiniProjectRestructureUndo.bind(client),
          verifyMiniProjectRestructureUndoStep: client.verifyMiniProjectRestructureUndoStep.bind(client),
          beginMiniProjectRestructureUndoRecovery: client.beginMiniProjectRestructureUndoRecovery.bind(client),
          verifyMiniProjectRestructureUndoCompensation: client.verifyMiniProjectRestructureUndoCompensation.bind(client),
        };
        const host: MiniProjectRestructureGraphHost = {
          insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
          moveBlock: async (source, target, options) => { await logseq.Editor.moveBlock(source, target, options); },
          removeBlock: async (blockUuid) => { await logseq.Editor.removeBlock(blockUuid); },
        };
        const result = await undoMiniProjectRestructure(executorClient, host, value, `v2-mini-project-restructure-undo-ui-${Date.now()}`);
        actionDialog = undefined;
        workspace = "review";
        recentActionCommitId = result.originalSemanticCommitId;
        if (result.status === "COMPLETED") {
          message = "MiniProject 已通过独立 inverse Commit 恢复原材料结构；审阅与 Commit 历史保留。";
          returnToOrigin = originRoute !== undefined;
        } else if (result.status === "FAILED_COMPENSATED") {
          message = "结构撤销未完成，但已恢复到撤销前的已应用结构；原 Commit 仍有效。";
        } else {
          message = `结构撤销需要恢复（${result.errorCode}）；请在系统状态继续同一 inverse Commit。`;
        }
      });
    } finally {
      v2StructureCommitBusy = false;
      await refresh();
    }
    if (returnToOrigin && !latestError) await returnToBusinessOrigin();
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
    const lifecycleAction = rawAction === "CANCEL" || rawAction === "REOPEN" || rawAction === "ARCHIVE" ? rawAction : undefined;
    v2LifecycleCommitBusy = true;
    try {
      await refresh();
      await run(async () => {
        const client = serviceRuntimeClient;
        if (!proposalId || !expectedUpdatedAt || !lifecycleAction || !client) throw new Error("Lifecycle Commit 上下文已失效；没有写入。");
        const stored = (await client.listProposals()).find((candidate) => candidate.proposal.proposalId === proposalId);
        if (!stored || stored.updatedAt !== expectedUpdatedAt) throw new Error("Proposal 已变化；请刷新后重新检查原因。");
        const observations = await collectV2ProposalGraphObservations(stored.proposal, { getBlock: (id) => logseq.Editor.getBlock(id, { includeChildren: false }), getPage: (id) => logseq.Editor.getPage(id) });
        const confirmation = lifecycleAction === "CANCEL" ? "CANCEL_OBJECT" : lifecycleAction === "REOPEN" ? "REOPEN_OBJECT" : "ARCHIVE_OBJECT";
        const result = await client.commitLifecycleTransition(proposalId, { expectedUpdatedAt, confirmation, observations, traceId: `v2-reasoned-lifecycle-ui-${Date.now()}` });
        actionDialog = undefined;
        workspace = "review";
        if (result.status === "COMPLETED") recentActionCommitId = result.semanticCommitId;
        message = result.status === "COMPLETED" ? `${lifecycleAction === "CANCEL" ? "取消" : lifecycleAction === "REOPEN" ? "重开" : "归档"}已正式生效；原因保留在已应用 Proposal，正文与其他状态轴未改变。` : "对象版本已变化；Proposal 已标记 STALE，没有改变 Lifecycle。";
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
      message = result.status === "COMPLETED"
        ? "这次修改已经应用；需要时可以在刚刚的结果中撤销。"
        : result.status === "STALE"
          ? "内容已发生变化，这次修改没有应用；请重新检查。"
          : "这次修改没有完成；正文已恢复到安全状态。";
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
    }, "方案已审阅，尚未应用；确认应用前系统会重新检查当前内容。");
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
    const returnToOrigin = cancelActionDialogReturnsToOrigin(actionDialog?.kind, originRoute !== undefined);
    if (actionDialog?.kind === "v2-mini-project-grill") miniProjectGrillController.clear();
    if (actionDialog?.kind === "v2-project-creation-grill") projectCreationGrillController.clear();
    if (actionDialog?.kind === "v2-creation-session") creationSessionController.clear();
    if (actionDialog?.kind === "v2-project-closure-evidence") v2ProjectClosureEvidence = undefined;
    if (actionDialog?.kind === "v2-project-closure-evidence") v2ProjectClosureProposalMessage = undefined;
    if (actionDialog?.kind === "v2-project-closure-evidence") v2ProjectClosureUserJudgments = undefined;
    if (actionDialog?.kind === "v2-project-closure-evidence") v2ProjectClosureDraftFields = undefined;
    if (actionDialog?.kind === "v2-backup-restore") backupRestoreController.clear();
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

const onRootClick = createDelegatedActionHandler(async (action, value) => {
  beginUiAction(action);
  await handleAction(action, value);
}, (error) => {
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
  const root = requireAppRoot();
  const onNowMenuKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    const openMenu = root.querySelector<HTMLDetailsElement>("details.more-actions[open]");
    if (!openMenu) return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (target && !openMenu.contains(target)) return;
    event.preventDefault();
    openMenu.open = false;
    openMenu.querySelector("summary")?.focus();
  };
  const onNowMenuPointerDown = (event: PointerEvent): void => {
    const openMenu = root.querySelector<HTMLDetailsElement>("details.more-actions[open]");
    if (!openMenu) return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (target && openMenu.contains(target)) return;
    openMenu.open = false;
  };
  const onNowMenuToggle = (event: Event): void => {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    const details = event.target;
    const summary = details.querySelector(":scope > summary");
    if (summary) summary.setAttribute("aria-expanded", details.open ? "true" : "false");
    if (details.matches(".now-worksite-collapsed")) {
      const objectId = details.dataset.worksiteObject;
      if (!objectId) return;
      worksitePreviewController.setExpanded(objectId, details.open);
      if (!details.open) return;
      worksitePreviewController.setExpandedMode(objectId, "short");
      const item = lastNowWorkItems.find((candidate) => candidate.objectId === objectId);
      if (!item?.primaryAnchorExternalId) return;
      void worksitePreviewController.load(item.objectId, item.primaryAnchorExternalId, item.version, "short").then(() => {
        if (logseq.isMainUIVisible && workspace === "now") void refresh();
      });
    }
    if (details.matches(".now-work-overflow")) {
      worksitePreviewController.setOverflowOpen(details.open);
    }
  };
  const onDirectoryInput = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event instanceof InputEvent && event.isComposing) return;
    if (event.target.dataset.field === "agentDecisionSearch") {
      if (agentDecisionSearchTimer !== undefined) globalThis.clearTimeout(agentDecisionSearchTimer);
      const input = event.target;
      agentDecisionSearchTimer = globalThis.setTimeout(() => {
        agentDecisionSearchTimer = undefined;
        agentDecisionSearch = input.value;
        const token = captureUiFocus(input);
        void refresh().then(() => {
          if (token) restoreUiFocus(requireAppRoot(), token);
        });
      }, 250);
      return;
    }
    if (event.target.dataset.field !== "v2DirectorySearch") return;
    if (v2DirectorySearchTimer !== undefined) globalThis.clearTimeout(v2DirectorySearchTimer);
    const input = event.target;
    v2DirectorySearchTimer = globalThis.setTimeout(() => {
      v2DirectorySearchTimer = undefined;
      v2DirectoryFilter = { ...v2DirectoryFilter, search: input.value };
      const token = captureUiFocus(input);
      void refresh().then(() => {
        if (token) restoreUiFocus(requireAppRoot(), token);
      });
    }, 250);
  };
  const onDirectoryChange = (event: Event): void => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const field = event.target.dataset.field;
    const value = event.target.value;
    if (field === "agentDecisionFilter") {
      if (!["ALL", "NEEDS_HUMAN", "FAILED", "SHADOW"].includes(value)) return;
      agentDecisionFilter = value as AgentGovernanceUiState["decisionFilter"];
      const token = captureUiFocus(event.target);
      void refresh().then(() => {
        if (token) restoreUiFocus(requireAppRoot(), token);
      });
      return;
    }
    const next = field === "v2DirectoryTypeFilter"
      ? { ...v2DirectoryFilter, type: value as DirectoryFilterState["type"] }
      : field === "v2DirectoryLifecycleFilter"
        ? { ...v2DirectoryFilter, lifecycle: value as DirectoryFilterState["lifecycle"] }
        : field === "v2DirectoryConditionFilter"
          ? { ...v2DirectoryFilter, condition: value as DirectoryFilterState["condition"] }
          : field === "v2DirectorySort"
            ? { ...v2DirectoryFilter, sort: value as DirectoryFilterState["sort"] }
            : undefined;
    if (!next) return;
    v2DirectoryFilter = next;
    const token = captureUiFocus(event.target);
    void refresh().then(() => {
      if (token) restoreUiFocus(requireAppRoot(), token);
    });
  };
  const onGovernanceTabsKeyDown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.getAttribute("role") !== "tab") return;
    if (!event.target.closest("[data-agent-governance-tabs]")) return;
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs = event.target.closest<HTMLElement>("[data-agent-governance-tabs]");
    if (!tabs) return;
    const buttons = Array.from(tabs.querySelectorAll<HTMLElement>('[role="tab"]'));
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = buttons.length - 1;
    const target = buttons[next];
    const value = target?.dataset.value;
    if (!target || !value) return;
    if (value === agentGovernanceView) {
      target.focus({ preventScroll: true });
      return;
    }
    target.focus({ preventScroll: true });
    agentGovernanceView = value as AgentGovernanceView;
    void refresh();
  };
  root.addEventListener("keydown", onNowMenuKeyDown);
  root.addEventListener("pointerdown", onNowMenuPointerDown);
  root.addEventListener("toggle", onNowMenuToggle, true);
  root.addEventListener("input", onDirectoryInput);
  root.addEventListener("change", onDirectoryChange);
  root.addEventListener("keydown", onGovernanceTabsKeyDown);
  uiBound = true;
  cleanupHooks.push(() => {
    unbind();
    root.removeEventListener("keydown", onNowMenuKeyDown);
    root.removeEventListener("pointerdown", onNowMenuPointerDown);
    root.removeEventListener("toggle", onNowMenuToggle, true);
    root.removeEventListener("input", onDirectoryInput);
    root.removeEventListener("change", onDirectoryChange);
    root.removeEventListener("keydown", onGovernanceTabsKeyDown);
    if (v2DirectorySearchTimer !== undefined) globalThis.clearTimeout(v2DirectorySearchTimer);
    v2DirectorySearchTimer = undefined;
    if (agentDecisionSearchTimer !== undefined) globalThis.clearTimeout(agentDecisionSearchTimer);
    agentDecisionSearchTimer = undefined;
    uiBound = false;
    if (appRoot) appRoot.replaceChildren();
  });
}

async function showTaskCopilot(): Promise<void> {
  logseq.showMainUI({ autoFocus: true });
  await refresh();
}

async function showTaskCopilotFromGeneralEntry(): Promise<void> {
  beginUiAction("open-task-copilot");
  await clearBusinessOrigin();
  v2ReentryTargetObjectId = undefined;
  v2ProviderTarget.clear();
  await showTaskCopilot();
}

async function openFromToolbar(): Promise<void> {
  beginUiAction("open-toolbar-destination");
  await clearBusinessOrigin();
  v2ReentryTargetObjectId = undefined;
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
  requireAppRoot().innerHTML = await fullDiagnosticsHtml();
}

async function showRuntimeDiagnosticsFromGeneralEntry(): Promise<void> {
  beginUiAction("open-system-status");
  await clearBusinessOrigin();
  v2ProviderTarget.clear();
  await showRuntimeDiagnostics();
}

async function processCurrentBlockFromCommand(): Promise<void> {
  const block = RuntimeShapeAdapter.block(await logseq.Editor.getCurrentBlock());
  if (!block) throw new Error("请先选中一个有正文的 Logseq Block；没有调用 Provider。");
  await processBlockFromContext(block.uuid);
}

async function processBlockFromContext(blockUuid: string): Promise<void> {
  if (serviceRuntimeClient) {
    const resolved = await resolveBlockObject(serviceRuntimeClient, blockUuid, "").catch(() => undefined);
    if (resolved?.object.objectType === "MINI_PROJECT") {
      await openMiniProjectGrillFromContext(blockUuid);
      return;
    }
  }
  await bindBusinessOrigin(await originRouteController.captureBlock(blockUuid));
  v2ProviderTarget.bind(blockUuid);
  try {
    beginUiAction("v2-provider-analyze-current-block");
    await showTaskCopilot();
    await handleAction("v2-provider-analyze-current-block");
  } finally {
    v2ProviderTarget.clear();
  }
}

async function returnToBusinessOrigin(): Promise<void> {
  const token = originRoute;
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
  const availability = formalActionAvailability();
  if (!availability.available) {
    if (availability.reason === "ENDED_BY_USER") {
      diagnostics.setNotice({
        code: "SERVICE_ENDED_BY_USER",
        message: "本次 Task Copilot 已结束；命令未执行，正式内容没有变化。",
        next_step: "需要正式能力时，请先重新启动 Task Copilot。",
      });
      await showTaskCopilot();
      return;
    }
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
  beginUiAction(actionId);
  const correlationId = `TC-block-${Date.now()}`;
  const availability = formalActionAvailability();
  if (!availability.available) {
    const ended = availability.reason === "ENDED_BY_USER";
    diagnostics.setNotice({
      code: ended ? "SERVICE_ENDED_BY_USER" : "FEATURE_NOT_READY",
      message: ended
        ? "本次 Task Copilot 已结束；Block 右键操作未执行。"
        : "Task Copilot 功能尚未就绪；Block 右键操作未执行。",
      next_step: ended
        ? "需要正式能力时，请先重新启动 Task Copilot。"
        : "请打开 Task Copilot 查看系统状态和失败阶段。",
    });
    operationalLogger.log("warn", "ui-action", "block_context_action_unavailable", {
      correlationId,
      actionId,
      result: ended ? "ended-by-user" : "feature-not-ready",
    });
    await showBlockContextMessage(
      ended
        ? "本次 Task Copilot 已结束；正式状态没有改变。需要正式能力时，请先重新启动 Task Copilot。"
        : "Task Copilot 尚未就绪；正式状态没有改变。请打开 Task Copilot 查看系统状态。",
      "warning",
    );
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
    await showBlockContextMessage(`${explanation} 原内容保持原位。`, "error");
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
  beginUiAction("block-condition-open");
  const correlationId = `TC-block-condition-${Date.now()}`;
  const availability = formalActionAvailability();
  if (!availability.available) {
    const ended = availability.reason === "ENDED_BY_USER";
    diagnostics.setNotice({
      code: ended ? "SERVICE_ENDED_BY_USER" : "FEATURE_NOT_READY",
      message: ended
        ? "本次 Task Copilot 已结束；Block 状态未改变。"
        : "Task Copilot 功能尚未就绪；Block 状态未改变。",
      next_step: ended
        ? "需要正式能力时，请先重新启动 Task Copilot。"
        : "请打开 Task Copilot 查看系统状态和失败阶段。",
    });
    operationalLogger.log("warn", "ui-action", "block_condition_open_unavailable", {
      correlationId,
      actionId: "block-condition-open",
      result: ended ? "ended-by-user" : "feature-not-ready",
    });
    await showBlockContextMessage(
      ended
        ? "本次 Task Copilot 已结束；原状态未改变。需要正式能力时，请先重新启动 Task Copilot。"
        : "Task Copilot 尚未就绪；原状态未改变。请打开 Task Copilot 查看系统状态。",
      "warning",
    );
    return;
  }
  try {
    const capturedOrigin = await originRouteController.captureBlock(blockUuid);
    const prepared = await blockConditionController.prepare(blockUuid);
    await bindBusinessOrigin(capturedOrigin);
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
    await showBlockContextMessage(`${explanation} 原内容保持原位。`, "error");
  }
}

async function openMiniProjectGrillFromContext(blockUuid: string): Promise<void> {
  beginUiAction("mini-project-grill-open");
  const correlationId = `TC-mini-project-grill-${Date.now()}`;
  if (!formalActionAvailability().available || !serviceRuntimeClient) {
    await showBlockContextMessage("智能梳理暂时不可用；没有开始讨论，原内容保持原位。", "warning");
    return;
  }
  try {
    const { object } = await resolveBlockObject(serviceRuntimeClient, blockUuid, "没有开始讨论，原内容保持原位。");
    if (object.objectType !== "MINI_PROJECT") {
      throw new Error("当前 Block 对应的正式对象不是 MiniProject；没有开始讨论。");
    }
    const capturedOrigin = await originRouteController.captureBlock(blockUuid);
    await bindBusinessOrigin(capturedOrigin);
    workspace = "objects";
    actionDialog = { kind: "v2-mini-project-grill", value: `${object.objectId}|${object.version}` };
    latestError = undefined;
    await showTaskCopilot();
    await miniProjectGrillController.start(object.objectId, object.version);
    operationalLogger.log("info", "ui-action", "mini_project_grill_opened_from_block", {
      correlationId,
      actionId: "mini-project-grill-open",
      result: miniProjectGrillController.snapshot()[object.objectId]?.status ?? "discarded",
    });
  } catch (error) {
    operationalLogger.log("error", "ui-action", "mini_project_grill_open_failed", {
      correlationId,
      actionId: "mini-project-grill-open",
      result: "error",
      blockUuid,
    }, error);
    await showBlockContextMessage(`${explain(error)} 原内容保持原位。`, "error");
  }
}

async function undoBlockConditionFromContext(): Promise<void> {
  await runBlockContextAction("block-condition-undo", () => blockConditionController.undoLast());
}

async function openPageContextFromMenu(page: string): Promise<void> {
  beginUiAction("page-context-open");
  await guardedFeatureCommand(async () => {
    pageContext = await pageContextController.open(page);
    await bindBusinessOrigin(originRouteController.capturePage(pageContext));
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

async function openCurrentProjectReentryFromPageHead(): Promise<void> {
  beginUiAction("project-page-reentry-open");
  await guardedFeatureCommand(async () => {
    const current = await pageContextController.resolveCurrentProject();
    if (!current) {
      void projectPageHeadActionController.refreshAll().catch(() => undefined);
      throw new Error("当前主 Page 已不再对应 active Project；没有打开其他项目。");
    }
    const snapshot = await pageContextController.open(current.pageUuid);
    if (
      snapshot.originSurface !== "MAIN_PAGE"
      || !snapshot.project
      || snapshot.project.objectId !== current.project.objectId
      || snapshot.project.objectVersion !== current.project.objectVersion
    ) {
      throw new Error("当前 Project Page 在打开期间发生变化；旧顶部入口已作废。");
    }
    pageContext = snapshot;
    await bindBusinessOrigin(originRouteController.capturePage(snapshot));
    v2ReentryTargetObjectId = snapshot.project.objectId;
    workspace = "reentry";
    actionDialog = undefined;
    latestError = undefined;
    message = `已从当前 Page 恢复“${snapshot.project.objectText}”的同一正式重入投影。`;
    operationalLogger.log("info", "source-resolution", "project_page_head_reentry_opened", {
      result: "ready",
      objectId: snapshot.project.objectId,
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
      return guardedFeatureCommand(async () => {
        beginUiAction("open-review");
        await clearBusinessOrigin();
        await openWorkspace("review");
      });
    },
    openNowWork: () => {
      return guardedFeatureCommand(async () => {
        beginUiAction("open-now");
        await clearBusinessOrigin();
        await openWorkspace("now");
      });
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
    openProjectReentry: openCurrentProjectReentryFromPageHead,
    observeProjectPageHeadSlot: (slot) => projectPageHeadActionController.observe(slot),
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
  bootstrapRegistration.registerProjectPageHeadAction(host, callbacks);
  bindUi();
  requireAppRoot().innerHTML = renderRuntimeDiagnostics(diagnostics.snapshot());
  markReady("MAIN_UI_REGISTERED", "main UI registered");
  diagnostics.ready("BOOTSTRAP_STARTED");
}

async function environmentInfo(timeoutMs = 2_000): Promise<void> {
  const [graph, version] = await Promise.all([
    settleRuntimeBridgeCall(logseq.App.getCurrentGraph(), timeoutMs).catch(() => null),
    settleRuntimeBridgeCall(logseq.App.getInfo("version"), timeoutMs).catch(() => "unavailable"),
  ]);
  const graphShape = graph as { name?: unknown; url?: unknown; path?: unknown } | null;
  const graphLabel = graphShape && typeof graphShape.name === "string" ? graphShape.name : "unavailable";
  const graphIdentity = graphShape && typeof graphShape.path === "string"
    ? graphShape.path
    : graphShape?.url;
  currentGraphKey = typeof graphIdentity === "string"
    ? await deriveLauncherGraphKey(graphIdentity).catch(() => undefined)
    : undefined;
  await restoreBusinessOriginForCurrentGraph();
  diagnostics.setEnvironment(graphLabel || "available (identity shape unavailable)", typeof version === "string" ? version : JSON.stringify(version));
}

async function recoverCurrentGraphIdentity(): Promise<boolean> {
  if (currentGraphKey !== undefined) return true;
  return recoverServiceRuntime({
    refresh: () => environmentInfo(750),
    ready: () => currentGraphKey !== undefined,
    maximumAttempts: 4,
  });
}

async function recoverCurrentGraphRuntime(successMessage?: string): Promise<boolean> {
  const identityReady = await recoverCurrentGraphIdentity();
  if (!identityReady) {
    enterRestrictedServiceMode("GRAPH_IDENTITY_UNAVAILABLE", "Logseq 尚未提供当前 Graph 身份；正式写入保持关闭。");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    featureReady = false;
    message = "Task Copilot 正在等待 Logseq 完成当前 Graph 初始化；正文仍可编辑，正式写入保持关闭。";
    return false;
  }
  if (runtimeEndedByUser) {
    enterRestrictedServiceMode("SERVICE_ENDED_BY_USER", "本次 Task Copilot 已安全结束；Logseq 正文仍可正常编辑。");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    featureReady = false;
    message = "本次 Task Copilot 已安全结束；切换页面或知识库不会自动重新启动。";
    await refreshToolbarInterventionFacts();
    await projectPageHeadActionController.refreshAll();
    if (logseq.isMainUIVisible) await refresh();
    else await refreshMountedDiagnostics();
    return false;
  }
  const recovered = await recoverConfiguredServiceRuntime(configuredServiceDescriptorPath);
  featureReady = recovered;
  diagnostics.setStoreStatus(recovered ? "READY" : "READ_ONLY_SAFE_MODE");
  message = recovered
    ? successMessage
    : "当前 Graph 尚未配置 Task Copilot 本地数据库；正式写入保持关闭，Graph 正文仍可编辑。";
  await refreshToolbarInterventionFacts();
  await projectPageHeadActionController.refreshAll();
  if (logseq.isMainUIVisible) await refresh();
  else await refreshMountedDiagnostics();
  return recovered;
}

async function handleCurrentGraphChanged(): Promise<void> {
  await clearBusinessOrigin();
  durableOriginLoadedGraphKey = undefined;
  worksitePreviewController.invalidate();
  worksiteChangeRouter.clear();
  if (worksiteRefreshTimer !== undefined) {
    globalThis.clearTimeout(worksiteRefreshTimer);
    worksiteRefreshTimer = undefined;
  }
  lastNowWorkItems = [];
  lastNowWorkFocusIds = new Set();
  actionDialog = undefined;
  v2ConditionUndoPreparation = undefined;
  v2ProjectClosureEvidence = undefined;
  v2ProjectClosureProposalBusy = false;
  v2ProjectClosureProposalMessage = undefined;
  v2ProjectClosureUserJudgments = undefined;
  v2ProjectClosureDraftFields = undefined;
  v2ReentryTargetObjectId = undefined;
  v2ProviderTarget.clear();
  attentionShadowSession.clear();
  projectContextRecoveryController.clear();
  miniProjectGrillController.clear();
  projectCreationGrillController.clear();
  lastAttentionShadowSummarySignature = undefined;
  enterRestrictedServiceMode("GRAPH_SWITCH_IN_PROGRESS", "正在为新的 Graph 重新绑定本地运行环境；正式写入暂停。");
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  featureReady = false;
  serviceDiscoveryGeneration += 1;
  currentGraphKey = undefined;
  await refreshRestrictedGraphSwitchSurface();
  await releaseServiceLifecycleSession();
  await recoverCurrentGraphRuntime("已为当前知识库重新建立连接；没有复用上一知识库的数据。");
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
    {
      key: "appearance",
      type: "enum",
      title: "界面外观",
      description: "默认跟随 Logseq。若知识库的 custom.css 强制了另一种外观，可在这里明确选择浅色或深色；只影响 Task Copilot 显示。",
      default: "auto",
      enumChoices: ["auto", "light", "dark"],
      enumPicker: "radio",
    },
  ]);
  markReady("SETTINGS_READY");

  diagnostics.start("SERVICE_CONNECTION_READY");
  const descriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
  let lastDescriptorSettingValue = descriptorPath;
  configuredServiceDescriptorPath = typeof descriptorPath === "string" ? descriptorPath : undefined;
  enterRestrictedServiceMode("GRAPH_IDENTITY_PENDING", "正在等待 Logseq 提供当前 Graph 身份；正式写入暂停。");
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
  const recoverAfterHostGraphReady = () => {
    void projectPageHeadActionController.refreshAll()
      .catch((error: unknown) => operationalLogger.log("warn", "source-resolution", "project_page_head_refresh_failed", {
        result: "hidden",
        errorCode: explain(error),
      }));
    void recoverCurrentGraphIdentity()
      .then(() => resolveDurableOriginAfterReload())
      .catch((error: unknown) => operationalLogger.log("warn", "plugin-lifecycle", "durable_origin_resolve_failed", {
        result: "parked",
        errorCode: explain(error),
      }));
    if (serviceConnection.status === "READY" && serviceRuntimeClient) return;
    currentGraphKey = undefined;
    void recoverCurrentGraphRuntime()
      .catch((error: unknown) => {
        operationalLogger.log("warn", "plugin-lifecycle", "host_ready_runtime_recovery_failed", {
          result: "restricted",
          errorCode: error instanceof StructuredError ? error.code : "HOST_READY_RUNTIME_RECOVERY_FAILED",
        });
      });
  };
  cleanupHooks.push(logseq.App.onGraphAfterIndexed(recoverAfterHostGraphReady));
  cleanupHooks.push(logseq.App.onRouteChanged(recoverAfterHostGraphReady));

  if (typeof descriptorPath !== "string" || !descriptorPath.trim()) {
    firstRunMode = true;
    cleanupHooks.push(logseq.onSettingsChanged(() => {
      const nextDescriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
      if (nextDescriptorPath === ignoredDescriptorSettingValue) {
        ignoredDescriptorSettingValue = undefined;
        lastDescriptorSettingValue = nextDescriptorPath;
        return;
      }
      if (nextDescriptorPath === lastDescriptorSettingValue) {
        void refreshToolbarInterventionFacts();
        return;
      }
      lastDescriptorSettingValue = nextDescriptorPath;
      void refreshServiceRuntime(nextDescriptorPath)
        .then(async () => {
          featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
          firstRunAction = "start";
          await refreshToolbarInterventionFacts();
          await projectPageHeadActionController.refreshAll();
          if (logseq.isMainUIVisible) void refresh();
        })
        .catch((error: unknown) => operationalLogger.log("error", "plugin-lifecycle", "service_connection_refresh_failed", { result: "error" }, error));
    }));
    markReady("EVENTS_READY");
    markReady("PLUGIN_READY", "first-run welcome ready; no Graph scan, migration, or model call performed");
    await refreshToolbarInterventionFacts();
    await projectPageHeadActionController.refreshAll();
    await refreshMountedDiagnostics();
    return;
  }

  await activateConnectedFeatureRuntime();
  await refreshToolbarInterventionFacts();
  cleanupHooks.push(logseq.onSettingsChanged(() => {
    const nextDescriptorPath = (logseq.settings as { serviceDescriptorPath?: unknown } | undefined)?.serviceDescriptorPath;
    if (nextDescriptorPath === ignoredDescriptorSettingValue) {
      ignoredDescriptorSettingValue = undefined;
      lastDescriptorSettingValue = nextDescriptorPath;
      return;
    }
    if (nextDescriptorPath === lastDescriptorSettingValue) {
      void refreshToolbarInterventionFacts();
      return;
    }
    lastDescriptorSettingValue = nextDescriptorPath;
    void refreshServiceRuntime(nextDescriptorPath)
      .then(async () => {
        featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
        diagnostics.setStoreStatus(serviceConnection.status === "READY" ? "READY" : "READ_ONLY_SAFE_MODE");
        message = `设置已更新；V2 Local Service ${serviceConnection.status}，正式领域状态与历史未受影响。`;
        await refreshToolbarInterventionFacts();
        await projectPageHeadActionController.refreshAll();
        if (logseq.isMainUIVisible) void refresh();
      })
      .catch((error: unknown) => operationalLogger.log("error", "plugin-lifecycle", "service_connection_refresh_failed", { result: "error" }, error));
  }));
  markReady("EVENTS_READY");
  featureReady = serviceConnection.status === "READY" && Boolean(serviceRuntimeClient);
  await projectPageHeadActionController.refreshAll();
  markReady("PLUGIN_READY", "V2 Local Service runtime ready; V1 FileStorage is migration-only");
  void recoverCurrentGraphRuntime()
    .catch((error: unknown) => operationalLogger.log("warn", "plugin-lifecycle", "startup_runtime_recovery_failed", {
      result: "restricted",
      errorCode: error instanceof StructuredError ? error.code : "STARTUP_RUNTIME_RECOVERY_FAILED",
    }));
}

async function main(): Promise<void> {
  try {
    registerBootstrapShell();
  } catch (error) {
    const failedStage = diagnostics.snapshot().stages.slice().reverse().find((stage) => stage.status === "RUNNING")?.stage ?? "BOOTSTRAP_STARTED";
    diagnostics.fail(failedStage, error);
    operationalLogger.log("error", "plugin-lifecycle", "bootstrap_shell_failed", {
      result: "restricted",
      errorCode: `${failedStage}_FAILED`,
    }, error);
    return;
  }

  const onUnhandledRejection = (event: PromiseRejectionEvent) => operationalLogger.log("error", "plugin-lifecycle", "unhandled_rejection", {}, event.reason);
  const onGlobalError = (event: ErrorEvent) => operationalLogger.log("error", "plugin-lifecycle", "global_error", {}, event.error ?? event.message);
  globalThis.addEventListener("unhandledrejection", onUnhandledRejection);
  globalThis.addEventListener("error", onGlobalError);
  cleanupHooks.push(() => globalThis.removeEventListener("unhandledrejection", onUnhandledRejection));
  cleanupHooks.push(() => globalThis.removeEventListener("error", onGlobalError));
  const themeRoot = requireAppRoot();
  const readVisibleThemeMode = () => {
    const explicitMode = configuredThemeMode((logseq.settings as { appearance?: unknown } | undefined)?.appearance);
    if (explicitMode) return explicitMode;
    try {
      const visibleHostDocument = globalThis.parent?.document ?? globalThis.document;
      return detectVisibleThemeMode(visibleHostDocument)
        ?? detectSystemThemeMode(globalThis.matchMedia?.bind(globalThis));
    } catch {
      return detectSystemThemeMode(globalThis.matchMedia?.bind(globalThis));
    }
  };
  cleanupHooks.push(await registerHostThemeModeSync(
    logseq.App,
    themeRoot,
    (error) => operationalLogger.log("warn", "plugin-lifecycle", "theme_mode_initial_read_failed", {
      result: "css_fallback",
    }, error),
    readVisibleThemeMode,
  ));
  cleanupHooks.push(logseq.onSettingsChanged(() => {
    const mode = readVisibleThemeMode();
    if (mode) applyHostThemeMode(themeRoot, mode);
  }));
  operationalLogger.log("info", "plugin-lifecycle", "event_listeners_registered", { result: "success" });
  cleanupHooks.push(() => worksiteChangeRouter.dispose());
  cleanupHooks.push(() => worksitePreviewController.dispose());
  cleanupHooks.push(() => {
    if (worksiteRefreshTimer !== undefined) {
      globalThis.clearTimeout(worksiteRefreshTimer);
      worksiteRefreshTimer = undefined;
    }
  });

  logseq.beforeunload(async () => {
    for (const off of cleanupHooks.splice(0).reverse()) off();
    projectPageHeadActionController.clear();
    await releaseServiceLifecycleSession();
    featureReady = false;
    logseq.hideMainUI();
    operationalLogger.log("info", "plugin-lifecycle", "plugin_unloaded", { result: "success" });
  });

  try {
    await initializeFeatures();
  } catch (error) {
    const failedStage = diagnostics.snapshot().stages.find((stage) => stage.status === "RUNNING")?.stage ?? "APPLICATION_READY";
    diagnostics.fail(failedStage, error, "READ_ONLY_SAFE_MODE");
    diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
    diagnostics.setRecoveryState("initialization stopped; no automatic Graph write performed");
    featureReady = false;
    toolbarFacts = { proposals: [], semanticCommits: [], available: false };
    updateToolbarIntervention();
    operationalLogger.log("error", "plugin-lifecycle", "feature_initialization_failed", {
      result: "restricted",
      errorCode: `${failedStage}_FAILED`,
    }, error);
    try {
      requireAppRoot().innerHTML = renderRuntimeDiagnostics(diagnostics.snapshot());
    } catch (renderError) {
      operationalLogger.log("error", "plugin-lifecycle", "diagnostic_fallback_render_failed", {
        result: "restricted",
        errorCode: "DIAGNOSTIC_FALLBACK_RENDER_FAILED",
      }, renderError);
    }
  }
  for (const delay of [3_000, 8_000]) {
    setTimeout(() => {
      void resolveDurableOriginAfterReload().catch((error: unknown) => operationalLogger.log(
        "warn",
        "plugin-lifecycle",
        "durable_origin_boot_resolve_failed",
        { result: "parked", errorCode: explain(error) },
      ));
    }, delay);
  }
}

void logseq.ready().then(main).catch((error: unknown) => operationalLogger.log(
  "error",
  "plugin-lifecycle",
  "bootstrap_before_fallback_failed",
  { result: "restricted", errorCode: "BOOTSTRAP_BEFORE_FALLBACK_FAILED" },
  error,
));
