import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreationSession,
  failCreationRound,
  startCreationSessionRound,
  submitCreationRoundAnswers,
  type CreationSession,
  type CreationSessionSource,
} from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

import { CreationSessionController, type CreationSessionClient, type CreationSessionRuntime } from "../src/creation-session-controller.ts";

const at = new Date("2026-08-02T06:00:00.000Z");
const blank = (): CreationSessionSource => ({
  sourceId: "source-primary",
  role: "PRIMARY",
  kind: "BLANK",
  captures: [{ captureId: "capture-blank", reason: "SESSION_START", snapshotHash: "blank", content: "", hierarchy: [], capturedAt: at.toISOString() }],
  currentCaptureId: "capture-blank",
  latestKnownHash: "blank",
  availability: "AVAILABLE",
});

function session(): CreationSession {
  return createCreationSession({ graphId: "graph-one", targetType: "MINI_PROJECT", primarySource: blank(), sessionId: "creation-ui" }, at);
}

function withRound(value = session()): CreationSession {
  return startCreationSessionRound(value, {
    roundId: "round-one",
    theme: "结果与完成方式",
    questions: [
      { questionId: "q-outcome", uncertaintyId: "outcome", text: "希望形成什么结果？", rationale: "先明确结果。", recommendation: "先形成一个可验收结果。", answerRequirement: "说明具体结果。", answerState: "UNANSWERED" },
      { questionId: "q-evidence", uncertaintyId: "evidence", text: "怎样判断完成？", rationale: "需要完成判断。", recommendation: "使用可复核证据。", answerRequirement: "给出一项证据。", answerState: "UNANSWERED" },
    ],
    unresolvedBranches: ["完成证据"],
    abstentions: [],
  }, value.version, at);
}

function client(overrides: Partial<CreationSessionClient> = {}): CreationSessionClient {
  const unsupported = async (): Promise<never> => { throw new Error("unexpected client call"); };
  return {
    createCreationSession: unsupported,
    getCreationSession: unsupported,
    listCreationSessions: unsupported,
    addCreationSessionSource: unsupported,
    checkCreationSessionSource: unsupported,
    refreshCreationSessionSource: unsupported,
    startCreationSessionRound: unsupported,
    submitCreationSessionRound: unsupported,
    retryCreationSessionRound: unsupported,
    generateCreationSessionDraft: unsupported,
    editCreationSessionDraft: unsupported,
    adoptCreationSessionDraft: unsupported,
    updateCreationSession: unsupported,
    createCreationSessionProposal: unsupported,
    abandonCreationSession: unsupported,
    ...overrides,
  } as CreationSessionClient;
}

test("creates a durable session before the user confirms source scope and starts Provider", async () => {
  const created = session();
  const calls: string[] = [];
  const runtimeClient = client({
    createCreationSession: async (input) => {
      calls.push(`create:${input.idempotencyKey.split(":")[0]}`);
      return { session: created, replayed: false };
    },
  });
  const controller = new CreationSessionController(
    () => ({ client: runtimeClient, providerAvailable: true, generation: 4 }),
    async () => undefined,
  );

  await controller.create({ targetType: "MINI_PROJECT", primarySource: { kind: "BLANK" } });

  assert.deepEqual(calls, ["create:creation-session-create"]);
  assert.equal(controller.snapshot().status, "ready");
  assert.equal(controller.snapshot().session?.rounds.length, 0);
  assert.match(controller.snapshot().notice ?? "", /核对来源范围/);
  assert.equal(controller.snapshot().sessions[0]?.sessionId, created.sessionId);
});

