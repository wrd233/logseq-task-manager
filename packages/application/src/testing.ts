import { checksum } from "@task-copilot/shared";

import type {
  ContentPort,
  CurrentBlock,
  AnchorObservation,
  PreparedTextMutation,
  StateStore,
  SystemState,
  SourceResolution,
} from "./ports.ts";
import { createEmptyState } from "./ports.ts";
import type { Anchor, SemanticOperation } from "@task-copilot/domain";

export class MemoryStateStore implements StateStore {
  private state: SystemState = createEmptyState();
  private readonly failureNumbers = new Set<number>();
  saveCount = 0;

  async load(): Promise<SystemState> {
    return structuredClone(this.state);
  }

  async save(state: SystemState, expectedRevision?: number): Promise<SystemState> {
    this.saveCount += 1;
    if (this.failureNumbers.delete(this.saveCount)) throw new Error(`Injected store failure at save ${this.saveCount}`);
    if (expectedRevision !== undefined && this.state.revision !== expectedRevision) {
      throw new Error(`Version conflict: expected ${expectedRevision}, found ${this.state.revision}`);
    }
    this.state = structuredClone({ ...state, schemaVersion: 1, revision: this.state.revision + 1 });
    return this.load();
  }

  failOnSaveNumber(number: number): void {
    this.failureNumbers.add(number);
  }
}

export class MemoryContentPort implements ContentPort {
  resolveSource?: (externalId: string, cachedPageRef?: string) => Promise<SourceResolution>;
  private readonly blocks = new Map<string, CurrentBlock>();
  private currentExternalId: string;
  private failApply = false;
  private failCompensate = false;
  readonly compensationExternalIds: string[] = [];

  constructor(block: CurrentBlock) {
    this.blocks.set(block.externalId, structuredClone(block));
    this.currentExternalId = block.externalId;
  }

  block(externalId: string): CurrentBlock | undefined {
    const block = this.blocks.get(externalId);
    return block ? structuredClone(block) : undefined;
  }

  setCurrentBlock(block: CurrentBlock): void {
    this.blocks.set(block.externalId, structuredClone(block));
    this.currentExternalId = block.externalId;
  }

  async getCurrentBlock(): Promise<CurrentBlock | undefined> {
    return this.block(this.currentExternalId);
  }

  async prepare(operation: SemanticOperation, anchor: Anchor): Promise<PreparedTextMutation> {
    const block = this.blocks.get(anchor.externalId);
    if (!block) throw new Error(`Missing block ${anchor.externalId}`);
    if (checksum(block.text) !== anchor.contentHash) throw new Error("Anchor content hash conflict");
    if (operation.operationType === "rewrite_content") {
      const afterText = operation.payload.text;
      if (typeof afterText !== "string") throw new Error("rewrite_content requires text");
      return {
        operationId: operation.operationId,
        anchorId: anchor.anchorId,
        graphId: anchor.graphId,
        externalId: anchor.externalId,
        beforeText: block.text,
        afterText,
        beforeHash: checksum(block.text),
        afterHash: checksum(afterText),
      };
    }
    if (operation.operationType === "move_content") {
      const pageRef = operation.payload.pageRef;
      if (typeof pageRef !== "string") throw new Error("move_content requires pageRef");
      return {
        operationId: operation.operationId,
        anchorId: anchor.anchorId,
        graphId: anchor.graphId,
        externalId: anchor.externalId,
        beforeText: block.text,
        afterText: block.text,
        beforeHash: checksum(block.text),
        afterHash: checksum(block.text),
        opaqueBefore: { pageRef: block.pageRef ?? "", afterPageRef: pageRef },
      };
    }
    throw new Error(`Unsupported text operation ${operation.operationType}`);
  }

  async apply(mutation: PreparedTextMutation): Promise<void> {
    if (this.failApply) {
      this.failApply = false;
      throw new Error("Injected content apply failure");
    }
    const block = this.blocks.get(mutation.externalId);
    if (!block) throw new Error(`Missing block ${mutation.externalId}`);
    if (block.graphId !== mutation.graphId) throw new Error("Graph identity conflict");
    block.text = mutation.afterText;
    const afterPageRef = mutation.opaqueBefore?.afterPageRef;
    if (typeof afterPageRef === "string") block.pageRef = afterPageRef;
  }

  async verify(mutation: PreparedTextMutation, expected: "before" | "after"): Promise<boolean> {
    const block = this.blocks.get(mutation.externalId);
    if (!block) return false;
    if (block.graphId !== mutation.graphId) return false;
    const expectedHash = expected === "before" ? mutation.beforeHash : mutation.afterHash;
    if (checksum(block.text) !== expectedHash) return false;
    const pageRef = expected === "before" ? mutation.opaqueBefore?.pageRef : mutation.opaqueBefore?.afterPageRef;
    return typeof pageRef !== "string" || block.pageRef === pageRef;
  }

  async compensate(mutation: PreparedTextMutation): Promise<void> {
    if (this.failCompensate) {
      this.failCompensate = false;
      throw new Error("Injected compensation failure");
    }
    const block = this.blocks.get(mutation.externalId);
    if (!block) throw new Error(`Missing block ${mutation.externalId}`);
    if (block.graphId !== mutation.graphId) throw new Error("Graph identity conflict");
    this.compensationExternalIds.push(mutation.externalId);
    block.text = mutation.beforeText;
    const pageRef = mutation.opaqueBefore?.pageRef;
    if (typeof pageRef === "string") block.pageRef = pageRef;
  }

  async open(externalId: string, graphId: string): Promise<void> {
    const block = this.blocks.get(externalId);
    if (!block) throw new Error(`Missing block ${externalId}`);
    if (block.graphId !== graphId) throw new Error("Graph identity conflict");
    this.currentExternalId = externalId;
  }

  async observe(anchor: Anchor): Promise<AnchorObservation> {
    const block = this.blocks.get(anchor.externalId);
    if (!block) return { status: "missing" };
    if (block.graphId !== anchor.graphId) return { status: "unavailable" };
    const currentHash = checksum(block.text);
    return currentHash === anchor.contentHash
      ? { status: "active", currentText: block.text, currentHash }
      : { status: "conflict", currentText: block.text, currentHash };
  }

  deleteBlock(externalId: string): void {
    this.blocks.delete(externalId);
  }

  failNextApply(): void {
    this.failApply = true;
  }

  failNextCompensation(): void {
    this.failCompensate = true;
  }
}
