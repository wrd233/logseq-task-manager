import { checksum, stableJson } from "@task-copilot/shared";

export const GRILL_TURN_SCHEMA_VERSION = "task-copilot-grill-turn-v1" as const;

export type GrillSubjectKind = "MINI_PROJECT" | "PROJECT" | "PROJECT_CREATION";
export type GrillUncertaintyDimension =
  | "OUTCOME"
  | "BOUNDARY"
  | "COMPLETION_EVIDENCE"
  | "UNCLASSIFIED_MATERIAL"
  | "INTERNAL_CLOSURE"
  | "CURRENT_INTERFACE"
  | "PAGE_OBJECT_RELATIONSHIP";

export interface GrillFactAuthority {
  factId: string;
  text: string;
  sourceRefs: string[];
}

export interface GrillUncertaintyAuthority {
  uncertaintyId: string;
  dimension: GrillUncertaintyDimension;
  status: "OPEN" | "RESOLVED";
  priority: number;
  critical: boolean;
  evidenceRefs: string[];
}

export interface GrillTurnAuthority {
  observedAt: string;
  contractVersion: string;
  promptVersion: string;
  skill: { name: string; version: string };
  provider: { providerId: string; providerVersion: string; model: string };
  subject:
    | { kind: "MINI_PROJECT" | "PROJECT"; objectId: string; version: number }
    | { kind: "PROJECT_CREATION"; sourceKind: "BLANK" | "PAGE" | "MINI_PROJECT"; sourceRefs: string[] };
  sourceFingerprint: string;
  facts: GrillFactAuthority[];
  uncertainties: GrillUncertaintyAuthority[];
  unclassifiedMaterialRefs: string[];
}

export interface GrillTurn {
  schemaVersion: typeof GRILL_TURN_SCHEMA_VERSION;
  understanding: string;
  facts: Array<{ text: string; sourceRefs: string[] }>;
  inferences: Array<{ text: string; evidenceRefs: string[] }>;
  unknowns: Array<{ uncertaintyId: string; dimension: GrillUncertaintyDimension; text: string }>;
  readiness: "CONTINUE" | "READY_FOR_PREVIEW";
  questionGroup?: {
    focusUncertaintyId: string;
    questions: Array<{ uncertaintyId: string; text: string }>;
    recommendation?: { text: string; evidenceRefs: string[]; tradeoffs: string[] };
  };
  evidenceScope: { refs: string[]; scopeHash: string; observedAt: string };
  authorityBoundary: "SESSION_DRAFT_ONLY";
  provenance: {
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

interface GrillTurnDraft {
  schemaVersion: typeof GRILL_TURN_SCHEMA_VERSION;
  understanding: string;
  factRefs: string[];
  inferences: GrillTurn["inferences"];
  unknowns: Array<{ uncertaintyId: string; text: string }>;
  readiness: GrillTurn["readiness"];
  focusUncertaintyId?: string;
  questions: Array<{ uncertaintyId: string; text: string }>;
  recommendation?: { text: string; evidenceRefs: string[]; tradeoffs: string[] };
}

const BASE_DIMENSIONS: GrillUncertaintyDimension[] = ["OUTCOME", "BOUNDARY", "COMPLETION_EVIDENCE", "UNCLASSIFIED_MATERIAL"];
const PROJECT_CREATION_DIMENSIONS: GrillUncertaintyDimension[] = [...BASE_DIMENSIONS, "INTERNAL_CLOSURE", "CURRENT_INTERFACE", "PAGE_OBJECT_RELATIONSHIP"];
const DIMENSIONS: GrillUncertaintyDimension[] = [...PROJECT_CREATION_DIMENSIONS];
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[^\s]{1,223}$/u;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Grill turn ${name} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`Grill turn ${name} contains unsupported field ${unexpected}.`);
}

function text(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Grill turn ${name} is invalid.`);
  return value.trim();
}

function token(value: unknown, name: string): string {
  const result = text(value, name, 128);
  if (!TOKEN.test(result)) throw new Error(`Grill turn ${name} must be a machine token.`);
  return result;
}

function refs(value: unknown, name: string, maximum = 32): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Grill turn ${name} is invalid.`);
  const result = value.map((item, index) => {
    const ref = text(item, `${name}[${index}]`, 256);
    if (!REF.test(ref)) throw new Error(`Grill turn ${name}[${index}] is not a bounded reference.`);
    return ref;
  });
  if (new Set(result).size !== result.length) throw new Error(`Grill turn ${name} contains duplicates.`);
  return result;
}

