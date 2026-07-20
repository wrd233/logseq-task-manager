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
  V2AuditRecord,
  V2CommandReceipt,
  V2MaterializationCommand,
  V2ObjectCommand,
  V2ObjectCommandResult,
  V2OwnershipCommand,
  V2OwnershipCommandResult,
  V2SynchronizationCommand,
} from "@task-copilot/application";
import type { V2Anchor, V2ManagedObject, V2PrimaryOwnership } from "@task-copilot/domain";
import { StructuredError, stableJson } from "@task-copilot/shared";

export const V2_DATABASE_SCHEMA_VERSION = 3;

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
]);

export interface SqliteDoctorReport {
  status: "PASS" | "FAIL";
  schemaVersion: number;
  integrity: string;
  foreignKeyViolations: number;
  objectCount: number;
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
  /** Test-only fault boundary; production callers must omit it. */
  afterActivate?: () => void;
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

interface ObjectRow {
  object_id: string;
  object_type: V2ManagedObject["objectType"];
  version: number;
  lifecycle: V2ManagedObject["lifecycle"];
  condition_json: string;
  text: string;
  created_at: string;
  updated_at: string;
  source_event: string;
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
          text TEXT NOT NULL CHECK (length(trim(text)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          source_event TEXT NOT NULL
        ) STRICT;
        CREATE TABLE anchors (
          anchor_id TEXT PRIMARY KEY,
          object_id TEXT NOT NULL REFERENCES objects(object_id),
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
          object_id TEXT NOT NULL REFERENCES objects(object_id),
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
    if ((fromVersion !== 1 && fromVersion !== 2) || V2_DATABASE_SCHEMA_VERSION !== 3) {
      throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "SQLite schema 没有可用的受控迁移路径。", { fromVersion });
    }
    const createdAt = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'created_at'").pluck().get() as string | undefined;
    if (!createdAt) throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema metadata 缺少 created_at。");
    const migration = this.database.transaction(() => {
      if (fromVersion === 1) {
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
      } else {
        const history = readMigrationHistory(this.database);
        if (history.length !== 2 || history.some((record, index) => record.version !== index + 1 || record.name !== schemaMigrationNames.get(record.version))) {
          throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema migration ledger 与 v2 不一致。");
        }
      }
      this.database.exec(`
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
      `);
      this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
        .run(3, schemaMigrationNames.get(3), at.toISOString());
      this.database.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'").run(String(V2_DATABASE_SCHEMA_VERSION));
      this.database.pragma(`user_version = ${V2_DATABASE_SCHEMA_VERSION}`);
    });
    try {
      migration();
      requireCompleteMigrationHistory(this.database);
    } catch (error) {
      if (error instanceof StructuredError) throw error;
      throw persistenceError("V2_SCHEMA_MIGRATION_FAILED", "SQLite schema 迁移失败；本批变化已回滚。", {
        fromVersion,
        cause: error instanceof Error ? error.message : String(error),
      });
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
      if (receipt) return { object: JSON.parse(receipt.result_json) as V2ManagedObject, replayed: true };
      this.requireVersion(command.object.objectId, command.expectedVersion);
      this.writeObject(command.object);
      this.writeAudit(command.audit);
      this.writeReceipt(command.idempotencyKey, command.audit, command.object);
      return { object: command.object, replayed: false };
    });
    return this.executeWrite(write);
  }

  commitMaterialization(command: V2MaterializationCommand): V2AnchorCommandResult {
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
    if (command === "create_object" || command === "transition_lifecycle") {
      return { command, object: result as V2ManagedObject };
    }
    if (command === "materialize_explicit_object" || command === "synchronize_explicit_object" || command === "observe_primary_anchor" || command === "bind_primary_anchor") {
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
      VERIFIED: [],
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
      if (status === "FAILED" && steps.some((step) => step.status === "APPLIED" || step.status === "RECOVERY_REQUIRED")) {
        throw persistenceError("V2_SEMANTIC_COMMIT_NOT_COMPENSATED", "FAILED Commit 不能保留 APPLIED/RECOVERY_REQUIRED step。");
      }
      this.database.prepare(`
        UPDATE semantic_commits SET status = ?, after_state_checksum = ?, error_code = ?, updated_at = ?
        WHERE semantic_commit_id = ?
      `).run(status, afterStateChecksum ?? null, errorCode ?? null, updatedAt, semanticCommitId);
      return this.semanticCommit(semanticCommitId)!;
    });
    return this.executeWrite(write);
  }

  unresolvedSemanticCommits(): V2SemanticCommitLedgerRecord[] {
    return (this.database.prepare("SELECT * FROM semantic_commits WHERE status IN ('PENDING','RECOVERY_REQUIRED') ORDER BY created_at").all() as Record<string, unknown>[])
      .map((row) => this.mapSemanticCommit(row));
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
        INSERT INTO objects(object_id, object_type, version, lifecycle, condition_json, text, created_at, updated_at, source_event)
        VALUES (@objectId, @objectType, @version, @lifecycle, @conditionJson, @text, @createdAt, @updatedAt, @sourceEvent)
        ON CONFLICT(object_id) DO UPDATE SET
          object_type = excluded.object_type,
          version = excluded.version,
          lifecycle = excluded.lifecycle,
          condition_json = excluded.condition_json,
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
        text: object.text,
        createdAt: object.createdAt,
        updatedAt: object.updatedAt,
        sourceEvent: object.sourceOrCreationEvent,
      });
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
      text: row.text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceOrCreationEvent: row.source_event,
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
