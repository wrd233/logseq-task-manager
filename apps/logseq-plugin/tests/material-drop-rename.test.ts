import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rename,stat,rm,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Window as HappyWindow} from 'happy-dom';
import type {FileIO} from '../src/host/file-io.ts';
import {MaterialDirectories} from '../src/workspace/material-context.ts';
import {MaterialService} from '../src/features/materials/service.ts';
import {renamedPath} from '../src/features/materials/names.ts';
import {droppedPath,materialDrag} from '../src/features/materials/drop.ts';
import {recoverMaterialRename} from '../src/features/materials/file-operations.ts';
import {MaterialReferences,type MaterialContentPort,type MaterialDropTarget,type ReferenceFact} from '../src/features/materials/references.ts';
import {contentFixture} from './fixtures/content-writeback.ts';

async function fixture(graph='/A') {
  const root=await mkdtemp(join(tmpdir(),'material-drop-rename-')),files=join(root,'work');await mkdir(files);
  const io:FileIO={read:path=>readFile(path,'utf8'),write:(path,text)=>writeFile(path,text),mkdir:async path=>{await mkdir(path,{recursive:true});},rename,list:readdir,stat:async path=>{const s=await stat(path);return{type:s.isFile()?'file':'directory',size:s.size};},identity:async path=>{const s=await stat(path);return JSON.stringify([s.dev,s.ino,s.birthtimeMs]);}};
  const values=new Map<string,string>();const storage={get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const directories=new MaterialDirectories(storage),service=new MaterialService(io,directories,graph,files,text=>text),context={graph,sourceUuid:crypto.randomUUID(),directory:files,organization:'flat' as const};
  const add=async(name='资料 A.md',body='# 内文标题不同\n\n[注] 保留 TODO、条件和链接')=>{const path=join(files,name);await writeFile(path,body);return(await service.associateFile(path,context)).material;};
  return{root,files,io,service,directories,context,add,cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('file names follow the real filename; rename preserves ID, bytes, extension and reference/input permission',async()=>{
  const f=await fixture();try{
    const m=await f.add();assert.equal(m.title,'资料 A');const before=await readFile(m.path,'utf8');
    const result=await f.service.renameLocal(m.id,'调研 新名称','rename-one');assert.equal(result.status,'success');
    const next=await f.service.read(m.id);assert.equal(next.path,join(f.files,'调研 新名称.md'));assert.equal(next.title,'调研 新名称');assert.equal(next.id,m.id);assert.equal(await readFile(next.path,'utf8'),before);
    assert.deepEqual(next.capabilities.edit,{user:false,agent:false});assert.match(next.reference,new RegExp(`longdoc://${m.id}`));
    const {store}=await f.service.locate(m.id);await store.update(m.id,r=>({...r,rename:{...r.rename!,status:'complete'}}));assert.equal((await f.service.renameLocal(m.id,'调研 新名称','rename-one')).status,'success');
  }finally{await f.cleanup();}
});

test('no overwrite or path escape, Unicode names, case-only rename, duplicate drop and actor privileges stay separate',async()=>{
  const f=await fixture();try{
    const m=await f.add('Résumé.MD');await f.add('occupied.MD','other');
    await assert.rejects(f.service.renameLocal(m.id,'Occupied','collision'),/同名/);
    for(const invalid of ['../out','/outside','bad\\path','bad\nname','bad:port','.hidden','trail ','trail.'])assert.throws(()=>renamedPath(m.path,invalid));
    const changed=await f.service.renameLocal(m.id,'résumé','case');assert.equal(changed.status,'success');assert.equal((await f.service.read(m.id)).path,join(f.files,'résumé.MD'));
    assert.equal(await readFile(join(f.files,'occupied.MD'),'utf8'),'other');
    const [a,b]=await Promise.all([f.service.associateFile(join(f.files,'occupied.MD'),f.context),f.service.associateFile(join(f.files,'occupied.MD'),f.context)]);assert.equal(a.material.id,b.material.id);
    await assert.rejects(f.service.save(m.id,'version','old','new','agent'),/未授权/);
  }finally{await f.cleanup();}
});

test('intent/record/rename failures preserve individually queryable facts; recovery never repeats a dispatched rename',async()=>{
  const f=await fixture();try{
    const m=await f.add(),write=f.io.write,move=f.io.rename;let calls=0,failIntent=true;
    f.io.write=async(path,text)=>{if(failIntent&&path.includes('.longdoc'))throw Error('record denied');return write(path,text);};
    f.io.rename=async(from,to)=>{if(from===m.path)calls++;return move(from,to);};
    await assert.rejects(f.service.renameLocal(m.id,'新名称','intent-fail'),/record denied/);assert.equal(calls,0);assert.ok(await readFile(m.path,'utf8'));
    failIntent=false;f.io.rename=async(from,to)=>{await move(from,to);if(from===m.path){calls++;throw Error('reply lost');}};
    const lost=await f.service.renameLocal(m.id,'新名称','lost');assert.equal(lost.status,'partial');assert.equal(calls,1);
    const {store}=await f.service.locate(m.id);assert.equal((await store.record(m.id)).rename!.status,'uncertain');
    const restored=await recoverMaterialRename(store,m.id);assert.equal(restored.status,'success');assert.equal(restored.record.path,join(f.files,'新名称.md'));assert.equal(calls,1);
    await assert.rejects(f.service.save(m.id,'wrong','old','next','agent'),/未授权/);
  }finally{await f.cleanup();}
});

test('no host identity means lost reply is unresolved; explicit relocation retains ID rather than claiming a same-content file',async()=>{
  const f=await fixture();try{
    delete f.io.identity;const m=await f.add(),move=f.io.rename;
    f.io.rename=async(from,to)=>{await move(from,to);if(from===m.path)throw Error('reply lost');};
    assert.equal((await f.service.renameLocal(m.id,'Moved','lost')).status,'partial');const{store}=await f.service.locate(m.id);
    assert.equal((await recoverMaterialRename(store,m.id)).status,'partial');assert.equal((await f.service.read(m.id)).availability,'unavailable');
    await store.relocate(m.id,join(f.files,'Moved.md'));assert.equal((await f.service.read(m.id)).id,m.id);
  }finally{await f.cleanup();}
});

test('external rename uses system identity in the original directory; identical bytes never select the wrong file',async()=>{
  const f=await fixture();try{
    const a=await f.add('a.md','same'),b=await f.add('b.md','same');await rename(a.path,join(f.files,'new a.md'));
    assert.equal((await f.service.read(a.id)).path,join(f.files,'new a.md'));assert.equal((await f.service.read(b.id)).path,b.path);
    await rename(join(f.files,'new a.md'),join(f.files,'again.md'));await link(join(f.files,'again.md'),join(f.files,'hardlink.md'));
    assert.equal((await f.service.read(a.id)).availability,'unavailable');assert.equal((await f.service.read(a.id)).path,join(f.files,'new a.md'));
    const c=await f.add('c.md','same');await writeFile(join(f.files,'unrelated.md'),'same');await rename(c.path,join(f.root,'outside.md'));
    assert.equal((await f.service.read(c.id)).availability,'unavailable');
  }finally{await f.cleanup();}
});

test('busy material pauses rename/discovery; binary and old UUID captures keep their format and authority',async()=>{
  const f=await fixture();try{
    const m=await f.add(),busy=new MaterialService(f.io,f.directories,f.context.graph,f.files,x=>x,()=>false);
    await assert.rejects(busy.renameLocal(m.id,'new','busy'),/正在编辑/);await rename(m.path,join(f.files,'external.md'));assert.equal((await busy.read(m.id)).availability,'unavailable');assert.equal((await f.service.read(m.id)).availability,'available');
    const pdf=await f.add('报告.pdf','binary fixture');assert.equal((await f.service.renameLocal(pdf.id,'新版报告','pdf')).status,'success');assert.equal((await f.service.read(pdf.id)).content,null);
    const {store}=await f.service.locate(pdf.id),old=crypto.randomUUID();await writeFile(store.file(old),'legacy');await writeFile(join(store.root,'.longdoc',`${old}.json`),JSON.stringify({id:old,title:'Old display',kind:'capture',createdAt:'2020-01-01',original:'original text',graph:'/A'}));
    assert.equal((await f.service.renameLocal(old,'旧文件','old')).status,'success');assert.equal((await f.service.read(old)).id,old);assert.equal((await store.record(old)).original,'original text');
  }finally{await f.cleanup();}
});

test('drag payload cannot cross scope or confer authority, and a File name alone never invents an original path',async()=>{
  const f=await fixture(),browser=new HappyWindow();try{
    const m=await f.add(),scope={graphId:'A:/A',rootUuid:f.context.sourceUuid},payload=JSON.stringify({schemaVersion:1,materialId:m.id,scope});
    assert.equal(materialDrag(payload,scope).materialId,m.id);assert.throws(()=>materialDrag(payload,{...scope,graphId:'B:/B'}));assert.throws(()=>materialDrag(payload,{...scope,rootUuid:crypto.randomUUID()}));assert.throws(()=>materialDrag(JSON.stringify({...JSON.parse(payload),authorized:true}),scope));
    const file=new browser.File(['# 内文标题不同\n\n[注] 保留 TODO、条件和链接'],'资料 A.md');assert.equal(await droppedPath(file as unknown as File,f.io),null);
    Object.defineProperty(file,'path',{value:m.path});assert.equal(await droppedPath(file as unknown as File,f.io),m.path);
    const other=new browser.File(['x'],'wrong.md');Object.defineProperty(other,'path',{value:m.path});await assert.rejects(droppedPath(other as unknown as File,f.io),/核验/);
  }finally{await browser.happyDOM.abort();await f.cleanup();}
});

async function writingFixture(){
  const c=await contentFixture(),f=await fixture('/A');
  const port:MaterialContentPort={scope:()=>c.authority.current(),read:async scope=>(await c.executor.read(scope)).snapshot,apply:patch=>c.executor.apply(patch,{kind:'local-user-command',command:'material-drop'}),result:(scope,id)=>c.executor.query(scope,id)};
  const refs=new MaterialReferences(f.service,port);
  const target=async(uuid=c.a):Promise<MaterialDropTarget>=>{const snap=(await c.executor.read(c.scope)).snapshot,b=snap.blocks.find(b=>b.target.blockUuid===uuid)!;return{scope:c.scope,sourceId:b.sourceId,target:b.target,contentVersion:b.contentVersion!,parentUuid:b.parentUuid,structureVersion:snap.structureVersion,position:{kind:'child'}};};
  return{c,f,port,refs,target,cleanup:async()=>{await f.cleanup();await c.cleanup();}};
}

test('versioned report drop uses actual child/Journals, repeated drops reuse identity; rename updates a generated reference and preserves history/alias',async()=>{
  const w=await writingFixture();try{
    const m=await w.f.add(),target=await w.target();assert.equal((await w.refs.insert(m.id,target,'drop-one')).status,'success');const count=w.c.counts().inserts;
    assert.equal((await w.refs.insert(m.id,target,'drop-repeat')).status,'success');assert.equal(w.c.counts().inserts,count);
    const{store}=await w.f.service.locate(m.id),r=await store.record(m.id),fact=r.references![0]!;const original=w.c.blocks.get(fact.target.blockUuid)!.content,history=structuredClone((await w.c.executor.read(w.c.scope)).snapshot);
    const alias=w.c.add(`[自写概述](longdoc://${m.id})`);const read=(await w.c.executor.read(w.c.scope)).snapshot,b=read.blocks.find(b=>b.target.blockUuid===alias.uuid)!;
    const ref:ReferenceFact={key:'alias',scope:w.c.scope,sourceId:b.sourceId,target:b.target,parentUuid:b.parentUuid,mode:'alias',text:alias.content,start:0,end:alias.content.length,contentVersion:b.contentVersion!,status:'synced'};await w.refs.register(m.id,ref);
    assert.equal((await w.f.service.renameLocal(m.id,'改名后','rename')).status,'success');assert.equal((await w.refs.sync(m.id)).status,'success');
    assert.match(w.c.blocks.get(fact.target.blockUuid)!.content,/📄 改名后/);assert.equal(w.c.blocks.get(alias.uuid)!.content,alias.content);assert.equal(history.blocks.find(b=>b.target.blockUuid===fact.target.blockUuid)!.content,original);
    assert.equal((await store.record(m.id)).references!.find(ref=>ref.key===fact.key)!.contentVersion,(await w.c.executor.read(w.c.scope)).snapshot.blocks.find(b=>b.target.blockUuid===fact.target.blockUuid)!.contentVersion);
  }finally{await w.cleanup();}
});

test('reference failures retain files, actual native editing/composition and stale structure/content reject source writes',async()=>{
  const w=await writingFixture();try{
    const m=await w.f.add(),target=await w.target();w.c.editing(w.c.a);assert.equal((await w.refs.insert(m.id,target,'editing')).status,'partial');assert.equal(w.c.counts().inserts,0);assert.equal((await w.f.service.read(m.id)).availability,'available');
    w.c.editing(false);w.c.blocks.get(w.c.a)!.content+=' changed';assert.equal((await w.refs.insert(m.id,target,'stale')).status,'partial');assert.equal(w.c.counts().inserts,0);
    const fresh=await w.target();assert.equal((await w.refs.insert(m.id,fresh,'new')).status,'success');assert.equal(w.c.counts().inserts,1); // Proven non-write can be explicitly retried at a fresh target.
    w.c.authority.revoke();assert.equal((await w.refs.insert(m.id,fresh,'revoked')).status,'partial');
  }finally{await w.cleanup();}
});

test('two managed ranges in one committed block rename together; changed alias/range is never guessed from matching title',async()=>{
  const w=await writingFixture();try{
    const m=await w.f.add(),text=m.reference;w.c.blocks.get(w.c.a)!.content=`${text} then ${text}\nid:: ${w.c.a}`;w.c.blocks.get(w.c.a)!.properties.id=w.c.a;
    const snap=(await w.c.executor.read(w.c.scope)).snapshot,b=snap.blocks.find(b=>b.target.blockUuid===w.c.a)!;
    for(const [key,start]of [['one',0],['two',text.length+6]] as const){await w.refs.register(m.id,{key,scope:w.c.scope,sourceId:b.sourceId,target:b.target,parentUuid:b.parentUuid,mode:'follow-filename',text,start,end:start+text.length,contentVersion:b.contentVersion!,status:'synced'});}
    await w.f.service.renameLocal(m.id,'更长的新版文件名','rename-multiple');assert.equal((await w.refs.sync(m.id)).status,'success');assert.equal((w.c.blocks.get(w.c.a)!.content.match(/📄 更长的新版文件名/g)??[]).length,2);
    const {store}=await w.f.service.locate(m.id),record=await store.record(m.id);await store.update(m.id,r=>({...r,rename:{...r.rename!,status:'complete'}}));
    w.c.blocks.get(w.c.a)!.content=w.c.blocks.get(w.c.a)!.content.replace('📄 更长的新版文件名','自写概述');
    await w.f.service.renameLocal(m.id,'下一名称','rename-alias');assert.equal((await w.refs.sync(m.id)).status,'success');assert.match(w.c.blocks.get(w.c.a)!.content,/自写概述/);assert.match(w.c.blocks.get(w.c.a)!.content,/📄 下一名称/);
    assert.ok((await store.record(m.id)).references!.some(ref=>ref.mode==='alias'));assert.equal(record.references!.length,2);
  }finally{await w.cleanup();}
});

test('reply loss queries existing content Journal after reload and never duplicates imported file or source reference',async()=>{
  const w=await writingFixture();try{
    const m=await w.f.add(),target=await w.target(),port={...w.port,apply:async(p:Parameters<MaterialContentPort['apply']>[0])=>{await w.port.apply(p);throw Error('response lost');}},refs=new MaterialReferences(w.f.service,port);
    assert.equal((await refs.insert(m.id,target,'drop-loss')).status,'partial');const count=w.c.counts().inserts;
    const reloaded=new MaterialReferences(w.f.service,w.port);assert.equal((await reloaded.insert(m.id,target,'retry-loss')).status,'success');assert.equal(w.c.counts().inserts,count);
    assert.equal((await w.f.service.list()).length,1);
  }finally{await w.cleanup();}
});

test('metadata failure after physical rename leaves prepared evidence for reload recovery; denied IO never replays', async () => {
  const f = await fixture(); try {
    const m = await f.add(), move = f.io.rename, write = f.io.write;
    let moved = false, dispatched = 0;
    f.io.rename = async (from, to) => { await move(from, to); if (from === m.path) { moved = true; dispatched++; } };
    f.io.write = async (path, text) => { if (moved && path.includes('.longdoc')) throw Error('metadata interrupted'); await write(path, text); };
    const result = await f.service.renameLocal(m.id, '恢复后名称', 'metadata-failure'); assert.equal(result.status, 'partial');
    f.io.write = write;
    const {store} = await f.service.locate(m.id); assert.equal((await store.record(m.id)).rename!.status, 'prepared');
    assert.equal((await f.service.recoverRename(m.id)).status, 'success'); assert.equal(dispatched, 1);
    await store.update(m.id, r => ({...r, rename: {...r.rename!, status: 'complete'}}));
    f.io.rename = async (from, to) => { if (from === join(f.files, '恢复后名称.md')) { dispatched++; throw Error('EACCES'); } await move(from, to); };
    assert.equal((await f.service.renameLocal(m.id, '拒绝的名称', 'permission-failure')).status, 'partial');
    assert.equal((await f.service.recoverRename(m.id)).status, 'success'); assert.equal(dispatched, 2);
    assert.equal((await f.service.list('恢复后名称'))[0]!.id, m.id);
  } finally { await f.cleanup(); }
});

test('pending references do not freeze verified file renames or later external identity discovery', async () => {
  const f = await fixture(); try {
    const material = await f.add();
    assert.equal((await f.service.renameLocal(material.id, '第一名称', 'first')).status, 'success');
    assert.equal((await f.service.renameLocal(material.id, '第二名称', 'second')).status, 'success');
    await rename(join(f.files, '第二名称.md'), join(f.files, '外部名称.md'));
    const read = await f.service.read(material.id); assert.equal(read.title, '外部名称'); assert.equal(read.id, material.id);
    const list = await f.service.list('外部名称'); assert.equal(list.length, 1); assert.doesNotMatch(list[0]!.snippet, /暂不可用/);
  } finally { await f.cleanup(); }
});
