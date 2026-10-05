import test from 'node:test';
import assert from 'node:assert/strict';
import { Window, type HTMLButtonElement } from 'happy-dom';
import { SourceReader } from '../src/workspace/source-reader.ts';
import { snapshot, validateSnapshot, sha256, sourceId, type SourceScope } from '../src/workspace/source-protocol.ts';
import { composeReport } from '../src/features/work-view/report-model.ts';
import { resolveBodyTarget } from '../src/features/work-view/report-target.ts';
import { installReadingEntries } from '../src/host/reading-entry.ts';
import { prepareDefaultMaterialDirectory } from '../src/features/materials/default-directory.ts';
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileIO } from '../src/host/file-io.ts';
const waitFor=async(check:()=>boolean)=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.ok(check());};

test('whole page reading maps each actual block, keeps page separate and rejects block-root/body write impersonation',async()=>{
 const scope:SourceScope={graphId:'g',rootUuid:'page',kind:'page',pageName:'Project / 示例'};
 const reader=new SourceReader({graphId:async()=>scope.graphId,getBlock:async()=>{throw Error('page must not read an invented root block');},getPage:async()=>({uuid:'page',name:scope.pageName}),getPageBlocksTree:async()=>[{uuid:'a',content:'完整原句。',children:[{uuid:'b',content:'条件与反例。'}]},{uuid:'c',content:'重复原句。\n无标签正文。'}]});
 const source=await validateSnapshot(await reader.read(scope,()=>true));
 assert.deepEqual(source.blocks.map(b=>[b.target.blockUuid,b.parentUuid,b.depth]),[['a','page',0],['b','a',1],['c','page',0]]);
 const report=composeReport(source,{items:[],collapsed:[],overrides:{},expanded:[],selected:''},null,new Set());
 assert.deepEqual(report.fragments.map(f=>f.target.blockUuid),['a','b','c']);assert.equal(report.coverage.range,'full');
 const target={schemaVersion:1,scope,sourceId:sourceId('g','a'),contentVersion:await sha256('完整原句。'),structureVersion:source.structureVersion,position:{kind:'after'}};
 assert.throws(()=>resolveBodyTarget(target,source),/page-write-unavailable/);
 assert.throws(()=>resolveBodyTarget({...target,sourceId:sourceId('g','page'),position:{kind:'block'}},source),/source-not-in-scope/);
 const corrupted={...source,blocks:[{...source.blocks[0]!,target:{kind:'logseq-block' as const,graphId:'g',blockUuid:'page'},sourceId:sourceId('g','page')}]};
 await assert.rejects(validateSnapshot(corrupted),/TOPOLOGY/);
 const empty=new SourceReader({graphId:async()=>scope.graphId,getBlock:async()=>null,getPage:async()=>({uuid:'page'}),getPageBlocksTree:async()=>[]});
 assert.equal((await validateSnapshot(await empty.read(scope,()=>true))).blocks.length,0);
 const unknown=await snapshot(scope,[],undefined,{pageUuid:'page',pageName:scope.pageName!,availability:'missing'});assert.equal((await validateSnapshot(unknown)).page?.availability,'missing');
});

test('page Graph switch invalidates an outstanding host read instead of accepting another Graph',async()=>{
 let graph='g',finish:(value:unknown)=>void=()=>{};const waiting=new Promise(r=>{finish=r;});
 const reader=new SourceReader({graphId:async()=>graph,getBlock:async()=>null,getPage:async()=>waiting,getPageBlocksTree:async()=>[]});
 const reading=reader.read({graphId:'g',rootUuid:'page',kind:'page',pageName:'Area / A'},()=>true);
 await new Promise(r=>setTimeout(r,0));graph='other';finish({uuid:'page'});await assert.rejects(reading,/SCOPE_EXPIRED/);
});

