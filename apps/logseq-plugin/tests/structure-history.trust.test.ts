import test from 'node:test';
import assert from 'node:assert/strict';
import { contentFixture, deferred } from './fixtures/content-writeback.ts';
import { installContentWriteback } from '../src/features/content-writeback/installer.ts';
import { installStageWorkbench } from '../src/features/stage-workbench/installer.ts';
import { historyPoints, structureFrame } from '../src/features/structure-history/model.ts';
import { StructureHistoryView } from '../src/features/structure-history/view.ts';
import { HistoryPlayer } from '../src/features/structure-history/player.ts';
import { createSharedUiPort, type WorkUiContext } from '../src/workspace/copilot-ui-port.ts';
import { historySourceOpener } from '../src/workspace/history-source-opener.ts';
import { sha256 } from '../src/workspace/source-protocol.ts';

async function scenario(){
 const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter}),stages=installStageWorkbench({content,storage:f.storage});
 await content.local.authorize(f.root);
 return {f,content,stages,close:async()=>{stages.dispose();content.dispose();await f.cleanup();}};
}
test('production Recorder/Store preserve parent order under backward/equal clocks and descendant depth under ancestor moves',async()=>{
 const t=await scenario(),RealDate=Date;let clock=Date.parse('2030-01-01T00:00:00Z');
 class ClockDate extends RealDate {constructor(value?:string|number){super(value??clock);}static now(){return clock;}}
 try{
  globalThis.Date=ClockDate as unknown as DateConstructor;
  const child=t.f.add('后代正文',t.f.a);
  const stage=await t.stages.api.begin({goal:'合成 Graph：因果时钟',requestKey:crypto.randomUUID(),expectedStageId:null});
  clock=Date.parse('2020-01-01T00:00:00Z');t.f.nativeMove(t.f.a,t.f.b,{children:true});
  const r1=await t.stages.api.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:crypto.randomUUID(),requestIds:[]});
  t.f.blocks.get(child.uuid)!.content='后代完整新正文\n<script>不是指令</script>';
  const r2=await t.stages.api.checkpoint({stageId:stage.start.id,expectedRevision:r1.id,requestKey:crypto.randomUUID(),requestIds:[]});
  const history=await t.stages.api.history(),points=historyPoints(history);assert.deepEqual(points.map(p=>p.id),[stage.start.id,r1.id,r2.id]);
  const n=structureFrame(points,1).nodes.find(n=>n.block.target.blockUuid===child.uuid)!;
  assert.ok(n.changes.includes('深度变化'));
  const partial=structuredClone(points);const unknown=partial[1]!.source.blocks.find(b=>b.target.blockUuid===child.uuid)!;unknown.availability='unavailable';unknown.content=null;unknown.contentVersion=null;
  const uncertain=structureFrame(partial,1).nodes.find(n=>n.block.target.blockUuid===child.uuid)!;assert.ok(uncertain.changes.includes('未知'));assert.ok(uncertain.changes.includes('深度变化'));assert.ok(!n.changes.includes('移动归属'));assert.equal(n.diff!.location!.before.depth+1,n.diff!.location!.after.depth);
  assert.ok(structureFrame(points,1).nodes.find(n=>n.block.target.blockUuid===t.f.b)!.changes.includes('顺序变化'));
  const frozen=JSON.stringify(points[0]!.source);t.f.blocks.get(child.uuid)!.content='今天再次改变';assert.equal(JSON.stringify(structureFrame(points,0).point!.source),frozen);
  clock=Date.parse('2010-01-01T00:00:00Z');const next=await t.stages.api.begin({goal:'倒拨后的新阶段',requestKey:crypto.randomUUID(),expectedStageId:stage.start.id});
  assert.deepEqual(historyPoints(await t.stages.api.history()).map(p=>p.id),[stage.start.id,r1.id,r2.id,next.start.id]);
 }finally{globalThis.Date=RealDate;await t.close();}
});

