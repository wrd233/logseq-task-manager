import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type CurrentFocusAgent, type GraphEffect, type SkillPackage } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-13T00:00:00.000Z";

async function setup(label: string, content = "下一步：准备服务器上架并完成管理口网络配置", options: { currentFocusAgent?: CurrentFocusAgent; currentFocusSkill?: SkillPackage } = {}) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-${label}-`));
  const databasePath = join(directory, "kernel.sqlite");
  const service = await startKernelServer({ databasePath, descriptorPath: join(directory, "kernel.json"), token: "token", now: () => at, ...options });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at);
  const source = graph.seedNaturalRecord("graph-phase3", `source-${label}`, content);
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `formalize-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "服务器上架", anchor: { graphId: source.graphId, blockUuid: source.sourceBlockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid }));
  return { service, client, graph, source, workObjectId: prepared.commit.targetId!, content, databasePath };
}

async function propose(setupValue: Awaited<ReturnType<typeof setup>>, suffix: string) {
  const { client, graph, source, workObjectId } = setupValue;
  const evidenceId = `evidence-${suffix}`;
  await client.freezeEvidence({ evidenceId, workObjectId, snapshot: await graph.readEvidenceMaterial({ graphId: source.graphId, blockUuid: source.sourceBlockUuid }, setupValue.service.graphSnapshotKey) });
  const run = await client.runCurrentFocusAgent({ runId: `run-${suffix}`, workObjectId, evidenceIds: [evidenceId], snapshot: await graph.readGraphSnapshot({ graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid }) });
  assert.equal(run.run.result.outcome, "PROPOSAL");
  assert.ok(run.proposal);
  return { evidenceId, run, pending: await client.applyProposal(run.proposal.id, { operationId: `apply-${suffix}`, snapshot: await graph.readGraphSnapshot({ graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid }), evidence: [{ evidenceId, ...await graph.readEvidenceMaterial({ graphId: source.graphId, blockUuid: source.sourceBlockUuid }, setupValue.service.graphSnapshotKey) }] }) };
}

async function evidenceMaterial(value: Awaited<ReturnType<typeof setup>>, blockUuid = value.source.sourceBlockUuid) {
  return value.graph.readEvidenceMaterial({ graphId: value.source.graphId, blockUuid }, value.service.graphSnapshotKey);
}

test("Fake Agent vertical slice freezes Evidence, auto-applies one LOW proposal, and Undo restores focus with feedback", async () => {
  const value = await setup("success");
  try {
    const proposal = await propose(value, "success");
    assert.equal(proposal.pending.commit.actor.type, "AGENT");
    assert.equal(proposal.pending.commit.governance?.skill.id, "current-focus-maintenance");
    const result = await value.graph.applyGraphEffect(proposal.pending.graphEffect as GraphEffect);
    const committed = await value.client.complete(proposal.pending.commit.id, result, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
    assert.equal(committed.commit.status, "COMMITTED");
    assert.equal((await value.client.showObject(value.workObjectId)).object.currentFocus, "准备服务器上架并完成管理口网络配置");
    assert.equal((await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid })).projection?.currentFocus, "准备服务器上架并完成管理口网络配置");
    assert.equal(value.graph.naturalContent(value.source.graphId, value.source.sourceBlockUuid), value.content);
    assert.match((await value.client.showEvidence(proposal.evidenceId)).evidence.contentHash, /^[0-9a-f]{64}$/u);
    assert.deepEqual((await value.client.showAgentRun(proposal.run.run.id)).run.result.proposalIds, [proposal.run.proposal!.id]);
    assert.equal((await value.client.showProposal(proposal.run.proposal!.id)).revision.risk, "LOW");

    const undo = await value.client.prepareUndo(committed.commit.id, { operationId: "undo-focus-success", actor: { type: "USER", id: "local-user" }, snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
    const undoResult = await value.graph.applyGraphEffect(undo.graphEffect as GraphEffect);
    await value.client.complete(undo.commit.id, undoResult, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
    const restored = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(restored.currentFocus, null);
    assert.equal(restored.version, 3);
    assert.deepEqual((await value.client.listFeedback()).feedback.map((item) => item.type), ["ACCEPTED", "UNDONE_AFTER_APPLY"]);
  } finally { await value.service.close(); }
});

test("NO_PROPOSAL is durable and creates no Proposal, Commit, or Graph mutation", async () => {
  const value = await setup("noop", "下一步：准备服务器上架并完成管理口网络配置");
  try {
    const first = await propose(value, "noop-first");
    const applied = await value.graph.applyGraphEffect(first.pending.graphEffect as GraphEffect);
    await value.client.complete(first.pending.commit.id, applied, await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }));
    const beforeSnapshot = await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid });
    const beforeCommits = value.service.store.listCommits().length;
    const evidenceId = "evidence-noop";
    await value.client.freezeEvidence({ evidenceId, workObjectId: value.workObjectId, snapshot: await evidenceMaterial(value) });
    const run = await value.client.runCurrentFocusAgent({ runId: "run-noop", workObjectId: value.workObjectId, evidenceIds: [evidenceId], snapshot: beforeSnapshot });
    assert.equal(run.run.result.outcome, "NO_PROPOSAL");
    assert.equal(run.run.reasonCode, "ALREADY_ACCURATE");
    assert.equal(run.proposal, null);
    assert.equal(value.service.store.listCommits().length, beforeCommits);
    assert.deepEqual(await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }), beforeSnapshot);
  } finally { await value.service.close(); }
});

