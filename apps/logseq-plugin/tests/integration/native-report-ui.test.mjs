import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {setTimeout as schedule} from 'node:timers';
import {fixture,deferred} from '../fixtures/work-view.mjs';

const row=(f,uuid)=>f.browser.document.querySelector(`.wb-row[data-uuid="${uuid}"]`);
const edit=(f,uuid)=>[...row(f,uuid).querySelectorAll('button')].find(button=>button.textContent==='编辑原文').click();
async function nativeReady(f,uuid) {
  for(let i=0;i<400;i++){
    const input=f.browser.document.querySelector('textarea');
    if(input?.closest('.ls-block')?.getAttribute('blockid')===uuid&&f.browser.document.activeElement===input)return;
    await delay(10);
  }
  assert.fail('native editor must finish opening before draft assertions');
}
async function reportFixture(width=650,options={}) {
  const f=await fixture(null,9,{initialReadingMode:"report",...options});
  f.root.content='**[MiniProject]** 整理一份调研材料 #MiniProject';
  const bodies=['[注] 保留本地文件。','同名条件不能丢失。','[目标] 可继续维护的说明。','[想法] 原生写作，报告阅读。','TODO 核对日期','[注] 格式未支持仍能查看。','无标记反例。','[风险] 未知标记。'];
  bodies.forEach((body,i)=>{f.blocks.get(`b${i}`).content=body;});
  Object.defineProperty(f.browser.document.documentElement,'clientWidth',{value:width,configurable:true});
  const header=f.browser.document.createElement('header');header.className='cp__header';f.browser.document.body.prepend(header);
  const main=f.browser.document.createElement('main');main.id='main-content-container';
  const block=f.browser.document.createElement('div');block.className='ls-block';
  const editor=f.browser.document.createElement('div');editor.className='block-editor';
  const textarea=f.browser.document.createElement('textarea');editor.append(textarea);block.append(editor);main.append(block);f.browser.document.body.prepend(main);
  f.nativeCalls=[];f.hidden=[];f.mainStyles=[];
  globalThis.logseq.setMainUIInlineStyle=style=>f.mainStyles.push(style);
  globalThis.logseq.hideMainUI=options=>{f.hidden.push(options);f.browser.document.activeElement.blur();};
  globalThis.logseq.Editor.scrollToBlockInPage=(page,uuid)=>{f.nativeCalls.push(['locate',uuid,page]);};
  globalThis.logseq.App.pushState=async(_type,{name},{anchor})=>{ const uuid=anchor.slice('block-content-'.length);globalThis.logseq.Editor.scrollToBlockInPage(name,uuid);block.setAttribute('blockid',uuid); };
  globalThis.logseq.Editor.editBlock=async uuid=>{f.nativeCalls.push(['edit',uuid]);block.setAttribute('blockid',uuid);textarea.value=f.blocks.get(uuid).content;textarea.focus();f.editing(uuid,textarea.value);};
  await f.work.open('root');
  assert.equal(f.work.panel.root.querySelector('[data-work-content=body]').textContent,'正文');
  for(let i=0;i<60&&f.work.reportAPI.read().status!=='current';i++)await delay(5);
  assert.equal(f.work.reportAPI.read().mode,'report');assert.equal(f.work.reportAPI.read().status,'current');
  return f;
}
test('real report entrance retains complete bodies and node identity while headers cannot resolve as source drop targets',async()=>{
  const f=await reportFixture();
  try {
    const before=JSON.stringify([...f.blocks]), nodes=[...f.work.panel.root.querySelectorAll('.wb-row')];
    assert.deepEqual([...f.work.panel.root.querySelectorAll('.wb-report-section')].map(h=>h.textContent),['思考','待办']);
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
    const input=f.browser.document.querySelector('textarea');input.value='保留原生草稿';input.setSelectionRange(2,4);
    assert.equal((await f.work.reportAPI.resume()).ok,true);assert.equal(f.browser.document.querySelector('textarea'),input);assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'保留原生草稿');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,4);assert.equal(f.work.panel.visible,true);
    assert.notEqual(f.browser.getComputedStyle(input).visibility,'hidden');
    f.content('b3','[想法] 原生写作，报告阅读。\n原生提交的新句。');f.editing(false);
    await f.tick();
    for(let i=0;i<60&&f.work.reportAPI.read().status!=='current';i++)await delay(5);
    assert.equal(f.work.panel.visible,true);assert.equal(f.work.reportAPI.read().native,null);
    assert.equal(f.work.panel.root.querySelector('.wb-work-shell .wb-primary').textContent,'在 Logseq 写作');
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
      await delay(15);input.closest('.ls-block').setAttribute('blockid',anchor.slice('block-content-'.length));f.editing(false);
    };
    globalThis.logseq.Editor.scrollToBlockInPage=(name,uuid)=>{void globalThis.logseq.App.pushState('page',{name},{anchor:'block-content-'+uuid});};
    edit(f,'b0');
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
    edit(f,'b0');
    for(let i=0;i<60&&!f.nativeCalls.some(c=>c[0]==='edit');i++)await delay(5);
    assert.equal(f.work.panel.visible,true);assert.equal(f.work.reportAPI.read().native.mode,'beside');
    f.editing('b0','[注] 尚未提交的原生草稿');await f.tick();
    assert.ok(!row(f,'b0').querySelector('.wb-body').textContent.includes('尚未提交'));
    assert.match(f.work.panel.root.querySelector('.wb-work-notice').textContent,/原生输入尚未结束/);
    const fragment=f.work.reportAPI.read().fragments.find(f=>f.target.blockUuid==='b0');
    assert.equal(fragment.contentVersion,(await f.work.lensesAPI.source()).value.blocks.find(b=>b.target.blockUuid==='b0').contentVersion);
    f.editing(false);assert.equal((await f.work.reportAPI.resume()).ok,true);
  }finally{await f.close();}
});
test('returning to the same native editor preserves its draft, input node and exact selection instead of reloading source',async()=>{
  const f=await reportFixture(1400);
  try {
    edit(f,'b0');
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
    edit(f,'b0');
    for(let i=0;i<60&&!f.nativeCalls.some(c=>c[0]==='edit');i++)await delay(5);
    const input=f.browser.document.querySelector('textarea');input.value='正在组合的原生草稿';f.editing('b0',input.value);
    input.dispatchEvent(new f.browser.Event('compositionstart',{bubbles:true}));
    Object.defineProperty(f.browser.document.documentElement,'clientWidth',{value:650,configurable:true});
    f.browser.dispatchEvent(new f.browser.Event('resize'));await delay(15);
    assert.equal(f.work.panel.visible,false);assert.equal(f.hidden.length,0);assert.equal(f.mainStyles.at(-1).display,'none');
    assert.equal(f.work.reportAPI.read().native.mode,'switch');assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'正在组合的原生草稿');
    assert.equal((await f.work.reportAPI.resume()).ok,true);assert.equal(f.browser.document.querySelector('textarea'),input);assert.equal(f.browser.document.activeElement,input);
    assert.notEqual(f.browser.getComputedStyle(input).visibility,'hidden');
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
    f.editing('b1','保留未提交草稿');edit(f,'b0');await delay(35);
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
    edit(f,'b0');await started.promise;
    f.switchGraph('two');page.resolve({name:'fixture'});await delay(30);
    assert.equal(f.nativeCalls.length,0);assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
    assert.equal(f.work.reportAPI.read().scope,null);assert.equal((await f.work.reportAPI.resume()).reason,'scope-mismatch');
    f.work.dispose();assert.equal((await f.work.reportAPI.setMode('report')).reason,'view-not-visible');
  }finally{await f.close();}
});

