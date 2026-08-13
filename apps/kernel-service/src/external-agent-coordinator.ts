import { deterministicUuid, stableHash, type AgentRunReceipt, type GraphBlockRead, type GraphEffect, type GraphGatewayResponse, type GraphPageRead, type GraphReadReceipt, type GraphSearchMatch, type StoredCommit } from "@task-copilot/contracts";
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
      agent: { executorType: "EXTERNAL_CLI" as const, supportedPurposes: ["CURRENT_FOCUS_MAINTENANCE", "ENGAGEMENT_RECONCILIATION"] as const },
      skills: this.#kernel.approvedSkills().map(({ id, version, contentHash }) => ({ id, version, contentHash })),
      forbidden: ["CREATE_WORK_OBJECT", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE", "PARKED", "RAW_GRAPH_WRITE"] as const,
    };
  }

  skills() { return this.#kernel.approvedSkills().map(({ id, version, contentHash }) => ({ id, version, contentHash })); }
  skill(id: string) {
    const skill = this.#kernel.approvedSkills().find((item) => item.id === id);
    if (!skill) throw new KernelError("SKILL_NOT_FOUND", "Approved Skill does not exist.");
    return skill;
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

  async startRun(input: { runId: string; purpose: AgentRunReceipt["purpose"]; workObjectId: string; evidenceIds: readonly string[]; executorId: string }) {
    const target = this.#kernel.targetSnapshotInput(input.workObjectId);
    const value = response(await this.#broker.request({ kind: "READ_TARGET_SNAPSHOT", input: target }), "READ_TARGET_SNAPSHOT");
    return this.#kernel.startExternalAgentRun({ ...input, snapshot: value.snapshot });
  }

  finishRun(input: { runId: string; result: unknown }) { return this.#kernel.finishExternalAgentRun(input); }
  readReceipts(runId: string) { return this.#store.listGraphReadReceipts(runId); }

  async applyProposal(proposalId: string): Promise<{ commit: StoredCommit; recovered: boolean }> {
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
