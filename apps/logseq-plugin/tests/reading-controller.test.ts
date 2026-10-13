import test from "node:test";
import assert from "node:assert/strict";
import { sha256, snapshot, sourceId, type SourceScope, type SourceSnapshot } from "../src/workspace/source-protocol.ts";
import { ReadingPlanController } from "../src/features/work-view/reading-controller.ts";
import type { ReadingPlan } from "../src/features/work-view/reading-plan.ts";
import type { LensResult } from "../src/features/work-view/lens-controller.ts";

const scope={graphId:"synthetic:/reading-lifetime",rootUuid:"b7261007-0000-4000-8000-000000000001"};
async function sourceFixture():Promise<SourceSnapshot> {
  const content="**[MiniProject]** 先保留原句，结论尚未确定";
  return snapshot(scope,[{sourceId:sourceId(scope.graphId,scope.rootUuid),target:{kind:"logseq-block",graphId:scope.graphId,blockUuid:scope.rootUuid},
    content,contentVersion:await sha256(content),parentUuid:null,depth:0,order:0,availability:"available"}]);
}
function plan(source:SourceSnapshot,requestId:string):ReadingPlan {
  return {schemaVersion:1,requestId,planId:"plan-one",name:"先读原句",scope:source.scope,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion,
    sourceVersions:source.blocks.map(b=>({sourceId:b.sourceId,contentVersion:b.contentVersion!})),layout:[{kind:"paragraphs",key:"body",sourceIds:source.blocks.map(b=>b.sourceId)}]};
}
async function harness() {
  let source=await sourceFixture(),current:SourceScope=scope,unavailable:string|null=null,changes=0,version="binding-one";
  let read=async():Promise<LensResult<SourceSnapshot>>=>({ok:true,value:source});
  let materials=async():Promise<ReadonlySet<string>>=>new Set();
  const controller=new ReadingPlanController({scope:()=>current,version:()=>version,unavailable:()=>unavailable,source:()=>read(),materials:()=>materials(),changed:()=>{changes++;}});
  return {controller,get source(){return source;},set source(value:SourceSnapshot){source=value;},
    set scope(value:SourceScope){current=value;},set unavailable(value:string|null){unavailable=value;},
    set version(value:string){version=value;},
    set read(value:typeof read){read=value;},set materials(value:typeof materials){materials=value;},get changes(){return changes;}};
}
async function invitation(h:Awaited<ReturnType<typeof harness>>) {
  const result=await h.controller.api.request({schemaVersion:1,purpose:"保留所有原句，换一种读法"});assert.equal(result.ok,true);
  return result.value;
}
test("controller owns real invitations, full plans, selection and identical retry without granting writing authority",async()=>{
  const h=await harness(),request=await invitation(h),input=plan(h.source,request.requestId);
  assert.deepEqual(await h.controller.api.submit(input),{ok:true,value:{planId:"plan-one",status:"selected",revision:1}});
  assert.deepEqual(await h.controller.api.submit(input),{ok:true,value:{planId:"plan-one",status:"already-selected",revision:1}});
  const state=h.controller.api.read();assert.deepEqual(state.activePlan,input);assert.equal(state.capabilities.writesSource,false);assert.equal(state.capabilities.authorizesTodo,false);
  state.activePlan!.name="changed outside";assert.equal(h.controller.api.read().activePlan!.name,input.name);
  assert.deepEqual(await h.controller.api.original(),{ok:true,value:null});assert.equal(h.controller.api.read().activePlanId,null);
  assert.equal((await h.controller.api.select("plan-one")).ok,true);assert.ok(h.changes>0);
  assert.deepEqual(await h.controller.api.submit({...input,name:"reuse an existing identity for another layout"}),{ok:false,reason:"reading-view-changed"});
});
test("same work rebinding keeps named views but revokes pending requests",async()=>{
  const h=await harness(),request=await invitation(h);await h.controller.api.submit(plan(h.source,request.requestId));
  let release!:(value:LensResult<SourceSnapshot>)=>void;h.read=()=>new Promise(resolve=>{release=resolve;});
  const pending=h.controller.api.request({schemaVersion:1,purpose:"before directory rebinding"});h.version="binding-two";
  release({ok:true,value:h.source});assert.deepEqual(await pending,{ok:false,reason:"reading-request-revoked"});
  assert.equal(h.controller.api.read().activePlan,null);assert.equal(h.controller.api.read().plans[0]!.status,"unverified");
  assert.deepEqual(await h.controller.api.submit(plan(h.source,request.requestId)),{ok:false,reason:"reading-request-not-found"});
});
test("unknown request IDs and source bases do not manufacture invitation ownership",async()=>{
  const h=await harness();
  assert.deepEqual(await h.controller.api.submit(plan(h.source,"invented")),{ok:false,reason:"reading-request-not-found"});
  const request=await invitation(h);
  assert.deepEqual(await h.controller.api.submit({...plan(h.source,request.requestId),sourceSetVersion:"f".repeat(64)}),{ok:false,reason:"reading-request-basis-mismatch"});
  assert.deepEqual(await h.controller.api.request({schemaVersion:1,purpose:"read",root:"another",actor:"user"}),{ok:false,reason:"unknown-field"});
});
test("saved text changes refresh the active view without overwriting original conditions",async()=>{
  const h=await harness(),request=await invitation(h),input=plan(h.source,request.requestId);await h.controller.api.submit(input);
  const blocks=h.source.blocks.map(b=>({...b,content:b.content+"\n不过用户刚加了新的退出条件"}));blocks[0]!.contentVersion=await sha256(blocks[0]!.content!);
  h.source=await snapshot(scope,blocks);h.controller.noteSource(h.source);
  assert.equal(h.controller.api.read().activePlanId,"plan-one");assert.equal(h.controller.api.read().plans[0]!.status,"current");
  assert.match(h.controller.active(h.source)!.basis.blocks[0]!.content!,/用户刚加/);
  assert.equal((await h.controller.api.select("plan-one")).ok,true);
  assert.deepEqual(await h.controller.api.submit(input),{ok:false,reason:"stale-source-set"});assert.match(h.source.blocks[0]!.content!,/用户刚加了新的退出条件/u);
});
test("cancel, scope switch, history and dispose revoke delayed requests and late layouts",async()=>{
  const h=await harness(),request=await invitation(h),input=plan(h.source,request.requestId);
  h.controller.api.cancel();assert.deepEqual(await h.controller.api.submit(input),{ok:false,reason:"reading-request-not-found"});
  let release!:(value:LensResult<SourceSnapshot>)=>void;
  h.read=()=>new Promise(resolve=>{release=resolve;});
  const pending=h.controller.api.request({schemaVersion:1,purpose:"delayed"});h.scope={...scope,graphId:"other"};release({ok:true,value:h.source});
  assert.deepEqual(await pending,{ok:false,reason:"reading-request-revoked"});assert.deepEqual(h.controller.api.read().pendingRequests,[]);
  h.scope=scope;h.read=async()=>({ok:true,value:h.source});const next=await invitation(h);
  h.unavailable="historical-view";assert.deepEqual(await h.controller.api.submit(plan(h.source,next.requestId)),{ok:false,reason:"historical-view"});
  h.unavailable="editing-in-progress";assert.deepEqual(await h.controller.api.request({schemaVersion:1,purpose:"read"}),{ok:false,reason:"editing-in-progress"});
  h.controller.dispose();assert.deepEqual(await h.controller.api.submit(input),{ok:false,reason:"reading-disposed"});assert.equal(h.controller.api.read().scope,null);
});
test("cancel invalidates requests in the middle of the material scope read",async()=>{
  const h=await harness();let release!:(value:ReadonlySet<string>)=>void;
  h.materials=()=>new Promise(resolve=>{release=resolve;});
  const pending=h.controller.api.request({schemaVersion:1,purpose:"read material entry"});await Promise.resolve();await Promise.resolve();
  h.controller.api.cancel();release(new Set());assert.deepEqual(await pending,{ok:false,reason:"reading-request-revoked"});assert.deepEqual(h.controller.api.read().pendingRequests,[]);
});
test("a late saved-source read cannot replace a newer confirmed source",async()=>{
  const h=await harness();let release!:(value:LensResult<SourceSnapshot>)=>void;
  h.read=()=>new Promise(resolve=>{release=resolve;});const earlier=h.controller.api.request({schemaVersion:1,purpose:"earlier"});
  h.read=async()=>({ok:true,value:h.source});const later=await invitation(h);release({ok:true,value:h.source});
  assert.deepEqual(await earlier,{ok:false,reason:"superseded-reading-source"});assert.deepEqual(h.controller.api.read().pendingRequests,[later.requestId]);
});
test("source loss keeps cached plans inspectable but removes active presentation",async()=>{
  const h=await harness(),request=await invitation(h);await h.controller.api.submit(plan(h.source,request.requestId));
  h.read=async()=>({ok:false,reason:"source-unavailable"});
  assert.deepEqual(await h.controller.api.select("plan-one"),{ok:false,reason:"source-unavailable"});
  const state=h.controller.api.read();assert.equal(state.activePlan,null);assert.equal(state.plans.length,1);assert.equal(state.plans[0]!.status,"unverified");assert.equal(state.sourceAvailability,"unavailable");
});
test("one invitation can be cancelled without cancelling a different client's pending request",async()=>{
  const h=await harness(),first=await invitation(h),second=await invitation(h);
  assert.deepEqual(h.controller.api.cancel(first.requestId),{ok:true,value:null});
  assert.deepEqual(await h.controller.api.submit(plan(h.source,first.requestId)),{ok:false,reason:"reading-request-not-found"});
  assert.equal((await h.controller.api.submit(plan(h.source,second.requestId))).ok,true);
});
test("selecting a cached plan rechecks current material scope instead of trusting old material permission",async()=>{
  const h=await harness();h.materials=async()=>new Set(["synthetic-material"]);const request=await invitation(h),input=plan(h.source,request.requestId);
  input.layout.push({kind:"material",key:"file",materialId:"synthetic-material"});assert.equal((await h.controller.api.submit(input)).ok,true);
  await h.controller.api.original();h.materials=async()=>new Set();
  assert.deepEqual(await h.controller.api.select("plan-one"),{ok:false,reason:"material-outside-scope"});assert.equal(h.controller.api.read().activePlan,null);
});
test("a newly observed material scope revokes an already displayed cached material plan",async()=>{
  const h=await harness();h.materials=async()=>new Set(["synthetic-material"]);const request=await invitation(h),input=plan(h.source,request.requestId);
  input.layout.push({kind:"material",key:"file",materialId:"synthetic-material"});await h.controller.api.submit(input);
  h.materials=async()=>new Set();await invitation(h);
  assert.equal(h.controller.api.read().activePlan,null);assert.equal(h.controller.api.read().plans[0]!.status,"material-unavailable");
});

