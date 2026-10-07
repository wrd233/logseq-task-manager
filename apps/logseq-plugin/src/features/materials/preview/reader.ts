import type {FileIO} from "../../../host/file-io.ts";
import {localAssetURL, localReadLimit} from "../../../host/local-bytes.ts";
import type {MaterialService} from "../service.ts";
import {fileName} from "../names.ts";
import {pathWithin, previewFormat} from "./paths.ts";
import {MaterialPreviewError, type MaterialPreviewSnapshot, type MaterialPreviewTarget, type PreviewScope} from "./types.ts";

export async function byteVersion(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function decodePreviewText(bytes: ArrayBuffer): string {
  const prefix = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const encoding = prefix[0] === 0xff && prefix[1] === 0xfe ? "utf-16le" : prefix[0] === 0xfe && prefix[1] === 0xff ? "utf-16be" : "utf-8";
  try {return new TextDecoder(encoding, {fatal: true}).decode(bytes);} catch {throw new MaterialPreviewError("damaged", "此文本编码暂不可可靠读取，原文件保留。");}
}
/** Read-only authority. It never saves, renames, changes permissions or associates Graph assets. */
export class MaterialPreviewReader {
  constructor(readonly service: MaterialService, readonly io: FileIO = service.io) {}
  async material(id: string, scope: PreviewScope): Promise<MaterialPreviewTarget> {
    if (scope.graph !== this.service.graph) throw new MaterialPreviewError("scope-changed", "材料 Graph 范围已变化。");
    const view = await this.service.read(id, false), {record} = await this.service.locate(id);
    if (record.graph && record.graph !== scope.graph) throw new MaterialPreviewError("scope-changed", "材料属于另一个 Graph。");
    if (view.availability !== "available") throw new MaterialPreviewError("unavailable", view.problem ?? "文件暂不可读；关联与历史保留。");
    if (record.rename && ["prepared", "uncertain"].includes(record.rename.status)) throw new MaterialPreviewError("target-changed", "文件改名待核验，原记录与引用保留。");
    const observed = await this.io.identity?.(view.path) ?? null;
    if (record.fileIdentity && observed && record.fileIdentity !== observed) throw new MaterialPreviewError("identity-changed", "同路径文件的物理身份已变化。请核验原材料，不自动认领替换文件。");
    if (record.fileIdentity && !observed) throw new MaterialPreviewError("identity-changed", "当前宿主不能核验原材料身份，原记录与引用保留。");
    return {key: `material:${id}`, scope, materialId: id, path: view.path, fileName: fileName(view.path), format: previewFormat(view.path), origin: "material", associations: view.associations, reference: view.reference, identity: record.fileIdentity && observed ? "verified" : "unverified"};
  }
  asset(path: string, scope: PreviewScope): MaterialPreviewTarget {
    localAssetURL(path);
    if (scope.graph !== this.service.graph || !pathWithin(path, `${scope.graph}/assets`)) throw new MaterialPreviewError("scope-changed", "资产链接越过当前 Graph assets 范围。");
    return {key: `asset:${path}`, scope, materialId: null, path, fileName: fileName(path), format: previewFormat(path), origin: "graph-asset", associations: [], reference: null, identity: "unverified"};
  }
  async read(target: MaterialPreviewTarget, signal: AbortSignal): Promise<MaterialPreviewSnapshot> {
    signal.throwIfAborted();
    if (target.scope.graph !== this.service.graph) throw new MaterialPreviewError("scope-changed", "预览 Graph 范围已变化。");
    const current = target.materialId ? await this.material(target.materialId, target.scope) : this.asset(target.path, target.scope);
    signal.throwIfAborted();
    if (!this.io.readBytes) throw new MaterialPreviewError("unsupported", "此宿主没有原始字节读取能力，未将文本冒充文件字节。");
    const before = await this.io.identity?.(current.path) ?? null;
    const bytes = await this.io.readBytes(current.path, {signal, maxBytes: localReadLimit});
    signal.throwIfAborted();
    if (bytes.byteLength > localReadLimit) throw new MaterialPreviewError("limit", "文件超过本次预览的读取上限。");
    const after = await this.io.identity?.(current.path) ?? null;
    signal.throwIfAborted();
    if (before && before !== after) throw new MaterialPreviewError("target-changed", "读取期间文件身份变化，请重新核验后阅读。");
    if (current.materialId) {
      const latest = await this.service.locate(current.materialId);
      if (await latest.store.path(current.materialId) !== current.path) throw new MaterialPreviewError("target-changed", "读取期间材料位置变化，迟到结果未采用。");
    }
    const version = await byteVersion(bytes); signal.throwIfAborted();
    const observedTarget = current.origin === "graph-asset" && before && after ? {...current, identity: "verified" as const} : current;
    return {target: observedTarget, version, bytes, ...(observedTarget.identity === "unverified" ? {identityNotice: "当前宿主无法核验文件身份。这里只读打开时版本；外部改名或替换后需核对，旧链接与历史保留。"} : {})};
  }
}
