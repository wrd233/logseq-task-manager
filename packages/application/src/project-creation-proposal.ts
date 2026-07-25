import {
  validateV2Proposal,
  validateV2ProjectStructure,
  validateV2ProposalForSubmission,
  type V2ProjectStructure,
  type V2Proposal,
  type V2ProposalScopeTarget,
} from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

import type { ProjectCreationPreview, ProjectCreationSourceKind } from "./project-creation-preview.ts";

export type ProjectCreationProposalSource =
  | { sourceKind: "BLANK" }
  | { sourceKind: "PAGE"; page: { id: string; name?: string; version?: number; hash: string } }
  | { sourceKind: "MINI_PROJECT"; objectId: string; objectVersion: number };

export interface ProjectCreationProposalInput {
  proposalId: string;
  preview: ProjectCreationPreview;
  source: ProjectCreationProposalSource;
  sourceFingerprint: string;
}

type ProjectCreationPageTarget = V2ProposalScopeTarget & { kind: "PAGE"; expectedExistence: "PRESENT" | "ABSENT" };
type ProjectCreationPageSourceTarget = V2ProposalScopeTarget & { kind: "PAGE"; expectedExistence: "PRESENT" };
type ProjectCreationMiniProjectSourceTarget = V2ProposalScopeTarget & { kind: "OBJECT"; version: number };
type ProjectCreationBlockSourceTarget = V2ProposalScopeTarget & { kind: "BLOCK"; hash: string };

export interface V2ProjectCreationPlan {
  proposalId: string;
  groupId: string;
  title: string;
  pageName: string;
  relationshipMode: Exclude<ProjectCreationPreview["pageObjectRelationship"]["mode"], "REVIEW_REQUIRED">;
  sourceKind: ProjectCreationSourceKind;
  sourceFingerprint: string;
  previewScopeHash: string;
  projectStructure: V2ProjectStructure;
  pageTarget: ProjectCreationPageTarget;
  sourcePageTarget?: ProjectCreationPageSourceTarget;
  sourceMiniProjectTarget?: ProjectCreationMiniProjectSourceTarget;
  sourceBlockTargets: ProjectCreationBlockSourceTarget[];
}

function projectCreationPlanError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-094", "D-185", "D-220"] });
}

