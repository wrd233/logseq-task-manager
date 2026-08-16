import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-15T00:00:00.000Z";

async function start(directory: string, graph: FakeGraphAdapter, options: { projectionMaxAttempts?: number; projectionBackoffBaseMs?: number; now?: () => string } = {}) {
  const service = await startKernelServer({ requireTrustedUserChannel: false,  databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", now: options.now ?? (() => at), ...(options.projectionMaxAttempts ? { projectionMaxAttempts: options.projectionMaxAttempts } : {}), ...(options.projectionBackoffBaseMs ? { projectionBackoffBaseMs: options.projectionBackoffBaseMs } : {}) });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  return { service, client, graph };
}

async function setup(label: string, options: { projectionMaxAttempts?: number; projectionBackoffBaseMs?: number; now?: () => string } = {}) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase8-${label}-`));
  const graph = new FakeGraphAdapter(() => at);
  const { service, client } = await start(directory, graph, options);
  const source = graph.seedNaturalRecord("graph-phase8", `source-${label}`, "下一步：验证离线提交后投影收敛");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "投影义务验证", anchor: { graphId: source.graphId, blockUuid: source.sourceBlockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const created = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, created, await graph.readGraphSnapshot({ graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid }));
  const evidenceId = `evidence-${label}`;
  const frozen = await client.freezeEvidence({ evidenceId, workObjectId: prepared.commit.targetId!, snapshot: await graph.readEvidenceMaterial({ graphId: source.graphId, blockUuid: source.sourceBlockUuid }, service.graphSnapshotKey) });
  return { directory, service, client, graph, source, workObjectId: prepared.commit.targetId!, createProjectionHash: created.projectionHash!, evidenceDependency: { evidenceId, contentHash: frozen.evidence.contentHash } };
}

function waitingOperation(workObjectId: string, expectedVersion: number, expectedProjectionHash: string, evidenceDependency: { evidenceId: string; contentHash: string }, suffix: string) {
  return parseSemanticOperation({ operationId: `waiting-${suffix}`, type: "CHANGE_ENGAGEMENT", actor: { type: "USER", id: "local-user" }, target: { workObjectId, expectedVersion, expectedProjectionHash }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: `等待外部条件-${suffix}`, reviewAt: null, evidenceIds: [evidenceDependency.evidenceId] } }, evidenceDependencies: [evidenceDependency] });
}

async function postBridge(baseUrl: string, token: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-task-copilot-graph-bridge": token }, body: JSON.stringify(body) });
}

function startBridge(input: { baseUrl: string; bridgeToken: string; snapshotKey: string; graphId: string; graph: FakeGraphAdapter }) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const handle = async (envelope: GraphGatewayRequestEnvelope): Promise<GraphGatewayResponse> => {
    const request = envelope.request;
    if (request.kind === "APPLY_EFFECT") { const result = await input.graph.applyGraphEffect(request.effect); return { kind: request.kind, result, snapshot: await input.graph.readGraphSnapshot({ graphId: request.effect.graphId, sourceBlockUuid: request.effect.sourceBlockUuid }) }; }
    throw new Error("GRAPH_GATEWAY_UNSUPPORTED_REQUEST");
  };
  const tick = async () => {
    try {
      const polled = await postBridge(input.baseUrl, input.bridgeToken, "/v1/graph-adapter/poll", { graphId: input.graphId });
      const envelope = (await polled.json() as { request: GraphGatewayRequestEnvelope | null }).request;
      if (envelope) {
        try { await postBridge(input.baseUrl, input.bridgeToken, `/v1/graph-adapter/requests/${envelope.id}/complete`, { graphId: input.graphId, response: await handle(envelope) }); }
        catch (error) { if (!stopped) await postBridge(input.baseUrl, input.bridgeToken, `/v1/graph-adapter/requests/${envelope.id}/fail`, { graphId: input.graphId, error: { code: error instanceof Error ? error.message.split(":")[0]! : "GRAPH_FAILED", message: error instanceof Error ? error.message.slice(0, 300) : "failed" } }); }
      }
    } catch { /* teardown or transient */ }
    if (!stopped) timer = setTimeout(() => void tick(), 2);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

test("A1+A2: formal commit succeeds without Graph, creates durable projection obligation, then converges", async () => {
  const value = await setup("online-offline");
  try {
    const committed = await value.client.commitFormal(waitingOperation(value.workObjectId, 1, value.createProjectionHash, value.evidenceDependency, "first"), null);
    assert.equal(committed.commit.status, "COMMITTED");
    assert.equal(committed.projectionObligation.status, "PENDING");
    assert.equal((await value.client.showObject(value.workObjectId)).object.version, 2);
    assert.equal((await value.client.showObject(value.workObjectId)).object.engagement, "WAITING");
    // Graph has not been touched yet.
    assert.equal((await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid })).projection?.currentFocus, null);
    // A4: the durable obligation is not mixed into the old commit-stage recovery surface.
    assert.equal((await value.client.listRecovery()).recovery.length, 0);
    assert.equal((await value.client.listProjectionObligations("PENDING")).obligations.length, 1);
    const result = await value.graph.applyGraphEffect(committed.graphEffect);
    const verified = await value.client.verifyFormalProjection(committed.commit.id, result, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
    assert.equal(verified.obligation.status, "VERIFIED");
    assert.equal((await value.client.listProjectionObligations("PENDING")).obligations.length, 0);
    assert.equal((await value.client.showCommit(committed.commit.id)).commit.status, "COMMITTED");
  } finally { await value.service.close(); }
});

test("A2: projection worker drains a durable obligation automatically once the Graph Adapter returns", async () => {
  const value = await setup("auto-drain");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.source.graphId, graph: value.graph });
  try {
    for (let attempt = 0; attempt < 20 && !(await value.client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    const committed = await value.client.commitFormal(waitingOperation(value.workObjectId, 1, value.createProjectionHash, value.evidenceDependency, "auto"), null);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const obligations = (await value.client.listProjectionObligations()).obligations;
      if (obligations.find((item) => item.commitId === committed.commit.id)?.status === "VERIFIED") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("projection obligation did not auto-converge");
  } finally { stop(); await value.service.close(); }
});

test("projection retry is bounded and degrades instead of hot-looping on a persistent Graph failure", async () => {
  const value = await setup("bounded-retry", { projectionMaxAttempts: 2, projectionBackoffBaseMs: 5, now: () => new Date().toISOString() });
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.source.graphId, graph: value.graph });
  try {
    for (let attempt = 0; attempt < 20 && !(await value.client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    const committed = await value.client.commitFormal(waitingOperation(value.workObjectId, 1, value.createProjectionHash, value.evidenceDependency, "bounded"), null);
    value.graph.editManagedProjection(value.source.graphId, value.source.sourceBlockUuid, "用户已改");
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const obligation = (await value.client.listProjectionObligations()).obligations.find((item) => item.commitId === committed.commit.id);
      if (obligation?.retryExhausted) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const obligation = (await value.client.listProjectionObligations()).obligations.find((item) => item.commitId === committed.commit.id)!;
    assert.equal(obligation.retryExhausted, true);
    assert.ok(obligation.attempt <= 2);
    assert.ok(obligation.lastError);
    const health = await value.client.projectionHealth();
    assert.equal(health.degraded, 1);
    assert.equal(health.backlog, 0);
  } finally { stop(); await value.service.close(); }
});

test("A3: user-edited projection is never silently overwritten while an obligation is pending", async () => {
  const value = await setup("user-edit");
  try {
    const committed = await value.client.commitFormal(waitingOperation(value.workObjectId, 1, value.createProjectionHash, value.evidenceDependency, "first"), null);
    value.graph.editManagedProjection(value.source.graphId, value.source.sourceBlockUuid, "用户改过的标题");
    await assert.rejects(value.graph.applyGraphEffect(committed.graphEffect), /GRAPH_ENGAGEMENT_PRECONDITION_FAILED/u);
    const failed = await value.client.graphProjectionFailed(committed.commit.id, "GRAPH_ENGAGEMENT_PRECONDITION_FAILED");
    assert.equal(failed.obligation.status, "FAILED");
    assert.equal(failed.obligation.attempt, 1);
    assert.equal((await value.client.showObject(value.workObjectId)).object.engagement, "WAITING");
    assert.equal((await value.client.listProjectionObligations("PENDING")).obligations.length, 0);
  } finally { await value.service.close(); }
});

test("A5: pending/failed projection obligations survive Kernel restart and can converge afterwards", async () => {
  const value = await setup("restart");
  const pending = await value.client.commitFormal(waitingOperation(value.workObjectId, 1, value.createProjectionHash, value.evidenceDependency, "first"), null);
  await value.service.close();
  const restarted = await start(value.directory, value.graph);
  try {
    assert.equal((await restarted.client.listProjectionObligations("PENDING")).obligations.length, 1);
    const result = await value.graph.applyGraphEffect(pending.graphEffect);
    const verified = await restarted.client.verifyFormalProjection(pending.commit.id, result, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
    assert.equal(verified.obligation.status, "VERIFIED");
  } finally { await restarted.service.close(); }
});

test("formal commit with a supplied stale snapshot fails closed before any formal write", async () => {
  const value = await setup("stale-snapshot");
  try {
    await assert.rejects(value.client.commitFormal(waitingOperation(value.workObjectId, 1, value.createProjectionHash, value.evidenceDependency, "first"), value.source), /STALE_GRAPH_SNAPSHOT/u);
    assert.equal((await value.client.showObject(value.workObjectId)).object.version, 1);
  } finally { await value.service.close(); }
});
