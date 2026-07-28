import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalServiceClient, type ServiceDescriptor } from "@task-copilot/service-client";
import { V2_DATABASE_SCHEMA_VERSION, V2SqliteStore } from "@task-copilot/persistence/node";
import { exportRecoveryBundle } from "@task-copilot/persistence";
import { buildMiniProjectRestructureProposal, buildProjectCreationProposal, createEmptyState, InteractionEvidenceBuffer, V2Application, type GrillPreview, type ProjectCreationPreview } from "@task-copilot/application";
import { checksum, StructuredError } from "@task-copilot/shared";
import {
  clearRestoreRecoveryInterlock,
  readRestoreRecoveryInterlock,
} from "@task-copilot/shared/node";
import { createManagedObject, type V2Proposal } from "@task-copilot/domain";

import { LOCAL_SERVICE_PROTOCOL_VERSION, startLocalService } from "../src/service.ts";
import { LocalLlmProposalGenerator, type StructuredProposalProvider, type V2PromptBundle } from "../src/llm-proposal.ts";
import { LocalLlmUxOutputGenerator } from "../src/llm-ux-output.ts";
import { LocalLlmGrillTurnGenerator } from "../src/llm-grill-turn.ts";
import { LocalLlmGrillPreviewGenerator } from "../src/llm-grill-preview.ts";
import { LocalLlmProjectCreationPreviewGenerator } from "../src/llm-project-creation-preview.ts";

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

function blankProjectCreationPreview(): ProjectCreationPreview {
  const claim = (text: string, evidenceRefs = ["answer:outcome"]) => ({ text, evidenceRefs });
  return {
    schemaVersion: "task-copilot-project-creation-preview-v1",
    finalReading: {
      title: claim("设备治理"),
      outcome: claim("持续形成可核验的设备治理结果。"),
      boundary: { included: [claim("测试设备。")], excluded: [claim("生产设备。")] },
      completionEvidence: [claim("每月核验记录可追溯。")],
      internalClosure: claim("每月处理核验差异。"),
      currentInterface: claim("先查看本月尚未核验的设备。"),
    },
    pageObjectRelationship: {
      mode: "CREATE_DEDICATED_PROJECT_PAGE",
      rationale: "创建独立受控 Project Page。",
      evidenceRefs: ["answer:page-object-relationship"],
      authority: "PROPOSED_FOR_REVIEW",
    },
    sourceMaterials: [],
    formalImpact: { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 },
    evidenceScope: { refs: ["answer:outcome", "answer:page-object-relationship"], scopeHash: checksum("project-creation-scope"), observedAt: "2026-07-25T14:00:00.000Z" },
    authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: {
      contractVersion: "1.0.0",
      promptVersion: "1.0.0",
      skillName: "project-creation-modeling",
      skillVersion: "1.1.0",
      providerId: "deepseek",
      providerVersion: "chat-completions-v1",
      model: "deepseek-v4-flash",
      generatedAt: "2026-07-25T14:00:00.000Z",
    },
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

function projectStructureProposal(objectId: string, version: number): V2Proposal {
  const projectStructure = {
    objectives: [{ objectiveId: "objective-release", text: "稳定发布", priority: "PRIMARY" as const, successEvidence: ["恢复演练通过"] }],
    deliverables: [{ deliverableId: "deliverable-runbook", text: "发布手册", acceptance: "值班同学可独立执行", status: "AVAILABLE" as const }],
    workStages: [{ stageId: "stage-verify", name: "验收", statusDescription: "正在验证恢复路径" }],
    currentSummary: "核心链路已完成，正在做恢复验收。", currentFocuses: ["完成恢复演练", "收口操作手册"],
    stageMappings: [{ objectId: "task-restore", stageId: "stage-verify" }],
  };
  const previousProjectStructure = { objectives: [], deliverables: [], workStages: [], currentSummary: "已创建 发布治理，待明确目标与当前推进。", currentFocuses: ["明确目标与下一步"], stageMappings: [] };
  return { proposalId: "prop_project_structure", schemaVersion: "v2", title: "更新发布治理当前接口", context: "Project 当前信息需要收口。", understanding: "目标、交付、阶段和当前推进必须一起审阅。", objective: "形成可重入的一屏接口。", logic: "单一版本化聚合随 Proposal 提交。", finalPreview: projectStructure.currentSummary, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "OBJECT", id: objectId, version }] }, preconditions: ["Project 仍为 OPEN"], groups: [{ groupId: "update-project-interface", explanation: "当前接口不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: "update-project-interface", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: objectId, version }, summary: "更新 Project 当前接口", payload: { previousProjectStructure, projectStructure }, preconditions: [] }], disposition: "PENDING" }], status: "READY", createdAt: "2026-07-22T13:00:00.000Z" };
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

async function userConfirmedProjectClosureCompletion(
  request: Parameters<StructuredProposalProvider["completeStructured"]>[0],
): Promise<Awaited<ReturnType<StructuredProposalProvider["completeStructured"]>>> {
  const runtime = JSON.parse(request.user.slice(request.user.indexOf("\n") + 1)) as {
    exactReadScope: V2Proposal["scope"]["read"];
    exactModifyScope: V2Proposal["scope"]["modify"];
    userJudgments: {
      actualResult: string;
      objectiveDispositions: Array<{ objectiveId: string; disposition: string; reason?: string; nextStep?: string }>;
      legacyDisposition: string;
      keyDecisions: string[];
      futureSummary: string;
    };
  };
  const target = runtime.exactModifyScope[0]!;
  const incomplete = runtime.userJudgments.objectiveDispositions.find(({ disposition }) => disposition === "INCOMPLETE")!;
  return {
    value: {
      title: "审阅发布治理 Closure",
      context: "正式证据与用户判断已准备好。",
      understanding: "目标仍有明确遗留，关闭后继续承接。",
      objective: "形成 Closure 并完成 Project。",
      logic: "Closure 与 Lifecycle 在同一 HIGH 组审阅。",
      finalPreview: "发布治理将按用户确认的结果与遗留进入最终审阅。",
      unresolvedQuestions: [],
      scope: { read: runtime.exactReadScope, modify: runtime.exactModifyScope },
      preconditions: ["Project 仍为 OPEN，且证据范围未变化。"],
      groups: [{
        groupId: "close-project",
        explanation: "Closure 与完成不可拆分。",
        risk: "HIGH",
        independentlyAcceptable: true,
        dependencies: [],
        textPatches: [],
        semanticOperations: [
          {
            operationId: "record-closure",
            kind: "UPDATE_PROJECT_INTERFACE",
            target,
            summary: "记录结构化 Closure",
            payload: {
              closure: {
                originalGoal: "稳定发布",
                actualResult: runtime.userJudgments.actualResult,
                majorDeliverables: ["发布手册"],
                incompleteObjectives: [{
                  objective: "稳定发布",
                  reason: incomplete.reason,
                  nextStep: incomplete.nextStep,
                }],
                legacyDisposition: runtime.userJudgments.legacyDisposition,
                keyDecisions: runtime.userJudgments.keyDecisions,
                futureSummary: runtime.userJudgments.futureSummary,
              },
            },
            preconditions: [],
          },
          {
            operationId: "complete-project",
            kind: "TRANSITION_LIFECYCLE",
            target,
            summary: "完成 Project",
            payload: { lifecycle: "COMPLETED" },
            preconditions: [],
          },
        ],
        disposition: "PENDING",
      }],
    },
    metadata: { requestId: "closure-user-confirmed", model: "test-model", finishReason: "stop", totalTokens: 321, durationMs: 9, attempts: 1 },
  };
}

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

test("Area controlled routes create, replay, edit, and reject stale or cross-type writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-area-service-"));
  const service = await startLocalService({
    databasePath: join(root, ".task-copilot", "task-copilot.db"),
    graphId: "graph-area-service-test",
    token: "area-test-session-token-at-least-24-characters",
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);

  const created = await client.createArea({ text: "  健康管理  ", traceId: "trace-area-create" });
  assert.equal(created.object.objectType, "AREA");
  assert.equal(created.object.text, "健康管理");
  assert.equal(created.object.version, 1);
  assert.equal(created.replayed, false);
  assert.equal((await client.createArea({ text: "健康管理", traceId: "trace-area-create" })).replayed, true);
  assert.deepEqual(await client.listObjects(), [created.object]);

  const edited = await client.editArea(created.object.objectId, { text: "维持稳定作息与健康检查", expectedVersion: 1, traceId: "trace-area-edit" });
  assert.equal(edited.object.version, 2);
  assert.equal(edited.object.text, "维持稳定作息与健康检查");
  assert.equal((await client.editArea(created.object.objectId, { text: "维持稳定作息与健康检查", expectedVersion: 1, traceId: "trace-area-edit" })).replayed, true);
  await assert.rejects(() => client.editArea(created.object.objectId, { text: "过期更改", expectedVersion: 1, traceId: "trace-area-stale" }), (error: unknown) => {
    return error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT";
  });
  const task = await client.materializeExplicitObject({ objectType: "TASK", text: "不可经 Area 入口编辑", externalId: "area-cross-type-task", inputVersion: "1", contentHash: checksum("[任务] 不可经 Area 入口编辑"), idempotencyKey: "unused-client-key", traceId: "trace-area-cross-type" });
  await assert.rejects(() => client.editArea(task.object.objectId, { text: "越权更改", expectedVersion: task.object.version, traceId: "trace-area-cross-type-edit" }), (error: unknown) => {
    return error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_AREA_ONLY";
  });
  await assert.rejects(() => client.createArea({ text: "", traceId: "trace-area-invalid" }));
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
    { name: "design-project", version: "1.3.0" },
    { name: "recover-context", version: "1.3.0" },
    { name: "mini-project-modeling", version: "1.3.0" },
    { name: "project-creation-modeling", version: "1.6.0" },
  ]);
  const project = await client.getSkill("design-project");
  assert.match(project?.content ?? "", /Apply `task-copilot-core` first/);
  assert.match(project?.content ?? "", /"schemaVersion": "v2"/);
  assert.equal(project?.sha256, skills.find(({ name }) => name === "design-project")?.sha256);
  const recovery = await client.getSkill("recover-context");
  assert.match(recovery?.content ?? "", /task-copilot-ux-output-v1/);
  assert.equal(recovery?.sha256, skills.find(({ name }) => name === "recover-context")?.sha256);
  const grill = await client.getSkill("mini-project-modeling");
  assert.match(grill?.content ?? "", /task-copilot-grill-turn-v1/);
  assert.match(grill?.content ?? "", /exactly one question/i);
  assert.equal(grill?.sha256, skills.find(({ name }) => name === "mini-project-modeling")?.sha256);
  const projectCreation = await client.getSkill("project-creation-modeling");
  assert.match(projectCreation?.content ?? "", /Do not ask a fixed/i);
  assert.equal(projectCreation?.sha256, skills.find(({ name }) => name === "project-creation-modeling")?.sha256);
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

test("Project context recovery uses server-owned facts and a read-only action without formal writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-context-recovery-"));
  let providerCalls = 0;
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async ({ system, user }) => {
      providerCalls += 1;
      assert.match(system, /recover-context/);
      assert.match(system, /never write formal Graph or SQLite state directly/i);
      assert.match(system, /current recovery draft.*user disposition.*not.*business-context\s+unknowns/is);
      assert.match(user, /READ_ONLY_DERIVATIVE/);
      assert.match(user, /project-reentry-insufficient/);
      assert.match(user, /"factId":"project-recovery-summary"/);
      assert.match(user, /"actionId":"project-primary-action"/);
      return {
        value: {
          schemaVersion: "task-copilot-ux-output-v1",
          factRefs: ["project-recovery-summary"],
          inferences: [],
          unknowns: ["尚未形成有证据支撑的 Project 当前边界或进入点"],
          summary: "项目入口证据不足，应先回到项目原文补齐当前边界。",
          suggestedChanges: [],
          nextActionEligible: true,
          nextActionId: "project-primary-action",
          riskLevel: "NONE",
          requiresDiscussion: false,
          requiresReview: false,
        },
        metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
      };
    },
  };
  const interactionEvidence = new InteractionEvidenceBuffer();
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-context-recovery",
    token: "context-recovery-token-at-least-24-chars",
    proposalGenerator: new LocalLlmProposalGenerator(provider),
    uxOutputGenerator: new LocalLlmUxOutputGenerator(provider, interactionEvidence, () => "uxi_1234567890abcdef"),
    interactionEvidence,
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const prepared = await client.prepareProject({ name: "发布治理", traceId: "context-recovery-prepare" });
  const finalized = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "发布治理",
    pageExternalId: "page-context-recovery",
    pageContentHash: checksum(""),
    traceId: "context-recovery-finalize",
  });
  const before = await client.status();

  const result = await client.recoverProjectContext({
    objectId: finalized.object.objectId,
    expectedVersion: finalized.object.version,
  });

  assert.equal(result.output.summary, "项目入口证据不足，应先回到项目原文补齐当前边界。");
  assert.deepEqual(result.output.facts, [{
    text: `最近一次正式变化：${finalized.object.updatedAt}`,
    sourceRefs: [`object:${finalized.object.objectId}@v${finalized.object.version}`],
  }]);
  assert.deepEqual(result.output.nextAction, {
    intent: "OPEN_SOURCE",
    label: "打开项目原文",
    targetRef: `anchor:${finalized.anchor.anchorId}`,
  });
  assert.equal(result.output.provenance.skillName, "recover-context");
  assert.equal(result.interactionId, "uxi_1234567890abcdef");
  assert.match(result.contextFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(await client.status(), before, "Context recovery does not mutate formal state");
  assert.equal(providerCalls, 1);

  const helpful = await client.setUxInteractionDisposition(result.interactionId!, "HELPFUL");
  assert.equal(helpful.userDisposition, "HELPFUL");
  assert.equal(helpful.summary.helpfulRate, 1);
  const changed = await client.setUxInteractionDisposition(result.interactionId!, "TOO_MUCH");
  assert.equal(changed.summary.noiseRate, 1);
  const suppressed = await client.setUxInteractionDisposition(result.interactionId!, "DO_NOT_REPEAT");
  assert.equal(suppressed.userDisposition, "DO_NOT_REPEAT");
  await assert.rejects(
    () => client.recoverProjectContext({ objectId: finalized.object.objectId, expectedVersion: finalized.object.version }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "UX_OUTPUT_SESSION_SUPPRESSED",
  );
  assert.equal(providerCalls, 1, "session suppression fails before Provider invocation");
  const withdrawn = await client.setUxInteractionDisposition(result.interactionId!);
  assert.equal(withdrawn.userDisposition, null);
  assert.equal((await client.getUxInteractionSummary()).summary.rated, 0);
  assert.doesNotMatch(interactionEvidence.exportJsonl(), /uxi_1234567890abcdef|发布治理/);

  await assert.rejects(
    () => client.recoverProjectContext({ objectId: finalized.object.objectId, expectedVersion: finalized.object.version - 1 }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT",
  );
  assert.equal(providerCalls, 1, "stale requests fail before Provider invocation");
});

test("Project context recovery replaces generated telemetry with STALE after post-Provider version conflict", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-context-recovery-stale-"));
  let releaseProvider!: () => void;
  let markProviderStarted!: () => void;
  const providerStarted = new Promise<void>((resolve) => {
    markProviderStarted = resolve;
  });
  const providerRelease = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => {
      markProviderStarted();
      await providerRelease;
      return {
        value: {
          schemaVersion: "task-copilot-ux-output-v1",
          factRefs: ["project-recovery-summary"],
          inferences: [],
          unknowns: ["当前进入点仍需确认"],
          summary: "当前 Project 需要从正式入口重新确认。",
          suggestedChanges: [],
          nextActionEligible: true,
          nextActionId: "project-primary-action",
          riskLevel: "NONE",
          requiresDiscussion: true,
          requiresReview: false,
        },
        metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
      };
    },
  };
  const interactionEvidence = new InteractionEvidenceBuffer();
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-context-recovery-stale",
    token: "context-recovery-stale-token-24-chars",
    uxOutputGenerator: new LocalLlmUxOutputGenerator(provider, interactionEvidence, () => "uxi_stale12345678901"),
    interactionEvidence,
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const prepared = await client.prepareProject({ name: "版本冲突验证", traceId: "context-recovery-stale-prepare" });
  const finalized = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "版本冲突验证",
    pageExternalId: "page-context-recovery-stale",
    pageContentHash: checksum(""),
    traceId: "context-recovery-stale-finalize",
  });

  const recovery = client.recoverProjectContext({
    objectId: finalized.object.objectId,
    expectedVersion: finalized.object.version,
  });
  await providerStarted;
  await client.changeCondition(finalized.object.objectId, finalized.object.version, {
    kind: "PAUSED",
    reason: "受控并发变化",
  });
  releaseProvider();

  await assert.rejects(
    () => recovery,
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT",
  );
  const summary = interactionEvidence.summary();
  assert.equal(summary.outcomes.GENERATED, 0);
  assert.equal(summary.outcomes.STALE, 1);
  assert.match(interactionEvidence.exportJsonl(), /"failureCode":"V2_OBJECT_VERSION_CONFLICT"/);
  assert.doesNotMatch(interactionEvidence.exportJsonl(), /版本冲突验证|受控并发变化|uxi_stale12345678901/);
});

