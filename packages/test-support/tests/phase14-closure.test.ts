import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, type GraphEffect } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

function nonNull<T>(value: T | null | undefined): T { assert.ok(value); return value; }

const at = "2026-08-19T09:00:00.000Z";

async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-closure-${label}-`));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64), requireTrustedUserChannel: false, now: () => at, closureAssessmentIntervalMs: 60_000 });
  const plugin = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at); const graphId = "graph-closure";
  return { directory, service, plugin, graph, graphId };
}

async function formalize(client: KernelClient, graph: FakeGraphAdapter, graphId: string, label: string, kind: "TASK" | "MINI_PROJECT" | "PROJECT", title: string) {
  const blockUuid = `source-${label}`;
  const source = graph.seedNaturalRecord(graphId, blockUuid, `TODO ${title}`);
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title, anchor: { graphId, blockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: blockUuid }));
  return prepared.commit.targetId!;
}

async function accept(plugin: KernelClient, packageId: string, presentationRevision: string) {
  const event = await plugin.createTrustedUserEvent({ exactUserUtterance: "确认", packageId, presentationRevision });
  const compiled = await plugin.compileUserDecision({ trustedUserEventId: event.event.id });
  assert.equal(compiled.kind, "AUTHORIZED_DECISION");
  if (compiled.kind !== "AUTHORIZED_DECISION") throw new Error("unreachable");
  return plugin.executeUserDecision(compiled.decision.id);
}

async function freeze(plugin: KernelClient, graph: FakeGraphAdapter, graphId: string, workObjectId: string, blockUuid: string, id: string) {
  const material = await graph.readEvidenceMaterial({ graphId, blockUuid }, "a".repeat(64));
  return (await plugin.freezeEvidence({ evidenceId: id, workObjectId, snapshot: material })).evidence;
}

test("MiniProject readiness never uses evidence count; irrelevant evidence stays UNKNOWN and only attributed evidence reaches READY", async () => {
  const value = await setup("mini");
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    let assessment = nonNull((await value.plugin.closureAssessment(miniId)).assessment);
    assert.equal(assessment.readiness, "UNKNOWN");
    // Two irrelevant frozen evidence: meeting held + budget approved. Count says 2, semantics says nothing.
    const irrelevantA = await freeze(value.plugin, value.graph, value.graphId, miniId, "source-mini", "evidence-mini-a");
    const irrelevantB = await freeze(value.plugin, value.graph, value.graphId, miniId, "source-mini", "evidence-mini-b");
    const miniSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-mini" });
    const pkg = (await value.plugin.createDecisionPackage({ workObjectId: miniId, summary: "设置采购规格书结果与检查", rationale: "测试", candidates: [{ operationType: "UPDATE_WORK_INTENT", parameters: { target: { workObjectId: miniId, expectedVersion: 1, expectedProjectionHash: miniSnapshot.projection!.projectionHash }, input: { desiredOutcome: "形成可提交的采购技术规格书", completionChecks: ["设备参数已确认", "产品范围已确认"] }, evidenceDependencies: [{ evidenceId: irrelevantA.id, contentHash: irrelevantA.contentHash }, { evidenceId: irrelevantB.id, contentHash: irrelevantB.contentHash }] } }] })).pkg;
    await accept(value.plugin, pkg.id, pkg.presentationRevision);
    const childId = await formalize(value.plugin, value.graph, value.graphId, "child", "TASK", "最终版本审核");
    value.service.store.putOwnership({ childId, ownerId: miniId, createdAt: at });
    assessment = nonNull((await value.plugin.closureAssessment(miniId)).assessment);
    assert.equal(assessment.readiness, "NOT_READY");
    const childSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" });
    const childClosed = await value.plugin.prepare(parseSemanticOperation({ operationId: "close-child", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: childId, expectedVersion: 1, expectedProjectionHash: childSnapshot.projection!.projectionHash }, input: { outcomeSummary: "审核完成", evidenceIds: [] } }), childSnapshot);
    const childResult = await value.graph.applyGraphEffect(childClosed.graphEffect as GraphEffect);
    await value.plugin.complete(childClosed.commit.id, childResult, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" }));
    value.service.closure.scan();
    await value.service.closure.tickClosure();
    assessment = nonNull((await value.plugin.closureAssessment(miniId)).assessment);
    assert.equal(assessment.readiness, "UNKNOWN");
    assert.equal(assessment.provenance, "AGENT");
    for (const check of assessment.checks) { assert.equal(check.status, "UNKNOWN"); assert.deepEqual(check.evidenceIds, []); }
    // Now freeze evidence that actually states each check's RESULT, not activity.
    const parameter = value.graph.seedNaturalRecord(value.graphId, "evidence-parameter", "设备参数已确认，评审记录已归档");
    const scope = value.graph.seedNaturalRecord(value.graphId, "evidence-scope", "产品范围已确认，最终范围清单已归档");
    const outcome = value.graph.seedNaturalRecord(value.graphId, "evidence-outcome", "形成可提交的采购技术规格书，最终版本已归档");
    const evidenceParameter = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-parameter", "evidence-parameter");
    const evidenceScope = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-scope", "evidence-scope");
    await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-outcome", "evidence-outcome");
    void parameter; void scope; void outcome;
    value.service.closure.scan();
    await value.service.closure.tickClosure();
    assessment = nonNull((await value.plugin.closureAssessment(miniId)).assessment);
    assert.equal(assessment.readiness, "READY");
    assert.equal(assessment.provenance, "AGENT");
    const parameterCheck = assessment.checks.find((check) => check.text === "设备参数已确认");
    const scopeCheck = assessment.checks.find((check) => check.text === "产品范围已确认");
    assert.equal(parameterCheck?.status, "SATISFIED");
    assert.deepEqual(parameterCheck?.evidenceIds, [evidenceParameter.id]);
    assert.equal(scopeCheck?.status, "SATISFIED");
    assert.deepEqual(scopeCheck?.evidenceIds, [evidenceScope.id]);
  } finally { await value.service.close(); }
});

test("Project readiness requires semantically supported KRs and a supported Objective; completion stays USER-only", async () => {
  const value = await setup("project");
  try {
    const projectId = await formalize(value.plugin, value.graph, value.graphId, "project", "PROJECT", "海丝独立建设");
    let assessment = nonNull((await value.plugin.closureAssessment(projectId)).assessment);
    assert.equal(assessment.readiness, "UNKNOWN");
    const intentPkg = (await value.plugin.createDecisionPackage({ workObjectId: projectId, summary: "设置项目目标与 KR", rationale: "测试", candidates: [{ operationType: "UPDATE_PROJECT_INTENT", parameters: { target: { workObjectId: projectId }, expectedIntentRevision: 0, input: { objective: "完成独立基础设施建设并形成可交接的运维能力", keyResults: [{ text: "设备部署完成" }, { text: "平台建设完成" }], currentPhase: "验收" } } }] })).pkg;
    await accept(value.plugin, intentPkg.id, intentPkg.presentationRevision);
    const childId = await formalize(value.plugin, value.graph, value.graphId, "child", "TASK", "法务探针验证");
    value.service.store.putOwnership({ childId, ownerId: projectId, createdAt: at });
    assessment = nonNull((await value.plugin.closureAssessment(projectId)).assessment);
    assert.equal(assessment.readiness, "NOT_READY");
    const childSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" });
    const childClosed = await value.plugin.prepare(parseSemanticOperation({ operationId: "close-child", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: childId, expectedVersion: 1, expectedProjectionHash: childSnapshot.projection!.projectionHash }, input: { outcomeSummary: "验证完成", evidenceIds: [] } }), childSnapshot);
    const childResult = await value.graph.applyGraphEffect(childClosed.graphEffect as GraphEffect);
    await value.plugin.complete(childClosed.commit.id, childResult, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" }));
    value.graph.seedNaturalRecord(value.graphId, "evidence-device", "设备部署完成，部署清单已归档");
    value.graph.seedNaturalRecord(value.graphId, "evidence-platform", "平台建设完成，并已形成可交接的运维能力");
    value.graph.seedNaturalRecord(value.graphId, "evidence-objective", "完成独立基础设施建设并形成可交接的运维能力，交接材料已归档");
    const evidenceDevice = await freeze(value.plugin, value.graph, value.graphId, projectId, "evidence-device", "evidence-device");
    const evidencePlatform = await freeze(value.plugin, value.graph, value.graphId, projectId, "evidence-platform", "evidence-platform");
    await freeze(value.plugin, value.graph, value.graphId, projectId, "evidence-objective", "evidence-objective");
    value.service.closure.scan();
    await value.service.closure.tickClosure();
    assessment = nonNull((await value.plugin.closureAssessment(projectId)).assessment);
    assert.equal(assessment.readiness, "READY");
    assert.equal(assessment.provenance, "AGENT");
    const krDevice = assessment.checks.find((check) => check.text === "设备部署完成");
    const krPlatform = assessment.checks.find((check) => check.text === "平台建设完成");
    assert.equal(krDevice?.status, "SATISFIED");
    assert.deepEqual(krDevice?.evidenceIds, [evidenceDevice.id]);
    assert.equal(krPlatform?.status, "SATISFIED");
    assert.deepEqual(krPlatform?.evidenceIds, [evidencePlatform.id]);
    const projectSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-project" });
    const closePkg = (await value.plugin.createDecisionPackage({ workObjectId: projectId, summary: "结束海丝独立建设", rationale: "结果边界均有语义依据，子项已全部结束。", candidates: [{ operationType: "COMPLETE_WORK_OBJECT", parameters: { target: { workObjectId: projectId, expectedVersion: 1, expectedProjectionHash: projectSnapshot.projection!.projectionHash }, input: { outcomeSummary: "完成独立基础设施建设并形成可交接的运维能力", evidenceIds: assessment.evidenceIds } } }] })).pkg;
    const executed = await accept(value.plugin, closePkg.id, closePkg.presentationRevision);
    assert.equal(executed.commit.actor.type, "USER");
    assert.equal((await value.plugin.showObject(projectId)).object.lifecycle, "COMPLETED");
    const closedPack = (await value.plugin.objectContextPack(projectId)).pack;
    assert.equal(closedPack.reentrySummary, "海丝独立建设 已完成");
    assert.equal(closedPack.closureAssessment, null);
  } finally { await value.service.close(); }
});

test("stale closure package fails closed when a child reopens before execution", async () => {
  const value = await setup("stale-closure");
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    const childId = await formalize(value.plugin, value.graph, value.graphId, "child", "TASK", "最终审核");
    value.service.store.putOwnership({ childId, ownerId: miniId, createdAt: at });
    const childSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" });
    const closeChild = await value.plugin.prepare(parseSemanticOperation({ operationId: "close-child", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: childId, expectedVersion: 1, expectedProjectionHash: childSnapshot.projection!.projectionHash }, input: { outcomeSummary: "审核完成", evidenceIds: [] } }), childSnapshot);
    const childResult = await value.graph.applyGraphEffect(closeChild.graphEffect as GraphEffect);
    await value.plugin.complete(closeChild.commit.id, childResult, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" }));
    const miniSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-mini" });
    const pkg = (await value.plugin.createDecisionPackage({ workObjectId: miniId, summary: "结束采购规格书整理", rationale: "准备关闭父对象", candidates: [{ operationType: "COMPLETE_WORK_OBJECT", parameters: { target: { workObjectId: miniId, expectedVersion: 1, expectedProjectionHash: miniSnapshot.projection!.projectionHash }, input: { outcomeSummary: "规格书定稿", evidenceIds: [] } } }] })).pkg;
    const closedChildSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" });
    const reopenChild = await value.plugin.prepare(parseSemanticOperation({ operationId: "reopen-child", type: "REOPEN_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: childId, expectedVersion: 2, expectedProjectionHash: closedChildSnapshot.projection!.projectionHash }, input: { reason: "验证还有遗留" } }), closedChildSnapshot);
    const reopenResult = await value.graph.applyGraphEffect(reopenChild.graphEffect as GraphEffect);
    await value.plugin.complete(reopenChild.commit.id, reopenResult, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" }));
    await assert.rejects(accept(value.plugin, pkg.id, pkg.presentationRevision), /PARENT_HAS_OPEN_CHILDREN/u);
    assert.equal((await value.plugin.showObject(miniId)).object.lifecycle, "OPEN");
  } finally { await value.service.close(); }
});
