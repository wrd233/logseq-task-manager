import assert from "node:assert/strict";
import test from "node:test";

import { checksum } from "@task-copilot/shared";
import type { V2Proposal } from "@task-copilot/domain";

import {
  buildSelectedBlockProposalPrompt,
  buildSelectedBlockProposalRevisionPrompt,
  presentSelectedBlockAnalysisNotice,
} from "../src/v2-provider-analysis.ts";

test("selected Block analysis notices keep pipeline terms out of the ordinary user path", () => {
  const noProposal = presentSelectedBlockAnalysisNotice({
    kind: "NO_PROPOSAL",
    reason: "NO_PROPOSAL：Provider未形成Proposal；没有Commit或Store变化。",
  });
  assert.equal(noProposal, "这条内容暂时不需要整理。暂不整理：智能整理未形成建议；没有正式应用或正式状态变化。");
  assert.doesNotMatch(noProposal, /NO_PROPOSAL|Provider|Proposal|Commit|Store/);
  assert.equal(
    presentSelectedBlockAnalysisNotice({ kind: "NO_PROPOSAL", reason: " " }),
    "这条内容暂时不需要整理。当前材料还没有形成明确的任务、决定或成果。",
  );

  const ready = presentSelectedBlockAnalysisNotice({ kind: "PROPOSAL_READY" });
  assert.equal(ready, "整理建议已放入“待我确认”。当前正文和正式状态还没有变化。");
  assert.doesNotMatch(ready, /Proposal|Commit|Store/);
});

test("selected Block prompt is bounded, five-layered, and carries exact machine evidence", () => {
  const prompt = buildSelectedBlockProposalPrompt({ blockUuid: "block-provider-1", text: "明天确认发布范围。", version: 17 });
  assert.deepEqual(Object.keys(prompt), ["core", "domain", "skill", "userSemantics", "runtimeContext"]);
  assert.match(prompt.domain.content, /NO_PROPOSAL/);
  assert.match(prompt.domain.content, /Review、Commit 和 Undo|Local Service/);
  assert.match(prompt.domain.content, /finalPreview.*textPatch\.afterText.*payload\.text/);
  const context = JSON.parse(prompt.runtimeContext.content) as {
    selectedBlock: { uuid: string; beforeHash: string; version: number };
    requiredScopeShape: { read: unknown[]; modify: Array<{ kind: string; id: string; version: number; hash: string }> };
    requiredTextPatchShape: { blockUuid: string; beforeText: string; afterText: string };
    requiredSemanticOperationShape: { kind: string; target: { id: string }; payload: { objectType: string; text: string } };
    requiredGroupShape: { risk: string; independentlyAcceptable: boolean; disposition: string; dependencies: unknown[] };
    instruction: string;
  };
  assert.deepEqual(context.selectedBlock, { uuid: "block-provider-1", text: "明天确认发布范围。", beforeHash: checksum("明天确认发布范围。"), version: 17 });
  assert.deepEqual(context.requiredScopeShape, { read: [], modify: [{ kind: "BLOCK", id: "block-provider-1", version: 17, hash: checksum("明天确认发布范围。") }] });
  assert.deepEqual(context.requiredTextPatchShape, { blockUuid: "block-provider-1", beforeText: "明天确认发布范围。", afterText: "<使用既有显式语法开头的完整最终正文>" });
  assert.equal(context.requiredSemanticOperationShape.kind, "CREATE_OBJECT");
  assert.equal(context.requiredSemanticOperationShape.target.id, "block-provider-1");
  assert.deepEqual(context.requiredSemanticOperationShape.payload, { objectType: "<TASK|MINI_PROJECT|DECISION|OUTPUT>", text: "<与 afterText 完全相同的完整最终正文>" });
  assert.deepEqual(context.requiredGroupShape, { groupId: "formalize", explanation: "<人类可读说明>", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [context.requiredTextPatchShape], semanticOperations: [context.requiredSemanticOperationShape], disposition: "PENDING" });
  assert.match(context.instruction, /groups 必须是只包含 requiredGroupShape 的数组/);
  assert.doesNotMatch(JSON.stringify(prompt), /Authorization|Bearer|API_KEY/);
});

test("selected Block prompt rejects missing and oversized evidence before any Provider call", () => {
  assert.throws(() => buildSelectedBlockProposalPrompt({ blockUuid: "", text: "正文" }), /没有调用 Provider/);
  assert.throws(() => buildSelectedBlockProposalPrompt({ blockUuid: "block", text: "x".repeat(8_001) }), /没有调用 Provider/);
});

test("selected Block revision keeps one machine intent and carries bounded user feedback", () => {
  const beforeText = "明天确认发布范围。";
  const afterText = "[任务] 明天确认发布范围。";
  const blockTarget = { kind: "BLOCK" as const, id: "block-provider-1", hash: checksum(beforeText) };
  const current: V2Proposal = {
    proposalId: "prop-provider-1", schemaVersion: "v2", title: "确认范围", context: "用户记录待办。", understanding: "这是 Task。", objective: "形成任务。", logic: "显式化。", finalPreview: afterText,
    unresolvedQuestions: [], source: { kind: "local_llm", provider: "deepseek", model: "deepseek-v4-flash" }, scope: { read: [], modify: [blockTarget] }, preconditions: [], status: "READY", createdAt: "2026-07-22T07:00:00.000Z",
    groups: [{ groupId: "formalize", explanation: "正式化。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], disposition: "PENDING",
      textPatches: [{ blockUuid: blockTarget.id, beforeText, afterText, beforeHash: blockTarget.hash, afterHash: checksum(afterText) }],
      semanticOperations: [{ operationId: "create-object", kind: "CREATE_OBJECT", target: blockTarget, summary: "创建 Task", payload: { objectType: "TASK", text: afterText }, preconditions: [] }],
    }],
  };
  const prompt = buildSelectedBlockProposalRevisionPrompt({ blockUuid: blockTarget.id, text: beforeText }, current, "保留原句，标题更简洁");
  const context = JSON.parse(prompt.runtimeContext.content) as { currentProposal: V2Proposal; revisionInstruction: string; instruction: string };
  assert.equal(prompt.skill.version, "analyze-selected-block-revise-1");
  assert.equal(context.currentProposal.proposalId, current.proposalId);
  assert.equal(context.revisionInstruction, "保留原句，标题更简洁");
  assert.match(context.instruction, /同一 Proposal/);
  assert.throws(() => buildSelectedBlockProposalRevisionPrompt({ blockUuid: blockTarget.id, text: "正文已变化" }, current, "调整"), /没有调用 Provider/);
  assert.throws(() => buildSelectedBlockProposalRevisionPrompt({ blockUuid: blockTarget.id, text: beforeText }, current, " "), /没有调用 Provider/);
});
