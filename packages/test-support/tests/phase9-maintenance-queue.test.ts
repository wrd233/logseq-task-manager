import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-15T10:00:00.000Z";

async function postBridge(baseUrl: string, token: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-task-copilot-graph-bridge": token }, body: JSON.stringify(body) });
}

function startBridge(input: { baseUrl: string; bridgeToken: string; snapshotKey: string; graphId: string; graph: FakeGraphAdapter }) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const handle = async (envelope: GraphGatewayRequestEnvelope): Promise<GraphGatewayResponse> => {
    const request = envelope.request;
    if (request.kind === "READ_TARGET_SNAPSHOT") return { kind: request.kind, snapshot: await input.graph.readGraphSnapshot(request.input) };
    if (request.kind === "READ_EVIDENCE") return { kind: request.kind, material: await input.graph.readEvidenceMaterial({ graphId: request.graphId, blockUuid: request.blockUuid }, input.snapshotKey) };
    if (request.kind === "READ_BLOCK") { const content = input.graph.naturalContent(request.graphId, request.blockUuid); return { kind: request.kind, block: { graphId: request.graphId, blockUuid: request.blockUuid, pageName: null, content, contentHash: stableHash(content) } }; }
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

async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase9-${label}-`));
  const databasePath = join(directory, "kernel.sqlite"); const descriptorPath = join(directory, "kernel.json");
  const service = await startKernelServer({ requireTrustedUserChannel: false,  databasePath, descriptorPath, token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), now: () => at, graphRequestTimeoutMs: 500 });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at); const graphId = `graph-phase9-${label}`;
  const source = graph.seedNaturalRecord(graphId, "source", "TODO 后台维护起点");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "后台维护起点", anchor: { graphId, blockUuid: "source", sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: "source" }));
  const stop = startBridge({ baseUrl: service.baseUrl, bridgeToken: service.graphBridgeToken, snapshotKey: service.graphSnapshotKey, graphId, graph });
  for (let attempt = 0; attempt < 20 && !(await client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return { directory, service, client, graph, graphId, workObjectId: prepared.commit.targetId!, stop, databasePath, descriptorPath };
}

async function observe(value: Awaited<ReturnType<typeof setup>>, content: string) {
  value.graph.editNaturalContent(value.graphId, "source", content);
  const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source" });
  return value.client.recordSourceChange({ workObjectId: value.workObjectId, graphId: value.graphId, sourceBlockUuid: "source", sourceContentHash: snapshot.sourceContentHash, sourceMarker: snapshot.sourceMarker, observedAt: at });
}

async function waitForFocus(client: KernelClient, workObjectId: string, expected: string) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if ((await client.showObject(workObjectId)).object.currentFocus === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`focus did not converge to ${expected}: ${JSON.stringify({ object: await client.showObject(workObjectId), maintenance: await client.maintenanceStatus() })}`);
}

async function waitForJob(client: KernelClient, jobId: string, outcome = "CONFIRMED_CHANGE") {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const jobs = (await client.maintenanceStatus()).jobs;
    if (jobs.some((job) => job.id === jobId && job.status === "DONE" && job.lastOutcome === outcome)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`job ${jobId} did not finish with ${outcome}`);
}

test("GP9-1/GP9-2: one source burst queues one persistent reconcile; built-in loop commits and clears coverage", async () => {
  const value = await setup("burst");
  try {
    const observed = await observe(value, "下一步：验证后台维护会自动更新当前推进");
    assert.equal(observed.job.status, "QUEUED");
    await waitForFocus(value.client, value.workObjectId, "验证后台维护会自动更新当前推进");
    await waitForJob(value.client, observed.job.id);
    assert.equal((await value.client.maintenanceStatus("QUEUED")).jobs.length, 0);
  } finally { value.stop(); await value.service.close(); }
});

test("GP9-3: paused maintenance records changes without running; explicit one-shot reconcile still works and pause remains", async () => {
  const value = await setup("pause");
  try {
    await value.client.setMaintenancePause("global", true);
    await observe(value, "下一步：暂停期间的第一次推进");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal((await value.client.showObject(value.workObjectId)).object.currentFocus, null);
    assert.equal((await value.client.maintenanceStatus("QUEUED")).jobs.length, 1);
    const manual = await value.client.reconcileMaintenance(value.workObjectId, "INTERACTIVE");
    assert.equal(manual.job.priorityClass, "INTERACTIVE");
    await waitForFocus(value.client, value.workObjectId, "暂停期间的第一次推进");
    assert.equal((await value.client.maintenanceStatus()).globalPaused, true);
    assert.equal((await value.client.showObject(value.workObjectId)).object.version, 2);
    await value.client.setMaintenancePause("global", false);
  } finally { value.stop(); await value.service.close(); }
});

test("GP9-4: stale active job is superseded by the latest source snapshot instead of old-result-wins", async () => {
  const value = await setup("stale");
  try {
    await value.client.setMaintenancePause("global", true);
    const first = await observe(value, "下一步：第一个方向");
    await new Promise((resolve) => setTimeout(resolve, 120));
    const second = await observe(value, "下一步：第二个方向");
    assert.notEqual(second.job.id, first.job.id);
    assert.equal((await value.client.maintenanceStatus("STALE")).jobs.length >= 1, true);
    await value.client.setMaintenancePause("global", false);
    await waitForFocus(value.client, value.workObjectId, "第二个方向");
    assert.equal((await value.client.showObject(value.workObjectId)).object.currentFocus, "第二个方向");
  } finally { value.stop(); await value.service.close(); }
});

test("reconcile queue and coverage survive Kernel restart and continue from the persisted job", async () => {
  const value = await setup("restart");
  value.stop(); await value.service.close();
  const service = await startKernelServer({ requireTrustedUserChannel: false,  databasePath: value.databasePath, descriptorPath: value.descriptorPath, token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), now: () => at, graphRequestTimeoutMs: 500 });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const stop = startBridge({ baseUrl: service.baseUrl, bridgeToken: service.graphBridgeToken, snapshotKey: service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    for (let attempt = 0; attempt < 20 && !(await client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    value.graph.editNaturalContent(value.graphId, "source", "下一步：重启后继续第二个方向");
    const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source" });
    await client.recordSourceChange({ workObjectId: value.workObjectId, graphId: value.graphId, sourceBlockUuid: "source", sourceContentHash: snapshot.sourceContentHash, sourceMarker: snapshot.sourceMarker, observedAt: at });
    await waitForFocus(client, value.workObjectId, "重启后继续第二个方向");
  } finally { stop(); await service.close(); }
});
