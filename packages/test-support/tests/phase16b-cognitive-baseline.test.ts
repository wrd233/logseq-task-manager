import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, type GraphEffect } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-16T09:00:00.000Z";

async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase16b-now-${label}-`));
  const service = await startKernelServer({ requireTrustedUserChannel: false, databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64), now: () => at });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at);
  return { directory, service, client, graph };
}

async function formalize(client: KernelClient, graph: FakeGraphAdapter, label: string, kind: "TASK" | "MINI_PROJECT" | "PROJECT", title: string) {
  const graphId = "graph-now"; const blockUuid = `source-${label}`;
  const source = graph.seedNaturalRecord(graphId, blockUuid, `TODO ${title}`);
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title, anchor: { graphId, blockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: blockUuid }));
  return prepared.commit.targetId!;
}

async function apply(client: KernelClient, graph: FakeGraphAdapter, blockUuid: string, operation: Parameters<KernelClient["prepare"]>[0]) {
  const snapshot = await graph.readGraphSnapshot({ graphId: "graph-now", sourceBlockUuid: blockUuid });
  const prepared = await client.prepare(operation, snapshot);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId: "graph-now", sourceBlockUuid: blockUuid }));
  return prepared.commit.id;
}

async function freeze(client: KernelClient, graph: FakeGraphAdapter, workObjectId: string, blockUuid: string, evidenceId: string) {
  const material = await graph.readEvidenceMaterial({ graphId: "graph-now", blockUuid }, "a".repeat(64));
  return (await client.freezeEvidence({ evidenceId, workObjectId, snapshot: material })).evidence;
}

test("Cognitive baseline: Now changes are relative to the last time the user actually opened the object", async () => {
  const value = await setup("baseline");
  try {
    const taskId = await formalize(value.client, value.graph, "task", "TASK", "采购规格书整理");
    await value.client.markObjectViewed(taskId);
    const first = await value.client.nowProjection();
    assert.equal(first.items.some((item) => item.workObjectId === taskId), false);
    const object = (await value.client.showObject(taskId)).object;
    const snapshot = await value.graph.readGraphSnapshot({ graphId: "graph-now", sourceBlockUuid: "source-task" });
    await apply(value.client, value.graph, "source-task", parseSemanticOperation({ operationId: "rename-after-seen", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: taskId, expectedVersion: object.version, expectedProjectionHash: snapshot.projection!.projectionHash }, input: { title: "采购规格书定稿" } }));
    const second = await value.client.nowProjection();
    const item = second.items.find((candidate) => candidate.workObjectId === taskId);
    assert.ok(item);
    assert.equal(item!.changesSinceLastSeen, 1);
    assert.equal(item!.lastSeenAt, at);
    assert.match(item!.meaningfulChanges[0]!, /标题更新/);
    const pack = (await value.client.objectContextPack(taskId)).pack;
    assert.equal(pack.formalVersion, 2);
    assert.match(pack.recentChanges[0]!, /标题改为/);
    await value.client.markObjectViewed(taskId);
    const third = await value.client.nowProjection();
    assert.equal(third.items.some((candidate) => candidate.workObjectId === taskId), false);
  } finally { await value.service.close(); }
});

test("Quiet WAITING and a bare currentFocus do not occupy Now", async () => {
  const value = await setup("quiet-waiting");
  try {
    const waitingId = await formalize(value.client, value.graph, "waiting", "TASK", "等待厂商兼容版本");
    const focusId = await formalize(value.client, value.graph, "focus", "TASK", "只是有推进点");
    const waitingSnapshot = await value.graph.readGraphSnapshot({ graphId: "graph-now", sourceBlockUuid: "source-waiting" });
    const waitingEvidence = await freeze(value.client, value.graph, waitingId, "source-waiting", "evidence-waiting");
    await apply(value.client, value.graph, "source-waiting", parseSemanticOperation({ operationId: "to-waiting", type: "CHANGE_ENGAGEMENT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: waitingId, expectedVersion: 1, expectedProjectionHash: waitingSnapshot.projection!.projectionHash }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待厂商兼容版本", reviewAt: null, evidenceIds: [waitingEvidence.id] } }, evidenceDependencies: [{ evidenceId: waitingEvidence.id, contentHash: waitingEvidence.contentHash }] }));
    const focusObject = (await value.client.showObject(focusId)).object;
    value.service.store.putWorkObject({ ...focusObject, currentFocus: "确认交换机参数", version: 2, updatedAt: at });
    await value.client.markObjectViewed(waitingId);
    await value.client.markObjectViewed(focusId);
    const now = await value.client.nowProjection();
    assert.equal(now.items.some((item) => item.workObjectId === waitingId), false, "quiet WAITING must not surface");
    assert.equal(now.items.some((item) => item.workObjectId === focusId), false, "currentFocus alone must not surface");
  } finally { await value.service.close(); }
});

test("Pending Decision and Now are separate surfaces; a package-only object does not double-bomb", async () => {
  const value = await setup("dedupe");
  try {
    const taskId = await formalize(value.client, value.graph, "task", "TASK", "边界决定目标");
    await value.client.markObjectViewed(taskId);
    await value.client.createDecisionPackage({ workObjectId: taskId, summary: "把边界决定目标改为等待采购确认", rationale: "等待采购确认", candidates: [{ operationType: "CHANGE_ENGAGEMENT", parameters: { target: { workObjectId: taskId, expectedVersion: 1, expectedProjectionHash: "abcd1234" }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待采购确认", reviewAt: null, evidenceIds: [] } }, evidenceDependencies: [] } }] });
    const now = await value.client.nowProjection();
    assert.equal(now.items.some((item) => item.workObjectId === taskId), false, "package-only object belongs to Confirmation, not Now");
    const confirmations = await value.client.confirmationProjection();
    assert.equal(confirmations.items.length, 1);
    assert.equal(confirmations.items[0]!.packageId.includes("package"), true);
    assert.match(confirmations.items[0]!.impact, /进入等待/);
    await value.client.deferDecisionPackage(confirmations.items[0]!.packageId);
    assert.equal((await value.client.listDecisionPackages("REJECTED")).packages.length, 1);
    assert.equal((await value.client.confirmationProjection()).items.length, 0);
  } finally { await value.service.close(); }
});
