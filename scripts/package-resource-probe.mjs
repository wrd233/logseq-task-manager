// Read-only CDP observations of this owned native app, preview windows,
// actual event-listener locations and previously observed blob resources.
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import process from 'node:process';
import console from 'node:console';
import {spawnSync} from 'node:child_process';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),phase=process.argv[2]??'before';
if(!m.ownerToken||!['before','before-graph','before-unload','before-unload-pdf','after-work','after-graph','after-unload','after-unload-pdf'].includes(phase))throw Error('Owned package lifecycle observation required');
const graphTwo=join(root,'graph-two'),graphs=[m.graph];try{if(await realpath(graphTwo)===graphTwo)graphs.push(graphTwo);}catch{ /* Not prepared yet. */ }
const baseline=phase==='after-work'?'before':phase==='after-graph'?'before-graph':phase==='after-unload-pdf'?'before-unload-pdf':'before-unload';
const previous=phase.startsWith('before')?null:JSON.parse(await readFile(join(m.evidence,'resources-'+baseline+'-runtime.json')));
if(previous&&(previous.commit!==m.identity.commit||previous.zipHash!==m.zipHash))throw Error('Mixed package resource observations');
const targets=await globalThis.fetch('http://127.0.0.1:'+m.port+'/json/list').then(r=>r.json()),host=targets.find(t=>t.type==='page'&&decodeURIComponent(t.url).startsWith('file://'+m.app+'/'));
if(!host)throw Error('Actual owned Desktop required');
const desktop=JSON.parse(await readFile(join(root,'desktop.json'))),actual=spawnSync('/bin/ps',['-ww','-p',String(desktop.pid),'-o','command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8'}}).stdout.trim();
if(!actual||actual!==desktop.command.join(' '))throw Error('Actual owned Desktop process identity required');
if(previous?.desktop&&(previous.desktop.pid!==desktop.pid||previous.hostTarget!==host.id))throw Error('Lifecycle observations span a Desktop restart');
const pages=[],listeners=[],knownBlobs=new Set(previous?.blobs.map(b=>b.url)??[]),blobReads=[],targetInfo=[];
for(const target of targets.filter(t=>t.id===host.id||t.type==='page'&&t.url==='about:blank')){
  const socket=new globalThis.WebSocket(target.webSocketDebuggerUrl);await new Promise((yes,no)=>{socket.onopen=yes;socket.onerror=no;});
  let seq=0;const contexts=[],scripts=new Map(),waiting=new Map();
  socket.onmessage=e=>{const v=JSON.parse(e.data);if(v.method==='Runtime.executionContextCreated')contexts.push(v.params.context);if(v.method==='Debugger.scriptParsed')scripts.set(v.params.scriptId,decodeURIComponent(v.params.url));if(v.id){const w=waiting.get(v.id);waiting.delete(v.id);if(v.error)w?.no(Error(JSON.stringify(v.error)));else w?.yes(v.result);}};
  const call=(method,params={})=>new Promise((yes,no)=>{const id=++seq;waiting.set(id,{yes,no});socket.send(JSON.stringify({id,method,params}));});
  try{
    await call('Runtime.enable');await call('Debugger.enable');
    if(target.id===host.id)targetInfo.push(...(await call('Target.getTargets')).targetInfos.map(t=>({id:t.targetId,type:t.type,url:t.url})));
    for(const context of contexts){
      if(!context.auxData?.isDefault)continue;
      const where=await call('Runtime.evaluate',{contextId:context.id,expression:'location.href',returnByValue:true}),url=decodeURIComponent(where.result?.value??'');
      const plugin=url.startsWith('file://'+m.plugin+'/dist/'),native=url.startsWith('file://'+m.app+'/'),child=target.url==='about:blank';
      if(!plugin&&!native&&!child)continue;
      const check=plugin?`const graph=await logseq.App.getCurrentGraph();if(!${JSON.stringify(graphs)}.includes(graph?.path))throw Error('Owned Graph required');`:child?`const p=window.opener;if(!p||!decodeURIComponent(p.location.href).startsWith(${JSON.stringify('file://'+m.plugin+'/dist/')}))throw Error('Owned preview opener required');const graph=await p.logseq.App.getCurrentGraph();if(!${JSON.stringify(graphs)}.includes(graph?.path))throw Error('Owned Graph required');`:'const graph=null;';
      const observation=await call('Runtime.evaluate',{contextId:context.id,returnByValue:true,awaitPromise:true,expression:`(async()=>{${check}return {url:location.href,graph,title:document.title,pluginFrames:[...document.querySelectorAll('iframe')].map(f=>f.src).filter(v=>decodeURIComponent(v).startsWith(${JSON.stringify('file://'+m.plugin+'/dist/')})),previewTargets:[...document.querySelectorAll('.wb-material-preview')].map(p=>({target:p.dataset.previewTarget,version:p.dataset.previewVersion})),blobs:[...document.querySelectorAll('.wb-material-preview img')].map(i=>i.src).filter(s=>s.startsWith('blob:')),nativeMarked:document.querySelectorAll('[data-task-copilot-source-set]').length};})()`});
      if(observation.exceptionDetails)throw Error('Owned lifecycle page observation failed');const v=observation.result.value;pages.push(v);for(const b of v.blobs)knownBlobs.add(b);
      const doc=await call('Runtime.evaluate',{contextId:context.id,expression:'document'});
      const events=await call('DOMDebugger.getEventListeners',{objectId:doc.result.objectId});
      const all=events.listeners.map(l=>({type:l.type,capture:l.useCapture,scriptId:l.scriptId,script:scripts.get(l.scriptId)??null}));
      listeners.push({url,surface:plugin?'plugin-document':child?'preview-document':'native-document',all,types:all.filter(l=>l.script?.startsWith('file://'+m.plugin+'/dist/'))});
      if(plugin){
        const top=await call('Runtime.evaluate',{contextId:context.id,expression:'window.top.document'});
        const topEvents=await call('DOMDebugger.getEventListeners',{objectId:top.result.objectId});
        const topAll=topEvents.listeners.map(l=>({type:l.type,capture:l.useCapture,scriptId:l.scriptId,script:scripts.get(l.scriptId)??null}));
        listeners.push({url,surface:'host-document-from-plugin',all:topAll,types:topAll.filter(l=>l.script?.startsWith('file://'+m.plugin+'/dist/'))});
      }
      if(plugin||child||native)for(const b of knownBlobs){
        if(!b.startsWith('blob:file://'))throw Error('Only actually observed local blob URLs accepted');
        const read=await call('Runtime.evaluate',{contextId:context.id,returnByValue:true,awaitPromise:true,expression:`(async()=>{try{const r=await fetch(${JSON.stringify(b)});return {ok:r.ok,bytes:(await r.arrayBuffer()).byteLength};}catch(e){return {ok:false,error:String(e)};}})()`});
        if(read.exceptionDetails)throw Error('Blob observation failed');blobReads.push({url:b,page:url,...read.result.value});
      }
    }
  }finally{socket.close();}
}
const data={observedAt:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,desktop:{pid:desktop.pid,command:actual},hostTarget:host.id,phase,pages,listeners,targets:targetInfo,blobs:blobReads};
await writeFile(join(m.evidence,'resources-'+phase+'-runtime.json'),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({phase,previewPages:pages.filter(p=>p.previewTargets.length).length,pluginFramePages:pages.filter(p=>decodeURIComponent(p.url).startsWith('file://'+m.plugin+'/dist/')).length,workers:targetInfo.filter(t=>t.type==='worker').length,domListeners:listeners.map(l=>({surface:l.surface,total:l.all.length,ownedSource:l.types.length})),blobReads:blobReads.map(b=>({ok:b.ok,bytes:b.bytes??0}))}));
