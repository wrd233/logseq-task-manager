import {button, element} from "../../host/panel-host.ts";
import type {MaterialWorkContext} from "../../workspace/material-context.ts";
import type {MaterialService} from "./service.ts";
import type {MaterialRecord} from "./store.ts";
import {fileName} from "./names.ts";
import {MaterialDirectoryBrowser, MaterialDirectorySync, type DirectoryLocation, type MaterialDirectoryPage} from "./directory.ts";

export interface MaterialDirectoryUIOptions {
  valid(): void;
  open(path: string): Promise<void>;
  grant(event: ClipboardEvent, root: string): Promise<void>;
  resume(root: string): Promise<void>;
  decorate(entry: HTMLElement, record: MaterialRecord): HTMLElement;
  history(): Promise<void>;
  position?: DirectoryLocation;
  moved(location: DirectoryLocation): void;
}
export interface MaterialDirectoryUI {refresh(): Promise<void>; dispose(): void}
/** A current one-level directory is the default surface. Registered history is a
 * separate discoverable entry, never substituted for filesystem observations. */
export async function renderMaterialDirectory(parent: HTMLElement, service: MaterialService, context: MaterialWorkContext, options: MaterialDirectoryUIOptions): Promise<MaterialDirectoryUI> {
  const owner = context.ownerUuid ?? context.sourceUuid;
  const browser = new MaterialDirectoryBrowser(service.io, service.directories, context.graph, service.globalRoot), roots = browser.roots(context);
  const header = element("div", "", "wb-material-folder-heading"), breadcrumbs = element("nav", "", "wb-material-breadcrumb"), problem = element("p", "", "wb-preview-notice"), rows = element("div"), grant = element("div", "", "wb-material-read-grant");
  breadcrumbs.setAttribute("aria-label", "材料目录位置"); problem.setAttribute("role", "status"); rows.dataset.materialDirectoryRows = "true";
  grant.tabIndex = 0; grant.setAttribute("role", "group"); grant.setAttribute("aria-label", "粘贴目录以启用只读同步"); grant.textContent = "首次读取：在访达复制当前目录，点击这里并粘贴，启用只读自动同步。"; grant.onclick = () => grant.focus();
  grant.append(button("继续只读同步", () => {
    if (!location) return;
    void options.resume(location.root).then(() => {options.valid(); start();}).catch(showError);
  }));
  const selector = element("select"); selector.setAttribute("aria-label", "当前材料根目录");
  for (const [index, root] of roots.entries()) {const item = element("option", `${index + 1}. ${fileName(root)} · ${root}`); item.value = root; selector.append(item);}
  header.append(selector, button("刷新", () => void refresh().catch(showError)), button("已关联与历史材料", () => void options.history().catch(showError)));
  parent.append(header, breadcrumbs, problem, grant, rows);
  let location: DirectoryLocation | null = roots.length ? options.position && roots.includes(options.position.root) ? {...options.position} : {root: roots[0]!, relative: ""} : null;
  let disposed = false, records = new Map<string, MaterialRecord>(), recordRead = 0, publishedLocation = "";
  const pages = new Map<string, MaterialDirectoryPage>(), sync = new MaterialDirectorySync<MaterialDirectoryPage>(), plainRows = new Map<string, HTMLElement>(), knownRows = new Map<string, {signature: string; row: HTMLElement}>();
  if (!location) {selector.disabled = true; grant.hidden = true; problem.textContent = "当前工作尚未关联材料目录。可在目录管理中添加；已有材料从历史入口查看。";}
  const nativePaste = (event: ClipboardEvent) => {
    if (!location || !event.clipboardData?.files.length) return;
    event.preventDefault(); event.stopImmediatePropagation(); const root = location.root;
    // grant() must synchronously capture the native event; do not await anything first.
    void options.grant(event, root).then(() => {options.valid(); problem.textContent = "只读目录已启用。"; start();}).catch(showError);
  };
  grant.addEventListener("paste", nativePaste, true);
  selector.onchange = () => {if (roots.includes(selector.value)) navigate({root: selector.value, relative: ""});};
  function navigate(next: DirectoryLocation): void {options.valid(); location = next; options.moved({...next}); start();}
  function start(): void {
    if (!location || disposed) return;
    const selected = {...location}; selector.value = selected.root; breadcrumbs.replaceChildren();
    breadcrumbs.append(button(fileName(selected.root), () => navigate({root: selected.root, relative: ""})));
    const parts = selected.relative ? selected.relative.split("/") : [];
    parts.forEach((part, index) => {breadcrumbs.append(element("span", " / "), button(part, () => navigate({root: selected.root, relative: parts.slice(0, index + 1).join("/")})));});
    if (parts.length) breadcrumbs.append(button("返回上层", () => navigate({root: selected.root, relative: parts.slice(0, -1).join("/")})));
    const key = JSON.stringify(selected);
    sync.start(signal => {options.valid(); return browser.read(context, selected, signal, pages.get(key));}, page => {options.valid(); pages.set(key, page); publish(page);}, showError, window);
  }
  function publish(page: MaterialDirectoryPage): void {
    if (disposed) return;
    const pageKey = JSON.stringify(page.location), sameLocation = pageKey === publishedLocation;
    const message = page.problem ?? (page.complete ? "" : "当前层仅部分可读，旧观察仍保留；未把未读取项当成删除。");
    if (problem.textContent !== message) problem.textContent = message;
    grant.hidden = page.availability === "available";
    const rendered: HTMLElement[] = [];
    for (const file of page.entries) {
      const record = records.get(file.path);
      let row: HTMLElement;
      if (file.type === "file" && record) {
        const signature = JSON.stringify([file.path, file.name, record.title, record.summary, record.rename, record.references]), previous = knownRows.get(record.id);
        if (previous?.signature === signature) row = previous.row;
        else {
          const entry = button(file.name, () => void options.open(file.path).catch(showError)); entry.className = "wb-material-open"; entry.dataset.materialId = record.id; entry.title = file.path;
          row = options.decorate(entry, record); knownRows.set(record.id, {signature, row});
        }
      } else {
        const rowKey = JSON.stringify([page.location.root, file.path]);
        row = plainRows.get(rowKey) ?? element("div", "", "wb-material-entry");
        if (!plainRows.has(rowKey)) {
          const open = button(file.type === "directory" ? `▸ ${file.name}` : file.name, () => {
            if (file.type === "directory") navigate({root: page.location.root, relative: [page.location.relative, file.name].filter(Boolean).join("/")});
            else void options.open(file.path).catch(showError);
          }); open.className = "wb-material-open"; open.title = file.path; row.append(open); plainRows.set(rowKey, row);
        }
      }
      if (row.dataset.directoryPath !== file.path) row.dataset.directoryPath = file.path;
      if (row.dataset.directoryCurrent !== String(file.current)) row.dataset.directoryCurrent = String(file.current);
      let stale = row.querySelector<HTMLElement>("[data-last-known]");
      if (!file.current && !stale) {stale = element("small", "上次可见 · 当前未核验", "wb-preview-notice"); stale.dataset.lastKnown = "true"; row.append(stale);}
      if (file.current) stale?.remove(); rendered.push(row);
    }
    if (!rendered.length && page.complete) rendered.push(element("p", "当前层暂无文件。"));
    const wanted = new Set(rendered); for (const node of Array.from(rows.children)) if (!wanted.has(node as HTMLElement)) {
      // A complete filesystem observation may remove a file, but it must not
      // erase the user's in-progress filename input while they are typing.
      if (sameLocation && node.contains(document.activeElement) && node.querySelector("input")) {const row = node as HTMLElement; row.dataset.directoryCurrent = "false"; rendered.push(row);}
      else node.remove();
    }
    let cursor = rows.firstElementChild; for (const row of rendered) {if (row !== cursor) rows.insertBefore(row, cursor); cursor = row.nextElementSibling;}
    if (rows.dataset.directoryComplete !== String(page.complete)) rows.dataset.directoryComplete = String(page.complete);
    publishedLocation = pageKey;
  }
  function showError(error: unknown): void {if (disposed) return; try {options.valid(); problem.textContent = error instanceof Error ? error.message : String(error);} catch { /* A later scope owns the panel. */ }}
  async function refresh(): Promise<void> {
    const ticket = ++recordRead;
    const known = await service.list("", owner); options.valid(); if (disposed || ticket !== recordRead) return;
    records = new Map(known.filter(record => record.path).map(record => [record.path!, record])); sync.refresh();
  }
  await refresh(); options.valid(); start();
  const visible = () => {if (!document.hidden) sync.refresh();}; document.addEventListener("visibilitychange", visible);
  return {refresh, dispose: () => {if (disposed) return; disposed = true; recordRead++; sync.stop(); document.removeEventListener("visibilitychange", visible); grant.removeEventListener("paste", nativePaste, true); plainRows.clear(); knownRows.clear(); pages.clear(); records.clear();}};
}
