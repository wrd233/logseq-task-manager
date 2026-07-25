import {
  materializeProjectCreationPreview,
  type ProjectCreationPreview,
  type ProjectCreationPreviewAuthority,
} from "@task-copilot/application";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import type { StructuredCompletionMetadata } from "./deepseek-provider.ts";
import type { PromptLayer, StructuredProposalProvider } from "./llm-proposal.ts";

export interface ProjectCreationPreviewGenerationRequest {
  authority: Omit<ProjectCreationPreviewAuthority, "contractVersion" | "promptVersion" | "provider">;
  core: PromptLayer;
  skill: PromptLayer;
  userSemantics: PromptLayer;
  runtimeContext: PromptLayer;
  signal?: AbortSignal;
}

export interface GeneratedProjectCreationPreview {
  output: ProjectCreationPreview;
  provider: StructuredCompletionMetadata;
  promptBundleVersion: string;
}

function layer(value: PromptLayer, name: string): PromptLayer {
  if (!value || typeof value.version !== "string" || !value.version.trim() || value.version.length > 128 || typeof value.content !== "string" || !value.content.trim() || value.content.length > 80_000) {
    throw new StructuredError({
      code: "PROJECT_CREATION_PREVIEW_PROMPT_LAYER_INVALID",
      message: `Project Creation Preview ${name} prompt layer 无效；没有调用 Provider。`,
      ruleRefs: ["D-127", "D-130", "D-139"],
    });
  }
  return { version: value.version.trim(), content: value.content.trim() };
}

function withoutModelAuthority(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = { ...value as Record<string, unknown> };
  delete draft.provenance;
  delete draft.formalImpact;
  delete draft.evidenceScope;
  delete draft.authorityBoundary;
  return draft;
}

export class LocalLlmProjectCreationPreviewGenerator {
  constructor(private readonly provider: StructuredProposalProvider) {}

