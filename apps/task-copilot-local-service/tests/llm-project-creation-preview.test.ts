import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_CREATION_PREVIEW_SCHEMA_VERSION,
  type ProjectCreationPreviewAuthority,
} from "@task-copilot/application";
import { StructuredError } from "@task-copilot/shared";

import {
  LocalLlmProjectCreationPreviewGenerator,
  type ProjectCreationPreviewGenerationRequest,
} from "../src/llm-project-creation-preview.ts";
import type { StructuredChatRequest } from "../src/deepseek-provider.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

const authority: Omit<ProjectCreationPreviewAuthority, "contractVersion" | "promptVersion" | "provider"> = {
  observedAt: "2026-07-25T15:00:00.000Z",
  sourceKind: "PAGE",
  sourceFingerprint: "a".repeat(64),
  readiness: "READY_FOR_PREVIEW",
  skill: { name: "project-creation-modeling", version: "1.1.0" },
  materials: [{ materialId: "source-1", sourceRef: "block:page-root", contentHash: "1".repeat(64), exactText: "托管设备治理材料" }],
  resolvedDimensions: [
    { dimension: "OUTCOME", text: "持续形成可核验记录。", evidenceRefs: ["answer:outcome"] },
    { dimension: "BOUNDARY", text: "仅覆盖公司设备。", evidenceRefs: ["answer:boundary"] },
    { dimension: "COMPLETION_EVIDENCE", text: "月度记录可追溯。", evidenceRefs: ["answer:completion"] },
    { dimension: "UNCLASSIFIED_MATERIAL", text: "现有材料保留为来源。", evidenceRefs: ["answer:material"] },
    { dimension: "INTERNAL_CLOSURE", text: "每月核验差异。", evidenceRefs: ["answer:closure"] },
    { dimension: "CURRENT_INTERFACE", text: "先看待核验设备。", evidenceRefs: ["answer:interface"] },
    { dimension: "PAGE_OBJECT_RELATIONSHIP", text: "创建受控页并保留来源。", evidenceRefs: ["answer:relationship"] },
  ],
};

const request: ProjectCreationPreviewGenerationRequest = {
  authority,
  core: { version: "1.0.0", content: "正式状态只经 Application Command。" },
  skill: { version: "1.1.0", content: "Project 创建预览只提供可审阅的会话草稿。" },
  userSemantics: { version: "none", content: "使用简洁中文。" },
  runtimeContext: { version: "context:a", content: "受控 Page 材料与七项已解决判断。" },
};

function validDraft() {
  const claim = (text: string, evidenceRefs: string[]) => ({ text, evidenceRefs });
  return {
    schemaVersion: PROJECT_CREATION_PREVIEW_SCHEMA_VERSION,
    title: claim("托管设备治理", ["answer:outcome"]),
    outcome: claim("持续形成可核验记录。", ["answer:outcome"]),
    boundary: { included: [claim("公司设备。", ["answer:boundary"])], excluded: [] },
    completionEvidence: [claim("月度记录可追溯。", ["answer:completion"])],
    internalClosure: claim("每月核验差异。", ["answer:closure"]),
    currentInterface: claim("先看待核验设备。", ["answer:interface"]),
    pageObjectRelationship: {
      mode: "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE",
      rationale: "创建受控页并保留来源。",
      evidenceRefs: ["answer:relationship"],
    },
    sourceMaterials: [{
      materialId: "source-1",
      disposition: "LINK_AS_SOURCE",
      rationale: "保留原文作为来源。",
      evidenceRefs: ["answer:material"],
    }],
  };
}

test("Project creation preview generator returns a machine-owned zero-write reading", async () => {
  const captured: StructuredChatRequest[] = [];
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (input) => {
      captured.push(input);
      return { value: { ...validDraft(), formalImpact: { createsObject: true } }, metadata: { model: "deepseek-chat", durationMs: 17, attempts: 1 } };
    },
  };
  const result = await new LocalLlmProjectCreationPreviewGenerator(provider).generate(request);
  assert.equal(result.output.authorityBoundary, "SESSION_PREVIEW_ONLY");
  assert.deepEqual(result.output.formalImpact, { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 });
  assert.equal(result.output.pageObjectRelationship.authority, "PROPOSED_FOR_REVIEW");
  assert.match(captured[0]?.system ?? "", /seven machine-resolved dimensions/i);
  assert.match(captured[0]?.system ?? "", /never emit Proposal|不得输出 Proposal/i);
});

test("Project creation preview generator rejects omitted material or unsupported evidence", async () => {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => {
      const value = validDraft();
      value.sourceMaterials = [];
      value.outcome.evidenceRefs = ["block:outside"];
      return { value, metadata: { model: "deepseek-chat", durationMs: 10, attempts: 1 } };
    },
  };
  await assert.rejects(
    () => new LocalLlmProjectCreationPreviewGenerator(provider).generate(request),
    (error: unknown) => error instanceof StructuredError
      && error.code === "PROJECT_CREATION_PREVIEW_VALIDATION_FAILED"
      && error.message.includes("没有生成 Proposal"),
  );
});
