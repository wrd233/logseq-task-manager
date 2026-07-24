import type {
  ServiceMiniProjectGrillRequest,
  ServiceMiniProjectGrillPreviewResult,
  ServiceMiniProjectGrillResult,
  ServiceMiniProjectGrillProposalResult,
} from "@task-copilot/service-client";
import { miniProjectRestructureHasStructuralChange } from "@task-copilot/application";

export type MiniProjectGrillAnswer = ServiceMiniProjectGrillRequest["answers"][number];
export type PluginMiniProjectGrillPreviewState =
  | { status: "loading" }
  | { status: "ready"; result: ServiceMiniProjectGrillPreviewResult; proposal?: { status: "loading" } | { status: "ready"; result: ServiceMiniProjectGrillProposalResult } | { status: "not-needed"; message: string } | { status: "error"; message: string } }
  | { status: "error"; message: string };

export type PluginMiniProjectGrillState =
  | { status: "loading"; expectedVersion: number; answers: MiniProjectGrillAnswer[]; previous?: ServiceMiniProjectGrillResult }
  | { status: "ready"; expectedVersion: number; answers: MiniProjectGrillAnswer[]; result: ServiceMiniProjectGrillResult; preview?: PluginMiniProjectGrillPreviewState }
  | { status: "error"; expectedVersion: number; answers: MiniProjectGrillAnswer[]; retryAnswers?: MiniProjectGrillAnswer[]; message: string; previous?: ServiceMiniProjectGrillResult }
  | { status: "stale"; expectedVersion: number; message: string };

export interface MiniProjectGrillClient {
  listObjects(): Promise<Array<{ objectId: string; objectType: string; lifecycle?: string; version: number }>>;
  grillMiniProject?(input: ServiceMiniProjectGrillRequest): Promise<ServiceMiniProjectGrillResult>;
  previewMiniProjectGrill?(input: ServiceMiniProjectGrillRequest): Promise<ServiceMiniProjectGrillPreviewResult>;
  createMiniProjectRestructureProposal?(input: { objectId: string; expectedVersion: number; previewHandle: string }): Promise<ServiceMiniProjectGrillProposalResult>;
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

function serviceErrorCode(error: unknown): string | undefined {
  const remoteCode = error && typeof error === "object" && "details" in error
    ? (error as { details?: { remoteCode?: unknown } }).details?.remoteCode
    : undefined;
  return typeof remoteCode === "string" ? remoteCode : undefined;
}

function staleServiceError(error: unknown): boolean {
  return ["V2_OBJECT_VERSION_CONFLICT", "GRILL_SOURCE_STALE", "GRILL_OPEN_MINI_PROJECT_REQUIRED", "V2_OBJECT_NOT_FOUND"].includes(serviceErrorCode(error) ?? "");
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

  async generatePreview(objectId: string): Promise<void> {
    const state = this.states.get(objectId);
    const started = this.runtime();
    if (state?.status !== "ready" || state.result.output.readiness !== "READY_FOR_PREVIEW") throw new Error("MiniProject 尚未具备结构预览条件；没有调用 Provider。");
    if (state.preview?.status === "loading") return;
    const optionalClient = started.client;
    const optionalPreview = optionalClient?.previewMiniProjectGrill;
    if (!optionalClient || !optionalPreview || !started.providerAvailable) {
      this.states.set(objectId, { ...state, preview: { status: "error", message: "Local Service Preview Provider 未启用或正在重连；没有生成结构预览。" } });
      await this.onStateChange();
      return;
    }
    const epoch = this.epoch;
    const client = optionalClient;
    const previewMiniProjectGrill = optionalPreview.bind(client);
    this.states.set(objectId, { ...state, preview: { status: "loading" } });
    await this.onStateChange();
    try {
      requireCurrentMiniProject(await client.listObjects(), objectId, state.expectedVersion);
      const result = await previewMiniProjectGrill({ objectId, expectedVersion: state.expectedVersion, answers: state.answers });
      const current = this.runtime();
      if (epoch !== this.epoch) return;
      if (current.client !== started.client || current.generation !== started.generation || !current.providerAvailable) throw new StaleGrillSessionError("Local Service 已在预览期间重连；旧结构预览已丢弃。");
      requireCurrentMiniProject(await client.listObjects(), objectId, state.expectedVersion);
      const latest = this.states.get(objectId);
      if (latest?.status !== "ready") return;
      this.states.set(objectId, {
        ...latest,
        preview: {
          status: "ready",
          result,
          ...(!miniProjectRestructureHasStructuralChange(result.output)
            ? { proposal: { status: "not-needed" as const, message: "当前材料已经处于预览结构，无需创建 Proposal 或改动正文。" } }
            : {}),
        },
      });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error instanceof StaleGrillSessionError || staleServiceError(error)) {
        this.states.set(objectId, { status: "stale", expectedVersion: state.expectedVersion, message: boundedMessage(error) });
      } else {
        const latest = this.states.get(objectId);
        if (latest?.status === "ready") this.states.set(objectId, { ...latest, preview: { status: "error", message: boundedMessage(error) } });
      }
    }
    await this.onStateChange();
  }

