import Database from "better-sqlite3";

import type { Actor, CommitStatus, OperationType, StoredCommit } from "@task-copilot/contracts";
export type { StoredCommit } from "@task-copilot/contracts";
import type { PrimaryAnchor, WorkObject } from "@task-copilot/domain";

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS work_objects (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('TASK', 'MINI_PROJECT', 'PROJECT')),
    title TEXT NOT NULL,
    lifecycle TEXT NOT NULL CHECK (lifecycle IN ('OPEN', 'COMPLETED', 'CANCELLED')),
    engagement TEXT CHECK (engagement IN ('ACTIONABLE', 'WAITING', 'PARKED') OR engagement IS NULL),
    version INTEGER NOT NULL CHECK (version > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS anchors (
    id TEXT PRIMARY KEY,
    work_object_id TEXT NOT NULL UNIQUE REFERENCES work_objects(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    source_content_hash TEXT NOT NULL,
    projection_container_uuid TEXT NOT NULL,
    projection_title_uuid TEXT NOT NULL,
    projection_state_uuid TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(graph_id, external_id)
  );
  CREATE TABLE IF NOT EXISTS evidence_references (
    id TEXT PRIMARY KEY,
    work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ownerships (
    child_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES work_objects(id),
    created_at TEXT NOT NULL,
    CHECK (child_id <> owner_id)
  );
  CREATE TABLE IF NOT EXISTS commits (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    target_id TEXT,
    operation_json TEXT NOT NULL,
    preconditions_json TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    inverse_json TEXT,
    graph_effect_json TEXT,
    graph_result_json TEXT,
    failure_reason TEXT,
    compensation_for TEXT REFERENCES commits(id),
    compensated_by TEXT REFERENCES commits(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commits_status_idx ON commits(status, created_at);
`;

function encode(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function decode(value: string | null): unknown {
  return value === null ? null : JSON.parse(value);
}

interface CommitRow {
  id: string; status: CommitStatus; actor_type: Actor["type"]; actor_id: string; operation_type: OperationType;
  target_id: string | null; operation_json: string; preconditions_json: string; before_json: string | null;
  after_json: string | null; inverse_json: string | null; graph_effect_json: string | null; graph_result_json: string | null;
  failure_reason: string | null; compensation_for: string | null; compensated_by: string | null; created_at: string; updated_at: string;
}

function mapCommit(row: CommitRow): StoredCommit {
  return {
    id: row.id, status: row.status, actor: { type: row.actor_type, id: row.actor_id }, operationType: row.operation_type,
    targetId: row.target_id, operation: decode(row.operation_json), preconditions: decode(row.preconditions_json),
    before: decode(row.before_json), after: decode(row.after_json), inverse: decode(row.inverse_json),
    graphEffect: decode(row.graph_effect_json), graphResult: decode(row.graph_result_json), failureReason: row.failure_reason,
    compensationFor: row.compensation_for, compensatedBy: row.compensated_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class SqliteStore {
  readonly #database: Database.Database;

  constructor(path: string) {
    this.#database = new Database(path);
    this.#database.pragma("journal_mode = WAL");
    this.#database.exec(schema);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
  }

  close(): void { this.#database.close(); }
  schemaVersion(): number { return Number((this.#database.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version); }

  transaction<T>(work: () => T): T { return this.#database.transaction(work)(); }

  putWorkObject(object: WorkObject): void {
    this.#database.prepare(`INSERT INTO work_objects(id, kind, title, lifecycle, engagement, version, created_at, updated_at)
      VALUES (@id, @kind, @title, @lifecycle, @engagement, @version, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, lifecycle=excluded.lifecycle,
      engagement=excluded.engagement, version=excluded.version, updated_at=excluded.updated_at`).run(object);
  }

  getWorkObject(id: string): WorkObject | null {
    const row = this.#database.prepare("SELECT * FROM work_objects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), kind: row.kind as WorkObject["kind"], title: String(row.title), lifecycle: row.lifecycle as WorkObject["lifecycle"], engagement: row.engagement as WorkObject["engagement"], version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  listWorkObjects(): WorkObject[] {
    return (this.#database.prepare("SELECT id FROM work_objects ORDER BY created_at, id").all() as Array<{ id: string }>).map(({ id }) => this.getWorkObject(id)!);
  }

  deleteWorkObject(id: string): void { this.#database.prepare("DELETE FROM work_objects WHERE id = ?").run(id); }

  putAnchor(anchor: PrimaryAnchor): void {
    this.#database.prepare(`INSERT INTO anchors(id, work_object_id, graph_id, external_id, source_content_hash,
      projection_container_uuid, projection_title_uuid, projection_state_uuid, created_at, updated_at)
      VALUES (@id, @workObjectId, @graphId, @externalId, @sourceContentHash, @projectionContainerUuid,
      @projectionTitleUuid, @projectionStateUuid, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET source_content_hash=excluded.source_content_hash, updated_at=excluded.updated_at`).run(anchor);
  }

  getAnchorForWorkObject(workObjectId: string): PrimaryAnchor | null {
    const row = this.#database.prepare("SELECT * FROM anchors WHERE work_object_id = ?").get(workObjectId) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), workObjectId: String(row.work_object_id), graphId: String(row.graph_id), externalId: String(row.external_id), sourceContentHash: String(row.source_content_hash), projectionContainerUuid: String(row.projection_container_uuid), projectionTitleUuid: String(row.projection_title_uuid), projectionStateUuid: String(row.projection_state_uuid), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  insertCommit(commit: StoredCommit): void {
    try {
      this.#database.prepare(`INSERT INTO commits(id, status, actor_type, actor_id, operation_type, target_id,
        operation_json, preconditions_json, before_json, after_json, inverse_json, graph_effect_json, graph_result_json,
        failure_reason, compensation_for, compensated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(commit.id, commit.status, commit.actor.type, commit.actor.id, commit.operationType, commit.targetId,
          encode(commit.operation), encode(commit.preconditions), encode(commit.before), encode(commit.after), encode(commit.inverse),
          encode(commit.graphEffect), encode(commit.graphResult), commit.failureReason, commit.compensationFor, commit.compensatedBy,
          commit.createdAt, commit.updatedAt);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: commits.id")) throw new Error("COMMIT_ALREADY_EXISTS", { cause: error });
      throw error;
    }
  }

  transitionCommit(id: string, status: CommitStatus, update: { updatedAt: string; graphResult?: unknown; failureReason?: string | null; compensatedBy?: string | null }): void {
    const changed = this.#database.prepare(`UPDATE commits SET status=?, updated_at=?, graph_result_json=COALESCE(?, graph_result_json),
      failure_reason=COALESCE(?, failure_reason), compensated_by=COALESCE(?, compensated_by) WHERE id=?`)
      .run(status, update.updatedAt, encode(update.graphResult), update.failureReason ?? null, update.compensatedBy ?? null, id);
    if (!changed.changes) throw new Error("COMMIT_NOT_FOUND");
  }

  getCommit(id: string): StoredCommit | null {
    const row = this.#database.prepare("SELECT * FROM commits WHERE id = ?").get(id) as CommitRow | undefined;
    return row ? mapCommit(row) : null;
  }

  listCommits(): StoredCommit[] {
    return (this.#database.prepare("SELECT * FROM commits ORDER BY created_at, id").all() as CommitRow[]).map(mapCommit);
  }

  listRecovery(): StoredCommit[] {
    return (this.#database.prepare("SELECT * FROM commits WHERE status IN ('PREPARED','KERNEL_APPLIED','GRAPH_APPLIED','RECOVERY_REQUIRED') ORDER BY created_at, id").all() as CommitRow[]).map(mapCommit);
  }

  setCompensatedBy(id: string, compensationCommitId: string, updatedAt: string): void {
    const changed = this.#database.prepare("UPDATE commits SET compensated_by = ?, updated_at = ? WHERE id = ?")
      .run(compensationCommitId, updatedAt, id);
    if (!changed.changes) throw new Error("COMMIT_NOT_FOUND");
  }

  deleteCommit(id: string): never { throw new Error(`LEDGER_APPEND_ONLY:${id}`); }
}
