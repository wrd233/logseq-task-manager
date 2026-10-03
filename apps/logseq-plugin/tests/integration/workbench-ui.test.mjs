import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {setTimeout as delay} from 'node:timers/promises';

test('work-view shares formal identity without starting task UI and retains natural fallback after Graph switch', async () => {
  const browser = new Window({url:'http://localhost/plugin/'});
  globalThis.window=browser; globalThis.document=browser.document; globalThis.localStorage=browser.localStorage;
  const {blockIdentityCache,lookupBlockIdentity}=await import('../../src/block-identity.ts');
  const {WorkView}=await import('../../src/features/work-view/controller.ts');
  let onGraphChanged;
  let graph='one';
  const blocks=new Map([
    ['formal',{uuid:'formal',content:'普通标题',parent:{id:'page'},page:{id:'page'}}],
    ['natural',{uuid:'natural',content:'TODO **[任务]** 自然任务',parent:{id:'page'},page:{id:'page'}}],
  ]);
  globalThis.logseq={
    settings:{tasksEnabled:false},
    App:{getCurrentGraph:async()=>({name:graph,url:`/${graph}`}),registerCommandPalette:()=>{},onCurrentGraphChanged:fn=>{onGraphChanged=fn;return()=>{};}},
    Editor:{getBlock:async uuid=>blocks.get(uuid)??null,getCurrentBlock:async()=>blocks.get('natural'),checkEditing:async()=>false,registerBlockContextMenuItem:()=>()=>{}},
    DB:{onChanged:()=>()=>{}},setMainUIInlineStyle:()=>{},showMainUI:()=>{},hideMainUI:()=>{},
  };
  const work=new WorkView(()=>{});
  try {
    blockIdentityCache.replace([{object:{id:'object',kind:'PROJECT',title:'正式项目'},anchor:{externalId:'formal',graphId:'one:/one'}}],blockIdentityCache.activate('one:/one'));
    await work.open('formal');
    assert.ok(work.panel.root.textContent.includes('正式项目'));
    assert.equal(browser.document.querySelector('[data-task-copilot-daily-panel]'),null);
    blockIdentityCache.invalidate('formal',blockIdentityCache.scope());
    assert.deepEqual(lookupBlockIdentity('formal'),{kind:'ORDINARY'});
    graph='two';onGraphChanged();
    await work.open('natural');
    assert.equal(work.snapshot().graph,'two:/two');
    assert.equal(work.snapshot().root,'natural');
    assert.ok(work.panel.root.textContent.includes('自然任务'));
    assert.ok(!work.panel.root.textContent.includes('正式项目'));
    blockIdentityCache.invalidateScope();
    assert.deepEqual(lookupBlockIdentity('formal'),{kind:'ORDINARY'});
  } finally {
    blockIdentityCache.invalidateScope();work.dispose();await browser.happyDOM.abort();
    delete globalThis.logseq;delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;
  }
});

