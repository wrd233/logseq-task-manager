export interface FileIO {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(path: string): Promise<string[]>;
}
export interface MaterialRecord {
  id: string;
  title: string;
  createdAt: string;
  kind: "capture" | "reference";
  path?: string;
  graph?: string;
  sourceUuid?: string;
  original: string;
  originalHTML?: string;
  recoveredFrom?: string;
}
export type CaptureMetadata = Partial<Omit<MaterialRecord, "id" | "createdAt" | "kind">>;
export const docIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export function normalizeRoot(root: string, graph: string): string {
  const clean = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalized = clean(root), graphPath = clean(graph);
  if (!normalized.startsWith("/") || normalized.split("/").some(part => part === "." || part === "..") || normalized === "" || normalized === "/") throw new Error("请配置绝对文档目录，路径不能包含 . 或 ..。");
  if (normalized === graphPath || normalized.startsWith(`${graphPath}/`)) throw new Error("文档目录必须位于 Graph 外。");
  return normalized;
}
export function titleOf(text: string): string {
  return (text.split(/\r?\n/).find(line => line.trim()) ?? "未命名文档").replace(/^\s{0,3}#{1,6}\s+/, "").replace(/[[\]<>\r\n]/g, "").trim().slice(0, 64) || "未命名文档";
}
export function isLong(text: string, chars = 2000, lines = 30): boolean {
  return text.length >= Math.max(100, chars || 2000) || text.split(/\r?\n/).filter(line => line.trim()).length >= Math.max(5, lines || 30);
}
export function makeLink(record: Pick<MaterialRecord, "id" | "title">): string { return `[📄 ${titleOf(record.title)}](longdoc://${record.id})`; }
export function idFrom(text: string): string | null {
  const id = /longdoc:\/\/([0-9a-f-]{36})/i.exec(text)?.[1]; return id && docIdPattern.test(id) ? id : null;
}
export function restoreCapture(content: string, record: MaterialRecord): string {
  if (record.kind !== "capture") throw new Error("关联文件没有收纳原文。");
  const token = makeLink(record), index = content.indexOf(token);
  if (index < 0 || content.indexOf(token, index + token.length) >= 0) throw new Error("引用已变化或重复，原文未替换。");
  return content.slice(0, index) + record.original + content.slice(index + token.length);
}
export class ConflictError extends Error {
  constructor(readonly current: string) { super("外部文件已修改，当前草稿已保留。"); this.name = "ConflictError"; }
}

/** Individual recovery records are authoritative. The library has no shared mutable catalog. */
export class MaterialStore {
  constructor(readonly io: FileIO, readonly root: string) {}
  file(id: string): string { if (!docIdPattern.test(id)) throw new Error("无效文档 ID。"); return `${this.root}/${id}.md`; }
  async init(): Promise<void> { await this.io.mkdir(`${this.root}/.longdoc/history`); }
  async verified(path: string, text: string): Promise<void> {
    await this.io.write(path, text); if (await this.io.read(path) !== text) throw new Error("文件读回核对失败。");
  }
  private async atomic(path: string, text: string): Promise<void> {
    const pending = `${path}.${crypto.randomUUID()}.pending`;
    await this.verified(pending, text); await this.io.rename(pending, path);
    if (await this.io.read(path) !== text) throw new Error("保存后文件发生变化，历史快照已保留。");
  }
  private async put(record: MaterialRecord): Promise<MaterialRecord> {
    await this.verified(`${this.root}/.longdoc/${record.id}.json`, JSON.stringify(record)); return record;
  }
  async create(text: string, metadata: CaptureMetadata = {}): Promise<MaterialRecord> {
    await this.init();
    const record: MaterialRecord = { ...metadata, id: crypto.randomUUID(), title: titleOf(metadata.title ?? text), kind: "capture", createdAt: new Date().toISOString(), original: metadata.original ?? text };
    await this.verified(this.file(record.id), text); return this.put(record);
  }
  async reference(path: string, metadata: CaptureMetadata = {}): Promise<MaterialRecord> {
    if (!path.startsWith("/") || !/\.md$/i.test(path) || path.split("/").some(part => part === "." || part === "..")) throw new Error("目前可关联绝对路径的 Markdown 文件。");
    if (metadata.graph) normalizeRoot(path, metadata.graph);
    const text = await this.io.read(path); await this.init();
    return this.put({ ...metadata, id: crypto.randomUUID(), title: titleOf(metadata.title ?? text), kind: "reference", path, createdAt: new Date().toISOString(), original: text });
  }
  async record(id: string): Promise<MaterialRecord> {
    this.file(id);
    const record = JSON.parse(await this.io.read(`${this.root}/.longdoc/${id}.json`)) as MaterialRecord;
    if (record.id !== id || !["capture", "reference"].includes(record.kind) || typeof record.title !== "string" || typeof record.original !== "string") throw new Error("文档记录无效，停止读写。");
    return record;
  }
  async path(id: string): Promise<string> {
    const record = await this.record(id);
    if (record.kind === "reference") {
      if (!record.path?.startsWith("/") || !/\.md$/i.test(record.path) || record.path.split("/").some(part => part === "." || part === "..")) throw new Error("关联路径无效。");
      return record.path;
    }
    return this.file(id);
  }
  async read(id: string): Promise<string> { return this.io.read(await this.path(id)); }
  async save(id: string, base: string, next: string): Promise<string> {
    const path = await this.path(id);
    const execute = async () => {
      const current = await this.io.read(path);
      if (current !== base) throw new ConflictError(current);
      if (current === next) return next;
      await this.verified(`${this.root}/.longdoc/history/${id}.${Date.now()}.${crypto.randomUUID()}.md`, current);
      if (await this.io.read(path) !== base) throw new ConflictError(await this.io.read(path));
      await this.atomic(path, next); return next;
    };
    // Web Locks serialize plugin windows sharing this origin. External editors still
    // need version comparisons; ordinary filesystem IO is not a cross-process CAS.
    return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(`workbench:material:${path}`, execute) : execute();
  }
  async catalog(): Promise<MaterialRecord[]> {
    await this.init(); const records: MaterialRecord[] = [];
    for (const path of await this.io.list(`${this.root}/.longdoc`)) {
      const name = path.replace(/\\/g, "/").split("/").at(-1) ?? "", id = name.replace(/\.json$/, "");
      if (name.endsWith(".json") && docIdPattern.test(id)) records.push(await this.record(id));
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async search(query: string, graph: string): Promise<Array<MaterialRecord & {snippet: string}>> {
    const needle = query.toLocaleLowerCase(), result: Array<MaterialRecord & {snippet: string}> = [];
    for (const record of await this.catalog()) {
      if (record.graph && record.graph !== graph) continue;
      try {
        const body = await this.read(record.id), index = body.toLocaleLowerCase().indexOf(needle);
        if (!needle || index >= 0 || record.title.toLocaleLowerCase().includes(needle)) result.push({ ...record, snippet: body.slice(Math.max(0, index - 35), Math.max(0, index) + 100) });
      } catch (error) { if (!needle) result.push({ ...record, snippet: `文件暂不可用：${error instanceof Error ? error.message : String(error)}` }); }
    }
    return result;
  }
}
