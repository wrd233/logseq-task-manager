import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { V2Application } from "@task-copilot/application";

import { V2SqliteStore } from "../src/sqlite.ts";

async function fixture(): Promise<{ root: string; path: string; store: V2SqliteStore }> {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-sqlite-"));
  const path = join(root, ".task-copilot", "task-copilot.db");
  return { root, path, store: await V2SqliteStore.open(path) };
}

test("SQLite initialization is Graph-bound and idempotent", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  assert.deepEqual(store.initialize("graph-a"), { initialized: true, schemaVersion: 1 });
  assert.deepEqual(store.initialize("graph-a"), { initialized: false, schemaVersion: 1 });
  assert.throws(() => store.initialize("graph-b"), /另一个 Graph/);
  assert.equal(store.doctor().status, "PASS");
  store.close();
  const reopened = await V2SqliteStore.open(path);
  assert.deepEqual(reopened.initialize("graph-a"), { initialized: false, schemaVersion: 1 });
  reopened.close();
});

test("object writes require expected version and are idempotent", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  const object = await application.createObject(
    { objectId: "obj-1", objectType: "TASK", text: "验证事件" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "cmd-create-1", traceId: "trace-create" },
  );
  assert.deepEqual(
    await application.createObject(
      { objectId: "obj-other", objectType: "TASK", text: "不应覆盖" },
      { actor: "test", expectedVersion: 0, idempotencyKey: "cmd-create-1", traceId: "trace-replay" },
    ),
    object,
  );
  await assert.rejects(
    () => application.createObject(
      { objectId: "obj-1", objectType: "TASK", text: "冲突" },
      { actor: "test", expectedVersion: 0, idempotencyKey: "cmd-create-2", traceId: "trace-conflict" },
    ),
    /版本/,
  );
  await application.transitionLifecycle("obj-1", "COMPLETED", {
    actor: "test",
    expectedVersion: 1,
    idempotencyKey: "cmd-complete-1",
    traceId: "trace-complete",
  });
  assert.equal(store.getObject("obj-1")?.lifecycle, "COMPLETED");
  assert.equal(store.auditEventCount(), 2);
  assert.deepEqual(store.doctor(), {
    status: "PASS",
    schemaVersion: 1,
    integrity: "ok",
    foreignKeyViolations: 0,
    objectCount: 1,
  });
  store.close();
});

test("unknown schema and corrupt bytes are refused without overwrite", async (t) => {
  const future = await fixture();
  t.after(async () => rm(future.root, { recursive: true, force: true }));
  future.store.initialize("graph-a");
  future.store.close();
  const database = await V2SqliteStore.open(future.path);
  const internal = database as unknown as { database: { pragma(value: string): unknown } };
  internal.database.pragma("user_version = 99");
  database.close();
  const rawBefore = await readFile(future.path);
  const futureStore = await V2SqliteStore.open(future.path);
  assert.throws(() => futureStore.initialize("graph-a"), /高于当前程序/);
  futureStore.close();
  assert.deepEqual(await readFile(future.path), rawBefore);

  const corruptPath = join(future.root, "corrupt.db");
  await writeFile(corruptPath, "not sqlite");
  await assert.rejects(() => V2SqliteStore.open(corruptPath), /无法打开/);
  assert.equal(await readFile(corruptPath, "utf8"), "not sqlite");
});

test("backup is a readable independent SQLite database", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  await application.createObject(
    { objectId: "obj-backup", objectType: "PROJECT", text: "治理 Pilot" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "cmd-backup-create", traceId: "trace-backup" },
  );
  const backupPath = await store.backup(join(root, "backups", "before-change.db"));
  store.close();
  const backup = await V2SqliteStore.open(backupPath);
  assert.deepEqual(backup.initialize("graph-a"), { initialized: false, schemaVersion: 1 });
  assert.equal(backup.getObject("obj-backup")?.text, "治理 Pilot");
  assert.equal(backup.doctor().status, "PASS");
  backup.close();
});

test("Primary Anchor and Ownership are unique atomic Application commands", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  await application.createObject(
    { objectId: "project-1", objectType: "PROJECT", text: "项目" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "create-project", traceId: "trace-project" },
  );
  await application.createObject(
    { objectId: "task-1", objectType: "TASK", text: "任务" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "create-task", traceId: "trace-task" },
  );
  const bound = await application.bindPrimaryAnchor("task-1", {
    anchorId: "anchor-1",
    graphId: "graph-a",
    externalId: "block-1",
    contentHash: "hash-1",
  }, { actor: "test", expectedVersion: 1, idempotencyKey: "bind-anchor", traceId: "trace-anchor" });
  assert.equal(bound.object.version, 2);
  assert.equal((await application.bindPrimaryAnchor("task-1", {
    anchorId: "ignored-replay",
    graphId: "graph-a",
    externalId: "ignored-replay",
    contentHash: "ignored-replay",
  }, { actor: "test", expectedVersion: 1, idempotencyKey: "bind-anchor", traceId: "trace-replay" })).anchor.anchorId, "anchor-1");
  await assert.rejects(() => application.bindPrimaryAnchor("task-1", {
    anchorId: "anchor-2",
    graphId: "graph-a",
    externalId: "block-2",
    contentHash: "hash-2",
  }, { actor: "test", expectedVersion: 2, idempotencyKey: "bind-anchor-2", traceId: "trace-anchor-2" }), /rebind/);
  assert.equal(store.getObject("task-1")?.version, 2, "failed Anchor transaction must roll object version back");

  const owned = await application.assignPrimaryOwner("task-1", "project-1", {
    actor: "test",
    expectedVersion: 2,
    idempotencyKey: "assign-owner",
    traceId: "trace-owner",
  });
  assert.equal(owned.object.version, 3);
  await assert.rejects(() => application.assignPrimaryOwner("task-1", "project-1", {
    actor: "test",
    expectedVersion: 3,
    idempotencyKey: "assign-owner-2",
    traceId: "trace-owner-2",
  }), /显式变更/);
  assert.equal(store.getObject("task-1")?.version, 3, "failed Ownership transaction must roll object version back");
  assert.equal(store.auditEventCount(), 4);
  store.close();
});
