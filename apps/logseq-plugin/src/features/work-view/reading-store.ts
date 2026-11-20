import type { SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { ReadingPlan } from "./reading-plan.ts";
import type { ReadingMaterial } from "./reading-layout.ts";
import { pageWorkIds,samePageWork } from "../../workspace/page-identity.ts";

export interface SavedReadingView { plan:ReadingPlan; revision:number; previous?:ReadingPlan; basis?:SourceSnapshot|undefined; previousBasis?:SourceSnapshot|undefined; materialBasis?:ReadingMaterial[]|undefined; previousMaterialBasis?:ReadingMaterial[]|undefined }
export interface SavedReadingCandidate {plan:ReadingPlan; baseRevision:number; basis:SourceSnapshot; materialBasis:ReadingMaterial[]}
export interface SavedReadingViews { schemaVersion:1; mode:"report"|"structure"; selected:string|null; views:SavedReadingView[]; candidate?:SavedReadingCandidate }
export interface ReadingStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }
export class ReadingViewStore {
  constructor(private readonly storage:ReadingStorage) {}
  private key(scope:SourceScope):string {return `workbench:reading-views:${JSON.stringify([scope.graphId,scope.rootUuid,scope.kind??"block",scope.pageName??null])}`;}
  load(scope:SourceScope):SavedReadingViews|null {
    try {const ids=pageWorkIds(scope,this.storage);
      const raw=[scope.rootUuid,...ids.slice().reverse()].map(rootUuid=>this.storage.getItem(this.key({...scope,rootUuid}))).find(value=>value!==null);
      if(!raw)return null;const value=JSON.parse(raw) as SavedReadingViews;
      return value.schemaVersion===1&&Array.isArray(value.views)?value:null;
    }catch{return null;}
  }
  save(scope:SourceScope,value:SavedReadingViews):void {this.storage.setItem(this.key(scope),JSON.stringify(value));}
}

/** Identical file-Graph page reindex: reattach the article's citations to the
 * new native IDs only after checking the entire saved ordered tree. The old
 * UUID-keyed record on disk is retained. Changed or ambiguous trees keep
 * their historical basis and must be reviewed, never guessed block by block. */
export function reindexReadingPlan(plan:ReadingPlan,basis:SourceSnapshot|undefined,current:SourceSnapshot):{plan:ReadingPlan;basis:SourceSnapshot}|null{
  if(!basis||!samePageWork(basis.scope,current.scope)||basis.scope.rootUuid===current.scope.rootUuid||
    basis.page?.availability!=="available"||current.page?.availability!=="available"||
    basis.blocks.length!==current.blocks.length||!basis.blocks.every((old,i)=>{
      const now=current.blocks[i]!;
      return old.availability==="available"&&now.availability==="available"&&old.contentVersion===now.contentVersion&&old.content===now.content&&old.depth===now.depth&&old.order===now.order;
    }))return null;
  const mapping=new Map(basis.blocks.map((block,i)=>[block.sourceId,current.blocks[i]!.sourceId]));
  const remap=(ids:string[])=>ids.map(id=>mapping.get(id)??id);
  const layout=(units:ReadingPlan["layout"]):ReadingPlan["layout"]=>units.map(unit=>{
    if(unit.kind==="sequence"||unit.kind==="paragraphs")return {...unit,sourceIds:remap(unit.sourceIds)};
    if(unit.kind==="group")return {...unit,children:layout(unit.children)};
    if(unit.kind==="comparison")return {...unit,columns:unit.columns.map(column=>({...column,children:layout(column.children)}))};
    return unit;
  });
  const next:ReadingPlan={...plan,scope:current.scope,structureVersion:current.structureVersion,sourceSetVersion:current.sourceSetVersion,
    sourceVersions:plan.sourceVersions.map(version=>({...version,sourceId:mapping.get(version.sourceId)??version.sourceId})),layout:layout(plan.layout)};
  if(plan.briefing){
    const paragraphs=(items:typeof plan.briefing.paragraphs)=>items.map(item=>({...item,sourceIds:remap(item.sourceIds),...(item.details?{details:item.details.map(detail=>({...detail,sourceIds:remap(detail.sourceIds)}))}:{})}));
    next.briefing={...plan.briefing,basisVersion:current.sourceSetVersion,paragraphs:paragraphs(plan.briefing.paragraphs),...(plan.briefing.followUps?{followUps:paragraphs(plan.briefing.followUps)}:{})};
  }
  return {plan:next,basis:{...structuredClone(current),capturedAt:basis.capturedAt}};
}
