import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation, type ClosureAssessor, type ClosureSemanticJudgment, type ExecutionProfile, type GraphEffect, type SkillPackage } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-19T09:00:00.000Z";

class ControlledAssessor implements ClosureAssessor {
  readonly id = "controlled-closure-assessor";
  calls = 0;
  lastInput: Parameters<ClosureAssessor["assess"]>[0] | null = null;
  result: ClosureSemanticJudgment;
  #gate: Promise<void> | null = null;
  #release: (() => void) | null = null;
  constructor(result: ClosureSemanticJudgment) { this.result = result; }
  block(): void { this.#gate = new Promise((resolve) => { this.#release = resolve; }); }
  release(): void { this.#release?.(); this.#release = null; this.#gate = null; }
  async assess(input: Parameters<ClosureAssessor["assess"]>[0]): Promise<ClosureSemanticJudgment> {
    this.calls += 1; this.lastInput = input;
    if (this.#gate) await this.#gate;
    return this.result;
  }
}

const profile: ExecutionProfile = { id: "test-fake-closure", executor: "FAKE", remoteEnabled: false, allowedDataScope: ["formal_state", "frozen_evidence"], maxContextItems: 24, maxInputChars: 24_000, timeoutMs: 5_000, retryBudget: 1, credentialRef: null };
const skills = { miniProject: { id: "test", version: "0.1.0", contentHash: "x", manifest: {}, policy: "test", schema: {}, examples: [], eval: [] } as unknown as SkillPackage, project: { id: "test", version: "0.1.0", contentHash: "x", manifest: {}, policy: "test", schema: {}, examples: [], eval: [] } as unknown as SkillPackage };

async function setup(assessor: ClosureAssessor) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-closure-semantic-`));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64), requireTrustedUserChannel: false, now: () => at, closureAssessor: assessor, closureExecutionProfile: profile, closureAssessmentIntervalMs: 60_000, miniProjectClosureSkill: skills.miniProject, projectClosureSkill: skills.project });
  const plugin = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at, graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), userChannelToken: "c".repeat(64) } as PluginKernelDescriptor);
  const graph = new FakeGraphAdapter(() => at); const graphId = "graph-closure-semantic";
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

async function setMiniIntent(plugin: KernelClient, graph: FakeGraphAdapter, graphId: string, miniId: string, setupEvidenceId: string, setupContentHash: string) {
  const snapshot = await graph.readGraphSnapshot({ graphId, sourceBlockUuid: "source-mini" });
  const pkg = (await plugin.createDecisionPackage({ workObjectId: miniId, summary: "设置结束标准", rationale: "测试", candidates: [{ operationType: "UPDATE_WORK_INTENT", parameters: { target: { workObjectId: miniId, expectedVersion: 1, expectedProjectionHash: snapshot.projection!.projectionHash }, input: { desiredOutcome: "形成可提交的规格书", completionChecks: ["设备参数已确认"] }, evidenceDependencies: [{ evidenceId: setupEvidenceId, contentHash: setupContentHash }] } }] })).pkg;
  await accept(plugin, pkg.id, pkg.presentationRevision);
}

function miniReadyResult(evidenceId: string): ClosureSemanticJudgment {
  return {
    kind: "MINI_PROJECT",
    items: [{ key: "C0", status: "SATISFIED", supportingEvidenceIds: [evidenceId], rationale: "直接证明" }],
    objectiveJudgment: { status: "SATISFIED", objectiveContradiction: null, scopeMismatch: null, outcomeContradiction: null, summary: "目标已兑现" },
  };
}

test("deterministic gate blocks without any assessor call and Object GET never waits", async () => {
  const assessor = new ControlledAssessor(miniReadyResult("evidence-setup"));
  const value = await setup(assessor);
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    const started = Date.now();
    const initial = await value.plugin.closureAssessment(miniId);
    assert.equal(initial.assessment.readiness, "UNKNOWN");
    assert.equal(initial.fresh, true);
    assert.equal(initial.queued, false);
    assert.ok(Date.now() - started < 1_000);
    assert.equal(assessor.calls, 0);

    value.graph.seedNaturalRecord(value.graphId, "evidence-setup", "设备参数已确认");
    const setup = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-setup", "evidence-setup");
    await setMiniIntent(value.plugin, value.graph, value.graphId, miniId, setup.id, setup.contentHash);

    const stale = await value.plugin.closureAssessment(miniId);
    assert.equal(stale.fresh, false);
    assert.equal(stale.queued, true);
    assert.ok(stale.assessment.readiness === "UNKNOWN" || stale.assessment.readiness === "NOT_READY");
    assert.equal(assessor.calls, 0, "Object GET must not synchronously call the model");
  } finally { await value.service.close(); }
});

test("background closure job converges; RUNNING result is superseded by newer evidence instead of becoming current", async () => {
  const assessor = new ControlledAssessor(miniReadyResult("evidence-a"));
  const value = await setup(assessor);
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    value.graph.seedNaturalRecord(value.graphId, "evidence-a", "设备参数已确认");
    const setup = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-a", "evidence-a");
    await setMiniIntent(value.plugin, value.graph, value.graphId, miniId, setup.id, setup.contentHash);

    assessor.block();
    const pending = value.service.closure.tickClosure();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const running = value.service.closure.jobs("RUNNING").find((job) => job.workObjectId === miniId);
    assert.ok(running);
    assert.equal(assessor.calls, 1);

    // New evidence arrives while the model call is in flight.
    value.graph.seedNaturalRecord(value.graphId, "evidence-b", "设备参数已确认，最终复核记录已归档");
    await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-b", "evidence-b");
    assert.ok(value.service.closure.jobs("QUEUED").some((job) => job.workObjectId === miniId));
    assessor.release();
    await pending;

    const superseded = value.service.closure.jobs().find((job) => job.id === running!.id);
    assert.equal(superseded?.status, "STALE");
    assert.equal(superseded?.lastOutcome, "SUPERSEDED");
    const current = await value.plugin.closureAssessment(miniId);
    assert.equal(current.fresh, false, "Old RUNNING result must never become current");
    assert.notEqual(current.assessment?.readiness, "READY");
  } finally { await value.service.close(); }
});

test("host never repairs model output: empty support is UNKNOWN and invalid evidence reference fails the job", async () => {
  const emptySupport: ClosureSemanticJudgment = {
    kind: "MINI_PROJECT",
    items: [{ key: "C0", status: "SATISFIED", supportingEvidenceIds: [], rationale: "没有证据" }],
    objectiveJudgment: { status: "SATISFIED", objectiveContradiction: null, scopeMismatch: null, outcomeContradiction: null, summary: "ok" },
  };
  const assessor = new ControlledAssessor(emptySupport);
  const value = await setup(assessor);
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    value.graph.seedNaturalRecord(value.graphId, "evidence-a", "设备参数已确认");
    const setup = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-a", "evidence-a");
    await setMiniIntent(value.plugin, value.graph, value.graphId, miniId, setup.id, setup.contentHash);
    value.service.closure.scan();
    await value.service.closure.tickClosure();
    const first = await value.plugin.closureAssessment(miniId);
    assert.equal(first.assessment.readiness, "UNKNOWN");
    assert.equal(first.assessment.checks[0]?.status, "UNKNOWN");
    assert.deepEqual(first.assessment.checks[0]?.evidenceIds, []);

    assessor.result = { ...emptySupport, items: [{ key: "C0", status: "SATISFIED", supportingEvidenceIds: ["ghost-evidence"], rationale: "不存在" }] };
    value.service.closure.requestAssessment(miniId);
    await value.service.closure.tickClosure();
    const second = await value.plugin.closureAssessment(miniId);
    assert.notEqual(second.assessment.readiness, "READY");
    const invalidJob = value.service.closure.jobs().find((job) => job.workObjectId === miniId && job.lastError?.includes("CLOSURE_RESULT_EVIDENCE_REF_INVALID"));
    assert.ok(invalidJob);
  } finally { await value.service.close(); }
});

test("contradictory semantic result becomes CONFLICT and is never presented as ready", async () => {
  const contradictory: ClosureSemanticJudgment = {
    kind: "MINI_PROJECT",
    items: [{ key: "C0", status: "CONTRADICTED", supportingEvidenceIds: ["evidence-a"], rationale: "最新依据与检查矛盾" }],
    objectiveJudgment: { status: "CONTRADICTED", objectiveContradiction: "结果与目标冲突", scopeMismatch: null, outcomeContradiction: "最新记录与目标矛盾", summary: "冲突" },
  };
  const assessor = new ControlledAssessor(contradictory);
  const value = await setup(assessor);
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    value.graph.seedNaturalRecord(value.graphId, "evidence-a", "设备参数已确认");
    const setup = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-a", "evidence-a");
    await setMiniIntent(value.plugin, value.graph, value.graphId, miniId, setup.id, setup.contentHash);
    value.service.closure.scan();
    await value.service.closure.tickClosure();
    const state = await value.plugin.closureAssessment(miniId);
    assert.equal(state.assessment.readiness, "CONFLICT");
    assert.ok(state.assessment.contradictionSummary);
    assert.equal(state.assessment.checks[0]?.status, "CONTRADICTED");
  } finally { await value.service.close(); }
});

test("OPEN closure package is proactively STALE after child reopen or new evidence", async () => {
  const assessor = new ControlledAssessor(miniReadyResult("evidence-a"));
  const value = await setup(assessor);
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    value.graph.seedNaturalRecord(value.graphId, "evidence-a", "设备参数已确认");
    const setup = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-a", "evidence-a");
    await setMiniIntent(value.plugin, value.graph, value.graphId, miniId, setup.id, setup.contentHash);
    const childId = await formalize(value.plugin, value.graph, value.graphId, "child", "TASK", "最终版本审核");
    value.service.store.putOwnership({ childId, ownerId: miniId, createdAt: at });
    const childSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" });
    const closeChild = await value.plugin.prepare(parseSemanticOperation({ operationId: "close-child", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: childId, expectedVersion: 1, expectedProjectionHash: childSnapshot.projection!.projectionHash }, input: { outcomeSummary: "审核完成", evidenceIds: [] } }), childSnapshot);
    const childResult = await value.graph.applyGraphEffect(closeChild.graphEffect as GraphEffect);
    await value.plugin.complete(closeChild.commit.id, childResult, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" }));
    value.service.closure.scan();
    await value.service.closure.tickClosure();
    const ready = await value.plugin.closureAssessment(miniId);
    assert.equal(ready.assessment.readiness, "READY");
    const miniSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-mini" });
    const pkg = (await value.plugin.createDecisionPackage({ workObjectId: miniId, summary: "结束采购规格书整理", rationale: "语义评估已具备结束条件", candidates: [{ operationType: "COMPLETE_WORK_OBJECT", parameters: { target: { workObjectId: miniId, expectedVersion: 2, expectedProjectionHash: miniSnapshot.projection!.projectionHash }, input: { outcomeSummary: "规格书定稿", evidenceIds: ready.assessment.evidenceIds } } }] })).pkg;
    assert.ok((await value.plugin.listDecisionPackages("OPEN")).packages.some((item) => item.id === pkg.id));

    // Child reopen invalidates the package before any user response.
    const closedChildSnapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" });
    const reopenChild = await value.plugin.prepare(parseSemanticOperation({ operationId: "reopen-child", type: "REOPEN_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: childId, expectedVersion: 2, expectedProjectionHash: closedChildSnapshot.projection!.projectionHash }, input: { reason: "审核有遗留" } }), closedChildSnapshot);
    const reopenResult = await value.graph.applyGraphEffect(reopenChild.graphEffect as GraphEffect);
    await value.plugin.complete(reopenChild.commit.id, reopenResult, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source-child" }));
    await value.plugin.confirmationProjection();
    assert.ok((await value.plugin.listDecisionPackages("STALE")).packages.some((item) => item.id === pkg.id));
    assert.equal((await value.plugin.showObject(miniId)).object.lifecycle, "OPEN");
  } finally { await value.service.close(); }
});

test("READY surfaces once in Now and stops repeating after the user opens the object", async () => {
  const assessor = new ControlledAssessor(miniReadyResult("evidence-a"));
  const value = await setup(assessor);
  try {
    const miniId = await formalize(value.plugin, value.graph, value.graphId, "mini", "MINI_PROJECT", "采购规格书整理");
    value.graph.seedNaturalRecord(value.graphId, "evidence-a", "设备参数已确认");
    const setup = await freeze(value.plugin, value.graph, value.graphId, miniId, "evidence-a", "evidence-a");
    await setMiniIntent(value.plugin, value.graph, value.graphId, miniId, setup.id, setup.contentHash);
    value.service.closure.scan();
    await value.service.closure.tickClosure();
    const before = await value.plugin.nowProjection();
    const item = before.items.find((entry) => entry.workObjectId === miniId);
    assert.ok(item);
    assert.ok(item.meaningfulChanges.includes("完成情况已具备结束条件"));
    await value.plugin.markObjectViewed(miniId);
    const after = await value.plugin.nowProjection();
    const again = after.items.find((entry) => entry.workObjectId === miniId);
    assert.equal(again, undefined, "Long-running READY must not repeat after the user has seen it");
  } finally { await value.service.close(); }
});
