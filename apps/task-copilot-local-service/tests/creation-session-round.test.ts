import assert from "node:assert/strict";
import test from "node:test";

import { createCreationSession, type CreationSession } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

import { LocalLlmCreationRoundGenerator } from "../src/creation-session-round.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

const at = new Date("2026-08-02T06:00:00.000Z");
const session = (): CreationSession => createCreationSession({
  graphId: "graph-round", targetType: "MINI_PROJECT", sessionId: "creation-round-test",
  primarySource: { sourceId: "source-one", role: "PRIMARY", kind: "BLOCK_SUBTREE", externalId: "block-one", currentCaptureId: "capture-one", latestKnownHash: "hash-one", availability: "AVAILABLE", captures: [{ captureId: "capture-one", reason: "SESSION_START", snapshotHash: "hash-one", content: "整理设备告警接入", hierarchy: [{ nodeId: "block-one", text: "整理设备告警接入", order: 0, depth: 0, relation: "ROOT" }], capturedAt: at.toISOString() }] },
}, at);

const request = (value: unknown, calls: unknown[] = []) => ({
  request: {
    session: session(),
    core: { version: "1.0.0", content: "正式变化只能通过 Application Command。" },
    skill: { version: "1.0.0", content: "每轮围绕一个主题提出二至五个相关问题。" },
    targetSkill: { version: "1.0.0", content: "MiniProject 保持轻量。" },
  },
  provider: {
    providerId: "deepseek", providerVersion: "chat-completions-v1",
    completeStructured: async (input: unknown) => { calls.push(input); return { value, metadata: { model: "deepseek-v4", durationMs: 12, attempts: 1 } }; },
  } satisfies StructuredProposalProvider,
});

const validOutput = {
  schemaVersion: "task-copilot-creation-round-v1",
  theme: "结果与完成方式",
  understanding: "来源表达了告警接入意图，但结果和完成判断仍需共同确认。",
  questions: [
    { uncertaintyId: "outcome", text: "这次希望形成什么可交付结果？", rationale: "先明确结果才能约束后续结构。", recommendation: "建议形成一条可验收的告警接入链。", answerRequirement: "说明一项可验收结果。", evidenceRefs: ["source:source-one:capture-one"], alternativeImpact: "若只做调研，应降低为更小的事项。" },
    { uncertaintyId: "completion-evidence", text: "用什么证据判断已经完成？", rationale: "需要避免只有行动而没有完成判断。", recommendation: "建议以真实告警贯通并留存验收记录为证据。", answerRequirement: "说明可复核证据。", evidenceRefs: ["source:source-one:capture-one"] },
  ],
  consensusDelta: [{ uncertaintyId: "necessary-context", text: "来源已明确对象是设备告警接入。", provenance: "SOURCE_FACT", evidenceRefs: ["source:source-one:capture-one"] }],
  unresolvedBranches: ["具体结果", "完成证据"],
  draftReadiness: "NOT_READY",
  draftSuggestions: ["保留来源中的设备告警接入背景"],
  abstentions: ["来源没有给出完成证据"],
  summary: { confirmed: "已识别事项背景", unresolved: "结果与完成证据待确认", draftChange: "暂不生成正式草稿", nextSuggestion: "回答本轮两个问题" },
};

test("Creation round generator validates one themed multi-question batch and machine evidence", async () => {
  const calls: unknown[] = [];
  const fixture = request(validOutput, calls);
  const generated = await new LocalLlmCreationRoundGenerator(fixture.provider).generate(fixture.request);
  assert.equal(generated.round.questions.length, 2);
  assert.equal(generated.round.questions[0]?.answerState, "UNANSWERED");
  assert.equal(generated.completion.consensus[0]?.provenance, "SOURCE_FACT");
  assert.match(generated.promptBundleVersion, /^[a-f0-9]{8}$/);
  assert.equal(calls.length, 1);
  const providerRequest = calls[0] as { system?: string; user?: string };
  assert.match(providerRequest.system ?? "", /complete JSON below 2400 output tokens/);
  assert.match(providerRequest.user ?? "", /"maximumOutputTokens":2400/);
  assert.match(providerRequest.user ?? "", /"conciseFieldBudget"/);
  assert.match(providerRequest.user ?? "", /"requiredTopLevelKeys"/);
  assert.match(providerRequest.user ?? "", /"evidenceRefs":"array containing only allowedEvidenceRefs; use \[\] when none are allowed"/);
});

test("Creation round generator rejects a one-question batch while several branches remain open", async () => {
  const fixture = request({ ...validOutput, questions: [validOutput.questions[0]] });
  await assert.rejects(() => new LocalLlmCreationRoundGenerator(fixture.provider).generate(fixture.request), (error: unknown) => error instanceof StructuredError && error.code === "CREATION_ROUND_VALIDATION_FAILED" && error.details?.validationCategory === "SHAPE");
});

test("Creation round generator rejects invented evidence and machine identity in prose", async () => {
  const fixture = request({ ...validOutput, understanding: "请处理 creation_20260802_deadbeefdeadbeef。", questions: validOutput.questions.map((question) => ({ ...question, evidenceRefs: ["source:invented"] })) });
  await assert.rejects(() => new LocalLlmCreationRoundGenerator(fixture.provider).generate(fixture.request), (error: unknown) => error instanceof StructuredError && error.code === "CREATION_ROUND_VALIDATION_FAILED");
});
