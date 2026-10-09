// Real installed CLI + static read-only Desktop observations. All local work
// identity, connection and permissions are established through the normal UI.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
const name=process.argv[2];if(!name||!/^[a-z][a-z0-9-]{3,70}$/u.test(name))throw Error('Explicit owned package instance required');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(homedir(),'Library/Caches/task-copilot-package-acceptance',name),m=JSON.parse(await readFile(join(root,'manifest.json'))),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex'),recordPath=join(m.evidence,'package-reading-exercise.json');
if(m.root!==root||m.plugin!==join(root,'installation/task-copilot-workbench')||m.graph!==join(root,'graph')||m.work!==join(root,'work')||m.evidence!==join(root,'evidence')||!m.ownerToken)throw Error('Owned package paths required');
const identity=JSON.parse(await readFile(join(m.plugin,'build-identity.json')));if(identity.builtFromDirtyTree||identity.commit!==m.identity.commit)throw Error('Actual clean ZIP identity required');
for(const [file,hash]of Object.entries(identity.files)){if(!file.startsWith('dist/')||file.includes('..')||sha(await readFile(join(m.plugin,file)))!==hash)throw Error('Installed resource differs');}
const cli=async(words,input)=>{
 const args=[];if(input!==undefined){const path=join(m.evidence,'package-reading-input.json');await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}
 return JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',m.work,'--state-dir',m.channel,'--client','package-reading','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304})).stdout);
};
const graphFile=join(m.graph,'pages/合成阅读与协作.md'),beforeHash=sha(await readFile(graphFile)),status=await cli(['status']),source=await cli(['content','read']),guide=await cli(['guidance','read']),scene=await cli(['collaboration','read']);
if(status.channel!=='online'||status.authorizesTodo||status.capabilities.content||status.capabilities.fileWrite||status.contentProtocol.structureAuthorized||!status.capabilities.reading||source.blocks.length!==101||Math.max(...source.blocks.map(b=>b.depth))!==3||status.binding.scope.graphId!==source.scope.graphId||!source.scope.graphId.includes(m.graph)||status.binding.directory!==m.work||!scene.scene.request.includes('阶段安装预检'))throw Error('Actual 101-source synthetic read-only scene required');
const record={at:new Date().toISOString(),status,source,guide,scene,beforeHash,runtime:{commit:identity.commit,zipHash:m.zipHash,jsHash:identity.files['dist/index.js'],cliHash:identity.files['dist/workspace.mjs'],node:process.version,outsideRepository:true,capabilityInjection:false},denied:[],views:[]};
await writeFile(recordPath,JSON.stringify(record,null,2));
const plain=source.blocks.find(b=>b.target.blockUuid==='b7261007-0000-4000-8000-000000000028'),parent=source.blocks.find(b=>b.target.blockUuid==='b7261007-0000-4000-8000-000000000048'),text=plain.content.split('\n')[0];
for(const [words,input,code]of [
 [['content','apply'],{schemaVersion:1,requestId:'package-reading-denied-body',scope:source.scope,operations:[{operationId:'denied',type:'replace-text',target:plain.target,expectedContentVersion:plain.contentVersion,expectedParentUuid:plain.parentUuid,range:{start:0,end:text.length},expectedText:text,text:'不得写入'}]},'CONTENT_WRITE_AUTHORIZATION_REQUIRED'],
 [['materials','capture'],{requestKey:'package-reading-denied-file',text:'不得保存'},'FILE_WRITE_AUTHORIZATION_REQUIRED'],
 [['todo','apply'],{schemaVersion:1,requestId:'package-reading-denied-todo',scope:source.scope,action:'create',target:{blockUuid:parent.target.blockUuid,expectedContentVersion:parent.contentVersion,expectedParentUuid:parent.parentUuid},title:'不得创建'},'TODO_AUTHORIZATION_REQUIRED']
]){try{await cli(words,input);throw Error('Unauthorized installed operation returned');}catch(error){if(!error.stderr?.includes(code))throw error;record.denied.push(code);}}
const requested=await cli(['reading','request','--purpose','阶段安装预检：完整原句与来源的连续和对照读法']);if(!requested.ok)throw Error('Real invitation unavailable');
const basis=requested.value.source,ids=basis.blocks.map(b=>b.sourceId),common={schemaVersion:1,requestId:requested.value.requestId,scope:basis.scope,structureVersion:basis.structureVersion,sourceSetVersion:basis.sourceSetVersion,sourceVersions:basis.blocks.map(b=>({sourceId:b.sourceId,contentVersion:b.contentVersion}))};
if(JSON.stringify(basis.blocks)!==JSON.stringify(source.blocks))throw Error('Source changed during invitation');
const suffix=requested.value.requestId.slice(0,8);
const continuous={...common,planId:'package-continuous-'+suffix,name:'完整原句 · 连续读',layout:[{kind:'paragraphs',key:'all',sourceIds:ids}]},comparison={...common,planId:'package-comparison-'+suffix,name:'做事与讨论 · 对照读',layout:[{kind:'sequence',key:'root',sourceIds:ids.slice(0,1)},{kind:'comparison',key:'contrast',title:'做事与讨论的原句对照',columns:[{key:'doing',title:'边做边记录',children:[{kind:'paragraphs',key:'doing-body',sourceIds:ids.slice(1,26)}]},{key:'discussion',title:'谨慎留下思考',children:[{kind:'sequence',key:'discussion-body',sourceIds:ids.slice(26,51)}]}]},{kind:'group',key:'remaining',title:'零散记录与权限边界',children:[{kind:'paragraphs',key:'remaining-body',sourceIds:ids.slice(51)}]}]};
const observe=async(kind,headings)=>{
 const destination=join(m.evidence,'package-'+kind+'-runtime.json');await exec(process.execPath,['--experimental-websocket',join(repo,'scripts/reading-desktop-probe.mjs'),destination,root],{timeout:30000});
 const snapshot=JSON.parse(await readFile(destination)),v=snapshot.values.find(v=>v.value?.pluginConnected)?.value;
 if(!v||snapshot.errors.length||snapshot.values.some(v=>v.exception)||v.primary.length!==source.blocks.length||new Set(v.primary.map(v=>v.sourceId)).size!==source.blocks.length||v.headings.length!==headings||v.headings.some(v=>v.uuid))throw Error('Actual installed full-source DOM or headings mismatch: '+kind);
 for(const b of source.blocks){const row=v.primary.find(v=>v.sourceId===b.sourceId);if(!row||row.version!==b.contentVersion)throw Error('Actual source/version DOM mismatch');}
 record.views.push({kind,destination,primary:v.primary,headings:v.headings,editing:v.editing,sourceLocation:v.report.sourceLocation,exceptions:snapshot.errors,consoleErrors:snapshot.consoleErrors});await writeFile(recordPath,JSON.stringify(record,null,2));
};
record.continuous=await cli(['reading','submit'],continuous);if(!record.continuous.ok)throw Error('Installed continuous plan rejected');await observe('continuous',0);
record.samePlan=await cli(['reading','submit'],continuous);if(record.samePlan.value.status!=='already-selected')throw Error('Installed plan replay mismatch');
record.comparison=await cli(['reading','submit'],comparison);if(!record.comparison.ok)throw Error('Installed comparison plan rejected');await observe('comparison',4);
record.original=await cli(['reading','original']);if(!record.original.ok||(await cli(['reading','read'])).activePlanId!==null)throw Error('Installed original source order return failed');
if(!(await cli(['reading','select',continuous.planId])).ok||!(await cli(['reading','select',comparison.planId])).ok)throw Error('Installed plan round trip failed');
record.highlight=await cli(['reading','highlight'],{schemaVersion:1,sourceIds:[ids[1]],includeContext:false,structureVersion:basis.structureVersion,sourceSetVersion:basis.sourceSetVersion});await writeFile(recordPath,JSON.stringify(record,null,2));
if(!record.highlight.ok||record.highlight.value.requestedSourceIds.length!==25||record.highlight.value.highlightedSourceIds.length!==25)throw Error('Installed native source set mismatch');await observe('highlight',4);
const after=await cli(['content','read']),afterHash=sha(await readFile(graphFile));if(JSON.stringify(after.blocks)!==JSON.stringify(source.blocks)||afterHash!==beforeHash)throw Error('Reading or rejected requests changed source/Graph');
if((await readFile(join(m.work,'WORKSPACE.md'),'utf8'))!=='# 用户保留入口\n合成验收：这个已有文件不能被插件生成入口覆盖。\n')throw Error('Existing user WORKSPACE was overwritten');
Object.assign(record,{completedAt:new Date().toISOString(),after,afterHash,sourceUnchanged:true,graphUnchanged:true,userWorkspacePreserved:true,limits:['this helper verifies reading only; writing and core-format evidence is separate','physical IME, Finder and clipboard preservation not proven by this helper']});await writeFile(recordPath,JSON.stringify(record,null,2));
console.log(JSON.stringify({sources:source.blocks.length,layouts:2,denied:record.denied,highlighted:25,graphUnchanged:true,userWorkspacePreserved:true,zipHash:m.zipHash}));
