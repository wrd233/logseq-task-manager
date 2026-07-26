import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ServiceDescriptor } from "@task-copilot/service-client";
import { restoreRecoveryInterlockPath } from "@task-copilot/shared/node";

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
    assertServiceStartAllowed: async () => undefined,
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
    assertServiceStartAllowed: async () => undefined,
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

test("reap rechecks a lease heartbeat after waiting for the Graph lifecycle gate", async () => {
  let now = new Date("2026-07-24T00:00:00.000Z");
  let checkCount = 0;
  let releaseCheck!: () => void;
  const checkGate = new Promise<void>((resolve) => { releaseCheck = resolve; });
  let secondCheckEntered!: () => void;
  const secondCheck = new Promise<void>((resolve) => { secondCheckEntered = resolve; });
  const child = new FakeChild();
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 5_000,
    assertServiceStartAllowed: async () => {
      checkCount += 1;
      if (checkCount !== 2) return;
      secondCheckEntered();
      await checkGate;
    },
  }, async () => ({ child, descriptor }), () => now);

  const first = await manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" });
  now = new Date("2026-07-24T00:00:10.000Z");
  const ensuringSecond = manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-b" });
  await secondCheck;
  const reaping = manager.reapExpired();
  manager.heartbeat(first.leaseId);
  releaseCheck();
  const second = await ensuringSecond;
  await reaping;

  assert.doesNotThrow(() => manager.heartbeat(first.leaseId));
  assert.equal(child.stopped, false);
  await manager.release(first.leaseId);
  await manager.release(second.leaseId);
  assert.equal(child.stopped, true);
});

test("Restore recovery interlock blocks both a new spawn and a new lease on an existing runtime", async () => {
  const child = new FakeChild();
  let blocked = false;
  let starts = 0;
  const checks: string[] = [];
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 15_000,
    assertServiceStartAllowed: async (databasePath) => {
      checks.push(databasePath);
      if (blocked) throw new Error("RESTORE_RECOVERY_REQUIRED");
    },
  }, async () => {
    starts += 1;
    return { child, descriptor };
  });

  const first = await manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" });
  assert.equal(starts, 1);
  blocked = true;
  await assert.rejects(
    () => manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-b" }),
    /LAUNCHER_RESTORE_RECOVERY_REQUIRED/,
  );
  assert.equal(starts, 1);
  assert.deepEqual(checks, [graph.databasePath, graph.databasePath]);

  await manager.release(first.leaseId);
  await assert.rejects(
    () => manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-c" }),
    /LAUNCHER_RESTORE_RECOVERY_REQUIRED/,
  );
  assert.equal(starts, 1);
});

test("concurrent ensure calls coalesce one Graph spawn and attach both leases to the owned child", async () => {
  const child = new FakeChild();
  let releaseSpawn!: () => void;
  const spawnGate = new Promise<void>((resolve) => { releaseSpawn = resolve; });
  let spawnEntered!: () => void;
  const entered = new Promise<void>((resolve) => { spawnEntered = resolve; });
  let starts = 0;
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 15_000,
    assertServiceStartAllowed: async () => undefined,
  }, async () => {
    starts += 1;
    spawnEntered();
    await spawnGate;
    return { child, descriptor };
  });

  const firstPromise = manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" });
  await entered;
  const secondPromise = manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-b" });
  releaseSpawn();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.equal(starts, 1);
  assert.equal(first.serviceDescriptor, descriptor);
  assert.equal(second.serviceDescriptor, descriptor);
  assert.notEqual(first.leaseId, second.leaseId);
  await manager.release(first.leaseId);
  assert.equal(child.stopped, false);
  await manager.release(second.leaseId);
  assert.equal(child.stopped, true);
});

