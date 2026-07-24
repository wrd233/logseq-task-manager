import { checksum, stableJson } from "@task-copilot/shared";

export type AttentionSignalType =
  | "REVIEW_DUE"
  | "DUE"
  | "ACCEPTED_NOT_APPLIED"
  | "COMMIT_PENDING"
  | "COMMIT_RECOVERY_REQUIRED"
  | "ANCHOR_MISSING"
  | "ANCHOR_CONFLICT"
  | "BLOCKER_CHANGED"
  | "WAITING_STALE"
  | "PROJECT_QUIET"
  | "LLM_CROSS_OBJECT";

export type AttentionUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AttentionCertainty = "FACT" | "INFERENCE" | "UNKNOWN";
export type AttentionContextRelevance = "LOW" | "MEDIUM" | "HIGH";
export type AttentionDisplayLevel = "SHADOW" | "PASSIVE" | "VISIBLE" | "INTERRUPTIVE";
export type AttentionSurface = "NONE" | "NOW" | "TOOLBAR" | "BLOCK" | "REVIEW";
export type AttentionUserDispositionKind = "UNSEEN" | "DISMISSED" | "INACCURATE" | "ACTED";

export interface AttentionFactReference {
  factCode: string;
  sourceRef: string;
  observedAt: string;
  fingerprint: string;
}

export interface AttentionSourceEventReference {
  eventType: string;
  eventRef: string;
  occurredAt: string;
}

export interface AttentionEvidenceScope {
  kind: "OBJECT" | "PROJECT" | "COMMIT" | "GRAPH";
  refs: string[];
  scopeHash: string;
}

export interface AttentionProvenance {
  rule: { id: string; version: string };
  skill?: { id: string; version: string };
  prompt?: { id: string; version: string };
  model?: { provider: string; id: string; version: string };
}

export interface AttentionSignalCandidate {
  signalType: AttentionSignalType;
  objectId: string;
  evaluationKey: string;
  detectedAt: string;
  sourceFacts: AttentionFactReference[];
  sourceEvent?: AttentionSourceEventReference;
  urgency: AttentionUrgency;
  certainty: AttentionCertainty;
  contextRelevance: AttentionContextRelevance;
  proposedDisplay: { level: AttentionDisplayLevel; surface: AttentionSurface };
  mergeTarget: string;
  cooldown: { policy: "ELIGIBLE" | "NEVER"; until?: string };
  provenance: AttentionProvenance;
  evidenceScope: AttentionEvidenceScope;
}

export interface AttentionSignalRecord extends AttentionSignalCandidate {
  signalId: string;
  firstDetectedAt: string;
  lastConfirmedAt: string;
  invalidation:
    | { state: "ACTIVE" }
    | { state: "INVALIDATED"; reasonCode: "FACT_NOT_CONFIRMED"; invalidatedAt: string };
  shownCount: number;
  lastShownAt?: string;
  userDisposition:
    | { kind: "UNSEEN" }
    | { kind: Exclude<AttentionUserDispositionKind, "UNSEEN">; recordedAt: string };
}

export interface AttentionShadowMetrics {
  active: number;
  invalidatedCurrent: number;
  detected: number;
  confirmed: number;
  invalidated: number;
  evidenceChanged: number;
  pruned: number;
  cleared: number;
  capacityRejected: number;
}

