import type { CancellationRecord, ClosureAmendment, CompletionRecord, ReopenRecord, WaitingCondition, WorkObject, WorkObjectKind } from "@task-copilot/domain";
export type { CancellationRecord, ClosureAmendment, CompletionRecord, ReopenRecord, WorkObject } from "@task-copilot/domain";

export type ActorType = "USER" | "SYSTEM" | "AGENT";
export interface Actor { type: ActorType; id: string }

export type CommitStatus =
  | "PREPARED"
  | "KERNEL_APPLIED"
  | "GRAPH_APPLIED"
  | "COMMITTED"
  | "RECOVERY_REQUIRED"
  | "ABORTED";

export type OperationType = "CREATE_WORK_OBJECT" | "RENAME_WORK_OBJECT" | "SET_CURRENT_FOCUS" | "CHANGE_ENGAGEMENT" | "COMPLETE_WORK_OBJECT" | "CANCEL_WORK_OBJECT" | "REOPEN_WORK_OBJECT" | "AMEND_CLOSURE" | "UNDO_COMMIT";
export const OPERATION_CONTRACT_VERSION = 1 as const;
export const APPROVED_CURRENT_FOCUS_SKILL = {
  id: "current-focus-maintenance",
  version: "0.1.0",
  contentHash: "ae5fec61a120cfe294f191e1ae37a61f008ac7868be232e6d814189211788813",
} as const;
export const APPROVED_ENGAGEMENT_SKILL = {
  id: "engagement-reconciliation",
  version: "0.1.1",
  contentHash: "11789087f843b9ee5708dac16779788ca207f3bce807a6f6c3d20d91538785e5",
} as const;

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

export interface EvidenceDependency {
  evidenceId: string;
  contentHash: string;
}

export interface SetCurrentFocusOperation {
  operationId: string;
  type: "SET_CURRENT_FOCUS";
  actor: Actor;
  target: { workObjectId: string; expectedVersion: number; expectedProjectionHash: string };
  input: { currentFocus: string | null };
  evidenceDependencies: readonly EvidenceDependency[];
  preconditions: readonly [
    { kind: "WORK_OBJECT_VERSION"; expected: number },
    { kind: "MANAGED_PROJECTION_HASH"; expected: string },
    { kind: "EVIDENCE_DEPENDENCIES"; expected: readonly EvidenceDependency[] },
  ];
}

export interface ChangeEngagementOperation {
  operationId: string;
  type: "CHANGE_ENGAGEMENT";
  actor: Actor;
  target: { workObjectId: string; expectedVersion: number; expectedProjectionHash: string };
  input: {
    from: "ACTIONABLE" | "WAITING";
    to: "ACTIONABLE" | "WAITING";
    waiting: { description: string; reviewAt: string | null; evidenceIds: readonly string[] } | null;
  };
  evidenceDependencies: readonly EvidenceDependency[];
  preconditions: readonly [
    { kind: "WORK_OBJECT_VERSION"; expected: number },
    { kind: "MANAGED_PROJECTION_HASH"; expected: string },
    { kind: "EVIDENCE_DEPENDENCIES"; expected: readonly EvidenceDependency[] },
  ];
}

interface ClosureTarget {
  workObjectId: string;
  expectedVersion: number;
  expectedProjectionHash: string;
}

interface ClosurePreconditions {
  readonly 0: { kind: "WORK_OBJECT_VERSION"; expected: number };
  readonly 1: { kind: "MANAGED_PROJECTION_HASH"; expected: string };
}

export interface CompleteWorkObjectOperation {
  operationId: string;
  type: "COMPLETE_WORK_OBJECT";
  actor: Actor;
  target: ClosureTarget;
  input: { outcomeSummary: string; evidenceIds: readonly string[] };
  preconditions: ClosurePreconditions;
}

export interface CancelWorkObjectOperation {
  operationId: string;
  type: "CANCEL_WORK_OBJECT";
  actor: Actor;
  target: ClosureTarget;
  input: { reason: string; replacementWorkObjectId: string | null; remainingWorkNote: string | null; evidenceIds: readonly string[] };
  preconditions: ClosurePreconditions;
}

