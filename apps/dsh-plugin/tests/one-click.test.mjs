import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,readFile,writeFile,readdir,stat,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import process from 'node:process';
import {contentFixture} from '../../logseq-plugin/tests/fixtures/content-writeback.ts';
import {startWorkspaceServer} from '../../task-copilot-cli/src/workspace-server.ts';
import {browserDescriptor,createDshHandoff,handoffPath} from '../../task-copilot-cli/src/dsh-handoff.ts';
import {ensureDshWork} from '../../logseq-plugin/src/features/agent-workspace/dsh-work.ts';
import {BindingStore,WorkbenchService,CompanionTransport} from '../src/service.mjs';
import {DshHandoffs} from '../src/handoff.mjs';
/* global logseq, document, URL, URLSearchParams */

test('default preparation reuses an explicit binding and refuses an unavailable source',async()=>{
 const existing={directory:'/already-chosen'},scope={graphId:'A:/A',rootUuid:'root'};let folders=0,binds=0;
 const ports={check:async()=>{},resolve:async()=>existing,directory:async()=>{folders++;return '/default';},bind:async()=>{binds++;return {binding:existing,freshness:'checked'};}};
 assert.equal(await ensureDshWork(scope,ports),existing);assert.equal(folders,0);assert.equal(binds,0);
 ports.resolve=async()=>null;ports.bind=async()=>({binding:existing,freshness:'last-known',problem:'saved source unavailable'});
 await assert.rejects(ensureDshWork(scope,ports),/saved source unavailable/);
});