test('candidate, damaged, missing and unknown histories remain distinct; graph/list selection and all fallbacks are read only',async()=>{
 const t=await scenario();try{
  const stage=await t.stages.api.begin({goal:'合成 Graph：完整性与零写入',requestKey:crypto.randomUUID(),expectedStageId:null});
  t.f.blocks.get(t.f.a)!.content='TODO 保存版本';const r=await t.stages.api.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:crypto.randomUUID(),requestIds:[]});
  const candidateId=crypto.randomUUID();await t.stages.api.history();
  const {StageStore}=await import('../src/features/stage-workbench/store.ts');const store=new StageStore(t.f.storage);
  await store.append({schemaVersion:1,id:candidateId,scope:t.f.scope,stageId:stage.start.id,kind:'candidate',revision:{...r,id:crypto.randomUUID()},reason:'未采纳合成候选'});
  const history=await store.history(t.f.scope);assert.equal(historyPoints(history).length,2);assert.ok(historyPoints(history)[0]!.problems.some(p=>p.includes('候选')));
  const keys=await t.f.storage.allKeys() as string[];for(const key of keys.filter(k=>k.endsWith(candidateId)))await t.f.storage.setItem(key,'damaged');
  const damaged=await store.history(t.f.scope);assert.ok(damaged.problems.length);assert.equal(historyPoints(damaged).length,2);
  const snapshot=async()=>JSON.stringify(await Promise.all((await t.f.storage.allKeys() as string[]).sort().map(async k=>[k,await t.f.storage.getItem(k)])));
  const disk=await snapshot(),graph=JSON.stringify([...t.f.blocks]),counts=t.f.counts();
  let writeCalls=0;t.f.onWrite(async()=>{writeCalls++;throw Error('forbidden');});t.f.onInsert(async()=>{writeCalls++;throw Error('forbidden');});t.f.onIdentity(async()=>{writeCalls++;throw Error('forbidden');});t.f.onMove(async()=>{writeCalls++;throw Error('forbidden');});t.f.onStorage(async()=>{writeCalls++;throw Error('forbidden');});
  const view=new StructureHistoryView();document.body.append(view.element);view.update(history);
  view.element.querySelector<HTMLButtonElement>(`[data-history-node="${t.f.a}"]`)!.click();
  Array.from(view.element.querySelectorAll('button')).find(b=>b.textContent==='切换目录 / 差异')!.click();assert.match(view.element.querySelector('.wb-history-details')!.textContent!,/TODO 保存版本/);
  const slider=view.element.querySelector('input')!;slider.value='0';slider.dispatchEvent(new t.f.browser.Event('input') as unknown as Event);assert.match(view.element.querySelector('.wb-history-details')!.textContent!,/Alpha/);
  const partial=structuredClone(history);partial.stages[0]!.revisions[0]!.source.blocks[0]!.availability='missing';view.update(partial);assert.match(view.element.textContent!,/缺失|不可用/);
  // Real production storage above; enlarged snapshot below tests layout only, never a provider fixture.
  const large=structuredClone(history);const source=large.stages[0]!.revisions[0]!.source;source.blocks=Array.from({length:251},(_,i)=>({...source.blocks[0]!,sourceId:String(i),target:{...source.blocks[0]!.target,blockUuid:String(i)}}));
  const bigView=new StructureHistoryView();bigView.update(large);assert.equal(bigView.element.querySelectorAll('.wb-history-directory [data-history-node]').length,254);
  const fresh=new StructureHistoryView();const create=document.createElementNS.bind(document);document.createElementNS=((namespace:string|null,name:string,options?:ElementCreationOptions)=>{if(namespace==='http://www.w3.org/2000/svg')throw Error('SVG unavailable');return create(namespace,name,options);}) as typeof document.createElementNS;
  try{fresh.update(history);assert.ok(fresh.element.querySelector('.wb-history-directory'));assert.match(fresh.element.textContent!,/绘制失败/);}finally{document.createElementNS=create;}
  const width=window.innerWidth;Object.defineProperty(window,'innerWidth',{value:360,configurable:true});const narrow=new StructureHistoryView();narrow.update(history);assert.ok(narrow.element.querySelector('.wb-history-directory'));Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
  assert.equal(writeCalls,0);assert.equal(await snapshot(),disk);assert.equal(JSON.stringify([...t.f.blocks]),graph);
  assert.deepEqual(t.f.counts(),counts);
 }finally{await t.close();}
});

