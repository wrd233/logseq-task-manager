import {displayLevel,savedLevels,levels} from './display.mjs';
import {marked} from './vendor/marked.js';
import DOMPurify from 'dompurify';
import {reconcile,move,indent,parse} from './model.mjs';
import {workObject,continuingLayout} from './focus.mjs';
export type Row={uuid:string;content:string;depth:number;sourceParent?:string|null;missing?:boolean;outside?:boolean};
export type Snapshot={instance:string;selection:number;seq:number;root:string|null;graph?:string;rows:Row[];draft:string|null;focus?:string|null;reveal?:{uuid:string;nonce:number};kind:string;observedAt:number;startedAt:number;page?:string;error?:string;objectUuid?:string|null;objectChain?:Array<{uuid:string;title:string}>;autoFollow?:boolean;held?:string|null};
export type RenderHandlers={onCrumb?:(uuid:string)=>void;onEnter?:(uuid:string)=>void;onResume?:()=>void;onClose?:()=>void};
const rows=document.getElementById('rows')!;
const views=new Map<string,any>();let key='',items:any[]=[],collapsed=new Set<string>(),selected='',latest:Snapshot,locateFn:any,latestHandlers:RenderHandlers={};
let finishDrag:((e:PointerEvent)=>void)|null=null;document.addEventListener('pointerup',e=>{finishDrag?.(e);finishDrag=null},true);
let lastReveal=0,anchor:any=null,dragged='',startX=0,lastInstance='',lastSeq=-1;
let displayOverrides:Record<string,string>={},expandedBodies=new Set<string>(),rawBodies=new Set<string>();
const inputEvents:any[]=[];for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture','mouseup'])document.addEventListener(name,(e:any)=>{inputEvents.push({name,target:e.target?.className,x:e.clientX,y:e.clientY,buttons:e.buttons,at:Date.now()});if(inputEvents.length>30)inputEvents.shift()},true);
export function layoutState(){return {key,items,displayOverrides,expandedBodies:[...expandedBodies],collapsed:[...collapsed],selected,anchor,inputEvents}}
export function referencedIds(){return items.map(x=>x.uuid)}
function persist(){if(!key)return;try{localStorage.setItem(key,JSON.stringify({version:1,items,displayOverrides,expandedBodies:[...expandedBodies],collapsed:[...collapsed],selected,anchor}));document.getElementById('foot')!.textContent='视图组织已保存 · 正文在 Logseq 编辑'}catch{document.getElementById('foot')!.textContent='视图组织保存失败；请保持此窗口打开'}}
function capture(){const v=[...rows.querySelectorAll<HTMLElement>('.row:not([hidden])')].find(e=>e.getBoundingClientRect().bottom>document.querySelector('header')!.getBoundingClientRect().bottom);return v?{uuid:v.dataset.uuid,top:v.getBoundingClientRect().top}:null}
function restore(a:any){const el=a&&views.get(a.uuid)?.element;if(el&&!el.hidden)window.scrollBy(0,el.getBoundingClientRect().top-a.top)}
window.addEventListener('scroll',()=>{if(key){anchor=capture();persist()}},{passive:true});
export function html(content:string){
 let raw=content.replace(/^\s*id::[^\n]*(?:\n|$)/gm,'');
 if(workObject(raw)?.type==='miniproject')raw=raw.replace(/(^[^\n]*?)\s#MiniProject(?=\s|$)/,'$1');
 raw=raw.replace(/^[\t ]+(```[^\n]*)(?=\n)/,'$1');
 let output=DOMPurify.sanitize(marked.parse(raw,{gfm:true,breaks:true}) as string,{FORBID_TAGS:['img','iframe','style','input','button'],FORBID_ATTR:['style']});
 output=output.replace(/^(<p>)?(TODO|DOING|NOW|LATER|WAITING|DONE|CANCELED)\s+/,'$1<span class="task">$2</span>');
 output=output.replace(/(<p>|<\/span>)(?:<strong>)?(?:\[(现状|问一下|注|想法|决定|等待|MiniProject|事务|任务|项目卡片|核心输出|阶段性目标|事项)\]|【(现状|问一下|注|想法|决定|等待|MiniProject|事务|任务|项目卡片|核心输出|阶段性目标|事项)】)(?:<\/strong>)?\s*/,'$1<span class="label">$2$3</span>');
 output=output.replace(/^<p><strong>\[([^\]\n]{1,24})\]<\/strong>\s*/,'<p><span class="label">$1</span>');
 return output;
}
export function organize(next:any[]){items=next;render(latest,locateFn);persist()}
export function reveal(uuid:string){expandedBodies.add(uuid);let i=items.findIndex(x=>x.uuid===uuid),depth=items[i]?.depth;for(let j=i-1;j>=0;j--)if(items[j].depth<depth){collapsed.delete(items[j].uuid);depth=items[j].depth}selected=uuid;render(latest,locateFn);views.get(uuid)?.element.scrollIntoView({block:'nearest'});persist()}
// ---- Agent-facing structured view state. Reads/writes presentation only; never touches source text. ----
function subtreeEnd(list:any[],i:number){let end=i+1;while(end<list.length&&list[end].depth>list[i].depth)end++;return end}
function validTree(list:any[]){
 if(!Array.isArray(list)||!list.length)return 'empty-layout';
 if(list[0].depth!==0)return 'root-depth-must-be-0';
 const seen=new Set<string>();
 for(let i=0;i<list.length;i++){const it=list[i];
  if(typeof it?.uuid!=='string'||!it.uuid)return 'uuid-required';
  if(seen.has(it.uuid))return 'duplicate-uuid:'+it.uuid;seen.add(it.uuid);
  if(!Number.isInteger(it.depth)||it.depth<0)return 'bad-depth:'+it.uuid;
  if(i===0&&it.depth!==0)return 'root-depth-must-be-0';
  if(i>0&&(it.depth<1||it.depth>list[i-1].depth+1))return 'invalid-nesting:'+it.uuid;
 }
 return null
}
export function getViewState(){
 const s=latest;if(!s)return null;
 const source=new Map((s.rows??[]).map((x:any)=>[x.uuid,x]));
 return {graph:s.graph??'',root:s.root,page:s.page??'',instance:s.instance,seq:s.seq,kind:s.kind,
  draft:s.draft??null,focus:s.focus??null,selected,collapsed:[...collapsed],anchor,
  objectUuid:s.objectUuid??null,objectChain:s.objectChain??[],autoFollow:s.autoFollow!==false,held:s.held??null,
  displayOverrides:{...displayOverrides},
  items:items.map((x:any)=>({...x})),
  blocks:items.map((x:any)=>{const r:any=source.get(x.uuid)??{uuid:x.uuid,content:'来源暂不可用',missing:true};
   const p=r.missing?null:parse(r.content??'');
   return {display:{...displayLevel(r.content??'',displayOverrides[x.uuid],{root:x.uuid===s.root,missing:r.missing}),override:displayOverrides[x.uuid]??'auto',expanded:expandedBodies.has(x.uuid)},uuid:x.uuid,content:r.content??'',missing:!!r.missing,outside:!!r.outside,sourceParent:r.sourceParent??null,sourceDepth:r.depth??null,role:p?.role??null,task:p?.task??null,kind:p?.kind??'unknown',editing:s.draft===x.uuid};})};
}
export function applyViewOp(op:any){
 if(!latest)return {ok:false,reason:'no-view'};
 const type=op?.type;
 if(type==='display'){
  if(!items.some(x=>x.uuid===op.uuid))return {ok:false,reason:'uuid-not-in-view'};
  if(!levels.includes(op.level))return {ok:false,reason:'invalid-display-level'};
  if(op.level==='auto')delete displayOverrides[op.uuid];else displayOverrides[op.uuid]=op.level;
  expandedBodies.delete(op.uuid);render(latest,locateFn);persist();return {ok:true,state:getViewState()};
 }

 if(type==='focus'){if(!items.some((x:any)=>x.uuid===op.uuid))return {ok:false,reason:'uuid-not-in-view'};selected=op.uuid;if(op.reveal)reveal(op.uuid);else{render(latest,locateFn);persist()}return {ok:true,selected}}
 if(type==='collapse'){if(!items.some((x:any)=>x.uuid===op.uuid))return {ok:false,reason:'uuid-not-in-view'};if(op.collapsed===false)collapsed.delete(op.uuid);else collapsed.add(op.uuid);render(latest,locateFn);persist();return {ok:true,collapsed:[...collapsed]}}
 if(type==='reorder'){if(!items.some((x:any)=>x.uuid===op.uuid))return {ok:false,reason:'uuid-not-in-view'};if(!items.some((x:any)=>x.uuid===op.target))return {ok:false,reason:'target-not-in-view'};
  if(op.uuid===op.target)return {ok:false,reason:'uuid-equals-target'};
  if(op.uuid===items[0]?.uuid)return {ok:false,reason:'root-not-movable'};
  const start=items.findIndex((x:any)=>x.uuid===op.uuid);let end=start+1;while(end<items.length&&items[end].depth>items[start].depth)end++;
  const ti=items.findIndex((x:any)=>x.uuid===op.target);
  if(ti>=start&&ti<end)return {ok:false,reason:'target-inside-moved-subtree'};
  const next=move(items,op.uuid,op.target,op.mode??'before');
  if(JSON.stringify(next)===JSON.stringify(items))return {ok:false,reason:'move-had-no-effect'};
  organize(next);return {ok:true,items:items.map((x:any)=>({...x}))}}
 if(type==='indent'){if(!items.some((x:any)=>x.uuid===op.uuid))return {ok:false,reason:'uuid-not-in-view'};
  if(op.uuid===items[0]?.uuid)return {ok:false,reason:'root-not-indentable'};
  const next=indent(items,op.uuid,op.delta>0?1:-1);
  if(JSON.stringify(next)===JSON.stringify(items))return {ok:false,reason:'indent-had-no-effect'};
  organize(next);return {ok:true,items:items.map((x:any)=>({...x}))}}
 if(type==='layout'){if(op.items?.[0]?.uuid!==items[0]?.uuid)return {ok:false,reason:'root-not-movable'};const bad=validTree(op.items);if(bad)return {ok:false,reason:bad};
  const known=new Set(items.map((x:any)=>x.uuid));const unknown=op.items.filter((x:any)=>!known.has(x.uuid)).map((x:any)=>x.uuid);
  if(unknown.length)return {ok:false,reason:'uuid-not-in-view:'+unknown.slice(0,5).join(',')};
  if(op.items.length!==items.length)return {ok:false,reason:'layout-must-include-every-item:'+items.length};
  organize(op.items.map((x:any)=>({uuid:x.uuid,depth:x.depth})));return {ok:true,items:items.map((x:any)=>({...x}))}}
 if(type==='prune'){
  // Drop view references whose source block is gone: rows the plugin marked missing.
  // Keeps the focused object itself even if its source is temporarily unreadable.
  const missing=new Set((latest?.rows??[]).filter((x:any)=>x.missing).map((x:any)=>x.uuid));
  const keep=items.filter((x:any)=>!missing.has(x.uuid)||x.uuid===latest?.root);
  if(keep.length===items.length)return {ok:false,reason:'nothing-to-prune',debug:{missing:missing.size,rows:(latest?.rows??[]).length,items:items.length}};
  const removed=items.length-keep.length;
  organize(keep.map((x:any)=>({uuid:x.uuid,depth:x.depth})));
  return {ok:true,removed,items:items.map((x:any)=>({...x}))}}
 return {ok:false,reason:'unknown-op:'+String(type)};
}
// Breadcrumb contains work objects only. Ordinary source ancestors remain traversable.
function renderCrumbs(s:Snapshot){
 let bar=document.getElementById('crumbs');
 if(!bar){bar=document.createElement('nav');bar.id='crumbs';}
 document.querySelector('header')!.append(bar);
 const signature=JSON.stringify([s.root,s.objectChain,s.held]);
 if(bar.dataset.signature===signature)return;bar.dataset.signature=signature;
 bar.replaceChildren();bar.hidden=false;
 const chain=s.objectChain??[];
 for(const [i,node] of chain.entries()){
  if(i>0){const sep=document.createElement('span');sep.className='crumb-sep';sep.textContent='›';bar.append(sep)}
  const current=node.uuid===s.root,canEnter=!current&&!!latestHandlers.onCrumb,el=document.createElement(canEnter?'button':'span');
  el.className='crumb'+(current?' current':'');el.textContent=node.title;
  el.title=current?'当前对象':'提升到：'+node.title;
  if(canEnter)(el as HTMLButtonElement).onclick=()=>latestHandlers.onCrumb?.(node.uuid);
  bar.append(el);
 }
 if(s.held){const hint=document.createElement('span');hint.className='scope-hint';hint.textContent=s.held==='explicit'?'临时范围':'保持此范围';bar.append(hint);
  if(latestHandlers.onResume){const resume=document.createElement('button');resume.className='crumb';resume.textContent='恢复自动聚焦';resume.onclick=()=>latestHandlers.onResume?.();bar.append(resume);}}
 if(chain.length<=1&&!s.held)bar.hidden=true;
 bar.dataset.focused=s.root??'';
}
export function render(s:Snapshot,locate?:(uuid:string)=>void,handlers?:RenderHandlers){
 if(s.instance===lastInstance&&s.seq<lastSeq)return;lastInstance=s.instance;lastSeq=s.seq;
 latest=s;locateFn=locate;if(handlers)latestHandlers=handlers;const newKey='work-view:v1:'+JSON.stringify([s.graph??'unknown',s.root]);
 let savedAnchor=capture();
 if(key!==newKey){key=newKey;views.clear();rows.replaceChildren();let saved:any={};try{saved=JSON.parse(localStorage.getItem(key)??'{}')}catch{}displayOverrides=savedLevels(saved.displayOverrides);expandedBodies=new Set(saved.expandedBodies??[]);rawBodies.clear();items=Array.isArray(saved.items)?saved.items:[];collapsed=new Set(saved.collapsed??[]);selected=saved.selected??'';anchor=saved.anchor;savedAnchor=anchor;lastReveal=0;}
 const before=JSON.stringify(items);items=!items.length&&workObject(s.rows[0]?.content)?continuingLayout(s.rows,parse):reconcile(items,s.rows);if(before!==JSON.stringify(items))persist();
 const source=new Map(s.rows.map(x=>[x.uuid,x]));let hiddenDepth:number|null=null,previous:HTMLElement|null=null;
 for(const [index,item] of items.entries()){
  const r=source.get(item.uuid)??{uuid:item.uuid,content:'来源暂不可用',depth:item.depth,missing:true};let v=views.get(r.uuid);
  if(!v){const element=document.createElement('div');element.className='row';element.dataset.uuid=r.uuid;element.tabIndex=0;
   const handle=document.createElement('button');handle.className='handle';handle.textContent='⠿';handle.draggable=true;handle.title='拖动排序；向右拖动成为子项';handle.setAttribute('aria-label','拖动条目');
   const dot=document.createElement('button');dot.className='dot';dot.setAttribute('aria-label','折叠或展开');
   const body=document.createElement('div');body.className='body';const go=document.createElement('button');go.className='go';go.textContent='↗';go.title='在 Logseq 定位原文';go.setAttribute('aria-label','定位原文');const enter=document.createElement('button');enter.className='enter-object';enter.textContent='进入';enter.title='以此对象进入工作视图';enter.onclick=e=>{e.stopPropagation();latestHandlers.onEnter?.(r.uuid)};element.append(handle,dot,body,go,enter);const controls=document.createElement('div');controls.className='display-controls';
   const level=document.createElement('select');level.setAttribute('aria-label','展示级别');
   for(const [value,label] of [['auto','自动'],['emphasis','强调'],['normal','正常'],['quiet','弱化'],['compact','压缩']]){const option=document.createElement('option');option.value=value;option.textContent=label;level.append(option)}
   level.onclick=e=>e.stopPropagation();level.onchange=()=>applyViewOp({type:'display',uuid:r.uuid,level:level.value});
   const raw=document.createElement('button');raw.textContent='原始文本';raw.onclick=e=>{e.stopPropagation();rawBodies.has(r.uuid)?rawBodies.delete(r.uuid):rawBodies.add(r.uuid);render(latest,locateFn)};
   controls.append(level,raw);
   const expand=document.createElement('button');expand.className='expand-body';expand.onclick=e=>{e.stopPropagation();expandedBodies.has(r.uuid)?expandedBodies.delete(r.uuid):expandedBodies.add(r.uuid);render(latest,locateFn);persist()};
   const original=document.createElement('pre');original.className='raw-body';
   element.append(expand,controls,original);
   v={element,body,dot,handle,enter,level,controls,expand,original,content:'\0'};views.set(r.uuid,v);
   handle.draggable=false;
   let dropTarget='',dropMode='before';
   const clear=()=>{document.querySelectorAll('.dragging,.drop-before,.drop-child,.drop-after').forEach(x=>x.classList.remove('dragging','drop-before','drop-child','drop-after'));dragged='';dropTarget='';};
   handle.addEventListener('pointerdown',(e:PointerEvent)=>{if(handle.disabled)return;e.preventDefault();e.stopPropagation();dragged=r.uuid;startX=e.clientX;handle.setPointerCapture(e.pointerId);element.classList.add('dragging');finishDrag=(up:PointerEvent)=>{const target=document.elementFromPoint(up.clientX,up.clientY)?.closest<HTMLElement>('.row');if(target){dropTarget=target.dataset.uuid!;dropMode=up.clientX-startX>24?'child':up.clientY>target.getBoundingClientRect().top+target.offsetHeight/2?'after':'before';selected=r.uuid;organize(move(items,r.uuid,dropTarget,dropMode));persist()}clear()}});
   handle.addEventListener('pointermove',(e:PointerEvent)=>{if(dragged!==r.uuid)return;e.preventDefault();const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('.row');if(!target)return;dropTarget=target.dataset.uuid!;dropMode=e.clientX-startX>24?'child':e.clientY>target.getBoundingClientRect().top+target.offsetHeight/2?'after':'before';document.querySelectorAll('.drop-before,.drop-child,.drop-after').forEach(x=>x.classList.remove('drop-before','drop-child','drop-after'));target.classList.add('drop-'+dropMode);document.getElementById('foot')!.textContent=dropMode==='child'?'放到此条目下方，成为视图子项':'放到此条目'+(dropMode==='before'?'前面':'后面')});
   handle.addEventListener('pointercancel',clear);
   dot.onclick=()=>{collapsed.has(r.uuid)?collapsed.delete(r.uuid):collapsed.add(r.uuid);render(latest,locateFn);persist()};
   element.addEventListener('click',()=>{selected=r.uuid;render(latest,locateFn);persist()});
   go.onclick=e=>{e.stopPropagation();selected=r.uuid;locateFn?.(r.uuid);render(latest,locateFn);persist()};body.ondblclick=()=>locateFn?.(r.uuid);
   element.addEventListener('keydown',e=>{if((e.target as HTMLElement).closest('button,select,pre'))return;if(e.key==='Tab'){e.preventDefault();organize(indent(items,r.uuid,e.shiftKey?-1:1));element.focus({preventScroll:true})}if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const i=items.findIndex(x=>x.uuid===r.uuid);if(e.key==='ArrowUp'&&i>1)organize(move(items,r.uuid,items[i-1].uuid,'before'));if(e.key==='ArrowDown'){let j=i+1;while(j<items.length&&items[j].depth>items[i].depth)j++;if(j<items.length)organize(move(items,r.uuid,items[j].uuid,'after'))}}});
  }
  if(v.element.parentElement!==rows||v.element.previousElementSibling!==previous){if(previous)previous.after(v.element);else rows.prepend(v.element)}previous=v.element;
  v.element.style.setProperty('--depth',String(item.depth));v.element.dataset.depth=String(item.depth);v.element.dataset.sourceDepth=String(r.depth);v.element.dataset.role=parse(r.content).kind;
  v.element.classList.toggle('root',index===0);v.element.classList.toggle('draft',s.draft===r.uuid);v.element.classList.toggle('source-focus',s.focus===r.uuid);v.element.classList.toggle('selected',selected===r.uuid);v.element.classList.toggle('missing',!!r.missing);v.element.classList.toggle('outside',!!r.outside);
  v.handle.draggable=false;v.handle.disabled=index===0;v.enter.hidden=index===0||!workObject(r.content)||!latestHandlers.onEnter;
  const content=r.missing?'来源暂不可用 · 保留此位置':r.content;
  if(v.content!==content){v.body.innerHTML=html(content);v.content=content}v.element.title=r.outside?'原文已移出初始范围，仍引用同一块':r.missing?'原块已删除或暂不可读；恢复同一 UUID 后自动回来':'Tab 缩进 · Shift+Tab 提升 · Alt+↑↓ 排序';
  const display=displayLevel(content,displayOverrides[r.uuid],{root:index===0,missing:r.missing});
  v.element.dataset.display=display.level;v.level.value=displayOverrides[r.uuid]??'auto';v.level.title=display.reason;
  const compact=display.level==='compact',expanded=expandedBodies.has(r.uuid);
  v.body.classList.toggle('body-compressed',compact&&!expanded);
  v.expand.hidden=!compact;v.expand.textContent=expanded?'收起正文':`展开全文 · ${content.length} 字符`;
  v.expand.setAttribute('aria-expanded',String(expanded));
  v.original.hidden=!rawBodies.has(r.uuid);if(v.original.textContent!==content)v.original.textContent=content;
  if(hiddenDepth!==null&&item.depth<=hiddenDepth)hiddenDepth=null;v.element.hidden=hiddenDepth!==null;
  const children=items[index+1]?.depth>item.depth;v.dot.textContent=children?(collapsed.has(r.uuid)?'▸':'▾'):'·';v.dot.disabled=!children;
  if(collapsed.has(r.uuid)&&hiddenDepth===null)hiddenDepth=item.depth;
 }
 restore(savedAnchor);
 renderCrumbs(s);
 const topLocate=document.getElementById('locate') as HTMLButtonElement;topLocate.onclick=()=>s.root&&locateFn?.(s.root);
 const closeButton=document.getElementById('close') as HTMLButtonElement;if(latestHandlers.onClose)closeButton.onclick=latestHandlers.onClose;
 const status=document.getElementById('status')!;status.dataset.kind=s.kind;status.textContent=s.error??`${s.draft?'编辑中':'正文同步'} · ${items.length} 条`;status.title=s.page??'';
 const hiddenFocus=s.focus&&views.get(s.focus)?.element.hidden;const fb=document.getElementById('focus') as HTMLButtonElement;fb.hidden=!s.focus;fb.disabled=!s.focus;fb.textContent=!s.focus?'选择原文可在此定位':hiddenFocus?'展开并定位正在编辑的条目':'定位正在编辑的条目';fb.onclick=()=>s.focus&&reveal(s.focus);
 if(s.reveal&&s.reveal.nonce!==lastReveal){lastReveal=s.reveal.nonce;queueMicrotask(()=>reveal(s.reveal!.uuid))}
 requestAnimationFrame(()=>{document.documentElement.dataset.renderedSeq=String(s.seq);document.documentElement.dataset.renderedAt=String(Date.now())});
}