test("Freeze accepts only proof-bound material read by the trusted Graph Adapter", async () => {
  const value = await setup("forged");
  try {
    const trusted = await evidenceMaterial(value);
    await assert.rejects(value.client.freezeEvidence({ evidenceId: "evidence-forged", workObjectId: value.workObjectId, snapshot: { ...trusted, content: "伪造内容", sourceContentHash: stableHash("伪造内容") } }), /GRAPH_SNAPSHOT_PROOF_INVALID/u);
    await assert.rejects(value.client.freezeEvidence({ evidenceId: "evidence-wrong-graph", workObjectId: value.workObjectId, snapshot: { ...trusted, graphId: "another-graph" } }), /EVIDENCE_GRAPH_MISMATCH/u);
    const same1 = await value.client.freezeEvidence({ evidenceId: "evidence-same-1", workObjectId: value.workObjectId, snapshot: trusted });
    const same2 = await value.client.freezeEvidence({ evidenceId: "evidence-same-2", workObjectId: value.workObjectId, snapshot: await evidenceMaterial(value) });
    value.graph.seedNaturalRecord(value.source.graphId, "changed-block", `${value.content}。`);
    const changed = await value.client.freezeEvidence({ evidenceId: "evidence-changed", workObjectId: value.workObjectId, snapshot: await evidenceMaterial(value, "changed-block") });
    assert.equal(same1.evidence.contentHash, same2.evidence.contentHash);
    assert.notEqual(same1.evidence.contentHash, changed.evidence.contentHash);
    assert.equal(value.service.store.getEvidence("evidence-forged"), null);
  } finally { await value.service.close(); }
});

