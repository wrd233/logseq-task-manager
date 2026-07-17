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
  const random = entropy ?? globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  return `${prefix}_${time}_${random}`;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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
