// Actual built CLI, owned Desktop Graph and material files. Grants remain real UI actions.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot,acceptancePlugin,acceptanceRuntime} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex');
const m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),phase=process.argv[2]??'prepare',trial=process.argv[3]??'first';
if(!['first','native-id'].includes(trial))throw Error('Unknown isolated trial');
const evidencePath=join(m.evidence,trial==='first'?'todo-exercise.json':'todo-native-id-exercise.json'),prefix=trial==='first'?'todo-desktop':'todo-native-id';
if(m.root!==root||!m.graph.startsWith(root+'/')||!m.work.startsWith(root+'/')||!acceptancePlugin(m,repo))throw Error('Owned acceptance paths required');
const cli=async(words,input)=>{
  const args=[];if(input!==undefined){const path=join(m.evidence,'todo-input.json');await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}
  const r=await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',m.work,'--state-dir',m.channel,'--client','todo-desktop','--json'],{cwd:root,timeout:30000});return JSON.parse(r.stdout);
};
const status=await cli(['status']);if(!status.binding.scope.graphId.includes(m.graph)||status.binding.directory!==m.work)throw Error('Wrong live Graph/work scope');
const source=await cli(['content','read']),parent=source.blocks.find(b=>b.target.blockUuid==='b7261007-0000-4000-8000-000000000048');
if(!parent?.content.startsWith('TODO 询问提供方'))throw Error('Actual ordinary parent task required');
const target=b=>({blockUuid:b.target.blockUuid,expectedContentVersion:b.contentVersion,expectedParentUuid:b.parentUuid});
const request={schemaVersion:1,requestId:`${prefix}-create-1`,scope:source.scope,action:'create',target:target(parent),title:trial==='first'?'保存两段退出条件原句到材料并核验':'原生属性读回复验：保存两段退出条件原句到材料并核验'};
if(phase==='prepare'){
  if(status.authorizesTodo||status.capabilities.content||status.capabilities.fileWrite)throw Error('Preparation requires actual read-only connection');
  let rejected=false;try{await cli(['todo','apply'],request);}catch(error){if(!error.stderr?.includes('TODO_AUTHORIZATION_REQUIRED'))throw error;rejected=true;}
  if(!rejected)throw Error('Unauthorized TODO returned');
  const record={preparedAt:new Date().toISOString(),scope:source.scope,request,source,guidance:await cli(['guidance','read']),beforeGraphHash:sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),rejected:'TODO_AUTHORIZATION_REQUIRED',runtime:{jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,...acceptanceRuntime(m),capabilityInjection:false}};
  await writeFile(evidencePath,JSON.stringify(record,null,2));console.log(JSON.stringify({phase,rejected:record.rejected,parent:parent.content.split('\n')[0]}));
}else if(phase==='execute'){
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));
  if(!status.authorizesTodo||!status.capabilities.fileWrite||status.capabilities.content)throw Error('Requires independent actual TODO/file grants and no body grant');
  const executionRuntime={jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,...acceptanceRuntime(m),capabilityInjection:false};
  const packet=await cli(['collaboration','read']),guide=await cli(['guidance','read']);
  if(packet.scene.binding.scope.rootUuid!==source.scope.rootUuid||!packet.scene.request.includes('保存两段关于退出材料的原句'))throw Error('Actual local collaboration intent required');
  const created=await cli(['todo','apply'],evidence.request);
  if(created.status!=='complete'||!created.durable)throw Error('Create is unconfirmed');
  const childUuid=created.record.items[0].childUuid;
  const same=await cli(['todo','apply'],evidence.request);if(same.record.digest!==created.record.digest)throw Error('Create not idempotent');
  const originals=['反例：即使试用成本很低','下一轮需要询问退出后的'].map(prefix=>source.blocks.find(b=>b.content?.startsWith(prefix)));
  if(originals.some(b=>!b))throw Error('Actual saved evidence sources required');
  const verifiedText='核验：两段原样来源均已保留，询问尚未执行。',text='# 退出条件原句比较\n\n'+originals.map(b=>b.content).join('\n\n')+'\n\n'+verifiedText+'\n';
  const beforeCapture=await cli(['content','read']);
  const captured=await cli(['materials','capture'],{requestKey:`${prefix}-output-2`,title:'退出条件原句比较',role:'output',text});
  const afterCapture=await cli(['content','read']);if(JSON.stringify(beforeCapture.blocks)!==JSON.stringify(afterCapture.blocks))throw Error('File permission caused a Graph write');
  if(captured.status!=='success'||!captured.material.path.startsWith(m.work+'/'))throw Error('Owned material creation unconfirmed');
  const material=await cli(['materials','read',captured.material.id]),bytes=await readFile(material.path);
  if(sha(bytes)!==material.version||material.content!==text||!originals.every(b=>material.content.includes(b.content)))throw Error('Actual material bytes/readback differ');
  const fresh=await cli(['content','read']),child=fresh.blocks.find(b=>b.target.blockUuid===childUuid);
  const oldCompletion=await cli(['todo','result',`${prefix}-complete-1`]);
  const completeRequest={schemaVersion:1,requestId:oldCompletion?.status==='not-applied'?`${prefix}-complete-2`:`${prefix}-complete-1`,scope:source.scope,action:'complete',target:target(child),evidence:{materialId:material.id,expectedVersion:material.version,verifiedText}};
  const completed=completeRequest.requestId.endsWith('-complete-2')?await cli(['todo','retry'],{previousRequestId:`${prefix}-complete-1`,request:completeRequest}):await cli(['todo','apply'],completeRequest);
  Object.assign(evidence,{executionRuntime,permissions:status,collaboration:packet,loadedGuidance:guide,created,completeRequest,completed,material,oldCompletion});await writeFile(evidencePath,JSON.stringify(evidence,null,2));
  if(completed.status!=='complete'||!completed.durable)throw Error('Completion unconfirmed');
  const result=await cli(['todo','result',completeRequest.requestId]),after=await cli(['content','read']);
  if(result.record.digest!==completed.record.digest||!completed.record.origin.guidance||completed.record.origin.guidance.common.version!==guide.common.version)throw Error('Actual Journal/source basis missing');
  if(!evidence.source.blocks.every(b=>{const a=after.blocks.find(a=>a.target.blockUuid===b.target.blockUuid);return a?.content===b.content&&a.parentUuid===b.parentUuid&&a.depth===b.depth&&a.order===b.order;}))throw Error('Original saved sources changed');
  const extra=after.blocks.filter(b=>b.target.blockUuid!==childUuid&&!evidence.source.blocks.some(a=>a.target.blockUuid===b.target.blockUuid));
  const invalidExtra=trial==='first'?(extra.length!==1||!extra[0].content.startsWith('[📄 退出条件原句比较](longdoc://')):extra.length!==0;
  if(invalidExtra)throw Error('Unexpected extra source or duplicate task');
  if(!after.blocks.find(b=>b.target.blockUuid===childUuid)?.content.startsWith(`DONE ${evidence.request.title}`))throw Error('Actual task state not observed');
  Object.assign(evidence,{executedAt:new Date().toISOString(),trial,permissions:status,loadedGuidance:guide,created,completeRequest,completed,result,material,materialBytesHash:sha(bytes),after,afterGraphHash:sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),originalSourcesUnchanged:true,parentRemainsTodo:true,duplicateChildren:0,fileOnlyCapture:{before:beforeCapture.blocks,after:afterCapture.blocks,unchanged:true},legacyUnexpectedReference:extra[0]??null});
  await writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({phase,created:created.status,completed:completed.status,childUuid,materialId:material.id,reference:material.reference,originalSourcesUnchanged:true,parentRemainsTodo:true}));
}else if(phase==='reconnect'){
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));if(status.authorizesTodo||status.capabilities.fileWrite||status.capabilities.content)throw Error('Reconnect must be actual read-only');
  const result=await cli(['todo','result',evidence.completeRequest.requestId]),again=await cli(['todo','apply'],evidence.completeRequest);
  if(result.record.digest!==evidence.completed.record.digest||again.record.digest!==result.record.digest)throw Error('Durable result changed/replayed');
  const after=await cli(['content','read']);if(JSON.stringify(after.blocks)!==JSON.stringify(evidence.after.blocks))throw Error('Readonly reconnect changed saved source');
  evidence.reconnect={at:new Date().toISOString(),permissions:status,resultDigest:result.record.digest,sameRequestReturned:true,sourceUnchanged:true};await writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({phase,permissionRevoked:true,sameRequestReturned:true,sourceUnchanged:true}));
}else throw Error('Usage: prepare | execute | reconnect [first|native-id]');
