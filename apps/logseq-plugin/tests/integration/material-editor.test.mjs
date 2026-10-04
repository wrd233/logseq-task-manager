import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { setTimeout as delay } from 'node:timers/promises';
import { deferred } from '../fixtures/work-view.mjs';

async function fixture() {
  const browser = new Window({ url: 'http://localhost/plugin/' });
  globalThis.window = browser; globalThis.document = browser.document; globalThis.localStorage = browser.localStorage; globalThis.location = browser.location;
  let graph = '/A', changed, editor, input, creates = 0, sets = 0, destroyed = 0, readCount = 0, intercept = null;
  const directories = new Set(['/projects/A', '/projects/B']);
  const blocks = new Map(['source', 'projectA', 'projectB', 'elsewhere'].map(uuid => [uuid, {uuid, content: 'TODO 工作', properties: {id: uuid}, parent: {id: 99}, page: {id: 99}, children: []}]));
  let returned = null, rejectInsertion = false;
  const commands = new Map();
  const files = new Map(), writes = [], intervals = new Map(), timeouts = new Map(); let timer = 0;
  browser.setInterval = fn => { const id = ++timer; intervals.set(id, fn); return id; }; browser.clearInterval = id => intervals.delete(id);
  browser.setTimeout = fn => { const id = ++timer; timeouts.set(id, fn); return id; }; browser.clearTimeout = id => timeouts.delete(id);
  browser.apis = { doAction: async ([op, ...args]) => {
    if (op === 'readFile') { readCount++; if (!files.has(args[0])) throw Error('ENOENT'); return files.get(args[0]); }
    if (op === 'writeFile') { writes.push({ graph: args[0], path: args[1] }); if (intercept) await intercept(args[1]); files.set(args[1], args[2]); return; }
    if (op === 'mkdir-recur') return;
    if (op === 'stat') { if (files.has(args[0])) return {mode: 0o100644, size: 1}; if (directories.has(args[0]) || [...files.keys()].some(path => path.startsWith(args[0] + '/'))) return {mode: 0o040755, size: 0}; throw Error('ENOENT'); }
    if (op === 'rename') { files.set(args[1], files.get(args[0])); files.delete(args[0]); return; }
    if (op === 'listdir') return [...files.keys()].filter(path => path.startsWith(args[0] + '/'));
    throw Error('unsupported fixture bridge');
  }, openPath: async () => {} };
  const rememberEditor = value => { editor = value; };
  browser.Vditor = class {
    constructor(root, options) { creates++; this.value = options.value; this.root = root; this.control = browser.document.createElement('textarea'); root.append(this.control); rememberEditor(this); input = options.input; globalThis.queueMicrotask(options.after); }
    getValue() { assert.equal(this.dead, undefined); return this.value; }
    setValue(value) { sets++; this.value = value; }
    destroy() { destroyed++; this.dead = true; this.root.replaceChildren(); }
  };
  globalThis.logseq = {
    settings: { materialsDirectory: '/materialsA' },
    App: { getCurrentGraph: async () => ({ path: graph }), registerCommandPalette: (spec, action) => commands.set(spec.key,action), onCurrentGraphChanged: fn => { changed = fn; return () => { changed = null; }; } },
    Editor: { getCurrentBlock: async () => blocks.get('source'), getBlock: async uuid => blocks.get(uuid), upsertBlockProperty: async (uuid, key, value) => {blocks.get(uuid).properties[key] = value;}, insertBlock: async (uuid, content) => {if(rejectInsertion)throw Error('insertion failed');const child={uuid:crypto.randomUUID(),content,properties:{}};blocks.get(uuid).children.push(child);blocks.set(child.uuid,child);return child;}, checkEditing: async () => false },
    UI: { showMsg: async () => {} }, showMainUI: () => {}, hideMainUI: () => {}, setMainUIInlineStyle: () => {},
  };
  const { MaterialStore } = await import('../../src/features/materials/store.ts');
  const { Materials } = await import('../../src/features/materials/controller.ts');
  const io = { read: async path => {if (!files.has(path)) throw Error('ENOENT'); return files.get(path);}, write: async (path, text) => { files.set(path, text); }, mkdir: async () => {}, rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); }, list: async path => [...files.keys()].filter(file => file.startsWith(path + '/')) };
  const a = new MaterialStore(io, '/materialsA'), b = new MaterialStore(io, '/materialsB');
  const docA = await a.create('base A', { graph: '/A', sourceUuid: 'source' }), docB = await b.create('base B', { graph: '/B', sourceUuid: 'source' });
  const materials = new Materials(async uuid => {returned = uuid;});
  return {
    browser, materials, files, a, b, docA, docB, writes, blocks, commands,
    get returned() {return returned;}, rejectInsertion: value => {rejectInsertion = value;},
    get editor() { return editor; }, counts: () => ({ creates, sets, destroyed, readCount, saves: timeouts.size }),
    input: text => { editor.value = text; input(); },
    composition: type => materials.panel.root.querySelector('.wb-editor').dispatchEvent(new browser.Event(type, { bubbles: true })),
    tick: async () => { for (const fn of intervals.values()) fn(); await delay(10); },
    saveTimers: async () => { const callbacks = [...timeouts.values()]; timeouts.clear(); for (const fn of callbacks) fn(); await delay(10); },
    switchGraph: name => { graph = `/${name}`; globalThis.logseq.settings.materialsDirectory = `/materials${name}`; changed?.(); },
    intercept: fn => { intercept = fn; },
    close: async () => { materials.dispose(); await delay(10); await browser.happyDOM.abort(); delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; delete globalThis.location; delete globalThis.logseq; },
  };
}

