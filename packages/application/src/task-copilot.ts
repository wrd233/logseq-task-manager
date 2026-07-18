import {
  addRelation,
  allowedPhaseTransitions,
  calculateSignals,
  createManagedObject,
  deferOperation,
  effectiveOperationRisk,
  resolveOperations,
  reviewOperation,
  setCondition,
  setPrimaryOwnership,
  transitionPhase,
  type Anchor,
  type AttentionSignal,
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
type EditableObjectPatch = Partial<Pick<ManagedObject, "text" | "completionCriteria" | "nextAction" | "purpose" | "targetOutcome" | "scopeIn" | "scopeOut" | "currentSummary" | "dueAt" | "reviewAt">>;

const editableObjectFields = new Set<keyof EditableObjectPatch>([
  "text",
  "completionCriteria",
  "nextAction",
  "purpose",
  "targetOutcome",
  "scopeIn",
  "scopeOut",
  "currentSummary",
  "dueAt",
  "reviewAt",
]);

function sanitizeObjectPatch(payload: Record<string, unknown>, allowed = editableObjectFields): EditableObjectPatch {
  const forbidden = Object.keys(payload).find((key) => !allowed.has(key as keyof EditableObjectPatch));
  if (forbidden) {
    throw new StructuredError({
      code: "OBJECT_PATCH_FIELD_FORBIDDEN",
      message: `对象字段 ${forbidden} 不能通过通用更新绕过领域命令。`,
      ruleRefs: ["PRI-012", "LIF-BASE-001"],
    });
  }
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && typeof value !== "string") {
      throw new StructuredError({ code: "OBJECT_PATCH_VALUE_INVALID", message: `对象字段 ${key} 必须是字符串。`, ruleRefs: ["SEM-COMMON-003"] });
    }
    if ((key === "dueAt" || key === "reviewAt") && typeof value === "string" && value && !Number.isFinite(Date.parse(value))) {
      throw new StructuredError({ code: "OBJECT_DATE_INVALID", message: `对象字段 ${key} 必须是合法日期。`, ruleRefs: ["LIF-COND-001"] });
    }
  }
  return structuredClone(payload) as EditableObjectPatch;
}

export interface ProposalImpactView {
  executable: number;
  blocked: number;
  pending: number;
  rejected: number;
  effects: string[];
  affectedObjects: string[];
  affectedViews: string[];
  affectedFiles: string[];
  downstream: string[];
  validationErrors: string[];
  commitReady: boolean;
}

export interface ObjectDetailView {
  object: ManagedObject;
  owner?: { objectId: string; text: string };
  anchors: Anchor[];
  signals: AttentionSignal[];
  recentEvents: DomainEvent[];
  undoableCommitId?: string;
}

