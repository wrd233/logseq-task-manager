import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rename,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {contentFixture} from './fixtures/content-writeback.ts';
import {Materials} from '../src/features/materials/controller.ts';
import {installMaterialTransfers} from '../src/features/materials/install-transfer.ts';
import {installContentWriteback} from '../src/features/content-writeback/installer.ts';
import {MATERIAL_MIME} from '../src/features/materials/drop.ts';

async function until(probe: () => boolean | Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { if (await probe()) return; await delay(20); }
  assert.fail(`Timed out: ${description}`);
}

async function fixture(){
  const c=await contentFixture(),root=await mkdtemp(join(tmpdir(),'materials-drop-ui-')),work=join(root,'work');await mkdir(work);logseq.settings!.materialsDirectory=work;
  const apis={openPath:async()=>{},doAction:async(args:unknown[])=>{const[op,...p]=args as string[];if(op==='readFile')return readFile(p[0]!,'utf8');if(op==='writeFile')return writeFile(p[1]!,p[2]!);if(op==='mkdir-recur')return mkdir(p[0]!,{recursive:true});if(op==='rename')return rename(p[0]!,p[1]!);if(op==='listdir')return readdir(p[0]!);if(op==='stat'){const s=await stat(p[0]!);return{mode:s.mode,size:s.size,dev:s.dev,ino:s.ino,birthtimeMs:s.birthtimeMs};}throw Error('unsupported');}};
  Object.assign(c.browser,{apis});
  const content=installContentWriteback({adapter:c.adapter});await content.local.authorize(c.root);
  let view:{graph:string;root:string;draft:string|null;blocks:Array<{uuid:string;content:string|null}>}={graph:c.scope.graphId,root:c.root,draft:null,blocks:(await content.api.read()).blocks.map(b=>({uuid:b.target.blockUuid,content:b.content}))};
  const materials=new Materials(undefined,()=>c.root);
  const source={read:async(scope:typeof c.scope)=>{assert.deepEqual(scope,c.scope);return content.api.read(scope);}};
  installMaterialTransfers(materials,content,source,{snapshot:()=>view});
  const find=(text:string)=>Array.from(materials.panel.root.querySelectorAll('button')).find(b=>b.textContent===text)!;
  const drop=(target:HTMLElement,data:{types:string[];files?:File[];internal?:string})=>{
    const event=new c.browser.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{types:data.types,files:data.files??[],getData:(type:string)=>type===MATERIAL_MIME?data.internal??'':''}});target.dispatchEvent(event as unknown as Event);
  };
  return{c,content,materials,root,work,find,drop,setView:(next:typeof view)=>{view=next;},cleanup:async()=>{materials.dispose();content.dispose();await c.cleanup();await rm(root,{recursive:true,force:true});}};
}

