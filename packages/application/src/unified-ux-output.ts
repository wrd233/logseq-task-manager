import { checksum, stableJson } from "@task-copilot/shared";

import { assertFrontstageProse } from "./frontstage-prose.ts";

export const UNIFIED_UX_OUTPUT_SCHEMA_VERSION = "task-copilot-ux-output-v1" as const;

export type UnifiedUxRiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface UnifiedUxFactAuthority {
  factId: string;
  text: string;
  sourceRefs: string[];
}

export interface UnifiedUxNextActionAuthority {
  actionId: string;
  intent: "OPEN_SOURCE" | "OPEN_REVIEW" | "ASK_USER";
  label: string;
  targetRef: string;
  evidenceRefs: string[];
}

export interface UnifiedUxOutputAuthority {
  observedAt: string;
  contractVersion: string;
  promptVersion: string;
  skill: {
    name: string;
    version: string;
  };
  provider: {
    providerId: string;
    providerVersion: string;
    model: string;
  };
  minimumRiskLevel: UnifiedUxRiskLevel;
  requiresDiscussion: boolean;
  requiresReview: boolean;
  facts: UnifiedUxFactAuthority[];
  allowedNextActions: UnifiedUxNextActionAuthority[];
}

export interface UnifiedUxOutput {
  schemaVersion: typeof UNIFIED_UX_OUTPUT_SCHEMA_VERSION;
  summary: string;
  facts: Array<{
    text: string;
    sourceRefs: string[];
  }>;
  inferences: Array<{
    text: string;
    evidenceRefs: string[];
  }>;
  unknowns: string[];
  suggestedChanges: Array<{
    kind: "DRAFT_PROPOSAL";
    summary: string;
    evidenceRefs: string[];
    riskLevel: UnifiedUxRiskLevel;
  }>;
  nextActionEligible: boolean;
  nextAction?: {
    intent: UnifiedUxNextActionAuthority["intent"];
    label: string;
    targetRef: string;
  };
  riskLevel: UnifiedUxRiskLevel;
  requiresDiscussion: boolean;
  requiresReview: boolean;
  evidenceScope: {
    refs: string[];
    observedAt: string;
    scopeHash: string;
  };
  provenance: {
    kind: "LLM_DRAFT";
    contractVersion: string;
    promptVersion: string;
    skillName: string;
    skillVersion: string;
    providerId: string;
    providerVersion: string;
    model: string;
    generatedAt: string;
  };
}

interface UnifiedUxOutputDraft {
  schemaVersion: typeof UNIFIED_UX_OUTPUT_SCHEMA_VERSION;
  factRefs: string[];
  inferences: UnifiedUxOutput["inferences"];
  unknowns: string[];
  summary: string;
  suggestedChanges: UnifiedUxOutput["suggestedChanges"];
  nextActionEligible: boolean;
  nextActionId?: string;
  riskLevel: UnifiedUxRiskLevel;
  requiresDiscussion: boolean;
  requiresReview: boolean;
  provenance?: unknown;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Unified UX output ${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`Unified UX output ${name} contains unsupported field ${unexpected}.`);
}

function boundedString(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`Unified UX output ${name} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
}

function boundedStringArray(value: unknown, name: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Unified UX output ${name} must contain at most ${maxItems} items.`);
  }
  const result = value.map((item, index) => boundedString(item, `${name}[${index}]`, maxLength));
  if (new Set(result).size !== result.length) throw new Error(`Unified UX output ${name} must not contain duplicates.`);
  return result;
}

function frontstageString(value: unknown, name: string, max: number): string {
  return assertFrontstageProse(boundedString(value, name, max), `Unified UX output ${name}`);
}

function frontstageStringArray(value: unknown, name: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Unified UX output ${name} must contain at most ${maxItems} items.`);
  }
  const result = value.map((item, index) => frontstageString(item, `${name}[${index}]`, maxLength));
  if (new Set(result).size !== result.length) throw new Error(`Unified UX output ${name} must not contain duplicates.`);
  return result;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Unified UX output ${name} must be boolean.`);
  return value;
}

function risk(value: unknown, name: string): UnifiedUxRiskLevel {
  if (!["NONE", "LOW", "MEDIUM", "HIGH"].includes(value as string)) {
    throw new Error(`Unified UX output ${name} is invalid.`);
  }
  return value as UnifiedUxRiskLevel;
}

