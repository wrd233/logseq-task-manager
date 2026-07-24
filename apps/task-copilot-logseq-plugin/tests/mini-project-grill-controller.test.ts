import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceGrillTurn, ServiceMiniProjectGrillPreviewResult, ServiceMiniProjectGrillProposalResult, ServiceMiniProjectGrillResult } from "@task-copilot/service-client";

import {
  MiniProjectGrillController,
  type MiniProjectGrillRuntime,
} from "../src/mini-project-grill-controller.ts";

function turn(focus = "boundary", readiness: ServiceGrillTurn["readiness"] = "CONTINUE"): ServiceMiniProjectGrillResult {
  return {
    output: {
      schemaVersion: "task-copilot-grill-turn-v1",
      understanding: "要把当前材料收束成一个有限结果。",
      facts: [{ text: "原文有两个待确认步骤", sourceRefs: ["block:block-mini"] }],
      inferences: [{ text: "边界可能仍然过宽", evidenceRefs: ["block:block-mini"] }],
      unknowns: [{ uncertaintyId: focus, dimension: "BOUNDARY", text: "不属于本次结果的工作是什么？" }],
      readiness,
      ...(readiness === "CONTINUE" ? {
        questionGroup: {
          focusUncertaintyId: focus,
          questions: [{ uncertaintyId: focus, text: "哪些工作明确不属于这次 MiniProject？" }],
          recommendation: { text: "先排除长期治理工作。", evidenceRefs: ["block:block-mini"], tradeoffs: ["范围更窄，但更容易收口"] },
        },
      } : {}),
      evidenceScope: { refs: ["block:block-mini"], scopeHash: "scope-hash", observedAt: "2026-07-24T12:00:00.000Z" },
      authorityBoundary: "SESSION_DRAFT_ONLY",
      provenance: { contractVersion: "1.0.0", promptVersion: "prompt-hash", skillName: "mini-project-modeling", skillVersion: "1.0.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "deepseek-chat", generatedAt: "2026-07-24T12:00:00.000Z" },
    },
    provider: { model: "deepseek-chat", durationMs: 12, attempts: 1 },
    promptBundleVersion: "prompt-hash",
    contextFingerprint: "context-fingerprint",
  };
}

const preview: ServiceMiniProjectGrillPreviewResult = {
  output: {
    schemaVersion: "task-copilot-grill-preview-v1",
    finalReading: {
      title: { text: "整理托管设备", evidenceRefs: ["block:block-mini"] },
      outcome: { text: "形成可复核记录", evidenceRefs: ["answer:outcome"] },
      boundary: { included: [{ text: "当前设备", evidenceRefs: ["block:block-mini"] }], excluded: [] },
      completionEvidence: [{ text: "记录可复核", evidenceRefs: ["answer:completion"] }],
      sections: [{ sectionId: "root", heading: "入口", purpose: "保留入口", sourceMaterials: [{ materialId: "root", sourceRef: "block:block-mini", contentHash: "12345678", text: "[MiniProject] 整理托管设备", preservation: "UNCHANGED" }], derivedBlocks: [] }],
    },
    unclassified: [],
    impact: { sourceMaterialCount: 1, movedMaterialCount: 0, addedDerivedBlockCount: 0, deletedMaterialCount: 0, unclassifiedMaterialCount: 0 },
    evidenceScope: { refs: ["block:block-mini"], scopeHash: "scope-hash", observedAt: "2026-07-24T12:00:00.000Z" },
    authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: { contractVersion: "1.0.0", promptVersion: "prompt-hash", skillName: "mini-project-modeling", skillVersion: "1.0.0", providerId: "deepseek", providerVersion: "chat-completions-v1", model: "deepseek-chat", generatedAt: "2026-07-24T12:00:00.000Z" },
  },
  provider: { model: "deepseek-chat", durationMs: 12, attempts: 1 }, promptBundleVersion: "prompt-hash", contextFingerprint: "fingerprint", previewHandle: "grill_preview_aaaaaaaaaaaaaaaaaaaaaaaa",
};

test("runs a session-only multi-turn grill and validates the MiniProject before and after every turn", async () => {
  const calls: Array<{ objectId: string; expectedVersion: number; answers: Array<{ uncertaintyId: string; text: string }> }> = [];
  let listCalls = 0;
  const client = {
    listObjects: async () => {
      listCalls += 1;
      return [{ objectId: "mini-1", objectType: "MINI_PROJECT", lifecycle: "OPEN", version: 2 }];
    },
    grillMiniProject: async (input: typeof calls[number]) => {
      calls.push(input);
      return turn(input.answers.length ? "outcome" : "boundary");
    },
  };
  const runtime: MiniProjectGrillRuntime = { client, providerAvailable: true, generation: 4 };
  const controller = new MiniProjectGrillController(() => runtime, async () => undefined);

  await controller.start("mini-1", 2);
  await controller.answer("长期运营治理不在本次范围内");

  assert.equal(listCalls, 4);
  assert.deepEqual(calls, [
    { objectId: "mini-1", expectedVersion: 2, answers: [] },
    { objectId: "mini-1", expectedVersion: 2, answers: [{ uncertaintyId: "boundary", text: "长期运营治理不在本次范围内" }] },
  ]);
  const state = controller.snapshot()["mini-1"];
  assert.equal(state?.status, "ready");
  assert.deepEqual(state?.answers, [{ uncertaintyId: "boundary", text: "长期运营治理不在本次范围内" }]);
  controller.clear();
  assert.deepEqual(controller.snapshot(), {});
});

test("prevents duplicate turns and drops an in-flight response after runtime clear", async () => {
  let resolveTurn!: (value: ServiceMiniProjectGrillResult) => void;
  let calls = 0;
  const client = {
    listObjects: async () => [{ objectId: "mini-1", objectType: "MINI_PROJECT", lifecycle: "OPEN", version: 2 }],
    grillMiniProject: () => {
      calls += 1;
      return new Promise<ServiceMiniProjectGrillResult>((resolve) => { resolveTurn = resolve; });
    },
  };
  const controller = new MiniProjectGrillController(() => ({ client, providerAvailable: true, generation: 1 }), async () => undefined);
  const first = controller.start("mini-1", 2);
  await Promise.resolve();
  const duplicate = controller.start("mini-1", 2);
  await Promise.resolve();
  assert.equal(calls, 1);
  controller.clear();
  resolveTurn(turn());
  await Promise.all([first, duplicate]);
  assert.deepEqual(controller.snapshot(), {});
});

test("marks formal or runtime changes stale but retains the last verified turn on provider failure", async () => {
  let version = 2;
  let fail = false;
  const client = {
    listObjects: async () => [{ objectId: "mini-1", objectType: "MINI_PROJECT", lifecycle: "OPEN", version }],
    grillMiniProject: async () => {
      if (fail) throw new Error("provider timeout");
      return turn();
    },
  };
  const controller = new MiniProjectGrillController(() => ({ client, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.start("mini-1", 2);
  fail = true;
  await controller.answer("排除长期治理");
  const failed = controller.snapshot()["mini-1"];
  assert.equal(failed?.status, "error");
  assert.equal(failed?.previous?.output.understanding, turn().output.understanding);
  assert.deepEqual(failed?.answers, []);
  assert.deepEqual(failed?.status === "error" ? failed.retryAnswers : undefined, [{ uncertaintyId: "boundary", text: "排除长期治理" }]);

  version = 3;
  await controller.retry("mini-1");
  const stale = controller.snapshot()["mini-1"];
  assert.equal(stale?.status, "stale");
  assert.match(stale?.message ?? "", /已变化/);
});

test("fails before Provider for invalid or non-open MiniProject and rejects answers without a current focus", async () => {
  let calls = 0;
  const client = {
    listObjects: async () => [{ objectId: "mini-1", objectType: "MINI_PROJECT", lifecycle: "COMPLETED", version: 2 }],
    grillMiniProject: async () => { calls += 1; return turn(); },
  };
  const controller = new MiniProjectGrillController(() => ({ client, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.start("mini-1", 2);
  assert.equal(calls, 0);
  assert.equal(controller.snapshot()["mini-1"]?.status, "stale");
  await assert.rejects(() => controller.answer("answer"), /当前问题已失效/);
  await assert.rejects(() => controller.start("../bad", 0), /已失效/);
});

test("generates a zero-write preview only from a ready turn and retains the turn on preview failure", async () => {
  let failPreview = false;
  let previewCalls = 0;
  const client = {
    listObjects: async () => [{ objectId: "mini-1", objectType: "MINI_PROJECT", lifecycle: "OPEN", version: 2 }],
    grillMiniProject: async () => turn("boundary", "READY_FOR_PREVIEW"),
    previewMiniProjectGrill: async () => {
      previewCalls += 1;
      if (failPreview) throw new Error("preview provider timeout");
      return preview;
    },
  };
  const controller = new MiniProjectGrillController(() => ({ client, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.start("mini-1", 2);
  await controller.generatePreview("mini-1");
  let state = controller.snapshot()["mini-1"];
  assert.equal(state?.status === "ready" ? state.preview?.status : undefined, "ready");
  assert.equal(state?.status === "ready" && state.preview?.status === "ready" ? state.preview.result.output.impact.deletedMaterialCount : -1, 0);

  failPreview = true;
  await controller.generatePreview("mini-1");
  state = controller.snapshot()["mini-1"];
  assert.equal(state?.status, "ready");
  assert.equal(state?.status === "ready" ? state.preview?.status : undefined, "error");
  assert.equal(state?.status === "ready" ? state.result.output.readiness : undefined, "READY_FOR_PREVIEW");
  assert.equal(previewCalls, 2);
});

test("creates one server-owned HIGH review Proposal from the current preview handle", async () => {
  let proposalInput: unknown;
  const proposalResult = { record: { proposal: { proposalId: "proposal-mini" } }, replayed: false } as ServiceMiniProjectGrillProposalResult;
  const client = {
    listObjects: async () => [{ objectId: "mini-1", objectType: "MINI_PROJECT", lifecycle: "OPEN", version: 2 }],
    grillMiniProject: async () => turn("boundary", "READY_FOR_PREVIEW"),
    previewMiniProjectGrill: async () => preview,
    createMiniProjectRestructureProposal: async (input: unknown) => { proposalInput = input; return proposalResult; },
  };
  const controller = new MiniProjectGrillController(() => ({ client, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.start("mini-1", 2);
  await controller.generatePreview("mini-1");
  assert.equal(await controller.createProposal("mini-1"), proposalResult);
  assert.deepEqual(proposalInput, { objectId: "mini-1", expectedVersion: 2, previewHandle: preview.previewHandle });
  const state = controller.snapshot()["mini-1"];
  assert.equal(state?.status === "ready" && state.preview?.status === "ready" ? state.preview.proposal?.status : undefined, "ready");
});

test("classifies Service source-stale as a terminal stale session", async () => {
  const stale = Object.assign(new Error("source changed"), { details: { remoteCode: "GRILL_SOURCE_STALE" } });
  const client = {
    listObjects: async () => [{ objectId: "mini-1", objectType: "MINI_PROJECT", lifecycle: "OPEN", version: 2 }],
    grillMiniProject: async () => { throw stale; },
  };
  const controller = new MiniProjectGrillController(() => ({ client, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.start("mini-1", 2);
  assert.equal(controller.snapshot()["mini-1"]?.status, "stale");
});
