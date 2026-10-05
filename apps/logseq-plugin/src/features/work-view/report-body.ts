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
