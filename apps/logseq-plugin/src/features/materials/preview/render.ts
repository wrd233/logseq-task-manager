import {renderDocument} from "./document-renderer.ts";
import {renderImage} from "./image-renderer.ts";
import {renderSheet} from "./sheet-renderer.ts";
import {MaterialPreviewError, type MaterialPreviewSnapshot, type PreviewRenderContext, type PreviewRendered} from "./types.ts";

export function renderMaterialPreview(snapshot: MaterialPreviewSnapshot, context: PreviewRenderContext): Promise<PreviewRendered> {
  context.signal.throwIfAborted();
  switch (snapshot.target.format) {
    case "markdown": case "docx": return renderDocument(snapshot, context);
    case "image": return renderImage(snapshot, context);
    case "spreadsheet": return renderSheet(snapshot, context);
    case "pdf": return import("./pdf-renderer.ts").then(module => module.renderPDF(snapshot, context));
    case "legacy-doc": throw new MaterialPreviewError("unsupported", "旧 .doc 格式尚不支持内置预览，请用原应用阅读；未转换或覆盖原件。");
    default: throw new MaterialPreviewError("unsupported", "此格式尚不支持内置预览，原文件与关联保留。");
  }
}
