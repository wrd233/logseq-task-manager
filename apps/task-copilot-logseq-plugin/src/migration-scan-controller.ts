import {
  resolveLegacyMigrationDecision,
  validateV2Condition,
  type LegacyMigrationReviewDecision,
  type Lifecycle,
  type V2Condition,
  type V2ObjectType,
} from "@task-copilot/domain";
import type { ServiceLegacyMigrationScanReport } from "@task-copilot/service-client";

import { privateErrorEvidence } from "./private-error-evidence.ts";

export const MIGRATION_BUNDLE_MAX_BYTES = 8 * 1024 * 1024;

export interface MigrationScanClient {
  scanLegacyMigration(bundle: unknown): Promise<ServiceLegacyMigrationScanReport>;
  previewLegacyMigration?(bundle: unknown, decisions: LegacyMigrationReviewDecision[]): Promise<{
    run: { summary: { total: number; import: number; keepOrdinary: number; defer: number; exclude: number } };
    replayed: boolean;
  }>;
}

export type PluginMigrationReviewDecision = LegacyMigrationReviewDecision extends infer Decision
  ? Decision extends { legacyObjectId: string }
    ? Omit<Decision, "legacyObjectId">
    : never
  : never;

export interface PluginMigrationReviewItem {
  token: string;
  title: string;
  titleTruncated: boolean;
  sourceObjectType: string;
  classification: ServiceLegacyMigrationScanReport["previews"][number]["classification"];
  oldPhase: ServiceLegacyMigrationScanReport["previews"][number]["oldPhase"];
  oldConditionKind: ServiceLegacyMigrationScanReport["previews"][number]["oldCondition"]["kind"];
  suggestedObjectType?: V2ObjectType;
  suggestedLifecycle?: Lifecycle;
  suggestedCondition?: V2Condition;
  decision?: PluginMigrationReviewDecision;
}

export interface PluginMigrationScanState {
  status: "idle" | "loading" | "ready" | "error";
  counts?: ServiceLegacyMigrationScanReport["counts"];
  sourceCreatedAt?: string;
  items?: PluginMigrationReviewItem[];
  previewStatus?: "idle" | "loading" | "uncertain";
  decisionsComplete?: boolean;
  message?: string;
}

export interface PluginMigrationDecisionInput {
  action: LegacyMigrationReviewDecision["action"];
  objectType?: V2ObjectType;
  lifecycle?: Lifecycle;
  condition?: V2Condition;
  reviewNote?: string;
}

function migrationScanError(message: string): Error {
  return new Error(message);
}

function migrationScanFailureMessage(error: unknown): string {
  const { errorCode } = privateErrorEvidence(error);
  if (errorCode === "SERVICE_TIMEOUT") {
    return "迁移材料检查等待时间过长；正式状态没有变化，可以稍后重试。";
  }
  if (errorCode === "SERVICE_UNAVAILABLE") {
    return "本地运行环境暂时不可用；没有保存材料，也没有改变正式状态。";
  }
  if (errorCode === "SERVICE_UNAUTHORIZED") {
    return "当前本地连接已失效；没有保存材料，请在系统恢复后重试。";
  }
  if (errorCode === "SERVICE_PROTOCOL_MISMATCH" || errorCode === "SERVICE_RESPONSE_INVALID") {
    return "本地运行环境与当前插件暂不兼容；没有保存材料，也没有改变正式状态。";
  }
  return "迁移材料暂时无法完成安全检查；没有保存材料，也没有改变正式状态。";
}

