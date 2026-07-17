import {
  addRelation,
  createManagedObject,
  resolveOperations,
  reviewOperation,
  setCondition,
  setPrimaryOwnership,
  transitionPhase,
  type Anchor,
  type Capture,
  type CreateManagedObjectInput,
  type DomainChangeRecord,
  type DomainEvent,
  type ManagedObject,
  type ObjectRelation,
  type OperationStatus,
  type Proposal,
  type SemanticCommit,
  type SemanticOperation,
  type ConditionEvidence,
  type ConditionKind,
  type Phase,
} from "@task-copilot/domain";
import { StructuredError, checksum, createId, type IdPrefix } from "@task-copilot/shared";

import type { AgentProvider, ContentPort, PreparedTextMutation, StateStore, SystemState } from "./ports.ts";
import { projectNowWork, projectReentry, type NowWorkView, type ProjectReentryView } from "./views.ts";

export interface TaskCopilotDependencies {
  store: StateStore;
  content: ContentPort;
  provider: AgentProvider;
  clock?: () => Date;
  idFactory?: (prefix: IdPrefix) => string;
}

type ReviewDecision = "ACCEPTED" | "REJECTED" | "EDITED";

function findOrThrow<T>(values: readonly T[], predicate: (value: T) => boolean, code: string, message: string): T {
  const found = values.find(predicate);
  if (!found) throw new StructuredError({ code, message, ruleRefs: ["MAP-ANC-001"] });
  return found;
}

function upsert<T>(values: T[], id: (value: T) => string, entityId: string, value: T | undefined): void {
  const index = values.findIndex((candidate) => id(candidate) === entityId);
  if (value === undefined) {
    if (index >= 0) values.splice(index, 1);
  } else if (index >= 0) {
    values[index] = structuredClone(value);
  } else {
    values.push(structuredClone(value));
  }
}

