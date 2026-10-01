import type { FileIO } from "./file-io.ts";

export interface DesktopBridge { doAction(args: unknown[]): Promise<unknown>; openPath(path: string): Promise<unknown> }
export function desktopBridge(): DesktopBridge {
  const host = window.top as Window & {apis?: DesktopBridge};
  if (!host?.apis?.doAction) throw new Error("当前环境没有桌面文件桥接。"); return host.apis;
}
export function desktopFiles(graphPath: () => string): FileIO {
  const call = (...args: unknown[]) => desktopBridge().doAction(args);
  return {
    read: async path => { const text = await call("readFile", path); if (typeof text !== "string") throw new Error("文件读取失败。"); return text; },
    write: async (path, text) => { await call("writeFile", graphPath(), path, text); },
    mkdir: async path => { await call("mkdir-recur", path); },
    rename: async (from, to) => { await call("rename", from, to); },
    list: async path => {
      const entries = await call("listdir", path, true);
      if (!Array.isArray(entries) || entries.some(item => typeof item !== "string")) throw new Error("目录读取失败。");
      return entries as string[];
    },
  };
}
