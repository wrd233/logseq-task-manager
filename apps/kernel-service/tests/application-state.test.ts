import assert from "node:assert/strict";
import test from "node:test";
import { ContextAssociations, UserReading, Kernel } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { parseSemanticOperation } from "@task-copilot/contracts";

const at = "2026-10-01T00:00:00.000Z";
function setup() {
  const store = new SqliteStore(":memory:"), kernel = new Kernel(store, { now: () => at });
  const created = kernel.commitFormal(parseSemanticOperation({operationId:"create",type:"CREATE_WORK_OBJECT",actor:{type:"USER",id:"local-user"},input:{kind:"TASK",title:"test",anchor:{graphId:"graph",blockUuid:"source",sourceContentHash:"a1b2c3d4"}}}),{graphId:"graph",sourceBlockUuid:"source",sourceContentHash:"a1b2c3d4",projection:null});
  return {store,kernel,id:created.commit.targetId!};
}

test("context application preserves deterministic ID, Graph scope and correction atomicity", () => {
  const {store,id}=setup();
  try {
    const input={workObjectId:id,sourceRef:{graphId:"graph",blockUuid:"note"},sourceVersionHash:"deadbeef",origin:"SYSTEM_STRUCTURAL" as const};
    const a=new ContextAssociations(store, () => at).associateContext(input);
    assert.deepEqual(new ContextAssociations(store, () => at).associateContext({...input,sourceVersionHash:"changed"}),a);
    const other=new ContextAssociations(store, () => at).associateContext({...input,sourceRef:{graphId:"other",blockUuid:"note"}});
    assert.notEqual(other.id,a.id);
    const write=store.putAssociationCorrection;
    store.putAssociationCorrection=()=>{throw Error("injected correction failure");};
    const correction={sourceRef:input.sourceRef,rejectedWorkObjectId:id,scopeSnapshot:"snapshot",userDecisionRef:"user-correction"};
    assert.throws(()=>new ContextAssociations(store, () => at).recordAssociationCorrection(correction),/injected correction failure/u);
    assert.equal(store.getContextAssociation(a.id)?.status,"ACTIVE");
    assert.equal(store.findActiveCorrection("graph","note",id),null);
    store.putAssociationCorrection=write;
    new ContextAssociations(store, () => at).recordAssociationCorrection(correction);
    assert.equal(store.getContextAssociation(a.id)?.status,"INVALIDATED");
    assert.equal(store.getContextAssociation(other.id)?.status,"ACTIVE");
    assert.throws(()=>new ContextAssociations(store, () => at).associateContext(input),/ASSOCIATION_CORRECTION_BLOCKS/u);
    const before=store.getWorkObject(id)!;
    store.putWorkObject({...before,lifecycle:"COMPLETED"});
    assert.throws(()=>new ContextAssociations(store, () => at).associateContext({...input,sourceRef:{graphId:"graph",blockUuid:"new"}}),/CONTEXT_TARGET_INVALID/u);
  } finally {store.close();}
});

test("reading capability uses only target commits and never mutates formal state or ledger",()=>{
  const {store,id}=setup();
  try {
    const before=store.getWorkObject(id), ledger=store.listCommits();
    let query: unknown;
    const list=store.listCommits.bind(store);
    store.listCommits=input=>{query=input;return list(input);};
    const baseline=new UserReading(store, () => at).markViewed(id,"2026-10-01T01:00:00Z");
    assert.deepEqual(query,{targetId:id,status:"COMMITTED"});
    assert.equal(baseline.lastViewedFormalVersion,1);
    assert.equal(baseline.lastSeenCommitId,ledger[0]!.id);
    assert.deepEqual(store.getWorkObject(id),before);
    assert.deepEqual(store.listCommits(),ledger);
    assert.throws(()=>new UserReading(store, () => at).markViewed("unknown"),/WORK_OBJECT_NOT_FOUND/u);
  } finally {store.close();}
});
