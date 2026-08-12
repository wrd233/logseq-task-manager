import type { WorkObject, WorkObjectKind } from "@task-copilot/domain";
export type { WorkObject } from "@task-copilot/domain";

export type ActorType = "USER" | "SYSTEM" | "AGENT";
export interface Actor { type: ActorType; id: string }

export type CommitStatus =
  | "PREPARED"
  | "KERNEL_APPLIED"
  | "GRAPH_APPLIED"
  | "COMMITTED"
  | "RECOVERY_REQUIRED"
  | "ABORTED";

export type OperationType = "CREATE_WORK_OBJECT" | "RENAME_WORK_OBJECT" | "UNDO_COMMIT";

export interface AnchorInput {
  graphId: string;
  blockUuid: string;
  sourceContentHash: string;
}

export interface CreateWorkObjectOperation {
  operationId: string;
  type: "CREATE_WORK_OBJECT";
  actor: Actor;
  input: { kind: WorkObjectKind; title: string; anchor: AnchorInput };
  preconditions: readonly [
    { kind: "SOURCE_CONTENT_HASH"; expected: string },
    { kind: "MANAGED_PROJECTION_ABSENT"; expected: true },
  ];
}

export interface RenameWorkObjectOperation {
  operationId: string;
  type: "RENAME_WORK_OBJECT";
  actor: Actor;
  target: { workObjectId: string; expectedVersion: number; expectedProjectionHash: string };
  input: { title: string };
  preconditions: readonly [
    { kind: "WORK_OBJECT_VERSION"; expected: number },
    { kind: "MANAGED_PROJECTION_HASH"; expected: string },
  ];
}

export interface UndoCommitOperation {
  operationId: string;
  type: "UNDO_COMMIT";
  actor: Actor;
  target: { commitId: string; expectedProjectionHash: string };
  input: Record<string, never>;
  preconditions: readonly [{ kind: "MANAGED_PROJECTION_HASH"; expected: string }];
}

export type SemanticOperation = CreateWorkObjectOperation | RenameWorkObjectOperation | UndoCommitOperation;

export interface ManagedProjection {
  containerUuid: string;
  titleUuid: string;
  stateUuid: string;
  title: string;
  lifecycle: WorkObject["lifecycle"];
  engagement: WorkObject["engagement"];
  projectionHash: string;
}

export interface GraphSnapshot {
  graphId: string;
  sourceBlockUuid: string;
  sourceContentHash: string;
  projection: ManagedProjection | null;
}

interface GraphEffectIdentity {
  commitId: string;
  effectId: string;
  graphId: string;
  sourceBlockUuid: string;
}

export type GraphEffect =
  | (GraphEffectIdentity & { type: "UPSERT_MANAGED_PROJECTION"; projection: ManagedProjection })
  | (GraphEffectIdentity & { type: "UPDATE_MANAGED_FIELD"; fieldUuid: string; content: string; expectedProjectionHash: string; resultingProjectionHash: string })
  | (GraphEffectIdentity & { type: "REMOVE_MANAGED_PROJECTION"; containerUuid: string; expectedProjectionHash: string });

export interface GraphApplyResult {
  commitId: string;
  effectId: string;
  effectType: GraphEffect["type"];
  graphId: string;
  sourceBlockUuid: string;
  projectionHash: string | null;
  appliedAt: string;
}

export interface GraphAdapter {
  readGraphSnapshot(input: { graphId: string; sourceBlockUuid: string }): Promise<GraphSnapshot>;
  applyGraphEffect(effect: GraphEffect): Promise<GraphApplyResult>;
}

export interface StoredCommit {
  id: string;
  status: CommitStatus;
  actor: Actor;
  operationType: OperationType;
  targetId: string | null;
  operation: unknown;
  preconditions: unknown;
  before: unknown;
  after: unknown;
  inverse: unknown;
  graphEffect: unknown;
  graphResult: unknown;
  failureReason: string | null;
  compensationFor: string | null;
  compensatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ContractError";
    this.code = code;
  }
}

function record(value: unknown, code: string, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContractError(code, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], code: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ContractError(code, `Unknown field: ${unknown.sort()[0]}.`);
}

function text(value: unknown, code: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ContractError(code, `${label} is required.`);
  return value.trim();
}

function hash(value: unknown, code: string): string {
  const normalized = text(value, code, "Hash");
  if (!/^[0-9a-f]{8}$/u.test(normalized)) throw new ContractError(code, "Hash must be eight lowercase hexadecimal characters.");
  return normalized;
}

function actor(value: unknown): Actor {
  const candidate = record(value, "ACTOR_INVALID", "Actor");
  exactKeys(candidate, ["type", "id"], "ACTOR_UNKNOWN_FIELD");
  if (candidate.type !== "USER" && candidate.type !== "SYSTEM" && candidate.type !== "AGENT") {
    throw new ContractError("ACTOR_TYPE_INVALID", "Actor type is unsupported.");
  }
  return { type: candidate.type, id: text(candidate.id, "ACTOR_ID_REQUIRED", "Actor id") };
}

