import { createHash } from "node:crypto";

import type {
  GrillFactAuthority,
  GrillUncertaintyAuthority,
  GrillUncertaintyDimension,
} from "@task-copilot/application";
import { grillReadiness, type ProjectCreationDimension } from "@task-copilot/application";
import { stableJson } from "@task-copilot/shared";

import type { ServiceContextPackage } from "./context-package.ts";
import type { GrillTurnGenerationRequest } from "./llm-grill-turn.ts";
import type { ProjectCreationPreviewGenerationRequest } from "./llm-project-creation-preview.ts";
import type { TaskCopilotSkillDocument } from "./skill-catalog.ts";

export interface ProjectCreationGrillAnswer {
  uncertaintyId: string;
  text: string;
}

export interface ProjectCreationGrillMaterial {
  sourceRef: string;
  kind: "PAGE" | "MINI_PROJECT";
  text: string;
  contentHash: string;
}

export interface ProjectCreationGrillSource {
  observedAt: string;
  sourceKind: "BLANK" | "PAGE" | "MINI_PROJECT";
  materials: readonly ProjectCreationGrillMaterial[];
  contextPackage: ServiceContextPackage;
  contextFingerprint: string;
  coreSkill: TaskCopilotSkillDocument;
  grillSkill: TaskCopilotSkillDocument;
  answers: readonly ProjectCreationGrillAnswer[];
}

interface UncertaintyDefinition {
  uncertaintyId: string;
  dimension: GrillUncertaintyDimension;
  priority: number;
  critical: boolean;
  reason: string;
}

const definitionsBySource: Record<ProjectCreationGrillSource["sourceKind"], readonly UncertaintyDefinition[]> = {
  BLANK: [
    { uncertaintyId: "outcome", dimension: "OUTCOME", priority: 10, critical: true, reason: "尚未确认 Project 要持续形成的结果。" },
    { uncertaintyId: "project-boundary", dimension: "BOUNDARY", priority: 20, critical: true, reason: "尚未确认 Project 覆盖与不覆盖的范围。" },
    { uncertaintyId: "completion-evidence", dimension: "COMPLETION_EVIDENCE", priority: 30, critical: true, reason: "尚未确认结果达成或阶段完成的证据。" },
    { uncertaintyId: "internal-closure", dimension: "INTERNAL_CLOSURE", priority: 40, critical: true, reason: "尚未确认 Project 内部如何形成持续闭环。" },
    { uncertaintyId: "current-interface", dimension: "CURRENT_INTERFACE", priority: 50, critical: true, reason: "尚未确认用户重入 Project 时首先需要看到什么。" },
    { uncertaintyId: "page-object-relationship", dimension: "PAGE_OBJECT_RELATIONSHIP", priority: 55, critical: false, reason: "空白创建使用受控 Project Page 与正式对象的一对一关系。" },
    { uncertaintyId: "material-disposition", dimension: "UNCLASSIFIED_MATERIAL", priority: 60, critical: false, reason: "空白创建没有待归类来源材料。" },
  ],
  PAGE: [
    { uncertaintyId: "material-disposition", dimension: "UNCLASSIFIED_MATERIAL", priority: 5, critical: true, reason: "当前 Page 材料尚未确认如何进入 Project。" },
    { uncertaintyId: "page-object-relationship", dimension: "PAGE_OBJECT_RELATIONSHIP", priority: 6, critical: true, reason: "尚未确认当前 Page 与新 Project 正式页面和对象的关系。" },
    { uncertaintyId: "outcome", dimension: "OUTCOME", priority: 10, critical: true, reason: "现有 Page 尚未明确 Project 要持续形成的结果。" },
    { uncertaintyId: "project-boundary", dimension: "BOUNDARY", priority: 20, critical: true, reason: "现有材料尚未划定 Project 边界。" },
    { uncertaintyId: "completion-evidence", dimension: "COMPLETION_EVIDENCE", priority: 30, critical: true, reason: "尚未确认结果达成或阶段完成的证据。" },
    { uncertaintyId: "internal-closure", dimension: "INTERNAL_CLOSURE", priority: 40, critical: true, reason: "尚未确认 Project 内部如何形成持续闭环。" },
    { uncertaintyId: "current-interface", dimension: "CURRENT_INTERFACE", priority: 50, critical: true, reason: "尚未确认用户重入 Project 时首先需要看到什么。" },
  ],
  MINI_PROJECT: [
    { uncertaintyId: "project-boundary", dimension: "BOUNDARY", priority: 5, critical: true, reason: "尚未确认为何当前 MiniProject 应升级为持续治理的 Project。" },
    { uncertaintyId: "page-object-relationship", dimension: "PAGE_OBJECT_RELATIONSHIP", priority: 6, critical: false, reason: "原 MiniProject 正文与正式对象保持原样；创建链只允许另建受控 Project Page 与正式 Project 对象。" },
    { uncertaintyId: "current-interface", dimension: "CURRENT_INTERFACE", priority: 10, critical: true, reason: "尚未确认升级后用户重入 Project 时首先需要看到什么。" },
    { uncertaintyId: "internal-closure", dimension: "INTERNAL_CLOSURE", priority: 20, critical: true, reason: "尚未确认升级后的内部推进与复盘闭环。" },
    { uncertaintyId: "outcome", dimension: "OUTCOME", priority: 30, critical: true, reason: "尚未确认升级后要持续形成的结果。" },
    { uncertaintyId: "completion-evidence", dimension: "COMPLETION_EVIDENCE", priority: 40, critical: true, reason: "尚未确认结果达成或阶段完成的证据。" },
    { uncertaintyId: "material-disposition", dimension: "UNCLASSIFIED_MATERIAL", priority: 50, critical: true, reason: "尚未确认原 MiniProject 材料在新 Project 中的去向。" },
  ],
};

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableContextFile(content: string): unknown {
  try {
    const parsed = JSON.parse(content) as unknown;
    const stripTransportTime = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(stripTransportTime);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !["generatedAt", "readAt", "contextFingerprint"].includes(key))
        .map(([key, nested]) => [key, stripTransportTime(nested)]));
    };
    return stripTransportTime(parsed);
  } catch {
    return content;
  }
}

