import type { FileIO } from "../host/file-io.ts";
import { identifier, object, scopeOf, type SourceScope } from "./source-protocol.ts";
import { ScopeExpired } from "./source-reader.ts";

export type Association =
  | {kind: "logseq-block"; graphId: string; blockUuid: string}
  | {kind: "logseq-page"; graphId: string; pageUuid: string; pageName: string}
  | {kind: "material"; id: string};
export interface WorkspaceManifest {
  schemaVersion: 1; workspaceId: string; primarySource: SourceScope; organization: "flat" | "project";
  entryFile: string; associations: Association[]; updatedAt: string;
}
export function uuidOf(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) throw new Error("WORKSPACE_INVALID_UUID");
  return value;
}
export function associationOf(value: unknown): Association {
  const a = object(value);
  if (a.kind === "logseq-block") return {kind: a.kind, graphId: identifier(a.graphId), blockUuid: identifier(a.blockUuid)};
  if (a.kind === "logseq-page") return {kind: a.kind, graphId: identifier(a.graphId), pageUuid: identifier(a.pageUuid), pageName: identifier(a.pageName)};
  if (a.kind === "material") return {kind: a.kind, id: uuidOf(a.id)};
  throw new Error("WORKSPACE_INVALID_ASSOCIATION");
}
export function manifestOf(value: unknown): WorkspaceManifest {
  const m = object(value);
  if (m.schemaVersion !== 1 || (m.organization !== "flat" && m.organization !== "project") || !Array.isArray(m.associations) || m.associations.length > 64 || typeof m.entryFile !== "string" || !/^WORKSPACE(?:\.[a-z0-9-]+)?\.md$/u.test(m.entryFile) || typeof m.updatedAt !== "string" || !Number.isFinite(Date.parse(m.updatedAt))) throw new Error("WORKSPACE_INVALID_MANIFEST");
  return {schemaVersion: 1, workspaceId: uuidOf(m.workspaceId), primarySource: scopeOf(m.primarySource), organization: m.organization as "flat" | "project", entryFile: m.entryFile, associations: m.associations.map(associationOf), updatedAt: m.updatedAt};
}
export const sameScope = (a: SourceScope, b: SourceScope): boolean => a.graphId === b.graphId && a.rootUuid === b.rootUuid;
export function directoryOf(value: unknown, graphPath: string): string {
  const path = identifier(value).replace(/\\/g, "/").replace(/\/+$/, "");
  const graph = graphPath.replace(/\\/g, "/").replace(/\/+$/, "");
  if ((!path.startsWith("/") && !/^[A-Za-z]:\//u.test(path)) || path === "/" || /^[A-Za-z]:$/u.test(path) || path.split("/").some(p => p === "." || p === "..") || (graph && (path === graph || path.startsWith(`${graph}/`)))) throw new Error("请选择 Graph 外的绝对工作目录，路径不能包含 . 或 ..。");
  return path;
}
export const managedRoot = (directory: string): string => `${directory}/.task-workspace`;
export async function optionalRead(io: FileIO, path: string, limit = 16_000_000): Promise<string | null> {
  try {
    if (io.stat && (await io.stat(path)).size > limit) throw new Error("WORKSPACE_FILE_TOO_LARGE");
    const text = await io.read(path);
    if (text.length > limit) throw new Error("WORKSPACE_FILE_TOO_LARGE");
    return text;
  } catch (error) {
    if (error instanceof Error && /ENOENT|file not existed|文件不存在/u.test(error.message)) return null;
    // Desktop 0.10.9 cannot stat a file whose immediate parent does not yet
    // exist ({} + null listing). Confirm that parent is absent, not unreadable.
    if (io.stat) {
      try { await io.stat(path.slice(0, path.lastIndexOf("/"))); }
      catch (parentError) { if (parentError instanceof Error && /ENOENT|文件不存在/u.test(parentError.message)) return null; }
    }
    throw error;
  }
}
export function guard(valid: () => boolean): void { if (!valid()) throw new ScopeExpired(); }
export async function verifiedWrite(io: FileIO, path: string, text: string, valid: () => boolean): Promise<void> {
  guard(valid); await io.write(path, text); guard(valid);
  if (await io.read(path) !== text) throw new Error("WORKSPACE_READBACK_MISMATCH"); guard(valid);
}
export async function replaceVerified(io: FileIO, path: string, text: string, valid: () => boolean): Promise<void> {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await verifiedWrite(io, temp, text, valid); guard(valid); await io.rename(temp, path); guard(valid);
  if (await io.read(path) !== text) throw new Error("WORKSPACE_READBACK_MISMATCH"); guard(valid);
}
export function entryText(manifest: WorkspaceManifest): string {
  const scope = manifest.primarySource;
  const link = `logseq://graph/${encodeURIComponent(scope.graphId.split(":")[0] ?? "")}?block-id=${encodeURIComponent(scope.rootUuid)}`;
  return `<!-- task-copilot-workspace:${manifest.workspaceId} -->\n# 工作原文读取入口\n\n工作身份：${manifest.workspaceId}。回到 [Logseq 工作块](${link})。\n\n正文以 Logseq 为准；这里是单向读取副本，修改副本不会写回。材料正文仍在原文件，长文本收纳和编辑使用工作台的材料入口。局部 TODO、批注不代表执行授权。\n\n在 Logseq 该工作块的右键菜单选择「工作台：刷新工作记录」可显式刷新。插件运行时只机械更新已关联来源，无需 agent 或 Kernel 在线。Logseq 关闭时刷新暂停。\n\n先读 [.task-workspace/status.json](.task-workspace/status.json) 的最近尝试和可用性，再读 [.task-workspace/current.json](.task-workspace/current.json)。指针中的 revision 指向 versions/<revision>/；其中 original.md 是按源顺序的完整原文，source.json 带定位、版本与时间，version.json 校验同一次发布。若当前指针损坏，可检查 last-good.json 的上一份已验证副本。未刷新、来源不可用或目录失联时，旧副本只能按记录时间使用。\n\n工作目录整体搬迁后，在 Logseq 明确「重新关联工作目录」，保留隐藏目录以恢复身份。解绑停止更新并保留文件。当前仅有本地插件 workspace API；外部 session 的 CLI/MCP 传输及正文写回尚未接入。\n`;
}
