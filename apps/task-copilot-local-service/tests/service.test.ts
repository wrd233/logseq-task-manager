import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalServiceClient, type ServiceDescriptor } from "@task-copilot/service-client";
import { V2_DATABASE_SCHEMA_VERSION, V2SqliteStore } from "@task-copilot/persistence/node";
import { exportRecoveryBundle } from "@task-copilot/persistence";
import { createEmptyState, V2Application } from "@task-copilot/application";
import { checksum } from "@task-copilot/shared";
import { createManagedObject, type V2Proposal } from "@task-copilot/domain";

import { LOCAL_SERVICE_PROTOCOL_VERSION, startLocalService } from "../src/service.ts";
import { LocalLlmProposalGenerator, type StructuredProposalProvider, type V2PromptBundle } from "../src/llm-proposal.ts";

function clientFor(service: { url: string; token: string }): LocalServiceClient {
  const descriptor: ServiceDescriptor = {
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    url: service.url,
    token: service.token,
    pid: process.pid,
    createdAt: "2026-07-20T06:00:00.000Z",
  };
  return new LocalServiceClient(descriptor);
}

function validProposal(): V2Proposal {
  const beforeText = "普通正文";
  const afterText = "[任务] 普通正文";
  return {
    proposalId: "prop_service_validate", schemaVersion: "v2", title: "正式化正文", context: "当前为普通正文。", understanding: "建议建立 Task。", objective: "形成正式对象。", logic: "标识和对象一起提交。", finalPreview: afterText, unresolvedQuestions: [], source: { kind: "user" },
    scope: { read: [], modify: [{ kind: "BLOCK", id: "proposal-block", version: 1, hash: checksum(beforeText) }] }, preconditions: ["hash unchanged"],
    groups: [{ groupId: "formalize", explanation: "一个不可拆的正式化组。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [], textPatches: [{ blockUuid: "proposal-block", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }], semanticOperations: [{ operationId: "create-task", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "proposal-block", version: 1, hash: checksum(beforeText) }, summary: "创建 Task 与 Anchor", payload: { objectType: "TASK", text: "普通正文" }, preconditions: [] }], disposition: "PENDING" }],
    status: "READY", createdAt: "2026-07-20T12:00:00.000Z",
  };
}

function projectClosureProposal(objectId: string, version: number): V2Proposal {
  const closure = {
    originalGoal: "让告警外部推送可控。", actualResult: "新链路和回滚验证已完成。", majorDeliverables: ["推送服务", "验收报告"],
    incompleteObjectives: [{ objective: "历史告警回放", reason: "源数据未齐", nextStep: "转入数据治理 Project" }],
    legacyDisposition: "由数据治理 Project 承接剩余回放。", keyDecisions: ["保留人工回退开关"], futureSummary: "重入时先检查历史数据完整性。",
  };
  return {
    proposalId: "prop_project_closure", schemaVersion: "v2", title: "关闭告警推送治理", context: "主要交付已完成。", understanding: "历史回放未完成但有明确承接。", objective: "形成 Closure 并完成 Project。", logic: "Closure 与 Lifecycle 在同一正式变化中生效。", finalPreview: "新链路已上线；历史回放转入数据治理。", unresolvedQuestions: [], source: { kind: "external_agent", skillVersion: "design-project@1" },
    scope: { read: [{ kind: "PAGE", id: "Project/告警推送治理", hash: checksum("project-closure-context") }], modify: [{ kind: "OBJECT", id: objectId, version }] }, preconditions: ["Project 仍为 OPEN"],
    groups: [{ groupId: "close-project", explanation: "Closure 与 Project 完成不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [
      { operationId: "record-closure", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: objectId, version }, summary: "记录结构化 Closure", payload: { closure }, preconditions: [] },
      { operationId: "complete-project", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: objectId, version }, summary: "完成 Project", payload: { lifecycle: "COMPLETED" }, preconditions: [] },
    ], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-21T12:00:00.000Z",
  };
}

function miniProjectClosureProposal(objectId: string, version: number): V2Proposal {
  return {
    proposalId: "prop_agent_mini_closure", schemaVersion: "v2", title: "关闭小型交付", context: "MiniProject 已达成有限结果。", understanding: "用户需要确认三问后关闭。", objective: "记录 Closure 并完成同一 MiniProject。", logic: "只修改带版本正式对象，不依赖 Marker。", finalPreview: "等待用户审阅三问。", unresolvedQuestions: ["原目标？", "实际结果？", "遗留？"], source: { kind: "external_agent", skillVersion: "task-copilot-core@1" },
    scope: { read: [], modify: [{ kind: "OBJECT", id: objectId, version }] }, preconditions: ["MiniProject 仍为 OPEN"],
    groups: [{ groupId: "complete-mini-project", explanation: "Closure 与完成不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "complete-mini-project", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: objectId, version }, summary: "完成 MiniProject", payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT" }, preconditions: ["Object 仍为 OPEN"] }], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-22T10:00:00.000Z",
  };
}

function ownershipProposal(childObjectId: string, childVersion: number, ownerObjectId: string, ownerVersion: number, expectedCurrentOwnerId?: string, proposalId = "prop_primary_owner"): V2Proposal {
  return { proposalId, schemaVersion: "v2", title: "设置主归属", context: "Task 当前归属已由版本证据表达。", understanding: "将 Task 归入已存在 Project。", objective: "建立唯一主归属。", logic: "独立 HIGH 组审阅且不改变位置。", finalPreview: "Task 的 Primary Owner 将更新。", unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [{ kind: "OBJECT", id: ownerObjectId, version: ownerVersion }], modify: [{ kind: "OBJECT", id: childObjectId, version: childVersion }] }, preconditions: ["child 与 owner 版本未变化"], groups: [{ groupId: "change-owner", explanation: "主归属独立审阅。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "change-owner", kind: "CHANGE_OWNERSHIP", target: { kind: "OBJECT", id: childObjectId, version: childVersion }, summary: "设置 Primary Owner", payload: { ownerObjectId, ...(expectedCurrentOwnerId ? { expectedCurrentOwnerId } : {}) }, preconditions: [] }], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-21T13:00:00.000Z" };
}

const proposalPrompt: V2PromptBundle = {
  core: { version: "core-1", content: "只生成 Proposal。" },
  domain: { version: "domain-6", content: "正式状态只经 Application Command。" },
  skill: { version: "formalize-1", content: "识别明确承诺。" },
  userSemantics: { version: "profile-1", content: "简洁中文。" },
  runtimeContext: { version: "block-v1", content: "普通正文" },
};

test("Local Service is loopback-only, authenticated, and reports one SQLite authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-"));
  let closed = false;
  const service = await startLocalService({
    databasePath: join(root, ".task-copilot", "task-copilot.db"),
    graphId: "graph-service-test",
    token: "test-session-token-at-least-24-characters",
    descriptorPath: join(root, "runtime", "service.json"),
  });
  t.after(async () => {
    if (!closed) await service.close();
    await rm(root, { recursive: true, force: true });
  });
  assert.match(service.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal((await stat(join(root, "runtime", "service.json"))).mode & 0o777, 0o600);
  const unauthorized = await fetch(new URL("health", service.url));
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(await unauthorized.text(), /test-session-token/);

  const headers = { authorization: `Bearer ${service.token}` };
  const health = await fetch(new URL("health", service.url), { headers });
  assert.deepEqual(await health.json(), {
    status: "READY",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    capabilities: { formalWrites: true, migration: true, provider: false, backup: true, graphReadBridge: true },
  });
  const status = await fetch(new URL("status", service.url), { headers });
  assert.deepEqual(await status.json(), {
    status: "READY",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    capabilities: { formalWrites: true, migration: true, provider: false, backup: true, graphReadBridge: true },
    databaseSchemaVersion: V2_DATABASE_SCHEMA_VERSION,
    objectCount: 0,
  });
  const doctor = await fetch(new URL("doctor", service.url), { method: "POST", headers });
  const doctorReport = await doctor.json() as Awaited<ReturnType<LocalServiceClient["doctor"]>>;
  assert.equal(doctorReport.status, "PASS");
  assert.equal(doctorReport.checks?.find(({ component }) => component === "BACKUP")?.code, "BACKUP_NONE");
  assert.equal(doctorReport.checks?.find(({ component }) => component === "GRAPH")?.code, "GRAPH_READ_BRIDGE_NOT_CONNECTED");
  assert.equal(doctorReport.checks?.find(({ component }) => component === "SEMANTIC_COMMIT")?.status, "PASS");
  assert.deepEqual(doctorReport.summary, { pass: 10, warn: 1, fail: 0, info: 3 });
  assert.equal(doctorReport.limitations?.length, 3);
  await service.close();
  closed = true;
  await assert.rejects(access(join(root, "runtime", "service.json")));
});
test("Local Service exposes object reads but refuses an unscoped generic write route", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-read-only",
    token: "another-test-session-token-24-chars",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const headers = { authorization: `Bearer ${service.token}` };
  const list = await fetch(new URL("objects", service.url), { headers });
  assert.deepEqual(await list.json(), { objects: [] });
  assert.equal((await fetch(new URL("objects/missing", service.url), { headers })).status, 404);
  const write = await fetch(new URL("objects", service.url), { method: "POST", headers });
  assert.equal(write.status, 404);
});

test("Local Service exposes the same immutable versioned Skill catalog to every client", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-skills-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-skills", token: "skills-service-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const skills = await client.listSkills();
  assert.deepEqual(skills.map(({ name, version }) => ({ name, version })), [
    { name: "task-copilot-core", version: "1.0.0" },
    { name: "design-project", version: "1.1.0" },
  ]);
  const project = await client.getSkill("design-project");
  assert.match(project?.content ?? "", /Apply `task-copilot-core` first/);
  assert.match(project?.content ?? "", /"schemaVersion": "v2"/);
  assert.equal(project?.sha256, skills.find(({ name }) => name === "design-project")?.sha256);
  assert.equal(await client.getSkill("missing"), undefined);
  assert.equal((await client.status()).objectCount, 0, "Skill reads do not create formal state");
});

test("Local Service exports a read-only Project Context Package without Graph scanning or formal writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-context-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-context", token: "context-service-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const prepared = await client.prepareProject({ name: "Context Export", traceId: "context-project-prepare" });
  await client.finalizeProject({ semanticCommitId: prepared.semanticCommitId, objectId: prepared.objectId, name: "Context Export", pageExternalId: "page-context-export", pageContentHash: checksum(""), traceId: "context-project-finalize" });
  const before = await client.status();
  const result = await client.exportContext("project", prepared.objectId);
  assert.equal(result.contextPackage.manifest.includedObjectCount, 1);
  assert.equal(result.contextPackage.manifest.graphExcerptStatus, "NOT_INCLUDED");
  assert.match(result.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(result.contextPackage.files["versions.json"] ?? "").databaseSchemaVersion, V2_DATABASE_SCHEMA_VERSION);
  assert.deepEqual(await client.status(), before, "Context export does not mutate formal state");
  await assert.rejects(() => client.exportContext("object", "missing"), /Context 根对象不存在/);
});

test("Local Service relays bounded Logseq Graph reads and exports page Context without formal writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-graph-context-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-read-context", token: "graph-read-service-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  await assert.rejects(() => client.readGraph({ kind: "PAGE", target: "Project/Bridge", depth: 1 }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "GRAPH_READ_BRIDGE_UNAVAILABLE");

  const prepared = await client.prepareProject({ name: "Bridge", traceId: "graph-bridge-project-prepare" });
  await client.finalizeProject({ semanticCommitId: prepared.semanticCommitId, objectId: prepared.objectId, name: "Bridge", pageExternalId: "page-bridge", pageContentHash: checksum(""), traceId: "graph-bridge-project-finalize" });
  const before = await client.status();
  const answerNext = async () => {
    const request = await client.claimGraphReadRequest();
    assert.equal(request?.kind, "PAGE");
    if (!request) throw new Error("expected a Graph bridge request");
    const resolved = { kind: "PAGE" as const, id: "page-bridge", name: "Project/Bridge", version: 7, evidenceHash: checksum("page-bridge-evidence") };
    const blocks = [{ uuid: "block-bridge", content: "[任务] Read bridge", contentHash: checksum("[任务] Read bridge"), relation: "ROOT" as const, depth: 0, pageUuid: "page-bridge", pageName: "Project/Bridge" }];
    const snapshot = { kind: "PAGE" as const, requestedTarget: request.target, resolved, blocks, truncated: false, readAt: "2026-07-22T10:00:00.000Z", scopeHash: checksum({ kind: "PAGE", resolved, blocks, truncated: false }) };
    await client.completeGraphReadRequest({ requestId: request.requestId, status: "FOUND", snapshot });
  };

  const bridgeRead = answerNext();
  const snapshot = await client.readGraph({ kind: "PAGE", target: "Project/Bridge", depth: 1 });
  await bridgeRead;
  assert.equal(snapshot.scopeHash, checksum({ kind: "PAGE", resolved: snapshot.resolved, blocks: snapshot.blocks, truncated: false }));

  const bridgeExport = answerNext();
  const exported = await client.exportContext("page", "Project/Bridge");
  await bridgeExport;
  assert.equal(exported.contextPackage.manifest.graphExcerptStatus, "AVAILABLE_FROM_LOGSEQ_BRIDGE");
  assert.equal(JSON.parse(exported.contextPackage.files["graph/page.json"] ?? "").snapshot.resolved.id, "page-bridge");
  assert.deepEqual(JSON.parse(exported.contextPackage.files["modify-scope.json"] ?? "").targets, [{ kind: "PAGE", id: "page-bridge", version: 7, hash: checksum("page-bridge-evidence") }]);
  assert.deepEqual(JSON.parse(exported.contextPackage.files["objects.json"] ?? "").formalFacts.map(({ objectId }: { objectId: string }) => objectId), [prepared.objectId]);
  assert.equal((await client.doctor()).checks?.find(({ component }) => component === "GRAPH")?.code, "GRAPH_READ_BRIDGE_CONNECTED");
  assert.deepEqual(await client.status(), before, "Graph read and Context export do not mutate formal state");
});

