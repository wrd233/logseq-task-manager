import {
  grillReadiness,
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
    const machineReadiness = grillReadiness(authority);
    const openUncertainties = authority.uncertainties.filter(({ status }) => status === "OPEN");
    const resolvedUncertaintyIds = authority.uncertainties
      .filter(({ status }) => status === "RESOLVED")
      .map(({ uncertaintyId }) => uncertaintyId);
    const allowedEvidenceRefs = [...new Set([
      ...authority.facts.flatMap(({ sourceRefs }) => sourceRefs),
      ...openUncertainties.flatMap(({ evidenceRefs }) => evidenceRefs),
      ...authority.unclassifiedMaterialRefs,
    ])].sort();
    const grillAuthority = {
      subject: authority.subject.kind === "PROJECT_CREATION"
        ? { kind: authority.subject.kind, sourceKind: authority.subject.sourceKind, sourceRefCount: authority.subject.sourceRefs.length }
        : { kind: authority.subject.kind, version: authority.subject.version },
      sourceFingerprint: authority.sourceFingerprint,
      facts: authority.facts.map(({ factId, sourceRefs }) => ({ factId, sourceRefs })),
      openUncertainties: openUncertainties.map(({ uncertaintyId, dimension, priority, critical, evidenceRefs }) => ({ uncertaintyId, dimension, priority, critical, evidenceRefs })),
      resolvedUncertaintyIds,
      unclassifiedMaterialRefs: authority.unclassifiedMaterialRefs,
      requiredFocusUncertaintyId: focus?.uncertaintyId,
    };
    const outputContract = {
      schemaVersion: "task-copilot-grill-turn-v1",
      machineReadiness,
      requiredFocusUncertaintyId: focus?.uncertaintyId ?? null,
      allowedFactIds: authority.facts.map(({ factId }) => factId),
      allowedOpenUncertaintyIds: openUncertainties.map(({ uncertaintyId }) => uncertaintyId),
      resolvedUncertaintyIds,
      allowedEvidenceRefs,
      shape: machineReadiness === "CONTINUE"
        ? {
          schemaVersion: "task-copilot-grill-turn-v1",
          understanding: "string",
          factRefs: ["allowedFactId"],
          inferences: [{ text: "string", evidenceRefs: ["allowedEvidenceRef"] }],
          unknowns: [{ uncertaintyId: "allowedOpenUncertaintyId", text: "string" }],
          readiness: "CONTINUE",
          focusUncertaintyId: focus?.uncertaintyId,
          questions: [{ uncertaintyId: "allowedOpenUncertaintyId", text: "string" }],
          recommendation: { text: "string", evidenceRefs: ["allowedEvidenceRef"], tradeoffs: ["string"] },
        }
        : {
          schemaVersion: "task-copilot-grill-turn-v1",
          understanding: "string",
          factRefs: ["allowedFactId"],
          inferences: [{ text: "string", evidenceRefs: ["allowedEvidenceRef"] }],
          unknowns: [],
          readiness: "READY_FOR_PREVIEW",
          questions: [],
        },
      constraints: machineReadiness === "CONTINUE"
        ? [
          "Top-level fields are limited to schemaVersion, understanding, factRefs, inferences, unknowns, readiness, focusUncertaintyId, questions, and recommendation; never emit format or any wrapper field.",
          "Copy machineReadiness into readiness exactly.",
          "Copy requiredFocusUncertaintyId into focusUncertaintyId and the first question exactly.",
          "Ask exactly one question, and it must use requiredFocusUncertaintyId.",
          "Resolved uncertainty IDs are forbidden in unknowns and questions.",
          "Use only allowedFactIds, allowedOpenUncertaintyIds, and allowedEvidenceRefs.",
        ]
        : [
          "Top-level fields are limited to schemaVersion, understanding, factRefs, inferences, unknowns, readiness, and questions; never emit format or any wrapper field.",
          "Copy machineReadiness into readiness exactly.",
          "Questions must be an empty array and unknowns must be an empty array; omit focusUncertaintyId and recommendation.",
          "Resolved uncertainty IDs are forbidden in unknowns and questions.",
          "Use only allowedFactIds and allowedEvidenceRefs.",
        ],
    };
    const turnInstruction = machineReadiness === "CONTINUE"
      ? "Follow the machine requiredFocusUncertaintyId: ask it first, state it in unknowns, and give one evidence-backed recommendation with at least one tradeoff."
      : "Machine readiness is READY_FOR_PREVIEW: return empty unknowns and questions, and omit focusUncertaintyId and recommendation. Summarize only why the bounded material is ready for a separate preview.";
    const system = [
      "Return exactly one task-copilot-grill-turn-v1 JSON draft for one bounded conversation turn.",
      turnInstruction,
      "Use only supplied factId, uncertaintyId, sourceRef, and evidenceRef values. Keep facts, inferences, and unknowns separate.",
      "All user-visible prose must use concise, natural Simplified Chinese. Proper names may retain their original spelling, but every prose field must contain Chinese.",
      "Machine identities and evidence references belong only in their structured ID/ref fields. Never repeat an Object ID, Block/Page UUID, sourceRef, hash, Proposal/Commit/Anchor ID, or other opaque machine token in user-visible prose.",
      "The final machine outputContract is authoritative. Copy its machineReadiness and requiredFocusUncertaintyId exactly. Resolved uncertainty IDs are forbidden in unknowns and questions.",
      "Machine code owns the largest open uncertainty, readiness, evidence scope, and provenance; model values cannot override them.",
      "Never emit Proposal, operations, Commit, Focus, Ownership, Lifecycle, Condition, Anchor, Graph writes, or SQLite writes. 不得输出 Proposal 或任何正式写入命令。",
      `Core [${core.version}]\n${core.content}`,
      `Skill [${skill.version}]\n${skill.content}`,
      `User Semantics [${userSemantics.version}]\n${userSemantics.content}`,
    ].join("\n\n");
    const user = [
      `Runtime Context [${runtimeContext.version}]\n${runtimeContext.content}`,
      `machine grillAuthority\n${stableJson(grillAuthority)}`,
      `machine outputContract (final authority for the JSON response)\n${stableJson(outputContract)}`,
    ].join("\n\n");
    if (system.length + user.length > 200_000) {
      throw new StructuredError({
        code: "GRILL_PROMPT_TOO_LARGE",
        message: "Grill prompt 超过安全上限；没有调用 Provider。",
        ruleRefs: ["D-127", "D-130", "D-139"],
      });
    }
    let validationCause: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await this.provider.completeStructured({
        system,
        user: validationCause
          ? [
            user,
            "machine repair instruction",
            "The previous draft failed the machine Validator. Return a completely new JSON draft that still follows the unchanged machine outputContract.",
            `Validator feedback: ${validationCause}`,
            "Do not repeat, quote, summarize, or otherwise reveal the rejected draft. Do not relax any evidence, identity, authority, readiness, or question constraint.",
          ].join("\n\n")
          : user,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      try {
        const output = materializeGrillTurn(withoutModelProvenance(completion.value), {
          ...authority,
          provider: { ...authority.provider, model: completion.metadata.model },
        });
        return { output, provider: completion.metadata, promptBundleVersion };
      } catch (error) {
        validationCause = error instanceof Error ? error.message : "unknown";
      }
    }
    throw new StructuredError({
      code: "GRILL_TURN_VALIDATION_FAILED",
      message: "Provider 输出未通过 Grill Turn Validator；没有进入结构预览或正式写入。",
      ruleRefs: ["D-125", "D-127", "D-130", "D-139"],
      details: { cause: validationCause ?? "unknown" },
    });
  }
}
