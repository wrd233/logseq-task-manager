import type {
  ServiceInteractionDisposition,
  ServiceInteractionEvidenceSummary,
  ServiceProjectContextRecoveryResult,
} from "@task-copilot/service-client";

import type { PluginProjectReentryCard, PluginReentryRoute } from "./reentry-runtime.ts";

export type PluginProjectContextRecoveryState =
  | { status: "loading"; expectedVersion: number }
  | { status: "ready"; expectedVersion: number; result: ServiceProjectContextRecoveryResult; userDisposition?: ServiceInteractionDisposition | undefined; feedbackBusy?: boolean; feedbackError?: string | undefined; summary?: ServiceInteractionEvidenceSummary }
  | { status: "error"; expectedVersion: number; message: string };

export interface ProjectContextRecoveryClient {
  listObjects(): Promise<Array<{ objectId: string; objectType: string; version: number }>>;
  recoverProjectContext?(input: { objectId: string; expectedVersion: number }): Promise<ServiceProjectContextRecoveryResult>;
  setUxInteractionDisposition?(interactionId: string, disposition?: ServiceInteractionDisposition): Promise<{ userDisposition: ServiceInteractionDisposition | null; summary: ServiceInteractionEvidenceSummary }>;
}

export interface ProjectContextRecoveryRuntime {
  client?: ProjectContextRecoveryClient;
  providerAvailable: boolean;
  generation: number;
}

function message(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.length <= 500 ? value : `${value.slice(0, 499)}…`;
}

function requireCurrentProject(
  objects: Awaited<ReturnType<ProjectContextRecoveryClient["listObjects"]>>,
  objectId: string,
  expectedVersion: number,
): void {
  const object = objects.find((value) => value.objectId === objectId);
  if (!object || object.objectType !== "PROJECT") {
    throw new Error("Project 已变化或不存在；没有生成 Copilot 恢复草稿。");
  }
  if (object.version !== expectedVersion) {
    throw new Error("Project 已变化；请基于当前确定性重入卡重新生成。");
  }
}

export class ProjectContextRecoveryController {
  private readonly states = new Map<string, PluginProjectContextRecoveryState>();
  private epoch = 0;

  constructor(
    private readonly runtime: () => ProjectContextRecoveryRuntime,
    private readonly onStateChange: () => Promise<void>,
  ) {}

  snapshot(): Record<string, PluginProjectContextRecoveryState> {
    return Object.fromEntries(this.states);
  }

  clear(): void {
    this.epoch += 1;
    this.states.clear();
  }

  async generate(objectId: string, expectedVersion: number): Promise<void> {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)
      || !Number.isSafeInteger(expectedVersion)
      || expectedVersion < 1
    ) {
      throw new Error("Project 恢复上下文已失效；没有调用 Provider。");
    }
    if (this.states.get(objectId)?.status === "loading") return;
    const started = this.runtime();
    if (!started.client || !started.client.recoverProjectContext || !started.providerAvailable) {
      this.states.set(objectId, {
        status: "error",
        expectedVersion,
        message: "Local Service Provider 未启用或正在重连；没有生成恢复草稿。",
      });
      await this.onStateChange();
      return;
    }
    const epoch = this.epoch;
    const recoverProjectContext = started.client.recoverProjectContext.bind(started.client);
    this.states.set(objectId, { status: "loading", expectedVersion });
    await this.onStateChange();
    try {
      requireCurrentProject(await started.client.listObjects(), objectId, expectedVersion);
      const result = await recoverProjectContext({ objectId, expectedVersion });
      const current = this.runtime();
      if (epoch !== this.epoch) return;
      if (
        current.client !== started.client
        || current.generation !== started.generation
        || !current.providerAvailable
      ) {
        throw new Error("Local Service 已在生成期间重连；旧恢复草稿已丢弃。");
      }
      requireCurrentProject(await started.client.listObjects(), objectId, expectedVersion);
      this.states.set(objectId, { status: "ready", expectedVersion, result });
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.states.set(objectId, { status: "error", expectedVersion, message: message(error) });
    }
    await this.onStateChange();
  }

  async setDisposition(objectId: string, interactionId: string, disposition?: ServiceInteractionDisposition): Promise<void> {
    const state = this.states.get(objectId);
    const started = this.runtime();
    if (state?.status !== "ready" || state.result.interactionId !== interactionId || !started.client?.setUxInteractionDisposition) {
      throw new Error("这条恢复草稿反馈已失效；没有记录处置。");
    }
    if (state.feedbackBusy) return;
    const epoch = this.epoch;
    this.states.set(objectId, { ...state, feedbackBusy: true, feedbackError: undefined });
    await this.onStateChange();
    try {
      const result = await started.client.setUxInteractionDisposition(interactionId, disposition);
      const current = this.runtime();
      if (epoch !== this.epoch) return;
      if (current.client !== started.client || current.generation !== started.generation) throw new Error("Service 已重连；旧反馈 session 已失效。");
      const latest = this.states.get(objectId);
      if (latest?.status !== "ready" || latest.result.interactionId !== interactionId) return;
      this.states.set(objectId, {
        ...latest,
        feedbackBusy: false,
        feedbackError: undefined,
        ...(result.userDisposition ? { userDisposition: result.userDisposition } : { userDisposition: undefined }),
        summary: result.summary,
      });
    } catch (error) {
      if (epoch !== this.epoch) return;
      const latest = this.states.get(objectId);
      if (latest?.status === "ready" && latest.result.interactionId === interactionId) {
        this.states.set(objectId, { ...latest, feedbackBusy: false, feedbackError: message(error) });
      }
    }
    await this.onStateChange();
  }
}

export function resolveProjectContextRecoveryRoute(
  state: PluginProjectContextRecoveryState | undefined,
  card: PluginProjectReentryCard,
): PluginReentryRoute | undefined {
  if (
    state?.status !== "ready"
    || state.expectedVersion !== card.project.version
    || !state.result.output.nextActionEligible
    || !state.result.output.nextAction
    || !card.primaryRoute
  ) return undefined;
  const { nextAction } = state.result.output;
  const projectionAction = card.projection.primaryAction;
  if (
    nextAction.intent === "OPEN_SOURCE"
    && projectionAction?.intent === "OPEN_PRIMARY_ANCHOR"
    && nextAction.targetRef === `anchor:${projectionAction.targetAnchorId}`
    && card.primaryRoute.action === "v2-open-primary-anchor"
  ) return card.primaryRoute;
  if (
    nextAction.intent === "OPEN_REVIEW"
    && projectionAction?.intent === "OPEN_RECOVERY_DETAILS"
    && nextAction.targetRef === `commit:${projectionAction.targetCommitId}`
    && card.primaryRoute.action === "view"
  ) return card.primaryRoute;
  return undefined;
}
