import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject, V2PrimaryOwnership } from "@task-copilot/domain";

import {
  V2Application,
  type V2AnchorCommand,
  type V2AuditRecord,
  type V2CommandReceipt,
  type V2ObjectCommand,
  type V2ObjectRepository,
  type V2OwnershipCommand,
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
