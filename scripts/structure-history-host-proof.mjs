// Read-only proof for the owned Logseq sandbox. Requires an already authorized stage scope.
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const repo=resolve(import.meta.dirname,'..');
const targets=await globalThis.fetch('http://127.0.0.1:19333/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&decodeURIComponent(t.url).startsWith(`file://${repo}/tmp/logseq-sandbox/Logseq Task Copilot Lab.app/`));
assert.ok(target,'Owned sandbox required');
const ws=new globalThis.WebSocket(target.webSocketDebuggerUrl);await new Promise((yes,no)=>{ws.onopen=yes;ws.onerror=no;});
let sequence=0;const pending=new Map(),contexts=[];
ws.onmessage=e=>{const data=JSON.parse(e.data);if(data.method==='Runtime.executionContextCreated')contexts.push(data.params.context);if(data.id){const p=pending.get(data.id);pending.delete(data.id);if(data.error)p.reject(Error(JSON.stringify(data.error)));else p.resolve(data.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=globalThis.setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);pending.set(id,{resolve:v=>{globalThis.clearTimeout(timer);resolve(v);},reject:e=>{globalThis.clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
try{
 await call('Runtime.enable');let contextId;
 for(const context of contexts.filter(c=>c.auxData?.isDefault)){const r=await call('Runtime.evaluate',{contextId:context.id,expression:'location.href',returnByValue:true});if(decodeURIComponent(r.result?.value??'').startsWith(`file://${repo}/apps/logseq-plugin/dist/`))contextId=context.id;}
 assert.ok(contextId,'Plugin context required');
 const expression=`(async()=>{
  const api=window.taskCopilotWorkbench,graph=await logseq.App.getCurrentGraph();if(graph?.path!==${JSON.stringify(repo+'/tmp/logseq-sandbox/graph')})throw Error('Owned graph required');
  const history=await api.stages.history(),before=JSON.stringify(history);
  const root=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='工作结构历史 · 只读回放');if(!root)throw Error('History UI absent');
  for(let p=root;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
  const points=history.stages.flatMap(s=>[s.start,...s.revisions]).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
  const frames=[];
  for(let index=0;index<points.length;index++){
   const input=root.querySelector('input');input.value=String(index);input.dispatchEvent(new Event('input'));
   const nodes=[...root.querySelectorAll('[data-history-node]')],details=[];
   for(const n of nodes){n.click();details.push(root.querySelector('.wb-history-details').innerText);}
   frames.push({index,id:points[index].id,nodes:nodes.map(n=>({id:n.dataset.historyNode,text:n.textContent,left:n.style.left,top:n.style.top,deleted:n.dataset.deleted})),details});
  }
  [...root.querySelectorAll('button')].find(b=>b.textContent==='切换目录 / 差异')?.click();const directory=!!root.querySelector('.wb-history-directory');root.querySelector('[data-history-node]')?.click();
  const unchanged=before===JSON.stringify(await api.stages.history());
  [...root.querySelectorAll('button')].find(b=>b.textContent==='切换结构图')?.click();root.querySelector('.wb-history-map')?.scrollIntoView({block:'center'});
  const raw={};for(const key of await logseq.FileStorage.allKeys())if(key.startsWith('stage-workbench-v1-'))raw[key]=await logseq.FileStorage.getItem(key);
  return {frames,directory,unchanged,history,raw};
 })()`;
 const r=await call('Runtime.evaluate',{contextId,expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));
 const result=r.result.value;assert.ok(result.directory);assert.ok(result.unchanged);assert.ok(result.frames.length>=3);assert.ok(JSON.stringify(result.frames).includes('移动归属'));assert.ok(JSON.stringify(result.frames).includes('删除'));
 const folder=resolve(repo,'docs/implementation/assets/structure-history');
 await writeFile(resolve(folder,'host-result.json'),JSON.stringify(result,null,2)+'\n');
 process.stdout.write(JSON.stringify({frames:result.frames.length,directory:result.directory,unchanged:result.unchanged})+'\n');
}finally{ws.close();}
