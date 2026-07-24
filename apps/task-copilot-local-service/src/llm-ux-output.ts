import {
  materializeUnifiedUxOutput,
  type UnifiedUxFactAuthority,
  type UnifiedUxNextActionAuthority,
  type UnifiedUxOutput,
  type UnifiedUxRiskLevel,
} from "@task-copilot/application";
import { checksum, stableJson } from "@task-copilot/shared";

import type { StructuredCompletionMetadata } from "./deepseek-provider.ts";
import type { PromptLayer, StructuredProposalProvider } from "./llm-proposal.ts";

export interface UxOutputGenerationRequest {
  observedAt: string;
  core: PromptLayer;
  skill: PromptLayer & {
    name: string;
  };
  userSemantics: PromptLayer;
  runtimeContext: PromptLayer;
  minimumRiskLevel: UnifiedUxRiskLevel;
  requiresDiscussion: boolean;
  requiresReview: boolean;
  facts: UnifiedUxFactAuthority[];
  allowedNextActions: UnifiedUxNextActionAuthority[];
  signal?: AbortSignal;
}

export interface GeneratedUnifiedUxOutput {
  output: UnifiedUxOutput;
  provider: StructuredCompletionMetadata;
  promptBundleVersion: string;
}

function layer(value: PromptLayer, name: string): PromptLayer {
  if (
    !value
    || typeof value.version !== "string"
    || !value.version.trim()
    || value.version.length > 128
    || typeof value.content !== "string"
    || !value.content.trim()
    || value.content.length > 50_000
  ) {
    throw new Error(`Unified UX ${name} prompt layer is invalid.`);
  }
  return {
    version: value.version.trim(),
    content: value.content.trim(),
  };
}

export class LocalLlmUxOutputGenerator {
  constructor(private readonly provider: StructuredProposalProvider) {}

  async generate(request: UxOutputGenerationRequest): Promise<GeneratedUnifiedUxOutput> {
    const core = layer(request.core, "Core");
    const skill = {
      ...layer(request.skill, "Skill"),
      name: request.skill.name.trim(),
    };
    if (!skill.name || skill.name.length > 64) throw new Error("Unified UX Skill name is invalid.");
    const userSemantics = layer(request.userSemantics, "User Semantics");
    const runtimeContext = layer(request.runtimeContext, "Runtime Context");
    const promptBundleVersion = checksum(stableJson({
      contract: "task-copilot-ux-output-v1",
      core,
      skill,
      userSemantics,
      runtimeContext,
    }));
    const system = [
      "Return exactly one task-copilot-ux-output-v1 JSON draft. Use only supplied factRefs, evidenceRefs, and nextActionId values.",
      "facts are selected by factRefs; never rewrite a formal fact as an inference. Unknowns must remain explicit.",
      "nextActionEligible must be false unless one supplied action is concrete, evidence-backed, and reduces decision cost.",
      "suggestedChanges may contain only DRAFT_PROPOSAL items. A suggestion is not a command or a completed change.",
      "Provenance, scope hash, risk floor, review requirement, fact text, and action targets are machine-owned; model values are ignored.",
      "You can draft understanding, but never write formal Graph or SQLite state directly.",
      `Core [${core.version}]\n${core.content}`,
      `Skill ${skill.name} [${skill.version}]\n${skill.content}`,
      `User Semantics [${userSemantics.version}]\n${userSemantics.content}`,
    ].join("\n\n");
    const user = `Runtime Context [${runtimeContext.version}]\n${runtimeContext.content}`;
    if (system.length + user.length > 200_000) throw new Error("Unified UX prompt exceeds the bounded input size.");
    const completion = await this.provider.completeStructured({
      system,
      user,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const output = materializeUnifiedUxOutput(completion.value, {
      observedAt: request.observedAt,
      contractVersion: "1.0.0",
      promptVersion: promptBundleVersion,
      skill: {
        name: skill.name,
        version: skill.version,
      },
      provider: {
        providerId: this.provider.providerId,
        providerVersion: this.provider.providerVersion,
        model: completion.metadata.model,
      },
      minimumRiskLevel: request.minimumRiskLevel,
      requiresDiscussion: request.requiresDiscussion,
      requiresReview: request.requiresReview,
      facts: request.facts,
      allowedNextActions: request.allowedNextActions,
    });
    return {
      output,
      provider: completion.metadata,
      promptBundleVersion,
    };
  }
}
