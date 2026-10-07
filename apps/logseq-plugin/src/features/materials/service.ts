import type { FileIO } from "../../host/file-io.ts";
import { captureDirectory, materialAssociations, type MaterialDirectories, type MaterialWorkContext } from "../../workspace/material-context.ts";
import { MaterialStore, MaterialWriteError, ConflictError, associationsOf, editingOf, markdownFile, makeLink, normalizeRoot, versionOf, type MaterialRecord, type MaterialRole } from "./store.ts";
import { discoverExternalRename, renameMaterialFile, recoverMaterialRename, type RenameResult } from "./file-operations.ts";
import { importMaterial, importMaterialDirectory, importMaterialFolderBytes, type MaterialImport, type FolderImportFile } from "./imports.ts";
import {MaterialDirectoryBrowser} from "./directory.ts";
import {localAssetURL} from "../../host/local-bytes.ts";
import {fileName} from "./names.ts";

export interface MaterialView {
  id: string; title: string; summary?: string; kind: MaterialRecord["kind"]; role: MaterialRole | "legacy";
  path: string; recordRoot: string; sourceUuid: string | null;
  associations: ReturnType<typeof associationsOf>; reference: string;
  writeState: "ready" | "pending";
  availability: "available" | "unavailable"; content: string | null; version: string | null;
  capabilities: { read: "markdown" | "external"; edit: { user: boolean; agent: boolean }; open: true };
  problem?: string;
  origin: "capture" | "reference" | "import";
}
export interface CaptureRequest {
  requestKey: string; text: string; html?: string; title?: string; role?: MaterialRole; sourceUuid?: string;
}
export type MaterialResult = { status: "success" | "partial"; material: MaterialView; problem?: string } | { status: "conflict"; material: MaterialView; proposed: string; current: string };
export interface DirectoryFileResolution {
  status: "success" | "needs-verification";
  materialId: string; fileName: string; path: string; reference: string;
  associations: MaterialView["associations"]; availability: MaterialView["availability"];
  identity: "verified" | "unverified" | "changed"; problem?: string;
}
const associating = new Map<string, Promise<MaterialResult>>();

