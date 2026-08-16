import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, type GraphEffect, type SemanticOperation } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-13T10:00:00.000Z";

async function setup(label: string, content = "TODO 确认防火墙开放 443", kind: "TASK" | "MINI_PROJECT" | "PROJECT" = "TASK") {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase5-${label}-`));
  const service = await startKernelServer({ requireTrustedUserChannel: false,  databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", now: () => at });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at);
  const source = graph.seedNaturalRecord("graph-phase5", `source-${label}`, content);
  const pending = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title: content.replace(/^TODO\s+/u, ""), anchor: { graphId: source.graphId, blockUuid: source.sourceBlockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(pending.graphEffect as GraphEffect);
  await client.complete(pending.commit.id, result, await graph.readGraphSnapshot({ graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid }));
  return { service, client, graph, source, workObjectId: pending.commit.targetId! };
}

async function apply(value: Awaited<ReturnType<typeof setup>>, operation: SemanticOperation) {
  const snapshot = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
  const pending = await value.client.prepare(operation, snapshot);
  const result = await value.graph.applyGraphEffect(pending.graphEffect as GraphEffect);
  return value.client.complete(pending.commit.id, result, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
}

function target(value: Awaited<ReturnType<typeof setup>>, version: number, hash: string) { return { workObjectId: value.workObjectId, expectedVersion: version, expectedProjectionHash: hash }; }

test("one USER action completes a Task, writes an immutable CompletionRecord, changes TODO to DONE, and Undo restores exact open state", async () => {
  const value = await setup("complete");
  try {
    const before = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    const completed = await apply(value, parseSemanticOperation({ operationId: "complete-task", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 1, before.projection!.projectionHash), input: { outcomeSummary: "确认防火墙开放 443", evidenceIds: [] } }));
    const object = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(completed.commit.status, "COMMITTED"); assert.equal(object.lifecycle, "COMPLETED"); assert.equal(object.engagement, null); assert.equal(object.currentFocus, null);
    assert.equal((await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid })).sourceMarker, "DONE");
    assert.equal(value.service.store.getClosureHistory(value.workObjectId).current?.type, "COMPLETED");
    assert.equal(value.service.store.getClosureHistory(value.workObjectId).current?.record.createdBy.type, "USER");
    assert.equal((await value.client.listActionableObjects()).objects.length, 0);
    await assert.rejects(apply(value, parseSemanticOperation({ operationId: "double-complete", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 2, (await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid })).projection!.projectionHash), input: { outcomeSummary: "重复", evidenceIds: [] } })), /CLOSURE_LIFECYCLE_INVALID/u);
    const undo = await value.client.prepareUndo(completed.commit.id, { operationId: "undo-complete", actor: { type: "USER", id: "local-user" }, snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
    const undoResult = await value.graph.applyGraphEffect(undo.graphEffect as GraphEffect); await value.client.complete(undo.commit.id, undoResult, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
    assert.equal((await value.client.showObject(value.workObjectId)).object.lifecycle, "OPEN"); assert.equal(value.service.store.getClosureHistory(value.workObjectId).current, null); assert.equal(value.service.store.getClosureHistory(value.workObjectId).completions.length, 1); assert.equal((await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid })).sourceMarker, "TODO");
  } finally { await value.service.close(); }
});

test("marker labels are not copied into the formal Task title or generated completion summary", async () => {
  const value = await setup("marker-title");
  try {
    const object = (await value.client.showObject(value.workObjectId)).object;
    // The real Plugin strips the natural workflow marker before issuing CREATE.
    assert.equal(object.title, "确认防火墙开放 443");
  } finally { await value.service.close(); }
});

test("Cancellation, Reopen, and Amendment are USER-only records with distinct current semantics", async () => {
  const value = await setup("governance");
  try {
    const initial = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    for (const actor of [{ type: "AGENT", id: "agent" }, { type: "SYSTEM", id: "system" }] as const) {
      const forbidden = [
        { type: "COMPLETE_WORK_OBJECT", input: { outcomeSummary: "不得自动完成", evidenceIds: [] } },
        { type: "CANCEL_WORK_OBJECT", input: { reason: "不得自动取消", replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [] } },
        { type: "REOPEN_WORK_OBJECT", input: { reason: "不得自动重开" } },
        { type: "AMEND_CLOSURE", input: { targetClosureRecordId: "unknown", reason: "不得自动修订", replacementOutcomeSummary: "x", replacementCancellationReason: null, addEvidenceIds: [] } },
      ] as const;
      for (const [index, candidate] of forbidden.entries()) await assert.rejects(value.client.prepare(parseSemanticOperation({ operationId: `forbidden-${actor.type}-${index}`, type: candidate.type, actor, target: target(value, 1, initial.projection!.projectionHash), input: candidate.input }), initial), /ACTOR_NOT_AUTHORIZED/u);
    }
    assert.equal(value.service.store.listCommits().length, 1);
    const cancelled = await apply(value, parseSemanticOperation({ operationId: "cancel-task", type: "CANCEL_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 1, initial.projection!.projectionHash), input: { reason: "业务方取消需求", replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [] } }));
    let history = value.service.store.getClosureHistory(value.workObjectId); assert.equal(history.current?.type, "CANCELLED"); assert.equal(history.cancellations.length, 1); assert.equal((await value.client.showObject(value.workObjectId)).object.lifecycle, "CANCELLED");
    const closureId = history.current!.record.id; const cancelledSnapshot = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    await assert.rejects(value.client.prepare(parseSemanticOperation({ operationId: "amend-wrong-id", type: "AMEND_CLOSURE", actor: { type: "USER", id: "local-user" }, target: target(value, 2, cancelledSnapshot.projection!.projectionHash), input: { targetClosureRecordId: "wrong-closure", reason: "错误目标", replacementOutcomeSummary: null, replacementCancellationReason: "错误", addEvidenceIds: [] } }), cancelledSnapshot), /CLOSURE_AMENDMENT_TARGET_INVALID/u);
    await apply(value, parseSemanticOperation({ operationId: "amend-cancel", type: "AMEND_CLOSURE", actor: { type: "USER", id: "local-user" }, target: target(value, 2, cancelledSnapshot.projection!.projectionHash), input: { targetClosureRecordId: closureId, reason: "原原因不准确", replacementOutcomeSummary: null, replacementCancellationReason: "业务方向发生变化", addEvidenceIds: [] } }));
    history = value.service.store.getClosureHistory(value.workObjectId); assert.equal(history.current?.type === "CANCELLED" ? history.current.reason : null, "业务方向发生变化"); assert.equal(history.cancellations[0]?.reason, "业务方取消需求");
    const amendedSnapshot = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    await assert.rejects(value.client.prepareUndo(cancelled.commit.id, { operationId: "unsafe-old-undo", actor: { type: "USER", id: "local-user" }, snapshot: amendedSnapshot }), /UNDO_TARGET_CHANGED/u);
    await assert.rejects(value.client.prepare(parseSemanticOperation({ operationId: "stale-reopen", type: "REOPEN_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 2, amendedSnapshot.projection!.projectionHash), input: { reason: "旧版本" } }), amendedSnapshot), /WORK_OBJECT_VERSION_MISMATCH/u);
    await apply(value, parseSemanticOperation({ operationId: "reopen-task", type: "REOPEN_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 3, amendedSnapshot.projection!.projectionHash), input: { reason: "业务需求恢复" } }));
    history = value.service.store.getClosureHistory(value.workObjectId); assert.equal(history.current, null); assert.equal(history.reopens.length, 1); assert.equal((await value.client.showObject(value.workObjectId)).object.engagement, "ACTIONABLE"); assert.deepEqual((await value.client.listActionableObjects()).objects.map((item) => item.id), [value.workObjectId]); assert.equal(cancelled.commit.governance, null); assert.deepEqual((await value.client.listFeedback()).feedback, []);
  } finally { await value.service.close(); }
});

test("Graph failure and marker race never become Closure success", async () => {
  const failed = await setup("graph-throw");
  try {
    const snapshot = await failed.graph.readGraphSnapshot({ graphId: failed.source.graphId, sourceBlockUuid: failed.source.sourceBlockUuid }); const pending = await failed.client.prepare(parseSemanticOperation({ operationId: "complete-fail", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(failed, 1, snapshot.projection!.projectionHash), input: { outcomeSummary: "完成", evidenceIds: [] } }), snapshot);
    failed.graph.failNextApply(); await assert.rejects(failed.graph.applyGraphEffect(pending.graphEffect as GraphEffect), /FAKE_GRAPH_APPLY_FAILURE/u); const receipt = await failed.client.failGraphApply(pending.commit.id, "FAKE_GRAPH_APPLY_FAILURE"); assert.equal(receipt.commit.status, "KERNEL_APPLIED"); assert.equal((await failed.client.listRecovery()).recovery[0]?.action, "RESUME_GRAPH_APPLY");
    assert.equal(failed.service.store.getClosureHistory(failed.workObjectId).completions.length, 0);
  } finally { await failed.service.close(); }
  const race = await setup("marker-race");
  try {
    const snapshot = await race.graph.readGraphSnapshot({ graphId: race.source.graphId, sourceBlockUuid: race.source.sourceBlockUuid }); const pending = await race.client.prepare(parseSemanticOperation({ operationId: "complete-race", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(race, 1, snapshot.projection!.projectionHash), input: { outcomeSummary: "完成", evidenceIds: [] } }), snapshot);
    race.graph.editMarker(race.source.graphId, race.source.sourceBlockUuid, "DOING"); await assert.rejects(race.graph.applyGraphEffect(pending.graphEffect as GraphEffect), /GRAPH_MARKER_PRECONDITION_FAILED/u); const receipt = await race.client.failGraphApply(pending.commit.id, "GRAPH_MARKER_PRECONDITION_FAILED"); assert.equal(receipt.commit.status, "RECOVERY_REQUIRED"); assert.equal(race.graph.naturalContent(race.source.graphId, race.source.sourceBlockUuid), "DOING 确认防火墙开放 443");
  } finally { await race.service.close(); }
  const cancelFailure = await setup("cancel-graph-throw");
  try {
    const snapshot = await cancelFailure.graph.readGraphSnapshot({ graphId: cancelFailure.source.graphId, sourceBlockUuid: cancelFailure.source.sourceBlockUuid });
    const pending = await cancelFailure.client.prepare(parseSemanticOperation({ operationId: "cancel-fail", type: "CANCEL_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(cancelFailure, 1, snapshot.projection!.projectionHash), input: { reason: "取消", replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [] } }), snapshot);
    cancelFailure.graph.failNextApply(); await assert.rejects(cancelFailure.graph.applyGraphEffect(pending.graphEffect as GraphEffect), /FAKE_GRAPH_APPLY_FAILURE/u);
    assert.equal((await cancelFailure.client.failGraphApply(pending.commit.id, "FAKE_GRAPH_APPLY_FAILURE")).commit.status, "KERNEL_APPLIED");
  } finally { await cancelFailure.service.close(); }
});

test("an online TODO to DONE observation enters the same USER completion transaction", async () => {
  const value = await setup("observed-done");
  try {
    value.graph.editMarker(value.source.graphId, value.source.sourceBlockUuid, "DONE");
    const observed = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    const result = await apply(value, parseSemanticOperation({ operationId: "observed-done-command", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 1, observed.projection!.projectionHash), input: { outcomeSummary: "确认防火墙开放 443", evidenceIds: [] } }));
    assert.equal(result.commit.status, "COMMITTED"); assert.equal((await value.client.showObject(value.workObjectId)).object.lifecycle, "COMPLETED"); assert.equal((await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid })).sourceMarker, "DONE");
  } finally { await value.service.close(); }
});

test("Kernel rejects MiniProject and Project Closure in Phase 5", async () => {
  for (const kind of ["MINI_PROJECT", "PROJECT"] as const) {
    const value = await setup(`task-only-${kind}`, "TODO 不得关闭父对象", kind);
    try {
      const snapshot = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
      await assert.rejects(value.client.prepare(parseSemanticOperation({ operationId: `reject-${kind}`, type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 1, snapshot.projection!.projectionHash), input: { outcomeSummary: "不得关闭", evidenceIds: [] } }), snapshot), /TASK_CLOSURE_KIND_UNSUPPORTED/u);
    } finally { await value.service.close(); }
  }
});

test("completing a WAITING focused Task and Undo restore the exact open state while later writes block old Undo", async () => {
  const value = await setup("waiting-undo");
  try {
    const first = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    const focusPending = await value.client.prepare(parseSemanticOperation({ operationId: "focus-user-test", type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: "fake-current-focus-agent" }, target: target(value, 1, first.projection!.projectionHash), input: { currentFocus: "跟进业务验收" }, evidenceDependencies: [{ evidenceId: "missing", contentHash: "a".repeat(64) }] }), first).catch(() => null);
    assert.equal(focusPending, null, "generic Agent entry remains forbidden");
    const object = value.service.store.getWorkObject(value.workObjectId)!;
    value.service.store.putWorkObject({ ...object, engagement: "WAITING", waitingCondition: { workObjectId: object.id, description: "等待业务验收", since: at, reviewAt: null, evidenceIds: ["evidence-wait"] }, currentFocus: "跟进业务验收", version: 3 });
    const anchor = value.service.store.getAnchorForWorkObject(value.workObjectId)!;
    const projection = first.projection!; const waitingCore = { containerUuid: projection.containerUuid, titleUuid: projection.titleUuid, stateUuid: projection.stateUuid, focusUuid: projection.focusUuid, waitingUuid: projection.waitingUuid, outcomeUuid: projection.outcomeUuid, completionUuid: projection.completionUuid, title: projection.title, lifecycle: "OPEN" as const, engagement: "WAITING" as const, waitingCondition: { workObjectId: object.id, description: "等待业务验收", since: at, reviewAt: null, evidenceIds: ["evidence-wait"] }, currentFocus: "跟进业务验收", desiredOutcome: projection.desiredOutcome, completionChecks: projection.completionChecks };
    const waitingEffect = { type: "UPSERT_MANAGED_PROJECTION", commitId: "seed", effectId: "seed", graphId: anchor.graphId, sourceBlockUuid: anchor.externalId, projection: { ...waitingCore, projectionHash: (await import("@task-copilot/contracts")).stableHash(waitingCore) } } as const;
    const state = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    // Converge through a real Engagement effect so the Graph matches the seeded Kernel state.
    const enter = { type: "CHANGE_ENGAGEMENT_FIELDS", commitId: "seed-wait", effectId: "seed-wait", graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid, containerUuid: projection.containerUuid, stateUuid: projection.stateUuid, waitingUuid: projection.waitingUuid, engagement: "WAITING", waiting: waitingCore.waitingCondition, expectedProjectionHash: state.projection!.projectionHash, resultingProjectionHash: waitingEffect.projection.projectionHash } satisfies GraphEffect;
    await value.graph.applyGraphEffect(enter);
    const currentProjection = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    // Focus is represented in the resulting hash and effect as a separate stable managed field.
    const focusCore = { ...waitingCore }; const focusHash = (await import("@task-copilot/contracts")).stableHash(focusCore);
    if (currentProjection.projection!.projectionHash !== focusHash) await value.graph.applyGraphEffect({ type: "SET_CURRENT_FOCUS_FIELD", commitId: "seed-focus", effectId: "seed-focus", graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid, containerUuid: projection.containerUuid, fieldUuid: projection.focusUuid, content: "跟进业务验收", expectedProjectionHash: currentProjection.projection!.projectionHash, resultingProjectionHash: focusHash });
    const before = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    const completed = await apply(value, parseSemanticOperation({ operationId: "complete-waiting", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: target(value, 3, before.projection!.projectionHash), input: { outcomeSummary: "业务验收完成", evidenceIds: [] } }));
    const undo = await value.client.prepareUndo(completed.commit.id, { operationId: "undo-waiting-complete", actor: { type: "USER", id: "local-user" }, snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
    const result = await value.graph.applyGraphEffect(undo.graphEffect as GraphEffect); await value.client.complete(undo.commit.id, result, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
    const restored = (await value.client.showObject(value.workObjectId)).object; assert.equal(restored.engagement, "WAITING"); assert.equal(restored.currentFocus, "跟进业务验收"); assert.deepEqual(restored.waitingCondition, waitingCore.waitingCondition);
  } finally { await value.service.close(); }
});
