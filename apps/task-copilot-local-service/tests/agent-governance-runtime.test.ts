import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AgentGovernanceApplication, V2Application, V2CandidateApplication } from "@task-copilot/application";
import type { ServiceGraphSnapshot } from "@task-copilot/service-client";

import { V2SqliteStore } from "@task-copilot/persistence/node";

import { AgentGovernanceRuntime } from "../src/agent-governance-runtime.ts";
import { readAgentGovernanceSkill } from "../src/skill-catalog.ts";

function contextSource(store: V2SqliteStore) {
  return {
    getObject: (objectId: string) => store.getObject(objectId),
    listObjects: () => store.listObjects(),
    listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
    listAssociations: () => store.listAssociations(),
    getActivePrimaryAnchorByObject: (objectId: string) => store.getActivePrimaryAnchorByObject(objectId),
    databaseSchemaVersion: () => store.doctor().schemaVersion,
    listCandidates: () => store.listCandidates(),
  };
}

function snapshot(uuid: string, content: string): ServiceGraphSnapshot {
  return {
    kind: "BLOCK",
    requestedTarget: uuid,
    resolved: { kind: "BLOCK", id: uuid },
    blocks: [{ uuid, content, contentHash: "a".repeat(64), relation: "ROOT", depth: 0, pageName: "2026-08-02" }],
    truncated: false,
    readAt: "2026-08-02T08:00:00.000Z",
    scopeHash: "b".repeat(64),
  };
}

test("EXPERIMENT observes an explicit Task into a reloadable Shadow Decision with zero formal business writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-runtime-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-runtime");
  const application = new V2Application(store);
  await application.createObject(
    { objectId: "existing-task", objectType: "TASK", text: "保持不变" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "existing-task", traceId: "existing-task" },
  );
  const formalBefore = { objects: store.listObjects(), candidates: store.listCandidates(), ownerships: store.listPrimaryOwnerships(), associations: store.listAssociations() };
  const graphSnapshot = snapshot("source-explicit", "[Task] 整理 RHCSA 资料");
  let providerRequest: { system: string; user: string } | undefined;
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-runtime",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-1", status: "FOUND", snapshot: graphSnapshot }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async (request) => {
        providerRequest = { system: request.system, user: request.user };
        return {
        value: {
          schemaVersion: "agent-decision-output-v1",
          outcome: "CREATE_OBJECT",
          targetObjectIds: [],
          ruleId: "EXPLICIT-TASK-01",
          evidenceSummary: "来源根含明确任务标记，未发现同源重复。",
          evidenceRefs: ["source:source-explicit", "rule:EXPLICIT-TASK-01"],
          counterSignals: [],
          closestAlternative: { outcome: "CREATE_CANDIDATE", reason: "无法排除重复时进入待整理。" },
          needsMoreContext: false,
          needsHuman: false,
        },
        metadata: { model: "configured-model", promptTokens: 200, completionTokens: 80, durationMs: 5, attempts: 1 },
        };
      },
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T08:00:00.000Z"),
  });

  const result = await runtime.observe({ changedBlockId: "source-explicit", changedBlockCount: 1 });
  assert.equal(result.status, "RECORDED");
  assert.equal(result.decision?.riskRoute, "SHADOW");
  assert.equal(result.decision?.executionStatus, "NOT_EXECUTED");
  assert.deepEqual({ objects: store.listObjects(), candidates: store.listCandidates(), ownerships: store.listPrimaryOwnerships(), associations: store.listAssociations() }, formalBefore);
  assert.equal(store.listAgentDecisions({ limit: 10 }).length, 1);
  assert.equal(store.listAgentRuleAuthorizations().length, 6);
  const providerInput = JSON.parse(providerRequest?.user ?? "null") as Record<string, unknown>;
  assert.deepEqual(providerInput.legalOutcomes, ["CREATE_OBJECT", "NEEDS_MORE_CONTEXT", "NEEDS_HUMAN"]);
  assert.deepEqual(providerInput.allowedEvidenceRefs, ["rule:EXPLICIT-TASK-01", "source:source-explicit"]);
  assert.deepEqual(providerInput.allowedCounterSignals, ["DUPLICATE_OBJECT", "EXPLANATORY_ONLY", "MULTIPLE_TARGETS", "SOURCE_STALE"]);
  assert.deepEqual(providerInput.outputTemplate, {
    schemaVersion: "agent-decision-output-v1",
    outcome: "CREATE_OBJECT",
    targetObjectIds: [],
    ruleId: "EXPLICIT-TASK-01",
    evidenceSummary: "Summarize only supplied evidence without hidden reasoning.",
    evidenceRefs: ["rule:EXPLICIT-TASK-01", "source:source-explicit"],
    counterSignals: [],
    closestAlternative: { outcome: "NEEDS_HUMAN", reason: "State the closest legal alternative, or use an empty object." },
    needsMoreContext: false,
    needsHuman: false,
  });

  const replay = await runtime.observe({ changedBlockId: "source-explicit", changedBlockCount: 1 });
  assert.equal(replay.status, "UNCHANGED");
  assert.equal(store.listAgentDecisions({ limit: 10 })[0]?.revision, 1);
});

