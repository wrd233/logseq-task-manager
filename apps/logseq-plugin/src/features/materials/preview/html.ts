import DOMPurify from "dompurify";
import {safeMarkdownURI} from "../links.ts";
import type {PreviewRenderContext} from "./types.ts";
import {previewImageInfo} from "./images.ts";

export function loadPreviewImage(image: HTMLImageElement, url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("图片未在读取时限内解码。")), 7000);
    const finish = (error?: Error) => {clearTimeout(timeout); image.onload = image.onerror = null; signal.removeEventListener("abort", aborted); if (error) reject(error); else resolve();};
    const aborted = () => {image.removeAttribute("src"); finish(new DOMException("图片读取已取消。", "AbortError"));};
    image.onload = () => finish(); image.onerror = () => finish(new Error("图片未能解码。"));
    if (signal.aborted) aborted(); else {signal.addEventListener("abort", aborted, {once: true}); image.src = url;}
  });
}

/** Template contents are inert: image URLs are removed BEFORE adopting nodes into the
 * live view, avoiding automatic remote requests from untrusted Markdown/Word content. */
export async function previewHTML(html: string, context: PreviewRenderContext): Promise<{article: HTMLElement; notices: string[]}> {
  const template = document.createElement("template"); template.innerHTML = html;
  const imageSources: Array<string | null> = [];
  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    const src = image.getAttribute("src"); image.removeAttribute("src"); image.removeAttribute("srcset"); image.removeAttribute("data-wb-image");
    image.dataset.wbImage = String(imageSources.length); imageSources.push(src);
  }
  const article = document.createElement("article"); article.className = "wb-reading wb-preview-document";
  article.innerHTML = DOMPurify.sanitize(template.innerHTML, {
    ALLOWED_URI_REGEXP: safeMarkdownURI,
    ADD_ATTR: ["data-wb-image"],
    ADD_URI_SAFE_ATTR: ["data-wb-image"], // An internal numeric token, never an image URI.
    ALLOW_DATA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
    FORBID_ATTR: ["src", "srcset", "style"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "video", "audio", "source", "link", "meta", "svg", "math"],
  });
  // Keep link policy explicit after sanitization as well. This also avoids
  // depending on a DOM emulation library's URL-attribute implementation in tests.
  for (const anchor of Array.from(article.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href") ?? "", checked = Array.from(href).filter(char => char.charCodeAt(0) > 32 && !/\s/u.test(char)).join("");
    if (!safeMarkdownURI.test(checked)) anchor.removeAttribute("href");
  }
  const notices: string[] = [];
  for (const image of Array.from(article.querySelectorAll("img"))) {
    context.signal.throwIfAborted(); const token = image.dataset.wbImage; delete image.dataset.wbImage;
    const src = token && /^\d+$/u.test(token) ? imageSources[Number(token)] : null;
    if (!src) {image.alt = image.alt || "图片来源暂不可读"; notices.push("有图片未提供可核验的来源，当前内容未完整呈现。"); continue;}
    try {
      let url: string;
      if (src.startsWith("blob:") && context.ownsURL(src)) url = src;
      else if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(src)) {
        const data = src.slice(src.indexOf(",") + 1); if (data.length > 24 * 1024 * 1024) throw new Error("内嵌图片超过读取边界。");
        const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0)); const info = previewImageInfo(bytes.buffer);
        url = context.objectURL(new Blob([bytes], {type: info.type}));
      } else if (/^(?:https?:|\/\/)/i.test(src)) throw new Error("远程图片未自动请求。");
      else url = await context.localImage(src);
      context.signal.throwIfAborted(); await loadPreviewImage(image, url, context.signal);
    } catch (error) {
      context.signal.throwIfAborted(); image.removeAttribute("src"); image.alt = image.alt || "图片暂不可读";
      notices.push(error instanceof Error ? error.message : String(error));
    }
  }
  // DOMPurify namespaces IDs; keep in-document anchors aimed at those same IDs.
  for (const anchor of Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))) {
    const id = anchor.getAttribute("href")!.slice(1);
    if (Array.from(article.querySelectorAll("[id]")).some(node => node.id === `user-content-${id}`)) anchor.setAttribute("href", `#user-content-${id}`);
  }
  context.signal.throwIfAborted(); return {article, notices: [...new Set(notices)]};
}
