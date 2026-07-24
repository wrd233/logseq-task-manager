import assert from "node:assert/strict";
import test from "node:test";

import { GRILL_PREVIEW_SCHEMA_VERSION, type GrillPreviewAuthority } from "@task-copilot/application";
import { StructuredError } from "@task-copilot/shared";

import { LocalLlmGrillPreviewGenerator, type GrillPreviewGenerationRequest } from "../src/llm-grill-preview.ts";
import type { StructuredChatRequest } from "../src/deepseek-provider.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

const authority: Omit<GrillPreviewAuthority, "contractVersion" | "promptVersion" | "provider"> = {
  observedAt: "2026-07-24T15:00:00.000Z",
  subject: { kind: "MINI_PROJECT", objectId: "mini-1", version: 3 },
  sourceFingerprint: "a".repeat(64),
  readiness: "READY_FOR_PREVIEW",
  skill: { name: "mini-project-modeling", version: "1.0.0" },
  materials: [
    { materialId: "root", sourceRef: "block:block-root", contentHash: "12345678", exactText: "[MiniProject] 整理设备", currentSectionId: "root", isRoot: true },
    { materialId: "material-2", sourceRef: "block:block-step", contentHash: "23456789", exactText: "核对设备清单", currentSectionId: "root", isRoot: false },
  ],
  sessionFacts: [{ factId: "answer-outcome", text: "形成可复核清单。", sourceRefs: ["answer:outcome"] }],
};

const request: GrillPreviewGenerationRequest = {
  authority,
  core: { version: "1.0.0", content: "正式状态只经 Application Command。" },
  skill: { version: "1.0.0", content: "材料充分后形成零丢失结构预览。" },
  userSemantics: { version: "none", content: "没有配置用户写作偏好。" },
  runtimeContext: { version: "context:a", content: "只包含受控材料与已确认回答。" },
};

function validDraft() {
  const claim = (text: string, evidenceRefs: string[]) => ({ text, evidenceRefs });
  return {
    schemaVersion: GRILL_PREVIEW_SCHEMA_VERSION,
    title: claim("整理设备", ["block:block-root"]),
    outcome: claim("形成可复核清单。", ["answer:outcome"]),
    boundary: { included: [claim("当前设备清单", ["block:block-step"])], excluded: [] },
    completionEvidence: [claim("清单可以逐项复核", ["block:block-step", "answer:outcome"])],
    sections: [
      { sectionId: "root", heading: "入口", purpose: "保留原入口", sourceMaterialIds: ["root"], derivedBlocks: [] },
      { sectionId: "work", heading: "执行材料", purpose: "保留执行原文", sourceMaterialIds: ["material-2"], derivedBlocks: [] },
    ],
    unclassified: [],
  };
}

test("preview generator returns a machine-owned zero-loss session preview", async () => {
  const captured: StructuredChatRequest[] = [];
  const provider: StructuredProposalProvider = {
    providerId: "deepseek", providerVersion: "chat-completions-v1",
    completeStructured: async (input) => {
      captured.push(input);
      return { value: { ...validDraft(), provenance: { model: "spoofed" } }, metadata: { model: "deepseek-chat", durationMs: 16, attempts: 1 } };
    },
  };
  const result = await new LocalLlmGrillPreviewGenerator(provider).generate(request);
  assert.equal(result.output.authorityBoundary, "SESSION_PREVIEW_ONLY");
  assert.equal(result.output.impact.deletedMaterialCount, 0);
  assert.equal(result.output.provenance.model, "deepseek-chat");
  assert.match(captured[0]?.system ?? "", /preserve every source material exactly once/i);
  assert.match(captured[0]?.system ?? "", /only top-level fields are schemaVersion, title, outcome, boundary, completionEvidence, sections, and unclassified/i);
  assert.match(captured[0]?.system ?? "", /sourceMaterialIds/);
  assert.match(captured[0]?.system ?? "", /excluded never means omitted or deleted/i);
  assert.match(captured[0]?.system ?? "", /sets must be exactly equal/i);
  assert.match(captured[0]?.system ?? "", /never emit Proposal|不得输出 Proposal/i);
});

test("preview generator rejects omitted material and formal operation authority", async () => {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek", providerVersion: "chat-completions-v1",
    completeStructured: async () => {
      const value = validDraft();
      value.sections[1]!.sourceMaterialIds = [];
      return { value: { ...value, operations: [{ kind: "DELETE_BLOCK" }] }, metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 } };
    },
  };
  await assert.rejects(
    () => new LocalLlmGrillPreviewGenerator(provider).generate(request),
    (error: unknown) => error instanceof StructuredError && error.code === "GRILL_PREVIEW_VALIDATION_FAILED" && error.message.includes("没有生成 Proposal"),
  );
});
