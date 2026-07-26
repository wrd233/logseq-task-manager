import {
  materializeCrossObjectShadowCandidates,
  type CrossObjectObservationDraft,
  type CrossObjectObservationKind,
} from "@task-copilot/application";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import type { StructuredCompletionMetadata } from "./deepseek-provider.ts";
import type { StructuredProposalProvider } from "./llm-proposal.ts";

export interface CrossObjectObservationContextPackage {
  schemaVersion: "task-copilot-cross-object-context-v1";
  observedAt: string;
  scope: { kind: "OBJECT" | "PROJECT"; rootRef: string };
  objects: Array<{
    ref: string;
    objectType: "TASK" | "MINI_PROJECT" | "PROJECT" | "OUTPUT" | "DECISION";
    lifecycle: "OPEN" | "COMPLETED" | "CANCELLED";
    condition: "ACTIONABLE" | "WAITING" | "BLOCKED" | "PAUSED";
    summary: string;
  }>;
  evidenceFacts: Array<{
    key: string;
    factCode: string;
    sourceRef: string;
    observedAt: string;
    fingerprint: string;
    statement: string;
  }>;
}

export interface CrossObjectObservationGenerationResult {
  decision: "OBSERVATIONS" | "NO_OBSERVATION";
  drafts: CrossObjectObservationDraft[];
  provider: StructuredCompletionMetadata;
  promptVersion: string;
  contextFingerprint: string;
  graphWrites: 0;
  formalStoreWrites: 0;
}

interface ModelObservation {
  kind: CrossObjectObservationKind;
  subjectRefs: string[];
  primarySubjectRef?: string;
  evidenceKeys: string[];
}

const CONTEXT_KEYS = ["schemaVersion", "observedAt", "scope", "objects", "evidenceFacts"] as const;
const OBSERVATION_KINDS: CrossObjectObservationKind[] = [
  "TASK_CLUSTER_CANDIDATE",
  "LEGACY_HANDOFF_CANDIDATE",
  "PROJECT_INTERFACE_STALE_CANDIDATE",
  "ASSOCIATION_CANDIDATE",
  "OWNERSHIP_CANDIDATE",
];
const OBJECT_REF = /^object:([^\s@]{1,223})@v([1-9][0-9]*)$/u;
const SAFE_KEY = /^[a-z][a-z0-9-]{0,127}$/u;
const SAFE_CODE = /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/u;
const SAFE_REFERENCE = /^[a-z][a-z0-9_-]{0,31}:[^\s]{1,223}$/u;
const CHECKSUM = /^[a-f0-9]{8}$/u;
const SKILL_PROVENANCE = {
  id: "cross-object-observation-candidate",
  version: "0.1.0-experimental",
} as const;
const PROMPT_PROVENANCE = {
  id: "cross-object-observation-shadow",
  version: "0.1.0",
} as const;

function observationError(code: string, message: string): StructuredError {
  return new StructuredError({
    code,
    message,
    ruleRefs: ["D-127", "D-130", "D-140", "D-142", "D-207", "D-220"],
  });
}

function requireRecord(value: unknown, code: string, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw observationError(code, message);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  code: string,
  message: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw observationError(code, message);
}

