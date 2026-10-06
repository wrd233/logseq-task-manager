import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rename, stat, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {MaterialDirectories} from '../src/workspace/material-context.ts';
import type {FileIO} from '../src/host/file-io.ts';
import {MaterialService} from '../src/features/materials/service.ts';
import {MaterialStore, restoreCapture, versionOf} from '../src/features/materials/store.ts';
import type {Materials as MaterialsController} from '../src/features/materials/controller.ts';
import {contentFixture, deferred} from './fixtures/content-writeback.ts';

async function until(probe: () => boolean | Promise<boolean>, message: string): Promise<void> {
  const end = Date.now() + 6000; while (Date.now() < end) { if (await probe()) return; await delay(10); } assert.fail(message);
}
async function fixture(ui = false) {
  const c = ui ? await contentFixture() : null, root = await mkdtemp(join(tmpdir(), 'materials-drawer-')), globalRoot = join(root, 'default'); await mkdir(globalRoot);
  const io: FileIO = {read: path => readFile(path, 'utf8'), write: (path, text) => writeFile(path, text), mkdir: async path => {await mkdir(path, {recursive: true});}, rename, list: readdir, copy: (from, to) => copyFile(from, to, 1), writeBytes: (path, bytes) => writeFile(path, new Uint8Array(bytes)), stat: async path => {const s = await stat(path); return {type: s.isDirectory() ? 'directory' : 'file', size: s.size};}, identity: async path => {const s = await stat(path); return JSON.stringify([s.dev, s.ino, s.birthtimeMs]);}};
  const values = new Map<string,string>();
  const storage = c?.browser.localStorage ?? {get length() {return values.size;}, key: (i: number) => [...values.keys()][i] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}, removeItem: (key: string) => {values.delete(key);}};
  const directories = new MaterialDirectories(storage), graph = ui ? (await logseq.App.getCurrentGraph())!.path! : join(root, 'graph');
  const service = new MaterialService(io, directories, graph, globalRoot, text => text);
  const context = (sourceUuid = 'A', directory: string | null = null) => ({graph, sourceUuid, ownerUuid: sourceUuid, directory, organization: 'flat' as const});
  let selected: string | null = null, pickerCount = 0, copyHook: (() => Promise<void>) | null = null;
  let materials: MaterialsController | null = null;
  if (c) {
    logseq.settings!.materialsDirectory = globalRoot;
    Object.assign(c.browser, {apis: {openPath: async () => '', doAction: async (args: unknown[]) => {
      const [op, ...p] = args;
      if (op === 'openDialog') {pickerCount++; return selected;}
      if (op === 'readFile') return io.read(String(p[0]));
      if (op === 'writeFile') return typeof p[2] === 'string' ? io.write(String(p[1]), p[2]) : io.writeBytes!(String(p[1]), p[2] as ArrayBuffer);
      if (op === 'mkdir-recur') return io.mkdir(String(p[0]));
      if (op === 'rename') return io.rename(String(p[0]), String(p[1]));
      if (op === 'copyDirectory') {await copyHook?.(); return io.copy!(String(p[0]), String(p[1]));}
      if (op === 'listdir') return readdir(String(p[0]));
      if (op === 'stat') {const s = await stat(String(p[0])); return {mode: s.mode, size: s.size, dev: s.dev, ino: s.ino, birthtimeMs: s.birthtimeMs};}
      throw Error(`unsupported ${op}`);
    }}});
    const {Materials} = await import('../src/features/materials/controller.ts'); materials = new Materials(undefined, () => c.root);
  }
  const file = async (path: string) => {const f = new c!.browser.File([await readFile(path)], path.split('/').at(-1)!); Object.defineProperty(f, 'path', {value: path}); return f as unknown as File;};
  const drop = (files: File[]) => {const event = new c!.browser.Event('drop', {bubbles: true, cancelable: true}); Object.defineProperty(event, 'dataTransfer', {value: {types: ['Files'], files, getData: () => ''}}); materials!.panel.root.querySelector('[data-material-drop-list]')!.dispatchEvent(event as unknown as Event);};
  const button = (text: string) => Array.from(materials!.panel.root.querySelectorAll('button')).find(item => item.textContent === text)!;
  return {root, globalRoot, io, storage, directories, graph, service, context, c, materials, file, drop, button, choose: (path: string | null) => {selected = path;}, pickerCount: () => pickerCount, copying: (hook: typeof copyHook) => {copyHook = hook;}, cleanup: async () => {materials?.dispose(); await c?.cleanup(); await rm(root, {recursive: true, force: true});}};
}

