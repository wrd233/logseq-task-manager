// Real built CLI and owned page scope. All binding, connection and grants use
// the actual local Desktop UI; this script never supplies a writable root.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(repo,'tmp/reading-desktop'),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex'),phase=process.argv[2]??'prepare';
const m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),directory=join(root,'page-work'),evidencePath=join(m.evidence,'page-exercise.json');
if(m.root!==root||!m.graph.startsWith(root+'/')||!m.plugin.startsWith(repo+'/apps/'))throw Error('Owned acceptance paths required');
const cli=async(words,input,workDirectory=directory)=>{
  const args=[];if(input!==undefined){const path=join(m.evidence,'page-input.json');await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}
  const r=await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',workDirectory,'--state-dir',m.channel,'--client','page-desktop','--json'],{timeout:30000});return JSON.parse(r.stdout);
};
if(phase==='switched'){
  const record=JSON.parse(await readFile(evidencePath,'utf8'));
  try{await cli(['status']);throw Error('Old page connection remained online after the real block switch');}catch(error){
    if(!/WORKSPACE_OFFLINE|CONNECTION_REVOKED/u.test(error.stderr??''))throw error;
    record.pageSwitchRejection=JSON.parse(error.stderr).error.code;
  }
  if(sha(await readFile(join(m.graph,'pages/合成阅读与协作.md')))!==record.beforeGraphHash)throw Error('Scope switch changed Graph bytes');
  record.switchedAt=new Date().toISOString();await writeFile(evidencePath,JSON.stringify(record,null,2));
  console.log(JSON.stringify({phase,rejection:record.pageSwitchRejection,graphUnchanged:true}));process.exit(0);
}
const status=await cli(['status']);if(status.binding.directory!==directory||!status.binding.scope.graphId.includes(m.graph)||status.binding.scope.kind!=='page'||status.binding.scope.pageName!=='合成阅读与协作')throw Error('Actual owned page connection required');
const source=await cli(['content','read']);if(source.blocks.length<80||source.scope.kind!=='page'||source.page.pageUuid!==status.binding.scope.rootUuid||!source.readOnly||source.blocks.some(b=>b.target.blockUuid===source.scope.rootUuid)||source.blocks[0].target.blockUuid!=='b7261007-0000-4000-8000-000000000001')throw Error('Actual complete page without an invented root required');
const graphHash=sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),entryBytes=await readFile(join(directory,'WORKSPACE.md'));
if(phase==='prepare'){
  if(status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo||status.capabilities.stage||status.capabilities.focus)throw Error('Initial page connection must be read-only');
  const guide=await cli(['guidance','read']),scene=await cli(['collaboration','read']);if(!scene.scene.request.includes('页面协作演练')||scene.scene.savedSource.scope.kind!=='page'||!scene.current.sourceMatches)throw Error('Actual prepared page scene required');
  const denied=[];for(const [words,input] of [[['todo','read']], [['content','apply'],{schemaVersion:1,requestId:'page-denied',scope:source.scope,operations:[]}], [['formatting','preview'],{requestId:'page-format-denied',sourceIds:[source.blocks[0].sourceId]}], [['stage','read'],{}]]){
    try{await cli(words,input);throw Error('Unexpected page writing capability');}catch(error){if(!error.stderr?.includes('BLOCK_SCOPE_REQUIRED'))throw error;denied.push(words.join(' '));}
  }
  let oldBlockRejection;try{await cli(['status'],undefined,m.work);throw Error('Old block connection still online');}catch(error){if(!/WORKSPACE_OFFLINE|DESCRIPTOR_STALE/u.test(error.stderr??''))throw error;oldBlockRejection=JSON.parse(error.stderr).error.code;}
  const manifest=JSON.parse(await readFile(join(directory,'.task-workspace/manifest.json'),'utf8')),generated=await readFile(join(directory,manifest.entryFile),'utf8');
  if(manifest.primarySource.kind!=='page'||manifest.primarySource.rootUuid!==source.scope.rootUuid||manifest.entryFile==='WORKSPACE.md'||!generated.includes('?page=')||generated.includes('?block-id='+source.scope.rootUuid))throw Error('Actual page manifest/entry required');
  const record={preparedAt:new Date().toISOString(),status,source,guide,scene,denied,manifest,generatedEntry:generated,entryHash:sha(entryBytes),beforeGraphHash:graphHash,oldBlockRejection,runtime:{jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,developmentDirectory:true,capabilityInjection:false}};
  await writeFile(evidencePath,JSON.stringify(record,null,2));console.log(JSON.stringify({phase,pageUuid:source.scope.rootUuid,sources:source.blocks.length,denied,oldBlockOffline:true}));
}else if(phase==='capture'){
  const record=JSON.parse(await readFile(evidencePath,'utf8'));if(sha(await readFile(join(m.plugin,'dist/index.js')))!==record.runtime.jsHash||status.capabilities.content||status.authorizesTodo||!status.capabilities.fileWrite)throw Error('Actual independent file grant and same runtime required');
  const originals=['反例：即使试用成本很低','下一轮需要询问退出后的'].map(prefix=>source.blocks.find(b=>b.content?.startsWith(prefix)));if(originals.some(b=>!b))throw Error('Actual saved originals required');
  const text='# 页面阅读比较\n\n'+originals.map(b=>b.content).join('\n\n')+'\n\n尚未询问，页面中的 TODO 和项目判断保持。\n';
  const request={requestKey:'page-desktop-comparison',title:'页面阅读比较',role:'output',text},captured=await cli(['materials','capture'],request),again=await cli(['materials','capture'],request);
  if(captured.status!=='success'||again.material.id!==captured.material.id||!captured.material.path.startsWith(directory+'/'))throw Error('Actual scoped material capture and idempotence required');
  const material=await cli(['materials','read',captured.material.id]),bytes=await readFile(material.path),after=await cli(['content','read']);
  if(sha(bytes)!==material.version||material.content!==text||JSON.stringify(after.blocks)!==JSON.stringify(record.source.blocks)||sha(await readFile(join(m.graph,'pages/合成阅读与协作.md')))!==record.beforeGraphHash||sha(entryBytes)!==record.entryHash)throw Error('Page/source/user entry changed or material bytes differ');
  Object.assign(record,{capturedAt:new Date().toISOString(),permissions:status,material,materialBytesHash:sha(bytes),sameMaterialId:true,sourceUnchanged:true,graphHash,userEntryUnchanged:true,after});await writeFile(evidencePath,JSON.stringify(record,null,2));console.log(JSON.stringify({phase,materialId:material.id,reference:material.reference,sourceUnchanged:true,userEntryUnchanged:true}));
}else if(phase==='reconnected'){
  const record=JSON.parse(await readFile(evidencePath,'utf8'));
  if(!record.pageSwitchRejection||status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo)throw Error('Real revoked-then-read-only page reconnect required');
  const material=await cli(['materials','read',record.material.id]);
  if(material.version!==record.material.version||material.path!==record.material.path||JSON.stringify(source.blocks)!==JSON.stringify(record.source.blocks)||graphHash!==record.beforeGraphHash||sha(entryBytes)!==record.entryHash)throw Error('Read-only reconnect changed preserved data');
  const scene=await cli(['collaboration','read']);if(scene.scene.savedSource.scope.kind!=='page'||!scene.current.sourceMatches)throw Error('Reconnected actual page scene required');
  Object.assign(record,{reconnectedAt:new Date().toISOString(),reconnectedStatus:status,reconnectedScene:scene,reconnectedMaterial:material});await writeFile(evidencePath,JSON.stringify(record,null,2));
  console.log(JSON.stringify({phase,readOnly:true,materialId:material.id,sourceUnchanged:true}));
}else throw Error('Usage: prepare | capture | switched | reconnected');