test("Project context recovery fails closed for missing Provider, unsupported type, and client-owned fields", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-context-recovery-closed-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-context-recovery-closed",
    token: "context-recovery-closed-token-24-chars",
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const project = await client.prepareProject({ name: "安全边界", traceId: "context-recovery-closed-prepare" });
  const finalized = await client.finalizeProject({
    semanticCommitId: project.semanticCommitId,
    objectId: project.objectId,
    name: "安全边界",
    pageExternalId: "page-context-recovery-closed",
    pageContentHash: checksum(""),
    traceId: "context-recovery-closed-finalize",
  });
  await assert.rejects(
    () => client.recoverProjectContext({ objectId: finalized.object.objectId, expectedVersion: finalized.object.version }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "LLM_PROVIDER_DISABLED",
  );

  const task = await client.materializeExplicitObject({
    objectType: "TASK",
    text: "不能走 Project 恢复入口",
    externalId: "context-recovery-task",
    inputVersion: "1",
    contentHash: checksum("[任务] 不能走 Project 恢复入口"),
    idempotencyKey: "context-recovery-task-unused",
    traceId: "context-recovery-task",
  });
  const headers = {
    authorization: `Bearer ${service.token}`,
    "content-type": "application/json",
  };
  const crossType = await fetch(new URL("provider/ux/project-context-recovery", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ objectId: task.object.objectId, expectedVersion: task.object.version }),
  });
  assert.equal(crossType.status, 400);
  assert.equal((await crossType.json() as { error: { code: string } }).error.code, "UX_CONTEXT_PROJECT_REQUIRED");
  const injected = await fetch(new URL("provider/ux/project-context-recovery", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      objectId: finalized.object.objectId,
      expectedVersion: finalized.object.version,
      facts: [{ text: "client invented fact" }],
    }),
  });
  assert.equal(injected.status, 400);
  assert.equal((await injected.json() as { error: { code: string } }).error.code, "UX_CONTEXT_RECOVERY_REQUEST_INVALID");
});

test("Project narration uses bounded Provider output then Review, Commit, and Undo without changing structure", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-narration-"));
  let providerCalls = 0;
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async ({ system, user }) => {
      providerCalls += 1;
      assert.match(system, /recover-context/);
      assert.match(user, /OPTIMIZE_CURRENT_SUMMARY_ONLY/);
      assert.match(user, /"allowedNextActions":\[\]/);
      return {
        value: {
          schemaVersion: "task-copilot-ux-output-v1",
          factRefs: ["project-recovery-summary"],
          inferences: [],
          unknowns: ["尚不能确认最终发布时间"],
          summary: "Project 已建立，当前需要先明确目标和下一步。",
          suggestedChanges: [],
          nextActionEligible: false,
          riskLevel: "MEDIUM",
          requiresDiscussion: false,
          requiresReview: true,
        },
        metadata: { model: "deepseek-chat", durationMs: 18, attempts: 1 },
      };
    },
  };
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-narration",
    token: "project-narration-token-at-least-24",
    uxOutputGenerator: new LocalLlmUxOutputGenerator(provider),
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const intent = await client.prepareProject({ name: "发布治理", traceId: "project-narration-create" });
  const created = await client.finalizeProject({
    semanticCommitId: intent.semanticCommitId,
    objectId: intent.objectId,
    name: "发布治理",
    pageExternalId: "page-project-narration",
    pageContentHash: checksum(""),
    traceId: "project-narration-finalize",
  });
  const before = created.object.projectStructure!;

  const generated = await client.createProjectNarrationProposal({
    objectId: created.object.objectId,
    expectedVersion: created.object.version,
  });
  assert.equal(providerCalls, 1);
  assert.equal(generated.record.proposal.groups[0]?.risk, "MEDIUM");
  assert.equal(generated.record.proposal.groups[0]?.semanticOperations[0]?.kind, "UPDATE_PROJECT_NARRATION");
  assert.equal((await client.getObject(created.object.objectId))?.projectStructure?.currentSummary, before.currentSummary);

  const reviewed = await client.reviewProposal(generated.record.proposal.proposalId, {
    "update-project-narration": { disposition: "ACCEPTED" },
  }, generated.record.updatedAt);
  const committed = await client.commitProjectStructure(reviewed.proposal.proposalId, {
    expectedUpdatedAt: reviewed.updatedAt,
    confirmation: "UPDATE_PROJECT_INTERFACE",
    observations: [],
    traceId: "project-narration-commit",
  });
  assert.equal(committed.status, "COMPLETED");
  if (committed.status !== "COMPLETED") return;
  assert.equal(committed.object.projectStructure?.currentSummary, "Project 已建立，当前需要先明确目标和下一步。");
  assert.deepEqual(committed.object.projectStructure?.currentFocuses, before.currentFocuses);
  assert.deepEqual(committed.object.projectStructure?.objectives, before.objectives);

  const undone = await client.undoProjectStructure(committed.semanticCommitId, {
    confirmation: "UNDO_PROJECT_INTERFACE",
    traceId: "project-narration-undo",
  });
  assert.equal(undone.object.projectStructure?.currentSummary, before.currentSummary);
  assert.deepEqual(undone.object.projectStructure?.currentFocuses, before.currentFocuses);
});

