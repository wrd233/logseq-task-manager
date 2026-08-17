import Database from "better-sqlite3";

import { deterministicUuid, type Actor, type AgentRunReceipt, type AssociationCorrection, type ClosureAssessment, type ClosureAssessmentJob, type ClosureCheckAssessment, type ClosureGateSnapshot, type ClosureHistory, type CommitStatus, type ContextAssociation, type CurationReceipt, type DecisionCandidate, type DecisionPackage, type DiscoveryRun, type DiscoveryRunSourceOutcome, type FeedbackEvent, type FormalizationCandidate, type FormalizationEvidence, type FrozenEvidence, type GovernanceDimension, type GovernanceIssue, type GraphReadReceipt, type OperationType, type ProjectIntent, type ProjectionObligation, type Proposal, type ProposalRevision, type ReconcileJob, type ReconcilePriorityClass, type ReconcileTriggerType, type SkillIdentity, type SourceCoverageState, type StoredCommit, type TrustedUserEvent, type UserDecision, type UserReadBaseline } from "@task-copilot/contracts";
export type { StoredCommit } from "@task-copilot/contracts";
import type { CancellationRecord, ClosureAmendment, CompletionRecord, PrimaryAnchor, PrimaryOwnership, ReopenRecord, WorkObject } from "@task-copilot/domain";

