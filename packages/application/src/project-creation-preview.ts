import { checksum, stableJson } from "@task-copilot/shared";

import { assertFrontstageProse } from "./frontstage-prose.ts";

export const PROJECT_CREATION_PREVIEW_SCHEMA_VERSION = "task-copilot-project-creation-preview-v1" as const;

export type ProjectCreationSourceKind = "BLANK" | "PAGE" | "MINI_PROJECT";
export type ProjectCreationDimension =
  | "OUTCOME"
  | "BOUNDARY"
  | "COMPLETION_EVIDENCE"
  | "UNCLASSIFIED_MATERIAL"
  | "INTERNAL_CLOSURE"
  | "CURRENT_INTERFACE"
  | "PAGE_OBJECT_RELATIONSHIP";

export interface ProjectCreationPreviewClaim {
  text: string;
  evidenceRefs: string[];
}

export interface ProjectCreationPreviewAuthority {
  observedAt: string;
  contractVersion: string;
  promptVersion: string;
  skill: { name: string; version: string };
  provider: { providerId: string; providerVersion: string; model: string };
  sourceKind: ProjectCreationSourceKind;
  sourceFingerprint: string;
  readiness: "CONTINUE" | "READY_FOR_PREVIEW";
  materials: Array<{
    materialId: string;
    sourceRef: string;
    contentHash: string;
    exactText: string;
  }>;
  resolvedDimensions: Array<{
    dimension: ProjectCreationDimension;
    text: string;
    evidenceRefs: string[];
  }>;
}

export type ProjectPageObjectRelationshipMode =
  | "CREATE_DEDICATED_PROJECT_PAGE"
  | "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE"
  | "REUSE_SOURCE_PAGE"
  | "REVIEW_REQUIRED";

export interface ProjectCreationPreview {
  schemaVersion: typeof PROJECT_CREATION_PREVIEW_SCHEMA_VERSION;
  finalReading: {
    title: ProjectCreationPreviewClaim;
    outcome: ProjectCreationPreviewClaim;
    boundary: { included: ProjectCreationPreviewClaim[]; excluded: ProjectCreationPreviewClaim[] };
    completionEvidence: ProjectCreationPreviewClaim[];
    internalClosure: ProjectCreationPreviewClaim;
    currentInterface: ProjectCreationPreviewClaim;
  };
  pageObjectRelationship: {
    mode: ProjectPageObjectRelationshipMode;
    rationale: string;
    evidenceRefs: string[];
    authority: "PROPOSED_FOR_REVIEW";
  };
  sourceMaterials: Array<{
    materialId: string;
    sourceRef: string;
    contentHash: string;
    text: string;
    disposition: "KEEP_IN_PLACE" | "LINK_AS_SOURCE" | "REVIEW_FOR_MOVE";
    rationale: string;
    evidenceRefs: string[];
    preservation: "UNCHANGED";
  }>;
  formalImpact: {
    createsObject: false;
    createsPage: false;
    movesBlocks: 0;
    rewritesBlocks: 0;
    deletesBlocks: 0;
  };
  evidenceScope: { refs: string[]; scopeHash: string; observedAt: string };
  authorityBoundary: "SESSION_PREVIEW_ONLY";
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

interface ProjectCreationPreviewDraft {
  schemaVersion: typeof PROJECT_CREATION_PREVIEW_SCHEMA_VERSION;
  title: ProjectCreationPreviewClaim;
  outcome: ProjectCreationPreviewClaim;
  boundary: { included: ProjectCreationPreviewClaim[]; excluded: ProjectCreationPreviewClaim[] };
  completionEvidence: ProjectCreationPreviewClaim[];
  internalClosure: ProjectCreationPreviewClaim;
  currentInterface: ProjectCreationPreviewClaim;
  pageObjectRelationship: {
    mode: ProjectPageObjectRelationshipMode;
    rationale: string;
    evidenceRefs: string[];
  };
  sourceMaterials: Array<{
    materialId: string;
    disposition: "KEEP_IN_PLACE" | "LINK_AS_SOURCE" | "REVIEW_FOR_MOVE";
    rationale: string;
    evidenceRefs: string[];
  }>;
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[^\s]{1,223}$/u;
const REQUIRED_DIMENSIONS: readonly ProjectCreationDimension[] = [
  "OUTCOME",
  "BOUNDARY",
  "COMPLETION_EVIDENCE",
  "UNCLASSIFIED_MATERIAL",
  "INTERNAL_CLOSURE",
  "CURRENT_INTERFACE",
  "PAGE_OBJECT_RELATIONSHIP",
];
const RELATIONSHIP_MODES: readonly ProjectPageObjectRelationshipMode[] = [
  "CREATE_DEDICATED_PROJECT_PAGE",
  "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE",
  "REUSE_SOURCE_PAGE",
  "REVIEW_REQUIRED",
];
const DISPOSITIONS = ["KEEP_IN_PLACE", "LINK_AS_SOURCE", "REVIEW_FOR_MOVE"] as const;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Project creation preview ${name} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`Project creation preview ${name} contains unsupported field ${unexpected}.`);
}

