import { docIdPattern } from "./links.ts";
export { docIdPattern, idFrom } from "./links.ts";
import type { FileIO } from "../../host/file-io.ts";
import { fileTitle } from "./names.ts";
import type { RenameFact } from "./file-operations.ts";
import type { ReferenceFact } from "./references.ts";

export type MaterialRole = "reference" | "input" | "draft" | "output";
export interface MaterialAssociation { graph: string; sourceUuid: string }
export interface MaterialRecord {
  id: string;
  title: string;
  summary?: string;
  createdAt: string;
  kind: "capture" | "reference";
  path?: string;
  graph?: string;
  sourceUuid?: string;
  original: string;
  originalHTML?: string;
  recoveredFrom?: string;
  restoreMode?: "block";
  schemaVersion?: 2;
  role?: MaterialRole;
  editing?: { user: boolean; agent: boolean };
  associations?: MaterialAssociation[];
  requestKey?: string;
  requestFingerprint?: string;
  creation?: "pending" | "ready";
  pendingBody?: string;
  fileIdentity?: string | null;
  rename?: RenameFact;
  references?: ReferenceFact[];
}
export type CaptureMetadata = { [K in keyof Omit<MaterialRecord, "id" | "createdAt" | "kind" | "schemaVersion">]?: MaterialRecord[K] | undefined };
function cleanMetadata(metadata: CaptureMetadata): Partial<Omit<MaterialRecord, "id" | "createdAt" | "kind" | "schemaVersion">> {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}
const writes = new Map<string, Promise<unknown>>();
export const markdownFile = (path: string): boolean => /\.md$/i.test(path);
export function normalizeRoot(root: string, graph: string): string {
  const clean = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalized = clean(root), graphPath = clean(graph);
  if (!normalized.startsWith("/") || normalized.split("/").some(part => part === "." || part === "..") || normalized === "" || normalized === "/") throw new Error("请配置绝对文档目录，路径不能包含 . 或 ..。");
  if (graphPath && (normalized === graphPath || normalized.startsWith(`${graphPath}/`))) throw new Error("文档目录必须位于 Graph 外。");
  return normalized;
}
export function titleOf(text: string): string {
  return (text.split(/\r?\n/).find(line => line.trim()) ?? "未命名文档").replace(/^\s{0,3}#{1,6}\s+/, "").replace(/[[\]<>\r\n]/g, "").trim().slice(0, 64) || "未命名文档";
}
export function isLong(text: string, chars = 2000, lines = 30): boolean {
  return text.length >= Math.max(100, chars || 2000) || text.split(/\r?\n/).filter(line => line.trim()).length >= Math.max(5, lines || 30);
}
export function makeLink(record: Pick<MaterialRecord, "id" | "title">): string { return `[📄 ${record.title.replace(/[\r\n]/g, " ").replace(/[\\[\]]/g, "\\$&")}](longdoc://${record.id})`; }
export function restoreCapture(content: string, record: MaterialRecord): string {
  if (record.kind !== "capture") throw new Error("关联文件没有收纳原文。");
  const matches = [...content.matchAll(/\[[^\]\n]*\]\(longdoc:\/\/([0-9a-f-]{36})\)/gi)].filter(match => match[1]?.toLowerCase() === record.id.toLowerCase());
  if (matches.length !== 1) throw new Error("引用已变化或重复，原文未替换。");
  const match = matches[0]!;
  if (record.restoreMode === "block") {
    const remainder = (content.slice(0, match.index) + content.slice(match.index! + match[0].length)).split(/\r?\n/).filter(line => !/^\s*[\w-]+::/.test(line)).join("\n").trim();
    if (remainder) throw new Error("原块已添加其他内容，请先另存或手动恢复收纳原文。");
    const properties = (text: string) => text.split(/\r?\n/).filter(line => /^\s*[\w-]+::/.test(line) && !/^\s*id::/.test(line)).join("\n");
    if (properties(content) !== properties(record.original)) throw new Error("原块属性已变化，请手动恢复原文。");
    return /^\s*id::/m.test(record.original) || !record.sourceUuid ? record.original : `${record.original}\nid:: ${record.sourceUuid}`;
  }
  return content.slice(0, match.index) + record.original + content.slice(match.index! + match[0].length);
}
export function associationsOf(record: MaterialRecord): MaterialAssociation[] {
  const old = record.graph && record.sourceUuid ? [{ graph: record.graph, sourceUuid: record.sourceUuid }] : [];
  return record.associations ?? old;
}
export function editingOf(record: MaterialRecord): { user: boolean; agent: boolean } {
  // Legacy capture preserves its former user-edit behavior; never infer Agent authority.
  return record.editing ?? { user: record.kind === "capture", agent: false };
}
export async function versionOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export class ConflictError extends Error {
  constructor(readonly current: string) { super("外部文件已修改，当前草稿已保留。"); this.name = "ConflictError"; }
}
export class MaterialWriteError extends Error {
  constructor(readonly record: MaterialRecord, cause: unknown) { super(`材料未完成保存，原文与记录已保留：${String(cause)}`); }
}
export class MaterialStore {
  constructor(readonly io: FileIO, readonly root: string) {}
  /** Legacy UUID location only. New paths always come from the independent record. */
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
    await this.atomic(`${this.root}/.longdoc/${record.id}.json`, JSON.stringify(record)); return record;
  }
  private async lock<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`workbench:material:${key}`, action);
    const operation = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(action);
    writes.set(key, operation);
    try { return await operation; } finally { if (writes.get(key) === operation) writes.delete(key); }
  }
  async create(text: string, metadata: CaptureMetadata = {}): Promise<MaterialRecord> {
    await this.init();
    return this.lock(`${this.root}:create`, async () => {
      if (metadata.requestKey) {
        const existing = (await this.catalog()).find(record => record.requestKey === metadata.requestKey);
        if (existing) {
          if (existing.requestFingerprint !== metadata.requestFingerprint) throw new Error("重复请求的内容或目标已变化，请使用新的请求标识。");
          return existing.creation === "pending" ? this.resumeCapture(existing) : existing;
        }
      }
      const role = metadata.role ?? "input", digest = metadata.requestKey ? await versionOf(`${metadata.graph ?? ""}:${metadata.requestKey}`) : null;
      const id = digest ? `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}` : crypto.randomUUID();
      const record: MaterialRecord = { ...cleanMetadata(metadata), id, title: titleOf(metadata.title ?? text), kind: "capture", schemaVersion: 2, role, editing: metadata.editing ?? {user: role === "draft" || role === "output", agent: role === "output"}, createdAt: new Date().toISOString(), original: metadata.original ?? text };
      const name = Array.from(record.title, char => char.charCodeAt(0) < 32 || /[\\/:*?"|]/.test(char) ? "-" : char).join("").replace(/^[. ]+|[. ]+$/g, "").slice(0, 80) || "未命名文档";
      const names = new Set((await this.io.list(this.root)).map(path => path.split("/").at(-1)?.toLocaleLowerCase()));
      let filename = `${name}.md`, collision = 0;
      while (names.has(filename.toLocaleLowerCase())) filename = `${name}-${id.slice(0, 8)}${collision++ ? `-${collision}` : ""}.md`;
      record.path = `${this.root}/${filename}`;
      record.creation = "pending"; record.pendingBody = text;
      await this.put(record); return this.resumeCapture(record);
    });
  }
  async resumeCapture(record: MaterialRecord): Promise<MaterialRecord> {
    if (record.creation !== "pending" || typeof record.pendingBody !== "string" || !record.path) return record;
    try {
      let current: string | null = null;
      try {
        if (this.io.stat) await this.io.stat(record.path);
        current = await this.io.read(record.path);
      }
      catch (error) {
        const missing = error instanceof Error && /ENOENT|file not existed/.test(error.message);
        if (!missing) throw error;
      }
      if (current !== null && current !== record.pendingBody) throw new ConflictError(current);
      if (current === null) await this.verified(record.path, record.pendingBody);
      const ready = {...record, title: fileTitle(record.path), creation: "ready" as const}; delete ready.pendingBody;
      ready.fileIdentity = await this.io.identity?.(record.path) ?? null;
      return await this.put(ready);
    } catch (error) { throw new MaterialWriteError(record, error); }
  }
  async reference(path: string, metadata: CaptureMetadata = {}): Promise<MaterialRecord> {
    path = normalizeRoot(path, metadata.graph ?? "");
    const text = markdownFile(path) ? await this.io.read(path) : "";
    if (!markdownFile(path)) await this.checkFile(path);
    await this.init();
    const role = metadata.role ?? "reference";
    return this.put({ ...cleanMetadata(metadata), id: crypto.randomUUID(), title: metadata.title ? titleOf(metadata.title) : fileTitle(path), fileIdentity: await this.io.identity?.(path) ?? null, schemaVersion: 2, role, editing: metadata.editing ?? {user: false, agent: false}, kind: "reference", path, createdAt: new Date().toISOString(), original: text });
  }
  async checkFile(path: string): Promise<void> {
    if (this.io.stat) { const stat = await this.io.stat(path); if (stat.type !== "file") throw new Error("请选择普通文件。"); }
    else {
      const entries = await this.io.list(path.slice(0, path.lastIndexOf("/")));
      if (!entries.some(entry => entry === path || entry === path.split("/").at(-1))) throw new Error("文件暂不可用。");
    }
  }
  async record(id: string): Promise<MaterialRecord> {
    this.file(id);
    const record = JSON.parse(await this.io.read(`${this.root}/.longdoc/${id}.json`)) as MaterialRecord;
    if (record.id !== id || !["capture", "reference"].includes(record.kind) || typeof record.createdAt !== "string" || (record.creation !== undefined && !["pending", "ready"].includes(record.creation)) || (record.creation === "pending" && (typeof record.pendingBody !== "string" || typeof record.path !== "string")) || typeof record.title !== "string" || typeof record.original !== "string" || (record.schemaVersion !== undefined && record.schemaVersion !== 2) || (record.role !== undefined && !["reference", "input", "draft", "output"].includes(record.role)) || (record.editing !== undefined && (typeof record.editing.user !== "boolean" || typeof record.editing.agent !== "boolean")) || (record.associations !== undefined && (!Array.isArray(record.associations) || record.associations.some(item => typeof item.graph !== "string" || typeof item.sourceUuid !== "string")))) throw new Error("文档记录无效，停止读写。");
    if (record.summary !== undefined && (typeof record.summary !== "string" || record.summary.length > 160 || /[\r\n]/.test(record.summary))) throw new Error("材料概述记录无效。");
    if (record.fileIdentity !== undefined && record.fileIdentity !== null && typeof record.fileIdentity !== "string") throw new Error("文件身份记录无效。");
    if (record.rename && (typeof record.rename.requestId !== "string" || typeof record.rename.from !== "string" || typeof record.rename.to !== "string" || !["prepared", "file-renamed", "complete", "uncertain"].includes(record.rename.status) || record.rename.identity !== null && typeof record.rename.identity !== "string" || record.rename.version !== null && !/^[a-f0-9]{64}$/.test(record.rename.version))) throw new Error("改名记录无效。");
    if (record.rename) {
      const from = normalizeRoot(record.rename.from, record.graph ?? ""), to = normalizeRoot(record.rename.to, record.graph ?? "");
      if (from.slice(0, from.lastIndexOf("/")) !== to.slice(0, to.lastIndexOf("/")) || record.rename.size !== null && (!Number.isSafeInteger(record.rename.size) || record.rename.size < 0)) throw new Error("改名记录越界。");
    }
    if (record.references !== undefined && (!Array.isArray(record.references) || record.references.length > 1000 || record.references.some(ref => !ref || typeof ref.key !== "string" || typeof ref.scope?.graphId !== "string" || typeof ref.scope.rootUuid !== "string" || ref.target?.kind !== "logseq-block" || ref.target.graphId !== ref.scope.graphId || ref.sourceId !== JSON.stringify(["logseq", ref.scope.graphId, ref.target.blockUuid]) || !["follow-filename", "alias"].includes(ref.mode) || !["pending", "synced", "conflict", "unknown"].includes(ref.status) || typeof ref.text !== "string" || ref.sourceContent !== undefined && (typeof ref.sourceContent !== "string" || ref.sourceContent.length > 12000) || !Number.isSafeInteger(ref.start) || !Number.isSafeInteger(ref.end) || ref.start < 0 || ref.end - ref.start !== ref.text.length || !/^[a-f0-9]{64}$/.test(ref.contentVersion)))) throw new Error("引用关系记录无效。");
    return record;
  }
  async path(id: string): Promise<string> {
    const record = await this.record(id);
    return record.path ? normalizeRoot(record.path, record.graph ?? "") : record.kind === "capture" ? this.file(id) : Promise.reject(new Error("关联路径无效。"));
  }
  async read(id: string): Promise<string> {
    const path = await this.path(id); if (!markdownFile(path)) throw new Error("此格式仅支持外部打开。");
    return this.io.read(path);
  }
  async update(id: string, change: (record: MaterialRecord) => MaterialRecord): Promise<MaterialRecord> {
    return this.lock(`${this.root}:${id}:record`, async () => this.put(change(await this.record(id))));
  }
  async fileOperation<T>(id: string, action: (record: MaterialRecord, path: string, put: (record: MaterialRecord) => Promise<MaterialRecord>) => Promise<T>): Promise<T> {
    return this.lock(`${this.root}:${id}:record`, async () => {
      const path = await this.path(id), record = await this.record(id);
      return this.lock(path, () => action(record, path, next => this.put(next)));
    });
  }
  async associate(id: string, association: MaterialAssociation): Promise<MaterialRecord> {
    return this.update(id, record => ({ ...record, associations: [...associationsOf(record).filter(item => item.graph !== association.graph || item.sourceUuid !== association.sourceUuid), association] }));
  }
  async grantEditing(id: string, agent = false): Promise<MaterialRecord> {
    return this.update(id, record => ({ ...record, editing: { user: true, agent: agent || editingOf(record).agent } }));
  }
  async relocate(id: string, path: string): Promise<MaterialRecord> {
    const record = await this.record(id); path = normalizeRoot(path, record.graph ?? "");
    const old = await this.path(id);
    if (markdownFile(old) !== markdownFile(path)) throw new Error("重新定位必须保持原文件的读取能力。");
    if (markdownFile(path)) await this.io.read(path); else await this.checkFile(path);
    const identity = await this.io.identity?.(path) ?? null;
    return this.update(id, current => ({ ...current, path, title: fileTitle(path), fileIdentity: identity, ...(current.rename ? {rename: {...current.rename, status: "file-renamed" as const}} : {}) }));
  }
  async save(id: string, base: string, next: string, actor: "user" | "agent" = "user", expectedVersion?: string): Promise<string> {
    const path = await this.path(id);
    return this.lock(`${this.root}:${id}:record`, () => this.lock(path, async () => {
      const record = await this.record(id);
      if (record.creation === "pending" || record.rename && ["prepared", "uncertain"].includes(record.rename.status) || !markdownFile(path) || !editingOf(record)[actor]) throw new Error("此材料当前未授权编辑或文件改名尚待核验。");
      const current = await this.io.read(path);
      if (current !== base || (expectedVersion !== undefined && await versionOf(current) !== expectedVersion)) throw new ConflictError(current);
      if (current === next) return next;
      await this.verified(`${this.root}/.longdoc/history/${id}.${Date.now()}.${crypto.randomUUID()}.md`, current);
      if (await this.io.read(path) !== base || await this.path(id) !== path) throw new ConflictError(await this.io.read(path));
      await this.atomic(path, next);
      // Our verified replacement may have a new inode. Record that observed
      // identity now; never infer it later from an equal-content neighbour.
      await this.put({...record, fileIdentity: await this.io.identity?.(path) ?? null});
      return next;
    }));
  }
  async catalog(): Promise<MaterialRecord[]> {
    const records: MaterialRecord[] = [];
    for (const path of await this.io.list(`${this.root}/.longdoc`).catch(error => { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []; throw error; })) {
      const name = path.replace(/\\/g, "/").split("/").at(-1) ?? "", id = name.replace(/\.json$/, "");
      if (name.endsWith(".json") && docIdPattern.test(id)) records.push(await this.record(id));
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async search(query: string, graph: string): Promise<Array<MaterialRecord & {snippet: string}>> {
    const needle = query.toLocaleLowerCase(), result: Array<MaterialRecord & {snippet: string}> = [];
    for (const record of await this.catalog()) {
      if (record.graph && record.graph !== graph && !associationsOf(record).some(item => item.graph === graph)) continue;
      const matchesName = `${record.title}\n${record.summary ?? ""}`.toLocaleLowerCase().includes(needle);
      try {
        const path = await this.path(record.id), body = markdownFile(path) ? await this.read(record.id) : "仅支持外部打开", index = body.toLocaleLowerCase().indexOf(needle);
        if (!needle || index >= 0 || matchesName) result.push({ ...record, snippet: body.slice(Math.max(0, index - 35), Math.max(0, index) + 100) });
      } catch (error) { if (!needle || matchesName) result.push({ ...record, snippet: `文件暂不可用：${error instanceof Error ? error.message : String(error)}` }); }
    }
    return result;
  }
}
