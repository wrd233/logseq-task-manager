import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { AgentGovernanceApplication, V2Application, V2CandidateApplication } from "@task-copilot/application";
import { renderV2ProposalFiles, type V2Proposal } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

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

test("Condition command receipts retain a durable inverse without changing the object API", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-condition-receipt");
  const application = new V2Application(store);
  const created = await application.createObject(
    { objectId: "condition-receipt-task", objectType: "TASK", text: "等待验收" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "create-condition-receipt", traceId: "trace-create-condition-receipt" },
  );
  const changed = await application.changeCondition(
    created.objectId,
    { kind: "PAUSED", reason: "等待测试环境" },
    { actor: "test", expectedVersion: created.version, idempotencyKey: "condition:durable-forward", traceId: "trace-condition-forward" },
  );
  assert.equal(changed.condition.kind, "PAUSED");
  assert.deepEqual(store.listConditionChangeReceipts(created.objectId), [{
    idempotencyKey: "condition:durable-forward",
    object: changed,
    beforeCondition: { kind: "ACTIONABLE" },
    createdAt: changed.updatedAt,
  }]);
  assert.deepEqual((await application.changeCondition(
    created.objectId,
    { kind: "PAUSED", reason: "等待测试环境" },
    { actor: "test", expectedVersion: created.version, idempotencyKey: "condition:durable-forward", traceId: "trace-condition-replay" },
  )), changed, "the public application replay remains the managed object");
});

async function downgradeFixtureToSchemaV1(path: string): Promise<void> {
  const database = new Database(path);
  dropAgentGovernanceSchema(database);
  database.exec("DROP TABLE candidates");
  database.exec("DROP TABLE associations");
  database.exec("DROP TABLE legacy_evidence; DROP TABLE migration_batches; DROP TABLE migration_runs");
  database.exec("ALTER TABLE objects DROP COLUMN closure_json");
  database.exec("ALTER TABLE objects DROP COLUMN due_at");
  database.exec("DROP TABLE IF EXISTS proposal_groups; DROP TABLE IF EXISTS proposals");
  database.exec("DROP TABLE IF EXISTS semantic_commit_steps; DROP TABLE IF EXISTS semantic_commits");
  database.exec("DROP TABLE IF EXISTS schema_migrations");
  database.prepare("UPDATE schema_meta SET value = '1' WHERE key = 'schema_version'").run();
  database.pragma("user_version = 1");
  database.close();
}

function dropAgentGovernanceSchema(database: Database.Database): void {
  database.exec(`
    DROP TABLE IF EXISTS agent_governance_settings;
    DROP TABLE IF EXISTS agent_decision_events;
    DROP TABLE IF EXISTS agent_review_signals;
    DROP TABLE IF EXISTS agent_rule_authorizations;
    DROP TABLE IF EXISTS agent_decisions;
  `);
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
    schemaVersion: V2_DATABASE_SCHEMA_VERSION,
    backupPath,
  });
  const preflight = new Database(backupPath, { readonly: true, fileMustExist: true });
  assert.equal(preflight.pragma("user_version", { simple: true }), 1);
  assert.equal((preflight.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").pluck().get()), "1");
  preflight.close();
  assert.deepEqual(migrated.schemaMigrationHistory(), [
    { version: 1, name: "initial_core_schema", appliedAt: "2026-07-20T07:00:00.000Z" },
    { version: 2, name: "add_schema_migration_ledger", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 3, name: "add_semantic_commit_step_ledger", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 4, name: "add_proposal_review_tables", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 5, name: "decouple_audit_from_current_objects", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 6, name: "add_task_due_at", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 7, name: "add_v1_migration_ledger", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 8, name: "add_project_closure_summary", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 9, name: "add_plain_associations", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 10, name: "add_candidate_review_state", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 11, name: "allow_project_closure_retention_and_mini_project_closure", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 12, name: "add_project_structure_aggregate", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 13, name: "add_agent_decision_governance", appliedAt: "2026-07-20T08:00:00.000Z" },
    { version: 14, name: "add_agent_governance_settings", appliedAt: "2026-07-20T08:00:00.000Z" },
  ]);
  assert.deepEqual(migrated.initialize("graph-a"), { initialized: false, schemaVersion: V2_DATABASE_SCHEMA_VERSION });
  assert.deepEqual(await migrated.migrateSchema("graph-a", backupPath), {
    migrated: false,
    fromVersion: V2_DATABASE_SCHEMA_VERSION,
    schemaVersion: V2_DATABASE_SCHEMA_VERSION,
  });
  assert.equal(migrated.schemaMigrationHistory().length, V2_DATABASE_SCHEMA_VERSION, "repeated initialize must not duplicate migration rows");
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
  assert.equal((await retried.migrateSchema("graph-a", join(root, "before-retry.db"))).schemaVersion, V2_DATABASE_SCHEMA_VERSION);
  assert.equal(retried.schemaMigrationHistory().length, V2_DATABASE_SCHEMA_VERSION);
  retried.close();
});

test("schema v2 explicitly migrates to the constrained SemanticCommit step ledger", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DROP TABLE candidates; DROP TABLE associations; DROP TABLE legacy_evidence; DROP TABLE migration_batches; DROP TABLE migration_runs; ALTER TABLE objects DROP COLUMN closure_json; ALTER TABLE objects DROP COLUMN due_at; DROP TABLE proposal_groups; DROP TABLE proposals; DROP TABLE semantic_commit_steps; DROP TABLE semantic_commits; DELETE FROM schema_migrations WHERE version >= 3");
  legacy.prepare("UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 2");
  legacy.close();

  const migrating = await V2SqliteStore.open(path);
  assert.throws(() => migrating.initialize("graph-a"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED");
  const backupPath = join(root, "before-step-ledger.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-20T10:00:00.000Z")), {
    migrated: true,
    fromVersion: 2,
    schemaVersion: V2_DATABASE_SCHEMA_VERSION,
    backupPath,
  });
  const preflight = new Database(backupPath, { readonly: true });
  assert.equal(preflight.pragma("user_version", { simple: true }), 2);
  preflight.close();
  const internal = migrating as unknown as { database: Database.Database };
  internal.database.prepare("INSERT INTO semantic_commits VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("commit-1", "proposal-1", "PENDING", "before", null, "2026-07-20T10:00:00.000Z", "2026-07-20T10:00:00.000Z", null);
  internal.database.prepare("INSERT INTO semantic_commit_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("commit-1", 0, "GRAPH_WRITE", "PREPARED", "operation-1", "before-hash", "after-hash", null, "2026-07-20T10:00:00.000Z");
  assert.throws(
    () => internal.database.prepare("INSERT INTO semantic_commit_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("commit-1", 1, "INVALID", "PREPARED", null, null, null, null, "2026-07-20T10:00:00.000Z"),
    /CHECK constraint failed/,
  );
  migrating.close();
});

test("schema v3 explicitly migrates to proposal review tables after a validated backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DROP TABLE candidates; DROP TABLE associations; DROP TABLE legacy_evidence; DROP TABLE migration_batches; DROP TABLE migration_runs; ALTER TABLE objects DROP COLUMN closure_json; ALTER TABLE objects DROP COLUMN due_at; DROP TABLE proposal_groups; DROP TABLE proposals; DELETE FROM schema_migrations WHERE version >= 4");
  legacy.prepare("UPDATE schema_meta SET value = '3' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 3");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  assert.throws(() => migrating.initialize("graph-a"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED");
  const backupPath = join(root, "before-proposals.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-20T11:00:00.000Z")), { migrated: true, fromVersion: 3, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  assert.equal(migrating.schemaMigrationHistory()[3]?.name, "add_proposal_review_tables");
  assert.equal(migrating.schemaMigrationHistory()[4]?.name, "decouple_audit_from_current_objects");
  assert.equal(migrating.schemaMigrationHistory()[5]?.name, "add_task_due_at");
  assert.equal(migrating.schemaMigrationHistory()[6]?.name, "add_v1_migration_ledger");
  migrating.close();
});

test("schema v4 explicitly decouples immutable Audit from the current object projection", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec(`
    DROP TABLE candidates;
    DROP TABLE associations;
    DROP TABLE legacy_evidence;
    DROP TABLE migration_batches;
    DROP TABLE migration_runs;
    ALTER TABLE objects DROP COLUMN closure_json;
    ALTER TABLE objects DROP COLUMN due_at;
    DELETE FROM schema_migrations WHERE version >= 5;
    ALTER TABLE audit_events RENAME TO audit_events_unbound;
    CREATE TABLE audit_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT, trace_id TEXT NOT NULL, actor TEXT NOT NULL, command_name TEXT NOT NULL,
      object_id TEXT NOT NULL REFERENCES objects(object_id), before_version INTEGER NOT NULL, after_version INTEGER NOT NULL, occurred_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO audit_events SELECT * FROM audit_events_unbound;
    DROP TABLE audit_events_unbound;
  `);
  legacy.prepare("UPDATE schema_meta SET value = '4' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 4");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  const backupPath = join(root, "before-audit-decoupling.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-20T11:30:00.000Z")), { migrated: true, fromVersion: 4, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  const internal = migrating as unknown as { database: Database.Database };
  assert.deepEqual(internal.database.pragma("foreign_key_list(audit_events)"), []);
  assert.equal(migrating.schemaMigrationHistory()[4]?.name, "decouple_audit_from_current_objects");
  assert.equal(migrating.schemaMigrationHistory()[5]?.name, "add_task_due_at");
  assert.equal(migrating.schemaMigrationHistory()[6]?.name, "add_v1_migration_ledger");
  migrating.close();
});

test("schema v5 explicitly adds nullable Task due_at after a validated backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DROP TABLE candidates; DROP TABLE associations; DROP TABLE legacy_evidence; DROP TABLE migration_batches; DROP TABLE migration_runs; ALTER TABLE objects DROP COLUMN closure_json; ALTER TABLE objects DROP COLUMN due_at; DELETE FROM schema_migrations WHERE version >= 6");
  legacy.prepare("UPDATE schema_meta SET value = '5' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 5");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  const backupPath = join(root, "before-task-due-at.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-20T11:45:00.000Z")), { migrated: true, fromVersion: 5, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  const internal = migrating as unknown as { database: Database.Database };
  assert.equal(internal.database.prepare("SELECT count(*) FROM pragma_table_info('objects') WHERE name = 'due_at'").pluck().get(), 1);
  assert.equal(migrating.schemaMigrationHistory()[5]?.name, "add_task_due_at");
  assert.equal(migrating.schemaMigrationHistory()[6]?.name, "add_v1_migration_ledger");
  migrating.close();
});

