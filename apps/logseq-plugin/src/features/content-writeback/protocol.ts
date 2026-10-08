import type { SourceScope, BlockTarget, BlockSnapshot, SourceSnapshot } from "../../workspace/source-protocol.ts";
export type { SourceScope, BlockTarget, BlockSnapshot, SourceSnapshot } from "../../workspace/source-protocol.ts";
export type TextRange = { start: number; end: number };
interface OperationBase {
  operationId: string; target: BlockTarget; expectedContentVersion: string; expectedParentUuid: string | null;
}
export type TextOperation = OperationBase & {
  type: "replace-text" | "insert-text"; range: TextRange; expectedText: string; text: string;
  context: { before: string; after: string } | null;
};
export type ChildOperation = OperationBase & { type: "insert-child"; content: string; childUuid: string | null };
export type MoveOperation = OperationBase & {
  type: "move-block"; destination: BlockTarget; position: "before" | "after" | "first-child";
  expectedDestinationVersion: string; expectedDestinationParentUuid: string | null;
  expectedStructureVersion: string;
};
export type Operation = TextOperation | ChildOperation | MoveOperation;
export type MoveFact = {
  before: SourceSnapshot; after: SourceSnapshot | null;
  propertiesBefore: Record<string, Record<string, unknown>>;
  ownersBefore: Record<string, string | null>;
  propertiesAfter: Record<string, Record<string, unknown>> | null;
  verified: boolean;
};
export type Patch = {
  schemaVersion: 1 | 2; requestId: string; scope: SourceScope; operations: readonly Operation[];
  metadata: { runId: string | null; stageId: string | null } | null;
};
export type ItemStatus = "NOT_APPLIED" | "APPLIED_VERIFIED" | "CONFLICT" | "BLOCKED" | "OUTCOME_UNKNOWN" | "NO_CHANGE";
export type ExecutionPhase = "PENDING" | "EXECUTING" | "ACKNOWLEDGED" | "SETTLED";
export type LoadedGuidanceBasis={loading:"explicit-read";sourceLoadedAt:string;returnedAt:string;common:{key:string;version:string};project:{key:string;version:string}};
export type CallOrigin = { kind: "local-user-command"; command: string } | { kind: "local-capability" } | {
  kind:"verified-local-agent";instanceId:string;connectionId:string;clientLabel:string;transportRequestId:string;command:string;
  /** Transport label identifies a caller in this connection, not a verified person/model. */
  guidance:LoadedGuidanceBasis|null;
};
export type IdentityFact = {
  status: "PENDING" | "VERIFIED" | "OUTCOME_UNKNOWN"; before: string; after: string | null;
  beforeVersion: string; afterVersion: string | null; problem: string | null;
};
export type ItemFact = {
  operationId: string; target: BlockTarget; type: Operation["type"]; phase: ExecutionPhase; status: ItemStatus;
  reason: string | null; baseContent: string | null; baseVersion: string | null;
  proposedContent: string | null; actualContent: string | null; actualVersion: string | null;
  currentContent: string | null; currentVersion: string | null; parentUuid: string | null; childUuid: string | null;
  identity: IdentityFact | null; move?: MoveFact; contentVerified: boolean; expectationObserved: boolean;
  dispatchedAt: string | null; acknowledgedAt: string | null; verifiedAt: string | null;
  readbackNormalization?:"native-id-after-first-line";
};
export type RequestRecord = {
  schemaVersion: 1; intentKind: "content-patch" | "scope-identity" | "ordinary-todo" | "formatting"; sequence: number; digest: string; patch: Patch; origin: CallOrigin;
  ordinaryTodo?:OrdinaryTodoFact;
  formatting?:FormattingFact;
  retryOf: string | null; createdAt: string; updatedAt: string; items: ItemFact[];
  resolutions: Record<string, "keep-current" | "copied" | "retry-verified">;
};
export type OrdinaryTodoFact={
  schemaVersion:1;action:"create"|"complete"|"reopen";requestJson:string;requestDigest:string;
  evidence:null|{kind:"material-version";materialId:string;filename:string;reference:string;version:string;observedAt:string;verifiedText:string};
};
/** Installer-owned execution of a closed TODO action. Never part of public content.apply. */
export interface ControlledTodoExecution {
  intentKind:"ordinary-todo";
  fact:OrdinaryTodoFact;
  assert(lease:ScopeLease):void;
  authorize(lease:ScopeLease,read:SourceRead,operations:readonly Operation[]):void;
  beforeDispatch():Promise<void>;
  matchesReadback(actual:string|null,expected:string,uuid:string):boolean;
}
export type FormattingFact={schemaVersion:1;proposalId:string;requestDigest:string;sourceSetVersion:string;structureVersion:string;sourceIds:string[];proposedBy:CallOrigin};
export interface ControlledFormattingExecution {
  intentKind:"formatting";fact:FormattingFact;
  assert(lease:ScopeLease):void;
  authorize(lease:ScopeLease,read:SourceRead,operations:readonly Operation[]):void;
  beforeDispatch():Promise<void>;
  matchesReadback(actual:string|null,expected:string,uuid:string):boolean;
  afterVerified(read:SourceRead,operations:readonly Operation[]):void;
}
export type ControlledExecution=ControlledTodoExecution|ControlledFormattingExecution;
export type ApplyResult = { status: "complete" | "partial" | "not-applied" | "outcome-unknown"; record: RequestRecord; durable: boolean; journalProblem: string | null };
export type ProtectedRange = TextRange & { reason: "property" | "formal-title" | "managed" | "todo" | "ambiguous-formal-field" };
export type Protection = { ranges: readonly ProtectedRange[]; insertAllowed: boolean };
export interface SourceRead {
  snapshot: SourceSnapshot; protections: ReadonlyMap<string, Protection>;
  structure?: ReadonlyMap<string, { blocked: boolean; ownerUuid: string | null; properties: Record<string, unknown> }>;
  children: ReadonlyMap<string, readonly string[]>; paths: ReadonlyMap<string, readonly string[]>;
}
export interface SourceReader {
  read(scope: SourceScope, valid: () => boolean): Promise<SourceRead>;
  block(scope: SourceScope, uuid: string, valid: () => boolean): Promise<Pick<BlockSnapshot,"content"|"contentVersion"|"parentUuid"> | null>;
}
export interface ScopeLease { scope: SourceScope; epoch: number; signal: AbortSignal; rootPath: readonly string[] | null }
export interface ScopeAuthority {
  /** Trusted authority state; absent only for legacy embedded executors. Never a caller lease field. */
  allowsSourceWrite?(lease: ScopeLease): boolean;
  capture(scope: SourceScope): ScopeLease | null;
  valid(lease: ScopeLease): boolean;
  allowsStructure?(lease: ScopeLease): boolean;
  allowsTodo(lease: ScopeLease, operation: Operation): boolean;
}
export interface EditingGuard { assertSafe(scope: SourceScope, affected: readonly string[], valid: () => boolean): Promise<void> }
export interface SourceWriter {
  supportsMove?(): boolean;
  move?(scope: SourceScope, uuid: string, destination: string, position: MoveOperation["position"], valid: () => boolean): Promise<void>;
  update(scope: SourceScope, uuid: string, content: string, valid: () => boolean): Promise<void>;
  insert(scope: SourceScope, parent: string, lastChild: string | null, uuid: string, content: string, valid: () => boolean): Promise<void>;
  persistIdentity(scope: SourceScope, uuid: string, content: string, valid: () => boolean): Promise<void>;
}
export interface OperationJournal {
  load(scope: SourceScope, requestId: string): Promise<RequestRecord | null>;
  save(record: RequestRecord): Promise<void>;
  list(scope: SourceScope): Promise<RequestRecord[]>;
}