function validateContext(input: CrossObjectObservationContextPackage): CrossObjectObservationContextPackage {
  const context = requireRecord(
    input,
    "LLM_CROSS_OBJECT_CONTEXT_INVALID",
    "跨对象 Context Package 外形无效；没有调用 Provider。",
  );
  requireExactKeys(
    context,
    CONTEXT_KEYS,
    "LLM_CROSS_OBJECT_CONTEXT_INVALID",
    "跨对象 Context Package 含有未授权字段；没有调用 Provider。",
  );
  if (
    context.schemaVersion !== "task-copilot-cross-object-context-v1"
    || typeof context.observedAt !== "string"
    || !Number.isFinite(Date.parse(context.observedAt))
  ) {
    throw observationError("LLM_CROSS_OBJECT_CONTEXT_INVALID", "跨对象 Context Package 版本或时间无效；没有调用 Provider。");
  }
  if (!Array.isArray(context.objects) || context.objects.length < 2 || context.objects.length > 8) {
    throw observationError("LLM_CROSS_OBJECT_CONTEXT_INVALID", "跨对象 Context Package 必须包含 2..8 个正式对象；没有调用 Provider。");
  }
  const objectRefs = new Set<string>();
  const objects = context.objects.map((raw, index) => {
    const object = requireRecord(
      raw,
      "LLM_CROSS_OBJECT_CONTEXT_INVALID",
      `跨对象 Context Package objects[${index}] 外形无效；没有调用 Provider。`,
    );
    requireExactKeys(
      object,
      ["ref", "objectType", "lifecycle", "condition", "summary"],
      "LLM_CROSS_OBJECT_CONTEXT_INVALID",
      `跨对象 Context Package objects[${index}] 含有未授权字段；没有调用 Provider。`,
    );
    if (typeof object.ref !== "string" || !OBJECT_REF.test(object.ref) || objectRefs.has(object.ref)) {
      throw observationError("LLM_CROSS_OBJECT_CONTEXT_INVALID", "跨对象 Context Package Object ref 必须唯一且版本化；没有调用 Provider。");
    }
    if (!["TASK", "MINI_PROJECT", "PROJECT", "OUTPUT", "DECISION"].includes(String(object.objectType))
      || !["OPEN", "COMPLETED", "CANCELLED"].includes(String(object.lifecycle))
      || !["ACTIONABLE", "WAITING", "BLOCKED", "PAUSED"].includes(String(object.condition))
      || typeof object.summary !== "string"
      || !object.summary.trim()
      || object.summary.length > 1_000) {
      throw observationError("LLM_CROSS_OBJECT_CONTEXT_INVALID", "跨对象 Context Package Object facts 无效；没有调用 Provider。");
    }
    objectRefs.add(object.ref);
    return {
      ref: object.ref,
      objectType: object.objectType,
      lifecycle: object.lifecycle,
      condition: object.condition,
      summary: object.summary.trim(),
    } as CrossObjectObservationContextPackage["objects"][number];
  });
  const scope = requireRecord(
    context.scope,
    "LLM_CROSS_OBJECT_CONTEXT_INVALID",
    "跨对象 Context Package scope 无效；没有调用 Provider。",
  );
  requireExactKeys(
    scope,
    ["kind", "rootRef"],
    "LLM_CROSS_OBJECT_CONTEXT_INVALID",
    "跨对象 Context Package scope 含有未授权字段；没有调用 Provider。",
  );
  if (
    (scope.kind !== "OBJECT" && scope.kind !== "PROJECT")
    || typeof scope.rootRef !== "string"
    || !objectRefs.has(scope.rootRef)
  ) {
    throw observationError("LLM_CROSS_OBJECT_CONTEXT_INVALID", "跨对象 Context Package scope 必须由机器已知对象界定；没有调用 Provider。");
  }
  if (!Array.isArray(context.evidenceFacts) || context.evidenceFacts.length < 2 || context.evidenceFacts.length > 16) {
    throw observationError("LLM_CROSS_OBJECT_CONTEXT_INVALID", "跨对象 Context Package 必须包含 2..16 条结构化证据；没有调用 Provider。");
  }
  const evidenceKeys = new Set<string>();
  const evidenceFacts = context.evidenceFacts.map((raw, index) => {
    const fact = requireRecord(
      raw,
      "LLM_CROSS_OBJECT_CONTEXT_INVALID",
      `跨对象 Context Package evidenceFacts[${index}] 外形无效；没有调用 Provider。`,
    );
    requireExactKeys(
      fact,
      ["key", "factCode", "sourceRef", "observedAt", "fingerprint", "statement"],
      "LLM_CROSS_OBJECT_CONTEXT_INVALID",
      `跨对象 Context Package evidenceFacts[${index}] 含有未授权字段；没有调用 Provider。`,
    );
    if (
      typeof fact.key !== "string"
      || !SAFE_KEY.test(fact.key)
      || evidenceKeys.has(fact.key)
      || typeof fact.factCode !== "string"
      || !SAFE_CODE.test(fact.factCode)
      || typeof fact.sourceRef !== "string"
      || !SAFE_REFERENCE.test(fact.sourceRef)
      || typeof fact.observedAt !== "string"
      || !Number.isFinite(Date.parse(fact.observedAt))
      || typeof fact.fingerprint !== "string"
      || !CHECKSUM.test(fact.fingerprint)
      || typeof fact.statement !== "string"
      || !fact.statement.trim()
      || fact.statement.length > 1_000
    ) {
      throw observationError("LLM_CROSS_OBJECT_CONTEXT_INVALID", "跨对象 Context Package evidence fact 无效；没有调用 Provider。");
    }
    evidenceKeys.add(fact.key);
    return {
      key: fact.key,
      factCode: fact.factCode,
      sourceRef: fact.sourceRef,
      observedAt: fact.observedAt,
      fingerprint: fact.fingerprint,
      statement: fact.statement.trim(),
    };
  });
  return {
    schemaVersion: "task-copilot-cross-object-context-v1",
    observedAt: context.observedAt,
    scope: { kind: scope.kind, rootRef: scope.rootRef },
    objects,
    evidenceFacts,
  };
}

