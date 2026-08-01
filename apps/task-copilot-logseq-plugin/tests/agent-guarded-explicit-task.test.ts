import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDecision, AgentExecutionRevalidationInput } from "@task-copilot/domain";
import type { ServiceStoredProposal } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import {
  executeGuardedExplicitTask,
  guardedExplicitTaskProposalId,
  undoGuardedExplicitTask,
} from "../src/agent-guarded-explicit-task.ts";

const source = "[Task] 整理 RHCSA 容器资料";
const sourceHash = checksum(source);

function decision(): AgentDecision {
  return {
    graphId: "graph-guarded",
    sourceRoot: { kind: "BLOCK", externalId: "block-guarded", durableOrigin: { kind: "BLOCK_UUID", value: "block-guarded" } },
    sourceSnapshotHash: "a".repeat(64),
    outcome: "CREATE_OBJECT",
    rule: { id: "EXPLICIT-TASK-01", displayName: "明确任务标记", skillName: "agent-decision-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
    riskRoute: "AUTO_APPLY",
    executionStatus: "NOT_EXECUTED",
    evidenceSummary: "明确 Task，单对象且可逆。",
    evidenceRefs: ["source:block-guarded", "rule:EXPLICIT-TASK-01"],
    counterSignals: [], closestAlternative: {},
    context: { tier: "LOCAL", truncated: false, omittedSections: [], estimatedInputTokens: 240 },
    threadId: "thread-guarded", decisionId: "decision-guarded", revision: 2,
    observedAt: "2026-08-02T09:00:00.000Z", createdAt: "2026-08-02T09:00:00.000Z", updatedAt: "2026-08-02T09:00:00.000Z",
  };
}

function proposal(current = decision()): ServiceStoredProposal {
  return {
    updatedAt: "2026-08-02T09:00:01.000Z",
    files: { proposalMd: "# Agent 明确 Task", proposalJson: "{}" },
    proposal: {
      proposalId: guardedExplicitTaskProposalId(current), schemaVersion: "v2", title: "创建明确 Task",
      context: `Agent Decision ${current.decisionId} revision ${current.revision}`,
      understanding: current.evidenceSummary, objective: "使用现有 Proposal/Semantic Commit 链建立 Task。",
      logic: "Commit 前重验来源；正文保持不变。", finalPreview: source,
      unresolvedQuestions: [], source: { kind: "local_llm", provider: "internal-agent-governance", skillVersion: current.rule.skillVersion },
      scope: { read: [], modify: [{ kind: "BLOCK", id: current.sourceRoot.externalId, version: 7, hash: sourceHash }] },
      preconditions: ["来源 hash、Rule 授权、Skill 版本与影响范围仍匹配"],
      groups: [{
        groupId: "agent-explicit-task", explanation: "只创建一个 Task 与 Primary Anchor。", risk: "LOW", independentlyAcceptable: true, dependencies: [],
        textPatches: [{ blockUuid: current.sourceRoot.externalId, beforeText: source, afterText: source, beforeHash: sourceHash, afterHash: sourceHash }],
        semanticOperations: [{ operationId: "agent-create-explicit-task", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: current.sourceRoot.externalId, version: 7, hash: sourceHash }, summary: "创建 Task", payload: { objectType: "TASK", text: "整理 RHCSA 容器资料" }, preconditions: [] }],
        disposition: "PENDING",
      }],
      status: "READY", createdAt: "2026-08-02T09:00:01.000Z",
    },
  };
}

function revalidation(overrides: Partial<AgentExecutionRevalidationInput> = {}): AgentExecutionRevalidationInput {
  return {
    sourceExists: true, expectedSourceHash: "a".repeat(64), currentSourceHash: "a".repeat(64),
    targetRequired: false, targetExists: false, anchorStatus: "NOT_REQUIRED",
    ruleAuthorizationExists: true, rulePaused: false, skillVersionValid: true,
    runtimeModeAllowsWrite: true, globalWritesPaused: false, degraded: false,
    expectedScope: ["block-guarded"], currentScope: ["block-guarded"], equivalentActionCompleted: false,
    ...overrides,
  };
}