test('offline directory preview leaves identity, source and editing permission untouched until explicit association', async () => {
  const f = await fixture();
  try {
    const path='/projects/A/协作参考.md', text='# 协作参考\n\n只读文件先阅读，再选择关联。';
    f.files.set(path,text); await f.materials.bindDirectory('projectA','/projects/A'); await f.materials.library('projectA');
    const find=label=>[...f.materials.panel.root.querySelectorAll('button')].find(b=>b.textContent===label);
    assert.ok(find('目录文件')); assert.ok(find('返回工作'));
    find('目录文件').click(); await delay(30); const writes=f.writes.length;
    assert.match(f.materials.panel.root.textContent,/尚未关联/);
    find('阅读').click(); await delay(30);
    assert.equal(f.materials.panel.root.querySelector('.wb-reading h1').textContent,'协作参考');
    assert.equal(f.writes.length,writes); assert.equal(f.blocks.get('projectA').children.length,0);
    assert.equal(find('编辑原文件'),undefined); assert.equal(f.files.get(path),text);
    find('关联当前工作').click(); await delay(60);
    const rows=await f.materials.listMaterials('projectA'); assert.equal(rows.materials.length,1);
    assert.deepEqual(rows.materials[0].capabilities.edit,{user:false,agent:false});
    assert.equal(rows.materials[0].path,path); assert.equal(f.files.get(path),text); assert.equal(f.blocks.get('projectA').children.length,1);
    await f.materials.library('projectA'); find('目录文件').click(); await delay(30);
    assert.match(f.materials.panel.root.textContent,/已关联材料/); assert.equal(find('关联'),undefined);
  } finally {await f.close();}
});

test('offline directory reads an existing captured output through its original identity and permissions', async () => {
  const f=await fixture();
  try {
    const store=new f.a.constructor(f.a.io,'/projects/A');
    const output=await store.create('# 协作说明\n\n保留原材料身份。',{graph:'/A',sourceUuid:'projectA',role:'output'});
    await f.materials.bindDirectory('projectA','/projects/A');await f.materials.library('projectA');
    const find=label=>[...f.materials.panel.root.querySelectorAll('button')].find(b=>b.textContent===label);
    const before=await f.materials.listMaterials('projectA');
    find('目录文件').click();await delay(30);
    assert.match(f.materials.panel.root.textContent,/已关联材料/);
    assert.equal(find('关联'),undefined);
    find('阅读').click();await delay(30);
    assert.equal(f.materials.panel.root.querySelector('.wb-reading h1').textContent,'协作说明');
    const after=await f.materials.listMaterials('projectA');
    assert.equal(after.materials.length,1);assert.equal(after.materials[0].id,output.id);
    assert.deepEqual(after.materials[0].capabilities.edit,before.materials[0].capabilities.edit);
    assert.deepEqual(after.materials[0].capabilities.edit,{user:true,agent:true});
    assert.equal(f.blocks.get('projectA').children.length,0);
  } finally {await f.close();}
});

