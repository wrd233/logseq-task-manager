import DOMPurify from "dompurify";
import { marked } from "../work-view/vendor/marked.js";
import { button, element } from "../../host/panel-host.ts";
import { safeMarkdownURI } from "./links.ts";
import type { MaterialRole } from "./store.ts";
export const roleLabel = (role?: MaterialRole): string => ({reference: "参考资料", input: "原始输入", draft: "工作稿", output: "生成文档"})[role ?? "input"];
export function renderReading(text: string): HTMLElement {
  const article = element("article", "", "wb-reading");
  article.innerHTML = DOMPurify.sanitize(marked.parse(text) as string, {ALLOWED_URI_REGEXP: safeMarkdownURI});
  return article;
}
/** Material prompts stay inside the shared panel and preserve sibling panels. */
export function materialPrompt(parent: HTMLElement, label: string, initial = "", multiline = false, beforeSubmit?: (text: string) => void): Promise<string | null> {
  return new Promise(resolve => {
    const form = element("form", "", "wb-material-form"), caption = element("label", label);
    const input = multiline ? element("textarea") : element("input"); input.value = initial; input.setAttribute("aria-label", label);
    if (input.tagName === "TEXTAREA") (input as HTMLTextAreaElement).rows = 12;
    const finish = (value: string | null) => { form.remove(); resolve(value); };
    const submit = button("保存", () => {}); submit.type = "submit";
    const problem = element("p", "", "wb-error"); problem.hidden = true;
    form.onsubmit = event => {
      event.preventDefault(); if (!input.value.trim()) return;
      try { beforeSubmit?.(input.value); finish(input.value); }
      catch { problem.hidden = false; problem.textContent = "恢复缓存暂不可写，输入仍保留。请释放空间后重试。"; }
    };
    caption.append(input); form.append(caption, problem, submit, button("取消", () => finish(null))); parent.prepend(form); input.focus();
  });
}

/** The input remains usable after IO or validation failure. Cancel never replays IO. */
export function materialAction(parent: HTMLElement, label: string, initial: string, description: string, action: (value: string) => Promise<void>, allowEmpty = false): Promise<void> {
  return new Promise(resolve => {
    const form = element("form", "", "wb-material-form"), caption = element("label", label), input = element("input");
    input.value = initial; input.setAttribute("aria-label", label); caption.append(input);
    const submit = button("保存", () => {}); submit.type = "submit";
    const cancel = button("取消", () => { if (!submit.disabled) { form.remove(); resolve(); } });
    const problem = element("p", "", "wb-error"); problem.hidden = true;
    form.append(caption, element("small", description), problem, submit, cancel);
    let composing = false;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input.addEventListener("keydown", event => { if (event.key === "Enter" && (composing || event.isComposing)) event.preventDefault(); });
    form.onsubmit = event => {
      event.preventDefault(); if (submit.disabled || composing || !allowEmpty && !input.value.trim()) return;
      submit.disabled = cancel.disabled = input.readOnly = true; problem.hidden = true;
      void action(input.value).then(() => { form.remove(); resolve(); }).catch(error => {
        submit.disabled = cancel.disabled = input.readOnly = false;
        problem.textContent = error instanceof Error ? error.message : String(error); problem.hidden = false;
        input.focus();
      });
    };
    parent.prepend(form); input.focus(); input.select();
  });
}
