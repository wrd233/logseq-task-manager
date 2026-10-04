import type { BlockSnapshot, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { ReviewChange } from "../work-view/review-port.ts";
import type { StageRevision } from "./protocol.ts";

/** Bounded, deterministic single changed span. Complex syntax and ambiguous repeats stay block-level. */
export function inlineDiff(before:string,after:string):ReviewChange["inline"]{
  if(before.length+after.length>12000||/[\x60*_#[\]<>|]|^\s*(?:[-+>] |\d+\. |\w+::)/m.test(before+after))return null;
  const a=Array.from(before),b=Array.from(after);let start=0,end=0;
  while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  const removed=a.slice(start,a.length-end).join(""),inserted=b.slice(start,b.length-end).join("");
  if(removed&&before.indexOf(removed)!==before.lastIndexOf(removed)||inserted&&after.indexOf(inserted)!==after.lastIndexOf(inserted))return null;
  return {prefix:b.slice(0,start).join(""),inserted,suffix:b.slice(b.length-end).join("")};
}
export function attribution(block:BlockSnapshot,revision:StageRevision|null,structure=false):string{
  if(!revision)return "来源未知 / 间隔变化";
  const matches=revision.facts.flatMap(result=>result.record.items.map(fact=>({result,fact}))).filter(({result,fact})=>
    result.durable&&fact.status==="APPLIED_VERIFIED"&&fact.contentVerified&&(fact.childUuid??fact.target.blockUuid)===block.target.blockUuid&&fact.actualVersion===block.contentVersion);
  const valid=matches.filter(({fact})=>{
    if(!structure)return fact.type!=="move-block" || fact.move?.verified;
    if(fact.type!=="move-block" || !fact.move?.verified)return false;
    const actual=fact.move.after?.blocks.find(b=>b.sourceId===block.sourceId);
    return actual?.parentUuid===block.parentUuid && actual?.order===block.order && actual?.depth===block.depth;
  });
  if(!valid.length)return "来源未知 / 人工间隔变化";
  const origin=valid.at(-1)!.result.record.origin;
  return origin.kind==="local-user-command"?"本地用户操作":"程序调用 · 实际作者未知";
}
export function composeDiff(before:SourceSnapshot,after:SourceSnapshot,revision:StageRevision|null):Map<string,ReviewChange>{
  const changes=new Map<string,ReviewChange>(),old=new Map(before.blocks.map(b=>[b.sourceId,b]));
  for(const block of after.blocks){
    const prior=old.get(block.sourceId);old.delete(block.sourceId);
    const structural=prior&&(prior.parentUuid!==block.parentUuid||prior.order!==block.order||prior.depth!==block.depth);
    const body=(content:string|null)=>content?.replace(/^\s*id::[^\n]*(?:\n|$)/gm,"")??null;
    const textChanged=prior&&body(prior.content)!==body(block.content);
    if(!prior||textChanged||structural){
      const kind=!prior?"added":textChanged?"modified":"structure";
      changes.set(block.target.blockUuid,{kind,before:prior?.content??null,after:block.content,version:block.contentVersion,label:`${{added:"新增",modified:"修改",structure:"结构变化"}[kind]} · ${attribution(block,revision,kind==="structure")}`,problem:block.availability!=="available"?"来源当时不可用":null,location:structural?{before:{parentUuid:prior.parentUuid,order:prior.order,depth:prior.depth},after:{parentUuid:block.parentUuid,order:block.order,depth:block.depth}}:null,inline:prior?.content!==null&&prior?.content!==undefined&&block.content!==null?inlineDiff(body(prior.content)!,body(block.content)!):null});
    }
  }
  for(const block of old.values())changes.set(block.target.blockUuid,{kind:"removed",before:block.content,after:null,version:null,label:"块已缺失 · 来源未知",problem:null,inline:null});
  if(revision)for(const result of revision.facts)for(const fact of result.record.items){
    const id=fact.childUuid??fact.target.blockUuid;
    if(fact.status!=="APPLIED_VERIFIED"&&fact.status!=="NO_CHANGE"||!result.durable||fact.identity?.status==="OUTCOME_UNKNOWN"){
      const message=[fact.status,fact.reason,fact.identity?.problem,result.journalProblem].filter(Boolean).join(" · ");
      const existing=changes.get(id);
      if(existing)existing.problem=message;
      else changes.set(id,{kind:"problem",before:fact.baseContent,after:fact.currentContent,version:fact.currentVersion,label:"写回问题",problem:message,inline:null});
    }
  }
  return changes;
}

/** Current SDK rows can reveal a later move even when the bytes/version match.
 * This is a reading annotation, never a fabricated snapshot or stage revision. */
export function observePositions(changes:Map<string,ReviewChange>,source:SourceSnapshot,rows:readonly {uuid:string;sourceParent?:string|null;depth:number;content:string;outside?:boolean;missing?:boolean}[]):void{
  const siblings=new Map<string|null,number>();
  for(const row of rows){
    if(row.outside||row.missing)continue;
    const parent=row.sourceParent??null,order=siblings.get(parent)??0;siblings.set(parent,order+1);
    if(row.uuid===source.scope.rootUuid)continue;
    const submitted=source.blocks.find(b=>b.target.blockUuid===row.uuid);if(!submitted)continue;
    if(submitted.parentUuid===parent&&submitted.order===order&&submitted.depth===row.depth)continue;
    const location={before:{parentUuid:submitted.parentUuid,order:submitted.order,depth:submitted.depth},after:{parentUuid:parent,order,depth:row.depth}};
    const prior=changes.get(row.uuid);
    changes.set(row.uuid,{kind:prior?.kind??"structure",before:prior?.before??submitted.content,after:prior?.after??row.content,version:prior?.version??null,inline:prior?.inline??null,problem:prior?.problem??null,location,label:"原块已再次移动 · 来源未知 / 人工间隔变化"});
  }
}
