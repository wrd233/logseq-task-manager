import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Kernel } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { parseSemanticOperation, stableHash, type CognitionExecutor, type GraphGatewayResponse } from "@task-copilot/contracts";
import { GraphRequestBroker } from "../src/graph-broker.ts";
import { ProjectionDelivery } from "../src/projection-delivery.ts";
import { MaintenanceCoordinator, FAKE_COGNITION_PROFILE } from "../src/maintenance-coordinator.ts";
import { DiscoveryCoordinator } from "../src/discovery-coordinator.ts";
import { startKernelServer } from "../src/server.ts";

const at = "2026-10-02T00:00:00.000Z";
function fixture() {
  const store = new SqliteStore(":memory:"), kernel = new Kernel(store, { now: () => at, projectionMaxAttempts: 2 });
  const source = { graphId: "graph", sourceBlockUuid: "source", sourceContentHash: stableHash("natural"), projection: null };
  const created = kernel.commitFormal(parseSemanticOperation({ operationId: "create", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "test", anchor: { graphId: "graph", blockUuid: "source", sourceContentHash: source.sourceContentHash } } }), source);
  if (created.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw Error("fixture");
  const effect = created.graphEffect;
  const result = { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: "graph", sourceBlockUuid: "source", projectionHash: effect.projection.projectionHash, appliedAt: at };
  return { store, kernel, source, created, effect, result, snapshot: { ...source, projection: effect.projection }, id: created.commit.targetId! };
}

test("one Broker delivery with invalid readback spends one attempt; a delayed failure cannot downgrade VERIFIED", async () => {
  const f = fixture(), broker = new GraphRequestBroker(); broker.heartbeat("graph");
  const delivery = new ProjectionDelivery(f.store, f.kernel, broker, () => at);
  try {
    const first = delivery.drain(), request = broker.poll("graph")!;
    broker.complete("graph", request.id, { kind: "APPLY_EFFECT", result: f.result, snapshot: { ...f.snapshot, projection: null } });
    await first;
    assert.equal(f.store.getProjectionObligationForCommit(f.created.commit.id)?.attempt, 1);
    assert.equal(f.store.getProjectionObligationForCommit(f.created.commit.id)?.retryExhausted, false);
    // Schedule a real second request, then a success is accepted before its failure arrives.
    const later = new ProjectionDelivery(f.store, f.kernel, broker, () => "2026-10-02T00:01:00.000Z").drain();
    const lateRequest = broker.poll("graph")!;
    const verified = f.kernel.verifyFormalProjection(f.created.commit.id, f.result, f.snapshot);
    broker.fail("graph", lateRequest.id, "GRAPH_RESULT_MISMATCH", "delayed failure"); await later;
    assert.deepEqual(f.store.getProjectionObligationForCommit(f.created.commit.id), verified);
    assert.deepEqual(f.kernel.verifyFormalProjection(f.created.commit.id, f.result, f.snapshot), verified);
  } finally { broker.close(); f.store.close(); }
});

function readBroker(f: ReturnType<typeof fixture>): GraphRequestBroker {
  const broker = new GraphRequestBroker(); broker.heartbeat("graph");
  broker.request = async (request): Promise<GraphGatewayResponse> => {
    if (request.kind === "READ_TARGET_SNAPSHOT") return { kind: request.kind, snapshot: f.snapshot };
    if (request.kind === "READ_BLOCK") return { kind: request.kind, block: { graphId: "graph", blockUuid: request.blockUuid, pageName: null, content: "natural", contentHash: stableHash("natural") } };
    throw Error("unexpected request");
  };
  return broker;
}

test("first manual NO_CHANGE records actual observation without a source-change event", async () => {
  const f = fixture(), broker = readBroker(f);
  const cognition: CognitionExecutor = { id: "fixture", judge: async () => ({ kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "stable" }) };
  const maintenance = new MaintenanceCoordinator(f.kernel, f.store, broker, { delivery: { drain: async () => 0 }, now: () => at }, cognition, FAKE_COGNITION_PROFILE);
  try {
    const queued = maintenance.manualReconcile(f.id);
    assert.equal(f.store.getSourceCoverage(f.id), null);
    const done = await maintenance.tick(), coverage = f.store.getSourceCoverage(f.id)!;
    assert.equal(done?.status, "DONE"); assert.equal(done?.lastOutcome, "NO_CHANGE");
    assert.notEqual(coverage.lastObservedSourceSnapshotId, queued.sourceSnapshotId);
    assert.equal(coverage.lastReconciledSourceSnapshotId, coverage.lastObservedSourceSnapshotId); assert.equal(coverage.formalVersionAtLastReconcile, 1); assert.equal(coverage.hasUncoveredChanges, false);
    maintenance.manualReconcile(f.id); assert.equal((await maintenance.tick())?.status, "DONE");
  } finally { maintenance.stop(); broker.close(); f.store.close(); }
});