test("Local Service adds one confirmed plain Association without changing Primary Ownership", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-association-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-association", token: "association-service-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const createProject = async (name: string, suffix: string) => {
    const intent = await client.prepareProject({ name, traceId: `prepare-${suffix}` });
    return client.finalizeProject({ semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name, pageExternalId: `page-${suffix}`, pageContentHash: checksum(name), traceId: `finalize-${suffix}` });
  };
  const source = await createProject("Association Source", "source");
  const target = await createProject("Association Target", "target");
  assert.deepEqual(await client.listPrimaryOwnerships(), [], "Primary Ownership has a distinct read projection");
  const malformed = await fetch(new URL("associations", service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ sourceObjectId: source.object.objectId, targetObjectId: target.object.objectId, expectedVersion: 1, traceId: "missing-confirmation" }) });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await client.listAssociations(), []);
  const added = await client.addAssociation({ sourceObjectId: source.object.objectId, targetObjectId: target.object.objectId, expectedVersion: source.object.version, confirmation: "ADD_ASSOCIATION", traceId: "trace-association" });
  assert.equal(added.object.version, source.object.version + 1);
  assert.equal(added.association.associationKind, "RELATED");
  assert.deepEqual(await client.listAssociations(), [added.association]);
  assert.equal((await client.exportContext("project", source.object.objectId)).contextPackage.files["relations.json"]?.includes(target.object.objectId), false, "Association export remains pending instead of pretending to be Ownership");
  await assert.rejects(() => client.addAssociation({ sourceObjectId: source.object.objectId, targetObjectId: target.object.objectId, expectedVersion: added.object.version, confirmation: "ADD_ASSOCIATION", traceId: "trace-duplicate-association" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_ASSOCIATION_EXISTS");
  await assert.rejects(() => client.addAssociation({ sourceObjectId: target.object.objectId, targetObjectId: target.object.objectId, expectedVersion: target.object.version, confirmation: "ADD_ASSOCIATION", traceId: "trace-self-association" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 400 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_ASSOCIATION_SELF_REFERENCE");
  await assert.rejects(() => client.addAssociation({ sourceObjectId: target.object.objectId, targetObjectId: "missing-association-target", expectedVersion: target.object.version, confirmation: "ADD_ASSOCIATION", traceId: "trace-missing-association" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 404 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_NOT_FOUND");
  assert.equal((await client.getObject(source.object.objectId))?.version, added.object.version, "duplicate Association rolls back source version");
});

test("Local Service persists bounded Candidate discovery and all non-formal review dispositions without creating Objects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-candidate-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-candidate", token: "candidate-service-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const content = "[任务] 核对 Candidate 闭环";
  const contentHash = checksum(content);
  const discovery = { sourceAnchorId: "block-candidate", sourceVersion: `7:${contentHash}`, candidateKind: "WORK_ITEM" as const, reason: "显式对象标识尚未建立正式对象", suggestion: "生成 Proposal 后审阅", traceId: "candidate-discover-service" };
  const created = await client.discoverCandidate(discovery);
  assert.equal(created.replayed, false);
  assert.equal(created.candidate.disposition, "PENDING");
  assert.equal("sourceText" in created.candidate, false, "Candidate authority must not duplicate Logseq source text");
  assert.deepEqual(await client.listObjects(), [], "scan creates Candidate only, never a formal Object");
  const repeated = await client.discoverCandidate({ ...discovery, traceId: "candidate-discover-repeat" });
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.candidate.candidateId, created.candidate.candidateId);
  const later = await client.setCandidateDisposition(created.candidate.candidateId, { disposition: "LATER", reason: "等待上下文", deferredUntil: "2099-07-28T13:20:00.000Z", expectedUpdatedAt: created.candidate.updatedAt, traceId: "candidate-later-service" });
  assert.equal(later.candidate.disposition, "LATER");
  assert.equal((await client.listCandidates())[0]?.disposition, "LATER");
  await assert.rejects(() => client.setCandidateDisposition(created.candidate.candidateId, { disposition: "DISMISSED", reason: "旧视图", expectedUpdatedAt: created.candidate.updatedAt, traceId: "candidate-stale-service" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_CANDIDATE_STALE");
  const malformed = await fetch(new URL("candidates/discover", service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ ...discovery, sourceText: "不得进入 Candidate" }) });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await client.listObjects(), []);

  const formalized = await client.formalizeCandidate(created.candidate.candidateId, { sourceAnchorId: "block-candidate", inputVersion: "7", contentHash, content, objectType: "TASK", text: "核对 Candidate 闭环", expectedUpdatedAt: later.candidate.updatedAt, traceId: "candidate-formalize-service" });
  assert.equal(formalized.candidate.activeProposalId, formalized.record.proposal.proposalId);
  assert.equal(formalized.record.proposal.status, "READY");
  assert.deepEqual(await client.listObjects(), [], "formalization creates only a Proposal before review and Commit");
  await assert.rejects(() => client.setCandidateDisposition(created.candidate.candidateId, { disposition: "DISMISSED", reason: "不能绕过 Proposal 审阅", expectedUpdatedAt: formalized.candidate.updatedAt, traceId: "candidate-disposition-with-active-proposal" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_CANDIDATE_PROPOSAL_ACTIVE");
  const replayedFormalization = await client.formalizeCandidate(created.candidate.candidateId, { sourceAnchorId: "block-candidate", inputVersion: "7", contentHash, content, objectType: "TASK", text: "核对 Candidate 闭环", expectedUpdatedAt: later.candidate.updatedAt, traceId: "candidate-formalize-retry" });
  assert.equal(replayedFormalization.replayed, true);
  assert.equal((await client.listProposals()).length, 1, "one Candidate has one current Proposal");

  const reviewed = await client.reviewProposal(formalized.record.proposal.proposalId, { "formalize-candidate": { disposition: "ACCEPTED" } }, formalized.record.updatedAt);
  const observations = [{ kind: "BLOCK" as const, id: "block-candidate", exists: true, version: 7, hash: contentHash }];
  const prepared = await client.prepareProposalCommit(reviewed.proposal.proposalId, observations, reviewed.updatedAt);
  assert.equal(prepared.status, "PREPARED");
  if (prepared.status !== "PREPARED") throw new Error("candidate proposal was not prepared");
  const committed = await client.finalizeProposalCommit(reviewed.proposal.proposalId, { semanticCommitId: prepared.semanticCommitId, proposalId: reviewed.proposal.proposalId, expectedUpdatedAt: reviewed.updatedAt, blockUuid: "block-candidate", contentHash, inputVersion: "7", traceId: "candidate-commit-service" });
  assert.equal(committed.status, "COMPLETED");
  assert.equal((await client.listCandidates())[0]?.disposition, "RESOLVED");
  assert.equal((await client.listObjects()).length, 1);

  const undoPrepared = await client.prepareProposalUndo(prepared.semanticCommitId, "candidate-undo-prepare");
  const undone = await client.finalizeProposalUndo(prepared.semanticCommitId, { originalSemanticCommitId: prepared.semanticCommitId, undoSemanticCommitId: undoPrepared.undoSemanticCommitId, blockUuid: "block-candidate", contentHash, inputVersion: "7", traceId: "candidate-undo-finalize" });
  assert.equal(undone.status, "COMPLETED");
  assert.equal((await client.listCandidates())[0]?.disposition, "PENDING", "Undo reopens the same Candidate instead of losing the work item");
  assert.equal((await client.listCandidates())[0]?.activeProposalId, undefined);
  assert.deepEqual(await client.listObjects(), []);

  const maintenance = await V2SqliteStore.open(join(root, "task-copilot.db"));
  maintenance.initialize("graph-candidate");
  const reopened = maintenance.getCandidate(created.candidate.candidateId);
  if (!reopened) throw new Error("Candidate missing while simulating the post-Undo recovery window");
  maintenance.updateCandidate({ ...reopened, disposition: "RESOLVED", activeProposalId: reviewed.proposal.proposalId, updatedAt: "2026-07-21T23:59:00.000Z" }, reopened.updatedAt, "simulate-undo-before-candidate-reopen");
  const maintenanceDatabase = (maintenance as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): unknown } } }).database;
  maintenanceDatabase.prepare("DELETE FROM command_receipts WHERE idempotency_key = ?").run(`candidate-reopen:${created.candidate.candidateId}:${reviewed.proposal.proposalId}`);
  maintenance.close();
  assert.equal((await client.listCandidates())[0]?.disposition, "RESOLVED", "fixture reproduces crash after Commit UNDONE but before Candidate reopen");
  const replayedUndo = await client.prepareProposalUndo(prepared.semanticCommitId, "candidate-undo-replay-after-gap");
  assert.equal(replayedUndo.status, "COMPLETED");
  assert.equal((await client.listCandidates())[0]?.disposition, "PENDING", "completed Undo replay repairs the Candidate reopen gap idempotently");
});

test("Local Service does not let explicit sync bypass unresolved Candidate review", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-candidate-authority-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-candidate-authority", token: "candidate-authority-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const content = "[任务] Candidate 审阅权威";
  const contentHash = checksum(content);
  await client.discoverCandidate({ sourceAnchorId: "block-candidate-authority", sourceVersion: `1:${contentHash}`, candidateKind: "WORK_ITEM", reason: "显式对象标识尚未建立正式对象", suggestion: "生成 Proposal 后审阅", traceId: "candidate-authority-discover" });

  await assert.rejects(() => client.synchronizeExplicitObject({
    objectType: "TASK", text: "Candidate 审阅权威", externalId: "block-candidate-authority", inputVersion: "1", contentHash,
    idempotencyKey: "candidate-authority-sync", traceId: "candidate-authority-sync",
  }), (error: unknown) => error instanceof Error && "details" in error
    && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409
    && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_EXPLICIT_CANDIDATE_REVIEW_REQUIRED");
  assert.deepEqual(await client.listObjects(), [], "Candidate remains Proposal-only until Review and Commit");
});

test("UPDATE Candidate proposes, commits, and undoes a versioned existing object without creating a second object", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-candidate-update-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-candidate-update", token: "candidate-update-service-token-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const targetContent = "[任务] 核对旧告警";
  const target = await client.synchronizeExplicitObject({ objectType: "TASK", text: "核对旧告警", externalId: "target-update-block", inputVersion: "8", contentHash: checksum(targetContent), idempotencyKey: "create-update-target", traceId: "create-update-target" });
  const sourceContent = "供应商补充：新告警必须记录结论";
  const discovered = await client.discoverCandidate({ sourceAnchorId: "candidate-update-source", sourceVersion: `3:${checksum(sourceContent)}`, candidateKind: "UPDATE", reason: "包含已有工作的补充事实", suggestion: "更新已有对象", traceId: "discover-update-candidate" });
  const afterContent = "[任务] 核对新告警并记录结论";
  const updateRequest = {
    sourceAnchorId: "candidate-update-source", sourceInputVersion: "3", sourceContentHash: checksum(sourceContent),
    targetObjectId: target.object.objectId, targetExternalId: target.anchor.externalId, targetInputVersion: "8", targetContentHash: checksum(targetContent), targetContent,
    afterContent, expectedUpdatedAt: discovered.candidate.updatedAt, traceId: "propose-update-candidate",
  };
  await assert.rejects(() => client.updateCandidate(discovered.candidate.candidateId, { ...updateRequest, targetContent: "[任务] stale target", targetContentHash: checksum("[任务] stale target") }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_CANDIDATE_UPDATE_TARGET_STALE");
  await assert.rejects(() => client.updateCandidate(discovered.candidate.candidateId, { ...updateRequest, afterContent: "[成果] Graph 与对象不得分叉" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 400 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_CANDIDATE_UPDATE_REQUEST_INVALID");
  await assert.rejects(() => client.updateCandidate(discovered.candidate.candidateId, { ...updateRequest, afterContent: "[任务] DONE 核对新告警并记录结论" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 400 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_CANDIDATE_UPDATE_REQUEST_INVALID");
  assert.equal((await client.getObject(target.object.objectId))?.version, target.object.version, "stale target creates no Proposal or formal write");
  assert.equal((await client.listProposals()).length, 0);
  const proposed = await client.updateCandidate(discovered.candidate.candidateId, updateRequest);
  assert.equal(proposed.record.proposal.status, "READY");
  assert.equal((await client.listObjects()).length, 1, "Proposal creation must not create a second object or update the target");
  assert.equal((await client.getObject(target.object.objectId))?.text, "核对旧告警");
  for (const [suffix, beforeText, text] of [["forged-before", "伪造旧标题", "核对新告警并记录结论"], ["divergent-after", "核对旧告警", "与 Graph 不一致的领域标题"]] as const) {
    const forged: V2Proposal = {
      ...proposed.record.proposal,
      proposalId: `${proposed.record.proposal.proposalId}_${suffix}`,
      groups: proposed.record.proposal.groups.map((group) => ({
        ...group,
        semanticOperations: group.semanticOperations.map((operation) => ({ ...operation, payload: { ...operation.payload, beforeText, text } })),
      })),
    };
    const submitted = await client.submitProposal(forged);
    const accepted = await client.reviewProposal(forged.proposalId, { "update-existing-object": { disposition: "ACCEPTED" } }, submitted.record.updatedAt);
    await assert.rejects(() => client.prepareProposalCommit(forged.proposalId, [
      { kind: "BLOCK", id: "candidate-update-source", exists: true, version: 3, hash: checksum(sourceContent) },
      { kind: "BLOCK", id: target.anchor.externalId, exists: true, version: 8, hash: checksum(targetContent) },
    ], accepted.updatedAt), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_UPDATE_TARGET_STALE");
  }
  assert.equal((await client.getObject(target.object.objectId))?.text, "核对旧告警", "forged external Proposal evidence remains zero-write");
  const reviewed = await client.reviewProposal(proposed.record.proposal.proposalId, { "update-existing-object": { disposition: "ACCEPTED" } }, proposed.record.updatedAt);
  const prepared = await client.prepareProposalCommit(reviewed.proposal.proposalId, [
    { kind: "BLOCK", id: "candidate-update-source", exists: true, version: 3, hash: checksum(sourceContent) },
    { kind: "BLOCK", id: target.anchor.externalId, exists: true, version: 8, hash: checksum(targetContent) },
  ], reviewed.updatedAt);
  if (prepared.status !== "PREPARED") throw new Error("expected prepared UPDATE Candidate Commit");
  assert.equal(prepared.objectId, target.object.objectId);
  assert.ok("update" in prepared.plan);
  const completed = await client.finalizeProposalCommit(reviewed.proposal.proposalId, { semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, expectedUpdatedAt: prepared.expectedUpdatedAt, blockUuid: target.anchor.externalId, contentHash: checksum(afterContent), inputVersion: "9", traceId: "commit-update-candidate" });
  if (completed.status !== "COMPLETED") throw new Error("expected completed UPDATE Candidate Commit");
  assert.equal(completed.object.objectId, target.object.objectId);
  assert.equal(completed.object.version, target.object.version + 1);
  assert.equal(completed.object.text, "核对新告警并记录结论");
  assert.equal((await client.listCandidates())[0]?.disposition, "RESOLVED");
  const undo = await client.prepareProposalUndo(prepared.semanticCommitId, "prepare-update-undo");
  assert.equal(undo.status, "PREPARED");
  const undone = await client.finalizeProposalUndo(prepared.semanticCommitId, { originalSemanticCommitId: prepared.semanticCommitId, undoSemanticCommitId: undo.undoSemanticCommitId, blockUuid: target.anchor.externalId, contentHash: checksum(targetContent), inputVersion: "10", traceId: "finalize-update-undo" });
  assert.equal(undone.status, "COMPLETED");
  assert.equal((await client.getObject(target.object.objectId))?.text, "核对旧告警");
  assert.equal((await client.getObject(target.object.objectId))?.version, target.object.version + 2);
  assert.equal((await client.listCandidates())[0]?.disposition, "PENDING");
});

test("UPDATE Commit refuses an Anchor binding change after prepare instead of updating another object", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-candidate-update-binding-"));
  const databasePath = join(root, "task-copilot.db");
  const service = await startLocalService({ databasePath, graphId: "graph-candidate-update-binding", token: "candidate-update-binding-token-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const targetContent = "[任务] 原目标";
  const target = await client.synchronizeExplicitObject({ objectType: "TASK", text: "原目标", externalId: "binding-target", inputVersion: "1", contentHash: checksum(targetContent), idempotencyKey: "binding-target", traceId: "binding-target" });
  const otherContent = "[任务] 另一对象";
  const other = await client.synchronizeExplicitObject({ objectType: "TASK", text: "另一对象", externalId: "binding-other", inputVersion: "1", contentHash: checksum(otherContent), idempotencyKey: "binding-other", traceId: "binding-other" });
  const sourceContent = "把补充信息并入原目标";
  const discovered = await client.discoverCandidate({ sourceAnchorId: "binding-source", sourceVersion: `1:${checksum(sourceContent)}`, candidateKind: "UPDATE", reason: "补充", suggestion: "更新已有对象", traceId: "binding-discover" });
  const proposed = await client.updateCandidate(discovered.candidate.candidateId, {
    sourceAnchorId: "binding-source", sourceInputVersion: "1", sourceContentHash: checksum(sourceContent), targetObjectId: target.object.objectId,
    targetExternalId: target.anchor.externalId, targetInputVersion: "1", targetContentHash: checksum(targetContent), targetContent,
    afterContent: "[任务] 原目标已补充", expectedUpdatedAt: discovered.candidate.updatedAt, traceId: "binding-propose",
  });
  const reviewed = await client.reviewProposal(proposed.record.proposal.proposalId, { "update-existing-object": { disposition: "ACCEPTED" } }, proposed.record.updatedAt);
  const prepared = await client.prepareProposalCommit(reviewed.proposal.proposalId, [
    { kind: "BLOCK", id: "binding-source", exists: true, version: 1, hash: checksum(sourceContent) },
    { kind: "BLOCK", id: target.anchor.externalId, exists: true, version: 1, hash: checksum(targetContent) },
  ], reviewed.updatedAt);
  if (prepared.status !== "PREPARED") throw new Error("expected prepared binding-race Commit");
  const maintenance = await V2SqliteStore.open(databasePath);
  maintenance.initialize("graph-candidate-update-binding");
  const database = (maintenance as unknown as { database: { transaction<T>(callback: () => T): () => T; prepare(sql: string): { run(...values: unknown[]): unknown } } }).database;
  database.transaction(() => {
    database.prepare("UPDATE anchors SET status = 'replaced' WHERE anchor_id = ?").run(other.anchor.anchorId);
    database.prepare("UPDATE anchors SET object_id = ? WHERE anchor_id = ?").run(other.object.objectId, target.anchor.anchorId);
  })();
  maintenance.close();
  const finalized = await client.finalizeProposalCommit(reviewed.proposal.proposalId, { semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, expectedUpdatedAt: prepared.expectedUpdatedAt, blockUuid: target.anchor.externalId, contentHash: checksum("[任务] 原目标已补充"), inputVersion: "2", traceId: "binding-finalize" });
  assert.equal(finalized.status, "COMPENSATION_REQUIRED");
  assert.equal((await client.getObject(target.object.objectId))?.text, "原目标");
  assert.equal((await client.getObject(other.object.objectId))?.text, "另一对象");
});

test("Local Service migration scan validates an explicit Recovery Bundle and leaves Store unchanged", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-migration-scan-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-migration-scan", token: "migration-scan-service-token-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const before = await client.status();
  assert.equal(before.capabilities.migration, true, "complete migration routes advertise the bounded capability");
  const report = await client.scanLegacyMigration(exportRecoveryBundle(createEmptyState(), new Date("2026-07-21T09:00:00.000Z")));
  assert.equal(report.status, "SCANNED");
  assert.equal(report.zeroFormalWrites, true);
  assert.equal(report.counts.total, 0);
  assert.deepEqual(await client.status(), before);
  await assert.rejects(
    () => client.scanLegacyMigration(null),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "MIGRATION_BUNDLE_SHAPE_INVALID",
  );
  assert.deepEqual(await client.status(), before, "malformed scan input is also zero-write");
});

test("Local Service completes reviewed migration through validated backup, import, verify, undo, retry, and activate", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-migration-run-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), backupRoot: join(root, "backups"), graphId: "graph-migration-run", token: "migration-run-service-token-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const legacy = createManagedObject({ objectId: "legacy-service-task", objectType: "TASK", text: "迁移服务闭环" }, new Date("2026-07-20T08:00:00.000Z"));
  const state = { ...createEmptyState(), objects: [{ ...legacy, phase: "ACTIVE" as const, condition: { kind: "ACTIONABLE" as const } }] };
  const bundle = exportRecoveryBundle(state, new Date("2026-07-21T08:00:00.000Z"));
  const scanned = await client.scanLegacyMigration(bundle);
  const previewed = await client.previewLegacyMigration(bundle, [{ legacyObjectId: "legacy-service-task", action: "IMPORT" }]);
  assert.equal(previewed.run.summary.import, 1);
  assert.deepEqual((await client.listMigrationRuns()).map(({ runId, status }) => ({ runId, status })), [{ runId: previewed.run.runId, status: "PREVIEWED" }]);
  assert.doesNotMatch(JSON.stringify(await client.listMigrationRuns()), /迁移服务闭环/);
  assert.equal((await client.getMigrationRun(previewed.run.runId)).evidence[0]?.targetObjectId, undefined);
  const snapshot = await client.createBackup();
  const imported = await client.importLegacyMigration(previewed.run.runId, {
    bundle, backupId: snapshot.backupId, objectIds: ["legacy-service-task"], idempotencyKey: "service-batch-1", confirmation: "IMPORT_REVIEWED_V1_BATCH",
  });
  assert.equal(imported.batch.status, "IMPORTED");
  assert.equal((await client.importLegacyMigration(previewed.run.runId, {
    bundle, backupId: snapshot.backupId, objectIds: ["legacy-service-task"], idempotencyKey: "service-batch-1", confirmation: "IMPORT_REVIEWED_V1_BATCH",
  })).replayed, true);
  assert.equal((await client.verifyLegacyMigrationBatch(previewed.run.runId, imported.batch.batchId)).status, "VERIFIED");
  assert.equal((await client.undoLegacyMigrationBatch(previewed.run.runId, imported.batch.batchId, "UNDO_MIGRATION_BATCH")).status, "UNDONE");
  assert.equal(await client.getObject("legacy-service-task"), undefined);
  const retried = await client.importLegacyMigration(previewed.run.runId, {
    bundle, backupId: snapshot.backupId, objectIds: ["legacy-service-task"], idempotencyKey: "service-batch-2", confirmation: "IMPORT_REVIEWED_V1_BATCH",
  });
  await client.verifyLegacyMigrationBatch(previewed.run.runId, retried.batch.batchId);
  assert.equal((await client.activateLegacyMigration(previewed.run.runId, "ACTIVATE_V2_SQLITE")).status, "ACTIVATED");
  assert.equal((await client.getObject("legacy-service-task"))?.text, "迁移服务闭环");
  assert.equal(scanned.sourceBundleSha256, previewed.run.sourceBundleSha256);
});

test("Proposal validation, review, and scope revalidation never masquerade as a formal object write", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-proposal-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-proposal", token: "proposal-service-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const result = await client.validateProposal(validProposal());
  assert.equal(result.status, "VALID");
  assert.match(result.files.proposalMd, /最终可读预览/);
  assert.equal(JSON.parse(result.files.proposalJson).proposalId, "prop_service_validate");
  assert.equal((await client.status()).objectCount, 0);
  await assert.rejects(() => client.validateProposal({ schemaVersion: "v2" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_PROPOSAL_SHAPE_INVALID");
  assert.equal((await client.status()).objectCount, 0);
  const submitted = await client.submitProposal(validProposal());
  assert.equal(submitted.replayed, false);
  assert.equal((await client.submitProposal(validProposal())).replayed, true);
  assert.equal((await client.listProposals()).length, 1);
  assert.equal((await client.getProposal("prop_service_validate"))?.proposal.status, "READY");
  assert.equal(await client.getProposal("missing-proposal"), undefined);
  const reviewed = await client.reviewProposal("prop_service_validate", { formalize: { disposition: "ACCEPTED" } }, submitted.record.updatedAt);
  assert.equal(reviewed.proposal.status, "ACCEPTED");
  await assert.rejects(() => client.reviewProposal("prop_service_validate", { formalize: { disposition: "REJECTED" } }, submitted.record.updatedAt), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_PROPOSAL_REVIEW_STALE");
  const valid = await client.revalidateProposal("prop_service_validate", [
    { kind: "BLOCK", id: "proposal-block", exists: true, version: 1, hash: checksum("普通正文") },
  ], reviewed.updatedAt);
  assert.equal(valid.result.status, "VALID");
  const stale = await client.revalidateProposal("prop_service_validate", [
    { kind: "BLOCK", id: "proposal-block", exists: true, version: 2, hash: checksum("用户后续编辑") },
  ], reviewed.updatedAt);
  assert.equal(stale.result.status, "STALE");
  assert.equal(stale.record.proposal.status, "STALE");
  assert.equal((await client.getProposal("prop_service_validate"))?.proposal.status, "STALE");
  assert.deepEqual((await client.doctor()).checks?.find(({ component }) => component === "PROPOSAL"), { component: "PROPOSAL", status: "WARN", code: "STALE_PROPOSAL_PRESENT", count: 1 });
  assert.equal((await client.status()).objectCount, 0, "review and revalidation state are not formal object writes");
});

test("configured Provider creates only a validated review-ready Proposal through Local Service", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-provider-"));
  let modelCandidate = { ...validProposal(), proposalId: "model-id", status: "APPLIED", source: { kind: "user" } } as V2Proposal;
  let providerGate: { onStarted: () => void; wait: Promise<void> } | undefined;
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => {
      const gate = providerGate;
      if (gate) { gate.onStarted(); await gate.wait; }
      return { value: modelCandidate, metadata: { requestId: "req-provider", model: "actual-model", finishReason: "stop", totalTokens: 90, durationMs: 25, attempts: 1 } };
    },
  };
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"), graphId: "graph-provider", token: "provider-service-token-at-least-24-chars",
    proposalGenerator: new LocalLlmProposalGenerator(provider),
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  assert.equal((await client.health()).capabilities.provider, true);
  const result = await client.generateProposal(proposalPrompt);
  assert.equal(result.generated.kind, "PROPOSAL");
  if (result.generated.kind !== "PROPOSAL" || !("record" in result)) throw new Error("expected submitted Proposal");
  assert.equal(result.record.proposal.status, "READY");
  assert.notEqual(result.record.proposal.proposalId, "model-id");
  assert.deepEqual(result.record.proposal.source, {
    kind: "local_llm", provider: "deepseek", model: "actual-model", skillVersion: "formalize-1",
    writingProfileVersion: "profile-1", promptBundleVersion: result.generated.promptBundleVersion,
  });
  assert.equal(result.generated.provider.requestId, "req-provider");
  assert.equal((await client.status()).objectCount, 0);
  assert.equal((await client.listProposals()).length, 1);
  const revisedAfterText = "[任务] 普通正文（保留原句）";
  modelCandidate = {
    ...result.record.proposal,
    proposalId: "model-revision-id",
    title: "更简洁的正式化建议",
    finalPreview: revisedAfterText,
    groups: result.record.proposal.groups.map((group) => ({
      ...group,
      disposition: "PENDING",
      textPatches: group.textPatches.map((patch) => ({ ...patch, afterText: revisedAfterText })),
      semanticOperations: group.semanticOperations.map((operation) => ({ ...operation, payload: { ...operation.payload, text: "普通正文（保留原句）" } })),
    })),
    status: "READY",
  };
  const revised = await client.reviseGeneratedProposal(result.record.proposal.proposalId, result.record.updatedAt, proposalPrompt);
  assert.equal(revised.record.proposal.proposalId, result.record.proposal.proposalId, "revision updates the one machine Proposal");
  assert.equal(revised.record.proposal.createdAt, result.record.proposal.createdAt);
  assert.equal(revised.record.proposal.status, "READY");
  assert.equal(revised.record.proposal.finalPreview, revisedAfterText);
  assert.equal((await client.listProposals()).length, 1);
  assert.equal((await client.status()).objectCount, 0);
  const beforeRejectedRevision = revised.record.files.proposalJson;
  const wrongTarget = { kind: "BLOCK" as const, id: "another-block", version: 1, hash: checksum("普通正文") };
  modelCandidate = {
    ...revised.record.proposal,
    scope: { read: [], modify: [wrongTarget] },
    groups: revised.record.proposal.groups.map((group) => ({ ...group,
      textPatches: group.textPatches.map((patch) => ({ ...patch, blockUuid: wrongTarget.id })),
      semanticOperations: group.semanticOperations.map((operation) => ({ ...operation, target: wrongTarget })),
    })),
  };
  await assert.rejects(
    () => client.reviseGeneratedProposal(revised.record.proposal.proposalId, revised.record.updatedAt, proposalPrompt),
    /脱离原 Proposal|409/,
  );
  assert.equal((await client.getProposal(revised.record.proposal.proposalId))?.files.proposalJson, beforeRejectedRevision, "invalid revision cannot replace machine authority");
  const acceptedForConcurrentCommit = await client.reviewProposal(revised.record.proposal.proposalId, { formalize: { disposition: "ACCEPTED" } }, revised.record.updatedAt);
  modelCandidate = {
    ...acceptedForConcurrentCommit.proposal,
    title: "不应越过已开始的 Commit",
    groups: acceptedForConcurrentCommit.proposal.groups.map((group) => ({ ...group, disposition: "PENDING" })),
    status: "READY",
  };
  let markProviderStarted: (() => void) | undefined;
  let releaseProvider: (() => void) | undefined;
  const providerStarted = new Promise<void>((resolve) => { markProviderStarted = resolve; });
  const providerRelease = new Promise<void>((resolve) => { releaseProvider = resolve; });
  providerGate = { onStarted: () => markProviderStarted?.(), wait: providerRelease };
  const concurrentRevision = client.reviseGeneratedProposal(acceptedForConcurrentCommit.proposal.proposalId, acceptedForConcurrentCommit.updatedAt, proposalPrompt);
  await providerStarted;
  const preparedDuringRevision = await client.prepareProposalCommit(acceptedForConcurrentCommit.proposal.proposalId, [
    { kind: "BLOCK", id: "proposal-block", exists: true, version: 1, hash: checksum("普通正文") },
  ], acceptedForConcurrentCommit.updatedAt);
  assert.equal(preparedDuringRevision.status, "PREPARED");
  releaseProvider?.();
  await assert.rejects(concurrentRevision, /未完成 Commit|409/);
  providerGate = undefined;
  const preservedAfterConcurrentCommit = await client.getProposal(acceptedForConcurrentCommit.proposal.proposalId);
  assert.equal(preservedAfterConcurrentCommit?.updatedAt, acceptedForConcurrentCommit.updatedAt);
  assert.equal(preservedAfterConcurrentCommit?.proposal.status, "ACCEPTED", "revision cannot replace a Proposal after Commit preparation starts");
  const mini = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "Provider 关闭目标", externalId: "block-provider-mini", inputVersion: "1", contentHash: checksum("[MiniProject] Provider 关闭目标"), idempotencyKey: "ignored", traceId: "trace-provider-mini" });
  modelCandidate = miniProjectClosureProposal(mini.object.objectId, mini.object.version);
  const providerClosure = await client.generateProposal(proposalPrompt);
  assert.equal(providerClosure.generated.kind, "PROPOSAL");
  assert.equal((await client.getObject(mini.object.objectId))?.lifecycle, "OPEN");
  const duplicate = miniProjectClosureProposal(mini.object.objectId, mini.object.version);
  duplicate.proposalId = "prop_external_after_provider_closure";
  await assert.rejects(() => client.submitProposal(duplicate), /活跃 Closure Proposal|409/);
});

test("Proposal Commit prepares before Graph, materializes after evidence, and records APPLIED", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-proposal-commit-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-proposal-commit", token: "proposal-commit-service-token-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const submitted = await client.submitProposal(validProposal());
  const reviewed = await client.reviewProposal("prop_service_validate", { formalize: { disposition: "ACCEPTED" } }, submitted.record.updatedAt);
  const prepared = await client.prepareProposalCommit("prop_service_validate", [
    { kind: "BLOCK", id: "proposal-block", exists: true, version: 1, hash: checksum("普通正文") },
  ], reviewed.updatedAt);
  assert.equal(prepared.status, "PREPARED");
  if (prepared.status !== "PREPARED") throw new Error("expected prepared commit");
  assert.deepEqual((await client.doctor()).checks?.find(({ component }) => component === "SEMANTIC_COMMIT"), { component: "SEMANTIC_COMMIT", status: "WARN", code: "COMMIT_PENDING", count: 1 });
  const resumed = await client.prepareProposalCommit("prop_service_validate", [
    { kind: "BLOCK", id: "proposal-block", exists: true, version: 2, hash: prepared.plan.patch.afterHash },
  ], reviewed.updatedAt);
  assert.equal(resumed.status, "PREPARED", "persisted intent resumes after a Graph write instead of stale-marking the Proposal");
  assert.equal((await client.status()).objectCount, 0, "prepare never applies Graph or Domain state");
  const completed = await client.finalizeProposalCommit("prop_service_validate", {
    semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, expectedUpdatedAt: prepared.expectedUpdatedAt,
    blockUuid: prepared.plan.patch.blockUuid, contentHash: prepared.plan.patch.afterHash, inputVersion: "2", traceId: "trace-proposal-commit",
  });
  assert.equal(completed.status, "COMPLETED");
  if (completed.status !== "COMPLETED") throw new Error("expected completed commit");
  assert.equal(completed.object.objectId, prepared.objectId);
  assert.equal(completed.anchor.externalId, "proposal-block");
  assert.equal(completed.record.proposal.status, "APPLIED");
  assert.equal((await client.status()).objectCount, 1);
  assert.deepEqual((await client.doctor()).checks?.find(({ component }) => component === "SEMANTIC_COMMIT"), { component: "SEMANTIC_COMMIT", status: "PASS", code: "COMMIT_HEALTHY", count: 0 });
  assert.deepEqual((await client.nowWork()).next.map((item) => item.objectId), [completed.object.objectId]);
});

test("Now Work Focus is service-owned, manually ordered, and opens from Primary Anchor data", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-focus-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-focus", token: "focus-service-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const createProject = async (name: string, pageExternalId: string) => {
    const intent = await client.prepareProject({ name, traceId: `prepare-${pageExternalId}` });
    return client.finalizeProject({
      semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name, pageExternalId,
      pageContentHash: checksum(`Project/${name}`), traceId: `finalize-${pageExternalId}`,
    });
  };
  const first = await createProject("Focus 第一项", "focus-page-a");
  const second = await createProject("Focus 第二项", "focus-page-b");
  await client.selectFocus(first.object.objectId, first.object.version, 0);
  await client.selectFocus(second.object.objectId, second.object.version, 0);
  let now = await client.nowWork();
  assert.deepEqual(now.focus.map((item) => [item.objectId, item.primaryAnchorExternalId]), [
    [second.object.objectId, "focus-page-b"], [first.object.objectId, "focus-page-a"],
  ]);
  assert.deepEqual(now.conditionOptions.map((option) => option.objectId).sort(), [first.object.objectId, second.object.objectId].sort());
  await client.reorderFocus(now.focus.map((item) => item.objectId), [first.object.objectId, second.object.objectId]);
  now = await client.nowWork();
  assert.deepEqual(now.focus.map((item) => item.objectId), [first.object.objectId, second.object.objectId]);
  await assert.rejects(() => client.reorderFocus([second.object.objectId, first.object.objectId], [first.object.objectId, second.object.objectId]), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_FOCUS_ORDER_STALE");
  await client.removeFocus(first.object.objectId, first.object.version);
  assert.deepEqual((await client.nowWork()).focus.map((item) => item.objectId), [second.object.objectId]);
  const waiting = await client.changeCondition(second.object.objectId, second.object.version, { kind: "WAITING", waitingFor: "外部负责人", expectedResult: "确认窗口", reviewAt: "2026-07-20T00:00:00.000Z" });
  assert.equal(waiting.object.version, second.object.version + 1);
  now = await client.nowWork();
  assert.equal(now.focus.find((item) => item.objectId === second.object.objectId)?.condition.kind, "WAITING", "Focus survives an independent Condition change");
  assert.match(now.waitingReview.find((item) => item.objectId === second.object.objectId)?.reason ?? "", /复查已到/);
  const blocked = await client.changeCondition(second.object.objectId, waiting.object.version, { kind: "BLOCKED", reason: "需先完成第一项", blockerObjectId: first.object.objectId });
  assert.equal(blocked.object.condition.kind, "BLOCKED");
  now = await client.nowWork();
  assert.match(now.next.find((item) => item.objectId === first.object.objectId)?.reason ?? "", /阻碍当前关注/);
  await assert.rejects(() => client.changeCondition(second.object.objectId, blocked.object.version, { kind: "BLOCKED", reason: "不存在", blockerObjectId: "missing-blocker" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 404 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_BLOCKER_OBJECT_NOT_FOUND");
  await assert.rejects(() => client.changeCondition(second.object.objectId, second.object.version, { kind: "ACTIONABLE" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT");
  const invalid = await fetch(new URL(`focus/${encodeURIComponent(second.object.objectId)}`, service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: second.object.version, rank: -1 }) });
  assert.equal(invalid.status, 400);
  const invalidCondition = await fetch(new URL(`objects/${encodeURIComponent(second.object.objectId)}/condition`, service.url), { method: "PATCH", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: waiting.object.version, condition: { kind: "WAITING", waitingFor: "人", expectedResult: "结果", reviewAt: "bad", hiddenAuthority: true } }) });
  assert.equal(invalidCondition.status, 400);
});

test("Proposal Undo is an inverse Commit that restores Graph evidence and removes only unchanged Domain state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-proposal-undo-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-proposal-undo", token: "proposal-undo-service-token-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const submitted = await client.submitProposal(validProposal());
  const reviewed = await client.reviewProposal("prop_service_validate", { formalize: { disposition: "ACCEPTED" } }, submitted.record.updatedAt);
  const prepared = await client.prepareProposalCommit("prop_service_validate", [{ kind: "BLOCK", id: "proposal-block", exists: true, version: 1, hash: checksum("普通正文") }], reviewed.updatedAt);
  if (prepared.status !== "PREPARED") throw new Error("expected prepared commit");
  const completed = await client.finalizeProposalCommit("prop_service_validate", {
    semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, expectedUpdatedAt: prepared.expectedUpdatedAt,
    blockUuid: prepared.plan.patch.blockUuid, contentHash: prepared.plan.patch.afterHash, inputVersion: "2", traceId: "trace-forward",
  });
  if (completed.status !== "COMPLETED") throw new Error("expected completed commit");
  const undo = await client.prepareProposalUndo(prepared.semanticCommitId, "trace-undo-prepare");
  assert.equal(undo.status, "PREPARED");
  assert.equal(undo.patch.beforeHash, checksum("普通正文"));
  const undone = await client.finalizeProposalUndo(prepared.semanticCommitId, {
    originalSemanticCommitId: prepared.semanticCommitId, undoSemanticCommitId: undo.undoSemanticCommitId,
    blockUuid: undo.patch.blockUuid, contentHash: undo.patch.beforeHash, inputVersion: "3", traceId: "trace-undo-finalize",
  });
  assert.equal(undone.status, "COMPLETED");
  assert.equal((await client.status()).objectCount, 0);
  assert.equal((await client.prepareProposalUndo(prepared.semanticCommitId, "trace-undo-replay")).status, "COMPLETED");
});

test("Proposal Commit requests Graph compensation when Domain materialization conflicts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-proposal-compensation-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-proposal-compensation", token: "proposal-compensation-token-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  await client.synchronizeExplicitObject({ objectType: "TASK", text: "已有对象", externalId: "proposal-block", inputVersion: "existing", contentHash: checksum("[任务] 已有对象"), idempotencyKey: "transport", traceId: "trace-existing" });
  const submitted = await client.submitProposal(validProposal());
  const reviewed = await client.reviewProposal("prop_service_validate", { formalize: { disposition: "ACCEPTED" } }, submitted.record.updatedAt);
  const prepared = await client.prepareProposalCommit("prop_service_validate", [{ kind: "BLOCK", id: "proposal-block", exists: true, version: 1, hash: checksum("普通正文") }], reviewed.updatedAt);
  if (prepared.status !== "PREPARED") throw new Error("expected prepared commit");
  const finalization = await client.finalizeProposalCommit("prop_service_validate", {
    semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, expectedUpdatedAt: prepared.expectedUpdatedAt,
    blockUuid: prepared.plan.patch.blockUuid, contentHash: prepared.plan.patch.afterHash, inputVersion: "2", traceId: "trace-conflict",
  });
  assert.equal(finalization.status, "COMPENSATION_REQUIRED");
  if (finalization.status !== "COMPENSATION_REQUIRED") throw new Error("expected compensation");
  const restrictedDoctor = await client.doctor();
  assert.equal(restrictedDoctor.status, "FAIL", "Doctor returns its report instead of hiding it behind an HTTP transport error");
  assert.deepEqual(restrictedDoctor.checks?.find(({ component }) => component === "SEMANTIC_COMMIT"), { component: "SEMANTIC_COMMIT", status: "FAIL", code: "COMMIT_RECOVERY_REQUIRED", count: 1 });
  const compensated = await client.compensateProposalCommit("prop_service_validate", {
    semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, expectedUpdatedAt: prepared.expectedUpdatedAt,
    blockUuid: prepared.plan.patch.blockUuid, contentHash: prepared.plan.patch.beforeHash, inputVersion: "3", traceId: "trace-compensated",
  });
  assert.equal(compensated.status, "FAILED_COMPENSATED");
  assert.equal((await client.doctor()).checks?.find(({ component }) => component === "SEMANTIC_COMMIT")?.status, "PASS");
  assert.equal(compensated.record.proposal.status, "FAILED");
  assert.equal((await client.status()).objectCount, 1, "conflicting original object remains the only object");
});

test("Local Service materializes one explicit Block without accepting Graph, path, or object authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-materialize-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-materialize",
    token: "materialize-service-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  const input = {
    objectType: "TASK" as const,
    text: "核对时间同步来源",
    externalId: "block-materialize",
    inputVersion: "1001",
    contentHash: checksum("[任务] 核对时间同步来源"),
    idempotencyKey: "graph-materialize:block-materialize:first-seen",
    traceId: "trace-materialize",
  };
  const created = await client.materializeExplicitObject(input);
  assert.equal(created.replayed, false);
  assert.equal(created.object.objectType, "TASK");
  assert.equal(created.object.version, 2);
  assert.equal(created.anchor.graphId, "graph-materialize");
  assert.equal(created.anchor.externalId, "block-materialize");
  assert.equal((await client.materializeExplicitObject(input)).replayed, true);
  assert.equal((await client.status()).objectCount, 1);
  assert.deepEqual((await client.listPrimaryAnchors()).anchors.map((anchor) => anchor.externalId), ["block-materialize"]);
  const deadline = await client.changeDeadline(created.object.objectId, created.object.version, "2026-07-21T12:00:00.000Z");
  assert.equal(deadline.object.dueAt, "2026-07-21T12:00:00.000Z");
  assert.match((await client.nowWork()).next.find((item) => item.objectId === created.object.objectId)?.reason ?? "", /明确期限/);
  await assert.rejects(() => client.changeDeadline(created.object.objectId, created.object.version, undefined), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT");

  const synchronizedFirst = await client.synchronizeExplicitObject({ ...input, externalId: "block-sync", idempotencyKey: "sync-block:first" });
  assert.equal(synchronizedFirst.operation, "MATERIALIZED");
  assert.equal(synchronizedFirst.object.version, 2);
  assert.equal((await client.synchronizeExplicitObject({ ...input, externalId: "block-sync", idempotencyKey: "sync-block:first-retry" })).replayed, true);
  const synchronizedUpdate = await client.synchronizeExplicitObject({
    ...input,
    text: "核对时间同步来源并保存证据",
    externalId: "block-sync",
    contentHash: checksum("[任务] 核对时间同步来源并保存证据"),
    inputVersion: "1002",
    idempotencyKey: "sync-block:second",
  });
  assert.equal(synchronizedUpdate.operation, "SYNCHRONIZED");
  assert.equal(synchronizedUpdate.object.version, 3);
  assert.equal(synchronizedUpdate.object.text, "核对时间同步来源并保存证据");
  await assert.rejects(() => client.synchronizeExplicitObject({
    ...input,
    objectType: "MINI_PROJECT",
    externalId: "block-sync",
    contentHash: checksum("[MiniProject] 不得静默迁移"),
    inputVersion: "1003",
    idempotencyKey: "sync-block:type-change",
  }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL");
  assert.equal((await client.getObject(synchronizedFirst.object.objectId))?.objectType, "TASK");

  const observedMissing = await client.observePrimaryAnchor({
    anchorId: synchronizedUpdate.anchor.anchorId,
    status: "missing",
    traceId: "trace-anchor-missing",
  });
  assert.equal(observedMissing.anchor.status, "missing");
  assert.equal(observedMissing.object.version, 4);
  assert.equal((await client.observePrimaryAnchor({
    anchorId: synchronizedUpdate.anchor.anchorId,
    status: "missing",
    traceId: "trace-anchor-missing-repeat",
  })).object.version, 4, "an unchanged repeated observation must not inflate object versions");
  assert.equal((await client.listPrimaryAnchors()).anchors.find((anchor) => anchor.anchorId === observedMissing.anchor.anchorId)?.status, "missing");
  const recovered = await client.synchronizeExplicitObject({
    ...input,
    text: "核对时间同步来源并保存证据",
    externalId: "block-sync",
    contentHash: checksum("[任务] 核对时间同步来源并保存证据"),
    inputVersion: "1004",
    idempotencyKey: "sync-block:recover",
  });
  assert.equal(recovered.anchor.status, "active");
  assert.equal(recovered.object.version, 5);

  const unsafe = await fetch(new URL("objects/materialize", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...input, graphId: "caller-graph", objectId: "caller-object", databasePath: "/tmp/caller.db" }),
  });
  assert.equal(unsafe.status, 400);
  assert.equal((await unsafe.json() as { error: { code: string } }).error.code, "MATERIALIZATION_REQUEST_INVALID");
  assert.equal((await client.status()).objectCount, 2);

  const unsafeObservation = await fetch(new URL("anchors/primary/observe", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ anchorId: recovered.anchor.anchorId, status: "missing", traceId: "trace-unsafe", graphId: "caller-graph" }),
  });
  assert.equal(unsafeObservation.status, 400);
  assert.equal((await unsafeObservation.json() as { error: { code: string } }).error.code, "PRIMARY_ANCHOR_OBSERVATION_INVALID");
  const missingObservation = await fetch(new URL("anchors/primary/observe", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ anchorId: "missing-anchor", status: "missing", traceId: "trace-not-found" }),
  });
  assert.equal(missingObservation.status, 404);
  assert.equal((await missingObservation.json() as { error: { code: string } }).error.code, "V2_PRIMARY_ANCHOR_NOT_FOUND");

  const reboundInput = {
    previousAnchorId: recovered.anchor.anchorId,
    previewObjectVersion: recovered.object.version,
    previewAnchorStatus: recovered.anchor.status,
    previewAnchorContentHash: recovered.anchor.contentHash,
    objectType: "TASK" as const,
    text: "新的主正文",
    externalId: "block-rebound",
    inputVersion: "1005",
    contentHash: checksum("[任务] 新的主正文"),
    confirmation: "REBIND_PRIMARY_ANCHOR" as const,
    traceId: "trace-rebind",
  };
  await assert.rejects(() => client.rebindPrimaryAnchor({ ...reboundInput, previewObjectVersion: recovered.object.version - 1 }),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_REBIND_PREVIEW_STALE");
  assert.equal((await client.getObject(recovered.object.objectId))?.version, recovered.object.version);
  const rebound = await client.rebindPrimaryAnchor(reboundInput);
  assert.equal(rebound.object.objectId, recovered.object.objectId);
  assert.equal(rebound.previousAnchor.status, "replaced");
  assert.equal(rebound.anchor.externalId, "block-rebound");
  assert.equal((await client.rebindPrimaryAnchor(reboundInput)).replayed, true);
  assert.equal((await client.listPrimaryAnchors()).anchors.some((anchor) => anchor.anchorId === recovered.anchor.anchorId), false);
  assert.equal((await client.listPrimaryAnchors(undefined, true)).anchors.find((anchor) => anchor.anchorId === recovered.anchor.anchorId)?.status, "replaced");
  const unconfirmedRebind = await fetch(new URL("anchors/primary/rebind", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...reboundInput, confirmation: "yes" }),
  });
  assert.equal(unconfirmedRebind.status, 400);
  assert.equal((await unconfirmedRebind.json() as { error: { code: string } }).error.code, "PRIMARY_ANCHOR_REBIND_INVALID");
  const unsafeRebind = await fetch(new URL("anchors/primary/rebind", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...reboundInput, objectId: rebound.object.objectId, graphId: "caller-graph", expectedVersion: rebound.object.version }),
  });
  assert.equal(unsafeRebind.status, 400);
  assert.equal((await unsafeRebind.json() as { error: { code: string } }).error.code, "PRIMARY_ANCHOR_REBIND_INVALID");
  await assert.rejects(() => client.rebindPrimaryAnchor({
    ...reboundInput,
    previousAnchorId: rebound.anchor.anchorId,
    previewObjectVersion: rebound.object.version,
    previewAnchorStatus: "active",
    previewAnchorContentHash: rebound.anchor.contentHash,
    externalId: "block-materialize",
    inputVersion: "1006",
    traceId: "trace-rebind-bound-target",
  }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_REBIND_TARGET_ALREADY_BOUND");
  assert.equal((await client.getObject(rebound.object.objectId))?.version, rebound.object.version);
});

test("Project creation prepares one stable intent and finalizes page evidence with no half domain object", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project",
    token: "project-service-token-at-least-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  const prepared = await client.prepareProject({ name: "告警推送治理", traceId: "trace-project-prepare" });
  assert.equal(prepared.pageName, "Project/告警推送治理");
  assert.equal(prepared.status, "PENDING");
  assert.equal((await client.status()).objectCount, 0, "prepare must not create a half Project object");
  const replay = await client.prepareProject({ name: "Project/告警推送治理", traceId: "trace-project-retry" });
  assert.equal(replay.semanticCommitId, prepared.semanticCommitId);
  assert.equal(replay.objectId, prepared.objectId);
  assert.equal(replay.pageName, prepared.pageName);
  assert.equal(replay.replayed, true);

  await assert.rejects(() => client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "错误名称",
    pageExternalId: "project-page-uuid",
    pageContentHash: checksum("Project/告警推送治理"),
    traceId: "trace-project-mismatch",
  }), (error: unknown) => error instanceof Error
    && "details" in error
    && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_PROJECT_CREATION_INTENT_MISMATCH");
  assert.equal((await client.status()).objectCount, 0);

  const finalized = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "告警推送治理",
    pageExternalId: "project-page-uuid",
    pageContentHash: checksum("Project/告警推送治理"),
    traceId: "trace-project-finalize",
  });
  assert.equal(finalized.status, "COMPLETED");
  assert.equal(finalized.object.objectId, prepared.objectId);
  assert.equal(finalized.object.objectType, "PROJECT");
  assert.equal(finalized.anchor.externalId, "project-page-uuid");
  assert.equal((await client.status()).objectCount, 1);
  const completedReplay = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "告警推送治理",
    pageExternalId: "project-page-uuid",
    pageContentHash: checksum("Project/告警推送治理"),
    traceId: "trace-project-finalize-retry",
  });
  assert.equal(completedReplay.replayed, true);
  assert.equal(completedReplay.object.objectId, prepared.objectId);
  const completedIntent = await client.prepareProject({ name: "告警推送治理", traceId: "trace-project-completed-intent" });
  assert.equal(completedIntent.status, "COMPLETED");
  assert.equal(completedIntent.pageExternalId, "project-page-uuid");
});

