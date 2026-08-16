import assert from "node:assert/strict";
import test from "node:test";

import { SqliteStore } from "../src/index.ts";
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("vNext schema stores normalized current state without embedding an anchor in WorkObject", () => {
  const store = new SqliteStore(":memory:");
  store.putWorkObject({
    id: "work-01", kind: "TASK", title: "Task", lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null,
    currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });
  store.putAnchor({
    id: "anchor-01", workObjectId: "work-01", graphId: "graph-01", externalId: "source-01",
    sourceContentHash: "a1b2c3d4", projectionContainerUuid: "container-01", projectionTitleUuid: "title-01",
    projectionStateUuid: "state-01", projectionFocusUuid: "focus-01", projectionWaitingUuid: "waiting-01", projectionOutcomeUuid: "outcome-01", projectionCompletionUuid: "checks-01", createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });

  assert.deepEqual(store.getWorkObject("work-01"), {
    id: "work-01", kind: "TASK", title: "Task", lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null,
    currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });
  assert.equal(store.getAnchorForWorkObject("work-01")?.externalId, "source-01");
  assert.equal(store.schemaVersion(), 19);
  store.close();
});

test("the structured ledger is append-only and exposes incomplete commits for recovery", () => {
  const store = new SqliteStore(":memory:");
  store.insertCommit({
    id: "commit-01", status: "PREPARED", actor: { type: "USER", id: "user-01" },
    operationType: "CREATE_WORK_OBJECT", targetId: "work-01", operation: { operationId: "op-01" },
    preconditions: [{ kind: "SOURCE_CONTENT_HASH", expected: "a1b2c3d4" }], before: null,
    after: { id: "work-01" }, inverse: { type: "UNDO_COMMIT" }, graphEffect: { type: "UPSERT_MANAGED_PROJECTION" },
    graphResult: null, failureReason: null, compensationFor: null, compensatedBy: null, governance: null,
    createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
  });
  store.transitionCommit("commit-01", "KERNEL_APPLIED", { updatedAt: "2026-08-12T00:00:01.000Z" });

  assert.equal(store.getCommit("commit-01")?.status, "KERNEL_APPLIED");
  assert.deepEqual(store.listRecovery().map((commit) => commit.id), ["commit-01"]);
  assert.throws(() => store.insertCommit({ ...store.getCommit("commit-01")!, status: "PREPARED" }), /COMMIT_ALREADY_EXISTS/u);
  assert.throws(() => store.deleteCommit("commit-01"), /LEDGER_APPEND_ONLY/u);
  store.close();
});

test("schema v3 backfills deterministic Phase 3 focus and Phase 4 waiting UUIDs", () => {
  const path = join(mkdtempSync(join(tmpdir(), "task-copilot-v1-")), "kernel.sqlite");
  const legacy = new Database(path);
  legacy.exec(`CREATE TABLE schema_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE work_objects(id TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL,lifecycle TEXT NOT NULL,engagement TEXT,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE anchors(id TEXT PRIMARY KEY,work_object_id TEXT NOT NULL UNIQUE,graph_id TEXT NOT NULL,external_id TEXT NOT NULL,source_content_hash TEXT NOT NULL,projection_container_uuid TEXT NOT NULL,projection_title_uuid TEXT NOT NULL,projection_state_uuid TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE evidence_references(id TEXT PRIMARY KEY,work_object_id TEXT NOT NULL,graph_id TEXT NOT NULL,external_id TEXT NOT NULL,content_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE ownerships(child_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE commits(id TEXT PRIMARY KEY,status TEXT NOT NULL,actor_type TEXT NOT NULL,actor_id TEXT NOT NULL,operation_type TEXT NOT NULL,target_id TEXT,operation_json TEXT NOT NULL,preconditions_json TEXT NOT NULL,before_json TEXT,after_json TEXT,inverse_json TEXT,graph_effect_json TEXT,graph_result_json TEXT,failure_reason TEXT,compensation_for TEXT,compensated_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO schema_versions VALUES(1,'now');
    INSERT INTO work_objects VALUES('work-legacy','TASK','Legacy','OPEN','ACTIONABLE',1,'now','now');
    INSERT INTO anchors VALUES('anchor-legacy','work-legacy','graph','source','a1b2c3d4','container-legacy','title-legacy','state-legacy','now','now');`);
  legacy.close();
  const migrated = new SqliteStore(path);
  assert.match(migrated.getAnchorForWorkObject("work-legacy")!.projectionFocusUuid, /^[0-9a-f-]{36}$/u);
  assert.notEqual(migrated.getAnchorForWorkObject("work-legacy")!.projectionFocusUuid, "");
  assert.match(migrated.getAnchorForWorkObject("work-legacy")!.projectionWaitingUuid, /^[0-9a-f-]{36}$/u);
  migrated.close();
});

