import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { loadMiniProjectGovernanceSkill, loadMiniProjectTaste, loadWorkIntentMaintenanceSkill } from "@task-copilot/agent";
import { graphEvidenceProofPayload, parseSemanticOperation, stableHash, type AgentRunReceipt, type Proposal, type WorkIntentProposalRevision } from "@task-copilot/contracts";
import { SqliteStore } from "@task-copilot/sqlite";
import { Kernel, KernelError } from "../src/index.ts";

const at = "2026-08-12T00:00:00.000Z";
const operation = () => parseSemanticOperation({
  operationId: "operation-01", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" },
  input: { kind: "TASK", title: "确认交换机管理口地址", anchor: { graphId: "graph-01", blockUuid: "source-01", sourceContentHash: "a1b2c3d4" } },
});
const sourceSnapshot = { graphId: "graph-01", sourceBlockUuid: "source-01", sourceContentHash: "a1b2c3d4", projection: null } as const;

test("governed UPDATE_WORK_INTENT commits, verifies, and Undo restores sparse intent", async () => {
  const store = new SqliteStore(":memory:"); const skill = await loadMiniProjectGovernanceSkill(); const workIntentSkill = await loadWorkIntentMaintenanceSkill(); const taste = await loadMiniProjectTaste(); const proofKey = "b".repeat(64); let crashAfterGraph = false;
  const kernel = new Kernel(store, { now: () => at, miniProjectSkill: skill, workIntentSkill, miniProjectTaste: taste, graphSnapshotKey: proofKey, afterStage: (stage) => { if (stage === "GRAPH_APPLIED" && crashAfterGraph) throw new Error("work-intent-restart"); } });
  const create = parseSemanticOperation({ operationId: "mini-create", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "MINI_PROJECT", title: "虚拟机模板与镜像规范", anchor: { graphId: "graph-01", blockUuid: "source-01", sourceContentHash: "a1b2c3d4" } } });
  const created = kernel.prepare(create, sourceSnapshot); if (created.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") assert.fail();
  kernel.complete(created.commit.id, { commitId: created.graphEffect.commitId, effectId: created.graphEffect.effectId, effectType: created.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: created.graphEffect.projection.projectionHash, appliedAt: at }, { ...sourceSnapshot, projection: created.graphEffect.projection });
  const workObjectId = created.commit.targetId!; const content = "目标：形成一份可评审的虚拟机模板与镜像规范"; const contentHash = createHash("sha256").update(content).digest("hex");
  store.putEvidence({ id: "evidence-mini", workObjectId, sourceType: "LOGSEQ_BLOCK", graphId: "graph-01", externalId: "source-01", frozenContent: content, contentHash, frozenAt: at, locator: { graphId: "graph-01", blockUuid: "source-01" } });
  store.registerSkill(skill, skill, at); store.registerSkill(workIntentSkill, workIntentSkill, at);
  const compositeIdentity = { id: skill.id, version: skill.version, contentHash: skill.contentHash }; const skillIdentity = { id: workIntentSkill.id, version: workIntentSkill.version, contentHash: workIntentSkill.contentHash }; const tasteIdentity = { id: taste.id, version: taste.version, contentHash: taste.contentHash };
  const run = { id: "run-mini", purpose: "MINI_PROJECT_GOVERNANCE", executor: { type: "EXTERNAL_CLI", id: "codex" }, state: "FINISHED", operationContractVersion: 1, skill: compositeIdentity, subject: { workObjectId }, context: { targetVersion: 1, targetProjectionHash: created.graphEffect.projection.projectionHash, evidenceIds: ["evidence-mini"], governanceCorrelationId: "governance-01", taste: tasteIdentity }, result: { outcome: "PROPOSAL", proposalIds: ["proposal-mini"] }, reasonCode: "COMMITMENT", rationaleSummary: "信息足够", submissionHash: stableHash({}), startedAt: at, finishedAt: at } satisfies AgentRunReceipt;
  store.putAgentRun(run);
  const proposal = { id: "proposal-mini", workObjectId, status: "OPEN", latestRevision: 1, appliedCommitId: null, invalidationReason: null, createdAt: at, updatedAt: at } satisfies Proposal;
  const revision = { proposalId: proposal.id, revision: 1, operationType: "UPDATE_WORK_INTENT", operationContractVersion: 1, desiredOutcome: "形成一份可评审规范", completionChecks: ["覆盖模板与镜像约束", "通过联合评审"], expectedVersion: 1, expectedProjectionHash: created.graphEffect.projection.projectionHash, evidenceDependencies: [{ evidenceId: "evidence-mini", contentHash }], skill: skillIdentity, agentRunId: run.id, governanceCorrelationId: "governance-01", taste: tasteIdentity, risk: "LOW", createdAt: at } satisfies WorkIntentProposalRevision;
  store.putProposal(proposal, revision);
  const material = { graphId: "graph-01", blockUuid: "source-01", content, sourceContentHash: stableHash(content) }; const fresh = { evidenceId: "evidence-mini", ...material, proof: createHmac("sha256", proofKey).update(graphEvidenceProofPayload(material)).digest("hex") };
  const pending = kernel.applyWorkIntentProposal({ operationId: "apply-mini", proposalId: proposal.id, snapshot: { ...sourceSnapshot, projection: created.graphEffect.projection }, evidence: [fresh] }); if (pending.graphEffect.type !== "UPDATE_WORK_INTENT_FIELDS") assert.fail();
  const afterProjection = pending.graphEffect.resultingProjection!;
  crashAfterGraph = true;
  assert.throws(() => kernel.complete(pending.commit.id, { commitId: pending.graphEffect.commitId, effectId: pending.graphEffect.effectId, effectType: pending.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: afterProjection.projectionHash, appliedAt: at }, { ...sourceSnapshot, projection: afterProjection }), /work-intent-restart/u);
  const restarted = new Kernel(store, { now: () => at, miniProjectSkill: skill, workIntentSkill, miniProjectTaste: taste, graphSnapshotKey: proofKey });
  assert.equal(restarted.recoveryList()[0]?.action, "VERIFY_GRAPH");
  const committed = restarted.verifyRecoveredGraph(pending.commit.id, { ...sourceSnapshot, projection: afterProjection });
  assert.equal(committed.status, "COMMITTED"); assert.equal(store.getWorkObject(workObjectId)?.desiredOutcome, "形成一份可评审规范");
  restarted.recordStrongPositive({ commitId: committed.id, actor: { type: "USER", id: "local-user" } });
  assert.deepEqual(store.listFeedback().map((item) => item.signalStrength), ["WEAK_ACCEPTANCE", "STRONG_POSITIVE"]);
  const undo = restarted.prepareUndo({ operationId: "undo-mini", actor: { type: "USER", id: "local-user" }, commitId: committed.id }, { ...sourceSnapshot, projection: afterProjection }); if (undo.graphEffect.type !== "UPDATE_WORK_INTENT_FIELDS") assert.fail();
  restarted.complete(undo.commit.id, { commitId: undo.graphEffect.commitId, effectId: undo.graphEffect.effectId, effectType: undo.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: undo.graphEffect.resultingProjection!.projectionHash, appliedAt: at }, { ...sourceSnapshot, projection: undo.graphEffect.resultingProjection! });
  assert.equal(store.getWorkObject(workObjectId)?.desiredOutcome, null); assert.deepEqual(store.getWorkObject(workObjectId)?.completionChecks, []); assert.equal(store.listFeedback().at(-1)?.signalStrength, "CORRECTIVE"); store.close();
});

