// Isolated macOS acceptance instance. The copied host changes only home/profile,
// update and external-link safety. It adds no IPC, file or plugin capability.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,copyFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(repo,'tmp/reading-desktop');
const paths={root,app:join(root,'Logseq Reading Acceptance.app'),home:join(root,'home'),profile:join(root,'profile'),graph:join(root,'graph'),evidence:join(root,'evidence'),channel:join(root,'channel'),work:join(root,'work')};
const manifestPath=join(root,'manifest.json'),plugin=join(repo,'apps/logseq-plugin'),port=19347;
const run=(command,args)=>{const value=spawnSync(command,args,{encoding:'utf8'});if(value.status!==0)throw Error(value.stderr||String(value.error));return value.stdout;};
const record=kind=>{
  const path=join(root,`${kind}.json`);if(!existsSync(path))return null;
  const value=JSON.parse(readFileSync(path,'utf8'));if(!Number.isSafeInteger(value.pid)||value.pid<1)throw Error('Invalid owned PID');
  const command=spawnSync('/bin/ps',['-ww','-p',String(value.pid),'-o','command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8',LANG:'en_US.UTF-8'}}).stdout.trim();
  return {...value,running:!!command,owned:command===value.command.join(' ')};
};
const start=(kind,executable,args)=>{
  const previous=record(kind);if(previous?.running){if(!previous.owned)throw Error('Recorded PID belongs to another process');return previous.pid;}
  const fd=openSync(join(paths.evidence,`${kind}.log`),'a',0o600),child=spawn(executable,args,{cwd:repo,detached:true,stdio:['ignore',fd,fd]});closeSync(fd);child.unref();
  writeFileSync(join(root,`${kind}.json`),JSON.stringify({pid:child.pid,command:[executable,...args]}),{mode:0o600});return child.pid;
};
const command=process.argv[2]??'status';
if(command==='prepare') {
  if(process.platform!=='darwin')throw Error('This acceptance harness is macOS only');
  if(existsSync(paths.app)||existsSync(manifestPath))throw Error('Owned instance already exists; preparation never overwrites it');
  const source=resolve(process.argv[3]??'/Applications/Logseq.app');
  if(!existsSync(join(source,'Contents/Resources/app/electron.js')))throw Error('Unpacked Logseq application required');
  for(const path of Object.values(paths).filter(path=>path!==paths.app))mkdirSync(path,{recursive:true,mode:0o700});
  for(const directory of ['.logseq/settings','Library/Application Support','Documents','Downloads','Desktop'])mkdirSync(join(paths.home,directory),{recursive:true,mode:0o700});
  for(const directory of ['pages','journals','logseq'])mkdirSync(join(paths.graph,directory),{recursive:true});
  writeFileSync(join(paths.graph,'logseq/config.edn'),'{:git-auto-push false :git-auto-commit false :ui/show-brackets? true}\n',{flag:'wx'});
  run(process.execPath,[join(repo,'scripts/create-reading-agent-corpus.mjs'),join(root,'corpus')]);
  copyFileSync(join(root,'corpus/合成阅读与协作.md'),join(paths.graph,'pages/合成阅读与协作.md'));
  writeFileSync(join(paths.home,'.logseq/preferences.json'),JSON.stringify({theme:null,themes:{},externals:[plugin],pinnedToolbarItems:['task-copilot-toolbar']}),{mode:0o600,flag:'wx'});
  writeFileSync(join(paths.home,'.logseq/settings/task-copilot-vnext.json'),JSON.stringify({disabled:false,tasksEnabled:false,materialsEnabled:true,workViewEnabled:true,materialsAutoCapture:false,agentWorkspaceDescriptor:join(paths.channel,'workspace-plugin.json')}),{mode:0o600,flag:'wx'});
  writeFileSync(join(paths.profile,'configs.edn'),'{:developer-mode true :feature/enable-plugin-system? true}\n',{flag:'wx'});
  run('/bin/cp',['-cR',source,paths.app]);
  const resources=join(paths.app,'Contents/Resources/app'),pkg=JSON.parse(readFileSync(join(resources,'package.json'),'utf8')),original=pkg.main;
  pkg.main='reading-isolation.cjs';pkg.productName='Logseq Reading Acceptance';writeFileSync(join(resources,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  writeFileSync(join(resources,pkg.main),`const fs=require('node:fs'),os=require('node:os'),electron=require('electron');
const paths=${JSON.stringify(paths)};
os.homedir=()=>paths.home;
electron.app.setName('Logseq Reading Acceptance');
electron.app.setPath('home',paths.home);electron.app.setPath('appData',paths.home+'/Library/Application Support');electron.app.setPath('userData',paths.profile);
for(const name of ['documents','downloads','desktop'])electron.app.setPath(name,paths.home+'/'+name[0].toUpperCase()+name.slice(1));
electron.app.setAppLogsPath(paths.evidence+'/app-logs');
electron.app.setAsDefaultProtocolClient=()=>false;electron.app.removeAsDefaultProtocolClient=()=>false;
electron.shell.openExternal=async()=>{throw Error('External links disabled in the isolated acceptance instance');};
const Module=require('node:module'),load=Module._load;
Module._load=function(request,...args){return request==='update-electron-app'?()=>{}:load.call(this,request,...args);};
electron.autoUpdater.checkForUpdates=()=>{};electron.autoUpdater.setFeedURL=()=>{};
fs.writeFileSync(paths.evidence+'/isolation-runtime.json',JSON.stringify({pid:process.pid,home:electron.app.getPath('home'),osHome:os.homedir(),userData:electron.app.getPath('userData'),appData:electron.app.getPath('appData'),capabilityInjection:false},null,2),{mode:0o600});
require(${JSON.stringify('./'+original)});
`);
  run('/usr/libexec/PlistBuddy',['-c','Set :CFBundleIdentifier com.taskcopilot.logseq.reading-acceptance',join(paths.app,'Contents/Info.plist')]);
  run('/usr/bin/codesign',['--force','--deep','--sign','-','--entitlements',join(resources,'entitlements.plist'),paths.app]);
  writeFileSync(manifestPath,JSON.stringify({...paths,plugin,port,logseqVersion:pkg.version,sourceApp:source,prepared:new Date().toISOString()},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({prepared:true,...paths,logseqVersion:pkg.version,capabilityInjection:false}));
} else if(command==='start') {
  if(!existsSync(manifestPath)||!existsSync(join(plugin,'dist/workspace.mjs')))throw Error('Prepare and build the plugin first');
  if(!process.versions.node.startsWith('20.'))throw Error('Node 20 required');
  const descriptor=join(paths.channel,'workspace-plugin.json'),previous=record('companion');
  const old=existsSync(descriptor)?readFileSync(descriptor,'utf8'):null;
  const companion=start('companion',process.execPath,[join(plugin,'dist/workspace.mjs'),'workspace','serve','--state-dir',paths.channel]);
  const ready=()=>existsSync(descriptor)&&(previous?.running&&previous.owned||readFileSync(descriptor,'utf8')!==old)&&record('companion')?.owned;
  for(let attempt=0;attempt<40&&!ready();attempt++)await delay(250);
  if(!ready())throw Error('New owned companion descriptor did not arrive');
  if(!record('desktop')?.running) {
    const server=createServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});await new Promise(yes=>server.close(yes));
  }
  const desktop=start('desktop',join(paths.app,'Contents/MacOS/Logseq'),[`--user-data-dir=${paths.profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1']);
  console.log(JSON.stringify({companion,desktop,graph:paths.graph,cdp:`http://127.0.0.1:${port}`,tasksEnabled:false,capabilityInjection:false}));
} else if(command==='stop') {
  for(const kind of ['desktop','companion']){const value=record(kind);if(value?.running){if(!value.owned)throw Error(`Refusing unrelated PID ${value.pid}`);process.kill(value.pid,'SIGTERM');}}
  console.log('Stopped only identity-checked acceptance processes.');
} else if(command==='status')console.log(JSON.stringify({desktop:record('desktop'),companion:record('companion'),paths}));
else throw Error('Usage: node scripts/reading-desktop.mjs prepare [Logseq.app] | start | stop | status');