function errorShape(error: unknown): { code: string; message: string } {
  return {
    code: error instanceof StructuredError ? error.code : "SEMANTIC_COMMIT_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}

export class TaskCopilot {
  private readonly store: StateStore;
  private readonly content: ContentPort;
  private readonly provider: AgentProvider;
  private readonly clock: () => Date;
  private readonly makeId: (prefix: IdPrefix) => string;

  constructor(dependencies: TaskCopilotDependencies) {
    this.store = dependencies.store;
    this.content = dependencies.content;
    this.provider = dependencies.provider;
    this.clock = dependencies.clock ?? (() => new Date());
    this.makeId = dependencies.idFactory ?? ((prefix) => createId(prefix, this.clock()));
  }

  agentStatus(): { enabled: boolean; providerId: string; providerVersion: string } {
    return {
      enabled: this.provider.enabled,
      providerId: this.provider.providerId,
      providerVersion: this.provider.providerVersion,
    };
  }

  async initialize(): Promise<{ recovered: string[]; recoveryRequired: string[] }> {
    return this.recoverPendingCommits();
  }

  async captureCurrentBlock(): Promise<Capture> {
    const block = await this.content.getCurrentBlock();
    if (!block || block.text.trim().length === 0) {
      throw new StructuredError({
        code: "CURRENT_BLOCK_UNAVAILABLE",
        message: "请先在 Logseq 中选择一个包含正文的 Block。",
        ruleRefs: ["CAP-IN-001", "CAP-IN-002"],
      });
    }
    const state = await this.store.load();
    const duplicate = state.captures.find(
      (capture) => capture.phase !== "DISMISSED" && state.anchors.find((anchor) => anchor.anchorId === capture.sourceAnchorId)?.externalId === block.externalId,
    );
    if (duplicate) return duplicate;
    const now = this.clock().toISOString();
    const captureId = this.makeId("cap");
    const anchorId = this.makeId("anc");
    const capture: Capture = {
      captureId,
      phase: "NEW",
      originalText: block.text,
      sourceAnchorId: anchorId,
      ...(block.pageRef ? { sourcePage: block.pageRef } : {}),
      captureMethod: "CURRENT_BLOCK",
      capturedAt: now,
      updatedAt: now,
      resolvedObjectIds: [],
    };
    const anchor: Anchor = {
      anchorId,
      objectId: captureId,
      adapter: "logseq",
      graphId: block.graphId,
      externalId: block.externalId,
      role: "source",
      contentHash: checksum(block.text),
      lastSeenAt: now,
      status: "active",
      ...(block.pageRef ? { cachedPageRef: block.pageRef } : {}),
    };
    const next = structuredClone(state);
    next.captures.push(capture);
    next.anchors.push(anchor);
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: now,
      actor: "user",
      captureId,
      operationType: "capture_created",
      payload: { method: capture.captureMethod, sourceAnchorId: anchorId },
      ruleRefs: ["CAP-IN-001", "CAP-IN-002", "SEM-CAP-001"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return capture;
  }

  async formalizeCapture(captureId: string, input: Omit<CreateManagedObjectInput, "objectId" | "sourceOrCreationEvent">): Promise<ManagedObject> {
    const state = await this.store.load();
    const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    if (capture.phase === "RESOLVED" || capture.phase === "DISMISSED") {
      throw new StructuredError({ code: "CAPTURE_ALREADY_RESOLVED", message: "该 Capture 已处理。", ruleRefs: ["CAP-FRM-001"] });
    }
    const now = this.clock();
    const eventId = this.makeId("event");
    const object = createManagedObject(
      { ...input, objectId: this.makeId("obj"), sourceOrCreationEvent: eventId, primaryTextAnchorId: capture.sourceAnchorId },
      now,
    );
    const next = structuredClone(state);
    next.objects.push(object);
    const savedCapture = next.captures.find((candidate) => candidate.captureId === captureId)!;
    savedCapture.phase = "RESOLVED";
    savedCapture.updatedAt = now.toISOString();
    savedCapture.resolvedObjectIds = [object.objectId];
    const anchor = next.anchors.find((candidate) => candidate.anchorId === capture.sourceAnchorId)!;
    anchor.objectId = object.objectId;
    anchor.role = "primary_text";
    anchor.lastSeenAt = now.toISOString();
    next.events.push({
      eventId,
      timestamp: now.toISOString(),
      actor: "user",
      objectId: object.objectId,
      captureId,
      operationType: "capture_formalized",
      afterVersion: object.version,
      payload: { objectType: object.objectType, anchorId: anchor.anchorId },
      ruleRefs: ["PRI-003", "REL-SRC-001", "MAP-ANC-001"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return object;
  }

  async generateProposal(captureId: string): Promise<Proposal> {
    const state = await this.store.load();
    const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    const anchor = findOrThrow(state.anchors, (candidate) => candidate.anchorId === capture.sourceAnchorId, "ANCHOR_NOT_FOUND", "Capture 来源 Anchor 已失联。");
    const proposal = await this.provider.generateProposal({
      capture,
      anchor,
      state: structuredClone(state),
      now: this.clock(),
      createId: (prefix) => this.makeId(prefix),
    });
    const next = structuredClone(state);
    next.proposals.push(proposal);
    const savedCapture = next.captures.find((candidate) => candidate.captureId === captureId)!;
    savedCapture.phase = "PROPOSED";
    savedCapture.proposalId = proposal.proposalId;
    savedCapture.updatedAt = this.clock().toISOString();
    await this.store.save(next, state.revision);
    return proposal;
  }

  async reviewProposal(
    proposalId: string,
    decisions: Record<string, string | { status: ReviewDecision; payload?: Record<string, unknown> }>,
  ): Promise<Proposal> {
    const state = await this.store.load();
    const proposal = findOrThrow(state.proposals, (candidate) => candidate.proposalId === proposalId, "PROPOSAL_NOT_FOUND", "找不到 Proposal。");
    if (proposal.status !== "OPEN") throw new StructuredError({ code: "PROPOSAL_CLOSED", message: "Proposal 已关闭。", ruleRefs: ["COM-PROP-001"] });
    const next = structuredClone(state);
    const reviewed = next.proposals.find((candidate) => candidate.proposalId === proposalId)!;
    reviewed.operations = reviewed.operations.map((operation) => {
      const decision = decisions[operation.operationId];
      if (!decision) return operation;
      const status = typeof decision === "string" ? decision : decision.status;
      if (status !== "ACCEPTED" && status !== "REJECTED" && status !== "EDITED") {
        throw new StructuredError({ code: "INVALID_REVIEW_DECISION", message: `无效审查状态 ${status}。`, ruleRefs: ["REV-PART-001"] });
      }
      return reviewOperation(operation, status, typeof decision === "string" ? undefined : decision.payload);
    });
    await this.store.save(next, state.revision);
    return reviewed;
  }

  private anchorForOperation(state: SystemState, operation: SemanticOperation): Anchor {
    if (operation.target.kind === "ANCHOR") {
      return findOrThrow(state.anchors, (anchor) => anchor.anchorId === operation.target.id, "ANCHOR_NOT_FOUND", "操作 Anchor 已失联。");
    }
    if (operation.target.kind === "CAPTURE") {
      const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === operation.target.id, "CAPTURE_NOT_FOUND", "操作 Capture 不存在。");
      return findOrThrow(state.anchors, (anchor) => anchor.anchorId === capture.sourceAnchorId, "ANCHOR_NOT_FOUND", "Capture 来源 Anchor 已失联。");
    }
    return findOrThrow(
      state.anchors,
      (anchor) => anchor.objectId === operation.target.id && anchor.role === "primary_text" && anchor.status === "active",
      "ANCHOR_NOT_FOUND",
      "对象主正文 Anchor 已失联。",
    );
  }

  private recordChange(changes: DomainChangeRecord[], change: DomainChangeRecord): void {
    changes.push(structuredClone(change));
  }

  private applyDomainOperation(state: SystemState, operation: SemanticOperation, changes: DomainChangeRecord[]): void {
    const now = this.clock();
    switch (operation.operationType) {
      case "rewrite_content": {
        const anchor = this.anchorForOperation(state, operation);
        const before = structuredClone(anchor);
        const text = operation.payload.text;
        if (typeof text !== "string") throw new Error("rewrite_content requires text");
        anchor.contentHash = checksum(text);
        anchor.lastSeenAt = now.toISOString();
        this.recordChange(changes, { entityType: "ANCHOR", entityId: anchor.anchorId, before, after: anchor });
        break;
      }
      case "create_object": {
        const input = operation.payload.input;
        if (!input || typeof input !== "object") throw new Error("create_object requires input");
        const object = createManagedObject(input as CreateManagedObjectInput, now);
        state.objects.push(object);
        this.recordChange(changes, { entityType: "OBJECT", entityId: object.objectId, after: object });
        const captureId = operation.payload.captureId;
        if (typeof captureId === "string") {
          const capture = state.captures.find((candidate) => candidate.captureId === captureId);
          const anchor = capture ? state.anchors.find((candidate) => candidate.anchorId === capture.sourceAnchorId) : undefined;
          if (anchor) {
            const before = structuredClone(anchor);
            anchor.objectId = object.objectId;
            anchor.role = "primary_text";
            object.primaryTextAnchorId = anchor.anchorId;
            this.recordChange(changes, { entityType: "ANCHOR", entityId: anchor.anchorId, before, after: anchor });
          }
        }
        break;
      }
      case "update_object": {
        const object = findOrThrow(state.objects, (candidate) => candidate.objectId === operation.target.id, "OBJECT_NOT_FOUND", "找不到待更新对象。");
        const before = structuredClone(object);
        Object.assign(object, operation.payload, { version: object.version + 1, updatedAt: now.toISOString() });
        this.recordChange(changes, { entityType: "OBJECT", entityId: object.objectId, before, after: object });
        break;
      }
      case "set_primary_ownership": {
        const objectId = operation.payload.objectId;
        const ownerObjectId = operation.payload.ownerObjectId;
        if (typeof objectId !== "string" || typeof ownerObjectId !== "string") throw new Error("set_primary_ownership requires IDs");
        const before = state.relations.filter((relation) => relation.relationType === "primary_ownership" && relation.fromObjectId === objectId);
        state.relations = setPrimaryOwnership(state.relations, state.objects, objectId, ownerObjectId, now);
        const after = state.relations.filter((relation) => relation.relationType === "primary_ownership" && relation.fromObjectId === objectId);
        this.recordChange(changes, { entityType: "RELATION", entityId: `ownership:${objectId}`, before, after });
        break;
      }
      case "set_phase": {
        const object = findOrThrow(state.objects, (candidate) => candidate.objectId === operation.target.id, "OBJECT_NOT_FOUND", "找不到待流转对象。");
        const before = structuredClone(object);
        const nextPhase = operation.payload.phase;
        if (typeof nextPhase !== "string") throw new Error("set_phase requires phase");
        const after = transitionPhase(object, nextPhase as ManagedObject["phase"], now, operation.payload.context as Record<string, never> | undefined);
        upsert(state.objects, (candidate) => candidate.objectId, after.objectId, after);
        this.recordChange(changes, { entityType: "OBJECT", entityId: after.objectId, before, after });
        break;
      }
      case "set_condition": {
        const object = findOrThrow(state.objects, (candidate) => candidate.objectId === operation.target.id, "OBJECT_NOT_FOUND", "找不到待更新对象。");
        const before = structuredClone(object);
        const kind = operation.payload.kind;
        if (typeof kind !== "string") throw new Error("set_condition requires kind");
        const after = setCondition(object, kind as ManagedObject["condition"]["kind"], operation.payload, now);
        upsert(state.objects, (candidate) => candidate.objectId, after.objectId, after);
        this.recordChange(changes, { entityType: "OBJECT", entityId: after.objectId, before, after });
        break;
      }
      case "set_dates":
        this.applyDomainOperation(state, { ...operation, operationType: "update_object" }, changes);
        break;
      case "add_relation": {
        const from = operation.payload.fromObjectId;
        const to = operation.payload.toObjectId;
        const type = operation.payload.relationType;
        if (typeof from !== "string" || typeof to !== "string" || typeof type !== "string") throw new Error("add_relation requires relation data");
        const beforeIds = new Set(state.relations.map((relation) => relation.relationId));
        state.relations = addRelation(state.relations, state.objects, from, to, type as ObjectRelation["relationType"], now);
        for (const relation of state.relations.filter((candidate) => !beforeIds.has(candidate.relationId))) {
          this.recordChange(changes, { entityType: "RELATION", entityId: relation.relationId, after: relation });
        }
        break;
      }
      case "remove_relation": {
        const relation = findOrThrow(state.relations, (candidate) => candidate.relationId === operation.target.id, "RELATION_NOT_FOUND", "找不到关系。");
        const before = structuredClone(relation);
        relation.status = "ENDED";
        relation.endedAt = now.toISOString();
        this.recordChange(changes, { entityType: "RELATION", entityId: relation.relationId, before, after: relation });
        break;
      }
      case "link_anchor": {
        const anchor = operation.payload.anchor;
        if (!anchor || typeof anchor !== "object") throw new Error("link_anchor requires anchor");
        state.anchors.push(anchor as Anchor);
        this.recordChange(changes, { entityType: "ANCHOR", entityId: (anchor as Anchor).anchorId, after: anchor });
        break;
      }
      case "move_content":
        break;
      case "resolve_capture": {
        const captureId = operation.payload.captureId;
        if (typeof captureId !== "string") throw new Error("resolve_capture requires captureId");
        const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
        const before = structuredClone(capture);
        capture.phase = "RESOLVED";
        capture.updatedAt = now.toISOString();
        capture.resolvedObjectIds = Array.isArray(operation.payload.objectIds)
          ? operation.payload.objectIds.filter((id): id is string => typeof id === "string")
          : [];
        this.recordChange(changes, { entityType: "CAPTURE", entityId: captureId, before, after: capture });
        break;
      }
    }
  }

  private eventFor(operation: SemanticOperation, commitId: string, proposalId: string): DomainEvent {
    return {
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      ...(operation.target.kind === "OBJECT" ? { objectId: operation.target.id } : {}),
      ...(operation.target.kind === "CAPTURE" ? { captureId: operation.target.id } : {}),
      operationType: operation.operationType,
      semanticCommitId: commitId,
      payload: structuredClone(operation.payload),
      sourceProposalId: proposalId,
      ruleRefs: operation.ruleRefs,
      reversible: true,
    };
  }

  async commitProposal(proposalId: string): Promise<SemanticCommit> {
    const initial = await this.store.load();
    const proposal = findOrThrow(initial.proposals, (candidate) => candidate.proposalId === proposalId, "PROPOSAL_NOT_FOUND", "找不到 Proposal。");
    if (proposal.status !== "OPEN") throw new StructuredError({ code: "PROPOSAL_CLOSED", message: "Proposal 已提交或拒绝。", ruleRefs: ["COM-PROP-001"] });
    const resolution = resolveOperations(proposal.operations);
    if (resolution.executable.length === 0) {
      throw new StructuredError({ code: "NO_EXECUTABLE_OPERATIONS", message: "没有已接受且合法的操作可提交。", ruleRefs: ["REV-PART-001"] });
    }
    const textOperations = resolution.executable.filter(
      (operation) => operation.operationType === "rewrite_content" || operation.operationType === "move_content",
    );
    const prepared: PreparedTextMutation[] = [];
    for (const operation of textOperations) {
      prepared.push(await this.content.prepare(operation, this.anchorForOperation(initial, operation)));
    }
    const now = this.clock().toISOString();
    const commitId = this.makeId("commit");
    const pendingCommit: SemanticCommit = {
      semanticCommitId: commitId,
      proposalId,
      status: "PENDING",
      operationIds: resolution.executable.map((operation) => operation.operationId),
      createdAt: now,
      updatedAt: now,
      beforeStateChecksum: checksum(initial),
      textMutations: prepared.map((mutation) => ({
        anchorId: mutation.anchorId,
        externalId: mutation.externalId,
        beforeText: mutation.beforeText,
        afterText: mutation.afterText,
        beforeHash: mutation.beforeHash,
        afterHash: mutation.afterHash,
      })),
      domainChanges: [],
    };
    const pendingState = structuredClone(initial);
    pendingState.commits.push(pendingCommit);
    const persistedPending = await this.store.save(pendingState, initial.revision);
    const executed: PreparedTextMutation[] = [];
    try {
      for (const mutation of prepared) {
        await this.content.apply(mutation);
        executed.push(mutation);
        if (!(await this.content.verify(mutation, "after"))) throw new Error(`正文操作 ${mutation.operationId} 验证失败`);
      }
      const next = structuredClone(persistedPending);
      const changes: DomainChangeRecord[] = [];
      for (const operation of resolution.executable) {
        this.applyDomainOperation(next, operation, changes);
        next.events.push(this.eventFor(operation, commitId, proposalId));
      }
      const savedProposal = next.proposals.find((candidate) => candidate.proposalId === proposalId)!;
      const proposalBefore = structuredClone(savedProposal);
      savedProposal.status = "COMMITTED";
      savedProposal.operations = savedProposal.operations.map((operation) =>
        resolution.executable.some((candidate) => candidate.operationId === operation.operationId)
          ? { ...operation, status: "COMMITTED" as OperationStatus }
          : resolution.blocked.find((candidate) => candidate.operationId === operation.operationId) ?? operation,
      );
      this.recordChange(changes, { entityType: "PROPOSAL", entityId: proposalId, before: proposalBefore, after: savedProposal });
      const commit = next.commits.find((candidate) => candidate.semanticCommitId === commitId)!;
      commit.status = "COMPLETED";
      commit.updatedAt = this.clock().toISOString();
      commit.domainChanges = changes;
      commit.afterStateChecksum = checksum({ ...next, commits: next.commits.filter((candidate) => candidate.semanticCommitId !== commitId) });
      const completed = await this.store.save(next, persistedPending.revision);
      return completed.commits.find((candidate) => candidate.semanticCommitId === commitId)!;
    } catch (error) {
      let compensationCompleted = true;
      let compensationMessage: string | undefined;
      for (const mutation of [...executed].reverse()) {
        try {
          await this.content.compensate(mutation);
          if (!(await this.content.verify(mutation, "before"))) throw new Error("补偿后校验失败", { cause: error });
        } catch (compensationError) {
          compensationCompleted = false;
          compensationMessage = compensationError instanceof Error ? compensationError.message : String(compensationError);
          break;
        }
      }
      const current = await this.store.load();
      const commit = current.commits.find((candidate) => candidate.semanticCommitId === commitId) ?? pendingCommit;
      commit.status = compensationCompleted ? "FAILED" : "RECOVERY_REQUIRED";
      commit.updatedAt = this.clock().toISOString();
      commit.error = errorShape(error);
      commit.compensation = {
        attempted: executed.length > 0,
        completed: compensationCompleted,
        ...(compensationMessage ? { message: compensationMessage } : {}),
      };
      if (!current.commits.some((candidate) => candidate.semanticCommitId === commitId)) current.commits.push(commit);
      const recorded = await this.store.save(current, current.revision);
      return recorded.commits.find((candidate) => candidate.semanticCommitId === commitId)!;
    }
  }

  private restoreChange(state: SystemState, change: DomainChangeRecord, value: unknown): void {
    switch (change.entityType) {
      case "OBJECT":
        upsert(state.objects, (entity) => entity.objectId, change.entityId, value as ManagedObject | undefined);
        break;
      case "CAPTURE":
        upsert(state.captures, (entity) => entity.captureId, change.entityId, value as Capture | undefined);
        break;
      case "ANCHOR":
        upsert(state.anchors, (entity) => entity.anchorId, change.entityId, value as Anchor | undefined);
        break;
      case "PROPOSAL":
        upsert(state.proposals, (entity) => entity.proposalId, change.entityId, value as Proposal | undefined);
        break;
      case "RELATION":
        if (change.entityId.startsWith("ownership:")) {
          const objectId = change.entityId.slice("ownership:".length);
          state.relations = state.relations.filter(
            (relation) => !(relation.relationType === "primary_ownership" && relation.fromObjectId === objectId),
          );
          if (Array.isArray(value)) state.relations.push(...(value as ObjectRelation[]));
        } else {
          upsert(state.relations, (entity) => entity.relationId, change.entityId, value as ObjectRelation | undefined);
        }
        break;
    }
  }

  async undoCommit(semanticCommitId: string): Promise<SemanticCommit> {
    const state = await this.store.load();
    const original = findOrThrow(state.commits, (candidate) => candidate.semanticCommitId === semanticCommitId, "COMMIT_NOT_FOUND", "找不到 SemanticCommit。");
    if (original.status !== "COMPLETED") throw new StructuredError({ code: "COMMIT_NOT_UNDOABLE", message: "只有已完成且未撤销的 Commit 可以撤销。", ruleRefs: ["AUD-RBK-001"] });
    const prepared: PreparedTextMutation[] = original.textMutations.map((mutation) => ({ ...mutation, operationId: `undo:${semanticCommitId}` }));
    for (const mutation of prepared) {
      if (!(await this.content.verify(mutation, "after"))) {
        throw new StructuredError({
          code: "UNDO_TEXT_CONFLICT",
          message: "正文在提交后已被再次编辑，撤销已停止；请手工合并。",
          ruleRefs: ["SYN-CON-001", "AUD-RBK-001"],
        });
      }
    }
    const compensated: PreparedTextMutation[] = [];
    try {
      for (const mutation of [...prepared].reverse()) {
        await this.content.compensate(mutation);
        compensated.push(mutation);
      }
      const next = structuredClone(state);
      for (const change of [...original.domainChanges].reverse()) this.restoreChange(next, change, change.before);
      const savedOriginal = next.commits.find((candidate) => candidate.semanticCommitId === semanticCommitId)!;
      const undoId = this.makeId("commit");
      savedOriginal.status = "UNDONE";
      savedOriginal.undoCommitId = undoId;
      savedOriginal.updatedAt = this.clock().toISOString();
      const undo: SemanticCommit = {
        semanticCommitId: undoId,
        proposalId: original.proposalId,
        status: "COMPLETED",
        operationIds: [],
        createdAt: this.clock().toISOString(),
        updatedAt: this.clock().toISOString(),
        beforeStateChecksum: checksum(state),
        afterStateChecksum: checksum(next),
        textMutations: original.textMutations.map((mutation) => ({
          ...mutation,
          beforeText: mutation.afterText,
          afterText: mutation.beforeText,
          beforeHash: mutation.afterHash,
          afterHash: mutation.beforeHash,
        })),
        domainChanges: original.domainChanges.map((change) => ({ ...change, before: change.after, after: change.before })),
      };
      next.commits.push(undo);
      next.events.push({
        eventId: this.makeId("event"),
        timestamp: this.clock().toISOString(),
        actor: "user",
        operationType: "semantic_commit_undone",
        semanticCommitId: undoId,
        payload: { originalCommitId: semanticCommitId },
        ruleRefs: ["AUD-RBK-001"],
        reversible: false,
      });
      const saved = await this.store.save(next, state.revision);
      return saved.commits.find((candidate) => candidate.semanticCommitId === undoId)!;
    } catch (error) {
      for (const mutation of compensated.reverse()) await this.content.apply(mutation);
      throw error;
    }
  }

  async recoverPendingCommits(): Promise<{ recovered: string[]; recoveryRequired: string[] }> {
    const state = await this.store.load();
    const candidates = state.commits.filter((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED");
    const recovered: string[] = [];
    const recoveryRequired: string[] = [];
    for (const commit of candidates) {
      let safe = true;
      for (const mutation of commit.textMutations) {
        const prepared: PreparedTextMutation = { ...mutation, operationId: `recovery:${commit.semanticCommitId}` };
        if (await this.content.verify(prepared, "before")) continue;
        if (await this.content.verify(prepared, "after")) {
          try {
            await this.content.compensate(prepared);
            if (!(await this.content.verify(prepared, "before"))) throw new Error("恢复补偿校验失败");
          } catch {
            safe = false;
            break;
          }
        } else {
          safe = false;
          break;
        }
      }
      commit.status = safe ? "FAILED" : "RECOVERY_REQUIRED";
      commit.updatedAt = this.clock().toISOString();
      commit.compensation = { attempted: commit.textMutations.length > 0, completed: safe };
      if (safe) recovered.push(commit.semanticCommitId);
      else recoveryRequired.push(commit.semanticCommitId);
    }
    if (candidates.length > 0) await this.store.save(state, state.revision);
    return { recovered, recoveryRequired };
  }

  async listInbox(): Promise<Capture[]> {
    const state = await this.store.load();
    return state.captures.filter((capture) => capture.phase === "NEW" || capture.phase === "PROPOSED");
  }

  async listObjects(): Promise<ManagedObject[]> {
    return (await this.store.load()).objects;
  }

  async listProposals(): Promise<Proposal[]> {
    return (await this.store.load()).proposals;
  }

  async listCommits(): Promise<SemanticCommit[]> {
    return (await this.store.load()).commits;
  }

  async exportState(): Promise<SystemState> {
    return this.store.load();
  }

  async updateObject(objectId: string, patch: Partial<Pick<ManagedObject, "text" | "completionCriteria" | "nextAction" | "purpose" | "targetOutcome" | "scopeIn" | "scopeOut" | "currentSummary" | "dueAt" | "reviewAt">>): Promise<ManagedObject> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const next = structuredClone(state);
    const saved = next.objects.find((candidate) => candidate.objectId === objectId)!;
    Object.assign(saved, patch, { version: object.version + 1, updatedAt: this.clock().toISOString(), lastMeaningfulEventAt: this.clock().toISOString() });
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      objectId,
      operationType: "object_updated",
      beforeVersion: object.version,
      afterVersion: saved.version,
      payload: structuredClone(patch),
      ruleRefs: ["ARC-CQRS-001", "PRI-002"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return saved;
  }

  async changeObjectPhase(objectId: string, phase: Phase, context: Parameters<typeof transitionPhase>[3] = {}): Promise<ManagedObject> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const updated = transitionPhase(object, phase, this.clock(), context);
    const next = structuredClone(state);
    upsert(next.objects, (candidate) => candidate.objectId, objectId, updated);
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      objectId,
      operationType: "phase_changed",
      beforeVersion: object.version,
      afterVersion: updated.version,
      payload: { from: object.phase, to: phase },
      ruleRefs: ["LIF-BASE-001"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return updated;
  }

  async changeObjectCondition(objectId: string, kind: ConditionKind, evidence: ConditionEvidence): Promise<ManagedObject> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const updated = setCondition(object, kind, evidence, this.clock());
    const next = structuredClone(state);
    upsert(next.objects, (candidate) => candidate.objectId, objectId, updated);
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      objectId,
      operationType: "condition_changed",
      beforeVersion: object.version,
      afterVersion: updated.version,
      payload: { from: object.condition.kind, to: kind, evidence },
      ruleRefs: ["LIF-COND-001", "LIF-COND-002", "LIF-COND-003"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return updated;
  }

  async dismissCapture(captureId: string, reason = "无需行动"): Promise<Capture> {
    const state = await this.store.load();
    findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    const next = structuredClone(state);
    const saved = next.captures.find((candidate) => candidate.captureId === captureId)!;
    saved.phase = "DISMISSED";
    saved.resolutionNote = reason;
    saved.updatedAt = this.clock().toISOString();
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      captureId,
      operationType: "capture_dismissed",
      payload: { reason },
      ruleRefs: ["SEM-CAP-001"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return saved;
  }

  async rebindPrimaryAnchor(objectId: string): Promise<Anchor> {
    const block = await this.content.getCurrentBlock();
    if (!block) throw new StructuredError({ code: "CURRENT_BLOCK_UNAVAILABLE", message: "请先选择用于重新绑定的 Block。", ruleRefs: ["MAP-ANC-001"] });
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const next = structuredClone(state);
    const existing = next.anchors.find((anchor) => anchor.objectId === objectId && anchor.role === "primary_text" && anchor.status === "active");
    if (existing) existing.status = "replaced";
    const anchor: Anchor = {
      anchorId: this.makeId("anc"),
      objectId,
      adapter: "logseq",
      graphId: block.graphId,
      externalId: block.externalId,
      role: "primary_text",
      contentHash: checksum(block.text),
      lastSeenAt: this.clock().toISOString(),
      status: "active",
      ...(block.pageRef ? { cachedPageRef: block.pageRef } : {}),
    };
    next.anchors.push(anchor);
    const saved = next.objects.find((candidate) => candidate.objectId === objectId)!;
    saved.primaryTextAnchorId = anchor.anchorId;
    delete saved.conflict;
    saved.version = object.version + 1;
    saved.updatedAt = this.clock().toISOString();
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      objectId,
      operationType: "anchor_rebound",
      payload: { anchorId: anchor.anchorId, externalId: anchor.externalId },
      ruleRefs: ["MAP-ANC-001", "SYN-CON-002"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return anchor;
  }

  async queryNowWork(): Promise<NowWorkView> {
    return projectNowWork(await this.store.load(), this.clock());
  }

  async getProjectReentry(objectId: string): Promise<ProjectReentryView> {
    return projectReentry(await this.store.load(), objectId);
  }

  async getObject(objectId: string): Promise<ManagedObject> {
    const state = await this.store.load();
    return findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
  }

  async getAuditTrail(objectId?: string): Promise<DomainEvent[]> {
    const state = await this.store.load();
    return state.events.filter((event) => !objectId || event.objectId === objectId).sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }
}