test('a delayed connected preview cannot revive a previous Graph or offer a write there', async () => {
  const f=await fixture();
  try {
    await f.materials.bindDirectory('projectA','/projects/A');
    const gate=deferred(),started=deferred();let associated=0;
    f.materials.setDirectoryObserver({available:()=>true,stop:()=>{},list:async()=>({files:[{path:'/projects/A/参考.md',kind:'file',availability:'available',materialId:null}],truncated:false}),read:async()=>{started.resolve();return gate.promise;},associate:async()=>{associated++;throw Error('unexpected association');}});
    await f.materials.library('projectA');
    [...f.materials.panel.root.querySelectorAll('button')].find(b=>b.textContent==='目录文件').click();await delay(30);
    [...f.materials.panel.root.querySelectorAll('button')].find(b=>b.textContent==='阅读').click();await started.promise;
    f.switchGraph('B');gate.resolve({content:'# 旧 Graph 的内容'});await delay(30);
    assert.equal(f.materials.panel.visible,false);assert.equal(associated,0);
    assert.doesNotMatch(f.materials.panel.root.textContent,/旧 Graph 的内容/);
  } finally {await f.close();}
});

test('material editor is reused, unrelated polls preserve focus and IME waits until composition ends before autosave', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id); await f.materials.beginEditing(); assert.equal(f.counts().creates, 1); assert.equal(f.counts().sets, 0);
    const control = f.editor.control; control.focus();
    for (let i = 0; i < 10; i++) await f.tick();
    assert.equal(f.counts().sets, 0); assert.equal(f.browser.document.activeElement, control);
    f.composition('compositionstart'); f.input('中文组合草稿'); await f.saveTimers(); await f.tick();
    assert.equal(f.files.get(f.docA.path), 'base A'); assert.equal(f.counts().saves, 0);
    f.input('中文完成内容'); f.composition('compositionend'); assert.equal(f.counts().saves, 1); await f.saveTimers();
    assert.equal(f.files.get(f.docA.path), '中文完成内容'); assert.equal(f.browser.document.activeElement, control);
    await f.materials.panel.close(); const reads = f.counts().readCount; await f.tick(); assert.equal(f.counts().readCount, reads);
    await f.materials.openDoc(f.docA.id); await f.materials.beginEditing(); assert.equal(f.counts().creates, 1); assert.equal(f.counts().sets, 0);
  } finally { await f.close(); }
});

test('stable external versions update a clean editor but never replace a dirty draft; each Graph restores its own draft', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id); await f.materials.beginEditing(); const control = f.editor.control; control.focus();
    f.files.set(f.docA.path, 'external clean'); await f.tick(); assert.equal(f.editor.value, 'base A'); await f.tick();
    assert.equal(f.editor.value, 'external clean'); assert.equal(f.counts().sets, 1); assert.equal(f.browser.document.activeElement, control);
    f.input('local dirty A'); f.files.set(f.docA.path, 'external conflict'); await f.tick(); await f.tick();
    assert.equal(f.editor.value, 'local dirty A'); assert.equal(f.counts().sets, 1); assert.equal(f.materials.panel.root.querySelector('.wb-conflict').hidden, false);
    assert.equal(f.browser.document.activeElement, control);
    f.switchGraph('B'); await f.materials.openDoc(f.docB.id); await f.materials.beginEditing(); assert.equal(f.editor.value, 'base B'); f.input('local dirty B');
    f.switchGraph('A'); await f.materials.openDoc(f.docA.id); await f.materials.beginEditing();
    assert.equal(f.editor.value, 'local dirty A'); assert.equal(f.materials.panel.root.querySelector('.wb-conflict').hidden, false);
    assert.equal(f.files.get(f.docA.path), 'external conflict'); assert.equal(f.counts().creates, 1);
    assert.equal(JSON.parse(f.browser.localStorage.getItem(`workbench:draft:/B:${f.docB.id}`)).text, 'local dirty B');
    assert.equal(JSON.parse(f.browser.localStorage.getItem(`workbench:draft:/A:${f.docA.id}`)).base, 'external clean');
  } finally { await f.close(); }
});

