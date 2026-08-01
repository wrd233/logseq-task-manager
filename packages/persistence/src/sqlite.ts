import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, copyFile, link, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import type {
  V2AnchorCommand,
  V2AnchorCommandResult,
  V2AnchorObservationCommand,
  V2AnchorRebindCommand,
  V2AnchorRebindCommandResult,
  V2AssociationCommand,
  V2AssociationCommandResult,
  V2AuditRecord,
  V2CommandReceipt,
  V2MaterializationCommand,
  V2MaterializationUndoCommand,
  V2MaterializationUndoResult,
  V2LegacyMigrationEvidence,
  V2MigrationBatch,
  V2MigrationBatchCommand,
  V2MigrationPreviewCommand,
  V2MigrationRun,
  V2ProjectCreationCommand,
  V2ObjectCommand,
  V2ObjectCommandResult,
  V2OwnershipCommand,
  V2OwnershipChangeCommand,
  V2OwnershipCommandResult,
  V2OwnershipChangeCommandResult,
  V2OwnershipUndoCommand,
  V2OwnershipUndoResult,
  V2SynchronizationCommand,
} from "@task-copilot/application";
import { renderV2ProposalFiles, validateAgentDecision, validateAgentDecisionEvent, validateAgentReviewSignal, validateAgentRuleAuthorization, validateV2Proposal, type AgentDecision, type AgentDecisionEvent, type AgentReviewSignal, type AgentReviewSignalStatus, type AgentRuleAuthorization, type FocusSelection, type V2Anchor, type V2Association, type V2Candidate, type V2Condition, type V2ManagedObject, type V2PrimaryOwnership, type V2Proposal, type V2ProposalFiles } from "@task-copilot/domain";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

export const V2_DATABASE_SCHEMA_VERSION = 13;

export interface SqliteInitializationResult {
  initialized: boolean;
  schemaVersion: number;
}

export interface SqliteSchemaMigrationResult {
  migrated: boolean;
  fromVersion: number;
  schemaVersion: number;
  backupPath?: string;
}

export interface SchemaMigrationRecord {
  version: number;
  name: string;
  appliedAt: string;
}

const schemaMigrationNames = new Map<number, string>([
  [1, "initial_core_schema"],
  [2, "add_schema_migration_ledger"],
  [3, "add_semantic_commit_step_ledger"],
  [4, "add_proposal_review_tables"],
  [5, "decouple_audit_from_current_objects"],
  [6, "add_task_due_at"],
  [7, "add_v1_migration_ledger"],
  [8, "add_project_closure_summary"],
  [9, "add_plain_associations"],
  [10, "add_candidate_review_state"],
  [11, "allow_project_closure_retention_and_mini_project_closure"],
  [12, "add_project_structure_aggregate"],
  [13, "add_agent_decision_governance"],
]);

const agentGovernanceSchemaSql = `
  CREATE TABLE agent_decisions (
    thread_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    graph_id TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('BLOCK','PAGE')),
    source_external_id TEXT NOT NULL,
    source_snapshot_hash TEXT NOT NULL CHECK (length(source_snapshot_hash) IN (8,64)),
    decision_json TEXT NOT NULL CHECK (json_valid(decision_json)),
    observed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(graph_id, source_kind, source_external_id)
  ) STRICT;
  CREATE INDEX agent_decisions_updated ON agent_decisions(updated_at DESC, thread_id);
  CREATE TABLE agent_decision_events (
    event_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES agent_decisions(thread_id) ON DELETE CASCADE,
    decision_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('SOURCE_OBSERVED','DECISION_REVISED','ROUTE_CHANGED','EXECUTION_SCHEDULED','APPLIED','BLOCKED','FAILED','UNDONE','USER_FEEDBACK_ADDED')),
    actor TEXT NOT NULL CHECK (actor IN ('SYSTEM','AGENT','USER')),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    occurred_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX agent_decision_events_thread_time ON agent_decision_events(thread_id, occurred_at DESC);
  CREATE TABLE agent_review_signals (
    review_signal_id TEXT PRIMARY KEY,
    graph_id TEXT NOT NULL,
    source_external_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','SOURCE_MISSING')),
    retention_class TEXT NOT NULL CHECK (retention_class IN ('NORMAL','RELATED','PINNED')),
    active_until TEXT,
    occurrence_count INTEGER NOT NULL CHECK (occurrence_count >= 1),
    signal_json TEXT NOT NULL CHECK (json_valid(signal_json)),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE(graph_id, source_external_id)
  ) STRICT;
  CREATE INDEX agent_review_signals_active ON agent_review_signals(status, active_until, last_seen_at DESC);
  CREATE TABLE agent_rule_authorizations (
    rule_id TEXT PRIMARY KEY,
    skill_name TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    skill_hash TEXT NOT NULL CHECK (length(skill_hash) = 64),
    skill_max_authority TEXT NOT NULL CHECK (skill_max_authority IN ('SHADOW','BATCH_REVIEW','DELAYED_APPLY','AUTO_APPLY')),
    local_current_authority TEXT NOT NULL CHECK (local_current_authority IN ('SHADOW','BATCH_REVIEW','DELAYED_APPLY','AUTO_APPLY')),
    effective_authority TEXT NOT NULL CHECK (effective_authority IN ('SHADOW','BATCH_REVIEW','DELAYED_APPLY','AUTO_APPLY')),
    change_level TEXT NOT NULL CHECK (change_level IN ('PATCH','NARROWING','EXPANDING')),
    paused INTEGER NOT NULL CHECK (paused IN (0,1)),
    authorization_json TEXT NOT NULL CHECK (json_valid(authorization_json)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
`;

export interface V2StoredProposal {
  proposal: V2Proposal;
  files: V2ProposalFiles;
  updatedAt: string;
}

export interface SqliteDoctorReport {
  status: "PASS" | "FAIL";
  schemaVersion: number;
  integrity: string;
  foreignKeyViolations: number;
  objectCount: number;
}

export interface SqliteOperationalDiagnostics {
  missingAnchorCount: number;
  conflictAnchorCount: number;
  multiplePrimaryAnchorObjectCount: number;
  staleProposalCount: number;
  pendingCommitCount: number;
  recoveryRequiredCommitCount: number;
  invalidIdentityCount: number;
}

export interface SqliteOpenOptions {
  busyTimeoutMs?: number;
}

export interface SqliteRestoreResult {
  restoredFrom: string;
  recoveryPath: string;
  validation: SqliteDoctorReport;
}

export interface SqliteRestoreOptions {
  /** Called only after the pre-Restore recovery point passes validation and before the active database is displaced. */
  afterRecoveryPoint?: () => void | Promise<void>;
  /** Test-only fault boundary; production callers must omit it. */
  afterActivate?: () => void;
  /** Test-only fault boundary; production callers must omit it. */
  beforeRollback?: () => void;
}

export type V2SemanticCommitStatus = "PENDING" | "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED" | "UNDONE";
export type V2CommitStepStatus = "PREPARED" | "APPLIED" | "VERIFIED" | "COMPENSATED" | "RECOVERY_REQUIRED";
export type V2CommitStepKind = "GRAPH_WRITE" | "DOMAIN_WRITE" | "AUDIT_WRITE";

export interface V2SemanticCommitLedgerRecord {
  semanticCommitId: string;
  proposalId?: string;
  status: V2SemanticCommitStatus;
  beforeStateChecksum: string;
  afterStateChecksum?: string;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
}

export interface V2SemanticCommitStepRecord {
  semanticCommitId: string;
  stepIndex: number;
  stepKind: V2CommitStepKind;
  status: V2CommitStepStatus;
  operationId?: string;
  beforeHash?: string;
  afterHash?: string;
  errorCode?: string;
  updatedAt: string;
}

export interface V2ConditionChangeReceipt {
  idempotencyKey: string;
  object: V2ManagedObject;
  beforeCondition: V2Condition;
  createdAt: string;
}

interface ObjectRow {
  object_id: string;
  object_type: V2ManagedObject["objectType"];
  version: number;
  lifecycle: V2ManagedObject["lifecycle"];
  condition_json: string;
  due_at: string | null;
  closure_json: string | null;
  project_structure_json: string | null;
  text: string;
  created_at: string;
  updated_at: string;
  source_event: string;
}

interface CandidateRow {
  candidate_id: string;
  source_anchor_id: string;
  source_version: string;
  candidate_kind: V2Candidate["candidateKind"];
  reason: string;
  suggestion: string;
  disposition: V2Candidate["disposition"];
  disposition_reason: string | null;
  deferred_until: string | null;
  active_proposal_id: string | null;
  last_analyzed_at: string;
  created_at: string;
  updated_at: string;
}

function persistenceError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-190", "D-192"], ...(details ? { details } : {}) });
}

function readMigrationHistory(database: Database.Database): SchemaMigrationRecord[] {
  try {
    return (database
      .prepare("SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version")
      .all() as SchemaMigrationRecord[]);
  } catch (error) {
    throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema migration ledger 缺失或无法读取。", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function requireCompleteMigrationHistory(database: Database.Database): SchemaMigrationRecord[] {
  const history = readMigrationHistory(database);
  if (
    history.length !== V2_DATABASE_SCHEMA_VERSION ||
    history.some((record, index) => record.version !== index + 1 || record.name !== schemaMigrationNames.get(record.version))
  ) {
    throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema migration ledger 与当前 schema 版本不一致。", {
      versions: history.map((record) => record.version),
    });
  }
  return history;
}

export class V2SqliteStore {
  private constructor(
    private readonly database: Database.Database,
    readonly path: string,
  ) {}

