import { checksum, stableJson } from "@task-copilot/shared";

import {
  attentionSignalId,
  type AttentionSignalCandidate,
  type AttentionSignalRecord,
  type AttentionSignalType,
} from "./attention-shadow.ts";

export interface AttentionObjectFact {
  objectId: string;
  objectType: "TASK" | "MINI_PROJECT" | "PROJECT" | "AREA" | "DECISION" | "OUTPUT";
  version: number;
  lifecycle: "OPEN" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
  condition: { kind: "ACTIONABLE" | "WAITING" | "BLOCKED" | "PAUSED"; reviewAt?: string };
  dueAt?: string;
  updatedAt: string;
}

export interface AttentionProposalFact {
  proposalId: string;
  status: "DRAFT" | "READY" | "IN_REVIEW" | "PARTIALLY_ACCEPTED" | "ACCEPTED" | "REJECTED" | "STALE" | "APPLIED" | "FAILED" | "SUPERSEDED";
  acceptedGroupCount: number;
  targetObjectIds: string[];
  updatedAt: string;
}

export interface AttentionCommitFact {
  semanticCommitId: string;
  proposalId?: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED" | "UNDONE";
  objectIds: string[];
  updatedAt: string;
}

export interface AttentionAnchorFact {
  anchorId: string;
  objectId: string;
  status: "active" | "missing" | "conflict" | "replaced";
  observedAt: string;
}

export interface AttentionDetectorSnapshot {
  observedAt: string;
  graph: { graphKey: string; binding: "MATCH" | "MISMATCH" };
  objects: AttentionObjectFact[];
  proposals: AttentionProposalFact[];
  commits: AttentionCommitFact[];
  anchors: AttentionAnchorFact[];
}

export interface AttentionPrimaryIssue {
  subjectRef: string;
  objectId?: string;
  primary: AttentionSignalCandidate;
  suppressedSignalTypes: AttentionSignalType[];
}

export interface AttentionMergeResult {
  rawCount: number;
  mergedCount: number;
  cooledCount: number;
  issues: AttentionPrimaryIssue[];
}

const PRIORITY: Record<AttentionSignalType, number> = {
  GRAPH_MISMATCH: 110,
  COMMIT_RECOVERY_REQUIRED: 105,
  ANCHOR_CONFLICT: 100,
  ANCHOR_MISSING: 95,
  COMMIT_PENDING: 90,
  ACCEPTED_NOT_APPLIED: 80,
  BLOCKER_CHANGED: 70,
  REVIEW_DUE: 60,
  DUE: 50,
  WAITING_STALE: 40,
  LLM_CROSS_OBJECT: 30,
  PROJECT_QUIET: 20,
};

function factHash(value: unknown): string {
  return checksum(stableJson(value));
}

function objectRef(objectId: string, version?: number): string {
  return `object:${objectId}${version === undefined ? "" : `@v${version}`}`;
}

function candidate(input: Omit<AttentionSignalCandidate, "detectedAt" | "proposedDisplay">, detectedAt: string): AttentionSignalCandidate {
  return {
    ...input,
    detectedAt,
    proposedDisplay: { level: "SHADOW", surface: "NONE" },
  };
}

function combineCandidate(
  target: Map<string, AttentionSignalCandidate>,
  value: AttentionSignalCandidate,
): void {
  const key = `${value.signalType}|${value.subjectRef}|${value.mergeTarget}`;
  const existing = target.get(key);
  if (!existing) {
    target.set(key, value);
    return;
  }
  const sourceFacts = [...existing.sourceFacts, ...value.sourceFacts]
    .filter((fact, index, all) => all.findIndex((candidateFact) =>
      candidateFact.factCode === fact.factCode && candidateFact.sourceRef === fact.sourceRef
    ) === index)
    .slice(0, 16);
  const refs = [...new Set([...existing.evidenceScope.refs, ...value.evidenceScope.refs])].sort().slice(0, 32);
  target.set(key, {
    ...existing,
    sourceFacts,
    evidenceScope: {
      ...existing.evidenceScope,
      refs,
      scopeHash: factHash({
        refs,
        facts: sourceFacts.map((fact) => ({
          factCode: fact.factCode,
          sourceRef: fact.sourceRef,
          fingerprint: fact.fingerprint,
        })),
      }),
    },
  });
}

