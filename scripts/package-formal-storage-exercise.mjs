// Read actual normal Kernel registrations and owned SDK FileStorage files.
// Registration remains a real Logseq UI action, never an injected SDK call.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot,acceptanceRuntime} from './acceptance-context.mjs';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex');
if(!m.ownerToken)throw Error('Actual outside-repository package required');
const cli=async words=>JSON.parse((await exec(process.execPath,['--import','tsx',join(repo,'apps/task-copilot-cli/src/main.ts'),...words,'--json'],{cwd:repo,env:{...process.env,TASK_COPILOT_DESCRIPTOR:join(root,'kernel/kernel.json')},timeout:30000})).stdout);
const objects=await cli(['object','list']),views=[];
for(const o of objects.objects)views.push(await cli(['object','show',o.id]));
if(views.length!==2||!['b7261007-0000-4000-8000-000000000002','b7261007-0000-4000-8000-000000000077'].every(id=>views.some(v=>v.anchor.externalId===id))||views.some(v=>!v.anchor.graphId.includes(m.graph)||v.object.lifecycle!=='OPEN'))throw Error('Two actual owned existing-anchor formal registrations required');
const storage=join(m.home,'.logseq/storages/task-copilot-vnext'),records=[];
for(const name of await readdir(storage)){
  if(!/^task-copilot-scoped-v1-[0-9a-f]{64}$/u.test(name))continue;
  const text=await readFile(join(storage,name),'utf8'),envelope=JSON.parse(text);
  if(envelope.schemaVersion!==1||envelope.graphId!==views[0].anchor.graphId||typeof envelope.text!=='string'||name!=='task-copilot-scoped-v1-'+sha(JSON.stringify([envelope.key,envelope.graphId]))||Buffer.byteLength(name)!==87)throw Error('Actual bounded scoped envelope identity mismatch');
  records.push({name,key:envelope.key,bytes:Buffer.byteLength(name),schemaVersion:envelope.schemaVersion,text:envelope.text});
}
const required=['task-copilot-vnext-current-work-object','task-copilot-vnext-recent-commit',...views.map(v=>'task-copilot-vnext-pending:create:'+v.anchor.externalId)];
if(!required.every(key=>records.some(r=>r.key===key))||records.filter(r=>r.key.startsWith('task-copilot-vnext-pending:create:')).some(r=>r.text!==''))throw Error('Actual current object, last commit and cleared create records required');
const record={at:new Date().toISOString(),objects,views,records,verifiedBoundedFiles:true,runtime:{...acceptanceRuntime(m),node:process.version,jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),capabilityInjection:false},externalKernel:{normalService:true,developmentSource:repo,ownedDatabase:join(root,'kernel'),provider:false},downgradeVerified:false};
await writeFile(join(m.evidence,'formal-storage-exercise.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({objects:views.map(v=>({id:v.object.id,anchor:v.anchor.externalId})),boundedFiles:records.length,filenameBytes:87,samePackage:true,normalKernel:true}));
