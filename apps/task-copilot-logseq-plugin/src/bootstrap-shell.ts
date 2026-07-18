import { MODEL_DIAGNOSTICS, MODEL_OPEN, PLUGIN_ID, TOOLBAR_KEY, assertCssSafeIdentifier } from "./runtime-diagnostics.ts";

export interface BootstrapHost {
  setMainUIInlineStyle(style: Record<string, string | number>): void;
  provideModel(model: Record<string, (...args: unknown[]) => unknown>): unknown;
  provideStyle(style: string): unknown;
  App: {
    registerUIItem(type: "toolbar", options: { key: string; template: string }): void;
    registerCommandPalette(options: { key: string; label: string }, action: () => unknown): void;
  };
  Editor: { registerSlashCommand(label: string, action: () => unknown): unknown };
}

export interface BootstrapCallbacks {
  open(): unknown;
  capture(): unknown;
  openInbox(): unknown;
  openNowWork(): unknown;
  diagnostics(): unknown;
}

export const COMMAND_KEYS = {
  open: "task-copilot-command-open",
  capture: "task-copilot-command-capture-current-block",
  inbox: "task-copilot-command-open-inbox",
  now: "task-copilot-command-open-now-work",
  diagnostics: "task-copilot-command-runtime-diagnostics",
} as const;

for (const key of Object.values(COMMAND_KEYS)) assertCssSafeIdentifier(key);

export class BootstrapRegistration {
  private toolbarRegistered = false;
  private commandsRegistered = false;
  private mainUiRegistered = false;

  registerToolbar(host: BootstrapHost): boolean {
    if (this.toolbarRegistered) return false;
    host.App.registerUIItem("toolbar", {
      key: TOOLBAR_KEY,
      template: `<a class="button task-copilot-personal-mvp-toolbar" data-on-click="${MODEL_OPEN}" title="Task Copilot" aria-label="Task Copilot">TC</a>`,
    });
    this.toolbarRegistered = true;
    return true;
  }

  registerCommands(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.commandsRegistered) return false;
    host.App.registerCommandPalette({ key: COMMAND_KEYS.open, label: "Task Copilot: Open" }, callbacks.open);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.capture, label: "Task Copilot: Capture Current Block" }, callbacks.capture);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.inbox, label: "Task Copilot: Open Inbox" }, callbacks.openInbox);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.now, label: "Task Copilot: Open Now Work" }, callbacks.openNowWork);
    host.App.registerCommandPalette({ key: COMMAND_KEYS.diagnostics, label: "Task Copilot: Runtime Diagnostics" }, callbacks.diagnostics);
    host.Editor.registerSlashCommand("Task Copilot: Open", callbacks.open);
    this.commandsRegistered = true;
    return true;
  }

  registerMainUi(host: BootstrapHost, callbacks: BootstrapCallbacks): boolean {
    if (this.mainUiRegistered) return false;
    host.setMainUIInlineStyle({ position: "fixed", inset: "0", zIndex: 999, width: "100vw", height: "100vh", background: "rgb(11 24 18 / 35%)", opacity: 1 });
    host.provideModel({ [MODEL_OPEN]: callbacks.open, [MODEL_DIAGNOSTICS]: callbacks.diagnostics });
    host.provideStyle(`
      div[data-injected-ui="${TOOLBAR_KEY}-${PLUGIN_ID}"] { display: inline-flex; align-items: center; }
      .task-copilot-personal-mvp-toolbar { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; font-weight: 700; }
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
