import assert from "node:assert/strict";
import test from "node:test";

import type {
  ServiceGrillTurn,
  ServiceProjectCreationGrillRequest,
  ServiceProjectCreationGrillResult,
  ServiceProjectCreationPreviewResult,
  ServiceProjectCreationProposalResult,
} from "@task-copilot/service-client";

import {
  ProjectCreationGrillController,
  type ProjectCreationGrillRuntime,
} from "../src/project-creation-grill-controller.ts";

function turn(readiness: ServiceGrillTurn["readiness"] = "CONTINUE"): ServiceProjectCreationGrillResult {
  return {
    output: {
      schemaVersion: "task-copilot-grill-turn-v1",
      understanding: "要把当前材料收束为一个边界清晰的 Project。",
      facts: [{ text: "来源只包含当前测试材料", sourceRefs: ["page:page-1"] }],
      inferences: [{ text: "当前结果边界仍需确认", evidenceRefs: ["page:page-1"] }],
      unknowns: [{ uncertaintyId: "outcome", dimension: "OUTCOME", text: "Project 最终要形成什么？" }],
      readiness,
      ...(readiness === "CONTINUE" ? {
        questionGroup: {
          focusUncertaintyId: "outcome",
          questions: [{ uncertaintyId: "outcome", text: "完成时最重要的可验收结果是什么？" }],
          recommendation: { text: "先确认可验收结果。", evidenceRefs: ["page:page-1"], tradeoffs: ["范围会更清晰"] },
        },
      } : {}),
      evidenceScope: { refs: ["page:page-1"], scopeHash: "scope-hash", observedAt: "2026-07-25T08:00:00.000Z" },
      authorityBoundary: "SESSION_DRAFT_ONLY",
      provenance: {
        contractVersion: "1.0.0",
        promptVersion: "prompt-hash",
        skillName: "project-creation-modeling",
        skillVersion: "1.1.0",
        providerId: "deepseek",
        providerVersion: "chat-completions-v1",
        model: "deepseek-v4-flash",
        generatedAt: "2026-07-25T08:00:00.000Z",
      },
    },
    provider: { model: "deepseek-v4-flash", durationMs: 12, attempts: 1 },
    promptBundleVersion: "prompt-hash",
    contextFingerprint: "context-fingerprint",
  };
}

const preview: ServiceProjectCreationPreviewResult = {
  output: {
    schemaVersion: "task-copilot-project-creation-preview-v1",
    finalReading: {
      title: { text: "发布治理", evidenceRefs: ["answer:outcome"] },
      outcome: { text: "形成可复核发布流程", evidenceRefs: ["answer:outcome"] },
      boundary: {
        included: [{ text: "发布核对", evidenceRefs: ["page:page-1"] }],
        excluded: [{ text: "长期运营", evidenceRefs: ["answer:boundary"] }],
      },
      completionEvidence: [{ text: "恢复演练通过", evidenceRefs: ["answer:completion"] }],
      internalClosure: { text: "每轮发布均形成证据", evidenceRefs: ["answer:closure"] },
      currentInterface: { text: "从发布核对继续", evidenceRefs: ["answer:interface"] },
    },
    pageObjectRelationship: {
      mode: "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE",
      rationale: "保留来源 Page，另建 Project Page。",
      evidenceRefs: ["page:page-1"],
      authority: "PROPOSED_FOR_REVIEW",
    },
    sourceMaterials: [{
      materialId: "material-1",
      sourceRef: "page:page-1",
      contentHash: "12345678",
      text: "发布核对材料",
      disposition: "LINK_AS_SOURCE",
      rationale: "保留事实来源。",
      evidenceRefs: ["page:page-1"],
      preservation: "UNCHANGED",
    }],
    formalImpact: { createsObject: false, createsPage: false, movesBlocks: 0, rewritesBlocks: 0, deletesBlocks: 0 },
    evidenceScope: { refs: ["page:page-1"], scopeHash: "scope-hash", observedAt: "2026-07-25T08:00:00.000Z" },
    authorityBoundary: "SESSION_PREVIEW_ONLY",
    provenance: {
      contractVersion: "1.0.0",
      promptVersion: "prompt-hash",
      skillName: "project-creation-modeling",
      skillVersion: "1.1.0",
      providerId: "deepseek",
      providerVersion: "chat-completions-v1",
      model: "deepseek-v4-flash",
      generatedAt: "2026-07-25T08:00:00.000Z",
    },
  },
  provider: { model: "deepseek-v4-flash", durationMs: 12, attempts: 1 },
  promptBundleVersion: "prompt-hash",
  contextFingerprint: "context-fingerprint",
  previewHandle: "project_creation_preview_aaaaaaaaaaaaaaaa",
};

