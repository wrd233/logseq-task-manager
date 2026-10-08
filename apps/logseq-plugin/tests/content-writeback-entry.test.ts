import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";
import { installContentWriteback } from "../src/features/content-writeback/installer.ts";
import type { ContentInstallation } from "../src/features/content-writeback/installer.ts";
import type { Patch, TextOperation } from "../src/features/content-writeback/protocol.ts";
import { panels } from "../src/workspace/context.ts";
import type { WorkView } from "../src/features/work-view/controller.ts";

async function until(predicate:()=>boolean):Promise<void>{for(let i=0;i<200;i++){if(predicate())return;await delay(2);}assert.fail("expected UI state did not arrive");}
function api():ContentInstallation["api"]{return (window as unknown as {taskCopilotWorkbench:{content:ContentInstallation["api"]}}).taskCopilotWorkbench.content;}
const entry=new URL("../src/index.ts",import.meta.url).href;

test("read-only scope never persists native identity or accepts writes; old durable results remain queryable",async()=>{
  const f=await contentFixture(),installed=installContentWriteback({journal:f.journal,adapter:f.adapter});
  try{
    await installed.establishRead(f.root);assert.equal(installed.api.capabilities().bodyAuthorized,false);assert.equal(installed.api.capabilities().structureAuthorized,false);
    const read=await installed.api.read();assert.equal(read.blocks.length,3);assert.equal(f.counts().identities,0);
    const input=f.patch([await f.text(f.a,"Beta","read must not write")]);
    await assert.rejects(installed.api.apply(input),/CONTENT_WRITE_AUTHORIZATION_REQUIRED/);assert.equal(await installed.api.result(input.requestId),null);assert.equal(f.counts().writes,0);
    await installed.establish(f.root);const next=f.patch([await f.text(f.a,"Beta","explicit write")]);const written=await installed.api.apply(next);assert.equal(written.status,"complete");
    const counts=f.counts();await installed.establishRead(f.root);
    assert.equal((await installed.api.apply(next)).record.digest,written.record.digest);
    assert.equal((await installed.api.recover(next.requestId)).record.digest,written.record.digest);
    assert.deepEqual(f.counts(),counts);
    installed.api.revoke();assert.equal(installed.api.capabilities().bodyAuthorized,false);await assert.rejects(installed.api.read(),/AUTHORIZATION_REQUIRED/);
  }finally{installed.dispose();await f.cleanup();}
});

test("trusted work switch restriction fences an in-progress write and never revives when returning to the old work",async()=>{
  const f=await contentFixture(),input=f.patch([await f.text(f.a,"Beta","must not arrive")]),entered=deferred<void>(),release=deferred<void>();let active=true;
  try{
    const lease=f.authority.capture(f.scope)!;f.authority.restrict(lease,()=>active);
    f.onRead(async()=>{entered.resolve();await release.promise;});
    const writing=f.executor.apply(input);await entered.promise;active=false;release.resolve();
    const result=await writing;assert.equal(result.record.items[0]!.reason,"SCOPE_REVOKED");assert.equal(f.counts().writes,0);
    active=true;assert.equal(f.authority.valid(lease),false);assert.equal(f.authority.capture(f.scope),null);assert.equal(lease.signal.aborted,true);
  }finally{release.resolve();await f.cleanup();}
});

