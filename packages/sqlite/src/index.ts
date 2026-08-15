import Database from "better-sqlite3";

import { deterministicUuid, type Actor, type AgentRunReceipt, type AssociationCorrection, type ClosureHistory, type CommitStatus, type ContextAssociation, type CurationReceipt, type DecisionCandidate, type DecisionPackage, type FeedbackEvent, type FrozenEvidence, type GovernanceIssue, type GraphReadReceipt, type OperationType, type ProjectionObligation, type Proposal, type ProposalRevision, type ReconcileJob, type ReconcilePriorityClass, type ReconcileTriggerType, type SkillIdentity, type SourceCoverageState, type StoredCommit, type TrustedUserEvent, type UserDecision } from "@task-copilot/contracts";
export type { StoredCommit } from "@task-copilot/contracts";
import type { CancellationRecord, ClosureAmendment, CompletionRecord, PrimaryAnchor, ReopenRecord, WorkObject } from "@task-copilot/domain";

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
    current_focus TEXT,
    desired_outcome TEXT,
    completion_checks_json TEXT NOT NULL DEFAULT '[]',
    waiting_condition_json TEXT,
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
    projection_focus_uuid TEXT NOT NULL,
    projection_waiting_uuid TEXT NOT NULL,
    projection_outcome_uuid TEXT NOT NULL,
    projection_completion_uuid TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(graph_id, external_id)
  );
  CREATE TABLE IF NOT EXISTS evidence_references (
    id TEXT PRIMARY KEY,
    work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'LOGSEQ_BLOCK',
    frozen_content TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL,
    locator_json TEXT NOT NULL DEFAULT '{}',
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
    governance_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commits_status_idx ON commits(status, created_at);
  CREATE TABLE IF NOT EXISTS projection_obligations (
    id TEXT PRIMARY KEY,
    commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id),
    work_object_id TEXT NOT NULL REFERENCES work_objects(id),
    formal_version INTEGER NOT NULL,
    target_anchor_id TEXT NOT NULL,
    desired_projection_hash TEXT,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'VERIFIED', 'FAILED')),
    attempt INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    next_attempt_at TEXT,
    retry_exhausted INTEGER NOT NULL DEFAULT 0 CHECK (retry_exhausted IN (0, 1)),
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projection_obligations_status_idx ON projection_obligations(status, created_at);
  CREATE TABLE IF NOT EXISTS source_coverage (
    work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
    last_observed_source_snapshot_id TEXT NOT NULL,
    last_reconciled_source_snapshot_id TEXT,
    formal_version_at_last_reconcile INTEGER,
    has_uncovered_changes INTEGER NOT NULL DEFAULT 1 CHECK (has_uncovered_changes IN (0, 1)),
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reconcile_jobs (
    id TEXT PRIMARY KEY,
    work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    source_snapshot_id TEXT NOT NULL,
    source_block_uuid TEXT,
    formal_version INTEGER NOT NULL,
    priority_class TEXT NOT NULL CHECK (priority_class IN ('NORMAL', 'INTERACTIVE', 'SYSTEM_RECOVERY')),
    attempt INTEGER NOT NULL DEFAULT 0,
    not_before TEXT,
    status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'STALE')),
    last_error TEXT,
    last_outcome TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reconcile_jobs_status_idx ON reconcile_jobs(status, not_before, created_at);
  CREATE TABLE IF NOT EXISTS maintenance_pause (
    scope_key TEXT PRIMARY KEY,
    paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS context_associations (
    id TEXT PRIMARY KEY,
    work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    page_name TEXT,
    source_version_hash TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('USER_EXPLICIT', 'AGENT_INFERRED', 'SYSTEM_STRUCTURAL')),
    basis_run_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INVALIDATED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS context_associations_active_idx ON context_associations(work_object_id, graph_id, block_uuid) WHERE status='ACTIVE';
  CREATE INDEX IF NOT EXISTS context_associations_source_idx ON context_associations(graph_id, block_uuid);
  CREATE TABLE IF NOT EXISTS association_corrections (
    id TEXT PRIMARY KEY,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    scope_snapshot TEXT NOT NULL,
    rejected_work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    affirmed_work_object_id TEXT REFERENCES work_objects(id),
    user_decision_ref TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS association_corrections_source_idx ON association_corrections(graph_id, block_uuid);
  CREATE TABLE IF NOT EXISTS governance_issues (
    id TEXT PRIMARY KEY,
    work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('UNKNOWN', 'CONFLICT', 'BOUNDARY_CANDIDATE')),
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'SUPERSEDED')),
    summary TEXT NOT NULL,
    evidence_ids_json TEXT NOT NULL DEFAULT '[]',
    source_snapshot_id TEXT NOT NULL,
    formal_version INTEGER NOT NULL,
    correlation_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS governance_issues_open_idx ON governance_issues(work_object_id, dimension, status);
  CREATE UNIQUE INDEX IF NOT EXISTS governance_issues_open_dedupe_idx ON governance_issues(work_object_id, dimension, type, source_snapshot_id) WHERE status='OPEN';
  CREATE TABLE IF NOT EXISTS decision_packages (
    id TEXT PRIMARY KEY,
    work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    rationale TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED', 'STALE')),
    target_versions_json TEXT NOT NULL,
    issue_refs_json TEXT NOT NULL DEFAULT '[]',
    presentation_revision TEXT NOT NULL DEFAULT '1',
    presented_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS decision_candidates (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL REFERENCES decision_packages(id) ON DELETE CASCADE,
    operation_type TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    evidence_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED', 'DEFERRED')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS decision_candidates_package_idx ON decision_candidates(package_id, status);
  CREATE TABLE IF NOT EXISTS user_decisions (
    id TEXT PRIMARY KEY,
    work_object_ids_json TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    scope TEXT NOT NULL,
    exact_user_utterance TEXT NOT NULL,
    minimal_decision_context TEXT NOT NULL,
    input_versions_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('EXECUTED', 'REJECTED', 'STALE', 'AUTHORIZED')),
    package_id TEXT,
    authorization_ref TEXT,
    created_at TEXT NOT NULL,
    executed_at TEXT,
    execution_refs_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS user_decisions_package_idx ON user_decisions(package_id, status);
  CREATE TABLE IF NOT EXISTS trusted_user_events (
    id TEXT PRIMARY KEY,
    source_channel TEXT NOT NULL CHECK (source_channel IN ('PLUGIN_USER_CHANNEL')),
    source_capability TEXT,
    exact_user_utterance TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    package_id TEXT,
    presentation_revision TEXT,
    correlation_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED')),
    consumed_by_decision_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS trusted_user_events_package_idx ON trusted_user_events(package_id, status);
  CREATE TABLE IF NOT EXISTS skill_versions (
    id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, package_json TEXT NOT NULL,
    registered_at TEXT NOT NULL, PRIMARY KEY(id, version)
  );
  CREATE TABLE IF NOT EXISTS agent_run_receipts (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, work_object_id TEXT NOT NULL REFERENCES work_objects(id),
    evidence_ids_json TEXT NOT NULL, skill_json TEXT NOT NULL, outcome TEXT NOT NULL, reason_code TEXT NOT NULL,
    rationale_summary TEXT NOT NULL, proposal_id TEXT, details_json TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS graph_read_receipts (
    id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id), kind TEXT NOT NULL,
    locator TEXT NOT NULL, content_hash TEXT NOT NULL, read_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), status TEXT NOT NULL,
    latest_revision INTEGER NOT NULL, applied_commit_id TEXT, invalidation_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS proposal_revisions (
    proposal_id TEXT NOT NULL REFERENCES proposals(id), revision INTEGER NOT NULL, revision_json TEXT NOT NULL,
    PRIMARY KEY(proposal_id, revision)
  );
  CREATE TABLE IF NOT EXISTS feedback_events (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, proposal_id TEXT NOT NULL REFERENCES proposals(id),
    agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id), commit_id TEXT, details_json TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS curation_receipts (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id),
    details_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS completion_records (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), record_json TEXT NOT NULL,
    commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cancellation_records (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), record_json TEXT NOT NULL,
    commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS closure_amendments (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), target_closure_record_id TEXT NOT NULL,
    record_json TEXT NOT NULL, commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reopen_records (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), previous_closure_record_id TEXT NOT NULL,
    record_json TEXT NOT NULL, commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
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
  governance_json: string | null;
}

function mapCommit(row: CommitRow): StoredCommit {
  return {
    id: row.id, status: row.status, actor: { type: row.actor_type, id: row.actor_id }, operationType: row.operation_type,
    targetId: row.target_id, operation: decode(row.operation_json), preconditions: decode(row.preconditions_json),
    before: decode(row.before_json), after: decode(row.after_json), inverse: decode(row.inverse_json),
    graphEffect: decode(row.graph_effect_json), graphResult: decode(row.graph_result_json), failureReason: row.failure_reason,
    compensationFor: row.compensation_for, compensatedBy: row.compensated_by, governance: decode(row.governance_json) as StoredCommit["governance"], createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class SqliteStore {
  readonly #database: Database.Database;

  constructor(path: string) {
    this.#database = new Database(path);
    this.#database.pragma("journal_mode = WAL");
    this.#database.exec(schema);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
    this.#migrateV2();
    this.#migrateV3();
    this.#migrateV4();
    this.#migrateV5();
    this.#migrateV6();
    this.#migrateV7();
    this.#migrateV8();
    this.#migrateV9();
    this.#migrateV10();
    this.#migrateV11();
    this.#migrateV12();
    this.#migrateV13();
  }

  #hasColumn(table: string, column: string): boolean {
    return (this.#database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((item) => item.name === column);
  }

  #migrateV2(): void {
    const additions = [
      ["work_objects", "current_focus", "TEXT"],
      ["anchors", "projection_focus_uuid", "TEXT NOT NULL DEFAULT ''"],
      ["evidence_references", "source_type", "TEXT NOT NULL DEFAULT 'LOGSEQ_BLOCK'"],
      ["evidence_references", "frozen_content", "TEXT NOT NULL DEFAULT ''"],
      ["evidence_references", "locator_json", "TEXT NOT NULL DEFAULT '{}'"],
      ["commits", "governance_json", "TEXT"],
      ["feedback_events", "details_json", "TEXT"],
      ["agent_run_receipts", "details_json", "TEXT"],
    ] as const;
    for (const [table, column, definition] of additions) if (!this.#hasColumn(table, column)) this.#database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    const anchors = this.#database.prepare("SELECT id, projection_container_uuid FROM anchors WHERE projection_focus_uuid = ''").all() as Array<{ id: string; projection_container_uuid: string }>;
    const updateFocus = this.#database.prepare("UPDATE anchors SET projection_focus_uuid=? WHERE id=?");
    for (const anchor of anchors) updateFocus.run(deterministicUuid(`focus:${anchor.projection_container_uuid}`), anchor.id);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (2, ?)").run(new Date().toISOString());
  }

  #migrateV3(): void {
    const additions = [
      ["work_objects", "waiting_condition_json", "TEXT"],
      ["anchors", "projection_waiting_uuid", "TEXT NOT NULL DEFAULT ''"],
    ] as const;
    for (const [table, column, definition] of additions) if (!this.#hasColumn(table, column)) this.#database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    const anchors = this.#database.prepare("SELECT id, projection_container_uuid FROM anchors WHERE projection_waiting_uuid = ''").all() as Array<{ id: string; projection_container_uuid: string }>;
    const updateWaiting = this.#database.prepare("UPDATE anchors SET projection_waiting_uuid=? WHERE id=?");
    for (const anchor of anchors) updateWaiting.run(deterministicUuid(`waiting:${anchor.projection_container_uuid}`), anchor.id);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (3, ?)").run(new Date().toISOString());
  }

  #migrateV4(): void {
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (4, ?)").run(new Date().toISOString());
  }

  #migrateV5(): void {
    this.#database.exec(`CREATE TABLE IF NOT EXISTS graph_read_receipts (
      id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id), kind TEXT NOT NULL,
      locator TEXT NOT NULL, content_hash TEXT NOT NULL, read_at TEXT NOT NULL)`);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (5, ?)").run(new Date().toISOString());
  }

  #migrateV6(): void {
    const additions = [
      ["work_objects", "desired_outcome", "TEXT"],
      ["work_objects", "completion_checks_json", "TEXT NOT NULL DEFAULT '[]'"],
      ["anchors", "projection_outcome_uuid", "TEXT NOT NULL DEFAULT ''"],
      ["anchors", "projection_completion_uuid", "TEXT NOT NULL DEFAULT ''"],
    ] as const;
    for (const [table, column, definition] of additions) if (!this.#hasColumn(table, column)) this.#database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    const anchors = this.#database.prepare("SELECT id, projection_container_uuid FROM anchors WHERE projection_outcome_uuid='' OR projection_completion_uuid=''").all() as Array<{ id: string; projection_container_uuid: string }>;
    const update = this.#database.prepare("UPDATE anchors SET projection_outcome_uuid=?,projection_completion_uuid=? WHERE id=?");
    for (const anchor of anchors) update.run(deterministicUuid(`outcome:${anchor.projection_container_uuid}`), deterministicUuid(`completion:${anchor.projection_container_uuid}`), anchor.id);
    this.#database.exec("CREATE TABLE IF NOT EXISTS curation_receipts (id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id), details_json TEXT NOT NULL, created_at TEXT NOT NULL)");
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (6, ?)").run(new Date().toISOString());
  }

  #migrateV7(): void {
    this.#database.exec(`CREATE TABLE IF NOT EXISTS projection_obligations (
      id TEXT PRIMARY KEY,
      commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id),
      work_object_id TEXT NOT NULL REFERENCES work_objects(id),
      formal_version INTEGER NOT NULL,
      target_anchor_id TEXT NOT NULL,
      desired_projection_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'VERIFIED', 'FAILED')),
      attempt INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    this.#database.exec("CREATE INDEX IF NOT EXISTS projection_obligations_status_idx ON projection_obligations(status, created_at)");
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (7, ?)").run(new Date().toISOString());
  }

  #migrateV8(): void {
    this.#database.exec(`CREATE TABLE IF NOT EXISTS source_coverage (
      work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
      last_observed_source_snapshot_id TEXT NOT NULL,
      last_reconciled_source_snapshot_id TEXT,
      formal_version_at_last_reconcile INTEGER,
      has_uncovered_changes INTEGER NOT NULL DEFAULT 1 CHECK (has_uncovered_changes IN (0, 1)),
      updated_at TEXT NOT NULL
    )`);
    this.#database.exec(`CREATE TABLE IF NOT EXISTS reconcile_jobs (
      id TEXT PRIMARY KEY,
      work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
      trigger_type TEXT NOT NULL,
      source_snapshot_id TEXT NOT NULL,
      formal_version INTEGER NOT NULL,
      priority_class TEXT NOT NULL CHECK (priority_class IN ('NORMAL', 'INTERACTIVE', 'SYSTEM_RECOVERY')),
      attempt INTEGER NOT NULL DEFAULT 0,
      not_before TEXT,
      status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'STALE')),
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    this.#database.exec("CREATE INDEX IF NOT EXISTS reconcile_jobs_status_idx ON reconcile_jobs(status, not_before, created_at)");
    if (!this.#hasColumn("reconcile_jobs", "last_outcome")) this.#database.exec("ALTER TABLE reconcile_jobs ADD COLUMN last_outcome TEXT");
    this.#database.exec(`CREATE TABLE IF NOT EXISTS maintenance_pause (
      scope_key TEXT PRIMARY KEY,
      paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
      updated_at TEXT NOT NULL
    )`);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (8, ?)").run(new Date().toISOString());
  }

  #migrateV9(): void {
    const additions = [
      ["projection_obligations", "last_attempt_at", "TEXT"],
      ["projection_obligations", "next_attempt_at", "TEXT"],
      ["projection_obligations", "retry_exhausted", "INTEGER NOT NULL DEFAULT 0"],
    ] as const;
    for (const [table, column, definition] of additions) if (!this.#hasColumn(table, column)) this.#database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (9, ?)").run(new Date().toISOString());
  }

  #migrateV10(): void {
    this.#database.exec(`CREATE TABLE IF NOT EXISTS context_associations (
      id TEXT PRIMARY KEY,
      work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
      graph_id TEXT NOT NULL,
      block_uuid TEXT NOT NULL,
      page_name TEXT,
      source_version_hash TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('USER_EXPLICIT', 'AGENT_INFERRED', 'SYSTEM_STRUCTURAL')),
      basis_run_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INVALIDATED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    this.#database.exec("CREATE UNIQUE INDEX IF NOT EXISTS context_associations_active_idx ON context_associations(work_object_id, graph_id, block_uuid) WHERE status='ACTIVE'");
    this.#database.exec("CREATE INDEX IF NOT EXISTS context_associations_source_idx ON context_associations(graph_id, block_uuid)");
    this.#database.exec(`CREATE TABLE IF NOT EXISTS association_corrections (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL,
      block_uuid TEXT NOT NULL,
      scope_snapshot TEXT NOT NULL,
      rejected_work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
      affirmed_work_object_id TEXT REFERENCES work_objects(id),
      user_decision_ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    this.#database.exec("CREATE INDEX IF NOT EXISTS association_corrections_source_idx ON association_corrections(graph_id, block_uuid)");
    this.#database.exec(`CREATE TABLE IF NOT EXISTS governance_issues (
      id TEXT PRIMARY KEY,
      work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
      dimension TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('UNKNOWN', 'CONFLICT', 'BOUNDARY_CANDIDATE')),
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'SUPERSEDED')),
      summary TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL DEFAULT '[]',
      source_snapshot_id TEXT NOT NULL,
      formal_version INTEGER NOT NULL,
      correlation_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    )`);
    this.#database.exec("CREATE INDEX IF NOT EXISTS governance_issues_open_idx ON governance_issues(work_object_id, dimension, status)");
    this.#database.exec("CREATE UNIQUE INDEX IF NOT EXISTS governance_issues_open_dedupe_idx ON governance_issues(work_object_id, dimension, type, source_snapshot_id) WHERE status='OPEN'");
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (10, ?)").run(new Date().toISOString());
  }

  #migrateV11(): void {
    if (!this.#hasColumn("reconcile_jobs", "source_block_uuid")) this.#database.exec("ALTER TABLE reconcile_jobs ADD COLUMN source_block_uuid TEXT");
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (11, ?)").run(new Date().toISOString());
  }

  #migrateV12(): void {
    this.#database.exec(`CREATE TABLE IF NOT EXISTS decision_packages (
      id TEXT PRIMARY KEY,
      work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      rationale TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED', 'STALE')),
      target_versions_json TEXT NOT NULL,
      issue_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    this.#database.exec(`CREATE TABLE IF NOT EXISTS decision_candidates (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL REFERENCES decision_packages(id) ON DELETE CASCADE,
      operation_type TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED', 'DEFERRED')),
      created_at TEXT NOT NULL
    )`);
    this.#database.exec("CREATE INDEX IF NOT EXISTS decision_candidates_package_idx ON decision_candidates(package_id, status)");
    this.#database.exec(`CREATE TABLE IF NOT EXISTS user_decisions (
      id TEXT PRIMARY KEY,
      work_object_ids_json TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      scope TEXT NOT NULL,
      exact_user_utterance TEXT NOT NULL,
      minimal_decision_context TEXT NOT NULL,
      input_versions_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('EXECUTED', 'REJECTED', 'STALE', 'AUTHORIZED')),
      package_id TEXT,
      authorization_ref TEXT,
      created_at TEXT NOT NULL,
      executed_at TEXT,
      execution_refs_json TEXT NOT NULL DEFAULT '[]'
    )`);
    this.#database.exec("CREATE INDEX IF NOT EXISTS user_decisions_package_idx ON user_decisions(package_id, status)");
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (12, ?)").run(new Date().toISOString());
  }

  #migrateV13(): void {
    if (!this.#hasColumn("decision_packages", "presentation_revision")) this.#database.exec("ALTER TABLE decision_packages ADD COLUMN presentation_revision TEXT NOT NULL DEFAULT '1'");
    if (!this.#hasColumn("decision_packages", "presented_at")) this.#database.exec("ALTER TABLE decision_packages ADD COLUMN presented_at TEXT");
    this.#database.exec(`CREATE TABLE IF NOT EXISTS trusted_user_events (
      id TEXT PRIMARY KEY,
      source_channel TEXT NOT NULL CHECK (source_channel IN ('PLUGIN_USER_CHANNEL')),
      source_capability TEXT,
      exact_user_utterance TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      package_id TEXT,
      presentation_revision TEXT,
      correlation_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED')),
      consumed_by_decision_id TEXT,
      created_at TEXT NOT NULL
    )`);
    this.#database.exec("CREATE INDEX IF NOT EXISTS trusted_user_events_package_idx ON trusted_user_events(package_id, status)");
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (13, ?)").run(new Date().toISOString());
  }

  close(): void { this.#database.close(); }
  schemaVersion(): number { return Number((this.#database.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version); }

  transaction<T>(work: () => T): T { return this.#database.transaction(work)(); }

  putWorkObject(object: WorkObject): void {
    this.#database.prepare(`INSERT INTO work_objects(id, kind, title, lifecycle, engagement, current_focus, desired_outcome, completion_checks_json, waiting_condition_json, version, created_at, updated_at)
      VALUES (@id, @kind, @title, @lifecycle, @engagement, @currentFocus, @desiredOutcome, @completionChecksJson, @waitingConditionJson, @version, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, lifecycle=excluded.lifecycle,
      engagement=excluded.engagement, current_focus=excluded.current_focus, desired_outcome=excluded.desired_outcome, completion_checks_json=excluded.completion_checks_json, waiting_condition_json=excluded.waiting_condition_json, version=excluded.version, updated_at=excluded.updated_at`).run({ ...object, completionChecksJson: encode(object.completionChecks), waitingConditionJson: encode(object.waitingCondition) });
  }

  getWorkObject(id: string): WorkObject | null {
    const row = this.#database.prepare("SELECT * FROM work_objects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), kind: row.kind as WorkObject["kind"], title: String(row.title), lifecycle: row.lifecycle as WorkObject["lifecycle"], engagement: row.engagement as WorkObject["engagement"], waitingCondition: decode(row.waiting_condition_json === null ? null : String(row.waiting_condition_json)) as WorkObject["waitingCondition"], currentFocus: row.current_focus === null ? null : String(row.current_focus), desiredOutcome: row.desired_outcome === null ? null : String(row.desired_outcome), completionChecks: decode(String(row.completion_checks_json)) as string[], version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  listWorkObjects(): WorkObject[] {
    return (this.#database.prepare("SELECT id FROM work_objects ORDER BY created_at, id").all() as Array<{ id: string }>).map(({ id }) => this.getWorkObject(id)!);
  }

  listActionableWorkObjects(): WorkObject[] {
    return (this.#database.prepare("SELECT id FROM work_objects WHERE lifecycle='OPEN' AND engagement='ACTIONABLE' ORDER BY created_at,id").all() as Array<{ id: string }>).map(({ id }) => this.getWorkObject(id)!);
  }

  deleteWorkObject(id: string): void { this.#database.prepare("DELETE FROM work_objects WHERE id = ?").run(id); }

  putAnchor(anchor: PrimaryAnchor): void {
    this.#database.prepare(`INSERT INTO anchors(id, work_object_id, graph_id, external_id, source_content_hash,
      projection_container_uuid, projection_title_uuid, projection_state_uuid, projection_focus_uuid, projection_waiting_uuid, projection_outcome_uuid, projection_completion_uuid, created_at, updated_at)
      VALUES (@id, @workObjectId, @graphId, @externalId, @sourceContentHash, @projectionContainerUuid,
      @projectionTitleUuid, @projectionStateUuid, @projectionFocusUuid, @projectionWaitingUuid, @projectionOutcomeUuid, @projectionCompletionUuid, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET source_content_hash=excluded.source_content_hash, updated_at=excluded.updated_at`).run(anchor);
  }

  getAnchorForWorkObject(workObjectId: string): PrimaryAnchor | null {
    const row = this.#database.prepare("SELECT * FROM anchors WHERE work_object_id = ?").get(workObjectId) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), workObjectId: String(row.work_object_id), graphId: String(row.graph_id), externalId: String(row.external_id), sourceContentHash: String(row.source_content_hash), projectionContainerUuid: String(row.projection_container_uuid), projectionTitleUuid: String(row.projection_title_uuid), projectionStateUuid: String(row.projection_state_uuid), projectionFocusUuid: String(row.projection_focus_uuid), projectionWaitingUuid: String(row.projection_waiting_uuid), projectionOutcomeUuid: String(row.projection_outcome_uuid), projectionCompletionUuid: String(row.projection_completion_uuid), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  insertCommit(commit: StoredCommit): void {
    try {
      this.#database.prepare(`INSERT INTO commits(id, status, actor_type, actor_id, operation_type, target_id,
        operation_json, preconditions_json, before_json, after_json, inverse_json, graph_effect_json, graph_result_json,
        failure_reason, compensation_for, compensated_by, governance_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(commit.id, commit.status, commit.actor.type, commit.actor.id, commit.operationType, commit.targetId,
          encode(commit.operation), encode(commit.preconditions), encode(commit.before), encode(commit.after), encode(commit.inverse),
          encode(commit.graphEffect), encode(commit.graphResult), commit.failureReason, commit.compensationFor, commit.compensatedBy,
          encode(commit.governance), commit.createdAt, commit.updatedAt);
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

  putProjectionObligation(obligation: ProjectionObligation): void {
    this.#database.prepare(`INSERT INTO projection_obligations(id, commit_id, work_object_id, formal_version, target_anchor_id, desired_projection_hash, status, attempt, last_attempt_at, next_attempt_at, retry_exhausted, last_error, created_at, updated_at)
      VALUES (@id, @commitId, @workObjectId, @formalVersion, @targetAnchorId, @desiredProjectionHash, @status, @attempt, @lastAttemptAt, @nextAttemptAt, @retryExhausted, @lastError, @createdAt, @updatedAt)`).run({ ...obligation, retryExhausted: obligation.retryExhausted ? 1 : 0 });
  }

  getProjectionObligationForCommit(commitId: string): ProjectionObligation | null {
    const row = this.#database.prepare("SELECT * FROM projection_obligations WHERE commit_id = ?").get(commitId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id), commitId: String(row.commit_id), workObjectId: String(row.work_object_id), formalVersion: Number(row.formal_version),
      targetAnchorId: String(row.target_anchor_id), desiredProjectionHash: row.desired_projection_hash === null ? null : String(row.desired_projection_hash),
      status: row.status as ProjectionObligation["status"], attempt: Number(row.attempt),
      lastAttemptAt: row.last_attempt_at === null ? null : String(row.last_attempt_at), nextAttemptAt: row.next_attempt_at === null ? null : String(row.next_attempt_at),
      retryExhausted: Number(row.retry_exhausted) === 1, lastError: row.last_error === null ? null : String(row.last_error),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  listProjectionObligations(status?: ProjectionObligation["status"]): ProjectionObligation[] {
    const rows = status
      ? (this.#database.prepare("SELECT commit_id FROM projection_obligations WHERE status=? ORDER BY created_at, id").all(status) as Array<{ commit_id: string }>)
      : (this.#database.prepare("SELECT commit_id FROM projection_obligations ORDER BY created_at, id").all() as Array<{ commit_id: string }>);
    return rows.map((row) => this.getProjectionObligationForCommit(row.commit_id)!).filter(Boolean);
  }

  transitionProjectionObligation(commitId: string, status: ProjectionObligation["status"], update: { updatedAt: string; lastError?: string | null; attempt?: number; lastAttemptAt?: string | null; nextAttemptAt?: string | null; retryExhausted?: boolean }): void {
    const changed = this.#database.prepare(`UPDATE projection_obligations SET status=?, updated_at=?, last_error=COALESCE(?, last_error), attempt=COALESCE(?, attempt),
      last_attempt_at=COALESCE(?, last_attempt_at), next_attempt_at=COALESCE(?, next_attempt_at), retry_exhausted=COALESCE(?, retry_exhausted) WHERE commit_id=?`)
      .run(status, update.updatedAt, update.lastError ?? null, update.attempt ?? null, update.lastAttemptAt ?? null, update.nextAttemptAt ?? null, update.retryExhausted === undefined ? null : update.retryExhausted ? 1 : 0, commitId);
    if (!changed.changes) throw new Error("PROJECTION_OBLIGATION_NOT_FOUND");
  }

  setCompensatedBy(id: string, compensationCommitId: string, updatedAt: string): void {
    const changed = this.#database.prepare("UPDATE commits SET compensated_by = ?, updated_at = ? WHERE id = ?")
      .run(compensationCommitId, updatedAt, id);
    if (!changed.changes) throw new Error("COMMIT_NOT_FOUND");
  }

  hasPendingRecoveryForTarget(workObjectId: string): boolean {
    return Boolean(this.#database.prepare("SELECT 1 FROM commits WHERE target_id=? AND status IN ('PREPARED','KERNEL_APPLIED','GRAPH_APPLIED','RECOVERY_REQUIRED') LIMIT 1").get(workObjectId));
  }

  putCompletionRecord(record: CompletionRecord, commitId: string): void {
    try { this.#database.prepare("INSERT INTO completion_records(id,work_object_id,record_json,commit_id,created_at) VALUES (?,?,?,?,?)").run(record.id, record.workObjectId, encode(record), commitId, record.completedAt); }
    catch (error) { if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) throw new Error("CLOSURE_RECORD_IMMUTABLE", { cause: error }); throw error; }
  }

  putCancellationRecord(record: CancellationRecord, commitId: string): void {
    try { this.#database.prepare("INSERT INTO cancellation_records(id,work_object_id,record_json,commit_id,created_at) VALUES (?,?,?,?,?)").run(record.id, record.workObjectId, encode(record), commitId, record.cancelledAt); }
    catch (error) { if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) throw new Error("CLOSURE_RECORD_IMMUTABLE", { cause: error }); throw error; }
  }

  putClosureAmendment(record: ClosureAmendment, commitId: string): void {
    try { this.#database.prepare("INSERT INTO closure_amendments(id,work_object_id,target_closure_record_id,record_json,commit_id,created_at) VALUES (?,?,?,?,?,?)").run(record.id, record.workObjectId, record.targetClosureRecordId, encode(record), commitId, record.amendedAt); }
    catch (error) { if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) throw new Error("CLOSURE_RECORD_IMMUTABLE", { cause: error }); throw error; }
  }

  putReopenRecord(record: ReopenRecord, commitId: string): void {
    try { this.#database.prepare("INSERT INTO reopen_records(id,work_object_id,previous_closure_record_id,record_json,commit_id,created_at) VALUES (?,?,?,?,?,?)").run(record.id, record.workObjectId, record.previousClosureRecordId, encode(record), commitId, record.reopenedAt); }
    catch (error) { if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) throw new Error("CLOSURE_RECORD_IMMUTABLE", { cause: error }); throw error; }
  }

  getClosureRecord(id: string): CompletionRecord | CancellationRecord | null {
    const row = this.#database.prepare("SELECT record_json FROM completion_records WHERE id=? UNION ALL SELECT record_json FROM cancellation_records WHERE id=? LIMIT 1").get(id, id) as { record_json: string } | undefined;
    return row ? decode(row.record_json) as CompletionRecord | CancellationRecord : null;
  }

  getCurrentClosureRecord(workObjectId: string): CompletionRecord | CancellationRecord | null {
    const object = this.getWorkObject(workObjectId);
    if (!object || object.lifecycle === "OPEN") return null;
    const table = object.lifecycle === "COMPLETED" ? "completion_records" : "cancellation_records";
    const row = this.#database.prepare(`SELECT record_json FROM ${table} WHERE work_object_id=? AND commit_id IN (SELECT id FROM commits WHERE status='COMMITTED' AND compensated_by IS NULL) ORDER BY created_at DESC,rowid DESC LIMIT 1`).get(workObjectId) as { record_json: string } | undefined;
    return row ? decode(row.record_json) as CompletionRecord | CancellationRecord : null;
  }

  getClosureHistory(workObjectId: string): ClosureHistory {
    const records = <T>(table: string): T[] => (this.#database.prepare(`SELECT record_json FROM ${table} WHERE work_object_id=? AND commit_id IN (SELECT id FROM commits WHERE status='COMMITTED') ORDER BY created_at,rowid`).all(workObjectId) as Array<{ record_json: string }>).map((row) => decode(row.record_json) as T);
    const completions = records<CompletionRecord>("completion_records"); const cancellations = records<CancellationRecord>("cancellation_records"); const amendments = records<ClosureAmendment>("closure_amendments"); const reopens = records<ReopenRecord>("reopen_records");
    const record = this.getCurrentClosureRecord(workObjectId);
    if (!record) return { current: null, completions, cancellations, amendments, reopens };
    const activeAmendmentIds = new Set((this.#database.prepare("SELECT id FROM closure_amendments WHERE work_object_id=? AND commit_id IN (SELECT id FROM commits WHERE status='COMMITTED' AND compensated_by IS NULL)").all(workObjectId) as Array<{ id: string }>).map((item) => item.id));
    const applied = amendments.filter((item) => item.targetClosureRecordId === record.id && activeAmendmentIds.has(item.id));
    const evidenceIds = [...new Set([...record.evidenceIds, ...applied.flatMap((item) => item.addEvidenceIds)])];
    const current = "completedAt" in record
      ? { type: "COMPLETED" as const, record, amendments: applied, outcomeSummary: applied.reduce((value, item) => item.replacementOutcomeSummary ?? value, record.outcomeSummary), evidenceIds }
      : { type: "CANCELLED" as const, record, amendments: applied, reason: applied.reduce((value, item) => item.replacementCancellationReason ?? value, record.reason), evidenceIds };
    return { current, completions, cancellations, amendments, reopens };
  }

  resolveClosureRecord(id: string, excludedAmendmentId: string | null = null): ClosureHistory["current"] {
    const record = this.getClosureRecord(id); if (!record) return null;
    const rows = this.#database.prepare("SELECT record_json,commit_id FROM closure_amendments WHERE target_closure_record_id=? ORDER BY created_at,rowid").all(id) as Array<{ record_json: string; commit_id: string }>;
    const amendments = rows.filter((row) => row.commit_id !== excludedAmendmentId && Boolean(this.#database.prepare("SELECT 1 FROM commits WHERE id=? AND status='COMMITTED' AND compensated_by IS NULL").get(row.commit_id))).map((row) => decode(row.record_json) as ClosureAmendment);
    const evidenceIds = [...new Set([...record.evidenceIds, ...amendments.flatMap((item) => item.addEvidenceIds)])];
    return "completedAt" in record ? { type: "COMPLETED", record, amendments, outcomeSummary: amendments.reduce((value, item) => item.replacementOutcomeSummary ?? value, record.outcomeSummary), evidenceIds } : { type: "CANCELLED", record, amendments, reason: amendments.reduce((value, item) => item.replacementCancellationReason ?? value, record.reason), evidenceIds };
  }

  putEvidence(evidence: FrozenEvidence): void {
    this.#database.prepare(`INSERT INTO evidence_references(id, work_object_id, graph_id, external_id, source_type, frozen_content, content_hash, locator_json, created_at)
      VALUES (@id, @workObjectId, @graphId, @externalId, @sourceType, @frozenContent, @contentHash, @locator, @frozenAt)`).run({ ...evidence, locator: JSON.stringify(evidence.locator) });
  }

  getEvidence(id: string): FrozenEvidence | null {
    const row = this.#database.prepare("SELECT * FROM evidence_references WHERE id=?").get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), workObjectId: String(row.work_object_id), sourceType: "LOGSEQ_BLOCK", graphId: String(row.graph_id), externalId: String(row.external_id), frozenContent: String(row.frozen_content), contentHash: String(row.content_hash), frozenAt: String(row.created_at), locator: JSON.parse(String(row.locator_json)) as FrozenEvidence["locator"] } : null;
  }

  listEvidence(workObjectId?: string): FrozenEvidence[] {
    const rows = workObjectId
      ? (this.#database.prepare("SELECT id FROM evidence_references WHERE work_object_id=? ORDER BY created_at,rowid").all(workObjectId) as Array<{ id: string }>)
      : (this.#database.prepare("SELECT id FROM evidence_references ORDER BY created_at,rowid").all() as Array<{ id: string }>);
    return rows.map((row) => this.getEvidence(row.id)!).filter(Boolean);
  }

  evidenceWatermark(workObjectId: string): number {
    const row = this.#database.prepare("SELECT COALESCE(MAX(rowid),0) AS watermark FROM evidence_references WHERE work_object_id=?").get(workObjectId) as { watermark: number };
    return Number(row.watermark);
  }

  registerSkill(skill: SkillIdentity, packageValue: unknown, at: string): void {
    const existing = this.#database.prepare("SELECT content_hash FROM skill_versions WHERE id=? AND version=?").get(skill.id, skill.version) as { content_hash: string } | undefined;
    if (existing && existing.content_hash !== skill.contentHash) throw new Error("SKILL_VERSION_HASH_MISMATCH");
    this.#database.prepare("INSERT OR IGNORE INTO skill_versions(id, version, content_hash, package_json, registered_at) VALUES (?, ?, ?, ?, ?)").run(skill.id, skill.version, skill.contentHash, encode(packageValue), at);
  }

  skillRegistered(skill: SkillIdentity): boolean {
    return Boolean(this.#database.prepare("SELECT 1 FROM skill_versions WHERE id=? AND version=? AND content_hash=?").get(skill.id, skill.version, skill.contentHash));
  }

  putAgentRun(run: AgentRunReceipt): void {
    this.#database.prepare(`INSERT INTO agent_run_receipts(id, agent_id, work_object_id, evidence_ids_json, skill_json, outcome, reason_code, rationale_summary, proposal_id, details_json, created_at)
      VALUES (@id, @agentId, @workObjectId, @evidenceIds, @skill, @outcome, @reasonCode, @rationaleSummary, @proposalId, @details, @createdAt)`).run({
        id: run.id, agentId: run.executor.id, workObjectId: run.subject.workObjectId, evidenceIds: encode(run.context.evidenceIds), skill: encode(run.skill),
        outcome: run.result.outcome, reasonCode: run.reasonCode, rationaleSummary: run.rationaleSummary, proposalId: run.result.proposalIds[0] ?? null,
        details: encode(run), createdAt: run.finishedAt ?? run.startedAt,
      });
  }

  finishAgentRunResult(run: AgentRunReceipt, proposal: Proposal | null, revision: ProposalRevision | null): void {
    this.transaction(() => {
      const changed = this.#database.prepare(`UPDATE agent_run_receipts SET outcome=?, reason_code=?, rationale_summary=?, proposal_id=?, details_json=?, created_at=? WHERE id=?`).run(
        run.result.outcome, run.reasonCode, run.rationaleSummary, run.result.proposalIds[0] ?? null, encode(run), run.finishedAt ?? run.startedAt, run.id,
      );
      if (!changed.changes) throw new Error("AGENT_RUN_NOT_FOUND");
      if (proposal && revision) this.putProposal(proposal, revision);
    });
  }

  putGraphReadReceipt(receipt: GraphReadReceipt): void {
    const run = this.getAgentRun(receipt.agentRunId);
    if (!run || run.executor.type !== "EXTERNAL_CLI" || run.state !== "STARTED") throw new Error("GRAPH_READ_RUN_NOT_ACTIVE");
    this.#database.prepare("INSERT OR IGNORE INTO graph_read_receipts(id,agent_run_id,kind,locator,content_hash,read_at) VALUES (@id,@agentRunId,@kind,@locator,@contentHash,@readAt)").run(receipt);
  }

  listGraphReadReceipts(agentRunId: string): GraphReadReceipt[] {
    return (this.#database.prepare("SELECT * FROM graph_read_receipts WHERE agent_run_id=? ORDER BY read_at,rowid").all(agentRunId) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), agentRunId: String(row.agent_run_id), kind: row.kind as GraphReadReceipt["kind"], locator: String(row.locator), contentHash: String(row.content_hash), readAt: String(row.read_at) }));
  }

  putAgentRunResult(run: AgentRunReceipt, proposal: Proposal | null, revision: ProposalRevision | null): void {
    this.transaction(() => {
      this.putAgentRun(run);
      if (proposal && revision) this.putProposal(proposal, revision);
    });
  }

  getAgentRun(id: string): AgentRunReceipt | null {
    const row = this.#database.prepare("SELECT * FROM agent_run_receipts WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (row.details_json) return decode(String(row.details_json)) as AgentRunReceipt;
    return {
      id: String(row.id), purpose: "CURRENT_FOCUS_MAINTENANCE", executor: { type: "FAKE", id: String(row.agent_id) }, state: "FINISHED", operationContractVersion: 1,
      skill: decode(String(row.skill_json)) as SkillIdentity, subject: { workObjectId: String(row.work_object_id) },
      context: { targetVersion: 1, evidenceIds: decode(String(row.evidence_ids_json)) as string[] }, result: { outcome: row.outcome as AgentRunReceipt["result"]["outcome"], proposalIds: row.proposal_id === null ? [] : [String(row.proposal_id)] },
      reasonCode: String(row.reason_code), rationaleSummary: String(row.rationale_summary), startedAt: String(row.created_at), finishedAt: String(row.created_at),
    };
  }

  putProposal(proposal: Proposal, revision: ProposalRevision): void {
    this.transaction(() => {
      this.#database.prepare(`INSERT INTO proposals(id, work_object_id, status, latest_revision, applied_commit_id, invalidation_reason, created_at, updated_at)
        VALUES (@id,@workObjectId,@status,@latestRevision,@appliedCommitId,@invalidationReason,@createdAt,@updatedAt)`).run(proposal);
      this.#database.prepare("INSERT INTO proposal_revisions(proposal_id, revision, revision_json) VALUES (?, ?, ?)").run(revision.proposalId, revision.revision, encode(revision));
    });
  }

  getProposal(id: string): { proposal: Proposal; revision: ProposalRevision } | null {
    const row = this.#database.prepare("SELECT * FROM proposals WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const proposal: Proposal = { id: String(row.id), workObjectId: String(row.work_object_id), status: row.status as Proposal["status"], latestRevision: Number(row.latest_revision), appliedCommitId: row.applied_commit_id === null ? null : String(row.applied_commit_id), invalidationReason: row.invalidation_reason === null ? null : String(row.invalidation_reason), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
    const revisionRow = this.#database.prepare("SELECT revision_json FROM proposal_revisions WHERE proposal_id=? AND revision=?").get(id, proposal.latestRevision) as { revision_json: string };
    return { proposal, revision: decode(revisionRow.revision_json) as ProposalRevision };
  }

  appendProposalRevision(revision: ProposalRevision, at: string): void {
    this.transaction(() => {
      this.#database.prepare("INSERT INTO proposal_revisions(proposal_id, revision, revision_json) VALUES (?, ?, ?)").run(revision.proposalId, revision.revision, encode(revision));
      const changed = this.#database.prepare("UPDATE proposals SET latest_revision=?, updated_at=? WHERE id=? AND status='OPEN'").run(revision.revision, at, revision.proposalId);
      if (!changed.changes) throw new Error("PROPOSAL_NOT_OPEN");
    });
  }

  appendProposalRevisionWithFeedback(revision: ProposalRevision, feedback: FeedbackEvent, at: string): void {
    this.transaction(() => { this.appendProposalRevision(revision, at); this.putFeedback(feedback); });
  }

  transitionProposal(id: string, status: Proposal["status"], at: string, update: { appliedCommitId?: string; invalidationReason?: string } = {}): void {
    this.#database.prepare("UPDATE proposals SET status=?, updated_at=?, applied_commit_id=COALESCE(?,applied_commit_id), invalidation_reason=COALESCE(?,invalidation_reason) WHERE id=?").run(status, at, update.appliedCommitId ?? null, update.invalidationReason ?? null, id);
  }

  putFeedback(event: FeedbackEvent): void {
    this.#database.prepare("INSERT OR IGNORE INTO feedback_events(id,type,proposal_id,agent_run_id,commit_id,details_json,created_at) VALUES (@id,@type,@proposalId,@agentRunId,@commitId,@details,@createdAt)").run({ ...event, details: encode(event) });
  }

  listFeedback(): FeedbackEvent[] {
    return (this.#database.prepare("SELECT * FROM feedback_events ORDER BY created_at,rowid").all() as Array<Record<string, unknown>>).map((row) => {
      if (row.details_json) return decode(String(row.details_json)) as FeedbackEvent;
      const revision = this.getProposal(String(row.proposal_id))?.revision;
      if (!revision) throw new Error("FEEDBACK_PROPOSAL_MISSING");
      return { id: String(row.id), type: row.type as FeedbackEvent["type"], proposalId: String(row.proposal_id), agentRunId: String(row.agent_run_id), proposalRevision: revision.revision, skill: revision.skill, operationType: revision.operationType, commitId: row.commit_id === null ? null : String(row.commit_id), before: null, after: null, createdAt: String(row.created_at) };
    });
  }

  putCurationReceipt(receipt: CurationReceipt): void {
    this.#database.prepare("INSERT INTO curation_receipts(id,work_object_id,agent_run_id,details_json,created_at) VALUES (@id,@workObjectId,@agentRunId,@details,@createdAt)").run({ ...receipt, details: encode(receipt) });
  }

  getCurationReceipt(id: string): CurationReceipt | null {
    const row = this.#database.prepare("SELECT details_json FROM curation_receipts WHERE id=?").get(id) as { details_json: string } | undefined;
    return row ? decode(row.details_json) as CurationReceipt : null;
  }

  listCurationReceipts(workObjectId?: string): CurationReceipt[] {
    const rows = workObjectId
      ? this.#database.prepare("SELECT details_json FROM curation_receipts WHERE work_object_id=? ORDER BY created_at,rowid").all(workObjectId)
      : this.#database.prepare("SELECT details_json FROM curation_receipts ORDER BY created_at,rowid").all();
    return (rows as Array<{ details_json: string }>).map((row) => decode(row.details_json) as CurationReceipt);
  }

  upsertSourceCoverage(state: SourceCoverageState): void {
    this.#database.prepare(`INSERT INTO source_coverage(work_object_id,last_observed_source_snapshot_id,last_reconciled_source_snapshot_id,formal_version_at_last_reconcile,has_uncovered_changes,updated_at)
      VALUES (@workObjectId,@lastObservedSourceSnapshotId,@lastReconciledSourceSnapshotId,@formalVersionAtLastReconcile,@hasUncoveredChanges,@updatedAt)
      ON CONFLICT(work_object_id) DO UPDATE SET last_observed_source_snapshot_id=excluded.last_observed_source_snapshot_id,
      last_reconciled_source_snapshot_id=COALESCE(excluded.last_reconciled_source_snapshot_id, source_coverage.last_reconciled_source_snapshot_id),
      formal_version_at_last_reconcile=COALESCE(excluded.formal_version_at_last_reconcile, source_coverage.formal_version_at_last_reconcile),
      has_uncovered_changes=excluded.has_uncovered_changes, updated_at=excluded.updated_at`).run({ ...state, hasUncoveredChanges: state.hasUncoveredChanges ? 1 : 0 });
  }

  getSourceCoverage(workObjectId: string): SourceCoverageState | null {
    const row = this.#database.prepare("SELECT * FROM source_coverage WHERE work_object_id=?").get(workObjectId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      workObjectId: String(row.work_object_id), lastObservedSourceSnapshotId: String(row.last_observed_source_snapshot_id),
      lastReconciledSourceSnapshotId: row.last_reconciled_source_snapshot_id === null ? null : String(row.last_reconciled_source_snapshot_id),
      formalVersionAtLastReconcile: row.formal_version_at_last_reconcile === null ? null : Number(row.formal_version_at_last_reconcile),
      hasUncoveredChanges: Number(row.has_uncovered_changes) === 1, updatedAt: String(row.updated_at),
    };
  }

  markSourceCovered(workObjectId: string, snapshotId: string, formalVersion: number, at: string): void {
    const changed = this.#database.prepare("UPDATE source_coverage SET last_reconciled_source_snapshot_id=?, formal_version_at_last_reconcile=?, has_uncovered_changes=0, updated_at=? WHERE work_object_id=?").run(snapshotId, formalVersion, at, workObjectId);
    if (!changed.changes) throw new Error("SOURCE_COVERAGE_NOT_FOUND");
  }

  insertReconcileJob(job: ReconcileJob): void {
    this.#database.prepare(`INSERT INTO reconcile_jobs(id,work_object_id,trigger_type,source_snapshot_id,source_block_uuid,formal_version,priority_class,attempt,not_before,status,last_error,last_outcome,created_at,updated_at)
      VALUES (@id,@workObjectId,@triggerType,@sourceSnapshotId,@sourceBlockUuid,@formalVersion,@priorityClass,@attempt,@notBefore,@status,@lastError,@lastOutcome,@createdAt,@updatedAt)`).run({ ...job, lastOutcome: null, sourceBlockUuid: job.sourceBlockUuid ?? null });
  }

  invalidateActiveReconcileJobs(workObjectId: string, at: string): void {
    this.#database.prepare("UPDATE reconcile_jobs SET status='STALE', updated_at=? WHERE work_object_id=? AND status IN ('QUEUED','RUNNING')").run(at, workObjectId);
  }

  enqueueReconcileJob(job: ReconcileJob): void {
    this.transaction(() => {
      this.invalidateActiveReconcileJobs(job.workObjectId, job.updatedAt);
      this.insertReconcileJob(job);
    });
  }

  getReconcileJob(id: string): ReconcileJob | null {
    const row = this.#database.prepare("SELECT * FROM reconcile_jobs WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.#mapReconcileJob(row);
  }

  listReconcileJobs(status?: ReconcileJob["status"]): ReconcileJob[] {
    const rows = status
      ? (this.#database.prepare("SELECT * FROM reconcile_jobs WHERE status=? ORDER BY created_at, id").all(status) as Array<Record<string, unknown>>)
      : (this.#database.prepare("SELECT * FROM reconcile_jobs ORDER BY created_at, id").all() as Array<Record<string, unknown>>);
    return rows.map((row) => this.#mapReconcileJob(row));
  }

  claimNextReconcileJob(at: string): ReconcileJob | null {
    return this.transaction(() => {
      const priorities: ReconcilePriorityClass[] = ["INTERACTIVE", "SYSTEM_RECOVERY", "NORMAL"];
      for (const priority of priorities) {
        const row = this.#database.prepare(`SELECT * FROM reconcile_jobs WHERE status='QUEUED' AND priority_class=? AND (not_before IS NULL OR not_before<=?) ORDER BY created_at, id LIMIT 1`).get(priority, at) as Record<string, unknown> | undefined;
        if (!row) continue;
        const job = this.#mapReconcileJob(row);
        this.#database.prepare("UPDATE reconcile_jobs SET status='RUNNING', attempt=attempt+1, updated_at=? WHERE id=?").run(at, job.id);
        return { ...job, status: "RUNNING" as const, attempt: job.attempt + 1, updatedAt: at };
      }
      return null;
    });
  }

  completeReconcileJob(id: string, workObjectId: string, snapshotId: string, formalVersion: number, at: string, outcome: string): void {
    this.transaction(() => {
      const changed = this.#database.prepare("UPDATE reconcile_jobs SET status='DONE', last_error=NULL, last_outcome=?, updated_at=? WHERE id=? AND status='RUNNING'").run(outcome, at, id);
      if (!changed.changes) throw new Error("RECONCILE_JOB_NOT_RUNNING");
      this.markSourceCovered(workObjectId, snapshotId, formalVersion, at);
    });
  }

  failReconcileJob(id: string, reason: string, nextNotBefore: string, at: string, maxAttempts: number): ReconcileJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM reconcile_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("RECONCILE_JOB_NOT_RUNNING");
      const job = this.#mapReconcileJob(row);
      const status = job.attempt >= maxAttempts ? "FAILED" as const : "QUEUED" as const;
      this.#database.prepare("UPDATE reconcile_jobs SET status=?, last_error=?, not_before=?, updated_at=? WHERE id=?").run(status, reason, status === "QUEUED" ? nextNotBefore : null, at, id);
      return { ...job, status, lastError: reason, notBefore: status === "QUEUED" ? nextNotBefore : null, updatedAt: at };
    });
  }

  setMaintenancePause(scopeKey: string, paused: boolean, at: string): void {
    this.#database.prepare("INSERT INTO maintenance_pause(scope_key,paused,updated_at) VALUES (?,?,?) ON CONFLICT(scope_key) DO UPDATE SET paused=excluded.paused, updated_at=excluded.updated_at").run(scopeKey, paused ? 1 : 0, at);
  }

  isMaintenancePaused(scopeKey: string): boolean {
    const row = this.#database.prepare("SELECT paused FROM maintenance_pause WHERE scope_key=?").get(scopeKey) as { paused: number } | undefined;
    return row?.paused === 1;
  }

  putContextAssociation(association: ContextAssociation): void {
    this.#database.prepare(`INSERT INTO context_associations(id, work_object_id, graph_id, block_uuid, page_name, source_version_hash, origin, basis_run_id, status, created_at, updated_at)
      VALUES (@id, @workObjectId, @graphId, @blockUuid, @pageName, @sourceVersionHash, @origin, @basisRunId, @status, @createdAt, @updatedAt)`)
      .run({ ...association, graphId: association.sourceRef.graphId, blockUuid: association.sourceRef.blockUuid, pageName: association.sourceRef.pageName ?? null, basisRunId: association.basisRunId ?? null });
  }

  getContextAssociation(id: string): ContextAssociation | null {
    const row = this.#database.prepare("SELECT * FROM context_associations WHERE id=?").get(id) as Record<string, unknown> | undefined;
    return row ? this.#mapContextAssociation(row) : null;
  }

  findActiveContextAssociation(workObjectId: string, graphId: string, blockUuid: string): ContextAssociation | null {
    const row = this.#database.prepare("SELECT * FROM context_associations WHERE work_object_id=? AND graph_id=? AND block_uuid=? AND status='ACTIVE'").get(workObjectId, graphId, blockUuid) as Record<string, unknown> | undefined;
    return row ? this.#mapContextAssociation(row) : null;
  }

  listContextAssociations(workObjectId?: string, status?: ContextAssociation["status"]): ContextAssociation[] {
    const rows = workObjectId
      ? (status ? this.#database.prepare("SELECT * FROM context_associations WHERE work_object_id=? AND status=? ORDER BY created_at,id").all(workObjectId, status) : this.#database.prepare("SELECT * FROM context_associations WHERE work_object_id=? ORDER BY created_at,id").all(workObjectId))
      : (status ? this.#database.prepare("SELECT * FROM context_associations WHERE status=? ORDER BY created_at,id").all(status) : this.#database.prepare("SELECT * FROM context_associations ORDER BY created_at,id").all());
    return (rows as Array<Record<string, unknown>>).map((row) => this.#mapContextAssociation(row));
  }

  invalidateContextAssociation(id: string, at: string): void {
    const changed = this.#database.prepare("UPDATE context_associations SET status='INVALIDATED', updated_at=? WHERE id=? AND status='ACTIVE'").run(at, id);
    if (!changed.changes) throw new Error("CONTEXT_ASSOCIATION_NOT_ACTIVE");
  }

  findActiveCorrection(graphId: string, blockUuid: string, rejectedWorkObjectId: string): AssociationCorrection | null {
    const row = this.#database.prepare("SELECT * FROM association_corrections WHERE graph_id=? AND block_uuid=? AND rejected_work_object_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(graphId, blockUuid, rejectedWorkObjectId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.#mapAssociationCorrection(row);
  }

  putAssociationCorrection(correction: AssociationCorrection): void {
    this.#database.prepare(`INSERT INTO association_corrections(id, graph_id, block_uuid, scope_snapshot, rejected_work_object_id, affirmed_work_object_id, user_decision_ref, created_at)
      VALUES (@id, @graphId, @blockUuid, @scopeSnapshot, @rejectedWorkObjectId, @affirmedWorkObjectId, @userDecisionRef, @createdAt)`)
      .run({ ...correction, graphId: correction.sourceRef.graphId, blockUuid: correction.sourceRef.blockUuid });
  }

  putGovernanceIssue(issue: GovernanceIssue): void {
    this.#database.prepare(`INSERT INTO governance_issues(id, work_object_id, dimension, type, status, summary, evidence_ids_json, source_snapshot_id, formal_version, correlation_id, created_at, updated_at, resolved_at)
      VALUES (@id, @workObjectId, @dimension, @type, @status, @summary, @evidenceIds, @sourceSnapshotId, @formalVersion, @correlationId, @createdAt, @updatedAt, @resolvedAt)`)
      .run({ ...issue, evidenceIds: encode(issue.evidenceIds) });
  }

  findOpenGovernanceIssue(workObjectId: string, dimension: string, type: GovernanceIssue["type"], sourceSnapshotId: string): GovernanceIssue | null {
    const row = this.#database.prepare("SELECT * FROM governance_issues WHERE work_object_id=? AND dimension=? AND type=? AND source_snapshot_id=? AND status='OPEN'").get(workObjectId, dimension, type, sourceSnapshotId) as Record<string, unknown> | undefined;
    return row ? this.#mapGovernanceIssue(row) : null;
  }

  getGovernanceIssue(id: string): GovernanceIssue | null {
    const row = this.#database.prepare("SELECT * FROM governance_issues WHERE id=?").get(id) as Record<string, unknown> | undefined;
    return row ? this.#mapGovernanceIssue(row) : null;
  }

  listGovernanceIssues(workObjectId?: string, status?: GovernanceIssue["status"]): GovernanceIssue[] {
    const rows = workObjectId
      ? (status ? this.#database.prepare("SELECT * FROM governance_issues WHERE work_object_id=? AND status=? ORDER BY created_at,id").all(workObjectId, status) : this.#database.prepare("SELECT * FROM governance_issues WHERE work_object_id=? ORDER BY created_at,id").all(workObjectId))
      : (status ? this.#database.prepare("SELECT * FROM governance_issues WHERE status=? ORDER BY created_at,id").all(status) : this.#database.prepare("SELECT * FROM governance_issues ORDER BY created_at,id").all());
    return (rows as Array<Record<string, unknown>>).map((row) => this.#mapGovernanceIssue(row));
  }

  transitionGovernanceIssue(id: string, status: GovernanceIssue["status"], at: string): void {
    const changed = this.#database.prepare("UPDATE governance_issues SET status=?, updated_at=?, resolved_at=? WHERE id=?").run(status, at, status === "OPEN" ? null : at, id);
    if (!changed.changes) throw new Error("GOVERNANCE_ISSUE_NOT_FOUND");
  }

  #mapContextAssociation(row: Record<string, unknown>): ContextAssociation {
    return {
      id: String(row.id), workObjectId: String(row.work_object_id),
      sourceRef: { graphId: String(row.graph_id), blockUuid: String(row.block_uuid), ...(row.page_name === null ? {} : { pageName: String(row.page_name) }) },
      sourceVersionHash: String(row.source_version_hash), origin: row.origin as ContextAssociation["origin"],
      ...(row.basis_run_id === null ? {} : { basisRunId: String(row.basis_run_id) }), status: row.status as ContextAssociation["status"],
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  #mapAssociationCorrection(row: Record<string, unknown>): AssociationCorrection {
    return {
      id: String(row.id), sourceRef: { graphId: String(row.graph_id), blockUuid: String(row.block_uuid) },
      scopeSnapshot: String(row.scope_snapshot), rejectedWorkObjectId: String(row.rejected_work_object_id),
      affirmedWorkObjectId: row.affirmed_work_object_id === null ? null : String(row.affirmed_work_object_id),
      userDecisionRef: String(row.user_decision_ref), createdAt: String(row.created_at),
    };
  }

  #mapGovernanceIssue(row: Record<string, unknown>): GovernanceIssue {
    return {
      id: String(row.id), workObjectId: String(row.work_object_id), dimension: String(row.dimension),
      type: row.type as GovernanceIssue["type"], status: row.status as GovernanceIssue["status"], summary: String(row.summary),
      evidenceIds: decode(String(row.evidence_ids_json)) as string[], sourceSnapshotId: String(row.source_snapshot_id),
      formalVersion: Number(row.formal_version), correlationId: row.correlation_id === null ? null : String(row.correlation_id),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at), resolvedAt: row.resolved_at === null ? null : String(row.resolved_at),
    };
  }

  putDecisionPackage(pkg: DecisionPackage): void {
    this.#database.prepare(`INSERT INTO decision_packages(id, work_object_id, summary, rationale, status, target_versions_json, issue_refs_json, presentation_revision, presented_at, created_at, updated_at)
      VALUES (@id, @workObjectId, @summary, @rationale, @status, @targetVersions, @issueRefs, @presentationRevision, @presentedAt, @createdAt, @updatedAt)`)
      .run({ ...pkg, targetVersions: encode(pkg.targetVersions), issueRefs: encode(pkg.issueRefs) });
  }

  getDecisionPackage(id: string): DecisionPackage | null {
    const row = this.#database.prepare("SELECT * FROM decision_packages WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: String(row.id), workObjectId: String(row.work_object_id), summary: String(row.summary), rationale: String(row.rationale), status: row.status as DecisionPackage["status"], targetVersions: decode(String(row.target_versions_json)) as Record<string, number>, issueRefs: decode(String(row.issue_refs_json)) as string[], presentationRevision: String(row.presentation_revision), presentedAt: row.presented_at === null ? null : String(row.presented_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  listDecisionPackages(status?: DecisionPackage["status"]): DecisionPackage[] {
    const rows = status ? this.#database.prepare("SELECT id FROM decision_packages WHERE status=? ORDER BY created_at,id").all(status) as Array<{ id: string }> : this.#database.prepare("SELECT id FROM decision_packages ORDER BY created_at,id").all() as Array<{ id: string }>;
    return rows.map((row) => this.getDecisionPackage(row.id)!).filter(Boolean);
  }

  transitionDecisionPackage(id: string, status: DecisionPackage["status"], at: string): void {
    const changed = this.#database.prepare("UPDATE decision_packages SET status=?, updated_at=? WHERE id=?").run(status, at, id);
    if (!changed.changes) throw new Error("DECISION_PACKAGE_NOT_FOUND");
  }

  putDecisionCandidate(candidate: DecisionCandidate): void {
    this.#database.prepare(`INSERT INTO decision_candidates(id, package_id, operation_type, parameters_json, evidence_ids_json, status, created_at)
      VALUES (@id, @packageId, @operationType, @parameters, @evidenceIds, @status, @createdAt)`)
      .run({ ...candidate, parameters: encode(candidate.parameters), evidenceIds: encode(candidate.evidenceIds) });
  }

  listDecisionCandidates(packageId: string, status?: DecisionCandidate["status"]): DecisionCandidate[] {
    const rows = status ? this.#database.prepare("SELECT * FROM decision_candidates WHERE package_id=? AND status=? ORDER BY created_at,id").all(packageId, status) as Array<Record<string, unknown>> : this.#database.prepare("SELECT * FROM decision_candidates WHERE package_id=? ORDER BY created_at,id").all(packageId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), packageId: String(row.package_id), operationType: row.operation_type as OperationType, parameters: decode(String(row.parameters_json)), evidenceIds: decode(String(row.evidence_ids_json)) as string[], status: row.status as DecisionCandidate["status"], createdAt: String(row.created_at) }));
  }

  transitionDecisionCandidate(id: string, status: DecisionCandidate["status"]): void {
    const changed = this.#database.prepare("UPDATE decision_candidates SET status=? WHERE id=?").run(status, id);
    if (!changed.changes) throw new Error("DECISION_CANDIDATE_NOT_FOUND");
  }

  putUserDecision(decision: UserDecision): void {
    this.#database.prepare(`INSERT INTO user_decisions(id, work_object_ids_json, operation_type, parameters_json, scope, exact_user_utterance, minimal_decision_context, input_versions_json, status, package_id, authorization_ref, created_at, executed_at, execution_refs_json)
      VALUES (@id, @workObjectIds, @operationType, @parameters, @scope, @exactUserUtterance, @minimalDecisionContext, @inputVersions, @status, @packageId, @authorizationRef, @createdAt, @executedAt, @executionRefs)`)
      .run({ ...decision, workObjectIds: encode(decision.workObjectIds), parameters: encode(decision.parameters), inputVersions: encode(decision.inputVersions), executionRefs: encode(decision.executionRefs) });
  }

  getUserDecision(id: string): UserDecision | null {
    const row = this.#database.prepare("SELECT * FROM user_decisions WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: String(row.id), workObjectIds: decode(String(row.work_object_ids_json)) as string[], operationType: row.operation_type as OperationType, parameters: decode(String(row.parameters_json)), scope: String(row.scope), exactUserUtterance: String(row.exact_user_utterance), minimalDecisionContext: String(row.minimal_decision_context), inputVersions: decode(String(row.input_versions_json)) as Record<string, number>, status: row.status as UserDecision["status"], packageId: row.package_id === null ? null : String(row.package_id), authorizationRef: row.authorization_ref === null ? null : String(row.authorization_ref), createdAt: String(row.created_at), executedAt: row.executed_at === null ? null : String(row.executed_at), executionRefs: decode(String(row.execution_refs_json)) as string[] };
  }

  listUserDecisions(packageId?: string): UserDecision[] {
    const rows = packageId ? this.#database.prepare("SELECT id FROM user_decisions WHERE package_id=? ORDER BY created_at,id").all(packageId) as Array<{ id: string }> : this.#database.prepare("SELECT id FROM user_decisions ORDER BY created_at,id").all() as Array<{ id: string }>;
    return rows.map((row) => this.getUserDecision(row.id)!).filter(Boolean);
  }

  updateUserDecisionExecution(id: string, status: UserDecision["status"], executedAt: string, executionRefs: readonly string[]): void {
    const changed = this.#database.prepare("UPDATE user_decisions SET status=?, executed_at=?, execution_refs_json=? WHERE id=?").run(status, executedAt, encode(executionRefs), id);
    if (!changed.changes) throw new Error("USER_DECISION_NOT_FOUND");
  }

  putTrustedUserEvent(event: TrustedUserEvent): void {
    this.#database.prepare(`INSERT INTO trusted_user_events(id, source_channel, source_capability, exact_user_utterance, captured_at, package_id, presentation_revision, correlation_id, status, consumed_by_decision_id, created_at)
      VALUES (@id, @sourceChannel, @sourceCapability, @exactUserUtterance, @capturedAt, @packageId, @presentationRevision, @correlationId, @status, @consumedByDecisionId, @createdAt)`).run(event);
  }

  getTrustedUserEvent(id: string): TrustedUserEvent | null {
    const row = this.#database.prepare("SELECT * FROM trusted_user_events WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: String(row.id), sourceChannel: "PLUGIN_USER_CHANNEL", sourceCapability: row.source_capability === null ? null : String(row.source_capability), exactUserUtterance: String(row.exact_user_utterance), capturedAt: String(row.captured_at), packageId: row.package_id === null ? null : String(row.package_id), presentationRevision: row.presentation_revision === null ? null : String(row.presentation_revision), correlationId: row.correlation_id === null ? null : String(row.correlation_id), status: row.status as TrustedUserEvent["status"], consumedByDecisionId: row.consumed_by_decision_id === null ? null : String(row.consumed_by_decision_id), createdAt: String(row.created_at) };
  }

  consumeTrustedUserEvent(id: string, decisionId: string): void {
    const changed = this.#database.prepare("UPDATE trusted_user_events SET status='CONSUMED', consumed_by_decision_id=? WHERE id=? AND status='PENDING'").run(decisionId, id);
    if (!changed.changes) throw new Error("TRUSTED_USER_EVENT_NOT_PENDING");
  }

  listTrustedUserEvents(packageId?: string): TrustedUserEvent[] {
    const rows = packageId ? this.#database.prepare("SELECT id FROM trusted_user_events WHERE package_id=? ORDER BY created_at,id").all(packageId) as Array<{ id: string }> : this.#database.prepare("SELECT id FROM trusted_user_events ORDER BY created_at,id").all() as Array<{ id: string }>;
    return rows.map((row) => this.getTrustedUserEvent(row.id)!).filter(Boolean);
  }

  #mapReconcileJob(row: Record<string, unknown>): ReconcileJob {
    return {
      id: String(row.id), workObjectId: String(row.work_object_id), triggerType: row.trigger_type as ReconcileTriggerType,
      sourceSnapshotId: String(row.source_snapshot_id), sourceBlockUuid: row.source_block_uuid === null ? null : String(row.source_block_uuid), formalVersion: Number(row.formal_version),
      priorityClass: row.priority_class as ReconcilePriorityClass, attempt: Number(row.attempt),
      notBefore: row.not_before === null ? null : String(row.not_before), status: row.status as ReconcileJob["status"],
      lastError: row.last_error === null ? null : String(row.last_error),
      lastOutcome: row.last_outcome === null ? null : String(row.last_outcome) as ReconcileJob["lastOutcome"],
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  deleteCommit(id: string): never { throw new Error(`LEDGER_APPEND_ONLY:${id}`); }
}