test("Project Creation Grill uses Blank, Page, or MiniProject sources and rejects stale Graph material without creating new formal state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-creation-grill-"));
  let providerCalls = 0;
  let providerSource: "BLANK" | "PAGE" | "MINI_PROJECT" = "BLANK";
  let providerReady = false;
  let providerInvalidTurn = false;
  let providerRelationshipMode: "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE" | "REUSE_SOURCE_PAGE" = "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE";
  let providerPreviewCurrentInterface = "先看本月待核验设备。";
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (input) => {
      providerCalls += 1;
      if (input.system.startsWith("Return exactly one task-copilot-project-creation-preview-v1")) {
        const blankPreview = input.user.includes("\"sourceKind\":\"BLANK\"");
        const miniProjectPreview = input.user.includes("MINI_PROJECT");
        const evidenceRefs = blankPreview
          ? ["session:project-creation-entry"]
          : [miniProjectPreview ? "block:mini-evolution-root" : "block:project-page-root"];
        const claim = (text: string) => ({ text, evidenceRefs });
        return {
          value: {
            schemaVersion: "task-copilot-project-creation-preview-v1",
            title: claim("Project 验收记录"),
            outcome: claim("持续形成可核验结果。"),
            boundary: { included: [claim("托管设备治理。")], excluded: [] },
            completionEvidence: [claim("月度记录可追溯。")],
            internalClosure: claim("每月核验并处理差异。"),
            currentInterface: claim(providerPreviewCurrentInterface),
            pageObjectRelationship: {
              mode: blankPreview ? "CREATE_DEDICATED_PROJECT_PAGE" : providerRelationshipMode,
              rationale: blankPreview ? "空白入口创建受控 Project Page。" : "创建受控 Project Page 并连接原 Page。",
              evidenceRefs,
            },
            sourceMaterials: blankPreview ? [] : [
              { materialId: "source-1", disposition: "LINK_AS_SOURCE", rationale: "保留来源根材料。", evidenceRefs: [miniProjectPreview ? "block:mini-evolution-root" : "block:project-page-root"] },
              { materialId: "source-2", disposition: "LINK_AS_SOURCE", rationale: "保留来源子材料。", evidenceRefs: [miniProjectPreview ? "block:mini-evolution-child" : "block:project-page-child"] },
            ],
          },
          metadata: { model: "deepseek-chat", durationMs: 18, attempts: 1 },
        };
      }
      if (providerInvalidTurn) {
        return {
          value: {
            schemaVersion: "task-copilot-grill-turn-v1",
            understanding: "越界草稿",
            factRefs: ["creation-entry"],
            inferences: [],
            unknowns: [{ uncertaintyId: "outcome", text: "持续结果仍未知。" }],
            readiness: "CONTINUE",
            focusUncertaintyId: "outcome",
            questions: [{ uncertaintyId: "outcome", text: "需要形成什么结果？" }],
            recommendation: { text: "建议先明确结果。", evidenceRefs: ["creation-entry"], tradeoffs: [] },
            operations: [{ kind: "CREATE_OBJECT" }],
          },
          metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
        };
      }
      const pageTurn = providerSource === "PAGE";
      const miniProjectTurn = providerSource === "MINI_PROJECT";
      const focus = pageTurn ? "material-disposition" : miniProjectTurn ? "project-boundary" : "outcome";
      const evidenceRef = pageTurn ? "block:project-page-root" : miniProjectTurn ? "block:mini-evolution-root" : "session:project-creation-entry";
      return {
        value: {
          schemaVersion: "task-copilot-grill-turn-v1",
          understanding: providerReady ? "七项 Project 创建判断已经由用户回答，可以进入最终阅读预览。" : pageTurn ? "Page 材料已读取，但尚未决定如何进入 Project。" : miniProjectTurn ? "MiniProject 材料已读取，但升级边界仍未明确。" : "用户已从空白入口发起 Project 创建，但持续结果仍未明确。",
          factRefs: [providerReady ? "answer-outcome" : pageTurn || miniProjectTurn ? "source-1" : "creation-entry"],
          inferences: [],
          unknowns: providerReady ? [] : [{ uncertaintyId: focus, text: "当前最大不确定性仍未解决。" }],
          readiness: providerReady ? "READY_FOR_PREVIEW" : "CONTINUE",
          ...(providerReady ? { questions: [] } : {
            focusUncertaintyId: focus,
            questions: [{ uncertaintyId: focus, text: pageTurn ? "现有 Page 材料应如何进入新 Project？" : miniProjectTurn ? "为什么这项工作需要升级为持续 Project？" : "它需要持续形成什么可被使用或检验的结果？" }],
            recommendation: {
              text: "建议先解决当前最大不确定性。",
              evidenceRefs: [evidenceRef],
              tradeoffs: ["先不命名页面，会晚一步看到最终 Project 入口。"],
            },
          }),
        },
        metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
      };
    },
  };
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-creation-grill",
    token: "project-creation-grill-token-at-least-24-chars",
    grillTurnGenerator: new LocalLlmGrillTurnGenerator(provider),
    projectCreationPreviewGenerator: new LocalLlmProjectCreationPreviewGenerator(provider),
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);

  const result = await client.grillProjectCreation({ sourceKind: "BLANK", answers: [] });
  assert.equal(result.output.questionGroup?.focusUncertaintyId, "outcome");
  assert.equal(result.output.authorityBoundary, "SESSION_DRAFT_ONLY");
  assert.equal(result.output.provenance.skillName, "project-creation-modeling");
  assert.equal(providerCalls, 1);
  assert.equal((await client.status()).objectCount, 0);

  providerInvalidTurn = true;
  const invalidTurn = await fetch(new URL("provider/grill/project-creation/turn", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ sourceKind: "BLANK", answers: [] }),
  });
  assert.equal(invalidTurn.status, 422, "a schema-valid but authority-invalid Grill turn is a user-correctable validation response");
  assert.deepEqual(await invalidTurn.json(), {
    error: {
      code: "GRILL_TURN_VALIDATION_FAILED",
      message: "Provider 输出未通过 Grill Turn Validator；没有进入结构预览或正式写入。",
      validationCategory: "SHAPE",
    },
  });
  providerInvalidTurn = false;

  providerReady = true;
  const beforeBlankPreview = await client.status();
  const blankPreview = await client.previewProjectCreation({
    sourceKind: "BLANK",
    answers: [
      { uncertaintyId: "outcome", text: "持续形成可核验结果。" },
      { uncertaintyId: "project-boundary", text: "只覆盖托管设备治理。" },
      { uncertaintyId: "completion-evidence", text: "月度记录可追溯。" },
      { uncertaintyId: "internal-closure", text: "每月核验并处理差异。" },
      { uncertaintyId: "current-interface", text: "先看本月待核验设备。" },
    ],
  });
  assert.match(blankPreview.previewHandle, /^grill_preview_[A-Za-z0-9_-]{24,96}$/);
  assert.equal(blankPreview.output.pageObjectRelationship.mode, "CREATE_DEDICATED_PROJECT_PAGE");
  assert.deepEqual(blankPreview.output.sourceMaterials, [], "Blank Preview cannot invent source material");
  assert.deepEqual(blankPreview.output.formalImpact, { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 });
  assert.deepEqual(await client.status(), beforeBlankPreview, "Blank Project Creation Preview remains zero-write");
  assert.equal(providerCalls, 4, "one rejected Grill draft receives exactly one bounded Validator repair attempt");
  const blankProposal = await client.createProjectCreationProposal({ previewHandle: blankPreview.previewHandle });
  assert.equal(blankProposal.replayed, false);
  assert.equal(blankProposal.record.proposal.status, "READY");
  assert.equal(blankProposal.record.proposal.groups[0]?.risk, "HIGH");
  assert.equal(blankProposal.record.proposal.groups[0]?.semanticOperations[0]?.kind, "CREATE_OBJECT");
  assert.equal(blankProposal.record.proposal.groups[0]?.semanticOperations[0]?.payload.relationshipMode, "CREATE_DEDICATED_PROJECT_PAGE");
  assert.equal((await client.createProjectCreationProposal({ previewHandle: blankPreview.previewHandle })).replayed, true);
  const acceptedBlankProposal = await client.reviewProposal(blankProposal.record.proposal.proposalId, {
    "create-project": { disposition: "ACCEPTED", highImpactConfirmed: true },
  }, blankProposal.record.updatedAt);
  assert.equal(acceptedBlankProposal.proposal.status, "ACCEPTED");
  assert.deepEqual(await client.status(), beforeBlankPreview, "accepting Project Creation Proposal remains zero formal object/page write");
  providerPreviewCurrentInterface = "先处理本月核验差异。";
  const regeneratedBlankPreview = await client.previewProjectCreation({
    sourceKind: "BLANK",
    answers: [
      { uncertaintyId: "outcome", text: "持续形成可核验结果。" },
      { uncertaintyId: "project-boundary", text: "只覆盖托管设备治理。" },
      { uncertaintyId: "completion-evidence", text: "月度记录可追溯。" },
      { uncertaintyId: "internal-closure", text: "每月核验并处理差异。" },
      { uncertaintyId: "current-interface", text: "先看本月待核验设备。" },
    ],
  });
  const regeneratedBlankProposal = await client.createProjectCreationProposal({ previewHandle: regeneratedBlankPreview.previewHandle });
  assert.notEqual(regeneratedBlankProposal.record.proposal.proposalId, blankProposal.record.proposal.proposalId, "distinct server-owned Preview intent cannot collide on Proposal identity");
  providerPreviewCurrentInterface = "先看本月待核验设备。";
  const identicalBlankPreview = await client.previewProjectCreation({
    sourceKind: "BLANK",
    answers: [
      { uncertaintyId: "outcome", text: "持续形成可核验结果。" },
      { uncertaintyId: "project-boundary", text: "只覆盖托管设备治理。" },
      { uncertaintyId: "completion-evidence", text: "月度记录可追溯。" },
      { uncertaintyId: "internal-closure", text: "每月核验并处理差异。" },
      { uncertaintyId: "current-interface", text: "先看本月待核验设备。" },
    ],
  });
  const identicalBlankProposal = await client.createProjectCreationProposal({ previewHandle: identicalBlankPreview.previewHandle });
  assert.notEqual(identicalBlankProposal.record.proposal.proposalId, blankProposal.record.proposal.proposalId, "a separately generated Preview owns a distinct Proposal identity even when its reading is identical");
  await assert.rejects(
    () => client.createProjectCreationProposal({ previewHandle: "grill_preview_AAAAAAAAAAAAAAAAAAAAAAAA" }),
    (error: unknown) => {
      assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "PROJECT_CREATION_PREVIEW_SESSION_EXPIRED");
      return true;
    },
  );
  providerReady = false;

  const resolved = { kind: "PAGE" as const, id: "project-page", name: "Project Notes", version: 2, evidenceHash: checksum("project-page") };
  const blocks = [
    { uuid: "project-page-root", content: "项目资料", contentHash: checksum("项目资料"), relation: "ROOT" as const, depth: 0 },
    { uuid: "project-page-child", content: "待整理记录", contentHash: checksum("待整理记录"), relation: "CHILD" as const, depth: 1, parentUuid: "project-page-root" },
    { uuid: "project-page-empty", content: "", contentHash: checksum(""), relation: "CHILD" as const, depth: 1, parentUuid: "project-page-root" },
  ];
  const snapshot = { kind: "PAGE" as const, requestedTarget: "Project Notes", resolved, blocks, truncated: false, readAt: "2026-07-25T13:00:00.000Z", scopeHash: checksum({ kind: "PAGE", resolved, blocks, truncated: false }) };
  const bridge = (async () => {
    for (let index = 0; index < 2; index += 1) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (pending?.kind === "PAGE") assert.equal(pending.depth, 5);
      if (!pending) throw new Error("expected Project Creation Page read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  })();
  providerSource = "PAGE";
  const pagePromise = client.grillProjectCreation({ sourceKind: "PAGE", pageId: "Project Notes", answers: [] });
  const [, pageResult] = await Promise.all([bridge, pagePromise]);
  assert.equal(pageResult.output.questionGroup?.focusUncertaintyId, "material-disposition");
  assert.equal(providerCalls, 7);
  assert.equal((await client.status()).objectCount, 0);

  const notReadyPreviewBridge = (async () => {
    const pending = await client.claimGraphReadRequest();
    assert.equal(pending?.kind, "PAGE");
    if (!pending) throw new Error("expected not-ready Project Creation Preview Page read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
  })();
  const notReadyPreviewPromise = client.previewProjectCreation({ sourceKind: "PAGE", pageId: "Project Notes", answers: [] });
  await notReadyPreviewBridge;
  await assert.rejects(notReadyPreviewPromise, (error: unknown) => {
    assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "PROJECT_CREATION_PREVIEW_NOT_READY");
    return true;
  });
  assert.equal(providerCalls, 7, "not-ready Preview never calls Provider");

  providerReady = true;
  const pageAnswers = [
    { uncertaintyId: "material-disposition", text: "原 Page 保留为来源。" },
    { uncertaintyId: "page-object-relationship", text: "创建受控 Project Page 并连接原 Page。" },
    { uncertaintyId: "outcome", text: "持续形成可核验结果。" },
    { uncertaintyId: "project-boundary", text: "只覆盖托管设备治理。" },
    { uncertaintyId: "completion-evidence", text: "月度记录可追溯。" },
    { uncertaintyId: "internal-closure", text: "每月核验并处理差异。" },
    { uncertaintyId: "current-interface", text: "先看本月待核验设备。" },
  ];
  const readyPageBridge = (async () => {
    for (let index = 0; index < 2; index += 1) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (pending?.kind === "PAGE") assert.equal(pending.depth, 5);
      if (!pending) throw new Error("expected preview-ready Project Creation Page read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  })();
  const readyPagePromise = client.grillProjectCreation({
    sourceKind: "PAGE",
    pageId: "Project Notes",
    answers: pageAnswers,
  });
  const [, readyPage] = await Promise.all([readyPageBridge, readyPagePromise]);
  assert.equal(readyPage.output.readiness, "READY_FOR_PREVIEW");
  assert.equal(readyPage.output.questionGroup, undefined);
  assert.equal(providerCalls, 8);
  providerReady = false;

  const changedPageBlocks = blocks.map((block) => block.uuid === "project-page-child"
    ? { ...block, content: "生成期间修改的 Page 材料", contentHash: checksum("生成期间修改的 Page 材料") }
    : block);
  const changedPageSnapshot = { ...snapshot, blocks: changedPageBlocks, readAt: "2026-07-25T13:01:00.000Z", scopeHash: checksum({ kind: "PAGE", resolved, blocks: changedPageBlocks, truncated: false }) };
  const previewBridge = (async () => {
    for (let index = 0; index < 2; index += 1) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (!pending) throw new Error("expected Project Creation Preview Page read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  })();
  const beforePreview = await client.status();
  const previewPromise = client.previewProjectCreation({ sourceKind: "PAGE", pageId: "Project Notes", answers: pageAnswers });
  const [, preview] = await Promise.all([previewBridge, previewPromise]);
  assert.match(preview.previewHandle, /^grill_preview_[A-Za-z0-9_-]{24,96}$/);
  assert.equal(preview.output.sourceMaterials.length, 2);
  assert.equal(preview.output.pageObjectRelationship.authority, "PROPOSED_FOR_REVIEW");
  assert.deepEqual(preview.output.formalImpact, { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 });
  assert.deepEqual(await client.status(), beforePreview, "Project Creation Preview remains zero-write");

  const pageProposalBridge = (async () => {
    for (let index = 0; index < 2; index += 1) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (!pending) throw new Error("expected Project Creation Proposal Page revalidation");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  })();
  const pageProposalPromise = client.createProjectCreationProposal({ previewHandle: preview.previewHandle });
  const [, pageProposal] = await Promise.all([pageProposalBridge, pageProposalPromise]);
  assert.equal(pageProposal.record.proposal.groups[0]?.risk, "HIGH");
  assert.deepEqual(pageProposal.record.proposal.scope.modify, [{ kind: "PAGE", id: "Project/Project 验收记录", expectedExistence: "ABSENT" }]);
  assert.equal(pageProposal.record.proposal.groups[0]?.semanticOperations[0]?.payload.relationshipMode, "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE");
  assert.equal((await client.status()).objectCount, beforePreview.objectCount, "Project Creation Proposal persists review authority but creates no Project");

  const staleProposalBridge = (async () => {
    const pending = await client.claimGraphReadRequest();
    assert.equal(pending?.kind, "PAGE");
    if (!pending) throw new Error("expected stale Project Creation Proposal Page read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: changedPageSnapshot });
  })();
  const staleProposalPromise = client.createProjectCreationProposal({ previewHandle: preview.previewHandle });
  await staleProposalBridge;
  await assert.rejects(staleProposalPromise, (error: unknown) => {
    assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "GRILL_SOURCE_STALE");
    return true;
  });

  providerRelationshipMode = "REUSE_SOURCE_PAGE";
  const reusePreviewBridge = (async () => {
    for (let index = 0; index < 2; index += 1) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (!pending) throw new Error("expected existing Page upgrade Preview read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  })();
  const reusePreviewPromise = client.previewProjectCreation({ sourceKind: "PAGE", pageId: "Project Notes", answers: pageAnswers });
  const [, reusePreview] = await Promise.all([reusePreviewBridge, reusePreviewPromise]);
  assert.equal(reusePreview.output.pageObjectRelationship.mode, "REUSE_SOURCE_PAGE");
  const reuseProposalBridge = (async () => {
    for (let index = 0; index < 2; index += 1) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (!pending) throw new Error("expected existing Page upgrade Proposal revalidation");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  })();
  const reuseProposalPromise = client.createProjectCreationProposal({ previewHandle: reusePreview.previewHandle });
  const [, reuseProposal] = await Promise.all([reuseProposalBridge, reuseProposalPromise]);
  assert.deepEqual(reuseProposal.record.proposal.scope.modify, [{ kind: "PAGE", id: "project-page", expectedExistence: "PRESENT", version: 2, hash: checksum("project-page") }]);
  assert.equal(reuseProposal.record.proposal.groups[0]?.semanticOperations[0]?.payload.relationshipMode, "REUSE_SOURCE_PAGE");
  providerRelationshipMode = "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE";

  const stalePreviewBridge = (async () => {
    for (const next of [snapshot, changedPageSnapshot]) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (!pending) throw new Error("expected stale Project Creation Preview Page read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: next });
    }
  })();
  const stalePreviewPromise = client.previewProjectCreation({ sourceKind: "PAGE", pageId: "Project Notes", answers: pageAnswers });
  await stalePreviewBridge;
  await assert.rejects(stalePreviewPromise, (error: unknown) => {
    assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "GRILL_SOURCE_STALE");
    return true;
  });
  assert.deepEqual(await client.status(), beforePreview, "stale Project Creation Preview remains zero-write and issues no usable result");

  const stalePageBridge = (async () => {
    for (const next of [snapshot, changedPageSnapshot]) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "PAGE");
      if (pending?.kind === "PAGE") assert.equal(pending.depth, 5);
      if (!pending) throw new Error("expected stale Project Creation Page read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: next });
    }
  })();
  const beforeStalePage = await client.status();
  const stalePagePromise = client.grillProjectCreation({ sourceKind: "PAGE", pageId: "Project Notes", answers: [] });
  await stalePageBridge;
  await assert.rejects(stalePagePromise, (error: unknown) => {
    assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "GRILL_SOURCE_STALE");
    return true;
  });
  assert.deepEqual(await client.status(), beforeStalePage, "stale Page generation remains zero-write");

  const created = await client.materializeExplicitObject({
    objectType: "MINI_PROJECT",
    text: "整理托管设备记录",
    externalId: "mini-evolution-root",
    inputVersion: "1",
    contentHash: checksum("[MiniProject] 整理托管设备记录"),
    idempotencyKey: "project-creation-mini-source",
    traceId: "project-creation-mini-source",
  });
  const miniResolved = { kind: "BLOCK" as const, id: "mini-evolution-root" };
  const miniBlocks = [
    { uuid: "mini-evolution-root", content: "[MiniProject] 整理托管设备记录", contentHash: checksum("[MiniProject] 整理托管设备记录"), relation: "ROOT" as const, depth: 0 },
    { uuid: "mini-evolution-child", content: "每月需要持续核验", contentHash: checksum("每月需要持续核验"), relation: "CHILD" as const, depth: 1, parentUuid: "mini-evolution-root" },
    { uuid: "mini-evolution-empty", content: "", contentHash: checksum(""), relation: "CHILD" as const, depth: 1, parentUuid: "mini-evolution-root" },
  ];
  const miniSnapshot = { kind: "BLOCK" as const, requestedTarget: "mini-evolution-root", resolved: miniResolved, blocks: miniBlocks, truncated: false, readAt: "2026-07-25T13:05:00.000Z", scopeHash: checksum({ kind: "BLOCK", resolved: miniResolved, blocks: miniBlocks, truncated: false }) };
  const answerMiniReads = async (second = miniSnapshot): Promise<void> => {
    for (const snapshot of [miniSnapshot, second]) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "BLOCK");
      if (!pending) throw new Error("expected Project Creation MiniProject read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  };
  const beforeMiniGrill = await client.status();
  providerSource = "MINI_PROJECT";
  const miniBridge = answerMiniReads();
  const miniPromise = client.grillProjectCreation({ sourceKind: "MINI_PROJECT", objectId: created.object.objectId, expectedVersion: created.object.version, answers: [] });
  const [, miniResult] = await Promise.all([miniBridge, miniPromise]);
  assert.equal(miniResult.output.questionGroup?.focusUncertaintyId, "project-boundary");
  assert.deepEqual(await client.status(), beforeMiniGrill, "MiniProject evolution Grill does not create a Project or mutate its source");

  const miniAnswers = [
    { uncertaintyId: "project-boundary", text: "升级为持续治理托管设备的 Project。" },
    { uncertaintyId: "page-object-relationship", text: "保留 MiniProject 原文并创建独立 Project Page。" },
    { uncertaintyId: "current-interface", text: "先看本月待核验设备。" },
    { uncertaintyId: "internal-closure", text: "每月核验并处理差异。" },
    { uncertaintyId: "outcome", text: "持续形成可核验结果。" },
    { uncertaintyId: "completion-evidence", text: "月度记录可追溯。" },
    { uncertaintyId: "material-disposition", text: "原材料保留在原位并作为来源连接。" },
  ];
  providerReady = true;
  const miniPreviewBridge = answerMiniReads();
  const miniPreviewPromise = client.previewProjectCreation({
    sourceKind: "MINI_PROJECT",
    objectId: created.object.objectId,
    expectedVersion: created.object.version,
    answers: miniAnswers,
  });
  const [, miniPreview] = await Promise.all([miniPreviewBridge, miniPreviewPromise]);
  assert.equal(miniPreview.output.pageObjectRelationship.mode, "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE");
  const miniProposalBridge = answerMiniReads();
  const miniProposalPromise = client.createProjectCreationProposal({ previewHandle: miniPreview.previewHandle });
  const [, miniProposal] = await Promise.all([miniProposalBridge, miniProposalPromise]);
  assert.equal(miniProposal.record.proposal.groups[0]?.risk, "HIGH");
  assert.equal(miniProposal.record.proposal.groups[0]?.semanticOperations[0]?.payload.sourceKind, "MINI_PROJECT");
  assert.equal((await client.status()).objectCount, beforeMiniGrill.objectCount, "MiniProject Project Proposal remains zero formal Project write");

  const miniAccepted = await client.reviewProposal(miniProposal.record.proposal.proposalId, {
    "create-project": { disposition: "ACCEPTED", highImpactConfirmed: true },
  }, miniProposal.record.updatedAt);
  const miniCommitBridge = (async () => {
    const sourceRead = await client.claimGraphReadRequest();
    assert.equal(sourceRead?.kind, "BLOCK");
    if (!sourceRead) throw new Error("expected MiniProject source revalidation before Project creation");
    await client.completeGraphReadRequest({ requestId: sourceRead.requestId, status: "FOUND", snapshot: miniSnapshot });
    const targetRead = await client.claimGraphReadRequest();
    assert.equal(targetRead?.kind, "PAGE");
    if (!targetRead) throw new Error("expected dedicated Project Page absence read");
    await client.completeGraphReadRequest({ requestId: targetRead.requestId, status: "NOT_FOUND" });
  })();
  const miniPreparePromise = client.prepareProposalProjectCreation(miniProposal.record.proposal.proposalId, {
    confirmation: "CREATE_PROJECT",
    expectedUpdatedAt: miniAccepted.updatedAt,
    traceId: "mini-project-evolution-prepare",
  });
  const [, miniPrepared] = await Promise.all([miniCommitBridge, miniPreparePromise]);
  assert.equal(miniPrepared.status, "PREPARED");
  if (miniPrepared.status !== "PREPARED") throw new Error("expected prepared MiniProject evolution");
  const miniProjectPageExternalId = "mini-evolution-project-page";
  const miniProjectPageHash = checksum({
    pageName: miniPrepared.pageName,
    pageExternalId: miniProjectPageExternalId,
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": miniPrepared.objectId,
      "task-copilot-semantic-commit-id": miniPrepared.semanticCommitId,
    },
    emptyAtCreation: true,
  });
  const miniFinalized = await client.finalizeProposalProjectCreation(miniProposal.record.proposal.proposalId, {
    expectedUpdatedAt: miniAccepted.updatedAt,
    semanticCommitId: miniPrepared.semanticCommitId,
    objectId: miniPrepared.objectId,
    pageExternalId: miniProjectPageExternalId,
    pageContentHash: miniProjectPageHash,
    traceId: "mini-project-evolution-finalize",
  });
  assert.equal(miniFinalized.status, "COMPLETED");
  const miniUndoPreflight = await client.prepareProposalProjectCreationUndo(miniPrepared.semanticCommitId, {
    traceId: "mini-project-evolution-undo-preflight",
  });
  assert.equal(miniUndoPreflight.status, "PAGE_PREFLIGHT_REQUIRED");
  assert.deepEqual(miniUndoPreflight.sourceReturnTarget, { kind: "BLOCK", externalId: "mini-evolution-root" });
  const miniUndoPrepared = await client.prepareProposalProjectCreationUndo(miniPrepared.semanticCommitId, {
    traceId: "mini-project-evolution-undo-prepare",
    confirmedOwnedEmpty: true,
    pageExternalId: miniProjectPageExternalId,
  });
  assert.equal(miniUndoPrepared.status, "PAGE_DELETION_REQUIRED");
  if (miniUndoPrepared.status !== "PAGE_DELETION_REQUIRED") throw new Error("expected MiniProject Project Page deletion");
  assert.deepEqual(miniUndoPrepared.sourceReturnTarget, { kind: "BLOCK", externalId: "mini-evolution-root" });
  const miniUndoFinalized = await client.finalizeProposalProjectCreationUndo(miniPrepared.semanticCommitId, {
    originalSemanticCommitId: miniPrepared.semanticCommitId,
    undoSemanticCommitId: miniUndoPrepared.undoSemanticCommitId,
    pageExternalId: miniProjectPageExternalId,
    pageExists: false,
    traceId: "mini-project-evolution-undo-finalize",
  });
  assert.deepEqual(miniUndoFinalized.sourceReturnTarget, { kind: "BLOCK", externalId: "mini-evolution-root" });
  assert.equal((await client.status()).objectCount, beforeMiniGrill.objectCount, "MiniProject source remains after Project creation Undo");

  providerRelationshipMode = "REUSE_SOURCE_PAGE";
  const invalidMiniPreviewBridge = (async () => {
    const pending = await client.claimGraphReadRequest();
    assert.equal(pending?.kind, "BLOCK");
    if (!pending) throw new Error("expected invalid MiniProject Preview source read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: miniSnapshot });
  })();
  const invalidMiniPreviewPromise = client.previewProjectCreation({
    sourceKind: "MINI_PROJECT",
    objectId: created.object.objectId,
    expectedVersion: created.object.version,
    answers: miniAnswers,
  });
  await Promise.all([
    invalidMiniPreviewBridge,
    assert.rejects(invalidMiniPreviewPromise, (error: unknown) => {
      assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "PROJECT_CREATION_PREVIEW_VALIDATION_FAILED");
      return true;
    }),
  ]);
  providerRelationshipMode = "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE";
  providerReady = false;

  const changedMiniBlocks = miniBlocks.map((block) => block.uuid === "mini-evolution-child" ? { ...block, content: "用户在生成期间修改", contentHash: checksum("用户在生成期间修改") } : block);
  const changedMiniSnapshot = { ...miniSnapshot, blocks: changedMiniBlocks, readAt: "2026-07-25T13:06:00.000Z", scopeHash: checksum({ kind: "BLOCK", resolved: miniResolved, blocks: changedMiniBlocks, truncated: false }) };
  const staleBridge = answerMiniReads(changedMiniSnapshot);
  const stalePromise = client.grillProjectCreation({ sourceKind: "MINI_PROJECT", objectId: created.object.objectId, expectedVersion: created.object.version, answers: [] });
  await staleBridge;
  await assert.rejects(stalePromise, (error: unknown) => {
    assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "GRILL_SOURCE_STALE");
    return true;
  });
  assert.deepEqual(await client.status(), beforeMiniGrill, "stale MiniProject generation remains zero-write");

  providerReady = true;
  const graphStaleMiniPreviewBridge = answerMiniReads();
  const graphStaleMiniPreviewPromise = client.previewProjectCreation({
    sourceKind: "MINI_PROJECT",
    objectId: created.object.objectId,
    expectedVersion: created.object.version,
    answers: miniAnswers,
  });
  const [, graphStaleMiniPreview] = await Promise.all([graphStaleMiniPreviewBridge, graphStaleMiniPreviewPromise]);
  const graphStaleMiniProposalBridge = (async () => {
    const pending = await client.claimGraphReadRequest();
    assert.equal(pending?.kind, "BLOCK");
    if (!pending) throw new Error("expected stale MiniProject Proposal source read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: changedMiniSnapshot });
  })();
  const graphStaleMiniProposalPromise = client.createProjectCreationProposal({ previewHandle: graphStaleMiniPreview.previewHandle });
  await graphStaleMiniProposalBridge;
  await assert.rejects(graphStaleMiniProposalPromise, (error: unknown) => {
    assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "GRILL_SOURCE_STALE");
    return true;
  });

  const objectStaleMiniPreviewBridge = answerMiniReads();
  const objectStaleMiniPreviewPromise = client.previewProjectCreation({
    sourceKind: "MINI_PROJECT",
    objectId: created.object.objectId,
    expectedVersion: created.object.version,
    answers: miniAnswers,
  });
  const [, objectStaleMiniPreview] = await Promise.all([objectStaleMiniPreviewBridge, objectStaleMiniPreviewPromise]);
  await client.changeCondition(created.object.objectId, created.object.version, { kind: "PAUSED", reason: "验证 Preview 后正式对象变化" });
  await assert.rejects(
    () => client.createProjectCreationProposal({ previewHandle: objectStaleMiniPreview.previewHandle }),
    (error: unknown) => {
      assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "V2_OBJECT_VERSION_CONFLICT");
      return true;
    },
  );

  const injected = await fetch(new URL("provider/grill/project-creation/turn", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ sourceKind: "BLANK", answers: [], materials: [{ text: "client-owned material" }] }),
  });
  assert.equal(injected.status, 400);
  assert.equal((await injected.json() as { error: { code: string } }).error.code, "PROJECT_CREATION_GRILL_REQUEST_INVALID");
  assert.equal(providerCalls, 18);
});

test("accepted Project Creation Proposal prepares, creates one controlled Page binding, and atomically materializes the reviewed Project", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-creation-commit-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-creation-commit",
    token: "project-creation-commit-token-at-least-24-chars",
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const proposal = buildProjectCreationProposal({
    proposalId: "proposal_project_creation_commit",
    preview: blankProjectCreationPreview(),
    source: { sourceKind: "BLANK" },
    sourceFingerprint: "a".repeat(64),
  });
  const submitted = await client.submitProposal(proposal);
  const accepted = await client.reviewProposal(proposal.proposalId, {
    "create-project": { disposition: "ACCEPTED", highImpactConfirmed: true },
  }, submitted.record.updatedAt);

  const missingConfirmation = await fetch(new URL(`proposals/${proposal.proposalId}/project-creation/commit/prepare`, service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ confirmation: "CREATE", expectedUpdatedAt: accepted.updatedAt, traceId: "project-create-invalid" }),
  });
  assert.equal(missingConfirmation.status, 400);
  assert.equal((await missingConfirmation.json() as { error: { code: string } }).error.code, "V2_PROJECT_CREATION_COMMIT_REQUEST_INVALID");

  const absenceBridge = (async () => {
    const pending = await client.claimGraphReadRequest();
    assert.equal(pending?.kind, "PAGE");
    assert.equal(pending?.target, "Project/设备治理");
    if (!pending) throw new Error("expected Project target absence read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "NOT_FOUND" });
  })();
  const preparePromise = client.prepareProposalProjectCreation(proposal.proposalId, {
    confirmation: "CREATE_PROJECT",
    expectedUpdatedAt: accepted.updatedAt,
    traceId: "project-create-prepare",
  });
  const [, prepared] = await Promise.all([absenceBridge, preparePromise]);
  assert.equal(prepared.status, "PREPARED");
  if (prepared.status !== "PREPARED") throw new Error("expected prepared Project creation");
  assert.equal(prepared.pageName, "Project/设备治理");
  assert.equal(prepared.relationshipMode, "CREATE_DEDICATED_PROJECT_PAGE");
  assert.equal((await client.status()).objectCount, 0);

  await assert.rejects(
    () => client.finalizeProposalProjectCreation(proposal.proposalId, {
      expectedUpdatedAt: accepted.updatedAt,
      semanticCommitId: prepared.semanticCommitId,
      objectId: prepared.objectId,
      pageExternalId: "page-device-project",
      pageContentHash: checksum("unowned page"),
      traceId: "project-create-unowned",
    }),
    (error: unknown) => {
      assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "V2_PROJECT_CREATION_COMMIT_GRAPH_EVIDENCE_MISMATCH");
      return true;
    },
  );
  assert.equal((await client.status()).objectCount, 0, "invalid controlled Page evidence leaves SQLite unchanged");

  const pageExternalId = "page-device-project";
  const pageContentHash = checksum({
    pageName: prepared.pageName,
    pageExternalId,
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": prepared.objectId,
      "task-copilot-semantic-commit-id": prepared.semanticCommitId,
    },
    emptyAtCreation: true,
  });
  const finalized = await client.finalizeProposalProjectCreation(proposal.proposalId, {
    expectedUpdatedAt: accepted.updatedAt,
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    pageExternalId,
    pageContentHash,
    traceId: "project-create-finalize",
  });
  assert.equal(finalized.status, "COMPLETED");
  assert.equal(finalized.object.objectType, "PROJECT");
  assert.equal(finalized.object.text, "设备治理");
  assert.equal(finalized.object.projectStructure?.currentSummary, "每月处理核验差异。");
  assert.equal(finalized.anchor.externalId, pageExternalId);
  assert.equal(finalized.record.proposal.status, "APPLIED");
  assert.equal((await client.status()).objectCount, 1);

  const replay = await client.finalizeProposalProjectCreation(proposal.proposalId, {
    expectedUpdatedAt: accepted.updatedAt,
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    pageExternalId,
    pageContentHash,
    traceId: "project-create-finalize-replay",
  });
  assert.equal(replay.status, "COMPLETED");
  if (replay.status !== "COMPLETED") throw new Error("expected completed Project creation replay");
  assert.equal(replay.replayed, true);
  assert.equal(replay.object.objectId, finalized.object.objectId);
  const completedPrepare = await client.prepareProposalProjectCreation(proposal.proposalId, {
    confirmation: "CREATE_PROJECT",
    expectedUpdatedAt: accepted.updatedAt,
    traceId: "project-create-prepare-replay",
  });
  assert.equal(completedPrepare.status, "COMPLETED");

  const undoPreflight = await client.prepareProposalProjectCreationUndo(prepared.semanticCommitId, { traceId: "project-create-undo-preflight" });
  assert.equal(undoPreflight.status, "PAGE_PREFLIGHT_REQUIRED");
  assert.equal((await client.status()).objectCount, 1, "Page preflight never removes the formal Project");
  const undoPrepared = await client.prepareProposalProjectCreationUndo(prepared.semanticCommitId, {
    traceId: "project-create-undo-prepare",
    confirmedOwnedEmpty: true,
    pageExternalId,
  });
  assert.equal(undoPrepared.status, "PAGE_DELETION_REQUIRED");
  if (undoPrepared.status !== "PAGE_DELETION_REQUIRED") throw new Error("expected dedicated Project Page deletion");
  assert.equal((await client.status()).objectCount, 0, "domain Project and Anchor are removed before the exact owned empty Page");
  const undoFinalized = await client.finalizeProposalProjectCreationUndo(prepared.semanticCommitId, {
    originalSemanticCommitId: prepared.semanticCommitId,
    undoSemanticCommitId: undoPrepared.undoSemanticCommitId,
    pageExternalId,
    pageExists: false,
    traceId: "project-create-undo-finalize",
  });
  assert.equal(undoFinalized.status, "COMPLETED");
  assert.equal(undoFinalized.pagePreserved, false);
  const undoReplay = await client.prepareProposalProjectCreationUndo(prepared.semanticCommitId, { traceId: "project-create-undo-replay" });
  assert.equal(undoReplay.status, "COMPLETED");
});