test("merged composition keeps lenses live after verified content writes and marks the old reading basis changed",async()=>{
  const f=await contentFixture(),fetch=globalThis.fetch;
  const database=new Set<Parameters<typeof logseq.DB.onChanged>[0]>();
  globalThis.fetch=async()=>{throw Error("Kernel offline");};
  logseq.settings!.workViewEnabled=true;
  logseq.DB.onChanged=listener=>{database.add(listener);return()=>{database.delete(listener);};};
  try{
    await import(`${entry}?content-lenses-merge=1`);await f.boot();
    const bench=(window as unknown as {taskCopilotWorkbench:{
      content:ContentInstallation["api"];lenses:WorkView["lensesAPI"];
      open(uuid:string):Promise<void>;read():ReturnType<WorkView["snapshot"]>;close():Promise<void>;
    }}).taskCopilotWorkbench;
    await f.commands.get("content-authorize")!();await bench.open(f.root);
    const captured=await bench.lenses.source();assert.equal(captured.ok,true);
    assert.equal((await bench.lenses.select(f.a)).ok,true);
    const before=bench.lenses.read();assert.equal(before.phase,"focused");assert.equal(before.basisChanged,false);
    const source=await bench.content.read(),target=source.blocks.find(block=>block.target.blockUuid===f.a)!;
    const payload=f.patch([await f.text(f.a,"Beta","verified composed change")]);
    const written=await bench.content.apply(payload);assert.equal(written.status,"complete");
    const current=await logseq.Editor.getBlock(f.a);assert.ok(current);assert.ok(database.size);
    for(const changed of database)changed({blocks:[current],txData:[[current.id,"block/content",current.content,1,true]]});
    await until(()=>bench.lenses.read().basisChanged);
    assert.equal(bench.lenses.read().phase,"changed");assert.deepEqual(bench.lenses.read().plan,before.plan);
    const refreshed=await bench.lenses.source();assert.equal(refreshed.ok,true);
    if(!refreshed.ok)assert.fail("source refresh failed");
    const actual=refreshed.value.blocks.find(block=>block.target.blockUuid===f.a)!;
    assert.equal(actual.content,written.record.items[0]!.actualContent);assert.equal(actual.contentVersion,written.record.items[0]!.actualVersion);
    assert.notEqual(actual.contentVersion,target.contentVersion);
    assert.match(document.querySelector('[data-workbench-feature="work"]')!.textContent!,/verified composed change/);
    assert.equal(document.querySelector<HTMLElement>("[data-content-writeback]")!.hidden,true);
    await bench.close();await f.unload();assert.equal(database.size,0);assert.equal(bench.content.scope(),null);
  }finally{await f.unload();globalThis.fetch=fetch;await f.cleanup();}
});

test("explicit file-graph scope association persists native identity once; DB scope and read never add id",async()=>{
  const f=await contentFixture();let installed=installContentWriteback();try{
    assert.equal(f.counts().identities,0);await assert.rejects(installed.api.read(),/AUTHORIZATION_REQUIRED/);assert.equal(f.counts().identities,0);
    await f.commands.get("content-authorize")!();assert.equal(f.counts().identities,1);assert.equal(f.blocks.get(f.root)!.properties.id,f.root);
    await installed.api.read();await f.commands.get("content-authorize")!();assert.equal(f.counts().identities,1);
    installed.dispose();f.current(f.b);f.db(true);installed=installContentWriteback();await f.commands.get("content-authorize")!();assert.equal(f.counts().identities,1);assert.equal(f.blocks.get(f.b)!.properties.id,undefined);
  }finally{installed.dispose();await f.cleanup();}
});
test("scope identity journal failure denies scope without an untracked native property write",async()=>{
  const f=await contentFixture(),installed=installContentWriteback();try{
    f.onStorage(async()=>{throw Error("private disk unavailable");});await f.commands.get("content-authorize")!();assert.equal(installed.api.scope(),null);assert.equal(f.counts().identities,0);assert.ok(f.messages.some(text=>text.includes("private disk unavailable")));
  }finally{installed.dispose();await f.cleanup();}
});
test("scope association never overwrites an inconsistent existing native identity",async()=>{
  const f=await contentFixture(),installed=installContentWriteback();try{
    const other=crypto.randomUUID(),root=f.blocks.get(f.root)!;root.properties.id=other;root.content+=`\nid:: ${other}`;const original=root.content;
    await f.commands.get("content-authorize")!();assert.equal(installed.api.scope(),null);assert.equal(root.content,original);assert.equal(root.properties.id,other);assert.equal(f.counts().identities,0);assert.ok(f.messages.some(message=>message.includes("SOURCE_IDENTITY_CONFLICT")));
  }finally{installed.dispose();await f.cleanup();}
});

