import Database from "better-sqlite3";

import { deterministicUuid, type Actor, type AgentRunReceipt, type ClosureHistory, type CommitStatus, type FeedbackEvent, type FrozenEvidence, type OperationType, type Proposal, type ProposalRevision, type SkillIdentity, type StoredCommit } from "@task-copilot/contracts";
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
  CREATE TABLE IF NOT EXISTS skill_versions (
    id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, package_json TEXT NOT NULL,
    registered_at TEXT NOT NULL, PRIMARY KEY(id, version)
  );
  CREATE TABLE IF NOT EXISTS agent_run_receipts (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, work_object_id TEXT NOT NULL REFERENCES work_objects(id),
    evidence_ids_json TEXT NOT NULL, skill_json TEXT NOT NULL, outcome TEXT NOT NULL, reason_code TEXT NOT NULL,
    rationale_summary TEXT NOT NULL, proposal_id TEXT, details_json TEXT, created_at TEXT NOT NULL
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

  close(): void { this.#database.close(); }
  schemaVersion(): number { return Number((this.#database.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version); }

  transaction<T>(work: () => T): T { return this.#database.transaction(work)(); }

  putWorkObject(object: WorkObject): void {
    this.#database.prepare(`INSERT INTO work_objects(id, kind, title, lifecycle, engagement, current_focus, waiting_condition_json, version, created_at, updated_at)
      VALUES (@id, @kind, @title, @lifecycle, @engagement, @currentFocus, @waitingConditionJson, @version, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, lifecycle=excluded.lifecycle,
      engagement=excluded.engagement, current_focus=excluded.current_focus, waiting_condition_json=excluded.waiting_condition_json, version=excluded.version, updated_at=excluded.updated_at`).run({ ...object, waitingConditionJson: encode(object.waitingCondition) });
  }

  getWorkObject(id: string): WorkObject | null {
    const row = this.#database.prepare("SELECT * FROM work_objects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), kind: row.kind as WorkObject["kind"], title: String(row.title), lifecycle: row.lifecycle as WorkObject["lifecycle"], engagement: row.engagement as WorkObject["engagement"], waitingCondition: decode(row.waiting_condition_json === null ? null : String(row.waiting_condition_json)) as WorkObject["waitingCondition"], currentFocus: row.current_focus === null ? null : String(row.current_focus), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
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
      projection_container_uuid, projection_title_uuid, projection_state_uuid, projection_focus_uuid, projection_waiting_uuid, created_at, updated_at)
      VALUES (@id, @workObjectId, @graphId, @externalId, @sourceContentHash, @projectionContainerUuid,
      @projectionTitleUuid, @projectionStateUuid, @projectionFocusUuid, @projectionWaitingUuid, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET source_content_hash=excluded.source_content_hash, updated_at=excluded.updated_at`).run(anchor);
  }

  getAnchorForWorkObject(workObjectId: string): PrimaryAnchor | null {
    const row = this.#database.prepare("SELECT * FROM anchors WHERE work_object_id = ?").get(workObjectId) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), workObjectId: String(row.work_object_id), graphId: String(row.graph_id), externalId: String(row.external_id), sourceContentHash: String(row.source_content_hash), projectionContainerUuid: String(row.projection_container_uuid), projectionTitleUuid: String(row.projection_title_uuid), projectionStateUuid: String(row.projection_state_uuid), projectionFocusUuid: String(row.projection_focus_uuid), projectionWaitingUuid: String(row.projection_waiting_uuid), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
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
        details: encode(run), createdAt: run.finishedAt,
      });
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
      id: String(row.id), purpose: "CURRENT_FOCUS_MAINTENANCE", executor: { type: "FAKE", id: String(row.agent_id) }, operationContractVersion: 1,
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

  deleteCommit(id: string): never { throw new Error(`LEDGER_APPEND_ONLY:${id}`); }
}
