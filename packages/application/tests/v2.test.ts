import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject, V2PrimaryOwnership } from "@task-copilot/domain";

import {
  V2Application,
  type V2AnchorObservationCommand,
  type V2AnchorCommand,
  type V2AuditRecord,
  type V2CommandReceipt,
  type V2MaterializationCommand,
  type V2ObjectCommand,
  type V2ObjectRepository,
  type V2OwnershipCommand,
  type V2SynchronizationCommand,
} from "../src/v2.ts";

class MemoryV2Repository implements V2ObjectRepository {
  readonly values = new Map<string, V2ManagedObject>();
  readonly receipts = new Map<string, V2CommandReceipt>();
  readonly audit: V2AuditRecord[] = [];
  readonly anchors = new Map<string, V2Anchor>();
  readonly ownerships = new Map<string, V2PrimaryOwnership>();

  getCommandReceipt(idempotencyKey: string): V2CommandReceipt | undefined {
    return this.receipts.get(idempotencyKey);
  }

  getPrimaryAnchorByExternal(graphId: string, externalId: string): V2Anchor | undefined {
    return [...this.anchors.values()].find((anchor) => anchor.graphId === graphId && anchor.externalId === externalId && anchor.role === "primary_text");
  }

  getPrimaryAnchorById(anchorId: string): V2Anchor | undefined {
    return [...this.anchors.values()].find((anchor) => anchor.anchorId === anchorId);
  }

  commitObject(command: V2ObjectCommand): { object: V2ManagedObject; replayed: boolean } {
    const receipt = this.receipts.get(command.idempotencyKey);
    if (receipt) return { object: receipt.object, replayed: true };
    const actualVersion = this.values.get(command.object.objectId)?.version ?? 0;
    if (actualVersion !== command.expectedVersion) throw new Error(`version ${actualVersion} != ${command.expectedVersion}`);
    this.values.set(command.object.objectId, command.object);
    this.receipts.set(command.idempotencyKey, { command: command.audit.command as "create_object" | "transition_lifecycle", object: command.object });
    this.audit.push(command.audit);
    return { object: command.object, replayed: false };
  }

  commitAnchor(command: V2AnchorCommand): { object: V2ManagedObject; anchor: V2Anchor; replayed: boolean } {
    const receipt = this.receipts.get(command.idempotencyKey);
    if (receipt?.command === "bind_primary_anchor") return { object: receipt.object, anchor: receipt.anchor, replayed: true };
    if (this.anchors.has(command.object.objectId)) throw new Error("primary anchor already exists");
    this.commitVersionedChange(command.object, command.expectedVersion, command.idempotencyKey, command.audit);
    this.anchors.set(command.object.objectId, command.anchor);
    this.receipts.set(command.idempotencyKey, { command: "bind_primary_anchor", object: command.object, anchor: command.anchor });
    return { object: command.object, anchor: command.anchor, replayed: false };
  }

  commitMaterialization(command: V2MaterializationCommand): { object: V2ManagedObject; anchor: V2Anchor; replayed: boolean } {
    const receipt = this.receipts.get(command.idempotencyKey);
    if (receipt?.command === "materialize_explicit_object") return { object: receipt.object, anchor: receipt.anchor, replayed: true };
    const actualVersion = this.values.get(command.object.objectId)?.version ?? 0;
    if (actualVersion !== 0) throw new Error(`version ${actualVersion} != 0`);
    if ([...this.anchors.values()].some((anchor) => anchor.graphId === command.anchor.graphId && anchor.externalId === command.anchor.externalId && anchor.role === "primary_text")) {
      throw new Error("external primary anchor already exists");
    }
    this.values.set(command.object.objectId, command.object);
    this.anchors.set(command.object.objectId, command.anchor);
    this.receipts.set(command.idempotencyKey, { command: "materialize_explicit_object", object: command.object, anchor: command.anchor });
    this.audit.push(command.audit);
    return { object: command.object, anchor: command.anchor, replayed: false };
  }

  commitSynchronization(command: V2SynchronizationCommand): { object: V2ManagedObject; anchor: V2Anchor; replayed: boolean } {
    const receipt = this.receipts.get(command.idempotencyKey);
    if (receipt?.command === "synchronize_explicit_object") return { object: receipt.object, anchor: receipt.anchor, replayed: true };
    const actualVersion = this.values.get(command.object.objectId)?.version ?? 0;
    if (actualVersion !== command.expectedVersion) throw new Error(`version ${actualVersion} != ${command.expectedVersion}`);
    this.values.set(command.object.objectId, command.object);
    this.anchors.set(command.object.objectId, command.anchor);
    this.receipts.set(command.idempotencyKey, { command: "synchronize_explicit_object", object: command.object, anchor: command.anchor });
    this.audit.push(command.audit);
    return { object: command.object, anchor: command.anchor, replayed: false };
  }