test('committed source refreshes during native composition without replacing native input or unchanged report bodies',async()=>{
  const f=await reportFixture(1400);
  try {
    const textarea=f.browser.document.querySelector('textarea'),node=row(f,'b0'),unchanged=row(f,'b3').querySelector('.wb-body').firstChild;
    const order=[...node.parentElement.children],before=f.work.reportAPI.read();
    textarea.dispatchEvent(new f.browser.Event('compositionstart',{bubbles:true}));
    f.content('b0','[目标] 提交的新记录在组合输入结束后重组。');await f.tick();
    for(let i=0;i<200&&f.work.reportAPI.read().fragments.find(f=>f.target.blockUuid==='b0').contentVersion===before.fragments.find(f=>f.target.blockUuid==='b0').contentVersion;i++)await delay(5);
    assert.deepEqual([...node.parentElement.children],order);assert.match(node.querySelector('.wb-body').textContent,/提交的新记录/);
    assert.equal(f.browser.document.querySelector('textarea'),textarea);
    assert.notEqual(f.work.reportAPI.read().fragments.find(f=>f.target.blockUuid==='b0').contentVersion,before.fragments.find(f=>f.target.blockUuid==='b0').contentVersion);
    assert.equal(f.work.reportAPI.read().status,'current');assert.equal((await f.work.reportAPI.refresh()).ok,true);
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
    node.dispatchEvent(new f.browser.MouseEvent('dblclick',{bubbles:true,altKey:true}));await delay(30);assert.equal(f.nativeCalls.length,0);
    f.setTreeRead(null);assert.equal((await f.work.reportAPI.refresh()).ok,true);assert.equal(f.work.reportAPI.read().status,'current');assert.equal(row(f,'b0'),node);
  }finally{await f.close();}
});

