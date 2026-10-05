import { hostDocument } from "./panel-host.ts";

/** Perform the synchronous host copy inside the user gesture; no second keyboard action. */
export function copyMaterialLink(text: string): Promise<void> {
  const doc = hostDocument() ?? document, focused = doc.activeElement as HTMLElement | null;
  const input = doc.createElement("textarea"); input.value = text; input.readOnly = true;
  input.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0"; doc.body.append(input);
  try {
    input.focus({preventScroll: true}); input.select();
    if (doc.execCommand?.("copy")) return Promise.resolve();
  } catch { /* Try the host browser clipboard while still in the click stack. */ }
  finally { input.remove(); focused?.focus({preventScroll: true}); }
  const clipboard = doc.defaultView?.navigator.clipboard ?? navigator.clipboard;
  if (!clipboard?.writeText) return Promise.reject(new Error("复制未完成，请再次点击复制链接。"));
  return clipboard.writeText(text);
}
