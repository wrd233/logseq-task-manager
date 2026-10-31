import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {BindingStore,WorkbenchService} from '../src/service.mjs';
import {DshHandoffs} from '../src/handoff.mjs';
import {publishCatalog,readCatalog} from '../../task-copilot-cli/src/work-catalog.ts';

test('offline discovery enters never-bound work, recovers lost create replies, keeps General and same-title works separate', async t => {
  const root=await realpath(await mkdtemp(join(tmpdir(),'discovery-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=new BindingStore(join(root,'bindings'));await store.load();
  const sessions=new Map(),archived=[];let creates=0,lose=false;
  const service=new WorkbenchService({store,inspectSession:async id=>sessions.get(id),transport:{stateDirectory:root,entry:()=>{throw Error('Must not need active Logseq');},call:()=>{throw Error('Discovery must not read source');}}});
  const handoffs=new DshHandoffs({service,listSessionIds:async()=>[...sessions.keys()],archivedSessions:async()=>archived,renameSession:async()=>{},createSession:async({cwd=root,sessionId=`session-${randomUUID()}`})=>{
    creates++;sessions.set(sessionId,{meta:{cwd},messages:[],draft:''});if(lose){lose=false;throw Error('lost reply');}return {sessionId};
  }});
  const work=id=>({workRef:{kind:'logseq',graphId:'g',rootUuid:id,sourceKind:'block'},title:'同名',objectType:'事务',location:'g/page',updatedAt:1});
  const operation=randomUUID();lose=true;
  await assert.rejects(handoffs.enterCatalog(work('one'),operation),/lost reply/);
  const one=await handoffs.enterCatalog(work('one'),operation);assert.equal(creates,1);
  await handoffs.opened(one.sessionId);sessions.get(one.sessionId).draft='native draft stays';
  assert.equal((await handoffs.enterCatalog(work('one'),randomUUID())).sessionId,one.sessionId);
  const two=await handoffs.enterCatalog(work('two'),randomUUID());assert.notEqual(two.sessionId,one.sessionId);
  const general=await handoffs.general();assert.equal(store.associations.get(general.sessionId).workRef,undefined);
  const blank=await handoffs.newWork(one.sessionId,randomUUID());assert.notEqual(blank.sessionId,one.sessionId);
  assert.deepEqual(sessions.get(blank.sessionId).messages,[]);assert.equal(store.bindings.size,0);
  assert.equal(sessions.get(one.sessionId).draft,'native draft stays');
  archived.push(one.sessionId);await handoffs.opened(blank.sessionId);
  assert.equal((await handoffs.enterCatalog(work('one'),randomUUID())).sessionId,blank.sessionId);
  const restored=new BindingStore(store.directory);await restored.load();assert.equal(restored.recent(work('one').workRef)[0].sessionId,blank.sessionId);
  await assert.rejects(service.binding(blank.sessionId),{code:'SESSION_NOT_BOUND'});
  const directory=join(root,'registered');await mkdir(directory);
  const registered={...work('registered'),directory};
  const inDirectory=await handoffs.enterCatalog(registered,randomUUID());
  assert.equal(sessions.get(inDirectory.sessionId).meta.cwd,directory);assert.equal(store.bindings.has(inDirectory.sessionId),false);
  await assert.rejects(handoffs.enterCatalog({...registered,directory:root},randomUUID()),{code:'SESSION_CWD_MISMATCH'});
  const corrected=await handoffs.newWork(inDirectory.sessionId,randomUUID(),undefined,{...registered,directory:root});
  assert.equal(sessions.get(corrected.sessionId).meta.cwd,root);assert.equal(sessions.get(inDirectory.sessionId).meta.cwd,directory);
});

test('derived snapshots replace only their Graph and retain explicit pages across refreshes', async t=>{
  const state=await mkdtemp(join(tmpdir(),'catalog-'));t.after(()=>rm(state,{recursive:true,force:true}));await mkdir(state,{recursive:true});
  const snapshot=(graphId,works=[])=>({schemaVersion:1,graphId,graphName:graphId,refreshedAt:Date.now(),works});
  const page={workRef:{kind:'logseq',graphId:'a',rootUuid:'page-uuid',sourceKind:'page'},title:'明确加入页面',objectType:'页面',location:'a/page',updatedAt:1};
  await publishCatalog(state,snapshot('a',[page]));await publishCatalog(state,snapshot('b'));await publishCatalog(state,snapshot('a',[{...page,title:'页面新名称'}]));
  const graphs=await readCatalog(state);assert.equal(graphs.length,2);assert.equal(graphs.find(graph=>graph.graphId==='a').works[0].title,'页面新名称');
  await assert.rejects(publishCatalog(state,{...snapshot('a'),binding:{grant:true}}));
  assert.equal((await readCatalog(state)).length,2);
});