function texts(value: unknown, name: string, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`Grill turn ${name} is invalid.`);
  const result = value.map((item, index) => text(item, `${name}[${index}]`, maximumLength));
  if (new Set(result).size !== result.length) throw new Error(`Grill turn ${name} contains duplicates.`);
  return result;
}

function naturalChinese(value: string, name: string): string {
  if (!/\p{Script=Han}/u.test(value)) throw new Error(`Grill turn ${name} must use natural Chinese.`);
  return value;
}

function parseDraft(value: unknown): GrillTurnDraft {
  const input = record(value, "draft");
  exactKeys(input, ["schemaVersion", "understanding", "factRefs", "inferences", "unknowns", "readiness", "focusUncertaintyId", "questions", "recommendation"], "draft");
  if (input.schemaVersion !== GRILL_TURN_SCHEMA_VERSION) throw new Error("Grill turn schemaVersion is unsupported.");
  if (!Array.isArray(input.inferences) || input.inferences.length > 8) throw new Error("Grill turn inferences are invalid.");
  const inferences = input.inferences.map((value, index) => {
    const item = record(value, `inferences[${index}]`);
    exactKeys(item, ["text", "evidenceRefs"], `inferences[${index}]`);
    return { text: naturalChinese(text(item.text, `inferences[${index}].text`, 400), `inferences[${index}].text`), evidenceRefs: refs(item.evidenceRefs, `inferences[${index}].evidenceRefs`, 16) };
  });
  if (!Array.isArray(input.unknowns) || input.unknowns.length > 8) throw new Error("Grill turn unknowns are invalid.");
  const unknowns = input.unknowns.map((value, index) => {
    const item = record(value, `unknowns[${index}]`);
    exactKeys(item, ["uncertaintyId", "text"], `unknowns[${index}]`);
    return { uncertaintyId: token(item.uncertaintyId, `unknowns[${index}].uncertaintyId`), text: naturalChinese(text(item.text, `unknowns[${index}].text`, 400), `unknowns[${index}].text`) };
  });
  if (!Array.isArray(input.questions) || input.questions.length > 1) throw new Error("Grill turn questions are invalid.");
  const questions = input.questions.map((value, index) => {
    const item = record(value, `questions[${index}]`);
    exactKeys(item, ["uncertaintyId", "text"], `questions[${index}]`);
    return { uncertaintyId: token(item.uncertaintyId, `questions[${index}].uncertaintyId`), text: naturalChinese(text(item.text, `questions[${index}].text`, 500), `questions[${index}].text`) };
  });
  let recommendation: GrillTurnDraft["recommendation"];
  if (input.recommendation !== undefined) {
    const item = record(input.recommendation, "recommendation");
    exactKeys(item, ["text", "evidenceRefs", "tradeoffs"], "recommendation");
    recommendation = {
      text: naturalChinese(text(item.text, "recommendation.text", 600), "recommendation.text"),
      evidenceRefs: refs(item.evidenceRefs, "recommendation.evidenceRefs", 16),
      tradeoffs: texts(item.tradeoffs, "recommendation.tradeoffs", 4, 300).map((item, index) => naturalChinese(item, `recommendation.tradeoffs[${index}]`)),
    };
  }
  if (input.readiness !== "CONTINUE" && input.readiness !== "READY_FOR_PREVIEW") throw new Error("Grill turn readiness is invalid.");
  return {
    schemaVersion: GRILL_TURN_SCHEMA_VERSION,
    understanding: naturalChinese(text(input.understanding, "understanding", 1_200), "understanding"),
    factRefs: texts(input.factRefs, "factRefs", 32, 128).map((item) => token(item, "factRef")),
    inferences,
    unknowns,
    readiness: input.readiness,
    ...(input.focusUncertaintyId !== undefined ? { focusUncertaintyId: token(input.focusUncertaintyId, "focusUncertaintyId") } : {}),
    questions,
    ...(recommendation ? { recommendation } : {}),
  };
}