test('combined panels preserve source text, load linked material and retain conflicting drafts across switches', async () => {
  const browser = new Window({url: 'http://localhost/plugin/'});
  globalThis.window = browser; globalThis.document = browser.document;
  globalThis.localStorage = browser.localStorage;
  globalThis.location = browser.location;
  const files = new Map();
  const blocks = new Map([
    ['root', {uuid:'root', content:'TODO **[任务]** 整合工作', parent:{id:'page'}, page:{id:'page'}, children:[{uuid:'a',content:'【注】 资料',parent:{id:'root'},page:{id:'page'}},{uuid:'b',content:'TODO 阅读材料',parent:{id:'root'},page:{id:'page'}}]}],
    ['a', {uuid:'a',content:'【注】 资料',parent:{id:'root'},page:{id:'page'}}],
    ['b', {uuid:'b',content:'TODO 阅读材料',parent:{id:'root'},page:{id:'page'}}],
    ['page', {name:'fixture'}],
  ]);
  let active = false;
  globalThis.logseq = {
    settings:{materialsDirectory:'/materials'},
    App:{getCurrentGraph:async()=>({path:'/graph'}),registerCommandPalette:()=>{},onCurrentGraphChanged:()=>()=>{}},
    Editor:{getBlock:async uuid=>blocks.get(uuid)??null,getCurrentBlock:async()=>blocks.get('root'),checkEditing:async()=>false,registerBlockContextMenuItem:()=>()=>{},getPage:async()=>({name:'fixture'}),scrollToBlockInPage:()=>{}},
    DB:{onChanged:()=>()=>{}},UI:{showMsg:async()=>{}},
    setMainUIInlineStyle:()=>{},showMainUI:()=>{active=true;},hideMainUI:()=>{active=false;},
  };
  browser.apis = {doAction:async ([op,...args])=>{
    if(op==='readFile'){if(!files.has(args[0]))throw Error('ENOENT');return files.get(args[0]);}
    if(op==='writeFile'){files.set(args[1],args[2]);return;}
    if(op==='mkdir-recur')return;
    if(op==='stat'){if(files.has(args[0]))return {mode:0o100644,size:1};throw Error('ENOENT');}
    if(op==='rename'){files.set(args[1],files.get(args[0]));files.delete(args[0]);return;}
    if(op==='listdir')return [...files.keys()].filter(path=>path.startsWith(args[0]+'/'));
    throw Error('unknown bridge op');
  },openPath:async()=>{}};
  let fakeEditor;
  const rememberEditor = editor => { fakeEditor=editor; };
  browser.Vditor = class {
    constructor(root, options){this.value=options.value;rememberEditor(this);globalThis.queueMicrotask(options.after);}
    getValue(){return this.value;}
    setValue(text){this.value=text;}
    destroy(){}
  };
  const {WorkView} = await import('../../src/features/work-view/controller.ts');
  const {Materials} = await import('../../src/features/materials/controller.ts');
  const {MaterialStore} = await import('../../src/features/materials/store.ts');
  const io = {read:async path=>{if(!files.has(path))throw Error('ENOENT');return files.get(path);},write:async(path,text)=>{files.set(path,text);},mkdir:async()=>{},rename:async(from,to)=>{files.set(to,files.get(from));files.delete(from);},list:async path=>[...files.keys()].filter(file=>file.startsWith(path+'/'))};
  const store = new MaterialStore(io,'/materials');
  const record = await store.create('# 材料\nbase',{graph:'/graph',sourceUuid:'root'});
  const work = new WorkView(()=>{}), materials = new Materials(uuid=>work.open(uuid), ()=>work.snapshot().root);
  try {
    const original = JSON.stringify([...blocks]);
    await work.open('root'); assert.equal(active,true);
    assert.equal(work.panel.visible,true); assert.equal(browser.document.querySelectorAll('.wb-row').length,3);
    const snapshot = work.snapshot();
    assert.equal(work.apply({graph:snapshot.graph,root:'root',expectedSeq:snapshot.seq,type:'reorder',uuid:'b',target:'a',mode:'before'}).ok,true);
    assert.equal(work.apply({graph:snapshot.graph,root:'root',expectedSeq:snapshot.seq,type:'sync-source'}).ok,false);
    assert.equal(JSON.stringify([...blocks]),original);
    assert.equal((await work.lensesAPI.select('a')).ok,true);
    const selectedNode=browser.document.querySelector('.wb-row[data-uuid=a]');
    selectedNode.parentElement.scrollTop=91;
    assert.equal(work.lensesAPI.read().phase,'focused');
    await materials.library('root'); assert.equal(work.panel.visible,false); assert.equal(materials.panel.visible,true);
    await materials.openDoc(record.id); await materials.beginEditing(); assert.equal(fakeEditor.value,'# 材料\nbase');
    fakeEditor.value='# 材料\nlocal';
    files.set(record.path,'# 材料\nexternal');
    const returnWork=[...materials.panel.root.querySelectorAll('button')].find(button=>button.textContent==='返回工作');
    assert.ok(returnWork); returnWork.click();
    for(let i=0;i<40&&!work.panel.visible;i++)await delay(5);
    assert.equal(materials.panel.visible,false); assert.equal(work.panel.visible,true);
    assert.equal(work.lensesAPI.read().plan.question,'选定范围');
    assert.equal(browser.document.querySelector('.wb-row[data-uuid=a]'),selectedNode);
    assert.equal(selectedNode.parentElement.scrollTop,91);
    assert.equal(files.get(record.path),'# 材料\nexternal');
    const draft=JSON.parse(browser.localStorage.getItem(`workbench:draft:/graph:${record.id}`));
    assert.equal(draft.text,'# 材料\nlocal'); assert.equal(draft.base,'# 材料\nbase');
    await materials.openDoc(record.id); await materials.beginEditing();
    assert.equal(fakeEditor.value,'# 材料\nlocal');
    assert.equal(materials.panel.root.querySelector('.wb-conflict').hidden,false);
    assert.equal(files.get(record.path),'# 材料\nexternal');

    // A failed capture must return the original paste when the editor is still unchanged.
    globalThis.logseq.settings.materialsAutoCapture=true; globalThis.logseq.settings.materialsDirectory='/graph/invalid';
    const fixture=browser.document.createElement('div'); fixture.className='ls-block'; fixture.setAttribute('blockid','b');
    fixture.innerHTML='<div class="block-editor"><textarea></textarea></div>'; browser.document.body.append(fixture);
    const target=fixture.querySelector('textarea'); target.focus(); target.setSelectionRange(0,0);
    const plain=Array.from({length:32},(_,i)=>`fixture ${i}`).join('\n'); let fallback=0;
    browser.document.execCommand=(command,_ui,value)=>{assert.equal(command,'insertText');assert.equal(value,plain);target.value=value;fallback++;return true;};
    const event=new browser.Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'clipboardData',{value:{files:[],types:['text/plain'],getData:type=>type==='text/plain'?plain:''}});
    target.dispatchEvent(event);
    for(let i=0;i<40&&!fallback;i++)await delay(5);
    assert.equal(event.defaultPrevented,true); assert.equal(fallback,1); assert.equal(target.value,plain);
    assert.equal([...Array(browser.localStorage.length)].map((_,i)=>browser.localStorage.key(i)).some(key=>key.startsWith('workbench:pending:')),true); // recovery remains when disk work failed
  } finally {
    work.dispose(); materials.dispose(); await browser.happyDOM.abort();
    delete globalThis.logseq; delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; delete globalThis.location;
  }
});

