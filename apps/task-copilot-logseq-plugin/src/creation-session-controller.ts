import type { CreationAnswerState, CreationSession } from "@task-copilot/domain";
import type {
  ServiceCreationDraftEdit,
  ServiceCreationSessionProposalResult,
  ServiceCreationSessionResult,
  ServiceCreationSourceSelection,
} from "@task-copilot/service-client";

export type CreationSessionView = "DISCUSSION" | "DRAFT" | "SUMMARY" | "HISTORY";

export interface PluginCreationSessionState {
  status: "idle" | "loading" | "ready" | "error";
  sessions: CreationSession[];
  session?: CreationSession | undefined;
  view: CreationSessionView;
  busy?: "CREATE" | "SOURCE" | "ROUND" | "DRAFT" | "EDIT" | "ADOPT" | "PLACEMENT" | "PROPOSAL" | "ABANDON" | "LOAD" | undefined;
  editingNodeId?: string | undefined;
  notice?: string | undefined;
  error?: string | undefined;
}

export interface CreationSessionClient {
  createCreationSession(input: { targetType: "MINI_PROJECT" | "PROJECT"; primarySource: ServiceCreationSourceSelection; userTitle?: string; sessionId?: string; idempotencyKey: string }): Promise<ServiceCreationSessionResult>;
  getCreationSession(sessionId: string): Promise<CreationSession | undefined>;
  listCreationSessions(statuses?: CreationSession["status"][]): Promise<CreationSession[]>;
  addCreationSessionSource(sessionId: string, input: { expectedVersion: number; idempotencyKey: string; source: ServiceCreationSourceSelection }): Promise<ServiceCreationSessionResult>;
  checkCreationSessionSource(sessionId: string, sourceId: string, input: { expectedVersion: number; idempotencyKey: string }): Promise<ServiceCreationSessionResult>;
  refreshCreationSessionSource(sessionId: string, sourceId: string, input: { expectedVersion: number; idempotencyKey: string }): Promise<ServiceCreationSessionResult>;
  startCreationSessionRound(sessionId: string, input: { expectedVersion: number; idempotencyKey: string }): Promise<ServiceCreationSessionResult>;
  submitCreationSessionRound(sessionId: string, roundId: string, input: { expectedVersion: number; idempotencyKey: string; answers: Array<{ questionId: string; answerState: CreationAnswerState; userAnswer?: string }>; narrativeAnswer?: string }): Promise<ServiceCreationSessionResult>;
  retryCreationSessionRound(sessionId: string, roundId: string, input: { expectedVersion: number; idempotencyKey: string }): Promise<ServiceCreationSessionResult>;
  generateCreationSessionDraft(sessionId: string, input: { expectedVersion: number; idempotencyKey: string; revisionInstruction?: string }): Promise<ServiceCreationSessionResult>;
  editCreationSessionDraft(sessionId: string, revisionId: string, nodeId: string, input: { expectedVersion: number; idempotencyKey: string; edit: ServiceCreationDraftEdit }): Promise<ServiceCreationSessionResult>;
  adoptCreationSessionDraft(sessionId: string, revisionId: string, input: { expectedVersion: number; idempotencyKey: string }): Promise<ServiceCreationSessionResult>;
  updateCreationSession(sessionId: string, input: { expectedVersion: number; idempotencyKey: string; patch: Pick<CreationSession, "placementPlan"> }): Promise<ServiceCreationSessionResult>;
  createCreationSessionProposal(sessionId: string, input: { expectedVersion: number; idempotencyKey: string }): Promise<ServiceCreationSessionProposalResult>;
  abandonCreationSession(sessionId: string, expectedVersion: number, idempotencyKey: string): Promise<ServiceCreationSessionResult>;
}

export interface CreationSessionRuntime {
  client?: CreationSessionClient;
  providerAvailable: boolean;
  generation: number;
}

function idempotencyKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function userMessage(error: unknown): string {
  const code = error && typeof error === "object" && "details" in error
    ? (error as { details?: { remoteCode?: unknown } }).details?.remoteCode
    : undefined;
  if (code === "CREATION_SESSION_VERSION_CONFLICT") return "这个创建会话已在另一处更新。已保留新内容，请重新载入后继续。";
  if (code === "CREATION_SESSION_DRAFT_SOURCE_CHANGED") return "来源已变化。请先明确纳入最新内容，再重新生成草稿。";
  if (code === "CREATION_SESSION_PRE_COMMIT_SOURCE_CHANGED") return "来源在创建检查前发生了变化。请先纳入最新内容并重新审阅草稿。";
  if (typeof code === "string" && (code.startsWith("LLM_") || code.includes("PROVIDER"))) return "智能整理暂时不可用。回答、来源快照和最后稳定草稿都已保存，可以安全重试。";
  return "这次操作没有完成。已保存内容没有被覆盖，请重试或重新载入会话。";
}

function latestAnswerableRound(session: CreationSession) {
  return [...session.rounds].reverse().find(({ providerStatus }) => providerStatus === "NOT_REQUESTED");
}