test("schema v6 explicitly adds only the bounded V1 migration ledger after a validated backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DROP TABLE candidates; DROP TABLE associations; DROP TABLE legacy_evidence; DROP TABLE migration_batches; DROP TABLE migration_runs; ALTER TABLE objects DROP COLUMN closure_json; DELETE FROM schema_migrations WHERE version >= 7");
  legacy.prepare("UPDATE schema_meta SET value = '6' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 6");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  assert.throws(() => migrating.initialize("graph-a"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED");
  const backupPath = join(root, "before-v1-migration-ledger.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-21T12:00:00.000Z")), { migrated: true, fromVersion: 6, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  const internal = migrating as unknown as { database: Database.Database };
  assert.deepEqual(["legacy_evidence", "migration_batches", "migration_runs"].map((name) => internal.database.prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?").pluck().get(name)), [1, 1, 1]);
  assert.equal(migrating.schemaMigrationHistory()[6]?.name, "add_v1_migration_ledger");
  migrating.close();
});

test("schema v7 adds only nullable Project closure_summary after a validated backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DROP TABLE candidates; DROP TABLE associations; ALTER TABLE objects DROP COLUMN closure_json; DELETE FROM schema_migrations WHERE version >= 8");
  legacy.prepare("UPDATE schema_meta SET value = '7' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 7");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  const backupPath = join(root, "before-project-closure.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-21T12:10:00.000Z")), { migrated: true, fromVersion: 7, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  const internal = migrating as unknown as { database: Database.Database };
  assert.equal(internal.database.prepare("SELECT count(*) FROM pragma_table_info('objects') WHERE name = 'closure_json'").pluck().get(), 1);
  assert.equal(migrating.schemaMigrationHistory()[7]?.name, "add_project_closure_summary");
  migrating.close();
});

test("schema v8 adds only plain associations after preserving an exact v8 backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DROP TABLE candidates; DROP TABLE associations; DELETE FROM schema_migrations WHERE version >= 9");
  legacy.prepare("UPDATE schema_meta SET value = '8' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 8");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  assert.throws(() => migrating.initialize("graph-a"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED");
  const backupPath = join(root, "before-plain-associations.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-21T12:20:00.000Z")), { migrated: true, fromVersion: 8, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  assert.equal(backup.pragma("user_version", { simple: true }), 8);
  assert.equal(backup.prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'associations'").pluck().get(), 0);
  backup.close();
  const internal = migrating as unknown as { database: Database.Database };
  assert.equal(internal.database.prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'associations'").pluck().get(), 1);
  assert.equal(migrating.schemaMigrationHistory()[8]?.name, "add_plain_associations");
  migrating.close();
});

test("schema v9 adds only Candidate review state after preserving an exact v9 backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DROP TABLE candidates; DELETE FROM schema_migrations WHERE version >= 10");
  legacy.prepare("UPDATE schema_meta SET value = '9' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 9");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  assert.throws(() => migrating.initialize("graph-a"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED");
  const backupPath = join(root, "before-candidate-review.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-21T13:00:00.000Z")), { migrated: true, fromVersion: 9, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  assert.equal(backup.pragma("user_version", { simple: true }), 9);
  assert.equal(backup.prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'candidates'").pluck().get(), 0);
  backup.close();
  const internal = migrating as unknown as { database: Database.Database };
  assert.equal(internal.database.prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'candidates'").pluck().get(), 1);
  assert.equal(migrating.schemaMigrationHistory()[9]?.name, "add_candidate_review_state");
  migrating.close();
});

test("schema v10 reuses closure_json for MiniProject three-question Closure without losing object or Anchor data", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  const created = await application.materializeExplicitObject({
    objectId: "mini-v10", objectType: "MINI_PROJECT", text: "迁移后关闭", anchor: { graphId: "graph-a", externalId: "block-mini-v10", contentHash: "12345678" },
  }, { actor: "test", expectedVersion: 0, idempotencyKey: "mini-v10-create", traceId: "trace-create" });
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.exec("DELETE FROM schema_migrations WHERE version >= 11");
  legacy.prepare("UPDATE schema_meta SET value = '10' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 10");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  const backupPath = join(root, "before-mini-project-closure.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-22T09:00:00.000Z")), { migrated: true, fromVersion: 10, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  assert.equal(migrating.getObject(created.object.objectId)?.text, "迁移后关闭");
  assert.equal(migrating.getPrimaryAnchorByExternal("graph-a", "block-mini-v10")?.objectId, created.object.objectId);
  const migratedDatabase = new Database(path);
  assert.equal(migratedDatabase.pragma("foreign_keys", { simple: true }), 1);
  assert.throws(() => migratedDatabase.prepare("UPDATE objects SET closure_json = ? WHERE object_id = ?").run(JSON.stringify({ originalGoal: "x", actualResult: "y", remainingWork: "z" }), created.object.objectId), /constraint/i, "Closure cannot exist before MiniProject completion");
  migratedDatabase.close();
  const completed = await new V2Application(migrating).completeMiniProjectFromMarker({
    objectType: "MINI_PROJECT", text: "迁移后关闭", marker: "DONE", graphId: "graph-a", externalId: "block-mini-v10", contentHash: "12345678", expectedObjectId: created.object.objectId,
    closure: { originalGoal: "验证迁移", actualResult: "迁移和关闭均通过", remainingWork: "无遗留" },
  }, { actor: "proposal_commit", expectedVersion: created.object.version, idempotencyKey: "mini-v10-close", traceId: "trace-close" });
  assert.deepEqual(completed.object.closure, { originalGoal: "验证迁移", actualResult: "迁移和关闭均通过", remainingWork: "无遗留" });
  const archiveDatabase = new Database(path);
  archiveDatabase.prepare("UPDATE objects SET lifecycle = 'ARCHIVED' WHERE object_id = ?").run(created.object.objectId);
  assert.equal(JSON.parse(archiveDatabase.prepare("SELECT closure_json FROM objects WHERE object_id = ?").pluck().get(created.object.objectId) as string).actualResult, "迁移和关闭均通过", "archiving preserves the completion fact");
  archiveDatabase.close();
  assert.equal(migrating.getObject(created.object.objectId)?.lifecycle, "ARCHIVED");
  assert.equal(migrating.doctor().status, "PASS");
  migrating.close();
});

test("schema v11 adds one Project structure aggregate without adding a parallel authority", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const created = await new V2Application(store).createProjectWithPage({ objectId: "project-v11", name: "旧 Project", page: { graphId: "graph-a", externalId: "page-project-v11", contentHash: "12345678" } }, { actor: "test", expectedVersion: 0, idempotencyKey: "project-v11-create", traceId: "trace-project-v11" });
  store.close();
  const legacy = new Database(path);
  dropAgentGovernanceSchema(legacy);
  legacy.pragma("foreign_keys = OFF");
  legacy.exec(`
    CREATE TABLE objects_v11 (
      object_id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL CHECK (object_type IN ('AREA','PROJECT','MINI_PROJECT','TASK','DECISION','OUTPUT')),
      version INTEGER NOT NULL CHECK (version >= 1),
      lifecycle TEXT NOT NULL CHECK (lifecycle IN ('OPEN','COMPLETED','CANCELLED','ARCHIVED')),
      condition_json TEXT NOT NULL CHECK (json_valid(condition_json)),
      due_at TEXT,
      closure_json TEXT CHECK (closure_json IS NULL OR (object_type IN ('PROJECT','MINI_PROJECT') AND lifecycle IN ('COMPLETED','ARCHIVED') AND json_valid(closure_json))),
      text TEXT NOT NULL CHECK (length(trim(text)) > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_event TEXT NOT NULL
    ) STRICT;
    INSERT INTO objects_v11(object_id, object_type, version, lifecycle, condition_json, due_at, closure_json, text, created_at, updated_at, source_event)
      SELECT object_id, object_type, version, lifecycle, condition_json, due_at, closure_json, text, created_at, updated_at, source_event FROM objects;
    DROP TABLE objects;
    ALTER TABLE objects_v11 RENAME TO objects;
    DELETE FROM schema_migrations WHERE version >= 12;
    UPDATE schema_meta SET value = '11' WHERE key = 'schema_version';
    PRAGMA user_version = 11;
  `);
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  const backupPath = join(root, "before-project-structure.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-22T13:30:00.000Z")), { migrated: true, fromVersion: 11, schemaVersion: V2_DATABASE_SCHEMA_VERSION, backupPath });
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  assert.equal((backup.prepare("PRAGMA table_info(objects)").all() as Array<{ name: string }>).some(({ name }) => name === "project_structure_json"), false);
  backup.close();
  const project = migrating.getObject(created.object.objectId);
  assert.equal(project?.projectStructure?.currentSummary, "已迁移 Project，待明确目标与当前推进。");
  assert.deepEqual(project?.projectStructure?.currentFocuses, ["明确目标与下一步"]);
  assert.equal(migrating.getPrimaryAnchorByExternal("graph-a", "page-project-v11")?.objectId, created.object.objectId);
  const internal = migrating as unknown as { database: Database.Database };
  assert.equal(internal.database.prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name LIKE '%project_structure%'").pluck().get(), 0, "aggregate is a column, not a parallel table");
  assert.equal(migrating.doctor().status, "PASS");
  migrating.close();
});

test("schema v12 explicitly adds the minimal Agent governance tables after a validated backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-agent-governance");
  store.close();
  const legacy = new Database(path);
  legacy.exec(`
    DROP TABLE IF EXISTS agent_governance_settings;
    DROP TABLE IF EXISTS agent_decision_events;
    DROP TABLE IF EXISTS agent_review_signals;
    DROP TABLE IF EXISTS agent_rule_authorizations;
    DROP TABLE IF EXISTS agent_decisions;
    DELETE FROM schema_migrations WHERE version >= 13;
    UPDATE schema_meta SET value = '12' WHERE key = 'schema_version';
    PRAGMA user_version = 12;
  `);
  legacy.close();

  const migrating = await V2SqliteStore.open(path);
  assert.throws(
    () => migrating.initialize("graph-agent-governance"),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED",
  );
  const backupPath = join(root, "before-agent-governance.db");
  assert.deepEqual(
    await migrating.migrateSchema("graph-agent-governance", backupPath, new Date("2026-08-02T03:00:00.000Z")),
    { migrated: true, fromVersion: 12, schemaVersion: 14, backupPath },
  );
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  assert.equal(backup.pragma("user_version", { simple: true }), 12);
  assert.equal(backup.prepare("SELECT count(*) FROM sqlite_master WHERE name LIKE 'agent_%'").pluck().get(), 0);
  backup.close();
  const internal = migrating as unknown as { database: Database.Database };
  assert.deepEqual(
    (internal.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_%' ORDER BY name").pluck().all()),
    ["agent_decision_events", "agent_decisions", "agent_governance_settings", "agent_review_signals", "agent_rule_authorizations"],
  );
  assert.equal(migrating.schemaMigrationHistory()[12]?.name, "add_agent_decision_governance");
  migrating.close();
});

