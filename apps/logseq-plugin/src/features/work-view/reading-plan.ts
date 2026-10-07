import { scopeOf, type BlockSnapshot, type SourceScope, type SourceSnapshot } from "../../workspace/source-protocol.ts";
import { lensArray, lensHash, lensRecord, lensText, requireLens } from "./lens-input.ts";
import { sameLensScope } from "./lens-source.ts";
import { reportCategory } from "./report-model.ts";
import { workObject } from "./focus.mjs";

/** A closed reading vocabulary. Bodies, styles, executable markup and authority
 * never travel in a layout. The plugin supplies source text and material views. */
export type ReadingUnit =
  | {kind:"sequence"; key:string; sourceIds:string[]}
  | {kind:"paragraphs"; key:string; sourceIds:string[]}
  | {kind:"group"; key:string; title:string; children:ReadingUnit[]}
  | {kind:"comparison"; key:string; title:string; columns:Array<{key:string; title:string; children:ReadingUnit[]}>}
  | {kind:"material"; key:string; materialId:string};
export interface ReadingPlan {
  schemaVersion:1; requestId:string; planId:string; name:string; scope:SourceScope;
  structureVersion:string; sourceSetVersion:string;
  sourceVersions:Array<{sourceId:string; contentVersion:string}>;
  layout:ReadingUnit[];
}
export interface ReadingHeading {
  key:string; title:string;
  /** Exact primary membership, separately from required source context. */
  sourceIds:string[]; contextSourceIds:string[];
}
export interface VerifiedReadingPlan {
  plan:ReadingPlan; basis:SourceSnapshot; primarySourceIds:string[];
  materialIds:string[];
  headings:ReadingHeading[]; contexts:ReadonlyMap<string,readonly string[]>;
}
const MAX_UNITS=2000, MAX_DEPTH=16, MAX_SOURCES=10_000;
const uncertain=/(?:可能|不过|但是|如果|除非|否则|尚未|还没|还需|未确定|未决定|目前偏向|待核|不代表)/u;
const certaintyClaim=/(?:已确定|已决定|最终结论|确定结论|已经完成|全部完成|成功完成)/u;
function text(value:unknown,limit:number):string {
  const result=lensText(value,limit);
  requireLens(![...result].some(c=>c.charCodeAt(0)<32),"invalid-text");
  return result;
}
export function decodeReadingPlan(input:unknown):ReadingPlan {
  const raw=lensRecord(input,["schemaVersion","requestId","planId","name","scope","structureVersion","sourceSetVersion","sourceVersions","layout"],"invalid-reading-plan");
  requireLens(raw.schemaVersion===1,"unsupported-reading-schema");
  const rawScope=lensRecord(raw.scope,["graphId","rootUuid","kind","pageName"]);
  let units=0,sources=0;const keys=new Set<string>();
  const key=(value:unknown):string=>{
    const result=text(value,128);requireLens(!keys.has(result),"duplicate-layout-key");keys.add(result);return result;
  };
  const children=(value:unknown,depth:number):ReadingUnit[]=>lensArray(value,MAX_UNITS,1).map(v=>unit(v,depth));
  const unit=(value:unknown,depth:number):ReadingUnit=>{
    requireLens(++units<=MAX_UNITS&&depth<=MAX_DEPTH,"reading-layout-too-large");
    const raw=lensRecord(value,["kind","key","sourceIds","title","children","columns","materialId"]);
    const id=key(raw.key);
    if(raw.kind==="sequence"||raw.kind==="paragraphs") {
      lensRecord(raw,["kind","key","sourceIds"]);
      const ids=lensArray(raw.sourceIds,MAX_SOURCES,1).map(id=>text(id,4096));
      sources+=ids.length;requireLens(sources<=MAX_SOURCES,"reading-layout-too-large");
      return raw.kind==="sequence"?{kind:"sequence",key:id,sourceIds:ids}:{kind:"paragraphs",key:id,sourceIds:ids};
    }
    if(raw.kind==="group") {
      lensRecord(raw,["kind","key","title","children"]);
      return {kind:"group",key:id,title:text(raw.title,120),children:children(raw.children,depth+1)};
    }
    if(raw.kind==="comparison") {
      lensRecord(raw,["kind","key","title","columns"]);
      const columns=lensArray(raw.columns,4,2).map(value=>{
        requireLens(++units<=MAX_UNITS,"reading-layout-too-large");
        const column=lensRecord(value,["key","title","children"]);
        return {key:key(column.key),title:text(column.title,120),children:children(column.children,depth+1)};
      });
      return {kind:"comparison",key:id,title:text(raw.title,120),columns};
    }
    requireLens(raw.kind==="material","unsupported-reading-unit");
    lensRecord(raw,["kind","key","materialId"]);
    return {kind:"material",key:id,materialId:text(raw.materialId,128)};
  };
  const plan:ReadingPlan={schemaVersion:1,requestId:text(raw.requestId,128),planId:text(raw.planId,128),name:text(raw.name,120),scope:scopeOf(rawScope),
    structureVersion:lensHash(raw.structureVersion),sourceSetVersion:lensHash(raw.sourceSetVersion),
    sourceVersions:lensArray(raw.sourceVersions,MAX_SOURCES).map(value=>{
      const version=lensRecord(value,["sourceId","contentVersion"]);
      return {sourceId:text(version.sourceId,4096),contentVersion:lensHash(version.contentVersion)};
    }),layout:lensArray(raw.layout,MAX_UNITS).map(value=>unit(value,0))};
  requireLens(new TextEncoder().encode(JSON.stringify(plan)).length<=1_048_576,"reading-plan-too-large");
  return plan;
}
function childrenOf(source:SourceSnapshot):Map<string|null,BlockSnapshot[]> {
  const children=new Map<string|null,BlockSnapshot[]>();
  for(const block of source.blocks) {
    const rows=children.get(block.parentUuid)??[];rows.push(block);children.set(block.parentUuid,rows);
  }
  return children;
}
/** Unknown adjacency stays fixed. Complete explicit category runs can move only
 * with their complete original-order neighborhood repeated as source context.
 * A label alone is never proof that two sentences are semantically independent. */
