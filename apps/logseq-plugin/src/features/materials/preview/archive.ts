import {Inflate} from "fflate";
import {CFB} from "xlsx";
import {MaterialPreviewError} from "./types.ts";
import {decodePreviewText} from "./reader.ts";

export const archiveLimits = {entries: 2048, entryBytes: 32 * 1024 * 1024, totalBytes: 64 * 1024 * 1024};
export interface PreviewArchive {names: Set<string>; texts: Map<string, string>}
const crcTable = Uint32Array.from({length: 256}, (_, n) => {let value = n; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value;});
function crcStep(crc: number, bytes: Uint8Array): number {for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ crc >>> 8; return crc;}
function damaged(message = "Office 文件结构损坏，未采用不完整内容。"): never {throw new MaterialPreviewError("damaged", message);}

/** Check BOTH declared sizes and actual streamed output before the Office parser runs.
 * Small compressed chunks prevent dishonest size fields from causing one huge inflation. */
export async function verifyPreviewArchive(input: ArrayBuffer, signal: AbortSignal): Promise<PreviewArchive> {
  rejectEncryptedOffice(input, signal);
  signal.throwIfAborted();
  const bytes = new Uint8Array(input), view = new DataView(input), result: PreviewArchive = {names: new Set(), texts: new Map()};
  const u16 = (at: number) => view.getUint16(at, true), u32 = (at: number) => view.getUint32(at, true);
  if (bytes.length < 22) damaged();
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) {end = at; break;}
  if (end < 0) damaged("此文件不是可核验的 Office ZIP 容器；损坏或加密文件需要先处理原件。");
  const count = u16(end + 10), centralSize = u32(end + 12), centralStart = u32(end + 16);
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff) throw new MaterialPreviewError("unsupported", "此 ZIP64 文件暂不支持内置预览。");
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || centralStart + centralSize !== end) damaged();
  if (count > archiveLimits.entries) throw new MaterialPreviewError("limit", "此文件内部条目过多，超过本次预览边界。");
  let position = centralStart, declaredTotal = 0, actualTotal = 0, turns = 0;
  for (let entry = 0; entry < count; entry++) {
    signal.throwIfAborted();
    if (position + 46 > end || u32(position) !== 0x02014b50) damaged();
    const flags = u16(position + 8), method = u16(position + 10), crc = u32(position + 16), packed = u32(position + 20), unpacked = u32(position + 24), nameLength = u16(position + 28), extraLength = u16(position + 30), commentLength = u16(position + 32), local = u32(position + 42);
    if (flags & 1) throw new MaterialPreviewError("unsupported", "文件条目已加密，请先解密原件后预览。");
    if (![0, 8].includes(method)) throw new MaterialPreviewError("unsupported", "此文件使用的压缩方式暂不支持预览。");
    if (position + 46 + nameLength + extraLength + commentLength > end || local + 30 > centralStart) damaged();
    const rawName = bytes.subarray(position + 46, position + 46 + nameLength);
    let name: string; try {name = new TextDecoder("utf-8", {fatal: true}).decode(rawName);} catch {damaged("文件内部路径编码暂不可核验。");}
    if (!name! || name!.startsWith("/") || name!.includes("\\") || name!.split("/").some(part => part === "." || part === "..") || result.names.has(name!)) damaged();
    declaredTotal += unpacked;
    if (unpacked > archiveLimits.entryBytes || declaredTotal > archiveLimits.totalBytes) throw new MaterialPreviewError("limit", "文件展开后的内容超过本次预览边界。");
    if (u32(local) !== 0x04034b50 || u16(local + 8) !== method || u16(local + 6) !== flags) damaged();
    const localNameLength = u16(local + 26), dataStart = local + 30 + localNameLength + u16(local + 28), dataEnd = dataStart + packed;
    if (localNameLength !== nameLength || dataEnd > centralStart || rawName.some((byte, index) => byte !== bytes[local + 30 + index])) damaged();
    const keepText = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/u.test(name!) || /^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/u.test(name!);
    const chunks: Uint8Array[] = []; let actualSize = 0, actualCRC = 0xffffffff;
    const receive = (chunk: Uint8Array) => {
      actualSize += chunk.length; actualTotal += chunk.length;
      if (actualSize > unpacked || actualSize > archiveLimits.entryBytes || actualTotal > archiveLimits.totalBytes) throw new MaterialPreviewError("limit", "文件实际展开量超限或与声明不符，未交给预览解析器。");
      actualCRC = crcStep(actualCRC, chunk); if (keepText) chunks.push(chunk.slice());
    };
    try {
      if (method === 0) receive(bytes.subarray(dataStart, dataEnd));
      else {
        const inflater = new Inflate(receive);
        for (let offset = dataStart; offset < dataEnd; offset += 4096) {
          signal.throwIfAborted(); inflater.push(bytes.subarray(offset, Math.min(offset + 4096, dataEnd)), offset + 4096 >= dataEnd);
          if (++turns % 64 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        if (!packed) inflater.push(new Uint8Array(), true);
      }
    } catch (error) {if (error instanceof MaterialPreviewError || signal.aborted) throw error; damaged();}
    if (actualSize !== unpacked || ((actualCRC ^ 0xffffffff) >>> 0) !== crc) damaged();
    result.names.add(name!);
    if (keepText) {const text = new Uint8Array(actualSize); let offset = 0; for (const chunk of chunks) {text.set(chunk, offset); offset += chunk.length;} result.texts.set(name!, decodePreviewText(text.buffer));}
    position += 46 + nameLength + extraLength + commentLength;
  }
  if (position !== end) damaged(); signal.throwIfAborted(); return result;
}

/** Encrypted OOXML uses a compound container, rather than encrypted ZIP entries.
 * Identify its actual named streams with the shipped Office container parser. */
export function rejectEncryptedOffice(input: ArrayBuffer, signal: AbortSignal): void {
  const bytes = new Uint8Array(input);
  if (bytes.length < 8 || ![0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((byte, index) => bytes[index] === byte)) return;
  signal.throwIfAborted();
  if (bytes.length > 16 * 1024 * 1024) throw new MaterialPreviewError("limit", "复合文档容器超过本次识别边界，请在原应用核对格式或加密状态。");
  if (bytes.length < 512) damaged();
  const view = new DataView(input), shift = view.getUint16(30, true), sectors = Math.floor(bytes.length / 2 ** shift) - 1;
  if (![9,12].includes(shift) || view.getUint16(28,true) !== 0xfffe || view.getUint32(48,true) >= sectors || [44,64,72].some(offset => view.getUint32(offset,true) > sectors)) damaged();
  try {
    const parsed: unknown = CFB.read(bytes, {type: "array"}); signal.throwIfAborted();
    if (!parsed || typeof parsed !== "object" || !("FullPaths" in parsed) || !("FileIndex" in parsed) || !Array.isArray(parsed.FullPaths) || !Array.isArray(parsed.FileIndex) || parsed.FullPaths.length !== parsed.FileIndex.length || parsed.FullPaths.length > 4096) damaged();
    const files: unknown[] = parsed.FileIndex;
    const streams = parsed.FullPaths.filter((path: unknown, index: number) => {const entry = files[index]; return typeof path === "string" && entry && typeof entry === "object" && "type" in entry && entry.type === 2;}).map((path: string) => path.split("/").at(-1));
    if (streams.includes("EncryptionInfo") && streams.includes("EncryptedPackage")) throw new MaterialPreviewError("unsupported", "此 Office 文件已加密。请先在原应用解密后预览；未转换或覆盖原件。");
  } catch (error) {if (error instanceof MaterialPreviewError || signal.aborted) throw error; damaged();}
  throw new MaterialPreviewError("unsupported", "此文件使用复合文档容器，无法按当前格式可靠读取。请在原应用核对格式或加密状态。");
}