test("failed Project Creation Proposal domain write requires exact Page compensation and terminalizes the Proposal", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-creation-recovery-"));
  let failDomain = true;
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-creation-recovery",
    token: "project-creation-recovery-token-at-least-24-chars",
    faults: { beforeProposalProjectCreationDomainWrite: () => { if (failDomain) throw new Error("injected Project domain failure"); } },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const proposal = buildProjectCreationProposal({
    proposalId: "proposal_project_creation_recovery",
    preview: blankProjectCreationPreview(),
    source: { sourceKind: "BLANK" },
    sourceFingerprint: "b".repeat(64),
  });
  const submitted = await client.submitProposal(proposal);
  const accepted = await client.reviewProposal(proposal.proposalId, {
    "create-project": { disposition: "ACCEPTED", highImpactConfirmed: true },
  }, submitted.record.updatedAt);
  const absenceBridge = (async () => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected Project target absence read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "NOT_FOUND" });
  })();
  const preparePromise = client.prepareProposalProjectCreation(proposal.proposalId, {
    confirmation: "CREATE_PROJECT",
    expectedUpdatedAt: accepted.updatedAt,
    traceId: "project-create-recovery-prepare",
  });
  const [, prepared] = await Promise.all([absenceBridge, preparePromise]);
  if (prepared.status !== "PREPARED") throw new Error("expected prepared Project creation");
  const pageExternalId = "page-project-recovery";
  const pageContentHash = checksum({
    pageName: prepared.pageName,
    pageExternalId,
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": prepared.objectId,
      "task-copilot-semantic-commit-id": prepared.semanticCommitId,
    },
    emptyAtCreation: true,
  });
  const failed = await client.finalizeProposalProjectCreation(proposal.proposalId, {
    expectedUpdatedAt: accepted.updatedAt,
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    pageExternalId,
    pageContentHash,
    traceId: "project-create-recovery-finalize",
  });
  assert.equal(failed.status, "COMPENSATION_REQUIRED");
  assert.equal((await client.status()).objectCount, 0);
  const recovered = await client.prepareProposalProjectCreation(proposal.proposalId, {
    confirmation: "CREATE_PROJECT",
    expectedUpdatedAt: accepted.updatedAt,
    traceId: "project-create-recovery-resume",
  });
  assert.equal(recovered.status, "RECOVERY_REQUIRED");
  if (recovered.status !== "RECOVERY_REQUIRED") throw new Error("expected restart-safe Project creation recovery");
  assert.equal(recovered.pageExternalId, pageExternalId);
  assert.equal(recovered.pageContentHash, pageContentHash);
  await assert.rejects(
    () => client.compensateProposalProjectCreation(proposal.proposalId, {
      expectedUpdatedAt: accepted.updatedAt,
      semanticCommitId: prepared.semanticCommitId,
      pageExternalId,
      pageContentHash,
      pageExists: true,
      traceId: "project-create-invalid-compensation",
    }),
    (error: unknown) => {
      assert.equal((error as { details?: { remoteCode?: string } }).details?.remoteCode, "V2_PROJECT_CREATION_COMPENSATION_EVIDENCE_MISMATCH");
      return true;
    },
  );
  failDomain = false;
  const compensated = await client.compensateProposalProjectCreation(proposal.proposalId, {
    expectedUpdatedAt: accepted.updatedAt,
    semanticCommitId: prepared.semanticCommitId,
    pageExternalId,
    pageContentHash,
    pageExists: false,
    traceId: "project-create-compensated",
  });
  assert.equal(compensated.status, "FAILED_COMPENSATED");
  assert.equal(compensated.record.proposal.status, "FAILED");
});

