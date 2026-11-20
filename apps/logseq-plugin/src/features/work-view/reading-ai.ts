import { button, element, hostDocument } from "../../host/panel-host.ts";
import { copyMaterialLink } from "../../host/clipboard.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { lookupBlockIdentity } from "../../block-identity.ts";
import { taskMarkerFromContent } from "../../canonical-writing.ts";
import { sha256, type SourceSnapshot, type SourceScope, type BlockSnapshot } from "../../workspace/source-protocol.ts";
import { sameLensScope } from "./lens-source.ts";
import { workObject } from "./focus.mjs";
import { briefingParagraphs, retainUnchangedParagraphs, progressivePlanId, progressivePurpose, type ReadingChanges, type WorkBriefing } from "./briefing-model.ts";
import { renderMarkdown } from "./markdown.ts";
import type { ReadingMaterial } from "./reading-layout.ts";
import type { WorkViewReport } from "./report-controller.ts";
import { pageWorkIds } from "../../workspace/page-identity.ts";

type Mode = "organize" | "ask" | "rewrite";
export type ReadingPrivacyMode = "default" | "local-only";
export interface ReadingModelInput {
  mode: Mode;
  question: string;
  source: SourceSnapshot;
  materials: ReadingMaterial[];
  selection?: { text: string; sourceIds: string[] };
  previous?: WorkBriefing;
  changes?: ReadingChanges;
  trigger?: "manual" | "background";
  privacyMode?: ReadingPrivacyMode;
}
export interface ReadingHandoff { request: string; sourceIds: string[]; selection?: string; basisVersion?: string; result?: string }
export interface ReadingProviderOption {
  id: string;
  label: string;
  kind: "openai-compatible" | "anthropic" | "dsh";
  model: string | null;
  locality: "remote" | "local";
  configured: boolean;
}
export interface ReadingProvidersView {
  routes: { fast: string | null; deep: string | null; local: string | null };
  budget: { backgroundUsedLastHour: number; backgroundMaxPerHour: number; backgroundUsedLastDay: number; backgroundMaxPerDay: number; backgroundPaused: boolean };
  profiles: ReadingProviderOption[];
}
export interface ReadingResultPayload {
  paragraphs?: WorkBriefing["paragraphs"];
  followUps?: WorkBriefing["followUps"];
  answer?: string;
  sourceIds?: string[];
  materialIds?: string[];
  agentRun?: { providerId?: string; model?: string | null; redactedMaterials?: string[] };
}
export interface ReadingJobSnapshot {
  jobId: string;
  workKey: string;
  planId?: string;
  refreshKey?: string;
  mode: Mode;
  background: boolean;
  privacyMode: ReadingPrivacyMode;
  sourceSetVersion?: string;
  structureVersion?: string;
  previous?: WorkBriefing;
  changes?: ReadingChanges;
  status: "running" | "completed" | "failed" | "cancelled";
  result?: ReadingResultPayload;
  error?: { code: string; message: string };
}
export interface ReadingJobStartRequest {
  workKey: string;
  planId?: string;
  refreshKey?: string;
  trigger: "manual" | "background";
  privacyMode: ReadingPrivacyMode;
  input: ReadingModelInput;
}
export interface ReadingAiPort {
  complete(input: ReadingModelInput, signal?: AbortSignal): Promise<unknown>;
  handoff(scope: SourceScope, intent: ReadingHandoff): Promise<void>;
  startJob?(input: ReadingJobStartRequest): Promise<{ job: ReadingJobSnapshot; deduplicated: boolean }>;
  jobStatus?(query: { jobId?: string; workKey?: string }): Promise<{ job: ReadingJobSnapshot | null }>;
  ackJob?(jobId: string): Promise<void>;
  cancelJob?(query: { jobId?: string; workKey?: string }): Promise<void>;
  providers?(): Promise<ReadingProvidersView>;
  selectRoute?(route: { defaultProfileId?: string | null; fast?: string | null; deep?: string | null; local?: string | null }): Promise<ReadingProvidersView>;
}

interface Selection { text: string; uuid?: string }
interface Answer { text: string; sourceIds: string[]; materialIds: string[]; source: SourceSnapshot; rewrite?: BlockSnapshot }
interface State {
  open: boolean;
  question: string;
  selection: Selection | null;
  answer: Answer | null;
  busy: boolean;
  notice: string;
  confirm: boolean;
  automatic: boolean;
  localOnly: boolean;
  attempted: string | null;
  job: AbortController | null;
  activeJobId: string | null;
  background: boolean;
  review: boolean;
}
const initial = (automatic = false, localOnly = false): State => ({
  open: false,
  question: "",
  selection: null,
  answer: null,
  busy: false,
  notice: "",
  confirm: false,
  automatic,
  localOnly,
  attempted: null,
  job: null,
  activeJobId: null,
  background: false,
  review: false,
});

