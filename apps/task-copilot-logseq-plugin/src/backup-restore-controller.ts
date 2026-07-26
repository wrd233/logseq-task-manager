import type {
  ServiceBackupCatalog,
  ServiceBackupCreated,
  ServiceBackupRestored,
  ServiceBackupValidation,
} from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

export interface BackupRestoreClient {
  listBackups(): Promise<ServiceBackupCatalog>;
  createBackup(): Promise<ServiceBackupCreated>;
  validateBackup(backupId: string): Promise<ServiceBackupValidation>;
  restoreBackup(backupId: string, confirmation: "RESTORE_AND_STOP_SERVICE"): Promise<ServiceBackupRestored>;
}

export interface PluginBackupChoice {
  token: string;
  createdAt: string;
  status: "VALID" | "INVALID";
  schemaVersion?: number;
  objectCount?: number;
}

export interface PluginBackupRestoreState {
  status: "idle" | "loading" | "ready" | "validating" | "restoring" | "error";
  backups: PluginBackupChoice[];
  total: number;
  limited: boolean;
  selectedToken?: string;
  message?: string;
}

export interface BackupRestoreFailureDisposition {
  kind: "PRE_SWITCH_REJECTED" | "ROLLED_BACK" | "RECOVERY_REQUIRED" | "OUTCOME_UNKNOWN";
  restartRuntime: boolean;
  message: string;
}

export function backupRestoreFailureDisposition(error: unknown): BackupRestoreFailureDisposition {
  if (error instanceof StructuredError && error.code.startsWith("BACKUP_RESTORE_PREFLIGHT_")) {
    return {
      kind: "PRE_SWITCH_REJECTED",
      restartRuntime: false,
      message: error.message,
    };
  }
  const remoteCode = error instanceof StructuredError && typeof error.details?.remoteCode === "string"
    ? error.details.remoteCode
    : undefined;
  if (remoteCode === "V2_BACKUP_VALIDATION_FAILED") {
    return {
      kind: "OUTCOME_UNKNOWN",
      restartRuntime: true,
      message: "Restore Apply 阶段的快照校验未通过；尚不能假定原 Service 仍在运行，正在重新连接并核验当前正式状态。",
    };
  }
  if (remoteCode === "V2_RESTORE_FAILED") {
    return {
      kind: "ROLLED_BACK",
      restartRuntime: true,
      message: "恢复未完成；系统已恢复原正式状态并保留 Restore 前恢复点，正在重新连接当前 Graph。",
    };
  }
  if (remoteCode === "V2_RESTORE_ROLLBACK_FAILED") {
    return {
      kind: "RECOVERY_REQUIRED",
      restartRuntime: false,
      message: "恢复和自动回滚都未能完成；Restore 前恢复点仍保留。正式写入已暂停，请从系统状态进入人工恢复。",
    };
  }
  return {
    kind: "OUTCOME_UNKNOWN",
    restartRuntime: true,
    message: "Restore 返回结果不确定；正式写入已暂停，正在重新连接并核验当前 Graph 的正式状态。",
  };
}

export class BackupRestoreController {
  private state: PluginBackupRestoreState = { status: "idle", backups: [], total: 0, limited: false };
  private backupIds = new Map<string, string>();

  snapshot(): PluginBackupRestoreState {
    return {
      ...this.state,
      backups: this.state.backups.map((backup) => ({ ...backup })),
    };
  }

  clear(): void {
    this.backupIds.clear();
    this.state = { status: "idle", backups: [], total: 0, limited: false };
  }

  async load(client: Pick<BackupRestoreClient, "listBackups">): Promise<void> {
    this.state = {
      status: "loading",
      backups: this.state.backups,
      total: this.state.total,
      limited: this.state.limited,
    };
    try {
      const catalog = await client.listBackups();
      this.backupIds.clear();
      const backups = catalog.backups.map((backup, index) => {
        const token = `snapshot:${index}`;
        this.backupIds.set(token, backup.backupId);
        return {
          token,
          createdAt: backup.createdAt,
          status: backup.status,
          ...(backup.schemaVersion !== undefined ? { schemaVersion: backup.schemaVersion } : {}),
          ...(backup.objectCount !== undefined ? { objectCount: backup.objectCount } : {}),
        };
      });
      this.state = { status: "ready", backups, total: catalog.total, limited: catalog.limited };
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async create(client: Pick<BackupRestoreClient, "createBackup" | "listBackups">): Promise<void> {
    this.state = {
      status: "loading",
      backups: this.state.backups,
      total: this.state.total,
      limited: this.state.limited,
      message: "正在创建并校验当前快照…",
    };
    try {
      await client.createBackup();
      await this.load(client);
      this.state = { ...this.state, message: "当前正式状态已创建新的可恢复快照。" };
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async select(client: Pick<BackupRestoreClient, "validateBackup">, token: string): Promise<void> {
    const backup = this.state.backups.find((candidate) => candidate.token === token);
    const backupId = this.backupIds.get(token);
    if (!backup || !backupId || backup.status !== "VALID") throw new Error("所选恢复快照不可用；没有执行恢复。");
    this.state = {
      status: "validating",
      backups: this.state.backups,
      total: this.state.total,
      limited: this.state.limited,
      message: "正在重新校验所选快照…",
    };
    try {
      const validation = await client.validateBackup(backupId);
      if (validation.validation.status !== "PASS") throw new Error("所选恢复快照没有通过完整性校验。");
      this.state = { ...this.state, status: "ready", selectedToken: token, message: "快照已通过完整性校验；请审阅最终影响。" };
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async restore(client: Pick<BackupRestoreClient, "validateBackup" | "restoreBackup">, token: string): Promise<ServiceBackupRestored> {
    const backupId = this.state.selectedToken === token ? this.backupIds.get(token) : undefined;
    if (!backupId) {
      throw new StructuredError({
        code: "BACKUP_RESTORE_PREFLIGHT_STALE",
        message: "恢复确认已过期；没有执行恢复。",
        ruleRefs: ["D-192", "D-204"],
      });
    }
    this.state = { ...this.state, status: "restoring", message: "正在建立当前状态恢复点并切换正式快照…" };
    try {
      const validation = await client.validateBackup(backupId);
      if (validation.validation.status !== "PASS") {
        throw new StructuredError({
          code: "BACKUP_RESTORE_PREFLIGHT_INVALID",
          message: "所选恢复快照已失效；没有执行恢复。",
          ruleRefs: ["D-192", "D-204"],
        });
      }
    } catch (error) {
      const preflight = error instanceof StructuredError && error.code.startsWith("BACKUP_RESTORE_PREFLIGHT_")
        ? error
        : new StructuredError({
          code: "BACKUP_RESTORE_PREFLIGHT_UNAVAILABLE",
          message: "无法完成 Restore 最终校验；没有执行恢复，当前正式状态保持不变。",
          ruleRefs: ["D-192", "D-204"],
        });
      this.fail(preflight);
      throw preflight;
    }
    try {
      return await client.restoreBackup(backupId, "RESTORE_AND_STOP_SERVICE");
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  private fail(error: unknown): void {
    this.state = {
      status: "error",
      backups: this.state.backups,
      total: this.state.total,
      limited: this.state.limited,
      message: error instanceof Error ? error.message : "备份与恢复暂不可用。",
    };
  }
}
