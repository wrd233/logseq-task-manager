// Work objects are a small, explicit vocabulary. Rendering labels are independent.
export function workObject(content='') {
  const first=String(content).split('\n')[0].trim().replace(/^(TODO|DONE|DOING|NOW|LATER|WAITING|CANCELED|CANCELLED)\s+/, '');
  const task=/^\*\*\[(事务|事项|任务)\]\*\*/.exec(first);
  if(task)return {type:'task',title:first.slice(task[0].length).trim()||task[1]};
  const mini=/^\*\*\[MiniProject\]\*\*/.exec(first);
  if(mini&&/(?:^|\s)#MiniProject(?=\s|$)/.test(first.slice(mini[0].length)))
    return {type:'miniproject',title:first.slice(mini[0].length).replace(/(?:^|\s)#MiniProject(?=\s|$)/g,'').trim()||'MiniProject'};
  return null;
}
// Source parent IDs only. An unmarked block is traversable, never an object crumb.
export async function ancestry(uuid,getBlock,{limit=256,resolve}={}) {
  const path=[],objects=[],seen=new Set();let id=uuid;
  while(id!=null){
    const b=await getBlock(id);
    if(!b){return {path,objects:objects.reverse(),complete:false};}
    // Logseq may return a page entity for a block's parent.
    if(typeof b.content!=='string')break;
    if(!b.uuid||seen.has(b.uuid)||path.length>=limit)return {path,objects:objects.reverse(),complete:false};
    seen.add(b.uuid);path.push(b.uuid);
    const o=resolve?.(b.uuid,b.content)??workObject(b.content);if(o)objects.push({uuid:b.uuid,...o});
    id=b.parent?.id??b.parent?.uuid??null;
    if(id!=null&&id===b.page?.id)break;
  }
  return {path,objects:objects.reverse(),complete:true};
}
export function clickDecision(state,trace) {
  if(!trace.complete)return {action:'keep',reason:'ancestry-incomplete'};
  if(state.held&&trace.path.includes(state.root))return {action:'keep',reason:'inside-held-scope'};
  const nearest=trace.objects.at(-1);
  if(!nearest)return {action:'keep',reason:'no-work-object',release:!!state.held};
  return {action:'focus',uuid:nearest.uuid,held:null,reason:'nearest-object'};
}
// Initial presentation trial: sort only direct child subtrees of the selected object.
// Ordinary prose and nested objects are anchors; never move content across these boundaries.
export function continuingLayout(source,parse) {
  if(!source.length)return [];
  const out=[{uuid:source[0].uuid,depth:0}],groups=[];
  for(let i=1;i<source.length;){let end=i+1;while(end<source.length&&source[end].depth>source[i].depth)end++;
    groups.push(source.slice(i,end));i=end;}
  const rank=g=>{if(workObject(g[0].content))return null;const p=parse(g[0].content);
    if(p.role==='现状')return 0;if(p.task&&!['DONE','CANCELED'].includes(p.task))return 1;
    if(p.role==='问一下')return 2;if(p.role==='注')return 3;if(p.role==='想法')return 4;return null;};
  let run=[];const flush=()=>{run.sort((a,b)=>rank(a)-rank(b));for(const g of run)out.push(...g.map(({uuid,depth})=>({uuid,depth})));run=[];};
  for(const g of groups){if(rank(g)==null){flush();out.push(...g.map(({uuid,depth})=>({uuid,depth})))}else run.push(g)}flush();return out;
}