test('a commit racing after source resolution cancels native navigation before yielding the panel',async()=>{
  const f=await reportFixture();
  try {
    const page=deferred(),started=deferred();globalThis.logseq.Editor.getPage=async()=>{started.resolve();return page.promise;};
    edit(f,'b0');await started.promise;
    f.content('b1','导航等待期间已提交的新条件。');await f.work.refresh();page.resolve({name:'fixture'});await delay(35);
    assert.equal(f.nativeCalls.length,0);assert.equal(f.work.panel.visible,true);assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
  }finally{await f.close();}
});

test('production default opens complete reading without inheriting old structure folds or truncation',async()=>{
  const f=await fixture(null,97,{readingMode:undefined});
  try {
    f.browser.localStorage.setItem('workbench:scope:'+JSON.stringify(['one:/one','root']),JSON.stringify({items:[{uuid:'root',depth:0}],collapsed:['root'],overrides:{b0:'compact'}}));
    await f.work.open('root');
    assert.equal(f.work.reportAPI.read().mode,'report');
    assert.equal(f.work.reportAPI.read().fragments.length,97);
    assert.equal([...f.work.panel.root.querySelectorAll('.wb-row')].filter(node=>!node.hidden).length,97);
    assert.equal(row(f,'b0').querySelector('.wb-body').classList.contains('expanded'),true);
    const before=JSON.stringify([...f.blocks]);
    row(f,'root').querySelector('button[aria-label="折叠子项"]').click();
    await f.work.reportAPI.setMode('structure');await f.work.reportAPI.setMode('report');
    assert.equal(row(f,'b0').hidden,true);assert.equal(JSON.stringify([...f.blocks]),before);
  } finally {await f.close();}
});

