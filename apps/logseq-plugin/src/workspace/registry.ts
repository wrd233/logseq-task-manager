import type { FileIO } from "../host/file-io.ts";
import type { MaterialDirectories, KeyStorage } from "./material-context.ts";
import { identifier, scopeOf, type SourceScope } from "./source-protocol.ts";
import { directoryOf, entryText, guard, managedRoot, manifestOf, optionalRead, replaceVerified, sameScope, uuidOf, type Association, type WorkspaceManifest } from "./workspace-record.ts";

export interface WorkspaceBinding {manifest: WorkspaceManifest; directory: string; materialGraph: string; entryPath: string}
export interface BindRequest {scope: SourceScope; directory: string; organization?: "flat" | "project"; create?: boolean; rebind?: boolean}
/** Manifest owns identity. MaterialDirectories is the single directory lookup/projection. */
export class WorkspaceRegistry {
  constructor(readonly io: FileIO, readonly directories: MaterialDirectories, private readonly storage: KeyStorage) {}
  private key(scope: SourceScope): string { return `workbench:workspace:${JSON.stringify([scope.graphId, scope.rootUuid])}`; }
  hint(scope: SourceScope): {workspaceId: string; materialGraph: string} | null {
    const raw = this.storage.getItem(this.key(scope)); if (!raw) return null;
    const data = JSON.parse(raw); return {workspaceId: uuidOf(data.workspaceId), materialGraph: identifier(data.materialGraph)};
  }
  async manifest(directory: string): Promise<WorkspaceManifest | null> {
    const text = await optionalRead(this.io, `${managedRoot(directory)}/manifest.json`, 256_000);
    return text === null ? null : manifestOf(JSON.parse(text));
  }
  async resolve(input: SourceScope, materialGraph?: string): Promise<WorkspaceBinding | null> {
    const scope = scopeOf(input), hint = this.hint(scope), graph = hint?.materialGraph ?? materialGraph;
    if (!graph) return null;
    const binding = this.directories.binding(graph, scope.rootUuid); if (!binding?.directory) return null;
    const directory = directoryOf(binding.directory, graph), manifest = await this.manifest(directory);
    if (!manifest) return null; // Existing materials bindings remain usable until explicit adoption.
    if (!sameScope(manifest.primarySource, scope) || (hint && manifest.workspaceId !== hint.workspaceId)) throw new Error("工作目录的身份或 Graph 入口不吻合，请核对后重新关联。");
    if (binding.organization !== manifest.organization) throw new Error("工作目录组织约定不吻合，请明确重新关联。");
    return {manifest, directory, materialGraph: graph, entryPath: `${directory}/${manifest.entryFile}`};
  }
  async bind(input: BindRequest, materialGraph: string, persistRoot: () => Promise<void>, valid: () => boolean): Promise<WorkspaceBinding> {
    const scope = scopeOf(input.scope), directory = directoryOf(input.directory, materialGraph), hint = this.hint(scope);
    if (input.organization !== undefined && !["flat", "project"].includes(input.organization)) throw new Error("WORKSPACE_INVALID_ORGANIZATION");
    const old = this.directories.binding(materialGraph, scope.rootUuid);
    if (old?.directory && old.directory !== directory && input.rebind !== true) throw new Error("该工作已有目录，请使用重新关联。");
    if (input.create === true) {
      try { if (!this.io.stat) throw new Error("创建目录需要文件状态能力。"); await this.io.stat(directory); }
      catch (error) { if (!(error instanceof Error) || !/ENOENT|文件不存在/u.test(error.message)) throw error; guard(valid); await this.io.mkdir(directory); }
    }
    guard(valid);
    if (this.io.stat && (await this.io.stat(directory)).type !== "directory") throw new Error("请选择已有工作目录，或明确新建目录。");
    await this.io.list(directory); guard(valid);
    let manifest = await this.manifest(directory); guard(valid);
    if (manifest && (!sameScope(manifest.primarySource, scope) || (hint && hint.workspaceId !== manifest.workspaceId))) throw new Error("目录已有另一份工作记录，不能替换其身份或入口。");
    if (!manifest) {
      // A managed-looking directory without its manifest may be a interrupted/user-owned area.
      const entries = await this.io.list(directory); guard(valid);
      if (entries.some(p => p.replace(/\/+$/u, "").split("/").at(-1) === ".task-workspace")) throw new Error("目录中已有缺少 manifest 的工作记录，请保留并核对，不能覆盖。");
      const workspaceId = hint?.workspaceId ?? crypto.randomUUID();
      let entryFile = "WORKSPACE.md";
      if (await optionalRead(this.io, `${directory}/${entryFile}`) !== null) entryFile = "WORKSPACE.task-copilot.md";
      if (await optionalRead(this.io, `${directory}/${entryFile}`) !== null) entryFile = `WORKSPACE.${workspaceId}.md`;
      if (await optionalRead(this.io, `${directory}/${entryFile}`) !== null) throw new Error("工作读取入口已存在，不能覆盖用户文件。");
      const previous = old?.directory && old.directory !== directory ? await this.manifest(old.directory) : null;
      if (previous && (!sameScope(previous.primarySource, scope) || previous.workspaceId !== workspaceId)) throw new Error("旧绑定身份不吻合，请核对原目录。");
      manifest = {schemaVersion: 1, workspaceId, primarySource: scope, organization: input.organization ?? old?.organization ?? "flat", entryFile, associations: previous?.associations ?? [], updatedAt: new Date().toISOString()};
    } else if (input.organization && input.organization !== manifest.organization) manifest = {...manifest, organization: input.organization, updatedAt: new Date().toISOString()};
    await persistRoot(); guard(valid);
    const root = managedRoot(directory); await this.io.mkdir(root); guard(valid);
    const entryPath = `${directory}/${manifest.entryFile}`, existing = await optionalRead(this.io, entryPath); guard(valid);
    if (existing !== null && !existing.startsWith(`<!-- task-copilot-workspace:${manifest.workspaceId} -->\n`)) throw new Error("工作读取入口已被用户修改，请保留文件并核对。");
    // Identity is saved first. A failed later step is explicitly retryable from this manifest.
    await replaceVerified(this.io, `${root}/manifest.json`, JSON.stringify(manifest), valid);
    await replaceVerified(this.io, entryPath, entryText(manifest), valid); guard(valid);
    this.directories.register(materialGraph, directory);
    this.directories.bind({graph: materialGraph, sourceUuid: scope.rootUuid, directory, organization: manifest.organization});
    this.storage.setItem(this.key(scope), JSON.stringify({workspaceId: manifest.workspaceId, materialGraph}));
    return {manifest, directory, materialGraph, entryPath};
  }
  unbind(scope: SourceScope, materialGraph: string): void {
    this.directories.bind({graph: materialGraph, sourceUuid: scope.rootUuid, directory: null, organization: "flat"});
    // Keep the identity hint and portable record so a later explicit rebind can recover it.
  }
  async associate(binding: WorkspaceBinding, association: Association, valid: () => boolean): Promise<WorkspaceBinding> {
    if (binding.manifest.associations.some(a => JSON.stringify(a) === JSON.stringify(association))) return binding;
    if (binding.manifest.associations.length >= 64) throw new Error("WORKSPACE_TOO_MANY_ASSOCIATIONS");
    const manifest = {...binding.manifest, associations: [...binding.manifest.associations, association], updatedAt: new Date().toISOString()};
    await replaceVerified(this.io, `${managedRoot(binding.directory)}/manifest.json`, JSON.stringify(manifest), valid);
    return {...binding, manifest};
  }
}
