import { desktopBridge } from "../../host/desktop-files.ts";
import type { FileIO } from "../../host/file-io.ts";
import { normalizeRoot, versionOf } from "./store.ts";
import type { KeyStorage } from "../../workspace/material-context.ts";

/** Prepare only at a real save. No startup folder creation, source properties or directory binding. */
export async function prepareDefaultMaterialDirectory(io: FileIO, storage: KeyStorage, graph: string, choose: (problem: string) => Promise<string | null>): Promise<string> {
  const key=`workbench:default-material-directory:${graph}`;
  let directory=storage.getItem(key);
  try {
    if (!directory) {
      const dot=await desktopBridge().doAction(["getLogseqDotDirRoot"]);
      if(typeof dot!=="string" || !dot.endsWith("/.logseq"))throw new Error("无法核验宿主个人目录。");
      directory=`${dot.slice(0,-8)}/Documents/Task Copilot Materials/${(await versionOf(graph)).slice(0,20)}`;
    }
    await verify(directory);storage.setItem(key,directory);return directory;
  } catch(error) {
    const selected=await choose(`材料目录暂不可用：${error instanceof Error ? error.message : String(error)}。选择一个 Graph 外目录后继续保存。`);
    if(!selected)throw new Error("材料尚未保存，输入已保留。基础阅读仍可使用。",{cause:error});
    await verify(selected);storage.setItem(key,selected);return selected;
  }
  async function verify(path: string): Promise<void> {
    path=normalizeRoot(path.trim(),graph);
    await io.mkdir(path);
    if(io.stat && (await io.stat(path)).type!=="directory")throw new Error("请选择普通目录。");
    if(io.identity){const a=await io.identity(path),b=await io.identity(graph);if(a && a===b)throw new Error("材料目录不能指向当前 Graph。");}
    const marker=`${path}/.longdoc/storage.json`;await io.mkdir(`${path}/.longdoc`);
    const entries=await io.list(`${path}/.longdoc`);
    const prior=entries.some(entry=>entry===marker || entry==="storage.json") ? await io.read(marker) : null;
    const next=JSON.stringify({schemaVersion:1,graph});
    if(prior!==null && prior!==next)throw new Error("该默认目录已有其他 Graph 的记录，请选择独立目录。");
    await io.write(marker,next);if(await io.read(marker)!==next)throw new Error("材料目录未通过写入读回核验。");
  }
}
