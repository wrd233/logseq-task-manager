import { MODEL_DIAGNOSTICS, MODEL_OPEN, PLUGIN_ID, TOOLBAR_KEY, assertCssSafeIdentifier } from "./runtime-diagnostics.ts";
import { MODEL_PROJECT_REENTRY, PROJECT_PAGE_HEAD_UI_KEY } from "./project-page-head-action.ts";
import {
  deriveToolbarIntervention,
  renderToolbarIntervention,
  type ToolbarIntervention,
} from "./toolbar-intervention.ts";

export interface BootstrapHost {
  setMainUIInlineStyle(style: Record<string, string | number>): void;
  provideModel(model: Record<string, (...args: unknown[]) => unknown>): unknown;
  provideStyle(style: string): unknown;
  provideUI(ui: { key: string; slot: string; template: string | null }): unknown;
  UI: {
    checkSlotValid(slot: string): Promise<boolean>;
  };
  App: {
    registerUIItem(type: "toolbar", options: { key: string; template: string }): void;
    registerCommandPalette(options: {
      key: string;
      label: string;
      keybinding?: {
        mode?: "global" | "non-editing" | "editing";
        binding: string | string[];
      };
    }, action: () => unknown): void;
    registerPageMenuItem(label: string, action: (event: { page: string }) => Promise<void>): void;
    onPageHeadActionsSlotted(callback: (event: { slot: string }) => void): void;
  };
  Editor: {
    registerSlashCommand(label: string, action: () => unknown): unknown;
    registerBlockContextMenuItem(label: string, action: (event: { uuid: string }) => Promise<void>): unknown;
  };
}

export interface BootstrapCallbacks {
  open(): unknown;
  openToolbar(): unknown;
  processCurrentBlock(): unknown;
  openReview(): unknown;
  openNowWork(): unknown;
  toggleCurrentBlockFocus(): unknown;
  diagnostics(): unknown;
  createTask(): unknown;
  createMiniProject(): unknown;
  createDecision(): unknown;
  createOutput(): unknown;
  processBlock(blockUuid: string): Promise<void>;
  toggleBlockFocus(blockUuid: string): Promise<void>;
  undoBlockFocus(): Promise<void>;
  openBlockCondition(blockUuid: string): Promise<void>;
  undoBlockCondition(): Promise<void>;
  openPageContext(page: string): Promise<void>;
  openProjectReentry(): Promise<void>;
  observeProjectPageHeadSlot(slot: string): void;
}

export const COMMAND_KEYS = {
  open: "task-copilot-command-open",
  processCurrentBlock: "task-copilot-command-process-current-block",
  review: "task-copilot-command-open-review",
  now: "task-copilot-command-open-now-work",
  toggleCurrentBlockFocus: "task-copilot-command-toggle-current-block-focus",
  diagnostics: "task-copilot-command-runtime-diagnostics",
} as const;

export const BLOCK_CONTEXT_LABELS = {
  processContent: "Task Copilot：处理这条内容",
  toggleFocus: "Task Copilot：加入／移出当前关注",
  blockCondition: "Task Copilot：暂时做不了",
  undoFocus: "Task Copilot：撤销上一次关注变化",
  undoCondition: "Task Copilot：撤销上一次状态变化",
} as const;

export const PAGE_CONTEXT_LABEL = "Task Copilot：页面操作";

for (const key of [...Object.values(COMMAND_KEYS), PROJECT_PAGE_HEAD_UI_KEY, MODEL_PROJECT_REENTRY]) assertCssSafeIdentifier(key);