function validScanReport(report: ServiceLegacyMigrationScanReport): boolean {
  const counts = Object.values(report.counts);
  const classifiedTotal = report.counts.directBind
    + report.counts.needsConfirmation
    + report.counts.keepOrdinary
    + report.counts.structuralError;
  if (
    report.schemaVersion !== 1
    || report.status !== "SCANNED"
    || report.zeroFormalWrites !== true
    || !/^[a-f0-9]{64}$/.test(report.sourceBundleSha256)
    || !Number.isFinite(Date.parse(report.sourceCreatedAt))
    || counts.some((value) => !Number.isSafeInteger(value) || value < 0)
    || classifiedTotal !== report.counts.total
    || report.counts.total !== report.previews.length
    || report.previews.length !== report.reviewItems.length
  ) return false;
  const identities = new Set<string>();
  const actualClassifications = {
    DIRECT_BIND: 0,
    NEEDS_CONFIRMATION: 0,
    KEEP_ORDINARY: 0,
    STRUCTURAL_ERROR: 0,
  };
  for (const [index, preview] of report.previews.entries()) {
    const display = report.reviewItems[index];
    if (
      !display
      || typeof preview.legacyObjectId !== "string"
      || !preview.legacyObjectId
      || identities.has(preview.legacyObjectId)
      || preview.sourceBundleSha256 !== report.sourceBundleSha256
      || !["DIRECT_BIND", "NEEDS_CONFIRMATION", "KEEP_ORDINARY", "STRUCTURAL_ERROR"].includes(preview.classification)
      || typeof preview.oldPhase !== "string"
      || !preview.oldCondition
      || typeof preview.oldCondition.kind !== "string"
      || display.legacyObjectId !== preview.legacyObjectId
      || typeof display.displayTitle !== "string"
      || !display.displayTitle.trim()
      || [...display.displayTitle].length > 160
      || typeof display.titleTruncated !== "boolean"
      || typeof display.sourceObjectType !== "string"
      || !display.sourceObjectType
      || [...display.sourceObjectType].length > 80
      || (preview.suggestedObjectType !== undefined && !["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"].includes(preview.suggestedObjectType))
      || (preview.suggestedLifecycle !== undefined && !["OPEN", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(preview.suggestedLifecycle))
    ) return false;
    try {
      if (preview.suggestedCondition) validateV2Condition(preview.suggestedCondition);
    } catch {
      return false;
    }
    actualClassifications[preview.classification] += 1;
    identities.add(preview.legacyObjectId);
  }
  return actualClassifications.DIRECT_BIND === report.counts.directBind
    && actualClassifications.NEEDS_CONFIRMATION === report.counts.needsConfirmation
    && actualClassifications.KEEP_ORDINARY === report.counts.keepOrdinary
    && actualClassifications.STRUCTURAL_ERROR === report.counts.structuralError;
}

function validPreviewSummary(
  summary: { total: number; import: number; keepOrdinary: number; defer: number; exclude: number },
  expectedTotal: number,
): boolean {
  const values = Object.values(summary);
  return values.every((value) => Number.isSafeInteger(value) && value >= 0)
    && summary.total === expectedTotal
    && summary.import + summary.keepOrdinary + summary.defer + summary.exclude === summary.total;
}

function sameReviewMinute(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime)
    && Number.isFinite(rightTime)
    && Math.floor(leftTime / 60_000) === Math.floor(rightTime / 60_000);
}

function matchesSuggestedCondition(input: V2Condition, suggested: V2Condition): boolean {
  if (input.kind !== suggested.kind) return false;
  if (input.kind === "ACTIONABLE" && suggested.kind === "ACTIONABLE") return true;
  if (input.kind === "WAITING" && suggested.kind === "WAITING") {
    return input.waitingFor.trim() === suggested.waitingFor.trim()
      && input.expectedResult.trim() === suggested.expectedResult.trim()
      && sameReviewMinute(input.reviewAt, suggested.reviewAt);
  }
  if (input.kind === "BLOCKED" && suggested.kind === "BLOCKED") {
    return input.reason.trim() === suggested.reason.trim()
      && (input.blockerObjectId === undefined || input.blockerObjectId === suggested.blockerObjectId);
  }
  if (input.kind === "PAUSED" && suggested.kind === "PAUSED") {
    return input.reason.trim() === suggested.reason.trim()
      && sameReviewMinute(input.reviewAt, suggested.reviewAt);
  }
  return false;
}

export class MigrationScanController {
  private state: PluginMigrationScanState = { status: "idle" };
  private selectedBundle: unknown;
  private selectedReport: ServiceLegacyMigrationScanReport | undefined;
  private itemIdentities = new Map<string, string>();
  private decisions = new Map<string, LegacyMigrationReviewDecision>();
  private generation = 0;

  snapshot(): PluginMigrationScanState {
    return {
      ...this.state,
      ...(this.state.counts ? { counts: { ...this.state.counts } } : {}),
      ...(this.state.items ? {
        items: this.state.items.map((item) => ({
          ...item,
          ...(item.suggestedCondition ? { suggestedCondition: structuredClone(item.suggestedCondition) } : {}),
          ...(item.decision ? { decision: structuredClone(item.decision) } : {}),
        })),
      } : {}),
    };
  }

