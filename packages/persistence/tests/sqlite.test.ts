import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createV2ManagedObject, transitionV2Lifecycle } from "@task-copilot/domain";

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
  const object = createV2ManagedObject({ objectId: "obj-1", objectType: "TASK", text: "验证事件" });
  assert.deepEqual(store.putObject(object, "cmd-create-1", 0), object);
  assert.deepEqual(store.putObject({ ...object, text: "不应覆盖" }, "cmd-create-1", 0), object);
  assert.throws(() => store.putObject(object, "cmd-create-2", 0), /版本/);
  const completed = transitionV2Lifecycle(object, "COMPLETED", 1);
  store.putObject(completed, "cmd-complete-1", 1);
  assert.equal(store.getObject("obj-1")?.lifecycle, "COMPLETED");
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
  const object = createV2ManagedObject({ objectId: "obj-backup", objectType: "PROJECT", text: "治理 Pilot" });
  store.putObject(object, "cmd-backup-create", 0);
  const backupPath = await store.backup(join(root, "backups", "before-change.db"));
  store.close();
  const backup = await V2SqliteStore.open(backupPath);
  assert.deepEqual(backup.initialize("graph-a"), { initialized: false, schemaVersion: 1 });
  assert.equal(backup.getObject("obj-backup")?.text, "治理 Pilot");
  assert.equal(backup.doctor().status, "PASS");
  backup.close();
});
