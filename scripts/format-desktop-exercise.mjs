// Real built CLI and owned Graph. Preview/query only; edits and approval are
// performed through the actual local Desktop UI, with no injected capabilities.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(repo,'tmp/reading-desktop'),exec=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
const m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),phase=process.argv[2]??'prepare',path=join(m.evidence,'format-exercise.json');
if(m.root!==root||!m.graph.startsWith(root+'/')||!m.work.startsWith(root+'/')||!m.plugin.startsWith(repo+'/apps/'))throw Error('Owned acceptance paths required');
const cli=async(words,input)=>{
  const args=[];if(input!==undefined){const path=join(m.evidence,'format-input.json');await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}
  const r=await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',m.work,'--state-dir',m.channel,'--client','format-desktop','--json'],{timeout:30000});return JSON.parse(r.stdout);
};
const status=await cli(['status']);if(!status.binding.scope.graphId.includes(m.graph)||status.binding.directory!==m.work)throw Error('Wrong live Graph/work scope');
if(status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo)throw Error('Format exercise requires independent read-only authority');
const source=await cli(['content','read']),selected=source.blocks.find(b=>b.target.blockUuid==='b7261007-0000-4000-8000-000000000032'),conditionId='b7261007-0000-4000-8000-000000000028',condition='用户补充：不过离线阅读时也要保留问号与限定句。';
if(!selected)throw Error('Actual saved ordinary question required');
if(phase==='prepare'){
  const guide=await cli(['guidance','read']),scene=await cli(['collaboration','read']);if(!scene.scene.request.includes('合成格式演练'))throw Error('Actual user intent required');
  const proposal=await cli(['formatting','preview'],{requestId:'format-desktop-1',sourceIds:[selected.sourceId],labels:['问一下']});
  if(proposal.changes.length!==1||proposal.changes[0].blockUuid!==selected.target.blockUuid)throw Error('One actual prefix diff required');
  const record={preparedAt:new Date().toISOString(),status,source,guide,scene,proposal,conditionId,condition,beforeGraphHash:sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),runtime:{jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,developmentDirectory:true,capabilityInjection:false}};
  await writeFile(path,JSON.stringify(record,null,2));console.log(JSON.stringify({phase,changes:proposal.changes,bodyWrite:false}));
}else{
  const record=JSON.parse(await readFile(path,'utf8'));if(sha(await readFile(join(m.plugin,'dist/index.js')))!==record.runtime.jsHash)throw Error('Different runtime build');
  if(phase==='stale'){
    const result=await cli(['formatting','result','format-desktop-1']);
    if(result?.status!=='not-applied'||!result.durable||result.record.items.some(i=>i.status!=='CONFLICT'||i.reason!=='FORMAT_SOURCE_CHANGED'))throw Error('Old proposal not proven stale');
    if(!source.blocks.find(b=>b.target.blockUuid===conditionId)?.content.includes(condition)||selected.content!==record.source.blocks.find(b=>b.target.blockUuid===selected.target.blockUuid).content)throw Error('User condition lost or stale format wrote');
    Object.assign(record,{stale:{at:new Date().toISOString(),result,source}});
  }else if(phase==='fresh'){
    const old=await cli(['formatting','result','format-desktop-1']);if(!old||!old.record.items.every(i=>old.record.resolutions[i.operationId]==='keep-current'))throw Error('Actual local keep-current required');
    const proposal=await cli(['formatting','preview'],{requestId:'format-desktop-2',sourceIds:[selected.sourceId],labels:['问一下']});if(proposal.changes.length!==1)throw Error('Fresh prefix diff required');
    Object.assign(record,{fresh:{at:new Date().toISOString(),source,proposal,old}});
  }else if(phase==='collect'){
    const result=await cli(['formatting','result','format-desktop-2']),again=await cli(['formatting','recover','format-desktop-2']);
    if(result?.status!=='complete'||!result.durable||result.record.intentKind!=='formatting'||again.record.digest!==result.record.digest||result.record.origin.kind!=='local-user-command'||result.record.formatting.proposedBy.kind!=='verified-local-agent')throw Error('Actual local approval/readback/Journal required');
    const before=record.fresh.source,changed=before.blocks.filter(b=>b.content!==source.blocks.find(a=>a.sourceId===b.sourceId)?.content);
    if(changed.length!==1||changed[0].sourceId!==selected.sourceId||selected.content!==before.blocks.find(b=>b.sourceId===selected.sourceId).content.replace(/^\[问一下\]/u,'**[问一下]**'))throw Error('Diff exceeded the exact prefix');
    if(source.blocks.length!==before.blocks.length||!before.blocks.every(b=>{const a=source.blocks.find(a=>a.sourceId===b.sourceId);return a&&a.target.blockUuid===b.target.blockUuid&&a.parentUuid===b.parentUuid&&a.order===b.order&&a.depth===b.depth;}))throw Error('Identity or structure changed');
    const bytes=await readFile(join(m.graph,'pages/合成阅读与协作.md'));if(!bytes.toString().includes('**[问一下]** 讨论到什么程度')||!bytes.toString().includes(condition))throw Error('Graph persistence not observed');
    Object.assign(record,{completed:{at:new Date().toISOString(),result,againDigest:again.record.digest,status,source,changedSourceIds:changed.map(b=>b.sourceId),structureUnchanged:true,userConditionRetained:true,afterGraphHash:sha(bytes)}});
  }else throw Error('Usage: prepare | stale | fresh | collect');
  await writeFile(path,JSON.stringify(record,null,2));console.log(JSON.stringify({phase,completed:!!record.completed,staleRejected:!!record.stale,changes:record.completed?.changedSourceIds.length??null}));
}
