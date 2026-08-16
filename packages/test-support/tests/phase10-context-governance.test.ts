import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type CognitionExecutor, type ContextPackItem, type ExecutionProfile, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse, type ReconcileJob, type SemanticJudgment } from "@task-copilot/contracts";
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

async function setup(label: string, cognitionExecutor?: CognitionExecutor, executionProfile?: ExecutionProfile) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase10-${label}-`));
  const service = await startKernelServer({ requireTrustedUserChannel: false, 
    databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), now: () => at, graphRequestTimeoutMs: 500,
    ...(cognitionExecutor ? { cognitionExecutor } : {}), ...(executionProfile ? { executionProfile } : {}),
  });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at); const graphId = `graph-phase10-${label}`;
  const source = graph.seedNaturalRecord(graphId, "source", "TODO Phase10 目标对象");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "Phase10 目标对象", anchor: { graphId, blockUuid: "source", sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: "source" }));
  return { directory, service, client, graph, graphId, workObjectId: prepared.commit.targetId!, source };
}

function sourceRef(graphId: string, blockUuid: string) { return { graphId, blockUuid }; }

async function waitForGraphAvailable(client: KernelClient): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await client.graphStatus()).available) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("GRAPH_ADAPTER_NEVER_AVAILABLE");
}

async function reconcileAndWait(client: KernelClient, workObjectId: string): Promise<ReconcileJob> {
  const job = (await client.reconcileMaintenance(workObjectId, "INTERACTIVE")).job;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const found = (await client.maintenanceStatus()).jobs.find((item) => item.id === job.id);
    if (found?.status === "DONE") return found;
    if (found?.status === "FAILED") throw new Error(found.lastError ?? "RECONCILE_FAILED");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("RECONCILE_JOB_NEVER_DONE");
}

async function seedCoverageForInteractiveReconcile(client: KernelClient, workObjectId: string, graphId: string, sourceContentHash: string): Promise<void> {
  await client.recordSourceChange({ workObjectId, graphId, sourceBlockUuid: "source", sourceContentHash, sourceMarker: null, observedAt: at });
  await client.setMaintenancePause("global", true);
}

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
    const draft = { workObjectId: value.workObjectId, dimension: "engagement" as const, type: "CONFLICT" as const, summary: "互相矛盾的方向", evidenceIds: [], sourceSnapshotId: "snap-1", formalVersion: 1 };
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

test("governance issue resolution is causal and dimension-checked", async () => {
  const judgments: SemanticJudgment[] = [];
  const seenPacks: ContextPackItem[][] = [];
  const cognition: CognitionExecutor = {
    id: "dimension-probe",
    async judge(input): Promise<SemanticJudgment> {
      const next = judgments.shift();
      if (!next) throw new Error("TEST_JUDGMENT_EXHAUSTED");
      seenPacks.push(input.contextPack);
      return next;
    },
  };
  const profile: ExecutionProfile = {
    id: "dimension-profile", executor: "FAKE", remoteEnabled: false, allowedDataScope: ["formal_state"],
    maxContextItems: 1, maxInputChars: 2_000, timeoutMs: 1_000, retryBudget: 0, credentialRef: null,
  };
  const value = await setup("dimension", cognition, profile);
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  try {
    await waitForGraphAvailable(value.client);
    await seedCoverageForInteractiveReconcile(value.client, value.workObjectId, value.graphId, value.source.sourceContentHash);
    const issue = (await value.client.upsertGovernanceIssue({
      id: "dimension-issue-1", workObjectId: value.workObjectId, dimension: "engagement", type: "CONFLICT",
      summary: "方向冲突", evidenceIds: [], sourceSnapshotId: "snap-dimension", formalVersion: 1,
    })).issue;
    // A current_focus judgment must never resolve an engagement issue.
    judgments.push({ kind: "NO_CHANGE", dimension: "current_focus", rationaleSummary: "维度不匹配", resolvesIssueIds: [issue.id] });
    await reconcileAndWait(value.client, value.workObjectId);
    assert.equal((await value.client.listGovernanceIssues(value.workObjectId)).issues.find((item) => item.id === issue.id)?.status, "OPEN");
    // The matching causal dimension resolves it.
    judgments.push({ kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "方向已由用户确认", resolvesIssueIds: [issue.id] });
    await reconcileAndWait(value.client, value.workObjectId);
    assert.equal((await value.client.listGovernanceIssues(value.workObjectId)).issues.find((item) => item.id === issue.id)?.status, "RESOLVED");
    assert.equal(seenPacks.every((pack) => pack.length === 1 && pack[0]?.role === "FORMAL_STATE"), true);
  } finally { stop(); await value.service.close(); }
});

test("ExecutionProfile gates data scope, caps total context items, and truncates input characters", async () => {
  // Scope + character budget: only SOURCE_DELTA is exposed and its content is truncated.
  const firstPacks: ContextPackItem[][] = [];
  const firstCognition: CognitionExecutor = {
    id: "profile-scope-probe",
    async judge(input): Promise<SemanticJudgment> {
      firstPacks.push(input.contextPack);
      return { kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "ok" };
    },
  };
  const firstProfile: ExecutionProfile = {
    id: "profile-scope", executor: "FAKE", remoteEnabled: false, allowedDataScope: ["SOURCE_DELTA"],
    maxContextItems: 2, maxInputChars: 12, timeoutMs: 1_000, retryBudget: 0, credentialRef: null,
  };
  const first = await setup("profile-scope", firstCognition, firstProfile);
  const stopFirst = startBridge({ baseUrl: first.service.baseUrl, bridgeToken: first.service.graphBridgeToken, snapshotKey: first.service.graphSnapshotKey, graphId: first.graphId, graph: first.graph });
  try {
    await waitForGraphAvailable(first.client);
    await seedCoverageForInteractiveReconcile(first.client, first.workObjectId, first.graphId, first.source.sourceContentHash);
    first.graph.seedNaturalRecord(first.graphId, "secret-context", "这段关联上下文不能出现在受限数据范围内");
    await first.client.associateContext({ workObjectId: first.workObjectId, sourceRef: sourceRef(first.graphId, "secret-context"), sourceVersionHash: stableHash(first.graph.naturalContent(first.graphId, "secret-context")), origin: "AGENT_INFERRED" });
    await reconcileAndWait(first.client, first.workObjectId);
    assert.equal(firstPacks.length, 1);
    assert.deepEqual(firstPacks[0]!.map((item) => item.role), ["SOURCE_DELTA"]);
    assert.equal(firstPacks[0]![0]!.content.length <= 12, true);
    assert.equal(firstPacks[0]!.some((item) => item.content.includes("secret-context")), false);
  } finally { stopFirst(); await first.service.close(); }

  // Item budget: one total item even when three scopes and an associated context are available.
  const secondPacks: ContextPackItem[][] = [];
  const secondCognition: CognitionExecutor = {
    id: "profile-item-probe",
    async judge(input): Promise<SemanticJudgment> {
      secondPacks.push(input.contextPack);
      return { kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "ok" };
    },
  };
  const secondProfile: ExecutionProfile = {
    id: "profile-items", executor: "FAKE", remoteEnabled: false, allowedDataScope: ["FORMAL_STATE", "SOURCE_DELTA", "CURRENT_WORKOBJECT_CONTEXT"],
    maxContextItems: 1, maxInputChars: 100_000, timeoutMs: 1_000, retryBudget: 0, credentialRef: null,
  };
  const second = await setup("profile-items", secondCognition, secondProfile);
  const stopSecond = startBridge({ baseUrl: second.service.baseUrl, bridgeToken: second.service.graphBridgeToken, snapshotKey: second.service.graphSnapshotKey, graphId: second.graphId, graph: second.graph });
  try {
    await waitForGraphAvailable(second.client);
    await seedCoverageForInteractiveReconcile(second.client, second.workObjectId, second.graphId, second.source.sourceContentHash);
    second.graph.seedNaturalRecord(second.graphId, "extra-context", "额外关联上下文");
    await second.client.associateContext({ workObjectId: second.workObjectId, sourceRef: sourceRef(second.graphId, "extra-context"), sourceVersionHash: stableHash(second.graph.naturalContent(second.graphId, "extra-context")), origin: "AGENT_INFERRED" });
    await reconcileAndWait(second.client, second.workObjectId);
    assert.equal(secondPacks.length, 1);
    assert.deepEqual(secondPacks[0]!.map((item) => item.role), ["FORMAL_STATE"]);
  } finally { stopSecond(); await second.service.close(); }
});

test("governance issue identity uses stable source refs, not pack handles or wording", async () => {
  const value = await setup("issue-identity");
  const stop = startBridge({ baseUrl: value.service.baseUrl, bridgeToken: value.service.graphBridgeToken, snapshotKey: value.service.graphSnapshotKey, graphId: value.graphId, graph: value.graph });
  const waitForOutcome = async (jobId: string, outcome: string) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const job = (await value.client.maintenanceStatus()).jobs.find((item) => item.id === jobId);
      if (job?.status === "DONE" && job.lastOutcome === outcome) return job;
      if (job?.status === "FAILED") throw new Error(job.lastError ?? "RECONCILE_FAILED");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("RECONCILE_OUTCOME_NOT_REACHED");
  };
  try {
    await waitForGraphAvailable(value.client);
    value.graph.seedNaturalRecord(value.graphId, "context-a", "A: 等厂商回复，没有其他可做");
    value.graph.seedNaturalRecord(value.graphId, "context-b", "B: 当前还可以继续本地兼容性测试");
    await value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, "context-a"), sourceVersionHash: stableHash(value.graph.naturalContent(value.graphId, "context-a")), origin: "AGENT_INFERRED" });
    const associationB = await value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, "context-b"), sourceVersionHash: stableHash(value.graph.naturalContent(value.graphId, "context-b")), origin: "AGENT_INFERRED" });

    const burst1 = value.graph.seedNaturalRecord(value.graphId, "burst-1", "今天补充了 A/B 两条记录");
    let observed = await value.client.recordSourceChange({ workObjectId: value.workObjectId, graphId: value.graphId, sourceBlockUuid: "burst-1", sourceContentHash: burst1.sourceContentHash, sourceMarker: null, observedAt: at });
    await waitForOutcome(observed.job.id, "CONFLICT");
    const firstIssues = (await value.client.listGovernanceIssues(value.workObjectId, "OPEN")).issues;
    assert.equal(firstIssues.length, 1);
    const stableId = firstIssues[0]!.id;

    // Same two source refs with updated content: same Issue identity, no duplicate.
    value.graph.editNaturalContent(value.graphId, "burst-1", "今天补充了 A/B 两条记录（内容已更新）");
    observed = await value.client.recordSourceChange({ workObjectId: value.workObjectId, graphId: value.graphId, sourceBlockUuid: "burst-1", sourceContentHash: stableHash(value.graph.naturalContent(value.graphId, "burst-1")), sourceMarker: null, observedAt: at });
    await waitForOutcome(observed.job.id, "CONFLICT");
    const sameSourceIssues = (await value.client.listGovernanceIssues(value.workObjectId, "OPEN")).issues;
    assert.equal(sameSourceIssues.length, 1);
    assert.equal(sameSourceIssues[0]!.id, stableId);

    // Different conflict source set: a new Issue identity is allowed.
    await value.client.invalidateContextAssociation(associationB.association.id);
    value.graph.seedNaturalRecord(value.graphId, "context-c", "C: 还可以继续整理本地兼容性矩阵");
    await value.client.associateContext({ workObjectId: value.workObjectId, sourceRef: sourceRef(value.graphId, "context-c"), sourceVersionHash: stableHash(value.graph.naturalContent(value.graphId, "context-c")), origin: "AGENT_INFERRED" });
    const burst2 = value.graph.seedNaturalRecord(value.graphId, "burst-2", "另一批补充材料");
    observed = await value.client.recordSourceChange({ workObjectId: value.workObjectId, graphId: value.graphId, sourceBlockUuid: "burst-2", sourceContentHash: burst2.sourceContentHash, sourceMarker: null, observedAt: at });
    await waitForOutcome(observed.job.id, "CONFLICT");
    const changedSourceIssues = (await value.client.listGovernanceIssues(value.workObjectId, "OPEN")).issues;
    assert.equal(changedSourceIssues.length, 2);
    assert.equal(changedSourceIssues.filter((item) => item.id === stableId).length, 1);
    const newIssue = changedSourceIssues.find((item) => item.id !== stableId);
    assert.ok(newIssue);
    assert.notEqual(newIssue!.sourceSnapshotId, firstIssues[0]!.sourceSnapshotId);
  } finally { stop(); await value.service.close(); }
});
