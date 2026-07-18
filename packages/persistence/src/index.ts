import { createEmptyState, type SystemState } from "@task-copilot/application";
import type { Anchor } from "@task-copilot/domain";
import { StructuredError, checksum, createId, stableJson } from "@task-copilot/shared";

export const CURRENT_SCHEMA_VERSION = 1;
const manifestKey = "task-copilot/state/manifest.json";

export type PersistedState = SystemState;
export { createEmptyState };

export interface BlobStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export class MemoryBlobStore implements BlobStore {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}

export class CorruptionError extends StructuredError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: "PERSISTENCE_CORRUPTION",
      message,
      ruleRefs: ["SYN-CON-001", "SYN-REC-001"],
      ...(details ? { details } : {}),
    });
    this.name = "CorruptionError";
  }
}

export class UnsupportedSchemaError extends StructuredError {
  constructor(schemaVersion: number) {
    super({
      code: "UNSUPPORTED_SCHEMA",
      message: `无法读取 schema_version=${schemaVersion}；Store 已进入只读保护。`,
      ruleRefs: ["SYN-REC-001"],
      details: { schemaVersion },
    });
    this.name = "UnsupportedSchemaError";
  }
}

interface StateManifest {
  schemaVersion: number;
  generation: number;
  activeSlot: "slot-a" | "slot-b";
  payloadChecksum: string;
  savedAt: string;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new CorruptionError(`${label} 不是合法 JSON。`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function isManifest(value: unknown): value is StateManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<StateManifest>;
  return (
    manifest.schemaVersion === CURRENT_SCHEMA_VERSION &&
    typeof manifest.generation === "number" &&
    (manifest.activeSlot === "slot-a" || manifest.activeSlot === "slot-b") &&
    typeof manifest.payloadChecksum === "string" &&
    typeof manifest.savedAt === "string"
  );
}

function normalizeState(value: unknown): PersistedState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const state = value as Partial<PersistedState>;
  if (typeof state.schemaVersion !== "number" || typeof state.revision !== "number") return undefined;
  const collections = ["objects", "captures", "relations", "anchors", "proposals", "commits", "events", "views", "artifacts"] as const;
  if (collections.some((key) => state[key] !== undefined && !Array.isArray(state[key]))) return undefined;
  const empty = createEmptyState();
  return structuredClone({
    ...state,
    objects: state.objects ?? empty.objects,
    captures: state.captures ?? empty.captures,
    relations: state.relations ?? empty.relations,
    anchors: state.anchors ?? empty.anchors,
    proposals: state.proposals ?? empty.proposals,
    commits: state.commits ?? empty.commits,
    events: state.events ?? empty.events,
    views: state.views ?? empty.views,
    artifacts: state.artifacts ?? empty.artifacts,
  }) as PersistedState;
}

export class VersionedStateRepository {
  constructor(private readonly blobs: BlobStore) {}

  async initialize(): Promise<{ state: PersistedState; initializedNewStore: boolean }> {
    const manifestText = await this.blobs.get(manifestKey);
    if (manifestText !== undefined) return { state: await this.load(), initializedNewStore: false };
    const state = await this.save(createEmptyState());
    return { state, initializedNewStore: true };
  }

  async load(): Promise<PersistedState> {
    const manifestText = await this.blobs.get(manifestKey);
    if (manifestText === undefined) return createEmptyState();
    const candidate = parseJson(manifestText, "State manifest");
    if (!candidate || typeof candidate !== "object" || typeof (candidate as { schemaVersion?: unknown }).schemaVersion !== "number") {
      throw new CorruptionError("State manifest 缺少 schema_version。");
    }
    const schemaVersion = (candidate as { schemaVersion: number }).schemaVersion;
    if (schemaVersion !== CURRENT_SCHEMA_VERSION) throw new UnsupportedSchemaError(schemaVersion);
    if (!isManifest(candidate)) throw new CorruptionError("State manifest 结构不完整。");
    const payloadKey = `task-copilot/state/${candidate.activeSlot}.json`;
    const payloadText = await this.blobs.get(payloadKey);
    if (!payloadText) throw new CorruptionError("Manifest 指向的 active payload 不存在。", { payloadKey });
    if (checksum(payloadText) !== candidate.payloadChecksum) {
      throw new CorruptionError("Active payload checksum 不匹配。", { payloadKey });
    }
    const candidateState = parseJson(payloadText, "State payload");
    if (candidateState && typeof candidateState === "object" && typeof (candidateState as { schemaVersion?: unknown }).schemaVersion === "number" && (candidateState as { schemaVersion: number }).schemaVersion !== CURRENT_SCHEMA_VERSION) {
      throw new UnsupportedSchemaError((candidateState as { schemaVersion: number }).schemaVersion);
    }
    const state = normalizeState(candidateState);
    if (!state) throw new CorruptionError("State payload 结构不完整。");
    return state;
  }

  async save(state: PersistedState, expectedRevision?: number): Promise<PersistedState> {
    const current = await this.load();
    if (expectedRevision !== undefined && current.revision !== expectedRevision) {
      throw new StructuredError({
        code: "STATE_VERSION_CONFLICT",
        message: `Store 版本已从 ${expectedRevision} 变为 ${current.revision}。`,
        ruleRefs: ["SYN-CON-001", "COM-ATM-001"],
      });
    }
    const existingManifestText = await this.blobs.get(manifestKey);
    const existing = existingManifestText ? parseJson(existingManifestText, "State manifest") : undefined;
    const activeSlot = isManifest(existing) && existing.activeSlot === "slot-a" ? "slot-b" : "slot-a";
    const generation = isManifest(existing) ? existing.generation + 1 : 1;
    const saved: PersistedState = structuredClone({
      ...state,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: current.revision + 1,
    });
    const payload = stableJson(saved);
    await this.blobs.set(`task-copilot/state/${activeSlot}.json`, payload);
    const manifest: StateManifest = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      generation,
      activeSlot,
      payloadChecksum: checksum(payload),
      savedAt: new Date().toISOString(),
    };
    await this.blobs.set(manifestKey, stableJson(manifest));
    return saved;
  }

  async backup(at = new Date()): Promise<{ backupId: string; state: PersistedState; checksum: string }> {
    const state = await this.load();
    return { backupId: createId("backup", at), state, checksum: checksum(state) };
  }
}

