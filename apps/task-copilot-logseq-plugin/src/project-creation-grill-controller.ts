import type {
  ServiceProjectCreationGrillRequest,
  ServiceProjectCreationGrillResult,
  ServiceProjectCreationPreviewResult,
  ServiceProjectCreationProposalResult,
} from "@task-copilot/service-client";

export type ProjectCreationSource =
  ServiceProjectCreationGrillRequest extends infer Request
    ? Request extends ServiceProjectCreationGrillRequest
      ? Omit<Request, "answers">
      : never
    : never;
export type ProjectCreationAnswer = ServiceProjectCreationGrillRequest["answers"][number];
export type PluginProjectCreationPreviewState =
  | { status: "loading" }
  | { status: "ready"; result: ServiceProjectCreationPreviewResult; proposal?: { status: "loading" } | { status: "ready"; result: ServiceProjectCreationProposalResult } | { status: "error"; message: string } }
  | { status: "error"; message: string };
export type PluginProjectCreationGrillState =
  | { status: "loading"; source: ProjectCreationSource; answers: ProjectCreationAnswer[]; previous?: ServiceProjectCreationGrillResult }
  | { status: "ready"; source: ProjectCreationSource; answers: ProjectCreationAnswer[]; result: ServiceProjectCreationGrillResult; preview?: PluginProjectCreationPreviewState }
  | { status: "error"; source: ProjectCreationSource; answers: ProjectCreationAnswer[]; retryAnswers?: ProjectCreationAnswer[]; message: string; retryable: boolean; previous?: ServiceProjectCreationGrillResult }
  | { status: "stale"; source: ProjectCreationSource; answers: ProjectCreationAnswer[]; message: string };

export interface ProjectCreationGrillClient {
  grillProjectCreation?(input: ServiceProjectCreationGrillRequest): Promise<ServiceProjectCreationGrillResult>;
  previewProjectCreation?(input: ServiceProjectCreationGrillRequest): Promise<ServiceProjectCreationPreviewResult>;
  createProjectCreationProposal?(input: { previewHandle: string }): Promise<ServiceProjectCreationProposalResult>;
}

export interface ProjectCreationGrillRuntime {
  client?: ProjectCreationGrillClient;
  providerAvailable: boolean;
  generation: number;
}

function sourceKey(source: ProjectCreationSource): string {
  return source.sourceKind === "BLANK" ? "BLANK"
    : source.sourceKind === "PAGE" ? `PAGE:${source.pageId}`
    : `MINI_PROJECT:${source.objectId}:${source.expectedVersion}`;
}

function serviceErrorCode(error: unknown): string | undefined {
  const remoteCode = error && typeof error === "object" && "details" in error
    ? (error as { details?: { remoteCode?: unknown } }).details?.remoteCode
    : undefined;
  return typeof remoteCode === "string" ? remoteCode : undefined;
}

function staleError(error: unknown): boolean {
  return ["V2_OBJECT_VERSION_CONFLICT", "GRILL_SOURCE_STALE", "V2_OBJECT_NOT_FOUND", "V2_PROJECT_CREATION_SOURCE_ANCHOR_STALE"].includes(serviceErrorCode(error) ?? "");
}

function previewExpiredError(error: unknown): boolean {
  return serviceErrorCode(error) === "PROJECT_CREATION_PREVIEW_SESSION_EXPIRED";
}

function relationshipReviewError(error: unknown): boolean {
  return serviceErrorCode(error) === "PROJECT_CREATION_RELATIONSHIP_REVIEW_REQUIRED";
}

function staleMessage(error: unknown): string {
  const code = serviceErrorCode(error);
  if (code === "V2_OBJECT_VERSION_CONFLICT") return "来源正式事项已变化；旧结果已作废，请基于最新内容重新检查。";
  if (code === "V2_OBJECT_NOT_FOUND") return "来源正式事项已不存在；旧结果已作废。";
  if (code === "V2_PROJECT_CREATION_SOURCE_ANCHOR_STALE") return "来源正文连接已变化；旧结果已作废，请基于最新内容重新检查。";
  return "来源内容已变化；旧结果已作废，请基于最新内容重新检查。";
}

function userFailure(error: unknown, phase: "TURN" | "PREVIEW" | "REVIEW"): string {
  const code = serviceErrorCode(error);
  if (code?.startsWith("LLM_")) {
    return "智能分析暂不可用；请稍后重试。页面、回答和正式事项均未改变。";
  }
  if (phase === "TURN") return "这轮讨论没有完成；回答没有保存，也没有创建正式事项。请重试。";
  if (phase === "PREVIEW") return "最终阅读预览没有生成；页面和正式事项均未改变。请重试。";
  return "待确认建议没有建立；页面和正式事项均未改变。请重试。";
}