export class CreationSessionController {
  private epoch = 0;
  private state: PluginCreationSessionState = { status: "idle", sessions: [], view: "DISCUSSION" };

  constructor(
    private readonly runtime: () => CreationSessionRuntime,
    private readonly onStateChange: () => Promise<void>,
  ) {}

  snapshot(): PluginCreationSessionState {
    return structuredClone(this.state);
  }

  clear(): void {
    this.epoch += 1;
    this.state = { status: "idle", sessions: [], view: "DISCUSSION" };
  }

  setView(view: CreationSessionView): void {
    this.state = { ...this.state, view, editingNodeId: undefined };
  }

  beginNodeEdit(nodeId?: string): void {
    this.state = { ...this.state, editingNodeId: nodeId };
  }

  async loadActive(): Promise<void> {
    const started = this.requireRuntime(false);
    const epoch = ++this.epoch;
    this.state = { status: "loading", sessions: this.state.sessions, view: "DISCUSSION", busy: "LOAD" };
    await this.onStateChange();
    try {
      const sessions = await started.client.listCreationSessions(["DISCUSSING", "PREVIEW_READY"]);
      if (!this.current(started, epoch)) return;
      this.state = { status: "ready", sessions, view: "DISCUSSION" };
    } catch (error) {
      if (!this.current(started, epoch)) return;
      this.state = { ...this.state, status: "error", busy: undefined, error: userMessage(error) };
    }
    await this.onStateChange();
  }

  async create(input: { targetType: "MINI_PROJECT" | "PROJECT"; primarySource: ServiceCreationSourceSelection; userTitle?: string }): Promise<void> {
    const started = this.requireRuntime(false);
    const epoch = ++this.epoch;
    this.state = { status: "loading", sessions: this.state.sessions, view: "DISCUSSION", busy: "CREATE" };
    await this.onStateChange();
    try {
      const result = await started.client.createCreationSession({ ...input, idempotencyKey: idempotencyKey("creation-session-create") });
      if (!this.current(started, epoch)) return;
      this.state = { status: "ready", sessions: this.withSession(result.session), session: result.session, view: "DISCUSSION", notice: "会话已保存。请先核对来源范围，再开始第一轮整理。" };
    } catch (error) {
      if (!this.current(started, epoch)) return;
      this.state = { status: "error", sessions: this.state.sessions, view: "DISCUSSION", error: userMessage(error) };
    }
    await this.onStateChange();
  }

