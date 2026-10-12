import process from 'node:process';
import {spawn} from 'node:child_process';
import {readFile,mkdir,rm,open,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
/* global fetch, AbortSignal */

const state=process.env.TASK_COPILOT_WORKSPACE_STATE??join(homedir(),'.task-copilot-workspace');
const root=fileURLToPath(new URL('../../../',import.meta.url));
await mkdir(state,{recursive:true,mode:0o700});
const live=async path=>{try{const record=JSON.parse(await readFile(path,'utf8'));process.kill(record.pid,0);return true;}catch{return false;}};
const workspaceLive=async()=>{
  if(!await live(join(state,'workspace-server.lock')))return false;
  try{const descriptor=JSON.parse(await readFile(join(state,'workspace.json'),'utf8'));await fetch(descriptor.baseUrl,{signal:AbortSignal.timeout(2000)});return true;}
  catch{return false;}
};
async function start(command,args,name,env=process.env){
  const log=await open(join(state,`${name}.log`),'a',0o600);
  const child=spawn(command,args,{cwd:root,env,detached:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();
  child.on('error',error=>process.stderr.write(`${name}: ${error.message}\n`));
}
async function ensure(){
  if(!await workspaceLive()){
    const lock=join(state,'workspace-server.lock');
    // This starter removes only a dead lock in its own state directory.
    try{const record=JSON.parse(await readFile(lock,'utf8'));try{process.kill(record.pid,0);throw Error('协作服务仍在启动，请稍后重试。');}catch(error){if(error.code!=='ESRCH')throw error;await rm(lock);}}catch(error){if(error.code!=='ENOENT')throw error;}
    await start(process.execPath,[join(root,'apps/logseq-plugin/dist/workspace.mjs'),'workspace','serve','--state-dir',state],'companion');
    for(let i=0;i<50&&!await workspaceLive();i++)await delay(200);
    if(!await workspaceLive())throw Error('本地工作服务未启动，请检查 companion.log。');
  }
  if(!await live(join(state,'dsh-browser.json'))){
    let running=false;try{const r=await fetch('http://127.0.0.1:3080/',{signal:AbortSignal.timeout(2000)});running=r.ok||r.status===401;}catch{/* Service is not listening yet. */}
    if(!running){
      const env={...process.env,PATH:`/usr/local/bin:/opt/homebrew/bin:${process.env.PATH??''}`,TASK_COPILOT_WORKSPACE_STATE:state};
      const ca='/usr/local/etc/ca-certificates/cert.pem';try{await access(ca);env.NODE_EXTRA_CA_CERTS??=ca;}catch{/* Retain the machine's ordinary trust configuration. */}
      await start(process.env.DSH_BIN??'dsh',['web','--no-open','--host','127.0.0.1','--port','3080'],'dsh',env);
    }
    for(let i=0;i<100&&!await live(join(state,'dsh-browser.json'));i++)await delay(200);
    if(!await live(join(state,'dsh-browser.json')))throw Error('DSH 尚未加载一键协作插件，请重启已安装该插件的 DSH。');
  }
}
const watch=process.argv.includes('--watch');
do{
  try{await ensure();if(!watch)process.stdout.write('Logseq 与 DSH 本机协作服务已就绪。\n');}
  catch(error){process.stderr.write(`${error.message}\n`);if(!watch){process.exitCode=1;break;}}
  if(!watch)break;
  await delay(30000);
}while(watch);