test('unbound works get exclusive lazy folders; multiple destinations persist separately from primary workspace identity and old links', async () => {
  const f = await fixture(); try {
    assert.deepEqual(await readdir(f.globalRoot), []);
    const a = await f.service.capture({requestKey: 'a', text: '# A 文档'}, f.context('A'));
    const b = await f.service.capture({requestKey: 'b', text: '# B 文档'}, f.context('B'));
    assert.equal(a.material.recordRoot, join(f.globalRoot, 'workspaces/A')); assert.equal(b.material.recordRoot, join(f.globalRoot, 'workspaces/B'));
    const extra = join(f.root, 'explicit'); await mkdir(extra);
    f.directories.bind({...f.context('A'), directory: a.material.recordRoot});
    f.directories.addFolder(f.graph, 'A', {directory: extra, organization: 'flat'}); f.directories.selectDefault(f.graph, 'A', extra);
    const reload = new MaterialDirectories(f.storage); assert.equal(reload.folders(f.graph, 'A').length, 2); assert.equal(reload.defaultFolder(f.graph, 'A')!.directory, extra);
    assert.equal(reload.binding(f.graph, 'A')!.directory, a.material.recordRoot);
    const next = await f.service.capture({requestKey: 'next', text: '新文件'}, f.context('A')); assert.equal(next.material.recordRoot, extra);
    assert.equal((await f.service.capture({requestKey:'a',text:'# A 文档'},f.context('A',extra))).material.id,a.material.id);
    assert.equal((await f.service.read(a.material.id)).path, a.material.path);
    f.directories.removeFolder(f.graph, 'A', extra); assert.equal((await f.service.read(next.material.id)).availability, 'available');
    const global = await f.service.capture({requestKey: 'global', text: '无工作归属'}, {graph: f.graph, sourceUuid: null, directory: null, organization: 'flat'}); assert.equal(global.material.recordRoot, f.globalRoot);
    const legacy=await new MaterialStore(f.io,f.globalRoot).create('旧请求',{graph:f.graph,role:'input',requestKey:'legacy',requestFingerprint:await versionOf(JSON.stringify({text:'旧请求',html:'',title:'',role:'input',source:null,directory:null,organization:'flat'}))});
    assert.equal((await f.service.capture({requestKey:'legacy',text:'旧请求'},{graph:f.graph,sourceUuid:null,directory:null,organization:'flat'})).material.id,legacy.id);
  } finally {await f.cleanup();}
});

test('imports preserve exact binary bytes, readable names, collision protection, original files and default read-only permissions', async () => {
  const f = await fixture(); try {
    const source = join(f.root, '资料.pdf'), bytes = Buffer.from([0,255,128,10,37,80,68,70]); await writeFile(source, bytes);
    const a = await f.service.importFile({name: '资料.pdf', path: source}, f.context(), 'first');
    assert.equal(a.material.path, join(f.globalRoot, 'workspaces/A/资料.pdf')); assert.equal(a.material.origin, 'import');
    assert.deepEqual(await readFile(a.material.path), bytes); assert.deepEqual(await readFile(source), bytes); assert.deepEqual(a.material.capabilities.edit, {user: false, agent: false});
    const b = await f.service.importFile({name: '资料.pdf', path: source}, f.context(), 'second'); assert.match(b.material.path, /资料-[a-f0-9]{8}\.pdf$/); assert.notEqual(a.material.id, b.material.id);
    const browser = await f.service.importFile({name: '无宿主路径.png', bytes: Uint8Array.from(bytes).buffer}, f.context(), 'browser'); assert.deepEqual(await readFile(browser.material.path), bytes);
    assert.equal((await f.service.list('', 'B')).length, 0);
  } finally {await f.cleanup();}
});