function parseDraft(value: unknown): UnifiedUxOutputDraft {
  const input = record(value, "draft");
  exactKeys(input, [
    "schemaVersion",
    "factRefs",
    "inferences",
    "unknowns",
    "summary",
    "suggestedChanges",
    "nextActionEligible",
    "nextActionId",
    "riskLevel",
    "requiresDiscussion",
    "requiresReview",
    "provenance",
  ], "draft");
  if (input.schemaVersion !== UNIFIED_UX_OUTPUT_SCHEMA_VERSION) {
    throw new Error("Unified UX output schemaVersion is unsupported.");
  }
  if (!Array.isArray(input.inferences) || input.inferences.length > 8) {
    throw new Error("Unified UX output inferences must contain at most 8 items.");
  }
  const inferences = input.inferences.map((item, index) => {
    const inference = record(item, `inferences[${index}]`);
    exactKeys(inference, ["text", "evidenceRefs"], `inferences[${index}]`);
    return {
      text: frontstageString(inference.text, `inferences[${index}].text`, 240),
      evidenceRefs: boundedStringArray(inference.evidenceRefs, `inferences[${index}].evidenceRefs`, 16, 256),
    };
  });
  if (!Array.isArray(input.suggestedChanges) || input.suggestedChanges.length > 6) {
    throw new Error("Unified UX output suggestedChanges must contain at most 6 items.");
  }
  const suggestedChanges = input.suggestedChanges.map((item, index) => {
    const suggestion = record(item, `suggestedChanges[${index}]`);
    exactKeys(suggestion, ["kind", "summary", "evidenceRefs", "riskLevel"], `suggestedChanges[${index}]`);
    if (suggestion.kind !== "DRAFT_PROPOSAL") {
      throw new Error(`Unified UX output suggestedChanges[${index}].kind is invalid.`);
    }
    return {
      kind: "DRAFT_PROPOSAL" as const,
      summary: frontstageString(suggestion.summary, `suggestedChanges[${index}].summary`, 240),
      evidenceRefs: boundedStringArray(suggestion.evidenceRefs, `suggestedChanges[${index}].evidenceRefs`, 16, 256),
      riskLevel: risk(suggestion.riskLevel, `suggestedChanges[${index}].riskLevel`),
    };
  });
  return {
    schemaVersion: UNIFIED_UX_OUTPUT_SCHEMA_VERSION,
    factRefs: boundedStringArray(input.factRefs, "factRefs", 16, 128),
    inferences,
    unknowns: frontstageStringArray(input.unknowns, "unknowns", 8, 240),
    summary: frontstageString(input.summary, "summary", 400),
    suggestedChanges,
    nextActionEligible: boolean(input.nextActionEligible, "nextActionEligible"),
    ...(input.nextActionId === undefined ? {} : { nextActionId: boundedString(input.nextActionId, "nextActionId", 128) }),
    riskLevel: risk(input.riskLevel, "riskLevel"),
    requiresDiscussion: boolean(input.requiresDiscussion, "requiresDiscussion"),
    requiresReview: boolean(input.requiresReview, "requiresReview"),
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
  };
}

const riskRank: Record<UnifiedUxRiskLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

function maximumRisk(levels: UnifiedUxRiskLevel[]): UnifiedUxRiskLevel {
  return levels.reduce((highest, current) => riskRank[current] > riskRank[highest] ? current : highest, "NONE");
}

function validMachineString(value: unknown, max: number): boolean {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= max;
}

function validMachineRefs(refs: unknown, maxItems: number): refs is string[] {
  return Array.isArray(refs)
    && refs.length <= maxItems
    && refs.every((ref) => validMachineString(ref, 256))
    && new Set(refs).size === refs.length;
}

function validateAuthority(authority: UnifiedUxOutputAuthority): void {
  if (
    !Number.isFinite(Date.parse(authority.observedAt))
    || !validMachineString(authority.contractVersion, 128)
    || !validMachineString(authority.promptVersion, 128)
    || !validMachineString(authority.skill?.name, 64)
    || !validMachineString(authority.skill?.version, 128)
    || !validMachineString(authority.provider?.providerId, 64)
    || !validMachineString(authority.provider?.providerVersion, 128)
    || !validMachineString(authority.provider?.model, 256)
  ) {
    throw new Error("Unified UX output machine provenance is invalid.");
  }
  if (
    !(authority.minimumRiskLevel in riskRank)
    || typeof authority.requiresDiscussion !== "boolean"
    || typeof authority.requiresReview !== "boolean"
  ) {
    throw new Error("Unified UX output machine policy is invalid.");
  }
  if (!Array.isArray(authority.facts) || authority.facts.length > 64 || authority.facts.some((fact) => (
    !validMachineString(fact?.factId, 128)
    || !validMachineString(fact?.text, 500)
    || !validMachineRefs(fact?.sourceRefs, 16)
  ))) {
    throw new Error("Unified UX output machine facts are invalid.");
  }
  if (
    !Array.isArray(authority.allowedNextActions)
    || authority.allowedNextActions.length > 16
    || authority.allowedNextActions.some((action) => (
      !validMachineString(action?.actionId, 128)
      || !["OPEN_SOURCE", "OPEN_REVIEW", "ASK_USER"].includes(action?.intent)
      || !validMachineString(action?.label, 80)
      || !validMachineString(action?.targetRef, 256)
      || !validMachineRefs(action?.evidenceRefs, 16)
    ))
  ) {
    throw new Error("Unified UX output machine actions are invalid.");
  }
}

