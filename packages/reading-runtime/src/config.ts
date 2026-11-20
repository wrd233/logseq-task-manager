import { WorkspaceError } from "@task-copilot/contracts";
import { isLoopbackUrl } from "./privacy.ts";

export type ProviderKind = "openai-compatible" | "anthropic" | "dsh";
export type ProviderLocality = "remote" | "local";
export type ReadingRole = "fast" | "deep" | "local";
export type ReadingPrivacyMode = "default" | "local-only";
export type ReadingTrigger = "manual" | "background";

export interface ReadingProviderProfile {
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  locality: ProviderLocality;
}

export interface ReadingBudgetConfig {
  maxStepsPerRun: number;
  timeoutMs: number;
  backgroundMaxPerHour: number;
  backgroundMaxPerDay: number;
}

export interface ReadingRuntimeConfig {
  schemaVersion: 1;
  routes: {
    fast: string | null;
    deep: string | null;
    local: string | null;
  };
  budget: ReadingBudgetConfig;
  profiles: Record<string, ReadingProviderProfile>;
}

export interface SanitizedProviderEntry {
  id: string;
  label: string;
  kind: ProviderKind;
  model: string | null;
  locality: ProviderLocality;
  configured: boolean;
  credentialSource: "env" | "inline" | "none" | "dsh";
  credentialEnv?: string;
}

export interface SanitizedProvidersSnapshot {
  schemaVersion: 1;
  routes: ReadingRuntimeConfig["routes"];
  budget: ReadingBudgetConfig & {
    backgroundUsedLastHour: number;
    backgroundUsedLastDay: number;
    backgroundPaused: boolean;
  };
  profiles: SanitizedProviderEntry[];
  source: "file" | "default";
}

export const DEFAULT_BUDGET: ReadingBudgetConfig = {
  maxStepsPerRun: 8,
  timeoutMs: 120_000,
  backgroundMaxPerHour: 12,
  backgroundMaxPerDay: 60,
};

export const DEFAULT_DEEPSEEK_PROFILE_ID = "deepseek-flash";

export function defaultReadingConfig(
  env: Record<string, string | undefined> = process.env,
  options: { dshAvailable?: boolean } = {}
): ReadingRuntimeConfig {
  const hasDeepSeekKey = Boolean(env.DEEPSEEK_API_KEY?.trim());
  const defaultRoute = hasDeepSeekKey
    ? DEFAULT_DEEPSEEK_PROFILE_ID
    : options.dshAvailable
      ? "dsh"
      : DEFAULT_DEEPSEEK_PROFILE_ID;
  return {
    schemaVersion: 1,
    routes: {
      fast: defaultRoute,
      deep: defaultRoute,
      local: null,
    },
    budget: { ...DEFAULT_BUDGET },
    profiles: {
      [DEFAULT_DEEPSEEK_PROFILE_ID]: {
        label: "DeepSeek 默认",
        kind: "openai-compatible",
        baseUrl: (env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1").replace(/\/+$/u, ""),
        model: env.DEEPSEEK_READING_MODEL?.trim() || "deepseek-chat",
        apiKey: "env:DEEPSEEK_API_KEY",
        maxTokens: 8192,
        locality: "remote",
      },
      dsh: {
        label: "DSH 当前模型（兼容）",
        kind: "dsh",
        locality: "remote",
      },
    },
  };
}

export function resolveApiKey(
  ref: string | undefined,
  env: Record<string, string | undefined> = process.env
): { value: string; source: "env" | "inline" | "none"; envName?: string } {
  const trimmed = ref?.trim() ?? "";
  if (!trimmed) return { value: "", source: "none" };
  if (trimmed.startsWith("env:")) {
    const envName = trimmed.slice(4).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(envName)) {
      throw new WorkspaceError("READING_CONFIG_INVALID", `Invalid environment variable reference: ${trimmed}`);
    }
    return { value: env[envName]?.trim() ?? "", source: "env", envName };
  }
  return { value: trimmed, source: "inline" };
}

function asObject(value: unknown, code = "READING_CONFIG_INVALID"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError(code);
  return value as Record<string, unknown>;
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new WorkspaceError("READING_CONFIG_INVALID");
  }
  return value;
}

