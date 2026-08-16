import type { CancellationRecord, ClosureAmendment, CompletionRecord, ProjectIntent, ReopenRecord, WaitingCondition, WorkObject, WorkObjectKind } from "@task-copilot/domain";
export type { CancellationRecord, ClosureAmendment, CompletionRecord, PrimaryOwnership, ProjectIntent, ProjectKeyResult, ReopenRecord, WorkObject } from "@task-copilot/domain";

export type ActorType = "USER" | "SYSTEM" | "AGENT";
export interface Actor { type: ActorType; id: string }

export type CommitStatus =
  | "PREPARED"
  | "KERNEL_APPLIED"
  | "GRAPH_APPLIED"
  | "COMMITTED"
  | "RECOVERY_REQUIRED"
  | "ABORTED";

export type OperationType = "CREATE_WORK_OBJECT" | "RENAME_WORK_OBJECT" | "SET_CURRENT_FOCUS" | "UPDATE_WORK_INTENT" | "UPDATE_PROJECT_INTENT" | "CHANGE_ENGAGEMENT" | "COMPLETE_WORK_OBJECT" | "CANCEL_WORK_OBJECT" | "REOPEN_WORK_OBJECT" | "AMEND_CLOSURE" | "ASSIGN_PARENT" | "UNDO_COMMIT";
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
export const APPROVED_MINI_PROJECT_SKILL = {
  id: "miniproject-governance", version: "0.1.0", contentHash: "111a688816c9e402880c7f859e5192d9ec401d4c97d617626c1d3d80e550059d",
} as const;
export const APPROVED_WORK_INTENT_SKILL = {
  id: "work-intent-maintenance", version: "0.1.0", contentHash: "28839601f608237e2179d66e27f6cb0c24a605f8e53e1b2231dd9c4e06c39f04",
} as const;
export const APPROVED_MINI_PROJECT_TASTE = {
  id: "miniproject-governance-taste", version: "0.1.0", contentHash: "9023451cc8093f1e04e4781e2055fe7d054b5feb61f7d7beb5af4be6736918dd",
} as const;

export const EXTERNAL_CURRENT_FOCUS_RESULT_CONTRACT = {
  type: "object", additionalProperties: false, required: ["outcome", "reasonCode", "rationaleSummary"],
  properties: {
    outcome: { enum: ["PROPOSAL", "NO_PROPOSAL", "NEEDS_MORE_CONTEXT"] },
    currentFocus: { type: ["string", "null"], maxLength: 200 },
    reasonCode: { type: "string" }, rationaleSummary: { type: "string" },
  },
  constraints: ["PROPOSAL_REQUIRES_CURRENT_FOCUS", "NON_PROPOSAL_MAY_OMIT_CURRENT_FOCUS"],
} as const;

export const EXTERNAL_ENGAGEMENT_RESULT_CONTRACT = {
  type: "object", additionalProperties: false, required: ["outcome", "reasonCode", "rationaleSummary"],
  properties: {
    outcome: { enum: ["PROPOSAL", "NO_PROPOSAL", "NEEDS_MORE_CONTEXT"] },
    transition: {
      type: "object", additionalProperties: false, required: ["from", "to", "waiting"],
      properties: {
        from: { enum: ["ACTIONABLE", "WAITING"] }, to: { enum: ["ACTIONABLE", "WAITING"] },
        waiting: { oneOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["description", "reviewAt"], properties: { description: { type: "string", maxLength: 200 }, reviewAt: { type: ["string", "null"] } } }] },
      },
    },
    reasonCode: { type: "string" }, rationaleSummary: { type: "string" },
  },
  constraints: ["PROPOSAL_REQUIRES_TRANSITION", "NON_PROPOSAL_FORBIDS_TRANSITION", "ACTIONABLE_TO_WAITING_REQUIRES_WAITING_OBJECT", "WAITING_TO_ACTIONABLE_REQUIRES_WAITING_NULL"],
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

export interface UpdateWorkIntentOperation {
  operationId: string;
  type: "UPDATE_WORK_INTENT";
  actor: Actor;
  target: { workObjectId: string; expectedVersion: number; expectedProjectionHash: string };
  input: { desiredOutcome: string | null; completionChecks: readonly string[] };
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

export type SemanticOperation = CreateWorkObjectOperation | RenameWorkObjectOperation | SetCurrentFocusOperation | UpdateWorkIntentOperation | ChangeEngagementOperation | CompleteWorkObjectOperation | CancelWorkObjectOperation | ReopenWorkObjectOperation | AmendClosureOperation | UndoCommitOperation;

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
  outcomeUuid: string;
  completionUuid: string;
  title: string;
  lifecycle: WorkObject["lifecycle"];
  engagement: WorkObject["engagement"];
  waitingCondition: WaitingCondition | null;
  currentFocus: string | null;
  desiredOutcome: string | null;
  completionChecks: readonly string[];
  closure?: ManagedClosureProjection | null;
  projectionHash: string;
}

export type ManagedProjectionIdentity = Pick<ManagedProjection, "containerUuid" | "titleUuid" | "stateUuid" | "focusUuid" | "waitingUuid" | "outcomeUuid" | "completionUuid">;

