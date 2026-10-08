import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture} from '../fixtures/work-view.mjs';

test('fresh installation without a current Graph skips restoration without reading old source and later restores the real Graph',async()=>{
 const f=await fixture(null,3,{initialReadingMode:'report'});let restored;
 try{
  await f.work.open('root');const before=JSON.stringify([...f.blocks]);f.work.dispose();await delay(10);
  const real=globalThis.logseq.App.getCurrentGraph,WorkView=f.work.constructor;restored=new WorkView(()=>{},{initialReadingMode:'report'});
  for(const missing of [null,undefined]){
   globalThis.logseq.App.getCurrentGraph=async()=>missing;f.resetCounts();await restored.restoreReadingSession();
   assert.equal(restored.panel.visible,false);assert.equal(restored.snapshot().root,null);assert.equal(f.stats.tree,0);assert.equal(f.stats.retained,0);assert.equal(JSON.stringify([...f.blocks]),before);
  }
  globalThis.logseq.App.getCurrentGraph=async()=> 'malformed';await assert.rejects(restored.restoreReadingSession(),/LOGSEQ_GRAPH_SHAPE_UNSUPPORTED/u);assert.equal(restored.panel.visible,false);
  globalThis.logseq.App.getCurrentGraph=real;await restored.restoreReadingSession();assert.equal(restored.panel.visible,true);assert.equal(restored.reportAPI.read().scope.rootUuid,'root');assert.equal(JSON.stringify([...f.blocks]),before);
 }finally{restored?.dispose();await f.close();}
});

test('close/reopen and a new controller restore the same reading mode, UUID bookmark and explicit folds without routing native pages',async()=>{
 const f=await fixture(null,5,{initialReadingMode:'report'});let restored;
 try{
  const child={uuid:'nested',content:'保留缩进正文。',parent:{id:2},page:{id:'page'}};f.blocks.set(child.uuid,child);f.blocks.get('b0').children=[child];
  await f.work.open('root');assert.equal(f.work.reportAPI.read().status,'current');
  const content=f.work.panel.root.querySelector('.wb-scroll');content.scrollTop=145;
  f.work.panel.root.querySelector('.wb-row[data-uuid="b0"] > button:nth-of-type(2)').click();
  await f.work.panel.close();assert.equal(f.work.panel.visible,false);
  assert.equal(JSON.parse(f.browser.localStorage.getItem('workbench:reading-session:one:/one')).open,false);
  await f.work.open('root');assert.equal(f.work.panel.root.querySelector('[data-uuid="nested"]').hidden,true);assert.equal(content.scrollTop,145);
  const before=JSON.stringify([...f.blocks]);f.work.dispose();await delay(10);
  const WorkView=f.work.constructor;restored=new WorkView(()=>{}, {initialReadingMode:'report'});await restored.restoreReadingSession();
  assert.equal(restored.panel.visible,true);assert.equal(restored.reportAPI.read().scope.rootUuid,'root');assert.equal(restored.panel.root.querySelector('[data-uuid="nested"]').hidden,true);
  assert.equal(restored.panel.root.querySelector('.wb-scroll').scrollTop,145);assert.equal(JSON.stringify([...f.blocks]),before);
 }finally{restored?.dispose();await f.close();}
});

test('toolbar requires an explicit named continuation when the current native block has no work object',async()=>{
 const f=await fixture(null,4,{initialReadingMode:'report'});
 try{
  const child={uuid:'nested',content:'保留折叠现场。',parent:{id:2},page:{id:'page'}};f.blocks.set(child.uuid,child);f.blocks.get('b0').children=[child];
  await f.work.open('root');f.work.panel.root.querySelector('.wb-scroll').scrollTop=145;f.work.panel.root.querySelector('.wb-row[data-uuid="b0"] > button:nth-of-type(2)').click();await f.work.panel.close();f.setCurrent('b2');
  const ordinary={uuid:'outside',content:'普通日记正文',parent:{id:'page'},page:{id:'page'}};f.blocks.set('outside',ordinary);f.setCurrent('outside');
  await f.work.openToolbar();await f.tick();const buttons=[...f.work.panel.root.querySelectorAll('button')];const resume=buttons.find(b=>b.textContent==='继续阅读：来源');assert.ok(resume);assert.equal(f.work.snapshot().root,null);
  assert.match(f.work.panel.root.querySelector('.wb-scroll').textContent,/继续阅读：来源/);
  resume.click();for(let i=0;i<200&&f.work.snapshot().root!=='root';i++)await delay(5);assert.equal(f.work.snapshot().root,'root');
  for(let i=0;i<200&&!f.work.panel.root.querySelector('[data-uuid="nested"]')?.hidden;i++)await delay(5);
  assert.equal(f.work.panel.root.querySelector('[data-uuid="nested"]').hidden,true);assert.equal(f.work.panel.root.querySelector('.wb-scroll').scrollTop,145);
 }finally{await f.close();}
});