test('concurrent and recovered imports reuse one identity; completed copy with failed record save is found and retried without recopying', async () => {
  const f = await fixture(); try {
    const source = join(f.root, '导入.md'); await writeFile(source, '# 原件'); let copies = 0;
    const originalCopy = f.io.copy!; f.io.copy = async (...args) => {copies++; await originalCopy(...args);};
    const [a,b,c] = await Promise.all(Array.from({length:3},()=>f.service.importFile({name: '导入.md', path: source}, f.context(), 'same'))); assert.equal(a!.material.id,b!.material.id); assert.equal(a!.material.id,c!.material.id); assert.equal(copies,1);
    const prepared=f.directories.defaultFolder(f.graph,'A')!.directory;
    assert.equal((await f.service.importFile({name:'导入.md',path:source},f.context('A',prepared),'same')).material.id,a!.material.id);
    const alternate=join(f.root,'其他默认');await mkdir(alternate);f.directories.addFolder(f.graph,'A',{directory:alternate,organization:'flat'},true);
    assert.equal((await f.service.importFile({name:'导入.md',path:source},f.context('A',alternate),'same')).material.path,a!.material.path);
    const originalRename = f.io.rename; let fail = true;
    f.io.rename = async (from,to) => {if (fail && /\.longdoc\/[a-f0-9-]{36}\.json$/u.test(to)) {fail = false; throw Error('record disk full');} await originalRename(from,to);};
    await assert.rejects(f.service.importFile({name: '导入.md', path: source}, f.context(), 'retry'), /record disk full/);
    const before = copies, retried = await f.service.importFile({name: '导入.md', path: source}, f.context(), 'retry'); assert.equal(copies,before); assert.equal(retried.material.content,'# 原件');
    const reloaded = new MaterialService(f.io,new MaterialDirectories(f.storage),f.graph,f.globalRoot,text=>text);
    assert.equal((await reloaded.importFile({name:'导入.md',path:source},f.context(),'retry')).material.id,retried.material.id);
    assert.equal((await f.service.list()).length,2);
  } finally {await f.cleanup();}
});

test('an unavailable explicit destination never falls back; native and browser folders preserve structure and reuse records on retry', async () => {
  const f = await fixture(); try {
    const source = join(f.root,'资料夹'); await mkdir(join(source,'子目录'),{recursive:true}); await writeFile(join(source,'子目录','原文.md'),'# 原文'); await writeFile(join(source,'图.png'),Buffer.from([0,255,7]));
    const invalid = join(f.root,'missing'); f.directories.addFolder(f.graph,'A',{directory:invalid,organization:'flat'},true);
    await assert.rejects(f.service.importFile({name:'图.png',path:join(source,'图.png')},f.context(),'bad'),/目录暂不可用/); assert.deepEqual(await readdir(f.globalRoot),[]);
    f.directories.removeFolder(f.graph,'A',invalid);
    const folder = await f.service.importDirectory(source,f.context(),'folder'); assert.equal(folder.problems.length,0); assert.equal(folder.materials.length,2);
    assert.ok(folder.materials.some(result=>result.material.path.endsWith('/资料夹/子目录/原文.md')));
    assert.deepEqual(await readFile(folder.materials.find(result=>result.material.path.endsWith('.png'))!.material.path),Buffer.from([0,255,7]));
    const again = await f.service.importDirectory(source,f.context(),'folder'); assert.deepEqual(again.materials.map(result=>result.material.id).sort(),folder.materials.map(result=>result.material.id).sort());
    const web = await f.service.importFolderBytes('浏览器目录',[{relative:'子目录/笔记.md',bytes:()=>Promise.resolve(new TextEncoder().encode('浏览器原文').buffer)}],f.context(),'web-folder'); assert.equal(web.problems.length,0); assert.ok(web.materials[0]!.material.path.endsWith('/浏览器目录/子目录/笔记.md'));
    const unsafe = await f.service.importFolderBytes('目录',[{relative:'../越界.md',bytes:new ArrayBuffer(0)}],f.context(),'unsafe'); assert.equal(unsafe.materials.length,0); assert.equal(unsafe.problems.length,1);
  } finally {await f.cleanup();}
});

