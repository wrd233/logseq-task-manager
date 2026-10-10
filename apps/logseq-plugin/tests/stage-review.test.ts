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
  const work=new WorkView(()=>{}, {initialReadingMode:"structure"}),stages=installStageWorkbench({content,work,storage:f.storage});
  await content.local.authorize(f.root);await work.open(f.root);await work.setReviewOpen(true);
  const stage=await stages.api.begin({goal:"原位审阅真实测试",requestKey:crypto.randomUUID(),expectedStageId:null});
  const source=await content.api.read();
  const operations=source.blocks.filter(b=>[f.a,f.b].includes(b.target.blockUuid)).map((b,i)=>({operationId:"item-"+i,type:"replace-text" as const,target:b.target,expectedContentVersion:b.contentVersion!,expectedParentUuid:b.parentUuid,range:{start:0,end:i===0?5:3},expectedText:b.content!.slice(0,i===0?5:3),text:i===0?"Revised":"修改后",context:null}));
  const patch:Patch={schemaVersion:1,requestId:crypto.randomUUID(),scope:source.scope,operations,metadata:{stageId:stage.start.id,runId:null}};
  const result=await stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch});
  assert.equal(result.stageProblem,null);await work.refresh();
  return {f,content,work,stages,stage,row:(id:string)=>document.querySelector<HTMLElement>(`article[data-uuid="${id}"]`)!,
    cleanup:async()=>{stages.dispose();work.dispose();content.dispose();await f.cleanup();}};
}
test("stage goal opens deliberately, IME Enter does not create a stage and Escape returns focus without changing history",async()=>{
  const t=await fixture();try{
    const goal=document.querySelector<HTMLInputElement>("[aria-label='阶段目标']")!;
    const begin=Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent==="新目标")!;
    assert.equal(goal.hidden,true);begin.click();await delay(20);assert.equal(goal.hidden,false);assert.equal(document.activeElement,goal);
    goal.value="下一阶段目标";goal.dispatchEvent(new t.f.browser.KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true}) as unknown as Event);await delay(20);
    assert.equal((await t.stages.api.history()).stages.length,1);
    goal.dispatchEvent(new t.f.browser.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}) as unknown as Event);
    assert.equal(goal.hidden,true);assert.equal(document.activeElement,begin);
    begin.click();await delay(20);goal.value="验证材料可用与退出连接后的阅读";
    goal.dispatchEvent(new t.f.browser.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}) as unknown as Event);
    await wait(()=>goal.hidden,"goal did not close after starting");
    const history=await t.stages.api.history();assert.equal(history.stages.length,2);assert.equal(history.stages.at(-1)!.start.goal,"验证材料可用与退出连接后的阅读");
  }finally{await t.cleanup();}
});
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
    const submit=Array.from(row.querySelectorAll("button")).find(b=>b.textContent==="提交修改")!;
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
    const row=t.row(t.f.b),suggest=Array.from(row.querySelectorAll("button")).find(b=>b.textContent==="原文建议")!;suggest.click();
    await wait(()=>!!row.querySelector("textarea"),"suggestion editor unavailable");
    row.querySelector("textarea")!.value="保留这个限制条件";
    Array.from(row.querySelectorAll("button")).find(b=>b.textContent==="写入原文建议")!.click();
    await wait(()=>!row.querySelector("textarea"),"suggestion not submitted");
    const child=[...t.f.blocks.values()].find(b=>b.content.includes("保留这个限制条件"));
    assert.ok(child);assert.match(child.content,/\*\*\[注\]\*\*/);
    await wait(()=>!!document.querySelector(`article[data-uuid="${child.uuid}"]`),"new suggestion revision not yet displayed");
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
    const row=t.row(t.f.a),correct=Array.from(row.querySelectorAll("button")).find(b=>b.textContent==="重新读取当前原文并纠正")!;correct.click();
    await wait(()=>!!row.querySelector("textarea"),"historical correction editor unavailable");
    const input=row.querySelector("textarea")!;assert.equal(input.value,"当前人工改变过的内容");input.value="修正当前人工内容";
    Array.from(row.querySelectorAll("button")).find(b=>b.textContent==="提交修改")!.click();
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
    const show=Array.from(document.querySelectorAll("button")).find(b=>b.textContent?.includes("范围外变化"))!;
    assert.ok(show);show.click();assert.equal(other.hidden,false);
    const lens=t.work.lensesAPI.read();assert.equal(lens.phase,"focused");
    Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="返回原位置")!.click();
    assert.equal(other.hidden,true);assert.equal(t.row(t.f.a),row);
    t.work.lensesAPI.exit();assert.equal(other.hidden,false);
  }finally{await t.cleanup();}
});