export function planAcceptedV2ProjectCreation(proposal: V2Proposal): V2ProjectCreationPlan {
  validateV2Proposal(proposal);
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (!["ACCEPTED", "APPLIED"].includes(proposal.status) || accepted.length !== 1) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_SHAPE_INVALID", "Project 创建必须是唯一已接受的 HIGH 语义组。");
  }
  const group = accepted[0]!;
  if (
    proposal.groups.some((candidate) => candidate.groupId !== group.groupId && candidate.disposition !== "REJECTED")
    || group.risk !== "HIGH"
    || group.textPatches.length !== 0
    || group.semanticOperations.length !== 1
  ) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_OPERATION_INVALID", "Project 创建必须以独立 HIGH 组整体提交，其他组必须已拒绝。");
  }
  const operation = group.semanticOperations[0]!;
  const payload = operation.payload;
  const expectedPayloadKeys = ["objectType", "pageName", "previewScopeHash", "projectStructure", "relationshipMode", "sourceFingerprint", "sourceKind", "targetExpectation", "text"];
  if (operation.kind !== "CREATE_OBJECT" || Object.keys(payload).sort().join(",") !== expectedPayloadKeys.sort().join(",")) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_PAYLOAD_INVALID", "Project 创建必须只包含机器生成的完整创建 payload。");
  }
  const title = typeof payload.text === "string" ? payload.text.trim() : "";
  const pageName = typeof payload.pageName === "string" ? payload.pageName.trim() : "";
  const relationshipMode = payload.relationshipMode;
  const sourceKind = payload.sourceKind;
  const sourceFingerprint = payload.sourceFingerprint;
  const previewScopeHash = payload.previewScopeHash;
  if (
    payload.objectType !== "PROJECT"
    || !title || title.includes("\n") || title.length > 512
    || !pageName || pageName.includes("\n") || pageName.length > 512
    || !["CREATE_DEDICATED_PROJECT_PAGE", "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE", "REUSE_SOURCE_PAGE"].includes(String(relationshipMode))
    || !["BLANK", "PAGE", "MINI_PROJECT"].includes(String(sourceKind))
    || typeof sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(sourceFingerprint)
    || typeof previewScopeHash !== "string" || !/^[a-f0-9]{8}$/.test(previewScopeHash)
    || !payload.projectStructure || typeof payload.projectStructure !== "object" || Array.isArray(payload.projectStructure)
  ) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_PAYLOAD_INVALID", "Project 创建 payload 的名称、来源、关系或当前接口无效。");
  }
  if (operation.target.kind !== "PAGE" || !operation.target.expectedExistence || payload.targetExpectation !== operation.target.expectedExistence) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_TARGET_INVALID", "Project 创建必须绑定一个带存在性前置的 Page target。");
  }
  const pageTarget = operation.target as ProjectCreationPageTarget;
  if (
    (relationshipMode === "REUSE_SOURCE_PAGE" && (sourceKind !== "PAGE" || pageTarget.expectedExistence !== "PRESENT"))
    || (relationshipMode === "CREATE_DEDICATED_PROJECT_PAGE" && (sourceKind !== "BLANK" || pageTarget.expectedExistence !== "ABSENT" || pageTarget.id !== pageName))
    || (relationshipMode === "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE" && (!["PAGE", "MINI_PROJECT"].includes(String(sourceKind)) || pageTarget.expectedExistence !== "ABSENT" || pageTarget.id !== pageName))
  ) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_RELATIONSHIP_INVALID", "Project 创建来源、页面关系和 target 前置不一致。");
  }
  const pageSources = proposal.scope.read.filter((target): target is ProjectCreationPageSourceTarget => target.kind === "PAGE" && target.expectedExistence === "PRESENT");
  const miniSources = proposal.scope.read.filter((target): target is ProjectCreationMiniProjectSourceTarget => target.kind === "OBJECT" && target.version !== undefined);
  const blockSources = proposal.scope.read.filter((target): target is ProjectCreationBlockSourceTarget => target.kind === "BLOCK" && target.hash !== undefined);
  if (
    (sourceKind === "BLANK" && (proposal.scope.read.length !== 0 || pageSources.length !== 0 || miniSources.length !== 0 || blockSources.length !== 0))
    || (sourceKind === "PAGE" && (pageSources.length !== 1 || miniSources.length !== 0))
    || (sourceKind === "MINI_PROJECT" && (pageSources.length !== 0 || miniSources.length !== 1))
    || blockSources.length !== proposal.scope.read.filter((target) => target.kind === "BLOCK").length
  ) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_SOURCE_INVALID", "Project 创建 Proposal 的来源证据与 source kind 不一致。");
  }
  if (relationshipMode === "REUSE_SOURCE_PAGE" && pageSources[0]?.id !== pageTarget.id) {
    throw projectCreationPlanError("V2_PROJECT_CREATION_COMMIT_RELATIONSHIP_INVALID", "复用当前 Page 必须把同一个规范 Page identity 作为来源和创建 target。");
  }
  return {
    proposalId: proposal.proposalId,
    groupId: group.groupId,
    title,
    pageName,
    relationshipMode: relationshipMode as V2ProjectCreationPlan["relationshipMode"],
    sourceKind: sourceKind as ProjectCreationSourceKind,
    sourceFingerprint,
    previewScopeHash,
    projectStructure: validateV2ProjectStructure(payload.projectStructure as V2ProjectStructure),
    pageTarget,
    ...(pageSources[0] ? { sourcePageTarget: pageSources[0] } : {}),
    ...(miniSources[0] ? { sourceMiniProjectTarget: miniSources[0] } : {}),
    sourceBlockTargets: blockSources,
  };
}

