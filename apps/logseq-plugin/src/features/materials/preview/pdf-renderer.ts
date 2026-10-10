import {getDocument, PDFWorker, type PDFDocumentProxy} from "pdfjs-dist/legacy/build/pdf.mjs";
import {renderContinuousPDF} from "./pdf-pages.ts";
import {readPackagedBytes} from "../../../host/local-bytes.ts";
import {MaterialPreviewError, type MaterialPreviewSnapshot, type PreviewRenderContext, type PreviewRendered} from "./types.ts";

export async function renderPDF(snapshot: MaterialPreviewSnapshot, context: PreviewRenderContext): Promise<PreviewRendered> {
  context.signal.throwIfAborted();
  const workerBytes = await readPackagedBytes("./pdfjs/pdf.worker.min.mjs", context.resourceBase, context.signal);
  const workerURL = context.objectURL(new Blob([workerBytes], {type: "text/javascript"}));
  const port = new Worker(workerURL, {type: "module", name: "workbench-material-pdf"});
  // 4.10.38's generated declarations incorrectly type the supported native port as null.
  const worker: PDFWorker = Reflect.construct(PDFWorker, [{port}]);
  // file:/assets: resources use the same checked XHR byte port as the packaged
  // worker. The PDF library's default fetch cannot read this host's local scheme.
  class CMaps {async fetch({name}: {name: string}) {if (!/^[A-Za-z0-9_-]+$/u.test(name)) throw new Error("PDF 字符映射资源名称无效。"); return {cMapData: new Uint8Array(await readPackagedBytes(`./pdfjs/cmaps/${name}.bcmap`, context.resourceBase, context.signal)), isCompressed: true};}}
  class Fonts {async fetch({filename}: {filename: string}) {if (!/^[A-Za-z0-9_.-]+$/u.test(filename) || filename.includes("..")) throw new Error("PDF 字体资源名称无效。"); return new Uint8Array(await readPackagedBytes(`./pdfjs/standard_fonts/${filename}`, context.resourceBase, context.signal));}}
  const loading = getDocument({data: new Uint8Array(snapshot.bytes.slice(0)), worker, isEvalSupported: false, useWorkerFetch: false, CMapReaderFactory: CMaps, StandardFontDataFactory: Fonts, cMapPacked: true});
  let pdf: PDFDocumentProxy, pages: PreviewRendered | null = null, disposed = false;
  const release = () => {
    if (disposed) return; disposed = true; pages?.dispose();
    context.signal.removeEventListener("abort", release);
    // Let PDF.js cancel its transport before terminating our external port.
    // A damaged or unresponsive worker still has a bounded shutdown.
    let shutdownTimer: ReturnType<typeof setTimeout>;
    void Promise.race([loading.destroy().catch(() => undefined), new Promise<void>(resolve => {shutdownTimer = setTimeout(resolve, 2000);})])
      .finally(() => {clearTimeout(shutdownTimer); worker.destroy(); port.terminate();});
  };
  context.signal.addEventListener("abort", release, {once: true});
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;
  try {pdf = await Promise.race([loading.promise, new Promise<never>((_, reject) => {loadingTimer = setTimeout(() => reject(new Error("PDF 加载超过读取时限。")), 20000);})]); context.signal.throwIfAborted();}
  catch (error) {release(); if (context.signal.aborted) throw error; throw new MaterialPreviewError("damaged", /password/i.test(String(error)) ? "此 PDF 已加密，需先解密原件后预览。" : "PDF 未能解码；请核对原件与本地预览资源。");}
  finally {if (loadingTimer) clearTimeout(loadingTimer);}
  if (pdf.numPages > 500) {release(); throw new MaterialPreviewError("limit", "PDF 超过 500 页的本次预览边界，原文件保留。");}
  try {
    pages = await renderContinuousPDF(pdf, context.signal); context.signal.throwIfAborted();
    return {...pages, dispose: release};
  } catch (error) {release(); throw error;}
}
