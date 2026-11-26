import type { CatalogSnapshot } from "@task-copilot/contracts";
import {
  StageEngine,
  TimeEngine,
  mountSharedStageView,
  type ActiveFocusSession,
  type MountedStageView,
  type StageAdvancementItem,
  type StageProjectNode,
  type StageSnapshot,
  type StageUserAction,
  type StageWorkTarget,
} from "@task-copilot/stage-runtime";

export interface GlobalStageRemotePort {
  stageState(): Promise<StageSnapshot>;
  stageAction(action: StageUserAction): Promise<{ snapshot: StageSnapshot; archivedInboxIds: string[]; warning?: string }>;
  stageAnchor(workKey: string): Promise<StageSnapshot>;
}

export interface GlobalStageHostPort {
  remote?: GlobalStageRemotePort | null;
  readLocalCatalog(): Promise<CatalogSnapshot>;
  openProject(project: StageProjectNode): Promise<void>;
  openInDsh?(target: StageWorkTarget): Promise<void>;
  openTargetInLogseq?(target: StageWorkTarget): Promise<void>;
  discussInDsh?(summary: string, snapshot: StageSnapshot): Promise<void>;
  openJournal?(): Promise<void>;
  openFocusWork?(session: ActiveFocusSession): Promise<void>;
  onSnapshot?(snapshot: StageSnapshot): void;
  promoteTodo(item: StageAdvancementItem, project: StageProjectNode | null): Promise<void>;
  openExternalUrl(url: string): Promise<void>;
  onOpenSurface?(): void;
  onCloseSurface?(): void;
  notify(message: string, status?: "success" | "warning"): void;
}

const OVERLAY_CSS = `
.tcs-lsq-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 20, 28, 0.34);
  backdrop-filter: blur(4px);
}
.tcs-lsq-dialog {
  width: min(1160px, calc(100vw - 48px));
  height: min(740px, calc(100vh - 48px));
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(128, 128, 128, 0.28);
  box-shadow: 0 24px 60px -16px rgba(15, 20, 28, 0.42);
  background: #f7f6f2;
  display: flex;
  flex-direction: column;
}
.tcs-lsq-backdrop:has(.tcs-root:is([data-paper-view], [data-restart-view])) {
  padding: 0;
  background: transparent;
  backdrop-filter: none;
}
.tcs-lsq-dialog:has(.tcs-root:is([data-paper-view], [data-restart-view])) {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
`;

export class GlobalStageOverlay {
  private backdrop: HTMLDivElement | null = null;
  private mounted: MountedStageView | null = null;
  private localEngine = new StageEngine();
  private localTimeEngine = new TimeEngine();
  private usingLocal = false;
  private pollTimer: number | null = null;
  private lastPollSignature = "";
  private previousFocus: HTMLElement | null = null;
  private disposed = false;

  constructor(private readonly port: GlobalStageHostPort) {}

  get isOpen(): boolean {
    return this.backdrop !== null;
  }