test("wrong Skill is rejected and Agent failures leave a minimal FAILED receipt", async () => {
  const wrongSkill = { id: "unknown-skill", version: "0.1.0", contentHash: "a".repeat(64), manifest: { id: "unknown-skill", version: "0.1.0", operation: "SET_CURRENT_FOCUS", risk: "LOW" }, policy: "", schema: {}, examples: [], eval: [] } satisfies SkillPackage;
  const wrong = await setup("wrong-skill", undefined, { currentFocusSkill: wrongSkill });
  try {
    const evidenceId = "evidence-wrong-skill";
    await wrong.client.freezeEvidence({ evidenceId, workObjectId: wrong.workObjectId, snapshot: await evidenceMaterial(wrong) });
    await assert.rejects(wrong.client.runCurrentFocusAgent({ runId: "run-wrong-skill", workObjectId: wrong.workObjectId, evidenceIds: [evidenceId], snapshot: await wrong.graph.readGraphSnapshot({ graphId: wrong.source.graphId, sourceBlockUuid: wrong.source.sourceBlockUuid }) }), /SKILL_NOT_APPROVED/u);
  } finally { await wrong.service.close(); }

  const changedApprovedSkill = { id: "current-focus-maintenance", version: "0.1.0", contentHash: "a".repeat(64), manifest: { id: "current-focus-maintenance", version: "0.1.0", operation: "SET_CURRENT_FOCUS", risk: "LOW" }, policy: "modified in place", schema: {}, examples: [], eval: [] } satisfies SkillPackage;
  const changed = await setup("changed-approved-skill", undefined, { currentFocusSkill: changedApprovedSkill });
  try {
    const evidenceId = "evidence-changed-approved-skill";
    await changed.client.freezeEvidence({ evidenceId, workObjectId: changed.workObjectId, snapshot: await evidenceMaterial(changed) });
    await assert.rejects(changed.client.runCurrentFocusAgent({ runId: "run-changed-approved-skill", workObjectId: changed.workObjectId, evidenceIds: [evidenceId], snapshot: await changed.graph.readGraphSnapshot({ graphId: changed.source.graphId, sourceBlockUuid: changed.source.sourceBlockUuid }) }), /SKILL_NOT_APPROVED/u);
  } finally { await changed.service.close(); }

  const failingAgent: CurrentFocusAgent = { id: "failing-agent", propose: async () => { throw new Error("deterministic failure"); } };
  const failed = await setup("failed-agent", undefined, { currentFocusAgent: failingAgent });
  try {
    const evidenceId = "evidence-failed-agent";
    await failed.client.freezeEvidence({ evidenceId, workObjectId: failed.workObjectId, snapshot: await evidenceMaterial(failed) });
    await assert.rejects(failed.client.runCurrentFocusAgent({ runId: "run-failed-agent", workObjectId: failed.workObjectId, evidenceIds: [evidenceId], snapshot: await failed.graph.readGraphSnapshot({ graphId: failed.source.graphId, sourceBlockUuid: failed.source.sourceBlockUuid }) }), /AGENT_EXECUTION_FAILED/u);
    assert.equal((await failed.client.showAgentRun("run-failed-agent")).run.result.outcome, "FAILED");
    assert.equal(failed.service.store.listCommits().length, 1);
  } finally { await failed.service.close(); }

  const invalidAgent: CurrentFocusAgent = { id: "invalid-agent", propose: async () => ({ outcome: "PROPOSAL", reasonCode: "INVALID", rationaleSummary: "missing field" }) };
  const invalid = await setup("invalid-agent", undefined, { currentFocusAgent: invalidAgent });
  try {
    const evidenceId = "evidence-invalid-agent";
    await invalid.client.freezeEvidence({ evidenceId, workObjectId: invalid.workObjectId, snapshot: await evidenceMaterial(invalid) });
    await assert.rejects(invalid.client.runCurrentFocusAgent({ runId: "run-invalid-agent", workObjectId: invalid.workObjectId, evidenceIds: [evidenceId], snapshot: await invalid.graph.readGraphSnapshot({ graphId: invalid.source.graphId, sourceBlockUuid: invalid.source.sourceBlockUuid }) }), /AGENT_RESULT_INVALID/u);
    assert.equal((await invalid.client.showAgentRun("run-invalid-agent")).run.result.outcome, "FAILED");
  } finally { await invalid.service.close(); }

  const malformedAgent: CurrentFocusAgent = { id: "malformed-agent", propose: async () => ({ outcome: "UNKNOWN", unexpected: true } as never) };
  const malformed = await setup("malformed-agent", undefined, { currentFocusAgent: malformedAgent });
  try {
    const evidenceId = "evidence-malformed-agent";
    await malformed.client.freezeEvidence({ evidenceId, workObjectId: malformed.workObjectId, snapshot: await evidenceMaterial(malformed) });
    await assert.rejects(malformed.client.runCurrentFocusAgent({ runId: "run-malformed-agent", workObjectId: malformed.workObjectId, evidenceIds: [evidenceId], snapshot: await malformed.graph.readGraphSnapshot({ graphId: malformed.source.graphId, sourceBlockUuid: malformed.source.sourceBlockUuid }) }), /AGENT_RESULT_INVALID/u);
    const receipt = await malformed.client.showAgentRun("run-malformed-agent");
    assert.equal(receipt.run.result.outcome, "FAILED");
    assert.equal(receipt.run.reasonCode, "AGENT_RESULT_INVALID");
  } finally { await malformed.service.close(); }
});

