import assert from "node:assert/strict";
import test from "node:test";

import {
  DeepSeekProviderError,
  DeepSeekStructuredProvider,
  resolveDeepSeekProviderConfig,
  type DeepSeekProviderTransport,
} from "../src/deepseek-provider.ts";

const config = { baseUrl: "https://provider.example/v1", model: "configured-model-id", apiKey: "secret-test-key", retryBaseDelayMs: 0 };

function transport(body: unknown, status = 200, headers?: Record<string, string>): DeepSeekProviderTransport {
  return { fetch: async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }) };
}

test("DeepSeek structured provider assembles configured request and returns bounded metadata", async () => {
  let observedInput = "";
  let observedInit: RequestInit | undefined;
  const provider = new DeepSeekStructuredProvider(config, {
    now: (() => { let value = 100; return () => (value += 15); })(),
    fetch: async (input, init) => {
      observedInput = String(input);
      observedInit = init;
      return new Response(JSON.stringify({
        id: "body-request-id",
        model: "actual-model-id",
        choices: [{ finish_reason: "stop", message: { content: "```json\n{\"classification\":\"TASK\"}\n```" } }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      }), { headers: { "x-request-id": "header-request-id" } });
    },
  });
  const result = await provider.completeStructured({ system: "只返回 JSON。", user: "判断对象类型。" });
  assert.deepEqual(result.value, { classification: "TASK" });
  assert.deepEqual(result.metadata, {
    requestId: "header-request-id", model: "actual-model-id", finishReason: "stop",
    promptTokens: 10, completionTokens: 4, totalTokens: 14, durationMs: 15, attempts: 1,
  });
  assert.equal(observedInput, "https://provider.example/v1/chat/completions");
  assert.equal(new Headers(observedInit?.headers).get("authorization"), "Bearer secret-test-key");
  assert.deepEqual(JSON.parse(String(observedInit?.body)), {
    model: "configured-model-id", temperature: 0, max_tokens: 2048, response_format: { type: "json_object" },
    messages: [{ role: "system", content: "只返回 JSON。" }, { role: "user", content: "判断对象类型。" }],
  });
});

test("a bounded explicit output token limit is sent without changing the default", async () => {
  let body: Record<string, unknown> | undefined;
  const provider = new DeepSeekStructuredProvider({ ...config, maxOutputTokens: 8_192 }, {
    fetch: async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }));
    },
  });
  await provider.completeStructured({ system: "JSON", user: "输入" });
  assert.equal(body?.max_tokens, 8_192);
  for (const invalid of [255, 8_193, 2.5]) {
    assert.throws(() => new DeepSeekStructuredProvider({ ...config, maxOutputTokens: invalid }), (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_CONFIG_INVALID");
  }
});

test("secret reference is resolved out of band and is never returned as public config metadata", async () => {
  let reference = "";
  const resolved = await resolveDeepSeekProviderConfig(
    { baseUrl: "https://provider.example/v1", model: "runtime-model", apiKeyRef: "env:DEEPSEEK_API_KEY" },
    { resolve: (value) => { reference = value; return "resolved-secret"; } },
  );
  assert.equal(reference, "env:DEEPSEEK_API_KEY");
  assert.equal(resolved.apiKey, "resolved-secret");
  assert.doesNotMatch(JSON.stringify({ baseUrl: resolved.baseUrl, model: resolved.model }), /resolved-secret/);
});

test("invalid provider JSON, empty content, and truncated output are zero-write structured errors", async () => {
  const cases = [
    [{ choices: [{ message: { content: "not-json" } }] }, "LLM_RESPONSE_INVALID_JSON"],
    [{ choices: [{ message: { content: "" } }] }, "LLM_RESPONSE_EMPTY"],
    [{ choices: [{ finish_reason: "length", message: { content: "{}" } }] }, "LLM_OUTPUT_TRUNCATED"],
  ] as const;
  for (const [body, code] of cases) {
    const provider = new DeepSeekStructuredProvider(config, transport(body));
    await assert.rejects(() => provider.completeStructured({ system: "JSON", user: "输入" }), (error: unknown) => {
      assert(error instanceof DeepSeekProviderError);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret-test-key|not-json/);
      return true;
    });
  }
});

test("HTTP errors are classified without response bodies or credentials", async () => {
  const cases = [[401, "LLM_AUTH_FAILED", false], [404, "LLM_MODEL_OR_ENDPOINT_NOT_FOUND", false], [429, "LLM_RATE_LIMITED", true], [503, "LLM_HTTP_ERROR", true]] as const;
  for (const [status, code, retryable] of cases) {
    const provider = new DeepSeekStructuredProvider({ ...config, maxRetries: 0 }, transport({ error: { message: "secret-test-key" } }, status));
    await assert.rejects(() => provider.completeStructured({ system: "JSON", user: "输入" }), (error: unknown) => {
      assert(error instanceof DeepSeekProviderError);
      assert.equal(error.code, code);
      assert.deepEqual(error.details, { status, retryable });
      assert.doesNotMatch(error.message, /secret-test-key/);
      return true;
    });
  }
});

test("retry is capped and only applies to retryable failures", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const provider = new DeepSeekStructuredProvider({ ...config, maxRetries: 2, retryBaseDelayMs: 10 }, {
    fetch: async () => {
      attempts += 1;
      if (attempts < 3) return new Response("{}", { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }));
    },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  const result = await provider.completeStructured({ system: "JSON", user: "输入" });
  assert.equal(result.metadata.attempts, 3);
  assert.deepEqual(delays, [10, 20]);

  attempts = 0;
  const exhausted = new DeepSeekStructuredProvider({ ...config, maxRetries: 1 }, {
    fetch: async () => { attempts += 1; throw new TypeError("network includes secret-test-key"); },
    sleep: async () => undefined,
  });
  await assert.rejects(() => exhausted.completeStructured({ system: "JSON", user: "输入" }), (error: unknown) => {
    assert(error instanceof DeepSeekProviderError);
    assert.equal(error.code, "LLM_UNAVAILABLE");
    assert.equal(attempts, 2);
    assert.doesNotMatch(`${error.message}${JSON.stringify(error.details)}`, /secret-test-key/);
    return true;
  });
});

test("external cancellation aborts the request and is distinguished from timeout", async () => {
  const hanging: DeepSeekProviderTransport = { fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) };
  const provider = new DeepSeekStructuredProvider({ ...config, timeoutMs: 5_000 }, hanging);
  const controller = new AbortController();
  const pending = provider.completeStructured({ system: "JSON", user: "输入", signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_CANCELLED");
});

test("an already-cancelled signal prevents the first transport request", async () => {
  let attempts = 0;
  const provider = new DeepSeekStructuredProvider(config, { fetch: async () => { attempts += 1; throw new Error("must not run"); } });
  const controller = new AbortController();
  controller.abort("user-cancelled");
  await assert.rejects(() => provider.completeStructured({ system: "JSON", user: "输入", signal: controller.signal }), (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_CANCELLED");
  assert.equal(attempts, 0);
});

test("timeout is bounded and does not retry or include credentials", async () => {
  let attempts = 0;
  const hanging: DeepSeekProviderTransport = { fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
    attempts += 1;
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) };
  const provider = new DeepSeekStructuredProvider({ ...config, timeoutMs: 100, maxRetries: 2 }, hanging);
  await assert.rejects(() => provider.completeStructured({ system: "JSON", user: "输入" }), (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_TIMEOUT");
  assert.equal(attempts, 1);
});
