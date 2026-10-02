import type { AgentRunReceipt, ClosureHistory, CurationReceipt, DiscoveryRun, DiscoveryRunSourceOutcome, FormalizationEvidence, GraphReadReceipt, Proposal, ProposalRevision, UserDecision, FeedbackEvent, ClosureAssessment, ClosureAssessmentJob, CommitStatus, ContextAssociation, DecisionCandidate, DecisionPackage, FormalizationCandidate, FrozenEvidence, GovernanceIssue, ProjectIntent, ProjectionObligation, ReconcileJob, SourceCoverageState, StoredCommit, UserReadBaseline } from "@task-copilot/contracts";
import type { CancellationRecord, CompletionRecord, PrimaryAnchor, PrimaryOwnership, WorkObject } from "@task-copilot/domain";

import type { ContextStore } from "@task-copilot/kernel";

// Consumer-owned capabilities; implementations share one connection, and do not open it here.
export interface ProjectionStore {
  getFormalizationCandidateByPackage(packageId: string): FormalizationCandidate | null;
  getOwnershipByChild(childId: string): PrimaryOwnership | null;
  getProjectIntent(workObjectId: string): ProjectIntent | null;
  getRuntimeHealth(scopeKey: string): {
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      consecutiveFailures: number;
  };
  getWorkObject(id: string): WorkObject | null;
  listChildWorkObjects(ownerId: string): WorkObject[];
  listCommits(query?: {
      targetId?: string;
      status?: CommitStatus;
  }): StoredCommit[];
  listContextAssociations(workObjectId?: string, status?: ContextAssociation["status"]): ContextAssociation[];
  listDecisionCandidates(packageId: string, status?: DecisionCandidate["status"]): DecisionCandidate[];
  listDecisionPackages(status?: DecisionPackage["status"]): DecisionPackage[];
  listFormalizationCandidates(status?: FormalizationCandidate["status"]): FormalizationCandidate[];
  listGovernanceIssues(workObjectId?: string, status?: GovernanceIssue["status"]): GovernanceIssue[];
  listOwnerships(): PrimaryOwnership[];
  listRecovery(): StoredCommit[];
  listUserReadBaselines(): UserReadBaseline[];
  listWorkObjects(): WorkObject[];
  transaction<T>(work: () => T): T;
}

export interface ClosureGateStore {
  evidenceWatermark(workObjectId: string): number;
  getProjectIntent(workObjectId: string): ProjectIntent | null;
  getWorkObject(id: string): WorkObject | null;
  listEvidence(workObjectId?: string): FrozenEvidence[];
  listGovernanceIssues(workObjectId?: string, status?: GovernanceIssue["status"]): GovernanceIssue[];
  listOwnerships(): PrimaryOwnership[];
  listWorkObjects(): WorkObject[];
}

export interface ClosureReadinessStore extends ClosureGateStore {
  getClosureAssessment(workObjectId: string): ClosureAssessment | null;
  getCurrentClosureRecord(workObjectId: string): CompletionRecord | CancellationRecord | null;
  getEvidence(id: string): FrozenEvidence | null;
  listDecisionCandidates(packageId: string, status?: DecisionCandidate["status"]): DecisionCandidate[];
  listDecisionPackages(status?: DecisionPackage["status"]): DecisionPackage[];
  putClosureAssessment(assessment: ClosureAssessment): void;
  transitionDecisionPackage(id: string, status: DecisionPackage["status"], at: string): void;
}

export interface ClosureAssessmentStore extends ClosureGateStore {
  claimNextClosureAssessmentJob(at: string): ClosureAssessmentJob | null;
  completeClosureAssessmentJob(id: string, at: string, outcome: string): void;
  completeClosureAssessmentJobAsSuperseded(id: string, at: string): ClosureAssessmentJob;
  consumeRemoteCallBudget(scopeKey: string, maxCallsPerHour: number, now: string): boolean;
  deferClosureAssessmentJob(id: string, reason: string, nextNotBefore: string, at: string): ClosureAssessmentJob;
  enqueueClosureAssessmentJob(job: ClosureAssessmentJob): void;
  failClosureAssessmentJob(id: string, reason: string, nextNotBefore: string, at: string, maxAttempts: number): ClosureAssessmentJob;
  getClosureAssessment(workObjectId: string): ClosureAssessment | null;
  hasQueuedClosureAssessmentJobNewerThan(workObjectId: string, currentJobId: string, createdAt: string): boolean;
  listClosureAssessmentJobs(status?: ClosureAssessmentJob["status"]): ClosureAssessmentJob[];
  putClosureAssessment(assessment: ClosureAssessment): void;
  recordMaintenanceFailure(scopeKey: string, at: string): void;
  recordMaintenanceSuccess(scopeKey: string, at: string): void;
}

