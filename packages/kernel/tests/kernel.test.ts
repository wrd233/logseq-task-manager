import assert from "node:assert/strict";
import test from "node:test";

import { parseSemanticOperation } from "@task-copilot/contracts";
import { SqliteStore } from "@task-copilot/sqlite";
import { Kernel, KernelError } from "../src/index.ts";

const at = "2026-08-12T00:00:00.000Z";
const operation = () => parseSemanticOperation({
  operationId: "operation-01", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" },
  input: { kind: "TASK", title: "确认交换机管理口地址", anchor: { graphId: "graph-01", blockUuid: "source-01", sourceContentHash: "a1b2c3d4" } },
});
const sourceSnapshot = { graphId: "graph-01", sourceBlockUuid: "source-01", sourceContentHash: "a1b2c3d4", projection: null } as const;

test("CREATE_WORK_OBJECT reaches success only after exact Graph verification", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const prepared = kernel.prepare(operation(), sourceSnapshot);

  assert.equal(prepared.commit.status, "KERNEL_APPLIED");
  assert.equal(store.listWorkObjects().length, 1);
  assert.equal(prepared.graphEffect.type, "UPSERT_MANAGED_PROJECTION");

  const projection = prepared.graphEffect.type === "UPSERT_MANAGED_PROJECTION" ? prepared.graphEffect.projection : null;
  const committed = kernel.complete(prepared.commit.id, {
    commitId: prepared.graphEffect.commitId, effectId: prepared.graphEffect.effectId,
    effectType: prepared.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: projection!.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection });
  assert.equal(committed.status, "COMMITTED");
  store.close();
});

test("a source hash mismatch fails closed and records RECOVERY_REQUIRED without current-state writes", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  assert.throws(
    () => kernel.prepare(operation(), { ...sourceSnapshot, sourceContentHash: "deadbeef" }),
    (error) => error instanceof KernelError && error.code === "SOURCE_CONTENT_HASH_MISMATCH",
  );
  assert.equal(store.listWorkObjects().length, 0);
  assert.equal(store.listRecovery()[0]?.status, "RECOVERY_REQUIRED");
  store.close();
});

test("crashes after durable stages are discoverable with explicit recovery actions", () => {
  for (const stage of ["PREPARED", "KERNEL_APPLIED"] as const) {
    const store = new SqliteStore(":memory:");
    const kernel = new Kernel(store, { now: () => at, afterStage: (current) => { if (current === stage) throw new Error(`crash-${stage}`); } });
    assert.throws(() => kernel.prepare(operation(), sourceSnapshot), new RegExp(`crash-${stage}`, "u"));
    assert.equal(new Kernel(store, { now: () => at }).recoveryList()[0]?.action, stage === "PREPARED" ? "ABORT_PREPARED" : "RESUME_GRAPH_APPLY");
    store.close();
  }
});

