import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DocumentStore, ConflictError, normalizeRoot, isLong, makeLink, restoreCapture, replaceSelection} from '../src/core.js';
async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'longdoc-test-'));
  const io={read:p=>fs.readFile(p,'utf8'),write:(p,t)=>fs.writeFile(p,t),mkdir:p=>fs.mkdir(p,{recursive:true}),rename:(a,b)=>fs.rename(a,b),optional:async p=>{try{return await fs.readFile(p,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}};
  return {store:new DocumentStore(io,root),root,io};
}
test('storage root must be outside Graph and cannot traverse',()=>{
  assert.equal(normalizeRoot('/docs/long','/graph'),'/docs/long');
  for(const p of ['/graph','/graph/docs','/x/../graph','/','relative'])assert.throws(()=>normalizeRoot(p,'/graph'));
});
test('length is assessed per pasted payload; Unicode and lines are retained',()=>{
  assert.equal(isLong('普通短文本'),false);assert.equal(isLong('中'.repeat(2000)),true);assert.equal(isLong(Array(30).fill('行').join('\n')),true);
  assert.equal(replaceSelection('前文被选内容后文',2,6,'链接'),'前文链接后文');
});
test('capture and recovery preserve exact Markdown including CRLF, code and table',async()=>{
  const {store}=await fixture();const text='# 示例\r\n\r\n```js\r\nlet x = "[[not-link]]";\r\n```\r\n\r\n|a|b|\r\n|-|-|\r\n|中|文|\r\n';
  const d=await store.create(text,{graph:'/graph',sourceUuid:'fake'});assert.equal(await store.read(d.id),text);assert.equal((await store.record(d.id)).original,text);
  assert.equal(restoreCapture('前 '+makeLink(d)+' 后',d),'前 '+text+' 后');assert.throws(()=>restoreCapture(makeLink(d)+makeLink(d),d));
});
test('successful save preserves previous disk version',async()=>{
  const {store,root}=await fixture();const d=await store.create('old');await store.save(d.id,'old','new');assert.equal(await store.read(d.id),'new');
  const histories=await fs.readdir(root+'/.longdoc/history');assert.equal(histories.length,1);assert.equal(await fs.readFile(root+'/.longdoc/history/'+histories[0],'utf8'),'old');
});
test('external atomic replacement rejects stale editor write',async()=>{
  const {store,root}=await fixture();const d=await store.create('base');await fs.writeFile(root+'/external.tmp','external');await fs.rename(root+'/external.tmp',store.file(d.id));
  await assert.rejects(store.save(d.id,'base','local'),ConflictError);assert.equal(await store.read(d.id),'external');
});
test('silent bridge write failures are caught by readback',async()=>{
  const {store,io}=await fixture();const d=await store.create('base');io.write=async()=>{};
  await assert.rejects(store.save(d.id,'base','new'));assert.equal(await store.read(d.id),'base');
});
test('concurrent captures keep all catalog entries; Chinese two-character search works',async()=>{
  const {store}=await fixture();const results=await Promise.all(Array.from({length:8},(_,i)=>store.create(`# 文档 ${i}\n自动同步`,{graph:'/g'})));
  assert.equal((await store.catalog()).length,8);assert.equal((await store.search('同步','/g')).length,8);assert.equal((await store.search('同步','/other')).length,0);
  assert.equal(new Set(results.map(x=>x.id)).size,8);
});
test('corrupt catalog is not silently overwritten; recoverable record still exists',async()=>{
  const {store,root}=await fixture();await store.init();await fs.writeFile(root+'/.longdoc/catalog.json','invalid');await assert.rejects(store.create('recover me'));
  assert.equal(await fs.readFile(root+'/.longdoc/catalog.json','utf8'),'invalid');const files=await fs.readdir(root);assert.ok(files.some(x=>x.endsWith('.md')));
});
test('backup failure never replaces the current document',async()=>{
  const {store,io}=await fixture();const d=await store.create('disk');const write=io.write;
  io.write=(p,t)=>p.includes('/history/')?Promise.reject(Error('disk full')):write(p,t);
  await assert.rejects(store.save(d.id,'disk','local'),/disk full/);
  assert.equal(await store.read(d.id),'disk');
});
test('external write during backup is detected before replacement',async()=>{
  const {store,io}=await fixture();const d=await store.create('base');const write=io.write;
  io.write=async(p,t)=>{await write(p,t);if(p.includes('/history/'))await write(store.file(d.id),'external');};
  await assert.rejects(store.save(d.id,'base','local'),ConflictError);
  assert.equal(await store.read(d.id),'external');
});
test('failed catalog commit retains exact original and recovery record',async()=>{
  const {store,io,root}=await fixture();const rename=io.rename;
  io.rename=(a,b)=>b.endsWith('catalog.json')?Promise.reject(Error('commit failed')):rename(a,b);
  await assert.rejects(store.create('原文\r\n```code```'),/commit failed/);
  const files=await fs.readdir(root);const id=files.find(x=>x.endsWith('.md')).slice(0,-3);
  assert.equal(await store.read(id),'原文\r\n```code```');
  assert.equal((await store.record(id)).original,'原文\r\n```code```');
});