test("MiniProject Grill reads the exact live subtree, advances by bounded answers, and remains zero-write", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-mini-grill-"));
  let providerCalls = 0;
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (input) => {
      providerCalls += 1;
      if (input.system.startsWith("Return exactly one task-copilot-grill-preview-v1")) {
        const claim = (text: string, evidenceRefs: string[]) => ({ text, evidenceRefs });
        return {
          value: {
            schemaVersion: "task-copilot-grill-preview-v1",
            title: claim("整理托管设备记录", ["block:block-mini-grill"]),
            outcome: claim("形成可复核的托管设备记录。", ["block:block-mini-loose"]),
            boundary: { included: [claim("当前设备清单", ["block:block-mini-loose"])], excluded: [] },
            completionEvidence: [claim("厂家参数已经归入设备记录", ["block:block-mini-loose"])],
            sections: [
              { sectionId: "root", heading: "入口", purpose: "保留原始入口", sourceMaterialIds: ["root"], derivedBlocks: [] },
              { sectionId: "work", heading: "设备材料", purpose: "集中原始材料", sourceMaterialIds: ["material-2"], derivedBlocks: [] },
            ],
            unclassified: [],
          },
          metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
        };
      }
      const focus = providerCalls === 2 ? "outcome" : "boundary";
      return {
        value: {
          schemaVersion: "task-copilot-grill-turn-v1",
          understanding: providerCalls === 1 ? "设备材料已存在，但边界尚未确认。" : "边界已封顶，预期成果仍待确认。",
          factRefs: ["subject"],
          inferences: [],
          unknowns: [{ uncertaintyId: focus, text: focus === "boundary" ? "是否纳入后续新增设备仍未知。" : "最终要形成什么可用结果仍未知。" }],
          readiness: "CONTINUE",
          focusUncertaintyId: focus,
          questions: [{ uncertaintyId: focus, text: focus === "boundary" ? "本次是否只覆盖当前清单？" : "完成后需要形成怎样的设备记录？" }],
          recommendation: { text: "建议先解决当前最大不确定性。", evidenceRefs: ["object:mini-grill@v1"], tradeoffs: ["边界更清楚，但其他问题留到下一轮"] },
        },
        metadata: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
      };
    },
  };
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-mini-grill",
    token: "mini-grill-token-at-least-24-chars",
    grillTurnGenerator: new LocalLlmGrillTurnGenerator(provider),
    grillPreviewGenerator: new LocalLlmGrillPreviewGenerator(provider),
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const created = await client.materializeExplicitObject({
    objectType: "MINI_PROJECT",
    text: "整理托管设备记录",
    externalId: "block-mini-grill",
    inputVersion: "1",
    contentHash: checksum("[MiniProject] 整理托管设备记录"),
    idempotencyKey: "mini-grill-create",
    traceId: "mini-grill-create",
  });
  assert.equal(created.object.objectId.startsWith("obj_"), true);
  const subjectRef = `object:${created.object.objectId}@v${created.object.version}`;
  const originalProvider = provider.completeStructured;
  provider.completeStructured = async (input) => {
    const completion = await originalProvider(input);
    const value = completion.value as Record<string, unknown>;
    const recommendation = value.recommendation as Record<string, unknown> | undefined;
    if (recommendation) recommendation.evidenceRefs = [subjectRef];
    return completion;
  };
  const resolved = { kind: "BLOCK" as const, id: "block-mini-grill" };
  const blocks = [
    { uuid: "block-mini-grill", content: "[MiniProject] 整理托管设备记录", contentHash: checksum("[MiniProject] 整理托管设备记录"), relation: "ROOT" as const, depth: 0 },
    { uuid: "block-mini-loose", content: "厂家参数待归类", contentHash: checksum("厂家参数待归类"), relation: "CHILD" as const, depth: 1, parentUuid: "block-mini-grill" },
  ];
  const snapshot = {
    kind: "BLOCK" as const,
    requestedTarget: "block-mini-grill",
    resolved,
    blocks,
    truncated: false,
    readAt: "2026-07-24T14:00:00.000Z",
    scopeHash: checksum({ kind: "BLOCK", resolved, blocks, truncated: false }),
  };
  const answerTwoReads = async (): Promise<void> => {
    for (let index = 0; index < 2; index += 1) {
      const pending = await client.claimGraphReadRequest();
      assert.equal(pending?.kind, "BLOCK");
      if (!pending) throw new Error("expected MiniProject Grill Graph read");
      await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
    }
  };
  const before = await client.status();
  const firstBridge = answerTwoReads();
  const firstPromise = client.grillMiniProject({ objectId: created.object.objectId, expectedVersion: created.object.version, answers: [] });
  const [, first] = await Promise.all([firstBridge, firstPromise]);
  assert.equal(first.output.questionGroup?.focusUncertaintyId, "boundary");
  assert.equal(first.output.authorityBoundary, "SESSION_DRAFT_ONLY");

  const secondBridge = answerTwoReads();
  const secondPromise = client.grillMiniProject({ objectId: created.object.objectId, expectedVersion: created.object.version, answers: [{ uncertaintyId: "boundary", text: "本次只覆盖当前设备清单。" }] });
  const [, second] = await Promise.all([secondBridge, secondPromise]);
  assert.equal(second.output.questionGroup?.focusUncertaintyId, "outcome");
  assert.equal(providerCalls, 2);
  assert.deepEqual(await client.status(), before, "Grill turns do not mutate formal state");

  const previewBridge = answerTwoReads();
  const previewPromise = client.previewMiniProjectGrill({ objectId: created.object.objectId, expectedVersion: created.object.version, answers: [
    { uncertaintyId: "boundary", text: "本次只覆盖当前设备清单。" },
    { uncertaintyId: "outcome", text: "形成可复核的托管设备记录。" },
    { uncertaintyId: "completion-evidence", text: "厂家参数已经归入设备记录。" },
    { uncertaintyId: "material-disposition", text: "厂家参数归入设备材料。" },
  ] });
  const [, preview] = await Promise.all([previewBridge, previewPromise]);
  assert.equal(preview.output.authorityBoundary, "SESSION_PREVIEW_ONLY");
  assert.equal(preview.output.impact.deletedMaterialCount, 0);
  assert.equal(preview.output.impact.sourceMaterialCount, 2);
  assert.equal(providerCalls, 3);
  assert.deepEqual(await client.status(), before, "Grill preview does not mutate formal state");

  const proposalBridge = answerTwoReads();
  const proposalPromise = client.createMiniProjectRestructureProposal({ objectId: created.object.objectId, expectedVersion: created.object.version, previewHandle: preview.previewHandle });
  const [, restructure] = await Promise.all([proposalBridge, proposalPromise]);
  assert.equal(restructure.record.proposal.status, "READY");
  assert.equal(restructure.record.proposal.groups[0]?.risk, "HIGH");
  assert.deepEqual(restructure.record.proposal.groups[0]?.textPatches, []);
  assert.deepEqual(restructure.record.proposal.groups[0]?.semanticOperations.map(({ kind }) => kind), ["CREATE_BLOCK", "MOVE_BLOCK"]);
  assert.equal(providerCalls, 3, "Proposal is built from the server-owned preview without another Provider call");
  assert.deepEqual(await client.status(), before, "creating a review Proposal does not mutate formal object state");

  const changedBlocks = blocks.map((block) => block.uuid === "block-mini-loose" ? { ...block, content: "厂家参数已变化", contentHash: checksum("厂家参数已变化") } : block);
  const changedSnapshot = { ...snapshot, blocks: changedBlocks, scopeHash: checksum({ kind: "BLOCK", resolved, blocks: changedBlocks, truncated: false }) };
  const staleBridge = (async (): Promise<void> => {
    const firstRead = await client.claimGraphReadRequest();
    if (!firstRead) throw new Error("expected initial stale-check read");
    await client.completeGraphReadRequest({ requestId: firstRead.requestId, status: "FOUND", snapshot });
    const secondRead = await client.claimGraphReadRequest();
    if (!secondRead) throw new Error("expected refreshed stale-check read");
    await client.completeGraphReadRequest({ requestId: secondRead.requestId, status: "FOUND", snapshot: changedSnapshot });
  })();
  await assert.rejects(
    () => client.grillMiniProject({ objectId: created.object.objectId, expectedVersion: created.object.version, answers: [] }),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "GRILL_SOURCE_STALE",
  );
  await staleBridge;
  assert.equal(providerCalls, 4, "changed source is detected after generation and the draft is discarded");

  await assert.rejects(
    () => client.grillMiniProject({ objectId: created.object.objectId, expectedVersion: created.object.version, answers: [{ uncertaintyId: "title", text: "固定表单字段" }] }),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "GRILL_REQUEST_INVALID",
  );
  assert.equal(providerCalls, 4, "invalid client-owned uncertainty fails before Graph read and Provider");

  const accepted = await client.reviewProposal(restructure.record.proposal.proposalId, { "restructure-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, restructure.record.updatedAt);
  const stalePrepareBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected stale MiniProject restructure prepare Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: changedSnapshot });
  })();
  await assert.rejects(
    () => client.prepareMiniProjectRestructure(accepted.proposal.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "mini-restructure-stale" }),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_MINI_PROJECT_RESTRUCTURE_SOURCE_STALE",
  );
  await stalePrepareBridge;
  assert.equal((await client.listSemanticCommits()).length, 0, "stale subtree creates no structural ledger");
  const prepareBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    assert.equal(pending?.kind, "BLOCK");
    if (!pending) throw new Error("expected MiniProject restructure prepare Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
  })();
  const preparePromise = client.prepareMiniProjectRestructure(accepted.proposal.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "mini-restructure-prepare" });
  const [, preparedCommit] = await Promise.all([prepareBridge, preparePromise]);
  assert.equal(preparedCommit.status, "PREPARED");
  if (preparedCommit.status !== "PREPARED") throw new Error("expected prepared MiniProject structure commit");
  assert.equal(preparedCommit.formalGraphWritesExecuted, false);
  assert.deepEqual(preparedCommit.plan.steps.map(({ kind }) => kind), ["CREATE_BLOCK", "MOVE_BLOCK"]);
  assert.deepEqual(preparedCommit.plan.compensationSteps.map(({ kind }) => kind), ["MOVE_BLOCK", "REMOVE_CREATED_BLOCK"]);
  assert.equal((await client.getObject(created.object.objectId))?.version, created.object.version, "prepare does not mutate the formal MiniProject object");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === preparedCommit.semanticCommitId)?.status, "PENDING");
  const replay = await client.prepareMiniProjectRestructure(accepted.proposal.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "mini-restructure-prepare-replay" });
  assert.equal(replay.status, "PREPARED");
  assert.equal(replay.status === "PREPARED" && replay.replayed, true, "replay reuses the ledger without another Graph read");
  const [createStep, moveStep] = preparedCommit.plan.steps;
  if (createStep?.kind !== "CREATE_BLOCK" || moveStep?.kind !== "MOVE_BLOCK") throw new Error("expected create then move structure plan");
  const snapshotAfterCreateBlocks = [
    blocks[0]!,
    { uuid: createStep.blockUuid, content: createStep.text, contentHash: createStep.contentHash, relation: "CHILD" as const, depth: 1, parentUuid: createStep.parentBlockUuid },
    blocks[1]!,
  ];
  const snapshotAfterCreate = { ...snapshot, blocks: snapshotAfterCreateBlocks, scopeHash: checksum({ kind: "BLOCK", resolved, blocks: snapshotAfterCreateBlocks, truncated: false }) };
  const verifyCreateBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected create verification Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: snapshotAfterCreate });
  })();
  const verifyCreatePromise = client.verifyMiniProjectRestructureStep(accepted.proposal.proposalId, 0, { semanticCommitId: preparedCommit.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "mini-restructure-verify-create" });
  const [, createVerified] = await Promise.all([verifyCreateBridge, verifyCreatePromise]);
  assert.equal(createVerified.status, "VERIFIED");
  assert.equal(createVerified.status === "VERIFIED" && createVerified.nextStepIndex, 1);

  const finalBlocks = [
    blocks[0]!,
    { uuid: createStep.blockUuid, content: createStep.text, contentHash: createStep.contentHash, relation: "CHILD" as const, depth: 1, parentUuid: createStep.parentBlockUuid },
    { ...blocks[1]!, depth: 2, parentUuid: moveStep.toParentBlockUuid },
  ];
  const finalSnapshot = { ...snapshot, blocks: finalBlocks, scopeHash: checksum({ kind: "BLOCK", resolved, blocks: finalBlocks, truncated: false }) };
  const verifyMoveBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected move verification Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: finalSnapshot });
  })();
  const verifyMovePromise = client.verifyMiniProjectRestructureStep(accepted.proposal.proposalId, 1, { semanticCommitId: preparedCommit.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "mini-restructure-verify-move" });
  const [, completedRestructure] = await Promise.all([verifyMoveBridge, verifyMovePromise]);
  assert.equal(completedRestructure.status, "COMPLETED");
  assert.equal(completedRestructure.status === "COMPLETED" && completedRestructure.record.proposal.status, "APPLIED");
  assert.equal((await client.getObject(created.object.objectId))?.version, created.object.version, "Graph-only restructure preserves the formal MiniProject version and root authority");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === preparedCommit.semanticCommitId)?.status, "COMPLETED");
  const completedReplay = await client.verifyMiniProjectRestructureStep(accepted.proposal.proposalId, 1, { semanticCommitId: preparedCommit.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "mini-restructure-completed-replay" });
  assert.equal(completedReplay.status === "COMPLETED" && completedReplay.replayed, true);
  const completedPrepareReplay = await client.prepareMiniProjectRestructure(accepted.proposal.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "mini-restructure-completed-prepare-replay" });
  assert.equal(completedPrepareReplay.status === "COMPLETED" && completedPrepareReplay.replayed, true, "reload reuses the completed structural ledger without another Graph read");

  const changedAfterCommitBlocks = [...finalBlocks, { uuid: "later-user-block", content: "用户后续新增", contentHash: checksum("用户后续新增"), relation: "CHILD" as const, depth: 1, parentUuid: "block-mini-grill" }];
  const changedAfterCommitSnapshot = { ...snapshot, blocks: changedAfterCommitBlocks, scopeHash: checksum({ kind: "BLOCK", resolved, blocks: changedAfterCommitBlocks, truncated: false }) };
  const staleUndoBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected changed structure Undo Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: changedAfterCommitSnapshot });
  })();
  await assert.rejects(
    () => client.prepareMiniProjectRestructureUndo(preparedCommit.semanticCommitId, { confirmation: "UNDO_MINI_PROJECT_RESTRUCTURE", traceId: "mini-restructure-undo-changed" }),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_MINI_PROJECT_RESTRUCTURE_UNDO_STATE_CHANGED",
  );
  await staleUndoBridge;
  assert.equal((await client.listSemanticCommits()).length, 1, "changed post-Commit structure creates no inverse ledger");

  const undoPrepareBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected MiniProject restructure Undo prepare Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: finalSnapshot });
  })();
  const undoPreparePromise = client.prepareMiniProjectRestructureUndo(preparedCommit.semanticCommitId, { confirmation: "UNDO_MINI_PROJECT_RESTRUCTURE", traceId: "mini-restructure-undo-prepare" });
  const [, undoPrepared] = await Promise.all([undoPrepareBridge, undoPreparePromise]);
  assert.equal(undoPrepared.status, "PREPARED");
  if (undoPrepared.status !== "PREPARED") throw new Error("expected prepared MiniProject structure Undo");
  assert.equal(undoPrepared.originalSemanticCommitId, preparedCommit.semanticCommitId);
  assert.equal(undoPrepared.undoSemanticCommitId, `mini-project-restructure-undo:${preparedCommit.semanticCommitId}`);
  assert.deepEqual(undoPrepared.steps.map(({ step }) => step.kind), ["MOVE_BLOCK", "REMOVE_CREATED_BLOCK"]);
  assert.equal(undoPrepared.formalGraphWritesExecuted, false);

  const afterUndoMoveBlocks = [blocks[0]!, blocks[1]!, { uuid: createStep.blockUuid, content: createStep.text, contentHash: createStep.contentHash, relation: "CHILD" as const, depth: 1, parentUuid: createStep.parentBlockUuid }];
  const afterUndoMoveSnapshot = { ...snapshot, blocks: afterUndoMoveBlocks, scopeHash: checksum({ kind: "BLOCK", resolved, blocks: afterUndoMoveBlocks, truncated: false }) };
  const undoMoveBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected MiniProject restructure Undo move verification read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot: afterUndoMoveSnapshot });
  })();
  const undoMovePromise = client.verifyMiniProjectRestructureUndoStep(preparedCommit.semanticCommitId, 0, { undoSemanticCommitId: undoPrepared.undoSemanticCommitId, traceId: "mini-restructure-undo-move" });
  const [, undoMoveVerified] = await Promise.all([undoMoveBridge, undoMovePromise]);
  assert.equal(undoMoveVerified.status, "VERIFIED");

  const undoRemoveBridge = (async (): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected MiniProject restructure Undo remove verification read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
  })();
  const undoRemovePromise = client.verifyMiniProjectRestructureUndoStep(preparedCommit.semanticCommitId, 1, { undoSemanticCommitId: undoPrepared.undoSemanticCommitId, traceId: "mini-restructure-undo-remove" });
  const [, undoCompleted] = await Promise.all([undoRemoveBridge, undoRemovePromise]);
  assert.equal(undoCompleted.status, "COMPLETED");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === preparedCommit.semanticCommitId)?.status, "UNDONE");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === undoPrepared.undoSemanticCommitId)?.status, "COMPLETED");
  assert.equal((await client.getObject(created.object.objectId))?.version, created.object.version, "structure Undo preserves the formal MiniProject object authority");
  const undoReplay = await client.prepareMiniProjectRestructureUndo(preparedCommit.semanticCommitId, { confirmation: "UNDO_MINI_PROJECT_RESTRUCTURE", traceId: "mini-restructure-undo-replay" });
  assert.equal(undoReplay.status === "COMPLETED" && undoReplay.replayed, true, "reload reuses the completed inverse ledger without another Graph read");
});

test("MiniProject structure recovery compensates verified Graph steps in reverse and never marks a failed Proposal applied", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-mini-restructure-recovery-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-mini-restructure-recovery", token: "mini-restructure-recovery-token-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const rootContent = "[MiniProject] 恢复结构重构";
  const sourceContent = "保留原材料";
  const materialized = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "恢复结构重构", externalId: "root-recovery", inputVersion: "1", contentHash: checksum(rootContent), idempotencyKey: "mini-restructure-recovery-object", traceId: "mini-restructure-recovery-object" });
  const resolved = { kind: "BLOCK" as const, id: "root-recovery" };
  const originalBlocks = [
    { uuid: "root-recovery", content: rootContent, contentHash: checksum(rootContent), relation: "ROOT" as const, depth: 0 },
    { uuid: "source-recovery", content: sourceContent, contentHash: checksum(sourceContent), relation: "CHILD" as const, depth: 1, parentUuid: "root-recovery" },
  ];
  const originalSnapshot = { kind: "BLOCK" as const, requestedTarget: "root-recovery", resolved, blocks: originalBlocks, truncated: false, readAt: "2026-07-24T19:00:00.000Z", scopeHash: checksum({ kind: "BLOCK", resolved, blocks: originalBlocks, truncated: false }) };
  const preview: GrillPreview = {
    schemaVersion: "task-copilot-grill-preview-v1",
    finalReading: {
      title: { text: "恢复结构重构", evidenceRefs: ["block:root-recovery"] }, outcome: { text: "形成可恢复结构", evidenceRefs: ["answer:outcome"] },
      boundary: { included: [{ text: "原材料", evidenceRefs: ["block:source-recovery"] }], excluded: [] }, completionEvidence: [{ text: "结构可读", evidenceRefs: ["block:source-recovery"] }],
      sections: [
        { sectionId: "root", heading: "入口", purpose: "保留根", sourceMaterials: [{ materialId: "root", sourceRef: "block:root-recovery", contentHash: checksum(rootContent), text: rootContent, preservation: "UNCHANGED" }], derivedBlocks: [] },
        { sectionId: "work", heading: "材料", purpose: "归位", sourceMaterials: [{ materialId: "material-2", sourceRef: "block:source-recovery", contentHash: checksum(sourceContent), text: sourceContent, preservation: "UNCHANGED" }], derivedBlocks: [] },
      ],
    },
    unclassified: [], impact: { sourceMaterialCount: 2, movedMaterialCount: 1, addedDerivedBlockCount: 0, deletedMaterialCount: 0, unclassifiedMaterialCount: 0 },
    evidenceScope: { refs: ["block:root-recovery", "block:source-recovery", "answer:outcome"], scopeHash: "11111111", observedAt: "2026-07-24T19:00:00.000Z" }, authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: { contractVersion: "1.0.0", promptVersion: "prompt-v1", skillName: "mini-project-modeling", skillVersion: "1.1.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "test-model", generatedAt: "2026-07-24T19:00:00.000Z" },
  };
  const ready = buildMiniProjectRestructureProposal({
    proposalId: "proposal_mini_restructure_recovery", createdAt: "2026-07-24T19:00:01.000Z", objectId: materialized.object.objectId, objectVersion: materialized.object.version, preview, sourceScopeHash: originalSnapshot.scopeHash,
    sourcePositions: [
      { materialId: "root", blockUuid: "root-recovery", parentBlockUuid: null, previousSiblingUuid: null, exactText: rootContent, contentHash: checksum(rootContent), isRoot: true },
      { materialId: "material-2", blockUuid: "source-recovery", parentBlockUuid: "root-recovery", previousSiblingUuid: null, exactText: sourceContent, contentHash: checksum(sourceContent), isRoot: false },
    ],
    createdBlockUuids: { "section:work": "33333333-3333-4333-8333-333333333333" },
  });
  const submitted = await client.submitProposal(ready);
  const accepted = await client.reviewProposal(ready.proposalId, { "restructure-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const bridgeSnapshot = async (snapshot: typeof originalSnapshot): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected structure recovery Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
  };
  const prepareBridge = bridgeSnapshot(originalSnapshot);
  const preparePromise = client.prepareMiniProjectRestructure(ready.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "recovery-prepare" });
  const [, prepared] = await Promise.all([prepareBridge, preparePromise]);
  if (prepared.status !== "PREPARED") throw new Error("expected recovery fixture prepare");
  const [createStep] = prepared.plan.steps;
  if (createStep?.kind !== "CREATE_BLOCK") throw new Error("expected recovery fixture create step");
  const afterCreateBlocks = [originalBlocks[0]!, { uuid: createStep.blockUuid, content: createStep.text, contentHash: createStep.contentHash, relation: "CHILD" as const, depth: 1, parentUuid: "root-recovery" }, originalBlocks[1]!];
  const afterCreateSnapshot = { ...originalSnapshot, blocks: afterCreateBlocks, scopeHash: checksum({ kind: "BLOCK", resolved, blocks: afterCreateBlocks, truncated: false }) };
  const verifyBridge = bridgeSnapshot(afterCreateSnapshot);
  const verifyPromise = client.verifyMiniProjectRestructureStep(ready.proposalId, 0, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "recovery-verify-create" });
  const [, verified] = await Promise.all([verifyBridge, verifyPromise]);
  assert.equal(verified.status, "VERIFIED");
  const beginBridge = bridgeSnapshot(afterCreateSnapshot);
  const beginPromise = client.beginMiniProjectRestructureRecovery(ready.proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, failedStepIndex: 1, failureCode: "GRAPH_WRITE_FAILED", traceId: "recovery-begin" });
  const [, recovery] = await Promise.all([beginBridge, beginPromise]);
  assert.equal(recovery.status, "COMPENSATION_REQUIRED");
  assert.deepEqual(recovery.status === "COMPENSATION_REQUIRED" ? recovery.compensations.map(({ stepIndex, step }) => [stepIndex, step.kind]) : [], [[0, "REMOVE_CREATED_BLOCK"]]);
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === prepared.semanticCommitId)?.status, "RECOVERY_REQUIRED");
  const recoveryPrepareReplay = await client.prepareMiniProjectRestructure(ready.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "recovery-prepare-replay" });
  assert.equal(recoveryPrepareReplay.status, "RECOVERY_REQUIRED");
  assert.equal(recoveryPrepareReplay.status === "RECOVERY_REQUIRED" && recoveryPrepareReplay.failedStepIndex, 0, "reload resumes the existing recovery ledger without another Graph read");

  const notCompensatedBridge = bridgeSnapshot(afterCreateSnapshot);
  const notCompensatedPromise = client.verifyMiniProjectRestructureCompensation(ready.proposalId, 0, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "recovery-not-compensated" });
  const [, notCompensated] = await Promise.all([notCompensatedBridge, notCompensatedPromise]);
  assert.equal(notCompensated.status, "NOT_COMPENSATED");
  const compensatedBridge = bridgeSnapshot(originalSnapshot);
  const compensatedPromise = client.verifyMiniProjectRestructureCompensation(ready.proposalId, 0, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "recovery-compensated" });
  const [, compensated] = await Promise.all([compensatedBridge, compensatedPromise]);
  assert.equal(compensated.status, "FAILED_COMPENSATED");
  assert.equal(compensated.status === "FAILED_COMPENSATED" && compensated.record.proposal.status, "FAILED");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === prepared.semanticCommitId)?.status, "FAILED");
  assert.equal((await client.getObject(materialized.object.objectId))?.version, materialized.object.version);
  const replay = await client.beginMiniProjectRestructureRecovery(ready.proposalId, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, failedStepIndex: 1, failureCode: "DESKTOP_DISCONNECTED", traceId: "recovery-replay" });
  assert.equal(replay.status === "FAILED_COMPENSATED" && replay.replayed, true);
  const failedPrepareReplay = await client.prepareMiniProjectRestructure(ready.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "recovery-failed-prepare-replay" });
  assert.equal(failedPrepareReplay.status === "FAILED_COMPENSATED" && failedPrepareReplay.replayed, true, "failed compensated terminal state remains idempotent after reload");
});

