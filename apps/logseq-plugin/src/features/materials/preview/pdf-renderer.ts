import {getDocument, PDFWorker, type PDFDocumentProxy, type RenderTask} from "pdfjs-dist/legacy/build/pdf.mjs";
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
  let pdf: PDFDocumentProxy | null = null, rendering: RenderTask | null = null, disposed = false;
  const root = document.createElement("section"), tools = document.createElement("div"), surface = document.createElement("div"), canvas = document.createElement("canvas"), status = document.createElement("span"), problem = document.createElement("p");
  root.className = "wb-preview-pdf"; tools.className = "wb-preview-tools"; surface.className = "wb-preview-pdf-surface"; problem.className = "wb-preview-notice"; status.setAttribute("role", "status");
  const release = () => {
    if (disposed) return; disposed = true; rendering?.cancel();
    context.signal.removeEventListener("abort", release); root.remove();
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
  let pageNumber = 1, scale = 1, ticket = 0, fit = false;
  const control = (text: string, action: () => void) => {const item = document.createElement("button"); item.type = "button"; item.textContent = text; item.onclick = () => {if (!disposed) action();}; return item;};
  const page = document.createElement("input"); page.type = "number"; page.min = "1"; page.max = String(pdf.numPages); page.setAttribute("aria-label", "PDF 页码");
  const previous = control("上一页", () => {pageNumber = Math.max(1, pageNumber - 1); void show();}), next = control("下一页", () => {pageNumber = Math.min(pdf!.numPages, pageNumber + 1); void show();});
  tools.append(previous, page, next, control("适配宽度", () => {fit = true; void show();}), control("−", () => {fit = false; scale = Math.max(.25, scale - .25); void show();}), control("+", () => {fit = false; scale = Math.min(3, scale + .25); void show();}), status); surface.append(canvas); root.append(tools, problem, surface);
  const show = async () => {
    const current = ++ticket, prior = rendering; prior?.cancel();
    try {
      if (prior) await prior.promise.catch(() => undefined); if (disposed || current !== ticket) return;
      const selected = await pdf!.getPage(pageNumber); if (disposed || current !== ticket) return;
      if (fit) scale = Math.max(.25, Math.min(3, Math.max(160, root.clientWidth - 16) / selected.getViewport({scale: 1}).width));
      const viewport = selected.getViewport({scale}), ratio = Math.min(2, window.devicePixelRatio || 1);
      if (viewport.width * viewport.height * ratio * ratio > 16_000_000) throw new MaterialPreviewError("limit", "此页缩放后超过图像渲染边界，请缩小。" );
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio); canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      const drawing = canvas.getContext("2d"); if (!drawing) throw new Error("宿主没有可用的 PDF 画布。");
      rendering = selected.render({canvasContext: drawing, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]}); await rendering.promise;
      if (disposed || current !== ticket) return;
      page.value = String(pageNumber); previous.disabled = pageNumber === 1; next.disabled = pageNumber === pdf!.numPages; status.textContent = `${pageNumber} / ${pdf!.numPages} 页 · ${Math.round(scale * 100)}%`; problem.textContent = "";
    } catch (error) {if (!disposed && current === ticket && !(error instanceof Error && error.name === "RenderingCancelledException")) problem.textContent = error instanceof Error ? error.message : String(error);}
  };
  page.onchange = () => {const number = Number(page.value); if (Number.isInteger(number) && number >= 1 && number <= pdf!.numPages) {pageNumber = number; void show();} else page.value = String(pageNumber);};
  await show(); context.signal.throwIfAborted(); return {element: root, complete: !problem.textContent, notices: problem.textContent ? [problem.textContent] : [], dispose: release};
}
