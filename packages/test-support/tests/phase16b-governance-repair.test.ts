import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-16T09:00:00.000Z";

function startBridge(input: { baseUrl: string; bridgeToken: string; snapshotKey: string; graphId: string; graph: FakeGraphAdapter }) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const handle = async (envelope: GraphGatewayRequestEnvelope): Promise<GraphGatewayResponse> => {
    const request = envelope.request;
    if (request.kind === "READ_TARGET_SNAPSHOT") return { kind: request.kind, snapshot: await input.graph.readGraphSnapshot(request.input) };
    if (request.kind === "READ_EVIDENCE") return { kind: request.kind, material: await input.graph.readEvidenceMaterial({ graphId: request.graphId, blockUuid: request.blockUuid }, input.snapshotKey) };
    if (request.kind === "APPLY_EFFECT") { const result = await input.graph.applyGraphEffect(request.effect); return { kind: request.kind, result, snapshot: await input.graph.readGraphSnapshot({ graphId: request.effect.graphId, sourceBlockUuid: request.effect.sourceBlockUuid }) }; }
    throw new Error("GRAPH_GATEWAY_UNSUPPORTED_REQUEST");
  };
  const post = (path: string, body: unknown) => fetch(`${input.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-task-copilot-graph-bridge": input.bridgeToken }, body: JSON.stringify(body) });
  const tick = async () => {
    try {
      const polled = await post("/v1/graph-adapter/poll", { graphId: input.graphId });
      const envelope = (await polled.json() as { request: GraphGatewayRequestEnvelope | null }).request;
      if (envelope) {
        try { await post(`/v1/graph-adapter/requests/${encodeURIComponent(envelope.id)}/complete`, { graphId: input.graphId, response: await handle(envelope) }); }
        catch (error) { if (!stopped) await post(`/v1/graph-adapter/requests/${encodeURIComponent(envelope.id)}/fail`, { graphId: input.graphId, error: { code: error instanceof Error ? error.message.split(":")[0]! : "GRAPH_FAILED", message: error instanceof Error ? error.message.slice(0, 300) : "failed" } }); }
      }
    } catch { /* teardown */ }
    if (!stopped) timer = setTimeout(() => void tick(), 2);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

async function waitForGraph(client: KernelClient) {
  for (let index = 0; index < 40; index += 1) { if ((await client.graphStatus()).available) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
  throw new Error("GRAPH_OFFLINE");
}

async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase16b-${label}-`));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64), now: () => at, graphRequestTimeoutMs: 500 });
  const external = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const plugin = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at); const graphId = `graph-phase16b-${label}`;
  const stop = startBridge({ baseUrl: service.baseUrl, bridgeToken: service.graphBridgeToken, snapshotKey: service.graphSnapshotKey, graphId, graph });
  await waitForGraph(external);
  return { directory, service, external, plugin, graph, graphId, stop };
}

async function formalize(client: KernelClient, graph: FakeGraphAdapter, graphId: string, label: string, kind: "PROJECT" | "MINI_PROJECT", title: string, blockUuid: string) {
  const source = graph.seedNaturalRecord(graphId, blockUuid, `TODO ${title}`);
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title, anchor: { graphId, blockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: blockUuid }));
  return prepared.commit.targetId!;
}

async function acceptPackage(plugin: KernelClient, packageId: string, presentationRevision: string) {
  const event = await plugin.createTrustedUserEvent({ exactUserUtterance: "确认", packageId, presentationRevision });
  const compiled = await plugin.compileUserDecision({ trustedUserEventId: event.event.id });
  assert.equal(compiled.kind, "AUTHORIZED_DECISION");
  if (compiled.kind !== "AUTHORIZED_DECISION") throw new Error("unreachable");
  return plugin.executeUserDecision(compiled.decision.id);
}

test("USER-actor Formal mutation requires the Plugin trusted channel; a bare bearer token is not USER authority", async () => {
  const value = await setup("channel");
  try {
    const source = value.graph.seedNaturalRecord(value.graphId, "source", "TODO 通道边界验证");
    const operation = parseSemanticOperation({ operationId: "channel-create", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "通道边界验证", anchor: { graphId: value.graphId, blockUuid: "source", sourceContentHash: source.sourceContentHash } } });
    await assert.rejects(value.external.prepare(operation, source), /TRUSTED_USER_CHANNEL_REQUIRED/u);
    await assert.rejects(value.external.commitFormal(operation, source), /TRUSTED_USER_CHANNEL_REQUIRED/u);
    const prepared = await value.plugin.prepare(operation, source);
    assert.equal(prepared.commit.status, "KERNEL_APPLIED");
    const result = await value.graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
    await value.plugin.complete(prepared.commit.id, result, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source" }));
    assert.equal((await value.plugin.showObject(prepared.commit.targetId!)).object.title, "通道边界验证");
    await assert.rejects(value.external.markObjectViewed(prepared.commit.targetId!), /TRUSTED_USER_CHANNEL_REQUIRED/u);
    assert.equal((await value.plugin.markObjectViewed(prepared.commit.targetId!)).baseline.lastViewedFormalVersion, 1);
  } finally { value.stop(); await value.service.close(); }
});

