import { createHash } from "node:crypto";

import { grillReadiness, type GrillFactAuthority, type GrillUncertaintyAuthority, type MiniProjectSourcePosition } from "@task-copilot/application";
import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";
import type { ServiceGraphSnapshot } from "@task-copilot/service-client";
import { stableJson } from "@task-copilot/shared";

import type { ServiceContextPackage } from "./context-package.ts";
import type { GrillTurnGenerationRequest } from "./llm-grill-turn.ts";
import type { GrillPreviewGenerationRequest } from "./llm-grill-preview.ts";
import type { TaskCopilotSkillDocument } from "./skill-catalog.ts";

export interface MiniProjectGrillAnswer {
  uncertaintyId: string;
  text: string;
}

export interface MiniProjectGrillSource {
  observedAt: string;
  subject: V2ManagedObject;
  objects: readonly V2ManagedObject[];
  anchors: readonly V2Anchor[];
  graphSnapshot: ServiceGraphSnapshot;
  contextPackage: ServiceContextPackage;
  contextFingerprint: string;
  coreSkill: TaskCopilotSkillDocument;
  grillSkill: TaskCopilotSkillDocument;
  answers: readonly MiniProjectGrillAnswer[];
}

export function buildMiniProjectSourcePositions(snapshot: ServiceGraphSnapshot): MiniProjectSourcePosition[] {
  if (snapshot.kind !== "BLOCK" || snapshot.blocks.length < 1 || snapshot.truncated) throw new Error("MiniProject restructure requires one complete Block subtree.");
  const previousByParent = new Map<string, string>();
  return snapshot.blocks.map((block, index) => {
    const isRoot = block.relation === "ROOT";
    const parentBlockUuid = isRoot ? null : block.parentUuid ?? null;
    const parentKey = parentBlockUuid ?? "__root__";
    const previousSiblingUuid = isRoot ? null : previousByParent.get(parentKey) ?? null;
    if (!isRoot) previousByParent.set(parentKey, block.uuid);
    return { materialId: isRoot ? "root" : `material-${index + 1}`, blockUuid: block.uuid, parentBlockUuid, previousSiblingUuid, exactText: block.content, contentHash: block.contentHash, isRoot };
  });
}

const uncertaintyDefinitions = [
  { uncertaintyId: "boundary", dimension: "BOUNDARY", priority: 10, critical: true, reason: "当前材料尚未形成可验证的工作边界。" },
  { uncertaintyId: "outcome", dimension: "OUTCOME", priority: 20, critical: true, reason: "当前材料尚未确认这次小型交付最终要形成什么结果。" },
  { uncertaintyId: "completion-evidence", dimension: "COMPLETION_EVIDENCE", priority: 30, critical: true, reason: "当前材料尚未确认用什么证据判断这次小型交付完成。" },
  { uncertaintyId: "material-disposition", dimension: "UNCLASSIFIED_MATERIAL", priority: 40, critical: false, reason: "子树中仍有内容没有安全去向。" },
] as const;

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function buildMiniProjectGrillGeneration(source: MiniProjectGrillSource): GrillTurnGenerationRequest {
  if (source.subject.objectType !== "MINI_PROJECT" || source.subject.lifecycle !== "OPEN") throw new Error("MiniProject Grill requires one open MiniProject.");
  if (source.graphSnapshot.kind !== "BLOCK") throw new Error("MiniProject Grill requires one bounded Block subtree.");
  const subjectAnchor = source.anchors.find((anchor) => anchor.objectId === source.subject.objectId && anchor.role === "primary_text" && anchor.status === "active");
  if (!subjectAnchor || subjectAnchor.externalId !== source.graphSnapshot.resolved.id) throw new Error("MiniProject Grill snapshot must match the active Primary Anchor.");
  if (source.answers.length > 4 || new Set(source.answers.map(({ uncertaintyId }) => uncertaintyId)).size !== source.answers.length) throw new Error("MiniProject Grill answers are invalid.");
  const knownUncertaintyIds = new Set(uncertaintyDefinitions.map(({ uncertaintyId }) => uncertaintyId));
  for (const answer of source.answers) {
    if (!knownUncertaintyIds.has(answer.uncertaintyId as typeof uncertaintyDefinitions[number]["uncertaintyId"]) || !answer.text.trim() || answer.text.length > 2_000) throw new Error("MiniProject Grill answer is invalid.");
  }
  const answerById = new Map(source.answers.map((answer) => [answer.uncertaintyId, answer.text.trim()]));
  const formalBlockIds = new Set(source.anchors.filter((anchor) => anchor.status === "active").map((anchor) => anchor.externalId));
  const unclassifiedMaterialRefs = source.graphSnapshot.blocks
    .filter((block) => !formalBlockIds.has(block.uuid))
    .map((block) => `block:${block.uuid}`)
    .sort();
  const subjectRef = `object:${source.subject.objectId}@v${source.subject.version}`;
  const facts: GrillFactAuthority[] = source.objects.slice(0, 32).map((object, index) => ({
    factId: index === 0 && object.objectId === source.subject.objectId ? "subject" : `formal-${index + 1}`,
    text: object.text,
    sourceRefs: [`object:${object.objectId}@v${object.version}`],
  }));
  for (const definition of uncertaintyDefinitions) {
    const answer = answerById.get(definition.uncertaintyId);
    if (answer) facts.push({ factId: `answer-${definition.uncertaintyId}`, text: answer, sourceRefs: [`answer:${sha256({ uncertaintyId: definition.uncertaintyId, answer }).slice(0, 16)}`] });
  }
  const uncertainties: GrillUncertaintyAuthority[] = uncertaintyDefinitions.map((definition) => {
    const materiallyAbsent = definition.uncertaintyId === "material-disposition" && unclassifiedMaterialRefs.length === 0;
    const answer = answerById.get(definition.uncertaintyId);
    const answerRef = answer ? `answer:${sha256({ uncertaintyId: definition.uncertaintyId, answer }).slice(0, 16)}` : undefined;
    return {
      uncertaintyId: definition.uncertaintyId,
      dimension: definition.dimension,
      status: answer || materiallyAbsent ? "RESOLVED" : "OPEN",
      priority: definition.uncertaintyId === "boundary" && unclassifiedMaterialRefs.length > 0 ? 5 : definition.priority,
      critical: definition.critical,
      evidenceRefs: answerRef ? [answerRef] : definition.uncertaintyId === "material-disposition" && unclassifiedMaterialRefs.length > 0 ? unclassifiedMaterialRefs : [subjectRef],
    };
  });
  const packageFiles = Object.fromEntries(Object.entries(source.contextPackage.files).filter(([path]) => !path.startsWith("skills/")));
  const userSemantics = [source.contextPackage.files["workspace-semantics.md"], source.contextPackage.files["writing-profile.md"]].filter((value): value is string => value !== undefined).join("\n");
  const sourceFingerprint = sha256({ contextFingerprint: source.contextFingerprint, answers: [...source.answers] });
  return {
    authority: {
      observedAt: source.observedAt,
      skill: { name: source.grillSkill.name, version: source.grillSkill.version },
      subject: { kind: "MINI_PROJECT", objectId: source.subject.objectId, version: source.subject.version },
      sourceFingerprint,
      facts,
      uncertainties,
      unclassifiedMaterialRefs: answerById.has("material-disposition") ? [] : unclassifiedMaterialRefs,
    },
    core: { version: source.coreSkill.version, content: source.coreSkill.content },
    skill: { version: source.grillSkill.version, content: source.grillSkill.content },
    userSemantics: { version: sha256(userSemantics), content: userSemantics },
    runtimeContext: {
      version: `context:${sourceFingerprint}`,
      content: stableJson({
        authority: "SESSION_DRAFT_ONLY",
        contextFingerprint: source.contextFingerprint,
        manifest: source.contextPackage.manifest,
        files: packageFiles,
        answers: source.answers,
        uncertaintyReasons: Object.fromEntries(uncertaintyDefinitions.map(({ uncertaintyId, reason }) => [uncertaintyId, reason])),
      }),
    },
  };
}