const SAFE_IDENTIFIER = /^[^\s]{1,256}$/u;
const SAFE_REFERENCE = /^[a-z][a-z0-9_-]{0,31}:[^\s]{1,223}$/u;
const SAFE_CODE = /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function requireTimestamp(value: string, field: string): void {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO timestamp.`);
}

function requireReference(value: string, field: string): void {
  if (!SAFE_REFERENCE.test(value)) throw new Error(`${field} must be one bounded kind-prefixed opaque reference without whitespace.`);
}

function requireIdentifier(value: string, field: string): void {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`${field} must be one bounded identifier without whitespace.`);
}

function requireCode(value: string, field: string): void {
  if (!SAFE_CODE.test(value)) throw new Error(`${field} must be a bounded machine code.`);
}

function requireVersion(value: string, field: string): void {
  if (!SAFE_VERSION.test(value)) throw new Error(`${field} must be a bounded version identifier.`);
}

function requireHash(value: string, field: string): void {
  if (!SHA256.test(value)) throw new Error(`${field} must be one lowercase SHA-256 digest.`);
}

function signalId(candidate: AttentionSignalCandidate): string {
  return `attention_${checksum(stableJson({
    evaluationKey: candidate.evaluationKey,
    mergeTarget: candidate.mergeTarget,
    objectId: candidate.objectId,
    signalType: candidate.signalType,
  })).slice(0, 24)}`;
}

function validateCandidate(candidate: AttentionSignalCandidate, evaluationKey: string): void {
  if (candidate.evaluationKey !== evaluationKey) throw new Error("Attention candidate evaluationKey does not match this reconciliation.");
  requireIdentifier(candidate.objectId, "objectId");
  requireReference(candidate.evaluationKey, "evaluationKey");
  requireReference(candidate.mergeTarget, "mergeTarget");
  requireTimestamp(candidate.detectedAt, "detectedAt");
  if (candidate.proposedDisplay.level !== "SHADOW" || candidate.proposedDisplay.surface !== "NONE") {
    throw new Error("Attention shadow repository accepts only SHADOW / NONE display candidates.");
  }
  if (candidate.sourceFacts.length === 0 || candidate.sourceFacts.length > 16) {
    throw new Error("sourceFacts must contain 1..16 structured references.");
  }
  for (const fact of candidate.sourceFacts) {
    requireCode(fact.factCode, "factCode");
    requireReference(fact.sourceRef, "sourceRef");
    requireTimestamp(fact.observedAt, "observedAt");
    requireHash(fact.fingerprint, "fingerprint");
  }
  if (candidate.sourceEvent) {
    requireCode(candidate.sourceEvent.eventType, "eventType");
    requireReference(candidate.sourceEvent.eventRef, "eventRef");
    requireTimestamp(candidate.sourceEvent.occurredAt, "occurredAt");
  }
  if (candidate.cooldown.policy === "NEVER" && candidate.cooldown.until) {
    throw new Error("A non-coolable attention signal cannot carry a cooldown timestamp.");
  }
  if (candidate.cooldown.until) requireTimestamp(candidate.cooldown.until, "cooldown.until");
  requireCode(candidate.provenance.rule.id.toUpperCase(), "rule.id");
  requireVersion(candidate.provenance.rule.version, "rule.version");
  for (const [kind, value] of [
    ["skill", candidate.provenance.skill],
    ["prompt", candidate.provenance.prompt],
  ] as const) {
    if (!value) continue;
    requireIdentifier(value.id, `${kind}.id`);
    requireVersion(value.version, `${kind}.version`);
  }
  if (candidate.provenance.model) {
    requireIdentifier(candidate.provenance.model.provider, "model.provider");
    requireIdentifier(candidate.provenance.model.id, "model.id");
    requireVersion(candidate.provenance.model.version, "model.version");
  }
  if (candidate.evidenceScope.refs.length === 0 || candidate.evidenceScope.refs.length > 32) {
    throw new Error("evidenceScope.refs must contain 1..32 bounded references.");
  }
  for (const ref of candidate.evidenceScope.refs) requireReference(ref, "evidenceScope.ref");
  requireHash(candidate.evidenceScope.scopeHash, "evidenceScope.scopeHash");
}

function cloneRecord(record: AttentionSignalRecord): AttentionSignalRecord {
  return {
    ...record,
    sourceFacts: record.sourceFacts.map((fact) => ({ ...fact })),
    ...(record.sourceEvent ? { sourceEvent: { ...record.sourceEvent } } : {}),
    proposedDisplay: { ...record.proposedDisplay },
    cooldown: { ...record.cooldown },
    provenance: {
      rule: { ...record.provenance.rule },
      ...(record.provenance.skill ? { skill: { ...record.provenance.skill } } : {}),
      ...(record.provenance.prompt ? { prompt: { ...record.provenance.prompt } } : {}),
      ...(record.provenance.model ? { model: { ...record.provenance.model } } : {}),
    },
    evidenceScope: { ...record.evidenceScope, refs: [...record.evidenceScope.refs] },
    invalidation: { ...record.invalidation },
    userDisposition: { ...record.userDisposition },
  };
}

export class AttentionShadowRepository {
  private readonly records = new Map<string, AttentionSignalRecord>();
  private readonly maxRecords: number;
  private counters = {
    detected: 0,
    confirmed: 0,
    invalidated: 0,
    evidenceChanged: 0,
    pruned: 0,
    cleared: 0,
    capacityRejected: 0,
  };

  constructor(options: { maxRecords?: number } = {}) {
    this.maxRecords = options.maxRecords ?? 512;
    if (!Number.isInteger(this.maxRecords) || this.maxRecords < 1 || this.maxRecords > 4096) {
      throw new Error("Attention shadow maxRecords must be an integer between 1 and 4096.");
    }
  }

  reconcile(
    evaluationKey: string,
    candidates: readonly AttentionSignalCandidate[],
    confirmedAt: string,
  ): AttentionSignalRecord[] {
    requireReference(evaluationKey, "evaluationKey");
    requireTimestamp(confirmedAt, "confirmedAt");
    const incoming = new Map<string, AttentionSignalCandidate>();
    for (const candidate of candidates) {
      validateCandidate(candidate, evaluationKey);
      const id = signalId(candidate);
      if (incoming.has(id)) throw new Error(`Duplicate attention signal candidate: ${id}`);
      incoming.set(id, candidate);
    }

    const newCount = [...incoming.keys()].filter((id) => !this.records.has(id)).length;
    const overflow = this.records.size + newCount - this.maxRecords;
    if (overflow > 0) {
      const evictable = [...this.records.values()]
        .filter((record) => record.invalidation.state === "INVALIDATED")
        .sort((left, right) => {
          const leftAt = left.invalidation.state === "INVALIDATED" ? left.invalidation.invalidatedAt : "";
          const rightAt = right.invalidation.state === "INVALIDATED" ? right.invalidation.invalidatedAt : "";
          return leftAt.localeCompare(rightAt) || left.signalId.localeCompare(right.signalId);
        });
      if (evictable.length < overflow) {
        this.counters.capacityRejected += 1;
        throw new Error("Attention shadow capacity would be exceeded; no active signal was evicted.");
      }
      for (const record of evictable.slice(0, overflow)) {
        this.records.delete(record.signalId);
        this.counters.pruned += 1;
      }
    }

    const activeIds = new Set(incoming.keys());
    for (const current of this.records.values()) {
      if (current.evaluationKey !== evaluationKey || current.invalidation.state !== "ACTIVE" || activeIds.has(current.signalId)) continue;
      this.records.set(current.signalId, {
        ...current,
        invalidation: {
          state: "INVALIDATED",
          reasonCode: "FACT_NOT_CONFIRMED",
          invalidatedAt: confirmedAt,
        },
      });
      this.counters.invalidated += 1;
    }

    for (const [id, candidate] of incoming) {
      const current = this.records.get(id);
      if (!current) {
        this.records.set(id, {
          ...candidate,
          sourceFacts: candidate.sourceFacts.map((fact) => ({ ...fact })),
          ...(candidate.sourceEvent ? { sourceEvent: { ...candidate.sourceEvent } } : {}),
          proposedDisplay: { ...candidate.proposedDisplay },
          cooldown: { ...candidate.cooldown },
          provenance: cloneRecordProvenance(candidate.provenance),
          evidenceScope: { ...candidate.evidenceScope, refs: [...candidate.evidenceScope.refs] },
          signalId: id,
          firstDetectedAt: candidate.detectedAt,
          lastConfirmedAt: confirmedAt,
          invalidation: { state: "ACTIVE" },
          shownCount: 0,
          userDisposition: { kind: "UNSEEN" },
        });
        this.counters.detected += 1;
        continue;
      }
      const changed = current.evidenceScope.scopeHash !== candidate.evidenceScope.scopeHash;
      const next: AttentionSignalRecord = {
        ...current,
        ...candidate,
        sourceFacts: candidate.sourceFacts.map((fact) => ({ ...fact })),
        ...(candidate.sourceEvent ? { sourceEvent: { ...candidate.sourceEvent } } : {}),
        proposedDisplay: { ...candidate.proposedDisplay },
        cooldown: changed ? { policy: candidate.cooldown.policy } : { ...candidate.cooldown },
        provenance: cloneRecordProvenance(candidate.provenance),
        evidenceScope: { ...candidate.evidenceScope, refs: [...candidate.evidenceScope.refs] },
        lastConfirmedAt: confirmedAt,
        invalidation: { state: "ACTIVE" },
      };
      if (!candidate.sourceEvent) delete next.sourceEvent;
      this.records.set(id, next);
      this.counters.confirmed += 1;
      if (changed) this.counters.evidenceChanged += 1;
    }
    return this.list().filter((record) => record.evaluationKey === evaluationKey && record.invalidation.state === "ACTIVE");
  }

  get(signalIdValue: string): AttentionSignalRecord | undefined {
    const record = this.records.get(signalIdValue);
    return record ? cloneRecord(record) : undefined;
  }

  list(): AttentionSignalRecord[] {
    return [...this.records.values()]
      .sort((left, right) => left.firstDetectedAt.localeCompare(right.firstDetectedAt) || left.signalId.localeCompare(right.signalId))
      .map(cloneRecord);
  }

  setCooldown(signalIdValue: string, until: string): void {
    requireTimestamp(until, "cooldown.until");
    const record = this.requireActive(signalIdValue);
    if (record.cooldown.policy === "NEVER") throw new Error("This attention signal cannot be cooled down.");
    this.records.set(signalIdValue, { ...record, cooldown: { policy: "ELIGIBLE", until } });
  }

  markShown(signalIdValue: string, shownAt: string): void {
    requireTimestamp(shownAt, "shownAt");
    const record = this.requireActive(signalIdValue);
    this.records.set(signalIdValue, {
      ...record,
      shownCount: record.shownCount + 1,
      lastShownAt: shownAt,
    });
  }

  setDisposition(
    signalIdValue: string,
    kind: Exclude<AttentionUserDispositionKind, "UNSEEN">,
    recordedAt: string,
  ): void {
    requireTimestamp(recordedAt, "recordedAt");
    const record = this.requireActive(signalIdValue);
    this.records.set(signalIdValue, {
      ...record,
      userDisposition: { kind, recordedAt },
    });
  }

  clear(): void {
    this.counters.cleared += this.records.size;
    this.records.clear();
  }

  metrics(): AttentionShadowMetrics {
    const values = [...this.records.values()];
    return {
      active: values.filter((record) => record.invalidation.state === "ACTIVE").length,
      invalidatedCurrent: values.filter((record) => record.invalidation.state === "INVALIDATED").length,
      ...this.counters,
    };
  }

  private requireActive(signalIdValue: string): AttentionSignalRecord {
    const record = this.records.get(signalIdValue);
    if (!record || record.invalidation.state !== "ACTIVE") throw new Error("Attention signal is unavailable or invalidated.");
    return record;
  }
}

function cloneRecordProvenance(provenance: AttentionProvenance): AttentionProvenance {
  return {
    rule: { ...provenance.rule },
    ...(provenance.skill ? { skill: { ...provenance.skill } } : {}),
    ...(provenance.prompt ? { prompt: { ...provenance.prompt } } : {}),
    ...(provenance.model ? { model: { ...provenance.model } } : {}),
  };
}
