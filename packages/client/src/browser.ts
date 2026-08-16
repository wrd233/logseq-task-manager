import type { Actor, AgentRunReceipt, AssociationCorrection, AssignParentDecisionParameters, ClosureAssessment, ClosureHistory, ConfirmationProjection, ContextAssociation, CurationReceipt, DecisionCandidate, DecisionPackage, DiscoveryRun, DiscoveryRunSourceOutcome, DiscoveryScope, EngagementProposalRevision, FeedbackEvent, FormalCommitResult, FormalizationCandidate, FormalizationEvidence, FrozenEvidence, GovernanceDimension, GovernanceIssue, GraphApplyResult, GraphBlockRead, GraphGatewayStatus, GraphPageRead, GraphReadReceipt, GraphSearchMatch, GraphSnapshot, NowProjection, ObjectContextPack, OrganizeTodayResult, PrimaryOwnership, ProjectionObligation, Proposal, ProposalRevision, ReconcileJob, SemanticOperation, SkillPackage, SourceChangeObservation, StoredCommit, SystemProjection, TasteProfile, TrustedGraphEvidenceMaterial, TrustedUserEvent, UserDecision, UserDecisionCompileResult, UserReadBaseline, WorkMapProjection, WorkObject } from "@task-copilot/contracts";

export interface KernelDescriptor { schemaVersion: 1; baseUrl: string; token: string; pid: number; startedAt: string }
export interface PluginKernelDescriptor extends KernelDescriptor { graphSnapshotKey: string; graphBridgeToken: string; userChannelToken?: string }
export interface PendingGraphCommit { commit: StoredCommit; graphEffect: unknown }
export interface RecoveryItem { commit: StoredCommit; action: string }

export class ClientError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, message: string, status: number) { super(`${code}: ${message}`); this.name = "ClientError"; this.code = code; this.status = status; }
}

function isLocalKernelOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "http:" && url.hostname === "127.0.0.1" && Boolean(url.port) && !url.username && !url.password && url.origin === value; } catch { return false; }
}

export function parseKernelDescriptor(value: unknown): KernelDescriptor {
  const candidate = value as KernelDescriptor;
  if (!candidate || candidate.schemaVersion !== 1 || !isLocalKernelOrigin(candidate.baseUrl) || !candidate.token || !Number.isSafeInteger(candidate.pid) || !candidate.startedAt) throw new ClientError("DESCRIPTOR_INVALID", "Kernel descriptor is invalid.", 0);
  return { schemaVersion: 1, baseUrl: candidate.baseUrl, token: candidate.token, pid: candidate.pid, startedAt: candidate.startedAt };
}

export function parsePluginKernelDescriptor(value: unknown): PluginKernelDescriptor {
  const candidate = value as PluginKernelDescriptor; const base = parseKernelDescriptor(value);
  if (!/^[0-9a-f]{64}$/u.test(candidate.graphSnapshotKey) || !/^[0-9a-f]{64}$/u.test(candidate.graphBridgeToken)) throw new ClientError("PLUGIN_DESCRIPTOR_INVALID", "Plugin Graph descriptor is invalid.", 0);
  return { ...base, graphSnapshotKey: candidate.graphSnapshotKey, graphBridgeToken: candidate.graphBridgeToken, ...(typeof candidate.userChannelToken === "string" && /^[0-9a-f]{64}$/u.test(candidate.userChannelToken) ? { userChannelToken: candidate.userChannelToken } : {}) };
}

