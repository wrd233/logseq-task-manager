import { checksum, stableJson } from "@task-copilot/shared";

export const GRILL_PREVIEW_SCHEMA_VERSION = "task-copilot-grill-preview-v1" as const;

export interface GrillPreviewMaterialAuthority {
  materialId: string;
  sourceRef: string;
  contentHash: string;
  exactText: string;
  currentSectionId: string;
  isRoot: boolean;
}

export interface GrillPreviewAuthority {
  observedAt: string;
  contractVersion: string;
  promptVersion: string;
  skill: { name: string; version: string };
  provider: { providerId: string; providerVersion: string; model: string };
  subject: { kind: "MINI_PROJECT"; objectId: string; version: number };
  sourceFingerprint: string;
  readiness: "CONTINUE" | "READY_FOR_PREVIEW";
  materials: GrillPreviewMaterialAuthority[];
  sessionFacts: Array<{ factId: string; text: string; sourceRefs: string[] }>;
}

export interface GrillPreviewClaim {
  text: string;
  evidenceRefs: string[];
}

export interface GrillPreview {
  schemaVersion: typeof GRILL_PREVIEW_SCHEMA_VERSION;
  finalReading: {
    title: GrillPreviewClaim;
    outcome: GrillPreviewClaim;
    boundary: { included: GrillPreviewClaim[]; excluded: GrillPreviewClaim[] };
    completionEvidence: GrillPreviewClaim[];
    sections: Array<{
      sectionId: string;
      heading: string;
      purpose: string;
      sourceMaterials: Array<{ materialId: string; sourceRef: string; contentHash: string; text: string; preservation: "UNCHANGED" }>;
      derivedBlocks: GrillPreviewClaim[];
    }>;
  };
  unclassified: Array<{ materialId: string; sourceRef: string; contentHash: string; text: string; reason: string; evidenceRefs: string[]; preservation: "UNCHANGED_IN_PLACE" }>;
  impact: { sourceMaterialCount: number; movedMaterialCount: number; addedDerivedBlockCount: number; deletedMaterialCount: 0; unclassifiedMaterialCount: number };
  evidenceScope: { refs: string[]; scopeHash: string; observedAt: string };
  authorityBoundary: "SESSION_PREVIEW_ONLY";
  provenance: { contractVersion: string; promptVersion: string; skillName: string; skillVersion: string; providerId: string; providerVersion: string; model: string; generatedAt: string };
}

interface PreviewSectionDraft {
  sectionId: string;
  heading: string;
  purpose: string;
  sourceMaterialIds: string[];
  derivedBlocks: GrillPreviewClaim[];
}

interface GrillPreviewDraft {
  schemaVersion: typeof GRILL_PREVIEW_SCHEMA_VERSION;
  title: GrillPreviewClaim;
  outcome: GrillPreviewClaim;
  boundary: { included: GrillPreviewClaim[]; excluded: GrillPreviewClaim[] };
  completionEvidence: GrillPreviewClaim[];
  sections: PreviewSectionDraft[];
  unclassified: Array<{ materialId: string; reason: string; evidenceRefs: string[] }>;
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[^\s]{1,223}$/u;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Grill preview ${name} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`Grill preview ${name} contains unsupported field ${unexpected}.`);
}