  clear(): void {
    this.generation += 1;
    this.releaseSelectedMaterial();
    this.state = { status: "idle" };
  }

  rejectInput(message: string): void {
    this.generation += 1;
    this.releaseSelectedMaterial();
    this.state = { status: "error", message };
  }

  saveDecision(token: string, input: PluginMigrationDecisionInput): void {
    if (this.state.status !== "ready" || !this.selectedReport) {
      throw migrationScanError("迁移材料已失效；请重新选择并只读检查。");
    }
    if (this.state.previewStatus === "loading") {
      throw migrationScanError("正在创建迁移计划；请等待本次结果。");
    }
    if (this.state.previewStatus === "uncertain") {
      throw migrationScanError("迁移计划结果尚未确认；只能用相同判断重试，或放弃后重新检查。");
    }
    const legacyObjectId = this.itemIdentities.get(token);
    const preview = legacyObjectId
      ? this.selectedReport.previews.find((candidate) => candidate.legacyObjectId === legacyObjectId)
      : undefined;
    if (!legacyObjectId || !preview) throw migrationScanError("找不到这项迁移材料；请重新检查。");
    const reviewNote = input.reviewNote?.trim();
    const recommendedAction = preview.classification === "DIRECT_BIND"
      ? "IMPORT"
      : preview.classification === "KEEP_ORDINARY"
        ? "KEEP_ORDINARY"
        : undefined;
    if ((preview.classification !== "DIRECT_BIND" || input.action !== recommendedAction) && !reviewNote) {
      throw migrationScanError("这项决定不能直接沿用确定性建议；请用一句话说明判断依据。");
    }
    const condition = input.condition && preview.suggestedCondition && matchesSuggestedCondition(input.condition, preview.suggestedCondition)
      ? structuredClone(preview.suggestedCondition)
      : input.condition;
    const decision: LegacyMigrationReviewDecision = input.action === "IMPORT"
      ? {
        legacyObjectId,
        action: "IMPORT",
        ...(input.objectType ? { objectType: input.objectType } : {}),
        ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
        ...(condition ? { condition: structuredClone(condition) } : {}),
        ...(reviewNote ? { reviewNote } : {}),
      }
      : { legacyObjectId, action: input.action, ...(reviewNote ? { reviewNote } : {}) };
    resolveLegacyMigrationDecision(preview, decision);
    this.decisions.set(token, decision);
    this.state = this.readyState("本项判断已保存在当前会话；尚未创建迁移计划。");
  }

  async createPreview(client: MigrationScanClient): Promise<void> {
    if (this.state.status !== "ready" || !this.selectedReport || this.selectedBundle === undefined) {
      throw migrationScanError("迁移材料已失效；请重新选择并只读检查。");
    }
    if (this.state.previewStatus === "loading") {
      throw migrationScanError("正在创建迁移计划；请等待本次结果。");
    }
    if (!client.previewLegacyMigration) throw migrationScanError("当前本地运行环境尚未提供迁移计划审阅。");
    const decisions = this.orderedDecisions();
    if (this.selectedReport.previews.length === 0) {
      throw migrationScanError("这份材料没有可审阅的迁移项；没有创建迁移计划。");
    }
    if (decisions.length !== this.selectedReport.previews.length) {
      throw migrationScanError("请先逐项保存判断；没有创建迁移计划。");
    }
    const generation = ++this.generation;
    const bundle = this.selectedBundle;
    this.state = { ...this.readyState("正在保存逐项审阅；不会导入正式对象。"), previewStatus: "loading" };
    try {
      const result = await client.previewLegacyMigration(bundle, decisions);
      if (generation !== this.generation) return;
      if (!validPreviewSummary(result.run.summary, decisions.length)) {
        throw migrationScanError("迁移计划返回的审阅汇总不完整。");
      }
      this.releaseSelectedMaterial();
      this.state = {
        status: "idle",
        message: `迁移计划已创建：${result.run.summary.total} 项完成审阅，${result.run.summary.import} 项准备迁移；尚未导入正式对象。`,
      };
    } catch {
      if (generation !== this.generation) return;
      this.state = {
        ...this.readyState("本次请求结果无法确认；请先看下方迁移台账。如果没有出现新计划，可用相同判断重试，或放弃后重新检查。"),
        previewStatus: "uncertain",
      };
      throw migrationScanError("迁移计划是否已创建暂时无法确认；刷新台账或用相同判断重试，不会因此导入正式对象。");
    }
  }

