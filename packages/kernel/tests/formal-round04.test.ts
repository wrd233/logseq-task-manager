import assert from "node:assert/strict";
import test from "node:test";
import { loadCurrentFocusSkill, loadEngagementReconciliationSkill } from "@task-copilot/agent";
import { parseSemanticOperation, type GraphEffect } from "@task-copilot/contracts";
import { SqliteStore } from "@task-copilot/sqlite";
import { FakeGraphAdapter } from "../../test-support/src/index.ts";
import { Kernel } from "../src/index.ts";

const at = "2026-10-02T00:00:00.000Z", actor = { type: "USER", id: "local-user" } as const;
async function fixture() {
  const store = new SqliteStore(":memory:"), graph = new FakeGraphAdapter(() => at), key = "b".repeat(64);
  const kernel = new Kernel(store, { now: () => at, graphSnapshotKey: key, currentFocusSkill: await loadCurrentFocusSkill(), engagementSkill: await loadEngagementReconciliationSkill() });
  const source = graph.seedNaturalRecord("graph", "source", "TODO test");
  const operation = parseSemanticOperation({ operationId: "create", type: "CREATE_WORK_OBJECT", actor, input: { kind: "TASK", title: "test", anchor: { graphId: "graph", blockUuid: "source", sourceContentHash: source.sourceContentHash } } });
  const created = kernel.commitFormal(operation, source);
  const verify = async (commitId: string, effect: GraphEffect) => kernel.verifyFormalProjection(commitId, await graph.applyGraphEffect(effect), graph.snapshot("graph", "source"));
  await verify(created.commit.id, created.graphEffect);
  return { store, graph, kernel, source, operation, created, verify, key, id: created.commit.targetId! };
}

test("formal CREATE Undo removes current state and preserves evidence, governance and obligation history", async () => {
  const f = await fixture();
  try {
    const material = await f.graph.readEvidenceMaterial({ graphId: "graph", blockUuid: "source" }, f.key);
    f.kernel.freezeEvidence({ evidenceId: "evidence", workObjectId: f.id, snapshot: material });
    f.kernel.startExternalAgentRun({ runId: "read", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: f.id, evidenceIds: ["evidence"], executorId: "agent", snapshot: f.graph.snapshot("graph", "source") });
    f.kernel.context.associateContext({ workObjectId: f.id, sourceRef: { graphId: "graph", blockUuid: "source" }, sourceVersionHash: material.sourceContentHash, origin: "USER_EXPLICIT" });
    const pkg = f.kernel.createDecisionPackage({ workObjectId: f.id, summary: "pending", rationale: "pending", candidates: [{ operationType: "SET_CURRENT_FOCUS", parameters: {} }] });
    const input = { operationId: "undo", actor, commitId: f.created.commit.id };
    const undone = f.kernel.undoFormal(input, f.graph.snapshot("graph", "source"));
    assert.equal(undone.commit.status, "COMMITTED"); assert.equal(f.store.getWorkObject(f.id), null);
    assert.equal(f.store.getCommit(f.created.commit.id)?.compensatedBy, undone.commit.id);
    assert.equal(f.store.getEvidence("evidence")?.workObjectId, f.id); assert.equal(f.store.getAgentRun("read")?.subject.workObjectId, f.id);
    assert.equal(f.store.getDecisionPackage(pkg.pkg.id)?.status, "STALE"); assert.equal(f.store.listDecisionCandidates(pkg.pkg.id).length, 1);
    assert.equal(f.store.listContextAssociations(f.id)[0]?.status, "INVALIDATED");
    assert.equal(f.store.listProjectionObligations().length, 2);
    const restarted = new Kernel(f.store, { now: () => at });
    assert.equal(restarted.undoFormal(input, f.source).commit.id, undone.commit.id);
    const result = await f.graph.applyGraphEffect(undone.graphEffect);
    assert.throws(() => restarted.verifyFormalProjection(undone.commit.id, result, { ...f.source, projection: null }), /PROJECTION_VERIFY_MISMATCH/u);
    assert.equal(restarted.verifyFormalProjection(undone.commit.id, result, f.graph.snapshot("graph", "source")).status, "VERIFIED");
    await f.graph.applyGraphEffect(undone.graphEffect); // lost Graph response is replayable
    assert.equal(f.graph.naturalContent("graph", "source"), "TODO test");
  } finally { f.store.close(); }
});

test("formal CREATE Undo rejects changed natural source and newer formal state", async () => {
  const f = await fixture();
  try {
    f.graph.editNaturalContent("graph", "source", "user edit");
    assert.throws(() => f.kernel.undoFormal({ operationId: "undo-edited", actor, commitId: f.created.commit.id }, f.graph.snapshot("graph", "source")), /UNDO_SOURCE_CHANGED/u);
    f.graph.editNaturalContent("graph", "source", "TODO test");
    f.kernel.commitFormal(parseSemanticOperation({ operationId: "rename", type: "RENAME_WORK_OBJECT", actor, target: { workObjectId: f.id, expectedVersion: 1, expectedProjectionHash: f.graph.snapshot("graph", "source").projection!.projectionHash }, input: { title: "new" } }), f.graph.snapshot("graph", "source"));
    assert.throws(() => f.kernel.undoFormal({ operationId: "undo-old", actor, commitId: f.created.commit.id }, f.graph.snapshot("graph", "source")), /UNDO_TARGET_CHANGED/u);
  } finally { f.store.close(); }
});