function turnFailure(error: unknown): { message: string; retryable: boolean } {
  const code = serviceErrorCode(error);
  if (code === "PROJECT_CREATION_SOURCE_TOO_LARGE") {
    return {
      message: "当前来源内容较多，无法完整梳理。页面、回答和正式事项均未改变。请返回并从较小页面或空白 Project 入口继续。",
      retryable: false,
    };
  }
  if (code === "PROJECT_CREATION_SOURCE_EMPTY") {
    return {
      message: "当前来源没有足够的可读材料。页面、回答和正式事项均未改变。请返回补充材料，或从空白 Project 入口继续。",
      retryable: false,
    };
  }
  return { message: userFailure(error, "TURN"), retryable: true };
}

function requestRelationshipClarification(
  result: ServiceProjectCreationGrillResult,
  source: ProjectCreationSource,
): ServiceProjectCreationGrillResult {
  if (source.sourceKind !== "PAGE") throw new Error("Only a Page source can require a user relationship decision.");
  const uncertaintyId = "page-object-relationship";
  return {
    ...result,
    output: {
      ...result.output,
      readiness: "CONTINUE",
      unknowns: [
        ...result.output.unknowns.filter((item) => item.uncertaintyId !== uncertaintyId),
        { uncertaintyId, dimension: "PAGE_OBJECT_RELATIONSHIP", text: "Page 与正式 Project 的关系仍需明确。" },
      ],
      questionGroup: {
        focusUncertaintyId: uncertaintyId,
        questions: [{ uncertaintyId, text: "当前 Page 应保留为来源并另建 Project 页面，还是直接作为 Project 页面继续使用？" }],
        recommendation: {
          text: "材料边界尚不稳定时，建议保留当前 Page 作为来源并另建 Project 页面；若当前 Page 已经就是唯一工作现场，再选择直接复用。",
          evidenceRefs: [...result.output.evidenceScope.refs],
          tradeoffs: ["保留来源更安全；复用当前 Page 的操作距离更短"],
        },
      },
    },
  };
}

function request(source: ProjectCreationSource, answers: ProjectCreationAnswer[]): ServiceProjectCreationGrillRequest {
  return { ...source, answers } as ServiceProjectCreationGrillRequest;
}

export class ProjectCreationGrillController {
  private readonly states = new Map<string, PluginProjectCreationGrillState>();
  private epoch = 0;

  constructor(
    private readonly runtime: () => ProjectCreationGrillRuntime,
    private readonly onStateChange: () => Promise<void>,
  ) {}

  snapshot(): Record<string, PluginProjectCreationGrillState> {
    return Object.fromEntries(this.states);
  }

  clear(): void {
    this.epoch += 1;
    this.states.clear();
  }

  async start(source: ProjectCreationSource): Promise<string> {
    const key = sourceKey(source);
    if (this.states.get(key)?.status === "loading") return key;
    this.epoch += 1;
    this.states.clear();
    await this.requestTurn(key, source, [], undefined);
    return key;
  }

  async answer(key: string, text: string): Promise<void> {
    const state = this.states.get(key);
    if (state?.status !== "ready" || !state.result.output.questionGroup) throw new Error("当前 Project 问题已失效；没有发送分析请求。");
    const answer = text.trim();
    if (!answer || answer.length > 4_000) throw new Error("请填写 1–4000 字的本轮回答；没有发送分析请求。");
    const uncertaintyId = state.result.output.questionGroup.focusUncertaintyId;
    const answers = [
      ...state.answers.filter((item) => item.uncertaintyId !== uncertaintyId),
      { uncertaintyId, text: answer },
    ];
    await this.requestTurn(key, state.source, answers, state.result, state.answers);
  }

  async retry(key: string): Promise<void> {
    const state = this.states.get(key);
    if (!state || state.status === "loading" || state.status === "stale" || (state.status === "error" && !state.retryable)) throw new Error("当前 Project 讨论无法重试；请重新开始。");
    const previous = state.status === "ready" ? state.result : state.previous;
    await this.requestTurn(key, state.source, state.status === "error" ? state.retryAnswers ?? state.answers : state.answers, previous, state.answers);
  }

  async recheck(key: string, source: ProjectCreationSource): Promise<string> {
    const state = this.states.get(key);
    if (state?.status !== "stale") throw new Error("当前 Project 来源不需要重新检查。");
    const nextKey = sourceKey(source);
    this.epoch += 1;
    this.states.clear();
    await this.requestTurn(nextKey, source, state.answers);
    return nextKey;
  }

  async generatePreview(key: string): Promise<void> {
    const state = this.states.get(key);
    const started = this.runtime();
    if (state?.status !== "ready" || state.result.output.readiness !== "READY_FOR_PREVIEW") throw new Error("Project 尚未具备最终阅读预览条件。");
    if (state.preview?.status === "loading") return;
    const client = started.client;
    const generate = client?.previewProjectCreation;
    if (!client || !generate || !started.providerAvailable) {
      this.states.set(key, { ...state, preview: { status: "error", message: "智能分析暂不可用或正在恢复；没有生成预览。" } });
      await this.onStateChange();
      return;
    }
    const epoch = this.epoch;
    this.states.set(key, { ...state, preview: { status: "loading" } });
    await this.onStateChange();
    try {
      const result = await generate.call(client, request(state.source, state.answers));
      const current = this.runtime();
      if (epoch !== this.epoch) return;
      if (current.client !== started.client || current.generation !== started.generation || !current.providerAvailable) throw new Error("运行环境已在生成期间恢复；旧预览已丢弃。");
      const latest = this.states.get(key);
      if (latest?.status === "ready") this.states.set(key, { ...latest, preview: { status: "ready", result } });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (staleError(error)) this.states.set(key, { status: "stale", source: state.source, answers: state.answers, message: staleMessage(error) });
      else {
        const latest = this.states.get(key);
        if (latest?.status === "ready") this.states.set(key, { ...latest, preview: { status: "error", message: userFailure(error, "PREVIEW") } });
      }
    }
    await this.onStateChange();
  }