test("Project intent follows Logseq case-insensitive page identity", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-case-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-case",
    token: "project-case-service-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  const first = await client.prepareProject({ name: "Incident Review", traceId: "trace-case-first" });
  const replay = await client.prepareProject({ name: "incident review", traceId: "trace-case-replay" });
  assert.equal(replay.semanticCommitId, first.semanticCommitId);
  assert.equal(replay.objectId, first.objectId);
  assert.equal(replay.pageName, "Project/Incident Review");
});

test("external Agent Project Closure Proposal completes with explicit unfinished Objective disposition", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-closure-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-project-closure", token: "project-closure-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const intent = await client.prepareProject({ name: "告警推送治理", traceId: "trace-project-closure-create" });
  const created = await client.finalizeProject({
    semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "告警推送治理", pageExternalId: "page-project-closure",
    pageContentHash: checksum("Project/告警推送治理"), traceId: "trace-project-closure-finalize",
  });
  const submitted = await client.submitProposal(projectClosureProposal(created.object.objectId, created.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "close-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const refused = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/closure/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "yes", observations: [], traceId: "trace-refused-closure" }),
  });
  assert.equal(refused.status, 400);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN");
  const observations = [{ kind: "PAGE" as const, id: "Project/告警推送治理", exists: true, hash: checksum("project-closure-context") }];
  const completed = await client.commitProjectClosure(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "COMPLETE_PROJECT_WITH_CLOSURE", observations, traceId: "trace-project-closure-commit" });
  assert.equal(completed.status, "COMPLETED");
  if (completed.status !== "COMPLETED") return;
  assert.equal(completed.object.lifecycle, "COMPLETED");
  assert.equal(completed.object.closure && "incompleteObjectives" in completed.object.closure ? completed.object.closure.incompleteObjectives[0]?.reason : undefined, "源数据未齐");
  assert.equal(completed.record.proposal.status, "APPLIED");
  assert.equal([...(await client.nowWork()).focus, ...(await client.nowWork()).next, ...(await client.nowWork()).waitingReview].some(({ objectId }) => objectId === completed.object.objectId), false);
  const replay = await client.commitProjectClosure(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "COMPLETE_PROJECT_WITH_CLOSURE", observations, traceId: "trace-project-closure-replay" });
  assert.equal(replay.status, "COMPLETED");
  if (replay.status === "COMPLETED") assert.equal(replay.replayed, true);
});

