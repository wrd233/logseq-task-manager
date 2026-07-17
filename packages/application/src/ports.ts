import type {
  Anchor,
  Capture,
  DomainEvent,
  ManagedObject,
  ObjectRelation,
  Proposal,
  SemanticCommit,
  SemanticOperation,
  TextMutationRecord,
} from "@task-copilot/domain";

export interface SystemState {
  schemaVersion: number;
  revision: number;
  objects: ManagedObject[];
  captures: Capture[];
  relations: ObjectRelation[];
  anchors: Anchor[];
  proposals: Proposal[];
  commits: SemanticCommit[];
  events: DomainEvent[];
  views: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  extensions: Record<string, unknown>;
}

export function createEmptyState(): SystemState {
  return {
    schemaVersion: 1,
    revision: 0,
    objects: [],
    captures: [],
    relations: [],
    anchors: [],
    proposals: [],
    commits: [],
    events: [],
    views: [],
    artifacts: [],
    extensions: {},
  };
}

export interface StateStore {
  load(): Promise<SystemState>;
  save(state: SystemState, expectedRevision?: number): Promise<SystemState>;
}

export interface CurrentBlock {
  externalId: string;
  graphId: string;
  text: string;
  pageRef?: string;
}

export interface PreparedTextMutation extends TextMutationRecord {
  operationId: string;
  opaqueBefore?: Record<string, unknown>;
}

export interface ContentPort {
  getCurrentBlock(): Promise<CurrentBlock | undefined>;
  prepare(operation: SemanticOperation, anchor: Anchor): Promise<PreparedTextMutation>;
  apply(mutation: PreparedTextMutation): Promise<void>;
  verify(mutation: PreparedTextMutation, expected: "before" | "after"): Promise<boolean>;
  compensate(mutation: PreparedTextMutation): Promise<void>;
  open(externalId: string): Promise<void>;
}

export interface ProposalContext {
  capture: Capture;
  anchor: Anchor;
  state: SystemState;
  now: Date;
  createId(prefix: "obj" | "prop" | "op"): string;
}

export interface AgentProvider {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly enabled: boolean;
  generateProposal(context: ProposalContext): Promise<Proposal>;
}
