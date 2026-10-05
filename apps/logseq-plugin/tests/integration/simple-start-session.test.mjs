import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture} from '../fixtures/work-view.mjs';

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
  await f.work.open('root');await f.work.panel.close();f.setCurrent('b2');
  const ordinary={uuid:'outside',content:'普通日记正文',parent:{id:'page'},page:{id:'page'}};f.blocks.set('outside',ordinary);f.setCurrent('outside');
  await f.work.openToolbar();const buttons=[...f.work.panel.root.querySelectorAll('button')];const resume=buttons.find(b=>b.textContent==='继续阅读：来源');assert.ok(resume);
  assert.match(f.work.panel.root.querySelector('.wb-scroll').textContent,/继续阅读：来源/);
  resume.click();await delay(80);assert.equal(f.work.snapshot().root,'root');
 }finally{await f.close();}
});