function projectStructure(preview: ProjectCreationPreview): V2ProjectStructure {
  return validateV2ProjectStructure({
    objectives: [{
      objectiveId: "primary-outcome",
      text: preview.finalReading.outcome.text,
      priority: "PRIMARY",
      successEvidence: preview.finalReading.completionEvidence.map(({ text }) => text),
    }],
    deliverables: [],
    workStages: [],
    currentSummary: preview.finalReading.internalClosure.text,
    currentFocuses: [preview.finalReading.currentInterface.text],
    stageMappings: [],
  });
}

function requireSourceRelationship(sourceKind: ProjectCreationSourceKind, mode: ProjectCreationPreview["pageObjectRelationship"]["mode"]): void {
  if (mode === "REVIEW_REQUIRED") throw new Error("Project 创建的页面与对象关系仍需确认，不能进入正式 Proposal。");
  if (sourceKind === "BLANK" && mode !== "CREATE_DEDICATED_PROJECT_PAGE") {
    throw new Error("Project 创建 Preview 的页面关系与 Blank 来源不匹配。");
  }
  if (sourceKind === "PAGE" && !["CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE", "REUSE_SOURCE_PAGE"].includes(mode)) {
    throw new Error("Project 创建 Preview 的页面关系与 Page 来源不匹配。");
  }
  if (sourceKind === "MINI_PROJECT" && mode !== "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE") {
    throw new Error("Project 创建 Preview 的页面关系与 MiniProject 来源不匹配。");
  }
}

function readablePreview(preview: ProjectCreationPreview): string {
  const included = preview.finalReading.boundary.included.map(({ text }) => `- ${text}`).join("\n");
  const excluded = preview.finalReading.boundary.excluded.map(({ text }) => `- ${text}`).join("\n");
  const evidence = preview.finalReading.completionEvidence.map(({ text }) => `- ${text}`).join("\n");
  const materials = preview.sourceMaterials.map(({ text, disposition }) => `- ${text}（${disposition}）`).join("\n");
  return [
    `# ${preview.finalReading.title.text}`,
    `## 成果\n${preview.finalReading.outcome.text}`,
    `## 包含\n${included}`,
    ...(excluded ? [`## 不包含\n${excluded}`] : []),
    `## 完成证据\n${evidence}`,
    `## 内部闭环\n${preview.finalReading.internalClosure.text}`,
    `## 当前可进入工作\n${preview.finalReading.currentInterface.text}`,
    `## 页面关系\n${preview.pageObjectRelationship.rationale}`,
    ...(materials ? [`## 来源材料\n${materials}`] : []),
  ].join("\n\n");
}