/** Human and Agent adapters share this service. DOM and Logseq writes stay at the edge. */
export class MaterialService {
  readonly listProblems: string[] = [];
  private readonly pending = new Map<string, Promise<MaterialRecord>>();
  private readonly observedRecords = new Map<string, Map<string, MaterialRecord>>();
  constructor(readonly io: FileIO, readonly directories: MaterialDirectories, readonly graph: string, readonly globalRoot: string | null, private readonly convert: (text: string, html: string) => string, private readonly canRename: (id: string) => boolean = () => true, private readonly prepareDefault?: () => Promise<string>) {
    if (globalRoot) directories.register(graph, globalRoot);
  }
  private stores(): MaterialStore[] { return this.directories.roots(this.graph).map(root => new MaterialStore(this.io, normalizeRoot(root, this.graph))); }
  async locate(id: string): Promise<{store: MaterialStore; record: MaterialRecord}> {
    const hint = this.directories.hint(this.graph, id);
    if (hint) {
      const store = new MaterialStore(this.io, normalizeRoot(hint, this.graph));
      // A known unavailable location is never silently replaced by another copy.
      return {store, record: await store.record(id)};
    }
    const matches: Array<{store: MaterialStore; record: MaterialRecord}> = [];
    const errors: string[] = [];
    for (const store of this.stores()) {
      const entries = await this.io.list(`${store.root}/.longdoc`).catch(error => { errors.push(String(error)); return []; });
      if (entries.some(path => path.split("/").at(-1) === `${id}.json`)) matches.push({store, record: await store.record(id)});
    }
    if (matches.length !== 1) throw new Error(matches.length > 1 ? "多个目录存在相同材料身份，请核对目录备份。" : `材料记录暂不可用。可登记原材料目录后重试。${errors.length ? "部分已知目录不可读。" : ""}`);
    const match = matches[0]!; this.directories.remember(this.graph, id, match.store.root); return match;
  }
  async read(id: string, includeContent = true): Promise<MaterialView> {
    const located = await this.locate(id), store = located.store;
    let record = located.record;
    try { if (this.canRename(id)) record = await discoverExternalRename(store, record); } catch { /* Preserve unavailable records; discovery must not block reading history. */ }
    const path = await store.path(id);
    const view: MaterialView = {id, title: record.title, kind: record.kind, origin: record.imported ? "import" : record.kind, role: record.role ?? "legacy", path, recordRoot: store.root, sourceUuid: record.sourceUuid ?? null, associations: associationsOf(record), reference: makeLink(record), writeState: record.creation === "pending" ? "pending" : "ready", availability: "available", content: null, version: null, capabilities: {read: markdownFile(path) ? "markdown" : "external", edit: record.creation === "pending" ? {user: false, agent: false} : editingOf(record), open: true}};
    if (record.summary) view.summary = record.summary;
    view.origin = record.imported ? "import" : record.kind;
    if (record.creation === "pending") view.problem = "收纳保存尚未完成，请重试原请求。";
    try {
      if (markdownFile(path) && includeContent) { view.content = await store.read(id); view.version = await versionOf(view.content); }
      else await store.checkFile(path);
    } catch (error) { view.availability = "unavailable"; view.problem = error instanceof Error ? error.message : String(error); }
    return view;
  }
  async destination(context: MaterialWorkContext, role: MaterialRole): Promise<MaterialStore> {
    const validated = {...context, directory: context.directory ? normalizeRoot(context.directory, this.graph) : null};
    if (context.graph !== this.graph) throw new Error("材料 Graph 范围已变化。");
    const owner = context.ownerUuid ?? context.sourceUuid;
    const folder = owner ? this.directories.defaultFolder(this.graph, owner) : null;
    if (!validated.directory && folder) { validated.directory = normalizeRoot(folder.directory, this.graph); validated.organization = folder.organization; }
    const fallback = !validated.directory && !this.globalRoot ? await this.prepareDefault?.() ?? null : this.globalRoot;
    if (!validated.directory && owner && fallback) {
      const directory = `${fallback}/workspaces/${encodeURIComponent(owner).replace(/\./g, "%2E")}`;
      await this.io.mkdir(directory);
      this.directories.addFolder(this.graph, owner, {directory, organization: "flat", automatic: true}, true);
      validated.directory = directory;
    }
    const root = await captureDirectory(this.io, validated, fallback, role);
    this.directories.register(this.graph, root);
    return new MaterialStore(this.io, root);
  }
  async capture(request: CaptureRequest, context: MaterialWorkContext, actor: "user" | "agent" = "user"): Promise<MaterialResult> {
    if (typeof request.requestKey !== "string" || !request.requestKey || typeof request.text !== "string" || (request.role !== undefined && !["reference", "input", "draft", "output"].includes(request.role))) throw new Error("收纳需要非空请求标识与文本。");
    if (context.graph !== this.graph) throw new Error("材料 Graph 范围已变化。");
    const role = request.role ?? (actor === "agent" ? "output" : "input");
    const payload = {text: request.text, html: request.html ?? "", title: request.title ?? "", role, source: context.sourceUuid};
    const fingerprint = await versionOf(JSON.stringify({...payload, graph: context.graph, owner: context.ownerUuid ?? context.sourceUuid}));
    const legacyFingerprint = await versionOf(JSON.stringify({...payload, directory: context.directory, organization: context.organization}));
    const key = request.requestKey;
    const execute = async () => {
      for (const store of this.stores()) {
        const records = await store.catalog();
        const existing = records.find(record => record.requestKey === key);
        if (existing) {
          if (existing.requestFingerprint !== fingerprint && existing.requestFingerprint !== legacyFingerprint) throw new Error("重复请求的内容或目标已变化，请使用新的请求标识。");
          this.directories.remember(this.graph, existing.id, store.root);
          return existing.creation === "pending" ? store.resumeCapture(existing) : existing;
        }
      }
      const store = await this.destination(context, role);
      const record = await store.create(this.convert(request.text, request.html ?? ""), {graph: this.graph, sourceUuid: context.sourceUuid ?? undefined, associations: materialAssociations(context), title: request.title, role, original: request.text, originalHTML: request.html, requestKey: key, requestFingerprint: fingerprint});
      this.directories.remember(this.graph, record.id, store.root); return record;
    };
    const active = this.pending.get(key);
    const running = (active ?? Promise.resolve()).catch(error => { if (!(error instanceof MaterialWriteError)) throw error; }).then(execute); this.pending.set(key, running);
    try { const record = await running; const material = await this.read(record.id); return {status: material.availability === "available" && material.writeState === "ready" ? "success" : "partial", material}; }
    catch (error) {
      if (!(error instanceof MaterialWriteError)) throw error;
      const material = await this.read(error.record.id); return {status: "partial", material, problem: error.message};
    }
    finally { if (this.pending.get(key) === running) this.pending.delete(key); }
  }
  importFile(input: MaterialImport, context: MaterialWorkContext, requestKey: string): Promise<MaterialResult> { return importMaterial(this, input, context, requestKey); }
  importDirectory(path: string, context: MaterialWorkContext, requestKey: string): Promise<{materials: MaterialResult[]; problems: string[]}> { return importMaterialDirectory(this, path, context, requestKey); }
  importFolderBytes(name: string, files: FolderImportFile[], context: MaterialWorkContext, requestKey: string): Promise<{materials: MaterialResult[]; problems: string[]}> { return importMaterialFolderBytes(this, name, files, context, requestKey); }
  /** Shared UI/Agent entry: CURRENT work roots, real file facts, existing UUID and
   * reference generator. Missing identity is explicit; a copied/replaced file is
   * never re-adopted by basename, bytes, size or mtime. No body or editing write. */
  async resolveDirectoryFile(path: string, context: MaterialWorkContext, signal?: AbortSignal): Promise<DirectoryFileResolution> {
    signal?.throwIfAborted(); localAssetURL(path);
    path = normalizeRoot(path, this.graph);
    const roots = new MaterialDirectoryBrowser(this.io, this.directories, this.graph, this.globalRoot).roots(context);
    if (!roots.some(root => path.startsWith(`${root}/`))) throw new Error("该文件不在当前工作的关联材料目录内。");
    if (!this.io.stat || (await this.io.stat(path)).type !== "file") throw new Error("目录文件暂不可核验，原关联与历史保留。");
    signal?.throwIfAborted();
    const result = await this.associateFile(path, context); signal?.throwIfAborted();
    const {record} = await this.locate(result.material.id), observed = await this.io.identity?.(path) ?? null;
    signal?.throwIfAborted();
    const identity = record.fileIdentity ? observed === record.fileIdentity ? "verified" : "changed" : "unverified";
    const problem = result.status === "partial" ? result.problem : identity === "changed" ? "同路径文件身份变化，原材料记录与历史保留。" : identity === "unverified" ? "此宿主不能确认物理文件身份；返回路径关联及现有引用，外部改名或同名替换需核验。" : undefined;
    return {status: identity === "verified" && result.status === "success" ? "success" : "needs-verification", materialId: result.material.id, fileName: fileName(path), path, reference: result.material.reference, associations: result.material.associations, availability: result.material.availability, identity, ...(problem ? {problem} : {})};
  }
  async associateFile(path: string, context: MaterialWorkContext): Promise<MaterialResult> {
    path = normalizeRoot(path, this.graph);
    const key = JSON.stringify([this.graph, path]), active = associating.get(key);
    if (active) {
      const result = await active;
      this.directories.register(this.graph, result.material.recordRoot); this.directories.remember(this.graph, result.material.id, result.material.recordRoot);
      return this.associateFileOnce(path, context);
    }
    const running = this.associateFileOnce(path, context); associating.set(key, running);
    try { return await running; } finally { if (associating.get(key) === running) associating.delete(key); }
  }
  private async associateFileOnce(path: string, context: MaterialWorkContext): Promise<MaterialResult> {
    if (context.graph !== this.graph) throw new Error("材料 Graph 范围已变化。");
    path = normalizeRoot(path, this.graph);
    const unreadable: string[] = [];
    for (const store of this.stores()) {
      let records: MaterialRecord[];
      try {records = await store.catalog();}
      catch {unreadable.push(store.root); continue;}
      for (let i = 0; i < records.length; i++) if (this.canRename(records[i]!.id)) records[i] = await discoverExternalRename(store, records[i]!).catch(() => records[i]!);
      const record = records.find(item => item.path === path);
      if (record) {
        const observed = await this.io.identity?.(path) ?? null;
        if (!record.fileIdentity || observed !== record.fileIdentity) return {status: "partial", material: await this.read(record.id, false), problem: record.fileIdentity ? "同路径文件身份变化或暂不可核验，原记录与关联保留。" : "物理文件身份暂不可核验，未自动添加新的工作关联。原记录与引用保留。"};
        return context.sourceUuid ? this.associate(record.id, context) : {status: "success", material: await this.read(record.id, false)};
      }
    }
    // A different unavailable root must not stop retries for a known live file.
    // When no existing record was found, its unreadable catalogue could hold an
    // external reference to this path: do not mint a substitute UUID.
    if (unreadable.length || [...this.observedRecords.values()].some(records => [...records.values()].some(record => record.path === path))) throw new Error("部分历史目录当前不可核验，暂不创建替代材料身份。原文件、关联与引用保留。");
    // Associations use the work root, never create a role directory for an existing file.
    const currentRoots = new MaterialDirectoryBrowser(this.io, this.directories, this.graph, this.globalRoot).roots(context);
    const root = currentRoots.filter(root => path.startsWith(`${root}/`)).sort((a, b) => b.length - a.length)[0]
      ?? (await this.destination({...context, organization: "flat"}, "reference")).root;
    this.directories.register(this.graph, root);
    const store = new MaterialStore(this.io, root), record = await store.reference(path, {graph: this.graph, sourceUuid: context.sourceUuid ?? undefined, associations: materialAssociations(context)});
    this.directories.remember(this.graph, record.id, root);
    return {status: "success", material: await this.read(record.id)};
  }
  /** Trusted local UI calls only. Never route caller-supplied actor/authorized flags here. */
  async renameLocal(id: string, name: string, requestId: string): Promise<RenameResult> {
    if (!this.canRename(id)) throw new Error("材料正在编辑或有未保存草稿，请完成编辑后改名。");
    const {store} = await this.locate(id); return renameMaterialFile(store, id, name, requestId);
  }
  async recoverRename(id: string): Promise<RenameResult> { const {store} = await this.locate(id); return recoverMaterialRename(store, id); }
  /** A local description affects recognition only, never file names, links or editing grants. */
  async describe(id: string, summary: string): Promise<void> {
    summary = summary.trim();
    if (summary.length > 160 || /[\r\n]/.test(summary)) throw new Error("概述请使用不超过 160 字的一句话。");
    const {store} = await this.locate(id);
    await store.update(id, record => { const next = {...record}; if (summary) next.summary = summary; else delete next.summary; return next; });
  }
  async associate(id: string, context: MaterialWorkContext): Promise<MaterialResult> {
    if (context.graph !== this.graph || !context.sourceUuid) throw new Error("请选择当前 Graph 的工作块。");
    const {store} = await this.locate(id);
    for (const association of materialAssociations(context)) await store.associate(id, association);
    return {status: "success", material: await this.read(id)};
  }
  async save(id: string, expectedVersion: string, expectedContent: string, next: string, actor: "user" | "agent"): Promise<MaterialResult> {
    if (!expectedVersion) throw new Error("保存需要基础版本。");
    const {store} = await this.locate(id);
    try { await store.save(id, expectedContent, next, actor, expectedVersion); return {status: "success", material: await this.read(id)}; }
    catch (error) { if (error instanceof ConflictError) return {status: "conflict", material: await this.read(id), proposed: next, current: error.current}; throw error; }
  }
  async list(query = "", sourceUuid: string | null = null): Promise<Array<MaterialRecord & {snippet: string}>> {
    this.listProblems.length = 0;
    const results: Array<MaterialRecord & {snippet: string}> = [];
    const seen = new Set<string>();
    for (const store of this.stores()) {
      const snapshot = this.observedRecords.get(store.root) ?? new Map<string, MaterialRecord>(); this.observedRecords.set(store.root, snapshot);
      let observed: MaterialRecord[] = [];
      try {observed = await store.catalog(); for (const record of observed) snapshot.set(record.id, structuredClone(record));}
      catch (error) {this.listProblems.push(`${store.root}: ${String(error)}`);}
      if ([...snapshot.keys()].some(id => !observed.some(record => record.id === id))) this.listProblems.push(`${store.root}: 部分历史材料记录当前不可核验，上次已知身份仍保留。`);
      for (const record of observed) {
        if (this.canRename(record.id)) await discoverExternalRename(store, record).catch(() => undefined);
      }
      const entries: Array<MaterialRecord & {snippet: string}> = await (query ? store.search(query, this.graph) : store.catalog().then(records => records.filter(record => !record.graph || record.graph === this.graph).map(record => ({...record, snippet: ""})))).catch(error => { this.listProblems.push(`${store.root}: ${String(error)}`); return []; });
      for (const record of entries) snapshot.set(record.id, structuredClone(record));
      for (const cached of snapshot.values()) if ((!cached.graph || cached.graph === this.graph) && !entries.some(record => record.id === cached.id) && (!query || `${cached.title} ${cached.summary ?? ""} ${cached.path ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) entries.push({...structuredClone(cached), snippet: "历史记录当前不可核验"});
      for (const record of entries) {
        if (seen.has(record.id)) throw new Error("多个已知目录包含同一材料身份，请核对备份目录。");
        seen.add(record.id);
        if (!this.directories.hint(this.graph, record.id)) this.directories.remember(this.graph, record.id, store.root);
        if (!sourceUuid || associationsOf(record).some(item => item.graph === this.graph && item.sourceUuid === sourceUuid)) results.push(record);
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** Explicit folder addition/refresh registers existing files without copying bodies. */
  async refreshFolder(directory: string, context: MaterialWorkContext): Promise<string[]> {
    const root = normalizeRoot(directory, this.graph), problems: string[] = [], visited = new Set<string>(); let count = 0;
    const visit = async (path: string, depth: number): Promise<void> => {
      if (depth > 24) { problems.push("目录层级过深，仅显示已读取文件。"); return; }
      for (const entry of await this.io.list(path)) {
        const child = entry.startsWith("/") ? entry : `${path}/${entry}`, name = child.split("/").at(-1)!;
        if (!child.startsWith(`${path}/`) || visited.has(child)) continue;
        const parts = child.slice(path.length + 1).split("/");
        if (parts.some(part => part.startsWith(".")) || /^WORKSPACE(?:\.|$)/u.test(name)) continue;
        visited.add(child);
        if (parts.length + depth > 24) { problems.push(`${name}：目录层级过深。`); continue; }
        if (++count > 1000) { problems.push("目录较大，仅显示前 1000 项。"); return; }
        try {
          const stat = await this.io.stat?.(child);
          if (stat?.type === "directory") await visit(child, depth + 1);
          else if (stat?.type === "file") await this.associateFile(child, {...context, directory: root, organization: "flat"});
        } catch (error) { problems.push(`${name}：${String(error)}`); }
      }
    };
    await visit(root, 0); return problems;
  }
}
