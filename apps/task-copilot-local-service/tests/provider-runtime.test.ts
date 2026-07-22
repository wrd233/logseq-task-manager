import assert from "node:assert/strict";
import test from "node:test";

import { DeepSeekProviderError } from "../src/deepseek-provider.ts";
import { RuntimeSecretResolver, loadProposalGeneratorFromEnvironment } from "../src/provider-runtime.ts";

test("Provider remains disabled unless the runtime explicitly selects DeepSeek", async () => {
  assert.equal(await loadProposalGeneratorFromEnvironment({}), undefined);
  await assert.rejects(
    () => loadProposalGeneratorFromEnvironment({ TASK_COPILOT_LLM_PROVIDER: "unknown" }),
    (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_PROVIDER_UNSUPPORTED",
  );
});

test("runtime resolves a secret reference without placing the secret in public environment config", async () => {
  const references: string[] = [];
  const generator = await loadProposalGeneratorFromEnvironment({
    TASK_COPILOT_LLM_PROVIDER: "deepseek",
    TASK_COPILOT_DEEPSEEK_API_KEY_REF: "keychain:task-copilot/deepseek",
    DEEPSEEK_BASE_URL: "https://provider.example/v1",
    DEEPSEEK_MODEL: "actual-runtime-model",
  }, { resolve: (reference) => { references.push(reference); return "runtime-only-secret"; } });
  assert(generator);
  assert.deepEqual(references, ["keychain:task-copilot/deepseek"]);
});

test("runtime rejects output token limits outside the bounded provider range", async () => {
  await assert.rejects(
    () => loadProposalGeneratorFromEnvironment({
      TASK_COPILOT_LLM_PROVIDER: "deepseek",
      TASK_COPILOT_DEEPSEEK_API_KEY_REF: "env:DEEPSEEK_API_KEY",
      DEEPSEEK_BASE_URL: "https://provider.example/v1",
      DEEPSEEK_MODEL: "actual-runtime-model",
      DEEPSEEK_MAX_OUTPUT_TOKENS: "999999",
    }, { resolve: () => "runtime-only-secret" }),
    (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_CONFIG_INVALID",
  );
});

test("runtime rejects timeout limits outside the bounded provider range", async () => {
  await assert.rejects(
    () => loadProposalGeneratorFromEnvironment({
      TASK_COPILOT_LLM_PROVIDER: "deepseek",
      TASK_COPILOT_DEEPSEEK_API_KEY_REF: "env:DEEPSEEK_API_KEY",
      DEEPSEEK_BASE_URL: "https://provider.example/v1",
      DEEPSEEK_MODEL: "actual-runtime-model",
      DEEPSEEK_TIMEOUT_MS: "120001",
    }, { resolve: () => "runtime-only-secret" }),
    (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_CONFIG_INVALID",
  );
});

test("environment secret resolver accepts only bounded references and never falls back to a shell", async () => {
  const resolver = new RuntimeSecretResolver({ DEEPSEEK_API_KEY: "in-memory-key" });
  assert.equal(await resolver.resolve("env:DEEPSEEK_API_KEY"), "in-memory-key");
  for (const reference of ["DEEPSEEK_API_KEY", "env:bad-name", "keychain:missing-account", "keychain:service/account/extra"]) {
    await assert.rejects(() => resolver.resolve(reference), (error: unknown) => error instanceof DeepSeekProviderError && error.code === "LLM_SECRET_REFERENCE_INVALID");
  }
});
