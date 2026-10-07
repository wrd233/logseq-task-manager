import test from "node:test";
import assert from "node:assert/strict";
import rows from "./fixtures/reading-collaboration.json" with {type:"json"};
import { sha256, snapshot, sourceId, type SourceSnapshot } from "../src/workspace/source-protocol.ts";
import { decodeReadingPlan, readingBasisChanged, readingSourceSet, validateReadingPlan, type ReadingPlan, type ReadingUnit } from "../src/features/work-view/reading-plan.ts";

const scope={graphId:"synthetic:/reading-collaboration",rootUuid:rows[0]!.uuid};
async function fixture():Promise<SourceSnapshot> {
  return snapshot(scope,await Promise.all(rows.map(async row=>({sourceId:sourceId(scope.graphId,row.uuid),
    target:{kind:"logseq-block" as const,graphId:scope.graphId,blockUuid:row.uuid},content:row.content,contentVersion:await sha256(row.content),
    parentUuid:row.parentUuid,depth:row.depth,order:row.order,availability:"available" as const}))));
}
function plan(source:SourceSnapshot,layout?:ReadingUnit[]):ReadingPlan {
  return {schemaVersion:1,requestId:"reading-request",planId:"reading-one",name:"连续读原句",scope:{...source.scope},structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion,
    sourceVersions:source.blocks.map(b=>({sourceId:b.sourceId,contentVersion:b.contentVersion!})),
    layout:layout??[{kind:"paragraphs",key:"all",sourceIds:source.blocks.map(b=>b.sourceId)}]};
}
const reject=(value:unknown,source:SourceSnapshot,reason:string)=>assert.throws(()=>validateReadingPlan(value,source),new RegExp(reason,"u"));

