import * as XLSX from "xlsx";
import {fileName} from "../names.ts";
import {verifyPreviewArchive} from "./archive.ts";
import {decodePreviewText} from "./reader.ts";
import {missingFormulaCaches} from "./formula-cache.ts";
import {MaterialPreviewError, type MaterialPreviewSnapshot, type PreviewRenderContext, type PreviewRendered} from "./types.ts";

export const sheetLimits = {bytes: 16 * 1024 * 1024, parsedRows: 10000, rowsPerPage: 100, columnsPerPage: 40, sheets: 128, merges: 10000};
export async function renderSheet(snapshot: MaterialPreviewSnapshot, context: PreviewRenderContext): Promise<PreviewRendered> {
  context.signal.throwIfAborted();
  if (snapshot.bytes.byteLength > sheetLimits.bytes) throw new MaterialPreviewError("limit", "表格超过 16 MiB 的本次读取边界，原文件保留。");
  const name = fileName(snapshot.target.path).toLowerCase();
  const missing = name.endsWith(".xlsx") ? missingFormulaCaches(await verifyPreviewArchive(snapshot.bytes, context.signal)) : new Map<string, Set<string>>();
  let book: XLSX.WorkBook;
  try {book = XLSX.read(name.endsWith(".csv") ? decodePreviewText(snapshot.bytes) : snapshot.bytes, {type: name.endsWith(".csv") ? "string" : "array", sheetRows: sheetLimits.parsedRows, cellFormula: true, cellText: true, cellHTML: false, bookVBA: false});}
  catch (error) {throw new MaterialPreviewError("damaged", /password|encrypted/i.test(String(error)) ? "此表格已加密，需先解密原件。" : "表格结构损坏或暂不可读取，原文件保留。");}
  context.signal.throwIfAborted(); if (!book.SheetNames.length) throw new MaterialPreviewError("damaged", "此表格没有可读工作表。");
  if (book.SheetNames.length > sheetLimits.sheets) throw new MaterialPreviewError("limit", "表格超过 128 个工作表的预览边界，原文件保留。");
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet || (sheet["!merges"]?.length ?? 0) > sheetLimits.merges) throw new MaterialPreviewError("limit", "工作表的合并区域超过本次读取边界，原文件保留。");
    if (sheet["!ref"]) {
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      if (![range.s.r, range.s.c, range.e.r, range.e.c].every(Number.isSafeInteger) || range.s.r < 0 || range.s.c < 0 || range.e.r < range.s.r || range.e.c < range.s.c || range.e.r >= sheetLimits.parsedRows || range.e.c >= 16384) throw new MaterialPreviewError("limit", "工作表的行列范围超过本次读取边界，原文件保留。");
    }
  }
  const root = document.createElement("section"), tools = document.createElement("div"), sheets = document.createElement("select"), viewport = document.createElement("div"), position = document.createElement("span"), notice = document.createElement("p");
  root.className = "wb-preview-sheet"; tools.className = "wb-preview-tools"; viewport.className = "wb-preview-sheet-surface"; notice.className = "wb-preview-notice";
  sheets.setAttribute("aria-label", "工作表"); position.setAttribute("role", "status");
  for (const name of book.SheetNames) {const option = document.createElement("option"); option.value = name; option.textContent = name; sheets.append(option);}
  let rowPage = 0, columnPage = 0, complete = true; const notices: string[] = [];
  const control = (text: string, action: () => void) => {const item = document.createElement("button"); item.type = "button"; item.textContent = text; item.onclick = () => {if (!context.signal.aborted) action();}; return item;};
  const priorRows = control("上一页", () => {rowPage = Math.max(0, rowPage - 1); show();}), nextRows = control("下一页", () => {rowPage++; show();});
  const priorColumns = control("← 列", () => {columnPage = Math.max(0, columnPage - 1); show();}), nextColumns = control("列 →", () => {columnPage++; show();});
  tools.append(sheets, priorRows, nextRows, priorColumns, nextColumns, position); root.append(tools, notice, viewport);
  const show = () => {
    context.signal.throwIfAborted();
    const sheet = book.Sheets[sheets.value]!; viewport.replaceChildren(); notice.textContent = "";
    if (!sheet["!ref"]) {viewport.textContent = "空工作表"; position.textContent = ""; priorRows.disabled = nextRows.disabled = priorColumns.disabled = nextColumns.disabled = true; return;}
    const range = XLSX.utils.decode_range(sheet["!ref"]), totalRows = range.e.r + 1, totalColumns = range.e.c + 1;
    rowPage = Math.min(rowPage, Math.floor(range.e.r / sheetLimits.rowsPerPage)); columnPage = Math.min(columnPage, Math.floor(range.e.c / sheetLimits.columnsPerPage));
    const firstRow = rowPage * sheetLimits.rowsPerPage, lastRow = Math.min(firstRow + sheetLimits.rowsPerPage - 1, range.e.r), firstColumn = columnPage * sheetLimits.columnsPerPage, lastColumn = Math.min(firstColumn + sheetLimits.columnsPerPage - 1, range.e.c);
    const pageNotices: string[] = [];
    if (sheet["!fullref"] && sheet["!fullref"] !== sheet["!ref"]) pageNotices.push(`此工作表仅解析前 ${sheetLimits.parsedRows} 行，后续行需在原应用核对。`);
    const table = document.createElement("table"), head = document.createElement("thead"), headings = document.createElement("tr"), body = document.createElement("tbody");
    headings.append(document.createElement("th")); for (let column = firstColumn; column <= lastColumn; column++) {const th = document.createElement("th"); th.textContent = XLSX.utils.encode_col(column); th.scope = "col"; headings.append(th);} head.append(headings); table.append(head, body);
    const merges = sheet["!merges"] ?? [];
    for (let row = firstRow; row <= lastRow; row++) {
      const tr = document.createElement("tr"), label = document.createElement("th"); label.textContent = String(row + 1); label.scope = "row"; tr.append(label);
      for (let column = firstColumn; column <= lastColumn; column++) {
        const merge = merges.find(area => row >= area.s.r && row <= area.e.r && column >= area.s.c && column <= area.e.c);
        if (merge && (row !== Math.max(merge.s.r, firstRow) || column !== Math.max(merge.s.c, firstColumn))) continue;
        const td = document.createElement("td"), address = XLSX.utils.encode_cell(merge ? merge.s : {r: row, c: column}), cell = sheet[address] as XLSX.CellObject | undefined;
        td.dataset.cell = address; td.title = address;
        if (merge) {td.rowSpan = Math.min(merge.e.r, lastRow) - Math.max(merge.s.r, firstRow) + 1; td.colSpan = Math.min(merge.e.c, lastColumn) - Math.max(merge.s.c, firstColumn) + 1; if (merge.s.r < firstRow || merge.s.c < firstColumn || merge.e.r > lastRow || merge.e.c > lastColumn) pageNotices.push("跨当前视图的合并区域显示本页部分，可翻页继续。");}
        if (missing.get(sheets.value)?.has(address) || cell?.f && cell.v === undefined) {td.textContent = "未保存公式结果"; pageNotices.push("部分公式没有已保存值；预览不重新计算公式。");}
        else if (cell) td.textContent = cell.w ?? (cell.v === undefined ? "" : String(cell.v));
        tr.append(td);
      }
      body.append(tr);
    }
    viewport.append(table); position.textContent = `${firstRow + 1}–${lastRow + 1} / ${totalRows} 行 · ${XLSX.utils.encode_col(firstColumn)}–${XLSX.utils.encode_col(lastColumn)} / ${totalColumns} 列`;
    priorRows.disabled = firstRow === 0; nextRows.disabled = lastRow === range.e.r; priorColumns.disabled = firstColumn === 0; nextColumns.disabled = lastColumn === range.e.c;
    if (pageNotices.length) {complete = false; for (const value of pageNotices) if (!notices.includes(value)) notices.push(value); notice.textContent = [...new Set(pageNotices)].join(" ");}
  };
  sheets.onchange = () => {rowPage = columnPage = 0; if (!context.signal.aborted) show();}; show();
  return {element: root, get complete() {return complete;}, notices, dispose: () => {root.remove(); book.Sheets = {};}};
}