test("real composition root registers the default content API and completes controlled synthetic Logseq operations across reload",async()=>{
  const f=await contentFixture(),fetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error("Kernel offline");};
  try{
    await import(`${entry}?content-e2e=1`);await f.boot();
    const content=api();assert.equal(content.scope(),null);await assert.rejects(content.apply(f.patch([await f.text(f.a,"Beta","unauthorized")])),/AUTHORIZATION_REQUIRED/);
    assert.equal("bind" in content,false);await f.commands.get("content-authorize")!();assert.deepEqual(content.scope(),f.scope);
    const read=await content.read();assert.equal(read.blocks[1]!.contentVersion,(await f.executor.read(f.scope)).snapshot.blocks[1]!.contentVersion);
    const replacement=f.patch([await f.text(f.a,"Beta","local applied")]),applied=await content.apply(replacement);assert.equal(applied.status,"complete");
    const insertion=f.patch([await f.child(f.root,"entry added child")]),created=await content.apply(insertion);assert.equal(created.status,"complete");
    const stale=f.patch([await f.text(f.b,"正文","agent proposal")]);f.blocks.get(f.b)!.content="native user changed this";
    const conflicted=await content.apply(stale);assert.equal(conflicted.record.items[0]!.status,"CONFLICT");assert.equal(f.blocks.get(f.b)!.content,"native user changed this");
    const conflict=await content.conflict(stale.requestId,stale.operations[0]!.operationId);assert.equal(conflict.current!.content,"native user changed this");assert.equal((conflict.operation as TextOperation).text,"agent proposal");
    const batch=f.patch([await f.text(f.a,"local applied","partial success"),await f.text(f.b,"native","partial proposal")]);f.blocks.get(f.b)!.content="human later version";
    assert.equal((await content.apply(batch)).status,"partial");assert.equal(network,0);assert.equal(f.counts().showCount,0);
    await f.unload();assert.equal((window as unknown as {taskCopilotWorkbench?:unknown}).taskCopilotWorkbench,undefined);assert.equal(content.scope(),null);assert.equal(f.counts().graphSubscriptions,0);assert.equal(f.commands.has("content-authorize"),false);assert.equal(f.menus.has("工作台：允许维护此处正文"),false);
    await import(`${entry}?content-e2e=2`);await f.boot();const reloaded=api();assert.equal(reloaded.scope(),null);await f.commands.get("content-authorize")!();
    assert.equal((await reloaded.result(insertion.requestId))!.status,"complete");assert.deepEqual((await reloaded.apply(insertion)).record,created.record);assert.equal(f.counts().inserts,1);
    f.blocks.get(f.a)!.content="manual edit after original success";assert.deepEqual((await reloaded.apply(replacement)).record,applied.record);assert.equal(f.blocks.get(f.a)!.content,"manual edit after original success");
  }finally{await f.unload();globalThis.fetch=fetch;await f.cleanup();}
});
test("the local form blocks ambiguous snippets and IME submission; explicit TODO command grants one concrete patch",async()=>{
  const f=await contentFixture(),installed=installContentWriteback();try{
    f.current(f.a);await f.commands.get("content-authorize")!();await f.commands.get("content-replace")!();
    const form=document.querySelector<HTMLElement>("[data-content-writeback]")!,inputs=form.querySelectorAll<HTMLTextAreaElement>("textarea");
    inputs[0]!.value="重复";inputs[1]!.value="unique";const submit=Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent==="写入正文")!;submit.click();await until(()=>form.textContent!.includes("片段出现了多次"));assert.equal(f.counts().writes,0);
    inputs[0]!.value="Beta";inputs[1]!.value="valid";inputs[1]!.dispatchEvent(new f.browser.Event("compositionstart",{bubbles:true}) as unknown as Event);assert.equal(submit.disabled,true);submit.click();await delay(3);assert.equal(f.counts().writes,0);
    inputs[1]!.dispatchEvent(new f.browser.Event("compositionend",{bubbles:true}) as unknown as Event);submit.click();await until(()=>form.hidden);assert.ok(f.blocks.get(f.a)!.content.includes("valid"));assert.equal(f.counts().writes,1);
    f.blocks.get(f.a)!.content="TODO 保留原意";await f.commands.get("content-edit-todo")!();const todo=form.querySelectorAll<HTMLTextAreaElement>("textarea");todo[0]!.value="保留原意";todo[1]!.value="用户明确修改";
    Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent==="明确修改此 TODO")!.click();await until(()=>f.blocks.get(f.a)!.content==="TODO 用户明确修改");
    const pending=await installed.api.pending();assert.ok(pending.every(record=>record.origin.kind==="local-user-command"));assert.equal(f.counts().writes,2);
  }finally{installed.dispose();await f.cleanup();}
});
test("conflict panel preserves current/proposed/optional old text, closes without loss, and retries only against the displayed new version",async()=>{
  const f=await contentFixture(),installed=installContentWriteback();try{
    await f.commands.get("content-authorize")!();const original=f.patch([await f.text(f.a,"Beta","proposal")]);f.blocks.get(f.a)!.content="current user paragraph";await installed.api.apply(original);
    await f.commands.get("content-recovery")!();const form=document.querySelector<HTMLElement>("[data-content-writeback]")!;
    form.querySelector<HTMLButtonElement>('[data-content-reason="CONTENT_VERSION_CONFLICT"]')!.click();await until(()=>!!form.querySelector("details"));
    assert.ok(form.textContent!.includes("current user paragraph"));assert.ok(form.textContent!.includes("proposal"));assert.equal(form.querySelector("details")!.open,false);
    Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent==="关闭")!.click();await delay(3);assert.equal((await installed.api.pending()).length,1);
    await f.commands.get("content-recovery")!();form.querySelector<HTMLButtonElement>('[data-content-reason="CONTENT_VERSION_CONFLICT"]')!.click();await until(()=>!!form.querySelector("textarea"));
    const inputs=form.querySelectorAll<HTMLTextAreaElement>("textarea");inputs[0]!.value="current user paragraph";inputs[1]!.value="merged explicit proposal";
    Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent==="按当前版本重新提交")!.click();await until(()=>f.blocks.get(f.a)!.content==="merged explicit proposal");assert.equal(f.counts().writes,1);
    await until(()=>form.textContent!.includes("此范围没有需要恢复的正文提议"));
    const historical=await installed.api.result(original.requestId);assert.equal(historical!.record.items[0]!.status,"CONFLICT");
  }finally{installed.dispose();await f.cleanup();}
});
test("append form keeps its request identity after partial identity failure, repeated submit and a new installer",async()=>{
  const f=await contentFixture();let installed=installContentWriteback();try{
    await f.commands.get("content-authorize")!();f.onIdentity(async()=>{throw Error("identity unavailable");});await f.commands.get("content-insert-child")!();
    let form=document.querySelector<HTMLElement>("[data-content-writeback]")!,input=form.querySelector<HTMLTextAreaElement>("textarea")!;input.value="never duplicate this record";
    let submit=Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent==="追加记录")!;submit.click();await until(()=>form.textContent!.includes("记录内容已保留"));assert.equal(f.counts().inserts,1);
    await until(()=>!submit.disabled);submit.click();await delay(20);assert.equal(f.counts().inserts,1);
    installed.dispose();installed=installContentWriteback();await f.commands.get("content-authorize")!();await f.commands.get("content-insert-child")!();form=document.querySelector<HTMLElement>("[data-content-writeback]")!;input=form.querySelector("textarea")!;assert.equal(input.value,"never duplicate this record");
    submit=Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent==="追加记录")!;submit.click();await until(()=>form.textContent!.includes("记录内容已保留"));assert.equal(f.counts().inserts,1);
  }finally{installed.dispose();await f.cleanup();}
});
test("TODO conflict retry requires another explicit concrete user action on the displayed new version",async()=>{
  const f=await contentFixture(),installed=installContentWriteback();try{
    f.blocks.get(f.a)!.content="TODO 旧任务条件";f.current(f.a);await f.commands.get("content-authorize")!();await f.commands.get("content-edit-todo")!();
    const form=document.querySelector<HTMLElement>("[data-content-writeback]")!;const inputs=form.querySelectorAll<HTMLTextAreaElement>("textarea");inputs[0]!.value="旧任务条件";inputs[1]!.value="明确提议";
    f.blocks.get(f.a)!.content="TODO 新任务条件\nid:: "+f.a;
    Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="明确修改此 TODO")!.click();await until(()=>form.textContent!.includes("输入已保留"));assert.equal(f.counts().writes,0);
    await f.commands.get("content-recovery")!();form.querySelector<HTMLButtonElement>('[data-content-reason="CONTENT_VERSION_CONFLICT"]')!.click();await until(()=>!!form.querySelector("details"));
    form.querySelectorAll<HTMLTextAreaElement>("textarea")[0]!.value="新任务条件";
    Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="明确修改此 TODO 并重新提交")!.click();await until(()=>f.blocks.get(f.a)!.content.startsWith("TODO 明确提议"));assert.equal(f.counts().writes,1);assert.ok(f.blocks.get(f.a)!.content.endsWith(`id:: ${f.a}`));
    await until(()=>form.textContent!.includes("此范围没有需要恢复的正文提议"));
  }finally{installed.dispose();await f.cleanup();}
});
test("registered scope setup, dispose and graph changes invalidate late host requests without restoring stale UI or grants",async()=>{
  const f=await contentFixture(),installed=installContentWriteback();try{
    const payload=f.patch([await f.text(f.a,"Beta","late")]),gate=deferred<void>(),started=deferred<void>();f.onRead(async()=>{started.resolve();await gate.promise;});const enabling=f.commands.get("content-authorize")!();await started.promise;f.graph("B");gate.resolve();await enabling;assert.equal(installed.api.scope(),null);assert.equal(f.counts().writes,0);f.onRead(null);
    f.graph("A");await f.commands.get("content-authorize")!();const sent=deferred<void>(),reply=deferred<void>();f.onWrite(async(uuid,text)=>{sent.resolve();await reply.promise;f.blocks.get(uuid)!.content=text;});
    const applying=installed.api.apply(payload);await sent.promise;installed.dispose();const unknown=await applying;assert.equal(unknown.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(installed.api.scope(),null);assert.equal(f.browser.document.querySelector("[data-content-writeback]"),null);
    await assert.rejects(installed.api.apply(payload),/AUTHORIZATION_REQUIRED/);reply.resolve();await delay(5);assert.equal(f.counts().writes,1);assert.equal(f.counts().graphSubscriptions,0);
  }finally{installed.dispose();await f.cleanup();}
});
test("a local edit command cannot authorize a different Graph from a late current-block response",async()=>{
  const f=await contentFixture(),installed=installContentWriteback(),started=deferred<void>(),gate=deferred<void>();try{
    logseq.Editor.getCurrentBlock=async()=>{started.resolve();await gate.promise;return {uuid:f.root} as Awaited<ReturnType<typeof logseq.Editor.getCurrentBlock>>;};
    const opening=f.commands.get("content-replace")!();await started.promise;f.graph("B");gate.resolve();await opening;
    assert.equal(installed.api.scope(),null);assert.equal(f.counts().identities,0);assert.equal(f.counts().showCount,0);assert.ok(f.messages.includes("SCOPE_REVOKED"));
  }finally{gate.resolve();installed.dispose();await f.cleanup();}
});
test("trusted scope never expands through forged roots, aliases, resolution fields or metadata",async()=>{
  const f=await contentFixture(),installed=installContentWriteback();try{
    await f.commands.get("content-authorize")!();const outside=f.add("outside source","");await assert.rejects(installed.api.read({...f.scope,rootUuid:outside.uuid}),/AUTHORIZATION_REQUIRED/);
    const patch:Patch=f.patch([await f.text(f.a,"Beta","safe")]);await assert.rejects(installed.api.apply({...patch,metadata:{runId:"claim",actor:"AGENT",authorized:true}}),/UNSUPPORTED_FIELD/);
    await assert.rejects(installed.api.resolve({requestId:"none",operationId:"none",resolution:"keep-current",authorized:true}),/UNSUPPORTED_FIELD/);
    assert.equal(f.counts().writes,0);
  }finally{installed.dispose();await f.cleanup();}
});
test("a recovery panel waiting for another panel to close cannot open after scope revocation or disposal",async()=>{
  for(const invalidate of ["revoke","dispose"] as const){
    const f=await contentFixture(),installed=installContentWriteback(),started=deferred<void>(),gate=deferred<void>();
    try{
      await f.commands.get("content-authorize")!();
      panels.register("content-test-other",async()=>{started.resolve();await gate.promise;panels.release("content-test-other");});
      await panels.activate("content-test-other");
      const opening=f.commands.get("content-recovery")!();await started.promise;
      if(invalidate==="revoke")installed.api.revoke();else installed.dispose();
      gate.resolve();await opening;
      assert.equal(f.counts().showCount,0);assert.equal(panels.active,null);
      const root=document.querySelector<HTMLElement>("[data-content-writeback]");
      assert.ok(invalidate==="dispose"?root===null:root?.hidden);
    }finally{gate.resolve();installed.dispose();panels.register("content-test-other",()=>undefined);panels.release("content-test-other");await f.cleanup();}
  }
});
