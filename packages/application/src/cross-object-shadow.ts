import { checksum, stableJson } from "@task-copilot/shared";

import type {
  AttentionFactReference,
  AttentionSignalCandidate,
} from "./attention-shadow.ts";

export type CrossObjectObservationKind =
  | "TASK_CLUSTER_CANDIDATE"
  | "LEGACY_HANDOFF_CANDIDATE"
  | "PROJECT_INTERFACE_STALE_CANDIDATE"
  | "ASSOCIATION_CANDIDATE"
  | "OWNERSHIP_CANDIDATE";

export interface CrossObjectObservationDraft {
  kind: CrossObjectObservationKind;
  subjectRefs: string[];
  scope: { kind: "OBJECT" | "PROJECT"; rootRef: string };
  primaryObjectId?: string;
  evidenceFacts: AttentionFactReference[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  provenance: {
    skill: { id: string; version: string };
    prompt: { id: string; version: string };
    model: { provider: string; id: string; version: string };
  };
}

const KINDS: CrossObjectObservationKind[] = [
  "TASK_CLUSTER_CANDIDATE",
  "LEGACY_HANDOFF_CANDIDATE",
  "PROJECT_INTERFACE_STALE_CANDIDATE",
  "ASSOCIATION_CANDIDATE",
  "OWNERSHIP_CANDIDATE",
];
const CONFIDENCE = ["LOW", "MEDIUM", "HIGH"] as const;
const OBJECT_VERSION_REF = /^object:([^\s@]{1,223})@v([1-9][0-9]*)$/u;
const SAFE_REFERENCE = /^[a-z][a-z0-9_-]{0,31}:[^\s]{1,223}$/u;
const SAFE_IDENTIFIER = /^[^\s]{1,128}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/u;
const SAFE_CODE = /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/u;
const STABLE_CHECKSUM = /^[a-f0-9]{8}$/u;

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  name: string,
): void {
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key));
  if (unsupported) throw new Error(`${name} contains unsupported field ${unsupported}.`);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireIdentifier(value: unknown, name: string): string {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    throw new Error(`${name} must be a bounded identifier.`);
  }
  return value;
}

function requireVersion(value: unknown, name: string): string {
  if (typeof value !== "string" || !SAFE_VERSION.test(value)) {
    throw new Error(`${name} must be a bounded version.`);
  }
  return value;
}

function parseDraft(value: unknown): CrossObjectObservationDraft {
  const draft = requireRecord(value, "Cross-object observation");
  requireExactKeys(
    draft,
    ["kind", "subjectRefs", "scope", "primaryObjectId", "evidenceFacts", "confidence", "provenance"],
    "Cross-object observation",
  );
  if (!KINDS.includes(draft.kind as CrossObjectObservationKind)) {
    throw new Error("Cross-object observation kind is unsupported.");
  }
  if (!Array.isArray(draft.subjectRefs) || draft.subjectRefs.length < 2 || draft.subjectRefs.length > 8) {
    throw new Error("Cross-object observation subjectRefs must contain 2..8 formal object versions.");
  }
  const subjectRefs = draft.subjectRefs.map((value, index) => {
    if (typeof value !== "string" || !OBJECT_VERSION_REF.test(value)) {
      throw new Error(`Cross-object observation subjectRefs[${index}] must be an object version reference.`);
    }
    return value;
  });
  if (new Set(subjectRefs).size !== subjectRefs.length) {
    throw new Error("Cross-object observation subjectRefs must be unique.");
  }
  const scope = requireRecord(draft.scope, "Cross-object observation scope");
  requireExactKeys(scope, ["kind", "rootRef"], "Cross-object observation scope");
  if (scope.kind !== "OBJECT" && scope.kind !== "PROJECT") {
    throw new Error("Cross-object observation scope.kind is invalid.");
  }
  if (typeof scope.rootRef !== "string" || !subjectRefs.includes(scope.rootRef)) {
    throw new Error("Cross-object observation scope.rootRef must identify one subjectRef.");
  }
  const primaryObjectId = draft.primaryObjectId === undefined
    ? undefined
    : requireIdentifier(draft.primaryObjectId, "Cross-object observation primaryObjectId");
  if (
    primaryObjectId
    && !subjectRefs.some((ref) => OBJECT_VERSION_REF.exec(ref)?.[1] === primaryObjectId)
  ) {
    throw new Error("Cross-object observation primaryObjectId must identify one subjectRef.");
  }
  if (!Array.isArray(draft.evidenceFacts) || draft.evidenceFacts.length < 2 || draft.evidenceFacts.length > 16) {
    throw new Error("Cross-object observation evidenceFacts must contain 2..16 structured facts.");
  }
  const evidenceFacts = draft.evidenceFacts.map((value, index): AttentionFactReference => {
    const fact = requireRecord(value, `Cross-object observation evidenceFacts[${index}]`);
    requireExactKeys(
      fact,
      ["factCode", "sourceRef", "observedAt", "fingerprint"],
      `Cross-object observation evidenceFacts[${index}]`,
    );
    if (typeof fact.factCode !== "string" || !SAFE_CODE.test(fact.factCode)) {
      throw new Error(`Cross-object observation evidenceFacts[${index}].factCode is invalid.`);
    }
    if (typeof fact.sourceRef !== "string" || !SAFE_REFERENCE.test(fact.sourceRef)) {
      throw new Error(`Cross-object observation evidenceFacts[${index}].sourceRef is invalid.`);
    }
    if (typeof fact.observedAt !== "string" || !Number.isFinite(Date.parse(fact.observedAt))) {
      throw new Error(`Cross-object observation evidenceFacts[${index}].observedAt is invalid.`);
    }
    if (typeof fact.fingerprint !== "string" || !STABLE_CHECKSUM.test(fact.fingerprint)) {
      throw new Error(`Cross-object observation evidenceFacts[${index}].fingerprint is invalid.`);
    }
    return {
      factCode: fact.factCode,
      sourceRef: fact.sourceRef,
      observedAt: fact.observedAt,
      fingerprint: fact.fingerprint,
    };
  });
  const factKeys = evidenceFacts.map(({ factCode, sourceRef }) => `${factCode}|${sourceRef}`);
  if (new Set(factKeys).size !== factKeys.length) {
    throw new Error("Cross-object observation evidenceFacts must be unique.");
  }
  if (!CONFIDENCE.includes(draft.confidence as (typeof CONFIDENCE)[number])) {
    throw new Error("Cross-object observation confidence is invalid.");
  }
  const provenance = requireRecord(draft.provenance, "Cross-object observation provenance");
  requireExactKeys(provenance, ["skill", "prompt", "model"], "Cross-object observation provenance");
  const skill = requireRecord(provenance.skill, "Cross-object observation provenance.skill");
  const prompt = requireRecord(provenance.prompt, "Cross-object observation provenance.prompt");
  const model = requireRecord(provenance.model, "Cross-object observation provenance.model");
  requireExactKeys(skill, ["id", "version"], "Cross-object observation provenance.skill");
  requireExactKeys(prompt, ["id", "version"], "Cross-object observation provenance.prompt");
  requireExactKeys(model, ["provider", "id", "version"], "Cross-object observation provenance.model");
  return {
    kind: draft.kind as CrossObjectObservationKind,
    subjectRefs,
    scope: { kind: scope.kind, rootRef: scope.rootRef },
    ...(primaryObjectId ? { primaryObjectId } : {}),
    evidenceFacts,
    confidence: draft.confidence as CrossObjectObservationDraft["confidence"],
    provenance: {
      skill: {
        id: requireIdentifier(skill.id, "Cross-object observation provenance.skill.id"),
        version: requireVersion(skill.version, "Cross-object observation provenance.skill.version"),
      },
      prompt: {
        id: requireIdentifier(prompt.id, "Cross-object observation provenance.prompt.id"),
        version: requireVersion(prompt.version, "Cross-object observation provenance.prompt.version"),
      },
      model: {
        provider: requireIdentifier(model.provider, "Cross-object observation provenance.model.provider"),
        id: requireIdentifier(model.id, "Cross-object observation provenance.model.id"),
        version: requireVersion(model.version, "Cross-object observation provenance.model.version"),
      },
    },
  };
}

