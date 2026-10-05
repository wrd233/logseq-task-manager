import test from "node:test";
import assert from "node:assert/strict";
import { contentFixture } from "./fixtures/content-writeback.ts";
import { installContentWriteback } from "../src/features/content-writeback/installer.ts";
import { installStageWorkbench } from "../src/features/stage-workbench/installer.ts";
import { textHunks } from "../src/features/work-view/text-diff.ts";

async function wait(check:()=>boolean|Promise<boolean>, message:string) {
  for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail(`${message}: ${document.querySelector(".wb-stage-bar .wb-error")?.textContent??""}`);
}
function button(text:string,root:ParentNode=document):HTMLButtonElement {
  const found=Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent===text);
  assert.ok(found,`button unavailable: ${text}`);return found;
}
async function fixture(mode: "report" | "structure" = "structure") {
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter});
  const {WorkView}=await import("../src/features/work-view/controller.ts");
  const work=new WorkView(()=>{}, {initialReadingMode:mode});let stages=installStageWorkbench({content,work,storage:f.storage});
  await content.local.authorize(f.root,true);await work.open(f.root);
  return {f,content,work,get stages(){return stages;},
    open:()=>document.querySelector<HTMLButtonElement>(".wb-work-shell .wb-review-entry")!.click(),
    begin:async()=>{
      await f.commands.get("stage-begin")!();
      const input=document.querySelector<HTMLInputElement>("[aria-label='阶段目标']")!;input.value="核验同一轮资料维护";
      button("开始").click();await wait(async()=>(await stages.api.history()).stages.length===1,"local begin");
      return (await stages.api.history()).stages[0]!;
    },
    submit:async()=>{
      const history=await stages.api.history(),stage=history.stages[0]!;
      const patch={...f.patch([await f.text(f.a,"Alpha","Revised")]),metadata:{stageId:stage.start.id,runId:null}};
      const result=await stages.api.submit({stageId:stage.start.id,expectedRevision:stage.revisions.at(-1)?.id??stage.start.id,patch});
      assert.equal(result.status,"complete");await work.refresh();return result;
    },
    restart:async()=>{stages.dispose();stages=installStageWorkbench({content,work,storage:f.storage});await work.open(f.root);await work.refresh();},
    cleanup:async()=>{stages.dispose();work.dispose();content.dispose();await f.cleanup();},
  };
}