test("report preserves stage show-all, immutable history and return to the existing lens",async()=>{
  const t=await fixture();try{
    assert.equal((await t.work.reportAPI.setMode("report")).ok,true);
    const row=t.row(t.f.a),other=t.row(t.f.b),before=JSON.stringify(await t.stages.api.history());
    await t.work.lensesAPI.select(t.f.a);assert.equal(other.hidden,true);
    Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent?.includes("范围外变化"))!.click();
    assert.equal(other.hidden,false);assert.equal(t.work.lensesAPI.read().phase,"focused");
    Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent==="返回原位置")!.click();
    assert.equal(other.hidden,true);assert.equal(t.row(t.f.a),row);
    document.querySelector<HTMLElement>(".wb-stage-entry")!.click();
    await wait(()=>document.querySelector(".wb-stage-bar>span")?.textContent?.startsWith("历史")??false,"historical mode unavailable");
    assert.equal(document.querySelectorAll(".wb-report-row").length,0);
    assert.equal((await t.work.reportAPI.setMode("structure")).ok,false);
    assert.deepEqual(await t.work.reportAPI.resolve({}),{ok:false,reason:"historical-view"});
    assert.deepEqual(await t.work.reportAPI.openNative({}),{ok:false,reason:"historical-view"});
    assert.equal(Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-menu-content button")).find(b=>b.dataset.actionLabel==="原结构")!.disabled,true);
    assert.ok(Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(b=>b.textContent==="编辑原文").every(b=>b.disabled));
    Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent==="返回原位置")!.click();
    assert.ok(t.row(t.f.a).classList.contains("wb-report-row"));assert.equal(t.row(t.f.b).hidden,true);
    assert.equal(t.work.reportAPI.read().mode,"report");assert.equal(JSON.stringify(await t.stages.api.history()),before);
  }finally{await t.cleanup();}
});

test("historical raw comparison shows saved text without carrying the current report version",async()=>{
  const t=await fixture();try{
    assert.equal((await t.work.reportAPI.setMode("report")).ok,true);
    const history=JSON.stringify(await t.stages.api.history()),row=t.row(t.f.a);
    Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="对照原文")!.click();
    t.f.blocks.get(t.f.a)!.content="当前原文已经有后来修改";await t.work.refresh();
    const raw=row.querySelector<HTMLElement>('[aria-label="原文对照"]')!,current=raw.dataset.contentVersion;
    assert.ok(current);assert.match(raw.textContent!,/后来修改/);
    document.querySelector<HTMLElement>(".wb-stage-entry")!.click();
    await wait(()=>row.classList.contains("wb-review-history"),"historical mode unavailable");
    assert.match(raw.textContent!,/Revised/);assert.doesNotMatch(raw.textContent!,/后来修改/);
    assert.equal(raw.dataset.contentVersion,undefined);assert.equal(raw.dataset.sourceId,undefined);
    assert.deepEqual(t.work.reportAPI.compare({}),{ok:false,reason:"historical-view"});
    Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent==="返回原位置")!.click();
    assert.equal(raw.dataset.contentVersion,current);assert.match(raw.textContent!,/后来修改/);assert.equal(JSON.stringify(await t.stages.api.history()),history);
  }finally{await t.cleanup();}
});

