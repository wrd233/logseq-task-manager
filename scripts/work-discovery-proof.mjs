/* global fetch, URL */
// Capture production HTTP and on-disk observations. This never injects Graph or UI data.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const repo=process.cwd(),root=resolve('tmp/work-discovery-desktop'),output=resolve('docs/implementation/evidence/work-discovery-2026-10-31');
const browser=JSON.parse(await readFile(join(root,'channel/dsh-browser.json'),'utf8'));
const auth=await fetch(browser.url,{redirect:'manual'}),cookie=auth.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const rpc=async(method,payload)=>{
  const response=await fetch(new URL(`/api/logseq-workbench/${method}`,browser.url),{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method:`logseq-workbench/${method}`,payload})});
  const envelope=await response.json();return envelope.result;
};
const catalog=await rpc('catalog',{}),disk=JSON.parse(await readFile(join(root,'bindings/bindings.json'),'utf8'));
if(!catalog.ok)throw Error('Production catalog RPC failed');
const statuses=[];
for(const row of disk.bindings) if(row.workRef) statuses.push(await rpc('status',{sessionId:row.sessionId}));
const selected=statuses.find(status=>status.ok&&!status.value.bound),source=selected?await rpc('read',{sessionId:selected.value.sessionId}):null;
let network=[];try{network=(await readFile(join(root,'evidence/model-network.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch(error){if(error.code!=='ENOENT')throw error;}
const data={kind:'real-isolated-Logseq-0.10.9-native-DSH-0.2.1-rc.2',observedAt:new Date().toISOString(),baseline:'76d8eea226141d38a3489acffa2cc6bd5fe18722',
  isolation:JSON.parse(await readFile(join(root,'evidence/isolation-runtime.json'),'utf8')),catalog:catalog.value,statuses,
  sourceReadFromDiscovery:source,nativeAssociations:disk.bindings,modelNetworkAttempts:network.length,
  note:'UI actions were performed through CUA against the real hosts; UI observations are recorded separately. No fixture SDK or simulated search UI was installed.'};
await mkdir(output,{recursive:true});await writeFile(join(output,'host-results.json'),JSON.stringify(data,null,2).replaceAll(root,'$FIXTURE_ROOT').replaceAll(repo,'$REPO')+'\n');
console.log(JSON.stringify({saved:true,works:catalog.value.graphs.flatMap(graph=>graph.works).length,successfulStatuses:statuses.filter(status=>status.ok).length,sourceReadCode:source?.error?.code,modelNetworkAttempts:network.length}));
