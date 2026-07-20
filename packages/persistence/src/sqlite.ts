import { randomUUID } from "node:crypto";
import { access, chmod, link, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import type {
  V2AnchorCommand,
  V2AnchorCommandResult,
  V2AuditRecord,
  V2CommandReceipt,
  V2ObjectCommand,
  V2ObjectCommandResult,
  V2OwnershipCommand,
  V2OwnershipCommandResult,
} from "@task-copilot/application";
import type { V2Anchor, V2ManagedObject, V2PrimaryOwnership } from "@task-copilot/domain";
import { StructuredError, stableJson } from "@task-copilot/shared";

export const V2_DATABASE_SCHEMA_VERSION = 2;

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
    if (fromVersion !== 1 || V2_DATABASE_SCHEMA_VERSION !== 2) {
      throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "SQLite schema 没有可用的受控迁移路径。", { fromVersion });
    }
    const createdAt = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'created_at'").pluck().get() as string | undefined;
    if (!createdAt) throw persistenceError("V2_DATABASE_META_CORRUPT", "SQLite schema metadata 缺少 created_at。");
    const migration = this.database.transaction(() => {
      this.database.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY CHECK (version >= 1),
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL
        ) STRICT;
      `);
      const insert = this.database.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)");
      insert.run(1, schemaMigrationNames.get(1), createdAt);
      insert.run(2, schemaMigrationNames.get(2), at.toISOString());
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

  getCommandReceipt(idempotencyKey: string): V2CommandReceipt | undefined {
    const receipt = this.receipt(idempotencyKey);
    if (!receipt) return undefined;
    const command = receipt.command_name as V2CommandReceipt["command"];
    const result = JSON.parse(receipt.result_json) as unknown;
    if (command === "create_object" || command === "transition_lifecycle") {
      return { command, object: result as V2ManagedObject };
    }
    if (command === "bind_primary_anchor") {
      const value = result as { object: V2ManagedObject; anchor: V2Anchor };
      return { command, ...value };
    }
    if (command === "assign_primary_owner") {
      const value = result as { object: V2ManagedObject; ownership: V2PrimaryOwnership };
      return { command, ...value };
    }
    throw persistenceError("V2_COMMAND_RECEIPT_CORRUPT", "SQLite command receipt 类型未知。", { command });
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

  close(): void {
    this.database.close();
  }
}