export class KernelClient {
  readonly #descriptor: KernelDescriptor;
  readonly #userChannelToken: string | null;
  constructor(descriptor: KernelDescriptor) { this.#descriptor = descriptor; this.#userChannelToken = (descriptor as PluginKernelDescriptor).userChannelToken ?? null; }
  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: { authorization: `Bearer ${this.#descriptor.token}`, ...(this.#userChannelToken ? { "x-task-copilot-user-channel": this.#userChannelToken } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const response = await fetch(`${this.#descriptor.baseUrl}${path}`, init);
    const value = await response.json() as { error?: { code: string; message: string } } & T;
    if (!response.ok) throw new ClientError(value.error?.code ?? "HTTP_ERROR", value.error?.message ?? response.statusText, response.status);
    return value;
  }
  status(): Promise<{ status: "ok"; schemaVersion: number; pid: number }> { return this.#request("GET", "/v1/status"); }
  agentBootstrap(): Promise<{ kernel: { ready: boolean }; graph: { ready: boolean; graphId: string | null; capabilities: readonly string[]; reason?: string }; agent: { executorType: "EXTERNAL_CLI"; supportedPurposes: readonly AgentRunReceipt["purpose"][] }; skills: Array<{ id: string; version: string; contentHash: string }>; forbidden: readonly string[] }> { return this.#request("GET", "/v1/agent/bootstrap"); }
  listSkills(): Promise<{ skills: Array<{ id: string; version: string; contentHash: string }> }> { return this.#request("GET", "/v1/skills"); }
  showSkill(id: string): Promise<{ skill: SkillPackage; resultContract: unknown }> { return this.#request("GET", `/v1/skills/${encodeURIComponent(id)}`); }
  listTasteProfiles(): Promise<{ profiles: TasteProfile[] }> { return this.#request("GET", "/v1/taste"); }
  showTasteProfile(id: string): Promise<{ profile: TasteProfile }> { return this.#request("GET", `/v1/taste/${encodeURIComponent(id)}`); }
  graphStatus(): Promise<GraphGatewayStatus> { return this.#request("GET", "/v1/graph/status"); }
  graphSearch(input: { query: string; limit: number; runId?: string }): Promise<{ matches: readonly GraphSearchMatch[]; receipt: GraphReadReceipt | null }> { return this.#request("POST", "/v1/graph/search", input); }
  graphBlock(id: string, runId?: string): Promise<{ block: GraphBlockRead; receipt: GraphReadReceipt | null }> { return this.#request("GET", `/v1/graph/blocks/${encodeURIComponent(id)}${runId ? `?run=${encodeURIComponent(runId)}` : ""}`); }
  graphPage(name: string, input: { limit: number; runId?: string }): Promise<{ page: GraphPageRead; receipt: GraphReadReceipt | null }> { const query = new URLSearchParams({ limit: String(input.limit), ...(input.runId ? { run: input.runId } : {}) }); return this.#request("GET", `/v1/graph/pages/${encodeURIComponent(name)}?${query}`); }
  freezeExternalEvidence(input: { evidenceId: string; workObjectId: string; blockUuid: string }): Promise<{ evidence: FrozenEvidence }> { return this.#request("POST", "/v1/external/evidence/freeze", input); }
  startExternalAgentRun(input: { runId: string; purpose: AgentRunReceipt["purpose"]; workObjectId: string; evidenceIds: readonly string[]; executorId: string; governanceCorrelationId?: string }): Promise<{ run: AgentRunReceipt }> { return this.#request("POST", "/v1/external/agent-runs/start", input); }
  finishExternalAgentRun(id: string, result: unknown): Promise<{ run: AgentRunReceipt; proposal: Proposal | null; revision: ProposalRevision | null }> { return this.#request("POST", `/v1/external/agent-runs/${encodeURIComponent(id)}/finish`, { result }); }
  listAgentRunReads(id: string): Promise<{ receipts: GraphReadReceipt[] }> { return this.#request("GET", `/v1/agent-runs/${encodeURIComponent(id)}/reads`); }
  applyExternalProposal(id: string): Promise<{ commit: StoredCommit; recovered: boolean } | { package: DecisionPackage; candidates: DecisionCandidate[]; recovered: boolean }> { return this.#request("POST", `/v1/external/proposals/${encodeURIComponent(id)}/apply`, {}); }
  addReferenceCuration(input: { receiptId: string; runId: string; workObjectId: string; referenceBlockUuid: string; section: "资源" | "支撑交付物"; existingSectionUuid?: string | null }): Promise<{ receipt: CurationReceipt }> { return this.#request("POST", "/v1/external/curation/add-reference", input); }
  listCurationReceipts(workObjectId?: string): Promise<{ receipts: CurationReceipt[] }> { return this.#request("GET", `/v1/curation-receipts${workObjectId ? `?object=${encodeURIComponent(workObjectId)}` : ""}`); }
  listObjects(): Promise<{ objects: WorkObject[] }> { return this.#request("GET", "/v1/objects"); }
  listObjectAnchorIndex(): Promise<{ objects: Array<{ object: WorkObject; anchor: unknown }> }> { return this.#request("GET", "/v1/objects/anchors"); }
  nowProjection(): Promise<NowProjection> { return this.#request("GET", "/v1/projections/now"); }
  confirmationProjection(): Promise<ConfirmationProjection> { return this.#request("GET", "/v1/projections/confirmations"); }
  workMapProjection(): Promise<WorkMapProjection> { return this.#request("GET", "/v1/projections/workmap"); }
  systemProjection(): Promise<SystemProjection> { return this.#request("GET", "/v1/projections/system"); }

  listActionableObjects(): Promise<{ objects: WorkObject[] }> { return this.#request("GET", "/v1/objects/actionable"); }
  listOwnerships(): Promise<{ ownerships: PrimaryOwnership[] }> { return this.#request("GET", "/v1/ownerships"); }
  showObject(id: string): Promise<{ object: WorkObject; anchor: unknown }> { return this.#request("GET", `/v1/objects/${encodeURIComponent(id)}`); }
  objectContextPack(id: string): Promise<{ pack: ObjectContextPack }> { return this.#request("GET", `/v1/objects/${encodeURIComponent(id)}/context`); }
  closureAssessment(id: string): Promise<{ assessment: ClosureAssessment | null; fresh: boolean; queued: boolean }> { return this.#request("GET", `/v1/objects/${encodeURIComponent(id)}/closure-assessment`); }
  markObjectViewed(id: string): Promise<{ baseline: UserReadBaseline }> { return this.#request("POST", `/v1/objects/${encodeURIComponent(id)}/viewed`, {}); }
  showClosure(id: string): Promise<{ closure: ClosureHistory }> { return this.#request("GET", `/v1/objects/${encodeURIComponent(id)}/closure`); }
  showCommit(id: string): Promise<{ commit: StoredCommit }> { return this.#request("GET", `/v1/commits/${encodeURIComponent(id)}`); }
  listRecovery(): Promise<{ recovery: RecoveryItem[] }> { return this.#request("GET", "/v1/recovery"); }
  recordSourceChange(observation: SourceChangeObservation): Promise<{ coverage: unknown; job: ReconcileJob }> { return this.#request("POST", "/v1/maintenance/source-change", observation); }
  reconcileMaintenance(workObjectId: string, priorityClass?: "NORMAL" | "INTERACTIVE" | "SYSTEM_RECOVERY"): Promise<{ job: ReconcileJob }> { return this.#request("POST", "/v1/maintenance/reconcile", { workObjectId, ...(priorityClass ? { priorityClass } : {}) }); }
  setMaintenancePause(scope: "global" | "object", paused: boolean, workObjectId?: string | null): Promise<{ paused: boolean }> { return this.#request("POST", "/v1/maintenance/pause", { scope, paused, workObjectId: workObjectId ?? null }); }
  maintenanceStatus(status?: ReconcileJob["status"]): Promise<{ globalPaused: boolean; jobs: ReconcileJob[] }> { return this.#request("GET", `/v1/maintenance/status${status ? `?status=${encodeURIComponent(status)}` : ""}`); }
  listContextAssociations(workObjectId?: string): Promise<{ associations: ContextAssociation[] }> { return this.#request("GET", `/v1/context${workObjectId ? `?object=${encodeURIComponent(workObjectId)}` : ""}`); }
  associateContext(input: { id?: string; workObjectId: string; sourceRef: ContextAssociation["sourceRef"]; sourceVersionHash: string; origin: ContextAssociation["origin"]; basisRunId?: string | null }): Promise<{ association: ContextAssociation }> { return this.#request("POST", "/v1/context/associate", input); }
  invalidateContextAssociation(id: string): Promise<{ association: ContextAssociation }> { return this.#request("POST", `/v1/context/${encodeURIComponent(id)}/invalidate`, {}); }
  recordAssociationCorrection(input: { id?: string; sourceRef: AssociationCorrection["sourceRef"]; scopeSnapshot: string; rejectedWorkObjectId: string; affirmedWorkObjectId?: string | null; userDecisionRef: string }): Promise<{ correction: AssociationCorrection }> { return this.#request("POST", "/v1/context/corrections", input); }
  listGovernanceIssues(workObjectId?: string, status?: GovernanceIssue["status"]): Promise<{ issues: GovernanceIssue[] }> { return this.#request("GET", `/v1/issues${workObjectId ? `?object=${encodeURIComponent(workObjectId)}${status ? `&status=${encodeURIComponent(status)}` : ""}` : status ? `?status=${encodeURIComponent(status)}` : ""}`); }
  upsertGovernanceIssue(input: { id?: string; workObjectId: string; dimension: GovernanceDimension; type: GovernanceIssue["type"]; summary: string; evidenceIds?: readonly string[]; sourceSnapshotId: string; formalVersion: number; correlationId?: string | null }): Promise<{ issue: GovernanceIssue }> { return this.#request("POST", "/v1/issues", input); }
  showGovernanceIssue(id: string): Promise<{ issue: GovernanceIssue }> { return this.#request("GET", `/v1/issues/${encodeURIComponent(id)}`); }
  resolveGovernanceIssue(id: string): Promise<{ issue: GovernanceIssue }> { return this.#request("POST", `/v1/issues/${encodeURIComponent(id)}/resolve`, {}); }
  supersedeGovernanceIssue(id: string): Promise<{ issue: GovernanceIssue }> { return this.#request("POST", `/v1/issues/${encodeURIComponent(id)}/supersede`, {}); }
  listDecisionPackages(status?: DecisionPackage["status"]): Promise<{ packages: DecisionPackage[] }> { return this.#request("GET", `/v1/decision-packages${status ? `?status=${encodeURIComponent(status)}` : ""}`); }
  createDecisionPackage(input: { id?: string; workObjectId?: string | null; summary: string; rationale: string; issueRefs?: readonly string[]; candidates: Array<{ id?: string; operationType: DecisionCandidate["operationType"]; parameters: unknown; evidenceIds?: readonly string[] }> }): Promise<{ pkg: DecisionPackage; candidates: DecisionCandidate[] }> { return this.#request("POST", "/v1/decision-packages", input); }
  listDecisionCandidates(packageId: string): Promise<{ candidates: DecisionCandidate[] }> { return this.#request("GET", `/v1/decision-packages/${encodeURIComponent(packageId)}/candidates`); }
  deferDecisionPackage(packageId: string): Promise<{ package: DecisionPackage }> { return this.#request("POST", `/v1/decision-packages/${encodeURIComponent(packageId)}/defer`, {}); }
  async createTrustedUserEvent(input: { id?: string; exactUserUtterance: string; packageId: string | null; presentationRevision?: string | null; correlationId?: string | null }): Promise<{ event: TrustedUserEvent }> {
    if (!this.#userChannelToken) throw new ClientError("TRUSTED_USER_CHANNEL_REQUIRED", "This client has no Plugin USER-channel capability.", 0);
    const response = await fetch(`${this.#descriptor.baseUrl}/v1/user-events`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.#descriptor.token}`, "content-type": "application/json", "x-task-copilot-user-channel": this.#userChannelToken },
      body: JSON.stringify({ ...input, sourceCapability: this.#userChannelToken }),
    });
    const value = await response.json() as { error?: { code: string; message: string } } & { event: TrustedUserEvent };
    if (!response.ok) throw new ClientError(value.error?.code ?? "HTTP_ERROR", value.error?.message ?? response.statusText, response.status);
    return value;
  }
  compileUserDecision(input: { trustedUserEventId: string }): Promise<UserDecisionCompileResult> { return this.#request("POST", "/v1/user-decisions/compile", input); }
  executeUserDecision(id: string): Promise<{ decision: UserDecision; commit: StoredCommit; projectionObligation: ProjectionObligation | null }> { return this.#request("POST", `/v1/user-decisions/${encodeURIComponent(id)}/execute`, {}); }
  createOwnershipDecisionPackage(input: { id?: string; childId: string; ownerId: string; summary: string; rationale: string; issueRefs?: readonly string[] }): Promise<{ pkg: DecisionPackage; candidates: DecisionCandidate[] }> {
    const parameters: AssignParentDecisionParameters = { childId: input.childId, ownerId: input.ownerId, childVersion: 0, previousOwnerId: null };
    return this.#request("POST", "/v1/decision-packages", {
      workObjectId: input.childId,
      summary: input.summary,
      rationale: input.rationale,
      issueRefs: input.issueRefs ?? [],
      candidates: [{ operationType: "ASSIGN_PARENT", parameters }],
    });
  }
  listUserDecisions(packageId?: string): Promise<{ decisions: UserDecision[] }> { return this.#request("GET", `/v1/user-decisions${packageId ? `?package=${encodeURIComponent(packageId)}` : ""}`); }
  runDiscovery(scope: DiscoveryScope, input: { continuationToken?: string | null } = {}): Promise<{ run: DiscoveryRun }> { return this.#request("POST", "/v1/discovery/run", { scope, ...input }); }
  listDiscoveryRuns(): Promise<{ runs: DiscoveryRun[] }> { return this.#request("GET", "/v1/discovery/runs"); }
  showDiscoveryRun(id: string): Promise<{ run: DiscoveryRun; sources: DiscoveryRunSourceOutcome[] }> { return this.#request("GET", `/v1/discovery/runs/${encodeURIComponent(id)}`); }
  listFormalizationCandidates(status?: FormalizationCandidate["status"]): Promise<{ candidates: FormalizationCandidate[] }> { return this.#request("GET", `/v1/candidates${status ? `?status=${encodeURIComponent(status)}` : ""}`); }
  showFormalizationCandidate(id: string): Promise<{ candidate: FormalizationCandidate }> { return this.#request("GET", `/v1/candidates/${encodeURIComponent(id)}`); }
  listFormalizationEvidence(candidateId: string): Promise<{ evidence: FormalizationEvidence[] }> { return this.#request("GET", `/v1/candidates/${encodeURIComponent(candidateId)}/evidence`); }
  matureFormalizationCandidate(id: string): Promise<{ pkg: DecisionPackage; candidate: FormalizationCandidate }> { return this.#request("POST", `/v1/candidates/${encodeURIComponent(id)}/mature`, {}); }
  dismissFormalizationCandidate(id: string): Promise<{ candidate: FormalizationCandidate }> { return this.#request("POST", `/v1/candidates/${encodeURIComponent(id)}/dismiss`, {}); }
  absorbFormalizationCandidate(id: string, targetWorkObjectId: string): Promise<{ candidate: FormalizationCandidate }> { return this.#request("POST", `/v1/candidates/${encodeURIComponent(id)}/absorb`, { targetWorkObjectId }); }
  organizeToday(input: { date?: string } = {}): Promise<OrganizeTodayResult> { return this.#request("POST", "/v1/organize/today", input); }
  freezeEvidence(input: { evidenceId: string; workObjectId: string; snapshot: TrustedGraphEvidenceMaterial }): Promise<{ evidence: FrozenEvidence }> { return this.#request("POST", "/v1/evidence/freeze", input); }
  showEvidence(id: string): Promise<{ evidence: FrozenEvidence }> { return this.#request("GET", `/v1/evidence/${encodeURIComponent(id)}`); }
  listEvidence(workObjectId?: string): Promise<{ evidence: FrozenEvidence[] }> { return this.#request("GET", `/v1/evidence${workObjectId ? `?object=${encodeURIComponent(workObjectId)}` : ""}`); }
  runCurrentFocusAgent(input: { runId: string; workObjectId: string; evidenceIds: readonly string[]; snapshot: GraphSnapshot }): Promise<{ run: AgentRunReceipt; proposal: Proposal | null; revision: ProposalRevision | null }> { return this.#request("POST", "/v1/agent-runs/current-focus", input); }
  runEngagementAgent(input: { runId: string; workObjectId: string; evidenceIds: readonly string[]; snapshot: GraphSnapshot }): Promise<{ run: AgentRunReceipt; proposal: Proposal | null; revision: EngagementProposalRevision | null }> { return this.#request("POST", "/v1/agent-runs/engagement", input); }
  showAgentRun(id: string): Promise<{ run: AgentRunReceipt }> { return this.#request("GET", `/v1/agent-runs/${encodeURIComponent(id)}`); }
  showProposal(id: string): Promise<{ proposal: Proposal; revision: ProposalRevision }> { return this.#request("GET", `/v1/proposals/${encodeURIComponent(id)}`); }
  applyProposal(id: string, input: { operationId: string; snapshot: GraphSnapshot; evidence: ReadonlyArray<{ evidenceId: string } & TrustedGraphEvidenceMaterial> }): Promise<PendingGraphCommit> { return this.#request("POST", `/v1/proposals/${encodeURIComponent(id)}/apply`, input); }
  reviseProposal(id: string, input: { actor: Actor; currentFocus: string | null }): Promise<{ proposal: Proposal; revision: ProposalRevision }> { return this.#request("POST", `/v1/proposals/${encodeURIComponent(id)}/revisions`, input); }
  dismissProposal(id: string, actor: Actor): Promise<{ proposal: Proposal }> { return this.#request("POST", `/v1/proposals/${encodeURIComponent(id)}/dismiss`, { actor }); }
  listFeedback(): Promise<{ feedback: FeedbackEvent[] }> { return this.#request("GET", "/v1/feedback"); }
  recordStrongPositive(commitId: string, actor: Actor, userComment?: string | null): Promise<{ recorded: true }> { return this.#request("POST", "/v1/feedback/strong-positive", { commitId, actor, ...(userComment === undefined ? {} : { userComment }) }); }
  commitFormal(operation: SemanticOperation, snapshot?: GraphSnapshot | null): Promise<FormalCommitResult> { return this.#request("POST", "/v1/commits/commit", { operation, ...(snapshot ? { snapshot } : {}) }); }
  verifyFormalProjection(commitId: string, result: GraphApplyResult, snapshot: GraphSnapshot): Promise<{ obligation: ProjectionObligation }> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/projection/verify`, { result, snapshot }); }
  graphProjectionFailed(commitId: string, reason: string): Promise<{ obligation: ProjectionObligation }> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/projection/failed`, { reason }); }
  listProjectionObligations(status?: ProjectionObligation["status"]): Promise<{ obligations: ProjectionObligation[] }> { return this.#request("GET", `/v1/projection-obligations${status ? `?status=${encodeURIComponent(status)}` : ""}`); }
  projectionHealth(): Promise<{ backlog: number; oldestPendingAt: string | null; retrying: number; degraded: number; lastError: string | null }> { return this.#request("GET", "/v1/projection-health"); }
  prepare(operation: SemanticOperation, snapshot: GraphSnapshot): Promise<PendingGraphCommit> { return this.#request("POST", "/v1/commits/prepare", { operation, snapshot }); }
  complete(commitId: string, result: GraphApplyResult, snapshot: GraphSnapshot): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/complete`, { result, snapshot }); }
  failGraphApply(commitId: string, reason: string): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/graph-failed`, { reason }); }
  prepareUndo(commitId: string, input: { operationId: string; actor: Actor; snapshot: GraphSnapshot }): Promise<PendingGraphCommit> { return this.#request("POST", `/v1/commits/${encodeURIComponent(commitId)}/undo/prepare`, input); }
  abortPrepared(commitId: string): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/recovery/${encodeURIComponent(commitId)}/abort`); }
  verifyRecoveredGraph(commitId: string, snapshot: GraphSnapshot): Promise<{ commit: StoredCommit }> { return this.#request("POST", `/v1/recovery/${encodeURIComponent(commitId)}/verify`, { snapshot }); }
}
