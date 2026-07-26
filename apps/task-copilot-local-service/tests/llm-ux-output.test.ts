import assert from "node:assert/strict";
import test from "node:test";

import { InteractionEvidenceBuffer } from "@task-copilot/application";
import { StructuredError } from "@task-copilot/shared";

import {
  LocalLlmUxOutputGenerator,
  type UxOutputGenerationRequest,
} from "../src/llm-ux-output.ts";
import type { StructuredChatRequest } from "../src/deepseek-provider.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

const request: UxOutputGenerationRequest = {
  observedAt: "2026-07-24T06:00:00.000Z",
  frontstageLanguage: "zh-CN",
  core: { version: "core@1.0.0", content: "正式状态是事实，模型只生成草稿。" },
  skill: {
    name: "recover-context",
    version: "1.0.0",
    content: "按上下文阶梯生成一个诚实的重入摘要。",
  },
  userSemantics: { version: "profile@1.0.0", content: "使用紧凑中文。" },
  runtimeContext: { version: "context@object-1-v3", content: "只包含已导出的有界上下文。" },
  minimumRiskLevel: "NONE",
  requiresDiscussion: false,
  requiresReview: false,
  facts: [{
    factId: "condition",
    text: "正在等待厂家补充功耗参数",
    sourceRefs: ["object:project-1@v3"],
  }],
  allowedNextActions: [],
};

test("LLM UX generator rejects mixed-language frontstage prose as one zero-write validation outcome", async () => {
  let calls = 0;
  const captured: StructuredChatRequest[] = [];
  const evidence = new InteractionEvidenceBuffer();
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (input) => {
      captured.push(input);
      calls += 1;
      return {
        value: {
          schemaVersion: "task-copilot-ux-output-v1",
          factRefs: ["condition"],
          inferences: [{
            text: "The project is waiting for a key parameter（项目）.",
            evidenceRefs: ["object:project-1@v3"],
          }],
          unknowns: [],
          summary: "The project is waiting（项目）.",
          suggestedChanges: [],
          nextActionEligible: false,
          riskLevel: "NONE",
          requiresDiscussion: false,
          requiresReview: false,
        },
        metadata: {
          model: "actual-model",
          durationMs: 20,
          attempts: 1,
        },
      };
    },
  };

  await assert.rejects(
    () => new LocalLlmUxOutputGenerator(provider, evidence, () => "uxi_1234567890abcdef").generate(request),
    (error: unknown) => error instanceof StructuredError
      && error.code === "UX_OUTPUT_VALIDATION_FAILED"
      && error.details?.validationCategory === "FRONTSTAGE_PROSE",
  );

  assert.equal(calls, 1);
  assert.match(captured[0]?.system ?? "", /zh-CN/);
  assert.equal(evidence.summary().outcomes.REJECTED, 1);
  assert.equal(evidence.summary().outcomes.GENERATED, 0);
  assert.equal(evidence.snapshot()[0]?.failureCode, "UX_OUTPUT_VALIDATION_FAILED");
});

test("LLM UX language contract rejects short English prose after excluding an allowed product name", async () => {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => ({
      value: {
        schemaVersion: "task-copilot-ux-output-v1",
        factRefs: ["condition"],
        inferences: [{ text: "Project blocked 项目等待。", evidenceRefs: ["object:project-1@v3"] }],
        unknowns: [],
        summary: "Project blocked 项目等待。",
        suggestedChanges: [],
        nextActionEligible: false,
        riskLevel: "NONE",
        requiresDiscussion: false,
        requiresReview: false,
      },
      metadata: { model: "actual-model", durationMs: 20, attempts: 1 },
    }),
  };

  await assert.rejects(
    () => new LocalLlmUxOutputGenerator(provider).generate(request),
    (error: unknown) => error instanceof StructuredError
      && error.code === "UX_OUTPUT_VALIDATION_FAILED"
      && error.details?.validationCategory === "FRONTSTAGE_PROSE",
  );
});

test("LLM UX language contract allows product names inside Chinese-dominant prose", async () => {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => ({
      value: {
        schemaVersion: "task-copilot-ux-output-v1",
        factRefs: ["condition"],
        inferences: [{ text: "Project 当前正在等待 API 参数。", evidenceRefs: ["object:project-1@v3"] }],
        unknowns: [],
        summary: "当前 Project 需要等待参数。",
        suggestedChanges: [],
        nextActionEligible: false,
        riskLevel: "NONE",
        requiresDiscussion: false,
        requiresReview: false,
      },
      metadata: { model: "actual-model", durationMs: 20, attempts: 1 },
    }),
  };

  const result = await new LocalLlmUxOutputGenerator(provider).generate(request);
  assert.equal(result.output.inferences[0]?.text, "Project 当前正在等待 API 参数。");
});

