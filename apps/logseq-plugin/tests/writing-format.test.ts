import test from "node:test";
import assert from "node:assert/strict";
import { formattingLabels, prefixChanges, WritingFormatService } from "../src/features/writing-format/service.ts";
import { WritingFormatUI } from "../src/features/writing-format/ui.ts";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";

async function fixture(){
  const f=await contentFixture(),lease=f.authority.bindRead(f.scope);f.authority.confirmRoot(lease,(await f.executor.read(f.scope)).paths.get(f.root)!);
  const service=new WritingFormatService({valid:l=>f.authority.valid(l),read:f.executor.read.bind(f.executor),apply:f.executor.applyControlledFormatting.bind(f.executor),query:f.executor.query.bind(f.executor),recover:f.executor.recover.bind(f.executor),resolve:f.executor.resolve.bind(f.executor),pending:f.executor.pending.bind(f.executor)});
  const preview=async(ids=[f.a],extra:Record<string,unknown>={})=>{
    const read=await f.executor.read(f.scope);return service.preview(lease,{requestId:crypto.randomUUID(),sourceIds:read.snapshot.blocks.filter(b=>ids.includes(b.target.blockUuid)).map(b=>b.sourceId),...extra},{kind:"local-user-command",command:"formatting-preview"});
  };
  return {f,lease,service,preview};
}
test("format diff preserves exact raw coordinates, CRLF, wording, code, quotes, unknown and inline literals",()=>{
  const text="[目标] 尚未确定 😀\r\n- [想法] 目前偏向湖边\r\n句中 [注] 是原话\r\n> [记录] 引文\r\n[注] 引文延续\r\n\r\n    [记录] 缩进代码\r\n[问一下] 未知标记\r\n[注]: https://literal.invalid\r\n```js\r\n[记录] 代码\r\n````\r\n<pre>\r\n[目标] HTML 程序\r\n</pre>\r\n$$\r\n[目标] 公式\r\n$$\r\n#+BEGIN_SRC\r\n[注] Org 程序\r\n#+END_SRC\r\n[注] 可能还有例外\r\n**[记录]** 已有格式\r\n";
  const changes=prefixChanges(text,new Set(formattingLabels(undefined)));assert.equal(changes.length,3);
  let result=text;for(const c of [...changes].reverse()){assert.equal(text.slice(c.start,c.end),c.before);result=result.slice(0,c.start)+c.after+result.slice(c.end);}
  assert.equal(result,text.replace("[目标]","**[目标]**").replace("[想法]","**[想法]**").replace("[注] 可能","**[注]** 可能"));
  assert.throws(()=>formattingLabels(["任务"]),/FORMAT_FORMAL_LABEL_FORBIDDEN/u);assert.throws(()=>formattingLabels(["等待"]),/FORMAT_FORMAL_LABEL_FORBIDDEN/u);
});
test("local immutable approval writes two blocks once under read authority; legacy body rights stay closed",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    f.blocks.get(f.a)!.content=`[目标] 尚未确定\r\nid:: ${f.a}\r\n[想法] 目前偏向，尚未询问。`;
    f.blocks.get(f.b)!.content="[注] 另一个块的原话";
    const originals=new Map([...f.blocks].map(([id,b])=>[id,{content:b.content,parent:b.parent.id,left:b.left.id}])),p=await x.preview([f.root]);assert.equal(p.changes.length,3);assert.equal(f.counts().writes,0);
    assert.match(p.changes[0]!.lineText,/尚未确定/u);const result=await service.apply(lease,p.proposalId);assert.equal(result!.status,"complete");assert.equal(result!.durable,true);assert.equal(result!.record.intentKind,"formatting");assert.equal(result!.record.origin.kind,"local-user-command");
    assert.equal(f.blocks.get(f.a)!.content,originals.get(f.a)!.content.replace("[目标]","**[目标]**").replace("[想法]","**[想法]**"));assert.equal(f.blocks.get(f.b)!.content,"**[注]** 另一个块的原话");
    for(const [id,b] of f.blocks){assert.equal(b.parent.id,originals.get(id)!.parent);assert.equal(b.left.id,originals.get(id)!.left);}
    assert.equal((await f.journal.load(f.scope,p.proposalId))!.formatting!.requestDigest,result!.record.digest);
    assert.deepEqual(await service.apply(lease,p.proposalId),result);assert.equal(f.counts().writes,2);
    await assert.rejects(f.executor.apply(f.patch([await f.text(f.b,"另一个","擅自改写")])),/CONTENT_WRITE_AUTHORIZATION_REQUIRED/u);
    await assert.rejects(f.executor.retry(f.scope,p.proposalId,f.patch([await f.text(f.b,"另一个","另一个")])),/IDENTITY_REQUIRES_REVALIDATION/u);
  }finally{await f.cleanup();}
});
test("formal, managed, TODO and literal ancestors preserve whole descendants; custom natural labels require selection",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    const contents=["**[任务]** 正式对象","**[等待]** 用户认可","TODO 真实动作","> 引文父块","```js\n尚未闭合","    缩进代码父块"];
    for(const content of contents){const parent=f.add(content);f.add("[目标] 不能整理这个子块",parent.uuid);}
    f.blocks.get(f.a)!.content="[问一下] 仍是半句话？\n[目标] 自然目标";
    const p=await x.preview([f.root]);assert.equal(p.changes.length,1);await service.apply(lease,p.proposalId);
    assert.match(f.blocks.get(f.a)!.content,/^\[问一下\] 仍是半句话/u);for(const b of f.blocks.values())if(b.content.includes("不能整理"))assert.equal(b.content,"[目标] 不能整理这个子块");
    const selected=await x.preview([f.a],{labels:["问一下"]});assert.equal(selected.changes.length,1);assert.equal((await service.apply(lease,selected.proposalId))!.status,"complete");
    assert.equal(f.blocks.get(f.a)!.content,"**[问一下]** 仍是半句话？\n**[目标]** 自然目标");
  }finally{await f.cleanup();}
});
test("a new user condition elsewhere expires the whole old proposal; explicit keep-current enables a fresh diff",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    f.blocks.get(f.a)!.content="[想法] 可能去湖边";const p=await x.preview();f.blocks.get(f.b)!.content+="\n用户补充：不过下雨怎么办？";
    const stopped=await service.apply(lease,p.proposalId);assert.equal(stopped!.status,"not-applied");assert.equal(stopped!.record.items[0]!.reason,"FORMAT_SOURCE_CHANGED");assert.equal(f.counts().writes,0);
    const fresh=await x.preview();await assert.rejects(service.apply(lease,fresh.proposalId),/FORMAT_UNRESOLVED_RESULT/u);
    await service.keepCurrent(lease,p.proposalId);assert.equal((await service.apply(lease,fresh.proposalId))!.status,"complete");assert.match(f.blocks.get(f.b)!.content,/用户补充：不过下雨怎么办？/u);
  }finally{await f.cleanup();}
});
test("partial writes are durable facts; a concurrent later block remains intact and is not retried blindly",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    f.blocks.get(f.a)!.content="[想法] 可能";f.blocks.get(f.b)!.content="[注] 尚未询问";const p=await x.preview([f.root]);
    f.onWrite(async(id,text)=>{f.blocks.get(id)!.content=text;if(id===f.a)f.blocks.get(f.b)!.content+="\n用户补充：要先确认天气。";});
    const partial=await service.apply(lease,p.proposalId);assert.equal(partial!.status,"partial");assert.equal(partial!.record.items.filter(i=>i.contentVerified).length,1);assert.equal(f.counts().writes,1);assert.match(f.blocks.get(f.b)!.content,/^\[注\].*\n用户补充/u);
    assert.deepEqual(await service.apply(lease,p.proposalId),partial);assert.equal(f.counts().writes,1);
    await service.keepCurrent(lease,p.proposalId);f.onWrite(null);const fresh=await x.preview([f.root]);assert.equal(fresh.changes.length,1);assert.equal((await service.apply(lease,fresh.proposalId))!.status,"complete");assert.match(f.blocks.get(f.b)!.content,/用户补充：要先确认天气/u);
  }finally{await f.cleanup();}
});
test("unknown ACK remains unknown after readback; new approvals wait for explicit resolution",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    f.blocks.get(f.a)!.content="[注] 原话";const p=await x.preview();f.onWrite(async(id,text)=>{f.blocks.get(id)!.content=text;throw Error("lost ACK");});
    const unknown=await service.apply(lease,p.proposalId);assert.equal(unknown!.status,"outcome-unknown");const recovered=await service.result(lease,p.proposalId,true);assert.equal(recovered!.record.items[0]!.expectationObserved,true);assert.equal(recovered!.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(f.counts().writes,1);
    f.blocks.get(f.b)!.content="[目标] 新目标";const fresh=await x.preview([f.b]);await assert.rejects(service.apply(lease,fresh.proposalId),/FORMAT_UNRESOLVED_RESULT/u);
    await service.keepCurrent(lease,p.proposalId);f.onWrite(null);assert.equal((await service.apply(lease,fresh.proposalId))!.status,"complete");assert.equal(f.counts().writes,2);
  }finally{await f.cleanup();}
});
test("journal intent failure, native id relocation and unrelated readback changes remain distinct",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    f.blocks.get(f.a)!.content=`[目标] 原话\n[注] 原句\nid:: ${f.a}`;let p=await x.preview();f.onStorage(async()=>{throw Error("disk full");});const refused=await service.apply(lease,p.proposalId);assert.equal(refused!.durable,false);assert.equal(f.counts().writes,0);
    f.onStorage(null);f.onWrite(async(id,text)=>{const lines=text.split("\n"),native=lines.find(l=>l===`id:: ${id}`)!;f.blocks.get(id)!.content=[lines[0],native,...lines.slice(1).filter(l=>l!==native)].join("\n");});
    const verified=await service.apply(lease,p.proposalId);assert.equal(verified!.status,"complete");assert.equal(verified!.record.items[0]!.readbackNormalization,"native-id-after-first-line");assert.equal((await f.journal.load(f.scope,p.proposalId))!.intentKind,"formatting");
    f.blocks.get(f.b)!.content="[想法] 可能";p=await x.preview([f.b]);f.onWrite(async(id,text)=>{f.blocks.get(id)!.content=text+"\n用户新补充";});assert.equal((await service.apply(lease,p.proposalId))!.status,"outcome-unknown");
  }finally{await f.cleanup();}
});
test("clearing scope cancels waiting private approvals and late previews cannot reappear",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    f.blocks.get(f.a)!.content="[注] 原话";const p=await x.preview(),entered=deferred<void>(),go=deferred<void>();let paused=false;
    f.onRead(async()=>{if(!paused){paused=true;entered.resolve();await go.promise;}});const pending=service.apply(lease,p.proposalId);await entered.promise;service.clear();go.resolve();const stopped=await pending;assert.equal(stopped!.status,"not-applied");assert.equal(f.counts().writes,0);assert.deepEqual(service.entries(lease),[]);
    f.onRead(null);f.authority.revoke();await assert.rejects(service.preview(lease,{requestId:"revoked",sourceIds:p.sourceIds},{kind:"local-capability"}),/SCOPE_REVOKED/u);
  }finally{await f.cleanup();}
});
test("a preview awaiting its source read cannot repopulate entries after a scope clear",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    f.blocks.get(f.a)!.content="[注] 原话";const before=await x.preview(),entered=deferred<void>(),go=deferred<void>();let paused=false;
    f.onRead(async()=>{if(!paused){paused=true;entered.resolve();await go.promise;}});
    const late=service.preview(lease,{requestId:"late",sourceIds:before.sourceIds},{kind:"local-capability"});await entered.promise;service.clear();go.resolve();await assert.rejects(late,/SCOPE_REVOKED/u);assert.deepEqual(service.entries(lease),[]);assert.equal(f.counts().writes,0);
  }finally{await f.cleanup();}
});
test("large actual-line diffs stay bounded without dispatching or caching an oversized proposal",async()=>{
  const x=await fixture(),{f,lease,service}=x;try{
    for(let i=0;i<5;i++)f.add("[目标] "+"a".repeat(150000));
    await assert.rejects(x.preview([f.root]),/FORMAT_PREVIEW_TOO_LARGE/u);assert.deepEqual(service.entries(lease),[]);assert.equal(f.counts().writes,0);
  }finally{await f.cleanup();}
});
test("the actual local form shows immutable full-line differences and does not write during composition",async()=>{
  const x=await fixture(),{f,lease,service}=x;const ui=new WritingFormatUI({service,valid:l=>f.authority.valid(l),context:async()=>({lease,read:await f.executor.read(f.scope)})});
  try{
    f.blocks.get(f.a)!.content="[想法] 目前偏向，尚未询问。";const p=await x.preview();await ui.open();
    const click=(label:string)=>{const button=Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent===label)!;assert.ok(button,label);button.click();};
    click("查看已有提议");assert.ok(document.body.textContent!.includes("− [想法] 目前偏向，尚未询问。\n+ **[想法]** 目前偏向，尚未询问。"));assert.equal(f.counts().writes,0);
    const custom=document.querySelector<HTMLInputElement>('[aria-label="其他行首标记"]')!;custom.dispatchEvent(new f.browser.CompositionEvent("compositionstart") as unknown as Event);click("明确写入这份差异");await new Promise(r=>setTimeout(r,20));assert.equal(f.counts().writes,0);
    custom.dispatchEvent(new f.browser.CompositionEvent("compositionend") as unknown as Event);click("明确写入这份差异");
    for(let i=0;i<100&&!await service.result(lease,p.proposalId);i++)await new Promise(r=>setTimeout(r,5));
    for(let i=0;i<100&&(await service.result(lease,p.proposalId))?.status!=="complete";i++)await new Promise(r=>setTimeout(r,5));assert.equal((await service.result(lease,p.proposalId))!.status,"complete");assert.equal(f.counts().writes,1);
  }finally{ui.dispose();await f.cleanup();}
});
