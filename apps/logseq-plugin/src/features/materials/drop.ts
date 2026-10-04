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
 * No basename search, invented path or implicit content copy fallback. */
export async function droppedPath(file: File, io: FileIO): Promise<string | null> {
  const path = (file as File & {path?: unknown}).path;
  if (typeof path !== "string" || !path.startsWith("/") || !io.stat) return null;
  const stat = await io.stat(path);
  if (stat.type !== "file" || stat.size !== file.size || fileName(path) !== file.name) throw new Error("拖入文件的宿主路径未通过核验。");
  return path;
}
export function supportsDrop(data: DataTransfer | null): boolean { return !!data && (Array.from(data.types).includes(MATERIAL_MIME) || Array.from(data.types).includes("Files")); }