test("schema v14 adds one durable global Agent write-pause setting after a validated backup", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-agent-settings");
  store.close();
  const legacy = new Database(path);
  legacy.exec(`
    DROP TABLE agent_governance_settings;
    DELETE FROM schema_migrations WHERE version >= 14;
    UPDATE schema_meta SET value = '13' WHERE key = 'schema_version';
    PRAGMA user_version = 13;
  `);
  legacy.close();

  const migrating = await V2SqliteStore.open(path);
  const backupPath = join(root, "before-agent-settings.db");
  assert.deepEqual(
    await migrating.migrateSchema("graph-agent-settings", backupPath, new Date("2026-08-02T03:10:00.000Z")),
    { migrated: true, fromVersion: 13, schemaVersion: 14, backupPath },
  );
  assert.deepEqual(migrating.getAgentGovernanceSettings(), { globalWritesPaused: false, updatedAt: "2026-08-02T03:10:00.000Z" });
  const application = new AgentGovernanceApplication(migrating);
  const paused = await application.setGlobalWritesPaused(true, { actor: "user", traceId: "pause-all", idempotencyKey: "pause-all" }, new Date("2026-08-02T03:11:00.000Z"));
  assert.equal(paused.settings.globalWritesPaused, true);
  migrating.close();
  const reopened = await V2SqliteStore.open(path);
  assert.equal(reopened.getAgentGovernanceSettings()?.globalWritesPaused, true);
  reopened.close();
});

test("Agent governance persists one Decision Thread, meaningful Revision events, and reloadable history", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-agent-decisions");
  const application = new AgentGovernanceApplication(store);
  const decisionInput = {
    graphId: "graph-agent-decisions",
    sourceRoot: { kind: "BLOCK" as const, externalId: "block-1", pageName: "2026-08-02", durableOrigin: { kind: "BLOCK_UUID" as const, value: "block-1" } },
    sourceSnapshotHash: "a".repeat(8),
    outcome: "CREATE_CANDIDATE" as const,
    rule: { id: "EXPLICIT_TASK_01", displayName: "明确任务标记", skillName: "agent-decision-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
    riskRoute: "SHADOW" as const,
    executionStatus: "NOT_EXECUTED" as const,
    evidenceSummary: "明确任务标记",
    evidenceRefs: ["block:block-1"],
    counterSignals: [],
    closestAlternative: { outcome: "KEEP_ORDINARY" as const, reason: "若为引用则保持普通内容" },
    context: { tier: "LOCAL" as const, truncated: false, omittedSections: [], estimatedInputTokens: 128 },
  };
  const first = await application.recordDecision(decisionInput, { actor: "agent", traceId: "trace-1", idempotencyKey: "agent-decision-1" }, new Date("2026-08-02T04:00:00.000Z"));
  assert.equal(first.decision.revision, 1);
  assert.equal(first.revised, true);

  const refreshed = await application.recordDecision({ ...decisionInput, sourceSnapshotHash: "c".repeat(8), evidenceSummary: "正文轻微修订" }, { actor: "agent", traceId: "trace-2", idempotencyKey: "agent-decision-2" }, new Date("2026-08-02T04:01:00.000Z"));
  assert.equal(refreshed.revised, false);
  assert.equal(refreshed.decision.decisionId, first.decision.decisionId);
  assert.equal((await application.listDecisionEvents(first.decision.threadId)).length, 1, "source-only refresh does not create typo history");
  const governanceBackup = await store.backup(join(root, "backups", "agent-governance-r1.db"));

  const changed = await application.recordDecision({ ...decisionInput, sourceSnapshotHash: "d".repeat(8), outcome: "NEEDS_HUMAN", riskRoute: "HUMAN_REVIEW", counterSignals: ["目标不唯一"] }, { actor: "agent", traceId: "trace-3", idempotencyKey: "agent-decision-3" }, new Date("2026-08-02T04:02:00.000Z"));
  assert.equal(changed.decision.revision, 2);
  assert.equal((await application.listDecisionEvents(first.decision.threadId)).length, 2);
  store.close();

  const reopened = await V2SqliteStore.open(path);
  reopened.initialize("graph-agent-decisions");
  const [restored] = await new AgentGovernanceApplication(reopened).listDecisions({ limit: 10 });
  assert.equal(restored?.decisionId, changed.decision.decisionId);
  assert.equal(restored?.revision, 2);
  reopened.close();

  await V2SqliteStore.restoreOffline(path, governanceBackup, join(root, "backups", "agent-governance-r2-recovery.db"), "graph-agent-decisions");
  const restoredSnapshot = await V2SqliteStore.open(path);
  restoredSnapshot.initialize("graph-agent-decisions");
  const restoredSnapshotApplication = new AgentGovernanceApplication(restoredSnapshot);
  assert.equal((await restoredSnapshotApplication.listDecisions({ limit: 10 }))[0]?.revision, 1);
  assert.equal((await restoredSnapshotApplication.listDecisionEvents(first.decision.threadId)).length, 1);
  restoredSnapshot.close();
});

