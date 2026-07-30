import {
  AttentionShadowRepository,
  attentionSignalId,
  detectDeterministicAttentionSignals,
  mergeDeterministicAttentionSignals,
  projectV2DynamicNowShadow,
  type AttentionDetectorSnapshot,
  type AttentionSignalCandidate,
  type AttentionSignalType,
  type CrossObjectObservationDraft,
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
  crossObjectObservations?: readonly CrossObjectObservationDraft[];
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

export interface AttentionNowPilotHint {
  signalId: string;
  objectId: string;
  signalType: "REVIEW_DUE" | "DUE";
}

export type AttentionNowPilotDisposition = "LATER" | "NOT_RELEVANT";

export interface AttentionNowPilotDispositionResult {
  signalType: AttentionNowPilotHint["signalType"];
  disposition: AttentionNowPilotDisposition;
  cooldownUntil: string;
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
    ...(input.crossObjectObservations
      ? {
          crossObjectObservations: input.crossObjectObservations.map((observation) => ({
            ...observation,
            subjectRefs: [...observation.subjectRefs],
            scope: { ...observation.scope },
            evidenceFacts: observation.evidenceFacts.map((fact) => ({ ...fact })),
            provenance: {
              skill: { ...observation.provenance.skill },
              prompt: { ...observation.provenance.prompt },
              model: { ...observation.provenance.model },
            },
          })),
        }
      : {}),
  };
}

function reconcileAttentionShadowCycle(
  repository: AttentionShadowRepository,
  snapshot: AttentionDetectorSnapshot,
): { candidates: AttentionSignalCandidate[]; summary: AttentionShadowCycleSummary } {
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
    candidates,
    summary: {
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
    },
  };
}

export function runAttentionShadowCycle(
  repository: AttentionShadowRepository,
  snapshot: AttentionDetectorSnapshot,
): AttentionShadowCycleSummary {
  return reconcileAttentionShadowCycle(repository, snapshot).summary;
}

export class AttentionShadowSession {
  private readonly repository = new AttentionShadowRepository({ maxRecords: 512 });
  private candidates: AttentionSignalCandidate[] = [];

  run(snapshot: AttentionDetectorSnapshot): AttentionShadowCycleSummary {
    const result = reconcileAttentionShadowCycle(this.repository, snapshot);
    this.candidates = result.candidates;
    return result.summary;
  }

  projectNowPilot(input: { observedAt: string; visibleObjectIds: readonly string[] }): AttentionNowPilotHint[] {
    const visible = new Set(input.visibleObjectIds);
    const records = this.repository.list();
    const byId = new Map(records.map((record) => [record.signalId, record]));
    return mergeDeterministicAttentionSignals(this.candidates, records, input.observedAt).issues
      .filter((issue): issue is typeof issue & {
        objectId: string;
        primary: AttentionSignalCandidate & { signalType: "REVIEW_DUE" | "DUE" };
      } => {
        if (!issue.objectId || !visible.has(issue.objectId)) return false;
        return issue.primary.signalType === "REVIEW_DUE" || issue.primary.signalType === "DUE";
      })
      .map((issue) => {
        const signalId = attentionSignalId(issue.primary);
        const record = byId.get(signalId);
        if (record && record.shownCount === 0) this.repository.markShown(signalId, input.observedAt);
        return { signalId, objectId: issue.objectId, signalType: issue.primary.signalType };
      });
  }

  applyNowPilotDisposition(input: {
    signalId: string;
    disposition: AttentionNowPilotDisposition;
    recordedAt: string;
  }): AttentionNowPilotDispositionResult {
    const record = this.repository.get(input.signalId);
    if (
      !record
      || record.invalidation.state !== "ACTIVE"
      || (record.signalType !== "REVIEW_DUE" && record.signalType !== "DUE")
    ) {
      throw new Error("This Attention reminder is unavailable or not eligible for the Now pilot.");
    }
    const recordedAt = Date.parse(input.recordedAt);
    if (!Number.isFinite(recordedAt)) throw new Error("Attention pilot disposition timestamp is invalid.");
    const cooldownMs = input.disposition === "LATER" ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
    const cooldownUntil = new Date(recordedAt + cooldownMs).toISOString();
    this.repository.setDisposition(
      input.signalId,
      input.disposition === "LATER" ? "DISMISSED" : "INACCURATE",
      input.recordedAt,
    );
    this.repository.setCooldown(input.signalId, cooldownUntil);
    return { signalType: record.signalType, disposition: input.disposition, cooldownUntil };
  }

  clear(): void {
    this.repository.clear();
    this.candidates = [];
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
