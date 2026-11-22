import {
  slotShortLabel,
  type ActiveFocusSession,
  type StageSnapshot,
  type StageUserAction,
  type TimeUserAction,
} from "@task-copilot/stage-runtime";

export interface QuietFocusCapsulePort {
  fetchSnapshot(): Promise<StageSnapshot | null>;
  dispatch(action: StageUserAction): Promise<StageSnapshot | null>;
  onOpenStage(): void;
  onNavigateWork(session: ActiveFocusSession): Promise<void>;
  onEnterFocusMode?(session: ActiveFocusSession): void | Promise<void>;
  onZenModeChange?(enabled: boolean, session: ActiveFocusSession | null): void | Promise<void>;
  onExitFocusMode?(previousSession: ActiveFocusSession | null): void | Promise<void>;
  notify(message: string, status?: "success" | "warning"): void;
  pollIntervalMs?: number;
}

const CAPSULE_CSS = `
.tcs-lsq-focus-bar {
  position: fixed;
  top: 7px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: min(780px, calc(100vw - 32px));
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 128, 140, 0.28);
  background: var(--ls-primary-background-color, #f7f6f2);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 8px 24px -12px rgba(15, 20, 28, 0.24);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
  font-size: 12px;
  line-height: 1.4;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  pointer-events: auto;
  user-select: none;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.tcs-lsq-focus-bar * {
  -webkit-app-region: no-drag;
  app-region: no-drag;
  pointer-events: auto;
}
.tcs-lsq-focus-bar.is-zen {
  border-color: rgba(59, 110, 165, 0.45);
  box-shadow: 0 0 0 2px rgba(59, 110, 165, 0.10), 0 8px 24px -12px rgba(15, 20, 28, 0.24);
}
.tcs-lsq-focus-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3b6ea5;
  flex-shrink: 0;
}
.tcs-lsq-focus-dot.is-paused {
  background: #8a919c;
}
.tcs-lsq-focus-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tcs-lsq-focus-btn {
  border: 1px solid rgba(120, 128, 140, 0.26);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
}
.tcs-lsq-focus-btn:hover {
  border-color: #3b6ea5;
  color: #3b6ea5;
}
.tcs-lsq-focus-btn.is-active {
  background: rgba(59, 110, 165, 0.12);
  border-color: rgba(59, 110, 165, 0.48);
  color: #3b6ea5;
}
.tcs-lsq-focus-btn.is-primary {
  background: #3b6ea5;
  border-color: #3b6ea5;
  color: #ffffff;
}
.tcs-lsq-focus-input {
  width: 220px;
  max-width: 42vw;
  border: 1px solid rgba(120, 128, 140, 0.32);
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11.5px;
  background: var(--ls-secondary-background-color, #ffffff);
  color: inherit;
  outline: none;
  user-select: text;
}
.tcs-lsq-focus-input:focus {
  border-color: #3b6ea5;
}
body.tc-focus-zen::before {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(59, 110, 165, 0.55);
  z-index: 9998;
  pointer-events: none;
}
body.tc-focus-zen .cp__header .l,
body.tc-focus-zen .cp__header .r {
  opacity: 0.16;
  transition: opacity 220ms ease;
}
body.tc-focus-zen .cp__header:hover .l,
body.tc-focus-zen .cp__header:hover .r,
body.tc-focus-zen .cp__header:focus-within .l,
body.tc-focus-zen .cp__header:focus-within .r {
  opacity: 1;
}
body.tc-focus-zen .cp__sidebar-help-btn {
  opacity: 0.12;
  transition: opacity 220ms ease;
}
body.tc-focus-zen .cp__sidebar-help-btn:hover {
  opacity: 0.9;
}
`;