test("resume rechecks Graph sources and preserves a visible bounded drift summary", async () => {
  const source: CreationSessionSource = {
    sourceId: "source-page", role: "PRIMARY", kind: "PAGE", externalId: "page-one", pageName: "来源页", currentCaptureId: "capture-page", latestKnownHash: "hash-old", availability: "AVAILABLE",
    captures: [{ captureId: "capture-page", reason: "SESSION_START", snapshotHash: "hash-old", content: "原材料", hierarchy: [{ nodeId: "block-one", text: "原材料", order: 0, depth: 0, relation: "ROOT" }], capturedAt: at.toISOString() }],
  };
  const current = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: source, sessionId: "creation-source-resume" }, at);
  const changed: CreationSession = { ...current, version: 2, updatedAt: "2026-08-02T06:01:00.000Z", sources: [{ ...source, latestKnownHash: "hash-new", availability: "CHANGED", changeSummary: { added: 1, modified: 0, deleted: 0 } }] };
  const runtimeClient = client({
    getCreationSession: async () => current,
    checkCreationSessionSource: async (_sessionId, sourceId, input) => {
      assert.equal(sourceId, source.sourceId);
      assert.equal(input.expectedVersion, 1);
      return { session: changed, replayed: false };
    },
  });
  const controller = new CreationSessionController(() => ({ client: runtimeClient, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.resume(current.sessionId);
  assert.equal(controller.snapshot().session?.sources[0]?.availability, "CHANGED");
  assert.deepEqual(controller.snapshot().session?.sources[0]?.changeSummary, { added: 1, modified: 0, deleted: 0 });
  assert.match(controller.snapshot().notice ?? "", /1 个来源需要处理/);
});

test("resume keeps terminal creation history read-only without observing Graph sources", async () => {
  const source: CreationSessionSource = {
    sourceId: "source-page", role: "PRIMARY", kind: "PAGE", externalId: "page-one", pageName: "来源页", currentCaptureId: "capture-page", latestKnownHash: "hash-old", availability: "AVAILABLE",
    captures: [{ captureId: "capture-page", reason: "SESSION_START", snapshotHash: "hash-old", content: "原材料", hierarchy: [], capturedAt: at.toISOString() }],
  };
  const active = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: source, sessionId: "creation-terminal" }, at);
  const created: CreationSession = { ...active, status: "CREATED", creationResult: { objectId: "object-created", semanticCommitId: "proposal-commit:created", createdAt: at.toISOString() } };
  let checked = false;
  const runtimeClient = client({
    getCreationSession: async () => created,
    checkCreationSessionSource: async () => { checked = true; throw new Error("terminal source must not be observed"); },
  });
  const controller = new CreationSessionController(() => ({ client: runtimeClient, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.resume(created.sessionId);
  assert.equal(checked, false);
  assert.equal(controller.snapshot().session?.status, "CREATED");
  assert.equal(controller.snapshot().view, "HISTORY");
  assert.match(controller.snapshot().notice ?? "", /只读会话历史/);
});

test("keeps persisted answers and the stable session when Provider completion fails", async () => {
  const current = withRound();
  const requesting = submitCreationRoundAnswers(current, "round-one", [
    { questionId: "q-outcome", answerState: "ANSWERED", userAnswer: "形成可验证的告警接入" },
    { questionId: "q-evidence", answerState: "UNCERTAIN", userAnswer: "还需要真实演练" },
  ], current.version, new Date("2026-08-02T06:01:00.000Z"));
  const failed = failCreationRound(requesting, "round-one", "FAILED", requesting.version, new Date("2026-08-02T06:02:00.000Z"));
  const runtimeClient = client({
    getCreationSession: async () => current,
    submitCreationSessionRound: async () => ({ session: failed, replayed: false, providerStatus: "FAILED", error: { code: "LLM_TIMEOUT", message: "智能整理没有完成；回答已保存。" } }),
  });
  const controller = new CreationSessionController(
    () => ({ client: runtimeClient, providerAvailable: true, generation: 1 }),
    async () => undefined,
  );
  await controller.resume(current.sessionId);
  await controller.submitAnswers([
    { questionId: "q-outcome", answerState: "ANSWERED", userAnswer: "形成可验证的告警接入" },
    { questionId: "q-evidence", answerState: "UNCERTAIN", userAnswer: "还需要真实演练" },
  ]);

  const state = controller.snapshot();
  assert.equal(state.status, "ready");
  assert.match(state.error ?? "", /回答已保存/);
  assert.equal(state.session?.rounds[0]?.questions[0]?.userAnswer, "形成可验证的告警接入");
  assert.equal(state.session?.rounds[0]?.providerStatus, "FAILED");
});

test("renders Creation Session Validator failures as retryable Provider errors", async () => {
  const current = session();
  const runtimeClient = client({
    getCreationSession: async () => current,
    startCreationSessionRound: async () => {
      throw new StructuredError({
        code: "SERVICE_HTTP_ERROR",
        message: "Provider 输出未通过 Creation Session Validator。",
        ruleRefs: ["CREATION-SESSION-001"],
        details: { status: 422, remoteCode: "CREATION_ROUND_VALIDATION_FAILED", validationCategory: "SHAPE" },
      });
    },
  });
  const controller = new CreationSessionController(() => ({ client: runtimeClient, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.resume(current.sessionId);
  await controller.startRound();
  assert.match(controller.snapshot().error ?? "", /智能整理暂时不可用/);
  assert.equal(controller.snapshot().session?.version, current.version);
});

test("preparing a formal proposal keeps the same proposal in the in-session action surface", async () => {
  const current = session();
  const record = {
    updatedAt: "2026-08-02T06:30:00.000Z",
    files: { proposalMd: "# 正式方案", proposalJson: "{}" },
    proposal: {
      proposalId: "proposal-session-ui",
      groups: [{ groupId: "create-from-session" }],
    },
  } as never;
  const runtimeClient = client({
    getCreationSession: async () => current,
    createCreationSessionProposal: async () => ({ session: current, record, replayed: false }),
  });
  const controller = new CreationSessionController(() => ({ client: runtimeClient, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.resume(current.sessionId);
  await controller.prepareProposal();
  assert.deepEqual(controller.snapshot().proposal, {
    proposalId: "proposal-session-ui",
    updatedAt: "2026-08-02T06:30:00.000Z",
    groupId: "create-from-session",
  });
  assert.match(controller.snapshot().notice ?? "", /不需要再到审阅中心重复确认/);
});

test("submits one whole-round narrative while keeping per-question states unanswered", async () => {
  const current = withRound();
  let observedNarrative = "";
  const runtimeClient = client({
    getCreationSession: async () => current,
    submitCreationSessionRound: async (_sessionId, _roundId, input) => {
      observedNarrative = input.narrativeAnswer ?? "";
      assert.deepEqual(input.answers.map(({ answerState }) => answerState), ["UNANSWERED", "UNANSWERED"]);
      const requesting = submitCreationRoundAnswers(current, "round-one", input.answers, current.version, new Date("2026-08-02T06:01:00.000Z"), input.narrativeAnswer);
      return { session: requesting, replayed: false, providerStatus: "FAILED" };
    },
  });
  const controller = new CreationSessionController(() => ({ client: runtimeClient, providerAvailable: true, generation: 1 }), async () => undefined);
  await controller.resume(current.sessionId);
  await controller.submitNarrativeAnswer("先跑通一条真实告警，完成证据用恢复演练。");
  assert.equal(observedNarrative, "先跑通一条真实告警，完成证据用恢复演练。");
  assert.equal(controller.snapshot().session?.rounds[0]?.userNarrativeAnswer, observedNarrative);
});

test("drops a response from an obsolete Local Service generation", async () => {
  let resolveList: ((sessions: CreationSession[]) => void) | undefined;
  const oldClient = client({ listCreationSessions: () => new Promise((resolve) => { resolveList = resolve; }) });
  let runtime: CreationSessionRuntime = { client: oldClient, providerAvailable: true, generation: 1 };
  const controller = new CreationSessionController(() => runtime, async () => undefined);
  const pending = controller.loadActive();
  await Promise.resolve();
  runtime = { client: client(), providerAvailable: true, generation: 2 };
  resolveList?.([session()]);
  await pending;

  assert.equal(controller.snapshot().sessions.length, 0);
  assert.equal(controller.snapshot().status, "loading");
});