export interface GraphSnapshotInput {
  graphId: string;
  sourceBlockUuid: string;
  /**
   * Kernel-authoritative semantics and UUID identity for an existing formal
   * object. Writing Language v1 deliberately omits default fields, so the
   * Graph alone is not a second formal-state store.
   */
  expectedProjection?: ManagedProjection;
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
  | (GraphEffectIdentity & { type: "UPDATE_MANAGED_FIELD"; fieldUuid: string; content: string; expectedProjectionHash: string; resultingProjectionHash: string; expectedProjection?: ManagedProjection; resultingProjection?: ManagedProjection })
  | (GraphEffectIdentity & { type: "SET_CURRENT_FOCUS_FIELD"; containerUuid: string; fieldUuid: string; content: string | null; expectedProjectionHash: string; resultingProjectionHash: string; expectedProjection?: ManagedProjection; resultingProjection?: ManagedProjection })
  | (GraphEffectIdentity & { type: "UPDATE_WORK_INTENT_FIELDS"; containerUuid: string; outcomeUuid: string; completionUuid: string; desiredOutcome: string | null; completionChecks: readonly string[]; expectedProjectionHash: string; resultingProjectionHash: string; expectedProjection?: ManagedProjection; resultingProjection?: ManagedProjection })
  | (GraphEffectIdentity & { type: "CHANGE_ENGAGEMENT_FIELDS"; containerUuid: string; stateUuid: string; waitingUuid: string; engagement: "ACTIONABLE" | "WAITING"; waiting: WaitingCondition | null; expectedProjectionHash: string; resultingProjectionHash: string; expectedProjection?: ManagedProjection; resultingProjection?: ManagedProjection })
  | (GraphEffectIdentity & { type: "CHANGE_CLOSURE_FIELDS"; containerUuid: string; stateUuid: string; focusUuid: string; expectedSourceMarker: GraphSnapshot["sourceMarker"]; resultingSourceMarker: GraphSnapshot["sourceMarker"]; expectedProjection: ManagedProjection; lifecycle: WorkObject["lifecycle"]; engagement: WorkObject["engagement"]; waitingCondition: WaitingCondition | null; currentFocus: string | null; closure: ManagedClosureProjection | null; expectedProjectionHash: string; resultingProjectionHash: string; resultingProjection?: ManagedProjection })
  | (GraphEffectIdentity & { type: "REMOVE_MANAGED_PROJECTION"; containerUuid: string; expectedProjectionHash: string; expectedProjection?: ManagedProjection });

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

export interface GraphSearchMatch {
  graphId: string;
  blockUuid: string;
  pageName: string | null;
  snippet: string;
  contentHash: string;
}

export interface GraphBlockRead {
  graphId: string;
  blockUuid: string;
  pageName: string | null;
  content: string;
  contentHash: string;
}

export interface GraphPageRead {
  graphId: string;
  pageName: string;
  blocks: readonly GraphBlockRead[];
  truncated: boolean;
}

export type GraphGatewayRequest =
  | { kind: "SEARCH"; graphId: string; query: string; limit: number }
  | { kind: "READ_BLOCK"; graphId: string; blockUuid: string }
  | { kind: "READ_PAGE"; graphId: string; pageName: string; limit: number }
  | { kind: "READ_EVIDENCE"; graphId: string; blockUuid: string }
  | { kind: "READ_TARGET_SNAPSHOT"; input: GraphSnapshotInput }
  | { kind: "READ_CURATION_SNAPSHOT"; graphId: string; rootBlockUuid: string }
  | { kind: "APPLY_CURATION"; curation: AddReferenceCuration }
  | { kind: "APPLY_EFFECT"; effect: GraphEffect };

export type GraphGatewayResponse =
  | { kind: "SEARCH"; matches: readonly GraphSearchMatch[] }
  | { kind: "READ_BLOCK"; block: GraphBlockRead }
  | { kind: "READ_PAGE"; page: GraphPageRead }
  | { kind: "READ_EVIDENCE"; material: TrustedGraphEvidenceMaterial }
  | { kind: "READ_TARGET_SNAPSHOT"; snapshot: GraphSnapshot }
  | { kind: "READ_CURATION_SNAPSHOT"; snapshot: NaturalCurationSnapshot }
  | { kind: "APPLY_CURATION"; snapshot: NaturalCurationSnapshot; createdBlockUuids: readonly string[] }
  | { kind: "APPLY_EFFECT"; result: GraphApplyResult; snapshot: GraphSnapshot };

export interface GraphGatewayRequestEnvelope {
  id: string;
  request: GraphGatewayRequest;
  createdAt: string;
}

export interface GraphGatewayStatus {
  available: boolean;
  reason: "READY" | "GRAPH_ADAPTER_OFFLINE";
  graphId: string | null;
  capabilities: readonly ("SEARCH" | "READ_BLOCK" | "READ_PAGE" | "FREEZE_EVIDENCE" | "APPLY_KERNEL_EFFECT" | "APPLY_TYPED_CURATION")[];
  lastSeenAt: string | null;
}

export interface GraphReadReceipt {
  id: string;
  agentRunId: string;
  kind: "SEARCH" | "BLOCK" | "PAGE";
  locator: string;
  contentHash: string;
  readAt: string;
}

export interface SkillIdentity { id: string; version: string; contentHash: string }
export interface SkillPackage extends SkillIdentity { manifest: unknown; policy: unknown; schema: unknown; examples: unknown; eval: unknown }
export interface TasteProfile extends SkillIdentity {
  status: "PROVISIONAL" | "ACTIVE" | "CANDIDATE";
  preferences: readonly { id: string; statement: string; confidence: "HIGH" | "MEDIUM" | "LOW" }[];
  activatedAt: string | null;
}

export type AgentRunOutcome = "PROPOSAL" | "NO_PROPOSAL" | "NEEDS_MORE_CONTEXT" | "FAILED";
export interface AgentRunReceipt {
  id: string;
  purpose: "CURRENT_FOCUS_MAINTENANCE" | "ENGAGEMENT_RECONCILIATION" | "MINI_PROJECT_GOVERNANCE";
  executor: { type: "FAKE" | "BUILTIN" | "EXTERNAL_CLI"; id: string };
  state: "STARTED" | "FINISHED";
  operationContractVersion: typeof OPERATION_CONTRACT_VERSION;
  skill: SkillIdentity;
  subject: { workObjectId: string };
  context: { targetVersion: number; targetProjectionHash?: string; evidenceIds: readonly string[]; currentEngagement?: WorkObject["engagement"]; waitingCondition?: WaitingCondition | null; governanceCorrelationId?: string; taste?: SkillIdentity };
  result: { outcome: AgentRunOutcome | "BOUNDARY_REVIEW" | "PENDING"; proposalIds: readonly string[] };
  reasonCode: string;
  rationaleSummary: string;
  submissionHash?: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type MiniProjectBoundaryCandidate = "SPLIT" | "MERGE" | "KIND_CHANGE" | "PROJECT_OWNERSHIP" | "PARKED" | "CLOSURE" | "HISTORY_MOVE";
export type MiniProjectAgentResult =
  | { outcome: "PROPOSAL"; change: { type: "SET_CURRENT_FOCUS"; currentFocus: string | null } | { type: "UPDATE_WORK_INTENT"; desiredOutcome: string | null; completionChecks: readonly string[] }; reasonCode: string; rationaleSummary: string }
  | { outcome: "NO_PROPOSAL"; reasonCode: string; rationaleSummary: string }
  | { outcome: "NEEDS_MORE_CONTEXT"; question: string; reasonCode: string; rationaleSummary: string }
  | { outcome: "BOUNDARY_REVIEW"; candidate: MiniProjectBoundaryCandidate; recommendation: string; question: string; reasonCode: string; rationaleSummary: string };

export interface NaturalCurationSnapshot {
  graphId: string;
  rootBlockUuid: string;
  rootContentHash: string;
  rootTopologyHash: string;
  directChildren: readonly { blockUuid: string; content: string; contentHash: string }[];
}

export interface AddReferenceCuration {
  type: "ADD_REFERENCE";
  receiptId: string;
  graphId: string;
  rootBlockUuid: string;
  expectedRootContentHash: string;
  expectedRootTopologyHash: string;
  section: "资源" | "支撑交付物";
  existingSectionUuid: string | null;
  newSectionUuid: string;
  newReferenceUuid: string;
  referenceBlockUuid: string;
}

export interface CurationReceipt {
  id: string;
  type: "ADD_REFERENCE";
  workObjectId: string;
  agentRunId: string;
  governanceCorrelationId: string;
  skill: SkillIdentity;
  taste: SkillIdentity;
  graphId: string;
  rootBlockUuid: string;
  referenceBlockUuid: string;
  beforeContentHash: string;
  beforeTopologyHash: string;
  afterContentHash: string;
  afterTopologyHash: string;
  createdBlockUuids: readonly string[];
  createdAt: string;
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

export function parseMiniProjectAgentResult(value: unknown): MiniProjectAgentResult {
  const candidate = record(value, "AGENT_RESULT_INVALID", "MiniProject governance result");
  exactKeys(candidate, ["outcome", "change", "candidate", "recommendation", "question", "reasonCode", "rationaleSummary"], "AGENT_RESULT_UNKNOWN_FIELD");
  if (typeof candidate.reasonCode !== "string" || typeof candidate.rationaleSummary !== "string") throw new ContractError("AGENT_RESULT_EXPLANATION_INVALID", "MiniProject result requires reasonCode and rationaleSummary.");
  if (candidate.outcome === "PROPOSAL") {
    const change = record(candidate.change, "AGENT_CHANGE_REQUIRED", "MiniProject change");
    if (change.type === "SET_CURRENT_FOCUS") {
      exactKeys(change, ["type", "currentFocus"], "AGENT_RESULT_UNKNOWN_FIELD");
      if (change.currentFocus !== null && typeof change.currentFocus !== "string") throw new ContractError("CURRENT_FOCUS_INVALID", "Current focus must be text or null.");
      const currentFocus = typeof change.currentFocus === "string" ? change.currentFocus.trim() || null : null;
      if (currentFocus && currentFocus.length > 200) throw new ContractError("CURRENT_FOCUS_TOO_LONG", "Current focus exceeds 200 characters.");
      return { outcome: "PROPOSAL", change: { type: "SET_CURRENT_FOCUS", currentFocus }, reasonCode: candidate.reasonCode, rationaleSummary: candidate.rationaleSummary };
    }
    if (change.type === "UPDATE_WORK_INTENT") {
      exactKeys(change, ["type", "desiredOutcome", "completionChecks"], "AGENT_RESULT_UNKNOWN_FIELD");
      if (change.desiredOutcome !== null && typeof change.desiredOutcome !== "string") throw new ContractError("DESIRED_OUTCOME_INVALID", "Desired outcome must be text or null.");
      const desiredOutcome = typeof change.desiredOutcome === "string" ? change.desiredOutcome.trim() || null : null;
      if (desiredOutcome && desiredOutcome.length > 500) throw new ContractError("DESIRED_OUTCOME_TOO_LONG", "Desired outcome exceeds 500 characters.");
      const completionChecks = stringArray(change.completionChecks, "COMPLETION_CHECKS_INVALID", "Completion checks");
      if (completionChecks.length > 10 || completionChecks.some((item) => item.length > 300)) throw new ContractError("COMPLETION_CHECKS_INVALID", "Completion checks exceed the bounded contract.");
      return { outcome: "PROPOSAL", change: { type: "UPDATE_WORK_INTENT", desiredOutcome, completionChecks }, reasonCode: candidate.reasonCode, rationaleSummary: candidate.rationaleSummary };
    }
    throw new ContractError("AGENT_CHANGE_UNSUPPORTED", "MiniProject governance supports only current focus or WorkIntent changes.");
  }
  if (candidate.outcome === "NO_PROPOSAL") return { outcome: "NO_PROPOSAL", reasonCode: candidate.reasonCode, rationaleSummary: candidate.rationaleSummary };
  if (candidate.outcome === "NEEDS_MORE_CONTEXT") return { outcome: "NEEDS_MORE_CONTEXT", question: text(candidate.question, "AGENT_QUESTION_REQUIRED", "One bottleneck question"), reasonCode: candidate.reasonCode, rationaleSummary: candidate.rationaleSummary };
  if (candidate.outcome === "BOUNDARY_REVIEW") {
    const allowed = new Set<MiniProjectBoundaryCandidate>(["SPLIT", "MERGE", "KIND_CHANGE", "PROJECT_OWNERSHIP", "PARKED", "CLOSURE", "HISTORY_MOVE"]);
    if (!allowed.has(candidate.candidate as MiniProjectBoundaryCandidate)) throw new ContractError("BOUNDARY_CANDIDATE_INVALID", "Boundary candidate is unsupported.");
    return { outcome: "BOUNDARY_REVIEW", candidate: candidate.candidate as MiniProjectBoundaryCandidate, recommendation: text(candidate.recommendation, "BOUNDARY_RECOMMENDATION_REQUIRED", "Boundary recommendation"), question: text(candidate.question, "AGENT_QUESTION_REQUIRED", "One bottleneck question"), reasonCode: candidate.reasonCode, rationaleSummary: candidate.rationaleSummary };
  }
  throw new ContractError("AGENT_RESULT_OUTCOME_INVALID", "MiniProject result outcome is unsupported.");
}

export type ProposalStatus = "OPEN" | "APPLIED" | "PACKAGED" | "DISMISSED" | "INVALIDATED";
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
  governanceCorrelationId?: string;
  taste?: SkillIdentity;
  risk: "LOW";
  createdAt: string;
}
export interface WorkIntentProposalRevision {
  proposalId: string;
  revision: number;
  operationType: "UPDATE_WORK_INTENT";
  operationContractVersion: typeof OPERATION_CONTRACT_VERSION;
  desiredOutcome: string | null;
  completionChecks: readonly string[];
  expectedVersion: number;
  expectedProjectionHash: string;
  evidenceDependencies: readonly EvidenceDependency[];
  skill: SkillIdentity;
  agentRunId: string;
  governanceCorrelationId: string;
  taste: SkillIdentity;
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
export type ProposalRevision = CurrentFocusProposalRevision | WorkIntentProposalRevision | EngagementProposalRevision;
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
  operationType: "SET_CURRENT_FOCUS" | "UPDATE_WORK_INTENT" | "CHANGE_ENGAGEMENT";
  signalStrength?: "WEAK_ACCEPTANCE" | "STRONG_POSITIVE" | "CORRECTIVE";
  governanceCorrelationId?: string | null;
  userComment?: string | null;
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

export type ProjectionObligationStatus = "PENDING" | "APPLIED" | "VERIFIED" | "FAILED";

export interface ProjectionObligation {
  id: string;
  commitId: string;
  workObjectId: string;
  formalVersion: number;
  targetAnchorId: string;
  desiredProjectionHash: string | null;
  status: ProjectionObligationStatus;
  attempt: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  retryExhausted: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormalCommitResult {
  commit: StoredCommit;
  graphEffect: GraphEffect;
  projectionObligation: ProjectionObligation;
}

export type ReconcileTriggerType = "WORK_BURST_ENDED" | "FORMALIZATION_BASELINE" | "EVIDENCE_CHANGED" | "MANUAL_RECONCILE" | "SEMANTIC_IMPACT" | "POST_CLOSURE_ACTIVITY" | "RESUME_FROM_PAUSE";
export type ReconcileJobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "STALE";
export type ReconcilePriorityClass = "NORMAL" | "INTERACTIVE" | "SYSTEM_RECOVERY";

export interface ReconcileJob {
  id: string;
  workObjectId: string;
  triggerType: ReconcileTriggerType;
  sourceSnapshotId: string;
  sourceBlockUuid: string | null;
  formalVersion: number;
  priorityClass: ReconcilePriorityClass;
  attempt: number;
  notBefore: string | null;
  status: ReconcileJobStatus;
  lastError: string | null;
  lastOutcome: MaintenanceReconcileOutcome | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceCoverageState {
  workObjectId: string;
  lastObservedSourceSnapshotId: string;
  lastReconciledSourceSnapshotId: string | null;
  formalVersionAtLastReconcile: number | null;
  hasUncoveredChanges: boolean;
  updatedAt: string;
}

export interface SourceChangeObservation {
  workObjectId: string;
  graphId: string;
  sourceBlockUuid: string;
  sourceContentHash: string;
  sourceMarker?: GraphSnapshot["sourceMarker"];
  observedAt: string;
}

export type MaintenanceReconcileOutcome = "NO_CHANGE" | "CONFIRMED_CHANGE" | "UNKNOWN" | "CONFLICT" | "BOUNDARY_CANDIDATE" | "NEEDS_MORE_CONTEXT";

export interface SourceRef {
  graphId: string;
  blockUuid: string;
  pageName?: string | null;
  contentHash?: string | null;
}

export type ContextAssociationOrigin = "USER_EXPLICIT" | "AGENT_INFERRED" | "SYSTEM_STRUCTURAL";
export type ContextAssociationStatus = "ACTIVE" | "INVALIDATED";

export interface ContextAssociation {
  id: string;
  workObjectId: string;
  sourceRef: SourceRef;
  sourceVersionHash: string;
  origin: ContextAssociationOrigin;
  basisRunId?: string | null;
  status: ContextAssociationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AssociationCorrection {
  id: string;
  sourceRef: SourceRef;
  scopeSnapshot: string;
  rejectedWorkObjectId: string;
  affirmedWorkObjectId: string | null;
  userDecisionRef: string;
  createdAt: string;
}

export type GovernanceIssueType = "UNKNOWN" | "CONFLICT" | "BOUNDARY_CANDIDATE";export type GovernanceIssueStatus = "OPEN" | "RESOLVED" | "SUPERSEDED";
export type GovernanceDimension = "current_focus" | "engagement" | "authority";

export interface GovernanceIssue {
  id: string;
  workObjectId: string;
  dimension: GovernanceDimension;
  type: GovernanceIssueType;
  status: GovernanceIssueStatus;
  summary: string;
  evidenceIds: readonly string[];
  sourceSnapshotId: string;
  formalVersion: number;
  correlationId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export type ContextPackRole = "FORMAL_STATE" | "SOURCE_DELTA" | "ASSOCIATED_CONTEXT" | "OPEN_ISSUE" | "HISTORICAL_EVIDENCE";
export interface ContextPackItem {
  handle: string;
  role: ContextPackRole;
  sourceRef: SourceRef | null;
  sourceHash: string | null;
  content: string;
  workObjectId?: string | null;
}

export type SemanticJudgment =
  | { kind: "CONFIRMED_CHANGE"; dimension: GovernanceDimension; proposedOperation: { type: "SET_CURRENT_FOCUS"; currentFocus: string | null } | { type: "CHANGE_ENGAGEMENT"; transition: { from: "ACTIONABLE" | "WAITING"; to: "ACTIONABLE" | "WAITING"; waiting: { description: string; reviewAt: string | null } | null } }; supportingContextHandles: string[]; rationaleSummary: string; resolvesIssueIds?: string[] }
  | { kind: "NO_CHANGE"; dimension: GovernanceDimension; supportingContextHandles?: string[]; rationaleSummary: string; resolvesIssueIds?: string[] }
  | { kind: "UNKNOWN"; dimension: GovernanceDimension; relevantContextHandles: string[]; summary: string }
  | { kind: "CONFLICT"; dimension: GovernanceDimension; conflictingContextHandles: string[]; summary: string }
  | { kind: "BOUNDARY_CANDIDATE"; dimension: GovernanceDimension; relevantContextHandles: string[]; summary: string };

export interface ExecutionProfile {
  id: string;
  executor: "FAKE" | "DEEPSEEK";
  modelAlias?: string;
  remoteEnabled: boolean;
  allowedDataScope: readonly string[];
  maxContextItems: number;
  maxInputChars: number;
  reasoningEffort?: "low" | "medium" | "high" | "max";
  maxOutputTokens?: number;
  timeoutMs: number;
  retryBudget: number;
  credentialRef: string | null;
}

/** Cognition-only reasoning budget profiles. They never change formal authority. */
export const CONVERSATION_FAST_PROFILE = {
  id: "conversation-fast", executor: "DEEPSEEK", modelAlias: "deepseek-v4-flash", remoteEnabled: true,
  allowedDataScope: ["formal_state", "current_workobject_context"], maxContextItems: 8, maxInputChars: 18_000,
  reasoningEffort: "low", maxOutputTokens: 800, timeoutMs: 20_000, retryBudget: 1, credentialRef: "DEEPSEEK_API_KEY",
} as const satisfies ExecutionProfile;

export const CONVERSATION_DEEP_PROFILE = {
  id: "conversation-deep", executor: "DEEPSEEK", modelAlias: "deepseek-v4-flash", remoteEnabled: true,
  allowedDataScope: ["formal_state", "current_workobject_context"], maxContextItems: 16, maxInputChars: 28_000,
  reasoningEffort: "high", maxOutputTokens: 2_000, timeoutMs: 45_000, retryBudget: 2, credentialRef: "DEEPSEEK_API_KEY",
} as const satisfies ExecutionProfile;

export interface CognitionJudgeInput {
  object: WorkObject;
  contextPack: ContextPackItem[];
  openIssues: GovernanceIssue[];
  profile: ExecutionProfile;
}

export interface CognitionExecutor {
  readonly id: string;
  judge(input: CognitionJudgeInput): Promise<SemanticJudgment>;
}

export type DiscoveryScope =
  | { kind: "TODAY"; date: string; windowHours?: number }
  | { kind: "RECENT_WINDOW"; from: string; to: string }
  | { kind: "PAGE"; graphId: string; pageName: string }
  | { kind: "SUBTREE"; graphId: string; pageName: string; blockUuid: string }
  | { kind: "EXPLICIT_SOURCE_SET"; sources: readonly SourceRef[] };

export interface DiscoveryPackItem {
  handle: string;
  sourceRef: SourceRef;
  content: string;
  sourceHash: string;
  observedAt: string;
  clusterHandle?: string;
}

export interface DiscoveryExistingObject {
  handle: string;
  workObjectId: string;
  kind: WorkObjectKind;
  title: string;
  lifecycle: WorkObject["lifecycle"];
  engagement: WorkObject["engagement"];
  currentFocus: string | null;
  desiredOutcome: string | null;
}

export type DiscoveryNoCandidateReason = "EPHEMERAL" | "ONE_OFF" | "REFERENCE_ONLY" | "INSUFFICIENT_BOUNDARY" | "ALREADY_COVERED" | "UNCERTAIN";

export type DiscoveryCandidateKind = WorkObjectKind | "UNRESOLVED";
export type DiscoveryMaturity = "UNEVALUATED" | "KEEP_OBSERVING" | "READY_FOR_DECISION" | "INSUFFICIENT_BOUNDARY";

export interface ProposedWorkIntent {
  desiredOutcome: string | null;
  completionChecks: readonly string[];
}

export type DiscoveryJudgment =
  | { kind: "ASSOCIATE_EXISTING"; sourceHandles: string[]; targetWorkObjectId: string; rationaleSummary: string }
  | { kind: "ATTACH_TO_CANDIDATE"; candidateId: string; sourceHandles: string[]; rationaleSummary: string }
  | { kind: "NO_CANDIDATE"; sourceHandles: string[]; reason: DiscoveryNoCandidateReason; rationaleSummary: string }
  | { kind: "FORMALIZATION_CANDIDATE"; sourceHandles: string[]; recommendedKind: DiscoveryCandidateKind; recommendedOwnerId: string | null; proposedTitle: string | null; proposedWorkIntent: ProposedWorkIntent | null; maturity?: DiscoveryMaturity; supportingHandles?: string[]; rationaleSummary: string };

export interface DiscoveryOpenCandidateSummary {
  candidateId: string;
  recommendedKind: DiscoveryCandidateKind;
  proposedTitle: string | null;
  recommendedOwnerId: string | null;
  rationaleSummary: string;
  sourceRefs: readonly SourceRef[];
  sourceContents: readonly string[];
  lastObservedAt: string;
  maturity: DiscoveryMaturity;
}

export interface DiscoveryJudgeInput {
  scope: DiscoveryScope;
  contextPack: DiscoveryPackItem[];
  existingObjects: DiscoveryExistingObject[];
  openCandidates: DiscoveryOpenCandidateSummary[];
  profile: ExecutionProfile;
}

export interface DiscoveryExecutor {
  readonly id: string;
  tokenUsage?: { inputTokens?: number | null; outputTokens?: number | null } | null;
  judge(input: DiscoveryJudgeInput): Promise<DiscoveryJudgment[]>;
}

export type FormalizationCandidateStatus = "OPEN" | "MATERIALIZED" | "DISMISSED" | "EXPIRED";

export interface FormalizationCandidate {
  id: string;
  status: FormalizationCandidateStatus;
  revision: number;
  scope: DiscoveryScope;
  sourceRefs: readonly SourceRef[];
  sourceHashes: readonly string[];
  sourceContents: readonly string[];
  recommendedKind: DiscoveryCandidateKind;
  recommendedOwnerId: string | null;
  proposedTitle: string | null;
  proposedWorkIntent: ProposedWorkIntent | null;
  rationaleSummary: string;
  maturity: DiscoveryMaturity;
  maturityEvaluatedAt: string | null;
  supportingSourceRefs: readonly SourceRef[];
  createdAt: string;
  updatedAt: string;
  lastObservedAt: string;
  expiresAt: string | null;
  discoveryRunIds: readonly string[];
  evidenceRefs: readonly string[];
  materializedWorkObjectId: string | null;
  decisionPackageId: string | null;
}

export interface FormalizationEvidence {
  id: string;
  candidateId: string;
  sourceRef: SourceRef;
  sourceHash: string;
  frozenContent: string;
  proof: string;
  frozenAt: string;
}

export type DiscoveryRunStatus = "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";

export interface DiscoveryRun {
  id: string;
  scope: DiscoveryScope;
  executorId: string;
  modelAlias: string | null;
  status: DiscoveryRunStatus;
  sourceCount: number;
  scopeTotal: number;
  selectedCount: number;
  newlyJudgedCount: number;
  alreadyCoveredCount: number;
  totalCoveredCount: number;
  remainingCount: number;
  continuationToken: string | null;
  associationCount: number;
  noCandidateCount: number;
  candidateIds: readonly string[];
  summaryText: string;
  latencyMs: number;
  tokenUsage: { inputTokens?: number | null; outputTokens?: number | null } | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface DiscoveryRunSourceOutcome {
  runId: string;
  sourceRef: SourceRef;
  sourceHash: string;
  outcome: "ASSOCIATED" | "ATTACHED" | "NO_CANDIDATE" | "CANDIDATE" | "UNRESOLVED";
  candidateId?: string | null;
  targetWorkObjectId?: string | null;
  reason?: string | null;
}

export interface OrganizeTodayResult {
  run: DiscoveryRun;
  runs: readonly DiscoveryRun[];
  scope: DiscoveryScope;
  associations: readonly ContextAssociation[];
  candidates: readonly FormalizationCandidate[];
  readyCandidates: readonly FormalizationCandidate[];
  maturePackages: readonly DecisionPackage[];
  reconcileJobs: readonly ReconcileJob[];
  graphAvailable: boolean;
  pauseRespected: boolean;
  summaryText: string;
}

export interface DecisionCandidate {
  id: string;
  packageId: string;
  operationType: OperationType;
  parameters: unknown;
  evidenceIds: readonly string[];
  status: "OPEN" | "ACCEPTED" | "REJECTED" | "DEFERRED";
}

export interface AssignParentDecisionParameters {
  childId: string;
  ownerId: string;
  childVersion: number;
  previousOwnerId: string | null;
}

export interface DecisionPackage {
  id: string;
  workObjectId: string | null;
  summary: string;
  rationale: string;
  status: "OPEN" | "ACCEPTED" | "REJECTED" | "STALE";
  targetVersions: Record<string, number>;
  issueRefs: readonly string[];
  presentationRevision: string;
  candidateRevision: number | null;
  presentedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TrustedUserEventStatus = "PENDING" | "CONSUMED" | "EXPIRED";

export interface TrustedUserEvent {
  id: string;
  sourceChannel: "PLUGIN_USER_CHANNEL";
  sourceCapability: string | null;
  exactUserUtterance: string;
  capturedAt: string;
  packageId: string | null;
  presentationRevision: string | null;
  correlationId: string | null;
  status: TrustedUserEventStatus;
  consumedByDecisionId: string | null;
  createdAt: string;
}

export interface UserDecision {
  id: string;
  workObjectIds: readonly string[];
  operationType: OperationType;
  parameters: unknown;
  scope: string;
  exactUserUtterance: string;
  minimalDecisionContext: string;
  inputVersions: Record<string, number>;
  status: "EXECUTED" | "REJECTED" | "STALE" | "AUTHORIZED";
  packageId: string | null;
  authorizationRef: string | null;
  createdAt: string;
  executedAt: string | null;
  executionRefs: readonly string[];
}

export type UserDecisionCompileResult =
  | { kind: "AUTHORIZED_DECISION"; decision: UserDecision }
  | { kind: "NEEDS_CLARIFICATION"; reason: string }
  | { kind: "NOT_AUTHORIZATION"; reason: string }
  | { kind: "STALE"; reason: string }
  | { kind: "AMBIGUOUS"; reason: string }
  | { kind: "UNSUPPORTED"; reason: string };

export interface UserReadBaseline {
  workObjectId: string;
  lastViewedFormalVersion: number;
  lastViewedAt: string;
  lastSeenCommitId: string | null;
}

export interface ObjectContextRef {
  sourceRef: SourceRef;
  snippet: string | null;
  sourceHash: string;
  role: ContextAssociationOrigin;
}

export interface ObjectContextChild {
  workObjectId: string;
  title: string;
  kind: WorkObjectKind;
  currentFocus: string | null;
  engagement: WorkObject["engagement"];
  reason: string;
}

export interface ObjectContextPack {
  workObjectId: string;
  title: string;
  kind: WorkObjectKind;
  formalVersion: number;
  lifecycle: WorkObject["lifecycle"];
  engagement: WorkObject["engagement"];
  currentFocus: string | null;
  waitingCondition: WaitingCondition | null;
  desiredOutcome: string | null;
  completionChecks: readonly string[];
  recentChanges: readonly string[];
  contextRefs: readonly ObjectContextRef[];
  openIssues: readonly GovernanceIssue[];
  pendingDecisionPackages: readonly string[];
  activeChildren: readonly ObjectContextChild[];
  projectIntent: ProjectIntent | null;
  reentrySummary: string;
  allowedAgentActions: readonly string[];
  userOnlyActions: readonly string[];
  freshness: { graphAvailable: boolean; sourceCoverage: "ALIGNED" | "UNCOVERED_CHANGES" | "UNKNOWN" };
}

export interface NowProjectionItem {
  id: string;
  source: "FORMAL" | "NATURAL_FRONTIER";
  workObjectId: string | null;
  title: string;
  kind: WorkObjectKind | "FRONTIER";
  whyNow: string;
  currentReality: string;
  meaningfulChanges: readonly string[];
  continuationPoint: string;
  engagement: WorkObject["engagement"];
  waitingSummary: string | null;
  pendingDecisionCount: number;
  coverageHonesty: string;
  provenance: string;
  lastSeenAt: string | null;
  changesSinceLastSeen: number;
}

export interface NowProjection {
  items: readonly NowProjectionItem[];
  generatedAt: string;
  graphAvailable: boolean;
}

export interface ConfirmationProjectionItem {
  packageId: string;
  candidateId: string | null;
  title: string;
  summary: string;
  impact: string;
  whyNow: string;
  evidenceCount: number;
  status: "OPEN" | "STALE";
}

export interface ConfirmationProjection {
  items: readonly ConfirmationProjectionItem[];
  generatedAt: string;
}

export interface WorkMapNode {
  workObjectId: string;
  title: string;
  kind: WorkObjectKind;
  lifecycle: WorkObject["lifecycle"];
  engagement: WorkObject["engagement"];
  currentFocus: string | null;
  desiredOutcome: string | null;
  currentPhase: string | null;
  children: readonly WorkMapNode[];
}

export interface WorkMapProjection {
  roots: readonly WorkMapNode[];
  total: number;
  generatedAt: string;
}

export interface SystemProjection {
  status: "ok" | "degraded";
  graphAvailable: boolean;
  maintenancePaused: boolean;
  projectionBacklog: number;
  projectionDegraded: number;
  lastDiscovery: { id: string; status: string; remainingCount: number; summaryText: string } | null;
  recoveryCount: number;
  executorId: string;
  generatedAt: string;
}

export interface GraphAdapter {
  readGraphSnapshot(input: GraphSnapshotInput): Promise<GraphSnapshot>;
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
  if (operationType !== "CREATE_WORK_OBJECT" && operationType !== "RENAME_WORK_OBJECT" && operationType !== "SET_CURRENT_FOCUS" && operationType !== "UPDATE_WORK_INTENT" && operationType !== "CHANGE_ENGAGEMENT" && operationType !== "COMPLETE_WORK_OBJECT" && operationType !== "CANCEL_WORK_OBJECT" && operationType !== "REOPEN_WORK_OBJECT" && operationType !== "AMEND_CLOSURE" && operationType !== "UNDO_COMMIT") {
    throw new ContractError("OPERATION_TYPE_UNSUPPORTED", "Only registered semantic operations are accepted.");
  }
  exactKeys(candidate, operationType === "CREATE_WORK_OBJECT"
    ? ["operationId", "type", "actor", "input", "preconditions"]
    : operationType === "SET_CURRENT_FOCUS" || operationType === "UPDATE_WORK_INTENT" || operationType === "CHANGE_ENGAGEMENT"
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

  if (operationType === "UPDATE_WORK_INTENT") {
    exactKeys(target, ["workObjectId", "expectedVersion", "expectedProjectionHash"], "OPERATION_TARGET_UNKNOWN_FIELD");
    exactKeys(input, ["desiredOutcome", "completionChecks"], "OPERATION_INPUT_UNKNOWN_FIELD");
    if (!Number.isSafeInteger(target.expectedVersion) || Number(target.expectedVersion) < 1) throw new ContractError("EXPECTED_VERSION_INVALID", "Expected version must be a positive integer.");
    const expectedProjectionHash = hash(target.expectedProjectionHash, "PROJECTION_HASH_INVALID");
    const dependencies = candidate.evidenceDependencies;
    if (!Array.isArray(dependencies) || dependencies.length < 1) throw new ContractError("EVIDENCE_DEPENDENCIES_REQUIRED", "At least one frozen Evidence dependency is required.");
    const evidenceDependencies = dependencies.map((dependency) => {
      const item = record(dependency, "EVIDENCE_DEPENDENCY_INVALID", "Evidence dependency");
      exactKeys(item, ["evidenceId", "contentHash"], "EVIDENCE_DEPENDENCY_UNKNOWN_FIELD");
      return { evidenceId: text(item.evidenceId, "EVIDENCE_ID_REQUIRED", "Evidence id"), contentHash: strongHash(item.contentHash, "EVIDENCE_CONTENT_HASH_INVALID") };
    });
    if (input.desiredOutcome !== null && typeof input.desiredOutcome !== "string") throw new ContractError("DESIRED_OUTCOME_INVALID", "Desired outcome must be text or null.");
    const desiredOutcome = typeof input.desiredOutcome === "string" ? input.desiredOutcome.trim() || null : null;
    if (desiredOutcome && desiredOutcome.length > 500) throw new ContractError("DESIRED_OUTCOME_TOO_LONG", "Desired outcome exceeds 500 characters.");
    const completionChecks = stringArray(input.completionChecks, "COMPLETION_CHECKS_INVALID", "Completion checks");
    if (completionChecks.length > 10) throw new ContractError("COMPLETION_CHECKS_TOO_MANY", "Completion checks exceed 10 items.");
    if (completionChecks.some((item) => item.length > 300)) throw new ContractError("COMPLETION_CHECK_TOO_LONG", "Completion check exceeds 300 characters.");
    const preconditions = [
      { kind: "WORK_OBJECT_VERSION" as const, expected: Number(target.expectedVersion) },
      { kind: "MANAGED_PROJECTION_HASH" as const, expected: expectedProjectionHash },
      { kind: "EVIDENCE_DEPENDENCIES" as const, expected: evidenceDependencies },
    ] as const;
    if (candidate.preconditions !== undefined && canonical(candidate.preconditions) !== canonical(preconditions)) throw new ContractError("OPERATION_PRECONDITIONS_INVALID", "Preconditions must match the semantic operation.");
    return { ...common, type: operationType, target: { workObjectId: text(target.workObjectId, "WORK_OBJECT_ID_REQUIRED", "WorkObject id"), expectedVersion: Number(target.expectedVersion), expectedProjectionHash }, input: { desiredOutcome, completionChecks }, evidenceDependencies, preconditions };
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
