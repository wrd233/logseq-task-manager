import type { ActiveFocusSession, StageSnapshot, StageUserAction, TimeUserAction } from "@task-copilot/stage-runtime";
import { hostDocument } from "../../host/panel-host.ts";
import type { FlowMode, PaperAnchor } from "./flow-mode.ts";
import type { PaperScene, PaperStop } from "./paper-scene.ts";

export interface QuietFocusCapsulePort {
  fetchSnapshot(): Promise<StageSnapshot | null>;
  dispatch(action: StageUserAction): Promise<StageSnapshot | null>;
  onOpenStage(): void;
  onOpenWorkbench?(): void;
  onNavigateWork(session: ActiveFocusSession): Promise<boolean>;
  onEnterFocusMode?(session: ActiveFocusSession): void | Promise<void>;
  onExitFocusMode?(previousSession: ActiveFocusSession | null): void | Promise<void>;
  onSaveStop?(scene: PaperScene | null, text: string, anchor: PaperAnchor | null): Promise<void>;
  onReadAnchor?(uuid: string, scene: PaperScene | null): Promise<string | undefined>;
  onReturnToAnchor?(anchor: PaperAnchor | null, scene: PaperScene | null): void | Promise<void>;
  notify(message: string, status?: "success" | "warning"): void;
  flow?: FlowMode;
  pollIntervalMs?: number;
}

const CAPSULE_CSS = `
body.tc-focus-zen::before {
  content: ""; position: fixed; inset: 0 0 auto; height: 2px; z-index: 9998;
  background: var(--ls-link-text-color, #316292); opacity: .45; pointer-events: none;
}
.tcs-lsq-focus-bar {
  position: fixed; z-index: 9999; top: 8px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 60px);
  padding: 0 4px; line-height: 1.4; font-size: 12px; color: var(--ls-secondary-text-color, #626872);
  background: var(--ls-primary-background-color, #faf9f5); white-space: nowrap;
  -webkit-app-region: no-drag; pointer-events: auto;
}
.tcs-lsq-focus-bar button, .tcs-lsq-focus-bar input { -webkit-app-region: no-drag; }
.tcs-lsq-focus-bar button {
  border: 0; background: transparent; padding: 4px; color: inherit; font: inherit; cursor: pointer;
}
.tcs-lsq-focus-bar button:hover, .tcs-lsq-focus-bar button:focus-visible { color: var(--ls-link-text-color, #316292); }
.tcs-lsq-focus-bar [data-fc-last-stop] { max-width: min(28vw, 230px); overflow: hidden; text-overflow: ellipsis; }
.tcs-lsq-focus-bar [aria-pressed="true"] { color: var(--ls-link-text-color, #316292); }
.tcs-lsq-focus-slip {
  position: absolute; top: calc(100% + 10px); right: 0; width: min(440px, calc(100vw - 28px));
  padding: 14px 16px; border-top: 1px solid var(--ls-border-color, #dad6cb);
  background: var(--ls-primary-background-color, #faf9f5); color: var(--ls-primary-text-color, #1e2124);
  font-size: 13px; white-space: normal; overflow-wrap: anywhere; -webkit-app-region: no-drag;
}
.tcs-lsq-focus-slip p { margin: 0 0 8px; }
.tcs-lsq-focus-slip ul { margin: 0 0 8px; padding-inline-start: 16px; }
.tcs-lsq-focus-slip form { display: flex; align-items: baseline; gap: 6px; margin: 0; }
.tcs-lsq-focus-slip input {
  flex: 1; min-width: 0; padding: 5px 0; outline: none; border: 0;
  border-bottom: 1px solid var(--ls-border-color, #dad6cb); background: transparent; color: inherit; font: inherit;
}
.tcs-lsq-focus-slip input:focus { border-color: var(--ls-link-text-color, #316292); }
.tcs-lsq-focus-draft { padding-left: 10px; margin-top: 8px; border-left: 1px dashed var(--ls-border-color, #dad6cb); color: var(--ls-secondary-text-color, #626872); }
`;