test('text selection and raw comparison never request native routing; comparison uses the captured source version',async()=>{
  const f=await reportFixture(1400);
  try {
    const node=row(f,'b0'), body=node.querySelector('.wb-body'), before=JSON.stringify([...f.blocks]);
    body.dispatchEvent(new f.browser.MouseEvent('dblclick',{bubbles:true}));
    [...node.querySelectorAll('button')].find(button=>button.textContent==='对照原文').click();
    const raw=node.querySelector('pre[aria-label="原文对照"]');assert.equal(raw.textContent,f.blocks.get('b0').content);
    const read=f.work.reportAPI.read(), fragment=read.fragments.find(f=>f.target.blockUuid==='b0');
    const request={schemaVersion:1,scope:read.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:read.structureVersion,position:{kind:'block'}};
    const compared=f.work.reportAPI.compare(request);assert.equal(compared.ok,true);assert.equal(compared.value.content,raw.textContent);
    assert.equal(raw.dataset.contentVersion,fragment.contentVersion);assert.deepEqual(f.nativeCalls,[]);
    assert.equal(JSON.stringify([...f.blocks]),before);
    f.editing('b1','另一块正在输入');f.content('b0','外部已经提交的新句。');await f.work.refresh();
    assert.equal(f.work.reportAPI.compare(request).reason,'stale-content');assert.equal(raw.textContent,'外部已经提交的新句。');assert.equal(compared.value.content,'[注] 保留本地文件。');
    const current=f.work.reportAPI.read(),latest=current.fragments.find(f=>f.target.blockUuid==='b0');
    const refreshed=f.work.reportAPI.compare({...request,contentVersion:latest.contentVersion,structureVersion:current.structureVersion});
    assert.equal(refreshed.ok,true);assert.equal(refreshed.value.status,'current');assert.equal(refreshed.value.content,'外部已经提交的新句。');
    assert.equal((await f.work.reportAPI.openNative(request)).reason,'editing-in-progress');
    f.editing(false);await f.tick();
  } finally {await f.close();}
});

test('the visible continue-writing action reuses the live input and exact selection without refreshing the report',async()=>{
  const f=await reportFixture(1400);
  try {
    edit(f,'b0');await nativeReady(f,'b0');
    const input=f.browser.document.querySelector('textarea');input.value='当前原生草稿继续写';input.setSelectionRange(2,5);f.editing('b0',input.value);await f.tick();
    const calls=[...f.nativeCalls],version=f.work.reportAPI.read().sourceSetVersion;
    const menu=row(f,'b0').querySelector('summary'),compare=[...row(f,'b0').querySelectorAll('button')].find(node=>node.textContent==='对照原文');
    for(const control of [menu,compare]){
      const pointer=new f.browser.PointerEvent('pointerdown',{bubbles:true,cancelable:true});control.dispatchEvent(pointer);assert.equal(pointer.defaultPrevented,true);
    }
    compare.click();assert.equal(row(f,'b0').querySelector('[aria-label="原文对照"]').textContent,f.blocks.get('b0').content);
    assert.equal(f.browser.document.activeElement,input);assert.deepEqual([input.selectionStart,input.selectionEnd],[2,5]);assert.deepEqual(f.nativeCalls,calls);
    const button=f.work.panel.root.querySelector('.wb-work-shell .wb-primary');assert.equal(button.textContent,'继续原生输入');
    const pointer=new f.browser.PointerEvent('pointerdown',{bubbles:true,cancelable:true});button.dispatchEvent(pointer);assert.equal(pointer.defaultPrevented,true);
    button.click();await delay(60);
    assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'当前原生草稿继续写');assert.deepEqual([input.selectionStart,input.selectionEnd],[2,5]);
    assert.deepEqual(f.nativeCalls,calls);assert.equal(f.work.reportAPI.read().sourceSetVersion,version);
    assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
    f.editing(false);
  } finally {await f.close();}
});

