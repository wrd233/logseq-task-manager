import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";
import type { V2ManagedObject } from "@task-copilot/domain";

import {
  projectPluginCommitNarration,
  projectPluginObjectNarrations,
  projectPluginProposalNarration,
  projectPluginSystemNarration,
} from "../src/status-narration-runtime.ts";
import type { RuntimeDiagnosticsSnapshot } from "../src/runtime-diagnostics.ts";

const observedAt = "2026-07-24T12:00:00.000Z";

function snapshot(): RuntimeDiagnosticsSnapshot {
  return {
    plugin_id: "task-copilot-personal-mvp",
    plugin_version: "0.1.0",
    runtime_status: "READY",
    store_status: "READY",
    store_schema: "v12",
    current_graph: "logseq",
    logseq_version: "0.10.15",
    feature_flags: {},
    service_connection: {
      status: "READY",
      formal_writes_available: true,
      graph_editing_available: true,
      capabilities: { formalWrites: true, migration: true, provider: false, backup: true },
    },
    recovery_state: "clean",
    stages: [],
    pending_semantic_commits: 0,
    recovery_required_commits: 1,
    source_anchor_conflicts: 2,
    explicit_sync: { pending: 3, transportReady: true, reconciliationRequired: true },
  };
}

function proposal(): ServiceStoredProposal {
  return {
    updatedAt: observedAt,
    files: { proposalMd: "# proposal", proposalJson: "{}" },
    proposal: {
      proposalId: "proposal-1",
      schemaVersion: "v2",
      title: "更新当前接口",
      context: "context",
      understanding: "understanding",
      objective: "objective",
      logic: "logic",
      finalPreview: "preview",
      unresolvedQuestions: [],
      source: { kind: "user" },
      scope: { read: [], modify: [{ kind: "OBJECT", id: "project-1", version: 1 }] },
      preconditions: [],
      groups: [{
        groupId: "group-1",
        explanation: "update",
        risk: "HIGH",
        independentlyAcceptable: true,
        dependencies: [],
        textPatches: [],
        semanticOperations: [],
        disposition: "ACCEPTED",
      }],
      status: "ACCEPTED",
      createdAt: observedAt,
    },
  };
}

function commit(proposalId = "proposal-1"): ServiceSemanticCommit {
  return {
    semanticCommitId: `commit:${proposalId}`,
    proposalId,
    status: "PENDING",
    beforeStateChecksum: "before",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

test("runtime adapter keeps Application system priority and deterministic provenance", () => {
  const narration = projectPluginSystemNarration(snapshot(), observedAt);
  assert.equal(narration.conclusion, "有 1 项修改需要恢复");
  assert.equal(narration.source.ruleId, "system-commit-recovery-required");
  assert.equal(narration.source.kind, "DETERMINISTIC_RULE");
});

test("runtime adapter only supplies matching commits to Proposal narration", () => {
  const narration = projectPluginProposalNarration(
    proposal(),
    [commit(), commit("proposal-other")],
    observedAt,
  );
  assert.equal(narration.conclusion, "这次修改尚未完成");
  assert.equal(narration.source.ruleId, "commit-pending");
  assert.deepEqual(narration.evidenceScope.refs, ["commit:commit:proposal-1", "proposal:proposal-1"]);
});

test("commit adapter does not infer Undo eligibility from a completed status", () => {
  const completed = { ...commit(), status: "COMPLETED" as const };
  const narration = projectPluginCommitNarration(completed, observedAt);
  assert.equal(narration.conclusion, "这次修改已经应用");
  assert.equal(narration.nextActionEligible, false);
  assert.match(narration.unknowns.join(""), /安全撤销条件/);
});

test("object adapter resolves exact blocker evidence and preserves version for UI revalidation", () => {
  const blocker: V2ManagedObject = {
    objectId: "task-blocker",
    objectType: "TASK",
    version: 4,
    lifecycle: "COMPLETED",
    condition: { kind: "ACTIONABLE" },
    text: "恢复供应链",
    sourceOrCreationEvent: "test",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  const blocked: V2ManagedObject = {
    objectId: "task-blocked",
    objectType: "TASK",
    version: 7,
    lifecycle: "OPEN",
    condition: {
      kind: "BLOCKED",
      reason: "等待供应链恢复",
      blockerObjectId: blocker.objectId,
    },
    text: "恢复发布",
    sourceOrCreationEvent: "test",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  const projected = projectPluginObjectNarrations([blocked, blocker], observedAt);

  assert.equal(projected["task-blocked"]?.objectVersion, 7);
  assert.equal(projected["task-blocked"]?.narration.conclusion, "关联阻塞项已结束，需要重新判断是否可以继续");
  assert.deepEqual(projected["task-blocked"]?.narration.nextAction, {
    intent: "REVIEW_BLOCKER",
    label: "确认阻塞是否已解除",
    targetObjectId: "task-blocked",
  });
});

test("object adapter rejects duplicate identity instead of selecting one version", () => {
  const object: V2ManagedObject = {
    objectId: "task-duplicate",
    objectType: "TASK",
    version: 1,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "重复",
    sourceOrCreationEvent: "test",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  assert.throws(
    () => projectPluginObjectNarrations([object, { ...object, version: 2 }], observedAt),
    /Duplicate Object identity/,
  );
});
