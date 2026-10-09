// Real CLI, Desktop Graph, saved user request and scoped files. Local UI alone
// chooses the work and grants permissions; this script never injects host APIs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot,acceptancePlugin,acceptanceRuntime} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex'),phase=process.argv[2]??'prepare';
const m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),directory=join(root,'work-two'),evidencePath=join(m.evidence,'discussion-exercise.json'),graphFile=join(m.graph,'pages/合成阅读与协作.md');
if(m.root!==root||!m.graph.startsWith(root+'/')||!acceptancePlugin(m,repo))throw Error('Owned acceptance paths required');
const cli=async(words,input)=>{
  const args=[];if(input!==undefined){const path=join(m.evidence,'discussion-input.json');await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}
  const result=await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',directory,'--state-dir',m.channel,'--client','discussion-desktop','--json'],{cwd:root,timeout:30000});return JSON.parse(result.stdout);
};
if(phase==='disconnected'){
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));
  try{await cli(['status']);throw Error('Stopped discussion still online');}catch(error){if(!error.stderr?.includes('WORKSPACE_OFFLINE'))throw error;evidence.disconnected={at:new Date().toISOString(),code:'WORKSPACE_OFFLINE'};}
  await writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({phase,code:'WORKSPACE_OFFLINE'}));process.exit(0);
}
const status=await cli(['status']);if(status.binding.scope.rootUuid!=='b7261007-0000-4000-8000-000000000027'||status.binding.directory!==directory||!status.binding.scope.graphId.includes(m.graph))throw Error('Actual discussion block scope required');
const source=await cli(['content','read']),parent=source.blocks[0],guide=await cli(['guidance','read']),scene=await cli(['collaboration','read']);
if(!scene.scene.request.includes('合成多轮讨论验收'))throw Error('Actual local discussion request required');
const permissions=s=>({body:s.capabilities.content,file:s.capabilities.fileWrite,todo:s.authorizesTodo});
const target=b=>({target:b.target,expectedContentVersion:b.contentVersion,expectedParentUuid:b.parentUuid});
const preserved=(before,after)=>before.blocks.every(b=>{const a=after.blocks.find(a=>a.target.blockUuid===b.target.blockUuid);return a&&JSON.stringify(a)===JSON.stringify(b);});
const first='**[想法]** 目前偏向先试连续阅读：可能更容易看见思路变化，不过退出后能否保留版本记录尚未询问。\n**[注]** 这只是讨论中的偏向，现有询问 TODO 尚未执行；没有作出试用或项目完成判断。';
const request={schemaVersion:1,requestId:'discussion-desktop-thought-1',scope:source.scope,operations:[{operationId:'thought',type:'insert-child',...target(parent),content:first,childUuid:null}]};
if(phase==='prepare'){
  if(Object.values(permissions(status)).some(Boolean))throw Error('Initial discussion must be read-only');
  const denied=[];for(const [words,input,code] of [[['content','apply'],{...request,requestId:'discussion-desktop-denied'},'CONTENT_WRITE_AUTHORIZATION_REQUIRED'],[['materials','capture'],{requestKey:'discussion-desktop-denied',text:'不得保存'},'FILE_WRITE_AUTHORIZATION_REQUIRED']]){
    try{await cli(words,input);throw Error('Unpermitted operation returned');}catch(error){if(!error.stderr?.includes(code))throw error;denied.push(code);}
  }
  const evidence={preparedAt:new Date().toISOString(),scope:source.scope,source,request,guide,scene,permissions:permissions(status),denied,beforeGraphHash:sha(await readFile(graphFile)),runtime:{jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,...acceptanceRuntime(m),capabilityInjection:false}};
  await writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({phase,sources:source.blocks.length,permissions:evidence.permissions,denied}));
}else if(phase==='first'){
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));if(!status.capabilities.content||!status.capabilities.fileWrite||status.authorizesTodo)throw Error('Independent actual body/file grants with no TODO grant required');
  const output='# 阅读讨论的条件与权衡\n\n第一轮：可能先试连续阅读，目前偏向保留层级和完整原句。\n\n'+source.blocks.filter(b=>b.content?.startsWith('反例：即使试用成本很低')||b.content?.startsWith('下一轮需要询问退出后的')).map(b=>b.content).join('\n\n')+'\n\n尚未询问：退出后能否保留版本记录。现有询问任务尚未执行。\n';
  const beforeFile=await cli(['content','read']),capture=await cli(['materials','capture'],{requestKey:'discussion-desktop-material-1',title:'阅读讨论的条件与权衡',role:'output',text:output}),afterFile=await cli(['content','read']);
  if(capture.status!=='success'||JSON.stringify(beforeFile.blocks)!==JSON.stringify(afterFile.blocks))throw Error('File save modified Graph or was not saved');
  const material=await cli(['materials','read',capture.material.id]);if(material.content!==output||sha(await readFile(material.path))!==material.version||!material.path.startsWith(directory+'/'))throw Error('Actual material readback required');
  const applied=await cli(['content','apply'],evidence.request);Object.assign(evidence,{firstAttempt:applied,material});await writeFile(evidencePath,JSON.stringify(evidence,null,2));
  if(applied.status!=='complete'||!applied.durable||applied.record.items[0].identity?.status!=='VERIFIED')throw Error('First body/identity result unconfirmed');
  const again=await cli(['content','apply'],evidence.request),after=await cli(['content','read']),childUuid=applied.record.items[0].childUuid;
  if(again.record.digest!==applied.record.digest||!preserved(evidence.source,after)||after.blocks.length!==evidence.source.blocks.length+1||!after.blocks.some(b=>b.target.blockUuid===childUuid&&b.parentUuid===parent.target.blockUuid))throw Error('Original source changed or first thought duplicated');
  if(applied.record.origin.clientLabel!=='discussion-desktop'||applied.record.origin.guidance?.common.version!==guide.common.version)throw Error('Actual author/loaded guide basis missing');
  Object.assign(evidence,{firstAt:new Date().toISOString(),bodyPermissions:permissions(status),firstResult:applied,afterFirst:after,childUuid,firstRetrySame:true});await writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({phase,childUuid,status:applied.status,originalSourcesUnchanged:true}));
}else if(phase==='second'){
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));if(!evidence.childUuid||!status.capabilities.content||!status.capabilities.fileWrite||status.authorizesTodo)throw Error('Continue the actual first thought with independent grants');
  const child=source.blocks.find(b=>b.target.blockUuid===evidence.childUuid),text='\n**[记录]** 第二轮补充：离线时也需要能打开实际引用。可能继续使用连续读法，不过先保留退出与离线两个条件；详见 '+evidence.material.reference+'。';
  const patch={schemaVersion:1,requestId:'discussion-desktop-thought-2',scope:source.scope,operations:[{operationId:'continue-thought',type:'insert-text',...target(child),range:{start:child.content.length,end:child.content.length},expectedText:'',text,context:{before:child.content.slice(-120),after:''}}]};
  const result=await cli(['content','apply'],patch);Object.assign(evidence,{secondRequest:patch,secondAttempt:result});await writeFile(evidencePath,JSON.stringify(evidence,null,2));if(result.status!=='complete'||!result.durable)throw Error('Second body result unconfirmed');
  const same=await cli(['content','apply'],patch),query=await cli(['content','result',patch.requestId]),after=await cli(['content','read']);
  if(same.record.digest!==result.record.digest||query.record.digest!==result.record.digest||!preserved(evidence.source,after)||after.blocks.length!==evidence.afterFirst.blocks.length||after.blocks.find(b=>b.target.blockUuid===evidence.childUuid)?.content!==child.content+text)throw Error('Continuation changed originals or duplicated a summary');
  if(!after.blocks.find(b=>b.target.blockUuid==='b7261007-0000-4000-8000-000000000048')?.content.startsWith('TODO '))throw Error('Unexecuted task incorrectly completed');
  Object.assign(evidence,{secondAt:new Date().toISOString(),secondResult:result,afterSecond:after,querySame:true,originalSourcesUnchanged:true,oneNewThought:true,existingTodoRemainsUnexecuted:true,afterGraphHash:sha(await readFile(graphFile))});await writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({phase,status:result.status,oneNewThought:true,existingTodoRemainsUnexecuted:true}));
}else if(phase==='reconnect'){
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));if(Object.values(permissions(status)).some(Boolean))throw Error('Actual reconnect must start read-only');
  const result=await cli(['content','result',evidence.secondRequest.requestId]),recover=await cli(['content','recover',evidence.secondRequest.requestId]),same=await cli(['content','apply'],evidence.secondRequest);
  if([result,recover,same].some(r=>r.record.digest!==evidence.secondResult.record.digest)||JSON.stringify(source.blocks)!==JSON.stringify(evidence.afterSecond.blocks))throw Error('Readonly query/idempotence changed data');
  const material=await cli(['materials','read',evidence.material.id]);if(material.version!==evidence.material.version)throw Error('Actual material version changed');
  const graphBytes=await readFile(graphFile);if(!graphBytes.toString().includes(first.split('\n')[0])||!graphBytes.toString().includes(evidence.secondRequest.operations[0].text.slice(1)))throw Error('Actual Graph persistence not observed');
  evidence.afterGraphHash=sha(graphBytes);evidence.reconnect={at:new Date().toISOString(),permissions:permissions(status),sameDigest:true,sourcesUnchanged:true,graphPersistenceObserved:true};await writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({phase,sameDigest:true,sourcesUnchanged:true,graphPersistenceObserved:true}));
}else throw Error('Usage: prepare | first | second | disconnected | reconnect');