function safeOrder(source:SourceSnapshot,ordered:string[]):ReadonlyMap<string,readonly string[]> {
  const byUuid=new Map(source.blocks.map(b=>[b.target.blockUuid,b])),byId=new Map(source.blocks.map(b=>[b.sourceId,b])),children=childrenOf(source);
  const positions=new Map(ordered.map((id,index)=>[id,index]));
  const repairs=new Map<string,readonly string[]>();
  const indices=new Map(source.blocks.map((block,index)=>[block.sourceId,index]));
  const subtree=(block:BlockSnapshot):string[]=>{
    const from=indices.get(block.sourceId)!,ids=[block.sourceId];
    for(let at=from+1;at<source.blocks.length&&source.blocks[at]!.depth>block.depth;at++)ids.push(source.blocks[at]!.sourceId);
    return ids;
  };
  const ancestors:string[]=[];
  for(const id of ordered) {
    const block=byId.get(id)!;
    requireLens(block.depth<=ancestors.length,"reading-dependency-broken");
    requireLens(block.depth===0?source.page?block.parentUuid===source.page.pageUuid:block.target.blockUuid===source.scope.rootUuid:block.parentUuid===ancestors[block.depth-1],"reading-dependency-broken");
    ancestors.length=block.depth;ancestors.push(block.target.blockUuid);
  }
  for(const [parent,siblings] of children) {
    if(siblings.length<2)continue;
    const arranged=[...siblings].sort((a,b)=>positions.get(a.sourceId)!-positions.get(b.sourceId)!);
    const parentBlock=parent===null?undefined:byUuid.get(parent);
    if(!parentBlock||!workObject(parentBlock.content??"")) {
      requireLens(arranged.every((b,index)=>b.sourceId===siblings[index]!.sourceId),"reading-dependency-broken");continue;
    }
    const categories=siblings.map(b=>reportCategory(b.content??"")),fixed=new Set<number>();
    siblings.forEach((block,index)=>{
      if(categories[index]===null||uncertain.test(block.content??"")) {fixed.add(index-1);fixed.add(index);fixed.add(index+1);}
      if(categories[index]==="objects")fixed.add(index);
    });
    for(let index=0;index<siblings.length;) {
      if(fixed.has(index)) {
        requireLens(arranged[index]!.sourceId===siblings[index]!.sourceId,"reading-dependency-broken");index++;continue;
      }
      const from=index;while(index<siblings.length&&!fixed.has(index))index++;
      const original=siblings.slice(from,index),actual=arranged.slice(from,index);
      const actualIds=new Set(actual.map(b=>b.sourceId));
      requireLens(original.every(b=>actualIds.has(b.sourceId)),"reading-dependency-broken");
      for(const category of new Set(original.map(b=>reportCategory(b.content??"")))) {
        const expected=original.filter(b=>reportCategory(b.content??"")===category).map(b=>b.sourceId);
        const presented=actual.filter(b=>reportCategory(b.content??"")===category).map(b=>b.sourceId);
        requireLens(expected.every((id,i)=>presented[i]===id),"reading-dependency-broken");
      }
      if(actual.some((block,index)=>block.sourceId!==original[index]!.sourceId)) {
        const neighborhood=original.flatMap(subtree);
        for(const id of neighborhood)repairs.set(id,neighborhood);
      }
    }
  }
  return repairs;
}
/** Source sets always expand real identity, never text equality or display keys. */
export function readingSourceSet(source:SourceSnapshot,ids:readonly string[],includeContext=false):string[] {
  const byId=new Map(source.blocks.map(b=>[b.sourceId,b])),byUuid=new Map(source.blocks.map(b=>[b.target.blockUuid,b]));
  const selected=new Set<string>(),roots=new Set(ids);
  for(const id of ids) {
    const block=byId.get(id);requireLens(block,"source-not-in-scope");
    selected.add(id);
    if(includeContext) {
      let parent=block.parentUuid;
      while(parent&&byUuid.has(parent)) {
        const block=byUuid.get(parent)!;selected.add(block.sourceId);parent=block.parentUuid;
      }
    }
  }
  let expandedDepth:number|null=null;
  for(const block of source.blocks) {
    if(expandedDepth!==null&&block.depth<=expandedDepth)expandedDepth=null;
    if(roots.has(block.sourceId))expandedDepth=expandedDepth===null?block.depth:Math.min(expandedDepth,block.depth);
    if(expandedDepth!==null)selected.add(block.sourceId);
  }
  return source.blocks.filter(block=>selected.has(block.sourceId)).map(block=>block.sourceId);
}
export function validateReadingPlan(input:unknown,source:SourceSnapshot,materialIds:ReadonlySet<string>=new Set()):VerifiedReadingPlan {
  const plan=decodeReadingPlan(input);
  requireLens(sameLensScope(plan.scope,source.scope)&&plan.scope.kind===source.scope.kind&&plan.scope.pageName===source.scope.pageName,"scope-mismatch");
  requireLens(plan.structureVersion===source.structureVersion,"stale-structure");
  requireLens(plan.sourceSetVersion===source.sourceSetVersion,"stale-source-set");
  requireLens((source.page?source.page.availability==="available":source.blocks.length>0)&&source.blocks.every(b=>b.availability==="available"&&b.contentVersion),"source-unavailable");
  const byId=new Map(source.blocks.map(b=>[b.sourceId,b])),byUuid=new Map(source.blocks.map(b=>[b.target.blockUuid,b])),versions=new Set<string>();
  for(const version of plan.sourceVersions) {
    requireLens(!versions.has(version.sourceId),"duplicate-source-version");versions.add(version.sourceId);
    const block=byId.get(version.sourceId);requireLens(block,"source-not-in-scope");
    requireLens(version.contentVersion===block.contentVersion,"stale-content");
  }
  requireLens(versions.size===source.blocks.length,"reading-full-source-required");
  const primary:string[]=[],materials=new Set<string>(),seen=new Set<string>(),headings:ReadingHeading[]=[],contexts=new Map<string,readonly string[]>(),membership=new Map<string,readonly string[]>();
  const context=(ids:readonly string[]):string[]=>{
    const own=new Set(ids),needed=new Set<string>();
    for(const id of ids) {
      let parent=byId.get(id)!.parentUuid;
      while(parent&&byUuid.has(parent)) {
        const block=byUuid.get(parent)!;if(!own.has(block.sourceId))needed.add(block.sourceId);parent=block.parentUuid;
      }
    }
    return source.blocks.filter(block=>needed.has(block.sourceId)).map(block=>block.sourceId);
  };
  const walk=(unit:ReadingUnit):string[]=>{
    let ids:string[];
    if(unit.kind==="sequence"||unit.kind==="paragraphs") {
      ids=unit.sourceIds;
      for(const id of ids) {requireLens(byId.has(id),"source-not-in-scope");requireLens(!seen.has(id),"duplicate-reading-source");seen.add(id);primary.push(id);}
    } else if(unit.kind==="material") {
      requireLens(materialIds.has(unit.materialId),"material-outside-scope");materials.add(unit.materialId);return [];
    } else if(unit.kind==="group") {
      ids=unit.children.flatMap(walk);heading(unit.key,unit.title,ids);
    } else {
      ids=unit.columns.flatMap(column=>{const ids=column.children.flatMap(walk);heading(column.key,column.title,ids);contexts.set(column.key,context(ids));membership.set(column.key,ids);return ids;});heading(unit.key,unit.title,ids);
    }
    contexts.set(unit.key,context(ids));
    membership.set(unit.key,ids);
    return ids;
  };
  const heading=(key:string,title:string,ids:string[])=>{
    const all=readingSourceSet(source,ids,true);
    requireLens(!certaintyClaim.test(title)||!all.some(id=>uncertain.test(byId.get(id)!.content??"")),"reading-title-overstates-source");
    headings.push({key,title,sourceIds:[...ids],contextSourceIds:context(ids)});
  };
  plan.layout.forEach(walk);
  requireLens(seen.size===source.blocks.length,"reading-full-source-required");
  const repairs=safeOrder(source,primary);
  for(const [key,ids] of membership) {
    const needed=new Set([...contexts.get(key)??[],...ids.flatMap(id=>repairs.get(id)??[])]);
    contexts.set(key,source.blocks.filter(block=>needed.has(block.sourceId)).map(block=>block.sourceId));
  }
  for(const item of headings) {
    item.contextSourceIds=[...contexts.get(item.key)??[]];
    requireLens(!certaintyClaim.test(item.title)||![...readingSourceSet(source,item.sourceIds,true),...item.contextSourceIds].some(id=>uncertain.test(byId.get(id)!.content??"")),"reading-title-overstates-source");
  }
  // Bound the actual rendered context, including inherited de-duplication. An
  // adversarial plan cannot multiply a large root paragraph thousands of times.
  const bytes=new Map(source.blocks.map(block=>[block.sourceId,new TextEncoder().encode(block.content??"").length]));
  let presented=source.blocks.length,presentedBytes=[...bytes.values()].reduce((sum,size)=>sum+size,0);
  const account=(key:string,inherited:ReadonlySet<string>):Set<string>=>{
    const ids=contexts.get(key)??[];
    for(const id of ids)if(!inherited.has(id)) {presented++;presentedBytes+=bytes.get(id)!;}
    requireLens(presented<=20_000&&presentedBytes<=8_388_608,"reading-context-too-large");
    return new Set([...inherited,...ids]);
  };
  const bound=(unit:ReadingUnit,inherited:ReadonlySet<string>):void=>{
    const context=account(unit.key,inherited);
    if(unit.kind==="group")unit.children.forEach(child=>bound(child,context));
    else if(unit.kind==="comparison")for(const column of unit.columns) {
      const columnContext=account(column.key,context);column.children.forEach(child=>bound(child,columnContext));
    }
  };
  requireLens(presentedBytes<=8_388_608,"reading-context-too-large");
  plan.layout.forEach(unit=>bound(unit,new Set()));
  return {plan,basis:structuredClone(source),primarySourceIds:primary,materialIds:[...materials],headings,contexts};
}
export function readingBasisChanged(verified:VerifiedReadingPlan,source:SourceSnapshot):boolean {
  const {scope,structureVersion,sourceSetVersion}=verified.plan;
  return !sameLensScope(scope,source.scope)||scope.kind!==source.scope.kind||scope.pageName!==source.scope.pageName||structureVersion!==source.structureVersion||sourceSetVersion!==source.sourceSetVersion;
}
