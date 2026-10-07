import {previewImageInfo} from "./images.ts";
import {loadPreviewImage} from "./html.ts";
import type {MaterialPreviewSnapshot, PreviewRenderContext, PreviewRendered} from "./types.ts";

export async function renderImage(snapshot: MaterialPreviewSnapshot, context: PreviewRenderContext): Promise<PreviewRendered> {
  const info = previewImageInfo(snapshot.bytes), root = document.createElement("section"), tools = document.createElement("div"), surface = document.createElement("div"), image = document.createElement("img");
  root.className = "wb-preview-image"; tools.className = "wb-preview-tools"; surface.className = "wb-preview-image-surface";
  image.alt = snapshot.target.fileName; const url = context.objectURL(new Blob([snapshot.bytes], {type: info.type}));
  let zoom: number | null = null, width = info.width;
  const scale = document.createElement("span"); scale.setAttribute("role", "status");
  const show = () => {image.style.width = zoom === null ? "" : `${width * zoom}px`; image.style.maxWidth = zoom === null ? "100%" : "none"; scale.textContent = zoom === null ? "适配" : `${Math.round(zoom * 100)}%`;};
  const control = (text: string, action: () => void) => {const item = document.createElement("button"); item.type = "button"; item.textContent = text; item.onclick = action; return item;};
  tools.append(control("适配", () => {zoom = null; show();}), control("−", () => {zoom = Math.max(.1, (zoom ?? 1) - .25); show();}), scale, control("+", () => {zoom = Math.min(4, (zoom ?? 1) + .25); show();}));
  const dimensions = document.createElement("small"); dimensions.textContent = `${info.width} × ${info.height}${info.animation === "gif" ? " · GIF 由宿主播放，含动画时保留动画" : info.animation === "unknown" ? " · 动画由宿主决定" : ""}`; tools.append(dimensions);
  surface.append(image); root.append(tools, surface); show();
  await loadPreviewImage(image, url, context.signal);
  width = image.naturalWidth; const height = image.naturalHeight;
  dimensions.textContent = `${width} × ${height}${info.animation === "gif" ? " · GIF 由宿主播放，含动画时保留动画" : info.animation === "unknown" ? " · 动画由宿主决定" : ""}`; show();
  context.signal.throwIfAborted(); return {element: root, complete: true, notices: [], dispose: () => {image.removeAttribute("src"); root.remove();}};
}
