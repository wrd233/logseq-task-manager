import {mkdir,readFile,writeFile,readdir,rename,stat} from "node:fs/promises";
import {MaterialService} from "../src/features/materials/service.ts";
import {MaterialDirectories} from "../src/workspace/material-context.ts";
import type {FileIO} from "../src/host/file-io.ts";
import {SourceReader} from "../src/workspace/source-reader.ts";
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
    const resolved=await s.recorder.resolveCandidate({stageId:stage.start.id,expectedRevision:stage.start.id,candidateRevision:r.id,requestKey:crypto.randomUUID()});
    assert.equal(resolved.problems.length,0);assert.equal(resolved.revisions[0]!.id,r.id);assert.equal(resolved.candidates.length,1);
    assert.equal((await s.recorder.acceptLocal(s.f.scope,stage.start.id,r.id,await sha256(JSON.stringify(r)))).revisionId,r.id);
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
test("persisted id metadata does not prevent a precise plain-text change marker or alter its version facts",async()=>{
  const s=await setup();try{
    const block=s.f.blocks.get(s.f.a)!;block.content=`沿用已有目录。每天都要重建目录。\nid:: ${s.f.a}`;
    const stage=await s.begin();block.content=`沿用已有目录。\nid:: ${s.f.a}`;
    const r=await s.checkpoint(stage.start.id,stage.start.id),change=composeDiff(stage.start.source,r.source,r).get(s.f.a)!;
    assert.ok(change.inline);assert.equal(change.inline.inserted,"");
    assert.equal(change.inline.prefix+change.inline.suffix,"沿用已有目录。\n");
    assert.equal(change.before,stage.start.source.blocks.find(b=>b.target.blockUuid===s.f.a)!.content);
    assert.equal(change.after,block.content);assert.equal(change.version,r.source.blocks.find(b=>b.target.blockUuid===s.f.a)!.contentVersion);
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

test("installed stage adapter retains real MaterialService versions and permissions using the formal unbound source provider",async()=>{
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter}),directory=f.directory+"/materials";await mkdir(directory);
  const io:FileIO={read:p=>readFile(p,"utf8"),write:(p,t)=>writeFile(p,t),list:readdir,rename,mkdir:async p=>{await mkdir(p,{recursive:true});},stat:async p=>{const s=await stat(p);return {type:s.isDirectory()?"directory":"file",size:s.size};}};
  const materials=new MaterialService(io,new MaterialDirectories(localStorage),"/A",directory,t=>t),context={graph:"/A",sourceUuid:f.root,directory,organization:"flat" as const};
  const reader=new SourceReader({graphId:async()=>f.scope.graphId,getBlock:(id,options)=>logseq.Editor.getBlock(id,options)});
  let workspaceVersion="0";
  const stages=installStageWorkbench({content,storage:f.storage,source:{read:(s,v)=>reader.read(s,v),version:()=>workspaceVersion},materials:{read:id=>materials.read(id),list:async()=>[]}});
  try{
    await content.local.authorize(f.root);
    const output=await materials.capture({requestKey:"real-output",text:"第一版成果",role:"output"},context),reference=await materials.capture({requestKey:"real-ref",text:"只读输入",role:"reference"},context);
    const stage=await stages.api.begin({goal:"真实文件版本",requestKey:crypto.randomUUID(),expectedStageId:null,fileIds:[output.material.id,reference.material.id]});
    assert.equal(stage.start.source.blocks[0]!.parentUuid,null);assert.equal(stage.start.files[1]!.editing.user,false);
    await materials.save(output.material.id,output.material.version!,output.material.content!,"保存后的成果","user");
    await assert.rejects(materials.save(reference.material.id,reference.material.version!,reference.material.content!,"越权","agent"));
    const r=await stages.api.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:"saved-material",requestIds:[]});
    assert.equal(r.files[0]!.content,"保存后的成果");assert.equal(stage.start.files[0]!.content,"第一版成果");
    await writeFile(output.material.path,"后来外部修改");assert.equal((await stages.api.read({stageId:stage.start.id})).revisions[0]!.files[0]!.content,"保存后的成果");
    const gate=deferred<void>(),read=reader.read.bind(reader);reader.read=async(s,v)=>{await gate.promise;return read(s,v);};
    const pending=stages.api.checkpoint({stageId:stage.start.id,expectedRevision:r.id,requestKey:"late",requestIds:[]});await new Promise(r=>setTimeout(r,15));workspaceVersion="1";gate.resolve();await assert.rejects(pending,/EXPIRED|REVOKED/);
  }finally{stages.dispose();content.dispose();await f.cleanup();}
});

