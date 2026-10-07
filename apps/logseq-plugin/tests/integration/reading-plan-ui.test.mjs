import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture} from '../fixtures/work-view.mjs';

const corpus=JSON.parse(await readFile(new URL('../fixtures/reading-collaboration.json',import.meta.url),'utf8'));
const row=(f,id)=>f.browser.document.querySelector(`.wb-row[data-uuid="${id}"]`);
async function until(check) {for(let attempt=0;attempt<100;attempt++){if(check())return;await delay(5);}assert.fail('expected owned fixture state did not arrive');}
async function readingFixture() {
  const f=await fixture(null,corpus.length);
  const nodes=corpus.map((block,index)=>({...block,id:index+1,parent:{id:block.parentUuid??'page'},page:{id:'page'},children:[]}));
  for(const node of nodes)node.children=nodes.filter(child=>child.parentUuid===node.uuid);
  Object.assign(f.root,nodes[0]);f.blocks.clear();f.blocks.set(f.root.uuid,f.root);
  for(const node of nodes.slice(1))f.blocks.set(node.uuid,node);
  f.setCurrent(f.root.uuid);f.nativeCalls=[];f.messages=[];
  globalThis.logseq.UI={showMsg:(...args)=>{f.messages.push(args);}};
  for(const name of ['editBlock','updateBlock','setBlockCollapsed'])globalThis.logseq.Editor[name]=async()=>assert.fail(`read-only source navigation invoked ${name}`);
  globalThis.logseq.App.pushState=async(...args)=>{f.nativeCalls.push(args);};
  Object.defineProperty(f.browser.document.documentElement,'clientWidth',{value:1400,configurable:true});
  const main=f.browser.document.createElement('main');main.id='main-content-container';f.browser.document.body.prepend(main);f.native=new Map();
  for(const [index,node] of nodes.entries()) {
    const block=f.browser.document.createElement('div');block.className='ls-block';block.setAttribute('blockid',node.uuid);
    const body=f.browser.document.createElement('div');body.className='block-content';body.textContent=node.content;block.append(body);main.append(block);
    const rect={top:index<10?index*30:2000,bottom:index<10?index*30+20:2020,left:20,right:500,width:480,height:20};
    body.getClientRects=()=>[rect];body.getBoundingClientRect=()=>rect;f.native.set(node.uuid,{block,body});
  }
  await f.work.open(f.root.uuid);await f.work.reportAPI.setMode('report');
  const request=await f.work.readingAPI.request({schemaVersion:1,purpose:'保留原句，设计对照读法'});assert.equal(request.ok,true);
  f.request=request.value;f.original=JSON.stringify([...f.blocks].map(([id,block])=>[id,block.content,block.parent,block.children.map(child=>child.uuid)]));
  return f;
}
function plan(f,layout,name='连续读原句',id='one') {
  const source=f.request.source;
  return {schemaVersion:1,requestId:f.request.requestId,planId:id,name,scope:source.scope,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion,
    sourceVersions:source.blocks.map(block=>({sourceId:block.sourceId,contentVersion:block.contentVersion})),layout:layout??[{kind:'paragraphs',key:'all',sourceIds:source.blocks.map(block=>block.sourceId)}]};
}
function composed(f) {
  const ids=f.request.source.blocks.map(block=>block.sourceId);
  return plan(f,[{kind:'sequence',key:'root',sourceIds:ids.slice(0,1)},
    {kind:'comparison',key:'contrast',title:'做事与讨论的原句',columns:[
      {key:'doing',title:'做事',children:[{kind:'paragraphs',key:'doing-body',sourceIds:ids.slice(1,26)}]},
      {key:'discussion',title:'讨论',children:[{kind:'sequence',key:'discussion-body',sourceIds:ids.slice(26,51)}]}
    ]},
    {kind:'group',key:'remaining',title:'零散记录与边界',children:[{kind:'paragraphs',key:'remaining-body',sourceIds:ids.slice(51)}]}
  ],'先对照，再继续','two');
}
test('101 primary source nodes retain complete saved identities and bodies across two layouts and original structure',async()=>{
  const f=await readingFixture();try {
    const preserved=new Map(corpus.map(block=>[block.uuid,row(f,block.uuid)]));
    assert.equal((await f.work.readingAPI.submit(plan(f))).ok,true);
    assert.equal(f.work.panel.root.querySelectorAll('.wb-reading-paragraphs').length,1);
    const body=row(f,corpus[14].uuid).querySelector('.wb-body'),text=body.querySelector('p').firstChild;
    const range=f.browser.document.createRange();range.setStart(text,0);range.setEnd(text,Math.min(text.textContent.length,8));
    const selection=f.browser.document.getSelection();selection.addRange(range);const selected=selection.toString();
    const focus=row(f,corpus[14].uuid).querySelector('summary');focus.focus();
    assert.equal((await f.work.readingAPI.submit(composed(f))).ok,true);
    assert.equal(f.work.panel.root.querySelectorAll('.wb-reading-column').length,2);
    assert.equal(selection.toString(),selected);assert.equal(f.browser.document.activeElement,focus);
    for(const block of f.request.source.blocks) {
      const node=row(f,block.target.blockUuid);assert.equal(node,preserved.get(block.target.blockUuid));assert.equal(node.hidden,false);
      assert.equal(node.dataset.reportSourceId,block.sourceId);assert.equal(node.dataset.reportContentVersion,block.contentVersion);
    }
    for(const heading of f.work.panel.root.querySelectorAll('.wb-reading-heading')) {
      assert.equal(heading.dataset.uuid,undefined);assert.equal((await f.work.resolveBodyDrop(heading,'child')).ok,false);
    }
    for(const copy of f.work.panel.root.querySelectorAll('.wb-reading-context-body'))assert.equal(copy.dataset.uuid,undefined);
    assert.equal((await f.work.readingAPI.select(null)).ok,true);
    assert.equal(f.work.panel.root.querySelectorAll('.wb-reading-unit').length,0);
    assert.equal((await f.work.readingAPI.select('two')).ok,true);
    assert.equal(JSON.stringify([...f.blocks].map(([id,block])=>[id,block.content,block.parent,block.children.map(child=>child.uuid)])),f.original);
    assert.equal(f.nativeCalls.length,0);
  } finally {await f.close();}
});
test('body and keyboard heading navigation mark exact native descendants and context; escape clears without editing',async()=>{
  const f=await readingFixture();try {
    await f.work.readingAPI.submit(composed(f));
    row(f,corpus[1].uuid).querySelector('.wb-body').click();
    await until(()=>f.work.reportAPI.read().sourceLocation.requestedSourceIds.length===25);
    let location=f.work.reportAPI.read().sourceLocation;assert.equal(location.mountedSourceIds.length,25);assert.equal(location.visibleSourceIds.length,9);
    assert.equal(f.browser.document.querySelectorAll('[data-task-copilot-source-set]').length,25);assert.equal(f.nativeCalls.length,0);
    const heading=f.work.panel.root.querySelector('[data-reading-heading=discussion]');
    const scrolled=[];f.native.get(corpus[0].uuid).body.scrollIntoView=()=>scrolled.push(corpus[0].uuid);f.native.get(corpus[26].uuid).body.scrollIntoView=()=>scrolled.push(corpus[26].uuid);
    heading.dispatchEvent(new f.browser.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    await until(()=>f.work.reportAPI.read().sourceLocation.requestedSourceIds.length===26);
    location=f.work.reportAPI.read().sourceLocation;
    assert.deepEqual(location.requestedSourceIds,[f.request.source.blocks[0].sourceId,...f.request.source.blocks.slice(26,51).map(block=>block.sourceId)]);
    assert.equal(location.visibleSourceIds.length,1);assert.equal(f.nativeCalls.length,0);
    assert.deepEqual(scrolled,[corpus[26].uuid],"scroll to a heading member, retaining ancestor context in the set without navigating to it");
    heading.dispatchEvent(new f.browser.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(f.browser.document.querySelectorAll('[data-task-copilot-source-set]').length,0);
    assert.equal(f.work.reportAPI.read().sourceLocation.requestedSourceIds.length,0);
  } finally {await f.close();}
});
test('text selection, copying, nested links and composed material actions do not start source navigation',async()=>{
  const f=await readingFixture();try {
    const material={id:'owned-fixture-material',filename:'同名比较.md',reference:'[同名比较.md](real-service-reference)',availability:'available'},opened=[];
    f.work.setReadingMaterials({list:async()=>[material],open:async(id,scope)=>opened.push({id,scope})});
    const request=await f.work.readingAPI.request({schemaVersion:1,purpose:'原句与已关联材料'});f.request=request.value;
    const input=plan(f);input.layout.push({kind:'material',key:'file',materialId:material.id});await f.work.readingAPI.submit(input);
    const body=row(f,corpus[14].uuid).querySelector('.wb-body'),text=body.querySelector('p').firstChild,range=f.browser.document.createRange();
    range.setStart(text,0);range.setEnd(text,4);f.browser.document.getSelection().addRange(range);body.click();
    body.dispatchEvent(new f.browser.Event('copy',{bubbles:true}));await delay(10);
    assert.equal(f.work.reportAPI.read().sourceLocation.requestedSourceIds.length,0);
    f.browser.document.getSelection().removeAllRanges();
    const link=f.browser.document.createElement('a');link.href='#existing-reference';link.textContent='实际来源链接';body.append(link);link.click();
    const button=f.work.panel.root.querySelector('.wb-reading-material');assert.equal(button.textContent,material.filename);assert.equal(button.dataset.materialReference,material.reference);button.click();
    await until(()=>opened.length===1);assert.deepEqual(opened[0],{id:material.id,scope:f.request.source.scope});
    assert.equal(f.work.reportAPI.read().sourceLocation.requestedSourceIds.length,0);assert.equal(f.nativeCalls.length,0);
    const impersonator=f.browser.document.createElement('div');impersonator.className='wb-row';impersonator.dataset.uuid=corpus[26].uuid;body.append(impersonator);
    const target=await f.work.resolveBodyDrop(impersonator,'child');assert.equal(target.ok,true);assert.equal(target.value.target.blockUuid,corpus[14].uuid);
  } finally {await f.close();}
});
test('active native draft and composition retain the exact input, selection and focus while missing targets remain honestly unavailable',async()=>{
  const f=await readingFixture();try {
    const first=f.native.get(corpus[1].uuid),input=f.browser.document.createElement('textarea');first.body.className='block-editor';first.body.replaceChildren(input);
    input.value='还没保存的中文草稿';input.setSelectionRange(2,5);input.focus();f.editing(corpus[1].uuid,input.value);
    input.dispatchEvent(new f.browser.CompositionEvent('compositionstart',{bubbles:true}));
    const missing=f.native.get(corpus[2].uuid);missing.block.hidden=true;
    const source=f.work.reportAPI.read(),ids=f.request.source.blocks.slice(1,3).map(block=>block.sourceId);
    const result=await f.work.reportAPI.highlight({schemaVersion:1,sourceIds:ids,includeContext:false,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion});
    assert.equal(result.ok,true);assert.equal(result.value.status,'partial');assert.equal(result.value.navigation,'blocked-by-input');assert(result.value.unavailableSourceIds.includes(ids[1]));
    assert.equal(first.body.querySelector('textarea'),input);assert.equal(input.value,'还没保存的中文草稿');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,5);assert.equal(f.browser.document.activeElement,input);assert.equal(f.nativeCalls.length,0);
    input.dispatchEvent(new f.browser.KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true}));assert(f.browser.document.querySelectorAll('[data-task-copilot-source-set]').length>0);
    input.dispatchEvent(new f.browser.CompositionEvent('compositionend',{bubbles:true}));
    f.work.reportAPI.clearHighlight();assert.equal(f.browser.document.activeElement,input);assert.equal(input.value,'还没保存的中文草稿');
  } finally {await f.close();}
});
test('source changes and scope switches revoke stale layout and native marks, preserving concurrent new source text',async()=>{
  const f=await readingFixture();try {
    const input=plan(f);await f.work.readingAPI.submit(input);
    const source=f.work.reportAPI.read();
    assert.equal((await f.work.reportAPI.highlight({schemaVersion:1,sourceIds:[f.request.source.blocks[1].sourceId],includeContext:false,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion})).ok,true);
    const changed=corpus[14].content+'\n不过用户刚加了一个退出条件';f.content(corpus[14].uuid,changed);await f.work.refresh();
    await until(()=>f.work.readingAPI.read().activePlan===null);
    assert.equal(f.browser.document.querySelectorAll('[data-task-copilot-source-set]').length,0);
    assert.match(row(f,corpus[14].uuid).querySelector('.wb-body').textContent,/用户刚加了一个退出条件/);
    assert.equal((await f.work.readingAPI.submit(input)).ok,false);
    f.switchGraph('other');await f.tick();assert.equal(f.work.readingAPI.read().activePlan,null);
    assert.equal(f.browser.document.querySelectorAll('[data-task-copilot-source-set]').length,0);
  } finally {await f.close();}
});
test('read-only host routing reports folded and unmounted sources truthfully, observes later mount and releases on dispose',async()=>{
  const f=await readingFixture();let closed=false;try {
    const target=f.native.get(corpus[100].uuid),source=f.work.reportAPI.read();target.block.remove();
    const input={schemaVersion:1,sourceIds:[f.request.source.blocks[100].sourceId],includeContext:false,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion};
    globalThis.logseq.App.pushState=async(...args)=>{f.nativeCalls.push(args);target.block.hidden=true;f.browser.document.querySelector('#main-content-container').append(target.block);};
    const result=await f.work.reportAPI.highlight(input);
    assert.equal(result.ok,true);assert.equal(result.value.status,'unavailable');assert.equal(result.value.navigation,'routed');assert.equal(result.value.mountedSourceIds.length,0);
    assert.equal(target.block.hidden,true,"read-only routing must not unfold a source itself");
    const late=f.browser.document.createElement('div');late.textContent='new render';target.body.append(late);target.block.hidden=false;late.remove();
    await until(()=>target.body.hasAttribute('data-task-copilot-source-set'));
    assert.equal(f.work.reportAPI.read().sourceLocation.mountedSourceIds.length,1);assert.equal(f.work.reportAPI.read().sourceLocation.visibleSourceIds.length,0);
    assert.equal(f.nativeCalls.length,1);await f.close();closed=true;
    assert.equal(target.body.hasAttribute('data-task-copilot-source-set'),false);assert.equal(f.browser.document.querySelector('[data-task-copilot-source-set-style]'),null);
  } finally {if(!closed)await f.close();}
});
test('replacing the actual main container never reports unpainted nodes as highlighted and restores marks after mount',async()=>{
  const f=await readingFixture();try {
    const source=f.work.reportAPI.read(),id=f.request.source.blocks[4].sourceId,target=f.native.get(corpus[4].uuid);
    const result=await f.work.reportAPI.highlight({schemaVersion:1,sourceIds:[id],includeContext:false,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion});assert.equal(result.ok,true);
    assert.deepEqual(result.value.highlightedSourceIds,[id]);
    const main=f.browser.document.createElement('main');main.id='main-content-container';
    const block=target.block.cloneNode(true),body=block.querySelector('.block-content');body.removeAttribute('data-task-copilot-source-set');
    body.getClientRects=()=>[{top:50,bottom:70,left:10,right:100}];body.getBoundingClientRect=()=>({top:50,bottom:70,left:10,right:100});main.append(block);
    f.browser.document.querySelector('#main-content-container').replaceWith(main);
    const before=f.work.reportAPI.read().sourceLocation;assert.deepEqual(before.mountedSourceIds,[id]);assert.deepEqual(before.highlightedSourceIds,[]);assert.equal(before.status,'unavailable');
    await until(()=>body.hasAttribute('data-task-copilot-source-set'));assert.deepEqual(f.work.reportAPI.read().sourceLocation.highlightedSourceIds,[id]);
    assert.equal(f.nativeCalls.length,0);
  } finally {await f.close();}
});
test('a late native route cannot paint another work after Graph change',async()=>{
  const f=await readingFixture();try {
    const target=f.native.get(corpus[26].uuid),source=f.work.reportAPI.read();target.block.remove();let release;
    globalThis.logseq.App.pushState=()=>new Promise(resolve=>{release=resolve;});
    const pending=f.work.reportAPI.highlight({schemaVersion:1,sourceIds:[f.request.source.blocks[26].sourceId],includeContext:false,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion});
    await until(()=>release);f.switchGraph('other');release();const result=await pending;
    assert.equal(result.ok,false);assert.equal(f.browser.document.querySelectorAll('[data-task-copilot-source-set]').length,0);
  } finally {await f.close();}
});