test("schema v4 keeps immutable Closure records and resolves only the current effective closure", () => {
  const store = new SqliteStore(":memory:");
  const actor = { type: "USER", id: "local-user" } as const;
  const base = { id: "task-closure", kind: "TASK", title: "验证防火墙", lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 2, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T01:00:00.000Z" } as const;
  store.putWorkObject(base);
  const putCommit = (id: string, operationType: "COMPLETE_WORK_OBJECT" | "AMEND_CLOSURE" | "REOPEN_WORK_OBJECT") => store.insertCommit({ id, status: "COMMITTED", actor, operationType, targetId: base.id, operation: { operationId: id }, preconditions: [], before: null, after: null, inverse: null, graphEffect: null, graphResult: null, failureReason: null, compensationFor: null, compensatedBy: null, governance: null, createdAt: base.updatedAt, updatedAt: base.updatedAt });
  putCommit("commit-complete", "COMPLETE_WORK_OBJECT");
  store.putCompletionRecord({ id: "completion-01", workObjectId: base.id, completedAt: base.updatedAt, outcomeSummary: "完成生产验证", evidenceIds: [], createdBy: actor }, "commit-complete");
  putCommit("commit-amend", "AMEND_CLOSURE");
  store.putClosureAmendment({ id: "amend-01", workObjectId: base.id, targetClosureRecordId: "completion-01", reason: "表述范围过大", replacementOutcomeSummary: "完成测试环境验证", replacementCancellationReason: null, addEvidenceIds: ["evidence-01"], amendedAt: "2026-08-13T02:00:00.000Z", createdBy: actor }, "commit-amend");
  assert.deepEqual(store.getClosureHistory(base.id).current, {
    type: "COMPLETED", record: { id: "completion-01", workObjectId: base.id, completedAt: base.updatedAt, outcomeSummary: "完成生产验证", evidenceIds: [], createdBy: actor },
    amendments: [{ id: "amend-01", workObjectId: base.id, targetClosureRecordId: "completion-01", reason: "表述范围过大", replacementOutcomeSummary: "完成测试环境验证", replacementCancellationReason: null, addEvidenceIds: ["evidence-01"], amendedAt: "2026-08-13T02:00:00.000Z", createdBy: actor }],
    outcomeSummary: "完成测试环境验证", evidenceIds: ["evidence-01"],
  });
  assert.throws(() => store.putCompletionRecord({ id: "completion-01", workObjectId: base.id, completedAt: base.updatedAt, outcomeSummary: "覆盖", evidenceIds: [], createdBy: actor }, "other"), /CLOSURE_RECORD_IMMUTABLE/u);
  store.putWorkObject({ ...base, lifecycle: "OPEN", engagement: "ACTIONABLE", version: 3, updatedAt: "2026-08-13T03:00:00.000Z" });
  putCommit("commit-reopen", "REOPEN_WORK_OBJECT");
  store.putReopenRecord({ id: "reopen-01", workObjectId: base.id, previousClosureType: "COMPLETED", previousClosureRecordId: "completion-01", reason: "生产仍有问题", reopenedAt: "2026-08-13T03:00:00.000Z", createdBy: actor }, "commit-reopen");
  const history = store.getClosureHistory(base.id);
  assert.equal(history.current, null);
  assert.equal(history.completions.length, 1);
  assert.equal(history.amendments.length, 1);
  assert.equal(history.reopens.length, 1);
  assert.equal(store.schemaVersion(), 19);
  store.close();
});
