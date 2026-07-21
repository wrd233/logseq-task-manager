import type { ServiceStoredProposal } from "@task-copilot/service-client";
import { planAcceptedV2Formalization } from "@task-copilot/application";
import { stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";
import { StructuredError, checksum } from "@task-copilot/shared";

import type { ServiceRuntimeClient } from "./service-connection.ts";
import { collectV2ProposalGraphObservations, type ProposalRevalidationGraphHost } from "./v2-proposal-revalidation.ts";

export interface ProposalMutationGraphHost extends ProposalRevalidationGraphHost {
  updateBlock(id: string, content: string): Promise<unknown>;
}

export interface ProposalCommitGraphHost extends ProposalMutationGraphHost {
  ensurePersistentIdentity(id: string): Promise<void>;
}

function commitError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-185", "D-188"] });
}

function blockEvidence(value: unknown, expectedId: string): { hash: string; inputVersion: string } {
  const block = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!block || typeof block.content !== "string" || (typeof block.uuid === "string" && block.uuid !== expectedId)) throw commitError("V2_PROPOSAL_COMMIT_GRAPH_EVIDENCE_INVALID", "Logseq Block 身份或正文证据无效。");
  const version = block.updatedAt ?? block["updated-at"];
  const contentHash = checksum(stripLogseqBlockIdentityProperty(block.content, expectedId));
  return { hash: contentHash, inputVersion: typeof version === "string" || typeof version === "number" ? String(version) : `content-${contentHash}` };
}

export async function commitV2Formalization(
  client: Pick<ServiceRuntimeClient, "prepareProposalCommit" | "finalizeProposalCommit" | "compensateProposalCommit">,
  host: ProposalCommitGraphHost,
  record: ServiceStoredProposal,
  traceId: string,
): Promise<{ status: "COMPLETED" | "STALE" | "FAILED_COMPENSATED"; semanticCommitId?: string; objectId?: string }> {
  const reviewedPlan = planAcceptedV2Formalization(record.proposal);
  await host.ensurePersistentIdentity(reviewedPlan.patch.blockUuid);
  const observations = await collectV2ProposalGraphObservations(record.proposal, host);
  const prepared = await client.prepareProposalCommit(record.proposal.proposalId, observations, record.updatedAt);
  if (prepared.status === "STALE") return { status: "STALE" };
  if (prepared.status === "COMPLETED") return { status: "COMPLETED", semanticCommitId: prepared.semanticCommitId, objectId: prepared.objectId };
  const before = blockEvidence(await host.getBlock(prepared.plan.patch.blockUuid), prepared.plan.patch.blockUuid);
  if (prepared.status === "RECOVERY_REQUIRED") {
    if (before.hash !== prepared.plan.patch.afterHash) throw commitError("V2_PROPOSAL_COMPENSATION_BLOCKED_BY_EDIT", "待恢复 Commit 的正文已被后续编辑；不会覆盖，Commit 保持 RECOVERY_REQUIRED。");
    await host.updateBlock(prepared.plan.patch.blockUuid, prepared.plan.patch.beforeText);
    const restored = blockEvidence(await host.getBlock(prepared.plan.patch.blockUuid), prepared.plan.patch.blockUuid);
    if (restored.hash !== prepared.plan.patch.beforeHash) throw commitError("V2_PROPOSAL_COMPENSATION_VERIFY_FAILED", "Graph 补偿校验失败；Commit 保持 RECOVERY_REQUIRED。");
    await client.compensateProposalCommit(prepared.proposalId, { semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, expectedUpdatedAt: prepared.expectedUpdatedAt, blockUuid: prepared.plan.patch.blockUuid, contentHash: restored.hash, inputVersion: restored.inputVersion, traceId: `${traceId}:recover` });
    return { status: "FAILED_COMPENSATED", semanticCommitId: prepared.semanticCommitId };
  }
  if (before.hash === prepared.plan.patch.beforeHash) await host.updateBlock(prepared.plan.patch.blockUuid, prepared.plan.patch.afterText);
  else if (before.hash !== prepared.plan.patch.afterHash) throw commitError("V2_PROPOSAL_COMMIT_GRAPH_STALE", "Graph 在准备后再次变化；没有写入。");
  const after = blockEvidence(await host.getBlock(prepared.plan.patch.blockUuid), prepared.plan.patch.blockUuid);
  if (after.hash !== prepared.plan.patch.afterHash) throw commitError("V2_PROPOSAL_COMMIT_GRAPH_VERIFY_FAILED", "Graph Patch 写入后校验失败；未报告 Commit 成功。");
  const evidence = {
    semanticCommitId: prepared.semanticCommitId,
    proposalId: prepared.proposalId,
    expectedUpdatedAt: prepared.expectedUpdatedAt,
    blockUuid: prepared.plan.patch.blockUuid,
    contentHash: after.hash,
    inputVersion: after.inputVersion,
    traceId,
  };
  let finalized;
  try {
    finalized = await client.finalizeProposalCommit(prepared.proposalId, evidence);
  } catch {
    finalized = await client.finalizeProposalCommit(prepared.proposalId, evidence);
  }
  if (finalized.status === "COMPLETED") return { status: "COMPLETED", semanticCommitId: finalized.semanticCommitId, objectId: finalized.object.objectId };
  const current = blockEvidence(await host.getBlock(prepared.plan.patch.blockUuid), prepared.plan.patch.blockUuid);
  if (current.hash !== prepared.plan.patch.afterHash) throw commitError("V2_PROPOSAL_COMPENSATION_BLOCKED_BY_EDIT", "Domain 写入失败且正文已被后续编辑；不会覆盖，Commit 保持 RECOVERY_REQUIRED。");
  await host.updateBlock(prepared.plan.patch.blockUuid, prepared.plan.patch.beforeText);
  const restored = blockEvidence(await host.getBlock(prepared.plan.patch.blockUuid), prepared.plan.patch.blockUuid);
  if (restored.hash !== prepared.plan.patch.beforeHash) throw commitError("V2_PROPOSAL_COMPENSATION_VERIFY_FAILED", "Graph 补偿校验失败；Commit 保持 RECOVERY_REQUIRED。");
  await client.compensateProposalCommit(prepared.proposalId, { ...evidence, contentHash: restored.hash, inputVersion: restored.inputVersion, traceId: `${traceId}:compensate` });
  return { status: "FAILED_COMPENSATED", semanticCommitId: prepared.semanticCommitId };
}

