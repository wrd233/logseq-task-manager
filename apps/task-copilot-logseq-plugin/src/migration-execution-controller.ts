import type {
  ServiceBackupCreated,
  ServiceLegacyMigrationScanReport,
  ServiceMigrationBatch,
  ServiceMigrationRun,
  ServiceMigrationRunDetails,
} from "@task-copilot/service-client";

import { MIGRATION_BUNDLE_MAX_BYTES } from "./migration-scan-controller.ts";

export interface MigrationExecutionClient {
  scanLegacyMigration(bundle: unknown): Promise<ServiceLegacyMigrationScanReport>;
  getMigrationRun(runId: string): Promise<ServiceMigrationRunDetails>;
  createBackup(): Promise<ServiceBackupCreated>;
  importLegacyMigration(runId: string, input: {
    bundle: unknown;
    backupId: string;
    objectIds: string[];
    idempotencyKey: string;
    confirmation: "IMPORT_REVIEWED_V1_BATCH";
  }): Promise<{ batch: ServiceMigrationBatch; replayed: boolean }>;
  verifyLegacyMigrationBatch(runId: string, batchId: string): Promise<ServiceMigrationBatch>;
  undoLegacyMigrationBatch(runId: string, batchId: string, confirmation: "UNDO_MIGRATION_BATCH"): Promise<ServiceMigrationBatch>;
  activateLegacyMigration(runId: string, confirmation: "ACTIVATE_V2_SQLITE"): Promise<ServiceMigrationRun>;
}

export interface PluginMigrationBatchView {
  token: string;
  status: ServiceMigrationBatch["status"];
  importedCount: number;
  validationObjectCount?: number;
  updatedAt: string;
}

export interface PluginMigrationRunView {
  token: string;
  status: ServiceMigrationRun["status"];
  summary: ServiceMigrationRun["summary"];
  createdAt: string;
  updatedAt: string;
  batches: PluginMigrationBatchView[];
}

export interface PluginMigrationImportItem {
  token: string;
  title: string;
  titleTruncated: boolean;
  sourceObjectType: string;
}

export interface PluginMigrationExecutionState {
  status:
    | "idle"
    | "selecting-material"
    | "loading-material"
    | "material-ready"
    | "creating-recovery-point"
    | "ready-to-import"
    | "importing"
    | "import-uncertain"
    | "imported"
    | "verifying"
    | "verified"
    | "undo-confirm"
    | "undoing"
    | "undo-uncertain"
    | "undone"
    | "activation-confirm"
    | "activating"
    | "activation-uncertain"
    | "activated"
    | "error";
  runToken?: string;
  batchToken?: string;
  items?: PluginMigrationImportItem[];
  selectedCount?: number;
  recoveryPointReady?: boolean;
  importedCount?: number;
  message?: string;
}

function executionError(message: string): Error {
  return new Error(message);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === left.length && right.every((value) => expected.has(value));
}

function validScanReport(report: ServiceLegacyMigrationScanReport): boolean {
  return report.schemaVersion === 1
    && report.status === "SCANNED"
    && report.zeroFormalWrites === true
    && /^[a-f0-9]{64}$/.test(report.sourceBundleSha256)
    && report.previews.length === report.reviewItems.length
    && report.previews.every((preview, index) => (
      report.reviewItems[index]?.legacyObjectId === preview.legacyObjectId
      && preview.sourceBundleSha256 === report.sourceBundleSha256
    ));
}

export class MigrationExecutionController {
  private state: PluginMigrationExecutionState = { status: "idle" };
  private readonly runIds = new Map<string, string>();
  private readonly runTokens = new Map<string, string>();
  private readonly batchIds = new Map<string, { runId: string; batchId: string }>();
  private readonly batchTokens = new Map<string, string>();
  private runSequence = 0;
  private batchSequence = 0;
  private selectedBundle: unknown;
  private selectedRunId: string | undefined;
  private selectedRunHash: string | undefined;
  private importItemIds = new Map<string, string>();
  private selectedObjectIds: string[] = [];
  private recoveryBackupId: string | undefined;
  private idempotencyKey: string | undefined;
  private generation = 0;

