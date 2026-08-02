import assert from "node:assert/strict";
import test from "node:test";

import { createCreationSession, type CreationSession } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

import { LocalLlmCreationDraftGenerator } from "../src/creation-session-draft.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

const at = new Date("2026-08-02T07:00:00.000Z");

const session = (targetType: "MINI_PROJECT" | "PROJECT"): CreationSession => createCreationSession({
  graphId: "graph-draft", targetType, sessionId: `creation-draft-${targetType.toLowerCase()}`,
  primarySource: { sourceId: "source-blank", role: "PRIMARY", kind: "BLANK", currentCaptureId: "capture-blank", latestKnownHash: "blank", availability: "AVAILABLE", captures: [{ captureId: "capture-blank", reason: "SESSION_START", snapshotHash: "blank", content: "", hierarchy: [], capturedAt: at.toISOString() }] },
}, at);

const miniOutput = {
  schemaVersion: "task-copilot-creation-draft-v1", targetType: "MINI_PROJECT", suggestedTitle: "建立设备告警接入", suggestedPageName: null,
  nodes: [
    { semanticKey: "mini-root", order: 0, nodeType: "BLOCK", text: "**[MiniProject]** 建立设备告警接入 #MiniProject", provenance: "AGENT_SYNTHESIS", evidenceRefs: [], operation: "CREATE", confirmed: false },
    { semanticKey: "goal", parentSemanticKey: "mini-root", order: 0, nodeType: "BLOCK", text: "**[目标]** 建立一条可验证的设备告警接入链", provenance: "AGENT_SYNTHESIS", evidenceRefs: [], operation: "CREATE", confirmed: false },
    { semanticKey: "next", parentSemanticKey: "mini-root", order: 1, nodeType: "TODO", text: "TODO 验证一条真实告警", provenance: "AGENT_SUGGESTION", evidenceRefs: [], operation: "CREATE", confirmed: false },
  ],
  unusedMaterials: [], warnings: ["完成证据仍待用户确认"], maturity: { level: "WORKABLE", missing: ["完成证据"] },
};

const projectOutput = {
  schemaVersion: "task-copilot-creation-draft-v1", targetType: "PROJECT", suggestedTitle: "统一硬件告警治理", suggestedPageName: "Project/统一硬件告警治理",
  nodes: [
    { semanticKey: "project-root", order: 0, nodeType: "PAGE_SECTION", text: "统一硬件告警治理", provenance: "AGENT_SYNTHESIS", evidenceRefs: [], operation: "CREATE", confirmed: false },
    { semanticKey: "goal", parentSemanticKey: "project-root", order: 0, nodeType: "BLOCK", text: "**[项目目标]** 建立持续可维护的硬件告警治理工作面", provenance: "AGENT_SYNTHESIS", evidenceRefs: [], operation: "CREATE", confirmed: false },
    { semanticKey: "current", parentSemanticKey: "project-root", order: 1, nodeType: "BLOCK", text: "**[当前推进]** 明确首批设备接入边界", provenance: "AGENT_SUGGESTION", evidenceRefs: [], operation: "CREATE", confirmed: false },
  ],
  unusedMaterials: [], warnings: [], maturity: { level: "EARLY", missing: ["完成证据", "范围外"] },
};

function fixture(value: unknown, targetType: "MINI_PROJECT" | "PROJECT") {
  const provider: StructuredProposalProvider = {
    providerId: "deepseek", providerVersion: "chat-completions-v1",
    completeStructured: async () => ({ value, metadata: { model: "deepseek-v4", durationMs: 14, attempts: 1 } }),
  };
  return {
    provider,
    request: { session: session(targetType), generationId: "draft-generation-one", core: { version: "1.0.0", content: "正式变化必须通过 Application Command。" }, skill: { version: "1.0.0", content: "草稿不等于正式创建。" }, targetSkill: { version: "1.0.0", content: "生成符合目标类型的结构。" } },
  };
}

test("Creation Draft generator validates a Logseq-style MiniProject node tree", async () => {
  const current = fixture(miniOutput, "MINI_PROJECT");
  const generated = await new LocalLlmCreationDraftGenerator(current.provider).generate(current.request);
  assert.equal(generated.draft.nodes[0]?.semanticKey, "mini-root");
  assert.equal(generated.draft.nodes[2]?.nodeType, "TODO");
  assert.equal(generated.draft.maturity.level, "WORKABLE");
  assert.match(generated.promptBundleVersion, /^[a-f0-9]{8}$/u);
});

test("Creation Draft generator validates a new independent Project Page tree", async () => {
  const current = fixture(projectOutput, "PROJECT");
  const generated = await new LocalLlmCreationDraftGenerator(current.provider).generate(current.request);
  assert.equal(generated.draft.suggestedObjectTitle, "统一硬件告警治理");
  assert.equal(generated.draft.nodes.every(({ operation }) => operation === "CREATE"), true);
});

test("Creation Draft generator rejects weak markers and source-escaping operations", async () => {
  const invalid = { ...miniOutput, nodes: miniOutput.nodes.map((node) => node.semanticKey === "goal" ? { ...node, text: "[目标] 不加粗" } : node) };
  const current = fixture(invalid, "MINI_PROJECT");
  await assert.rejects(() => new LocalLlmCreationDraftGenerator(current.provider).generate(current.request), (error: unknown) => error instanceof StructuredError && error.code === "CREATION_DRAFT_VALIDATION_FAILED");
});
