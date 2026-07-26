import {
  materializeUnifiedUxOutput,
  type InteractionEvidenceEntry,
  type UnifiedUxFactAuthority,
  type UnifiedUxNextActionAuthority,
  type UnifiedUxOutput,
  type UnifiedUxRiskLevel,
} from "@task-copilot/application";
import { checksum, stableJson, StructuredError } from "@task-copilot/shared";

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
  interactionId?: string;
}

export interface InteractionEvidenceSink {
  record(entry: InteractionEvidenceEntry): unknown;
  recordWithHandle?(entry: InteractionEvidenceEntry, handle: string): unknown;
  isSuppressed?(input: {
    scene: InteractionEvidenceEntry["scene"];
    skill: NonNullable<InteractionEvidenceEntry["skill"]>;
  }): boolean;
}

type UnifiedUxValidationCategory =
  | "ACTION_REFERENCE"
  | "EVIDENCE_REFERENCE"
  | "FACT_REFERENCE"
  | "FIELD_SHAPE"
  | "FRONTSTAGE_PROSE"
  | "POLICY_MISMATCH"
  | "PROVENANCE"
  | "SCHEMA_VERSION"
  | "VALUE_CONSTRAINT";

function validationCategory(error: unknown): UnifiedUxValidationCategory {
  const message = error instanceof Error ? error.message : "";
  if (/unknown fact|fact identity/i.test(message)) return "FACT_REFERENCE";
  if (/evidence outside|evidence scope/i.test(message)) return "EVIDENCE_REFERENCE";
  if (/unknown next action|next-action eligibility|action identity/i.test(message)) return "ACTION_REFERENCE";
  if (/risk|requiresDiscussion|requiresReview|machine policy/i.test(message)) return "POLICY_MISMATCH";
  if (/provenance/i.test(message)) return "PROVENANCE";
  if (/schemaVersion/i.test(message)) return "SCHEMA_VERSION";
  if (/frontstage|machine identity|opaque|user-visible/i.test(message)) return "FRONTSTAGE_PROSE";
  if (/unsupported field|must be an object|shape/i.test(message)) return "FIELD_SHAPE";
  return "VALUE_CONSTRAINT";
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
  constructor(
    private readonly provider: StructuredProposalProvider,
    private readonly evidence?: InteractionEvidenceSink,
    private readonly createInteractionId: () => string = () => `uxi_${randomBytes(18).toString("base64url")}`,
  ) {}

  private recordEvidence(entry: InteractionEvidenceEntry): void {
    try {
      this.evidence?.record(entry);
    } catch {
      return;
    }
  }

  private recordGeneratedEvidence(entry: InteractionEvidenceEntry): string | undefined {
    try {
      if (!this.evidence?.recordWithHandle) {
        this.evidence?.record(entry);
        return undefined;
      }
      const interactionId = this.createInteractionId();
      this.evidence.recordWithHandle(entry, interactionId);
      return interactionId;
    } catch {
      return undefined;
    }
  }

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
    if (this.evidence?.isSuppressed?.({
      scene: "CONTEXT_RECOVERY",
      skill: { name: skill.name, version: skill.version },
    })) {
      throw new StructuredError({
        code: "UX_OUTPUT_SESSION_SUPPRESSED",
        message: "你已在当前 Service session 选择不再生成这类建议；撤回反馈或重启 Service 后可恢复。",
        ruleRefs: ["D-134", "D-139"],
      });
    }
    const system = [
      "Return exactly one task-copilot-ux-output-v1 JSON draft. Use only supplied factRefs, evidenceRefs, and nextActionId values.",
      "facts are selected by factRefs; never rewrite a formal fact as an inference. Unknowns must remain explicit.",
      "Opaque machine identities belong only in factRefs, evidenceRefs, and nextActionId. Never repeat an Object/Block/Page UUID, sourceRef, hash, Proposal/Commit/Anchor ID, or other machine token in summary, inference text, unknowns, or suggested-change prose.",
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
    let completion: Awaited<ReturnType<StructuredProposalProvider["completeStructured"]>>;
    try {
      completion = await this.provider.completeStructured({
        system,
        user,
        ...(request.signal ? { signal: request.signal } : {}),
      });
    } catch (error) {
      this.recordEvidence({
        timestamp: request.observedAt,
        scene: "CONTEXT_RECOVERY",
        outcome: "ERROR",
        skill: {
          name: skill.name,
          version: skill.version,
        },
        promptVersion: promptBundleVersion,
        failureCode: "UX_OUTPUT_PROVIDER_FAILED",
      });
      throw error;
    }
    let output: UnifiedUxOutput;
    try {
      output = materializeUnifiedUxOutput(completion.value, {
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
    } catch (error) {
      this.recordEvidence({
        timestamp: request.observedAt,
        scene: "CONTEXT_RECOVERY",
        outcome: "REJECTED",
        skill: {
          name: skill.name,
          version: skill.version,
        },
        promptVersion: promptBundleVersion,
        model: completion.metadata.model,
        failureCode: "UX_OUTPUT_VALIDATION_FAILED",
        elapsedMs: completion.metadata.durationMs,
      });
      throw new StructuredError({
        code: "UX_OUTPUT_VALIDATION_FAILED",
        message: "Provider 输出未通过 Unified UX Validator；没有生成恢复草稿。",
        ruleRefs: ["D-125", "D-127", "D-130", "D-139"],
        details: {
          cause: error instanceof Error ? error.message : "unknown",
          validationCategory: validationCategory(error),
        },
      });
    }
    const interactionId = this.recordGeneratedEvidence({
      timestamp: request.observedAt,
      scene: "CONTEXT_RECOVERY",
      outcome: "GENERATED",
      skill: {
        name: skill.name,
        version: skill.version,
      },
      promptVersion: promptBundleVersion,
      model: completion.metadata.model,
      evidence: {
        scopeHash: output.evidenceScope.scopeHash,
        factCount: output.facts.length,
        inferenceCount: output.inferences.length,
        unknownCount: output.unknowns.length,
        suggestedChangeCount: output.suggestedChanges.length,
        evidenceRefCount: output.evidenceScope.refs.length,
        nextActionEligible: output.nextActionEligible,
      },
      elapsedMs: completion.metadata.durationMs,
    });
    return {
      output,
      provider: completion.metadata,
      promptBundleVersion,
      ...(interactionId ? { interactionId } : {}),
    };
  }
}
import { randomBytes } from "node:crypto";
