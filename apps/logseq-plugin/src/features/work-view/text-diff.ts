export type TextHunk = {beforeStart:number; beforeEnd:number; afterStart:number; afterEnd:number};

/** Bounded shortest edit script on code points; ranges describe display text only. */
export function textHunks(before:string, after:string):TextHunk[] | null {
  if (before === after) return [];
  if (before.length + after.length > 60000) return null;
  const a = Array.from(before), b = Array.from(after);
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length-prefix && suffix < b.length-prefix && a[a.length-1-suffix] === b[b.length-1-suffix]) suffix++;
  const old = a.slice(prefix,a.length-suffix), next = b.slice(prefix,b.length-suffix);
  const trace:Array<Map<number,number>> = [], frontier = new Map([[1,0]]);
  let distance:number | null = null;
  for (let d=0; d<=Math.min(256,old.length+next.length); d++) {
    trace.push(new Map(frontier));
    for (let k=-d; k<=d; k+=2) {
      let x = k===-d || k!==d && (frontier.get(k-1)??-1) < (frontier.get(k+1)??-1)
        ? frontier.get(k+1)??0 : (frontier.get(k-1)??0)+1;
      let y = x-k;
      while (x<old.length && y<next.length && old[x]===next[y]) { x++; y++; }
      frontier.set(k,x);
      if (x>=old.length && y>=next.length) { distance=d; break; }
    }
    if (distance!==null) break;
  }
  if (distance===null) return null;
  const edits:Array<"equal"|"insert"|"delete"> = [];
  let x=old.length, y=next.length;
  for (let d=distance; d>=0; d--) {
    const v=trace[d]!, k=x-y;
    const previous=k===-d || k!==d && (v.get(k-1)??-1)<(v.get(k+1)??-1) ? k+1 : k-1;
    const px=v.get(previous)??0, py=px-previous;
    while (x>px && y>py) { edits.push("equal"); x--; y--; }
    if (d>0) { if (x===px) { edits.push("insert"); y--; } else { edits.push("delete"); x--; } }
  }
  edits.reverse();
  let ai=a.slice(0,prefix).join("").length, bi=ai;
  let ac=prefix, bc=prefix, active:TextHunk | null=null;
  const hunks:TextHunk[]=[];
  for (const edit of edits) {
    if (edit==="equal") {
      if (active) { hunks.push(active); active=null; }
      ai+=a[ac++]!.length; bi+=b[bc++]!.length;
    } else {
      active??={beforeStart:ai,beforeEnd:ai,afterStart:bi,afterEnd:bi};
      if (edit==="delete") ai+=a[ac++]!.length;
      else bi+=b[bc++]!.length;
      active.beforeEnd=ai; active.afterEnd=bi;
    }
  }
  if (active) hunks.push(active);
  return hunks;
}
