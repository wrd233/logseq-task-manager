export type IdPrefix =
  | "obj"
  | "cap"
  | "rel"
  | "anc"
  | "prop"
  | "op"
  | "commit"
  | "event"
  | "backup";

export function createId(prefix: IdPrefix, now = new Date(), entropy?: string): string {
  const time = now.toISOString().replace(/\D/g, "").slice(0, 17);
  const random = entropy ?? globalThis.crypto.randomUUID().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(random)) {
    throw new Error("Stable ID entropy must be exactly 128 bits encoded as 32 hexadecimal characters.");
  }
  return `${prefix}_${time}_${random}`;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => item === undefined ? "null" : stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError(`stableJson cannot serialize a top-level ${typeof value} value.`);
  }
  return serialized;
}

export function checksum(value: unknown): string {
  const text = typeof value === "string" ? value : stableJson(value);
  let crc = 0xffffffff;
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index);
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

export interface StructuredErrorShape {
  code: string;
  message: string;
  ruleRefs: string[];
  details?: Record<string, unknown>;
}

export class StructuredError extends Error {
  readonly code: string;
  readonly ruleRefs: string[];
  readonly details: Record<string, unknown> | undefined;

  constructor(shape: StructuredErrorShape) {
    super(shape.message);
    this.name = "StructuredError";
    this.code = shape.code;
    this.ruleRefs = shape.ruleRefs;
    this.details = shape.details;
  }
}

export type StorageErrorKind = "NOT_FOUND" | "CORRUPTED" | "PERMISSION_DENIED" | "IO_ERROR" | "UNKNOWN";

function storageErrorFields(error: unknown): string[] {
  if (typeof error === "string") return [error];
  if (error instanceof Error) return [error.name, error.message, ...(error.cause ? [String(error.cause)] : [])];
  if (!error || typeof error !== "object" || Array.isArray(error)) return [String(error)];
  const shape = error as Record<string, unknown>;
  return ["name", "message", "code", "error", "reason"].map((key) => shape[key]).filter((value): value is string => typeof value === "string");
}

export function classifyStorageError(error: unknown): StorageErrorKind {
  const text = storageErrorFields(error).join(" ").toLowerCase();
  if (/file\s+not\s+existed|not[ -]?found|no such file|\benoent\b/.test(text)) return "NOT_FOUND";
  if (/corrupt|invalid\s+json|malformed|checksum/.test(text)) return "CORRUPTED";
  if (/permission|access denied|operation not permitted|\beacces\b|\beperm\b/.test(text)) return "PERMISSION_DENIED";
  if (/\beio\b|i\/o|io error|should not join with empty dir/.test(text)) return "IO_ERROR";
  return "UNKNOWN";
}
