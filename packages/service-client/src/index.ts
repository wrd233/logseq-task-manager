import type { LegacyMigrationReviewDecision, V2Anchor, V2Condition, V2ExecutionMarker, V2ManagedObject, V2ObjectType, V2Proposal, V2ProposalGroupDecision, V2ProposalRevalidationResult, V2ProposalScopeObservation } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export const LOCAL_SERVICE_PROTOCOL_VERSION = 1;

export interface ServiceCapabilities {
  formalWrites: boolean;
  migration: boolean;
  provider: boolean;
  backup: boolean;
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

export interface ServiceBackupRestored {
  status: "RESTORED_SERVICE_STOPPING";
  backupId: string;
  recoveryBackupId: string;
  validation: ServiceDoctor;
}

export interface ServiceSkillSummary {
  name: "task-copilot-core" | "design-project";
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
  scope: { kind: "object" | "project"; id: string };
  authority: "READ_ONLY_DERIVATIVE";
  formalFactsSource: "SQLITE";
  graphExcerptStatus: "NOT_AVAILABLE_IN_LOCAL_SERVICE";
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

export interface ServiceLegacyMigrationPreview {
  legacyObjectId: string;
  sourceBundleSha256: string;
  classification: "DIRECT_BIND" | "NEEDS_CONFIRMATION" | "KEEP_ORDINARY" | "STRUCTURAL_ERROR";
  reasonCodes: string[];
  evidenceRefs: string[];
  informationLoss: string[];
  conflicts: string[];
  decision: "PENDING_REVIEW";
  [key: string]: unknown;
}

export interface ServiceLegacyMigrationScanReport {
  schemaVersion: 1;
  sourceBundleSha256: string;
  sourceCreatedAt: string;
  status: "SCANNED";
  zeroFormalWrites: true;
  counts: { total: number; directBind: number; needsConfirmation: number; keepOrdinary: number; structuralError: number };
  previews: ServiceLegacyMigrationPreview[];
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

export interface ServiceSynchronizeExplicitObjectResult extends ServiceMaterializeExplicitObjectResult {
  operation: "MATERIALIZED" | "SYNCHRONIZED";
}

export interface ServicePrimaryAnchorPage {
  anchors: V2Anchor[];
  nextCursor?: string;
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
  };
  replayed: boolean;
}

export type ServiceProposalCommitPreparation = ServicePreparedProposalCommit | ({ status: "STALE" } & ServiceProposalRevalidation);
export type ServiceProposalCommitFinalization =
  | { status: "COMPLETED"; semanticCommitId: string; object: V2ManagedObject; anchor: V2Anchor; record: ServiceStoredProposal; replayed: boolean }
  | { status: "COMPENSATION_REQUIRED"; semanticCommitId: string; proposalId: string; expectedUpdatedAt: string; patch: ServicePreparedProposalCommit["plan"]["patch"] };

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

export type ServiceProposalUndoFinalization =
  | { status: "COMPLETED"; originalSemanticCommitId: string; undoSemanticCommitId: string; objectId: string; replayed: boolean }
  | { status: "COMPENSATION_REQUIRED"; originalSemanticCommitId: string; undoSemanticCommitId: string; patch: ServicePreparedProposalUndo["patch"] };

export type ServiceConnectionState =
  | { status: "READY"; capabilities: ServiceCapabilities; formalWritesAvailable: boolean; graphEditingAvailable: true }
  | { status: "RESTRICTED"; reasonCode: string; message: string; formalWritesAvailable: false; graphEditingAvailable: true };

function clientError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-216"], ...(details ? { details } : {}) });
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

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.descriptor.url}${path.slice(1)}`, {
        ...init,
        headers: { ...init?.headers, authorization: `Bearer ${this.descriptor.token}` },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw clientError("SERVICE_TIMEOUT", "Local Service 请求超时。");
      throw clientError("SERVICE_UNAVAILABLE", "Local Service 不可用；正式语义写入已受限。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
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

  createBackup(): Promise<ServiceBackupCreated> {
    return this.request<ServiceBackupCreated>("/backup/create", { method: "POST" });
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

  exportContext(scope: "object" | "project", id: string): Promise<ServiceContextExportResult> {
    return this.request<ServiceContextExportResult>("/context/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, id }),
    });
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
    });
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

  reviewProposal(proposalId: string, decisions: Readonly<Record<string, V2ProposalGroupDecision>>, expectedUpdatedAt: string): Promise<ServiceStoredProposal> {
    return this.request<ServiceStoredProposal>(`/proposals/${encodeURIComponent(proposalId)}/review`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisions, expectedUpdatedAt }),
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