test('native entries use saved titles only, preserve input and selection, stay visible and remove all controls on disposal',async()=>{
 const browser=new Window(),prior={window:globalThis.window,document:globalThis.document,logseq:globalThis.logseq};
 let changed=()=>{},graphChanged=()=>{};const content=new Map([['mini','**[MiniProject]** 原文标题'],['task','TODO [事务] 原生事务'],['plain','TODO 普通待办'],['quote','> **[任务]** 示例'],['code','```\n**[任务]** 示例\n```']]);const opened:string[]=[];
 Object.assign(globalThis,{window:browser,document:browser.document,logseq:{Editor:{getBlock:async(uuid:string)=>({uuid,content:content.get(uuid)})},DB:{onChanged:(fn:()=>void)=>{changed=fn;return()=>{changed=()=>{};};}},App:{onCurrentGraphChanged:(fn:()=>void)=>{graphChanged=fn;return()=>{graphChanged=()=>{};};}}}});
 browser.document.body.innerHTML='<main id="main-content-container">'+[...content.keys()].map(id=>`<div class="ls-block" blockid="${id}"><div class="block-main-container"><div class="block-content-wrapper">原生正文</div></div></div>`).join('')+'<textarea>未保存草稿</textarea></main>';
 const input=browser.document.querySelector('textarea')!;input.focus();input.setSelectionRange(2,4);
 const host=installReadingEntries(async uuid=>{opened.push(uuid);},async()=>{},error=>{throw error;});
 try{
  await waitFor(()=>browser.document.querySelectorAll('[data-work-reading]').length===2);
  const button=browser.document.querySelector('[data-work-reading="mini"]') as unknown as HTMLButtonElement;
  const down=new browser.MouseEvent('mousedown',{bubbles:true,cancelable:true});button.dispatchEvent(down);assert.equal(down.defaultPrevented,true);button.click();
  await waitFor(()=>opened.length===1);assert.deepEqual(opened,['mini']);assert.equal(browser.document.activeElement,input);assert.equal(input.value,'未保存草稿');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,4);
  host.rescan();host.rescan();await new Promise(r=>setTimeout(r,100));assert.equal(browser.document.querySelectorAll('[data-work-reading]').length,2);
  content.set('task','普通正文');changed();await waitFor(()=>browser.document.querySelectorAll('[data-work-reading]').length===1);
  graphChanged();await waitFor(()=>browser.document.querySelectorAll('[data-work-reading]').length===1);
 }finally{host.dispose();assert.equal(browser.document.querySelectorAll('[data-work-reading]').length,0);await browser.happyDOM.abort();Object.assign(globalThis,prior);}
});

test('default materials prepare only on save, reuse stable per-Graph path and remember an explicit fallback without moving files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'reading-materials-')),home=join(root,'home'),graph=join(root,'graph');await mkdir(join(home,'.logseq'),{recursive:true});await mkdir(graph);
 const browser=new Window(),prior=globalThis.window;Object.assign(globalThis,{window:{top:{apis:{doAction:async()=>join(home,'.logseq')}}}});
 let writes=0,fail=false,choices=0;const io:FileIO={mkdir:async p=>{if(fail)throw Error('EACCES');await mkdir(p,{recursive:true});},read:p=>readFile(p,'utf8'),write:async(p,s)=>{writes++;await writeFile(p,s);},list:p=>readdir(p),rename,stat:async p=>{const s=await stat(p);return{type:s.isDirectory()?'directory':'file',size:s.size};}};
 try{
  assert.equal(writes,0);const a=await prepareDefaultMaterialDirectory(io,browser.localStorage,graph,async()=>{choices++;return null;});
  await writeFile(join(a,'existing.md'),'保留已有材料');const b=await prepareDefaultMaterialDirectory(io,browser.localStorage,graph,async()=>null);assert.equal(a,b);assert.equal(await readFile(join(a,'existing.md'),'utf8'),'保留已有材料');assert.equal(choices,0);
  const other=await prepareDefaultMaterialDirectory(io,browser.localStorage,join(root,'other-graph'),async()=>null);assert.notEqual(other,a);
  const selected=join(root,'chosen');fail=true;
  const c=await prepareDefaultMaterialDirectory(io,browser.localStorage,graph,async()=>{choices++;fail=false;return selected;});assert.equal(c,selected);assert.equal(choices,1);
  assert.equal(await prepareDefaultMaterialDirectory(io,browser.localStorage,graph,async()=>{throw Error('should remember selection');}),selected);
 }finally{globalThis.window=prior;await browser.happyDOM.abort();await rm(root,{recursive:true,force:true});}
});