test("Agent feedback persists as a separate event, replays idempotently, and explicitly pauses only its rule", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-agent-feedback");
  const application = new AgentGovernanceApplication(store);
  await application.registerRule({
    ruleId: "EXPLICIT_TASK_01", displayName: "明确任务标记", skillName: "agent-decision-governance",
    skillVersion: "1.0.0", skillHash: "e".repeat(64), skillMaxAuthority: "AUTO_APPLY",
  }, { actor: "system", traceId: "trace-register-feedback-rule", idempotencyKey: "register-feedback-rule" }, new Date("2026-08-02T04:30:00.000Z"));
  const recorded = await application.recordDecision({
    graphId: "graph-agent-feedback",
    sourceRoot: { kind: "BLOCK", externalId: "feedback-block", durableOrigin: { kind: "BLOCK_UUID", value: "feedback-block" } },
    sourceSnapshotHash: "a".repeat(8), outcome: "CREATE_CANDIDATE",
    rule: { id: "EXPLICIT_TASK_01", displayName: "明确任务标记", skillName: "agent-decision-governance", skillVersion: "1.0.0", skillHash: "e".repeat(64) },
    riskRoute: "SHADOW", executionStatus: "NOT_EXECUTED", evidenceSummary: "明确任务标记",
    evidenceRefs: ["block:feedback-block"], counterSignals: [], closestAlternative: { outcome: "KEEP_ORDINARY" },
    context: { tier: "LOCAL", truncated: false, omittedSections: [], estimatedInputTokens: 64 },
  }, { actor: "agent", traceId: "trace-feedback-decision", idempotencyKey: "feedback-decision" }, new Date("2026-08-02T04:31:00.000Z"));

  const envelope = { actor: "user", traceId: "trace-feedback", idempotencyKey: "feedback-command" };
  const feedback = await application.recordFeedback(recorded.decision.decisionId, {
    rating: "WRONG", correctionType: "SHOULD_KEEP_ORDINARY", action: "PAUSE_RULE_AUTOMATION",
  }, envelope, new Date("2026-08-02T04:32:00.000Z"));
  assert.equal(feedback.event.eventType, "USER_FEEDBACK_ADDED");
  assert.equal(feedback.authorization?.paused, true);
  assert.equal(feedback.replayed, false);
  assert.equal((await application.recordFeedback(recorded.decision.decisionId, {
    rating: "WRONG", correctionType: "SHOULD_KEEP_ORDINARY", action: "PAUSE_RULE_AUTOMATION",
  }, envelope, new Date("2026-08-02T04:32:00.000Z"))).replayed, true);
  assert.deepEqual((await application.listDecisionEvents(recorded.decision.threadId)).map((event) => event.eventType), ["SOURCE_OBSERVED", "USER_FEEDBACK_ADDED"]);
  const exported = await application.exportSkillFeedback({ since: "2026-08-01T00:00:00.000Z", until: "2026-08-03T00:00:00.000Z" }, new Date("2026-08-03T00:00:00.000Z"));
  assert.equal(exported.manifest.includedCount, 1);
  assert.match(exported.files["data/summary.json"]!, /"feedbackCount":1/);
  store.close();

  const reopened = await V2SqliteStore.open(path);
  reopened.initialize("graph-agent-feedback");
  const restored = new AgentGovernanceApplication(reopened);
  assert.equal((await restored.listRuleAuthorizations())[0]?.paused, true);
  assert.equal((await restored.listDecisionEvents(recorded.decision.threadId))[1]?.payload.rating, "WRONG");
  reopened.close();
});

test("Agent Rule authorization persists explicit user promotion and system-only downgrade semantics", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-agent-rule-authority");
  const application = new AgentGovernanceApplication(store);
  const registered = await application.registerRule({
    ruleId: "EXPLICIT_TASK_01",
    displayName: "明确任务标记",
    skillName: "agent-decision-governance",
    skillVersion: "1.0.0",
    skillHash: "e".repeat(64),
    skillMaxAuthority: "AUTO_APPLY",
  }, { actor: "system", traceId: "trace-rule-register", idempotencyKey: "rule-register-1" }, new Date("2026-08-02T04:10:00.000Z"));
  assert.equal(registered.authorization.effectiveAuthority, "SHADOW");
  await assert.rejects(
    () => application.authorizeRule(registered.authorization.ruleId, "BATCH_REVIEW", "模型建议升权", { actor: "agent", traceId: "trace-rule-invalid-promote", idempotencyKey: "rule-promote-invalid" }, new Date("2026-08-02T04:11:00.000Z")),
    /USER/,
  );
  const promoted = await application.authorizeRule(registered.authorization.ruleId, "AUTO_APPLY", "用户明确批准", { actor: "user", traceId: "trace-rule-promote", idempotencyKey: "rule-promote-1" }, new Date("2026-08-02T04:12:00.000Z"));
  assert.equal(promoted.authorization.effectiveAuthority, "AUTO_APPLY");
  const downgraded = await application.autoDowngradeRule(registered.authorization.ruleId, "目标对象错误率升高", { actor: "system", traceId: "trace-rule-downgrade", idempotencyKey: "rule-downgrade-1" }, new Date("2026-08-02T04:13:00.000Z"));
  assert.equal(downgraded.authorization.effectiveAuthority, "DELAYED_APPLY");
  store.close();

  const reopened = await V2SqliteStore.open(path);
  reopened.initialize("graph-agent-rule-authority");
  const [restored] = await new AgentGovernanceApplication(reopened).listRuleAuthorizations();
  assert.equal(restored?.localCurrentAuthority, "DELAYED_APPLY");
  reopened.close();
});

test("Review Signal persistence deduplicates a Source Root and preserves source-missing lifecycle across restart", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-review-signal");
  const application = new AgentGovernanceApplication(store);
  const input = {
    graphId: "graph-review-signal",
    sourceRoot: { kind: "BLOCK" as const, externalId: "weak-block-1", durableOrigin: { kind: "BLOCK_UUID" as const, value: "weak-block-1" } },
    capturedSnapshotHash: "f".repeat(8),
    capturedText: "以后可能需要整理监控告警。",
    category: "POSSIBLE_ACTION",
    relatedObjectIds: [],
    revisitReason: "弱行动信号",
    createdByDecisionId: "agent-thread-review:r1",
  };
  const first = await application.recordReviewSignal(input, { actor: "agent", traceId: "trace-signal-1", idempotencyKey: "review-signal-1" }, new Date("2026-08-02T04:20:00.000Z"));
  const repeated = await application.recordReviewSignal({ ...input, capturedSnapshotHash: "a".repeat(8), capturedText: "监控告警整理再次出现。" }, { actor: "agent", traceId: "trace-signal-2", idempotencyKey: "review-signal-2" }, new Date("2026-08-03T04:20:00.000Z"));
  assert.equal(repeated.signal.reviewSignalId, first.signal.reviewSignalId);
  assert.equal(repeated.signal.occurrenceCount, 2);
  assert.equal((await application.listReviewSignals({ status: "ACTIVE", limit: 10 })).length, 1);
  const reviewMaterial = await application.prepareReviewEvidenceExport(60, new Date("2026-08-04T04:20:00.000Z"));
  assert.equal(reviewMaterial.sourceTotal, 1);
  assert.equal(reviewMaterial.signals[0]?.occurrenceCount, 2);
  store.close();

  const reopened = await V2SqliteStore.open(path);
  reopened.initialize("graph-review-signal");
  const restoredApplication = new AgentGovernanceApplication(reopened);
  const missing = await restoredApplication.reconcileReviewSignal(first.signal.reviewSignalId, false, { actor: "system", traceId: "trace-signal-missing", idempotencyKey: "review-signal-missing" }, new Date("2026-08-04T04:20:00.000Z"));
  assert.equal(missing.signal.status, "SOURCE_MISSING");
  assert.equal((await restoredApplication.listReviewSignals({ status: "SOURCE_MISSING", limit: 10 }))[0]?.occurrenceCount, 2);
  reopened.close();
});

