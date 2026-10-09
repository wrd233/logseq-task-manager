import type {PreviewArchive} from "./archive.ts";
import {MaterialPreviewError} from "./types.ts";

function xml(text: string): XMLDocument {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new MaterialPreviewError("damaged", "表格 XML 结构无法核验。");
  return doc;
}
/** The XLSX parser may supply a default zero for missing formula caches. Verify the
 * original worksheet XML so that zero never becomes a fabricated saved result. */
export function missingFormulaCaches(archive: PreviewArchive): Map<string, Set<string>> {
  const workbook = archive.texts.get("xl/workbook.xml"), relations = archive.texts.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !relations) throw new MaterialPreviewError("damaged", "表格工作表归属无法核验。");
  const targets = new Map<string, string>(), result = new Map<string, Set<string>>();
  for (const relationship of Array.from(xml(relations).getElementsByTagNameNS("*", "Relationship"))) {
    if (relationship.getAttribute("TargetMode") === "External") continue;
    const target = relationship.getAttribute("Target"), id = relationship.getAttribute("Id"); if (!target || !id) continue;
    const parts: string[] = [];
    for (const part of (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/")) {if (!part || part === ".") continue; if (part === "..") {if (!parts.length) throw new MaterialPreviewError("damaged", "表格关联路径越界。"); parts.pop();} else parts.push(part);}
    targets.set(id, parts.join("/"));
  }
  for (const sheet of Array.from(xml(workbook).getElementsByTagNameNS("*", "sheet"))) {
    const name = sheet.getAttribute("name"), id = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? sheet.getAttribute("r:id"), path = id ? targets.get(id) : undefined;
    if (!name || !path || !path.startsWith("xl/worksheets/")) continue;
    const text = archive.texts.get(path); if (!text) throw new MaterialPreviewError("damaged", "工作表正文归属无法核验。");
    const missing = new Set<string>();
    for (const cell of Array.from(xml(text).getElementsByTagNameNS("*", "c"))) {
      const address = cell.getAttribute("r");
      if (address && cell.getElementsByTagNameNS("*", "f").length && !Array.from(cell.getElementsByTagNameNS("*", "v")).some(value => !!value.textContent?.trim())) missing.add(address);
    }
    result.set(name, missing);
  }
  return result;
}
