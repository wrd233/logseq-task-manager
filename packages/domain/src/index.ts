export type WorkObjectKind = "TASK" | "MINI_PROJECT" | "PROJECT";
export type Lifecycle = "OPEN" | "COMPLETED" | "CANCELLED";
export type Engagement = "ACTIONABLE" | "WAITING" | "PARKED" | null;

export interface WorkObject {
  id: string;
  kind: WorkObjectKind;
  title: string;
  lifecycle: Lifecycle;
  engagement: Engagement;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrimaryAnchor {
  id: string;
  workObjectId: string;
  graphId: string;
  externalId: string;
  sourceContentHash: string;
  projectionContainerUuid: string;
  projectionTitleUuid: string;
  projectionStateUuid: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceReference {
  id: string;
  workObjectId: string;
  graphId: string;
  externalId: string;
  contentHash: string;
  createdAt: string;
}

export interface PrimaryOwnership {
  childId: string;
  ownerId: string;
  createdAt: string;
}

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "DomainError";
    this.code = code;
  }
}

const kinds = new Set<WorkObjectKind>(["TASK", "MINI_PROJECT", "PROJECT"]);

function required(value: string, code: string, label: string, maximum = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new DomainError(code, `${label} is required.`);
  if (normalized.length > maximum) throw new DomainError(`${code}_TOO_LONG`, `${label} exceeds ${maximum} characters.`);
  return normalized;
}

function timestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new DomainError("TIMESTAMP_INVALID", "Timestamp must be ISO-compatible.");
  return new Date(value).toISOString();
}

export function createWorkObject(input: {
  id: string;
  kind: WorkObjectKind;
  title: string;
  at: string;
}): WorkObject {
  if (!kinds.has(input.kind)) throw new DomainError("WORK_OBJECT_KIND_INVALID", "WorkObject kind is not supported.");
  const at = timestamp(input.at);
  return {
    id: required(input.id, "WORK_OBJECT_ID_REQUIRED", "WorkObject id", 128),
    kind: input.kind,
    title: required(input.title, "WORK_OBJECT_TITLE_REQUIRED", "WorkObject title"),
    lifecycle: "OPEN",
    engagement: "ACTIONABLE",
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

export function renameWorkObject(
  object: WorkObject,
  input: { title: string; expectedVersion: number; at: string },
): WorkObject {
  if (object.version !== input.expectedVersion) {
    throw new DomainError("WORK_OBJECT_VERSION_MISMATCH", `Expected version ${input.expectedVersion}, found ${object.version}.`);
  }
  return {
    ...object,
    title: required(input.title, "WORK_OBJECT_TITLE_REQUIRED", "WorkObject title"),
    version: object.version + 1,
    updatedAt: timestamp(input.at),
  };
}
