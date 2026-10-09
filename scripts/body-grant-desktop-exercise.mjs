// Real menu-grant evidence. This script only reads the actual CLI and files.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot,acceptancePlugin,acceptanceRuntime} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),phase=process.argv[2]??'readonly',exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex'),path=join(m.evidence,'body-grant-exercise.json');
if(m.root!==root||!m.graph.startsWith(root+'/')||!acceptancePlugin(m,repo))throw Error('Owned acceptance paths required');
const cli=async words=>JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,'--directory',m.work,'--state-dir',m.channel,'--client','body-grant-desktop','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304})).stdout);
const status=await cli(['status']),source=await cli(['content','read']),hash=sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),permissions={body:status.capabilities.content,file:status.capabilities.fileWrite,todo:status.authorizesTodo,structure:status.contentProtocol.structureAuthorized};
if(source.scope.rootUuid!=='b7261007-0000-4000-8000-000000000001'||!source.scope.graphId.includes(m.graph)||permissions.todo||permissions.structure)throw Error('Actual work root and independent grants required');
let e;if(phase==='readonly'){
  if(permissions.body||permissions.file)throw Error('Initial real read-only connection required');e={at:new Date().toISOString(),scope:source.scope,source,graphHash:hash,readonly:permissions,runtime:{jsHash:sha(await readFile(join(m.plugin,'dist/index.js'))),cliHash:sha(await readFile(join(m.plugin,'dist/workspace.mjs'))),node:process.version,...acceptanceRuntime(m),capabilityInjection:false}};
}else{
  e=JSON.parse(await readFile(path,'utf8'));if(JSON.stringify(source.blocks)!==JSON.stringify(e.source.blocks)||hash!==e.graphHash||sha(await readFile(join(m.plugin,'dist/index.js')))!==e.runtime.jsHash)throw Error('Menu grant changed saved Graph/source or runtime');
  if(phase==='files'){if(permissions.body||!permissions.file)throw Error('Independent actual file grant required');e.files=permissions;}
  else if(phase==='body'){if(!e.files||!permissions.body||permissions.file)throw Error('New explicit body grant inherited old files or remained read-only');e.body=permissions;e.sourceUnchanged=true;e.graphUnchanged=true;}
  else throw Error('Usage: readonly | files | body');
}
await writeFile(path,JSON.stringify(e,null,2));console.log(JSON.stringify({phase,permissions,scope:source.scope,sourceUnchanged:e.sourceUnchanged??true}));
