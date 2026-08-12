import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { APPROVED_CURRENT_FOCUS_SKILL, canonicalizeGraphContent, deterministicUuid as deterministicIdentityUuid, graphEvidenceProofPayload, OPERATION_CONTRACT_VERSION, parseAgentCurrentFocusResult, parseSemanticOperation, stableHash, type Actor, type AgentCurrentFocusResult, type AgentRunReceipt, type CurrentFocusAgent, type FrozenEvidence, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type ManagedProjection, type Proposal, type ProposalRevision, type SemanticOperation, type SkillPackage, type StoredCommit, type TrustedGraphEvidenceMaterial } from "@task-copilot/contracts";
import { createWorkObject, renameWorkObject, setCurrentFocus, type PrimaryAnchor, type WorkObject } from "@task-copilot/domain";
import type { SqliteStore } from "@task-copilot/sqlite";

type DurableStage = "PREPARED" | "KERNEL_APPLIED" | "GRAPH_APPLIED";
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
  graphSnapshotKey?: string;
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; hex[16] = "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function canonicalWorkObject(object: WorkObject): string {
  return JSON.stringify([object.id, object.kind, object.title, object.lifecycle, object.engagement, object.currentFocus, object.version, object.createdAt, object.updatedAt]);
}

function resultingProjectionHash(effect: GraphEffect): string | null {
  return effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection.projectionHash
    : effect.type === "UPDATE_MANAGED_FIELD" || effect.type === "SET_CURRENT_FOCUS_FIELD" ? effect.resultingProjectionHash : null;
}

function projectionFor(object: WorkObject, anchor: Pick<PrimaryAnchor, "projectionContainerUuid" | "projectionTitleUuid" | "projectionStateUuid" | "projectionFocusUuid">): ManagedProjection {
  const core = {
    containerUuid: anchor.projectionContainerUuid, titleUuid: anchor.projectionTitleUuid, stateUuid: anchor.projectionStateUuid,
    focusUuid: anchor.projectionFocusUuid, title: object.title, lifecycle: object.lifecycle, engagement: object.engagement, currentFocus: object.currentFocus,
  };
  return { ...core, projectionHash: stableHash(core) };
}

function approvedCurrentFocusSkill(skill: SkillPackage): boolean {
  const manifest = skill.manifest as { id?: unknown; version?: unknown; operation?: unknown; risk?: unknown };
  return skill.id === APPROVED_CURRENT_FOCUS_SKILL.id && skill.version === APPROVED_CURRENT_FOCUS_SKILL.version && skill.contentHash === APPROVED_CURRENT_FOCUS_SKILL.contentHash &&
    manifest.id === skill.id && manifest.version === skill.version && manifest.operation === "SET_CURRENT_FOCUS" && manifest.risk === "LOW";
}

export class Kernel {
  readonly #store: SqliteStore;
  readonly #now: () => string;
  readonly #afterStage: (stage: DurableStage, commitId: string) => void;
  readonly #authorizedUserId: string;
  readonly #agent: CurrentFocusAgent | null;
  readonly #skill: SkillPackage | null;
  readonly #graphSnapshotKey: string | null;

