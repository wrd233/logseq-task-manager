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
      if (entries === null) return [];
      if (!Array.isArray(entries) || entries.some(item => typeof item !== "string")) throw new Error("目录读取失败。");
      return entries as string[];
    },
    stat: async path => {
      const value = await call("stat", path) as {mode?: number; size?: number} | null;
      // Desktop 0.10.15 omits mode. A successful size plus readdir/ENOTDIR
      // distinguishes the host's directory and file results without guessing on errors.
      if (value && value.mode === undefined && Number.isSafeInteger(value.size) && value.size! >= 0) {
        try {
          const entries = await call("listdir", path, false);
          if (Array.isArray(entries)) return {type: "directory", size: value.size!};
        } catch (error) {
          if (/\bENOTDIR\b/u.test(String((error as {message?: unknown})?.message ?? error))) return {type: "file", size: value.size!};
          throw error;
        }
        throw new Error("文件状态不可用。");
      }
      if (!value || typeof value.mode !== "number" || typeof value.size !== "number") {
        // Desktop 0.10.9 returns null or {} for a missing stat. Confirm absence using
        // its parent's listing; an unreadable existing entry must not be created over.
        const parent = path.slice(0, path.lastIndexOf("/"));
        const entries = await call("listdir", parent, true);
        if (Array.isArray(entries) && !entries.includes(path) && !entries.includes(path.split("/").at(-1))) throw new Error("ENOENT: 文件不存在。");
      }
      if (!value || typeof value.mode !== "number" || typeof value.size !== "number") throw new Error("文件状态不可用。");
      const kind = value.mode & 0o170000;
      if (kind !== 0o100000 && kind !== 0o040000) throw new Error("请选择普通文件或目录。");
      return {type: kind === 0o100000 ? "file" : "directory", size: value.size};
    },
  };
}
