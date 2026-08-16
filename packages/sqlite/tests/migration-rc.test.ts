import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { SqliteStore } from "../src/index.ts";

function seedCurrent(path: string): void { const store = new SqliteStore(path); store.putWorkObject({ id: "w1", kind: "MINI_PROJECT", title: "迁移对象", lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "now", updatedAt: "now" }); store.close(); }

function downgrade(path: string, target: number): void {
  const db = new Database(path);
  const drops: Record<number, string[]> = {
    16: ["user_read_baselines", "project_intents", "runtime_budgets", "runtime_leases", "runtime_health", "closure_assessments", "closure_assessment_jobs"],
    17: ["project_intents", "runtime_budgets", "runtime_leases", "runtime_health", "closure_assessments", "closure_assessment_jobs"],
    18: ["runtime_budgets", "runtime_leases", "runtime_health", "closure_assessments", "closure_assessment_jobs"],
    19: ["runtime_leases", "runtime_health", "closure_assessments", "closure_assessment_jobs"],
    20: ["closure_assessments", "closure_assessment_jobs"],
    21: ["closure_assessment_jobs"],
  };
  for (const table of drops[target] ?? []) db.exec(`DROP TABLE IF EXISTS ${table}`);
  const hasColumn = (table: string, column: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
  if (target <= 18 && hasColumn("reconcile_jobs", "semantic_revision")) db.exec("ALTER TABLE reconcile_jobs DROP COLUMN semantic_revision");
  if (target === 21) {
    if (hasColumn("closure_assessments", "evidence_watermark")) db.exec("ALTER TABLE closure_assessments DROP COLUMN evidence_watermark");
    if (hasColumn("closure_assessments", "gate_json")) db.exec("ALTER TABLE closure_assessments DROP COLUMN gate_json");
    if (hasColumn("closure_assessments", "readiness_changed_at")) db.exec("ALTER TABLE closure_assessments DROP COLUMN readiness_changed_at");
  }
  db.prepare("DELETE FROM schema_versions WHERE version > ?").run(target);
  db.close();
}

for (const from of [16, 17, 18, 19, 20, 21]) {
  test(`schema v${from} migrates to v22 without data loss`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `tc-migration-${from}-`));
    const path = join(directory, "kernel.sqlite");
    seedCurrent(path); downgrade(path, from);
    const store = new SqliteStore(path);
    assert.equal(store.schemaVersion(), 22);
    assert.equal(store.getWorkObject("w1")?.title, "迁移对象");
    store.close();
    const db = new Database(path, { readonly: true });
    assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
    assert.equal((db.prepare("PRAGMA foreign_key_check").all() as unknown[]).length, 0);
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
}

test("future schema fails closed before any runtime migration or writer starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-migration-future-"));
  const path = join(directory, "kernel.sqlite");
  const db = new Database(path);
  db.exec("CREATE TABLE schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  db.prepare("INSERT INTO schema_versions(version, applied_at) VALUES (99, ?)").run("now");
  db.close();
  assert.throws(() => new SqliteStore(path), /SCHEMA_VERSION_TOO_NEW/u);
  await rm(directory, { recursive: true, force: true });
});

test("malformed database fails closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-migration-malformed-"));
  const path = join(directory, "kernel.sqlite");
  const db = new Database(path); db.close();
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path, "not sqlite"));
  assert.throws(() => new SqliteStore(path), /file is not a database/u);
  await rm(directory, { recursive: true, force: true });
});
