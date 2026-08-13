import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, stableHash, type GraphEffect, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-13T10:00:00.000Z";

async function postBridge(baseUrl: string, token: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-task-copilot-graph-bridge": token }, body: JSON.stringify(body) });
}

function startBridge(input: { baseUrl: string; bridgeToken: string; snapshotKey: string; graphId: string; graph: FakeGraphAdapter; records: Map<string, { content: string; pageName: string }> }) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const curationDirect: Array<{ blockUuid: string; content: string; contentHash: string }> = [];
  const handle = async (envelope: GraphGatewayRequestEnvelope): Promise<GraphGatewayResponse> => {
    const request = envelope.request;
    if (request.kind === "READ_TARGET_SNAPSHOT") return { kind: request.kind, snapshot: await input.graph.readGraphSnapshot(request.input) };
    if (request.kind === "READ_EVIDENCE") return { kind: request.kind, material: await input.graph.readEvidenceMaterial({ graphId: request.graphId, blockUuid: request.blockUuid }, input.snapshotKey) };
    if (request.kind === "APPLY_EFFECT") { const result = await input.graph.applyGraphEffect(request.effect); return { kind: request.kind, result, snapshot: await input.graph.readGraphSnapshot({ graphId: request.effect.graphId, sourceBlockUuid: request.effect.sourceBlockUuid }) }; }
    if (request.kind === "SEARCH") return { kind: request.kind, matches: [...input.records].filter(([, value]) => value.content.includes(request.query)).slice(0, request.limit).map(([uuid, value]) => ({ graphId: request.graphId, blockUuid: uuid, pageName: value.pageName, snippet: value.content, contentHash: stableHash(value.content) })) };
    if (request.kind === "READ_BLOCK") { const value = input.records.get(request.blockUuid); if (!value) throw new Error("GRAPH_BLOCK_NOT_FOUND"); return { kind: request.kind, block: { graphId: request.graphId, blockUuid: request.blockUuid, pageName: value.pageName, content: value.content, contentHash: stableHash(value.content) } }; }
    if (request.kind === "READ_CURATION_SNAPSHOT") { const content = input.graph.naturalContent(request.graphId, request.rootBlockUuid); return { kind: request.kind, snapshot: { graphId: request.graphId, rootBlockUuid: request.rootBlockUuid, rootContentHash: stableHash(content), rootTopologyHash: stableHash(curationDirect.map((item) => [item.blockUuid, item.contentHash])), directChildren: [...curationDirect] } }; }
    if (request.kind === "APPLY_CURATION") { const item = request.curation; const content = input.graph.naturalContent(item.graphId, item.rootBlockUuid); const beforeTopology = stableHash(curationDirect.map((child) => [child.blockUuid, child.contentHash])); if (stableHash(content) !== item.expectedRootContentHash || beforeTopology !== item.expectedRootTopologyHash) throw new Error("GRAPH_CURATION_PRECONDITION_FAILED"); const heading = `**[${item.section}]**`; if (!item.existingSectionUuid) curationDirect.push({ blockUuid: item.newSectionUuid, content: heading, contentHash: stableHash(heading) }); const snapshot = { graphId: item.graphId, rootBlockUuid: item.rootBlockUuid, rootContentHash: stableHash(content), rootTopologyHash: stableHash(curationDirect.map((child) => [child.blockUuid, child.contentHash])), directChildren: [...curationDirect] }; return { kind: request.kind, snapshot, createdBlockUuids: [...(item.existingSectionUuid ? [] : [item.newSectionUuid]), item.newReferenceUuid] }; }
    if (request.kind !== "READ_PAGE") throw new Error("GRAPH_CURATION_UNSUPPORTED_IN_PHASE6_FIXTURE");
    const blocks = [...input.records].filter(([, value]) => value.pageName === request.pageName).slice(0, request.limit).map(([uuid, value]) => ({ graphId: request.graphId, blockUuid: uuid, pageName: value.pageName, content: value.content, contentHash: stableHash(value.content) }));
    return { kind: request.kind, page: { graphId: request.graphId, pageName: request.pageName, blocks, truncated: false } };
  };
  const tick = async () => {
    try {
      const polled = await postBridge(input.baseUrl, input.bridgeToken, "/v1/graph-adapter/poll", { graphId: input.graphId });
      const envelope = (await polled.json() as { request: GraphGatewayRequestEnvelope | null }).request;
      if (envelope) {
        try { await postBridge(input.baseUrl, input.bridgeToken, `/v1/graph-adapter/requests/${envelope.id}/complete`, { graphId: input.graphId, response: await handle(envelope) }); }
        catch (error) { if (!stopped) await postBridge(input.baseUrl, input.bridgeToken, `/v1/graph-adapter/requests/${envelope.id}/fail`, { graphId: input.graphId, error: { code: error instanceof Error ? error.message.split(":")[0] : "GRAPH_FAILED", message: error instanceof Error ? error.message : "failed" } }); }
      }
    } catch { /* service teardown or transient test transport loss */ }
    if (!stopped) timer = setTimeout(() => void tick(), 2);
  };
  void tick(); return () => { stopped = true; if (timer) clearTimeout(timer); };
}