test("Guarded representative path remains zero-write until every independent activation gate passes", async () => {
  let applyCalls = 0;
  for (const gates of [
    { runtimeMode: "EXPERIMENT" as const, guardedAutomationEnabled: true, shadowEvidenceGateSatisfied: true, explicitUserAuthorization: true },
    { runtimeMode: "GUARDED" as const, guardedAutomationEnabled: false, shadowEvidenceGateSatisfied: true, explicitUserAuthorization: true },
    { runtimeMode: "GUARDED" as const, guardedAutomationEnabled: true, shadowEvidenceGateSatisfied: false, explicitUserAuthorization: true },
    { runtimeMode: "GUARDED" as const, guardedAutomationEnabled: true, shadowEvidenceGateSatisfied: true, explicitUserAuthorization: false },
  ]) {
    const result = await executeGuardedExplicitTask({ ...gates, decision: decision(), proposal: proposal(), revalidation: revalidation(), client: {} as never, host: {} as never }, {
      apply: async () => { applyCalls += 1; return { status: "COMPLETED", semanticCommitId: "must-not-run" }; },
      undo: async () => { throw new Error("must not undo"); },
    });
    assert.equal(result.status, "DISABLED");
  }
  assert.equal(applyCalls, 0);
});

test("Guarded path blocks stale, paused, expanded-scope and equivalent user actions before Proposal acceptance", async () => {
  let applyCalls = 0;
  for (const change of [
    { currentSourceHash: "c".repeat(64) },
    { rulePaused: true },
    { currentScope: ["block-guarded", "other-object"] },
    { equivalentActionCompleted: true },
  ]) {
    const result = await executeGuardedExplicitTask({ runtimeMode: "GUARDED", guardedAutomationEnabled: true, shadowEvidenceGateSatisfied: true, explicitUserAuthorization: true, decision: decision(), proposal: proposal(), revalidation: revalidation(change), client: {} as never, host: {} as never }, {
      apply: async () => { applyCalls += 1; return { status: "COMPLETED", semanticCommitId: "must-not-run" }; },
      undo: async () => { throw new Error("must not undo"); },
    });
    assert.notEqual(result.status, "COMPLETED");
  }
  assert.equal(applyCalls, 0);
});

test("an exact explicit Task delegates once to the existing Proposal/Semantic Commit chain", async () => {
  const current = decision();
  const calls: string[] = [];
  const result = await executeGuardedExplicitTask({
    runtimeMode: "GUARDED", guardedAutomationEnabled: true, shadowEvidenceGateSatisfied: true, explicitUserAuthorization: true,
    decision: current, proposal: proposal(current), revalidation: revalidation(), client: {} as never, host: {} as never,
  }, {
    apply: async (_client, _host, record, traceId) => {
      calls.push(`${record.proposal.proposalId}:${traceId}`);
      return { status: "COMPLETED", semanticCommitId: "proposal-commit:guarded", objectId: "task-guarded" };
    },
    undo: async () => { throw new Error("not yet"); },
  });
  assert.deepEqual(result, { status: "COMPLETED", decisionId: current.decisionId, semanticCommitId: "proposal-commit:guarded", objectId: "task-guarded", undoAvailable: true });
  assert.equal(calls.length, 1);
});

test("Guarded refuses a mismatched Decision link, source-writing patch or non-Task operation", async () => {
  const variants = [proposal(), proposal(), proposal()];
  variants[0]!.proposal.proposalId = "proposal_agent_wrong";
  variants[1]!.proposal.groups[0]!.textPatches[0]!.afterText = "改写正文";
  variants[2]!.proposal.groups[0]!.semanticOperations[0]!.payload.objectType = "MINI_PROJECT";
  for (const record of variants) {
    await assert.rejects(() => executeGuardedExplicitTask({ runtimeMode: "GUARDED", guardedAutomationEnabled: true, shadowEvidenceGateSatisfied: true, explicitUserAuthorization: true, decision: decision(), proposal: record, revalidation: revalidation(), client: {} as never, host: {} as never }), /Guarded|Proposal|Task|正文|匹配/i);
  }
});

test("Guarded Undo delegates only the completed Semantic Commit to the existing inverse chain", async () => {
  const calls: string[] = [];
  const result = await undoGuardedExplicitTask({ decisionId: "decision-guarded", semanticCommitId: "proposal-commit:guarded", client: {} as never, host: {} as never }, {
    apply: async () => { throw new Error("not apply"); },
    undo: async (_client, _host, commitId, traceId) => {
      calls.push(`${commitId}:${traceId}`);
      return { status: "COMPLETED", undoSemanticCommitId: "undo:proposal-commit:guarded", objectId: "task-guarded" };
    },
  });
  assert.deepEqual(result, { status: "COMPLETED", decisionId: "decision-guarded", originalSemanticCommitId: "proposal-commit:guarded", undoSemanticCommitId: "undo:proposal-commit:guarded", objectId: "task-guarded" });
  assert.equal(calls.length, 1);
});