test("MiniProject structure Undo failure restores the completed forward structure and leaves the original Commit active", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-mini-restructure-undo-recovery-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-mini-restructure-undo-recovery", token: "mini-restructure-undo-recovery-token" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const rootContent = "[MiniProject] Undo 恢复";
  const sourceContent = "必须保留的材料";
  const materialized = await client.synchronizeExplicitObject({ objectType: "MINI_PROJECT", text: "Undo 恢复", externalId: "root-undo-recovery", inputVersion: "1", contentHash: checksum(rootContent), idempotencyKey: "undo-recovery-object", traceId: "undo-recovery-object" });
  const resolved = { kind: "BLOCK" as const, id: "root-undo-recovery" };
  const originalBlocks = [
    { uuid: "root-undo-recovery", content: rootContent, contentHash: checksum(rootContent), relation: "ROOT" as const, depth: 0 },
    { uuid: "source-undo-recovery", content: sourceContent, contentHash: checksum(sourceContent), relation: "CHILD" as const, depth: 1, parentUuid: "root-undo-recovery" },
  ];
  const snapshotOf = (blocks: typeof originalBlocks) => ({ kind: "BLOCK" as const, requestedTarget: "root-undo-recovery", resolved, blocks, truncated: false, readAt: "2026-07-24T21:00:00.000Z", scopeHash: checksum({ kind: "BLOCK", resolved, blocks, truncated: false }) });
  const originalSnapshot = snapshotOf(originalBlocks);
  const preview: GrillPreview = {
    schemaVersion: "task-copilot-grill-preview-v1",
    finalReading: {
      title: { text: "Undo 恢复", evidenceRefs: ["block:root-undo-recovery"] }, outcome: { text: "得到可恢复结构", evidenceRefs: ["answer:outcome"] },
      boundary: { included: [{ text: "原材料", evidenceRefs: ["block:source-undo-recovery"] }], excluded: [] }, completionEvidence: [{ text: "结构可核验", evidenceRefs: ["block:source-undo-recovery"] }],
      sections: [
        { sectionId: "root", heading: "入口", purpose: "保留根", sourceMaterials: [{ materialId: "root", sourceRef: "block:root-undo-recovery", contentHash: checksum(rootContent), text: rootContent, preservation: "UNCHANGED" }], derivedBlocks: [] },
        { sectionId: "work", heading: "材料", purpose: "归位", sourceMaterials: [{ materialId: "source", sourceRef: "block:source-undo-recovery", contentHash: checksum(sourceContent), text: sourceContent, preservation: "UNCHANGED" }], derivedBlocks: [] },
      ],
    },
    unclassified: [], impact: { sourceMaterialCount: 2, movedMaterialCount: 1, addedDerivedBlockCount: 0, deletedMaterialCount: 0, unclassifiedMaterialCount: 0 },
    evidenceScope: { refs: ["block:root-undo-recovery", "block:source-undo-recovery", "answer:outcome"], scopeHash: "22222222", observedAt: "2026-07-24T21:00:00.000Z" }, authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: { contractVersion: "1.0.0", promptVersion: "prompt-v1", skillName: "mini-project-modeling", skillVersion: "1.1.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "test-model", generatedAt: "2026-07-24T21:00:00.000Z" },
  };
  const proposal = buildMiniProjectRestructureProposal({
    proposalId: "proposal_mini_restructure_undo_recovery", createdAt: "2026-07-24T21:00:01.000Z", objectId: materialized.object.objectId, objectVersion: materialized.object.version, preview, sourceScopeHash: originalSnapshot.scopeHash,
    sourcePositions: [
      { materialId: "root", blockUuid: "root-undo-recovery", parentBlockUuid: null, previousSiblingUuid: null, exactText: rootContent, contentHash: checksum(rootContent), isRoot: true },
      { materialId: "source", blockUuid: "source-undo-recovery", parentBlockUuid: "root-undo-recovery", previousSiblingUuid: null, exactText: sourceContent, contentHash: checksum(sourceContent), isRoot: false },
    ],
    createdBlockUuids: { "section:work": "44444444-4444-4444-8444-444444444444" },
  });
  const submitted = await client.submitProposal(proposal);
  const accepted = await client.reviewProposal(proposal.proposalId, { "restructure-mini-project": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const answerRead = async (snapshot: typeof originalSnapshot): Promise<void> => {
    const pending = await client.claimGraphReadRequest();
    if (!pending) throw new Error("expected structure Undo recovery Graph read");
    await client.completeGraphReadRequest({ requestId: pending.requestId, status: "FOUND", snapshot });
  };
  const prepareRead = answerRead(originalSnapshot);
  const preparePromise = client.prepareMiniProjectRestructure(proposal.proposalId, { expectedUpdatedAt: accepted.updatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: "undo-recovery-forward-prepare" });
  const [, prepared] = await Promise.all([prepareRead, preparePromise]);
  if (prepared.status !== "PREPARED") throw new Error("expected prepared forward structure Commit");
  const [createStep, moveStep] = prepared.plan.steps;
  if (createStep?.kind !== "CREATE_BLOCK" || moveStep?.kind !== "MOVE_BLOCK") throw new Error("expected create and move forward plan");
  const createdBlock = { uuid: createStep.blockUuid, content: createStep.text, contentHash: createStep.contentHash, relation: "CHILD" as const, depth: 1, parentUuid: createStep.parentBlockUuid };
  const afterCreateBlocks = [originalBlocks[0]!, createdBlock, originalBlocks[1]!];
  const afterCreateSnapshot = snapshotOf(afterCreateBlocks);
  const verifyCreateRead = answerRead(afterCreateSnapshot);
  const verifyCreatePromise = client.verifyMiniProjectRestructureStep(proposal.proposalId, 0, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "undo-recovery-forward-create" });
  await Promise.all([verifyCreateRead, verifyCreatePromise]);
  const finalBlocks = [originalBlocks[0]!, createdBlock, { uuid: "source-undo-recovery", content: sourceContent, contentHash: checksum(sourceContent), relation: "CHILD" as const, depth: 2, parentUuid: createStep.blockUuid }];
  const finalSnapshot = snapshotOf(finalBlocks);
  const verifyMoveRead = answerRead(finalSnapshot);
  const verifyMovePromise = client.verifyMiniProjectRestructureStep(proposal.proposalId, 1, { semanticCommitId: prepared.semanticCommitId, expectedUpdatedAt: accepted.updatedAt, traceId: "undo-recovery-forward-move" });
  const [, completed] = await Promise.all([verifyMoveRead, verifyMovePromise]);
  assert.equal(completed.status, "COMPLETED");

  const undoPrepareRead = answerRead(finalSnapshot);
  const undoPreparePromise = client.prepareMiniProjectRestructureUndo(prepared.semanticCommitId, { confirmation: "UNDO_MINI_PROJECT_RESTRUCTURE", traceId: "undo-recovery-prepare" });
  const [, undoPrepared] = await Promise.all([undoPrepareRead, undoPreparePromise]);
  if (undoPrepared.status !== "PREPARED") throw new Error("expected prepared structure Undo");
  const afterUndoMoveBlocks = [originalBlocks[0]!, originalBlocks[1]!, createdBlock];
  const afterUndoMoveSnapshot = snapshotOf(afterUndoMoveBlocks);
  const verifyUndoMoveRead = answerRead(afterUndoMoveSnapshot);
  const verifyUndoMovePromise = client.verifyMiniProjectRestructureUndoStep(prepared.semanticCommitId, 0, { undoSemanticCommitId: undoPrepared.undoSemanticCommitId, traceId: "undo-recovery-move" });
  const [, undoMove] = await Promise.all([verifyUndoMoveRead, verifyUndoMovePromise]);
  assert.equal(undoMove.status, "VERIFIED");
  const beginRecoveryRead = answerRead(afterUndoMoveSnapshot);
  const beginRecoveryPromise = client.beginMiniProjectRestructureUndoRecovery(prepared.semanticCommitId, { undoSemanticCommitId: undoPrepared.undoSemanticCommitId, failedStepIndex: 1, failureCode: "GRAPH_WRITE_FAILED", traceId: "undo-recovery-begin" });
  const [, recovery] = await Promise.all([beginRecoveryRead, beginRecoveryPromise]);
  assert.equal(recovery.status, "COMPENSATION_REQUIRED");
  assert.deepEqual(recovery.status === "COMPENSATION_REQUIRED" ? recovery.compensations.map(({ stepIndex, step }) => [stepIndex, step.kind]) : [], [[0, "MOVE_BLOCK"]]);
  const notCompensatedRead = answerRead(afterUndoMoveSnapshot);
  const notCompensatedPromise = client.verifyMiniProjectRestructureUndoCompensation(prepared.semanticCommitId, 0, { undoSemanticCommitId: undoPrepared.undoSemanticCommitId, traceId: "undo-recovery-not-compensated" });
  const [, notCompensated] = await Promise.all([notCompensatedRead, notCompensatedPromise]);
  assert.equal(notCompensated.status, "NOT_COMPENSATED");
  const compensatedRead = answerRead(finalSnapshot);
  const compensatedPromise = client.verifyMiniProjectRestructureUndoCompensation(prepared.semanticCommitId, 0, { undoSemanticCommitId: undoPrepared.undoSemanticCommitId, traceId: "undo-recovery-compensated" });
  const [, compensated] = await Promise.all([compensatedRead, compensatedPromise]);
  assert.equal(compensated.status, "FAILED_COMPENSATED");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === prepared.semanticCommitId)?.status, "COMPLETED");
  assert.equal((await client.listSemanticCommits()).find(({ semanticCommitId }) => semanticCommitId === undoPrepared.undoSemanticCommitId)?.status, "FAILED");
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
  assert.deepEqual(report.reviewItems, []);
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
  assert.deepEqual(scanned.reviewItems.map(({ displayTitle, sourceObjectType }) => ({ displayTitle, sourceObjectType })), [{
    displayTitle: "迁移服务闭环",
    sourceObjectType: "TASK",
  }]);
  await assert.rejects(
    () => client.previewLegacyMigration(bundle, [{ legacyObjectId: "legacy-service-task", action: "DEFER" }]),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "MIGRATION_REVIEW_DECISION_INVALID",
  );
  const previewed = await client.previewLegacyMigration(bundle, [{ legacyObjectId: "legacy-service-task", action: "IMPORT" }]);
  assert.equal(previewed.run.summary.import, 1);
  assert.deepEqual((await client.listMigrationRuns()).map(({ runId, status }) => ({ runId, status })), [{ runId: previewed.run.runId, status: "PREVIEWED" }]);
  assert.doesNotMatch(JSON.stringify(await client.listMigrationRuns()), /迁移服务闭环/);
  assert.equal((await client.getMigrationRun(previewed.run.runId)).evidence[0]?.targetObjectId, undefined);
  assert.deepEqual((await client.getMigrationRun(previewed.run.runId)).batches, []);
  const snapshot = await client.createBackup();
  const imported = await client.importLegacyMigration(previewed.run.runId, {
    bundle, backupId: snapshot.backupId, objectIds: ["legacy-service-task"], idempotencyKey: "service-batch-1", confirmation: "IMPORT_REVIEWED_V1_BATCH",
  });
  assert.equal(imported.batch.status, "IMPORTED");
  assert.deepEqual((await client.getMigrationRun(previewed.run.runId)).batches.map(({ batchId, status }) => ({ batchId, status })), [{
    batchId: imported.batch.batchId,
    status: "IMPORTED",
  }]);
  assert.equal((await client.importLegacyMigration(previewed.run.runId, {
    bundle, backupId: snapshot.backupId, objectIds: ["legacy-service-task"], idempotencyKey: "service-batch-1", confirmation: "IMPORT_REVIEWED_V1_BATCH",
  })).replayed, true);
  assert.equal((await client.verifyLegacyMigrationBatch(previewed.run.runId, imported.batch.batchId)).status, "VERIFIED");
  assert.equal((await client.getMigrationRun(previewed.run.runId)).batches[0]?.status, "VERIFIED");
  assert.equal((await client.undoLegacyMigrationBatch(previewed.run.runId, imported.batch.batchId, "UNDO_MIGRATION_BATCH")).status, "UNDONE");
  assert.equal((await client.getMigrationRun(previewed.run.runId)).batches[0]?.status, "UNDONE");
  assert.equal(await client.getObject("legacy-service-task"), undefined);
  const retried = await client.importLegacyMigration(previewed.run.runId, {
    bundle, backupId: snapshot.backupId, objectIds: ["legacy-service-task"], idempotencyKey: "service-batch-2", confirmation: "IMPORT_REVIEWED_V1_BATCH",
  });
  await client.verifyLegacyMigrationBatch(previewed.run.runId, retried.batch.batchId);
  assert.equal((await client.activateLegacyMigration(previewed.run.runId, "ACTIVATE_V2_SQLITE")).status, "ACTIVATED");
  assert.equal((await client.getObject("legacy-service-task"))?.text, "迁移服务闭环");
  assert.equal(scanned.sourceBundleSha256, previewed.run.sourceBundleSha256);
});