export function elapsedFocusMinutes(session: ActiveFocusSession, now = Date.now()): number {
  const running = session.status === "running" ? Math.max(0, Math.floor((now - session.resumedAt) / 1000)) : 0;
  return Math.floor((session.accumulatedSeconds + running) / 60);
}

export class QuietFocusCapsule {
  private readonly document: Document | null;
  private readonly style: HTMLStyleElement | undefined;
  private el: HTMLDivElement | null = null;
  private scene: PaperScene | null = null;
  private stop: PaperStop | null = null;
  private snapshot: StageSnapshot | null = null;
  private session: ActiveFocusSession | null = null;
  private slip: "breathe" | "pause" | null = null;
  private anchor: PaperAnchor | null = null;
  private draft = "";
  private renderKey = "";
  private saving = false;
  private navigating: string | null = null;
  private navigated: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  constructor(private readonly port: QuietFocusCapsulePort) {
    this.document = port.flow?.document ?? hostDocument();
    if (this.document) {
      this.style = this.document.createElement("style");
      this.style.id = "tcs-lsq-focus-style";
      this.style.textContent = CAPSULE_CSS;
      this.document.head.append(this.style);
    }
  }

  get activeSession(): ActiveFocusSession | null { return this.session; }
  get isZenActive(): boolean { return Boolean(this.scene && this.session?.status === "running"); }

  setScene(scene: PaperScene | null, stop: PaperStop | null = null): void {
    if (scene?.uuid !== this.scene?.uuid || scene?.graphId !== this.scene?.graphId) {
      this.slip = null;
      this.anchor = null;
    }
    this.scene = scene;
    this.stop = stop;
    this.render();
  }

  start(): void {
    if (this.disposed || this.pollTimer) return;
    void this.pollNow();
    this.pollTimer = setInterval(() => { void this.pollNow(); }, this.port.pollIntervalMs ?? 4000);
  }

  async pollNow(): Promise<void> {
    if (this.disposed) return;
    try {
      const snapshot = await this.port.fetchSnapshot();
      if (snapshot) this.syncFromSnapshot(snapshot);
    } catch { /* Local notes remain available while Companion is offline. */ }
  }

  syncFromSnapshot(snapshot: StageSnapshot): void {
    if (this.disposed || (this.snapshot && snapshot.version < this.snapshot.version && snapshot.generatedAt <= this.snapshot.generatedAt)) return;
    const previous = this.session;
    const next = snapshot.time?.activeFocus ?? null;
    this.snapshot = snapshot;
    this.session = next;
    if (previous?.id !== next?.id) {
      this.slip = null;
      this.draft = "";
      if (!next) void Promise.resolve(this.port.onExitFocusMode?.(previous)).catch(() => undefined);
    }
    this.render();
    if (!next) return;
    const enter = previous?.id !== next.id
      ? Promise.resolve(this.port.onEnterFocusMode?.(next))
      : Promise.resolve();
    const key = next.pendingNavigationAt === undefined ? null : `${next.id}:${next.pendingNavigationAt}`;
    void enter.then(async () => {
      if (!key || this.session?.id !== next.id || this.navigating === key || this.navigated === key || this.port.flow?.isComposing) return;
      this.navigating = key;
      try {
        if (await this.port.onNavigateWork(next)) {
          this.navigated = key;
          await this.dispatchTime({ type: "ack-focus-navigation", sessionId: next.id });
        }
      } finally {
        if (this.navigating === key) this.navigating = null;
      }
    }).catch(() => undefined);
  }

  private async dispatchTime(action: TimeUserAction): Promise<void> {
    const result = await this.port.dispatch({ type: "time", action });
    if (result) this.syncFromSnapshot(result);
  }

  private makeButton(label: string, attribute: string): HTMLButtonElement {
    const button = this.document!.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute(attribute, "");
    return button;
  }