test('source opener checks current version and fences every async boundary, concurrent clicks and A-B-A generation changes',async()=>{
 const context:WorkUiContext={scope:{graphId:'graph',rootUuid:crypto.randomUUID()},binding:null,workObject:null,sessionId:'session',generation:1};
 let current:WorkUiContext|null=structuredClone(context),graph='graph',navigated=0,message='',hook:(()=>Promise<void>)|null=null;
 const uuid=crypto.randomUUID(),source={sourceId:JSON.stringify(['logseq','graph',uuid]),target:{kind:'logseq-block' as const,graphId:'graph',blockUuid:uuid},contentVersion:await sha256('old')};
 const opener=historySourceOpener({context:()=>current,notice:m=>{message=m;},host:{graphId:async()=>{if(hook)await hook();return graph;},block:async()=>({uuid,content:'today'}),navigate:async()=>{navigated++;}}});
 await opener.open(source,context);assert.match(message,/来源已变化/);assert.equal(navigated,1);
 for(const boundary of [1,2,3]){
  navigated=0;current=structuredClone(context);let calls=0;
  hook=async()=>{if(++calls===boundary)current={...context,generation:3};};
  await assert.rejects(opener.open(source,context),/STALE/);assert.equal(navigated,0);
 }
 current=structuredClone(context);hook=null;graph='foreign';await assert.rejects(opener.open(source,context),/GRAPH_CHANGED/);assert.equal(navigated,0);graph='graph';
 const gate=deferred<void>();let reads=0;hook=async()=>{if(++reads===1)await gate.promise;};
 const old=opener.open(source,context);await opener.open(source,context);gate.resolve();await assert.rejects(old,/STALE/);assert.equal(navigated,1);
 const blockGate=deferred<{uuid:string;content:string}|null>();navigated=0;
 const pending=historySourceOpener({context:()=>current,notice:()=>{},host:{graphId:async()=>graph,block:()=>blockGate.promise,navigate:async()=>{navigated++;}}});
 const request=pending.open(source,context);await new Promise(resolve=>setTimeout(resolve,0));current={...context,sessionId:'new-session'};blockGate.resolve({uuid,content:'old'});await assert.rejects(request,/STALE/);assert.equal(navigated,0);
 current=context;const missing=historySourceOpener({context:()=>current,notice:()=>{},host:{graphId:async()=>graph,block:async()=>null,navigate:async()=>{navigated++;}}});await assert.rejects(missing.open(source,context),/删除/);assert.equal(navigated,0);
});

test('async provider rejects late contexts, page scopes and unavailable providers; return uses original connected trigger',async()=>{
 const t=await scenario();try{
  const context:WorkUiContext={scope:t.f.scope,binding:null,workObject:null,sessionId:null,generation:1};let current:WorkUiContext|null=context;
  const pending=deferred<Awaited<ReturnType<typeof t.stages.api.history>>>();const trigger=document.createElement('button');document.body.append(trigger);
  const player=new HistoryPlayer({context:()=>current,cancel:()=>{},history:{read:()=>pending.promise},ui:node=>createSharedUiPort({readContext:()=>current,returnTarget:node})});
  player.enter(trigger);const read=player.read();current={...context,generation:2};pending.resolve({stages:[],current:null,currentEventId:null,problems:[]});await assert.rejects(read,/STALE/);
  current={...context,scope:{...t.f.scope,kind:'page',pageName:'page'}};await assert.rejects(player.read(),/BLOCK_SCOPE/);
  current=context;const returnPlayer=new HistoryPlayer({context:()=>current,cancel:()=>{},history:{read:async()=>({stages:[],current:null,currentEventId:null,problems:[]})},ui:node=>createSharedUiPort({readContext:()=>current,returnTarget:node})});
  await returnPlayer.read();document.body.append(returnPlayer.element);returnPlayer.enter(trigger);Array.from(returnPlayer.element.querySelectorAll('button')).find(b=>b.textContent==='返回触发位置')!.click();assert.equal(document.activeElement,trigger);
  player.reset();assert.match(player.element.textContent!,/尚无历史/);current=null;assert.doesNotThrow(()=>player.enter(trigger));
 }finally{await t.close();}
});