function parseProfileId(value: unknown, allowNull = false): string | null {
  if (value === null || value === undefined) {
    if (allowNull) return null;
    throw new WorkspaceError("READING_CONFIG_INVALID");
  }
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(value)) {
    throw new WorkspaceError("READING_CONFIG_INVALID", `Invalid profile id: ${String(value)}`);
  }
  return value;
}

export function parseReadingConfig(raw: unknown): ReadingRuntimeConfig {
  const root = asObject(raw);
  const allowedRoot = new Set(["schemaVersion", "routes", "budget", "profiles"]);
  for (const key of Object.keys(root)) {
    if (!allowedRoot.has(key)) throw new WorkspaceError("READING_CONFIG_INVALID", `Unknown config key: ${key}`);
  }
  if (root.schemaVersion !== 1) throw new WorkspaceError("READING_CONFIG_INVALID", "Unsupported schemaVersion");

  const rawProfiles = asObject(root.profiles);
  const profiles: Record<string, ReadingProviderProfile> = {};
  const allowedProfileKeys = new Set([
    "label",
    "kind",
    "baseUrl",
    "model",
    "apiKey",
    "maxTokens",
    "reasoningEffort",
    "locality",
  ]);

  for (const [id, rawEntry] of Object.entries(rawProfiles)) {
    parseProfileId(id, false);
    const entry = asObject(rawEntry);
    for (const key of Object.keys(entry)) {
      if (!allowedProfileKeys.has(key)) {
        throw new WorkspaceError("READING_CONFIG_INVALID", `Unknown profile key: ${key}`);
      }
    }
    const kind = entry.kind;
    if (kind !== "openai-compatible" && kind !== "anthropic" && kind !== "dsh") {
      throw new WorkspaceError("READING_CONFIG_INVALID", `Unsupported provider kind: ${String(kind)}`);
    }
    const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 120) : id;
    const locality = entry.locality ?? (kind === "dsh" ? "remote" : undefined);
    if (locality !== "remote" && locality !== "local") {
      throw new WorkspaceError("READING_CONFIG_INVALID", `Profile ${id} requires locality remote|local`);
    }
    let baseUrl: string | undefined;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (kind !== "dsh") {
      if (typeof entry.baseUrl !== "string" || !entry.baseUrl.trim()) {
        throw new WorkspaceError("READING_CONFIG_INVALID", `Profile ${id} requires baseUrl`);
      }
      const normalizedUrl = entry.baseUrl.trim().replace(/\/+$/u, "");
      let parsed: URL;
      try {
        parsed = new URL(normalizedUrl);
      } catch {
        throw new WorkspaceError("READING_CONFIG_INVALID", `Profile ${id} has invalid baseUrl`);
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new WorkspaceError("READING_CONFIG_INVALID", `Profile ${id} baseUrl must use http or https`);
      }
      if (locality === "local" && !isLoopbackUrl(normalizedUrl)) {
        throw new WorkspaceError("READING_CONFIG_INVALID", `Local profile ${id} must target a loopback URL`);
      }
      baseUrl = normalizedUrl;
      if (typeof entry.model !== "string" || !entry.model.trim()) {
        throw new WorkspaceError("READING_CONFIG_INVALID", `Profile ${id} requires model`);
      }
      model = entry.model.trim().slice(0, 160);
      if (entry.apiKey !== undefined) {
        if (typeof entry.apiKey !== "string") {
          throw new WorkspaceError("READING_CONFIG_INVALID", `Profile ${id} apiKey must be a string`);
        }
        apiKey = entry.apiKey;
      }
    }
    const maxTokens =
      entry.maxTokens !== undefined ? boundedInt(entry.maxTokens, 8192, 256, 65536) : undefined;
    let reasoningEffort: "low" | "medium" | "high" | undefined;
    if (entry.reasoningEffort !== undefined) {
      if (
        entry.reasoningEffort !== "low" &&
        entry.reasoningEffort !== "medium" &&
        entry.reasoningEffort !== "high"
      ) {
        throw new WorkspaceError("READING_CONFIG_INVALID", `Invalid reasoningEffort on ${id}`);
      }
      reasoningEffort = entry.reasoningEffort;
    }
    profiles[id] = {
      label,
      kind,
      locality,
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    };
  }

  const rawRoutes = root.routes === undefined ? {} : asObject(root.routes);
  const allowedRoutes = new Set(["fast", "deep", "local"]);
  for (const key of Object.keys(rawRoutes)) {
    if (!allowedRoutes.has(key)) throw new WorkspaceError("READING_CONFIG_INVALID", `Unknown route: ${key}`);
  }
  const fast = parseProfileId(rawRoutes.fast ?? null, true);
  const deep = parseProfileId(rawRoutes.deep ?? null, true);
  const local = parseProfileId(rawRoutes.local ?? null, true);

  for (const [role, target] of [
    ["fast", fast],
    ["deep", deep],
    ["local", local],
  ] as const) {
    if (target && !Object.hasOwn(profiles, target)) {
      throw new WorkspaceError("READING_CONFIG_INVALID", `Route ${role} points to unknown profile ${target}`);
    }
    if (role === "local" && target && profiles[target]!.locality !== "local") {
      throw new WorkspaceError("READING_CONFIG_INVALID", `Route local must point to a locality=local profile`);
    }
  }

  const rawBudget = root.budget === undefined ? {} : asObject(root.budget);
  const allowedBudget = new Set(["maxStepsPerRun", "timeoutMs", "backgroundMaxPerHour", "backgroundMaxPerDay"]);
  for (const key of Object.keys(rawBudget)) {
    if (!allowedBudget.has(key)) throw new WorkspaceError("READING_CONFIG_INVALID", `Unknown budget key: ${key}`);
  }
  const budget: ReadingBudgetConfig = {
    maxStepsPerRun: boundedInt(rawBudget.maxStepsPerRun, DEFAULT_BUDGET.maxStepsPerRun, 1, 24),
    timeoutMs: boundedInt(rawBudget.timeoutMs, DEFAULT_BUDGET.timeoutMs, 5_000, 600_000),
    backgroundMaxPerHour: boundedInt(rawBudget.backgroundMaxPerHour, DEFAULT_BUDGET.backgroundMaxPerHour, 0, 500),
    backgroundMaxPerDay: boundedInt(rawBudget.backgroundMaxPerDay, DEFAULT_BUDGET.backgroundMaxPerDay, 0, 5000),
  };

  return {
    schemaVersion: 1,
    routes: { fast, deep, local },
    budget,
    profiles,
  };
}