  async scan(client: MigrationScanClient, rawBundle: string): Promise<void> {
    if (this.state.status === "loading") throw migrationScanError("正在检查迁移材料；请等待当前扫描完成。");
    if (this.state.previewStatus === "loading") throw migrationScanError("正在创建迁移计划；请等待本次结果。");
    const byteLength = new TextEncoder().encode(rawBundle).byteLength;
    if (byteLength < 2 || byteLength > MIGRATION_BUNDLE_MAX_BYTES) {
      const error = migrationScanError("所选 Recovery Bundle 大小不在安全范围内；没有读取或保存。");
      this.rejectInput(error.message);
      throw error;
    }
    let bundle: unknown;
    try {
      bundle = JSON.parse(rawBundle) as unknown;
    } catch {
      const error = migrationScanError("所选文件不是合法 Recovery Bundle JSON；没有发起扫描。");
      this.rejectInput(error.message);
      throw error;
    }
    const generation = ++this.generation;
    this.releaseSelectedMaterial();
    this.state = { status: "loading", message: "正在只读检查材料与迁移边界；不会改变正式状态。" };
    try {
      const report = await client.scanLegacyMigration(bundle);
      if (generation !== this.generation) return;
      if (!validScanReport(report)) {
        throw migrationScanError("迁移材料的审阅摘要不完整；没有保存材料，也没有改变正式状态。");
      }
      this.selectedBundle = bundle;
      this.selectedReport = report;
      this.itemIdentities = new Map(report.previews.map(({ legacyObjectId }, index) => [`migration-item:${index + 1}`, legacyObjectId]));
      this.decisions.clear();
      this.state = this.readyState("只读扫描完成；请逐项确认，尚未创建迁移计划。");
    } catch (error) {
      if (generation !== this.generation) return;
      this.releaseSelectedMaterial();
      const message = migrationScanFailureMessage(error);
      this.state = {
        status: "error",
        message,
      };
      throw migrationScanError(message);
    }
  }

  private orderedDecisions(): LegacyMigrationReviewDecision[] {
    return [...this.itemIdentities.keys()].map((token) => this.decisions.get(token)).filter((value): value is LegacyMigrationReviewDecision => Boolean(value));
  }

  private releaseSelectedMaterial(): void {
    this.selectedBundle = undefined;
    this.selectedReport = undefined;
    this.itemIdentities.clear();
    this.decisions.clear();
  }

  private readyState(message: string): PluginMigrationScanState {
    if (!this.selectedReport) throw migrationScanError("迁移材料已失效；请重新选择并只读检查。");
    const items = this.selectedReport.previews.map((preview, index): PluginMigrationReviewItem => {
      const token = `migration-item:${index + 1}`;
      const display = this.selectedReport!.reviewItems[index]!;
      const decision = this.decisions.get(token);
      return {
        token,
        title: display.displayTitle,
        titleTruncated: display.titleTruncated,
        sourceObjectType: display.sourceObjectType,
        classification: preview.classification,
        oldPhase: preview.oldPhase,
        oldConditionKind: preview.oldCondition.kind,
        ...(preview.suggestedObjectType ? { suggestedObjectType: preview.suggestedObjectType } : {}),
        ...(preview.suggestedLifecycle ? { suggestedLifecycle: preview.suggestedLifecycle } : {}),
        ...(preview.suggestedCondition ? { suggestedCondition: structuredClone(preview.suggestedCondition) } : {}),
        ...(decision ? {
          decision: Object.fromEntries(Object.entries(decision).filter(([key]) => key !== "legacyObjectId")) as PluginMigrationReviewDecision,
        } : {}),
      };
    });
    return {
      status: "ready",
      counts: { ...this.selectedReport.counts },
      sourceCreatedAt: this.selectedReport.sourceCreatedAt,
      items,
      previewStatus: "idle",
      decisionsComplete: this.selectedReport.previews.length > 0 && this.decisions.size === this.selectedReport.previews.length,
      message,
    };
  }
}