test('changing selection discards stale source errors and provider errors are visibly unavailable',async()=>{
 const t=await scenario();try{
  await t.stages.api.begin({goal:'合成 Graph：异步选择',requestKey:crypto.randomUUID(),expectedStageId:null});
  const pending=deferred<void>(),view=new StructureHistoryView({openSource:()=>pending.promise});view.update(await t.stages.api.history());document.body.append(view.element);
  view.element.querySelector<HTMLButtonElement>(`[data-history-node="${t.f.a}"]`)!.click();Array.from(view.element.querySelectorAll('button')).find(b=>b.textContent==='定位今天的来源块（与历史正文分开）')!.click();
  view.element.querySelector<HTMLButtonElement>(`[data-history-node="${t.f.b}"]`)!.click();pending.reject(Error('OLD_SOURCE_FAILURE'));await new Promise(resolve=>setTimeout(resolve,0));assert.ok(!view.element.textContent!.includes('OLD_SOURCE_FAILURE'));
  const context:WorkUiContext={scope:t.f.scope,binding:null,workObject:null,sessionId:null,generation:1};
  const player=new HistoryPlayer({context:()=>context,cancel:()=>{},ui:()=>createSharedUiPort({readContext:()=>context}),history:{read:async()=>{throw Error('PROVIDER_DISCONNECTED');}}});
  await assert.rejects(player.read(),/PROVIDER_DISCONNECTED/);assert.match(player.element.textContent!,/历史不可用/);assert.ok(!player.element.querySelector('[data-history-node]'));
 }finally{await t.close();}
});

test('production SourceReader plus Recorder/Store persist missing/unavailable observations without backfilling prior content',async()=>{
 const f=await contentFixture();const {SourceReader}=await import('../src/workspace/source-reader.ts'),{StageRecorder}=await import('../src/features/stage-workbench/recorder.ts'),{StageStore}=await import('../src/features/stage-workbench/store.ts');
 let availability:'available'|'missing'|'unavailable'='available';
 const reader=new SourceReader({graphId:async()=>f.scope.graphId,getBlock:async(uuid,options)=>{if(availability==='missing')return null;if(availability==='unavailable')throw Error('synthetic host read denied');return logseq.Editor.getBlock(uuid,options);}});
 const store=new StageStore(f.storage),recorder=new StageRecorder(store,{scope:()=>f.scope,read:()=>reader.read(f.scope,()=>true),result:async()=>null,history:async()=>[],file:async()=>{throw Error('not used');}});
 try{
  const stage=await recorder.begin({goal:'合成 Graph：真实读取缺失',requestKey:crypto.randomUUID(),expectedStageId:null});
  availability='missing';const missing=await recorder.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:crypto.randomUUID(),requestIds:[]});
  availability='unavailable';await recorder.checkpoint({stageId:stage.start.id,expectedRevision:missing.id,requestKey:crypto.randomUUID(),requestIds:[]});
  const history=await store.history(f.scope),points=historyPoints(history);assert.equal(points[1]!.source.blocks[0]!.availability,'missing');assert.equal(points[2]!.source.blocks[0]!.availability,'unavailable');
  const frame=structureFrame(points,1);assert.ok(frame.nodes.every(n=>!n.deleted));assert.ok(frame.nodes.find(n=>n.block.target.blockUuid===f.a)!.absentUnknown);
  const view=new StructureHistoryView();view.update(history);const slider=view.element.querySelector('input')!;slider.value='1';slider.dispatchEvent(new f.browser.Event('input') as unknown as Event);view.element.querySelector<HTMLButtonElement>(`[data-history-node="${f.a}"]`)!.click();
  const texts=Array.from(view.element.querySelectorAll('.wb-history-details pre')).map(n=>n.textContent);assert.match(texts[0]!,/没有原文/);assert.match(texts[1]!,/Alpha/);
 }finally{recorder.dispose();await f.cleanup();}
});
