// Consumer-owned port shapes. workspace-context will supply the shared provider.
export type SourceScope = { graphId: string; rootUuid: string };
export type BlockTarget = { kind: "logseq-block"; graphId: string; blockUuid: string };
export type BlockSnapshot = {
  sourceId: string; target: BlockTarget; content: string | null; contentVersion: string | null;
  parentUuid: string | null; order: number; depth: number;
  availability: "available" | "missing" | "unavailable";
};
export type SourceSnapshot = {
  schemaVersion: 1; scope: SourceScope; blocks: readonly BlockSnapshot[];
  structureVersion: string; sourceSetVersion: string; capturedAt: string;
};
export type TextRange = { start: number; end: number };
interface OperationBase {
  operationId: string; target: BlockTarget; expectedContentVersion: string; expectedParentUuid: string | null;
}
export type TextOperation = OperationBase & {
  type: "replace-text" | "insert-text"; range: TextRange; expectedText: string; text: string;
  context: { before: string; after: string } | null;
};
export type ChildOperation = OperationBase & { type: "insert-child"; content: string; childUuid: string | null };
export type Operation = TextOperation | ChildOperation;
export type Patch = {
  schemaVersion: 1; requestId: string; scope: SourceScope; operations: readonly Operation[];
  metadata: { runId: string | null; stageId: string | null } | null;
};
export type ItemStatus = "NOT_APPLIED" | "APPLIED_VERIFIED" | "CONFLICT" | "BLOCKED" | "OUTCOME_UNKNOWN" | "NO_CHANGE";
export type ExecutionPhase = "PENDING" | "EXECUTING" | "ACKNOWLEDGED" | "SETTLED";
export type CallOrigin = { kind: "local-user-command"; command: string } | { kind: "local-capability" };
export type IdentityFact = {
  status: "PENDING" | "VERIFIED" | "OUTCOME_UNKNOWN"; before: string; after: string | null;
  beforeVersion: string; afterVersion: string | null; problem: string | null;
};
export type ItemFact = {
  operationId: string; target: BlockTarget; type: Operation["type"]; phase: ExecutionPhase; status: ItemStatus;
  reason: string | null; baseContent: string | null; baseVersion: string | null;
  proposedContent: string | null; actualContent: string | null; actualVersion: string | null;
  currentContent: string | null; currentVersion: string | null; parentUuid: string | null; childUuid: string | null;
  identity: IdentityFact | null; contentVerified: boolean; expectationObserved: boolean;
  dispatchedAt: string | null; acknowledgedAt: string | null; verifiedAt: string | null;
};
export type RequestRecord = {
  schemaVersion: 1; intentKind: "content-patch" | "scope-identity"; sequence: number; digest: string; patch: Patch; origin: CallOrigin;
  retryOf: string | null; createdAt: string; updatedAt: string; items: ItemFact[];
  resolutions: Record<string, "keep-current" | "copied" | "retry-verified">;
};
export type ApplyResult = { status: "complete" | "partial" | "not-applied" | "outcome-unknown"; record: RequestRecord; durable: boolean; journalProblem: string | null };
export type ProtectedRange = TextRange & { reason: "property" | "formal-title" | "managed" | "todo" | "ambiguous-formal-field" };
export type Protection = { ranges: readonly ProtectedRange[]; insertAllowed: boolean };
export interface SourceRead {
  snapshot: SourceSnapshot; protections: ReadonlyMap<string, Protection>;
  children: ReadonlyMap<string, readonly string[]>; paths: ReadonlyMap<string, readonly string[]>;
}
export interface SourceReader {
  read(scope: SourceScope, valid: () => boolean): Promise<SourceRead>;
  block(scope: SourceScope, uuid: string, valid: () => boolean): Promise<BlockSnapshot | null>;
}
export interface ScopeLease { scope: SourceScope; epoch: number; signal: AbortSignal; rootPath: readonly string[] | null }
export interface ScopeAuthority {
  capture(scope: SourceScope): ScopeLease | null;
  valid(lease: ScopeLease): boolean;
  allowsTodo(lease: ScopeLease, operation: Operation): boolean;
}
export interface EditingGuard { assertSafe(scope: SourceScope, affected: readonly string[], valid: () => boolean): Promise<void> }
export interface SourceWriter {
  update(scope: SourceScope, uuid: string, content: string, valid: () => boolean): Promise<void>;
  insert(scope: SourceScope, parent: string, lastChild: string | null, uuid: string, content: string, valid: () => boolean): Promise<void>;
  persistIdentity(scope: SourceScope, uuid: string, content: string, valid: () => boolean): Promise<void>;
}
export interface OperationJournal {
  load(scope: SourceScope, requestId: string): Promise<RequestRecord | null>;
  save(record: RequestRecord): Promise<void>;
  list(scope: SourceScope): Promise<RequestRecord[]>;
}
