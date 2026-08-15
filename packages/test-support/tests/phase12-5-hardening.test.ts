import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type DiscoveryExecutor, type ExecutionProfile, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
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
    if (request.kind === "READ_PAGE") {
      const blocks = input.graph.pageBlockUuids(request.graphId, request.pageName).map((blockUuid) => ({ graphId: request.graphId, blockUuid, pageName: request.pageName, content: input.graph.naturalContent(request.graphId, blockUuid), contentHash: stableHash(input.graph.naturalContent(request.graphId, blockUuid)) }));
      return { kind: request.kind, page: { graphId: request.graphId, pageName: request.pageName, blocks, truncated: false } };
    }
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

async function setup(label: string, input: { discoveryExecutor?: DiscoveryExecutor; discoveryProfile?: ExecutionProfile } = {}) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase125-${label}-`));
  const service = await startKernelServer({
    databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64),
    now: () => at, graphRequestTimeoutMs: 500, journalPageNames: (date) => [`journal-${date}`],
    ...(input.discoveryExecutor ? { discoveryExecutor: input.discoveryExecutor } : {}),
    ...(input.discoveryProfile ? { discoveryProfile: input.discoveryProfile } : {}),
  });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at); const graphId = `graph-phase125-${label}`;
  return { directory, service, client, graph, graphId };
}

async function waitForGraphAvailable(client: KernelClient): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await client.graphStatus()).available) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("GRAPH_ADAPTER_NEVER_AVAILABLE");
}

async function formalizeProject(client: KernelClient, graph: FakeGraphAdapter, graphId: string, title: string, blockUuid: string) {
  const source = graph.seedNaturalRecord(graphId, blockUuid, `TODO ${title}`);
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${blockUuid}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "PROJECT", title, anchor: { graphId, blockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: blockUuid }));
  return prepared.commit.targetId!;
}

const fakeProfile: ExecutionProfile = {
  id: "phase125-fake", executor: "FAKE", remoteEnabled: false, allowedDataScope: ["discovery"], maxContextItems: 40, maxInputChars: 10_000, timeoutMs: 1_000, retryBudget: 0, credentialRef: null,
};

test("coverage is honest: capped scopes are PARTIAL with continuation and no silent skip", async () => {
  const value = await setup("coverage", { discoveryProfile: { ...fakeProfile, maxContextItems: 3 } });
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraphAvailable(value.client);
    for (let index = 0; index < 7; index += 1) value.graph.seedPageRecord(value.graphId, "page-big", `src-${index}`, `@no-candidate:ONE_OFF\n记录 ${index}`);
    const first = (await value.client.runDiscovery({ kind: "PAGE", graphId: value.graphId, pageName: "page-big" })).run;
    assert.equal(first.scopeTotal, 7);
    assert.equal(first.selectedCount, 3);
    assert.equal(first.processedCount, 3);
    assert.equal(first.remainingCount, 4);
    assert.equal(first.status, "PARTIAL");
    assert.ok(first.continuationToken);
    const second = (await value.client.runDiscovery({ kind: "PAGE", graphId: value.graphId, pageName: "page-big" }, { continuationToken: first.continuationToken })).run;
    assert.equal(second.scopeTotal, 7);
    assert.equal(second.selectedCount, 3);
    assert.equal(second.remainingCount, 1);
    assert.equal(second.status, "PARTIAL");
    assert.ok(second.continuationToken);
    const third = (await value.client.runDiscovery({ kind: "PAGE", graphId: value.graphId, pageName: "page-big" }, { continuationToken: second.continuationToken })).run;
    assert.equal(third.selectedCount, 1);
    assert.equal(third.remainingCount, 0);
    assert.equal(third.status, "COMPLETED");
    const seen = new Set<string>();
    for (const run of [first, second, third]) for (const item of (await value.client.showDiscoveryRun(run.id)).sources) {
      if (item.reason === "ALREADY_COVERED") continue;
      assert.equal(seen.has(item.sourceRef.blockUuid), false);
      seen.add(item.sourceRef.blockUuid);
    }
    assert.equal(seen.size, 7);
  } finally { stop(); await value.service.close(); }
});

test("candidate continuity: new material attaches to an OPEN candidate and KEEP_OBSERVING does not package", async () => {
  const value = await setup("continuity");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraphAvailable(value.client);
    value.graph.seedPageRecord(value.graphId, "journal-2026-08-15", "src-day1", "@candidate:TASK:数据库高可用演练:KEEP_OBSERVING\nDay1 准备演练");
    const first = (await value.client.organizeToday({ date: "2026-08-15" })).run;
    assert.equal(first.status, "COMPLETED");
    const candidates = (await value.client.listFormalizationCandidates("OPEN")).candidates;
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]!.maturity, "KEEP_OBSERVING");
    assert.equal((await value.client.listDecisionPackages()).packages.length, 0);
    const candidate = candidates[0]!;
    value.graph.seedPageRecord(value.graphId, "journal-2026-08-15", "src-day2", `@attach:${candidate.id}\nDay2 环境准备好了`);
    const second = await value.client.runDiscovery({ kind: "TODAY", date: "2026-08-15" });
    assert.equal(second.run.status, "COMPLETED");
    const after = (await value.client.listFormalizationCandidates("OPEN")).candidates;
    assert.equal(after.length, 1);
    assert.equal(after[0]!.id, candidate.id);
    assert.deepEqual(after[0]!.sourceRefs.map((ref) => ref.blockUuid).sort(), ["src-day1", "src-day2"]);
    assert.equal((await value.client.listDecisionPackages()).packages.length, 0);
  } finally { stop(); await value.service.close(); }
});

test("maturity gate and minimal evidence: READY packages carry supporting evidence", async () => {
  const value = await setup("evidence");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraphAvailable(value.client);
    const projectId = await formalizeProject(value.client, value.graph, value.graphId, "证据归属项目", "anchor-project");
    value.graph.seedPageRecord(value.graphId, "journal-2026-08-15", "src-main", "@candidate:TASK:发布检查清单:READY_FOR_DECISION\n正式要做，需要完成 A、B、C，最后交付清单");
    value.graph.seedPageRecord(value.graphId, "journal-2026-08-15", "src-owner", `@candidate-owner:${projectId}`);
    value.graph.seedPageRecord(value.graphId, "journal-2026-08-15", "src-support", "@supporting:D1,D2\n支持正式化的两条材料");
    const organized = await value.client.organizeToday({ date: "2026-08-15" });
    assert.equal(organized.readyCandidates.length, 1);
    assert.equal(organized.maturePackages.length, 1);
    const pkg = organized.maturePackages[0]!;
    const candidates = (await value.client.listDecisionCandidates(pkg.id)).candidates;
    assert.ok(candidates[0]);
    assert.ok(candidates[0]!.evidenceIds.length >= 1);
    const evidence = (await value.client.listFormalizationEvidence(organized.readyCandidates[0]!.id)).evidence;
    assert.ok(evidence.length >= 1);
    assert.equal(evidence.every((item) => item.proof.length > 0), true);
  } finally { stop(); await value.service.close(); }
});

test("invalid ATTACH_TO_CANDIDATE and unchanged rerun are honest without remote rework", async () => {
  let calls = 0;
  const counting: DiscoveryExecutor = {
    id: "counting-discovery",
    async judge(input) {
      calls += 1;
      const target = input.existingObjects[0];
      const judgments = input.contextPack.map((item) => ({ kind: "NO_CANDIDATE" as const, sourceHandles: [item.handle], reason: "UNCERTAIN" as const, rationaleSummary: "unsure" }));
      return target ? judgments : judgments;
    },
  };
  const value = await setup("rerun", { discoveryExecutor: counting, discoveryProfile: fakeProfile });
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraphAvailable(value.client);
    value.graph.seedPageRecord(value.graphId, "page-rerun", "src-bad", "错误候选");
    value.graph.seedPageRecord(value.graphId, "page-rerun", "src-plain", "普通记录");
    const first = (await value.client.runDiscovery({ kind: "PAGE", graphId: value.graphId, pageName: "page-rerun" })).run;
    assert.equal(first.status, "COMPLETED");
    assert.equal(calls, 1);
    const second = (await value.client.runDiscovery({ kind: "PAGE", graphId: value.graphId, pageName: "page-rerun" })).run;
    assert.equal(second.status, "COMPLETED");
    assert.equal(calls, 1);
  } finally { stop(); await value.service.close(); }
});

test("wrong ATTACH_TO_CANDIDATE id fails closed without inventing a candidate", async () => {
  const value = await setup("attach-invalid");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraphAvailable(value.client);
    value.graph.seedPageRecord(value.graphId, "page-attach", "src-attach", "@attach:missing-candidate\n这条其实不存在");
    const run = (await value.client.runDiscovery({ kind: "PAGE", graphId: value.graphId, pageName: "page-attach" })).run;
    assert.equal(run.status, "PARTIAL");
    const sources = (await value.client.showDiscoveryRun(run.id)).sources;
    assert.equal(sources[0]?.reason, "CANDIDATE_ATTACH_INVALID");
    assert.equal((await value.client.listFormalizationCandidates()).candidates.length, 0);
  } finally { stop(); await value.service.close(); }
});
