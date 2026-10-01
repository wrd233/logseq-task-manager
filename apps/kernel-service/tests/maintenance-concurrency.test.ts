import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Kernel } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { parseSemanticOperation, stableHash, type CognitionExecutor, type GraphEffect, type GraphGatewayResponse, type SemanticJudgment } from "@task-copilot/contracts";
import type { GraphRequestBroker } from "../src/graph-broker.ts";
import { MaintenanceCoordinator, FAKE_COGNITION_PROFILE } from "../src/maintenance-coordinator.ts";
import { ProjectionDelivery } from "../src/projection-delivery.ts";

const at="2026-10-01T00:00:00.000Z";
function deferred<T>() {let resolve!: (value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function setup() {
  const store=new SqliteStore(":memory:"), kernel=new Kernel(store,{now:()=>at});
  const create=(n:number)=>kernel.commitFormal(parseSemanticOperation({operationId:`create-${n}`,type:"CREATE_WORK_OBJECT",actor:{type:"USER",id:"local-user"},input:{kind:"TASK",title:`test ${n}`,anchor:{graphId:"graph",blockUuid:`source-${n}`,sourceContentHash:"a1b2c3d4"}}}),{graphId:"graph",sourceBlockUuid:`source-${n}`,sourceContentHash:"a1b2c3d4",projection:null});
  const first=create(1), second=create(2);
  return {store,kernel,first,second};
}
function applied(effect: GraphEffect): GraphGatewayResponse {
  assert.equal(effect.type,"UPSERT_MANAGED_PROJECTION");if(effect.type!=="UPSERT_MANAGED_PROJECTION")throw Error("fixture type");
  return {kind:"APPLY_EFFECT",result:{commitId:effect.commitId,effectId:effect.effectId,effectType:effect.type,graphId:effect.graphId,sourceBlockUuid:effect.sourceBlockUuid,projectionHash:effect.projection.projectionHash,appliedAt:at},snapshot:{graphId:effect.graphId,sourceBlockUuid:effect.sourceBlockUuid,sourceContentHash:"a1b2c3d4",projection:effect.projection}};
}

test("delivery coalesces overlapping drains, preserves Kernel verification, and stops further claims",async()=>{
  const {store,kernel,first,second}=setup();
  const slow=deferred<GraphGatewayResponse>();let calls=0,claim=true;
  let effect: GraphEffect | null = null;
  const broker={status:()=>({available:true}),request:async(request:Parameters<GraphRequestBroker["request"]>[0])=>{assert.equal(request.kind,"APPLY_EFFECT");if(request.kind==="APPLY_EFFECT")effect=request.effect;calls++;return slow.promise;}} as unknown as GraphRequestBroker;
  const delivery=new ProjectionDelivery(store,kernel,broker,()=>at);
  try {
    const a=delivery.drain(()=>claim), b=delivery.drain(()=>claim);
    assert.equal(a,b);assert.equal(calls,1);
    claim=false;assert.ok(effect);const delivered=effect as GraphEffect;slow.resolve(applied(delivered));assert.equal(await a,1);
    assert.equal(store.getProjectionObligationForCommit(delivered.commitId)?.status,"VERIFIED");
    const remaining=delivered.commitId===first.commit.id?second:first;
    assert.equal(store.getProjectionObligationForCommit(remaining.commit.id)?.status,"PENDING");
    assert.equal(calls,1);
    broker.request=async request=>{assert.equal(request.kind,"APPLY_EFFECT");if(request.kind!=="APPLY_EFFECT")throw Error("fixture type");return applied(request.effect);};
    assert.equal(await delivery.drain(),1);
    assert.equal(store.getProjectionObligationForCommit(remaining.commit.id)?.status,"VERIFIED");
  } finally {store.close();}
});

test("slow tick stays serial across timer firings; stop after delivery does not claim a new job",async()=>{
  const {store,kernel,first}=setup();
  const slow=deferred<number>();let drains=0,claims=0;
  const claim=store.claimNextReconcileJob.bind(store);store.claimNextReconcileJob=at=>{claims++;return claim(at);};
  const delivery={drain:()=>{drains++;return slow.promise;}};
  const broker={status:()=>({available:false})} as unknown as GraphRequestBroker;
  const cognition:CognitionExecutor={id:"fixture",judge:async()=>({kind:"NO_CHANGE",dimension:"engagement",rationaleSummary:"none"})};
  const maintenance=new MaintenanceCoordinator(kernel,store,broker,{delivery,now:()=>at,intervalMs:5},cognition,FAKE_COGNITION_PROFILE);
  try {
    maintenance.manualReconcile(first.commit.targetId!);
    maintenance.start();const running=maintenance.tick();
    await delay(30);assert.equal(drains,1);assert.equal(claims,0);
    maintenance.stop();slow.resolve(0);assert.equal(await running,null);
    await delay(15);assert.equal(drains,1);assert.equal(claims,0);
    assert.equal(store.listReconcileJobs("QUEUED").length,1);
    assert.equal(await maintenance.tick(),null);
  } finally {maintenance.stop();store.close();}
});

test("a slow cognition run keeps its own remote budget and finishes its claimed job after stop",async()=>{
  const {store,kernel,first,second}=setup();
  const slow=deferred<SemanticJudgment>();let calls=0,reserves=0;
  const budget=store.consumeRemoteCallBudget.bind(store);store.consumeRemoteCallBudget=(...args)=>{reserves++;return budget(...args);};
  const broker={status:()=>({available:true,graphId:"graph"}),request:async(request: Parameters<GraphRequestBroker["request"]>[0]):Promise<GraphGatewayResponse>=>{
    if(request.kind==="READ_TARGET_SNAPSHOT")return {kind:request.kind,snapshot:{graphId:"graph",sourceBlockUuid:request.input.sourceBlockUuid,sourceContentHash:"a1b2c3d4",projection:request.input.expectedProjection??null}};
    if(request.kind==="READ_BLOCK")return {kind:request.kind,block:{graphId:"graph",blockUuid:request.blockUuid,pageName:null,content:"natural",contentHash:stableHash("natural")}};
    throw Error("unexpected request");
  }} as unknown as GraphRequestBroker;
  const cognition:CognitionExecutor={id:"fixture",judge:async()=>{calls++;return slow.promise;}};
  const maintenance=new MaintenanceCoordinator(kernel,store,broker,{delivery:{drain:async()=>0},now:()=>at,intervalMs:5},cognition,{...FAKE_COGNITION_PROFILE,executor:"DEEPSEEK",remoteEnabled:true,maxRemoteCallsPerRun:1,maxRemoteCallsPerHour:10});
  try {
    for (const created of [first, second]) {
      maintenance.recordSourceChange({workObjectId:created.commit.targetId!,graphId:"graph",sourceBlockUuid:created.graphEffect.sourceBlockUuid,sourceContentHash:"a1b2c3d4",sourceMarker:null,observedAt:at});
      maintenance.manualReconcile(created.commit.targetId!);
    }
    maintenance.start();const running=maintenance.tick();
    for(let i=0;i<50&&!calls;i++)await delay(2);
    await delay(25);assert.equal(calls,1);assert.equal(reserves,1);assert.equal(store.listReconcileJobs("RUNNING").length,1);
    assert.equal(maintenance.tick(),running);
    const claimed = store.listReconcileJobs("RUNNING")[0]!;
    maintenance.stop();slow.resolve({kind:"NO_CHANGE",dimension:"engagement",rationaleSummary:"stable"});
    await running;
    assert.equal(store.getReconcileJob(claimed.id)?.status,"DONE", JSON.stringify(store.getReconcileJob(claimed.id)));
    assert.equal(store.listReconcileJobs("RUNNING").length,0);assert.equal(store.listReconcileJobs("QUEUED").length,1);
    assert.equal(reserves,1);
  } finally {maintenance.stop();store.close();}
});