test('an already-started save remains bound to its original Graph and dispose waits to destroy the editor', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id); await f.materials.beginEditing(); f.input('saved A');
    const gate = deferred(), started = deferred();
    f.intercept(async path => { if (path.endsWith('.pending')) { started.resolve(); await gate.promise; } });
    const saving = f.saveTimers(); await started.promise;
    f.switchGraph('B'); await f.materials.linkedContext(''); // constructs B storage while A's disk operation remains pending
    f.materials.dispose(); f.materials.dispose(); assert.equal(f.counts().destroyed, 0);
    gate.resolve(); await saving; await delay(15);
    assert.equal(f.files.get(f.docA.path), 'saved A'); assert.equal(f.files.get(f.docB.path), 'base B');
    assert.ok(f.writes.filter(write => write.path.startsWith('/materialsA')).every(write => write.graph === '/A'));
    assert.equal(f.counts().destroyed, 1);
  } finally { await f.close(); }
});

test('restoring captured source stops before writing when Graph changes during its SDK read', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id); await f.materials.beginEditing();
    const source = deferred(), started = deferred(); let sourceWrites = 0;
    globalThis.logseq.Editor.getBlock = async () => { started.resolve(); return source.promise; };
    globalThis.logseq.Editor.updateBlock = async () => { sourceWrites++; };
    [...f.materials.panel.root.querySelectorAll('button')].find(button => button.textContent === '恢复收纳原文').click();
    await started.promise; f.switchGraph('B'); source.resolve({ uuid: 'source', content: `[📄 ${f.docA.title}](longdoc://${f.docA.id})` }); await delay(15);
    assert.equal(sourceWrites, 0); assert.equal(f.files.get(f.docA.path), 'base A');
    globalThis.logseq.Editor.getBlock=async uuid=>f.blocks.get(uuid);
    const gate=deferred(),writing=deferred();f.intercept(async path=>{if(path.endsWith('.md')){writing.resolve();await gate.promise;}});
    f.commands.get('workbench-capture-text')();await writing.promise;f.switchGraph('A');gate.resolve();await delay(40);
    assert.equal(f.materials.panel.visible,false);assert.equal(sourceWrites,0); // late partial capture cannot revive an old panel

  } finally { await f.close(); }
});