  static async open(path: string, options: SqliteOpenOptions = {}): Promise<V2SqliteStore> {
    const absolute = resolve(path);
    const busyTimeoutMs = options.busyTimeoutMs ?? 3000;
    if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
      throw persistenceError("V2_BUSY_TIMEOUT_INVALID", "SQLite busy timeout 必须是 0 到 60000 毫秒的整数。");
    }
    await mkdir(dirname(absolute), { recursive: true });
    let database: Database.Database | undefined;
    try {
      database = new Database(absolute);
      database.pragma("foreign_keys = ON");
      database.pragma("journal_mode = WAL");
      database.pragma(`busy_timeout = ${busyTimeoutMs}`);
    } catch (error) {
      database?.close();
      throw persistenceError("V2_DATABASE_OPEN_FAILED", "SQLite 数据库无法打开；原文件未被覆盖。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    return new V2SqliteStore(database, absolute);
  }

  initialize(graphId: string, at = new Date()): SqliteInitializationResult {
    if (!graphId.trim()) throw persistenceError("V2_GRAPH_ID_REQUIRED", "初始化 SQLite 前必须确认 Graph identity。");
    const userVersion = this.database.pragma("user_version", { simple: true }) as number;
    if (userVersion > V2_DATABASE_SCHEMA_VERSION) {
      throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "SQLite schema 高于当前程序支持版本；已进入只读保护。", {
        schemaVersion: userVersion,
      });
    }
    const hasMeta = this.database
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'")
      .get() as { present: number } | undefined;
    if (hasMeta) {
      const storedGraph = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'graph_id'").get() as
        | { value: string }
        | undefined;
      const storedSchema = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined;
      if (!storedGraph || !storedSchema) throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema metadata 不完整。");
      const storedSchemaVersion = Number(storedSchema.value);
      if (!Number.isSafeInteger(storedSchemaVersion) || storedSchemaVersion < 1 || userVersion !== storedSchemaVersion) {
        throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite user_version 与 schema metadata 不一致。", {
          userVersion,
          storedSchemaVersion: storedSchema.value,
        });
      }
      if (storedGraph.value !== graphId) {
        throw persistenceError("V2_GRAPH_ID_MISMATCH", "SQLite 数据库属于另一个 Graph，拒绝复用。", {
          expectedGraphId: graphId,
          actualGraphId: storedGraph.value,
        });
      }
      if (storedSchemaVersion > V2_DATABASE_SCHEMA_VERSION) {
        throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "SQLite schema 版本高于当前程序支持范围。", {
          schemaVersion: storedSchemaVersion,
        });
      }
      if (storedSchemaVersion < V2_DATABASE_SCHEMA_VERSION) {
        throw persistenceError("V2_SCHEMA_MIGRATION_REQUIRED", "SQLite schema 需要显式创建恢复点后再升级。", {
          fromVersion: storedSchemaVersion,
          toVersion: V2_DATABASE_SCHEMA_VERSION,
        });
      }
      requireCompleteMigrationHistory(this.database);
      return { initialized: false, schemaVersion: V2_DATABASE_SCHEMA_VERSION };
    }
    if (userVersion !== 0) {
      throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite user_version 存在但 schema metadata 缺失。");
    }

    const createSchema = this.database.transaction(() => {
      this.database.exec(`
        CREATE TABLE schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) STRICT;
        CREATE TABLE objects (
          object_id TEXT PRIMARY KEY,
          object_type TEXT NOT NULL CHECK (object_type IN ('AREA','PROJECT','MINI_PROJECT','TASK','DECISION','OUTPUT')),
          version INTEGER NOT NULL CHECK (version >= 1),
          lifecycle TEXT NOT NULL CHECK (lifecycle IN ('OPEN','COMPLETED','CANCELLED','ARCHIVED')),
          condition_json TEXT NOT NULL CHECK (json_valid(condition_json)),
          due_at TEXT,
          closure_json TEXT CHECK (closure_json IS NULL OR (object_type IN ('PROJECT','MINI_PROJECT') AND lifecycle IN ('COMPLETED','ARCHIVED') AND json_valid(closure_json))),
          project_structure_json TEXT CHECK ((object_type = 'PROJECT' AND project_structure_json IS NOT NULL AND json_valid(project_structure_json)) OR (object_type <> 'PROJECT' AND project_structure_json IS NULL)),
          text TEXT NOT NULL CHECK (length(trim(text)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          source_event TEXT NOT NULL
        ) STRICT;
        CREATE TABLE anchors (
          anchor_id TEXT PRIMARY KEY,
          object_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('primary_text','source','context','event','output')),
          graph_id TEXT NOT NULL,
          external_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active','missing','replaced','conflict')),
          content_hash TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          UNIQUE(graph_id, external_id, role)
        ) STRICT;
        CREATE UNIQUE INDEX one_active_primary_anchor_per_object
          ON anchors(object_id) WHERE role = 'primary_text' AND status = 'active';
        CREATE TABLE primary_ownerships (
          child_object_id TEXT PRIMARY KEY REFERENCES objects(object_id),
          owner_object_id TEXT NOT NULL REFERENCES objects(object_id),
          assigned_at TEXT NOT NULL,
          CHECK (child_object_id <> owner_object_id)
        ) STRICT;
        CREATE TABLE associations (
          association_id TEXT PRIMARY KEY,
          source_object_id TEXT NOT NULL REFERENCES objects(object_id),
          target_object_id TEXT NOT NULL REFERENCES objects(object_id),
          association_kind TEXT NOT NULL CHECK (association_kind = 'RELATED'),
          status TEXT NOT NULL CHECK (status = 'ACTIVE'),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_object_id, target_object_id, association_kind),
          CHECK (source_object_id <> target_object_id)
        ) STRICT;
        CREATE TABLE focus_selections (
          object_id TEXT PRIMARY KEY REFERENCES objects(object_id),
          selected_at TEXT NOT NULL,
          rank INTEGER NOT NULL CHECK (rank >= 0),
          expires_at TEXT
        ) STRICT;
        CREATE TABLE command_receipts (
          idempotency_key TEXT PRIMARY KEY,
          command_name TEXT NOT NULL,
          result_json TEXT NOT NULL CHECK (json_valid(result_json)),
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE audit_events (
          event_id INTEGER PRIMARY KEY AUTOINCREMENT,
          trace_id TEXT NOT NULL,
          actor TEXT NOT NULL,
          command_name TEXT NOT NULL,
          object_id TEXT NOT NULL,
          before_version INTEGER NOT NULL,
          after_version INTEGER NOT NULL,
          occurred_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE semantic_commits (
          semantic_commit_id TEXT PRIMARY KEY,
          proposal_id TEXT,
          status TEXT NOT NULL CHECK (status IN ('PENDING','COMPLETED','FAILED','RECOVERY_REQUIRED','UNDONE')),
          before_state_checksum TEXT NOT NULL,
          after_state_checksum TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          error_code TEXT
        ) STRICT;
        CREATE TABLE semantic_commit_steps (
          semantic_commit_id TEXT NOT NULL REFERENCES semantic_commits(semantic_commit_id),
          step_index INTEGER NOT NULL CHECK (step_index >= 0),
          step_kind TEXT NOT NULL CHECK (step_kind IN ('GRAPH_WRITE','DOMAIN_WRITE','AUDIT_WRITE')),
          status TEXT NOT NULL CHECK (status IN ('PREPARED','APPLIED','VERIFIED','COMPENSATED','RECOVERY_REQUIRED')),
          operation_id TEXT,
          before_hash TEXT,
          after_hash TEXT,
          error_code TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (semantic_commit_id, step_index)
        ) STRICT;
        CREATE TABLE proposals (
          proposal_id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('DRAFT','READY','IN_REVIEW','PARTIALLY_ACCEPTED','ACCEPTED','REJECTED','STALE','APPLIED','FAILED','SUPERSEDED')),
          proposal_json TEXT NOT NULL CHECK (json_valid(proposal_json)),
          proposal_md TEXT NOT NULL CHECK (length(trim(proposal_md)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE proposal_groups (
          proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
          group_id TEXT NOT NULL,
          disposition TEXT NOT NULL CHECK (disposition IN ('PENDING','ACCEPTED','REJECTED','DEFERRED')),
          group_json TEXT NOT NULL CHECK (json_valid(group_json)),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (proposal_id, group_id)
        ) STRICT;
        CREATE TABLE candidates (
          candidate_id TEXT PRIMARY KEY,
          source_anchor_id TEXT NOT NULL,
          source_version TEXT NOT NULL,
          candidate_kind TEXT NOT NULL CHECK (candidate_kind IN ('WORK_ITEM','UPDATE','DECISION','OUTPUT','OWNERSHIP','CONFLICT')),
          reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
          suggestion TEXT NOT NULL CHECK (length(trim(suggestion)) > 0),
          disposition TEXT NOT NULL CHECK (disposition IN ('PENDING','LATER','DISMISSED','NO_MORE_LIKE_THIS','RESOLVED')),
          disposition_reason TEXT,
          deferred_until TEXT,
          active_proposal_id TEXT REFERENCES proposals(proposal_id) ON DELETE SET NULL,
          last_analyzed_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_anchor_id, source_version, candidate_kind),
          CHECK (disposition <> 'LATER' OR (deferred_until IS NOT NULL AND length(trim(disposition_reason)) > 0)),
          CHECK (disposition NOT IN ('DISMISSED','NO_MORE_LIKE_THIS') OR length(trim(disposition_reason)) > 0),
          CHECK (disposition <> 'RESOLVED' OR active_proposal_id IS NOT NULL)
        ) STRICT;
        CREATE INDEX candidate_source_kind_current ON candidates(source_anchor_id, candidate_kind, updated_at DESC);
        CREATE TABLE migration_runs (
          run_id TEXT PRIMARY KEY,
          source_bundle_sha256 TEXT NOT NULL UNIQUE CHECK (length(source_bundle_sha256) = 64),
          source_created_at TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('SCANNED','PREVIEWED','IMPORTING','VERIFIED','ACTIVATED','FAILED','CANCELLED')),
          summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
          snapshot_backup_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE migration_batches (
          batch_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
          idempotency_key TEXT NOT NULL UNIQUE,
          source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
          status TEXT NOT NULL CHECK (status IN ('PREPARED','IMPORTED','VERIFIED','UNDONE','FAILED')),
          scope_json TEXT NOT NULL CHECK (json_valid(scope_json)),
          imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0 AND imported_count <= 50),
          validation_json TEXT CHECK (validation_json IS NULL OR json_valid(validation_json)),
          inverse_json TEXT CHECK (inverse_json IS NULL OR json_valid(inverse_json)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE legacy_evidence (
          run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
          legacy_object_id TEXT NOT NULL,
          source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
          mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json)),
          target_object_id TEXT REFERENCES objects(object_id) ON DELETE SET NULL,
          PRIMARY KEY (run_id, legacy_object_id)
        ) STRICT;
        ${agentGovernanceSchemaSql}
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY CHECK (version >= 1),
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL
        ) STRICT;
      `);
      const insertMeta = this.database.prepare("INSERT INTO schema_meta(key, value) VALUES (?, ?)");
      insertMeta.run("schema_version", String(V2_DATABASE_SCHEMA_VERSION));
      insertMeta.run("graph_id", graphId);
      insertMeta.run("created_at", at.toISOString());
      const insertMigration = this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)");
      for (let version = 1; version <= V2_DATABASE_SCHEMA_VERSION; version += 1) {
        insertMigration.run(version, schemaMigrationNames.get(version), at.toISOString());
      }
      this.database.pragma(`user_version = ${V2_DATABASE_SCHEMA_VERSION}`);
    });
    createSchema();
    return { initialized: true, schemaVersion: V2_DATABASE_SCHEMA_VERSION };
  }

  async migrateSchema(graphId: string, backupDestination: string, at = new Date()): Promise<SqliteSchemaMigrationResult> {
    if (!graphId.trim()) throw persistenceError("V2_GRAPH_ID_REQUIRED", "迁移 SQLite schema 前必须确认 Graph identity。");
    const userVersion = this.database.pragma("user_version", { simple: true }) as number;
    const storedGraph = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'graph_id'").pluck().get() as string | undefined;
    const storedSchemaText = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").pluck().get() as string | undefined;
    const storedSchemaVersion = Number(storedSchemaText);
    if (!storedGraph || !storedSchemaText || !Number.isSafeInteger(storedSchemaVersion) || storedSchemaVersion < 1 || userVersion !== storedSchemaVersion) {
      throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite user_version 与 schema metadata 不一致。", {
        userVersion,
        storedSchemaVersion: storedSchemaText,
      });
    }
    if (storedGraph !== graphId) {
      throw persistenceError("V2_GRAPH_ID_MISMATCH", "SQLite 数据库属于另一个 Graph，拒绝迁移。", {
        expectedGraphId: graphId,
        actualGraphId: storedGraph,
      });
    }
    if (storedSchemaVersion === V2_DATABASE_SCHEMA_VERSION) {
      requireCompleteMigrationHistory(this.database);
      return { migrated: false, fromVersion: storedSchemaVersion, schemaVersion: V2_DATABASE_SCHEMA_VERSION };
    }
    if (storedSchemaVersion > V2_DATABASE_SCHEMA_VERSION) {
      throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "SQLite schema 版本高于当前程序支持范围。", {
        schemaVersion: storedSchemaVersion,
      });
    }
    const backupPath = await this.backup(backupDestination);
    V2SqliteStore.validateSchemaUpgradeBackup(backupPath, graphId, storedSchemaVersion);
    this.applySchemaMigration(storedSchemaVersion, at);
    return {
      migrated: true,
      fromVersion: storedSchemaVersion,
      schemaVersion: V2_DATABASE_SCHEMA_VERSION,
      backupPath,
    };
  }

  private applySchemaMigration(fromVersion: number, at: Date): void {
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(fromVersion) || V2_DATABASE_SCHEMA_VERSION !== 13) {
      throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "SQLite schema 没有可用的受控迁移路径。", { fromVersion });
    }
    const createdAt = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'created_at'").pluck().get() as string | undefined;
    if (!createdAt) throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema metadata 缺少 created_at。");
    const migration = this.database.transaction(() => {
      let workingVersion = fromVersion;
      if (workingVersion === 1) {
        this.database.exec(`
          CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY CHECK (version >= 1),
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL
          ) STRICT;
        `);
        const insertLegacy = this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)");
        insertLegacy.run(1, schemaMigrationNames.get(1), createdAt);
        insertLegacy.run(2, schemaMigrationNames.get(2), at.toISOString());
        workingVersion = 2;
      } else {
        const history = readMigrationHistory(this.database);
        if (history.length !== workingVersion || history.some((record, index) => record.version !== index + 1 || record.name !== schemaMigrationNames.get(record.version))) {
          throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema migration ledger 与来源版本不一致。");
        }
      }
      if (workingVersion === 2) {
        this.database.exec(`CREATE TABLE semantic_commits (
          semantic_commit_id TEXT PRIMARY KEY,
          proposal_id TEXT,
          status TEXT NOT NULL CHECK (status IN ('PENDING','COMPLETED','FAILED','RECOVERY_REQUIRED','UNDONE')),
          before_state_checksum TEXT NOT NULL,
          after_state_checksum TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          error_code TEXT
        ) STRICT;
        CREATE TABLE semantic_commit_steps (
          semantic_commit_id TEXT NOT NULL REFERENCES semantic_commits(semantic_commit_id),
          step_index INTEGER NOT NULL CHECK (step_index >= 0),
          step_kind TEXT NOT NULL CHECK (step_kind IN ('GRAPH_WRITE','DOMAIN_WRITE','AUDIT_WRITE')),
          status TEXT NOT NULL CHECK (status IN ('PREPARED','APPLIED','VERIFIED','COMPENSATED','RECOVERY_REQUIRED')),
          operation_id TEXT,
          before_hash TEXT,
          after_hash TEXT,
          error_code TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (semantic_commit_id, step_index)
        ) STRICT;`);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(3, schemaMigrationNames.get(3), at.toISOString());
        workingVersion = 3;
      }
      if (workingVersion === 3) {
        this.database.exec(`
          CREATE TABLE proposals (
            proposal_id TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK (status IN ('DRAFT','READY','IN_REVIEW','PARTIALLY_ACCEPTED','ACCEPTED','REJECTED','STALE','APPLIED','FAILED','SUPERSEDED')),
            proposal_json TEXT NOT NULL CHECK (json_valid(proposal_json)),
            proposal_md TEXT NOT NULL CHECK (length(trim(proposal_md)) > 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE proposal_groups (
            proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
            group_id TEXT NOT NULL,
            disposition TEXT NOT NULL CHECK (disposition IN ('PENDING','ACCEPTED','REJECTED','DEFERRED')),
            group_json TEXT NOT NULL CHECK (json_valid(group_json)),
            updated_at TEXT NOT NULL,
            PRIMARY KEY (proposal_id, group_id)
          ) STRICT;
        `);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(4, schemaMigrationNames.get(4), at.toISOString());
        workingVersion = 4;
      }
      if (workingVersion === 4) {
        this.database.exec(`
          ALTER TABLE audit_events RENAME TO audit_events_object_bound;
          CREATE TABLE audit_events (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            trace_id TEXT NOT NULL,
            actor TEXT NOT NULL,
            command_name TEXT NOT NULL,
            object_id TEXT NOT NULL,
            before_version INTEGER NOT NULL,
            after_version INTEGER NOT NULL,
            occurred_at TEXT NOT NULL
          ) STRICT;
          INSERT INTO audit_events(event_id, trace_id, actor, command_name, object_id, before_version, after_version, occurred_at)
            SELECT event_id, trace_id, actor, command_name, object_id, before_version, after_version, occurred_at FROM audit_events_object_bound;
          DROP TABLE audit_events_object_bound;
        `);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(5, schemaMigrationNames.get(5), at.toISOString());
        workingVersion = 5;
      }
      if (workingVersion === 5) {
        this.database.exec("ALTER TABLE objects ADD COLUMN due_at TEXT;");
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(6, schemaMigrationNames.get(6), at.toISOString());
        workingVersion = 6;
      }
      if (workingVersion === 6) {
        this.database.exec(`
          CREATE TABLE migration_runs (
            run_id TEXT PRIMARY KEY,
            source_bundle_sha256 TEXT NOT NULL UNIQUE CHECK (length(source_bundle_sha256) = 64),
            source_created_at TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('SCANNED','PREVIEWED','IMPORTING','VERIFIED','ACTIVATED','FAILED','CANCELLED')),
            summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
            snapshot_backup_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE migration_batches (
            batch_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
            idempotency_key TEXT NOT NULL UNIQUE,
            source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
            status TEXT NOT NULL CHECK (status IN ('PREPARED','IMPORTED','VERIFIED','UNDONE','FAILED')),
            scope_json TEXT NOT NULL CHECK (json_valid(scope_json)),
            imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0 AND imported_count <= 50),
            validation_json TEXT CHECK (validation_json IS NULL OR json_valid(validation_json)),
            inverse_json TEXT CHECK (inverse_json IS NULL OR json_valid(inverse_json)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE legacy_evidence (
            run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
            legacy_object_id TEXT NOT NULL,
            source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
            mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json)),
            target_object_id TEXT REFERENCES objects(object_id) ON DELETE SET NULL,
            PRIMARY KEY (run_id, legacy_object_id)
          ) STRICT;
        `);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(7, schemaMigrationNames.get(7), at.toISOString());
        workingVersion = 7;
      }
      if (workingVersion === 7) {
        this.database.exec("ALTER TABLE objects ADD COLUMN closure_json TEXT CHECK (closure_json IS NULL OR (object_type = 'PROJECT' AND lifecycle = 'COMPLETED' AND json_valid(closure_json)));");
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(8, schemaMigrationNames.get(8), at.toISOString());
        workingVersion = 8;
      }
      if (workingVersion === 8) {
        this.database.exec(`CREATE TABLE associations (
          association_id TEXT PRIMARY KEY,
          source_object_id TEXT NOT NULL REFERENCES objects(object_id),
          target_object_id TEXT NOT NULL REFERENCES objects(object_id),
          association_kind TEXT NOT NULL CHECK (association_kind = 'RELATED'),
          status TEXT NOT NULL CHECK (status = 'ACTIVE'),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_object_id, target_object_id, association_kind),
          CHECK (source_object_id <> target_object_id)
        ) STRICT;`);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(9, schemaMigrationNames.get(9), at.toISOString());
        workingVersion = 9;
      }
      if (workingVersion === 9) {
        this.database.exec(`CREATE TABLE candidates (
          candidate_id TEXT PRIMARY KEY,
          source_anchor_id TEXT NOT NULL,
          source_version TEXT NOT NULL,
          candidate_kind TEXT NOT NULL CHECK (candidate_kind IN ('WORK_ITEM','UPDATE','DECISION','OUTPUT','OWNERSHIP','CONFLICT')),
          reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
          suggestion TEXT NOT NULL CHECK (length(trim(suggestion)) > 0),
          disposition TEXT NOT NULL CHECK (disposition IN ('PENDING','LATER','DISMISSED','NO_MORE_LIKE_THIS','RESOLVED')),
          disposition_reason TEXT,
          deferred_until TEXT,
          active_proposal_id TEXT REFERENCES proposals(proposal_id) ON DELETE SET NULL,
          last_analyzed_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_anchor_id, source_version, candidate_kind),
          CHECK (disposition <> 'LATER' OR (deferred_until IS NOT NULL AND length(trim(disposition_reason)) > 0)),
          CHECK (disposition NOT IN ('DISMISSED','NO_MORE_LIKE_THIS') OR length(trim(disposition_reason)) > 0),
          CHECK (disposition <> 'RESOLVED' OR active_proposal_id IS NOT NULL)
        ) STRICT;
        CREATE INDEX candidate_source_kind_current ON candidates(source_anchor_id, candidate_kind, updated_at DESC);`);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(10, schemaMigrationNames.get(10), at.toISOString());
        workingVersion = 10;
      }
      if (workingVersion === 10) {
        this.database.exec(`
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
        `);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(11, schemaMigrationNames.get(11), at.toISOString());
        workingVersion = 11;
      }
      if (workingVersion === 11) {
        this.database.exec(`
          CREATE TABLE objects_v12 (
            object_id TEXT PRIMARY KEY,
            object_type TEXT NOT NULL CHECK (object_type IN ('AREA','PROJECT','MINI_PROJECT','TASK','DECISION','OUTPUT')),
            version INTEGER NOT NULL CHECK (version >= 1),
            lifecycle TEXT NOT NULL CHECK (lifecycle IN ('OPEN','COMPLETED','CANCELLED','ARCHIVED')),
            condition_json TEXT NOT NULL CHECK (json_valid(condition_json)),
            due_at TEXT,
            closure_json TEXT CHECK (closure_json IS NULL OR (object_type IN ('PROJECT','MINI_PROJECT') AND lifecycle IN ('COMPLETED','ARCHIVED') AND json_valid(closure_json))),
            project_structure_json TEXT CHECK ((object_type = 'PROJECT' AND project_structure_json IS NOT NULL AND json_valid(project_structure_json)) OR (object_type <> 'PROJECT' AND project_structure_json IS NULL)),
            text TEXT NOT NULL CHECK (length(trim(text)) > 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            source_event TEXT NOT NULL
          ) STRICT;
          INSERT INTO objects_v12(object_id, object_type, version, lifecycle, condition_json, due_at, closure_json, project_structure_json, text, created_at, updated_at, source_event)
            SELECT object_id, object_type, version, lifecycle, condition_json, due_at, closure_json,
              CASE WHEN object_type = 'PROJECT' THEN json_object(
                'objectives', json('[]'),
                'deliverables', json('[]'),
                'workStages', json('[]'),
                'currentSummary', '已迁移 Project，待明确目标与当前推进。',
                'currentFocuses', json_array('明确目标与下一步'),
                'stageMappings', json('[]')
              ) ELSE NULL END,
              text, created_at, updated_at, source_event FROM objects;
          DROP TABLE objects;
          ALTER TABLE objects_v12 RENAME TO objects;
        `);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(12, schemaMigrationNames.get(12), at.toISOString());
        workingVersion = 12;
      }
      if (workingVersion === 12) {
        this.database.exec(agentGovernanceSchemaSql);
        this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
          .run(13, schemaMigrationNames.get(13), at.toISOString());
      }
      const foreignKeyViolations = (this.database.pragma("foreign_key_check") as unknown[]).length;
      if (foreignKeyViolations > 0) throw persistenceError("V2_SCHEMA_MIGRATION_FOREIGN_KEY_FAILED", "SQLite schema 迁移后出现外键错误；本批变化已回滚。", { foreignKeyViolations });
      this.database.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'").run(String(V2_DATABASE_SCHEMA_VERSION));
      this.database.pragma(`user_version = ${V2_DATABASE_SCHEMA_VERSION}`);
    });
    this.database.pragma("foreign_keys = OFF");
    try {
      migration();
      requireCompleteMigrationHistory(this.database);
    } catch (error) {
      if (error instanceof StructuredError) throw error;
      throw persistenceError("V2_SCHEMA_MIGRATION_FAILED", "SQLite schema 迁移失败；本批变化已回滚。", {
        fromVersion,
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.database.pragma("foreign_keys = ON");
    }
  }

  schemaMigrationHistory(): SchemaMigrationRecord[] {
    return requireCompleteMigrationHistory(this.database);
  }

  private static validateSchemaUpgradeBackup(path: string, expectedGraphId: string, expectedSchemaVersion: number): void {
    let database: Database.Database | undefined;
    try {
      database = new Database(resolve(path), { readonly: true, fileMustExist: true });
      database.pragma("foreign_keys = ON");
      const userVersion = database.pragma("user_version", { simple: true }) as number;
      const storedGraph = database.prepare("SELECT value FROM schema_meta WHERE key = 'graph_id'").pluck().get() as string | undefined;
      const storedSchema = Number(database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").pluck().get());
      const integrity = database.pragma("integrity_check", { simple: true }) as string;
      const foreignKeyViolations = (database.pragma("foreign_key_check") as unknown[]).length;
      if (
        userVersion !== expectedSchemaVersion ||
        storedSchema !== expectedSchemaVersion ||
        storedGraph !== expectedGraphId ||
        integrity !== "ok" ||
        foreignKeyViolations !== 0
      ) {
        throw persistenceError("V2_SCHEMA_MIGRATION_BACKUP_INVALID", "Schema 迁移前快照未通过只读校验。");
      }
    } catch (error) {
      if (error instanceof StructuredError) throw error;
      throw persistenceError("V2_SCHEMA_MIGRATION_BACKUP_INVALID", "Schema 迁移前快照无法通过只读校验。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      database?.close();
    }
  }

  commitObject(command: V2ObjectCommand): V2ObjectCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const stored = JSON.parse(receipt.result_json) as V2ManagedObject | { object: V2ManagedObject };
        return { object: "object" in stored ? stored.object : stored, replayed: true };
      }
      this.requireVersion(command.object.objectId, command.expectedVersion);
      const before = command.audit.command === "change_condition" ? this.getObject(command.object.objectId) : undefined;
      this.writeObject(command.object);
      this.writeAudit(command.audit);
      this.writeReceipt(
        command.idempotencyKey,
        command.audit,
        before ? { object: command.object, beforeCondition: before.condition } : command.object,
      );
      return { object: command.object, replayed: false };
    });
    return this.executeWrite(write);
  }

  upsertCandidate(candidate: V2Candidate, idempotencyKey: string): { candidate: V2Candidate; replayed: boolean } {
    this.requireIdempotencyKey(idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.candidateReceipt(idempotencyKey, "DiscoverCandidate");
      if (receipt) return { candidate: receipt, replayed: true };
      const row = this.database.prepare(`SELECT * FROM candidates
        WHERE source_anchor_id = ? AND candidate_kind = ? ORDER BY updated_at DESC, candidate_id LIMIT 1`)
        .get(candidate.sourceAnchorId, candidate.candidateKind) as CandidateRow | undefined;
      if (row) {
        const current = this.mapCandidate(row);
        if (current.sourceVersion === candidate.sourceVersion) {
          this.writeCandidateReceipt(idempotencyKey, "DiscoverCandidate", current, candidate.lastAnalyzedAt);
          return { candidate: current, replayed: true };
        }
        const refreshed: V2Candidate = {
          ...candidate,
          candidateId: current.candidateId,
          createdAt: current.createdAt,
          ...(current.disposition === "NO_MORE_LIKE_THIS" && current.suggestion === candidate.suggestion ? {
            disposition: current.disposition,
            ...(current.dispositionReason ? { dispositionReason: current.dispositionReason } : {}),
          } : {}),
        };
        if (current.activeProposalId) {
          const active = this.storedProposal(current.activeProposalId);
          if (active && !["APPLIED", "REJECTED", "FAILED", "SUPERSEDED"].includes(active.proposal.status)) {
            const staleProposal: V2Proposal = { ...active.proposal, status: "STALE" };
            const staleFiles = renderV2ProposalFiles(staleProposal);
            this.database.prepare("UPDATE proposals SET status = 'STALE', proposal_json = ?, proposal_md = ?, updated_at = ? WHERE proposal_id = ?")
              .run(staleFiles.proposalJson.trimEnd(), staleFiles.proposalMd, refreshed.updatedAt, staleProposal.proposalId);
          }
        }
        const result = this.database.prepare(`UPDATE candidates SET
          source_version = ?, reason = ?, suggestion = ?, disposition = ?, disposition_reason = ?,
          deferred_until = NULL, active_proposal_id = NULL, last_analyzed_at = ?, updated_at = ?
          WHERE candidate_id = ? AND updated_at = ?`)
          .run(refreshed.sourceVersion, refreshed.reason, refreshed.suggestion, refreshed.disposition,
            refreshed.dispositionReason ?? null, refreshed.lastAnalyzedAt, refreshed.updatedAt,
            refreshed.candidateId, current.updatedAt);
        if (result.changes !== 1) throw persistenceError("V2_CANDIDATE_STALE", "Candidate 在重新分析期间发生变化；本次更新已回滚。");
        this.writeCandidateReceipt(idempotencyKey, "DiscoverCandidate", refreshed, refreshed.updatedAt);
        return { candidate: refreshed, replayed: false };
      }
      this.insertCandidate(candidate);
      this.writeCandidateReceipt(idempotencyKey, "DiscoverCandidate", candidate, candidate.createdAt);
      return { candidate, replayed: false };
    });
    return this.executeWrite(write);
  }

  getCandidate(candidateId: string): V2Candidate | undefined {
    const row = this.database.prepare("SELECT * FROM candidates WHERE candidate_id = ?").get(candidateId) as CandidateRow | undefined;
    return row ? this.mapCandidate(row) : undefined;
  }

  getAgentDecisionBySource(graphId: string, sourceKind: "BLOCK" | "PAGE", sourceExternalId: string): AgentDecision | undefined {
    const row = this.database.prepare(`SELECT decision_json FROM agent_decisions
      WHERE graph_id = ? AND source_kind = ? AND source_external_id = ?`).get(graphId, sourceKind, sourceExternalId) as
      | { decision_json: string }
      | undefined;
    return row ? validateAgentDecision(JSON.parse(row.decision_json) as unknown) : undefined;
  }

  getAgentDecisionById(decisionId: string): AgentDecision | undefined {
    const row = this.database.prepare("SELECT decision_json FROM agent_decisions WHERE decision_id = ?").get(decisionId) as
      | { decision_json: string }
      | undefined;
    return row ? validateAgentDecision(JSON.parse(row.decision_json) as unknown) : undefined;
  }

  saveAgentDecision(
    decision: AgentDecision,
    event: AgentDecisionEvent | undefined,
    idempotencyKey: string,
  ): { decision: AgentDecision; event?: AgentDecisionEvent; replayed: boolean } {
    validateAgentDecision(decision);
    if (event) validateAgentDecisionEvent(event);
    this.requireIdempotencyKey(idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(idempotencyKey);
      if (receipt) {
        if (receipt.command_name !== "RecordAgentDecision") {
          throw persistenceError("V2_IDEMPOTENCY_KEY_CONFLICT", "idempotency key 已用于另一种命令。");
        }
        const restored = JSON.parse(receipt.result_json) as Record<string, unknown>;
        const restoredDecision = validateAgentDecision(restored.decision);
        const restoredEvent = restored.event === undefined ? undefined : validateAgentDecisionEvent(restored.event);
        return { decision: restoredDecision, ...(restoredEvent ? { event: restoredEvent } : {}), replayed: true };
      }

      const currentRow = this.database.prepare("SELECT decision_json FROM agent_decisions WHERE thread_id = ?").get(decision.threadId) as
        | { decision_json: string }
        | undefined;
      if (currentRow) {
        const current = validateAgentDecision(JSON.parse(currentRow.decision_json) as unknown);
        if (current.graphId !== decision.graphId
          || current.sourceRoot.kind !== decision.sourceRoot.kind
          || current.sourceRoot.externalId !== decision.sourceRoot.externalId) {
          throw persistenceError("AGENT_DECISION_THREAD_IDENTITY_MISMATCH", "Decision Thread 不允许改变 Graph 或 Source Root。");
        }
        if (decision.revision < current.revision
          || decision.revision > current.revision + 1
          || (decision.revision === current.revision && decision.decisionId !== current.decisionId)
          || (decision.revision === current.revision && decision.updatedAt < current.updatedAt)) {
          throw persistenceError("AGENT_DECISION_REVISION_STALE", "Decision Revision 已过期或不连续；本次写入已回滚。");
        }
      } else if (decision.revision !== 1) {
        throw persistenceError("AGENT_DECISION_REVISION_INVALID", "新 Decision Thread 必须从 Revision 1 开始。");
      }

      this.database.prepare(`INSERT INTO agent_decisions(
        thread_id, decision_id, revision, graph_id, source_kind, source_external_id, source_snapshot_hash,
        decision_json, observed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET
        decision_id = excluded.decision_id,
        revision = excluded.revision,
        source_snapshot_hash = excluded.source_snapshot_hash,
        decision_json = excluded.decision_json,
        observed_at = excluded.observed_at,
        updated_at = excluded.updated_at`)
        .run(decision.threadId, decision.decisionId, decision.revision, decision.graphId, decision.sourceRoot.kind,
          decision.sourceRoot.externalId, decision.sourceSnapshotHash, stableJson(decision), decision.observedAt,
          decision.createdAt, decision.updatedAt);

      if (event) {
        const existingEvent = this.database.prepare("SELECT thread_id, decision_id, event_type, actor, payload_json, occurred_at FROM agent_decision_events WHERE event_id = ?")
          .get(event.eventId) as { thread_id: string; decision_id: string; event_type: string; actor: string; payload_json: string; occurred_at: string } | undefined;
        const eventPayload = stableJson(event.payload);
        if (existingEvent) {
          if (stableJson(existingEvent) !== stableJson({
            thread_id: event.threadId,
            decision_id: event.decisionId,
            event_type: event.eventType,
            actor: event.actor,
            payload_json: eventPayload,
            occurred_at: event.occurredAt,
          })) throw persistenceError("AGENT_DECISION_EVENT_ID_CONFLICT", "Decision Event ID 已存在且内容不同。");
        } else {
          this.database.prepare(`INSERT INTO agent_decision_events(
            event_id, thread_id, decision_id, event_type, actor, payload_json, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(event.eventId, event.threadId, event.decisionId, event.eventType, event.actor, eventPayload, event.occurredAt);
        }
      }

      const receiptResult = event ? { decision, event } : { decision };
      this.database.prepare("INSERT INTO command_receipts(idempotency_key, command_name, result_json, created_at) VALUES (?, ?, ?, ?)")
        .run(idempotencyKey, "RecordAgentDecision", stableJson(receiptResult), decision.updatedAt);
      return { ...receiptResult, replayed: false };
    });
    return this.executeWrite(write);
  }

  listAgentDecisions(input: { limit: number; since?: string }): AgentDecision[] {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw persistenceError("AGENT_DECISION_LIMIT_INVALID", "Decision list limit 必须介于 1 与 100 之间。");
    }
    const rows = input.since
      ? this.database.prepare("SELECT decision_json FROM agent_decisions WHERE updated_at > ? ORDER BY updated_at DESC, thread_id LIMIT ?").all(input.since, input.limit)
      : this.database.prepare("SELECT decision_json FROM agent_decisions ORDER BY updated_at DESC, thread_id LIMIT ?").all(input.limit);
    return (rows as Array<{ decision_json: string }>).map((row) => validateAgentDecision(JSON.parse(row.decision_json) as unknown));
  }

  listAgentDecisionEvents(threadId: string): AgentDecisionEvent[] {
    return (this.database.prepare(`SELECT event_id, thread_id, decision_id, event_type, actor, payload_json, occurred_at
      FROM agent_decision_events WHERE thread_id = ? ORDER BY occurred_at, event_id`).all(threadId) as Array<{
        event_id: string;
        thread_id: string;
        decision_id: string;
        event_type: AgentDecisionEvent["eventType"];
        actor: AgentDecisionEvent["actor"];
        payload_json: string;
        occurred_at: string;
      }>).map((row) => validateAgentDecisionEvent({
        eventId: row.event_id,
        threadId: row.thread_id,
        decisionId: row.decision_id,
        eventType: row.event_type,
        actor: row.actor,
        payload: JSON.parse(row.payload_json) as Record<string, unknown>,
        occurredAt: row.occurred_at,
      }));
  }

  saveAgentFeedback(
    event: AgentDecisionEvent,
    authorization: AgentRuleAuthorization | undefined,
    expectedAuthorizationUpdatedAt: string | undefined,
    idempotencyKey: string,
  ): { event: AgentDecisionEvent; authorization?: AgentRuleAuthorization; replayed: boolean } {
    validateAgentDecisionEvent(event);
    if (event.eventType !== "USER_FEEDBACK_ADDED" || event.actor !== "USER") {
      throw persistenceError("AGENT_FEEDBACK_INVALID", "Feedback 必须是 USER_FEEDBACK_ADDED 用户事件。");
    }
    if (authorization) validateAgentRuleAuthorization(authorization);
    this.requireIdempotencyKey(idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(idempotencyKey);
      if (receipt) {
        if (receipt.command_name !== "RecordAgentFeedback") {
          throw persistenceError("V2_IDEMPOTENCY_KEY_CONFLICT", "idempotency key 已用于另一种命令。");
        }
        const restored = JSON.parse(receipt.result_json) as Record<string, unknown>;
        const restoredAuthorization = restored.authorization === undefined ? undefined : validateAgentRuleAuthorization(restored.authorization);
        return {
          event: validateAgentDecisionEvent(restored.event),
          ...(restoredAuthorization ? { authorization: restoredAuthorization } : {}),
          replayed: true,
        };
      }
      const decision = this.getAgentDecisionById(event.decisionId);
      if (!decision || decision.threadId !== event.threadId) {
        throw persistenceError("AGENT_DECISION_NOT_FOUND", "Feedback 只能关联当前存在的 Decision Revision。");
      }
      if (event.payload.ruleId !== decision.rule.id || event.payload.decisionRevision !== decision.revision) {
        throw persistenceError("AGENT_FEEDBACK_DECISION_MISMATCH", "Feedback 的 Rule 或 Revision 与 Decision 不一致。");
      }
      this.database.prepare(`INSERT INTO agent_decision_events(
        event_id, thread_id, decision_id, event_type, actor, payload_json, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(event.eventId, event.threadId, event.decisionId, event.eventType, event.actor, stableJson(event.payload), event.occurredAt);

      if (authorization) {
        const current = this.getAgentRuleAuthorization(authorization.ruleId);
        if (!current || expectedAuthorizationUpdatedAt === undefined || current.updatedAt !== expectedAuthorizationUpdatedAt
          || authorization.ruleId !== decision.rule.id || current.createdAt !== authorization.createdAt) {
          throw persistenceError("AGENT_RULE_AUTHORIZATION_STALE", "Rule 授权已变化；Feedback 与暂停操作已回滚。");
        }
        const result = this.database.prepare(`UPDATE agent_rule_authorizations SET
          skill_version = ?, skill_hash = ?, skill_max_authority = ?, local_current_authority = ?,
          effective_authority = ?, change_level = ?, paused = ?, authorization_json = ?, updated_at = ?
          WHERE rule_id = ? AND updated_at = ?`)
          .run(authorization.skillVersion, authorization.skillHash, authorization.skillMaxAuthority,
            authorization.localCurrentAuthority, authorization.effectiveAuthority, authorization.changeLevel,
            authorization.paused ? 1 : 0, stableJson(authorization), authorization.updatedAt,
            authorization.ruleId, expectedAuthorizationUpdatedAt);
        if (result.changes !== 1) throw persistenceError("AGENT_RULE_AUTHORIZATION_STALE", "Rule 授权已变化；Feedback 与暂停操作已回滚。");
      }
      const receiptResult = { event, ...(authorization ? { authorization } : {}) };
      this.database.prepare("INSERT INTO command_receipts(idempotency_key, command_name, result_json, created_at) VALUES (?, ?, ?, ?)")
        .run(idempotencyKey, "RecordAgentFeedback", stableJson(receiptResult), event.occurredAt);
      return { ...receiptResult, replayed: false };
    });
    return this.executeWrite(write);
  }

  getAgentRuleAuthorization(ruleId: string): AgentRuleAuthorization | undefined {
    const row = this.database.prepare("SELECT authorization_json FROM agent_rule_authorizations WHERE rule_id = ?").get(ruleId) as
      | { authorization_json: string }
      | undefined;
    return row ? validateAgentRuleAuthorization(JSON.parse(row.authorization_json) as unknown) : undefined;
  }

  saveAgentRuleAuthorization(
    authorization: AgentRuleAuthorization,
    expectedUpdatedAt: string | undefined,
    idempotencyKey: string,
  ): { authorization: AgentRuleAuthorization; replayed: boolean } {
    validateAgentRuleAuthorization(authorization);
    this.requireIdempotencyKey(idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(idempotencyKey);
      if (receipt) {
        if (receipt.command_name !== "SaveAgentRuleAuthorization") {
          throw persistenceError("V2_IDEMPOTENCY_KEY_CONFLICT", "idempotency key 已用于另一种命令。");
        }
        return { authorization: validateAgentRuleAuthorization(JSON.parse(receipt.result_json) as unknown), replayed: true };
      }
      const current = this.getAgentRuleAuthorization(authorization.ruleId);
      if (current) {
        if (expectedUpdatedAt === undefined || current.updatedAt !== expectedUpdatedAt) {
          throw persistenceError("AGENT_RULE_AUTHORIZATION_STALE", "Rule 授权已变化；本次写入已回滚。");
        }
        if (current.ruleId !== authorization.ruleId || current.skillName !== authorization.skillName || current.createdAt !== authorization.createdAt) {
          throw persistenceError("AGENT_RULE_AUTHORIZATION_IDENTITY_IMMUTABLE", "Rule ID、Skill 归属与创建时间不可变更。");
        }
        const result = this.database.prepare(`UPDATE agent_rule_authorizations SET
          skill_version = ?, skill_hash = ?, skill_max_authority = ?, local_current_authority = ?,
          effective_authority = ?, change_level = ?, paused = ?, authorization_json = ?, updated_at = ?
          WHERE rule_id = ? AND updated_at = ?`)
          .run(authorization.skillVersion, authorization.skillHash, authorization.skillMaxAuthority,
            authorization.localCurrentAuthority, authorization.effectiveAuthority, authorization.changeLevel,
            authorization.paused ? 1 : 0, stableJson(authorization), authorization.updatedAt,
            authorization.ruleId, expectedUpdatedAt);
        if (result.changes !== 1) throw persistenceError("AGENT_RULE_AUTHORIZATION_STALE", "Rule 授权已变化；本次写入已回滚。");
      } else {
        if (expectedUpdatedAt !== undefined) throw persistenceError("AGENT_RULE_AUTHORIZATION_NOT_FOUND", "Rule 授权不存在。");
        this.database.prepare(`INSERT INTO agent_rule_authorizations(
          rule_id, skill_name, skill_version, skill_hash, skill_max_authority, local_current_authority,
          effective_authority, change_level, paused, authorization_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(authorization.ruleId, authorization.skillName, authorization.skillVersion, authorization.skillHash,
            authorization.skillMaxAuthority, authorization.localCurrentAuthority, authorization.effectiveAuthority,
            authorization.changeLevel, authorization.paused ? 1 : 0, stableJson(authorization),
            authorization.createdAt, authorization.updatedAt);
      }
      this.database.prepare("INSERT INTO command_receipts(idempotency_key, command_name, result_json, created_at) VALUES (?, ?, ?, ?)")
        .run(idempotencyKey, "SaveAgentRuleAuthorization", stableJson(authorization), authorization.updatedAt);
      return { authorization, replayed: false };
    });
    return this.executeWrite(write);
  }

  listAgentRuleAuthorizations(): AgentRuleAuthorization[] {
    return (this.database.prepare("SELECT authorization_json FROM agent_rule_authorizations ORDER BY rule_id").all() as Array<{
      authorization_json: string;
    }>).map((row) => validateAgentRuleAuthorization(JSON.parse(row.authorization_json) as unknown));
  }

  getAgentReviewSignalBySource(graphId: string, sourceExternalId: string): AgentReviewSignal | undefined {
    const row = this.database.prepare(`SELECT signal_json FROM agent_review_signals
      WHERE graph_id = ? AND source_external_id = ?`).get(graphId, sourceExternalId) as { signal_json: string } | undefined;
    return row ? validateAgentReviewSignal(JSON.parse(row.signal_json) as unknown) : undefined;
  }

  getAgentReviewSignal(reviewSignalId: string): AgentReviewSignal | undefined {
    const row = this.database.prepare("SELECT signal_json FROM agent_review_signals WHERE review_signal_id = ?").get(reviewSignalId) as
      | { signal_json: string }
      | undefined;
    return row ? validateAgentReviewSignal(JSON.parse(row.signal_json) as unknown) : undefined;
  }

  saveAgentReviewSignal(
    signal: AgentReviewSignal,
    expected: AgentReviewSignal | undefined,
    idempotencyKey: string,
  ): { signal: AgentReviewSignal; replayed: boolean } {
    validateAgentReviewSignal(signal);
    this.requireIdempotencyKey(idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(idempotencyKey);
      if (receipt) {
        if (receipt.command_name !== "SaveAgentReviewSignal") {
          throw persistenceError("V2_IDEMPOTENCY_KEY_CONFLICT", "idempotency key 已用于另一种命令。");
        }
        return { signal: validateAgentReviewSignal(JSON.parse(receipt.result_json) as unknown), replayed: true };
      }
      const current = this.getAgentReviewSignal(signal.reviewSignalId);
      if (current) {
        if (!expected || stableJson(current) !== stableJson(expected)) {
          throw persistenceError("AGENT_REVIEW_SIGNAL_STALE", "Review Signal 已变化；本次写入已回滚。");
        }
        if (current.graphId !== signal.graphId
          || current.sourceRoot.kind !== signal.sourceRoot.kind
          || current.sourceRoot.externalId !== signal.sourceRoot.externalId
          || current.firstSeenAt !== signal.firstSeenAt) {
          throw persistenceError("AGENT_REVIEW_SIGNAL_IDENTITY_IMMUTABLE", "Review Signal 不允许改变 Graph、Source Root 或首次观测时间。");
        }
        const result = this.database.prepare(`UPDATE agent_review_signals SET
          status = ?, retention_class = ?, active_until = ?, occurrence_count = ?, signal_json = ?, last_seen_at = ?
          WHERE review_signal_id = ? AND signal_json = ?`)
          .run(signal.status, signal.retentionClass, signal.activeUntil ?? null, signal.occurrenceCount,
            stableJson(signal), signal.lastSeenAt, signal.reviewSignalId, stableJson(expected));
        if (result.changes !== 1) throw persistenceError("AGENT_REVIEW_SIGNAL_STALE", "Review Signal 已变化；本次写入已回滚。");
      } else {
        if (expected) throw persistenceError("AGENT_REVIEW_SIGNAL_NOT_FOUND", "Review Signal 不存在。");
        this.database.prepare(`INSERT INTO agent_review_signals(
          review_signal_id, graph_id, source_external_id, status, retention_class, active_until,
          occurrence_count, signal_json, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(signal.reviewSignalId, signal.graphId, signal.sourceRoot.externalId, signal.status,
            signal.retentionClass, signal.activeUntil ?? null, signal.occurrenceCount, stableJson(signal),
            signal.firstSeenAt, signal.lastSeenAt);
      }
      this.database.prepare("INSERT INTO command_receipts(idempotency_key, command_name, result_json, created_at) VALUES (?, ?, ?, ?)")
        .run(idempotencyKey, "SaveAgentReviewSignal", stableJson(signal), signal.lastSeenAt);
      return { signal, replayed: false };
    });
    return this.executeWrite(write);
  }

  listAgentReviewSignals(input: { status?: AgentReviewSignalStatus; limit: number }): AgentReviewSignal[] {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw persistenceError("AGENT_REVIEW_SIGNAL_LIMIT_INVALID", "Review Signal list limit 必须介于 1 与 100 之间。");
    }
    const rows = input.status
      ? this.database.prepare("SELECT signal_json FROM agent_review_signals WHERE status = ? ORDER BY last_seen_at DESC, review_signal_id LIMIT ?").all(input.status, input.limit)
      : this.database.prepare("SELECT signal_json FROM agent_review_signals ORDER BY last_seen_at DESC, review_signal_id LIMIT ?").all(input.limit);
    return (rows as Array<{ signal_json: string }>).map((row) => validateAgentReviewSignal(JSON.parse(row.signal_json) as unknown));
  }

  activeCandidateForSourceAnchor(sourceAnchorId: string): V2Candidate | undefined {
    const row = this.database.prepare(`SELECT * FROM candidates
      WHERE source_anchor_id = ? AND disposition <> 'RESOLVED'
      ORDER BY updated_at DESC, candidate_id LIMIT 1`).get(sourceAnchorId) as CandidateRow | undefined;
    return row ? this.mapCandidate(row) : undefined;
  }

  candidateForProposal(proposalId: string): V2Candidate | undefined {
    const row = this.database.prepare("SELECT * FROM candidates WHERE active_proposal_id = ? ORDER BY updated_at DESC LIMIT 1").get(proposalId) as CandidateRow | undefined;
    return row ? this.mapCandidate(row) : undefined;
  }

  listCandidates(): V2Candidate[] {
    return (this.database.prepare(`SELECT * FROM candidates ORDER BY
      CASE disposition WHEN 'PENDING' THEN 0 WHEN 'LATER' THEN 1 WHEN 'DISMISSED' THEN 2 WHEN 'NO_MORE_LIKE_THIS' THEN 3 ELSE 4 END,
      COALESCE(deferred_until, updated_at), candidate_id`).all() as CandidateRow[]).map((row) => this.mapCandidate(row));
  }

  updateCandidate(candidate: V2Candidate, expectedUpdatedAt: string, idempotencyKey: string): { candidate: V2Candidate; replayed: boolean } {
    this.requireIdempotencyKey(idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.candidateReceipt(idempotencyKey, "UpdateCandidate");
      if (receipt) return { candidate: receipt, replayed: true };
      const current = this.getCandidate(candidate.candidateId);
      if (!current) throw persistenceError("V2_CANDIDATE_NOT_FOUND", "Candidate 不存在。");
      if (current.updatedAt !== expectedUpdatedAt) throw persistenceError("V2_CANDIDATE_STALE", "Candidate 已变化；本次处置没有写入。");
      if (candidate.createdAt !== current.createdAt || candidate.sourceAnchorId !== current.sourceAnchorId || candidate.sourceVersion !== current.sourceVersion || candidate.candidateKind !== current.candidateKind) {
        throw persistenceError("V2_CANDIDATE_IDENTITY_IMMUTABLE", "Candidate 来源身份只能由重新分析命令更新。");
      }
      const result = this.database.prepare(`UPDATE candidates SET reason = ?, suggestion = ?, disposition = ?,
        disposition_reason = ?, deferred_until = ?, active_proposal_id = ?, last_analyzed_at = ?, updated_at = ?
        WHERE candidate_id = ? AND updated_at = ?`)
        .run(candidate.reason, candidate.suggestion, candidate.disposition, candidate.dispositionReason ?? null,
          candidate.deferredUntil ?? null, candidate.activeProposalId ?? null, candidate.lastAnalyzedAt,
          candidate.updatedAt, candidate.candidateId, expectedUpdatedAt);
      if (result.changes !== 1) throw persistenceError("V2_CANDIDATE_STALE", "Candidate 在处置期间发生变化；本次更新已回滚。");
      this.writeCandidateReceipt(idempotencyKey, "UpdateCandidate", candidate, candidate.updatedAt);
      return { candidate, replayed: false };
    });
    return this.executeWrite(write);
  }

  submitCandidateProposal(candidate: V2Candidate, proposal: V2Proposal, files: V2ProposalFiles, expectedUpdatedAt: string, idempotencyKey: string): { candidate: V2Candidate; proposal: V2Proposal; replayed: boolean } {
    this.requireIdempotencyKey(idempotencyKey);
    validateV2Proposal(proposal);
    const canonicalFiles = renderV2ProposalFiles(proposal);
    if (files.proposalJson !== canonicalFiles.proposalJson || files.proposalMd !== canonicalFiles.proposalMd) throw persistenceError("V2_PROPOSAL_FILES_MISMATCH", "Proposal 两文件与已验证语义不一致。");
    const write = this.database.transaction(() => {
      const receipt = this.candidateReceipt(idempotencyKey, "FormalizeCandidate");
      if (receipt) {
        const stored = this.storedProposal(receipt.activeProposalId ?? "");
        if (!stored) throw persistenceError("V2_CANDIDATE_PROPOSAL_LEDGER_CORRUPT", "Candidate formalization 回执缺少 Proposal。");
        return { candidate: receipt, proposal: stored.proposal, replayed: true };
      }
      const current = this.getCandidate(candidate.candidateId);
      if (!current) throw persistenceError("V2_CANDIDATE_NOT_FOUND", "Candidate 不存在。");
      if (current.updatedAt !== expectedUpdatedAt) throw persistenceError("V2_CANDIDATE_STALE", "Candidate 已变化；没有生成 Proposal。");
      if (candidate.createdAt !== current.createdAt || candidate.sourceAnchorId !== current.sourceAnchorId || candidate.sourceVersion !== current.sourceVersion || candidate.candidateKind !== current.candidateKind || candidate.activeProposalId !== proposal.proposalId) {
        throw persistenceError("V2_CANDIDATE_IDENTITY_IMMUTABLE", "Candidate formalization 身份与 Proposal 不一致。");
      }
      const existing = this.database.prepare("SELECT proposal_json, proposal_md FROM proposals WHERE proposal_id = ?").get(proposal.proposalId) as { proposal_json: string; proposal_md: string } | undefined;
      if (existing) {
        if (existing.proposal_json !== files.proposalJson.trimEnd() || existing.proposal_md !== files.proposalMd) throw persistenceError("V2_PROPOSAL_ID_CONFLICT", "Proposal ID 已存在且内容不同。");
      } else {
        this.database.prepare("INSERT INTO proposals(proposal_id, status, proposal_json, proposal_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(proposal.proposalId, proposal.status, files.proposalJson.trimEnd(), files.proposalMd, proposal.createdAt, candidate.updatedAt);
        const insertGroup = this.database.prepare("INSERT INTO proposal_groups(proposal_id, group_id, disposition, group_json, updated_at) VALUES (?, ?, ?, ?, ?)");
        for (const group of proposal.groups) insertGroup.run(proposal.proposalId, group.groupId, group.disposition, stableJson(group), candidate.updatedAt);
      }
      const updated = this.database.prepare("UPDATE candidates SET disposition = ?, disposition_reason = ?, deferred_until = ?, active_proposal_id = ?, updated_at = ? WHERE candidate_id = ? AND updated_at = ?")
        .run(candidate.disposition, candidate.dispositionReason ?? null, candidate.deferredUntil ?? null, candidate.activeProposalId ?? null, candidate.updatedAt, candidate.candidateId, expectedUpdatedAt);
      if (updated.changes !== 1) throw persistenceError("V2_CANDIDATE_STALE", "Candidate 在 Proposal 创建期间发生变化；本批已回滚。");
      this.writeCandidateReceipt(idempotencyKey, "FormalizeCandidate", candidate, candidate.updatedAt);
      return { candidate, proposal, replayed: false };
    });
    return this.executeWrite(write);
  }

  submitProposal(proposal: V2Proposal, files: V2ProposalFiles, at = new Date()): { proposal: V2Proposal; replayed: boolean } {
    validateV2Proposal(proposal);
    const canonicalFiles = renderV2ProposalFiles(proposal);
    if (files.proposalJson !== canonicalFiles.proposalJson || files.proposalMd !== canonicalFiles.proposalMd) throw persistenceError("V2_PROPOSAL_FILES_MISMATCH", "Proposal 两文件与已验证语义不一致。");
    const write = this.database.transaction(() => {
      const existing = this.database.prepare("SELECT proposal_json, proposal_md FROM proposals WHERE proposal_id = ?").get(proposal.proposalId) as { proposal_json: string; proposal_md: string } | undefined;
      if (existing) {
        if (existing.proposal_json !== files.proposalJson.trimEnd() || existing.proposal_md !== files.proposalMd) throw persistenceError("V2_PROPOSAL_ID_CONFLICT", "Proposal ID 已存在且内容不同。");
        return { proposal: validateV2Proposal(JSON.parse(existing.proposal_json) as unknown), replayed: true };
      }
      const updatedAt = at.toISOString();
      this.database.prepare("INSERT INTO proposals(proposal_id, status, proposal_json, proposal_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(proposal.proposalId, proposal.status, files.proposalJson.trimEnd(), files.proposalMd, proposal.createdAt, updatedAt);
      const insertGroup = this.database.prepare("INSERT INTO proposal_groups(proposal_id, group_id, disposition, group_json, updated_at) VALUES (?, ?, ?, ?, ?)");
      for (const group of proposal.groups) insertGroup.run(proposal.proposalId, group.groupId, group.disposition, stableJson(group), updatedAt);
      return { proposal, replayed: false };
    });
    return this.executeWrite(write);
  }

  storedProposal(proposalId: string): V2StoredProposal | undefined {
    const row = this.database.prepare("SELECT proposal_json, proposal_md, updated_at FROM proposals WHERE proposal_id = ?").get(proposalId) as { proposal_json: string; proposal_md: string; updated_at: string } | undefined;
    if (!row) return undefined;
    const proposal = validateV2Proposal(JSON.parse(row.proposal_json) as unknown);
    return { proposal, files: { proposalJson: `${row.proposal_json}\n`, proposalMd: row.proposal_md }, updatedAt: row.updated_at };
  }

  listStoredProposals(): V2StoredProposal[] {
    return (this.database.prepare("SELECT proposal_id FROM proposals ORDER BY created_at, proposal_id").all() as Array<{ proposal_id: string }>).map((row) => this.storedProposal(row.proposal_id)!);
  }

  updateStoredProposal(proposal: V2Proposal, files: V2ProposalFiles, expectedUpdatedAt: string, at = new Date()): V2StoredProposal {
    validateV2Proposal(proposal);
    const canonicalFiles = renderV2ProposalFiles(proposal);
    if (files.proposalJson !== canonicalFiles.proposalJson || files.proposalMd !== canonicalFiles.proposalMd) throw persistenceError("V2_PROPOSAL_FILES_MISMATCH", "Proposal 两文件与已验证语义不一致。");
    const write = this.database.transaction(() => {
      const current = this.database.prepare("SELECT updated_at FROM proposals WHERE proposal_id = ?").get(proposal.proposalId) as { updated_at: string } | undefined;
      if (!current) throw persistenceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      if (current.updated_at !== expectedUpdatedAt) throw persistenceError("V2_PROPOSAL_REVIEW_STALE", "Proposal 已变化；本次审阅没有写入。");
      const updatedAt = at.toISOString();
      this.database.prepare("UPDATE proposals SET status = ?, proposal_json = ?, proposal_md = ?, updated_at = ? WHERE proposal_id = ? AND updated_at = ?")
        .run(proposal.status, files.proposalJson.trimEnd(), files.proposalMd, updatedAt, proposal.proposalId, expectedUpdatedAt);
      this.database.prepare("DELETE FROM proposal_groups WHERE proposal_id = ?").run(proposal.proposalId);
      const insertGroup = this.database.prepare("INSERT INTO proposal_groups(proposal_id, group_id, disposition, group_json, updated_at) VALUES (?, ?, ?, ?, ?)");
      for (const group of proposal.groups) insertGroup.run(proposal.proposalId, group.groupId, group.disposition, stableJson(group), updatedAt);
      return this.storedProposal(proposal.proposalId)!;
    });
    return this.executeWrite(write);
  }

  commitMaterialization(command: V2MaterializationCommand | V2ProjectCreationCommand): V2AnchorCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const result = JSON.parse(receipt.result_json) as { object: V2ManagedObject; anchor: V2Anchor };
        return { ...result, replayed: true };
      }
      this.requireVersion(command.object.objectId, 0);
      const bound = this.database.prepare(`
        SELECT anchor_id FROM anchors
        WHERE graph_id = ? AND external_id = ? AND role = 'primary_text'
      `).get(command.anchor.graphId, command.anchor.externalId) as { anchor_id: string } | undefined;
      if (bound) {
        throw persistenceError("V2_EXTERNAL_PRIMARY_ANCHOR_EXISTS", "该 Logseq Block 已经绑定正式对象；重复事件必须走同步而不是再次物化。", {
          anchorId: bound.anchor_id,
        });
      }
      this.writeObject(command.object);
      this.database.prepare(`
        INSERT INTO anchors(anchor_id, object_id, role, graph_id, external_id, status, content_hash, last_seen_at)
        VALUES (@anchorId, @objectId, @role, @graphId, @externalId, @status, @contentHash, @lastSeenAt)
      `).run(command.anchor);
      this.writeAudit(command.audit);
      const result = { object: command.object, anchor: command.anchor };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitMaterializationUndo(command: V2MaterializationUndoCommand): V2MaterializationUndoResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const result = JSON.parse(receipt.result_json) as { object: V2ManagedObject; anchor: V2Anchor };
        return { ...result, replayed: true };
      }
      const currentObject = this.getObject(command.expectedObject.objectId);
      const currentAnchor = this.getPrimaryAnchorById(command.expectedAnchor.anchorId);
      if (stableJson(currentObject) !== stableJson(command.expectedObject) || stableJson(currentAnchor) !== stableJson(command.expectedAnchor)) {
        throw persistenceError("V2_UNDO_STATE_CHANGED", "对象或 Anchor 已变化；Undo 没有写入。", { objectId: command.expectedObject.objectId });
      }
      const dependent = this.database.prepare(`
        SELECT
          EXISTS(SELECT 1 FROM primary_ownerships WHERE child_object_id = ? OR owner_object_id = ?) AS ownership_count,
          EXISTS(SELECT 1 FROM focus_selections WHERE object_id = ?) AS focus_count,
          EXISTS(SELECT 1 FROM associations WHERE source_object_id = ? OR target_object_id = ?) AS association_count,
          (SELECT count(*) FROM anchors WHERE object_id = ?) AS anchor_count
      `).get(command.expectedObject.objectId, command.expectedObject.objectId, command.expectedObject.objectId, command.expectedObject.objectId, command.expectedObject.objectId, command.expectedObject.objectId) as { ownership_count: number; focus_count: number; association_count: number; anchor_count: number };
      if (dependent.ownership_count || dependent.focus_count || dependent.association_count || dependent.anchor_count !== 1) {
        throw persistenceError("V2_UNDO_DEPENDENT_STATE_EXISTS", "对象已有归属、Association、Focus 或额外 Anchor；Undo 不会删除后续状态。", { objectId: command.expectedObject.objectId });
      }
      const anchorDeleted = this.database.prepare("DELETE FROM anchors WHERE anchor_id = ? AND object_id = ? AND content_hash = ?")
        .run(command.expectedAnchor.anchorId, command.expectedObject.objectId, command.expectedAnchor.contentHash);
      const objectDeleted = this.database.prepare("DELETE FROM objects WHERE object_id = ? AND version = ?")
        .run(command.expectedObject.objectId, command.expectedObject.version);
      if (anchorDeleted.changes !== 1 || objectDeleted.changes !== 1) throw persistenceError("V2_UNDO_STATE_CHANGED", "对象或 Anchor 在 Undo 事务中变化；本批已回滚。");
      this.writeAudit(command.audit);
      const result = { object: command.expectedObject, anchor: command.expectedAnchor };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitSynchronization(command: V2SynchronizationCommand): V2AnchorCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const result = JSON.parse(receipt.result_json) as { object: V2ManagedObject; anchor: V2Anchor };
        return { ...result, replayed: true };
      }
      this.requireVersion(command.object.objectId, command.expectedVersion);
      const current = this.getPrimaryAnchorByExternal(command.anchor.graphId, command.anchor.externalId);
      if (!current || current.anchorId !== command.anchor.anchorId || current.objectId !== command.object.objectId) {
        throw persistenceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 已变化；本次同步没有写入。", {
          objectId: command.object.objectId,
        });
      }
      this.writeObject(command.object);
      const updated = this.database.prepare(`
        UPDATE anchors SET status = 'active', content_hash = ?, last_seen_at = ?
        WHERE anchor_id = ? AND object_id = ? AND role = 'primary_text' AND status <> 'replaced'
      `).run(command.anchor.contentHash, command.anchor.lastSeenAt, command.anchor.anchorId, command.object.objectId);
      if (updated.changes !== 1) throw persistenceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 已变化；本次同步没有写入。");
      this.writeAudit(command.audit);
      const result = { object: command.object, anchor: command.anchor };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitAnchorObservation(command: V2AnchorObservationCommand): V2AnchorCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const result = JSON.parse(receipt.result_json) as { object: V2ManagedObject; anchor: V2Anchor };
        return { ...result, replayed: true };
      }
      this.requireVersion(command.object.objectId, command.expectedVersion);
      const current = this.getPrimaryAnchorById(command.anchor.anchorId);
      if (!current || current.objectId !== command.object.objectId || current.status === "replaced") {
        throw persistenceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 已变化；本次观察没有写入。", { objectId: command.object.objectId });
      }
      this.writeObject(command.object);
      const updated = this.database.prepare(`
        UPDATE anchors SET status = ?, last_seen_at = ?
        WHERE anchor_id = ? AND object_id = ? AND role = 'primary_text' AND status <> 'replaced'
      `).run(command.anchor.status, command.anchor.lastSeenAt, command.anchor.anchorId, command.object.objectId);
      if (updated.changes !== 1) throw persistenceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 已变化；本次观察没有写入。");
      this.writeAudit(command.audit);
      const result = { object: command.object, anchor: command.anchor };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitAnchorRebind(command: V2AnchorRebindCommand): V2AnchorRebindCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const result = JSON.parse(receipt.result_json) as { object: V2ManagedObject; previousAnchor: V2Anchor; anchor: V2Anchor };
        return { ...result, replayed: true };
      }
      this.requireVersion(command.object.objectId, command.expectedVersion);
      const current = this.getPrimaryAnchorById(command.previousAnchor.anchorId);
      if (
        !current ||
        current.objectId !== command.object.objectId ||
        current.status !== command.expectedPreviousAnchor.status ||
        current.contentHash !== command.expectedPreviousAnchor.contentHash ||
        current.externalId !== command.expectedPreviousAnchor.externalId ||
        current.status === "replaced"
      ) {
        throw persistenceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 已变化；本次重新绑定没有写入。", { objectId: command.object.objectId });
      }
      const target = this.database.prepare("SELECT anchor_id FROM anchors WHERE graph_id = ? AND external_id = ? AND role = 'primary_text'")
        .get(command.anchor.graphId, command.anchor.externalId) as { anchor_id: string } | undefined;
      if (target) throw persistenceError("V2_REBIND_TARGET_ALREADY_BOUND", "新的 Logseq Block 已有 Primary Anchor 记录；重新绑定没有写入。", { anchorId: target.anchor_id });
      this.writeObject(command.object);
      const replaced = this.database.prepare(`
        UPDATE anchors SET status = 'replaced'
        WHERE anchor_id = ? AND object_id = ? AND role = 'primary_text' AND status <> 'replaced'
      `).run(command.previousAnchor.anchorId, command.object.objectId);
      if (replaced.changes !== 1) throw persistenceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 已变化；本次重新绑定没有写入。");
      this.database.prepare(`
        INSERT INTO anchors(anchor_id, object_id, role, graph_id, external_id, status, content_hash, last_seen_at)
        VALUES (@anchorId, @objectId, @role, @graphId, @externalId, @status, @contentHash, @lastSeenAt)
      `).run(command.anchor);
      this.writeAudit(command.audit);
      const result = { object: command.object, previousAnchor: command.previousAnchor, anchor: command.anchor };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  getCommandReceipt(idempotencyKey: string): V2CommandReceipt | undefined {
    const receipt = this.receipt(idempotencyKey);
    if (!receipt) return undefined;
    const command = receipt.command_name as V2CommandReceipt["command"];
    const result = JSON.parse(receipt.result_json) as unknown;
    if (command === "create_object" || command === "edit_area" || command === "transition_lifecycle" || command === "cancel_lifecycle" || command === "reopen_lifecycle" || command === "undo_lifecycle" || command === "complete_mini_project" || command === "complete_project" || command === "update_project_structure" || command === "change_due_at") {
      return { command, object: result as V2ManagedObject };
    }
    if (command === "change_condition") {
      const value = result as V2ManagedObject | { object: V2ManagedObject; beforeCondition?: V2Condition };
      return "object" in value
        ? { command, object: value.object, ...(value.beforeCondition ? { beforeCondition: value.beforeCondition } : {}) }
        : { command, object: value };
    }
    if (command === "create_project_with_page" || command === "materialize_explicit_object" || command === "undo_materialization" || command === "synchronize_explicit_object" || command === "complete_mini_project_from_marker" || command === "observe_primary_anchor" || command === "bind_primary_anchor") {
      const value = result as { object: V2ManagedObject; anchor: V2Anchor };
      return { command, ...value };
    }
    if (command === "rebind_primary_anchor") {
      const value = result as { object: V2ManagedObject; previousAnchor: V2Anchor; anchor: V2Anchor };
      return { command, ...value };
    }
    if (command === "assign_primary_owner") {
      const value = result as { object: V2ManagedObject; ownership: V2PrimaryOwnership };
      return { command, ...value };
    }
    if (command === "change_primary_owner") return { command, ...(result as { object: V2ManagedObject; ownership: V2PrimaryOwnership; previousOwnerId?: string }) };
    if (command === "undo_primary_owner_change") return { command, ...(result as { object: V2ManagedObject; ownership?: V2PrimaryOwnership }) };
    if (command === "add_association") {
      const value = result as { object: V2ManagedObject; association: V2Association };
      return { command, ...value };
    }
    throw persistenceError("V2_COMMAND_RECEIPT_CORRUPT", "SQLite command receipt 类型未知。", { command });
  }

  prepareSemanticCommit(commit: V2SemanticCommitLedgerRecord, steps: V2SemanticCommitStepRecord[]): { replayed: boolean } {
    if (commit.status !== "PENDING" || !commit.semanticCommitId.trim() || !commit.beforeStateChecksum.trim()) {
      throw persistenceError("V2_SEMANTIC_COMMIT_INVALID", "SemanticCommit 必须以 PENDING 和 before checksum 准备。");
    }
    if (steps.length === 0 || steps.some((step, index) => step.semanticCommitId !== commit.semanticCommitId || step.stepIndex !== index || step.status !== "PREPARED")) {
      throw persistenceError("V2_COMMIT_STEPS_INVALID", "SemanticCommit steps 必须非空、连续编号并以 PREPARED 开始。");
    }
    const write = this.database.transaction(() => {
      const existing = this.semanticCommit(commit.semanticCommitId);
      if (existing) {
        const existingSteps = this.semanticCommitSteps(commit.semanticCommitId);
        const immutableCommit = ({ semanticCommitId, proposalId, beforeStateChecksum, createdAt }: V2SemanticCommitLedgerRecord) => ({ semanticCommitId, proposalId, beforeStateChecksum, createdAt });
        const immutableSteps = (values: V2SemanticCommitStepRecord[]) => values.map(({ semanticCommitId, stepIndex, stepKind, operationId, beforeHash, afterHash }) => ({ semanticCommitId, stepIndex, stepKind, operationId, beforeHash, afterHash }));
        if (stableJson(immutableCommit(existing)) !== stableJson(immutableCommit(commit)) || stableJson(immutableSteps(existingSteps)) !== stableJson(immutableSteps(steps))) {
          throw persistenceError("V2_SEMANTIC_COMMIT_ID_CONFLICT", "SemanticCommit ID 已存在且 payload 不同。");
        }
        return { replayed: true };
      }
      this.database.prepare(`
        INSERT INTO semantic_commits(
          semantic_commit_id, proposal_id, status, before_state_checksum, after_state_checksum, created_at, updated_at, error_code
        ) VALUES (@semanticCommitId, @proposalId, @status, @beforeStateChecksum, @afterStateChecksum, @createdAt, @updatedAt, @errorCode)
      `).run({ ...commit, proposalId: commit.proposalId ?? null, afterStateChecksum: commit.afterStateChecksum ?? null, errorCode: commit.errorCode ?? null });
      const insertStep = this.database.prepare(`
        INSERT INTO semantic_commit_steps(
          semantic_commit_id, step_index, step_kind, status, operation_id, before_hash, after_hash, error_code, updated_at
        ) VALUES (@semanticCommitId, @stepIndex, @stepKind, @status, @operationId, @beforeHash, @afterHash, @errorCode, @updatedAt)
      `);
      for (const step of steps) insertStep.run({
        ...step,
        operationId: step.operationId ?? null,
        beforeHash: step.beforeHash ?? null,
        afterHash: step.afterHash ?? null,
        errorCode: step.errorCode ?? null,
      });
      return { replayed: false };
    });
    return this.executeWrite(write);
  }

  advanceSemanticCommitStep(
    semanticCommitId: string,
    stepIndex: number,
    status: Exclude<V2CommitStepStatus, "PREPARED">,
    updatedAt: string,
    errorCode?: string,
  ): V2SemanticCommitStepRecord {
    const allowed: Record<V2CommitStepStatus, V2CommitStepStatus[]> = {
      PREPARED: ["APPLIED", "RECOVERY_REQUIRED"],
      APPLIED: ["VERIFIED", "COMPENSATED", "RECOVERY_REQUIRED"],
      VERIFIED: ["RECOVERY_REQUIRED"],
      COMPENSATED: [],
      RECOVERY_REQUIRED: ["COMPENSATED"],
    };
    const write = this.database.transaction(() => {
      const commit = this.semanticCommit(semanticCommitId);
      if (!commit || (commit.status !== "PENDING" && commit.status !== "RECOVERY_REQUIRED")) throw persistenceError("V2_SEMANTIC_COMMIT_NOT_PENDING", "只有 PENDING/RECOVERY_REQUIRED SemanticCommit 可推进 step。");
      const current = this.semanticCommitSteps(semanticCommitId).find((step) => step.stepIndex === stepIndex);
      if (!current) throw persistenceError("V2_COMMIT_STEP_NOT_FOUND", "SemanticCommit step 不存在。");
      if (!allowed[current.status].includes(status)) {
        throw persistenceError("V2_COMMIT_STEP_TRANSITION_INVALID", "SemanticCommit step 状态跳转不合法。", { from: current.status, to: status });
      }
      this.database.prepare(`
        UPDATE semantic_commit_steps SET status = ?, error_code = ?, updated_at = ?
        WHERE semantic_commit_id = ? AND step_index = ?
      `).run(status, errorCode ?? null, updatedAt, semanticCommitId, stepIndex);
      return this.semanticCommitSteps(semanticCommitId).find((step) => step.stepIndex === stepIndex)!;
    });
    return this.executeWrite(write);
  }

  recordPreparedSemanticCommitStepEvidence(
    semanticCommitId: string,
    stepIndex: number,
    evidence: { operationId: string; afterHash: string },
    updatedAt: string,
  ): V2SemanticCommitStepRecord {
    const write = this.database.transaction(() => {
      const commit = this.semanticCommit(semanticCommitId);
      if (!commit || commit.status !== "PENDING") throw persistenceError("V2_SEMANTIC_COMMIT_NOT_PENDING", "只有 PENDING SemanticCommit 可记录执行证据。");
      const current = this.semanticCommitSteps(semanticCommitId).find((step) => step.stepIndex === stepIndex);
      if (!current || current.status !== "PREPARED") throw persistenceError("V2_COMMIT_STEP_EVIDENCE_NOT_PREPARED", "只有 PREPARED step 可绑定实际执行身份与结果 hash。");
      if (current.afterHash !== undefined && (current.operationId !== evidence.operationId || current.afterHash !== evidence.afterHash)) {
        throw persistenceError("V2_COMMIT_STEP_EVIDENCE_CONFLICT", "SemanticCommit step 已绑定不同的实际执行证据。");
      }
      this.database.prepare(`
        UPDATE semantic_commit_steps SET operation_id = ?, after_hash = ?, updated_at = ?
        WHERE semantic_commit_id = ? AND step_index = ?
      `).run(evidence.operationId, evidence.afterHash, updatedAt, semanticCommitId, stepIndex);
      return this.semanticCommitSteps(semanticCommitId).find((step) => step.stepIndex === stepIndex)!;
    });
    return this.executeWrite(write);
  }

  finalizeSemanticCommit(
    semanticCommitId: string,
    status: "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED",
    updatedAt: string,
    afterStateChecksum?: string,
    errorCode?: string,
  ): V2SemanticCommitLedgerRecord {
    const write = this.database.transaction(() => {
      const commit = this.semanticCommit(semanticCommitId);
      if (!commit || (commit.status !== "PENDING" && !(commit.status === "RECOVERY_REQUIRED" && status === "FAILED"))) {
        throw persistenceError("V2_SEMANTIC_COMMIT_NOT_PENDING", "SemanticCommit 当前状态不允许该收口。");
      }
      const steps = this.semanticCommitSteps(semanticCommitId);
      if (status === "COMPLETED" && (!afterStateChecksum?.trim() || steps.some((step) => step.status !== "VERIFIED"))) {
        throw persistenceError("V2_SEMANTIC_COMMIT_NOT_VERIFIED", "SemanticCommit 只能在所有 step VERIFIED 后完成。");
      }
      if (status === "RECOVERY_REQUIRED" && !steps.some((step) => step.status === "RECOVERY_REQUIRED")) {
        throw persistenceError("V2_RECOVERY_STEP_REQUIRED", "RECOVERY_REQUIRED Commit 必须指明未恢复 step。");
      }
      if (status === "FAILED" && steps.some((step) => step.status === "APPLIED" || step.status === "VERIFIED" || step.status === "RECOVERY_REQUIRED")) {
        throw persistenceError("V2_SEMANTIC_COMMIT_NOT_COMPENSATED", "FAILED Commit 不能保留 APPLIED/VERIFIED/RECOVERY_REQUIRED step。");
      }
      this.database.prepare(`
        UPDATE semantic_commits SET status = ?, after_state_checksum = ?, error_code = ?, updated_at = ?
        WHERE semantic_commit_id = ?
      `).run(status, afterStateChecksum ?? null, errorCode ?? null, updatedAt, semanticCommitId);
      return this.semanticCommit(semanticCommitId)!;
    });
    return this.executeWrite(write);
  }

  markSemanticCommitUndone(originalSemanticCommitId: string, inverseSemanticCommitId: string, updatedAt: string): V2SemanticCommitLedgerRecord {
    const write = this.database.transaction(() => {
      const original = this.semanticCommit(originalSemanticCommitId);
      const inverse = this.semanticCommit(inverseSemanticCommitId);
      if (original?.status === "UNDONE") return original;
      if (!original || original.status !== "COMPLETED" || !inverse || inverse.status !== "COMPLETED" || original.proposalId !== inverse.proposalId) {
        throw persistenceError("V2_UNDO_COMMIT_STATE_INVALID", "只有已完成且同属一个 Proposal 的正向/逆向 Commit 可以收口 Undo。");
      }
      this.database.prepare("UPDATE semantic_commits SET status = 'UNDONE', updated_at = ? WHERE semantic_commit_id = ? AND status = 'COMPLETED'")
        .run(updatedAt, originalSemanticCommitId);
      return this.semanticCommit(originalSemanticCommitId)!;
    });
    return this.executeWrite(write);
  }

  unresolvedSemanticCommits(): V2SemanticCommitLedgerRecord[] {
    return (this.database.prepare("SELECT * FROM semantic_commits WHERE status IN ('PENDING','RECOVERY_REQUIRED') ORDER BY created_at").all() as Record<string, unknown>[])
      .map((row) => this.mapSemanticCommit(row));
  }

  listSemanticCommits(proposalId?: string): V2SemanticCommitLedgerRecord[] {
    const rows = proposalId
      ? this.database.prepare("SELECT * FROM semantic_commits WHERE proposal_id = ? ORDER BY created_at, semantic_commit_id").all(proposalId)
      : this.database.prepare("SELECT * FROM semantic_commits ORDER BY created_at, semantic_commit_id").all();
    return (rows as Record<string, unknown>[]).map((row) => this.mapSemanticCommit(row));
  }

  listConditionChangeReceipts(objectId: string): V2ConditionChangeReceipt[] {
    const rows = this.database.prepare(`
      SELECT idempotency_key, result_json, created_at
      FROM command_receipts
      WHERE command_name = 'change_condition'
        AND idempotency_key NOT LIKE 'condition-undo:%'
      ORDER BY created_at DESC, idempotency_key DESC
    `).all() as Array<{ idempotency_key: string; result_json: string; created_at: string }>;
    return rows.flatMap((row) => {
      const value = JSON.parse(row.result_json) as V2ManagedObject | { object?: V2ManagedObject; beforeCondition?: V2Condition };
      if (!("object" in value) || !value.object || !value.beforeCondition || value.object.objectId !== objectId) return [];
      return [{
        idempotencyKey: row.idempotency_key,
        object: value.object,
        beforeCondition: value.beforeCondition,
        createdAt: row.created_at,
      }];
    });
  }

  listFocusSelections(): FocusSelection[] {
    return (this.database.prepare("SELECT object_id, selected_at, rank, expires_at FROM focus_selections ORDER BY rank, selected_at").all() as Array<{ object_id: string; selected_at: string; rank: number; expires_at: string | null }>).map((row) => ({
      objectId: row.object_id, selectedAt: row.selected_at, rank: row.rank, ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    }));
  }

  commitFocusSelection(objectId: string, expectedVersion: number, selection: FocusSelection | undefined): FocusSelection | undefined {
    const write = this.database.transaction(() => {
      this.requireVersion(objectId, expectedVersion);
      if (!selection) {
        this.database.prepare("DELETE FROM focus_selections WHERE object_id = ?").run(objectId);
        return undefined;
      }
      const object = this.getObject(objectId)!;
      if (object.lifecycle !== "OPEN") throw persistenceError("V2_FOCUS_OBJECT_CLOSED", "关闭对象不能加入 Focus。", { objectId });
      if (selection.objectId !== objectId || !Number.isSafeInteger(selection.rank) || selection.rank < 0 || !Number.isFinite(Date.parse(selection.selectedAt)) || (selection.expiresAt && !Number.isFinite(Date.parse(selection.expiresAt)))) {
        throw persistenceError("V2_FOCUS_SELECTION_INVALID", "Focus selection 无效。");
      }
      this.database.prepare("UPDATE focus_selections SET rank = rank + 1 WHERE object_id <> ? AND rank >= ?")
        .run(objectId, selection.rank);
      this.database.prepare(`INSERT INTO focus_selections(object_id, selected_at, rank, expires_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(object_id) DO UPDATE SET selected_at = excluded.selected_at, rank = excluded.rank, expires_at = excluded.expires_at`)
        .run(objectId, selection.selectedAt, selection.rank, selection.expiresAt ?? null);
      return this.listFocusSelections().find((value) => value.objectId === objectId)!;
    });
    return this.executeWrite(write);
  }

  reorderFocusSelections(expectedObjectIds: readonly string[], objectIds: readonly string[]): FocusSelection[] {
    const write = this.database.transaction(() => {
      const current = this.listFocusSelections().map((selection) => selection.objectId);
      if (stableJson(current) !== stableJson(expectedObjectIds)) throw persistenceError("V2_FOCUS_ORDER_STALE", "Focus 顺序已变化；本次排序没有写入。");
      const update = this.database.prepare("UPDATE focus_selections SET rank = ? WHERE object_id = ?");
      objectIds.forEach((objectId, rank) => {
        if (!expectedObjectIds.includes(objectId)) throw persistenceError("V2_FOCUS_ORDER_INVALID", "Focus 排序包含未知对象。");
        if (update.run(rank, objectId).changes !== 1) throw persistenceError("V2_FOCUS_ORDER_STALE", "Focus 顺序已变化；本批已回滚。");
      });
      return this.listFocusSelections();
    });
    return this.executeWrite(write);
  }

  semanticCommit(semanticCommitId: string): V2SemanticCommitLedgerRecord | undefined {
    const row = this.database.prepare("SELECT * FROM semantic_commits WHERE semantic_commit_id = ?").get(semanticCommitId) as Record<string, unknown> | undefined;
    return row ? this.mapSemanticCommit(row) : undefined;
  }

  semanticCommitSteps(semanticCommitId: string): V2SemanticCommitStepRecord[] {
    return (this.database.prepare("SELECT * FROM semantic_commit_steps WHERE semantic_commit_id = ? ORDER BY step_index").all(semanticCommitId) as Record<string, unknown>[])
      .map((row) => ({
        semanticCommitId: String(row.semantic_commit_id),
        stepIndex: Number(row.step_index),
        stepKind: row.step_kind as V2CommitStepKind,
        status: row.status as V2CommitStepStatus,
        ...(row.operation_id ? { operationId: String(row.operation_id) } : {}),
        ...(row.before_hash ? { beforeHash: String(row.before_hash) } : {}),
        ...(row.after_hash ? { afterHash: String(row.after_hash) } : {}),
        ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
        updatedAt: String(row.updated_at),
      }));
  }

  private mapSemanticCommit(row: Record<string, unknown>): V2SemanticCommitLedgerRecord {
    return {
      semanticCommitId: String(row.semantic_commit_id),
      ...(row.proposal_id ? { proposalId: String(row.proposal_id) } : {}),
      status: row.status as V2SemanticCommitStatus,
      beforeStateChecksum: String(row.before_state_checksum),
      ...(row.after_state_checksum ? { afterStateChecksum: String(row.after_state_checksum) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
    };
  }

  commitAnchor(command: V2AnchorCommand): V2AnchorCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const result = JSON.parse(receipt.result_json) as { object: V2ManagedObject; anchor: V2Anchor };
        return { ...result, replayed: true };
      }
      this.requireVersion(command.object.objectId, command.expectedVersion);
      const existing = this.database
        .prepare("SELECT anchor_id FROM anchors WHERE object_id = ? AND role = 'primary_text' AND status = 'active'")
        .get(command.object.objectId) as { anchor_id: string } | undefined;
      if (existing) {
        throw persistenceError("V2_PRIMARY_ANCHOR_EXISTS", "对象已存在 active Primary Anchor；必须走显式 rebind。", {
          objectId: command.object.objectId,
          anchorId: existing.anchor_id,
        });
      }
      this.writeObject(command.object);
      this.database
        .prepare(`
          INSERT INTO anchors(anchor_id, object_id, role, graph_id, external_id, status, content_hash, last_seen_at)
          VALUES (@anchorId, @objectId, @role, @graphId, @externalId, @status, @contentHash, @lastSeenAt)
        `)
        .run(command.anchor);
      this.writeAudit(command.audit);
      const result = { object: command.object, anchor: command.anchor };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitOwnership(command: V2OwnershipCommand): V2OwnershipCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) {
        const result = JSON.parse(receipt.result_json) as { object: V2ManagedObject; ownership: V2PrimaryOwnership };
        return { ...result, replayed: true };
      }
      this.requireVersion(command.object.objectId, command.expectedVersion);
      const existing = this.database
        .prepare("SELECT owner_object_id FROM primary_ownerships WHERE child_object_id = ?")
        .get(command.object.objectId) as { owner_object_id: string } | undefined;
      if (existing) {
        throw persistenceError("V2_PRIMARY_OWNER_EXISTS", "对象已存在 Primary Owner；必须走显式变更。", {
          childObjectId: command.object.objectId,
          ownerObjectId: existing.owner_object_id,
        });
      }
      this.writeObject(command.object);
      this.database
        .prepare("INSERT INTO primary_ownerships(child_object_id, owner_object_id, assigned_at) VALUES (?, ?, ?)")
        .run(command.ownership.childObjectId, command.ownership.ownerObjectId, command.ownership.assignedAt);
      this.writeAudit(command.audit);
      const result = { object: command.object, ownership: command.ownership };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitOwnershipChange(command: V2OwnershipChangeCommand): V2OwnershipChangeCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) return { ...(JSON.parse(receipt.result_json) as { object: V2ManagedObject; ownership: V2PrimaryOwnership }), replayed: true };
      this.requireVersion(command.object.objectId, command.expectedVersion);
      this.requireVersion(command.ownership.ownerObjectId, command.expectedOwnerVersion);
      const current = this.database.prepare("SELECT owner_object_id FROM primary_ownerships WHERE child_object_id = ?").pluck().get(command.object.objectId) as string | undefined;
      if (current !== command.expectedCurrentOwnerId) throw persistenceError("V2_PRIMARY_OWNER_STALE", "Primary Owner 已变化；本次变更没有写入。", { expectedCurrentOwnerId: command.expectedCurrentOwnerId, currentOwnerId: current });
      this.writeObject(command.object);
      if (current === undefined) this.database.prepare("INSERT INTO primary_ownerships(child_object_id, owner_object_id, assigned_at) VALUES (?, ?, ?)").run(command.ownership.childObjectId, command.ownership.ownerObjectId, command.ownership.assignedAt);
      else if (this.database.prepare("UPDATE primary_ownerships SET owner_object_id = ?, assigned_at = ? WHERE child_object_id = ? AND owner_object_id = ?").run(command.ownership.ownerObjectId, command.ownership.assignedAt, command.ownership.childObjectId, current).changes !== 1) throw persistenceError("V2_PRIMARY_OWNER_STALE", "Primary Owner 在事务中变化；本次变更已回滚。");
      this.writeAudit(command.audit);
      const result = { object: command.object, ownership: command.ownership, ...(current ? { previousOwnerId: current } : {}) };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitOwnershipUndo(command: V2OwnershipUndoCommand): V2OwnershipUndoResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) return { ...(JSON.parse(receipt.result_json) as { object: V2ManagedObject; ownership?: V2PrimaryOwnership }), replayed: true };
      this.requireVersion(command.object.objectId, command.expectedVersion);
      if (command.restoredOwnership) this.requireVersion(command.restoredOwnership.ownerObjectId, command.expectedPreviousOwnerVersion!);
      const current = this.database.prepare("SELECT owner_object_id FROM primary_ownerships WHERE child_object_id = ?").pluck().get(command.object.objectId) as string | undefined;
      if (current !== command.expectedCurrentOwnerId) throw persistenceError("V2_PRIMARY_OWNER_UNDO_STALE", "Primary Owner 已有后续变化；Undo 没有写入。", { expectedCurrentOwnerId: command.expectedCurrentOwnerId, currentOwnerId: current });
      this.writeObject(command.object);
      const changes = command.restoredOwnership
        ? this.database.prepare("UPDATE primary_ownerships SET owner_object_id = ?, assigned_at = ? WHERE child_object_id = ? AND owner_object_id = ?").run(command.restoredOwnership.ownerObjectId, command.restoredOwnership.assignedAt, command.object.objectId, current).changes
        : this.database.prepare("DELETE FROM primary_ownerships WHERE child_object_id = ? AND owner_object_id = ?").run(command.object.objectId, current).changes;
      if (changes !== 1) throw persistenceError("V2_PRIMARY_OWNER_UNDO_STALE", "Primary Owner 在 Undo 事务中变化；本次已回滚。");
      this.writeAudit(command.audit);
      const result = { object: command.object, ...(command.restoredOwnership ? { ownership: command.restoredOwnership } : {}) };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitAssociation(command: V2AssociationCommand): V2AssociationCommandResult {
    this.requireIdempotencyKey(command.idempotencyKey);
    const write = this.database.transaction(() => {
      const receipt = this.receipt(command.idempotencyKey);
      if (receipt) return { ...(JSON.parse(receipt.result_json) as { object: V2ManagedObject; association: V2Association }), replayed: true };
      this.requireVersion(command.object.objectId, command.expectedVersion);
      const duplicate = this.database.prepare("SELECT association_id FROM associations WHERE source_object_id = ? AND target_object_id = ? AND association_kind = ?")
        .get(command.association.sourceObjectId, command.association.targetObjectId, command.association.associationKind);
      if (duplicate) throw persistenceError("V2_ASSOCIATION_EXISTS", "相同方向的普通 Association 已存在；没有重复创建。");
      this.writeObject(command.object);
      this.database.prepare(`INSERT INTO associations(association_id, source_object_id, target_object_id, association_kind, status, created_at, updated_at)
        VALUES (@associationId, @sourceObjectId, @targetObjectId, @associationKind, @status, @createdAt, @updatedAt)`).run(command.association);
      this.writeAudit(command.audit);
      const result = { object: command.object, association: command.association };
      this.writeReceipt(command.idempotencyKey, command.audit, result);
      return { ...result, replayed: false };
    });
    return this.executeWrite(write);
  }

  createMigrationPreview(command: V2MigrationPreviewCommand): { run: V2MigrationRun; replayed: boolean } {
    const write = this.database.transaction(() => {
      const existing = this.migrationRun(command.run.runId);
      if (existing) {
        const currentEvidence = this.migrationEvidence(command.run.runId);
        const same = existing.sourceBundleSha256 === command.run.sourceBundleSha256
          && existing.sourceCreatedAt === command.run.sourceCreatedAt
          && stableJson(existing.summary) === stableJson(command.run.summary)
          && stableJson(currentEvidence.map((value) => ({
            runId: value.runId,
            legacyObjectId: value.legacyObjectId,
            sourceHash: value.sourceHash,
            preview: value.preview,
            decision: value.decision,
          }))) === stableJson(command.evidence);
        if (!same) throw persistenceError("MIGRATION_PREVIEW_REPLAY_CONFLICT", "同一 Migration Run 已存在不同的审阅结果；没有覆盖原记录。");
        return { run: existing, replayed: true };
      }
      this.database.prepare(`
        INSERT INTO migration_runs(run_id, source_bundle_sha256, source_created_at, status, summary_json, created_at, updated_at)
        VALUES (?, ?, ?, 'PREVIEWED', ?, ?, ?)
      `).run(command.run.runId, command.run.sourceBundleSha256, command.run.sourceCreatedAt, stableJson(command.run.summary), command.run.createdAt, command.run.updatedAt);
      const insertEvidence = this.database.prepare(`
        INSERT INTO legacy_evidence(run_id, legacy_object_id, source_hash, mapping_json)
        VALUES (?, ?, ?, ?)
      `);
      for (const evidence of command.evidence) {
        if (evidence.runId !== command.run.runId || evidence.sourceHash !== command.run.sourceBundleSha256) {
          throw persistenceError("MIGRATION_PREVIEW_EVIDENCE_INVALID", "Migration evidence 与 Run 身份不一致。");
        }
        insertEvidence.run(evidence.runId, evidence.legacyObjectId, evidence.sourceHash, stableJson({ preview: evidence.preview, decision: evidence.decision }));
      }
      return { run: command.run, replayed: false };
    });
    return this.executeWrite(write);
  }

  migrationRun(runId: string): V2MigrationRun | undefined {
    const row = this.database.prepare(`
      SELECT run_id, source_bundle_sha256, source_created_at, status, summary_json, snapshot_backup_id, created_at, updated_at
      FROM migration_runs WHERE run_id = ?
    `).get(runId) as {
      run_id: string; source_bundle_sha256: string; source_created_at: string; status: V2MigrationRun["status"];
      summary_json: string; snapshot_backup_id: string | null; created_at: string; updated_at: string;
    } | undefined;
    if (!row) return undefined;
    return {
      runId: row.run_id,
      sourceBundleSha256: row.source_bundle_sha256,
      sourceCreatedAt: row.source_created_at,
      status: row.status,
      summary: JSON.parse(row.summary_json) as V2MigrationRun["summary"],
      ...(row.snapshot_backup_id ? { snapshotBackupId: row.snapshot_backup_id } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listMigrationRuns(limit = 20): V2MigrationRun[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw persistenceError("MIGRATION_RUN_QUERY_LIMIT_INVALID", "Migration Run 查询上限必须是 1 到 100。");
    const ids = this.database.prepare("SELECT run_id FROM migration_runs ORDER BY updated_at DESC, run_id ASC LIMIT ?").pluck().all(limit) as string[];
    return ids.map((runId) => this.migrationRun(runId)!);
  }

  migrationEvidence(runId: string): V2LegacyMigrationEvidence[] {
    const rows = this.database.prepare(`
      SELECT run_id, legacy_object_id, source_hash, mapping_json, target_object_id
      FROM legacy_evidence WHERE run_id = ? ORDER BY legacy_object_id
    `).all(runId) as Array<{ run_id: string; legacy_object_id: string; source_hash: string; mapping_json: string; target_object_id: string | null }>;
    return rows.map((row) => {
      const mapping = JSON.parse(row.mapping_json) as Pick<V2LegacyMigrationEvidence, "preview" | "decision">;
      return {
        runId: row.run_id,
        legacyObjectId: row.legacy_object_id,
        sourceHash: row.source_hash,
        preview: mapping.preview,
        decision: mapping.decision,
        ...(row.target_object_id ? { targetObjectId: row.target_object_id } : {}),
      };
    });
  }

  migrationBatch(runId: string, batchId: string): V2MigrationBatch | undefined {
    const row = this.database.prepare(`
      SELECT batch_id, run_id, idempotency_key, source_hash, status, scope_json, imported_count,
             validation_json, inverse_json, created_at, updated_at
      FROM migration_batches WHERE run_id = ? AND batch_id = ?
    `).get(runId, batchId) as {
      batch_id: string; run_id: string; idempotency_key: string; source_hash: string; status: V2MigrationBatch["status"];
      scope_json: string; imported_count: number; validation_json: string | null; inverse_json: string | null; created_at: string; updated_at: string;
    } | undefined;
    if (!row) return undefined;
    return {
      batchId: row.batch_id,
      runId: row.run_id,
      idempotencyKey: row.idempotency_key,
      sourceHash: row.source_hash,
      status: row.status,
      objectIds: JSON.parse(row.scope_json) as string[],
      importedCount: row.imported_count,
      ...(row.validation_json ? { validation: JSON.parse(row.validation_json) as NonNullable<V2MigrationBatch["validation"]> } : {}),
      ...(row.inverse_json ? { inverse: JSON.parse(row.inverse_json) as NonNullable<V2MigrationBatch["inverse"]> } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listMigrationBatches(runId: string, limit = 100): V2MigrationBatch[] {
    if (!runId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw persistenceError("MIGRATION_BATCH_QUERY_INVALID", "Migration batch 查询需要有效计划与 1 到 100 的上限。");
    }
    const ids = this.database.prepare(`
      SELECT batch_id FROM migration_batches
      WHERE run_id = ?
      ORDER BY created_at ASC, batch_id ASC
      LIMIT ?
    `).pluck().all(runId, limit) as string[];
    return ids.map((batchId) => this.migrationBatch(runId, batchId)!);
  }

  commitMigrationBatch(command: V2MigrationBatchCommand): { batch: V2MigrationBatch; replayed: boolean } {
    const commandChecksum = checksum({
      runId: command.batch.runId,
      idempotencyKey: command.batch.idempotencyKey,
      sourceHash: command.batch.sourceHash,
      snapshotBackupId: command.snapshotBackupId,
      objectIds: command.batch.objectIds,
      objects: command.objects,
      anchors: command.anchors,
      ownerships: command.ownerships,
      actor: command.actor,
      traceId: command.traceId,
    });
    const write = this.database.transaction(() => {
      const replay = this.database.prepare("SELECT run_id, batch_id FROM migration_batches WHERE idempotency_key = ? OR batch_id = ?").get(command.batch.idempotencyKey, command.batch.batchId) as { run_id: string; batch_id: string } | undefined;
      if (replay) {
        const existing = this.migrationBatch(replay.run_id, replay.batch_id)!;
        if (existing.runId !== command.batch.runId || existing.inverse?.commandChecksum !== commandChecksum) {
          throw persistenceError("MIGRATION_BATCH_REPLAY_CONFLICT", "Migration batch 的幂等键已绑定不同内容；没有重复写入。");
        }
        return { batch: existing, replayed: true };
      }
      const run = this.migrationRun(command.batch.runId);
      if (!run || run.sourceBundleSha256 !== command.batch.sourceHash || !["PREVIEWED", "IMPORTING"].includes(run.status)) {
        throw persistenceError("MIGRATION_RUN_NOT_IMPORTABLE", "Migration Run 不存在、源已变化或当前状态不可导入。");
      }
      if (run.snapshotBackupId && run.snapshotBackupId !== command.snapshotBackupId) {
        throw persistenceError("MIGRATION_SNAPSHOT_CHANGED", "同一 Migration Run 不能更换导入前快照。");
      }
      if (command.objects.length < 1 || command.objects.length > 50 || command.objects.length !== command.batch.objectIds.length) {
        throw persistenceError("MIGRATION_BATCH_SCOPE_INVALID", "Migration batch 必须包含 1 到 50 个完整对象。");
      }
      const scope = new Set(command.batch.objectIds);
      if (scope.size !== command.batch.objectIds.length || command.objects.some((object) => !scope.has(object.objectId)) || command.anchors.some((anchor) => !scope.has(anchor.objectId)) || command.ownerships.some((ownership) => !scope.has(ownership.childObjectId))) {
        throw persistenceError("MIGRATION_BATCH_SCOPE_MISMATCH", "Migration batch 的对象、Anchor 或 Ownership 超出审阅范围。");
      }
      for (const objectId of scope) {
        if (this.getObject(objectId)) throw persistenceError("MIGRATION_TARGET_ALREADY_EXISTS", `Migration target ${objectId} 已存在；没有覆盖。`);
        const evidence = this.database.prepare("SELECT target_object_id, mapping_json FROM legacy_evidence WHERE run_id = ? AND legacy_object_id = ? AND source_hash = ?").get(command.batch.runId, objectId, command.batch.sourceHash) as { target_object_id: string | null; mapping_json: string } | undefined;
        const action = evidence ? (JSON.parse(evidence.mapping_json) as { decision?: { action?: string } }).decision?.action : undefined;
        if (!evidence || evidence.target_object_id || action !== "IMPORT") throw persistenceError("MIGRATION_EVIDENCE_NOT_IMPORTABLE", `Migration evidence ${objectId} 未审阅、已导入或源不一致。`);
      }
      this.database.prepare(`
        INSERT INTO migration_batches(batch_id, run_id, idempotency_key, source_hash, status, scope_json, imported_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'PREPARED', ?, 0, ?, ?)
      `).run(command.batch.batchId, command.batch.runId, command.batch.idempotencyKey, command.batch.sourceHash, stableJson(command.batch.objectIds), command.batch.createdAt, command.batch.updatedAt);
      for (const object of command.objects) this.writeObject(object);
      const insertAnchor = this.database.prepare(`
        INSERT INTO anchors(anchor_id, object_id, role, graph_id, external_id, status, content_hash, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const anchor of command.anchors) insertAnchor.run(anchor.anchorId, anchor.objectId, anchor.role, anchor.graphId, anchor.externalId, anchor.status, anchor.contentHash, anchor.lastSeenAt);
      const insertOwnership = this.database.prepare("INSERT INTO primary_ownerships(child_object_id, owner_object_id, assigned_at) VALUES (?, ?, ?)");
      for (const ownership of command.ownerships) insertOwnership.run(ownership.childObjectId, ownership.ownerObjectId, ownership.assignedAt);
      const audit = this.database.prepare(`
        INSERT INTO audit_events(trace_id, actor, command_name, object_id, before_version, after_version, occurred_at)
        VALUES (?, ?, 'migrate_v1_object', ?, 0, ?, ?)
      `);
      for (const object of command.objects) {
        audit.run(command.traceId, command.actor, object.objectId, object.version, command.batch.updatedAt);
        this.database.prepare("UPDATE legacy_evidence SET target_object_id = ? WHERE run_id = ? AND legacy_object_id = ? AND target_object_id IS NULL").run(object.objectId, command.batch.runId, object.objectId);
      }
      const inverse = { commandChecksum, objects: command.batch.objectIds.map((objectId) => ({ objectId, checksum: this.migrationProjectionChecksum(objectId) })) };
      this.database.prepare(`
        UPDATE migration_batches SET status = 'IMPORTED', imported_count = ?, inverse_json = ?, updated_at = ? WHERE batch_id = ?
      `).run(command.objects.length, stableJson(inverse), command.batch.updatedAt, command.batch.batchId);
      this.database.prepare("UPDATE migration_runs SET status = 'IMPORTING', snapshot_backup_id = coalesce(snapshot_backup_id, ?), updated_at = ? WHERE run_id = ?").run(command.snapshotBackupId, command.batch.updatedAt, command.batch.runId);
      return { batch: this.migrationBatch(command.batch.runId, command.batch.batchId)!, replayed: false };
    });
    return this.executeWrite(write);
  }

  verifyMigrationBatch(runId: string, batchId: string, at: string): V2MigrationBatch {
    const write = this.database.transaction(() => {
      const batch = this.migrationBatch(runId, batchId);
      if (!batch) throw persistenceError("MIGRATION_BATCH_NOT_FOUND", "找不到 Migration batch。");
      if (batch.status === "VERIFIED") return batch;
      if (batch.status !== "IMPORTED" || !batch.inverse) throw persistenceError("MIGRATION_BATCH_NOT_VERIFIABLE", "只有已导入且保留逆向证据的 Migration batch 可以验证。");
      const current = batch.inverse.objects.map(({ objectId, checksum: expected }) => {
        const actual = this.migrationProjectionChecksum(objectId);
        if (actual !== expected) throw persistenceError("MIGRATION_BATCH_VERIFICATION_FAILED", `Migration target ${objectId} 已变化或不完整。`);
        return { objectId, checksum: actual };
      });
      const validation = { status: "PASS" as const, objectCount: current.length, checksum: checksum(current) };
      this.database.prepare("UPDATE migration_batches SET status = 'VERIFIED', validation_json = ?, updated_at = ? WHERE batch_id = ?").run(stableJson(validation), at, batchId);
      const pendingImports = this.database.prepare(`
        SELECT count(*) AS count FROM legacy_evidence
        WHERE run_id = ? AND json_extract(mapping_json, '$.decision.action') = 'IMPORT' AND target_object_id IS NULL
      `).pluck().get(runId) as number;
      const unverifiedBatches = this.database.prepare("SELECT count(*) AS count FROM migration_batches WHERE run_id = ? AND status IN ('PREPARED','IMPORTED','FAILED')").pluck().get(runId) as number;
      if (pendingImports === 0 && unverifiedBatches === 0) this.database.prepare("UPDATE migration_runs SET status = 'VERIFIED', updated_at = ? WHERE run_id = ?").run(at, runId);
      return this.migrationBatch(runId, batchId)!;
    });
    return this.executeWrite(write);
  }

  undoMigrationBatch(runId: string, batchId: string, at: string): V2MigrationBatch {
    const write = this.database.transaction(() => {
      const run = this.migrationRun(runId);
      const batch = this.migrationBatch(runId, batchId);
      if (!run || !batch) throw persistenceError("MIGRATION_BATCH_NOT_FOUND", "找不到 Migration batch。");
      if (run.status === "ACTIVATED") throw persistenceError("MIGRATION_RUN_ALREADY_ACTIVATED", "V2 已激活；不能用批次 Undo 回到迁移前状态。");
      if (batch.status === "UNDONE") return batch;
      if (batch.status !== "VERIFIED" || !batch.inverse) throw persistenceError("MIGRATION_BATCH_NOT_UNDOABLE", "只有已验证且未激活的 Migration batch 可以 Undo。");
      for (const expected of batch.inverse.objects) {
        if (this.migrationProjectionChecksum(expected.objectId) !== expected.checksum) throw persistenceError("MIGRATION_UNDO_TARGET_CHANGED", `Migration target ${expected.objectId} 已在导入后变化；拒绝静默删除。`);
      }
      const placeholders = batch.objectIds.map(() => "?").join(",");
      const externalDependents = this.database.prepare(`
        SELECT count(*) AS count FROM primary_ownerships
        WHERE owner_object_id IN (${placeholders}) AND child_object_id NOT IN (${placeholders})
      `).pluck().get(...batch.objectIds, ...batch.objectIds) as number;
      if (externalDependents > 0) throw persistenceError("MIGRATION_UNDO_DEPENDENCY_EXISTS", "其他对象已归属于本批对象；拒绝删除仍被引用的 Owner。");
      this.database.prepare(`DELETE FROM primary_ownerships WHERE child_object_id IN (${placeholders})`).run(...batch.objectIds);
      this.database.prepare(`DELETE FROM focus_selections WHERE object_id IN (${placeholders})`).run(...batch.objectIds);
      this.database.prepare(`DELETE FROM anchors WHERE object_id IN (${placeholders})`).run(...batch.objectIds);
      const audit = this.database.prepare(`
        INSERT INTO audit_events(trace_id, actor, command_name, object_id, before_version, after_version, occurred_at)
        VALUES (?, 'migration-cli', 'undo_v1_migration', ?, ?, 0, ?)
      `);
      for (const objectId of batch.objectIds) {
        const object = this.getObject(objectId)!;
        audit.run(`migration-undo:${batchId}`, objectId, object.version, at);
      }
      this.database.prepare(`DELETE FROM objects WHERE object_id IN (${placeholders})`).run(...batch.objectIds);
      this.database.prepare(`UPDATE legacy_evidence SET target_object_id = NULL WHERE run_id = ? AND legacy_object_id IN (${placeholders})`).run(runId, ...batch.objectIds);
      this.database.prepare("UPDATE migration_batches SET status = 'UNDONE', updated_at = ? WHERE batch_id = ?").run(at, batchId);
      const remaining = this.database.prepare("SELECT count(*) AS count FROM legacy_evidence WHERE run_id = ? AND target_object_id IS NOT NULL").pluck().get(runId) as number;
      this.database.prepare("UPDATE migration_runs SET status = ?, updated_at = ? WHERE run_id = ?").run(remaining > 0 ? "IMPORTING" : "PREVIEWED", at, runId);
      return this.migrationBatch(runId, batchId)!;
    });
    return this.executeWrite(write);
  }

  activateMigrationRun(runId: string, at: string): V2MigrationRun {
    const write = this.database.transaction(() => {
      const run = this.migrationRun(runId);
      if (!run) throw persistenceError("MIGRATION_RUN_NOT_FOUND", "找不到 Migration Run。");
      if (run.status === "ACTIVATED") return run;
      if (run.status !== "VERIFIED") throw persistenceError("MIGRATION_RUN_NOT_VERIFIED", "Migration Run 尚未完成全部导入与验证。");
      const another = this.database.prepare("SELECT run_id FROM migration_runs WHERE status = 'ACTIVATED' AND run_id <> ?").pluck().get(runId) as string | undefined;
      if (another) throw persistenceError("MIGRATION_ACTIVATION_ALREADY_EXISTS", "另一个 Migration Run 已激活；拒绝形成第二权威。");
      const incomplete = this.database.prepare(`
        SELECT count(*) AS count FROM legacy_evidence
        WHERE run_id = ? AND json_extract(mapping_json, '$.decision.action') = 'IMPORT' AND target_object_id IS NULL
      `).pluck().get(runId) as number;
      const invalidBatches = this.database.prepare("SELECT count(*) AS count FROM migration_batches WHERE run_id = ? AND status IN ('PREPARED','IMPORTED','FAILED')").pluck().get(runId) as number;
      if (incomplete > 0 || invalidBatches > 0) throw persistenceError("MIGRATION_ACTIVATION_INCOMPLETE", "Migration Run 仍有未导入对象或未验证批次。");
      this.database.prepare("UPDATE migration_runs SET status = 'ACTIVATED', updated_at = ? WHERE run_id = ?").run(at, runId);
      return this.migrationRun(runId)!;
    });
    return this.executeWrite(write);
  }

  private migrationProjectionChecksum(objectId: string): string {
    const object = this.getObject(objectId);
    if (!object) return checksum({ objectId, missing: true });
    const anchors = this.database.prepare(`
      SELECT anchor_id AS anchorId, object_id AS objectId, graph_id AS graphId, external_id AS externalId,
             role, status, content_hash AS contentHash, last_seen_at AS lastSeenAt
      FROM anchors WHERE object_id = ? ORDER BY anchor_id
    `).all(objectId);
    const ownership = this.database.prepare(`
      SELECT child_object_id AS childObjectId, owner_object_id AS ownerObjectId, assigned_at AS assignedAt
      FROM primary_ownerships WHERE child_object_id = ?
    `).get(objectId) ?? null;
    const associations = this.database.prepare(`
      SELECT association_id AS associationId, source_object_id AS sourceObjectId, target_object_id AS targetObjectId,
             association_kind AS associationKind, status, created_at AS createdAt, updated_at AS updatedAt
      FROM associations WHERE source_object_id = ? OR target_object_id = ? ORDER BY association_id
    `).all(objectId, objectId);
    const focus = this.database.prepare("SELECT object_id AS objectId, selected_at AS selectedAt, rank, expires_at AS expiresAt FROM focus_selections WHERE object_id = ?").get(objectId) ?? null;
    return checksum({ object, anchors, ownership, associations, focus });
  }

  private executeWrite<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") {
        throw persistenceError("V2_DATABASE_LOCKED", "SQLite 当前被另一个写事务占用；没有正式变化被提交。", { sqliteCode: code });
      }
      throw error;
    }
  }

  private requireIdempotencyKey(value: string): void {
    if (!value.trim()) throw persistenceError("V2_IDEMPOTENCY_KEY_REQUIRED", "正式写入必须包含 idempotency key。");
  }

  private receipt(idempotencyKey: string): { command_name: string; result_json: string } | undefined {
    return this.database.prepare("SELECT command_name, result_json FROM command_receipts WHERE idempotency_key = ?").get(idempotencyKey) as
      | { command_name: string; result_json: string }
      | undefined;
  }

  private candidateReceipt(idempotencyKey: string, commandName: string): V2Candidate | undefined {
    const receipt = this.receipt(idempotencyKey);
    if (!receipt) return undefined;
    if (receipt.command_name !== commandName) throw persistenceError("V2_IDEMPOTENCY_KEY_CONFLICT", "idempotency key 已用于另一种命令。");
    return JSON.parse(receipt.result_json) as V2Candidate;
  }

  private writeCandidateReceipt(idempotencyKey: string, commandName: string, candidate: V2Candidate, createdAt: string): void {
    this.database.prepare("INSERT INTO command_receipts(idempotency_key, command_name, result_json, created_at) VALUES (?, ?, ?, ?)")
      .run(idempotencyKey, commandName, stableJson(candidate), createdAt);
  }

  private insertCandidate(candidate: V2Candidate): void {
    this.database.prepare(`INSERT INTO candidates(
      candidate_id, source_anchor_id, source_version, candidate_kind, reason, suggestion, disposition,
      disposition_reason, deferred_until, active_proposal_id, last_analyzed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(candidate.candidateId, candidate.sourceAnchorId, candidate.sourceVersion, candidate.candidateKind,
        candidate.reason, candidate.suggestion, candidate.disposition, candidate.dispositionReason ?? null,
        candidate.deferredUntil ?? null, candidate.activeProposalId ?? null, candidate.lastAnalyzedAt,
        candidate.createdAt, candidate.updatedAt);
  }

  private mapCandidate(row: CandidateRow): V2Candidate {
    return {
      candidateId: row.candidate_id,
      sourceAnchorId: row.source_anchor_id,
      sourceVersion: row.source_version,
      candidateKind: row.candidate_kind,
      reason: row.reason,
      suggestion: row.suggestion,
      disposition: row.disposition,
      ...(row.disposition_reason ? { dispositionReason: row.disposition_reason } : {}),
      ...(row.deferred_until ? { deferredUntil: row.deferred_until } : {}),
      ...(row.active_proposal_id ? { activeProposalId: row.active_proposal_id } : {}),
      lastAnalyzedAt: row.last_analyzed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private requireVersion(objectId: string, expectedVersion: number): void {
    const existing = this.database.prepare("SELECT version FROM objects WHERE object_id = ?").get(objectId) as
      | { version: number }
      | undefined;
    const actualVersion = existing?.version ?? 0;
    if (actualVersion !== expectedVersion) {
      throw persistenceError("V2_OBJECT_VERSION_CONFLICT", "SQLite 对象版本与命令前置条件不一致。", {
        objectId,
        expectedVersion,
        actualVersion,
      });
    }
  }

  private writeObject(object: V2ManagedObject): void {
    this.database
      .prepare(`
        INSERT INTO objects(object_id, object_type, version, lifecycle, condition_json, due_at, closure_json, project_structure_json, text, created_at, updated_at, source_event)
        VALUES (@objectId, @objectType, @version, @lifecycle, @conditionJson, @dueAt, @closureJson, @projectStructureJson, @text, @createdAt, @updatedAt, @sourceEvent)
        ON CONFLICT(object_id) DO UPDATE SET
          object_type = excluded.object_type,
          version = excluded.version,
          lifecycle = excluded.lifecycle,
          condition_json = excluded.condition_json,
          due_at = excluded.due_at,
          closure_json = excluded.closure_json,
          project_structure_json = excluded.project_structure_json,
          text = excluded.text,
          updated_at = excluded.updated_at,
          source_event = excluded.source_event
      `)
      .run({
        objectId: object.objectId,
        objectType: object.objectType,
        version: object.version,
        lifecycle: object.lifecycle,
        conditionJson: stableJson(object.condition),
        dueAt: object.dueAt ?? null,
        closureJson: object.closure ? stableJson(object.closure) : null,
        projectStructureJson: object.projectStructure ? stableJson(object.projectStructure) : null,
        text: object.text,
        createdAt: object.createdAt,
        updatedAt: object.updatedAt,
        sourceEvent: object.sourceOrCreationEvent,
      });
    if (object.lifecycle !== "OPEN") this.database.prepare("DELETE FROM focus_selections WHERE object_id = ?").run(object.objectId);
  }

  private writeAudit(audit: V2AuditRecord): void {
    this.database
      .prepare(`
        INSERT INTO audit_events(trace_id, actor, command_name, object_id, before_version, after_version, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(audit.traceId, audit.actor, audit.command, audit.objectId, audit.beforeVersion, audit.afterVersion, audit.occurredAt);
  }

  private writeReceipt(idempotencyKey: string, audit: V2AuditRecord, result: unknown): void {
    this.database
      .prepare("INSERT INTO command_receipts(idempotency_key, command_name, result_json, created_at) VALUES (?, ?, ?, ?)")
      .run(idempotencyKey, audit.command, stableJson(result), audit.occurredAt);
  }

  auditEventCount(): number {
    return (this.database.prepare("SELECT count(*) AS count FROM audit_events").get() as { count: number }).count;
  }

  getObject(objectId: string): V2ManagedObject | undefined {
    const row = this.database.prepare("SELECT * FROM objects WHERE object_id = ?").get(objectId) as ObjectRow | undefined;
    if (!row) return undefined;
    return {
      objectId: row.object_id,
      objectType: row.object_type,
      version: row.version,
      lifecycle: row.lifecycle,
      condition: JSON.parse(row.condition_json) as V2ManagedObject["condition"],
      ...(row.due_at ? { dueAt: row.due_at } : {}),
      ...(row.closure_json ? { closure: JSON.parse(row.closure_json) as NonNullable<V2ManagedObject["closure"]> } : {}),
      ...(row.project_structure_json ? { projectStructure: JSON.parse(row.project_structure_json) as NonNullable<V2ManagedObject["projectStructure"]> } : {}),
      text: row.text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceOrCreationEvent: row.source_event,
    };
  }

  getPrimaryAnchorByExternal(graphId: string, externalId: string): V2Anchor | undefined {
    const row = this.database.prepare(`
      SELECT * FROM anchors
      WHERE graph_id = ? AND external_id = ? AND role = 'primary_text' AND status <> 'replaced'
    `).get(graphId, externalId) as Record<string, unknown> | undefined;
    return row ? this.mapAnchor(row) : undefined;
  }

  getPrimaryAnchorById(anchorId: string): V2Anchor | undefined {
    const row = this.database.prepare("SELECT * FROM anchors WHERE anchor_id = ? AND role = 'primary_text'").get(anchorId) as Record<string, unknown> | undefined;
    return row ? this.mapAnchor(row) : undefined;
  }

  getActivePrimaryAnchorByObject(objectId: string): V2Anchor | undefined {
    const row = this.database.prepare("SELECT * FROM anchors WHERE object_id = ? AND role = 'primary_text' AND status = 'active'").get(objectId) as Record<string, unknown> | undefined;
    return row ? this.mapAnchor(row) : undefined;
  }

  listPrimaryAnchors(graphId: string, afterExternalId?: string, limit = 257, includeReplaced = false): V2Anchor[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_001) {
      throw persistenceError("V2_ANCHOR_QUERY_LIMIT_INVALID", "Primary Anchor 查询上限无效。");
    }
    const rows = this.database.prepare(`
      SELECT * FROM anchors
      WHERE graph_id = ? AND role = 'primary_text' AND (? = 1 OR status <> 'replaced')
        AND (? IS NULL OR external_id > ?)
      ORDER BY external_id ASC, anchor_id ASC
      LIMIT ?
    `).all(graphId, includeReplaced ? 1 : 0, afterExternalId ?? null, afterExternalId ?? null, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapAnchor(row));
  }

  private mapAnchor(row: Record<string, unknown>): V2Anchor {
    return {
      anchorId: String(row.anchor_id),
      objectId: String(row.object_id),
      graphId: String(row.graph_id),
      externalId: String(row.external_id),
      role: "primary_text",
      status: String(row.status) as V2Anchor["status"],
      contentHash: String(row.content_hash),
      lastSeenAt: String(row.last_seen_at),
    };
  }

  listObjects(): V2ManagedObject[] {
    const rows = this.database.prepare("SELECT * FROM objects ORDER BY updated_at DESC, object_id ASC").all() as ObjectRow[];
    return rows.map((row) => ({
      objectId: row.object_id,
      objectType: row.object_type,
      version: row.version,
      lifecycle: row.lifecycle,
      condition: JSON.parse(row.condition_json) as V2ManagedObject["condition"],
      ...(row.due_at ? { dueAt: row.due_at } : {}),
      ...(row.closure_json ? { closure: JSON.parse(row.closure_json) as NonNullable<V2ManagedObject["closure"]> } : {}),
      ...(row.project_structure_json ? { projectStructure: JSON.parse(row.project_structure_json) as NonNullable<V2ManagedObject["projectStructure"]> } : {}),
      text: row.text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceOrCreationEvent: row.source_event,
    }));
  }

  listPrimaryOwnerships(): V2PrimaryOwnership[] {
    return (this.database.prepare("SELECT child_object_id, owner_object_id, assigned_at FROM primary_ownerships ORDER BY owner_object_id, child_object_id").all() as Array<{ child_object_id: string; owner_object_id: string; assigned_at: string }>).map((row) => ({
      childObjectId: row.child_object_id,
      ownerObjectId: row.owner_object_id,
      assignedAt: row.assigned_at,
    }));
  }

  listAssociations(): V2Association[] {
    return (this.database.prepare("SELECT * FROM associations ORDER BY source_object_id, target_object_id, association_id").all() as Array<Record<string, unknown>>).map((row) => ({
      associationId: String(row.association_id), sourceObjectId: String(row.source_object_id), targetObjectId: String(row.target_object_id),
      associationKind: "RELATED", status: "ACTIVE", createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }));
  }

  doctor(): SqliteDoctorReport {
    const integrity = this.database.pragma("integrity_check", { simple: true }) as string;
    const foreignKeyViolations = (this.database.pragma("foreign_key_check") as unknown[]).length;
    const objectCount = (this.database.prepare("SELECT count(*) AS count FROM objects").get() as { count: number }).count;
    return {
      status: integrity === "ok" && foreignKeyViolations === 0 ? "PASS" : "FAIL",
      schemaVersion: this.database.pragma("user_version", { simple: true }) as number,
      integrity,
      foreignKeyViolations,
      objectCount,
    };
  }

  operationalDiagnostics(): SqliteOperationalDiagnostics {
    const count = (sql: string): number => (this.database.prepare(sql).get() as { count: number }).count;
    return {
      missingAnchorCount: count("SELECT count(*) AS count FROM anchors WHERE role = 'primary_text' AND status = 'missing'"),
      conflictAnchorCount: count("SELECT count(*) AS count FROM anchors WHERE role = 'primary_text' AND status = 'conflict'"),
      multiplePrimaryAnchorObjectCount: count("SELECT count(*) AS count FROM (SELECT object_id FROM anchors WHERE role = 'primary_text' AND status <> 'replaced' GROUP BY object_id HAVING count(*) > 1)"),
      staleProposalCount: count("SELECT count(*) AS count FROM proposals WHERE status = 'STALE'"),
      pendingCommitCount: count("SELECT count(*) AS count FROM semantic_commits WHERE status = 'PENDING'"),
      recoveryRequiredCommitCount: count("SELECT count(*) AS count FROM semantic_commits WHERE status = 'RECOVERY_REQUIRED'"),
      invalidIdentityCount: count("SELECT count(*) AS count FROM objects WHERE length(trim(object_id)) = 0 OR length(trim(object_type)) = 0"),
    };
  }

  async backup(destination: string): Promise<string> {
    const absolute = resolve(destination);
    await mkdir(dirname(absolute), { recursive: true });
    try {
      await access(absolute);
      throw persistenceError("V2_BACKUP_DESTINATION_EXISTS", "Backup 目标已存在，拒绝覆盖。", { destination: absolute });
    } catch (error) {
      if (error instanceof StructuredError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await this.database.backup(temporary);
      await chmod(temporary, 0o600);
      await link(temporary, absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw persistenceError("V2_BACKUP_DESTINATION_EXISTS", "Backup 目标已存在，拒绝覆盖。", { destination: absolute });
      }
      throw persistenceError("V2_BACKUP_FAILED", "SQLite Backup 创建失败。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await rm(temporary, { force: true });
    }
    return absolute;
  }

  static validateBackup(path: string, expectedGraphId: string): SqliteDoctorReport {
    const absolute = resolve(path);
    let database: Database.Database | undefined;
    try {
      database = new Database(absolute, { readonly: true, fileMustExist: true });
      database.pragma("foreign_keys = ON");
      const schemaVersion = database.pragma("user_version", { simple: true }) as number;
      if (schemaVersion !== V2_DATABASE_SCHEMA_VERSION) {
        throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "Backup schema 版本不受支持。", { schemaVersion });
      }
      const graph = database.prepare("SELECT value FROM schema_meta WHERE key = 'graph_id'").get() as { value: string } | undefined;
      if (!graph || graph.value !== expectedGraphId) {
        throw persistenceError("V2_GRAPH_ID_MISMATCH", "Backup 属于另一个 Graph，拒绝恢复。", {
          expectedGraphId,
          actualGraphId: graph?.value,
        });
      }
      requireCompleteMigrationHistory(database);
      const integrity = database.pragma("integrity_check", { simple: true }) as string;
      const foreignKeyViolations = (database.pragma("foreign_key_check") as unknown[]).length;
      const objectCount = (database.prepare("SELECT count(*) AS count FROM objects").get() as { count: number }).count;
      return {
        status: integrity === "ok" && foreignKeyViolations === 0 ? "PASS" : "FAIL",
        schemaVersion,
        integrity,
        foreignKeyViolations,
        objectCount,
      };
    } catch (error) {
      if (error instanceof StructuredError) throw error;
      throw persistenceError("V2_BACKUP_VALIDATION_FAILED", "Backup 无法以只读方式通过校验。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      database?.close();
    }
  }

  /**
   * Replaces a closed database from a validated snapshot. The owning Service must
   * stop accepting requests and close its live store before calling this method.
   */
  static async restoreOffline(
    databasePath: string,
    backupPath: string,
    recoveryPath: string,
    expectedGraphId: string,
    options: SqliteRestoreOptions = {},
  ): Promise<SqliteRestoreResult> {
    const active = resolve(databasePath);
    const source = resolve(backupPath);
    const recovery = resolve(recoveryPath);
    if (active === source || active === recovery || source === recovery) {
      throw persistenceError("V2_RESTORE_PATH_COLLISION", "Restore 的主库、快照和恢复点必须是三个不同文件。");
    }
    try {
      await access(active);
    } catch {
      throw persistenceError("V2_RESTORE_ACTIVE_MISSING", "Restore 前必须存在可恢复的当前主库。");
    }
    const sourceValidation = V2SqliteStore.validateBackup(source, expectedGraphId);
    if (sourceValidation.status !== "PASS") throw persistenceError("V2_BACKUP_VALIDATION_FAILED", "Restore 快照未通过 Doctor。");

    const current = await V2SqliteStore.open(active);
    try {
      current.initialize(expectedGraphId);
      await current.backup(recovery);
    } finally {
      current.close();
    }
    const recoveryValidation = V2SqliteStore.validateBackup(recovery, expectedGraphId);
    if (recoveryValidation.status !== "PASS") throw persistenceError("V2_RESTORE_RECOVERY_POINT_INVALID", "Restore 前恢复点未通过 Doctor。");
    await options.afterRecoveryPoint?.();

    const staged = `${active}.restore-${process.pid}-${randomUUID()}`;
    const displaced = `${active}.previous-${process.pid}-${randomUUID()}`;
    let displacedActive = false;
    try {
      await copyFile(source, staged, constants.COPYFILE_EXCL);
      await chmod(staged, 0o600);
      V2SqliteStore.validateBackup(staged, expectedGraphId);
      await rm(`${active}-wal`, { force: true });
      await rm(`${active}-shm`, { force: true });
      await rename(active, displaced);
      displacedActive = true;
      await rename(staged, active);
      options.afterActivate?.();
      const validation = V2SqliteStore.validateBackup(active, expectedGraphId);
      if (validation.status !== "PASS") throw persistenceError("V2_RESTORE_VALIDATION_FAILED", "Restore 后 Doctor 未通过。");
      await rm(displaced, { force: true });
      displacedActive = false;
      return { restoredFrom: source, recoveryPath: recovery, validation };
    } catch (error) {
      if (displacedActive) {
        try {
          options.beforeRollback?.();
          await rm(active, { force: true });
          await rename(displaced, active);
          displacedActive = false;
        } catch (rollbackError) {
          throw persistenceError("V2_RESTORE_ROLLBACK_FAILED", "SQLite Restore 失败且主库回滚未完成；已保留 Restore 前恢复点，必须停止服务人工恢复。", {
            cause: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      if (error instanceof StructuredError) throw error;
      throw persistenceError("V2_RESTORE_FAILED", "SQLite Restore 失败；已恢复原主库。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await rm(staged, { force: true });
    }
  }

  close(): void {
    this.database.close();
  }
}