function validProposal(): V2Proposal {
  const beforeText = "梳理告警";
  const afterText = "[任务] 梳理告警";
  return {
    proposalId: "prop_sqlite", schemaVersion: "v2", title: "正式化告警梳理", context: "当前普通正文。", understanding: "建议 Task。", objective: "可追踪。", logic: "正文与语义绑定。", finalPreview: afterText, unresolvedQuestions: [], source: { kind: "user" },
    scope: { read: [], modify: [{ kind: "BLOCK", id: "block-sqlite", version: 1, hash: checksum(beforeText) }] }, preconditions: [],
    groups: [{ groupId: "formalize", explanation: "不可拆组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-sqlite", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-sqlite", version: 1, hash: checksum(beforeText) }, summary: "创建 Task", payload: { objectType: "TASK", text: "梳理告警" }, preconditions: [] }], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-20T12:00:00.000Z",
  };
}

test("Candidate persistence deduplicates stable source identity, remembers dispositions, and reopens only changed source", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2CandidateApplication(store);
  const envelope = (idempotencyKey: string) => ({ actor: "plugin", traceId: idempotencyKey, idempotencyKey });
  const input = { candidateId: "candidate:block-1:WORK_ITEM", sourceAnchorId: "block-1", sourceVersion: "1:hash-a", candidateKind: "WORK_ITEM" as const, reason: "包含可执行动作", suggestion: "正式化为 Task" };
  const discovered = await application.discover(input, envelope("candidate-discover-1"), new Date("2026-07-21T13:10:00.000Z"));
  assert.equal(discovered.replayed, false);
  const dismissed = await application.setDisposition(discovered.candidate.candidateId, "DISMISSED", { reason: "只是会议记录" }, discovered.candidate.updatedAt, envelope("candidate-dismiss-1"), new Date("2026-07-21T13:11:00.000Z"));
  assert.equal(dismissed.candidate.disposition, "DISMISSED");

  const exact = await application.discover({ ...input, candidateId: "different-id" }, envelope("candidate-discover-2"), new Date("2026-07-21T13:12:00.000Z"));
  assert.equal(exact.replayed, true);
  assert.equal(exact.candidate.disposition, "DISMISSED", "same source version must remember the user's decision");
  assert.equal(exact.candidate.candidateId, discovered.candidate.candidateId);

  const changed = await application.discover({ ...input, candidateId: "different-id", sourceVersion: "2:hash-b", reason: "正文已新增明确动作" }, envelope("candidate-discover-3"), new Date("2026-07-21T13:13:00.000Z"));
  assert.equal(changed.replayed, false);
  assert.equal(changed.candidate.candidateId, discovered.candidate.candidateId);
  assert.equal(changed.candidate.disposition, "PENDING");
  assert.equal(changed.candidate.dispositionReason, undefined);
  const suppressed = await application.setDisposition(changed.candidate.candidateId, "NO_MORE_LIKE_THIS", { reason: "此来源不再建议工作项" }, changed.candidate.updatedAt, envelope("candidate-suppress-1"), new Date("2026-07-21T13:14:00.000Z"));
  const suppressedAfterEdit = await application.discover({ ...input, candidateId: "another-id", sourceVersion: "3:hash-c", reason: "正文再次变化" }, envelope("candidate-discover-4"), new Date("2026-07-21T13:15:00.000Z"));
  assert.equal(suppressedAfterEdit.candidate.disposition, "NO_MORE_LIKE_THIS", "stable source and Candidate kind preserve suppression across ordinary source edits");
  assert.equal(suppressedAfterEdit.candidate.dispositionReason, suppressed.candidate.dispositionReason);
  assert.equal(suppressedAfterEdit.candidate.sourceVersion, "3:hash-c", "suppressed Candidate still records the latest analyzed source version without reopening");
  const differentSuggestion = await application.discover({ ...input, candidateId: "yet-another-id", sourceVersion: "4:hash-d", suggestion: "改为 MiniProject 正式化 Proposal" }, envelope("candidate-discover-5"), new Date("2026-07-21T13:16:00.000Z"));
  assert.equal(differentSuggestion.candidate.disposition, "PENDING", "a materially different recommendation is not hidden by an older suppression on the same source");
  assert.equal(store.listCandidates().length, 1);
  store.close();
});

test("Candidate updates are idempotent, optimistic, and allow only one persisted active Proposal", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2CandidateApplication(store);
  const envelope = (idempotencyKey: string) => ({ actor: "plugin", traceId: idempotencyKey, idempotencyKey });
  const discovered = await application.discover({ candidateId: "candidate:block-2:WORK_ITEM", sourceAnchorId: "block-2", sourceVersion: "1:hash", candidateKind: "WORK_ITEM", reason: "包含动作", suggestion: "正式化" }, envelope("candidate-2-discover"), new Date("2026-07-21T13:20:00.000Z"));
  const later = await application.setDisposition(discovered.candidate.candidateId, "LATER", { reason: "下周再决定", deferredUntil: "2026-07-28T13:20:00.000Z" }, discovered.candidate.updatedAt, envelope("candidate-2-later"), new Date("2026-07-21T13:21:00.000Z"));
  const replay = await application.setDisposition(discovered.candidate.candidateId, "LATER", { reason: "重复请求", deferredUntil: "2026-07-29T13:20:00.000Z" }, discovered.candidate.updatedAt, envelope("candidate-2-later"), new Date("2026-07-21T13:22:00.000Z"));
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.candidate, later.candidate);
  await assert.rejects(() => application.setDisposition(discovered.candidate.candidateId, "DISMISSED", { reason: "过期视图" }, discovered.candidate.updatedAt, envelope("candidate-2-stale"), new Date("2026-07-21T13:23:00.000Z")), /已变化/);

  const proposal = validProposal();
  store.submitProposal(proposal, renderV2ProposalFiles(proposal));
  const linked = await application.linkProposal(later.candidate.candidateId, proposal.proposalId, later.candidate.updatedAt, envelope("candidate-2-link"), new Date("2026-07-21T13:24:00.000Z"));
  assert.equal(linked.candidate.activeProposalId, proposal.proposalId);
  assert.deepEqual(store.candidateForProposal(proposal.proposalId), linked.candidate);
  await assert.rejects(() => application.linkProposal(linked.candidate.candidateId, "proposal-other", linked.candidate.updatedAt, envelope("candidate-2-link-other")), /当前 Proposal/);
  const refreshed = await application.discover({ candidateId: "ignored-new-id", sourceAnchorId: "block-2", sourceVersion: "2:changed", candidateKind: "WORK_ITEM", reason: "来源正文已变化", suggestion: "重新审阅" }, envelope("candidate-2-refresh"), new Date("2026-07-21T13:25:00.000Z"));
  assert.equal(refreshed.candidate.activeProposalId, undefined);
  assert.equal(store.storedProposal(proposal.proposalId)?.proposal.status, "STALE", "source changes stale the old current Proposal before reopening Candidate");
  store.close();
});

test("validated Proposal and group metadata persist atomically and replay only exact content", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const proposal = validProposal();
  const files = renderV2ProposalFiles(proposal);
  assert.equal(store.submitProposal(proposal, files).replayed, false);
  assert.equal(store.submitProposal(proposal, files).replayed, true);
  assert.deepEqual(store.storedProposal(proposal.proposalId)?.proposal, proposal);
  assert.equal(store.listStoredProposals().length, 1);
  const conflicting = { ...proposal, title: "不同内容" };
  assert.throws(() => store.submitProposal(conflicting, renderV2ProposalFiles(conflicting)), /内容不同/);
  assert.equal(store.listStoredProposals().length, 1);
  store.close();
});