const text = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : error instanceof Error ? error.message : String(error);
  return ({
    READING_MODEL_NOT_CONFIGURED: "尚未配置可用模型（可在工作台配置 DEEPSEEK_API_KEY 或 providers.json），仍可阅读原文。",
    READING_MODEL_PROVIDER_FAILED: "模型暂不可用，请检查模型配置与网络后重试。",
    READING_MODEL_AUTH_FAILED: "模型 API Key 鉴权失败，请检查工作台模型配置。",
    READING_MODEL_RATE_LIMITED: "模型服务请求频率受限，请稍后重试。",
    READING_MODEL_CONTEXT_LIMIT: "资料较多，可缩小请求范围，或转到外部协作继续。",
    READING_MODEL_INCOMPLETE: "生成未完成，请重试或转到外部协作继续。",
    READING_AGENT_INCOMPLETE: "整理未完成，原文章保留。",
    READING_MODEL_OUTPUT: "未收到可用的阅读结果，请重试。",
    READING_MODEL_INTERRUPTED: "整理已停止，原文章保留。",
    READING_LOCAL_MODEL_REQUIRED: "此工作已设为仅本地模型，请先配置本地模型 Profile（如 Ollama）。",
    READING_BACKGROUND_BUDGET_PAUSED: "后台自动修订已达配额上限，暂不自动触发；你仍可手动更新文章或提问。",
    READING_CONFIG_NOT_PRIVATE: "providers.json 权限不安全，请将其设为仅当前用户可读写（chmod 600）。",
    READING_CONFIG_INVALID: "工作台模型配置 providers.json 格式有误，请检查后重试。",
    DSH_NOT_RUNNING: "请启动 DSH（或在工作台配置直连模型）。",
    PLUGIN_DESCRIPTOR_REQUIRED: "请先启动工作台服务（Companion）。",
    READING_MATERIAL_SCOPE_CHANGED: "关联材料已变化，请重新读取后再试。",
    "stale-source-set": "原文在生成期间更新，请重新整理。",
    "reading-materials-changed": "关联依据已更新，请重新整理。",
    "reading-request-revoked": "工作记录已变化，原文章保留。",
    "scope-mismatch": "工作已切换，请返回后重试。",
  } as Record<string, string>)[code] ?? (/^[A-Z_-]+$|^[a-z-]+$/u.test(code) ? "请求未完成，请重试或转到外部协作继续。" : code);
};

function selectedText(): Selection | null {
  for (const doc of [document, hostDocument()]) {
    const selection = doc?.getSelection(), raw = selection?.toString().trim();
    if (!raw) continue;
    const node = selection?.anchorNode, el = node?.nodeType === 1 ? node as Element : node?.parentElement;
    const owner = el?.closest<HTMLElement>("[data-progressive-source],.wb-row[data-uuid],.ls-block[blockid]");
    const uuid = owner?.dataset.progressiveUuid ?? owner?.dataset.uuid ?? owner?.getAttribute("blockid") ?? undefined;
    return { text: raw.slice(0, 8000), ...(uuid ? { uuid } : {}) };
  }
  return null;
}

function ordinary(block: BlockSnapshot, scope: SourceScope): boolean {
  const content = block.content ?? "";
  return !workObject(content) && !taskMarkerFromContent(content) && lookupBlockIdentity(block.target.blockUuid, scope.graphId).kind !== "FORMAL" && !/^\s*[^:\n]+::/mu.test(content);
}

export class WorkReadingAI {
  readonly root = element("section", "", "wb-reading-ai");
  private readonly organize: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private readonly form = element("div", "", "wb-ai-form");
  private readonly selectionLabel = element("div", "", "wb-ai-selection");
  private readonly input = element("textarea");
  private readonly tools = element("div", "", "wb-ai-tools");
  private readonly optionsBar = element("div", "", "wb-ai-options");
  private readonly status = element("div", "", "wb-ai-status");
  private readonly result = element("div", "", "wb-ai-result");
  private readonly ask: HTMLButtonElement;
  private readonly rewrite: HTMLButtonElement;
  private readonly handoff: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private readonly auto: HTMLInputElement;
  private readonly localOnlyInput: HTMLInputElement;
  private readonly providerSelect: HTMLSelectElement;
  private readonly candidateButton: HTMLButtonElement;
  private readonly candidateBox = element("section", "", "wb-ai-candidate");
  private candidateFocus: HTMLElement | null = null;
  private candidateSignature = "";
  private providersView: ReadingProvidersView | null = null;
  private providersLoading = false;
  private autoTimer: number | null = null;
  private autoKey: string | null = null;
  private watchTimer: number | null = null;
  private pollTimer: number | null = null;
  private checkingJobForKey: string | null = null;
  private visible = false;
  private blocked = false;
  private disposed = false;
  private hasBriefing = false;
  private readonly states = new Map<string, State>();
  private key = "";
  private scope: SourceScope | null = null;
  private pointerSelection: Selection | null = null;
  private state: State = initial();

