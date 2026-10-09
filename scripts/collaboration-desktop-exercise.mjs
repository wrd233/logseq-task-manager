// Real packaged CLI against the isolated Desktop. No UI, SDK, grant or host injection.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot,acceptancePlugin,acceptanceRuntime} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),exec=promisify(execFile);
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
acceptancePlugin(manifest,repo);
const positional=process.argv.slice(2).filter((value,index,args)=>value!=='--package'&&args[index-1]!=='--package');
const directory=resolve(positional[0]??manifest.work),name=positional[1]??'collaboration-first';
if(!directory.startsWith(root+'/')||!/^collaboration-[a-z0-9-]+$/u.test(name))throw Error('Owned workspace/evidence required');
const cli=async(words,input)=>{
  const args=[];
  if(input!==undefined){const path=join(root,'evidence',`${name}-patch.json`);await writeFile(path,JSON.stringify(input));args.push('--input-file',path);}
  const result=await exec(process.execPath,[join(manifest.plugin,'dist/workspace.mjs'),'workspace',...words,...args,'--directory',directory,'--state-dir',manifest.channel,'--client','collaboration-desktop','--json'],{cwd:root,timeout:30000});return JSON.parse(result.stdout);
};
const sha=value=>createHash('sha256').update(value).digest('hex');
const graphFile=join(manifest.graph,'pages/合成阅读与协作.md'),before=sha(await readFile(graphFile));
const status=await cli(['status']),guidance=await cli(['guidance','read']),packet=await cli(['collaboration','read']),source=await cli(['content','read']);
if(status.binding.directory!==directory||status.binding.scope.graphId!==`graph:${manifest.graph}`&& !status.binding.scope.graphId.includes(manifest.graph))throw Error('Owned Graph/binding required');
if(status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo)throw Error('This exercise requires a real read-only local grant');
const block=source.blocks.find(b=>b.availability==='available'&&b.content?.includes('目前偏向'))??source.blocks.find(b=>b.availability==='available');
const expectedText=[...block.content][0],patch={schemaVersion:1,requestId:`${name}:denied-body`,scope:source.scope,operations:[{operationId:'denied',type:'replace-text',target:block.target,expectedContentVersion:block.contentVersion,expectedParentUuid:block.parentUuid,range:{start:0,end:expectedText.length},expectedText,text:'不得写入'}]};
const rejected=[];
for(const [words,input,expected] of [[['content','apply'],patch,'CONTENT_WRITE_AUTHORIZATION_REQUIRED'],[['materials','capture'],{requestKey:`${name}:denied-file`,text:'不得生成材料'},'FILE_WRITE_AUTHORIZATION_REQUIRED']]){
  try{await cli(words,input);throw Error('Unauthorized operation unexpectedly returned');}
  catch(error){const stderr=error.stderr??String(error);if(!stderr.includes(expected))throw error;rejected.push({command:words.join('.'),code:expected});}
}
const after=sha(await readFile(graphFile));if(before!==after)throw Error('Read-only exercise changed Graph Markdown');
const evidence={observedAt:new Date().toISOString(),scope:status.binding.scope,workspaceId:status.binding.workspaceId,directory,common:{key:guidance.common.source.key,version:guidance.common.version,origin:guidance.common.source.origin,text:guidance.common.text},project:{key:guidance.project.source.key,version:guidance.project.version,text:guidance.project.text},scene:{id:packet.scene.sceneId,blocks:packet.scene.savedSource.blocks.length,request:packet.scene.request,guidanceVersions:{common:packet.scene.guidance.common.version,project:packet.scene.guidance.project.version},nativeDraft:packet.scene.nativeDraft,current:packet.current},permissions:{body:status.capabilities.content,file:status.capabilities.fileWrite,todo:status.authorizesTodo},rejected,graph:{before,after,unchanged:before===after},runtime:{jsHash:sha(await readFile(join(manifest.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(manifest.plugin,'dist/workspace.mjs'))),node:process.version,...acceptanceRuntime(manifest),capabilityInjection:false}};
const destination=join(root,'evidence',`${name}.json`);await writeFile(destination,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({destination,common:evidence.common.version,project:evidence.project.version,blocks:evidence.scene.blocks,permissions:evidence.permissions,rejected,graphUnchanged:true}));
