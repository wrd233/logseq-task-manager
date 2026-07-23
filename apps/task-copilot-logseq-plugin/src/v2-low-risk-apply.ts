import { planAcceptedV2ProposalCommit } from "@task-copilot/application";
import { reviewV2ProposalGroups, type V2ProposalStaleIssue } from "@task-copilot/domain";
import type { ServiceStoredProposal } from "@task-copilot/service-client";

import type { ServiceRuntimeClient } from "./service-connection.ts";
import { commitV2Formalization, type ProposalCommitGraphHost } from "./v2-proposal-commit.ts";
import { collectV2ProposalGraphObservations } from "./v2-proposal-revalidation.ts";

export type LowRiskApplyEligibility =
  | { eligible: true; groupId: string }
  | { eligible: false; reason: string };

type LowRiskApplyClient = Pick<ServiceRuntimeClient,
  "reviewProposal" | "revalidateProposal" | "prepareProposalCommit" | "finalizeProposalCommit" | "compensateProposalCommit"
>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rejected(reason: string): LowRiskApplyEligibility {
  return { eligible: false, reason };
}

function acceptedLowRiskRecord(record: ServiceStoredProposal, groupId: string): ServiceStoredProposal | undefined {
  try {
    return {
      ...record,
      proposal: reviewV2ProposalGroups(record.proposal, { [groupId]: { disposition: "ACCEPTED" } }),
    };
  } catch {
    return undefined;
  }
}

function validateLowRiskShape(record: ServiceStoredProposal, disposition: "PENDING" | "ACCEPTED"): LowRiskApplyEligibility {
  const { proposal } = record;
  if (proposal.unresolvedQuestions.length > 0) return rejected("Proposal 仍有未解决问题。");
  if (proposal.groups.length !== 1) return rejected("一键应用只支持唯一语义组。");
  const group = proposal.groups[0]!;
  if (group.disposition !== disposition) return rejected("语义组不在可连续处理的状态。");
  if (group.risk !== "LOW" || !group.independentlyAcceptable || group.dependencies.length > 0) return rejected("语义组不是独立 LOW 风险变更。");
  if (group.textPatches.length !== 1 || group.semanticOperations.length !== 1) return rejected("一键应用只支持一个 Block Patch 与一个语义操作。");
  const operation = group.semanticOperations[0]!;
  if (operation.kind !== "CREATE_OBJECT" && operation.kind !== "REWRITE_BLOCK") return rejected("语义操作不在单 Block 白名单。");
  const accepted = disposition === "ACCEPTED" ? record : acceptedLowRiskRecord(record, group.groupId);
  if (!accepted) return rejected("Proposal 无法进入单组接受状态。");
  try {
    const plan = planAcceptedV2ProposalCommit(accepted.proposal);
    const modifiedBlocks = proposal.scope.modify.filter((target) => target.kind === "BLOCK");
    const modifiedObjects = proposal.scope.modify.filter((target) => target.kind === "OBJECT");
    const otherModified = proposal.scope.modify.filter((target) => target.kind !== "BLOCK" && target.kind !== "OBJECT");
    if (otherModified.length > 0 || modifiedBlocks.length !== 1 || modifiedBlocks[0]!.id !== plan.patch.blockUuid) return rejected("修改 scope 不是唯一目标 Block。");
    if ("create" in plan && modifiedObjects.length !== 0) return rejected("创建对象 Proposal 不能同时修改既有对象。");
    if ("update" in plan && (modifiedObjects.length !== 1 || modifiedObjects[0]!.id !== plan.update.objectId)) return rejected("正文更新必须只绑定一个带版本对象。");
  } catch {
    return rejected("Proposal 不满足既有可提交与 Undo 约束。");
  }
  return { eligible: true, groupId: group.groupId };
}

export function lowRiskApplyEligibility(record: ServiceStoredProposal): LowRiskApplyEligibility {
  if (record.proposal.status !== "READY") return rejected("Proposal 不是 READY。");
  return validateLowRiskShape(record, "PENDING");
}

function acceptedLowRiskEligibility(record: ServiceStoredProposal): LowRiskApplyEligibility {
  if (record.proposal.status !== "ACCEPTED") return rejected("接受后 Proposal 状态异常。");
  return validateLowRiskShape(record, "ACCEPTED");
}

export async function applyLowRiskV2Proposal(
  client: LowRiskApplyClient,
  host: ProposalCommitGraphHost,
  record: ServiceStoredProposal,
  traceId: string,
): Promise<
  | { status: "COMPLETED"; semanticCommitId?: string; objectId?: string }
  | { status: "STALE"; issues?: V2ProposalStaleIssue[] }
  | { status: "FAILED_COMPENSATED"; semanticCommitId?: string }
> {
  const eligible = lowRiskApplyEligibility(record);
  if (!eligible.eligible) throw new Error(`当前 Proposal 不可一键应用：${eligible.reason}`);
  let reviewed: ServiceStoredProposal;
  try {
    reviewed = await client.reviewProposal(
      record.proposal.proposalId,
      { [eligible.groupId]: { disposition: "ACCEPTED" } },
      record.updatedAt,
    );
  } catch (error) {
    throw new Error(`接受请求的结果未知；不会自动重试或创建第二个 Commit。请刷新审阅队列后继续：${errorMessage(error)}`, { cause: error });
  }
  try {
    const reviewedEligibility = acceptedLowRiskEligibility(reviewed);
    if (!reviewedEligibility.eligible) throw new Error(`Proposal 接受后已不满足 LOW 风险白名单：${reviewedEligibility.reason}`);
    if (reviewedEligibility.groupId !== eligible.groupId) throw new Error("Proposal 接受后的语义组已变化。");
    const observations = await collectV2ProposalGraphObservations(reviewed.proposal, host);
    const revalidated = await client.revalidateProposal(reviewed.proposal.proposalId, observations, reviewed.updatedAt);
    if (revalidated.result.status === "STALE") return { status: "STALE", issues: revalidated.result.issues };
    const finalEligibility = acceptedLowRiskEligibility(revalidated.record);
    if (!finalEligibility.eligible) throw new Error(`Proposal 重验后已不满足 LOW 风险白名单：${finalEligibility.reason}`);
    if (finalEligibility.groupId !== eligible.groupId) throw new Error("Proposal 重验后的语义组已变化。");
    return await commitV2Formalization(client, host, revalidated.record, traceId);
  } catch (error) {
    throw new Error(`${errorMessage(error)} Proposal 已接受，但尚未报告正式应用；请刷新卡片并按恢复状态继续，系统不会自动创建第二个 Commit。`, { cause: error });
  }
}
