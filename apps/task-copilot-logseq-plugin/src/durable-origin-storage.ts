import type { OriginRouteToken } from "./origin-route-controller.ts";

export const DURABLE_ORIGIN_STORAGE_KEY = "task-copilot-navigation-origin-v1.json";

export interface DurableOriginStorage {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

interface DurableOriginRecord {
  schemaVersion: 1;
  graphKey: string;
  token: OriginRouteToken;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    });
}

function isToken(value: unknown): value is OriginRouteToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const token = value as Record<string, unknown>;
  const expectedKeys = token.kind === "BLOCK"
    ? ["blockUuid", "kind", "pageName", "pageUuid", "surface"]
    : ["kind", "pageName", "pageUuid", "surface"];
  if (Object.keys(token).sort().join("|") !== expectedKeys.sort().join("|")) return false;
  if (token.kind !== "BLOCK" && token.kind !== "PAGE") return false;
  if (token.surface !== "MAIN_PAGE" && token.surface !== "SECONDARY_PAGE") return false;
  if (!boundedText(token.pageUuid, 256) || !boundedText(token.pageName, 1_024)) return false;
  return token.kind === "PAGE" || boundedText(token.blockUuid, 256);
}

function isGraphKey(value: unknown): value is string {
  return typeof value === "string" && /^graph-[a-f0-9]{64}$/u.test(value);
}

export async function loadDurableOrigin(
  storage: DurableOriginStorage,
  graphKey: string,
): Promise<OriginRouteToken | undefined> {
  if (!isGraphKey(graphKey)) return undefined;
  try {
    const raw = await storage.getItem(DURABLE_ORIGIN_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length < 2 || raw.length > 4_096) return undefined;
    const record = JSON.parse(raw) as Partial<DurableOriginRecord>;
    if (
      !record
      || typeof record !== "object"
      || Object.keys(record).sort().join("|") !== "graphKey|schemaVersion|token"
      || record.schemaVersion !== 1
      || record.graphKey !== graphKey
      || !isToken(record.token)
    ) return undefined;
    return record.token;
  } catch {
    return undefined;
  }
}

export async function saveDurableOrigin(
  storage: DurableOriginStorage,
  graphKey: string,
  token: OriginRouteToken,
): Promise<void> {
  if (!isGraphKey(graphKey) || !isToken(token)) throw new Error("DURABLE_ORIGIN_INVALID");
  const record: DurableOriginRecord = { schemaVersion: 1, graphKey, token };
  await storage.setItem(DURABLE_ORIGIN_STORAGE_KEY, JSON.stringify(record));
}

export async function clearDurableOrigin(storage: DurableOriginStorage): Promise<void> {
  await storage.removeItem(DURABLE_ORIGIN_STORAGE_KEY);
}
