import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { backupCreate, backupInspect, backupRestore, doctor, serviceStatus, statePaths } from "../src/local-runtime.ts";

function seedDatabase(path: string, schemaVersion = 22, extra = ""): void {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS work_objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, lifecycle TEXT NOT NULL, engagement TEXT, current_focus TEXT, desired_outcome TEXT, completion_checks_json TEXT NOT NULL DEFAULT '[]', waiting_condition_json TEXT, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (?, ?)").run(schemaVersion, new Date().toISOString());
  db.prepare("INSERT OR REPLACE INTO work_objects(id,kind,title,lifecycle,engagement,current_focus,desired_outcome,completion_checks_json,waiting_condition_json,version,created_at,updated_at) VALUES ('w1','MINI_PROJECT','备份测试对象','OPEN','ACTIONABLE',NULL,NULL,'[]',NULL,1,'now','now')").run();
  db.exec(extra);
  db.close();
}

test("backup create produces a manifest, schema, and integrity-passing SQLite snapshot", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tc-backup-create-"));
  const { dbPath } = statePaths(stateDir); seedDatabase(dbPath);
  const info = await backupCreate(stateDir);
  assert.equal(info.schemaVersion, 22);
  assert.equal(info.integrity, "PASS");
  assert.equal(info.secretAudit, "PASS");
  const manifest = JSON.parse(await readFile(join(info.path, "manifest.json"), "utf8")) as { formatVersion: number; database: string };
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.database, "task-copilot.sqlite");
  const inspected = await backupInspect(info.path);
  assert.equal(inspected.integrity, "PASS");
  assert.equal(inspected.schemaVersion, 22);
  await rm(stateDir, { recursive: true, force: true });
});

test("backup inspect rejects missing manifest, corrupt DB, schema mismatch, and future schema", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tc-backup-inspect-"));
  const { dbPath } = statePaths(stateDir); seedDatabase(dbPath);
  const info = await backupCreate(stateDir);
  await assert.rejects(backupInspect(info.path.replace(/\/[^/]+$/, "/missing")), /BACKUP_MANIFEST_MISSING/u);
  await writeFile(join(info.path, "task-copilot.sqlite"), "not a sqlite database");
  await assert.rejects(backupInspect(info.path), /file is not a database|SQLITE_NOTADB|BACKUP_INTEGRITY_FAILED/u);
  const future = await mkdtemp(join(tmpdir(), "tc-backup-future-"));
  seedDatabase(join(future, "task-copilot.sqlite"), 23);
  await writeFile(join(future, "manifest.json"), JSON.stringify({ formatVersion: 1, schemaVersion: 23, createdAt: "now", appVersion: "0.2.0", database: "task-copilot.sqlite", sizeBytes: 1, integrity: "PASS" }));
  await assert.rejects(backupInspect(future), /BACKUP_SCHEMA_TOO_NEW/u);
  await rm(stateDir, { recursive: true, force: true }); await rm(future, { recursive: true, force: true });
});

test("restore validates and atomically replaces the current database while keeping the previous file", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tc-backup-restore-"));
  const { dbPath } = statePaths(stateDir); seedDatabase(dbPath);
  const info = await backupCreate(stateDir);
  const db = new Database(dbPath); db.prepare("INSERT OR REPLACE INTO work_objects(id,kind,title,lifecycle,engagement,current_focus,desired_outcome,completion_checks_json,waiting_condition_json,version,created_at,updated_at) VALUES ('w2','TASK','恢复后不应存在','OPEN','ACTIONABLE',NULL,NULL,'[]',NULL,1,'now','now')").run(); db.close();
  const result = await backupRestore(info.path, stateDir);
  assert.equal(result.restoredTo, dbPath);
  assert.ok(result.previousBackup);
  const restored = new Database(dbPath, { readonly: true });
  assert.equal((restored.prepare("SELECT COUNT(*) AS count FROM work_objects").get() as { count: number }).count, 1);
  restored.close();
  await rm(stateDir, { recursive: true, force: true });
});

test("service status recognizes stale descriptor and never reports a dead pid as running", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tc-service-status-"));
  const { dbPath, descriptorPath } = statePaths(stateDir); seedDatabase(dbPath);
  await mkdir(stateDir, { recursive: true });
  await writeFile(descriptorPath, JSON.stringify({ schemaVersion: 1, baseUrl: "http://127.0.0.1:1", token: "x", pid: 999_999_999, startedAt: "now" }));
  const status = await serviceStatus(stateDir);
  assert.equal(status.running, false);
  assert.equal(status.descriptorStale, true);
  await rm(stateDir, { recursive: true, force: true });
});

test("doctor reports integrity, foreign keys, schema, and stale service without printing secrets", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tc-doctor-"));
  const { dbPath } = statePaths(stateDir); seedDatabase(dbPath, 22, "CREATE TABLE orphan(id INTEGER)");
  const report = await doctor(stateDir);
  assert.equal(report.database.integrity, "PASS");
  assert.equal(report.database.foreignKeys, "PASS");
  assert.equal(report.database.schemaVersion, 22);
  assert.equal(report.database.futureSchema, false);
  assert.equal(report.service.running, false);
  assert.equal(JSON.stringify(report).includes("sk-d"), false);
  await rm(stateDir, { recursive: true, force: true });
});