export interface AuditProjection {
  anchorConflicts: Array<{
    anchorId: string;
    status: "missing" | "conflict";
    graphId: string;
    externalId: string;
    source: string;
    observedAt: string;
    expectedText: string;
    currentText?: string;
    options: string[];
  }>;
  undoableCommitIds: string[];
}

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
    const recovery = await this.recoverPendingCommits();
    await this.repairCaptureSources();
    await this.scanAnchors();
    return recovery;
  }

  async repairCaptureSources(): Promise<{ repaired: number; conflicts: number }> {
    if (!this.content.resolveSource) return { repaired: 0, conflicts: 0 };
    const state = await this.store.load();
    const next = structuredClone(state);
    let repaired = 0;
    let conflicts = 0;
    for (const capture of next.captures) {
      const anchor = next.anchors.find((candidate) => candidate.anchorId === capture.sourceAnchorId);
      if (!anchor) continue;
      const needsRepair = !capture.sourcePage || /^\d+$/.test(capture.sourcePage) || /^\d+$/.test(anchor.cachedPageRef ?? "");
      if (!needsRepair) continue;
      let result;
      try {
        result = await this.content.resolveSource(anchor.externalId, anchor.cachedPageRef ?? capture.sourcePage);
      } catch (error) {
        capture.sourcePage = "无法解析的 Logseq 页面";
        capture.sourceConflict = { code: "SOURCE_RESOLUTION_FAILED", message: "来源解析失败，Capture 本身仍然保留；请查看 Diagnostics 后重试。" };
        next.events.push({
          eventId: this.makeId("event"), timestamp: this.clock().toISOString(), actor: "system", captureId: capture.captureId,
          operationType: "source_reference_repair_failed", payload: { pageId: anchor.cachedPageRef, errorName: error instanceof Error ? error.name : "UnknownError" },
          ruleRefs: ["MAP-ANC-001", "SYN-CON-001"], reversible: false,
        });
        conflicts += 1;
        continue;
      }
      if (result.status === "resolved") {
        const previous = { sourcePage: capture.sourcePage, cachedPageRef: anchor.cachedPageRef };
        capture.sourcePage = result.displayName;
        if (result.pageIdentity) capture.sourcePageIdentity = result.pageIdentity;
        delete capture.sourceConflict;
        anchor.cachedPageRef = result.displayName;
        anchor.lastSeenAt = this.clock().toISOString();
        next.events.push({
          eventId: this.makeId("event"), timestamp: this.clock().toISOString(), actor: "system", captureId: capture.captureId,
          operationType: "source_reference_repaired", payload: { previous, displayName: result.displayName, pageId: result.pageIdentity?.pageId },
          ruleRefs: ["MAP-ANC-001", "SYN-CON-001"], reversible: true,
        });
        repaired += 1;
      } else {
        capture.sourcePage = "无法解析的 Logseq 页面";
        capture.sourceConflict = { code: result.status === "missing" ? "SOURCE_BLOCK_MISSING" : "SOURCE_PAGE_UNRESOLVED", message: "来源块已失联或页面无法解析，Capture 本身仍然保留。" };
        conflicts += 1;
      }
    }
    if (repaired || conflicts) await this.store.save(next, state.revision);
    return { repaired, conflicts };
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
      (capture) => capture.phase !== "DISMISSED" && state.anchors.some(
        (anchor) => anchor.anchorId === capture.sourceAnchorId && anchor.externalId === block.externalId && anchor.graphId === block.graphId,
      ),
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
      ...(block.pageIdentity ? { sourcePageIdentity: block.pageIdentity } : {}),
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

  async generateProposal(captureId: string): Promise<Proposal> {
    const state = await this.store.load();
    const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    const anchor = findOrThrow(state.anchors, (candidate) => candidate.anchorId === capture.sourceAnchorId, "ANCHOR_NOT_FOUND", "Capture 来源 Anchor 已失联。");
    const issuedObjectIds = new Set<string>();
    const generated = await this.provider.generateProposal({
      capture,
      anchor,
      state: structuredClone(state),
      now: this.clock(),
      createId: (prefix) => {
        const id = this.makeId(prefix);
        if (prefix === "obj") issuedObjectIds.add(id);
        return id;
      },
    });
    for (const operation of generated.operations.filter((candidate) => candidate.operationType === "create_object")) {
      const input = operation.payload.input;
      const objectId = input && typeof input === "object" ? (input as Record<string, unknown>).objectId : undefined;
      if (typeof objectId !== "string" || !issuedObjectIds.has(objectId)) {
        throw new StructuredError({
          code: "PROVIDER_OBJECT_ID_UNTRUSTED",
          message: "Provider 创建对象时必须使用 Application 发放的稳定 ID。",
          ruleRefs: ["PRI-012", "AGT-AUTH-001"],
        });
      }
    }
    const proposal: Proposal = {
      ...generated,
      operations: generated.operations.map((operation) => this.freezeOperationPreconditions(state, {
        ...operation,
        riskLevel: effectiveOperationRisk(operation),
      })),
    };
    const next = structuredClone(state);
    next.proposals.push(proposal);
    const savedCapture = next.captures.find((candidate) => candidate.captureId === captureId)!;
    savedCapture.phase = "PROPOSED";
    savedCapture.proposalId = proposal.proposalId;
    savedCapture.updatedAt = this.clock().toISOString();
    await this.store.save(next, state.revision);
    return proposal;
  }

  async createManualProposal(captureId: string, suggestedText: string): Promise<Proposal> {
    if (!suggestedText.trim()) {
      throw new StructuredError({ code: "MANUAL_PROPOSAL_TEXT_REQUIRED", message: "手工 Proposal 需要建议正文。", ruleRefs: ["TST-MVP-010", "REV-PART-001"] });
    }
    const state = await this.store.load();
    const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    const anchor = findOrThrow(state.anchors, (candidate) => candidate.anchorId === capture.sourceAnchorId, "ANCHOR_NOT_FOUND", "Capture 来源 Anchor 已失联。");
    const rewriteId = this.makeId("op");
    const resolveId = this.makeId("op");
    const now = this.clock().toISOString();
    const proposal: Proposal = {
      proposalId: this.makeId("prop"),
      sourceAnchorIds: [anchor.anchorId],
      sourceObjectIds: [],
      summary: "用户创建的手工正文 Proposal。",
      facts: [capture.originalText],
      assumptions: [],
      uncertainties: [],
      operations: [
        {
          operationId: rewriteId,
          operationType: "rewrite_content",
          target: { kind: "CAPTURE", id: captureId },
          payload: { text: suggestedText.trim() },
          preconditions: [{ kind: "anchor_content_hash", expected: anchor.contentHash }],
          dependencies: [],
          riskLevel: "MEDIUM",
          ruleRefs: ["MAP-RWT-001", "REV-PART-002", "TST-MVP-010"],
          rationale: "由用户输入建议正文，仍通过 Proposal Review 和 SemanticCommit。",
          confidence: 1,
          status: "PROPOSED",
        },
        {
          operationId: resolveId,
          operationType: "resolve_capture",
          target: { kind: "CAPTURE", id: captureId },
          payload: { captureId, objectIds: [] },
          preconditions: [],
          dependencies: [rewriteId],
          riskLevel: "MEDIUM",
          ruleRefs: ["CAP-FRM-001", "TST-MVP-010"],
          rationale: "只有用户接受正文并提交后，Capture 才作为普通正式笔记解决。",
          confidence: 1,
          status: "PROPOSED",
        },
      ],
      generatedAt: now,
      providerId: "manual-user",
      providerVersion: "1",
      ruleVersion: "visual-spec-v1.0",
      status: "OPEN",
    };
    const next = structuredClone(state);
    next.proposals.push(proposal);
    const savedCapture = next.captures.find((candidate) => candidate.captureId === captureId)!;
    savedCapture.phase = "PROPOSED";
    savedCapture.proposalId = proposal.proposalId;
    savedCapture.updatedAt = now;
    await this.store.save(next, state.revision);
    return proposal;
  }

  private async saveManualObjectProposal(state: SystemState, proposal: Proposal): Promise<Proposal> {
    const next = structuredClone(state);
    next.proposals.push(proposal);
    await this.store.save(next, state.revision);
    return proposal;
  }

  async createManualFormalizationProposal(
    captureId: string,
    input: Omit<CreateManagedObjectInput, "objectId" | "sourceOrCreationEvent">,
  ): Promise<Proposal> {
    const state = await this.store.load();
    const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    const anchor = findOrThrow(state.anchors, (candidate) => candidate.anchorId === capture.sourceAnchorId, "ANCHOR_NOT_FOUND", "Capture 来源 Anchor 已失联。");
    const now = this.clock().toISOString();
    const objectId = this.makeId("obj");
    const operations: SemanticOperation[] = [];
    let rewriteId: string | undefined;
    if (input.text.trim() !== capture.originalText.trim()) {
      rewriteId = this.makeId("op");
      operations.push({
        operationId: rewriteId,
        operationType: "rewrite_content",
        target: { kind: "CAPTURE", id: captureId },
        payload: { text: input.text.trim() },
        preconditions: [{ kind: "anchor_content_hash", expected: anchor.contentHash }],
        dependencies: [],
        riskLevel: "MEDIUM",
        ruleRefs: ["MAP-RWT-001", "REV-PART-002"],
        rationale: "手工正式化输入与原文不同，正文改写必须独立审查并原地提交。",
        confidence: 1,
        status: "PROPOSED",
      });
    }
    const createId = this.makeId("op");
    operations.push({
      operationId: createId,
      operationType: "create_object",
      target: { kind: "CAPTURE", id: captureId },
      payload: {
        captureId,
        input: { ...input, text: input.text.trim(), objectId, sourceOrCreationEvent: `event_created_${objectId}` },
      },
      preconditions: [],
      dependencies: rewriteId ? [rewriteId] : [],
      riskLevel: "MEDIUM",
      ruleRefs: ["SEM-COMMON-001", "CAP-FRM-001"],
      rationale: "创建由用户明确选择类型和字段的正式对象。",
      confidence: 1,
      status: "PROPOSED",
    });
    operations.push({
      operationId: this.makeId("op"),
      operationType: "resolve_capture",
      target: { kind: "CAPTURE", id: captureId },
      payload: { captureId, objectIds: [objectId] },
      preconditions: [],
      dependencies: [createId, ...(rewriteId ? [rewriteId] : [])],
      riskLevel: "MEDIUM",
      ruleRefs: ["CAP-FRM-001"],
      rationale: "仅在对象和可选正文改写均成功后解决 Capture。",
      confidence: 1,
      status: "PROPOSED",
    });
    const proposal: Proposal = {
      proposalId: this.makeId("prop"), sourceAnchorIds: [anchor.anchorId], sourceObjectIds: [],
      summary: `手工正式化为 ${input.objectType}`, facts: [capture.originalText], assumptions: [], uncertainties: [],
      operations: operations.map((operation) => this.freezeOperationPreconditions(state, operation)),
      generatedAt: now, providerId: "manual-user", providerVersion: "1", ruleVersion: "visual-spec-v1.0", status: "OPEN",
    };
    const next = structuredClone(state);
    next.proposals.push(proposal);
    const savedCapture = next.captures.find((candidate) => candidate.captureId === captureId)!;
    savedCapture.phase = "PROPOSED";
    savedCapture.proposalId = proposal.proposalId;
    savedCapture.updatedAt = now;
    await this.store.save(next, state.revision);
    return proposal;
  }

  async createManualObjectEditProposal(objectId: string, patch: EditableObjectPatch): Promise<Proposal> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const safePatch = sanitizeObjectPatch(patch as Record<string, unknown>);
    if (Object.keys(safePatch).length === 0) throw new StructuredError({ code: "EMPTY_OBJECT_PATCH", message: "没有需要审查的对象变化。", ruleRefs: ["REV-PART-001"] });
    const operations: SemanticOperation[] = [];
    let rewriteId: string | undefined;
    if (typeof safePatch.text === "string" && safePatch.text.trim() !== object.text) {
      rewriteId = this.makeId("op");
      operations.push({
        operationId: rewriteId, operationType: "rewrite_content", target: { kind: "OBJECT", id: objectId },
        payload: { text: safePatch.text.trim() }, preconditions: [], dependencies: [], riskLevel: "MEDIUM",
        ruleRefs: ["MAP-RWT-001", "REV-PART-002"], rationale: "对象正文改写必须同步到唯一 Logseq 正文权威。", confidence: 1, status: "PROPOSED",
      });
    }
    operations.push({
      operationId: this.makeId("op"), operationType: "update_object", target: { kind: "OBJECT", id: objectId },
      payload: safePatch, preconditions: [], dependencies: rewriteId ? [rewriteId] : [], riskLevel: "MEDIUM",
      ruleRefs: ["SEM-COMMON-003", "REV-PART-005"], rationale: "保存用户确认的对象字段版本。", confidence: 1, status: "PROPOSED",
    });
    const proposal: Proposal = {
      proposalId: this.makeId("prop"), sourceAnchorIds: object.primaryTextAnchorId ? [object.primaryTextAnchorId] : [], sourceObjectIds: [objectId],
      summary: "手工编辑对象", facts: [object.text], assumptions: [], uncertainties: [],
      operations: operations.map((operation) => this.freezeOperationPreconditions(state, operation)),
      generatedAt: this.clock().toISOString(), providerId: "manual-user", providerVersion: "1", ruleVersion: "visual-spec-v1.0", status: "OPEN",
    };
    return this.saveManualObjectProposal(state, proposal);
  }

  private async createManualObjectOperationProposal(
    state: SystemState,
    object: ManagedObject,
    summary: string,
    operation: SemanticOperation,
  ): Promise<Proposal> {
    const proposal: Proposal = {
      proposalId: this.makeId("prop"),
      sourceAnchorIds: object.primaryTextAnchorId ? [object.primaryTextAnchorId] : [],
      sourceObjectIds: [object.objectId],
      summary,
      facts: [object.text],
      assumptions: [],
      uncertainties: [],
      operations: [this.freezeOperationPreconditions(state, { ...operation, riskLevel: effectiveOperationRisk(operation) })],
      generatedAt: this.clock().toISOString(),
      providerId: "manual-user",
      providerVersion: "1",
      ruleVersion: "visual-spec-v1.0",
      status: "OPEN",
    };
    return this.saveManualObjectProposal(state, proposal);
  }

  async createManualConditionProposal(objectId: string, kind: ConditionKind, evidence: ConditionEvidence): Promise<Proposal> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    setCondition(object, kind, evidence, this.clock());
    return this.createManualObjectOperationProposal(state, object, `将 Condition 改为 ${kind}`, {
      operationId: this.makeId("op"), operationType: "set_condition", target: { kind: "OBJECT", id: objectId },
      payload: { kind, ...evidence }, preconditions: [], dependencies: [], riskLevel: "MEDIUM",
      ruleRefs: ["LIF-COND-001", "LIF-COND-002", "LIF-COND-003"], rationale: "先通过领域规则预校验，再由用户审查正式状态变化。", confidence: 1, status: "PROPOSED",
    });
  }

  async createManualPhaseProposal(objectId: string, phase: Phase, options: { completionChecksPassed?: boolean; reason?: string } = {}): Promise<Proposal> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const context = this.transitionContextFor(state, object, options);
    transitionPhase(object, phase, this.clock(), context);
    return this.createManualObjectOperationProposal(state, object, `将 Phase 从 ${object.phase} 改为 ${phase}`, {
      operationId: this.makeId("op"), operationType: "set_phase", target: { kind: "OBJECT", id: objectId },
      payload: { phase, context }, preconditions: [], dependencies: [], riskLevel: "MEDIUM",
      ruleRefs: ["LIF-BASE-001"], rationale: "目标 Phase 与进入门槛已由 Domain 预校验。", confidence: 1, status: "PROPOSED",
    });
  }

  async createManualOwnershipProposal(objectId: string, ownerObjectId: string): Promise<Proposal> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    setPrimaryOwnership(state.relations, state.objects, objectId, ownerObjectId, this.clock());
    return this.createManualObjectOperationProposal(state, object, "改变主归属", {
      operationId: this.makeId("op"), operationType: "set_primary_ownership", target: { kind: "OBJECT", id: objectId },
      payload: { objectId, ownerObjectId }, preconditions: [], dependencies: [], riskLevel: "HIGH",
      ruleRefs: ["REL-OWN-001", "REL-OWN-002", "REV-PART-003"], rationale: "主归属是高影响领域变化，必须单独审查。", confidence: 1, status: "PROPOSED",
    });
  }

  async reviewProposal(
    proposalId: string,
    decisions: Record<string, string | { status: ReviewDecision; payload?: Record<string, unknown>; highImpactConfirmed?: boolean }>,
  ): Promise<Proposal> {
    const state = await this.store.load();
    const proposal = findOrThrow(state.proposals, (candidate) => candidate.proposalId === proposalId, "PROPOSAL_NOT_FOUND", "找不到 Proposal。");
    if (proposal.status !== "OPEN") throw new StructuredError({ code: "PROPOSAL_CLOSED", message: "Proposal 已关闭。", ruleRefs: ["COM-PROP-001"] });
    const next = structuredClone(state);
    const reviewed = next.proposals.find((candidate) => candidate.proposalId === proposalId)!;
    reviewed.operations = reviewed.operations.map((operation) => {
      const decision = decisions[operation.operationId];
      if (!decision) return operation;
      if (operation.status === "COMMITTED") {
        throw new StructuredError({ code: "OPERATION_ALREADY_COMMITTED", message: "已提交操作不能重新审查。", ruleRefs: ["COM-ATM-001"] });
      }
      const status = typeof decision === "string" ? decision : decision.status;
      if (status !== "ACCEPTED" && status !== "REJECTED" && status !== "EDITED") {
        throw new StructuredError({ code: "INVALID_REVIEW_DECISION", message: `无效审查状态 ${status}。`, ruleRefs: ["REV-PART-001"] });
      }
      const finalPayload = typeof decision === "string" || !decision.payload ? operation.payload : decision.payload;
      if (status === "EDITED" && operation.operationType === "create_object") {
        const beforeInput = operation.payload.input;
        const afterInput = finalPayload.input;
        const beforeIdentity = beforeInput && typeof beforeInput === "object" ? beforeInput as Record<string, unknown> : {};
        const afterIdentity = afterInput && typeof afterInput === "object" ? afterInput as Record<string, unknown> : {};
        if (afterIdentity.objectId !== beforeIdentity.objectId || afterIdentity.sourceOrCreationEvent !== beforeIdentity.sourceOrCreationEvent) {
          throw new StructuredError({ code: "OBJECT_IDENTITY_IMMUTABLE", message: "编辑 Proposal 时不能改变 Application 发放的 objectId 或创建事件。", ruleRefs: ["PRI-012"] });
        }
      }
      const finalRisk = effectiveOperationRisk({ ...operation, payload: finalPayload });
      if ((status === "ACCEPTED" || status === "EDITED") && finalRisk === "HIGH") {
        if (typeof decision === "string" || decision.highImpactConfirmed !== true) {
          throw new StructuredError({
            code: "HIGH_IMPACT_CONFIRMATION_REQUIRED",
            message: "高影响操作必须由用户单独明确确认。",
            ruleRefs: ["PRI-006", "REV-PART-003"],
          });
        }
      }
      return { ...reviewOperation(operation, status, typeof decision === "string" ? undefined : decision.payload), riskLevel: finalRisk };
    });
    await this.store.save(next, state.revision);
    return reviewed;
  }

  async deferProposalOperation(proposalId: string, operationId: string, deferredUntil: string, reason: string): Promise<Proposal> {
    const state = await this.store.load();
    const proposal = findOrThrow(state.proposals, (candidate) => candidate.proposalId === proposalId, "PROPOSAL_NOT_FOUND", "找不到 Proposal。");
    if (proposal.status !== "OPEN") throw new StructuredError({ code: "PROPOSAL_CLOSED", message: "Proposal 已关闭。", ruleRefs: ["COM-PROP-001"] });
    const next = structuredClone(state);
    const saved = next.proposals.find((candidate) => candidate.proposalId === proposalId)!;
    const target = saved.operations.find((operation) => operation.operationId === operationId);
    if (!target) {
      throw new StructuredError({ code: "OPERATION_NOT_FOUND", message: "找不到要暂缓的操作。", ruleRefs: ["REV-PART-001"] });
    }
    if (target.status === "COMMITTED") {
      throw new StructuredError({ code: "OPERATION_ALREADY_COMMITTED", message: "已提交操作不能暂缓。", ruleRefs: ["COM-ATM-001"] });
    }
    saved.operations = saved.operations.map((operation) => operation.operationId === operationId ? deferOperation(operation, deferredUntil, reason) : operation);
    await this.store.save(next, state.revision);
    return saved;
  }

  async rejectProposal(proposalId: string, reason = "用户全部拒绝"): Promise<Proposal> {
    const state = await this.store.load();
    const proposal = findOrThrow(state.proposals, (candidate) => candidate.proposalId === proposalId, "PROPOSAL_NOT_FOUND", "找不到 Proposal。");
    if (proposal.status !== "OPEN") throw new StructuredError({ code: "PROPOSAL_CLOSED", message: "Proposal 已关闭。", ruleRefs: ["COM-PROP-001"] });
    const next = structuredClone(state);
    const saved = next.proposals.find((candidate) => candidate.proposalId === proposalId)!;
    saved.status = saved.operations.some((operation) => operation.status === "COMMITTED") ? "COMMITTED" : "REJECTED";
    saved.operations = saved.operations.map((operation) => ({ ...operation, status: operation.status === "COMMITTED" ? operation.status : "REJECTED" }));
    const capture = next.captures.find((candidate) => candidate.proposalId === proposalId);
    if (capture && capture.phase === "PROPOSED") {
      capture.phase = "NEW";
      capture.updatedAt = this.clock().toISOString();
    }
    next.events.push({
      eventId: this.makeId("event"), timestamp: this.clock().toISOString(), actor: "user",
      ...(capture ? { captureId: capture.captureId } : {}),
      operationType: "proposal_rejected", payload: { proposalId, reason }, sourceProposalId: proposalId,
      ruleRefs: ["REV-PART-001"], reversible: false,
    });
    await this.store.save(next, state.revision);
    return saved;
  }

  async getProposalImpact(proposalId: string): Promise<ProposalImpactView> {
    const state = await this.store.load();
    const proposal = findOrThrow(state.proposals, (candidate) => candidate.proposalId === proposalId, "PROPOSAL_NOT_FOUND", "找不到 Proposal。");
    const resolution = resolveOperations(proposal.operations);
    const labels: Record<SemanticOperation["operationType"], string> = {
      rewrite_content: "改写正文", create_object: "创建对象", update_object: "更新对象", set_primary_ownership: "改变主归属",
      set_phase: "改变 Phase", set_condition: "改变 Condition", set_dates: "更新日期", add_relation: "新增关系",
      remove_relation: "结束关系", link_anchor: "绑定 Anchor", move_content: "移动正文", resolve_capture: "解决 Capture",
    };
    const affectedObjects = new Set<string>();
    const affectedViews = new Set<string>(["Audit / Recovery"]);
    const affectedFiles = new Set<string>();
    const downstream: string[] = [];
    const validationErrors: string[] = [];
    for (const operation of resolution.executable) {
      if (operation.target.kind === "OBJECT") affectedObjects.add(operation.target.id);
      for (const key of ["objectId", "ownerObjectId", "fromObjectId", "toObjectId"] as const) {
        const id = operation.payload[key];
        if (typeof id === "string") affectedObjects.add(id);
      }
      const input = operation.payload.input;
      const inputObjectId = input && typeof input === "object" ? (input as Record<string, unknown>).objectId : undefined;
      if (typeof inputObjectId === "string") affectedObjects.add(inputObjectId);
      const objectIds = operation.payload.objectIds;
      if (Array.isArray(objectIds)) for (const id of objectIds) if (typeof id === "string") affectedObjects.add(id);
      if (["rewrite_content", "move_content"].includes(operation.operationType)) {
        const anchor = this.anchorForOperation(state, operation);
        affectedFiles.add(`Logseq Block ${anchor.graphId} / ${anchor.externalId}`);
      }
      if (["create_object", "update_object", "set_phase", "set_condition", "set_dates", "set_primary_ownership"].includes(operation.operationType)) {
        affectedViews.add("Objects");
        affectedViews.add("Now Work");
      }
      if (operation.operationType === "resolve_capture") affectedViews.add("Inbox");
      if (operation.operationType === "set_phase" || operation.operationType === "update_object") affectedViews.add("Project Re-entry");
      for (const dependency of operation.dependencies) downstream.push(`${dependency} → ${operation.operationId}`);
    }
    try {
      for (const operation of resolution.executable) this.assertOperationPreconditions(state, operation);
      for (const operation of resolution.executable.filter((candidate) => candidate.operationType === "rewrite_content" || candidate.operationType === "move_content")) {
        await this.content.prepare(operation, this.anchorForOperation(state, operation));
      }
      const dryRun = structuredClone(state);
      const changes: DomainChangeRecord[] = [];
      for (const operation of resolution.executable) this.applyDomainOperation(dryRun, operation, changes);
    } catch (error) {
      validationErrors.push(error instanceof Error ? error.message : String(error));
    }
    return {
      executable: resolution.executable.length,
      blocked: resolution.blocked.length,
      pending: resolution.pending.length,
      rejected: resolution.rejected.length,
      effects: [...new Set(resolution.executable.map((operation) => labels[operation.operationType]))],
      affectedObjects: [...affectedObjects],
      affectedViews: [...affectedViews],
      affectedFiles: [...affectedFiles],
      downstream,
      validationErrors,
      commitReady: resolution.executable.length > 0 && validationErrors.length === 0,
    };
  }

  async getEditedOperationRisk(proposalId: string, operationId: string, payload: Record<string, unknown>): Promise<SemanticOperation["riskLevel"]> {
    const state = await this.store.load();
    const proposal = findOrThrow(state.proposals, (candidate) => candidate.proposalId === proposalId, "PROPOSAL_NOT_FOUND", "找不到 Proposal。");
    const operation = findOrThrow(proposal.operations, (candidate) => candidate.operationId === operationId, "OPERATION_NOT_FOUND", "找不到操作。");
    return effectiveOperationRisk({ ...operation, payload });
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

  private freezeOperationPreconditions(state: SystemState, operation: SemanticOperation): SemanticOperation {
    const withoutOwned = operation.preconditions.filter((precondition) => !["anchor_content_hash", "object_version", "object_id_issued"].includes(precondition.kind));
    const preconditions = [...withoutOwned];
    if (operation.operationType === "rewrite_content" || operation.operationType === "move_content") {
      const anchor = this.anchorForOperation(state, operation);
      preconditions.push({ kind: "anchor_content_hash", expected: anchor.contentHash });
    }
    if (operation.target.kind === "OBJECT") {
      const object = state.objects.find((candidate) => candidate.objectId === operation.target.id);
      if (object) preconditions.push({ kind: "object_version", expected: object.version });
    }
    if (operation.operationType === "create_object") {
      const input = operation.payload.input;
      const objectId = input && typeof input === "object" ? (input as Record<string, unknown>).objectId : undefined;
      if (typeof objectId === "string") preconditions.push({ kind: "object_id_issued", expected: objectId });
    }
    return { ...operation, preconditions };
  }

  private assertOperationPreconditions(state: SystemState, operation: SemanticOperation): void {
    if (operation.operationType === "set_primary_ownership" && operation.target.kind === "OBJECT" && operation.payload.objectId !== operation.target.id) {
      throw new StructuredError({ code: "OPERATION_TARGET_MISMATCH", message: "主归属 payload 与已审查目标不一致。", ruleRefs: ["COM-OP-001", "PRI-012"] });
    }
    if (operation.operationType === "resolve_capture" && operation.target.kind === "CAPTURE" && operation.payload.captureId !== operation.target.id) {
      throw new StructuredError({ code: "OPERATION_TARGET_MISMATCH", message: "Capture payload 与已审查目标不一致。", ruleRefs: ["COM-OP-001"] });
    }
    if (operation.operationType === "create_object" && operation.target.kind === "CAPTURE" && operation.payload.captureId !== undefined && operation.payload.captureId !== operation.target.id) {
      throw new StructuredError({ code: "OPERATION_TARGET_MISMATCH", message: "创建对象的 Capture payload 与已审查目标不一致。", ruleRefs: ["COM-OP-001"] });
    }
    if (
      (operation.operationType === "rewrite_content" || operation.operationType === "move_content") &&
      !operation.preconditions.some((precondition) => precondition.kind === "anchor_content_hash")
    ) {
      throw new StructuredError({ code: "ANCHOR_PRECONDITION_REQUIRED", message: "正文操作缺少生成时 Anchor 版本，禁止提交。", ruleRefs: ["SYN-CON-001", "COM-ATM-001"] });
    }
    if (
      operation.target.kind === "OBJECT" &&
      state.objects.some((candidate) => candidate.objectId === operation.target.id) &&
      !operation.preconditions.some((precondition) => precondition.kind === "object_version")
    ) {
      throw new StructuredError({ code: "OBJECT_PRECONDITION_REQUIRED", message: "对象操作缺少生成时版本，禁止提交。", ruleRefs: ["SYN-CON-001", "COM-ATM-001"] });
    }
    if (operation.operationType === "create_object" && !operation.preconditions.some((precondition) => precondition.kind === "object_id_issued")) {
      throw new StructuredError({ code: "OBJECT_ID_PRECONDITION_REQUIRED", message: "创建对象操作缺少 Application ID 证明，禁止提交。", ruleRefs: ["PRI-012"] });
    }
    for (const precondition of operation.preconditions) {
      if (precondition.kind === "anchor_content_hash") {
        const anchor = this.anchorForOperation(state, operation);
        if (anchor.contentHash !== precondition.expected) {
          throw new StructuredError({
            code: "STALE_PROPOSAL_ANCHOR_VERSION",
            message: "Proposal 生成后正文权威版本已变化，提交已停止；请重新生成或手工合并。",
            ruleRefs: ["SYN-CON-001", "COM-ATM-001"],
          });
        }
      }
      if (precondition.kind === "object_version") {
        const object = findOrThrow(state.objects, (candidate) => candidate.objectId === operation.target.id, "OBJECT_NOT_FOUND", "Proposal 目标对象已不存在。");
        if (object.version !== precondition.expected) {
          throw new StructuredError({
            code: "STALE_PROPOSAL_OBJECT_VERSION",
            message: "Proposal 生成后对象版本已变化，提交已停止；请重新审查。",
            ruleRefs: ["SYN-CON-001", "COM-ATM-001"],
          });
        }
      }
      if (precondition.kind === "object_id_issued") {
        const input = operation.payload.input;
        const objectId = input && typeof input === "object" ? (input as Record<string, unknown>).objectId : undefined;
        if (objectId !== precondition.expected) {
          throw new StructuredError({ code: "OBJECT_IDENTITY_CHANGED", message: "创建对象的稳定 ID 在 Proposal 生成后被改变，提交已停止。", ruleRefs: ["PRI-012"] });
        }
      }
    }
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
        if (state.objects.some((candidate) => candidate.objectId === object.objectId)) {
          throw new StructuredError({ code: "DUPLICATE_OBJECT_ID", message: "Proposal 试图复用现有对象 ID，提交已停止。", ruleRefs: ["PRI-012"] });
        }
        state.objects.push(object);
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
        this.recordChange(changes, { entityType: "OBJECT", entityId: object.objectId, after: object });
        break;
      }
      case "update_object": {
        const object = findOrThrow(state.objects, (candidate) => candidate.objectId === operation.target.id, "OBJECT_NOT_FOUND", "找不到待更新对象。");
        const before = structuredClone(object);
        Object.assign(object, sanitizeObjectPatch(operation.payload), { version: object.version + 1, updatedAt: now.toISOString(), lastMeaningfulEventAt: now.toISOString() });
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
      case "set_dates": {
        sanitizeObjectPatch(operation.payload, new Set(["dueAt", "reviewAt"]));
        this.applyDomainOperation(state, { ...operation, operationType: "update_object" }, changes);
        break;
      }
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
    const input = operation.payload.input;
    const createdObjectId = operation.operationType === "create_object" && input && typeof input === "object"
      ? (input as Record<string, unknown>).objectId
      : undefined;
    return {
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      ...(operation.target.kind === "OBJECT" ? { objectId: operation.target.id } : typeof createdObjectId === "string" ? { objectId: createdObjectId } : {}),
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
    for (const operation of resolution.executable) this.assertOperationPreconditions(initial, operation);
    const textOperations = resolution.executable.filter(
      (operation) => operation.operationType === "rewrite_content" || operation.operationType === "move_content",
    );
    const prepared: PreparedTextMutation[] = [];
    try {
      for (const operation of textOperations) {
        prepared.push(await this.content.prepare(operation, this.anchorForOperation(initial, operation)));
      }
    } catch (error) {
      await this.scanAnchors();
      throw error;
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
        graphId: mutation.graphId,
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
      savedProposal.operations = savedProposal.operations.map((operation) =>
        resolution.executable.some((candidate) => candidate.operationId === operation.operationId)
          ? { ...operation, status: "COMMITTED" as OperationStatus }
          : resolution.blocked.find((candidate) => candidate.operationId === operation.operationId) ?? operation,
      );
      savedProposal.status = savedProposal.operations.some((operation) => operation.status === "PROPOSED" || operation.status === "DEFERRED")
        ? "OPEN"
        : "COMMITTED";
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
    const initial = await this.store.load();
    const original = findOrThrow(initial.commits, (candidate) => candidate.semanticCommitId === semanticCommitId, "COMMIT_NOT_FOUND", "找不到 SemanticCommit。");
    if (original.status !== "COMPLETED") throw new StructuredError({ code: "COMMIT_NOT_UNDOABLE", message: "只有已完成且未撤销的 Commit 可以撤销。", ruleRefs: ["AUD-RBK-001"] });
    if (original.operationIds.some((operationId) => operationId.startsWith("undo:"))) {
      throw new StructuredError({ code: "INVERSE_COMMIT_NOT_UNDOABLE", message: "逆向 Commit 不提供再次撤销；请从审计记录手工选择新的正式操作。", ruleRefs: ["AUD-RBK-001"] });
    }
    const prepared: PreparedTextMutation[] = original.textMutations.map((mutation) => ({
      ...mutation,
      operationId: `undo:${semanticCommitId}`,
      beforeText: mutation.afterText,
      afterText: mutation.beforeText,
      beforeHash: mutation.afterHash,
      afterHash: mutation.beforeHash,
    }));
    for (const mutation of prepared) {
      if (!(await this.content.verify(mutation, "before"))) {
        throw new StructuredError({
          code: "UNDO_TEXT_CONFLICT",
          message: "正文在提交后已被再次编辑，撤销已停止；请手工合并。",
          ruleRefs: ["SYN-CON-001", "AUD-RBK-001"],
        });
      }
    }
    const now = this.clock().toISOString();
    const undoId = this.makeId("commit");
    const inverseChanges = original.domainChanges.map((change) => ({ ...change, before: change.after, after: change.before }));
    const pendingUndo: SemanticCommit = {
      semanticCommitId: undoId,
      proposalId: original.proposalId,
      status: "PENDING",
      operationIds: [`undo:${semanticCommitId}`],
      createdAt: now,
      updatedAt: now,
      beforeStateChecksum: checksum(initial),
      textMutations: prepared.map((mutation) => ({
        anchorId: mutation.anchorId,
        graphId: mutation.graphId,
        externalId: mutation.externalId,
        beforeText: mutation.beforeText,
        afterText: mutation.afterText,
        beforeHash: mutation.beforeHash,
        afterHash: mutation.afterHash,
      })),
      domainChanges: inverseChanges,
    };
    const pendingState = structuredClone(initial);
    pendingState.commits.push(pendingUndo);
    const persistedPending = await this.store.save(pendingState, initial.revision);
    const executed: PreparedTextMutation[] = [];
    try {
      for (const mutation of prepared) {
        await this.content.apply(mutation);
        executed.push(mutation);
        if (!(await this.content.verify(mutation, "after"))) throw new Error("撤销正文写入后校验失败");
      }
      const next = structuredClone(persistedPending);
      for (const change of [...original.domainChanges].reverse()) this.restoreChange(next, change, change.before);
      const savedOriginal = next.commits.find((candidate) => candidate.semanticCommitId === semanticCommitId)!;
      savedOriginal.status = "UNDONE";
      savedOriginal.undoCommitId = undoId;
      savedOriginal.updatedAt = this.clock().toISOString();
      const undo = next.commits.find((candidate) => candidate.semanticCommitId === undoId)!;
      undo.status = "COMPLETED";
      undo.updatedAt = this.clock().toISOString();
      undo.afterStateChecksum = checksum({ ...next, commits: next.commits.filter((candidate) => candidate.semanticCommitId !== undoId) });
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
      const saved = await this.store.save(next, persistedPending.revision);
      return saved.commits.find((candidate) => candidate.semanticCommitId === undoId)!;
    } catch (error) {
      let compensationCompleted = true;
      let compensationMessage: string | undefined;
      for (const mutation of [...executed].reverse()) {
        try {
          await this.content.compensate(mutation);
          if (!(await this.content.verify(mutation, "before"))) throw new Error("撤销补偿后校验失败", { cause: error });
        } catch (compensationError) {
          compensationCompleted = false;
          compensationMessage = compensationError instanceof Error ? compensationError.message : String(compensationError);
          break;
        }
      }
      const current = await this.store.load();
      const undo = current.commits.find((candidate) => candidate.semanticCommitId === undoId) ?? pendingUndo;
      undo.status = compensationCompleted ? "FAILED" : "RECOVERY_REQUIRED";
      undo.updatedAt = this.clock().toISOString();
      undo.error = errorShape(error);
      undo.compensation = {
        attempted: executed.length > 0,
        completed: compensationCompleted,
        ...(compensationMessage ? { message: compensationMessage } : {}),
      };
      if (!current.commits.some((candidate) => candidate.semanticCommitId === undoId)) current.commits.push(undo);
      const recorded = await this.store.save(current, current.revision);
      return recorded.commits.find((candidate) => candidate.semanticCommitId === undoId)!;
    }
  }

  async recoverPendingCommits(): Promise<{ recovered: string[]; recoveryRequired: string[] }> {
    const state = await this.store.load();
    const candidates = state.commits.filter((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED");
    const recovered: string[] = [];
    const recoveryRequired: string[] = [];
    for (const commit of candidates) {
      let safe = true;
      const states: Array<{ mutation: PreparedTextMutation; state: "before" | "after" }> = [];
      for (const mutation of commit.textMutations) {
        const prepared: PreparedTextMutation = { ...mutation, operationId: `recovery:${commit.semanticCommitId}` };
        if (await this.content.verify(prepared, "before")) states.push({ mutation: prepared, state: "before" });
        else if (await this.content.verify(prepared, "after")) states.push({ mutation: prepared, state: "after" });
        else {
          safe = false;
          break;
        }
      }
      if (safe) {
        for (const entry of states.slice().reverse()) {
          if (entry.state === "before") continue;
          try {
            await this.content.compensate(entry.mutation);
            if (!(await this.content.verify(entry.mutation, "before"))) throw new Error("恢复补偿校验失败");
          } catch {
            safe = false;
            break;
          }
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

  async getAvailableObjectPhases(objectId: string): Promise<readonly Phase[]> {
    const object = await this.getObject(objectId);
    return allowedPhaseTransitions(object);
  }

  private transitionContextFor(
    state: SystemState,
    object: ManagedObject,
    options: { completionChecksPassed?: boolean; reason?: string },
  ): Parameters<typeof transitionPhase>[3] {
    const hasPrimaryOwnership = state.relations.some(
      (relation) => relation.status === "ACTIVE" && relation.relationType === "primary_ownership" && relation.fromObjectId === object.objectId,
    );
    const childIds = new Set(
      state.relations
        .filter((relation) => relation.status === "ACTIVE" && relation.relationType === "primary_ownership" && relation.toObjectId === object.objectId)
        .map((relation) => relation.fromObjectId),
    );
    const hasActiveChild = state.objects.some((candidate) => childIds.has(candidate.objectId) && candidate.phase === "ACTIVE");
    return {
      hasPrimaryOwnership,
      hasCurrentProgress: Boolean(object.nextAction?.trim()),
      hasActiveChild,
      ...(options.completionChecksPassed !== undefined ? { completionChecksPassed: options.completionChecksPassed } : {}),
      ...(options.reason ? { reason: options.reason } : {}),
    };
  }

  async getObjectSignals(objectId: string): Promise<AttentionSignal[]> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    return calculateSignals(object, state.relations, this.clock());
  }

  async getObjectDetail(objectId: string): Promise<ObjectDetailView> {
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const ownerRelation = state.relations.find(
      (relation) => relation.status === "ACTIVE" && relation.relationType === "primary_ownership" && relation.fromObjectId === objectId,
    );
    const owner = ownerRelation ? state.objects.find((candidate) => candidate.objectId === ownerRelation.toObjectId) : undefined;
    const undoableCommit = state.commits
      .slice()
      .reverse()
      .find((commit) => this.isUndoableCommit(commit) && commit.domainChanges.some((change) => change.entityType === "OBJECT" && change.entityId === objectId));
    return {
      object,
      ...(owner ? { owner: { objectId: owner.objectId, text: owner.text } } : {}),
      anchors: state.anchors.filter((anchor) => anchor.objectId === objectId),
      signals: calculateSignals(object, state.relations, this.clock()),
      recentEvents: state.events
        .filter((event) => event.objectId === objectId)
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, 5),
      ...(undoableCommit ? { undoableCommitId: undoableCommit.semanticCommitId } : {}),
    };
  }

  private authoritativeText(state: SystemState, anchor: Anchor): string {
    return state.objects.find((object) => object.objectId === anchor.objectId)?.text
      ?? state.captures.find((capture) => capture.captureId === anchor.objectId)?.originalText
      ?? "无法从当前 Domain State 重建预期正文";
  }

  async scanAnchors(): Promise<{ active: number; missing: number; conflict: number; unavailable: number }> {
    const state = await this.store.load();
    const next = structuredClone(state);
    const counts = { active: 0, missing: 0, conflict: 0, unavailable: 0 };
    let changed = false;
    const now = this.clock().toISOString();
    for (const anchor of next.anchors.filter((candidate) => candidate.status !== "replaced")) {
      const observation = await this.content.observe(anchor);
      counts[observation.status] += 1;
      if (observation.status === "unavailable") continue;
      const previousStatus = anchor.status;
      const previousObservedHash = anchor.observedContentHash;
      const previousObservedText = anchor.observedText;
      const previousLastSeenAt = anchor.lastSeenAt;
      const nextObservedHash = observation.status === "conflict" ? observation.currentHash : undefined;
      const nextObservedText = observation.status === "conflict" ? observation.currentText : undefined;
      const observationChanged = previousStatus !== observation.status
        || previousObservedHash !== nextObservedHash
        || previousObservedText !== nextObservedText;
      anchor.status = observation.status;
      anchor.lastSeenAt = now;
      if (observation.status === "active") {
        delete anchor.observedContentHash;
        delete anchor.observedText;
      } else if (observation.status === "conflict") {
        anchor.observedContentHash = observation.currentHash;
        anchor.observedText = observation.currentText;
      } else {
        delete anchor.observedContentHash;
        delete anchor.observedText;
      }
      if (previousLastSeenAt !== now) changed = true;
      if (!observationChanged) continue;
      changed = true;
      const capture = next.captures.find((candidate) => candidate.captureId === anchor.objectId);
      const object = next.objects.find((candidate) => candidate.objectId === anchor.objectId);
      next.events.push({
        eventId: this.makeId("event"), timestamp: now, actor: "system",
        ...(object ? { objectId: object.objectId } : {}), ...(capture ? { captureId: capture.captureId } : {}),
        operationType: observation.status === "active" ? "anchor_recovered" : `anchor_${observation.status}`,
        payload: {
          anchorId: anchor.anchorId, graphId: anchor.graphId, externalId: anchor.externalId,
          source: anchor.cachedPageRef ?? anchor.externalId,
          expectedText: this.authoritativeText(next, anchor),
          currentText: observation.status === "conflict" ? observation.currentText : null,
          expectedHash: anchor.contentHash,
          currentHash: observation.status === "conflict" ? observation.currentHash : null,
          observedAt: now,
          options: ["重新绑定当前块", "打开审计并手工合并", "从恢复包检查历史版本"],
        },
        ruleRefs: ["MAP-PAGE-002", "SYN-CON-001"], reversible: false,
      });
    }
    for (const object of next.objects) {
      const problematic = next.anchors.find(
        (anchor) => anchor.objectId === object.objectId && anchor.role === "primary_text" && (anchor.status === "missing" || anchor.status === "conflict"),
      );
      const desired = problematic
        ? { code: problematic.status === "missing" ? "ANCHOR_MISSING" : "ANCHOR_CONTENT_CONFLICT", message: `主正文 Anchor ${problematic.anchorId} ${problematic.status}；请在审计中检查版本并重新绑定或手工合并。` }
        : undefined;
      if (desired && (object.conflict?.code !== desired.code || object.conflict.message !== desired.message)) {
        object.conflict = desired;
        object.version += 1;
        object.updatedAt = now;
        changed = true;
      } else if (!desired && object.conflict?.code.startsWith("ANCHOR_")) {
        delete object.conflict;
        object.version += 1;
        object.updatedAt = now;
        changed = true;
      }
    }
    if (changed) await this.store.save(next, state.revision);
    return counts;
  }

  private isUndoableCommit(commit: SemanticCommit): boolean {
    return commit.status === "COMPLETED" && !commit.operationIds.some((operationId) => operationId.startsWith("undo:"));
  }

  async getAuditProjection(): Promise<AuditProjection> {
    const state = await this.store.load();
    return {
      anchorConflicts: state.anchors
        .filter((anchor): anchor is Anchor & { status: "missing" | "conflict" } => anchor.status === "missing" || anchor.status === "conflict")
        .map((anchor) => ({
          anchorId: anchor.anchorId,
          status: anchor.status,
          graphId: anchor.graphId,
          externalId: anchor.externalId,
          source: anchor.cachedPageRef ?? anchor.externalId,
          observedAt: anchor.lastSeenAt,
          expectedText: this.authoritativeText(state, anchor),
          ...(anchor.observedText !== undefined ? { currentText: anchor.observedText } : {}),
          options: ["重新绑定当前块", "打开审计并手工合并", "从恢复包检查历史版本"],
        })),
      undoableCommitIds: state.commits.filter((commit) => this.isUndoableCommit(commit)).map((commit) => commit.semanticCommitId),
    };
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

  async deferCapture(captureId: string, deferredUntil: string, reason = "稍后复查"): Promise<Capture> {
    if (!Number.isFinite(Date.parse(deferredUntil))) {
      throw new StructuredError({ code: "INVALID_DEFERRED_UNTIL", message: "Capture 暂缓时间必须是合法日期。", ruleRefs: ["PRI-003"] });
    }
    const state = await this.store.load();
    findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    const next = structuredClone(state);
    const saved = next.captures.find((candidate) => candidate.captureId === captureId)!;
    saved.deferredUntil = deferredUntil;
    saved.deferReason = reason.trim() || "稍后复查";
    saved.updatedAt = this.clock().toISOString();
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      captureId,
      operationType: "capture_deferred",
      payload: { deferredUntil, reason: saved.deferReason },
      ruleRefs: ["PRI-003"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return saved;
  }

  async associateCapture(captureId: string, objectId: string): Promise<Capture> {
    const state = await this.store.load();
    const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到要关联的现有对象。");
    const next = structuredClone(state);
    const saved = next.captures.find((candidate) => candidate.captureId === captureId)!;
    saved.phase = "RESOLVED";
    saved.resolvedObjectIds = [objectId];
    saved.resolutionNote = "关联现有对象";
    saved.updatedAt = this.clock().toISOString();
    const anchor = next.anchors.find((candidate) => candidate.anchorId === capture.sourceAnchorId);
    if (anchor) anchor.objectId = objectId;
    next.events.push({
      eventId: this.makeId("event"),
      timestamp: this.clock().toISOString(),
      actor: "user",
      objectId,
      captureId,
      operationType: "capture_associated",
      payload: { sourceAnchorId: capture.sourceAnchorId },
      ruleRefs: ["CAP-FRM-001", "REL-SRC-001"],
      reversible: true,
    });
    await this.store.save(next, state.revision);
    return saved;
  }

  async openCaptureSource(captureId: string): Promise<void> {
    await this.scanAnchors();
    const state = await this.store.load();
    const capture = findOrThrow(state.captures, (candidate) => candidate.captureId === captureId, "CAPTURE_NOT_FOUND", "找不到 Capture。");
    const anchor = findOrThrow(
      state.anchors,
      (candidate) => candidate.anchorId === capture.sourceAnchorId && candidate.status !== "missing" && candidate.status !== "replaced",
      "ANCHOR_NOT_FOUND",
      "来源块已失联，Capture 本身仍然保留。请在审计中查看技术详情或重新绑定。",
    );
    await this.content.open(anchor.externalId, anchor.graphId);
    if (this.content.resolveSource) {
      const resolution = await this.content.resolveSource(anchor.externalId, anchor.cachedPageRef);
      if (resolution.status === "resolved") {
        const current = await this.store.load();
        const next = structuredClone(current);
        const savedCapture = next.captures.find((candidate) => candidate.captureId === captureId);
        const savedAnchor = next.anchors.find((candidate) => candidate.anchorId === anchor.anchorId);
        if (savedCapture && savedAnchor) {
          savedCapture.sourcePage = resolution.displayName;
          if (resolution.pageIdentity) savedCapture.sourcePageIdentity = resolution.pageIdentity;
          delete savedCapture.sourceConflict;
          savedAnchor.cachedPageRef = resolution.displayName;
          savedAnchor.lastSeenAt = this.clock().toISOString();
          await this.store.save(next, current.revision);
        }
      }
    }
  }

  async openObjectText(objectId: string): Promise<void> {
    await this.scanAnchors();
    const state = await this.store.load();
    const anchor = findOrThrow(
      state.anchors,
      (candidate) => candidate.objectId === objectId && candidate.role === "primary_text" && candidate.status === "active",
      "ANCHOR_NOT_FOUND",
      "对象主正文 Anchor 已失联。",
    );
    await this.content.open(anchor.externalId, anchor.graphId);
  }

  async openAnchor(anchorId: string): Promise<void> {
    await this.scanAnchors();
    const state = await this.store.load();
    const anchor = findOrThrow(state.anchors, (candidate) => candidate.anchorId === anchorId && candidate.status === "active", "ANCHOR_NOT_FOUND", "Anchor 已失联或冲突，请在审计中处理。");
    await this.content.open(anchor.externalId, anchor.graphId);
  }

  async rebindPrimaryAnchor(objectId: string): Promise<Anchor> {
    const block = await this.content.getCurrentBlock();
    if (!block) throw new StructuredError({ code: "CURRENT_BLOCK_UNAVAILABLE", message: "请先选择用于重新绑定的 Block。", ruleRefs: ["MAP-ANC-001"] });
    const state = await this.store.load();
    const object = findOrThrow(state.objects, (candidate) => candidate.objectId === objectId, "OBJECT_NOT_FOUND", "找不到对象。");
    const next = structuredClone(state);
    const existing = next.anchors.filter((anchor) => anchor.objectId === objectId && anchor.role === "primary_text" && anchor.status !== "replaced");
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
    for (const previous of existing) {
      previous.status = "replaced";
      previous.replacedByAnchorId = anchor.anchorId;
    }
    next.anchors.push(anchor);
    const saved = next.objects.find((candidate) => candidate.objectId === objectId)!;
    saved.primaryTextAnchorId = anchor.anchorId;
    if (saved.conflict?.code.startsWith("ANCHOR_")) delete saved.conflict;
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