export interface ReopenWorkObjectOperation {
  operationId: string;
  type: "REOPEN_WORK_OBJECT";
  actor: Actor;
  target: ClosureTarget;
  input: { reason: string };
  preconditions: ClosurePreconditions;
}

export interface AmendClosureOperation {
  operationId: string;
  type: "AMEND_CLOSURE";
  actor: Actor;
  target: ClosureTarget;
  input: { targetClosureRecordId: string; reason: string; replacementOutcomeSummary: string | null; replacementCancellationReason: string | null; addEvidenceIds: readonly string[] };
  preconditions: ClosurePreconditions;
}

export interface UndoCommitOperation {
  operationId: string;
  type: "UNDO_COMMIT";
  actor: Actor;
  target: { commitId: string; expectedProjectionHash: string };
  input: Record<string, never>;
  preconditions: readonly [{ kind: "MANAGED_PROJECTION_HASH"; expected: string }];
}

export type SemanticOperation = CreateWorkObjectOperation | RenameWorkObjectOperation | SetCurrentFocusOperation | ChangeEngagementOperation | CompleteWorkObjectOperation | CancelWorkObjectOperation | ReopenWorkObjectOperation | AmendClosureOperation | UndoCommitOperation;

export interface EffectiveCompletionClosure { type: "COMPLETED"; record: CompletionRecord; amendments: readonly ClosureAmendment[]; outcomeSummary: string; evidenceIds: readonly string[] }
export interface EffectiveCancellationClosure { type: "CANCELLED"; record: CancellationRecord; amendments: readonly ClosureAmendment[]; reason: string; evidenceIds: readonly string[] }
export type EffectiveClosure = EffectiveCompletionClosure | EffectiveCancellationClosure;
export interface ClosureHistory { current: EffectiveClosure | null; completions: readonly CompletionRecord[]; cancellations: readonly CancellationRecord[]; amendments: readonly ClosureAmendment[]; reopens: readonly ReopenRecord[] }
export type ManagedClosureProjection = { type: "COMPLETED"; recordId: string; outcomeSummary: string } | { type: "CANCELLED"; recordId: string; reason: string };

export interface ManagedProjection {
  containerUuid: string;
  titleUuid: string;
  stateUuid: string;
  focusUuid: string;
  waitingUuid: string;
  title: string;
  lifecycle: WorkObject["lifecycle"];
  engagement: WorkObject["engagement"];
  waitingCondition: WaitingCondition | null;
  currentFocus: string | null;
  closure?: ManagedClosureProjection | null;
  projectionHash: string;
}