export async function undoV2Formalization(
  client: Pick<ServiceRuntimeClient, "prepareProposalUndo" | "finalizeProposalUndo" | "compensateProposalUndo">,
  host: ProposalMutationGraphHost,
  originalSemanticCommitId: string,
  traceId: string,
): Promise<{ status: "COMPLETED" | "FAILED_COMPENSATED"; undoSemanticCommitId: string; objectId?: string }> {
  const prepared = await client.prepareProposalUndo(originalSemanticCommitId, `${traceId}:prepare`);
  if (prepared.status === "COMPLETED") return { status: "COMPLETED", undoSemanticCommitId: prepared.undoSemanticCommitId, objectId: prepared.objectId };
  const current = blockEvidence(await host.getBlock(prepared.patch.blockUuid), prepared.patch.blockUuid);
  if (prepared.status === "RECOVERY_REQUIRED") {
    if (current.hash !== prepared.patch.beforeHash) throw commitError("V2_PROPOSAL_UNDO_COMPENSATION_BLOCKED_BY_EDIT", "Undo 领域写入失败且正文已被后续编辑；不会覆盖，Commit 保持 RECOVERY_REQUIRED。");
    await host.updateBlock(prepared.patch.blockUuid, prepared.patch.afterText);
    const restored = blockEvidence(await host.getBlock(prepared.patch.blockUuid), prepared.patch.blockUuid);
    if (restored.hash !== prepared.patch.afterHash) throw commitError("V2_PROPOSAL_UNDO_COMPENSATION_VERIFY_FAILED", "Undo 补偿校验失败；Commit 保持 RECOVERY_REQUIRED。");
    await client.compensateProposalUndo(originalSemanticCommitId, {
      originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, blockUuid: prepared.patch.blockUuid,
      contentHash: restored.hash, inputVersion: restored.inputVersion, traceId: `${traceId}:compensate`,
    });
    return { status: "FAILED_COMPENSATED", undoSemanticCommitId: prepared.undoSemanticCommitId };
  }
  if (current.hash === prepared.patch.afterHash) {
    await host.updateBlock(prepared.patch.blockUuid, prepared.patch.beforeText);
  } else if (current.hash !== prepared.patch.beforeHash) {
    throw commitError("V2_PROPOSAL_UNDO_GRAPH_STALE", "正文已不是原 Commit 结果；Undo 没有写入。");
  }
  const after = blockEvidence(await host.getBlock(prepared.patch.blockUuid), prepared.patch.blockUuid);
  if (after.hash !== prepared.patch.beforeHash) throw commitError("V2_PROPOSAL_UNDO_GRAPH_VERIFY_FAILED", "Undo Graph 写入后校验失败；未报告成功。");
  const evidence = {
    originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, blockUuid: prepared.patch.blockUuid,
    contentHash: after.hash, inputVersion: after.inputVersion, traceId,
  };
  let finalized;
  try { finalized = await client.finalizeProposalUndo(originalSemanticCommitId, evidence); }
  catch { finalized = await client.finalizeProposalUndo(originalSemanticCommitId, evidence); }
  if (finalized.status === "COMPLETED") return { status: "COMPLETED", undoSemanticCommitId: finalized.undoSemanticCommitId, objectId: finalized.objectId };
  const compensable = blockEvidence(await host.getBlock(prepared.patch.blockUuid), prepared.patch.blockUuid);
  if (compensable.hash !== prepared.patch.beforeHash) throw commitError("V2_PROPOSAL_UNDO_COMPENSATION_BLOCKED_BY_EDIT", "Undo 领域写入失败且正文已被后续编辑；不会覆盖，Commit 保持 RECOVERY_REQUIRED。");
  await host.updateBlock(prepared.patch.blockUuid, prepared.patch.afterText);
  const restored = blockEvidence(await host.getBlock(prepared.patch.blockUuid), prepared.patch.blockUuid);
  if (restored.hash !== prepared.patch.afterHash) throw commitError("V2_PROPOSAL_UNDO_COMPENSATION_VERIFY_FAILED", "Undo 补偿校验失败；Commit 保持 RECOVERY_REQUIRED。");
  await client.compensateProposalUndo(originalSemanticCommitId, { ...evidence, contentHash: restored.hash, inputVersion: restored.inputVersion, traceId: `${traceId}:compensate` });
  return { status: "FAILED_COMPENSATED", undoSemanticCommitId: prepared.undoSemanticCommitId };
}