  constructor(store: SqliteStore, options: KernelOptions = {}) {
    this.#store = store; this.#now = options.now ?? (() => new Date().toISOString()); this.#afterStage = options.afterStage ?? (() => undefined); this.#authorizedUserId = options.authorizedUserId ?? "local-user";
    this.#agent = options.currentFocusAgent ?? null; this.#skill = options.currentFocusSkill ?? null;
    this.#graphSnapshotKey = options.graphSnapshotKey ?? null;
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

  freezeEvidence(input: { evidenceId: string; workObjectId: string; snapshot: TrustedGraphEvidenceMaterial }): FrozenEvidence {
    const object = this.#store.getWorkObject(input.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Evidence target or primary anchor does not exist.");
    if (input.snapshot.graphId !== anchor.graphId) throw new KernelError("EVIDENCE_GRAPH_MISMATCH", "Evidence must come from the target WorkObject's Graph.");
    const content = this.#verifyGraphEvidence(input.snapshot);
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

  async runCurrentFocusAgent(input: { runId: string; workObjectId: string; evidenceIds: readonly string[]; snapshot: GraphSnapshot }): Promise<{ run: AgentRunReceipt; proposal: Proposal | null; revision: ProposalRevision | null }> {
    if (!this.#agent || !this.#skill) throw new KernelError("AGENT_NOT_CONFIGURED", "Current-focus Agent and Skill are not configured.");
    if (!approvedCurrentFocusSkill(this.#skill)) throw new KernelError("SKILL_NOT_APPROVED", "Only current-focus-maintenance@0.1.0 is approved for this Agent operation.");
    const object = this.#store.getWorkObject(input.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Agent target or primary anchor does not exist.");
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
    let revision: ProposalRevision | null = null;
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
      skill: { id: this.#skill!.id, version: this.#skill!.version, contentHash: this.#skill!.contentHash }, subject: { workObjectId: object.id },
      context: { targetVersion: object.version, evidenceIds: input.evidenceIds }, result: { outcome: "FAILED", proposalIds: [] }, reasonCode,
      rationaleSummary: error instanceof Error ? error.message.slice(0, 200) : "Agent execution failed.", startedAt, finishedAt: this.#now(),
    };
  }

  reviseProposal(input: { proposalId: string; actor: Actor; currentFocus: string | null }): { proposal: Proposal; revision: ProposalRevision } {
    this.#authorize(input.actor);
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for revision.");
    const parsed = parseSemanticOperation({ operationId: `revise-${input.proposalId}-${stored.revision.revision + 1}`, type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: this.#agent?.id ?? "configured-agent" }, target: { workObjectId: stored.proposal.workObjectId, expectedVersion: stored.revision.expectedVersion, expectedProjectionHash: stored.revision.expectedProjectionHash }, input: { currentFocus: input.currentFocus }, evidenceDependencies: stored.revision.evidenceDependencies });
    if (parsed.type !== "SET_CURRENT_FOCUS") throw new KernelError("PROPOSAL_OPERATION_INVALID", "Proposal revision operation is invalid.");
    const revision: ProposalRevision = { ...stored.revision, revision: stored.revision.revision + 1, currentFocus: parsed.input.currentFocus, createdAt: this.#now() };
    const at = this.#now();
    this.#store.appendProposalRevisionWithFeedback(revision, { id: deterministicUuid(`feedback:modified:${revision.proposalId}:${revision.revision}`), type: "MODIFIED", proposalId: revision.proposalId, agentRunId: revision.agentRunId, proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId: null, before: stored.revision.currentFocus, after: revision.currentFocus, createdAt: at }, at);
    return this.#store.getProposal(input.proposalId)!;
  }

  dismissProposal(input: { proposalId: string; actor: Actor }): Proposal {
    this.#authorize(input.actor);
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for dismissal.");
    const at = this.#now();
    this.#store.transaction(() => {
      this.#store.transitionProposal(input.proposalId, "DISMISSED", at);
      this.#store.putFeedback({ id: deterministicUuid(`feedback:rejected:${input.proposalId}`), type: "REJECTED", proposalId: input.proposalId, agentRunId: stored.revision.agentRunId, proposalRevision: stored.revision.revision, skill: stored.revision.skill, operationType: stored.revision.operationType, commitId: null, before: stored.revision.currentFocus, after: null, createdAt: at });
    });
    return this.#store.getProposal(input.proposalId)!.proposal;
  }

  applyProposal(input: { operationId: string; proposalId: string; snapshot: GraphSnapshot; evidence: ReadonlyArray<{ evidenceId: string } & TrustedGraphEvidenceMaterial> }): { commit: StoredCommit; graphEffect: GraphEffect } {
    const stored = this.#store.getProposal(input.proposalId);
    if (!stored || stored.proposal.status !== "OPEN") throw new KernelError("PROPOSAL_NOT_OPEN", "Proposal is not open for application.");
    const { proposal, revision } = stored;
    const invalidate = (code: string, message: string): never => {
      this.#store.transitionProposal(proposal.id, "INVALIDATED", this.#now(), { invalidationReason: code });
      throw new KernelError(code, message);
    };
    const object = this.#store.getWorkObject(proposal.workObjectId);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor || object.version !== revision.expectedVersion) return invalidate("PROPOSAL_TARGET_STALE", "Target version changed before apply.");
    if (revision.operationContractVersion !== OPERATION_CONTRACT_VERSION) return invalidate("PROPOSAL_CONTRACT_VERSION_UNTRUSTED", "Proposal uses a different semantic operation contract version.");
    if (this.#store.hasPendingRecoveryForTarget(object.id)) return invalidate("TARGET_RECOVERY_PENDING", "Target has an incomplete Commit requiring recovery.");
    if (!this.#store.skillRegistered(revision.skill) || !this.#skill || !approvedCurrentFocusSkill(this.#skill) || revision.skill.id !== this.#skill.id || revision.skill.version !== this.#skill.version || revision.skill.contentHash !== this.#skill.contentHash) return invalidate("SKILL_VERSION_UNTRUSTED", "Proposal Skill identity is not the registered approved package.");
    if (input.snapshot.graphId !== anchor.graphId || input.snapshot.sourceBlockUuid !== anchor.externalId || input.snapshot.projection?.projectionHash !== revision.expectedProjectionHash) return invalidate("PROPOSAL_PROJECTION_STALE", "Managed projection changed before apply.");
    for (const dependency of revision.evidenceDependencies) {
      const frozen = this.#store.getEvidence(dependency.evidenceId);
      const fresh = input.evidence.find((item) => item.evidenceId === dependency.evidenceId);
      let freshHash: string | null = null;
      try { if (fresh) freshHash = createHash("sha256").update(this.#verifyGraphEvidence(fresh)).digest("hex"); } catch { return invalidate("PROPOSAL_EVIDENCE_STALE", "Fresh Evidence could not be verified through the trusted Graph Adapter."); }
      if (!frozen || !fresh || fresh.graphId !== frozen.graphId || fresh.blockUuid !== frozen.externalId || dependency.contentHash !== frozen.contentHash || freshHash !== frozen.contentHash) return invalidate("PROPOSAL_EVIDENCE_STALE", "Frozen Evidence changed before apply.");
    }
    const operation = parseSemanticOperation({
      operationId: input.operationId, type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: this.#agent!.id },
      target: { workObjectId: object.id, expectedVersion: revision.expectedVersion, expectedProjectionHash: revision.expectedProjectionHash },
      input: { currentFocus: revision.currentFocus }, evidenceDependencies: revision.evidenceDependencies,
    });
    return this.#prepare(operation, input.snapshot, { proposalId: proposal.id, revision: revision.revision, agentRunId: revision.agentRunId, skill: revision.skill });
  }

  prepare(operation: SemanticOperation, snapshot: GraphSnapshot): { commit: StoredCommit; graphEffect: GraphEffect } {
    this.#authorize(operation.actor);
    return this.#prepare(operation, snapshot, null);
  }

  #prepare(operation: SemanticOperation, snapshot: GraphSnapshot, governance: StoredCommit["governance"]): { commit: StoredCommit; graphEffect: GraphEffect } {
    if (operation.type === "UNDO_COMMIT") throw new KernelError("UNDO_ENTRYPOINT_REQUIRED", "Use prepareUndo for compensation commits.");
    const now = this.#now();
    const commitId = deterministicUuid(`commit:${operation.operationId}`);
    let object: WorkObject;
    let anchor: PrimaryAnchor;
    let graphEffect: GraphEffect;
    let before: WorkObject | null = null;

    if (operation.type === "CREATE_WORK_OBJECT") {
      const workObjectId = deterministicUuid(`work:${operation.operationId}`);
      object = createWorkObject({ id: workObjectId, kind: operation.input.kind, title: operation.input.title, at: now });
      anchor = {
        id: deterministicUuid(`anchor:${operation.operationId}`), workObjectId, graphId: operation.input.anchor.graphId,
        externalId: operation.input.anchor.blockUuid, sourceContentHash: operation.input.anchor.sourceContentHash,
        projectionContainerUuid: deterministicUuid(`projection:${operation.operationId}`), projectionTitleUuid: deterministicUuid(`title:${operation.operationId}`),
        projectionStateUuid: deterministicUuid(`state:${operation.operationId}`), projectionFocusUuid: "", createdAt: now, updatedAt: now,
      };
      anchor = { ...anchor, projectionFocusUuid: deterministicIdentityUuid(`focus:${anchor.projectionContainerUuid}`) };
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
      object = renameWorkObject(before, { title: operation.input.title, expectedVersion: operation.target.expectedVersion, at: now });
      const projection = projectionFor(object, anchor);
      graphEffect = {
        type: "UPDATE_MANAGED_FIELD", commitId, effectId: deterministicUuid(`effect:${commitId}:0`),
        graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, fieldUuid: anchor.projectionTitleUuid,
        content: `标题：${object.title}`, expectedProjectionHash: operation.target.expectedProjectionHash,
        resultingProjectionHash: projection.projectionHash,
      };
    } else {
      if (!governance || operation.actor.type !== "AGENT" || operation.actor.id !== this.#agent?.id) throw new KernelError("AGENT_GOVERNANCE_REQUIRED", "Agent writes require a verified low-risk Proposal path.");
      before = this.#store.getWorkObject(operation.target.workObjectId);
      if (!before) throw new KernelError("WORK_OBJECT_NOT_FOUND", "Current-focus target does not exist.");
      const storedAnchor = this.#store.getAnchorForWorkObject(before.id);
      if (!storedAnchor) throw new KernelError("WORK_OBJECT_ANCHOR_MISSING", "Current-focus target has no primary Graph anchor.");
      anchor = storedAnchor;
      object = setCurrentFocus(before, { currentFocus: operation.input.currentFocus, expectedVersion: operation.target.expectedVersion, at: now });
      const projection = projectionFor(object, anchor);
      graphEffect = {
        type: "SET_CURRENT_FOCUS_FIELD", commitId, effectId: deterministicUuid(`effect:${commitId}:0`), graphId: anchor.graphId,
        sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid, fieldUuid: anchor.projectionFocusUuid,
        content: object.currentFocus, expectedProjectionHash: operation.target.expectedProjectionHash, resultingProjectionHash: projection.projectionHash,
      };
    }

    const commit: StoredCommit = {
      id: commitId, status: "PREPARED", actor: operation.actor, operationType: operation.type, targetId: object.id,
      operation, preconditions: operation.preconditions, before, after: object,
      inverse: before ? operation.type === "SET_CURRENT_FOCUS" ? { type: "SET_CURRENT_FOCUS", currentFocus: before.currentFocus, version: before.version } : { type: "RENAME_WORK_OBJECT", title: before.title, version: before.version } : { type: "UNDO_COMMIT", targetId: object.id },
      graphEffect, graphResult: null, failureReason: null, compensationFor: null, compensatedBy: null, createdAt: now, updatedAt: now,
      governance,
    };
    this.#store.insertCommit(commit);
    this.#afterStage("PREPARED", commitId);

    const mismatch = snapshot.graphId !== anchor.graphId || snapshot.sourceBlockUuid !== anchor.externalId ||
      (operation.type === "CREATE_WORK_OBJECT" ? snapshot.sourceContentHash !== anchor.sourceContentHash || snapshot.projection !== null : snapshot.projection?.projectionHash !== operation.target.expectedProjectionHash);
    if (mismatch) {
      const code = operation.type === "CREATE_WORK_OBJECT" ? "SOURCE_CONTENT_HASH_MISMATCH" : "MANAGED_PROJECTION_HASH_MISMATCH";
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: now, failureReason: code });
      throw new KernelError(code, "Graph precondition does not match the operation's expected state.", commitId);
    }

    this.#store.transaction(() => {
      this.#store.putWorkObject(object);
      if (operation.type === "CREATE_WORK_OBJECT") this.#store.putAnchor(anchor);
      this.#store.transitionCommit(commitId, "KERNEL_APPLIED", { updatedAt: now });
    });
    this.#afterStage("KERNEL_APPLIED", commitId);
    return { commit: this.#store.getCommit(commitId)!, graphEffect };
  }

  prepareUndo(input: { operationId: string; actor: Actor; commitId: string }, snapshot: GraphSnapshot): { commit: StoredCommit; graphEffect: GraphEffect } {
    this.#authorize(input.actor);
    const original = this.#store.getCommit(input.commitId);
    if (!original || original.status !== "COMMITTED" || original.compensatedBy) throw new KernelError("UNDO_TARGET_INVALID", "Commit is not currently undoable.");
    if (original.operationType !== "CREATE_WORK_OBJECT" && original.operationType !== "RENAME_WORK_OBJECT" && original.operationType !== "SET_CURRENT_FOCUS") throw new KernelError("UNDO_OPERATION_UNSUPPORTED", "Only supported semantic commits are undoable.");
    const object = this.#store.getWorkObject(original.targetId!);
    const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || !anchor) throw new KernelError("UNDO_TARGET_MISSING", "Current state for the commit is missing.");
    const originalAfter = original.after as WorkObject | null;
    if (!originalAfter || canonicalWorkObject(object) !== canonicalWorkObject(originalAfter)) {
      throw new KernelError("UNDO_TARGET_CHANGED", "The commit is no longer the latest semantic change for this WorkObject.");
    }
    const expectedProjection = projectionFor(object, anchor);
    const now = this.#now();
    const commitId = deterministicUuid(`commit:${input.operationId}`);
    const effectId = deterministicUuid(`effect:${commitId}:0`);
    const previous = original.before as WorkObject | null;
    const restored = previous
      ? original.operationType === "RENAME_WORK_OBJECT"
        ? renameWorkObject(object, { title: previous.title, expectedVersion: object.version, at: now })
        : original.operationType === "SET_CURRENT_FOCUS"
          ? setCurrentFocus(object, { currentFocus: previous.currentFocus, expectedVersion: object.version, at: now })
          : null
      : null;
    const effect: GraphEffect = restored
      ? original.operationType === "SET_CURRENT_FOCUS" ? {
        type: "SET_CURRENT_FOCUS_FIELD", commitId, effectId, graphId: anchor.graphId, sourceBlockUuid: anchor.externalId,
        containerUuid: anchor.projectionContainerUuid, fieldUuid: anchor.projectionFocusUuid, content: restored.currentFocus,
        expectedProjectionHash: expectedProjection.projectionHash, resultingProjectionHash: projectionFor(restored, anchor).projectionHash,
      } : {
        type: "UPDATE_MANAGED_FIELD", commitId, effectId, graphId: anchor.graphId, sourceBlockUuid: anchor.externalId,
        fieldUuid: anchor.projectionTitleUuid, content: `标题：${restored.title}`,
        expectedProjectionHash: expectedProjection.projectionHash, resultingProjectionHash: projectionFor(restored, anchor).projectionHash,
      }
      : {
        type: "REMOVE_MANAGED_PROJECTION", commitId, effectId, graphId: anchor.graphId,
        sourceBlockUuid: anchor.externalId, containerUuid: anchor.projectionContainerUuid,
        expectedProjectionHash: expectedProjection.projectionHash,
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
      (actual.projection?.projectionHash ?? null) === expectedHash && result.projectionHash === expectedHash;
    if (!valid) {
      this.#store.transitionCommit(commitId, "RECOVERY_REQUIRED", { updatedAt: this.#now(), failureReason: "GRAPH_VERIFY_MISMATCH" });
      throw new KernelError("GRAPH_VERIFY_MISMATCH", "Graph result does not match the deterministic effect.", commitId);
    }
    this.#finalizeGovernance(commit, commitId);
    return this.#store.getCommit(commitId)!;
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
      (actual.projection?.projectionHash ?? null) !== expectedHash || result.projectionHash !== expectedHash) {
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
        if (revision) this.#store.putFeedback({ id: deterministicUuid(`feedback:accepted:${commit.id}`), type: "ACCEPTED", proposalId: revision.proposalId, agentRunId: revision.agentRunId, proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId, before: (commit.before as WorkObject | null)?.currentFocus ?? null, after: (commit.after as WorkObject | null)?.currentFocus ?? null, createdAt: at });
      }
      if (commit.compensationFor) {
        this.#store.setCompensatedBy(commit.compensationFor, commitId, at);
        const original = this.#store.getCommit(commit.compensationFor);
        const revision = original?.governance ? this.#store.getProposal(original.governance.proposalId)?.revision : null;
        if (original?.governance && revision) this.#store.putFeedback({ id: deterministicUuid(`feedback:undone:${original.id}`), type: "UNDONE_AFTER_APPLY", proposalId: revision.proposalId, agentRunId: revision.agentRunId, proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId, before: (commit.before as WorkObject | null)?.currentFocus ?? null, after: (commit.after as WorkObject | null)?.currentFocus ?? null, createdAt: at });
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
