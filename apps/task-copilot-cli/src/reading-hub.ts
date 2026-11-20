import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { WorkspaceError, workRecord, workText } from "@task-copilot/contracts";
import {
  BackgroundBudgetTracker,
  defaultReadingConfig,
  isProfileConfigured,
  parseReadingConfig,
  resolveSelectedProfile,
  runReadingTask,
  sanitizeReadingProviders,
  type ReadingModelInput,
  type ReadingParagraph,
  type ReadingPrivacyMode,
  type ReadingRole,
  type ReadingRunResult,
  type ReadingRuntimeConfig,
  type ReadingTrigger,
  type SanitizedProvidersSnapshot,
} from "@task-copilot/reading-runtime";
import { browserDescriptor, callDshReadingModel } from "./dsh-handoff.ts";
import { atomicJson } from "./workspace-files.ts";

export const providersConfigPath = (stateDir: string): string => join(stateDir, "providers.json");
export const secretsEnvPath = (stateDir: string): string => join(stateDir, "secrets.env");
const stagedJobsPath = (stateDir: string): string => join(stateDir, "reading-jobs.json");
const budgetStatePath = (stateDir: string): string => join(stateDir, "reading-budget.json");

export async function loadReadingEnv(
  stateDir: string,
  baseEnv: Record<string, string | undefined> = process.env
): Promise<Record<string, string | undefined>> {
  const path = secretsEnvPath(stateDir);
  try {
    await assertPrivateFile(path, 32_768);
    const content = await readFile(path, "utf8");
    const merged: Record<string, string | undefined> = {};
    for (const rawLine of content.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/u.test(key)) continue;
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      merged[key] = val;
    }
    return { ...merged, ...baseEnv };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return baseEnv;
    if (error instanceof WorkspaceError) throw error;
    return baseEnv;
  }
}

const MAX_STAGED_JOBS = 24;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export async function isDshRunning(stateDir: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await readFile(browserDescriptor(stateDir), "utf8")) as { pid?: unknown };
    if (typeof raw.pid !== "number" || !Number.isInteger(raw.pid) || raw.pid <= 0) return false;
    process.kill(raw.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function assertPrivateFile(path: string, maxBytes: number): Promise<number> {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > maxBytes ||
    (process.platform !== "win32" && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))
  ) {
    throw new WorkspaceError("READING_CONFIG_NOT_PRIVATE", "providers.json 必须是当前用户私有的 0600 文件且不可为符号链接。");
  }
  return info.mtimeMs;
}

export async function loadReadingConfig(
  stateDir: string,
  env: Record<string, string | undefined> = process.env,
  options: { dshAvailable?: boolean } = {}
): Promise<{ config: ReadingRuntimeConfig; source: "file" | "default"; mtimeMs: number | null }> {
  const path = providersConfigPath(stateDir);
  try {
    const mtimeMs = await assertPrivateFile(path, 131_072);
    const parsed = parseReadingConfig(JSON.parse(await readFile(path, "utf8")));
    return { config: parsed, source: "file", mtimeMs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const dshAvailable = options.dshAvailable ?? (await isDshRunning(stateDir));
      return { config: defaultReadingConfig(env, { dshAvailable }), source: "default", mtimeMs: null };
    }
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError("READING_CONFIG_INVALID", error instanceof Error ? error.message : "Invalid providers.json");
  }
}

export async function saveReadingConfig(stateDir: string, config: ReadingRuntimeConfig): Promise<void> {
  const validated = parseReadingConfig(config);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await atomicJson(providersConfigPath(stateDir), validated, 0o600);
}

export interface StagedReadingJob {
  jobId: string;
  workKey: string;
  planId?: string;
  refreshKey?: string;
  mode: ReadingModelInput["mode"];
  background: boolean;
  privacyMode: ReadingPrivacyMode;
  requireReview?: boolean;
  origin?: "local-model" | "external-mcp";
  summary?: string;
  sourceSetVersion?: string;
  structureVersion?: string;
  previous?: ReadingModelInput["previous"];
  changes?: ReadingModelInput["changes"];
  status: "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  completedAt?: number;
  result?: ReadingRunResult;
  error?: { code: string; message: string };
}

interface PersistedJobsFile {
  schemaVersion: 1;
  jobs: StagedReadingJob[];
}