function materialize(draft: CrossObjectObservationDraft, detectedAt: string): AttentionSignalCandidate {
  const refs = [...new Set([
    ...draft.subjectRefs,
    ...draft.evidenceFacts.map(({ sourceRef }) => sourceRef),
  ])].sort();
  const identity = checksum(stableJson({
    kind: draft.kind,
    scope: draft.scope,
    primaryObjectId: draft.primaryObjectId ?? null,
    subjectRefs: [...draft.subjectRefs].sort(),
  }));
  const subjectRef = `cross:${identity.slice(0, 24)}`;
  const scopeHash = checksum(stableJson({
    kind: draft.kind,
    refs,
    facts: draft.evidenceFacts.map(({ factCode, sourceRef, fingerprint }) => ({
      factCode,
      sourceRef,
      fingerprint,
    })).sort((left, right) =>
      left.factCode.localeCompare(right.factCode)
      || left.sourceRef.localeCompare(right.sourceRef)
    ),
  }));
  return {
    signalType: "LLM_CROSS_OBJECT",
    subjectRef,
    ...(draft.primaryObjectId ? { objectId: draft.primaryObjectId } : {}),
    evaluationKey: subjectRef,
    detectedAt,
    sourceFacts: draft.evidenceFacts.map((fact) => ({ ...fact })),
    urgency: draft.kind === "LEGACY_HANDOFF_CANDIDATE" ? "HIGH" : "MEDIUM",
    certainty: "INFERENCE",
    contextRelevance: draft.confidence === "LOW" ? "LOW" : draft.confidence === "HIGH" ? "HIGH" : "MEDIUM",
    proposedDisplay: { level: "SHADOW", surface: "NONE" },
    mergeTarget: draft.primaryObjectId ? `object:${draft.primaryObjectId}` : subjectRef,
    cooldown: { policy: "ELIGIBLE" },
    provenance: {
      rule: { id: "cross-object-shadow", version: "1.0.0" },
      skill: { ...draft.provenance.skill },
      prompt: { ...draft.provenance.prompt },
      model: { ...draft.provenance.model },
    },
    evidenceScope: {
      kind: draft.scope.kind,
      refs,
      scopeHash,
    },
  };
}

export function materializeCrossObjectShadowCandidates(
  input: readonly CrossObjectObservationDraft[],
  detectedAt: string,
): AttentionSignalCandidate[] {
  if (!Number.isFinite(Date.parse(detectedAt))) {
    throw new Error("Cross-object observation detectedAt is invalid.");
  }
  if (input.length > 8) {
    throw new Error("Cross-object shadow accepts at most 8 observations per cycle.");
  }
  const drafts = input.map(parseDraft);
  const candidates = drafts.map((draft) => materialize(draft, detectedAt));
  const ids = candidates.map(({ subjectRef }) => subjectRef);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Cross-object shadow observations must be unique.");
  }
  return candidates.sort((left, right) => left.subjectRef.localeCompare(right.subjectRef));
}
