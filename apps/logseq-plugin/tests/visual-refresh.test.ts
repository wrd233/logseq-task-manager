import test from "node:test";
import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";
import {Window} from "happy-dom";
import {reportProjection} from "../src/features/work-view/report-body.ts";
import {visualRefreshRows} from "./fixtures/visual-refresh.ts";
import expected from "./fixtures/visual-refresh-expected.json" with {type:"json"};
import {sha256,snapshot,sourceId} from "../src/workspace/source-protocol.ts";
import {composeReport} from "../src/features/work-view/report-model.ts";
import type {MaterialService} from "../src/features/materials/service.ts";
import type {MaterialRecord} from "../src/features/materials/store.ts";
const normalize=(text:string)=>text.replace(/\s+/gu,"");
async function until(probe:()=>boolean){for(let n=0;n<200;n++){if(probe())return;await delay(5);}assert.fail("UI did not settle");}
async function browserFixture(){
  const browser=new Window();const prior=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  Object.assign(globalThis,{window:browser,document:browser.document});Object.defineProperty(globalThis,"navigator",{configurable:true,value:browser.navigator});
  return{browser,close:async()=>{await browser.happyDOM.abort();delete (globalThis as Partial<typeof globalThis>).window;delete (globalThis as Partial<typeof globalThis>).document;if(prior)Object.defineProperty(globalThis,"navigator",prior);else Reflect.deleteProperty(globalThis,"navigator");}};
}
test("leading projection has reversible raw spans and preserves every literal or unrecognized marker",()=>{
  const cases:Array<[string,string,string|null]>=[
    ["**[目标]** 保留原句\n[想法] 第二行是原句","保留原句\n[想法] 第二行是原句","goal"],
    ["[问题] 条件还没有确认","条件还没有确认","question"],
    ["TODO **[事务]** 校对\n完整后续行","校对\n完整后续行","object"],
    ["   [注] 三空格仍是说明","   三空格仍是说明","note"],
    ["[想法](https://example.invalid) 这是链接","[想法](https://example.invalid) 这是链接",null],
    ["> **[目标]** 引用"," > **[目标]** 引用".trimStart(),null],
    ["    [目标] 缩进代码","    [目标] 缩进代码",null],
    ["`[想法]` 代码","`[想法]` 代码",null],
    ["```\n[想法] 字面内容\n```","```\n[想法] 字面内容\n```",null],
    ["句中 [想法] 保留","句中 [想法] 保留",null],
    ["**[想法] 残缺粗体保留","**[想法] 残缺粗体保留",null],
    ["[未知] #材料 [想法] 保留","[未知] #材料 [想法] 保留",null],
  ];
  for(const [raw,markdown,marker] of cases){
    const p=reportProjection(raw);assert.equal(p.raw,raw);assert.equal(p.markdown,markdown);assert.equal(p.marker,marker);
    let restored=p.markdown;for(const span of p.removed){assert.equal(raw.slice(span.start,span.end),span.text);restored=restored.slice(0,span.start)+span.text+restored.slice(span.start);}
    assert.equal(restored,raw,"the exact original can be recovered from display and raw spans");
  }
  assert.equal(reportProjection("TODO 普通待办").marker,null);assert.equal(reportProjection("TODO 普通待办").task,"TODO");
  assert.equal(reportProjection("[记录] 事实").label,"记录");
  assert.equal(reportProjection("**[目标]** 保留\nid:: real").markdown,"保留\n");
});