async function setup(kind: "TASK" | "MINI_PROJECT" = "TASK") {
  const directory = await mkdtemp(join(tmpdir(), "task-copilot-phase6-"));
  const databasePath = join(directory, "kernel.sqlite"); const descriptorPath = join(directory, "kernel.json");
  const service = await startKernelServer({ databasePath, descriptorPath, token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), now: () => at, graphRequestTimeoutMs: 500 });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at); const graphId = "graph-phase6"; const source = graph.seedNaturalRecord(graphId, "source", "TODO 验证外部 Agent 治理");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `phase6-formalize-${kind}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title: kind === "MINI_PROJECT" ? "虚拟机模板与镜像规范" : "验证外部 Agent 治理", anchor: { graphId, blockUuid: "source", sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect); await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId, sourceBlockUuid: "source" }));
  const records = new Map<string, { content: string; pageName: string }>(); const stop = startBridge({ baseUrl: service.baseUrl, bridgeToken: service.graphBridgeToken, snapshotKey: service.graphSnapshotKey, graphId, graph, records });
  for (let attempt = 0; attempt < 20 && !(await client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return { service, client, graph, graphId, workObjectId: prepared.commit.targetId!, records, stop, databasePath, descriptorPath };
}

test("MiniProject governance supports one-question Grill, continuous low-risk apply, no-change, and boundary stop", async () => {
  const value = await setup("MINI_PROJECT");
  try {
    value.records.set("mini-evidence", { content: "目标是形成虚拟机模板与镜像规范；需要覆盖模板、镜像、版本和发布约束，并通过运维与安全联合评审。下一步：梳理现有模板差异。", pageName: "Phase 7 Governance Acceptance" });
    value.graph.seedNaturalRecord(value.graphId, "mini-evidence", value.records.get("mini-evidence")!.content);
    const frozen = await value.client.freezeExternalEvidence({ evidenceId: "evidence-mini", workObjectId: value.workObjectId, blockUuid: "mini-evidence" });
    const correlation = "governance-phase7";
    const ask = await value.client.startExternalAgentRun({ runId: "run-mini-ask", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "fresh-codex", governanceCorrelationId: correlation });
    const asked = await value.client.finishExternalAgentRun(ask.run.id, { outcome: "NEEDS_MORE_CONTEXT", question: "我建议先以联合评审通过作为完成边界；还需要哪一项可观察结果？", reasonCode: "ONE_BOTTLENECK", rationaleSummary: "完成边界仍有一个缺口。" });
    assert.equal(asked.run.result.outcome, "NEEDS_MORE_CONTEXT"); assert.equal(asked.proposal, null);

    const intent = await value.client.startExternalAgentRun({ runId: "run-mini-intent", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "fresh-codex", governanceCorrelationId: correlation });
    const proposed = await value.client.finishExternalAgentRun(intent.run.id, { outcome: "PROPOSAL", change: { type: "UPDATE_WORK_INTENT", desiredOutcome: "形成一份可评审的虚拟机模板与镜像规范", completionChecks: ["覆盖模板、镜像、版本和发布约束", "通过运维与安全联合评审"] }, reasonCode: "MINIMUM_COMMITMENT_REACHED", rationaleSummary: "一个核心输出与两项完成标准已足够。" });
    assert.equal(proposed.revision?.operationType, "UPDATE_WORK_INTENT"); assert.equal(proposed.revision?.skill.id, "work-intent-maintenance"); const intentCommit = await value.client.applyExternalProposal(proposed.proposal!.id); assert.equal(intentCommit.commit.status, "COMMITTED");
    const afterIntent = (await value.client.showObject(value.workObjectId)).object; assert.equal(afterIntent.desiredOutcome, "形成一份可评审的虚拟机模板与镜像规范"); assert.equal(afterIntent.version, 2);

    const focus = await value.client.startExternalAgentRun({ runId: "run-mini-focus", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "fresh-codex", governanceCorrelationId: correlation });
    const focusProposal = await value.client.finishExternalAgentRun(focus.run.id, { outcome: "PROPOSAL", change: { type: "SET_CURRENT_FOCUS", currentFocus: "梳理现有模板差异" }, reasonCode: "CURRENT_BOTTLENECK", rationaleSummary: "当前推进明确。" });
    assert.equal(focusProposal.revision?.skill.id, "current-focus-maintenance"); const focusCommit = await value.client.applyExternalProposal(focusProposal.proposal!.id); assert.equal((await value.client.showObject(value.workObjectId)).object.currentFocus, "梳理现有模板差异");

    const correction = await value.client.startExternalAgentRun({ runId: "run-mini-correction", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "fresh-codex", governanceCorrelationId: correlation });
    const correctedProposal = await value.client.finishExternalAgentRun(correction.run.id, { outcome: "PROPOSAL", change: { type: "UPDATE_WORK_INTENT", desiredOutcome: "形成一份可评审的虚拟机模板与镜像规范", completionChecks: ["覆盖模板、镜像、版本和发布约束"] }, reasonCode: "LATE_UNDERSTANDING_CORRECTION", rationaleSummary: "后来确认联合评审不是硬完成门槛，只修正依赖该理解的完成标准。" });
    const corrected = await value.client.applyExternalProposal(correctedProposal.proposal!.id); const afterCorrection = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(afterCorrection.currentFocus, "梳理现有模板差异"); assert.deepEqual(afterCorrection.completionChecks, ["覆盖模板、镜像、版本和发布约束"]); assert.notEqual(corrected.commit.id, intentCommit.commit.id); assert.notEqual(corrected.commit.id, focusCommit.commit.id);

    value.records.set("resource-block", { content: "现有镜像版本清单", pageName: "Phase 7 Governance Acceptance" });
    const curationRun = await value.client.startExternalAgentRun({ runId: "run-mini-curation", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "fresh-codex", governanceCorrelationId: correlation });
    const curated = await value.client.addReferenceCuration({ receiptId: "curation-mini-resource", runId: curationRun.run.id, workObjectId: value.workObjectId, referenceBlockUuid: "resource-block", section: "资源" });
    assert.equal(curated.receipt.governanceCorrelationId, correlation); assert.equal(curated.receipt.skill.id, "miniproject-governance"); assert.equal(curated.receipt.taste.id, "miniproject-governance-taste");
    await value.client.finishExternalAgentRun(curationRun.run.id, { outcome: "NO_PROPOSAL", reasonCode: "CURATION_APPLIED", rationaleSummary: "已通过 typed curation 添加原始资料引用。" });
    assert.equal((await value.client.listCurationReceipts(value.workObjectId)).receipts.length, 1);

    const healthy = await value.client.startExternalAgentRun({ runId: "run-mini-healthy", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "fresh-codex", governanceCorrelationId: correlation });
    const noChange = await value.client.finishExternalAgentRun(healthy.run.id, { outcome: "NO_PROPOSAL", reasonCode: "ALREADY_HEALTHY", rationaleSummary: "当前结构和推进一致。" }); assert.equal(noChange.proposal, null);
    const boundary = await value.client.startExternalAgentRun({ runId: "run-mini-boundary", purpose: "MINI_PROJECT_GOVERNANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "fresh-codex", governanceCorrelationId: correlation });
    const stopped = await value.client.finishExternalAgentRun(boundary.run.id, { outcome: "BOUNDARY_REVIEW", candidate: "SPLIT", recommendation: "建议把自动化流水线拆为另一个 MiniProject。", question: "是否按这个边界拆分？", reasonCode: "MULTIPLE_CORE_OUTPUTS", rationaleSummary: "存在两个独立核心输出。" }); assert.equal(stopped.run.result.outcome, "BOUNDARY_REVIEW"); assert.equal(stopped.proposal, null);
    assert.deepEqual((await value.client.listRecovery()).recovery, []);
  } finally { value.stop(); await value.service.close(); }
});

test("External CLI executor reuses Skills, records reads separately, and commits focus plus bidirectional Engagement", async () => {
  const value = await setup();
  try {
    value.records.set("focus-evidence", { content: "已确认下一步需要补充交换机参数并完善规格说明。", pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, "focus-evidence", value.records.get("focus-evidence")!.content);
    const bootstrap = await value.client.agentBootstrap(); assert.equal(bootstrap.agent.executorType, "EXTERNAL_CLI"); assert.equal(JSON.stringify(bootstrap).includes("token"), false); assert.equal(bootstrap.skills.length, 4);
    const workIntentSkill = await value.client.showSkill("work-intent-maintenance"); assert.equal((workIntentSkill.resultContract as { properties: { desiredOutcome: { maxLength: number } } }).properties.desiredOutcome.maxLength, 500);
    const frozen = await value.client.freezeExternalEvidence({ evidenceId: "evidence-focus", workObjectId: value.workObjectId, blockUuid: "focus-evidence" });
    const started = await value.client.startExternalAgentRun({ runId: "run-focus", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: value.workObjectId, evidenceIds: [frozen.evidence.id], executorId: "codex" });
    assert.equal(started.run.state, "STARTED"); assert.equal(started.run.executor.type, "EXTERNAL_CLI");
    await value.client.graphSearch({ query: "交换机", limit: 10, runId: started.run.id }); await value.client.graphBlock("focus-evidence", started.run.id);
    const finished = await value.client.finishExternalAgentRun(started.run.id, { outcome: "PROPOSAL", currentFocus: "补充交换机参数并完善规格说明", reasonCode: "NEW_ACTIONABLE_FOCUS", rationaleSummary: "记录给出了明确下一步。" });
    assert.equal(finished.revision?.skill.contentHash, bootstrap.skills.find((item) => item.id === "current-focus-maintenance")?.contentHash); assert.equal((await value.client.listAgentRunReads(started.run.id)).receipts.length, 2); assert.equal(finished.revision?.evidenceDependencies.length, 1);
    const applied = await value.client.applyExternalProposal(finished.proposal!.id); assert.equal(applied.commit.status, "COMMITTED"); assert.equal((await value.client.showObject(value.workObjectId)).object.currentFocus, "补充交换机参数并完善规格说明");
    assert.equal((await value.client.applyExternalProposal(finished.proposal!.id)).commit.id, applied.commit.id);
    assert.equal((await value.client.finishExternalAgentRun(started.run.id, { outcome: "PROPOSAL", currentFocus: "补充交换机参数并完善规格说明", reasonCode: "NEW_ACTIONABLE_FOCUS", rationaleSummary: "记录给出了明确下一步。" })).proposal?.id, finished.proposal!.id);

    value.records.set("wait-evidence", { content: "厂商尚未提供兼容版本，拿到新版本前无法继续部署。", pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, "wait-evidence", value.records.get("wait-evidence")!.content);
    await value.client.freezeExternalEvidence({ evidenceId: "evidence-wait", workObjectId: value.workObjectId, blockUuid: "wait-evidence" });
    await value.client.startExternalAgentRun({ runId: "run-wait", purpose: "ENGAGEMENT_RECONCILIATION", workObjectId: value.workObjectId, evidenceIds: ["evidence-wait"], executorId: "codex" });
    const wait = await value.client.finishExternalAgentRun("run-wait", { outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待厂商提供兼容版本", reviewAt: null } }, reasonCode: "EXTERNAL_BLOCKER", rationaleSummary: "存在明确外部阻塞。" });
    await value.client.applyExternalProposal(wait.proposal!.id); assert.equal((await value.client.showObject(value.workObjectId)).object.engagement, "WAITING"); assert.equal((await value.client.listActionableObjects()).objects.length, 0);

    value.records.set("resume-evidence", { content: "厂商已经发来兼容版本，可以继续部署。", pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, "resume-evidence", value.records.get("resume-evidence")!.content);
    await value.client.freezeExternalEvidence({ evidenceId: "evidence-resume", workObjectId: value.workObjectId, blockUuid: "resume-evidence" });
    await value.client.startExternalAgentRun({ runId: "run-resume", purpose: "ENGAGEMENT_RECONCILIATION", workObjectId: value.workObjectId, evidenceIds: ["evidence-resume"], executorId: "codex" });
    const resume = await value.client.finishExternalAgentRun("run-resume", { outcome: "PROPOSAL", transition: { from: "WAITING", to: "ACTIONABLE", waiting: null }, reasonCode: "BLOCKER_RESOLVED", rationaleSummary: "外部条件已经满足。" });
    await value.client.applyExternalProposal(resume.proposal!.id); assert.equal((await value.client.showObject(value.workObjectId)).object.engagement, "ACTIONABLE"); assert.deepEqual((await value.client.listActionableObjects()).objects.map((item) => item.id), [value.workObjectId]);
  } finally { value.stop(); await value.service.close(); }
});

test("External NO_PROPOSAL is durable with zero Proposal or Commit", async () => {
  const value = await setup();
  try {
    value.records.set("background", { content: "补充了一段历史背景，没有新的下一步。", pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, "background", value.records.get("background")!.content);
    await value.client.freezeExternalEvidence({ evidenceId: "evidence-background", workObjectId: value.workObjectId, blockUuid: "background" });
    await value.client.startExternalAgentRun({ runId: "run-background", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: value.workObjectId, evidenceIds: ["evidence-background"], executorId: "codex" });
    const before = value.service.store.listCommits().length; const finished = await value.client.finishExternalAgentRun("run-background", { outcome: "NO_PROPOSAL", reasonCode: "NO_FORMAL_CHANGE", rationaleSummary: "只是背景补充。" });
    assert.equal(finished.run.result.outcome, "NO_PROPOSAL"); assert.equal(finished.proposal, null); assert.equal(value.service.store.listCommits().length, before);
  } finally { value.stop(); await value.service.close(); }
});

test("External NEEDS_MORE_CONTEXT is durable and run idempotence is bound to the exact Evidence set", async () => {
  const value = await setup();
  try {
    for (const [id, content] of [["context-one", "信息仍不完整。"], ["context-two", "另一个上下文。"]] as const) { value.records.set(id, { content, pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, id, content); await value.client.freezeExternalEvidence({ evidenceId: `evidence-${id}`, workObjectId: value.workObjectId, blockUuid: id }); }
    const input = { runId: "run-context", purpose: "CURRENT_FOCUS_MAINTENANCE" as const, workObjectId: value.workObjectId, evidenceIds: ["evidence-context-one"], executorId: "codex" };
    await value.client.startExternalAgentRun(input);
    await assert.rejects(value.client.startExternalAgentRun({ ...input, evidenceIds: ["evidence-context-two"] }), /AGENT_RUN_ALREADY_EXISTS/u);
    const before = value.service.store.listCommits().length;
    const finished = await value.client.finishExternalAgentRun(input.runId, { outcome: "NEEDS_MORE_CONTEXT", reasonCode: "INSUFFICIENT_CONTEXT", rationaleSummary: "现有记录不足以形成正式变化。" });
    assert.equal(finished.run.result.outcome, "NEEDS_MORE_CONTEXT"); assert.equal(finished.proposal, null); assert.equal(value.service.store.listCommits().length, before);
  } finally { value.stop(); await value.service.close(); }
});

test("External contract rejects missing Evidence, PARKED result, stale target, and search-only proposal", async () => {
  const value = await setup();
  try {
    await assert.rejects(value.client.startExternalAgentRun({ runId: "run-no-evidence", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: value.workObjectId, evidenceIds: [], executorId: "codex" }), /EVIDENCE_INVALID/u);
    value.records.set("evidence", { content: "厂商尚未提供兼容版本。", pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, "evidence", value.records.get("evidence")!.content);
    await value.client.freezeExternalEvidence({ evidenceId: "evidence-one", workObjectId: value.workObjectId, blockUuid: "evidence" });
    await assert.rejects(value.client.startExternalAgentRun({ runId: "run-wrong-purpose", purpose: "UNSUPPORTED" as never, workObjectId: value.workObjectId, evidenceIds: ["evidence-one"], executorId: "codex" }), /AGENT_RUN_PURPOSE_INVALID/u);
    await value.client.startExternalAgentRun({ runId: "run-parked", purpose: "ENGAGEMENT_RECONCILIATION", workObjectId: value.workObjectId, evidenceIds: ["evidence-one"], executorId: "codex" });
    await assert.rejects(value.client.finishExternalAgentRun("run-parked", { outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "PARKED", waiting: null }, reasonCode: "PARK", rationaleSummary: "park" }), /AGENT_RESULT_INVALID/u);
    assert.equal((await value.client.showAgentRun("run-parked")).run.result.outcome, "FAILED");

    await value.client.startExternalAgentRun({ runId: "run-search", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: value.workObjectId, evidenceIds: ["evidence-one"], executorId: "codex" });
    await value.client.graphSearch({ query: "兼容", limit: 5, runId: "run-search" });
    const searchOnly = await value.client.finishExternalAgentRun("run-search", { outcome: "PROPOSAL", currentFocus: "等待兼容版本", reasonCode: "FOCUS", rationaleSummary: "search" });
    assert.deepEqual(searchOnly.revision?.evidenceDependencies.map((item) => item.evidenceId), ["evidence-one"]);
    assert.equal((await value.client.listAgentRunReads("run-search")).receipts.length, 1);

    await value.client.startExternalAgentRun({ runId: "run-stale", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: value.workObjectId, evidenceIds: ["evidence-one"], executorId: "codex" });
    const snapshot = await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source" });
    const renamed = await value.client.prepare(parseSemanticOperation({ operationId: "rename-during-external-run", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: value.workObjectId, expectedVersion: 1, expectedProjectionHash: snapshot.projection!.projectionHash }, input: { title: "验证外部 Agent 治理更新" } }), snapshot);
    const applied = await value.graph.applyGraphEffect(renamed.graphEffect as GraphEffect); await value.client.complete(renamed.commit.id, applied, await value.graph.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: "source" }));
    await assert.rejects(value.client.finishExternalAgentRun("run-stale", { outcome: "PROPOSAL", currentFocus: "新推进", reasonCode: "FOCUS", rationaleSummary: "stale" }), /AGENT_RUN_TARGET_STALE/u);
    assert.equal((await value.client.showAgentRun("run-stale")).run.result.outcome, "FAILED");
  } finally { value.stop(); await value.service.close(); }
});

test("Graph Adapter offline fails fast without creating a formal Commit", async () => {
  const value = await setup();
  try {
    value.records.set("evidence", { content: "明确下一步。", pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, "evidence", "明确下一步。");
    await value.client.freezeExternalEvidence({ evidenceId: "evidence-offline", workObjectId: value.workObjectId, blockUuid: "evidence" });
    await value.client.startExternalAgentRun({ runId: "run-offline", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: value.workObjectId, evidenceIds: ["evidence-offline"], executorId: "codex" });
    const result = await value.client.finishExternalAgentRun("run-offline", { outcome: "PROPOSAL", currentFocus: "明确下一步", reasonCode: "FOCUS", rationaleSummary: "明确" });
    const before = value.service.store.listCommits().length; value.stop(); await new Promise((resolve) => setTimeout(resolve, 3_100));
    await assert.rejects(value.client.applyExternalProposal(result.proposal!.id), /GRAPH_ADAPTER_OFFLINE/u); assert.equal(value.service.store.listCommits().length, before);
  } finally { value.stop(); await value.service.close(); }
});

test("External apply invalidates stale Evidence and safely retries a transient Graph failure", async () => {
  const stale = await setup();
  try {
    stale.records.set("stale", { content: "下一步是验证交换机配置。", pageName: "Synthetic Phase 6" }); stale.graph.seedNaturalRecord(stale.graphId, "stale", "下一步是验证交换机配置。");
    await stale.client.freezeExternalEvidence({ evidenceId: "evidence-stale", workObjectId: stale.workObjectId, blockUuid: "stale" });
    await stale.client.startExternalAgentRun({ runId: "run-stale-evidence", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: stale.workObjectId, evidenceIds: ["evidence-stale"], executorId: "codex" });
    const result = await stale.client.finishExternalAgentRun("run-stale-evidence", { outcome: "PROPOSAL", currentFocus: "验证交换机配置", reasonCode: "FOCUS", rationaleSummary: "明确" });
    stale.graph.editNaturalContent(stale.graphId, "stale", "交换机配置已经验证完成。");
    await assert.rejects(stale.client.applyExternalProposal(result.proposal!.id), /PROPOSAL_EVIDENCE_STALE/u); assert.equal((await stale.client.showProposal(result.proposal!.id)).proposal.status, "INVALIDATED");
  } finally { stale.stop(); await stale.service.close(); }

  const retry = await setup();
  try {
    retry.records.set("retry", { content: "下一步是验证交换机配置。", pageName: "Synthetic Phase 6" }); retry.graph.seedNaturalRecord(retry.graphId, "retry", "下一步是验证交换机配置。");
    await retry.client.freezeExternalEvidence({ evidenceId: "evidence-retry", workObjectId: retry.workObjectId, blockUuid: "retry" });
    await retry.client.startExternalAgentRun({ runId: "run-retry", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: retry.workObjectId, evidenceIds: ["evidence-retry"], executorId: "codex" });
    const result = await retry.client.finishExternalAgentRun("run-retry", { outcome: "PROPOSAL", currentFocus: "验证交换机配置", reasonCode: "FOCUS", rationaleSummary: "明确" });
    retry.graph.failNextApply(); await assert.rejects(retry.client.applyExternalProposal(result.proposal!.id), /GRAPH_APPLY_PENDING/u);
    assert.equal((await retry.client.listRecovery()).recovery[0]?.action, "RESUME_GRAPH_APPLY");
    const applied = await retry.client.applyExternalProposal(result.proposal!.id); assert.equal(applied.commit.status, "COMMITTED"); assert.equal(applied.recovered, true);
  } finally { retry.stop(); await retry.service.close(); }
});

test("a pending External proposal resumes after Kernel restart and Plugin worker reload", async () => {
  const value = await setup(); let service = value.service; let stop = value.stop;
  try {
    value.records.set("restart", { content: "下一步是核对恢复路径。", pageName: "Synthetic Phase 6" }); value.graph.seedNaturalRecord(value.graphId, "restart", "下一步是核对恢复路径。");
    await value.client.freezeExternalEvidence({ evidenceId: "evidence-restart", workObjectId: value.workObjectId, blockUuid: "restart" });
    await value.client.startExternalAgentRun({ runId: "run-restart", purpose: "CURRENT_FOCUS_MAINTENANCE", workObjectId: value.workObjectId, evidenceIds: ["evidence-restart"], executorId: "codex" });
    const result = await value.client.finishExternalAgentRun("run-restart", { outcome: "PROPOSAL", currentFocus: "核对恢复路径", reasonCode: "FOCUS", rationaleSummary: "记录给出明确下一步。" });
    value.graph.failNextApply(); await assert.rejects(value.client.applyExternalProposal(result.proposal!.id), /GRAPH_APPLY_PENDING/u);
    stop(); await service.close();

    service = await startKernelServer({ databasePath: value.databasePath, descriptorPath: value.descriptorPath, token: "token-2", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "c".repeat(64), now: () => at, graphRequestTimeoutMs: 500 });
    const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
    stop = startBridge({ baseUrl: service.baseUrl, bridgeToken: service.graphBridgeToken, snapshotKey: service.graphSnapshotKey, graphId: value.graphId, graph: value.graph, records: value.records });
    for (let attempt = 0; attempt < 20 && !(await client.graphStatus()).available; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    const applied = await client.applyExternalProposal(result.proposal!.id);
    assert.equal(applied.commit.status, "COMMITTED"); assert.equal(applied.recovered, true);
    assert.equal((await client.showObject(value.workObjectId)).object.currentFocus, "核对恢复路径");
  } finally { stop(); await service.close(); }
});
