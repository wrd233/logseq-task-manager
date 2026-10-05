import type { FileIO } from "../host/file-io.ts";

export interface MaterialWorkContext {
  graph: string;
  sourceUuid: string | null;
  directory: string | null;
  organization: "flat" | "project";
  /** Material destination owner; sourceUuid remains the actual note association. */
  ownerUuid?: string;
}
export interface MaterialFolder { directory: string; organization: "flat" | "project"; automatic?: boolean }
interface FolderPreferences { folders: MaterialFolder[]; defaultDirectory: string | null; excludePrimary?: boolean }
export function materialAssociations(context: MaterialWorkContext): Array<{graph: string; sourceUuid: string}> {
  return [...new Set([context.sourceUuid, context.ownerUuid].filter((value): value is string => !!value))].map(sourceUuid => ({graph: context.graph, sourceUuid}));
}
/** Composition-root injection keeps the existing UI and the workspace on one binding path. */
export interface MaterialBindingCommands {
  directories: MaterialDirectories;
  bind(context: MaterialWorkContext): Promise<void>;
}
export interface KeyStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
/** Small, persistent binding port; no lifecycle, hierarchy or task-controller state. */
export class MaterialDirectories {
  constructor(private readonly storage: KeyStorage) {}
  private folderKey(graph: string, uuid: string): string { return `workbench:material-folders:${JSON.stringify([graph, uuid])}`; }
  private preferences(graph: string, uuid: string): FolderPreferences {
    const raw = this.storage.getItem(this.folderKey(graph, uuid));
    if (!raw) return {folders: [], defaultDirectory: null};
    const value = JSON.parse(raw) as FolderPreferences;
    if (!Array.isArray(value.folders) || value.folders.some(folder => typeof folder.directory !== "string" || !["flat", "project"].includes(folder.organization)) || value.defaultDirectory !== null && typeof value.defaultDirectory !== "string") throw new Error("材料目录设置不可读，原绑定仍保留。");
    return value;
  }
  /** Material folders do not replace the primary Workspace manifest/binding. */
  folders(graph: string, uuid: string): MaterialFolder[] {
    const value = this.preferences(graph, uuid), primary = this.binding(graph, uuid);
    return primary && !value.excludePrimary && !value.folders.some(folder => folder.directory === primary.directory) ? [{directory: primary.directory!, organization: "flat"}, ...value.folders] : value.folders;
  }
  defaultFolder(graph: string, uuid: string): MaterialFolder | null {
    const value = this.preferences(graph, uuid), folders = this.folders(graph, uuid);
    return folders.find(folder => folder.directory === value.defaultDirectory) ?? folders[0] ?? null;
  }
  addFolder(graph: string, uuid: string, folder: MaterialFolder, makeDefault = false): void {
    const value = this.preferences(graph, uuid);
    if (!value.folders.some(item => item.directory === folder.directory)) value.folders.push(folder);
    if (makeDefault || !this.defaultFolder(graph, uuid)) value.defaultDirectory = folder.directory;
    this.storage.setItem(this.folderKey(graph, uuid), JSON.stringify(value));
    this.register(graph, folder.directory);
  }
  selectDefault(graph: string, uuid: string, directory: string): void {
    if (!this.folders(graph, uuid).some(folder => folder.directory === directory)) throw new Error("请先添加这个目录。");
    const value = this.preferences(graph, uuid); value.defaultDirectory = directory;
    this.storage.setItem(this.folderKey(graph, uuid), JSON.stringify(value));
  }
  removeFolder(graph: string, uuid: string, directory: string): void {
    const value = this.preferences(graph, uuid);
    value.folders = value.folders.filter(folder => folder.directory !== directory);
    if (this.binding(graph, uuid)?.directory === directory) value.excludePrimary = true;
    if (value.defaultDirectory === directory) value.defaultDirectory = null;
    this.storage.setItem(this.folderKey(graph, uuid), JSON.stringify(value));
    // Registered record roots and locator hints remain valid for existing links.
  }
  private bindingKey(graph: string, uuid: string): string { return `workbench:material-binding:${JSON.stringify([graph, uuid])}`; }
  binding(graph: string, uuid: string): Pick<MaterialWorkContext, "directory" | "organization"> | null {
    const value = this.storage.getItem(this.bindingKey(graph, uuid));
    if (!value) return null;
    const binding = JSON.parse(value) as Pick<MaterialWorkContext, "directory" | "organization">;
    if (typeof binding.directory !== "string" || !["flat", "project"].includes(binding.organization)) throw new Error("工作目录绑定无效，请重新绑定。");
    return binding;
  }
  bind(context: MaterialWorkContext): void {
    if (!context.sourceUuid) throw new Error("请先选择工作块。");
    if (context.directory) this.storage.setItem(this.bindingKey(context.graph, context.sourceUuid), JSON.stringify({directory: context.directory, organization: context.organization}));
    else this.storage.removeItem(this.bindingKey(context.graph, context.sourceUuid));
  }
  /** Enumerate explicit bindings only; used by the local workspace observer, never a Graph scan. */
  bindings(graph: string): MaterialWorkContext[] {
    const prefix = "workbench:material-binding:", result: MaterialWorkContext[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i); if (!key?.startsWith(prefix)) continue;
      const [owner, uuid] = JSON.parse(key.slice(prefix.length)) as [string, string];
      if (owner !== graph || typeof uuid !== "string") continue;
      const binding = this.binding(graph, uuid);
      if (binding) result.push({graph, sourceUuid: uuid, ...binding});
    }
    return result;
  }
  register(graph: string, root: string): void { this.storage.setItem(`workbench:material-root:${JSON.stringify([graph, root])}`, root); }
  roots(graph: string): string[] {
    const prefix = "workbench:material-root:", roots: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i); if (!key?.startsWith(prefix)) continue;
      const [owner, root] = JSON.parse(key.slice(prefix.length)) as [string, string];
      if (owner === graph && typeof root === "string") roots.push(root);
    }
    return [...new Set(roots)];
  }
  // Derived hints can be rebuilt by looking for the exact ID in registered roots.
  remember(graph: string, id: string, root: string): void { this.storage.setItem(`workbench:material-locator:${JSON.stringify([graph, id])}`, root); }
  hint(graph: string, id: string): string | null { return this.storage.getItem(`workbench:material-locator:${JSON.stringify([graph, id])}`); }
}

export async function captureDirectory(io: FileIO, context: MaterialWorkContext, globalRoot: string | null, role: "reference" | "input" | "draft" | "output"): Promise<string> {
  if (!context.directory) {
    if (!globalRoot) throw new Error("请绑定工作目录，或在设置中配置全局材料目录。内容已保留。");
    return globalRoot;
  }
  const root = context.directory;
  try {
    if (io.stat && (await io.stat(root)).type !== "directory") throw new Error("不是目录");
    await io.list(root);
  } catch { throw new Error("工作目录暂不可用，内容已保留。请恢复目录或明确重新绑定。"); }
  if (context.organization === "flat") return root;
  const candidates = role === "output" ? ["成果", "outputs", "output"] : role === "draft" ? ["工作记录", "notes", "work"] : ["材料", "materials", "references"];
  const entries = await io.list(root);
  for (const name of candidates) {
    const path = `${root}/${name}`;
    if (entries.some(entry => entry === name || entry === path || entry.startsWith(`${path}/`))) {
      if (!io.stat || (await io.stat(path)).type === "directory") return path;
    } else if (io.stat) {
      try { if ((await io.stat(path)).type === "directory") return path; } catch { /* This optional conventional directory does not exist. */ }
    }
  }
  return `${root}/${candidates[0]}`;
}
