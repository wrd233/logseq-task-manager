import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture,deferred} from '../fixtures/work-view.mjs';

const row=(f,uuid)=>f.browser.document.querySelector(`.wb-row[data-uuid="${uuid}"]`);
async function reportFixture(width=650,options={}) {
  const f=await fixture(null,9,options);
  f.root.content='**[MiniProject]** 整理一份调研材料 #MiniProject';
  const bodies=['[注] 保留本地文件。','同名条件不能丢失。','[目标] 可继续维护的说明。','[想法] 原生写作，报告阅读。','TODO 核对日期','[注] 格式未支持仍能查看。','无标记反例。','[风险] 未知标记。'];
  bodies.forEach((body,i)=>{f.blocks.get(`b${i}`).content=body;});
  Object.defineProperty(f.browser.document.documentElement,'clientWidth',{value:width,configurable:true});
  const header=f.browser.document.createElement('header');header.className='cp__header';f.browser.document.body.prepend(header);
  const main=f.browser.document.createElement('main');main.id='main-content-container';
  const block=f.browser.document.createElement('div');block.className='ls-block';
  const editor=f.browser.document.createElement('div');editor.className='block-editor';
  const textarea=f.browser.document.createElement('textarea');editor.append(textarea);block.append(editor);main.append(block);f.browser.document.body.prepend(main);
  f.nativeCalls=[];f.hidden=[];
  globalThis.logseq.hideMainUI=options=>f.hidden.push(options);
  globalThis.logseq.Editor.scrollToBlockInPage=(page,uuid)=>{f.nativeCalls.push(['locate',uuid,page]);};
  globalThis.logseq.App.pushState=async(_type,{name},{anchor})=>globalThis.logseq.Editor.scrollToBlockInPage(name,anchor.slice('block-content-'.length));
  globalThis.logseq.Editor.editBlock=async uuid=>{f.nativeCalls.push(['edit',uuid]);block.setAttribute('blockid',uuid);textarea.value=f.blocks.get(uuid).content;textarea.focus();f.editing(uuid,textarea.value);};
  await f.work.open('root');
  const button=[...f.work.panel.root.querySelectorAll('.wb-heading button')].find(b=>b.textContent==='报告');assert.ok(button);button.click();
  for(let i=0;i<60&&f.work.reportAPI.read().status!=='current';i++)await delay(5);
  assert.equal(f.work.reportAPI.read().mode,'report');assert.equal(f.work.reportAPI.read().status,'current');
  return f;
}
test('real report entrance retains complete bodies and node identity while headers cannot resolve as source drop targets',async()=>{
  const f=await reportFixture();
  try {
    const before=JSON.stringify([...f.blocks]), nodes=[...f.work.panel.root.querySelectorAll('.wb-row')];
    assert.deepEqual([...f.work.panel.root.querySelectorAll('.wb-report-section')].map(h=>h.textContent),['目标','记录与说明','想法','待办']);
    assert.equal(f.work.panel.root.querySelectorAll('.wb-row').length,9);
    assert.ok(row(f,'b1').textContent.includes('同名条件不能丢失。'));assert.ok(row(f,'b7').textContent.includes('[风险]'));
    for(const heading of f.work.panel.root.querySelectorAll('.wb-report-section')){
      assert.equal(heading.dataset.uuid,undefined);assert.equal((await f.work.resolveBodyDrop(heading,'after')).reason,'ambiguous-body-target');
    }
    const target=await f.work.resolveBodyDrop(row(f,'b0').querySelector('.wb-body'),'after');
    assert.equal(target.ok,true);assert.equal(target.value.target.blockUuid,'b0');assert.equal(target.value.parent.target.blockUuid,'root');
    await f.work.reportAPI.setMode('structure');await f.work.reportAPI.setMode('report');
    assert.deepEqual(new Set(f.work.panel.root.querySelectorAll('.wb-row')),new Set(nodes));assert.equal(JSON.stringify([...f.blocks]),before);
    const read=f.work.reportAPI.read();read.fragments[0].target.blockUuid='forged';assert.equal(f.work.reportAPI.read().fragments[0].target.blockUuid,'root');
  }finally{await f.close();}
});
test('narrow window yields the panel, really invokes native editing and restores current report after host commit',async()=>{
  const f=await reportFixture();
  try {
    const node=row(f,'b3'),scroll=node.parentElement;scroll.scrollTop=125;
    const menu=node.querySelector('details');menu.open=true;
    [...menu.querySelectorAll('button')].find(b=>b.textContent==='编辑原文').click();
    assert.equal(menu.open,false);
    for(let i=0;i<60&&!f.nativeCalls.some(c=>c[0]==='edit');i++)await delay(5);
    assert.deepEqual(f.nativeCalls,[['locate','b3','fixture'],['edit','b3']]);assert.equal(f.work.panel.visible,false);
    assert.deepEqual(f.hidden.at(-1),{restoreEditingCursor:false});
    assert.ok(f.browser.document.querySelector('[data-native-report-return]'));
    assert.equal((await f.work.reportAPI.resume()).reason,'editing-in-progress');assert.equal(f.work.panel.visible,false);
    f.content('b3','[想法] 原生写作，报告阅读。\n原生提交的新句。');f.editing(false);
    f.browser.document.querySelector('[data-native-report-return]').click();
    for(let i=0;i<60&&f.work.reportAPI.read().native;i++)await delay(5);
    assert.equal(f.work.panel.visible,true);assert.equal(f.work.reportAPI.read().native,null);
    assert.ok(row(f,'b3').querySelector('.wb-body').textContent.includes('原生提交的新句。'));
    assert.equal(row(f,'b3'),node);assert.equal(scroll.scrollTop,125);assert.equal(f.work.snapshot().root,'root');
  }finally{await f.close();}
});
test('navigation acknowledgement precedes the native route render; success requires the actual target input to survive',async()=>{
  const f=await reportFixture();
  try {
    const input=f.browser.document.querySelector('textarea');
    globalThis.logseq.App.pushState=async(_type,{name},{anchor})=>{
      f.nativeCalls.push(['locate',anchor.slice('block-content-'.length),name]);
      await delay(15);input.closest('.ls-block').setAttribute('blockid','route-render');f.editing(false);
    };
    globalThis.logseq.Editor.scrollToBlockInPage=(name,uuid)=>{void globalThis.logseq.App.pushState('page',{name},{anchor:'block-content-'+uuid});};
    row(f,'b0').dispatchEvent(new f.browser.Event('dblclick',{bubbles:true}));
    for(let i=0;i<60&&!f.nativeCalls.some(c=>c[0]==='edit');i++)await delay(5);
    await delay(35);
    assert.equal(await globalThis.logseq.Editor.checkEditing(),'b0');assert.equal(input.closest('.ls-block').getAttribute('blockid'),'b0');
    assert.equal(f.browser.document.activeElement,input);assert.equal(f.work.panel.visible,false);
    f.editing(false);
  }finally{await f.close();}
});
test('wide docked window retains the report and native input, while report reflects only committed source',async()=>{
  const f=await reportFixture(1400);
  try {
    row(f,'b0').dispatchEvent(new f.browser.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    for(let i=0;i<60&&!f.nativeCalls.some(c=>c[0]==='edit');i++)await delay(5);
    assert.equal(f.work.panel.visible,true);assert.equal(f.work.reportAPI.read().native.mode,'beside');
    f.editing('b0','[注] 尚未提交的原生草稿');await f.tick();
    assert.ok(!row(f,'b0').querySelector('.wb-body').textContent.includes('尚未提交'));
    assert.match(f.work.panel.root.querySelector('.wb-status').textContent,/原生输入中/);
    const fragment=f.work.reportAPI.read().fragments.find(f=>f.target.blockUuid==='b0');
    assert.equal(fragment.contentVersion,(await f.work.lensesAPI.source()).value.blocks.find(b=>b.target.blockUuid==='b0').contentVersion);
    f.editing(false);assert.equal((await f.work.reportAPI.resume()).ok,true);
  }finally{await f.close();}
});
test('returning to the same native editor preserves its draft, input node and exact selection instead of reloading source',async()=>{
  const f=await reportFixture(1400);
  try {
    row(f,'b0').dispatchEvent(new f.browser.Event('dblclick',{bubbles:true}));
    for(let i=0;i<60&&!f.nativeCalls.some(c=>c[0]==='edit');i++)await delay(5);
    const input=f.browser.document.querySelector('textarea');input.value='保留未提交的原生草稿';input.setSelectionRange(3,5);f.editing('b0',input.value);await f.tick();
    const before=[...f.nativeCalls],fragment=f.work.reportAPI.read().fragments.find(f=>f.target.blockUuid==='b0'),source=f.work.reportAPI.read();
    const result=await f.work.reportAPI.openNative({schemaVersion:1,scope:source.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:source.structureVersion,position:{kind:'block'}});
    assert.equal(result.ok,true);assert.deepEqual(f.nativeCalls,before);assert.equal(f.browser.document.querySelector('textarea'),input);
    assert.equal(input.value,'保留未提交的原生草稿');assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,5);assert.equal(f.browser.document.activeElement,input);
    assert.doesNotMatch(row(f,'b0').querySelector('.wb-body').textContent,/未提交/);
    f.editing(false);
  }finally{await f.close();}
});
test('resizing beside native composition to a narrow window yields the report without saving or cancelling input',async()=>{
  const f=await reportFixture(1400);
  try {
    row(f,'b0').dispatchEvent(new f.browser.Event('dblclick',{bubbles:true}));
    for(let i=0;i<60&&!f.nativeCalls.some(c=>c[0]==='edit');i++)await delay(5);
    const input=f.browser.document.querySelector('textarea');input.value='正在组合的原生草稿';f.editing('b0',input.value);
    input.dispatchEvent(new f.browser.Event('compositionstart',{bubbles:true}));
    Object.defineProperty(f.browser.document.documentElement,'clientWidth',{value:650,configurable:true});
    f.browser.dispatchEvent(new f.browser.Event('resize'));await delay(15);
    assert.equal(f.work.panel.visible,false);assert.equal(f.hidden.at(-1).restoreEditingCursor,false);
    assert.equal(f.work.reportAPI.read().native.mode,'switch');assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'正在组合的原生草稿');
    assert.equal((await f.work.reportAPI.resume()).reason,'editing-in-progress');
    input.dispatchEvent(new f.browser.Event('compositionend',{bubbles:true}));f.editing(false);
    assert.equal((await f.work.reportAPI.resume()).ok,true);
  }finally{await f.close();}
});
test('report folds, focus and explicit original layout survive reading toggles without source or layout writes',async()=>{
  const f=await reportFixture();
  try {
    await f.work.reportAPI.setMode('structure');
    const s=f.work.snapshot();f.work.apply({graph:s.graph,root:s.root,expectedSeq:s.seq,type:'reorder',uuid:'b3',target:'b2',mode:'child'});
    const personal=JSON.stringify(f.work.snapshot().view),before=JSON.stringify([...f.blocks]);
    await f.work.reportAPI.setMode('report');await f.work.lensesAPI.select('b3');
    assert.equal(f.work.lensesAPI.read().phase,'focused');
    f.work.lensesAPI.exit();await f.work.reportAPI.setMode('structure');
    assert.equal(JSON.stringify(f.work.snapshot().view),personal);assert.equal(JSON.stringify([...f.blocks]),before);
  }finally{await f.close();}
});
test('stale mapping, real host composition and existing native drafts refuse navigation before focus or visibility changes',async()=>{
  const f=await reportFixture();
  try {
    const old=f.work.reportAPI.read(),fragment=old.fragments.find(f=>f.target.blockUuid==='b0');
    f.content('b0','[注] 外部已提交新版本。');await delay(80);
    const input={schemaVersion:1,scope:old.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:old.structureVersion,position:{kind:'block'}};
    assert.equal((await f.work.reportAPI.openNative(input)).reason,'stale-content');assert.equal(f.nativeCalls.length,0);assert.equal(f.work.panel.visible,true);
    const textarea=f.browser.document.querySelector('textarea');textarea.dispatchEvent(new f.browser.Event('compositionstart',{bubbles:true}));
    assert.equal((await f.work.reportAPI.setMode('structure')).reason,'editing-in-progress');
    const bodyTarget=await f.work.resolveBodyDrop(row(f,'b0').querySelector('.wb-body'),'after');assert.equal(bodyTarget.reason,'editing-in-progress');
    textarea.dispatchEvent(new f.browser.Event('compositionend',{bubbles:true}));
    f.editing('b1','保留未提交草稿');row(f,'b0').dispatchEvent(new f.browser.Event('dblclick',{bubbles:true}));await delay(35);
    assert.equal(f.nativeCalls.length,0);assert.equal(f.work.panel.visible,true);f.editing(false);
  }finally{await f.close();}
});
test('switching away while native navigation is pending preserves reading but cancels the old edit',async()=>{
  const f=await reportFixture();
  try {
    const page=deferred(),started=deferred();globalThis.logseq.Editor.getPage=async()=>{started.resolve();return page.promise;};
    const read=f.work.reportAPI.read(),fragment=read.fragments.find(x=>x.target.blockUuid==='b0');
    const navigation=f.work.reportAPI.openNative({schemaVersion:1,scope:read.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:read.structureVersion,position:{kind:'block'}});
    await started.promise;await f.work.panel.close(true,'switch');page.resolve({id:'page',name:'fixture'});
    assert.equal((await navigation).ok,false);assert.deepEqual(f.nativeCalls,[]);assert.equal(f.work.panel.visible,false);
    assert.equal(f.work.reportAPI.read().mode,'report');assert.equal(f.work.reportAPI.read().native,null);
    assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
  }finally{await f.close();}
});
test('Graph/root changes and dispose invalidate delayed source navigation and remove the owned return affordance',async()=>{
  const f=await reportFixture();
  try {
    const page=deferred(),started=deferred();globalThis.logseq.Editor.getPage=async()=>{started.resolve();return page.promise;};
    row(f,'b0').dispatchEvent(new f.browser.Event('dblclick',{bubbles:true}));await started.promise;
    f.switchGraph('two');page.resolve({name:'fixture'});await delay(30);
    assert.equal(f.nativeCalls.length,0);assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
    assert.equal(f.work.reportAPI.read().scope,null);assert.equal((await f.work.reportAPI.resume()).reason,'scope-mismatch');
    f.work.dispose();assert.equal((await f.work.reportAPI.setMode('report')).reason,'view-not-visible');
  }finally{await f.close();}
});