  constructor(
    private readonly reading: WorkViewReport["readingAPI"],
    private readonly port: ReadingAiPort,
    private readonly actions: { locate(uuid: string): void; material(id: string): void; refresh(): Promise<void> }
  ) {
    const bar = element("div", "", "wb-ai-bar");
    this.organize = button("整理文章", () => void this.run("organize", !!this.state.question.trim()));
    this.toggle = button("AI 助手", () => {
      this.state.open = !this.state.open;
      if (this.state.open) {
        this.state.selection = this.pointerSelection ?? selectedText() ?? this.state.selection;
        this.input.value = this.state.question;
        void this.loadProviders();
      }
      this.pointerSelection = null;
      this.paint();
      if (this.state.open) this.input.focus();
    });
    this.toggle.onpointerdown = () => { this.pointerSelection = selectedText(); };
    this.toggle.setAttribute("aria-expanded", "false");
    this.cancel = button("取消", () => void this.cancelActiveJob());
    this.cancel.setAttribute("aria-label", "取消 AI 阅读任务");
    this.candidateButton = button("待采用修订", () => this.reviewCandidate(this.candidateButton));
    this.handoff = button("在 DSH 继续", () => void this.continueInDsh());
    this.handoff.className = "wb-ai-handoff";
    this.handoff.title = "进入此工作的 DSH 对话，带上本次阅读和请求";
    this.handoff.onpointerdown = (event) => { this.pointerSelection = selectedText(); event.preventDefault(); };
    bar.append(this.toggle, this.cancel, this.candidateButton, this.handoff);
    this.root.append(bar, this.form, this.status, this.candidateBox);
    this.status.setAttribute("role", "status");
    this.input.rows = 2;
    this.input.placeholder = "问当前工作，或说明希望怎样整理";
    this.input.setAttribute("aria-label", "给 AI 的请求");
    this.input.maxLength = 4000;
    this.input.oninput = () => { this.state.question = this.input.value; this.paintControls(); };
    this.input.onkeydown = (event) => {
      if (!event.isComposing && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.run("ask", true);
      }
    };
    this.ask = button("提问", () => void this.run("ask", true));
    this.rewrite = button("改写选中原块", () => void this.run("rewrite", true));
    this.tools.append(this.organize, this.ask, this.rewrite);

    const autoLabel = element("label", "", "wb-ai-auto");
    this.auto = element("input");
    this.auto.type = "checkbox";
    autoLabel.append(this.auto, document.createTextNode("后台准备修订"));
    autoLabel.title = "允许在本工作已保存来源变化后调用配置模型准备候选；切走页面不中断，不会自动替换文章。";
    this.auto.onchange = () => {
      this.state.automatic = this.auto.checked;
      this.state.attempted = null;
      localStorage.setItem(`workbench:reading-auto:${this.key}`, String(this.auto.checked));
      if (!this.auto.checked) {
        this.clearTimers();
        if (this.state.background) void this.cancelActiveJob();
      }
      this.schedule();
    };

    const localLabel = element("label", "", "wb-ai-auto");
    this.localOnlyInput = element("input");
    this.localOnlyInput.type = "checkbox";
    localLabel.append(this.localOnlyInput, document.createTextNode("仅本地模型"));
    localLabel.title = "禁止此工作内容发往云端模型，仅使用本机回环地址的本地模型 Profile。";
    this.localOnlyInput.onchange = () => {
      this.state.localOnly = this.localOnlyInput.checked;
      localStorage.setItem(`workbench:reading-local:${this.key}`, String(this.localOnlyInput.checked));
      this.paintProviderSelect();
    };

    this.providerSelect = element("select", "", "wb-ai-provider");
    this.providerSelect.setAttribute("aria-label", "阅读模型 Profile");
    this.providerSelect.hidden = true;
    this.providerSelect.onchange = () => void this.switchProvider(this.providerSelect.value);

    this.optionsBar.append(autoLabel, localLabel, this.providerSelect);
    this.form.append(this.selectionLabel, this.input, this.tools, this.optionsBar, this.result);

    this.candidateBox.hidden = true;
    this.candidateBox.setAttribute("role", "dialog");
    this.candidateBox.setAttribute("aria-label", "候选修订");
    this.candidateBox.onkeydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); this.closeCandidate(); }
    };
    window.addEventListener("resize", this.positionCandidate);
    this.root.setAttribute("aria-label", "轻量 AI 阅读助手");
    this.paint();
  }

  private async cancelActiveJob(): Promise<void> {
    const state = this.state;
    const jobId = state.activeJobId;
    state.job?.abort();
    if (jobId && this.port.cancelJob) {
      this.clearPollTimer();
      try {
        await this.port.cancelJob({ jobId });
      } catch {
        // Ignore transport error on cancel; UI still clears local waiting state.
      }
      if (this.state === state) {
        state.activeJobId = null;
        state.busy = false;
        state.background = false;
        state.notice = "已取消；保留现有阅读。";
        this.paint();
        this.schedule();
      }
    }
  }

  private async loadProviders(): Promise<void> {
    if (!this.port.providers || this.providersLoading || this.disposed) return;
    this.providersLoading = true;
    try {
      this.providersView = await this.port.providers();
      if (!this.disposed) this.paintProviderSelect();
    } catch {
      // Companion may be stopped; keep quiet without blocking reading.
    } finally {
      this.providersLoading = false;
    }
  }

  private async switchProvider(profileId: string): Promise<void> {
    if (!this.port.selectRoute || !profileId) return;
    try {
      this.providersView = await this.port.selectRoute({ defaultProfileId: profileId });
      const chosen = this.providersView.profiles.find((item) => item.id === profileId);
      this.state.notice = chosen ? `已切换阅读模型：${chosen.label}` : "已切换阅读模型。";
      this.paint();
    } catch (error) {
      this.state.notice = text(error);
      this.paint();
    }
  }

  private paintProviderSelect(): void {
    const view = this.providersView;
    if (!view || !view.profiles.length) {
      this.providerSelect.hidden = true;
      return;
    }
    const activeId = this.state.localOnly ? view.routes.local : (view.routes.deep ?? view.routes.fast);
    this.providerSelect.hidden = false;
    this.providerSelect.disabled = this.state.busy || this.state.localOnly;
    this.providerSelect.replaceChildren();
    if (this.state.localOnly && !view.routes.local) {
      const opt = element("option", "未配置本地模型");
      opt.value = "";
      this.providerSelect.append(opt);
      return;
    }
    for (const profile of view.profiles) {
      if (this.state.localOnly && profile.locality !== "local") continue;
      const suffix = profile.locality === "local" ? " · 本地" : !profile.configured ? " · 未就绪" : "";
      const opt = element("option", `${profile.label}${suffix}`);
      opt.value = profile.id;
      opt.selected = profile.id === activeId;
      this.providerSelect.append(opt);
    }
  }

  render(scope: SourceScope | null, visible: boolean, hasBriefing: boolean, blocked = false): void {
    const key = scope ? JSON.stringify([scope.graphId, pageWorkIds(scope, localStorage)[0], scope.kind ?? "block"]) : "";
    const wasVisible = this.visible;
    const keyChanged = key !== this.key;
    this.scope = scope;
    if (keyChanged) {
      // Only abort local sync requests (ask/rewrite/fallback); keep detached Companion organize jobs alive across work switches!
      if (!this.state.activeJobId) this.state.job?.abort();
      this.clearTimers();
      this.clearPollTimer();
      this.state.review = false;
      this.candidateSignature = "";
      this.key = key;
      const previous = this.states.get(key);
      this.state = previous ?? initial(
        key ? localStorage.getItem(`workbench:reading-auto:${key}`) === "true" : false,
        key ? localStorage.getItem(`workbench:reading-local:${key}`) === "true" : false
      );
      if (key) this.states.set(key, this.state);
      this.input.value = this.state.question;
      this.result.replaceChildren();
      this.paint();
    }
    this.visible = visible;
    this.blocked = blocked;
    this.hasBriefing = hasBriefing;
    if (scope && visible && (keyChanged || !wasVisible) && this.port.jobStatus) {
      void this.reconcileStagedJob(scope, this.state, key);
    }
    this.root.hidden = !scope || !visible;
    this.organize.disabled = blocked || this.state.busy;
    this.toggle.disabled = blocked && !this.state.open;
    this.form.dataset.blocked = String(blocked);
    this.paintControls();
    this.updateAnswerBasis();
    this.updateCandidate();
    this.schedule();
  }

  private paintControls() {
    const blocked = this.form.dataset.blocked === "true";
    const question = !!this.state.question.trim();
    this.ask.disabled = this.state.busy || blocked || !question;
    this.rewrite.disabled = this.handoff.disabled = this.state.busy || blocked;
    this.organize.textContent = question ? "按要求整理" : this.hasBriefing ? "更新文章" : "整理文章";
    this.rewrite.hidden = !this.state.selection?.uuid;
    this.organize.disabled = this.state.busy || blocked;
    this.toggle.setAttribute("aria-expanded", String(this.state.open));
    this.cancel.hidden = !this.state.job && !this.state.activeJobId;
    this.auto.checked = this.state.automatic;
    this.localOnlyInput.checked = this.state.localOnly;
    this.paintProviderSelect();
  }

  private paint() {
    this.form.hidden = !this.state.open;
    this.status.textContent = this.state.notice;
    this.paintControls();
    this.selectionLabel.replaceChildren();
    if (this.state.selection) {
      this.selectionLabel.append(
        element("span", `选中文字：${this.state.selection.text.slice(0, 110)}`),
        button("清除", () => { this.state.selection = null; this.paint(); })
      );
    }
    this.selectionLabel.hidden = !this.state.selection;
    this.showAnswer();
    this.updateCandidate();
  }

  private same(scope: SourceScope, state: State): boolean {
    return this.state === state && !!this.scope && sameLensScope(this.scope, scope);
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private scheduleJobPoll(scope: SourceScope, state: State, workKey: string): void {
    this.clearPollTimer();
    if (this.disposed || !this.same(scope, state) || !state.activeJobId || !this.port.jobStatus) return;
    this.pollTimer = window.setTimeout(() => {
      this.pollTimer = null;
      void this.reconcileStagedJob(scope, state, workKey);
    }, 1000);
  }

  private async reconcileStagedJob(scope: SourceScope, state: State, workKey: string): Promise<void> {
    if (!this.port.jobStatus || this.disposed || !this.same(scope, state) || this.checkingJobForKey === workKey) return;
    this.checkingJobForKey = workKey;
    try {
      const response = await this.port.jobStatus(state.activeJobId ? { jobId: state.activeJobId } : { workKey });
      if (!this.same(scope, state) || this.disposed) return;
      const job = response.job;
      if (!job) {
        if (state.activeJobId) {
          state.activeJobId = null;
          state.busy = false;
          state.background = false;
          state.notice = "";
          this.paint();
          this.schedule();
        }
        return;
      }
      if (job.status === "running") {
        state.activeJobId = job.jobId;
        state.busy = true;
        state.background = job.background;
        state.notice = job.background ? "正在后台准备修订…" : "正在组织阅读内容…";
        this.paint();
        this.scheduleJobPoll(scope, state, workKey);
        return;
      }
      if (job.status === "cancelled") {
        state.activeJobId = null;
        state.busy = false;
        state.background = false;
        if (this.port.ackJob) await this.port.ackJob(job.jobId).catch(() => undefined);
        this.paint();
        this.schedule();
        return;
      }
      if (job.status === "failed") {
        state.activeJobId = null;
        state.busy = false;
        state.background = false;
        state.notice = text(job.error ?? "READING_MODEL_PROVIDER_FAILED");
        if (this.port.ackJob) await this.port.ackJob(job.jobId).catch(() => undefined);
        this.paint();
        this.schedule();
        return;
      }
      if (job.status === "completed" && job.mode === "organize" && job.result) {
        await this.applyCompletedOrganize(scope, state, job);
      }
    } catch {
      // Companion offline: never disrupt reading, stop active poll if no local job.
      if (this.same(scope, state) && state.activeJobId) {
        this.scheduleJobPoll(scope, state, workKey);
      }
    } finally {
      if (this.checkingJobForKey === workKey) this.checkingJobForKey = null;
    }
  }

  private async applyCompletedOrganize(scope: SourceScope, state: State, job: ReadingJobSnapshot): Promise<void> {
    const result = job.result;
    let requestId: string | undefined;
    try {
      if (!result?.paragraphs?.length) throw new Error("READING_MODEL_OUTPUT");
      const before = this.reading.read();
      const planId = job.planId ?? (before.activePlan?.briefing ? before.activePlan.planId : before.briefing?.planId ?? progressivePlanId);
      const requested = await this.reading.request({ schemaVersion: 1, purpose: progressivePurpose, planId });
      if (!requested.ok) {
        // e.g. editing-in-progress: wait and re-check later without discarding staged candidate
        if (requested.reason === "editing-in-progress") {
          this.scheduleJobPoll(scope, state, job.workKey);
          return;
        }
        throw new Error(requested.reason);
      }
      requestId = requested.value.requestId;
      const { source } = requested.value;
      const currentRefresh = this.reading.read().refreshKey;
      const versionMatches =
        (!job.sourceSetVersion || source.sourceSetVersion === job.sourceSetVersion) &&
        (!job.structureVersion || source.structureVersion === job.structureVersion) &&
        (!job.refreshKey || !currentRefresh || currentRefresh === job.refreshKey);
      if (!versionMatches) {
        state.activeJobId = null;
        state.busy = false;
        state.background = false;
        state.notice = "离开期间原文或材料已变化，旧候选已忽略。";
        if (this.port.ackJob) await this.port.ackJob(job.jobId).catch(() => undefined);
        this.paint();
        this.schedule();
        return;
      }

      const previous = job.previous ?? requested.value.previous;
      const changes = job.changes ?? requested.value.changes;
      const paragraphs =
        job.background && previous && changes && (changes.sourceIds.length || changes.materialIds.length)
          ? retainUnchangedParagraphs(previous, [...result.paragraphs, ...(result.followUps ?? [])], changes)
          : result.paragraphs;
      const plan = {
        schemaVersion: 1,
        requestId,
        planId,
        name: before.plans.find((item) => item.planId === planId)?.name ?? "文章式阅读",
        scope: source.scope,
        structureVersion: source.structureVersion,
        sourceSetVersion: source.sourceSetVersion,
        sourceVersions: source.blocks.map((block) => ({ sourceId: block.sourceId, contentVersion: block.contentVersion })),
        layout: source.blocks.length ? [{ kind: "sequence", key: "original-source", sourceIds: source.blocks.map((block) => block.sourceId) }] : [],
        briefing: {
          basisVersion: source.sourceSetVersion,
          createdAt: new Date().toISOString(),
          paragraphs,
          ...(paragraphs === result.paragraphs && result.followUps ? { followUps: result.followUps } : {}),
        },
      };
      const saved = await (previous ? this.reading.prepare(plan) : this.reading.submit(plan));
      if (!saved.ok) throw new Error(saved.reason);
      const current = this.reading.read();
      if (!previous && before.selectedPlanId === current.selectedPlanId && before.mode === current.mode) {
        const selected = await this.reading.select(planId);
        if (!selected.ok) throw new Error(selected.reason);
      }
      state.activeJobId = null;
      state.busy = false;
      state.background = false;
      const redacted = result.agentRun?.redactedMaterials;
      state.notice = redacted?.length ? `已自动屏蔽 ${redacted.length} 份敏感文件正文未发往云端。` : "";
      if (!job.background) state.open = false;
      if (this.same(scope, state)) this.paint();
      if (this.port.ackJob) await this.port.ackJob(job.jobId).catch(() => undefined);
    } catch (error) {
      if (this.port.ackJob) await this.port.ackJob(job.jobId).catch(() => undefined);
      state.activeJobId = null;
      state.busy = false;
      state.background = false;
      state.notice = text(error);
    } finally {
      if (requestId) this.reading.cancel(requestId);
      if (this.same(scope, state)) {
        this.paint();
        this.schedule();
      }
    }
  }

  private async run(mode: Mode, custom: boolean, background = false) {
    const scope = this.scope, state = this.state;
    if (!scope || state.busy) return;
    const question = custom
      ? state.question.trim()
      : background
        ? "根据已保存的新旧记录，核查变化并仅修订受影响的段落；保留原文稿中不受影响的表达和语义键。"
        : progressivePurpose;
    if (!question) { state.notice = "先填写你的问题或整理要求。"; this.paint(); return; }
    const before = this.reading.read();
    const planId = before.activePlan?.briefing ? before.activePlan.planId : before.briefing?.planId ?? progressivePlanId;
    const privacyMode: ReadingPrivacyMode = state.localOnly ? "local-only" : "default";
    const trigger: "manual" | "background" = background ? "background" : "manual";

    // Detached Companion async job path for organize (survives work switch!)
    if (mode === "organize" && this.port.startJob && this.port.jobStatus) {
      state.busy = true;
      state.background = background;
      state.notice = background ? "正在后台准备修订…" : "正在组织阅读内容…";
      state.confirm = false;
      this.paint();
      let requestId: string | undefined;
      try {
        const requested = await this.reading.request({ schemaVersion: 1, purpose: progressivePurpose, planId });
        if (!requested.ok) throw new Error(requested.reason);
        const { source, materials, previous, changes } = requested.value;
        requestId = requested.value.requestId;
        if (!this.same(scope, state)) throw new Error("scope-mismatch");
        const refreshKey = this.reading.read().refreshKey;
        if (state.automatic) state.attempted = refreshKey;
        if (background && (!previous || (!changes?.sourceIds.length && !changes?.materialIds.length))) {
          state.busy = false;
          state.background = false;
          state.notice = "";
          return;
        }
        const selection = custom && state.selection
          ? { text: state.selection.text, sourceIds: source.blocks.filter((b) => b.target.blockUuid === state.selection!.uuid).map((b) => b.sourceId) }
          : undefined;
        const inputMaterials = materials.map((material) => { const value = { ...material }; delete value.image; return value; });
        const started = await this.port.startJob({
          workKey: this.key,
          planId,
          ...(refreshKey ? { refreshKey } : {}),
          trigger,
          privacyMode,
          input: {
            mode,
            question,
            source,
            materials: inputMaterials,
            trigger,
            privacyMode,
            ...(selection ? { selection } : {}),
            ...(previous ? { previous } : {}),
            ...(changes ? { changes } : {}),
          },
        });
        state.activeJobId = started.job.jobId;
        this.reading.cancel(requestId);
        requestId = undefined;
        if (started.job.status === "completed" && started.job.result) {
          await this.applyCompletedOrganize(scope, state, started.job);
        } else if (this.same(scope, state)) {
          this.paint();
          this.scheduleJobPoll(scope, state, this.key);
        }
      } catch (error) {
        state.busy = false;
        state.background = false;
        state.activeJobId = null;
        state.notice = text(error);
      } finally {
        if (requestId) this.reading.cancel(requestId);
        if (this.same(scope, state)) { this.paint(); this.schedule(); }
      }
      return;
    }

    // Synchronous path (ask / rewrite / fallback when port has no async job support)
    const job = new AbortController();
    state.busy = true;
    state.job = job;
    state.background = background;
    state.notice = background ? "正在准备修订…" : mode === "organize" ? "正在组织阅读内容…" : "正在读取并回答…";
    state.confirm = false;
    this.paint();
    let requestId: string | undefined;
    try {
      const requested = await this.reading.request({ schemaVersion: 1, purpose: mode === "organize" ? progressivePurpose : "用户对当前工作提问", ...(mode === "organize" ? { planId } : {}) });
      if (!requested.ok) throw new Error(requested.reason);
      const { source, materials, previous, changes } = requested.value;
      requestId = requested.value.requestId;
      if (!this.same(scope, state)) throw new Error("scope-mismatch");
      job.signal.throwIfAborted();
      if (mode === "organize" && state.automatic) state.attempted = this.reading.read().refreshKey;
      if (background) {
        if (!previous || (!changes?.sourceIds.length && !changes?.materialIds.length)) { state.notice = ""; return; }
      }
      const chosen = state.selection?.uuid ? source.blocks.find((block) => block.target.blockUuid === state.selection!.uuid) : undefined;
      if (mode === "rewrite" && (!chosen || !ordinary(chosen, scope) || !chosen.content?.includes(state.selection?.text ?? ""))) {
        throw new Error("请选择当前普通原块中的原句；历史内容、正式对象和 TODO 请在原生编辑器核对修改。");
      }
      const selection = custom && state.selection ? { text: state.selection.text, sourceIds: chosen ? [chosen.sourceId] : [] } : undefined;
      const inputMaterials = materials.map((material) => { const value = { ...material }; delete value.image; return value; });
      const result = await this.port.complete(
        {
          mode,
          question,
          source,
          materials: inputMaterials,
          trigger,
          privacyMode,
          ...(selection ? { selection } : {}),
          ...(previous ? { previous } : {}),
          ...(changes ? { changes } : {}),
        },
        job.signal
      ) as ReadingResultPayload;
      if (!this.same(scope, state)) throw new Error("scope-mismatch");
      job.signal.throwIfAborted();
      if (mode === "organize") {
        if (!result.paragraphs?.length) throw Error("READING_MODEL_OUTPUT");
        const paragraphs =
          background && previous && changes && (changes.sourceIds.length || changes.materialIds.length)
            ? retainUnchangedParagraphs(previous, [...result.paragraphs, ...(result.followUps ?? [])], changes)
            : result.paragraphs;
        const plan = {
          schemaVersion: 1,
          requestId,
          planId,
          name: before.plans.find((plan) => plan.planId === planId)?.name ?? "文章式阅读",
          scope: source.scope,
          structureVersion: source.structureVersion,
          sourceSetVersion: source.sourceSetVersion,
          sourceVersions: source.blocks.map((block) => ({ sourceId: block.sourceId, contentVersion: block.contentVersion })),
          layout: source.blocks.length ? [{ kind: "sequence", key: "original-source", sourceIds: source.blocks.map((block) => block.sourceId) }] : [],
          briefing: {
            basisVersion: source.sourceSetVersion,
            createdAt: new Date().toISOString(),
            paragraphs,
            ...(paragraphs === result.paragraphs && result.followUps ? { followUps: result.followUps } : {}),
          },
        };
        const saved = await (previous ? this.reading.prepare(plan) : this.reading.submit(plan));
        if (!saved.ok) throw new Error(saved.reason);
        const current = this.reading.read();
        if (!previous && before.selectedPlanId === current.selectedPlanId && before.mode === current.mode) {
          const selected = await this.reading.select(planId);
          if (!selected.ok) throw new Error(selected.reason);
        }
        const redacted = result.agentRun?.redactedMaterials;
        state.notice = redacted?.length ? `已自动屏蔽 ${redacted.length} 份敏感文件正文未发往云端。` : "";
        if (!background) state.open = false;
      } else {
        if (typeof result.answer !== "string" || !result.answer.trim()) throw new Error("READING_MODEL_OUTPUT");
        state.answer = { text: result.answer, sourceIds: result.sourceIds ?? [], materialIds: result.materialIds ?? [], source, ...(mode === "rewrite" && chosen ? { rewrite: chosen } : {}) };
        state.open = true;
        const redacted = result.agentRun?.redactedMaterials;
        state.notice = redacted?.length ? `已自动屏蔽 ${redacted.length} 份敏感文件正文未发往云端。` : "";
      }
    } catch (error) {
      state.notice = job.signal.aborted ? "已取消；保留现有阅读。" : text(error);
    } finally {
      if (requestId) this.reading.cancel(requestId);
      state.busy = false;
      state.job = null;
      state.background = false;
      if (this.same(scope, state)) { this.paint(); this.schedule(); }
    }
  }

  private clearTimers(): void {
    if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
    this.autoTimer = null;
    this.autoKey = null;
    if (this.watchTimer !== null) window.clearTimeout(this.watchTimer);
    this.watchTimer = null;
  }

  private schedule(): void {
    const state = this.state, scope = this.scope, reading = this.reading.read(), token = reading.refreshKey;
    if (this.disposed || !scope || !this.visible || this.root.closest("[hidden]") || this.blocked || !state.automatic || state.busy || !reading.briefing) {
      this.clearTimers();
      return;
    }
    if (this.watchTimer === null) {
      this.watchTimer = window.setTimeout(async () => {
        this.watchTimer = null;
        if (this.same(scope, state) && this.visible && !this.root.closest("[hidden]") && state.automatic && !state.busy && !this.blocked && !(await logseq.Editor.checkEditing()) && !this.reading.read().pendingRequests.length) {
          await this.reading.refresh();
        }
        if (this.same(scope, state) && !this.disposed) this.schedule();
      }, 15000);
    }
    const eligible = reading.briefing.status === "stale" && reading.candidate?.status !== "ready" && !!token && token !== state.attempted;
    if (!eligible) {
      if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
      this.autoTimer = null;
      this.autoKey = null;
      return;
    }
    if (this.autoTimer !== null && this.autoKey === token) return;
    if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
    this.autoKey = token;
    this.autoTimer = window.setTimeout(async () => {
      this.autoTimer = null;
      this.autoKey = null;
      if (!this.same(scope, state) || !state.automatic || state.busy || !this.visible || this.root.closest("[hidden]") || this.blocked) return;
      const latest = this.reading.read();
      if (latest.refreshKey !== token || latest.briefing?.status !== "stale" || latest.candidate?.status === "ready" || (await logseq.Editor.checkEditing()) || latest.pendingRequests.length) {
        this.schedule();
        return;
      }
      state.attempted = token;
      void this.run("organize", false, true);
    }, 4000);
  }

  reviewCandidate(anchor?: HTMLElement): void {
    if (!this.reading.read().candidate) return;
    this.candidateFocus = anchor ?? this.candidateButton;
    this.state.review = true;
    this.updateCandidate();
    this.positionCandidate();
    this.candidateBox.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }

  private positionCandidate = (): void => {
    if (this.candidateBox.hidden) return;
    const rect = this.candidateFocus?.getBoundingClientRect() ?? this.root.getBoundingClientRect();
    this.candidateBox.style.maxHeight = `${Math.min(window.innerHeight * 0.65, window.innerHeight - 24)}px`;
    const height = this.candidateBox.offsetHeight;
    this.candidateBox.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - height - 12))}px`;
  };

  private closeCandidate(): void {
    this.state.review = false;
    this.candidateBox.hidden = true;
    const anchor = this.candidateFocus;
    ((anchor?.isConnected && !anchor.closest("[hidden]")) ? anchor : this.toggle).focus({ preventScroll: true });
  }

  private updateCandidate(): void {
    const state = this.state, reading = this.reading.read(), candidate = reading.candidate, article = !!reading.activePlan?.briefing;
    this.candidateButton.hidden = !candidate || article;
    this.candidateBox.hidden = !candidate || !state.review;
    if (!candidate) { state.review = false; this.candidateSignature = ""; return; }
    if (!state.review) return;
    const previous = reading.activePlan?.planId === candidate.planId ? reading.activePlan.briefing : reading.briefing?.planId === candidate.planId ? reading.briefing : null;
    const signature = JSON.stringify([candidate, previous?.paragraphs, this.blocked, state.busy]);
    if (signature === this.candidateSignature) return;
    this.candidateSignature = signature;
    const header = element("div", "", "wb-ai-candidate-head");
    const adopt = button("采用修订", () => void this.adoptCandidate());
    adopt.disabled = candidate.status !== "ready" || this.blocked || state.busy;
    header.append(element("strong", candidate.status === "ready" ? "候选修订" : "候选依据已变化"), adopt, button("暂不采用", () => this.closeCandidate()));
    const preview = element("article", "", "wb-ai-candidate-body");
    const old = new Map((previous ? briefingParagraphs(previous) : []).map((unit) => [unit.key, unit]));
    for (const paragraph of briefingParagraphs(candidate)) {
      const existing = old.get(paragraph.key);
      if (existing && JSON.stringify(existing) === JSON.stringify(paragraph)) continue;
      const unit = element("section", "", "wb-ai-candidate-unit"), body = element("div");
      body.innerHTML = renderMarkdown(paragraph.markdown);
      unit.append(body);
      for (const detail of paragraph.details ?? []) {
        const part = element("div", "", "wb-ai-candidate-detail");
        part.innerHTML = renderMarkdown(detail.markdown);
        unit.append(part);
      }
      if (existing) {
        const before = element("details"), content = element("div");
        content.innerHTML = renderMarkdown(existing.markdown);
        before.append(element("summary", "原文稿"), content);
        unit.append(before);
      }
      preview.append(unit);
    }
    const missing = previous ? briefingParagraphs(previous).filter((unit) => !briefingParagraphs(candidate).some((proposed) => proposed.key === unit.key)) : [];
    if (missing.length) {
      const removed = element("details");
      removed.append(element("summary", "本次不再单独呈现的段落"));
      for (const item of missing) {
        const block = element("div");
        block.innerHTML = renderMarkdown(item.markdown);
        removed.append(block);
      }
      preview.append(removed);
    }
    if (!preview.childElementCount) preview.append(element("p", "文章表述未改动；采用会更新依据版本。"));
    for (const link of Array.from(preview.querySelectorAll("a"))) link.replaceWith(...Array.from(link.childNodes));
    this.candidateBox.replaceChildren(header, preview);
    this.positionCandidate();
  }

  private async adoptCandidate(): Promise<void> {
    const state = this.state, scope = this.scope;
    if (!scope || this.blocked || (await logseq.Editor.checkEditing())) return;
    const result = await this.reading.adopt();
    if (!this.same(scope, state)) return;
    if (result.ok) { this.closeCandidate(); state.notice = ""; }
    else state.notice = text(result.reason);
    this.paint();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.clearPollTimer();
    window.removeEventListener("resize", this.positionCandidate);
    for (const state of this.states.values()) state.job?.abort();
    this.root.remove();
  }

  private showAnswer() {
    const answer = this.state.answer, scope = this.scope;
    this.result.replaceChildren();
    this.result.hidden = !answer;
    if (!answer || !scope) return;
    const rendered = element("div", "", "wb-ai-answer");
    rendered.innerHTML = renderMarkdown(answer.text);
    for (const link of Array.from(rendered.querySelectorAll("a"))) link.replaceWith(...Array.from(link.childNodes));
    const label = element("small", "", "wb-progressive-version");
    label.dataset.answerBasis = answer.source.sourceSetVersion;
    label.dataset.answerTime = answer.source.capturedAt;
    const refs = element("div", "", "wb-ai-references");
    for (const id of answer.sourceIds) {
      const source = answer.source.blocks.find((block) => block.sourceId === id);
      if (source) {
        const details = element("details");
        details.append(element("summary", `依据 · ${source.content?.split("\n")[0]?.slice(0, 52) ?? "原文记录"}`), element("pre", source.content ?? ""), button("查看当前原块", () => this.actions.locate(source.target.blockUuid)));
        refs.append(details);
      }
    }
    for (const id of answer.materialIds) refs.append(button("查看相关材料", () => this.actions.material(id)));
    const actions = element("div", "", "wb-ai-tools");
    actions.append(
      button("复制", () => void copyMaterialLink(answer.text).then(() => { this.state.notice = "已复制。"; this.status.textContent = this.state.notice; }).catch((error) => { this.state.notice = text(error); this.status.textContent = this.state.notice; })),
      button("插入为新块", () => void this.write(answer, scope, false))
    );
    if (answer.rewrite) {
      actions.append(button(this.state.confirm ? "确认替换原块" : "用此结果替换原块…", () => {
        if (this.state.confirm) void this.write(answer, scope, true);
        else { this.state.confirm = true; this.paint(); }
      }));
      if (this.state.confirm) {
        const confirm = element("div", "", "wb-ai-confirm");
        confirm.append(element("small", "将以下整块原文替换为上面的结果（仅普通块，保存版本必须未变化）："), element("pre", answer.rewrite.content ?? ""), button("取消替换", () => { this.state.confirm = false; this.paint(); }));
        this.result.append(confirm);
      }
    }
    this.result.append(label, rendered, refs, actions);
    this.updateAnswerBasis();
  }

  private updateAnswerBasis() {
    const label = this.result.querySelector<HTMLElement>("[data-answer-basis]");
    if (!label) return;
    const basis = label.dataset.answerBasis!, current = this.reading.read().sourceSetVersion, stale = !!current && basis !== current;
    label.hidden = !stale;
    label.textContent = stale ? `原文有更新 · ${new Date(label.dataset.answerTime!).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 读取` : "";
    label.classList.toggle("wb-progressive-changed", stale);
  }

  private async write(answer: Answer, scope: SourceScope, replace: boolean) {
    const state = this.state;
    const check = async () => {
      if (!this.same(scope, state) || graphIdentity(await logseq.App.getCurrentGraph()) !== scope.graphId || (await logseq.Editor.checkEditing())) {
        throw new Error("请先结束原生输入并保持在当前工作，再确认写入。");
      }
    };
    try {
      await check();
      if (replace && answer.rewrite) {
        const before = answer.rewrite, current = await logseq.Editor.getBlock(before.target.blockUuid);
        if (typeof current?.content !== "string" || !ordinary(before, scope) || (await sha256(current.content)) !== before.contentVersion) {
          throw new Error("原块已变化，请重新改写。原文未修改。");
        }
        await check();
        await logseq.Editor.updateBlock(before.target.blockUuid, answer.text);
        if ((await logseq.Editor.getBlock(before.target.blockUuid))?.content !== answer.text) throw new Error("写入结果尚未核验，请查看原块。");
      } else {
        const last = scope.kind === "page" ? (await logseq.Editor.getPageBlocksTree(scope.pageName!))?.at(-1) : null;
        const options = { sibling: scope.kind === "page", focus: false };
        await check();
        const inserted = scope.kind === "page"
          ? (last ? await logseq.Editor.insertBlock(last.uuid, answer.text, options) : await logseq.Editor.appendBlockInPage(scope.pageName!, answer.text))
          : await logseq.Editor.insertBlock(scope.rootUuid, answer.text, options);
        if (!inserted?.uuid) throw new Error("新块写入尚未核验，请查看 Logseq 原页。");
      }
      state.notice = replace ? "普通原块已按你的确认修改。" : "已插入为新块；旧原文保留。";
      state.confirm = false;
      await this.actions.refresh();
    } catch (error) {
      state.notice = text(error);
    }
    if (this.same(scope, state)) this.paint();
  }

  private async continueInDsh() {
    const state = this.state, scope = this.scope;
    if (!scope) return;
    if (this.pointerSelection) { state.selection = this.pointerSelection; this.pointerSelection = null; }
    state.busy = true;
    state.notice = "正在准备 DSH 协作…";
    this.paint();
    let requestId: string | undefined;
    try {
      const requested = await this.reading.request({ schemaVersion: 1, purpose: "继续当前工作" });
      if (!requested.ok) throw new Error(requested.reason);
      requestId = requested.value.requestId;
      const source = requested.value.source;
      const basis = state.answer?.sourceIds.length ? state.answer.source : source;
      const referenced = [...new Set([...(state.answer?.sourceIds ?? []), ...basis.blocks.filter((block) => block.target.blockUuid === state.selection?.uuid).map((block) => block.sourceId)])];
      const ids = (referenced.length ? referenced : basis.blocks.map((block) => block.sourceId)).slice(0, 128);
      if (!this.same(scope, state)) throw new Error("scope-mismatch");
      const article = this.reading.read().briefing;
      const readingResult = state.answer?.text ?? article?.paragraphs.map((unit) => unit.markdown).join("\n\n");
      await this.port.handoff(scope, {
        request: state.question.trim() || "继续处理当前工作",
        sourceIds: ids,
        ...(state.selection ? { selection: state.selection.text } : {}),
        basisVersion: basis.sourceSetVersion,
        ...(readingResult ? { result: readingResult.slice(0, 8000) } : {}),
      });
      const notice = "已交接，请在 DSH 查看草稿。";
      state.notice = notice;
      window.setTimeout(() => { if (state.notice === notice) { state.notice = ""; if (this.same(scope, state) && !this.disposed) this.paint(); } }, 8000);
    } catch (error) {
      state.notice = text(error);
    } finally {
      if (requestId) this.reading.cancel(requestId);
      state.busy = false;
      if (this.same(scope, state)) this.paint();
    }
  }
}
