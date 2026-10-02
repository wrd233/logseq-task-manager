import type { FileIO } from "../host/file-io.ts";

export interface MaterialWorkContext {
  graph: string;
  sourceUuid: string | null;
  directory: string | null;
  organization: "flat" | "project";
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