export interface MaintenanceStore extends ContextStore {
  claimNextReconcileJob(at: string): ReconcileJob | null;
  completeReconcileJob(id: string, workObjectId: string, snapshotId: string, formalVersion: number, at: string, outcome: string, expectedObservedSnapshotId?: string | null): void;
  completeReconcileJobAsSuperseded(id: string, at: string): ReconcileJob;
  /**
   * Completes a reconcile job as skipped by rollout scope without marking the
   * source as reconciled. Coverage remains `has_uncovered_changes = true`, so
   * future scope expansion or an explicit reconcile can still process it.
   */
  completeReconcileJobSkipped(id: string, at: string, reason: string): ReconcileJob;
  consumeRemoteCallBudget(scopeKey: string, maxCallsPerHour: number, now: string): boolean;
  deferReconcileJob(id: string, reason: string, nextNotBefore: string, at: string): ReconcileJob;
  enqueueReconcileJob(job: ReconcileJob): void;
  failReconcileJob(id: string, reason: string, nextNotBefore: string, at: string, maxAttempts: number): ReconcileJob;
  findActiveContextAssociation(workObjectId: string, graphId: string, blockUuid: string): ContextAssociation | null;
  getAnchorForWorkObject(workObjectId: string): PrimaryAnchor | null;
  getGovernanceIssue(id: string): GovernanceIssue | null;
  getProjectIntent(workObjectId: string): ProjectIntent | null;
  getReconcileJob(id: string): ReconcileJob | null;
  getSourceCoverage(workObjectId: string): SourceCoverageState | null;
  getWorkObject(id: string): WorkObject | null;
  hasQueuedReconcileJobNewerThan(workObjectId: string, currentJobId: string, createdAt: string): boolean;
  isMaintenancePaused(scopeKey: string): boolean;
  listContextAssociations(workObjectId?: string, status?: ContextAssociation["status"]): ContextAssociation[];
  listEvidence(workObjectId?: string): FrozenEvidence[];
  listGovernanceIssues(workObjectId?: string, status?: GovernanceIssue["status"]): GovernanceIssue[];
  listReconcileJobs(status?: ReconcileJob["status"]): ReconcileJob[];
  recordMaintenanceFailure(scopeKey: string, at: string): void;
  recordMaintenanceSuccess(scopeKey: string, at: string): void;
  refreshReconcileJobSemanticRevision(id: string, formalVersion: number, semanticRevision: string, nextNotBefore: string, at: string): ReconcileJob;
  setMaintenancePause(scopeKey: string, paused: boolean, at: string): void;
  upsertSourceCoverage(state: SourceCoverageState): void;
}

export interface ProjectionDeliveryStore {
  getCommit(id: string): StoredCommit | null;
  listProjectionObligations(status?: ProjectionObligation["status"]): ProjectionObligation[];
}


export type FormalizationCandidatePatch = Partial<Pick<FormalizationCandidate,
  "status" | "revision" | "recommendedKind" | "recommendedOwnerId" | "proposedTitle" | "proposedWorkIntent" | "rationaleSummary" | "maturity" | "maturityEvaluatedAt" | "supportingSourceRefs" | "updatedAt" | "lastObservedAt" | "expiresAt" | "materializedWorkObjectId" | "decisionPackageId">>;

