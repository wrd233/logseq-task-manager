export const PLUGIN_ID = "wrd233-logseq-plugin-capability-lab";
export const LAB_PAGE_NAMESPACE = "Task Copilot Lab/";
export const DEFAULT_EXPERIMENT_PAGE = `${LAB_PAGE_NAMESPACE}Capability Lab`;
export const CAPABILITY_MARKER = "capability-lab:: true";
export const OWNER_MARKER = `capability-lab-owner:: ${PLUGIN_ID}`;

export interface LabSettings {
  verboseLogging: boolean;
  experimentPageName: string;
  confirmWrites: boolean;
}

export interface PageNameValidation {
  valid: boolean;
  pageName: string;
  reason: string;
}

export interface PageLike {
  uuid?: unknown;
  name?: unknown;
  originalName?: unknown;
  properties?: unknown;
}

export interface PageOwnershipDecision {
  owned: boolean;
  pageUuid: string | null;
  pageName: string | null;
  labPageId: string | null;
  reason: string;
}

export interface PageReferenceResolution {
  resolved: boolean;
  identities: Array<number | string>;
  observedShape: string;
  reason: string;
}

export interface RegisteredBlockIdentity {
  blockUuid: string;
  pageUuid: string;
}

export interface RegisteredPageIdentity {
  pageUuid: string;
  labPageId: string;
}

export interface DeleteCandidate {
  uuid: string;
  content: string;
  resolvedPageUuid: string | null;
}

export interface DeleteDecision {
  allowed: boolean;
  reason: string;
}

export function normalizeSettings(input: Record<string, unknown> | null | undefined): LabSettings {
  const rawPageName = typeof input?.experimentPageName === "string"
    ? input.experimentPageName.trim()
    : DEFAULT_EXPERIMENT_PAGE;

  return {
    verboseLogging: input?.verboseLogging === true,
    experimentPageName: rawPageName,
    confirmWrites: input?.confirmWrites !== false,
  };
}

export function validateExperimentPageName(input: unknown): PageNameValidation {
  const pageName = typeof input === "string" ? input.trim() : "";
  if (!pageName) {
    return { valid: false, pageName, reason: "Experiment page name is empty." };
  }
  if (pageName.includes("\n") || pageName.includes("\r")) {
    return { valid: false, pageName, reason: "Experiment page name contains a line break." };
  }
  if (!pageName.startsWith(LAB_PAGE_NAMESPACE)) {
    return { valid: false, pageName, reason: `Experiment pages must start with '${LAB_PAGE_NAMESPACE}'.` };
  }
  const suffix = pageName.slice(LAB_PAGE_NAMESPACE.length).trim();
  if (!suffix || suffix === "/") {
    return { valid: false, pageName, reason: "Experiment page namespace requires a non-empty page suffix." };
  }
  if (suffix.includes("../") || suffix === "..") {
    return { valid: false, pageName, reason: "Experiment page name contains an invalid traversal segment." };
  }
  return { valid: true, pageName, reason: "Page is inside the fixed Capability Lab namespace." };
}

export function makeLabPageProperties(labPageId: string): Record<string, string | boolean> {
  if (!labPageId.trim()) throw new Error("Lab page ID must not be empty.");
  return {
    "capability-lab": true,
    "capability-lab-owner": PLUGIN_ID,
    "capability-lab-page-id": labPageId,
  };
}

function asPropertyRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isTrueProperty(value: unknown): boolean {
  return value === true || value === "true";
}