  async generate(request: ProjectCreationPreviewGenerationRequest): Promise<GeneratedProjectCreationPreview> {
    const core = layer(request.core, "Core");
    const skill = layer(request.skill, "Skill");
    const userSemantics = layer(request.userSemantics, "User Semantics");
    const runtimeContext = layer(request.runtimeContext, "Runtime Context");
    const promptBundleVersion = checksum(stableJson({
      contract: "task-copilot-project-creation-preview-v1",
      core,
      skill,
      userSemantics,
      runtimeContext,
    }));
    const authority: ProjectCreationPreviewAuthority = {
      ...request.authority,
      contractVersion: "1.0.0",
      promptVersion: promptBundleVersion,
      provider: {
        providerId: this.provider.providerId,
        providerVersion: this.provider.providerVersion,
        model: "pending-provider-result",
      },
    };
    const machineAuthority = {
      sourceKind: authority.sourceKind,
      sourceFingerprint: authority.sourceFingerprint,
      readiness: authority.readiness,
      materials: authority.materials.map(({ materialId, sourceRef, contentHash }) => ({ materialId, sourceRef, contentHash })),
      resolvedDimensions: authority.resolvedDimensions,
    };
    const allowedEvidenceRefs = [...new Set([
      "session:project-creation-entry",
      ...authority.materials.map(({ sourceRef }) => sourceRef),
      ...authority.resolvedDimensions.flatMap(({ evidenceRefs }) => evidenceRefs),
    ])].sort();
    const allowedRelationshipModes = authority.sourceKind === "BLANK"
      ? ["CREATE_DEDICATED_PROJECT_PAGE"]
      : authority.sourceKind === "PAGE"
        ? ["CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE", "REUSE_SOURCE_PAGE", "REVIEW_REQUIRED"]
        : ["CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE", "REVIEW_REQUIRED"];
    const outputContract = {
      schemaVersion: "task-copilot-project-creation-preview-v1",
      sourceKind: authority.sourceKind,
      allowedRelationshipModes,
      allowedEvidenceRefs,
      sourceMaterials: authority.materials.map(({ materialId }) => ({
        materialId,
        allowedDispositions: ["KEEP_IN_PLACE", "LINK_AS_SOURCE", "REVIEW_FOR_MOVE"],
      })),
      constraints: [
        "Return every listed source material exactly once and no others.",
        "For BLANK return sourceMaterials as an empty array and use CREATE_DEDICATED_PROJECT_PAGE.",
        "Every evidenceRefs item must come from allowedEvidenceRefs.",
        "All user-visible prose must use concise natural Simplified Chinese.",
      ],
    };
    const system = [
      "Return exactly one task-copilot-project-creation-preview-v1 JSON draft for a final Project creation reading preview.",
      "The seven machine-resolved dimensions are outcome, boundary, completion evidence, material disposition, internal closure, current interface, and Page/Object relationship.",
      "The only top-level fields are schemaVersion, title, outcome, boundary, completionEvidence, internalClosure, currentInterface, pageObjectRelationship, and sourceMaterials.",
      "Use this exact structural shape: {\"schemaVersion\":\"task-copilot-project-creation-preview-v1\",\"title\":{\"text\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]},\"outcome\":{\"text\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]},\"boundary\":{\"included\":[{\"text\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]}],\"excluded\":[]},\"completionEvidence\":[{\"text\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]}],\"internalClosure\":{\"text\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]},\"currentInterface\":{\"text\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]},\"pageObjectRelationship\":{\"mode\":\"one allowed relationship mode\",\"rationale\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]},\"sourceMaterials\":[{\"materialId\":\"one listed materialId\",\"disposition\":\"one allowed disposition\",\"rationale\":\"...\",\"evidenceRefs\":[\"allowed evidence ref\"]}]}.",
      "For BLANK use CREATE_DEDICATED_PROJECT_PAGE and return sourceMaterials []. For PAGE use only CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE, REUSE_SOURCE_PAGE, or REVIEW_REQUIRED according to supplied resolved evidence. For MINI_PROJECT use only CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE or REVIEW_REQUIRED; never claim that a MiniProject source Page can be reused as the Project Page.",
      "Preserve every supplied source material exactly once in sourceMaterials. Never copy, summarize, rewrite, move, or delete its exact text.",
      "Each claim, rationale, and disposition must cite only supplied sourceRef, answer ref, session ref, or contract ref evidence.",
      "All user-visible prose must use concise, natural Simplified Chinese. Proper names may retain their original spelling, but every prose field must contain Chinese.",
      "The Page/Object relationship and every source disposition are proposals for later user Review, never formal authority.",
      "The machine owns exact source text, hashes, formal zero-write impact, evidence scope, provenance, and authority boundary.",
      "Never emit Proposal, operations, Commit, Object ID, Page UUID, Focus, Ownership, Lifecycle, Condition, Anchor, Graph writes, or SQLite writes. 不得输出 Proposal 或任何正式写入命令。",
      `Core [${core.version}]\n${core.content}`,
      `Skill [${skill.version}]\n${skill.content}`,
      `User Semantics [${userSemantics.version}]\n${userSemantics.content}`,
    ].join("\n\n");
    const user = [
      `Runtime Context [${runtimeContext.version}]\n${runtimeContext.content}`,
      `machine previewAuthority\n${stableJson(machineAuthority)}`,
      `machine outputContract (final authority for the JSON response)\n${stableJson(outputContract)}`,
    ].join("\n\n");
    if (system.length + user.length > 240_000) {
      throw new StructuredError({
        code: "PROJECT_CREATION_PREVIEW_PROMPT_TOO_LARGE",
        message: "Project Creation Preview prompt 超过安全上限；没有调用 Provider。",
        ruleRefs: ["D-127", "D-130", "D-139"],
      });
    }
    const completion = await this.provider.completeStructured({
      system,
      user,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    try {
      const output = materializeProjectCreationPreview(withoutModelAuthority(completion.value), {
        ...authority,
        provider: { ...authority.provider, model: completion.metadata.model },
      });
      return { output, provider: completion.metadata, promptBundleVersion };
    } catch (error) {
      throw new StructuredError({
        code: "PROJECT_CREATION_PREVIEW_VALIDATION_FAILED",
        message: "Provider 输出未通过 Project Creation Preview Validator；没有生成 Proposal 或正式写入。",
        ruleRefs: ["D-125", "D-127", "D-130", "D-139"],
        details: { cause: error instanceof Error ? error.message : "unknown" },
      });
    }
  }
}