test("reviewed HIGH Ownership Proposal commits through one Domain SemanticCommit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-owner-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-owner", token: "ownership-service-token-at-least-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const intent = await client.prepareProject({ name: "Owner Project", traceId: "prepare-owner" });
  const owner = await client.finalizeProject({ semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "Owner Project", pageExternalId: "page-owner-project", pageContentHash: checksum("Owner Project"), traceId: "finalize-owner" });
  const child = await client.materializeExplicitObject({ objectType: "TASK", text: "归属任务", externalId: "block-owner-task", inputVersion: "1", contentHash: checksum("[任务] 归属任务"), idempotencyKey: "owner-task-materialize", traceId: "materialize-owner-task" });
  const submitted = await client.submitProposal(ownershipProposal(child.object.objectId, child.object.version, owner.object.objectId, owner.object.version));
  const reviewed = await client.reviewProposal("prop_primary_owner", { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const refused = await fetch(new URL("proposals/prop_primary_owner/ownership/commit", service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "yes", observations: [], traceId: "refuse-owner" }) });
  assert.equal(refused.status, 400);
  assert.deepEqual(await client.listPrimaryOwnerships(), []);
  const committed = await client.commitPrimaryOwnership("prop_primary_owner", { expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "commit-owner" });
  assert.equal(committed.status, "COMPLETED");
  if (committed.status === "COMPLETED") { assert.equal(committed.ownership.ownerObjectId, owner.object.objectId); assert.equal(committed.record.proposal.status, "APPLIED"); }
  assert.equal((await client.listPrimaryOwnerships())[0]?.childObjectId, child.object.objectId);
  const replay = await client.commitPrimaryOwnership("prop_primary_owner", { expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "commit-owner-replay" });
  assert.equal(replay.status === "COMPLETED" && replay.replayed, true);
  if (committed.status !== "COMPLETED") return;
  const invalidUndo = await fetch(new URL(`semantic-commits/${encodeURIComponent(committed.semanticCommitId)}/ownership/undo`, service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ confirmation: "yes", traceId: "refuse-owner-undo" }) });
  assert.equal(invalidUndo.status, 400);
  const undone = await client.undoPrimaryOwnership(committed.semanticCommitId, { confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: "undo-owner" });
  assert.equal(undone.ownership, undefined, "an originally unassigned child returns to Unassigned");
  assert.equal(undone.object.version, child.object.version + 2);
  assert.deepEqual(await client.listPrimaryOwnerships(), []);
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === committed.semanticCommitId)?.status, "UNDONE");
  const undoReplay = await client.undoPrimaryOwnership(committed.semanticCommitId, { confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: "undo-owner-replay" });
  assert.equal(undoReplay.replayed, true);
});

