// Obtain full references from the installed service and verify actual native/body
// preview observations. This helper never inserts Graph text or grants permission.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot,acceptanceRuntime} from './acceptance-context.mjs';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex'),phase=process.argv[2]??'prepare';
if(!m.ownerToken)throw Error('Outside-repository package required');
const path=join(m.evidence,'package-reference-exercise.json'),graphFile=join(m.graph,'pages/合成阅读与协作.md');
const cli=async words=>JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,'--directory',m.work,'--state-dir',m.channel,'--client','package-reference','--json'],{cwd:root,timeout:30000,maxBuffer:4194304})).stdout);
const observe=async name=>{const r=JSON.parse(await readFile(join(m.evidence,name+'.json'))),v=r.values.find(v=>v.value?.pluginConnected)?.value;if(r.manifest.identity.commit!==m.identity.commit||r.manifest.zipHash!==m.zipHash||!v||r.errors.length||r.values.some(v=>v.exception))throw Error('Actual successful same-package observation required: '+name);return {record:r,value:v};};
if(phase==='prepare'){
  const status=await cli(['status']);if(status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo||status.binding.scope.rootUuid!=='b7261007-0000-4000-8000-000000000001')throw Error('Actual read-only block scope required');
  const source=await cli(['content','read']),beforeHash=sha(await readFile(graphFile)),materials=[];
  for(const [kind,file]of [['md','阅读 [中文] (副本) #_*.md'],['docx','中文 方案.docx'],['pdf','中文 多页扫描.pdf'],['xlsx','中文 多工作表.xlsx'],['image','中文 图像.png']]){
    const actual=await observe('format-'+kind+'-main-runtime'),preview=actual.value.previews[0];if(!preview?.target.startsWith('material:'))throw Error('Actual registered preview required');
    const view=await cli(['materials','read',preview.target.slice(9)]),expected=join(root,'preview-corpus/materials',file),version=sha(await readFile(expected));
    if(view.path!==expected||view.availability!=='available'||view.id!==preview.target.slice(9)||version!==preview.version||!view.reference.includes('(longdoc://'+view.id+')'))throw Error('Service reference / actual bytes mismatch');
    materials.push({kind,file,id:view.id,reference:view.reference,path:view.path,version,serviceView:view,preview});
  }
  const after=await cli(['content','read']),afterHash=sha(await readFile(graphFile));if(JSON.stringify(source.blocks)!==JSON.stringify(after.blocks)||beforeHash!==afterHash)throw Error('Metadata reads changed Graph');
  const record={at:new Date().toISOString(),runtime:acceptanceRuntime(m),status,source,beforeHash,afterHash,sourceUnchanged:true,materials,fixtureSlot:'b7261007-0000-4000-8000-000000000026',linkStatement:materials.map(v=>v.reference).join('\n')};
  await writeFile(path,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({references:materials.map(v=>({kind:v.kind,id:v.id,reference:v.reference})),sourceUnchanged:true,permissions:{body:false,file:false,todo:false}}));
}else if(phase==='collect'){
  const record=JSON.parse(await readFile(path));if(record.runtime.commit!==m.identity.commit||record.runtime.zipHash!==m.zipHash)throw Error('Different package');
  const baseline=await observe('format-native-references-before-runtime'),sources=baseline.value.source;
  for(const v of record.materials){
    for(const entrance of ['native','body']){
      const actual=await observe('format-'+entrance+'-'+v.kind+'-runtime'),p=actual.value.previews[0];
      if(p?.target!=='material:'+v.id||p.version!==v.version||JSON.stringify(actual.value.source)!==JSON.stringify(sources)||JSON.stringify(actual.value.report.sourceLocation.requestedSourceIds)!==JSON.stringify(baseline.value.report.sourceLocation.requestedSourceIds)||JSON.stringify(actual.value.report.sourceLocation.highlightedSourceIds)!==JSON.stringify(baseline.value.report.sourceLocation.highlightedSourceIds))throw Error('Actual reference routing / source preservation mismatch: '+v.kind+' '+entrance);
    }
    if(sha(await readFile(v.path))!==v.version)throw Error('Original bytes changed');
  }
  record.collected={at:new Date().toISOString(),nativeAndBodyFormats:5,sameTargetsAndVersions:true,savedSourceAndHighlightSetsUnchanged:true,originalBytesUnchanged:true,fixtureLinksInsertedThroughNativeEditor:true,graphHash:sha(await readFile(graphFile))};await writeFile(path,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record.collected));
}else throw Error('Usage: prepare | collect --package NAME');