test('a restarted file Graph resolves the saved page name to its new real page UUID without adding a block root or routing native pages',async()=>{
 let reader;const provider={read:scope=>reader.read(scope,()=>true)};
 const f=await fixture(null,3,{initialReadingMode:'report',source:provider});let restored;
 try{
  let page={uuid:'page-old',name:'project / 重启页',originalName:'Project / 重启页'};
  globalThis.logseq.Editor.getPage=async()=>page;globalThis.logseq.Editor.getPageBlocksTree=async()=>[f.blocks.get('b0')];
  const {SourceReader}=await import('../../src/workspace/source-reader.ts');
  reader=new SourceReader({graphId:async()=> 'one:/one',getBlock:uuid=>globalThis.logseq.Editor.getBlock(uuid),getPage:()=>globalThis.logseq.Editor.getPage(),getPageBlocksTree:()=>globalThis.logseq.Editor.getPageBlocksTree()});
  await f.work.openPage(page.originalName);assert.equal(f.work.reportAPI.read().scope.rootUuid,'page-old');
  const before=JSON.stringify([...f.blocks]);f.work.dispose();await delay(10);page={...page,uuid:'page-new'};
  const WorkView=f.work.constructor;restored=new WorkView(()=>{},{initialReadingMode:'report',source:provider});await restored.restoreReadingSession();
  assert.equal(restored.panel.visible,true);assert.equal(restored.snapshot().root,null);assert.equal(restored.reportAPI.read().scope.rootUuid,'page-new');
  assert.deepEqual(restored.reportAPI.read().fragments.map(f=>f.target.blockUuid),['b0']);assert.equal(JSON.stringify([...f.blocks]),before);
 }finally{restored?.dispose();await f.close();}
});

test('host divider persists the completed drag without disturbing native input and is removed on close and dispose',async()=>{
 const f=await fixture(null,3,{initialReadingMode:'report'});
 try{
  Object.defineProperty(f.browser.document.documentElement,'clientWidth',{value:1400,configurable:true});
  const input=f.browser.document.createElement('textarea');input.value='原生草稿';f.browser.document.body.append(input);input.focus();input.setSelectionRange(1,3);
  await f.work.open('root');const divider=f.browser.document.querySelector('[data-workbench-divider=work]');assert.ok(divider);assert.equal(divider.parentElement,f.browser.document.body);
  const down=new f.browser.PointerEvent('pointerdown',{clientX:900,pointerId:1,cancelable:true});divider.dispatchEvent(down);assert.equal(down.defaultPrevented,true);
  divider.dispatchEvent(new f.browser.PointerEvent('pointermove',{clientX:840,pointerId:1}));divider.dispatchEvent(new f.browser.PointerEvent('pointerup',{clientX:840,pointerId:1}));
  assert.equal(f.browser.localStorage.getItem('workbench:panel-width'),'444');assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'原生草稿');assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,3);
  await f.work.panel.close();assert.equal(f.browser.document.querySelector('[data-workbench-divider=work]'),null);
  await f.work.open('root');assert.equal(f.browser.document.querySelectorAll('[data-workbench-divider=work]').length,1);f.work.dispose();await delay(10);assert.equal(f.browser.document.querySelector('[data-workbench-divider=work]'),null);
 }finally{await f.close();}
});
