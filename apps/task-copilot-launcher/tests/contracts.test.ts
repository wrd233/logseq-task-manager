import assert from "node:assert/strict";
import test from "node:test";

import {
  LAUNCHER_PROTOCOL_VERSION,
  parseLauncherConfig,
  parseLauncherRunnerArgs,
  validateLauncherDescriptor,
} from "../src/contracts.ts";

const validConfig = {
  schemaVersion: 2,
  listenPort: 19673,
  token: "a".repeat(48),
  serviceEntryPath: "/opt/task-copilot/service.js",
  runtimeRoot: "/Users/test/Library/Application Support/Task Copilot/runtime",
  descriptorPath: "/Users/test/Library/Application Support/Task Copilot/launcher.json",
  leaseTtlMs: 15_000,
  graphs: [{
    graphKey: "graph-key-123",
    graphId: "personal-graph",
    databasePath: "/Users/test/Library/Application Support/Task Copilot/personal.sqlite",
  }],
  provider: {
    providerId: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKeyRef: "keychain:task-copilot/deepseek",
    timeoutMs: 60_000,
    maxOutputTokens: 4_096,
  },
};

test("launcher config requires one explicit absolute Graph mapping and bounded lease settings", () => {
  assert.deepEqual(parseLauncherConfig(validConfig), validConfig);
  assert.throws(() => parseLauncherConfig({ ...validConfig, listenPort: 0 }), /listenPort/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, token: "short" }), /token/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, serviceEntryPath: "service.js" }), /serviceEntryPath/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, runtimeRoot: "/tmp", descriptorPath: "/tmp/launcher.json" }), /must not be inside a shared temporary directory/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, leaseTtlMs: 999 }), /leaseTtlMs/);
  assert.throws(() => parseLauncherConfig({
    ...validConfig,
    graphs: [...validConfig.graphs, { ...validConfig.graphs[0], databasePath: "/another.sqlite" }],
  }), /duplicate graphKey/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, graphs: [{ ...validConfig.graphs[0], databasePath: "relative.sqlite" }] }), /databasePath/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, provider: { ...validConfig.provider, apiKeyRef: "env:DEEPSEEK_API_KEY" } }), /apiKeyRef/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, provider: { ...validConfig.provider, baseUrl: "https://user:pass@example.com" } }), /baseUrl/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, provider: { ...validConfig.provider, extra: "secret" } }), /provider/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, provider: { ...validConfig.provider, timeoutMs: 120_001 } }), /timeoutMs/);
  assert.throws(() => parseLauncherConfig({ ...validConfig, provider: { ...validConfig.provider, maxOutputTokens: 128 } }), /maxOutputTokens/);
});

test("launcher config migrates schema v1 to a provider-disabled schema v2 result", () => {
  const { provider, ...providerDisabled } = validConfig;
  assert.equal(provider.providerId, "deepseek");
  const legacy = { ...providerDisabled, schemaVersion: 1 };
  assert.deepEqual(parseLauncherConfig(legacy), {
    ...providerDisabled,
    schemaVersion: 2,
  });
});

test("launcher descriptor is a distinct stable management endpoint rather than an ephemeral Service descriptor", () => {
  const descriptor = validateLauncherDescriptor({
    kind: "task-copilot-launcher",
    protocolVersion: LAUNCHER_PROTOCOL_VERSION,
    url: "http://127.0.0.1:19673/",
    token: "b".repeat(48),
  });
  assert.equal(descriptor.kind, "task-copilot-launcher");
  assert.equal(descriptor.protocolVersion, LAUNCHER_PROTOCOL_VERSION);
  assert.throws(
    () => validateLauncherDescriptor({ ...descriptor, url: "http://localhost:19673/" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "LAUNCHER_DESCRIPTOR_NON_LOOPBACK",
  );
  assert.throws(
    () => validateLauncherDescriptor({ ...descriptor, kind: "task-copilot-service" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "LAUNCHER_DESCRIPTOR_INVALID",
  );
});

test("launcher runner accepts only an explicit config path", () => {
  assert.deepEqual(parseLauncherRunnerArgs(["--config", "/Users/test/task-copilot-launcher.json"]), {
    configPath: "/Users/test/task-copilot-launcher.json",
  });
  assert.throws(() => parseLauncherRunnerArgs([]), /Usage/);
  assert.throws(() => parseLauncherRunnerArgs(["--config", "relative.json"]), /absolute/);
  assert.throws(() => parseLauncherRunnerArgs(["--config", "/a", "--extra", "b"]), /Usage/);
});
