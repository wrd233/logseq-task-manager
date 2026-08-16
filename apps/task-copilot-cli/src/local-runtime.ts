import { spawn } from "node:child_process";
import { access, chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const SUPPORTED_SCHEMA_VERSION = 22;
const BACKUP_FORMAT_VERSION = 1;

export interface LocalCliIO { out: (line: string) => void; err: (line: string) => void }

function rootDirectory(): string { return fileURLToPath(new URL("../../../", import.meta.url)); }

export function stateDirectory(override?: string): string { return resolve(override ?? process.env.TASK_COPILOT_STATE_DIR ?? join(homedir(), ".task-copilot-vnext")); }
export function statePaths(stateDir: string) { return { stateDir, dbPath: join(stateDir, "task-copilot.sqlite"), descriptorPath: join(stateDir, "kernel.json"), graphDescriptorPath: join(stateDir, "graph-adapter.json"), logPath: join(stateDir, "service.log") }; }

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
async function readJson<T>(path: string): Promise<T | null> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch { return null; } }

interface ServiceStatus {
  running: boolean;
  pid: number | null;
  baseUrl: string | null;
  dbPath: string;
  schemaVersion: number | null;
  runtimeHealth: string | null;
  graphAvailable: boolean | null;
  deepseekConfigured: boolean | null;
  descriptorStale: boolean;
}

async function readDescriptor(descriptorPath: string): Promise<{ schemaVersion: number; baseUrl: string; token: string; pid: number; startedAt: string } | null> {
  return readJson(descriptorPath);
}

async function httpGet(baseUrl: string, token: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return null;
    return await response.json() as Record<string, unknown>;
  } catch { return null; }
}

export async function serviceStatus(stateDir = stateDirectory()): Promise<ServiceStatus> {
  const { dbPath, descriptorPath } = statePaths(stateDir);
  const descriptor = await readDescriptor(descriptorPath);
  const pidAliveNow = descriptor && Number.isSafeInteger(descriptor.pid) ? pidAlive(descriptor.pid) : false;
  const remote = descriptor && pidAliveNow ? await httpGet(descriptor.baseUrl, descriptor.token, "/v1/status") : null;
  const system = remote && descriptor ? await httpGet(descriptor.baseUrl, descriptor.token, "/v1/projections/system") : null;
  let schemaVersion: number | null = typeof remote?.schemaVersion === "number" ? Number(remote.schemaVersion) : null;
  if (schemaVersion === null && await exists(dbPath)) {
    try { const db = new Database(dbPath, { readonly: true }); schemaVersion = Number((db.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version); db.close(); } catch { schemaVersion = null; }
  }
  return {
    running: Boolean(descriptor && pidAliveNow && remote?.status === "ok"),
    pid: descriptor?.pid ?? null,
    baseUrl: descriptor?.baseUrl ?? null,
    dbPath,
    schemaVersion,
    runtimeHealth: system && typeof system.runtimeStatus === "string" ? system.runtimeStatus as string : null,
    graphAvailable: system && typeof system.graphAvailable === "boolean" ? system.graphAvailable as boolean : null,
    deepseekConfigured: remote && typeof remote.deepseekConfigured === "boolean" ? remote.deepseekConfigured as boolean : null,
    descriptorStale: Boolean(descriptor && !pidAliveNow),
  };
}

function humanServiceStatus(status: ServiceStatus): string {
  if (status.running) return `Task Copilot：运行中\n进程：${status.pid}\n地址：${status.baseUrl}\n数据库：${status.dbPath}（schema v${status.schemaVersion ?? "?"}）\n后台维护：${status.runtimeHealth ?? "未知"}\nLogseq：${status.graphAvailable === true ? "已连接" : status.graphAvailable === false ? "未连接" : "未知"}\nDeepSeek：${status.deepseekConfigured ? "已配置" : "未配置"}`;
  return `Task Copilot：未运行\n数据库：${status.dbPath}${status.schemaVersion ? `（schema v${status.schemaVersion}）` : ""}${status.descriptorStale ? "\n发现过期的启动信息；已按未运行处理，可安全重新启动。" : ""}`;
}

export async function serviceStart(stateDir = stateDirectory(), io: LocalCliIO, jsonMode = false): Promise<number> {
  const paths = statePaths(stateDir);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const status = await serviceStatus(stateDir);
  if (status.running) { io.out(jsonMode ? JSON.stringify({ status: "ALREADY_RUNNING", pid: status.pid }) : "Task Copilot 已经在运行。"); return 0; }
  await writeFile(paths.logPath, "", { flag: "a", mode: 0o600 });
  const child = spawn(join(rootDirectory(), "node_modules/.bin/tsx"), [join(rootDirectory(), "apps/kernel-service/src/main.ts")], {
    cwd: rootDirectory(), env: { ...process.env, TASK_COPILOT_STATE_DIR: stateDir }, stdio: ["ignore", "ignore", "ignore"], detached: true,
  });
  child.unref();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const after = await serviceStatus(stateDir);
    if (after.running) { io.out(jsonMode ? JSON.stringify({ status: "STARTED", pid: after.pid, baseUrl: after.baseUrl }) : `Task Copilot 已启动\n进程：${after.pid}\n地址：${after.baseUrl}\nLogseq：等待连接\n后台维护：正常`); return 0; }
  }
  const log = await readFile(paths.logPath, "utf8").catch(() => "");
  const tail = log.split("\n").filter(Boolean).slice(-3).join("\n");
  io.err(jsonMode ? JSON.stringify({ error: { code: "SERVICE_START_FAILED", message: "Task Copilot 启动失败。", logTail: tail } }) : `Task Copilot 启动失败。\n${tail}`);
  return 1;
}