test("bounded display hunks reconstruct repeated, multiline and astral text without splitting code points",()=>{
  for(const [before,after] of [["条件甲\r\n条件甲 😀 与条件乙","条件甲\r\n条件乙 😁 及条件乙"],["删除一段内容",""],["","新的内容"],["abc def ghi","abc X def Y ghi"]]){
    const hunks=textHunks(before!,after!);assert.ok(hunks);let reconstructed="",cursor=0;
    for(const h of hunks){reconstructed+=before!.slice(cursor,h.beforeStart)+after!.slice(h.afterStart,h.afterEnd);cursor=h.beforeEnd;
      for(const [s,i] of [[before,h.beforeStart],[before,h.beforeEnd],[after,h.afterStart],[after,h.afterEnd]] as const)assert.ok(!(i>0&&/[\uD800-\uDBFF]/u.test(s![i-1]!)&&/[\uDC00-\uDFFF]/u.test(s![i]!)));}
    assert.equal(reconstructed+before!.slice(cursor),after);
  }
  assert.equal(textHunks("甲".repeat(1000),"乙".repeat(1000)),null);
});
test("ordinary reading exposes one collaboration entry, keeps setup optional and never writes or fabricates agent activity",async()=>{
  const t=await fixture();try{
    const controls=document.querySelector<HTMLElement>(".wb-collaboration-controls")!;
    assert.equal(controls.hidden,true);assert.equal(document.querySelector<HTMLButtonElement>(".wb-work-shell .wb-review-entry")!.textContent,"审阅与历史");
    assert.equal(document.querySelector<HTMLInputElement>("[aria-label='阶段目标']")!.hidden,true);
    assert.equal(document.querySelectorAll(".wb-review-info").length,0);assert.equal(t.f.counts().writes,0);
    t.open();assert.equal(controls.hidden,false);assert.ok(Array.from(controls.querySelectorAll("details")).every(d=>!d.open));
    assert.match(controls.textContent!,/不表示 agent 在线|不会启动模型/);assert.doesNotMatch(controls.textContent!,/agent 正在处理/);
    button("收起审阅").click();assert.equal(controls.hidden,true);assert.equal((await t.stages.api.history()).stages.length,0);
  }finally{await t.cleanup();}
});
test("real local begin and record name their local effect; remote changes stay discoverable without opening a console",async()=>{
  const t=await fixture();try{
    await t.begin();button("收起审阅").click();await t.submit();
    assert.match(document.querySelector<HTMLButtonElement>(".wb-work-shell .wb-review-entry")!.textContent!,/有改动/);
    assert.equal(document.querySelector<HTMLElement>(".wb-collaboration-controls")!.hidden,true);
    assert.ok(Array.from(document.querySelectorAll<HTMLElement>(".wb-review-info")).every(n=>n.hidden));
    t.open();assert.equal(document.querySelector(".wb-stage-bar")!.getAttribute("data-review-mode"),"current");
    assert.match(button("记录当前版本").title,/不发送给 agent 或发布/);
    button("记录当前版本").click();await wait(()=>document.querySelector(".wb-stage-bar .wb-error")?.textContent?.includes("没有发送给 agent")??false,"local record message");
    assert.equal((await t.stages.api.history()).stages.length,1);
  }finally{await t.cleanup();}
});
test("collapsed shortcut cannot approve an unseen revision; submitted snapshots and later native writing remain distinct",async()=>{
  const t=await fixture();try{
    await t.begin();button("收起审阅").click();const result=await t.submit();
    await t.f.commands.get("stage-accept")!();assert.equal((await t.stages.api.history()).stages[0]!.acceptances.length,0);
    t.f.blocks.get(t.f.a)!.content+="\n原生后来写下的限制";await t.work.refresh();
    assert.equal(button("认可这个版本").disabled,true);button("查看待认可版本").click();
    assert.equal(document.querySelector(".wb-stage-bar")!.getAttribute("data-review-mode"),"submitted");
    assert.doesNotMatch(document.querySelector(`article[data-uuid='${t.f.a}'] .wb-body`)!.textContent!,/后来写下/);
    button("认可这个版本").click();await wait(async()=>(await t.stages.api.history()).stages[0]!.acceptances.length===1,"local acceptance");
    const stage=(await t.stages.api.history()).stages[0]!;assert.equal(stage.acceptances[0]!.revisionId,result.stageRevision);
    const frozen=JSON.stringify(stage);t.f.blocks.get(t.f.a)!.content+="\n继续原生写作";
    button("返回原位置").click();await t.work.refresh();assert.match(document.querySelector(`article[data-uuid='${t.f.a}'] .wb-body`)!.textContent!,/继续原生/);
    assert.equal(JSON.stringify((await t.stages.api.history()).stages[0]),frozen);
  }finally{await t.cleanup();}
});
test("sparse changes preserve long Markdown links emphasis code and every unchanged sentence",async()=>{
  const t=await fixture();try{
    const text="[注] **保留口吻** 和 [资料](longdoc://12345678-1234-4123-8123-123456789abc) 与 `原始代码`。"+"条件和反例不能省略。".repeat(100)+"结论仍不确定。";
    t.f.blocks.get(t.f.a)!.content=text;await t.begin();const stage=(await t.stages.api.history()).stages[0]!;
    const operations=[await t.f.text(t.f.a,"保留口吻","保持口吻"),await t.f.text(t.f.a,"仍不确定","需要核验")];
    assert.equal((await t.stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch:{...t.f.patch(operations),metadata:{stageId:stage.start.id,runId:null}}})).status,"complete");
    const body=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}'] .wb-body`)!;
    assert.match(body.querySelector("strong")!.textContent!,/保持口吻/);assert.equal(body.querySelector("a")!.getAttribute("href"),"longdoc://12345678-1234-4123-8123-123456789abc");assert.equal(body.querySelector("code")!.textContent,"原始代码");
    assert.equal(body.textContent!.split("条件和反例不能省略。").length-1,100);
    const marks=Array.from(body.querySelectorAll("mark"));assert.ok(marks.length>=2);assert.ok(marks.reduce((n,m)=>n+m.textContent!.length,0)<30);
    assert.equal(body.querySelector("textarea"),null);
  }finally{await t.cleanup();}
});
test("lost suggestion reply is queried using its retained request after restart and is never appended twice",async()=>{
  const t=await fixture();try{
    await t.begin();await t.submit();const row=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.b}']`)!;
    // Suggestions are offered on actual changes. Select the changed source block.
    const changed=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}']`)!;button("原文建议",changed).click();
    await wait(()=>!!changed.querySelector("textarea"),"suggestion editor");changed.querySelector("textarea")!.value="保留这个反例";
    t.f.onInsert(async()=>{throw Error("lost SDK reply after insertion");});button("写入原文建议",changed).click();
    await wait(()=>changed.textContent?.includes("写入结果未知")??false,"unknown result");
    assert.equal(t.f.counts().inserts,1);assert.equal(button("重新读取当前原文",changed).disabled,true);
    button("保留草稿 / 关闭",changed).click();await t.restart();t.open();
    const restored=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}']`)!;
    await wait(()=>!!document.querySelector<HTMLElement>(".wb-stage-bar")!.dataset.reviewRevision && restored.querySelector<HTMLElement>(".wb-review-info")?.hidden===false,"restored review");button("纠正",restored).click();
    await wait(()=>!!restored.querySelector("textarea"),"retained request");assert.equal(restored.querySelector("textarea")!.value,"保留这个反例");
    assert.equal(button("重新读取当前原文",restored).disabled,true);button("查询写入事实",restored).click();
    await wait(()=>restored.textContent?.includes("结果仍未知")??false,"query unknown");assert.equal(t.f.counts().inserts,1);
    assert.equal(t.f.blocks.get(t.f.a)!.children.length,1);assert.equal(row.querySelector("textarea"),null);
    const discover=t.f.storage.allKeys;t.f.storage.allKeys=async()=>[];
    button("查询写入事实",restored).click();await wait(()=>restored.textContent?.includes("执行记录暂无法核实")??false,"missing record is not proof of no write");
    assert.equal(button("重新读取当前原文",restored).disabled,true);assert.equal(t.f.counts().inserts,1);t.f.storage.allKeys=discover;
  }finally{await t.cleanup();}
});
test("native drafts and composition keep the reading frame and review proposal rather than changing mode",async()=>{
  const t=await fixture();try{
    await t.begin();await t.submit();const row=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}']`)!;
    button("纠正",row).click();await wait(()=>!!row.querySelector("textarea"),"review editor");
    const area=row.querySelector("textarea")!;area.value+="尚未提交";area.dispatchEvent(new t.f.browser.Event("input",{bubbles:true}) as unknown as Event);
    area.dispatchEvent(new t.f.browser.Event("compositionstart",{bubbles:true}) as unknown as Event);button("收起审阅").click();await t.work.refresh();
    assert.equal(row.querySelector("textarea"),area);assert.match(area.value,/尚未提交/);assert.equal(button("提交修改",row).disabled,true);
    assert.equal(document.querySelector<HTMLElement>(".wb-collaboration-controls")!.hidden,false);
    area.dispatchEvent(new t.f.browser.Event("compositionend",{bubbles:true}) as unknown as Event);button("保留草稿 / 关闭",row).click();
    t.f.editing(t.f.a);await t.work.refresh();button("收起审阅").click();assert.equal(document.querySelector<HTMLElement>(".wb-collaboration-controls")!.hidden,false);
  }finally{await t.cleanup();}
});

