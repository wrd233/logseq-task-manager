export type IdPrefix =
  | "obj"
  | "cap"
  | "rel"
  | "anc"
  | "prop"
  | "op"
  | "commit"
  | "event"
  | "backup"
  | "creation"
  | "creation_event";

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

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256(value: unknown): string {
  const text = typeof value === "string" ? value : stableJson(value);
  const source = new TextEncoder().encode(text);
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(source);
  padded[source.length] = 0x80;
  const bitLength = source.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15]!;
      const previous2 = words[index - 2]!;
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choose = (e! & f!) ^ (~e! & g!);
      const temporary1 = (h! + sum1 + choose + sha256RoundConstants[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }
  return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
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
