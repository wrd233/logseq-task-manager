-- Frozen schema from ffce330, generated from its migrated SQLite database.
CREATE TABLE schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
CREATE TABLE work_objects (
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
CREATE TABLE anchors (
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
CREATE TABLE evidence_references (
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
CREATE TABLE ownerships (
    child_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES work_objects(id),
    created_at TEXT NOT NULL,
    CHECK (child_id <> owner_id)
  );
CREATE TABLE commits (
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
CREATE INDEX commits_status_idx ON commits(status, created_at);
CREATE TABLE projection_obligations (
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
CREATE INDEX projection_obligations_status_idx ON projection_obligations(status, created_at);
CREATE TABLE source_coverage (
    work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
    last_observed_source_snapshot_id TEXT NOT NULL,
    last_reconciled_source_snapshot_id TEXT,
    formal_version_at_last_reconcile INTEGER,
    has_uncovered_changes INTEGER NOT NULL DEFAULT 1 CHECK (has_uncovered_changes IN (0, 1)),
    updated_at TEXT NOT NULL
  );
CREATE TABLE reconcile_jobs (
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
  , semantic_revision TEXT NOT NULL DEFAULT '');
CREATE INDEX reconcile_jobs_status_idx ON reconcile_jobs(status, not_before, created_at);
CREATE TABLE maintenance_pause (
    scope_key TEXT PRIMARY KEY,
    paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
    updated_at TEXT NOT NULL
  );
CREATE TABLE context_associations (
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
CREATE UNIQUE INDEX context_associations_active_idx ON context_associations(work_object_id, graph_id, block_uuid) WHERE status='ACTIVE';
CREATE INDEX context_associations_source_idx ON context_associations(graph_id, block_uuid);
CREATE TABLE association_corrections (
    id TEXT PRIMARY KEY,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    scope_snapshot TEXT NOT NULL,
    rejected_work_object_id TEXT NOT NULL REFERENCES work_objects(id) ON DELETE CASCADE,
    affirmed_work_object_id TEXT REFERENCES work_objects(id),
    user_decision_ref TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE INDEX association_corrections_source_idx ON association_corrections(graph_id, block_uuid);
CREATE TABLE governance_issues (
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
CREATE INDEX governance_issues_open_idx ON governance_issues(work_object_id, dimension, status);
CREATE UNIQUE INDEX governance_issues_open_dedupe_idx ON governance_issues(work_object_id, dimension, type, source_snapshot_id) WHERE status='OPEN';
CREATE TABLE decision_packages (
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
CREATE TABLE decision_candidates (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL REFERENCES decision_packages(id) ON DELETE CASCADE,
    operation_type TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    evidence_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED', 'DEFERRED')),
    created_at TEXT NOT NULL
  );
CREATE INDEX decision_candidates_package_idx ON decision_candidates(package_id, status);
CREATE TABLE user_decisions (
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
CREATE INDEX user_decisions_package_idx ON user_decisions(package_id, status);
CREATE TABLE trusted_user_events (
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
CREATE INDEX trusted_user_events_package_idx ON trusted_user_events(package_id, status);
CREATE TABLE discovery_runs (
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
CREATE TABLE formalization_candidates (
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
CREATE INDEX formalization_candidates_status_idx ON formalization_candidates(status, created_at);
CREATE TABLE candidate_supporting_sources (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    PRIMARY KEY (candidate_id, graph_id, block_uuid)
  );
CREATE TABLE candidate_evidence (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    frozen_content TEXT NOT NULL,
    proof TEXT NOT NULL,
    frozen_at TEXT NOT NULL
  );
CREATE INDEX candidate_evidence_candidate_idx ON candidate_evidence(candidate_id);
CREATE TABLE candidate_sources (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    graph_id TEXT NOT NULL,
    block_uuid TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    source_content TEXT NOT NULL DEFAULT '',
    observed_at TEXT NOT NULL,
    PRIMARY KEY (candidate_id, graph_id, block_uuid)
  );
CREATE INDEX candidate_sources_ref_idx ON candidate_sources(graph_id, block_uuid);
CREATE TABLE candidate_discovery_runs (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
    PRIMARY KEY (candidate_id, run_id)
  );
CREATE TABLE candidate_evidence_refs (
    candidate_id TEXT NOT NULL REFERENCES formalization_candidates(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL,
    PRIMARY KEY (candidate_id, evidence_id)
  );
CREATE TABLE skill_versions (
    id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, package_json TEXT NOT NULL,
    registered_at TEXT NOT NULL, PRIMARY KEY(id, version)
  );
CREATE TABLE agent_run_receipts (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, work_object_id TEXT NOT NULL REFERENCES work_objects(id),
    evidence_ids_json TEXT NOT NULL, skill_json TEXT NOT NULL, outcome TEXT NOT NULL, reason_code TEXT NOT NULL,
    rationale_summary TEXT NOT NULL, proposal_id TEXT, details_json TEXT, created_at TEXT NOT NULL
  );
CREATE TABLE graph_read_receipts (
    id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id), kind TEXT NOT NULL,
    locator TEXT NOT NULL, content_hash TEXT NOT NULL, read_at TEXT NOT NULL
  );
CREATE TABLE proposals (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), status TEXT NOT NULL,
    latest_revision INTEGER NOT NULL, applied_commit_id TEXT, invalidation_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
CREATE TABLE proposal_revisions (
    proposal_id TEXT NOT NULL REFERENCES proposals(id), revision INTEGER NOT NULL, revision_json TEXT NOT NULL,
    PRIMARY KEY(proposal_id, revision)
  );
CREATE TABLE feedback_events (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, proposal_id TEXT NOT NULL REFERENCES proposals(id),
    agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id), commit_id TEXT, details_json TEXT, created_at TEXT NOT NULL
  );
CREATE TABLE curation_receipts (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), agent_run_id TEXT NOT NULL REFERENCES agent_run_receipts(id),
    details_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
CREATE TABLE completion_records (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), record_json TEXT NOT NULL,
    commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
CREATE TABLE cancellation_records (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), record_json TEXT NOT NULL,
    commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
CREATE TABLE closure_amendments (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), target_closure_record_id TEXT NOT NULL,
    record_json TEXT NOT NULL, commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
CREATE TABLE reopen_records (
    id TEXT PRIMARY KEY, work_object_id TEXT NOT NULL REFERENCES work_objects(id), previous_closure_record_id TEXT NOT NULL,
    record_json TEXT NOT NULL, commit_id TEXT NOT NULL UNIQUE REFERENCES commits(id), created_at TEXT NOT NULL
  );
CREATE TABLE "discovery_run_sources" (
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
CREATE TABLE user_read_baselines (
        work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
        last_viewed_formal_version INTEGER NOT NULL,
        last_viewed_at TEXT NOT NULL,
        last_seen_commit_id TEXT,
        updated_at TEXT NOT NULL
      );
CREATE TABLE project_intents (
        work_object_id TEXT PRIMARY KEY REFERENCES work_objects(id) ON DELETE CASCADE,
        objective TEXT,
        key_results_json TEXT NOT NULL DEFAULT '[]',
        scope TEXT,
        current_phase TEXT,
        revision INTEGER NOT NULL CHECK (revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
CREATE TABLE runtime_budgets (
        scope_key TEXT PRIMARY KEY,
        calls INTEGER NOT NULL,
        window_started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
CREATE TABLE runtime_leases (
        scope_key TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        pid INTEGER NOT NULL,
        acquired_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        lease_token TEXT NOT NULL
      );
CREATE TABLE runtime_health (
        scope_key TEXT PRIMARY KEY,
        last_success_at TEXT,
        last_failure_at TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
CREATE TABLE closure_assessments (
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
      , evidence_watermark INTEGER NOT NULL DEFAULT 0, gate_json TEXT NOT NULL DEFAULT '{"pass":false,"reasonCode":"UNASSESSED","blockers":[]}', readiness_changed_at TEXT);
CREATE TABLE closure_assessment_jobs (
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
CREATE INDEX closure_assessment_jobs_claim_idx ON closure_assessment_jobs(status, created_at, id);
INSERT INTO schema_versions VALUES (22, '2026-10-01T00:00:00.000Z');