test("a newer source observation during cognition remains uncovered and supersedes the old job", async () => {
  const f = fixture(), broker = readBroker(f);
  let resolve!: () => void, started!: () => void;
  const start = new Promise<void>(r => { started = r; }), wait = new Promise<void>(r => { resolve = r; });
  const cognition: CognitionExecutor = { id: "fixture", judge: async () => { started(); await wait; return { kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "old" }; } };
  const maintenance = new MaintenanceCoordinator(f.kernel, f.store, broker, { delivery: { drain: async () => 0 }, now: () => at }, cognition, FAKE_COGNITION_PROFILE);
  try {
    maintenance.manualReconcile(f.id); const running = maintenance.tick(); await start;
    const fresh = maintenance.recordSourceChange({ workObjectId: f.id, graphId: "graph", sourceBlockUuid: "source", sourceContentHash: stableHash("new"), observedAt: at });
    resolve(); assert.equal((await running)?.status, "STALE");
    assert.equal(f.store.getSourceCoverage(f.id)?.lastObservedSourceSnapshotId, fresh.coverage.lastObservedSourceSnapshotId); assert.equal(f.store.getSourceCoverage(f.id)?.hasUncoveredChanges, true);
  } finally { resolve(); maintenance.stop(); broker.close(); f.store.close(); }
});

test("Discovery skips ACTIVE associations by graph and block and does not call cognition", async () => {
  const f = fixture(), broker = readBroker(f); let calls = 0;
  const maintenance = new MaintenanceCoordinator(f.kernel, f.store, broker, { delivery: { drain: async () => 0 } }, { id: "fixture", judge: async () => ({ kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "stable" }) }, FAKE_COGNITION_PROFILE);
  const discovery = new DiscoveryCoordinator(f.kernel, f.store, broker, maintenance, { id: "fixture", judge: async ({ contextPack }) => { calls++; return [{ kind: "NO_CANDIDATE", sourceHandles: contextPack.map(x => x.handle), reason: "ONE_OFF", rationaleSummary: "natural" }]; } }, { ...FAKE_COGNITION_PROFILE, allowedDataScope: ["discovery_today"] }, { now: () => at });
  try {
    const association = f.kernel.context.associateContext({ workObjectId: f.id, sourceRef: { graphId: "graph", blockUuid: "source" }, sourceVersionHash: "old", origin: "USER_EXPLICIT" });
    const scope = { kind: "EXPLICIT_SOURCE_SET", sources: [{ graphId: "graph", blockUuid: "source" }] } as const;
    assert.equal((await discovery.runDiscovery(scope)).selectedCount, 0); assert.equal(calls, 0);
    f.kernel.context.invalidateContextAssociation(association.id);
    // An invalidated association itself no longer filters; unchanged prior source
    // outcomes may still do so under the existing content-change policy.
    broker.request = async request => { if (request.kind !== "READ_BLOCK") throw Error("fixture"); return { kind: "READ_BLOCK", block: { graphId: "graph", blockUuid: "source", pageName: null, content: "new natural", contentHash: stableHash("new natural") } }; };
    assert.equal((await discovery.runDiscovery(scope)).selectedCount, 1); assert.equal(calls, 1);
  } finally { maintenance.stop(); broker.close(); f.store.close(); }
});

test("startup failures release owned resources immediately; contenders and repeated close preserve other owners", async () => {
  const dir = await mkdtemp(join(tmpdir(), "round04-start-")), databasePath = join(dir, "kernel.sqlite"), descriptorPath = join(dir, "kernel.json");
  const options = { databasePath, descriptorPath };
  const listener = createServer();
  try {
    await assert.rejects(startKernelServer({ ...options, workspaceRoot: join(dir, "missing") }), /ENOENT/u);
    await writeFile(join(dir, "bad-config.json"), "{");
    await assert.rejects(startKernelServer({ ...options, dogfoodConfigPath: join(dir, "bad-config.json") }), /JSON/u);
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const address = listener.address(); assert.ok(address && typeof address !== "string");
    await assert.rejects(startKernelServer({ ...options, port: address.port }), /EADDRINUSE/u);
    const service = await startKernelServer(options);
    await assert.rejects(startKernelServer({ ...options, descriptorPath: join(dir, "contender.json") }), /KERNEL_INSTANCE_ALREADY_RUNNING/u);
    assert.equal((await fetch(`${service.baseUrl}/v1/status`, { headers: { authorization: `Bearer ${service.token}` } })).status, 200);
    const replacement = { token: service.token, instanceId: "another-owner" };
    await writeFile(descriptorPath, JSON.stringify(replacement));
    await Promise.all([service.close(), service.close()]);
    assert.deepEqual(JSON.parse(await readFile(descriptorPath, "utf8")), replacement);
    const retry = await startKernelServer(options); await retry.close();
  } finally { await new Promise<void>(resolve => listener.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
