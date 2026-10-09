// Actual registered Kernel objects, built workspace CLI and live Desktop.
// The local UI grants body/TODO scope; these calls only test rejected writes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot,acceptancePlugin,acceptanceRuntime} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex'),path=join(m.evidence,'formal-boundary-exercise.json');
if(m.root!==root||!m.graph.startsWith(root+'/')||!acceptancePlugin(m,repo))throw Error('Owned acceptance paths required');
const cli=async(words,input)=>{
  const args=[];if(input!==undefined){const file=join(m.evidence,'formal-boundary-input.json');await writeFile(file,JSON.stringify(input));args.push('--input-file',file);}
  return JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',m.work,'--state-dir',m.channel,'--client','formal-boundary-desktop','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304})).stdout);
};
const kernel=async words=>JSON.parse((await exec(process.execPath,['--import','tsx',join(repo,'apps/task-copilot-cli/src/main.ts'),...words,'--json'],{cwd:repo,env:{...process.env,TASK_COPILOT_DESCRIPTOR:join(root,'kernel/kernel.json')}})).stdout);
const status=await cli(['status']),source=await cli(['content','read']),guide=await cli(['guidance','read']),objects=await kernel(['object','list']),views=[];
for(const o of objects.objects)views.push(await kernel(['object','show',o.id]));
if(!status.capabilities.content||!status.authorizesTodo||status.capabilities.fileWrite||status.contentProtocol.structureAuthorized||source.scope.rootUuid!=='b7261007-0000-4000-8000-000000000001'||views.length!==2||views.some(v=>v.anchor.graphId!==source.scope.graphId))throw Error('Real independent body/ordinary TODO grants and two owned formal registrations required');
const beforeHash=sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),record={at:new Date().toISOString(),status,source,guide,objects,views,beforeHash,bodyResults:[],todoRejected:[],runtime:{jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,...acceptanceRuntime(m),capabilityInjection:false}};
await writeFile(path,JSON.stringify(record,null,2));
const roots=views.map(v=>source.blocks.find(b=>b.target.blockUuid===v.anchor.externalId));if(roots.some(b=>!b))throw Error('Actual registered roots unavailable');
const managed=source.blocks.find(b=>views.some(v=>[v.anchor.projectionStateUuid,v.anchor.projectionFocusUuid,v.anchor.projectionWaitingUuid,v.anchor.projectionOutcomeUuid,v.anchor.projectionCompletionUuid].includes(b.target.blockUuid)));if(!managed)throw Error('Actual registered rendered managed field unavailable');
for(const [index,b]of [...roots,managed].entries()){
  const text=b.content.split('\n')[0],request={schemaVersion:1,requestId:'formal-boundary-body-'+index,scope:source.scope,operations:[{operationId:'protected',type:'replace-text',target:b.target,expectedContentVersion:b.contentVersion,expectedParentUuid:b.parentUuid,range:{start:0,end:text.length},expectedText:text,text:'不得从普通正文改写正式事项'}]};
  const result=await cli(['content','apply'],request),query=await cli(['content','result',request.requestId]);record.bodyResults.push({uuid:b.target.blockUuid,result,sameQueryDigest:query.record.digest===result.record.digest});await writeFile(path,JSON.stringify(record,null,2));
  if(result.status!=='not-applied'||!result.durable||result.record.items.length!==1||result.record.items.some(i=>i.contentVerified||i.status!=='BLOCKED'||!['PROTECTED_FORMAL_TITLE','PROTECTED_MANAGED'].includes(i.reason))||query.record.digest!==result.record.digest)throw Error('Formal root/managed content was not reliably blocked');
}
const material=await cli(['materials','read','7915cee4-4d91-6ecc-2f7e-66d30a18661c']);
for(const [index,b]of roots.entries()){
  const request={schemaVersion:1,requestId:'formal-boundary-todo-'+index,scope:source.scope,action:'complete',target:{blockUuid:b.target.blockUuid,expectedContentVersion:b.contentVersion,expectedParentUuid:b.parentUuid},evidence:{materialId:material.id,expectedVersion:material.version,verifiedText:'核验：两段原样来源均已保留，询问尚未执行。'}};
  try{await cli(['todo','apply'],request);throw Error('Ordinary TODO modified a formal object');}catch(error){if(!error.stderr?.includes('TODO_OUTSIDE_GRANTED_RANGE'))throw error;record.todoRejected.push({uuid:b.target.blockUuid,code:'TODO_OUTSIDE_GRANTED_RANGE'});}
}
const after=await cli(['content','read']),afterObjects=await kernel(['object','list']),afterHash=sha(await readFile(join(m.graph,'pages/合成阅读与协作.md')));
if(JSON.stringify(after.blocks)!==JSON.stringify(source.blocks)||JSON.stringify(afterObjects.objects)!==JSON.stringify(objects.objects)||afterHash!==beforeHash)throw Error('Rejected calls changed source, formal business state or Graph bytes');
Object.assign(record,{completedAt:new Date().toISOString(),after,afterObjects,afterHash,sourceUnchanged:true,formalStateUnchanged:true,graphUnchanged:true});await writeFile(path,JSON.stringify(record,null,2));console.log(JSON.stringify({roots:roots.map(b=>b.target.blockUuid),managed:managed.target.blockUuid,body:record.bodyResults.map(r=>r.result.record.items[0].reason),todo:record.todoRejected,formalStateUnchanged:true,graphUnchanged:true}));