function validateSource(source: ProjectCreationGrillSource): void {
  if (!Number.isFinite(Date.parse(source.observedAt))) throw new Error("Project creation observedAt is invalid.");
  if (!/^[a-f0-9]{64}$/.test(source.contextFingerprint)) throw new Error("Project creation context fingerprint is invalid.");
  if (source.materials.length > 16) throw new Error("Project creation source material exceeds the bounded scope.");
  if (source.sourceKind === "BLANK" && source.materials.length > 0) throw new Error("Blank Project creation cannot claim source material.");
  if (source.sourceKind !== "BLANK" && source.materials.length < 1) throw new Error("Project creation requires bounded source material.");
  const refs = new Set<string>();
  for (const material of source.materials) {
    if (material.kind !== source.sourceKind) throw new Error("Project creation source material kind does not match its entry.");
    if (!/^[a-z][a-z0-9_-]{0,31}:[^\s]{1,223}$/u.test(material.sourceRef) || refs.has(material.sourceRef)) throw new Error("Project creation source material reference is invalid.");
    if (!material.text.trim() || material.text.length > 4_000 || !/^(?:[a-f0-9]{8}|[a-f0-9]{64})$/.test(material.contentHash)) throw new Error("Project creation source material is invalid.");
    refs.add(material.sourceRef);
  }
  if (source.answers.length > 7 || new Set(source.answers.map(({ uncertaintyId }) => uncertaintyId)).size !== source.answers.length) throw new Error("Project creation Grill answers are invalid.");
}

