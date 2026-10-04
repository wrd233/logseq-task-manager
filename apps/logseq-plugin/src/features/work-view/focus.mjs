import {extractObjectNavigationLabel} from '../../canonical-writing.ts';
// Navigation labels are presentation, never proof of formal identity.
export function workObject(content='') {
  const label=extractObjectNavigationLabel(String(content));
  return label?{type:label.kind==='TASK'?'task':'miniproject',title:label.title}:null;
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