test('committed source updates defer grouping and mapping during host composition, then refresh without replacing unchanged bodies',async()=>{
  const f=await reportFixture(1400);
  try {
    const textarea=f.browser.document.querySelector('textarea'),node=row(f,'b0'),unchanged=row(f,'b3').querySelector('.wb-body').firstChild;
    const order=[...node.parentElement.children],before=f.work.reportAPI.read();
    textarea.dispatchEvent(new f.browser.Event('compositionstart',{bubbles:true}));
    f.content('b0','[目标] 提交的新记录在组合输入结束后重组。');await f.tick();
    assert.deepEqual([...node.parentElement.children],order);assert.match(node.querySelector('.wb-body').textContent,/保留本地文件/);
    assert.equal(f.work.reportAPI.read().fragments.find(f=>f.target.blockUuid==='b0').contentVersion,before.fragments.find(f=>f.target.blockUuid==='b0').contentVersion);
    assert.equal(f.work.reportAPI.read().status,'stale');assert.equal((await f.work.reportAPI.refresh()).reason,'editing-in-progress');
    textarea.dispatchEvent(new f.browser.Event('compositionend',{bubbles:true}));
    for(let i=0;i<60&&f.work.reportAPI.read().status!=='current';i++)await delay(5);
    assert.match(node.querySelector('.wb-body').textContent,/提交的新记录/);assert.equal(row(f,'b3').querySelector('.wb-body').firstChild,unchanged);
    assert.notEqual(f.work.reportAPI.read().fragments.find(f=>f.target.blockUuid==='b0').contentVersion,before.fragments.find(f=>f.target.blockUuid==='b0').contentVersion);
  }finally{await f.close();}
});

