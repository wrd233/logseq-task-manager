import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256, snapshot, sourceId, type BlockSnapshot } from "../src/workspace/source-protocol.ts";
import { composeReport, reportCategory } from "../src/features/work-view/report-model.ts";
import { resolveBodyTarget } from "../src/features/work-view/report-target.ts";

const scope={graphId:"test:/graph",rootUuid:"root"};
async function sourceFixture() {
  const entries: Array<[string,string,string|null,number]> = [
    ["root","**[MiniProject]** 整理一份调研材料 #MiniProject",null,0],
    ["note","[注] 目前先保留本地文件，后续还要核对引用。","root",1],
    ["condition","这条条件没有标记：同名文件可能来自不同目录，不能直接合并。","root",1],
    ["goal","[目标] 形成一份能继续维护的资料说明。","root",1],
    ["idea","[想法] 原生页面负责写，报告负责把分散记录排清楚。","root",1],
    ["todo","TODO 核对第二份材料中的版本日期","root",1],
    ["note2","[注] 不支持的文件格式仍可以从原文件查看。","root",1],
    ["counter","没有标记的补充正文和一条反例。","root",1],
    ["unknown","[风险] 这是未知标记，仍保留原文。","root",1],
    ["task","TODO **[事务]** 核对引用资料","root",1],
    ["code","```js\nconst TODO = '[目标]';\n```","task",2],
    ["link","[原文件](longdoc://12345678-1234-4123-8123-123456789abc)","task",2],
  ];
  const orders=new Map<string|null,number>(), blocks: BlockSnapshot[]=[];
  for (const [uuid,content,parentUuid,depth] of entries) {
    const order=orders.get(parentUuid)??0;orders.set(parentUuid,order+1);
    blocks.push({sourceId:sourceId(scope.graphId,uuid),target:{kind:"logseq-block",graphId:scope.graphId,blockUuid:uuid},
      content,contentVersion:await sha256(content),parentUuid,order,depth,availability:"available"});
  }
  return snapshot(scope,blocks);
}
test("finite leading marks distinguish facts from ordinary text, code, unknown marks and formal objects",()=>{
  assert.equal(reportCategory("[注] 普通说明"),"notes");assert.equal(reportCategory("**[想法]** 一个想法"),"ideas");
  assert.equal(reportCategory("id:: root\n[目标] 说明"),"goals");
  assert.equal(reportCategory("TODO 普通待办"),"todos");assert.equal(reportCategory("TODO **[事务]** 原写法"),"objects");
  for(const text of ["条件里提到[目标]","[风险] 条件","```\n[想法] 代码\n```","无标记原文"])assert.equal(reportCategory(text),null);
});
test("report grouping preserves ambiguous sibling adjacency, complete bodies, UUIDs, nested objects and original truth",async()=>{
  const source=await sourceFixture(), before=JSON.stringify(source);
  const state={items:source.blocks.map(b=>({uuid:b.target.blockUuid,depth:b.depth})),collapsed:[],expanded:[],overrides:{},selected:""};
  const report=composeReport(source,state,null,new Set());
  assert.deepEqual(report.view.items.map(i=>i.uuid),["root","note","condition","goal","idea","todo","note2","counter","unknown","task","code","link"]);
  assert.equal(new Set(report.view.items.map(i=>i.uuid)).size,source.blocks.length);
  assert.ok(report.view.items.every(i=>i.full&&!i.hidden));
  assert.deepEqual(report.headings.map(h=>h.title),["思考","待办"]);
  assert.equal(report.fragments.find(f=>f.target.blockUuid==="task")?.objectKind,"task");
  assert.equal(report.fragments.find(f=>f.target.blockUuid==="code")?.parentUuid,"task");
  assert.equal(report.fragments.length,source.blocks.length);assert.equal(JSON.stringify(source),before);
  assert.deepEqual(report.fragments.slice(-3).map(f=>f.sourceId),["task","code","link"].map(id=>sourceId(scope.graphId,id)));
  for(const fragment of report.fragments){
    const original=source.blocks.find(b=>b.sourceId===fragment.sourceId)!;
    assert.equal(fragment.contentVersion,createHash("sha256").update(original.content!,"utf8").digest("hex"));
    assert.deepEqual(fragment.scope,scope);assert.deepEqual(fragment.range,{unit:"block"});
  }
  assert.deepEqual(state.items,source.blocks.map(b=>({uuid:b.target.blockUuid,depth:b.depth})));
});
test("report folds and personal order are presentation overlays; switching does not replace the personal tree",async()=>{
  const source=await sourceFixture();
  const state={items:source.blocks.map(b=>({uuid:b.target.blockUuid,depth:b.depth})),collapsed:[],expanded:[],overrides:{note:"quiet"},selected:"task"};
  const before=JSON.stringify(state), report=composeReport(source,state,null,new Set(["task"]));
  assert.equal(report.view.items.find(i=>i.uuid==="task")?.folded,true);
  assert.equal(report.view.items.find(i=>i.uuid==="code")?.hidden,true);
  assert.equal(report.view.items.find(i=>i.uuid==="condition")?.hidden,false);assert.equal(JSON.stringify(state),before);
});
test("explicit body targets validate real source and parent versions, reject section keys, offsets, unknown authority and stale facts",async()=>{
  const source=await sourceFixture(), block=source.blocks.find(b=>b.target.blockUuid==="note")!;
  const input={schemaVersion:1,scope,sourceId:block.sourceId,contentVersion:block.contentVersion,structureVersion:source.structureVersion,position:{kind:"after"}};
  const target=resolveBodyTarget(input,source);
  assert.equal(target.target.blockUuid,"note");assert.equal(target.parent?.target.blockUuid,"root");assert.equal(target.position.kind,"after");
  for(const patch of [{sourceId:'["root","notes"]'},{contentVersion:"a".repeat(64)},{structureVersion:"a".repeat(64)},
    {scope:{...scope,rootUuid:"another"}},{capability:true},{position:{kind:"offset",start:2}},{sourceId:source.blocks[0]!.sourceId,contentVersion:source.blocks[0]!.contentVersion}]) {
    assert.throws(()=>resolveBodyTarget({...input,...patch},source));
  }
  assert.throws(()=>resolveBodyTarget({...input,position:{get kind(){throw Error("getter executed");}}},source),/invalid-report-position/);
});
