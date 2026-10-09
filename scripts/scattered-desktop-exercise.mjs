// Actual finite reading plans and formatting previews over the owned Desktop.
// Native edits and immutable-diff approval are performed only through real UI.
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
const m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),evidencePath=join(m.evidence,'scattered-exercise.json'),graphFile=join(m.graph,'pages/合成阅读与协作.md'),condition='用户追加：不过离线引用还需要保留当时文件的版本，尚未验证能否做到。';
if(m.root!==root||!m.graph.startsWith(root+'/')||!acceptancePlugin(m,repo))throw Error('Owned acceptance paths required');
const cli=async(words,input)=>{
  const args=[];if(input!==undefined){const path=join(m.evidence,'scattered-input.json');await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}
  const result=await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',m.work,'--state-dir',m.channel,'--client','scattered-desktop','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304});return JSON.parse(result.stdout);
};
const status=await cli(['status']);if(status.binding.scope.rootUuid!=='b7261007-0000-4000-8000-000000000001'||!status.binding.scope.graphId.includes(m.graph)||status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo)throw Error('Actual complete read-only work required');
const source=await cli(['content','read']),selected=source.blocks.find(b=>b.target.blockUuid==='b7261007-0000-4000-8000-000000000028');if(!selected)throw Error('Actual natural thought source required');
const plansFor=async suffix=>{
  const before=sha(await readFile(graphFile)),r=await cli(['reading','request','--purpose','保留完整原句、重复与未知条件，连续和局部对照']);if(!r.ok)throw Error(r.reason);
  const s=r.value.source,ids=s.blocks.map(b=>b.sourceId),subtree=id=>{const uuids=new Set([id]);for(const b of s.blocks)if(uuids.has(b.parentUuid))uuids.add(b.target.blockUuid);return s.blocks.filter(b=>uuids.has(b.target.blockUuid)).map(b=>b.sourceId);};
  const doing=subtree('b7261007-0000-4000-8000-000000000002'),discussion=subtree('b7261007-0000-4000-8000-000000000027'),other=ids.filter(id=>id!==ids[0]&&!doing.includes(id)&&!discussion.includes(id));
  const base={schemaVersion:1,requestId:r.value.requestId,scope:s.scope,structureVersion:s.structureVersion,sourceSetVersion:s.sourceSetVersion,sourceVersions:s.blocks.map(b=>({sourceId:b.sourceId,contentVersion:b.contentVersion}))};
  const planSuffix=suffix+'-'+r.value.requestId.slice(0,8);
  const continuous={...base,planId:'scattered-continuous-'+planSuffix,name:'保留所有犹豫 · 连续读 '+suffix,layout:[{kind:'paragraphs',key:'all',sourceIds:ids}]};
  const comparison={...base,planId:'scattered-comparison-'+planSuffix,name:'做事与条件 · 对照读 '+suffix,layout:[{kind:'sequence',key:'root',sourceIds:ids.slice(0,1)},{kind:'comparison',key:'compare',title:'原句的做事与讨论对照',columns:[{key:'doing',title:'边做边记录',children:[{kind:'paragraphs',key:'doing-body',sourceIds:doing}]},{key:'discussion',title:'保留讨论条件',children:[{kind:'sequence',key:'discussion-body',sourceIds:discussion}]}]},{kind:'group',key:'other',title:'零散片段与权限边界',children:[{kind:'paragraphs',key:'other-body',sourceIds:other}]}]};
  for(const plan of [continuous,comparison]){const result=await cli(['reading','submit'],plan);if(!result.ok)throw Error(result.reason);}
  if((await cli(['reading','select',continuous.planId])).ok!==true||JSON.stringify((await cli(['content','read'])).blocks)!==JSON.stringify(s.blocks)||sha(await readFile(graphFile))!==before)throw Error('Reading plans changed saved sources');
  return {source:s,continuous,comparison,graphHash:before};
};
if(phase==='prepare'){
  const guide=await cli(['guidance','read']),scene=await cli(['collaboration','read']);if(!scene.scene.request.includes('合成零散记录再协作验收'))throw Error('Actual saved third exercise request required');
  const plans=await plansFor('initial'),proposal=await cli(['formatting','preview'],{requestId:'scattered-format-old',sourceIds:[selected.sourceId],labels:['想法']});if(proposal.changes.length!==0||!selected.content.startsWith('**[想法]**'))throw Error('Already canonical prefix must remain a no-op');
  const e={preparedAt:new Date().toISOString(),scope:source.scope,source,guide,scene,plans,proposal,condition,conditionId:selected.target.blockUuid,beforeGraphHash:sha(await readFile(graphFile)),runtime:{jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,...acceptanceRuntime(m),capabilityInjection:false}};
  await writeFile(evidencePath,JSON.stringify(e,null,2));console.log(JSON.stringify({phase,sources:source.blocks.length,readingUnchanged:true,formatChanges:proposal.changes.length}));
}else{
  const e=JSON.parse(await readFile(evidencePath,'utf8'));if(sha(await readFile(join(m.plugin,'dist/index.js')))!==e.runtime.jsHash)throw Error('Different runtime build');
  if(phase==='comparison'){
    if(!(await cli(['reading','select',e.plans.comparison.planId])).ok)throw Error('Actual comparison selection failed');
    if(JSON.stringify(source.blocks)!==JSON.stringify(e.source.blocks)||sha(await readFile(graphFile))!==e.beforeGraphHash)throw Error('Changing read layout changed Graph');e.comparisonSelectedAt=new Date().toISOString();
  }else if(phase==='original'){
    if(!(await cli(['reading','original'])).ok)throw Error('Return to original reading failed');e.originalSelectedAt=new Date().toISOString();
  }else if(phase==='stale'){
    const oldPlan=await cli(['reading','select',e.plans.comparison.planId]);
    if(oldPlan.ok||oldPlan.reason!=='stale-reading-plan')throw Error('Old reading not proven stale');
    if(!selected.content.includes(condition)||!selected.content.startsWith('**[想法]**')||!selected.content.includes('用户补充：不过离线阅读时也要保留问号与限定句。'))throw Error('New or previous user condition lost or old proposal wrote');
    e.stale={at:new Date().toISOString(),oldPlan,source};
  }else if(phase==='fresh'){
    const proposal=await cli(['formatting','preview'],{requestId:'scattered-format-fresh',sourceIds:[selected.sourceId],labels:['想法']});if(proposal.changes.length!==0)throw Error('Fresh canonical prefix must remain a no-op');e.fresh={at:new Date().toISOString(),source,proposal};
  }else if(phase==='collect'){
    if(JSON.stringify(source.blocks)!==JSON.stringify(e.fresh.source.blocks)||e.fresh.proposal.changes.length!==0)throw Error('No-op format altered the actual source');
    const bytes=await readFile(graphFile);if(!bytes.toString().includes(condition)||!bytes.toString().includes('**[想法]** 先把阅读和写作分开说清楚'))throw Error('Actual new condition persistence required');
    e.completed={at:new Date().toISOString(),source,formatNoOp:true,formatChanges:0,afterGraphHash:sha(bytes),structureUnchanged:true,userConditionsRetained:true};e.continued=await plansFor('continued');
  }else throw Error('Usage: prepare | comparison | original | stale | fresh | collect');
  await writeFile(evidencePath,JSON.stringify(e,null,2));console.log(JSON.stringify({phase,staleRejected:!!e.stale,complete:!!e.completed,sources:source.blocks.length}));
}
