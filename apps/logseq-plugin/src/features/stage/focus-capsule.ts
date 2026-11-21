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
  notify(message: string, status?: "success" | "warning"): void;
  pollIntervalMs?: number;
}

const CAPSULE_CSS = `
.tcs-lsq-focus-bar {
  position: fixed;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 960;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(760px, calc(100vw - 32px));
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 128, 140, 0.28);
  background: var(--ls-primary-background-color, #f7f6f2);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 8px 24px -12px rgba(15, 20, 28, 0.24);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
  font-size: 12px;
  line-height: 1.4;
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
}
.tcs-lsq-focus-btn:hover {
  border-color: #3b6ea5;
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
}
.tcs-lsq-focus-input:focus {
  border-color: #3b6ea5;
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

/**
 * Quiet top-bar count-up focus capsule for Logseq execution mode:
 * visible only while an active focus session is running/paused; zero emoji, zero countdown stress.
 */
export class QuietFocusCapsule {
  private el: HTMLDivElement | null = null;
  private session: ActiveFocusSession | null = null;
  private finishing = false;
  private lastNavigatedKey: string | null = null;
  private pollTimer: number | null = null;
  private tickTimer: number | null = null;
  private disposed = false;

  constructor(private readonly port: QuietFocusCapsulePort) {}

  get activeSession(): ActiveFocusSession | null {
    return this.session;
  }

  private ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById("tcs-lsq-focus-style")) return;
    const style = document.createElement("style");
    style.id = "tcs-lsq-focus-style";
    style.textContent = CAPSULE_CSS;
    document.head.appendChild(style);
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
    const next = snapshot.time?.activeFocus ?? null;
    const prevId = this.session?.id ?? null;
    this.session = next;
    if (!next || next.id !== prevId) {
      this.finishing = false;
    }
    this.render();

    if (next && next.pendingNavigationAt !== undefined) {
      const navKey = `${next.id}:${next.pendingNavigationAt}`;
      if (this.lastNavigatedKey !== navKey) {
        this.lastNavigatedKey = navKey;
        void this.port
          .onNavigateWork(next)
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
    if (typeof document === "undefined") return;
    if (!this.session) {
      this.el?.remove();
      this.el = null;
      return;
    }
    this.ensureStyle();
    if (!this.el) {
      const div = document.createElement("div");
      div.className = "tcs-lsq-focus-bar";
      div.setAttribute("role", "status");
      div.setAttribute("aria-label", "当前专注状态");
      div.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (!target || !this.session) return;
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
      div.addEventListener("submit", (event) => {
        const form = event.target as HTMLFormElement | null;
        if (!form || !form.hasAttribute("data-fc-finish-form")) return;
        event.preventDefault();
        const input = form.querySelector<HTMLInputElement>("[data-fc-stop-input]");
        const stopNote = input?.value.trim() ?? "";
        this.finishing = false;
        void this.dispatchTime({
          type: "finish-focus",
          ...(stopNote ? { stopNote } : {}),
        }).then(() => {
          this.port.notify(stopNote ? "已结束专注并记下停点便条" : "已结束专注并累计投入时长", "success");
        });
      });
      document.body.appendChild(div);
      this.el = div;
    }

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
    this.el?.remove();
    this.el = null;
  }
}