export function detectDeterministicAttentionSignals(
  snapshot: AttentionDetectorSnapshot,
): AttentionSignalCandidate[] {
  if (!Number.isFinite(Date.parse(snapshot.observedAt))) throw new Error("Attention snapshot observedAt is invalid.");
  const at = Date.parse(snapshot.observedAt);
  const result = new Map<string, AttentionSignalCandidate>();

  if (snapshot.graph.binding === "MISMATCH") {
    const sourceRef = `graph:${snapshot.graph.graphKey}`;
    const hash = factHash({ binding: snapshot.graph.binding, graphKey: snapshot.graph.graphKey });
    combineCandidate(result, candidate({
      signalType: "GRAPH_MISMATCH",
      subjectRef: sourceRef,
      evaluationKey: sourceRef,
      sourceFacts: [{ factCode: "GRAPH_BINDING_MISMATCH", sourceRef, observedAt: snapshot.observedAt, fingerprint: hash }],
      urgency: "CRITICAL",
      certainty: "FACT",
      contextRelevance: "HIGH",
      mergeTarget: "system:graph",
      cooldown: { policy: "NEVER" },
      provenance: { rule: { id: "graph-binding-mismatch", version: "1.0.0" } },
      evidenceScope: { kind: "GRAPH", refs: [sourceRef], scopeHash: hash },
    }, snapshot.observedAt));
  }

  for (const object of snapshot.objects) {
    if (object.lifecycle !== "OPEN") continue;
    const sourceRef = objectRef(object.objectId, object.version);
    const evaluationKey = objectRef(object.objectId);
    if (
      object.condition.reviewAt
      && Number.isFinite(Date.parse(object.condition.reviewAt))
      && Date.parse(object.condition.reviewAt) <= at
    ) {
      const hash = factHash({
        kind: object.condition.kind,
        objectId: object.objectId,
        reviewAt: object.condition.reviewAt,
        version: object.version,
      });
      combineCandidate(result, candidate({
        signalType: "REVIEW_DUE",
        subjectRef: evaluationKey,
        objectId: object.objectId,
        evaluationKey,
        sourceFacts: [{
          factCode: "CONDITION_REVIEW_AT_DUE",
          sourceRef,
          observedAt: snapshot.observedAt,
          fingerprint: hash,
        }],
        urgency: "MEDIUM",
        certainty: "FACT",
        contextRelevance: "HIGH",
        mergeTarget: evaluationKey,
        cooldown: { policy: "ELIGIBLE" },
        provenance: { rule: { id: "condition-review-at-due", version: "1.0.0" } },
        evidenceScope: { kind: "OBJECT", refs: [sourceRef], scopeHash: hash },
      }, snapshot.observedAt));
    }
    if (object.dueAt && Number.isFinite(Date.parse(object.dueAt)) && Date.parse(object.dueAt) <= at) {
      const hash = factHash({
        dueAt: object.dueAt,
        objectId: object.objectId,
        version: object.version,
      });
      combineCandidate(result, candidate({
        signalType: "DUE",
        subjectRef: evaluationKey,
        objectId: object.objectId,
        evaluationKey,
        sourceFacts: [{
          factCode: "OBJECT_DUE_AT_REACHED",
          sourceRef,
          observedAt: snapshot.observedAt,
          fingerprint: hash,
        }],
        urgency: "HIGH",
        certainty: "FACT",
        contextRelevance: "HIGH",
        mergeTarget: evaluationKey,
        cooldown: { policy: "ELIGIBLE" },
        provenance: { rule: { id: "object-due-at-reached", version: "1.0.0" } },
        evidenceScope: { kind: "OBJECT", refs: [sourceRef], scopeHash: hash },
      }, snapshot.observedAt));
    }
  }

  const completedProposalIds = new Set(
    snapshot.commits
      .filter((commit) => commit.status === "COMPLETED" && commit.proposalId)
      .map((commit) => commit.proposalId!),
  );
  for (const proposal of snapshot.proposals) {
    if (
      !["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(proposal.status)
      || proposal.acceptedGroupCount < 1
      || completedProposalIds.has(proposal.proposalId)
    ) continue;
    const objectIds: Array<string | undefined> = proposal.targetObjectIds.length
      ? [...new Set(proposal.targetObjectIds)]
      : [undefined];
    for (const objectId of objectIds) {
      const sourceRef = `proposal:${proposal.proposalId}`;
      const evaluationKey = objectId ? objectRef(objectId) : sourceRef;
      const hash = factHash({
        acceptedGroupCount: proposal.acceptedGroupCount,
        objectId,
        proposalId: proposal.proposalId,
        status: proposal.status,
        updatedAt: proposal.updatedAt,
      });
      combineCandidate(result, candidate({
        signalType: "ACCEPTED_NOT_APPLIED",
        subjectRef: evaluationKey,
        ...(objectId ? { objectId } : {}),
        evaluationKey,
        sourceFacts: [{
          factCode: "PROPOSAL_ACCEPTED_NOT_APPLIED",
          sourceRef,
          observedAt: snapshot.observedAt,
          fingerprint: hash,
        }],
        urgency: "HIGH",
        certainty: "FACT",
        contextRelevance: "HIGH",
        mergeTarget: evaluationKey,
        cooldown: { policy: "ELIGIBLE" },
        provenance: { rule: { id: "proposal-accepted-not-applied", version: "1.0.0" } },
        evidenceScope: { kind: objectId ? "OBJECT" : "PROPOSAL", refs: [sourceRef, evaluationKey], scopeHash: hash },
      }, snapshot.observedAt));
    }
  }

  for (const commit of snapshot.commits) {
    if (commit.status !== "PENDING" && commit.status !== "RECOVERY_REQUIRED") continue;
    const signalType = commit.status === "RECOVERY_REQUIRED"
      ? "COMMIT_RECOVERY_REQUIRED"
      : "COMMIT_PENDING";
    const objectIds: Array<string | undefined> = commit.objectIds.length
      ? [...new Set(commit.objectIds)]
      : [undefined];
    for (const objectId of objectIds) {
      const sourceRef = `commit:${commit.semanticCommitId}`;
      const evaluationKey = objectId ? objectRef(objectId) : sourceRef;
      const hash = factHash({
        commitId: commit.semanticCommitId,
        objectId,
        status: commit.status,
        updatedAt: commit.updatedAt,
      });
      combineCandidate(result, candidate({
        signalType,
        subjectRef: evaluationKey,
        ...(objectId ? { objectId } : {}),
        evaluationKey,
        sourceFacts: [{
          factCode: commit.status === "RECOVERY_REQUIRED" ? "SEMANTIC_COMMIT_RECOVERY_REQUIRED" : "SEMANTIC_COMMIT_PENDING",
          sourceRef,
          observedAt: snapshot.observedAt,
          fingerprint: hash,
        }],
        urgency: commit.status === "RECOVERY_REQUIRED" ? "CRITICAL" : "HIGH",
        certainty: "FACT",
        contextRelevance: "HIGH",
        mergeTarget: evaluationKey,
        cooldown: { policy: "NEVER" },
        provenance: { rule: { id: "semantic-commit-state", version: "1.0.0" } },
        evidenceScope: { kind: "COMMIT", refs: [sourceRef, evaluationKey], scopeHash: hash },
      }, snapshot.observedAt));
    }
  }

  for (const anchor of snapshot.anchors) {
    if (anchor.status !== "missing" && anchor.status !== "conflict") continue;
    const sourceRef = `anchor:${anchor.anchorId}`;
    const evaluationKey = objectRef(anchor.objectId);
    const hash = factHash({
      anchorId: anchor.anchorId,
      objectId: anchor.objectId,
      observedAt: anchor.observedAt,
      status: anchor.status,
    });
    combineCandidate(result, candidate({
      signalType: anchor.status === "conflict" ? "ANCHOR_CONFLICT" : "ANCHOR_MISSING",
      subjectRef: evaluationKey,
      objectId: anchor.objectId,
      evaluationKey,
      sourceFacts: [{
        factCode: anchor.status === "conflict" ? "PRIMARY_ANCHOR_CONFLICT" : "PRIMARY_ANCHOR_MISSING",
        sourceRef,
        observedAt: snapshot.observedAt,
        fingerprint: hash,
      }],
      urgency: anchor.status === "conflict" ? "CRITICAL" : "HIGH",
      certainty: "FACT",
      contextRelevance: "HIGH",
      mergeTarget: evaluationKey,
      cooldown: { policy: "NEVER" },
      provenance: { rule: { id: "primary-anchor-state", version: "1.0.0" } },
      evidenceScope: { kind: "OBJECT", refs: [sourceRef, evaluationKey], scopeHash: hash },
    }, snapshot.observedAt));
  }

  return [...result.values()].sort((left, right) =>
    left.subjectRef.localeCompare(right.subjectRef)
    || PRIORITY[right.signalType] - PRIORITY[left.signalType]
    || left.signalType.localeCompare(right.signalType)
  );
}

export function mergeDeterministicAttentionSignals(
  candidates: readonly AttentionSignalCandidate[],
  records: readonly AttentionSignalRecord[],
  at: string,
): AttentionMergeResult {
  if (!Number.isFinite(Date.parse(at))) throw new Error("Attention merge timestamp is invalid.");
  const atTime = Date.parse(at);
  const byId = new Map(records.map((record) => [record.signalId, record]));
  let cooledCount = 0;
  const eligible = candidates.filter((value) => {
    const record = byId.get(attentionSignalId(value));
    if (
      record?.invalidation.state === "ACTIVE"
      && record.cooldown.policy === "ELIGIBLE"
      && record.cooldown.until
      && Date.parse(record.cooldown.until) > atTime
    ) {
      cooledCount += 1;
      return false;
    }
    return true;
  });
  const bySubject = new Map<string, AttentionSignalCandidate[]>();
  for (const value of eligible) {
    const values = bySubject.get(value.mergeTarget) ?? [];
    values.push(value);
    bySubject.set(value.mergeTarget, values);
  }
  const issues = [...bySubject.entries()].map(([subjectRef, values]) => {
    const ordered = [...values].sort((left, right) =>
      PRIORITY[right.signalType] - PRIORITY[left.signalType]
      || left.signalType.localeCompare(right.signalType)
      || left.evidenceScope.scopeHash.localeCompare(right.evidenceScope.scopeHash)
    );
    return {
      subjectRef,
      ...(ordered[0]?.objectId ? { objectId: ordered[0].objectId } : {}),
      primary: ordered[0]!,
      suppressedSignalTypes: ordered.slice(1).map((value) => value.signalType),
    };
  }).sort((left, right) => left.subjectRef.localeCompare(right.subjectRef));
  return {
    rawCount: candidates.length,
    mergedCount: issues.length,
    cooledCount,
    issues,
  };
}
