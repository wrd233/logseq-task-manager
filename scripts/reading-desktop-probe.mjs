// Read-only runtime evidence. UI actions use the real app; no SDK/IPC methods
// are replaced and this probe cannot execute caller-supplied expressions.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),defaultRoot=join(repo,'tmp/reading-desktop'),root=resolve(process.argv[3]??defaultRoot);
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const bootstrap=process.argv[4]==='bootstrap';
const packageRoot=join(homedir(),'Library/Caches/task-copilot-package-acceptance');
if(root!==defaultRoot&&(!root.startsWith(packageRoot+'/')||root.slice(packageRoot.length+1).includes('/')||!manifest.ownerToken||manifest.plugin!==join(root,'installation/task-copilot-workbench')))throw Error('Owned package instance required');
if(manifest.root!==root||manifest.graph!==join(root,'graph')||!manifest.app.startsWith(root+'/'))throw Error('Owned acceptance paths required');
const targets=await globalThis.fetch(`http://127.0.0.1:${manifest.port}/json/list`).then(response=>response.json());
const target=targets.find(target=>target.type==='page'&&decodeURIComponent(target.url).startsWith('file://'+manifest.app+'/'));
if(!target)throw Error('Owned Desktop target unavailable');
const socket=new globalThis.WebSocket(target.webSocketDebuggerUrl);await new Promise((yes,no)=>{socket.onopen=yes;socket.onerror=no;});
let sequence=0;const waiting=new Map(),contexts=[],errors=[],consoleErrors=[];
socket.onmessage=event=>{
  const value=JSON.parse(event.data);
  if(value.method==='Runtime.executionContextCreated')contexts.push(value.params.context);
  if(value.method==='Runtime.exceptionThrown')errors.push(value.params.exceptionDetails);
  if(value.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(value.params.type))consoleErrors.push({contextId:value.params.executionContextId,type:value.params.type,args:value.params.args.map(arg=>arg.value??arg.description)});
  if(value.id){const request=waiting.get(value.id);waiting.delete(value.id);if(value.error)request?.no(Error(JSON.stringify(value.error)));else request?.yes(value.result);}
};
const call=(method,params={})=>new Promise((yes,no)=>{const id=++sequence;waiting.set(id,{yes,no});socket.send(JSON.stringify({id,method,params}));});
await call('Runtime.enable');const values=[];
for(const context of contexts) {
  if(!context.auxData?.isDefault)continue;
  const location=await call('Runtime.evaluate',{contextId:context.id,expression:'location.href',returnByValue:true});
  const url=decodeURIComponent(location.result?.value??'');
  if(!url.startsWith('file://'+manifest.app+'/')&&!url.startsWith('file://'+manifest.plugin+'/dist/'))continue;
  const expression=url.startsWith('file://'+manifest.plugin+'/dist/')?`(async()=>{
    const api=window.taskCopilotWorkbench,graph=await logseq.App.getCurrentGraph();
    if(graph?.path!==${JSON.stringify(manifest.graph)}){
      if(${bootstrap}&&graph==null)return {graph:null,pluginConnected:logseq.connected,apiPresent:!!api,bootstrapOnly:true,currentGraphAbsent:true,rawText:document.body.innerText};
      throw Error('Owned Graph identity required');
    }
    const block=await logseq.Editor.getBlock('b7261007-0000-4000-8000-000000000001',{includeChildren:true});
    const collapsed=new Map();(function visit(value){if(value?.uuid)collapsed.set(value.uuid,value['collapsed?']??null);for(const child of value?.children??[])visit(child);})(block);
    const host=window.top.document,inputs=[...host.querySelectorAll('#main-content-container textarea')];
    return {graph,pluginConnected:logseq.connected,sdkKeys:Object.keys(logseq),sdkConnection:{id:logseq.baseInfo?.id,callerStatus:logseq._caller?._status,callerConnected:logseq._caller?._connected},apiPresent:!!api,settings:{tasksEnabled:logseq.settings?.tasksEnabled,agentWorkspaceDescriptor:logseq.settings?.agentWorkspaceDescriptor},
      work:api?.read(),report:api?.report?.read(),reading:api?.reading?.read(),connection:api?.agentWorkspace?.status(),source:block,editing:await logseq.Editor.checkEditing(),
      materialRecords:await api?.materials?.list({sourceUuid:'b7261007-0000-4000-8000-000000000001',query:''}),
      collaborationUI:(()=>{const panel=document.querySelector('[data-collaboration="true"]');return panel?{visible:!panel.hidden,text:panel.innerText,inputs:[...panel.querySelectorAll('textarea')].map(input=>({value:input.value,readOnly:input.readOnly}))}:null;})(),
      ordinaryTodoUI:(()=>{const panel=document.querySelector('[data-ordinary-todo="true"]');return panel?{visible:!panel.hidden,text:panel.innerText,choices:[...panel.querySelectorAll('input[type=checkbox]')].map(input=>({label:input.parentElement?.textContent,checked:input.checked}))}:null;})(),
      readingStyle:(()=>{const node=document.querySelector('.wb-report-row[data-report-root]>.wb-body>p:first-child');if(!node)return null;const style=window.getComputedStyle(node);return {fontSize:style.fontSize,fontWeight:style.fontWeight};})(),
      primary:[...document.querySelectorAll('.wb-row[data-report-source-id]')].map(node=>({uuid:node.dataset.uuid,sourceId:node.dataset.reportSourceId,version:node.dataset.reportContentVersion,text:node.querySelector('.wb-body')?.textContent,hidden:node.hidden})),
      structureRows:[...document.querySelectorAll('.wb-row[data-uuid]:not([data-report-source-id])')].map(node=>({uuid:node.dataset.uuid,text:node.querySelector('.wb-body')?.textContent,hidden:node.hidden})),
      materialDirectory:(()=>{const rows=document.querySelector('[data-material-directory-rows]');return rows?{complete:rows.dataset.directoryComplete,entries:[...rows.children].map(node=>({text:node.innerText,current:node.dataset.directoryCurrent,path:node.dataset.directoryPath,buttons:[...node.querySelectorAll('button')].map(b=>({name:b.textContent,path:b.title,id:b.dataset.materialId??null}))})),breadcrumbs:document.querySelector('.wb-material-breadcrumb')?.innerText,roots:[...document.querySelectorAll('select[aria-label="当前材料根目录"] option')].map(v=>({value:v.value,text:v.textContent})),notices:[...document.querySelectorAll('.wb-preview-notice')].map(v=>v.textContent)}:null;})(),
      previews:[...document.querySelectorAll('.wb-material-preview')].map(node=>({target:node.dataset.previewTarget,version:node.dataset.previewVersion,format:node.dataset.previewFormat,complete:node.dataset.previewComplete,text:node.innerText,images:[...node.querySelectorAll('img')].map(i=>({source:i.src,width:i.naturalWidth,height:i.naturalHeight,complete:i.complete})),canvases:[...node.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),tables:[...node.querySelectorAll('table')].map(t=>({rows:t.rows.length,text:t.innerText}))})),
      headings:[...document.querySelectorAll('.wb-reading-heading')].map(node=>({key:node.dataset.readingHeading,text:node.textContent,uuid:node.dataset.uuid??null})),
      native:[...host.querySelectorAll('#main-content-container .ls-block[blockid]')].filter(node=>!node.closest('.block-content,.block-editor')).map(node=>({uuid:node.getAttribute('blockid'),collapsed:collapsed.get(node.getAttribute('blockid'))??null,marked:[...node.querySelectorAll('[data-task-copilot-source-set]')].some(body=>body.closest('.ls-block')===node)})),
      inputs:inputs.map(node=>({uuid:node.closest('.ls-block')?.getAttribute('blockid'),value:node.value,start:node.selectionStart,end:node.selectionEnd,focused:host.activeElement===node})),selection:document.getSelection()?.toString(),
      rawText:document.body.innerText};})()`:
    `({url:location.href,pluginFrames:[...document.querySelectorAll('iframe')].map(node=>node.src),nativeBlocks:document.querySelectorAll('#main-content-container .ls-block[blockid]').length,rawText:document.body.innerText})`;
  const value=await call('Runtime.evaluate',{contextId:context.id,expression,returnByValue:true,awaitPromise:true});
  values.push({contextId:context.id,url,value:value.result?.value??null,exception:value.exceptionDetails??null});
}
const nativeInputNodes=[];
if(values.some(v=>v.value?.pluginConnected)){
  const tree=await call('DOM.getDocument',{depth:0});
  const ids=await call('DOM.querySelectorAll',{nodeId:tree.root.nodeId,selector:'#main-content-container textarea'});
  for(const nodeId of ids.nodeIds){const result=await call('DOM.describeNode',{nodeId});nativeInputNodes.push({backendNodeId:result.node.backendNodeId,attributes:result.node.attributes});}
}
socket.close();const destination=resolve(process.argv[2]??join(root,'evidence/runtime.json'));
if(!destination.startsWith(root+'/evidence/'))throw Error('Evidence must stay in this owned directory');
await writeFile(destination,JSON.stringify({observedAt:new Date().toISOString(),manifest,values,nativeInputNodes,errors,consoleErrors},null,2)+'\n');
console.log(JSON.stringify({destination,contexts:values.map(value=>({url:value.url,exception:value.exception?.text??null,plugin:!!value.value?.pluginConnected,blocks:value.value?.primary?.length??value.value?.nativeBlocks??0})),errors:errors.length}));