export function buildProjectCreationProposal(input: ProjectCreationProposalInput): V2Proposal {
  const { preview, source } = input;
  const title = preview.finalReading.title.text.trim();
  if (!title || title.includes("\n") || title.length > 512) throw new Error("Project 创建 Proposal 的标题无效。");
  if (
    preview.authorityBoundary !== "SESSION_PREVIEW_ONLY"
    || preview.formalImpact.createsObject !== false
    || preview.formalImpact.createsPage !== false
    || preview.formalImpact.movesBlocks !== 0
    || preview.formalImpact.rewritesBlocks !== 0
    || preview.formalImpact.deletesBlocks !== 0
  ) throw new Error("Project 创建 Proposal 只能消费零正式影响的 session Preview。");
  if (!/^[a-f0-9]{64}$/.test(input.sourceFingerprint)) throw new Error("Project 创建 Proposal 的来源指纹无效。");
  requireSourceRelationship(source.sourceKind, preview.pageObjectRelationship.mode);
  if (source.sourceKind === "PAGE" && (
    !source.page.id.trim() || source.page.id.length > 512
    || (source.page.name !== undefined && (!source.page.name.trim() || source.page.name.length > 512))
    || (source.page.version !== undefined && (!Number.isSafeInteger(source.page.version) || source.page.version < 0))
    || !/^[a-f0-9]{8}$/.test(source.page.hash)
  )) throw new Error("Project 创建 Proposal 的 Page 来源无效。");
  if (source.sourceKind === "MINI_PROJECT" && (!source.objectId.trim() || !Number.isSafeInteger(source.objectVersion) || source.objectVersion < 1)) {
    throw new Error("Project 创建 Proposal 的 MiniProject 来源无效。");
  }
  if (preview.sourceMaterials.some(({ sourceRef, contentHash }) => !/^block:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sourceRef) || !/^[a-f0-9]{8}$/.test(contentHash))) {
    throw new Error("Project 创建 Proposal 的 Graph 材料 identity/hash 无法进入正式 Review scope。");
  }
  const pageName = preview.pageObjectRelationship.mode === "REUSE_SOURCE_PAGE" && source.sourceKind === "PAGE"
    ? (source.page.name ?? source.page.id).trim()
    : `Project/${title}`;
  const sourceTargets: V2ProposalScopeTarget[] = preview.sourceMaterials.map(({ sourceRef, contentHash }) => ({
    kind: "BLOCK",
    id: sourceRef.slice("block:".length),
    hash: contentHash,
  }));
  if (source.sourceKind === "PAGE") {
    sourceTargets.unshift({
      kind: "PAGE",
      id: source.page.id,
      expectedExistence: "PRESENT",
      ...(source.page.version !== undefined ? { version: source.page.version } : {}),
      hash: source.page.hash,
    });
  }
  if (source.sourceKind === "MINI_PROJECT") {
    sourceTargets.unshift({ kind: "OBJECT", id: source.objectId, version: source.objectVersion });
  }
  const structure = projectStructure(preview);
  const target: V2ProposalScopeTarget = preview.pageObjectRelationship.mode === "REUSE_SOURCE_PAGE" && source.sourceKind === "PAGE"
    ? {
      kind: "PAGE",
      id: source.page.id,
      expectedExistence: "PRESENT",
      ...(source.page.version !== undefined ? { version: source.page.version } : {}),
      hash: source.page.hash,
    }
    : { kind: "PAGE", id: pageName, expectedExistence: "ABSENT" };
  return validateV2ProposalForSubmission({
    proposalId: input.proposalId,
    schemaVersion: "v2",
    title: `建立 Project：${title}`,
    context: source.sourceKind === "BLANK" ? "从空白入口完成自适应 Grill Me。" : `从 ${source.sourceKind === "PAGE" ? "当前 Page" : "MiniProject"} 的有界材料完成自适应 Grill Me。`,
    understanding: preview.finalReading.outcome.text,
    objective: "建立一个可长期独立重入的 Project，并保留已确认的最小当前接口。",
    logic: "一个 HIGH 组同时审阅 Project 身份、页面关系和初始当前接口；接受只记录判断，正式应用仍经过原子页面/对象创建与恢复边界。",
    finalPreview: readablePreview(preview),
    unresolvedQuestions: [],
    source: {
      kind: "local_llm",
      provider: preview.provenance.providerId,
      model: preview.provenance.model,
      skillVersion: `${preview.provenance.skillName}@${preview.provenance.skillVersion}`,
      promptBundleVersion: preview.provenance.promptVersion,
    },
    scope: { read: sourceTargets, modify: [target] },
    preconditions: [
      "Preview handle、来源指纹与完整证据 scope 仍有效",
      "页面关系、Project 名称和初始当前接口必须作为一个 HIGH 判断整体审阅",
    ],
    groups: [{
      groupId: "create-project",
      explanation: "建立 Project、页面关系和初始当前接口不可拆分接受。",
      risk: "HIGH",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [],
      semanticOperations: [{
        operationId: "create-project",
        kind: "CREATE_OBJECT",
        target,
        summary: `建立 Project：${title}`,
        payload: {
          objectType: "PROJECT",
          text: title,
          pageName,
          targetExpectation: target.expectedExistence,
          relationshipMode: preview.pageObjectRelationship.mode,
          sourceKind: source.sourceKind,
          sourceFingerprint: input.sourceFingerprint,
          previewScopeHash: preview.evidenceScope.scopeHash,
          projectStructure: structure,
        },
        preconditions: ["来源、页面关系和 Preview scope 与审阅内容一致"],
      }],
      disposition: "PENDING",
    }],
    status: "READY",
    createdAt: preview.provenance.generatedAt,
  });
}