export async function serviceStop(stateDir = stateDirectory(), io: LocalCliIO, jsonMode = false): Promise<number> {
  const { descriptorPath, graphDescriptorPath } = statePaths(stateDir);
  const descriptor = await readDescriptor(descriptorPath);
  if (!descriptor) {
    await rm(graphDescriptorPath, { force: true }).catch(() => undefined);
    io.out(jsonMode ? JSON.stringify({ status: "NOT_RUNNING" }) : "Task Copilot 未在运行。");
    return 0;
  }
  if (!Number.isSafeInteger(descriptor.pid) || !pidAlive(descriptor.pid)) {
    await rm(descriptorPath, { force: true }).catch(() => undefined); await rm(graphDescriptorPath, { force: true }).catch(() => undefined);
    io.out(jsonMode ? JSON.stringify({ status: "STOPPED", cleanedStaleDescriptor: true }) : "Task Copilot 未在运行；已清理过期启动信息。");
    return 0;
  }
  process.kill(descriptor.pid, "SIGTERM");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!pidAlive(descriptor.pid) && !(await exists(descriptorPath))) { io.out(jsonMode ? JSON.stringify({ status: "STOPPED", pid: descriptor.pid }) : "Task Copilot 已停止。"); return 0; }
  }
  io.err(jsonMode ? JSON.stringify({ error: { code: "SERVICE_STOP_TIMEOUT", message: "Task Copilot 未能及时停止。", pid: descriptor.pid } }) : "Task Copilot 未能及时停止；请勿强杀数据库进程，稍后重试。");
  return 1;
}

export interface DoctorReport {
  database: { path: string; exists: boolean; integrity: "PASS" | "FAIL" | "UNKNOWN"; foreignKeys: "PASS" | "FAIL" | "UNKNOWN"; schemaVersion: number | null; supported: boolean; futureSchema: boolean };
  service: ServiceStatus;
  projection: { backlog: number | null; degraded: number | null };
  queue: { reconcileQueued: number | null; closureQueued: number | null };
  deepseekConfigured: boolean | null;
}

