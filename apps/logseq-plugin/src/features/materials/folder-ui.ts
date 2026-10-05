import { button, element } from "../../host/panel-host.ts";
import { desktopBridge, pickMaterialDirectory } from "../../host/desktop-files.ts";
import type { MaterialWorkContext } from "../../workspace/material-context.ts";
import type { MaterialService } from "./service.ts";
import { normalizeRoot } from "./store.ts";
import { fileName } from "./names.ts";

export async function renderMaterialFolders(parent: HTMLElement, service: MaterialService, context: MaterialWorkContext, valid: () => void, changed: () => Promise<void>): Promise<void> {
  const owner = context.ownerUuid ?? context.sourceUuid;
  if (!owner) { parent.append(element("p", "先打开一个工作，再管理它的材料目录。")); return; }
  const header = element("div", "", "wb-material-folder-heading");
  const add = button("＋", () => void choose().catch(showError)); add.setAttribute("aria-label", "添加材料目录");
  header.append(element("p", "新拖入的文件和收纳长文保存到默认目录。"), add); parent.append(header);
  const problem = element("p", "", "wb-error"); problem.setAttribute("role", "status"); parent.append(problem);
  if (!service.directories.defaultFolder(context.graph, owner)) await service.destination(context, "input"); valid();
  const folders = service.directories.folders(context.graph, owner), selected = service.directories.defaultFolder(context.graph, owner);
  for (const folder of folders) {
    const displayName = folder.automatic ? "工作专属目录" : fileName(folder.directory);
    const row = element("div", "", "wb-material-folder"), radio = element("input"); radio.type = "radio"; radio.name = "material-default-folder";
    radio.checked = selected?.directory === folder.directory; radio.setAttribute("aria-label", `将${displayName}设为默认材料目录`);
    radio.onchange = () => { valid(); service.directories.selectDefault(context.graph, owner, folder.directory); void changed().catch(showError); };
    const label = element("div"), title = element("strong", displayName); label.title = folder.directory;
    label.append(title, element("small", folder.automatic ? "默认目录下 · 此工作专属" : folder.directory)); if (radio.checked) label.append(element("small", "默认保存位置"));
    const more = element("details"), summary = element("summary", "操作"); more.append(summary,
      button("打开目录", () => void desktopBridge().openPath(folder.directory).then(result => { valid(); if (typeof result === "string" && result) throw Error(result); }).catch(showError)),
      button("刷新文件", () => { valid(); problem.textContent = "正在读取目录…"; void service.refreshFolder(folder.directory, context).then(problems => { valid(); problem.textContent = problems.length ? problems.join("；") : "目录文件已更新。"; }).catch(showError); }),
      button("解除关联", () => { valid(); service.directories.removeFolder(context.graph, owner, folder.directory); void changed().catch(showError); }));
    row.append(radio, label, more); parent.append(row);
  }
  parent.append(element("small", "切换默认目录只影响新文件。解除关联会保留文件和已有材料链接。", "wb-material-facts"));
  async function choose(): Promise<void> {
    add.disabled = true; problem.textContent = "";
    try {
      const path = await pickMaterialDirectory(); valid(); if (!path) return;
      const directory = normalizeRoot(path, context.graph);
      if ((await service.io.stat?.(directory))?.type !== "directory") throw new Error("请选择已有目录。");
      await service.io.list(directory); valid();
      service.directories.addFolder(context.graph, owner!, {directory, organization: "flat"});
      const problems = await service.refreshFolder(directory, context); valid();
      if (problems.length) throw new Error(`目录已添加，部分文件暂不可读：${problems.join("；")}`);
      await changed();
    } finally { add.disabled = false; }
  }
  function showError(error: unknown): void { try { valid(); problem.textContent = error instanceof Error ? error.message : String(error); } catch { /* A later work owns the screen. */ } }
}