  async createProposal(objectId: string): Promise<ServiceMiniProjectGrillProposalResult | undefined> {
    const state = this.states.get(objectId);
    const preview = state?.status === "ready" && state.preview?.status === "ready" ? state.preview : undefined;
    const started = this.runtime();
    const optionalCreate = started.client?.createMiniProjectRestructureProposal;
    if (!state || state.status !== "ready" || !preview) throw new Error("结构预览已失效；请重新生成后再进入审阅。");
    if (preview.proposal?.status === "loading") return undefined;
    if (preview.proposal?.status === "not-needed" || !miniProjectRestructureHasStructuralChange(preview.result.output)) return undefined;
    if (!started.client || !optionalCreate) {
      this.states.set(objectId, { ...state, preview: { ...preview, proposal: { status: "error", message: "Local Service 尚未提供结构 Proposal；没有写入审阅队列。" } } });
      await this.onStateChange();
      return undefined;
    }
    const epoch = this.epoch;
    const client = started.client;
    const create = optionalCreate.bind(client);
    this.states.set(objectId, { ...state, preview: { ...preview, proposal: { status: "loading" } } });
    await this.onStateChange();
    try {
      requireCurrentMiniProject(await client.listObjects(), objectId, state.expectedVersion);
      const result = await create({ objectId, expectedVersion: state.expectedVersion, previewHandle: preview.result.previewHandle });
      const current = this.runtime();
      if (epoch !== this.epoch) return undefined;
      if (current.client !== started.client || current.generation !== started.generation) throw new StaleGrillSessionError("Local Service 已在创建 Proposal 期间重连；请重新生成结构预览。");
      requireCurrentMiniProject(await client.listObjects(), objectId, state.expectedVersion);
      const latest = this.states.get(objectId);
      if (latest?.status === "ready" && latest.preview?.status === "ready") this.states.set(objectId, { ...latest, preview: { ...latest.preview, proposal: { status: "ready", result } } });
      await this.onStateChange();
      return result;
    } catch (error) {
      if (epoch !== this.epoch) return undefined;
      if (serviceErrorCode(error) === "GRILL_PREVIEW_SESSION_EXPIRED") {
        const latest = this.states.get(objectId);
        if (latest?.status === "ready") {
          this.states.set(objectId, {
            ...latest,
            preview: {
              status: "error",
              message: "Local Service 会话已恢复；请重新生成结构预览，已确认的讨论答案仍保留。",
            },
          });
        }
      } else if (error instanceof StaleGrillSessionError || staleServiceError(error)) this.states.set(objectId, { status: "stale", expectedVersion: state.expectedVersion, message: boundedMessage(error) });
      else {
        const latest = this.states.get(objectId);
        if (latest?.status === "ready" && latest.preview?.status === "ready") this.states.set(objectId, { ...latest, preview: { ...latest.preview, proposal: { status: "error", message: boundedMessage(error) } } });
      }
      await this.onStateChange();
      return undefined;
    }
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
      if (error instanceof StaleGrillSessionError || staleServiceError(error)) {
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