test("SemanticCommit ledger is pending-first, transition-checked, idempotent, and restart-queryable", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const at = "2026-07-20T11:00:00.000Z";
  const commit = {
    semanticCommitId: "commit-ledger-1",
    proposalId: "proposal-1",
    status: "PENDING" as const,
    beforeStateChecksum: "before-state",
    createdAt: at,
    updatedAt: at,
  };
  const steps = [
    { semanticCommitId: commit.semanticCommitId, stepIndex: 0, stepKind: "GRAPH_WRITE" as const, status: "PREPARED" as const, operationId: "operation-1", beforeHash: "before", afterHash: "after", updatedAt: at },
    { semanticCommitId: commit.semanticCommitId, stepIndex: 1, stepKind: "DOMAIN_WRITE" as const, status: "PREPARED" as const, operationId: "operation-1", updatedAt: at },
  ];
  assert.deepEqual(store.prepareSemanticCommit(commit, steps), { replayed: false });
  assert.deepEqual(store.prepareSemanticCommit(commit, steps), { replayed: true });
  assert.throws(() => store.advanceSemanticCommitStep(commit.semanticCommitId, 0, "VERIFIED", at), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_COMMIT_STEP_TRANSITION_INVALID");
  assert.throws(() => store.finalizeSemanticCommit(commit.semanticCommitId, "COMPLETED", at, "after-state"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SEMANTIC_COMMIT_NOT_VERIFIED");
  store.advanceSemanticCommitStep(commit.semanticCommitId, 0, "APPLIED", at);
  store.advanceSemanticCommitStep(commit.semanticCommitId, 0, "VERIFIED", at);
  assert.deepEqual(store.prepareSemanticCommit(commit, steps), { replayed: true }, "prepare replay remains idempotent after step progress");
  store.advanceSemanticCommitStep(commit.semanticCommitId, 1, "APPLIED", at);
  store.advanceSemanticCommitStep(commit.semanticCommitId, 1, "VERIFIED", at);
  assert.equal(store.finalizeSemanticCommit(commit.semanticCommitId, "COMPLETED", at, "after-state").status, "COMPLETED");
  assert.deepEqual(store.unresolvedSemanticCommits(), []);
  store.close();
});

test("SemanticCommit recovery cannot report FAILED until every applied step is compensated", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const at = "2026-07-20T12:00:00.000Z";
  const commit = { semanticCommitId: "commit-recovery-1", status: "PENDING" as const, beforeStateChecksum: "before", createdAt: at, updatedAt: at };
  const steps = [{ semanticCommitId: commit.semanticCommitId, stepIndex: 0, stepKind: "GRAPH_WRITE" as const, status: "PREPARED" as const, beforeHash: "before", afterHash: "after", updatedAt: at }];
  store.prepareSemanticCommit(commit, steps);
  store.advanceSemanticCommitStep(commit.semanticCommitId, 0, "APPLIED", at);
  store.advanceSemanticCommitStep(commit.semanticCommitId, 0, "RECOVERY_REQUIRED", at, "COMPENSATION_FAILED");
  assert.equal(store.finalizeSemanticCommit(commit.semanticCommitId, "RECOVERY_REQUIRED", at, undefined, "COMPENSATION_FAILED").status, "RECOVERY_REQUIRED");
  store.close();

  const reopened = await V2SqliteStore.open(path);
  assert.deepEqual(reopened.unresolvedSemanticCommits().map((value) => value.semanticCommitId), [commit.semanticCommitId]);
  reopened.advanceSemanticCommitStep(commit.semanticCommitId, 0, "COMPENSATED", at);
  assert.equal(reopened.finalizeSemanticCommit(commit.semanticCommitId, "FAILED", at, undefined, "COMMIT_FAILED").status, "FAILED");
  assert.deepEqual(reopened.unresolvedSemanticCommits(), []);
  reopened.close();
});

test("a prepared SemanticCommit step can durably bind one actual Graph identity before execution", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const at = "2026-07-20T11:30:00.000Z";
  const semanticCommitId = "commit-bind-graph-evidence";
  store.prepareSemanticCommit({
    semanticCommitId,
    status: "PENDING",
    beforeStateChecksum: "before",
    createdAt: at,
    updatedAt: at,
  }, [{
    semanticCommitId,
    stepIndex: 0,
    stepKind: "GRAPH_WRITE",
    status: "PREPARED",
    operationId: "Project/设备治理",
    updatedAt: at,
  }]);
  const bound = store.recordPreparedSemanticCommitStepEvidence(semanticCommitId, 0, { operationId: "page-uuid", afterHash: "deadbeef" }, at);
  assert.equal(bound.operationId, "page-uuid");
  assert.equal(bound.afterHash, "deadbeef");
  assert.deepEqual(store.recordPreparedSemanticCommitStepEvidence(semanticCommitId, 0, { operationId: "page-uuid", afterHash: "deadbeef" }, at), bound);
  assert.throws(
    () => store.recordPreparedSemanticCommitStepEvidence(semanticCommitId, 0, { operationId: "other-page", afterHash: "cafebabe" }, at),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_COMMIT_STEP_EVIDENCE_CONFLICT",
  );
});

test("a verified Graph step can enter compensation when a later Domain step fails", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const at = "2026-07-20T12:30:00.000Z";
  const semanticCommitId = "commit-verified-graph-compensation";
  store.prepareSemanticCommit({ semanticCommitId, status: "PENDING", beforeStateChecksum: "before", createdAt: at, updatedAt: at }, [
    { semanticCommitId, stepIndex: 0, stepKind: "GRAPH_WRITE", status: "PREPARED", beforeHash: "before", afterHash: "after", updatedAt: at },
    { semanticCommitId, stepIndex: 1, stepKind: "DOMAIN_WRITE", status: "PREPARED", updatedAt: at },
  ]);
  store.advanceSemanticCommitStep(semanticCommitId, 0, "APPLIED", at);
  store.advanceSemanticCommitStep(semanticCommitId, 0, "VERIFIED", at);
  store.advanceSemanticCommitStep(semanticCommitId, 0, "RECOVERY_REQUIRED", at, "DOMAIN_WRITE_FAILED");
  assert.equal(store.finalizeSemanticCommit(semanticCommitId, "RECOVERY_REQUIRED", at, undefined, "DOMAIN_WRITE_FAILED").status, "RECOVERY_REQUIRED");
  store.advanceSemanticCommitStep(semanticCommitId, 0, "COMPENSATED", at);
  assert.equal(store.finalizeSemanticCommit(semanticCommitId, "FAILED", at, undefined, "DOMAIN_WRITE_FAILED").status, "FAILED");
  store.close();
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

test("offline restore creates a recovery point, atomically activates the snapshot, and reopens cleanly", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  await application.createObject(
    { objectId: "before-restore", objectType: "TASK", text: "恢复前" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "before-restore", traceId: "before-restore" },
  );
  const source = await store.backup(join(root, "backups", "source.db"));
  await application.createObject(
    { objectId: "after-snapshot", objectType: "TASK", text: "快照后" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "after-snapshot", traceId: "after-snapshot" },
  );
  store.close();

  const recovery = join(root, "backups", "before-restore.db");
  const result = await V2SqliteStore.restoreOffline(path, source, recovery, "graph-a");
  assert.equal(result.validation.objectCount, 1);
  assert.equal(V2SqliteStore.validateBackup(recovery, "graph-a").objectCount, 2);
  const restored = await V2SqliteStore.open(path);
  assert.equal(restored.getObject("before-restore")?.text, "恢复前");
  assert.equal(restored.getObject("after-snapshot"), undefined);
  assert.equal(restored.doctor().status, "PASS");
  restored.close();
});

test("offline restore rolls the active database back when post-activation validation fails", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  await application.createObject(
    { objectId: "snapshot-object", objectType: "TASK", text: "快照" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "snapshot-object", traceId: "snapshot-object" },
  );
  const source = await store.backup(join(root, "backups", "rollback-source.db"));
  await application.createObject(
    { objectId: "must-survive", objectType: "TASK", text: "必须保留" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "must-survive", traceId: "must-survive" },
  );
  store.close();

  await assert.rejects(
    () => V2SqliteStore.restoreOffline(path, source, join(root, "backups", "rollback-recovery.db"), "graph-a", {
      afterActivate: () => { throw new Error("injected post-activate failure"); },
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_RESTORE_FAILED",
  );
  const reopened = await V2SqliteStore.open(path);
  assert.equal(reopened.getObject("must-survive")?.text, "必须保留");
  assert.equal(reopened.doctor().status, "PASS");
  reopened.close();
});

test("offline restore refuses path collisions and a missing active database before creating recovery artifacts", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const source = await store.backup(join(root, "backups", "guard-source.db"));
  store.close();
  await assert.rejects(
    () => V2SqliteStore.restoreOffline(path, source, source, "graph-a"),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_RESTORE_PATH_COLLISION",
  );
  await assert.rejects(
    () => V2SqliteStore.restoreOffline(join(root, "missing.db"), source, join(root, "missing-recovery.db"), "graph-a"),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_RESTORE_ACTIVE_MISSING",
  );
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
  const associated = await application.addAssociation("task-1", "project-1", { actor: "test", expectedVersion: 3, idempotencyKey: "associate-project", traceId: "trace-associate" });
  assert.equal(associated.object.version, 4);
  assert.equal(store.listAssociations()[0]?.targetObjectId, "project-1");
  assert.equal(store.listPrimaryOwnerships()[0]?.ownerObjectId, "project-1", "Association does not replace Primary Ownership");
  await assert.rejects(() => application.addAssociation("task-1", "project-1", { actor: "test", expectedVersion: 4, idempotencyKey: "associate-duplicate", traceId: "trace-associate-duplicate" }), /已存在/);
  assert.equal(store.getObject("task-1")?.version, 4, "duplicate Association rolls back object version");
  await application.createObject({ objectId: "area-owner", objectType: "AREA", text: "新归属" }, { actor: "test", expectedVersion: 0, idempotencyKey: "create-area-owner", traceId: "trace-area-owner" });
  await application.bindPrimaryAnchor("area-owner", { anchorId: "area-owner-anchor", graphId: "graph-a", externalId: "page-area-owner", contentHash: "area-owner-hash" }, { actor: "test", expectedVersion: 1, idempotencyKey: "bind-area-owner", traceId: "trace-bind-area-owner" });
  await assert.rejects(() => application.changePrimaryOwner("task-1", "area-owner", 1, "project-1", { actor: "proposal_commit", expectedVersion: 4, idempotencyKey: "change-primary-owner-stale-target", traceId: "trace-change-owner-stale-target" }), /版本/);
  assert.equal(store.getObject("task-1")?.version, 4, "stale new Owner version rolls back the entire Ownership transaction");
  assert.equal(store.listPrimaryOwnerships()[0]?.ownerObjectId, "project-1");
  const changedOwner = await application.changePrimaryOwner("task-1", "area-owner", 2, "project-1", { actor: "proposal_commit", expectedVersion: 4, idempotencyKey: "change-primary-owner", traceId: "trace-change-owner" });
  assert.equal(changedOwner.object.version, 5);
  assert.equal(changedOwner.previousOwnerId, "project-1");
  assert.equal(store.listPrimaryOwnerships()[0]?.ownerObjectId, "area-owner");
  await assert.rejects(() => application.changePrimaryOwner("task-1", "project-1", 1, "other-old-owner", { actor: "proposal_commit", expectedVersion: 5, idempotencyKey: "change-primary-owner-stale", traceId: "trace-change-owner-stale" }), /已变化/);
  assert.equal(store.getObject("task-1")?.version, 5, "stale current Owner rolls back object update");
  const undoneOwner = await application.undoPrimaryOwnerChange("task-1", "area-owner", changedOwner.previousOwnerId, { actor: "user", expectedVersion: 5, idempotencyKey: "undo-primary-owner-change", traceId: "trace-undo-primary-owner-change" });
  assert.equal(undoneOwner.object.version, 6);
  assert.equal(undoneOwner.ownership?.ownerObjectId, "project-1");
  assert.equal(store.listPrimaryOwnerships()[0]?.ownerObjectId, "project-1");
  assert.equal((await application.undoPrimaryOwnerChange("task-1", "area-owner", changedOwner.previousOwnerId, { actor: "user", expectedVersion: 5, idempotencyKey: "undo-primary-owner-change", traceId: "trace-undo-primary-owner-change" })).replayed, true);
  await assert.rejects(() => application.undoPrimaryOwnerChange("task-1", "area-owner", "project-1", { actor: "user", expectedVersion: 6, idempotencyKey: "undo-primary-owner-stale", traceId: "trace-undo-primary-owner-stale" }), /后续变化/);
  assert.equal(store.getObject("task-1")?.version, 6);
  assert.equal(store.auditEventCount(), 9);
  store.close();
});

