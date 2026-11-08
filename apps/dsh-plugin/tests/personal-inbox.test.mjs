import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readFile, realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {PersonalInboxStore, personalInboxDirectory} from '../src/personal-inbox/store.mjs';
import {installPersonalInboxHost} from '../src/personal-inbox/host.mjs';
import {PlannerStore} from '../src/planner-store.mjs';

async function scene(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-inbox-'))); t.after(() => rm(root, {recursive:true, force:true}));
  const store = new PersonalInboxStore(join(root,'personal')); await store.load();
  return {store, root};
}
const create = (store, originalContent='一句话就保存', source=null) => store.create({id:randomUUID(), originalContent, source});
const change = (store, item, action, extra={}) => store.change({id:item.id, revision:item.revision, action, ...extra});
const ref = id => ({kind:'logseq', graphId:'图 A', rootUuid:id, sourceKind:'block'});

test('capture, user edit, context and Work remain separate; stale edits fail; archive restores resolved', async t => {
  const {store} = await scene(t); let item = await create(store);
  assert.equal(item.workRef,null); assert.equal(item.status,'open'); assert.equal(item.stage,'new');
  await assert.rejects(change(store,item,'edit',{content:'Agent 改写'}),{code:'INBOX_CONFIRM_REQUIRED'});
  item = await change(store,item,'edit',{content:'用户修改',confirmed:true});
  assert.equal(item.originalContent,'一句话就保存'); assert.equal(item.content,'用户修改');
  await assert.rejects(store.change({id:item.id,revision:1,action:'update',patch:{context:'旧会话结果'}}),{code:'INBOX_CONFLICT'});
  item = await change(store,item,'update',{patch:{context:'补充背景',materials:[{label:'讨论',locator:'https://example.test/discussion'}],workRef:ref('A')}});
  assert.equal(item.stage,'developing'); assert.equal(item.status,'open');
  item = await change(store,item,'update',{patch:{workRef:ref('B')}}); assert.equal(item.workRef.rootUuid,'B');
  item = await change(store,item,'update',{patch:{workRef:null}}); assert.equal(item.workRef,null);
  item = await change(store,item,'undo'); assert.equal(item.workRef.rootUuid,'B');
  item = await change(store,item,'update',{patch:{status:'resolved'}});
  item = await change(store,item,'archive'); assert.equal(item.archivedFrom,'resolved');
  assert.equal((await store.list()).items.length,0);
  assert.equal((await store.list({status:'archived'})).items.length,1);
  item = await change(store,item,'restore'); assert.equal(item.status,'resolved');
  assert.equal(item.originalContent,'一句话就保存'); assert.equal(item.context,'补充背景');
});

test('15 representative records survive new store instances and isolated profile/session contexts; search, backup, recovery', async t => {
  const {store,root} = await scene(t);
  for(let i=0;i<15;i++) await create(store,`记录 ${i}：${['设备到货','插件想法','生活安排'][i%3]}`,{type:i%2?'flomo':'dsh',sessionId:`session-${i%3}`});
  const reopened = new PersonalInboxStore(store.directory);
  assert.equal((await reopened.list()).items.length,15);
  assert.equal((await reopened.list({query:'设备 到货'})).items.length,5);
  assert.equal((await reopened.list({sourceType:'flomo'})).items.length,7);
  assert.equal((await reopened.list({linked:false})).items.length,15);
  assert.equal(personalInboxDirectory({},root),join(root,'.dsh','personal-data','inbox-v1'));
  assert.equal(personalInboxDirectory({DSH_HOME:root,DSH_PROFILE:'A'},'/else'),personalInboxDirectory({DSH_HOME:root,DSH_PROFILE:'B'},'/other'));
  assert.throws(()=>personalInboxDirectory({PERSONAL_INBOX_HOME:'relative'}),{code:'INBOX_ABSOLUTE_PATH_REQUIRED'});
  const backup=await reopened.export(), recovered=new PersonalInboxStore(join(root,'recovered'));
  assert.equal((await recovered.import(backup)).imported.length,15);
  assert.equal((await recovered.import(backup)).skipped.length,15);
  assert.equal((await recovered.list()).items.length,15);
  backup.items[0].originalContent='不得覆盖';
  assert.equal((await recovered.import(backup)).conflicts.length,1);
  const broken=randomUUID(); await writeFile(join(store.directory,`${broken}.json`),'broken');
  assert.equal((await store.list()).problems.length,1);
  await assert.rejects(store.export(),{code:'INBOX_BACKUP_INCOMPLETE'});
});