for (const type of ["SET_CURRENT_FOCUS", "CHANGE_ENGAGEMENT"] as const) test(`formal ${type} acceptance and Undo audit are atomic, exactly once, independent of delivery`, async () => {
  const f = await fixture();
  try {
    const material = await f.graph.readEvidenceMaterial({ graphId: "graph", blockUuid: "source" }, f.key);
    f.kernel.freezeEvidence({ evidenceId: "evidence", workObjectId: f.id, snapshot: material });
    f.kernel.startExternalAgentRun({ runId: "run", purpose: type === "SET_CURRENT_FOCUS" ? "CURRENT_FOCUS_MAINTENANCE" : "ENGAGEMENT_RECONCILIATION", workObjectId: f.id, evidenceIds: ["evidence"], executorId: "agent", snapshot: f.graph.snapshot("graph", "source") });
    const finished = f.kernel.finishExternalAgentRun({ runId: "run", result: type === "SET_CURRENT_FOCUS" ? { outcome: "PROPOSAL", currentFocus: "next", reasonCode: "NEXT", rationaleSummary: "next" } : { outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "wait", reviewAt: null } }, reasonCode: "WAIT", rationaleSummary: "wait" } });
    const input = { operationId: "apply", proposalId: finished.proposal!.id, snapshot: f.graph.snapshot("graph", "source"), evidence: [{ evidenceId: "evidence", ...material }] };
    const apply = () => type === "SET_CURRENT_FOCUS" ? f.kernel.applyProposalFormal(input) : f.kernel.applyEngagementProposalFormal(input);
    const feedback = f.store.putFeedback.bind(f.store);
    f.store.putFeedback = () => { throw Error("injected-feedback-failure"); };
    assert.throws(apply, /injected-feedback-failure/u);
    assert.equal(f.store.getWorkObject(f.id)?.version, 1); assert.equal(f.store.getProposal(input.proposalId)?.proposal.status, "OPEN"); assert.equal(f.store.listFeedback().length, 0); assert.equal(f.store.listProjectionObligations().length, 1);
    f.store.putFeedback = feedback;
    f.kernel.abortPrepared(f.store.listRecovery()[0]!.id);
    input.operationId = "apply-retry";
    const applied = apply();
    assert.equal(f.store.getProposal(input.proposalId)?.proposal.status, "APPLIED"); assert.equal(f.store.getProposal(input.proposalId)?.proposal.appliedCommitId, applied.commit.id); assert.equal(f.store.listFeedback().length, 1);
    f.kernel.graphProjectionFailed(applied.commit.id, "GRAPH_ADAPTER_OFFLINE");
    assert.equal(apply().commit.id, applied.commit.id); assert.equal(f.store.listFeedback().length, 1);
    await f.verify(applied.commit.id, applied.graphEffect);
    const undoInput = { operationId: "undo-agent", actor, commitId: applied.commit.id };
    const undo = f.kernel.undoFormal(undoInput, f.graph.snapshot("graph", "source"));
    assert.equal(f.store.getCommit(applied.commit.id)?.compensatedBy, undo.commit.id); assert.equal(f.store.listFeedback().filter(x => x.type === "UNDONE_AFTER_APPLY").length, 1);
    assert.equal(f.kernel.undoFormal(undoInput, f.source).commit.id, undo.commit.id); assert.equal(f.store.listFeedback().length, 2);
    await f.verify(undo.commit.id, undo.graphEffect); assert.equal(f.store.getWorkObject(f.id)?.version, 3);
    const verified = f.store.getProjectionObligationForCommit(applied.commit.id)!;
    assert.deepEqual(f.kernel.graphProjectionFailed(applied.commit.id, "late failure"), verified);
  } finally { f.store.close(); }
});

test("formal receipt survives a lost response without a second commit or obligation", async () => {
  const f = await fixture();
  try {
    assert.equal(f.kernel.commitFormal(f.operation, f.source).commit.id, f.created.commit.id);
    assert.equal(new Kernel(f.store).formalReceipt("create")?.commit.id, f.created.commit.id);
    assert.equal(f.store.listCommits().length, 1); assert.equal(f.store.listProjectionObligations().length, 1);
    assert.throws(() => f.kernel.commitFormal({ ...f.operation, input: { ...f.operation.input, title: "different" } } as typeof f.operation, f.source), /OPERATION_ID_REUSED/u);
  } finally { f.store.close(); }
});
