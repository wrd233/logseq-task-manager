import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { V2Application } from "@task-copilot/application";
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

async function downgradeFixtureToSchemaV1(path: string): Promise<void> {
  const database = new Database(path);
  database.exec("DROP TABLE IF EXISTS proposal_groups; DROP TABLE IF EXISTS proposals");
  database.exec("DROP TABLE IF EXISTS semantic_commit_steps; DROP TABLE IF EXISTS semantic_commits");
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
    schemaVersion: 5,
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
  ]);
  assert.deepEqual(migrated.initialize("graph-a"), { initialized: false, schemaVersion: 5 });
  assert.deepEqual(await migrated.migrateSchema("graph-a", backupPath), {
    migrated: false,
    fromVersion: 5,
    schemaVersion: 5,
  });
  assert.equal(migrated.schemaMigrationHistory().length, 5, "repeated initialize must not duplicate migration rows");
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
  assert.equal((await retried.migrateSchema("graph-a", join(root, "before-retry.db"))).schemaVersion, 5);
  assert.equal(retried.schemaMigrationHistory().length, 5);
  retried.close();
});

test("schema v2 explicitly migrates to the constrained SemanticCommit step ledger", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  legacy.exec("DROP TABLE proposal_groups; DROP TABLE proposals; DROP TABLE semantic_commit_steps; DROP TABLE semantic_commits; DELETE FROM schema_migrations WHERE version >= 3");
  legacy.prepare("UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 2");
  legacy.close();

  const migrating = await V2SqliteStore.open(path);
  assert.throws(() => migrating.initialize("graph-a"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED");
  const backupPath = join(root, "before-step-ledger.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-20T10:00:00.000Z")), {
    migrated: true,
    fromVersion: 2,
    schemaVersion: 5,
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
  legacy.exec("DROP TABLE proposal_groups; DROP TABLE proposals; DELETE FROM schema_migrations WHERE version >= 4");
  legacy.prepare("UPDATE schema_meta SET value = '3' WHERE key = 'schema_version'").run();
  legacy.pragma("user_version = 3");
  legacy.close();
  const migrating = await V2SqliteStore.open(path);
  assert.throws(() => migrating.initialize("graph-a"), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_SCHEMA_MIGRATION_REQUIRED");
  const backupPath = join(root, "before-proposals.db");
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-20T11:00:00.000Z")), { migrated: true, fromVersion: 3, schemaVersion: 5, backupPath });
  assert.equal(migrating.schemaMigrationHistory()[3]?.name, "add_proposal_review_tables");
  assert.equal(migrating.schemaMigrationHistory()[4]?.name, "decouple_audit_from_current_objects");
  migrating.close();
});

test("schema v4 explicitly decouples immutable Audit from the current object projection", async (t) => {
  const { root, path, store } = await fixture();
  t.after(async () => rm(root, { recursive: true, force: true }));
  store.initialize("graph-a");
  store.close();
  const legacy = new Database(path);
  legacy.exec(`
    DELETE FROM schema_migrations WHERE version = 5;
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
  assert.deepEqual(await migrating.migrateSchema("graph-a", backupPath, new Date("2026-07-20T11:30:00.000Z")), { migrated: true, fromVersion: 4, schemaVersion: 5, backupPath });
  const internal = migrating as unknown as { database: Database.Database };
  assert.deepEqual(internal.database.pragma("foreign_key_list(audit_events)"), []);
  assert.equal(migrating.schemaMigrationHistory()[4]?.name, "decouple_audit_from_current_objects");
  migrating.close();
});

function validProposal(): V2Proposal {
  const beforeText = "梳理告警";
  const afterText = "[任务] 梳理告警";
  return {
    proposalId: "prop_sqlite", schemaVersion: "v2", title: "正式化告警梳理", context: "当前普通正文。", understanding: "建议 Task。", objective: "可追踪。", logic: "正文与语义绑定。", finalPreview: afterText, unresolvedQuestions: [], source: { kind: "user" },
    scope: { read: [], modify: [{ kind: "BLOCK", id: "block-sqlite", version: 1, hash: checksum(beforeText) }] }, preconditions: [],
    groups: [{ groupId: "formalize", explanation: "不可拆组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "block-sqlite", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }], semanticOperations: [{ operationId: "create", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-sqlite", version: 1, hash: checksum(beforeText) }, summary: "创建 Task", payload: { objectType: "TASK" }, preconditions: [] }], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-20T12:00:00.000Z",
  };
}

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
  assert.equal(store.auditEventCount(), 4);
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
