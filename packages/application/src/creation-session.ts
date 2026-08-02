import {
  abandonCreationSession,
  addCreationSessionSource,
  adoptCreationDraftRevision,
  captureCreationSessionSourcesForDraft,
  completeCreationRound,
  completeCreationSession,
  createCreationSession,
  editCreationDraftNode,
  generateCreationDraftRevision,
  observeCreationSessionSource,
  failCreationRound,
  refreshCreationSessionSource,
  retryCreationRound,
  startCreationSessionRound,
  submitCreationRoundAnswers,
  updateCreationSession,
  undoCreationSessionResult,
  bindV2PrimaryAnchor,
  createV2ManagedObject,
  type CreationResult,
  type CreationDraftGenerationInput,
  type CreationDraftNodeEdit,
  type CreationRoundAnswerInput,
  type CreationRoundCompletion,
  type CreationSession,
  type CreationSourceCapture,
  type CreationSessionSource,
  type CreationSessionStatus,
  type CreationSessionTargetType,
  type V2Anchor,
  type V2ManagedObject,
} from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";
import type { V2AuditRecord } from "./v2.ts";

export interface CreationSessionWriteResult {
  session: CreationSession;
  replayed: boolean;
}

export interface CreationSessionMaterializationResult extends CreationSessionWriteResult {
  object: V2ManagedObject;
  anchor: V2Anchor;
}

export interface CreationSessionMaterializationCommand {
  session: CreationSession;
  expectedSessionVersion: number;
  object: V2ManagedObject;
  anchor: V2Anchor;
  idempotencyKey: string;
  audit: V2AuditRecord & { command: "create_from_creation_session" };
}

export interface CreationSessionMaterializationUndoCommand {
  session: CreationSession;
  expectedSessionVersion: number;
  expectedObject: V2ManagedObject;
  expectedAnchor: V2Anchor;
  semanticCommitId: string;
  idempotencyKey: string;
  audit: V2AuditRecord & { command: "undo_creation_session_materialization" };
}

export interface CreationSessionRepository {
  getCreationSession(sessionId: string): CreationSession | undefined;
  listCreationSessions(statuses?: readonly CreationSessionStatus[]): CreationSession[];
  saveCreationSession(session: CreationSession, expectedVersion: number, idempotencyKey: string, commandName: string): CreationSessionWriteResult;
  replayCreationSessionWrite(idempotencyKey: string, commandName: string): CreationSessionWriteResult | undefined;
  commitCreationSessionMaterialization(command: CreationSessionMaterializationCommand): CreationSessionMaterializationResult;
  commitCreationSessionMaterializationUndo(command: CreationSessionMaterializationUndoCommand): CreationSessionMaterializationResult;
  replayCreationSessionMaterialization(idempotencyKey: string, commandName: "create_from_creation_session" | "undo_creation_session_materialization"): CreationSessionMaterializationResult | undefined;
}

export class CreationSessionApplication {
  constructor(private readonly repository: CreationSessionRepository, private readonly graphId: string) {}

  replay(idempotencyKey: string, commandName: "CreateCreationSession" | "AddCreationSessionSource" | "ObserveCreationSessionSource" | "RefreshCreationSessionSource" | "StartCreationSessionRound" | "PrepareCreationDraft" | "GenerateCreationDraft" | "EditCreationDraft" | "AdoptCreationDraft"): CreationSessionWriteResult | undefined {
    return this.repository.replayCreationSessionWrite(idempotencyKey, commandName);
  }

