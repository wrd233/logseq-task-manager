import type { AgentRunReceipt, AssociationCorrection, ClosureHistory, CommitStatus, ContextAssociation, DecisionCandidate, DecisionPackage, FeedbackEvent, FrozenEvidence, GovernanceDimension, GovernanceIssue, ProjectIntent, ProjectionObligation, Proposal, ProposalRevision, SkillIdentity, StoredCommit, TrustedUserEvent, UserDecision, UserReadBaseline } from "@task-copilot/contracts";
import type { CancellationRecord, ClosureAmendment, CompletionRecord, PrimaryAnchor, PrimaryOwnership, ReopenRecord, WorkObject } from "@task-copilot/domain";

// Consumer-owned capabilities; implementations share one connection, and do not open it here.
export interface FormalStore extends ContextStore, ReadingStore {
  appendProposalRevisionWithFeedback(revision: ProposalRevision, feedback: FeedbackEvent, at: string): void;
  consumeTrustedUserEvent(id: string, decisionId: string): void;
  deleteWorkObject(id: string): void;
  evidenceWatermark(workObjectId: string): number;
  findOpenGovernanceIssue(workObjectId: string, dimension: GovernanceDimension, type: GovernanceIssue["type"], sourceSnapshotId: string): GovernanceIssue | null;
  finishAgentRunResult(run: AgentRunReceipt, proposal: Proposal | null, revision: ProposalRevision | null): void;
  getAgentRun(id: string): AgentRunReceipt | null;
  getAnchorForWorkObject(workObjectId: string): PrimaryAnchor | null;
  getClosureHistory(workObjectId: string): ClosureHistory;
  getClosureRecord(id: string): CompletionRecord | CancellationRecord | null;
  getCommit(id: string): StoredCommit | null;
  getCurrentClosureRecord(workObjectId: string): CompletionRecord | CancellationRecord | null;
  getDecisionPackage(id: string): DecisionPackage | null;
  getEvidence(id: string): FrozenEvidence | null;
  getGovernanceIssue(id: string): GovernanceIssue | null;
  getOwnershipByChild(childId: string): PrimaryOwnership | null;
  getProjectIntent(workObjectId: string): ProjectIntent | null;
  getProjectionObligationForCommit(commitId: string): ProjectionObligation | null;
  getProposal(id: string): {
      proposal: Proposal;
      revision: ProposalRevision;
  } | null;
  getTrustedUserEvent(id: string): TrustedUserEvent | null;
  getUserDecision(id: string): UserDecision | null;
  hasPendingRecoveryForTarget(workObjectId: string): boolean;
  insertCommit(commit: StoredCommit): void;
  listDecisionCandidates(packageId: string, status?: DecisionCandidate["status"]): DecisionCandidate[];
  listDecisionPackages(status?: DecisionPackage["status"]): DecisionPackage[];
  listEvidence(workObjectId?: string): FrozenEvidence[];
  listGovernanceIssues(workObjectId?: string, status?: GovernanceIssue["status"]): GovernanceIssue[];
  listOwnerships(): PrimaryOwnership[];
  listProjectionObligations(status?: ProjectionObligation["status"]): ProjectionObligation[];
  listRecovery(): StoredCommit[];
  listTrustedUserEvents(packageId?: string): TrustedUserEvent[];
  listUserDecisions(packageId?: string): UserDecision[];
  listWorkObjects(): WorkObject[];
  putAgentRun(run: AgentRunReceipt): void;
  putAgentRunResult(run: AgentRunReceipt, proposal: Proposal | null, revision: ProposalRevision | null): void;
  putAnchor(anchor: PrimaryAnchor): void;
  putCancellationRecord(record: CancellationRecord, commitId: string): void;
  putClosureAmendment(record: ClosureAmendment, commitId: string): void;
  putCompletionRecord(record: CompletionRecord, commitId: string): void;
  putDecisionCandidate(candidate: DecisionCandidate): void;
  putDecisionPackage(pkg: DecisionPackage): void;
  putEvidence(evidence: FrozenEvidence): void;
  putFeedback(event: FeedbackEvent): void;
  putGovernanceIssue(issue: GovernanceIssue): void;
  putOwnership(ownership: PrimaryOwnership): void;
  putProjectIntent(intent: ProjectIntent): void;
  putProjectionObligation(obligation: ProjectionObligation): void;
  putReopenRecord(record: ReopenRecord, commitId: string): void;
  putTrustedUserEvent(event: TrustedUserEvent): void;
  putUserDecision(decision: UserDecision): void;
  putWorkObject(object: WorkObject): void;
  registerSkill(skill: SkillIdentity, packageValue: unknown, at: string): void;
  replaceOwnership(ownership: PrimaryOwnership): void;
  setCompensatedBy(id: string, compensationCommitId: string, updatedAt: string): void;
  skillRegistered(skill: SkillIdentity): boolean;
  transitionCommit(id: string, status: CommitStatus, update: {
      updatedAt: string;
      graphResult?: unknown;
      failureReason?: string | null;
      compensatedBy?: string | null;
  }): void;
  transitionDecisionCandidate(id: string, status: DecisionCandidate["status"]): void;
  transitionDecisionPackage(id: string, status: DecisionPackage["status"], at: string): void;
  transitionGovernanceIssue(id: string, status: GovernanceIssue["status"], at: string): void;
  transitionProjectionObligation(commitId: string, status: ProjectionObligation["status"], update: {
      updatedAt: string;
      lastError?: string | null;
      attempt?: number;
      lastAttemptAt?: string | null;
      nextAttemptAt?: string | null;
      retryExhausted?: boolean;
  }): void;
  transitionProposal(id: string, status: Proposal["status"], at: string, update?: {
      appliedCommitId?: string;
      invalidationReason?: string;
  }): void;
  updateUserDecisionExecution(id: string, status: UserDecision["status"], executedAt: string, executionRefs: readonly string[]): void;
  updateUserDecisionWorkObjects(id: string, workObjectIds: readonly string[]): void;
}

export interface ContextStore {
  getWorkObject(id: string): WorkObject | null;
  findActiveCorrection(graphId: string, blockUuid: string, rejectedWorkObjectId: string): AssociationCorrection | null;
  findActiveContextAssociation(workObjectId: string, graphId: string, blockUuid: string): ContextAssociation | null;
  putContextAssociation(association: ContextAssociation): void;
  listContextAssociations(workObjectId?: string, status?: ContextAssociation["status"]): ContextAssociation[];
  invalidateContextAssociation(id: string, at: string): void;
  getContextAssociation(id: string): ContextAssociation | null;
  putAssociationCorrection(correction: AssociationCorrection): void;
  transaction<T>(work: () => T): T;
}

export interface ReadingStore {
  getWorkObject(id: string): WorkObject | null;
  listCommits(query?: {
      targetId?: string;
      status?: CommitStatus;
  }): StoredCommit[];
  putUserReadBaseline(baseline: UserReadBaseline): void;
}
