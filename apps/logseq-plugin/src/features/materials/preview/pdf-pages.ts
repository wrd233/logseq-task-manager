import type {PDFDocumentProxy, RenderTask} from "pdfjs-dist/legacy/build/pdf.mjs";
import type {PreviewRendered} from "./types.ts";

interface PageSlot {
  number: number; frame: HTMLElement; paper: HTMLElement; placeholder: HTMLElement;
  canvas: HTMLCanvasElement | null; width: number; task: RenderTask | null; failed: boolean;
}
/** All pages have stable scroll positions; only nearby pages own canvas memory. */
export async function renderContinuousPDF(pdf: Pick<PDFDocumentProxy, "numPages" | "getPage">, signal: AbortSignal): Promise<PreviewRendered> {
  signal.throwIfAborted();
  const root = document.createElement("section"); root.className = "wb-preview-pdf";
  root.setAttribute("aria-label", `PDF 连续阅读，共 ${pdf.numPages} 页`);
  const slots: PageSlot[] = [], near = new Set<number>(), wanted = new Set([1]);
  let disposed = false, busy = false, mounted = false, firstAspect = "", timer: ReturnType<typeof setTimeout> | null = null;
  let intersection: IntersectionObserver | null = null, resize: ResizeObserver | null = null;
  let scrollRoot: HTMLElement | null = null, surfaceWindow: Window | null = null;
  for (let number = 1; number <= pdf.numPages; number++) {
    const frame = document.createElement("div"), paper = document.createElement("div"), placeholder = document.createElement("span"), caption = document.createElement("small");
    frame.className = "wb-preview-pdf-page"; frame.dataset.pdfPage = String(number);
    paper.className = "wb-preview-pdf-paper"; placeholder.className = "wb-preview-pdf-placeholder"; placeholder.textContent = "滚动到此页时读取";
    caption.textContent = `${number} / ${pdf.numPages}`; paper.append(placeholder); frame.append(paper, caption); root.append(frame);
    slots.push({number, frame, paper, placeholder, canvas: null, width: 0, task: null, failed: false});
  }
  const width = () => Math.max(1, root.clientWidth || root.parentElement?.clientWidth || 640);
  function evict(slot: PageSlot): void {
    slot.task?.cancel();
    if (slot.canvas) {slot.canvas.width = 0; slot.canvas.height = 0; slot.canvas.remove(); slot.canvas = null;}
    slot.width = 0; slot.placeholder.hidden = false;
    if (!slot.failed) slot.placeholder.textContent = "滚动到此页时读取";
  }
  async function draw(slot: PageSlot): Promise<void> {
    const selected = await pdf.getPage(slot.number);
    if (disposed || !wanted.has(slot.number)) return;
    const pageWidth = width(), original = selected.getViewport({scale: 1});
    slot.paper.style.aspectRatio = `${original.width} / ${original.height}`;
    if (!firstAspect) {
      firstAspect = slot.paper.style.aspectRatio;
      for (const other of slots) if (!other.paper.style.aspectRatio) other.paper.style.aspectRatio = firstAspect;
    }
    const viewport = selected.getViewport({scale: pageWidth / original.width});
    // Four live pages, at most six million pixels each, regardless of display DPI.
    const ratio = Math.min(surfaceWindow?.devicePixelRatio || window.devicePixelRatio || 1, 2, Math.sqrt(5_900_000 / (viewport.width * viewport.height)));
    const canvas = root.ownerDocument.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width * ratio)); canvas.height = Math.max(1, Math.ceil(viewport.height * ratio));
    canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", `PDF 第 ${slot.number} 页`);
    const drawing = canvas.getContext("2d"); if (!drawing) throw new Error("宿主没有可用的 PDF 画布。");
    slot.paper.append(canvas); slot.canvas = canvas; slot.placeholder.hidden = true;
    const task = selected.render({canvasContext: drawing, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]}); slot.task = task;
    try {await task.promise; if (!disposed && wanted.has(slot.number)) slot.width = pageWidth;}
    finally {if (slot.task === task) slot.task = null; if (disposed || !wanted.has(slot.number)) evict(slot);}
  }
  async function pump(): Promise<void> {
    if (busy || disposed) return; busy = true;
    try {
      for (;;) {
        const slot = Array.from(wanted, number => slots[number - 1]!).find(item => !item.failed && item.width !== width());
        if (!slot || disposed) return;
        evict(slot);
        try {await draw(slot);}
        catch (error) {
          if (disposed) return;
          if (!wanted.has(slot.number) || error instanceof Error && error.name === "RenderingCancelledException") continue;
          evict(slot); slot.failed = true; slot.placeholder.textContent = `此页暂不可读：${error instanceof Error ? error.message : String(error)}`;
        }
      }
    } finally {busy = false;}
  }
  function chooseNearby(): void {
    if (disposed) return;
    const bounds = scrollRoot?.getBoundingClientRect(), center = bounds ? (bounds.top + bounds.bottom) / 2 : (surfaceWindow?.innerHeight ?? 720) / 2;
    const closest = Array.from(near).sort((a, b) => {
      const left = slots[a - 1]!.frame.getBoundingClientRect(), right = slots[b - 1]!.frame.getBoundingClientRect();
      return Math.abs((left.top + left.bottom) / 2 - center) - Math.abs((right.top + right.bottom) / 2 - center);
    }).slice(0, 4);
    wanted.clear(); for (const number of closest) wanted.add(number);
    for (const slot of slots) if (!wanted.has(slot.number) && (slot.canvas || slot.task)) evict(slot);
    void pump();
  }
  const fallback = () => {
    const bounds = scrollRoot?.getBoundingClientRect(), top = (bounds?.top ?? 0) - 500, bottom = (bounds?.bottom ?? surfaceWindow?.innerHeight ?? 720) + 500;
    near.clear(); for (const slot of slots) {const rect = slot.frame.getBoundingClientRect(); if (rect.bottom >= top && rect.top <= bottom) near.add(slot.number);}
    chooseNearby();
  };
  const resized = () => {if (timer) clearTimeout(timer); timer = setTimeout(() => {timer = null; if (!intersection) fallback(); else void pump();}, 100);};
  const dispose = () => {
    if (disposed) return; disposed = true; intersection?.disconnect(); resize?.disconnect(); if (timer) clearTimeout(timer);
    scrollRoot?.removeEventListener("scroll", fallback); surfaceWindow?.removeEventListener("scroll", fallback); surfaceWindow?.removeEventListener("resize", resized);
    signal.removeEventListener("abort", dispose); for (const slot of slots) evict(slot); root.remove();
  };
  signal.addEventListener("abort", dispose, {once: true});
  try {await draw(slots[0]!); signal.throwIfAborted();} catch (error) {dispose(); throw error;}
  return {element: root, complete: true, notices: [], dispose, mounted: () => {
    if (mounted || disposed) return; mounted = true;
    surfaceWindow = root.ownerDocument.defaultView; scrollRoot = root.closest<HTMLElement>(".wb-scroll");
    // Construct observers in the document that actually owns the adopted PDF pages.
    const constructors = surfaceWindow as (Window & typeof globalThis) | null;
    if (constructors?.IntersectionObserver) {
      intersection = new constructors.IntersectionObserver(entries => {
        for (const entry of entries) {const number = Number((entry.target as HTMLElement).dataset.pdfPage); if (entry.isIntersecting) near.add(number); else near.delete(number);}
        chooseNearby();
      }, {root: scrollRoot, rootMargin: "500px 0px"});
      for (const slot of slots) intersection.observe(slot.frame);
    } else {scrollRoot?.addEventListener("scroll", fallback, {passive: true}); surfaceWindow?.addEventListener("scroll", fallback, {passive: true}); fallback();}
    if (constructors?.ResizeObserver) {resize = new constructors.ResizeObserver(resized); resize.observe(root);}
    surfaceWindow?.addEventListener("resize", resized); void pump();
  }};
}