  create(input: { targetType: CreationSessionTargetType; primarySource: CreationSessionSource; userTitle?: string; sessionId?: string; idempotencyKey: string }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "CreateCreationSession");
    if (replay) return replay;
    const session = createCreationSession({ graphId: this.graphId, targetType: input.targetType, primarySource: input.primarySource, ...(input.userTitle ? { userTitle: input.userTitle } : {}), ...(input.sessionId ? { sessionId: input.sessionId } : {}) }, at);
    return this.repository.saveCreationSession(session, 0, input.idempotencyKey, "CreateCreationSession");
  }

  get(sessionId: string): CreationSession | undefined {
    return this.repository.getCreationSession(sessionId);
  }

  list(statuses?: readonly CreationSessionStatus[]): CreationSession[] {
    return this.repository.listCreationSessions(statuses);
  }

  update(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; patch: Parameters<typeof updateCreationSession>[1] }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "UpdateCreationSession");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = updateCreationSession(current, input.patch, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "UpdateCreationSession");
  }

  addSource(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; source: CreationSessionSource }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "AddCreationSessionSource");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = addCreationSessionSource(current, input.source, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "AddCreationSessionSource");
  }

  observeSource(input: { sessionId: string; sourceId: string; expectedVersion: number; idempotencyKey: string; latestKnownHash?: string; availability: CreationSessionSource["availability"] }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "ObserveCreationSessionSource");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = observeCreationSessionSource(current, input.sourceId, { ...(input.latestKnownHash ? { latestKnownHash: input.latestKnownHash } : {}), availability: input.availability }, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "ObserveCreationSessionSource");
  }

  refreshSource(input: { sessionId: string; sourceId: string; expectedVersion: number; idempotencyKey: string; capture: CreationSourceCapture }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "RefreshCreationSessionSource");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = refreshCreationSessionSource(current, input.sourceId, input.capture, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "RefreshCreationSessionSource");
  }

  startRound(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; round: Parameters<typeof startCreationSessionRound>[1] }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "StartCreationSessionRound");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = startCreationSessionRound(current, input.round, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "StartCreationSessionRound");
  }

  submitRoundAnswers(input: { sessionId: string; roundId: string; expectedVersion: number; idempotencyKey: string; answers: CreationRoundAnswerInput[] }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "SubmitCreationRoundAnswers");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = submitCreationRoundAnswers(current, input.roundId, input.answers, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "SubmitCreationRoundAnswers");
  }

  completeRound(input: { sessionId: string; roundId: string; expectedVersion: number; idempotencyKey: string; completion: CreationRoundCompletion }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "CompleteCreationRound");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = completeCreationRound(current, input.roundId, input.completion, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "CompleteCreationRound");
  }

  failRound(input: { sessionId: string; roundId: string; expectedVersion: number; idempotencyKey: string; status: "FAILED" | "CANCELLED" }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "FailCreationRound");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = failCreationRound(current, input.roundId, input.status, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "FailCreationRound");
  }

  retryRound(input: { sessionId: string; roundId: string; expectedVersion: number; idempotencyKey: string }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "RetryCreationRound");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = retryCreationRound(current, input.roundId, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "RetryCreationRound");
  }

  prepareDraft(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; captures: Array<{ sourceId: string; capture: CreationSourceCapture }> }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "PrepareCreationDraft");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = captureCreationSessionSourcesForDraft(current, input.captures, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "PrepareCreationDraft");
  }

  generateDraft(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; draft: CreationDraftGenerationInput }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "GenerateCreationDraft");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = generateCreationDraftRevision(current, input.draft, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "GenerateCreationDraft");
  }

  editDraft(input: { sessionId: string; revisionId: string; expectedVersion: number; idempotencyKey: string; edit: CreationDraftNodeEdit }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "EditCreationDraft");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = editCreationDraftNode(current, input.revisionId, input.edit, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "EditCreationDraft");
  }

  adoptDraft(input: { sessionId: string; revisionId: string; expectedVersion: number; idempotencyKey: string }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "AdoptCreationDraft");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = adoptCreationDraftRevision(current, input.revisionId, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "AdoptCreationDraft");
  }

  abandon(input: { sessionId: string; expectedVersion: number; idempotencyKey: string }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "AbandonCreationSession");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = abandonCreationSession(current, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "AbandonCreationSession");
  }

  complete(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; result: CreationResult }, at = new Date()): CreationSessionWriteResult {
    const replay = this.repository.replayCreationSessionWrite(input.idempotencyKey, "CompleteCreationSession");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    const session = completeCreationSession(current, input.result, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "CompleteCreationSession");
  }

  formalize(input: {
    sessionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    semanticCommitId: string;
    objectId: string;
    text: string;
    anchor: { anchorId?: string; graphId: string; externalId: string; contentHash: string };
    actor: string;
    traceId: string;
  }, at = new Date()): CreationSessionMaterializationResult {
    const replay = this.repository.replayCreationSessionMaterialization(input.idempotencyKey, "create_from_creation_session");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    if (current.graphId !== input.anchor.graphId || current.targetType === "MINI_PROJECT" && current.placementPlan?.kind === "SOURCE_BLOCK_IN_PLACE" && current.placementPlan.sourceBlockUuid !== input.anchor.externalId) {
      throw new StructuredError({ code: "CREATION_SESSION_FORMAL_ANCHOR_INVALID", message: "正式 Primary Anchor 与 Session Graph 或原位 Placement 不一致。", ruleRefs: ["CREATION-SESSION-001", "D-185"] });
    }
    const created = createV2ManagedObject({ objectId: input.objectId, objectType: current.targetType, text: input.text, sourceOrCreationEvent: `creation_session:${current.sessionId}` }, at);
    const candidate = bindV2PrimaryAnchor(created, input.anchor, created.version, at);
    const session = completeCreationSession(current, { objectId: candidate.object.objectId, semanticCommitId: input.semanticCommitId, createdAt: at.toISOString() }, input.expectedVersion, at);
    return this.repository.commitCreationSessionMaterialization({
      session,
      expectedSessionVersion: input.expectedVersion,
      object: candidate.object,
      anchor: candidate.anchor,
      idempotencyKey: input.idempotencyKey,
      audit: { traceId: input.traceId, actor: input.actor, command: "create_from_creation_session", objectId: candidate.object.objectId, beforeVersion: 0, afterVersion: candidate.object.version, occurredAt: at.toISOString() },
    });
  }

  undoFormalization(input: {
    sessionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    semanticCommitId: string;
    expectedObject: V2ManagedObject;
    expectedAnchor: V2Anchor;
    actor: string;
    traceId: string;
  }, at = new Date()): CreationSessionMaterializationResult {
    const replay = this.repository.replayCreationSessionMaterialization(input.idempotencyKey, "undo_creation_session_materialization");
    if (replay) return replay;
    const current = this.required(input.sessionId);
    if (input.expectedObject.objectId !== input.expectedAnchor.objectId || input.expectedAnchor.role !== "primary_text" || input.expectedObject.version < 1) throw new StructuredError({ code: "CREATION_SESSION_UNDO_EXPECTATION_INVALID", message: "Creation Session Undo 必须引用同一正式对象的精确 Primary Anchor。", ruleRefs: ["CREATION-SESSION-001", "D-188"] });
    const session = undoCreationSessionResult(current, input.expectedObject.objectId, input.semanticCommitId, input.expectedVersion, at);
    return this.repository.commitCreationSessionMaterializationUndo({
      session,
      expectedSessionVersion: input.expectedVersion,
      expectedObject: input.expectedObject,
      expectedAnchor: input.expectedAnchor,
      semanticCommitId: input.semanticCommitId,
      idempotencyKey: input.idempotencyKey,
      audit: { traceId: input.traceId, actor: input.actor, command: "undo_creation_session_materialization", objectId: input.expectedObject.objectId, beforeVersion: input.expectedObject.version, afterVersion: 0, occurredAt: at.toISOString() },
    });
  }

  private required(sessionId: string): CreationSession {
    const session = this.repository.getCreationSession(sessionId);
    if (!session || session.graphId !== this.graphId) throw new StructuredError({ code: "CREATION_SESSION_NOT_FOUND", message: "Creation Session 不存在或不属于当前 Graph。", ruleRefs: ["CREATION-SESSION-001"] });
    return session;
  }
}