test("verified source with failed final Journal save retains its request; recovery stays unknown without durable attribution and never rewrites source",async()=>{
  const t=await fixture();try{
    await t.begin();await t.submit();const row=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}']`)!;
    button("纠正",row).click();await wait(()=>!!row.querySelector("textarea"),"editor");
    row.querySelector("textarea")!.value=row.querySelector("textarea")!.value.replace("Revised","本地纠正");
    t.f.onStorage(async(key,value)=>{if(key.startsWith("content-writeback-v1-")&&JSON.parse(value).items.some((item:{status:string})=>item.status==="APPLIED_VERIFIED"))throw Error("final Journal unavailable");});
    button("提交修改",row).click();await wait(()=>row.textContent?.includes("原请求已保留")??false,"nondurable proposal");
    assert.match(t.f.blocks.get(t.f.a)!.content,/本地纠正/);assert.ok(row.querySelector("textarea"));
    assert.equal(button("重新读取当前原文",row).disabled,true);assert.equal(button("提交修改",row).disabled,true);
    const writes=t.f.counts().writes;t.f.onStorage(null);button("查询写入事实",row).click();
    await wait(()=>row.textContent?.includes("结果仍未知")??false,"conservative recovery");
    assert.equal(button("提交修改",row).disabled,true);assert.equal(button("重新读取当前原文",row).disabled,true);
    assert.equal(t.f.counts().writes,writes);assert.equal((await t.stages.api.history()).stages.length,1);
  }finally{await t.cleanup();}
});

