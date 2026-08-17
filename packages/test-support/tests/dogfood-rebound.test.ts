import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-18T10:00:00.000Z";

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
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-rebound-${label}-`));
  const databasePath = join(directory, "kernel.sqlite"); const descriptorPath = join(directory, "kernel.json");
  const service = await startKernelServer({ requireTrustedUserChannel: false, databasePath, descriptorPath, token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), now: () => at, graphRequestTimeoutMs: 500 });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at); const graphId = `graph-rebound-${label}`;
  const source = graph.seedNaturalRecord(graphId, "source", "TODO 后台维护起点");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "后台维护起点", anchor: { graphId, blockUuid: "source", sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: "source" }));
  const stop = startBridge({ baseUrl: service.baseUrl, bridgeToken: service.graphBridgeToken, snapshotKey: service.graphSnapshotKey, graphId, graph });
  for (let attempt = 0; attempt < 20 && !(await client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return { directory, service, client, graph, graphId, workObjectId: prepared.commit.targetId!, stop };
}

async function observe(value: Awaited<ReturnType<typeof setup>>, blockUuid: string, content: string) {
  value.graph.editNaturalContent(value.graphId, blockUuid, content);
  const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: blockUuid });
  return value.client.recordSourceChange({ workObjectId: value.workObjectId, graphId: value.graphId, sourceBlockUuid: blockUuid, sourceContentHash: snapshot.sourceContentHash, sourceMarker: snapshot.sourceMarker, observedAt: at });
}

async function waitForEngagement(client: KernelClient, workObjectId: string, expected: string | null, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const object = (await client.showObject(workObjectId)).object;
    if (object.engagement === expected) return object;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`engagement did not become ${expected}: ${JSON.stringify(await client.showObject(workObjectId))}`);
}

test("correction is not immediately overridden by a replay of the same old context", async () => {
  const value = await setup("rebound");
  try {
    // 1. Old context drives ACTIONABLE -> WAITING through automatic maintenance.
    const oldText = "本地验证已全部完成。唯一剩余动作必须等待厂商补丁";
    await observe(value, "source", oldText);
    await waitForEngagement(value.client, value.workObjectId, "WAITING");

    // 2. User correction says there is still a real internal path.
    value.graph.seedNaturalRecord(value.graphId, "correction-block", "不是，我还可以继续本地测试");
    const material = await value.graph.readEvidenceMaterial({ graphId: value.graphId, blockUuid: "correction-block" }, value.service.graphSnapshotKey);
    const frozen = await value.client.freezeEvidence({ evidenceId: "correction-evidence", workObjectId: value.workObjectId, snapshot: material });
    const corrected = await value.client.applyUserRealityCorrection({ workObjectId: value.workObjectId, utterance: "不是，我还可以继续本地测试", evidenceId: frozen.evidence.id, evidenceContentHash: frozen.evidence.contentHash });
    assert.equal(corrected.commit.actor.type, "USER");
    await waitForEngagement(value.client, value.workObjectId, "ACTIONABLE");

    // 3. Replay a semantically identical old context through the normal maintenance path.
    const replayText = "本地验证已全部完成\n唯一剩余动作必须等待厂商补丁（重放）";
    await observe(value, "source", replayText);
    // Give maintenance enough time to converge; then assert it did not blindly flip back.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const after = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(after.engagement, "ACTIONABLE");
  } finally {
    value.stop();
    await value.service.close();
  }
});