function validateAuthority(authority: GrillTurnAuthority): void {
  if (!Number.isFinite(Date.parse(authority.observedAt))) throw new Error("Grill authority observedAt is invalid.");
  token(authority.contractVersion, "authority.contractVersion");
  token(authority.promptVersion, "authority.promptVersion");
  token(authority.skill.name, "authority.skill.name");
  token(authority.skill.version, "authority.skill.version");
  token(authority.provider.providerId, "authority.provider.providerId");
  token(authority.provider.providerVersion, "authority.provider.providerVersion");
  token(authority.provider.model, "authority.provider.model");
  if (authority.subject.kind === "PROJECT_CREATION") {
    if (!["BLANK", "PAGE", "MINI_PROJECT"].includes(authority.subject.sourceKind)) throw new Error("Grill authority creation source kind is invalid.");
    const sourceRefs = refs(authority.subject.sourceRefs, "authority.subject.sourceRefs", 16);
    if (authority.subject.sourceKind !== "BLANK" && sourceRefs.length < 1) throw new Error("Project creation source must retain bounded source evidence.");
    if (authority.subject.sourceKind === "BLANK" && sourceRefs.length > 0) throw new Error("Blank Project creation cannot claim source evidence.");
  } else {
    if (authority.subject.kind !== "MINI_PROJECT" && authority.subject.kind !== "PROJECT") throw new Error("Grill authority subject kind is invalid.");
    token(authority.subject.objectId, "authority.subject.objectId");
    if (!Number.isSafeInteger(authority.subject.version) || authority.subject.version < 1) throw new Error("Grill authority subject version is invalid.");
  }
  if (!/^[a-f0-9]{64}$/.test(authority.sourceFingerprint)) throw new Error("Grill authority sourceFingerprint is invalid.");
  if (authority.facts.length < 1 || authority.facts.length > 64 || authority.uncertainties.length < 4 || authority.uncertainties.length > 64) throw new Error("Grill authority bounds are invalid.");
  const factIds = new Set<string>();
  for (const fact of authority.facts) {
    const id = token(fact.factId, "authority.factId");
    if (factIds.has(id)) throw new Error("Grill authority contains duplicate fact IDs.");
    factIds.add(id);
    text(fact.text, "authority.fact.text", 1_000);
    refs(fact.sourceRefs, "authority.fact.sourceRefs");
  }
  const uncertaintyIds = new Set<string>();
  for (const uncertainty of authority.uncertainties) {
    const id = token(uncertainty.uncertaintyId, "authority.uncertaintyId");
    if (uncertaintyIds.has(id) || !DIMENSIONS.includes(uncertainty.dimension) || !["OPEN", "RESOLVED"].includes(uncertainty.status) || typeof uncertainty.critical !== "boolean") throw new Error("Grill authority uncertainty is invalid.");
    uncertaintyIds.add(id);
    if (!Number.isSafeInteger(uncertainty.priority) || uncertainty.priority < 0 || uncertainty.priority > 1_000) throw new Error("Grill authority uncertainty priority is invalid.");
    refs(uncertainty.evidenceRefs, "authority.uncertainty.evidenceRefs");
  }
  const requiredDimensions = authority.subject.kind === "PROJECT_CREATION" ? PROJECT_CREATION_DIMENSIONS : BASE_DIMENSIONS;
  for (const dimension of requiredDimensions) {
    if (!authority.uncertainties.some((uncertainty) => uncertainty.dimension === dimension)) throw new Error(`Grill authority is missing ${dimension}.`);
  }
  refs(authority.unclassifiedMaterialRefs, "authority.unclassifiedMaterialRefs", 64);
}

export function requiredGrillFocus(authority: GrillTurnAuthority): GrillUncertaintyAuthority | undefined {
  validateAuthority(authority);
  return authority.uncertainties
    .filter((uncertainty) => uncertainty.status === "OPEN")
    .sort((left, right) => Number(right.critical) - Number(left.critical) || left.priority - right.priority || left.uncertaintyId.localeCompare(right.uncertaintyId))[0];
}

export function grillReadiness(authority: GrillTurnAuthority): "CONTINUE" | "READY_FOR_PREVIEW" {
  validateAuthority(authority);
  const requiredDimensions = authority.subject.kind === "PROJECT_CREATION" ? PROJECT_CREATION_DIMENSIONS : BASE_DIMENSIONS;
  const everyDimensionResolved = requiredDimensions.every((dimension) =>
    authority.uncertainties.some((uncertainty) => uncertainty.dimension === dimension && uncertainty.status === "RESOLVED"));
  return everyDimensionResolved && authority.uncertainties.every((uncertainty) => uncertainty.status === "RESOLVED") && authority.unclassifiedMaterialRefs.length === 0
    ? "READY_FOR_PREVIEW"
    : "CONTINUE";
}