export function buildProjectCreationGrillGeneration(source: ProjectCreationGrillSource): GrillTurnGenerationRequest {
  validateSource(source);
  const definitions = definitionsBySource[source.sourceKind];
  const knownUncertaintyIds = new Set(definitions.map(({ uncertaintyId }) => uncertaintyId));
  for (const answer of source.answers) {
    if (!knownUncertaintyIds.has(answer.uncertaintyId) || !answer.text.trim() || answer.text.length > 2_000) throw new Error("Project creation Grill answer is invalid.");
  }

  const answerById = new Map(source.answers.map((answer) => [answer.uncertaintyId, answer.text.trim()]));
  const sourceRefs = source.materials.map(({ sourceRef }) => sourceRef).sort();
  const facts: GrillFactAuthority[] = [{
    factId: "creation-entry",
    text: source.sourceKind === "BLANK" ? "用户从空白入口发起 Project 创建。" : `用户从 ${source.sourceKind} 材料发起 Project 创建。`,
    sourceRefs: ["session:project-creation-entry"],
  }, {
    factId: "project-page-contract",
    text: source.sourceKind === "MINI_PROJECT"
      ? "原 MiniProject 正文与正式对象保持原样；正式创建链只在 Review 接受后另建受控 Project Page 与正式 Project 对象。"
      : "正式创建链只在 Review 接受后绑定一个受控 Project Page 与一个正式 Project 对象。",
    sourceRefs: ["contract:project-page-creation-v1"],
  }];
  for (const [index, material] of source.materials.entries()) {
    facts.push({ factId: `source-${index + 1}`, text: material.text.trim(), sourceRefs: [material.sourceRef] });
  }
  for (const definition of definitions) {
    const answer = answerById.get(definition.uncertaintyId);
    if (answer) {
      facts.push({
        factId: `answer-${definition.uncertaintyId}`,
        text: answer,
        sourceRefs: [`answer:${sha256({ uncertaintyId: definition.uncertaintyId, answer }).slice(0, 16)}`],
      });
    }
  }

  const uncertainties: GrillUncertaintyAuthority[] = definitions.map((definition) => {
    const answer = answerById.get(definition.uncertaintyId);
    const machineResolved = source.sourceKind === "BLANK"
      ? definition.dimension === "UNCLASSIFIED_MATERIAL" || definition.dimension === "PAGE_OBJECT_RELATIONSHIP"
      : source.sourceKind === "MINI_PROJECT" && definition.dimension === "PAGE_OBJECT_RELATIONSHIP";
    const answerRef = answer ? `answer:${sha256({ uncertaintyId: definition.uncertaintyId, answer }).slice(0, 16)}` : undefined;
    return {
      uncertaintyId: definition.uncertaintyId,
      dimension: definition.dimension,
      status: answer || machineResolved ? "RESOLVED" : "OPEN",
      priority: definition.priority,
      critical: definition.critical,
      evidenceRefs: answerRef
        ? [answerRef]
        : definition.dimension === "PAGE_OBJECT_RELATIONSHIP"
          ? ["contract:project-page-creation-v1"]
          : sourceRefs,
    };
  });
  const unclassifiedMaterialRefs = answerById.has("material-disposition") || source.sourceKind === "BLANK" ? [] : sourceRefs;
  const packageFiles = Object.fromEntries(Object.entries(source.contextPackage.files).filter(([path]) => !path.startsWith("skills/")));
  const userSemantics = [source.contextPackage.files["workspace-semantics.md"], source.contextPackage.files["writing-profile.md"]]
    .filter((value): value is string => value !== undefined)
    .join("\n");
  const sourceFingerprint = sha256({
    sourceKind: source.sourceKind,
    materials: source.materials.map(({ sourceRef, contentHash }) => ({ sourceRef, contentHash })),
    contextAuthority: {
      manifest: {
        schemaVersion: source.contextPackage.manifest.schemaVersion,
        scope: source.contextPackage.manifest.scope,
        authority: source.contextPackage.manifest.authority,
        formalFactsSource: source.contextPackage.manifest.formalFactsSource,
        graphExcerptStatus: source.contextPackage.manifest.graphExcerptStatus,
        includedObjectCount: source.contextPackage.manifest.includedObjectCount,
      },
      files: Object.fromEntries(Object.entries(packageFiles)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, content]) => [path, stableContextFile(content)])),
    },
    skills: [
      { name: source.coreSkill.name, version: source.coreSkill.version, sha256: source.coreSkill.sha256 },
      { name: source.grillSkill.name, version: source.grillSkill.version, sha256: source.grillSkill.sha256 },
    ],
    answers: [...source.answers].sort((left, right) => left.uncertaintyId.localeCompare(right.uncertaintyId)),
  });

  return {
    authority: {
      observedAt: source.observedAt,
      skill: { name: source.grillSkill.name, version: source.grillSkill.version },
      subject: { kind: "PROJECT_CREATION", sourceKind: source.sourceKind, sourceRefs },
      sourceFingerprint,
      facts,
      uncertainties,
      unclassifiedMaterialRefs,
    },
    core: { version: source.coreSkill.version, content: source.coreSkill.content },
    skill: { version: source.grillSkill.version, content: source.grillSkill.content },
    userSemantics: { version: sha256(userSemantics), content: userSemantics || "not configured" },
    runtimeContext: {
      version: `context:${sourceFingerprint}`,
      content: stableJson({
        authority: "SESSION_DRAFT_ONLY",
        sourceKind: source.sourceKind,
        contextFingerprint: source.contextFingerprint,
        manifest: source.contextPackage.manifest,
        files: packageFiles,
        materials: source.materials,
        answers: source.answers,
        uncertaintyReasons: Object.fromEntries(definitions.map(({ uncertaintyId, reason }) => [uncertaintyId, reason])),
      }),
    },
  };
}

