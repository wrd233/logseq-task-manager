import type { CatalogSnapshot } from "@task-copilot/contracts";
import {
  StageEngine,
  mountSharedStageView,
  type MountedStageView,
  type StageAdvancementItem,
  type StageProjectNode,
  type StageSnapshot,
  type StageUserAction,
} from "@task-copilot/stage-runtime";

export interface GlobalStageRemotePort {
  stageState(): Promise<StageSnapshot>;
  stageAction(action: StageUserAction): Promise<{ snapshot: StageSnapshot; archivedInboxIds: string[] }>;
  stageAnchor(workKey: string): Promise<StageSnapshot>;
}

export interface GlobalStageHostPort {
  remote?: GlobalStageRemotePort | null;
  readLocalCatalog(): Promise<CatalogSnapshot>;
  openProject(project: StageProjectNode): Promise<void>;
  promoteTodo(item: StageAdvancementItem, project: StageProjectNode | null): Promise<void>;
  openExternalUrl(url: string): Promise<void>;
  notify(message: string, status?: "success" | "warning"): void;
}

const OVERLAY_CSS = `
.tcs-lsq-backdrop {
  position: fixed;
  inset: 0;
  z-index: 980;
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
`;

export class GlobalStageOverlay {
  private backdrop: HTMLDivElement | null = null;
  private mounted: MountedStageView | null = null;
  private localEngine = new StageEngine();
  private usingLocal = false;
  private pollTimer: number | null = null;
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
        return snap;
      } catch {
        // Companion offline -> fail open cleanly to local catalog snapshot
      }
    }
    this.usingLocal = true;
    const catalog = await this.port.readLocalCatalog();
    if (anchorWorkKey) this.localEngine.anchorFromWorkKey(anchorWorkKey, "logseq", Date.now());
    return this.localEngine.buildSnapshot([catalog], [], Date.now());
  }

  private async dispatchAction(action: StageUserAction): Promise<StageSnapshot> {
    if (!this.usingLocal && this.port.remote) {
      try {
        const out = await this.port.remote.stageAction(action);
        return out.snapshot;
      } catch {
        this.usingLocal = true;
      }
    }
    const catalog = await this.port.readLocalCatalog();
    this.localEngine.applyUserAction(action, { catalog: [catalog], inbox: [], now: Date.now() });
    return this.localEngine.buildSnapshot([catalog], [], Date.now());
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.backdrop) {
      event.preventDefault();
      event.stopPropagation();
      this.mounted?.focusZoomOut();
    }
  };

  async open(anchorWorkKey?: string | null): Promise<void> {
    if (this.disposed) return;
    this.ensureStyle();
    if (!this.backdrop) {
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
        showStandaloneButton: true,
        showCloseButton: true,
        dispatch: (action) => this.dispatchAction(action),
        onOpenWork: async (project) => {
          this.close();
          await this.port.openProject(project);
        },
        onPromoteTodo: async (item, project) => {
          await this.port.promoteTodo(item, project);
          this.port.notify(`已写入 Logseq TODO：${item.title}`, "success");
        },
        onOpenStandalone: (url) => {
          void this.port.openExternalUrl(url);
        },
        onRequestClose: () => this.close(),
      });
      window.addEventListener("keydown", this.onKeyDown, true);
    }

    const snap = await this.fetchSnapshot(anchorWorkKey);
    if (this.disposed || !this.backdrop) return;
    this.mounted?.update(snap);

    if (this.pollTimer === null && !this.usingLocal && this.port.remote) {
      this.pollTimer = window.setInterval(() => {
        if (!this.backdrop || this.disposed || this.usingLocal || !this.port.remote) return;
        void this.port.remote
          .stageState()
          .then((latest) => {
            if (!this.disposed && this.backdrop) this.mounted?.update(latest);
          })
          .catch(() => undefined);
      }, 2400);
    }
  }

  close(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    window.removeEventListener("keydown", this.onKeyDown, true);
    this.mounted?.dispose();
    this.mounted = null;
    this.backdrop?.remove();
    this.backdrop = null;
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
