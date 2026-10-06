import { workbenchControls, workbenchTokens } from "../../host/visual-style.ts";
import { hostDocument } from "../../host/panel-host.ts";
import { copyMaterialLink } from "../../host/clipboard.ts";

export interface CapturePrompt { finished: Promise<void>; close(): void; releaseNativeFocus(): void }
/** One decision and one editable name, mounted beside the native editor rather than in materials. */
export function capturePastePrompt(initial: string, save: (title: string) => Promise<{reference?: string; problem?: string}>, cancel: () => void): CapturePrompt {
  const doc = hostDocument() ?? document, dialog = doc.createElement("dialog"), form = doc.createElement("form");
  dialog.className = "wb-material-capture"; dialog.setAttribute("aria-label", "收纳长文本");
  // Logseq treats a bubbled outside click as ending the native editor. Keep this
  // decision local so its confirmation can replace the original pasted range.
  for (const type of ["pointerdown", "mousedown", "click", "keydown", "keyup"]) dialog.addEventListener(type, event => event.stopPropagation());
  const style = doc.createElement("style"); style.dataset.workbenchCaptureStyle="true"; style.textContent=workbenchTokens+workbenchControls;
  const title = doc.createElement("h3"); title.textContent = "收纳这段长文本？";
  const hint = doc.createElement("p"); hint.textContent = "保存为 Markdown 材料，并在粘贴位置留下链接。";
  const label = doc.createElement("label"); label.textContent = "文件名";
  const input = doc.createElement("input"); input.value = initial; input.setAttribute("aria-label", "收纳文件名"); label.append(input);
  const status = doc.createElement("p"); status.setAttribute("role", "status");
  const footer = doc.createElement("footer"), keep = doc.createElement("button"), submit = doc.createElement("button");
  keep.type = "button"; keep.textContent = "保留原文"; submit.type = "submit"; submit.className="wb-primary"; submit.textContent = "收纳"; footer.append(keep, submit);
  form.append(title, hint, label, status, footer); dialog.append(style, form); doc.body.append(dialog);
  let resolve!: () => void, composing = false, complete = false;
  const finished = new Promise<void>(done => { resolve = done; });
  const close = () => { if (!complete) cancel(); dialog.remove(); resolve(); };
  keep.onclick = close;
  dialog.oncancel = event => { event.preventDefault(); if (!submit.disabled && !composing) close(); };
  input.addEventListener("compositionstart", () => { composing = true; }); input.addEventListener("compositionend", () => { composing = false; });
  form.onsubmit = event => {
    event.preventDefault(); if (submit.disabled || composing || !input.value.trim()) return;
    submit.disabled = keep.disabled = true; status.textContent = "正在保存…";
    void save(input.value.trim().replace(/\.md$/i, "")).then(result => {
      if (!dialog.isConnected) return;
      complete = true;
      if (!result.problem) { close(); return; }
      status.textContent = result.problem; input.readOnly = true; submit.hidden = true; keep.disabled = false; keep.textContent = "完成";
      if (!dialog.open) { try { dialog.showModal(); } catch { dialog.open = true; } }
      if (result.reference) {
        const copy = doc.createElement("button"); copy.type = "button"; copy.textContent = "复制链接";
        copy.onclick = () => void copyMaterialLink(result.reference!).then(() => { if (dialog.isConnected) status.textContent = "已复制链接，原文仍保留。"; }).catch(() => { if (dialog.isConnected) status.textContent = "复制未完成，请再次点击复制链接。"; }); footer.prepend(copy);
      }
    }).catch(error => { if (dialog.isConnected) { status.textContent = error instanceof Error ? error.message : String(error); submit.disabled = keep.disabled = false; input.focus(); } });
  };
  try { dialog.showModal(); } catch { dialog.open = true; }
  input.focus(); input.select();
  return {finished, close, releaseNativeFocus: () => { dialog.close(); }};
}
