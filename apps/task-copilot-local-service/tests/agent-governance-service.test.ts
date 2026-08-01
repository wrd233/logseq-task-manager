import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalServiceClient } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { LOCAL_SERVICE_PROTOCOL_VERSION, startLocalService } from "../src/service.ts";

test("authenticated observation crosses the shared Graph bridge and persists only Shadow governance state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-service-runtime-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-agent-service-runtime",
    token: "agent-runtime-service-token-24-chars",
    agentGovernanceProvider: {
      completeStructured: async () => ({
        value: {
          schemaVersion: "agent-decision-output-v1",
          outcome: "CREATE_OBJECT",
          targetObjectIds: [],
          ruleId: "EXPLICIT-TASK-01",
          evidenceSummary: "明确任务标记；当前同源正式状态为空。",
          evidenceRefs: ["source:agent-service-source", "rule:EXPLICIT-TASK-01"],
          counterSignals: [],
          closestAlternative: { outcome: "CREATE_CANDIDATE", reason: "若重复检查不充分则转人工。" },
          needsMoreContext: false,
          needsHuman: false,
        },
        metadata: { model: "configured-model", promptTokens: 100, completionTokens: 40, durationMs: 5, attempts: 1 },
      }),
    },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = new LocalServiceClient({ protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION, url: service.url, token: service.token, pid: process.pid, createdAt: new Date().toISOString() });
  const before = { objects: await client.listObjects(), candidates: await client.listCandidates(), proposals: await client.listProposals() };

  const claimed = client.claimGraphReadRequest();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const observation = client.observeAgentGovernanceChange({ changedBlockId: "agent-service-source", changedBlockCount: 1 });
  const request = await claimed;
  assert.equal(request?.kind, "BLOCK");
  if (!request) throw new Error("expected Agent Graph read request");
  const blocks = [{ uuid: "agent-service-source", content: "[Task] 整理 RHCSA 资料", contentHash: checksum("[Task] 整理 RHCSA 资料"), relation: "ROOT" as const, depth: 0, pageName: "2026-08-02" }];
  const resolved = { kind: "BLOCK" as const, id: request.target };
  const snapshot = { kind: "BLOCK" as const, requestedTarget: request.target, resolved, blocks, truncated: false, readAt: "2026-08-02T10:00:00.000Z", scopeHash: checksum({ kind: "BLOCK", resolved, blocks, truncated: false }) };
  await client.completeGraphReadRequest({ requestId: request.requestId, status: "FOUND", snapshot });
  const result = await observation;
  assert.equal(result.status, "RECORDED");
  assert.equal(result.decision?.riskRoute, "SHADOW");
  assert.deepEqual({ objects: await client.listObjects(), candidates: await client.listCandidates(), proposals: await client.listProposals() }, before);
  assert.equal((await client.listAgentDecisions({ limit: 10 })).length, 1);
  assert.equal((await client.listAgentRuleAuthorizations()).length, 6);

  if (!result.decision) throw new Error("expected persisted Decision");
  const feedbackCommand = {
    feedback: { rating: "WRONG" as const, correctionType: "SHOULD_KEEP_ORDINARY" as const, action: "PAUSE_RULE_AUTOMATION" as const },
    traceId: "trace-agent-feedback-1",
    idempotencyKey: "agent-feedback-service-1",
  };
  const feedback = await client.recordAgentFeedback(result.decision.decisionId, feedbackCommand);
  assert.equal(feedback.event.eventType, "USER_FEEDBACK_ADDED");
  assert.equal(feedback.authorization?.paused, true);
  assert.equal((await client.recordAgentFeedback(result.decision.decisionId, feedbackCommand)).replayed, true);
  const bulk = await client.recordAgentBulkFeedback({
    decisionIds: [result.decision.decisionId],
    feedback: { rating: "MOSTLY_CORRECT", tendency: "TOO_AGGRESSIVE", action: "RECORD_RULE_FEEDBACK" },
    traceId: "trace-agent-bulk-feedback-1",
    idempotencyKey: "agent-bulk-feedback-service-1",
  });
  assert.equal(bulk.groups.length, 1);
  assert.equal(bulk.results[0]?.event.payload.rating, "MOSTLY_CORRECT");
  assert.equal((await client.listAgentDecisionEvents(result.decision.threadId)).filter(({ eventType }) => eventType === "USER_FEEDBACK_ADDED").length, 2);
  const skillExport = await client.exportAgentSkillFeedback(60);
  assert.equal(skillExport.manifest.kind, "SKILL_FEEDBACK");
  assert.match(skillExport.files["README.md"]!, /Feedback：2/);

  const weakClaim = client.claimGraphReadRequest();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const weakObservation = client.observeAgentGovernanceChange({ changedBlockId: "agent-weak-source", changedBlockCount: 1 });
  const weakRequest = await weakClaim;
  if (!weakRequest) throw new Error("expected weak-signal Graph read request");
  const weakBlocks = [{ uuid: "agent-weak-source", content: "以后可能需要整理告警趋势。", contentHash: checksum("以后可能需要整理告警趋势。"), relation: "ROOT" as const, depth: 0, pageName: "2026-08-02" }];
  const weakResolved = { kind: "BLOCK" as const, id: weakRequest.target };
  await client.completeGraphReadRequest({
    requestId: weakRequest.requestId,
    status: "FOUND",
    snapshot: { kind: "BLOCK", requestedTarget: weakRequest.target, resolved: weakResolved, blocks: weakBlocks, truncated: false, readAt: "2026-08-02T10:05:00.000Z", scopeHash: checksum({ kind: "BLOCK", resolved: weakResolved, blocks: weakBlocks, truncated: false }) },
  });
  assert.equal((await weakObservation).gateAction, "UPDATE_REVIEW_SIGNAL");

  const reviewClaim = client.claimGraphReadRequest();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const reviewExportPromise = client.exportAgentReviewEvidence(60);
  const reviewRequest = await reviewClaim;
  if (!reviewRequest) throw new Error("expected Review export Graph read request");
  await client.completeGraphReadRequest({ requestId: reviewRequest.requestId, status: "NOT_FOUND" });
  const reviewExport = await reviewExportPromise;
  assert.equal(reviewExport.manifest.kind, "REVIEW_EVIDENCE");
  assert.match(reviewExport.files["README.md"]!, /来源缺失：1/);

  const invalid = await fetch(new URL("agent/observations", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ changedBlockId: "agent-service-source", changedBlockCount: 0, authority: "AUTO_APPLY" }),
  });
  assert.equal(invalid.status, 400);

  const invalidFeedback = await fetch(new URL(`agent/decisions/${encodeURIComponent(result.decision.decisionId)}/feedback`, service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...feedbackCommand, undo: true }),
  });
  assert.equal(invalidFeedback.status, 400, "Feedback endpoint rejects any implicit Undo field");
});