test('real composition wiring: simulated list drop changes no source; report body drop uses committed membership and Journal; copying failure exposes selectable link',async()=>{
  const f=await fixture();try{
    const path=join(f.work,'有 空格资料.md'),body='# 内文标题\n\n原始资料';await writeFile(path,body);await f.materials.library(f.c.root);
    const file=new f.c.browser.File([body],'有 空格资料.md');Object.defineProperty(file,'path',{value:path});
    const before=f.c.counts().inserts;
    f.drop(f.materials.panel.root.querySelector('[data-material-drop-list]')!,{types:['Files'],files:[file as unknown as File]});await until(() => !!f.materials.panel.root.querySelector('.wb-material'), 'list association and rendered row');
    let list=await f.materials.listMaterials(f.c.root);assert.equal(list.materials.length,1);assert.equal(f.c.counts().inserts,before);assert.equal(list.materials[0]!.path,path);assert.equal(list.materials[0]!.title,'有 空格资料');
    f.find('复制链接').click();await delay(30);const selectable=f.materials.panel.root.querySelector<HTMLTextAreaElement>('textarea[aria-label="材料链接"]')!;assert.equal(selectable.value,list.materials[0]!.reference);assert.match(f.materials.panel.root.textContent!,/复制未完成/);
    const row=document.createElement('article');row.className='wb-row';row.dataset.uuid=f.c.a;const paragraph=document.createElement('div');paragraph.className='wb-body';row.append(paragraph);document.body.append(row);
    f.drop(paragraph,{types:['Files'],files:[file as unknown as File]});await until(() => f.c.counts().inserts === before + 1, 'report child dispatch');
    list=await f.materials.listMaterials(f.c.root);assert.equal(list.materials.length,1);assert.equal(f.c.counts().inserts,before+1);
    const record=(await f.materials.readMaterial(list.materials[0]!.id));assert.equal(record.id,list.materials[0]!.id);assert.equal(await readFile(path,'utf8'),body);
    f.drop(paragraph,{types:[MATERIAL_MIME],internal:JSON.stringify({schemaVersion:1,materialId:record.id,scope:f.c.scope})});await delay(100);assert.equal(f.c.counts().inserts,before+1);
    f.drop(paragraph,{types:[MATERIAL_MIME],internal:JSON.stringify({schemaVersion:1,materialId:record.id,scope:{...f.c.scope,graphId:'other'}})});await delay(60);assert.equal(f.c.counts().inserts,before+1);
    row.classList.add('wb-review-history');f.drop(paragraph,{types:['Files'],files:[file as unknown as File]});await delay(60);assert.equal(f.c.counts().inserts,before+1);assert.match(f.c.messages.join(' '),/可靠原文映射/);
  }finally{await f.cleanup();}
});

test('list rename uses actual file IO and returns compact success; pending native input and stale report pixels do not invent a write target',async()=>{
  const f=await fixture();try{
    const path=join(f.work,'旧名称.md'),body='unchanged';await writeFile(path,body);await f.materials.library(f.c.root);
    const file=new f.c.browser.File([body],'旧名称.md');Object.defineProperty(file,'path',{value:path});f.drop(f.materials.panel.root.querySelector('[data-material-drop-list]')!,{types:['Files'],files:[file as unknown as File]});await until(() => !!f.materials.panel.root.querySelector('.wb-material'), 'rename fixture association');
    const first=(await f.materials.listMaterials(f.c.root)).materials[0]!;
    f.find('改文件名').click();await delay(30);const input=f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="文件名称（保留扩展名）"]')!;input.value='新名称';f.find('保存').click();await until(async () => (await f.materials.readMaterial(first.id)).path === join(f.work,'新名称.md'), 'rename record verified');
    const renamed=await f.materials.readMaterial(first.id);assert.equal(renamed.path,join(f.work,'新名称.md'));assert.equal(await readFile(renamed.path,'utf8'),body);assert.equal(renamed.id,first.id);
    const row=document.createElement('article');row.className='wb-row';row.dataset.uuid=f.c.a;const paragraph=document.createElement('div');paragraph.className='wb-body';row.append(paragraph);document.body.append(row);
    const snap=await f.content.api.read();f.setView({graph:f.c.scope.graphId,root:f.c.root,draft:null,blocks:snap.blocks.map(b=>({uuid:b.target.blockUuid,content:b.target.blockUuid===f.c.a?'stale displayed text':b.content}))});
    f.drop(paragraph,{types:[MATERIAL_MIME],internal:JSON.stringify({schemaVersion:1,materialId:first.id,scope:f.c.scope})});await delay(60);assert.equal(f.c.counts().inserts,0);
    f.setView({graph:f.c.scope.graphId,root:f.c.root,draft:f.c.a,blocks:snap.blocks.map(b=>({uuid:b.target.blockUuid,content:b.content}))});
    f.drop(paragraph,{types:[MATERIAL_MIME],internal:JSON.stringify({schemaVersion:1,materialId:first.id,scope:f.c.scope})});await delay(60);assert.equal(f.c.counts().inserts,0);
  }finally{await f.cleanup();}
});

