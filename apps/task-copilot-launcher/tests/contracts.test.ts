import assert from "node:assert/strict";
import test from "node:test";

import {
  LAUNCHER_PROTOCOL_VERSION,
  parseLauncherConfig,
  parseLauncherRunnerArgs,
  validateLauncherDescriptor,
} from "../src/contracts.ts";

const validConfig = {
  schemaVersion: 1,
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
