import { materialAssociations, type MaterialWorkContext } from "../../workspace/material-context.ts";
import type { FileIO } from "../../host/file-io.ts";
import type { MaterialResult, MaterialService } from "./service.ts";
import { MaterialStore, markdownFile, normalizeRoot, versionOf, docIdPattern } from "./store.ts";
import { extension, fileName } from "./names.ts";
import {MaterialDirectoryBrowser} from "./directory.ts";

export interface MaterialImport { name: string; path?: string; bytes?: ArrayBuffer }
export interface FolderImportFile { relative: string; bytes: ArrayBuffer | (() => Promise<ArrayBuffer>) }
interface ImportJournal {
  schemaVersion: 1; id: string; fingerprint: string; sourcePath: string | null;
  target: string; temporary: string; size: number; text: string | null;
  phase: "planned" | "copied" | "ready"; identity: string | null;
}

/** Browser directory handles supply bytes when Electron does not expose an original OS path. */
export async function importMaterialFolderBytes(service: MaterialService, name: string, files: FolderImportFile[], context: MaterialWorkContext, requestKey: string): Promise<{materials: MaterialResult[]; problems: string[]}> {
  if (!requestKey || context.graph !== service.graph) throw new Error("文件夹导入范围无效。");
  if (files.length > 1000) throw new Error("文件夹超过 1000 项，请分批拖入。");
  const token = await versionOf(JSON.stringify([service.graph, requestKey])), known = service.directories.hint(service.graph, `folder-import:${token}`);
  const store = known ? new MaterialStore(service.io, normalizeRoot(known, service.graph)) : await service.destination(context, "reference");
  await service.io.mkdir(`${store.root}/.longdoc/imports`);
  const journalPath = `${store.root}/.longdoc/imports/folder-${token}.json`;
  let target: string;
  if (await exists(service.io, journalPath)) {
    const journal = JSON.parse(await service.io.read(journalPath));
    if (journal.name !== name || journal.owner !== (context.ownerUuid ?? context.sourceUuid)) throw new Error("文件夹导入范围已变化。");
    target = normalizeRoot(journal.target, service.graph);
    if (!target.startsWith(`${store.root}/`)) throw new Error("导入目录记录的目标无效。");
  } else {
    target = await availableName(store, checkedName(name), token);
    await writeJournal(store, journalPath, {name, target, owner: context.ownerUuid ?? context.sourceUuid});
    service.directories.remember(service.graph, `folder-import:${token}`, store.root);
  }
  await service.io.mkdir(target);
  const materials: MaterialResult[] = [], problems: string[] = [];
  for (const input of files) {
    try {
      const parts = input.relative.split("/").map(checkedName);
      if (parts.length > 24) throw new Error("文件层级过深。");
      const filename = parts.pop()!, directory = [target, ...parts].join("/");
      await service.io.mkdir(directory);
      materials.push(await service.importFile({name: filename, bytes: typeof input.bytes === "function" ? await input.bytes() : input.bytes}, {...context, directory, organization: "flat"}, `${requestKey}:${input.relative}`));
    } catch (error) { problems.push(`${input.relative}：${String(error)}`); }
  }
  return {materials, problems};
}
const active = new Map<string, Promise<MaterialResult>>();
const missing = (error: unknown) => /ENOENT|文件不存在|file not existed/u.test(String(error));
async function exists(io: FileIO, path: string): Promise<boolean> {
  if (!io.stat) throw new Error("导入文件需要桌面文件状态能力。");
  try { await io.stat(path); return true; } catch (error) { if (missing(error)) return false; throw error; }
}
async function writeJournal(store: MaterialStore, path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value); await store.io.write(path, text);
  if (await store.io.read(path) !== text) throw new Error("导入记录未通过读回核验，文件仍保留。");
}
function checkedName(name: string): string {
  if (!name || name === "." || name === ".." || /[\\/]/u.test(name) || Array.from(name).some(char => char.charCodeAt(0) < 32)) throw new Error("文件名称不可用。");
  return name;
}
async function availableName(store: MaterialStore, name: string, token: string): Promise<string> {
  const names = new Set((await store.io.list(store.root)).map(path => fileName(path).toLocaleLowerCase()));
  let result = name, counter = 0; const ext = extension(name), stem = name.slice(0, name.length - ext.length);
  while (names.has(result.toLocaleLowerCase())) result = `${stem}-${token.slice(0, 8)}${counter++ ? `-${counter}` : ""}${ext}`;
  return `${store.root}/${result}`;
}