export function formatFocusStatusLine(session: ActiveFocusSession, now = Date.now()): string {
  const runningSec =
    session.status === "running" ? Math.max(0, Math.floor((now - session.resumedAt) / 1000)) : 0;
  const elapsedMinutes = Math.floor((session.accumulatedSeconds + runningSec) / 60);
  const pausedSuffix = session.status === "paused" ? "（已暂停）" : "";
  return `${slotShortLabel(session.slotId)} · ${session.roleLabel}：${session.title} · 已进行 ${elapsedMinutes}m${pausedSuffix}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function targetDocument(): Document | null {
  try {
    if (typeof window !== "undefined" && window.top?.document) {
      return window.top.document;
    }
  } catch {
    // fallback to local document
  }
  return typeof document !== "undefined" ? document : null;
}

/**
 * Quiet top-bar count-up focus capsule for Logseq execution mode:
 * visible only while an active focus session is running/paused; zero emoji, zero countdown stress.
 */
export class QuietFocusCapsule {
  private el: HTMLDivElement | null = null;
  private session: ActiveFocusSession | null = null;
  private finishing = false;
  private zenEnabled = true;
  private lastNavigatedKey: string | null = null;
  private pollTimer: number | null = null;
  private tickTimer: number | null = null;
  private disposed = false;

  constructor(private readonly port: QuietFocusCapsulePort) {}

  get activeSession(): ActiveFocusSession | null {
    return this.session;
  }

  get isZenActive(): boolean {
    return Boolean(this.session && this.session.status === "running" && this.zenEnabled);
  }

  private ensureStyle(doc: Document): void {
    const existing = doc.getElementById("tcs-lsq-focus-style");
    if (existing) {
      if (existing.textContent !== CAPSULE_CSS) existing.textContent = CAPSULE_CSS;
      return;
    }
    const style = doc.createElement("style");
    style.id = "tcs-lsq-focus-style";
    style.textContent = CAPSULE_CSS;
    doc.head.appendChild(style);
  }

  private syncZenClass(doc: Document | null): void {
    if (!doc?.body) return;
    doc.body.classList.toggle("tc-focus-zen", this.isZenActive);
  }

  start(): void {
    if (this.disposed) return;
    void this.pollNow();
    if (typeof window !== "undefined") {
      if (this.pollTimer === null) {
        this.pollTimer = window.setInterval(() => {
          void this.pollNow();
        }, this.port.pollIntervalMs ?? 4_000);
      }
      if (this.tickTimer === null) {
        this.tickTimer = window.setInterval(() => {
          if (this.session && this.session.status === "running" && !this.finishing) {
            this.render();
          }
        }, 15_000);
      }
    }
  }

  async pollNow(): Promise<void> {
    if (this.disposed) return;
    try {
      const snap = await this.port.fetchSnapshot();
      if (snap && !this.disposed) {
        this.syncFromSnapshot(snap);
      }
    } catch {
      // Companion offline -> fail open quietly without disturbing Logseq writing.
    }
  }

  syncFromSnapshot(snapshot: StageSnapshot): void {
    if (this.disposed) return;
    const prev = this.session;
    const next = snapshot.time?.activeFocus ?? null;
    const enteredNew = Boolean(next && (!prev || prev.id !== next.id));
    const exited = Boolean(prev && !next);

    this.session = next;
    if (enteredNew) {
      this.finishing = false;
      this.zenEnabled = true;
    } else if (!next) {
      this.finishing = false;
    }

    this.render();

    const enterPromise = enteredNew && next
      ? Promise.resolve(this.port.onEnterFocusMode?.(next)).catch(() => undefined)
      : Promise.resolve();

    if (exited) {
      void Promise.resolve(this.port.onExitFocusMode?.(prev)).catch(() => undefined);
    }

    if (next && next.pendingNavigationAt !== undefined) {
      const navKey = `${next.id}:${next.pendingNavigationAt}`;
      if (this.lastNavigatedKey !== navKey) {
        this.lastNavigatedKey = navKey;
        void enterPromise
          .then(() => this.port.onNavigateWork(next))
          .catch(() => undefined)
          .finally(() => {
            void this.dispatchTime({ type: "ack-focus-navigation" });
          });
      }
    }
  }

  private async dispatchTime(action: TimeUserAction): Promise<void> {
    try {
      const next = await this.port.dispatch({ type: "time", action });
      if (next && !this.disposed) {
        this.syncFromSnapshot(next);
      }
    } catch {
      // Fail open quietly
    }
  }

  private render(): void {
    const doc = targetDocument();
    if (!doc) return;
    if (!this.session) {
      this.syncZenClass(doc);
      this.el?.remove();
      this.el = null;
      return;
    }
    this.ensureStyle(doc);
    this.syncZenClass(doc);
    if (!this.el) {
      const div = doc.createElement("div");
      div.className = "tcs-lsq-focus-bar";
      div.setAttribute("role", "status");
      div.setAttribute("aria-label", "当前专注状态");
      div.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (!target || !this.session) return;
        if (target.closest("[data-fc-zen]")) {
          this.zenEnabled = !this.zenEnabled;
          this.render();
          void Promise.resolve(this.port.onZenModeChange?.(this.zenEnabled, this.session)).catch(() => undefined);
          return;
        }
        if (target.closest("[data-fc-pause]")) {
          const paused = this.session.status === "paused";
          void this.dispatchTime({ type: paused ? "resume-focus" : "pause-focus" });
          return;
        }
        if (target.closest("[data-fc-finish-open]")) {
          this.finishing = true;
          this.render();
          this.el?.querySelector<HTMLInputElement>("[data-fc-stop-input]")?.focus();
          return;
        }
        if (target.closest("[data-fc-finish-cancel]")) {
          this.finishing = false;
          this.render();
          return;
        }
        if (target.closest("[data-fc-zoom]")) {
          this.port.onOpenStage();
        }
      });
      div.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.finishing) {
          event.preventDefault();
          event.stopPropagation();
          this.finishing = false;
          this.render();
        }
      });
      div.addEventListener("submit", (event) => {
        const form = event.target as HTMLFormElement | null;
        if (!form || !form.hasAttribute("data-fc-finish-form")) return;
        event.preventDefault();
        const input = form.querySelector<HTMLInputElement>("[data-fc-stop-input]");
        const stopNote = input?.value.trim() ?? "";
        this.finishing = false;
        const restoreSuffix = this.port.onExitFocusMode ? "，已恢复专注前现场" : "";
        void this.dispatchTime({
          type: "finish-focus",
          ...(stopNote ? { stopNote } : {}),
        }).then(() => {
          this.port.notify(
            stopNote ? `已结束专注并记下停点便条${restoreSuffix}` : `已结束专注并累计投入时长${restoreSuffix}`,
            "success",
          );
        });
      });
      doc.body.appendChild(div);
      this.el = div;
    }

    this.el.classList.toggle("is-zen", this.isZenActive);
    const line = formatFocusStatusLine(this.session);
    if (this.finishing) {
      this.el.innerHTML = `
        <span class="tcs-lsq-focus-dot ${this.session.status === "paused" ? "is-paused" : ""}"></span>
        <form data-fc-finish-form style="display:inline-flex;align-items:center;gap:6px;margin:0;">
          <input class="tcs-lsq-focus-input" data-fc-stop-input type="text" placeholder="可选：留一句停点便条，回车结束" maxlength="240" />
          <button type="submit" class="tcs-lsq-focus-btn is-primary">确认结束</button>
          <button type="button" class="tcs-lsq-focus-btn" data-fc-finish-cancel>取消</button>
        </form>
      `;
    } else {
      this.el.innerHTML = `
        <span class="tcs-lsq-focus-dot ${this.session.status === "paused" ? "is-paused" : ""}"></span>
        <span class="tcs-lsq-focus-text">${esc(line)}</span>
        <button type="button" class="tcs-lsq-focus-btn ${this.isZenActive ? "is-active" : ""}" data-fc-zen title="${this.zenEnabled ? "关闭静心降噪（保持专注计时）" : "开启静心降噪（隐藏侧栏与顶栏干扰）"}">静心</button>
        <button type="button" class="tcs-lsq-focus-btn" data-fc-pause>${this.session.status === "paused" ? "继续" : "暂停"}</button>
        <button type="button" class="tcs-lsq-focus-btn" data-fc-finish-open>结束</button>
        <button type="button" class="tcs-lsq-focus-btn" data-fc-zoom>拉远</button>
      `;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    const doc = targetDocument();
    doc?.body?.classList.remove("tc-focus-zen");
    this.el?.remove();
    this.el = null;
  }
}