test('directory plus opens the real host picker, permits cancel and multiple bindings, and default selection affects only new files', async () => {
  const f = await fixture(true); try {
    await f.materials!.library(f.c!.root,'','folders'); assert.equal(f.pickerCount(),0);
    assert.equal(f.materials!.panel.root.querySelectorAll('input[type=radio]').length,1);
    f.choose(null); f.button('添加目录').click(); await until(()=>f.pickerCount()===1,'picker cancellation'); assert.equal(f.materials!.panel.root.querySelectorAll('input[type=radio]').length,1);
    const extra = join(f.root,'选择目录'); await mkdir(extra); await writeFile(join(extra,'已有参考.md'),'# 已有参考'); f.choose(extra); f.button('添加目录').click();
    await until(()=>f.materials!.panel.root.querySelectorAll('input[type=radio]').length===2,'second folder rendered');
    const listed = await f.materials!.listMaterials(f.c!.root); assert.equal(listed.materials[0]!.path,join(extra,'已有参考.md')); assert.deepEqual(listed.materials[0]!.capabilities.edit,{user:false,agent:false});
    const radio = f.materials!.panel.root.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!; radio.checked=true; radio.dispatchEvent(new f.c!.browser.Event('change') as unknown as Event);
    await until(()=>!radio.isConnected && f.materials!.panel.root.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]?.checked===true,'default choice');
    const saved = await f.materials!.capture({requestKey:'named',text:'生成的材料',sourceUuid:f.c!.root},'user'); assert.equal(saved.material.recordRoot,extra);
    await f.materials!.library(f.c!.root); assert.equal(f.materials!.panel.root.querySelector('input[type=search]'),null); assert.equal(f.button('加入材料'),undefined); assert.equal(f.button('收纳文本'),undefined);
    assert.equal((await f.materials!.readMaterial(listed.materials[0]!.id)).path,join(extra,'已有参考.md'));
  } finally {await f.cleanup();}
});

test('host recursive file-only listings preserve nested imports and explicit directory registration', async () => {
  const f = await fixture(); try {
    const source=join(f.root,'宿主文件夹'); await mkdir(join(source,'子目录'),{recursive:true}); await mkdir(join(source,'.longdoc'));
    await writeFile(join(source,'子目录','资料.md'),'# 嵌套正文'); await writeFile(join(source,'图片.png'),Buffer.from([0,255,3])); await writeFile(join(source,'.longdoc','旧记录.json'),'{}');
    const list=f.io.list;
    const flat=async(directory:string):Promise<string[]> => (await Promise.all((await readdir(directory)).map(async name=>{const path=join(directory,name); return (await stat(path)).isDirectory()?flat(path):[path];}))).flat();
    f.io.list=directory=>directory===source?flat(directory):list(directory);
    const result=await f.service.importDirectory(source,f.context(),'host-folder'); assert.equal(result.problems.length,0); assert.equal(result.materials.length,2);
    const material=result.materials.find(item=>item.material.title==='资料')!.material;
    assert.equal(material.path,join(f.globalRoot,'workspaces/A/宿主文件夹/子目录/资料.md')); assert.equal(await readFile(material.path,'utf8'),'# 嵌套正文');
    const registered=await f.service.refreshFolder(source,f.context('B',source)); assert.equal(registered.length,0);
    const originals=await f.service.list('','B'); assert.equal(originals.length,2); assert.ok(originals.some(item=>item.path===join(source,'子目录','资料.md')));
  } finally {await f.cleanup();}
});

