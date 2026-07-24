import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceProjectContextRecoveryResult } from "@task-copilot/service-client";

import {
  ProjectContextRecoveryController,
  resolveProjectContextRecoveryRoute,
  type ProjectContextRecoveryRuntime,
} from "../src/project-context-recovery-controller.ts";
import type { PluginProjectReentryCard } from "../src/reentry-runtime.ts";

const result: ServiceProjectContextRecoveryResult = {
  output: {
    schemaVersion: "task-copilot-ux-output-v1",
    summary: "项目入口证据不足，应先回到项目原文。",
    facts: [{ text: "最近一次正式变化已知", sourceRefs: ["object:project-1@v3"] }],
    inferences: [],
    unknowns: ["当前边界尚不明确"],
    suggestedChanges: [],
    nextActionEligible: true,
    nextAction: { intent: "OPEN_SOURCE", label: "打开项目原文", targetRef: "anchor:anchor-project" },
    riskLevel: "NONE",
    requiresDiscussion: true,
    requiresReview: false,
    evidenceScope: { refs: ["anchor:anchor-project"], observedAt: "2026-07-24T12:00:00.000Z", scopeHash: "scope-hash" },
    provenance: {
      kind: "LLM_DRAFT",
      contractVersion: "1.0.0",
      promptVersion: "prompt-hash",
      skillName: "recover-context",
      skillVersion: "1.0.0",
      providerId: "deepseek",
      providerVersion: "chat-completions-v1",
      model: "deepseek-chat",
      generatedAt: "2026-07-24T12:00:00.000Z",
    },
  },
  provider: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
  promptBundleVersion: "prompt-hash",
  contextFingerprint: "context-fingerprint",
};

function card(): PluginProjectReentryCard {
  return {
    project: {
      objectId: "project-1",
      objectType: "PROJECT",
      version: 3,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "发布治理",
      createdAt: "2026-07-24T08:00:00.000Z",
      updatedAt: "2026-07-24T09:00:00.000Z",
      sourceOrCreationEvent: "test",
    },
    projection: {
      kind: "PROJECT",
      objectId: "project-1",
      sufficiency: "INSUFFICIENT",
      safetyState: "CLEAN",
      headline: "当前进入点不明确",
      summary: "最近一次正式变化已知",
      keyEvidence: [],
      facts: [],
      inferences: [],
      unknowns: ["当前边界尚不明确"],
      entryPoints: [],
      relatedContextCount: 0,
      nextActionEligible: true,
      primaryAction: {
        intent: "OPEN_PRIMARY_ANCHOR",
        label: "打开项目原文",
        targetObjectId: "project-1",
        targetAnchorId: "anchor-project",
      },
      lastFormalChangeAt: "2026-07-24T09:00:00.000Z",
      evidenceScope: { refs: ["object:project-1@v3"], observedAt: "2026-07-24T12:00:00.000Z" },
      source: { kind: "DETERMINISTIC_RULE", ruleId: "project-reentry-insufficient", version: "1.0.0" },
    },
    focused: false,
    primaryRoute: {
      action: "v2-open-primary-anchor",
      value: "block-project",
      label: "打开项目原文",
    },
    entryPointRoutes: [],
  };
}

test("controller exposes loading, validates current Project twice, and keeps the draft session-only", async () => {
  const updates: string[] = [];
  let listCalls = 0;
  let generationCalls = 0;
  const client = {
    listObjects: async () => {
      listCalls += 1;
      return [{ objectId: "project-1", objectType: "PROJECT", version: 3 }];
    },
    recoverProjectContext: async () => {
      generationCalls += 1;
      return result;
    },
  };
  const runtime: ProjectContextRecoveryRuntime = { client, providerAvailable: true, generation: 7 };
  const controller = new ProjectContextRecoveryController(() => runtime, async () => {
    updates.push(controller.snapshot()["project-1"]?.status ?? "empty");
  });

  await controller.generate("project-1", 3);

  assert.deepEqual(updates, ["loading", "ready"]);
  assert.equal(listCalls, 2);
  assert.equal(generationCalls, 1);
  assert.equal(controller.snapshot()["project-1"]?.status, "ready");
  controller.clear();
  assert.deepEqual(controller.snapshot(), {});
});

test("controller drops an in-flight result after Graph/runtime clear and prevents duplicate submission", async () => {
  let resolveGeneration!: (value: ServiceProjectContextRecoveryResult) => void;
  let generationCalls = 0;
  const client = {
    listObjects: async () => [{ objectId: "project-1", objectType: "PROJECT", version: 3 }],
    recoverProjectContext: () => {
      generationCalls += 1;
      return new Promise<ServiceProjectContextRecoveryResult>((resolve) => {
        resolveGeneration = resolve;
      });
    },
  };
  const controller = new ProjectContextRecoveryController(
    () => ({ client, providerAvailable: true, generation: 1 }),
    async () => undefined,
  );

  const first = controller.generate("project-1", 3);
  await Promise.resolve();
  const duplicate = controller.generate("project-1", 3);
  await Promise.resolve();
  assert.equal(generationCalls, 1);
  controller.clear();
  resolveGeneration(result);
  await Promise.all([first, duplicate]);
  assert.deepEqual(controller.snapshot(), {});
});

test("controller fails before Provider for stale Project and verified route resolution rejects invented targets", async () => {
  let generationCalls = 0;
  const client = {
    listObjects: async () => [{ objectId: "project-1", objectType: "PROJECT", version: 4 }],
    recoverProjectContext: async () => {
      generationCalls += 1;
      return result;
    },
  };
  const controller = new ProjectContextRecoveryController(
    () => ({ client, providerAvailable: true, generation: 1 }),
    async () => undefined,
  );
  await controller.generate("project-1", 3);
  assert.equal(generationCalls, 0);
  const staleState = controller.snapshot()["project-1"];
  assert.equal(staleState?.status, "error");
  assert.match(staleState?.status === "error" ? staleState.message : "", /已变化/);

  const ready = { status: "ready" as const, expectedVersion: 3, result };
  assert.deepEqual(resolveProjectContextRecoveryRoute(ready, card()), card().primaryRoute);
  const invented = {
    ...ready,
    result: {
      ...result,
      output: {
        ...result.output,
        nextAction: { ...result.output.nextAction!, targetRef: "anchor:invented" },
      },
    },
  };
  assert.equal(resolveProjectContextRecoveryRoute(invented, card()), undefined);
  assert.equal(resolveProjectContextRecoveryRoute({ ...ready, expectedVersion: 2 }, card()), undefined);
});