test("a Proposal from another semantic operation contract version is invalidated before Commit", async () => {
  const value = await setup("contract-version");
  try {
    const evidenceId = "evidence-contract-version";
    await value.client.freezeEvidence({ evidenceId, workObjectId: value.workObjectId, snapshot: await evidenceMaterial(value) });
    const run = await value.client.runCurrentFocusAgent({ runId: "run-contract-version", workObjectId: value.workObjectId, evidenceIds: [evidenceId], snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
    assert.ok(run.proposal);
    const database = new Database(value.databasePath);
    const row = database.prepare("SELECT revision_json FROM proposal_revisions WHERE proposal_id=? AND revision=1").get(run.proposal.id) as { revision_json: string };
    const revision = JSON.parse(row.revision_json) as Record<string, unknown>;
    database.prepare("UPDATE proposal_revisions SET revision_json=? WHERE proposal_id=? AND revision=1").run(JSON.stringify({ ...revision, operationContractVersion: 2 }), run.proposal.id);
    database.close();
    const before = value.service.store.listCommits().length;
    await assert.rejects(value.client.applyProposal(run.proposal.id, { operationId: "apply-wrong-contract", snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }), evidence: [{ evidenceId, ...await evidenceMaterial(value) }] }), /PROPOSAL_CONTRACT_VERSION_UNTRUSTED/u);
    assert.equal(value.service.store.listCommits().length, before);
  } finally { await value.service.close(); }
});

test("stale Evidence invalidates a Proposal before any Commit or Ledger mutation", async () => {
  const value = await setup("stale");
  try {
    const evidenceId = "evidence-stale";
    await value.client.freezeEvidence({ evidenceId, workObjectId: value.workObjectId, snapshot: await evidenceMaterial(value) });
    const run = await value.client.runCurrentFocusAgent({ runId: "run-stale", workObjectId: value.workObjectId, evidenceIds: [evidenceId], snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }) });
    const ledgerBefore = value.service.store.listCommits().length;
    value.graph.editNaturalContent(value.source.graphId, value.source.sourceBlockUuid, `${value.content}（已修改）`);
    await assert.rejects(value.client.applyProposal(run.proposal!.id, { operationId: "apply-stale", snapshot: await value.graph.readGraphSnapshot({ graphId: value.source.graphId, sourceBlockUuid: value.source.sourceBlockUuid }), evidence: [{ evidenceId, ...await evidenceMaterial(value) }] }), /PROPOSAL_EVIDENCE_STALE/u);
    assert.equal(value.service.store.listCommits().length, ledgerBefore);
    assert.equal((await value.client.showProposal(run.proposal!.id)).proposal.status, "INVALIDATED");
  } finally { await value.service.close(); }
});

test("stale target invalidates before Ledger mutation and user revision or dismissal records Feedback", async () => {
  const stale = await setup("stale-target");
  try {
    const evidenceId = "evidence-stale-target";
    await stale.client.freezeEvidence({ evidenceId, workObjectId: stale.workObjectId, snapshot: await evidenceMaterial(stale) });
    const run = await stale.client.runCurrentFocusAgent({ runId: "run-stale-target", workObjectId: stale.workObjectId, evidenceIds: [evidenceId], snapshot: await stale.graph.readGraphSnapshot({ graphId: stale.source.graphId, sourceBlockUuid: stale.source.sourceBlockUuid }) });
    const object = (await stale.client.showObject(stale.workObjectId)).object;
    const before = await stale.graph.readGraphSnapshot({ graphId: stale.source.graphId, sourceBlockUuid: stale.source.sourceBlockUuid });
    const rename = await stale.client.prepare(parseSemanticOperation({ operationId: "stale-target-rename", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: object.id, expectedVersion: object.version, expectedProjectionHash: before.projection!.projectionHash }, input: { title: "用户先改标题" } }), before);
    const renamed = await stale.graph.applyGraphEffect(rename.graphEffect as GraphEffect);
    await stale.client.complete(rename.commit.id, renamed, await stale.graph.readGraphSnapshot({ graphId: stale.source.graphId, sourceBlockUuid: stale.source.sourceBlockUuid }));
    const ledgerBefore = stale.service.store.listCommits().length;
    await assert.rejects(stale.client.applyProposal(run.proposal!.id, { operationId: "apply-stale-target", snapshot: await stale.graph.readGraphSnapshot({ graphId: stale.source.graphId, sourceBlockUuid: stale.source.sourceBlockUuid }), evidence: [{ evidenceId, ...await evidenceMaterial(stale) }] }), /PROPOSAL_TARGET_STALE/u);
    assert.equal(stale.service.store.listCommits().length, ledgerBefore);
  } finally { await stale.service.close(); }

  const revised = await setup("revised");
  try {
    const proposal = await propose(revised, "revised");
    const revision2 = await revised.client.reviseProposal(proposal.run.proposal!.id, { actor: { type: "USER", id: "local-user" }, currentFocus: "先完成管理口地址复核" });
    assert.equal(revision2.revision.revision, 2);
    assert.equal(revision2.revision.operationContractVersion, 1);
    const dismissed = await revised.client.dismissProposal(proposal.run.proposal!.id, { type: "USER", id: "local-user" });
    assert.equal(dismissed.proposal.status, "DISMISSED");
    assert.deepEqual(new Set((await revised.client.listFeedback()).feedback.map((event) => event.type)), new Set(["MODIFIED", "REJECTED"]));
  } finally { await revised.service.close(); }
});

