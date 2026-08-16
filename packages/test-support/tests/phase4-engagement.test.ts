import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, type EngagementAgent, type SkillPackage, type GraphEffect } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-13T08:00:00.000Z";

async function setup(label: string, options: { engagementAgent?: EngagementAgent; engagementSkill?: SkillPackage } = {}) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase4-${label}-`));
  const service = await startKernelServer({ requireTrustedUserChannel: false,  databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", now: () => at, ...options });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at);
  const source = graph.seedNaturalRecord("graph-phase4", `source-${label}`, "配置生产服务器网络");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "配置生产服务器网络", anchor: { graphId: source.graphId, blockUuid: source.sourceBlockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid }));
  return { directory, service, client, graph, source, workObjectId: prepared.commit.targetId! };
}

async function reconcile(value: Awaited<ReturnType<typeof setup>>, suffix: string, content: string) {
  const blockUuid = `evidence-block-${suffix}`;
  value.graph.seedNaturalRecord(value.source.graphId, blockUuid, content);
  const evidenceId = `evidence-${suffix}`;
  await value.client.freezeEvidence({ evidenceId, workObjectId: value.workObjectId, snapshot: await value.graph.readEvidenceMaterial({ graphId: value.source.graphId, blockUuid }, value.service.graphSnapshotKey) });
  const run = await value.client.runEngagementAgent({ runId: `run-${suffix}`, workObjectId: value.workObjectId, evidenceIds: [evidenceId], snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
  if (!run.proposal) return { evidenceId, blockUuid, run, pending: null };
  const pending = await value.client.applyProposal(run.proposal.id, { operationId: `apply-${suffix}`, snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }), evidence: [{ evidenceId, ...await value.graph.readEvidenceMaterial({ graphId: value.source.graphId, blockUuid }, value.service.graphSnapshotKey) }] });
  return { evidenceId, blockUuid, run, pending };
}

async function complete(value: Awaited<ReturnType<typeof setup>>, pending: NonNullable<Awaited<ReturnType<typeof reconcile>>["pending"]>) {
  const applied = await value.graph.applyGraphEffect(pending.graphEffect as GraphEffect);
  return value.client.complete(pending.commit.id, applied, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
}

async function undo(value: Awaited<ReturnType<typeof setup>>, commitId: string, suffix: string) {
  const pending = await value.client.prepareUndo(commitId, { operationId: `undo-${suffix}`, actor: { type: "USER", id: "local-user" }, snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
  return complete(value, pending);
}

test("Fake Agent reconciles ACTIONABLE to WAITING atomically, removes it from actionable, and Undo restores all state", async () => {
  const value = await setup("enter");
  try {
    assert.deepEqual((await value.client.listActionableObjects()).objects.map((item) => item.id), [value.workObjectId]);
    const proposed = await reconcile(value, "enter", "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    assert.equal(proposed.run.run.purpose, "ENGAGEMENT_RECONCILIATION");
    assert.equal(proposed.run.revision?.operationType, "CHANGE_ENGAGEMENT");
    assert.ok(proposed.pending);
    const committed = await complete(value, proposed.pending);
    const waiting = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(committed.commit.status, "COMMITTED");
    assert.equal(waiting.engagement, "WAITING");
    assert.equal(waiting.waitingCondition?.description, "等待网络组分配 VLAN 和网关信息");
    assert.equal(waiting.waitingCondition?.since, at);
    assert.deepEqual(waiting.waitingCondition?.evidenceIds, [proposed.evidenceId]);
    assert.equal(waiting.currentFocus, null);
    assert.equal((await value.client.listActionableObjects()).objects.length, 0);
    assert.equal((await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid })).projection?.waitingCondition?.description, "等待网络组分配 VLAN 和网关信息");
    assert.equal(value.graph.naturalContent(value.source.graphId, value.source.sourceBlockUuid), "配置生产服务器网络");
    const undone = await undo(value, committed.commit.id, "enter");
    const restored = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(undone.commit.compensationFor, committed.commit.id);
    assert.equal(restored.engagement, "ACTIONABLE");
    assert.equal(restored.waitingCondition, null);
    assert.deepEqual((await value.client.listActionableObjects()).objects.map((item) => item.id), [value.workObjectId]);
    assert.deepEqual((await value.client.listFeedback()).feedback.map((item) => item.type), ["ACCEPTED", "UNDONE_AFTER_APPLY"]);
  } finally { await value.service.close(); }
});

test("Fake Agent reconciles WAITING to ACTIONABLE and Undo restores the exact original WaitingCondition", async () => {
  const value = await setup("leave");
  try {
    const enter = await reconcile(value, "leave-enter", "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    const entered = await complete(value, enter.pending!);
    const originalCondition = (await value.client.showObject(value.workObjectId)).object.waitingCondition;
    const leave = await reconcile(value, "leave", "VLAN 310、网关和地址规划已经由网络组确认。");
    assert.equal(leave.run.revision?.transition.to, "ACTIONABLE");
    const left = await complete(value, leave.pending!);
    assert.equal((await value.client.showObject(value.workObjectId)).object.waitingCondition, null);
    assert.deepEqual((await value.client.listActionableObjects()).objects.map((item) => item.id), [value.workObjectId]);
    await undo(value, left.commit.id, "leave");
    const restored = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(restored.engagement, "WAITING");
    assert.deepEqual(restored.waitingCondition, originalCondition);
    assert.equal(value.service.store.getCommit(entered.commit.id)?.status, "COMMITTED");
  } finally { await value.service.close(); }
});

test("ordinary plans, unresolved waiting, and parking language produce durable NO_PROPOSAL with zero mutation", async () => {
  const value = await setup("no-proposal");
  try {
    const before = await value.client.showObject(value.workObjectId);
    const plan = await reconcile(value, "plan", "明天继续写实施方案。");
    assert.equal(plan.run.run.result.outcome, "NO_PROPOSAL");
    const parked = await reconcile(value, "parked", "这个项目先放到下季度再做。");
    assert.equal(parked.run.run.reasonCode, "PARKING_REQUIRES_USER_DECISION");
    assert.equal(parked.pending, null);
    assert.deepEqual((await value.client.showObject(value.workObjectId)).object, before.object);
    assert.equal(value.service.store.listCommits().length, 1);
  } finally { await value.service.close(); }
});

test("stale Evidence invalidates an Engagement Proposal before any Commit", async () => {
  const value = await setup("stale-evidence");
  try {
    const proposed = await reconcile(value, "stale-evidence", "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    assert.ok(proposed.pending);
    // Build another proposal so mutation happens before apply rather than after prepare.
    const value2 = await setup("stale-before-apply");
    try {
      const blockUuid = "evidence-block-stale-before"; const evidenceId = "evidence-stale-before";
      value2.graph.seedNaturalRecord(value2.source.graphId, blockUuid, "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
      await value2.client.freezeEvidence({ evidenceId, workObjectId: value2.workObjectId, snapshot: await value2.graph.readEvidenceMaterial({ graphId: value2.source.graphId, blockUuid }, value2.service.graphSnapshotKey) });
      const run = await value2.client.runEngagementAgent({ runId: "run-stale-before", workObjectId: value2.workObjectId, evidenceIds: [evidenceId], snapshot: await value2.graph.readGraphSnapshot({ graphId: value2.source.graphId, sourceBlockUuid: value2.source.sourceBlockUuid }) });
      value2.graph.editNaturalContent(value2.source.graphId, blockUuid, "网络组已分配 VLAN。");
      await assert.rejects(value2.client.applyProposal(run.proposal!.id, { operationId: "apply-stale-before", snapshot: await value2.graph.readGraphSnapshot({ graphId: value2.source.graphId, sourceBlockUuid: value2.source.sourceBlockUuid }), evidence: [{ evidenceId, ...await value2.graph.readEvidenceMaterial({ graphId: value2.source.graphId, blockUuid }, value2.service.graphSnapshotKey) }] }), /PROPOSAL_EVIDENCE_STALE/u);
      assert.equal((await value2.client.showProposal(run.proposal!.id)).proposal.status, "INVALIDATED");
      assert.equal(value2.service.store.listCommits().length, 1);
    } finally { await value2.service.close(); }
  } finally { await value.service.close(); }
});

test("stale target and Graph race fail closed; later semantic change blocks old Engagement Undo", async () => {
  const stale = await setup("stale-target");
  try {
    const blockUuid = "evidence-block-stale-target"; const evidenceId = "evidence-stale-target";
    stale.graph.seedNaturalRecord(stale.source.graphId, blockUuid, "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    await stale.client.freezeEvidence({ evidenceId, workObjectId: stale.workObjectId, snapshot: await stale.graph.readEvidenceMaterial({ graphId: stale.source.graphId, blockUuid }, stale.service.graphSnapshotKey) });
    const run = await stale.client.runEngagementAgent({ runId: "run-stale-target", workObjectId: stale.workObjectId, evidenceIds: [evidenceId], snapshot: await stale.graph.readGraphSnapshot({ graphId: stale.source.graphId, sourceBlockUuid: stale.source.sourceBlockUuid }) });
    const snapshot = await stale.graph.readGraphSnapshot({ graphId: stale.source.graphId, sourceBlockUuid: stale.source.sourceBlockUuid });
    const renamed = await stale.client.prepare(parseSemanticOperation({ operationId: "later-rename", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: stale.workObjectId, expectedVersion: 1, expectedProjectionHash: snapshot.projection!.projectionHash }, input: { title: "配置核心生产服务器网络" } }), snapshot);
    await complete(stale, renamed);
    await assert.rejects(stale.client.applyProposal(run.proposal!.id, { operationId: "apply-stale-target", snapshot: await stale.graph.readGraphSnapshot({ graphId: stale.source.graphId, sourceBlockUuid: stale.source.sourceBlockUuid }), evidence: [{ evidenceId, ...await stale.graph.readEvidenceMaterial({ graphId: stale.source.graphId, blockUuid }, stale.service.graphSnapshotKey) }] }), /PROPOSAL_TARGET_STALE/u);
  } finally { await stale.service.close(); }

  const race = await setup("graph-race");
  try {
    const proposed = await reconcile(race, "graph-race", "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    race.graph.editManagedProjection(race.source.graphId, race.source.sourceBlockUuid, "用户修改的标题");
    await assert.rejects(race.graph.applyGraphEffect(proposed.pending!.graphEffect as GraphEffect), /GRAPH_ENGAGEMENT_PRECONDITION_FAILED/u);
    const failed = await race.client.failGraphApply(proposed.pending!.commit.id, "GRAPH_ENGAGEMENT_PRECONDITION_FAILED");
    assert.equal(failed.commit.status, "RECOVERY_REQUIRED");
  } finally { await race.service.close(); }

  const later = await setup("later-edit");
  try {
    const proposed = await reconcile(later, "later-edit", "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    const committed = await complete(later, proposed.pending!);
    const snapshot = await later.graph.readGraphSnapshot({ graphId: later.source.graphId, sourceBlockUuid: later.source.sourceBlockUuid });
    const renamed = await later.client.prepare(parseSemanticOperation({ operationId: "rename-after-waiting", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: later.workObjectId, expectedVersion: 2, expectedProjectionHash: snapshot.projection!.projectionHash }, input: { title: "配置核心生产服务器网络" } }), snapshot);
    await complete(later, renamed);
    await assert.rejects(later.client.prepareUndo(committed.commit.id, { operationId: "undo-old-engagement", actor: { type: "USER", id: "local-user" }, snapshot: await later.graph.readGraphSnapshot({ graphId: later.source.graphId, sourceBlockUuid: later.source.sourceBlockUuid }) }), /UNDO_TARGET_CHANGED/u);
  } finally { await later.service.close(); }
});

test("Graph apply throw remains KERNEL_APPLIED and restart-visible instead of claiming WAITING success", async () => {
  const value = await setup("graph-throw");
  try {
    const proposed = await reconcile(value, "graph-throw", "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    value.graph.failNextApply();
    await assert.rejects(value.graph.applyGraphEffect(proposed.pending!.graphEffect as GraphEffect), /FAKE_GRAPH_APPLY_FAILURE/u);
    const failed = await value.client.failGraphApply(proposed.pending!.commit.id, "FAKE_GRAPH_APPLY_FAILURE");
    assert.equal(failed.commit.status, "KERNEL_APPLIED");
    assert.equal((await value.client.listRecovery()).recovery.find((item) => item.commit.id === failed.commit.id)?.action, "RESUME_GRAPH_APPLY");
  } finally { await value.service.close(); }
});

test("new directly bound Evidence invalidates an older Engagement judgment", async () => {
  const value = await setup("new-context");
  try {
    const blockUuid = "evidence-block-old"; const evidenceId = "evidence-old";
    value.graph.seedNaturalRecord(value.source.graphId, blockUuid, "网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。");
    await value.client.freezeEvidence({ evidenceId, workObjectId: value.workObjectId, snapshot: await value.graph.readEvidenceMaterial({ graphId: value.source.graphId, blockUuid }, value.service.graphSnapshotKey) });
    const run = await value.client.runEngagementAgent({ runId: "run-old-context", workObjectId: value.workObjectId, evidenceIds: [evidenceId], snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
    value.graph.seedNaturalRecord(value.source.graphId, "new-direct-block", "VLAN 已经分配。");
    await value.client.freezeEvidence({ evidenceId: "evidence-new", workObjectId: value.workObjectId, snapshot: await value.graph.readEvidenceMaterial({ graphId: value.source.graphId, blockUuid: "new-direct-block" }, value.service.graphSnapshotKey) });
    await assert.rejects(value.client.applyProposal(run.proposal!.id, { operationId: "apply-old-context", snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }), evidence: [{ evidenceId, ...await value.graph.readEvidenceMaterial({ graphId: value.source.graphId, blockUuid }, value.service.graphSnapshotKey) }] }), /PROPOSAL_CONTEXT_STALE/u);
    assert.equal(value.service.store.listCommits().length, 1);
  } finally { await value.service.close(); }
});

test("wrong Engagement Skill is rejected and malformed output leaves FAILED receipt", async () => {
  const wrongSkill = { id: "engagement-reconciliation", version: "0.1.0", contentHash: "a".repeat(64), manifest: { id: "engagement-reconciliation", version: "0.1.0", operation: "CHANGE_ENGAGEMENT", risk: "LOW" }, policy: "changed", schema: {}, examples: [], eval: [] } satisfies SkillPackage;
  const wrong = await setup("wrong-engagement-skill", { engagementSkill: wrongSkill });
  try {
    wrong.graph.seedNaturalRecord(wrong.source.graphId, "wrong-block", "网络组还没有分配 VLAN，需要等确认后才能继续。");
    await wrong.client.freezeEvidence({ evidenceId: "wrong-evidence", workObjectId: wrong.workObjectId, snapshot: await wrong.graph.readEvidenceMaterial({ graphId: wrong.source.graphId, blockUuid: "wrong-block" }, wrong.service.graphSnapshotKey) });
    await assert.rejects(wrong.client.runEngagementAgent({ runId: "wrong-run", workObjectId: wrong.workObjectId, evidenceIds: ["wrong-evidence"], snapshot: await wrong.graph.readGraphSnapshot({ graphId: wrong.source.graphId, sourceBlockUuid: wrong.source.sourceBlockUuid }) }), /SKILL_NOT_APPROVED/u);
  } finally { await wrong.service.close(); }

  const malformedAgent: EngagementAgent = { id: "malformed-engagement", propose: async () => ({ outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "PARKED" }, reasonCode: "BAD", rationaleSummary: "bad" } as never) };
  const malformed = await setup("malformed-engagement", { engagementAgent: malformedAgent });
  try {
    malformed.graph.seedNaturalRecord(malformed.source.graphId, "malformed-block", "网络组还没有分配 VLAN，需要等确认后才能继续。");
    await malformed.client.freezeEvidence({ evidenceId: "malformed-evidence", workObjectId: malformed.workObjectId, snapshot: await malformed.graph.readEvidenceMaterial({ graphId: malformed.source.graphId, blockUuid: "malformed-block" }, malformed.service.graphSnapshotKey) });
    await assert.rejects(malformed.client.runEngagementAgent({ runId: "malformed-run", workObjectId: malformed.workObjectId, evidenceIds: ["malformed-evidence"], snapshot: await malformed.graph.readGraphSnapshot({ graphId: malformed.source.graphId, sourceBlockUuid: malformed.source.sourceBlockUuid }) }), /AGENT_RESULT_INVALID/u);
    assert.equal((await malformed.client.showAgentRun("malformed-run")).run.result.outcome, "FAILED");
  } finally { await malformed.service.close(); }
});

test("wrong-operation Agent output is rejected and durably recorded as FAILED", async () => {
  const wrongOperationAgent: EngagementAgent = { id: "wrong-operation-engagement", propose: async () => ({ outcome: "PROPOSAL", operationType: "SET_CURRENT_FOCUS", transition: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待网络组分配 VLAN", reviewAt: null } }, reasonCode: "WRONG_OPERATION", rationaleSummary: "wrong operation" } as never) };
  const value = await setup("wrong-operation", { engagementAgent: wrongOperationAgent });
  try {
    value.graph.seedNaturalRecord(value.source.graphId, "wrong-operation-block", "网络组还没有分配 VLAN，需要等确认后才能继续。");
    await value.client.freezeEvidence({ evidenceId: "wrong-operation-evidence", workObjectId: value.workObjectId, snapshot: await value.graph.readEvidenceMaterial({ graphId: value.source.graphId, blockUuid: "wrong-operation-block" }, value.service.graphSnapshotKey) });
    await assert.rejects(value.client.runEngagementAgent({ runId: "wrong-operation-run", workObjectId: value.workObjectId, evidenceIds: ["wrong-operation-evidence"], snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) }), /AGENT_RESULT_INVALID/u);
    assert.equal((await value.client.showAgentRun("wrong-operation-run")).run.result.outcome, "FAILED");
    assert.equal(value.service.store.listCommits().length, 1);
  } finally { await value.service.close(); }
});