export function buildMiniProjectGrillPreviewGeneration(source: MiniProjectGrillSource): GrillPreviewGenerationRequest {
  const turn = buildMiniProjectGrillGeneration(source);
  if (grillReadiness({
    ...turn.authority,
    contractVersion: "1.0.0",
    promptVersion: "preview-readiness",
    provider: { providerId: "machine", providerVersion: "machine", model: "machine" },
  }) !== "READY_FOR_PREVIEW") throw new Error("MiniProject Grill is not ready for preview.");
  if (source.graphSnapshot.truncated) throw new Error("MiniProject Grill preview refuses a truncated source subtree.");
  const materialIdByUuid = new Map<string, string>();
  for (const [index, block] of source.graphSnapshot.blocks.entries()) materialIdByUuid.set(block.uuid, block.relation === "ROOT" ? "root" : `material-${index + 1}`);
  const materials = source.graphSnapshot.blocks.map((block) => ({
    materialId: materialIdByUuid.get(block.uuid)!,
    sourceRef: `block:${block.uuid}`,
    contentHash: block.contentHash,
    exactText: block.content,
    currentSectionId: block.relation === "ROOT" ? "root" : block.parentUuid ? materialIdByUuid.get(block.parentUuid) ?? "root" : "root",
    isRoot: block.relation === "ROOT",
  }));
  return {
    authority: {
      observedAt: turn.authority.observedAt,
      skill: turn.authority.skill,
      subject: { kind: "MINI_PROJECT", objectId: source.subject.objectId, version: source.subject.version },
      sourceFingerprint: turn.authority.sourceFingerprint,
      readiness: "READY_FOR_PREVIEW",
      materials,
      sessionFacts: turn.authority.facts.map((fact) => ({ factId: fact.factId, text: fact.text, sourceRefs: [...fact.sourceRefs] })),
    },
    core: turn.core,
    skill: turn.skill,
    userSemantics: turn.userSemantics,
    runtimeContext: {
      version: `preview:${turn.authority.sourceFingerprint}`,
      content: stableJson({ authority: "SESSION_PREVIEW_ONLY", context: JSON.parse(turn.runtimeContext.content) as unknown, exactMaterials: materials, sessionFacts: turn.authority.facts }),
    },
  };
}