const SUPPORTED_SCHEMA_VERSION = 22;

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
    work_object_id TEXT REFERENCES work_objects(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    rationale TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED', 'STALE')),
    target_versions_json TEXT NOT NULL,
    issue_refs_json TEXT NOT NULL DEFAULT '[]',
    presentation_revision TEXT NOT NULL DEFAULT '1',
    candidate_revision INTEGER,
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
  CREATE TABLE IF NOT EXISTS discovery_runs (
    id TEXT PRIMARY KEY,
    scope_json TEXT NOT NULL,
    executor_id TEXT NOT NULL,
    model_alias TEXT,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
    source_count INTEGER NOT NULL,
    scope_total INTEGER NOT NULL DEFAULT 0,
    selected_count INTEGER NOT NULL DEFAULT 0,
    newly_judged_count INTEGER NOT NULL DEFAULT 0,
    already_covered_count INTEGER NOT NULL DEFAULT 0,
    total_covered_count INTEGER NOT NULL DEFAULT 0,
    remaining_count INTEGER NOT NULL DEFAULT 0,
    continuation_token TEXT,
    association_count INTEGER NOT NULL,
    no_candidate_count INTEGER NOT NULL,
    candidate_ids_json TEXT NOT NULL DEFAULT '[]',
    summary_text TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    token_usage_json TEXT,
    error TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS discovery_run_sources (
    run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('ASSOCIATED', 'ATTACHED', 'NO_CANDIDATE', 'CANDIDATE', 'UNRESOLVED')),
    candidate_id TEXT,
    target_work_object_id TEXT,
    reason TEXT,
    PRIMARY KEY (run_id, graph_id, block_uuid)
  );
  CREATE TABLE IF NOT EXISTS formalization_candidates (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'MATERIALIZED', 'DISMISSED', 'EXPIRED')),
    revision INTEGER NOT NULL DEFAULT 1,
    scope_json TEXT NOT NULL,
    recommended_kind TEXT NOT NULL,
    recommended_owner_id TEXT,
    proposed_title TEXT,
    proposed_work_intent_json TEXT,
    rationale_summary TEXT NOT NULL,
    maturity TEXT NOT NULL DEFAULT 'UNEVALUATED' CHECK (maturity IN ('UNEVALUATED', 'KEEP_OBSERVING', 'READY_FOR_DECISION', 'INSUFFICIENT_BOUNDARY')),
    maturity_evaluated_at TEXT,
    supporting_source_refs_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_observed_at TEXT NOT NULL,
    expires_at TEXT,
    materialized_work_object_id TEXT,
    decision_package_id TEXT
  );
  CREATE INDEX IF NOT EXISTS formalization_candidates_status_idx ON formalization_candidates(status, created_at);
  CREATE TABLE IF NOT EXISTS candidate_supporting_sources (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    PRIMARY KEY (candidate_id, graph_id, block_uuid)
  );
  CREATE TABLE IF NOT EXISTS candidate_evidence (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    frozen_content TEXT NOT NULL,
    proof TEXT NOT NULL,
    frozen_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS candidate_evidence_candidate_idx ON candidate_evidence(candidate_id);
  CREATE TABLE IF NOT EXISTS candidate_sources (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    source_content TEXT NOT NULL DEFAULT '',
    observed_at TEXT NOT NULL,
    PRIMARY KEY (candidate_id, graph_id, block_uuid)
  );
  CREATE INDEX IF NOT EXISTS candidate_sources_ref_idx ON candidate_sources(graph_id, block_uuid);
  CREATE TABLE IF NOT EXISTS candidate_discovery_runs (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
    PRIMARY KEY (candidate_id, run_id)
  );
  CREATE TABLE IF NOT EXISTS candidate_evidence_refs (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL,
    PRIMARY KEY (candidate_id, evidence_id)
  );
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
    const existing = Number((this.#database.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version);
    if (existing > SUPPORTED_SCHEMA_VERSION) {
      this.#database.close();
      throw new Error(`SCHEMA_VERSION_TOO_NEW:${existing}:${SUPPORTED_SCHEMA_VERSION}`);
    }
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
    this.#migrateV14();
    this.#migrateV15();
    this.#migrateV17();
    this.#migrateV18();
    this.#migrateV19();
    this.#migrateV20();
    this.#migrateV21();
    this.#migrateV22();
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

  #migrateV14(): void {
    const column = (this.#database.prepare("PRAGMA table_info(decision_packages)").all() as Array<{ name: string; notnull: number }>).find((item) => item.name === "work_object_id");
    if (column?.notnull) {
      this.#database.exec(`
        CREATE TABLE decision_packages_v14 (
          id TEXT PRIMARY KEY,
          work_object_id TEXT REFERENCES work_objects(id) ON DELETE CASCADE,
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
        INSERT INTO decision_packages_v14(id, work_object_id, summary, rationale, status, target_versions_json, issue_refs_json, presentation_revision, presented_at, created_at, updated_at)
          SELECT id, work_object_id, summary, rationale, status, target_versions_json, issue_refs_json, presentation_revision, presented_at, created_at, updated_at FROM decision_packages;
        DROP TABLE decision_packages;
        ALTER TABLE decision_packages_v14 RENAME TO decision_packages;
      `);
    }
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS discovery_runs (
        id TEXT PRIMARY KEY,
        scope_json TEXT NOT NULL,
        executor_id TEXT NOT NULL,
        model_alias TEXT,
        status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
        source_count INTEGER NOT NULL,
        association_count INTEGER NOT NULL,
        no_candidate_count INTEGER NOT NULL,
        candidate_ids_json TEXT NOT NULL DEFAULT '[]',
        summary_text TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        token_usage_json TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS discovery_run_sources (
        run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
        graph_id TEXT NOT NULL,
        block_uuid TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('ASSOCIATED', 'ATTACHED', 'NO_CANDIDATE', 'CANDIDATE', 'UNRESOLVED')),
        candidate_id TEXT,
        target_work_object_id TEXT,
        reason TEXT,
        PRIMARY KEY (run_id, graph_id, block_uuid)
      );
      CREATE TABLE IF NOT EXISTS formalization_candidates (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'MATERIALIZED', 'DISMISSED', 'EXPIRED')),
        scope_json TEXT NOT NULL,
        recommended_kind TEXT NOT NULL,
        recommended_owner_id TEXT,
        proposed_title TEXT,
        proposed_work_intent_json TEXT,
        rationale_summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        expires_at TEXT,
        materialized_work_object_id TEXT,
        decision_package_id TEXT
      );
      CREATE INDEX IF NOT EXISTS formalization_candidates_status_idx ON formalization_candidates(status, created_at);
      CREATE TABLE IF NOT EXISTS candidate_sources (
        candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
        graph_id TEXT NOT NULL,
        block_uuid TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (candidate_id, graph_id, block_uuid)
      );
      CREATE INDEX IF NOT EXISTS candidate_sources_ref_idx ON candidate_sources(graph_id, block_uuid);
      CREATE TABLE IF NOT EXISTS candidate_discovery_runs (
        candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
        PRIMARY KEY (candidate_id, run_id)
      );
      CREATE TABLE IF NOT EXISTS candidate_evidence_refs (
        candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
        evidence_id TEXT NOT NULL,
        PRIMARY KEY (candidate_id, evidence_id)
      );
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (14, ?)").run(new Date().toISOString());
  }

  #migrateV15(): void {
    for (const [column, definition] of [
      ["scope_total", "INTEGER NOT NULL DEFAULT 0"], ["selected_count", "INTEGER NOT NULL DEFAULT 0"],
      ["newly_judged_count", "INTEGER NOT NULL DEFAULT 0"], ["already_covered_count", "INTEGER NOT NULL DEFAULT 0"],
      ["total_covered_count", "INTEGER NOT NULL DEFAULT 0"], ["remaining_count", "INTEGER NOT NULL DEFAULT 0"], ["continuation_token", "TEXT"],
    ] as const) if (!this.#hasColumn("discovery_runs", column)) this.#database.exec(`ALTER TABLE discovery_runs ADD COLUMN ${column} ${definition}`);
    for (const [column, definition] of [
      ["maturity", "TEXT NOT NULL DEFAULT 'UNEVALUATED'"], ["maturity_evaluated_at", "TEXT"], ["supporting_source_refs_json", "TEXT NOT NULL DEFAULT '[]'"], ["revision", "INTEGER NOT NULL DEFAULT 1"],
    ] as const) if (!this.#hasColumn("formalization_candidates", column)) this.#database.exec(`ALTER TABLE formalization_candidates ADD COLUMN ${column} ${definition}`);
    if (!this.#hasColumn("decision_packages", "candidate_revision")) this.#database.exec("ALTER TABLE decision_packages ADD COLUMN candidate_revision INTEGER");
    if (!this.#hasColumn("candidate_sources", "source_content")) this.#database.exec("ALTER TABLE candidate_sources ADD COLUMN source_content TEXT NOT NULL DEFAULT ''");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS discovery_run_sources_v15 (
        run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
        graph_id TEXT NOT NULL,
        block_uuid TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('ASSOCIATED', 'ATTACHED', 'NO_CANDIDATE', 'CANDIDATE', 'UNRESOLVED')),
        candidate_id TEXT,
        target_work_object_id TEXT,
        reason TEXT,
        PRIMARY KEY (run_id, graph_id, block_uuid)
      );
      INSERT OR IGNORE INTO discovery_run_sources_v15(run_id, graph_id, block_uuid, source_hash, outcome, candidate_id, target_work_object_id, reason)
        SELECT run_id, graph_id, block_uuid, source_hash, outcome, candidate_id, target_work_object_id, reason FROM discovery_run_sources;
      DROP TABLE discovery_run_sources;
      ALTER TABLE discovery_run_sources_v15 RENAME TO discovery_run_sources;
      CREATE TABLE IF NOT EXISTS candidate_supporting_sources (
        candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
        graph_id TEXT NOT NULL,
        block_uuid TEXT NOT NULL,
        PRIMARY KEY (candidate_id, graph_id, block_uuid)
      );
      CREATE TABLE IF NOT EXISTS candidate_evidence (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
        graph_id TEXT NOT NULL,
        block_uuid TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        frozen_content TEXT NOT NULL,
        proof TEXT NOT NULL,
        frozen_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS candidate_evidence_candidate_idx ON candidate_evidence(candidate_id);
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (16, ?)").run(new Date().toISOString());
  }

  #migrateV17(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS user_read_baselines (
        work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
        last_viewed_formal_version INTEGER NOT NULL,
        last_viewed_at TEXT NOT NULL,
        last_seen_commit_id TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (17, ?)").run(new Date().toISOString());
  }

  #migrateV18(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS project_intents (
        work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
        objective TEXT,
        key_results_json TEXT NOT NULL DEFAULT '[]',
        scope TEXT,
        current_phase TEXT,
        revision INTEGER NOT NULL CHECK (revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (18, ?)").run(new Date().toISOString());
  }

  #migrateV19(): void {
    if (!this.#hasColumn("reconcile_jobs", "semantic_revision")) this.#database.exec("ALTER TABLE reconcile_jobs ADD COLUMN semantic_revision TEXT NOT NULL DEFAULT ''");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS runtime_budgets (
        scope_key TEXT PRIMARY KEY,
        calls INTEGER NOT NULL,
        window_started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (19, ?)").run(new Date().toISOString());
  }

  #migrateV20(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS runtime_leases (
        scope_key TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        pid INTEGER NOT NULL,
        acquired_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        lease_token TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runtime_health (
        scope_key TEXT PRIMARY KEY,
        last_success_at TEXT,
        last_failure_at TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (20, ?)").run(new Date().toISOString());
  }

  #migrateV21(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS closure_assessments (
        work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        readiness TEXT NOT NULL CHECK (readiness IN ('READY','NOT_READY','UNKNOWN','CONFLICT')),
        semantic_revision TEXT NOT NULL,
        assessed_at TEXT NOT NULL,
        blockers_json TEXT NOT NULL DEFAULT '[]',
        checks_json TEXT NOT NULL DEFAULT '[]',
        contradiction_summary TEXT,
        evidence_ids_json TEXT NOT NULL DEFAULT '[]',
        provenance TEXT NOT NULL DEFAULT 'DETERMINISTIC',
        updated_at TEXT NOT NULL
      );
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (21, ?)").run(new Date().toISOString());
  }

  #migrateV22(): void {
    if (!this.#hasColumn("closure_assessments", "evidence_watermark")) this.#database.exec("ALTER TABLE closure_assessments ADD COLUMN evidence_watermark INTEGER NOT NULL DEFAULT 0");
    if (!this.#hasColumn("closure_assessments", "gate_json")) this.#database.exec("ALTER TABLE closure_assessments ADD COLUMN gate_json TEXT NOT NULL DEFAULT '{\"pass\":false,\"reasonCode\":\"UNASSESSED\",\"blockers\":[]}'");
    if (!this.#hasColumn("closure_assessments", "readiness_changed_at")) this.#database.exec("ALTER TABLE closure_assessments ADD COLUMN readiness_changed_at TEXT");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS closure_assessment_jobs (
        id TEXT PRIMARY KEY,
        work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        semantic_revision TEXT NOT NULL,
        evidence_watermark INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','DONE','FAILED','STALE')),
        attempt INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_outcome TEXT,
        not_before TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS closure_assessment_jobs_claim_idx ON closure_assessment_jobs(status, created_at, id);
    `);
    this.#database.prepare("INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (22, ?)").run(new Date().toISOString());
  }

  acquireRuntimeLease(scopeKey: string, instanceId: string, pid: number, leaseToken: string, heartbeatAt: string, ttlMs: number): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#database.prepare("SELECT * FROM runtime_leases WHERE scope_key=?").get(scopeKey) as { instance_id: string; pid: number; heartbeat_at: string } | undefined;
      if (row) {
        const fresh = Date.parse(heartbeatAt) - Date.parse(row.heartbeat_at) <= ttlMs;
        if (fresh && row.instance_id !== instanceId) throw new Error("KERNEL_INSTANCE_ALREADY_RUNNING");
        this.#database.prepare("UPDATE runtime_leases SET instance_id=?, pid=?, heartbeat_at=?, lease_token=? WHERE scope_key=?").run(instanceId, pid, heartbeatAt, leaseToken, scopeKey);
      } else {
        this.#database.prepare("INSERT INTO runtime_leases(scope_key,instance_id,pid,acquired_at,heartbeat_at,lease_token) VALUES (?,?,?,?,?,?)").run(scopeKey, instanceId, pid, heartbeatAt, heartbeatAt, leaseToken);
      }
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  releaseRuntimeLease(scopeKey: string, instanceId: string): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare("DELETE FROM runtime_leases WHERE scope_key=? AND instance_id=?").run(scopeKey, instanceId);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  recordMaintenanceSuccess(scopeKey: string, at: string): void {
    this.#database.prepare(`INSERT INTO runtime_health(scope_key,last_success_at,last_failure_at,consecutive_failures,updated_at)
      VALUES (?,?,NULL,0,?) ON CONFLICT(scope_key) DO UPDATE SET last_success_at=excluded.last_success_at, last_failure_at=NULL, consecutive_failures=0, updated_at=excluded.updated_at`).run(scopeKey, at, at);
  }

  recordMaintenanceFailure(scopeKey: string, at: string): void {
    this.#database.prepare(`INSERT INTO runtime_health(scope_key,last_success_at,last_failure_at,consecutive_failures,updated_at)
      VALUES (?,NULL,?,1,?) ON CONFLICT(scope_key) DO UPDATE SET last_failure_at=excluded.last_failure_at, consecutive_failures=consecutive_failures+1, updated_at=excluded.updated_at`).run(scopeKey, at, at);
  }

  getRuntimeHealth(scopeKey: string): { lastSuccessAt: string | null; lastFailureAt: string | null; consecutiveFailures: number } {
    const row = this.#database.prepare("SELECT * FROM runtime_health WHERE scope_key=?").get(scopeKey) as { last_success_at: string | null; last_failure_at: string | null; consecutive_failures: number } | undefined;
    return row ? { lastSuccessAt: row.last_success_at === null ? null : String(row.last_success_at), lastFailureAt: row.last_failure_at === null ? null : String(row.last_failure_at), consecutiveFailures: Number(row.consecutive_failures) } : { lastSuccessAt: null, lastFailureAt: null, consecutiveFailures: 0 };
  }

  putProjectIntent(intent: ProjectIntent): void {
    this.#database.prepare(`INSERT INTO project_intents(work_object_id, objective, key_results_json, scope, current_phase, revision, created_at, updated_at)
      VALUES (@workObjectId, @objective, @keyResults, @scope, @currentPhase, @revision, @createdAt, @updatedAt)
      ON CONFLICT(work_object_id) DO UPDATE SET objective=excluded.objective, key_results_json=excluded.key_results_json, scope=excluded.scope, current_phase=excluded.current_phase, revision=excluded.revision, updated_at=excluded.updated_at`)
      .run({ ...intent, keyResults: JSON.stringify(intent.keyResults) });
  }

  putClosureAssessment(assessment: ClosureAssessment): void {
    this.transaction(() => {
      const previous = this.getClosureAssessment(assessment.workObjectId);
      const readinessChangedAt = assessment.readiness === "READY"
        ? previous?.readiness === "READY" && previous.readinessChangedAt ? previous.readinessChangedAt : assessment.assessedAt
        : null;
      this.#database.prepare(`INSERT INTO closure_assessments(work_object_id,kind,readiness,semantic_revision,evidence_watermark,assessed_at,blockers_json,checks_json,contradiction_summary,evidence_ids_json,provenance,gate_json,readiness_changed_at,updated_at)
        VALUES (@workObjectId,@kind,@readiness,@semanticRevision,@evidenceWatermark,@assessedAt,@blockers,@checks,@contradictionSummary,@evidenceIds,@provenance,@gate,@readinessChangedAt,@assessedAt)
        ON CONFLICT(work_object_id) DO UPDATE SET kind=excluded.kind, readiness=excluded.readiness, semantic_revision=excluded.semantic_revision, evidence_watermark=excluded.evidence_watermark, assessed_at=excluded.assessed_at, blockers_json=excluded.blockers_json, checks_json=excluded.checks_json, contradiction_summary=excluded.contradiction_summary, evidence_ids_json=excluded.evidence_ids_json, provenance=excluded.provenance, gate_json=excluded.gate_json, readiness_changed_at=excluded.readiness_changed_at, updated_at=excluded.updated_at`)
        .run({ ...assessment, blockers: JSON.stringify(assessment.blockers), checks: JSON.stringify(assessment.checks), evidenceIds: JSON.stringify(assessment.evidenceIds), gate: JSON.stringify(assessment.gate), readinessChangedAt });
    });
  }

  getClosureAssessment(workObjectId: string): ClosureAssessment | null {
    const row = this.#database.prepare("SELECT * FROM closure_assessments WHERE work_object_id=?").get(workObjectId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const checks = decode(String(row.checks_json)) as Array<Record<string, unknown>>;
    return {
      workObjectId: String(row.work_object_id), kind: row.kind as ClosureAssessment["kind"], readiness: row.readiness as ClosureAssessment["readiness"],
      semanticRevision: String(row.semantic_revision), evidenceWatermark: Number(row.evidence_watermark ?? 0), assessedAt: String(row.assessed_at),
      blockers: decode(String(row.blockers_json)) as string[],
      checks: checks.map((item) => ({ text: String(item.text ?? ""), status: item.status as ClosureCheckAssessment["status"], evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.map(String) : [], rationale: String(item.rationale ?? "") })),
      contradictionSummary: row.contradiction_summary === null ? null : String(row.contradiction_summary),
      evidenceIds: decode(String(row.evidence_ids_json)) as string[], provenance: row.provenance as ClosureAssessment["provenance"],
      gate: decode(String(row.gate_json ?? "{\"pass\":false,\"reasonCode\":\"UNASSESSED\",\"blockers\":[]}")) as ClosureGateSnapshot,
      readinessChangedAt: row.readiness_changed_at === null || row.readiness_changed_at === undefined ? null : String(row.readiness_changed_at),
    };
  }

  enqueueClosureAssessmentJob(job: ClosureAssessmentJob): void {
    this.transaction(() => {
      this.#database.prepare("UPDATE closure_assessment_jobs SET status='STALE', last_outcome='SUPERSEDED', updated_at=? WHERE work_object_id=? AND status='QUEUED'").run(job.updatedAt, job.workObjectId);
      this.#database.prepare("DELETE FROM closure_assessment_jobs WHERE id=? AND status<>'RUNNING'").run(job.id);
      this.#database.prepare(`INSERT INTO closure_assessment_jobs(id,work_object_id,kind,semantic_revision,evidence_watermark,status,attempt,last_error,last_outcome,not_before,created_at,updated_at)
        VALUES (@id,@workObjectId,@kind,@semanticRevision,@evidenceWatermark,@status,@attempt,@lastError,@lastOutcome,@notBefore,@createdAt,@updatedAt)`).run(job);
    });
  }

  listClosureAssessmentJobs(status?: ClosureAssessmentJob["status"]): ClosureAssessmentJob[] {
    const rows = status
      ? (this.#database.prepare("SELECT * FROM closure_assessment_jobs WHERE status=? ORDER BY created_at, id").all(status) as Array<Record<string, unknown>>)
      : (this.#database.prepare("SELECT * FROM closure_assessment_jobs ORDER BY created_at, id").all() as Array<Record<string, unknown>>);
    return rows.map((row) => this.#mapClosureAssessmentJob(row));
  }

  claimNextClosureAssessmentJob(at: string): ClosureAssessmentJob | null {
    return this.transaction(() => {
      const row = this.#database.prepare(`SELECT * FROM closure_assessment_jobs WHERE status='QUEUED' AND (not_before IS NULL OR not_before<=?) ORDER BY created_at, id LIMIT 1`).get(at) as Record<string, unknown> | undefined;
      if (!row) return null;
      const job = this.#mapClosureAssessmentJob(row);
      this.#database.prepare("UPDATE closure_assessment_jobs SET status='RUNNING', attempt=attempt+1, updated_at=? WHERE id=?").run(at, job.id);
      return { ...job, status: "RUNNING" as const, attempt: job.attempt + 1, updatedAt: at };
    });
  }

  completeClosureAssessmentJob(id: string, at: string, outcome: string): void {
    const changed = this.#database.prepare("UPDATE closure_assessment_jobs SET status='DONE', last_error=NULL, last_outcome=?, updated_at=? WHERE id=? AND status='RUNNING'").run(outcome, at, id);
    if (!changed.changes) throw new Error("CLOSURE_ASSESSMENT_JOB_NOT_RUNNING");
  }

  completeClosureAssessmentJobAsSuperseded(id: string, at: string): ClosureAssessmentJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM closure_assessment_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("CLOSURE_ASSESSMENT_JOB_NOT_RUNNING");
      const job = this.#mapClosureAssessmentJob(row);
      this.#database.prepare("UPDATE closure_assessment_jobs SET status='STALE', last_outcome='SUPERSEDED', last_error='SUPERSEDED_BY_NEWER_JOB', updated_at=? WHERE id=?").run(at, id);
      return { ...job, status: "STALE" as const, lastOutcome: "SUPERSEDED", lastError: "SUPERSEDED_BY_NEWER_JOB", updatedAt: at };
    });
  }

  hasQueuedClosureAssessmentJobNewerThan(workObjectId: string, currentJobId: string, createdAt: string): boolean {
    const row = this.#database.prepare("SELECT 1 FROM closure_assessment_jobs WHERE work_object_id=? AND status='QUEUED' AND id<>? AND created_at>=? LIMIT 1").get(workObjectId, currentJobId, createdAt);
    return Boolean(row);
  }

  failClosureAssessmentJob(id: string, reason: string, nextNotBefore: string, at: string, maxAttempts: number): ClosureAssessmentJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM closure_assessment_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("CLOSURE_ASSESSMENT_JOB_NOT_RUNNING");
      const job = this.#mapClosureAssessmentJob(row);
      const status = job.attempt >= maxAttempts ? "FAILED" as const : "QUEUED" as const;
      this.#database.prepare("UPDATE closure_assessment_jobs SET status=?, last_error=?, not_before=?, updated_at=? WHERE id=?").run(status, reason, status === "QUEUED" ? nextNotBefore : null, at, id);
      return { ...job, status, lastError: reason, notBefore: status === "QUEUED" ? nextNotBefore : null, updatedAt: at };
    });
  }

  deferClosureAssessmentJob(id: string, reason: string, nextNotBefore: string, at: string): ClosureAssessmentJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM closure_assessment_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("CLOSURE_ASSESSMENT_JOB_NOT_RUNNING");
      const job = this.#mapClosureAssessmentJob(row);
      this.#database.prepare("UPDATE closure_assessment_jobs SET status='QUEUED', last_error=?, not_before=?, updated_at=? WHERE id=?").run(reason, nextNotBefore, at, id);
      return { ...job, status: "QUEUED" as const, lastError: reason, notBefore: nextNotBefore, updatedAt: at };
    });
  }

  getProjectIntent(workObjectId: string): ProjectIntent | null {
    const row = this.#database.prepare("SELECT * FROM project_intents WHERE work_object_id=?").get(workObjectId) as { work_object_id: string; objective: string | null; key_results_json: string; scope: string | null; current_phase: string | null; revision: number; created_at: string; updated_at: string } | undefined;
    return row ? { workObjectId: String(row.work_object_id), objective: row.objective === null ? null : String(row.objective), keyResults: decode(row.key_results_json) as ProjectIntent["keyResults"], scope: row.scope === null ? null : String(row.scope), currentPhase: row.current_phase === null ? null : String(row.current_phase), revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
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

  putUserReadBaseline(baseline: UserReadBaseline): void {
    this.#database.prepare(`INSERT INTO user_read_baselines(work_object_id, last_viewed_formal_version, last_viewed_at, last_seen_commit_id, updated_at)
      VALUES (@workObjectId, @lastViewedFormalVersion, @lastViewedAt, @lastSeenCommitId, @updatedAt)
      ON CONFLICT(work_object_id) DO UPDATE SET last_viewed_formal_version=excluded.last_viewed_formal_version, last_viewed_at=excluded.last_viewed_at, last_seen_commit_id=excluded.last_seen_commit_id, updated_at=excluded.updated_at`).run({ ...baseline, updatedAt: baseline.lastViewedAt });
  }

  getUserReadBaseline(workObjectId: string): UserReadBaseline | null {
    const row = this.#database.prepare("SELECT * FROM user_read_baselines WHERE work_object_id=?").get(workObjectId) as { work_object_id: string; last_viewed_formal_version: number; last_viewed_at: string; last_seen_commit_id: string | null; updated_at: string } | undefined;
    return row ? { workObjectId: String(row.work_object_id), lastViewedFormalVersion: Number(row.last_viewed_formal_version), lastViewedAt: String(row.last_viewed_at), lastSeenCommitId: row.last_seen_commit_id === null ? null : String(row.last_seen_commit_id) } : null;
  }

  listUserReadBaselines(): UserReadBaseline[] {
    return (this.#database.prepare("SELECT work_object_id FROM user_read_baselines ORDER BY last_viewed_at DESC, work_object_id").all() as Array<{ work_object_id: string }>).map(({ work_object_id }) => this.getUserReadBaseline(String(work_object_id))!);
  }

  putOwnership(ownership: PrimaryOwnership): void {
    this.#database.prepare("INSERT INTO ownerships(child_id, owner_id, created_at) VALUES (?,?,?)").run(ownership.childId, ownership.ownerId, ownership.createdAt);
  }

  replaceOwnership(ownership: PrimaryOwnership): void {
    this.#database.prepare(`INSERT INTO ownerships(child_id, owner_id, created_at) VALUES (?,?,?)
      ON CONFLICT(child_id) DO UPDATE SET owner_id=excluded.owner_id, created_at=excluded.created_at`).run(ownership.childId, ownership.ownerId, ownership.createdAt);
  }

  listOwnerships(): PrimaryOwnership[] {
    return (this.#database.prepare("SELECT child_id, owner_id, created_at FROM ownerships ORDER BY created_at, child_id").all() as Array<{ child_id: string; owner_id: string; created_at: string }>).map((row) => ({ childId: row.child_id, ownerId: row.owner_id, createdAt: row.created_at }));
  }

  getOwnershipByChild(childId: string): PrimaryOwnership | null {
    const row = this.#database.prepare("SELECT child_id, owner_id, created_at FROM ownerships WHERE child_id=?").get(childId) as { child_id: string; owner_id: string; created_at: string } | undefined;
    return row ? { childId: row.child_id, ownerId: row.owner_id, createdAt: row.created_at } : null;
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
    this.#database.prepare(`INSERT INTO reconcile_jobs(id,work_object_id,trigger_type,source_snapshot_id,source_block_uuid,formal_version,semantic_revision,priority_class,attempt,not_before,status,last_error,last_outcome,created_at,updated_at)
      VALUES (@id,@workObjectId,@triggerType,@sourceSnapshotId,@sourceBlockUuid,@formalVersion,@semanticRevision,@priorityClass,@attempt,@notBefore,@status,@lastError,@lastOutcome,@createdAt,@updatedAt)`).run({ ...job, lastOutcome: null, sourceBlockUuid: job.sourceBlockUuid ?? null });
  }

  invalidateActiveReconcileJobs(workObjectId: string, at: string): void {
    this.#database.prepare("UPDATE reconcile_jobs SET status='STALE', updated_at=? WHERE work_object_id=? AND status='QUEUED'").run(at, workObjectId);
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

  /**
   * Completes a reconcile job as skipped by rollout scope without marking the
   * source as reconciled. Coverage remains `has_uncovered_changes = true`, so
   * future scope expansion or an explicit reconcile can still process it.
   */
  completeReconcileJobSkipped(id: string, at: string, reason: string): ReconcileJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM reconcile_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("RECONCILE_JOB_NOT_RUNNING");
      const job = this.#mapReconcileJob(row);
      this.#database.prepare("UPDATE reconcile_jobs SET status='DONE', last_error=?, last_outcome=?, updated_at=? WHERE id=?").run(reason, reason, at, id);
      return { ...job, status: "DONE" as const, lastError: reason, lastOutcome: reason as ReconcileJob["lastOutcome"], updatedAt: at };
    });
  }

  completeReconcileJobAsSuperseded(id: string, at: string): ReconcileJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM reconcile_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("RECONCILE_JOB_NOT_RUNNING");
      const job = this.#mapReconcileJob(row);
      this.#database.prepare("UPDATE reconcile_jobs SET status='STALE', last_outcome='SUPERSEDED', last_error='SUPERSEDED_BY_NEWER_JOB', updated_at=? WHERE id=?").run(at, id);
      return { ...job, status: "STALE" as const, lastOutcome: "SUPERSEDED", lastError: "SUPERSEDED_BY_NEWER_JOB", updatedAt: at };
    });
  }

  hasQueuedReconcileJobNewerThan(workObjectId: string, currentJobId: string, createdAt: string): boolean {
    const row = this.#database.prepare("SELECT 1 FROM reconcile_jobs WHERE work_object_id=? AND status='QUEUED' AND id<>? AND created_at>=? LIMIT 1").get(workObjectId, currentJobId, createdAt);
    return Boolean(row);
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

  deferReconcileJob(id: string, reason: string, nextNotBefore: string, at: string): ReconcileJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM reconcile_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("RECONCILE_JOB_NOT_RUNNING");
      const job = this.#mapReconcileJob(row);
      this.#database.prepare("UPDATE reconcile_jobs SET status='QUEUED', last_error=?, not_before=?, updated_at=? WHERE id=?").run(reason, nextNotBefore, at, id);
      return { ...job, status: "QUEUED" as const, lastError: reason, notBefore: nextNotBefore, updatedAt: at };
    });
  }

  refreshReconcileJobSemanticRevision(id: string, formalVersion: number, semanticRevision: string, nextNotBefore: string, at: string): ReconcileJob {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM reconcile_jobs WHERE id=? AND status='RUNNING'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new Error("RECONCILE_JOB_NOT_RUNNING");
      const job = this.#mapReconcileJob(row);
      this.#database.prepare("UPDATE reconcile_jobs SET status='QUEUED', formal_version=?, semantic_revision=?, not_before=?, last_error='SEMANTIC_REVISION_CHANGED', updated_at=? WHERE id=?").run(formalVersion, semanticRevision, nextNotBefore, at, id);
      return { ...job, status: "QUEUED" as const, formalVersion, semanticRevision, notBefore: nextNotBefore, lastError: "SEMANTIC_REVISION_CHANGED", updatedAt: at };
    });
  }

  consumeRemoteCallBudget(scopeKey: string, maxCallsPerHour: number, now: string): boolean {
    return this.transaction(() => {
      const row = this.#database.prepare("SELECT * FROM runtime_budgets WHERE scope_key=?").get(scopeKey) as { calls: number; window_started_at: string } | undefined;
      const windowMs = 3_600_000;
      const fresh = row && Date.parse(now) - Date.parse(row.window_started_at) < windowMs;
      if (!fresh) {
        this.#database.prepare("INSERT INTO runtime_budgets(scope_key,calls,window_started_at,updated_at) VALUES (?,1,?,?) ON CONFLICT(scope_key) DO UPDATE SET calls=1, window_started_at=excluded.window_started_at, updated_at=excluded.updated_at").run(scopeKey, now, now);
        return true;
      }
      if (row!.calls >= maxCallsPerHour) return false;
      this.#database.prepare("UPDATE runtime_budgets SET calls=calls+1, updated_at=? WHERE scope_key=?").run(now, scopeKey);
      return true;
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

  findOpenGovernanceIssue(workObjectId: string, dimension: GovernanceDimension, type: GovernanceIssue["type"], sourceSnapshotId: string): GovernanceIssue | null {
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
      id: String(row.id), workObjectId: String(row.work_object_id), dimension: row.dimension as GovernanceDimension,
      type: row.type as GovernanceIssue["type"], status: row.status as GovernanceIssue["status"], summary: String(row.summary),
      evidenceIds: decode(String(row.evidence_ids_json)) as string[], sourceSnapshotId: String(row.source_snapshot_id),
      formalVersion: Number(row.formal_version), correlationId: row.correlation_id === null ? null : String(row.correlation_id),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at), resolvedAt: row.resolved_at === null ? null : String(row.resolved_at),
    };
  }

  putDecisionPackage(pkg: DecisionPackage): void {
    this.#database.prepare(`INSERT INTO decision_packages(id, work_object_id, summary, rationale, status, target_versions_json, issue_refs_json, presentation_revision, candidate_revision, presented_at, created_at, updated_at)
      VALUES (@id, @workObjectId, @summary, @rationale, @status, @targetVersions, @issueRefs, @presentationRevision, @candidateRevision, @presentedAt, @createdAt, @updatedAt)`)
      .run({ ...pkg, targetVersions: encode(pkg.targetVersions), issueRefs: encode(pkg.issueRefs) });
  }

  getDecisionPackage(id: string): DecisionPackage | null {
    const row = this.#database.prepare("SELECT * FROM decision_packages WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: String(row.id), workObjectId: row.work_object_id === null ? null : String(row.work_object_id), summary: String(row.summary), rationale: String(row.rationale), status: row.status as DecisionPackage["status"], targetVersions: decode(String(row.target_versions_json)) as Record<string, number>, issueRefs: decode(String(row.issue_refs_json)) as string[], presentationRevision: String(row.presentation_revision), candidateRevision: row.candidate_revision === null ? null : Number(row.candidate_revision), presentedAt: row.presented_at === null ? null : String(row.presented_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
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

  updateUserDecisionWorkObjects(id: string, workObjectIds: readonly string[]): void {
    const changed = this.#database.prepare("UPDATE user_decisions SET work_object_ids_json=? WHERE id=?").run(encode(workObjectIds), id);
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

  putDiscoveryRun(run: DiscoveryRun): void {
    this.#database.prepare(`INSERT INTO discovery_runs(id, scope_json, executor_id, model_alias, status, source_count, scope_total, selected_count, newly_judged_count, already_covered_count, total_covered_count, remaining_count, continuation_token, association_count, no_candidate_count, candidate_ids_json, summary_text, latency_ms, token_usage_json, error, started_at, completed_at)
      VALUES (@id, @scopeJson, @executorId, @modelAlias, @status, @sourceCount, @scopeTotal, @selectedCount, @newlyJudgedCount, @alreadyCoveredCount, @totalCoveredCount, @remainingCount, @continuationToken, @associationCount, @noCandidateCount, @candidateIds, @summaryText, @latencyMs, @tokenUsage, @error, @startedAt, @completedAt)
      ON CONFLICT(id) DO UPDATE SET scope_json=excluded.scope_json, executor_id=excluded.executor_id, model_alias=excluded.model_alias, status=excluded.status,
      source_count=excluded.source_count, scope_total=excluded.scope_total, selected_count=excluded.selected_count, newly_judged_count=excluded.newly_judged_count,
      already_covered_count=excluded.already_covered_count, total_covered_count=excluded.total_covered_count, remaining_count=excluded.remaining_count, continuation_token=excluded.continuation_token,
      association_count=excluded.association_count, no_candidate_count=excluded.no_candidate_count, candidate_ids_json=excluded.candidate_ids_json,
      summary_text=excluded.summary_text, latency_ms=excluded.latency_ms, token_usage_json=excluded.token_usage_json, error=excluded.error, started_at=excluded.started_at, completed_at=excluded.completed_at`)
      .run({ ...run, scopeJson: encode(run.scope), candidateIds: encode(run.candidateIds), tokenUsage: run.tokenUsage === null ? null : encode(run.tokenUsage) });
  }

  getDiscoveryRun(id: string): DiscoveryRun | null {
    const row = this.#database.prepare("SELECT * FROM discovery_runs WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id), scope: decode(String(row.scope_json)) as DiscoveryRun["scope"], executorId: String(row.executor_id), modelAlias: row.model_alias === null ? null : String(row.model_alias),
      status: row.status as DiscoveryRun["status"], sourceCount: Number(row.source_count), scopeTotal: Number(row.scope_total),
      selectedCount: Number(row.selected_count), newlyJudgedCount: Number(row.newly_judged_count),
      alreadyCoveredCount: Number(row.already_covered_count), totalCoveredCount: Number(row.total_covered_count),
      remainingCount: Number(row.remaining_count), continuationToken: row.continuation_token === null ? null : String(row.continuation_token),
      associationCount: Number(row.association_count), noCandidateCount: Number(row.no_candidate_count),
      candidateIds: decode(String(row.candidate_ids_json)) as string[], summaryText: String(row.summary_text), latencyMs: Number(row.latency_ms),
      tokenUsage: row.token_usage_json === null ? null : decode(String(row.token_usage_json)) as DiscoveryRun["tokenUsage"], error: row.error === null ? null : String(row.error),
      startedAt: String(row.started_at), completedAt: row.completed_at === null ? null : String(row.completed_at),
    };
  }

  listDiscoveryRuns(): DiscoveryRun[] {
    return (this.#database.prepare("SELECT id FROM discovery_runs ORDER BY started_at, id").all() as Array<{ id: string }>).map((row) => this.getDiscoveryRun(row.id)!).filter(Boolean);
  }

  putDiscoveryRunSource(outcome: DiscoveryRunSourceOutcome): void {
    this.#database.prepare(`INSERT INTO discovery_run_sources(run_id, graph_id, block_uuid, source_hash, outcome, candidate_id, target_work_object_id, reason)
      VALUES (@runId, @graphId, @blockUuid, @sourceHash, @outcome, @candidateId, @targetWorkObjectId, @reason)`)
      .run({ ...outcome, graphId: outcome.sourceRef.graphId, blockUuid: outcome.sourceRef.blockUuid });
  }

  listDiscoveryRunSources(runId: string): DiscoveryRunSourceOutcome[] {
    const rows = this.#database.prepare("SELECT * FROM discovery_run_sources WHERE run_id=? ORDER BY graph_id, block_uuid").all(runId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      runId: String(row.run_id), sourceRef: { graphId: String(row.graph_id), blockUuid: String(row.block_uuid) }, sourceHash: String(row.source_hash),
      outcome: row.outcome as DiscoveryRunSourceOutcome["outcome"], candidateId: row.candidate_id === null ? null : String(row.candidate_id),
      targetWorkObjectId: row.target_work_object_id === null ? null : String(row.target_work_object_id), reason: row.reason === null ? null : String(row.reason),
    }));
  }

  putFormalizationCandidate(candidate: FormalizationCandidate): void {
    this.transaction(() => {
      this.#database.prepare(`INSERT INTO formalization_candidates(id, status, revision, scope_json, recommended_kind, recommended_owner_id, proposed_title, proposed_work_intent_json, rationale_summary, maturity, maturity_evaluated_at, supporting_source_refs_json, created_at, updated_at, last_observed_at, expires_at, materialized_work_object_id, decision_package_id)
        VALUES (@id, @status, @revision, @scopeJson, @recommendedKind, @recommendedOwnerId, @proposedTitle, @proposedWorkIntent, @rationaleSummary, @maturity, @maturityEvaluatedAt, @supportingSourceRefs, @createdAt, @updatedAt, @lastObservedAt, @expiresAt, @materializedWorkObjectId, @decisionPackageId)`)
        .run({ ...candidate, scopeJson: encode(candidate.scope), proposedWorkIntent: candidate.proposedWorkIntent === null ? null : encode(candidate.proposedWorkIntent), supportingSourceRefs: encode(candidate.supportingSourceRefs) });
      for (const source of candidate.sourceRefs) {
        const index = candidate.sourceRefs.indexOf(source);
        this.#database.prepare("INSERT INTO candidate_sources(candidate_id, graph_id, block_uuid, source_hash, source_content, observed_at) VALUES (?,?,?,?,?,?)").run(candidate.id, source.graphId, source.blockUuid, candidate.sourceHashes[index] ?? "", candidate.sourceContents[index] ?? "", candidate.lastObservedAt);
      }
      for (const source of candidate.supportingSourceRefs) this.#database.prepare("INSERT OR IGNORE INTO candidate_supporting_sources(candidate_id, graph_id, block_uuid) VALUES (?,?,?)").run(candidate.id, source.graphId, source.blockUuid);
      for (const runId of candidate.discoveryRunIds) this.#database.prepare("INSERT OR IGNORE INTO candidate_discovery_runs(candidate_id, run_id) VALUES (?,?)").run(candidate.id, runId);
    });
  }

  updateFormalizationCandidate(id: string, patch: Partial<Pick<FormalizationCandidate, "status" | "revision" | "recommendedKind" | "recommendedOwnerId" | "proposedTitle" | "proposedWorkIntent" | "rationaleSummary" | "maturity" | "maturityEvaluatedAt" | "supportingSourceRefs" | "updatedAt" | "lastObservedAt" | "expiresAt" | "materializedWorkObjectId" | "decisionPackageId">>): void {
    const fields: string[] = []; const values: unknown[] = [];
    const set = (column: string, value: unknown) => { fields.push(`${column}=?`); values.push(value); };
    if (patch.status !== undefined) set("status", patch.status);
    if (patch.revision !== undefined) set("revision", patch.revision);
    if (patch.recommendedKind !== undefined) set("recommended_kind", patch.recommendedKind);
    if (patch.recommendedOwnerId !== undefined) set("recommended_owner_id", patch.recommendedOwnerId);
    if (patch.proposedTitle !== undefined) set("proposed_title", patch.proposedTitle);
    if (patch.proposedWorkIntent !== undefined) set("proposed_work_intent_json", patch.proposedWorkIntent === null ? null : encode(patch.proposedWorkIntent));
    if (patch.rationaleSummary !== undefined) set("rationale_summary", patch.rationaleSummary);
    if (patch.maturity !== undefined) set("maturity", patch.maturity);
    if (patch.maturityEvaluatedAt !== undefined) set("maturity_evaluated_at", patch.maturityEvaluatedAt);
    if (patch.supportingSourceRefs !== undefined) set("supporting_source_refs_json", encode(patch.supportingSourceRefs));
    if (patch.updatedAt !== undefined) set("updated_at", patch.updatedAt);
    if (patch.lastObservedAt !== undefined) set("last_observed_at", patch.lastObservedAt);
    if (patch.expiresAt !== undefined) set("expires_at", patch.expiresAt);
    if (patch.materializedWorkObjectId !== undefined) set("materialized_work_object_id", patch.materializedWorkObjectId);
    if (patch.decisionPackageId !== undefined) set("decision_package_id", patch.decisionPackageId);
    if (!fields.length) return;
    values.push(id);
    const changed = this.#database.prepare(`UPDATE formalization_candidates SET ${fields.join(", ")} WHERE id=?`).run(...values);
    if (!changed.changes) throw new Error("FORMALIZATION_CANDIDATE_NOT_FOUND");
  }

  getFormalizationCandidate(id: string): FormalizationCandidate | null {
    const row = this.#database.prepare("SELECT * FROM formalization_candidates WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const sources = this.#database.prepare("SELECT * FROM candidate_sources WHERE candidate_id=? ORDER BY graph_id, block_uuid").all(id) as Array<Record<string, unknown>>;
    const runIds = (this.#database.prepare("SELECT run_id FROM candidate_discovery_runs WHERE candidate_id=? ORDER BY run_id").all(id) as Array<{ run_id: string }>).map((item) => item.run_id);
    const supportingSources = this.#database.prepare("SELECT graph_id, block_uuid FROM candidate_supporting_sources WHERE candidate_id=? ORDER BY graph_id, block_uuid").all(id) as Array<{ graph_id: string; block_uuid: string }>;
    const legacyEvidenceRefs = (this.#database.prepare("SELECT evidence_id FROM candidate_evidence_refs WHERE candidate_id=? ORDER BY evidence_id").all(id) as Array<{ evidence_id: string }>).map((item) => item.evidence_id);
    const evidenceRefs = [...new Set([...legacyEvidenceRefs, ...(this.#database.prepare("SELECT id FROM candidate_evidence WHERE candidate_id=? ORDER BY id").all(id) as Array<{ id: string }>).map((item) => item.id)])];
    return {
      id: String(row.id), status: row.status as FormalizationCandidate["status"], revision: Number(row.revision), scope: decode(String(row.scope_json)) as FormalizationCandidate["scope"],
      sourceRefs: sources.map((item) => ({ graphId: String(item.graph_id), blockUuid: String(item.block_uuid) })),
      sourceHashes: sources.map((item) => String(item.source_hash)),
      sourceContents: sources.map((item) => String(item.source_content ?? "")),
      recommendedKind: row.recommended_kind as FormalizationCandidate["recommendedKind"], recommendedOwnerId: row.recommended_owner_id === null ? null : String(row.recommended_owner_id),
      proposedTitle: row.proposed_title === null ? null : String(row.proposed_title),
      proposedWorkIntent: row.proposed_work_intent_json === null ? null : decode(String(row.proposed_work_intent_json)) as FormalizationCandidate["proposedWorkIntent"],
      rationaleSummary: String(row.rationale_summary), maturity: row.maturity as FormalizationCandidate["maturity"],
      maturityEvaluatedAt: row.maturity_evaluated_at === null ? null : String(row.maturity_evaluated_at),
      supportingSourceRefs: supportingSources.map((item) => ({ graphId: item.graph_id, blockUuid: item.block_uuid })),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      lastObservedAt: String(row.last_observed_at), expiresAt: row.expires_at === null ? null : String(row.expires_at),
      discoveryRunIds: runIds, evidenceRefs,
      materializedWorkObjectId: row.materialized_work_object_id === null ? null : String(row.materialized_work_object_id),
      decisionPackageId: row.decision_package_id === null ? null : String(row.decision_package_id),
    };
  }

  listFormalizationCandidates(status?: FormalizationCandidate["status"]): FormalizationCandidate[] {
    const rows = status ? this.#database.prepare("SELECT id FROM formalization_candidates WHERE status=? ORDER BY created_at, id").all(status) as Array<{ id: string }> : this.#database.prepare("SELECT id FROM formalization_candidates ORDER BY created_at, id").all() as Array<{ id: string }>;
    return rows.map((row) => this.getFormalizationCandidate(row.id)!).filter(Boolean);
  }

  findOpenCandidateContainingSources(sourceRefs: readonly { graphId: string; blockUuid: string }[]): FormalizationCandidate | null {
    if (!sourceRefs.length) return null;
    const keys = sourceRefs.map((ref) => `${ref.graphId}|${ref.blockUuid}`);
    const rows = this.#database.prepare("SELECT id FROM formalization_candidates WHERE status='OPEN' ORDER BY created_at, id").all() as Array<{ id: string }>;
    for (const row of rows) {
      const candidate = this.getFormalizationCandidate(row.id)!;
      const candidateKeys = candidate.sourceRefs.map((ref) => `${ref.graphId}|${ref.blockUuid}`);
      if (keys.every((key) => candidateKeys.includes(key))) return candidate;
    }
    return null;
  }

  addCandidateSources(candidateId: string, sourceRefs: readonly { graphId: string; blockUuid: string }[], sourceHashes: readonly string[], sourceContents: readonly string[], observedAt: string): void {
    for (let index = 0; index < sourceRefs.length; index += 1) {
      const ref = sourceRefs[index]!;
      this.#database.prepare("INSERT OR IGNORE INTO candidate_sources(candidate_id, graph_id, block_uuid, source_hash, source_content, observed_at) VALUES (?,?,?,?,?,?)").run(candidateId, ref.graphId, ref.blockUuid, sourceHashes[index] ?? "", sourceContents?.[index] ?? "", observedAt);
    }
  }

  addCandidateDiscoveryRun(candidateId: string, runId: string): void {
    this.#database.prepare("INSERT OR IGNORE INTO candidate_discovery_runs(candidate_id, run_id) VALUES (?,?)").run(candidateId, runId);
  }

  addCandidateEvidenceRef(candidateId: string, evidenceId: string): void {
    this.#database.prepare("INSERT OR IGNORE INTO candidate_evidence_refs(candidate_id, evidence_id) VALUES (?,?)").run(candidateId, evidenceId);
  }

  putCandidateSupportingSources(candidateId: string, sourceRefs: readonly { graphId: string; blockUuid: string }[]): void {
    for (const ref of sourceRefs) this.#database.prepare("INSERT OR IGNORE INTO candidate_supporting_sources(candidate_id, graph_id, block_uuid) VALUES (?,?,?)").run(candidateId, ref.graphId, ref.blockUuid);
  }

  putCandidateEvidence(evidence: FormalizationEvidence): void {
    this.#database.prepare("INSERT INTO candidate_evidence(id, candidate_id, graph_id, block_uuid, source_hash, frozen_content, proof, frozen_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(evidence.id, evidence.candidateId, evidence.sourceRef.graphId, evidence.sourceRef.blockUuid, evidence.sourceHash, evidence.frozenContent, evidence.proof, evidence.frozenAt);
  }

  listCandidateEvidence(candidateId: string): FormalizationEvidence[] {
    const rows = this.#database.prepare("SELECT * FROM candidate_evidence WHERE candidate_id=? ORDER BY frozen_at, id").all(candidateId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), candidateId: String(row.candidate_id), sourceRef: { graphId: String(row.graph_id), blockUuid: String(row.block_uuid) },
      sourceHash: String(row.source_hash), frozenContent: String(row.frozen_content), proof: String(row.proof), frozenAt: String(row.frozen_at),
    }));
  }

  latestDiscoverySourceOutcome(graphId: string, blockUuid: string): DiscoveryRunSourceOutcome | null {
    const row = this.#database.prepare("SELECT * FROM discovery_run_sources WHERE graph_id=? AND block_uuid=? ORDER BY rowid DESC LIMIT 1").get(graphId, blockUuid) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      runId: String(row.run_id), sourceRef: { graphId: String(row.graph_id), blockUuid: String(row.block_uuid) }, sourceHash: String(row.source_hash),
      outcome: row.outcome as DiscoveryRunSourceOutcome["outcome"], candidateId: row.candidate_id === null ? null : String(row.candidate_id),
      targetWorkObjectId: row.target_work_object_id === null ? null : String(row.target_work_object_id), reason: row.reason === null ? null : String(row.reason),
    };
  }

  isMaterializedCandidateSource(graphId: string, blockUuid: string): boolean {
    const row = this.#database.prepare(`SELECT 1 FROM candidate_sources cs JOIN formalization_candidates fc ON fc.id=cs.candidate_id WHERE cs.graph_id=? AND cs.block_uuid=? AND fc.status='MATERIALIZED' LIMIT 1`).get(graphId, blockUuid);
    return Boolean(row);
  }

  transitionFormalizationCandidate(id: string, status: FormalizationCandidate["status"], at: string): void {
    const changed = this.#database.prepare("UPDATE formalization_candidates SET status=?, updated_at=? WHERE id=?").run(status, at, id);
    if (!changed.changes) throw new Error("FORMALIZATION_CANDIDATE_NOT_FOUND");
  }

  getFormalizationCandidateByPackage(packageId: string): FormalizationCandidate | null {
    const row = this.#database.prepare("SELECT id FROM formalization_candidates WHERE decision_package_id=?").get(packageId) as { id: string } | undefined;
    return row ? this.getFormalizationCandidate(row.id) : null;
  }

  #mapClosureAssessmentJob(row: Record<string, unknown>): ClosureAssessmentJob {
    return {
      id: String(row.id), workObjectId: String(row.work_object_id), kind: row.kind as ClosureAssessmentJob["kind"],
      semanticRevision: String(row.semantic_revision), evidenceWatermark: Number(row.evidence_watermark ?? 0),
      status: row.status as ClosureAssessmentJob["status"], attempt: Number(row.attempt ?? 0),
      lastError: row.last_error === null ? null : String(row.last_error), lastOutcome: row.last_outcome === null ? null : String(row.last_outcome),
      notBefore: row.not_before === null ? null : String(row.not_before), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  #mapReconcileJob(row: Record<string, unknown>): ReconcileJob {
    return {
      id: String(row.id), workObjectId: String(row.work_object_id), triggerType: row.trigger_type as ReconcileTriggerType,
      sourceSnapshotId: String(row.source_snapshot_id), sourceBlockUuid: row.source_block_uuid === null ? null : String(row.source_block_uuid), formalVersion: Number(row.formal_version),
      semanticRevision: typeof row.semantic_revision === "string" ? row.semantic_revision : "",
      priorityClass: row.priority_class as ReconcilePriorityClass, attempt: Number(row.attempt),
      notBefore: row.not_before === null ? null : String(row.not_before), status: row.status as ReconcileJob["status"],
      lastError: row.last_error === null ? null : String(row.last_error),
      lastOutcome: row.last_outcome === null ? null : String(row.last_outcome) as ReconcileJob["lastOutcome"],
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  deleteCommit(id: string): never { throw new Error(`LEDGER_APPEND_ONLY:${id}`); }
}
