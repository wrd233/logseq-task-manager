import { button, element } from "../../host/panel-host.ts";
import { extension, fileName } from "./names.ts";
import type { MaterialRecord } from "./store.ts";
import type { MaterialView } from "./service.ts";
import {previewFormat} from "./preview/paths.ts";

export function fileDetails(view: Pick<MaterialView, "path" | "capabilities" | "availability">): string {
  const type = extension(view.path).slice(1).toUpperCase() || "文件";
  return `${type} · ${view.availability === "unavailable" ? "文件失联" : ["spreadsheet", "legacy-doc", "unsupported"].includes(previewFormat(view.path)) ? "外部阅读" : "只读阅读"}`;
}
export function materialEntry(view: MaterialView, open: () => void, draft: boolean): HTMLButtonElement {
  const entry = button("", open); entry.className = "wb-material"; entry.dataset.materialId = view.id;
  entry.append(element("span", fileName(view.path), "wb-material-name"));
  entry.append(element("small", `${fileDetails(view)}${draft ? " · 有保留草稿" : ""}`, "wb-material-meta"));
  entry.title = [view.path, view.summary].filter(Boolean).join("\n");
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
  area.append(element("p", "拖入文件或文件夹"), element("small", "保留原文件，副本加入当前工作。"));
  return area;
}
/** Local material styles; the shared shell continues to own navigation and theme. */
export function installMaterialReadingStyle(): () => void {
  const style = element("style"); style.dataset.materialReadingStyle = "true";
  style.textContent = `
    [data-workbench-feature=materials] .wb-heading{gap:8px;align-items:center}
    [data-workbench-feature=materials] .wb-heading>strong{font-size:15px;min-width:0}
    .wb-material-count{flex:1;font-size:12px;color:var(--wb-muted)}
    .wb-material-recovery{font-size:12px;margin:0 0 10px;max-width:100%;color:var(--ls-secondary-text-color,#666)}
    .wb-material-recovery button{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:6px;font-size:12px}
    .wb-material-import-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--ls-border-color,#eee);font-size:14px}
    .wb-material-import-row small{color:var(--ls-secondary-text-color,#666)}
    .wb-material-import-row[data-import-state=pending] small:before{content:'◌';display:inline-block;margin-right:5px;animation:wb-material-spin 1.2s linear infinite}
    @keyframes wb-material-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.wb-material-import-row[data-import-state=pending] small:before{animation:none}}
    .wb-material-folder-heading,.wb-material-folder{display:flex;align-items:center;gap:10px;font-size:13px;padding:9px 0}
    .wb-material-folder-heading p,.wb-material-folder>div{flex:1;min-width:0}
    .wb-material-folder{border-bottom:1px solid var(--ls-border-color,#eee)}
    .wb-material-folder small{display:block;overflow-wrap:anywhere;color:var(--ls-secondary-text-color,#666)}

    .wb-material-work{width:100%;color:var(--ls-secondary-text-color,#666);font-size:12px;overflow-wrap:anywhere}
    .wb-material-tools{display:flex;align-items:center;gap:8px;margin:0 0 12px;flex-wrap:wrap}
    .wb-material-tools input{flex:1;min-width:130px}
    .wb-material-drop-area{border:1px dashed var(--ls-border-color,#c8cfcc);border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:13px}
    .wb-material-drop-area p{margin:0 0 2px}.wb-material-drop-area small{color:var(--ls-secondary-text-color,#666)}
    .wb-material-drag-target{outline:2px solid var(--ls-link-text-color,#6d8c7d);outline-offset:2px}
    .wb-material-drop-hint{font-size:12px;font-weight:400;margin:4px 0;color:var(--ls-secondary-text-color,#666)}
    .wb-material-entry{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:3px 0;min-height:38px;border-bottom:1px solid var(--wb-edge);position:relative}
    [data-workbench-feature=materials] .wb-material{display:flex;align-items:center;gap:12px;grid-column:1;grid-row:1;border:0;margin:0;padding:5px 0;min-width:0;white-space:nowrap;font-size:14px}
    .wb-material-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis}.wb-material-meta{flex:none;color:var(--wb-muted)}
    .wb-material-meta,.wb-material-filename{font-size:12px;font-weight:400;line-height:1.6}
    .wb-material-entry>.wb-menu{grid-column:3;grid-row:1;font-size:12px}.wb-material-entry>.wb-menu>summary{font-size:12px}
    .wb-material-feedback{grid-column:2;grid-row:1;font-size:12px;color:var(--wb-accent);display:flex;align-items:center;gap:4px;max-width:100px;overflow-wrap:anywhere}.wb-material-feedback:empty{display:none}.wb-material-feedback button{font-size:12px;padding:0 4px;min-height:28px}
    .wb-material-problem{grid-column:1 / -1;margin:0;font-size:13px}
    .wb-material-rename{grid-column:1 / 3;grid-row:1;display:flex;flex-wrap:wrap;align-items:end;gap:6px;min-width:0}
    .wb-material-rename label{font-size:12px;color:var(--wb-muted);width:100%}.wb-material-rename input{display:block;width:100%;margin-top:4px;font-size:14px}.wb-material-rename p{width:100%;margin:2px 0;font-size:13px}
    .wb-material-entry:has(.wb-material-rename)>.wb-material-feedback{display:none}
    .wb-material-path{font-size:12px;margin-top:4px;color:var(--wb-muted)}.wb-material-path summary{cursor:pointer}.wb-material-path small{margin-top:4px}
    .wb-material-drop-compact{border:0!important;background:var(--wb-soft);padding:7px 10px!important;margin-bottom:5px!important}
    .wb-material-drop-area{display:flex;align-items:center;flex-wrap:wrap;gap:5px 10px;background:var(--wb-soft);padding:8px 10px!important;margin-bottom:8px!important}.wb-material-drop-area p{margin:0}.wb-material-drop-area small{flex:1;font-size:12px}.wb-material-drop-area button{font-size:12px}
    .wb-material-directory-extra{margin-top:18px;font-size:12px;color:var(--wb-muted)}.wb-material-directory-extra>summary{cursor:pointer;padding:8px 0}.wb-material-folder-heading{flex-wrap:wrap}.wb-material-folder-heading select{flex:1;min-width:0;max-width:100%}
    .wb-material-heading[data-material-reading]>strong{display:block!important;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-material-heading[data-material-reading]>small{font-size:12px;color:var(--wb-muted)}
    .wb-material-drop-area.wb-material-drop-compact p{display:inline;margin-right:4px}.wb-material-drop-area.wb-material-drop-compact small{font-size:12px}
    .wb-material-drop-hint{position:absolute;z-index:10;pointer-events:none;padding:6px 10px;background:var(--wb-soft);border-radius:6px;box-shadow:var(--wb-shadow)}
    .wb-material-facts{font-size:12px;margin:0 0 12px;color:var(--ls-secondary-text-color,#666);overflow-wrap:anywhere}
    .wb-material-facts strong{color:var(--ls-primary-text-color,#222);font-weight:500}
    .wb-material-result{padding:8px 0;font-size:12px;overflow-wrap:anywhere}.wb-material-result button{margin:4px 6px 0 0}
    .wb-material-link-fallback{display:block;width:100%;min-height:60px;margin:6px 0}
    [data-workbench-feature=materials] .wb-reading{font-size:15px;line-height:1.85;max-width:76ch;margin:0 auto}
    [data-workbench-feature=materials] .wb-reading pre{white-space:pre-wrap}

    [data-workbench-feature=materials] .wb-material-form small{width:100%;color:var(--ls-secondary-text-color,#666)}
    [data-workbench-feature=materials] .wb-status:empty{display:none}
    @media(max-width:480px){.wb-material-entry{gap:4px}.wb-material-meta{font-size:11px}.wb-material-drop-area small{flex-basis:100%;order:1}.wb-material-tools{gap:6px}}
    @media(pointer:coarse){.wb-material-entry{min-height:44px}}
  `;
  document.head.append(style); return () => style.remove();
}
