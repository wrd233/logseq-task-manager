import test from "node:test";
import assert from "node:assert/strict";

import { reviewV2ProposalGroups, type CreationSession } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import { buildCreationSessionProposal, canonicalCreationMiniSiblingOrder, creationSessionMiniTreeHash, creationSessionMiniTreeHashLegacyOrder, planAcceptedCreationSession, planCreationSessionMiniGraph, verifyCreationSessionCommitPlan } from "../src/index.ts";

const at = "2026-08-02T09:00:00.000Z";
const rootUuid = "11111111-1111-4111-8111-111111111111";
const childUuid = "22222222-2222-4222-8222-222222222222";
const createdUuid = "33333333-3333-4333-8333-333333333333";

function miniSession(): CreationSession {
  const rootText = "**[MiniProject]** 发布稳定版本 #MiniProject";
  const childText = "**目标**：完成可恢复发布";
  const snapshotHash = checksum(`${rootText}\n${childText}`);
  return {
    sessionId: "creation-session-1",
    graphId: "graph-a",
    targetType: "MINI_PROJECT",
    status: "PREVIEW_READY",
    version: 4,
    suggestedObjectTitle: "发布稳定版本",
    sources: [{
      sourceId: "source-primary",
      role: "PRIMARY",
      kind: "BLOCK_SUBTREE",
      externalId: rootUuid,
      captures: [{
        captureId: "capture-pre-commit",
        reason: "PRE_COMMIT",
        snapshotHash,
        content: `${rootText}\n${childText}`,
        hierarchy: [
          { nodeId: rootUuid, text: rootText, order: 0, depth: 0, relation: "ROOT" },
          { nodeId: childUuid, text: childText, parentNodeId: rootUuid, order: 0, depth: 1, relation: "CHILD" },
        ],
        capturedAt: at,
      }],
      currentCaptureId: "capture-pre-commit",
      latestKnownHash: snapshotHash,
      availability: "AVAILABLE",
    }],
    rounds: [],
    consensus: [],
    draftRevisions: [{
      revisionId: "draft-adopted",
      generationIds: [],
      reason: "ADOPTED",
      nodes: [
        { nodeId: "draft-root", semanticKey: "root", text: rootText, order: 0, nodeType: "BLOCK", provenance: "USER_CONFIRMED", sourceBlockUuid: rootUuid, operation: "KEEP", userEdited: false, confirmed: true, evidenceRefs: ["capture-pre-commit"] },
        { nodeId: "draft-goal", semanticKey: "goal", text: childText, parentNodeId: "draft-root", order: 0, nodeType: "BLOCK", provenance: "USER_CONFIRMED", sourceBlockUuid: childUuid, operation: "KEEP", userEdited: false, confirmed: true, evidenceRefs: ["capture-pre-commit"] },
        { nodeId: "draft-todo", semanticKey: "next", text: "TODO 执行恢复演练", parentNodeId: "draft-root", order: 1, nodeType: "TODO", provenance: "AGENT_SYNTHESIS", operation: "CREATE", userEdited: false, confirmed: true, evidenceRefs: ["capture-pre-commit"] },
      ],
      conflicts: [],
      unusedMaterials: [],
      warnings: [],
      maturity: { level: "READY", missing: [] },
      adopted: true,
      final: false,
      createdAt: at,
    }],
    currentDraftRevisionId: "draft-adopted",
    placementPlan: { kind: "SOURCE_BLOCK_IN_PLACE", sourceBlockUuid: rootUuid },
    events: [{ eventId: "event-1", kind: "SESSION_CREATED", occurredAt: at, summary: "创建 MiniProject 会话" }],
    createdAt: at,
    updatedAt: at,
  };
}