test("explicit materialization atomically persists Object, Primary Anchor, audit, and receipt", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  const envelope = { actor: "logseq-plugin", expectedVersion: 0, idempotencyKey: "materialize-block-1", traceId: "trace-materialize" };
  const created = await application.materializeExplicitObject({
    objectId: "task-materialized",
    objectType: "TASK",
    text: "核对时间同步来源",
    anchor: { anchorId: "anchor-materialized", graphId: "graph-a", externalId: "block-1", contentHash: "hash-1" },
  }, envelope, new Date("2026-07-20T07:00:00Z"));
  assert.equal(created.replayed, false);
  assert.equal(store.getObject("task-materialized")?.version, 2);
  assert.equal(store.auditEventCount(), 1);

  const replay = await application.materializeExplicitObject({
    objectId: "ignored-object",
    objectType: "TASK",
    text: "不得覆盖",
    anchor: { graphId: "graph-a", externalId: "ignored-block", contentHash: "ignored-hash" },
  }, envelope);
  assert.equal(replay.replayed, true);
  assert.equal(replay.anchor.anchorId, "anchor-materialized");

  await assert.rejects(() => application.materializeExplicitObject({
    objectId: "must-roll-back",
    objectType: "TASK",
    text: "不得复制同一个 Primary Anchor",
    anchor: { graphId: "graph-a", externalId: "block-1", contentHash: "hash-2" },
  }, { actor: "logseq-plugin", expectedVersion: 0, idempotencyKey: "materialize-duplicate", traceId: "trace-duplicate" }), /已经绑定/);
  assert.equal(store.getObject("must-roll-back"), undefined);
  assert.equal(store.auditEventCount(), 1);
  assert.equal(store.doctor().objectCount, 1);

  const synchronized = await application.synchronizeExplicitObject({
    objectType: "TASK",
    text: "核对时间同步来源并保存证据",
    graphId: "graph-a",
    externalId: "block-1",
    contentHash: "22222222",
  }, { actor: "logseq-plugin", expectedVersion: 2, idempotencyKey: "sync-block-1", traceId: "trace-sync" }, new Date("2026-07-20T07:01:00Z"));
  assert.equal(synchronized.object.version, 3);
  assert.equal(synchronized.anchor.contentHash, "22222222");
  assert.equal(store.getPrimaryAnchorByExternal("graph-a", "block-1")?.contentHash, "22222222");
  await assert.rejects(() => application.synchronizeExplicitObject({
    objectType: "MINI_PROJECT",
    text: "不得静默升级",
    graphId: "graph-a",
    externalId: "block-1",
    contentHash: "33333333",
  }, { actor: "logseq-plugin", expectedVersion: 3, idempotencyKey: "sync-type", traceId: "trace-type" }), /Proposal/);
  assert.equal(store.getObject("task-materialized")?.objectType, "TASK");
  assert.equal(store.auditEventCount(), 2);

  const missing = await application.observePrimaryAnchor({ anchorId: "anchor-materialized", status: "missing" }, {
    actor: "logseq-plugin", expectedVersion: 3, idempotencyKey: "observe-block-1-missing-v3", traceId: "trace-missing",
  }, new Date("2026-07-20T07:02:00Z"));
  assert.equal(missing.anchor.status, "missing");
  assert.equal(store.getPrimaryAnchorByExternal("graph-a", "block-1")?.status, "missing");
  assert.equal(store.listPrimaryAnchors("graph-a")[0]?.status, "missing");
  assert.equal(store.getObject("task-materialized")?.version, 4, "Anchor observation and object version must commit atomically");
  assert.deepEqual(store.operationalDiagnostics(), {
    missingAnchorCount: 1,
    conflictAnchorCount: 0,
    multiplePrimaryAnchorObjectCount: 0,
    staleProposalCount: 0,
    pendingCommitCount: 0,
    recoveryRequiredCommitCount: 0,
    invalidIdentityCount: 0,
  });

  const recovered = await application.synchronizeExplicitObject({
    objectType: "TASK",
    text: "核对时间同步来源并保存证据",
    graphId: "graph-a",
    externalId: "block-1",
    contentHash: "22222222",
  }, { actor: "logseq-plugin", expectedVersion: 4, idempotencyKey: "recover-block-1", traceId: "trace-recover" }, new Date("2026-07-20T07:03:00Z"));
  assert.equal(recovered.anchor.status, "active");
  assert.equal(store.getObject("task-materialized")?.version, 5);
  assert.equal(store.auditEventCount(), 4);

  await assert.rejects(() => application.observePrimaryAnchor({ anchorId: "anchor-materialized", status: "conflict" }, {
    actor: "logseq-plugin", expectedVersion: 4, idempotencyKey: "observe-stale-v4", traceId: "trace-stale-observation",
  }), /版本/);
  assert.equal(store.getPrimaryAnchorById("anchor-materialized")?.status, "active");

  const faultConnection = new Database(path);
  faultConnection.exec(`
    CREATE TRIGGER inject_rebind_anchor_failure
    BEFORE INSERT ON anchors
    WHEN NEW.external_id = 'block-rebind-failure'
    BEGIN
      SELECT RAISE(ABORT, 'injected rebind anchor failure');
    END;
  `);
  faultConnection.close();
  await assert.rejects(() => application.rebindPrimaryAnchor({
    previousAnchorId: "anchor-materialized",
    expectedAnchorStatus: "active",
    expectedAnchorContentHash: "22222222",
    objectType: "TASK",
    text: "不得留下半写",
    graphId: "graph-a",
    externalId: "block-rebind-failure",
    contentHash: "44444444",
    confirmation: "REBIND_PRIMARY_ANCHOR",
  }, { actor: "logseq-plugin", expectedVersion: 5, idempotencyKey: "rebind-injected-failure", traceId: "trace-rebind-failure" }), /injected rebind anchor failure/);
  assert.equal(store.getObject("task-materialized")?.version, 5, "injected failure must roll back the object update");
  assert.equal(store.getObject("task-materialized")?.text, "核对时间同步来源并保存证据");
  assert.equal(store.getPrimaryAnchorById("anchor-materialized")?.status, "active", "injected failure must roll back replaced status");
  assert.equal(store.getPrimaryAnchorByExternal("graph-a", "block-rebind-failure"), undefined);
  assert.equal(store.getCommandReceipt("rebind-injected-failure"), undefined);
  assert.equal(store.auditEventCount(), 4);

  const rebound = await application.rebindPrimaryAnchor({
    previousAnchorId: "anchor-materialized",
    expectedAnchorStatus: "active",
    expectedAnchorContentHash: "22222222",
    objectType: "TASK",
    text: "新的主正文",
    graphId: "graph-a",
    externalId: "block-rebound",
    contentHash: "44444444",
    confirmation: "REBIND_PRIMARY_ANCHOR",
  }, { actor: "logseq-plugin", expectedVersion: 5, idempotencyKey: "rebind-block", traceId: "trace-rebind" }, new Date("2026-07-20T07:04:00Z"));
  assert.equal(rebound.object.version, 6);
  assert.equal(rebound.previousAnchor.status, "replaced");
  assert.equal(store.getPrimaryAnchorById("anchor-materialized")?.status, "replaced");
  assert.equal(store.getPrimaryAnchorByExternal("graph-a", "block-1"), undefined);
  assert.equal(store.getPrimaryAnchorByExternal("graph-a", "block-rebound")?.status, "active");
  assert.deepEqual(store.listPrimaryAnchors("graph-a").map((anchor) => anchor.externalId), ["block-rebound"]);
  assert.deepEqual(store.listPrimaryAnchors("graph-a", undefined, 257, true).map((anchor) => anchor.externalId), ["block-1", "block-rebound"]);
  await assert.rejects(() => application.rebindPrimaryAnchor({
    previousAnchorId: rebound.anchor.anchorId,
    expectedAnchorStatus: "active",
    expectedAnchorContentHash: "44444444",
    objectType: "TASK",
    text: "不得复用历史 UUID",
    graphId: "graph-a",
    externalId: "block-1",
    contentHash: "55555555",
    confirmation: "REBIND_PRIMARY_ANCHOR",
  }, { actor: "logseq-plugin", expectedVersion: 6, idempotencyKey: "rebind-to-history", traceId: "trace-history" }), /已有 Primary Anchor/);
  assert.equal(store.getObject("task-materialized")?.version, 6, "failed rebind must roll back object and both Anchor writes");
  assert.equal(store.auditEventCount(), 5);
  store.close();
});

