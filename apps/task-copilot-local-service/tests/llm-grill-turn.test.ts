import assert from "node:assert/strict";
import test from "node:test";

import { GRILL_TURN_SCHEMA_VERSION, type GrillTurnAuthority } from "@task-copilot/application";
import { StructuredError } from "@task-copilot/shared";

import { LocalLlmGrillTurnGenerator, type GrillTurnGenerationRequest } from "../src/llm-grill-turn.ts";
import type { StructuredChatRequest } from "../src/deepseek-provider.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

const authority: Omit<GrillTurnAuthority, "contractVersion" | "promptVersion" | "provider"> = {
  observedAt: "2026-07-24T14:00:00.000Z",
  skill: { name: "mini-project-modeling", version: "1.0.0" },
  subject: { kind: "MINI_PROJECT", objectId: "mini-1", version: 3 },
  sourceFingerprint: "b".repeat(64),
  facts: [{ factId: "material", text: "设备清单已列出。", sourceRefs: ["object:mini-1@v3", "block:block-1"] }],
  uncertainties: [
    { uncertaintyId: "scope-current-list", dimension: "BOUNDARY", status: "OPEN", priority: 5, critical: true, evidenceRefs: ["block:block-1"] },
    { uncertaintyId: "outcome-record", dimension: "OUTCOME", status: "OPEN", priority: 10, critical: true, evidenceRefs: ["object:mini-1@v3"] },
    { uncertaintyId: "evidence-acceptance", dimension: "COMPLETION_EVIDENCE", status: "OPEN", priority: 20, critical: true, evidenceRefs: ["object:mini-1@v3"] },
    { uncertaintyId: "material-unclassified", dimension: "UNCLASSIFIED_MATERIAL", status: "OPEN", priority: 30, critical: false, evidenceRefs: ["block:block-2"] },
  ],
  unclassifiedMaterialRefs: ["block:block-2"],
};

const request: GrillTurnGenerationRequest = {
  authority,
  core: { version: "1.0.0", content: "正式状态只经 Application Command。" },
  skill: { version: "1.0.0", content: "围绕材料中的最大不确定性进行一轮自适应追问。" },
  userSemantics: { version: "none", content: "没有配置用户写作偏好。" },
  runtimeContext: { version: "context:b", content: "只包含受控材料和 machine grillAuthority。" },
};

test("Grill generator materializes one machine-focused session draft and replaces model provenance", async () => {
  const captured: StructuredChatRequest[] = [];
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (input) => {
      captured.push(input);
      return {
        value: {
          schemaVersion: GRILL_TURN_SCHEMA_VERSION,
          understanding: "设备已列出，但本轮范围尚未封顶。",
          factRefs: ["material"],
          inferences: [{ text: "本次可能只覆盖现有清单。", evidenceRefs: ["block:block-1"] }],
          unknowns: [{ uncertaintyId: "scope-current-list", text: "后续新增设备是否属于本次范围尚不明确。" }],
          readiness: "CONTINUE",
          focusUncertaintyId: "scope-current-list",
          questions: [{ uncertaintyId: "scope-current-list", text: "本次只覆盖现有清单，还是也纳入后续新增设备？" }],
          recommendation: { text: "建议先封顶当前清单。", evidenceRefs: ["block:block-1"], tradeoffs: ["边界清楚，但新增设备需另行补充"] },
          provenance: { model: "spoofed" },
        },
        metadata: { model: "deepseek-chat", durationMs: 18, attempts: 1 },
      };
    },
  };

  const result = await new LocalLlmGrillTurnGenerator(provider).generate(request);
  assert.equal(result.output.questionGroup?.focusUncertaintyId, "scope-current-list");
  assert.equal(result.output.authorityBoundary, "SESSION_DRAFT_ONLY");
  assert.equal(result.output.provenance.model, "deepseek-chat");
  assert.equal(result.output.provenance.providerId, "deepseek");
  assert.match(result.promptBundleVersion, /^[a-f0-9]{8}$/);
  assert.match(captured[0]?.system ?? "", /largest open uncertainty/i);
  assert.match(captured[0]?.system ?? "", /never emit Proposal|不得输出 Proposal/i);
  assert.match(captured[0]?.user ?? "", /machine grillAuthority/);
});

test("Grill generator rejects invented evidence and operation authority as a zero-write validation error", async () => {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => ({
      value: {
        schemaVersion: GRILL_TURN_SCHEMA_VERSION,
        understanding: "越界草稿",
        factRefs: ["material"],
        inferences: [{ text: "越界推断", evidenceRefs: ["block:invented"] }],
        unknowns: [{ uncertaintyId: "scope-current-list", text: "仍未知" }],
        readiness: "CONTINUE",
        focusUncertaintyId: "scope-current-list",
        questions: [{ uncertaintyId: "scope-current-list", text: "范围？" }],
        recommendation: { text: "建议", evidenceRefs: ["block:invented"], tradeoffs: ["取舍"] },
        operations: [{ kind: "CHANGE_OWNERSHIP" }],
      },
      metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
    }),
  };

  await assert.rejects(
    () => new LocalLlmGrillTurnGenerator(provider).generate(request),
    (error: unknown) => error instanceof StructuredError
      && error.code === "GRILL_TURN_VALIDATION_FAILED"
      && error.message.includes("没有进入结构预览"),
  );
});
