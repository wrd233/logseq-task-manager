import {fileName} from "../names.ts";
import {docIdPattern} from "../links.ts";
import {localAssetURL} from "../../../host/local-bytes.ts";
import type {PreviewFormat} from "./types.ts";

export function previewFormat(path: string): PreviewFormat {
  const ext = /\.[^.]+$/.exec(fileName(path))?.[0].toLowerCase();
  if ([".md", ".markdown"].includes(ext ?? "")) return "markdown";
  if (ext === ".docx") return "docx";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext ?? "")) return "image";
  if (ext === ".pdf") return "pdf";
  if ([".xlsx", ".xls", ".csv"].includes(ext ?? "")) return "spreadsheet";
  return ext === ".doc" ? "legacy-doc" : "unsupported";
}
export type PreviewLink = {kind: "material"; id: string} | {kind: "local-file"; path: string; origin: "graph-asset" | "material"} | {kind: "other"} | {kind: "unresolved"; problem: string};
export function pathWithin(path: string, root: string): boolean { return path === root || path.startsWith(`${root.replace(/\/+$/, "")}/`); }
function resolveRelative(path: string, directory: string): string {
  const parts = (path.startsWith("/") ? path : `${directory}/${path}`).split("/"), result: string[] = [];
  for (const part of parts) {if (!part || part === ".") continue; if (part === "..") {if (!result.length) throw new Error("路径越过本地根。"); result.pop();} else result.push(part);}
  return `/${result.join("/")}`;
}
/** Caller supplies trusted CURRENT roots. Web/wiki/page URLs keep their own semantics. */
export function parsePreviewLink(href: string, graph: string, roots: string[], sourcePath?: string): PreviewLink {
  if (/^longdoc:\/\//i.test(href)) {const id = href.slice("longdoc://".length); return docIdPattern.test(id) ? {kind: "material", id} : {kind: "unresolved", problem: "材料链接身份无效。"};}
  if (/^(?:https?|mailto|tel):/i.test(href) || /^#|^\[\[/u.test(href)) return {kind: "other"};
  const localScheme = /^(?:assets|file):/i.test(href);
  if (!localScheme && /^[a-z][a-z\d+.-]*:/i.test(href)) return {kind: "other"};
  try {
    let path: string;
    if (/^file:/i.test(href)) {const url = new URL(href); if (url.hostname && url.hostname !== "localhost") throw new Error("不读取远程文件主机。"); if (url.search || url.hash) throw new Error("该本地链接含无法核验的参数。"); path = decodeURIComponent(url.pathname);}
    else if (/^assets:\/\//i.test(href)) {const raw = href.slice("assets://".length); if (/[?#]/u.test(raw)) throw new Error("该资产链接含无法核验的参数。"); path = decodeURIComponent(raw);}
    else {
      if (/[?#]/u.test(href)) return {kind: "other"};
      if (!sourcePath && !href.startsWith("/")) {
        if (/^(?:\.\.\/)?assets\//u.test(href)) path = `${graph}/assets/${decodeURIComponent(href.replace(/^(?:\.\.\/)?assets\//u, ""))}`;
        else return {kind: "other"};
      } else path = resolveRelative(decodeURIComponent(href), sourcePath ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : graph);
    }
    localAssetURL(path);
    if (previewFormat(path) === "unsupported") return {kind: "other"};
    if (pathWithin(path, `${graph.replace(/\/+$/, "")}/assets`)) return {kind: "local-file", path, origin: "graph-asset"};
    if (roots.some(root => pathWithin(path, root))) return {kind: "local-file", path, origin: "material"};
    return {kind: "unresolved", problem: "此文件不在当前受信材料目录或 Graph assets 内，未读取。"};
  } catch (error) {return {kind: "unresolved", problem: error instanceof Error ? error.message : String(error)};}
}
