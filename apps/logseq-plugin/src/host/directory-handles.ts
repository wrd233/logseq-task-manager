import type { DirectoryReadOptions, DirectorySnapshot, FileIO } from "./file-io.ts";
import {hasControlCharacters, localAssetURL} from "./local-bytes.ts";

interface DirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  queryPermission(options: {mode: "read"}): Promise<PermissionState>;
  requestPermission(options: {mode: "read"}): Promise<PermissionState>;
}
interface DirectoryDropItem extends DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}
export interface DirectoryGrant { graph: string; path: string; handle: DirectoryHandle; entry?: FileSystemDirectoryEntry }

/** Only the native one-file XML pasteboard representation is accepted. A picker name
 * or browser-supplied text cannot establish an absolute path. No external DTD is read. */
export function nativeClipboardDirectoryPath(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > 65536) throw new Error("目录剪贴板数据越过读取边界。");
  const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/iu.test(text)) throw new Error("目录剪贴板含无法核验的 XML 声明。");
  const xml = new DOMParser().parseFromString(text, "application/xml"), plist = xml.documentElement;
  const array = plist.children[0], value = array?.children[0];
  if (xml.querySelector("parsererror") || plist.tagName !== "plist" || plist.children.length !== 1 || array?.tagName !== "array" || array.children.length !== 1 || value?.tagName !== "string" || value.children.length) throw new Error("请在访达复制单个真实目录后粘贴。");
  const path = (value.textContent ?? "").replace(/\/+$/, ""); localAssetURL(path);
  return path;
}

/** Both facts are captured synchronously from one trusted OS paste event, before
 * awaiting the handle. The public preload supplies the native absolute path; the
 * same event supplies its read capability. Never infer the path from handle.name. */
export async function directoryGrantFromPaste(event: ClipboardEvent, graph: string, readNativeFiles: () => Uint8Array | null, expectedRoot?: string): Promise<DirectoryGrant> {
  if (!event.isTrusted || !graph || event.clipboardData?.files.length !== 1 || event.clipboardData.items.length !== 1) throw new Error("请在访达复制单个真实目录，在这里粘贴。");
  const item = event.clipboardData.items[0] as DirectoryDropItem;
  const native = readNativeFiles(), entry = item.webkitGetAsEntry?.(), pending = item.getAsFileSystemHandle?.().catch(() => null), confirm = readNativeFiles();
  if (!native || !confirm || native.length !== confirm.length || native.some((byte, i) => byte !== confirm[i])) throw new Error("目录剪贴板已变化，原关联保留，请重新复制。");
  if (!pending) throw new Error("此宿主不能从粘贴取得目录只读能力。");
  const path = nativeClipboardDirectoryPath(native), graphPath = graph.replace(/\/+$/, "");
  if (path === graphPath || path.startsWith(`${graphPath}/`)) throw new Error("材料目录必须位于 Graph 外。");
  if (expectedRoot && path !== expectedRoot.replace(/\/+$/, "")) throw new Error("粘贴的实际目录与此关联目录不同，原绑定保留。");
  const handle = await pending;
  if (!handle || handle.kind !== "directory") throw new Error("请复制目录本身。");
  return {graph, path, handle: handle as DirectoryHandle, ...(entry?.isDirectory ? {entry: entry as FileSystemDirectoryEntry} : {})};
}

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
function boundedDirectoryRead<T>(signal: AbortSignal | undefined, start: (done: (value: T) => void, failed: (error: unknown) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, value?: T) => {if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", aborted); if (error !== null) reject(error); else resolve(value!);};
    const aborted = () => finish(new DOMException("目录读取已取消。", "AbortError"));
    const timer = setTimeout(() => finish(new Error("一级目录读取超时，旧观察与关联保留。")), 5000);
    if (signal?.aborted) aborted(); else {signal?.addEventListener("abort", aborted, {once: true}); try {start(value => finish(null, value), error => finish(error));} catch (error) {finish(error);}}
  });
}
export async function readNativeDirectoryEntry(root: FileSystemDirectoryEntry, parts: string[], options: DirectoryReadOptions): Promise<DirectorySnapshot> {
  if (parts.some(part => !part || part === "." || part === ".." || /[/\\]/u.test(part) || hasControlCharacters(part))) throw new Error("目录读取位置无效。");
  let directory = root;
  for (const part of parts) {options.signal?.throwIfAborted(); directory = await boundedDirectoryRead<FileSystemDirectoryEntry>(options.signal, (done, failed) => directory.getDirectory(part, {create: false}, value => {if (value.isDirectory) done(value as FileSystemDirectoryEntry); else failed(new Error("请选择目录本身。"));}, failed));}
  const reader = directory.createReader(), entries: DirectorySnapshot["entries"] = [];
  while (true) {
    const batch = await boundedDirectoryRead<FileSystemEntry[]>(options.signal, (done, failed) => reader.readEntries(done, failed)); options.signal?.throwIfAborted();
    if (!batch.length) return {entries, complete: true};
    for (const entry of batch) {
      if (entries.length >= options.limit) return {entries, complete: false, problem: `当前层超过 ${options.limit} 项，仅显示已读取项；旧关联与历史保留。`};
      if (!entry.isFile && !entry.isDirectory) throw new Error("目录条目类型暂不可核验。");
      entries.push({name: entry.name, type: entry.isDirectory ? "directory" : "file"});
    }
  }
}
/** Only read grants are stored. Background reads never request permission; an
 * explicit resume click may restore the existing grant with mode=read only. */
