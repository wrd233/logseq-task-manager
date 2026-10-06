/** Display-only removal of host identity properties. Literal code/quotes/indented examples retain every line. */
export function reportMarkdown(content: string): string {
  let fence: {mark: string; length: number} | null=null;
  return content.split(/(?<=\n)/u).filter(line=>{
    const text=line.replace(/\r?\n$/u,"");
    const delimiter=/^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(text);
    if(fence){
      if(delimiter?.[1]?.[0]===fence.mark&&delimiter[1].length>=fence.length&&!delimiter[2]!.trim())fence=null;
      return true;
    }
    if(delimiter){fence={mark:delimiter[1]![0]!,length:delimiter[1]!.length};return true;}
    return !/^ {0,3}id::(?:\s|$)/u.test(text);
  }).join("");
}

export type ReportMarker = "goal" | "idea" | "note" | "record" | "question" | "object";
export interface ReportProjection {
  raw: string; markdown: string; marker: ReportMarker | null; label: string | null; task: string | null;
  removed: Array<{start: number; end: number; text: string}>;
}
const semantics: Record<string, {marker: ReportMarker; label: string}> = {
  目标:{marker:"goal",label:"目标"}, 想法:{marker:"idea",label:"思考"}, 注:{marker:"note",label:"说明"},
  说明:{marker:"note",label:"说明"}, 记录:{marker:"record",label:"记录"}, 问题:{marker:"question",label:"问题"},
  事务:{marker:"object",label:"事务"}, 任务:{marker:"object",label:"任务"}, MiniProject:{marker:"object",label:"MiniProject"},
};

/** Only the first actual prose line is projected. All offsets refer to immutable raw content. */
export function reportProjection(raw: string): ReportProjection {
  const result: ReportProjection = {raw, markdown:reportMarkdown(raw), marker:null, label:null, task:null, removed:[]};
  let offset = 0;
  for (const line of raw.split(/(?<=\n)/u)) {
    const text = line.replace(/\r?\n$/u, "");
    if (!text.trim() || /^ {0,3}[\w-]+::(?:\s|$)/u.test(text)) { offset += line.length; continue; }
    // Four-space/tab indentation, quotes, fences, inline code and Markdown links are literal.
    const indentation = /^ {0,3}(?=\S)/u.exec(text); if (!indentation) return result;
    let at = indentation[0].length;
    const task = /^(TODO|DONE|DOING|NOW|LATER|WAITING|CANCELED|CANCELLED)(?=\s|$)/u.exec(text.slice(at));
    if (task) {
      result.task = task[0]; const token=task[0]+/^[ \t]*/u.exec(text.slice(at+task[0].length))![0];
      result.removed.push({start:offset+at,end:offset+at+token.length,text:token}); at+=token.length;
    }
    const mark = /^(?:\*\*\[(目标|想法|注|说明|记录|问题|事务|任务|MiniProject)\]\*\*|\[(目标|想法|注|说明|记录|问题|事务|任务|MiniProject)\])(?=\s|$|[：:])/u.exec(text.slice(at));
    if (mark) {
      const semantic = semantics[mark[1] ?? mark[2]!]!;
      result.marker = semantic.marker; result.label = semantic.label;
      const token=mark[0]+/^[ \t]*/u.exec(text.slice(at+mark[0].length))![0];
      result.removed.push({start:offset+at,end:offset+at+token.length,text:token});
    }
    let projected = raw;
    for (const span of [...result.removed].reverse()) projected = projected.slice(0,span.start)+projected.slice(span.end);
    result.markdown = reportMarkdown(projected); return result;
  }
  return result;
}