test('drop shows file name immediately, keeps a failed row retryable and copies links synchronously in the user click', async () => {
  const f = await fixture(true); try {
    const source=join(f.root,'等待.md');await writeFile(source,'# 等待');await f.materials!.library(f.c!.root);
    const gate=deferred<void>(),entered=deferred<void>();f.copying(async()=>{entered.resolve();await gate.promise;});
    f.drop([await f.file(source)]); assert.match(f.materials!.panel.root.querySelector('.wb-material-import-row')!.textContent!,/等待.md.*等待加入/);
    await entered.promise; assert.match(f.materials!.panel.root.querySelector('.wb-material-import-row')!.textContent!,/正在加入/);
    gate.reject(Error('copy permission'));await until(()=>f.materials!.panel.root.querySelector('[data-import-state=failed]')!==null,'failed row');
    f.copying(null);f.button('重试').click();await until(()=>!!f.materials!.panel.root.querySelector('.wb-material'),'retry produces actual row');assert.equal((await f.materials!.listMaterials(f.c!.root)).materials.length,1);
    let clipboard='';Object.defineProperty(f.c!.browser.document,'execCommand',{configurable:true,value:(command:string)=>{assert.equal(command,'copy');clipboard=f.c!.browser.document.querySelector('textarea')!.value;return true;}});
    f.button('复制链接').click();assert.match(clipboard,/longdoc:\/\/[a-f0-9-]{36}/);await until(()=>f.materials!.panel.root.textContent!.includes('已复制'),'copy acknowledgment');assert.equal(f.materials!.panel.root.querySelector('textarea'),null);
    assert.equal(await readFile(source,'utf8'),'# 等待');assert.equal(f.c!.counts().inserts,0);
  } finally {await f.cleanup();}
});

test('native long paste remains native until confirmed: cancel leaves text, naming stores the original and replaces only the pasted range', async () => {
  const f = await fixture(true); try {
    await f.materials!.library(f.c!.root); logseq.settings!.materialsAutoCapture=true;
    const block=document.createElement('div');block.className='ls-block';block.setAttribute('blockid',f.c!.root);
    const editor=document.createElement('div');editor.className='block-editor';const input=document.createElement('textarea');editor.append(input);block.append(editor);document.body.append(block); f.c!.blocks.get(f.c!.root)!.properties.id=f.c!.root;
    const plain='长文本原文。\n'.repeat(300);
    const paste=()=>{input.value='前后';input.setSelectionRange(1,1);input.focus();const event=new f.c!.browser.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[],types:['text/plain'],getData:(kind:string)=>kind==='text/plain'?plain:''}});input.dispatchEvent(event as unknown as Event);assert.equal(event.defaultPrevented,false);input.value='前'+plain+'后';};
    paste();await until(()=>!!document.querySelector('dialog'),'cancel decision');Array.from(document.querySelectorAll<HTMLButtonElement>('dialog button')).find(item=>item.textContent==='保留原文')!.click();await delay(10);assert.equal(input.value,'前'+plain+'后');assert.equal((await f.materials!.listMaterials()).materials.length,0);
    paste();await until(()=>!!document.querySelector('dialog'),'capture decision');document.querySelector<HTMLInputElement>('dialog input')!.value='我的长文';
    Object.defineProperty(f.c!.browser.document,'execCommand',{configurable:true,value:(command:string,_ui:boolean,text:string)=>{assert.equal(command,'insertText');input.value=input.value.slice(0,input.selectionStart)+text+input.value.slice(input.selectionEnd);return true;}});
    const outside=()=>input.remove();window.addEventListener('mousedown',outside);
    document.querySelector('dialog button[type=submit]')!.dispatchEvent(new f.c!.browser.Event('mousedown',{bubbles:true}) as unknown as Event); assert.equal(input.isConnected,true);window.removeEventListener('mousedown',outside);
    document.querySelector('dialog form')!.dispatchEvent(new f.c!.browser.Event('submit',{bubbles:true,cancelable:true}) as unknown as Event);
    await until(()=>!document.querySelector('dialog'),'confirmed capture complete');const material=(await f.materials!.listMaterials(f.c!.root)).materials[0]!;assert.equal(material.title,'我的长文');assert.equal(material.content,plain);assert.equal(input.value,'前'+material.reference+'后');assert.equal(material.recordRoot,join(f.globalRoot,'workspaces',f.c!.root));
    const record=await new MaterialStore(f.io,material.recordRoot).record(material.id);assert.equal(restoreCapture('前'+material.reference.replace('我的长文','改过的标题')+'后',record),'前'+plain+'后');
  } finally {await f.cleanup();}
});
