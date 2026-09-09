import {render,referencedIds,layoutState,getViewState,applyViewOp,type Row,type Snapshot} from './render';
declare const logseq:any;declare const RUNTIME:{port:number;token:string};
const endpoint=`http://127.0.0.1:${RUNTIME.port}`;
const instance=crypto.randomUUID();const hostStyles:string[]=[];
let graph='',focus:string|null=null,revealEvent:any=null;let root:string|null=null,selection=0,seq=0,base:Row[]=[],page='',visible=false,externalActive=false,stopped=false;
let draft:{uuid:string;content:string}|null=null,lastSignature='',reading=false,pollTimer:any,refreshTimer:any;
let fetchEpoch=0;const off:Array<()=>void>=[];const measurements:any[]=[];
let lastPoll=0;const pollGaps:number[]=[];
function record(event:any){measurements.push(event);if(measurements.length>500)measurements.shift()}
function flatten(block:any,depth=0,out:Row[]=[],parent:string|null=null){if(!block?.uuid)return out;out.push({uuid:block.uuid,content:block.content??block.title??'',depth,sourceParent:parent});for(const child of block.children??[])if(!Array.isArray(child))flatten(child,depth+1,out,block.uuid);return out}
function style(open:boolean){logseq.provideStyle({key:'live-preview-reserve',style:open?'#main-content-container{margin-right:44vw!important}.cp__sidebar-main-content{padding-right:12px!important}':''})}
function publish(kind:string,startedAt=Date.now(),error?:string){
  const rows=base.map(r=>draft?.uuid===r.uuid?{...r,content:draft.content}:r);
  const signature=JSON.stringify([selection,rows,draft?.uuid??null,focus,revealEvent,kind,error]);if(signature===lastSignature)return;lastSignature=signature;
  const snapshot:Snapshot={instance,selection,seq:++seq,root,graph,focus,reveal:revealEvent,rows,draft:draft?.uuid??null,kind,observedAt:Date.now(),startedAt,page,error};
  if(visible)render(snapshot,locate);
  requestAnimationFrame(()=>{record({type:'render',seq:snapshot.seq,kind,rows:rows.length,readToFrameMs:Date.now()-startedAt,observedToFrameMs:Date.now()-snapshot.observedAt,at:Date.now()});});
  // Optional external viewer. No Graph content is persisted by the relay.
  void fetch(endpoint+'/snapshot',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify(snapshot)}).catch(()=>{});
}
async function refresh(){
  if(!root||stopped)return;const id=root,epoch=++fetchEpoch,scope=selection,startedAt=Date.now();
  try{const block=await logseq.Editor.getBlock(id,{includeChildren:true});if(stopped||scope!==selection||epoch!==fetchEpoch)return;
    if(!block){base=[];draft=null;publish('missing',startedAt,'来源块已删除或暂不可用');return}
    base=flatten(block);
    const current=new Set(base.map(r=>r.uuid));
    // Keep already organized references, even after a source block leaves the subtree.
    const saved=JSON.parse(localStorage.getItem('work-view:v1:'+JSON.stringify([graph,root]))??'{}');
    const retained=new Set<string>([...(layoutState().key==='work-view:v1:'+JSON.stringify([graph,root])?referencedIds():[]),...(saved.items??[]).map((r:any)=>r.uuid)]);
    for(const uuid of retained)if(!current.has(uuid)){const b=await logseq.Editor.getBlock(uuid);const parent=b?.parent?.id?await logseq.Editor.getBlock(b.parent.id):null;if(scope!==selection||epoch!==fetchEpoch)return;base.push(b?{uuid,content:b.content??'',depth:0,outside:true,sourceParent:parent?.uuid??null}:{uuid,content:'',depth:0,missing:true})}
    if(draft&&!base.some(r=>r.uuid===draft!.uuid))draft=null;publish(draft?'draft':'saved',startedAt);
  }catch(e){record({type:'error',where:'refresh',message:String(e)});publish('error',startedAt,'读取失败；保留上次预览，稍后重试')}
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,35)}
async function select(uuid:string){selection++;fetchEpoch++;root=uuid;draft=null;base=[];lastSignature='';visible=true;
  localStorage.setItem('work-view:last:'+graph,uuid);
  logseq.setMainUIInlineStyle({position:'fixed',top:'48px',right:'0',left:'auto',bottom:'0',width:'44vw',height:'calc(100vh - 48px)',zIndex:50,background:'#f9fbfa',borderLeft:'1px solid #dfe6e2'});
  style(true);logseq.showMainUI({autoFocus:false});
  page=(await logseq.Editor.getCurrentPage())?.originalName??'';await refresh();record({type:'selection',at:Date.now(),selection});
}
async function locate(uuid=root){if(!uuid)return;const b=await logseq.Editor.getBlock(uuid);if(!b){logseq.UI.showMsg('来源暂不可用，已保留视图位置','warning');return}const p=await logseq.Editor.getPage(b.page.id);logseq.Editor.scrollToBlockInPage(p.originalName??p.name,uuid);record({type:'locate-source',uuid,at:Date.now()});logseq.provideStyle({key:'work-view-source-highlight',style:'.ls-block[blockid="'+uuid+'"]{background:#d9eee5!important;box-shadow:inset 3px 0 #278365!important;border-radius:4px}'});
  // Native navigation supplies its own target highlight. Do not enter edit mode.
}
async function reveal(uuid:string){if(!base.some(r=>r.uuid===uuid)){logseq.UI.showMsg('此块不在当前工作视图中','warning');return}revealEvent={uuid,nonce:Date.now()};visible=true;style(true);logseq.showMainUI({autoFocus:false});publish('focus')}

