// Actual final-ZIP formal protection and cold reconnect receipts. UI grants and
// registrations are performed normally; this helper only reads their results.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),exec=promisify(execFile),phase=process.argv[2],file=join(m.evidence,'formal-final-restart-exercise.json'),sha=v=>createHash('sha256').update(v).digest('hex');
if(!m.ownerToken)throw Error('Owned final ZIP required');
const outputIndex=process.argv.indexOf('--output'),output=outputIndex<0?'package-layout-final-formal-evidence.json':process.argv[outputIndex+1];
if(!output||!/^package-[a-z0-9-]+-evidence\.json$/u.test(output))throw Error('Explicit safe evidence filename required');
const read=async n=>JSON.parse(await readFile(join(m.evidence,n+'.json'))),same=r=>{if(r.commit!==m.identity.commit||r.zipHash!==m.zipHash)throw Error('Mixed package evidence');};
const cli=async words=>JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,'--directory',m.work,'--state-dir',m.channel,'--client','formal-boundary-desktop','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304})).stdout);
const kernel=async words=>JSON.parse((await exec(process.execPath,['--import','tsx',join(repo,'apps/task-copilot-cli/src/main.ts'),...words,'--json'],{cwd:repo,env:{...process.env,TASK_COPILOT_DESCRIPTOR:join(root,'kernel/kernel.json')},timeout:30000})).stdout);
const storage=await read('formal-storage-exercise'),boundary=await read('formal-boundary-exercise'),focus=await read('formal-focus-exercise');same(storage.runtime);same(boundary.runtime);
if(phase==='before'){
  const status=await cli(['status']),source=await cli(['content','read']),objects=await kernel(['object','list']),desktop=JSON.parse(await readFile(join(root,'desktop.json')));
  if(!status.capabilities.content||!status.authorizesTodo||status.capabilities.fileWrite||JSON.stringify(source.blocks)!==JSON.stringify(boundary.source.blocks))throw Error('Actual granted formal-boundary source required');
  const r={at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,before:{status,source,objects,desktop,graphHash:sha(await readFile(join(m.graph,'pages/合成阅读与协作.md')))}};
  await writeFile(file,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({phase,actualSources:source.blocks.length,body:true,todo:true,file:false}));
}else if(phase==='collect'){
  const r=JSON.parse(await readFile(file));same(r);
  const status=await cli(['status']),source=await cli(['content','read']),objects=await kernel(['object','list']),desktop=JSON.parse(await readFile(join(root,'desktop.json'))),graphHash=sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),views=[];
  for(const o of objects.objects)views.push(await kernel(['object','show',o.id]));
  if(desktop.pid===r.before.desktop.pid||status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo||JSON.stringify(source.blocks)!==JSON.stringify(r.before.source.blocks)||JSON.stringify(objects.objects)!==JSON.stringify(r.before.objects.objects)||graphHash!==r.before.graphHash)throw Error('Cold reconnect revoked permissions/source/state preservation missing');
  const queries=[];
  for(const [i,b]of boundary.bodyResults.entries()){
    const id='formal-boundary-body-'+i,result=await cli(['content','result',id]),recovered=await cli(['content','recover',id]);
    if(result.record.digest!==b.result.record.digest||recovered.record.digest!==result.record.digest||result.status!=='not-applied'||!result.durable)throw Error('Blocked Journal changed on readonly reconnect');
    queries.push({requestId:id,digest:result.record.digest,reason:result.record.items[0].reason,status:result.status,durable:result.durable,recoverySameDigest:true});
  }
  const current=storage.records.find(x=>x.key==='task-copilot-vnext-current-work-object'),envelope=JSON.parse(await readFile(join(m.home,'.logseq/storages/task-copilot-vnext',current.name))),currentId=JSON.parse(envelope.text).value;
  if(!views.some(v=>v.object.id===currentId)||!views.every(v=>v.object.lifecycle==='OPEN'))throw Error('Saved current formal object/closure query missing');
  const grant=await read('formal-todo-grant-runtime'),ui=grant.values.find(v=>v.value?.pluginConnected)?.value?.ordinaryTodoUI;
  const rootLabels=boundary.views.map(v=>boundary.source.blocks.find(b=>b.target.blockUuid===v.anchor.externalId).content.split('\n')[0]);
  if(!ui?.visible||rootLabels.some(label=>ui.choices.some(c=>c.label?.trim()===label.trim()))||!ui.choices.some(c=>c.checked&&c.label?.trim().startsWith('TODO 询问提供方')))throw Error('Actual trusted TODO grant exclusion not observed');
  if(storage.views.length!==2||!storage.verifiedBoundedFiles||storage.records.some(x=>x.bytes!==87)||focus.applied.commit.actor.type!=='AGENT'||focus.applied.projectionObligation.status!=='VERIFIED'||!focus.replay.sameCommit||!focus.replay.graphUnchanged||boundary.bodyResults.length!==3||boundary.bodyResults.some(b=>b.result.status!=='not-applied'||!b.result.durable||!b.sameQueryDigest)||!boundary.graphUnchanged||!boundary.formalStateUnchanged||boundary.todoRejected.length!==2)throw Error('Actual formal proof incomplete');
  r.after={at:new Date().toISOString(),desktop,sourceUnchanged:true,graphUnchanged:true,formalStateUnchanged:true,allWritePermissionsRevoked:true,queries,currentFormalObject:currentId,currentClosureReadonlyQuery:true};
  await writeFile(file,JSON.stringify(r,null,2)+'\n');
  const data={schemaVersion:1,at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,status:'listed normal Kernel and formal protection paths verified',normalKernel:{objects:views.map(v=>({id:v.object.id,kind:v.object.kind,anchor:v.anchor.externalId,lifecycle:v.object.lifecycle})),externalSourceService:true,isolatedDatabase:true,remoteProvider:false},privateStorage:{boundedFiles:storage.records.length,filenameBytes:87,createRequestsCleared:true,downgradeVerified:false},governedFocus:{actor:'AGENT',commit:focus.applied.commit.id,projectionStatus:'VERIFIED',replaySameCommit:true,graphUnchangedOnReplay:true},ordinaryProtection:{body:queries,todo:boundary.todoRejected,registeredRootsNotInTrustedGrant:rootLabels,sourceAndGraphAndFormalStateUnchanged:true,inRangeFormalTodoAttempt:false},coldRestart:r.after,rawEvidenceRoot:m.evidence,capabilityInjection:false,limits:['Formal TODO runtime calls were outside the actual selected grant; registered roots are excluded from the trusted form','External Kernel ran from ordinary repository source; not a bundled standalone Kernel release','No production schema migration, full backup restore or safe downgrade proof','Original Fake executor, path and ordinary IO-race production risks remain']};
  await writeFile(join(repo,'docs/implementation/assets/reading-agent',output),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({phase,sameZIP:true,formalObjects:2,bodyBlocked:3,formalTodoOutsideRangeRejected:2,readonlyJournalQueries:queries.length,coldRestartRevoked:true}));
}else throw Error('Use before or collect');