  commitAnchorObservation(command: V2AnchorObservationCommand): { object: V2ManagedObject; anchor: V2Anchor; replayed: boolean } {
    const receipt = this.receipts.get(command.idempotencyKey);
    if (receipt?.command === "observe_primary_anchor") return { object: receipt.object, anchor: receipt.anchor, replayed: true };
    const actualVersion = this.values.get(command.object.objectId)?.version ?? 0;
    if (actualVersion !== command.expectedVersion) throw new Error(`version ${actualVersion} != ${command.expectedVersion}`);
    const current = this.getPrimaryAnchorById(command.anchor.anchorId);
    if (!current || current.objectId !== command.object.objectId) throw new Error("primary anchor changed");
    this.values.set(command.object.objectId, command.object);
    this.anchors.set(command.object.objectId, command.anchor);
    this.receipts.set(command.idempotencyKey, { command: "observe_primary_anchor", object: command.object, anchor: command.anchor });
    this.audit.push(command.audit);
    return { object: command.object, anchor: command.anchor, replayed: false };
  }

  commitOwnership(command: V2OwnershipCommand): { object: V2ManagedObject; ownership: V2PrimaryOwnership; replayed: boolean } {
    const receipt = this.receipts.get(command.idempotencyKey);
    if (receipt?.command === "assign_primary_owner") return { object: receipt.object, ownership: receipt.ownership, replayed: true };
    this.commitVersionedChange(command.object, command.expectedVersion, command.idempotencyKey, command.audit);
    this.ownerships.set(command.object.objectId, command.ownership);
    this.receipts.set(command.idempotencyKey, { command: "assign_primary_owner", object: command.object, ownership: command.ownership });
    return { object: command.object, ownership: command.ownership, replayed: false };
  }

  private commitVersionedChange(object: V2ManagedObject, expectedVersion: number, idempotencyKey: string, audit: V2AuditRecord): void {
    const actualVersion = this.values.get(object.objectId)?.version ?? 0;
    if (actualVersion !== expectedVersion) throw new Error(`version ${actualVersion} != ${expectedVersion}`);
    this.values.set(object.objectId, object);
    if (audit.command === "create_object" || audit.command === "transition_lifecycle") {
      this.receipts.set(idempotencyKey, { command: audit.command, object });
    }
    this.audit.push(audit);
  }

  getObject(objectId: string): V2ManagedObject | undefined {
    return this.values.get(objectId);
  }

  listObjects(): V2ManagedObject[] {
    return [...this.values.values()];
  }
}

test("V2 Application owns command validation and persists through a repository port", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  const envelope = { actor: "user", expectedVersion: 0, idempotencyKey: "create-1", traceId: "trace-1" };
  const created = await application.createObject(
    { objectId: "obj-1", objectType: "TASK", text: "[任务] 验证外部推送" },
    envelope,
    new Date("2026-07-20T06:00:00Z"),
  );
  assert.equal(created.lifecycle, "OPEN");
  assert.deepEqual(await application.listObjects(), [created]);
  assert.deepEqual(repository.audit, [{
    traceId: "trace-1",
    actor: "user",
    command: "create_object",
    objectId: "obj-1",
    beforeVersion: 0,
    afterVersion: 1,
    occurredAt: "2026-07-20T06:00:00.000Z",
  }]);
});

test("replayed command is idempotent and stale lifecycle transition is refused", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  const createEnvelope = { actor: "user", expectedVersion: 0, idempotencyKey: "create-1", traceId: "trace-create" };
  const first = await application.createObject({ objectType: "TASK", text: "原始正文" }, createEnvelope);
  const replay = await application.createObject({ objectType: "TASK", text: "不得覆盖" }, createEnvelope);
  assert.equal(replay.objectId, first.objectId);
  assert.equal(replay.text, "原始正文");
  assert.equal(repository.audit.length, 1);

  const completed = await application.transitionLifecycle(first.objectId, "COMPLETED", {
    actor: "user",
    expectedVersion: 1,
    idempotencyKey: "complete-1",
    traceId: "trace-complete",
  });
  assert.equal(completed.version, 2);
  await assert.rejects(
    () => application.transitionLifecycle(first.objectId, "ARCHIVED", {
      actor: "user",
      expectedVersion: 1,
      idempotencyKey: "archive-stale",
      traceId: "trace-stale",
    }),
    /版本/,
  );
  assert.equal(repository.getObject(first.objectId)?.lifecycle, "COMPLETED");
});