async function poll(){
  const startedAt=Date.now();if(lastPoll&&(visible||externalActive)){pollGaps.push(startedAt-lastPoll);if(pollGaps.length>1200)pollGaps.shift()}lastPoll=startedAt;
  if(root&&(visible||externalActive)&&!reading){reading=true;const scope=selection;
    try{const editing=await logseq.Editor.checkEditing();
      const nextFocus=typeof editing==='string'&&base.some(r=>r.uuid===editing)?editing:null;if(scope===selection&&focus!==nextFocus){focus=nextFocus;if(focus)logseq.provideStyle({key:'work-view-source-highlight',style:''});publish('focus',startedAt)}
      if(scope===selection&&typeof editing==='string'&&base.some(r=>r.uuid===editing)){
        const content=await logseq.Editor.getEditingBlockContent();
        // Recheck identity: a fast cursor change must not paint another block's text.
        const still=await logseq.Editor.checkEditing();
        if(scope===selection&&still===editing&&typeof content==='string'){
          if(draft?.uuid!==editing||draft?.content!==content){record({type:'draft-observed',at:Date.now(),baseMatchesDraft:base.find(r=>r.uuid===editing)?.content===content,readMs:Date.now()-startedAt});draft={uuid:editing,content};publish('draft',startedAt)}
        }
      }else if(scope===selection&&draft){draft=null;await refresh()}
    }catch(e){record({type:'error',where:'poll',message:String(e)})}finally{reading=false}
  }
  if(!stopped)pollTimer=setTimeout(poll,Math.max(10,50-(Date.now()-startedAt)));
}
function close(){visible=false;style(false);logseq.hideMainUI({restoreEditingCursor:true})}
logseq.ready(async()=>{
  graph=(await logseq.App.getCurrentGraph())?.path??'';
  // An explicit ASCII command key works with the installed file-Graph host.
  off.push(logseq.App.registerCommand('block-context-menu-item',{key:'live-preview-block',label:'实时预览此块'},async(event:any)=>{record({type:'context-menu',at:Date.now(),hasUuid:typeof event?.uuid==='string'});if(event?.uuid)await select(event.uuid)}));
  off.push(logseq.App.registerCommandPalette({key:'live-preview-current',label:'实时预览当前块',keybinding:{binding:'mod+alt+p'}},async()=>{const b=await logseq.Editor.getCurrentBlock();if(b)await select(b.uuid);else logseq.UI.showMsg('先点击一个块，再打开实时预览','warning')}));
  off.push(logseq.App.registerCommand('block-context-menu-item',{key:'work-view-reveal',label:'在当前工作视图定位'},async(event:any)=>{if(event?.uuid)await reveal(event.uuid)}));
  off.push(logseq.DB.onChanged(()=>{if(root&&(visible||externalActive))scheduleRefresh()}));
  off.push(logseq.App.onCurrentGraphChanged(async()=>{selection++;root=null;base=[];draft=null;publish('missing',Date.now(),'图谱已切换，请重新选择来源块');externalActive=false;close();graph=(await logseq.App.getCurrentGraph())?.path??''}));
  document.getElementById('close')!.onclick=close;document.getElementById('locate')!.onclick=()=>locate();
  const external=document.getElementById('external')!;external.style.display='inline';external.onclick=()=>{externalActive=true;logseq.App.openExternalLink(endpoint+'/#'+RUNTIME.token)};
  const previous=localStorage.getItem('work-view:last:'+graph);if(previous)await select(previous);
  void poll();
  const commands=new EventSource(endpoint+'/commands?token='+encodeURIComponent(RUNTIME.token));commands.onmessage=async(e)=>{const c=JSON.parse(e.data);if(c.graph===graph&&c.root===root&&base.some(r=>r.uuid===c.uuid)){await locate(c.uuid);void fetch(endpoint+'/command-result',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify({id:c.id,uuid:c.uuid,at:Date.now()})})}};
  // Agent-facing structured view channel. Same relay, same scope guard as locate.
  const viewOps=new EventSource(endpoint+'/view-ops?token='+encodeURIComponent(RUNTIME.token));let lastAgentNote=0;
  function viewResult(msg:any){void fetch(endpoint+'/view-result',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify(msg)}).catch(()=>{})}
  function agentNote(text:string){const foot=document.getElementById('foot');if(!foot)return;if(Date.now()-lastAgentNote<400)return;lastAgentNote=Date.now();foot.textContent=text;setTimeout(()=>{const f=document.getElementById('foot');if(f)f.textContent='视图组织已保存 · 正文在 Logseq 编辑'},2600)}
  viewOps.onmessage=async(e)=>{const c=JSON.parse(e.data);const at=Date.now();
    const scope=(extra:any={})=>({graphSeen:graph,rootSeen:root,cmdGraph:c.graph,cmdRoot:c.root,...extra});
    if(c.graph!==graph)return viewResult({id:c.id,ok:false,reason:'graph-mismatch',at,scope:scope()});
    // Switching the work scope is the one op that must precede a root match.
    if(c.op?.type==='scope'){const uuid=c.op.root??c.op.uuid;if(typeof uuid!=='string'||!uuid)return viewResult({id:c.id,ok:false,reason:'scope-root-required',at,scope:scope()});
      const b=await logseq.Editor.getBlock(uuid,{includeChildren:true});if(!b)return viewResult({id:c.id,ok:false,reason:'scope-root-not-readable',at,scope:scope()});
      await select(uuid);agentNote('Agent 切换了工作范围');return viewResult({id:c.id,ok:true,at,scope:scope(),state:getViewState()})}
    if(c.root!==root)return viewResult({id:c.id,ok:false,reason:'root-mismatch',at,scope:scope()});
    if(c.op?.type==='locate'){if(!base.some(r=>r.uuid===c.op.uuid))return viewResult({id:c.id,ok:false,reason:'uuid-not-in-view',at});await locate(c.op.uuid);agentNote('Agent 已定位原文');return viewResult({id:c.id,ok:true,uuid:c.op.uuid,at})}
    if(c.op?.type==='query'){const st:any=getViewState();if(st)st.page=page;return viewResult({id:c.id,ok:true,at,state:st})}
    // Research probe: CSS injection into panel + native block DOM (logseq.provideStyle).
    if(c.op?.type==='style'){if(typeof c.op.css!=='string')return viewResult({id:c.id,ok:false,reason:'css-required',at});
      const key='agent-style:'+String(c.op.key??'default');logseq.provideStyle({key,style:c.op.css});
      return viewResult({id:c.id,ok:true,at,key,cssLength:c.op.css.length})}
    // Research probe: block history via the host git repo (logseq.Git.execCommand).
    if(c.op?.type==='history'){try{
      const args=Array.isArray(c.op.args)?c.op.args:['log','--oneline','-n',String(c.op.n??5)];
      const out:any=await logseq.Git.execCommand(args);
      return viewResult({id:c.id,ok:true,at,args,stdout:String(out?.stdout??''),stderr:String(out?.stderr??''),exitCode:out?.exitCode})}
      catch(err){return viewResult({id:c.id,ok:false,reason:'git-failed:'+String(err),at})}}
    // Research probe: inspect the host document (native blocks) vs the plugin main-UI document.
    if(c.op?.type==='dom'){const sel=String(c.op.sel??'.ls-block');const uuid=c.op.uuid??null;const probe=(doc:Document|null)=>{if(!doc)return {accessible:false};
      const all=doc.querySelectorAll(sel);const target=uuid?doc.querySelector(sel+'[blockid=\"'+uuid+'\"]'):null;
      return {accessible:true,count:all.length,targetFound:!!target,targetBg:target?getComputedStyle(target).backgroundColor:null,targetBoxShadow:target?getComputedStyle(target).boxShadow:null,sample:all[0]?(all[0] as HTMLElement).className:null};};
      let host:Document|null=null;try{host=window.parent&&window.parent!==window?window.parent.document:null}catch(err){host=null}
      return viewResult({id:c.id,ok:true,at,selector:sel,pluginDoc:probe(document),hostDoc:probe(host),hostAccessible:!!host})}
    // Guarded by an explicit flag so it can never fire by accident.
    // Research probe: inject CSS into the HOST document (where native blocks live).
    if(c.op?.type==='host-css'){let host:Document|null=null;try{host=window.parent&&window.parent!==window?window.parent.document:null}catch{host=null}
      if(!host)return viewResult({id:c.id,ok:false,reason:'host-document-not-accessible',at});
      const id='probe-host-style-'+String(c.op.key??'default');
      let el=host.getElementById(id) as HTMLStyleElement|null;
      if(!el){el=host.createElement('style');el.id=id;host.head.appendChild(el);hostStyles.push(id)}
      el.textContent=String(c.op.css??'');
      const uuid=c.op.uuid??null;const target=uuid?host.querySelector('.ls-block[blockid=\"'+uuid+'\"]'):null;
      return viewResult({id:c.id,ok:true,at,styleId:id,cssLength:String(c.op.css??'').length,targetFound:!!target,targetBg:target?getComputedStyle(target).backgroundColor:null})}
    if(c.op?.type==='git-commit'){if(c.op.confirm!==true)return viewResult({id:c.id,ok:false,reason:'confirm-required',at});
      try{const msg=String(c.op.message??'probe snapshot');
        const add:any=await logseq.Git.execCommand(['add','-A']);
        const out:any=await logseq.Git.execCommand(['commit','-m',msg]);
        return viewResult({id:c.id,ok:true,at,addExit:add?.exitCode,stdout:String(out?.stdout??''),stderr:String(out?.stderr??''),exitCode:out?.exitCode})}
      catch(err){return viewResult({id:c.id,ok:false,reason:'git-commit-failed:'+String(err),at})}}
    try{const r=applyViewOp(c.op);agentNote(r.ok?'Agent 调整了视图排列（原文未改）':'Agent 操作被拒绝：'+r.reason);return viewResult({id:c.id,ok:!!r.ok,reason:r.reason,at,scope:scope(),state:getViewState()})}
    catch(err){record({type:'error',where:'view-ops',message:String(err)});return viewResult({id:c.id,ok:false,reason:'apply-failed:'+String(err),at,scope:scope()})}};
  const heartbeat=setInterval(()=>{if(root&&(visible||externalActive)){lastSignature='';void refresh();}void fetch(endpoint+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify({measurements:measurements.splice(0),pollGaps:pollGaps.splice(0),visible,layout:layoutState(),graph,root,at:Date.now()})}).catch(()=>{})},2000);
  logseq.beforeunload(()=>{stopped=true;commands.close();viewOps.close();clearTimeout(pollTimer);clearTimeout(refreshTimer);clearInterval(heartbeat);style(false);logseq.provideStyle({key:'work-view-source-highlight',style:''});
    // Host-document styles outlive the plugin document, so they must be removed explicitly.
    try{let host:Document|null=window.parent&&window.parent!==window?window.parent.document:null;
      for(const id of hostStyles)host?.getElementById(id)?.remove();hostStyles.length=0;}catch{}
    for(const f of off)if(typeof f==='function')f()});
  logseq.UI.showMsg('实时预览已就绪：块右键 → 实时预览此块','success');
}).catch(e=>{console.error(e);void fetch(endpoint+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify({startupError:String(e),stack:e?.stack,at:Date.now()})})});
