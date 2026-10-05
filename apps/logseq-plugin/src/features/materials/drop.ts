import type { FileIO } from "../../host/file-io.ts";
import type { SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { MaterialContentPort, MaterialDropTarget } from "./references.ts";
import { docIdPattern } from "./links.ts";
import { fileName } from "./names.ts";
export const MATERIAL_MIME = "application/x-task-copilot-material";
export type MaterialDrag = {schemaVersion: 1; materialId: string; scope: SourceScope};
export interface MaterialTransferPort {
  scope(rootUuid: string): Promise<SourceScope>;
  read(scope: SourceScope): Promise<SourceSnapshot>;
  /** Presentation hook only. resolve remains the sole authority for source positions. */
  body(element: Element): Element | null;
  /** Current work owner, used for file association even when a source position is rejected. */
  currentScope(): SourceScope | null;
  resolve(element: Element): Promise<MaterialDropTarget | null>;
  valid(scope: SourceScope): boolean;
  content: MaterialContentPort;
  navigate(uuid: string): Promise<void>;
}
export function materialDrag(data: string, scope: SourceScope): MaterialDrag {
  const value = JSON.parse(data) as MaterialDrag;
  if (value.schemaVersion !== 1 || !docIdPattern.test(value.materialId) || value.scope?.graphId !== scope.graphId || value.scope.rootUuid !== scope.rootUuid || Object.keys(value).some(key => !["schemaVersion", "materialId", "scope"].includes(key))) throw new Error("材料拖动范围已变化。请回到当前工作复制链接。");
  return value;
}
/** Electron File.path is used only when it is actually supplied and matches host IO.
 * No basename search or invented path; a pathless File must supply its actual bytes. */
export async function droppedPath(file: File, io: FileIO): Promise<string | null> {
  const path = (file as File & {path?: unknown}).path;
  if (typeof path !== "string" || !path.startsWith("/") || !io.stat) return null;
  const stat = await io.stat(path);
  if (stat.type !== "file" || stat.size !== file.size || fileName(path) !== file.name) throw new Error("拖入文件的宿主路径未通过核验。");
  return path;
}
export function supportsDrop(data: DataTransfer | null): boolean { return !!data && (Array.from(data.types).includes(MATERIAL_MIME) || Array.from(data.types).includes("Files")); }

export interface DroppedFolderFile { relative: string; file: File }
/** Retain browser directory handles during dispatch; never infer an OS path from fullPath. */
export async function readDroppedFolder(entry: FileSystemDirectoryEntry): Promise<DroppedFolderFile[]> {
  const files: DroppedFolderFile[] = []; let count = 0;
  async function visit(directory: FileSystemDirectoryEntry, prefix: string, depth: number): Promise<void> {
    if (depth > 24) throw new Error("文件夹层级过深，请分批拖入。");
    const reader = directory.createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return;
      for (const child of batch) {
        if (child.name.startsWith(".")) continue;
        if (++count > 1000) throw new Error("文件夹超过 1000 项，请分批拖入。");
        const relative = `${prefix}${child.name}`;
        if (child.isDirectory) await visit(child as FileSystemDirectoryEntry, `${relative}/`, depth + 1);
        else if (child.isFile) files.push({relative, file: await new Promise<File>((resolve, reject) => (child as FileSystemFileEntry).file(resolve, reject))});
      }
    }
  }
  await visit(entry, "", 0); return files;
}
