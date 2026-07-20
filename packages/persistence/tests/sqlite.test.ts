import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { V2Application } from "@task-copilot/application";

import { V2_DATABASE_SCHEMA_VERSION, V2SqliteStore } from "../src/sqlite.ts";

async function fixture(): Promise<{ root: string; path: string; store: V2SqliteStore }> {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-sqlite-"));
  const path = join(root, ".task-copilot", "task-copilot.db");
  return { root, path, store: await V2SqliteStore.open(path) };
}

test("SQLite initialization is Graph-bound and idempotent", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  assert.deepEqual(store.initialize("graph-a"), { initialized: true, schemaVersion: V2_DATABASE_SCHEMA_VERSION });
  assert.deepEqual(store.initialize("graph-a"), { initialized: false, schemaVersion: V2_DATABASE_SCHEMA_VERSION });
  assert.throws(() => store.initialize("graph-b"), /另一个 Graph/);
  assert.equal(store.doctor().status, "PASS");
  store.close();
  const reopened = await V2SqliteStore.open(path);
  assert.deepEqual(reopened.initialize("graph-a"), { initialized: false, schemaVersion: V2_DATABASE_SCHEMA_VERSION });
  reopened.close();
});

async function downgradeFixtureToSchemaV1(path: string): Promise<void> {
  const database = new Database(path);
  database.exec("DROP TABLE IF EXISTS schema_migrations");
  database.prepare("UPDATE schema_meta SET value = '1' WHERE key = 'schema_version'").run();
  database.pragma("user_version = 1");
  database.close();
}

test("schema v1 requires an explicit preflight backup before one auditable migration", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a", new Date("2026-07-20T07:00:00.000Z"));
  store.close();
  await downgradeFixtureToSchemaV1(path);

  const migrated = await V2SqliteStore.open(path);
  assert.throws(
    () => migrated.initialize("graph-a"),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED",
  );
  const backupPath = join(root, "schema-upgrade-backups", "before-v2.db");
  assert.deepEqual(await migrated.migrateSchema("graph-a", backupPath, new Date("2026-07-20T08:00:00.000Z")), {
    migrated: true,
    fromVersion: 1,
    schemaVersion: 2,
    backupPath,
  });
  const preflight = new Database(backupPath, { readonly: true, fileMustExist: true });
  assert.equal(preflight.pragma("user_version", { simple: true }), 1);
  assert.equal((preflight.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").pluck().get()), "1");
  preflight.close();
  assert.deepEqual(migrated.schemaMigrationHistory(), [
    { version: 1, name: "initial_core_schema", appliedAt: "2026-07-20T07:00:00.000Z" },
    { version: 2, name: "add_schema_migration_ledger", appliedAt: "2026-07-20T08:00:00.000Z" },
  ]);
  assert.deepEqual(migrated.initialize("graph-a"), { initialized: false, schemaVersion: 2 });
  assert.deepEqual(await migrated.migrateSchema("graph-a", backupPath), {
    migrated: false,
    fromVersion: 2,
    schemaVersion: 2,
  });
  assert.equal(migrated.schemaMigrationHistory().length, 2, "repeated initialize must not duplicate migration rows");
  migrated.close();
});

test("failed schema migration rolls back metadata and ledger and can be retried", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  await downgradeFixtureToSchemaV1(path);
  const injection = new Database(path);
  injection.exec(`
    CREATE TRIGGER fail_schema_upgrade
    BEFORE UPDATE OF value ON schema_meta
    WHEN OLD.key = 'schema_version'
    BEGIN
      SELECT RAISE(ABORT, 'injected schema migration failure');
    END;
  `);
  injection.close();

  const failing = await V2SqliteStore.open(path);
  await assert.rejects(
    () => failing.migrateSchema("graph-a", join(root, "before-failed-upgrade.db")),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_FAILED",
  );
  failing.close();
  const afterFailure = new Database(path);
  assert.equal(afterFailure.pragma("user_version", { simple: true }), 1);
  assert.equal((afterFailure.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as { value: string }).value, "1");
  assert.equal(afterFailure.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").pluck().get(), 0);
  afterFailure.exec("DROP TRIGGER fail_schema_upgrade");
  afterFailure.close();

  const retried = await V2SqliteStore.open(path);
  assert.equal((await retried.migrateSchema("graph-a", join(root, "before-retry.db"))).schemaVersion, 2);
  assert.equal(retried.schemaMigrationHistory().length, 2);
  retried.close();
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
    schemaVersion: V2_DATABASE_SCHEMA_VERSION,
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
  const backupBytes = await readFile(backupPath);
  assert.deepEqual(V2SqliteStore.validateBackup(backupPath, "graph-a"), {
    status: "PASS",
    schemaVersion: V2_DATABASE_SCHEMA_VERSION,
    integrity: "ok",
    foreignKeyViolations: 0,
    objectCount: 1,
  });
  assert.throws(() => V2SqliteStore.validateBackup(backupPath, "graph-other"), /另一个 Graph/);
  assert.deepEqual(await readFile(backupPath), backupBytes, "read-only validation must not mutate backup bytes");
  await assert.rejects(() => store.backup(backupPath), /拒绝覆盖/);
  assert.deepEqual(await readFile(backupPath), backupBytes, "failed duplicate backup must not overwrite bytes");
  store.close();
  const backup = await V2SqliteStore.open(backupPath);
  assert.deepEqual(backup.initialize("graph-a"), { initialized: false, schemaVersion: V2_DATABASE_SCHEMA_VERSION });
  assert.equal(backup.getObject("obj-backup")?.text, "治理 Pilot");
  assert.equal(backup.doctor().status, "PASS");
  backup.close();
});

test("locked SQLite write becomes a structured zero-write failure", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-sqlite-lock-"));
  const path = join(root, "task-copilot.db");
  const store = await V2SqliteStore.open(path, { busyTimeoutMs: 20 });
  const locker = new Database(path);
  t.after(async () => {
    if (locker.inTransaction) locker.exec("ROLLBACK");
    locker.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  store.initialize("graph-a");
  locker.exec("BEGIN IMMEDIATE");
  const application = new V2Application(store);
  await assert.rejects(() => application.createObject(
    { objectId: "locked-object", objectType: "TASK", text: "不得半写" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "locked-create", traceId: "trace-locked" },
  ), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_DATABASE_LOCKED");
  assert.equal(store.getObject("locked-object"), undefined);
  assert.equal(store.auditEventCount(), 0);
});

test("corrupt backup is rejected by read-only validation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-backup-corrupt-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "corrupt.db");
  await writeFile(path, "not a sqlite backup");
  const before = await readFile(path);
  assert.throws(() => V2SqliteStore.validateBackup(path, "graph-a"), /只读方式通过校验/);
  assert.deepEqual(await readFile(path), before);
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