test("durable source success with stage-save failure can repair the same stage using the original request without another write",async()=>{
  const t=await fixture();try{
    await t.begin();await t.submit();const row=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}']`)!;
    button("纠正",row).click();await wait(()=>!!row.querySelector("textarea"),"editor");
    row.querySelector("textarea")!.value=row.querySelector("textarea")!.value.replace("Revised","本地纠正");
    t.f.onStorage(async(key,value)=>{
      if(!key.startsWith("stage-prepared-v1-"))return;
      const event=JSON.parse(JSON.parse(value).payload);
      if(event.kind==="revision"&&event.revision.facts.some((fact:{record:{origin:{kind:string}}})=>fact.record.origin.kind==="local-user-command"))throw Error("stage preparation unavailable");
    });
    button("提交修改",row).click();await wait(()=>row.textContent?.includes("stage preparation unavailable")??false,"stage failure");
    assert.match(t.f.blocks.get(t.f.a)!.content,/本地纠正/);assert.ok(row.querySelector("textarea"));
    const writes=t.f.counts().writes;t.f.onStorage(null);button("查询写入事实",row).click();
    await wait(()=>row.textContent?.includes("原文写入已核实")??false,"durable source query");
    button("补记此版本",row).click();await wait(()=>!row.querySelector("textarea"),"same-request stage repair");
    assert.equal(t.f.counts().writes,writes);assert.equal((await t.stages.api.history()).stages.length,1);
  }finally{await t.cleanup();}
});

test("confirmed version conflict keeps both texts and disables stale save until an explicit current reread",async()=>{
  const t=await fixture();try{
    await t.begin();await t.submit();const row=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}']`)!;
    button("纠正",row).click();await wait(()=>!!row.querySelector("textarea"),"editor");
    const proposal=row.querySelector("textarea")!.value.replace("Revised","尚待核验");
    row.querySelector("textarea")!.value=proposal;t.f.blocks.get(t.f.a)!.content="后来用户已经修改";
    button("提交修改",row).click();await wait(()=>row.textContent?.includes("当前正文已改变")??false,"version conflict");
    assert.equal(row.querySelector("textarea")!.value,proposal);assert.equal(t.f.blocks.get(t.f.a)!.content,"后来用户已经修改");
    assert.match(row.textContent!,/这次结果中保留的当前文.*后来用户已经修改/);
    assert.equal(button("提交修改",row).disabled,true);assert.equal(button("重新读取当前原文",row).disabled,false);
    button("重新读取当前原文",row).click();await wait(()=>row.textContent?.includes("本次读取的当前原文")??false,"explicit reread");
    assert.match(row.textContent!,/后来用户已经修改/);assert.equal(row.querySelector("textarea")!.value,proposal);
    assert.equal(button("提交修改",row).disabled,false);assert.equal(t.f.counts().writes,1);
  }finally{await t.cleanup();}
});