  async createProposal(key: string): Promise<ServiceProjectCreationProposalResult | undefined> {
    const state = this.states.get(key);
    const preview = state?.status === "ready" && state.preview?.status === "ready" ? state.preview : undefined;
    const started = this.runtime();
    const client = started.client;
    const create = client?.createProjectCreationProposal;
    if (!state || state.status !== "ready" || !preview) throw new Error("Project 最终阅读预览已失效。");
    if (preview.proposal?.status === "loading") return undefined;
    if (!client || !create) throw new Error("待确认建议暂不可用；没有创建正式事项。");
    const epoch = this.epoch;
    this.states.set(key, { ...state, preview: { ...preview, proposal: { status: "loading" } } });
    await this.onStateChange();
    try {
      const result = await create.call(client, { previewHandle: preview.result.previewHandle });
      if (epoch !== this.epoch) return undefined;
      const current = this.runtime();
      if (current.client !== started.client || current.generation !== started.generation) throw new Error("运行环境已在准备待确认建议时恢复；请重新生成预览。");
      const latest = this.states.get(key);
      if (latest?.status === "ready" && latest.preview?.status === "ready") this.states.set(key, { ...latest, preview: { ...latest.preview, proposal: { status: "ready", result } } });
      await this.onStateChange();
      return result;
    } catch (error) {
      if (epoch !== this.epoch) return undefined;
      const latest = this.states.get(key);
      if (latest?.status === "ready" && latest.preview?.status === "ready") {
        if (previewExpiredError(error)) {
          this.states.set(key, {
            ...latest,
            preview: {
              status: "error",
              message: "运行环境已恢复；请基于已确认答案重新生成最终阅读预览。",
            },
          });
        } else if (relationshipReviewError(error) && latest.source.sourceKind === "PAGE") {
          this.states.set(key, {
            status: "ready",
            source: latest.source,
            answers: latest.answers,
            result: requestRelationshipClarification(latest.result, latest.source),
          });
        } else if (relationshipReviewError(error)) {
          this.states.set(key, {
            ...latest,
            preview: {
              ...latest.preview,
              proposal: {
                status: "error",
                message: "最终阅读预览未遵守来源保护边界；原 MiniProject、页面和正式事项均未改变。请重新生成预览。",
              },
            },
          });
        } else if (staleError(error)) {
          this.states.set(key, {
            status: "stale",
            source: latest.source,
            answers: latest.answers,
            message: "Project 来源在预览后发生变化；旧预览已作废，请基于最新内容重新检查。",
          });
        } else {
          this.states.set(key, { ...latest, preview: { ...latest.preview, proposal: { status: "error", message: userFailure(error, "REVIEW") } } });
        }
      }
      await this.onStateChange();
      return undefined;
    }
  }

  private async requestTurn(
    key: string,
    source: ProjectCreationSource,
    requestedAnswers: ProjectCreationAnswer[],
    previous?: ServiceProjectCreationGrillResult,
    confirmedAnswers: ProjectCreationAnswer[] = requestedAnswers,
  ): Promise<void> {
    const started = this.runtime();
    const client = started.client;
    const grill = client?.grillProjectCreation;
    if (!client || !grill || !started.providerAvailable) {
      this.states.set(key, { status: "error", source, answers: confirmedAnswers, retryAnswers: requestedAnswers, message: "智能分析暂不可用或正在恢复；没有生成讨论。", retryable: true, ...(previous ? { previous } : {}) });
      await this.onStateChange();
      return;
    }
    const epoch = this.epoch;
    this.states.set(key, { status: "loading", source, answers: confirmedAnswers, ...(previous ? { previous } : {}) });
    await this.onStateChange();
    try {
      const result = await grill.call(client, request(source, requestedAnswers));
      const current = this.runtime();
      if (epoch !== this.epoch) return;
      if (current.client !== started.client || current.generation !== started.generation || !current.providerAvailable) throw new Error("运行环境已在讨论期间恢复；旧草稿已丢弃。");
      this.states.set(key, { status: "ready", source, answers: requestedAnswers, result });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (staleError(error)) this.states.set(key, { status: "stale", source, answers: confirmedAnswers, message: staleMessage(error) });
      else {
        const failure = turnFailure(error);
        this.states.set(key, {
          status: "error",
          source,
          answers: confirmedAnswers,
          retryAnswers: requestedAnswers,
          message: failure.message,
          retryable: failure.retryable,
          ...(previous ? { previous } : {}),
        });
      }
    }
    await this.onStateChange();
  }
}
