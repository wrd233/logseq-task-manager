import { button, element } from "../../host/panel-host.ts";
import { extension, fileName, fileTitle } from "./names.ts";
import type { MaterialRecord } from "./store.ts";
import type { MaterialView } from "./service.ts";

export function fileDetails(view: Pick<MaterialView, "path" | "capabilities" | "availability">): string {
  const type = extension(view.path).slice(1).toUpperCase() || "文件";
  return `${type} · ${view.availability === "unavailable" ? "文件失联" : view.capabilities.read === "markdown" ? "只读阅读" : "在默认应用打开"}`;
}
export function materialEntry(view: MaterialView, open: () => void, draft: boolean): HTMLButtonElement {
  const entry = button(view.summary || view.title, open); entry.className = "wb-material"; entry.dataset.materialId = view.id;
  entry.append(element("small", `${fileDetails(view)}${draft ? " · 有保留草稿" : ""}`, "wb-material-meta"));
  if (view.summary || view.title !== fileTitle(view.path)) entry.append(element("small", fileName(view.path), "wb-material-filename"));
  entry.title = view.path;
  return entry;
}
export function referenceNotice(record: MaterialRecord): string | null {
  if (record.rename && ["prepared", "uncertain"].includes(record.rename.status)) return "文件改名结果待核验";
  if (record.references?.some(ref => ref.mode === "follow-filename" && ref.status !== "synced")) return "文件已加入，部分引用待完成";
  return null;
}
export function materialDropArea(root: string | null): HTMLElement {
  const area = element("section", "", "wb-material-drop-area"); area.dataset.materialDropList = root ?? "";
  area.setAttribute("aria-label", "拖入文件加入材料");
  area.append(element("p", "把已保存的文件拖到这里"), element("small", "原文件留在原处；加入材料不会向正文插入链接。"));
  return area;
}
/** Local material styles; the shared shell continues to own navigation and theme. */
export function installMaterialReadingStyle(): () => void {
  const style = element("style"); style.dataset.materialReadingStyle = "true";
  style.textContent = `
    [data-workbench-feature=materials] .wb-heading{gap:8px;align-items:center}
    [data-workbench-feature=materials] .wb-heading>strong{font-size:15px;min-width:0}
    .wb-material-work{width:100%;color:var(--ls-secondary-text-color,#666);font-size:12px;overflow-wrap:anywhere}
    .wb-material-tools{display:flex;align-items:center;gap:8px;margin:0 0 12px;flex-wrap:wrap}
    .wb-material-tools input{flex:1;min-width:130px}
    .wb-material-drop-area{border:1px dashed var(--ls-border-color,#c8cfcc);border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:13px}
    .wb-material-drop-area p{margin:0 0 2px}.wb-material-drop-area small{color:var(--ls-secondary-text-color,#666)}
    .wb-material-drag-target{outline:2px solid var(--ls-link-text-color,#6d8c7d);outline-offset:2px}
    .wb-material-drop-hint{font-size:12px;font-weight:400;margin:4px 0;color:var(--ls-secondary-text-color,#666)}
    .wb-material-entry{display:flex;gap:8px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--ls-border-color,#eee)}
    [data-workbench-feature=materials] .wb-material{border:0;margin:0;padding:2px 0;flex:1;min-width:0;white-space:normal;font-size:14px}
    .wb-material-meta,.wb-material-filename{font-size:12px;font-weight:400;line-height:1.5}
    .wb-material-entry>details{position:relative;flex:none;font-size:12px}.wb-material-entry summary{cursor:pointer;padding:4px;list-style:none}
    .wb-material-entry>details[open]{min-width:105px}.wb-material-entry>details button{display:block;margin:5px 0;text-align:left;width:100%}
    .wb-material-facts{font-size:12px;margin:0 0 12px;color:var(--ls-secondary-text-color,#666);overflow-wrap:anywhere}
    .wb-material-facts strong{color:var(--ls-primary-text-color,#222);font-weight:500}
    .wb-material-result{padding:8px 0;font-size:12px;overflow-wrap:anywhere}.wb-material-result button{margin:4px 6px 0 0}
    .wb-material-link-fallback{display:block;width:100%;min-height:60px;margin:6px 0}
    [data-workbench-feature=materials] .wb-reading{font-size:15px;line-height:1.85;max-width:76ch;margin:0 auto}
    [data-workbench-feature=materials] .wb-reading pre{white-space:pre-wrap}
    [data-workbench-feature=materials] .wb-material-form{padding:12px 0;border-bottom:1px solid var(--ls-border-color,#ddd)}
    [data-workbench-feature=materials] .wb-material-form small{width:100%;color:var(--ls-secondary-text-color,#666)}
    [data-workbench-feature=materials] .wb-status:empty{display:none}
    @media(max-width:480px){.wb-material-entry{gap:4px}.wb-material-drop-area{padding:8px}.wb-material-tools{gap:6px}}
  `;
  document.head.append(style); return () => style.remove();
}