test("Creation Session proposal freezes a pre-commit MiniProject tree into one HIGH review group", () => {
  const proposal = buildCreationSessionProposal({
    proposalId: "proposal-session-1",
    session: miniSession(),
    objectId: "mini-session-1",
    createdBlockUuids: { "draft-todo": createdUuid },
    createdAt: at,
  });
  assert.equal(proposal.status, "READY");
  assert.equal(proposal.groups.length, 1);
  assert.equal(proposal.groups[0]?.risk, "HIGH");
  assert.equal(proposal.groups[0]?.semanticOperations[0]?.kind, "CREATE_OBJECT");
  assert.deepEqual(proposal.scope.modify, [{ kind: "BLOCK", id: rootUuid, hash: checksum("**[MiniProject]** 发布稳定版本 #MiniProject") }]);

  const accepted = reviewV2ProposalGroups(proposal, { "create-from-session": { disposition: "ACCEPTED", highImpactConfirmed: true } });
  const plan = planAcceptedCreationSession(accepted);
  assert.equal(plan.sessionId, "creation-session-1");
  assert.equal(plan.expectedSessionVersion, 4);
  assert.equal(plan.nodes[2]?.blockUuid, createdUuid);
  assert.equal(plan.placement.kind, "SOURCE_BLOCK_IN_PLACE");
  assert.equal(verifyCreationSessionCommitPlan(miniSession(), plan).sessionId, plan.sessionId);
  const graphPlan = planCreationSessionMiniGraph(miniSession(), plan);
  assert.equal(graphPlan.mode, "IN_PLACE");
  assert.equal(graphPlan.rootBlockUuid, rootUuid);
  assert.deepEqual(graphPlan.beforeNodes.map(({ blockUuid, order }) => ({ blockUuid, order })), [{ blockUuid: rootUuid, order: 0 }, { blockUuid: childUuid, order: 0 }]);
  assert.equal(graphPlan.afterNodes[2]?.parentBlockUuid, rootUuid);
  assert.equal(graphPlan.afterHash, creationSessionMiniTreeHash(rootUuid, graphPlan.afterNodes));
  const changed = miniSession();
  changed.draftRevisions[0]!.nodes[0]!.text = "用户在审阅后改了根标题";
  assert.throws(() => verifyCreationSessionCommitPlan(changed, plan), /Draft Tree/);
});

test("canonical sibling order makes provider one-based Draft orders match zero-based runtime read-back", () => {
  const root = { blockUuid: rootUuid, text: "**[MiniProject]** 标题 #MiniProject", order: 0, contentHash: checksum("**[MiniProject]** 标题 #MiniProject"), operation: "CREATE" as const };
  const oneBased = [
    root,
    { blockUuid: childUuid, text: "子一", parentBlockUuid: rootUuid, order: 1, contentHash: checksum("子一"), operation: "CREATE" as const },
    { blockUuid: createdUuid, text: "子二", parentBlockUuid: rootUuid, order: 2, contentHash: checksum("子二"), operation: "CREATE" as const },
  ];
  const readBack = [
    root,
    { blockUuid: childUuid, text: "子一", parentBlockUuid: rootUuid, order: 0, contentHash: checksum("子一"), operation: "CREATE" as const },
    { blockUuid: createdUuid, text: "子二", parentBlockUuid: rootUuid, order: 1, contentHash: checksum("子二"), operation: "CREATE" as const },
  ];
  assert.equal(canonicalCreationMiniSiblingOrder(oneBased).map(({ order }) => order).join(","), "0,0,1");
  assert.equal(creationSessionMiniTreeHash(rootUuid, oneBased), creationSessionMiniTreeHash(rootUuid, readBack));
  assert.notEqual(creationSessionMiniTreeHashLegacyOrder(rootUuid, oneBased), creationSessionMiniTreeHash(rootUuid, oneBased));
  const swapped = [
    root,
    { blockUuid: createdUuid, text: "子二", parentBlockUuid: rootUuid, order: 1, contentHash: checksum("子二"), operation: "CREATE" as const },
    { blockUuid: childUuid, text: "子一", parentBlockUuid: rootUuid, order: 2, contentHash: checksum("子一"), operation: "CREATE" as const },
  ];
  assert.notEqual(creationSessionMiniTreeHash(rootUuid, oneBased), creationSessionMiniTreeHash(rootUuid, swapped));
});

test("Creation Session proposal fails closed without a fresh PRE_COMMIT capture", () => {
  const session = miniSession();
  session.sources[0]!.captures[0]!.reason = "DRAFT_GENERATION";
  assert.throws(() => buildCreationSessionProposal({ proposalId: "proposal-stale", session, objectId: "mini-stale", createdBlockUuids: { "draft-todo": createdUuid }, createdAt: at }), /PRE_COMMIT/);
});

test("in-place MiniProject cannot omit source material", () => {
  const session = miniSession();
  session.draftRevisions[0]!.nodes = session.draftRevisions[0]!.nodes.filter(({ nodeId }) => nodeId !== "draft-goal");
  assert.throws(() => buildCreationSessionProposal({ proposalId: "proposal-loss", session, objectId: "mini-loss", createdBlockUuids: { "draft-todo": createdUuid }, createdAt: at }), /逐项保留完整来源子树/);
});

test("Project Creation Session rejects an in-place placement", () => {
  const session = miniSession();
  session.targetType = "PROJECT";
  session.draftRevisions[0]!.nodes = session.draftRevisions[0]!.nodes.map((node) => {
    const created = structuredClone(node);
    delete created.sourceBlockUuid;
    return { ...created, operation: "CREATE" as const };
  });
  assert.throws(() => buildCreationSessionProposal({
    proposalId: "proposal-project-place",
    session,
    objectId: "project-place",
    createdBlockUuids: { "draft-root": rootUuid, "draft-goal": childUuid, "draft-todo": createdUuid },
    createdAt: at,
  }), /独立新 Page/);
});
