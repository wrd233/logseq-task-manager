import {
  validateV2ProjectStructure,
  validateV2ProposalForSubmission,
  type V2ProjectStructure,
  type V2Proposal,
  type V2ProposalScopeTarget,
} from "@task-copilot/domain";

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
