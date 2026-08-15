import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { APPROVED_CURRENT_FOCUS_SKILL, APPROVED_ENGAGEMENT_SKILL, APPROVED_MINI_PROJECT_SKILL, APPROVED_MINI_PROJECT_TASTE, APPROVED_WORK_INTENT_SKILL, canonicalizeGraphContent, deterministicUuid as deterministicIdentityUuid, graphEvidenceProofPayload, OPERATION_CONTRACT_VERSION, parseAgentCurrentFocusResult, parseAgentEngagementResult, parseMiniProjectAgentResult, parseSemanticOperation, stableHash, type Actor, type AgentCurrentFocusResult, type AgentEngagementResult, type AgentRunReceipt, type AssociationCorrection, type ContextAssociation, type CurrentFocusAgent, type CurrentFocusProposalRevision, type EffectiveClosure, type EngagementAgent, type EngagementProposalRevision, type FormalCommitResult, type FrozenEvidence, type GovernanceIssue, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type GraphSnapshotInput, type ManagedProjection, type MiniProjectAgentResult, type ProjectionObligation, type Proposal, type ProposalRevision, type SemanticOperation, type SkillPackage, type StoredCommit, type TasteProfile, type TrustedGraphEvidenceMaterial, type WorkIntentProposalRevision } from "@task-copilot/contracts";
import { advanceClosureAmendment, amendClosure, cancelWorkObject, changeEngagement, completeWorkObject, createWorkObject, reopenWorkObject, renameWorkObject, restoreEngagement, restoreWorkObject, setCurrentFocus, updateWorkIntent, type ClosureAmendment, type ClosureRecord, type PrimaryAnchor, type ReopenRecord, type WorkObject } from "@task-copilot/domain";
import type { SqliteStore } from "@task-copilot/sqlite";

type DurableStage = "PREPARED" | "KERNEL_APPLIED" | "GRAPH_APPLIED" | "COMMITTED";
export type RecoveryAction = "ABORT_PREPARED" | "RESUME_GRAPH_APPLY" | "VERIFY_GRAPH" | "MANUAL_RECONCILIATION";

export class KernelError extends Error {
  readonly code: string;
  readonly commitId: string | null;
  constructor(code: string, message: string, commitId: string | null = null) {
    super(`${code}: ${message}`); this.name = "KernelError"; this.code = code; this.commitId = commitId;
  }
}

export interface KernelOptions {
  now?: () => string;
  afterStage?: (stage: DurableStage, commitId: string) => void;
  authorizedUserId?: string;
  currentFocusAgent?: CurrentFocusAgent;
  currentFocusSkill?: SkillPackage;
  engagementAgent?: EngagementAgent;
  engagementSkill?: SkillPackage;
  miniProjectSkill?: SkillPackage;
  workIntentSkill?: SkillPackage;
  miniProjectTaste?: TasteProfile;
  graphSnapshotKey?: string;
  projectionMaxAttempts?: number;
  projectionBackoffBaseMs?: number;
  projectionTemporaryBackoffMs?: number;
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; hex[16] = "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function canonicalWorkObject(object: WorkObject): string {
  return JSON.stringify([object.id, object.kind, object.title, object.lifecycle, object.engagement, object.waitingCondition, object.currentFocus, object.desiredOutcome, object.completionChecks, object.version, object.createdAt, object.updatedAt]);
}

function resultingProjectionHash(effect: GraphEffect): string | null {
  return effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection.projectionHash
    : effect.type === "UPDATE_MANAGED_FIELD" || effect.type === "SET_CURRENT_FOCUS_FIELD" || effect.type === "UPDATE_WORK_INTENT_FIELDS" || effect.type === "CHANGE_ENGAGEMENT_FIELDS" || effect.type === "CHANGE_CLOSURE_FIELDS" ? effect.resultingProjectionHash : null;
}

function projectionFor(object: WorkObject, anchor: Pick<PrimaryAnchor, "projectionContainerUuid" | "projectionTitleUuid" | "projectionStateUuid" | "projectionFocusUuid" | "projectionWaitingUuid" | "projectionOutcomeUuid" | "projectionCompletionUuid">, closure: ManagedProjection["closure"] = null): ManagedProjection {
  const base = {
    containerUuid: anchor.projectionContainerUuid, titleUuid: anchor.projectionTitleUuid, stateUuid: anchor.projectionStateUuid,
    focusUuid: anchor.projectionFocusUuid, waitingUuid: anchor.projectionWaitingUuid, outcomeUuid: anchor.projectionOutcomeUuid, completionUuid: anchor.projectionCompletionUuid, title: object.title, lifecycle: object.lifecycle, engagement: object.engagement, waitingCondition: object.waitingCondition, currentFocus: object.currentFocus, desiredOutcome: object.desiredOutcome, completionChecks: object.completionChecks,
  };
  const core = closure ? { ...base, closure } : base;
  return { ...core, projectionHash: stableHash(core) };
}

function closureProjection(closure: EffectiveClosure | null): ManagedProjection["closure"] {
  if (!closure) return null;
  return closure.type === "COMPLETED" ? { type: "COMPLETED", recordId: closure.record.id, outcomeSummary: closure.outcomeSummary } : { type: "CANCELLED", recordId: closure.record.id, reason: closure.reason };
}

function proposalValue(revision: ProposalRevision): unknown {
  if (revision.operationType === "SET_CURRENT_FOCUS") return revision.currentFocus;
  if (revision.operationType === "UPDATE_WORK_INTENT") return { desiredOutcome: revision.desiredOutcome, completionChecks: revision.completionChecks };
  return revision.transition;
}

function objectValue(object: WorkObject | null, operationType: ProposalRevision["operationType"]): unknown {
  if (!object) return null;
  if (operationType === "SET_CURRENT_FOCUS") return object.currentFocus;
  if (operationType === "UPDATE_WORK_INTENT") return { desiredOutcome: object.desiredOutcome, completionChecks: object.completionChecks };
  return { engagement: object.engagement, waitingCondition: object.waitingCondition };
}

function approvedCurrentFocusSkill(skill: SkillPackage): boolean {
  const manifest = skill.manifest as { id?: unknown; version?: unknown; operation?: unknown; risk?: unknown };
  return skill.id === APPROVED_CURRENT_FOCUS_SKILL.id && skill.version === APPROVED_CURRENT_FOCUS_SKILL.version && skill.contentHash === APPROVED_CURRENT_FOCUS_SKILL.contentHash &&
    manifest.id === skill.id && manifest.version === skill.version && manifest.operation === "SET_CURRENT_FOCUS" && manifest.risk === "LOW";
}

function approvedEngagementSkill(skill: SkillPackage): boolean {
  const manifest = skill.manifest as { id?: unknown; version?: unknown; operation?: unknown; risk?: unknown };
  return skill.id === APPROVED_ENGAGEMENT_SKILL.id && skill.version === APPROVED_ENGAGEMENT_SKILL.version && skill.contentHash === APPROVED_ENGAGEMENT_SKILL.contentHash &&
    manifest.id === skill.id && manifest.version === skill.version && manifest.operation === "CHANGE_ENGAGEMENT" && manifest.risk === "LOW";
}

function approvedMiniProjectSkill(skill: SkillPackage): boolean {
  const manifest = skill.manifest as { id?: unknown; version?: unknown; purpose?: unknown; authority?: unknown };
  return skill.id === APPROVED_MINI_PROJECT_SKILL.id && skill.version === APPROVED_MINI_PROJECT_SKILL.version && skill.contentHash === APPROVED_MINI_PROJECT_SKILL.contentHash && manifest.id === skill.id && manifest.version === skill.version && manifest.purpose === "MINI_PROJECT_GOVERNANCE" && manifest.authority === "READ_ONLY_COMPOSITE";
}

function approvedWorkIntentSkill(skill: SkillPackage): boolean {
  const manifest = skill.manifest as { id?: unknown; version?: unknown; operation?: unknown; risk?: unknown };
  return skill.id === APPROVED_WORK_INTENT_SKILL.id && skill.version === APPROVED_WORK_INTENT_SKILL.version && skill.contentHash === APPROVED_WORK_INTENT_SKILL.contentHash &&
    manifest.id === skill.id && manifest.version === skill.version && manifest.operation === "UPDATE_WORK_INTENT" && manifest.risk === "LOW";
}

function approvedMiniProjectTaste(taste: TasteProfile): boolean {
  return taste.id === APPROVED_MINI_PROJECT_TASTE.id && taste.version === APPROVED_MINI_PROJECT_TASTE.version && taste.contentHash === APPROVED_MINI_PROJECT_TASTE.contentHash && (taste.status === "ACTIVE" || taste.status === "PROVISIONAL");
}

export class Kernel {
  readonly #store: SqliteStore;
  readonly #now: () => string;
  readonly #afterStage: (stage: DurableStage, commitId: string) => void;
  readonly #authorizedUserId: string;
  readonly #agent: CurrentFocusAgent | null;
  readonly #skill: SkillPackage | null;
  readonly #engagementAgent: EngagementAgent | null;
  readonly #engagementSkill: SkillPackage | null;
  readonly #miniProjectSkill: SkillPackage | null;
  readonly #workIntentSkill: SkillPackage | null;
  readonly #miniProjectTaste: TasteProfile | null;
  readonly #graphSnapshotKey: string | null;
  readonly #projectionMaxAttempts: number;
  readonly #projectionBackoffBaseMs: number;
  readonly #projectionTemporaryBackoffMs: number;

  constructor(store: SqliteStore, options: KernelOptions = {}) {
    this.#store = store; this.#now = options.now ?? (() => new Date().toISOString()); this.#afterStage = options.afterStage ?? (() => undefined); this.#authorizedUserId = options.authorizedUserId ?? "local-user";
    this.#agent = options.currentFocusAgent ?? null; this.#skill = options.currentFocusSkill ?? null;
    this.#engagementAgent = options.engagementAgent ?? null; this.#engagementSkill = options.engagementSkill ?? null;
    this.#miniProjectSkill = options.miniProjectSkill ?? null; this.#workIntentSkill = options.workIntentSkill ?? null; this.#miniProjectTaste = options.miniProjectTaste ?? null;
    this.#graphSnapshotKey = options.graphSnapshotKey ?? null;
    this.#projectionMaxAttempts = options.projectionMaxAttempts ?? 5;
    this.#projectionBackoffBaseMs = options.projectionBackoffBaseMs ?? 2_000;
    this.#projectionTemporaryBackoffMs = options.projectionTemporaryBackoffMs ?? 30_000;
  }

