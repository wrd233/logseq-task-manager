import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AgentGovernanceApplication, V2Application } from "@task-copilot/application";
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
