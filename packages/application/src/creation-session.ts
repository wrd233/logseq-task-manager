import {
  abandonCreationSession,
  addCreationSessionSource,
  completeCreationSession,
  createCreationSession,
  observeCreationSessionSource,
  refreshCreationSessionSource,
  updateCreationSession,
  type CreationResult,
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
}

export class CreationSessionApplication {
  constructor(private readonly repository: CreationSessionRepository, private readonly graphId: string) {}

  create(input: { targetType: CreationSessionTargetType; primarySource: CreationSessionSource; userTitle?: string; sessionId?: string; idempotencyKey: string }, at = new Date()): CreationSessionWriteResult {
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
    const current = this.required(input.sessionId);
    const session = updateCreationSession(current, input.patch, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "UpdateCreationSession");
  }

  addSource(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; source: CreationSessionSource }, at = new Date()): CreationSessionWriteResult {
    const current = this.required(input.sessionId);
    const session = addCreationSessionSource(current, input.source, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "AddCreationSessionSource");
  }

  observeSource(input: { sessionId: string; sourceId: string; expectedVersion: number; idempotencyKey: string; latestKnownHash?: string; availability: CreationSessionSource["availability"] }, at = new Date()): CreationSessionWriteResult {
    const current = this.required(input.sessionId);
    const session = observeCreationSessionSource(current, input.sourceId, { ...(input.latestKnownHash ? { latestKnownHash: input.latestKnownHash } : {}), availability: input.availability }, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "ObserveCreationSessionSource");
  }

  refreshSource(input: { sessionId: string; sourceId: string; expectedVersion: number; idempotencyKey: string; capture: CreationSourceCapture }, at = new Date()): CreationSessionWriteResult {
    const current = this.required(input.sessionId);
    const session = refreshCreationSessionSource(current, input.sourceId, input.capture, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "RefreshCreationSessionSource");
  }

  abandon(input: { sessionId: string; expectedVersion: number; idempotencyKey: string }, at = new Date()): CreationSessionWriteResult {
    const current = this.required(input.sessionId);
    const session = abandonCreationSession(current, input.expectedVersion, at);
    return this.repository.saveCreationSession(session, input.expectedVersion, input.idempotencyKey, "AbandonCreationSession");
  }

  complete(input: { sessionId: string; expectedVersion: number; idempotencyKey: string; result: CreationResult }, at = new Date()): CreationSessionWriteResult {
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
