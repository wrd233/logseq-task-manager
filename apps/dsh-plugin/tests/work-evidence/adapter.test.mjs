/* global Request */
import test from 'node:test';import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';import { resolve, join } from 'node:path';import {execFileSync} from 'node:child_process';
import {apply} from '../../src/work-evidence/index.mjs';import {insertEvidence} from '../../src/work-evidence/draft.mjs';
test('UI-only RPC uses real Git and disk, rejects foreign scope and invalid envelopes, never touches session/tools',async()=>{
 const output=resolve('tmp/work-evidence/adapter-tests');await mkdir(output,{recursive:true});const root=await mkdtemp(join(output,'host-')),repo=join(root,'repo');await mkdir(repo);execFileSync('git',['init','-q'],{cwd:repo});await writeFile(join(repo,'external.txt'),'not archived');const routes=new Map();
 const ctx={connection:{fetch:{register:route=>routes.set(route.path,route)}}};for(const name of ['tools','systemPrompt','sessionController'])Object.defineProperty(ctx,name,{get(){return assert.fail(`forbidden ${name}`);}});
 await apply(ctx,{stateDirectory:join(root,'state')});
 const rpc=async(method,payload)=>{const response=await routes.get(`/api/work-evidence/${method}`).fetch(new Request('http://localhost',{method:'POST',body:JSON.stringify({type:'client-request',rpcId:'test',method:`work-evidence/${method}`,payload})}));return (await response.json()).result;};
 const scope=(await rpc('select',{directory:repo})).value,o=(await rpc('observe',{scopeId:scope.id})).value;
 assert.equal(o.value.files[0].path,'external.txt');assert.equal((await rpc('quote',{scopeId:scope.id,observationId:o.value.id,paths:['external.txt']})).ok,true);
 assert.equal((await rpc('read',{scopeId:'00000000-0000-0000-0000-000000000000',observationId:o.value.id})).ok,false);
 const invalid=await routes.get('/api/work-evidence/scopes').fetch(new Request('http://localhost',{method:'POST',body:'{}'}));assert.equal(invalid.status,400);
 assert.deepEqual([...routes.keys()].sort(),['scopes','select','observe','history','read','note','diff','quote'].map(p=>`/api/work-evidence/${p}`).sort());
});
test('native draft insertion preserves concurrent typing, refuses stale spans and never submits/replaces',async()=>{
 let revision=1,text='existing draft',sent=0;const native={captureInsertion:()=>({revision}),insertText:(value,span)=>{if(span.revision!==revision)return false;text+=value;return true;}};
 for(const key of ['submit','setDraft','followup'])Object.defineProperty(native,key,{get(){sent++;return assert.fail('must not submit or replace');}});
 await insertEvidence(native,async()=> ' quote');assert.equal(text,'existing draft quote');assert.equal(sent,0);
 await assert.rejects(insertEvidence(native,async()=>{revision++;text+=' user typing';return ' late quote';}),/草稿正在提交/);assert.equal(text,'existing draft quote user typing');
});
