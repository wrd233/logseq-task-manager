// Only the named synthetic material root is moved; no SDK/IPC mutations.
import {readFile,writeFile,rename,realpath,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),phase=process.argv[2],file=join(m.evidence,'directory-final-exercise.json'),original=join(root,'preview-corpus/materials'),offline=join(root,'preview-corpus/materials-offline-probe'),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex');
if(!m.ownerToken||m.root!==root||await realpath(root)!==root)throw Error('Owned synthetic package root required');
const exists=async p=>{try{await stat(p);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
const cli=async(words,input)=>{const args=[];if(input){const path=join(m.evidence,'directory-final-input.json');await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}return JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',m.work,'--state-dir',m.channel,'--client','directory-final','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304})).stdout);};
const originals=async moved=>{const fixture=JSON.parse(await readFile(join(repo,'apps/logseq-plugin/tests/fixtures/material-preview/desktop-acceptance/manifest.json')));for(const s of fixture.samples){const path=moved&&s.relativePath.startsWith('materials/')?join(offline,s.relativePath.slice('materials/'.length)):join(root,'preview-corpus',s.relativePath);if(sha(await readFile(path))!==s.sha256)throw Error('Original synthetic bytes changed');}return fixture.samples.length;};
if(phase==='prepare'){
  const before=JSON.parse(await readFile(join(m.evidence,'directory-final-leaf-before-runtime.json'))),renamed=JSON.parse(await readFile(join(m.evidence,'directory-final-renamed-material.json'))),v=before.values.find(v=>v.value?.pluginConnected).value,p=v.previews[0];
  if(p.target!=='material:'+renamed.id||p.version!==renamed.version||renamed.path!==join(original,'自动加入改名验收.md')||await exists(join(original,'自动加入验收.md')))throw Error('Actual UI rename required');
  const status=await cli(['status']);if(status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo)throw Error('Actual read-only connection required');
  const request=await cli(['reading','request','--purpose','合成目录失联：保留原来源和关联材料身份']);if(!request.ok)throw Error(request.reason);const s=request.value.source;
  const plan={schemaVersion:1,requestId:request.value.requestId,planId:'directory-final-'+request.value.requestId.slice(0,8),name:'合成目录失联验收',scope:s.scope,structureVersion:s.structureVersion,sourceSetVersion:s.sourceSetVersion,sourceVersions:s.blocks.map(b=>({sourceId:b.sourceId,contentVersion:b.contentVersion})),layout:[{kind:'paragraphs',key:'all',sourceIds:s.blocks.map(b=>b.sourceId)},{kind:'material',key:'actual-leaf',materialId:renamed.id}]};
  const selected=await cli(['reading','submit'],plan);if(!selected.ok)throw Error(selected.reason);
  const r={observedAt:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,source:s,plan,material:renamed,originalPreview:p,graphSha:sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),originals:await originals(false),uiRenameSameIdAndBytes:true};await writeFile(file,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({phase,plan:plan.planId,material:renamed.id,originals:r.originals}));
}else{
  const r=JSON.parse(await readFile(file));if(r.commit!==m.identity.commit||r.zipHash!==m.zipHash)throw Error('Mixed package directory exercise');
  if(phase==='move-offline'){
    if(await realpath(original)!==original||await exists(offline))throw Error('Exclusive owned move required');await originals(false);await rename(original,offline);r.movedAt=new Date().toISOString();r.offlineOriginals=await originals(true);
  }else if(phase==='offline'){
    if(await exists(original)||await realpath(offline)!==offline)throw Error('Actual moved root required');const selected=await cli(['reading','select',r.plan.planId]),reading=await cli(['reading','read']);if(selected.ok||selected.reason!=='material-outside-scope'||reading.plans.find(p=>p.planId===r.plan.planId)?.status!=='material-unavailable')throw Error('Actual material-unavailable plan required');r.offline={at:new Date().toISOString(),selected,reading};
  }else if(phase==='restore-path'){
    if(await exists(original)||await realpath(offline)!==offline)throw Error('Exclusive owned restore required');await originals(true);await rename(offline,original);r.restoredPathAt=new Date().toISOString();r.restoredOriginals=await originals(false);
  }else if(phase==='restored'){
    const material=await cli(['materials','read',r.material.id]),source=await cli(['content','read']),selected=await cli(['reading','select',r.plan.planId]);if(material.path!==r.material.path||material.version!==r.material.version||material.id!==r.material.id||!selected.ok||JSON.stringify(source.blocks)!==JSON.stringify(r.source.blocks)||sha(await readFile(join(m.graph,'pages/合成阅读与协作.md')))!==r.graphSha)throw Error('Actual source/ID/path/bytes restoration failed');r.restored={at:new Date().toISOString(),material,selected,sourcesUnchanged:true,graphUnchanged:true,originals:await originals(false)};
  }else throw Error('Usage: prepare | move-offline | offline | restore-path | restored');
  await writeFile(file,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({phase,actual:true,sourceUnchanged:r.restored?.sourcesUnchanged??null}));
}