test("Migration import survives a lost response after its atomic write and replays the same batch", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-migration-response-loss-"));
  let failResponse = true;
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    backupRoot: join(root, "backups"),
    graphId: "graph-migration-response-loss",
    token: "migration-response-loss-token-24-chars",
    faults: {
      afterMigrationImport() {
        if (!failResponse) return;
        failResponse = false;
        throw new Error("injected response loss after migration import");
      },
    },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const legacy = createManagedObject({ objectId: "legacy-response-loss-task", objectType: "TASK", text: "迁移响应丢失" }, new Date("2026-07-20T08:00:00.000Z"));
  const bundle = exportRecoveryBundle({
    ...createEmptyState(),
    objects: [{ ...legacy, phase: "ACTIVE" as const, condition: { kind: "ACTIONABLE" as const } }],
  }, new Date("2026-07-21T08:00:00.000Z"));
  const previewed = await client.previewLegacyMigration(bundle, [{ legacyObjectId: legacy.objectId, action: "IMPORT" }]);
  const snapshot = await client.createBackup();
  const input = {
    bundle,
    backupId: snapshot.backupId,
    objectIds: [legacy.objectId],
    idempotencyKey: "migration-response-loss-batch",
    confirmation: "IMPORT_REVIEWED_V1_BATCH" as const,
  };

  await assert.rejects(() => client.importLegacyMigration(previewed.run.runId, input));
  const afterLoss = await client.getMigrationRun(previewed.run.runId);
  assert.deepEqual(afterLoss.batches.map(({ status, objectIds }) => ({ status, objectIds })), [{
    status: "IMPORTED",
    objectIds: [legacy.objectId],
  }]);
  assert.equal((await client.getObject(legacy.objectId))?.text, "迁移响应丢失");

  const replayed = await client.importLegacyMigration(previewed.run.runId, input);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.batch.batchId, afterLoss.batches[0]?.batchId);
  assert.equal((await client.verifyLegacyMigrationBatch(previewed.run.runId, replayed.batch.batchId)).status, "VERIFIED");
  assert.equal((await client.listSemanticCommits()).filter(({ status }) => status === "PENDING" || status === "RECOVERY_REQUIRED").length, 0);
});