test("two explicitly named formal targets expand one Shadow Decision without inventing target authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-runtime-expanded-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-runtime-expanded");
  const application = new V2Application(store);
  const target31 = await application.createObject(
    { objectId: "target-performance-31", objectType: "TASK", text: "GOD 性能验证 31" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "target-performance-31", traceId: "target-performance-31" },
  );
  const target32 = await application.createObject(
    { objectId: "target-performance-32", objectType: "TASK", text: "GOD 性能验证 32" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "target-performance-32", traceId: "target-performance-32" },
  );
  const before = store.listObjects();
  let providerInput: Record<string, unknown> | undefined;
  let providerCalls = 0;
  let expandedContextEnabled = true;
  let source = snapshot("source-expanded", "TODO 对照 GOD 性能验证 31 与 GOD 性能验证 32，决定下一步");
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-runtime-expanded",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-expanded", status: "FOUND", snapshot: source }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async ({ user }) => {
        providerCalls += 1;
        providerInput = JSON.parse(user) as Record<string, unknown>;
        return {
          value: {
            schemaVersion: "agent-decision-output-v1",
            outcome: "NEEDS_HUMAN",
            targetObjectIds: [target31.objectId, target32.objectId],
            ruleId: "EXPLICIT-TASK-01",
            evidenceSummary: "来源同时明确指向两个正式 Task，不能在 LOCAL 中擅自选择。",
            evidenceRefs: ["object:target-performance-31", "object:target-performance-32", "rule:EXPLICIT-TASK-01", "source:source-expanded"],
            counterSignals: ["MULTIPLE_TARGETS"],
            closestAlternative: { outcome: "NEEDS_MORE_CONTEXT", reason: "等待用户确认主要目标。" },
            needsMoreContext: false,
            needsHuman: true,
          },
          metadata: { model: "configured-model", promptTokens: 320, completionTokens: 90, durationMs: 5, attempts: 1 },
        };
      },
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    expandedContextEnabled: () => expandedContextEnabled,
    now: () => new Date("2026-08-02T08:30:00.000Z"),
  });

  const result = await runtime.observe({ changedBlockId: "source-expanded", changedBlockCount: 1 });
  assert.equal(result.gateAction, "RUN_EXPANDED");
  assert.equal(result.decision?.context.tier, "EXPANDED");
  assert.equal(result.decision?.outcome, "NEEDS_HUMAN");
  assert.deepEqual(result.decision?.counterSignals, ["MULTIPLE_TARGETS"]);
  assert.deepEqual(providerInput?.allowedTargetObjectIds, ["target-performance-31", "target-performance-32"]);
  assert.match(JSON.stringify(providerInput?.context), /target-performance-31/);
  assert.match(JSON.stringify(providerInput?.context), /target-performance-32/);
  assert.deepEqual(store.listObjects(), before, "Shadow target disambiguation must not change formal Objects");

  expandedContextEnabled = false;
  source = snapshot("source-expanded", "TODO 对照 GOD 性能验证 31 与 GOD 性能验证 32，决定下一步（更新）");
  const disabled = await runtime.observe({ changedBlockId: "source-expanded", changedBlockCount: 1 });
  assert.equal(providerCalls, 1, "disabled expanded context must not call Provider");
  assert.equal(disabled.gateAction, "RUN_EXPANDED");
  assert.equal(disabled.decision?.context.tier, "LOCAL");
  assert.equal(disabled.decision?.outcome, "NEEDS_HUMAN");
  assert.deepEqual(disabled.decision?.counterSignals, ["EXPANDED_CONTEXT_DISABLED"]);
  assert.deepEqual(store.listObjects(), before);
});