  private ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById("tcs-lsq-overlay-style")) return;
    const style = document.createElement("style");
    style.id = "tcs-lsq-overlay-style";
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);
  }

  private async fetchSnapshot(anchorWorkKey?: string | null): Promise<StageSnapshot> {
    if (this.port.remote) {
      try {
        const snap = anchorWorkKey
          ? await this.port.remote.stageAnchor(anchorWorkKey)
          : await this.port.remote.stageState();
        this.usingLocal = false;
        this.port.onSnapshot?.(snap);
        return snap;
      } catch {
        // Companion offline -> fail open cleanly to local catalog snapshot
      }
    }
    this.usingLocal = true;
    const now = Date.now();
    const catalog = await this.port.readLocalCatalog();
    if (anchorWorkKey) this.localEngine.anchorFromWorkKey(anchorWorkKey, "logseq", now);
    const snap = this.localEngine.buildSnapshot([catalog], [], now, undefined, undefined, this.localTimeEngine.buildSnapshot(now));
    this.port.onSnapshot?.(snap);
    return snap;
  }

  private async dispatchAction(action: StageUserAction): Promise<StageSnapshot> {
    const reflectionWrite = action.type === "save-evening-note" || action.type === "append-idea-note";
    if ((!this.usingLocal || reflectionWrite) && this.port.remote) {
      try {
        const out = await this.port.remote.stageAction(action);
        if (out.warning) this.port.notify(out.warning, "warning");
        this.usingLocal = false;
        this.ensurePolling();
        this.port.onSnapshot?.(out.snapshot);
        return out.snapshot;
      } catch (error) {
        if (reflectionWrite) throw error;
        this.usingLocal = true;
      }
    }
    if (reflectionWrite) throw new Error("Companion 当前未连接");
    const now = Date.now();
    const catalog = await this.port.readLocalCatalog();
    if (action.type === "time") {
      this.localTimeEngine.applyAction(action.action, now);
      this.localEngine.touchVersion();
    } else {
      this.localEngine.applyUserAction(action, { catalog: [catalog], inbox: [], now });
    }
    const snap = this.localEngine.buildSnapshot([catalog], [], now, undefined, undefined, this.localTimeEngine.buildSnapshot(now));
    this.port.onSnapshot?.(snap);
    return snap;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !event.isComposing && !(event.target as Element | null)?.closest?.(".tcs-reflection textarea, .tcs-reflection input") && this.backdrop) {
      event.preventDefault();
      event.stopPropagation();
      this.mounted?.focusZoomOut();
    }
  };

  async open(anchorWorkKey?: string | null): Promise<void> {
    if (this.disposed) return;
    this.ensureStyle();
    if (!this.backdrop) {
      this.port.onOpenSurface?.();
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const backdrop = document.createElement("div");
      backdrop.className = "tcs-lsq-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-label", "全局态势与共视活画布");
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) this.close();
      });

      const dialog = document.createElement("div");
      dialog.className = "tcs-lsq-dialog";
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      this.backdrop = backdrop;

      this.mounted = mountSharedStageView(dialog, {
        source: "logseq",
        openWorkLabel: "回到 Logseq 原文现场",
        openDshLabel: "在 DSH 打开",
        showStandaloneButton: true,
        showCloseButton: true,
        dispatch: (action) => this.dispatchAction(action),
        onOpenWork: async (project) => {
          this.close();
          await this.port.openProject(project);
        },
        ...(this.port.openInDsh
          ? {
              onOpenInDsh: async (target) => {
                await this.port.openInDsh!(target);
              },
            }
          : {}),
        ...(this.port.openTargetInLogseq
          ? {
              onOpenTargetInLogseq: async (target) => {
                this.close();
                await this.port.openTargetInLogseq!(target);
              },
            }
          : {}),
        ...(this.port.discussInDsh
          ? {
              onDiscussInDsh: async (summary, snap) => {
                await this.port.discussInDsh!(summary, snap);
              },
            }
          : {}),
        onPromoteTodo: async (item, project) => {
          await this.port.promoteTodo(item, project);
          this.port.notify(`已写入 Logseq TODO：${item.title}`, "success");
        },
        onOpenStandalone: (url) => {
          void this.port.openExternalUrl(url);
        },
        ...(this.port.openJournal ? { onOpenJournal: async () => {
          this.close();
          await this.port.openJournal!();
        } } : {}),
        onFocusStarted: async (session) => {
          this.close();
          if (this.port.openFocusWork) {
            await this.port.openFocusWork(session).catch(() => undefined);
          }
          this.port.notify(`已进入专注：${session.title}`, "success");
        },
        onRequestClose: () => this.close(),
      });
      window.addEventListener("keydown", this.onKeyDown, true);
    }

    const snap = await this.fetchSnapshot(anchorWorkKey);
    if (this.disposed || !this.backdrop) return;
    this.lastPollSignature = JSON.stringify({ ...snap, generatedAt: 0 });
    this.mounted?.update(snap);

    this.ensurePolling();
  }

  private ensurePolling(): void {
    if (this.pollTimer !== null || this.usingLocal || !this.port.remote || !this.backdrop) return;
    this.pollTimer = window.setInterval(() => {
      if (!this.backdrop || this.disposed || this.usingLocal || !this.port.remote) return;
      void this.port.remote.stageState().then(latest => {
        if (this.disposed || !this.backdrop) return;
        const signature = JSON.stringify({ ...latest, generatedAt: 0 });
        if (signature === this.lastPollSignature) return;
        this.lastPollSignature = signature;
        this.mounted?.update(latest);
      }).catch(() => undefined);
    }, 2400);
  }

  close(): void {
    const wasOpen = this.backdrop !== null;
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    window.removeEventListener("keydown", this.onKeyDown, true);
    this.mounted?.dispose();
    this.mounted = null;
    this.backdrop?.remove();
    this.backdrop = null;
    if (wasOpen) {
      this.port.onCloseSurface?.();
    }
    if (this.previousFocus && document.contains(this.previousFocus)) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.previousFocus = null;
  }

  dispose(): void {
    this.disposed = true;
    this.close();
  }
}
