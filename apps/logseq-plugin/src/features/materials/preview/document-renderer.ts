import mammoth from "mammoth";
import {marked} from "../../work-view/vendor/marked.js";
import {verifyPreviewArchive} from "./archive.ts";
import {previewHTML} from "./html.ts";
import {decodePreviewText} from "./reader.ts";
import {previewImageInfo, originalImageBytes} from "./images.ts";
import {MaterialPreviewError, type MaterialPreviewSnapshot, type PreviewRenderContext, type PreviewRendered} from "./types.ts";

export const documentPreviewLimits = {markdownBytes: 2 * 1024 * 1024, mainXMLCharacters: 4 * 1024 * 1024, htmlCharacters: 4 * 1024 * 1024};

export async function renderDocument(snapshot: MaterialPreviewSnapshot, context: PreviewRenderContext): Promise<PreviewRendered> {
  let html: string, notices: string[] = [];
  if (snapshot.target.format === "markdown") {
    if (snapshot.bytes.byteLength > documentPreviewLimits.markdownBytes) throw new MaterialPreviewError("limit", "Markdown 超过 2 MiB 的本次渲染边界，请在原应用阅读；原件与引用保留。");
    html = await marked.parse(decodePreviewText(snapshot.bytes));
  }
  else {
    const archive = await verifyPreviewArchive(snapshot.bytes, context.signal);
    if ((archive.texts.get("word/document.xml")?.length ?? 0) > documentPreviewLimits.mainXMLCharacters) throw new MaterialPreviewError("limit", "Word 正文结构超过本次渲染边界，请在原应用阅读；原件与引用保留。");
    for (const [name, text] of archive.texts) if (/^word\/(?:header|footer)\d+\.xml$/u.test(name) && /<w:t(?:\s[^>]*)?>[^<]+<\/w:t>/u.test(text)) notices.push("文件含页眉或页脚正文，当前预览未完整呈现这些内容。请外部打开核对。");
    const result = await mammoth.convertToHtml({arrayBuffer: snapshot.bytes}, {
      includeEmbeddedStyleMap: false, externalFileAccess: false,
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh"],
      convertImage: mammoth.images.imgElement(async image => {
        context.signal.throwIfAborted(); const bytes = originalImageBytes(await image.readAsArrayBuffer()); const info = previewImageInfo(bytes);
        return {src: context.objectURL(new Blob([bytes], {type: info.type}))};
      }),
    });
    context.signal.throwIfAborted(); html = result.value; notices.push(...result.messages.map(message => message.message));
  }
  context.signal.throwIfAborted();
  if (html.length > documentPreviewLimits.htmlCharacters) throw new MaterialPreviewError("limit", "文件呈现内容超过本次渲染边界，请在原应用阅读；未转换或覆盖原件。");
  const reading = await previewHTML(html, context); notices = [...new Set([...notices, ...reading.notices])];
  return {element: reading.article, complete: !notices.length, notices, dispose: () => reading.article.remove()};
}