test("an existing Candidate with an explicit defer expression reaches the defer rule instead of becoming a generic Review Signal", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-runtime-defer-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-runtime-defer");
  await new V2CandidateApplication(store).discover({
    candidateId: "candidate-defer",
    sourceAnchorId: "source-defer",
    sourceVersion: "1:source-defer",
    candidateKind: "WORK_ITEM",
    reason: "显式事项尚未形成正式对象。",
    suggestion: "审阅后决定是否正式化。",
  }, { actor: "test", traceId: "candidate-defer", idempotencyKey: "candidate-defer" });
  const candidatesBefore = store.listCandidates();
  let providerCalled = false;
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-runtime-defer",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-defer", status: "FOUND", snapshot: snapshot("source-defer", "以后考虑整理这组性能记录") }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async () => {
        providerCalled = true;
        return {
          value: {
            schemaVersion: "agent-decision-output-v1", outcome: "DEFER", targetObjectIds: [], ruleId: "CANDIDATE-DEFER-01",
            evidenceSummary: "来源已有 Candidate，并明确表达以后考虑且没有当前期限。",
            evidenceRefs: ["rule:CANDIDATE-DEFER-01", "source:source-defer"], counterSignals: [],
            closestAlternative: { outcome: "NEEDS_HUMAN", reason: "出现当前承诺时重新判断。" }, needsMoreContext: false, needsHuman: false,
          },
          metadata: { model: "configured-model", durationMs: 5, attempts: 1 },
        };
      },
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T08:40:00.000Z"),
  });

  const result = await runtime.observe({ changedBlockId: "source-defer", changedBlockCount: 1 });
  assert.equal(providerCalled, true);
  assert.equal(result.gateAction, "RUN_LOCAL");
  assert.equal(result.decision?.rule.id, "CANDIDATE-DEFER-01");
  assert.equal(result.decision?.outcome, "DEFER");
  assert.deepEqual(store.listCandidates(), candidatesBefore, "Shadow Candidate defer must not change Candidate disposition");
  assert.equal(store.listAgentReviewSignals({ limit: 10 }).length, 0);
});

test("an existing Candidate with one exact formal target reaches bounded duplicate governance", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-runtime-duplicate-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-runtime-duplicate");
  await new V2Application(store).createObject(
    { objectId: "existing-alert-task", objectType: "TASK", text: "校验告警规则" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "existing-alert-task", traceId: "existing-alert-task" },
  );
  await new V2CandidateApplication(store).discover({
    candidateId: "candidate-duplicate",
    sourceAnchorId: "source-duplicate",
    sourceVersion: "1:source-duplicate",
    candidateKind: "WORK_ITEM",
    reason: "显式事项尚未形成正式对象。",
    suggestion: "审阅后决定是否正式化。",
  }, { actor: "test", traceId: "candidate-duplicate", idempotencyKey: "candidate-duplicate" });
  const before = { objects: store.listObjects(), candidates: store.listCandidates() };
  let providerInput: Record<string, unknown> | undefined;
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-runtime-duplicate",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-duplicate", status: "FOUND", snapshot: snapshot("source-duplicate", "校验告警规则") }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async ({ user }) => {
        providerInput = JSON.parse(user) as Record<string, unknown>;
        return {
          value: {
            schemaVersion: "agent-decision-output-v1", outcome: "UPDATE_EXISTING", targetObjectIds: ["existing-alert-task"], ruleId: "CANDIDATE-DUPLICATE-01",
            evidenceSummary: "Candidate 与唯一开放 Task 文本完全相同。",
            evidenceRefs: ["object:existing-alert-task", "rule:CANDIDATE-DUPLICATE-01", "source:source-duplicate"], counterSignals: [],
            closestAlternative: { outcome: "NEEDS_HUMAN", reason: "目标不再唯一时交给用户判断。" }, needsMoreContext: false, needsHuman: false,
          },
          metadata: { model: "configured-model", durationMs: 5, attempts: 1 },
        };
      },
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T08:50:00.000Z"),
  });

  const result = await runtime.observe({ changedBlockId: "source-duplicate", changedBlockCount: 1 });
  assert.equal(result.gateAction, "RUN_LOCAL");
  assert.equal(result.decision?.rule.id, "CANDIDATE-DUPLICATE-01");
  assert.equal(result.decision?.targetObjectId, "existing-alert-task");
  assert.deepEqual(providerInput?.allowedTargetObjectIds, ["existing-alert-task"]);
  assert.deepEqual({ objects: store.listObjects(), candidates: store.listCandidates() }, before);
});

