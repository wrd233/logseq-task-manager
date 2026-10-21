import type { BlockSnapshot, SourceSnapshot } from '../../workspace/source-protocol.ts';
import type { StageHistory } from './protocol.ts';

export type HistoryPoint = {id:string; stageId:string; goal:string; at:string; source:SourceSnapshot; parent:string|null; accepted:boolean; problems:string[]};
export type StructureChange = '新增'|'删除'|'重命名'|'描述变化'|'移动归属'|'顺序变化'|'状态变化'|'依赖变化'|'未知';
export type StructureNode = {id:string; block:BlockSnapshot; before:BlockSnapshot|null; changes:StructureChange[]; deleted:boolean; slot:number; status:string|null; dependencies:string[]};
/** Input must come from StageStore.history: only verified selected revision chains, never candidates. */
export function historyPoints(history:StageHistory):HistoryPoint[]{
  return history.stages.flatMap(stage=>[
    {id:stage.start.id,stageId:stage.start.id,goal:stage.start.goal,at:stage.start.at,source:stage.start.source,parent:null,accepted:false,problems:[...history.problems,...stage.problems]},
    ...stage.revisions.map(r=>({id:r.id,stageId:stage.start.id,goal:stage.start.goal,at:r.at,source:r.source,parent:r.parent,accepted:stage.acceptances.some(a=>a.revisionId===r.id),problems:[...history.problems,...stage.problems]})),
  ]).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
}
// These are literal Logseq source annotations, not Kernel status/dependency facts.
export function annotations(block:BlockSnapshot):{status:string|null;dependencies:string[]}{
  const text=block.content??'';
  const status=/^(?:#{1,6}\s+)?(TODO|DOING|DONE|NOW|LATER|WAITING|CANCELED|CANCELLED)\b/u.exec(text)?.[1]??null;
  const line=/^depends-on::[ \t]*(.*)$/mu.exec(text)?.[1]??'';
  return {status,dependencies:[...new Set([...line.matchAll(/\(\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\)/giu)].map(m=>m[1]!.toLowerCase()))].sort()};
}
export function structureFrame(points:readonly HistoryPoint[],index:number):{nodes:StructureNode[];notices:string[];point:HistoryPoint|null}{
  const point=points[index];if(!point)return {nodes:[],notices:['尚无经过校验的历史快照。'],point:null};
  const previous=point.parent?points.find(p=>p.id===point.parent&&p.stageId===point.stageId):null;
  const notices=[...point.problems,'仅展示离散快照；快照之间的变化过程与最早快照以前的历史未知。','来源：Logseq 阶段原文快照；不包含 Kernel 正式工作对象历史或代码结构。','状态取自原文任务标记，依赖仅取自 depends-on:: 中的块引用；未标记不代表没有状态或依赖。'];
  if(!previous)notices.push(point.parent?'父修订缺失；无法比较，不推断新增或删除。':'此为阶段起点；不跨阶段推断新增或删除。');
  const complete=(s:SourceSnapshot)=>s.blocks.every(b=>b.availability==='available');
  const comparable=!!previous&&complete(previous.source)&&complete(point.source);
  if(previous&&!comparable)notices.push('前后快照存在不可用原文；缺失节点不能判定为新增或删除。');
  const slots=new Map<string,number>();for(const p of points)for(const b of p.source.blocks)if(!slots.has(b.sourceId))slots.set(b.sourceId,slots.size);
  const old=new Map(previous?.source.blocks.map(b=>[b.sourceId,b])??[]),current=new Map(point.source.blocks.map(b=>[b.sourceId,b]));
  const nodes:StructureNode[]=point.source.blocks.map(block=>{
    const before=old.get(block.sourceId)??null,changes:StructureChange[]=[],a=annotations(block);
    if(block.availability!=='available'||before&&before.availability!=='available')changes.push('未知');
    else if(!before&&comparable)changes.push('新增');
    else if(before){
      if(block.parentUuid!==before.parentUuid)changes.push('移动归属');
      if(block.order!==before.order)changes.push('顺序变化');
      if(block.content!==before.content){
        if(block.content?.split('\n')[0]!==before.content?.split('\n')[0])changes.push('重命名');
        if(block.content?.split('\n').slice(1).join('\n')!==before.content?.split('\n').slice(1).join('\n'))changes.push('描述变化');
        const b=annotations(before);if(a.status!==b.status)changes.push('状态变化');if(JSON.stringify(a.dependencies)!==JSON.stringify(b.dependencies))changes.push('依赖变化');
      }
    }
    return {id:block.sourceId,block,before,changes,deleted:false,slot:slots.get(block.sourceId)!,...a};
  });
  if(comparable)for(const block of previous!.source.blocks)if(!current.has(block.sourceId))nodes.push({id:block.sourceId,block,before:block,changes:['删除'],deleted:true,slot:slots.get(block.sourceId)!,...annotations(block)});
  return {nodes,notices,point};
}
