import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { contentFixture } from "./fixtures/content-writeback.ts";
import { installContentWriteback } from "../src/features/content-writeback/installer.ts";
import { installStageWorkbench } from "../src/features/stage-workbench/installer.ts";
import type { Patch } from "../src/features/content-writeback/protocol.ts";

async function wait(check:()=>boolean,message:string){
  for(let i=0;i<100;i++){if(check())return;await delay(15);}assert.fail(message);
}
async function fixture(){
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter});
  const {WorkView}=await import("../src/features/work-view/controller.ts");
  const work=new WorkView(()=>{}),stages=installStageWorkbench({content,work,storage:f.storage});
  await content.local.authorize(f.root);await work.open(f.root);
  const stage=await stages.api.begin({goal:"原位审阅真实测试",requestKey:crypto.randomUUID(),expectedStageId:null});
  const source=await content.api.read();
  const operations=source.blocks.filter(b=>[f.a,f.b].includes(b.target.blockUuid)).map((b,i)=>({operationId:"item-"+i,type:"replace-text" as const,target:b.target,expectedContentVersion:b.contentVersion!,expectedParentUuid:b.parentUuid,range:{start:0,end:i===0?5:3},expectedText:b.content!.slice(0,i===0?5:3),text:i===0?"Revised":"修改后",context:null}));
  const patch:Patch={schemaVersion:1,requestId:crypto.randomUUID(),scope:source.scope,operations,metadata:{stageId:stage.start.id,runId:null}};
  const result=await stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch});
  assert.equal(result.stageProblem,null);await work.refresh();
  return {f,content,work,stages,stage,row:(id:string)=>document.querySelector<HTMLElement>(`article[data-uuid="${id}"]`)!,
    cleanup:async()=>{stages.dispose();work.dispose();content.dispose();await f.cleanup();}};
}
test("clicking a changed body edits the full current authoritative source; composing input and unchanged nodes survive, local edit produces same-stage facts",async()=>{
  const t=await fixture();try{
    const other=t.row(t.f.b),body=other.querySelector(".wb-body"),row=t.row(t.f.a);
    row.querySelector<HTMLElement>(".wb-body")!.click();
    await wait(()=>!!row.querySelector("textarea"),"inline editor did not open");
    const input=row.querySelector("textarea")!,original=input.value;
    assert.equal(original,t.f.blocks.get(t.f.a)!.content);
    input.value=original.replace("Revised","用户纠正");
    input.dispatchEvent(new t.f.browser.Event("input",{bubbles:true}) as unknown as Event);
    input.dispatchEvent(new t.f.browser.CompositionEvent("compositionstart",{bubbles:true}) as unknown as Event);
    const submit=[...row.querySelectorAll("button")].find(b=>b.textContent==="提交修改")!;
    assert.equal(submit.disabled,true);
    await t.work.refresh();
    assert.equal(row.querySelector("textarea"),input);assert.equal(t.row(t.f.b),other);assert.equal(other.querySelector(".wb-body"),body);
    assert.equal(input.value,original.replace("Revised","用户纠正"));
    input.dispatchEvent(new t.f.browser.CompositionEvent("compositionend",{bubbles:true}) as unknown as Event);
    submit.click();await wait(()=>!row.querySelector("textarea"),"inline submit did not finish");
    const history=await t.stages.api.history();
    assert.equal(history.stages.length,1);
    assert.match(t.f.blocks.get(t.f.a)!.content,/用户纠正/);
    assert.equal(history.stages[0]!.revisions.at(-1)!.facts.at(-1)!.record.origin.kind,"local-user-command");
  }finally{await t.cleanup();}
});
test("suggestion is a normal marked child in authoritative Graph; local shortcut accepts only seen revision and later native text stays independent",async()=>{
  const t=await fixture();try{
    const row=t.row(t.f.b),suggest=[...row.querySelectorAll("button")].find(b=>b.textContent==="建议")!;suggest.click();
    await wait(()=>!!row.querySelector("textarea"),"suggestion editor unavailable");
    row.querySelector("textarea")!.value="保留这个限制条件";
    [...row.querySelectorAll("button")].find(b=>b.textContent==="写入原文建议")!.click();
    await wait(()=>!row.querySelector("textarea"),"suggestion not submitted");
    const child=[...t.f.blocks.values()].find(b=>b.content.includes("保留这个限制条件"));
    assert.ok(child);assert.match(child.content,/\*\*\[注\]\*\*/);
    await t.f.commands.get("stage-accept")!();
    const history=await t.stages.api.history(),acceptance=history.stages[0]!.acceptances[0]!;
    assert.ok(acceptance);const count=history.stages[0]!.revisions.length;
    t.f.blocks.get(t.f.b)!.content="后来用户自己继续写";
    await t.work.refresh();
    const after=await t.stages.api.history();
    assert.equal(after.stages.length,1);assert.equal(after.stages[0]!.revisions.length,count);
    assert.deepEqual(after.stages[0]!.acceptances[0],acceptance);
    assert.match(t.row(t.f.b).querySelector(".wb-body")!.textContent!,/后来用户/);
  }finally{await t.cleanup();}
});
test("historical view uses immutable saved text; correcting it reads present source and writes a new linked revision without changing old snapshots",async()=>{
  const t=await fixture();try{
    const first=await t.stages.api.read({stageId:t.stage.start.id}),old=first.revisions.at(-1)!;
    t.f.blocks.get(t.f.a)!.content="当前人工改变过的内容";
    await t.work.refresh();
    document.querySelector<HTMLElement>(".wb-stage-entry")!.click();
    await wait(()=>document.querySelector(".wb-stage-bar>span")?.textContent?.startsWith("历史")??false,"historical mode unavailable");
    assert.match(t.row(t.f.a).querySelector(".wb-body")!.textContent!,/Revised/);
    assert.doesNotMatch(t.row(t.f.a).querySelector(".wb-body")!.textContent!,/当前人工/);
    const row=t.row(t.f.a),correct=[...row.querySelectorAll("button")].find(b=>b.textContent==="在当前内容中纠正")!;correct.click();
    await wait(()=>!!row.querySelector("textarea"),"historical correction editor unavailable");
    const input=row.querySelector("textarea")!;assert.equal(input.value,"当前人工改变过的内容");input.value="修正当前人工内容";
    [...row.querySelectorAll("button")].find(b=>b.textContent==="提交修改")!.click();
    await wait(()=>!row.querySelector("textarea"),"historical correction failed");
    const current=await t.stages.api.read({stageId:t.stage.start.id}),revision=current.revisions.at(-1)!;
    assert.equal(revision.correctionOf?.revisionId,old.id);assert.equal(t.f.blocks.get(t.f.a)!.content,"修正当前人工内容");
    assert.deepEqual(current.revisions.find(r=>r.id===old.id),old);
  }finally{await t.cleanup();}
});
test("focused review discovers outside changes, show-all retains lens and anchor, return restores problem selection and stable rows",async()=>{
  const t=await fixture();try{
    const row=t.row(t.f.a),other=t.row(t.f.b);await t.work.lensesAPI.select(t.f.a);
    assert.equal(other.hidden,true);
    const show=[...document.querySelectorAll("button")].find(b=>b.textContent?.includes("范围外变化"))!;
    assert.ok(show);show.click();assert.equal(other.hidden,false);
    const lens=t.work.lensesAPI.read();assert.equal(lens.active,true);
    [...document.querySelectorAll("button")].find(b=>b.textContent==="返回原位置")!.click();
    assert.equal(other.hidden,true);assert.equal(t.row(t.f.a),row);
    t.work.lensesAPI.exit();assert.equal(other.hidden,false);
  }finally{await t.cleanup();}
});
