import {
  narrateV2CommitStatus,
  narrateV2ProposalStatus,
  narrateV2SystemStatus,
  type StatusNarration,
} from "@task-copilot/application";
import type {
  ServiceSemanticCommit,
  ServiceStoredProposal,
} from "@task-copilot/service-client";

import type { RuntimeDiagnosticsSnapshot } from "./runtime-diagnostics.ts";

function availableCount(value: number | "unavailable" | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function commitFact(commit: ServiceSemanticCommit) {
  return {
    semanticCommitId: commit.semanticCommitId,
    ...(commit.proposalId ? { proposalId: commit.proposalId } : {}),
    status: commit.status,
    updatedAt: commit.updatedAt,
    ...(commit.errorCode ? { errorCode: commit.errorCode } : {}),
  };
}

export function projectPluginSystemNarration(
  snapshot: RuntimeDiagnosticsSnapshot,
  observedAt = new Date().toISOString(),
): StatusNarration {
  return narrateV2SystemStatus({
    observedAt,
    scene: "BACKGROUND",
    service: {
      status: snapshot.service_connection.status === "READY" ? "READY" : "RESTRICTED",
      formalWritesAvailable: snapshot.service_connection.formal_writes_available,
      storeStatus: snapshot.store_status,
      ...(snapshot.service_connection.reason_code
        ? { reasonCode: snapshot.service_connection.reason_code }
        : {}),
      providerAvailable: snapshot.service_connection.capabilities?.provider === true,
    },
    pendingCommitCount: availableCount(snapshot.pending_semantic_commits),
    recoveryRequiredCommitCount: availableCount(snapshot.recovery_required_commits),
    anchorIssueCount: availableCount(snapshot.source_anchor_conflicts),
    explicitSyncPendingCount: availableCount(snapshot.explicit_sync?.pending),
    explicitSyncReconciliationRequired: snapshot.explicit_sync?.reconciliationRequired === true,
  });
}

export function projectPluginCommitNarration(
  commit: ServiceSemanticCommit,
  observedAt = commit.updatedAt,
): StatusNarration {
  return narrateV2CommitStatus({
    observedAt,
    scene: "REVIEW",
    commit: commitFact(commit),
  });
}

export function projectPluginProposalNarration(
  record: ServiceStoredProposal,
  commits: readonly ServiceSemanticCommit[],
  observedAt = record.updatedAt,
): StatusNarration {
  return narrateV2ProposalStatus({
    observedAt,
    scene: "REVIEW",
    proposal: record.proposal,
    commits: commits
      .filter((commit) => commit.proposalId === record.proposal.proposalId)
      .map(commitFact),
  });
}