test("Migration verify and activate failures preserve one retryable ledger without partial transitions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-migration-action-failures-"));
  let failVerify = true;
  let failActivate = true;
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    backupRoot: join(root, "backups"),
    graphId: "graph-migration-action-failures",
    token: "migration-action-failures-token-24-chars",
    faults: {
      beforeMigrationVerify() {
        if (!failVerify) return;
        failVerify = false;
        throw new Error("injected failure before migration verify");
      },
      beforeMigrationActivate() {
        if (!failActivate) return;
        failActivate = false;
        throw new Error("injected failure before migration activate");
      },
    },
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const legacy = createManagedObject({ objectId: "legacy-action-failure-task", objectType: "TASK", text: "迁移动作失败后续跑" }, new Date("2026-07-20T08:00:00.000Z"));
  const bundle = exportRecoveryBundle({
    ...createEmptyState(),
    objects: [{ ...legacy, phase: "ACTIVE" as const, condition: { kind: "ACTIONABLE" as const } }],
  }, new Date("2026-07-21T08:00:00.000Z"));
  const previewed = await client.previewLegacyMigration(bundle, [{ legacyObjectId: legacy.objectId, action: "IMPORT" }]);
  const snapshot = await client.createBackup();
  const imported = await client.importLegacyMigration(previewed.run.runId, {
    bundle,
    backupId: snapshot.backupId,
    objectIds: [legacy.objectId],
    idempotencyKey: "migration-action-failure-batch",
    confirmation: "IMPORT_REVIEWED_V1_BATCH",
  });

  await assert.rejects(() => client.verifyLegacyMigrationBatch(previewed.run.runId, imported.batch.batchId));
  const afterVerifyFailure = await client.getMigrationRun(previewed.run.runId);
  assert.equal(afterVerifyFailure.run.status, "IMPORTING");
  assert.equal(afterVerifyFailure.batches[0]?.status, "IMPORTED");
  assert.equal((await client.getObject(legacy.objectId))?.text, "迁移动作失败后续跑");
  assert.equal((await client.verifyLegacyMigrationBatch(previewed.run.runId, imported.batch.batchId)).status, "VERIFIED");

  await assert.rejects(() => client.activateLegacyMigration(previewed.run.runId, "ACTIVATE_V2_SQLITE"));
  const afterActivateFailure = await client.getMigrationRun(previewed.run.runId);
  assert.equal(afterActivateFailure.run.status, "VERIFIED");
  assert.equal(afterActivateFailure.batches[0]?.status, "VERIFIED");
  assert.equal((await client.activateLegacyMigration(previewed.run.runId, "ACTIVATE_V2_SQLITE")).status, "ACTIVATED");
  assert.equal((await client.listSemanticCommits()).filter(({ status }) => status === "PENDING" || status === "RECOVERY_REQUIRED").length, 0);
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
  const waitingUndo = await client.prepareConditionUndo(second.object.objectId);
  assert.equal(waitingUndo.status, "PREPARED");
  assert.deepEqual(waitingUndo.beforeCondition, { kind: "ACTIONABLE" });
  assert.deepEqual(waitingUndo.afterCondition, waiting.object.condition);
  assert.equal(waitingUndo.expectedVersion, waiting.object.version);
  const undoneWaiting = await client.undoCondition(second.object.objectId, {
    conditionChangeId: waitingUndo.conditionChangeId,
    expectedVersion: waitingUndo.expectedVersion,
    confirmation: "UNDO_CONDITION",
    traceId: "trace-condition-undo",
  });
  assert.equal(undoneWaiting.status, "COMPLETED");
  assert.equal(undoneWaiting.object.condition.kind, "ACTIONABLE");
  assert.equal(undoneWaiting.object.version, waiting.object.version + 1);
  assert.equal((await client.undoCondition(second.object.objectId, {
    conditionChangeId: waitingUndo.conditionChangeId,
    expectedVersion: waitingUndo.expectedVersion,
    confirmation: "UNDO_CONDITION",
    traceId: "trace-condition-undo-replay",
  })).replayed, true);
  await assert.rejects(
    () => client.prepareConditionUndo(second.object.objectId),
    (error: unknown) => error instanceof Error && "details" in error
      && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_CONDITION_UNDO_ALREADY_APPLIED",
  );
  const waitingAgain = await client.changeCondition(second.object.objectId, undoneWaiting.object.version, { kind: "WAITING", waitingFor: "外部负责人", expectedResult: "确认窗口", reviewAt: "2026-07-20T00:00:00.000Z" });
  now = await client.nowWork();
  assert.equal(now.focus.find((item) => item.objectId === second.object.objectId)?.condition.kind, "WAITING", "Focus survives an independent Condition change");
  assert.match(now.waitingReview.find((item) => item.objectId === second.object.objectId)?.reason ?? "", /复查已到/);
  const blocked = await client.changeCondition(second.object.objectId, waitingAgain.object.version, { kind: "BLOCKED", reason: "需先完成第一项", blockerObjectId: first.object.objectId });
  assert.equal(blocked.object.condition.kind, "BLOCKED");
  now = await client.nowWork();
  assert.match(now.next.find((item) => item.objectId === first.object.objectId)?.reason ?? "", /阻碍当前关注/);
  await assert.rejects(() => client.changeCondition(second.object.objectId, blocked.object.version, { kind: "BLOCKED", reason: "不存在", blockerObjectId: "missing-blocker" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 404 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_BLOCKER_OBJECT_NOT_FOUND");
  await assert.rejects(() => client.changeCondition(second.object.objectId, second.object.version, { kind: "ACTIONABLE" }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 409 && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT");
  await assert.rejects(
    () => client.undoCondition(second.object.objectId, {
      conditionChangeId: "0".repeat(64),
      expectedVersion: blocked.object.version,
      confirmation: "UNDO_CONDITION",
      traceId: "trace-condition-undo-missing",
    }),
    (error: unknown) => error instanceof Error && "details" in error
      && (error as { details?: { status?: number; remoteCode?: string } }).details?.status === 404,
  );
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
  const undone = await client.undoProjectClosure(completed.semanticCommitId, { confirmation: "UNDO_PROJECT_CLOSURE", traceId: "trace-project-closure-undo" });
  assert.equal(undone.status, "COMPLETED");
  assert.equal(undone.object.lifecycle, "OPEN");
  assert.equal(undone.object.closure, undefined);
  assert.equal((await client.listSemanticCommits()).find((commit) => commit.semanticCommitId === completed.semanticCommitId)?.status, "UNDONE");
  const undoReplay = await client.undoProjectClosure(completed.semanticCommitId, { confirmation: "UNDO_PROJECT_CLOSURE", traceId: "trace-project-closure-undo-replay" });
  assert.equal(undoReplay.replayed, true);
  assert.equal(undoReplay.object.version, undone.object.version);
});

test("Project Closure evidence route is read-only, version-bound, and preserves unknowns", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-closure-evidence-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-closure-evidence",
    token: "project-closure-evidence-token-at-least-24-chars",
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const prepared = await client.prepareProject({ name: "Closure Evidence", traceId: "closure-evidence-prepare" });
  const created = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "Closure Evidence",
    pageExternalId: "page-project-closure-evidence",
    pageContentHash: checksum(""),
    traceId: "closure-evidence-finalize",
  });
  const beforeStatus = await client.status();
  const beforeObject = await client.getObject(created.object.objectId);

  const evidence = await client.getProjectClosureEvidence(created.object.objectId, {
    expectedVersion: created.object.version,
  });

  assert.equal(evidence.authorityBoundary, "READ_ONLY_EVIDENCE_DRAFT");
  assert.equal(evidence.project.objectId, created.object.objectId);
  assert.equal(evidence.unknowns.some(({ code }) => code === "ORIGINAL_GOAL_UNKNOWN"), true);
  assert.equal(evidence.userJudgments.some(({ judgment }) => judgment === "ACTUAL_RESULT"), true);
  assert.deepEqual(await client.status(), beforeStatus);
  assert.deepEqual(await client.getObject(created.object.objectId), beforeObject);

  await assert.rejects(
    () => client.getProjectClosureEvidence(created.object.objectId, { expectedVersion: created.object.version - 1 }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_PROJECT_CLOSURE_EVIDENCE_STALE",
  );
  const injected = await fetch(new URL(`objects/${created.object.objectId}/project-closure/evidence`, service.url), {
    method: "POST",
    headers: {
      authorization: `Bearer ${service.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expectedVersion: created.object.version, actualResult: "client invented" }),
  });
  assert.equal(injected.status, 400);
  assert.equal((await injected.json() as { error: { code: string } }).error.code, "PROJECT_CLOSURE_EVIDENCE_REQUEST_INVALID");
});

test("Project Closure Provider route refuses incomplete formal evidence before charging the model", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-closure-provider-preflight-"));
  let providerCalls = 0;
  const proposalGenerator = new LocalLlmProposalGenerator({
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => {
      providerCalls += 1;
      return {
        value: { decision: "NO_PROPOSAL", reason: "preflight should reject before Provider call" },
        metadata: { requestId: "unexpected", model: "test-model", finishReason: "stop", totalTokens: 1, durationMs: 1, attempts: 1 },
      };
    },
  });
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-closure-provider-preflight",
    token: "project-closure-provider-preflight-token",
    proposalGenerator,
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const prepared = await client.prepareProject({ name: "Closure Preflight", traceId: "closure-preflight-prepare" });
  const created = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "Closure Preflight",
    pageExternalId: "page-project-closure-preflight",
    pageContentHash: checksum(""),
    traceId: "closure-preflight-finalize",
  });
  const before = await client.listProposals();
  await assert.rejects(
    () => client.createProjectClosureProposal(created.object.objectId, { expectedVersion: created.object.version }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "PROJECT_CLOSURE_PROVIDER_EVIDENCE_INSUFFICIENT",
  );
  assert.equal(providerCalls, 0);
  assert.deepEqual(await client.listProposals(), before);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN");
});

test("Project Closure Provider does not reinterpret legally owned work as missing Decision evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-closure-provider-bounded-"));
  let providerCalls = 0;
  const proposalGenerator = new LocalLlmProposalGenerator({
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (request) => {
      providerCalls += 1;
      return userConfirmedProjectClosureCompletion(request);
    },
  });
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-closure-provider-bounded",
    token: "project-closure-provider-bounded-token",
    proposalGenerator,
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);

  const prepared = await client.prepareProject({ name: "发布治理", traceId: "closure-bounded-project-prepare" });
  const created = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "发布治理",
    pageExternalId: "page-project-closure-provider-bounded",
    pageContentHash: checksum("Project/发布治理"),
    traceId: "closure-bounded-project-finalize",
  });
  const structureSubmitted = await client.submitProposal(projectStructureProposal(created.object.objectId, created.object.version));
  const structureReviewed = await client.reviewProposal(
    structureSubmitted.record.proposal.proposalId,
    { "update-project-interface": { disposition: "ACCEPTED", highImpactConfirmed: true } },
    structureSubmitted.record.updatedAt,
  );
  const structured = await client.commitProjectStructure(structureReviewed.proposal.proposalId, {
    expectedUpdatedAt: structureReviewed.updatedAt,
    confirmation: "UPDATE_PROJECT_INTERFACE",
    observations: [],
    traceId: "closure-bounded-project-structure",
  });
  assert.equal(structured.status, "COMPLETED");
  if (structured.status !== "COMPLETED") return;

  const task = await client.materializeExplicitObject({
    objectType: "TASK",
    text: "核对回退开关",
    externalId: "block-closure-bounded-task",
    inputVersion: "1",
    contentHash: checksum("[任务] 核对回退开关"),
    idempotencyKey: "closure-bounded-task",
    traceId: "closure-bounded-task",
  });
  const ownershipSubmitted = await client.submitProposal(ownershipProposal(
    task.object.objectId,
    task.object.version,
    structured.object.objectId,
    structured.object.version,
    undefined,
    "prop_closure_bounded_owner",
  ));
  const ownershipReviewed = await client.reviewProposal(
    ownershipSubmitted.record.proposal.proposalId,
    { "change-owner": { disposition: "ACCEPTED", highImpactConfirmed: true } },
    ownershipSubmitted.record.updatedAt,
  );
  assert.equal((await client.commitPrimaryOwnership(ownershipReviewed.proposal.proposalId, {
    expectedUpdatedAt: ownershipReviewed.updatedAt,
    confirmation: "CHANGE_PRIMARY_OWNERSHIP",
    observations: [],
    traceId: "closure-bounded-owner-commit",
  })).status, "COMPLETED");

  const beforeProject = await client.getObject(structured.object.objectId);
  const beforeProposals = await client.listProposals();
  await assert.rejects(
    () => client.createProjectClosureProposal(structured.object.objectId, { expectedVersion: structured.object.version }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "PROJECT_CLOSURE_PROVIDER_EVIDENCE_INSUFFICIENT",
  );
  assert.equal(providerCalls, 0);
  assert.deepEqual(await client.listProposals(), beforeProposals);
  assert.deepEqual(await client.getObject(structured.object.objectId), beforeProject);
  assert.equal(beforeProject?.lifecycle, "OPEN");

  const beforeCommits = await client.listSemanticCommits();
  const result = await client.createProjectClosureProposal(structured.object.objectId, {
    expectedVersion: structured.object.version,
    userJudgments: {
      actualResult: "发布手册已可使用；Objective 是否完成仍按本次确认记录。",
      objectiveDispositions: [{
        objectiveId: "objective-release",
        disposition: "INCOMPLETE",
        reason: "核对回退开关仍未完成。",
        nextStep: "关闭后继续完成核对回退开关。",
      }],
      legacyDisposition: "核对回退开关继续作为明确遗留，不在关闭时丢弃。",
      keyDecisions: ["继续保留人工回退开关"],
      futureSummary: "未来重入时先核对回退开关与发布手册使用情况。",
    },
  });
  assert.equal(providerCalls, 1);
  assert.equal(result.kind, "PROPOSAL");
  if (result.kind !== "PROPOSAL") return;
  assert.equal(result.record.proposal.source.kind, "local_llm");
  assert.equal(result.record.proposal.groups[0]?.risk, "HIGH");
  assert.equal(result.record.proposal.groups[0]?.disposition, "PENDING");
  assert.deepEqual(await client.listSemanticCommits(), beforeCommits, "user-confirmed Provider draft still cannot create a Commit");
  assert.deepEqual(await client.getObject(structured.object.objectId), beforeProject, "user-confirmed Provider draft cannot complete the Project");
});

test("Project Closure Provider error and generation stale preserve the baseline and allow one fresh retry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-closure-provider-failures-"));
  let mode: "ERROR" | "STALE" | "SUCCESS" = "ERROR";
  let mutateDuringGeneration: (() => Promise<void>) | undefined;
  let providerCalls = 0;
  const proposalGenerator = new LocalLlmProposalGenerator({
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async (request) => {
      providerCalls += 1;
      if (mode === "ERROR") {
        throw new StructuredError({
          code: "LLM_PROVIDER_TIMEOUT",
          message: "injected bounded Provider timeout",
          ruleRefs: ["D-127", "D-140"],
        });
      }
      await mutateDuringGeneration?.();
      return userConfirmedProjectClosureCompletion(request);
    },
  });
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-project-closure-provider-failures",
    token: "project-closure-provider-failures-token",
    proposalGenerator,
  });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);

  const prepared = await client.prepareProject({ name: "Closure Failure Gate", traceId: "closure-failure-prepare" });
  const created = await client.finalizeProject({
    semanticCommitId: prepared.semanticCommitId,
    objectId: prepared.objectId,
    name: "Closure Failure Gate",
    pageExternalId: "page-project-closure-provider-failures",
    pageContentHash: checksum("Project/Closure Failure Gate"),
    traceId: "closure-failure-finalize",
  });
  const structureSubmitted = await client.submitProposal(projectStructureProposal(created.object.objectId, created.object.version));
  const structureReviewed = await client.reviewProposal(
    structureSubmitted.record.proposal.proposalId,
    { "update-project-interface": { disposition: "ACCEPTED", highImpactConfirmed: true } },
    structureSubmitted.record.updatedAt,
  );
  const structured = await client.commitProjectStructure(structureReviewed.proposal.proposalId, {
    expectedUpdatedAt: structureReviewed.updatedAt,
    confirmation: "UPDATE_PROJECT_INTERFACE",
    observations: [],
    traceId: "closure-failure-structure",
  });
  assert.equal(structured.status, "COMPLETED");
  if (structured.status !== "COMPLETED") return;

  const judgments = {
    actualResult: "发布手册已完成，并通过恢复演练核对。",
    objectiveDispositions: [{
      objectiveId: "objective-release",
      disposition: "INCOMPLETE" as const,
      reason: "仍需完成最终发布观察。",
      nextStep: "关闭后继续记录发布观察。",
    }],
    legacyDisposition: "最终发布观察继续作为明确遗留，不在关闭时丢弃。",
    keyDecisions: ["继续保留人工回退开关"],
    futureSummary: "未来重入先核对最终发布观察和人工回退开关。",
  };
  const beforeProject = await client.getObject(structured.object.objectId);
  const beforeProposals = await client.listProposals();
  const beforeCommits = await client.listSemanticCommits();

  await assert.rejects(
    () => client.createProjectClosureProposal(structured.object.objectId, {
      expectedVersion: structured.object.version,
      userJudgments: judgments,
    }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "LLM_PROVIDER_TIMEOUT",
  );
  assert.equal(providerCalls, 1);
  assert.deepEqual(await client.getObject(structured.object.objectId), beforeProject);
  assert.deepEqual(await client.listProposals(), beforeProposals);
  assert.deepEqual(await client.listSemanticCommits(), beforeCommits);

  mode = "STALE";
  mutateDuringGeneration = async () => {
    await client.changeCondition(structured.object.objectId, structured.object.version, {
      kind: "PAUSED",
      reason: "生成期间正式 Project 发生变化",
    });
  };
  await assert.rejects(
    () => client.createProjectClosureProposal(structured.object.objectId, {
      expectedVersion: structured.object.version,
      userJudgments: judgments,
    }),
    (error: unknown) => error instanceof Error
      && "details" in error
      && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_OBJECT_VERSION_CONFLICT",
  );
  mutateDuringGeneration = undefined;
  assert.equal(providerCalls, 2);
  assert.deepEqual(await client.listProposals(), beforeProposals, "stale generated draft never enters Review");
  assert.deepEqual(await client.listSemanticCommits(), beforeCommits, "stale generation creates no Closure Commit");
  const changed = await client.getObject(structured.object.objectId);
  assert.equal(changed?.lifecycle, "OPEN");
  assert.equal(changed?.condition.kind, "PAUSED");
  assert.equal(changed?.version, structured.object.version + 1);

  mode = "SUCCESS";
  const retried = await client.createProjectClosureProposal(structured.object.objectId, {
    expectedVersion: changed!.version,
    userJudgments: judgments,
  });
  assert.equal(providerCalls, 3);
  assert.equal(retried.kind, "PROPOSAL");
  assert.equal((await client.getObject(structured.object.objectId))?.lifecycle, "OPEN");
  assert.deepEqual(await client.listSemanticCommits(), beforeCommits, "fresh retry remains Proposal-only");
});

test("reviewed Project current interface commits one versioned aggregate and rejects stale overwrite", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-project-structure-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-project-structure", token: "project-structure-token-at-least-24" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const client = clientFor(service);
  const intent = await client.prepareProject({ name: "发布治理", traceId: "trace-project-structure-create" });
  const created = await client.finalizeProject({ semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "发布治理", pageExternalId: "page-project-structure", pageContentHash: checksum("Project/发布治理"), traceId: "trace-project-structure-finalize" });
  const submitted = await client.submitProposal(projectStructureProposal(created.object.objectId, created.object.version));
  const reviewed = await client.reviewProposal(submitted.record.proposal.proposalId, { "update-project-interface": { disposition: "ACCEPTED", highImpactConfirmed: true } }, submitted.record.updatedAt);
  const completed = await client.commitProjectStructure(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "UPDATE_PROJECT_INTERFACE", observations: [], traceId: "trace-project-structure-commit" });
  assert.equal(completed.status, "COMPLETED");
  if (completed.status !== "COMPLETED") return;
  assert.equal(completed.object.projectStructure?.objectives[0]?.priority, "PRIMARY");
  assert.deepEqual(completed.object.projectStructure?.currentFocuses, ["完成恢复演练", "收口操作手册"]);
  assert.equal(completed.record.proposal.status, "APPLIED");
  const replay = await client.commitProjectStructure(reviewed.proposal.proposalId, { expectedUpdatedAt: reviewed.updatedAt, confirmation: "UPDATE_PROJECT_INTERFACE", observations: [], traceId: "trace-project-structure-replay" });
  assert.equal(replay.status, "COMPLETED");
  if (replay.status === "COMPLETED") assert.equal(replay.replayed, true);
  const undone = await client.undoProjectStructure(completed.semanticCommitId, { confirmation: "UNDO_PROJECT_INTERFACE", traceId: "trace-project-structure-undo" });
  assert.equal(undone.object.projectStructure?.currentSummary, "已创建 发布治理，待明确目标与当前推进。");
  assert.equal(undone.object.version, completed.object.version + 1);
  const undoReplay = await client.undoProjectStructure(completed.semanticCommitId, { confirmation: "UNDO_PROJECT_INTERFACE", traceId: "trace-project-structure-undo-replay" });
  assert.equal(undoReplay.replayed, true);
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
  const pending = (await client.listSemanticCommits()).find(({ proposalId }) => proposalId === reviewed.proposal.proposalId);
  assert.equal(pending?.status, "PENDING", "a receipt-backed interruption remains the same resumable Commit instead of opening a parallel recovery workflow");
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
  const completed = (await client.listSemanticCommits()).find(({ proposalId }) => proposalId === reviewed.proposal.proposalId);
  assert.equal(completed?.status, "COMPLETED");
  assert.equal((await client.listSemanticCommits()).filter(({ status }) => ["PENDING", "FAILED", "RECOVERY_REQUIRED"].includes(status)).length, 0);
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
  assert.deepEqual(await client.listBackups(), {
    backups: [{
      backupId: created.backupId,
      createdAt: created.createdAt,
      status: "VALID",
      schemaVersion: created.validation.schemaVersion,
      objectCount: created.validation.objectCount,
    }],
    total: 1,
    limited: false,
  });
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
  assert.deepEqual(await new LocalServiceClient({
    protocolVersion: 1,
    url: service.url,
    token: service.token,
    pid: 1,
    createdAt: "2026-07-20T06:00:00.000Z",
  }).listBackups(), {
    backups: [{
      backupId: corruptId,
      createdAt: "2026-07-20T06:00:00.000Z",
      status: "INVALID",
    }],
    total: 1,
    limited: false,
  });
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

test("Restore Apply rolls back a post-activation failure, retains the recovery point, and restarts cleanly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-restore-failure-"));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const backupRoot = join(root, ".task-copilot", "backups");
  const descriptorPath = join(root, "runtime", "service.json");
  let service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-failure",
    token: "restore-failure-first-token-24-chars",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const snapshot = await clientFor(service).createBackup();
  await service.close();

  const changed = await V2SqliteStore.open(databasePath);
  const occurredAt = "2026-07-20T14:00:00.000Z";
  changed.commitObject({
    object: {
      objectId: "must-survive-restore-failure",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "Restore 失败后必须保留",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      sourceOrCreationEvent: "restore-failure-test",
    },
    expectedVersion: 0,
    idempotencyKey: "must-survive-restore-failure",
    audit: {
      traceId: "must-survive-restore-failure",
      actor: "test",
      command: "create_object",
      objectId: "must-survive-restore-failure",
      beforeVersion: 0,
      afterVersion: 1,
      occurredAt,
    },
  });
  changed.close();

  service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-failure",
    token: "restore-failure-second-token-24-chars",
    faults: { afterRestoreActivate: () => { throw new Error("injected post-activate failure"); } },
  });
  await assert.rejects(
    () => clientFor(service).restoreBackup(snapshot.backupId, "RESTORE_AND_STOP_SERVICE"),
    (error: unknown) => error instanceof StructuredError
      && error.code === "SERVICE_HTTP_ERROR"
      && error.details?.remoteCode === "V2_RESTORE_FAILED",
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await access(descriptorPath);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      break;
    }
  }
  await assert.rejects(access(descriptorPath));
  await assert.rejects(() => clientFor(service).health());

  const backupNames = (await readdir(backupRoot)).filter((name) => name.endsWith(".db"));
  assert.equal(backupNames.length, 2, "the selected snapshot and pre-restore recovery point must both remain");
  const recoveryName = backupNames.find((name) => name !== `${snapshot.backupId}.db`);
  assert.ok(recoveryName);
  assert.equal(V2SqliteStore.validateBackup(join(backupRoot, recoveryName), "graph-restore-failure").objectCount, 1);
  const activeAfterFailure = await V2SqliteStore.open(databasePath);
  assert.equal(activeAfterFailure.getObject("must-survive-restore-failure")?.text, "Restore 失败后必须保留");
  assert.equal(activeAfterFailure.doctor().status, "PASS");
  activeAfterFailure.close();

  service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-failure",
    token: "restore-failure-restarted-token-24",
  });
  assert.equal((await clientFor(service).listObjects()).some(({ objectId }) => objectId === "must-survive-restore-failure"), true);
});

test("Restore Apply final validation race stops Service and preserves the unchanged active database", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-restore-validation-race-"));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const backupRoot = join(root, ".task-copilot", "backups");
  const descriptorPath = join(root, "runtime", "service.json");
  let service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-validation-race",
    token: "restore-validation-race-first-token",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const snapshot = await clientFor(service).createBackup();
  await service.close();

  const active = await V2SqliteStore.open(databasePath);
  const occurredAt = "2026-07-20T15:00:00.000Z";
  active.commitObject({
    object: {
      objectId: "must-survive-restore-validation-race",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "最终校验竞态后仍保留",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      sourceOrCreationEvent: "restore-validation-race-test",
    },
    expectedVersion: 0,
    idempotencyKey: "must-survive-restore-validation-race",
    audit: {
      traceId: "must-survive-restore-validation-race",
      actor: "test",
      command: "create_object",
      objectId: "must-survive-restore-validation-race",
      beforeVersion: 0,
      afterVersion: 1,
      occurredAt,
    },
  });
  active.close();

  const snapshotPath = join(backupRoot, `${snapshot.backupId}.db`);
  service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-validation-race",
    token: "restore-validation-race-second-token",
    faults: {
      beforeRestoreOffline: () => writeFileSync(snapshotPath, "corrupt after outer validation", { mode: 0o600 }),
    },
  });
  await assert.rejects(
    () => clientFor(service).restoreBackup(snapshot.backupId, "RESTORE_AND_STOP_SERVICE"),
    (error: unknown) => error instanceof StructuredError
      && error.code === "SERVICE_HTTP_ERROR"
      && error.details?.remoteCode === "V2_BACKUP_VALIDATION_FAILED",
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await access(descriptorPath);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      break;
    }
  }
  await assert.rejects(access(descriptorPath));
  await assert.rejects(() => clientFor(service).health());
  assert.equal((await readdir(backupRoot)).filter((name) => name.endsWith(".db")).length, 1);

  service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-validation-race",
    token: "restore-validation-race-restarted-token",
  });
  const objects = await clientFor(service).listObjects();
  assert.equal(objects.some(({ objectId }) => objectId === "must-survive-restore-validation-race"), true);
  assert.equal((await clientFor(service).doctor()).status, "PASS");
});

test("Restore admission drains an acknowledged formal write into the recovery point and rejects later requests", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-restore-drain-"));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const backupRoot = join(root, ".task-copilot", "backups");
  const descriptorPath = join(root, "runtime", "service.json");
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
  let writeEntered!: () => void;
  const writeAdmission = new Promise<void>((resolve) => { writeEntered = resolve; });
  let restoreEntered!: () => void;
  const restoreAdmission = new Promise<void>((resolve) => { restoreEntered = resolve; });
  const service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-drain",
    token: "restore-drain-token-with-bounds",
    faults: {
      beforeAreaDomainWrite: async () => {
        writeEntered();
        await writeGate;
      },
      beforeRestoreDrain: () => restoreEntered(),
    },
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  const snapshot = await client.createBackup();

  const admittedWrite = client.createArea({ text: "Restore 前已确认写入", traceId: "restore-drain-write" });
  await writeAdmission;
  const restore = client.restoreBackup(snapshot.backupId, "RESTORE_AND_STOP_SERVICE");
  await restoreAdmission;
  await assert.rejects(
    () => client.createArea({ text: "Restore 后到达", traceId: "restore-drain-late-write" }),
    (error: unknown) => error instanceof StructuredError
      && error.code === "SERVICE_HTTP_ERROR"
      && error.details?.remoteCode === "SERVICE_STOPPING",
  );

  releaseWrite();
  assert.equal((await admittedWrite).object.text, "Restore 前已确认写入");
  const restored = await restore;
  assert.equal(restored.status, "RESTORED_SERVICE_STOPPING");
  assert.equal(
    V2SqliteStore.validateBackup(
      join(backupRoot, `${restored.recoveryBackupId}.db`),
      "graph-restore-drain",
    ).objectCount,
    1,
  );
  const active = await V2SqliteStore.open(databasePath);
  assert.equal(active.listObjects().length, 0);
  assert.equal(active.doctor().status, "PASS");
  active.close();
});

test("Restore double failure keeps a durable interlock that blocks every restart until explicit recovery", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-restore-double-failure-"));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const backupRoot = join(root, ".task-copilot", "backups");
  const descriptorPath = join(root, "runtime", "service.json");
  let service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-double-failure",
    token: "restore-double-failure-first-token",
  });
  t.after(async () => {
    await service.close();
    const remaining = await readRestoreRecoveryInterlock(databasePath).catch(() => undefined);
    if (remaining) await clearRestoreRecoveryInterlock(databasePath, remaining).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  const snapshot = await clientFor(service).createBackup();
  await service.close();

  const changed = await V2SqliteStore.open(databasePath);
  const occurredAt = "2026-07-20T16:00:00.000Z";
  changed.commitObject({
    object: {
      objectId: "retained-in-recovery-point",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "双重失败前的正式状态",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      sourceOrCreationEvent: "restore-double-failure-test",
    },
    expectedVersion: 0,
    idempotencyKey: "retained-in-recovery-point",
    audit: {
      traceId: "retained-in-recovery-point",
      actor: "test",
      command: "create_object",
      objectId: "retained-in-recovery-point",
      beforeVersion: 0,
      afterVersion: 1,
      occurredAt,
    },
  });
  changed.close();

  service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-double-failure",
    token: "restore-double-failure-second-token",
    faults: {
      afterRestoreActivate: () => { throw new Error("injected activation failure"); },
      beforeRestoreRollback: () => { throw new Error("injected rollback failure"); },
    },
  });
  await assert.rejects(
    () => clientFor(service).restoreBackup(snapshot.backupId, "RESTORE_AND_STOP_SERVICE"),
    (error: unknown) => error instanceof StructuredError
      && error.code === "SERVICE_HTTP_ERROR"
      && error.details?.remoteCode === "V2_RESTORE_ROLLBACK_FAILED",
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await access(descriptorPath);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      break;
    }
  }
  await assert.rejects(access(descriptorPath));
  await assert.rejects(() => clientFor(service).health());

  const interlock = await readRestoreRecoveryInterlock(databasePath);
  assert.ok(interlock);
  assert.equal(interlock?.status, "RECOVERY_REQUIRED");
  assert.equal(interlock?.graphId, "graph-restore-double-failure");
  assert.match(interlock?.recoveryBackupId ?? "", /^backup_[0-9]{17}_[0-9a-f]{32}$/);
  assert.equal(
    V2SqliteStore.validateBackup(
      join(backupRoot, `${interlock?.recoveryBackupId}.db`),
      "graph-restore-double-failure",
    ).objectCount,
    1,
  );

  await assert.rejects(
    () => startLocalService({
      databasePath,
      backupRoot,
      descriptorPath,
      graphId: "graph-restore-double-failure",
      token: "restore-double-failure-blocked-token",
    }),
    /RESTORE_RECOVERY_REQUIRED/,
  );
  await assert.rejects(access(descriptorPath));

  const recoveryPath = join(backupRoot, `${interlock.recoveryBackupId}.db`);
  const manualSafetyPath = join(backupRoot, "manual-recovery-safety.db");
  const recovered = await V2SqliteStore.restoreOffline(
    databasePath,
    recoveryPath,
    manualSafetyPath,
    "graph-restore-double-failure",
  );
  assert.equal(recovered.validation.status, "PASS");
  const manuallyRecovered = await V2SqliteStore.open(databasePath);
  assert.equal(manuallyRecovered.getObject("retained-in-recovery-point")?.text, "双重失败前的正式状态");
  assert.equal(manuallyRecovered.doctor().status, "PASS");
  manuallyRecovered.close();
  await clearRestoreRecoveryInterlock(databasePath, interlock);
  service = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore-double-failure",
    token: "restore-double-failure-recovered-token",
  });
  assert.equal((await clientFor(service).doctor()).status, "PASS");
  assert.equal(
    (await clientFor(service).listObjects()).some(({ objectId }) => objectId === "retained-in-recovery-point"),
    true,
    "the interlock clears only after the retained recovery point has been selected, restored, and passed Doctor",
  );
});