export interface GraphSnapshot {
  graphId: string;
  sourceBlockUuid: string;
  sourceContentHash: string;
  sourceMarker?: "TODO" | "DONE" | "DOING" | "NOW" | "LATER" | "CANCELED" | "CANCELLED" | null;
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
  | (GraphEffectIdentity & { type: "SET_CURRENT_FOCUS_FIELD"; containerUuid: string; fieldUuid: string; content: string | null; expectedProjectionHash: string; resultingProjectionHash: string })
  | (GraphEffectIdentity & { type: "CHANGE_ENGAGEMENT_FIELDS"; containerUuid: string; stateUuid: string; waitingUuid: string; engagement: "ACTIONABLE" | "WAITING"; waiting: WaitingCondition | null; expectedProjectionHash: string; resultingProjectionHash: string })
  | (GraphEffectIdentity & { type: "CHANGE_CLOSURE_FIELDS"; containerUuid: string; stateUuid: string; focusUuid: string; expectedSourceMarker: GraphSnapshot["sourceMarker"]; resultingSourceMarker: GraphSnapshot["sourceMarker"]; expectedProjection: ManagedProjection; lifecycle: WorkObject["lifecycle"]; engagement: WorkObject["engagement"]; waitingCondition: WaitingCondition | null; currentFocus: string | null; closure: ManagedClosureProjection | null; expectedProjectionHash: string; resultingProjectionHash: string })
  | (GraphEffectIdentity & { type: "REMOVE_MANAGED_PROJECTION"; containerUuid: string; expectedProjectionHash: string });

export interface FrozenEvidence {
  id: string;
  workObjectId: string;
  sourceType: "LOGSEQ_BLOCK";
  graphId: string;
  externalId: string;
  frozenContent: string;
  contentHash: string;
  frozenAt: string;
  locator: { graphId: string; blockUuid: string };
}

export interface GraphEvidenceMaterial {
  graphId: string;
  blockUuid: string;
  content: string;
  sourceContentHash: string;
}

export interface TrustedGraphEvidenceMaterial extends GraphEvidenceMaterial {
  proof: string;
}

export interface SkillIdentity { id: string; version: string; contentHash: string }
export interface SkillPackage extends SkillIdentity { manifest: unknown; policy: unknown; schema: unknown; examples: unknown; eval: unknown }

export type AgentRunOutcome = "PROPOSAL" | "NO_PROPOSAL" | "NEEDS_MORE_CONTEXT" | "FAILED";
export interface AgentRunReceipt {
  id: string;
  purpose: "CURRENT_FOCUS_MAINTENANCE" | "ENGAGEMENT_RECONCILIATION";
  executor: { type: "FAKE" | "BUILTIN"; id: string };
  operationContractVersion: typeof OPERATION_CONTRACT_VERSION;
  skill: SkillIdentity;
  subject: { workObjectId: string };
  context: { targetVersion: number; evidenceIds: readonly string[]; currentEngagement?: WorkObject["engagement"]; waitingCondition?: WaitingCondition | null };
  result: { outcome: AgentRunOutcome; proposalIds: readonly string[] };
  reasonCode: string;
  rationaleSummary: string;
  startedAt: string;
  finishedAt: string;
}

export interface AgentCurrentFocusResult {
  outcome: Exclude<AgentRunOutcome, "FAILED">;
  currentFocus?: string | null;
  reasonCode: string;
  rationaleSummary: string;
}

export interface CurrentFocusAgent {
  readonly id: string;
  propose(input: { target: WorkObject; evidence: readonly FrozenEvidence[]; skill: SkillPackage }): Promise<AgentCurrentFocusResult>;
}

export interface AgentEngagementResult {
  outcome: Exclude<AgentRunOutcome, "FAILED">;
  transition?: {
    from: "ACTIONABLE" | "WAITING";
    to: "ACTIONABLE" | "WAITING";
    waiting: { description: string; reviewAt: string | null } | null;
  };
  reasonCode: string;
  rationaleSummary: string;
}

export interface EngagementAgent {
  readonly id: string;
  propose(input: { target: WorkObject; evidence: readonly FrozenEvidence[]; skill: SkillPackage }): Promise<AgentEngagementResult>;
}

export function parseAgentEngagementResult(value: unknown): AgentEngagementResult {
  const candidate = record(value, "AGENT_RESULT_INVALID", "Agent result");
  exactKeys(candidate, ["outcome", "transition", "reasonCode", "rationaleSummary"], "AGENT_RESULT_UNKNOWN_FIELD");
  if (candidate.outcome !== "PROPOSAL" && candidate.outcome !== "NO_PROPOSAL" && candidate.outcome !== "NEEDS_MORE_CONTEXT") throw new ContractError("AGENT_RESULT_OUTCOME_INVALID", "Agent result outcome is unsupported.");
  if (typeof candidate.reasonCode !== "string" || typeof candidate.rationaleSummary !== "string") throw new ContractError("AGENT_RESULT_EXPLANATION_INVALID", "Agent result requires string reasonCode and rationaleSummary values.");
  let transition: AgentEngagementResult["transition"];
  if (candidate.transition !== undefined) {
    const item = record(candidate.transition, "AGENT_ENGAGEMENT_TRANSITION_INVALID", "Engagement transition");
    exactKeys(item, ["from", "to", "waiting"], "AGENT_RESULT_UNKNOWN_FIELD");
    if (item.from !== "ACTIONABLE" && item.from !== "WAITING") throw new ContractError("ENGAGEMENT_FROM_INVALID", "Engagement from is unsupported.");
    if (item.to !== "ACTIONABLE" && item.to !== "WAITING") throw new ContractError("ENGAGEMENT_TO_INVALID", "Engagement to is unsupported.");
    if (!((item.from === "ACTIONABLE" && item.to === "WAITING") || (item.from === "WAITING" && item.to === "ACTIONABLE"))) throw new ContractError("ENGAGEMENT_TRANSITION_UNSUPPORTED", "Only ACTIONABLE and WAITING may reconcile.");
    let waiting: { description: string; reviewAt: string | null } | null = null;
    if (item.to === "WAITING") {
      const condition = record(item.waiting, "WAITING_CONDITION_REQUIRED", "Waiting condition");
      exactKeys(condition, ["description", "reviewAt"], "WAITING_CONDITION_UNKNOWN_FIELD");
      const description = text(condition.description, "WAITING_DESCRIPTION_REQUIRED", "Waiting description");
      if (description.length > 200) throw new ContractError("WAITING_DESCRIPTION_TOO_LONG", "Waiting description exceeds 200 characters.");
      if (condition.reviewAt !== null && (typeof condition.reviewAt !== "string" || !Number.isFinite(Date.parse(condition.reviewAt)))) throw new ContractError("WAITING_REVIEW_AT_INVALID", "Waiting reviewAt must be an ISO-compatible timestamp or null.");
      waiting = { description, reviewAt: condition.reviewAt as string | null };
    } else if (item.waiting !== null) throw new ContractError("WAITING_CONDITION_FORBIDDEN", "ACTIONABLE cannot carry a WaitingCondition.");
    transition = { from: item.from, to: item.to, waiting };
  }
  if (candidate.outcome === "PROPOSAL" && !transition) throw new ContractError("AGENT_ENGAGEMENT_TRANSITION_REQUIRED", "Proposal outcome requires one Engagement transition.");
  if (candidate.outcome !== "PROPOSAL" && transition) throw new ContractError("AGENT_ENGAGEMENT_TRANSITION_FORBIDDEN", "Non-proposal outcome cannot include a transition.");
  return { outcome: candidate.outcome, ...(transition ? { transition } : {}), reasonCode: candidate.reasonCode, rationaleSummary: candidate.rationaleSummary };
}

export function parseAgentCurrentFocusResult(value: unknown): AgentCurrentFocusResult {
  const candidate = record(value, "AGENT_RESULT_INVALID", "Agent result");
  exactKeys(candidate, ["outcome", "currentFocus", "reasonCode", "rationaleSummary"], "AGENT_RESULT_UNKNOWN_FIELD");
  if (candidate.outcome !== "PROPOSAL" && candidate.outcome !== "NO_PROPOSAL" && candidate.outcome !== "NEEDS_MORE_CONTEXT") {
    throw new ContractError("AGENT_RESULT_OUTCOME_INVALID", "Agent result outcome is unsupported.");
  }
  if (typeof candidate.reasonCode !== "string" || typeof candidate.rationaleSummary !== "string") {
    throw new ContractError("AGENT_RESULT_EXPLANATION_INVALID", "Agent result requires string reasonCode and rationaleSummary values.");
  }
  if (candidate.currentFocus !== undefined && candidate.currentFocus !== null && typeof candidate.currentFocus !== "string") {
    throw new ContractError("AGENT_RESULT_FOCUS_INVALID", "Agent result currentFocus must be text or null when present.");
  }
  if (typeof candidate.currentFocus === "string" && candidate.currentFocus.length > 200) {
    throw new ContractError("AGENT_RESULT_FOCUS_TOO_LONG", "Agent result currentFocus exceeds 200 characters.");
  }
  if (candidate.outcome === "PROPOSAL" && !("currentFocus" in candidate)) {
    throw new ContractError("AGENT_RESULT_FOCUS_REQUIRED", "Proposal outcome must include currentFocus.");
  }
  return {
    outcome: candidate.outcome,
    ...(candidate.currentFocus !== undefined ? { currentFocus: candidate.currentFocus as string | null } : {}),
    reasonCode: candidate.reasonCode,
    rationaleSummary: candidate.rationaleSummary,
  };
}

export type ProposalStatus = "OPEN" | "APPLIED" | "DISMISSED" | "INVALIDATED";
export interface CurrentFocusProposalRevision {
  proposalId: string;
  revision: number;
  operationType: "SET_CURRENT_FOCUS";
  operationContractVersion: typeof OPERATION_CONTRACT_VERSION;
  currentFocus: string | null;
  expectedVersion: number;
  expectedProjectionHash: string;
  evidenceDependencies: readonly EvidenceDependency[];
  skill: SkillIdentity;
  agentRunId: string;
  risk: "LOW";
  createdAt: string;
}
export interface EngagementProposalRevision {
  proposalId: string;
  revision: number;
  operationType: "CHANGE_ENGAGEMENT";
  operationContractVersion: typeof OPERATION_CONTRACT_VERSION;
  transition: ChangeEngagementOperation["input"];
  expectedVersion: number;
  expectedProjectionHash: string;
  evidenceDependencies: readonly EvidenceDependency[];
  evidenceWatermark: number;
  skill: SkillIdentity;
  agentRunId: string;
  risk: "LOW";
  createdAt: string;
}
export type ProposalRevision = CurrentFocusProposalRevision | EngagementProposalRevision;
export interface Proposal {
  id: string;
  workObjectId: string;
  status: ProposalStatus;
  latestRevision: number;
  appliedCommitId: string | null;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FeedbackType = "ACCEPTED" | "MODIFIED" | "REJECTED" | "UNDONE_AFTER_APPLY";
export interface FeedbackEvent {
  id: string;
  type: FeedbackType;
  proposalId: string;
  agentRunId: string;
  proposalRevision: number;
  skill: SkillIdentity;
  operationType: "SET_CURRENT_FOCUS" | "CHANGE_ENGAGEMENT";
  commitId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

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
  readEvidenceMaterial(input: { graphId: string; blockUuid: string }, proofKey: string): Promise<TrustedGraphEvidenceMaterial>;
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
  governance: { proposalId: string; revision: number; agentRunId: string; skill: SkillIdentity } | null;
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

export function canonicalizeGraphContent(value: string): string {
  return value.replace(/\r\n?/gu, "\n").split("\n").filter((line) => !/^\s*id::\s+[0-9a-f-]+\s*$/iu.test(line)).join("\n").trimEnd();
}

export function graphEvidenceProofPayload(material: GraphEvidenceMaterial): string {
  const content = canonicalizeGraphContent(material.content);
  return JSON.stringify([material.graphId, material.blockUuid, stableHash(content), material.sourceContentHash, content]);
}

export function deterministicUuid(seed: string): string {
  const bytes = new TextEncoder().encode(seed);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  let third = 0x85ebca6b;
  let fourth = 0xc2b2ae35;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x27d4eb2d) >>> 0;
    third = Math.imul(third ^ byte, 0x165667b1) >>> 0;
    fourth = Math.imul(fourth ^ byte, 0x85ebca77) >>> 0;
  }
  const hex = [first, second, third, fourth].map((value) => value.toString(16).padStart(8, "0")).join("").split("");
  hex[12] = "4"; hex[16] = "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
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

function strongHash(value: unknown, code: string): string {
  const normalized = text(value, code, "Evidence content hash");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) throw new ContractError(code, "Evidence content hash must be 64 lowercase hexadecimal characters.");
  return normalized;
}

function stringArray(value: unknown, code: string, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new ContractError(code, `${label} must be an array of non-empty strings.`);
  return [...new Set(value.map((item) => item.trim()))];
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
  if (operationType !== "CREATE_WORK_OBJECT" && operationType !== "RENAME_WORK_OBJECT" && operationType !== "SET_CURRENT_FOCUS" && operationType !== "CHANGE_ENGAGEMENT" && operationType !== "COMPLETE_WORK_OBJECT" && operationType !== "CANCEL_WORK_OBJECT" && operationType !== "REOPEN_WORK_OBJECT" && operationType !== "AMEND_CLOSURE" && operationType !== "UNDO_COMMIT") {
    throw new ContractError("OPERATION_TYPE_UNSUPPORTED", "Only registered semantic operations are accepted.");
  }
  exactKeys(candidate, operationType === "CREATE_WORK_OBJECT"
    ? ["operationId", "type", "actor", "input", "preconditions"]
    : operationType === "SET_CURRENT_FOCUS" || operationType === "CHANGE_ENGAGEMENT"
      ? ["operationId", "type", "actor", "target", "input", "evidenceDependencies", "preconditions"]
      : ["operationId", "type", "actor", "target", "input", "preconditions"], "OPERATION_UNKNOWN_FIELD");
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

  if (operationType === "SET_CURRENT_FOCUS") {
    exactKeys(target, ["workObjectId", "expectedVersion", "expectedProjectionHash"], "OPERATION_TARGET_UNKNOWN_FIELD");
    exactKeys(input, ["currentFocus"], "OPERATION_INPUT_UNKNOWN_FIELD");
    if (!Number.isSafeInteger(target.expectedVersion) || Number(target.expectedVersion) < 1) {
      throw new ContractError("EXPECTED_VERSION_INVALID", "Expected version must be a positive integer.");
    }
    const expectedProjectionHash = hash(target.expectedProjectionHash, "PROJECTION_HASH_INVALID");
    const dependencies = candidate.evidenceDependencies;
    if (!Array.isArray(dependencies) || dependencies.length < 1) {
      throw new ContractError("EVIDENCE_DEPENDENCIES_REQUIRED", "At least one frozen Evidence dependency is required.");
    }
    const evidenceDependencies = dependencies.map((dependency) => {
      const item = record(dependency, "EVIDENCE_DEPENDENCY_INVALID", "Evidence dependency");
      exactKeys(item, ["evidenceId", "contentHash"], "EVIDENCE_DEPENDENCY_UNKNOWN_FIELD");
      return {
        evidenceId: text(item.evidenceId, "EVIDENCE_ID_REQUIRED", "Evidence id"),
        contentHash: strongHash(item.contentHash, "EVIDENCE_CONTENT_HASH_INVALID"),
      };
    });
    if (input.currentFocus !== null && typeof input.currentFocus !== "string") {
      throw new ContractError("CURRENT_FOCUS_INVALID", "Current focus must be text or null.");
    }
    const currentFocus = typeof input.currentFocus === "string" ? input.currentFocus.trim() || null : null;
    if (currentFocus && currentFocus.length > 200) throw new ContractError("CURRENT_FOCUS_TOO_LONG", "Current focus exceeds 200 characters.");
    const preconditions = [
      { kind: "WORK_OBJECT_VERSION" as const, expected: Number(target.expectedVersion) },
      { kind: "MANAGED_PROJECTION_HASH" as const, expected: expectedProjectionHash },
      { kind: "EVIDENCE_DEPENDENCIES" as const, expected: evidenceDependencies },
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
      input: { currentFocus },
      evidenceDependencies,
      preconditions,
    };
  }

  if (operationType === "CHANGE_ENGAGEMENT") {
    exactKeys(target, ["workObjectId", "expectedVersion", "expectedProjectionHash"], "OPERATION_TARGET_UNKNOWN_FIELD");
    exactKeys(input, ["from", "to", "waiting"], "OPERATION_INPUT_UNKNOWN_FIELD");
    if (!Number.isSafeInteger(target.expectedVersion) || Number(target.expectedVersion) < 1) throw new ContractError("EXPECTED_VERSION_INVALID", "Expected version must be a positive integer.");
    const expectedProjectionHash = hash(target.expectedProjectionHash, "PROJECTION_HASH_INVALID");
    const dependencies = candidate.evidenceDependencies;
    if (!Array.isArray(dependencies) || dependencies.length < 1) throw new ContractError("EVIDENCE_DEPENDENCIES_REQUIRED", "At least one frozen Evidence dependency is required.");
    const evidenceDependencies = dependencies.map((dependency) => {
      const item = record(dependency, "EVIDENCE_DEPENDENCY_INVALID", "Evidence dependency");
      exactKeys(item, ["evidenceId", "contentHash"], "EVIDENCE_DEPENDENCY_UNKNOWN_FIELD");
      return { evidenceId: text(item.evidenceId, "EVIDENCE_ID_REQUIRED", "Evidence id"), contentHash: strongHash(item.contentHash, "EVIDENCE_CONTENT_HASH_INVALID") };
    });
    if (input.from !== "ACTIONABLE" && input.from !== "WAITING") throw new ContractError("ENGAGEMENT_FROM_INVALID", "Engagement from must be ACTIONABLE or WAITING.");
    if (input.to !== "ACTIONABLE" && input.to !== "WAITING") throw new ContractError("ENGAGEMENT_TO_INVALID", "Engagement to must be ACTIONABLE or WAITING.");
    if (!((input.from === "ACTIONABLE" && input.to === "WAITING") || (input.from === "WAITING" && input.to === "ACTIONABLE"))) throw new ContractError("ENGAGEMENT_TRANSITION_UNSUPPORTED", "Only ACTIONABLE to WAITING and WAITING to ACTIONABLE are supported.");
    let waiting: ChangeEngagementOperation["input"]["waiting"] = null;
    if (input.to === "WAITING") {
      const value = record(input.waiting, "WAITING_CONDITION_REQUIRED", "Waiting condition");
      exactKeys(value, ["description", "reviewAt", "evidenceIds"], "WAITING_CONDITION_UNKNOWN_FIELD");
      if (value.reviewAt !== null && (typeof value.reviewAt !== "string" || !Number.isFinite(Date.parse(value.reviewAt)))) throw new ContractError("WAITING_REVIEW_AT_INVALID", "Waiting reviewAt must be an ISO-compatible timestamp or null.");
      if (!Array.isArray(value.evidenceIds) || value.evidenceIds.some((id) => typeof id !== "string") || canonical([...value.evidenceIds].sort()) !== canonical(evidenceDependencies.map((item) => item.evidenceId).sort())) throw new ContractError("WAITING_EVIDENCE_MISMATCH", "Waiting Evidence IDs must exactly match operation Evidence dependencies.");
      const description = text(value.description, "WAITING_DESCRIPTION_REQUIRED", "Waiting description");
      if (description.length > 200) throw new ContractError("WAITING_DESCRIPTION_TOO_LONG", "Waiting description exceeds 200 characters.");
      waiting = { description, reviewAt: value.reviewAt as string | null, evidenceIds: value.evidenceIds as string[] };
    } else if (input.waiting !== null) throw new ContractError("WAITING_CONDITION_FORBIDDEN", "ACTIONABLE cannot carry a WaitingCondition payload.");
    const preconditions = [
      { kind: "WORK_OBJECT_VERSION" as const, expected: Number(target.expectedVersion) },
      { kind: "MANAGED_PROJECTION_HASH" as const, expected: expectedProjectionHash },
      { kind: "EVIDENCE_DEPENDENCIES" as const, expected: evidenceDependencies },
    ] as const;
    if (candidate.preconditions !== undefined && canonical(candidate.preconditions) !== canonical(preconditions)) throw new ContractError("OPERATION_PRECONDITIONS_INVALID", "Preconditions must match the semantic operation.");
    return { ...common, type: operationType, target: { workObjectId: text(target.workObjectId, "WORK_OBJECT_ID_REQUIRED", "WorkObject id"), expectedVersion: Number(target.expectedVersion), expectedProjectionHash }, input: { from: input.from, to: input.to, waiting }, evidenceDependencies, preconditions };
  }

  if (operationType === "COMPLETE_WORK_OBJECT" || operationType === "CANCEL_WORK_OBJECT" || operationType === "REOPEN_WORK_OBJECT" || operationType === "AMEND_CLOSURE") {
    exactKeys(target, ["workObjectId", "expectedVersion", "expectedProjectionHash"], "OPERATION_TARGET_UNKNOWN_FIELD");
    if (!Number.isSafeInteger(target.expectedVersion) || Number(target.expectedVersion) < 1) throw new ContractError("EXPECTED_VERSION_INVALID", "Expected version must be a positive integer.");
    const expectedProjectionHash = hash(target.expectedProjectionHash, "PROJECTION_HASH_INVALID");
    const parsedTarget = { workObjectId: text(target.workObjectId, "WORK_OBJECT_ID_REQUIRED", "WorkObject id"), expectedVersion: Number(target.expectedVersion), expectedProjectionHash };
    const preconditions = [{ kind: "WORK_OBJECT_VERSION" as const, expected: parsedTarget.expectedVersion }, { kind: "MANAGED_PROJECTION_HASH" as const, expected: expectedProjectionHash }] as const;
    if (candidate.preconditions !== undefined && canonical(candidate.preconditions) !== canonical(preconditions)) throw new ContractError("OPERATION_PRECONDITIONS_INVALID", "Preconditions must match the semantic operation.");
    if (operationType === "COMPLETE_WORK_OBJECT") {
      exactKeys(input, ["outcomeSummary", "evidenceIds"], "OPERATION_INPUT_UNKNOWN_FIELD");
      return { ...common, type: operationType, target: parsedTarget, input: { outcomeSummary: text(input.outcomeSummary, "COMPLETION_OUTCOME_REQUIRED", "Completion outcome"), evidenceIds: stringArray(input.evidenceIds, "CLOSURE_EVIDENCE_IDS_INVALID", "Closure Evidence IDs") }, preconditions };
    }
    if (operationType === "CANCEL_WORK_OBJECT") {
      exactKeys(input, ["reason", "replacementWorkObjectId", "remainingWorkNote", "evidenceIds"], "OPERATION_INPUT_UNKNOWN_FIELD");
      if (input.replacementWorkObjectId !== null && typeof input.replacementWorkObjectId !== "string") throw new ContractError("REPLACEMENT_WORK_OBJECT_ID_INVALID", "Replacement WorkObject id must be text or null.");
      if (input.remainingWorkNote !== null && typeof input.remainingWorkNote !== "string") throw new ContractError("REMAINING_WORK_NOTE_INVALID", "Remaining-work note must be text or null.");
      return { ...common, type: operationType, target: parsedTarget, input: { reason: text(input.reason, "CANCELLATION_REASON_REQUIRED", "Cancellation reason"), replacementWorkObjectId: input.replacementWorkObjectId === null ? null : text(input.replacementWorkObjectId, "REPLACEMENT_WORK_OBJECT_ID_REQUIRED", "Replacement WorkObject id"), remainingWorkNote: typeof input.remainingWorkNote === "string" ? input.remainingWorkNote.trim() || null : null, evidenceIds: stringArray(input.evidenceIds, "CLOSURE_EVIDENCE_IDS_INVALID", "Closure Evidence IDs") }, preconditions };
    }
    if (operationType === "REOPEN_WORK_OBJECT") {
      exactKeys(input, ["reason"], "OPERATION_INPUT_UNKNOWN_FIELD");
      return { ...common, type: operationType, target: parsedTarget, input: { reason: text(input.reason, "REOPEN_REASON_REQUIRED", "Reopen reason") }, preconditions };
    }
    exactKeys(input, ["targetClosureRecordId", "reason", "replacementOutcomeSummary", "replacementCancellationReason", "addEvidenceIds"], "OPERATION_INPUT_UNKNOWN_FIELD");
    if (input.replacementOutcomeSummary !== null && typeof input.replacementOutcomeSummary !== "string") throw new ContractError("COMPLETION_OUTCOME_INVALID", "Replacement outcome must be text or null.");
    if (input.replacementCancellationReason !== null && typeof input.replacementCancellationReason !== "string") throw new ContractError("CANCELLATION_REASON_INVALID", "Replacement cancellation reason must be text or null.");
    const replacementOutcomeSummary = typeof input.replacementOutcomeSummary === "string" ? text(input.replacementOutcomeSummary, "COMPLETION_OUTCOME_REQUIRED", "Replacement outcome") : null;
    const replacementCancellationReason = typeof input.replacementCancellationReason === "string" ? text(input.replacementCancellationReason, "CANCELLATION_REASON_REQUIRED", "Replacement cancellation reason") : null;
    const addEvidenceIds = stringArray(input.addEvidenceIds, "CLOSURE_EVIDENCE_IDS_INVALID", "Closure Evidence IDs");
    if (!replacementOutcomeSummary && !replacementCancellationReason && !addEvidenceIds.length) throw new ContractError("CLOSURE_AMENDMENT_EMPTY", "Closure amendment must change narrative or add Evidence.");
    return { ...common, type: operationType, target: parsedTarget, input: { targetClosureRecordId: text(input.targetClosureRecordId, "TARGET_CLOSURE_RECORD_ID_REQUIRED", "Target closure record id"), reason: text(input.reason, "CLOSURE_AMENDMENT_REASON_REQUIRED", "Closure amendment reason"), replacementOutcomeSummary, replacementCancellationReason, addEvidenceIds }, preconditions };
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
