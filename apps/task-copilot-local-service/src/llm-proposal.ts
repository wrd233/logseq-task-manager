import type { V2ProposalApplication, V2StoredProposalRecord } from "@task-copilot/application";
import { renderV2ProposalFiles, validateV2ProposalForSubmission, type V2Proposal, type V2ProposalFiles } from "@task-copilot/domain";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import type { StructuredChatRequest, StructuredCompletion, StructuredCompletionMetadata } from "./deepseek-provider.ts";

export interface PromptLayer {
  version: string;
  content: string;
}

export interface V2PromptBundle {
  core: PromptLayer;
  domain: PromptLayer;
  skill: PromptLayer;
  userSemantics: PromptLayer;
  runtimeContext: PromptLayer;
}

export interface ReviewReadyProposalRequest {
  proposalId: string;
  createdAt: string;
  prompt: V2PromptBundle;
  signal?: AbortSignal;
}

export interface ReviewReadyProposal {
  kind: "PROPOSAL";
  proposal: V2Proposal;
  files: V2ProposalFiles;
  provider: StructuredCompletionMetadata;
  promptBundleVersion: string;
}

export interface NoProposalResult {
  kind: "NO_PROPOSAL";
  reason: string;
  provider: StructuredCompletionMetadata;
  promptBundleVersion: string;
}

export type LocalLlmGenerationResult = ReviewReadyProposal | NoProposalResult;
export type LocalLlmSubmissionResult =
  | { generated: ReviewReadyProposal; record: V2StoredProposalRecord; replayed: boolean }
  | { generated: NoProposalResult; replayed: false };

export interface StructuredProposalProvider {
  readonly providerId: string;
  readonly providerVersion: string;
  completeStructured(request: StructuredChatRequest): Promise<StructuredCompletion>;
}

function generationError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-120", "D-127", "D-130", "D-136", "D-139", "D-142"] });
}

function validateLayer(name: string, layer: PromptLayer): PromptLayer {
  if (!layer || typeof layer.version !== "string" || !layer.version.trim() || layer.version.length > 128
    || typeof layer.content !== "string" || !layer.content.trim() || layer.content.length > 50_000) {
    throw generationError("LLM_PROMPT_LAYER_INVALID", `Prompt ${name} 层缺少有效版本或内容。`);
  }
  return { version: layer.version.trim(), content: layer.content.trim() };
}

export function assembleV2ProposalPrompt(bundle: V2PromptBundle): { system: string; user: string; promptBundleVersion: string } {
  const layers = {
    core: validateLayer("Core", bundle.core),
    domain: validateLayer("Domain", bundle.domain),
    skill: validateLayer("Skill", bundle.skill),
    userSemantics: validateLayer("User Semantics", bundle.userSemantics),
    runtimeContext: validateLayer("Runtime Context", bundle.runtimeContext),
  };
  const manifest = {
    core: layers.core.version,
    domain: layers.domain.version,
    skill: layers.skill.version,
    userSemantics: layers.userSemantics.version,
    runtimeContext: layers.runtimeContext.version,
  };
  const promptBundleVersion = checksum(stableJson({ manifest, layers }));
  const system = [
    "你是个人事务运行系统的局部语义 Provider。输出一个 JSON object：有可审阅变化时，直接以 title/context/understanding/objective/logic/finalPreview/unresolvedQuestions/scope/preconditions/groups 作为顶层字段输出 V2 Proposal，禁止 decision=PROPOSAL 或 proposal wrapper；普通记录或证据不足时输出且只输出 {\"decision\":\"NO_PROPOSAL\",\"reason\":\"简洁理由\"}。",
    "模型输出不是事实或命令；不得声称已写入 Logseq、SQLite、Lifecycle、Condition、Focus 或 Anchor。",
    "unresolvedQuestions 与 preconditions 必须是 JSON 字符串数组；没有内容时必须输出 []，禁止用“无”、空字符串或 null 代替数组。",
    "modify scope、版本/hash 前置、Operation Group、risk、最终预览必须显式且保守；信息不足时保留未决问题。",
    `Core [${layers.core.version}]\n${layers.core.content}`,
    `Domain [${layers.domain.version}]\n${layers.domain.content}`,
    `Skill [${layers.skill.version}]\n${layers.skill.content}`,
    `User Semantics [${layers.userSemantics.version}]\n${layers.userSemantics.content}`,
  ].join("\n\n");
  const user = `Runtime Context [${layers.runtimeContext.version}]\n${layers.runtimeContext.content}`;
  if (system.length + user.length > 200_000) throw generationError("LLM_PROMPT_TOO_LARGE", "五层 Prompt 超过安全上限。");
  return { system, user, promptBundleVersion };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw generationError("LLM_PROPOSAL_SHAPE_INVALID", "模型输出不是 Proposal JSON object；没有进入审阅队列。");
  return value as Record<string, unknown>;
}

