export interface TextPromptOptions {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  maxLength?: number;
}

export function normalizeTextPromptValue(value: string, maxLength = 200): string | null {
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

let closeActivePrompt: (() => void) | null = null;

export function requestTextPrompt(options: TextPromptOptions): Promise<string | null> {
  closeActivePrompt?.();
  return new Promise((resolve) => {
    const maxLength = options.maxLength ?? 200;
    const root = document.createElement("div");
    const panel = document.createElement("form");
    const title = document.createElement("h2");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const actions = document.createElement("div");
    const cancel = document.createElement("button");
    const confirm = document.createElement("button");

    root.dataset.taskCopilotTextPrompt = "true";
    root.style.cssText = "box-sizing:border-box;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.36);font-family:var(--ls-font-family,system-ui,sans-serif);";
    panel.style.cssText = "box-sizing:border-box;width:min(520px,100%);padding:22px;border:1px solid var(--ls-border-color,#d0d0d0);border-radius:10px;background:var(--ls-primary-background-color,#fff);color:var(--ls-primary-text-color,#222);box-shadow:0 18px 48px rgba(0,0,0,.28);";
    title.textContent = options.title;
    title.style.cssText = "margin:0 0 18px;font-size:20px;font-weight:650;";
    label.textContent = options.label;
    label.htmlFor = "task-copilot-text-prompt-input";
    label.style.cssText = "display:block;margin-bottom:8px;font-size:14px;font-weight:600;";
    input.id = label.htmlFor;
    input.type = "text";
    input.value = options.initialValue ?? "";
    input.maxLength = maxLength;
    input.autocomplete = "off";
    input.style.cssText = "box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid var(--ls-border-color,#bbb);border-radius:6px;background:var(--ls-secondary-background-color,#fafafa);color:inherit;font:inherit;";
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:18px;";
    cancel.type = "button";
    cancel.textContent = "取消";
    confirm.type = "submit";
    confirm.textContent = options.confirmLabel ?? "确认";
    for (const button of [cancel, confirm]) button.style.cssText = "padding:8px 14px;border:1px solid var(--ls-border-color,#bbb);border-radius:6px;background:var(--ls-secondary-background-color,#f5f5f5);color:inherit;font:inherit;cursor:pointer;";
    confirm.style.background = "var(--ls-link-text-color,#4f74b8)";
    confirm.style.color = "white";

    let settled = false;
    const onKeydown = (event: KeyboardEvent) => { if (event.key === "Escape") finish(null); };
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      closeActivePrompt = null;
      document.removeEventListener("keydown", onKeydown);
      root.remove();
      logseq.hideMainUI({ restoreEditingCursor: true });
      resolve(value === null ? null : normalizeTextPromptValue(value, maxLength));
    };
    closeActivePrompt = () => finish(null);
    cancel.addEventListener("click", () => finish(null));
    panel.addEventListener("submit", (event) => { event.preventDefault(); finish(input.value); });
    root.addEventListener("click", (event) => { if (event.target === root) finish(null); });
    document.addEventListener("keydown", onKeydown);

    actions.append(cancel, confirm);
    panel.append(title, label, input, actions);
    root.append(panel);
    document.body.replaceChildren(root);
    document.documentElement.style.background = "transparent";
    document.body.style.margin = "0";
    logseq.setMainUIAttrs({ draggable: false, resizable: false });
    logseq.setMainUIInlineStyle({ position: "fixed", inset: "0", zIndex: 10000, pointerEvents: "auto", background: "transparent" });
    logseq.showMainUI({ autoFocus: true });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}
