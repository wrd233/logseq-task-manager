import { deterministicUuid, EXTERNAL_CURRENT_FOCUS_RESULT_CONTRACT, EXTERNAL_ENGAGEMENT_RESULT_CONTRACT, stableHash, type AddReferenceCuration, type AgentRunReceipt, type CurationReceipt, type DecisionCandidate, type DecisionPackage, type GraphBlockRead, type GraphEffect, type GraphGatewayResponse, type GraphPageRead, type GraphReadReceipt, type GraphSearchMatch, type StoredCommit } from "@task-copilot/contracts";
import { KernelError } from "@task-copilot/kernel";
import type { Kernel } from "@task-copilot/kernel";
import type { SqliteStore } from "@task-copilot/sqlite";

import type { GraphRequestBroker } from "./graph-broker.ts";

function response<T extends GraphGatewayResponse["kind"]>(value: GraphGatewayResponse, kind: T): Extract<GraphGatewayResponse, { kind: T }> {
  if (value.kind !== kind) throw new KernelError("GRAPH_RESPONSE_KIND_MISMATCH", "Graph Adapter returned another response kind.");
  return value as Extract<GraphGatewayResponse, { kind: T }>;
}

export class ExternalAgentCoordinator {
  readonly #kernel: Kernel; readonly #store: SqliteStore; readonly #broker: GraphRequestBroker; readonly #now: () => string;
  constructor(kernel: Kernel, store: SqliteStore, broker: GraphRequestBroker, now: () => string = () => new Date().toISOString()) { this.#kernel = kernel; this.#store = store; this.#broker = broker; this.#now = now; }

  bootstrap() {
    const graph = this.#broker.status();
    return {
      kernel: { ready: true },
      graph: { ready: graph.available, graphId: graph.graphId, capabilities: graph.capabilities, ...(graph.available ? {} : { reason: graph.reason }) },
      agent: { executorType: "EXTERNAL_CLI" as const, supportedPurposes: ["CURRENT_FOCUS_MAINTENANCE", "ENGAGEMENT_RECONCILIATION", "MINI_PROJECT_GOVERNANCE"] as const },
      skills: this.#kernel.approvedSkills().map(({ id, version, contentHash }) => ({ id, version, contentHash })),
      forbidden: ["CREATE_WORK_OBJECT", "SPLIT", "MERGE", "KIND_CHANGE", "PROJECT_OWNERSHIP", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE", "PARKED", "HISTORY_MOVE", "RAW_GRAPH_WRITE"] as const,
    };
  }

  skills() { return this.#kernel.approvedSkills().map(({ id, version, contentHash }) => ({ id, version, contentHash })); }
  skill(id: string) {
    const skill = this.#kernel.approvedSkills().find((item) => item.id === id);
    if (!skill) throw new KernelError("SKILL_NOT_FOUND", "Approved Skill does not exist.");
    return { skill, resultContract: skill.id === "engagement-reconciliation" ? EXTERNAL_ENGAGEMENT_RESULT_CONTRACT : skill.id === "miniproject-governance" || skill.id === "work-intent-maintenance" ? skill.schema : EXTERNAL_CURRENT_FOCUS_RESULT_CONTRACT };
  }

  async search(input: { query: string; limit: number; runId?: string }): Promise<{ matches: readonly GraphSearchMatch[]; receipt: GraphReadReceipt | null }> {
    const status = this.#broker.status(); if (!status.available || !status.graphId) throw new KernelError("GRAPH_ADAPTER_OFFLINE", "The trusted Graph Adapter is offline.");
    if (!input.query.trim()) throw new KernelError("GRAPH_QUERY_REQUIRED", "Graph search query is required.");
    const limit = Math.max(1, Math.min(50, input.limit));
    const value = response(await this.#broker.request({ kind: "SEARCH", graphId: status.graphId, query: input.query.trim(), limit }), "SEARCH");
    const receipt = input.runId ? this.#receipt(input.runId, "SEARCH", `query:${input.query.trim()}`, stableHash(value.matches.map((item) => [item.blockUuid, item.contentHash]))) : null;
    return { matches: value.matches, receipt };
  }

  async readBlock(input: { blockUuid: string; runId?: string }): Promise<{ block: GraphBlockRead; receipt: GraphReadReceipt | null }> {
    const status = this.#broker.status(); if (!status.available || !status.graphId) throw new KernelError("GRAPH_ADAPTER_OFFLINE", "The trusted Graph Adapter is offline.");
    const value = response(await this.#broker.request({ kind: "READ_BLOCK", graphId: status.graphId, blockUuid: input.blockUuid }), "READ_BLOCK");
    const receipt = input.runId ? this.#receipt(input.runId, "BLOCK", `block:${value.block.blockUuid}`, value.block.contentHash) : null;
    return { block: value.block, receipt };
  }

  async readPage(input: { pageName: string; limit: number; runId?: string }): Promise<{ page: GraphPageRead; receipt: GraphReadReceipt | null }> {
    const status = this.#broker.status(); if (!status.available || !status.graphId) throw new KernelError("GRAPH_ADAPTER_OFFLINE", "The trusted Graph Adapter is offline.");
    const value = response(await this.#broker.request({ kind: "READ_PAGE", graphId: status.graphId, pageName: input.pageName, limit: Math.max(1, Math.min(100, input.limit)) }), "READ_PAGE");
    const receipt = input.runId ? this.#receipt(input.runId, "PAGE", `page:${value.page.pageName}`, stableHash(value.page.blocks.map((item) => [item.blockUuid, item.contentHash]))) : null;
    return { page: value.page, receipt };
  }

  #receipt(runId: string, kind: GraphReadReceipt["kind"], locator: string, contentHash: string): GraphReadReceipt {
    const receipt = { id: deterministicUuid(`graph-read:${runId}:${kind}:${locator}:${contentHash}`), agentRunId: runId, kind, locator, contentHash, readAt: this.#now() } satisfies GraphReadReceipt;
    try { this.#store.putGraphReadReceipt(receipt); } catch { throw new KernelError("GRAPH_READ_RUN_NOT_ACTIVE", "--run must identify an active External AgentRun."); }
    return receipt;
  }

  async freezeEvidence(input: { evidenceId: string; workObjectId: string; blockUuid: string }) {
    const target = this.#kernel.targetSnapshotInput(input.workObjectId);
    const value = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: target.graphId, blockUuid: input.blockUuid }), "READ_EVIDENCE");
    return this.#kernel.freezeEvidence({ evidenceId: input.evidenceId, workObjectId: input.workObjectId, snapshot: value.material });
  }

  async startRun(input: { runId: string; purpose: AgentRunReceipt["purpose"]; workObjectId: string; evidenceIds: readonly string[]; executorId: string; governanceCorrelationId?: string }) {
    const target = this.#kernel.targetSnapshotInput(input.workObjectId);
    const value = response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: target }), "READ_TARGET_SNAPSHOT");
    return this.#kernel.startExternalAgentRun({ ...input, snapshot: value.snapshot });
  }

  finishRun(input: { runId: string; result: unknown }) { return this.#kernel.finishExternalAgentRun(input); }
  readReceipts(runId: string) { return this.#store.listGraphReadReceipts(runId); }

  async addReference(input: { receiptId: string; runId: string; workObjectId: string; referenceBlockUuid: string; section: "资源" | "支撑交付物"; existingSectionUuid?: string | null }): Promise<CurationReceipt> {
    const existing = this.#store.getCurationReceipt(input.receiptId); if (existing) return existing;
    const run = this.#store.getAgentRun(input.runId);
    if (!run || run.executor.type !== "EXTERNAL_CLI" || run.state !== "STARTED" || run.purpose !== "MINI_PROJECT_GOVERNANCE" || run.subject.workObjectId !== input.workObjectId || !run.context.governanceCorrelationId || !run.context.taste) throw new KernelError("CURATION_GOVERNANCE_REQUIRED", "ADD_REFERENCE requires an active MiniProject governance run.");
    const object = this.#store.getWorkObject(input.workObjectId); const anchor = object ? this.#store.getAnchorForWorkObject(object.id) : null;
    if (!object || object.kind !== "MINI_PROJECT" || object.lifecycle !== "OPEN" || !anchor || object.version !== run.context.targetVersion) throw new KernelError("CURATION_TARGET_STALE", "MiniProject changed before curation.");
    const before = response(await this.#broker.request({ kind: "READ_CURATION_SNAPSHOT", graphId: anchor.graphId, rootBlockUuid: anchor.externalId }), "READ_CURATION_SNAPSHOT").snapshot;
    const curation: AddReferenceCuration = { type: "ADD_REFERENCE", receiptId: input.receiptId, graphId: anchor.graphId, rootBlockUuid: anchor.externalId, expectedRootContentHash: before.rootContentHash, expectedRootTopologyHash: before.rootTopologyHash, section: input.section, existingSectionUuid: input.existingSectionUuid ?? null, newSectionUuid: deterministicUuid(`curation-section:${input.receiptId}`), newReferenceUuid: deterministicUuid(`curation-reference:${input.receiptId}`), referenceBlockUuid: input.referenceBlockUuid };
    const applied = response(await this.#broker.request({ kind: "APPLY_CURATION", curation }), "APPLY_CURATION");
    if (applied.snapshot.rootContentHash !== before.rootContentHash || !applied.createdBlockUuids.includes(curation.newReferenceUuid)) throw new KernelError("CURATION_VERIFY_MISMATCH", "Typed curation did not verify after Graph apply.");
    const receipt: CurationReceipt = { id: input.receiptId, type: "ADD_REFERENCE", workObjectId: object.id, agentRunId: run.id, governanceCorrelationId: run.context.governanceCorrelationId, skill: run.skill, taste: run.context.taste, graphId: anchor.graphId, rootBlockUuid: anchor.externalId, referenceBlockUuid: input.referenceBlockUuid, beforeContentHash: before.rootContentHash, beforeTopologyHash: before.rootTopologyHash, afterContentHash: applied.snapshot.rootContentHash, afterTopologyHash: applied.snapshot.rootTopologyHash, createdBlockUuids: applied.createdBlockUuids, createdAt: this.#now() };
    this.#store.putCurationReceipt(receipt); return receipt;
  }

  async applyProposal(proposalId: string): Promise<{ commit: StoredCommit; recovered: boolean } | { package: DecisionPackage; candidates: DecisionCandidate[]; recovered: boolean }> {
    const stored = this.#store.getProposal(proposalId);
    if (!stored) throw new KernelError("PROPOSAL_NOT_FOUND", "Proposal does not exist.");
    if (stored.proposal.status === "APPLIED" && stored.proposal.appliedCommitId) return { commit: this.#store.getCommit(stored.proposal.appliedCommitId)!, recovered: true };
    const prior = this.#store.listCommits().find((commit) => commit.governance?.proposalId === proposalId && commit.status !== "ABORTED");
    if (prior) return { commit: await this.#resume(prior), recovered: true };
    const target = this.#kernel.targetSnapshotInput(stored.proposal.workObjectId);
    const snapshot = response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: target }), "READ_TARGET_SNAPSHOT").snapshot;
    const evidence = await Promise.all(stored.revision.evidenceDependencies.map(async (dependency) => {
      const frozen = this.#store.getEvidence(dependency.evidenceId); if (!frozen) throw new KernelError("EVIDENCE_INVALID", "Proposal Evidence is missing.");
      const material = response(await this.#broker.request({ kind: "READ_EVIDENCE", graphId: frozen.graphId, blockUuid: frozen.externalId }), "READ_EVIDENCE").material;
      return { evidenceId: dependency.evidenceId, ...material };
    }));
    const operationId = `external-apply-${proposalId}`;
    if (stored.revision.operationType === "UPDATE_WORK_INTENT") {
      const packaged = this.#kernel.packageWorkIntentProposal({ operationId, proposalId, snapshot, evidence });
      return { package: packaged.pkg, candidates: packaged.candidates, recovered: false };
    }
    const pending = stored.revision.operationType === "CHANGE_ENGAGEMENT" ? this.#kernel.applyEngagementProposal({ operationId, proposalId, snapshot, evidence }) : this.#kernel.applyProposal({ operationId, proposalId, snapshot, evidence });
    return { commit: await this.#applyPending(pending.commit, pending.graphEffect), recovered: false };
  }

  async #applyPending(commit: StoredCommit, effect: unknown) {
    try {
      const value = response(await this.#broker.request({ kind: "APPLY_EFFECT", effect: effect as GraphEffect }), "APPLY_EFFECT");
      return this.#kernel.complete(commit.id, value.result, value.snapshot);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "GRAPH_APPLY_FAILED";
      if (code === "GRAPH_ADAPTER_OFFLINE" || code === "GRAPH_GATEWAY_TIMEOUT") throw new KernelError(code, error instanceof Error ? error.message : "Graph Adapter is unavailable.", commit.id);
      const failed = this.#kernel.graphApplyFailed(commit.id, code);
      throw new KernelError(failed.status === "KERNEL_APPLIED" ? "GRAPH_APPLY_PENDING" : "GRAPH_APPLY_RECOVERY_REQUIRED", `Graph apply did not commit; Commit ${commit.id} is ${failed.status}.`, commit.id);
    }
  }

  async #resume(commit: StoredCommit) {
    if (commit.status === "COMMITTED") return commit;
    if (commit.status === "RECOVERY_REQUIRED") throw new KernelError("GRAPH_APPLY_RECOVERY_REQUIRED", `Commit ${commit.id} requires reconciliation.`, commit.id);
    if (commit.status === "GRAPH_APPLIED") {
      const target = this.#kernel.targetSnapshotInput(commit.targetId!);
      const snapshot = response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: target }), "READ_TARGET_SNAPSHOT").snapshot;
      return this.#kernel.verifyRecoveredGraph(commit.id, snapshot);
    }
    if (commit.status === "KERNEL_APPLIED") return this.#applyPending(commit, commit.graphEffect);
    throw new KernelError("PROPOSAL_APPLY_STATE_INVALID", `Commit ${commit.id} cannot be resumed from ${commit.status}.`);
  }
}