export function parseSemanticOperation(value: unknown): SemanticOperation {
  const candidate = record(value, "OPERATION_INVALID", "Operation");
  const operationType = candidate.type;
  if (operationType !== "CREATE_WORK_OBJECT" && operationType !== "RENAME_WORK_OBJECT" && operationType !== "UNDO_COMMIT") {
    throw new ContractError("OPERATION_TYPE_UNSUPPORTED", "Only registered semantic operations are accepted.");
  }
  exactKeys(candidate, operationType === "CREATE_WORK_OBJECT" ? ["operationId", "type", "actor", "input", "preconditions"] : ["operationId", "type", "actor", "target", "input", "preconditions"], "OPERATION_UNKNOWN_FIELD");
  const common = {
    operationId: text(candidate.operationId, "OPERATION_ID_REQUIRED", "Operation id"),
    actor: actor(candidate.actor),
  };

  if (operationType === "CREATE_WORK_OBJECT") {
    const input = record(candidate.input, "OPERATION_INPUT_INVALID", "Input");
    exactKeys(input, ["kind", "title", "anchor"], "OPERATION_INPUT_UNKNOWN_FIELD");
    if (input.kind !== "TASK" && input.kind !== "MINI_PROJECT" && input.kind !== "PROJECT") {
      throw new ContractError("WORK_OBJECT_KIND_INVALID", "WorkObject kind is unsupported.");
    }
    const anchorValue = record(input.anchor, "ANCHOR_INVALID", "Anchor");
    exactKeys(anchorValue, ["graphId", "blockUuid", "sourceContentHash"], "ANCHOR_UNKNOWN_FIELD");
    const sourceContentHash = hash(anchorValue.sourceContentHash, "SOURCE_CONTENT_HASH_INVALID");
    const preconditions = [
      { kind: "SOURCE_CONTENT_HASH" as const, expected: sourceContentHash },
      { kind: "MANAGED_PROJECTION_ABSENT" as const, expected: true as const },
    ] as const;
    if (candidate.preconditions !== undefined && canonical(candidate.preconditions) !== canonical(preconditions)) throw new ContractError("OPERATION_PRECONDITIONS_INVALID", "Preconditions must match the semantic operation.");
    return {
      ...common,
      type: operationType,
      input: {
        kind: input.kind,
        title: text(input.title, "WORK_OBJECT_TITLE_REQUIRED", "Title"),
        anchor: {
          graphId: text(anchorValue.graphId, "GRAPH_ID_REQUIRED", "Graph id"),
          blockUuid: text(anchorValue.blockUuid, "BLOCK_UUID_REQUIRED", "Block UUID"),
          sourceContentHash,
        },
      },
      preconditions,
    };
  }

  const target = record(candidate.target, "OPERATION_TARGET_INVALID", "Target");
  const input = record(candidate.input, "OPERATION_INPUT_INVALID", "Input");
  if (operationType === "RENAME_WORK_OBJECT") {
    exactKeys(target, ["workObjectId", "expectedVersion", "expectedProjectionHash"], "OPERATION_TARGET_UNKNOWN_FIELD");
    exactKeys(input, ["title"], "OPERATION_INPUT_UNKNOWN_FIELD");
    if (!Number.isSafeInteger(target.expectedVersion) || Number(target.expectedVersion) < 1) {
      throw new ContractError("EXPECTED_VERSION_INVALID", "Expected version must be a positive integer.");
    }
    const expectedProjectionHash = hash(target.expectedProjectionHash, "PROJECTION_HASH_INVALID");
    const preconditions = [
      { kind: "WORK_OBJECT_VERSION" as const, expected: Number(target.expectedVersion) },
      { kind: "MANAGED_PROJECTION_HASH" as const, expected: expectedProjectionHash },
    ] as const;
    if (candidate.preconditions !== undefined && canonical(candidate.preconditions) !== canonical(preconditions)) throw new ContractError("OPERATION_PRECONDITIONS_INVALID", "Preconditions must match the semantic operation.");
    return {
      ...common,
      type: operationType,
      target: {
        workObjectId: text(target.workObjectId, "WORK_OBJECT_ID_REQUIRED", "WorkObject id"),
        expectedVersion: Number(target.expectedVersion),
        expectedProjectionHash,
      },
      input: { title: text(input.title, "WORK_OBJECT_TITLE_REQUIRED", "Title") },
      preconditions,
    };
  }

  exactKeys(target, ["commitId", "expectedProjectionHash"], "OPERATION_TARGET_UNKNOWN_FIELD");
  exactKeys(input, [], "OPERATION_INPUT_UNKNOWN_FIELD");
  const expectedProjectionHash = hash(target.expectedProjectionHash, "PROJECTION_HASH_INVALID");
  const preconditions = [{ kind: "MANAGED_PROJECTION_HASH" as const, expected: expectedProjectionHash }] as const;
  if (candidate.preconditions !== undefined && canonical(candidate.preconditions) !== canonical(preconditions)) throw new ContractError("OPERATION_PRECONDITIONS_INVALID", "Preconditions must match the semantic operation.");
  return {
    ...common,
    type: operationType,
    target: {
      commitId: text(target.commitId, "COMMIT_ID_REQUIRED", "Commit id"),
      expectedProjectionHash,
    },
    input: {},
    preconditions,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function stableHash(value: unknown): string {
  const source = canonical(value);
  let result = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}