export interface RecoveryBundle {
  bundleVersion: 1;
  createdAt: string;
  files: Record<string, string>;
  checksums: Record<string, string>;
}

function jsonLines(values: readonly unknown[]): string {
  return values.map((value) => stableJson(value)).join("\n") + (values.length > 0 ? "\n" : "");
}

function markdownSummary(state: PersistedState): string {
  const lines = ["# Task Copilot 恢复摘要", "", `对象：${state.objects.length}`, `关系：${state.relations.length}`, `事件：${state.events.length}`, ""];
  for (const object of state.objects) {
    lines.push(`## ${object.text}`, "", `${object.objectType} · ${object.phase} · ${object.condition.kind}`, "");
  }
  return lines.join("\n");
}

function anchorReportMarkdown(anchors: readonly Anchor[]): string {
  const missing = anchors.filter((anchor) => anchor.status === "missing");
  const conflicts = anchors.filter((anchor) => anchor.status === "conflict");
  return [
    "# Anchor Report",
    "",
    `Active: ${anchors.filter((anchor) => anchor.status === "active").length}`,
    `Missing: ${missing.length}`,
    `Conflict: ${conflicts.length}`,
    "",
    ...missing.map((anchor) => `- MISSING ${anchor.anchorId} -> ${anchor.externalId}`),
    ...conflicts.map((anchor) => `- CONFLICT ${anchor.anchorId} -> ${anchor.externalId}`),
    "",
  ].join("\n");
}

export function exportRecoveryBundle(state: PersistedState, at = new Date()): RecoveryBundle {
  const files: Record<string, string> = {
    "schema.json": stableJson({ schemaVersion: CURRENT_SCHEMA_VERSION, bundleVersion: 1 }),
    "objects.jsonl": jsonLines(state.objects),
    "captures.jsonl": jsonLines(state.captures),
    "relations.jsonl": jsonLines(state.relations),
    "anchors.jsonl": jsonLines(state.anchors),
    "proposals.jsonl": jsonLines(state.proposals),
    "commits.jsonl": jsonLines(state.commits),
    "events.jsonl": jsonLines(state.events),
    "views.json": stableJson(state.views),
    "artifacts.jsonl": jsonLines(state.artifacts),
    "extensions.json": stableJson(state.extensions),
    "human-readable/summary.md": markdownSummary(state),
    "human-readable/anchor-report.md": anchorReportMarkdown(state.anchors),
  };
  return {
    bundleVersion: 1,
    createdAt: at.toISOString(),
    files,
    checksums: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, checksum(content)])),
  };
}

function parseJsonLines<T>(text: string, name: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new CorruptionError(`${name} 第 ${index + 1} 行不是合法 JSON。`, {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    });
}

export interface RestoreResult {
  state: PersistedState;
  anchorReport: { active: string[]; missing: string[]; conflicts: string[] };
  differences: string[];
}

export function restoreRecoveryBundle(bundle: RecoveryBundle): RestoreResult {
  if (bundle.bundleVersion !== 1) throw new UnsupportedSchemaError(bundle.bundleVersion);
  for (const [name, expected] of Object.entries(bundle.checksums)) {
    const content = bundle.files[name];
    if (content === undefined || checksum(content) !== expected) {
      throw new CorruptionError(`恢复包文件 ${name} 校验失败。`);
    }
  }
  const required = (name: string): string => {
    const value = bundle.files[name];
    if (value === undefined) throw new CorruptionError(`恢复包缺少 ${name}。`);
    return value;
  };
  const state: PersistedState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 0,
    objects: parseJsonLines(required("objects.jsonl"), "objects.jsonl"),
    captures: parseJsonLines(required("captures.jsonl"), "captures.jsonl"),
    relations: parseJsonLines(required("relations.jsonl"), "relations.jsonl"),
    anchors: parseJsonLines(required("anchors.jsonl"), "anchors.jsonl"),
    proposals: parseJsonLines(required("proposals.jsonl"), "proposals.jsonl"),
    commits: parseJsonLines(required("commits.jsonl"), "commits.jsonl"),
    events: parseJsonLines(required("events.jsonl"), "events.jsonl"),
    views: JSON.parse(required("views.json")) as Array<Record<string, unknown>>,
    artifacts: parseJsonLines(required("artifacts.jsonl"), "artifacts.jsonl"),
    extensions: JSON.parse(required("extensions.json")) as Record<string, unknown>,
  };
  const active = state.anchors.filter((anchor) => anchor.status === "active").map((anchor) => anchor.anchorId);
  const missing = state.anchors.filter((anchor) => anchor.status === "missing").map((anchor) => anchor.anchorId);
  const conflicts = state.anchors.filter((anchor) => anchor.status === "conflict").map((anchor) => anchor.anchorId);
  const roundTrip = exportRecoveryBundle(state, new Date(bundle.createdAt));
  const comparableFiles = ["objects.jsonl", "captures.jsonl", "relations.jsonl", "anchors.jsonl", "proposals.jsonl", "commits.jsonl", "events.jsonl"];
  const differences = comparableFiles.filter((name) => roundTrip.files[name] !== bundle.files[name]);
  return { state, anchorReport: { active, missing, conflicts }, differences };
}
