import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { KernelClient } from "@task-copilot/client/browser";
import { GraphIdentityState } from "../src/block-identity.ts";
import { PluginRuntime } from "../src/plugin-runtime.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const descriptor = { schemaVersion: 1, baseUrl: "http://127.0.0.1:1", token: "fixture", pid: 1, startedAt: "2026-10-01T00:00:00Z", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64) };
const anchor = (graphId: string, id: string) => ({ object: { id, kind: "TASK" as const, title: id, lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "now", updatedAt: "now", closedAt: null }, anchor: { graphId, externalId: "same" } });

function fixture() {
  let graph = "A";
  let onGraph: (() => void) | null = null;
  let observed = 0, graphSubscriptions = 0, released = 0, polls = 0, writes = 0;
  let failObserver = false;
  const originalFetch = globalThis.fetch;
  const originalSdk = globalThis.logseq;
  const originals = [KernelClient.prototype.listObjectAnchorIndex, KernelClient.prototype.listProjectionObligations, KernelClient.prototype.listRecovery] as const;
  KernelClient.prototype.listObjectAnchorIndex = async () => ({ objects: [] });
  KernelClient.prototype.listProjectionObligations = async () => ({ obligations: [] });
  KernelClient.prototype.listRecovery = async () => ({ recovery: [] });
  globalThis.fetch = async () => { polls++; return new Response(JSON.stringify({ request: null })); };
  globalThis.logseq = {
    settings: { kernelDescriptorJson: JSON.stringify(descriptor) },
    FileStorage: { getItem: async () => null, setItem: async () => undefined },
    App: { getCurrentGraph: async () => ({ name: graph, url: "/" + graph }), onCurrentGraphChanged: (fn: () => void) => { graphSubscriptions++; onGraph = fn; return () => { onGraph = null; released++; }; } },
    DB: { onChanged: () => { if (failObserver) throw Error("fixture subscription failure"); observed++; return () => { released++; }; } },
    Editor: { updateBlock: async () => { writes++; } },
  } as unknown as typeof logseq;
  const state = new GraphIdentityState(), runtime = new PluginRuntime(state);
  return {
    state, runtime,
    switchGraph(name: string) { graph = name; onGraph?.(); },
    failObserver() { failObserver = true; },
    counts: () => ({ observed, graphSubscriptions, released, polls, writes }),
    dispose() {
      runtime.stop(); globalThis.fetch = originalFetch; globalThis.logseq = originalSdk;
      [KernelClient.prototype.listObjectAnchorIndex, KernelClient.prototype.listProjectionObligations, KernelClient.prototype.listRecovery] = originals;
    },
  };
}

test("runtime owns one worker and observer, repeated starts and stops are safe", async () => {
  const f = fixture();
  try {
    await Promise.all([f.runtime.start(), f.runtime.start()]);
    await f.runtime.start(); await delay(10);
    assert.equal(f.counts().observed, 1); assert.equal(f.counts().graphSubscriptions, 1);
    assert.equal(f.counts().polls, 1);
    f.runtime.stop(); f.runtime.stop();
    const polls = f.counts().polls;
    await delay(280);
    assert.equal(f.counts().polls, polls); assert.equal(f.counts().released, 2);
    assert.equal(f.state.scope().graphId, "");
  } finally { f.dispose(); }
});

test("partial runtime startup failure cleans subscriptions and worker", async () => {
  const f = fixture();
  try {
    f.failObserver(); await assert.rejects(f.runtime.start(), /fixture subscription failure/u);
    await delay(280);
    assert.equal(f.counts().released, 1); assert.equal(f.counts().polls, 0);
    f.runtime.stop();
  } finally { f.dispose(); }
});

