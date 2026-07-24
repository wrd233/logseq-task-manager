import type {
  ServiceMiniProjectGrillRequest,
  ServiceMiniProjectGrillResult,
} from "@task-copilot/service-client";

export type MiniProjectGrillAnswer = ServiceMiniProjectGrillRequest["answers"][number];

export type PluginMiniProjectGrillState =
  | { status: "loading"; expectedVersion: number; answers: MiniProjectGrillAnswer[]; previous?: ServiceMiniProjectGrillResult }
  | { status: "ready"; expectedVersion: number; answers: MiniProjectGrillAnswer[]; result: ServiceMiniProjectGrillResult }
  | { status: "error"; expectedVersion: number; answers: MiniProjectGrillAnswer[]; retryAnswers?: MiniProjectGrillAnswer[]; message: string; previous?: ServiceMiniProjectGrillResult }
  | { status: "stale"; expectedVersion: number; message: string };

export interface MiniProjectGrillClient {
  listObjects(): Promise<Array<{ objectId: string; objectType: string; lifecycle?: string; version: number }>>;
  grillMiniProject?(input: ServiceMiniProjectGrillRequest): Promise<ServiceMiniProjectGrillResult>;
}

export interface MiniProjectGrillRuntime {
  client?: MiniProjectGrillClient;
  providerAvailable: boolean;
  generation: number;
}

class StaleGrillSessionError extends Error {}

function boundedMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.length <= 500 ? value : `${value.slice(0, 499)}…`;
}

function requireCurrentMiniProject(
  objects: Awaited<ReturnType<MiniProjectGrillClient["listObjects"]>>,
  objectId: string,
  expectedVersion: number,
): void {
  const object = objects.find((value) => value.objectId === objectId);
  if (!object || object.objectType !== "MINI_PROJECT") {
    throw new StaleGrillSessionError("MiniProject 已变化或不存在；旧讨论已失效，没有调用 Provider。");
  }
  if (object.lifecycle !== "OPEN" || object.version !== expectedVersion) {
    throw new StaleGrillSessionError("MiniProject 已变化或关闭；旧讨论已失效，请从当前对象重新开始。");
  }
}

function currentResult(state: PluginMiniProjectGrillState | undefined): ServiceMiniProjectGrillResult | undefined {
  if (state?.status === "ready") return state.result;
  if (state?.status === "loading" || state?.status === "error") return state.previous;
  return undefined;
}

export class MiniProjectGrillController {
  private readonly states = new Map<string, PluginMiniProjectGrillState>();
  private epoch = 0;

  constructor(
    private readonly runtime: () => MiniProjectGrillRuntime,
    private readonly onStateChange: () => Promise<void>,
  ) {}

  snapshot(): Record<string, PluginMiniProjectGrillState> {
    return Object.fromEntries(this.states);
  }

  clear(objectId?: string): void {
    this.epoch += 1;
    if (objectId) this.states.delete(objectId);
    else this.states.clear();
  }

  async start(objectId: string, expectedVersion: number): Promise<void> {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)
      || !Number.isSafeInteger(expectedVersion)
      || expectedVersion < 1
    ) throw new Error("MiniProject 讨论上下文已失效；没有调用 Provider。");
    if (this.states.get(objectId)?.status === "loading") return;
    this.epoch += 1;
    this.states.clear();
    await this.requestTurn(objectId, expectedVersion, [], undefined);
  }

  async answer(text: string): Promise<void> {
    const entries = [...this.states.entries()];
    const active = entries.length === 1 ? entries[0] : undefined;
    const state = active?.[1];
    if (!active || state?.status !== "ready" || !state.result.output.questionGroup) {
      throw new Error("当前问题已失效；没有调用 Provider。");
    }
    const answer = text.trim();
    if (!answer || answer.length > 4_000) throw new Error("请填写 1–4000 字的本轮回答；没有调用 Provider。");
    const nextAnswers = [...state.answers, {
      uncertaintyId: state.result.output.questionGroup.focusUncertaintyId,
      text: answer,
    }];
    await this.requestTurn(active[0], state.expectedVersion, nextAnswers, state.result, state.answers);
  }

  async retry(objectId: string): Promise<void> {
    const state = this.states.get(objectId);
    if (!state || state.status === "loading" || state.status === "stale") {
      throw new Error("当前 MiniProject 讨论无法重试；请重新开始。");
    }
    const previous = currentResult(state);
    await this.requestTurn(objectId, state.expectedVersion, state.status === "error" ? state.retryAnswers ?? state.answers : state.answers, previous, state.answers);
  }

  private async requestTurn(
    objectId: string,
    expectedVersion: number,
    requestedAnswers: MiniProjectGrillAnswer[],
    previous?: ServiceMiniProjectGrillResult,
    confirmedAnswers: MiniProjectGrillAnswer[] = requestedAnswers,
  ): Promise<void> {
    const started = this.runtime();
    const optionalClient = started.client;
    const optionalGrillMiniProject = optionalClient?.grillMiniProject;
    if (!optionalClient || !optionalGrillMiniProject || !started.providerAvailable) {
      this.states.set(objectId, {
        status: "error",
        expectedVersion,
        answers: confirmedAnswers,
        retryAnswers: requestedAnswers,
        message: "Local Service Grill Provider 未启用或正在重连；没有生成新一轮讨论。",
        ...(previous ? { previous } : {}),
      });
      await this.onStateChange();
      return;
    }
    const epoch = this.epoch;
    const client = optionalClient;
    const grillMiniProject = optionalGrillMiniProject.bind(client);
    this.states.set(objectId, {
      status: "loading",
      expectedVersion,
      answers: confirmedAnswers,
      ...(previous ? { previous } : {}),
    });
    await this.onStateChange();
    try {
      requireCurrentMiniProject(await client.listObjects(), objectId, expectedVersion);
      const result = await grillMiniProject({ objectId, expectedVersion, answers: requestedAnswers });
      const current = this.runtime();
      if (epoch !== this.epoch) return;
      if (
        current.client !== started.client
        || current.generation !== started.generation
        || !current.providerAvailable
      ) throw new StaleGrillSessionError("Local Service 已在讨论期间重连；旧回答和草稿已丢弃。");
      requireCurrentMiniProject(await client.listObjects(), objectId, expectedVersion);
      this.states.set(objectId, { status: "ready", expectedVersion, answers: requestedAnswers, result });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error instanceof StaleGrillSessionError) {
        this.states.set(objectId, { status: "stale", expectedVersion, message: boundedMessage(error) });
      } else {
        this.states.set(objectId, {
          status: "error",
          expectedVersion,
          answers: confirmedAnswers,
          retryAnswers: requestedAnswers,
          message: boundedMessage(error),
          ...(previous ? { previous } : {}),
        });
      }
    }
    await this.onStateChange();
  }
}
