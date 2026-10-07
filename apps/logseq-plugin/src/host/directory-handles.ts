import type { DirectoryReadOptions, DirectorySnapshot, FileIO } from "./file-io.ts";
import {hasControlCharacters, localAssetURL} from "./local-bytes.ts";

interface DirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  queryPermission(options: {mode: "read"}): Promise<PermissionState>;
}
interface DirectoryDropItem extends DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}
export interface DirectoryGrant { graph: string; path: string; handle: DirectoryHandle }

/** A native folder drop supplies BOTH the absolute File.path and handle from the same
 * DataTransferItem. A picker handle/name alone cannot prove the configured path. */
export async function directoryGrantFromDrop(item: DataTransferItem, graph: string, expectedRoot?: string): Promise<DirectoryGrant> {
  const file = item.getAsFile() as File & {path?: string} | null;
  const path = file?.path?.replace(/\/+$/, "");
  if (!path || !graph) throw new Error("此次拖入没有可靠的实际目录路径。");
  localAssetURL(path);
  const graphPath = graph.replace(/\/+$/, "");
  if (path === graphPath || path.startsWith(`${graphPath}/`)) throw new Error("材料目录必须位于 Graph 外。");
  if (expectedRoot && path !== expectedRoot.replace(/\/+$/, "")) throw new Error("拖入的实际目录与此关联目录不同，原绑定保留。");
  // Obtain the promise synchronously while the drag payload is still readable.
  const pending = (item as DirectoryDropItem).getAsFileSystemHandle?.();
  if (!pending) throw new Error("此宿主不能从拖入目录取得受信的一级读取能力。");
  const handle = await pending;
  if (!handle || handle.kind !== "directory") throw new Error("请拖入目录本身。");
  return {graph, path, handle: handle as DirectoryHandle};
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("目录读取授权暂不可恢复。"));});
}
/** Only read grants are stored; it never calls requestPermission or acquires write access. */
export class MaterialDirectoryHandles {
  private readonly handles = new Map<string, DirectoryHandle>();
  private key(graph: string, path: string): string { return JSON.stringify([graph, path]); }
  private async database(): Promise<IDBDatabase> {
    const request = indexedDB.open("workbench-material-read-handles", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("roots");
    return requestResult(request);
  }
  async remember(grant: DirectoryGrant): Promise<void> {
    const db = await this.database();
    try {
      const transaction = db.transaction("roots", "readwrite");
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("目录读取授权未保存。"));
        transaction.objectStore("roots").put(grant.handle, this.key(grant.graph, grant.path));
      });
      this.handles.set(this.key(grant.graph, grant.path), grant.handle);
    } finally {db.close();}
  }
  private async handle(graph: string, path: string): Promise<DirectoryHandle | null> {
    const key = this.key(graph, path), cached = this.handles.get(key); if (cached) return cached;
    const db = await this.database();
    try {
      const value = await requestResult(db.transaction("roots", "readonly").objectStore("roots").get(key)) as DirectoryHandle | undefined;
      if (value?.kind === "directory" && typeof value.entries === "function") {this.handles.set(key, value); return value;}
      return null;
    } finally {db.close();}
  }
  async read(graph: string, root: string, path: string, options: DirectoryReadOptions): Promise<DirectorySnapshot> {
    options.signal?.throwIfAborted();
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 512 || options.cursor) throw new Error("此次一级目录读取的边界无效。");
    if (path !== root && !path.startsWith(`${root}/`)) throw new Error("目录读取越过关联根。");
    const parts = path.slice(root.length).split("/").filter(Boolean);
    if (parts.some(part => part === "." || part === ".." || hasControlCharacters(part) || part.includes("\\"))) throw new Error("目录读取位置无效。");
    let handle = await this.handle(graph, root); options.signal?.throwIfAborted();
    if (!handle || await handle.queryPermission({mode: "read"}) !== "granted") throw new Error("请拖入此关联目录本身，启用只读自动同步。原文件、历史和链接保留。");
    for (const part of parts) {options.signal?.throwIfAborted(); handle = await handle.getDirectoryHandle(part) as DirectoryHandle;}
    const entries: DirectorySnapshot["entries"] = []; let complete = true;
    for await (const [name, entry] of handle.entries()) {
      options.signal?.throwIfAborted();
      if (entries.length >= options.limit) {complete = false; break;}
      if (entry.kind !== "directory" && entry.kind !== "file") throw new Error("目录条目类型暂不可核验。");
      entries.push({name, type: entry.kind});
    }
    options.signal?.throwIfAborted();
    return {entries, complete, ...(complete ? {} : {problem: `当前层超过 ${options.limit} 项，仅显示已读取项；旧关联与历史保留。`})};
  }
  clearMemory(): void {this.handles.clear();}
  /** Roots come from the service's CURRENT scope on every read, rather than from a cached list. */
  attach(base: FileIO, graph: string, roots: () => string[]): FileIO {
    return {...base, listDirectory: async (path, options) => {
      const root = roots().filter(root => path === root || path.startsWith(`${root}/`)).sort((a, b) => b.length - a.length)[0];
      if (!root) throw new Error("该目录已不属于当前材料范围。");
      return this.read(graph, root, path, options);
    }};
  }
}