test("one Source Root switches from weak review to explicit Task as one meaningful Decision revision", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-runtime-revision-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-runtime-revision");
  let content = "maybe revisit the alert workflow later";
  let at = new Date("2026-08-02T09:00:00.000Z");
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-runtime-revision",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-revision", status: "FOUND", snapshot: snapshot("source-revision", content) }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async () => ({
        value: {
          schemaVersion: "agent-decision-output-v1", outcome: "CREATE_OBJECT", targetObjectIds: [], ruleId: "EXPLICIT-TASK-01",
          evidenceSummary: "来源现在包含明确 Task 标记，且没有重复目标。",
          evidenceRefs: ["rule:EXPLICIT-TASK-01", "source:source-revision"], counterSignals: [],
          closestAlternative: {}, needsMoreContext: false, needsHuman: false,
        },
        metadata: { model: "configured-model", durationMs: 5, attempts: 1 },
      }),
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => at,
  });

  const weak = await runtime.observe({ changedBlockId: "source-revision", changedBlockCount: 1 });
  assert.equal(weak.decision?.revision, 1);
  assert.equal(weak.decision?.rule.id, "REVIEW-SIGNAL-01");
  content = "TODO revisit the alert workflow after the pilot";
  at = new Date("2026-08-02T09:01:00.000Z");
  const explicit = await runtime.observe({ changedBlockId: "source-revision", changedBlockCount: 1 });

  assert.equal(explicit.decision?.threadId, weak.decision?.threadId);
  assert.equal(explicit.decision?.revision, 2);
  assert.equal(explicit.decision?.rule.id, "EXPLICIT-TASK-01");
  assert.equal(explicit.decision?.outcome, "CREATE_OBJECT");
  assert.equal(store.listAgentDecisions({ limit: 10 }).length, 1);
  assert.deepEqual(store.listAgentDecisionEvents(explicit.decision!.threadId).map(({ eventType }) => eventType), ["SOURCE_OBSERVED", "DECISION_REVISED"]);
});