test("LLM UX language contract rejects Japanese kana instead of treating shared Han characters as Chinese", async () => {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => ({
      value: {
        schemaVersion: "task-copilot-ux-output-v1",
        factRefs: ["condition"],
        inferences: [{ text: "項目は重要なパラメータを待っています。", evidenceRefs: ["object:project-1@v3"] }],
        unknowns: [],
        summary: "項目は待機中です。",
        suggestedChanges: [],
        nextActionEligible: false,
        riskLevel: "NONE",
        requiresDiscussion: false,
        requiresReview: false,
      },
      metadata: { model: "actual-model", durationMs: 20, attempts: 1 },
    }),
  };

  await assert.rejects(
    () => new LocalLlmUxOutputGenerator(provider).generate(request),
    (error: unknown) => error instanceof StructuredError
      && error.code === "UX_OUTPUT_VALIDATION_FAILED"
      && error.details?.validationCategory === "FRONTSTAGE_PROSE",
  );
});

test("LLM UX generator returns only a validated machine-provenance draft without persistence authority", async () => {
  const captured: StructuredChatRequest[] = [];
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (input) => {
      captured.push(input);
      return {
        value: {
          schemaVersion: "task-copilot-ux-output-v1",
          factRefs: ["condition"],
          inferences: [],
          unknowns: ["参数到达时间尚不明确"],
          summary: "项目正在等待关键参数。",
          suggestedChanges: [],
          nextActionEligible: false,
          riskLevel: "NONE",
          requiresDiscussion: false,
          requiresReview: false,
          provenance: { model: "spoofed", generatedAt: "2000-01-01T00:00:00.000Z" },
        },
        metadata: {
          requestId: "request-1",
          model: "actual-model",
          finishReason: "stop",
          totalTokens: 88,
          durationMs: 30,
          attempts: 1,
        },
      };
    },
  };

  const evidence = new InteractionEvidenceBuffer();
  const result = await new LocalLlmUxOutputGenerator(provider, evidence, () => "uxi_1234567890abcdef").generate(request);
  assert.equal(result.output.summary, "项目正在等待关键参数。");
  assert.equal(result.output.provenance.model, "actual-model");
  assert.equal(result.interactionId, "uxi_1234567890abcdef");
  assert.doesNotMatch(evidence.exportJsonl(), /uxi_1234567890abcdef/);
  assert.equal(result.output.provenance.skillName, "recover-context");
  assert.equal(result.output.provenance.skillVersion, "1.0.0");
  assert.equal(result.output.provenance.generatedAt, request.observedAt);
  assert.match(result.promptBundleVersion, /^[0-9a-f]{8}$/);
  assert.match(captured[0]?.system ?? "", /factRefs/);
  assert.match(captured[0]?.system ?? "", /never write formal Graph or SQLite state directly/i);
  assert.match(captured[0]?.system ?? "", /current product frontstage is zh-CN/i);
  assert.match(captured[0]?.system ?? "", /Never list a supplied formal fact as unknown/i);
  assert.match(captured[0]?.user ?? "", /只包含已导出的有界上下文/);
  assert.equal("application" in (result as object), false);
  assert.deepEqual(evidence.snapshot(), [{
    timestamp: request.observedAt,
    scene: "CONTEXT_RECOVERY",
    outcome: "GENERATED",
    skill: { name: "recover-context", version: "1.0.0" },
    promptVersion: result.promptBundleVersion,
    model: "actual-model",
    evidence: {
      scopeHash: result.output.evidenceScope.scopeHash,
      factCount: 1,
      inferenceCount: 0,
      unknownCount: 1,
      suggestedChangeCount: 0,
      evidenceRefCount: 1,
      nextActionEligible: false,
    },
    elapsedMs: 30,
  }]);
});

test("unified UX prompt keeps opaque identities out of every frontstage prose field", async () => {
  let systemPrompt = "";
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async ({ system }) => {
      systemPrompt = system;
      return {
        value: {
          schemaVersion: "task-copilot-ux-output-v1",
          factRefs: ["condition"],
          inferences: [],
          unknowns: [],
          summary: "项目正在等待关键参数。",
          suggestedChanges: [],
          nextActionEligible: false,
          riskLevel: "NONE",
          requiresDiscussion: false,
          requiresReview: false,
        },
        metadata: { model: "actual-model", durationMs: 1, attempts: 1 },
      };
    },
  };
  await new LocalLlmUxOutputGenerator(provider).generate(request);
  assert.match(systemPrompt, /Opaque machine identities belong only in factRefs, evidenceRefs, and nextActionId/);
  assert.match(systemPrompt, /Never repeat an Object\/Block\/Page UUID/);
});

