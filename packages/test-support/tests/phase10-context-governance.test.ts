import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-15T12:00:00.000Z";

async function postBridge(baseUrl: string, token: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-task-copilot-graph-bridge": token }, body: JSON.stringify(body) });
}

function startBridge(input: { baseUrl: string; bridgeToken: string; snapshotKey: string; graphId: string; graph: FakeGraphAdapter }) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const handle = async (envelope: GraphGatewayRequestEnvelope): Promise<GraphGatewayResponse> => {
    const request = envelope.request;
    if (request.kind === "READ_TARGET_SNAPSHOT") return { kind: request.kind, snapshot: await input.graph.readGraphSnapshot(request.input) };
    if (request.kind === "READ_EVIDENCE") return { kind: request.kind, material: await input.graph.readEvidenceMaterial({ graphId: request.graphId, blockUuid: request.blockUuid }, input.snapshotKey) };
    if (request.kind === "READ_BLOCK") return { kind: request.kind, block: { graphId: request.graphId, blockUuid: request.blockUuid, pageName: null, content: input.graph.naturalContent(request.graphId, request.blockUuid), contentHash: stableHash(input.graph.naturalContent(request.graphId, request.blockUuid)) } };
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
    } catch { /* teardown */ }
    if (!stopped) timer = setTimeout(() => void tick(), 2);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase10-${label}-`));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), now: () => at, graphRequestTimeoutMs: 500 });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at); const graphId = `graph-phase10-${label}`;
  const source = graph.seedNaturalRecord(graphId, "source", "TODO Phase10 目标对象");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "Phase10 目标对象", anchor: { graphId, blockUuid: "source", sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: "source" }));
  return { directory, service, client, graph, graphId, workObjectId: prepared.commit.targetId!, source };
}

function sourceRef(graphId: string, blockUuid: string) { return { graphId, blockUuid }; }

test("context associations are durable, dedupe, support correction memory, and never write Graph", async () => {
  const value = await setup("context");
  try {
    value.graph.seedNaturalRecord(value.graphId, "journal-a", "历史背景材料");
    value.graph.seedNaturalRecord(value.graphId, "journal-b", "参考材料");
    const first = await value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, "journal-a"), sourceVersionHash: stableHash("历史背景材料"), origin: "AGENT_INFERRED" });
    const duplicate = await value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, "journal-a"), sourceVersionHash: stableHash("历史背景材料"), origin: "AGENT_INFERRED" });
    assert.equal(duplicate.association.id, first.association.id);
    assert.equal(value.graph.naturalContent(value.graphId, "journal-a"), "历史背景材料");
    assert.equal((await value.client.listContextAssociations(value.workObjectId)).associations.length, 1);

    await value.client.recordAssociationCorrection({ sourceRef: sourceRef(value.graphId, "journal-b"), scopeSnapshot: stableHash(["journal-b", value.workObjectId]), rejectedWorkObjectId: value.workObjectId, affirmedWorkObjectId: null, userDecisionRef: "decision-user-says-other-project" });
    await assert.rejects(value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, "journal-b"), sourceVersionHash: stableHash("参考材料"), origin: "AGENT_INFERRED" }), /ASSOCIATION_CORRECTION_BLOCKS/u);
    assert.equal(value.graph.naturalContent(value.graphId, "journal-b"), "参考材料");
  } finally { await value.service.close(); }
});

test("governance issues dedupe per dimension/snapshot and retain resolved history", async () => {
  const value = await setup("issues");
  try {
    const draft = { workObjectId: value.workObjectId, dimension: "engagement", type: "CONFLICT" as const, summary: "互相矛盾的方向", evidenceIds: [], sourceSnapshotId: "snap-1", formalVersion: 1 };
    const first = await value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, "source"), sourceVersionHash: value.source.sourceContentHash, origin: "SYSTEM_STRUCTURAL" });
    assert.equal(first.association.status, "ACTIVE");
    await value.client.resolveGovernanceIssue((await value.client.upsertGovernanceIssue(draft)).issue.id);
    const second = await value.client.upsertGovernanceIssue({ ...draft, sourceSnapshotId: "snap-2" });
    assert.equal(second.issue.status, "OPEN");
    await value.client.supersedeGovernanceIssue(second.issue.id);
    assert.equal((await value.client.listGovernanceIssues(value.workObjectId, "OPEN")).issues.length, 0);
    assert.equal((await value.client.listGovernanceIssues(value.workObjectId)).issues.length, 2);
  } finally { await value.service.close(); }
});

test("reconcile conflict: coverage clears, one evidence is frozen, and a dimension issue persists", async () => {
  const value = await setup("conflict");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    for (let attempt = 0; attempt < 20 && !(await value.client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    value.graph.seedNaturalRecord(value.graphId, "context-a", "A: 等厂商回复，没有其他可做");
    value.graph.seedNaturalRecord(value.graphId, "context-b", "B: 当前还可以继续本地兼容性测试");
    value.graph.seedNaturalRecord(value.graphId, "context-c", "无关参考");
    for (const uuid of ["context-a", "context-b", "context-c"]) {
      await value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, uuid), sourceVersionHash: stableHash(value.graph.naturalContent(value.graphId, uuid)), origin: "AGENT_INFERRED" });
    }
    const source = value.graph.seedNaturalRecord(value.graphId, "conflict-source", "等厂商回复，没有其他可做；但是当前还可以继续本地兼容性测试");
    const observed = await value.client.recordSourceChange({ workObjectId: value.workObjectId, graphId: value.graphId, sourceBlockUuid: "conflict-source", sourceContentHash: source.sourceContentHash, sourceMarker: null, observedAt: at });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const job = (await value.client.maintenanceStatus()).jobs.find((item) => item.id === observed.job.id);
      if (job?.status === "DONE") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const job = (await value.client.maintenanceStatus()).jobs.find((item) => item.id === observed.job.id)!;
    assert.equal(job.lastOutcome, "CONFLICT");
    const issues = (await value.client.listGovernanceIssues(value.workObjectId, "OPEN")).issues;
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.dimension, "engagement");
    assert.equal(issues[0]?.type, "CONFLICT");
    assert.equal(issues[0]?.evidenceIds.length, 1);
    const evidence = (await value.client.listEvidence(value.workObjectId)).evidence;
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]?.externalId, "conflict-source");
    // user reality clarifies: resolve issue and prove it stays out of the OPEN surface.
    await value.client.resolveGovernanceIssue(issues[0]!.id);
    assert.equal((await value.client.listGovernanceIssues(value.workObjectId, "OPEN")).issues.length, 0);
  } finally { stop(); await value.service.close(); }
});