  constructor(private readonly createIdempotencyKey: () => string = () => `plugin-${crypto.randomUUID()}`) {}

  snapshot(): PluginMigrationExecutionState {
    return {
      ...this.state,
      ...(this.state.items ? { items: this.state.items.map((item) => ({ ...item })) } : {}),
    };
  }

  bindRuns(runs: readonly ServiceMigrationRun[], details: readonly ServiceMigrationRunDetails[]): PluginMigrationRunView[] {
    const detailByRun = new Map(details.map((detail) => [detail.run.runId, detail]));
    const liveRunIds = new Set(runs.map(({ runId }) => runId));
    for (const [runId, token] of this.runTokens) {
      if (!liveRunIds.has(runId)) {
        this.runTokens.delete(runId);
        this.runIds.delete(token);
      }
    }
    return runs.map((run) => {
      let token = this.runTokens.get(run.runId);
      if (!token) {
        token = `migration-plan:${++this.runSequence}`;
        this.runTokens.set(run.runId, token);
      }
      this.runIds.set(token, run.runId);
      const detail = detailByRun.get(run.runId);
      const batches = detail?.run.runId === run.runId
        ? detail.batches.map((batch) => this.bindBatch(batch))
        : [];
      return {
        token,
        status: run.status,
        summary: { ...run.summary },
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        batches,
      };
    });
  }

  clear(): void {
    this.generation += 1;
    this.releaseMaterial();
    this.runIds.clear();
    this.runTokens.clear();
    this.batchIds.clear();
    this.batchTokens.clear();
    this.state = { status: "idle" };
  }

  beginMaterial(runToken: string): void {
    const runId = this.runIds.get(runToken);
    if (!runId) throw executionError("迁移计划已更新；请刷新后重新选择。");
    this.generation += 1;
    this.releaseMaterial();
    this.selectedRunId = runId;
    this.state = {
      status: "selecting-material",
      runToken,
      message: "请重新选择创建本计划时使用的 Recovery Bundle；系统会只读核对来源与未迁移范围。",
    };
  }

  async loadMaterial(client: Pick<MigrationExecutionClient, "scanLegacyMigration" | "getMigrationRun">, rawBundle: string): Promise<void> {
    const runToken = this.state.runToken;
    const runId = runToken ? this.runIds.get(runToken) : undefined;
    if (this.state.status !== "selecting-material" && this.state.status !== "error") throw executionError("当前不需要重新读取迁移材料。");
    if (!runToken || !runId || this.selectedRunId !== runId) throw executionError("迁移计划已更新；请重新选择。");
    const byteLength = new TextEncoder().encode(rawBundle).byteLength;
    if (byteLength < 2 || byteLength > MIGRATION_BUNDLE_MAX_BYTES) throw executionError("所选 Recovery Bundle 大小不在安全范围内；没有创建恢复点。");
    let bundle: unknown;
    try { bundle = JSON.parse(rawBundle) as unknown; }
    catch { throw executionError("所选文件不是合法 Recovery Bundle JSON；没有创建恢复点。"); }
    const generation = ++this.generation;
    this.releaseMaterial(false);
    this.selectedRunId = runId;
    this.state = { status: "loading-material", runToken, message: "正在只读核对迁移计划与未迁移材料…" };
    try {
      const [report, detail] = await Promise.all([
        client.scanLegacyMigration(bundle),
        client.getMigrationRun(runId),
      ]);
      if (generation !== this.generation) return;
      if (!validScanReport(report) || detail.run.runId !== runId || detail.run.sourceBundleSha256 !== report.sourceBundleSha256) {
        throw executionError("所选材料与迁移计划不一致；没有创建恢复点。");
      }
      if (!["PREVIEWED", "IMPORTING"].includes(detail.run.status)) {
        throw executionError("当前迁移计划不再接受新批次；没有创建恢复点。");
      }
      const reviewById = new Map(report.reviewItems.map((item) => [item.legacyObjectId, item]));
      const pendingIds = detail.evidence
        .filter(({ decision, targetObjectId }) => decision.action === "IMPORT" && !targetObjectId)
        .map(({ legacyObjectId }) => legacyObjectId);
      if (!pendingIds.length) throw executionError("这项计划没有待导入材料；请刷新迁移台账。");
      if (pendingIds.some((objectId) => !reviewById.has(objectId))) {
        throw executionError("所选材料缺少已审阅项目；没有创建恢复点。");
      }
      const boundedIds = pendingIds.slice(0, 50);
      this.importItemIds = new Map(boundedIds.map((objectId, index) => [`migration-import-item:${index + 1}`, objectId]));
      this.selectedBundle = bundle;
      this.selectedRunHash = report.sourceBundleSha256;
      this.state = {
        status: "material-ready",
        runToken,
        items: boundedIds.map((objectId, index) => {
          const item = reviewById.get(objectId)!;
          return {
            token: `migration-import-item:${index + 1}`,
            title: item.displayTitle,
            titleTruncated: item.titleTruncated,
            sourceObjectType: item.sourceObjectType,
          };
        }),
        selectedCount: 0,
        message: pendingIds.length > 50
          ? "已核对材料；当前批最多选择前 50 项，其他项目留待下一批。"
          : "已核对材料；请选择本批要导入的项目，最多 50 项。",
      };
    } catch (error) {
      if (generation !== this.generation) return;
      this.releaseMaterial(false);
      this.selectedRunId = runId;
      this.state = {
        status: "error",
        runToken,
        message: error instanceof Error && /^(所选|当前|这项)/.test(error.message)
          ? error.message
          : "迁移材料暂时无法完成安全核对；没有创建恢复点或导入正式对象。",
      };
      throw executionError(this.state.message!);
    }
  }

