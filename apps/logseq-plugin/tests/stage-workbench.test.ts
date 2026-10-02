import test from "node:test";
import assert from "node:assert/strict";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";
import { StageStore } from "../src/features/stage-workbench/store.ts";
import { StageRecorder, revisionId } from "../src/features/stage-workbench/recorder.ts";
import { composeDiff, inlineDiff } from "../src/features/stage-workbench/diff.ts";
import { sha256 } from "../src/features/content-writeback/validation.ts";
import type { StageFile, StageSources } from "../src/features/stage-workbench/protocol.ts";
import type { Patch } from "../src/features/content-writeback/protocol.ts";
import { installContentWriteback } from "../src/features/content-writeback/installer.ts";
import { installStageWorkbench } from "../src/features/stage-workbench/installer.ts";

async function setup(){
  const f=await contentFixture();
  const files=new Map<string,StageFile>();
  const sources:StageSources={scope:()=>f.authority.current(),lifetime:()=>f.authority.capture(f.scope),read:async()=>(await f.executor.read(f.scope)).snapshot,result:id=>f.executor.query(f.scope,id),history:()=>f.executor.history(f.scope),file:async id=>{const file=files.get(id);if(!file)throw Error("file missing");return file;}};
  const store=new StageStore(f.storage),recorder=new StageRecorder(store,sources);
  const begin=async(goal="核对测试成果",expectedStageId:string|null=null)=>recorder.begin({goal,requestKey:crypto.randomUUID(),expectedStageId});
  const patch=async(stageId:string)=>{
    const value=f.patch([await f.text(f.a,"Alpha","Revised"),await f.text(f.b,"正文","结果"),await f.child(f.root,"普通工作记录")]);
    value.metadata={stageId,runId:"test-run"};return value;
  };
  const checkpoint=(stageId:string,expectedRevision:string,requestIds:string[]=[],requestKey=crypto.randomUUID())=>recorder.checkpoint({stageId,expectedRevision,requestKey,requestIds});
  return {f,sources,files,store,recorder,begin,patch,checkpoint,cleanup:async()=>{recorder.dispose();await f.cleanup();}};
}
test("durable two-block write plus append forms one immutable revision; queries and repeated observations do not multiply it",async()=>{
  const s=await setup();try{
    const stage=await s.begin(),patch=await s.patch(stage.start.id),actual=await s.f.executor.apply(patch);
    assert.equal(actual.status,"complete");
    const revision=await s.checkpoint(stage.start.id,stage.start.id,[patch.requestId]);
    assert.equal(revision.facts[0]?.record.items.filter(i=>i.status==="APPLIED_VERIFIED").length,3);
    assert.match(revision.source.blocks.find(b=>b.target.blockUuid===s.f.a)!.content!,/Revised/);
    const duplicate=await s.checkpoint(stage.start.id,stage.start.id,[patch.requestId]);
    assert.equal(duplicate.id,revision.id);
    s.f.blocks.get(s.f.a)!.content="后来的用户正文";
    const history=await s.recorder.read(s.f.scope,stage.start.id);
    assert.equal(history.revisions.length,1);
    assert.match(history.revisions[0]!.source.blocks.find(b=>b.target.blockUuid===s.f.a)!.content!,/Revised/);
    assert.equal(s.f.counts().inserts,1);
  }finally{await s.cleanup();}
});
test("acceptance freezes the seen revision even when a newer revision arrived; later native edits do not revoke it or open stages",async()=>{
  const s=await setup();try{
    const stage=await s.begin(),patch=await s.patch(stage.start.id);await s.f.executor.apply(patch);
    const old=await s.checkpoint(stage.start.id,stage.start.id,[patch.requestId]),hash=await sha256(JSON.stringify(old));
    s.f.blocks.get(s.f.b)!.content="本地后改";
    const next=await s.checkpoint(stage.start.id,old.id);
    const acceptance=await s.recorder.acceptLocal(s.f.scope,stage.start.id,old.id,hash);
    assert.equal(acceptance.revisionId,old.id);
    assert.notEqual(acceptance.revisionId,next.id);
    s.f.blocks.get(s.f.b)!.content="再次正常原生编辑";
    const history=await s.store.history(s.f.scope);
    assert.equal(history.stages.length,1);assert.equal(history.stages[0]!.acceptances.length,1);
    assert.equal(history.stages[0]!.revisions.length,2);
    assert.equal(await s.recorder.acceptLocal(s.f.scope,stage.start.id,old.id,hash).then(a=>a.id),acceptance.id);
  }finally{await s.cleanup();}
});
test("a new goal leaves old acceptance pending; explicit activation is required to continue an older stage",async()=>{
  const s=await setup();try{
    const first=await s.begin();const r=await s.checkpoint(first.start.id,first.start.id);
    s.f.blocks.get(s.f.a)!.content="人工间隔编辑";
    const second=await s.begin("第二个目标",first.start.id);
    assert.equal(second.start.previousRevisionId,r.id);
    assert.equal(first.acceptances.length,0);
    await assert.rejects(s.checkpoint(first.start.id,r.id),/STAGE_NOT_CURRENT/);
    await s.recorder.activate({stageId:first.start.id,expectedStageId:second.start.id,requestKey:crypto.randomUUID()});
    assert.equal((await s.store.history(s.f.scope)).current,first.start.id);
    const diff=composeDiff(r.source,second.start.source,null);
    assert.match(diff.get(s.f.a)!.label,/未知/);
  }finally{await s.cleanup();}
});
test("partial/conflict and lost acknowledgements preserve actual meanings, proposed text never becomes confirmed stage output",async()=>{
  const s=await setup();try{
    const stage=await s.begin(),patch=await s.patch(stage.start.id);
    s.f.blocks.get(s.f.b)!.content="外部先改";
    const actual=await s.f.executor.apply(patch);assert.equal(actual.status,"partial");
    const revision=await s.checkpoint(stage.start.id,stage.start.id,[patch.requestId]);
    assert.equal(revision.facts[0]!.record.items[1]!.status,"CONFLICT");
    assert.equal(revision.source.blocks.find(b=>b.target.blockUuid===s.f.b)!.content,"外部先改");
    assert.match(composeDiff(stage.start.source,revision.source,revision).get(s.f.b)!.problem!,/CONFLICT/);
    const op=await s.f.text(s.f.a,"Revised","有回包丢失");
    const lost=s.f.patch([op]);lost.metadata={stageId:stage.start.id,runId:null};
    s.f.onWrite(async(id,text)=>{s.f.blocks.get(id)!.content=text;throw Error("lost host acknowledgement");});
    const unknown=await s.f.executor.apply(lost);assert.equal(unknown.record.items[0]!.status,"OUTCOME_UNKNOWN");
    const r=await s.checkpoint(stage.start.id,revision.id,[lost.requestId]);
    assert.match(composeDiff(stage.start.source,r.source,r).get(s.f.a)!.label,/未知/);
    assert.match(composeDiff(stage.start.source,r.source,r).get(s.f.a)!.problem!,/OUTCOME_UNKNOWN/);
  }finally{await s.cleanup();}
});
test("Journal success and failed stage persistence reconcile after restart without source replay",async()=>{
  const s=await setup();try{
    const stage=await s.begin(),patch=await s.patch(stage.start.id);await s.f.executor.apply(patch);
    const before=s.f.counts();
    s.f.onStorage(async key=>{if(key.startsWith("stage-workbench"))throw Error("stage disk unavailable");});
    await assert.rejects(s.checkpoint(stage.start.id,stage.start.id,[patch.requestId]),/stage disk unavailable/);
    s.f.onStorage(null);s.recorder.dispose();
    const restarted=new StageRecorder(new StageStore(s.f.storage),s.sources);
    const revision=await restarted.reconcile({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:"restart-reconcile"});
    assert.equal(revision.facts.length,1);assert.deepEqual(s.f.counts(),before);
    assert.equal((await restarted.reconcile({stageId:stage.start.id,expectedRevision:revision.id,requestKey:"again"})).id,revision.id);
    restarted.dispose();
  }finally{await s.cleanup();}
});
test("expected revision competition retains a candidate, while the canonical result and acceptance remain immutable",async()=>{
  const s=await setup();try{
    const stage=await s.begin(),r=await s.checkpoint(stage.start.id,stage.start.id);
    s.f.blocks.get(s.f.a)!.content="竞争时的新文";
    await assert.rejects(s.checkpoint(stage.start.id,stage.start.id),/CANDIDATE_RETAINED/);
    const after=await s.recorder.read(s.f.scope,stage.start.id);
    assert.equal(after.revisions.length,1);assert.equal(after.revisions[0]!.id,r.id);assert.equal(after.candidates.length,1);
    const next=await s.checkpoint(stage.start.id,r.id);assert.equal(next.source.blocks.find(b=>b.target.blockUuid===s.f.a)!.content,"竞争时的新文");
  }finally{await s.cleanup();}
});
test("cross-process competing immutable children fail closed and keep both candidates",async()=>{
  const s=await setup();try{
    const stage=await s.begin(),r=await s.checkpoint(stage.start.id,stage.start.id);
    const competitor={...r,id:crypto.randomUUID(),requestKey:"other-process"};
    await s.store.append({schemaVersion:1,id:competitor.id,scope:s.f.scope,stageId:stage.start.id,kind:"revision",revision:competitor});
    const history=await s.store.history(s.f.scope);
    assert.equal(history.stages[0]!.revisions.length,0);assert.equal(history.stages[0]!.candidates.length,2);
    await assert.rejects(s.recorder.acceptLocal(s.f.scope,stage.start.id,r.id,await sha256(JSON.stringify(r))),/SEEN_REVISION_MISMATCH/);
  }finally{await s.cleanup();}
});
test("scope revoke A/B/A and dispose reject late stage capture; no new-scope record appears",async()=>{
  const s=await setup();try{
    const gate=deferred<void>(),read=s.sources.read;
    s.sources.read=async()=>{await gate.promise;return read();};
    const pending=s.begin();await new Promise(resolve=>setTimeout(resolve,20));
    s.recorder.invalidate();gate.resolve();
    await assert.rejects(pending,/SCOPE_REVOKED/);
    assert.equal((await s.store.history(s.f.scope)).stages.length,0);
    s.recorder.dispose();await assert.rejects(s.begin(),/SCOPE_REVOKED/);
  }finally{await s.cleanup();}
});
test("forged shapes, foreign facts and reused IDs cannot authorize or claim a stage",async()=>{
  const s=await setup();try{
    await assert.rejects(s.recorder.begin({goal:"伪造",requestKey:crypto.randomUUID(),expectedStageId:null,actor:"USER"}),/UNKNOWN_FIELD/);
    const stage=await s.begin(),patch=await s.patch(crypto.randomUUID());await s.f.executor.apply(patch);
    await assert.rejects(s.checkpoint(stage.start.id,stage.start.id,[patch.requestId]),/FACT_SCOPE/);
    await assert.rejects(s.recorder.begin({goal:"不同目标",requestKey:stage.start.id,expectedStageId:null}),/KEY_REUSED/);
    await assert.rejects(s.recorder.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:"fake",facts:[]}),/UNKNOWN_FIELD/);
  }finally{await s.cleanup();}
});
test("registered material snapshots preserve old bytes independently, and binary records make no backup promise",async()=>{
  const s=await setup();try{
    const id=crypto.randomUUID(),binary=crypto.randomUUID(),content="# 当时 Markdown\n第一版";
    s.files.set(id,{id,title:"Markdown 成果",path:"/explicit/output.md",role:"output",availability:"available",version:await sha256(content),content,size:32,hash:await sha256(content),editing:{user:true,agent:true},problem:null,retention:"text-snapshot"});
    s.files.set(binary,{id:binary,title:"二进制参考",path:"/explicit/reference.pdf",role:"reference",availability:"available",version:null,content:null,size:200,hash:null,editing:{user:false,agent:false},problem:null,retention:"record-only"});
    const stage=await s.recorder.begin({goal:"登记成果",requestKey:crypto.randomUUID(),expectedStageId:null,fileIds:[id,binary]});
    const updated="新的文件正文";s.files.set(id,{...s.files.get(id)!,content:updated,version:await sha256(updated),hash:await sha256(updated)});
    const r=await s.checkpoint(stage.start.id,stage.start.id);
    s.files.clear();
    const history=await s.recorder.read(s.f.scope,stage.start.id);
    assert.equal(history.start.files[0]!.content,content);assert.equal(r.files[0]!.content,updated);
    assert.equal(r.files[1]!.retention,"record-only");assert.equal(r.files[1]!.editing.user,false);
    assert.equal((await s.recorder.acceptLocal(s.f.scope,stage.start.id,r.id,await sha256(JSON.stringify(r)))).revisionId,r.id);
  }finally{await s.cleanup();}
});
test("block identity, repeat text, removed blocks and long/complex Markdown use bounded honest diff",async()=>{
  assert.equal(inlineDiff("甲 重复 重复 乙","甲 重复 修改 乙"),null);
  assert.equal(inlineDiff("x".repeat(20000),"new"),null);
  assert.equal(inlineDiff("**旧文**","**新文**"),null);
  const diff=inlineDiff("好 😀 旧正文","好 😀 新正文");assert.ok(diff);assert.equal(diff.prefix+diff.inserted+diff.suffix,"好 😀 新正文");
  const s=await setup();try{
    const stage=await s.begin();s.f.blocks.delete(s.f.a);s.f.blocks.get(s.f.root)!.children=s.f.blocks.get(s.f.root)!.children.filter(id=>id!==s.f.a);
    const newId=s.f.add(stage.start.source.blocks.find(b=>b.target.blockUuid===s.f.a)!.content!).uuid;
    const r=await s.checkpoint(stage.start.id,stage.start.id),changes=composeDiff(stage.start.source,r.source,r);
    assert.equal(changes.get(s.f.a)?.kind,"removed");assert.equal(changes.get(newId)?.kind,"added");
  }finally{await s.cleanup();}
});
test("real installed local API writes through content and recovers idempotently, with no accept or actor capability",async()=>{
  const f=await contentFixture();const content=installContentWriteback({journal:f.journal,adapter:f.adapter});
  const installation=installStageWorkbench({content,storage:f.storage});
  try{
    await f.commands.get("content-authorize")!();
    const api=installation.api,stage=await api.begin({goal:"实际程序入口",requestKey:crypto.randomUUID(),expectedStageId:null});
    assert.equal("accept" in api,false);
    const source=await content.api.read(),block=source.blocks.find(b=>b.target.blockUuid===f.a)!;
    const patch:Patch={schemaVersion:1,requestId:crypto.randomUUID(),scope:source.scope,metadata:{stageId:stage.start.id,runId:null},operations:[{operationId:"edit",type:"replace-text",target:block.target,expectedContentVersion:block.contentVersion!,expectedParentUuid:block.parentUuid,range:{start:0,end:5},expectedText:"Alpha",text:"Result",context:null}]};
    const result=await api.submit({stageId:stage.start.id,expectedRevision:revisionId(stage),patch});
    assert.equal(result.status,"complete");assert.ok(result.stageRevision);assert.equal(result.record.origin.kind,"local-capability");
    const count=f.counts().writes;
    const duplicate=await api.submit({stageId:stage.start.id,expectedRevision:revisionId(stage),patch});
    assert.equal(duplicate.stageRevision,result.stageRevision);assert.equal(f.counts().writes,count);
    await assert.rejects(api.submit({stageId:stage.start.id,expectedRevision:revisionId(stage),patch,actor:"USER"}),/UNKNOWN_FIELD/);
  }finally{installation.dispose();content.dispose();await f.cleanup();}
});
