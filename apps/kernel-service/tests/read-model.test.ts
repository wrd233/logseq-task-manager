import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { parseSemanticOperation } from "@task-copilot/contracts";
import type { GraphRequestBroker } from "../src/graph-broker.ts";
import { ClosureReadiness } from "../src/closure-readiness.ts";
import { ProjectionCoordinator } from "../src/projection-coordinator.ts";

const at="2026-10-01T00:00:00.000Z";
function fixture() {
  const store=new SqliteStore(":memory:"), kernel=new Kernel(store,{now:()=>at});
  const created=kernel.commitFormal(parseSemanticOperation({operationId:"create-project",type:"CREATE_WORK_OBJECT",actor:{type:"USER",id:"local-user"},input:{kind:"PROJECT",title:"Project",anchor:{graphId:"graph",blockUuid:"source",sourceContentHash:"a1b2c3d4"}}}),{graphId:"graph",sourceBlockUuid:"source",sourceContentHash:"a1b2c3d4",projection:null});
  const id=created.commit.targetId!;
  const broker: Pick<GraphRequestBroker,"status"|"request">={status:()=>({available:false,graphId:null,reason:"GRAPH_ADAPTER_OFFLINE",capabilities:[],lastSeenAt:null}),request:async()=>{throw Error("offline");}};
  const readiness=new ClosureReadiness(store,{jobs:()=>[],requestAssessment:()=>{}},()=>at);
  const query=new ProjectionCoordinator(store,kernel,{listRuns:()=>[]},{coverage:()=>null,jobs:()=>[],isPaused:()=>false},broker,readiness,{now:()=>at});
  return {store,kernel,query,id,created,broker};
}

test("Now indexes shared collections once and keeps ProjectIntent changes at the same formal version",async()=>{
  const {store,kernel,query,id,created}=fixture();
  try {
    kernel.reading.markViewed(id,at);
    assert.equal(query.now().items.length,0);
    const afterSeen="2026-10-01T00:01:00.000Z";
    store.insertCommit({...created.commit,id:"intent-a",operationType:"UPDATE_PROJECT_INTENT",before:{currentPhase:"A"},after:{currentPhase:"B"},createdAt:afterSeen,updatedAt:afterSeen});
    store.insertCommit({...created.commit,id:"intent-b",operationType:"UPDATE_PROJECT_INTENT",before:{objective:"old"},after:{objective:"new"},createdAt:afterSeen,updatedAt:afterSeen});
    let commits=0,ownerships=0;
    const listCommits=store.listCommits.bind(store),listOwnerships=store.listOwnerships.bind(store);
    store.listCommits=input=>{commits++;return listCommits(input);};store.listOwnerships=()=>{ownerships++;return listOwnerships();};
    const item=query.now().items.find(item=>item.workObjectId===id)!;
    assert.equal(item.changesSinceLastSeen,2);assert.equal(store.getWorkObject(id)?.version,1);
    assert.equal(commits,1);
    // One Now ownership collection; additional closure-gate reads remain scoped to parent readiness.
    assert.ok(ownerships<=2);
    const latest=listCommits({targetId:id,status:"COMMITTED"}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]!;
    assert.equal(kernel.reading.markViewed(id,afterSeen).lastSeenCommitId,latest.id);
    assert.equal(query.now().items.length,0);
  } finally {store.close();}
});

test("objectContext captures formal fields and closure state before asynchronous Graph snippets",async()=>{
  const {store,kernel,query,id,broker}=fixture();
  let release!: ()=>void;
  const blocked=new Promise<void>(done=>{release=done;});
  try {
    kernel.context.associateContext({workObjectId:id,sourceRef:{graphId:"graph",blockUuid:"note"},sourceVersionHash:"old",origin:"SYSTEM_STRUCTURAL"});
    broker.status=()=>({available:true,graphId:"graph",reason:"READY",capabilities:[],lastSeenAt:at});
    broker.request=async()=>{await blocked;return {kind:"READ_BLOCK",block:{graphId:"graph",blockUuid:"note",content:"new snippet",contentHash:"new",pageName:null}};};
    const initial=store.getWorkObject(id)!;
    const pending=query.objectContext(id);
    store.putWorkObject({...initial,title:"Changed during IO",version:2});
    release();const pack=await pending;
    assert.equal(pack?.formalVersion,1);assert.equal(pack?.title,initial.title);
    assert.equal(pack?.closureAssessment?.semanticRevision,"1:0");
    assert.equal(pack?.contextRefs[0]?.sourceHash,"new");
    assert.equal(store.getWorkObject(id)?.version,2);
  } finally {release();store.close();}
});
