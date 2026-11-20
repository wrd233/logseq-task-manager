import type { ReadingMaterialInput } from "./task.ts";

const SENSITIVE_BASENAME_PATTERNS = [
  /^\.env(?:\..+)?$/iu,
  /^env\.(?:local|prod|production|dev|development|staging|secret)$/iu,
  /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.pub)?$/iu,
  /^\.(?:npmrc|pypirc|netrc|git-credentials|htpasswd|aws|dockerconfigjson)$/iu,
  /^(?:credentials|secrets?|tokens?|passwords?|auth|apikeys?|api-keys?|private-key)(?:\.[a-z0-9_-]+)?$/iu,
];

const SENSITIVE_EXTENSION_PATTERN = /\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ovpn|ppk|asc|gpg)$/iu;
const SENSITIVE_SEGMENT_PATTERN = /(?:^|[^a-z0-9])(?:secrets?|credentials?|private[-_]?keys?|passwords?|api[-_]?keys?)(?:$|[^a-z0-9])/iu;

export function isSensitiveMaterialName(filenameOrPath: string): boolean {
  const normalized = filenameOrPath.trim().replaceAll("\\", "/");
  if (!normalized) return false;
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments.at(-1) ?? normalized;
  if (SENSITIVE_BASENAME_PATTERNS.some((pattern) => pattern.test(basename))) return true;
  if (SENSITIVE_EXTENSION_PATTERN.test(basename)) return true;
  if (segments.some((segment) => /^\.env(?:\..+)?$/iu.test(segment) || segment.toLowerCase() === ".ssh" || segment.toLowerCase() === ".gnupg")) {
    return true;
  }
  return SENSITIVE_SEGMENT_PATTERN.test(basename);
}

export function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface FilteredMaterialsResult {
  materials: ReadingMaterialInput[];
  redactedMaterials: string[];
}

export function filterReadingMaterialsForLocality(
  materials: ReadingMaterialInput[] | undefined,
  locality: "remote" | "local"
): FilteredMaterialsResult {
  if (!materials?.length) return { materials: [], redactedMaterials: [] };
  if (locality === "local") return { materials, redactedMaterials: [] };
  const redactedMaterials: string[] = [];
  const filtered = materials.map((material) => {
    if (material.note) return material;
    const candidate = material.path ? `${material.path}/${material.filename}` : material.filename;
    if (!isSensitiveMaterialName(material.filename) && !isSensitiveMaterialName(candidate)) {
      return material;
    }
    redactedMaterials.push(material.filename);
    const { text: _text, excerpt: _excerpt, ...rest } = material;
    void _text;
    void _excerpt;
    return {
      ...rest,
      truncated: true,
      sensitiveRedacted: true,
    };
  });
  return { materials: filtered, redactedMaterials };
}