  private render(): void {
    const doc = this.document;
    if (!doc || this.disposed) return;
    doc.body.classList.toggle("tc-focus-zen", this.isZenActive);
    if (!this.scene) {
      this.el?.remove();
      this.el = null;
      this.renderKey = "";
      return;
    }
    const key = JSON.stringify([this.scene.title, this.session?.id, this.session?.status, this.stop, this.slip, this.port.flow?.isParagraphFocusEnabled]);
    if (key === this.renderKey && this.el) return;
    this.renderKey = key;

    if (!this.el) {
      const bar = doc.createElement("div");
      bar.className = "tcs-lsq-focus-bar";
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", "纸面现场");
      bar.addEventListener("pointerdown", (event) => {
        if ((event.target as Element).closest("button[data-fc-breathe], button[data-fc-pause], button[data-fc-last-stop]")) event.preventDefault();
      });
      bar.addEventListener("click", this.onClick);
      bar.addEventListener("keydown", this.onKeyDown);
      bar.addEventListener("submit", this.onSubmit);
      doc.body.append(bar);
      this.el = bar;
    }

    const controls: HTMLElement[] = [];
    if (this.stop?.text) controls.push(this.makeButton(this.stop.text, "data-fc-last-stop"));
    const paragraph = this.makeButton("逐段聚焦", "data-fc-paragraph");
    paragraph.setAttribute("aria-pressed", String(this.port.flow?.isParagraphFocusEnabled ?? true));
    if (this.port.flow) controls.push(paragraph);
    if (this.session) {
      controls.push(this.makeButton("抬头换气", "data-fc-breathe"));
      controls.push(this.session.status === "paused"
        ? this.makeButton("继续", "data-fc-resume")
        : this.makeButton("暂停", "data-fc-pause"));
      if (this.session.status === "paused") controls.push(this.makeButton("结束专注", "data-fc-finish"));
    }
    if (this.port.onOpenWorkbench) controls.push(this.makeButton("工作台", "data-fc-workbench"));
    controls.push(this.makeButton("日程", "data-fc-zoom"));
    if (this.slip && this.session) controls.push(this.renderSlip(doc, this.session));
    this.el.replaceChildren(...controls);
  }

  private renderSlip(doc: Document, session: ActiveFocusSession): HTMLElement {
    const slip = doc.createElement("section");
    slip.className = "tcs-lsq-focus-slip";
    if (this.slip === "breathe") {
      slip.setAttribute("aria-label", "抬头换气");
      const pending = this.snapshot?.inbox.filter((item) => item.pocket === "sweep" && !item.cooled) ?? [];
      const text = doc.createElement("p");
      text.textContent = `已专注 ${elapsedFocusMinutes(session)} 分钟 · 今日小尾巴 ${pending.length} 项`;
      slip.append(text);
      if (pending.length) {
        const list = doc.createElement("ul");
        for (const item of pending.slice(0, 3)) {
          const row = doc.createElement("li");
          row.textContent = item.text;
          list.append(row);
        }
        slip.append(list);
      }
      slip.append(this.makeButton("回到刚写的那行", "data-fc-return"));
    } else {
      const form = doc.createElement("form");
      form.dataset.fcPauseForm = "";
      const input = doc.createElement("input");
      input.setAttribute("aria-label", "留一句停点");
      input.placeholder = "留一句停点";
      input.name = "stopNote";
      input.maxLength = 240;
      const submit = this.makeButton("保存停点", "data-fc-save-stop");
      submit.type = "submit";
      form.append(input, submit, this.makeButton("先走", "data-fc-leave"), this.makeButton("取消", "data-fc-return"));
      slip.append(form);
      if (this.draft) {
        const draft = this.makeButton(this.draft, "data-fc-use-draft");
        draft.className = "tcs-lsq-focus-draft";
        draft.title = "用作停点";
        slip.append(draft);
      }
    }
    return slip;
  }

  private closeSlip(restore: boolean): void {
    const anchor = this.anchor;
    const scene = this.scene;
    this.slip = null;
    this.anchor = null;
    this.render();
    if (restore && !this.port.flow?.isComposing) void this.port.onReturnToAnchor?.(anchor, scene);
  }

