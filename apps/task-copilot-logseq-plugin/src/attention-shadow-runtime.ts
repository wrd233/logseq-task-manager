import {
  AttentionShadowRepository,
  detectDeterministicAttentionSignals,
  mergeDeterministicAttentionSignals,
  projectV2DynamicNowShadow,
  type AttentionDetectorSnapshot,
  type AttentionSignalType,
} from "@task-copilot/application";
import type { V2Anchor, V2ManagedObject, V2Proposal } from "@task-copilot/domain";
import type { ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";

export interface AttentionRuntimeProjectionInput {
  observedAt: string;
  graphKey: string;
  graphBinding: "MATCH" | "MISMATCH";
  objects: readonly V2ManagedObject[];
  proposals: readonly ServiceStoredProposal[];
  commits: readonly ServiceSemanticCommit[];
  anchors: readonly V2Anchor[];
}

export interface AttentionShadowCycleSummary {
  observedAt: string;
  rawCount: number;
  mergedCount: number;
  cooledCount: number;
  activeCount: number;
  invalidatedCurrentCount: number;
  detectedTotal: number;
  confirmedTotal: number;
  invalidatedTotal: number;
  evidenceChangedTotal: number;
  primaryByType: Partial<Record<AttentionSignalType, number>>;
  suppressedByType: Partial<Record<AttentionSignalType, number>>;
}

export interface DynamicNowShadowRuntimeSummary {
  continueCount: number;
  reviewCount: number;
  waitingCount: number;
  suggestionCount: number;
  suppressedOpenCount: number;
  reviewOverflowCount: number;
  waitingOverflowCount: number;
  focusOverload: boolean;
}

function proposalTargetObjectIds(proposal: V2Proposal): string[] {
  const objectIds = new Set<string>();
  for (const target of proposal.scope.modify) {
    if (target.kind === "OBJECT") objectIds.add(target.id);
  }
  for (const group of proposal.groups) {
    for (const operation of group.semanticOperations) {
      if (operation.target.kind === "OBJECT") objectIds.add(operation.target.id);
    }
  }
  return [...objectIds].sort();
}

function countTypes(types: readonly AttentionSignalType[]): Partial<Record<AttentionSignalType, number>> {
  const counts: Partial<Record<AttentionSignalType, number>> = {};
  for (const type of types) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
}

export function buildAttentionDetectorSnapshot(
  input: AttentionRuntimeProjectionInput,
): AttentionDetectorSnapshot {
  const proposalObjectIds = new Map(
    input.proposals.map((record) => [
      record.proposal.proposalId,
      proposalTargetObjectIds(record.proposal),
    ]),
  );
  return {
    observedAt: input.observedAt,
    graph: {
      graphKey: input.graphKey,
      binding: input.graphBinding,
    },
    objects: input.objects.map((object) => ({
      objectId: object.objectId,
      objectType: object.objectType,
      version: object.version,
      lifecycle: object.lifecycle,
      condition: {
        kind: object.condition.kind,
        ...("reviewAt" in object.condition && object.condition.reviewAt
          ? { reviewAt: object.condition.reviewAt }
          : {}),
      },
      ...(object.dueAt ? { dueAt: object.dueAt } : {}),
      updatedAt: object.updatedAt,
    })),
    proposals: input.proposals.map((record) => ({
      proposalId: record.proposal.proposalId,
      status: record.proposal.status,
      acceptedGroupCount: record.proposal.groups.filter((group) => group.disposition === "ACCEPTED").length,
      targetObjectIds: proposalObjectIds.get(record.proposal.proposalId) ?? [],
      updatedAt: record.updatedAt,
    })),
    commits: input.commits.map((commit) => ({
      semanticCommitId: commit.semanticCommitId,
      ...(commit.proposalId ? { proposalId: commit.proposalId } : {}),
      status: commit.status,
      objectIds: commit.proposalId ? proposalObjectIds.get(commit.proposalId) ?? [] : [],
      updatedAt: commit.updatedAt,
    })),
    anchors: input.anchors
      .filter((anchor) => anchor.role === "primary_text")
      .map((anchor) => ({
        anchorId: anchor.anchorId,
        objectId: anchor.objectId,
        status: anchor.status,
        observedAt: anchor.lastSeenAt,
      })),
  };
}

export function runAttentionShadowCycle(
  repository: AttentionShadowRepository,
  snapshot: AttentionDetectorSnapshot,
): AttentionShadowCycleSummary {
  const candidates = detectDeterministicAttentionSignals(snapshot);
  if (candidates.length > 512) {
    throw new Error("Attention shadow cycle exceeded its 512-candidate processing bound.");
  }
  const evaluationKeys = new Set([
    ...repository.list().map((record) => record.evaluationKey),
    ...candidates.map((candidate) => candidate.evaluationKey),
  ]);
  for (const evaluationKey of [...evaluationKeys].sort()) {
    repository.reconcile(
      evaluationKey,
      candidates.filter((candidate) => candidate.evaluationKey === evaluationKey),
      snapshot.observedAt,
    );
  }
  const merged = mergeDeterministicAttentionSignals(candidates, repository.list(), snapshot.observedAt);
  const metrics = repository.metrics();
  return {
    observedAt: snapshot.observedAt,
    rawCount: merged.rawCount,
    mergedCount: merged.mergedCount,
    cooledCount: merged.cooledCount,
    activeCount: metrics.active,
    invalidatedCurrentCount: metrics.invalidatedCurrent,
    detectedTotal: metrics.detected,
    confirmedTotal: metrics.confirmed,
    invalidatedTotal: metrics.invalidated,
    evidenceChangedTotal: metrics.evidenceChanged,
    primaryByType: countTypes(merged.issues.map((issue) => issue.primary.signalType)),
    suppressedByType: countTypes(merged.issues.flatMap((issue) => issue.suppressedSignalTypes)),
  };
}

export class AttentionShadowSession {
  private readonly repository = new AttentionShadowRepository({ maxRecords: 512 });

  run(snapshot: AttentionDetectorSnapshot): AttentionShadowCycleSummary {
    return runAttentionShadowCycle(this.repository, snapshot);
  }

  clear(): void {
    this.repository.clear();
  }
}

export function summarizeDynamicNowShadow(input: {
  observedAt: string;
  objects: readonly V2ManagedObject[];
  activeFocusObjectIds: readonly string[];
}): DynamicNowShadowRuntimeSummary {
  const projection = projectV2DynamicNowShadow({
    observedAt: input.observedAt,
    objects: input.objects,
    focus: input.activeFocusObjectIds.map((objectId, rank) => ({
      objectId,
      rank,
      selectedAt: input.observedAt,
    })),
  });
  return {
    continueCount: projection.continueProcessing.length,
    reviewCount: projection.needsReview.length,
    waitingCount: projection.keepWaiting.length,
    suggestionCount: projection.suggestedAttention.length,
    suppressedOpenCount: projection.metrics.suppressedOpenCount,
    reviewOverflowCount: projection.metrics.reviewOverflowCount,
    waitingOverflowCount: projection.metrics.waitingOverflowCount,
    focusOverload: projection.metrics.focusOverload,
  };
}

export function attentionShadowCurrentSignature(
  summary: AttentionShadowCycleSummary,
  dynamicNow?: DynamicNowShadowRuntimeSummary,
): string {
  return JSON.stringify({
    rawCount: summary.rawCount,
    mergedCount: summary.mergedCount,
    cooledCount: summary.cooledCount,
    activeCount: summary.activeCount,
    invalidatedCurrentCount: summary.invalidatedCurrentCount,
    primaryByType: summary.primaryByType,
    suppressedByType: summary.suppressedByType,
    ...(dynamicNow ? { dynamicNow } : {}),
  });
}