/** Copies and recovery share one operation journal, separate from authoritative material records. */
export async function importMaterial(service: MaterialService, input: MaterialImport, context: MaterialWorkContext, requestKey: string): Promise<MaterialResult> {
  if (!requestKey || context.graph !== service.graph) throw new Error("导入需要请求标识与当前 Graph 范围。");
  const token = await versionOf(JSON.stringify([service.graph, requestKey]));
  const key = `${service.graph}:${token}`, prior = active.get(key);
  const running = (prior ?? Promise.resolve()).catch(() => undefined).then(execute); active.set(key, running);
  try { return await running; } finally { if (active.get(key) === running) active.delete(key); }

  async function execute(): Promise<MaterialResult> {
    const io = service.io, name = checkedName(input.name);
    const source = input.path ? normalizeRoot(input.path, service.graph) : null;
    const stat = source ? await io.stat?.(source) : null;
    if (source && stat?.type !== "file") throw new Error("请选择普通文件。");
    if (!source && !input.bytes) throw new Error("拖入内容暂不可读，请重新拖入文件。");
    const size = stat?.size ?? input.bytes!.byteLength;
    const text = markdownFile(name) ? source ? await io.read(source) : new TextDecoder().decode(input.bytes) : null;
    const sourceIdentity = source ? await io.identity?.(source) ?? null : null;
    const byteVersion = input.bytes ? await crypto.subtle.digest("SHA-256", input.bytes).then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("")) : null;
    const scope = {graph: context.graph, sourceUuid: context.sourceUuid, ownerUuid: context.ownerUuid ?? context.sourceUuid};
    const fingerprint = await versionOf(JSON.stringify([source, sourceIdentity, name, size, text, byteVersion, scope]));
    // The exact operation hint freezes a retry's destination even after preferences change.
    const known = service.directories.hint(service.graph, `import:${token}`);
    const store = known ? new MaterialStore(io, normalizeRoot(known, service.graph)) : await service.destination(context, "reference");
    // A file already in the chosen directory is associated through its exact path.
    if (!known && source && (source.startsWith(`${store.root}/`) || new MaterialDirectoryBrowser(io, service.directories, service.graph, service.globalRoot).roots(context).some(root => source.startsWith(`${root}/`)))) return service.associateFile(source, context);
    await io.mkdir(`${store.root}/.longdoc/imports`);
    const journalPath = `${store.root}/.longdoc/imports/${token}.json`;
    let journal: ImportJournal;
    if (await exists(io, journalPath)) {
      journal = JSON.parse(await io.read(journalPath)) as ImportJournal;
      if (journal.schemaVersion !== 1 || journal.fingerprint !== fingerprint || !docIdPattern.test(journal.id) || !["planned", "copied", "ready"].includes(journal.phase) || journal.size !== size || journal.sourcePath !== source || journal.text !== text || !normalizeRoot(journal.target, service.graph).startsWith(`${store.root}/`) || journal.temporary !== `${journal.target}.${token.slice(0, 16)}.pending` || journal.identity !== null && typeof journal.identity !== "string") throw new Error("导入请求记录无效或来源、工作已变化，请核对已保留文件。");
    } else {
      const target = source?.startsWith(`${store.root}/`) ? source : await availableName(store, name, token);
      journal = {schemaVersion: 1, id: crypto.randomUUID(), fingerprint, sourcePath: source, target, temporary: `${target}.${token.slice(0, 16)}.pending`, size, text, phase: source === target ? "ready" : "planned", identity: source === target ? sourceIdentity : null};
      await writeJournal(store, journalPath, journal);
      service.directories.remember(service.graph, `import:${token}`, store.root);
    }
    const previous = (await store.catalog()).find(record => record.id === journal.id);
    if (previous) return {status: "success", material: await service.read(previous.id)};
    if (journal.phase === "planned") {
      // An interrupted copy has no verified ownership yet. Never replace or adopt it by hash.
      if (await exists(io, journal.temporary)) throw new Error(`上次复制结果未确认，文件已保留：${journal.temporary}`);
      if (source) {
        if (!io.copy) throw new Error("当前宿主没有文件复制能力。");
        await io.copy(source, journal.temporary);
      } else {
        if (!io.writeBytes) throw new Error("当前宿主没有文件导入能力。");
        await io.writeBytes(journal.temporary, input.bytes!);
      }
      await verify(journal.temporary, journal);
      journal.phase = "copied"; journal.identity = await io.identity?.(journal.temporary) ?? null;
      await writeJournal(store, journalPath, journal);
    }
    if (journal.phase === "copied") {
      if (await exists(io, journal.temporary)) {
        if (await exists(io, journal.target)) throw new Error("目标位置已有文件，已保留导入副本；请处理重名后重试。");
        await verify(journal.temporary, journal);
        await io.rename(journal.temporary, journal.target);
      } else if (!journal.identity || await io.identity?.(journal.target) !== journal.identity) throw new Error(`文件移动结果待核验，内容已保留：${journal.target}`);
      journal.phase = "ready"; await writeJournal(store, journalPath, journal);
    }
    await verify(journal.target, journal);
    if (journal.identity && await io.identity?.(journal.target) !== journal.identity) throw new Error("导入副本已被其他文件替换，请核对后重试。");
    const record = await store.reference(journal.target, {graph: service.graph, sourceUuid: context.sourceUuid ?? undefined, associations: materialAssociations(context), imported: {sourcePath: source, requestKey}}, journal.id);
    service.directories.register(service.graph, store.root); service.directories.remember(service.graph, record.id, store.root);
    return {status: "success", material: await service.read(record.id)};
  }
  async function verify(path: string, journal: ImportJournal): Promise<void> {
    const stat = await service.io.stat?.(path);
    if (stat?.type !== "file" || stat.size !== journal.size || journal.text !== null && await service.io.read(path) !== journal.text) throw new Error("文件复制未通过读回核验，已有内容仍保留。");
  }
}

