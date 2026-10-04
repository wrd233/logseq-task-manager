import type { FileIO } from "../../host/file-io.ts";
import { fileName, fileTitle, renamedPath } from "./names.ts";
import { markdownFile, versionOf, type MaterialRecord, type MaterialStore } from "./store.ts";

export type RenameFact = {requestId: string; from: string; to: string; identity: string | null; version: string | null; size: number | null; status: "prepared" | "file-renamed" | "complete" | "uncertain"; problem?: string};
export type RenameResult = {status: "success" | "partial"; record: MaterialRecord; problem?: string};
async function present(io: FileIO, path: string): Promise<boolean> {
  if (!io.stat) throw new Error("当前宿主无法核验文件改名。");
  try { const stat = await io.stat(path); if (stat.type !== "file") throw new Error("请选择普通文件。"); return true; }
  catch (error) { if (/ENOENT|file not existed/.test(String(error))) return false; throw error; }
}
async function verify(io: FileIO, fact: RenameFact, path: string): Promise<void> {
  if (!await present(io, path)) throw new Error("文件暂不可用。");
  if (fact.identity && await io.identity?.(path) !== fact.identity) throw new Error("文件身份已变化，请重新读取。");
  if (fact.version !== null && await versionOf(await io.read(path)) !== fact.version) throw new Error("文件正文已变化，请重新读取后改名。");
  if (fact.size !== null && (await io.stat!(path)).size !== fact.size) throw new Error("文件已变化，请重新读取。");
}
/** Independent record stores the intention before file IO. No multi-file atomicity is claimed. */
export async function renameMaterialFile(store: MaterialStore, id: string, name: string, requestId: string): Promise<RenameResult> {
  if (!requestId || requestId.length > 128) throw new Error("改名需要请求标识。");
  return store.fileOperation(id, async (record, path, put) => {
    const to = renamedPath(path, name), previous = record.rename;
    if (previous && ["prepared", "uncertain"].includes(previous.status)) throw new Error("前次文件改名尚未确认，请先核验并恢复。");
    if (previous?.requestId === requestId) {
      if (previous.to !== to) throw new Error("重复请求的名称已变化。");
      return {status: "success", record};
    }
    if (to === path) return {status: "success", record};
    await store.checkFile(path);
    const names = await store.io.list(path.slice(0, path.lastIndexOf("/")));
    if (names.some(entry => fileName(entry).toLocaleLowerCase() === fileName(to).toLocaleLowerCase() && fileName(entry) !== fileName(path))) throw new Error("同名文件已存在，请使用另一名称。");
    const fact: RenameFact = {requestId, from: path, to, identity: await store.io.identity?.(path) ?? null, version: markdownFile(path) ? await versionOf(await store.io.read(path)) : null, size: store.io.stat ? (await store.io.stat(path)).size : null, status: "prepared"};
    record = await put({...record, rename: fact}); // Failure here prevents any rename.
    try {
      await verify(store.io, fact, path);
      // Recheck immediately before dispatch, including case-only changes on case-sensitive volumes.
      const entries = await store.io.list(path.slice(0, path.lastIndexOf("/")));
      if (entries.some(entry => fileName(entry).toLocaleLowerCase() === fileName(to).toLocaleLowerCase() && fileName(entry) !== fileName(path))) throw new Error("同名文件已存在。");
      await store.io.rename(path, to);
      await verify(store.io, fact, to);
      record = await put({...record, path: to, title: fileTitle(to), fileIdentity: fact.identity, rename: {...fact, status: "file-renamed"}});
      return {status: "success", record};
    } catch (error) {
      const problem = `改名未全部确认：${String(error)}。请核验旧／新路径后继续恢复。`;
      try { record = await put({...record, rename: {...fact, status: "uncertain", problem}}); } catch { /* Prepared fact remains authoritative; never undo or replay IO. */ }
      return {status: "partial", record, problem};
    }
  });
}
export async function recoverMaterialRename(store: MaterialStore, id: string): Promise<RenameResult> {
  return store.fileOperation(id, async (record, _path, put) => {
    const fact = record.rename;
    if (!fact || fact.status === "complete" || fact.status === "file-renamed") return {status: "success", record};
    let old = await present(store.io, fact.from);
    const next = await present(store.io, fact.to);
    if (old && next && fileName(fact.from).toLocaleLowerCase() === fileName(fact.to).toLocaleLowerCase()) {
      const entries = await store.io.list(fact.from.slice(0, fact.from.lastIndexOf("/")));
      // Case-insensitive hosts can stat both spellings. Exact directory names
      // plus physical identity distinguish a completed case-only rename.
      if (!entries.some(entry => fileName(entry) === fileName(fact.from)) && entries.some(entry => fileName(entry) === fileName(fact.to))) old = false;
    }
    if (old && !next) { await verify(store.io, fact, fact.from); const restored = {...record}; delete restored.rename; return {status: "success", record: await put(restored)}; }
    // Without an observed stable system identity, a found same-content file is not proof.
    if (!old && next && fact.identity && await store.io.identity?.(fact.to) === fact.identity) {
      await verify(store.io, fact, fact.to);
      return {status: "success", record: await put({...record, path: fact.to, title: fileTitle(fact.to), fileIdentity: fact.identity, rename: {...fact, status: "file-renamed"}})};
    }
    return {status: "partial", record, problem: "改名结果无法自动确认。请明确重新定位到实际文件，材料身份与草稿仍保留。"};
  });
}

/** Search only the original parent, only with host identity; never hash/name matching. */
export async function discoverExternalRename(store: MaterialStore, record: MaterialRecord): Promise<MaterialRecord> {
  if (!record.fileIdentity || !record.path || !store.io.identity || record.rename && ["prepared", "uncertain"].includes(record.rename.status)) return record;
  const oldPresent = await present(store.io, record.path);
  const parent = record.path.slice(0, record.path.lastIndexOf("/")), matches: string[] = [];
  const entries = await store.io.list(parent);
  if (entries.length > 200) return record; // Incomplete evidence cannot claim uniqueness.
  if (oldPresent && entries.some(entry => fileName(entry) === fileName(record.path!))) return record;
  for (const entry of entries) {
    const path = entry.startsWith("/") ? entry : `${parent}/${entry}`;
    if (path.slice(0, path.lastIndexOf("/")) !== parent || fileName(path).startsWith(".")) continue;
    try { if (await present(store.io, path) && await store.io.identity(path) === record.fileIdentity) matches.push(path); } catch { return record; }
  }
  if (matches.length !== 1) return record;
  const path = matches[0]!;
  if (path.slice(path.lastIndexOf(".")).toLocaleLowerCase() !== record.path.slice(record.path.lastIndexOf(".")).toLocaleLowerCase()) return record;
  return store.update(record.id, current => {
    if (current.path !== record.path || current.fileIdentity !== record.fileIdentity) throw new Error("材料位置已变化。");
    return {...current, path, title: fileTitle(path)};
  });
}