test("DO_NOT_REPEAT suppresses the same scene and Skill version for only the current evidence session", async () => {
  const evidence = new InteractionEvidenceBuffer();
  let providerCalls = 0;
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => {
      providerCalls += 1;
      return {
        value: {
          schemaVersion: "task-copilot-ux-output-v1",
          factRefs: ["condition"],
          inferences: [],
          unknowns: [],
          summary: "项目正在等待关键参数。",
          suggestedChanges: [],
          nextActionEligible: false,
          riskLevel: "NONE",
          requiresDiscussion: false,
          requiresReview: false,
        },
        metadata: { model: "actual-model", durationMs: 20, attempts: 1 },
      };
    },
  };
  const generator = new LocalLlmUxOutputGenerator(provider, evidence, () => "uxi_1234567890abcdef");
  const first = await generator.generate(request);
  assert.equal(providerCalls, 1);
  assert.equal(evidence.setDisposition(first.interactionId!, "DO_NOT_REPEAT")?.userDisposition, "DO_NOT_REPEAT");

  await assert.rejects(
    () => generator.generate(request),
    (error: unknown) => error instanceof StructuredError
      && error.code === "UX_OUTPUT_SESSION_SUPPRESSED"
      && error.message.includes("当前 Service session"),
  );
  assert.equal(providerCalls, 1, "session suppression is checked before any Provider call");
  assert.equal(evidence.snapshot().length, 1, "a suppressed repeat does not create noisy evidence");
});

test("LLM UX validation failure records only structural rejection evidence", async () => {
  const evidence = new InteractionEvidenceBuffer();
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => ({
      value: {
        schemaVersion: "task-copilot-ux-output-v1",
        factRefs: ["invented-private-fact"],
        inferences: [],
        unknowns: [],
        summary: "private model output must not enter evidence",
        suggestedChanges: [],
        nextActionEligible: false,
        riskLevel: "NONE",
        requiresDiscussion: false,
        requiresReview: false,
      },
      metadata: {
        model: "actual-model",
        durationMs: 25,
        attempts: 1,
      },
    }),
  };

  await assert.rejects(
    () => new LocalLlmUxOutputGenerator(provider, evidence).generate(request),
    (error: unknown) => error instanceof StructuredError
      && error.code === "UX_OUTPUT_VALIDATION_FAILED"
      && error.message.includes("没有生成恢复草稿")
      && error.details?.cause === "Unified UX output referenced an unknown fact."
      && error.details?.validationCategory === "FACT_REFERENCE",
  );
  const [entry] = evidence.snapshot();
  assert.match(entry?.promptVersion ?? "", /^[0-9a-f]{8}$/);
  assert.deepEqual({ ...entry, promptVersion: "bounded-hash" }, {
    timestamp: request.observedAt,
    scene: "CONTEXT_RECOVERY",
    outcome: "REJECTED",
    skill: { name: "recover-context", version: "1.0.0" },
    promptVersion: "bounded-hash",
    model: "actual-model",
    failureCode: "UX_OUTPUT_VALIDATION_FAILED",
    elapsedMs: 25,
  });
  assert.doesNotMatch(evidence.exportJsonl(), /private model output|invented-private-fact/);
});

test("LLM UX provider failure records only a structural error code and preserves the provider error", async () => {
  const evidence = new InteractionEvidenceBuffer();
  const providerError = new Error("private provider response body");
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => {
      throw providerError;
    },
  };

  await assert.rejects(
    () => new LocalLlmUxOutputGenerator(provider, evidence).generate(request),
    (error) => error === providerError,
  );
  const [entry] = evidence.snapshot();
  assert.match(entry?.promptVersion ?? "", /^[0-9a-f]{8}$/);
  assert.deepEqual({ ...entry, promptVersion: "bounded-hash" }, {
    timestamp: request.observedAt,
    scene: "CONTEXT_RECOVERY",
    outcome: "ERROR",
    skill: { name: "recover-context", version: "1.0.0" },
    promptVersion: "bounded-hash",
    failureCode: "UX_OUTPUT_PROVIDER_FAILED",
  });
  assert.doesNotMatch(evidence.exportJsonl(), /private provider response body/);
});

test("interaction evidence sink failures never change the UX generation result", async () => {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => ({
      value: {
        schemaVersion: "task-copilot-ux-output-v1",
        factRefs: ["condition"],
        inferences: [],
        unknowns: [],
        summary: "项目正在等待关键参数。",
        suggestedChanges: [],
        nextActionEligible: false,
        riskLevel: "NONE",
        requiresDiscussion: false,
        requiresReview: false,
      },
      metadata: {
        model: "actual-model",
        durationMs: 20,
        attempts: 1,
      },
    }),
  };
  const evidence = {
    record: () => {
      throw new Error("evidence storage unavailable");
    },
  };

  const result = await new LocalLlmUxOutputGenerator(provider, evidence).generate(request);
  assert.equal(result.output.summary, "项目正在等待关键参数。");
});