function crossObjectContextFingerprint(context: CrossObjectObservationContextPackage): string {
  return checksum(stableJson({
    schemaVersion: context.schemaVersion,
    scope: context.scope,
    objects: context.objects,
    evidenceFacts: context.evidenceFacts.map(({
      key,
      factCode,
      sourceRef,
      fingerprint,
      statement,
    }) => ({
      key,
      factCode,
      sourceRef,
      fingerprint,
      statement,
    })),
  }));
}

export function assertCrossObjectObservationContextCurrent(
  expectedFingerprint: string,
  input: CrossObjectObservationContextPackage,
): string {
  if (!CHECKSUM.test(expectedFingerprint)) {
    throw observationError("LLM_CROSS_OBJECT_CONTEXT_FINGERPRINT_INVALID", "跨对象 Context fingerprint 无效；没有使用 Provider 草稿。");
  }
  const current = crossObjectContextFingerprint(validateContext(input));
  if (current !== expectedFingerprint) {
    throw observationError("LLM_CROSS_OBJECT_CONTEXT_STALE", "跨对象 Context 已变化；旧 Provider 草稿没有进入 Attention shadow。");
  }
  return current;
}

export function assembleCrossObjectObservationPrompt(
  input: CrossObjectObservationContextPackage,
): { system: string; user: string; promptVersion: string } {
  const context = validateContext(input);
  const system = [
    "你是个人事务运行系统的跨对象观察 Provider，只能基于给定的有界 Context Package 提出低权限影子观察。",
    "只返回一个 JSON object，顶层字段必须且只能是 decision、observations。",
    "没有足够证据时返回 {\"decision\":\"NO_OBSERVATION\",\"observations\":[]}。",
    "有观察时 decision=OBSERVATIONS；observations 为 1..4 项。每项只能包含 kind、subjectRefs、可选 primarySubjectRef、evidenceKeys。",
    `kind 只能是：${OBSERVATION_KINDS.join("、")}。`,
    "subjectRefs 必须包含 scope.rootRef，只能使用 Context Package objects 中的精确 ref；evidenceKeys 必须选择 2..16 个已给 key。",
    "禁止输出解释、摘要、推理、正文、建议动作、operation、Proposal 或 Commit。",
    "模型不得改变或声称改变 Ownership、Focus、Lifecycle、Condition、Anchor、Logseq 正文或 SQLite。",
    "弱关联、仅关键词相同、信息矛盾或无法确定时应返回 NO_OBSERVATION。不要为了产生结果而猜测。",
  ].join("\n");
  const user = stableJson(context);
  return {
    system,
    user,
    promptVersion: checksum(stableJson({
      prompt: PROMPT_PROVENANCE,
      candidateSkill: SKILL_PROVENANCE,
      system,
      contextSchema: context.schemaVersion,
    })),
  };
}