export function checkPageOwnership(page: PageLike | null | undefined): PageOwnershipDecision {
  if (!page) {
    return { owned: false, pageUuid: null, pageName: null, labPageId: null, reason: "Page is unavailable." };
  }
  const pageUuid = typeof page.uuid === "string" ? page.uuid : null;
  const pageName = typeof page.originalName === "string"
    ? page.originalName
    : typeof page.name === "string" ? page.name : null;
  const properties = asPropertyRecord(page.properties);
  const labPageId = typeof properties["capability-lab-page-id"] === "string"
    ? properties["capability-lab-page-id"] as string
    : null;
  if (!pageUuid) {
    return { owned: false, pageUuid, pageName, labPageId, reason: "Page UUID is unavailable." };
  }
  const namespace = validateExperimentPageName(pageName);
  if (!namespace.valid) {
    return { owned: false, pageUuid, pageName, labPageId, reason: `Page is outside the fixed lab namespace: ${namespace.reason}` };
  }
  if (!isTrueProperty(properties["capability-lab"])) {
    return { owned: false, pageUuid, pageName, labPageId, reason: "Page lacks capability-lab ownership marker." };
  }
  if (properties["capability-lab-owner"] !== PLUGIN_ID) {
    return { owned: false, pageUuid, pageName, labPageId, reason: "Page owner does not match this plugin." };
  }
  if (!labPageId?.trim()) {
    return { owned: false, pageUuid, pageName, labPageId, reason: "Page lacks a stable capability-lab-page-id." };
  }
  return { owned: true, pageUuid, pageName, labPageId, reason: "Page UUID and all ownership properties are valid." };
}

export function parsePageReference(reference: unknown): PageReferenceResolution {
  const observedShape = summarizeRuntimeShape(reference);
  if (typeof reference === "number" && Number.isFinite(reference)) {
    return { resolved: true, identities: [reference], observedShape, reason: "Resolved numeric entity ID." };
  }
  if (typeof reference === "string" && reference.trim()) {
    return { resolved: true, identities: [reference.trim()], observedShape, reason: "Resolved string identity." };
  }
  if (reference !== null && typeof reference === "object" && !Array.isArray(reference)) {
    const record = reference as Record<string, unknown>;
    const identities: Array<number | string> = [];
    if (typeof record.uuid === "string" && record.uuid.trim()) identities.push(record.uuid.trim());
    if (typeof record.name === "string" && record.name.trim()) identities.push(record.name.trim());
    if (typeof record.id === "number" && Number.isFinite(record.id)) identities.push(record.id);
    if (identities.length > 0) {
      return { resolved: true, identities, observedShape, reason: "Resolved object page reference." };
    }
  }
  return { resolved: false, identities: [], observedShape, reason: "No supported page identity was present." };
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
  registered: RegisteredBlockIdentity | null | undefined,
  registeredPage: RegisteredPageIdentity | null | undefined,
  pageOwnership: PageOwnershipDecision,
): DeleteDecision {
  if (!registered || registered.blockUuid !== candidate.uuid) {
    return { allowed: false, reason: "UUID is not in this plugin's asset registry." };
  }
  if (!isCapabilityLabContent(candidate.content)) {
    return { allowed: false, reason: "Required capability lab block markers are missing." };
  }
  if (!registered.pageUuid) {
    return { allowed: false, reason: "Registered block has no creation-time page UUID." };
  }
  if (!candidate.resolvedPageUuid) {
    return { allowed: false, reason: "The block's runtime page reference could not be resolved." };
  }
  if (candidate.resolvedPageUuid !== registered.pageUuid) {
    return { allowed: false, reason: "Runtime page UUID differs from the registered creation page UUID." };
  }
  if (!registeredPage || registeredPage.pageUuid !== registered.pageUuid) {
    return { allowed: false, reason: "Creation-time page is missing from the page asset registry." };
  }
  if (!pageOwnership.owned || pageOwnership.pageUuid !== registered.pageUuid) {
    return { allowed: false, reason: `Owning page failed plugin ownership validation: ${pageOwnership.reason}` };
  }
  if (!pageOwnership.labPageId || pageOwnership.labPageId !== registeredPage.labPageId) {
    return { allowed: false, reason: "Runtime stable lab page ID differs from the registered page asset." };
  }
  return { allowed: true, reason: "Registry, block markers, page UUID, and page ownership checks passed." };
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown non-serializable error";
  }
}

export function summarizeText(value: unknown, maxLength = 120): string {
  if (typeof value !== "string") return "当前不可用";
  if (value.length === 0) return "（空字符串）";
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 1)}…`;
}

export function summarizeRuntimeShape(value: unknown, maxLength = 240): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return `${typeof value}:undefined`;
    return `${Array.isArray(value) ? "array" : typeof value}:${summarizeText(serialized, maxLength)}`;
  } catch {
    return `${typeof value}:non-serializable`;
  }
}
