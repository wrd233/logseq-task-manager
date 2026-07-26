import type {
  ServiceBackupCatalog,
  ServiceBackupCreated,
  ServiceBackupRestored,
  ServiceBackupValidation,
} from "@task-copilot/service-client";

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
    if (!backupId) throw new Error("恢复确认已过期；没有执行恢复。");
    this.state = { ...this.state, status: "restoring", message: "正在建立当前状态恢复点并切换正式快照…" };
    try {
      const validation = await client.validateBackup(backupId);
      if (validation.validation.status !== "PASS") throw new Error("所选恢复快照已失效；没有执行恢复。");
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