export function materializeUnifiedUxOutput(
  rawValue: unknown,
  authority: UnifiedUxOutputAuthority,
): UnifiedUxOutput {
  const value = parseDraft(rawValue);
  validateAuthority(authority);
  const factIds = authority.facts.map(({ factId }) => factId);
  if (new Set(factIds).size !== factIds.length) {
    throw new Error("Unified UX output authority contains a duplicate machine fact identity.");
  }
  const actionIds = authority.allowedNextActions.map(({ actionId }) => actionId);
  if (new Set(actionIds).size !== actionIds.length) {
    throw new Error("Unified UX output authority contains a duplicate machine action identity.");
  }
  const factsById = new Map(authority.facts.map((fact) => [fact.factId, fact]));
  const allowedEvidenceRefs = new Set([
    ...authority.facts.flatMap(({ sourceRefs }) => sourceRefs),
    ...authority.allowedNextActions.flatMap(({ evidenceRefs, targetRef }) => [...evidenceRefs, targetRef]),
  ]);
  const modelEvidenceRefs = [
    ...value.inferences.flatMap(({ evidenceRefs }) => evidenceRefs),
    ...value.suggestedChanges.flatMap(({ evidenceRefs }) => evidenceRefs),
  ];
  if (modelEvidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref))) {
    throw new Error("Unified UX output referenced evidence outside the machine-owned evidence scope.");
  }
  const action = value.nextActionId
    ? authority.allowedNextActions.find(({ actionId }) => actionId === value.nextActionId)
    : undefined;
  if (value.nextActionId && !action) {
    throw new Error("Unified UX output referenced an unknown next action.");
  }
  const facts = value.factRefs.map((factId) => {
    const fact = factsById.get(factId);
    if (!fact) throw new Error("Unified UX output referenced an unknown fact.");
    return { text: fact.text, sourceRefs: [...fact.sourceRefs] };
  });
  if (value.nextActionEligible !== Boolean(action)) {
    throw new Error("Unified UX output next-action eligibility does not match an allowed action.");
  }
  const refs = [...new Set([
    ...facts.flatMap(({ sourceRefs }) => sourceRefs),
    ...value.inferences.flatMap(({ evidenceRefs }) => evidenceRefs),
    ...value.suggestedChanges.flatMap(({ evidenceRefs }) => evidenceRefs),
    ...(action?.evidenceRefs ?? []),
  ])].sort();
  return {
    schemaVersion: UNIFIED_UX_OUTPUT_SCHEMA_VERSION,
    summary: value.summary,
    facts,
    inferences: value.inferences,
    unknowns: value.unknowns,
    suggestedChanges: value.suggestedChanges,
    nextActionEligible: value.nextActionEligible,
    ...(action ? {
      nextAction: {
        intent: action.intent,
        label: action.label,
        targetRef: action.targetRef,
      },
    } : {}),
    riskLevel: maximumRisk([
      authority.minimumRiskLevel,
      value.riskLevel,
      ...value.suggestedChanges.map(({ riskLevel }) => riskLevel),
    ]),
    requiresDiscussion: authority.requiresDiscussion || value.requiresDiscussion,
    requiresReview: authority.requiresReview || value.requiresReview || value.suggestedChanges.length > 0,
    evidenceScope: {
      refs,
      observedAt: authority.observedAt,
      scopeHash: checksum(stableJson({ refs, observedAt: authority.observedAt })),
    },
    provenance: {
      kind: "LLM_DRAFT",
      contractVersion: authority.contractVersion,
      promptVersion: authority.promptVersion,
      skillName: authority.skill.name,
      skillVersion: authority.skill.version,
      providerId: authority.provider.providerId,
      providerVersion: authority.provider.providerVersion,
      model: authority.provider.model,
      generatedAt: authority.observedAt,
    },
  };
}