function boundedText(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Project creation preview ${name} is invalid.`);
  return value.trim();
}

function naturalChinese(value: unknown, name: string, maximum: number): string {
  const result = boundedText(value, name, maximum);
  if (!/\p{Script=Han}/u.test(result)) throw new Error(`Project creation preview ${name} must use natural Chinese.`);
  return assertFrontstageProse(result, `Project creation preview ${name}`);
}

function token(value: unknown, name: string): string {
  const result = boundedText(value, name, 128);
  if (!TOKEN.test(result)) throw new Error(`Project creation preview ${name} must be a machine token.`);
  return result;
}

function references(value: unknown, name: string, minimum = 1, maximum = 16): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`Project creation preview ${name} is invalid.`);
  const refs = value.map((item, index) => {
    const ref = boundedText(item, `${name}[${index}]`, 256);
    if (!REF.test(ref)) throw new Error(`Project creation preview ${name}[${index}] is not a bounded reference.`);
    return ref;
  });
  if (new Set(refs).size !== refs.length) throw new Error(`Project creation preview ${name} contains duplicates.`);
  return refs;
}

function claim(value: unknown, name: string): ProjectCreationPreviewClaim {
  const input = record(value, name);
  exactKeys(input, ["text", "evidenceRefs"], name);
  return {
    text: naturalChinese(input.text, `${name}.text`, 1_000),
    evidenceRefs: references(input.evidenceRefs, `${name}.evidenceRefs`),
  };
}

function claims(value: unknown, name: string, minimum: number, maximum: number): ProjectCreationPreviewClaim[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`Project creation preview ${name} is invalid.`);
  return value.map((item, index) => claim(item, `${name}[${index}]`));
}

function parseDraft(value: unknown): ProjectCreationPreviewDraft {
  const input = record(value, "draft");
  exactKeys(input, [
    "schemaVersion",
    "title",
    "outcome",
    "boundary",
    "completionEvidence",
    "internalClosure",
    "currentInterface",
    "pageObjectRelationship",
    "sourceMaterials",
  ], "draft");
  if (input.schemaVersion !== PROJECT_CREATION_PREVIEW_SCHEMA_VERSION) throw new Error("Project creation preview schemaVersion is unsupported.");
  const boundary = record(input.boundary, "boundary");
  exactKeys(boundary, ["included", "excluded"], "boundary");
  const relationship = record(input.pageObjectRelationship, "pageObjectRelationship");
  exactKeys(relationship, ["mode", "rationale", "evidenceRefs"], "pageObjectRelationship");
  if (!RELATIONSHIP_MODES.includes(relationship.mode as ProjectPageObjectRelationshipMode)) throw new Error("Project creation preview relationship mode is invalid.");
  if (!Array.isArray(input.sourceMaterials) || input.sourceMaterials.length > 16) throw new Error("Project creation preview sourceMaterials is invalid.");
  const sourceMaterials = input.sourceMaterials.map((value, index) => {
    const material = record(value, `sourceMaterials[${index}]`);
    exactKeys(material, ["materialId", "disposition", "rationale", "evidenceRefs"], `sourceMaterials[${index}]`);
    if (!DISPOSITIONS.includes(material.disposition as typeof DISPOSITIONS[number])) throw new Error("Project creation preview material disposition is invalid.");
    return {
      materialId: token(material.materialId, `sourceMaterials[${index}].materialId`),
      disposition: material.disposition as typeof DISPOSITIONS[number],
      rationale: naturalChinese(material.rationale, `sourceMaterials[${index}].rationale`, 600),
      evidenceRefs: references(material.evidenceRefs, `sourceMaterials[${index}].evidenceRefs`),
    };
  });
  return {
    schemaVersion: PROJECT_CREATION_PREVIEW_SCHEMA_VERSION,
    title: claim(input.title, "title"),
    outcome: claim(input.outcome, "outcome"),
    boundary: {
      included: claims(boundary.included, "boundary.included", 1, 12),
      excluded: claims(boundary.excluded, "boundary.excluded", 0, 12),
    },
    completionEvidence: claims(input.completionEvidence, "completionEvidence", 1, 12),
    internalClosure: claim(input.internalClosure, "internalClosure"),
    currentInterface: claim(input.currentInterface, "currentInterface"),
    pageObjectRelationship: {
      mode: relationship.mode as ProjectPageObjectRelationshipMode,
      rationale: naturalChinese(relationship.rationale, "pageObjectRelationship.rationale", 600),
      evidenceRefs: references(relationship.evidenceRefs, "pageObjectRelationship.evidenceRefs"),
    },
    sourceMaterials,
  };
}

function validateAuthority(authority: ProjectCreationPreviewAuthority): void {
  if (authority.readiness !== "READY_FOR_PREVIEW") throw new Error("Project creation Grill is not ready for preview.");
  if (!Number.isFinite(Date.parse(authority.observedAt))) throw new Error("Project creation preview observedAt is invalid.");
  for (const value of [authority.contractVersion, authority.promptVersion, authority.skill.name, authority.skill.version, authority.provider.providerId, authority.provider.providerVersion, authority.provider.model]) {
    token(value, "authority token");
  }
  if (!["BLANK", "PAGE", "MINI_PROJECT"].includes(authority.sourceKind) || !/^[a-f0-9]{64}$/.test(authority.sourceFingerprint)) {
    throw new Error("Project creation preview authority is invalid.");
  }
  if ((authority.sourceKind === "BLANK" && authority.materials.length !== 0) || (authority.sourceKind !== "BLANK" && (authority.materials.length < 1 || authority.materials.length > 16))) {
    throw new Error("Project creation preview source boundary is invalid.");
  }
  const materialIds = new Set<string>();
  const sourceRefs = new Set<string>();
  let totalText = 0;
  for (const material of authority.materials) {
    const materialId = token(material.materialId, "material.materialId");
    const sourceRef = references([material.sourceRef], "material.sourceRef")[0]!;
    if (materialIds.has(materialId) || sourceRefs.has(sourceRef) || !/^[a-f0-9]{8,64}$/.test(material.contentHash) || typeof material.exactText !== "string" || !material.exactText.trim() || material.exactText.length > 4_000) {
      throw new Error("Project creation preview source material is invalid.");
    }
    materialIds.add(materialId);
    sourceRefs.add(sourceRef);
    totalText += material.exactText.length;
  }
  if (totalText > 64_000) throw new Error("Project creation preview source material is too large.");
  if (authority.resolvedDimensions.length !== REQUIRED_DIMENSIONS.length) throw new Error("Project creation preview requires all seven resolved dimensions.");
  const dimensions = new Set<ProjectCreationDimension>();
  for (const dimension of authority.resolvedDimensions) {
    if (!REQUIRED_DIMENSIONS.includes(dimension.dimension) || dimensions.has(dimension.dimension)) throw new Error("Project creation preview requires all seven resolved dimensions exactly once.");
    dimensions.add(dimension.dimension);
    boundedText(dimension.text, "resolvedDimension.text", 2_000);
    references(dimension.evidenceRefs, "resolvedDimension.evidenceRefs");
  }
  if (REQUIRED_DIMENSIONS.some((dimension) => !dimensions.has(dimension))) throw new Error("Project creation preview requires all seven resolved dimensions.");
}

export function materializeProjectCreationPreview(value: unknown, authority: ProjectCreationPreviewAuthority): ProjectCreationPreview {
  validateAuthority(authority);
  const draft = parseDraft(value);
  const materials = new Map(authority.materials.map((material) => [material.materialId, material]));
  const ids = draft.sourceMaterials.map(({ materialId }) => materialId);
  if (ids.some((id) => !materials.has(id))) throw new Error("Project creation preview referenced an unknown source material.");
  if (ids.length !== authority.materials.length || new Set(ids).size !== authority.materials.length || authority.materials.some(({ materialId }) => !ids.includes(materialId))) {
    throw new Error("Project creation preview must preserve every source material exactly once.");
  }
  if (authority.sourceKind === "BLANK" && draft.pageObjectRelationship.mode !== "CREATE_DEDICATED_PROJECT_PAGE") {
    throw new Error("Blank Project creation preview cannot claim an existing source page relationship.");
  }
  if (authority.sourceKind === "PAGE" && !["CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE", "REUSE_SOURCE_PAGE", "REVIEW_REQUIRED"].includes(draft.pageObjectRelationship.mode)) {
    throw new Error("Page source Project creation preview must preserve or explicitly upgrade the current Page.");
  }
  if (authority.sourceKind === "MINI_PROJECT" && draft.pageObjectRelationship.mode !== "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE") {
    throw new Error("MiniProject source Project creation preview must preserve the source while creating a dedicated Project Page.");
  }
  if (authority.sourceKind === "MINI_PROJECT" && draft.sourceMaterials.some(({ disposition }) => disposition === "REVIEW_FOR_MOVE")) {
    throw new Error("MiniProject source Project creation preview cannot propose moving preserved source material.");
  }
  const allowedEvidence = new Set([
    "session:project-creation-entry",
    ...authority.materials.map(({ sourceRef }) => sourceRef),
    ...authority.resolvedDimensions.flatMap(({ evidenceRefs }) => evidenceRefs),
  ]);
  const everyClaim = [
    draft.title,
    draft.outcome,
    ...draft.boundary.included,
    ...draft.boundary.excluded,
    ...draft.completionEvidence,
    draft.internalClosure,
    draft.currentInterface,
    { text: draft.pageObjectRelationship.rationale, evidenceRefs: draft.pageObjectRelationship.evidenceRefs },
    ...draft.sourceMaterials.map(({ rationale, evidenceRefs }) => ({ text: rationale, evidenceRefs })),
  ];
  for (const item of everyClaim) if (item.evidenceRefs.some((ref) => !allowedEvidence.has(ref))) throw new Error("Project creation preview claim has unsupported evidence.");
  const scopeRefs = [...new Set(everyClaim.flatMap(({ evidenceRefs }) => evidenceRefs))].sort();
  return {
    schemaVersion: PROJECT_CREATION_PREVIEW_SCHEMA_VERSION,
    finalReading: {
      title: draft.title,
      outcome: draft.outcome,
      boundary: draft.boundary,
      completionEvidence: draft.completionEvidence,
      internalClosure: draft.internalClosure,
      currentInterface: draft.currentInterface,
    },
    pageObjectRelationship: {
      ...draft.pageObjectRelationship,
      authority: "PROPOSED_FOR_REVIEW",
    },
    sourceMaterials: draft.sourceMaterials.map((item) => {
      const source = materials.get(item.materialId)!;
      return {
        ...item,
        sourceRef: source.sourceRef,
        contentHash: source.contentHash,
        text: source.exactText,
        preservation: "UNCHANGED",
      };
    }),
    formalImpact: { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 },
    evidenceScope: {
      refs: scopeRefs,
      scopeHash: checksum(stableJson({
        sourceKind: authority.sourceKind,
        sourceFingerprint: authority.sourceFingerprint,
        refs: scopeRefs,
        materials: authority.materials.map(({ materialId, sourceRef, contentHash }) => ({ materialId, sourceRef, contentHash })),
      })),
      observedAt: authority.observedAt,
    },
    authorityBoundary: "SESSION_PREVIEW_ONLY",
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