test("invalid command envelope reaches neither repository nor audit", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  await assert.rejects(
    () => application.createObject(
      { objectType: "TASK", text: "不会创建" },
      { actor: "", expectedVersion: 0, idempotencyKey: "", traceId: "" },
    ),
    /actor/,
  );
  assert.equal(repository.values.size, 0);
  assert.equal(repository.audit.length, 0);
});

test("Primary Anchor and Ownership changes pass through Application and share object version preconditions", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  await application.createObject(
    { objectId: "project-1", objectType: "PROJECT", text: "项目" },
    { actor: "user", expectedVersion: 0, idempotencyKey: "create-project", traceId: "trace-project" },
  );
  await application.createObject(
    { objectId: "task-1", objectType: "TASK", text: "任务" },
    { actor: "user", expectedVersion: 0, idempotencyKey: "create-task", traceId: "trace-task" },
  );
  const bound = await application.bindPrimaryAnchor("task-1", {
    anchorId: "anchor-1",
    graphId: "graph-1",
    externalId: "block-1",
    contentHash: "hash-1",
  }, { actor: "user", expectedVersion: 1, idempotencyKey: "bind-1", traceId: "trace-bind" });
  assert.equal(bound.object.version, 2);
  const owned = await application.assignPrimaryOwner("task-1", "project-1", {
    actor: "user",
    expectedVersion: 2,
    idempotencyKey: "own-1",
    traceId: "trace-own",
  });
  assert.equal(owned.object.version, 3);
  assert.equal(owned.ownership.ownerObjectId, "project-1");
  await assert.rejects(() => application.assignPrimaryOwner("task-1", "project-1", {
    actor: "user",
    expectedVersion: 2,
    idempotencyKey: "own-stale",
    traceId: "trace-stale",
  }), /版本/);
});

test("explicit Block materialization creates Object and Primary Anchor as one idempotent command", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  const envelope = { actor: "logseq-plugin", expectedVersion: 0, idempotencyKey: "materialize-graph-1-block-1", traceId: "trace-materialize" };
  const created = await application.materializeExplicitObject({
    objectId: "task-explicit-1",
    objectType: "TASK",
    text: "核对时间同步来源",
    anchor: { graphId: "graph-1", externalId: "block-1", contentHash: "hash-1" },
  }, envelope, new Date("2026-07-20T07:00:00Z"));

  assert.equal(created.object.version, 2);
  assert.equal(created.object.lifecycle, "OPEN");
  assert.equal(created.anchor.objectId, created.object.objectId);
  assert.equal(created.anchor.role, "primary_text");
  assert.equal(repository.values.get(created.object.objectId)?.version, 2);
  assert.equal(repository.anchors.get(created.object.objectId)?.externalId, "block-1");
  assert.equal(repository.audit.length, 1);

  const replay = await application.materializeExplicitObject({
    objectId: "must-not-replace",
    objectType: "TASK",
    text: "不得覆盖",
    anchor: { graphId: "graph-1", externalId: "other-block", contentHash: "other-hash" },
  }, envelope);
  assert.deepEqual(replay, { ...created, replayed: true });
  assert.equal(repository.values.size, 1);
});

test("explicit Block materialization refuses parser-external Area and Project types before persistence", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  await assert.rejects(() => application.materializeExplicitObject({
    objectType: "PROJECT" as "TASK",
    text: "不得绕过 Project 页面原子创建",
    anchor: { graphId: "graph-1", externalId: "block-project", contentHash: "hash-project" },
  }, { actor: "logseq-plugin", expectedVersion: 0, idempotencyKey: "invalid-project", traceId: "trace-invalid" }), /不支持/);
  assert.equal(repository.values.size, 0);
  assert.equal(repository.anchors.size, 0);
  assert.equal(repository.audit.length, 0);
});