test("CREATE_WORK_OBJECT reaches success only after exact Graph verification", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const prepared = kernel.prepare(operation(), sourceSnapshot);

  assert.equal(prepared.commit.status, "KERNEL_APPLIED");
  assert.equal(store.listWorkObjects().length, 1);
  assert.equal(prepared.graphEffect.type, "UPSERT_MANAGED_PROJECTION");

  const projection = prepared.graphEffect.type === "UPSERT_MANAGED_PROJECTION" ? prepared.graphEffect.projection : null;
  const committed = kernel.complete(prepared.commit.id, {
    commitId: prepared.graphEffect.commitId, effectId: prepared.graphEffect.effectId,
    effectType: prepared.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: projection!.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection });
  assert.equal(committed.status, "COMMITTED");
  store.close();
});

test("a source hash mismatch fails closed and records RECOVERY_REQUIRED without current-state writes", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  assert.throws(
    () => kernel.prepare(operation(), { ...sourceSnapshot, sourceContentHash: "deadbeef" }),
    (error) => error instanceof KernelError && error.code === "SOURCE_CONTENT_HASH_MISMATCH",
  );
  assert.equal(store.listWorkObjects().length, 0);
  assert.equal(store.listRecovery()[0]?.status, "RECOVERY_REQUIRED");
  store.close();
});

test("crashes after durable stages are discoverable with explicit recovery actions", () => {
  for (const stage of ["PREPARED", "KERNEL_APPLIED"] as const) {
    const store = new SqliteStore(":memory:");
    const kernel = new Kernel(store, { now: () => at, afterStage: (current) => { if (current === stage) throw new Error(`crash-${stage}`); } });
    assert.throws(() => kernel.prepare(operation(), sourceSnapshot), new RegExp(`crash-${stage}`, "u"));
    assert.equal(new Kernel(store, { now: () => at }).recoveryList()[0]?.action, stage === "PREPARED" ? "ABORT_PREPARED" : "RESUME_GRAPH_APPLY");
    store.close();
  }
});

