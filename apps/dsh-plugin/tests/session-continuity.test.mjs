import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {BindingStore, WorkbenchService} from '../src/service.mjs';
import {DshHandoffs} from '../src/handoff.mjs';
import {handoffPath} from '../../task-copilot-cli/src/dsh-handoff.ts';
import {workRefFromBinding} from '@task-copilot/contracts';

async function fixture(t) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'work-continuity-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const directory=join(root,'work'),state=join(root,'state'); await mkdir(directory);await mkdir(join(state,'dsh-handoffs'),{recursive:true});
  const binding={scope:{graphId:'isolated:/graph',rootUuid:randomUUID()},directory,provider:'workspace',workspaceId:'stable-workspace',organization:'flat'};
  const entry={directory,binding,connectionId:'live-connection',instanceId:'live-instance'}, workRef=workRefFromBinding(binding);
  const sessions=new Map(),archived=[],calls=[];let referenceFails=false,createResponseLost=false;
  const store=new BindingStore(join(root,'bindings'));await store.load();
  const service=new WorkbenchService({store,inspectSession:async id=>{
    if(!sessions.has(id))throw Object.assign(Error('missing'),{code:'session/not-found'});return sessions.get(id);
  },transport:{stateDirectory:state,entry:async()=>entry,call:async(_entry,command)=>{
    calls.push(command);if(command==='sessions.add'&&referenceFails)throw Error('reference disk failed');return {};
  }}});
  const handoffs=new DshHandoffs({service,listSessionIds:async()=>[...sessions.keys()],archivedSessions:async()=>archived,renameSession:async()=>{},createSession:async({cwd=join(root,'general'),sessionId=`session-${randomUUID()}`})=>{
    sessions.set(sessionId,{meta:{cwd},events:[]});calls.push('native.create');
    if(createResponseLost){createResponseLost=false;throw Error('lost creation response');}
    return {sessionId};
  }});
  const ticket=async(mode='continue')=>{
    const id=randomUUID();await writeFile(handoffPath(state,id),JSON.stringify({schemaVersion:1,ticket:id,createdAt:Date.now(),mode,title:'isolated work',entry,workRef}),{mode:0o600});return id;
  };
  return {root,directory,state,binding,workRef,sessions,archived,calls,store,service,handoffs,ticket,failReference:()=>{referenceFails=true;},loseResponse:()=>{createResponseLost=true;}};
}
test('actual opens override binding insertion and survive restart; General stays independent',async t=>{
  const f=await fixture(t),one=await f.handoffs.open(await f.ticket());
  await f.handoffs.opened(one.sessionId);
  const two=await f.handoffs.newWork(one.sessionId,randomUUID());
  await f.handoffs.opened(two.sessionId);await f.handoffs.opened(one.sessionId);
  assert.equal((await f.handoffs.open(await f.ticket())).sessionId,one.sessionId);
  const disk=new BindingStore(f.store.directory);await disk.load();
  assert.equal(disk.recent(f.workRef)[0].sessionId,one.sessionId);
  const general=await f.handoffs.general();await f.handoffs.opened(general.sessionId);
  assert.equal(f.store.associations.get(general.sessionId).workRef,undefined);
  assert.equal(f.store.bindings.has(one.sessionId),true);
  assert.equal((await f.handoffs.general()).sessionId,general.sessionId);
  assert.deepEqual(f.sessions.get(two.sessionId).events,[]);
  assert.equal(f.sessions.get(two.sessionId).meta.cwd,f.directory);
  const persisted=JSON.parse(await readFile(join(f.store.directory,'bindings.json'),'utf8'));
  assert.ok(persisted.bindings.every(row=>!('messages'in row)&&!('events'in row)&&!('draft'in row)));
});
test('auxiliary reference failure and lost native-create reply retry without duplicates',async t=>{
  const f=await fixture(t),ticket=await f.ticket();f.failReference();f.loseResponse();
  await assert.rejects(f.handoffs.open(ticket),/lost creation response/);
  const retry=await f.handoffs.open(ticket);
  assert.deepEqual(retry.warnings,['SESSION_REFERENCE_PENDING']);
  assert.equal((await f.handoffs.open(ticket)).sessionId,retry.sessionId);
  assert.equal(f.calls.filter(c=>c==='native.create').length,1);
  assert.ok(!f.calls.some(c=>/prompt|submit|collaboration/.test(c)));
});
test('archived/missing sessions are skipped; mismatched cwd never rebinds and explicit new preserves old input',async t=>{
  const f=await fixture(t),one=await f.handoffs.open(await f.ticket());await f.handoffs.opened(one.sessionId);
  f.archived.push(one.sessionId);
  const two=await f.handoffs.open(await f.ticket());assert.notEqual(two.sessionId,one.sessionId);
  await f.handoffs.opened(two.sessionId);
  f.sessions.get(two.sessionId).meta.cwd=f.root;f.sessions.get(two.sessionId).draft='preserved by native host';
  await assert.rejects(f.handoffs.open(await f.ticket()),{code:'SESSION_CWD_MISMATCH'});
  await assert.rejects(f.service.command(two.sessionId,'source.read',{}),{code:'SESSION_CWD_MISMATCH'});
  const correct=await f.handoffs.newWork(two.sessionId,randomUUID());
  assert.equal(f.sessions.get(correct.sessionId).meta.cwd,f.directory);
  assert.equal(f.sessions.get(two.sessionId).draft,'preserved by native host');
  assert.equal(f.store.bindings.get(two.sessionId).directory,f.directory);
});
test('v1 binding migration derives identity, never invents an opened timestamp',async t=>{
  const f=await fixture(t);await writeFile(join(f.store.directory,'bindings.json'),JSON.stringify({schemaVersion:1,bindings:[{sessionId:'legacy',binding:f.binding}]}),{mode:0o600});
  const restored=new BindingStore(f.store.directory);await restored.load();
  assert.deepEqual(restored.associations.get('legacy').workRef,f.workRef);assert.equal(restored.associations.get('legacy').lastOpenedAt,0);
});