test('one local click prepares a work, opens DSH without a prompt, and resumes a work-owned session',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'dsh-one-click-'))),state=join(root,'state'),materialRoot=join(root,'materials');
 const f=await contentFixture();const server=await startWorkspaceServer({stateDirectory:state});let api;
 try{
  f.blocks.get(f.root).content='**[事务]** 讨论阅读体验';
  const opened=[],bodies=[...f.blocks.values()].map(b=>b.content);
  f.browser.apis={doAction:async([command,...v])=>{
   if(command==='readFile')return readFile(String(v[0]),'utf8');
   if(command==='writeFile')return writeFile(String(v[1]),String(v[2]));
   if(command==='mkdir-recur')return mkdir(String(v[0]),{recursive:true});
   if(command==='rename')return rename(String(v[0]),String(v[1]));
   if(command==='stat'){try{const s=await stat(String(v[0]));return {mode:s.mode,size:s.size};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
   if(command==='listdir'){try{return (await readdir(String(v[0]))).map(n=>join(String(v[0]),n));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
   throw Error(`Unexpected Desktop operation ${command}`);
  },openPath:async()=>{}};
  logseq.settings={tasksEnabled:false,materialsEnabled:true,workViewEnabled:true,materialsDirectory:materialRoot,materialsAutoCapture:false,agentWorkspaceDescriptor:server.pluginDescriptorPath};
  logseq.App.openExternalLink=async url=>{opened.push(url);};
  logseq.Editor.getPage=async()=>({id:1,name:'synthetic page',originalName:'synthetic page'});
  await import(`../../logseq-plugin/src/index.ts?one-click=${Date.now()}`);await f.boot();api=f.browser.taskCopilotWorkbench;
  await api.open(f.root);
  assert.equal((await readdir(root)).includes('materials'),false,'reading alone creates no work folder');
  await api.materials.capture({requestKey:'before-dsh',sourceUuid:f.root,title:'已有材料',text:'A material saved before DSH collaboration.'});
  bodies.splice(0,bodies.length,...[...f.blocks.values()].map(b=>b.content.replace(/\nid:: [0-9a-f-]+$/u,'')));
  const directory=join(materialRoot,'workspaces',f.root);
  assert.equal((await readdir(directory)).includes('.task-workspace'),false,'saving a material does not establish a collaboration workspace');
  await writeFile(browserDescriptor(state),JSON.stringify({schemaVersion:1,url:'http://127.0.0.1:3080/?token=test-launch',pid:process.pid}));
  f.editing(f.a);
  await api.dsh.open();assert.equal(opened.length,1);assert.match(opened[0],/#logseq-work=/);
  const manifest=JSON.parse(await readFile(join(directory,'.task-workspace/manifest.json'),'utf8'));
  assert.equal(manifest.primarySource.rootUuid,f.root);assert.equal(api.agentWorkspace.status().permissions.bodyWrite,false);
  assert.equal(document.querySelector('[data-collaboration="true"] textarea'),null,'no Logseq request form');
  assert.deepEqual([...f.blocks.values()].map(b=>b.content.replace(/\nid:: [0-9a-f-]+$/u,'')),bodies);
  assert.equal(f.blocks.get(f.root).properties.id,f.root,'the durable root identity is preserved');
  assert.equal(f.blocks.get(f.root).content.split('\n').filter(line=>line.startsWith('id::')).length,1);
  await writeFile(join(directory,'notes.md'),'A test material');
  const store=new BindingStore(join(root,'bindings'));await store.load();
  const sessions=new Map(),created=[];
  const service=new WorkbenchService({store,transport:new CompanionTransport(state),inspectSession:async id=>{if(!sessions.has(id))throw Error('session not found');return sessions.get(id);},openPath:async()=>{}});
  const handoffs=new DshHandoffs({service,createSession:async({cwd})=>{const sessionId=`dsh-session-${created.length+1}`;sessions.set(sessionId,{meta:{cwd}});created.push(cwd);return {sessionId};},renameSession:async({sessionId,title})=>{sessions.get(sessionId).title=title;}});
  const ticket=()=>new URLSearchParams(new URL(opened.at(-1)).hash.slice(1)).get('logseq-work');
  const first=await handoffs.open(ticket());assert.equal(first.sessionId,'dsh-session-1');assert.deepEqual(created,[directory]);
  const view=await service.view(first.sessionId);assert.equal(view.blocks.length,4);assert.ok(view.files.some(v=>v.name==='notes.md'));
  assert.equal(JSON.stringify(view).includes('uncommitted draft'),false,'native input is neither committed nor exported');
  f.editing(false);
  assert.deepEqual(await handoffs.open(ticket()),first,'same ticket is retryable');
  await api.dsh.open();assert.equal((await handoffs.open(ticket())).sessionId,first.sessionId);assert.equal(created.length,1);
  f.current(f.a);await f.commands.get('workbench-dsh')();
  assert.equal((await handoffs.open(ticket())).sessionId,first.sessionId,'starting from an ordinary child uses its parent transaction');
  const restored=new BindingStore(join(root,'bindings'));await restored.load();assert.equal(restored.bindings.has(first.sessionId),true);
  await api.dsh.open('new');const fresh=await handoffs.open(ticket());assert.notEqual(fresh.sessionId,first.sessionId);
  await api.dsh.open();assert.equal((await handoffs.open(ticket())).sessionId,fresh.sessionId,'continue chooses the recently used work session');
  await api.open(f.b);await api.dsh.open();const secondWork=await handoffs.open(ticket());
  assert.notEqual(secondWork.sessionId,fresh.sessionId);assert.equal(created.at(-1),join(materialRoot,'workspaces',f.b));
  assert.equal((await service.view(secondWork.sessionId)).blocks.length,1);
  await api.open(f.root);await api.dsh.open();assert.equal((await handoffs.open(ticket())).sessionId,fresh.sessionId,'returning to the first work resumes its own conversation');
  sessions.set('unrelated',{meta:{cwd:'/another-work'}});
  await api.dsh.open('current');assert.equal((await handoffs.open(ticket(),'unrelated')).conflict,true);assert.equal(store.bindings.has('unrelated'),false);
  const separate=await handoffs.open(ticket(),'unrelated',false,undefined,true);assert.notEqual(separate.sessionId,'unrelated');
  const count=created.length;await api.dsh.open();await f.commands.get('agent-workspace-stop')();
  await assert.rejects(handoffs.open(ticket()),/WORKSPACE_OFFLINE|CONNECTION_STALE|CONNECTION_REVOKED/);assert.equal(created.length,count);
  service.dispose();
 }finally{if(api)await f.unload();await server.close();await f.cleanup();await rm(root,{recursive:true,force:true});}
});

test('handoff expiry is visible and a missing DSH service produces no invitation',async()=>{
 const state=await realpath(await mkdtemp(join(tmpdir(),'dsh-expiry-'))),binding={scope:{graphId:'A:/A',rootUuid:'root'},directory:'/work',provider:'workspace',workspaceId:'workspace',organization:'flat'};
 try{
  const entry={instanceId:'instance',connectionId:'connection',binding,directory:'/work'};
  await assert.rejects(createDshHandoff(state,{entry,mode:'continue',title:'work'}),/请先启动 DSH/);
  await writeFile(browserDescriptor(state),JSON.stringify({schemaVersion:1,url:'http://127.0.0.1:3080/',pid:process.pid}));
  const invitation=await createDshHandoff(state,{entry,mode:'continue',title:'work'}),path=handoffPath(state,invitation.ticket);
  const raw=JSON.parse(await readFile(path,'utf8'));raw.createdAt-=700000;await writeFile(path,JSON.stringify(raw));
  const h=new DshHandoffs({service:{transport:{stateDirectory:state}},createSession:async()=>{throw Error('must not create');},renameSession:async()=>{}});
  await assert.rejects(h.open(invitation.ticket),{code:'DSH_HANDOFF_EXPIRED'});
  assert.equal((await stat(path)).mode&0o077,0);
 }finally{await rm(state,{recursive:true,force:true});}
});
