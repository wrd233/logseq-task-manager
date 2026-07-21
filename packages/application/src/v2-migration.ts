import {
  materializeReviewedLegacyObject,
  resolveLegacyMigrationDecision,
  assignV2PrimaryOwner,
  type LegacyMigrationPreview,
  type LegacyMigrationReviewDecision,
  type ResolvedLegacyMigrationDecision,
  type V2Anchor,
  type V2ManagedObject,
  type V2PrimaryOwnership,
} from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export type V2MigrationRunStatus = "PREVIEWED" | "IMPORTING" | "VERIFIED" | "ACTIVATED" | "FAILED" | "CANCELLED";
export type V2MigrationBatchStatus = "PREPARED" | "IMPORTED" | "VERIFIED" | "UNDONE" | "FAILED";

export interface V2MigrationRun {
  runId: string;
  sourceBundleSha256: string;
  sourceCreatedAt: string;
  status: V2MigrationRunStatus;
  summary: { total: number; import: number; keepOrdinary: number; defer: number; exclude: number };
  snapshotBackupId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface V2LegacyMigrationEvidence {
  runId: string;
  legacyObjectId: string;
  sourceHash: string;
  preview: LegacyMigrationPreview;
  decision: ResolvedLegacyMigrationDecision;
  targetObjectId?: string;
}

export interface V2MigrationBatch {
  batchId: string;
  runId: string;
  idempotencyKey: string;
  sourceHash: string;
  status: V2MigrationBatchStatus;
  objectIds: string[];
  importedCount: number;
  validation?: { status: "PASS"; objectCount: number; checksum: string };
  inverse?: { commandChecksum: string; objects: Array<{ objectId: string; checksum: string }> };
  createdAt: string;
  updatedAt: string;
}

export interface V2MigrationPreviewCommand {
  run: V2MigrationRun;
  evidence: V2LegacyMigrationEvidence[];
}

export interface V2MigrationBatchCommand {
  batch: V2MigrationBatch;
  snapshotBackupId: string;
  objects: V2ManagedObject[];
  anchors: V2Anchor[];
  ownerships: V2PrimaryOwnership[];
  actor: string;
  traceId: string;
}

export interface V2MigrationRepository {
  createMigrationPreview(command: V2MigrationPreviewCommand): { run: V2MigrationRun; replayed: boolean } | Promise<{ run: V2MigrationRun; replayed: boolean }>;
  migrationRun(runId: string): V2MigrationRun | undefined | Promise<V2MigrationRun | undefined>;
  migrationEvidence(runId: string): V2LegacyMigrationEvidence[] | Promise<V2LegacyMigrationEvidence[]>;
  getObject(objectId: string): V2ManagedObject | undefined | Promise<V2ManagedObject | undefined>;
  commitMigrationBatch(command: V2MigrationBatchCommand): { batch: V2MigrationBatch; replayed: boolean } | Promise<{ batch: V2MigrationBatch; replayed: boolean }>;
  verifyMigrationBatch(runId: string, batchId: string, at: string): V2MigrationBatch | Promise<V2MigrationBatch>;
  undoMigrationBatch(runId: string, batchId: string, at: string): V2MigrationBatch | Promise<V2MigrationBatch>;
  activateMigrationRun(runId: string, at: string): V2MigrationRun | Promise<V2MigrationRun>;
}

export interface ReviewedMigrationPreviewInput {
  sourceBundleSha256: string;
  sourceCreatedAt: string;
  previews: LegacyMigrationPreview[];
  decisions: LegacyMigrationReviewDecision[];
}

export interface LegacyMigrationImportSource {
  object: { objectId: string; text: string; createdAt: string; updatedAt: string };
  anchors: V2Anchor[];
  ownership?: V2PrimaryOwnership;
}

function migrationError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-189", "D-190", "D-193", "D-199", "D-208"] });
}

function requireBoundedIdentifier(value: string, code: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw migrationError(code, `${label} 必须是 1 到 128 个安全字符。`);
  }
  return normalized;
}

