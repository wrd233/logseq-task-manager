// Read only: actual native preview windows must have this installed plugin as
// their opener and must share the owned Graph. No caller-supplied evaluation.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json')));
if(!m.ownerToken)throw Error('Actual owned package installation required');
const destination=resolve(process.argv[2]??join(m.evidence,'preview-windows-runtime.json'));
if(!destination.startsWith(m.evidence+'/'))throw Error('Owned evidence destination required');
const targets=await globalThis.fetch(`http://127.0.0.1:${m.port}/json/list`).then(r=>r.json()),windows=[];
for(const target of targets.filter(t=>t.type==='page'&&t.url==='about:blank')) {
  const socket=new globalThis.WebSocket(target.webSocketDebuggerUrl);await new Promise((yes,no)=>{socket.onopen=yes;socket.onerror=no;});
  let sequence=0;const waiting=new Map();
  socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.id){const w=waiting.get(value.id);waiting.delete(value.id);if(value.error)w?.no(Error(JSON.stringify(value.error)));else w?.yes(value.result);}};
  const call=(method,params)=>new Promise((yes,no)=>{const id=++sequence;waiting.set(id,{yes,no});socket.send(JSON.stringify({id,method,params}));});
  try {
    const observed=await call('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(async()=>{
      const parent=window.opener;if(!parent||!decodeURIComponent(parent.location.href).startsWith(${JSON.stringify('file://'+m.plugin+'/dist/')}))throw Error('Owned installed plugin opener required');
      const graph=await parent.logseq.App.getCurrentGraph();if(graph?.path!==${JSON.stringify(m.graph)})throw Error('Owned Graph required');
      return {url:location.href,opener:decodeURIComponent(parent.location.href),graph,title:document.title,dimensions:{innerWidth,innerHeight,outerWidth,outerHeight,screenX,screenY},
        previews:[...document.querySelectorAll('.wb-material-preview')].map(node=>({target:node.dataset.previewTarget,version:node.dataset.previewVersion,format:node.dataset.previewFormat,complete:node.dataset.previewComplete,text:node.innerText,images:[...node.querySelectorAll('img')].map(i=>({width:i.naturalWidth,height:i.naturalHeight,complete:i.complete})),canvases:[...node.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),tables:[...node.querySelectorAll('table')].map(t=>({rows:t.rows.length,text:t.innerText}))}))};})()`});
    if(observed.exceptionDetails)throw Error('Native preview observation failed: '+observed.exceptionDetails.text);
    if(!observed.result?.value?.previews?.length)throw Error('Actual native preview not mounted');
    windows.push(observed.result.value);
  }finally{socket.close();}
}
if(!windows.length)throw Error('Actual independent preview window required');
await writeFile(destination,JSON.stringify({observedAt:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,windows},null,2)+'\n');
console.log(JSON.stringify({destination,windows:windows.map(w=>({title:w.title,target:w.previews[0].target,version:w.previews[0].version,format:w.previews[0].format}))}));
