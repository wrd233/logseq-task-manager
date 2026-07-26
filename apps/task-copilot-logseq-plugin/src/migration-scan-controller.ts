import type { ServiceLegacyMigrationScanReport } from "@task-copilot/service-client";

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
      this.state = {
        status: "error",
        message: error instanceof Error ? error.message : "迁移材料暂时无法检查；正式状态没有变化。",
      };
      throw error;
    }
  }
}
