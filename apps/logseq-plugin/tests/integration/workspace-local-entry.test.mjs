import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mkdir,mkdtemp,readFile,writeFile,rename,readdir,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import process from 'node:process';
import {deserialize,serialize} from 'node:v8';
const structuredClone=value=>deserialize(serialize(value));

test('real workspace installation and Materials UI share binding, survive restart/offline, refresh known notes and dispose without Kernel',async()=>{
  const browser=new Window({url:'http://localhost/plugin/'});
  globalThis.window=browser;globalThis.document=browser.document;globalThis.localStorage=browser.localStorage;globalThis.location=browser.location;
  await mkdir('tmp',{recursive:true});const root=await mkdtemp(join(process.cwd(),'tmp/workspace-entry-')),directory=join(root,'work'),moved=join(root,'moved');await mkdir(directory);
  const blocks=new Map([
    ['root',{uuid:'root',content:'TODO 工作入口',properties:{},id:2,parent:{id:1},page:{id:1},left:{id:1},children:[{uuid:'child',content:'自然段\n[注] 保留'}]}],
    ['child',{uuid:'child',content:'自然段\n[注] 保留',parent:{id:'root'},page:{id:'page'}}],
  ]);
  const rootUuid=crypto.randomUUID(),childUuid=crypto.randomUUID();blocks.get('root').uuid=rootUuid;blocks.get('root').children[0].uuid=childUuid;blocks.get('child').uuid=childUuid;
  const blockAt=id=>blocks.get(id)??[...blocks.values()].find(block=>block.uuid===id)??null;
  let graph={name:'fixture',url:'/synthetic-graph',path:'/synthetic-graph'},isDb=false,idWrites=0;
  const commands=new Map(),menus=new Map(),db=new Set(),graphs=new Set();let removed=0,opened=null;
  globalThis.logseq={settings:{tasksEnabled:false},
    App:{registerCommand:(_type,spec,fn)=>{menus.set(spec.label,fn);return()=>{menus.delete(spec.label);removed++;};},getCurrentGraph:async()=>graph,checkCurrentIsDbGraph:async()=>isDb,onCurrentGraphChanged:fn=>{graphs.add(fn);return()=>{graphs.delete(fn);};},registerCommandPalette:(spec,fn)=>{commands.set(spec.key,fn);return()=>{commands.delete(spec.key);removed++;};}},
    Editor:{getBlock:async uuid=>structuredClone(blockAt(uuid)),getCurrentBlock:async()=>structuredClone(blocks.get('root')),checkEditing:async()=>false,getPage:async()=>null,getPageBlocksTree:async()=>[],
      registerBlockContextMenuItem:(label,fn)=>{menus.set(label,fn);return()=>{menus.delete(label);removed++;};},upsertBlockProperty:async(uuid,key,value)=>{assert.equal(isDb,false);idWrites++;const b=blockAt(uuid);b.properties[key]=value;b.content=b.content.replace(/\nid::[^\n]*/u,'')+`\nid:: ${value}`;},
      insertBlock:async(uuid,content)=>{const b=blockAt(uuid);b.children.push({uuid:crypto.randomUUID(),content});return{};}},
    DB:{onChanged:fn=>{db.add(fn);return()=>{db.delete(fn);};}},UI:{showMsg:async()=>{}},setMainUIInlineStyle:()=>{},showMainUI:()=>{},hideMainUI:()=>{},
  };
  browser.apis={doAction:async([op,...args])=>{
    if(op==='readFile')return readFile(args[0],'utf8');if(op==='writeFile'){await writeFile(args[1],args[2]);return;}if(op==='rename'){await rename(...args);return;}if(op==='mkdir-recur'){await mkdir(args[0],{recursive:true});return;}if(op==='listdir')return readdir(args[0]);
    if(op==='stat'){const s=await lstat(args[0]);return{mode:s.mode,size:s.size};}throw Error('Unexpected bridge request');
  },openPath:async path=>{opened=path;}};
  const {installWorkspaceContext}=await import('../../src/features/workspace-context/install.ts');const {Materials}=await import('../../src/features/materials/controller.ts');
  let materials;let installation=installWorkspaceContext(id=>materials.readMaterial(id));materials=new Materials(undefined,()=> rootUuid,installation.materialBindings);
  const scope={graphId:'fixture:/synthetic-graph',rootUuid};
  try {
    assert.equal(menus.has('工作台：关联工作目录'),true);
    await menus.get('工作台：关联工作目录')({uuid:rootUuid});
    const panel=browser.document.querySelector('[data-workbench-feature="workspace"]');assert.equal(panel.hidden,false);
    const path=panel.querySelector('input');path.value=directory;[...panel.querySelectorAll('button')].find(b=>b.textContent==='关联').click();
    for(let i=0;i<100;i++){if(await installation.api.resolve(scope)&& (await installation.api.read(scope)).mirror)break;await delay(10);}
    assert.ok(await installation.api.resolve(scope),panel.textContent);
    const bound=await installation.api.read(scope);assert.equal(bound.binding.directory,directory);assert.equal(idWrites,1);
    assert.equal(blocks.get('child').properties,undefined);assert.ok(!blocks.get('child').content.includes('id::'));
    await menus.get('工作台：打开工作读取入口')({uuid:rootUuid});assert.equal(opened,join(directory,'WORKSPACE.md'));
    // Actual old Materials bind method delegates to the same registry, then actual capture uses its projection.
    await materials.bindDirectory(rootUuid,directory);assert.equal((await installation.api.resolve(scope)).manifest.workspaceId,bound.workspaceId);
    const captured=await materials.capture({requestKey:'through-entry',text:'# 真实材料',sourceUuid:rootUuid});assert.equal(captured.material.recordRoot,directory);
    blocks.get('root').children[0].content+='\n[注] 人工新增，不整理';blocks.get('child').content=blocks.get('root').children[0].content;
    for(const changed of db)changed({blocks:[{uuid:'child',content:blocks.get('child').content}]});
    let refreshed;
    for(let i=0;i<100;i++){refreshed=await installation.api.read(scope);if(refreshed.mirror?.markdown.includes('人工新增'))break;await delay(10);}
    assert.match(refreshed.mirror.markdown,/人工新增，不整理/);
    await commands.get('workbench-workspace-refresh')();
    const identity=bound.workspaceId;materials.dispose();installation.dispose();assert.equal(db.size,0);assert.equal(graphs.size,0);assert.ok(removed>=12);
    installation=installWorkspaceContext(async()=>{throw Error('materials offline');});
    // Restart can read the verified disk publication with Graph temporarily unavailable.
    graph=null;const offline=await installation.api.read(scope);assert.equal(offline.workspaceId,identity);assert.equal(offline.freshness,'last-known');
    graph={name:'fixture',url:'/synthetic-graph',path:'/synthetic-graph'};
    await rename(directory,moved);const rebind=await installation.api.bind({scope,directory:moved,rebind:true});assert.equal(rebind.workspaceId,identity);
    await installation.api.unbind(scope);assert.equal(await installation.api.resolve(scope),null);assert.ok(await readFile(join(moved,'.task-workspace/manifest.json'),'utf8'));
    // DB Graph persistence uses native UUID and performs no textual id write.
    isDb=true;blocks.set('db-root',{uuid:'db-root',content:'DB 工作',properties:{},id:3,parent:{id:1},page:{id:1},left:{id:1},children:[]});const dbPath=join(root,'db');await mkdir(dbPath);const count=idWrites;
    await installation.api.bind({scope:{...scope,rootUuid:'db-root'},directory:dbPath});assert.equal(idWrites,count);assert.equal(blocks.get('db-root').content,'DB 工作');
  } finally {
    materials?.dispose();installation.dispose();await browser.happyDOM.abort();await rm(root,{recursive:true,force:true});
    delete globalThis.logseq;delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.location;
  }
});
