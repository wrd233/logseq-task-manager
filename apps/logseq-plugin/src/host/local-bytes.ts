import type { FileReadOptions } from "./file-io.ts";

export const localReadLimit = 64 * 1024 * 1024;
export function hasControlCharacters(text: string): boolean { return Array.from(text).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127); }
/** Use the stock host's assets protocol. Fetch does not support it on Desktop 0.10.15;
 * XMLHttpRequest does, returning the original bytes rather than UTF-8 replacement text. */
export function localAssetURL(path: string): string {
  if (!path.startsWith("/") || path === "/" || hasControlCharacters(path) || path.includes("\\") || path.split("/").some(part => part === "." || part === "..")) throw new Error("本地文件路径无效。");
  return `assets://${path.split("/").map(encodeURIComponent).join("/")}`;
}
export function readLocalBytes(path: string, options: FileReadOptions = {}, createRequest: () => XMLHttpRequest = () => new XMLHttpRequest()): Promise<ArrayBuffer> {
  return readByteURL(localAssetURL(path), options, createRequest);
}
/** Only installation-relative resources from this running plugin, never a caller's
 * arbitrary worker URL or CDN. Native windows use the opener's frozen resource base. */
export function readPackagedBytes(relative: string, base: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const current = new URL(location.href), source = new URL(base);
  if (!["file:", "lsp:", "assets:"].includes(current.protocol) || source.href !== current.href || relative.startsWith("/") || relative.split("/").some(part => part === "..")) throw new Error("预览资源不属于当前安装包。");
  return readByteURL(new URL(relative, current).href, {signal, maxBytes: 8 * 1024 * 1024}, () => new XMLHttpRequest());
}
function readByteURL(url: string, options: FileReadOptions, createRequest: () => XMLHttpRequest): Promise<ArrayBuffer> {
  const limit = options.maxBytes ?? localReadLimit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > localReadLimit) throw new Error("文件读取上限无效。");
  return new Promise((resolve, reject) => {
    const xhr = createRequest(); let settled = false;
    const finish = (value: ArrayBuffer | Error) => {
      if (settled) return; settled = true;
      options.signal?.removeEventListener("abort", cancel);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = xhr.onprogress = null;
      if (value instanceof ArrayBuffer) resolve(value); else reject(value);
    };
    const cancel = () => { finish(new DOMException("读取已取消。", "AbortError")); xhr.abort(); };
    if (options.signal?.aborted) { cancel(); return; }
    xhr.open("GET", url); xhr.responseType = "arraybuffer"; xhr.timeout = 15000;
    xhr.onload = () => {
      if (xhr.status >= 400 || !(xhr.response instanceof ArrayBuffer)) { finish(new Error("文件字节暂不可读。")); return; }
      if (xhr.response.byteLength > limit) { finish(new Error("文件超过本次预览读取上限。")); return; }
      finish(xhr.response);
    };
    xhr.onprogress = event => { if (event.loaded > limit || event.lengthComputable && event.total > limit) { finish(new Error("文件超过本次预览读取上限。")); xhr.abort(); } };
    xhr.onerror = () => finish(new Error("文件字节暂不可读；原文件与关联保留。"));
    xhr.ontimeout = () => { finish(new Error("文件读取超时，请稍后重试。")); xhr.abort(); };
    xhr.onabort = () => finish(new DOMException("读取已取消。", "AbortError"));
    options.signal?.addEventListener("abort", cancel, {once: true});
    try { xhr.send(); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
