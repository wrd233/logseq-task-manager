import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDescriptor } from "@task-copilot/service-client";

import { createNodeRestoreRecoverySpawner, createNodeServiceSpawner, type ChildProcessPort, type SpawnPort } from "../src/spawner.ts";

const descriptor: ServiceDescriptor = {
  protocolVersion: 1,
  url: "http://127.0.0.1:42123/",
  token: "h".repeat(48),
  pid: 2468,
  createdAt: "2026-07-24T00:00:00.000Z",
};

class FakeProcess implements ChildProcessPort {
  readonly pid = 2468;
  readonly exitCode = null;
  signals: NodeJS.Signals[] = [];
  private exitListeners: Array<() => void> = [];

  once(event: "exit", listener: () => void): void {
    assert.equal(event, "exit");
    this.exitListeners.push(listener);
  }

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    for (const listener of this.exitListeners) listener();
    return true;
  }
}

test("real spawner invokes the current Node executable without a shell and stops only its returned child", async () => {
  const child = new FakeProcess();
  const calls: Array<{ command: string; args: readonly string[]; options: Record<string, unknown> }> = [];
  const spawn: SpawnPort = (command, args, options) => {
    calls.push({ command, args, options });
    return child;
  };
  const spawner = createNodeServiceSpawner({
    nodeExecutable: "/opt/homebrew/opt/node@20/bin/node",
    spawn,
    prepareDescriptor: async () => undefined,
    waitForDescriptor: async () => descriptor,
  });
  const result = await spawner({
    graph: { graphKey: "graph-key", graphId: "graph-id", databasePath: "/Users/test/graph.sqlite" },
    serviceEntryPath: "/Users/test/service.js",
    descriptorPath: "/Users/test/runtime/graph.service.json",
  });
  assert.equal(calls.length, 1);
  const { options, ...call } = calls[0]!;
  const { env, ...spawnOptions } = options;
  assert.deepEqual({ ...call, options: spawnOptions }, {
    command: "/opt/homebrew/opt/node@20/bin/node",
    args: [
      "/Users/test/service.js",
      "--database", "/Users/test/graph.sqlite",
      "--graph-id", "graph-id",
      "--descriptor", "/Users/test/runtime/graph.service.json",
      "--owner-pid", String(process.pid),
    ],
    options: { shell: false, detached: false, stdio: "ignore", cwd: "/Users/test" },
  });
  assert.equal((env as NodeJS.ProcessEnv).TASK_COPILOT_LLM_PROVIDER, undefined);
  assert.equal((env as NodeJS.ProcessEnv).DEEPSEEK_API_KEY, undefined);
  assert.equal(result.descriptor, descriptor);
  await result.child.stop();
  assert.deepEqual(child.signals, ["SIGTERM"]);
});

test("spawner exposes only validated provider metadata and a Keychain reference to the Service child", async () => {
  const child = new FakeProcess();
  let options: Record<string, unknown> | undefined;
  const spawner = createNodeServiceSpawner({
    nodeExecutable: "/opt/homebrew/opt/node@20/bin/node",
    spawn: (_command, _args, received) => {
      options = received;
      return child;
    },
    prepareDescriptor: async () => undefined,
    waitForDescriptor: async () => descriptor,
  });
  await spawner({
    graph: { graphKey: "graph-key", graphId: "graph-id", databasePath: "/Users/test/graph.sqlite" },
    serviceEntryPath: "/Users/test/service.js",
    descriptorPath: "/Users/test/runtime/graph.service.json",
    provider: {
      providerId: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKeyRef: "keychain:task-copilot/deepseek",
      timeoutMs: 60_000,
      maxOutputTokens: 4_096,
    },
  });
  const env = options?.env as NodeJS.ProcessEnv;
  assert.equal(env.TASK_COPILOT_LLM_PROVIDER, "deepseek");
  assert.equal(env.DEEPSEEK_BASE_URL, "https://api.deepseek.com");
  assert.equal(env.DEEPSEEK_MODEL, "deepseek-chat");
  assert.equal(env.TASK_COPILOT_DEEPSEEK_API_KEY_REF, "keychain:task-copilot/deepseek");
  assert.equal(env.DEEPSEEK_TIMEOUT_MS, "60000");
  assert.equal(env.DEEPSEEK_MAX_OUTPUT_TOKENS, "4096");
  assert.equal(env.DEEPSEEK_API_KEY, undefined);
});

test("Restore recovery spawner runs the one-shot Local Service maintenance mode without a shell or Provider environment", async () => {
  let exitCode: number | null = null;
  let exitListener: (() => void) | undefined;
  const calls: Array<{ command: string; args: readonly string[]; options: Record<string, unknown> }> = [];
  const child: ChildProcessPort = {
    pid: 9753,
    get exitCode() { return exitCode; },
    once(event, listener) {
      assert.equal(event, "exit");
      exitListener = listener;
    },
    kill() { return true; },
  };
  const spawner = createNodeRestoreRecoverySpawner({
    nodeExecutable: "/opt/homebrew/opt/node@20/bin/node",
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      queueMicrotask(() => {
        exitCode = 0;
        exitListener?.();
      });
      return child;
    },
  });
  await spawner({
    graph: { graphKey: "graph-key", graphId: "graph-id", databasePath: "/Users/test/graph.sqlite" },
    serviceEntryPath: "/Users/test/service.js",
  });
  assert.deepEqual(calls, [{
    command: "/opt/homebrew/opt/node@20/bin/node",
    args: [
      "/Users/test/service.js",
      "recover-restore",
      "--database", "/Users/test/graph.sqlite",
      "--graph-id", "graph-id",
    ],
    options: { shell: false, detached: false, stdio: "ignore", cwd: "/Users/test" },
  }]);
});

test("Restore recovery spawner kills a timed-out maintenance process instead of reporting ambiguous success", async () => {
  let exitListener: (() => void) | undefined;
  let killedWith: NodeJS.Signals | undefined;
  const child: ChildProcessPort = {
    pid: 9754,
    exitCode: null,
    once(event, listener) {
      assert.equal(event, "exit");
      exitListener = listener;
    },
    kill(signal) {
      killedWith = signal;
      queueMicrotask(() => exitListener?.());
      return true;
    },
  };
  const spawner = createNodeRestoreRecoverySpawner({
    timeoutMs: 5,
    spawn: () => child,
  });
  await assert.rejects(() => spawner({
    graph: { graphKey: "graph-key", graphId: "graph-id", databasePath: "/Users/test/graph.sqlite" },
    serviceEntryPath: "/Users/test/service.js",
  }), /LAUNCHER_RESTORE_RECOVERY_PROCESS_TIMEOUT/);
  assert.equal(killedWith, "SIGKILL");
});