test('project A capture → another page reading → draft editing → project B → A old link → external conflict → retained draft recovery → return to task', async () => {
  const f = await fixture();
  const click = async label => { const target = [...f.materials.panel.root.querySelectorAll('button')].find(button => button.textContent === label); assert.ok(target, label); target.click(); await delay(30); };
  try {
    await f.materials.bindDirectory('projectA', '/projects/A');
    await f.materials.bindDirectory('projectB', '/projects/B');
    await f.materials.library('projectA');
    const captured = await f.materials.capture({requestKey:'scenario-A',text:'# A 工作稿\n\n正文 '.repeat(150),sourceUuid:'projectA'});
    assert.equal(captured.status, 'success'); assert.ok(captured.material.path.startsWith('/projects/A/'));
    const link = f.browser.document.createElement('a'); link.href = captured.material.reference.match(/\((.*)\)/)[1]; link.textContent = '旧标题';
    const block = f.browser.document.createElement('div'); block.className = 'ls-block'; block.setAttribute('blockid', 'elsewhere'); block.append(link); f.browser.document.body.append(block);
    link.click(); await delay(30);
    assert.equal(f.materials.panel.root.querySelector('.wb-editor').hidden, true);
    assert.ok(f.materials.panel.root.querySelector('.wb-reading').textContent.includes('A 工作稿'));
    await click('编辑'); f.input('人工编辑工作稿'); await f.saveTimers();
    assert.equal(f.files.get(captured.material.path), '人工编辑工作稿');
    await f.materials.library('projectB');
    assert.ok(![...f.materials.panel.root.querySelectorAll('.wb-material')].some(row => row.textContent.includes('A 工作稿')));
    link.click(); await delay(30); assert.ok(f.materials.panel.root.querySelector('.wb-reading').textContent.includes('人工编辑工作稿'));
    await click('编辑'); f.input('保留我的冲突草稿'); f.files.set(captured.material.path, '外部修改'); await f.tick(); await f.tick();
    assert.equal(f.materials.panel.root.querySelector('.wb-conflict').hidden, false);
    await f.materials.library('projectB'); await f.materials.openDoc(captured.material.id);
    assert.equal(f.editor.value, '保留我的冲突草稿'); assert.equal(f.materials.panel.root.querySelector('.wb-conflict').hidden, false);
    await click('另存草稿后加载外部版本');
    const rows = await f.materials.linkedContext(captured.material.reference); assert.equal(rows[0].content, '外部修改');
    assert.ok([...f.files.entries()].some(([path,text]) => path.startsWith('/projects/A/') && path.endsWith('.md') && text === '保留我的冲突草稿'));
    await f.materials.library('projectA'); await f.materials.openDoc(captured.material.id); await click('返回工作'); assert.equal(f.returned, 'projectA');
  } finally {await f.close();}
});

test('failed reference insertion returns the saved identity and replay repairs the link once without another material', async () => {
  const f = await fixture();
  try {
    await f.materials.bindDirectory('projectA', '/projects/A'); f.rejectInsertion(true);
    const request = {requestKey:'insert-retry',text:'same document',sourceUuid:'projectA'};
    const partial = await f.materials.capture(request); assert.equal(partial.status,'partial'); assert.equal(f.files.get(partial.material.path),'same document');
    f.rejectInsertion(false);
    const second = await f.materials.capture(request), third = await f.materials.capture(request);
    assert.equal(second.status,'success'); assert.equal(second.material.id,partial.material.id); assert.equal(third.material.id,partial.material.id);
    assert.equal(f.blocks.get('projectA').children.length,1);
    assert.equal([...f.files.keys()].filter(path=>path.startsWith('/projects/A/')&&path.endsWith('.md')).length,1);
  } finally {await f.close();}
});

test('automatic paste respects opt-in, short/internal/code input and retains a saved capture when position or Graph changes', async () => {
  const f = await fixture();
  const paste = (target, plain, types=['text/plain']) => {
    const event = new f.browser.Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'clipboardData',{value:{files:[],types,getData:type=>type==='text/plain'?plain:''}});
    target.dispatchEvent(event); return event;
  };
  try {
    await f.materials.bindDirectory('projectA','/projects/A');
    const block=f.browser.document.createElement('div');block.className='ls-block';block.setAttribute('blockid','projectA');
    const editor=f.browser.document.createElement('div');editor.className='block-editor';const input=f.browser.document.createElement('textarea');editor.append(input);block.append(editor);f.browser.document.body.append(block);input.focus();
    const plain='长文本\n'.repeat(600);
    assert.equal(paste(input,plain).defaultPrevented,false);
    globalThis.logseq.settings.materialsAutoCapture=true;
    const storage=globalThis.localStorage;globalThis.localStorage={setItem:()=>{throw Error('quota');}};assert.equal(paste(input,plain).defaultPrevented,false);globalThis.localStorage=storage;
    assert.equal(paste(input,'short').defaultPrevented,false);
    assert.equal(paste(input,plain,['text/plain','application/logseq']).defaultPrevented,false);
    input.value='```js\n';input.setSelectionRange(input.value.length,input.value.length);assert.equal(paste(input,plain).defaultPrevented,false);
    input.value='before';input.setSelectionRange(6,6);
    let insertions=0;f.browser.document.execCommand=()=>{insertions++;return true;};
    const gate=deferred(),started=deferred();f.intercept(async path=>{if(path.endsWith('.md')){started.resolve();await gate.promise;}});
    assert.equal(paste(input,plain).defaultPrevented,true);await started.promise;
    input.value='new current input';f.switchGraph('B');gate.resolve();await delay(40);
    assert.equal(input.value,'new current input');assert.equal(insertions,0);
    const pending=[...Array(f.browser.localStorage.length)].map((_,i)=>f.browser.localStorage.key(i)).filter(key=>key.startsWith('workbench:pending:'));
    assert.equal(pending.length,1);const recovery=JSON.parse(f.browser.localStorage.getItem(pending[0]));assert.ok(recovery.materialId);assert.equal(recovery.graph,'/A');
    assert.equal([...f.files.keys()].filter(path=>path.startsWith('/projects/A/')&&path.endsWith('.md')).length,1);
    f.switchGraph('A');const body=await f.materials.readMaterial(recovery.materialId);assert.equal(body.content,plain);
  } finally {await f.close();}
});

