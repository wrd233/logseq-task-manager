export const REGISTRY_SCHEMA_VERSION = 1 as const;

export interface LabPageAsset {
  pageUuid: string;
  pageNameAtCreation: string;
  labPageId: string;
  createdAt: string;
}

export interface LabBlockAsset {
  blockUuid: string;
  pageUuid: string;
  runId: string;
  createdAt: string;
}

export interface LabRegistry {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  pages: LabPageAsset[];
  blocks: LabBlockAsset[];
  storageKeys: string[];
  updatedAt: string;
}

export interface RegistryParseResult {
  registry: LabRegistry;
  migrated: boolean;
  degraded: boolean;
  warnings: string[];
}

export function emptyRegistry(now: string): LabRegistry {
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, pages: [], blocks: [], storageKeys: [], updatedAt: now };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseRegistry(raw: unknown, now: string): RegistryParseResult {
  if (raw === undefined || raw === null || raw === "") {
    return { registry: emptyRegistry(now), migrated: false, degraded: false, warnings: [] };
  }
  let value: unknown = raw;
  try {
    if (typeof raw === "string") value = JSON.parse(raw);
  } catch (error) {
    return {
      registry: emptyRegistry(now), migrated: false, degraded: true,
      warnings: [`Registry JSON is corrupt; loaded an empty in-memory registry: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  if (!isRecord(value)) {
    return { registry: emptyRegistry(now), migrated: false, degraded: true, warnings: ["Registry root is not an object."] };
  }

  if (Array.isArray(value.createdUuids) && value.schemaVersion === undefined) {
    const blocks = value.createdUuids
      .filter((uuid): uuid is string => typeof uuid === "string" && uuid.length > 0)
      .map((blockUuid) => ({ blockUuid, pageUuid: "", runId: "legacy-unresolved", createdAt: now }));
    return {
      registry: { ...emptyRegistry(now), blocks }, migrated: true, degraded: false,
      warnings: ["Migrated legacy UUID list. Page identity must be recovered from an owned runtime page before deletion."],
    };
  }

  if (value.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    return { registry: emptyRegistry(now), migrated: false, degraded: true, warnings: [`Unsupported registry schema version: ${String(value.schemaVersion)}`] };
  }

  const warnings: string[] = [];
  if (!Array.isArray(value.pages)) warnings.push("Registry pages field is missing or is not an array.");
  if (!Array.isArray(value.blocks)) warnings.push("Registry blocks field is missing or is not an array.");
  if (!Array.isArray(value.storageKeys)) warnings.push("Registry storageKeys field is missing or is not an array.");
  if (!stringValue(value.updatedAt)) warnings.push("Registry updatedAt field is missing or invalid.");
  const pages: LabPageAsset[] = Array.isArray(value.pages) ? value.pages.flatMap((item) => {
    if (!isRecord(item)) return [];
    const pageUuid = stringValue(item.pageUuid);
    const pageNameAtCreation = stringValue(item.pageNameAtCreation);
    const labPageId = stringValue(item.labPageId);
    const createdAt = stringValue(item.createdAt);
    if (!pageUuid || !pageNameAtCreation || !labPageId || !createdAt) return [];
    return [{ pageUuid, pageNameAtCreation, labPageId, createdAt }];
  }) : [];
  const blocks: LabBlockAsset[] = Array.isArray(value.blocks) ? value.blocks.flatMap((item) => {
    if (!isRecord(item)) return [];
    const blockUuid = stringValue(item.blockUuid);
    const pageUuid = typeof item.pageUuid === "string" ? item.pageUuid : null;
    const runId = stringValue(item.runId);
    const createdAt = stringValue(item.createdAt);
    if (!blockUuid || pageUuid === null || !runId || !createdAt) return [];
    return [{ blockUuid, pageUuid, runId, createdAt }];
  }) : [];
  const storageKeys = Array.isArray(value.storageKeys)
    ? [...new Set(value.storageKeys.filter((key): key is string => typeof key === "string" && key.length > 0))]
    : [];
  if (Array.isArray(value.pages) && pages.length !== value.pages.length) warnings.push("Dropped malformed page registry entries.");
  if (Array.isArray(value.blocks) && blocks.length !== value.blocks.length) warnings.push("Dropped malformed block registry entries.");
  return {
    registry: { schemaVersion: REGISTRY_SCHEMA_VERSION, pages, blocks, storageKeys, updatedAt: stringValue(value.updatedAt) ?? now },
    migrated: false,
    degraded: warnings.length > 0,
    warnings,
  };
}

export function registerPage(registry: LabRegistry, page: LabPageAsset, now: string): LabRegistry {
  return { ...registry, pages: [...registry.pages.filter((item) => item.pageUuid !== page.pageUuid), page], updatedAt: now };
}

export function registerBlock(registry: LabRegistry, block: LabBlockAsset, now: string): LabRegistry {
  return { ...registry, blocks: [...registry.blocks.filter((item) => item.blockUuid !== block.blockUuid), block], updatedAt: now };
}

export function registerStorageKey(registry: LabRegistry, key: string, now: string): LabRegistry {
  return { ...registry, storageKeys: [...new Set([...registry.storageKeys, key])], updatedAt: now };
}

export function removeStorageKey(registry: LabRegistry, key: string, now: string): LabRegistry {
  return { ...registry, storageKeys: registry.storageKeys.filter((item) => item !== key), updatedAt: now };
}

export function removeBlockAssets(registry: LabRegistry, blockUuids: ReadonlySet<string>, now: string): LabRegistry {
  return { ...registry, blocks: registry.blocks.filter((item) => !blockUuids.has(item.blockUuid)), updatedAt: now };
}