  approvedSkills(): readonly SkillPackage[] {
    return [this.#skill, this.#engagementSkill, this.#miniProjectSkill, this.#workIntentSkill].filter((skill): skill is SkillPackage => skill !== null);
  }

  tasteProfiles(): readonly TasteProfile[] { return this.#miniProjectTaste ? [this.#miniProjectTaste] : []; }

  targetSnapshotInput(workObjectId: string): GraphSnapshotInput {
    const object = this.#store.getWorkObject(workObjectId); const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("WORK_OBJECT_NOT_FOUND", "WorkObject or PrimaryAnchor does not exist.");
    return { graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, expectedProjection: projectionFor(object, anchor, closureProjection(this.#store.getClosureHistory(object.id).current)) };
  }

  #authorize(actor: Actor): void {
    if (actor.type !== "USER" || actor.id !== this.#authorizedUserId) throw new KernelError("ACTOR_NOT_AUTHORIZED", "This slice permits only the configured local user; Agent and System writes require future governance policy.");
  }

  #verifyGraphEvidence(material: TrustedGraphEvidenceMaterial): string {
    if (!this.#graphSnapshotKey || !/^[0-9a-f]{64}$/u.test(this.#graphSnapshotKey)) throw new KernelError("GRAPH_SNAPSHOT_TRUST_UNAVAILABLE", "Trusted Graph snapshot verification is not configured.");
    const expectedProof = createHmac("sha256", this.#graphSnapshotKey).update(graphEvidenceProofPayload(material)).digest();
    if (!/^[0-9a-f]{64}$/u.test(material.proof) || !timingSafeEqual(expectedProof, Buffer.from(material.proof, "hex"))) throw new KernelError("GRAPH_SNAPSHOT_PROOF_INVALID", "Graph snapshot was not produced by the trusted Graph Adapter.");
    const content = canonicalizeGraphContent(material.content);
    if (!content || stableHash(content) !== material.sourceContentHash) throw new KernelError("EVIDENCE_SNAPSHOT_INVALID", "Fresh Graph content does not match its canonical snapshot hash.");
    return content;
  }

  listEvidence(workObjectId?: string): FrozenEvidence[] {
    return this.#store.listEvidence(workObjectId);
  }

  freezeEvidence(input: { evidenceId: string; workObjectId: string; snapshot: TrustedGraphEvidenceMaterial }): FrozenEvidence {    const object = this.#store.getWorkObject(input.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Evidence target or primary anchor does not exist.");
    if (input.snapshot.graphId !== anchor.graphId) throw new KernelError("EVIDENCE_GRAPH_MISMATCH", "Evidence must come from the target WorkObject's Graph.");
    const content = this.#verifyGraphEvidence(input.snapshot);
    const existing = this.#store.getEvidence(input.evidenceId);
    if (existing) {
      const hash = createHash("sha256").update(content).digest("hex");
      if (existing.workObjectId === object.id && existing.graphId === input.snapshot.graphId && existing.externalId === input.snapshot.blockUuid && existing.contentHash === hash) return existing;
      throw new KernelError("EVIDENCE_ID_ALREADY_EXISTS", "Evidence id is already bound to another frozen snapshot.");
    }
    const frozenAt = this.#now();
    const evidence: FrozenEvidence = {
      id: input.evidenceId, workObjectId: object.id, sourceType: "LOGSEQ_BLOCK", graphId: input.snapshot.graphId,
      externalId: input.snapshot.blockUuid, frozenContent: content,
      contentHash: createHash("sha256").update(content).digest("hex"), frozenAt,
      locator: { graphId: input.snapshot.graphId, blockUuid: input.snapshot.blockUuid },
    };
    this.#store.putEvidence(evidence);
    return evidence;
  }

  async runCurrentFocusAgent(input: { runId: string; workObjectId: string; evidenceIds: readonly string[]; snapshot: GraphSnapshot }): Promise<{ run: AgentRunReceipt; proposal: Proposal | null; revision: CurrentFocusProposalRevision | null }> {
    if (!this.#agent || !this.#skill) throw new KernelError("AGENT_NOT_CONFIGURED", "Current-focus Agent and Skill are not configured.");
    if (!approvedCurrentFocusSkill(this.#skill)) throw new KernelError("SKILL_NOT_APPROVED", "Only current-focus-maintenance@0.1.0 is approved for this Agent operation.");
    const object = this.#store.getWorkObject(input.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Agent target or primary anchor does not exist.");
    if (object.lifecycle !== "OPEN") throw new KernelError("CURRENT_FOCUS_OUT_OF_SCOPE", "Only an OPEN WorkObject may receive Agent current-focus governance.");
    if (this.#store.hasPendingRecoveryForTarget(object.id)) throw new KernelError("TARGET_RECOVERY_PENDING", "Target has an incomplete Commit requiring recovery.");
    const projection = projectionFor(object, anchor);
    if (input.snapshot.graphId !== anchor.graphId || input.snapshot.sourceBlockUuid !== anchor.externalId || input.snapshot.projection?.projectionHash !== projection.projectionHash) {
      throw new KernelError("TARGET_PROJECTION_STALE", "Target projection is not the current Kernel projection.");
    }
    const evidence = input.evidenceIds.map((id) => this.#store.getEvidence(id));
    if (!evidence.length || evidence.some((item) => !item || item.workObjectId !== object.id)) throw new KernelError("EVIDENCE_INVALID", "Agent requires frozen Evidence for the exact target.");
    const startedAt = this.#now();
    this.#store.registerSkill(this.#skill, this.#skill, startedAt);
    let rawResult: unknown;
    try { rawResult = await this.#agent.propose({ target: object, evidence: evidence as FrozenEvidence[], skill: this.#skill }); }
    catch (error) {
      this.#store.putAgentRun(this.#failedRun(input, object, startedAt, "AGENT_EXECUTION_FAILED", error));
      throw new KernelError("AGENT_EXECUTION_FAILED", "Configured current-focus Agent failed.");
    }
    let result: AgentCurrentFocusResult;
    try { result = parseAgentCurrentFocusResult(rawResult); }
    catch (error) {
      this.#store.putAgentRun(this.#failedRun(input, object, startedAt, "AGENT_RESULT_INVALID", error));
      throw new KernelError("AGENT_RESULT_INVALID", "Configured Agent returned output outside the current-focus contract.");
    }
    const now = this.#now();
    let proposal: Proposal | null = null;
    let revision: CurrentFocusProposalRevision | null = null;
    if (result.outcome === "PROPOSAL") {
      try {
        const proposalId = deterministicUuid(`proposal:${input.runId}`);
        revision = {
        proposalId, revision: 1, operationType: "SET_CURRENT_FOCUS", operationContractVersion: OPERATION_CONTRACT_VERSION, currentFocus: result.currentFocus?.trim() || null,
        expectedVersion: object.version, expectedProjectionHash: projection.projectionHash,
        evidenceDependencies: (evidence as FrozenEvidence[]).map((item) => ({ evidenceId: item.id, contentHash: item.contentHash })),
        skill: { id: this.#skill.id, version: this.#skill.version, contentHash: this.#skill.contentHash }, agentRunId: input.runId,
        risk: "LOW", createdAt: now,
        };
        parseSemanticOperation({ operationId: `validate-${input.runId}`, type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: this.#agent.id }, target: { workObjectId: object.id, expectedVersion: object.version, expectedProjectionHash: projection.projectionHash }, input: { currentFocus: revision.currentFocus }, evidenceDependencies: revision.evidenceDependencies });
        proposal = { id: proposalId, workObjectId: object.id, status: "OPEN", latestRevision: 1, appliedCommitId: null, invalidationReason: null, createdAt: now, updatedAt: now };
      } catch (error) {
        this.#store.putAgentRun(this.#failedRun(input, object, startedAt, "AGENT_RESULT_INVALID", error));
        throw new KernelError("AGENT_RESULT_INVALID", "Configured Agent returned output outside the current-focus contract.");
      }
    }
    const run: AgentRunReceipt = {
      id: input.runId, purpose: "CURRENT_FOCUS_MAINTENANCE", executor: { type: "FAKE", id: this.#agent.id }, operationContractVersion: OPERATION_CONTRACT_VERSION,
      state: "FINISHED",
      skill: { id: this.#skill.id, version: this.#skill.version, contentHash: this.#skill.contentHash }, subject: { workObjectId: object.id },
      context: { targetVersion: object.version, evidenceIds: input.evidenceIds }, result: { outcome: result.outcome, proposalIds: proposal ? [proposal.id] : [] },
      reasonCode: result.reasonCode, rationaleSummary: result.rationaleSummary, startedAt, finishedAt: now,
    };
    this.#store.putAgentRunResult(run, proposal, revision);
    return { run, proposal, revision };
  }

  #failedRun(input: { runId: string; workObjectId: string; evidenceIds: readonly string[] }, object: WorkObject, startedAt: string, reasonCode: string, error: unknown): AgentRunReceipt {
    return {
      id: input.runId, purpose: "CURRENT_FOCUS_MAINTENANCE", executor: { type: "FAKE", id: this.#agent!.id }, operationContractVersion: OPERATION_CONTRACT_VERSION,
      state: "FINISHED",
      skill: { id: this.#skill!.id, version: this.#skill!.version, contentHash: this.#skill!.contentHash }, subject: { workObjectId: object.id },
      context: { targetVersion: object.version, evidenceIds: input.evidenceIds }, result: { outcome: "FAILED", proposalIds: [] }, reasonCode,
      rationaleSummary: error instanceof Error ? error.message.slice(0, 200) : "Agent execution failed.", startedAt, finishedAt: this.#now(),
    };
  }

  async runEngagementAgent(input: { runId: string; workObjectId: string; evidenceIds: readonly string[]; snapshot: GraphSnapshot }): Promise<{ run: AgentRunReceipt; proposal: Proposal | null; revision: EngagementProposalRevision | null }> {
    if (!this.#engagementAgent || !this.#engagementSkill) throw new KernelError("AGENT_NOT_CONFIGURED", "Engagement Agent and Skill are not configured.");
    if (!approvedEngagementSkill(this.#engagementSkill)) throw new KernelError("SKILL_NOT_APPROVED", "Only engagement-reconciliation@0.1.1 is approved for Engagement reconciliation.");
    const object = this.#store.getWorkObject(input.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Agent target or primary anchor does not exist.");
    if (object.lifecycle !== "OPEN" || (object.engagement !== "ACTIONABLE" && object.engagement !== "WAITING")) throw new KernelError("ENGAGEMENT_OUT_OF_SCOPE", "Only OPEN ACTIONABLE or WAITING WorkObjects may reconcile.");
    if (this.#store.hasPendingRecoveryForTarget(object.id)) throw new KernelError("TARGET_RECOVERY_PENDING", "Target has an incomplete Commit requiring recovery.");
    const projection = projectionFor(object, anchor);
    if (input.snapshot.graphId !== anchor.graphId || input.snapshot.sourceBlockUuid !== anchor.externalId || input.snapshot.projection?.projectionHash !== projection.projectionHash) throw new KernelError("TARGET_PROJECTION_STALE", "Target projection is not current.");
    const evidence = input.evidenceIds.map((id) => this.#store.getEvidence(id));
    if (!evidence.length || evidence.some((item) => !item || item.workObjectId !== object.id)) throw new KernelError("EVIDENCE_INVALID", "Engagement reconciliation requires frozen Evidence for the exact target.");
    const startedAt = this.#now();
    this.#store.registerSkill(this.#engagementSkill, this.#engagementSkill, startedAt);
    let rawResult: unknown;
    try { rawResult = await this.#engagementAgent.propose({ target: object, evidence: evidence as FrozenEvidence[], skill: this.#engagementSkill }); }
    catch (error) {
      this.#store.putAgentRun(this.#failedEngagementRun(input, object, startedAt, "AGENT_EXECUTION_FAILED", error));
      throw new KernelError("AGENT_EXECUTION_FAILED", "Configured Engagement Agent failed.");
    }
    let result: AgentEngagementResult;
    try { result = parseAgentEngagementResult(rawResult); }
    catch (error) {
      this.#store.putAgentRun(this.#failedEngagementRun(input, object, startedAt, "AGENT_RESULT_INVALID", error));
      throw new KernelError("AGENT_RESULT_INVALID", "Configured Agent returned output outside the Engagement contract.");
    }
    const now = this.#now();
    let proposal: Proposal | null = null;
    let revision: EngagementProposalRevision | null = null;
    if (result.outcome === "PROPOSAL") {
      try {
        const proposalId = deterministicUuid(`proposal:${input.runId}`);
        const dependencies = (evidence as FrozenEvidence[]).map((item) => ({ evidenceId: item.id, contentHash: item.contentHash }));
        const transition = { ...result.transition!, waiting: result.transition!.waiting ? { ...result.transition!.waiting, evidenceIds: dependencies.map((item) => item.evidenceId) } : null };
        parseSemanticOperation({ operationId: `validate-${input.runId}`, type: "CHANGE_ENGAGEMENT", actor: { type: "AGENT", id: this.#engagementAgent.id }, target: { workObjectId: object.id, expectedVersion: object.version, expectedProjectionHash: projection.projectionHash }, input: transition, evidenceDependencies: dependencies });
        revision = { proposalId, revision: 1, operationType: "CHANGE_ENGAGEMENT", operationContractVersion: OPERATION_CONTRACT_VERSION, transition, expectedVersion: object.version, expectedProjectionHash: projection.projectionHash, evidenceDependencies: dependencies, evidenceWatermark: this.#store.evidenceWatermark(object.id), skill: { id: this.#engagementSkill.id, version: this.#engagementSkill.version, contentHash: this.#engagementSkill.contentHash }, agentRunId: input.runId, risk: "LOW", createdAt: now };
        proposal = { id: proposalId, workObjectId: object.id, status: "OPEN", latestRevision: 1, appliedCommitId: null, invalidationReason: null, createdAt: now, updatedAt: now };
      } catch (error) {
        this.#store.putAgentRun(this.#failedEngagementRun(input, object, startedAt, "AGENT_RESULT_INVALID", error));
        throw new KernelError("AGENT_RESULT_INVALID", "Configured Agent returned output outside the Engagement contract.");
      }
    }
    const run: AgentRunReceipt = { id: input.runId, purpose: "ENGAGEMENT_RECONCILIATION", executor: { type: "FAKE", id: this.#engagementAgent.id }, state: "FINISHED", operationContractVersion: OPERATION_CONTRACT_VERSION, skill: { id: this.#engagementSkill.id, version: this.#engagementSkill.version, contentHash: this.#engagementSkill.contentHash }, subject: { workObjectId: object.id }, context: { targetVersion: object.version, evidenceIds: input.evidenceIds, currentEngagement: object.engagement, waitingCondition: object.waitingCondition }, result: { outcome: result.outcome, proposalIds: proposal ? [proposal.id] : [] }, reasonCode: result.reasonCode, rationaleSummary: result.rationaleSummary, startedAt, finishedAt: now };
    this.#store.putAgentRunResult(run, proposal, revision);
    return { run, proposal, revision };
  }

  #failedEngagementRun(input: { runId: string; workObjectId: string; evidenceIds: readonly string[] }, object: WorkObject, startedAt: string, reasonCode: string, error: unknown): AgentRunReceipt {
    return { id: input.runId, purpose: "ENGAGEMENT_RECONCILIATION", executor: { type: "FAKE", id: this.#engagementAgent!.id }, state: "FINISHED", operationContractVersion: OPERATION_CONTRACT_VERSION, skill: { id: this.#engagementSkill!.id, version: this.#engagementSkill!.version, contentHash: this.#engagementSkill!.contentHash }, subject: { workObjectId: object.id }, context: { targetVersion: object.version, evidenceIds: input.evidenceIds, currentEngagement: object.engagement, waitingCondition: object.waitingCondition }, result: { outcome: "FAILED", proposalIds: [] }, reasonCode, rationaleSummary: error instanceof Error ? error.message.slice(0, 200) : "Agent execution failed.", startedAt, finishedAt: this.#now() };
  }

  startExternalAgentRun(input: { runId: string; purpose: AgentRunReceipt["purpose"]; workObjectId: string; evidenceIds: readonly string[]; executorId: string; governanceCorrelationId?: string; snapshot: GraphSnapshot }): AgentRunReceipt {
    if (input.purpose !== "CURRENT_FOCUS_MAINTENANCE" && input.purpose !== "ENGAGEMENT_RECONCILIATION" && input.purpose !== "MINI_PROJECT_GOVERNANCE") throw new KernelError("AGENT_RUN_PURPOSE_INVALID", "External AgentRun purpose is unsupported.");
    const requestedCorrelationId = input.purpose === "MINI_PROJECT_GOVERNANCE" ? input.governanceCorrelationId?.trim() || deterministicIdentityUuid(`governance:${input.workObjectId}:${input.runId}`) : undefined;
    const existing = this.#store.getAgentRun(input.runId);
    if (existing) {
      if (existing.executor.type === "EXTERNAL_CLI" && existing.executor.id === input.executorId.trim() && existing.purpose === input.purpose && existing.subject.workObjectId === input.workObjectId && stableHash(existing.context.evidenceIds) === stableHash(input.evidenceIds) && existing.context.governanceCorrelationId === requestedCorrelationId) return existing;
      throw new KernelError("AGENT_RUN_ALREADY_EXISTS", "AgentRun id is already bound to another cognition contract.");
    }
    if (!input.executorId.trim()) throw new KernelError("EXECUTOR_ID_REQUIRED", "External executor id is required.");
    const object = this.#store.getWorkObject(input.workObjectId); const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Agent target or PrimaryAnchor does not exist.");
    if (object.lifecycle !== "OPEN") throw new KernelError("AGENT_TARGET_OUT_OF_SCOPE", "Only OPEN WorkObjects may be governed.");
    if (input.purpose === "MINI_PROJECT_GOVERNANCE" && object.kind !== "MINI_PROJECT") throw new KernelError("MINI_PROJECT_REQUIRED", "MiniProject governance requires a formal MINI_PROJECT target.");
    if (this.#store.hasPendingRecoveryForTarget(object.id)) throw new KernelError("TARGET_RECOVERY_PENDING", "Target has incomplete recovery.");
    const projection = projectionFor(object, anchor, closureProjection(this.#store.getClosureHistory(object.id).current));
    if (input.snapshot.graphId !== anchor.graphId || input.snapshot.sourceBlockUuid !== anchor.externalId || input.snapshot.projection?.projectionHash !== projection.projectionHash) throw new KernelError("TARGET_PROJECTION_STALE", "Target projection is not current.");
    const evidence = input.evidenceIds.map((id) => this.#store.getEvidence(id));
    if (!evidence.length || evidence.some((item) => !item || item.workObjectId !== object.id)) throw new KernelError("EVIDENCE_INVALID", "External AgentRun requires frozen Evidence for the exact target.");
    const skill = input.purpose === "CURRENT_FOCUS_MAINTENANCE" ? this.#skill : input.purpose === "ENGAGEMENT_RECONCILIATION" ? this.#engagementSkill : this.#miniProjectSkill;
    if (!skill || (input.purpose === "CURRENT_FOCUS_MAINTENANCE" ? !approvedCurrentFocusSkill(skill) : input.purpose === "ENGAGEMENT_RECONCILIATION" ? !approvedEngagementSkill(skill) : !approvedMiniProjectSkill(skill))) throw new KernelError("SKILL_NOT_APPROVED", "AgentRun purpose has no approved Skill.");
    if (input.purpose === "MINI_PROJECT_GOVERNANCE" && (!this.#miniProjectTaste || !approvedMiniProjectTaste(this.#miniProjectTaste))) throw new KernelError("TASTE_PROFILE_UNTRUSTED", "MiniProject governance requires the explicitly active Taste profile.");
    const at = this.#now(); this.#store.registerSkill(skill, skill, at);
    const run: AgentRunReceipt = {
      id: input.runId, purpose: input.purpose, executor: { type: "EXTERNAL_CLI", id: input.executorId.trim() }, state: "STARTED",
      operationContractVersion: OPERATION_CONTRACT_VERSION, skill: { id: skill.id, version: skill.version, contentHash: skill.contentHash }, subject: { workObjectId: object.id },
      context: { targetVersion: object.version, targetProjectionHash: projection.projectionHash, evidenceIds: input.evidenceIds, ...(input.purpose === "ENGAGEMENT_RECONCILIATION" ? { currentEngagement: object.engagement, waitingCondition: object.waitingCondition } : {}), ...(input.purpose === "MINI_PROJECT_GOVERNANCE" ? { governanceCorrelationId: requestedCorrelationId!, taste: { id: this.#miniProjectTaste!.id, version: this.#miniProjectTaste!.version, contentHash: this.#miniProjectTaste!.contentHash } } : {}) },
      result: { outcome: "PENDING", proposalIds: [] }, reasonCode: "PENDING_EXTERNAL_RESULT", rationaleSummary: "External cognition is in progress.", submissionHash: null, startedAt: at, finishedAt: null,
    };
    this.#store.putAgentRun(run); return run;
  }

  finishExternalAgentRun(input: { runId: string; result: unknown }): { run: AgentRunReceipt; proposal: Proposal | null; revision: ProposalRevision | null } {
    const started = this.#store.getAgentRun(input.runId);
    if (!started || started.executor.type !== "EXTERNAL_CLI") throw new KernelError("EXTERNAL_AGENT_RUN_NOT_FOUND", "External AgentRun does not exist.");
    const submissionHash = stableHash(input.result);
    if (started.state === "FINISHED") {
      if (started.submissionHash !== submissionHash) throw new KernelError("AGENT_RUN_ALREADY_FINISHED", "AgentRun was already finished with another result.");
      const proposalId = started.result.proposalIds[0]; const stored = proposalId ? this.#store.getProposal(proposalId) : null;
      return { run: started, proposal: stored?.proposal ?? null, revision: stored?.revision ?? null };
    }
    const object = this.#store.getWorkObject(started.subject.workObjectId);
    if (!object) throw new KernelError("WORK_OBJECT_NOT_FOUND", "AgentRun target no longer exists.");
    let parsed: AgentCurrentFocusResult | AgentEngagementResult | MiniProjectAgentResult;
    try { parsed = started.purpose === "CURRENT_FOCUS_MAINTENANCE" ? parseAgentCurrentFocusResult(input.result) : started.purpose === "ENGAGEMENT_RECONCILIATION" ? parseAgentEngagementResult(input.result) : parseMiniProjectAgentResult(input.result); }
    catch (error) {
      const failed: AgentRunReceipt = { ...started, state: "FINISHED", result: { outcome: "FAILED", proposalIds: [] }, reasonCode: "AGENT_RESULT_INVALID", rationaleSummary: error instanceof Error ? error.message.slice(0, 200) : "Invalid result.", submissionHash, finishedAt: this.#now() };
      this.#store.finishAgentRunResult(failed, null, null); throw new KernelError("AGENT_RESULT_INVALID", "External Agent returned output outside the approved purpose contract.");
    }
    const now = this.#now(); let proposal: Proposal | null = null; let revision: ProposalRevision | null = null;
    if (parsed.outcome === "PROPOSAL") {
      if (object.version !== started.context.targetVersion) {
        const failed: AgentRunReceipt = { ...started, state: "FINISHED", result: { outcome: "FAILED", proposalIds: [] }, reasonCode: "AGENT_RUN_TARGET_STALE", rationaleSummary: "Target version changed after AgentRun start.", submissionHash, finishedAt: now };
        this.#store.finishAgentRunResult(failed, null, null); throw new KernelError("AGENT_RUN_TARGET_STALE", "Target version changed after AgentRun start.");
      }
      const evidence = started.context.evidenceIds.map((id) => this.#store.getEvidence(id));
      if (evidence.some((item) => !item)) throw new KernelError("EVIDENCE_INVALID", "AgentRun Evidence is missing.");
      const dependencies = (evidence as FrozenEvidence[]).map((item) => ({ evidenceId: item.id, contentHash: item.contentHash }));
      const proposalId = deterministicUuid(`proposal:${started.id}`);
      if (started.purpose === "CURRENT_FOCUS_MAINTENANCE") {
        const focus = parsed as AgentCurrentFocusResult;
        revision = { proposalId, revision: 1, operationType: "SET_CURRENT_FOCUS", operationContractVersion: OPERATION_CONTRACT_VERSION, currentFocus: focus.currentFocus?.trim() || null, expectedVersion: started.context.targetVersion, expectedProjectionHash: started.context.targetProjectionHash!, evidenceDependencies: dependencies, skill: started.skill, agentRunId: started.id, risk: "LOW", createdAt: now };
        parseSemanticOperation({ operationId: `validate-${started.id}`, type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: started.executor.id }, target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash }, input: { currentFocus: revision.currentFocus }, evidenceDependencies: dependencies });
      } else if (started.purpose === "ENGAGEMENT_RECONCILIATION") {
        const engagement = parsed as AgentEngagementResult; const transition = { ...engagement.transition!, waiting: engagement.transition!.waiting ? { ...engagement.transition!.waiting, evidenceIds: dependencies.map((item) => item.evidenceId) } : null };
        revision = { proposalId, revision: 1, operationType: "CHANGE_ENGAGEMENT", operationContractVersion: OPERATION_CONTRACT_VERSION, transition, expectedVersion: started.context.targetVersion, expectedProjectionHash: started.context.targetProjectionHash!, evidenceDependencies: dependencies, evidenceWatermark: this.#store.evidenceWatermark(object.id), skill: started.skill, agentRunId: started.id, risk: "LOW", createdAt: now };
        parseSemanticOperation({ operationId: `validate-${started.id}`, type: "CHANGE_ENGAGEMENT", actor: { type: "AGENT", id: started.executor.id }, target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash }, input: transition, evidenceDependencies: dependencies });
      } else {
        const governance = parsed as MiniProjectAgentResult;
        if (governance.outcome !== "PROPOSAL") throw new KernelError("AGENT_RESULT_INVALID", "MiniProject proposal result is missing its typed change.");
        if (governance.change.type === "SET_CURRENT_FOCUS") {
          if (!this.#skill || !approvedCurrentFocusSkill(this.#skill)) throw new KernelError("DELEGATED_SKILL_NOT_APPROVED", "MiniProject current-focus proposal requires the approved narrow Skill.");
          this.#store.registerSkill(this.#skill, this.#skill, now);
          revision = { proposalId, revision: 1, operationType: "SET_CURRENT_FOCUS", operationContractVersion: OPERATION_CONTRACT_VERSION, currentFocus: governance.change.currentFocus, expectedVersion: started.context.targetVersion, expectedProjectionHash: started.context.targetProjectionHash!, evidenceDependencies: dependencies, skill: { id: this.#skill.id, version: this.#skill.version, contentHash: this.#skill.contentHash }, agentRunId: started.id, governanceCorrelationId: started.context.governanceCorrelationId!, taste: started.context.taste!, risk: "LOW", createdAt: now };
          parseSemanticOperation({ operationId: `validate-${started.id}`, type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: started.executor.id }, target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash }, input: { currentFocus: revision.currentFocus }, evidenceDependencies: dependencies });
        } else {
          if (!this.#workIntentSkill || !approvedWorkIntentSkill(this.#workIntentSkill)) throw new KernelError("DELEGATED_SKILL_NOT_APPROVED", "MiniProject WorkIntent proposal requires the approved narrow Skill.");
          this.#store.registerSkill(this.#workIntentSkill, this.#workIntentSkill, now);
          revision = { proposalId, revision: 1, operationType: "UPDATE_WORK_INTENT", operationContractVersion: OPERATION_CONTRACT_VERSION, desiredOutcome: governance.change.desiredOutcome, completionChecks: governance.change.completionChecks, expectedVersion: started.context.targetVersion, expectedProjectionHash: started.context.targetProjectionHash!, evidenceDependencies: dependencies, skill: { id: this.#workIntentSkill.id, version: this.#workIntentSkill.version, contentHash: this.#workIntentSkill.contentHash }, agentRunId: started.id, governanceCorrelationId: started.context.governanceCorrelationId!, taste: started.context.taste!, risk: "LOW", createdAt: now } satisfies WorkIntentProposalRevision;
          parseSemanticOperation({ operationId: `validate-${started.id}`, type: "UPDATE_WORK_INTENT", actor: { type: "AGENT", id: started.executor.id }, target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash }, input: { desiredOutcome: revision.desiredOutcome, completionChecks: revision.completionChecks }, evidenceDependencies: dependencies });
        }
      }
      proposal = { id: proposalId, workObjectId: object.id, status: "OPEN", latestRevision: 1, appliedCommitId: null, invalidationReason: null, createdAt: now, updatedAt: now };
    }
    const finished: AgentRunReceipt = { ...started, state: "FINISHED", result: { outcome: parsed.outcome === "BOUNDARY_REVIEW" ? "BOUNDARY_REVIEW" : parsed.outcome, proposalIds: proposal ? [proposal.id] : [] }, reasonCode: parsed.reasonCode, rationaleSummary: parsed.rationaleSummary.slice(0, 500), submissionHash, finishedAt: now };
    this.#store.finishAgentRunResult(finished, proposal, revision); return { run: finished, proposal, revision };
  }

  reviseProposal(input: { proposalId: string; actor: Actor; currentFocus: string | null }): { proposal: Proposal; revision: ProposalRevision } {
    this.#authorize(input.actor);
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for revision.");
    if (stored.revision.operationType !== "SET_CURRENT_FOCUS") throw new KernelError("PROPOSAL_OPERATION_INVALID", "Only current-focus Proposals use this revision interface.");
    const parsed = parseSemanticOperation({ operationId: `revise-${input.proposalId}-${stored.revision.revision + 1}`, type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: this.#agent?.id ?? "configured-agent" }, target: { workObjectId: stored.proposal.workObjectId, expectedVersion: stored.revision.expectedVersion, expectedProjectionHash: stored.revision.expectedProjectionHash }, input: { currentFocus: input.currentFocus }, evidenceDependencies: stored.revision.evidenceDependencies });
    if (parsed.type !== "SET_CURRENT_FOCUS") throw new KernelError("PROPOSAL_OPERATION_INVALID", "Proposal revision operation is invalid.");
    const revision: ProposalRevision = { ...stored.revision, revision: stored.revision.revision + 1, currentFocus: parsed.input.currentFocus, createdAt: this.#now() };
    const at = this.#now();
    this.#store.appendProposalRevisionWithFeedback(revision, { id: deterministicUuid(`feedback:modified:${revision.proposalId}:${revision.revision}`), type: "MODIFIED", proposalId: revision.proposalId, agentRunId: revision.agentRunId, proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId: null, before: stored.revision.currentFocus, after: revision.currentFocus, signalStrength: "CORRECTIVE", governanceCorrelationId: revision.governanceCorrelationId ?? null, createdAt: at }, at);
    return this.#store.getProposal(input.proposalId)!;
  }

  dismissProposal(input: { proposalId: string; actor: Actor }): Proposal {
    this.#authorize(input.actor);
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for dismissal.");
    const at = this.#now();
    this.#store.transaction(() => {
      this.#store.transitionProposal(input.proposalId, "DISMISSED", at);
      this.#store.putFeedback({ id: deterministicUuid(`feedback:rejected:${input.proposalId}`), type: "REJECTED", proposalId: input.proposalId, agentRunId: stored.revision.agentRunId, proposalRevision: stored.revision.revision, skill: stored.revision.skill, operationType: stored.revision.operationType, commitId: null, before: proposalValue(stored.revision), after: null, signalStrength: "CORRECTIVE", governanceCorrelationId: "governanceCorrelationId" in stored.revision ? stored.revision.governanceCorrelationId ?? null : null, createdAt: at });
    });
    return this.#store.getProposal(input.proposalId)!.proposal;
  }

  recordStrongPositive(input: { commitId: string; actor: Actor; userComment?: string | null }): void {
    this.#authorize(input.actor);
    const commit = this.#store.getCommit(input.commitId);
    if (!commit || commit.status !== "COMMITTED" || !commit.governance) throw new KernelError("GOVERNED_COMMIT_REQUIRED", "Strong positive feedback requires a committed governed change.");
    const revision = this.#store.getProposal(commit.governance.proposalId)?.revision;
    if (!revision) throw new KernelError("PROPOSAL_NOT_FOUND", "Governed Proposal is missing.");
    const userComment = input.userComment?.trim() || null; if (userComment && userComment.length > 500) throw new KernelError("FEEDBACK_COMMENT_TOO_LONG", "Feedback comment exceeds 500 characters.");
    this.#store.putFeedback({ id: deterministicUuid(`feedback:strong-positive:${commit.id}`), type: "ACCEPTED", proposalId: revision.proposalId, agentRunId: revision.agentRunId, proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId: commit.id, before: objectValue(commit.before as WorkObject | null, revision.operationType), after: objectValue(commit.after as WorkObject | null, revision.operationType), signalStrength: "STRONG_POSITIVE", governanceCorrelationId: "governanceCorrelationId" in revision ? revision.governanceCorrelationId ?? null : null, userComment, createdAt: this.#now() });
  }

  applyProposal(input: { operationId: string; proposalId: string; snapshot: GraphSnapshot; evidence: ReadonlyArray<{ evidenceId: string } & TrustedGraphEvidenceMaterial> }): { commit: StoredCommit; graphEffect: GraphEffect } {
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for application.");
    const { proposal, revision } = stored;
    if (revision.operationType !== "SET_CURRENT_FOCUS") throw new KernelError("PROPOSAL_OPERATION_INVALID", "This apply path requires a current-focus Proposal.");
    const invalidate = (code: string, message: string): never => {
      this.#store.transitionProposal(proposal.id, "INVALIDATED", this.#now(), { invalidationReason: code });
      throw new KernelError(code, message);
    };
    const object = this.#store.getWorkObject(proposal.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor || object.version !== revision.expectedVersion) return invalidate("PROPOSAL_TARGET_STALE", "Target version changed before apply.");
    const agentRun = this.#store.getAgentRun(revision.agentRunId);
    if (!agentRun || agentRun.result.outcome !== "PROPOSAL") return invalidate("PROPOSAL_AGENT_RUN_UNTRUSTED", "Proposal AgentRun is missing or not a proposal result.");
    if (revision.operationContractVersion !== OPERATION_CONTRACT_VERSION) return invalidate("PROPOSAL_CONTRACT_VERSION_UNTRUSTED", "Proposal uses a different semantic operation contract version.");
    if (this.#store.hasPendingRecoveryForTarget(object.id)) return invalidate("TARGET_RECOVERY_PENDING", "Target has an incomplete Commit requiring recovery.");
    const focusSkillTrusted = agentRun.purpose === "CURRENT_FOCUS_MAINTENANCE"
      ? Boolean(this.#skill && approvedCurrentFocusSkill(this.#skill) && revision.skill.contentHash === this.#skill.contentHash)
      : agentRun.purpose === "MINI_PROJECT_GOVERNANCE"
        ? Boolean(this.#miniProjectSkill && approvedMiniProjectSkill(this.#miniProjectSkill) && agentRun.skill.contentHash === this.#miniProjectSkill.contentHash && this.#skill && approvedCurrentFocusSkill(this.#skill) && revision.skill.contentHash === this.#skill.contentHash && revision.taste && this.#miniProjectTaste && approvedMiniProjectTaste(this.#miniProjectTaste) && revision.taste.contentHash === this.#miniProjectTaste.contentHash)
        : false;
    if (!this.#store.skillRegistered(revision.skill) || !focusSkillTrusted) return invalidate("SKILL_VERSION_UNTRUSTED", "Proposal Skill identity is not the registered approved package.");
    if (input.snapshot.graphId !== anchor.graphId || input.snapshot.sourceBlockUuid !== anchor.externalId || input.snapshot.projection?.projectionHash !== revision.expectedProjectionHash) return invalidate("PROPOSAL_PROJECTION_STALE", "Managed projection changed before apply.");
    for (const dependency of revision.evidenceDependencies) {
      const frozen = this.#store.getEvidence(dependency.evidenceId);
      const fresh = input.evidence.find((item) => item.evidenceId === dependency.evidenceId);
      let freshHash: string | null = null;
      try { if (fresh) freshHash = createHash("sha256").update(this.#verifyGraphEvidence(fresh)).digest("hex"); } catch { return invalidate("PROPOSAL_EVIDENCE_STALE", "Fresh Evidence could not be verified through the trusted Graph Adapter."); }
      if (!frozen || !fresh || fresh.graphId !== frozen.graphId || fresh.blockUuid !== frozen.externalId || dependency.contentHash !== frozen.contentHash || freshHash !== frozen.contentHash) return invalidate("PROPOSAL_EVIDENCE_STALE", "Frozen Evidence changed before apply.");
    }
    const operation = parseSemanticOperation({
      operationId: input.operationId, type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: agentRun.executor.id },
      target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash },
      input: { currentFocus: revision.currentFocus }, evidenceDependencies: revision.evidenceDependencies,
    });
    return this.#prepare(operation, input.snapshot, { proposalId: proposal.id, revision: revision.revision, agentRunId: revision.agentRunId, skill: revision.skill });
  }

  applyWorkIntentProposal(input: { operationId: string; proposalId: string; snapshot: GraphSnapshot; evidence: ReadonlyArray<{ evidenceId: string } & TrustedGraphEvidenceMaterial> }): { commit: StoredCommit; graphEffect: GraphEffect } {
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for application.");
    const { proposal, revision } = stored;
    if (revision.operationType !== "UPDATE_WORK_INTENT") throw new KernelError("PROPOSAL_OPERATION_INVALID", "This apply path requires a WorkIntent Proposal.");
    const invalidate = (code: string, message: string): never => { this.#store.transitionProposal(proposal.id, "INVALIDATED", this.#now(), { invalidationReason: code }); throw new KernelError(code, message); };
    const object = this.#store.getWorkObject(proposal.workObjectId); const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor || object.kind !== "MINI_PROJECT" || object.version !== revision.expectedVersion) return invalidate("PROPOSAL_TARGET_STALE", "MiniProject target changed before apply.");
    const agentRun = this.#store.getAgentRun(revision.agentRunId);
    if (!agentRun || agentRun.purpose !== "MINI_PROJECT_GOVERNANCE" || agentRun.result.outcome !== "PROPOSAL") return invalidate("PROPOSAL_AGENT_RUN_UNTRUSTED", "WorkIntent Proposal lacks a trusted governance run.");
    if (revision.operationContractVersion !== OPERATION_CONTRACT_VERSION || this.#store.hasPendingRecoveryForTarget(object.id)) return invalidate("PROPOSAL_TARGET_STALE", "WorkIntent target contract or recovery state changed.");
    if (!this.#store.skillRegistered(revision.skill) || !this.#miniProjectSkill || !approvedMiniProjectSkill(this.#miniProjectSkill) || agentRun.skill.contentHash !== this.#miniProjectSkill.contentHash || !this.#workIntentSkill || !approvedWorkIntentSkill(this.#workIntentSkill) || revision.skill.contentHash !== this.#workIntentSkill.contentHash || !this.#miniProjectTaste || !approvedMiniProjectTaste(this.#miniProjectTaste) || revision.taste.contentHash !== this.#miniProjectTaste.contentHash) return invalidate("GOVERNANCE_PROFILE_UNTRUSTED", "Composite governance, narrow mutation Skill, or Taste identity is not approved.");
    if (input.snapshot.graphId !== anchor.graphId || input.snapshot.sourceBlockUuid !== anchor.externalId || input.snapshot.projection?.projectionHash !== revision.expectedProjectionHash) return invalidate("PROPOSAL_PROJECTION_STALE", "Managed projection changed before WorkIntent apply.");
    for (const dependency of revision.evidenceDependencies) {
      const frozen = this.#store.getEvidence(dependency.evidenceId); const fresh = input.evidence.find((item) => item.evidenceId === dependency.evidenceId); let freshHash: string | null = null;
      try { if (fresh) freshHash = createHash("sha256").update(this.#verifyGraphEvidence(fresh)).digest("hex"); } catch { return invalidate("PROPOSAL_EVIDENCE_STALE", "Fresh Evidence verification failed."); }
      if (!frozen || !fresh || fresh.graphId !== frozen.graphId || fresh.blockUuid !== frozen.externalId || dependency.contentHash !== frozen.contentHash || freshHash !== frozen.contentHash) return invalidate("PROPOSAL_EVIDENCE_STALE", "Frozen Evidence changed before WorkIntent apply.");
    }
    const operation = parseSemanticOperation({ operationId: input.operationId, type: "UPDATE_WORK_INTENT", actor: { type: "AGENT", id: agentRun.executor.id }, target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash }, input: { desiredOutcome: revision.desiredOutcome, completionChecks: revision.completionChecks }, evidenceDependencies: revision.evidenceDependencies });
    return this.#prepare(operation, input.snapshot, { proposalId: proposal.id, revision: revision.revision, agentRunId: revision.agentRunId, skill: revision.skill });
  }

  applyEngagementProposal(input: { operationId: string; proposalId: string; snapshot: GraphSnapshot; evidence: ReadonlyArray<{ evidenceId: string } & TrustedGraphEvidenceMaterial> }): { commit: StoredCommit; graphEffect: GraphEffect } {
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for application.");
    const { proposal, revision } = stored;
    if (revision.operationType !== "CHANGE_ENGAGEMENT") throw new KernelError("PROPOSAL_OPERATION_INVALID", "This apply path requires an Engagement Proposal.");
    const invalidate = (code: string, message: string): never => { this.#store.transitionProposal(proposal.id, "INVALIDATED", this.#now(), { invalidationReason: code }); throw new KernelError(code, message); };
    const object = this.#store.getWorkObject(proposal.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor || object.version !== revision.expectedVersion || object.engagement !== revision.transition.from) return invalidate("PROPOSAL_TARGET_STALE", "Target state changed before apply.");
    const agentRun = this.#store.getAgentRun(revision.agentRunId);
    if (!agentRun || agentRun.result.outcome !== "PROPOSAL") return invalidate("PROPOSAL_AGENT_RUN_UNTRUSTED", "Proposal AgentRun is missing or not a proposal result.");
    if (this.#store.evidenceWatermark(object.id) !== revision.evidenceWatermark) return invalidate("PROPOSAL_CONTEXT_STALE", "New direct frozen Evidence appeared after this Engagement judgment.");
    if (revision.operationContractVersion !== OPERATION_CONTRACT_VERSION) return invalidate("PROPOSAL_CONTRACT_VERSION_UNTRUSTED", "Proposal uses another contract version.");
    if (this.#store.hasPendingRecoveryForTarget(object.id)) return invalidate("TARGET_RECOVERY_PENDING", "Target has incomplete recovery.");
    if (!this.#store.skillRegistered(revision.skill) || !this.#engagementSkill || !approvedEngagementSkill(this.#engagementSkill) || revision.skill.id !== this.#engagementSkill.id || revision.skill.version !== this.#engagementSkill.version || revision.skill.contentHash !== this.#engagementSkill.contentHash) return invalidate("SKILL_VERSION_UNTRUSTED", "Proposal Skill is not the registered approved package.");
    if (input.snapshot.graphId !== anchor.graphId || input.snapshot.sourceBlockUuid !== anchor.externalId || input.snapshot.projection?.projectionHash !== revision.expectedProjectionHash) return invalidate("PROPOSAL_PROJECTION_STALE", "Managed projection changed before apply.");
    for (const dependency of revision.evidenceDependencies) {
      const frozen = this.#store.getEvidence(dependency.evidenceId);
      const fresh = input.evidence.find((item) => item.evidenceId === dependency.evidenceId);
      let freshHash: string | null = null;
      try { if (fresh) freshHash = createHash("sha256").update(this.#verifyGraphEvidence(fresh)).digest("hex"); } catch { return invalidate("PROPOSAL_EVIDENCE_STALE", "Fresh Evidence verification failed."); }
      if (!frozen || !fresh || fresh.graphId !== frozen.graphId || fresh.blockUuid !== frozen.externalId || dependency.contentHash !== frozen.contentHash || freshHash !== frozen.contentHash) return invalidate("PROPOSAL_EVIDENCE_STALE", "Frozen Evidence changed before apply.");
    }
    const operation = parseSemanticOperation({ operationId: input.operationId, type: "CHANGE_ENGAGEMENT", actor: { type: "AGENT", id: agentRun.executor.id }, target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash }, input: revision.transition, evidenceDependencies: revision.evidenceDependencies });
    return this.#prepare(operation, input.snapshot, { proposalId: proposal.id, revision: revision.revision, agentRunId: revision.agentRunId, skill: revision.skill });
  }

  prepare(operation: SemanticOperation, snapshot: GraphSnapshot): { commit: StoredCommit; graphEffect: GraphEffect } {
    this.#authorize(operation.actor);
    return this.#prepare(operation, snapshot, null, "legacy");
  }

  /**
   * Formal-commit path (new transaction model): a legal Formal Commit is no longer
   * blocked by Graph Adapter availability. Existing-object operational semantics can
   * commit with snapshot=null; CREATE still requires a fresh source snapshot because
   * the primary anchor's source content hash is external reality. The returned
   * ProjectionObligation is durable and must be converged asynchronously.
   */
  commitFormal(operation: SemanticOperation, snapshot: GraphSnapshot | null): FormalCommitResult {
    this.#authorize(operation.actor);
    return this.#prepare(operation, snapshot, null, "formal") as FormalCommitResult;
  }

  #prepare(operation: SemanticOperation, snapshot: GraphSnapshot | null, governance: StoredCommit["governance"], mode: "legacy" | "formal" = "legacy"): { commit: StoredCommit; graphEffect: GraphEffect } | FormalCommitResult {
    if (operation.type === "UNDO_COMMIT") throw new KernelError("UNDO_ENTRYPOINT_REQUIRED", "Use prepareUndo for compensation commits.");
    const now = this.#now();
    const commitId = deterministicUuid(`commit:${operation.operationId}`);
    let object: WorkObject;
    let anchor: PrimaryAnchor;
    let graphEffect: GraphEffect;
    let before: WorkObject | null = null;
    let closureRecord: ClosureRecord | ReopenRecord | ClosureAmendment | null = null;
    let beforeClosure: ManagedProjection["closure"] = null;

    if (operation.type === "CREATE_WORK_OBJECT") {
      const workObjectId = deterministicUuid(`work:${operation.operationId}`);
      object = createWorkObject({ id: workObjectId, kind: operation.input.kind, title: operation.input.title, at: now });
      anchor = {
        id: deterministicUuid(`anchor:${operation.operationId}`), workObjectId, graphId: operation.input.anchor.graphId,
        externalId: operation.input.anchor.blockUuid, sourceContentHash: operation.input.anchor.sourceContentHash,
        projectionContainerUuid: deterministicUuid(`projection:${operation.operationId}`), projectionTitleUuid: deterministicUuid(`title:${operation.operationId}`),
        projectionStateUuid: deterministicUuid(`state:${operation.operationId}`), projectionFocusUuid: "", projectionWaitingUuid: "", projectionOutcomeUuid: "", projectionCompletionUuid: "", createdAt: now, updatedAt: now,
      };
      anchor = { ...anchor, projectionFocusUuid: deterministicIdentityUuid(`focus:${anchor.projectionContainerUuid}`), projectionWaitingUuid: deterministicIdentityUuid(`waiting:${anchor.projectionContainerUuid}`), projectionOutcomeUuid: deterministicIdentityUuid(`outcome:${anchor.projectionContainerUuid}`), projectionCompletionUuid: deterministicIdentityUuid(`completion:${anchor.projectionContainerUuid}`) };
      graphEffect = {
        type: "UPSERT_MANAGED_PROJECTION", commitId, effectId: deterministicUuid(`effect:${commitId}:0`),
        graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, projection: projectionFor(object, anchor),
      };
    } else if (operation.type === "RENAME_WORK_OBJECT") {
      before = this.#store.getWorkObject(operation.target.workObjectId);
      if (!before) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Rename target does not exist.");
      const storedAnchor = this.#store.getAnchorForWorkObject(before.id);
      if (!storedAnchor) throw new KernelError("WORK_OBJECT_ANCHOR_MISSING", "Rename target has no primary Graph anchor.");
      anchor = storedAnchor;
      beforeClosure = closureProjection(this.#store.getClosureHistory(before.id).current);
      object = renameWorkObject(before, { title: operation.input.title, expectedVersion: operation.target.expectedVersion, at: now });
      const projection = projectionFor(object, anchor);
      const expectedProjection = projectionFor(before, anchor, beforeClosure);
      graphEffect = {
        type: "UPDATE_MANAGED_FIELD", commitId, effectId: deterministicUuid(`effect:${commitId}:0`),
        graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, fieldUuid: anchor.projectionTitleUuid,
        content: object.title, expectedProjectionHash: operation.target.expectedProjectionHash,
        resultingProjectionHash: projection.projectionHash, expectedProjection, resultingProjection: projection,
      };
    } else if (operation.type === "SET_CURRENT_FOCUS") {
      const governedRun = governance ? this.#store.getAgentRun(governance.agentRunId) : null;
      if (!governance || operation.actor.type !== "AGENT" || !governedRun || governedRun.executor.id !== operation.actor.id || (governedRun.purpose !== "CURRENT_FOCUS_MAINTENANCE" && governedRun.purpose !== "MINI_PROJECT_GOVERNANCE")) throw new KernelError("AGENT_GOVERNANCE_REQUIRED", "Agent writes require a verified low-risk Proposal path.");
      before = this.#store.getWorkObject(operation.target.workObjectId);
      if (!before) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Current-focus target does not exist.");
      const storedAnchor = this.#store.getAnchorForWorkObject(before.id);
      if (!storedAnchor) throw new KernelError("WORK_OBJECT_ANCHOR_MISSING", "Current-focus target has no primary Graph anchor.");
      anchor = storedAnchor;
      object = setCurrentFocus(before, { currentFocus: operation.input.currentFocus, expectedVersion: operation.target.expectedVersion, at: now });
      const projection = projectionFor(object, anchor);
      const expectedProjection = projectionFor(before, anchor);
      graphEffect = {
        type: "SET_CURRENT_FOCUS_FIELD", commitId, effectId: deterministicUuid(`effect:${commitId}:0`), graphId: anchor.graphId,
        sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid, fieldUuid: anchor.projectionFocusUuid,
        content: object.currentFocus, expectedProjectionHash: operation.target.expectedProjectionHash, resultingProjectionHash: projection.projectionHash,
        expectedProjection, resultingProjection: projection,
      };
    } else if (operation.type === "UPDATE_WORK_INTENT") {
      const governedRun = governance ? this.#store.getAgentRun(governance.agentRunId) : null;
      if (!governance || operation.actor.type !== "AGENT" || !governedRun || governedRun.executor.id !== operation.actor.id || governedRun.purpose !== "MINI_PROJECT_GOVERNANCE") throw new KernelError("AGENT_GOVERNANCE_REQUIRED", "WorkIntent writes require a verified MiniProject governance Proposal.");
      for (const dependency of operation.evidenceDependencies) {
        const evidence = this.#store.getEvidence(dependency.evidenceId);
        if (!evidence || evidence.workObjectId !== operation.target.workObjectId || evidence.contentHash !== dependency.contentHash) throw new KernelError("EVIDENCE_INVALID", "WorkIntent changes require matching frozen Evidence.");
      }
      before = this.#store.getWorkObject(operation.target.workObjectId);
      if (!before) throw new KernelError("WORK_OBJECT_NOT_FOUND", "WorkIntent target does not exist.");
      const storedAnchor = this.#store.getAnchorForWorkObject(before.id);
      if (!storedAnchor) throw new KernelError("WORK_OBJECT_ANCHOR_MISSING", "WorkIntent target has no primary Graph anchor.");
      anchor = storedAnchor;
      object = updateWorkIntent(before, { ...operation.input, expectedVersion: operation.target.expectedVersion, at: now });
      const projection = projectionFor(object, anchor);
      const expectedProjection = projectionFor(before, anchor);
      graphEffect = { type: "UPDATE_WORK_INTENT_FIELDS", commitId, effectId: deterministicUuid(`effect:${commitId}:0`), graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid, outcomeUuid: anchor.projectionOutcomeUuid, completionUuid: anchor.projectionCompletionUuid, desiredOutcome: object.desiredOutcome, completionChecks: object.completionChecks, expectedProjectionHash: operation.target.expectedProjectionHash, resultingProjectionHash: projection.projectionHash, expectedProjection, resultingProjection: projection };
    } else if (operation.type === "CHANGE_ENGAGEMENT") {
      const governedRun = governance ? this.#store.getAgentRun(governance.agentRunId) : null;
      if (operation.actor.type === "AGENT" && (!governance || !governedRun || governedRun.executor.id !== operation.actor.id || governedRun.purpose !== "ENGAGEMENT_RECONCILIATION")) throw new KernelError("AGENT_GOVERNANCE_REQUIRED", "Agent Engagement writes require a verified low-risk Proposal path.");
      for (const dependency of operation.evidenceDependencies) {
        const evidence = this.#store.getEvidence(dependency.evidenceId);
        if (!evidence || evidence.workObjectId !== operation.target.workObjectId || evidence.contentHash !== dependency.contentHash) throw new KernelError("EVIDENCE_INVALID", "Engagement changes require matching frozen Evidence for the target.");
      }
      before = this.#store.getWorkObject(operation.target.workObjectId);
      if (!before) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Engagement target does not exist.");
      const storedAnchor = this.#store.getAnchorForWorkObject(before.id);
      if (!storedAnchor) throw new KernelError("WORK_OBJECT_ANCHOR_MISSING", "Engagement target has no primary Graph anchor.");
      anchor = storedAnchor;
      object = changeEngagement(before, { ...operation.input, expectedVersion: operation.target.expectedVersion, at: now });
      const projection = projectionFor(object, anchor);
      const expectedProjection = projectionFor(before, anchor);
      graphEffect = {
        type: "CHANGE_ENGAGEMENT_FIELDS", commitId, effectId: deterministicUuid(`effect:${commitId}:0`), graphId: anchor.graphId,
        sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid, stateUuid: anchor.projectionStateUuid,
        waitingUuid: anchor.projectionWaitingUuid, engagement: object.engagement as "ACTIONABLE" | "WAITING", waiting: object.waitingCondition,
        expectedProjectionHash: operation.target.expectedProjectionHash, resultingProjectionHash: projection.projectionHash,
        expectedProjection, resultingProjection: projection,
      };
    } else {
      if (governance || operation.actor.type !== "USER" || operation.actor.id !== this.#authorizedUserId) throw new KernelError("CLOSURE_USER_AUTHORITY_REQUIRED", "Task Closure operations require the configured local USER actor.");
      if (mode === "formal" && !snapshot) throw new KernelError("GRAPH_SNAPSHOT_REQUIRED", "Closure commits still require a fresh Graph snapshot for marker-aware projection.", null);
      const graphSnapshot = snapshot!;
      before = this.#store.getWorkObject(operation.target.workObjectId);
      if (!before) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Closure target does not exist.");
      if (this.#store.hasPendingRecoveryForTarget(before.id)) throw new KernelError("TARGET_RECOVERY_PENDING", "Closure target has an incomplete Commit requiring recovery.");
      const storedAnchor = this.#store.getAnchorForWorkObject(before.id);
      if (!storedAnchor) throw new KernelError("WORK_OBJECT_ANCHOR_MISSING", "Closure target has no primary Graph anchor.");
      anchor = storedAnchor;
      beforeClosure = closureProjection(this.#store.getClosureHistory(before.id).current);
      const authoritativeProjection = projectionFor(before, anchor, beforeClosure);
      if (operation.target.expectedProjectionHash !== authoritativeProjection.projectionHash || graphSnapshot.projection?.projectionHash !== authoritativeProjection.projectionHash) throw new KernelError("MANAGED_PROJECTION_HASH_MISMATCH", "Closure requires the exact Kernel-derived managed projection.");
      if (operation.type === "COMPLETE_WORK_OBJECT") {
        for (const id of operation.input.evidenceIds) { const evidence = this.#store.getEvidence(id); if (!evidence || evidence.workObjectId !== before.id) throw new KernelError("CLOSURE_EVIDENCE_INVALID", "Completion Evidence must belong to this Task."); }
        const completed = completeWorkObject(before, { recordId: deterministicUuid(`completion:${commitId}`), actor: operation.actor, outcomeSummary: operation.input.outcomeSummary, evidenceIds: operation.input.evidenceIds, expectedVersion: operation.target.expectedVersion, at: now }); object = completed.object; closureRecord = completed.record;
      } else if (operation.type === "CANCEL_WORK_OBJECT") {
        for (const id of operation.input.evidenceIds) { const evidence = this.#store.getEvidence(id); if (!evidence || evidence.workObjectId !== before.id) throw new KernelError("CLOSURE_EVIDENCE_INVALID", "Cancellation Evidence must belong to this Task."); }
        if (operation.input.replacementWorkObjectId) {
          if (operation.input.replacementWorkObjectId === before.id) throw new KernelError("CANCELLATION_REPLACEMENT_INVALID", "A cancelled Task cannot replace itself.");
          if (!this.#store.getWorkObject(operation.input.replacementWorkObjectId)) throw new KernelError("CANCELLATION_REPLACEMENT_NOT_FOUND", "Cancellation replacement WorkObject does not exist.");
        }
        const cancelled = cancelWorkObject(before, { recordId: deterministicUuid(`cancellation:${commitId}`), actor: operation.actor, ...operation.input, expectedVersion: operation.target.expectedVersion, at: now }); object = cancelled.object; closureRecord = cancelled.record;
      } else if (operation.type === "REOPEN_WORK_OBJECT") {
        const current = this.#store.getCurrentClosureRecord(before.id); if (!current) throw new KernelError("CURRENT_CLOSURE_NOT_FOUND", "Reopen requires the current effective Closure record.");
        const reopened = reopenWorkObject(before, { recordId: deterministicUuid(`reopen:${commitId}`), previousClosureRecordId: current.id, actor: operation.actor, reason: operation.input.reason, expectedVersion: operation.target.expectedVersion, at: now }); object = reopened.object; closureRecord = reopened.record;
      } else {
        const target = this.#store.getClosureRecord(operation.input.targetClosureRecordId); const current = this.#store.getCurrentClosureRecord(before.id);
        if (!target || !current || target.id !== current.id) throw new KernelError("CLOSURE_AMENDMENT_TARGET_INVALID", "Amendment must target the current effective Closure record.");
        for (const id of operation.input.addEvidenceIds) { const evidence = this.#store.getEvidence(id); if (!evidence || evidence.workObjectId !== before.id) throw new KernelError("CLOSURE_EVIDENCE_INVALID", "Closure Amendment Evidence must belong to this Task."); }
        closureRecord = amendClosure(target, { amendmentId: deterministicUuid(`amendment:${commitId}`), workObjectId: before.id, actor: operation.actor, reason: operation.input.reason, ...(operation.input.replacementOutcomeSummary ? { replacementOutcomeSummary: operation.input.replacementOutcomeSummary } : {}), ...(operation.input.replacementCancellationReason ? { replacementCancellationReason: operation.input.replacementCancellationReason } : {}), addEvidenceIds: operation.input.addEvidenceIds, at: now });
        object = advanceClosureAmendment(before, { expectedVersion: operation.target.expectedVersion, at: now });
      }
      const effective = operation.type === "REOPEN_WORK_OBJECT" ? null : operation.type === "AMEND_CLOSURE"
        ? (() => { const history = this.#store.getClosureHistory(before!.id); const record = history.current!.record; const amendments = [...history.current!.amendments, closureRecord as ClosureAmendment]; const ids = [...new Set([...record.evidenceIds, ...amendments.flatMap((item) => item.addEvidenceIds)])]; return "completedAt" in record ? { type: "COMPLETED" as const, record, amendments, outcomeSummary: amendments.reduce((value, item) => item.replacementOutcomeSummary ?? value, record.outcomeSummary), evidenceIds: ids } : { type: "CANCELLED" as const, record, amendments, reason: amendments.reduce((value, item) => item.replacementCancellationReason ?? value, record.reason), evidenceIds: ids }; })()
        : operation.type === "COMPLETE_WORK_OBJECT" ? { type: "COMPLETED" as const, record: closureRecord as Extract<ClosureRecord, { completedAt: string }>, amendments: [], outcomeSummary: (closureRecord as Extract<ClosureRecord, { completedAt: string }>).outcomeSummary, evidenceIds: (closureRecord as Extract<ClosureRecord, { completedAt: string }>).evidenceIds }
        : { type: "CANCELLED" as const, record: closureRecord as Extract<ClosureRecord, { cancelledAt: string }>, amendments: [], reason: (closureRecord as Extract<ClosureRecord, { cancelledAt: string }>).reason, evidenceIds: (closureRecord as Extract<ClosureRecord, { cancelledAt: string }>).evidenceIds };
      const managedClosure = closureProjection(effective) ?? null;
      const projection = projectionFor(object, anchor, managedClosure);
      const explicitCompletion = operation.type === "COMPLETE_WORK_OBJECT";
      const markerAlreadyDone = graphSnapshot.sourceMarker === "DONE";
      graphEffect = { type: "CHANGE_CLOSURE_FIELDS", commitId, effectId: deterministicUuid(`effect:${commitId}:0`), graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid, stateUuid: anchor.projectionStateUuid, focusUuid: anchor.projectionFocusUuid, expectedSourceMarker: graphSnapshot.sourceMarker ?? null, resultingSourceMarker: explicitCompletion && (graphSnapshot.sourceMarker === "TODO" || graphSnapshot.sourceMarker === "DONE") ? "DONE" : operation.type === "REOPEN_WORK_OBJECT" && graphSnapshot.sourceMarker === "DONE" ? "TODO" : graphSnapshot.sourceMarker ?? null, expectedProjection: graphSnapshot.projection!, lifecycle: object.lifecycle, engagement: object.engagement, waitingCondition: object.waitingCondition, currentFocus: object.currentFocus, closure: managedClosure, expectedProjectionHash: operation.target.expectedProjectionHash, resultingProjectionHash: projection.projectionHash, resultingProjection: projection };
      if (operation.type === "COMPLETE_WORK_OBJECT" && graphSnapshot.sourceMarker !== "TODO" && !markerAlreadyDone && graphSnapshot.sourceMarker !== null) throw new KernelError("COMPLETION_MARKER_UNSUPPORTED", "Completion supports TODO, already-observed DONE, or markerless Task anchors.");
    }

    const commit: StoredCommit = {
      id: commitId, status: "PREPARED", actor: operation.actor, operationType: operation.type, targetId: object.id,
      operation, preconditions: operation.preconditions, before, after: object,
      inverse: before ? operation.type === "SET_CURRENT_FOCUS" ? { type: "SET_CURRENT_FOCUS", currentFocus: before.currentFocus, version: before.version } : operation.type === "UPDATE_WORK_INTENT" ? { type: "UPDATE_WORK_INTENT", desiredOutcome: before.desiredOutcome, completionChecks: before.completionChecks, version: before.version } : operation.type === "CHANGE_ENGAGEMENT" ? { type: "CHANGE_ENGAGEMENT", engagement: before.engagement, waitingCondition: before.waitingCondition, version: before.version } : operation.type === "RENAME_WORK_OBJECT" ? { type: "RENAME_WORK_OBJECT", title: before.title, version: before.version } : { type: "RESTORE_WORK_OBJECT", object: before, closure: beforeClosure, version: before.version } : { type: "UNDO_COMMIT", targetId: object.id },
      graphEffect, graphResult: null, failureReason: null, compensationFor: null, compensatedBy: null, createdAt: now, updatedAt: now,
      governance,
    };
    this.#store.insertCommit(commit);
    this.#afterStage("PREPARED", commitId);

    if (mode === "formal") {
      if (operation.type === "CREATE_WORK_OBJECT") {
        if (!snapshot) {
          this.#store.transitionCommit(commitId, "ABORTED", { updatedAt: now, failureReason: "GRAPH_SNAPSHOT_REQUIRED" });
          throw new KernelError("GRAPH_SNAPSHOT_REQUIRED", "Formal CREATE still requires a fresh source snapshot to bind the primary anchor.", commitId);
        }
        if (snapshot.graphId !== anchor.graphId || snapshot.sourceBlockUuid !== anchor.externalId || snapshot.sourceContentHash !== anchor.sourceContentHash || snapshot.projection !== null) {
          this.#store.transitionCommit(commitId, "ABORTED", { updatedAt: now, failureReason: "SOURCE_CONTENT_HASH_MISMATCH" });
          throw new KernelError("SOURCE_CONTENT_HASH_MISMATCH", "Graph precondition does not match the operation's expected source anchor.", commitId);
        }
      } else if (snapshot && (snapshot.graphId !== anchor.graphId || snapshot.sourceBlockUuid !== anchor.externalId || snapshot.projection?.projectionHash !== operation.target.expectedProjectionHash)) {
        this.#store.transitionCommit(commitId, "ABORTED", { updatedAt: now, failureReason: "STALE_GRAPH_SNAPSHOT" });
        throw new KernelError("STALE_GRAPH_SNAPSHOT", "A supplied Graph snapshot no longer matches the expected Kernel projection; resubmit with fresh or omitted snapshot.", commitId);
      }

      this.#store.transaction(() => {
        this.#store.putWorkObject(object);
        if (operation.type === "CREATE_WORK_OBJECT") this.#store.putAnchor(anchor);
        if (operation.type === "COMPLETE_WORK_OBJECT") this.#store.putCompletionRecord(closureRecord as Extract<ClosureRecord, { completedAt: string }>, commitId);
        if (operation.type === "CANCEL_WORK_OBJECT") this.#store.putCancellationRecord(closureRecord as Extract<ClosureRecord, { cancelledAt: string }>, commitId);
        if (operation.type === "REOPEN_WORK_OBJECT") this.#store.putReopenRecord(closureRecord as ReopenRecord, commitId);
        if (operation.type === "AMEND_CLOSURE") this.#store.putClosureAmendment(closureRecord as ClosureAmendment, commitId);
        this.#store.transitionCommit(commitId, "COMMITTED", { updatedAt: now });
        const obligation: ProjectionObligation = {
          id: deterministicUuid(`projection:${commitId}`), commitId, workObjectId: object.id, formalVersion: object.version,
          targetAnchorId: anchor.id, desiredProjectionHash: resultingProjectionHash(graphEffect), status: "PENDING", attempt: 0,
          lastAttemptAt: null, nextAttemptAt: null, retryExhausted: false, lastError: null,
          createdAt: now, updatedAt: now,
        };
        this.#store.putProjectionObligation(obligation);
      });
      this.#afterStage("COMMITTED", commitId);
      return { commit: this.#store.getCommit(commitId)!, graphEffect, projectionObligation: this.#store.getProjectionObligationForCommit(commitId)! };
    }

    const mismatch = snapshot!.graphId !== anchor.graphId || snapshot!.sourceBlockUuid !== anchor.externalId ||
      (operation.type === "CREATE_WORK_OBJECT" ? snapshot!.sourceContentHash !== anchor.sourceContentHash || snapshot!.projection !== null : snapshot!.projection?.projectionHash !== operation.target.expectedProjectionHash);
    if (mismatch) {
      const code = operation.type === "CREATE_WORK_OBJECT" ? "SOURCE_CONTENT_HASH_MISMATCH" : "MANAGED_PROJECTION_HASH_MISMATCH";
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: now, failureReason: code });
      throw new KernelError(code, "Graph precondition does not match the operation's expected state.", commitId);
    }

    this.#store.transaction(() => {
      this.#store.putWorkObject(object);
      if (operation.type === "CREATE_WORK_OBJECT") this.#store.putAnchor(anchor);
      if (operation.type === "COMPLETE_WORK_OBJECT") this.#store.putCompletionRecord(closureRecord as Extract<ClosureRecord, { completedAt: string }>, commitId);
      if (operation.type === "CANCEL_WORK_OBJECT") this.#store.putCancellationRecord(closureRecord as Extract<ClosureRecord, { cancelledAt: string }>, commitId);
      if (operation.type === "REOPEN_WORK_OBJECT") this.#store.putReopenRecord(closureRecord as ReopenRecord, commitId);
      if (operation.type === "AMEND_CLOSURE") this.#store.putClosureAmendment(closureRecord as ClosureAmendment, commitId);
      this.#store.transitionCommit(commitId, "KERNEL_APPLIED", { updatedAt: now });
    });
    this.#afterStage("KERNEL_APPLIED", commitId);
    return { commit: this.#store.getCommit(commitId)!, graphEffect };
  }

  prepareUndo(input: { operationId: string; actor: Actor; commitId: string }, snapshot: GraphSnapshot): { commit: StoredCommit; graphEffect: GraphEffect } {
    this.#authorize(input.actor);
    const original = this.#store.getCommit(input.commitId);
    if (!original || original.status !== "COMMITTED" || original.compensatedBy) throw new KernelError("UNDO_TARGET_INVALID", "Commit is not currently undoable.");
    if (original.operationType !== "CREATE_WORK_OBJECT" && original.operationType !== "RENAME_WORK_OBJECT" && original.operationType !== "SET_CURRENT_FOCUS" && original.operationType !== "UPDATE_WORK_INTENT" && original.operationType !== "CHANGE_ENGAGEMENT" && original.operationType !== "COMPLETE_WORK_OBJECT" && original.operationType !== "CANCEL_WORK_OBJECT" && original.operationType !== "REOPEN_WORK_OBJECT" && original.operationType !== "AMEND_CLOSURE") throw new KernelError("UNDO_OPERATION_UNSUPPORTED", "Only supported semantic commits are undoable.");
    const object = this.#store.getWorkObject(original.targetId!);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("UNDO_TARGET_MISSING", "Current state for the commit is missing.");
    const originalAfter = original.after as WorkObject | null;
    if (!originalAfter || canonicalWorkObject(object) !== canonicalWorkObject(originalAfter)) {
      throw new KernelError("UNDO_TARGET_CHANGED", "The commit is no longer the latest semantic change for this WorkObject.");
    }
    const expectedProjection = projectionFor(object, anchor, closureProjection(this.#store.getClosureHistory(object.id).current));
    const now = this.#now();
    const commitId = deterministicUuid(`commit:${input.operationId}`);
    const effectId = deterministicUuid(`effect:${commitId}:0`);
    const previous = original.before as WorkObject | null;
    const restored = previous
      ? original.operationType === "RENAME_WORK_OBJECT"
        ? renameWorkObject(object, { title: previous.title, expectedVersion: object.version, at: now })
        : original.operationType === "SET_CURRENT_FOCUS"
          ? setCurrentFocus(object, { currentFocus: previous.currentFocus, expectedVersion: object.version, at: now })
          : original.operationType === "UPDATE_WORK_INTENT"
            ? updateWorkIntent(object, { desiredOutcome: previous.desiredOutcome, completionChecks: previous.completionChecks, expectedVersion: object.version, at: now })
          : original.operationType === "CHANGE_ENGAGEMENT"
            ? restoreEngagement(object, { engagement: previous.engagement as "ACTIONABLE" | "WAITING", waitingCondition: previous.waitingCondition, expectedVersion: object.version, at: now })
            : restoreWorkObject(object, { previous, expectedVersion: object.version, at: now })
      : null;
    const effect: GraphEffect = restored
      ? original.operationType === "SET_CURRENT_FOCUS" ? {
        type: "SET_CURRENT_FOCUS_FIELD", commitId, effectId, graphId: anchor.graphId, sourceBlockUuid: anchor.externalId,
        containerUuid: anchor.projectionContainerUuid, fieldUuid: anchor.projectionFocusUuid, content: restored.currentFocus,
        expectedProjectionHash: expectedProjection.projectionHash, resultingProjectionHash: projectionFor(restored, anchor).projectionHash,
        expectedProjection, resultingProjection: projectionFor(restored, anchor),
      } : original.operationType === "UPDATE_WORK_INTENT" ? {
        type: "UPDATE_WORK_INTENT_FIELDS", commitId, effectId, graphId: anchor.graphId, sourceBlockUuid: anchor.externalId,
        containerUuid: anchor.projectionContainerUuid, outcomeUuid: anchor.projectionOutcomeUuid, completionUuid: anchor.projectionCompletionUuid,
        desiredOutcome: restored.desiredOutcome, completionChecks: restored.completionChecks,
        expectedProjectionHash: expectedProjection.projectionHash, resultingProjectionHash: projectionFor(restored, anchor).projectionHash,
        expectedProjection, resultingProjection: projectionFor(restored, anchor),
      } : original.operationType === "CHANGE_ENGAGEMENT" ? {
        type: "CHANGE_ENGAGEMENT_FIELDS", commitId, effectId, graphId: anchor.graphId, sourceBlockUuid: anchor.externalId,
        containerUuid: anchor.projectionContainerUuid, stateUuid: anchor.projectionStateUuid, waitingUuid: anchor.projectionWaitingUuid,
        engagement: restored.engagement as "ACTIONABLE" | "WAITING", waiting: restored.waitingCondition,
        expectedProjectionHash: expectedProjection.projectionHash, resultingProjectionHash: projectionFor(restored, anchor).projectionHash,
        expectedProjection, resultingProjection: projectionFor(restored, anchor),
      } : original.operationType === "RENAME_WORK_OBJECT" ? {
        type: "UPDATE_MANAGED_FIELD", commitId, effectId, graphId: anchor.graphId, sourceBlockUuid: anchor.externalId,
        fieldUuid: anchor.projectionTitleUuid, content: restored.title,
        expectedProjectionHash: expectedProjection.projectionHash, resultingProjectionHash: projectionFor(restored, anchor).projectionHash,
        expectedProjection, resultingProjection: projectionFor(restored, anchor),
      } : (() => {
        const originalClosure = (original.inverse as { closure?: ManagedProjection["closure"] }).closure ?? null;
        const projected = projectionFor(restored, anchor, originalClosure);
        return { type: "CHANGE_CLOSURE_FIELDS", commitId, effectId, graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid, stateUuid: anchor.projectionStateUuid, focusUuid: anchor.projectionFocusUuid, expectedSourceMarker: snapshot.sourceMarker ?? null, resultingSourceMarker: restored.lifecycle === "OPEN" && snapshot.sourceMarker === "DONE" ? "TODO" : restored.lifecycle === "COMPLETED" ? "DONE" : snapshot.sourceMarker ?? null, expectedProjection: snapshot.projection!, lifecycle: restored.lifecycle, engagement: restored.engagement, waitingCondition: restored.waitingCondition, currentFocus: restored.currentFocus, closure: originalClosure, expectedProjectionHash: expectedProjection.projectionHash, resultingProjectionHash: projected.projectionHash, resultingProjection: projected };
      })()
      : {
        type: "REMOVE_MANAGED_PROJECTION", commitId, effectId, graphId: anchor.graphId,
        sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid,
        expectedProjectionHash: expectedProjection.projectionHash, expectedProjection,
      };
    const compensation: StoredCommit = {
      id: commitId, status: "PREPARED", actor: input.actor, operationType: "UNDO_COMMIT", targetId: object.id,
      operation: { operationId: input.operationId, type: "UNDO_COMMIT", actor: input.actor, target: { commitId: input.commitId, expectedProjectionHash: expectedProjection.projectionHash }, input: {} },
      preconditions: [{ kind: "MANAGED_PROJECTION_HASH", expected: expectedProjection.projectionHash }], before: object, after: restored,
      inverse: restored ? { type: "RENAME_WORK_OBJECT", title: object.title, version: restored.version } : { type: "CREATE_WORK_OBJECT", object, anchor },
      graphEffect: effect, graphResult: null, failureReason: null, governance: null,
      compensationFor: original.id, compensatedBy: null, createdAt: now, updatedAt: now,
    };
    this.#store.insertCommit(compensation);
    this.#afterStage("PREPARED", commitId);
    if (snapshot.graphId !== anchor.graphId || snapshot.sourceBlockUuid !== anchor.externalId || snapshot.projection?.projectionHash !== expectedProjection.projectionHash) {
      this.#store.transitionCommit(commitId, "ABORTED", { updatedAt: now, failureReason: "UNDO_GRAPH_CHANGED" });
      throw new KernelError("UNDO_GRAPH_CHANGED", "Managed projection changed after the original commit; no content was removed.", commitId);
    }
    this.#store.transaction(() => {
      if (restored) this.#store.putWorkObject(restored); else this.#store.deleteWorkObject(object.id);
      this.#store.transitionCommit(commitId, "KERNEL_APPLIED", { updatedAt: now });
    });
    this.#afterStage("KERNEL_APPLIED", commitId);
    return { commit: this.#store.getCommit(commitId)!, graphEffect: effect };
  }

  complete(commitId: string, result: GraphApplyResult, actual: GraphSnapshot): StoredCommit {
    const commit = this.#store.getCommit(commitId);
    if (!commit || commit.status !== "KERNEL_APPLIED") throw new KernelError("COMMIT_STAGE_INVALID", "Commit is not waiting for Graph application.", commitId);
    const effect = commit.graphEffect as GraphEffect;
    this.#store.transitionCommit(commitId, "GRAPH_APPLIED", { updatedAt: result.appliedAt, graphResult: result });
    this.#afterStage("GRAPH_APPLIED", commitId);
    const expectedHash = resultingProjectionHash(effect);
    const valid = result.commitId === effect.commitId && result.effectId === effect.effectId && result.effectType === effect.type &&
      result.graphId === effect.graphId && result.sourceBlockUuid === effect.sourceBlockUuid &&
      actual.graphId === effect.graphId && actual.sourceBlockUuid === effect.sourceBlockUuid &&
      (actual.projection?.projectionHash ?? null) === expectedHash && result.projectionHash === expectedHash &&
      (effect.type !== "CHANGE_CLOSURE_FIELDS" || (actual.sourceMarker ?? null) === (effect.resultingSourceMarker ?? null));
    if (!valid) {
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: this.#now(), failureReason: "GRAPH_VERIFY_MISMATCH" });
      throw new KernelError("GRAPH_VERIFY_MISMATCH", "Graph result does not match the deterministic effect.", commitId);
    }
    this.#finalizeGovernance(commit, commitId);
    return this.#store.getCommit(commitId)!;
  }

  /** Verify a Graph write produced by a formal commit; formal truth was already COMMITTED. */
  verifyFormalProjection(commitId: string, result: GraphApplyResult, actual: GraphSnapshot): ProjectionObligation {
    const commit = this.#store.getCommit(commitId);
    const obligation = this.#store.getProjectionObligationForCommit(commitId);
    if (!commit || commit.status !== "COMMITTED" || !obligation) throw new KernelError("PROJECTION_OBLIGATION_MISSING", "Formal projection obligation does not exist for this commit.", commitId);
    if (obligation.status === "VERIFIED") return obligation;
    const effect = commit.graphEffect as GraphEffect;
    const expectedHash = resultingProjectionHash(effect);
    const at = this.#now();
    const valid = result.commitId === effect.commitId && result.effectId === effect.effectId && result.effectType === effect.type &&
      result.graphId === effect.graphId && result.sourceBlockUuid === effect.sourceBlockUuid &&
      actual.graphId === effect.graphId && actual.sourceBlockUuid === effect.sourceBlockUuid &&
      (actual.projection?.projectionHash ?? null) === expectedHash && result.projectionHash === expectedHash &&
      (effect.type !== "CHANGE_CLOSURE_FIELDS" || (actual.sourceMarker ?? null) === (effect.resultingSourceMarker ?? null));
    if (!valid) {
      this.#store.transitionProjectionObligation(commitId, "FAILED", { updatedAt: at, attempt: obligation.attempt + 1, lastAttemptAt: at, nextAttemptAt: this.#projectionNextAttemptAt(at, obligation.attempt + 1), lastError: "PROJECTION_VERIFY_MISMATCH", retryExhausted: obligation.attempt + 1 >= this.#projectionMaxAttempts });
      throw new KernelError("PROJECTION_VERIFY_MISMATCH", "Graph result does not match the deterministic projection obligation.", commitId);
    }
    this.#store.transitionProjectionObligation(commitId, "VERIFIED", { updatedAt: at, attempt: obligation.attempt + 1, lastAttemptAt: at, nextAttemptAt: null, retryExhausted: false, lastError: null });
    return this.#store.getProjectionObligationForCommit(commitId)!;
  }

  graphProjectionFailed(commitId: string, reason: string): ProjectionObligation {
    const obligation = this.#store.getProjectionObligationForCommit(commitId);
    if (!obligation) throw new KernelError("PROJECTION_OBLIGATION_MISSING", "Formal projection obligation does not exist for this commit.", commitId);
    const at = this.#now();
    const temporary = /GRAPH_ADAPTER_OFFLINE|GRAPH_GATEWAY_TIMEOUT|GRAPH_BROKER_CLOSED|fetch failed|ECONNREFUSED/u.test(reason);
    const nextAttempt = temporary ? this.#afterMs(at, this.#projectionTemporaryBackoffMs) : this.#projectionNextAttemptAt(at, obligation.attempt + 1);
    const attempt = temporary ? obligation.attempt : obligation.attempt + 1;
    const retryExhausted = attempt >= this.#projectionMaxAttempts;
    this.#store.transitionProjectionObligation(commitId, "FAILED", { updatedAt: at, attempt, lastAttemptAt: at, nextAttemptAt: retryExhausted ? null : nextAttempt, retryExhausted, lastError: reason.slice(0, 200) });
    return this.#store.getProjectionObligationForCommit(commitId)!;
  }

  listProjectionObligations(status?: ProjectionObligation["status"]): ProjectionObligation[] {
    return this.#store.listProjectionObligations(status);
  }

  associateContext(input: { id?: string; workObjectId: string; sourceRef: ContextAssociation["sourceRef"]; sourceVersionHash: string; origin: ContextAssociation["origin"]; basisRunId?: string | null; at?: string }): ContextAssociation {
    const object = this.#store.getWorkObject(input.workObjectId);
    if (!object || object.lifecycle !== "OPEN") throw new KernelError("CONTEXT_TARGET_INVALID", "Context Association requires an OPEN Formal WorkObject.");
    const correction = this.#store.findActiveCorrection(input.sourceRef.graphId, input.sourceRef.blockUuid, object.id);
    if (correction) throw new KernelError("ASSOCIATION_CORRECTION_BLOCKS", "An active Association Correction prevents automatic association of this source with this WorkObject.");
    const existing = this.#store.findActiveContextAssociation(object.id, input.sourceRef.graphId, input.sourceRef.blockUuid);
    if (existing) return existing;
    const at = input.at ?? this.#now();
    const association: ContextAssociation = {
      id: input.id ?? deterministicUuid(`context:${object.id}:${input.sourceRef.graphId}:${input.sourceRef.blockUuid}`),
      workObjectId: object.id, sourceRef: input.sourceRef, sourceVersionHash: input.sourceVersionHash, origin: input.origin,
      ...(input.basisRunId ? { basisRunId: input.basisRunId } : {}), status: "ACTIVE", createdAt: at, updatedAt: at,
    };
    this.#store.putContextAssociation(association);
    return association;
  }

  listContextAssociations(workObjectId?: string, status?: ContextAssociation["status"]): ContextAssociation[] {
    return this.#store.listContextAssociations(workObjectId, status);
  }

  invalidateContextAssociation(id: string): ContextAssociation {
    const at = this.#now();
    this.#store.invalidateContextAssociation(id, at);
    return this.#store.getContextAssociation(id)!;
  }

  recordAssociationCorrection(input: { id?: string; sourceRef: AssociationCorrection["sourceRef"]; scopeSnapshot: string; rejectedWorkObjectId: string; affirmedWorkObjectId?: string | null; userDecisionRef: string; at?: string }): AssociationCorrection {
    const object = this.#store.getWorkObject(input.rejectedWorkObjectId);
    if (!object) throw new KernelError("ASSOCIATION_TARGET_NOT_FOUND", "Rejected WorkObject does not exist.");
    if (input.affirmedWorkObjectId && !this.#store.getWorkObject(input.affirmedWorkObjectId)) throw new KernelError("ASSOCIATION_TARGET_NOT_FOUND", "Affirmed WorkObject does not exist.");
    const at = input.at ?? this.#now();
    const correction: AssociationCorrection = {
      id: input.id ?? deterministicUuid(`correction:${input.sourceRef.graphId}:${input.sourceRef.blockUuid}:${object.id}`),
      sourceRef: input.sourceRef, scopeSnapshot: input.scopeSnapshot, rejectedWorkObjectId: object.id,
      affirmedWorkObjectId: input.affirmedWorkObjectId ?? null, userDecisionRef: input.userDecisionRef, createdAt: at,
    };
    this.#store.transaction(() => {
      for (const association of this.#store.listContextAssociations(object.id).filter((item) => item.sourceRef.graphId === input.sourceRef.graphId && item.sourceRef.blockUuid === input.sourceRef.blockUuid && item.status === "ACTIVE")) {
        this.#store.invalidateContextAssociation(association.id, at);
      }
      this.#store.putAssociationCorrection(correction);
    });
    return correction;
  }

  upsertGovernanceIssue(input: { id?: string; workObjectId: string; dimension: string; type: GovernanceIssue["type"]; summary: string; evidenceIds?: readonly string[]; sourceSnapshotId: string; formalVersion: number; correlationId?: string | null; at?: string }): GovernanceIssue {
    const object = this.#store.getWorkObject(input.workObjectId);
    if (!object) throw new KernelError("ISSUE_TARGET_NOT_FOUND", "Governance Issue target does not exist.");
    const existing = this.#store.findOpenGovernanceIssue(object.id, input.dimension, input.type, input.sourceSnapshotId);
    if (existing) return existing;
    const at = input.at ?? this.#now();
    const issue: GovernanceIssue = {
      id: input.id ?? deterministicUuid(`issue:${object.id}:${input.dimension}:${input.type}:${input.sourceSnapshotId}`),
      workObjectId: object.id, dimension: input.dimension, type: input.type, status: "OPEN", summary: input.summary,
      evidenceIds: input.evidenceIds ?? [], sourceSnapshotId: input.sourceSnapshotId, formalVersion: input.formalVersion,
      correlationId: input.correlationId ?? null, createdAt: at, updatedAt: at, resolvedAt: null,
    };
    this.#store.putGovernanceIssue(issue);
    return issue;
  }

  resolveGovernanceIssue(id: string): GovernanceIssue {
    const at = this.#now();
    this.#store.transitionGovernanceIssue(id, "RESOLVED", at);
    return this.#store.getGovernanceIssue(id)!;
  }

  supersedeGovernanceIssue(id: string): GovernanceIssue {
    const at = this.#now();
    this.#store.transitionGovernanceIssue(id, "SUPERSEDED", at);
    return this.#store.getGovernanceIssue(id)!;
  }

  listGovernanceIssues(workObjectId?: string, status?: GovernanceIssue["status"]): GovernanceIssue[] {
    return this.#store.listGovernanceIssues(workObjectId, status);
  }

  projectionHealth(): { backlog: number; oldestPendingAt: string | null; retrying: number; degraded: number; lastError: string | null } {
    const obligations = this.#store.listProjectionObligations();
    const open = obligations.filter((item) => item.status === "PENDING" || (item.status === "FAILED" && !item.retryExhausted));
    const degraded = obligations.filter((item) => item.retryExhausted && item.status !== "VERIFIED");
    const oldest = open.map((item) => item.createdAt).sort()[0] ?? null;
    return {
      backlog: open.length,
      oldestPendingAt: oldest,
      retrying: open.filter((item) => item.status === "FAILED").length,
      degraded: degraded.length,
      lastError: obligations.map((item) => item.lastError).filter((value): value is string => value !== null).at(-1) ?? null,
    };
  }

  #afterMs(at: string, ms: number): string {
    return new Date(Date.parse(at) + ms).toISOString();
  }

  #projectionNextAttemptAt(at: string, attempt: number): string {
    return this.#afterMs(at, Math.min(this.#projectionBackoffBaseMs * 2 ** Math.max(0, attempt - 1), this.#projectionBackoffBaseMs * 32));
  }

  recoveryList(): Array<{ commit: StoredCommit; action: RecoveryAction }> {
    return this.#store.listRecovery().map((commit) => ({ commit, action: commit.status === "PREPARED" ? "ABORT_PREPARED" : commit.status === "KERNEL_APPLIED" ? "RESUME_GRAPH_APPLY" : commit.status === "GRAPH_APPLIED" ? "VERIFY_GRAPH" : "MANUAL_RECONCILIATION" }));
  }

  graphApplyFailed(commitId: string, reason: string): StoredCommit {
    const commit = this.#store.getCommit(commitId);
    if (!commit || commit.status !== "KERNEL_APPLIED") throw new KernelError("COMMIT_STAGE_INVALID", "Commit is not waiting for Graph application.", commitId);
    const conflict = /PRECONDITION|CHANGED|MISMATCH|VERIFY/iu.test(reason);
    this.#store.transitionCommit(commitId, conflict ? "RECOVERY_REQUIRED" : "KERNEL_APPLIED", { updatedAt: this.#now(), failureReason: `GRAPH_APPLY_FAILED:${reason.slice(0, 200)}` });
    return this.#store.getCommit(commitId)!;
  }

  verifyRecoveredGraph(commitId: string, actual: GraphSnapshot): StoredCommit {
    const commit = this.#store.getCommit(commitId);
    if (!commit || commit.status !== "GRAPH_APPLIED") throw new KernelError("COMMIT_STAGE_INVALID", "Only GRAPH_APPLIED commits can be recovered by verification.", commitId);
    const effect = commit.graphEffect as GraphEffect;
    const result = commit.graphResult as GraphApplyResult | null;
    const expectedHash = resultingProjectionHash(effect);
    if (!result || result.commitId !== effect.commitId || result.effectId !== effect.effectId || result.effectType !== effect.type ||
      result.graphId !== effect.graphId || result.sourceBlockUuid !== effect.sourceBlockUuid ||
      actual.graphId !== effect.graphId || actual.sourceBlockUuid !== effect.sourceBlockUuid ||
      (actual.projection?.projectionHash ?? null) !== expectedHash || result.projectionHash !== expectedHash ||
      (effect.type === "CHANGE_CLOSURE_FIELDS" && (actual.sourceMarker ?? null) !== (effect.resultingSourceMarker ?? null))) {
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: this.#now(), failureReason: "RECOVERY_GRAPH_VERIFY_MISMATCH" });
      throw new KernelError("RECOVERY_GRAPH_VERIFY_MISMATCH", "Recovered Graph state does not match the durable Graph result.", commitId);
    }
    this.#finalizeGovernance(commit, commitId);
    return this.#store.getCommit(commitId)!;
  }

  #finalizeGovernance(commit: StoredCommit, commitId: string): void {
    const at = this.#now();
    this.#store.transaction(() => {
      this.#store.transitionCommit(commitId, "COMMITTED", { updatedAt: at });
      if (commit.governance) {
        this.#store.transitionProposal(commit.governance.proposalId, "APPLIED", at, { appliedCommitId: commitId });
        const revision = this.#store.getProposal(commit.governance.proposalId)?.revision;
        if (revision) this.#store.putFeedback({ id: deterministicUuid(`feedback:accepted:${commit.id}`), type: "ACCEPTED", proposalId: revision.proposalId, agentRunId: revision.agentRunId, proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId, before: objectValue(commit.before as WorkObject | null, revision.operationType), after: objectValue(commit.after as WorkObject | null, revision.operationType), signalStrength: "WEAK_ACCEPTANCE", governanceCorrelationId: "governanceCorrelationId" in revision ? revision.governanceCorrelationId ?? null : null, createdAt: at });
      }
      if (commit.compensationFor) {
        this.#store.setCompensatedBy(commit.compensationFor, commitId, at);
        const original = this.#store.getCommit(commit.compensationFor);
        const revision = original?.governance ? this.#store.getProposal(original.governance.proposalId)?.revision : null;
        if (original?.governance && revision) this.#store.putFeedback({ id: deterministicUuid(`feedback:undone:${original.id}`), type: "UNDONE_AFTER_APPLY", proposalId: revision.proposalId, agentRunId: revision.agentRunId, proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId, before: objectValue(commit.before as WorkObject | null, revision.operationType), after: objectValue(commit.after as WorkObject | null, revision.operationType), signalStrength: "CORRECTIVE", governanceCorrelationId: "governanceCorrelationId" in revision ? revision.governanceCorrelationId ?? null : null, createdAt: at });
      }
    });
  }

  abortPrepared(commitId: string): StoredCommit {
    const commit = this.#store.getCommit(commitId);
    if (!commit || commit.status !== "PREPARED") throw new KernelError("COMMIT_STAGE_INVALID", "Only PREPARED commits can be aborted.", commitId);
    this.#store.transitionCommit(commitId, "ABORTED", { updatedAt: this.#now(), failureReason: "RECOVERY_ABORTED_PREPARED" });
    return this.#store.getCommit(commitId)!;
  }
}
