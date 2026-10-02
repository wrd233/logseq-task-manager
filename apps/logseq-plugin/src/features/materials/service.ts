import type { FileIO } from "../../host/file-io.ts";
import { captureDirectory, type MaterialDirectories, type MaterialWorkContext } from "../../workspace/material-context.ts";
import { MaterialStore, MaterialWriteError, ConflictError, associationsOf, editingOf, markdownFile, makeLink, normalizeRoot, versionOf, type MaterialRecord, type MaterialRole } from "./store.ts";

export interface MaterialView {
  id: string; title: string; kind: MaterialRecord["kind"]; role: MaterialRole | "legacy";
  path: string; recordRoot: string; sourceUuid: string | null;
  associations: ReturnType<typeof associationsOf>; reference: string;
  writeState: "ready" | "pending";
  availability: "available" | "unavailable"; content: string | null; version: string | null;
  capabilities: { read: "markdown" | "external"; edit: { user: boolean; agent: boolean }; open: true };
  problem?: string;
}
export interface CaptureRequest {
  requestKey: string; text: string; html?: string; title?: string; role?: MaterialRole; sourceUuid?: string;
}
export type MaterialResult = { status: "success" | "partial"; material: MaterialView; problem?: string } | { status: "conflict"; material: MaterialView; proposed: string; current: string };

/** Human and Agent adapters share this service. DOM and Logseq writes stay at the edge. */
export class MaterialService {
  readonly listProblems: string[] = [];
  private readonly pending = new Map<string, Promise<MaterialRecord>>();
  constructor(readonly io: FileIO, readonly directories: MaterialDirectories, readonly graph: string, readonly globalRoot: string | null, private readonly convert: (text: string, html: string) => string) {
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
  async read(id: string): Promise<MaterialView> {
    const {store, record} = await this.locate(id), path = await store.path(id);
    const view: MaterialView = {id, title: record.title, kind: record.kind, role: record.role ?? "legacy", path, recordRoot: store.root, sourceUuid: record.sourceUuid ?? null, associations: associationsOf(record), reference: makeLink(record), writeState: record.creation === "pending" ? "pending" : "ready", availability: "available", content: null, version: null, capabilities: {read: markdownFile(path) ? "markdown" : "external", edit: record.creation === "pending" ? {user: false, agent: false} : editingOf(record), open: true}};
    if (record.creation === "pending") view.problem = "收纳保存尚未完成，请重试原请求。";
    try {
      if (markdownFile(path)) { view.content = await store.read(id); view.version = await versionOf(view.content); }
      else await store.checkFile(path);
    } catch (error) { view.availability = "unavailable"; view.problem = error instanceof Error ? error.message : String(error); }
    return view;
  }
  async destination(context: MaterialWorkContext, role: MaterialRole): Promise<MaterialStore> {
    const validated = {...context, directory: context.directory ? normalizeRoot(context.directory, this.graph) : null};
    if (context.graph !== this.graph) throw new Error("材料 Graph 范围已变化。");
    const root = await captureDirectory(this.io, validated, this.globalRoot, role);
    this.directories.register(this.graph, root);
    return new MaterialStore(this.io, root);
  }
  async capture(request: CaptureRequest, context: MaterialWorkContext, actor: "user" | "agent" = "user"): Promise<MaterialResult> {
    if (typeof request.requestKey !== "string" || !request.requestKey || typeof request.text !== "string" || (request.role !== undefined && !["reference", "input", "draft", "output"].includes(request.role))) throw new Error("收纳需要非空请求标识与文本。");
    const role = request.role ?? (actor === "agent" ? "output" : "input");
    const fingerprint = await versionOf(JSON.stringify({text: request.text, html: request.html ?? "", title: request.title ?? "", role, source: context.sourceUuid, directory: context.directory, organization: context.organization}));
    const key = request.requestKey;
    const execute = async () => {
      for (const store of this.stores()) {
        const records = await store.catalog();
        const existing = records.find(record => record.requestKey === key);
        if (existing) {
          if (existing.requestFingerprint !== fingerprint) throw new Error("重复请求的内容或目标已变化，请使用新的请求标识。");
          this.directories.remember(this.graph, existing.id, store.root);
          return existing.creation === "pending" ? store.resumeCapture(existing) : existing;
        }
      }
      const store = await this.destination(context, role);
      const record = await store.create(this.convert(request.text, request.html ?? ""), {graph: this.graph, sourceUuid: context.sourceUuid ?? undefined, associations: context.sourceUuid ? [{graph: this.graph, sourceUuid: context.sourceUuid}] : [], title: request.title, role, original: request.text, originalHTML: request.html, requestKey: key, requestFingerprint: fingerprint});
      this.directories.remember(this.graph, record.id, store.root); return record;
    };
    const active = this.pending.get(key);
    if (active) await active.catch(error => { if (!(error instanceof MaterialWriteError)) throw error; });
    const running = execute(); this.pending.set(key, running);
    try { const record = await running; const material = await this.read(record.id); return {status: material.availability === "available" && material.writeState === "ready" ? "success" : "partial", material}; }
    catch (error) {
      if (!(error instanceof MaterialWriteError)) throw error;
      const material = await this.read(error.record.id); return {status: "partial", material, problem: error.message};
    }
    finally { if (this.pending.get(key) === running) this.pending.delete(key); }
  }
  async associateFile(path: string, context: MaterialWorkContext): Promise<MaterialResult> {
    if (context.graph !== this.graph) throw new Error("材料 Graph 范围已变化。");
    path = normalizeRoot(path, this.graph);
    for (const store of this.stores()) {
      const record = (await store.catalog()).find(item => item.path === path);
      if (record) return this.associate(record.id, context);
    }
    // Associations use the work root, never create a role directory for an existing file.
    const root = context.directory ? normalizeRoot(context.directory, this.graph) : this.globalRoot;
    if (!root) throw new Error("请先绑定工作目录或配置全局材料目录。");
    if (context.directory) await captureDirectory(this.io, {...context, organization: "flat"}, root, "reference");
    this.directories.register(this.graph, root);
    const store = new MaterialStore(this.io, root), record = await store.reference(path, {graph: this.graph, sourceUuid: context.sourceUuid ?? undefined, associations: context.sourceUuid ? [{graph: this.graph, sourceUuid: context.sourceUuid}] : []});
    this.directories.remember(this.graph, record.id, root);
    return {status: "success", material: await this.read(record.id)};
  }
  async associate(id: string, context: MaterialWorkContext): Promise<MaterialResult> {
    if (context.graph !== this.graph || !context.sourceUuid) throw new Error("请选择当前 Graph 的工作块。");
    const {store} = await this.locate(id); await store.associate(id, {graph: this.graph, sourceUuid: context.sourceUuid});
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
      const entries = await store.search(query, this.graph).catch(error => { this.listProblems.push(`${store.root}: ${String(error)}`); return []; });
      for (const record of entries) {
        if (seen.has(record.id)) throw new Error("多个已知目录包含同一材料身份，请核对备份目录。");
        seen.add(record.id);
        if (!this.directories.hint(this.graph, record.id)) this.directories.remember(this.graph, record.id, store.root);
        if (!sourceUuid || associationsOf(record).some(item => item.graph === this.graph && item.sourceUuid === sourceUuid)) results.push(record);
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
