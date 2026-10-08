import test from "node:test";
import assert from "node:assert/strict";
import { OrdinaryTodoService, parseTodoRequest, type TodoAction, type TodoMaterial } from "../src/features/ordinary-todo/service.ts";
import { sha256 } from "../src/features/content-writeback/validation.ts";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";

async function fixture(){
  const f=await contentFixture(),lease=f.authority.bindRead(f.scope);
  f.authority.confirmRoot(lease,(await f.executor.read(f.scope)).paths.get(f.root)!);
  const todo=new OrdinaryTodoService({valid:l=>f.authority.valid(l),read:f.executor.read.bind(f.executor),apply:f.executor.applyControlledTodo.bind(f.executor),query:f.executor.query.bind(f.executor),recover:f.executor.recover.bind(f.executor),resumeIdentity:f.executor.resumeIdentity.bind(f.executor)});
  const request=async(action:TodoAction,id:string=f.a,extra:Record<string,unknown>={})=>{
    const b=(await f.executor.read(f.scope)).snapshot.blocks.find(b=>b.target.blockUuid===id)!;
    return {schemaVersion:1,requestId:crypto.randomUUID(),scope:f.scope,action,target:{blockUuid:id,expectedContentVersion:b.contentVersion,expectedParentUuid:b.parentUuid},...extra};
  };
  let material:TodoMaterial={id:crypto.randomUUID(),path:"/owned/work/取消条款比较.md",reference:"[取消条款比较.md](longdoc://same-real-id)",writeState:"ready",availability:"available",content:"甲：前一天可取消。乙：当天不可取消。",version:await sha256("甲：前一天可取消。乙：当天不可取消。")};
  const proof=()=>({materialId:material.id,expectedVersion:material.version,verifiedText:"乙：当天不可取消。"});
  return {f,lease,todo,request,proof,material:()=>material,setMaterial:(m:TodoMaterial)=>{material=m;},readMaterial:async()=>material,apply:(r:unknown)=>todo.apply(lease,r,async()=>material,{kind:"local-capability"})};
}
test("ordinary TODO is independently granted; the legacy patch cannot borrow it",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    const create=await x.request("create",f.a,{title:"核对取消条款"});
    await assert.rejects(x.apply(create),/TODO_AUTHORIZATION_REQUIRED/u);assert.equal(f.counts().inserts,0);
    await todo.allow(lease,[f.a],["create"]);const done=await x.apply(create);assert.equal(done.status,"complete");assert.equal(done.record.intentKind,"ordinary-todo");
    assert.match(f.blocks.get(done.record.items[0]!.childUuid!)!.content,/^TODO 核对取消条款\nid::/u);
    const legacy=f.patch([await f.text(done.record.items[0]!.childUuid!,"TODO","DONE")]);await assert.rejects(f.executor.apply(legacy),/CONTENT_WRITE_AUTHORIZATION_REQUIRED/u);
    todo.revoke();assert.deepEqual(await x.apply(create),done);assert.equal(f.counts().inserts,1);
    await assert.rejects(x.apply({...create,title:"另一个任务"}),/IDEMPOTENCY_KEY_REUSED/u);
  }finally{await f.cleanup();}
});
test("complete changes only the marker and adds a checked material reference; reopen retains evidence",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    f.blocks.get(f.a)!.content="TODO 核对取消条款\r\nid:: "+f.a+"\r\n可能还有例外，尚未询问。";
    await todo.allow(lease,[f.a],["complete","reopen"]);
    const request=await x.request("complete",f.a,{evidence:x.proof()}),complete=await x.apply(request);
    assert.equal(complete.status,"complete");assert.equal(complete.durable,true);
    assert.equal(complete.record.ordinaryTodo!.evidence!.filename,"取消条款比较.md");assert.equal(complete.record.ordinaryTodo!.evidence!.verifiedText,"乙：当天不可取消。");
    assert.match(f.blocks.get(f.a)!.content,/^DONE 核对取消条款\r\nid::/u);assert.match(f.blocks.get(f.a)!.content,/可能还有例外，尚未询问。\r\n\*\*\[记录\]\*\*/u);
    const before=f.blocks.get(f.a)!.content;assert.equal((await x.apply(await x.request("reopen"))).status,"complete");assert.equal(f.blocks.get(f.a)!.content,"TODO"+before.slice(4));
    assert.equal((await f.journal.load(f.scope,request.requestId))!.ordinaryTodo!.requestDigest,complete.record.ordinaryTodo!.requestDigest);
  }finally{await f.cleanup();}
});
test("range, action, formal and managed boundaries remain closed",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    f.blocks.get(f.a)!.content="TODO 核对条款";f.blocks.get(f.b)!.content="TODO 另一个范围";
    await todo.allow(lease,[f.a],["create"]);
    await assert.rejects(x.apply(await x.request("complete",f.a,{evidence:x.proof()})),/TODO_AUTHORIZATION_REQUIRED/u);
    await assert.rejects(x.apply(await x.request("create",f.b,{title:"真实动作"})),/TODO_OUTSIDE_GRANTED_RANGE/u);
    await todo.allow(lease,[f.root],["complete","create"]);
    for(const content of ["TODO **[任务]** 正式任务","**[等待]** 等用户认可","TODO 正文\ntask-copilot-owner:: true","> TODO 引文","    TODO 代码"]){
      f.blocks.get(f.a)!.content=content;await assert.rejects(x.apply(await x.request("complete",f.a,{evidence:x.proof()})),/TODO_FORMAL_PATH_REQUIRED|ORDINARY_TODO_REQUIRED/u);
    }
    assert.equal(f.counts().writes,0);
    for(const title of ["[想法] 可能去湖边","**[想法]** 可能去湖边","[任务] 正式动作","**[任务]** 正式动作"]){assert.throws(()=>parseTodoRequest({schemaVersion:1,requestId:"label",scope:f.scope,action:"create",target:{blockUuid:f.a,expectedContentVersion:"a".repeat(64),expectedParentUuid:f.root},title}),/ORDINARY_TODO_TITLE_REQUIRED/u);}
    assert.throws(()=>parseTodoRequest({...( {schemaVersion:1,requestId:"x",scope:f.scope,action:"create",target:{blockUuid:f.a,expectedContentVersion:"a".repeat(64),expectedParentUuid:f.root},title:"**[想法]** 可能要去湖边"}),actor:"USER"}),/UNSUPPORTED_FIELD/u);
  }finally{await f.cleanup();}
});
test("terminal native properties without a newline retain exact bytes during real-style completion",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    for(const newline of ["\n","\r\n"]){
      const properties=`id:: ${f.a}${newline}custom:: 尚未确认`;
      f.blocks.get(f.a)!.content=`TODO 保存原句${newline}${properties}`;
      await todo.allow(lease,[f.a],["complete"]);const done=await x.apply(await x.request("complete",f.a,{evidence:x.proof()}));
      assert.equal(done.status,"complete");assert.equal(done.durable,true);
      assert.ok(f.blocks.get(f.a)!.content.endsWith(properties));assert.match(f.blocks.get(f.a)!.content,/^DONE 保存原句\r?\n\*\*\[记录\]\*\*/u);
    }
  }finally{await f.cleanup();}
});
test("known native id relocation is recorded; unrelated host changes still remain unknown",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    f.blocks.get(f.a)!.content=`TODO 核验文件\nid:: ${f.a}`;await todo.allow(lease,[f.a],["complete"]);
    f.onWrite(async(id,text)=>{const lines=text.split("\n"),native=lines.find(l=>l===`id:: ${id}`)!;f.blocks.get(id)!.content=[lines[0],native,...lines.slice(1).filter(l=>l!==native)].join("\n");});
    const done=await x.apply(await x.request("complete",f.a,{evidence:x.proof()}));assert.equal(done.status,"complete");assert.equal(done.record.items[0]!.readbackNormalization,"native-id-after-first-line");assert.notEqual(done.record.items[0]!.actualContent,done.record.items[0]!.proposedContent);
    f.blocks.get(f.a)!.content=`TODO 核验另一个文件\nid:: ${f.a}`;
    f.onWrite(async(id,text)=>{f.blocks.get(id)!.content=text+"\n用户新条件";});const unknown=await x.apply(await x.request("complete",f.a,{evidence:x.proof()}));assert.equal(unknown.status,"outcome-unknown");assert.equal(unknown.record.items[0]!.reason,"READBACK_MISMATCH");
    assert.equal(unknown.record.items[0]!.readbackNormalization,undefined);
  }finally{await f.cleanup();}
});
test("completion needs actual current text; material changes before dispatch block the whole state change",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    f.blocks.get(f.a)!.content="TODO 核对条款";await todo.allow(lease,[f.a],["complete"]);
    const r=await x.request("complete",f.a,{evidence:x.proof()});
    await assert.rejects(x.apply({...r,evidence:{...x.proof(),verifiedText:"不存在的完成依据"}}),/TODO_EVIDENCE_CONFLICT/u);
    let reads=0;const result=await todo.apply(lease,r,async()=>{if(++reads===2)return {...x.material(),content:"外部修改",version:await sha256("外部修改")};return x.material();},{kind:"local-capability"});
    assert.equal(result.status,"not-applied");assert.equal(result.record.items[0]!.reason,"TODO_EVIDENCE_CONFLICT");assert.equal(f.blocks.get(f.a)!.content,"TODO 核对条款");
    assert.equal(f.counts().writes,0);
  }finally{await f.cleanup();}
});
test("user source changes during material verification survive; retry requires freshly read basis",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    f.blocks.get(f.a)!.content="TODO 核对条款";await todo.allow(lease,[f.a],["complete"]);const r=await x.request("complete",f.a,{evidence:x.proof()});
    let reads=0;const conflict=await todo.apply(lease,r,async()=>{if(++reads===2)f.blocks.get(f.a)!.content+="\n用户补充：还要问退款时间？";return x.material();},{kind:"local-capability"});
    assert.equal(conflict.status,"not-applied");assert.equal(conflict.record.items[0]!.status,"CONFLICT");assert.match(f.blocks.get(f.a)!.content,/^TODO.*\n用户补充/u);
    const fresh=await x.request("complete",f.a,{evidence:x.proof()}),retried=await todo.retry(lease,r.requestId,fresh,x.readMaterial,{kind:"local-capability"});
    assert.equal(retried.status,"complete");assert.equal(retried.record.retryOf,r.requestId);assert.match(f.blocks.get(f.a)!.content,/用户补充：还要问退款时间？/u);
  }finally{await f.cleanup();}
});
test("revoke and regrant do not revive an already waiting TODO call",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    f.blocks.get(f.a)!.content="TODO 核对条款";await todo.allow(lease,[f.a],["complete"]);const r=await x.request("complete",f.a,{evidence:x.proof()}),entered=deferred<void>(),go=deferred<void>();
    let reads=0;const pending=todo.apply(lease,r,async()=>{if(++reads===2){entered.resolve();await go.promise;}return x.material();},{kind:"local-capability"});
    await entered.promise;todo.revoke();await todo.allow(lease,[f.a],["complete"]);go.resolve();const stopped=await pending;
    assert.equal(stopped.status,"not-applied");assert.equal(f.counts().writes,0);
    const next=f.authority.bindRead(f.scope);assert.equal(todo.status(next).authorized,false);
  }finally{await f.cleanup();}
});
test("unknown insert is queried and recovered without replay; typed identity resume finishes the same child",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    await todo.allow(lease,[f.a],["create"]);f.onIdentity(async()=>{throw Error("host dropped identity ACK");});const r=await x.request("create",f.a,{title:"写比较文件"}),partial=await x.apply(r);
    assert.equal(partial.status,"partial");assert.equal(partial.record.items[0]!.contentVerified,true);assert.equal(f.counts().inserts,1);
    await assert.rejects(todo.retry(lease,r.requestId,await x.request("create",f.a,{title:"写比较文件"}),x.readMaterial,{kind:"local-capability"}),/RETRY_NOT_PROVEN_UNAPPLIED/u);
    assert.equal((await todo.result(lease,r.requestId,true))!.record.items[0]!.expectationObserved,true);assert.equal(f.counts().inserts,1);
    f.onIdentity(null);assert.equal((await todo.resumeIdentity(lease,r.requestId,x.readMaterial)).status,"complete");assert.equal(f.counts().inserts,1);
  }finally{await f.cleanup();}
});
test("a failed intent journal never dispatches a TODO and a failed final journal is unconfirmed",async()=>{
  const x=await fixture(),{f,todo,lease}=x;try{
    await todo.allow(lease,[f.a],["create"]);f.onStorage(async()=>{throw Error("disk full");});
    const refused=await x.apply(await x.request("create",f.a,{title:"动作"}));assert.equal(refused.durable,false);assert.equal(refused.status,"not-applied");assert.equal(f.counts().inserts,0);
    f.onStorage(async(_key,value)=>{if(JSON.parse(value).items[0].status==="APPLIED_VERIFIED")throw Error("disk full after verification");});
    const r=await x.request("create",f.a,{title:"另一动作"}),unconfirmed=await x.apply(r);assert.equal(unconfirmed.status,"complete");assert.equal(unconfirmed.durable,false);
    const durable=await todo.result(lease,r.requestId);assert.equal(durable!.status,"partial");assert.equal(durable!.record.items[0]!.identity!.status,"PENDING");assert.equal(f.counts().inserts,1);
  }finally{await f.cleanup();}
});
