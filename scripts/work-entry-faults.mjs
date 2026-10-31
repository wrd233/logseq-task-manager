// Faults affect only this Goal's owned test directory, never production data.
import {readFile,readdir,rename,mkdir,rmdir,writeFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const root=resolve('tmp/work-entry-desktop'),evidence=join(root,'evidence');
const rows=JSON.parse(await readFile(join(root,'bindings/bindings.json'),'utf8')).bindings;
const target=rows.find(row=>row.binding&&row.workRef?.kind==='logseq'),directory=target.binding.directory;
if(!directory.startsWith(root+'/'))throw Error('Fault target is not owned');
const metadata=join(directory,'.task-workspace');
const reference=(await readdir(metadata)).find(name=>/^agent-sessions-v1-.*\.json$/.test(name));
if(!reference)throw Error('Expected a real portable reference');
const path=join(metadata,reference),backup=path+'.acceptance-backup';
const mode=process.argv[2];
if(mode==='reference-fail') {
  await rename(path,backup);await mkdir(path);
  await writeFile(join(evidence,'reference-fault.json'),JSON.stringify({kind:'real filesystem auxiliary reference fault',path,backup,nativeSessionCountBefore:rows.length,
    graphHash:createHash('sha256').update(await readFile(join(root,'graph/pages/会话连续性验收.md'))).digest('hex'),modelAttemptsBefore:await attempts()},null,2));
} else if(mode==='reference-restore') {
  if(!(await stat(path)).isDirectory())throw Error('Fault placeholder changed');
  await rmdir(path);await rename(backup,path);
} else throw Error('Usage: reference-fail | reference-restore');
console.log(JSON.stringify({mode,owned:true}));
async function attempts(){try{return (await readFile(join(evidence,'model-network.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.phase==='attempt').length;}catch(error){if(error.code==='ENOENT')return 0;throw error;}}