test("a replacement Service cannot spawn until the last owned child finishes stopping", async () => {
  let releaseStop!: () => void;
  const stopGate = new Promise<void>((resolve) => { releaseStop = resolve; });
  let stopEntered!: () => void;
  const stopping = new Promise<void>((resolve) => { stopEntered = resolve; });
  const firstChild = new FakeChild();
  firstChild.stop = async () => {
    firstChild.stopped = true;
    stopEntered();
    await stopGate;
  };
  const secondChild = new FakeChild();
  const children = [firstChild, secondChild];
  let starts = 0;
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 15_000,
    assertServiceStartAllowed: async () => undefined,
  }, async () => {
    const child = children[starts];
    starts += 1;
    if (!child) throw new Error("unexpected spawn");
    return { child, descriptor: { ...descriptor, pid: child.pid + starts } };
  });

  const first = await manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" });
  const releasing = manager.release(first.leaseId);
  await stopping;
  const replacementPromise = manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-b" });
  await Promise.resolve();
  assert.equal(starts, 1);
  releaseStop();
  await releasing;
  const replacement = await replacementPromise;
  assert.equal(starts, 2);
  assert.equal(replacement.serviceDescriptor.pid, secondChild.pid + 2);
  await manager.release(replacement.leaseId);
  assert.equal(secondChild.stopped, true);
});

test("close waits for an in-flight spawn and leaves no owned child running", async () => {
  let releaseSpawn!: () => void;
  const spawnGate = new Promise<void>((resolve) => { releaseSpawn = resolve; });
  let spawnEntered!: () => void;
  const entered = new Promise<void>((resolve) => { spawnEntered = resolve; });
  const child = new FakeChild();
  const manager = new GraphServiceManager({
    graphs: [graph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: "/Users/test/Task Copilot/runtime",
    leaseTtlMs: 15_000,
    assertServiceStartAllowed: async () => undefined,
  }, async () => {
    spawnEntered();
    await spawnGate;
    return { child, descriptor };
  });

  const ensuring = manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" });
  await entered;
  const closing = manager.close();
  releaseSpawn();
  await assert.rejects(ensuring, /LAUNCHER_CLOSED/);
  await closing;
  assert.equal(child.stopped, true);
  await assert.rejects(
    () => manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-b" }),
    /LAUNCHER_CLOSED/,
  );
});

test("Launcher preserves the distinction between an unconfirmed Restore arm and a confirmed recovery point", async () => {
  for (const [interlockError, launcherError] of [
    ["RESTORE_RECOVERY_ARMED", "LAUNCHER_RESTORE_RECOVERY_ARMED"],
    ["RESTORE_RECOVERY_REQUIRED", "LAUNCHER_RESTORE_RECOVERY_REQUIRED"],
    ["RESTORE_RECOVERY_STATE_INVALID", "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID"],
  ] as const) {
    const manager = new GraphServiceManager({
      graphs: [graph],
      serviceEntryPath: "/opt/task-copilot/service.js",
      runtimeRoot: "/Users/test/Task Copilot/runtime",
      leaseTtlMs: 15_000,
      assertServiceStartAllowed: async () => { throw new Error(interlockError); },
    }, async () => { throw new Error("must not spawn"); });
    await assert.rejects(
      () => manager.ensure({ graphKey: graph.graphKey, clientInstanceId: "plugin-a" }),
      new RegExp(launcherError),
    );
  }
});

test("corrupt or insecure interlock metadata remains a distinct fail-closed Launcher state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-launcher-interlock-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databasePath = join(root, "task-copilot.sqlite");
  await writeFile(databasePath, "placeholder", { mode: 0o600 });
  const path = restoreRecoveryInterlockPath(databasePath);
  const localGraph = { ...graph, databasePath };
  const manager = new GraphServiceManager({
    graphs: [localGraph],
    serviceEntryPath: "/opt/task-copilot/service.js",
    runtimeRoot: root,
    leaseTtlMs: 15_000,
  }, async () => { throw new Error("must not spawn"); });

  await writeFile(path, "{invalid", { mode: 0o600 });
  await assert.rejects(
    () => manager.ensure({ graphKey: localGraph.graphKey, clientInstanceId: "plugin-a" }),
    /LAUNCHER_RESTORE_RECOVERY_STATE_INVALID/,
  );
  await writeFile(path, JSON.stringify({
    schemaVersion: 1,
    status: "RECOVERY_REQUIRED",
    graphId: localGraph.graphId,
    recoveryBackupId: "backup_20260726172000000_33333333333333333333333333333333",
    createdAt: "2026-07-26T17:20:00.000Z",
  }));
  await chmod(path, 0o644);
  await assert.rejects(
    () => manager.ensure({ graphKey: localGraph.graphKey, clientInstanceId: "plugin-b" }),
    /LAUNCHER_RESTORE_RECOVERY_STATE_INVALID/,
  );
});