test("an ordinary child inside one formal object's worksite reaches context governance rather than duplicate Task creation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-runtime-worksite-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-runtime-worksite");
  const application = new V2Application(store);
  const formal = await application.createObject(
    { objectId: "formal-worksite-task", objectType: "TASK", text: "核对告警接入" },
    { actor: "test", expectedVersion: 0, idempotencyKey: "formal-worksite-task", traceId: "formal-worksite-task" },
  );
  await application.bindPrimaryAnchor("formal-worksite-task", {
    anchorId: "anchor-formal-worksite-task",
    graphId: "graph-agent-runtime-worksite",
    externalId: "formal-parent",
    contentHash: "a".repeat(64),
  }, { actor: "test", expectedVersion: formal.version, idempotencyKey: "anchor-formal-worksite-task", traceId: "anchor-formal-worksite-task" });
  const childSnapshot: ServiceGraphSnapshot = {
    kind: "BLOCK", requestedTarget: "worksite-child", resolved: { kind: "BLOCK", id: "worksite-child" },
    blocks: [
      { uuid: "worksite-child", content: "记录：供应商已确认字段映射。", contentHash: "b".repeat(64), relation: "ROOT", depth: 0, parentUuid: "formal-parent", pageName: "Worksite" },
      { uuid: "formal-parent", content: "[Task] 核对告警接入", contentHash: "a".repeat(64), relation: "PARENT", depth: 1, pageName: "Worksite" },
    ],
    truncated: false, readAt: "2026-08-02T09:10:00.000Z", scopeHash: "c".repeat(64),
  };
  const parentSnapshot = snapshot("formal-parent", "[Task] 核对告警接入");
  const before = store.listObjects();
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-runtime-worksite",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async ({ target }) => ({ requestId: `read-${target}`, status: "FOUND", snapshot: target === "worksite-child" ? childSnapshot : parentSnapshot }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async () => ({
        value: {
          schemaVersion: "agent-decision-output-v1", outcome: "UPDATE_EXISTING", targetObjectIds: ["formal-worksite-task"], ruleId: "WORKSITE-CONTEXT-01",
          evidenceSummary: "普通记录位于唯一正式 Task 的工作现场，只建议保留上下文关联。",
          evidenceRefs: ["object:formal-worksite-task", "rule:WORKSITE-CONTEXT-01", "source:formal-parent"], counterSignals: [],
          closestAlternative: {}, needsMoreContext: false, needsHuman: false,
        },
        metadata: { model: "configured-model", durationMs: 5, attempts: 1 },
      }),
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T09:10:00.000Z"),
  });

  const result = await runtime.observe({ changedBlockId: "worksite-child", changedBlockCount: 1 });
  assert.equal(result.decision?.sourceRoot.externalId, "formal-parent");
  assert.equal(result.decision?.rule.id, "WORKSITE-CONTEXT-01");
  assert.equal(result.decision?.targetObjectId, "formal-worksite-task");
  assert.deepEqual(store.listObjects(), before);
});

test("a Candidate whose source is clearly explanatory reaches KEEP_ORDINARY without changing the Candidate", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-runtime-ordinary-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-runtime-ordinary");
  await new V2CandidateApplication(store).discover({
    candidateId: "candidate-ordinary",
    sourceAnchorId: "source-ordinary",
    sourceVersion: "1:source-ordinary",
    candidateKind: "WORK_ITEM",
    reason: "边界内容等待判断。",
    suggestion: "判断是否应保留普通内容。",
  }, { actor: "test", traceId: "candidate-ordinary", idempotencyKey: "candidate-ordinary" });
  const before = store.listCandidates();
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-runtime-ordinary",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-ordinary", status: "FOUND", snapshot: snapshot("source-ordinary", "容器镜像由只读层和可写层组成") }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async () => ({
        value: {
          schemaVersion: "agent-decision-output-v1", outcome: "KEEP_ORDINARY", targetObjectIds: [], ruleId: "ORDINARY-CONTENT-01",
          evidenceSummary: "来源是解释性知识，没有行动、等待或交付表达。",
          evidenceRefs: ["rule:ORDINARY-CONTENT-01", "source:source-ordinary"], counterSignals: [],
          closestAlternative: {}, needsMoreContext: false, needsHuman: false,
        },
        metadata: { model: "configured-model", durationMs: 5, attempts: 1 },
      }),
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T09:20:00.000Z"),
  });

  const result = await runtime.observe({ changedBlockId: "source-ordinary", changedBlockCount: 1 });
  assert.equal(result.decision?.rule.id, "ORDINARY-CONTENT-01");
  assert.equal(result.decision?.outcome, "KEEP_ORDINARY");
  assert.equal(result.decision?.riskRoute, "SHADOW");
  assert.deepEqual(store.listCandidates(), before);
});