export function buildProjectCreationPreviewGeneration(source: ProjectCreationGrillSource): ProjectCreationPreviewGenerationRequest {
  const turn = buildProjectCreationGrillGeneration(source);
  const readiness = grillReadiness({
    ...turn.authority,
    contractVersion: "project-creation-preview-readiness-1.0.0",
    promptVersion: "project-creation-preview-readiness-1.0.0",
    provider: { providerId: "machine", providerVersion: "1.0.0", model: "not-called" },
  });
  if (readiness !== "READY_FOR_PREVIEW") throw new Error("Project creation Grill is not ready for preview.");
  const resolvedDimensions = turn.authority.uncertainties.map((uncertainty) => {
    const answerFact = turn.authority.facts.find(({ factId }) => factId === `answer-${uncertainty.uncertaintyId}`);
    if (answerFact) {
      return {
        dimension: uncertainty.dimension as ProjectCreationDimension,
        text: answerFact.text,
        evidenceRefs: [...answerFact.sourceRefs],
      };
    }
    if (source.sourceKind === "BLANK" && uncertainty.dimension === "UNCLASSIFIED_MATERIAL") {
      return {
        dimension: uncertainty.dimension as ProjectCreationDimension,
        text: "空白创建没有来源材料。",
        evidenceRefs: ["session:project-creation-entry"],
      };
    }
    if (source.sourceKind === "BLANK" && uncertainty.dimension === "PAGE_OBJECT_RELATIONSHIP") {
      return {
        dimension: uncertainty.dimension as ProjectCreationDimension,
        text: "正式创建链绑定一个受控 Project Page 与一个正式 Project 对象。",
        evidenceRefs: ["contract:project-page-creation-v1"],
      };
    }
    if (source.sourceKind === "MINI_PROJECT" && uncertainty.dimension === "PAGE_OBJECT_RELATIONSHIP") {
      return {
        dimension: uncertainty.dimension as ProjectCreationDimension,
        text: "原 MiniProject 正文与正式对象保持原样；正式创建链只允许另建受控 Project Page 与正式 Project 对象。",
        evidenceRefs: ["contract:project-page-creation-v1"],
      };
    }
    throw new Error(`Project creation preview is missing resolved evidence for ${uncertainty.uncertaintyId}.`);
  });
  return {
    authority: {
      observedAt: source.observedAt,
      skill: { name: source.grillSkill.name, version: source.grillSkill.version },
      sourceKind: source.sourceKind,
      sourceFingerprint: turn.authority.sourceFingerprint,
      readiness,
      materials: source.materials.map((material, index) => ({
        materialId: `source-${index + 1}`,
        sourceRef: material.sourceRef,
        contentHash: material.contentHash,
        exactText: material.text,
      })),
      resolvedDimensions,
    },
    core: turn.core,
    skill: turn.skill,
    userSemantics: turn.userSemantics,
    runtimeContext: turn.runtimeContext,
  };
}
