// Owned test host only. Seed/record explicitly create synthetic source via the real SDK.
// Replay never substitutes an SDK/provider and compares Graph + storage before/after.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import process from 'node:process';
const repo=resolve(import.meta.dirname,'..'),root=join(repo,'tmp/structure-history-desktop');
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),mode=process.argv[2]??'status';
assert.equal(manifest.graph,join(root,'graph'));assert.equal(manifest.plugin,join(repo,'apps/logseq-plugin'));assert.equal(manifest.port,19421);
const targets=await globalThis.fetch(`http://127.0.0.1:${manifest.port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&decodeURIComponent(t.url).startsWith('file://'+manifest.app+'/'));assert.ok(target,'Owned host required');
const ws=new globalThis.WebSocket(target.webSocketDebuggerUrl);await new Promise((yes,no)=>{ws.onopen=yes;ws.onerror=no;});
let sequence=0;const pending=new Map(),contexts=[];
ws.onmessage=e=>{const data=JSON.parse(e.data);if(data.method==='Runtime.executionContextCreated')contexts.push(data.params.context);if(data.id){const p=pending.get(data.id);pending.delete(data.id);if(data.error)p.reject(Error(JSON.stringify(data.error)));else p.resolve(data.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=globalThis.setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},45000);pending.set(id,{resolve:v=>{globalThis.clearTimeout(timer);resolve(v);},reject:e=>{globalThis.clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
const files=async(dir)=>{const result={};for(const f of await readdir(dir,{withFileTypes:true})){const p=join(dir,f.name);if(f.isDirectory())Object.assign(result,await files(p));else result[p.slice(manifest.graph.length)]=createHash('sha256').update(await readFile(p)).digest('hex');}return result;};
try{
 await call('Runtime.enable');let contextId,mainContext;
 for(const context of contexts.filter(c=>c.auxData?.isDefault)){const r=await call('Runtime.evaluate',{contextId:context.id,expression:'location.href',returnByValue:true});const url=decodeURIComponent(r.result?.value??'');if(url.startsWith('file://'+manifest.plugin+'/dist/'))contextId=context.id;if(url.startsWith('file://'+manifest.app+'/'))mainContext=context.id;}
 assert.ok(contextId,'Plugin context required');
 const evaluate=async code=>{const r=await call('Runtime.evaluate',{contextId,expression:`(async()=>{${code}})()`,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 if(mode==='bootstrap'){
  assert.ok(mainContext);const expression=`(()=>{window.__MOCKED_OPEN_DIR_PATH__=${JSON.stringify(manifest.graph)};const trigger=[...document.querySelectorAll('*')].reverse().find(n=>n.textContent.trim()==='Choose a folder'&&n.getBoundingClientRect().width>0);if(!trigger)throw Error('Welcome graph chooser required');trigger.click();return {directoryPickerOnly:true};})()`;
  const start=await call('Runtime.evaluate',{contextId:mainContext,expression,returnByValue:true});assert.ok(!start.exceptionDetails,JSON.stringify(start.exceptionDetails));
  const opened=await evaluate(`for(let i=0;i<150;i++){const g=await logseq.App.getCurrentGraph();if(g?.path===${JSON.stringify(manifest.graph)})return g;await new Promise(r=>setTimeout(r,100));}throw Error('Actual graph import incomplete');`);
  await call('Runtime.evaluate',{contextId:mainContext,expression:'delete window.__MOCKED_OPEN_DIR_PATH__',returnByValue:true});process.stdout.write(JSON.stringify({opened,directoryPickerOnly:true,sdkReplaced:false})+'\n');
 }else {
 const status=await evaluate('return {graph:await logseq.App.getCurrentGraph(),scope:window.taskCopilotWorkbench.content.scope()};');
 if(mode==='status'){process.stdout.write(JSON.stringify(status,null,2)+'\n');}
 else {
  assert.equal(status.graph?.path,manifest.graph,'Open the owned test graph using Logseq UI first');
  const wait=`const wait=async test=>{for(let i=0;i<150;i++){if(await test())return;await new Promise(r=>setTimeout(r,50));}throw Error('UI condition timeout');};`;
  if(mode==='seed'){
   const ids=await evaluate(`${wait}
    const api=window.taskCopilotWorkbench,name='结构历史可信回放 · 合成验收';
    await logseq.Editor.createPage(name,{}, {redirect:false});const root=await logseq.Editor.appendBlockInPage(name,'合成验收：工作来源树');await logseq.Editor.upsertBlockProperty(root.uuid,'id',root.uuid);
    const a=await logseq.Editor.insertBlock(root.uuid,'TODO 分析原文',{sibling:false,customUUID:crypto.randomUUID()});
    const child=await logseq.Editor.insertBlock(a.uuid,'原始后代说明',{sibling:false,customUUID:crypto.randomUUID()});
    const b=await logseq.Editor.insertBlock(root.uuid,'展示回放',{sibling:false,customUUID:crypto.randomUUID()});
    await api.open(root.uuid);await logseq.App.invokeExternalPlugin('task-copilot-vnext.commands.stage-begin');
    await wait(()=>{const x=document.querySelector('[aria-label="阶段目标"]');return x&&!x.hidden;});
    document.querySelector('[aria-label="阶段目标"]').value='合成验收：真实 SDK 与 StageStore';[...document.querySelectorAll('button')].find(b=>b.textContent==='开始').click();
    await wait(()=>api.content.scope()!==null);await wait(async()=>{try{return (await api.stages.history()).stages.length>0;}catch{return false;}});
    return {root:root.uuid,a:a.uuid,b:b.uuid,child:child.uuid};`);
   await writeFile(join(root,'ids.json'),JSON.stringify(ids,null,2)+'\n');process.stdout.write(JSON.stringify(ids)+'\n');
  }else if(mode==='record'){
   const ids=JSON.parse(await readFile(join(root,'ids.json'),'utf8'));
   const result=await evaluate(`${wait}const api=window.taskCopilotWorkbench,ids=${JSON.stringify(ids)};
    const h=await api.stages.history(),stage=h.stages.find(s=>s.start.id===h.current);
    await logseq.Editor.updateBlock(ids.a,'DONE 分析历史原文\\n补充描述\\ndepends-on:: (('+ids.b+'))\\nid:: '+ids.a);
    await logseq.Editor.moveBlock(ids.a,ids.b,{children:true});const extra=await logseq.Editor.insertBlock(ids.b,'新增验收块',{sibling:false,customUUID:crypto.randomUUID()});
    const first=await api.stages.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:crypto.randomUUID(),requestIds:[]});
    await logseq.Editor.removeBlock(extra.uuid);await logseq.Editor.updateBlock(ids.child,'修订后的后代说明\\nid:: '+ids.child);
    const last=await api.stages.checkpoint({stageId:stage.start.id,expectedRevision:first.id,requestKey:crypto.randomUUID(),requestIds:[]});
    await logseq.Editor.updateBlock(ids.a,'DONE 今天的来源已变化\\nid:: '+ids.a);
    await logseq.App.invokeExternalPlugin('task-copilot-vnext.commands.stage-history');
    await wait(()=>document.querySelector('input[aria-label="工作结构历史时间轴"]'));
    await new Promise(r=>setTimeout(r,1000));return {stageId:stage.start.id,first:first.id,last:last.id,extra:extra.uuid,history:await api.stages.history()};`);
   await writeFile(join(root,'history.json'),JSON.stringify(result.history,null,2)+'\n');await writeFile(join(root,'record.json'),JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result)+'\n');
  }else if(mode==='reopen'){
   const ids=JSON.parse(await readFile(join(root,'ids.json'),'utf8'));
   const result=await evaluate(`${wait}await window.taskCopilotWorkbench.open(${JSON.stringify(ids.root)});await logseq.App.invokeExternalPlugin('task-copilot-vnext.commands.stage-history');await wait(()=>document.querySelector('select[aria-label="工作结构历史时点"]')?.options.length>=3);return {scope:window.taskCopilotWorkbench.content.scope(),readOnlyHistoryOpen:true};`);process.stdout.write(JSON.stringify(result)+'\n');
  }else if(mode==='replay'){
   await evaluate(`${wait}logseq.setMainUIInlineStyle({width:'1100px'});await wait(()=>window.innerWidth>=900);return {width:window.innerWidth};`);
   const before=await files(manifest.graph);
   const result=await evaluate(`${wait}const api=window.taskCopilotWorkbench;
    const storage=async()=>{const out={};for(const k of (await logseq.FileStorage.allKeys()).sort())out[k]=await logseq.FileStorage.getItem(k);return out;};
    const before=await storage(),history=${await readFile(join(root,'history.json'),'utf8')};
    const root=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='工作结构历史 · 只读回放');if(!root)throw Error('History entry absent');
    for(let p=root;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;[...root.querySelectorAll('button')].find(b=>b.textContent==='切换结构图')?.click();
    const initialPoint=root.dataset.historyPoint;const frames=[],count=root.querySelector('select').options.length;
    for(let index=0;index<count;index++){
      const slider=root.querySelector('input');slider.value=String(index);slider.dispatchEvent(new Event('input'));
      const nodes=[...root.querySelectorAll('[data-history-node]')],details=[];
      for(const n of nodes){n.click();details.push(root.querySelector('.wb-history-details').innerText);}
      frames.push({index,graph:!!root.querySelector('.wb-history-map'),point:root.dataset.historyPoint,edges:root.querySelectorAll('svg path').length,nodes:nodes.map(n=>({id:n.dataset.historyNode,text:n.textContent,top:n.style.top,left:n.style.left,rect:n.getBoundingClientRect().toJSON()})),details});
    }
    const selectionBefore=root.querySelector('.wb-history-details').innerText;const button=[...root.querySelectorAll('button')].find(b=>b.textContent==='切换目录 / 差异');button.click();const directory=!!root.querySelector('.wb-history-directory'),selected=root.querySelector('.wb-history-details').innerText;
    const ids=${await readFile(join(root,'ids.json'),'utf8')};
    const open=async id=>{root.querySelector('[data-history-node="'+id+'"]').click();[...root.querySelectorAll('button')].find(b=>b.textContent==='定位今天的来源块（与历史正文分开）').click();};
    const record=${await readFile(join(root,'record.json'),'utf8')};await open(record.extra);await wait(()=>root.querySelector('.wb-history-details').textContent.includes('来源已删除'));const deletedLocation=root.querySelector('.wb-history-details').innerText;
    await open(ids.root);await wait(()=>root.querySelector('.wb-history-details').textContent.includes('版本一致'));const sameVersion=root.querySelector('.wb-history-details').innerText;
    root.querySelector('[data-history-node="'+ids.a+'"]').click();
    [...root.querySelectorAll('button')].find(b=>b.textContent==='定位今天的来源块（与历史正文分开）').click();
    await wait(()=>root.querySelector('.wb-history-details').textContent.includes('来源已变化'));
    const location=root.querySelector('.wb-history-details').innerText;
    const returnButton=[...root.querySelectorAll('button')].find(b=>b.textContent==='返回触发位置');returnButton.click();const returned={text:document.activeElement?.textContent,className:document.activeElement?.className};
    logseq.setMainUIInlineStyle({width:'400px'});await wait(()=>window.innerWidth<=450);const slider=root.querySelector('input');slider.dispatchEvent(new Event('input'));const narrowDirectory=!!root.querySelector('.wb-history-directory');const after=await storage();return {initialPoint,frames,directory,narrowDirectory,selectionBefore,selected,location,deletedLocation,sameVersion,returned,history,storageBefore:before,storageAfter:after};`);
   const after=await files(manifest.graph);assert.ok(result.directory);assert.equal(result.selected,result.selectionBefore);assert.ok(result.narrowDirectory);assert.ok(result.frames.every(f=>f.graph&&f.edges>0&&f.nodes.every(n=>n.rect.width>0&&n.rect.height>0)));const stage=result.history.stages.find(s=>s.start.id===result.history.current);assert.equal(result.initialPoint,stage.revisions.at(-1)?.id??stage.start.id);assert.ok(result.returned.className.split(' ').includes('wb-review-entry'));assert.match(result.location,/来源已变化/);assert.deepEqual(result.storageBefore,result.storageAfter);assert.deepEqual(before,after);
   const artifact={kind:'live-owned-Logseq-host',directoryPickerOnlyBootstrap:true,sdkReplaced:false,observedAt:new Date().toISOString(),pluginHash:createHash('sha256').update(await readFile(join(manifest.plugin,'dist/index.js'))).digest('hex'),...result,graphBefore:before,graphAfter:after};
   await writeFile(join(repo,'docs/implementation/assets/structure-history/live-host-result.json'),JSON.stringify(artifact,null,2)+'\n');process.stdout.write(JSON.stringify({frames:result.frames.length,directory:result.directory,graphUnchanged:true,storageUnchanged:true,returned:result.returned})+'\n');
  }else throw Error('bootstrap | status | seed | record | reopen | replay');
 }
 }
}finally{ws.close();}
