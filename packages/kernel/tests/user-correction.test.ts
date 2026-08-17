import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseSemanticOperation } from "@task-copilot/contracts";
import { SqliteStore } from "@task-copilot/sqlite";
import { Kernel, KernelError } from "../src/index.ts";
import { parseUserCorrectionUtterance } from "../src/user-correction.ts";

const at = "2026-08-17T00:00:00.000Z";
const sourceSnapshot = { graphId: "graph-01", sourceBlockUuid: "source-01", sourceContentHash: "a1b2c3d4", projection: null } as const;

function createTask(store: SqliteStore, kernel: Kernel, id = "task-1", title = "联系厂商确认版本"): { workObjectId: string; projection: { projectionHash: string } } {
  const operation = parseSemanticOperation({ operationId: `create-${id}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title, anchor: { graphId: "graph-01", blockUuid: "source-01", sourceContentHash: "a1b2c3d4" } } });
  const prepared = kernel.prepare(operation, sourceSnapshot);
  if (prepared.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("expected upsert");
  const projection = prepared.graphEffect.projection;
  kernel.complete(prepared.commit.id, { commitId: prepared.graphEffect.commitId, effectId: prepared.graphEffect.effectId, effectType: prepared.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: projection.projectionHash, appliedAt: at }, { ...sourceSnapshot, projection });
  return { workObjectId: prepared.commit.targetId!, projection };
}

test("parseUserCorrectionUtterance maps natural language to governed operations", () => {
  const waitingObject = { id: "task-1", kind: "TASK" as const, title: "联系厂商", lifecycle: "OPEN" as const, engagement: "WAITING" as const, waitingCondition: { workObjectId: "task-1", description: "等厂商", since: at, reviewAt: null, evidenceIds: [] }, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 2, createdAt: at, updatedAt: at };
  const actionable = parseUserCorrectionUtterance(waitingObject, "不是，我还可以继续本地测试");
  assert.equal(actionable?.operationType, "CHANGE_ENGAGEMENT");
  if (actionable?.operationType === "CHANGE_ENGAGEMENT") {
    assert.equal(actionable.input.to, "ACTIONABLE");
    assert.equal(actionable.input.waiting, null);
  }

  const openObject = { ...waitingObject, engagement: "ACTIONABLE" as const, waitingCondition: null };
  const waiting = parseUserCorrectionUtterance(openObject, "现在要等厂商回复");
  assert.equal(waiting?.operationType, "CHANGE_ENGAGEMENT");
  if (waiting?.operationType === "CHANGE_ENGAGEMENT") {
    assert.equal(waiting.input.to, "WAITING");
    assert.ok(waiting.input.waiting?.description.includes("厂商回复"));
  }

  const focus = parseUserCorrectionUtterance(openObject, "当前推进是核对交换机参数");
  assert.equal(focus?.operationType, "SET_CURRENT_FOCUS");
  if (focus?.operationType === "SET_CURRENT_FOCUS") assert.equal(focus.input.currentFocus, "核对交换机参数");
});

test("applyUserRealityCorrection creates a USER decision and fixes Formal Memory", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const { workObjectId } = createTask(store, kernel);
  const content = "用户说：不是，我还可以继续本地测试";
  const contentHash = createHash("sha256").update(content).digest("hex");
  store.putEvidence({ id: "evidence-correction", workObjectId, sourceType: "LOGSEQ_BLOCK", graphId: "graph-01", externalId: "source-01", frozenContent: content, contentHash, frozenAt: at, locator: { graphId: "graph-01", blockUuid: "source-01" } });
  // Simulate Agent's wrong WAITING state through a formal engagement change.
  const expectedProjectionHash = kernel.targetSnapshotInput(workObjectId).expectedProjection!.projectionHash;
  const op = parseSemanticOperation({ operationId: "wrong-waiting", type: "CHANGE_ENGAGEMENT", actor: { type: "USER", id: "local-user" }, target: { workObjectId, expectedVersion: 1, expectedProjectionHash }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等厂商回复", reviewAt: null, evidenceIds: ["evidence-correction"] } }, evidenceDependencies: [{ evidenceId: "evidence-correction", contentHash }] });
  const prepared = kernel.commitFormal(op, null);
  const effect = prepared.graphEffect;
  if (effect.type !== "CHANGE_ENGAGEMENT_FIELDS") throw new Error("expected engagement effect");
  kernel.verifyFormalProjection(prepared.commit.id, { commitId: prepared.commit.id, effectId: effect.effectId, effectType: effect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: effect.resultingProjectionHash!, appliedAt: at }, { graphId: "graph-01", sourceBlockUuid: "source-01", sourceContentHash: "a1b2c3d4", projection: effect.resultingProjection ?? null, sourceMarker: null });

  assert.equal(store.getWorkObject(workObjectId)?.engagement, "WAITING");
  const corrected = kernel.applyUserRealityCorrection({ workObjectId, utterance: "不是，我还可以继续本地测试", evidenceId: "evidence-correction", evidenceContentHash: contentHash });
  assert.equal(corrected.decision.operationType, "CHANGE_ENGAGEMENT");
  assert.equal(corrected.decision.exactUserUtterance, "不是，我还可以继续本地测试");
  assert.equal(corrected.commit.actor.type, "USER");
  assert.equal(store.getWorkObject(workObjectId)?.engagement, "ACTIONABLE");
  assert.equal(store.getWorkObject(workObjectId)?.waitingCondition, null);
  assert.ok(store.listUserDecisions().some((decision) => decision.id === corrected.decision.id));
  store.close();
});

test("applyUserRealityCorrection rejects unsupported utterances without mutating", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const { workObjectId } = createTask(store, kernel);
  const content = "随便聊聊";
  const contentHash = createHash("sha256").update(content).digest("hex");
  store.putEvidence({ id: "evidence-chat", workObjectId, sourceType: "LOGSEQ_BLOCK", graphId: "graph-01", externalId: "source-01", frozenContent: content, contentHash, frozenAt: at, locator: { graphId: "graph-01", blockUuid: "source-01" } });
  assert.throws(() => kernel.applyUserRealityCorrection({ workObjectId, utterance: "随便聊聊", evidenceId: "evidence-chat", evidenceContentHash: contentHash }), (error) => error instanceof KernelError && error.code === "USER_CORRECTION_NEEDS_CLARIFICATION");
  assert.equal(store.getWorkObject(workObjectId)?.engagement, "ACTIONABLE");
  store.close();
});