test("long source accepts independent continuous and composed comparison/group reading without changing any source",async()=>{
  const source=await fixture(),before=JSON.stringify(source),ids=source.blocks.map(b=>b.sourceId);
  assert.equal(rows.length,101);assert.equal(Math.max(...rows.map(b=>b.depth))+1,4);
  assert.equal([...rows.map(b=>b.content).join("")].filter(c=>/\p{Script=Han}/u.test(c)).length,4041);
  const continuous=validateReadingPlan(plan(source),source);
  const composed=validateReadingPlan({...plan(source,[
    {kind:"sequence",key:"introduction",sourceIds:ids.slice(0,1)},
    {kind:"comparison",key:"compare",title:"做事与讨论的原句对照",columns:[
      {key:"doing",title:"边做边记录",children:[{kind:"sequence",key:"doing-body",sourceIds:ids.slice(1,26)}]},
      {key:"discussion",title:"谨慎留下思考",children:[{kind:"paragraphs",key:"discussion-body",sourceIds:ids.slice(26,51)}]}
    ]},
    {kind:"group",key:"scattered",title:"零散记录与权限边界",children:[{kind:"paragraphs",key:"remaining",sourceIds:ids.slice(51)}]}
  ]),planId:"reading-two",name:"对照后继续读"},source);
  assert.deepEqual(continuous.primarySourceIds,ids);assert.deepEqual(composed.primarySourceIds,ids);
  assert.notDeepEqual(composed.plan.layout,continuous.plan.layout);
  assert.equal(composed.headings.length,4);
  const heading=composed.headings.find(h=>h.key==="doing")!;
  assert.deepEqual(heading.sourceIds,ids.slice(1,26));assert.deepEqual(heading.contextSourceIds,[ids[0]]);
  assert.equal(JSON.stringify(source),before);
  for(const block of composed.basis.blocks)assert.equal(block.contentVersion,await sha256(block.content!));
});
test("full source membership/version rejects omitted, duplicated, foreign and replacement body inputs",async()=>{
  const source=await fixture(),base=plan(source),ids=source.blocks.map(b=>b.sourceId);
  reject({...base,layout:[{kind:"sequence",key:"missing",sourceIds:ids.slice(1)}]},source,"reading-full-source-required");
  reject({...base,layout:[{kind:"sequence",key:"twice",sourceIds:[...ids,ids[4]]}]},source,"duplicate-reading-source");
  reject({...base,layout:[{kind:"sequence",key:"foreign",sourceIds:[...ids.slice(0,-1),'["logseq","other","foreign"]']}]},source,"source-not-in-scope");
  reject({...base,sourceVersions:base.sourceVersions.slice(1)},source,"reading-full-source-required");
  reject({...base,sourceVersions:[...base.sourceVersions,base.sourceVersions[1]]},source,"duplicate-source-version");
  reject({...base,layout:[{kind:"paragraphs",key:"replacement",sourceIds:ids,body:"替代所有原文"}]},source,"unknown-field");
  reject({...base,actor:"user"},source,"unknown-field");
});
test("stale content/structure/source-set, another Graph and missing saved source fail closed",async()=>{
  const source=await fixture(),base=plan(source),different="f".repeat(64);
  reject({...base,structureVersion:different},source,"stale-structure");
  reject({...base,sourceSetVersion:different},source,"stale-source-set");
  reject({...base,scope:{...scope,graphId:"another"}},source,"scope-mismatch");
  reject({...base,sourceVersions:base.sourceVersions.map((b,i)=>i===3?{...b,contentVersion:different}:b)},source,"stale-content");
  const blocks=source.blocks.map((b,i)=>i===41?{...b,content:b.content+"\n用户新增退出条件",contentVersion:different}:b);
  blocks[41]!.contentVersion=await sha256(blocks[41]!.content!);
  const changed=await snapshot(scope,blocks),verified=validateReadingPlan(base,source);
  assert.equal(readingBasisChanged(verified,source),false);assert.equal(readingBasisChanged(verified,changed),true);
  reject(base,changed,"stale-source-set");
  const missing=await snapshot(scope,source.blocks.map((b,i)=>i===3?{...b,content:null,contentVersion:null,availability:"missing" as const}:b));
  reject({...base,sourceSetVersion:missing.sourceSetVersion},missing,"source-unavailable");
});
test("body/group sets preserve actual duplicate identity, descendants and necessary ancestors",async()=>{
  const source=await fixture(),duplicate=source.blocks.filter(b=>b.content===rows[29]!.content);
  const repeatedText="先不要删重复句。整理的目的是让关系更清楚，不是减少来源数量；判断不清时应当保留原来的次序。";
  const repeated=source.blocks.filter(b=>b.content===repeatedText);assert.equal(repeated.length,2);
  assert.deepEqual(readingSourceSet(source,[repeated[0]!.sourceId]),[repeated[0]!.sourceId]);
  const parent=source.blocks[1]!,childSet=readingSourceSet(source,[parent.sourceId]);
  assert.equal(childSet.length,25);assert(!childSet.includes(source.blocks[26]!.sourceId));
  const contextual=readingSourceSet(source,[parent.sourceId],true);assert.equal(contextual.length,26);assert.equal(contextual[0],source.blocks[0]!.sourceId);
  assert.throws(()=>readingSourceSet(source,["outside"]),/source-not-in-scope/u);
  assert(duplicate.length>=1);
});
test("uncertain/unknown adjacency and parent explanations cannot be broken by cross-group reorder",async()=>{
  const source=await fixture(),base=plan(source),ids=source.blocks.map(b=>b.sourceId);
  const swapped=[...ids];[swapped[2],swapped[6]]=[swapped[6]!,swapped[2]!];
  reject({...base,layout:[{kind:"sequence",key:"split-subtree",sourceIds:swapped}]},source,"reading-dependency-broken");
  const topics=[ids[0]!,...ids.slice(26,51),...ids.slice(1,26),...ids.slice(51)];
  reject({...base,layout:[{kind:"sequence",key:"swapped-work",sourceIds:topics}]},source,"reading-dependency-broken");
  reject({...base,layout:[{kind:"group",key:"misleading",title:"最终结论：已经完成",children:base.layout}]},source,"reading-title-overstates-source");
});
test("only complete explicit stable sibling categories can change their reading order",async()=>{
  const source=await fixture(),root=source.blocks[0]!,texts=["**[目标]** 保留原句","**[注]** 阅读说明","**[想法]** 读法甲","**[目标]** 另一个目标"];
  const blocks=[root,...await Promise.all(texts.map(async(content,index)=>({...source.blocks[index+1]!,content,contentVersion:await sha256(content),depth:1,parentUuid:root.target.blockUuid,order:index})))];
  const small=await snapshot(scope,blocks),ids=small.blocks.map(b=>b.sourceId);
  assert.doesNotThrow(()=>validateReadingPlan(plan(small,[{kind:"sequence",key:"order",sourceIds:[ids[0]!,ids[2]!,ids[1]!,ids[4]!,ids[3]!]}]),small));
  reject(plan(small,[{kind:"sequence",key:"goal-order",sourceIds:[ids[0]!,ids[4]!,ids[1]!,ids[2]!,ids[3]!]}]),small,"reading-dependency-broken");
});
test("materials remain explicitly scoped references and never grant file or body authority",async()=>{
  const source=await fixture(),base=plan(source),material={kind:"material" as const,key:"file",materialId:"synthetic-known-material"};
  reject({...base,layout:[...base.layout,material]},source,"material-outside-scope");
  const verified=validateReadingPlan({...base,layout:[...base.layout,material]},source,new Set([material.materialId]));
  assert.equal(verified.primarySourceIds.length,source.blocks.length);
  reject({...base,layout:[...base.layout,{...material,role:"output",path:"/production"}]},source,"unknown-field");
});
test("closed units reject executable fields, accessors, duplicate keys, deep nesting and large membership",async()=>{
  const source=await fixture(),base=plan(source);
  for(const field of ["html","script","style","todoGrant","content"])reject({...base,[field]:"untrusted"},source,"unknown-field");
  const accessor={...base};let reads=0;Object.defineProperty(accessor,"layout",{enumerable:true,get(){reads++;return base.layout;}});
  assert.throws(()=>decodeReadingPlan(accessor),/invalid-reading-plan/u);assert.equal(reads,0);
  reject({...base,layout:[...base.layout,...base.layout]},source,"duplicate-layout-key");
  let deep:ReadingUnit=base.layout[0]!;for(let i=0;i<20;i++)deep={kind:"group",key:`level-${i}`,title:"原句",children:[deep]};
  assert.throws(()=>decodeReadingPlan({...base,layout:[deep]}),/reading-layout-too-large/u);
  reject({...base,layout:[{kind:"html",key:"execute",html:"<script>run()</script>"}]},source,"unknown-field");
  assert.throws(()=>decodeReadingPlan({...base,layout:[{kind:"sequence",key:"many",sourceIds:Array(10_001).fill(source.blocks[0]!.sourceId)}]}),/input-too-large/u);
});
test("page scope, including an empty saved page, never manufactures a writable root block",async()=>{
  const pageScope={...scope,kind:"page" as const,pageName:"Project 合成范围"};
  const page=await snapshot(pageScope,[],undefined,{pageUuid:scope.rootUuid,pageName:pageScope.pageName,availability:"available"});
  const value=plan(page,[]),verified=validateReadingPlan(value,page);
  assert.deepEqual(verified.primarySourceIds,[]);assert.deepEqual(verified.headings,[]);
  reject({...value,scope:{...pageScope,kind:undefined,pageName:undefined}},page,"scope-mismatch");
  reject({...value,layout:[{kind:"sequence",key:"fake-root",sourceIds:[sourceId(scope.graphId,scope.rootUuid)]}]},page,"source-not-in-scope");
});