test('same capture ID recovers lost reply and conflicting concurrent edits preserve the winner',async t=>{
  const {store}=await scene(t), input={id:randomUUID(),originalContent:'  原文空格\n保留  '};
  const [a,b]=await Promise.all([store.create(input),store.create(input)]); assert.equal(a.id,b.id);
  assert.equal((await store.list()).items.length,1);
  await assert.rejects(store.create({...input,originalContent:'不同内容'}),{code:'INBOX_ID_REUSED'});
  const results=await Promise.allSettled([change(store,a,'update',{patch:{context:'A'}}),change(store,b,'update',{patch:{context:'B'}})]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.equal((await store.get(a.id)).context,'A');
});

test('conversion intent survives target success / lost reply; retries deduplicate; backup keeps outcomes and source',async t=>{
  const {store}=await scene(t), item=await create(store), operationId=randomUUID();
  const input={id:item.id,revision:item.revision,operationId,kind:'planner',confirmed:true,resolve:true,parameters:{entry:{title:'安排'}}};
  let calls=0;
  await assert.rejects(store.convert(input,async()=>{calls++;throw Error('reply lost');}),/reply lost/);
  assert.equal((await store.get(item.id)).originalContent,item.originalContent);
  await assert.rejects(change(store,await store.get(item.id),'archive'),{code:'INBOX_CONVERSION_PENDING'});
  const recovered=new PersonalInboxStore(store.directory);
  const result=await recovered.convert(input,async()=>{calls++;return {entryId:'planner-one'};});
  assert.equal(result.status,'resolved');assert.equal(result.outcomes[0].inboxId,item.id);
  await recovered.convert(input,()=>{throw Error('should never repeat');}); assert.equal(calls,2);
  await assert.rejects(recovered.convert({...input,resolve:false},()=>{}),{code:'INBOX_OPERATION_REUSED'});
  const backup=await recovered.export(); const restored=new PersonalInboxStore(join(store.directory,'restore'));
  await restored.import(backup); await restored.convert(input,()=>{throw Error('restored receipt must deduplicate');});
  assert.equal((await restored.get(item.id)).originalContent,item.originalContent);
});

test('real Planner API preserves backlink and exactly one target even after its undo or deletion',async t=>{
  const {root}=await scene(t), planner={store:new PlannerStore(join(root,'planner'))};await planner.store.load();
  const host=await installPersonalInboxHost({directory:join(root,'inbox'),planner,service:{transport:{stateDirectory:root}},handoffs:{}});
  const item=await host.routes['inbox-create']({id:randomUUID(),originalContent:'今晚整理材料'});
  const input={id:item.id,revision:item.revision,operationId:randomUUID(),kind:'planner',confirmed:true,resolve:true,
    parameters:{entry:{title:'整理材料',date:'2026-11-08',slotId:'slot-evening'}}};
  const result=await host.routes['inbox-convert'](input);
  assert.equal(result.outcomes.length,1); assert.equal(planner.store.read().entries.length,1);
  const entry=planner.store.read().entries[0];assert.equal(entry.inboxRef.inboxId,item.id);
  await planner.store.change({action:'save',revision:planner.store.read().revision,entry:{...entry,title:'用户改名'}});
  assert.equal(planner.store.read().entries[0].inboxRef.inboxId,item.id);
  await planner.store.change({action:'delete',revision:planner.store.read().revision,id:entry.id});
  const saved=new PlannerStore(planner.store.directory);await saved.load();
  const retry=await saved.change({action:'fromInbox',revision:saved.read().revision,entry:input.parameters.entry,inboxRef:{inboxId:item.id,operationId:input.operationId}});
  assert.equal(retry.inboxEntryId,entry.id);assert.equal(retry.entries.length,0);
  const raw=JSON.parse(await readFile(saved.path,'utf8'));assert.ok(raw.inboxReceipts[input.operationId]);
});

test('host offline CRUD, verified Logseq import, explicit formal confirmation and source navigation',async t=>{
  const {root}=await scene(t), planner={store:new PlannerStore(join(root,'planner'))};await planner.store.load();
  let online=true, kernelCalls=0;const navigations=[];
  const service={transport:{stateDirectory:root},command:async()=>{
    if(!online)throw Error('Logseq offline');
    return {freshness:'checked',source:{sourceId:'source-block',availability:'available',content:'原始 Logseq 块',contentVersion:'v1',target:{kind:'logseq-block',graphId:'图 A',blockUuid:'block-uuid'}}};
  }};
  const host=await installPersonalInboxHost({directory:join(root,'inbox'),service,planner,
    handoffs:{enterCatalog:async(work,operationId)=>{navigations.push({work,operationId});return {sessionId:'work-session'};}},
    kernelClient:async()=>({createInboxTask:async input=>{kernelCalls++;assert.equal(input.confirmed,true);assert.equal(input.graphId,'图 A');return {commit:{id:'commit-1',targetId:'task-1'}};}})});
  const route=host.routes;
  const imported=await route['inbox-import-logseq']({id:randomUUID(),sessionId:'s1',sourceId:'source-block'});
  assert.equal(imported.source.graphId,'图 A'); assert.equal(imported.source.blockUuid,'block-uuid');assert.equal(imported.workRef,null);
  online=false;
  assert.equal((await route['inbox-import-logseq']({id:imported.id,sessionId:'s1',sourceId:'source-block'})).id,imported.id);
  const manual=await route['inbox-create']({id:randomUUID(),originalContent:'Flomo 粘贴内容',source:{type:'flomo'}});
  await route['inbox-update']({id:manual.id,revision:manual.revision,patch:{context:'离线补充'}});
  assert.equal((await route['inbox-list']({query:'离线'})).items.length,1);
  const formal={id:imported.id,revision:imported.revision,operationId:randomUUID(),kind:'formal-task',parameters:{title:'正式任务'}};
  await assert.rejects(route['inbox-convert'](formal),{code:'INBOX_CONFIRM_REQUIRED'});assert.equal(kernelCalls,0);
  const result=await route['inbox-convert']({...formal,confirmed:true});assert.equal(kernelCalls,1);assert.equal(result.originalContent,imported.originalContent);
  assert.equal(result.outcomes[0].reference.workRef.objectId,'task-1');assert.equal(result.status,'open');
  const developed=await route['inbox-convert']({id:result.id,revision:result.revision,operationId:randomUUID(),kind:'work',confirmed:true,parameters:{}});
  assert.deepEqual(developed.workRef,{kind:'kernel',objectId:'task-1'});assert.deepEqual(navigations[0].work.workRef,{kind:'kernel',objectId:'task-1'});
});

test('selected Inbox native reference quotes original and context, never submits or replaces the native draft',async()=>{
  const {inboxReference,inboxReferenceCodec,insertInboxReference}=await import('../src/personal-inbox/reference.mjs');
  const item={id:randomUUID(),revision:2,originalContent:'原始记录',editedContent:'用户编辑',context:'补充背景',source:{type:'flomo'},workRef:null,materials:[]};
  const reference=inboxReference(item), saved=JSON.parse(reference.ref);
  assert.equal(saved.originalContent,'原始记录');assert.equal(saved.context,'补充背景');
  assert.match(await inboxReferenceCodec.serialize(reference.ref),/quoted user data/);
  let inserted;
  const result=await insertInboxReference({captureInsertion:()=>({start:1,end:5,revision:7})},item,async(ref,span)=>{inserted={ref,span};return true;});
  assert.equal(result,true);assert.deepEqual(inserted.span,{start:5,end:5,revision:7});assert.equal(inserted.ref.source,'Personal Inbox');
});

test('a rejected conversion allows editing, but cannot be retried on an archived record or over another pending result',async t=>{
  const {store}=await scene(t),item=await create(store),operationId=randomUUID();
  const input={id:item.id,revision:item.revision,operationId,kind:'planner',confirmed:true,parameters:{entry:{title:'稍后处理'}}};
  await assert.rejects(store.convert(input,async()=>{throw Object.assign(Error('invalid date'),{code:'PLANNER_INVALID'});}),{code:'PLANNER_INVALID'});
  let current=await store.get(item.id);assert.equal(current.pendingConversion,null);
  current=await change(store,current,'archive');
  await assert.rejects(store.convert({...input,revision:current.revision},()=>{throw Error('must not create target');}),{code:'INBOX_RESTORE_REQUIRED'});
  current=await change(store,current,'restore');
  await assert.rejects(store.convert({...input,revision:current.revision,operationId:randomUUID()},async()=>{throw Error('unknown response');}),/unknown response/);
  current=await store.get(item.id);assert.ok(current.pendingConversion.operationId);
  await assert.rejects(store.convert({...input,revision:current.revision},()=>{throw Error('must not create target');}),{code:'INBOX_CONVERSION_PENDING'});
});

test('registered host RPC uses one application store across separately installed profile hosts, without requiring a Session',async t=>{
  const {root}=await scene(t);
  const {apply}=await import('../src/index.mjs');
  const process=(await import('node:process')).default;
  const previous=process.env.PERSONAL_INBOX_HOME;process.env.PERSONAL_INBOX_HOME=join(root,'shared-user-data');
  t.after(()=>{if(previous===undefined)delete process.env.PERSONAL_INBOX_HOME;else process.env.PERSONAL_INBOX_HOME=previous;});
  const host=async profile=>{
    const routes=new Map(),disposers=[];
    await apply({on(name,handler){if(name==='dispose')disposers.push(handler);},tools:{register(){}},systemPrompt:{section(){},context(){}},
      connection:{fetch:{register(route){routes.set(route.path,route);}}},sessionController:{inspect:async()=>{throw Error('No Session available');}}},
    {bindingStateDirectory:join(root,profile),workspaceStateDirectory:join(root,'workspace-state')});
    t.after(async()=>{for(const dispose of disposers)await dispose();});
    return async(method,payload)=>{
      const route=routes.get(`/api/logseq-workbench/${method}`);
      const response=await route.fetch(new globalThis.Request(`http://127.0.0.1${route.path}`,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({type:'client-request',method:`logseq-workbench/${method}`,rpcId:randomUUID(),payload})}));
      const result=(await response.json()).result;
      if(!result.ok)throw Object.assign(Error(result.error.message),{code:result.error.code});return result.value;
    };
  };
  const first=await host('profile-a');
  const item=await first('inbox-create',{id:randomUUID(),originalContent:'应用级跨 Profile 保存'});
  const second=await host('profile-b');
  assert.equal((await second('inbox-list',{})).items[0].id,item.id);
  const edited=await second('inbox-update',{id:item.id,revision:item.revision,patch:{context:'另一个处理现场'}});
  assert.equal((await first('inbox-get',{id:item.id})).context,edited.context);
  await assert.rejects(first('inbox-create',{id:randomUUID(),originalContent:'不要按会话存',sessionId:'owner'}),{code:'INBOX_INVALID'});
});
