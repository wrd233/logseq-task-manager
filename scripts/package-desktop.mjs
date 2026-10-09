// Real ZIP installation in a fresh owned macOS profile outside every checkout.
// Host isolation changes paths/update/external links only, never SDK/IPC/FileIO.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,copyFileSync,realpathSync} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),base=join(homedir(),'Library/Caches/task-copilot-package-acceptance'),command=process.argv[2],name=process.argv[3];
if(process.platform!=='darwin'||!name||!/^[a-z][a-z0-9-]{3,70}$/u.test(name))throw Error('macOS and an explicit owned instance name required');
const root=join(base,name),paths={root,app:join(root,'Logseq Package Acceptance.app'),home:join(root,'home'),profile:join(root,'profile'),graph:join(root,'graph'),evidence:join(root,'evidence'),channel:join(root,'channel'),work:join(root,'work'),workTwo:join(root,'work-two')},plugin=join(root,'installation/task-copilot-workbench'),manifestPath=join(root,'manifest.json'),port=19349;
const sha=value=>createHash('sha256').update(value).digest('hex'),run=(executable,args)=>{const result=spawnSync(executable,args,{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||String(result.error));return result.stdout;};
const owned=()=>{const m=JSON.parse(readFileSync(manifestPath,'utf8'));if(m.root!==root||m.plugin!==plugin||m.port!==port||!m.ownerToken||Object.entries(paths).some(([key,value])=>m[key]!==value)||realpathSync(root)!==root)throw Error('Owned package instance identity changed');return m;};
const record=kind=>{
  const path=join(root,kind+'.json');if(!existsSync(path))return null;const v=JSON.parse(readFileSync(path,'utf8'));if(!Number.isSafeInteger(v.pid)||v.pid<1)throw Error('Invalid owned PID');
  const actual=spawnSync('/bin/ps',['-ww','-p',String(v.pid),'-o','command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8',LANG:'en_US.UTF-8'}}).stdout.trim();return {...v,running:!!actual,owned:!!actual&&actual===v.command.join(' ')};
};
const verifyFiles=()=>{
  const identity=JSON.parse(readFileSync(join(plugin,'build-identity.json'),'utf8'));
  if(identity.schemaVersion!==1||identity.builtFromDirtyTree||!/^[a-f0-9]{40}$/u.test(identity.commit))throw Error('A clean identified installation package required');
  const hashes={};for(const [name,hash]of Object.entries(identity.files)){
    const path=resolve(plugin,name),rel=relative(plugin,path);if(!name.startsWith('dist/')||rel.startsWith('..')||isAbsolute(rel)||realpathSync(path)!==path)throw Error('Unsafe installed resource identity');
    hashes[name]=sha(readFileSync(path));if(hashes[name]!==hash)throw Error('Installed bytes differ from ZIP identity: '+name);
  }
  for(const name of ['dist/index.html','dist/index.js','dist/workspace.mjs'])if(!hashes[name])throw Error('Missing packaged entry point');return {commit:identity.commit,files:hashes};
};
const start=(kind,executable,args)=>{
  const previous=record(kind);if(previous?.running){if(!previous.owned)throw Error('Recorded PID belongs to another process');return previous.pid;}
  const fd=openSync(join(paths.evidence,kind+'.log'),'a',0o600),env={...process.env};delete env.NODE_PATH;
  const child=spawn(executable,args,{cwd:root,env,detached:true,stdio:['ignore',fd,fd]});closeSync(fd);child.unref();writeFileSync(join(root,kind+'.json'),JSON.stringify({pid:child.pid,command:[executable,...args],cwd:root}),{mode:0o600});return child.pid;
};
if(command==='prepare'){
  if(existsSync(root))throw Error('Preparation never overwrites an existing instance');
  const zip=resolve(process.argv[4]??''),source=resolve(process.argv[5]??'/Applications/Logseq.app');
  if(!process.argv[4]||!existsSync(zip)||!existsSync(join(source,'Contents/Resources/app/electron.js')))throw Error('Actual ZIP and unpacked official Logseq host required');
  mkdirSync(root,{recursive:true,mode:0o700});if(realpathSync(root)!==root)throw Error('Acceptance root may not follow a symlink');
  const git=spawnSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'});if(git.status===0)throw Error('Installation instance must be outside a Git checkout');
  for(const path of Object.values(paths).filter(path=>path!==paths.app&&path!==root))mkdirSync(path,{recursive:true,mode:0o700});
  copyFileSync(zip,join(root,'installation.zip'));mkdirSync(join(root,'installation'),{mode:0o700});
  run('python3',['-c',`import pathlib,stat,sys,zipfile\nroot=pathlib.Path(sys.argv[2]).resolve()\nwith zipfile.ZipFile(sys.argv[1]) as z:\n names=set()\n for i in z.infolist():\n  p=pathlib.PurePosixPath(i.filename);kind=(i.external_attr>>16)&0o170000\n  if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0]!='task-copilot-workbench' or i.filename in names or kind==stat.S_IFLNK: raise RuntimeError('Unsafe ZIP member')\n  names.add(i.filename)\n  if i.file_size>256*1024*1024: raise RuntimeError('ZIP member too large')\n if sum(i.file_size for i in z.infolist())>1024*1024*1024: raise RuntimeError('ZIP too large')\n z.extractall(root)\n for i in z.infolist():\n  if not i.is_dir(): (root/i.filename).chmod(0o755 if (i.external_attr>>16)&0o111 else 0o644)\n`,join(root,'installation.zip'),join(root,'installation')]);
  const identity=verifyFiles();
  for(const directory of ['.logseq/settings','Library/Application Support','Documents','Downloads','Desktop'])mkdirSync(join(paths.home,directory),{recursive:true,mode:0o700});
  for(const directory of ['pages','journals','logseq'])mkdirSync(join(paths.graph,directory),{recursive:true});
  writeFileSync(join(paths.graph,'logseq/config.edn'),'{:git-auto-push false :git-auto-commit false :ui/show-brackets? true}\n',{flag:'wx'});
  run(process.execPath,[join(repo,'scripts/create-reading-agent-corpus.mjs'),join(root,'corpus')]);
  copyFileSync(join(root,'corpus/合成阅读与协作.md'),join(paths.graph,'pages/合成阅读与协作.md'));
  for(const directory of [paths.work,paths.workTwo])writeFileSync(join(directory,'WORKSPACE.md'),'# 用户保留入口\n合成验收：这个已有文件不能被插件生成入口覆盖。\n',{flag:'wx'});
  writeFileSync(join(paths.home,'.logseq/preferences.json'),JSON.stringify({theme:null,themes:{},externals:[plugin],pinnedToolbarItems:['task-copilot-toolbar']}),{mode:0o600,flag:'wx'});
  writeFileSync(join(paths.home,'.logseq/settings/task-copilot-vnext.json'),JSON.stringify({disabled:false,tasksEnabled:false,materialsEnabled:true,workViewEnabled:true,materialsAutoCapture:false,agentWorkspaceDescriptor:join(paths.channel,'workspace-plugin.json')}),{mode:0o600,flag:'wx'});
  writeFileSync(join(paths.profile,'configs.edn'),'{:developer-mode true :feature/enable-plugin-system? true}\n',{flag:'wx'});
  run('/bin/cp',['-cR',source,paths.app]);
  const resources=join(paths.app,'Contents/Resources/app'),pkg=JSON.parse(readFileSync(join(resources,'package.json'),'utf8')),original=pkg.main;
  pkg.main='package-isolation.cjs';pkg.productName='Logseq Package Acceptance';writeFileSync(join(resources,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  writeFileSync(join(resources,pkg.main),`const fs=require('node:fs'),os=require('node:os'),electron=require('electron');
const paths=${JSON.stringify(paths)};
os.homedir=()=>paths.home;
electron.app.setName('Logseq Package Acceptance');
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
  run('/usr/libexec/PlistBuddy',['-c','Set :CFBundleIdentifier com.taskcopilot.logseq.package-acceptance',join(paths.app,'Contents/Info.plist')]);
  run('/usr/bin/codesign',['--force','--deep','--sign','-','--entitlements',join(resources,'entitlements.plist'),paths.app]);
  writeFileSync(manifestPath,JSON.stringify({...paths,plugin,port,ownerToken:randomUUID(),logseqVersion:pkg.version,sourceApp:source,prepared:new Date().toISOString(),zipHash:sha(readFileSync(join(root,'installation.zip'))),identity,stage:'package-preflight',capabilityInjection:false},null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({prepared:true,root,plugin,zipHash:sha(readFileSync(zip)),commit:identity.commit,files:Object.keys(identity.files).length,outsideRepository:true,capabilityInjection:false}));
}else if(command==='start'){
  const m=owned(),identity=verifyFiles();if(identity.commit!==m.identity.commit||sha(readFileSync(join(root,'installation.zip')))!==m.zipHash)throw Error('Installed package identity changed');
  if(!process.versions.node.startsWith('20.'))throw Error('Node 20 required');
  const descriptor=join(paths.channel,'workspace-plugin.json'),previous=record('companion'),old=existsSync(descriptor)?readFileSync(descriptor,'utf8'):null;
  const companion=start('companion',process.execPath,[join(plugin,'dist/workspace.mjs'),'workspace','serve','--state-dir',paths.channel]);
  const ready=()=>existsSync(descriptor)&&(previous?.running&&previous.owned||readFileSync(descriptor,'utf8')!==old)&&record('companion')?.owned;
  for(let i=0;i<40&&!ready();i++)await delay(250);if(!ready())throw Error('Actual package companion descriptor not ready; inspect existing process');
  if(!record('desktop')?.running){const server=createServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});await new Promise(yes=>server.close(yes));}
  const desktop=start('desktop',join(paths.app,'Contents/MacOS/Logseq'),[`--user-data-dir=${paths.profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1']);
  console.log(JSON.stringify({companion,desktop,root,plugin,port,commit:identity.commit,zipHash:m.zipHash,outsideRepository:true,capabilityInjection:false}));
}else if(command==='stop'){
  owned();for(const kind of ['desktop','companion']){const r=record(kind);if(r?.running){if(!r.owned)throw Error('Refusing unrelated PID');process.kill(r.pid,'SIGTERM');}}console.log('Stopped only identity-checked package acceptance processes.');
}else if(command==='status'){const m=owned();console.log(JSON.stringify({desktop:record('desktop'),companion:record('companion'),root,plugin,port,commit:m.identity.commit,zipHash:m.zipHash}));}
else throw Error('Usage: prepare NAME ZIP [Logseq.app] | start NAME | status NAME | stop NAME');
