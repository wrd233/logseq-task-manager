import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDescriptor } from "@task-copilot/service-client";

import { GraphServiceManager, type ManagedChild, type SpawnServiceInput } from "../src/manager.ts";

const graph = {
  graphKey: "graph-key-123",
  graphId: "personal-graph",
  databasePath: "/Users/test/Task Copilot/personal.sqlite",
};

const descriptor: ServiceDescriptor = {
  protocolVersion: 1,
  url: "http://127.0.0.1:43123/",
  token: "c".repeat(48),
  pid: 4321,
  createdAt: "2026-07-24T00:00:00.000Z",
};

class FakeChild implements ManagedChild {
  readonly pid = 4321;
  stopped = false;
  private exitListener?: () => void;

  onExit(listener: () => void): void {
    this.exitListener = listener;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.exitListener?.();
  }
}

test("manager starts one shell-free Graph-bound Service and shares it across live Plugin leases", async () => {
  const children: FakeChild[] = [];
  const starts: SpawnServiceInput[] = [];
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 15_000,
  }, async (input) => {
    starts.push(input);
    const child = new FakeChild();
    children.push(child);
    return { child, descriptor };
  }, () => new Date("2026-07-24T00:00:00.000Z"));

  const first = await manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" });
  const second = await manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-b" });

  assert.equal(starts.length, 1);
  assert.equal(first.serviceDescriptor, descriptor);
  assert.equal(second.serviceDescriptor, descriptor);
  assert.notEqual(first.leaseId, second.leaseId);
  assert.deepEqual(starts[0]?.graph, graph);
  assert.equal(starts[0]?.serviceEntryPath, "/opt/task-copilot/service.js");
  assert.match(starts[0]?.descriptorPath ?? "", /^\/Users\/test\/Task Copilot\/runtime\/[a-f0-9]{32}\.service\.json$/);

  await manager.release(first.leaseId);
  assert.equal(children[0]?.stopped, false);
  await manager.release(second.leaseId);
  assert.equal(children[0]?.stopped, true);
});

test("manager refuses unknown Graphs and only stops the exact child it owns", async () => {
  const child = new FakeChild();
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 15_000,
  }, async () => ({ child, descriptor }));

  await assert.rejects(() => manager.ensure({ graphKey: "other", clientInstanceId: "plugin-a" }), /LAUNCHER_GRAPH_NOT_CONFIGURED/);
  assert.equal(child.stopped, false);
  await manager.close();
  assert.equal(child.stopped, false);
});

test("expired Plugin leases stop their owned Service while a heartbeat preserves the same lease", async () => {
  let now = new Date("2026-07-24T00:00:00.000Z");
  const child = new FakeChild();
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 5_000,
  }, async () => ({ child, descriptor }), () => now);

  const session = await manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" });
  now = new Date("2026-07-24T00:00:04.000Z");
  manager.heartbeat(session.leaseId);
  now = new Date("2026-07-24T00:00:08.000Z");
  await manager.reapExpired();
  assert.equal(child.stopped, false);
  now = new Date("2026-07-24T00:00:10.000Z");
  await manager.reapExpired();
  assert.equal(child.stopped, true);
});