test("materialization Undo preserves Audit while deleting only an unchanged current projection", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  const created = await application.materializeExplicitObject({
    objectId: "task-undo", objectType: "TASK", text: "核对告警", anchor: { anchorId: "anchor-undo", graphId: "graph-a", externalId: "block-undo", contentHash: "after-hash" },
  }, { actor: "proposal_commit", expectedVersion: 0, idempotencyKey: "materialize-undo-source", traceId: "trace-source" });
  const result = await application.undoMaterialization(created, {
    actor: "user", expectedVersion: created.object.version, idempotencyKey: "undo-materialize", traceId: "trace-undo",
  });
  assert.equal(result.replayed, false);
  assert.equal(store.getObject(created.object.objectId), undefined);
  assert.equal(store.getPrimaryAnchorById(created.anchor.anchorId), undefined);
  assert.equal(store.auditEventCount(), 2, "creation and inverse audit remain immutable");
  assert.equal((await application.undoMaterialization(created, { actor: "user", expectedVersion: created.object.version, idempotencyKey: "undo-materialize", traceId: "trace-undo" })).replayed, true);

  const changed = await application.materializeExplicitObject({
    objectId: "task-changed", objectType: "TASK", text: "原始", anchor: { anchorId: "anchor-changed", graphId: "graph-a", externalId: "block-changed", contentHash: "hash-original" },
  }, { actor: "proposal_commit", expectedVersion: 0, idempotencyKey: "materialize-changed", traceId: "trace-changed" });
  await application.synchronizeExplicitObject({ objectType: "TASK", text: "后续编辑", graphId: "graph-a", externalId: "block-changed", contentHash: "hash-changed" }, {
    actor: "logseq-plugin", expectedVersion: changed.object.version, idempotencyKey: "sync-changed", traceId: "trace-sync-changed",
  });
  await assert.rejects(() => application.undoMaterialization(changed, { actor: "user", expectedVersion: changed.object.version, idempotencyKey: "undo-changed", traceId: "trace-undo-changed" }), /已变化/);
  assert.equal(store.getObject("task-changed")?.text, "后续编辑");
  assert.equal(store.getCommandReceipt("undo-changed"), undefined);

  const relatedTarget = await application.materializeExplicitObject({
    objectId: "task-related-target", objectType: "TASK", text: "被关联对象", anchor: { anchorId: "anchor-related-target", graphId: "graph-a", externalId: "block-related-target", contentHash: "hash-related-target" },
  }, { actor: "proposal_commit", expectedVersion: 0, idempotencyKey: "materialize-related-target", traceId: "trace-related-target" });
  const relatedSource = await application.createObject({ objectId: "decision-related-source", objectType: "DECISION", text: "引用决定" }, {
    actor: "user", expectedVersion: 0, idempotencyKey: "create-related-source", traceId: "trace-related-source",
  });
  await application.addAssociation(relatedSource.objectId, relatedTarget.object.objectId, {
    actor: "user", expectedVersion: relatedSource.version, idempotencyKey: "associate-related-target", traceId: "trace-associate-related-target",
  });
  await assert.rejects(
    () => application.undoMaterialization(relatedTarget, { actor: "user", expectedVersion: relatedTarget.object.version, idempotencyKey: "undo-related-target", traceId: "trace-undo-related-target" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_UNDO_DEPENDENT_STATE_EXISTS",
  );
  assert.equal(store.getObject(relatedTarget.object.objectId)?.version, relatedTarget.object.version, "incoming Association is explicit dependent state even though it does not change target version");
  store.close();
});

test("Focus persistence inserts at rank, reorders atomically, and preserves object Audit", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  const first = await application.createObject({ objectId: "focus-first", objectType: "TASK", text: "第一项" }, { actor: "user", expectedVersion: 0, idempotencyKey: "create-focus-first", traceId: "trace-first" });
  const second = await application.createObject({ objectId: "focus-second", objectType: "MINI_PROJECT", text: "第二项" }, { actor: "user", expectedVersion: 0, idempotencyKey: "create-focus-second", traceId: "trace-second" });
  await application.selectFocus(first.objectId, 0, first.version, new Date("2026-07-20T12:00:00.000Z"));
  await application.selectFocus(second.objectId, 0, second.version, new Date("2026-07-20T12:01:00.000Z"));
  assert.deepEqual(store.listFocusSelections().map(({ objectId, rank }) => ({ objectId, rank })), [
    { objectId: second.objectId, rank: 0 }, { objectId: first.objectId, rank: 1 },
  ]);
  assert.deepEqual((await application.reorderFocus([second.objectId, first.objectId], [first.objectId, second.objectId])).map((selection) => selection.objectId), [first.objectId, second.objectId]);
  await assert.rejects(() => application.reorderFocus([second.objectId, first.objectId], [first.objectId, second.objectId]), /顺序已变化/);
  assert.deepEqual(store.listFocusSelections().map((selection) => selection.objectId), [first.objectId, second.objectId], "stale reorder rolls back the whole batch");
  await application.removeFocus(first.objectId, first.version);
  assert.deepEqual(store.listFocusSelections().map((selection) => selection.objectId), [second.objectId]);
  assert.equal(store.auditEventCount(), 2, "Focus remains a view selection rather than formal object Audit");
  assert.equal(store.getObject(second.objectId)?.version, second.version);
  await application.transitionLifecycle(second.objectId, "COMPLETED", { actor: "user", expectedVersion: second.version, idempotencyKey: "complete-focus-second", traceId: "trace-complete-focus" });
  assert.deepEqual(store.listFocusSelections(), [], "a terminal lifecycle transition removes its temporary Focus selection atomically");
  assert.equal(store.auditEventCount(), 3, "only the lifecycle transition adds formal Audit");
  store.close();
});

test("Project Closure persists with completion and removes temporary Focus in one object transaction", async (t) => {
  const { root, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  const application = new V2Application(store);
  const project = await application.createObject({ objectId: "project-closure", objectType: "PROJECT", text: "告警治理" }, {
    actor: "test", expectedVersion: 0, idempotencyKey: "create-project-closure", traceId: "trace-create-project-closure",
  });
  await application.selectFocus(project.objectId, 0, project.version);
  const closure = {
    originalGoal: "让推送可控。", actualResult: "新链路已上线。", majorDeliverables: ["推送服务"],
    incompleteObjectives: [{ objective: "历史回放", reason: "数据未齐", nextStep: "转入数据治理" }],
    legacyDisposition: "由新 Project 承接。", keyDecisions: ["保留回退"], futureSummary: "重入先查历史数据。",
  };
  const completed = await application.completeProject(project.objectId, closure, {
    actor: "proposal_commit", expectedVersion: project.version, idempotencyKey: "complete-project-closure", traceId: "trace-complete-project-closure",
  });
  assert.equal(completed.lifecycle, "COMPLETED");
  assert.deepEqual(store.getObject(project.objectId)?.closure, closure);
  assert.deepEqual(store.listFocusSelections(), []);
  assert.equal(store.getCommandReceipt("complete-project-closure")?.command, "complete_project");
  store.close();
});