test('the work-menu native-page action preserves live input while yielding a narrow layout',async()=>{
  const f=await reportFixture(1400);
  try {
    edit(f,'b0');await nativeReady(f,'b0');
    const input=f.browser.document.querySelector('textarea');input.value='菜单返回原生页时保留草稿';input.setSelectionRange(2,6);f.editing('b0',input.value);await f.tick();
    const calls=[...f.nativeCalls],version=f.work.reportAPI.read().sourceSetVersion;
    const menu=f.work.panel.root.querySelector('.wb-work-shell .wb-menu'),trigger=menu.querySelector('summary');
    menu.open=true;
    const action=[...menu.querySelectorAll('button')].find(node=>node.dataset.actionLabel==='显示原生页面');assert.ok(action);assert.equal(action.disabled,false);
    for(const control of [trigger,action]){
      const pointer=new f.browser.PointerEvent('pointerdown',{bubbles:true,cancelable:true});control.dispatchEvent(pointer);assert.equal(pointer.defaultPrevented,true);
    }
    Object.defineProperty(f.browser.document.documentElement,'clientWidth',{value:650,configurable:true});
    action.focus();assert.notEqual(f.browser.document.activeElement,input);
    action.click();await delay(60);
    assert.equal(menu.open,false);assert.equal(f.work.panel.visible,false);assert.equal(f.browser.document.activeElement,input);
    assert.equal(input.value,'菜单返回原生页时保留草稿');assert.deepEqual([input.selectionStart,input.selectionEnd],[2,6]);
    assert.deepEqual(f.nativeCalls,calls);assert.equal(f.work.reportAPI.read().sourceSetVersion,version);assert.equal(f.work.snapshot().root,'root');
    assert.equal(f.browser.document.querySelectorAll('[data-native-report-return]').length,1);assert.equal(f.hidden.length,0);
    f.editing(false);
  } finally {await f.close();}
});

test('ordinary native input retains its draft while saved report updates only changed bodies',async()=>{
  const f=await reportFixture(1400);
  try {
    edit(f,'b0');
    await nativeReady(f,'b0');
    const input=f.browser.document.querySelector('textarea'), unchanged=row(f,'b3').querySelector('.wb-body').firstChild;
    f.editing('b0','未提交的原生草稿');input.value='未提交的原生草稿';input.setSelectionRange(1,3);
    f.content('b1','外部提交的新条件。');await f.work.refresh();
    assert.match(row(f,'b1').textContent,/外部提交/);assert.equal(f.work.reportAPI.read().status,'current');
    assert.equal((await f.work.reportAPI.refresh()).ok,true);assert.equal(input.value,'未提交的原生草稿');
    assert.equal(f.browser.document.querySelector('textarea'),input);assert.equal(f.browser.document.activeElement,input);assert.deepEqual([input.selectionStart,input.selectionEnd],[1,3]);
    assert.doesNotMatch(row(f,'b0').querySelector('.wb-body').textContent,/未提交的原生草稿/);assert.equal(row(f,'b3').querySelector('.wb-body').firstChild,unchanged);
    f.editing(false);await f.tick();
    await delay(30);assert.match(row(f,'b1').textContent,/外部提交/);assert.equal(row(f,'b3').querySelector('.wb-body').firstChild,unchanged);
    assert.equal(f.work.reportAPI.read().status,'current');
  } finally {await f.close();}
});

test('opening a host sidebar without a window resize yields native input and adds exactly one keyboard return control',async()=>{
  const f=await reportFixture(1400);
  try {
    edit(f,'b0');await nativeReady(f,'b0');
    const input=f.browser.document.querySelector('textarea');input.value='保留侧栏变化时的草稿';f.editing('b0',input.value);input.setSelectionRange(3,6);
    // Installed Desktop blurs the current input on hideMainUI, independent of
    // restoreEditingCursor. The native yield path must avoid that call.
    globalThis.logseq.hideMainUI=options=>{f.hidden.push(options);f.browser.document.activeElement.blur();};
    const right=f.browser.document.createElement('aside');right.className='cp__right-sidebar';right.getBoundingClientRect=()=>({width:730});f.browser.document.body.append(right);await delay(40);
    assert.equal(f.work.panel.visible,false);assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'保留侧栏变化时的草稿');
    assert.deepEqual([input.selectionStart,input.selectionEnd],[3,6]);assert.equal(f.hidden.length,0);assert.equal(f.mainStyles.at(-1).display,'none');
    const controls=f.browser.document.querySelectorAll('[data-native-report-return]');assert.equal(controls.length,1);assert.equal(controls[0].type,'button');
    assert.equal((await f.work.reportAPI.resume()).ok,true);assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
    assert.equal(f.browser.document.querySelector('textarea'),input);assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'保留侧栏变化时的草稿');assert.deepEqual([input.selectionStart,input.selectionEnd],[3,6]);
    f.editing(false);
    assert.ok(f.mainStyles.some(style=>style.display===''));
    await f.work.panel.close();assert.equal(f.browser.document.querySelector('[data-workbench-host-layout]'),null);
  } finally {await f.close();}
});