/** Explicit folder drop preserves file structure and excludes known metadata folders. */
export async function importMaterialDirectory(service: MaterialService, path: string, context: MaterialWorkContext, requestKey: string): Promise<{materials: MaterialResult[]; problems: string[]}> {
  if (!requestKey || context.graph !== service.graph) throw new Error("文件夹导入范围无效。");
  path = normalizeRoot(path, service.graph);
  if ((await service.io.stat?.(path))?.type !== "directory") throw new Error("请选择普通目录。");
  const token = await versionOf(JSON.stringify([service.graph, requestKey])), known = service.directories.hint(service.graph, `directory-import:${token}`);
  const store = known ? new MaterialStore(service.io, normalizeRoot(known, service.graph)) : await service.destination(context, "reference");
  await service.io.mkdir(`${store.root}/.longdoc/imports`);
  const journalPath = `${store.root}/.longdoc/imports/directory-${token}.json`;
  let target: string;
  if (await exists(service.io, journalPath)) {
    const journal = JSON.parse(await service.io.read(journalPath));
    if (journal.source !== path || journal.owner !== (context.ownerUuid ?? context.sourceUuid)) throw new Error("目录导入范围已变化。");
    target = normalizeRoot(journal.target, service.graph);
    if (!target.startsWith(`${store.root}/`)) throw new Error("导入目录记录的目标无效。");
  } else {
    target = await availableName(store, checkedName(fileName(path)), token);
    await writeJournal(store, journalPath, {source: path, target, owner: context.ownerUuid ?? context.sourceUuid});
    service.directories.remember(service.graph, `directory-import:${token}`, store.root);
  }
  if (target === path || target.startsWith(`${path}/`)) throw new Error("不能将文件夹复制到自身内部。");
  const materials: MaterialResult[] = [], problems: string[] = [], visited = new Set<string>(); let count = 0;
  await walk(path, target, 0);
  return {materials, problems};
  async function walk(source: string, destination: string, depth: number): Promise<void> {
    if (depth > 24) throw new Error("文件夹层级过深，请分批拖入。");
    await service.io.mkdir(destination);
    for (const entry of await service.io.list(source)) {
      const child = entry.startsWith("/") ? entry : `${source}/${entry}`;
      if (!child.startsWith(`${source}/`) || visited.has(child)) continue;
      const relative = child.slice(source.length + 1), parts = relative.split("/").map(checkedName), name = parts.at(-1)!;
      if (parts.some(part => part.startsWith(".")) || name === "WORKSPACE.md" || name === "WORKSPACE.task-copilot.md") continue;
      if (parts.length + depth > 24) { problems.push(`${relative}：目录层级过深。`); continue; }
      visited.add(child);
      if (++count > 1000) throw new Error("文件夹超过 1000 项，请分批拖入；已加入内容保留。");
      try {
        const stat = await service.io.stat?.(child);
        if (stat?.type === "directory") await walk(child, `${destination}/${relative}`, depth + parts.length);
        else if (stat?.type === "file") {
          const directory = [destination, ...parts.slice(0, -1)].join("/"); await service.io.mkdir(directory);
          materials.push(await service.importFile({name, path: child}, {...context, directory, organization: "flat"}, `${requestKey}:${child.slice(path.length)}`));
        }
      } catch (error) { problems.push(`${name}：${String(error)}`); }
    }
  }
}