test("Ownership mutation has no production route and only executes through a trusted USER decision", async () => {
  const value = await setup("ownership");
  try {
    const projectId = await formalize(value.plugin, value.graph, value.graphId, "project", "PROJECT", "海丝项目", "anchor-project");
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理", "anchor-mini");

    const direct = await fetch(`${value.service.baseUrl}/v1/ownerships`, { method: "POST", headers: { authorization: `Bearer ${value.service.token}`, "content-type": "application/json" }, body: JSON.stringify({ childId: miniId, ownerId: projectId, actor: { type: "USER", id: "local-user" } }) });
    assert.equal(direct.status, 404);
    assert.equal((await value.external.listOwnerships()).ownerships.length, 0);

    const created = await value.external.createOwnershipDecisionPackage({ childId: miniId, ownerId: projectId, summary: "把「采购规格书整理」归入「海丝项目」", rationale: "正式归属变化，不移动自然笔记。" });
    assert.equal(created.pkg.status, "OPEN");
    assert.equal(created.candidates[0]!.operationType, "ASSIGN_PARENT");
    await assert.rejects(value.external.createTrustedUserEvent({ exactUserUtterance: "确认", packageId: created.pkg.id, presentationRevision: created.pkg.presentationRevision }), /TRUSTED_USER_CHANNEL_REQUIRED/u);

    const executed = await acceptPackage(value.plugin, created.pkg.id, created.pkg.presentationRevision);
    assert.equal(executed.commit.actor.type, "USER");
    assert.equal(executed.commit.actor.id, "local-user");
    assert.equal(executed.commit.operationType, "ASSIGN_PARENT");
    assert.equal(executed.projectionObligation, null);
    assert.equal((await value.external.listOwnerships()).ownerships.some((item) => item.childId === miniId && item.ownerId === projectId), true);
    assert.equal((await value.external.listDecisionPackages("ACCEPTED")).packages[0]?.id, created.pkg.id);
  } finally { value.stop(); await value.service.close(); }
});

test("WorkIntent Agent proposals package for USER authorization instead of applying directly", async () => {
  const value = await setup("work-intent");
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "虚拟机模板与镜像规范", "anchor-mini");
    value.graph.seedNaturalRecord(value.graphId, "intent-evidence", "目标是形成可评审规范；完成标准是模板、镜像约束与联合评审。");
    const frozen = await value.external.freezeExternalEvidence({ evidenceId: "evidence-intent", workObjectId: miniId, blockUuid: "intent-evidence" });
    const run = await value.external.startExternalAgentRun({ runId: "run-intent", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: miniId, evidenceIds: [frozen.evidence.id], executorId: "codex", governanceCorrelationId: "governance-intent" });
    const finished = await value.external.finishExternalAgentRun(run.run.id, { outcome: "PROPOSAL", change: { type: "UPDATE_WORK_INTENT", desiredOutcome: "形成一份可评审的虚拟机模板与镜像规范", completionChecks: ["覆盖模板、镜像和发布约束", "通过联合评审"] }, reasonCode: "COMMITMENT_CLEAR", rationaleSummary: "输出与完成边界清晰。" });
    assert.equal(finished.revision?.operationType, "UPDATE_WORK_INTENT");
    const packaged = await value.external.applyExternalProposal(finished.proposal!.id);
    assert.ok("package" in packaged);
    assert.equal(packaged.package.status, "OPEN");
    const before = (await value.external.showObject(miniId)).object;
    assert.equal(before.desiredOutcome, null);
    assert.equal((await value.external.showProposal(finished.proposal!.id)).proposal.status, "PACKAGED");
    await assert.rejects(value.external.applyExternalProposal(finished.proposal!.id), /PROPOSAL_NOT_OPEN/u);

    const executed = await acceptPackage(value.plugin, packaged.package.id, packaged.package.presentationRevision);
    assert.equal(executed.commit.actor.type, "USER");
    assert.equal(executed.commit.operationType, "UPDATE_WORK_INTENT");
    assert.equal(executed.projectionObligation?.status, "PENDING");
    const after = (await value.external.showObject(miniId)).object;
    assert.equal(after.desiredOutcome, "形成一份可评审的虚拟机模板与镜像规范");
    assert.deepEqual(after.completionChecks, ["覆盖模板、镜像和发布约束", "通过联合评审"]);
    assert.equal(after.version, 2);
    assert.equal((await value.external.objectContextPack(miniId)).pack.pendingDecisionPackages.length, 0);
  } finally { value.stop(); await value.service.close(); }
});
