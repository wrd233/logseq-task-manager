import assert from "node:assert/strict";
import test from "node:test";

import { V2CandidateApplication, type V2CandidateRepository } from "../src/v2-candidate.ts";
import type { V2Candidate, V2Proposal, V2ProposalFiles } from "@task-copilot/domain";

class MemoryCandidates implements V2CandidateRepository {
  values = new Map<string, V2Candidate>();
  receipts = new Map<string, V2Candidate>();
  upsertCandidate(candidate: V2Candidate, key: string) { const replay = this.receipts.get(key); if (replay) return { candidate: replay, replayed: true }; this.values.set(candidate.candidateId, candidate); this.receipts.set(key, candidate); return { candidate, replayed: false }; }
  getCandidate(id: string) { return this.values.get(id); }
  listCandidates() { return [...this.values.values()]; }
  updateCandidate(candidate: V2Candidate, expected: string, key: string) { const replay = this.receipts.get(key); if (replay) return { candidate: replay, replayed: true }; if (this.values.get(candidate.candidateId)?.updatedAt !== expected) throw new Error("stale"); this.values.set(candidate.candidateId, candidate); this.receipts.set(key, candidate); return { candidate, replayed: false }; }
  submitCandidateProposal(candidate: V2Candidate, proposal: V2Proposal, _files: V2ProposalFiles, expected: string, key: string) { const result = this.updateCandidate(candidate, expected, key); return { ...result, proposal }; }
}

const envelope = (key: string) => ({ actor: "test", traceId: `trace-${key}`, idempotencyKey: key });

test("Candidate Application discovers, disposes and links exactly one current Proposal", async () => {
  const repository = new MemoryCandidates();
  const app = new V2CandidateApplication(repository);
  const discovered = await app.discover({ candidateId: "cand-1", sourceAnchorId: "block-1", sourceVersion: "7:abcd1234", candidateKind: "WORK_ITEM", reason: "显式标识", suggestion: "正式化" }, envelope("discover"), new Date("2026-07-21T16:00:00Z"));
  const linked = await app.linkProposal("cand-1", "prop-1", discovered.candidate.updatedAt, envelope("link"), new Date("2026-07-21T16:01:00Z"));
  assert.equal(linked.candidate.activeProposalId, "prop-1");
  await assert.rejects(() => app.linkProposal("cand-1", "prop-2", linked.candidate.updatedAt, envelope("parallel")), /平行副本/);
  const resolved = await app.resolve("cand-1", "prop-1", linked.candidate.updatedAt, envelope("resolve"), new Date("2026-07-21T16:02:00Z"));
  assert.equal(resolved.candidate.disposition, "RESOLVED");
});

test("Candidate Application keeps ordinary-content and later dispositions explicit", async () => {
  const repository = new MemoryCandidates();
  const app = new V2CandidateApplication(repository);
  const discovered = await app.discover({ candidateId: "cand-2", sourceAnchorId: "block-2", sourceVersion: "8:bcde2345", candidateKind: "UPDATE", reason: "用户加入待整理", suggestion: "检查是否更新对象" }, envelope("discover-2"), new Date("2026-07-21T16:00:00Z"));
  const later = await app.setDisposition("cand-2", "LATER", { reason: "等待信息", deferredUntil: "2026-07-22T16:00:00Z" }, discovered.candidate.updatedAt, envelope("later"), new Date("2026-07-21T16:01:00Z"));
  assert.equal(later.candidate.disposition, "LATER");
});
