import {render,referencedIds,layoutState,getViewState,applyViewOp,type Row,type Snapshot} from './render';
import {validate,organization,signature,synchronize} from './source-sync.mjs';
import {ancestry,workObject,clickDecision} from './focus.mjs';
declare const logseq:any;declare const RUNTIME:{port:number;token:string};
const endpoint=`http://127.0.0.1:${RUNTIME.port}`;
const instance=crypto.randomUUID();const hostStyles:string[]=[];
let graph='',focus:string|null=null,revealEvent:any=null;let root:string|null=null,selection=0,seq=0,base:Row[]=[],page='',visible=false,externalActive=false,stopped=false;
let draft:{uuid:string;content:string}|null=null,lastSignature='',reading=false,pollTimer:any,refreshTimer:any;
let fetchEpoch=0;const off:Array<()=>void>=[];const measurements:any[]=[];
let lastPoll=0;const pollGaps:number[]=[];
// Object-focus: which object the work view currently represents, and its ancestor object chain.
let objectUuid:string|null=null,objectChain:Array<{uuid:string;title:string}>=[],autoFollow=true;
let held:string|null=null,focusEpoch=0;
let syncing=false;
function saveScope(){if(root){localStorage.setItem('work-view:last:'+graph,root);localStorage.setItem('work-view:scope:'+graph,JSON.stringify({root,held}))}}
function record(event:any){measurements.push(event);if(measurements.length>500)measurements.shift()}
function flatten(block:any,depth=0,out:Row[]=[],parent:string|null=null){if(!block?.uuid)return out;out.push({uuid:block.uuid,content:block.content??block.title??'',depth,sourceParent:parent});for(const child of block.children??[])if(!Array.isArray(child))flatten(child,depth+1,out,block.uuid);return out}
// All scope changes share a latest-request guard. No async result may revive an old click.
async function traceOf(uuid:string){try{return await ancestry(uuid,(id:any)=>logseq.Editor.getBlock(id))}catch(e){record({type:'error',where:'ancestry',message:String(e)});return {path:[],objects:[],complete:false}}}
async function enterScope(uuid:string,reason:string,explicit=false){
  if(syncing)return {ok:false,reason:'source-sync-in-progress'};
  const epoch=++focusEpoch,g=graph;const trace=await traceOf(uuid);
  if(epoch!==focusEpoch||g!==graph||stopped)return {ok:false,reason:'superseded'};
  if(!trace.complete||trace.path[0]!==uuid)return {ok:false,reason:'source-not-readable'};
  if(!explicit&&!trace.objects.some((x:any)=>x.uuid===uuid))return {ok:false,reason:'not-an-object'};
  return commitScope(uuid,trace,reason,explicit?'explicit':reason==='breadcrumb'?'breadcrumb':null,epoch);
}
async function commitScope(uuid:string,trace:any,reason:string,nextHeld:string|null,epoch:number){
  const currentPage=await logseq.Editor.getCurrentPage();
  if(epoch!==focusEpoch||stopped)return {ok:false,reason:'superseded'};
  held=nextHeld;objectChain=trace.objects;objectUuid=trace.objects.some((x:any)=>x.uuid===uuid)?uuid:null;
  if(root!==uuid){selection++;fetchEpoch++;root=uuid;draft=null;base=[];focus=null;revealEvent=null;}
  lastSignature='';visible=true;
  saveScope();
  logseq.setMainUIInlineStyle({position:'fixed',top:'48px',right:'0',left:'auto',bottom:'0',width:'44vw',height:'calc(100vh - 48px)',zIndex:50,background:'#f9fbfa',borderLeft:'1px solid #dfe6e2'});
  style(true);logseq.showMainUI({autoFocus:false});
  page=currentPage?.originalName??'';await refresh();
  if(epoch!==focusEpoch)return {ok:false,reason:'superseded'};
  record({type:'object-focus',uuid,reason,held,chain:objectChain.length,at:Date.now()});
  return {ok:true,uuid,chain:objectChain,held};
}
async function focusObject(uuid:string,reason:string){return enterScope(uuid,reason)}
async function tryAutoFocus(uuid:string){
  if(syncing||!autoFollow||stopped)return {ok:false,reason:'auto-follow-off'};
  const epoch=++focusEpoch,g=graph,trace=await traceOf(uuid);
  if(epoch!==focusEpoch||g!==graph||stopped)return {ok:false,reason:'superseded'};
  const decision=clickDecision({root,held},trace);
  if(decision.action==='keep'){
    if(decision.release){held=null;saveScope();lastSignature='';publish('focus')}
    if(base.some(r=>r.uuid===uuid)){focus=uuid;publish('focus')}
    return {ok:true,reason:decision.reason,uuid:root};
  }
  if(decision.uuid===root){objectChain=trace.objects;held=null;saveScope();focus=uuid;publish('focus');return {ok:true,reason:'already-focused',uuid:root}}
  const result=await commitScope(decision.uuid,{...trace,objects:trace.objects},'click',null,epoch);
  if(epoch===focusEpoch){focus=uuid;publish('focus')}
  return result;
}
function style(open:boolean){logseq.provideStyle({key:'live-preview-reserve',style:open?'#main-content-container{margin-right:44vw!important}.cp__sidebar-main-content{padding-right:12px!important}':''})}
function publish(kind:string,startedAt=Date.now(),error?:string){
  const rows=base.map(r=>draft?.uuid===r.uuid?{...r,content:draft.content}:r);
  const signature=JSON.stringify([selection,rows,draft?.uuid??null,focus,revealEvent,kind,error,objectUuid,objectChain,held,autoFollow]);if(signature===lastSignature)return;lastSignature=signature;
  const snapshot:Snapshot={instance,selection,seq:++seq,root,graph,focus,reveal:revealEvent,rows,draft:draft?.uuid??null,kind,observedAt:Date.now(),startedAt,page,error,objectUuid,objectChain,autoFollow,held};
  if(visible)render(snapshot,locate,{onCrumb:crumbTo,onEnter:(uuid)=>focusObject(uuid,'explicit-object'),onResume:()=>{held=null;saveScope();lastSignature='';publish('focus')},onClose:close});
  requestAnimationFrame(()=>{record({type:'render',seq:snapshot.seq,kind,rows:rows.length,readToFrameMs:Date.now()-startedAt,observedToFrameMs:Date.now()-snapshot.observedAt,at:Date.now()});});
  // Optional external viewer. No Graph content is persisted by the relay.
  void fetch(endpoint+'/snapshot',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify(snapshot)}).catch(()=>{});
}
async function refresh(){
  if(syncing||!root||stopped)return;const id=root,epoch=++fetchEpoch,scope=selection,startedAt=Date.now();
  try{const block=await logseq.Editor.getBlock(id,{includeChildren:true});if(stopped||scope!==selection||epoch!==fetchEpoch)return;
    if(!block){base=[];draft=null;publish('missing',startedAt,'来源块已删除或暂不可用');return}
    const trace=await traceOf(id);if(scope!==selection||epoch!==fetchEpoch)return;
    if(trace.complete){objectChain=trace.objects;objectUuid=workObject(block.content)?id:null;}
    base=flatten(block,0,[],trace.path[1]??null);
    const current=new Set(base.map(r=>r.uuid));
    // Keep already organized references, even after a source block leaves the subtree.
    const saved=JSON.parse(localStorage.getItem('work-view:v1:'+JSON.stringify([graph,root]))??'{}');
    const retained=new Set<string>([...(layoutState().key==='work-view:v1:'+JSON.stringify([graph,root])?referencedIds():[]),...(saved.items??[]).map((r:any)=>r.uuid)]);
    for(const uuid of retained)if(!current.has(uuid)){const b=await logseq.Editor.getBlock(uuid);const parent=b?.parent?.id?await logseq.Editor.getBlock(b.parent.id):null;if(scope!==selection||epoch!==fetchEpoch)return;base.push(b?{uuid,content:b.content??'',depth:0,outside:true,sourceParent:parent?.uuid??null}:{uuid,content:'',depth:0,missing:true})}
    if(draft&&!base.some(r=>r.uuid===draft!.uuid))draft=null;publish(draft?'draft':'saved',startedAt);
  }catch(e){if(stopped||scope!==selection||epoch!==fetchEpoch)return;record({type:'error',where:'refresh',message:String(e)});publish('error',startedAt,'读取失败；保留上次预览，稍后重试')}
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,35)}
async function select(uuid:string){return enterScope(uuid,'explicit',true)}
async function locate(uuid=root){if(!uuid)return;const b=await logseq.Editor.getBlock(uuid);if(!b){logseq.UI.showMsg('来源暂不可用，已保留视图位置','warning');return}const p=await logseq.Editor.getPage(b.page.id);logseq.Editor.scrollToBlockInPage(p.originalName??p.name,uuid);record({type:'locate-source',uuid,at:Date.now()});logseq.provideStyle({key:'work-view-source-highlight',style:'.ls-block[blockid="'+uuid+'"]{background:#d9eee5!important;box-shadow:inset 3px 0 #278365!important;border-radius:4px}'});
  // Native navigation supplies its own target highlight. Do not enter edit mode.
}
async function reveal(uuid:string){if(!base.some(r=>r.uuid===uuid)){logseq.UI.showMsg('此块不在当前工作视图中','warning');return}revealEvent={uuid,nonce:Date.now()};visible=true;style(true);logseq.showMainUI({autoFocus:false});publish('focus')}
// Breadcrumb ascent holds this source subtree until an explicit entry or an outside click.
async function crumbTo(uuid:string){const r=await focusObject(uuid,'breadcrumb');if(r&&(r as any).ok===false&&(r as any).reason!=='superseded')logseq.UI.showMsg('无法切换到该上级对象','warning')}

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
// Native blocks live in the host document; the plugin document has no .ls-block.
function watchHostClicks(){
  let host:Document|null=null;try{host=window.parent&&window.parent!==window?window.parent.document:null}catch{host=null}
  if(!host)return ()=>{};
  const onClick=async(ev:MouseEvent)=>{if(stopped||!autoFollow)return;
    const el=ev.target as HTMLElement|null;const blockEl=el?.closest?.('.ls-block') as HTMLElement|null;if(!blockEl)return;
    const uuid=blockEl.getAttribute('blockid');if(!uuid)return;
    const r=await tryAutoFocus(uuid);
    record({type:'block-click',uuid,autoFocus:!!(r&&(r as any).ok),reason:(r&&(r as any).reason)||null,at:Date.now()});
  };
  host.addEventListener('click',onClick,true);
  return ()=>{host!.removeEventListener('click',onClick,true)};
}
logseq.ready(async()=>{
 try{
  graph=(await logseq.App.getCurrentGraph())?.path??'';
  // Channel setup comes FIRST: panel DOM may not exist yet, and a throw there must not
  // leave the plugin half-connected (that happened once during this session).
  const commands=new EventSource(endpoint+'/commands?token='+encodeURIComponent(RUNTIME.token));commands.onmessage=async(e)=>{const c=JSON.parse(e.data);if(c.graph===graph&&c.root===root&&base.some(r=>r.uuid===c.uuid)){await locate(c.uuid);void fetch(endpoint+'/command-result',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify({id:c.id,uuid:c.uuid,at:Date.now()})})}};
  // Agent-facing structured view channel. Same relay, same scope guard as locate.
  const viewOps=new EventSource(endpoint+'/view-ops?token='+encodeURIComponent(RUNTIME.token));let lastAgentNote=0;
  function viewResult(msg:any){void fetch(endpoint+'/view-result',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify(msg)}).catch(()=>{})}
  function agentNote(text:string){const foot=document.getElementById('foot');if(!foot)return;if(Date.now()-lastAgentNote<400)return;lastAgentNote=Date.now();foot.textContent=text;setTimeout(()=>{const f=document.getElementById('foot');if(f)f.textContent='视图组织已保存 · 正文在 Logseq 编辑'},2600)}
  viewOps.onmessage=async(e)=>{const c=JSON.parse(e.data);const at=Date.now();
    const scope=(extra:any={})=>({graphSeen:graph,rootSeen:root,cmdGraph:c.graph,cmdRoot:c.root,...extra});
    if(syncing)return viewResult({id:c.id,ok:false,reason:'source-sync-in-progress',at});
    if(c.graph!==graph)return viewResult({id:c.id,ok:false,reason:'graph-mismatch',at,scope:scope()});
    // Switching the work scope is the one op that must precede a root match.
    if(c.op?.type==='scope'){const uuid=c.op.root??c.op.uuid;if(typeof uuid!=='string'||!uuid)return viewResult({id:c.id,ok:false,reason:'scope-root-required',at,scope:scope()});
      const b=await logseq.Editor.getBlock(uuid,{includeChildren:true});if(!b)return viewResult({id:c.id,ok:false,reason:'scope-root-not-readable',at,scope:scope()});
      await select(uuid);agentNote('Agent 切换了工作范围');return viewResult({id:c.id,ok:true,at,scope:scope(),state:getViewState()})}
    // Read the CURRENT view without asserting a root: scope changes (clicks, breadcrumbs)
    // race with the relay's heartbeat, so callers need a way to resync.
    if(c.op?.type==='current'){const st:any=getViewState();if(st)st.page=page;return viewResult({id:c.id,ok:true,at,scope:scope(),state:st})}
    if(c.root!==root)return viewResult({id:c.id,ok:false,reason:'root-mismatch',at,scope:scope()});
    if(c.op?.type==='sync-preview'||c.op?.type==='sync-source'){
      syncing=true;fetchEpoch++;document.body.style.pointerEvents='none';
      const g=graph,r=root, originalSelection=selection;
      const read=async()=>{const b=await logseq.Editor.getBlock(r,{includeChildren:true});if(!b)throw Error('source-unavailable');return flatten(b)};
      const check=async()=>{if(graph!==g||root!==r||selection!==originalSelection)throw Error('scope-changed');if(await logseq.Editor.checkEditing())throw Error('finish-editing-before-sync');if(c.op.type==='sync-source'&&JSON.stringify(organization((getViewState() as any).items))!==JSON.stringify(c.op.plan?.items))throw Error('layout-changed-during-sync');};
      try {
        await check();const source=await read(),state:any=getViewState();
        if(state?.blocks.some((b:any)=>b.missing||b.outside))throw Error('view-has-missing-or-outside-blocks');
        validate(source,state.items);
        if(c.op.type==='sync-preview')return viewResult({id:c.id,ok:true,at,plan:{graph:g,root:r,items:organization(state.items),source:signature(source)},before:organization(source),blocks:source});
        const plan=c.op.plan;
        if(!plan||plan.graph!==g||plan.root!==r)throw Error('preview-plan-required');
        if(JSON.stringify(plan.items)!==JSON.stringify(organization(state.items)))throw Error('layout-changed-since-preview');
        const result=await synchronize({plan,read,check,move:async(step:any)=>{await logseq.Editor.moveBlock(step.uuid,step.target,{children:step.children,before:false})}});
        agentNote(result.ok?'视图顺序和层级已同步到 Logseq':'同步已停止，请检查原文');
        return viewResult({id:c.id,...result,at});
      }catch(err){return viewResult({id:c.id,ok:false,reason:String(err),at})}
      finally{syncing=false;document.body.style.pointerEvents='';await refresh()}
    }
    // Object focus: render one object as the work view root (used by clicks and breadcrumbs).
    if(c.op?.type==='object-focus'){const uuid=c.op.uuid;if(typeof uuid!=='string'||!uuid)return viewResult({id:c.id,ok:false,reason:'uuid-required',at});
      const r:any=await focusObject(uuid,c.op.reason??'agent');agentNote(r.ok?'已聚焦对象：'+(c.op.title??''):'无法聚焦该对象');
      return viewResult({id:c.id,ok:!!r.ok,reason:r.reason,at,state:getViewState()})}
    if(c.op?.type==='auto-follow'){autoFollow=c.op.enabled!==false;lastSignature='';publish('saved');
      return viewResult({id:c.id,ok:true,at,autoFollow})}
    if(c.op?.type==='simulate-click'){const uuid=c.op.uuid;if(typeof uuid!=='string'||!uuid)return viewResult({id:c.id,ok:false,reason:'uuid-required',at});
      const r:any=await tryAutoFocus(uuid);return viewResult({id:c.id,ok:!!r.ok,reason:r.reason,at,autoFollow,chain:objectChain})}
    // Test-fixture ops: only used to build/remove synthetic objects during validation.
    if(c.op?.type==='insert-object'){if(c.op.confirm!==true)return viewResult({id:c.id,ok:false,reason:'confirm-required',at});
      try{const b:any=await logseq.Editor.insertBlock(c.op.parent,String(c.op.content??''),{sibling:false});
        return viewResult({id:c.id,ok:!!b,uuid:b?.uuid,at})}
      catch(err){return viewResult({id:c.id,ok:false,reason:'insert-failed:'+String(err),at})}}
    // Test-fixture helper: insert a markdown subtree (tab-indented) under a parent.
    if(c.op?.type==='insert-tree'){if(c.op.confirm!==true)return viewResult({id:c.id,ok:false,reason:'confirm-required',at});
      try{const lines=String(c.op.markdown??'').replace(/\r/g,'').split('\n').filter(l=>l.trim());
        const stack:Array<{uuid:string;indent:number}>=[{uuid:c.op.parent,indent:-1}];const made:string[]=[];
        for(const line of lines){const indent=(line.match(/^\t*/)??[''])[0].length;const text=line.replace(/^\t+/,'').replace(/^-\s*/,'');
          while(stack.length>1&&stack[stack.length-1].indent>=indent)stack.pop();
          const parent=stack[stack.length-1].uuid;
          const b:any=await logseq.Editor.insertBlock(parent,text,{sibling:false});
          if(!b)throw new Error('insert returned null for: '+text.slice(0,30));
          stack.push({uuid:b.uuid,indent});made.push(b.uuid);}
        return viewResult({id:c.id,ok:true,at,uuids:made})}
      catch(err){return viewResult({id:c.id,ok:false,reason:'insert-tree-failed:'+String(err),at})}}
    if(c.op?.type==='delete-object'){if(c.op.confirm!==true)return viewResult({id:c.id,ok:false,reason:'confirm-required',at});
      try{await logseq.Editor.removeBlock(c.op.uuid);return viewResult({id:c.id,ok:true,at})}
      catch(err){return viewResult({id:c.id,ok:false,reason:'delete-failed:'+String(err),at})}}
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
      const first=all[0] as HTMLElement|null;
      return {accessible:true,count:all.length,targetFound:!!target,targetBg:target?getComputedStyle(target).backgroundColor:null,targetBoxShadow:target?getComputedStyle(target).boxShadow:null,sample:first?first.className:null,text:first?(first.textContent||'').trim().slice(0,80):null,hidden:first?first.hasAttribute('hidden'):null};};
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
  // Panel wiring last: every dependency above must already be alive, and a missing
  // element (panel not rendered yet) must not break the plugin.
  try{
    off.push(logseq.App.registerCommand('block-context-menu-item',{key:'live-preview-block',label:'从这个 block 打开工作视图'},async(event:any)=>{record({type:'context-menu',at:Date.now(),hasUuid:typeof event?.uuid==='string'});if(event?.uuid)await select(event.uuid)}));
    off.push(logseq.App.registerCommandPalette({key:'live-preview-current',label:'从当前 block 打开工作视图',keybinding:{binding:'mod+alt+p'}},async()=>{const b=await logseq.Editor.getCurrentBlock();if(b)await select(b.uuid);else logseq.UI.showMsg('先点击一个块，再打开实时预览','warning')}));
    off.push(logseq.App.registerCommand('block-context-menu-item',{key:'work-view-reveal',label:'在当前工作视图定位'},async(event:any)=>{if(event?.uuid)await reveal(event.uuid)}));
    off.push(logseq.DB.onChanged(()=>{if(root&&(visible||externalActive))scheduleRefresh()}));
    off.push(logseq.App.registerCommand('block-context-menu-item',{key:'work-view-enter-object',label:'以此对象进入工作视图'},async(event:any)=>{if(event?.uuid){const trace=await traceOf(event.uuid);const object=trace.objects.at(-1);if(object)await focusObject(object.uuid,'explicit-object');else logseq.UI.showMsg('此处没有识别出的工作对象','warning')}}));
    // Ordinary clicks resolve the nearest object through every source context block.
    off.push(watchHostClicks());
    off.push(logseq.App.onCurrentGraphChanged(async()=>{selection++;focusEpoch++;fetchEpoch++;held=null;objectUuid=null;objectChain=[];root=null;base=[];draft=null;publish('missing',Date.now(),'图谱已切换，请重新选择来源块');externalActive=false;close();graph=(await logseq.App.getCurrentGraph())?.path??''}));
    void poll();
    const previous=localStorage.getItem('work-view:last:'+graph);if(previous){let saved:any={};try{saved=JSON.parse(localStorage.getItem('work-view:scope:'+graph)??'{}')}catch{}
      const trace=await traceOf(previous);if(trace.complete)await commitScope(previous,trace,'restore',saved.root===previous?saved.held:'explicit',++focusEpoch);}
  }catch(e){record({type:'error',where:'startup-wiring',message:String(e)});void fetch(endpoint+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify({startupWiringError:String(e),at:Date.now()})}).catch(()=>{})}
  logseq.UI.showMsg('实时预览已就绪：块右键 → 从这个 block 打开工作视图','success');
 }catch(e){console.error(e);record({type:'error',where:'startup-early',message:String(e)});
   void fetch(endpoint+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify({startupEarlyError:String(e),stack:(e as any)?.stack,at:Date.now()})}).catch(()=>{})}
}).catch(e=>{console.error(e);void fetch(endpoint+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RUNTIME.token},body:JSON.stringify({startupError:String(e),stack:e?.stack,at:Date.now()})})});
