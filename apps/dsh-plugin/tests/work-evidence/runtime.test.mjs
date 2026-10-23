/* global URL */
/* global fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { EvidenceStore } from '../../../task-copilot-cli/src/work-evidence/store.ts';
import { reconstructionRuntime } from '../../src/work-evidence/runtime.mjs';
import { relatedContexts } from '../../src/work-evidence/contexts.mjs';
async function fixture(ctx = {}) {
  const output = resolve('tmp/work-evidence-reconstruction/tests/runtime'); await mkdir(output, { recursive: true });
  const root = await mkdtemp(join(output,'run-')), repo = join(root,'repo'); await mkdir(repo);
  const git = (...args) => execFileSync('git',args,{cwd:repo});
  git('init','-q'); git('config','user.name','Fixture'); git('config','user.email','fixture@example.invalid');
  await writeFile(join(repo,'one.txt'),'before\n'); await writeFile(join(repo,'two.txt'),'before\n'); git('add','.'); git('commit','-qm','baseline');
  const store = new EvidenceStore(join(root,'state')); await store.init(); const scope = await store.select(repo); await store.observe(scope.id);
  await writeFile(join(repo,'one.txt'),'after\n'); git('add','.'); git('commit','-qm','new committed work');
  await writeFile(join(repo,'two.txt'),'dirty\n'); const observation = await store.observe(scope.id);
  const p = { scopeId: scope.id, observationId: observation.value.id };
  const runtime = reconstructionRuntime(store,ctx), items = (await runtime.view(p)).items;
  return { root,repo,store,runtime,p,items,observation };
}
function streaming() {
  const requests = [], gates = [];
  return { requests,gates,ctx: { agentDefaultModel: { currentSelection: () => ({provider:'explicit-fixture',model:'test-double'}) }, llm: {
    async *stream(request) {
      requests.push(request); const input = JSON.parse(request.messages[0].content[0].text);
      await new Promise(resolve => gates.push(resolve));
      yield {type:'text-delta',text:JSON.stringify({explanation:`Explanation of ${input.file}`,group:'Same purpose',question:input.evidence.some(e=>e.kind==='user-clarification')?null:'Which outcome was intended?',uncertainties:['No test evidence'],evidenceRefs:[input.evidence[0].ref]})};
      yield {type:'finish',reason:{kind:'stop'}};
    },
  } } };
}
test('real store workflow: independent progress, local answer reanalysis, skip, immutable handoff/reopen/quote and receipt replay',async()=>{
  const m=streaming(),f=await fixture(m.ctx), [one,two]=f.items;
  await assert.rejects(f.runtime.analyze({...f.p,itemId:one.fact.id,requestId:randomUUID()}),/MODEL_CONSENT_REQUIRED/);
  const analyze=(item,requestId=randomUUID())=>f.runtime.analyze({...f.p,itemId:item.fact.id,allowModel:true,requestId});
  const id=randomUUID(); await analyze(one,id);
  let v=await f.runtime.view(f.p); assert.equal(v.items[0].state,'analyzing'); assert.equal(v.items[1].state,'pending');
  await analyze(one,id); assert.equal(m.requests.length,1);
  const early=await f.runtime.handoffDraft(f.p); assert.match(early.text,/尚未获得解释/);
  m.gates.shift()(); await f.runtime.settle(); await analyze(one,id); assert.equal(m.requests.length,1);
  await analyze(two);
  assert(JSON.parse(m.requests.at(-1).messages[0].content[0].text).evidence.some(e=>e.kind==='related-file-interpretation'));
  m.gates.shift()(); await f.runtime.settle();
  v=await f.runtime.view(f.p); assert(v.items.every(i=>i.state==='needs-clarification'));
  const answer={...f.p,itemId:one.fact.id,interpretationId:v.items[0].interpretation.id,text:'User intent for the first file',skipped:false,requestId:randomUUID()};
  await f.runtime.clarify(answer); await f.runtime.clarify(answer);
  assert.equal((await f.runtime.view(f.p)).items[0].state,'needs-reanalysis');
  const firstResult=v.items[0].interpretation.id, secondResult=v.items[1].interpretation.id;
  await analyze(one); v=await f.runtime.view(f.p); assert.equal(v.items[0].state,'reanalyzing'); assert.equal(v.items[0].interpretation.id,firstResult);
  const input=JSON.parse(m.requests.at(-1).messages[0].content[0].text); assert(input.evidence.some(e=>e.kind==='user-clarification'&&e.text.includes(answer.text)));
  await assert.rejects(f.runtime.clarify({...answer,requestId:randomUUID()}),/INTERPRETATION_CHANGED/);
  m.gates.shift()(); await f.runtime.settle(); v=await f.runtime.view(f.p);
  assert.equal(v.items[1].interpretation.id,secondResult); assert.equal(v.items[0].state,'interpreted');
  await f.runtime.clarify({...f.p,itemId:two.fact.id,interpretationId:secondResult,text:'',skipped:true,requestId:randomUUID()});
  const draft=await f.runtime.handoffDraft(f.p); assert.match(draft.text,/跳过澄清/); assert.match(draft.text,/User intent/);
  const saved=await f.runtime.saveHandoff({...f.p,...draft,requestId:randomUUID()});
  const edited=await f.runtime.saveHandoff({...f.p,...draft,text:draft.text+'\nUser revision',supersedesId:saved.value.id,requestId:randomUUID()});
  const restarted=new EvidenceStore(join(f.root,'state')); await restarted.init(); const rt=reconstructionRuntime(restarted,{});
  assert.equal((await rt.view(f.p)).handoffs.length,2); const quote=await rt.quoteHandoff({...f.p,handoffId:edited.value.id});
  assert.match(quote,/User revision/); assert(quote.includes(edited.hash)); assert(quote.includes(edited.value.id));
  const cli=fileURLToPath(new URL('../../../task-copilot-cli/src/work-evidence/main.ts',import.meta.url));
  const readback=JSON.parse(execFileSync(process.execPath,['--import','tsx',cli,join(f.root,'state'),'work',f.p.scopeId,f.p.observationId],{encoding:'utf8'}));
  assert.equal(readback.records.items.find(r=>r.value.id===edited.value.id).hash,edited.hash);
  assert.deepEqual(await restarted.observation(f.p.scopeId,f.p.observationId),f.observation);
  for(const path of await readdir(join(f.root,'state'))) if(path.endsWith('.json')) assert(!(await readFile(join(f.root,'state',path),'utf8')).includes('diff --git'));
});
test('missing model is a persisted local failure; restart distinguishes interrupted jobs and preserves earlier answers',async()=>{
 const f=await fixture(),item=f.items[0],p={...f.p,itemId:item.fact.id};
 await f.runtime.analyze({...p,allowModel:true,requestId:randomUUID()}); await f.runtime.settle();
 assert.equal((await f.runtime.view(f.p)).items[0].error,'MODEL_NOT_CONFIGURED');
 await f.store.appendWork(p.scopeId,p.observationId,{kind:'analysis-started',itemId:p.itemId,model:'crash-fixture'},randomUUID());
 assert.equal((await reconstructionRuntime(f.store,{}).view(f.p)).items[0].state,'interrupted');
});
test('related session reads only explicitly chosen matching cwd and visible bounded text; never changes binding or reads tools/secrets',async()=>{
 const f=await fixture(),calls=[];
 const ctx={sessionController:{async inspect(id){calls.push(id);return {meta:{cwd:f.repo},events:[
 {type:'user/message',seq:1,data:{content:[{type:'text',text:'intended outcome'}]}},
 {type:'tool/result',seq:2,data:{text:'secret tool body'}},
 {type:'assistant/message',seq:3,data:{message:{content:[{type:'text',text:'explanation'}]}}},
 {type:'user/message',seq:4,data:{content:[{type:'text',text:'api_key=DO_NOT_SEND'}]}},
 ]};}}};
 assert.deepEqual(await relatedContexts(ctx,f.observation.value,{}),{evidence:[],problems:[]}); assert.equal(calls.length,0);
 const result=await relatedContexts(ctx,f.observation.value,{sessionId:'chosen'}); assert.equal(calls.length,1); assert.equal(result.evidence.length,3);
 assert(result.evidence[0].ref.includes('event:1')); assert(!JSON.stringify(result).includes('DO_NOT_SEND')); assert(!JSON.stringify(result).includes('secret tool body'));
 ctx.sessionController.inspect=async()=>({meta:{cwd:f.root},events:[]});
 assert.equal((await relatedContexts(ctx,f.observation.value,{sessionId:'foreign'})).problems[0].code,'SESSION_SCOPE_MISMATCH');
});
test('Logseq context uses the existing exact directory grant over real loopback transport and never refreshes/binds/writes',async()=>{
 const {startWorkspaceServer}=await import('../../../task-copilot-cli/src/workspace-server.ts');
 const f=await fixture(),state=join(f.root,'workspace-state'),server=await startWorkspaceServer({stateDirectory:state});
 const binding={scope:{graphId:'Synthetic-only',rootUuid:randomUUID()},directory:f.repo,provider:'material-binding',workspaceId:null,organization:'flat'};
 const connectionId=randomUUID(),calls=[]; let matches=true,granted=true;
 try {
  const response=await fetch(server.descriptor.baseUrl+'/plugin/connect',{method:'POST',headers:{'content-type':'application/json','x-workspace-instance':server.descriptor.instanceId,'x-workspace-plugin':server.descriptor.pluginToken},body:JSON.stringify({connectionId,binding})});
  assert.equal(response.status,200); await writeFile(join(f.repo,'WORKSPACE.md'),'Explicit synthetic work entry');
  const poller=globalThis.setInterval(()=>{
   const call=server.broker.poll(connectionId);
   if(call){calls.push(call.command);server.broker.complete(connectionId,call.requestId,call.clientId,{scene:{binding,materials:[],savedSource:{sourceSetVersion:'version-one',capturedAt:new Date().toISOString(),blocks:[{sourceId:'block-one',parentUuid:null,content:'Synthetic Logseq work structure',contentVersion:'content-one'}]}},current:{sourceMatches:matches,permissions:{read:granted}}});}
  },5);
  try {
   const result=await relatedContexts({},f.observation.value,{logseq:true},undefined,{workspaceStateDirectory:state});
   assert.equal(result.problems.length,0,JSON.stringify(result.problems));assert.match(result.evidence[0].text,/Synthetic Logseq/);assert.match(result.evidence[0].ref,/version-one/);
   matches=false;assert.equal((await relatedContexts({},f.observation.value,{logseq:true},undefined,{workspaceStateDirectory:state})).evidence.length,0);
   matches=true;granted=false;assert.equal((await relatedContexts({},f.observation.value,{logseq:true},undefined,{workspaceStateDirectory:state})).evidence.length,0);
   const child=join(f.repo,'nested-repository');await mkdir(child);
   assert.equal((await relatedContexts({},{...f.observation.value,directory:child},{logseq:true},undefined,{workspaceStateDirectory:state})).problems[0].code,'LOGSEQ_SCOPE_MISMATCH');
   assert.deepEqual(calls,['collaboration.read','collaboration.read','collaboration.read']);
   assert.equal(server.broker.binding.directory,f.repo);
  } finally {globalThis.clearInterval(poller);}
 } finally {await server.close();}
});
test('large real commit/workspace diffs cannot crowd a saved clarification out of local reanalysis',async()=>{
 const m=streaming(),f=await fixture(m.ctx),git=(...args)=>execFileSync('git',args,{cwd:f.repo});
 for(let i=0;i<3;i++){await writeFile(join(f.repo,'one.txt'),`version ${i} `+'ordinary public example '.repeat(650)+'\n');git('add','--','one.txt');git('commit','-qm',`large commit ${i}`);}
 await writeFile(join(f.repo,'one.txt'),'staged '+ 'ordinary example '.repeat(850)+'\n');git('add','--','one.txt');
 await writeFile(join(f.repo,'one.txt'),'unstaged '+ 'ordinary example '.repeat(850)+'\n');
 const observation=await f.store.observe(f.p.scopeId),p={scopeId:f.p.scopeId,observationId:observation.value.id};
 const item=(await f.runtime.view(p)).items.find(i=>i.fact.path==='one.txt');
 const run=await f.store.appendWork(p.scopeId,p.observationId,{kind:'analysis-started',itemId:item.fact.id,model:'explicit-fixture'},randomUUID());
 const interpretation=await f.store.appendWork(p.scopeId,p.observationId,{kind:'analysis-result',itemId:item.fact.id,runId:run.value.id,interpretation:{explanation:'Previous understanding',group:'Work',question:'Intended outcome?',uncertainties:[],evidenceRefs:[]}},randomUUID());
 const answer='Important saved answer that must survive large diffs';
 await f.runtime.clarify({...p,itemId:item.fact.id,interpretationId:interpretation.value.id,text:answer,skipped:false,requestId:randomUUID()});
 await f.runtime.analyze({...p,itemId:item.fact.id,allowModel:true,requestId:randomUUID()});
 const input=JSON.parse(m.requests[0].messages[0].content[0].text);
 assert(input.evidence.some(e=>e.kind==='user-clarification'&&e.text.includes(answer)));
 assert(input.evidence.some(e=>e.kind==='git-diff'&&e.text&&e.truncated));assert(m.requests[0].messages[0].content[0].text.length<64000);
 m.gates.shift()();await f.runtime.settle();
});

test('model availability is read-only and refreshes after configuration without analysis', async () => {
  const ctx = { agentDefaultModel: { currentSelection: () => ({ provider: 'fixture', model: 'fixture' }) }, llm: { listProviders: () => [] } }; const f = await fixture(ctx);
  assert.equal((await f.runtime.view(f.p)).modelConfigured, false);
  let calls = 0;
  ctx.agentDefaultModel = { currentSelection: () => ({ provider: 'fixture', model: 'fixture' }) };
  ctx.llm = { listProviders: () => [{ id: 'fixture' }], stream: () => { calls++; throw Error('must not analyze'); } };
  assert.equal((await f.runtime.view(f.p)).modelConfigured, true);
  assert.equal(calls, 0);
  assert.equal((await f.store.workEvents(f.p.scopeId, f.p.observationId)).items.length, 0);
});