test("all 102 source bodies match frozen prose, retain raw versions and nested identity, and expose no writable heading UUID",async()=>{
  const f=await browserFixture();try{
    const {WorkViewRenderer}=await import("../src/features/work-view/renderer.ts");
    const rows=visualRefreshRows(),scope={graphId:"test:/visual-refresh",rootUuid:rows[0]!.uuid};
    const blocks=await Promise.all(rows.map(async r=>({sourceId:sourceId(scope.graphId,r.uuid),target:{kind:"logseq-block" as const,graphId:scope.graphId,blockUuid:r.uuid},content:r.content+`\nid:: ${r.uuid}`,contentVersion:await sha256(r.content+`\nid:: ${r.uuid}`),parentUuid:r.parentUuid,depth:r.depth,order:r.order,availability:"available" as const})));
    const source=await snapshot(scope,blocks),before=JSON.stringify(source),state={items:rows.map(r=>({uuid:r.uuid,depth:r.depth})),collapsed:[],expanded:[],overrides:{},selected:""};
    const report=composeReport(source,state,null,new Set()),container=document.createElement("main");document.body.append(container);
    const renderer=new WorkViewRenderer(container,{operation:()=>assert.fail("reading wrote"),toggle:()=>{},raw:()=>{},locate:()=>{},enter:()=>{},range:()=>{},repaint:()=>{}});
    const input=blocks.map(b=>({uuid:b.target.blockUuid,content:b.content!,depth:b.depth,sourceParent:b.parentUuid}));renderer.render(input,state,new Set(),report.view,undefined,report);
    for(const row of rows){const node=container.querySelector<HTMLElement>(`[data-uuid="${row.uuid}"]`)!;assert.equal(node.hidden,false);assert.equal(normalize(node.querySelector(".wb-body")!.textContent!),normalize(expected.find(e=>e.uuid===row.uuid)!.text),row.content);const block=blocks.find(b=>b.target.blockUuid===row.uuid)!;assert.equal(node.dataset.reportContentVersion,block.contentVersion);assert.equal(node.dataset.reportSourceId,block.sourceId);for(const span of JSON.parse(node.dataset.reportProjection!) as Array<{start:number;end:number;text:string}>)assert.equal(block.content!.slice(span.start,span.end),span.text);}
    const first=container.querySelector<HTMLElement>(`[data-uuid="${rows[94]!.uuid}"] .wb-local-heading`)!;
    const second=container.querySelector<HTMLElement>(`[data-uuid="${rows[95]!.uuid}"] .wb-local-heading`)!;assert.equal(first.textContent,"思考");assert.equal(second.hidden,true);
    assert.ok(Array.from(container.querySelectorAll("h2,h3")).every(h=>!h.hasAttribute("data-uuid")));assert.equal(JSON.stringify(source),before);
    assert.equal(container.querySelectorAll('a[href="longdoc://77777777-7777-4777-8777-777777777777"]').length,3);
    assert.ok(container.querySelector("blockquote")!.textContent);assert.ok(container.querySelector("table"));
    renderer.clear();assert.equal(container.children.length,0);
  }finally{await f.close();}
});

test("overlay placement stays in a narrow viewport; Escape, outside click, input composition and disposal keep their owners",async()=>{
  const f=await browserFixture();try{
    const {disclosureMenu}=await import("../src/host/panel-host.ts");const menu=disclosureMenu("更多","文件操作");document.body.append(menu.root);menu.content.append(document.createElement("button"));
    Object.defineProperty(f.browser,"innerWidth",{value:320});Object.defineProperty(f.browser,"innerHeight",{value:400});
    menu.trigger.getBoundingClientRect=()=>({top:350,bottom:380,left:275,right:305,width:30,height:30,x:275,y:350,toJSON:()=>({})});
    menu.content.getBoundingClientRect=()=>({top:0,bottom:180,left:0,right:264,width:264,height:180,x:0,y:0,toJSON:()=>({})});
    menu.root.open=true;menu.root.dispatchEvent(new f.browser.Event("toggle") as unknown as Event);assert.ok(parseFloat(menu.content.style.left)>=12);assert.ok(parseFloat(menu.content.style.top)+180<=388);
    const action=menu.content.querySelector("button")!;action.focus();action.dispatchEvent(new f.browser.KeyboardEvent("keydown",{key:"Escape",bubbles:true}) as unknown as Event);assert.equal(menu.root.open,false);assert.equal(document.activeElement,menu.trigger);
    menu.root.open=true;const input=document.createElement("input");menu.content.append(input);input.focus();const escape=new f.browser.KeyboardEvent("keydown",{key:"Escape",bubbles:true,isComposing:true});input.dispatchEvent(escape as unknown as Event);assert.equal(menu.root.open,true);assert.equal(escape.defaultPrevented,false);
    document.body.click();assert.equal(menu.root.open,false);menu.dispose();assert.equal(menu.root.isConnected,false);
  }finally{await f.close();}
});

