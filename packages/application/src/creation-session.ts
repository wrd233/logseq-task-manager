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
} from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export interface CreationSessionWriteResult {
  session: CreationSession;
  replayed: boolean;
}

export interface CreationSessionRepository {
  getCreationSession(sessionId: string): CreationSession | undefined;
  listCreationSessions(statuses?: readonly CreationSessionStatus[]): CreationSession[];
  saveCreationSession(session: CreationSession, expectedVersion: number, idempotencyKey: string, commandName: string): CreationSessionWriteResult;
  replayCreationSessionWrite(idempotencyKey: string, commandName: string): CreationSessionWriteResult | undefined;
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

  private required(sessionId: string): CreationSession {
    const session = this.repository.getCreationSession(sessionId);
    if (!session || session.graphId !== this.graphId) throw new StructuredError({ code: "CREATION_SESSION_NOT_FOUND", message: "Creation Session 不存在或不属于当前 Graph。", ruleRefs: ["CREATION-SESSION-001"] });
    return session;
  }
}
