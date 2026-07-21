import assert from "node:assert/strict";
import test from "node:test";

import { createV2Candidate, linkV2CandidateProposal, setV2CandidateDisposition } from "../src/v2-candidate.ts";

const now = new Date("2026-07-21T16:00:00.000Z");

test("Candidate validates machine identity and keeps source text outside Domain state", () => {
  const candidate = createV2Candidate({ candidateId: "cand-1", sourceAnchorId: "block-1", sourceVersion: "7:abcd1234", candidateKind: "WORK_ITEM", reason: "显式治理标识", suggestion: "正式化为 Task" }, now);
  assert.equal(candidate.disposition, "PENDING");
  assert.equal("sourceText" in candidate, false);
  assert.throws(() => createV2Candidate({ ...candidate, candidateId: " " }, now), /candidate_id/);
});

test("Candidate dispositions preserve later, ordinary-content, suppression and resolved semantics", () => {
  const candidate = createV2Candidate({ candidateId: "cand-1", sourceAnchorId: "block-1", sourceVersion: "7:abcd1234", candidateKind: "WORK_ITEM", reason: "显式治理标识", suggestion: "正式化为 Task" }, now);
  const later = setV2CandidateDisposition(candidate, "LATER", { reason: "等待上下文", deferredUntil: "2026-07-22T16:00:00.000Z" }, now);
  assert.equal(later.deferredUntil, "2026-07-22T16:00:00.000Z");
  assert.equal(setV2CandidateDisposition(candidate, "DISMISSED", { reason: "保留普通内容" }, now).disposition, "DISMISSED");
  assert.equal(setV2CandidateDisposition(candidate, "NO_MORE_LIKE_THIS", { reason: "不再这样建议" }, now).disposition, "NO_MORE_LIKE_THIS");
  const resolved = setV2CandidateDisposition(candidate, "RESOLVED", { activeProposalId: "prop-1" }, now);
  assert.equal(resolved.activeProposalId, "prop-1");
  assert.throws(() => setV2CandidateDisposition(resolved, "DISMISSED", { reason: "回退" }, now), /不能重新处置/);
  assert.throws(() => setV2CandidateDisposition(candidate, "LATER", { reason: "等待", deferredUntil: "2026-07-20T00:00:00.000Z" }, now), /未来复查/);
  const linked = linkV2CandidateProposal(candidate, "prop-active", now);
  assert.throws(() => setV2CandidateDisposition(linked, "DISMISSED", { reason: "关闭" }, now), /当前 Proposal/);
});