test("large focused reading exposes all changes and missing blocks without mutating its reading scope or history",async()=>{
  const t=await fixture();try{
    for(let i=0;i<80;i++)t.f.add(`[注] 记录 ${i}：保留原文条件与反例，不把疑问写成结论。`.repeat(3));
    await t.work.open(t.f.root);await t.begin();
    const stage=(await t.stages.api.history()).stages[0]!;
    const operations=[await t.f.text(t.f.a,"Alpha","Revised"),await t.f.text(t.f.b,"另一个块","新一处记录")];
    await t.stages.api.submit({stageId:stage.start.id,expectedRevision:stage.start.id,patch:{...t.f.patch(operations),metadata:{stageId:stage.start.id,runId:null}}});
    await t.work.lensesAPI.select(t.f.a);
    const other=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.b}']`)!;assert.equal(other.hidden,true);
    Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent?.includes("范围外变化"))!.click();
    assert.equal(other.hidden,false);assert.equal(t.work.lensesAPI.read().phase,"focused");
    button("返回原位置").click();assert.equal(other.hidden,true);
    t.f.blocks.get(t.f.root)!.children=t.f.blocks.get(t.f.root)!.children.filter(id=>id!==t.f.b);t.f.blocks.delete(t.f.b);await t.work.refresh();
    Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-stage-bar button")).find(b=>b.textContent?.includes("范围外变化"))!.click();
    assert.equal(other.hidden,false);assert.match(other.textContent!,/已缺失/);
    assert.match(other.querySelector(".wb-review-old")!.textContent!,/新一处记录/);
    assert.equal(other.querySelector(".wb-review-info button"),null);assert.equal(t.f.counts().inserts,0);
    const frozen=JSON.stringify(await t.stages.api.history());button("返回原位置").click();button("收起审阅").click();
    assert.match(document.querySelector(".wb-work-shell .wb-review-entry")!.textContent!,/有改动/);
    assert.equal(JSON.stringify(await t.stages.api.history()),frozen);
  }finally{await t.cleanup();}
});

test("local connection controls use a private scope port; external stage APIs never expose approval or authority",async()=>{
  const t=await fixture();let connected=false,root="",structure=false;try{
    t.stages.setCollaboration({status:()=>({connected,binding:connected?{scope:t.f.scope,directory:"/private/work"}:null}),connect:async(uuid,organize)=>{root=uuid;structure=organize;connected=true;},stop:()=>{connected=false;}});
    t.open();button("连接正文维护").click();await wait(()=>connected,"text connection");
    assert.equal(root,t.f.root);assert.equal(structure,false);button("断开工作连接").click();assert.equal(connected,false);
    button("允许润色与原块整理").click();await wait(()=>structure,"explicit structure connection");
    assert.match(document.querySelector(".wb-collaboration-controls")!.textContent!,/这不表示 agent 在线/);
    assert.equal("accept" in t.stages.api,false);assert.equal("setCollaboration" in t.stages.api,false);assert.equal("authorize" in t.stages.api,false);
    t.stages.setCollaboration(null);button("断开工作连接").click();assert.equal(t.f.counts().writes,0);
  }finally{await t.cleanup();}
});

test("shared work entry composes the default full report, explicit review and read-only history without changing source or its reading scope",async()=>{
  const t=await fixture("report");try{
    assert.equal(t.work.reportAPI.read().mode,"report");
    await t.begin();await t.submit();
    assert.equal((await t.work.reportAPI.refresh()).ok,true);
    await t.work.lensesAPI.select(t.f.a);
    const plan=t.work.lensesAPI.read().plan;
    const row=document.querySelector<HTMLElement>(`article[data-uuid='${t.f.a}']`)!;
    row.querySelector<HTMLElement>(".wb-body")!.click();
    assert.equal(row.querySelector("textarea"),null);
    assert.match(row.querySelector(".wb-body")!.textContent!,/Revised/);
    const history=JSON.stringify(await t.stages.api.history()),source=JSON.stringify([...t.f.blocks]);
    button("收起审阅").click();assert.equal(t.work.reviewing,false);
    await t.f.commands.get("stage-history")!();
    assert.equal(t.work.reviewing,true);assert.equal(document.querySelector<HTMLElement>(".wb-review-host")!.hidden,false);
    assert.equal(document.querySelector<HTMLElement>(".wb-stage-bar")!.dataset.reviewMode,"history");
    assert.equal(document.querySelector<HTMLButtonElement>(".wb-work-shell .wb-primary")!.disabled,true);
    assert.match(document.querySelector(".wb-work-notice")!.textContent!,/只读版本/);
    button("收起审阅").click();
    assert.equal(t.work.reviewing,false);assert.equal(document.querySelector<HTMLElement>(".wb-review-host")!.hidden,true);
    assert.equal(document.activeElement,document.querySelector(".wb-work-shell .wb-review-entry"));
    assert.equal(t.work.reportAPI.read().mode,"report");assert.deepEqual(t.work.lensesAPI.read().plan,plan);
    assert.equal(document.querySelector<HTMLButtonElement>(".wb-work-shell .wb-primary")!.disabled,false);
    assert.equal(JSON.stringify(await t.stages.api.history()),history);assert.equal(JSON.stringify([...t.f.blocks]),source);
  }finally{await t.cleanup();}
});
