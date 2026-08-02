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
    startCreationSessionRound: unsupported,
    submitCreationSessionRound: unsupported,
    retryCreationSessionRound: unsupported,
    generateCreationSessionDraft: unsupported,
    editCreationSessionDraft: unsupported,
    adoptCreationSessionDraft: unsupported,
    abandonCreationSession: unsupported,
    ...overrides,
  } as CreationSessionClient;
}

test("creates a durable session before requesting the first Provider round", async () => {
  const created = session();
  const started = withRound(created);
  const calls: string[] = [];
  const runtimeClient = client({
    createCreationSession: async (input) => {
      calls.push(`create:${input.idempotencyKey.split(":")[0]}`);
      return { session: created, replayed: false };
    },
    startCreationSessionRound: async (_sessionId, input) => {
      calls.push(`round:${input.expectedVersion}`);
      return { session: started, replayed: false, providerStatus: "COMPLETED" };
    },
  });
  const controller = new CreationSessionController(
    () => ({ client: runtimeClient, providerAvailable: true, generation: 4 }),
    async () => undefined,
  );

  await controller.create({ targetType: "MINI_PROJECT", primarySource: { kind: "BLANK" } });

  assert.deepEqual(calls, ["create:creation-session-create", "round:1"]);
  assert.equal(controller.snapshot().status, "ready");
  assert.equal(controller.snapshot().session?.rounds[0]?.providerStatus, "NOT_REQUESTED");
  assert.equal(controller.snapshot().sessions[0]?.sessionId, created.sessionId);
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
