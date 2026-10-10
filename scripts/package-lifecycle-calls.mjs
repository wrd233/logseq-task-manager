// Real installed CLI only. Switching Graphs and disabling the plugin remain UI actions.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),phase=process.argv[2],exec=promisify(execFile);
if(!m.ownerToken||m.root!==root)throw Error('Owned synthetic package required');
const cli=async(words,input)=>{
  const args=[];if(input){const f=join(m.evidence,'lifecycle-call-input.json');await writeFile(f,JSON.stringify(input));args.push('--input-file',f);}
  try{const r=await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',m.work,'--state-dir',m.channel,'--client','lifecycle-final','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304});return {exitCode:0,value:JSON.parse(r.stdout)};}
  catch(e){if(!e.stderr)throw e;return {exitCode:e.code,error:JSON.parse(e.stderr)};}
};
const save=async(n,r)=>writeFile(join(m.evidence,n+'.json'),JSON.stringify(r,null,2)+'\n');
if(phase==='invite'){
  const r=await cli(['reading','request','--purpose','真实 Graph 切换前邀请，迟到结果必须失效']);if(r.exitCode||!r.value.ok)throw Error('Actual live invitation required');
  const s=r.value.value.source,id=r.value.value.requestId;
  const plan={schemaVersion:1,requestId:id,planId:'lifecycle-late-'+id.slice(0,8),name:'切换前的迟到读法',scope:s.scope,structureVersion:s.structureVersion,sourceSetVersion:s.sourceSetVersion,sourceVersions:s.blocks.map(b=>({sourceId:b.sourceId,contentVersion:b.contentVersion})),layout:[{kind:'paragraphs',key:'all',sourceIds:s.blocks.map(b=>b.sourceId)}]};
  await save('graph-switch-live-invitation',r.value);await save('graph-switch-late-plan',plan);console.log(JSON.stringify({liveInvitation:id,sources:s.blocks.length}));
}else if(phase==='graph-rejected'){
  const plan=JSON.parse(await readFile(join(m.evidence,'graph-switch-late-plan.json'))),results=[await cli(['status']),await cli(['reading','submit'],plan)];
  if(results.some(r=>r.exitCode!==1||r.error?.error?.code!=='WORKSPACE_OFFLINE'))throw Error('Actual old Graph rejection missing');
  await save('graph-switch-old-scope-rejection',{at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,liveInvitation:plan.requestId,results});console.log(JSON.stringify({oldStatusAndLatePlanRejected:true}));
}else if(phase==='unload-rejected'){
  const error=await cli(['status']);if(error.exitCode!==1||error.error?.error?.code!=='WORKSPACE_OFFLINE')throw Error('Actual disabled old connection rejection missing');
  await save('unload-old-scope-rejection',{at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,exitCode:error.exitCode,error:error.error});console.log(JSON.stringify({oldConnectionRejected:true}));
}else throw Error('Use invite | graph-rejected | unload-rejected');
