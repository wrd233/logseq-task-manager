import test from 'node:test';import assert from 'node:assert/strict';
import {workObject,ancestry,clickDecision} from '../../src/features/work-view/focus.mjs';
const blocks={m:{uuid:'m',content:'**[MiniProject]** #MiniProject 探针验证',parent:{id:'page'}},context:{uuid:'context',content:'普通背景',parent:{id:'m'}},t:{uuid:'t',content:'**[任务]** 搭建测试环境',parent:{id:'context'}},note:{uuid:'note',content:'**[现状]** 环境已经部署',parent:{id:'t'}},sibling:{uuid:'sibling',content:'**[事项]** 另一任务',parent:{id:'context'}},out:{uuid:'out',content:'**[事务]** 外部事务',parent:{id:'page'}},plain:{uuid:'plain',content:'随记',parent:{id:'page'}},page:{uuid:'page',name:'fixture'}};
const trace=id=>ancestry(id,async id=>blocks[id]);
test('explicit task aliases and MiniProject titles are reading objects without a repeated tag',()=>{
  for(const alias of ['事务','事项','任务'])for(const decoration of [`**[${alias}]**`,`[${alias}]`])assert.equal(workObject(`${decoration} 标题`).type,'task');
  for(const s of ['TODO 做事','**[现状]** 原文','**[注]** a','**[想法]** a','**[Project]** a','**[阶段性目标]** a','这里 **[任务]** 引用','> **[任务]** 引用','```\n**[事务]** 示例\n```','    **[任务]** 缩进示例'])assert.equal(workObject(s),null,s);
  assert.equal(workObject('**[MiniProject]** 标题 #MiniProject').title,'标题');assert.equal(workObject('**[MiniProject]** 无标签').title,'无标签');
});
test('ordinary context traversed, nearest wins, only object crumbs',async()=>{const a=await trace('note');assert.deepEqual(a.path,['note','t','context','m']);assert.deepEqual(a.objects.map(x=>x.uuid),['m','t']);assert.equal(clickDecision({},a).uuid,'t');assert.equal(clickDecision({},await trace('context')).uuid,'m');assert.equal(clickDecision({},await trace('m')).uuid,'m')});
test('breadcrumb hold contains nested objects via SOURCE ancestry; external exits',async()=>{const state={root:'m',held:'breadcrumb'};for(const id of ['note','t','sibling','context','m'])assert.equal(clickDecision(state,await trace(id)).reason,'inside-held-scope');assert.equal(clickDecision(state,await trace('out')).uuid,'out');assert.equal(clickDecision(state,await trace('plain')).release,true)});
test('default sibling switches; explicit ordinary scope holds only its subtree',async()=>{assert.equal(clickDecision({root:'t'},await trace('sibling')).uuid,'sibling');assert.equal(clickDecision({root:'context',held:'explicit'},await trace('note')).reason,'inside-held-scope');assert.equal(clickDecision({root:'context',held:'explicit'},await trace('m')).uuid,'m')});
test('cycles and overlong paths do not switch scope',async()=>{const cyc=await ancestry('x',async()=>({uuid:'x',content:'**[任务]** loop',parent:{id:'x'}}));assert.equal(cyc.complete,false);assert.equal(clickDecision({},cyc).reason,'ancestry-incomplete');assert.equal((await ancestry('note',async id=>blocks[id],{limit:2})).complete,false)});
test('unreadable parent is not mistaken for a normal end; page ID terminates safely',async()=>{const broken=await ancestry('x',async id=>id==='x'?{uuid:'x',content:'**[任务]** X',parent:{id:'missing'},page:{id:'p'}}:null);assert.equal(broken.complete,false);const pageEnd=await ancestry('x',async id=>id==='x'?{uuid:'x',content:'**[任务]** X',parent:{id:'p'},page:{id:'p'}}:null);assert.equal(pageEnd.complete,true)});
test('held membership follows source relocation rather than retained presentation references',async()=>{const moved=await ancestry('note',async id=>id==='note'?{...blocks.note,parent:{id:'out'}}:blocks[id]);const d=clickDecision({root:'m',held:'breadcrumb',items:['note']},moved);assert.equal(d.uuid,'out')});

test('object prefixes do not require a space before the title',()=>{assert.equal(workObject('**[任务]**紧接标题').title,'紧接标题')});

test("canonical vNext task markers retain navigation labels",()=>{for(const marker of ["TODO","DONE","DOING","NOW","LATER"])assert.equal(workObject(marker+" **[任务]** 正式任务").title,"正式任务");});

test('legacy and marker-first affair roots use the canonical clean title while same-name nested roots keep UUID ancestry',async()=>{
  const title='核对 **重点** [资料](longdoc://stable-id)';
  for(const label of ['任务','事务'])for(const marker of ['TODO','DONE','DOING','NOW','LATER','CANCELED','CANCELLED']){
    assert.equal(workObject(`${marker} **[${label}]** ${title}`).title,title);
    assert.equal(workObject(`**[${label}]** ${marker} ${title}`).title,title);
  }
  const tree={outer:{uuid:'outer',content:'TODO **[事务]** 同名',parent:{id:'Project'},page:{id:'Project'}},inner:{uuid:'inner',content:'TODO **[任务]** 同名',parent:{id:'outer'},page:{id:'Project'}},note:{uuid:'note',content:'[目标] 保留条件',parent:{id:'inner'},page:{id:'Project'}}};
  const trace=await ancestry('note',async id=>tree[id]);
  assert.deepEqual(trace.objects.map(x=>[x.uuid,x.title]),[['outer','同名'],['inner','同名']]);
  assert.equal(clickDecision({},trace).uuid,'inner');
  assert.equal(workObject('TODO 普通内部待办'),null);
  assert.equal(workObject('> TODO **[事务]** 引用'),null);
});
