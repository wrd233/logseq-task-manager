import assert from "node:assert/strict";
import test from "node:test";

import { CreationSessionApplication, type CreationSessionMaterializationResult, type CreationSessionRepository, type CreationSessionWriteResult } from "../src/index.ts";
import type { CreationSession, CreationSessionStatus, CreationSessionSource } from "@task-copilot/domain";

class MemoryCreationSessions implements CreationSessionRepository {
  sessions = new Map<string, CreationSession>();
  receipts = new Map<string, CreationSessionWriteResult>();
  getCreationSession(id: string): CreationSession | undefined { return this.sessions.get(id); }
  listCreationSessions(statuses?: readonly CreationSessionStatus[]): CreationSession[] { return [...this.sessions.values()].filter((session) => !statuses || statuses.includes(session.status)); }
  replayCreationSessionWrite(key: string): CreationSessionWriteResult | undefined { const replay = this.receipts.get(key); return replay ? { ...replay, replayed: true } : undefined; }
  saveCreationSession(session: CreationSession, expectedVersion: number, key: string): CreationSessionWriteResult {
    const replay = this.receipts.get(key);
    if (replay) return { ...replay, replayed: true };
    assert.equal(this.sessions.get(session.sessionId)?.version ?? 0, expectedVersion);
    const result = { session, replayed: false };
    this.sessions.set(session.sessionId, session);
    this.receipts.set(key, result);
    return result;
  }
  replayCreationSessionMaterialization(): CreationSessionMaterializationResult | undefined { return undefined; }
  commitCreationSessionMaterialization(): CreationSessionMaterializationResult { throw new Error("not used"); }
  commitCreationSessionMaterializationUndo(): CreationSessionMaterializationResult { throw new Error("not used"); }
}

const blank = (): CreationSessionSource => ({ sourceId: "primary", role: "PRIMARY", kind: "BLANK", captures: [{ captureId: "capture-blank", reason: "SESSION_START", snapshotHash: "blank", content: "", hierarchy: [], capturedAt: "2026-08-02T06:00:00.000Z" }], currentCaptureId: "capture-blank", latestKnownHash: "blank", availability: "AVAILABLE" });

test("application creates, lists, updates and idempotently abandons sessions", () => {
  const repository = new MemoryCreationSessions();
  const application = new CreationSessionApplication(repository, "graph-one");
  const created = application.create({ targetType: "PROJECT", primarySource: blank(), sessionId: "creation-app", idempotencyKey: "create-key" }, new Date("2026-08-02T06:00:00.000Z"));
  assert.equal(created.session.version, 1);
  assert.equal(application.list(["DISCUSSING"]).length, 1);
  const updated = application.update({ sessionId: "creation-app", expectedVersion: 1, idempotencyKey: "update-key", patch: { userTitle: "监控治理项目" } }, new Date("2026-08-02T07:00:00.000Z"));
  assert.equal(updated.session.userTitle, "监控治理项目");
  const abandoned = application.abandon({ sessionId: "creation-app", expectedVersion: 2, idempotencyKey: "abandon-key" }, new Date("2026-08-02T08:00:00.000Z"));
  const replay = application.abandon({ sessionId: "creation-app", expectedVersion: 2, idempotencyKey: "abandon-key" }, new Date("2026-08-02T09:00:00.000Z"));
  assert.equal(abandoned.session.status, "ABANDONED");
  assert.equal(replay.replayed, true);
  assert.equal(replay.session.updatedAt, abandoned.session.updatedAt);
});