test("Provider failure records a bounded failed Decision and does not reject the observation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-provider-failure-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-provider-failure");
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-provider-failure",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-2", status: "FOUND", snapshot: snapshot("source-failure", "[Task] 校验告警") }) },
    skill: await readAgentGovernanceSkill(),
    provider: { completeStructured: async () => { throw new Error("secret provider body must not escape"); } },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T09:00:00.000Z"),
  });
  const result = await runtime.observe({ changedBlockId: "source-failure", changedBlockCount: 1 });
  assert.equal(result.status, "RECORDED");
  assert.equal(result.decision?.executionStatus, "FAILED");
  assert.equal(result.decision?.outcome, "NEEDS_HUMAN");
  assert.doesNotMatch(JSON.stringify(result), /secret provider body/i);
});

test("Provider cannot invent a target outside bounded retrieval evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-provider-target-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-provider-target");
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-provider-target",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-target", status: "FOUND", snapshot: snapshot("source-target", "TODO 核对未知目标") }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async () => ({
        value: {
          schemaVersion: "agent-decision-output-v1", outcome: "CREATE_OBJECT", targetObjectIds: ["invented-object"], ruleId: "EXPLICIT-TASK-01",
          evidenceSummary: "attempted invented target", evidenceRefs: ["source:source-target", "rule:EXPLICIT-TASK-01"], counterSignals: [],
          closestAlternative: {}, needsMoreContext: false, needsHuman: false,
        },
        metadata: { model: "configured-model", durationMs: 5, attempts: 1 },
      }),
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T09:30:00.000Z"),
  });

  const result = await runtime.observe({ changedBlockId: "source-target", changedBlockCount: 1 });
  assert.equal(result.decision?.executionStatus, "FAILED");
  assert.deepEqual(result.decision?.counterSignals, ["AGENT_PROVIDER_TARGET_INVENTED"]);
  assert.equal(store.listObjects().length, 0);
});

test("a newer source revision cancels an in-flight Provider result before Decision persistence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-cancel-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-cancel");
  let release!: () => void;
  const providerGate = new Promise<void>((resolve) => { release = resolve; });
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-cancel",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-cancel", status: "FOUND", snapshot: snapshot("source-cancel", "[Task] 取消旧判断") }) },
    skill: await readAgentGovernanceSkill(),
    provider: {
      completeStructured: async () => {
        await providerGate;
        return {
          value: {
            schemaVersion: "agent-decision-output-v1", outcome: "CREATE_OBJECT", targetObjectIds: [], ruleId: "EXPLICIT-TASK-01",
            evidenceSummary: "stale output", evidenceRefs: ["source:source-cancel", "rule:EXPLICIT-TASK-01"], counterSignals: [],
            closestAlternative: {}, needsMoreContext: false, needsHuman: false,
          },
          metadata: { model: "configured-model", durationMs: 5, attempts: 1 },
        };
      },
    },
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
  });
  const controller = new AbortController();
  const observation = runtime.observe({ changedBlockId: "source-cancel", changedBlockCount: 1 }, controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  release();
  await assert.rejects(observation, /cancelled|取消/i);
  assert.equal(store.listAgentDecisions({ limit: 10 }).length, 0);
});

test("a weak signal enters the 60-day review index without requiring a Provider", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-agent-weak-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = await V2SqliteStore.open(join(root, "task-copilot.db"));
  t.after(() => store.close());
  store.initialize("graph-agent-weak");
  const runtime = new AgentGovernanceRuntime({
    graphId: "graph-agent-weak",
    source: contextSource(store),
    application: new AgentGovernanceApplication(store),
    graph: { read: async () => ({ requestId: "read-weak", status: "FOUND", snapshot: snapshot("source-weak", "以后可能需要复盘这类告警") }) },
    skill: await readAgentGovernanceSkill(),
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    now: () => new Date("2026-08-02T10:00:00.000Z"),
  });
  const result = await runtime.observe({ changedBlockId: "source-weak", changedBlockCount: 1 });
  assert.equal(result.decision?.outcome, "REVIEW_SIGNAL");
  assert.equal(result.decision?.executionStatus, "NOT_EXECUTED");
  const [signal] = store.listAgentReviewSignals({ status: "ACTIVE", limit: 10 });
  assert.equal(signal?.sourceRoot.externalId, "source-weak");
  assert.equal(signal?.retentionClass, "NORMAL");
  assert.equal(signal?.activeUntil, "2026-10-01T10:00:00.000Z");
});
