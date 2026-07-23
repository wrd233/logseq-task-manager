import { MODEL_DIAGNOSTICS, MODEL_OPEN, PLUGIN_ID, TOOLBAR_KEY, assertCssSafeIdentifier } from "./runtime-diagnostics.ts";
import {
  deriveToolbarIntervention,
  renderToolbarIntervention,
  type ToolbarIntervention,
} from "./toolbar-intervention.ts";

export interface BootstrapHost {
  setMainUIInlineStyle(style: Record<string, string | number>): void;
  provideModel(model: Record<string, (...args: unknown[]) => unknown>): unknown;
  provideStyle(style: string): unknown;
  App: {
    registerUIItem(type: "toolbar", options: { key: string; template: string }): void;
    registerCommandPalette(options: { key: string; label: string }, action: () => unknown): void;
    registerPageMenuItem(label: string, action: (event: { page: string }) => Promise<void>): void;
  };
  Editor: {
    registerSlashCommand(label: string, action: () => unknown): unknown;
    registerBlockContextMenuItem(label: string, action: (event: { uuid: string }) => Promise<void>): unknown;
  };
}

export interface BootstrapCallbacks {
  open(): unknown;
  openToolbar(): unknown;
  capture(): unknown;
  openReview(): unknown;
  openNowWork(): unknown;
  diagnostics(): unknown;
  toggleBlockFocus(blockUuid: string): Promise<void>;
  undoBlockFocus(): Promise<void>;
  openBlockCondition(blockUuid: string): Promise<void>;
  undoBlockCondition(): Promise<void>;
  openPageContext(page: string): Promise<void>;
}

export const COMMAND_KEYS = {
  open: "task-copilot-command-open",
  capture: "task-copilot-command-capture-current-block",
  review: "task-copilot-command-open-review",
  now: "task-copilot-command-open-now-work",
  diagnostics: "task-copilot-command-runtime-diagnostics",
} as const;

export const BLOCK_CONTEXT_LABELS = {
  toggleFocus: "Task Copilot：加入／移出当前关注",
  blockCondition: "Task Copilot：暂时做不了",
  undoFocus: "Task Copilot：撤销上一次关注变化",
  undoCondition: "Task Copilot：撤销上一次状态变化",
} as const;

export const PAGE_CONTEXT_LABEL = "Task Copilot：页面操作";

for (const key of Object.values(COMMAND_KEYS)) assertCssSafeIdentifier(key);

export class BootstrapRegistration {
  private toolbarRegistered = false;
  private commandsRegistered = false;
  private blockContextMenusRegistered = false;
  private pageContextMenuRegistered = false;
  private mainUiRegistered = false;

  private writeToolbar(host: BootstrapHost, summary: ToolbarIntervention): void {
    host.App.registerUIItem("toolbar", {
      key: TOOLBAR_KEY,
      template: `<a class="button task-copilot-personal-mvp-toolbar" data-on-click="${MODEL_OPEN}">${renderToolbarIntervention(summary)}</a>`,
    });
  }

  registerToolbar(host: BootstrapHost): boolean {
    if (this.toolbarRegistered) return false;
    const initial = deriveToolbarIntervention({
      proposals: [],
      semanticCommits: [],
      formalConnectionRisk: false,
    });
    this.writeToolbar(host, initial);
    this.toolbarRegistered = true;
    return true;
  }

  updateToolbar(host: BootstrapHost, summary: ToolbarIntervention): void {
    if (!this.toolbarRegistered) throw new Error("Toolbar must be registered before its intervention state can be updated.");
    this.writeToolbar(host, summary);
  }

  registerCommands(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.commandsRegistered) return false;
    host.App.registerCommandPalette({ key: COMMAND_KEYS.open, label: "Task Copilot: Open" }, callbacks.open);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.capture, label: "Task Copilot: Review Current Page" }, callbacks.capture);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.review, label: "Task Copilot: Open Review Center" }, callbacks.openReview);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.now, label: "Task Copilot: Open Now Work" }, callbacks.openNowWork);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.diagnostics, label: "Task Copilot: Runtime Diagnostics" }, callbacks.diagnostics);
    host.Editor.registerSlashCommand("Task Copilot: Open", callbacks.open);
    this.commandsRegistered = true;
    return true;
  }

  registerBlockContextMenus(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.blockContextMenusRegistered) return false;
    host.Editor.registerBlockContextMenuItem(BLOCK_CONTEXT_LABELS.toggleFocus, async ({ uuid }) => {
      await callbacks.toggleBlockFocus(uuid);
    });
    host.Editor.registerBlockContextMenuItem(BLOCK_CONTEXT_LABELS.blockCondition, async ({ uuid }) => {
      await callbacks.openBlockCondition(uuid);
    });
    host.Editor.registerBlockContextMenuItem(BLOCK_CONTEXT_LABELS.undoFocus, async () => {
      await callbacks.undoBlockFocus();
    });
    host.Editor.registerBlockContextMenuItem(BLOCK_CONTEXT_LABELS.undoCondition, async () => {
      await callbacks.undoBlockCondition();
    });
    this.blockContextMenusRegistered = true;
    return true;
  }

  registerPageContextMenu(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.pageContextMenuRegistered) return false;
    host.App.registerPageMenuItem(PAGE_CONTEXT_LABEL, async ({ page }) => {
      await callbacks.openPageContext(page);
    });
    this.pageContextMenuRegistered = true;
    return true;
  }

  registerMainUi(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.mainUiRegistered) return false;
    host.setMainUIInlineStyle({ position: "fixed", inset: "0", zIndex: 999, width: "100vw", height: "100vh", background: "rgb(11 24 18 / 35%)", opacity: 1 });
    host.provideModel({ [MODEL_OPEN]: callbacks.openToolbar, [MODEL_DIAGNOSTICS]: callbacks.diagnostics });
    host.provideStyle(`
      div[data-injected-ui="${TOOLBAR_KEY}-${PLUGIN_ID}"] { display: inline-flex; align-items: center; }
      .task-copilot-personal-mvp-toolbar { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; font-weight: 700; }
      .task-copilot-toolbar-state { display: inline-flex; align-items: center; gap: 3px; }
      .task-copilot-toolbar-badge { color: var(--ls-primary-text-color); font-weight: 800; }
      .task-copilot-toolbar-badge.recovery { color: var(--ls-error-text-color, #b42318); }
    `);
    this.mainUiRegistered = true;
    return true;
  }
}

export function bindRootClick(
  root: Pick<HTMLElement, "addEventListener" | "removeEventListener">,
  listener: EventListener,
): () => void {
  root.addEventListener("click", listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    root.removeEventListener("click", listener);
  };
}

export interface UiFocusToken {
  action?: string;
  value?: string;
  field?: string;
}

export function captureUiFocus(element: HTMLElement | null): UiFocusToken | undefined {
  if (!element) return undefined;
  const action = element.dataset.action;
  const value = element.dataset.value;
  const field = element.getAttribute("data-field") ?? undefined;
  if (!action && !field) return undefined;
  return {
    ...(action ? { action } : {}),
    ...(value ? { value } : {}),
    ...(field ? { field } : {}),
  };
}

export function restoreUiFocus(root: Pick<HTMLElement, "querySelectorAll">, token: UiFocusToken | undefined): boolean {
  if (!token) return false;
  const match = Array.from(root.querySelectorAll<HTMLElement>("[data-action], [data-field]")).find((element) => (
    element.dataset.action === token.action
    && element.dataset.value === token.value
    && (element.getAttribute("data-field") ?? undefined) === token.field
  ));
  if (!match) return false;
  match.focus({ preventScroll: true });
  return true;
}