test('task panel preserves sibling modules and cannot mount after a later navigation', async () => {
  const browser=new Window({url:'http://localhost/plugin/'});
  globalThis.window=browser; globalThis.document=browser.document; globalThis.MutationObserver=browser.MutationObserver;
  const {KernelClient}=await import('@task-copilot/client/browser');
  const {panels}=await import('../../src/workspace/context.ts');
  const {openTaskCenter}=await import('../../src/features/task-center/controller.ts');
  const methods=['nowProjection','confirmationProjection','workMapProjection','systemProjection'];
  const originals=methods.map(key=>KernelClient.prototype[key]);
  for(const method of methods)KernelClient.prototype[method]=async()=>({items:[],roots:[]});
  let widthDelay=null;
  globalThis.logseq={
    settings:{kernelDescriptorJson:JSON.stringify({schemaVersion:1,baseUrl:'http://127.0.0.1:1',token:'fixture',pid:1,startedAt:'2026-10-01T00:00:00Z',graphSnapshotKey:'a'.repeat(64),graphBridgeToken:'b'.repeat(64)})},
    FileStorage:{getItem:async key=>key.includes('sidebar-width')&&widthDelay?widthDelay:null,setItem:async()=>{}},
    setMainUIAttrs:()=>{},showMainUI:()=>{},
  };
  browser.document.body.innerHTML='<nav id="workbench-navigation"></nav><section data-workbench-feature="work"></section><section data-workbench-feature="materials"></section>';
  const siblings=[...browser.document.body.children];
  try {
    await openTaskCenter();
    assert.ok(browser.document.querySelector('[data-task-copilot-daily-panel]'));
    assert.ok(siblings.every(node=>node.isConnected));
    await openTaskCenter();
    assert.equal(browser.document.querySelectorAll('[data-task-copilot-daily-panel]').length,1);
    browser.document.querySelector('[data-task-copilot-daily-panel]').remove();panels.release('tasks');
    let release;
    widthDelay=new Promise(resolve=>{release=resolve;});
    const oldNavigation=openTaskCenter();
    await delay(5);
    await panels.activate('work'); release(null);
    await oldNavigation;
    assert.equal(panels.active,'work');
    assert.equal(browser.document.querySelector('[data-task-copilot-daily-panel]'),null);
    assert.ok(siblings.every(node=>node.isConnected));
  } finally {
    methods.forEach((key,i)=>{KernelClient.prototype[key]=originals[i];});panels.release('work');panels.release('tasks');
    await browser.happyDOM.abort();delete globalThis.logseq;delete globalThis.window;delete globalThis.document;delete globalThis.MutationObserver;
  }
});

