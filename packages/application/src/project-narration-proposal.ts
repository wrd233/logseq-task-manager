import {
  validateV2ProposalForSubmission,
  validateV2ProjectStructure,
  type V2ManagedObject,
  type V2Proposal,
} from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import type { UnifiedUxOutput } from "./unified-ux-output.ts";

export interface BuildProjectNarrationProposalInput {
  project: V2ManagedObject;
  output: UnifiedUxOutput;
  createdAt: string;
}

export function buildProjectNarrationProposal(input: BuildProjectNarrationProposalInput): V2Proposal {
  const { project, output } = input;
  if (
    project.objectType !== "PROJECT"
    || project.lifecycle !== "OPEN"
    || !project.projectStructure
    || !Number.isFinite(Date.parse(input.createdAt))
  ) {
    throw new Error("Project 当前叙述只接受带版本当前接口的 OPEN Project。");
  }
  const previousProjectStructure = validateV2ProjectStructure(project.projectStructure);
  const projectStructure = validateV2ProjectStructure({
    ...previousProjectStructure,
    currentSummary: output.summary,
  });
  if (projectStructure.currentSummary === previousProjectStructure.currentSummary) {
    throw new Error("Provider 叙述与 Project 当前摘要相同；没有创建重复 Proposal。");
  }
  const factText = output.facts.slice(0, 2).map(({ text }) => text);
  const inferenceText = output.inferences.slice(0, 2).map(({ text }) => text);
  const identity = checksum({
    objectId: project.objectId,
    version: project.version,
    summary: projectStructure.currentSummary,
    scopeHash: output.evidenceScope.scopeHash,
    promptVersion: output.provenance.promptVersion,
  });
  return validateV2ProposalForSubmission({
    proposalId: `project-narration-${identity}`,
    schemaVersion: "v2",
    title: `更新 ${project.text} 当前摘要`,
    context: "Copilot 基于受限 Project Context Package 压缩当前理解；正式结构与正文未改变。",
    understanding: [
      factText.length ? `关键事实：${factText.join("；")}` : "没有选择额外正式事实。",
      inferenceText.length ? `受控推断：${inferenceText.join("；")}` : "没有加入额外推断。",
    ].join(" "),
    objective: "降低 Project 重入时的重新阅读成本，只更新一段当前摘要。",
    logic: "机器保留原 Objectives、Deliverables、Work Stages、当前推进和映射；只有摘要进入 MEDIUM Review。",
    finalPreview: `原摘要：${previousProjectStructure.currentSummary}\n建议摘要：${projectStructure.currentSummary}\n当前推进保持：${projectStructure.currentFocuses.join("；")}`,
    unresolvedQuestions: [...output.unknowns],
    source: {
      kind: "local_llm",
      provider: output.provenance.providerId,
      model: output.provenance.model,
      skillVersion: output.provenance.skillVersion,
      promptBundleVersion: output.provenance.promptVersion,
    },
    scope: {
      read: [],
      modify: [{ kind: "OBJECT", id: project.objectId, version: project.version }],
    },
    preconditions: ["Project 仍为 OPEN、版本未变化且完整结构保持原样"],
    groups: [{
      groupId: "update-project-narration",
      explanation: "只替换当前摘要；当前推进和全部结构字段保持不变。",
      risk: "MEDIUM",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [],
      semanticOperations: [{
        operationId: "update-project-narration",
        kind: "UPDATE_PROJECT_NARRATION",
        target: { kind: "OBJECT", id: project.objectId, version: project.version },
        summary: "更新 Project 当前摘要",
        payload: { previousProjectStructure, projectStructure },
        preconditions: ["Object version unchanged", "Project structural fields unchanged"],
      }],
      disposition: "PENDING",
    }],
    status: "READY",
    createdAt: input.createdAt,
  });
}