test("keyed file rename retains its draft, input and focus across refresh, and failure remains retryable in that row",async()=>{
  const f=await browserFixture();try{
    const {MaterialTransfers}=await import("../src/features/materials/transfer-ui.ts");const {button}=await import("../src/host/panel-host.ts");let ticket=0,calls=0,fail=true;
    const record={id:"77777777-7777-4777-8777-777777777777",title:"旧名称",path:"/test/旧名称.md"} as unknown as MaterialRecord;
    const service={read:async()=>({path:record.path,reference:"[旧名称](longdoc://"+record.id+")"}),renameLocal:async(_id:string,name:string)=>{calls++;if(fail)throw Error("没有改名权限");record.title=name;return{status:"success"};}} as unknown as MaterialService;
    const parent=document.createElement("section");document.body.append(parent);
    const transfers=new MaterialTransfers({service:async()=>service,context:async()=>assert.fail(),ticket:()=>ticket,assert:n=>{if(n!==ticket)throw Error("old scope");},busy:()=>false,message:()=>{},fail:()=>assert.fail(),refresh:async()=>{}},parent);
    transfers.sync=async()=>({status:"success"});const row=transfers.decorate(button("旧名称",()=>{}),record,"root");parent.append(row);
    const editing=transfers.rename(record.id,"root");await until(()=>!!row.querySelector("input"));const input=row.querySelector<HTMLInputElement>("input")!;input.value="保留的草稿";input.focus();
    const refreshed=transfers.decorate(button("外部更新名称",()=>{}),record,"root");assert.equal(refreshed,row);assert.equal(row.querySelector("input"),input);assert.equal(input.value,"保留的草稿");assert.equal(document.activeElement,input);
    const form=row.querySelector<HTMLFormElement>("form")!;form.dispatchEvent(new f.browser.Event("submit",{cancelable:true}) as unknown as Event);await until(()=>row.querySelector(".wb-error")!.textContent==="没有改名权限");assert.equal(input.value,"保留的草稿");assert.equal(input.readOnly,false);assert.equal(calls,1);
    fail=false;form.dispatchEvent(new f.browser.Event("submit",{cancelable:true}) as unknown as Event);await editing;assert.equal(calls,2);assert.equal(row.querySelector("form"),null);
    const pending=transfers.rename(record.id,"root");await until(()=>!!row.querySelector("input"));ticket++;transfers.resetScope();await pending;assert.equal(row.querySelector("input"),null);assert.equal(calls,2);transfers.dispose();
  }finally{await f.close();}
});

test("copy gives row-local feedback only after clipboard success, retains failures with retry, and discards a late scope result",async()=>{
  const f=await browserFixture();try{
    const {MaterialTransfers}=await import("../src/features/materials/transfer-ui.ts");const {button}=await import("../src/host/panel-host.ts");let fail=true,writes=0,ticket=0;let release:(()=>void)|null=null;
    const parent=document.createElement("section");document.body.append(parent);const record={id:"77777777-7777-4777-8777-777777777777",title:"材料"} as MaterialRecord;
    Object.defineProperty(f.browser.navigator,"clipboard",{configurable:true,value:{writeText:async()=>{writes++;if(fail)throw Error("clipboard denied");if(release!==null)await new Promise<void>(r=>{release=r;});}}});
    Object.defineProperty(f.browser.document,"execCommand",{value:()=>false});
    const service={read:async()=>({reference:"[材料](longdoc://"+record.id+")"})} as unknown as MaterialService;
    const transfers=new MaterialTransfers({service:async()=>service,context:async()=>assert.fail(),ticket:()=>ticket,assert:n=>{if(n!==ticket)throw Error("old scope");},busy:()=>false,message:()=>assert.fail("list feedback became global"),fail:()=>{},refresh:async()=>{}},parent);
    const row=transfers.decorate(button("材料",()=>{}),record,null);parent.append(row);const count=parent.children.length;
    await transfers.copy(record.id,null,row);assert.match(row.querySelector(".wb-material-feedback")!.textContent!,/复制失败.*重试/);assert.doesNotMatch(row.textContent!,/已复制/);
    fail=false;await transfers.copy(record.id,null,row);assert.equal(row.querySelector(".wb-material-feedback")!.textContent,"已复制");assert.equal(parent.children.length,count);assert.equal(parent.querySelector("textarea"),null);
    release=()=>{};const pending=transfers.copy(record.id,null,row);await until(()=>writes===3);ticket++;transfers.resetScope();release!();await assert.rejects(pending,/old scope/);assert.equal(parent.querySelector(".wb-material-form"),null);transfers.dispose();
  }finally{await f.close();}
});