export function isProfileConfigured(
  profile: ReadingProviderProfile,
  env: Record<string, string | undefined>,
  dshAvailable: boolean
): { configured: boolean; credentialSource: "env" | "inline" | "none" | "dsh"; credentialEnv?: string } {
  if (profile.kind === "dsh") {
    return { configured: dshAvailable, credentialSource: "dsh" };
  }
  const resolved = resolveApiKey(profile.apiKey, env);
  if (profile.locality === "local") {
    return {
      configured: Boolean(profile.baseUrl && profile.model && isLoopbackUrl(profile.baseUrl)),
      credentialSource: resolved.source,
      ...(resolved.envName ? { credentialEnv: resolved.envName } : {}),
    };
  }
  return {
    configured: Boolean(profile.baseUrl && profile.model && resolved.value),
    credentialSource: resolved.source,
    ...(resolved.envName ? { credentialEnv: resolved.envName } : {}),
  };
}

export function sanitizeReadingProviders(
  config: ReadingRuntimeConfig,
  env: Record<string, string | undefined>,
  options: {
    dshAvailable: boolean;
    source: "file" | "default";
    backgroundUsedLastHour: number;
    backgroundUsedLastDay: number;
  }
): SanitizedProvidersSnapshot {
  const profiles: SanitizedProviderEntry[] = Object.entries(config.profiles).map(([id, profile]) => {
    const status = isProfileConfigured(profile, env, options.dshAvailable);
    return {
      id,
      label: profile.label,
      kind: profile.kind,
      model: profile.model ?? null,
      locality: profile.locality,
      configured: status.configured,
      credentialSource: status.credentialSource,
      ...(status.credentialEnv ? { credentialEnv: status.credentialEnv } : {}),
    };
  });
  const backgroundPaused =
    options.backgroundUsedLastHour >= config.budget.backgroundMaxPerHour ||
    options.backgroundUsedLastDay >= config.budget.backgroundMaxPerDay;
  return {
    schemaVersion: 1,
    routes: { ...config.routes },
    budget: {
      ...config.budget,
      backgroundUsedLastHour: options.backgroundUsedLastHour,
      backgroundUsedLastDay: options.backgroundUsedLastDay,
      backgroundPaused,
    },
    profiles,
    source: options.source,
  };
}
