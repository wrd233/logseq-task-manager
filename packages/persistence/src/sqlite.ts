import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import type { V2ManagedObject } from "@task-copilot/domain";
import { StructuredError, stableJson } from "@task-copilot/shared";

export const V2_DATABASE_SCHEMA_VERSION = 1;

export interface SqliteDoctorReport {
  status: "PASS" | "FAIL";
  schemaVersion: number;
  integrity: string;
  foreignKeyViolations: number;
  objectCount: number;
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

export class V2SqliteStore {
  private constructor(
    private readonly database: Database.Database,
    readonly path: string,
  ) {}

  static async open(path: string): Promise<V2SqliteStore> {
    const absolute = resolve(path);
    await mkdir(dirname(absolute), { recursive: true });
    let database: Database.Database | undefined;
    try {
      database = new Database(absolute);
      database.pragma("foreign_keys = ON");
      database.pragma("journal_mode = WAL");
      database.pragma("busy_timeout = 3000");
    } catch (error) {
      database?.close();
      throw persistenceError("V2_DATABASE_OPEN_FAILED", "SQLite 数据库无法打开；原文件未被覆盖。", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    return new V2SqliteStore(database, absolute);
  }

  initialize(graphId: string, at = new Date()): { initialized: boolean; schemaVersion: number } {
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
      if (Number(storedSchema.value) !== V2_DATABASE_SCHEMA_VERSION) {
        throw persistenceError("V2_UNSUPPORTED_DATABASE_SCHEMA", "SQLite schema 版本不受支持。", {
          schemaVersion: storedSchema.value,
        });
      }
      if (storedGraph.value !== graphId) {
        throw persistenceError("V2_GRAPH_ID_MISMATCH", "SQLite 数据库属于另一个 Graph，拒绝复用。", {
          expectedGraphId: graphId,
          actualGraphId: storedGraph.value,
        });
      }
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
      `);
      const insertMeta = this.database.prepare("INSERT INTO schema_meta(key, value) VALUES (?, ?)");
      insertMeta.run("schema_version", String(V2_DATABASE_SCHEMA_VERSION));
      insertMeta.run("graph_id", graphId);
      insertMeta.run("created_at", at.toISOString());
      this.database.pragma(`user_version = ${V2_DATABASE_SCHEMA_VERSION}`);
    });
    createSchema();
    return { initialized: true, schemaVersion: V2_DATABASE_SCHEMA_VERSION };
  }

  putObject(object: V2ManagedObject, idempotencyKey: string, expectedVersion: number): V2ManagedObject {
    if (!idempotencyKey.trim()) throw persistenceError("V2_IDEMPOTENCY_KEY_REQUIRED", "正式写入必须包含 idempotency key。");
    const write = this.database.transaction(() => {
      const receipt = this.database.prepare("SELECT result_json FROM command_receipts WHERE idempotency_key = ?").get(idempotencyKey) as
        | { result_json: string }
        | undefined;
      if (receipt) return JSON.parse(receipt.result_json) as V2ManagedObject;

      const existing = this.database.prepare("SELECT version FROM objects WHERE object_id = ?").get(object.objectId) as
        | { version: number }
        | undefined;
      const actualVersion = existing?.version ?? 0;
      if (actualVersion !== expectedVersion) {
        throw persistenceError("V2_OBJECT_VERSION_CONFLICT", "SQLite 对象版本与命令前置条件不一致。", {
          objectId: object.objectId,
          expectedVersion,
          actualVersion,
        });
      }
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
      this.database
        .prepare("INSERT INTO command_receipts(idempotency_key, command_name, result_json, created_at) VALUES (?, ?, ?, ?)")
        .run(idempotencyKey, "put_object", stableJson(object), new Date().toISOString());
      return object;
    });
    return write();
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
    await this.database.backup(absolute);
    return absolute;
  }

  close(): void {
    this.database.close();
  }
}
