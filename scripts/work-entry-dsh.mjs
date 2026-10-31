// Owned real DSH host. Independent HOME/DSH_HOME and stock web presets.
// Network stays blocked unless --allow-official-model is explicitly requested.
import {mkdir,writeFile,symlink,readFile,open} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(repo,'tmp/work-entry-desktop');
const globalRoot=process.env.DSH_PACKAGE_ROOT??'/opt/homebrew/lib/node_modules/@deepseek-ai/dsh';
const record=join(root,'dsh-process.json');
const command=process.argv.find((arg,i)=>i>1&&!arg.startsWith('--'))??'start';
let previous;
if(existsSync(record)) {
  previous=JSON.parse(await readFile(record,'utf8'));
  try {
    process.kill(previous.pid,0);
    const actual=execFileSync('/bin/ps',['-ww','-p',String(previous.pid),'-o','command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8',LANG:'en_US.UTF-8'}}).trim();
    if(actual!==previous.command.join(' '))throw Error('Recorded DSH PID is not owned');
  } catch(error) {if(error.code==='ESRCH')previous=null;else throw error;}
}
if(command==='status'){console.log(JSON.stringify({running:!!previous,pid:previous?.pid,owned:!!previous,port:3087}));process.exit(0);}
if(command==='stop'){
  if(previous){process.kill(previous.pid,'SIGTERM');for(let n=0;n<40;n++){try{process.kill(previous.pid,0);}catch(error){if(error.code==='ESRCH'){previous=null;break;}throw error;}await delay(100);}}
  if(previous)throw Error('Owned DSH host has not stopped yet');
  console.log(JSON.stringify({stopped:true,owned:true}));process.exit(0);
}
if(command!=='start')throw Error('Usage: start [--allow-official-model] | status | stop');
if(previous)throw Error('Owned DSH host is already running; reuse it or stop it explicitly');
const portCheck=createServer();await new Promise((yes,no)=>{portCheck.once('error',no);portCheck.listen(3087,'127.0.0.1',yes);});await new Promise(yes=>portCheck.close(yes));
const dshHome=join(root,'dsh'),profile=join(dshHome,'profiles/work-entry'),modules=join(profile,'node_modules');
for(const directory of [profile,modules,join(modules,'@deepseek-ai'),join(modules,'@task-copilot'),join(root,'evidence'),join(root,'general')])await mkdir(directory,{recursive:true,mode:0o700});
for(const name of ['dsh-base','dsh-web-app']) {
  const target=join(modules,'@deepseek-ai',name);
  if(!existsSync(target))await symlink(join(globalRoot,'node_modules/@deepseek-ai',name),target);
}
const plugin=join(modules,'@task-copilot/dsh-logseq-workbench');
if(!existsSync(plugin))await symlink(join(repo,'apps/dsh-plugin'),plugin);
await writeFile(join(profile,'package.json'),JSON.stringify({name:'dsh-profile-work-entry',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@task-copilot/dsh-logseq-workbench']}}},null,2));
const patch=join(profile,'cordis.patch.yml');
await writeFile(patch,`- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(join(root,'home/Documents'))}\n- id: logseq-workbench\n  config:\n    browserUrl: http://127.0.0.1:3087/\n    workspaceStateDirectory: ${JSON.stringify(join(root,'channel'))}\n    bindingStateDirectory: ${JSON.stringify(join(root,'bindings'))}\n    generalDirectory: ${JSON.stringify(join(root,'general'))}\n`);
const allowOfficial=process.argv.includes('--allow-official-model');
const audit=join(root,'model-audit.mjs');
await writeFile(audit,`import {appendFileSync} from 'node:fs';
const log=value=>appendFileSync(${JSON.stringify(join(root,'evidence/model-network.jsonl'))},JSON.stringify({time:new Date().toISOString(),...value})+'\\n');
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  if(['127.0.0.1','localhost','[::1]'].includes(url.hostname))return original(input,init);
  const allowed=${JSON.stringify(allowOfficial)}&&url.protocol==='https:'&&url.hostname==='api.deepseek.com'&&(!url.port||url.port==='443');
  log({phase:'attempt',host:url.hostname,path:url.pathname,allowed});
  if(!allowed)throw Error('External transport disabled in isolated acceptance host');
  try {const response=await original(input,{...init,redirect:'error'});log({phase:'response',host:url.hostname,path:url.pathname,status:response.status});return response;}
  catch(error){log({phase:'error',host:url.hostname,path:url.pathname,code:error.code,causeCode:error.cause?.code});throw error;}
};
`);
const env={...process.env,HOME:join(root,'home'),DSH_HOME:dshHome};
for(const key of Object.keys(env))if(/KEY|TOKEN|SECRET|PASSWORD|DEEPSEEK|OPENAI|ANTHROPIC/.test(key)&&key!=='DSH_HOME')delete env[key];
// Deliberately invalid local fixture value: exposes the stock model catalog for manual failure-path conversations.
env.DEEPSEEK_API_KEY='isolated-acceptance-no-real-key';
delete env.NODE_TLS_REJECT_UNAUTHORIZED;
const args=['--import',audit,join(globalRoot,'lib/bin.js'),'--profile','work-entry','--host','127.0.0.1','--port','3087','--no-open'];
const log=await open(join(root,'evidence/dsh.log'),'a',0o600);
const child=spawn('/opt/homebrew/opt/node@24/bin/node',args,{cwd:root,env,detached:true,stdio:['ignore',log.fd,log.fd]});
await log.close();child.unref();await writeFile(record,JSON.stringify({pid:child.pid,command:['/opt/homebrew/opt/node@24/bin/node',...args]},null,2),{mode:0o600});
console.log(JSON.stringify({pid:child.pid,port:3087,isolated:true,officialModelNetwork:allowOfficial}));