test('composition root leaves runtime disabled while work and materials remain usable', async () => {
  const browser=new Window({url:'http://localhost/plugin/'});
  globalThis.window=browser;globalThis.document=browser.document;globalThis.localStorage=browser.localStorage;
  const fetch=globalThis.fetch;
  let unload, boot, calls=0, subscriptions=0;
  browser.apis={doAction:async([op])=>{if(op==='listdir')return [];throw Error('unexpected file operation');}};
  globalThis.fetch=async()=>{calls++;throw Error('unexpected network');};
  globalThis.logseq={
    settings:{tasksEnabled:false,materialsDirectory:'/materials'},
    useSettingsSchema:()=>{},provideStyle:()=>{},provideModel:()=>{},beforeunload:fn=>{unload=fn;},
    ready:fn=>{boot=Promise.resolve().then(fn);return boot;},
    App:{registerUIItem:()=>{},registerCommandPalette:()=>{},registerCommand:()=>()=>{},getCurrentGraph:async()=>({name:'test',url:'/graph',path:'/graph'}),onCurrentGraphChanged:()=>()=>{}},
    DB:{onChanged:()=>{subscriptions++;return()=>{};}},
    Editor:{getCurrentBlock:async()=>({uuid:'root'}),getBlock:async()=>({uuid:'root',content:'natural',id:2,parent:{id:1},page:{id:1},left:{id:1}}),registerBlockContextMenuItem:()=>()=>{},checkEditing:async()=>false},
    setMainUIInlineStyle:()=>{},showMainUI:()=>{},hideMainUI:()=>{},UI:{showMsg:async()=>{}},
  };
  try {
    await import('../../src/index.ts');await boot;
    for (const method of ["bind", "resolve", "refresh", "read", "unbind"]) assert.equal(typeof browser.taskCopilotWorkbench.workspace[method], "function");
    assert.equal(typeof browser.taskCopilotWorkbench.content.read,"function");
    assert.equal(browser.taskCopilotWorkbench.content.scope(),null);
    for (const method of ["list", "read", "capture", "associate", "save"]) assert.equal(typeof browser.taskCopilotWorkbench.materials[method], "function");
    assert.deepEqual(await browser.taskCopilotWorkbench.materials.list(), {status:"success",materials:[],problems:[]});
    await browser.taskCopilotWorkbench.open('root');
    assert.equal(browser.taskCopilotWorkbench.read().root,'root');
    const lens=browser.taskCopilotWorkbench.lenses;
    assert.equal(lens.read().phase,'reading');
    const source=await lens.source();
    assert.equal(source.ok,true);assert.match(source.value.blocks[0].contentVersion,/^[0-9a-f]{64}$/);
    assert.equal((await lens.select('root')).ok,true);assert.equal(lens.read().phase,'focused');
    lens.exit();assert.equal(lens.read().phase,'reading');
    const nav=browser.document.querySelector('#workbench-navigation');
    const materials=[...nav.querySelectorAll('button')].find(button=>button.textContent==='材料');
    materials.click();await delay(20);
    assert.equal(browser.document.querySelector('[data-workbench-feature="materials"]').hidden,false);
    assert.equal(calls,0);assert.equal(subscriptions,2); // work-view and independent known-workspace observation; no task runtime
    await unload();await unload();
    assert.equal(browser.taskCopilotWorkbench,undefined);
  } finally {
    await unload?.();globalThis.fetch=fetch;await browser.happyDOM.abort();
    delete globalThis.logseq;delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;
  }
});

test('material references survive work-view and reading sanitization while executable and malformed URIs remain stripped', async () => {
  const browser=new Window({url:'http://localhost/plugin/'});
  globalThis.window=browser;globalThis.document=browser.document;
  try {
    const {renderReading}=await import('../../src/features/materials/ui.ts');
    const {WorkViewRenderer}=await import('../../src/features/work-view/renderer.ts');
    const id=crypto.randomUUID(), text=`[材料](longdoc://${id}) [unsafe](javascript:alert(1)) [bad](longdoc://wrong)`;
    const article=renderReading(text);
    const links=[...article.querySelectorAll('a')];assert.equal(links[0].getAttribute('href'),`longdoc://${id}`);assert.equal(links[1].getAttribute('href'),null);assert.equal(links[2].getAttribute('href'),null);
    const container=browser.document.createElement('div'),renderer=new WorkViewRenderer(container,{operation:()=>{},toggle:()=>{},raw:()=>{},locate:()=>{},enter:()=>{}});
    renderer.render([{uuid:'source',content:text,depth:0}],{items:[{uuid:'source',depth:0}],collapsed:[],selected:null,expanded:[],overrides:{}},new Set());
    const workLinks=[...container.querySelectorAll('a')];
    assert.equal(workLinks[0].getAttribute('href'),`longdoc://${id}`);
    assert.equal(workLinks[1].getAttribute('href'),null);assert.equal(workLinks[2].getAttribute('href'),null);
  } finally {await browser.happyDOM.abort();delete globalThis.window;delete globalThis.document;}
});
