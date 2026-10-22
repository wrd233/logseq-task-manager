import type { BlockSnapshot, SourceSnapshot } from '../../workspace/source-protocol.ts';
import { composeDiff } from '../stage-workbench/diff.ts';
import type { ReviewChange } from '../work-view/review-port.ts';
import type { StageHistory, StageRevision } from '../stage-workbench/protocol.ts';

export type HistoryPoint = {id:string; stageId:string; goal:string; at:string; source:SourceSnapshot; parent:string|null; accepted:boolean; problems:string[]; revision:StageRevision|null};
export type StructureChange = '新增'|'删除'|'重命名'|'描述变化'|'移动归属'|'顺序变化'|'状态变化'|'依赖变化'|'深度变化'|'未知';
export type StructureNode = {id:string; block:BlockSnapshot; before:BlockSnapshot|null; changes:StructureChange[]; deleted:boolean; slot:number; status:string|null; dependencies:string[]; diff:ReviewChange|null; absentUnknown?:boolean};
/** Input must come from StageStore.history: only verified selected revision chains, never candidates. */
export function historyPoints(history:StageHistory):HistoryPoint[]{
  const ordered:StageHistory['stages']=[],visited=new Set<string>();
  const visit=(stage:StageHistory['stages'][number])=>{
    if(visited.has(stage.start.id))return;visited.add(stage.start.id);
    const parent=history.stages.find(s=>s.start.id===stage.start.previousStageId);if(parent)visit(parent);
    ordered.push(stage);
  };
  for(const stage of [...history.stages].sort((a,b)=>a.start.id.localeCompare(b.start.id)))visit(stage);
  return ordered.flatMap(stage=>[
    {id:stage.start.id,stageId:stage.start.id,goal:stage.start.goal,at:stage.start.at,source:stage.start.source,parent:null,accepted:false,revision:null,problems:[...history.problems,...stage.problems,...(stage.candidates.length?[`未采纳候选 ${stage.candidates.length} 条，未纳入回放。`]:[])]},
    ...stage.revisions.map(r=>({id:r.id,stageId:stage.start.id,goal:stage.start.goal,at:r.at,source:r.source,parent:r.parent,accepted:stage.acceptances.some(a=>a.revisionId===r.id),revision:r,problems:[...history.problems,...stage.problems,...(stage.candidates.length?[`未采纳候选 ${stage.candidates.length} 条，未纳入回放。`]:[])]})),
  ]);
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
  // composeDiff owns body/position comparison (including ancestor-induced depth).
  const diff=previous?composeDiff(previous.source,point.source,point.revision):new Map<string,ReviewChange>();
  for(const [id,change] of diff)if(change.problem)notices.push(`来源 ${id} 的写回结果未知或有问题：${change.problem}`);
  const nodes:StructureNode[]=point.source.blocks.map(block=>{
    const before=old.get(block.sourceId)??null,changes:StructureChange[]=[],a=annotations(block),change=diff.get(block.target.blockUuid)??null;
    if(block.availability!=='available'||before&&before.availability!=='available')changes.push('未知');
    if(!before&&comparable)changes.push('新增');
    if(before&&change){
      if(change.location){
        if(change.location.before.parentUuid!==change.location.after.parentUuid)changes.push('移动归属');
        if(change.location.before.order!==change.location.after.order)changes.push('顺序变化');
        if(change.location.before.depth!==change.location.after.depth)changes.push('深度变化');
      }
      if(change.kind==='modified'&&block.availability==='available'&&before.availability==='available'){
        // Additional source labels only; composeDiff decides whether body changed.
        if(block.content?.split('\n')[0]!==before.content?.split('\n')[0])changes.push('重命名');
        changes.push('描述变化');
        const b=annotations(before);if(a.status!==b.status)changes.push('状态变化');if(JSON.stringify(a.dependencies)!==JSON.stringify(b.dependencies))changes.push('依赖变化');
      }
    }
    return {id:block.sourceId,block,before,changes,deleted:false,slot:slots.get(block.sourceId)!,diff:change,...a};
  });
  if(previous)for(const block of previous.source.blocks)if(!current.has(block.sourceId))nodes.push({id:block.sourceId,block,before:block,changes:[comparable?'删除':'未知'],deleted:comparable,absentUnknown:!comparable,slot:slots.get(block.sourceId)!,diff:diff.get(block.target.blockUuid)??null,...annotations(block)});
  return {nodes,notices,point};
}