test("Graph A delayed refresh cannot replace B; same UUID and anomalous index are Graph scoped", async () => {
  const f = fixture();
  try {
    await f.runtime.start(); await delay(10);
    const slow = deferred<Awaited<ReturnType<KernelClient["listObjectAnchorIndex"]>>>();
    const a = { listObjectAnchorIndex: () => slow.promise, listProjectionObligations: async () => ({ obligations: [] }), listRecovery: async () => ({ recovery: [] }) } as unknown as KernelClient;
    const old = f.runtime.refreshIdentities(a);
    f.switchGraph("B"); await delay(10);
    const b = { listObjectAnchorIndex: async () => ({ objects: [anchor("A:/A", "A-object"), anchor("B:/B", "B-object")] }), listProjectionObligations: async () => ({ obligations: [] }), listRecovery: async () => ({ recovery: [] }) } as unknown as KernelClient;
    await f.runtime.refreshIdentities(b);
    assert.equal(f.state.lookupFormal("same")?.workObjectId, "B-object");
    slow.resolve({ objects: [anchor("A:/A", "A-object")] }); await old;
    assert.equal(f.state.lookupFormal("same")?.workObjectId, "B-object");
    assert.deepEqual(f.state.lookup("same", "A:/A"), { kind: "ORDINARY" });
    const returned = f.state.lookupFormal("same")!; returned.workObjectId = "injected";
    assert.equal(f.state.lookupFormal("same")?.workObjectId, "B-object");
    const pending = deferred<Awaited<ReturnType<KernelClient["listObjectAnchorIndex"]>>>();
    const revalidate = f.runtime.revalidateIdentity({ listObjectAnchorIndex: () => pending.promise } as unknown as KernelClient, "same");
    f.runtime.stop(); pending.resolve({ objects: [anchor("B:/B", "late")] });
    await assert.rejects(revalidate, /GRAPH_SCOPE_CHANGED/u);
    assert.deepEqual(f.state.lookup("same"), { kind: "ORDINARY" });
  } finally { f.dispose(); }
});

test("a bound adapter cannot write after Graph switch or unload", async () => {
  const f = fixture();
  try {
    await f.runtime.start();
    const { adapter } = await f.runtime.adapterForCurrentGraph();
    f.switchGraph("B"); await delay(1);
    await assert.rejects(adapter.readGraphSnapshot({ graphId: "A:/A", sourceBlockUuid: "same" }), /GRAPH_SCOPE_CHANGED/u);
    await assert.rejects(f.runtime.updateSource("A:/A", "same", "wrong graph"), /GRAPH_SCOPE_CHANGED/u);
    f.runtime.stop();
    await assert.rejects(f.runtime.updateSource("B:/B", "same", "unloaded"), /GRAPH_SCOPE_CHANGED/u);
    assert.equal(f.counts().writes, 0);
  } finally { f.dispose(); }
});

test("overlapping self writes retain suppression until the last write settles and expires", async () => {
  const f = fixture();
  try {
    await f.runtime.start();
    const slow = deferred<void>();
    const running = f.runtime.withSelfWrite("same", () => slow.promise, true);
    await f.runtime.withSelfWrite("same", async () => undefined, true);
    await delay(1_050);
    assert.equal(f.runtime.isSelfWritten("same"), true);
    assert.equal(f.runtime.isSelfWritten("same", true), true);
    slow.resolve(); await running; await delay(1_050);
    assert.equal(f.runtime.isSelfWritten("same"), false);
    f.runtime.stop();
  } finally { f.dispose(); }
});

test("descriptor parsing refreshes on private storage change and explicit reconnect", async () => {
  const f = fixture();
  let raw = JSON.stringify(descriptor);
  try {
    globalThis.logseq.FileStorage.getItem = async () => raw;
    globalThis.logseq.FileStorage.setItem = async (_key, value) => { raw = String(value); };
    assert.equal((await f.runtime.descriptor()).baseUrl, descriptor.baseUrl);
    raw = JSON.stringify({ ...descriptor, baseUrl: "http://127.0.0.1:2" });
    assert.equal((await f.runtime.descriptor()).baseUrl, "http://127.0.0.1:2");
    await f.runtime.connect(JSON.stringify({ ...descriptor, baseUrl: "http://127.0.0.1:3" }));
    assert.equal((await f.runtime.descriptor()).baseUrl, "http://127.0.0.1:3");
  } finally { f.dispose(); }
});
