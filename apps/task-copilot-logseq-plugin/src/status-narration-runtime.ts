import {
  narrateV2AnchorStatus,
  narrateV2CommitStatus,
  narrateV2ObjectStatus,
  narrateV2ProposalStatus,
  narrateV2SystemStatus,
  type StatusNarration,
} from "@task-copilot/application";
import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";
import type {
  ServiceSemanticCommit,
  ServiceStoredProposal,
} from "@task-copilot/service-client";

import type { RuntimeDiagnosticsSnapshot } from "./runtime-diagnostics.ts";

export interface PluginObjectNarration {
  objectVersion: number;
  narration: StatusNarration;
}

export interface PluginAnchorIssueNarration {
  objectText?: string;
  conclusion: string;
  keyEvidence: string[];
  unknowns: string[];
  nextActionEligible: boolean;
  nextActionLabel?: string;
  narrationRuleId: string;
}

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

export function projectPluginObjectNarrations(
  objects: readonly V2ManagedObject[],
  observedAt: string,
): Record<string, PluginObjectNarration> {
  const byId = new Map<string, V2ManagedObject>();
  for (const object of objects) {
    if (byId.has(object.objectId)) {
      throw new Error("Duplicate Object identity in status narration projection.");
    }
    byId.set(object.objectId, object);
  }
  return Object.fromEntries(objects.map((object) => {
    const blocker = object.condition.kind === "BLOCKED" && object.condition.blockerObjectId
      ? byId.get(object.condition.blockerObjectId)
      : undefined;
    return [object.objectId, {
      objectVersion: object.version,
      narration: narrateV2ObjectStatus({
        observedAt,
        scene: "NOW",
        object,
        ...(blocker ? { blocker } : {}),
      }),
    }];
  }));
}

export function projectPluginAnchorIssueNarrations(
  objects: readonly V2ManagedObject[],
  anchors: readonly V2Anchor[],
  observedAt: string,
): PluginAnchorIssueNarration[] {
  const objectsById = new Map<string, V2ManagedObject>();
  for (const object of objects) {
    if (objectsById.has(object.objectId)) {
      throw new Error("Duplicate Object identity in Anchor narration projection.");
    }
    objectsById.set(object.objectId, object);
  }
  const anchorIds = new Set<string>();
  for (const anchor of anchors) {
    if (anchorIds.has(anchor.anchorId)) {
      throw new Error("Duplicate Anchor identity in status narration projection.");
    }
    anchorIds.add(anchor.anchorId);
  }

  return anchors
    .filter((anchor) => anchor.status === "missing" || anchor.status === "conflict")
    .map((anchor) => {
      const object = objectsById.get(anchor.objectId);
      const narration = narrateV2AnchorStatus({
        observedAt,
        scene: "OBJECT",
        anchor,
        ...(object ? { object } : {}),
      });
      return {
        ...(object ? { objectText: object.text } : {}),
        conclusion: narration.conclusion,
        keyEvidence: narration.keyEvidence,
        unknowns: narration.unknowns,
        nextActionEligible: narration.nextActionEligible,
        ...(narration.nextAction?.intent === "OPEN_ANCHOR_REPAIR"
          ? { nextActionLabel: narration.nextAction.label }
          : {}),
        narrationRuleId: narration.source.ruleId,
      };
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
