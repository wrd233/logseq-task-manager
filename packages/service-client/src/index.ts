import type { AgentDecision, AgentDecisionEvent, AgentFeedbackCompatibilityGroup, AgentFeedbackInput, AgentGovernanceExportPackage, AgentGovernanceRetentionPreview, AgentGovernanceRetentionResult, AgentGovernanceSettings, AgentReviewSignal, AgentReviewSignalStatus, AgentRuleAuthorization, LegacyMigrationPreview, LegacyMigrationReviewDecision, V2Anchor, V2Association, V2Candidate, V2CandidateDisposition, V2CandidateKind, V2Condition, V2ExecutionMarker, V2ManagedObject, V2MiniProjectClosure, V2ObjectType, V2PrimaryOwnership, V2Proposal, V2ProposalGroupDecision, V2ProposalRevalidationResult, V2ProposalScopeObservation } from "@task-copilot/domain";
import { validateAgentDecision, validateAgentDecisionEvent, validateAgentGovernanceExportPackage, validateAgentGovernanceRetentionPreview, validateAgentGovernanceSettings, validateAgentReviewSignal, validateAgentRuleAuthorization } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export const LOCAL_SERVICE_PROTOCOL_VERSION = 1;

export interface ServiceCapabilities {
  formalWrites: boolean;
  migration: boolean;
  provider: boolean;
  backup: boolean;
  graphReadBridge?: boolean;
}

export interface ServiceDescriptor {
  protocolVersion: number;
  url: string;
  token: string;
  pid: number;
  createdAt: string;
}

export interface ServiceHealth {
  status: "READY";
  protocolVersion: number;
  capabilities: ServiceCapabilities;
}

export interface ServiceStatus extends ServiceHealth {
  databaseSchemaVersion: number;
  objectCount: number;
}

export interface ServiceDoctor {
  status: "PASS" | "FAIL";
  schemaVersion: number;
  integrity: string;
  foreignKeyViolations: number;
  objectCount: number;
  checks?: ServiceDoctorCheck[];
  summary?: { pass: number; warn: number; fail: number; info: number };
  limitations?: string[];
}

export interface ServiceDoctorCheck {
  component: "LOCAL_SERVICE" | "GRAPH" | "SQLITE" | "SCHEMA" | "ANCHOR" | "IDENTITY" | "PROPOSAL" | "SEMANTIC_COMMIT" | "BACKUP" | "KEY_REFERENCE" | "PROVIDER" | "SKILL_PROFILE" | "LOGGING" | "PROTOCOL";
  status: "PASS" | "WARN" | "FAIL" | "INFO";
  code: string;
  count?: number;
}

export interface ServiceBackupCreated {
  backupId: string;
  createdAt: string;
  validation: ServiceDoctor;
}

export interface ServiceBackupValidation {
  backupId: string;
  validation: ServiceDoctor;
}

export interface ServiceBackupSummary {
  backupId: string;
  createdAt: string;
  status: "VALID" | "INVALID";
  schemaVersion?: number;
  objectCount?: number;
}

export interface ServiceBackupCatalog {
  backups: ServiceBackupSummary[];
  total: number;
  limited: boolean;
}

export interface ServiceBackupRestored {
  status: "RESTORED_SERVICE_STOPPING";
  backupId: string;
  recoveryBackupId: string;
  validation: ServiceDoctor;
}

export interface ServiceSkillSummary {
  name: "task-copilot-core" | "design-project" | "recover-context" | "mini-project-modeling" | "project-creation-modeling";
  version: string;
  description: string;
  sha256: string;
}

export interface ServiceSkillDocument extends ServiceSkillSummary {
  content: string;
}