export interface ReadingHubOptions {
  stateDirectory: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  dshFallback?: (input: ReadingModelInput, signal: AbortSignal) => Promise<unknown>;
  dshAvailable?: () => Promise<boolean>;
}

function asReadingInput(raw: unknown): {
  input: ReadingModelInput;
  trigger: ReadingTrigger;
  privacyMode: ReadingPrivacyMode;
  role?: ReadingRole;
  profileId?: string;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new WorkspaceError("INVALID_INPUT");
  }
  const obj = raw as Record<string, unknown>;
  const trigger: ReadingTrigger = obj.trigger === "background" ? "background" : "manual";
  const privacyMode: ReadingPrivacyMode = obj.privacyMode === "local-only" ? "local-only" : "default";
  const role: ReadingRole | undefined =
    obj.role === "fast" || obj.role === "deep" || obj.role === "local" ? obj.role : undefined;
  const profileId = typeof obj.profileId === "string" && obj.profileId.trim() ? obj.profileId.trim() : undefined;
  const core = (obj.input && typeof obj.input === "object" ? obj.input : obj) as ReadingModelInput;
  return {
    input: core,
    trigger,
    privacyMode,
    ...(role ? { role } : {}),
    ...(profileId ? { profileId } : {}),
  };
}

export class ReadingJobHub {
  private readonly stateDirectory: string;
  private readonly env: Record<string, string | undefined>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly dshFallback: (input: ReadingModelInput, signal: AbortSignal) => Promise<unknown>;
  private readonly checkDsh: () => Promise<boolean>;
  private readonly budget = new BackgroundBudgetTracker();
  private readonly jobs = new Map<string, StagedReadingJob>();
  private readonly controllers = new Map<string, AbortController>();
  private cachedConfig: { config: ReadingRuntimeConfig; source: "file" | "default"; mtimeMs: number | null } | null = null;
  private loaded = false;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(options: ReadingHubOptions) {
    this.stateDirectory = options.stateDirectory;
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.dshFallback = options.dshFallback ?? ((input, signal) => callDshReadingModel(this.stateDirectory, input, signal));
    this.checkDsh = options.dshAvailable ?? (() => isDshRunning(this.stateDirectory));
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const budgetData = JSON.parse(await readFile(budgetStatePath(this.stateDirectory), "utf8")) as { timestamps?: unknown };
      if (Array.isArray(budgetData.timestamps)) {
        for (const stamp of budgetData.timestamps) {
          if (typeof stamp === "number" && Number.isFinite(stamp)) this.budget.record(stamp);
        }
      }
    } catch {
      // Missing or unreadable budget file starts clean.
    }
    try {
      const data = JSON.parse(await readFile(stagedJobsPath(this.stateDirectory), "utf8")) as PersistedJobsFile;
      if (data?.schemaVersion === 1 && Array.isArray(data.jobs)) {
        const cutoff = this.now() - JOB_TTL_MS;
        for (const job of data.jobs) {
          if (job && typeof job.jobId === "string" && typeof job.workKey === "string" && job.status === "completed" && job.createdAt >= cutoff) {
            this.jobs.set(job.jobId, job);
          }
        }
      }
    } catch {
      // Missing staged jobs file starts empty.
    }
  }

  private async resolvedEnv(): Promise<Record<string, string | undefined>> {
    return loadReadingEnv(this.stateDirectory, this.env);
  }

  private async currentConfig(): Promise<{
    config: ReadingRuntimeConfig;
    source: "file" | "default";
    dshAvailable: boolean;
    env: Record<string, string | undefined>;
  }> {
    const [dshAvailable, env] = await Promise.all([this.checkDsh(), this.resolvedEnv()]);
    const path = providersConfigPath(this.stateDirectory);
    try {
      const mtimeMs = await assertPrivateFile(path, 131_072);
      if (this.cachedConfig && this.cachedConfig.source === "file" && this.cachedConfig.mtimeMs === mtimeMs) {
        return { config: this.cachedConfig.config, source: "file", dshAvailable, env };
      }
      const parsed = parseReadingConfig(JSON.parse(await readFile(path, "utf8")));
      this.cachedConfig = { config: parsed, source: "file", mtimeMs };
      return { config: parsed, source: "file", dshAvailable, env };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const fallback = defaultReadingConfig(env, { dshAvailable });
        this.cachedConfig = { config: fallback, source: "default", mtimeMs: null };
        return { config: fallback, source: "default", dshAvailable, env };
      }
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError("READING_CONFIG_INVALID", error instanceof Error ? error.message : "Invalid providers.json");
    }
  }

  private schedulePersist(): void {
    const cutoff = this.now() - JOB_TTL_MS;
    const completed = [...this.jobs.values()]
      .filter((job) => job.status === "completed" && job.createdAt >= cutoff)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-MAX_STAGED_JOBS);
    const budgetUsage = this.budget.usage(this.now());
    this.persistQueue = this.persistQueue
      .then(async () => {
        await atomicJson(stagedJobsPath(this.stateDirectory), { schemaVersion: 1, jobs: completed }, 0o600);
        await atomicJson(budgetStatePath(this.stateDirectory), { schemaVersion: 1, timestamps: budgetUsage.timestamps }, 0o600);
      })
      .catch(() => undefined);
  }

  private pruneJobs(): void {
    const cutoff = this.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (job.status !== "running" && job.createdAt < cutoff) {
        this.jobs.delete(id);
      }
    }
    while (this.jobs.size > MAX_STAGED_JOBS * 2) {
      const removable = [...this.jobs.values()].find((job) => job.status !== "running");
      if (!removable) break;
      this.jobs.delete(removable.jobId);
    }
  }

  async providers(): Promise<SanitizedProvidersSnapshot> {
    await this.ensureLoaded();
    const { config, source, dshAvailable, env } = await this.currentConfig();
    const usage = this.budget.usage(this.now());
    return sanitizeReadingProviders(config, env, {
      dshAvailable,
      source,
      backgroundUsedLastHour: usage.lastHour,
      backgroundUsedLastDay: usage.lastDay,
    });
  }

  async setRoute(raw: unknown): Promise<SanitizedProvidersSnapshot> {
    await this.ensureLoaded();
    const input = workRecord(raw, ["fast", "deep", "local", "defaultProfileId"]);
    const { config } = await this.currentConfig();
    const next: ReadingRuntimeConfig = structuredClone(config);

    if (input.defaultProfileId !== undefined) {
      const id = input.defaultProfileId === null ? null : workText(input.defaultProfileId, 64);
      next.routes.fast = id;
      next.routes.deep = id;
    }
    for (const role of ["fast", "deep", "local"] as const) {
      if (input[role] !== undefined) {
        next.routes[role] = input[role] === null ? null : workText(input[role], 64);
      }
    }

    const validated = parseReadingConfig(next);
    await saveReadingConfig(this.stateDirectory, validated);
    this.cachedConfig = null;
    return this.providers();
  }

  async runSync(raw: unknown, signal?: AbortSignal): Promise<ReadingRunResult> {
    await this.ensureLoaded();
    const { config, dshAvailable, env } = await this.currentConfig();
    const parsed = asReadingInput(raw);
    try {
      return await runReadingTask({
        input: parsed.input,
        config,
        env,
        trigger: parsed.trigger,
        privacyMode: parsed.privacyMode,
        ...(parsed.role ? { role: parsed.role } : {}),
        ...(parsed.profileId ? { profileId: parsed.profileId } : {}),
        ...(signal ? { signal } : {}),
        budget: this.budget,
        now: this.now,
        fetchImpl: this.fetchImpl,
        dshAvailable,
        dshFallback: this.dshFallback,
      });
    } finally {
      this.schedulePersist();
    }
  }

  async startJob(raw: unknown): Promise<{ job: StagedReadingJob; deduplicated: boolean }> {
    await this.ensureLoaded();
    this.pruneJobs();
    const envelope = workRecord(raw, ["workKey", "planId", "refreshKey", "trigger", "privacyMode", "role", "profileId", "input"]);
    const workKey = workText(envelope.workKey, 512);
    const planId = envelope.planId !== undefined ? workText(envelope.planId, 128) : undefined;
    const refreshKey = envelope.refreshKey !== undefined ? workText(envelope.refreshKey, 2048) : undefined;
    const parsed = asReadingInput(envelope);

    // Deduplicate background revisions for the exact same work + refreshKey
    if (parsed.trigger === "background" && refreshKey) {
      const existing = [...this.jobs.values()].find(
        (job) =>
          job.workKey === workKey &&
          job.refreshKey === refreshKey &&
          job.mode === parsed.input.mode &&
          (job.status === "running" || job.status === "completed")
      );
      if (existing) {
        return { job: structuredClone(existing), deduplicated: true };
      }
    }

    const { config, dshAvailable, env } = await this.currentConfig();

    // Fail-fast validation before launching detached job
    const { profile } = resolveSelectedProfile(config, {
      input: parsed.input,
      trigger: parsed.trigger,
      privacyMode: parsed.privacyMode,
      ...(parsed.role ? { role: parsed.role } : {}),
      ...(parsed.profileId ? { profileId: parsed.profileId } : {}),
    });
    const status = isProfileConfigured(profile, env, dshAvailable);
    if (!status.configured) {
      if (profile.kind === "dsh") {
        throw new WorkspaceError("DSH_NOT_RUNNING", "当前阅读路由指向 DSH，请启动 DSH 或切换到直连模型 Profile。");
      }
      if (parsed.privacyMode === "local-only") {
        throw new WorkspaceError("READING_LOCAL_MODEL_REQUIRED", "本地模型 Profile 未就绪，请检查本地模型地址与名称。");
      }
      throw new WorkspaceError("READING_MODEL_NOT_CONFIGURED", "尚未配置可用模型 API Key，请配置 DEEPSEEK_API_KEY 或工作台 providers.json。");
    }
    if (parsed.trigger === "background" && !this.budget.canRun(config.budget, this.now())) {
      throw new WorkspaceError(
        "READING_BACKGROUND_BUDGET_PAUSED",
        "后台自动修订已达当前配额上限，暂不自动触发；你仍可手动点击更新文章或提问。"
      );
    }

    // Cancel any older running job for this same workKey
    for (const [id, existing] of this.jobs) {
      if (existing.workKey === workKey && existing.status === "running") {
        this.controllers.get(id)?.abort();
        this.controllers.delete(id);
        existing.status = "cancelled";
        existing.completedAt = this.now();
      }
    }

    const jobId = randomUUID();
    const controller = new AbortController();
    const job: StagedReadingJob = {
      jobId,
      workKey,
      ...(planId ? { planId } : {}),
      ...(refreshKey ? { refreshKey } : {}),
      mode: parsed.input.mode,
      background: parsed.trigger === "background",
      privacyMode: parsed.privacyMode,
      ...(parsed.input.source?.sourceSetVersion ? { sourceSetVersion: parsed.input.source.sourceSetVersion } : {}),
      ...(parsed.input.source?.structureVersion ? { structureVersion: parsed.input.source.structureVersion } : {}),
      ...(parsed.input.previous ? { previous: structuredClone(parsed.input.previous) } : {}),
      ...(parsed.input.changes ? { changes: structuredClone(parsed.input.changes) } : {}),
      status: "running",
      createdAt: this.now(),
    };
    this.jobs.set(jobId, job);
    this.controllers.set(jobId, controller);

    void runReadingTask({
      input: parsed.input,
      config,
      env,
      trigger: parsed.trigger,
      privacyMode: parsed.privacyMode,
      ...(parsed.role ? { role: parsed.role } : {}),
      ...(parsed.profileId ? { profileId: parsed.profileId } : {}),
      signal: controller.signal,
      budget: this.budget,
      now: this.now,
      fetchImpl: this.fetchImpl,
      dshAvailable,
      dshFallback: this.dshFallback,
    })
      .then((result) => {
        if (job.status !== "running") return;
        job.status = "completed";
        job.completedAt = this.now();
        job.result = result;
      })
      .catch((error: unknown) => {
        if (job.status !== "running") return;
        const code = error instanceof WorkspaceError ? error.code : "READING_MODEL_PROVIDER_FAILED";
        const message = error instanceof Error ? error.message.slice(0, 400) : code;
        job.status = controller.signal.aborted || code === "READING_MODEL_INTERRUPTED" ? "cancelled" : "failed";
        job.completedAt = this.now();
        if (job.status === "failed") {
          job.error = { code, message };
        }
      })
      .finally(() => {
        this.controllers.delete(jobId);
        this.schedulePersist();
      });

    return { job: structuredClone(job), deduplicated: false };
  }

  async jobStatus(raw: unknown): Promise<{ job: StagedReadingJob | null }> {
    await this.ensureLoaded();
    this.pruneJobs();
    const query = workRecord(raw, ["jobId", "workKey"]);
    if (query.jobId !== undefined) {
      const id = workText(query.jobId, 128);
      const found = this.jobs.get(id) ?? null;
      return { job: found ? structuredClone(found) : null };
    }
    if (query.workKey !== undefined) {
      const workKey = workText(query.workKey, 512);
      const matching = [...this.jobs.values()]
        .filter((job) => job.workKey === workKey && (job.status === "running" || job.status === "completed" || job.status === "failed"))
        .sort((a, b) => b.createdAt - a.createdAt);
      const running = matching.find((job) => job.status === "running");
      const chosen = running ?? matching[0] ?? null;
      return { job: chosen ? structuredClone(chosen) : null };
    }
    throw new WorkspaceError("INVALID_INPUT", "Provide jobId or workKey.");
  }

  async ackJob(raw: unknown): Promise<{ acknowledged: boolean }> {
    await this.ensureLoaded();
    const input = workRecord(raw, ["jobId"]);
    const jobId = workText(input.jobId, 128);
    const existing = this.jobs.get(jobId);
    if (!existing || existing.status === "running") return { acknowledged: false };
    this.jobs.delete(jobId);
    this.schedulePersist();
    return { acknowledged: true };
  }

  async stageExternalCandidate(input: {
    workKey: string;
    planId?: string;
    sourceSetVersion: string;
    structureVersion: string;
    paragraphs: ReadingParagraph[];
    providerId: string;
    summary?: string;
    sourceIds: string[];
    materialIds: string[];
    redactedMaterials?: string[];
  }): Promise<StagedReadingJob> {
    await this.ensureLoaded();
    this.pruneJobs();
    const workKey = workText(input.workKey, 512);
    const sourceSetVersion = workText(input.sourceSetVersion, 128);
    const structureVersion = workText(input.structureVersion, 128);
    const providerId = workText(input.providerId, 128);
    const planId = input.planId ? workText(input.planId, 128) : undefined;
    const summary = input.summary ? workText(input.summary, 400) : undefined;

    for (const [id, existing] of this.jobs) {
      if (existing.workKey === workKey && existing.origin === "external-mcp" && existing.status === "completed") {
        this.jobs.delete(id);
      }
    }

    const now = this.now();
    const job: StagedReadingJob = {
      jobId: randomUUID(),
      workKey,
      ...(planId ? { planId } : {}),
      mode: "organize",
      background: true,
      privacyMode: "default",
      requireReview: true,
      origin: "external-mcp",
      ...(summary ? { summary } : {}),
      sourceSetVersion,
      structureVersion,
      status: "completed",
      createdAt: now,
      completedAt: now,
      result: {
        paragraphs: structuredClone(input.paragraphs),
        agentRun: {
          providerId,
          model: null,
          locality: "remote",
          path: "agent",
          steps: 1,
          toolResults: 0,
          sourceIds: [...input.sourceIds],
          materialIds: [...input.materialIds],
          redactedMaterials: [...(input.redactedMaterials ?? [])],
        },
      },
    };
    this.jobs.set(job.jobId, job);
    this.schedulePersist();
    await this.persistQueue;
    return structuredClone(job);
  }

  async cancelJob(raw: unknown): Promise<{ cancelled: boolean }> {
    await this.ensureLoaded();
    const input = workRecord(raw, ["jobId", "workKey"]);
    let cancelled = false;
    if (input.jobId !== undefined) {
      const id = workText(input.jobId, 128);
      const job = this.jobs.get(id);
      if (job && job.status === "running") {
        job.status = "cancelled";
        job.completedAt = this.now();
        this.controllers.get(id)?.abort();
        this.controllers.delete(id);
        cancelled = true;
      }
    } else if (input.workKey !== undefined) {
      const workKey = workText(input.workKey, 512);
      for (const [id, job] of this.jobs) {
        if (job.workKey === workKey && job.status === "running") {
          job.status = "cancelled";
          job.completedAt = this.now();
          this.controllers.get(id)?.abort();
          this.controllers.delete(id);
          cancelled = true;
        }
      }
    }
    if (cancelled) this.schedulePersist();
    return { cancelled };
  }

  dispose(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}