test('user and agent captures share HTML conversion and preserve the original for recovery', async () => {
  const f = await fixture();
  try {
    const request={text:'Hello plain',html:'<p><strong>Hello</strong> plain</p><script>danger()</script>'};
    const user=await f.materials.capture({...request,requestKey:'html-user'},'user');
    const agent=await f.materials.capture({...request,requestKey:'html-agent'},'agent');
    assert.equal(user.material.content,agent.material.content);assert.ok(agent.material.content.includes('**Hello**'));assert.ok(!agent.material.content.includes('danger'));
    assert.equal(user.material.capabilities.edit.agent,false);assert.equal(agent.material.capabilities.edit.agent,true);
    const json=JSON.parse(f.files.get(`${user.material.recordRoot}/.longdoc/${user.material.id}.json`));assert.equal(json.original,request.text);assert.equal(json.originalHTML,request.html);
  } finally {await f.close();}
});

test('explicit submitted text survives a file failure and the user resumes the same material from its record', async () => {
  const f = await fixture();
  const button = label => [...f.materials.panel.root.querySelectorAll('button')].find(b => b.textContent === label);
  const until = async condition => {
    for (let i = 0; i < 200; i++) { if (condition()) return; await delay(10); }
    assert.fail('material recovery did not reach the expected visible state');
  };
  try {
    await f.materials.bindDirectory('projectA','/projects/A');await f.materials.library('projectA');
    [...f.materials.panel.root.querySelectorAll('button')].find(b=>b.textContent==='收纳文本').click();await delay(10);
    const form=f.materials.panel.root.querySelector('.wb-material-form'),text='explicit text that must survive';form.querySelector('textarea').value=text;
    const storage=globalThis.localStorage;globalThis.localStorage={setItem:()=>{throw Error('quota');}};form.dispatchEvent(new f.browser.Event('submit',{bubbles:true,cancelable:true}));assert.equal(form.isConnected,true);assert.equal(form.querySelector('textarea').value,text);globalThis.localStorage=storage;
    f.intercept(async path=>{if(path.endsWith('.md'))throw Error('disk full');});
    form.dispatchEvent(new f.browser.Event('submit',{bubbles:true,cancelable:true}));await until(() => button('继续保存收纳'));
    const key=[...Array(f.browser.localStorage.length)].map((_,i)=>f.browser.localStorage.key(i)).find(k=>k.startsWith('workbench:pending:'));
    assert.ok(key);const pending=JSON.parse(f.browser.localStorage.getItem(key));assert.equal(pending.plain,text);assert.ok(pending.materialId);
    assert.equal(f.materials.panel.root.querySelector('.wb-editor').hidden,true);
    f.intercept(null);button('继续保存收纳').click();await until(() => !button('继续保存收纳'));
    const view=await f.materials.readMaterial(pending.materialId);assert.equal(view.content,text);assert.equal(view.writeState,'ready');
    assert.equal([...f.files.keys()].filter(path=>path.startsWith('/projects/A/')&&path.endsWith('.md')).length,1);
  } finally {await f.close();}
});
