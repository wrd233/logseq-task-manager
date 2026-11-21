import type { SourceScope } from "../../workspace/source-protocol.ts";

export type NoteTidyAnchorCategory = "link" | "metric" | "blocker" | "decision" | "todo" | "term";

export interface NoteTidySourceBlock {
  sourceId: string;
  blockUuid: string;
  parentUuid: string | null;
  depth: number;
  content: string;
  contentVersion: string;
  protected?: boolean;
  protectedReason?: string;
}

export interface NoteTidyInput {
  scope: SourceScope;
  structureVersion: string;
  sourceSetVersion: string;
  instruction?: string;
  targetRootUuid?: string;
  hasExistingStructure?: boolean;
  blocks: NoteTidySourceBlock[];
}

export interface NoteTidyAnchor {
  id: string;
  label: string;
  category: NoteTidyAnchorCategory;
  colorSlot: 0 | 1 | 2 | 3 | 4;
  before: { sourceId: string; exactText: string };
  after: { targetId: string; exactText: string } | null;
}

export interface NoteTidyStructuralChange {
  kind: "group" | "reorder" | "merge" | "insert";
  description: string;
  sourceIds: string[];
}

export type NoteTidyOperation =
  | {
      operationId: string;
      type: "replace-text";
      sourceId: string;
      blockUuid: string;
      expectedContentVersion: string;
      beforeText: string;
      afterText: string;
      range?: { start: number; end: number };
    }
  | {
      operationId: string;
      type: "insert-child";
      parentSourceId: string;
      parentBlockUuid: string;
      expectedParentContentVersion: string;
      afterText: string;
    };

export interface NoteTidyPreviewBlock {
  id: string;
  sourceId: string | null;
  blockUuid: string | null;
  parentId: string | null;
  depth: number;
  content: string;
  protected: boolean;
  changed: boolean;
}

export interface NoteTidyPlan {
  schemaVersion: 1;
  summary: string;
  sourceSetVersion: string;
  structureVersion: string;
  hasExistingStructure: boolean;
  structuralChanges: NoteTidyStructuralChange[];
  operations: NoteTidyOperation[];
  beforeBlocks: NoteTidyPreviewBlock[];
  afterBlocks: NoteTidyPreviewBlock[];
  anchors: NoteTidyAnchor[];
  omittedAnchorIds: string[];
  protectedBlockCount: number;
  meta: {
    origin: "local-model" | "external-mcp";
    providerId?: string;
    model?: string | null;
    proposalId?: string;
  };
}

export interface StagedWritebackProposalView {
  proposalId: string;
  workKey: string;
  scope: SourceScope;
  sourceSetVersion: string;
  structureVersion: string;
  clientId: string;
  createdAt: string;
  summary: string;
  writesSource: false;
  status: "pending-review";
  operations: Array<{
    operationId: string;
    type: "replace-text" | "insert-text" | "insert-child";
    sourceId: string;
    blockUuid: string;
    expectedContentVersion: string;
    beforeText: string;
    proposedText: string;
    range?: { start: number; end: number };
  }>;
  plan?: NoteTidyPlan;
}
