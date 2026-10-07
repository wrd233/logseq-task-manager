// Runs only the shipped companion CLI against a locally connected owned Graph.
// It grants no authority, injects no host methods and never writes Graph source.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(repo,'tmp/reading-desktop'),evidence=join(root,'evidence'),exec=promisify(execFile);
const cli=async(words,input,client='reading-acceptance')=>{
  const options=[];if(input!==undefined){const path=join(evidence,'input.json');await writeFile(path,JSON.stringify(input));options.push('--input-file',path);}
  const result=await exec(process.execPath,[join(repo,'apps/logseq-plugin/dist/workspace.mjs'),'workspace',...words,...options,'--directory',join(root,'work'),'--state-dir',join(root,'channel'),'--client',client,'--json'],{cwd:repo,timeout:30000,maxBuffer:4_194_304});
  return JSON.parse(result.stdout);
};
const hash=value=>createHash('sha256').update(value).digest('hex');
const page=join(root,'graph/pages/合成阅读与协作.md'),before=await readFile(page),status=await cli(['status']);
assert.equal(status.channel,'online');assert.equal(status.authorizesTodo,false);assert.equal(status.capabilities.reading,true);
const request=await cli(['reading','request','--purpose','保留完整原句，连续和对照阅读']);assert.equal(request.ok,true);
await writeFile(join(evidence,'request.json'),JSON.stringify(request,null,2)+'\n');
const source=request.value.source,ids=source.blocks.map(block=>block.sourceId);assert.equal(source.blocks.length,101);assert.equal(Math.max(...source.blocks.map(block=>block.depth)),3);
const common={schemaVersion:1,requestId:request.value.requestId,scope:source.scope,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion,sourceVersions:source.blocks.map(block=>({sourceId:block.sourceId,contentVersion:block.contentVersion}))};
const continuous={...common,planId:'desktop-continuous',name:'完整原句 · 连续读',layout:[{kind:'paragraphs',key:'all',sourceIds:ids}]};
const comparison={...common,planId:'desktop-comparison',name:'做事与讨论 · 对照读',layout:[
  {kind:'sequence',key:'root',sourceIds:ids.slice(0,1)},
  {kind:'comparison',key:'contrast',title:'做事与讨论的原句对照',columns:[
    {key:'doing',title:'边做边记录',children:[{kind:'paragraphs',key:'doing-body',sourceIds:ids.slice(1,26)}]},
    {key:'discussion',title:'谨慎留下思考',children:[{kind:'sequence',key:'discussion-body',sourceIds:ids.slice(26,51)}]}
  ]},
  {kind:'group',key:'remaining',title:'零散记录与权限边界',children:[{kind:'paragraphs',key:'remaining-body',sourceIds:ids.slice(51)}]}
]};
await writeFile(join(evidence,'continuous-plan.json'),JSON.stringify(continuous,null,2)+'\n');await writeFile(join(evidence,'comparison-plan.json'),JSON.stringify(comparison,null,2)+'\n');
await assert.rejects(cli(['reading','submit'],continuous,'another-session'),/READING_REQUEST_NOT_OWNED/);
const first=await cli(['reading','submit'],continuous);assert.equal(first.ok,true);assert.equal(first.value.status,'selected');
const retry=await cli(['reading','submit'],continuous);assert.equal(retry.value.status,'already-selected');
const second=await cli(['reading','submit'],comparison);assert.equal(second.ok,true);
assert.equal((await cli(['reading','read'])).activePlanId,'desktop-comparison');
assert.equal((await cli(['reading','original'])).ok,true);assert.equal((await cli(['reading','read'])).activePlanId,null);
assert.equal((await cli(['reading','select','desktop-continuous'])).ok,true);
assert.equal((await cli(['reading','select','desktop-comparison'])).ok,true);
const highlight=await cli(['reading','highlight'],{schemaVersion:1,sourceIds:[ids[1]],includeContext:false,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion});
assert.equal(highlight.ok,true);assert.equal(highlight.value.requestedSourceIds.length,25);assert.equal(highlight.value.highlightedSourceIds.length,25);
const fresh=await cli(['content','read']);assert.equal(fresh.sourceSetVersion,source.sourceSetVersion);
assert.deepEqual(fresh.blocks.map(block=>[block.sourceId,block.contentVersion,block.parentUuid]),source.blocks.map(block=>[block.sourceId,block.contentVersion,block.parentUuid]));
const after=await readFile(page);assert.equal(hash(after),hash(before));
const result={observedAt:new Date().toISOString(),kind:'real-isolated-desktop-and-built-cli',graph:source.scope.graphId,blocks:source.blocks.length,layers:4,
  sourceSetVersion:source.sourceSetVersion,first,retry,second,highlight,readingWritesSource:false,authorizesTodo:status.authorizesTodo,pageBefore:hash(before),pageAfter:hash(after),pluginHash:hash(await readFile(join(repo,'apps/logseq-plugin/dist/index.js'))),companionHash:hash(await readFile(join(repo,'apps/logseq-plugin/dist/workspace.mjs'))),
  limits:['development-directory load; final outside-repository package exercise is still required','physical IME and clipboard/Finder preservation are not established by this script','A material preview and ordinary TODO/guidance exercises are still pending']};
await writeFile(join(evidence,'exercise.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