  async createRecoveryPoint(client: Pick<MigrationExecutionClient, "createBackup">, itemTokens: readonly string[]): Promise<void> {
    const runToken = this.state.runToken;
    if (this.state.status !== "material-ready" || !runToken || this.selectedBundle === undefined || !this.selectedRunId || !this.selectedRunHash) {
      throw executionError("迁移材料已失效；请重新核对。");
    }
    const uniqueTokens = [...new Set(itemTokens)];
    if (uniqueTokens.length < 1 || uniqueTokens.length > 50 || uniqueTokens.length !== itemTokens.length) {
      throw executionError("请选择 1 到 50 项作为本批范围。");
    }
    const objectIds = uniqueTokens.map((token) => this.importItemIds.get(token));
    if (objectIds.some((value) => !value)) throw executionError("本批选择已失效；请重新核对材料。");
    const generation = ++this.generation;
    this.state = {
      ...this.state,
      status: "creating-recovery-point",
      selectedCount: uniqueTokens.length,
      message: "正在创建并校验导入前恢复点…",
    };
    try {
      const backup = await client.createBackup();
      if (generation !== this.generation) return;
      if (backup.validation.status !== "PASS" || !backup.backupId || backup.backupId.length > 128) {
        throw executionError("导入前恢复点没有通过完整性校验；没有导入正式对象。");
      }
      const idempotencyKey = this.createIdempotencyKey();
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) throw executionError("本批安全标识创建失败；没有导入正式对象。");
      this.selectedObjectIds = objectIds as string[];
      this.recoveryBackupId = backup.backupId;
      this.idempotencyKey = idempotencyKey;
      this.state = {
        status: "ready-to-import",
        runToken,
        selectedCount: objectIds.length,
        recoveryPointReady: true,
        message: "恢复点已校验；请最后确认本批只会导入所选项目。",
      };
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = {
        status: "error",
        runToken,
        message: error instanceof Error && /^(导入前|本批)/.test(error.message)
          ? error.message
          : "恢复点暂时无法创建；没有导入正式对象。",
      };
      throw executionError(this.state.message!);
    }
  }

  async importBatch(client: Pick<MigrationExecutionClient, "importLegacyMigration">): Promise<void> {
    const { runToken } = this.state;
    if (
      !["ready-to-import", "import-uncertain"].includes(this.state.status)
      || !runToken
      || !this.selectedRunId
      || this.selectedBundle === undefined
      || !this.recoveryBackupId
      || !this.idempotencyKey
      || !this.selectedObjectIds.length
    ) throw executionError("本批确认已失效；请重新核对材料并建立恢复点。");
    const generation = ++this.generation;
    this.state = {
      status: "importing",
      runToken,
      selectedCount: this.selectedObjectIds.length,
      recoveryPointReady: true,
      message: "正在通过唯一迁移事务导入本批；请不要重复提交…",
    };
    try {
      const result = await client.importLegacyMigration(this.selectedRunId, {
        bundle: this.selectedBundle,
        backupId: this.recoveryBackupId,
        objectIds: [...this.selectedObjectIds],
        idempotencyKey: this.idempotencyKey,
        confirmation: "IMPORT_REVIEWED_V1_BATCH",
      });
      if (generation !== this.generation) return;
      if (
        !["IMPORTED", "VERIFIED"].includes(result.batch.status)
        || result.batch.runId !== this.selectedRunId
        || result.batch.importedCount !== this.selectedObjectIds.length
        || !sameStringSet(result.batch.objectIds, this.selectedObjectIds)
      ) throw executionError("迁移批次返回的正式范围不完整；请刷新台账核对。");
      const batch = this.bindBatch(result.batch);
      this.releaseMaterial(false);
      this.state = {
        status: result.batch.status === "VERIFIED" ? "verified" : "imported",
        runToken,
        batchToken: batch.token,
        importedCount: result.batch.importedCount,
        message: result.batch.status === "VERIFIED"
          ? "本批已导入并通过验证；启用前仍可按安全条件撤销。"
          : "本批已导入；下一步必须验证结果，尚未启用 V2。",
      };
    } catch {
      if (generation !== this.generation) return;
      this.state = {
        status: "import-uncertain",
        runToken,
        selectedCount: this.selectedObjectIds.length,
        recoveryPointReady: true,
        message: "无法确认本批是否已导入；下方台账是权威。若仍显示待确认，可用相同本批重试。",
      };
      throw executionError("本批结果尚未确认；请先刷新台账，不要更换材料或范围。");
    }
  }

  async verify(client: Pick<MigrationExecutionClient, "verifyLegacyMigrationBatch">, batchToken: string): Promise<void> {
    const identity = this.batchIds.get(batchToken);
    const runToken = identity ? this.runTokens.get(identity.runId) : undefined;
    if (!identity || !runToken) throw executionError("迁移批次已更新；请刷新后重试。");
    const generation = ++this.generation;
    this.state = { status: "verifying", runToken, batchToken, message: "正在逐项验证本批正式投影…" };
    try {
      const batch = await client.verifyLegacyMigrationBatch(identity.runId, identity.batchId);
      if (generation !== this.generation) return;
      if (batch.runId !== identity.runId || batch.batchId !== identity.batchId || batch.status !== "VERIFIED" || batch.validation?.status !== "PASS") {
        throw executionError("本批没有返回完整验证证据。");
      }
      this.bindBatch(batch);
      this.state = {
        status: "verified",
        runToken,
        batchToken,
        importedCount: batch.importedCount,
        message: "本批已逐项验证；V2 尚未启用，当前批仍可按安全条件撤销。",
      };
    } catch {
      if (generation !== this.generation) return;
      const message = "本批验证未能确认；请刷新台账并检查当前正式状态。";
      this.state = { status: "error", runToken, batchToken, message };
      throw executionError(message);
    }
  }

  prepareUndo(batchToken: string): void {
    const identity = this.batchIds.get(batchToken);
    const runToken = identity ? this.runTokens.get(identity.runId) : undefined;
    if (!identity || !runToken) throw executionError("迁移批次已更新；请刷新后重试。");
    this.state = {
      status: "undo-confirm",
      runToken,
      batchToken,
      message: "撤销只会删除本批未被后续修改或引用的迁移对象；审阅、验证与审计证据保留。",
    };
  }

  async undo(client: Pick<MigrationExecutionClient, "undoLegacyMigrationBatch">): Promise<void> {
    const { runToken, batchToken } = this.state;
    const identity = batchToken ? this.batchIds.get(batchToken) : undefined;
    if (this.state.status !== "undo-confirm" || !runToken || !batchToken || !identity) {
      throw executionError("撤销确认已失效；没有改变正式状态。");
    }
    const generation = ++this.generation;
    this.state = { status: "undoing", runToken, batchToken, message: "正在校验后续变化并撤销本批…" };
    try {
      const batch = await client.undoLegacyMigrationBatch(identity.runId, identity.batchId, "UNDO_MIGRATION_BATCH");
      if (generation !== this.generation) return;
      if (batch.runId !== identity.runId || batch.batchId !== identity.batchId || batch.status !== "UNDONE") {
        throw executionError("本批撤销结果不完整。");
      }
      this.bindBatch(batch);
      this.state = {
        status: "undone",
        runToken,
        batchToken,
        importedCount: batch.importedCount,
        message: "本批已安全撤销；迁移计划和审阅证据保留，可重新准备下一批。",
      };
    } catch {
      if (generation !== this.generation) return;
      this.state = {
        status: "undo-uncertain",
        runToken,
        batchToken,
        message: "无法确认撤销是否完成；下方台账是权威，请刷新后再决定下一步。",
      };
      throw executionError("撤销结果尚未确认；不要重复创建新批次。");
    }
  }

  prepareActivation(runToken: string): void {
    const runId = this.runIds.get(runToken);
    if (!runId) throw executionError("迁移计划已更新；请刷新后重试。");
    this.generation += 1;
    this.releaseMaterial();
    this.selectedRunId = runId;
    this.state = {
      status: "activation-confirm",
      runToken,
      message: "启用前会再次确认所有待迁移项目都有验证通过的正式投影；启用后 V1 只保留为只读历史与恢复证据。",
    };
  }

  async activate(client: Pick<MigrationExecutionClient, "activateLegacyMigration">): Promise<void> {
    const { runToken } = this.state;
    const runId = runToken ? this.runIds.get(runToken) : undefined;
    if (!["activation-confirm", "activation-uncertain"].includes(this.state.status) || !runToken || !runId || runId !== this.selectedRunId) {
      throw executionError("启用确认已失效；没有改变迁移状态。");
    }
    const generation = ++this.generation;
    this.state = { status: "activating", runToken, message: "正在完成最终一致性检查并启用 V2…" };
    try {
      const run = await client.activateLegacyMigration(runId, "ACTIVATE_V2_SQLITE");
      if (generation !== this.generation) return;
      if (run.runId !== runId || run.status !== "ACTIVATED") {
        throw executionError("迁移计划没有返回完整启用证据。");
      }
      this.releaseMaterial();
      this.state = {
        status: "activated",
        runToken,
        message: "V2 已启用；V1 现在只作为只读历史与恢复证据保留。",
      };
    } catch {
      if (generation !== this.generation) return;
      this.state = {
        status: "activation-uncertain",
        runToken,
        message: "无法确认 V2 是否已经启用；请刷新迁移台账。若仍显示等待启用，可对同一计划安全重试。",
      };
      throw executionError("启用结果尚未确认；请先刷新台账，不要创建新的迁移计划。");
    }
  }

  private bindBatch(batch: ServiceMigrationBatch): PluginMigrationBatchView {
    const identityKey = `${batch.runId}\u0000${batch.batchId}`;
    let token = this.batchTokens.get(identityKey);
    if (!token) {
      token = `migration-batch:${++this.batchSequence}`;
      this.batchTokens.set(identityKey, token);
    }
    this.batchIds.set(token, { runId: batch.runId, batchId: batch.batchId });
    return {
      token,
      status: batch.status,
      importedCount: batch.importedCount,
      ...(batch.validation ? { validationObjectCount: batch.validation.objectCount } : {}),
      updatedAt: batch.updatedAt,
    };
  }

  private releaseMaterial(clearRun = true): void {
    this.selectedBundle = undefined;
    this.selectedRunHash = undefined;
    this.importItemIds.clear();
    this.selectedObjectIds = [];
    this.recoveryBackupId = undefined;
    this.idempotencyKey = undefined;
    if (clearRun) this.selectedRunId = undefined;
  }
}