test("work views persist across controller restart, stay scoped, and carry fresh source after additions and deletions",async()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  let source=await sourceFixture(),current:SourceScope=scope;
  const host={scope:()=>current,source:async()=>({ok:true as const,value:source}),materials:async()=>new Set<string>(),unavailable:()=>null,changed:()=>{},storage};
  const first=new ReadingPlanController(host),request=await first.api.request({schemaVersion:1,purpose:"persist"});assert.ok(request.ok);
  assert.ok((await first.api.submit(plan(source,request.value.requestId))).ok);first.dispose();
  const restored=new ReadingPlanController(host);assert.ok((await restored.api.refresh()).ok);assert.equal(restored.api.read().activePlanId,"plan-one");
  assert.ok(![...values.values()].join("").includes(source.blocks[0]!.content!),"storage holds layouts rather than copies of source text");
  const newId=sourceId(scope.graphId,"new-child"),newText="[问题] 新增问题";
  source=await snapshot(scope,[...source.blocks,{sourceId:newId,target:{kind:"logseq-block",graphId:scope.graphId,blockUuid:"new-child"},content:newText,contentVersion:await sha256(newText),parentUuid:scope.rootUuid,depth:1,order:0,availability:"available"}]);
  assert.ok((await restored.api.refresh()).ok);const active=restored.active(source)!;
  assert.equal(active.primarySourceIds.length,2);assert.ok(active.headings.some(heading=>heading.title==="新增 · 尚未归类"));
  source=await sourceFixture();assert.ok((await restored.api.refresh()).ok);assert.deepEqual(restored.active(source)!.primarySourceIds,[source.blocks[0]!.sourceId]);
  current={...scope,graphId:"other:/graph"};assert.equal(restored.api.read().plans.length,0);
  current=scope;await restored.api.refresh();assert.equal(restored.api.read().activePlanId,"plan-one");
});
test("updates keep one named view, preserve intervening navigation, restore prior layout and reject concurrent overwrites",async()=>{
  const h=await harness(),initial=await invitation(h);await h.controller.api.submit(plan(h.source,initial.requestId));
  const update=await invitation(h);await h.controller.api.original();
  const changed={...plan(h.source,update.requestId),name:"调整之后"};
  const result=await h.controller.api.submit(changed);assert.ok(result.ok);assert.equal(result.value.status,"saved");
  assert.equal(h.controller.api.read().activePlanId,null);assert.equal(h.controller.api.read().plans.length,1);assert.equal(h.controller.api.read().plans[0]!.revision,2);
  await h.controller.api.select("plan-one");await h.controller.api.restore("plan-one");assert.equal(h.controller.api.read().activePlan!.name,"先读原句");
  const earlier=await invitation(h),later=await invitation(h);
  assert.ok((await h.controller.api.submit({...plan(h.source,later.requestId),name:"最新读法"})).ok);
  assert.deepEqual(await h.controller.api.submit({...plan(h.source,earlier.requestId),name:"较早结果"}),{ok:false,reason:"reading-view-changed"});
  assert.equal(h.controller.api.read().activePlan!.name,"最新读法");
});

test("portable view couples fresh saved source and its verified reading without a second source read",async()=>{
  const h=await harness(),request=await invitation(h);await h.controller.api.submit(plan(h.source,request.requestId));
  let reads=0;h.read=async()=>{reads++;return {ok:true,value:h.source};};
  const result=await h.controller.api.view();assert.equal(result.ok,true);if(!result.ok)return;
  assert.equal(reads,1);assert.equal(result.value.source.sourceSetVersion,result.value.reading.sourceSetVersion);
  assert.deepEqual(result.value.reading.document?.[0]?.sourceIds,h.source.blocks.map(b=>b.sourceId));
  result.value.source.blocks[0]!.content="caller mutation";
  const next=await h.controller.api.view();assert.equal(next.ok,true);if(next.ok)assert.notEqual(next.value.source.blocks[0]!.content,"caller mutation");
  h.read=async()=>({ok:false,reason:"source-unavailable"});assert.deepEqual(await h.controller.api.view(),{ok:false,reason:"source-unavailable"});
});