function normalizeModelHashes(candidate: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(candidate.groups)) return candidate;
  const patchHashes = new Map<string, string>();
  const groups = candidate.groups.map((rawGroup) => {
    if (!rawGroup || typeof rawGroup !== "object" || Array.isArray(rawGroup)) return rawGroup;
    const group = rawGroup as Record<string, unknown>;
    const textPatches = Array.isArray(group.textPatches) ? group.textPatches.map((rawPatch) => {
      if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) return rawPatch;
      const patch = rawPatch as Record<string, unknown>;
      if (typeof patch.blockUuid !== "string" || typeof patch.beforeText !== "string" || typeof patch.afterText !== "string") return patch;
      const beforeHash = checksum(patch.beforeText);
      patchHashes.set(patch.blockUuid, beforeHash);
      return { ...patch, beforeHash, afterHash: checksum(patch.afterText) };
    }) : group.textPatches;
    return { ...group, textPatches };
  });
  const normalizeTarget = (rawTarget: unknown): unknown => {
    if (!rawTarget || typeof rawTarget !== "object" || Array.isArray(rawTarget)) return rawTarget;
    const target = rawTarget as Record<string, unknown>;
    const hash = target.kind === "BLOCK" && typeof target.id === "string" ? patchHashes.get(target.id) : undefined;
    return hash ? { ...target, hash } : target;
  };
  return {
    ...candidate,
    groups: groups.map((rawGroup) => {
      if (!rawGroup || typeof rawGroup !== "object" || Array.isArray(rawGroup)) return rawGroup;
      const group = rawGroup as Record<string, unknown>;
      const semanticOperations = Array.isArray(group.semanticOperations) ? group.semanticOperations.map((rawOperation) => {
        if (!rawOperation || typeof rawOperation !== "object" || Array.isArray(rawOperation)) return rawOperation;
        const operation = rawOperation as Record<string, unknown>;
        return { ...operation, target: normalizeTarget(operation.target) };
      }) : group.semanticOperations;
      return { ...group, semanticOperations };
    }),
    scope: candidate.scope && typeof candidate.scope === "object" && !Array.isArray(candidate.scope)
      ? {
        ...(candidate.scope as Record<string, unknown>),
        read: Array.isArray((candidate.scope as Record<string, unknown>).read) ? ((candidate.scope as Record<string, unknown>).read as unknown[]).map(normalizeTarget) : (candidate.scope as Record<string, unknown>).read,
        modify: Array.isArray((candidate.scope as Record<string, unknown>).modify) ? ((candidate.scope as Record<string, unknown>).modify as unknown[]).map(normalizeTarget) : (candidate.scope as Record<string, unknown>).modify,
      }
      : candidate.scope,
  };
}

export class LocalLlmProposalGenerator {
  constructor(private readonly provider: StructuredProposalProvider) {}

  async generate(request: ReviewReadyProposalRequest): Promise<LocalLlmGenerationResult> {
    if (!request.proposalId.trim() || !Number.isFinite(Date.parse(request.createdAt))) {
      throw generationError("LLM_PROPOSAL_ENVELOPE_INVALID", "Proposal ID 或生成时间无效。");
    }
    const assembled = assembleV2ProposalPrompt(request.prompt);
    const completion = await this.provider.completeStructured({ system: assembled.system, user: assembled.user, ...(request.signal ? { signal: request.signal } : {}) });
    const candidate = asRecord(completion.value);
    if (candidate.decision === "NO_PROPOSAL") {
      if (Object.keys(candidate).some((key) => !["decision", "reason"].includes(key)) || typeof candidate.reason !== "string" || !candidate.reason.trim() || candidate.reason.length > 2_000) {
        throw generationError("LLM_NO_PROPOSAL_INVALID", "NO_PROPOSAL 必须只包含有界的人类可读理由。");
      }
      return {
        kind: "NO_PROPOSAL",
        reason: candidate.reason.trim(),
        provider: completion.metadata,
        promptBundleVersion: assembled.promptBundleVersion,
      };
    }
    const normalized = normalizeModelHashes(candidate);
    const proposal = validateV2ProposalForSubmission({
      proposalId: request.proposalId,
      schemaVersion: "v2",
      title: normalized.title,
      context: normalized.context,
      understanding: normalized.understanding,
      objective: normalized.objective,
      logic: normalized.logic,
      finalPreview: normalized.finalPreview,
      unresolvedQuestions: normalized.unresolvedQuestions,
      source: {
        kind: "local_llm",
        provider: this.provider.providerId,
        model: completion.metadata.model,
        skillVersion: request.prompt.skill.version.trim(),
        writingProfileVersion: request.prompt.userSemantics.version.trim(),
        promptBundleVersion: assembled.promptBundleVersion,
      },
      scope: normalized.scope,
      preconditions: normalized.preconditions,
      groups: normalized.groups,
      status: "READY",
      createdAt: request.createdAt,
    });
    return {
      kind: "PROPOSAL",
      proposal,
      files: renderV2ProposalFiles(proposal),
      provider: completion.metadata,
      promptBundleVersion: assembled.promptBundleVersion,
    };
  }

  async generateAndSubmit(
    request: ReviewReadyProposalRequest,
    application: V2ProposalApplication,
  ): Promise<LocalLlmSubmissionResult> {
    const generated = await this.generate(request);
    if (generated.kind === "NO_PROPOSAL") return { generated, replayed: false };
    const submitted = await application.submit(generated.proposal, new Date(request.createdAt));
    return { generated, ...submitted };
  }
}