  private onClick = (event: MouseEvent) => {
    const button = (event.target as Element | null)?.closest("button");
    if (!button || this.port.flow?.isComposing || this.saving) return;
    if (button.hasAttribute("data-fc-last-stop") && this.stop?.anchor) {
      void this.port.onReturnToAnchor?.({ uuid: this.stop.anchor }, this.scene);
    } else if (button.hasAttribute("data-fc-paragraph")) {
      button.setAttribute("aria-pressed", String(this.port.flow?.toggleParagraphFocus() ?? true));
    } else if (button.hasAttribute("data-fc-workbench")) {
      this.port.onOpenWorkbench?.();
    } else if (button.hasAttribute("data-fc-zoom")) {
      this.port.onOpenStage();
    } else if (button.hasAttribute("data-fc-return")) {
      this.closeSlip(true);
    } else if (button.hasAttribute("data-fc-breathe")) {
      if (this.slip === "breathe") { this.closeSlip(true); return; }
      this.anchor = this.port.flow?.captureAnchor() ?? null;
      this.port.flow?.showChrome();
      this.slip = "breathe";
      this.render();
    } else if (button.hasAttribute("data-fc-pause")) {
      this.anchor = this.port.flow?.captureAnchor() ?? null;
      this.slip = "pause";
      this.render();
      this.el?.querySelector("input")?.focus();
    } else if (button.hasAttribute("data-fc-use-draft")) {
      const input = this.el?.querySelector("input");
      if (input) { input.value = this.draft; input.focus(); }
    } else if (button.hasAttribute("data-fc-leave")) {
      const anchor = this.anchor;
      const session = this.session;
      const scene = this.scene;
      this.closeSlip(false);
      void this.pause("", anchor, scene);
      if (anchor && session) void this.port.onReadAnchor?.(anchor.uuid, scene).then((line) => {
        if (!this.disposed && this.session?.id === session.id && line) this.draft = line;
      }).catch(() => undefined);
    } else if (button.hasAttribute("data-fc-finish")) {
      void this.dispatchTime({ type: "finish-focus" }).catch(this.reportError);
    } else if (button.hasAttribute("data-fc-resume")) {
      const scene = this.scene;
      const uuid = this.session?.lastBlockUuid;
      void this.dispatchTime({ type: "resume-focus" })
        .then(() => this.port.onReturnToAnchor?.(uuid ? { uuid } : null, scene))
        .catch(this.reportError);
    }
  };

  private reportError = (error: unknown) => {
    this.port.notify(error instanceof Error ? error.message : "专注状态更新失败", "warning");
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || this.port.flow?.isComposing || !this.slip) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeSlip(true);
    } else if (this.slip === "pause" && event.key === "Enter" && (event.target as Element | null)?.tagName === "INPUT") {
      event.preventDefault();
      event.stopPropagation();
      (event.target as HTMLInputElement).form?.requestSubmit();
    }
  };

  private onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (this.port.flow?.isComposing || this.saving || this.slip !== "pause") return;
    const value = (event.target as HTMLFormElement).querySelector("input")?.value.trim();
    if (value) void this.pause(value, this.anchor, this.scene);
  };

  private async pause(stopNote: string, anchor: PaperAnchor | null, scene: PaperScene | null): Promise<void> {
    if (!this.session) return;
    const sessionId = this.session.id;
    this.saving = true;
    try {
      await this.dispatchTime({
        type: "pause-focus", sessionId,
        ...(stopNote ? { stopNote } : {}),
        ...(anchor ? { lastBlockUuid: anchor.uuid } : {}),
      });
      if (this.session?.id !== sessionId) return;
      this.closeSlip(false);
      if (stopNote) await this.port.onSaveStop?.(scene, stopNote, anchor);
    } catch (error) {
      this.reportError(error);
    } finally {
      this.saving = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.pollTimer);
    this.document?.body.classList.remove("tc-focus-zen");
    this.el?.remove();
    this.style?.remove();
  }
}