test('a work switch during real file registration retains the association but inserts no late source reference', async () => {
  const f = await fixture(); try {
    const path = join(f.work, '晚到文件.md'), body = 'late original'; await writeFile(path, body);
    await f.materials.library(f.c.root);
    const row = document.createElement('article'); row.className = 'wb-row'; row.dataset.uuid = f.c.a;
    const paragraph = document.createElement('div'); paragraph.className = 'wb-body'; row.append(paragraph); document.body.append(row);
    const apis = (f.c.browser as unknown as {apis: {doAction: (args: unknown[]) => Promise<unknown>}}).apis;
    const call = apis.doAction;
    let release!: () => void, reached!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    let first = true;
    apis.doAction = async args => { if (first && args[0] === 'stat' && args[1] === path) { first = false; reached(); await blocked; } return call(args); };
    const file = new f.c.browser.File([body], '晚到文件.md'); Object.defineProperty(file, 'path', {value: path});
    f.drop(paragraph, {types: ['Files'], files: [file as unknown as File]}); await entered;
    f.setView({graph: f.c.scope.graphId, root: crypto.randomUUID(), draft: null, blocks: []}); release(); await delay(150);
    assert.equal(f.c.counts().inserts, 0);
    assert.equal((await f.materials.listMaterials(f.c.root)).materials.length, 1);
    assert.equal(await readFile(path, 'utf8'), body);
    assert.match(f.c.messages.join(' '), /工作或原生输入已变化/);
    assert.ok(row.querySelector('[data-material-continuation]'));
  } finally { await f.cleanup(); }
});

test('copied reference proof survives panel navigation, observes a simulated committed native paste, and never writes source or consumes composition', async () => {
  const f = await fixture(), previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); try {
    let copied = '';
    Object.defineProperty(f.c.browser.navigator, 'clipboard', {configurable: true, value: {writeText: async (text: string) => {copied = text;}}});
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: f.c.browser.navigator});
    const path = join(f.work, '粘贴证据.md'); await writeFile(path, 'original'); await f.materials.library(f.c.root);
    const file = new f.c.browser.File(['original'], '粘贴证据.md'); Object.defineProperty(file, 'path', {value: path});
    f.drop(f.materials.panel.root.querySelector('[data-material-drop-list]')!, {types: ['Files'], files: [file as unknown as File]}); await until(() => !!f.materials.panel.root.querySelector('.wb-material'), 'paste fixture association');
    const material = (await f.materials.listMaterials(f.c.root)).materials[0]!;
    f.find('复制链接').click(); await delay(30); assert.equal(copied, material.reference);
    await f.materials.library(); // Navigation changes the panel epoch, not copied source proof.
    const block = document.createElement('div'); block.className = 'ls-block'; block.setAttribute('blockid', f.c.a);
    const editor = document.createElement('div'); editor.className = 'block-editor'; const input = document.createElement('textarea'); editor.append(input); block.append(editor); document.body.append(block);
    input.value = '前言 '; input.setSelectionRange(input.value.length, input.value.length);
    const paste = () => {const event = new f.c.browser.Event('paste', {bubbles: true, cancelable: true}); Object.defineProperty(event, 'clipboardData', {value: {getData: () => copied}}); input.dispatchEvent(event as unknown as Event); return event;};
    const before = f.c.counts().writes;
    input.dispatchEvent(new f.c.browser.Event('compositionstart', {bubbles: true}) as unknown as Event);
    assert.equal(paste().defaultPrevented, false); await delay(30);
    assert.equal(JSON.parse(await readFile(join(f.work, '.longdoc', `${material.id}.json`), 'utf8')).references, undefined);
    input.dispatchEvent(new f.c.browser.Event('compositionend', {bubbles: true}) as unknown as Event);
    assert.equal(paste().defaultPrevented, false);
    f.c.blocks.get(f.c.a)!.content = `前言 ${copied}`;
    await until(async () => !!JSON.parse(await readFile(join(f.work, '.longdoc', `${material.id}.json`), 'utf8')).references?.length, 'committed paste proof');
    const record = JSON.parse(await readFile(join(f.work, '.longdoc', `${material.id}.json`), 'utf8'));
    assert.equal(record.references[0].mode, 'follow-filename'); assert.equal(record.references[0].start, 3);
    assert.equal(f.c.counts().writes, before);
  } finally {if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else Reflect.deleteProperty(globalThis, 'navigator'); await f.cleanup();}
});