function parseModelObservations(
  value: unknown,
  context: CrossObjectObservationContextPackage,
): { decision: "OBSERVATIONS" | "NO_OBSERVATION"; observations: ModelObservation[] } {
  const output = requireRecord(
    value,
    "LLM_CROSS_OBJECT_SHAPE_INVALID",
    "跨对象 Provider 输出不是受控 JSON；没有进入 Attention shadow。",
  );
  requireExactKeys(
    output,
    ["decision", "observations"],
    "LLM_CROSS_OBJECT_TOP_LEVEL_FIELDS_INVALID",
    "跨对象 Provider 输出含有未授权字段；没有进入 Attention shadow。",
  );
  if (!Array.isArray(output.observations)) {
    throw observationError("LLM_CROSS_OBJECT_OBSERVATIONS_ARRAY_INVALID", "跨对象 Provider observations 必须是数组；没有进入 Attention shadow。");
  }
  if (output.decision === "NO_OBSERVATION") {
    if (output.observations.length !== 0) {
      throw observationError("LLM_CROSS_OBJECT_ABSTENTION_PAYLOAD_INVALID", "NO_OBSERVATION 不得携带观察；没有进入 Attention shadow。");
    }
    return { decision: "NO_OBSERVATION", observations: [] };
  }
  if (output.decision !== "OBSERVATIONS" || output.observations.length < 1 || output.observations.length > 4) {
    throw observationError("LLM_CROSS_OBJECT_DECISION_COUNT_INVALID", "跨对象 Provider decision 或观察数量无效；没有进入 Attention shadow。");
  }
  const knownRefs = new Set(context.objects.map(({ ref }) => ref));
  const knownEvidence = new Set(context.evidenceFacts.map(({ key }) => key));
  const observations = output.observations.map((raw, index): ModelObservation => {
    const observation = requireRecord(
      raw,
      "LLM_CROSS_OBJECT_SHAPE_INVALID",
      `跨对象 Provider observations[${index}] 外形无效；没有进入 Attention shadow。`,
    );
    requireExactKeys(
      observation,
      ["kind", "subjectRefs", "primarySubjectRef", "evidenceKeys"],
      "LLM_CROSS_OBJECT_OBSERVATION_FIELDS_INVALID",
      `跨对象 Provider observations[${index}] 含有未授权字段；没有进入 Attention shadow。`,
    );
    if (!OBSERVATION_KINDS.includes(observation.kind as CrossObjectObservationKind)) {
      throw observationError("LLM_CROSS_OBJECT_KIND_INVALID", "跨对象 Provider kind 无效；没有进入 Attention shadow。");
    }
    if (!Array.isArray(observation.subjectRefs)
      || observation.subjectRefs.length < 2
      || observation.subjectRefs.length > 8
      || observation.subjectRefs.some((ref) => typeof ref !== "string" || !knownRefs.has(ref))
      || new Set(observation.subjectRefs).size !== observation.subjectRefs.length
      || !observation.subjectRefs.includes(context.scope.rootRef)) {
      throw observationError("LLM_CROSS_OBJECT_SCOPE_INVALID", "跨对象 Provider 使用了未授权或无界 subject；没有进入 Attention shadow。");
    }
    const primarySubjectRef = observation.primarySubjectRef === undefined
      ? undefined
      : typeof observation.primarySubjectRef === "string"
        && observation.subjectRefs.includes(observation.primarySubjectRef)
        ? observation.primarySubjectRef
        : null;
    if (primarySubjectRef === null) {
      throw observationError("LLM_CROSS_OBJECT_SCOPE_INVALID", "跨对象 Provider primary subject 不在已选范围；没有进入 Attention shadow。");
    }
    if (!Array.isArray(observation.evidenceKeys)
      || observation.evidenceKeys.length < 2
      || observation.evidenceKeys.length > 16) {
      throw observationError("LLM_CROSS_OBJECT_EVIDENCE_COUNT_INVALID", "跨对象 Provider evidence 数量无效；没有进入 Attention shadow。");
    }
    if (observation.evidenceKeys.some((key) => typeof key !== "string" || !knownEvidence.has(key))) {
      throw observationError("LLM_CROSS_OBJECT_EVIDENCE_KEY_INVALID", "跨对象 Provider 使用了未授权 evidence；没有进入 Attention shadow。");
    }
    if (new Set(observation.evidenceKeys).size !== observation.evidenceKeys.length) {
      throw observationError("LLM_CROSS_OBJECT_EVIDENCE_DUPLICATE", "跨对象 Provider 重复选择 evidence；没有进入 Attention shadow。");
    }
    return {
      kind: observation.kind as CrossObjectObservationKind,
      subjectRefs: [...observation.subjectRefs] as string[],
      ...(primarySubjectRef ? { primarySubjectRef } : {}),
      evidenceKeys: [...observation.evidenceKeys] as string[],
    };
  });
  return { decision: "OBSERVATIONS", observations };
}

