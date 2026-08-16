import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type CognitionExecutor, type ExecutionProfile, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse, type SemanticJudgment, type WorkObject } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-18T09:00:00.000Z";

class CountingExecutor implements CognitionExecutor {
  readonly id = "counting-cognition";
  calls = 0;
  mode: "NO_CHANGE" | "FAIL" = "NO_CHANGE";
  async judge(input: { object: WorkObject; contextPack: readonly { content: string }[]; openIssues: readonly unknown[]; profile: ExecutionProfile }): Promise<SemanticJudgment> {
    void input;
    this.calls += 1;
    if (this.mode === "FAIL") throw new Error("DEEPSEEK_HTTP_401");
    return { kind: "NO_CHANGE", dimension: "current_focus", rationaleSummary: "deterministic no-op" } satisfies SemanticJudgment;
  }
}

function startBridge(input: { baseUrl: string; bridgeToken: string; snapshotKey: string; graphId: string; graph: FakeGraphAdapter }) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const handle = async (envelope: GraphGatewayRequestEnvelope): Promise<GraphGatewayResponse> => {
    const request = envelope.request;
    if (request.kind === "READ_TARGET_SNAPSHOT") return { kind: request.kind, snapshot: await input.graph.readGraphSnapshot(request.input) };
    if (request.kind === "READ_BLOCK") return { kind: request.kind, block: { graphId: request.graphId, blockUuid: request.blockUuid, pageName: null, content: input.graph.naturalContent(request.graphId, request.blockUuid), contentHash: stableHash(input.graph.naturalContent(request.graphId, request.blockUuid)) } };
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

async function setup(label: string, executor: CountingExecutor, profile: ExecutionProfile) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase13-${label}-`));
  const service = await startKernelServer({
    databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token",
    graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64),
    requireTrustedUserChannel: false, now: () => at, maintenanceMaxAttempts: 1, maintenanceRetryBackoffMs: 0,
    cognitionExecutor: executor, executionProfile: profile,
  });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at); const graphId = "graph-phase13";
  return { directory, service, client, graph, graphId };
}

async function formalize(client: KernelClient, graph: FakeGraphAdapter, graphId: string, label: string, kind: "TASK" | "PROJECT", title: string, blockUuid: string) {
  const source = graph.seedNaturalRecord(graphId, blockUuid, `TODO ${title}`);
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title, anchor: { graphId, blockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: blockUuid }));
  return prepared.commit.targetId!;
}

const remoteBudgetProfile: ExecutionProfile = {
  id: "phase13-budget", executor: "DEEPSEEK", remoteEnabled: true, allowedDataScope: ["formal_state", "current_workobject_context"],
  maxContextItems: 8, maxInputChars: 18_000, reasoningEffort: "low", maxOutputTokens: 500,
  maxRemoteCallsPerRun: 1, maxRemoteCallsPerHour: 2, timeoutMs: 20_000, retryBudget: 1, credentialRef: "DEEPSEEK_API_KEY",
};

test("unattended runtime defers remote work by budget instead of failing or bursting", async () => {
  const executor = new CountingExecutor();
  const value = await setup("budget", executor, remoteBudgetProfile);
  try {
    const taskId = await formalize(value.client, value.graph, value.graphId, "task", "TASK", "后台预算对象", "source-task");
    const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
    try {
      for (let index = 0; index < 40 && !(await value.client.graphStatus()).available; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      for (let round = 0; round < 3; round += 1) {
        const content = `后台认知第 ${round} 次变更`;
        value.graph.editNaturalContent(value.graphId, "source-task", content);
        const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-task" });
        await value.client.recordSourceChange({ workObjectId: taskId, graphId: value.graphId, sourceBlockUuid: "source-task", sourceContentHash: snapshot.sourceContentHash, sourceMarker: snapshot.sourceMarker ?? null, observedAt: at });
        await value.service.maintenance.tick();
      }
      assert.equal(executor.calls, 2);
      const queued = value.service.maintenance.jobs("QUEUED");
      assert.equal(queued.some((job) => job.lastError === "DEFERRED_BY_BUDGET"), true);
      const system = await value.client.systemProjection();
      assert.equal(system.runtimeStatus, "CATCHING_UP");
      assert.equal(system.runtimeSummary, "正在补齐最近的变化。");
    } finally { stop(); }
  } finally { await value.service.close(); }
});

test("Project semantic revision refreshes queued maintenance instead of running stale cognition", async () => {
  const executor = new CountingExecutor();
  const value = await setup("semantic-revision", executor, remoteBudgetProfile);
  try {
    const projectId = await formalize(value.client, value.graph, value.graphId, "project", "PROJECT", "后台项目语义", "source-project");
    const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
    try {
      for (let index = 0; index < 40 && !(await value.client.graphStatus()).available; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      value.graph.editNaturalContent(value.graphId, "source-project", "项目阶段推进材料");
      const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-project" });
      await value.client.recordSourceChange({ workObjectId: projectId, graphId: value.graphId, sourceBlockUuid: "source-project", sourceContentHash: snapshot.sourceContentHash, sourceMarker: snapshot.sourceMarker ?? null, observedAt: at });
      const pkg = await value.client.createDecisionPackage({ workObjectId: projectId, summary: "设置项目阶段", rationale: "测试复合语义版本", candidates: [{ operationType: "UPDATE_PROJECT_INTENT", parameters: { target: { workObjectId: projectId }, expectedIntentRevision: 0, input: { objective: "完成项目语义版本验证", keyResults: [], currentPhase: "实施准备" } } }] });
      const event = await value.client.createTrustedUserEvent({ exactUserUtterance: "确认", packageId: pkg.pkg.id, presentationRevision: pkg.pkg.presentationRevision });
      const compiled = await value.client.compileUserDecision({ trustedUserEventId: event.event.id });
      if (compiled.kind === "AUTHORIZED_DECISION") await value.client.executeUserDecision(compiled.decision.id);
      const first = await value.service.maintenance.tick();
      assert.equal(executor.calls, 0);
      assert.equal(first?.lastError, "SEMANTIC_REVISION_CHANGED");
      assert.equal(first?.status, "QUEUED");
      await value.service.maintenance.tick();
      assert.equal(executor.calls, 1);
    } finally { stop(); }
  } finally { await value.service.close(); }
});

test("runtime health reports PAUSED and DEGRADED without affecting formal reads", async () => {
  const executor = new CountingExecutor(); executor.mode = "FAIL";
  const value = await setup("health", executor, { ...remoteBudgetProfile, maxRemoteCallsPerHour: 100 });
  try {
    const taskId = await formalize(value.client, value.graph, value.graphId, "health", "TASK", "健康状态对象", "source-health");
    const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
    try {
      for (let index = 0; index < 40 && !(await value.client.graphStatus()).available; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      value.graph.editNaturalContent(value.graphId, "source-health", "健康状态材料");
      const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-health" });
      await value.client.recordSourceChange({ workObjectId: taskId, graphId: value.graphId, sourceBlockUuid: "source-health", sourceContentHash: snapshot.sourceContentHash, sourceMarker: snapshot.sourceMarker ?? null, observedAt: at });
      await value.client.setMaintenancePause("global", true);
      assert.equal((await value.client.systemProjection()).runtimeStatus, "PAUSED");
      await value.client.setMaintenancePause("global", false);
      await value.service.maintenance.tick();
      const system = await value.client.systemProjection();
      assert.equal(system.runtimeStatus, "DEGRADED");
      assert.equal(system.runtimeFailedJobs, 1);
      assert.equal((await value.client.showObject(taskId)).object.lifecycle, "OPEN");
    } finally { stop(); }
  } finally { await value.service.close(); }
});