test('reading mode and explicit folds follow Graph/root identity across material switches and different works',async()=>{
  const f=await reportFixture(1400);
  try {
    const node=row(f,'b0'),scroll=node.parentElement;scroll.scrollTop=275;
    row(f,'root').querySelector('button[aria-label="折叠子项"]').click();
    await f.work.panel.close(true,'switch');await f.work.open('root');assert.equal(row(f,'b0').hidden,true);
    row(f,'root').querySelector('button[aria-label="展开子项"]').click();scroll.scrollTop=275;
    await f.work.open('b3');assert.equal(f.work.snapshot().root,'b3');assert.equal(row(f,'b3').hidden,false);
    await f.work.open('root');assert.equal(f.work.reportAPI.read().mode,'report');assert.equal(row(f,'b0').hidden,false);assert.equal(scroll.scrollTop,275);
    const clicked=f.browser.document.createElement('div');clicked.className='ls-block';clicked.setAttribute('blockid','b3');f.browser.document.body.append(clicked);clicked.click();await delay(20);
    assert.equal(f.work.snapshot().root,'root');
    f.switchGraph('other');await delay(20);assert.equal(f.work.reportAPI.read().scope,null);assert.equal(f.work.panel.visible,false);
  } finally {await f.close();}
});

test('a void SDK route acknowledgement waits for the actual native block, and closing cancels late input',async()=>{
  const f=await reportFixture();
  try {
    const input=f.browser.document.querySelector('textarea');
    globalThis.logseq.App.pushState=(_type,{name},{anchor})=>{
      f.nativeCalls.push(['locate',anchor.slice('block-content-'.length),name]);
      schedule(()=>input.closest('.ls-block').setAttribute('blockid',anchor.slice('block-content-'.length)),110);
    };
    edit(f,'b0');await delay(35);assert.equal(f.nativeCalls.some(c=>c[0]==='edit'),false);
    await delay(160);assert.equal(await globalThis.logseq.Editor.checkEditing(),'b0');assert.equal(f.browser.document.activeElement,input);
    f.editing(false);await f.work.reportAPI.resume();input.closest('.ls-block').removeAttribute('blockid');
    edit(f,'b1');await delay(35);f.work.dispose();await delay(160);
    assert.equal(f.nativeCalls.filter(c=>c[0]==='edit').length,1);assert.equal(f.browser.document.querySelector('[data-native-report-return]'),null);
  } finally {await f.close();}
});

test('a hidden navigation lease revalidates membership from the installed provider after routing',async()=>{
  const {SourceReader}=await import('../../src/workspace/source-reader.ts');
  const {graphIdentity}=await import('../../src/graph-adapter.ts');
  const provider={read:scope=>new SourceReader({getBlock:(uuid,options)=>globalThis.logseq.Editor.getBlock(uuid,options),graphId:async()=>graphIdentity(await globalThis.logseq.App.getCurrentGraph())}).read(scope,()=>true)};
  const f=await reportFixture(650,{source:provider});
  try {
    const route=globalThis.logseq.App.pushState;
    globalThis.logseq.App.pushState=async(...args)=>{await route(...args);f.root.children=f.root.children.filter(child=>child.uuid!=='b0');};
    const read=f.work.reportAPI.read(),fragment=read.fragments.find(fragment=>fragment.target.blockUuid==='b0');
    const result=await f.work.reportAPI.openNative({schemaVersion:1,scope:read.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:read.structureVersion,position:{kind:'block'}});
    assert.equal(result.ok,false);assert.equal(f.nativeCalls.some(call=>call[0]==='edit'),false);
    assert.equal((await f.work.reportAPI.resume()).ok,true);assert.equal(f.work.panel.visible,true);
  } finally {await f.close();}
});

