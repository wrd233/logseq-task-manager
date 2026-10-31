/* global fetch, URL */
// Real production RPC observations against only this Goal's owned hosts.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import {CompanionTransport} from '../apps/dsh-plugin/src/service.mjs';
const root=resolve('tmp/work-context-desktop'),out=resolve('docs/implementation/evidence/work-context-2026-10-31');
const browser=JSON.parse(await readFile(join(root,'channel/dsh-browser.json'),'utf8'));
const auth=await fetch(browser.url,{redirect:'manual'}),cookie=auth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const rpc=async(method,payload)=>{
 const response=await fetch(new URL(`/api/logseq-workbench/${method}`,browser.url),{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method:`logseq-workbench/${method}`,payload})});
 return (await response.json()).result;
};
const rows=JSON.parse(await readFile(join(root,'bindings/bindings.json'),'utf8')).bindings;
const B=rows.find(r=>r.workRef?.rootUuid==='bbbbbbbb-0000-4000-8000-000000000002'&&r.binding);
const A=rows.find(r=>r.workRef?.rootUuid==='aaaaaaaa-0000-4000-8000-000000000001');
if(!B||!B.binding.directory.startsWith(root+'/'))throw Error('Owned B session required');
const phase=process.argv[2]??'online',data={phase,observedAt:new Date().toISOString(),B:B.sessionId,A:A?.sessionId};
const requireOk=value=>{if(!value?.ok)throw Error(JSON.stringify(value));return value.value;};
if(phase==='cwd-recovery'){
 const related=rows.filter(r=>r.workRef?.rootUuid==='aaaaaaaa-0000-4000-8000-000000000001');
 data.sessions=[];for(const row of related)data.sessions.push(requireOk(await rpc('status',{sessionId:row.sessionId})));
 const fresh=data.sessions.find(s=>!s.cwdMismatch&&s.cwd===s.registeredDirectory);
 if(!data.sessions.some(s=>s.cwdMismatch)||!fresh)throw Error('Correct-directory recovery missing');
 data.newSessionRead=await rpc('read',{sessionId:fresh.sessionId});
 if(data.newSessionRead.error?.code!=='SESSION_NOT_BOUND')throw Error('Native recovery copied a source grant');
}else if(phase==='before-reconnect'){
 data.source=await rpc('read',{sessionId:B.sessionId});
 if(data.source.ok)throw Error('Old runtime connection survived restart');
 const descriptor=JSON.parse(await readFile(join(root,'channel/workspace.json'),'utf8'));
 const before=JSON.parse(await readFile(join(out,'old-grant.json'),'utf8'));
 data.instanceChanged=descriptor.instanceId!==before.instanceId;
 if(!data.instanceChanged)throw Error('Runtime instance did not change');
}else if(phase==='old-grant'){
 const transport=new CompanionTransport(join(root,'channel')),entry=await transport.entry(B.binding.directory);
 data.instanceId=entry.instanceId;
 data.permissions=await transport.call(entry,'status',{},B.sessionId,undefined,{sessionId:B.sessionId,workRef:B.workRef,scope:entry.binding.scope,generation:1});
 if(!data.permissions.capabilities.content)throw Error('Expected explicit old body grant');
}else if(phase==='online'){
 data.source=await rpc('read',{sessionId:B.sessionId});const source=requireOk(data.source);
 if(!JSON.stringify(source).includes('B_ONLY_942')||JSON.stringify(source).includes('A_ONLY_731'))throw Error('Cross-work source contamination');
 const transport=new CompanionTransport(join(root,'channel')),entry=await transport.entry(B.binding.directory);
 const target={sessionId:B.sessionId,workRef:B.workRef,scope:B.binding.scope,generation:1};
 const rejected=async(command,payload,readTarget)=>{try{await transport.call(entry,command,payload,B.sessionId,undefined,readTarget);throw Error('Unexpected success');}catch(e){if(e.message==='Unexpected success')throw e;return e.code;}};
 data.wrongWork=await rejected('refresh',{}, {...target,workRef:A.workRef});
 data.wrongGraph=await rejected('refresh',{}, {...target,scope:{...target.scope,graphId:'wrong:/graph'}});
 data.outsideSource=await rejected('source.read',{sourceId:'forbidden:A'},target);
 data.cwdMismatch=await rpc('bind',{sessionId:A.sessionId,directory:B.binding.directory});
 data.permissions=await transport.call(entry,'status',{},B.sessionId,undefined,target);
 const directory=B.binding.directory;
 execFileSync('git',['init','-q'],{cwd:directory});
 await writeFile(join(directory,'review.txt'),'B file baseline 942\n');
 execFileSync('git',['add','review.txt'],{cwd:directory});execFileSync('git',['-c','user.name=Isolated Acceptance','-c','user.email=acceptance@example.invalid','commit','-qm','B file baseline'],{cwd:directory});
 data.baseline=await rpc('evidence-sync',{sessionId:B.sessionId,requestId:randomUUID()});requireOk(data.baseline);
 await writeFile(join(directory,'review.txt'),'B file baseline 942\nB independent work change\n');
 data.sync=await rpc('evidence-sync',{sessionId:B.sessionId,requestId:randomUUID()});requireOk(data.sync);
 data.evidence=await rpc('evidence-view',{sessionId:B.sessionId});requireOk(data.evidence);
 if(data.wrongWork!=='WORK_REF_MISMATCH'||data.wrongGraph!=='SCOPE_MISMATCH'||data.outsideSource!=='SOURCE_OUTSIDE_SCOPE'||data.cwdMismatch.error?.code!=='SESSION_CWD_MISMATCH')throw Error('Negative guard failed');
}else if(phase==='offline'||phase==='directory-missing'){
 if(phase==='directory-missing')await rename(B.binding.directory,B.binding.directory+'.owned-unavailable');
 try{
  data.source=await rpc('read',{sessionId:B.sessionId});if(data.source.ok)throw Error('Offline source pretends live');
  data.evidence=await rpc('evidence-view',{sessionId:B.sessionId});requireOk(data.evidence);
  data.history=await rpc('history-list',{sessionId:B.sessionId});requireOk(data.history);
  data.files=await rpc('files',{sessionId:B.sessionId});
  if(phase==='offline')requireOk(data.files);
 }finally{if(phase==='directory-missing')await rename(B.binding.directory+'.owned-unavailable',B.binding.directory);}
}else if(phase==='recovered'){
 data.source=await rpc('read',{sessionId:B.sessionId});requireOk(data.source);
 const transport=new CompanionTransport(join(root,'channel')),entry=await transport.entry(B.binding.directory);
 data.permissions=await transport.call(entry,'status',{},B.sessionId,undefined,{sessionId:B.sessionId,workRef:B.workRef,scope:entry.binding.scope,generation:1});
 if(data.permissions.capabilities.content||data.permissions.capabilities.fileWrite||data.permissions.authorizesTodo)throw Error('Old write grant restored');
 data.evidence=await rpc('evidence-view',{sessionId:B.sessionId});requireOk(data.evidence);
}else throw Error('Unknown phase');
await mkdir(out,{recursive:true});
await writeFile(join(out,`${phase}.json`),JSON.stringify(data,null,2).replaceAll(root,'$FIXTURE_ROOT')+'\n');
console.log(JSON.stringify({phase,saved:true,sourceCode:data.source?.error?.code??'read B',evidenceOk:data.evidence?.ok,historyCount:data.history?.value?.records.length,wrongWork:data.wrongWork,wrongGraph:data.wrongGraph,outsideSource:data.outsideSource,bodyWrite:data.permissions?.capabilities.content,fileWrite:data.permissions?.capabilities.fileWrite}));
