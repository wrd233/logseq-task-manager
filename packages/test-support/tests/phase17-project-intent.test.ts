import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, type GraphEffect } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-17T09:00:00.000Z";

async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase17-${label}-`));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64), now: () => at });
  const external = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const plugin = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at); const graphId = "graph-phase17";
  const source = graph.seedNaturalRecord(graphId, "project-source", "TODO 海丝独立建设");
  const prepared = await plugin.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "PROJECT", title: "海丝独立建设", anchor: { graphId, blockUuid: "project-source", sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await plugin.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: "project-source" }));
  return { directory, service, external, plugin, graph, graphId, projectId: prepared.commit.targetId! };
}

async function accept(plugin: KernelClient, packageId: string, presentationRevision: string) {
  const event = await plugin.createTrustedUserEvent({ exactUserUtterance: "确认", packageId, presentationRevision });
  const compiled = await plugin.compileUserDecision({ trustedUserEventId: event.event.id });
  assert.equal(compiled.kind, "AUTHORIZED_DECISION");
  if (compiled.kind !== "AUTHORIZED_DECISION") throw new Error("unreachable");
  return plugin.executeUserDecision(compiled.decision.id);
}

test("ProjectIntent is a USER-owned commitment executed only through a trusted package", async () => {
  const value = await setup("trusted");
  try {
    const created = await value.external.createDecisionPackage({
      workObjectId: value.projectId,
      summary: "把海丝独立建设的目标定为：完成独立基础设施建设并形成可交接的运维能力",
      rationale: "Project 需要稳定的长期结果边界。",
      candidates: [{ operationType: "UPDATE_PROJECT_INTENT", evidenceIds: [], parameters: { target: { workObjectId: value.projectId }, expectedIntentRevision: 0, input: { objective: "完成独立基础设施建设并形成可交接的运维能力", keyResults: [{ text: "核心设备采购与部署完成" }, { text: "独立组网和平台建设完成" }], currentPhase: "采购与实施准备" } } }],
    });
    assert.equal(created.pkg.status, "OPEN");
    await assert.rejects(value.external.createTrustedUserEvent({ exactUserUtterance: "确认", packageId: created.pkg.id, presentationRevision: created.pkg.presentationRevision }), /TRUSTED_USER_CHANNEL_REQUIRED/u);
    const executed = await accept(value.plugin, created.pkg.id, created.pkg.presentationRevision);
    assert.equal(executed.commit.actor.type, "USER");
    assert.equal(executed.commit.operationType, "UPDATE_PROJECT_INTENT");
    assert.equal(executed.projectionObligation, null);
    const pack = (await value.external.objectContextPack(value.projectId)).pack;
    assert.equal(pack.projectIntent?.objective, "完成独立基础设施建设并形成可交接的运维能力");
    assert.equal(pack.projectIntent?.keyResults.length, 2);
    assert.equal(pack.projectIntent?.currentPhase, "采购与实施准备");
    assert.equal(pack.projectIntent?.revision, 1);
    const map = await value.external.workMapProjection();
    assert.equal(map.roots[0]?.currentPhase, "采购与实施准备");
    const now = await value.external.nowProjection();
    assert.equal(now.items.some((item) => item.workObjectId === value.projectId && item.currentReality.includes("完成独立基础设施建设")), true);
  } finally { await value.service.close(); }
});

test("ProjectIntent revision and stale project version fail closed", async () => {
  const value = await setup("stale");
  try {
    const staleRevision = await value.external.createDecisionPackage({
      workObjectId: value.projectId, summary: "旧 revision 目标", rationale: "将在更新后变 stale",
      candidates: [{ operationType: "UPDATE_PROJECT_INTENT", parameters: { target: { workObjectId: value.projectId }, expectedIntentRevision: 0, input: { objective: "旧目标", keyResults: [] } } }],
    });
    const first = await value.external.createDecisionPackage({
      workObjectId: value.projectId, summary: "设置初始 ProjectIntent", rationale: "初始方向。",
      candidates: [{ operationType: "UPDATE_PROJECT_INTENT", parameters: { target: { workObjectId: value.projectId }, expectedIntentRevision: 0, input: { objective: "完成独立基础设施建设并形成可交接的运维能力", keyResults: [{ text: "完成基础设施部署" }], currentPhase: "采购与实施准备" } } }],
    });
    await accept(value.plugin, first.pkg.id, first.pkg.presentationRevision);
    const event = await value.plugin.createTrustedUserEvent({ exactUserUtterance: "确认", packageId: staleRevision.pkg.id, presentationRevision: staleRevision.pkg.presentationRevision });
    const compiled = await value.plugin.compileUserDecision({ trustedUserEventId: event.event.id });
    assert.equal(compiled.kind, "AUTHORIZED_DECISION");
    if (compiled.kind === "AUTHORIZED_DECISION") {
      await assert.rejects(value.plugin.executeUserDecision(compiled.decision.id), /USER_DECISION_STALE/u);
    }
    const staleVersion = await value.external.createDecisionPackage({
      workObjectId: value.projectId, summary: "目标微调", rationale: "version stale",
      candidates: [{ operationType: "UPDATE_PROJECT_INTENT", parameters: { target: { workObjectId: value.projectId }, expectedIntentRevision: 1, input: { objective: "目标微调", keyResults: [] } } }],
    });
    const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "project-source" });
    const project = (await value.plugin.showObject(value.projectId)).object;
    const rename = await value.plugin.prepare(parseSemanticOperation({ operationId: "rename-project", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: value.projectId, expectedVersion: project.version, expectedProjectionHash: snapshot.projection!.projectionHash }, input: { title: "海丝独立建设二期" } }), snapshot);
    const result = await value.graph.applyGraphEffect(rename.graphEffect as GraphEffect);
    await value.plugin.complete(rename.commit.id, result, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "project-source" }));
    const event2 = await value.plugin.createTrustedUserEvent({ exactUserUtterance: "确认", packageId: staleVersion.pkg.id, presentationRevision: staleVersion.pkg.presentationRevision });
    const compiled2 = await value.plugin.compileUserDecision({ trustedUserEventId: event2.event.id });
    assert.equal(compiled2.kind, "STALE");
  } finally { await value.service.close(); }
});

test("bare bearer cannot invent a USER ProjectIntent commit", async () => {
  const value = await setup("impersonation");
  try {
    assert.throws(() => parseSemanticOperation({ operationId: "fake-project-intent", type: "UPDATE_PROJECT_INTENT" as never, actor: { type: "USER", id: "local-user" }, target: { workObjectId: value.projectId, expectedVersion: 1, expectedProjectionHash: "abcdef12" }, input: { objective: "伪造", keyResults: [] } }), /OPERATION_TYPE_UNSUPPORTED/u);
  } finally { await value.service.close(); }
});
