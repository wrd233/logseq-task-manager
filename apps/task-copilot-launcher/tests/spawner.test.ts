import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDescriptor } from "@task-copilot/service-client";

import { createNodeServiceSpawner, type ChildProcessPort, type SpawnPort } from "../src/spawner.ts";

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
  assert.deepEqual(calls, [{
    command: "/opt/homebrew/opt/node@20/bin/node",
    args: [
      "/Users/test/service.js",
      "--database", "/Users/test/graph.sqlite",
      "--graph-id", "graph-id",
      "--descriptor", "/Users/test/runtime/graph.service.json",
    ],
    options: { shell: false, detached: false, stdio: "ignore", cwd: "/Users/test" },
  }]);
  assert.equal(result.descriptor, descriptor);
  await result.child.stop();
  assert.deepEqual(child.signals, ["SIGTERM"]);
});