export interface ServiceContextPackageManifest {
  schemaVersion: 1;
  generatedAt: string;
  scope: { kind: "block" | "page" | "object" | "project"; id: string };
  authority: "READ_ONLY_DERIVATIVE";
  formalFactsSource: "SQLITE";
  graphExcerptStatus: "NOT_INCLUDED" | "AVAILABLE_FROM_LOGSEQ_BRIDGE";
  includedObjectCount: number;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

export interface ServiceContextPackage {
  manifest: ServiceContextPackageManifest;
  files: Record<string, string>;
}

export interface ServiceContextExportResult {
  contextPackage: ServiceContextPackage;
  fingerprint: string;
}

export interface ServiceUnifiedUxOutput {
  schemaVersion: "task-copilot-ux-output-v1";
  summary: string;
  facts: Array<{ text: string; sourceRefs: string[] }>;
  inferences: Array<{ text: string; evidenceRefs: string[] }>;
  unknowns: string[];
  suggestedChanges: Array<{
    kind: "DRAFT_PROPOSAL";
    summary: string;
    evidenceRefs: string[];
    riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  }>;
  nextActionEligible: boolean;
  nextAction?: {
    intent: "OPEN_SOURCE" | "OPEN_REVIEW" | "ASK_USER";
    label: string;
    targetRef: string;
  };
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  requiresDiscussion: boolean;
  requiresReview: boolean;
  evidenceScope: { refs: string[]; observedAt: string; scopeHash: string };
  provenance: {
    kind: "LLM_DRAFT";
    contractVersion: string;
    promptVersion: string;
    skillName: string;
    skillVersion: string;
    providerId: string;
    providerVersion: string;
    model: string;
    generatedAt: string;
  };
}

export interface ServiceProjectContextRecoveryRequest {
  objectId: string;
  expectedVersion: number;
}

export interface ServiceProjectContextRecoveryResult {
  output: ServiceUnifiedUxOutput;
  provider: ServiceProviderCompletionMetadata;
  promptBundleVersion: string;
  contextFingerprint: string;
  interactionId?: string;
}

export interface ServiceProjectNarrationProposalResult {
  record: ServiceStoredProposal;
  replayed: boolean;
  provider: ServiceProviderCompletionMetadata;
  promptBundleVersion: string;
  contextFingerprint: string;
  interactionId?: string;
}

export interface ServiceMiniProjectGrillRequest {
  objectId: string;
  expectedVersion: number;
  answers: Array<{ uncertaintyId: string; text: string }>;
}

export type ServiceProjectCreationGrillRequest =
  | { sourceKind: "BLANK"; answers: Array<{ uncertaintyId: string; text: string }> }
  | { sourceKind: "PAGE"; pageId: string; answers: Array<{ uncertaintyId: string; text: string }> }
  | { sourceKind: "MINI_PROJECT"; objectId: string; expectedVersion: number; answers: Array<{ uncertaintyId: string; text: string }> };

export interface ServiceGrillTurn {
  schemaVersion: "task-copilot-grill-turn-v1";
  understanding: string;
  facts: Array<{ text: string; sourceRefs: string[] }>;
  inferences: Array<{ text: string; evidenceRefs: string[] }>;
  unknowns: Array<{ uncertaintyId: string; dimension: "OUTCOME" | "BOUNDARY" | "COMPLETION_EVIDENCE" | "UNCLASSIFIED_MATERIAL" | "INTERNAL_CLOSURE" | "CURRENT_INTERFACE" | "PAGE_OBJECT_RELATIONSHIP"; text: string }>;
  readiness: "CONTINUE" | "READY_FOR_PREVIEW";
  questionGroup?: { focusUncertaintyId: string; questions: Array<{ uncertaintyId: string; text: string }>; recommendation?: { text: string; evidenceRefs: string[]; tradeoffs: string[] } };
  evidenceScope: { refs: string[]; scopeHash: string; observedAt: string };
  authorityBoundary: "SESSION_DRAFT_ONLY";
  provenance: { contractVersion: string; promptVersion: string; skillName: string; skillVersion: string; providerId: string; providerVersion: string; model: string; generatedAt: string };
}

export interface ServiceMiniProjectGrillResult {
  output: ServiceGrillTurn;
  provider: ServiceProviderCompletionMetadata;
  promptBundleVersion: string;
  contextFingerprint: string;
}
export type ServiceProjectCreationGrillResult = ServiceMiniProjectGrillResult;

export type ServiceProjectCreationPreviewRequest = ServiceProjectCreationGrillRequest;
export interface ServiceProjectCreationPreview {
  schemaVersion: "task-copilot-project-creation-preview-v1";
  finalReading: {
    title: ServiceGrillPreviewClaim;
    outcome: ServiceGrillPreviewClaim;
    boundary: { included: ServiceGrillPreviewClaim[]; excluded: ServiceGrillPreviewClaim[] };
    completionEvidence: ServiceGrillPreviewClaim[];
    internalClosure: ServiceGrillPreviewClaim;
    currentInterface: ServiceGrillPreviewClaim;
  };
  pageObjectRelationship: {
    mode: "CREATE_DEDICATED_PROJECT_PAGE" | "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE" | "REUSE_SOURCE_PAGE" | "REVIEW_REQUIRED";
    rationale: string;
    evidenceRefs: string[];
    authority: "PROPOSED_FOR_REVIEW";
  };
  sourceMaterials: Array<{
    materialId: string;
    sourceRef: string;
    contentHash: string;
    text: string;
    disposition: "KEEP_IN_PLACE" | "LINK_AS_SOURCE" | "REVIEW_FOR_MOVE";
    rationale: string;
    evidenceRefs: string[];
    preservation: "UNCHANGED";
  }>;
  formalImpact: { createsObject: false; createsPage: false; movesBlocks: 0; rewritesBlocks: 0; deletesBlocks: 0 };
  evidenceScope: { refs: string[]; scopeHash: string; observedAt: string };
  authorityBoundary: "SESSION_PREVIEW_ONLY";
  provenance: { contractVersion: string; promptVersion: string; skillName: string; skillVersion: string; providerId: string; providerVersion: string; model: string; generatedAt: string };
}
export interface ServiceProjectCreationPreviewResult {
  output: ServiceProjectCreationPreview;
  provider: ServiceProviderCompletionMetadata;
  promptBundleVersion: string;
  contextFingerprint: string;
  previewHandle: string;
}
export interface ServiceProjectCreationProposalRequest { previewHandle: string }
export interface ServiceProjectCreationProposalResult { record: ServiceStoredProposal; replayed: boolean }
export interface ServicePrepareProposalProjectCreationRequest {
  confirmation: "CREATE_PROJECT";
  expectedUpdatedAt: string;
  traceId: string;
}
export interface ServiceFinalizeProposalProjectCreationRequest {
  expectedUpdatedAt: string;
  semanticCommitId: string;
  objectId: string;
  pageExternalId: string;
  pageContentHash: string;
  traceId: string;
}
export interface ServicePreparedProposalProjectCreation {
  status: "PREPARED";
  semanticCommitId: string;
  proposalId: string;
  expectedUpdatedAt: string;
  objectId: string;
  pageName: string;
  relationshipMode: "CREATE_DEDICATED_PROJECT_PAGE" | "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE" | "REUSE_SOURCE_PAGE";
  pageExternalId?: string;
  pageContentHash?: string;
  replayed: boolean;
}
export type ServiceProposalProjectCreationPreparation =
  | ServicePreparedProposalProjectCreation
  | (Omit<ServicePreparedProposalProjectCreation, "status"> & {
      status: "RECOVERY_REQUIRED";
      pageExternalId: string;
      pageContentHash: string;
      replayed: true;
    })
  | ({ status: "STALE" } & ServiceProposalRevalidation)
  | {
      status: "COMPLETED";
      semanticCommitId: string;
      proposalId: string;
      expectedUpdatedAt: string;
      objectId: string;
      pageName: string;
      relationshipMode: ServicePreparedProposalProjectCreation["relationshipMode"];
      pageExternalId: string;
      object: V2ManagedObject;
      anchor: V2Anchor;
      record: ServiceStoredProposal;
      replayed: true;
    };
export type ServiceProposalProjectCreationFinalization =
  | {
      status: "COMPLETED";
      semanticCommitId: string;
      object: V2ManagedObject;
      anchor: V2Anchor;
      record: ServiceStoredProposal;
      replayed: boolean;
    }
  | {
      status: "COMPENSATION_REQUIRED";
      semanticCommitId: string;
      proposalId: string;
      expectedUpdatedAt: string;
      relationshipMode: ServicePreparedProposalProjectCreation["relationshipMode"];
      pageExternalId: string;
      pageContentHash: string;
    };
export interface ServiceCompensateProposalProjectCreationRequest {
  expectedUpdatedAt: string;
  semanticCommitId: string;
  pageExternalId: string;
  pageContentHash: string;
  pageExists: boolean;
  traceId: string;
}
export interface ServiceProposalProjectCreationCompensation {
  status: "FAILED_COMPENSATED";
  semanticCommitId: string;
  proposalId: string;
  record: ServiceStoredProposal;
  pagePreserved: boolean;
}
export type ServiceProjectCreationSourceReturnTarget =
  | { kind: "BLOCK"; externalId: string }
  | { kind: "PAGE"; externalId: string };
export type ServiceProposalProjectCreationUndoPreparation =
  | {
      status: "PAGE_PREFLIGHT_REQUIRED";
      originalSemanticCommitId: string;
      undoSemanticCommitId: string;
      proposalId: string;
      pageName: string;
      pageExternalId: string;
      objectId: string;
      pageContentHash: string;
      sourceReturnTarget?: ServiceProjectCreationSourceReturnTarget;
      replayed: boolean;
    }
  | {
      status: "PAGE_DELETION_REQUIRED" | "RECOVERY_REQUIRED";
      originalSemanticCommitId: string;
      undoSemanticCommitId: string;
      proposalId: string;
      pageName: string;
      pageExternalId: string;
      objectId: string;
      pageContentHash: string;
      sourceReturnTarget?: ServiceProjectCreationSourceReturnTarget;
      replayed: boolean;
    }
  | {
      status: "COMPLETED";
      originalSemanticCommitId: string;
      undoSemanticCommitId: string;
      proposalId: string;
      pageExternalId: string;
      pagePreserved: boolean;
      sourceReturnTarget?: ServiceProjectCreationSourceReturnTarget;
      replayed: boolean;
    };
export interface ServiceProposalProjectCreationUndoFinalization {
  status: "COMPLETED";
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  pagePreserved: boolean;
  sourceReturnTarget?: ServiceProjectCreationSourceReturnTarget;
  replayed: boolean;
}

export type ServiceMiniProjectGrillPreviewRequest = ServiceMiniProjectGrillRequest;
export interface ServiceGrillPreviewClaim { text: string; evidenceRefs: string[] }
export interface ServiceGrillPreviewMaterial { materialId: string; sourceRef: string; contentHash: string; text: string; preservation: "UNCHANGED" }
export interface ServiceGrillPreview {
  schemaVersion: "task-copilot-grill-preview-v1";
  finalReading: {
    title: ServiceGrillPreviewClaim;
    outcome: ServiceGrillPreviewClaim;
    boundary: { included: ServiceGrillPreviewClaim[]; excluded: ServiceGrillPreviewClaim[] };
    completionEvidence: ServiceGrillPreviewClaim[];
    sections: Array<{ sectionId: string; heading: string; purpose: string; sourceMaterials: ServiceGrillPreviewMaterial[]; derivedBlocks: ServiceGrillPreviewClaim[] }>;
  };
  unclassified: Array<{ materialId: string; sourceRef: string; contentHash: string; text: string; reason: string; evidenceRefs: string[]; preservation: "UNCHANGED_IN_PLACE" }>;
  impact: { sourceMaterialCount: number; movedMaterialCount: number; addedDerivedBlockCount: number; deletedMaterialCount: 0; unclassifiedMaterialCount: number };
  evidenceScope: { refs: string[]; scopeHash: string; observedAt: string };
  authorityBoundary: "SESSION_PREVIEW_ONLY";
  provenance: { contractVersion: string; promptVersion: string; skillName: string; skillVersion: string; providerId: string; providerVersion: string; model: string; generatedAt: string };
}
export interface ServiceMiniProjectGrillPreviewResult {
  output: ServiceGrillPreview;
  provider: ServiceProviderCompletionMetadata;
  promptBundleVersion: string;
  contextFingerprint: string;
  previewHandle: string;
}
export interface ServiceMiniProjectGrillProposalRequest { objectId: string; expectedVersion: number; previewHandle: string }
export interface ServiceMiniProjectGrillProposalResult { record: ServiceStoredProposal; replayed: boolean }

export type ServiceMiniProjectRestructureStep =
  | { operationId: string; kind: "CREATE_BLOCK"; blockUuid: string; parentBlockUuid: string; previousSiblingUuid: string | null; text: string; contentHash: string; beforeHash: string; afterHash: string }
  | { operationId: string; kind: "MOVE_BLOCK"; blockUuid: string; contentHash: string; fromParentBlockUuid: string; fromPreviousSiblingUuid: string | null; applyFromParentBlockUuid: string; applyFromPreviousSiblingUuid: string | null; toParentBlockUuid: string; toPreviousSiblingUuid: string | null; beforeHash: string; afterHash: string };
export type ServiceMiniProjectRestructureCompensationStep =
  | { operationId: string; kind: "REMOVE_CREATED_BLOCK"; blockUuid: string; contentHash: string; expectedParentBlockUuid: string; expectedPreviousSiblingUuid: string | null }
  | { operationId: string; kind: "MOVE_BLOCK"; blockUuid: string; contentHash: string; fromParentBlockUuid: string; fromPreviousSiblingUuid: string | null; toParentBlockUuid: string; toPreviousSiblingUuid: string | null };
export interface ServiceMiniProjectRestructurePlan {
  proposalId: string; groupId: string; objectId: string; expectedVersion: number; sourceRootBlockUuid: string; sourceScopeHash: string; sourceStructureHash: string; expectedStructureHash: string;
  steps: ServiceMiniProjectRestructureStep[]; compensationSteps: ServiceMiniProjectRestructureCompensationStep[];
}
export interface ServiceMiniProjectRestructurePreparation {
  status: "PREPARED";
  semanticCommitId: string;
  proposalId: string;
  expectedUpdatedAt: string;
  plan: ServiceMiniProjectRestructurePlan;
  stepStatuses: Array<"PREPARED" | "APPLIED" | "VERIFIED" | "COMPENSATED" | "RECOVERY_REQUIRED">;
  replayed: boolean;
  formalGraphWritesExecuted: false;
}
export type ServiceMiniProjectRestructurePreparationResult =
  | ServiceMiniProjectRestructurePreparation
  | ({ status: "STALE" } & ServiceProposalRevalidation)
  | { status: "COMPLETED"; semanticCommitId: string; proposalId: string; record: ServiceStoredProposal; replayed: true }
  | { status: "RECOVERY_REQUIRED"; semanticCommitId: string; proposalId: string; expectedUpdatedAt: string; plan: ServiceMiniProjectRestructurePlan; stepStatuses: Array<"PREPARED" | "APPLIED" | "VERIFIED" | "COMPENSATED" | "RECOVERY_REQUIRED">; failedStepIndex: number; errorCode: string; replayed: true; formalGraphWritesExecuted: false }
  | { status: "FAILED_COMPENSATED"; semanticCommitId: string; proposalId: string; record: ServiceStoredProposal; replayed: true };
export type ServiceMiniProjectRestructureStepVerification =
  | { status: "NOT_APPLIED" | "VERIFIED"; semanticCommitId: string; proposalId: string; stepIndex: number; stepStatus: "PREPARED" | "VERIFIED"; nextStepIndex?: number }
  | { status: "COMPLETED"; semanticCommitId: string; proposalId: string; record: ServiceStoredProposal; replayed: boolean }
  | { status: "RECOVERY_REQUIRED"; semanticCommitId: string; proposalId: string; stepIndex: number; errorCode: string };
export type ServiceMiniProjectRestructureRecoveryResult =
  | { status: "COMPENSATION_REQUIRED"; semanticCommitId: string; proposalId: string; compensations: Array<{ stepIndex: number; step: ServiceMiniProjectRestructureCompensationStep }>; replayed: boolean }
  | { status: "NOT_COMPENSATED" | "COMPENSATED"; semanticCommitId: string; proposalId: string; stepIndex: number; nextStepIndex?: number }
  | { status: "FAILED_COMPENSATED"; semanticCommitId: string; proposalId: string; record: ServiceStoredProposal; replayed: boolean }
  | { status: "MANUAL_RECOVERY_REQUIRED"; semanticCommitId: string; proposalId: string; stepIndex: number; errorCode: string };

export interface ServiceMiniProjectRestructureUndoPreparation {
  status: "PREPARED";
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  proposalId: string;
  sourceRootBlockUuid: string;
  sourceStructureHash: string;
  expectedStructureHash: string;
  steps: Array<{ stepIndex: number; forwardStepIndex: number; step: ServiceMiniProjectRestructureCompensationStep }>;
  stepStatuses: Array<"PREPARED" | "APPLIED" | "VERIFIED" | "COMPENSATED" | "RECOVERY_REQUIRED">;
  replayed: boolean;
  formalGraphWritesExecuted: false;
}
export type ServiceMiniProjectRestructureUndoPreparationResult =
  | ServiceMiniProjectRestructureUndoPreparation
  | { status: "COMPLETED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; replayed: true }
  | { status: "RECOVERY_REQUIRED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; sourceRootBlockUuid: string; sourceStructureHash: string; expectedStructureHash: string; steps: Array<{ stepIndex: number; forwardStepIndex: number; step: ServiceMiniProjectRestructureCompensationStep }>; stepStatuses: Array<"PREPARED" | "APPLIED" | "VERIFIED" | "COMPENSATED" | "RECOVERY_REQUIRED">; failedStepIndex: number; errorCode: string; replayed: true; formalGraphWritesExecuted: false }
  | { status: "FAILED_COMPENSATED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; replayed: true };
export type ServiceMiniProjectRestructureUndoStepVerification =
  | { status: "NOT_APPLIED" | "VERIFIED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; stepIndex: number; stepStatus: "PREPARED" | "VERIFIED"; nextStepIndex?: number }
  | { status: "COMPLETED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; replayed: boolean }
  | { status: "RECOVERY_REQUIRED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; stepIndex: number; errorCode: string };
export type ServiceMiniProjectRestructureUndoRecoveryResult =
  | { status: "COMPENSATION_REQUIRED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; compensations: Array<{ stepIndex: number; forwardStepIndex: number; step: ServiceMiniProjectRestructureStep }>; replayed: boolean }
  | { status: "NOT_COMPENSATED" | "COMPENSATED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; stepIndex: number; nextStepIndex?: number }
  | { status: "FAILED_COMPENSATED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; replayed: boolean }
  | { status: "MANUAL_RECOVERY_REQUIRED"; originalSemanticCommitId: string; undoSemanticCommitId: string; proposalId: string; stepIndex: number; errorCode: string };

export type ServiceInteractionDisposition = "HELPFUL" | "NOT_NEEDED" | "INACCURATE" | "TOO_MUCH" | "DO_NOT_REPEAT";
export interface ServiceInteractionEvidenceSummary {
  total: number;
  rated: number;
  helpfulRate: number | null;
  noiseRate: number | null;
  dispositions: Record<ServiceInteractionDisposition, number>;
  outcomes: Record<string, number>;
  versions: Array<{ versionKey: string; total: number; generated: number; rejected: number; errors: number; rated: number; helpful: number; noise: number; doNotRepeat: number; helpfulRate: number | null; noiseRate: number | null }>;
}

export type ServiceGraphReadQuery =
  | { kind: "PAGE"; target: string; depth: number }
  | { kind: "BLOCK"; target: string; includeChildren: boolean; parents: number }
  | { kind: "RESOLVE"; target: string };

export type ServiceGraphReadRequest = ServiceGraphReadQuery & {
  requestId: string;
  requestedAt: string;
  expiresAt: string;
};

export interface ServiceGraphBlockExcerpt {
  uuid: string;
  content: string;
  contentHash: string;
  relation: "PARENT" | "ROOT" | "CHILD";
  depth: number;
  parentUuid?: string;
  pageUuid?: string;
  pageName?: string;
}

export interface ServiceGraphSnapshot {
  kind: "PAGE" | "BLOCK";
  requestedTarget: string;
  resolved: { kind: "PAGE" | "BLOCK"; id: string; name?: string; version?: number; evidenceHash?: string };
  blocks: ServiceGraphBlockExcerpt[];
  truncated: boolean;
  readAt: string;
  scopeHash: string;
}

export type ServiceGraphReadResult =
  | { requestId: string; status: "FOUND"; snapshot: ServiceGraphSnapshot }
  | { requestId: string; status: "NOT_FOUND" }
  | { requestId: string; status: "ERROR"; errorCode: string; message: string };

export interface ServiceAgentGovernanceObservationRequest {
  changedBlockId: string;
  changedBlockCount: number;
}

export interface ServiceAgentGovernanceObservationResult {
  status: "IGNORED" | "DEFERRED" | "UNCHANGED" | "RECORDED";
  gateAction: "IGNORE_THIS_CHANGE" | "UPDATE_REVIEW_SIGNAL" | "RUN_LOCAL" | "RUN_EXPANDED" | "DEFER_TO_BATCH";
  decision?: AgentDecision;
}

export interface ServiceAgentFeedbackCommand {
  feedback: AgentFeedbackInput;
  traceId: string;
  idempotencyKey: string;
}

export interface ServiceAgentFeedbackResult {
  event: AgentDecisionEvent;
  authorization?: AgentRuleAuthorization;
  replayed: boolean;
}

export interface ServiceAgentBulkFeedbackCommand extends ServiceAgentFeedbackCommand {
  decisionIds: string[];
}

export interface ServiceAgentBulkFeedbackResult {
  groups: AgentFeedbackCompatibilityGroup[];
  results: ServiceAgentFeedbackResult[];
}

export interface ServiceAgentGovernanceMutationCommand {
  traceId: string;
  idempotencyKey: string;
}

export interface ServiceAgentRulePauseCommand extends ServiceAgentGovernanceMutationCommand {
  paused: boolean;
}

export interface ServiceAgentGlobalPauseCommand extends ServiceAgentGovernanceMutationCommand {
  globalWritesPaused: boolean;
}

export interface ServiceAgentObservationCommand extends ServiceAgentGovernanceMutationCommand {
  observationEnabled: boolean;
}

export interface ServiceAgentExpandedContextCommand extends ServiceAgentGovernanceMutationCommand {
  expandedContextEnabled: boolean;
}

export interface ServiceAgentRetentionCommand extends ServiceAgentGovernanceMutationCommand {
  confirmation: "EXPIRE_REVIEW_SIGNAL_INDEX_ONLY";
}

export type ServiceLegacyMigrationPreview = LegacyMigrationPreview;

export interface ServiceLegacyMigrationScanReport {
  schemaVersion: 1;
  sourceBundleSha256: string;
  sourceCreatedAt: string;
  status: "SCANNED";
  zeroFormalWrites: true;
  counts: { total: number; directBind: number; needsConfirmation: number; keepOrdinary: number; structuralError: number };
  previews: ServiceLegacyMigrationPreview[];
  reviewItems: Array<{ legacyObjectId: string; displayTitle: string; titleTruncated: boolean; sourceObjectType: string }>;
}

export interface ServiceMigrationRun {
  runId: string; sourceBundleSha256: string; sourceCreatedAt: string;
  status: "PREVIEWED" | "IMPORTING" | "VERIFIED" | "ACTIVATED" | "FAILED" | "CANCELLED";
  summary: { total: number; import: number; keepOrdinary: number; defer: number; exclude: number };
  snapshotBackupId?: string; createdAt: string; updatedAt: string;
}

export interface ServiceMigrationBatch {
  batchId: string; runId: string; idempotencyKey: string; sourceHash: string;
  status: "PREPARED" | "IMPORTED" | "VERIFIED" | "UNDONE" | "FAILED";
  objectIds: string[]; importedCount: number; validation?: { status: "PASS"; objectCount: number; checksum: string };
  createdAt: string; updatedAt: string;
}

export interface ServiceMigrationRunDetails {
  run: ServiceMigrationRun;
  evidence: Array<{ legacyObjectId: string; decision: LegacyMigrationReviewDecision; targetObjectId?: string; [key: string]: unknown }>;
  batches: ServiceMigrationBatch[];
}

export interface ServicePromptLayer {
  version: string;
  content: string;
}

export interface ServiceProposalPromptBundle {
  core: ServicePromptLayer;
  domain: ServicePromptLayer;
  skill: ServicePromptLayer;
  userSemantics: ServicePromptLayer;
  runtimeContext: ServicePromptLayer;
}

export interface ServiceProviderCompletionMetadata {
  requestId?: string;
  model: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  attempts: number;
}

export type ServiceGeneratedProposalResult = {
  generated: {
    kind: "PROPOSAL";
    proposal: V2Proposal;
    files: { proposalMd: string; proposalJson: string };
    provider: ServiceProviderCompletionMetadata;
    promptBundleVersion: string;
  };
  record: ServiceStoredProposal;
  replayed: boolean;
} | {
  generated: {
    kind: "NO_PROPOSAL";
    reason: string;
    provider: ServiceProviderCompletionMetadata;
    promptBundleVersion: string;
  };
  replayed: false;
};

export interface ServiceRevisedProposalResult {
  generated: Extract<ServiceGeneratedProposalResult, { generated: { kind: "PROPOSAL" } }>["generated"];
  record: ServiceStoredProposal;
}

export interface ServiceMiniProjectClosureDraftResult {
  record: ServiceStoredProposal;
  provider: ServiceProviderCompletionMetadata;
  promptBundleVersion: string;
}

export interface ServiceProjectClosureEvidenceItem {
  text: string;
  sourceRefs: string[];
  evidenceKind: "PROJECT_STRUCTURE" | "OWNED_OBJECT";
}

export interface ServiceProjectClosureEvidenceDraft {
  schemaVersion: "task-copilot-project-closure-evidence-v1";
  project: {
    objectId: string;
    version: number;
    text: string;
    currentSummary: string;
    sourceRefs: string[];
  };
  goalCandidates: ServiceProjectClosureEvidenceItem[];
  deliverableCandidates: ServiceProjectClosureEvidenceItem[];
  decisionCandidates: ServiceProjectClosureEvidenceItem[];
  completedWorkCandidates: ServiceProjectClosureEvidenceItem[];
  unresolvedWork: Array<ServiceProjectClosureEvidenceItem & { condition: string; lifecycle: V2ManagedObject["lifecycle"] }>;
  objectiveJudgments: Array<{
    objective: {
      objectiveId: string;
      text: string;
      priority: "PRIMARY" | "SECONDARY";
      sourceRefs: string[];
    };
    evidence: ServiceProjectClosureEvidenceItem[];
    disposition: "NEEDS_USER_JUDGMENT";
  }>;
  userJudgments: Array<{
    judgment: "ORIGINAL_GOAL" | "ACTUAL_RESULT" | "OBJECTIVE_DISPOSITIONS" | "LEGACY_DISPOSITION" | "KEY_DECISIONS" | "FUTURE_SUMMARY";
    reason: string;
  }>;
  unknowns: Array<{
    code: "ORIGINAL_GOAL_UNKNOWN" | "DELIVERABLE_EVIDENCE_MISSING" | "KEY_DECISION_EVIDENCE_MISSING" | "OBJECTIVE_COMPLETION_NOT_INFERRED" | "ACTUAL_RESULT_REQUIRES_CONFIRMATION";
    text: string;
  }>;
  evidenceScopeHash: string;
  authorityBoundary: "READ_ONLY_EVIDENCE_DRAFT";
}

export interface ServiceProjectClosureUserJudgments {
  actualResult: string;
  objectiveDispositions: Array<
    | { objectiveId: string; disposition: "COMPLETED" }
    | { objectiveId: string; disposition: "INCOMPLETE"; reason: string; nextStep: string }
  >;
  legacyDisposition: string;
  keyDecisions: string[];
  futureSummary: string;
}

export type ServiceProjectClosureProposalResult =
  | {
      kind: "NO_PROPOSAL";
      reason: string;
      provider: { requestId: string; model: string; finishReason: string; totalTokens: number; durationMs: number; attempts: number };
      promptBundleVersion: string;
      replayed: false;
    }
  | {
      kind: "PROPOSAL";
      record: ServiceStoredProposal;
      replayed: boolean;
      provider: { requestId: string; model: string; finishReason: string; totalTokens: number; durationMs: number; attempts: number };
      promptBundleVersion: string;
      evidenceScopeHash: string;
    };

export interface ServiceMaterializeExplicitObjectRequest {
  objectType: Extract<V2ObjectType, "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT">;
  text: string;
  marker?: V2ExecutionMarker;
  externalId: string;
  inputVersion: string;
  contentHash: string;
  idempotencyKey: string;
  traceId: string;
}

export interface ServiceMaterializeExplicitObjectResult {
  object: V2ManagedObject;
  anchor: V2Anchor;
  replayed: boolean;
}

export interface ServiceCreateAreaRequest {
  text: string;
  traceId: string;
}

export interface ServiceEditAreaRequest extends ServiceCreateAreaRequest {
  expectedVersion: number;
}

export interface ServiceAreaCommandResult {
  object: V2ManagedObject;
  replayed: boolean;
}

export interface ServiceSynchronizeExplicitObjectResult extends ServiceMaterializeExplicitObjectResult {
  operation: "MATERIALIZED" | "SYNCHRONIZED" | "PROPOSAL_CREATED";
  proposalId?: string;
}

export interface ServicePrimaryAnchorPage {
  anchors: V2Anchor[];
  nextCursor?: string;
}

export interface ServiceAddAssociationRequest {
  sourceObjectId: string;
  targetObjectId: string;
  expectedVersion: number;
  confirmation: "ADD_ASSOCIATION";
  traceId: string;
}

export interface ServicePrimaryAnchorObservationRequest {
  anchorId: string;
  status: "active" | "missing" | "conflict";
  traceId: string;
}

export interface ServicePrimaryAnchorRebindRequest {
  previousAnchorId: string;
  previewObjectVersion: number;
  previewAnchorStatus: Exclude<V2Anchor["status"], "replaced">;
  previewAnchorContentHash: string;
  objectType: Extract<V2ObjectType, "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT">;
  text: string;
  externalId: string;
  inputVersion: string;
  contentHash: string;
  confirmation: "REBIND_PRIMARY_ANCHOR";
  traceId: string;
}

export interface ServicePrimaryAnchorRebindResult extends ServiceMaterializeExplicitObjectResult {
  previousAnchor: V2Anchor;
}

export interface ServicePrepareProjectRequest {
  name: string;
  traceId: string;
}

export interface ServiceProjectIntent {
  semanticCommitId: string;
  objectId: string;
  pageName: string;
  status: "PENDING" | "COMPLETED";
  replayed: boolean;
  pageExternalId?: string;
}

export interface ServiceFinalizeProjectRequest {
  semanticCommitId: string;
  objectId: string;
  name: string;
  pageExternalId: string;
  pageContentHash: string;
  traceId: string;
}

export interface ServiceFinalizeProjectResult extends ServiceMaterializeExplicitObjectResult {
  semanticCommitId: string;
  status: "COMPLETED";
}

export interface ServiceProposalValidationResult {
  status: "VALID";
  proposal: V2Proposal;
  files: { proposalMd: string; proposalJson: string };
}

export interface ServiceStoredProposal {
  proposal: V2Proposal;
  files: { proposalMd: string; proposalJson: string };
  updatedAt: string;
}

export interface ServiceProposalRevalidation {
  record: ServiceStoredProposal;
  result: V2ProposalRevalidationResult;
}

export interface ServicePreparedProposalCommit {
  status: "PREPARED" | "COMPLETED" | "RECOVERY_REQUIRED";
  semanticCommitId: string;
  proposalId: string;
  expectedUpdatedAt: string;
  objectId: string;
  plan: {
    proposalId: string;
    groupId: string;
    patch: { blockUuid: string; beforeText: string; afterText: string; beforeHash: string; afterHash: string };
    create: { operationId: string; objectType: "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT"; text: string; blockUuid: string };
  } | {
    proposalId: string;
    groupId: string;
    patch: { blockUuid: string; beforeText: string; afterText: string; beforeHash: string; afterHash: string };
    update: { operationId: string; objectId: string; expectedVersion: number; objectType: "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT"; beforeText: string; text: string; blockUuid: string };
  };
  replayed: boolean;
}

export type ServiceProposalCommitPreparation = ServicePreparedProposalCommit | ({ status: "STALE" } & ServiceProposalRevalidation);
export type ServiceProposalCommitFinalization =
  | { status: "COMPLETED"; semanticCommitId: string; object: V2ManagedObject; anchor: V2Anchor; record: ServiceStoredProposal; replayed: boolean }
  | { status: "COMPENSATION_REQUIRED"; semanticCommitId: string; proposalId: string; expectedUpdatedAt: string; patch: ServicePreparedProposalCommit["plan"]["patch"] };

export type ServiceProjectClosureCommitResult =
  | { status: "COMPLETED"; semanticCommitId: string; object: V2ManagedObject; record: ServiceStoredProposal; replayed: boolean }
  | ({ status: "STALE" } & ServiceProposalRevalidation)
  | { status: "FAILED"; semanticCommitId: string; record: ServiceStoredProposal; errorCode: string; replayed: boolean };
export type ServiceProjectStructureCommitResult =
  | { status: "COMPLETED"; semanticCommitId: string; object: V2ManagedObject; record: ServiceStoredProposal; replayed: boolean }
  | ({ status: "STALE" } & ServiceProposalRevalidation);
export type ServiceLifecycleTransitionCommitResult =
  | { status: "COMPLETED"; semanticCommitId: string; object: V2ManagedObject; anchor?: V2Anchor; record: ServiceStoredProposal; replayed: boolean }
  | ({ status: "STALE" } & ServiceProposalRevalidation);
export type ServiceOwnershipCommitResult =
  | { status: "COMPLETED"; semanticCommitId: string; object: V2ManagedObject; ownership: V2PrimaryOwnership; record: ServiceStoredProposal; replayed: boolean }
  | ({ status: "STALE" } & ServiceProposalRevalidation)
  | { status: "FAILED"; semanticCommitId: string; record: ServiceStoredProposal; errorCode: string; replayed: boolean };
export type ServiceOwnershipUndoResult = {
  status: "COMPLETED";
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  object: V2ManagedObject;
  ownership?: V2PrimaryOwnership;
  replayed: boolean;
};

export type ServiceLifecycleUndoResult = {
  status: "COMPLETED";
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  object: V2ManagedObject;
  replayed: boolean;
};
export type ServiceProjectStructureUndoResult = ServiceLifecycleUndoResult;
export type ServiceProjectClosureUndoResult = ServiceLifecycleUndoResult;

export interface ServiceProposalCommitEvidence {
  semanticCommitId: string;
  proposalId: string;
  expectedUpdatedAt: string;
  blockUuid: string;
  contentHash: string;
  inputVersion: string;
  traceId: string;
}

export interface ServicePreparedProposalUndo {
  status: "PREPARED" | "COMPLETED" | "RECOVERY_REQUIRED";
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  proposalId: string;
  objectId: string;
  patch: ServicePreparedProposalCommit["plan"]["patch"];
  replayed: boolean;
}

export interface ServiceProposalUndoEvidence {
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  blockUuid: string;
  contentHash: string;
  inputVersion: string;
  traceId: string;
}

export interface ServiceSemanticCommit {
  semanticCommitId: string;
  proposalId?: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED" | "UNDONE";
  beforeStateChecksum: string;
  afterStateChecksum?: string;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
}

export interface ServiceNowWorkItem { objectId: string; objectType: V2ObjectType; version: number; text: string; condition: V2Condition; dueAt?: string; updatedAt: string; reason: string; primaryAnchorExternalId?: string }
export interface ServiceNowWorkConditionOption { objectId: string; objectType: V2ObjectType; text: string }
export interface ServiceNowWork { generatedAt: string; focus: ServiceNowWorkItem[]; next: ServiceNowWorkItem[]; waitingReview: ServiceNowWorkItem[]; conditionOptions: ServiceNowWorkConditionOption[] }
export interface ServiceFocusSelection { objectId: string; selectedAt: string; rank: number; expiresAt?: string }
export interface ServiceConditionUndoPreparation {
  status: "PREPARED";
  conditionChangeId: string;
  objectId: string;
  objectText: string;
  expectedVersion: number;
  beforeCondition: V2Condition;
  afterCondition: V2Condition;
  changedAt: string;
}
export interface ServiceConditionUndoRequest {
  conditionChangeId: string;
  expectedVersion: number;
  confirmation: "UNDO_CONDITION";
  traceId: string;
}
export interface ServiceConditionUndoResult {
  status: "COMPLETED";
  conditionChangeId: string;
  object: V2ManagedObject;
  replayed: boolean;
}

export interface ServiceCandidateDiscoveryRequest {
  sourceAnchorId: string;
  sourceVersion: string;
  candidateKind: V2CandidateKind;
  reason: string;
  suggestion: string;
  traceId: string;
}

export interface ServiceCandidateDispositionRequest {
  disposition: Exclude<V2CandidateDisposition, "PENDING" | "RESOLVED">;
  reason: string;
  deferredUntil?: string;
  expectedUpdatedAt: string;
  traceId: string;
}

export interface ServiceCandidateFormalizationRequest {
  sourceAnchorId: string;
  inputVersion: string;
  contentHash: string;
  content: string;
  objectType: "MINI_PROJECT" | "TASK" | "DECISION" | "OUTPUT";
  text: string;
  expectedUpdatedAt: string;
  traceId: string;
}

export interface ServiceCandidateObjectUpdateRequest {
  sourceAnchorId: string;
  sourceInputVersion: string;
  sourceContentHash: string;
  targetObjectId: string;
  targetExternalId: string;
  targetInputVersion: string;
  targetContentHash: string;
  targetContent: string;
  afterContent: string;
  expectedUpdatedAt: string;
  traceId: string;
}

export type ServiceProposalUndoFinalization =
  | { status: "COMPLETED"; originalSemanticCommitId: string; undoSemanticCommitId: string; objectId: string; replayed: boolean }
  | { status: "COMPENSATION_REQUIRED"; originalSemanticCommitId: string; undoSemanticCommitId: string; patch: ServicePreparedProposalUndo["patch"] };

export type ServiceConnectionState =
  | { status: "READY"; capabilities: ServiceCapabilities; formalWritesAvailable: boolean; graphEditingAvailable: true }
  | { status: "RESTRICTED"; reasonCode: string; message: string; formalWritesAvailable: false; graphEditingAvailable: true };

function clientError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-216"], ...(details ? { details } : {}) });
}

function validatedGovernanceArray<T>(value: unknown, key: string, validate: (item: unknown) => T): T[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw clientError("SERVICE_RESPONSE_INVALID", `Local Service ${key} response 不是 object。`);
  const items = (value as Record<string, unknown>)[key];
  if (!Array.isArray(items) || items.length > 100) throw clientError("SERVICE_RESPONSE_INVALID", `Local Service ${key} response 不是受控 array。`);
  return items.map(validate);
}

export function validateServiceDescriptor(value: unknown): ServiceDescriptor {
  if (!value || typeof value !== "object") throw clientError("SERVICE_DESCRIPTOR_INVALID", "Local Service 描述符无效。");
  const candidate = value as Partial<ServiceDescriptor>;
  if (
    typeof candidate.protocolVersion !== "number" ||
    typeof candidate.url !== "string" ||
    typeof candidate.token !== "string" ||
    typeof candidate.pid !== "number" ||
    typeof candidate.createdAt !== "string" ||
    candidate.token.length < 24
  ) {
    throw clientError("SERVICE_DESCRIPTOR_INVALID", "Local Service 描述符字段不完整。");
  }
  let url: URL;
  try {
    url = new URL(candidate.url);
  } catch {
    throw clientError("SERVICE_DESCRIPTOR_INVALID", "Local Service URL 无效。");
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/") {
    throw clientError("SERVICE_DESCRIPTOR_NON_LOOPBACK", "Local Service 描述符必须指向 127.0.0.1 根地址。");
  }
  if (candidate.protocolVersion !== LOCAL_SERVICE_PROTOCOL_VERSION) {
    throw clientError("SERVICE_PROTOCOL_MISMATCH", "Local Service 描述符协议版本不兼容。", {
      expected: LOCAL_SERVICE_PROTOCOL_VERSION,
      actual: candidate.protocolVersion,
    });
  }
  return candidate as ServiceDescriptor;
}

export class LocalServiceClient {
  constructor(
    private readonly descriptor: ServiceDescriptor,
    private readonly timeoutMs = 3000,
  ) {
    validateServiceDescriptor(descriptor);
  }

  private async request<T>(path: string, init?: RequestInit, timeoutMs = this.timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
    const externalSignal = init?.signal;
    const cancelFromCaller = (): void => controller.abort("caller");
    if (externalSignal?.aborted) cancelFromCaller();
    else externalSignal?.addEventListener("abort", cancelFromCaller, { once: true });
    let response: Response;
    try {
      response = await fetch(`${this.descriptor.url}${path.slice(1)}`, {
        ...init,
        headers: { ...init?.headers, authorization: `Bearer ${this.descriptor.token}` },
        signal: controller.signal,
      });
    } catch (error) {
      if (externalSignal?.aborted) throw clientError("SERVICE_REQUEST_CANCELLED", "Local Service 请求已被更新的工作取消。");
      if (controller.signal.aborted) throw clientError("SERVICE_TIMEOUT", "Local Service 请求超时。");
      throw clientError("SERVICE_UNAVAILABLE", "Local Service 不可用；正式语义写入已受限。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", cancelFromCaller);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw clientError("SERVICE_RESPONSE_INVALID", "Local Service 返回了非 JSON 响应。", { status: response.status });
    }
    if (!response.ok) {
      const remoteError = body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: unknown; message?: unknown } }).error
        : undefined;
      const remoteCode = remoteError?.code;
      const remoteMessage = typeof remoteError?.message === "string" && remoteError.message.trim() && remoteError.message.length <= 1_000
        ? remoteError.message.trim()
        : undefined;
      const code = response.status === 401 ? "SERVICE_UNAUTHORIZED" : "SERVICE_HTTP_ERROR";
      throw clientError(code, response.status === 401 ? "Local Service 会话认证失败。" : remoteMessage ?? "Local Service 请求失败。", {
        status: response.status,
        ...(typeof remoteCode === "string" ? { remoteCode } : {}),
      });
    }
    return body as T;
  }

  private assertProtocol(actual: number): void {
    if (actual !== LOCAL_SERVICE_PROTOCOL_VERSION) {
      throw clientError("SERVICE_PROTOCOL_MISMATCH", "Local Service 协议版本不兼容。", {
        expected: LOCAL_SERVICE_PROTOCOL_VERSION,
        actual,
      });
    }
  }

  async health(): Promise<ServiceHealth> {
    const value = await this.request<ServiceHealth>("/health");
    this.assertProtocol(value.protocolVersion);
    return value;
  }

  async status(): Promise<ServiceStatus> {
    const value = await this.request<ServiceStatus>("/status");
    this.assertProtocol(value.protocolVersion);
    return value;
  }

  doctor(): Promise<ServiceDoctor> {
    return this.request<ServiceDoctor>("/doctor", { method: "POST" });
  }

  async listAgentDecisions(input: { limit: number; since?: string }): Promise<AgentDecision[]> {
    const query = new URLSearchParams({ limit: String(input.limit), ...(input.since ? { since: input.since } : {}) });
    return validatedGovernanceArray(await this.request<unknown>(`/agent/decisions?${query}`), "decisions", validateAgentDecision);
  }

  async listAgentDecisionEvents(threadId: string): Promise<AgentDecisionEvent[]> {
    return validatedGovernanceArray(await this.request<unknown>(`/agent/decisions/${encodeURIComponent(threadId)}/events`), "events", validateAgentDecisionEvent);
  }

  async listAgentReviewSignals(input: { status?: AgentReviewSignalStatus; limit: number }): Promise<AgentReviewSignal[]> {
    const query = new URLSearchParams({ limit: String(input.limit), ...(input.status ? { status: input.status } : {}) });
    return validatedGovernanceArray(await this.request<unknown>(`/agent/review-signals?${query}`), "signals", validateAgentReviewSignal);
  }

  async listAgentRuleAuthorizations(): Promise<AgentRuleAuthorization[]> {
    return validatedGovernanceArray(await this.request<unknown>("/agent/rules"), "authorizations", validateAgentRuleAuthorization);
  }

  async getAgentGovernanceSettings(): Promise<AgentGovernanceSettings> {
    const value = await this.request<{ settings?: unknown }>("/agent/settings");
    return validateAgentGovernanceSettings(value.settings);
  }

  async setAgentRulePaused(ruleId: string, input: ServiceAgentRulePauseCommand): Promise<{ authorization: AgentRuleAuthorization; replayed: boolean }> {
    const value = await this.request<{ authorization?: unknown; replayed?: unknown }>(`/agent/rules/${encodeURIComponent(ruleId)}/pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { authorization: validateAgentRuleAuthorization(value.authorization), replayed: Boolean(value.replayed) };
  }

  async setAgentGlobalWritesPaused(input: ServiceAgentGlobalPauseCommand): Promise<{ settings: AgentGovernanceSettings; replayed: boolean }> {
    const value = await this.request<{ settings?: unknown; replayed?: unknown }>("/agent/settings/global-pause", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { settings: validateAgentGovernanceSettings(value.settings), replayed: Boolean(value.replayed) };
  }

  async setAgentObservationEnabled(input: ServiceAgentObservationCommand): Promise<{ settings: AgentGovernanceSettings; replayed: boolean }> {
    const value = await this.request<{ settings?: unknown; replayed?: unknown }>("/agent/settings/observation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { settings: validateAgentGovernanceSettings(value.settings), replayed: Boolean(value.replayed) };
  }

  async setAgentExpandedContextEnabled(input: ServiceAgentExpandedContextCommand): Promise<{ settings: AgentGovernanceSettings; replayed: boolean }> {
    const value = await this.request<{ settings?: unknown; replayed?: unknown }>("/agent/settings/expanded-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { settings: validateAgentGovernanceSettings(value.settings), replayed: Boolean(value.replayed) };
  }

  async previewAgentGovernanceRetention(): Promise<AgentGovernanceRetentionPreview> {
    const value = await this.request<{ preview?: unknown }>("/agent/retention/preview");
    return validateAgentGovernanceRetentionPreview(value.preview);
  }

  async runAgentGovernanceRetention(input: ServiceAgentRetentionCommand): Promise<AgentGovernanceRetentionResult> {
    const value = await this.request<{ preview?: unknown; expiredReviewSignals?: unknown; replayed?: unknown }>("/agent/retention/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const expiredReviewSignals = Number(value.expiredReviewSignals);
    if (!Number.isSafeInteger(expiredReviewSignals) || expiredReviewSignals < 0) throw clientError("SERVICE_RESPONSE_INVALID", "Local Service retention result 无效。");
    return { preview: validateAgentGovernanceRetentionPreview(value.preview), expiredReviewSignals, replayed: Boolean(value.replayed) };
  }

  async recordAgentFeedback(decisionId: string, input: ServiceAgentFeedbackCommand): Promise<ServiceAgentFeedbackResult> {
    const value = await this.request<ServiceAgentFeedbackResult>(`/agent/decisions/${encodeURIComponent(decisionId)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return {
      event: validateAgentDecisionEvent(value.event),
      ...(value.authorization ? { authorization: validateAgentRuleAuthorization(value.authorization) } : {}),
      replayed: Boolean(value.replayed),
    };
  }

  async recordAgentBulkFeedback(input: ServiceAgentBulkFeedbackCommand): Promise<ServiceAgentBulkFeedbackResult> {
    const value = await this.request<ServiceAgentBulkFeedbackResult>("/agent/feedback/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!Array.isArray(value.groups) || !Array.isArray(value.results)) throw clientError("SERVICE_RESPONSE_INVALID", "Local Service 批量 Feedback response 无效。");
    return {
      groups: value.groups,
      results: value.results.map((result) => ({
        event: validateAgentDecisionEvent(result.event),
        ...(result.authorization ? { authorization: validateAgentRuleAuthorization(result.authorization) } : {}),
        replayed: Boolean(result.replayed),
      })),
    };
  }

  async exportAgentSkillFeedback(days: 7 | 30 | 60 | 180): Promise<AgentGovernanceExportPackage> {
    return validateAgentGovernanceExportPackage(await this.request<unknown>("/agent/exports/skill-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days }),
    }));
  }

  async exportAgentReviewEvidence(days: 60 | 180): Promise<AgentGovernanceExportPackage> {
    return validateAgentGovernanceExportPackage(await this.request<unknown>("/agent/exports/review-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days }),
    }, 90_000));
  }

  async observeAgentGovernanceChange(
    input: ServiceAgentGovernanceObservationRequest,
    signal?: AbortSignal,
  ): Promise<ServiceAgentGovernanceObservationResult> {
    const value = await this.request<ServiceAgentGovernanceObservationResult>("/agent/observations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    }, 45_000);
    if (!value || !["IGNORED", "DEFERRED", "UNCHANGED", "RECORDED"].includes(value.status)
      || !["IGNORE_THIS_CHANGE", "UPDATE_REVIEW_SIGNAL", "RUN_LOCAL", "RUN_EXPANDED", "DEFER_TO_BATCH"].includes(value.gateAction)) {
      throw clientError("SERVICE_RESPONSE_INVALID", "Local Service Agent observation response 无效。");
    }
    return { ...value, ...(value.decision ? { decision: validateAgentDecision(value.decision) } : {}) };
  }

  createBackup(): Promise<ServiceBackupCreated> {
    return this.request<ServiceBackupCreated>("/backup/create", { method: "POST" });
  }

  listBackups(): Promise<ServiceBackupCatalog> {
    return this.request<ServiceBackupCatalog>("/backups");
  }

  validateBackup(backupId: string): Promise<ServiceBackupValidation> {
    return this.request<ServiceBackupValidation>("/backup/restore/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backupId }),
    });
  }

  restoreBackup(backupId: string, confirmation: "RESTORE_AND_STOP_SERVICE"): Promise<ServiceBackupRestored> {
    return this.request<ServiceBackupRestored>("/backup/restore/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backupId, confirmation }),
    });
  }

  materializeExplicitObject(input: ServiceMaterializeExplicitObjectRequest): Promise<ServiceMaterializeExplicitObjectResult> {
    return this.request<ServiceMaterializeExplicitObjectResult>("/objects/materialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  synchronizeExplicitObject(input: ServiceMaterializeExplicitObjectRequest): Promise<ServiceSynchronizeExplicitObjectResult> {
    return this.request<ServiceSynchronizeExplicitObjectResult>("/objects/synchronize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async listObjects(): Promise<V2ManagedObject[]> {
    return (await this.request<{ objects: V2ManagedObject[] }>("/objects")).objects;
  }

  createArea(input: ServiceCreateAreaRequest): Promise<ServiceAreaCommandResult> {
    return this.request<ServiceAreaCommandResult>("/areas", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  editArea(objectId: string, input: ServiceEditAreaRequest): Promise<ServiceAreaCommandResult> {
    return this.request<ServiceAreaCommandResult>(`/areas/${encodeURIComponent(objectId)}/edit`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  createMiniProjectClosureProposal(objectId: string, input: { expectedVersion: number }): Promise<{ record: ServiceStoredProposal; replayed: boolean }> {
    return this.request<{ record: ServiceStoredProposal; replayed: boolean }>(`/objects/${encodeURIComponent(objectId)}/closure/proposal`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  getProjectClosureEvidence(objectId: string, input: { expectedVersion: number }): Promise<ServiceProjectClosureEvidenceDraft> {
    return this.request<ServiceProjectClosureEvidenceDraft>(`/objects/${encodeURIComponent(objectId)}/project-closure/evidence`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  createProjectClosureProposal(objectId: string, input: { expectedVersion: number; userJudgments?: ServiceProjectClosureUserJudgments }): Promise<ServiceProjectClosureProposalResult> {
    return this.request<ServiceProjectClosureProposalResult>(`/objects/${encodeURIComponent(objectId)}/project-closure/proposal`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 125_000);
  }

  createLifecycleProposal(objectId: string, input: { expectedVersion: number; action: "CANCEL" | "REOPEN" | "ARCHIVE"; reason: string }): Promise<{ record: ServiceStoredProposal; replayed: boolean }> {
    return this.request<{ record: ServiceStoredProposal; replayed: boolean }>(`/objects/${encodeURIComponent(objectId)}/lifecycle/proposal`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  draftMiniProjectClosure(proposalId: string, input: { expectedUpdatedAt: string; draft: V2MiniProjectClosure }): Promise<ServiceMiniProjectClosureDraftResult> {
    return this.request<ServiceMiniProjectClosureDraftResult>(`/proposals/${encodeURIComponent(proposalId)}/mini-project-closure/draft`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 125_000);
  }

  listPrimaryAnchors(cursor?: string, includeReplaced = false): Promise<ServicePrimaryAnchorPage> {
    const parameters = new URLSearchParams();
    if (cursor) parameters.set("after", cursor);
    if (includeReplaced) parameters.set("includeReplaced", "1");
    const query = parameters.size > 0 ? `?${parameters.toString()}` : "";
    return this.request<ServicePrimaryAnchorPage>(`/anchors/primary${query}`);
  }

  observePrimaryAnchor(input: ServicePrimaryAnchorObservationRequest): Promise<ServiceMaterializeExplicitObjectResult> {
    return this.request<ServiceMaterializeExplicitObjectResult>("/anchors/primary/observe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  rebindPrimaryAnchor(input: ServicePrimaryAnchorRebindRequest): Promise<ServicePrimaryAnchorRebindResult> {
    return this.request<ServicePrimaryAnchorRebindResult>("/anchors/primary/rebind", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async listAssociations(): Promise<V2Association[]> {
    return (await this.request<{ associations: V2Association[] }>("/associations")).associations;
  }

  async listPrimaryOwnerships(): Promise<V2PrimaryOwnership[]> {
    return (await this.request<{ ownerships: V2PrimaryOwnership[] }>("/ownerships/primary")).ownerships;
  }

  async listCandidates(): Promise<V2Candidate[]> {
    return (await this.request<{ candidates: V2Candidate[] }>("/candidates")).candidates;
  }

  discoverCandidate(input: ServiceCandidateDiscoveryRequest): Promise<{ candidate: V2Candidate; replayed: boolean }> {
    return this.request("/candidates/discover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  setCandidateDisposition(candidateId: string, input: ServiceCandidateDispositionRequest): Promise<{ candidate: V2Candidate; replayed: boolean }> {
    return this.request(`/candidates/${encodeURIComponent(candidateId)}/disposition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  formalizeCandidate(candidateId: string, input: ServiceCandidateFormalizationRequest): Promise<{ candidate: V2Candidate; record: ServiceStoredProposal; replayed: boolean }> {
    return this.request(`/candidates/${encodeURIComponent(candidateId)}/formalize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  updateCandidate(candidateId: string, input: ServiceCandidateObjectUpdateRequest): Promise<{ candidate: V2Candidate; record: ServiceStoredProposal; replayed: boolean }> {
    return this.request(`/candidates/${encodeURIComponent(candidateId)}/update`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  addAssociation(input: ServiceAddAssociationRequest): Promise<{ object: V2ManagedObject; association: V2Association; replayed: boolean }> {
    return this.request("/associations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  prepareProject(input: ServicePrepareProjectRequest): Promise<ServiceProjectIntent> {
    return this.request<ServiceProjectIntent>("/projects/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  finalizeProject(input: ServiceFinalizeProjectRequest): Promise<ServiceFinalizeProjectResult> {
    return this.request<ServiceFinalizeProjectResult>("/projects/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  validateProposal(proposal: unknown): Promise<ServiceProposalValidationResult> {
    return this.request<ServiceProposalValidationResult>("/proposals/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proposal),
    });
  }

  async listSkills(): Promise<ServiceSkillSummary[]> {
    return (await this.request<{ skills: ServiceSkillSummary[] }>("/skills")).skills;
  }

  async getSkill(name: string): Promise<ServiceSkillDocument | undefined> {
    try {
      return (await this.request<{ skill: ServiceSkillDocument }>(`/skills/${encodeURIComponent(name)}`)).skill;
    } catch (error) {
      if (error instanceof StructuredError && error.details?.remoteCode === "SKILL_NOT_FOUND") return undefined;
      throw error;
    }
  }

  exportContext(scope: "block" | "page" | "object" | "project", id: string): Promise<ServiceContextExportResult> {
    return this.request<ServiceContextExportResult>("/context/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, id }),
    }, scope === "block" || scope === "page" ? 12_000 : undefined);
  }

  recoverProjectContext(input: ServiceProjectContextRecoveryRequest): Promise<ServiceProjectContextRecoveryResult> {
    return this.request<ServiceProjectContextRecoveryResult>("/provider/ux/project-context-recovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 125_000);
  }

  createProjectNarrationProposal(input: ServiceProjectContextRecoveryRequest): Promise<ServiceProjectNarrationProposalResult> {
    return this.request<ServiceProjectNarrationProposalResult>("/provider/ux/project-narration-proposal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 125_000);
  }

  grillMiniProject(input: ServiceMiniProjectGrillRequest): Promise<ServiceMiniProjectGrillResult> {
    return this.request<ServiceMiniProjectGrillResult>("/provider/grill/mini-project/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 125_000);
  }

  grillProjectCreation(input: ServiceProjectCreationGrillRequest): Promise<ServiceProjectCreationGrillResult> {
    return this.request<ServiceProjectCreationGrillResult>("/provider/grill/project-creation/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 125_000);
  }

  previewProjectCreation(input: ServiceProjectCreationPreviewRequest): Promise<ServiceProjectCreationPreviewResult> {
    return this.request<ServiceProjectCreationPreviewResult>("/provider/grill/project-creation/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 125_000);
  }

  createProjectCreationProposal(input: ServiceProjectCreationProposalRequest): Promise<ServiceProjectCreationProposalResult> {
    return this.request<ServiceProjectCreationProposalResult>("/provider/grill/project-creation/proposal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  prepareProposalProjectCreation(proposalId: string, input: ServicePrepareProposalProjectCreationRequest): Promise<ServiceProposalProjectCreationPreparation> {
    return this.request<ServiceProposalProjectCreationPreparation>(`/proposals/${encodeURIComponent(proposalId)}/project-creation/commit/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  finalizeProposalProjectCreation(proposalId: string, input: ServiceFinalizeProposalProjectCreationRequest): Promise<ServiceProposalProjectCreationFinalization> {
    return this.request<ServiceProposalProjectCreationFinalization>(`/proposals/${encodeURIComponent(proposalId)}/project-creation/commit/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  compensateProposalProjectCreation(proposalId: string, input: ServiceCompensateProposalProjectCreationRequest): Promise<ServiceProposalProjectCreationCompensation> {
    return this.request<ServiceProposalProjectCreationCompensation>(`/proposals/${encodeURIComponent(proposalId)}/project-creation/commit/compensate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  prepareProposalProjectCreationUndo(originalSemanticCommitId: string, input: { traceId: string; confirmedOwnedEmpty?: true; pageExternalId?: string }): Promise<ServiceProposalProjectCreationUndoPreparation> {
    return this.request<ServiceProposalProjectCreationUndoPreparation>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/project-creation/undo/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  finalizeProposalProjectCreationUndo(originalSemanticCommitId: string, input: {
    originalSemanticCommitId: string;
    undoSemanticCommitId: string;
    pageExternalId: string;
    pageExists: boolean;
    traceId: string;
  }): Promise<ServiceProposalProjectCreationUndoFinalization> {
    return this.request<ServiceProposalProjectCreationUndoFinalization>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/project-creation/undo/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  previewMiniProjectGrill(input: ServiceMiniProjectGrillPreviewRequest): Promise<ServiceMiniProjectGrillPreviewResult> {
    return this.request<ServiceMiniProjectGrillPreviewResult>("/provider/grill/mini-project/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 125_000);
  }

  createMiniProjectRestructureProposal(input: ServiceMiniProjectGrillProposalRequest): Promise<ServiceMiniProjectGrillProposalResult> {
    return this.request<ServiceMiniProjectGrillProposalResult>("/provider/grill/mini-project/proposal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  prepareMiniProjectRestructure(proposalId: string, input: { expectedUpdatedAt: string; confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE"; traceId: string }): Promise<ServiceMiniProjectRestructurePreparationResult> {
    return this.request<ServiceMiniProjectRestructurePreparationResult>(`/proposals/${encodeURIComponent(proposalId)}/mini-project-restructure/commit/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  verifyMiniProjectRestructureStep(proposalId: string, stepIndex: number, input: { semanticCommitId: string; expectedUpdatedAt: string; traceId: string }): Promise<ServiceMiniProjectRestructureStepVerification> {
    return this.request<ServiceMiniProjectRestructureStepVerification>(`/proposals/${encodeURIComponent(proposalId)}/mini-project-restructure/commit/steps/${stepIndex}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, 15_000);
  }

  beginMiniProjectRestructureRecovery(proposalId: string, input: { semanticCommitId: string; expectedUpdatedAt: string; failedStepIndex: number; failureCode: "GRAPH_WRITE_FAILED" | "GRAPH_VERIFY_FAILED" | "DESKTOP_DISCONNECTED"; traceId: string }): Promise<ServiceMiniProjectRestructureRecoveryResult> {
    return this.request<ServiceMiniProjectRestructureRecoveryResult>(`/proposals/${encodeURIComponent(proposalId)}/mini-project-restructure/commit/recovery/begin`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 15_000);
  }

  verifyMiniProjectRestructureCompensation(proposalId: string, stepIndex: number, input: { semanticCommitId: string; expectedUpdatedAt: string; traceId: string }): Promise<ServiceMiniProjectRestructureRecoveryResult> {
    return this.request<ServiceMiniProjectRestructureRecoveryResult>(`/proposals/${encodeURIComponent(proposalId)}/mini-project-restructure/commit/recovery/steps/${stepIndex}/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 15_000);
  }

  prepareMiniProjectRestructureUndo(originalSemanticCommitId: string, input: { confirmation: "UNDO_MINI_PROJECT_RESTRUCTURE"; traceId: string }): Promise<ServiceMiniProjectRestructureUndoPreparationResult> {
    return this.request<ServiceMiniProjectRestructureUndoPreparationResult>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/mini-project-restructure/undo/prepare`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 15_000);
  }

  verifyMiniProjectRestructureUndoStep(originalSemanticCommitId: string, stepIndex: number, input: { undoSemanticCommitId: string; traceId: string }): Promise<ServiceMiniProjectRestructureUndoStepVerification> {
    return this.request<ServiceMiniProjectRestructureUndoStepVerification>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/mini-project-restructure/undo/steps/${stepIndex}/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 15_000);
  }

  beginMiniProjectRestructureUndoRecovery(originalSemanticCommitId: string, input: { undoSemanticCommitId: string; failedStepIndex: number; failureCode: "GRAPH_WRITE_FAILED" | "GRAPH_VERIFY_FAILED" | "DESKTOP_DISCONNECTED"; traceId: string }): Promise<ServiceMiniProjectRestructureUndoRecoveryResult> {
    return this.request<ServiceMiniProjectRestructureUndoRecoveryResult>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/mini-project-restructure/undo/recovery/begin`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 15_000);
  }

  verifyMiniProjectRestructureUndoCompensation(originalSemanticCommitId: string, stepIndex: number, input: { undoSemanticCommitId: string; traceId: string }): Promise<ServiceMiniProjectRestructureUndoRecoveryResult> {
    return this.request<ServiceMiniProjectRestructureUndoRecoveryResult>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/mini-project-restructure/undo/recovery/steps/${stepIndex}/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }, 15_000);
  }

  setUxInteractionDisposition(interactionId: string, disposition?: ServiceInteractionDisposition): Promise<{ userDisposition: ServiceInteractionDisposition | null; summary: ServiceInteractionEvidenceSummary }> {
    return this.request(`/provider/ux/interactions/${encodeURIComponent(interactionId)}/disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disposition: disposition ?? null }),
    });
  }

  getUxInteractionSummary(): Promise<{ summary: ServiceInteractionEvidenceSummary }> {
    return this.request("/provider/ux/interactions/summary");
  }

  readGraph(query: ServiceGraphReadQuery): Promise<ServiceGraphSnapshot> {
    return this.request<{ snapshot: ServiceGraphSnapshot }>("/graph/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    }, 12_000).then(({ snapshot }) => snapshot);
  }

  claimGraphReadRequest(): Promise<ServiceGraphReadRequest | undefined> {
    return this.request<{ request?: ServiceGraphReadRequest }>("/graph/bridge/next", undefined, 25_000).then(({ request }) => request);
  }

  completeGraphReadRequest(result: ServiceGraphReadResult): Promise<void> {
    return this.request<{ accepted: true }>("/graph/bridge/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    }).then(() => undefined);
  }

  scanLegacyMigration(bundle: unknown): Promise<ServiceLegacyMigrationScanReport> {
    return this.request<{ report: ServiceLegacyMigrationScanReport }>("/migration/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle),
    }).then(({ report }) => report);
  }

  previewLegacyMigration(bundle: unknown, decisions: LegacyMigrationReviewDecision[]): Promise<{ run: ServiceMigrationRun; replayed: boolean }> {
    return this.request<{ run: ServiceMigrationRun; replayed: boolean }>("/migration/preview", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bundle, decisions }),
    });
  }

  getMigrationRun(runId: string): Promise<ServiceMigrationRunDetails> {
    return this.request<ServiceMigrationRunDetails>(`/migration/runs/${encodeURIComponent(runId)}`);
  }

  async listMigrationRuns(): Promise<ServiceMigrationRun[]> {
    return (await this.request<{ runs: ServiceMigrationRun[] }>("/migration/runs")).runs;
  }

  importLegacyMigration(runId: string, input: { bundle: unknown; backupId: string; objectIds: string[]; idempotencyKey: string; confirmation: "IMPORT_REVIEWED_V1_BATCH" }): Promise<{ batch: ServiceMigrationBatch; replayed: boolean }> {
    return this.request<{ batch: ServiceMigrationBatch; replayed: boolean }>(`/migration/runs/${encodeURIComponent(runId)}/batches/import`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  verifyLegacyMigrationBatch(runId: string, batchId: string): Promise<ServiceMigrationBatch> {
    return this.request<{ batch: ServiceMigrationBatch }>(`/migration/runs/${encodeURIComponent(runId)}/batches/${encodeURIComponent(batchId)}/verify`, { method: "POST" }).then(({ batch }) => batch);
  }

  undoLegacyMigrationBatch(runId: string, batchId: string, confirmation: "UNDO_MIGRATION_BATCH"): Promise<ServiceMigrationBatch> {
    return this.request<{ batch: ServiceMigrationBatch }>(`/migration/runs/${encodeURIComponent(runId)}/batches/${encodeURIComponent(batchId)}/undo`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation }),
    }).then(({ batch }) => batch);
  }

  activateLegacyMigration(runId: string, confirmation: "ACTIVATE_V2_SQLITE"): Promise<ServiceMigrationRun> {
    return this.request<{ run: ServiceMigrationRun }>(`/migration/runs/${encodeURIComponent(runId)}/activate`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation }),
    }).then(({ run }) => run);
  }

  submitProposal(proposal: unknown): Promise<{ record: ServiceStoredProposal; replayed: boolean }> {
    return this.request<{ record: ServiceStoredProposal; replayed: boolean }>("/proposals/submit", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proposal),
    });
  }

  generateProposal(prompt: ServiceProposalPromptBundle): Promise<ServiceGeneratedProposalResult> {
    return this.request<ServiceGeneratedProposalResult>("/provider/proposals/generate", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }),
    }, 125_000);
  }

  reviseGeneratedProposal(proposalId: string, expectedUpdatedAt: string, prompt: ServiceProposalPromptBundle): Promise<ServiceRevisedProposalResult> {
    return this.request<ServiceRevisedProposalResult>(`/provider/proposals/${encodeURIComponent(proposalId)}/revise`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt, prompt }),
    }, 125_000);
  }

  async listProposals(): Promise<ServiceStoredProposal[]> {
    return (await this.request<{ proposals: ServiceStoredProposal[] }>("/proposals")).proposals;
  }

  async getProposal(proposalId: string): Promise<ServiceStoredProposal | undefined> {
    try {
      return (await this.request<{ record: ServiceStoredProposal }>(`/proposals/${encodeURIComponent(proposalId)}`)).record;
    } catch (error) {
      if (error instanceof StructuredError && error.details?.remoteCode === "V2_PROPOSAL_NOT_FOUND") return undefined;
      throw error;
    }
  }

  reviewProposal(proposalId: string, decisions: Readonly<Record<string, V2ProposalGroupDecision>>, expectedUpdatedAt: string, miniProjectClosure?: V2MiniProjectClosure): Promise<ServiceStoredProposal> {
    return this.request<ServiceStoredProposal>(`/proposals/${encodeURIComponent(proposalId)}/review`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisions, expectedUpdatedAt, ...(miniProjectClosure ? { miniProjectClosure } : {}) }),
    });
  }

  revalidateProposal(proposalId: string, observations: readonly V2ProposalScopeObservation[], expectedUpdatedAt: string): Promise<ServiceProposalRevalidation> {
    return this.request<ServiceProposalRevalidation>(`/proposals/${encodeURIComponent(proposalId)}/revalidate`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ observations, expectedUpdatedAt }),
    });
  }

  prepareProposalCommit(proposalId: string, observations: readonly V2ProposalScopeObservation[], expectedUpdatedAt: string): Promise<ServiceProposalCommitPreparation> {
    return this.request<ServiceProposalCommitPreparation>(`/proposals/${encodeURIComponent(proposalId)}/commit/prepare`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ observations, expectedUpdatedAt }),
    });
  }

  finalizeProposalCommit(proposalId: string, evidence: ServiceProposalCommitEvidence): Promise<ServiceProposalCommitFinalization> {
    return this.request<ServiceProposalCommitFinalization>(`/proposals/${encodeURIComponent(proposalId)}/commit/finalize`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evidence),
    });
  }

  commitProjectClosure(proposalId: string, input: { expectedUpdatedAt: string; confirmation: "COMPLETE_PROJECT_WITH_CLOSURE"; observations: readonly V2ProposalScopeObservation[]; traceId: string }): Promise<ServiceProjectClosureCommitResult> {
    return this.request<ServiceProjectClosureCommitResult>(`/proposals/${encodeURIComponent(proposalId)}/closure/commit`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  commitProjectStructure(proposalId: string, input: { expectedUpdatedAt: string; confirmation: "UPDATE_PROJECT_INTERFACE"; observations: readonly V2ProposalScopeObservation[]; traceId: string }): Promise<ServiceProjectStructureCommitResult> {
    return this.request<ServiceProjectStructureCommitResult>(`/proposals/${encodeURIComponent(proposalId)}/project-interface/commit`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  commitLifecycleTransition(proposalId: string, input: { expectedUpdatedAt: string; confirmation: "COMPLETE_MINI_PROJECT" | "CANCEL_OBJECT" | "REOPEN_OBJECT" | "ARCHIVE_OBJECT"; observations: readonly V2ProposalScopeObservation[]; traceId: string }): Promise<ServiceLifecycleTransitionCommitResult> {
    return this.request<ServiceLifecycleTransitionCommitResult>(`/proposals/${encodeURIComponent(proposalId)}/lifecycle/commit`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  }

  commitPrimaryOwnership(proposalId: string, input: { expectedUpdatedAt: string; confirmation: "CHANGE_PRIMARY_OWNERSHIP"; observations: readonly V2ProposalScopeObservation[]; traceId: string }): Promise<ServiceOwnershipCommitResult> {
    return this.request<ServiceOwnershipCommitResult>(`/proposals/${encodeURIComponent(proposalId)}/ownership/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  undoPrimaryOwnership(originalSemanticCommitId: string, input: { confirmation: "UNDO_PRIMARY_OWNERSHIP"; traceId: string }): Promise<ServiceOwnershipUndoResult> {
    return this.request<ServiceOwnershipUndoResult>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/ownership/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  undoLifecycle(originalSemanticCommitId: string, input: { confirmation: "UNDO_LIFECYCLE"; traceId: string }): Promise<ServiceLifecycleUndoResult> {
    return this.request<ServiceLifecycleUndoResult>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/lifecycle/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  undoProjectStructure(originalSemanticCommitId: string, input: { confirmation: "UNDO_PROJECT_INTERFACE"; traceId: string }): Promise<ServiceProjectStructureUndoResult> {
    return this.request<ServiceProjectStructureUndoResult>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/project-interface/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  undoProjectClosure(originalSemanticCommitId: string, input: { confirmation: "UNDO_PROJECT_CLOSURE"; traceId: string }): Promise<ServiceProjectClosureUndoResult> {
    return this.request<ServiceProjectClosureUndoResult>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/project-closure/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  }

  compensateProposalCommit(proposalId: string, evidence: ServiceProposalCommitEvidence): Promise<{ status: "FAILED_COMPENSATED"; semanticCommitId: string; record: ServiceStoredProposal }> {
    return this.request<{ status: "FAILED_COMPENSATED"; semanticCommitId: string; record: ServiceStoredProposal }>(`/proposals/${encodeURIComponent(proposalId)}/commit/compensate`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evidence),
    });
  }

  prepareProposalUndo(originalSemanticCommitId: string, traceId: string): Promise<ServicePreparedProposalUndo> {
    return this.request<ServicePreparedProposalUndo>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/undo/prepare`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ traceId }),
    });
  }

  listSemanticCommits(): Promise<ServiceSemanticCommit[]> {
    return this.request<{ commits: ServiceSemanticCommit[] }>("/semantic-commits").then((result) => result.commits);
  }

  nowWork(): Promise<ServiceNowWork> {
    return this.request<ServiceNowWork>("/now-work");
  }

  listFocusSelections(): Promise<ServiceFocusSelection[]> {
    return this.request<{ selections: ServiceFocusSelection[] }>("/focus").then((result) => result.selections);
  }

  selectFocus(objectId: string, expectedVersion: number, rank: number): Promise<{ status: "SELECTED"; selection: ServiceFocusSelection }> {
    return this.request<{ status: "SELECTED"; selection: ServiceFocusSelection }>(`/focus/${encodeURIComponent(objectId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion, rank }) });
  }

  removeFocus(objectId: string, expectedVersion: number): Promise<{ status: "REMOVED"; objectId: string }> {
    return this.request<{ status: "REMOVED"; objectId: string }>(`/focus/${encodeURIComponent(objectId)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion }) });
  }

  reorderFocus(expectedObjectIds: readonly string[], objectIds: readonly string[]): Promise<{ selections: ServiceFocusSelection[] }> {
    return this.request<{ selections: ServiceFocusSelection[] }>("/focus/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedObjectIds, objectIds }) });
  }

  changeCondition(objectId: string, expectedVersion: number, condition: V2Condition): Promise<{ object: V2ManagedObject }> {
    return this.request<{ object: V2ManagedObject }>(`/objects/${encodeURIComponent(objectId)}/condition`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion, condition }) });
  }

  prepareConditionUndo(objectId: string): Promise<ServiceConditionUndoPreparation> {
    return this.request<ServiceConditionUndoPreparation>(`/objects/${encodeURIComponent(objectId)}/condition/undo`);
  }

  undoCondition(objectId: string, input: ServiceConditionUndoRequest): Promise<ServiceConditionUndoResult> {
    return this.request<ServiceConditionUndoResult>(`/objects/${encodeURIComponent(objectId)}/condition/undo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  changeDeadline(objectId: string, expectedVersion: number, dueAt?: string): Promise<{ object: V2ManagedObject }> {
    return this.request<{ object: V2ManagedObject }>(`/objects/${encodeURIComponent(objectId)}/deadline`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion, dueAt: dueAt ?? null }) });
  }

  finalizeProposalUndo(originalSemanticCommitId: string, evidence: ServiceProposalUndoEvidence): Promise<ServiceProposalUndoFinalization> {
    return this.request<ServiceProposalUndoFinalization>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/undo/finalize`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evidence),
    });
  }

  compensateProposalUndo(originalSemanticCommitId: string, evidence: ServiceProposalUndoEvidence): Promise<{ status: "FAILED_COMPENSATED"; originalSemanticCommitId: string; undoSemanticCommitId: string }> {
    return this.request<{ status: "FAILED_COMPENSATED"; originalSemanticCommitId: string; undoSemanticCommitId: string }>(`/semantic-commits/${encodeURIComponent(originalSemanticCommitId)}/undo/compensate`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evidence),
    });
  }

  async getObject(objectId: string): Promise<V2ManagedObject | undefined> {
    try {
      return (await this.request<{ object: V2ManagedObject }>(`/objects/${encodeURIComponent(objectId)}`)).object;
    } catch (error) {
      if (error instanceof StructuredError && error.details?.remoteCode === "OBJECT_NOT_FOUND") return undefined;
      throw error;
    }
  }
}

export async function probeService(client: Pick<LocalServiceClient, "health">): Promise<ServiceConnectionState> {
  try {
    const health = await client.health();
    return {
      status: "READY",
      capabilities: health.capabilities,
      formalWritesAvailable: health.capabilities.formalWrites,
      graphEditingAvailable: true,
    };
  } catch (error) {
    return {
      status: "RESTRICTED",
      reasonCode: error instanceof StructuredError ? error.code : "SERVICE_UNKNOWN_ERROR",
      message: error instanceof Error ? error.message : String(error),
      formalWritesAvailable: false,
      graphEditingAvailable: true,
    };
  }
}
