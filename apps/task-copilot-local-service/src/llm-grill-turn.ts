import {
  materializeGrillTurn,
  requiredGrillFocus,
  type GrillTurn,
  type GrillTurnAuthority,
} from "@task-copilot/application";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import type { StructuredCompletionMetadata } from "./deepseek-provider.ts";
import type { PromptLayer, StructuredProposalProvider } from "./llm-proposal.ts";

export interface GrillTurnGenerationRequest {
  authority: Omit<GrillTurnAuthority, "contractVersion" | "promptVersion" | "provider">;
  core: PromptLayer;
  skill: PromptLayer;
  userSemantics: PromptLayer;
  runtimeContext: PromptLayer;
  signal?: AbortSignal;
}

export interface GeneratedGrillTurn {
  output: GrillTurn;
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
    throw new StructuredError({
      code: "GRILL_PROMPT_LAYER_INVALID",
      message: `Grill ${name} prompt layer 无效；没有调用 Provider。`,
      ruleRefs: ["D-127", "D-130", "D-139"],
    });
  }
  return { version: value.version.trim(), content: value.content.trim() };
}

function withoutModelProvenance(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = { ...value as Record<string, unknown> };
  delete draft.provenance;
  return draft;
}

export class LocalLlmGrillTurnGenerator {
  constructor(private readonly provider: StructuredProposalProvider) {}

  async generate(request: GrillTurnGenerationRequest): Promise<GeneratedGrillTurn> {
    const core = layer(request.core, "Core");
    const skill = layer(request.skill, "Skill");
    const userSemantics = layer(request.userSemantics, "User Semantics");
    const runtimeContext = layer(request.runtimeContext, "Runtime Context");
    const promptBundleVersion = checksum(stableJson({
      contract: "task-copilot-grill-turn-v1",
      core,
      skill,
      userSemantics,
      runtimeContext,
    }));
    const authority: GrillTurnAuthority = {
      ...request.authority,
      contractVersion: "1.0.0",
      promptVersion: promptBundleVersion,
      provider: {
        providerId: this.provider.providerId,
        providerVersion: this.provider.providerVersion,
        model: "pending-provider-result",
      },
    };
    const focus = requiredGrillFocus(authority);
    const grillAuthority = {
      subject: { kind: authority.subject.kind, version: authority.subject.version },
      sourceFingerprint: authority.sourceFingerprint,
      facts: authority.facts.map(({ factId, sourceRefs }) => ({ factId, sourceRefs })),
      uncertainties: authority.uncertainties.map(({ uncertaintyId, dimension, status, priority, critical, evidenceRefs }) => ({ uncertaintyId, dimension, status, priority, critical, evidenceRefs })),
      unclassifiedMaterialRefs: authority.unclassifiedMaterialRefs,
      requiredFocusUncertaintyId: focus?.uncertaintyId,
    };
    const system = [
      "Return exactly one task-copilot-grill-turn-v1 JSON draft for one bounded conversation turn.",
      "Follow the machine requiredFocusUncertaintyId: ask it first, state it in unknowns, and give one evidence-backed recommendation with at least one tradeoff.",
      "Use only supplied factId, uncertaintyId, sourceRef, and evidenceRef values. Keep facts, inferences, and unknowns separate.",
      "Machine code owns the largest open uncertainty, readiness, evidence scope, and provenance; model values cannot override them.",
      "Never emit Proposal, operations, Commit, Focus, Ownership, Lifecycle, Condition, Anchor, Graph writes, or SQLite writes. 不得输出 Proposal 或任何正式写入命令。",
      "When machine readiness is READY_FOR_PREVIEW, return no focusUncertaintyId, questions, or recommendation.",
      `Core [${core.version}]\n${core.content}`,
      `Skill [${skill.version}]\n${skill.content}`,
      `User Semantics [${userSemantics.version}]\n${userSemantics.content}`,
    ].join("\n\n");
    const user = `Runtime Context [${runtimeContext.version}]\n${runtimeContext.content}\n\nmachine grillAuthority\n${stableJson(grillAuthority)}`;
    if (system.length + user.length > 200_000) {
      throw new StructuredError({
        code: "GRILL_PROMPT_TOO_LARGE",
        message: "Grill prompt 超过安全上限；没有调用 Provider。",
        ruleRefs: ["D-127", "D-130", "D-139"],
      });
    }
    const completion = await this.provider.completeStructured({
      system,
      user,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    try {
      const output = materializeGrillTurn(withoutModelProvenance(completion.value), {
        ...authority,
        provider: { ...authority.provider, model: completion.metadata.model },
      });
      return { output, provider: completion.metadata, promptBundleVersion };
    } catch (error) {
      throw new StructuredError({
        code: "GRILL_TURN_VALIDATION_FAILED",
        message: "Provider 输出未通过 Grill Turn Validator；没有进入结构预览或正式写入。",
        ruleRefs: ["D-125", "D-127", "D-130", "D-139"],
        details: { cause: error instanceof Error ? error.message : "unknown" },
      });
    }
  }
}
