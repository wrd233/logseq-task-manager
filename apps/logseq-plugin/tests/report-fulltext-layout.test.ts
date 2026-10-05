import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { longformRows } from "./fixtures/report-longform.ts";
import { sha256, snapshot, sourceId, type BlockSnapshot } from "../src/workspace/source-protocol.ts";
import { composeReport, reportCategory } from "../src/features/work-view/report-model.ts";
import { Window } from "happy-dom";

const materialId="77777777-7777-4777-8777-777777777777";
const rows=longformRows(materialId),scope={graphId:"test:/long-work",rootUuid:rows[0]!.uuid};
async function sourceFixture() {
  const blocks:BlockSnapshot[]=await Promise.all(rows.map(async row=>{
    const content=row.content+`\nid:: ${row.uuid}`;
    return {sourceId:sourceId(scope.graphId,row.uuid),target:{kind:"logseq-block" as const,graphId:scope.graphId,blockUuid:row.uuid},
      content,contentVersion:await sha256(content),parentUuid:row.parentUuid,depth:row.depth,order:row.order,availability:"available" as const};
  }));
  return snapshot(scope,blocks);
}
const personal=()=>({items:rows.map(r=>({uuid:r.uuid,depth:r.depth})),collapsed:[rows[0]!.uuid],expanded:[],overrides:{},selected:""});
const normalized=(text:string)=>text.replace(/\s+/gu,"");
test("long fixture has 92 bodies, four levels, two affairs, a nested work, distinct aliases and at least 4000 Chinese characters",()=>{
  assert.equal(rows.length-1,92);assert.equal(Math.max(...rows.map(r=>r.depth)),4);
  assert.ok((rows.map(r=>r.content).join("").match(/[\u3400-\u9fff]/gu)??[]).length>=4000);
  assert.equal(rows.filter(r=>r.content.startsWith("TODO **[事务]**")).length,2);
  assert.equal(rows.filter(r=>r.content.startsWith("**[MiniProject]**")).length,2);
  assert.equal(rows.filter(r=>r.content==="重复句：只核对当前工作，不扩大授权范围。").length,2);
});
test("ordinary explanatory trees keep exact child order; object subtrees remain contiguous and unknown siblings keep both neighbors",async()=>{
  const source=await sourceFixture(),state=personal(),before=JSON.stringify([source,state]);
  const report=composeReport(source,state,null,new Set()),ordered=report.view.items.map(i=>i.uuid);
  assert.equal(ordered.length,source.blocks.length);assert.equal(new Set(ordered).size,source.blocks.length);
  for(const parent of rows){
    const siblings=rows.filter(r=>r.parentUuid===parent.uuid);
    if(!siblings.length)continue;
    const displayed=ordered.filter(id=>siblings.some(r=>r.uuid===id));
    if(reportCategory(parent.content)!=="objects") assert.deepEqual(displayed,siblings.map(r=>r.uuid),parent.content);
    for(let i=0;i<siblings.length;i++)if(reportCategory(siblings[i]!.content)===null){
      const at=displayed.indexOf(siblings[i]!.uuid);
      assert.equal(displayed[at-1],siblings[i-1]?.uuid,siblings[i]!.content);
      assert.equal(displayed[at+1],siblings[i+1]?.uuid,siblings[i]!.content);
    }
  }
  for(const block of source.blocks){
    const at=source.blocks.indexOf(block),descendants:typeof source.blocks[number][]=[];
    for(let i=at+1;i<source.blocks.length&&source.blocks[i]!.depth>block.depth;i++)descendants.push(source.blocks[i]!);
    const actual=ordered.slice(ordered.indexOf(block.target.blockUuid)+1,ordered.indexOf(block.target.blockUuid)+1+descendants.length);
    assert.deepEqual(new Set(actual),new Set(descendants.map(b=>b.target.blockUuid)),block.content??"");
  }
  assert.equal(JSON.stringify([source,state]),before);assert.ok(report.view.items.every(i=>i.full&&!i.hidden));
  assert.ok(report.headings.every(h=>reportCategory(source.blocks.find(b=>b.target.blockUuid===JSON.parse(h.key)[0])!.content!)==="objects"));
});
test("each long-form source has complete visible Markdown, correct raw version and stable material alias targets",async()=>{
  const browser=new Window();Object.assign(globalThis,{window:browser,document:browser.document});
  try{
    const {WorkViewRenderer}=await import("../src/features/work-view/renderer.ts");
    const source=await sourceFixture(),state=personal(),report=composeReport(source,state,null,new Set()),container=document.createElement("main");document.body.append(container);
    const renderer=new WorkViewRenderer(container,{operation:()=>{},toggle:()=>{},raw:()=>{},locate:()=>{},enter:()=>{},range:()=>{},repaint:()=>{}});
    const bodies=source.blocks.map(b=>({uuid:b.target.blockUuid,content:b.content!,depth:b.depth,sourceParent:b.parentUuid}));
    renderer.render(bodies,state,new Set(),report.view,undefined,report);
    for(const row of rows){
      const node=container.querySelector<HTMLElement>(`article[data-uuid="${row.uuid}"]`)!,body=node.querySelector<HTMLElement>(".wb-body")!;
      assert.equal(node.hidden,false,row.content);assert.ok(body.classList.contains("expanded"),row.content);
      assert.equal(normalized(body.textContent!),normalized(row.expectedText),row.content);
      const original=source.blocks.find(b=>b.target.blockUuid===row.uuid)!;
      assert.equal(node.dataset.reportSourceId,original.sourceId);
      assert.equal(node.dataset.reportContentVersion,createHash("sha256").update(original.content!).digest("hex"));
    }
    const code=container.querySelector("pre code")!;
    assert.match(code.textContent!,/id:: 这是一行代码中的原文/);
    const aliases=Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href="longdoc://'+materialId+'"]'));
    assert.equal(aliases.length,3);assert.equal(aliases[0]!.textContent,"原始依据");assert.equal(aliases[1]!.textContent,"给同事看的简短别名");
    assert.equal(container.querySelectorAll("table").length,1);assert.equal(container.querySelectorAll("blockquote").length,1);
  }finally{await browser.happyDOM.abort();delete (globalThis as Partial<typeof globalThis>).window;delete (globalThis as Partial<typeof globalThis>).document;}
});
test("coverage distinguishes explicit hidden ranges from unavailable sources and never invents fragments for missing text",async()=>{
  const source=await sourceFixture(),state=personal(),root=source.scope.rootUuid;
  const folded=composeReport(source,state,null,new Set([root]));
  assert.equal(folded.coverage.range,"limited");assert.equal(folded.coverage.shown,1);assert.equal(folded.coverage.hiddenSourceIds.length,92);
  const blocks=source.blocks.map((b,i)=>i===44?{...b,content:null,contentVersion:null,availability:"unavailable" as const}:b);
  const unavailable=await snapshot(scope,blocks),report=composeReport(unavailable,state,null,new Set());
  assert.equal(report.coverage.range,"unavailable");assert.equal(report.coverage.available,92);
  assert.deepEqual(report.coverage.unavailableSourceIds,[blocks[44]!.sourceId]);
  assert.equal(report.fragments.some(f=>f.sourceId===blocks[44]!.sourceId),false);
});
