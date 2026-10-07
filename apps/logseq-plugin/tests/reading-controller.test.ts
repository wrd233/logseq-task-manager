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
  assert.deepEqual(await h.controller.api.submit(input),{ok:true,value:{planId:"plan-one",status:"selected"}});
  assert.deepEqual(await h.controller.api.submit(input),{ok:true,value:{planId:"plan-one",status:"already-selected"}});
  const state=h.controller.api.read();assert.deepEqual(state.activePlan,input);assert.equal(state.capabilities.writesSource,false);assert.equal(state.capabilities.authorizesTodo,false);
  state.activePlan!.name="changed outside";assert.equal(h.controller.api.read().activePlan!.name,input.name);
  assert.deepEqual(await h.controller.api.original(),{ok:true,value:null});assert.equal(h.controller.api.read().activePlanId,null);
  assert.equal((await h.controller.api.select("plan-one")).ok,true);assert.equal(h.changes,4);
  assert.deepEqual(await h.controller.api.submit({...input,name:"reuse an existing identity for another layout"}),{ok:false,reason:"reading-plan-id-conflict"});
});
test("same Graph and root rebinding invalidates plans and requests by the source provider lifetime",async()=>{
  const h=await harness(),request=await invitation(h);await h.controller.api.submit(plan(h.source,request.requestId));
  let release!:(value:LensResult<SourceSnapshot>)=>void;h.read=()=>new Promise(resolve=>{release=resolve;});
  const pending=h.controller.api.request({schemaVersion:1,purpose:"before directory rebinding"});h.version="binding-two";
  release({ok:true,value:h.source});assert.deepEqual(await pending,{ok:false,reason:"reading-request-revoked"});
  assert.equal(h.controller.api.read().activePlan,null);assert.deepEqual(h.controller.api.read().plans,[]);
  assert.deepEqual(await h.controller.api.submit(plan(h.source,request.requestId)),{ok:false,reason:"reading-request-not-found"});
});
test("unknown request IDs and source bases do not manufacture invitation ownership",async()=>{
  const h=await harness();
  assert.deepEqual(await h.controller.api.submit(plan(h.source,"invented")),{ok:false,reason:"reading-request-not-found"});
  const request=await invitation(h);
  assert.deepEqual(await h.controller.api.submit({...plan(h.source,request.requestId),sourceSetVersion:"f".repeat(64)}),{ok:false,reason:"reading-request-basis-mismatch"});
  assert.deepEqual(await h.controller.api.request({schemaVersion:1,purpose:"read",root:"another",actor:"user"}),{ok:false,reason:"unknown-field"});
});
test("user appended conditions stale cached plans and never get overwritten by old reading",async()=>{
  const h=await harness(),request=await invitation(h),input=plan(h.source,request.requestId);await h.controller.api.submit(input);
  const blocks=h.source.blocks.map(b=>({...b,content:b.content+"\n不过用户刚加了新的退出条件"}));blocks[0]!.contentVersion=await sha256(blocks[0]!.content!);
  h.source=await snapshot(scope,blocks);h.controller.noteSource(h.source);
  assert.equal(h.controller.api.read().activePlanId,null);assert.equal(h.controller.api.read().plans[0]!.status,"stale");
  assert.deepEqual(await h.controller.api.select("plan-one"),{ok:false,reason:"stale-reading-plan"});
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