export async function doctor(stateDir = stateDirectory()): Promise<DoctorReport> {
  const paths = statePaths(stateDir);
  const status = await serviceStatus(stateDir);
  let projection: DoctorReport["projection"] = { backlog: null, degraded: null }; let queue: DoctorReport["queue"] = { reconcileQueued: null, closureQueued: null };
  if (status.running && status.baseUrl) {
    const descriptor = await readDescriptor(paths.descriptorPath);
    if (descriptor) {
      const health = await httpGet(descriptor.baseUrl, descriptor.token, "/v1/projection-health");
      const system = await httpGet(descriptor.baseUrl, descriptor.token, "/v1/projections/system");
      projection = { backlog: typeof health?.backlog === "number" ? Number(health.backlog) : null, degraded: typeof health?.degraded === "number" ? Number(health.degraded) : null };
      queue = {
        reconcileQueued: typeof system?.runtimeQueuedJobs === "number" ? Number(system.runtimeQueuedJobs) : null,
        closureQueued: typeof system?.runtimeClosureQueuedJobs === "number" ? Number(system.runtimeClosureQueuedJobs) : null,
      };
    }
  }
  const dbExists = await exists(paths.dbPath);
  let integrity: DoctorReport["database"]["integrity"] = "UNKNOWN"; let foreignKeys: DoctorReport["database"]["foreignKeys"] = "UNKNOWN";
  let schemaVersion: number | null = status.schemaVersion; let futureSchema = false;
  if (dbExists) {
    try {
      const db = new Database(paths.dbPath, { readonly: true });
      try { const row = db.prepare("PRAGMA integrity_check").get() as Record<string, unknown>; integrity = row.integrity_check === "ok" ? "PASS" : "FAIL"; } catch { integrity = "FAIL"; }
      try { foreignKeys = (db.prepare("PRAGMA foreign_key_check").all() as unknown[]).length === 0 ? "PASS" : "FAIL"; } catch { foreignKeys = "FAIL"; }
      if (schemaVersion === null) { try { schemaVersion = Number((db.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version); } catch { schemaVersion = null; } }
      futureSchema = schemaVersion !== null && schemaVersion > SUPPORTED_SCHEMA_VERSION;
      db.close();
    } catch { integrity = "FAIL"; }
  }
  return {
    database: { path: paths.dbPath, exists: dbExists, integrity, foreignKeys, schemaVersion, supported: !futureSchema && (schemaVersion === null || schemaVersion <= SUPPORTED_SCHEMA_VERSION), futureSchema },
    service: status,
    projection,
    queue,
    deepseekConfigured: status.deepseekConfigured,
  };
}

function humanDoctor(report: DoctorReport): string {
  return `数据库：${report.database.exists ? `正常（schema v${report.database.schemaVersion}，完整性 ${report.database.integrity === "PASS" ? "通过" : "异常"}）` : "未找到"}
后台服务：${report.service.running ? "运行中" : report.service.descriptorStale ? "未运行（存在过期启动信息）" : "未运行"}
Logseq：${report.service.graphAvailable === true ? "已连接" : report.service.graphAvailable === false ? "未连接" : "未知"}
笔记同步：${report.queue.reconcileQueued === null ? "未知" : `${report.queue.reconcileQueued} 条待处理`}
DeepSeek：${report.deepseekConfigured ? "已配置" : "未配置"}`;
}

export interface BackupInfo {
  path: string;
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  database: string;
  sizeBytes: number;
  integrity: "PASS" | "FAIL";
  secretAudit: "PASS" | "FAIL";
}

const SECRET_MARKERS = ["DEEPSEEK_API_KEY", "userChannelToken", "graphBridgeToken", "graphSnapshotKey", "Bearer "];

function secretAuditText(text: string): boolean {
  return !(/sk-[A-Za-z0-9]{16,}/u.test(text) || SECRET_MARKERS.some((marker) => text.includes(marker)));
}

async function openReadonly(path: string): Promise<Database.Database> {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try { db.prepare("PRAGMA quick_check").get(); } catch (error) { db.close(); throw error; }
  return db;
}

export async function backupCreate(stateDir = stateDirectory(), outputOverride?: string): Promise<BackupInfo> {
  const { dbPath } = statePaths(stateDir);
  if (!(await exists(dbPath))) throw new Error("BACKUP_DATABASE_MISSING");
  const now = new Date(); const name = `task-copilot-backup-${now.toISOString().replace(/[:.]/gu, "-")}`;
  const backupDir = outputOverride ? resolve(outputOverride) : join(stateDir, "backups", name);
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const target = join(backupDir, "task-copilot.sqlite");
  const source = new Database(dbPath, { readonly: true });
  try { await source.backup(target); } finally { source.close(); }
  await chmod(target, 0o600);
  const targetDb = await openReadonly(target);
  let schemaVersion: number; let integrityRow: Record<string, unknown>;
  try {
    schemaVersion = Number((targetDb.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version);
    integrityRow = targetDb.prepare("PRAGMA integrity_check").get() as Record<string, unknown>;
  } finally { targetDb.close(); }
  const sizeBytes = (await stat(target)).size;
  const appVersion = await readJson<{ version: string }>(join(rootDirectory(), "package.json")).then((value) => value?.version ?? "0.2.0");
  const manifest = {
    formatVersion: BACKUP_FORMAT_VERSION, schemaVersion, createdAt: now.toISOString(), appVersion,
    database: "task-copilot.sqlite", sizeBytes, integrity: integrityRow.integrity_check === "ok" ? "PASS" : "FAIL",
  };
  await writeFile(join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  const manifestText = await readFile(join(backupDir, "manifest.json"), "utf8");
  const databaseText = await readFile(join(backupDir, "task-copilot.sqlite"), "latin1");
  return { path: backupDir, ...manifest, integrity: manifest.integrity === "PASS" ? "PASS" : "FAIL", secretAudit: secretAuditText(`${manifestText}\n${databaseText}`) ? "PASS" : "FAIL" };
}

export async function backupInspect(backupPath: string): Promise<BackupInfo> {
  const dir = resolve(backupPath);
  const manifestPath = join(dir, "manifest.json"); const databasePath = join(dir, "task-copilot.sqlite");
  const manifest = await readJson<Record<string, unknown>>(manifestPath);
  if (!manifest) throw new Error("BACKUP_MANIFEST_MISSING");
  if (Number(manifest.formatVersion) !== BACKUP_FORMAT_VERSION) throw new Error("BACKUP_FORMAT_UNSUPPORTED");
  if (typeof manifest.schemaVersion !== "number") throw new Error("BACKUP_MANIFEST_INVALID");
  if (manifest.schemaVersion > SUPPORTED_SCHEMA_VERSION) throw new Error("BACKUP_SCHEMA_TOO_NEW");
  if (!(await exists(databasePath))) throw new Error("BACKUP_DATABASE_MISSING");
  const db = await openReadonly(databasePath);
  let actualSchema: number; let integrity: "PASS" | "FAIL";
  try {
    actualSchema = Number((db.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version);
    integrity = (db.prepare("PRAGMA integrity_check").get() as Record<string, unknown>).integrity_check === "ok" ? "PASS" : "FAIL";
  } finally { db.close(); }
  if (actualSchema !== Number(manifest.schemaVersion)) throw new Error("BACKUP_SCHEMA_MISMATCH");
  if (actualSchema > SUPPORTED_SCHEMA_VERSION) throw new Error("BACKUP_SCHEMA_TOO_NEW");
  const sizeBytes = (await stat(databasePath)).size;
  const manifestText = await readFile(manifestPath, "utf8");
  const databaseText = await readFile(databasePath, "latin1");
  return { path: dir, formatVersion: Number(manifest.formatVersion), schemaVersion: actualSchema, createdAt: String(manifest.createdAt ?? ""), appVersion: String(manifest.appVersion ?? ""), database: "task-copilot.sqlite", sizeBytes, integrity, secretAudit: secretAuditText(`${manifestText}\n${databaseText}`) ? "PASS" : "FAIL" };
}

export async function backupRestore(backupPath: string, stateDir = stateDirectory()): Promise<{ restoredTo: string; previousBackup: string | null }> {
  const info = await backupInspect(backupPath);
  if (info.integrity !== "PASS") throw new Error("BACKUP_INTEGRITY_FAILED");
  const status = await serviceStatus(stateDir);
  if (status.running) throw new Error("BACKUP_RESTORE_ACTIVE_RUNTIME");
  const paths = statePaths(stateDir); await mkdir(stateDir, { recursive: true });
  const sourceDatabase = join(info.path, "task-copilot.sqlite");
  const temporary = join(stateDir, `.restore-${Date.now()}.sqlite`);
  await copyFile(sourceDatabase, temporary);
  await chmod(temporary, 0o600);
  const check = await openReadonly(temporary);
  try {
    if ((check.prepare("PRAGMA integrity_check").get() as Record<string, unknown>).integrity_check !== "ok") throw new Error("BACKUP_INTEGRITY_FAILED");
  } finally { check.close(); }
  let previousBackup: string | null = null;
  if (await exists(paths.dbPath)) {
    previousBackup = `${paths.dbPath}.pre-restore-${Date.now()}`;
    await rename(paths.dbPath, previousBackup);
  }
  await rm(`${paths.dbPath}-wal`, { force: true }).catch(() => undefined);
  await rm(`${paths.dbPath}-shm`, { force: true }).catch(() => undefined);
  try {
    await rename(temporary, paths.dbPath);
  } catch (error) {
    if (previousBackup && !(await exists(paths.dbPath))) await rename(previousBackup, paths.dbPath).catch(() => undefined);
    throw error;
  }
  return { restoredTo: paths.dbPath, previousBackup };
}

async function runBackup(args: string[], io: LocalCliIO, jsonMode: boolean, stateDir: string): Promise<number> {
  const words = args.filter((arg) => !arg.startsWith("--"));
  try {
    if (words[1] === "create") { const output = args.indexOf("--output") >= 0 ? args[args.indexOf("--output") + 1] : undefined; const info = await backupCreate(stateDir, output); io.out(jsonMode ? JSON.stringify(info) : `备份已创建\n路径：${info.path}\nSchema：v${info.schemaVersion}\n数据库完整性：${info.integrity === "PASS" ? "通过" : "异常"}\nSecrets：${info.secretAudit === "PASS" ? "未包含" : "检测到疑似内容，请勿分发该备份"}`); return info.integrity === "PASS" ? 0 : 1; }
    if (words[1] === "inspect" && words[2]) { const info = await backupInspect(words[2]); io.out(jsonMode ? JSON.stringify(info) : `备份：${info.path}\nSchema：v${info.schemaVersion}\n创建时间：${info.createdAt}\n应用版本：${info.appVersion}\n数据库完整性：${info.integrity === "PASS" ? "通过" : "异常"}\n大小：${info.sizeBytes} bytes`); return 0; }
    if (words[1] === "restore" && words[2]) {
      if (!args.includes("--yes")) throw new Error("RESTORE_CONFIRMATION_REQUIRED");
      const result = await backupRestore(words[2], stateDir);
      io.out(jsonMode ? JSON.stringify(result) : `恢复完成\n数据库：${result.restoredTo}${result.previousBackup ? `\n原数据库保留在：${result.previousBackup}` : ""}`);
      return 0;
    }
    throw new Error("CLI_USAGE: backup create|inspect <path>|restore <path> --yes");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(jsonMode ? JSON.stringify({ error: { code: message.split(":")[0] ?? "BACKUP_FAILED", message } }) : `备份操作失败：${message}`);
    return 1;
  }
}

async function runService(args: string[], io: LocalCliIO, jsonMode: boolean, stateDir: string): Promise<number> {
  const words = args.filter((arg) => !arg.startsWith("--"));
  if (words[1] === "start") return serviceStart(stateDir, io, jsonMode);
  if (words[1] === "stop") return serviceStop(stateDir, io, jsonMode);
  if (words[1] === "status") { const status = await serviceStatus(stateDir); io.out(jsonMode ? JSON.stringify(status) : humanServiceStatus(status)); return status.running ? 0 : 1; }
  io.err(jsonMode ? JSON.stringify({ error: { code: "CLI_USAGE", message: "service start|stop|status" } }) : "用法：task-copilot service start|stop|status");
  return 2;
}

async function runDoctor(io: LocalCliIO, jsonMode: boolean, stateDir: string): Promise<number> {
  try { const report = await doctor(stateDir); io.out(jsonMode ? JSON.stringify(report) : humanDoctor(report)); return report.database.futureSchema ? 2 : report.database.integrity === "FAIL" ? 2 : 0; } catch (error) { io.err(error instanceof Error ? error.message : String(error)); return 1; }
}

export async function runLocalCli(argv: string[], io: LocalCliIO, stateDir = stateDirectory()): Promise<number> {
  const jsonMode = argv.includes("--json");
  const stateDirIndex = argv.indexOf("--state-dir");
  const resolvedStateDir = stateDirIndex >= 0 && argv[stateDirIndex + 1] ? resolve(argv[stateDirIndex + 1]!) : stateDir;
  const words = argv.filter((arg) => !arg.startsWith("--") && !arg.startsWith("-"));
  if (words[0] === "backup") return runBackup(argv, io, jsonMode, resolvedStateDir);
  if (words[0] === "service") return runService(argv, io, jsonMode, resolvedStateDir);
  if (words[0] === "doctor") return runDoctor(io, jsonMode, resolvedStateDir);
  io.err(jsonMode ? JSON.stringify({ error: { code: "CLI_USAGE", message: "local command requires backup|service|doctor" } }) : "用法：task-copilot backup|service|doctor");
  return 2;
}