test("bound explicit Block synchronization updates same-type evidence and rejects silent type migration", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  await application.materializeExplicitObject({
    objectId: "task-sync",
    objectType: "TASK",
    text: "旧标题",
    anchor: { graphId: "graph-1", externalId: "block-sync", contentHash: "11111111" },
  }, { actor: "logseq-plugin", expectedVersion: 0, idempotencyKey: "materialize-sync", traceId: "trace-materialize" });
  const synchronized = await application.synchronizeExplicitObject({
    objectType: "TASK",
    text: "新标题",
    graphId: "graph-1",
    externalId: "block-sync",
    contentHash: "22222222",
  }, { actor: "logseq-plugin", expectedVersion: 2, idempotencyKey: "sync-title", traceId: "trace-sync" }, new Date("2026-07-20T07:01:00Z"));
  assert.equal(synchronized.object.text, "新标题");
  assert.equal(synchronized.object.version, 3);
  assert.equal(synchronized.anchor.contentHash, "22222222");
  await assert.rejects(() => application.synchronizeExplicitObject({
    objectType: "MINI_PROJECT",
    text: "不得迁移",
    graphId: "graph-1",
    externalId: "block-sync",
    contentHash: "33333333",
  }, { actor: "logseq-plugin", expectedVersion: 3, idempotencyKey: "sync-type", traceId: "trace-type" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL");
  assert.equal(repository.values.get("task-sync")?.objectType, "TASK");
  assert.equal(repository.audit.length, 2);
});

test("same-UUID synchronization preserves identity and Primary Ownership", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  await application.createObject({ objectId: "project-move", objectType: "PROJECT", text: "告警治理" }, {
    actor: "user", expectedVersion: 0, idempotencyKey: "create-project-move", traceId: "trace-project-move",
  });
  const task = await application.materializeExplicitObject({
    objectId: "task-move",
    objectType: "TASK",
    text: "验证外部推送",
    anchor: { graphId: "graph-1", externalId: "stable-block-uuid", contentHash: "11111111" },
  }, { actor: "logseq-plugin", expectedVersion: 0, idempotencyKey: "materialize-move", traceId: "trace-materialize-move" });
  const owned = await application.assignPrimaryOwner(task.object.objectId, "project-move", {
    actor: "user", expectedVersion: task.object.version, idempotencyKey: "own-move", traceId: "trace-own-move",
  });
  const moved = await application.synchronizeExplicitObject({
    objectType: "TASK",
    text: "验证外部推送",
    graphId: "graph-1",
    externalId: "stable-block-uuid",
    contentHash: "11111111",
  }, { actor: "logseq-plugin", expectedVersion: owned.object.version, idempotencyKey: "sync-after-move", traceId: "trace-after-move" });
  assert.equal(moved.object.objectId, "task-move");
  assert.equal(moved.anchor.externalId, "stable-block-uuid");
  assert.equal(repository.ownerships.get("task-move")?.ownerObjectId, "project-move");
  assert.equal(repository.ownerships.size, 1);
});

test("Anchor observations are versioned, idempotent, and never delete the object", async () => {
  const repository = new MemoryV2Repository();
  const application = new V2Application(repository);
  const created = await application.materializeExplicitObject({
    objectId: "task-observed",
    objectType: "TASK",
    text: "保留对象",
    anchor: { anchorId: "anchor-observed", graphId: "graph-1", externalId: "block-observed", contentHash: "11111111" },
  }, { actor: "logseq-plugin", expectedVersion: 0, idempotencyKey: "materialize-observed", traceId: "trace-materialize" });
  const envelope = { actor: "logseq-plugin", expectedVersion: created.object.version, idempotencyKey: "observe-missing-v2", traceId: "trace-missing" };
  const missing = await application.observePrimaryAnchor({ anchorId: created.anchor.anchorId, status: "missing" }, envelope, new Date("2026-07-20T08:02:00Z"));
  assert.equal(missing.anchor.status, "missing");
  assert.equal(repository.getObject("task-observed")?.version, 3);
  assert.equal(repository.values.size, 1);
  const unchanged = await application.observePrimaryAnchor({ anchorId: created.anchor.anchorId, status: "missing" }, {
    actor: "logseq-plugin", expectedVersion: 3, idempotencyKey: "observe-missing-unchanged", traceId: "trace-unchanged",
  });
  assert.equal(unchanged.object.version, 3);
  assert.equal(unchanged.replayed, true);
  assert.equal(repository.audit.length, 2, "unchanged observation must not create a write or audit record");
  assert.equal((await application.observePrimaryAnchor({ anchorId: created.anchor.anchorId, status: "conflict" }, envelope)).anchor.status, "missing", "replay must not adopt a different payload");
  await assert.rejects(() => application.observePrimaryAnchor({ anchorId: created.anchor.anchorId, status: "active" }, {
    actor: "logseq-plugin", expectedVersion: 2, idempotencyKey: "observe-stale", traceId: "trace-stale",
  }), /version|\u7248\u672c/);
});