function boundedText(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Grill preview ${name} is invalid.`);
  return value.trim();
}

function token(value: unknown, name: string): string {
  const result = boundedText(value, name, 128);
  if (!TOKEN.test(result)) throw new Error(`Grill preview ${name} must be a machine token.`);
  return result;
}

function references(value: unknown, name: string, maximum = 16): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) throw new Error(`Grill preview ${name} is invalid.`);
  const result = value.map((item, index) => {
    const ref = boundedText(item, `${name}[${index}]`, 256);
    if (!REF.test(ref)) throw new Error(`Grill preview ${name}[${index}] is not a bounded reference.`);
    return ref;
  });
  if (new Set(result).size !== result.length) throw new Error(`Grill preview ${name} contains duplicates.`);
  return result;
}

function stringArray(value: unknown, name: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Grill preview ${name} is invalid.`);
  const result = value.map((item, index) => token(item, `${name}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`Grill preview ${name} contains duplicates.`);
  return result;
}

function claim(value: unknown, name: string): GrillPreviewClaim {
  const input = record(value, name);
  exactKeys(input, ["text", "evidenceRefs"], name);
  return { text: boundedText(input.text, `${name}.text`, 1_000), evidenceRefs: references(input.evidenceRefs, `${name}.evidenceRefs`) };
}

function claims(value: unknown, name: string, minimum: number, maximum: number): GrillPreviewClaim[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`Grill preview ${name} is invalid.`);
  return value.map((item, index) => claim(item, `${name}[${index}]`));
}

function parseDraft(value: unknown): GrillPreviewDraft {
  const input = record(value, "draft");
  exactKeys(input, ["schemaVersion", "title", "outcome", "boundary", "completionEvidence", "sections", "unclassified"], "draft");
  if (input.schemaVersion !== GRILL_PREVIEW_SCHEMA_VERSION) throw new Error("Grill preview schemaVersion is unsupported.");
  const boundary = record(input.boundary, "boundary");
  exactKeys(boundary, ["included", "excluded"], "boundary");
  if (!Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > 12) throw new Error("Grill preview sections are invalid.");
  const sections = input.sections.map((value, index) => {
    const section = record(value, `sections[${index}]`);
    exactKeys(section, ["sectionId", "heading", "purpose", "sourceMaterialIds", "derivedBlocks"], `sections[${index}]`);
    return {
      sectionId: token(section.sectionId, `sections[${index}].sectionId`),
      heading: boundedText(section.heading, `sections[${index}].heading`, 160),
      purpose: boundedText(section.purpose, `sections[${index}].purpose`, 500),
      sourceMaterialIds: stringArray(section.sourceMaterialIds, `sections[${index}].sourceMaterialIds`, 128),
      derivedBlocks: claims(section.derivedBlocks, `sections[${index}].derivedBlocks`, 0, 8),
    };
  });
  if (new Set(sections.map((section) => section.sectionId)).size !== sections.length) throw new Error("Grill preview contains duplicate section IDs.");
  if (!Array.isArray(input.unclassified) || input.unclassified.length > 128) throw new Error("Grill preview unclassified is invalid.");
  const unclassified = input.unclassified.map((value, index) => {
    const item = record(value, `unclassified[${index}]`);
    exactKeys(item, ["materialId", "reason", "evidenceRefs"], `unclassified[${index}]`);
    return { materialId: token(item.materialId, `unclassified[${index}].materialId`), reason: boundedText(item.reason, `unclassified[${index}].reason`, 600), evidenceRefs: references(item.evidenceRefs, `unclassified[${index}].evidenceRefs`) };
  });
  return {
    schemaVersion: GRILL_PREVIEW_SCHEMA_VERSION,
    title: claim(input.title, "title"),
    outcome: claim(input.outcome, "outcome"),
    boundary: { included: claims(boundary.included, "boundary.included", 1, 12), excluded: claims(boundary.excluded, "boundary.excluded", 0, 12) },
    completionEvidence: claims(input.completionEvidence, "completionEvidence", 1, 12),
    sections,
    unclassified,
  };
}

function validateAuthority(authority: GrillPreviewAuthority): void {
  if (authority.readiness !== "READY_FOR_PREVIEW") throw new Error("MiniProject Grill is not ready for preview.");
  if (!Number.isFinite(Date.parse(authority.observedAt))) throw new Error("Grill preview authority observedAt is invalid.");
  for (const value of [authority.contractVersion, authority.promptVersion, authority.skill.name, authority.skill.version, authority.provider.providerId, authority.provider.providerVersion, authority.provider.model, authority.subject.objectId]) token(value, "authority token");
  if (authority.subject.kind !== "MINI_PROJECT" || !Number.isSafeInteger(authority.subject.version) || authority.subject.version < 1) throw new Error("Grill preview subject is invalid.");
  if (!/^[a-f0-9]{64}$/.test(authority.sourceFingerprint) || authority.materials.length < 1 || authority.materials.length > 128 || authority.sessionFacts.length > 32) throw new Error("Grill preview authority bounds are invalid.");
  const materialIds = new Set<string>();
  const sourceRefs = new Set<string>();
  let rootCount = 0;
  let totalText = 0;
  for (const material of authority.materials) {
    const materialId = token(material.materialId, "materialId");
    const sourceRef = references([material.sourceRef], "material.sourceRef")[0]!;
    if (materialIds.has(materialId) || sourceRefs.has(sourceRef) || !/^[a-f0-9]{8,64}$/.test(material.contentHash) || typeof material.isRoot !== "boolean") throw new Error("Grill preview material authority is invalid.");
    materialIds.add(materialId);
    sourceRefs.add(sourceRef);
    token(material.currentSectionId, "material.currentSectionId");
    if (typeof material.exactText !== "string" || material.exactText.length > 8_192) throw new Error("Grill preview material text is invalid.");
    totalText += material.exactText.length;
    if (material.isRoot) rootCount += 1;
  }
  if (rootCount !== 1 || totalText > 192_000) throw new Error("Grill preview material authority must contain one bounded root.");
  const factIds = new Set<string>();
  for (const fact of authority.sessionFacts) {
    const id = token(fact.factId, "sessionFact.factId");
    if (factIds.has(id)) throw new Error("Grill preview session facts contain duplicates.");
    factIds.add(id);
    boundedText(fact.text, "sessionFact.text", 1_000);
    references(fact.sourceRefs, "sessionFact.sourceRefs");
  }
}

export function materializeGrillPreview(value: unknown, authority: GrillPreviewAuthority): GrillPreview {
  validateAuthority(authority);
  const draft = parseDraft(value);
  const materials = new Map(authority.materials.map((material) => [material.materialId, material]));
  const placements = draft.sections.flatMap((section) => section.sourceMaterialIds.map((materialId) => ({ materialId, sectionId: section.sectionId })));
  const allMaterialIds = [...placements.map((item) => item.materialId), ...draft.unclassified.map((item) => item.materialId)];
  if (allMaterialIds.some((id) => !materials.has(id))) throw new Error("Grill preview referenced an unknown source material.");
  if (allMaterialIds.length !== authority.materials.length || new Set(allMaterialIds).size !== authority.materials.length || authority.materials.some((material) => !allMaterialIds.includes(material.materialId))) {
    throw new Error("Grill preview must preserve every source material exactly once.");
  }
  const root = authority.materials.find((material) => material.isRoot)!;
  if (!placements.some((item) => item.materialId === root.materialId && item.sectionId === "root")) throw new Error("Grill preview root material must remain in the root section.");
  const allowedEvidence = new Set([...authority.materials.map((material) => material.sourceRef), ...authority.sessionFacts.flatMap((fact) => fact.sourceRefs)]);
  const everyClaim = [draft.title, draft.outcome, ...draft.boundary.included, ...draft.boundary.excluded, ...draft.completionEvidence, ...draft.sections.flatMap((section) => section.derivedBlocks), ...draft.unclassified.map((item) => ({ text: item.reason, evidenceRefs: item.evidenceRefs }))];
  for (const item of everyClaim) if (item.evidenceRefs.some((ref) => !allowedEvidence.has(ref))) throw new Error("Grill preview claim has unsupported evidence.");
  const scopeRefs = [...new Set([...authority.materials.map((material) => material.sourceRef), ...everyClaim.flatMap((item) => item.evidenceRefs)])].sort();
  const materialOutput = (material: GrillPreviewMaterialAuthority) => ({ materialId: material.materialId, sourceRef: material.sourceRef, contentHash: material.contentHash, text: material.exactText, preservation: "UNCHANGED" as const });
  return {
    schemaVersion: GRILL_PREVIEW_SCHEMA_VERSION,
    finalReading: {
      title: draft.title,
      outcome: draft.outcome,
      boundary: draft.boundary,
      completionEvidence: draft.completionEvidence,
      sections: draft.sections.map((section) => ({ sectionId: section.sectionId, heading: section.heading, purpose: section.purpose, sourceMaterials: section.sourceMaterialIds.map((id) => materialOutput(materials.get(id)!)), derivedBlocks: section.derivedBlocks })),
    },
    unclassified: draft.unclassified.map((item) => {
      const material = materials.get(item.materialId)!;
      return { materialId: material.materialId, sourceRef: material.sourceRef, contentHash: material.contentHash, text: material.exactText, reason: item.reason, evidenceRefs: item.evidenceRefs, preservation: "UNCHANGED_IN_PLACE" as const };
    }),
    impact: {
      sourceMaterialCount: authority.materials.length,
      movedMaterialCount: placements.filter(({ materialId, sectionId }) => materials.get(materialId)!.currentSectionId !== sectionId).length,
      addedDerivedBlockCount: draft.sections.reduce((total, section) => total + section.derivedBlocks.length, 0),
      deletedMaterialCount: 0,
      unclassifiedMaterialCount: draft.unclassified.length,
    },
    evidenceScope: { refs: scopeRefs, scopeHash: checksum(stableJson({ sourceFingerprint: authority.sourceFingerprint, refs: scopeRefs, materials: authority.materials.map(({ materialId, contentHash }) => ({ materialId, contentHash })) })), observedAt: authority.observedAt },
    authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: { contractVersion: authority.contractVersion, promptVersion: authority.promptVersion, skillName: authority.skill.name, skillVersion: authority.skill.version, providerId: authority.provider.providerId, providerVersion: authority.provider.providerVersion, model: authority.provider.model, generatedAt: authority.observedAt },
  };
}
