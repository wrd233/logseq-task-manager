import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-15T13:00:00.000Z";
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
    if (request.kind === "READ_PAGE") { const blocks = input.graph.pageBlockUuids(request.graphId, request.pageName).map((blockUuid) => ({ graphId: request.graphId, blockUuid, pageName: request.pageName, content: input.graph.naturalContent(request.graphId, blockUuid), contentHash: stableHash(input.graph.naturalContent(request.graphId, blockUuid)) })); return { kind: request.kind, page: { graphId: request.graphId, pageName: request.pageName, blocks, truncated: false } }; }
    if (request.kind === "APPLY_EFFECT") { const result = await input.graph.applyGraphEffect(request.effect); return { kind: request.kind, result, snapshot: await input.graph.readGraphSnapshot({ graphId: request.effect.graphId, sourceBlockUuid: request.effect.sourceBlockUuid }) }; }
    throw new Error("GRAPH_GATEWAY_UNSUPPORTED_REQUEST");
  };
  const tick = async () => { try { const polled = await postBridge(input.baseUrl, input.bridgeToken, "/v1/graph-adapter/poll", { graphId: input.graphId }); const envelope = (await polled.json() as { request: GraphGatewayRequestEnvelope | null }).request; if (envelope) { try { await postBridge(input.baseUrl, input.bridgeToken, `/v1/graph-adapter/requests/${envelope.id}/complete`, { graphId: input.graphId, response: await handle(envelope) }); } catch (error) { if (!stopped) await postBridge(input.baseUrl, input.bridgeToken, `/v1/graph-adapter/requests/${envelope.id}/fail`, { graphId: input.graphId, error: { code: error instanceof Error ? error.message.split(":")[0]! : "GRAPH_FAILED", message: error instanceof Error ? error.message.slice(0, 300) : "failed" } }); } } } catch { /* teardown */ } if (!stopped) timer = setTimeout(() => void tick(), 2); };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase16a-${label}-`));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64), now: () => at, journalPageNames: (date) => [`journal-${date}`] });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at); const graphId = `graph-phase16a-${label}`;
  return { directory, service, client, graph, graphId };
}
async function waitForGraph(client: KernelClient) { for (let i = 0; i < 40; i += 1) { if ((await client.graphStatus()).available) return; await new Promise((r) => setTimeout(r, 5)); } throw new Error("GRAPH_OFFLINE"); }
async function formalizeDetailed(client: KernelClient, graph: FakeGraphAdapter, graphId: string, label: string, kind: "TASK" | "MINI_PROJECT" | "PROJECT", title: string, blockUuid: string) {
  const source = graph.seedNaturalRecord(graphId, blockUuid, `TODO ${title}`);
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title, anchor: { graphId, blockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: blockUuid }));
  return { workObjectId: prepared.commit.targetId!, projectionHash: result.projectionHash! };
}
async function formalize(client: KernelClient, graph: FakeGraphAdapter, graphId: string, label: string, kind: "TASK" | "MINI_PROJECT" | "PROJECT", title: string, blockUuid: string) {
  return (await formalizeDetailed(client, graph, graphId, label, kind, title, blockUuid)).workObjectId;
}

test("Now projection is selective, Confirmation is sparse, WorkMap and System derive from Kernel", async () => {
  const value = await setup("projections");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraph(value.client);
    const projectId = await formalize(value.client, value.graph, value.graphId, "project", "PROJECT", "海丝项目", "anchor-project");
    const miniId = await formalize(value.client, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理", "anchor-mini");
    await value.client.matureFormalizationCandidate;
    const pkg = (await value.client.createDecisionPackage({ id: "pkg-now", workObjectId: miniId, summary: "把采购规格书整理改为等待采购确认", rationale: "等待采购确认", candidates: [{ operationType: "CHANGE_ENGAGEMENT", parameters: { target: { workObjectId: miniId, expectedVersion: 1, expectedProjectionHash: "abcd1234" }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待采购确认", reviewAt: null } } } }] })).pkg;
    const now = await value.client.nowProjection();
    assert.ok(now.items.length >= 1 && now.items.length <= 4);
    assert.equal(now.items.some((item) => item.workObjectId === projectId), true);
    const confirmation = await value.client.confirmationProjection();
    assert.equal(confirmation.items.length, 1);
    assert.equal(confirmation.items[0]!.packageId, pkg.id);
    const map = await value.client.workMapProjection();
    assert.equal(map.total, 2);
    assert.equal(map.roots.some((root) => root.kind === "PROJECT"), true);
    const system = await value.client.systemProjection();
    assert.equal(system.status, "ok");
    assert.equal(system.graphAvailable, true);
  } finally { stop(); await value.service.close(); }
});

test("Object Context Pack gives bounded re-entry reality for an object", async () => {
  const value = await setup("object-context");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraph(value.client);
    const projectId = await formalize(value.client, value.graph, value.graphId, "project", "PROJECT", "海丝项目", "anchor-project");
    const miniId = await formalize(value.client, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理", "anchor-mini");
    await fetch(`${value.service.baseUrl}/v1/ownerships`, { method: "POST", headers: { authorization: `Bearer ${value.service.token}`, "content-type": "application/json" }, body: JSON.stringify({ childId: miniId, ownerId: projectId, actor: { type: "USER", id: "local-user" } }) });
    await value.client.associateContext({ workObjectId: miniId, sourceRef: { graphId: value.graphId, blockUuid: "context-block" }, sourceVersionHash: "hash", origin: "AGENT_INFERRED" });
    value.graph.seedNaturalRecord(value.graphId, "context-block", "采购规格书支持材料");
    const pack = (await value.client.objectContextPack(miniId)).pack;
    assert.equal(pack.title, "采购规格书整理");
    assert.equal(pack.kind, "MINI_PROJECT");
    assert.equal(pack.contextRefs.length, 1);
    assert.equal(pack.allowedAgentActions.includes("SET_CURRENT_FOCUS"), true);
    assert.equal(pack.userOnlyActions.includes("CREATE_WORK_OBJECT"), true);
    assert.equal(pack.activeChildren.length, 0);
    const projectPack = (await value.client.objectContextPack(projectId)).pack;
    assert.equal(projectPack.kind, "PROJECT");
    assert.equal(projectPack.activeChildren.length, 1);
    assert.equal(projectPack.activeChildren[0]!.workObjectId, miniId);
  } finally { stop(); await value.service.close(); }
});

test("Object conversation path: re-entry context, low-risk agent apply, USER boundary handoff", async () => {
  const value = await setup("conversation");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraph(value.client);
    const miniFormal = await formalizeDetailed(value.client, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理", "anchor-mini");
    const miniId = miniFormal.workObjectId;
    const pack = (await value.client.objectContextPack(miniId)).pack;
    assert.equal(pack.reentrySummary.includes("采购规格书整理"), true);
    value.graph.seedNaturalRecord(value.graphId, "evidence-block", "下一步：整理供应商历史报价");
    const frozen = await value.client.freezeExternalEvidence({ evidenceId: "conversation-evidence", workObjectId: miniId, blockUuid: "evidence-block" });
    const run = await value.client.startExternalAgentRun({ runId: "conversation-run", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: miniId, evidenceIds: [frozen.evidence.id], executorId: "codex" });
    const finished = await value.client.finishExternalAgentRun(run.run.id, { outcome: "PROPOSAL", currentFocus: "整理供应商历史报价", reasonCode: "CONTEXT_AWARE_FOCUS", rationaleSummary: "当前记录给出了唯一明确的下一步" });
    assert.ok(finished.proposal);
    const applied = await value.client.applyExternalProposal(finished.proposal.id);
    assert.equal(applied.commit.status, "COMMITTED");
    const refreshed = (await value.client.objectContextPack(miniId)).pack;
    assert.equal(refreshed.currentFocus, "整理供应商历史报价");
    const pkg = (await value.client.createDecisionPackage({ workObjectId: miniId, summary: "把采购规格书整理改为等待采购确认", rationale: "供应商报价尚未确认", candidates: [{ operationType: "CHANGE_ENGAGEMENT", parameters: { target: { workObjectId: miniId, expectedVersion: refreshed.formalVersion, expectedProjectionHash: miniFormal.projectionHash }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待采购确认", reviewAt: null, evidenceIds: [frozen.evidence.id] } }, evidenceDependencies: [{ evidenceId: frozen.evidence.id, contentHash: frozen.evidence.contentHash }] } }] })).pkg;
    const event = await value.client.createTrustedUserEvent({ exactUserUtterance: "纳入", packageId: pkg.id, presentationRevision: pkg.presentationRevision });
    const compiled = await value.client.compileUserDecision({ trustedUserEventId: event.event.id });
    assert.equal(compiled.kind, "AUTHORIZED_DECISION");
    if (compiled.kind === "AUTHORIZED_DECISION") {
      const executed = await value.client.executeUserDecision(compiled.decision.id);
      assert.equal(executed.commit.status, "COMMITTED");
    }
    const final = (await value.client.objectContextPack(miniId)).pack;
    assert.equal(final.engagement, "WAITING");
  } finally { stop(); await value.service.close(); }
});
