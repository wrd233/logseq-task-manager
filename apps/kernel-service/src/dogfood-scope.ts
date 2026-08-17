import { readFile } from "node:fs/promises";
import type { SqliteStore } from "@task-copilot/sqlite";

export interface DogfoodConfig {
  maintenance: boolean;
  formalization: boolean;
  closure: boolean;
  roots: readonly string[];
}

export const DEFAULT_DOGFOOD_CONFIG: DogfoodConfig = { maintenance: true, formalization: false, closure: false, roots: [] };

export async function loadDogfoodConfig(path: string | undefined): Promise<DogfoodConfig | null> {
  if (!path) return null;
  try {
    const raw = await readFile(path, "utf8");
    const value = JSON.parse(raw) as Partial<DogfoodConfig>;
    return {
      maintenance: value.maintenance ?? DEFAULT_DOGFOOD_CONFIG.maintenance,
      formalization: value.formalization ?? DEFAULT_DOGFOOD_CONFIG.formalization,
      closure: value.closure ?? DEFAULT_DOGFOOD_CONFIG.closure,
      roots: Array.isArray(value.roots) ? value.roots.filter((item): item is string => typeof item === "string") : [],
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export interface DogfoodScope {
  isMaintenanceEnabled(): boolean;
  isFormalizationEnabled(): boolean;
  isClosureEnabled(): boolean;
  isInScope(workObjectId: string): boolean;
  roots(): readonly string[];
}

/**
 * Dogfood scope is a runtime config, not a Formal fact. When no config is
 * supplied, the system keeps today's unrestricted behaviour so existing tests
 * and non-dogfood deployments are unchanged. When a config with roots is
 * supplied, background autonomous governance is limited to those roots and
 * their current ownership descendants.
 */
export function createDogfoodScope(store: SqliteStore, config: DogfoodConfig | null): DogfoodScope {
  const resolved = new Set<string>();
  if (config) {
    const queue = [...config.roots];
    while (queue.length) {
      const id = queue.shift()!;
      if (resolved.has(id)) continue;
      if (!store.getWorkObject(id)) continue;
      resolved.add(id);
      for (const ownership of store.listOwnerships()) {
        if (ownership.ownerId === id && !resolved.has(ownership.childId)) queue.push(ownership.childId);
      }
    }
  }
  const unrestricted = config === null || config.roots.length === 0;
  const isInScope = (workObjectId: string): boolean => unrestricted || resolved.has(workObjectId);
  return {
    isMaintenanceEnabled: () => config === null || config.maintenance,
    isFormalizationEnabled: () => config === null || config.formalization,
    isClosureEnabled: () => config === null || config.closure,
    isInScope,
    roots: () => config?.roots ?? [],
  };
}
