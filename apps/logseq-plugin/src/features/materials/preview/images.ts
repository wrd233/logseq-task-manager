import {MaterialPreviewError} from "./types.ts";

export interface PreviewImageInfo {type: string; width: number; height: number; animation: "gif" | "static" | "unknown"}
/** Some document parsers return a Uint8Array despite declaring ArrayBuffer. Keep
 * its exact view bounds; never decode/re-encode image bytes or include its backing pool. */
export function originalImageBytes(input: unknown): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
  throw new MaterialPreviewError("damaged", "文档内嵌图片没有返回可核验的原始字节。");
}
export function previewImageInfo(input: ArrayBuffer): PreviewImageInfo {
  const b = new Uint8Array(input), v = new DataView(input); let info: PreviewImageInfo | null = null;
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 24 && b[0] === 137 && text(1, 4) === "PNG" && text(12, 16) === "IHDR") info = {type: "image/png", width: v.getUint32(16), height: v.getUint32(20), animation: "static"};
  else if (b.length >= 10 && ["GIF87a", "GIF89a"].includes(text(0, 6))) info = {type: "image/gif", width: v.getUint16(6, true), height: v.getUint16(8, true), animation: "gif"};
  else if (b.length >= 25 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    if (b.length >= 30 && text(12, 16) === "VP8X") info = {type: "image/webp", width: 1 + b[24]! + (b[25]! << 8) + (b[26]! << 16), height: 1 + b[27]! + (b[28]! << 8) + (b[29]! << 16), animation: b[20]! & 2 ? "unknown" : "static"};
    else if (b.length >= 30 && text(12, 16) === "VP8 " && text(23, 26) === "\x9d\x01\x2a") info = {type: "image/webp", width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff, animation: "static"};
    else if (text(12, 16) === "VP8L" && b[20] === 0x2f) info = {type: "image/webp", width: 1 + (((b[22]! & 0x3f) << 8) | b[21]!), height: 1 + ((b[24]! & 15) << 10 | b[23]! << 2 | b[22]! >> 6), animation: "static"};
  } else if (b.length >= 4 && b[0] === 255 && b[1] === 216) {
    for (let at = 2; at + 4 < b.length;) {
      if (b[at] !== 255) break; while (b[at + 1] === 255) at++;
      const marker = b[at + 1]!;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) {at += 2; continue;}
      const length = v.getUint16(at + 2); if (length < 2 || at + 2 + length > b.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {info = {type: "image/jpeg", width: v.getUint16(at + 7), height: v.getUint16(at + 5), animation: "static"}; break;}
      at += 2 + length;
    }
  }
  if (!info || !info.width || !info.height) throw new MaterialPreviewError("damaged", "图片格式或尺寸无法核验，未加载不可靠图像。");
  if (info.width * info.height > 32_000_000) throw new MaterialPreviewError("limit", "图片超过 3200 万像素的预览边界，原文件保留。");
  return info;
}
