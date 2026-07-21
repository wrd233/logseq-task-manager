import assert from "node:assert/strict";
import test from "node:test";

import { checksum } from "@task-copilot/shared";

import { buildSelectedBlockProposalPrompt } from "../src/v2-provider-analysis.ts";

test("selected Block prompt is bounded, five-layered, and carries exact machine evidence", () => {
  const prompt = buildSelectedBlockProposalPrompt({ blockUuid: "block-provider-1", text: "明天确认发布范围。", version: 17 });
  assert.deepEqual(Object.keys(prompt), ["core", "domain", "skill", "userSemantics", "runtimeContext"]);
  assert.match(prompt.domain.content, /NO_PROPOSAL/);
  assert.match(prompt.domain.content, /Review、Commit 和 Undo|Local Service/);
  const context = JSON.parse(prompt.runtimeContext.content) as { selectedBlock: { uuid: string; beforeHash: string; version: number } };
  assert.deepEqual(context.selectedBlock, { uuid: "block-provider-1", text: "明天确认发布范围。", beforeHash: checksum("明天确认发布范围。"), version: 17 });
  assert.doesNotMatch(JSON.stringify(prompt), /Authorization|Bearer|API_KEY/);
});

test("selected Block prompt rejects missing and oversized evidence before any Provider call", () => {
  assert.throws(() => buildSelectedBlockProposalPrompt({ blockUuid: "", text: "正文" }), /没有调用 Provider/);
  assert.throws(() => buildSelectedBlockProposalPrompt({ blockUuid: "block", text: "x".repeat(8_001) }), /没有调用 Provider/);
});