test("Ownership Undo restores the reviewed previous Owner and refuses later child edits", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-owner-undo-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-owner-undo", token: "ownership-undo-token-at-least-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const oldIntent = await client.prepareProject({ name: "Old Owner", traceId: "prepare-old-owner" });
  const oldOwner = await client.finalizeProject({ semanticCommitId: oldIntent.semanticCommitId, objectId: oldIntent.objectId, name: "Old Owner", pageExternalId: "page-old-owner", pageContentHash: checksum("Old Owner"), traceId: "finalize-old-owner" });
  const newIntent = await client.prepareProject({ name: "New Owner", traceId: "prepare-new-owner" });
  const newOwner = await client.finalizeProject({ semanticCommitId: newIntent.semanticCommitId, objectId: newIntent.objectId, name: "New Owner", pageExternalId: "page-new-owner", pageContentHash: checksum("New Owner"), traceId: "finalize-new-owner" });
  const child = await client.materializeExplicitObject({ objectType: "TASK", text: "换归属任务", externalId: "block-owner-undo-task", inputVersion: "1", contentHash: checksum("[任务] 换归属任务"), idempotencyKey: "owner-undo-task", traceId: "materialize-owner-undo-task" });

  const initial = await client.submitProposal(ownershipProposal(child.object.objectId, child.object.version, oldOwner.object.objectId, oldOwner.object.version, undefined, "prop_initial_owner"));
  const initialReviewed = await client.reviewProposal("prop_initial_owner", { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, initial.record.updatedAt);
  const initialCommit = await client.commitPrimaryOwnership("prop_initial_owner", { expectedUpdatedAt: initialReviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "commit-initial-owner" });
  assert.equal(initialCommit.status, "COMPLETED");
  if (initialCommit.status !== "COMPLETED") return;

  const change = await client.submitProposal(ownershipProposal(child.object.objectId, initialCommit.object.version, newOwner.object.objectId, newOwner.object.version, oldOwner.object.objectId, "prop_change_owner"));
  const changeReviewed = await client.reviewProposal("prop_change_owner", { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, change.record.updatedAt);
  const changed = await client.commitPrimaryOwnership("prop_change_owner", { expectedUpdatedAt: changeReviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "commit-changed-owner" });
  assert.equal(changed.status, "COMPLETED");
  if (changed.status !== "COMPLETED") return;
  const restored = await client.undoPrimaryOwnership(changed.semanticCommitId, { confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: "restore-old-owner" });
  assert.equal(restored.ownership?.ownerObjectId, oldOwner.object.objectId);
  assert.equal((await client.listPrimaryOwnerships()).find(({ childObjectId }) => childObjectId === child.object.objectId)?.ownerObjectId, oldOwner.object.objectId);

  const secondChange = await client.submitProposal(ownershipProposal(child.object.objectId, restored.object.version, newOwner.object.objectId, newOwner.object.version, oldOwner.object.objectId, "prop_change_owner_again"));
  const secondReviewed = await client.reviewProposal("prop_change_owner_again", { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, secondChange.record.updatedAt);
  const secondCommitted = await client.commitPrimaryOwnership("prop_change_owner_again", { expectedUpdatedAt: secondReviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "commit-owner-again" });
  assert.equal(secondCommitted.status, "COMPLETED");
  if (secondCommitted.status !== "COMPLETED") return;
  await client.addAssociation({ sourceObjectId: child.object.objectId, targetObjectId: oldOwner.object.objectId, expectedVersion: secondCommitted.object.version, confirmation: "ADD_ASSOCIATION", traceId: "edit-child-after-owner-change" });
  const refused = await fetch(new URL(`semantic-commits/${encodeURIComponent(secondCommitted.semanticCommitId)}/ownership/undo`, service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: "refuse-stale-owner-undo" }) });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json() as { error: { code: string } }).error.code, "V2_OBJECT_VERSION_CONFLICT");
  assert.equal((await client.listPrimaryOwnerships()).find(({ childObjectId }) => childObjectId === child.object.objectId)?.ownerObjectId, newOwner.object.objectId);
});