function validateImportSource(source: LegacyMigrationImportSource, scopedIds: ReadonlySet<string>): void {
  const objectId = source.object.objectId;
  if (!scopedIds.has(objectId)) throw migrationError("MIGRATION_BATCH_SOURCE_OUT_OF_SCOPE", `Migration source ${objectId} 不在本批范围。`);
  const anchorIds = new Set<string>();
  let activePrimaryCount = 0;
  for (const anchor of source.anchors) {
    if (anchor.objectId !== objectId || !anchor.anchorId.trim() || !anchor.graphId.trim() || !anchor.externalId.trim() || !anchor.contentHash.trim()) {
      throw migrationError("MIGRATION_BATCH_ANCHOR_INVALID", `Migration item ${objectId} 的 Anchor 身份或内容证据无效。`);
    }
    if (anchorIds.has(anchor.anchorId)) throw migrationError("MIGRATION_BATCH_ANCHOR_DUPLICATE", `Migration item ${objectId} 包含重复 Anchor。`);
    anchorIds.add(anchor.anchorId);
    if (anchor.role === "primary_text" && anchor.status === "active") activePrimaryCount += 1;
  }
  if (activePrimaryCount > 1) throw migrationError("MIGRATION_BATCH_PRIMARY_ANCHOR_CONFLICT", `Migration item ${objectId} 不能导入多个 active Primary Anchor。`);
  if (source.ownership && source.ownership.childObjectId !== objectId) {
    throw migrationError("MIGRATION_BATCH_OWNERSHIP_INVALID", `Migration item ${objectId} 的 Primary Ownership 不属于该对象。`);
  }
}

export class V2MigrationApplication {
  constructor(private readonly repository: V2MigrationRepository) {}