test('source changes arriving during a slow provider read are queued; a superseded snapshot cannot strand the report',async()=>{
  const {SourceReader}=await import('../../src/workspace/source-reader.ts');
  const {graphIdentity}=await import('../../src/graph-adapter.ts');
  let gate=null,started=null;
  const provider={read:async scope=>{
    const value=await new SourceReader({getBlock:(uuid,options)=>globalThis.logseq.Editor.getBlock(uuid,options),graphId:async()=>graphIdentity(await globalThis.logseq.App.getCurrentGraph())}).read(scope,()=>true);
    if(gate){const pending=gate;gate=null;started.resolve();await pending.promise;}return value;
  }};
  const f=await reportFixture(1400,{source:provider});
  try {
    const old=row(f,'b0');gate=deferred();started=deferred();const pending=gate;
    const reading=f.work.reportAPI.refresh();await started.promise;
    f.content('b0','[目标] 排队的新版本。');f.content('b1','未标记的最新条件。');await f.work.refresh();
    pending.resolve();assert.equal((await reading).reason,'source-changed-during-read');
    for(let i=0;i<60&&f.work.reportAPI.read().status!=='current';i++)await delay(5);
    assert.equal(f.work.reportAPI.read().status,'current');assert.equal(row(f,'b0'),old);
    assert.match(old.querySelector('.wb-body').textContent,/排队的新版本/);assert.match(row(f,'b1').querySelector('.wb-body').textContent,/最新条件/);
  }finally{await f.close();}
});