  async resume(sessionId: string): Promise<void> {
    const started = this.requireRuntime(false);
    const epoch = ++this.epoch;
    this.state = { ...this.state, status: "loading", busy: "LOAD", error: undefined };
    await this.onStateChange();
    try {
      let session = await started.client.getCreationSession(sessionId);
      if (!session) throw new Error("missing session");
      if (session.status === "DISCUSSING" || session.status === "PREVIEW_READY") {
        for (const source of session.sources.filter(({ kind }) => kind !== "BLANK")) {
          const checked = await started.client.checkCreationSessionSource(session.sessionId, source.sourceId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-source-check") });
          session = checked.session;
        }
      }
      if (!this.current(started, epoch)) return;
      const changed = session.sources.filter(({ availability }) => availability !== "AVAILABLE").length;
      const terminal = session.status === "CREATED" || session.status === "ABANDONED";
      this.state = { status: "ready", sessions: this.withSession(session), session, view: terminal ? "HISTORY" : session.currentDraftRevisionId ? "DRAFT" : "DISCUSSION", ...(terminal ? { notice: "已恢复只读会话历史；没有重新观察或修改 Graph 来源。" } : changed ? { notice: `已恢复会话，并发现 ${changed} 个来源需要处理。` } : { notice: "会话与当前来源已恢复。" }) };
    } catch (error) {
      if (!this.current(started, epoch)) return;
      this.state = { ...this.state, status: "error", busy: undefined, error: userMessage(error) };
    }
    await this.onStateChange();
  }

  async submitAnswers(answers: Array<{ questionId: string; answerState: CreationAnswerState; userAnswer?: string }>): Promise<void> {
    const session = this.requiredSession();
    const round = latestAnswerableRound(session);
    if (!round) throw new Error("当前没有可提交的讨论轮次。");
    await this.mutate("ROUND", async (client) => client.submitCreationSessionRound(session.sessionId, round.roundId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-round-submit"), answers }), "DISCUSSION");
  }

  async submitNarrativeAnswer(narrativeAnswer: string): Promise<void> {
    const session = this.requiredSession();
    const round = latestAnswerableRound(session);
    if (!round) throw new Error("当前没有可提交的讨论轮次。");
    const answers = round.questions.map(({ questionId }) => ({ questionId, answerState: "UNANSWERED" as const }));
    await this.mutate("ROUND", async (client) => client.submitCreationSessionRound(session.sessionId, round.roundId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-round-narrative"), answers, narrativeAnswer }), "DISCUSSION");
  }

  async addReference(source: Exclude<ServiceCreationSourceSelection, { kind: "BLANK" }>): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("SOURCE", async (client) => client.addCreationSessionSource(session.sessionId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-source-add"), source }), "DISCUSSION");
  }

  async checkSource(sourceId: string): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("SOURCE", async (client) => client.checkCreationSessionSource(session.sessionId, sourceId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-source-check") }), this.state.view);
  }

  async refreshSource(sourceId: string): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("SOURCE", async (client) => client.refreshCreationSessionSource(session.sessionId, sourceId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-source-refresh") }), this.state.view);
  }

  async startRound(): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("ROUND", async (client) => client.startCreationSessionRound(session.sessionId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-round-start") }), "DISCUSSION");
  }

  async retryRound(roundId: string): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("ROUND", async (client) => client.retryCreationSessionRound(session.sessionId, roundId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-round-retry") }), "DISCUSSION");
  }

  async generateDraft(): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("DRAFT", async (client) => client.generateCreationSessionDraft(session.sessionId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-draft-generate") }), "DRAFT");
  }

  async reviseDraft(revisionInstruction: string): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("DRAFT", async (client) => client.generateCreationSessionDraft(session.sessionId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-draft-revise"), revisionInstruction }), "DRAFT");
  }

  async editDraft(revisionId: string, nodeId: string, edit: ServiceCreationDraftEdit): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("EDIT", async (client) => client.editCreationSessionDraft(session.sessionId, revisionId, nodeId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-draft-edit"), edit }), "DRAFT");
  }

  async adoptDraft(revisionId: string): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("ADOPT", async (client) => client.adoptCreationSessionDraft(session.sessionId, revisionId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-draft-adopt") }), "DRAFT");
  }

  async setPlacement(placementPlan: NonNullable<CreationSession["placementPlan"]>): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("PLACEMENT", async (client) => client.updateCreationSession(session.sessionId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-placement"), patch: { placementPlan } }), "DRAFT");
  }

  async prepareProposal(): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("PROPOSAL", async (client) => client.createCreationSessionProposal(session.sessionId, { expectedVersion: session.version, idempotencyKey: idempotencyKey("creation-session-proposal") }), "DRAFT");
  }

  async abandon(): Promise<void> {
    const session = this.requiredSession();
    await this.mutate("ABANDON", async (client) => client.abandonCreationSession(session.sessionId, session.version, idempotencyKey("creation-session-abandon")), "SUMMARY");
  }

  private async mutate(busy: NonNullable<PluginCreationSessionState["busy"]>, operation: (client: CreationSessionClient) => Promise<ServiceCreationSessionResult>, view: CreationSessionView): Promise<void> {
    const started = this.requireRuntime(busy === "ROUND" || busy === "DRAFT");
    const epoch = ++this.epoch;
    this.state = { ...this.state, status: "loading", busy, error: undefined, notice: undefined, editingNodeId: undefined };
    await this.onStateChange();
    try {
      const result = await operation(started.client);
      if (!this.current(started, epoch)) return;
      const providerFailure = "providerStatus" in result && result.providerStatus === "FAILED";
      const remoteError = "error" in result && result.error && typeof result.error === "object" ? (result.error as { message?: string }).message : undefined;
      this.state = { status: "ready", sessions: this.withSession(result.session), session: result.session, view, ...(providerFailure ? { error: remoteError ?? "智能整理没有完成；最后稳定内容已保留。" } : { notice: busy === "EDIT" ? "草稿编辑已保存。" : busy === "SOURCE" ? "来源状态已更新；历史快照和用户草稿仍保留。" : busy === "PLACEMENT" ? "放置位置已保存。" : busy === "PROPOSAL" ? "正式方案已进入审阅中心；接受方案仍不会自动写入。" : undefined }) };
    } catch (error) {
      if (!this.current(started, epoch)) return;
      this.state = { ...this.state, status: this.state.session ? "ready" : "error", busy: undefined, error: userMessage(error) };
    }
    await this.onStateChange();
  }

  private requiredSession(): CreationSession {
    if (!this.state.session || this.state.status === "loading") throw new Error("Creation Session 尚未就绪。");
    return this.state.session;
  }

  private requireRuntime(provider: boolean): CreationSessionRuntime & { client: CreationSessionClient } {
    const runtime = this.runtime();
    if (!runtime.client || provider && !runtime.providerAvailable) throw new Error("Local Service 或 Provider 暂不可用。");
    return { ...runtime, client: runtime.client };
  }

  private current(started: CreationSessionRuntime, epoch: number): boolean {
    const runtime = this.runtime();
    return epoch === this.epoch && runtime.client === started.client && runtime.generation === started.generation;
  }

  private withSession(session: CreationSession): CreationSession[] {
    return [...this.state.sessions.filter(({ sessionId }) => sessionId !== session.sessionId && ["DISCUSSING", "PREVIEW_READY"].includes(session.status)), ...(["DISCUSSING", "PREVIEW_READY"].includes(session.status) ? [session] : [])]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}