  async reviewPreview(input: ReviewedMigrationPreviewInput, at = new Date()): Promise<{ run: V2MigrationRun; replayed: boolean }> {
    if (!/^[0-9a-f]{64}$/.test(input.sourceBundleSha256) || !Number.isFinite(Date.parse(input.sourceCreatedAt))) throw migrationError("MIGRATION_PREVIEW_SOURCE_INVALID", "Migration Preview 缺少受支持的源 hash 或时间。");
    const previews = new Map(input.previews.map((preview) => [preview.legacyObjectId, preview]));
    const decisions = new Map(input.decisions.map((decision) => [decision.legacyObjectId, decision]));
    if (previews.size !== input.previews.length || decisions.size !== input.decisions.length || previews.size !== decisions.size || [...previews.keys()].some((id) => !decisions.has(id))) {
      throw migrationError("MIGRATION_PREVIEW_DECISIONS_INCOMPLETE", "每条迁移 Preview 必须有且只有一个审阅决定。");
    }
    const evidence = [...previews.values()].sort((left, right) => left.legacyObjectId.localeCompare(right.legacyObjectId)).map((preview) => {
      if (preview.sourceBundleSha256 !== input.sourceBundleSha256) throw migrationError("MIGRATION_PREVIEW_SOURCE_MISMATCH", "Preview 与源 Bundle hash 不一致。");
      let decision: ResolvedLegacyMigrationDecision;
      try { decision = resolveLegacyMigrationDecision(preview, decisions.get(preview.legacyObjectId)!); }
      catch (error) { throw migrationError("MIGRATION_REVIEW_DECISION_INVALID", error instanceof Error ? error.message : "Migration review decision is invalid."); }
      return { runId: `migration-run:${input.sourceBundleSha256.slice(0, 32)}`, legacyObjectId: preview.legacyObjectId, sourceHash: input.sourceBundleSha256, preview, decision };
    });
    const count = (action: ResolvedLegacyMigrationDecision["action"]): number => evidence.filter(({ decision }) => decision.action === action).length;
    const timestamp = at.toISOString();
    return this.repository.createMigrationPreview({
      run: {
        runId: `migration-run:${input.sourceBundleSha256.slice(0, 32)}`,
        sourceBundleSha256: input.sourceBundleSha256,
        sourceCreatedAt: input.sourceCreatedAt,
        status: "PREVIEWED",
        summary: { total: evidence.length, import: count("IMPORT"), keepOrdinary: count("KEEP_ORDINARY"), defer: count("DEFER"), exclude: count("EXCLUDE") },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      evidence,
    });
  }

  async importBatch(input: {
    runId: string;
    sourceBundleSha256: string;
    snapshotBackupId: string;
    objectIds: string[];
    sources: LegacyMigrationImportSource[];
    idempotencyKey: string;
    actor: string;
    traceId: string;
  }, at = new Date()): Promise<{ batch: V2MigrationBatch; replayed: boolean }> {
    if (input.objectIds.length < 1 || input.objectIds.length > 50 || new Set(input.objectIds).size !== input.objectIds.length) throw migrationError("MIGRATION_BATCH_SCOPE_INVALID", "Migration batch 必须包含 1 到 50 个唯一对象。");
    const snapshotBackupId = requireBoundedIdentifier(input.snapshotBackupId, "MIGRATION_SNAPSHOT_ID_INVALID", "Snapshot Backup ID");
    const idempotencyKey = requireBoundedIdentifier(input.idempotencyKey, "MIGRATION_IDEMPOTENCY_KEY_INVALID", "Idempotency Key");
    const actor = requireBoundedIdentifier(input.actor, "MIGRATION_ACTOR_INVALID", "Actor");
    const traceId = requireBoundedIdentifier(input.traceId, "MIGRATION_TRACE_ID_INVALID", "Trace ID");
    const run = await this.repository.migrationRun(input.runId);
    if (!run || run.sourceBundleSha256 !== input.sourceBundleSha256 || !["PREVIEWED", "IMPORTING"].includes(run.status)) throw migrationError("MIGRATION_RUN_NOT_IMPORTABLE", "Migration run 不存在、源已改变或当前状态不可导入。");
    const evidence = new Map((await this.repository.migrationEvidence(input.runId)).map((value) => [value.legacyObjectId, value]));
    const sources = new Map(input.sources.map((value) => [value.object.objectId, value]));
    if (sources.size !== input.sources.length || sources.size !== input.objectIds.length) throw migrationError("MIGRATION_BATCH_SOURCES_INVALID", "Migration batch 必须为每个对象提供且只提供一份源证据。");
    const scopedIds = new Set(input.objectIds);
    const objects: V2ManagedObject[] = [];
    const anchors: V2Anchor[] = [];
    const ownerships: V2PrimaryOwnership[] = [];
    for (const objectId of input.objectIds) {
      const item = evidence.get(objectId);
      const source = sources.get(objectId);
      if (!item || item.decision.action !== "IMPORT" || (item.targetObjectId && item.targetObjectId !== objectId) || !source) throw migrationError("MIGRATION_BATCH_ITEM_NOT_IMPORTABLE", `Migration item ${objectId} 未通过审阅、目标不一致或缺少源证据。`);
      validateImportSource(source, scopedIds);
      objects.push(materializeReviewedLegacyObject(item.preview, item.decision, source.object));
      anchors.push(...source.anchors);
      if (source.ownership) ownerships.push(source.ownership);
    }
    const importedObjects = new Map(objects.map((object) => [object.objectId, object]));
    for (const ownership of ownerships) {
      const child = importedObjects.get(ownership.childObjectId)!;
      const owner = importedObjects.get(ownership.ownerObjectId) ?? await this.repository.getObject(ownership.ownerObjectId);
      if (!owner) throw migrationError("MIGRATION_BATCH_OWNER_NOT_FOUND", `Primary Owner ${ownership.ownerObjectId} 不存在或不在本批范围。`);
      try {
        assignV2PrimaryOwner(child, owner, child.version, new Date(ownership.assignedAt));
      } catch (error) {
        throw migrationError("MIGRATION_BATCH_OWNERSHIP_INVALID", error instanceof Error ? error.message : "Migration ownership is invalid.");
      }
    }
    const timestamp = at.toISOString();
    const batchId = `migration-batch:${idempotencyKey}`;
    return this.repository.commitMigrationBatch({
      batch: { batchId, runId: input.runId, idempotencyKey, sourceHash: input.sourceBundleSha256, status: "PREPARED", objectIds: [...input.objectIds], importedCount: 0, createdAt: timestamp, updatedAt: timestamp },
      snapshotBackupId,
      objects,
      anchors,
      ownerships,
      actor,
      traceId,
    });
  }

  verifyBatch(runId: string, batchId: string, at = new Date()): Promise<V2MigrationBatch> {
    return Promise.resolve(this.repository.verifyMigrationBatch(runId, batchId, at.toISOString()));
  }

  undoBatch(runId: string, batchId: string, confirmation: string, at = new Date()): Promise<V2MigrationBatch> {
    if (confirmation !== "UNDO_MIGRATION_BATCH") throw migrationError("MIGRATION_UNDO_CONFIRMATION_REQUIRED", "Migration batch Undo 需要精确确认。");
    return Promise.resolve(this.repository.undoMigrationBatch(runId, batchId, at.toISOString()));
  }

  activate(runId: string, confirmation: string, at = new Date()): Promise<V2MigrationRun> {
    if (confirmation !== "ACTIVATE_V2_SQLITE") throw migrationError("MIGRATION_ACTIVATION_CONFIRMATION_REQUIRED", "V2 activation 需要精确确认。");
    return Promise.resolve(this.repository.activateMigrationRun(runId, at.toISOString()));
  }
}