test("Agent Graph failure and a post-prepare race become explicit RECOVERY_REQUIRED; later semantic edits block old Undo", async () => {
  const failed = await setup("failure");
  try {
    const proposal = await propose(failed, "failure");
    failed.graph.failNextApply();
    await assert.rejects(failed.graph.applyGraphEffect(proposal.pending.graphEffect as GraphEffect), /FAKE_GRAPH_APPLY_FAILURE/u);
    const marked = await failed.client.failGraphApply(proposal.pending.commit.id, "FAKE_GRAPH_APPLY_FAILURE");
    assert.equal(marked.commit.status, "KERNEL_APPLIED");
    assert.equal((await failed.client.listRecovery()).recovery[0]?.action, "RESUME_GRAPH_APPLY");
  } finally { await failed.service.close(); }

  const raced = await setup("race");
  try {
    const proposal = await propose(raced, "race");
    raced.graph.editManagedProjection(raced.source.graphId, raced.source.sourceBlockUuid, "用户并发编辑");
    await assert.rejects(raced.graph.applyGraphEffect(proposal.pending.graphEffect as GraphEffect), /GRAPH_FOCUS_PRECONDITION_FAILED/u);
    assert.equal((await raced.client.failGraphApply(proposal.pending.commit.id, "GRAPH_FOCUS_PRECONDITION_FAILED")).commit.status, "RECOVERY_REQUIRED");
  } finally { await raced.service.close(); }

  const edited = await setup("edited");
  try {
    const proposal = await propose(edited, "edited");
    const applied = await edited.graph.applyGraphEffect(proposal.pending.graphEffect as GraphEffect);
    await edited.client.complete(proposal.pending.commit.id, applied, await edited.graph.readGraphSnapshot({ graphId: edited.source.graphId, sourceBlockUuid: edited.source.sourceBlockUuid }));
    const object = (await edited.client.showObject(edited.workObjectId)).object;
    const snapshot = await edited.graph.readGraphSnapshot({ graphId: edited.source.graphId, sourceBlockUuid: edited.source.sourceBlockUuid });
    const rename = await edited.client.prepare(parseSemanticOperation({ operationId: "later-rename", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: object.id, expectedVersion: object.version, expectedProjectionHash: snapshot.projection!.projectionHash }, input: { title: "用户后续正式编辑" } }), snapshot);
    const renamedResult = await edited.graph.applyGraphEffect(rename.graphEffect as GraphEffect);
    await edited.client.complete(rename.commit.id, renamedResult, await edited.graph.readGraphSnapshot({ graphId: edited.source.graphId, sourceBlockUuid: edited.source.sourceBlockUuid }));
    await assert.rejects(edited.client.prepareUndo(proposal.pending.commit.id, { operationId: "old-undo", actor: { type: "USER", id: "local-user" }, snapshot: await edited.graph.readGraphSnapshot({ graphId: edited.source.graphId, sourceBlockUuid: edited.source.sourceBlockUuid }) }), /UNDO_TARGET_CHANGED/u);
    assert.equal((await edited.client.showObject(edited.workObjectId)).object.title, "用户后续正式编辑");
  } finally { await edited.service.close(); }
});
