import {
  materializeGrillPreview,
  type GrillPreview,
  type GrillPreviewAuthority,
} from "@task-copilot/application";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import type { StructuredCompletionMetadata } from "./deepseek-provider.ts";
import type { PromptLayer, StructuredProposalProvider } from "./llm-proposal.ts";

export interface GrillPreviewGenerationRequest {
  authority: Omit<GrillPreviewAuthority, "contractVersion" | "promptVersion" | "provider">;
  core: PromptLayer;
  skill: PromptLayer;
  userSemantics: PromptLayer;
  runtimeContext: PromptLayer;
  signal?: AbortSignal;
}

export interface GeneratedGrillPreview {
  output: GrillPreview;
  provider: StructuredCompletionMetadata;
  promptBundleVersion: string;
}

function layer(value: PromptLayer, name: string): PromptLayer {
  if (!value || typeof value.version !== "string" || !value.version.trim() || value.version.length > 128 || typeof value.content !== "string" || !value.content.trim() || value.content.length > 80_000) {
    throw new StructuredError({ code: "GRILL_PREVIEW_PROMPT_LAYER_INVALID", message: `Grill Preview ${name} prompt layer 无效；没有调用 Provider。`, ruleRefs: ["D-127", "D-130", "D-139"] });
  }
  return { version: value.version.trim(), content: value.content.trim() };
}

function withoutModelAuthority(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = { ...value as Record<string, unknown> };
  delete draft.provenance;
  delete draft.impact;
  delete draft.evidenceScope;
  delete draft.authorityBoundary;
  return draft;
}

export class LocalLlmGrillPreviewGenerator {
  constructor(private readonly provider: StructuredProposalProvider) {}

  async generate(request: GrillPreviewGenerationRequest): Promise<GeneratedGrillPreview> {
    const core = layer(request.core, "Core");
    const skill = layer(request.skill, "Skill");
    const userSemantics = layer(request.userSemantics, "User Semantics");
    const runtimeContext = layer(request.runtimeContext, "Runtime Context");
    const promptBundleVersion = checksum(stableJson({ contract: "task-copilot-grill-preview-v1", core, skill, userSemantics, runtimeContext }));
    const authority: GrillPreviewAuthority = {
      ...request.authority,
      contractVersion: "1.0.0",
      promptVersion: promptBundleVersion,
      provider: { providerId: this.provider.providerId, providerVersion: this.provider.providerVersion, model: "pending-provider-result" },
    };
    const machineAuthority = {
      subject: { kind: authority.subject.kind, version: authority.subject.version },
      sourceFingerprint: authority.sourceFingerprint,
      readiness: authority.readiness,
      materials: authority.materials,
      sessionFacts: authority.sessionFacts.map(({ factId, sourceRefs }) => ({ factId, sourceRefs })),
    };
    const system = [
      "Return exactly one task-copilot-grill-preview-v1 JSON draft for a final reading preview.",
      "The only top-level fields are schemaVersion, title, outcome, boundary, completionEvidence, sections, and unclassified.",
      "Use this exact shape: {\"schemaVersion\":\"task-copilot-grill-preview-v1\",\"title\":{\"text\":\"...\",\"evidenceRefs\":[\"supplied-ref\"]},\"outcome\":{\"text\":\"...\",\"evidenceRefs\":[\"supplied-ref\"]},\"boundary\":{\"included\":[{\"text\":\"...\",\"evidenceRefs\":[\"supplied-ref\"]}],\"excluded\":[]},\"completionEvidence\":[{\"text\":\"...\",\"evidenceRefs\":[\"supplied-ref\"]}],\"sections\":[{\"sectionId\":\"root\",\"heading\":\"...\",\"purpose\":\"...\",\"sourceMaterialIds\":[\"root\"],\"derivedBlocks\":[]}],\"unclassified\":[{\"materialId\":\"supplied-material-id\",\"reason\":\"...\",\"evidenceRefs\":[\"supplied-ref\"]}]}.",
      "Preserve every source material exactly once: place each supplied materialId in one section or in unclassified. Never rewrite source material text.",
      "A source material excluded from the current outcome still MUST appear in unclassified; excluded never means omitted or deleted.",
      "Before returning, compare the supplied materialId set with all sourceMaterialIds plus unclassified materialIds: the sets must be exactly equal and contain no duplicate.",
      "Keep the root material in sectionId root. Unclassified material remains unchanged in place with an evidence-backed reason.",
      "Every title, outcome, boundary item, completion evidence, derived block, and unclassified reason must cite only supplied sourceRef or answer ref evidence.",
      "The machine owns exact source text, hashes, move/add/delete counts, evidence scope, provenance, and authority boundary.",
      "Never emit Proposal, operations, Commit, deletion, rewritten source, Focus, Ownership, Lifecycle, Condition, Anchor, Graph writes, or SQLite writes. 不得输出 Proposal 或任何正式写入命令。",
      `Core [${core.version}]\n${core.content}`,
      `Skill [${skill.version}]\n${skill.content}`,
      `User Semantics [${userSemantics.version}]\n${userSemantics.content}`,
    ].join("\n\n");
    const user = `Runtime Context [${runtimeContext.version}]\n${runtimeContext.content}\n\nmachine previewAuthority\n${stableJson(machineAuthority)}`;
    if (system.length + user.length > 240_000) throw new StructuredError({ code: "GRILL_PREVIEW_PROMPT_TOO_LARGE", message: "Grill Preview prompt 超过安全上限；没有调用 Provider。", ruleRefs: ["D-127", "D-130", "D-139"] });
    const completion = await this.provider.completeStructured({ system, user, ...(request.signal ? { signal: request.signal } : {}) });
    try {
      const output = materializeGrillPreview(withoutModelAuthority(completion.value), { ...authority, provider: { ...authority.provider, model: completion.metadata.model } });
      return { output, provider: completion.metadata, promptBundleVersion };
    } catch (error) {
      throw new StructuredError({
        code: "GRILL_PREVIEW_VALIDATION_FAILED",
        message: "Provider 输出未通过零丢失 Grill Preview Validator；没有生成 Proposal 或正式写入。",
        ruleRefs: ["D-125", "D-127", "D-130", "D-139"],
        details: { cause: error instanceof Error ? error.message : "unknown" },
      });
    }
  }
}
