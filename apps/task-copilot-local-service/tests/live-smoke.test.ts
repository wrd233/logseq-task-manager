import assert from "node:assert/strict";
import test from "node:test";

import type { StructuredProposalProvider } from "../src/llm-proposal.ts";
import { runDeepSeekLiveSmoke } from "../src/live-smoke.ts";

function provider(value: unknown): StructuredProposalProvider & { calls: number } {
  return {
    calls: 0,
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    async completeStructured() {
      this.calls += 1;
      return { value, metadata: { requestId: "req-live", model: "actual-v4", durationMs: 80, attempts: 1, promptTokens: 20, completionTokens: 10, totalTokens: 30 } };
    },
  };
}

test("live smoke performs zero requests unless the explicit gate is enabled", async () => {
  const mock = provider({ language: "zh", status: "ok", summary: "可用" });
  await assert.rejects(() => runDeepSeekLiveSmoke({}, mock), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "LLM_LIVE_GATE_DISABLED");
  assert.equal(mock.calls, 0);
});

test("live smoke emits only bounded metadata and zero-write evidence", async () => {
  const mock = provider({ language: "zh", status: "ok", summary: "中文结构化输出可用。" });
  const report = await runDeepSeekLiveSmoke({ RUN_LIVE_LLM_TESTS: "1" }, mock);
  assert.deepEqual(report, {
    status: "PASS", provider: "deepseek", providerVersion: "chat-completions-v1", actualModel: "actual-v4", requestId: "req-live",
    durationMs: 80, attempts: 1, promptTokens: 20, completionTokens: 10, totalTokens: 30,
    structuredJsonValid: true, graphWrites: 0, formalStoreWrites: 0,
  });
  assert.doesNotMatch(JSON.stringify(report), /Authorization|Bearer|API_KEY|raw/i);
});

test("HTTP success with a wrong Schema still fails the live gate", async () => {
  const mock = provider({ language: "zh", status: "maybe", summary: "不确定" });
  await assert.rejects(() => runDeepSeekLiveSmoke({ RUN_LIVE_LLM_TESTS: "1" }, mock), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "LLM_LIVE_SCHEMA_INVALID");
  assert.equal(mock.calls, 1);
});