test("torn metadata publication recovers verified prepared bytes; interrupted preparation is retained without changing stage or replaying content",async()=>{
  const s=await setup();try{
    const stage=await s.begin();let failed=false;
    s.f.onStorage(async key=>{if(!failed&&key.startsWith("stage-workbench-v1-")){failed=true;await writeFile(s.f.directory+"/"+key,"torn");throw Error("publication lost");}});
    await assert.rejects(s.checkpoint(stage.start.id,stage.start.id),/publication lost/);s.f.onStorage(null);
    const recovered=await s.store.history(s.f.scope);assert.equal(recovered.stages[0]!.revisions.length,1);assert.equal(recovered.problems.length,0);assert.match(recovered.storageNotes![0]!,/完整准备/);
    s.f.blocks.get(s.f.a)!.content="Journal 对账前可读现文";failed=false;
    s.f.onStorage(async key=>{if(!failed&&key.startsWith("stage-prepared-v1-")){failed=true;await writeFile(s.f.directory+"/"+key,"torn");throw Error("preparation lost");}});
    await assert.rejects(s.checkpoint(stage.start.id,revisionId(recovered.stages[0]!)),/preparation lost/);s.f.onStorage(null);
    const after=await s.store.history(s.f.scope);assert.equal(after.stages[0]!.revisions.length,1);assert.match(after.storageNotes!.join(" "),/未确认的准备/);
    const next=await s.checkpoint(stage.start.id,revisionId(after.stages[0]!));assert.match(next.source.blocks.find(b=>b.target.blockUuid===s.f.a)!.content!,/对账/);assert.equal(s.f.counts().writes,0);
  }finally{await s.cleanup();}
});

test("an observed new block from an unknown insertion can be corrected in the same stage without upgrading the unknown request",async()=>{
  const s=await setup();try{
    const stage=await s.begin(),patch=s.f.patch([await s.f.child(s.f.root,"未知回包的实际建议")]);patch.metadata={stageId:stage.start.id,runId:null};
    s.f.onInsert(async()=>{throw Error("lost insertion acknowledgment");});const unknown=await s.f.executor.apply(patch);s.f.onInsert(null);
    const first=await s.checkpoint(stage.start.id,stage.start.id,[patch.requestId]),child=unknown.record.items[0]!.childUuid!;
    assert.equal(unknown.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.ok(first.source.blocks.some(b=>b.target.blockUuid===child));
    const correction=s.f.patch([await s.f.text(child,"实际建议","用户修正")]);correction.metadata={stageId:stage.start.id,runId:null};await s.f.executor.apply(correction,{kind:"local-user-command",command:"stage-review-edit"});
    const next=await s.checkpoint(stage.start.id,first.id,[correction.requestId]);
    assert.equal(next.facts.find(f=>f.record.patch.requestId===patch.requestId)!.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.match(next.source.blocks.find(b=>b.target.blockUuid===child)!.content!,/用户修正/);
  }finally{await s.cleanup();}
});

test("same submit after an explicit identity recovery records the new fact version exactly once and never inserts the body again",async()=>{
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter}),stages=installStageWorkbench({content,storage:f.storage});
  try{
    await content.local.authorize(f.root);const stage=await stages.api.begin({goal:"恢复同一写回事实",requestKey:crypto.randomUUID(),expectedStageId:null});
    const patch=f.patch([await f.child(f.root,"身份尚未确认的建议")]);patch.metadata={stageId:stage.start.id,runId:null};
    f.onIdentity(async()=>{throw Error("identity lost");});const first=await stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch});f.onIdentity(null);
    assert.equal(first.status,"partial");assert.ok(first.stageRevision);
    const updated=await content.api.resumeIdentity({requestId:patch.requestId,operationId:patch.operations[0]!.operationId});assert.equal(updated.status,"complete");
    const second=await stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch});assert.equal(second.status,"complete");assert.notEqual(second.stageRevision,first.stageRevision);assert.equal(second.stageProblem,null);
    const third=await stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch});assert.equal(third.stageRevision,second.stageRevision);assert.equal(f.counts().inserts,1);
    const history=await stages.api.history();assert.equal(history.stages[0]!.revisions.find(r=>r.id===first.stageRevision)!.facts[0]!.status,"partial");assert.equal(history.stages[0]!.revisions.at(-1)!.facts[0]!.status,"complete");
  }finally{stages.dispose();content.dispose();await f.cleanup();}
});
