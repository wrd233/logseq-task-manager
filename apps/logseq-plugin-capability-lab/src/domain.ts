export const PLUGIN_ID = "wrd233-logseq-plugin-capability-lab";
export const DEFAULT_EXPERIMENT_PAGE = "Logseq Plugin Capability Lab";
export const CAPABILITY_MARKER = "capability-lab:: true";
export const OWNER_MARKER = `capability-lab-owner:: ${PLUGIN_ID}`;

export interface LabSettings {
  verboseLogging: boolean;
  experimentPageName: string;
  confirmWrites: boolean;
}

export interface DeleteCandidate {
  uuid: string;
  content: string;
  pageName: string | null;
}

export interface DeleteDecision {
  allowed: boolean;
  reason: string;
}

export function normalizeSettings(input: Record<string, unknown> | null | undefined): LabSettings {
  const rawPageName = typeof input?.experimentPageName === "string"
    ? input.experimentPageName.trim()
    : "";

  return {
    verboseLogging: input?.verboseLogging === true,
    experimentPageName: rawPageName || DEFAULT_EXPERIMENT_PAGE,
    confirmWrites: input?.confirmWrites !== false,
  };
}

export function makeExperimentContent(label: string, runId: string): string {
  const safeLabel = label.trim() || "unnamed experiment";
  return [
    `${safeLabel} [${runId}]`,
    CAPABILITY_MARKER,
    OWNER_MARKER,
    `capability-lab-run:: ${runId}`,
  ].join("\n");
}

export function isCapabilityLabContent(content: unknown): content is string {
  return typeof content === "string"
    && content.split("\n").includes(CAPABILITY_MARKER)
    && content.split("\n").includes(OWNER_MARKER);
}

export function canDeleteBlock(
  candidate: DeleteCandidate,
  createdUuids: ReadonlySet<string>,
  expectedPageName: string,
): DeleteDecision {
  if (!createdUuids.has(candidate.uuid)) {
    return { allowed: false, reason: "UUID is not in this plugin's creation registry." };
  }
  if (!isCapabilityLabContent(candidate.content)) {
    return { allowed: false, reason: "Required capability lab markers are missing." };
  }
  if (!candidate.pageName) {
    return { allowed: false, reason: "The block's owning page could not be resolved." };
  }
  if (candidate.pageName.localeCompare(expectedPageName, undefined, { sensitivity: "accent" }) !== 0) {
    return { allowed: false, reason: "The block is outside the configured experiment page." };
  }
  return { allowed: true, reason: "Registry, marker, owner, and page checks passed." };
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown non-serializable error";
  }
}

export function summarizeText(value: unknown, maxLength = 120): string {
  if (typeof value !== "string" || value.length === 0) {
    return "当前不可用";
  }
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 1)}…`;
}
