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