export class MaterialDirectoryHandles {
  private readonly handles = new Map<string, DirectoryHandle>();
  private readonly entries = new Map<string, FileSystemDirectoryEntry>();
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
      if (grant.entry) this.entries.set(this.key(grant.graph, grant.path), grant.entry);
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
  async resume(graph: string, root: string): Promise<void> {
    localAssetURL(root);
    const handle = await this.handle(graph, root);
    if (!handle) throw new Error("请先在访达复制这个实际目录，再在这里粘贴。目录名不能替代实际路径核验。");
    const state = await handle.queryPermission({mode: "read"});
    if (state !== "granted" && await handle.requestPermission({mode: "read"}) !== "granted") throw new Error("当前目录的只读访问未恢复，原文件与历史保留。");
  }
  async read(graph: string, root: string, path: string, options: DirectoryReadOptions): Promise<DirectorySnapshot> {
    options.signal?.throwIfAborted();
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 512 || options.cursor) throw new Error("此次一级目录读取的边界无效。");
    if (path !== root && !path.startsWith(`${root}/`)) throw new Error("目录读取越过关联根。");
    const parts = path.slice(root.length).split("/").filter(Boolean);
    if (parts.some(part => part === "." || part === ".." || hasControlCharacters(part) || part.includes("\\"))) throw new Error("目录读取位置无效。");
    const legacy = this.entries.get(this.key(graph, root));
    if (legacy) return readNativeDirectoryEntry(legacy, parts, options);
    let handle = await this.handle(graph, root); options.signal?.throwIfAborted();
    if (!handle || await handle.queryPermission({mode: "read"}) !== "granted") throw new Error("请在访达复制此关联目录，在材料区粘贴，启用只读自动同步。原文件、历史和链接保留。");
    for (const part of parts) {options.signal?.throwIfAborted(); const current = handle; handle = await boundedDirectoryRead<DirectoryHandle>(options.signal, (done, failed) => {void current!.getDirectoryHandle(part).then(value => done(value as DirectoryHandle), failed);});}
    const entries: DirectorySnapshot["entries"] = []; let complete = true;
    const iterator = handle.entries();
    while (true) {
      const next = await boundedDirectoryRead<IteratorResult<[string, FileSystemHandle]>>(options.signal, (done, failed) => {void iterator.next().then(done, failed);});
      if (next.done) break;
      const [name, entry] = next.value;
      options.signal?.throwIfAborted();
      if (entries.length >= options.limit) {complete = false; break;}
      if (entry.kind !== "directory" && entry.kind !== "file") throw new Error("目录条目类型暂不可核验。");
      entries.push({name, type: entry.kind});
    }
    options.signal?.throwIfAborted();
    // Chromium's newer handle iterator silently skips non-portable names (e.g.
    // '*' on macOS). Never call that a complete filesystem observation. A fresh
    // native paste supplies the legacy reader, whose namespace is complete.
    return {entries, complete: false, problem: complete ? "目录授权已恢复；此宿主接口会过滤部分特殊文件名。再次原生粘贴该目录可读取这些名称；旧观察和关联保留。" : `当前层超过 ${options.limit} 项，仅显示已读取项；旧关联与历史保留。`};
  }
  clearMemory(): void {this.handles.clear(); this.entries.clear();}
  /** Roots come from the service's CURRENT scope on every read, rather than from a cached list. */
  attach(base: FileIO, graph: string, roots: () => string[]): FileIO {
    return {...base, listDirectory: async (path, options) => {
      const root = roots().filter(root => path === root || path.startsWith(`${root}/`)).sort((a, b) => b.length - a.length)[0];
      if (!root) throw new Error("该目录已不属于当前材料范围。");
      return this.read(graph, root, path, options);
    }};
  }
}