test("a crash after GRAPH_APPLIED is durable and restarts at verification", () => {
  const store = new SqliteStore(":memory:");
  let crashAtGraph = false;
  const kernel = new Kernel(store, { now: () => at, afterStage: (stage) => { if (stage === "GRAPH_APPLIED" && crashAtGraph) throw new Error("crash-GRAPH_APPLIED"); } });
  const prepared = kernel.prepare(operation(), sourceSnapshot);
  assert.equal(prepared.graphEffect.type, "UPSERT_MANAGED_PROJECTION");
  if (prepared.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("unexpected effect");
  const projection = prepared.graphEffect.projection;
  crashAtGraph = true;
  assert.throws(() => kernel.complete(prepared.commit.id, {
    commitId: prepared.graphEffect.commitId, effectId: prepared.graphEffect.effectId,
    effectType: "UPSERT_MANAGED_PROJECTION", graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: projection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection }), /crash-GRAPH_APPLIED/u);
  const restarted = new Kernel(store, { now: () => at });
  assert.equal(restarted.recoveryList()[0]?.action, "VERIFY_GRAPH");
  assert.equal(restarted.verifyRecoveredGraph(prepared.commit.id, { ...sourceSnapshot, projection }).status, "COMMITTED");
  store.close();
});

test("Undo is a compensation commit and refuses to delete a user-edited managed projection", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const prepared = kernel.prepare(operation(), sourceSnapshot);
  assert.equal(prepared.graphEffect.type, "UPSERT_MANAGED_PROJECTION");
  if (prepared.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("unexpected effect");
  const projection = prepared.graphEffect.projection;
  kernel.complete(prepared.commit.id, {
    commitId: prepared.graphEffect.commitId, effectId: prepared.graphEffect.effectId,
    effectType: prepared.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: projection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection });

  assert.throws(
    () => kernel.prepareUndo({ operationId: "undo-edited", actor: { type: "USER", id: "local-user" }, commitId: prepared.commit.id }, { ...sourceSnapshot, projection: { ...projection, title: "用户改过", projectionHash: "deadbeef" } }),
    (error) => error instanceof KernelError && error.code === "UNDO_GRAPH_CHANGED",
  );
  assert.equal(store.listWorkObjects().length, 1);

  const undo = kernel.prepareUndo({ operationId: "undo-01", actor: { type: "USER", id: "local-user" }, commitId: prepared.commit.id }, { ...sourceSnapshot, projection });
  assert.equal(undo.commit.compensationFor, prepared.commit.id);
  assert.equal(store.listWorkObjects().length, 0);
  const undone = kernel.complete(undo.commit.id, {
    commitId: undo.graphEffect.commitId, effectId: undo.graphEffect.effectId,
    effectType: "REMOVE_MANAGED_PROJECTION", graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: null, appliedAt: at,
  }, sourceSnapshot);
  assert.equal(undone.status, "COMMITTED");
  assert.equal(store.getCommit(prepared.commit.id)?.compensatedBy, undo.commit.id);
  store.close();
});

test("RENAME_WORK_OBJECT and its Undo are executable compensation commits with monotonic versions", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const created = kernel.prepare(operation(), sourceSnapshot);
  if (created.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("unexpected effect");
  const originalProjection = created.graphEffect.projection;
  kernel.complete(created.commit.id, {
    commitId: created.graphEffect.commitId, effectId: created.graphEffect.effectId,
    effectType: created.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: originalProjection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection: originalProjection });

  const object = store.listWorkObjects()[0]!;
  const renamed = kernel.prepare(parseSemanticOperation({
    operationId: "rename-01", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" },
    target: { workObjectId: object.id, expectedVersion: object.version, expectedProjectionHash: originalProjection.projectionHash },
    input: { title: "确认核心交换机地址" },
  }), { ...sourceSnapshot, projection: originalProjection });
  if (renamed.graphEffect.type !== "UPDATE_MANAGED_FIELD") throw new Error("unexpected effect");
  const renamedProjection = { ...originalProjection, title: "确认核心交换机地址", projectionHash: renamed.graphEffect.resultingProjectionHash };
  kernel.complete(renamed.commit.id, {
    commitId: renamed.graphEffect.commitId, effectId: renamed.graphEffect.effectId,
    effectType: renamed.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: renamedProjection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection: renamedProjection });

  const undo = kernel.prepareUndo({ operationId: "undo-rename-01", actor: { type: "USER", id: "local-user" }, commitId: renamed.commit.id }, { ...sourceSnapshot, projection: renamedProjection });
  if (undo.graphEffect.type !== "UPDATE_MANAGED_FIELD") throw new Error("unexpected effect");
  const restoredProjection = { ...renamedProjection, title: originalProjection.title, projectionHash: undo.graphEffect.resultingProjectionHash };
  const compensated = kernel.complete(undo.commit.id, {
    commitId: undo.graphEffect.commitId, effectId: undo.graphEffect.effectId,
    effectType: undo.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: restoredProjection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection: restoredProjection });

  assert.equal(compensated.status, "COMMITTED");
  assert.equal(store.listWorkObjects()[0]?.title, originalProjection.title);
  assert.equal(store.listWorkObjects()[0]?.version, 3);
  assert.equal(store.getCommit(renamed.commit.id)?.compensatedBy, undo.commit.id);
  store.close();
});

test("write authorization is bound to the configured local USER identity", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at, authorizedUserId: "owner-01" });
  for (const actor of [{ type: "SYSTEM", id: "owner-01" }, { type: "AGENT", id: "fake-current-focus-agent" }, { type: "USER", id: "someone-else" }] as const) {
    const candidate = parseSemanticOperation({
      operationId: `unauthorized-${actor.type}-${actor.id}`, type: "CREATE_WORK_OBJECT", actor,
      input: { kind: "TASK", title: "不得写入", anchor: { graphId: "graph-01", blockUuid: "source-01", sourceContentHash: "a1b2c3d4" } },
    });
    assert.throws(() => kernel.prepare(candidate, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  }
  assert.equal(store.listWorkObjects().length, 0);
  store.close();
});

test("generic preparation rejects every Agent operation, including rename and undo entry", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const rename = parseSemanticOperation({ operationId: "agent-rename", type: "RENAME_WORK_OBJECT", actor: { type: "AGENT", id: "agent" }, target: { workObjectId: "work-01", expectedVersion: 1, expectedProjectionHash: "a1b2c3d4" }, input: { title: "不得改名" } });
  const undo = parseSemanticOperation({ operationId: "agent-undo", type: "UNDO_COMMIT", actor: { type: "AGENT", id: "agent" }, target: { commitId: "commit-01", expectedProjectionHash: "a1b2c3d4" }, input: {} });
  const engagement = parseSemanticOperation({ operationId: "agent-engagement", type: "CHANGE_ENGAGEMENT", actor: { type: "AGENT", id: "fake-engagement-agent" }, target: { workObjectId: "work-01", expectedVersion: 1, expectedProjectionHash: "a1b2c3d4" }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待 VLAN", reviewAt: null, evidenceIds: ["evidence-1"] } }, evidenceDependencies: [{ evidenceId: "evidence-1", contentHash: "a".repeat(64) }] });
  assert.throws(() => kernel.prepare(rename, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  assert.throws(() => kernel.prepare(undo, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  assert.throws(() => kernel.prepare(engagement, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  assert.equal(store.listCommits().length, 0);
  store.close();
});
