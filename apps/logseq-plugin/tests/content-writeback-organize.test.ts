import test from "node:test";
import assert from "node:assert/strict";
import {contentFixture,deferred} from "./fixtures/content-writeback.ts";
import type {MoveOperation,Patch} from "../src/features/content-writeback/protocol.ts";
import {parsePatch} from "../src/features/content-writeback/validation.ts";
import {installContentWriteback} from "../src/features/content-writeback/installer.ts";
import {StageStore} from "../src/features/stage-workbench/store.ts";
import {StageRecorder} from "../src/features/stage-workbench/recorder.ts";
import {blockIdentityCache} from "../src/block-identity.ts";
import {composeDiff} from "../src/features/stage-workbench/diff.ts";

type Fixture=Awaited<ReturnType<typeof contentFixture>>;
async function authorize(f:Fixture){const lease=f.authority.bind(f.scope,true);f.authority.confirmRoot(lease,(await f.executor.read(f.scope)).paths.get(f.root)!);}
async function move(f:Fixture,src=f.a,dst=f.b,position:MoveOperation["position"]="after"):Promise<MoveOperation>{
  const read=(await f.executor.read(f.scope)).snapshot,a=read.blocks.find(b=>b.target.blockUuid===src)!,b=read.blocks.find(b=>b.target.blockUuid===dst)!;
  return {type:"move-block",operationId:crypto.randomUUID(),target:a.target,expectedContentVersion:a.contentVersion!,expectedParentUuid:a.parentUuid,destination:b.target,expectedDestinationVersion:b.contentVersion!,expectedDestinationParentUuid:b.parentUuid,position,expectedStructureVersion:read.structureVersion};
}
const patch=(f:Fixture,op:MoveOperation):Patch=>({...f.patch([op]),schemaVersion:2});
for(const position of ["before","after","first-child"] as const)test(`native ${position} preserves UUID, subtree, raw text, properties and idempotence`,async()=>{
  const f=await contentFixture();try{
    await authorize(f);const child=f.add("[注] 条件\n[链接](longdoc://stable)",f.a);child.properties.alias="别名";f.blocks.get(f.a)!.properties.id=f.a;f.blocks.get(f.a)!.content+=`\nid:: ${f.a}`;
    if(position==="before")f.nativeMove(f.a,f.b,{before:false});
    const op=await move(f,f.a,f.b,position),input=patch(f,op),before=f.blocks.get(f.a)!.content;
    const applied=await f.executor.apply(input);assert.equal(applied.status,"complete",JSON.stringify(applied));assert.equal(applied.record.items[0]!.move!.verified,true);
    assert.equal(f.blocks.get(f.a)!.content,before);assert.deepEqual(child.properties,{alias:"别名"});assert.equal(f.blocks.get(f.a)!.children[0],child.uuid);
    assert.equal(f.blocks.get(f.a)!.parent.id,f.blocks.get(position==="first-child"?f.b:f.root)!.id);
    assert.equal(f.counts().moves,1);assert.equal(f.counts().inserts,0);assert.equal(f.counts().writes,0);
    f.nativeMove(f.a,f.root,{children:true});f.blocks.get(f.a)!.content+="\n后来人工输入";
    assert.deepEqual((await f.createExecutor().apply(input)).record,applied.record);assert.equal(f.counts().moves,1);
    await assert.rejects(f.executor.apply({...input,operations:[{...op,position:position==="before"?"after":"before"}]}),/IDEMPOTENCY_KEY_REUSED/);
  }finally{await f.cleanup();}
});
test("schema negotiation and trusted structure permission cannot be supplied by input",async()=>{
  const f=await contentFixture();try{
    const op=await move(f),p=patch(f,op);assert.throws(()=>parsePatch({...p,schemaVersion:1}),/MOVE_REQUIRES_SCHEMA_2/);assert.throws(()=>parsePatch({...p,authorized:true,actor:"USER"}),/UNSUPPORTED_FIELD/);
    assert.equal((await f.executor.apply(p)).record.items[0]!.reason,"STRUCTURE_AUTHORIZATION_REQUIRED");assert.equal(f.counts().moves,0);
    const installation=installContentWriteback();await f.commands.get("content-authorize-organize")!();assert.equal(installation.api.capabilities().structureAuthorized,true);
    const source=await installation.api.read();const a=source.blocks.find(b=>b.target.blockUuid===f.a)!,b=source.blocks.find(b=>b.target.blockUuid===f.b)!;
    assert.equal((await installation.api.apply({...p,requestId:crypto.randomUUID(),operations:[{...op,expectedContentVersion:a.contentVersion,expectedParentUuid:a.parentUuid,expectedDestinationVersion:b.contentVersion,expectedDestinationParentUuid:b.parentUuid,expectedStructureVersion:source.structureVersion}]})).status,"complete");
    installation.dispose();assert.equal(installation.api.scope(),null);assert.equal(installation.api.capabilities().structureAuthorized,false);
  }finally{await f.cleanup();}
});
for(const mutation of ["source","target","parent","neighbor"] as const)test(`stale ${mutation} refuses without moving`,async()=>{
  const f=await contentFixture();try{await authorize(f);const op=await move(f);
    if(mutation==="source")f.blocks.get(f.a)!.content+="changed";
    if(mutation==="target")f.blocks.get(f.b)!.content+="changed";
    if(mutation==="parent")f.move(f.a,f.b);
    if(mutation==="neighbor")f.add("新的邻接记录");
    const result=await f.executor.apply(patch(f,op));assert.equal(result.record.items[0]!.status,"CONFLICT");assert.equal(f.counts().moves,0);
  }finally{await f.cleanup();}
});
test("unrelated text is allowed; cycles, root, membership and forged graph are refused",async()=>{
  const f=await contentFixture();try{await authorize(f);const extra=f.add("旁边正文"),op=await move(f);extra.content+="人类添加";assert.equal((await f.executor.apply(patch(f,op))).status,"complete");
    const child=f.add("普通子树",f.a);assert.equal((await f.executor.apply(patch(f,await move(f,f.a,child.uuid)))).record.items[0]!.reason,"MOVE_CYCLE");
    assert.equal((await f.executor.apply(patch(f,await move(f,f.root,f.b)))).record.items[0]!.reason,"MOVE_ROOT_FORBIDDEN");
    const outside=f.add("范围外","");assert.equal((await f.executor.apply(patch(f,{...await move(f),destination:{...op.destination,blockUuid:outside.uuid}}))).record.items[0]!.reason,"MOVE_MEMBER_UNAVAILABLE");
    assert.throws(()=>parsePatch(patch(f,{...op,destination:{...op.destination,graphId:"forged"}})),/TARGET_GRAPH_MISMATCH/);
  }finally{await f.cleanup();}
});
test("MiniProject ordinary notes and TODO move within ownership; formal/managed wrappers and another object cannot",async()=>{
  const f=await contentFixture();try{
    f.blocks.get(f.root)!.content="**[MiniProject]** 整理一份调研材料 #MiniProject";f.blocks.get(f.a)!.content="TODO 核对条件";f.blocks.get(f.b)!.content="[想法] 保留反例";await authorize(f);
    assert.equal((await f.executor.apply(patch(f,await move(f)))).status,"complete");assert.equal(f.blocks.get(f.a)!.content,"TODO 核对条件");
    assert.equal((await f.executor.apply(f.patch([await f.text(f.a,"TODO","DONE")]))).record.items[0]!.reason,"PROTECTED_TODO");
    const other=f.add("**[MiniProject]** 别的对象 #MiniProject"),target=f.add("普通记录",other.uuid);
    assert.equal((await f.executor.apply(patch(f,await move(f,f.a,target.uuid)))).record.items[0]!.reason,"MOVE_OBJECT_OWNERSHIP_CONFLICT");
    const wrapper=f.add("普通外壳"),formal=f.add("TODO **[事务]** 不可转挂",wrapper.uuid);
    assert.equal((await f.executor.apply(patch(f,await move(f,wrapper.uuid,f.b)))).record.items[0]!.reason,"PROTECTED_MOVE_SUBTREE");
    formal.content="task-copilot-managed:: true";
    assert.equal((await f.executor.apply(patch(f,await move(f,wrapper.uuid,f.b)))).record.items[0]!.reason,"PROTECTED_MOVE_SUBTREE");
  }finally{await f.cleanup();}
});
for(const editing of ["source","child","destination","parent","composition"] as const)test(`editing guard protects ${editing}`,async()=>{
  const f=await contentFixture();try{await authorize(f);const child=f.add("子树",f.a),op=await move(f);
    if(editing==="composition"){const input=f.browser.document.createElement("textarea");f.browser.document.body.append(input);input.dispatchEvent(new f.browser.Event("compositionstart",{bubbles:true}));}
    else f.editing({source:f.a,child:child.uuid,destination:f.b,parent:f.root}[editing]);
    const result=await f.executor.apply(patch(f,op));assert.equal(result.record.items[0]!.status,"BLOCKED");assert.equal(f.counts().moves,0);
  }finally{await f.cleanup();}
});
for(const failure of ["lost-reply","timeout","readback","journal-intent","journal-result","graph"] as const)test(`${failure} is recoverable without repeating a move`,async()=>{
  const f=await contentFixture(20);try{await authorize(f);const op=await move(f),input=patch(f,op),gate=deferred<void>(),entered=deferred<void>();
    if(failure==="lost-reply")f.onMove(async(id,target,opts)=>{f.nativeMove(id,target,opts);throw Error("reply lost");});
    if(failure==="timeout"||failure==="graph")f.onMove(async(id,target,opts)=>{entered.resolve();await gate.promise;f.nativeMove(id,target,opts);});
    if(failure==="readback")f.onMove(async(id,target,opts)=>{f.nativeMove(id,target,opts);f.blocks.get(id)!.content+="external change";});
    if(failure.startsWith("journal"))f.onStorage(async(_k,v)=>{const item=JSON.parse(v).items[0];if(item.phase===(failure==="journal-intent"?"EXECUTING":"SETTLED"))throw Error("disk failed");});
    const running=f.executor.apply(input);
    if(failure==="graph"){await entered.promise;f.graph("B");}
    const result=await running;gate.resolve();await new Promise(r=>setTimeout(r,5));
    if(failure==="graph"){f.graph("A");await authorize(f);}
    f.onStorage(null);f.onMove(null);const count=f.counts().moves;
    assert.equal(count,failure==="journal-intent"?0:1);
    if(failure==="journal-intent")assert.equal(result.durable,false);else if(failure==="journal-result")assert.equal(result.durable,false);else assert.equal(result.record.items[0]!.status,"OUTCOME_UNKNOWN");
    const old=await f.createExecutor().apply(input);assert.equal(f.counts().moves,count);
    const recovered=await f.createExecutor().recover(f.scope,input.requestId);assert.equal(f.counts().moves,count);
    if(failure!=="journal-intent")assert.equal(recovered.record.items[0]!.status,"OUTCOME_UNKNOWN");
    if(failure==="lost-reply"||failure==="timeout"||failure==="journal-result")assert.equal(recovered.record.items[0]!.expectationObserved,true,JSON.stringify(recovered));
    assert.equal(old.record.origin.kind,"local-capability");
  }finally{await f.cleanup();}
});
test("mixed batch records one move and one stale text; dependent moves need new source structure",async()=>{
  const f=await contentFixture();try{await authorize(f);const op=await move(f),text=await f.text(f.b,"正文","润色");f.blocks.get(f.b)!.content+="human";
    const input={...f.patch([op,text]),schemaVersion:2 as const};const result=await f.executor.apply(input);assert.equal(result.status,"not-applied");
    const nextMove=await move(f),stale={...await f.text(f.a,"Beta","修改"),expectedContentVersion:"0".repeat(64)};
    const partial=await f.executor.apply({...f.patch([nextMove,stale]),schemaVersion:2});assert.equal(partial.status,"partial");assert.deepEqual(partial.record.items.map(i=>i.status),["APPLIED_VERIFIED","CONFLICT"]);
    const duplicate=await move(f,f.a,f.b,"before");const ordered=await f.executor.apply({...f.patch([duplicate,{...duplicate,operationId:"dependent",position:"after"}]),schemaVersion:2});assert.deepEqual(ordered.record.items.map(i=>i.status),["APPLIED_VERIFIED","CONFLICT"]);
  }finally{await f.cleanup();}
});
test("pure moves create immutable stage revisions; later manual moves are never attributed to an old write",async()=>{
  const f=await contentFixture();try{await authorize(f);
    const store=new StageStore(f.storage),recorder=new StageRecorder(store,{scope:()=>f.scope,lifetime:()=>f.authority.capture(f.scope),read:async()=>(await f.executor.read(f.scope)).snapshot,result:id=>f.executor.query(f.scope,id),history:()=>f.executor.history(f.scope),file:async()=>{throw Error("not needed");}});
    const stage=await recorder.begin({goal:"保留原文整理位置",requestKey:crypto.randomUUID(),expectedStageId:null});
    const input={...patch(f,await move(f)),metadata:{stageId:stage.start.id,runId:null}};await f.executor.apply(input);
    const revision=await recorder.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:"move-stage",requestIds:[input.requestId],fileIds:[]});
    assert.notEqual(revision.source.structureVersion,stage.start.source.structureVersion);assert.equal(revision.source.blocks.find(b=>b.target.blockUuid===f.a)!.contentVersion,stage.start.source.blocks.find(b=>b.target.blockUuid===f.a)!.contentVersion);
    const diff=composeDiff(stage.start.source,revision.source,revision);assert.equal(diff.get(f.a)!.kind,"structure");
    const frozen=JSON.stringify(await store.history(f.scope));f.nativeMove(f.a,f.b,{before:true});assert.equal(JSON.stringify(await store.history(f.scope)),frozen);
    const later=composeDiff(revision.source,(await f.executor.read(f.scope)).snapshot,revision);assert.match(later.get(f.a)!.label,/来源未知 \/ 人工间隔变化/);
  }finally{await f.cleanup();}
});
test("queued moves stop after revoke; already dispatched move stays unknown until actual SDK settles",async()=>{
  const f=await contentFixture(100),gate=deferred<void>();try{await authorize(f);const op=await move(f),entered=deferred<void>(),queuedSaved=deferred<void>();f.onMove(async(id,target,opts)=>{entered.resolve();await gate.promise;f.nativeMove(id,target,opts);});
    const queuedInput=patch(f,{...op,operationId:"queued"});f.onStorage(async(_key,value)=>{if(JSON.parse(value).patch.requestId===queuedInput.requestId)queuedSaved.resolve();});
    const running=f.executor.apply(patch(f,op));await entered.promise;const queued=f.executor.apply(queuedInput),both=Promise.all([running,queued]);await queuedSaved.promise;f.authority.revoke();
    const [sent,waiting]=await both;assert.equal(sent.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(waiting.record.items[0]!.status,"BLOCKED");assert.equal(f.counts().moves,1);
    gate.resolve();await new Promise(r=>setTimeout(r,5));
  }finally{gate.resolve();await new Promise(r=>setTimeout(r,5));await f.cleanup();}
});
test("unsupported SDK and properties readback mismatch fail closed; native id representation is recorded separately",async()=>{
  const f=await contentFixture();try{await authorize(f);const op=await move(f),sdk=logseq.Editor.moveBlock;logseq.Editor.moveBlock=undefined as unknown as typeof sdk;
    assert.equal((await f.executor.apply(patch(f,op))).record.items[0]!.reason,"MOVE_UNSUPPORTED_BY_HOST");assert.equal(f.counts().moves,0);logseq.Editor.moveBlock=sdk;
    f.onMove(async(id,target,opts)=>{f.nativeMove(id,target,opts);f.blocks.get(id)!.properties.alias="external overwrite";});
    assert.equal((await f.executor.apply(patch(f,op))).record.items[0]!.reason,"MOVE_READBACK_PROPERTY_MISMATCH");
    f.onMove(async(id,target,opts)=>{f.nativeMove(id,target,opts);f.blocks.get(id)!.properties.id=id;f.blocks.get(id)!.content+=`\nid:: ${id}`;});
    const next=await move(f,f.a,f.b,"before"),r=await f.executor.apply(patch(f,next));assert.equal(r.status,"complete");assert.notEqual(r.record.items[0]!.baseVersion,r.record.items[0]!.actualVersion);assert.equal(r.record.items[0]!.move!.verified,true);
  }finally{await f.cleanup();}
});
test("empty/no-op move remains NO_CHANGE and unrelated request then advances normally",async()=>{
  const f=await contentFixture();try{await authorize(f);const op=await move(f,f.a,f.b,"before"),r=await f.executor.apply(patch(f,op));assert.equal(r.record.items[0]!.status,"NO_CHANGE");assert.equal(f.counts().moves,0);
    assert.equal((await f.executor.apply(patch(f,await move(f)))).status,"complete");
  }finally{await f.cleanup();}
});
test("first-child prepends to existing children; descendant changes between intent and dispatch stop SDK",async()=>{
  const f=await contentFixture();try{await authorize(f);const existing=f.add("已有子块",f.b),child=f.add("必须保留的限制",f.a),op=await move(f,f.a,f.b,"first-child");
    let changed=false;f.onStorage(async(_key,value)=>{if(!changed&&JSON.parse(value).items[0].phase==="EXECUTING"){changed=true;child.content+="外部改动";}});
    const blocked=await f.executor.apply(patch(f,op));assert.equal(blocked.record.items[0]!.reason,"SUBTREE_CONTENT_CONFLICT");assert.equal(f.counts().moves,0);
    f.onStorage(null);const applied=await f.executor.apply(patch(f,await move(f,f.a,f.b,"first-child")));assert.equal(applied.status,"complete");assert.deepEqual(f.blocks.get(f.b)!.children,[f.a,existing.uuid]);assert.equal(child.content,"必须保留的限制外部改动");
  }finally{await f.cleanup();}
});
test("old text and child journals remain queryable next to v2; corrupt movement facts never become success",async()=>{
  const f=await contentFixture();try{await authorize(f);const old=f.patch([await f.text(f.b,"正文","润色")]);const oldResult=await f.executor.apply(old);
    const added=f.patch([await f.child(f.b,"[注] 新的普通记录")]);const child=await f.executor.apply(added);const input=patch(f,await move(f)),moved=await f.executor.apply(input);
    assert.deepEqual((await f.createExecutor().query(f.scope,old.requestId))!.record,oldResult.record);assert.deepEqual((await f.createExecutor().query(f.scope,added.requestId))!.record,child.record);
    const corrupt=structuredClone(moved.record);corrupt.sequence++;corrupt.items[0]!.move!.after!.scope.rootUuid=f.a;await f.journal.save(corrupt);await assert.rejects(f.createExecutor().query(f.scope,input.requestId),/WORKSPACE_INVALID_TOPOLOGY/);
    await assert.rejects(f.createExecutor().apply(input),/WORKSPACE_INVALID_TOPOLOGY/);assert.equal(f.counts().moves,1);
  }finally{await f.cleanup();}
});
test("registered conflict UI explains location, preserves proposal on close and retries only with new source",async()=>{
  const f=await contentFixture();const content=installContentWriteback({journal:f.journal,adapter:f.adapter});try{await content.local.authorize(f.root,true);const op=await move(f),input=patch(f,op);f.add("后来添加的邻块");
    const result=await content.api.apply(input);assert.equal(result.record.items[0]!.status,"CONFLICT");await f.commands.get("content-recovery")!();
    document.querySelector<HTMLButtonElement>('[data-content-reason="STRUCTURE_VERSION_CONFLICT"]')!.click();
    for(let i=0;i<100&&!document.body.textContent?.includes("按当前结构重新提交此移动");i++)await new Promise(r=>setTimeout(r,5));
    assert.match(document.body.textContent!,/位置提议.*另一个块/s);assert.equal(document.querySelectorAll('[data-content-writeback] textarea').length,0);
    const close=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-content-writeback] button')).find(b=>b.textContent==="关闭")!;close.click();assert.equal((await content.api.result(input.requestId))!.record.items[0]!.status,"CONFLICT");
    await f.commands.get("content-recovery")!();document.querySelector<HTMLButtonElement>('[data-content-reason="STRUCTURE_VERSION_CONFLICT"]')!.click();
    for(let i=0;i<100&&!document.body.textContent?.includes("按当前结构重新提交此移动");i++)await new Promise(r=>setTimeout(r,5));
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-content-writeback] button')).find(b=>b.textContent==="按当前结构重新提交此移动")!.click();
    for(let i=0;i<100&&f.counts().moves===0;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.counts().moves,1);
    const deadline=Date.now()+5000;
    while(!document.body.textContent?.includes("此范围没有需要恢复的正文提议")&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
    assert.match(document.body.textContent!,/此范围没有需要恢复的正文提议/);
    const retries=(await content.api.history()).filter(result=>result.record.retryOf===input.requestId);
    assert.equal(retries.length,1);assert.equal(retries[0]!.status,"complete");assert.equal(retries[0]!.record.items[0]!.status,"APPLIED_VERIFIED");
    assert.equal((await content.api.result(input.requestId))!.record.patch.requestId,input.requestId);
  }finally{content.dispose();await f.cleanup();}
});
test("stage review renders same UUID movement with old/new position; accepted history stays immutable",async()=>{
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter});
  const {WorkView}=await import("../src/features/work-view/controller.ts"),{installStageWorkbench}=await import("../src/features/stage-workbench/installer.ts");const work=new WorkView(()=>{}, {initialReadingMode:"structure"}),stages=installStageWorkbench({content,work,storage:f.storage});
  try{await content.local.authorize(f.root,true);await work.open(f.root);await work.setReviewOpen(true);const stage=await stages.api.begin({goal:"核验位置变化",requestKey:crypto.randomUUID(),expectedStageId:null});
    const input={...patch(f,await move(f)),metadata:{stageId:stage.start.id,runId:null}},result=await stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch:input});assert.equal(result.stageProblem,null);await work.refresh();
    document.querySelector<HTMLButtonElement>(".wb-stage-bar>button")!.click();const row=document.querySelector<HTMLElement>(`article[data-uuid="${f.a}"]`)!;assert.match(row.textContent!,/结构变化/);assert.match(row.textContent!,/位置：.*→/);assert.doesNotMatch(row.textContent!,/新增|块已缺失/);
    await f.commands.get("stage-accept")!();const frozen=JSON.stringify(await stages.api.history());f.nativeMove(f.a,f.b,{before:true});await work.refresh();assert.equal(JSON.stringify(await stages.api.history()),frozen);
    assert.match(document.querySelector<HTMLElement>(`article[data-uuid="${f.a}"]`)!.textContent!,/来源未知 \/ 人工间隔变化/);
  }finally{stages.dispose();work.dispose();content.dispose();await f.cleanup();}
});

test("known formal MiniProject with unavailable managed index retains ambiguity protection",async()=>{
  const f=await contentFixture(),oldGraph=blockIdentityCache.scope().graphId;try{f.blocks.get(f.root)!.content="**[MiniProject]** 已正式纳入 #MiniProject";const current=blockIdentityCache.activate(f.scope.graphId);blockIdentityCache.setFormal(f.root,{kind:"FORMAL",workObjectId:"known",objectKind:"MINI_PROJECT"},current);await authorize(f);
    assert.equal((await f.executor.apply(patch(f,await move(f,f.b,f.a)))).record.items[0]!.reason,"PROTECTED_MOVE_SUBTREE");
    assert.equal((await f.executor.apply(f.patch([await f.text(f.b,"正文","错误修改")]))).record.items[0]!.reason,"PROTECTED_AMBIGUOUS_FORMAL_FIELD");assert.equal(f.counts().moves,0);assert.equal(f.counts().writes,0);
  }finally{blockIdentityCache.invalidateScope(oldGraph);await f.cleanup();}
});