test("runs adaptive Project creation turns for Blank, Page, and MiniProject without client-supplied facts", async () => {
  const calls: ServiceProjectCreationGrillRequest[] = [];
  const client = {
    grillProjectCreation: async (input: ServiceProjectCreationGrillRequest) => {
      calls.push(input);
      return turn();
    },
  };
  const runtime: ProjectCreationGrillRuntime = { client, providerAvailable: true, generation: 3 };
  const controller = new ProjectCreationGrillController(() => runtime, async () => undefined);

  assert.equal(await controller.start({ sourceKind: "BLANK" }), "BLANK");
  await controller.answer("BLANK", "形成可复核发布流程");
  assert.equal(await controller.start({ sourceKind: "PAGE", pageId: "page-1" }), "PAGE:page-1");
  assert.equal(await controller.start({ sourceKind: "MINI_PROJECT", objectId: "object:mini:1", expectedVersion: 4 }), "MINI_PROJECT:object:mini:1:4");

  assert.deepEqual(calls, [
    { sourceKind: "BLANK", answers: [] },
    { sourceKind: "BLANK", answers: [{ uncertaintyId: "outcome", text: "形成可复核发布流程" }] },
    { sourceKind: "PAGE", pageId: "page-1", answers: [] },
    { sourceKind: "MINI_PROJECT", objectId: "object:mini:1", expectedVersion: 4, answers: [] },
  ]);
  assert.deepEqual(controller.snapshot()["MINI_PROJECT:object:mini:1:4"]?.source, {
    sourceKind: "MINI_PROJECT",
    objectId: "object:mini:1",
    expectedVersion: 4,
  });
});

test("retains the last verified turn for retry and classifies authoritative source changes as stale", async () => {
  let fail: Error | undefined;
  const client = {
    grillProjectCreation: async () => {
      if (fail) throw fail;
      return turn();
    },
  };
  const controller = new ProjectCreationGrillController(
    () => ({ client, providerAvailable: true, generation: 1 }),
    async () => undefined,
  );
  await controller.start({ sourceKind: "PAGE", pageId: "page-1" });
  fail = new Error("provider timeout");
  await controller.answer("PAGE:page-1", "完成证据是恢复演练通过");
  const failed = controller.snapshot()["PAGE:page-1"];
  assert.equal(failed?.status, "error");
  assert.doesNotMatch(failed?.status === "error" ? failed.message : "", /provider|Local Service|Proposal/i);
  assert.deepEqual(failed?.status === "error" ? failed.retryAnswers : undefined, [
    { uncertaintyId: "outcome", text: "完成证据是恢复演练通过" },
  ]);
  assert.equal(failed?.status === "error" ? failed.previous?.output.understanding : undefined, turn().output.understanding);

  fail = Object.assign(new Error("page changed"), { details: { remoteCode: "GRILL_SOURCE_STALE" } });
  await controller.retry("PAGE:page-1");
  assert.equal(controller.snapshot()["PAGE:page-1"]?.status, "stale");
});

test("generates zero-write Preview then creates only a server-owned HIGH Review Proposal", async () => {
  let previewInput: ServiceProjectCreationGrillRequest | undefined;
  let proposalInput: unknown;
  const proposalResult = {
    record: { proposal: { proposalId: "proposal-project-creation" } },
    replayed: false,
  } as ServiceProjectCreationProposalResult;
  const client = {
    grillProjectCreation: async () => turn("READY_FOR_PREVIEW"),
    previewProjectCreation: async (input: ServiceProjectCreationGrillRequest) => {
      previewInput = input;
      return preview;
    },
    createProjectCreationProposal: async (input: unknown) => {
      proposalInput = input;
      return proposalResult;
    },
  };
  const controller = new ProjectCreationGrillController(
    () => ({ client, providerAvailable: true, generation: 8 }),
    async () => undefined,
  );
  await controller.start({ sourceKind: "PAGE", pageId: "page-1" });
  await controller.generatePreview("PAGE:page-1");
  assert.deepEqual(previewInput, { sourceKind: "PAGE", pageId: "page-1", answers: [] });
  assert.equal(preview.output.formalImpact.createsObject, false);
  assert.equal(preview.output.formalImpact.createsPage, false);

  assert.equal(await controller.createProposal("PAGE:page-1"), proposalResult);
  assert.deepEqual(proposalInput, { previewHandle: preview.previewHandle });
  const state = controller.snapshot()["PAGE:page-1"];
  assert.equal(state?.status === "ready" && state.preview?.status === "ready" ? state.preview.proposal?.status : undefined, "ready");
});