test("a crash after GRAPH_APPLIED is durable and restarts at verification", () => {
  const store = new SqliteStore(":memory:");
  let crashAtGraph = false;
  const kernel = new Kernel(store, { now: () => at, afterStage: (stage) => { if (stage === "GRAPH_APPLIED" && crashAtGraph) throw new Error("crash-GRAPH_APPLIED"); } });
  const prepared = kernel.prepare(operation(), sourceSnapshot);
  assert.equal(prepared.graphEffect.type, "UPSERT_MANAGED_PROJECTION");
  if (prepared.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("unexpected effect");
  const projection = prepared.graphEffect.projection;
  crashAtGraph = true;
  assert.throws(() => kernel.complete(prepared.commit.id, {
    commitId: prepared.graphEffect.commitId, effectId: prepared.graphEffect.effectId,
    effectType: "UPSERT_MANAGED_PROJECTION", graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: projection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection }), /crash-GRAPH_APPLIED/u);
  const restarted = new Kernel(store, { now: () => at });
  assert.equal(restarted.recoveryList()[0]?.action, "VERIFY_GRAPH");
  assert.equal(restarted.verifyRecoveredGraph(prepared.commit.id, { ...sourceSnapshot, projection }).status, "COMMITTED");
  store.close();
});

test("Undo is a compensation commit and refuses to delete a user-edited managed projection", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const prepared = kernel.prepare(operation(), sourceSnapshot);
  assert.equal(prepared.graphEffect.type, "UPSERT_MANAGED_PROJECTION");
  if (prepared.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("unexpected effect");
  const projection = prepared.graphEffect.projection;
  kernel.complete(prepared.commit.id, {
    commitId: prepared.graphEffect.commitId, effectId: prepared.graphEffect.effectId,
    effectType: prepared.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: projection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection });

  assert.throws(
    () => kernel.prepareUndo({ operationId: "undo-edited", actor: { type: "USER", id: "local-user" }, commitId: prepared.commit.id }, { ...sourceSnapshot, projection: { ...projection, title: "用户改过", projectionHash: "deadbeef" } }),
    (error) => error instanceof KernelError && error.code === "UNDO_GRAPH_CHANGED",
  );
  assert.equal(store.listWorkObjects().length, 1);

  const undo = kernel.prepareUndo({ operationId: "undo-01", actor: { type: "USER", id: "local-user" }, commitId: prepared.commit.id }, { ...sourceSnapshot, projection });
  assert.equal(undo.commit.compensationFor, prepared.commit.id);
  assert.equal(store.listWorkObjects().length, 0);
  const undone = kernel.complete(undo.commit.id, {
    commitId: undo.graphEffect.commitId, effectId: undo.graphEffect.effectId,
    effectType: "REMOVE_MANAGED_PROJECTION", graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: null, appliedAt: at,
  }, sourceSnapshot);
  assert.equal(undone.status, "COMMITTED");
  assert.equal(store.getCommit(prepared.commit.id)?.compensatedBy, undo.commit.id);
  store.close();
});

test("a GRAPH_APPLIED create compensation recovers after its WorkObject is already deleted", () => {
  const store = new SqliteStore(":memory:"); let crashUndo = false;
  const kernel = new Kernel(store, { now: () => at, afterStage: (stage) => { if (stage === "GRAPH_APPLIED" && crashUndo) throw new Error("crash-undo-GRAPH_APPLIED"); } });
  const created = kernel.prepare(operation(), sourceSnapshot);
  if (created.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("unexpected effect");
  kernel.complete(created.commit.id, { commitId: created.graphEffect.commitId, effectId: created.graphEffect.effectId, effectType: created.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: created.graphEffect.projection.projectionHash, appliedAt: at }, { ...sourceSnapshot, projection: created.graphEffect.projection });
  const undo = kernel.prepareUndo({ operationId: "undo-recovery", actor: { type: "USER", id: "local-user" }, commitId: created.commit.id }, { ...sourceSnapshot, projection: created.graphEffect.projection });
  assert.equal(store.listWorkObjects().length, 0); crashUndo = true;
  assert.throws(() => kernel.complete(undo.commit.id, { commitId: undo.graphEffect.commitId, effectId: undo.graphEffect.effectId, effectType: undo.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01", projectionHash: null, appliedAt: at }, sourceSnapshot), /crash-undo-GRAPH_APPLIED/u);
  const restarted = new Kernel(store, { now: () => at });
  assert.equal(restarted.recoveryList()[0]?.action, "VERIFY_GRAPH");
  assert.equal(restarted.verifyRecoveredGraph(undo.commit.id, sourceSnapshot).status, "COMMITTED");
  assert.equal(store.listWorkObjects().length, 0); store.close();
});

test("RENAME_WORK_OBJECT and its Undo are executable compensation commits with monotonic versions", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const created = kernel.prepare(operation(), sourceSnapshot);
  if (created.graphEffect.type !== "UPSERT_MANAGED_PROJECTION") throw new Error("unexpected effect");
  const originalProjection = created.graphEffect.projection;
  kernel.complete(created.commit.id, {
    commitId: created.graphEffect.commitId, effectId: created.graphEffect.effectId,
    effectType: created.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: originalProjection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection: originalProjection });

  const object = store.listWorkObjects()[0]!;
  const renamed = kernel.prepare(parseSemanticOperation({
    operationId: "rename-01", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" },
    target: { workObjectId: object.id, expectedVersion: object.version, expectedProjectionHash: originalProjection.projectionHash },
    input: { title: "确认核心交换机地址" },
  }), { ...sourceSnapshot, projection: originalProjection });
  if (renamed.graphEffect.type !== "UPDATE_MANAGED_FIELD") throw new Error("unexpected effect");
  const renamedProjection = { ...originalProjection, title: "确认核心交换机地址", projectionHash: renamed.graphEffect.resultingProjectionHash };
  kernel.complete(renamed.commit.id, {
    commitId: renamed.graphEffect.commitId, effectId: renamed.graphEffect.effectId,
    effectType: renamed.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: renamedProjection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection: renamedProjection });

  const undo = kernel.prepareUndo({ operationId: "undo-rename-01", actor: { type: "USER", id: "local-user" }, commitId: renamed.commit.id }, { ...sourceSnapshot, projection: renamedProjection });
  if (undo.graphEffect.type !== "UPDATE_MANAGED_FIELD") throw new Error("unexpected effect");
  const restoredProjection = { ...renamedProjection, title: originalProjection.title, projectionHash: undo.graphEffect.resultingProjectionHash };
  const compensated = kernel.complete(undo.commit.id, {
    commitId: undo.graphEffect.commitId, effectId: undo.graphEffect.effectId,
    effectType: undo.graphEffect.type, graphId: "graph-01", sourceBlockUuid: "source-01",
    projectionHash: restoredProjection.projectionHash, appliedAt: at,
  }, { ...sourceSnapshot, projection: restoredProjection });

  assert.equal(compensated.status, "COMMITTED");
  assert.equal(store.listWorkObjects()[0]?.title, originalProjection.title);
  assert.equal(store.listWorkObjects()[0]?.version, 3);
  assert.equal(store.getCommit(renamed.commit.id)?.compensatedBy, undo.commit.id);
  store.close();
});

test("write authorization is bound to the configured local USER identity", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at, authorizedUserId: "owner-01" });
  for (const actor of [{ type: "SYSTEM", id: "owner-01" }, { type: "AGENT", id: "fake-current-focus-agent" }, { type: "USER", id: "someone-else" }] as const) {
    const candidate = parseSemanticOperation({
      operationId: `unauthorized-${actor.type}-${actor.id}`, type: "CREATE_WORK_OBJECT", actor,
      input: { kind: "TASK", title: "不得写入", anchor: { graphId: "graph-01", blockUuid: "source-01", sourceContentHash: "a1b2c3d4" } },
    });
    assert.throws(() => kernel.prepare(candidate, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  }
  assert.equal(store.listWorkObjects().length, 0);
  store.close();
});

test("generic preparation rejects every Agent operation, including rename and undo entry", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  const rename = parseSemanticOperation({ operationId: "agent-rename", type: "RENAME_WORK_OBJECT", actor: { type: "AGENT", id: "agent" }, target: { workObjectId: "work-01", expectedVersion: 1, expectedProjectionHash: "a1b2c3d4" }, input: { title: "不得改名" } });
  const undo = parseSemanticOperation({ operationId: "agent-undo", type: "UNDO_COMMIT", actor: { type: "AGENT", id: "agent" }, target: { commitId: "commit-01", expectedProjectionHash: "a1b2c3d4" }, input: {} });
  const engagement = parseSemanticOperation({ operationId: "agent-engagement", type: "CHANGE_ENGAGEMENT", actor: { type: "AGENT", id: "fake-engagement-agent" }, target: { workObjectId: "work-01", expectedVersion: 1, expectedProjectionHash: "a1b2c3d4" }, input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待 VLAN", reviewAt: null, evidenceIds: ["evidence-1"] } }, evidenceDependencies: [{ evidenceId: "evidence-1", contentHash: "a".repeat(64) }] });
  assert.throws(() => kernel.prepare(rename, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  assert.throws(() => kernel.prepare(undo, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  assert.throws(() => kernel.prepare(engagement, sourceSnapshot), (error) => error instanceof KernelError && error.code === "ACTOR_NOT_AUTHORIZED");
  assert.equal(store.listCommits().length, 0);
  store.close();
});