test("review draft survives installer restart; it is explicit, rereads current text and never transfers to another stage",async()=>{
  const t=await fixture();let second:ReturnType<typeof installStageWorkbench>|null=null;try{
    const row=t.row(t.f.a);row.querySelector<HTMLElement>(".wb-body")!.click();await wait(()=>!!row.querySelector("textarea"),"editor");
    const input=row.querySelector("textarea")!;input.value="尚未提交的用户输入";input.dispatchEvent(new t.f.browser.Event("input",{bubbles:true}) as unknown as Event);
    t.stages.dispose();t.f.blocks.get(t.f.a)!.content="重启后原文已有人工修改";
    second=installStageWorkbench({content:t.content,work:t.work,storage:t.f.storage});await t.work.open(t.f.root);await t.work.refresh();
    await wait(()=>document.querySelector(".wb-stage-entry")!==null,"restored history");
    await t.work.setReviewOpen(true);
    row.querySelector<HTMLElement>(".wb-body")!.click();await wait(()=>!!row.querySelector("textarea"),"restore draft");
    assert.equal(row.querySelector("textarea")!.value,"尚未提交的用户输入");
    assert.match(row.querySelector(".wb-review-editor")!.textContent!,/重启后原文已有人工修改/);
    assert.equal(t.f.counts().writes,2);
    Array.from(row.querySelectorAll("button")).find(b=>b.textContent==="保留草稿 / 关闭")!.click();
    const history=await second.api.history();await second.api.begin({goal:"另一目标",requestKey:crypto.randomUUID(),expectedStageId:history.current});
    row.querySelector<HTMLElement>(".wb-body")!.click();await wait(()=>document.querySelector(".wb-stage-bar .wb-error")?.textContent?.includes("另一阶段")??false,"scope draft warning");
    assert.equal(row.querySelector("textarea"),null);
  }finally{second?.dispose();await t.cleanup();}
});

test("selecting an accepted historical revision updates its local acceptance affordance and keeps newer source independent",async()=>{
  const t=await fixture();try{
    await t.f.commands.get("stage-accept")!();const history=await t.stages.api.history(),stage=history.stages[0]!,accepted=stage.acceptances[0]!.revisionId;
    t.f.blocks.get(t.f.a)!.content="更新的当前文";await t.stages.api.checkpoint({stageId:stage.start.id,expectedRevision:stage.revisions.at(-1)!.id,requestKey:crypto.randomUUID(),requestIds:[]});
    document.querySelector<HTMLElement>(".wb-stage-entry")!.click();await wait(()=>document.querySelector("[aria-label='历史修订版本']")!==null,"history selection");
    const select=document.querySelector<HTMLSelectElement>("[aria-label='历史修订版本']")!;select.value=accepted;select.dispatchEvent(new t.f.browser.Event("change") as unknown as Event);
    const accept=Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent==="已认可")!;
    assert.equal(accept.disabled,true);assert.match(document.querySelector(".wb-stage-bar>span")!.textContent!,/已认可/);assert.match(t.row(t.f.a).querySelector(".wb-body")!.textContent!,/Revised/);assert.equal(t.f.blocks.get(t.f.a)!.content,"更新的当前文");
  }finally{await t.cleanup();}
});

test("later current edits cannot be mistaken for an unseen pending result; explicit submitted-version reading enables exact acceptance",async()=>{
  const t=await fixture();try{
    const before=await t.stages.api.history(),revision=before.stages[0]!.revisions.at(-1)!;
    t.f.blocks.get(t.f.a)!.content="原文后来又有人工修改";await t.work.refresh();
    assert.match(t.row(t.f.a).querySelector(".wb-review-info")!.textContent!,/当前原文已不同/);
    assert.match(t.row(t.f.a).querySelector(".wb-review-info")!.textContent!,/当时提交的结果/);
    const accept=Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent==="认可这个版本")!;
    assert.equal(accept.disabled,true);await t.f.commands.get("stage-accept")!();
    assert.equal((await t.stages.api.history()).stages[0]!.acceptances.length,0);
    const submitted=Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent==="查看待认可版本")!;
    assert.equal(submitted.hidden,false);submitted.click();
    await wait(()=>document.querySelector(".wb-stage-bar>span")?.textContent?.startsWith("提交版本")??false,"submitted snapshot unavailable");
    assert.match(t.row(t.f.a).querySelector(".wb-body")!.textContent!,/Revised/);
    assert.doesNotMatch(t.row(t.f.a).querySelector(".wb-body")!.textContent!,/后来又/);
    assert.equal(accept.disabled,false);accept.click();
    await wait(()=>accept.disabled,"exact acceptance incomplete");
    const after=await t.stages.api.history();assert.equal(after.stages[0]!.acceptances[0]!.revisionId,revision.id);
    assert.equal(t.f.blocks.get(t.f.a)!.content,"原文后来又有人工修改");assert.equal(after.stages[0]!.revisions.length,before.stages[0]!.revisions.length);
  }finally{await t.cleanup();}
});