test("invalidates expired or stale Preview authority and preserves answers for a fresh source check", async () => {
  let proposalError: Error = Object.assign(new Error("preview expired"), {
    details: { remoteCode: "PROJECT_CREATION_PREVIEW_SESSION_EXPIRED" },
  });
  const client = {
    grillProjectCreation: async () => turn("READY_FOR_PREVIEW"),
    previewProjectCreation: async () => preview,
    createProjectCreationProposal: async () => {
      throw proposalError;
    },
  };
  const controller = new ProjectCreationGrillController(
    () => ({ client, providerAvailable: true, generation: 2 }),
    async () => undefined,
  );
  await controller.start({ sourceKind: "PAGE", pageId: "page-1" });
  await controller.generatePreview("PAGE:page-1");
  await controller.createProposal("PAGE:page-1");
  let state = controller.snapshot()["PAGE:page-1"];
  assert.equal(state?.status, "ready");
  assert.equal(state?.status === "ready" ? state.preview?.status : undefined, "error");
  assert.match(state?.status === "ready" && state.preview?.status === "error" ? state.preview.message : "", /重新生成最终阅读预览/);

  await controller.generatePreview("PAGE:page-1");
  proposalError = Object.assign(new Error("source changed"), { details: { remoteCode: "GRILL_SOURCE_STALE" } });
  await controller.createProposal("PAGE:page-1");
  state = controller.snapshot()["PAGE:page-1"];
  assert.equal(state?.status, "stale");
  assert.match(state?.status === "stale" ? state.message : "", /基于最新内容重新检查/);
  assert.deepEqual(state?.status === "stale" ? state.answers : undefined, []);

  const nextKey = await controller.recheck("PAGE:page-1", { sourceKind: "PAGE", pageId: "page-1" });
  assert.equal(nextKey, "PAGE:page-1");
  assert.equal(controller.snapshot()[nextKey]?.status, "ready");

  await controller.generatePreview(nextKey);
  proposalError = Object.assign(new Error("relationship unresolved"), {
    details: { remoteCode: "PROJECT_CREATION_RELATIONSHIP_REVIEW_REQUIRED" },
  });
  await controller.createProposal(nextKey);
  state = controller.snapshot()[nextKey];
  assert.equal(state?.status, "ready");
  assert.equal(state?.status === "ready" ? state.result.output.readiness : undefined, "CONTINUE");
  assert.equal(state?.status === "ready" ? state.result.output.questionGroup?.focusUncertaintyId : undefined, "page-object-relationship");
  assert.match(state?.status === "ready" ? state.result.output.questionGroup?.questions[0]?.text ?? "" : "", /保留为来源/);
  await controller.answer(nextKey, "保留当前 Page 作为来源，并另建 Project 页面");
  state = controller.snapshot()[nextKey];
  assert.deepEqual(state?.status === "ready" ? state.answers : undefined, [{
    uncertaintyId: "page-object-relationship",
    text: "保留当前 Page 作为来源，并另建 Project 页面",
  }]);
});

test("drops in-flight output after clear and rejects stale generation after Service reconnect", async () => {
  let resolveTurn!: (value: ServiceProjectCreationGrillResult) => void;
  let generation = 1;
  const client = {
    grillProjectCreation: () => new Promise<ServiceProjectCreationGrillResult>((resolve) => {
      resolveTurn = resolve;
    }),
  };
  const controller = new ProjectCreationGrillController(
    () => ({ client, providerAvailable: true, generation }),
    async () => undefined,
  );
  const pending = controller.start({ sourceKind: "BLANK" });
  await Promise.resolve();
  controller.clear();
  resolveTurn(turn());
  await pending;
  assert.deepEqual(controller.snapshot(), {});

  const reconnectingClient = {
    grillProjectCreation: async () => {
      generation = 2;
      return turn();
    },
  };
  const reconnecting = new ProjectCreationGrillController(
    () => ({ client: reconnectingClient, providerAvailable: true, generation }),
    async () => undefined,
  );
  await reconnecting.start({ sourceKind: "BLANK" });
  const state = reconnecting.snapshot().BLANK;
  assert.equal(state?.status, "error");
  assert.match(state?.status === "error" ? state.message : "", /没有完成/);
  assert.doesNotMatch(state?.status === "error" ? state.message : "", /Local Service|Provider|Proposal/i);
});