export class BootstrapRegistration {
  private toolbarRegistered = false;
  private commandsRegistered = false;
  private blockContextMenusRegistered = false;
  private pageContextMenuRegistered = false;
  private projectPageHeadRegistered = false;
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
    host.App.registerCommandPalette({ key: COMMAND_KEYS.open, label: "Task Copilot：打开" }, callbacks.open);
    host.App.registerCommandPalette({
      key: COMMAND_KEYS.processCurrentBlock,
      label: "Task Copilot：处理当前 Block",
      keybinding: { mode: "global", binding: [] },
    }, callbacks.processCurrentBlock);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.review, label: "Task Copilot：打开待我确认" }, callbacks.openReview);
    host.App.registerCommandPalette({
      key: COMMAND_KEYS.now,
      label: "Task Copilot：打开“现在”",
      keybinding: { mode: "global", binding: [] },
    }, callbacks.openNowWork);
    host.App.registerCommandPalette({
      key: COMMAND_KEYS.toggleCurrentBlockFocus,
      label: "Task Copilot：加入或移出当前关注",
      keybinding: { mode: "global", binding: [] },
    }, callbacks.toggleCurrentBlockFocus);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.diagnostics, label: "Task Copilot：系统状态与技术诊断" }, callbacks.diagnostics);
    host.Editor.registerSlashCommand("创建任务", callbacks.createTask);
    host.Editor.registerSlashCommand("创建 MiniProject", callbacks.createMiniProject);
    host.Editor.registerSlashCommand("创建决策", callbacks.createDecision);
    host.Editor.registerSlashCommand("创建成果", callbacks.createOutput);
    this.commandsRegistered = true;
    return true;
  }

  registerBlockContextMenus(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.blockContextMenusRegistered) return false;
    host.Editor.registerBlockContextMenuItem(BLOCK_CONTEXT_LABELS.processContent, async ({ uuid }) => {
      await callbacks.processBlock(uuid);
    });
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

  registerProjectPageHeadAction(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.projectPageHeadRegistered) return false;
    host.App.onPageHeadActionsSlotted(({ slot }) => callbacks.observeProjectPageHeadSlot(slot));
    this.projectPageHeadRegistered = true;
    return true;
  }

  registerMainUi(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.mainUiRegistered) return false;
    host.setMainUIInlineStyle({ position: "fixed", inset: "0", zIndex: 999, width: "100vw", height: "100vh", background: "rgb(11 24 18 / 35%)", opacity: 1 });
    host.provideModel({
      [MODEL_OPEN]: callbacks.openToolbar,
      [MODEL_DIAGNOSTICS]: callbacks.diagnostics,
      [MODEL_PROJECT_REENTRY]: callbacks.openProjectReentry,
    });
    host.provideStyle(`
      div[data-injected-ui="${TOOLBAR_KEY}-${PLUGIN_ID}"] { display: inline-flex; align-items: center; }
      .task-copilot-personal-mvp-toolbar { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; font-weight: 700; }
      .task-copilot-toolbar-state { display: inline-flex; align-items: center; gap: 3px; }
      .task-copilot-toolbar-badge { color: var(--ls-primary-text-color); font-weight: 800; }
      .task-copilot-toolbar-badge.recovery { color: var(--ls-error-text-color, #b42318); }
      .task-copilot-project-reentry-head-action { margin-left: 6px; padding: 3px 9px; border: 1px solid var(--ls-border-color, currentColor); border-radius: 999px; color: var(--ls-primary-text-color); background: var(--ls-secondary-background-color); font-size: 12px; line-height: 1.5; }
      .task-copilot-project-reentry-head-action:hover { background: var(--ls-tertiary-background-color); }
      #right-sidebar .task-copilot-project-reentry-head-action { display: none !important; }
      .task-copilot-block-marker { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; margin-left: 5px; color: var(--ls-secondary-text-color); pointer-events: none; user-select: none; vertical-align: baseline; }
      .task-copilot-block-marker.mode-line { width: 2px; height: 1em; border-radius: 2px; background: currentColor; opacity: .7; }
      .task-copilot-block-marker.mode-dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; opacity: .72; }
      .task-copilot-block-marker.mode-icon { width: 1em; font-size: 11px; font-weight: 700; opacity: .78; }
      .task-copilot-block-marker.mode-tint { width: 14px; height: 8px; border-radius: 999px; background: color-mix(in srgb, currentColor 22%, transparent); border: 1px solid color-mix(in srgb, currentColor 45%, transparent); }
      .task-copilot-block-marker.mode-phrase { padding: 0 5px; border: 1px solid var(--ls-border-color, currentColor); border-radius: 999px; font-size: 10px; line-height: 1.5; opacity: .72; }
      .task-copilot-block-marker.state-blocked { color: var(--ls-error-text-color, #b42318); }
      .task-copilot-block-marker.state-waiting, .task-copilot-block-marker.state-paused { color: var(--ls-link-text-color, #8a6500); }
      .task-copilot-block-marker.state-focus { color: var(--ls-link-text-color, #2563eb); }
      .task-copilot-block-marker.state-closed { opacity: .42; }
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
