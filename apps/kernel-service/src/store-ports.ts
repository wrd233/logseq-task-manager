import type { ClosureAssessment, ClosureAssessmentJob, CommitStatus, ContextAssociation, DecisionCandidate, DecisionPackage, FormalizationCandidate, FrozenEvidence, GovernanceIssue, ProjectIntent, ProjectionObligation, ReconcileJob, SourceCoverageState, StoredCommit, UserReadBaseline } from "@task-copilot/contracts";
import type { CancellationRecord, CompletionRecord, PrimaryAnchor, PrimaryOwnership, WorkObject } from "@task-copilot/domain";

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

export interface MaintenanceStore {
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