test('autosave changes may continue the same input lease, but a moved-out UUID cannot take focus',async()=>{
  const {SourceReader}=await import('../../src/workspace/source-reader.ts');
  const {graphIdentity}=await import('../../src/graph-adapter.ts');
  const provider={read:scope=>new SourceReader({getBlock:(uuid,options)=>globalThis.logseq.Editor.getBlock(uuid,options),graphId:async()=>graphIdentity(await globalThis.logseq.App.getCurrentGraph())}).read(scope,()=>true)};
  const f=await reportFixture(1400,{source:provider});
  try {
    edit(f,'b0');await nativeReady(f,'b0');
    const input=f.browser.document.querySelector('textarea');input.value='已自动保存但仍在输入';input.setSelectionRange(2,6);f.editing('b0',input.value);
    const old=f.work.reportAPI.read(),fragment=old.fragments.find(f=>f.target.blockUuid==='b0');
    f.content('b0',input.value);await f.work.refresh();
    const target={schemaVersion:1,scope:old.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:old.structureVersion,position:{kind:'block'}};
    assert.equal((await f.work.reportAPI.resolve(target)).reason,'stale-content');
    assert.equal((await f.work.reportAPI.openNative({...target,position:{kind:'child'}})).reason,'editing-in-progress');
    const calls=[...f.nativeCalls];assert.equal((await f.work.reportAPI.openNative(target)).ok,true);
    assert.deepEqual(f.nativeCalls,calls);assert.equal(input.value,'已自动保存但仍在输入');assert.deepEqual([input.selectionStart,input.selectionEnd],[2,6]);
    f.root.children=f.root.children.filter(child=>child.uuid!=='b0');
    assert.equal((await f.work.reportAPI.openNative(target)).reason,'source-not-in-scope');
    assert.equal(f.browser.document.querySelector('textarea'),input);f.editing(false);
  } finally {await f.close();}
});

test('a deleted report source leaves no orphan paragraph; unchanged bodies and current scope survive',async()=>{
  const {SourceReader}=await import('../../src/workspace/source-reader.ts');
  const {graphIdentity}=await import('../../src/graph-adapter.ts');
  const provider={read:scope=>new SourceReader({getBlock:(uuid,options)=>globalThis.logseq.Editor.getBlock(uuid,options),graphId:async()=>graphIdentity(await globalThis.logseq.App.getCurrentGraph())}).read(scope,()=>true)};
  const f=await reportFixture(1400,{source:provider});
  try {
    const deleted=row(f,'b0'),unchanged=row(f,'b3').querySelector('.wb-body').firstChild;
    const scroll=deleted.parentElement;
    scroll.getBoundingClientRect=()=>({top:0,bottom:100});scroll.scrollTop=120;
    for(const node of scroll.querySelectorAll('.wb-row')){
      const position=node.dataset.uuid==='root'?0:node===deleted?120:1000;
      node.getBoundingClientRect=()=>({top:position-scroll.scrollTop,bottom:position+20-scroll.scrollTop});
    }
    const read=f.work.reportAPI.read(),fragment=read.fragments.find(fragment=>fragment.target.blockUuid==='b0');
    f.root.children=f.root.children.filter(child=>child.uuid!=='b0');f.blocks.delete('b0');await f.work.refresh();
    await delay(20);assert.equal(deleted.isConnected,false);assert.equal(row(f,'b0'),null);assert.equal(row(f,'b3').querySelector('.wb-body').firstChild,unchanged);
    assert.equal(scroll.scrollTop,0,'a deleted visible source returns to its real ancestor, not the old pixel position');
    const old={schemaVersion:1,scope:read.scope,sourceId:fragment.sourceId,contentVersion:fragment.contentVersion,structureVersion:read.structureVersion,position:{kind:'block'}};
    assert.equal((await f.work.reportAPI.openNative(old)).ok,false);assert.deepEqual(f.nativeCalls,[]);assert.equal(f.work.snapshot().root,'root');
  } finally {await f.close();}
});