export class LocalLlmCrossObjectObservationGenerator {
  constructor(private readonly provider: StructuredProposalProvider) {}

  async generate(
    input: CrossObjectObservationContextPackage,
    signal?: AbortSignal,
  ): Promise<CrossObjectObservationGenerationResult> {
    const context = validateContext(input);
    const prompt = assembleCrossObjectObservationPrompt(context);
    const completion = await this.provider.completeStructured({
      system: prompt.system,
      user: prompt.user,
      ...(signal ? { signal } : {}),
    });
    const parsed = parseModelObservations(completion.value, context);
    const factsByKey = new Map(context.evidenceFacts.map((fact) => [fact.key, fact]));
    const drafts = parsed.observations.map((observation): CrossObjectObservationDraft => {
      const primaryObjectId = observation.primarySubjectRef
        ? OBJECT_REF.exec(observation.primarySubjectRef)?.[1]
        : undefined;
      const draft: CrossObjectObservationDraft = {
        kind: observation.kind,
        subjectRefs: [...observation.subjectRefs],
        scope: { ...context.scope },
        ...(primaryObjectId ? { primaryObjectId } : {}),
        evidenceFacts: observation.evidenceKeys.map((key) => {
          const fact = factsByKey.get(key)!;
          return {
            factCode: fact.factCode,
            sourceRef: fact.sourceRef,
            observedAt: fact.observedAt,
            fingerprint: fact.fingerprint,
          };
        }),
        confidence: observation.kind === "ASSOCIATION_CANDIDATE"
          || observation.kind === "OWNERSHIP_CANDIDATE"
          ? "LOW"
          : "MEDIUM",
        provenance: {
          skill: { ...SKILL_PROVENANCE },
          prompt: { ...PROMPT_PROVENANCE },
          model: {
            provider: this.provider.providerId,
            id: completion.metadata.model,
            version: this.provider.providerVersion,
          },
        },
      };
      materializeCrossObjectShadowCandidates([draft], context.observedAt);
      return draft;
    });
    materializeCrossObjectShadowCandidates(drafts, context.observedAt);
    return {
      decision: parsed.decision,
      drafts,
      provider: completion.metadata,
      promptVersion: prompt.promptVersion,
      contextFingerprint: crossObjectContextFingerprint(context),
      graphWrites: 0,
      formalStoreWrites: 0,
    };
  }
}