test("Ownership Commit resumes from its idempotent Domain receipt after interruption", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-owner-recovery-"));
  const databasePath = join(root, "task-copilot.db");
  let interruptOnce = true;
  let service = await startLocalService({
    databasePath, graphId: "graph-owner-recovery", token: "ownership-recovery-token-at-least-24",
    faults: { afterOwnershipDomainWrite: () => { if (interruptOnce) { interruptOnce = false; throw new Error("simulated ownership interruption"); } } },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const intent = await client.prepareProject({ name: "Recovery Owner", traceId: "prepare-recovery-owner" });
  const owner = await client.finalizeProject({ semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "Recovery Owner", pageExternalId: "page-recovery-owner", pageContentHash: checksum("Recovery Owner"), traceId: "finalize-recovery-owner" });
  const child = await client.materializeExplicitObject({ objectType: "TASK", text: "恢复归属任务", externalId: "block-recovery-owner-task", inputVersion: "1", contentHash: checksum("[任务] 恢复归属任务"), idempotencyKey: "recovery-owner-task", traceId: "materialize-recovery-owner-task" });
  const submitted = await client.submitProposal(ownershipProposal(child.object.objectId, child.object.version, owner.object.objectId, owner.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const interrupted = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/ownership/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "interrupt-owner" }),
  });
  assert.equal(interrupted.status, 500);
  assert.equal((await client.listPrimaryOwnerships())[0]?.ownerObjectId, owner.object.objectId, "Domain receipt committed before interruption");
  assert.equal((await client.listProposals()).find(({ proposal }) => proposal.proposalId === reviewed.proposal.proposalId)?.proposal.status, "ACCEPTED");
  const forbiddenRevalidation = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/revalidate`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, observations: [] }),
  });
  assert.equal(forbiddenRevalidation.status, 409);
  assert.equal((await forbiddenRevalidation.json() as { error: { code: string } }).error.code, "V2_PROPOSAL_COMMIT_IN_PROGRESS");
  assert.equal((await client.listProposals()).find(({ proposal }) => proposal.proposalId === reviewed.proposal.proposalId)?.proposal.status, "ACCEPTED", "revalidation cannot stale an in-flight Commit");
  await service.close();
  service = await startLocalService({ databasePath, graphId: "graph-owner-recovery", token: "ownership-recovery-resume-token-24" });
  client = clientFor(service);
  const resumed = await client.commitPrimaryOwnership(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "resume-owner" });
  assert.equal(resumed.status, "COMPLETED");
  if (resumed.status === "COMPLETED") {
    assert.equal(resumed.replayed, false, "pending ledger finalizes from the existing Domain receipt");
    assert.equal(resumed.record.proposal.status, "APPLIED");
    assert.equal(resumed.object.version, child.object.version + 1);
  }
});

test("Ownership Undo resumes from its idempotent Domain receipt after interruption", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-owner-undo-recovery-"));
  const databasePath = join(root, "task-copilot.db");
  let interruptBeforeReceiptOnce = true;
  let interruptAfterReceiptOnce = true;
  let service = await startLocalService({
    databasePath, graphId: "graph-owner-undo-recovery", token: "ownership-undo-recovery-token-24",
    faults: {
      beforeOwnershipUndoDomainWrite: () => { if (interruptBeforeReceiptOnce) { interruptBeforeReceiptOnce = false; throw new Error("simulated transient error before ownership undo receipt"); } },
      afterOwnershipUndoDomainWrite: () => { if (interruptAfterReceiptOnce) { interruptAfterReceiptOnce = false; throw new Error("simulated ownership undo interruption"); } },
    },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const intent = await client.prepareProject({ name: "Undo Recovery Owner", traceId: "prepare-undo-recovery-owner" });
  const owner = await client.finalizeProject({ semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "Undo Recovery Owner", pageExternalId: "page-undo-recovery-owner", pageContentHash: checksum("Undo Recovery Owner"), traceId: "finalize-undo-recovery-owner" });
  const child = await client.materializeExplicitObject({ objectType: "TASK", text: "恢复撤销归属", externalId: "block-undo-recovery-owner", inputVersion: "1", contentHash: checksum("[任务] 恢复撤销归属"), idempotencyKey: "undo-recovery-owner-task", traceId: "materialize-undo-recovery-owner" });
  const submitted = await client.submitProposal(ownershipProposal(child.object.objectId, child.object.version, owner.object.objectId, owner.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const committed = await client.commitPrimaryOwnership(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "commit-before-undo-recovery" });
  assert.equal(committed.status, "COMPLETED");
  if (committed.status !== "COMPLETED") return;
  const beforeReceiptFailure = await fetch(new URL(`semantic-commits/${encodeURIComponent(committed.semanticCommitId)}/ownership/undo`, service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: "transient-before-owner-undo" }) });
  assert.equal(beforeReceiptFailure.status, 500);
  assert.equal((await client.listPrimaryOwnerships())[0]?.ownerObjectId, owner.object.objectId, "transient pre-receipt failure performs no formal write");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === `ownership-undo:${committed.semanticCommitId}`)?.status, "PENDING", "transient failure remains retryable");
  const afterReceiptFailure = await fetch(new URL(`semantic-commits/${encodeURIComponent(committed.semanticCommitId)}/ownership/undo`, service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: "interrupt-owner-undo" }) });
  assert.equal(afterReceiptFailure.status, 500);
  assert.deepEqual(await client.listPrimaryOwnerships(), [], "Domain receipt committed before interruption");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === committed.semanticCommitId)?.status, "COMPLETED");
  await service.close();
  service = await startLocalService({ databasePath, graphId: "graph-owner-undo-recovery", token: "ownership-undo-recovery-resume-24" });
  client = clientFor(service);
  const resumed = await client.undoPrimaryOwnership(committed.semanticCommitId, { confirmation: "UNDO_PRIMARY_OWNERSHIP", traceId: "resume-owner-undo" });
  assert.equal(resumed.replayed, true);
  assert.equal(resumed.object.version, child.object.version + 2);
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === committed.semanticCommitId)?.status, "UNDONE");
});

test("Ownership recovery refuses a new Owner version changed after Commit preparation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-owner-prepared-stale-"));
  const databasePath = join(root, "task-copilot.db");
  let interruptOnce = true;
  let service = await startLocalService({
    databasePath, graphId: "graph-owner-prepared-stale", token: "ownership-prepared-stale-token-24",
    faults: { afterOwnershipPrepare: () => { if (interruptOnce) { interruptOnce = false; throw new Error("simulated interruption after prepare"); } } },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const intent = await client.prepareProject({ name: "Prepared Owner", traceId: "prepare-stale-owner" });
  const owner = await client.finalizeProject({ semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "Prepared Owner", pageExternalId: "page-prepared-owner", pageContentHash: checksum("Prepared Owner"), traceId: "finalize-stale-owner" });
  const child = await client.materializeExplicitObject({ objectType: "TASK", text: "准备后变更任务", externalId: "block-prepared-owner-task", inputVersion: "1", contentHash: checksum("[任务] 准备后变更任务"), idempotencyKey: "prepared-owner-task", traceId: "materialize-prepared-owner-task" });
  const submitted = await client.submitProposal(ownershipProposal(child.object.objectId, child.object.version, owner.object.objectId, owner.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const interrupted = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/ownership/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "interrupt-after-prepare" }),
  });
  assert.equal(interrupted.status, 500);
  assert.deepEqual(await client.listPrimaryOwnerships(), []);
  await client.addAssociation({ sourceObjectId: owner.object.objectId, targetObjectId: child.object.objectId, expectedVersion: owner.object.version, confirmation: "ADD_ASSOCIATION", traceId: "change-owner-version-after-prepare" });
  await service.close();
  service = await startLocalService({ databasePath, graphId: "graph-owner-prepared-stale", token: "ownership-prepared-stale-resume-24" });
  client = clientFor(service);
  const refused = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/ownership/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "resume-with-stale-owner" }),
  });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json() as { error: { code: string } }).error.code, "V2_OBJECT_VERSION_CONFLICT");
  assert.deepEqual(await client.listPrimaryOwnerships(), []);
  assert.equal((await client.listProposals()).find(({ proposal }) => proposal.proposalId === reviewed.proposal.proposalId)?.proposal.status, "STALE");
  assert.equal((await client.listSemanticCommits()).find(({ proposalId }) => proposalId === reviewed.proposal.proposalId)?.status, "FAILED");
});

test("invalid Ownership type matrix terminates its prepared Commit without a formal write", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-owner-type-invalid-"));
  const databasePath = join(root, "task-copilot.db");
  let interruptOnce = true;
  let service = await startLocalService({ databasePath, graphId: "graph-owner-type-invalid", token: "ownership-type-invalid-token-24", faults: { afterOwnershipCommitFailedBeforeProposalTerminal: () => { if (interruptOnce) { interruptOnce = false; throw new Error("simulated failure-terminal interruption"); } } } });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const owner = await client.materializeExplicitObject({ objectType: "TASK", text: "非法 Task Owner", externalId: "block-invalid-owner", inputVersion: "1", contentHash: checksum("[任务] 非法 Task Owner"), idempotencyKey: "invalid-owner", traceId: "materialize-invalid-owner" });
  const child = await client.materializeExplicitObject({ objectType: "TASK", text: "待归属 Task", externalId: "block-invalid-child", inputVersion: "1", contentHash: checksum("[任务] 待归属 Task"), idempotencyKey: "invalid-child", traceId: "materialize-invalid-child" });
  const submitted = await client.submitProposal(ownershipProposal(child.object.objectId, child.object.version, owner.object.objectId, owner.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const refused = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/ownership/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "invalid-owner-matrix" }),
  });
  assert.equal(refused.status, 500);
  assert.deepEqual(await client.listPrimaryOwnerships(), []);
  assert.equal((await client.listProposals()).find(({ proposal }) => proposal.proposalId === reviewed.proposal.proposalId)?.proposal.status, "ACCEPTED", "fault occurs after Commit FAILED but before Proposal terminalization");
  assert.equal((await client.listSemanticCommits()).find(({ proposalId }) => proposalId === reviewed.proposal.proposalId)?.status, "FAILED");
  await service.close();
  service = await startLocalService({ databasePath, graphId: "graph-owner-type-invalid", token: "ownership-type-invalid-resume-24" });
  client = clientFor(service);
  const resumed = await client.commitPrimaryOwnership(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "resume-invalid-owner-matrix" });
  assert.equal(resumed.status, "FAILED");
  if (resumed.status === "FAILED") assert.equal(resumed.errorCode, "V2_PRIMARY_OWNERSHIP_NOT_ALLOWED");
  assert.deepEqual(await client.listPrimaryOwnerships(), []);
  assert.equal((await client.listProposals()).find(({ proposal }) => proposal.proposalId === reviewed.proposal.proposalId)?.proposal.status, "FAILED");
});

test("Ownership recovery terminates cleanly when the prepared new Owner was removed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-owner-removed-"));
  const databasePath = join(root, "task-copilot.db");
  const graphId = "graph-owner-removed";
  let interruptOnce = true;
  let service = await startLocalService({ databasePath, graphId, token: "ownership-owner-removed-token-24", faults: { afterOwnershipPrepare: () => { if (interruptOnce) { interruptOnce = false; throw new Error("simulated prepare before owner removal"); } } } });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const owner = await client.materializeExplicitObject({ objectType: "MINI_PROJECT", text: "可撤销 Owner", externalId: "block-removable-owner", inputVersion: "1", contentHash: checksum("[微项目] 可撤销 Owner"), idempotencyKey: "removable-owner", traceId: "materialize-removable-owner" });
  const child = await client.materializeExplicitObject({ objectType: "TASK", text: "Owner 删除测试", externalId: "block-owner-removed-child", inputVersion: "1", contentHash: checksum("[任务] Owner 删除测试"), idempotencyKey: "owner-removed-child", traceId: "materialize-owner-removed-child" });
  const submitted = await client.submitProposal(ownershipProposal(child.object.objectId, child.object.version, owner.object.objectId, owner.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const interrupted = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/ownership/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "prepare-before-owner-removal" }),
  });
  assert.equal(interrupted.status, 500);
  await service.close();
  const maintenanceStore = await V2SqliteStore.open(databasePath);
  maintenanceStore.initialize(graphId);
  await new V2Application(maintenanceStore).undoMaterialization(owner, { actor: "test", expectedVersion: owner.object.version, idempotencyKey: "remove-prepared-owner", traceId: "remove-prepared-owner" });
  maintenanceStore.close();
  service = await startLocalService({ databasePath, graphId, token: "ownership-owner-removed-resume-24" });
  client = clientFor(service);
  const refused = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/ownership/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "CHANGE_PRIMARY_OWNERSHIP", observations: [], traceId: "resume-after-owner-removal" }),
  });
  assert.equal(refused.status, 404);
  assert.equal((await refused.json() as { error: { code: string } }).error.code, "V2_OBJECT_NOT_FOUND");
  assert.deepEqual(await client.listPrimaryOwnerships(), []);
  assert.equal((await client.listProposals()).find(({ proposal }) => proposal.proposalId === reviewed.proposal.proposalId)?.proposal.status, "STALE");
  assert.equal((await client.listSemanticCommits()).find(({ proposalId }) => proposalId === reviewed.proposal.proposalId)?.status, "FAILED");
});

test("Project Closure resumes from its receipt after interruption before Commit step finalization", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-closure-recovery-"));
  const databasePath = join(root, "task-copilot.db");
  let interruptOnce = true;
  let service = await startLocalService({
    databasePath, graphId: "graph-project-closure-recovery", token: "project-closure-recovery-token-24-chars",
    faults: { afterProjectClosureDomainWrite: () => { if (interruptOnce) { interruptOnce = false; throw new Error("simulated process interruption"); } } },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const intent = await client.prepareProject({ name: "Closure Recovery", traceId: "trace-project-closure-recovery-create" });
  const created = await client.finalizeProject({
    semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "Closure Recovery", pageExternalId: "page-project-closure-recovery",
    pageContentHash: checksum("Project/Closure Recovery"), traceId: "trace-project-closure-recovery-finalize",
  });
  const submitted = await client.submitProposal(projectClosureProposal(created.object.objectId, created.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "close-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const observations = [{ kind: "PAGE" as const, id: "Project/告警推送治理", exists: true, hash: checksum("project-closure-context") }];
  const interrupted = await fetch(new URL(`proposals/${reviewed.proposal.proposalId}/closure/commit`, service.url), {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: reviewed.updatedAt, confirmation: "COMPLETE_PROJECT_WITH_CLOSURE", observations, traceId: "trace-project-closure-interrupted" }),
  });
  assert.equal(interrupted.status, 500);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "COMPLETED", "Domain receipt committed before the interruption");
  assert.equal((await client.listProposals()).find(({ proposal }) => proposal.proposalId === reviewed.proposal.proposalId)?.proposal.status, "ACCEPTED");
  await service.close();
  service = await startLocalService({ databasePath, graphId: "graph-project-closure-recovery", token: "project-closure-recovery-resume-24-chars" });
  client = clientFor(service);
  const resumed = await client.commitProjectClosure(reviewed.proposal.proposalId, {
    expectedUpdatedAt: reviewed.updatedAt, confirmation: "COMPLETE_PROJECT_WITH_CLOSURE", observations, traceId: "trace-project-closure-resumed",
  });
  assert.equal(resumed.status, "COMPLETED");
  if (resumed.status === "COMPLETED") {
    assert.equal(resumed.replayed, false, "the pending Commit is finalized from the existing Domain receipt");
    assert.equal(resumed.record.proposal.status, "APPLIED");
    assert.equal(resumed.object.version, created.object.version + 1);
  }
});

test("Local Service maps Task Marker to Lifecycle without changing Condition", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-marker-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-marker",
    token: "marker-service-token-at-least-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  await assert.rejects(() => client.synchronizeExplicitObject({
    objectType: "TASK",
    text: "取消需要原因",
    marker: "CANCELED",
    externalId: "block-marker-cancel",
    inputVersion: "2000",
    contentHash: checksum("[任务] CANCELED 取消需要原因"),
    idempotencyKey: "caller-cancel-key-is-not-authoritative",
    traceId: "trace-marker-cancel",
  }), (error: unknown) => error instanceof Error
    && "details" in error
    && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_TASK_CANCELLATION_REASON_REQUIRED");
  assert.equal((await client.status()).objectCount, 0);
  const created = await client.synchronizeExplicitObject({
    objectType: "TASK",
    text: "核对完成",
    marker: "DONE",
    externalId: "block-marker-done",
    inputVersion: "2001",
    contentHash: checksum("[任务] DONE 核对完成"),
    idempotencyKey: "caller-key-is-not-authoritative",
    traceId: "trace-marker-done",
  });
  assert.equal(created.operation, "MATERIALIZED");
  assert.equal(created.object.lifecycle, "COMPLETED");
  assert.deepEqual(created.object.condition, { kind: "ACTIONABLE" });

  await assert.rejects(() => client.synchronizeExplicitObject({
    objectType: "TASK",
    text: "不得改写终态",
    marker: "CANCELED",
    externalId: "block-marker-done",
    inputVersion: "2002",
    contentHash: checksum("[任务] CANCELED 不得改写终态"),
    idempotencyKey: "caller-key-remains-non-authoritative",
    traceId: "trace-marker-conflict",
  }), (error: unknown) => error instanceof Error
    && "details" in error
    && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_MARKER_TERMINAL_CONFLICT");
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "COMPLETED");
});

test("MiniProject DONE Marker creates one review Proposal and commits only after both confirmations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-marker-review-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"), graphId: "graph-marker-review", token: "marker-review-token-at-least-24-chars",
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const initialHash = checksum("[MiniProject] DONE 首次观察即请求关闭");
  const initiallyDone = await client.synchronizeExplicitObject({
    objectType: "MINI_PROJECT", text: "首次观察即请求关闭", marker: "DONE", externalId: "block-mini-initial-done", inputVersion: "2999",
    contentHash: initialHash, idempotencyKey: "ignored-initial-done", traceId: "trace-mini-initial-done",
  });
  assert.equal(initiallyDone.operation, "PROPOSAL_CREATED");
  assert.equal(initiallyDone.object.lifecycle, "OPEN");
  assert.ok(initiallyDone.proposalId);
  const initialReplay = await client.synchronizeExplicitObject({
    objectType: "MINI_PROJECT", text: "首次观察即请求关闭", marker: "DONE", externalId: "block-mini-initial-done", inputVersion: "2999",
    contentHash: initialHash, idempotencyKey: "ignored-initial-done-retry", traceId: "trace-mini-initial-done-retry",
  });
  assert.equal(initialReplay.operation, "PROPOSAL_CREATED");
  assert.equal(initialReplay.proposalId, initiallyDone.proposalId);
  assert.equal(initialReplay.replayed, true);
  const open = await client.synchronizeExplicitObject({
    objectType: "MINI_PROJECT", text: "检查真实 Marker 闭环", externalId: "block-mini-marker", inputVersion: "3000",
    contentHash: checksum("[MiniProject] 检查真实 Marker 闭环"), idempotencyKey: "ignored-open", traceId: "trace-mini-open",
  });
  assert.equal(open.object.lifecycle, "OPEN");
  let markerHash = checksum("[MiniProject] DONE 检查真实 Marker 闭环");
  const proposed = await client.synchronizeExplicitObject({
    objectType: "MINI_PROJECT", text: "检查真实 Marker 闭环", marker: "DONE", externalId: "block-mini-marker", inputVersion: "3001",
    contentHash: markerHash, idempotencyKey: "ignored-proposal", traceId: "trace-mini-proposal",
  });
  assert.equal(proposed.operation, "PROPOSAL_CREATED");
  assert.ok(proposed.proposalId);
  assert.equal(proposed.object.lifecycle, "OPEN");
  const repeated = await client.synchronizeExplicitObject({
    objectType: "MINI_PROJECT", text: "检查真实 Marker 闭环", marker: "DONE", externalId: "block-mini-marker", inputVersion: "3002",
    contentHash: markerHash, idempotencyKey: "ignored-repeat", traceId: "trace-mini-repeat",
  });
  assert.equal(repeated.proposalId, proposed.proposalId);
  assert.equal(repeated.replayed, true);
  markerHash = checksum("[MiniProject] DONE 检查真实 Marker 闭环（修订）");
  const revised = await client.synchronizeExplicitObject({
    objectType: "MINI_PROJECT", text: "检查真实 Marker 闭环（修订）", marker: "DONE", externalId: "block-mini-marker", inputVersion: "3003",
    contentHash: markerHash, idempotencyKey: "ignored-revision", traceId: "trace-mini-revision",
  });
  assert.equal(revised.proposalId, proposed.proposalId, "same lifecycle intent keeps one machine Proposal identity");
  assert.equal(revised.replayed, false);
  const matching = (await client.listProposals()).filter(({ proposal }) => proposal.proposalId === proposed.proposalId);
  assert.equal(matching.length, 1);
  const record = matching[0]!;
  assert.equal((await client.listProposals()).filter(({ proposal }) => proposal.scope.modify.some(({ kind, id }) => kind === "OBJECT" && id === open.object.objectId) && !["APPLIED", "FAILED", "REJECTED", "STALE", "SUPERSEDED"].includes(proposal.status)).length, 1);
  assert.equal(record.proposal.status, "READY");
  assert.equal(record.proposal.scope.read[0]?.hash, markerHash);
  const delayedOldReplay = await client.synchronizeExplicitObject({
    objectType: "MINI_PROJECT", text: "检查真实 Marker 闭环", marker: "DONE", externalId: "block-mini-marker", inputVersion: "3001",
    contentHash: checksum("[MiniProject] DONE 检查真实 Marker 闭环"), idempotencyKey: "ignored-delayed", traceId: "trace-mini-delayed",
  });
  assert.equal(delayedOldReplay.proposalId, revised.proposalId);
  assert.equal((await client.getProposal(record.proposal.proposalId))!.proposal.scope.read[0]?.hash, markerHash, "delayed receipt cannot roll the active Proposal back");
  assert.equal((await client.getObject(open.object.objectId))?.lifecycle, "OPEN");
  await assert.rejects(() => client.reviewProposal(record.proposal.proposalId, { "complete-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, record.updatedAt), /三问|409/);
  await assert.rejects(() => client.reviewProposal(record.proposal.proposalId, { "complete-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, record.updatedAt, { originalGoal: "完成真实 Marker 闭环", actualResult: "", remainingWork: "无遗留" }), /三问|409/);
  const closure = { originalGoal: "完成真实 Marker 闭环", actualResult: "Marker、审阅与提交均通过", remainingWork: "无遗留" };
  const accepted = await client.reviewProposal(record.proposal.proposalId, { "complete-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, record.updatedAt, closure);
  await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "检查真实 Marker 闭环（修订）", marker: "DONE", externalId: "block-mini-marker", inputVersion: "3003", contentHash: markerHash, idempotencyKey: "ignored-accepted-replay", traceId: "trace-mini-accepted-replay" });
  const acceptedAfterReplay = await client.getProposal(record.proposal.proposalId);
  assert.equal(acceptedAfterReplay?.updatedAt, accepted.updatedAt, "same DONE evidence cannot erase accepted three-question Closure");
  assert.deepEqual(acceptedAfterReplay?.proposal.groups[0]?.semanticOperations[0]?.payload.closure, closure);
  assert.equal((await client.getObject(open.object.objectId))?.lifecycle, "OPEN", "accept is not commit");
  const committed = await client.commitLifecycleTransition(record.proposal.proposalId, {
    expectedUpdatedAt: accepted.updatedAt, confirmation: "COMPLETE_MINI_PROJECT",
    observations: [{ kind: "BLOCK", id: "block-mini-marker", exists: true, hash: markerHash }], traceId: "trace-mini-commit",
  });
  assert.equal(committed.status, "COMPLETED");
  if (committed.status === "COMPLETED") {
    assert.equal(committed.object.objectId, open.object.objectId);
    assert.equal(committed.object.lifecycle, "COMPLETED");
    assert.equal(committed.object.condition.kind, "ACTIONABLE");
    assert.deepEqual(committed.object.closure, closure);
    assert.ok(committed.anchor);
    assert.equal(committed.anchor.externalId, "block-mini-marker");
    assert.equal(committed.anchor.contentHash, markerHash);
    assert.equal(committed.record.proposal.status, "APPLIED");
  }
  const replayed = await client.commitLifecycleTransition(record.proposal.proposalId, {
    expectedUpdatedAt: accepted.updatedAt, confirmation: "COMPLETE_MINI_PROJECT",
    observations: [{ kind: "BLOCK", id: "block-mini-marker", exists: true, hash: markerHash }], traceId: "trace-mini-commit-replay",
  });
  assert.equal(replayed.status, "COMPLETED");
  if (replayed.status === "COMPLETED") assert.equal(replayed.replayed, true);
  assert.equal((await client.listSemanticCommits()).filter(({ proposalId }) => proposalId === record.proposal.proposalId).length, 1);
});

test("external Agent MiniProject Closure completes a versioned object without requiring a DONE Marker", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-agent-mini-closure-"));
  let failAfterDomain = false;
  const serviceOptions = { databasePath: join(root, "task-copilot.db"), graphId: "graph-agent-mini-closure", token: "agent-mini-closure-token-at-least-24", faults: { afterLifecycleDomainWrite: () => { if (failAfterDomain) { failAfterDomain = false; throw new Error("fault after object-only domain write"); } } } };
  let service = await startLocalService(serviceOptions);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const created = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "交付离线验收", externalId: "block-agent-mini", inputVersion: "1", contentHash: checksum("[MiniProject] 交付离线验收"), idempotencyKey: "ignored", traceId: "trace-agent-mini-create" });
  const submitted = await client.submitProposal(miniProjectClosureProposal(created.object.objectId, created.object.version));
  const closure = { originalGoal: "完成离线验收", actualResult: "验收报告已通过", remainingWork: "后续指标转入新 Task" };
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "complete-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt, closure);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN", "review is not a formal write");
  failAfterDomain = true;
  await assert.rejects(() => client.commitLifecycleTransition(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [], traceId: "trace-agent-mini-interrupted" }), /Local Service/);
  await service.close();
  service = await startLocalService(serviceOptions);
  client = clientFor(service);
  const completed = await client.commitLifecycleTransition(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [], traceId: "trace-agent-mini-commit" });
  assert.equal(completed.status, "COMPLETED");
  if (completed.status !== "COMPLETED") return;
  assert.equal(completed.anchor, undefined, "object-only Closure does not manufacture Graph evidence");
  assert.equal(completed.replayed, true, "restart recovery reports the existing Domain receipt");
  assert.equal(completed.object.lifecycle, "COMPLETED");
  assert.deepEqual(completed.object.closure, closure);
  const replay = await client.commitLifecycleTransition(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [], traceId: "trace-agent-mini-replay" });
  assert.equal(replay.status, "COMPLETED");
  if (replay.status === "COMPLETED") assert.equal(replay.replayed, true);
});

test("sidebar MiniProject Closure entry creates one Proposal with zero formal writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-sidebar-mini-closure-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-sidebar-mini-closure", token: "sidebar-mini-closure-token-at-least-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const created = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "侧栏关闭验收", externalId: "block-sidebar-mini", inputVersion: "1", contentHash: checksum("[MiniProject] 侧栏关闭验收"), idempotencyKey: "ignored", traceId: "trace-sidebar-mini-create" });
  const proposed = await client.createMiniProjectClosureProposal(created.object.objectId, { expectedVersion: created.object.version });
  assert.equal(proposed.replayed, false);
  assert.equal(proposed.record.proposal.source.kind, "user");
  assert.deepEqual(proposed.record.proposal.scope.read, []);
  assert.equal(proposed.record.proposal.groups[0]?.semanticOperations[0]?.payload.marker, undefined);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN");
  const duplicate = miniProjectClosureProposal(created.object.objectId, created.object.version);
  duplicate.proposalId = "prop_agent_duplicate_sidebar_closure";
  await assert.rejects(() => client.submitProposal(duplicate), /活跃 Closure Proposal|409/);
  const replay = await client.createMiniProjectClosureProposal(created.object.objectId, { expectedVersion: created.object.version });
  assert.equal(replay.replayed, true);
  assert.equal(replay.record.proposal.proposalId, proposed.record.proposal.proposalId);
  assert.equal((await client.listProposals()).filter(({ proposal }) => proposal.proposalId === proposed.record.proposal.proposalId).length, 1);
  const changed = await client.changeCondition(created.object.objectId, created.object.version, { kind: "PAUSED", reason: "等待最终材料" });
  const revised = await client.createMiniProjectClosureProposal(created.object.objectId, { expectedVersion: changed.object.version });
  assert.equal(revised.replayed, false);
  assert.equal(revised.record.proposal.proposalId, proposed.record.proposal.proposalId, "version refresh revises the one machine authority");
  assert.equal(revised.record.proposal.groups[0]?.semanticOperations[0]?.target.version, changed.object.version);
  assert.equal((await client.listProposals()).filter(({ proposal }) => proposal.proposalId === proposed.record.proposal.proposalId).length, 1);
  assert.equal((await client.getObject(created.object.objectId))?.version, changed.object.version, "Proposal revision is not a formal object write");
  await assert.rejects(() => client.createMiniProjectClosureProposal(created.object.objectId, { expectedVersion: changed.object.version + 1 }), /变化|409/);
  const malformed = await fetch(new URL(`objects/${encodeURIComponent(created.object.objectId)}/closure/proposal`, service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: "{}" });
  assert.equal(malformed.status, 400);
  const task = await client.synchronizeExplicitObject({ objectType: "TASK", text: "不是 MiniProject", externalId: "block-sidebar-task", inputVersion: "1", contentHash: checksum("[任务] 不是 MiniProject"), idempotencyKey: "ignored", traceId: "trace-sidebar-task" });
  const unavailable = await fetch(new URL(`objects/${encodeURIComponent(task.object.objectId)}/closure/proposal`, service.url), { method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: task.object.version }) });
  assert.equal(unavailable.status, 409);
  const raceMini = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "并发唯一权威", externalId: "block-race-mini", inputVersion: "1", contentHash: checksum("[MiniProject] 并发唯一权威"), idempotencyKey: "ignored", traceId: "trace-race-mini" });
  const raceA = miniProjectClosureProposal(raceMini.object.objectId, raceMini.object.version); raceA.proposalId = "prop_race_closure_a";
  const raceB = miniProjectClosureProposal(raceMini.object.objectId, raceMini.object.version); raceB.proposalId = "prop_race_closure_b";
  const raced = await Promise.allSettled([client.submitProposal(raceA), client.submitProposal(raceB)]);
  assert.equal(raced.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(raced.filter(({ status }) => status === "rejected").length, 1);
  assert.equal((await client.listProposals()).filter(({ proposal }) => proposal.scope.modify.some(({ kind, id }) => kind === "OBJECT" && id === raceMini.object.objectId)).length, 1);
});

test("Task cancellation and explicit reopen retain reasons in one reviewed Lifecycle Proposal each", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-reasoned-lifecycle-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-reasoned-lifecycle", token: "reasoned-lifecycle-token-at-least-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const created = await client.synchronizeExplicitObject({ objectType: "TASK", text: "核对下线旧路径", externalId: "block-reasoned-task", inputVersion: "1", contentHash: checksum("[任务] 核对下线旧路径"), idempotencyKey: "ignored-reasoned-create", traceId: "trace-reasoned-create" });

  await assert.rejects(() => client.createLifecycleProposal(created.object.objectId, { expectedVersion: created.object.version, action: "CANCEL", reason: "  " }), /原因|400/);
  const proposed = await client.createLifecycleProposal(created.object.objectId, { expectedVersion: created.object.version, action: "CANCEL", reason: "外部系统已正式下线" });
  assert.equal(proposed.record.proposal.status, "READY");
  assert.equal(proposed.record.proposal.groups[0]?.semanticOperations[0]?.payload.reason, "外部系统已正式下线");
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN", "creating a Proposal is zero-write");
  assert.equal((await client.listSemanticCommits()).length, 0);

  const retryTask = await client.synchronizeExplicitObject({ objectType: "TASK", text: "拒绝后允许重新说明", externalId: "block-reasoned-retry", inputVersion: "1", contentHash: checksum("[任务] 拒绝后允许重新说明"), idempotencyKey: "ignored-reasoned-retry", traceId: "trace-reasoned-retry-create" });
  const rejectedProposal = await client.createLifecycleProposal(retryTask.object.objectId, { expectedVersion: retryTask.object.version, action: "CANCEL", reason: "第一次原因不完整" });
  const rejectedRecord = await client.reviewProposal(rejectedProposal.record.proposal.proposalId, { "cancel-object": { disposition: "REJECTED" } }, rejectedProposal.record.updatedAt);
  assert.equal(rejectedRecord.proposal.status, "REJECTED");
  const retriedProposal = await client.createLifecycleProposal(retryTask.object.objectId, { expectedVersion: retryTask.object.version, action: "CANCEL", reason: "补充完整的取消原因" });
  assert.notEqual(retriedProposal.record.proposal.proposalId, rejectedProposal.record.proposal.proposalId, "终态 Proposal 不应阻塞同一版本的新审阅尝试");

  const revised = await client.createLifecycleProposal(created.object.objectId, { expectedVersion: created.object.version, action: "CANCEL", reason: "外部系统已下线且无需兼容" });
  assert.equal(revised.record.proposal.proposalId, proposed.record.proposal.proposalId, "same machine intent keeps one Proposal identity");
  const accepted = await client.reviewProposal(revised.record.proposal.proposalId, { "cancel-object": { disposition: "ACCEPTED" } }, revised.record.updatedAt);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN", "review is not commit");
  await assert.rejects(() => client.commitLifecycleTransition(accepted.proposal.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "REOPEN_OBJECT", observations: [], traceId: "trace-wrong-cancel-confirmation" }), /确认|409/);
  assert.equal((await client.listSemanticCommits()).length, 0, "wrong exact confirmation creates no ledger entry");
  const cancelled = await client.commitLifecycleTransition(accepted.proposal.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "CANCEL_OBJECT", observations: [], traceId: "trace-cancel-task" });
  assert.equal(cancelled.status, "COMPLETED");
  if (cancelled.status !== "COMPLETED") return;
  assert.equal(cancelled.object.lifecycle, "CANCELLED");
  assert.equal(cancelled.record.proposal.status, "APPLIED");
  assert.equal(cancelled.record.proposal.groups[0]?.semanticOperations[0]?.payload.reason, "外部系统已下线且无需兼容");

  const reopenProposal = await client.createLifecycleProposal(cancelled.object.objectId, { expectedVersion: cancelled.object.version, action: "REOPEN", reason: "新增兼容需求已确认" });
  const reopenAccepted = await client.reviewProposal(reopenProposal.record.proposal.proposalId, { "reopen-object": { disposition: "ACCEPTED" } }, reopenProposal.record.updatedAt);
  const reopened = await client.commitLifecycleTransition(reopenAccepted.proposal.proposalId, { expectedUpdatedAt: reopenAccepted.updatedAt, confirmation: "REOPEN_OBJECT", observations: [], traceId: "trace-reopen-task" });
  assert.equal(reopened.status, "COMPLETED");
  if (reopened.status !== "COMPLETED") return;
  assert.equal(reopened.object.lifecycle, "OPEN");
  assert.equal(reopened.record.proposal.groups[0]?.semanticOperations[0]?.payload.reason, "新增兼容需求已确认");
  assert.equal((await client.listSemanticCommits()).filter(({ status }) => status === "COMPLETED").length, 2);

  const reopenForward = (await client.listSemanticCommits()).find((commit) => commit.proposalId === reopenAccepted.proposal.proposalId && commit.status === "COMPLETED");
  assert.ok(reopenForward);
  const undone = await client.undoLifecycle(reopenForward!.semanticCommitId, { confirmation: "UNDO_LIFECYCLE", traceId: "trace-reopen-undo" });
  assert.equal(undone.object.lifecycle, "CANCELLED");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === reopenForward!.semanticCommitId)?.status, "UNDONE");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === undone.undoSemanticCommitId)?.status, "COMPLETED");
  const undoReplay = await client.undoLifecycle(reopenForward!.semanticCommitId, { confirmation: "UNDO_LIFECYCLE", traceId: "trace-reopen-undo-replay" });
  assert.equal(undoReplay.replayed, true);
  assert.equal(undoReplay.object.lifecycle, "CANCELLED");
});

test("Lifecycle Commit rechecks the real object type and rejects a downgraded external Proposal before any ledger write", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-lifecycle-type-spoof-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-lifecycle-type-spoof", token: "lifecycle-type-spoof-token-at-least-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const created = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "不能被降级取消", externalId: "block-lifecycle-type-spoof", inputVersion: "1", contentHash: checksum("[MiniProject] 不能被降级取消"), idempotencyKey: "ignored-lifecycle-type-spoof", traceId: "trace-lifecycle-type-spoof-create" });
  const valid = await client.createLifecycleProposal(created.object.objectId, { expectedVersion: created.object.version, action: "CANCEL", reason: "MiniProject 已经停止" });
  const operation = valid.record.proposal.groups[0]!.semanticOperations[0]!;
  const spoof: V2Proposal = {
    ...valid.record.proposal,
    proposalId: "prop_lifecycle_type_spoof",
    groups: valid.record.proposal.groups.map((group) => ({ ...group, risk: "MEDIUM" as const, semanticOperations: group.semanticOperations.map((candidate) => ({ ...candidate, payload: { ...candidate.payload, objectType: "TASK" as const } })) })),
  };
  assert.equal(operation.payload.objectType, "MINI_PROJECT");
  const submitted = await client.submitProposal(spoof);
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "cancel-object": { disposition: "ACCEPTED" } }, submitted.record.updatedAt);
  await assert.rejects(() => client.commitLifecycleTransition(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "CANCEL_OBJECT", observations: [], traceId: "trace-lifecycle-type-spoof-commit" }), /类型|版本|变化|409/);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN");
  assert.equal((await client.listSemanticCommits()).length, 0, "spoofed type must fail before preparing a SemanticCommit");
});

test("reopening a completed MiniProject clears the current Closure and Lifecycle Undo restores its exact snapshot", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-lifecycle-closure-undo-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-lifecycle-closure-undo", token: "lifecycle-closure-undo-token-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const created = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "可恢复 Closure 的交付", externalId: "block-lifecycle-closure-undo", inputVersion: "1", contentHash: checksum("[MiniProject] 可恢复 Closure 的交付"), idempotencyKey: "ignored-lifecycle-closure-undo", traceId: "trace-lifecycle-closure-undo-create" });
  const submitted = await client.submitProposal(miniProjectClosureProposal(created.object.objectId, created.object.version));
  const closure = { originalGoal: "完成可恢复交付", actualResult: "交付验收已完成", remainingWork: "无遗留" };
  const completedProposal = await client.reviewProposal(submitted.record.proposal.proposalId, { "complete-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt, closure);
  const completed = await client.commitLifecycleTransition(completedProposal.proposal.proposalId, { expectedUpdatedAt: completedProposal.updatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [], traceId: "trace-lifecycle-closure-undo-complete" });
  assert.equal(completed.status, "COMPLETED");
  if (completed.status !== "COMPLETED") return;
  const reopen = await client.createLifecycleProposal(completed.object.objectId, { expectedVersion: completed.object.version, action: "REOPEN", reason: "需要补充一个交付指标" });
  const reopenReviewed = await client.reviewProposal(reopen.record.proposal.proposalId, { "reopen-object": { disposition: "ACCEPTED", highImpactConfirmed: true } }, reopen.record.updatedAt);
  const reopened = await client.commitLifecycleTransition(reopenReviewed.proposal.proposalId, { expectedUpdatedAt: reopenReviewed.updatedAt, confirmation: "REOPEN_OBJECT", observations: [], traceId: "trace-lifecycle-closure-undo-reopen" });
  assert.equal(reopened.status, "COMPLETED");
  if (reopened.status !== "COMPLETED") return;
  assert.equal(reopened.object.lifecycle, "OPEN");
  assert.equal(reopened.object.closure, undefined, "OPEN projection must not retain a Closure under the SQLite v11 invariant");
  const forward = (await client.listSemanticCommits()).find((commit) => commit.proposalId === reopenReviewed.proposal.proposalId && commit.status === "COMPLETED");
  assert.ok(forward);
  const undone = await client.undoLifecycle(forward!.semanticCommitId, { confirmation: "UNDO_LIFECYCLE", traceId: "trace-lifecycle-closure-undo" });
  assert.equal(undone.object.lifecycle, "COMPLETED");
  assert.deepEqual(undone.object.closure, closure);
});

test("reasoned Lifecycle Commit and inverse Undo resume across prepare and Domain receipt interruption", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-reasoned-lifecycle-recovery-"));
  const databasePath = join(root, "task-copilot.db");
  let failAfterLifecyclePrepare = false;
  let failAfterLifecycleDomain = false;
  let failAfterLifecycleUndoPrepare = false;
  let failAfterLifecycleUndoDomain = false;
  const serviceOptions = {
    databasePath,
    graphId: "graph-reasoned-lifecycle-recovery",
    token: "reasoned-lifecycle-recovery-token-24",
    faults: {
      afterLifecyclePrepare: () => { if (failAfterLifecyclePrepare) { failAfterLifecyclePrepare = false; throw new Error("fault after reasoned lifecycle prepare"); } },
      afterLifecycleDomainWrite: () => { if (failAfterLifecycleDomain) { failAfterLifecycleDomain = false; throw new Error("fault after reasoned lifecycle receipt"); } },
      afterLifecycleUndoPrepare: () => { if (failAfterLifecycleUndoPrepare) { failAfterLifecycleUndoPrepare = false; throw new Error("fault after reasoned lifecycle undo prepare"); } },
      afterLifecycleUndoDomainWrite: () => { if (failAfterLifecycleUndoDomain) { failAfterLifecycleUndoDomain = false; throw new Error("fault after reasoned lifecycle undo receipt"); } },
    },
  };
  let service = await startLocalService(serviceOptions);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const restart = async () => { await service.close(); service = await startLocalService(serviceOptions); client = clientFor(service); };
  const acceptedCancellation = async (suffix: string) => {
    const created = await client.synchronizeExplicitObject({ objectType: "TASK", text: `恢复取消 ${suffix}`, externalId: `block-reasoned-recovery-${suffix}`, inputVersion: "1", contentHash: checksum(`[任务] 恢复取消 ${suffix}`), idempotencyKey: `ignored-reasoned-recovery-${suffix}`, traceId: `trace-reasoned-recovery-create-${suffix}` });
    const proposal = await client.createLifecycleProposal(created.object.objectId, { expectedVersion: created.object.version, action: "CANCEL", reason: `恢复测试 ${suffix}` });
    return client.reviewProposal(proposal.record.proposal.proposalId, { "cancel-object": { disposition: "ACCEPTED" } }, proposal.record.updatedAt);
  };

  const prepareInterrupted = await acceptedCancellation("prepare");
  failAfterLifecyclePrepare = true;
  await assert.rejects(() => client.commitLifecycleTransition(prepareInterrupted.proposal.proposalId, { expectedUpdatedAt: prepareInterrupted.updatedAt, confirmation: "CANCEL_OBJECT", observations: [], traceId: "trace-reasoned-recovery-prepare-first" }), /Local Service/);
  assert.equal((await client.getObject(prepareInterrupted.proposal.groups[0]!.semanticOperations[0]!.target.id))?.lifecycle, "OPEN");
  assert.equal((await client.listSemanticCommits()).find(({ proposalId }) => proposalId === prepareInterrupted.proposal.proposalId)?.status, "PENDING");
  const prepareResumed = await client.commitLifecycleTransition(prepareInterrupted.proposal.proposalId, { expectedUpdatedAt: prepareInterrupted.updatedAt, confirmation: "CANCEL_OBJECT", observations: [], traceId: "trace-reasoned-recovery-prepare-resume" });
  assert.equal(prepareResumed.status, "COMPLETED");
  if (prepareResumed.status !== "COMPLETED") return;

  const receiptInterrupted = await acceptedCancellation("receipt");
  failAfterLifecycleDomain = true;
  await assert.rejects(() => client.commitLifecycleTransition(receiptInterrupted.proposal.proposalId, { expectedUpdatedAt: receiptInterrupted.updatedAt, confirmation: "CANCEL_OBJECT", observations: [], traceId: "trace-reasoned-recovery-receipt-first" }), /Local Service/);
  const receiptObjectId = receiptInterrupted.proposal.groups[0]!.semanticOperations[0]!.target.id;
  assert.equal((await client.getObject(receiptObjectId))?.lifecycle, "CANCELLED");
  assert.equal((await client.listSemanticCommits()).find(({ proposalId }) => proposalId === receiptInterrupted.proposal.proposalId)?.status, "PENDING");
  const receiptResumed = await client.commitLifecycleTransition(receiptInterrupted.proposal.proposalId, { expectedUpdatedAt: receiptInterrupted.updatedAt, confirmation: "CANCEL_OBJECT", observations: [], traceId: "trace-reasoned-recovery-receipt-resume" });
  assert.equal(receiptResumed.status, "COMPLETED");
  if (receiptResumed.status !== "COMPLETED") return;
  assert.equal(receiptResumed.replayed, true);

  const undoPrepare = (await client.listSemanticCommits()).find(({ proposalId, status }) => proposalId === receiptInterrupted.proposal.proposalId && status === "COMPLETED");
  assert.ok(undoPrepare);
  failAfterLifecycleUndoPrepare = true;
  await assert.rejects(() => client.undoLifecycle(undoPrepare!.semanticCommitId, { confirmation: "UNDO_LIFECYCLE", traceId: "trace-reasoned-undo-prepare-first" }), /Local Service/);
  assert.equal((await client.getObject(receiptObjectId))?.lifecycle, "CANCELLED");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === `lifecycle-undo:${undoPrepare!.semanticCommitId}`)?.status, "PENDING");
  const undoPreparedResumed = await client.undoLifecycle(undoPrepare!.semanticCommitId, { confirmation: "UNDO_LIFECYCLE", traceId: "trace-reasoned-undo-prepare-resume" });
  assert.equal(undoPreparedResumed.object.lifecycle, "OPEN");

  const receiptUndoForward = await acceptedCancellation("undo-receipt");
  const receiptUndoCommitted = await client.commitLifecycleTransition(receiptUndoForward.proposal.proposalId, { expectedUpdatedAt: receiptUndoForward.updatedAt, confirmation: "CANCEL_OBJECT", observations: [], traceId: "trace-reasoned-undo-receipt-forward" });
  assert.equal(receiptUndoCommitted.status, "COMPLETED");
  if (receiptUndoCommitted.status !== "COMPLETED") return;
  const receiptUndoObjectId = receiptUndoCommitted.object.objectId;
  failAfterLifecycleUndoDomain = true;
  await assert.rejects(() => client.undoLifecycle(receiptUndoCommitted.semanticCommitId, { confirmation: "UNDO_LIFECYCLE", traceId: "trace-reasoned-undo-receipt-first" }), /Local Service/);
  assert.equal((await client.getObject(receiptUndoObjectId))?.lifecycle, "OPEN");
  const undoReceiptResumed = await client.undoLifecycle(receiptUndoCommitted.semanticCommitId, { confirmation: "UNDO_LIFECYCLE", traceId: "trace-reasoned-undo-receipt-resume" });
  assert.equal(undoReceiptResumed.object.lifecycle, "OPEN");
  assert.equal(undoReceiptResumed.replayed, true);
  await restart();
  assert.equal((await client.getObject(receiptUndoObjectId))?.lifecycle, "OPEN");
});

test("Agent drafts MiniProject Closure answers into the one Proposal without changing machine intent", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-agent-mini-draft-"));
  let requestedRuntimeContext = "";
  let mutateDuringGeneration: (() => Promise<void>) | undefined;
  const modelCandidate = miniProjectClosureProposal("model-controlled-object", 99);
  modelCandidate.groups[0]!.semanticOperations[0]!.payload.closure = {
    originalGoal: "交付离线验收",
    actualResult: "验收报告已通过",
    remainingWork: "监控指标转入新 Task",
  };
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (request) => {
      requestedRuntimeContext = request.user;
      await mutateDuringGeneration?.();
      return { value: modelCandidate, metadata: { requestId: "req-mini-draft", model: "actual-model", finishReason: "stop", totalTokens: 120, durationMs: 30, attempts: 1 } };
    },
  };
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"), graphId: "graph-agent-mini-draft", token: "agent-mini-draft-token-at-least-24",
    proposalGenerator: new LocalLlmProposalGenerator(provider),
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const created = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "交付离线验收", externalId: "block-agent-mini-draft", inputVersion: "1", contentHash: checksum("[MiniProject] 交付离线验收"), idempotencyKey: "ignored", traceId: "trace-agent-mini-draft-create" });
  const proposed = await client.createMiniProjectClosureProposal(created.object.objectId, { expectedVersion: created.object.version });
  const beforeMachineIntent = {
    scope: proposed.record.proposal.scope,
    groups: proposed.record.proposal.groups.map((group) => ({ ...group, semanticOperations: group.semanticOperations.map((operation) => ({ ...operation, payload: { ...operation.payload, closure: undefined } })) })),
  };
  const drafted = await client.draftMiniProjectClosure(proposed.record.proposal.proposalId, {
    expectedUpdatedAt: proposed.record.updatedAt,
    draft: { originalGoal: "交付离线验收", actualResult: "", remainingWork: "" },
  });
  assert.equal(drafted.record.proposal.proposalId, proposed.record.proposal.proposalId);
  assert.equal(drafted.record.proposal.status, "READY");
  assert.equal(drafted.record.proposal.source.kind, "local_llm");
  assert.deepEqual(drafted.record.proposal.groups[0]?.semanticOperations[0]?.payload.closure, modelCandidate.groups[0]?.semanticOperations[0]?.payload.closure);
  assert.deepEqual(drafted.record.proposal.scope, beforeMachineIntent.scope, "model scope is discarded");
  assert.equal(drafted.record.proposal.groups[0]?.semanticOperations[0]?.target.id, created.object.objectId, "model target is discarded");
  assert.equal(drafted.record.proposal.groups[0]?.semanticOperations[0]?.target.version, created.object.version);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN", "draft is not a formal write");
  assert.equal((await client.listSemanticCommits()).length, 0);
  assert.equal(requestedRuntimeContext.includes("验收报告已通过"), false, "expected answer is not leaked into the prompt");
  await assert.rejects(() => client.draftMiniProjectClosure(proposed.record.proposal.proposalId, { expectedUpdatedAt: proposed.record.updatedAt, draft: { originalGoal: "旧值", actualResult: "", remainingWork: "" } }), /stale|变化|409/i);

  const concurrent = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "并发草拟保护", externalId: "block-agent-mini-draft-race", inputVersion: "1", contentHash: checksum("[MiniProject] 并发草拟保护"), idempotencyKey: "ignored", traceId: "trace-agent-mini-draft-race" });
  const concurrentProposal = await client.createMiniProjectClosureProposal(concurrent.object.objectId, { expectedVersion: concurrent.object.version });
  mutateDuringGeneration = async () => { await client.changeCondition(concurrent.object.objectId, concurrent.object.version, { kind: "PAUSED", reason: "草拟期间正式对象变化" }); };
  await assert.rejects(() => client.draftMiniProjectClosure(concurrentProposal.record.proposal.proposalId, { expectedUpdatedAt: concurrentProposal.record.updatedAt, draft: { originalGoal: "验证并发保护", actualResult: "", remainingWork: "" } }), /草拟期间已变化|409/);
  mutateDuringGeneration = undefined;
  assert.equal((await client.getProposal(concurrentProposal.record.proposal.proposalId))?.proposal.groups[0]?.semanticOperations[0]?.payload.closure, undefined);
});

test("MiniProject lifecycle Commit revalidates recovery, terminalizes stale state, and converges duplicate submission", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-mini-lifecycle-recovery-"));
  const databasePath = join(root, "task-copilot.db");
  let failAfterPrepare = false;
  let failAfterDomain = false;
  let failAfterStale = false;
  let failAfterCommitFailed = false;
  const serviceOptions = {
    databasePath, graphId: "graph-mini-lifecycle-recovery", token: "mini-lifecycle-recovery-token-24chars",
    faults: {
      afterLifecyclePrepare: () => { if (failAfterPrepare) { failAfterPrepare = false; throw new Error("fault after lifecycle prepare"); } },
      afterLifecycleDomainWrite: () => { if (failAfterDomain) { failAfterDomain = false; throw new Error("fault after lifecycle domain receipt"); } },
      afterLifecycleProposalStale: () => { if (failAfterStale) { failAfterStale = false; throw new Error("fault after lifecycle proposal stale"); } },
      afterLifecycleCommitFailed: () => { if (failAfterCommitFailed) { failAfterCommitFailed = false; throw new Error("fault after lifecycle commit failed"); } },
    },
  };
  let service = await startLocalService(serviceOptions);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let client = clientFor(service);
  const restart = async () => { await service.close(); service = await startLocalService(serviceOptions); client = clientFor(service); };

  const acceptedMini = async (suffix: string) => {
    const externalId = `block-mini-${suffix}`;
    const text = `Mini ${suffix}`;
    await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text, externalId, inputVersion: `${suffix}-open`, contentHash: checksum(`[MiniProject] ${text}`), idempotencyKey: "ignored", traceId: `trace-${suffix}-open` });
    const hash = checksum(`[MiniProject] DONE ${text}`);
    const proposed = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text, marker: "DONE", externalId, inputVersion: `${suffix}-done`, contentHash: hash, idempotencyKey: "ignored", traceId: `trace-${suffix}-done` });
    const ready = (await client.listProposals()).find(({ proposal }) => proposal.proposalId === proposed.proposalId)!;
    const accepted = await client.reviewProposal(ready.proposal.proposalId, { "complete-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, ready.updatedAt, { originalGoal: `完成 ${text}`, actualResult: `${text} 已完成`, remainingWork: "无遗留" });
    return { externalId, hash, objectId: proposed.object.objectId, proposalId: ready.proposal.proposalId, expectedUpdatedAt: accepted.updatedAt };
  };

  const stale = await acceptedMini("stale");
  failAfterPrepare = true;
  await assert.rejects(() => client.commitLifecycleTransition(stale.proposalId, { expectedUpdatedAt: stale.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [{ kind: "BLOCK", id: stale.externalId, exists: true, hash: stale.hash }], traceId: "trace-stale-first" }), /Local Service/);
  failAfterStale = true;
  await assert.rejects(() => client.commitLifecycleTransition(stale.proposalId, { expectedUpdatedAt: stale.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [{ kind: "BLOCK", id: stale.externalId, exists: true, hash: checksum("changed after prepare") }], traceId: "trace-stale-crash-window" }), /Local Service/);
  await restart();
  await assert.rejects(() => client.commitLifecycleTransition(stale.proposalId, { expectedUpdatedAt: stale.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [{ kind: "BLOCK", id: stale.externalId, exists: true, hash: checksum("changed after prepare") }], traceId: "trace-stale-recovery" }), /已收口|409/);
  assert.equal((await client.getObject(stale.objectId))?.lifecycle, "OPEN");
  assert.equal((await client.listSemanticCommits()).find(({ proposalId }) => proposalId === stale.proposalId)?.status, "FAILED");

  const recovered = await acceptedMini("receipt-recovery");
  failAfterDomain = true;
  await assert.rejects(() => client.commitLifecycleTransition(recovered.proposalId, { expectedUpdatedAt: recovered.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [{ kind: "BLOCK", id: recovered.externalId, exists: true, hash: recovered.hash }], traceId: "trace-recovery-first" }), /Local Service/);
  assert.equal((await client.getObject(recovered.objectId))?.lifecycle, "COMPLETED", "Domain receipt is the recovery point");
  const resumed = await client.commitLifecycleTransition(recovered.proposalId, { expectedUpdatedAt: recovered.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [{ kind: "BLOCK", id: recovered.externalId, exists: false }], traceId: "trace-recovery-resume" });
  assert.equal(resumed.status, "COMPLETED", "after the Domain receipt recovery must finish rather than re-run Graph policy");
  if (resumed.status === "COMPLETED") assert.equal(resumed.replayed, true);

  const duplicate = await acceptedMini("duplicate");
  const duplicateInput = { expectedUpdatedAt: duplicate.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT" as const, observations: [{ kind: "BLOCK" as const, id: duplicate.externalId, exists: true, hash: duplicate.hash }], traceId: "trace-duplicate" };
  const duplicateResults = await Promise.all([client.commitLifecycleTransition(duplicate.proposalId, duplicateInput), client.commitLifecycleTransition(duplicate.proposalId, { ...duplicateInput, traceId: "trace-duplicate-2" })]);
  assert.deepEqual(duplicateResults.map(({ status }) => status), ["COMPLETED", "COMPLETED"]);
  assert.equal((await client.listSemanticCommits()).filter(({ proposalId }) => proposalId === duplicate.proposalId).length, 1);

  const invalidAnchor = await acceptedMini("invalid-anchor");
  const maintenance = await V2SqliteStore.open(databasePath);
  const database = (maintenance as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): unknown } } }).database;
  database.prepare("UPDATE anchors SET status = 'conflict' WHERE graph_id = ? AND external_id = ?").run("graph-mini-lifecycle-recovery", invalidAnchor.externalId);
  maintenance.close();
  failAfterCommitFailed = true;
  await assert.rejects(() => client.commitLifecycleTransition(invalidAnchor.proposalId, { expectedUpdatedAt: invalidAnchor.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [{ kind: "BLOCK", id: invalidAnchor.externalId, exists: true, hash: invalidAnchor.hash }], traceId: "trace-invalid-anchor" }), /Local Service/);
  await restart();
  await assert.rejects(() => client.commitLifecycleTransition(invalidAnchor.proposalId, { expectedUpdatedAt: invalidAnchor.expectedUpdatedAt, confirmation: "COMPLETE_MINI_PROJECT", observations: [{ kind: "BLOCK", id: invalidAnchor.externalId, exists: true, hash: invalidAnchor.hash }], traceId: "trace-invalid-anchor-recovery" }), /已收口|409/);
  assert.equal((await client.getObject(invalidAnchor.objectId))?.lifecycle, "OPEN");
  assert.equal((await client.listSemanticCommits()).find(({ proposalId }) => proposalId === invalidAnchor.proposalId)?.status, "FAILED");
  assert.equal((await client.getProposal(invalidAnchor.proposalId))!.proposal.status, "FAILED");

  const rejectedExternalId = "block-mini-rejected-generation";
  const rejectedText = "Mini rejected-generation";
  await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: rejectedText, externalId: rejectedExternalId, inputVersion: "rejected-generation-open", contentHash: checksum(`[MiniProject] ${rejectedText}`), idempotencyKey: "ignored", traceId: "trace-rejected-open" });
  const rejectedHash = checksum(`[MiniProject] DONE ${rejectedText}`);
  const rejected = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: rejectedText, marker: "DONE", externalId: rejectedExternalId, inputVersion: "rejected-generation-done", contentHash: rejectedHash, idempotencyKey: "ignored", traceId: "trace-rejected-done" });
  assert.ok(rejected.proposalId);
  const rejectedRecord = await client.getProposal(rejected.proposalId);
  assert.ok(rejectedRecord);
  await client.reviewProposal(rejected.proposalId, { "complete-mini-project": { disposition: "REJECTED" } }, rejectedRecord.updatedAt);
  await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: rejectedText, externalId: rejectedExternalId, inputVersion: "rejected-generation-clear", contentHash: checksum(`[MiniProject] ${rejectedText}`), idempotencyKey: "ignored", traceId: "trace-rejected-clear" });
  const reproposed = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: rejectedText, marker: "DONE", externalId: rejectedExternalId, inputVersion: "rejected-generation-done-again", contentHash: rejectedHash, idempotencyKey: "ignored", traceId: "trace-rejected-again" });
  assert.notEqual(reproposed.proposalId, rejected.proposalId, "a terminal review permits a new closure generation after a fresh DONE event");
});

test("same UUID move keeps identity while a copied UUID materializes a distinct object", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-copy-move-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-copy-move",
    token: "copy-move-service-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  const base = {
    objectType: "TASK" as const,
    text: "验证外部推送",
    contentHash: checksum("[任务] 验证外部推送"),
    idempotencyKey: "transport-only",
  };
  const original = await client.synchronizeExplicitObject({
    ...base,
    externalId: "uuid-original",
    inputVersion: "2001",
    traceId: "trace-original",
  });
  assert.equal(original.operation, "MATERIALIZED");

  const moved = await client.synchronizeExplicitObject({
    ...base,
    externalId: "uuid-original",
    inputVersion: "2002",
    traceId: "trace-moved",
  });
  assert.equal(moved.operation, "SYNCHRONIZED");
  assert.equal(moved.object.objectId, original.object.objectId);
  assert.equal(moved.anchor.anchorId, original.anchor.anchorId);

  const copied = await client.synchronizeExplicitObject({
    ...base,
    externalId: "uuid-copy",
    inputVersion: "2003",
    traceId: "trace-copy",
  });
  assert.equal(copied.operation, "MATERIALIZED");
  assert.notEqual(copied.object.objectId, original.object.objectId);
  assert.notEqual(copied.anchor.anchorId, original.anchor.anchorId);
  assert.deepEqual((await client.listPrimaryAnchors()).anchors.map((anchor) => anchor.externalId), ["uuid-copy", "uuid-original"]);
});

test("Backup API creates a private server-named snapshot and validates it read-only", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-backup-"));
  const backupRoot = join(root, ".task-copilot", "backups");
  const service = await startLocalService({
    databasePath: join(root, ".task-copilot", "task-copilot.db"),
    backupRoot,
    graphId: "graph-backup",
    token: "backup-test-session-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });

  const client = clientFor(service);
  const created = await client.createBackup();
  assert.match(created.backupId, /^backup_[0-9]{17}_[0-9a-f]{32}$/);
  assert.equal(created.validation.status, "PASS");
  const backupPath = join(backupRoot, `${created.backupId}.db`);
  assert.equal((await stat(backupRoot)).mode & 0o777, 0o700);
  assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
  const before = await readFile(backupPath);
  assert.deepEqual(await client.validateBackup(created.backupId), {
    backupId: created.backupId,
    validation: created.validation,
  });
  assert.deepEqual(await readFile(backupPath), before, "restore validation must not mutate snapshot bytes");
  assert.equal("path" in created, false, "service must not disclose or accept an arbitrary backup path");
});

test("Backup API rejects request paths, traversal IDs, and corrupt snapshots without leaking internals", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-backup-errors-"));
  const backupRoot = join(root, "backups");
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    backupRoot,
    graphId: "graph-backup-errors",
    token: "backup-error-session-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const headers = { authorization: `Bearer ${service.token}`, "content-type": "application/json" };
  const attemptedDestination = join(root, "caller-selected.db");
  const arbitraryDestination = await fetch(new URL("backup/create", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ destination: attemptedDestination }),
  });
  assert.equal(arbitraryDestination.status, 400);
  assert.deepEqual(await arbitraryDestination.json(), {
    error: { code: "REQUEST_BODY_NOT_ALLOWED", message: "Backup 创建不接受客户端路径或其他参数。" },
  });
  await assert.rejects(access(attemptedDestination));

  const traversal = await fetch(new URL("backup/restore/validate", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: "../outside" }),
  });
  assert.equal(traversal.status, 400);
  assert.deepEqual(await traversal.json(), {
    error: { code: "BACKUP_ID_INVALID", message: "Backup ID 无效。" },
  });

  const oversized = await fetch(new URL("backup/restore/validate", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: "x".repeat(17 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), {
    error: { code: "REQUEST_BODY_TOO_LARGE", message: "Local Service 请求体超过 16 KiB 限制。" },
  });

  const corruptId = "backup_20260720060000000_00000000000000000000000000000000";
  await writeFile(join(backupRoot, `${corruptId}.db`), "not sqlite");
  const corrupt = await fetch(new URL("backup/restore/validate", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: corruptId }),
  });
  assert.equal(corrupt.status, 422);
  const corruptBody = await corrupt.json() as { error: { code: string; message: string }; path?: string; cause?: string };
  assert.equal(corruptBody.error.code, "V2_BACKUP_VALIDATION_FAILED");
  assert.equal("path" in corruptBody, false);
  assert.equal("cause" in corruptBody, false);
  assert.doesNotMatch(JSON.stringify(corruptBody), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Restore Apply requires explicit confirmation, creates a recovery point, restores, and stops Service", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-restore-"));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const backupRoot = join(root, ".task-copilot", "backups");
  const descriptorPath = join(root, "runtime", "service.json");
  let first = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore",
    token: "restore-first-session-token-24-characters",
  });
  t.after(async () => {
    await first.close();
    await rm(root, { recursive: true, force: true });
  });
  const snapshot = await clientFor(first).createBackup();
  await first.close();

  const changed = await V2SqliteStore.open(databasePath);
  const occurredAt = "2026-07-20T13:00:00.000Z";
  changed.commitObject({
    object: {
      objectId: "post-snapshot",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "快照后必须可回滚",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      sourceOrCreationEvent: "restore-test",
    },
    expectedVersion: 0,
    idempotencyKey: "post-snapshot",
    audit: { traceId: "post-snapshot", actor: "test", command: "create_object", objectId: "post-snapshot", beforeVersion: 0, afterVersion: 1, occurredAt },
  });
  changed.close();

  first = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore",
    token: "restore-second-session-token-24-characters",
  });
  const headers = { authorization: `Bearer ${first.token}`, "content-type": "application/json" };
  const unconfirmed = await fetch(new URL("backup/restore/apply", first.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: snapshot.backupId, confirmation: "yes" }),
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal((await unconfirmed.json() as { error: { code: string } }).error.code, "RESTORE_CONFIRMATION_REQUIRED");

  const restored = await clientFor(first).restoreBackup(snapshot.backupId, "RESTORE_AND_STOP_SERVICE");
  assert.equal(restored.status, "RESTORED_SERVICE_STOPPING");
  assert.equal(restored.validation.objectCount, 0);
  assert.match(restored.recoveryBackupId, /^backup_[0-9]{17}_[0-9a-f]{32}$/);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await access(descriptorPath);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      break;
    }
  }
  await assert.rejects(access(descriptorPath));
  await assert.rejects(() => clientFor(first).health());
  assert.equal(V2SqliteStore.validateBackup(join(backupRoot, `${restored.recoveryBackupId}.db`), "graph-restore").objectCount, 1);
  const active = await V2SqliteStore.open(databasePath);
  assert.equal(active.getObject("post-snapshot"), undefined);
  assert.equal(active.doctor().status, "PASS");
  active.close();
});
