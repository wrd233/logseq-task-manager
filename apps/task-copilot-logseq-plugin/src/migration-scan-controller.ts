import type { ServiceLegacyMigrationScanReport } from "@task-copilot/service-client";

import { privateErrorEvidence } from "./private-error-evidence.ts";

export const MIGRATION_BUNDLE_MAX_BYTES = 8 * 1024 * 1024;

export interface MigrationScanClient {
  scanLegacyMigration(bundle: unknown): Promise<ServiceLegacyMigrationScanReport>;
}

export interface PluginMigrationScanState {
  status: "idle" | "loading" | "ready" | "error";
  counts?: ServiceLegacyMigrationScanReport["counts"];
  sourceCreatedAt?: string;
  message?: string;
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

export class MigrationScanController {
  private state: PluginMigrationScanState = { status: "idle" };
  private selectedBundle: unknown;
  private generation = 0;

  snapshot(): PluginMigrationScanState {
    return {
      ...this.state,
      ...(this.state.counts ? { counts: { ...this.state.counts } } : {}),
    };
  }

  clear(): void {
    this.generation += 1;
    this.selectedBundle = undefined;
    this.state = { status: "idle" };
  }

  rejectInput(message: string): void {
    this.generation += 1;
    this.selectedBundle = undefined;
    this.state = { status: "error", message };
  }

  async scan(client: MigrationScanClient, rawBundle: string): Promise<void> {
    if (this.state.status === "loading") throw migrationScanError("正在检查迁移材料；请等待当前扫描完成。");
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
    this.selectedBundle = undefined;
    this.state = { status: "loading", message: "正在只读检查材料与迁移边界；不会改变正式状态。" };
    try {
      const report = await client.scanLegacyMigration(bundle);
      if (generation !== this.generation) return;
      this.selectedBundle = bundle;
      this.state = {
        status: "ready",
        counts: { ...report.counts },
        sourceCreatedAt: report.sourceCreatedAt,
        message: "只读扫描完成；尚未创建迁移计划，也没有改变正式状态。",
      };
    } catch (error) {
      if (generation !== this.generation) return;
      this.selectedBundle = undefined;
      const message = migrationScanFailureMessage(error);
      this.state = {
        status: "error",
        message,
      };
      throw migrationScanError(message);
    }
  }
}