export function materializeGrillTurn(value: unknown, authority: GrillTurnAuthority): GrillTurn {
  validateAuthority(authority);
  const draft = parseDraft(value);
  const facts = new Map(authority.facts.map((fact) => [fact.factId, fact]));
  const openUncertainties = new Map(authority.uncertainties.filter((item) => item.status === "OPEN").map((item) => [item.uncertaintyId, item]));
  const requiredFocus = requiredGrillFocus(authority);
  const machineReadiness = grillReadiness(authority);
  if (draft.readiness !== machineReadiness) throw new Error("Grill turn readiness disagrees with machine-owned readiness.");
  if (new Set(draft.factRefs).size !== draft.factRefs.length || draft.factRefs.some((id) => !facts.has(id))) throw new Error("Grill turn referenced an unknown or duplicate fact.");
  const allowedEvidenceRefs = new Set([
    ...authority.facts.flatMap((fact) => fact.sourceRefs),
    ...authority.uncertainties.flatMap((uncertainty) => uncertainty.evidenceRefs),
    ...authority.unclassifiedMaterialRefs,
  ]);
  for (const inference of draft.inferences) {
    if (!inference.evidenceRefs.length || inference.evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref))) throw new Error("Grill turn inference has unsupported evidence.");
  }
  if (new Set(draft.unknowns.map((item) => item.uncertaintyId)).size !== draft.unknowns.length || draft.unknowns.some((item) => !openUncertainties.has(item.uncertaintyId))) {
    throw new Error("Grill turn unknowns must reference open machine uncertainties.");
  }
  if (machineReadiness === "CONTINUE") {
    if (!requiredFocus || draft.focusUncertaintyId !== requiredFocus.uncertaintyId) throw new Error("Grill turn did not focus the largest open uncertainty.");
    if (draft.questions.length < 1 || draft.questions[0]?.uncertaintyId !== requiredFocus.uncertaintyId) throw new Error("Grill turn must ask the focus question first.");
    if (!draft.unknowns.some((item) => item.uncertaintyId === requiredFocus.uncertaintyId)) throw new Error("Grill turn must state the focus uncertainty explicitly.");
    if (new Set(draft.questions.map((item) => item.uncertaintyId)).size !== draft.questions.length || draft.questions.some((item) => !openUncertainties.has(item.uncertaintyId))) {
      throw new Error("Grill turn questions must reference distinct open uncertainties.");
    }
    if (!draft.recommendation || draft.recommendation.tradeoffs.length < 1) throw new Error("Grill turn must give one evidence-backed recommendation with tradeoffs.");
  } else if (draft.focusUncertaintyId || draft.questions.length || draft.recommendation) {
    throw new Error("A preview-ready Grill turn cannot keep asking session questions.");
  }
  if (draft.recommendation && (!draft.recommendation.evidenceRefs.length || draft.recommendation.evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref)))) throw new Error("Grill turn recommendation has unsupported evidence.");

  const scopeRefs = [...new Set([
    ...draft.factRefs.flatMap((id) => facts.get(id)!.sourceRefs),
    ...draft.inferences.flatMap((item) => item.evidenceRefs),
    ...draft.unknowns.flatMap((item) => openUncertainties.get(item.uncertaintyId)!.evidenceRefs),
    ...(draft.recommendation?.evidenceRefs ?? []),
  ])].sort();
  return {
    schemaVersion: GRILL_TURN_SCHEMA_VERSION,
    understanding: draft.understanding,
    facts: draft.factRefs.map((id) => ({ text: facts.get(id)!.text, sourceRefs: [...facts.get(id)!.sourceRefs] })),
    inferences: draft.inferences.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] })),
    unknowns: draft.unknowns.map((item) => ({ ...item, dimension: openUncertainties.get(item.uncertaintyId)!.dimension })),
    readiness: machineReadiness,
    ...(machineReadiness === "CONTINUE" ? {
      questionGroup: {
        focusUncertaintyId: requiredFocus!.uncertaintyId,
        questions: draft.questions.map((item) => ({ ...item })),
        ...(draft.recommendation ? { recommendation: { ...draft.recommendation, evidenceRefs: [...draft.recommendation.evidenceRefs], tradeoffs: [...draft.recommendation.tradeoffs] } } : {}),
      },
    } : {}),
    evidenceScope: { refs: scopeRefs, scopeHash: checksum(stableJson({ sourceFingerprint: authority.sourceFingerprint, refs: scopeRefs })), observedAt: authority.observedAt },
    authorityBoundary: "SESSION_DRAFT_ONLY",
    provenance: {
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
