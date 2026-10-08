// Actual Kernel in the already owned synthetic Desktop environment. Configures
// only the normal descriptor setting; no SDK, IPC or host capabilities injected.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(repo,'tmp/reading-desktop'),m=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8')),state=join(root,'kernel'),recordPath=join(root,'kernel-process.json'),main=join(repo,'apps/kernel-service/src/main.ts'),command=process.argv[2]??'status';
if(m.root!==root||m.home!==join(root,'home')||m.graph!==join(root,'graph')||m.plugin!==join(repo,'apps/logseq-plugin'))throw Error('Owned acceptance identity required');
const record=path=>{
  if(!existsSync(path))return null;const value=JSON.parse(readFileSync(path,'utf8'));if(!Number.isSafeInteger(value.pid)||value.pid<1)throw Error('Invalid owned PID');
  const actual=spawnSync('/bin/ps',['-ww','-p',String(value.pid),'-o','command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8',LANG:'en_US.UTF-8'}}).stdout.trim();return {...value,running:!!actual,owned:!!actual&&actual===value.command.join(' ')};
};
if(command==='start'){
  if(!process.versions.node.startsWith('20.'))throw Error('Node 20 required');const old=record(recordPath);if(old?.running){if(!old.owned)throw Error('Kernel PID belongs to another process');console.log(JSON.stringify({running:true,pid:old.pid}));process.exit(0);}
  mkdirSync(state,{recursive:true,mode:0o700});const env={...process.env,TASK_COPILOT_STATE_DIR:state,TASK_COPILOT_PROFILE:'sandbox',DEEPSEEK_EXECUTOR_ENABLED:'false'};for(const key of Object.keys(env))if(key.startsWith('DEEPSEEK_')&&key!=='DEEPSEEK_EXECUTOR_ENABLED')delete env[key];
  const args=['--import','tsx',main],fd=openSync(join(m.evidence,'kernel.log'),'a',0o600),child=spawn(process.execPath,args,{cwd:repo,env,detached:true,stdio:['ignore',fd,fd]});closeSync(fd);child.unref();writeFileSync(recordPath,JSON.stringify({pid:child.pid,command:[process.execPath,...args],state,startedAt:new Date().toISOString()}),{mode:0o600});
  const ready=()=>existsSync(join(state,'graph-adapter.json'))&&JSON.parse(readFileSync(join(state,'graph-adapter.json'),'utf8')).pid===child.pid&&record(recordPath)?.owned;
  for(let i=0;i<40&&!ready();i++)await delay(250);if(!ready())throw Error('Actual owned Kernel did not become ready; inspect its existing process/log');console.log(JSON.stringify({pid:child.pid,state,remoteProvider:false,capabilityInjection:false}));
}else if(command==='configure'||command==='configure-reconnect'){
  const desktop=record(join(root,'desktop.json'));if(desktop?.running)throw Error('Stop the owned Desktop before configuring normal plugin settings');
  const kernel=record(recordPath);if(!kernel?.running||!kernel.owned)throw Error('Actual live owned Kernel required');
  const descriptor=readFileSync(join(state,'graph-adapter.json'),'utf8');if(JSON.parse(descriptor).pid!==kernel.pid)throw Error('Actual Kernel descriptor identity required');
  const path=join(m.home,'.logseq/settings/task-copilot-vnext.json'),original=readFileSync(path,'utf8'),backup=join(state,'settings-before-kernel.json');if(!existsSync(backup))writeFileSync(backup,original,{flag:'wx',mode:0o600});
  const cache=join(m.home,'.logseq/storages/task-copilot-vnext/task-copilot-vnext-kernel-descriptor');if(existsSync(cache)&&command!=='configure-reconnect')throw Error('Existing private Kernel descriptor requires explicit reconnect through the normal UI');
  writeFileSync(path,JSON.stringify({...JSON.parse(original),tasksEnabled:true,kernelDescriptorJson:descriptor}),{mode:0o600});console.log(JSON.stringify({normalDescriptorSetting:true,tasksEnabled:true,ownedGraph:m.graph,uiReconnectRequired:existsSync(cache),privateCacheChanged:false,remoteProvider:false,capabilityInjection:false}));
}else if(command==='stop'){
  const kernel=record(recordPath);if(kernel?.running){if(!kernel.owned)throw Error('Refusing unrelated PID');process.kill(kernel.pid,'SIGTERM');}console.log('Stopped only the identity-checked acceptance Kernel.');
}else if(command==='status')console.log(JSON.stringify({kernel:record(recordPath),state}));else throw Error('Usage: start | configure | configure-reconnect | status | stop');