export interface DiscoveryStore extends ContextStore {
  addCandidateDiscoveryRun(candidateId: string, runId: string): void;
  addCandidateEvidenceRef(candidateId: string, evidenceId: string): void;
  addCandidateSources(candidateId: string, sourceRefs: readonly ContextAssociation["sourceRef"][], sourceHashes: readonly string[], sourceContents: readonly string[], observedAt: string): void;
  findOpenCandidateContainingSources(sourceRefs: readonly ContextAssociation["sourceRef"][]): FormalizationCandidate | null;
  getDecisionPackage(id: string): DecisionPackage | null;
  getDiscoveryRun(id: string): DiscoveryRun | null;
  getFormalizationCandidate(id: string): FormalizationCandidate | null;
  getFormalizationCandidateByPackage(packageId: string): FormalizationCandidate | null;
  isMaterializedCandidateSource(graphId: string, blockUuid: string): boolean;
  latestDiscoverySourceOutcome(graphId: string, blockUuid: string): DiscoveryRunSourceOutcome | null;
  listCandidateEvidence(candidateId: string): FormalizationEvidence[];
  listDiscoveryRuns(): DiscoveryRun[];
  listFormalizationCandidates(status?: FormalizationCandidate["status"]): FormalizationCandidate[];
  listWorkObjects(): WorkObject[];
  putCandidateEvidence(evidence: FormalizationEvidence): void;
  putCandidateSupportingSources(candidateId: string, sourceRefs: readonly ContextAssociation["sourceRef"][]): void;
  putDiscoveryRun(run: DiscoveryRun): void;
  putDiscoveryRunSource(source: DiscoveryRunSourceOutcome): void;
  putFormalizationCandidate(candidate: FormalizationCandidate): void;
  transitionDecisionPackage(id: string, status: DecisionPackage["status"], at: string): void;
  transitionFormalizationCandidate(id: string, status: FormalizationCandidate["status"], at: string): void;
  updateFormalizationCandidate(id: string, patch: FormalizationCandidatePatch): void;
}

export interface ExternalAgentStore {
  getAgentRun(id: string): AgentRunReceipt | null;
  getAnchorForWorkObject(workObjectId: string): PrimaryAnchor | null;
  getCommit(id: string): StoredCommit | null;
  getCurationReceipt(id: string): CurationReceipt | null;
  getEvidence(id: string): FrozenEvidence | null;
  getProjectionObligationForCommit(commitId: string): ProjectionObligation | null;
  getProposal(id: string): { proposal: Proposal; revision: ProposalRevision } | null;
  getWorkObject(id: string): WorkObject | null;
  listCommits(query?: { targetId?: string; status?: CommitStatus }): StoredCommit[];
  listGraphReadReceipts(agentRunId: string): GraphReadReceipt[];
  putCurationReceipt(receipt: CurationReceipt): void;
  putGraphReadReceipt(receipt: GraphReadReceipt): void;
}

export interface DogfoodScopeStore {
  getWorkObject(id: string): WorkObject | null;
  listOwnerships(): PrimaryOwnership[];
  listWorkObjects(): WorkObject[];
}

/** Queries and bounded state transitions used by the HTTP application. */
export interface ServiceApplicationStore extends ProjectionStore {
  getAgentRun(id: string): AgentRunReceipt | null;
  getAnchorForWorkObject(workObjectId: string): PrimaryAnchor | null;
  getClosureHistory(workObjectId: string): ClosureHistory;
  getCommit(id: string): StoredCommit | null;
  getEvidence(id: string): FrozenEvidence | null;
  getProjectionObligationForCommit(commitId: string): ProjectionObligation | null;
  getProposal(id: string): { proposal: Proposal; revision: ProposalRevision } | null;
  getUserReadBaseline(workObjectId: string): UserReadBaseline | null;
  listActionableWorkObjects(): WorkObject[];
  listCurationReceipts(workObjectId?: string): CurationReceipt[];
  listDiscoveryRunSources(runId: string): DiscoveryRunSourceOutcome[];
  listEvidence(workObjectId?: string): FrozenEvidence[];
  listFeedback(): FeedbackEvent[];
  transitionDecisionPackage(id: string, status: DecisionPackage["status"], at: string): void;
  updateUserDecisionExecution(id: string, status: UserDecision["status"], executedAt: string, executionRefs: readonly string[]): void;
}