test('source loss labels the retained report as unavailable and rejects navigation; recovery refreshes current facts',async()=>{
  const f=await reportFixture();
  try {
    const node=row(f,'b0'),body=node.querySelector('.wb-body').textContent;
    f.setTreeRead(async()=>null);assert.equal((await f.work.reportAPI.refresh()).reason,'source-unavailable');
    assert.equal(f.work.reportAPI.read().status,'unavailable');assert.match(f.work.panel.root.querySelector('.wb-status').textContent,/最后已知内容/);
    assert.equal(node.querySelector('.wb-body').textContent,body);
    node.dispatchEvent(new f.browser.Event('dblclick',{bubbles:true}));await delay(30);assert.equal(f.nativeCalls.length,0);
    f.setTreeRead(null);assert.equal((await f.work.reportAPI.refresh()).ok,true);assert.equal(f.work.reportAPI.read().status,'current');assert.equal(row(f,'b0'),node);
  }finally{await f.close();}
});

test('a commit racing after source resolution cancels native navigation before yielding the panel',async()=>{
  const f=await reportFixture();
  try {
    const page=deferred(),started=deferred();globalThis.logseq.Editor.getPage=async()=>{started.resolve();return page.promise;};
    row(f,'b0').dispatchEvent(new f.browser.Event('dblclick',{bubbles:true}));await started.promise;
    f.content('b1','导航等待期间已提交的新条件。');await f.work.refresh();page.resolve({name:'fixture'});await delay(35);
    assert.equal(f.nativeCalls.length,0);assert.equal(f.work.panel.visible,true);assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
  }finally{await f.close();}
});
