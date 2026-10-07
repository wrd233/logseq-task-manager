import type { DirectorySnapshot, FileIO } from "../../host/file-io.ts";
import {hasControlCharacters} from "../../host/local-bytes.ts";
import type { MaterialDirectories, MaterialWorkContext } from "../../workspace/material-context.ts";
import { normalizeRoot } from "./store.ts";

export const directoryEntryLimit = 512;
export interface DirectoryLocation { root: string; relative: string }
export interface MaterialDirectoryEntry {
  name: string; path: string; type: "file" | "directory";
  /** Old observations are retained during incomplete reads, but never presented as current. */
  current: boolean;
}
export interface MaterialDirectoryPage {
  graph: string; ownerUuid: string | null; location: DirectoryLocation;
  entries: MaterialDirectoryEntry[]; complete: boolean;
  availability: "available" | "partial" | "unavailable";
  problem?: string; nextCursor?: string;
}
function relativeParts(relative: string): string[] {
  if (!relative) return [];
  const parts = relative.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || hasControlCharacters(part) || part.includes("\\"))) throw new Error("目录位置无效。");
  return parts;
}
export function directoryPath(location: DirectoryLocation): string {
  return [location.root, ...relativeParts(location.relative)].join("/");
}
/** Directory configuration remains separate from Workspace identity and registered history. */
export class MaterialDirectoryBrowser {
  constructor(private readonly io: FileIO, private readonly directories: MaterialDirectories, private readonly graph: string, private readonly globalRoot: string | null) {}
  roots(context: MaterialWorkContext): string[] {
    if (context.graph !== this.graph) throw new Error("材料 Graph 范围已变化。");
    const owner = context.ownerUuid ?? context.sourceUuid;
    const roots = owner ? this.directories.folders(this.graph, owner).map(folder => folder.directory) : [];
    if (context.directory && !roots.includes(context.directory)) roots.push(context.directory);
    if (!owner && !roots.length && this.globalRoot) roots.push(this.globalRoot);
    return [...new Set(roots.map(root => normalizeRoot(root, this.graph)))];
  }
  async read(context: MaterialWorkContext, location: DirectoryLocation, signal?: AbortSignal, previous?: MaterialDirectoryPage, cursor?: string): Promise<MaterialDirectoryPage> {
    const root = normalizeRoot(location.root, this.graph);
    if (!this.roots(context).includes(root)) throw new Error("该目录已不属于当前工作的材料范围。");
    const path = directoryPath({root, relative: location.relative});
    const page: MaterialDirectoryPage = {graph: this.graph, ownerUuid: context.ownerUuid ?? context.sourceUuid, location: {root, relative: location.relative}, entries: [], complete: false, availability: "unavailable"};
    const prior = previous?.graph === page.graph && previous.ownerUuid === page.ownerUuid && previous.location.root === root && previous.location.relative === location.relative ? previous.entries : [];
    let observed: DirectorySnapshot;
    try {
      if (!this.io.listDirectory) throw new Error("此宿主尚未提供有界的一级目录读取。请为该目录启用受信读取；原材料和引用保留。");
      observed = await this.io.listDirectory(path, {...(signal ? {signal} : {}), limit: directoryEntryLimit, ...(cursor ? {cursor} : {})});
      signal?.throwIfAborted();
      if (!observed || !Array.isArray(observed.entries) || typeof observed.complete !== "boolean") throw new Error("一级目录读取结果暂不可核验。");
    } catch (error) {
      signal?.throwIfAborted();
      return {...page, entries: prior.map(entry => ({...entry, current: false})), problem: error instanceof Error ? error.message : String(error)};
    }
    const seen = new Set<string>(); let invalid = observed.entries.length > directoryEntryLimit;
    for (const entry of observed.entries.slice(0, directoryEntryLimit)) {
      if (!entry || !["file", "directory"].includes(entry.type) || typeof entry.name !== "string" || !entry.name || hasControlCharacters(entry.name) || /[/\\]/u.test(entry.name) || [".", ".."].includes(entry.name) || seen.has(entry.name)) { invalid = true; continue; }
      seen.add(entry.name);
      if (entry.name.startsWith(".") || /^WORKSPACE(?:\.|$)/u.test(entry.name)) continue;
      page.entries.push({name: entry.name, path: `${path}/${entry.name}`, type: entry.type, current: true});
    }
    // A later page adds observations; it cannot turn absence on that page into deletion.
    page.complete = observed.complete && !invalid && !cursor && !observed.nextCursor;
    page.availability = page.complete ? "available" : "partial";
    if (!page.complete) for (const entry of prior) if (!seen.has(entry.name)) page.entries.push({...entry, current: false});
    page.entries.sort((a, b) => Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name));
    if (observed.problem || invalid) page.problem = observed.problem ?? "目录读取含无效或超限条目；旧观察仍保留。";
    if (observed.nextCursor) page.nextCursor = observed.nextCursor;
    return page;
  }
}

/** One bounded read at a time. A new work/Graph owns a new generation, including focus refreshes. */
export class MaterialDirectorySync<T> {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: AbortController | null = null;
  private read: ((signal: AbortSignal) => Promise<T>) | null = null;
  private publish: ((value: T) => void) | null = null;
  private failed: ((error: unknown) => void) | null = null;
  private off: (() => void) | null = null;
  private rerun = false;
  constructor(private readonly interval = 1000) {}
  start(read: (signal: AbortSignal) => Promise<T>, publish: (value: T) => void, failed: (error: unknown) => void, focusTarget?: EventTarget): void {
    this.stop(); this.read = read; this.publish = publish; this.failed = failed;
    const focus = () => this.refresh();
    focusTarget?.addEventListener("focus", focus);
    this.off = () => focusTarget?.removeEventListener("focus", focus);
    this.refresh();
  }
  refresh(): void {
    if (!this.read) return;
    if (this.timer !== null) clearTimeout(this.timer); this.timer = null;
    if (this.request) { this.rerun = true; return; }
    const generation = this.generation, request = new AbortController(); this.request = request;
    void this.read(request.signal).then(value => {
      if (generation === this.generation && !request.signal.aborted) this.publish?.(value);
    }).catch(error => {
      if (generation === this.generation && !request.signal.aborted) this.failed?.(error);
    }).finally(() => {
      if (generation !== this.generation) return;
      this.request = null;
      const delay = this.rerun ? 80 : this.interval; this.rerun = false;
      this.timer = setTimeout(() => { this.timer = null; this.refresh(); }, delay);
    });
  }
  stop(): void {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer); this.timer = null;
    this.request?.abort(); this.request = null; this.rerun = false;
    this.off?.(); this.off = null; this.read = this.publish = this.failed = null;
  }
}
