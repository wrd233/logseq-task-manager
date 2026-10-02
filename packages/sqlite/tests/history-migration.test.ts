import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import Database from "better-sqlite3";
import { SqliteStore } from "../src/index.ts";

async function oldDatabase(path: string) {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.exec(await readFile(new URL("./fixtures/schema-v22.sql", import.meta.url), "utf8"));
  db.exec(`INSERT INTO work_objects(id,kind,title,lifecycle,engagement,version,created_at,updated_at) VALUES ('work','TASK','old','OPEN','ACTIONABLE',1,'created','updated');
    INSERT INTO commits(id,status,actor_type,actor_id,operation_type,target_id,operation_json,preconditions_json,created_at,updated_at) VALUES ('commit','COMMITTED','USER','local-user','CREATE_WORK_OBJECT','work','{}','[]','created','updated');
    INSERT INTO projection_obligations VALUES ('obligation','commit','work',1,'anchor','hash','FAILED',2,'attempted','next',0,'failure','created','updated');
    INSERT INTO decision_packages(id,work_object_id,summary,rationale,status,target_versions_json,created_at,updated_at) VALUES ('package','work','summary','why','OPEN','{}','created','updated');
    INSERT INTO decision_candidates(id,package_id,operation_type,parameters_json,status,created_at) VALUES ('candidate','package','SET_CURRENT_FOCUS','{}','OPEN','created');`);
  return db;
}

test("v22 history migration preserves every row and audit FK while allowing current-state deletion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "round04-migrate-")), path = join(dir, "kernel.sqlite");
  try {
    const old = await oldDatabase(path);
    const before = old.prepare("SELECT * FROM projection_obligations").all(); old.close();
    const store = new SqliteStore(path);
    assert.equal(store.schemaVersion(), 23); assert.equal(store.getProjectionObligationForCommit("commit")?.attempt, 2);
    store.transaction(() => store.deleteWorkObject("work"));
    assert.equal(store.getCommit("commit")?.targetId, "work"); assert.equal(store.getProjectionObligationForCommit("commit")?.workObjectId, "work");
    assert.equal(store.listDecisionCandidates("package").length, 1); store.close();
    const db = new Database(path);
    assert.deepEqual(db.prepare("SELECT * FROM projection_obligations").all(), before);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    assert.throws(() => db.exec("DELETE FROM commits WHERE id='commit'"), /FOREIGN KEY/u); db.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("failed v23 migration rolls back DDL, data and version together and closes its connection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "round04-migrate-fail-")), path = join(dir, "kernel.sqlite");
  try {
    const old = await oldDatabase(path);
    old.exec("CREATE TRIGGER reject_v23 BEFORE INSERT ON schema_versions WHEN NEW.version=23 BEGIN SELECT RAISE(ABORT, 'injected-v23-failure'); END;");
    const before = old.prepare("SELECT sql FROM sqlite_master WHERE name='projection_obligations'").get(); old.close();
    assert.throws(() => new SqliteStore(path), /injected-v23-failure/u);
    const db = new Database(path);
    assert.equal((db.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version, 22);
    assert.deepEqual(db.prepare("SELECT sql FROM sqlite_master WHERE name='projection_obligations'").get(), before);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM decision_candidates").get() as { n: number }).n, 1);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    db.exec("DROP TRIGGER reject_v23"); db.close();
    const retry = new SqliteStore(path); assert.equal(retry.schemaVersion(), 23); retry.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
