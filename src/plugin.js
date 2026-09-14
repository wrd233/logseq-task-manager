import TurndownService from 'turndown';
import {gfm} from 'turndown-plugin-gfm';
import DOMPurify from 'dompurify';
import {desktopIO} from './desktop-io.js';
import {DocumentStore, normalizeRoot, isLong, makeLink, idFrom, restoreCapture, ConflictError} from './core.js';

const $ = id => document.getElementById(id);
let host, io, store, graph, current = null, editor, base = '', canonical = '', dirty = false;
let composing = false, suppress = false, visible = false, stopping = false, saving = null;
let epoch = 0, pollBusy = false, stableExternal = null, saveTimer, pollTimer, saveFailures=0;
let width = 500, captureBusy = false;
let editorRecordId=null, inputUntil=0;
const td = new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced'}); td.use(gfm);
const skippedEvents = new WeakSet();
const cleanups = [];
const stats = {startedAt:new Date().toISOString(), captures:0, externalUpdates:0, saves:0, restores:0, errors:[]};
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error',error); }
function fail(error) { const msg = String(error?.message || error); stats.errors.push(msg); if(stats.errors.length>20)stats.errors.shift(); status(msg,true); console.error('[longdoc]',error); }
function draftKey(id=current?.id) { return `longdoc:draft:${graph}:${id}`; }
function refreshDirty() { if(current&&editor&&editorRecordId===current.id&&!suppress)dirty=editor.getValue()!==canonical; }
function preserveDraft() { refreshDirty();if(current&&editor&&dirty) { try { localStorage.setItem(draftKey(), JSON.stringify({text:editor.getValue(),base,at:Date.now()})); } catch { status('草稿缓存空间不足，请勿关闭未保存的文档',true); } } }
function retireDraft() { localStorage.removeItem(draftKey());canonical=editor.getValue();dirty=false; }
function restoreLocalDraft(disk) {
  const raw=localStorage.getItem(draftKey());if(!raw)return;
  try {
    const d=JSON.parse(raw);
    if(typeof d.text!=='string'||typeof d.base!=='string')throw Error('invalid draft');
    if(d.text===disk){localStorage.removeItem(draftKey());return;}
    suppress=true;editor.setValue(d.text,true);suppress=false;dirty=true;
    // Preserve the version this draft was actually based on, including across
    // reloads. Rebasing it onto disk here would silently authorize overwrites.
    base=d.base;
    if(d.base===disk){status('已恢复草稿，正在保存…');saveTimer=setTimeout(()=>save().catch(fail),900);}
    else{$('conflict').hidden=false;status('草稿与外部版本不同，两个版本均已保留',true);}
  }catch{suppress=false;status('草稿记录暂不可读，原记录已保留',true);}
}
function layout(open) {
  const styleId = 'longdoc-layout'; let css=host.document.getElementById(styleId);
  if(!css){css=host.document.createElement('style');css.id=styleId;host.document.head.append(css);}
  css.textContent = open ? `#main-content-container{margin-left:${width}px!important}#left-sidebar{display:none!important}` : '';
  logseq.setMainUIInlineStyle({position:'fixed',left:'0',right:'auto',top:'48px',bottom:'0',width:`${width}px`,height:'calc(100vh - 48px)',zIndex:60,background:'#fafbf8',borderRight:'1px solid #cbd5cb',boxShadow:'2px 0 9px #0000000c'});
}
async function show() {
  if(!visible){width=Number(logseq.settings.width)||Math.round(host.innerWidth*.45);visible=true;}
  width=Math.max(320,Math.min(width,host.innerWidth-300)); layout(true); logseq.showMainUI({autoFocus:false});
}
async function close() { preserveDraft();void save().catch(()=>{});visible=false;layout(false);logseq.hideMainUI({restoreEditingCursor:true}); }
async function ensureStore() {
  const g=(await logseq.App.getCurrentGraph())?.path;
  if(!g)throw Error('请先打开本地文件 Graph');
  const root=normalizeRoot(logseq.settings.directory,g);
  if(!store||graph!==g||store.root!==root){graph=g;store=new DocumentStore(io,root);await store.init();}
  return store;
}
function buttons() { $('more').hidden=!current;$('library').hidden=!current;$('hint').hidden=!current;for(const id of ['external','restore','source'])$(id).disabled=!current;$('restore').disabled=!current?.sourceUuid;$('source').disabled=!current?.sourceUuid;$('more').open=false; }
async function library() {
  preserveDraft();void save().catch(()=>{});epoch++;current=null;dirty=false;buttons();$('conflict').hidden=true;
  $('editor').hidden=true;$('list').hidden=false;$('title').textContent='长文档库';await show();await search();
}
let searchEpoch=0;
async function search() {
  const ticket=++searchEpoch;
  try { const s=await ensureStore(), items=await s.search($('search').value,graph);if(ticket!==searchEpoch)return;
    $('results').replaceChildren();
    for(const item of items){const b=document.createElement('button');b.className='document';b.textContent=item.title.replace(/[*`]/g,'');const sub=document.createElement('small');sub.textContent=item.snippet.replace(/[#*`>|]/g,'').replace(/\s+/g,' ');b.append(sub);b.onclick=()=>openDoc(item.id).catch(fail);$('results').append(b);}
    if(!items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=$('search').value?'没有找到匹配的文档。':'把长文字粘贴到 Logseq 块中，就会自动收纳到这里。';$('results').append(empty);}
    $('status').title=s.root;status(`${items.length} 篇文档 · 保存在 Graph 外`);
  } catch(e){fail(e);}
}
function setEditor(text) {
  suppress=true;editor.setValue(text,true);canonical=editor.getValue();editorRecordId=current.id;dirty=false;inputUntil=0;
  queueMicrotask(()=>{suppress=false;});
}
async function openDoc(id,force=false) {
  if(!force&&current?.id===id&&editor){await show();return;}
  preserveDraft();void save().catch(()=>{});const ticket=++epoch;const s=await ensureStore();
  const [record,text]=await Promise.all([s.record(id),s.read(id)]);if(ticket!==epoch)return;
  current=record;base=text;stableExternal=null;dirty=false;saveFailures=0;$('title').textContent=record.title.replace(/[*`]/g,'');$('title').title=record.title;$('status').title=s.file(id);
  $('list').hidden=true;$('editor').hidden=false;$('conflict').hidden=true;await show();
  if(!editor){await new Promise(resolve=>{
    editor=new window.Vditor('editor',{height:'100%',mode:'ir',value:text,cdn:new URL('vditor',location.href).href,
      cache:{enable:false},toolbar:['headings','bold','italic','link','list','quote','code','table','|','undo','redo','edit-mode'],
      preview:{markdown:{sanitize:true},hljs:{enable:false}},counter:{enable:false},
      input:()=>{if(suppress||!current)return;saveFailures=0;dirty=editor.getValue()!==canonical;preserveDraft();status(dirty?'正在编辑…':'已保存');clearTimeout(saveTimer);if(dirty&&!composing)saveTimer=setTimeout(()=>save().catch(fail),900);},
      after:()=>resolve()
    });
  });}
  if(ticket!==epoch)return;setEditor(text);buttons();status('已保存');
  restoreLocalDraft(text);
}
async function save() {
  if(saving)return saving;
  refreshDirty();
  if(!current||!dirty||composing||!$('conflict').hidden)return;
  const ticket=epoch,id=current.id,text=editor.getValue(),s=store,expected=base;
  preserveDraft();status('保存中…');
  saving=(async()=>{try{await s.save(id,expected,text);stats.saves++;saveFailures=0;
      if(ticket===epoch){base=text;canonical=text;dirty=editor.getValue()!==text;if(!dirty)localStorage.removeItem(draftKey(id));else preserveDraft();status(dirty?'新输入等待保存…':'已保存');}
    }catch(e){saveFailures++;if(ticket===epoch){preserveDraft();if(e instanceof ConflictError){$('conflict').hidden=false;status(e.message,true);}else fail(e);}throw e;
    }finally{saving=null;if(dirty&&saveFailures<3&&$('conflict').hidden&&!composing&&!stopping){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>{}),1500);}}})();
  return saving;
}
async function poll() {
  if(stopping)return;
  if(visible&&current&&editor&&!pollBusy&&!saving){pollBusy=true;const ticket=epoch,id=current.id;
    try{const next=await store.read(id);if(ticket!==epoch)return;
      if(next===base){stableExternal=null;return;}
      if(stableExternal!==next){stableExternal=next;return;}
      refreshDirty();
      if(dirty||composing){preserveDraft();$('conflict').hidden=false;status('外部文件已更新；当前输入已保留',true);return;}
      // Vditor's input callback is delayed by undoDelay (800ms). Paste may also
      // await clipboard conversion. Do not replace the DOM during that window.
      if(Date.now()<inputUntil)return;
      const scroll=$('editor').querySelector('.vditor-ir')?.scrollTop||0;base=next;setEditor(next);stats.externalUpdates++;
      const pane=$('editor').querySelector('.vditor-ir');if(pane)pane.scrollTop=scroll;status('已同步外部修改');
    }catch(e){if(ticket===epoch)fail(e);}finally{pollBusy=false;}
  }
}
async function restore(record=current) {
  if(!record?.sourceUuid)throw Error('此文档没有可恢复的来源块');
  if(graph!==record.graph)throw Error('请切换回这篇文档的来源 Graph');
  const editing=await logseq.Editor.checkEditing();
  const block=await logseq.Editor.getBlock(record.sourceUuid);if(!block)throw Error('来源块暂不可用；文档和捕获原文已保留');
  const content=editing===record.sourceUuid?await logseq.Editor.getEditingBlockContent():block.content;
  const restored=restoreCapture(content,record);
  await logseq.Editor.updateBlock(record.sourceUuid,restored);stats.restores++;status('已恢复粘贴原文；外部文档仍保留');
  await close();await logseq.Editor.editBlock(record.sourceUuid);
}
function replay(target,data) {
  if(!target.isConnected)throw Error('编辑位置已关闭，原始粘贴保存在恢复记录中');
  const e=new host.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});skippedEvents.add(e);target.dispatchEvent(e);
}
function insertNative(target,start,end,text) {
  target.focus();target.setSelectionRange(start,end);
  // Chromium's editing command preserves its native textarea undo history.
  const ok=host.document.execCommand('insertText',false,text);
  if(!ok)throw Error('原生编辑器拒绝插入，已保留文件和原始文本');
}
async function capture(event,target,plain,html) {
  const snapshot={value:target.value,start:target.selectionStart,end:target.selectionEnd,uuid:target.closest('.ls-block')?.getAttribute('blockid')};
  const data=event.clipboardData;const pendingKey=`longdoc:pending:${crypto.randomUUID()}`;
  let record;
  try{
    localStorage.setItem(pendingKey,JSON.stringify({...snapshot,plain,html,at:Date.now()}));
    // Logseq may expose its internal copy format only through the async clipboard API.
    const items=await host.navigator.clipboard.read().catch(()=>[]);
    if(items.some(x=>x.types.includes('web application/logseq'))){replay(target,data);localStorage.removeItem(pendingKey);return;}
    const s=await ensureStore();const graphAtStart=graph;
    if(!snapshot.uuid)throw Error('无法确认粘贴所属的块');
    let markdown=plain;
    if(html&& !/^\s{0,3}(#{1,6}\s|```|~~~)/m.test(plain)){markdown=td.turndown(DOMPurify.sanitize(html));if(!markdown.trim())markdown=plain;}
    record=await s.create(markdown,{graph:graphAtStart,sourceUuid:snapshot.uuid,original:plain,originalHTML:html});
    const still=(await logseq.App.getCurrentGraph())?.path;
    if(still!==graphAtStart||!target.isConnected||target.value!==snapshot.value||target.selectionStart!==snapshot.start||target.selectionEnd!==snapshot.end||host.document.activeElement!==target){
      logseq.UI.showMsg('长文已保存；编辑位置发生变化，可从「长文档库」打开','warning');return;
    }
    insertNative(target,snapshot.start,snapshot.end,makeLink(record));stats.captures++;localStorage.removeItem(pendingKey);
    // Capture is silent: do not steal focus or open a pane.
  }catch(e){fail(e);logseq.UI.showMsg('长文收纳未完成，原文已保留','warning');
    if(!record&&target.isConnected&&target.value===snapshot.value&&host.document.activeElement===target){replay(target,data);localStorage.removeItem(pendingKey);}
  }finally{captureBusy=false;}
}
function onPaste(event) {
  if(skippedEvents.has(event)||!logseq.settings.enabled||captureBusy)return;
  const target=event.target;
  if(!target?.matches?.('textarea')||!target.closest('.block-editor'))return;
  const data=event.clipboardData;if(!data||data.files.length||[...data.types].some(t=>t.includes('logseq')))return;
  const plain=data.getData('text/plain');if(!isLong(plain,logseq.settings.minChars,logseq.settings.minLines))return;
  const before=target.value.slice(0,target.selectionStart);if((before.match(/^\s*(```|~~~)/gm)||[]).length%2)return;
  event.preventDefault();event.stopImmediatePropagation();captureBusy=true;
  void capture(event,target,plain,data.getData('text/html'));
}
function onClick(event) {
  if(event.button!==0)return;
  const anchor=event.target?.closest?.('a,[data-href]');if(!anchor)return;
  const id=idFrom(anchor.getAttribute('href')||anchor.getAttribute('data-href'));if(!id)return;
  event.preventDefault();event.stopImmediatePropagation();openDoc(id).catch(fail);
}
async function diagnostic(notify=true) {
  await ensureStore();await store.verified(`${store.root}/.longdoc/diagnostic.json`,JSON.stringify({ ...stats,graph,root:store.root,hostAccess:!!host.document,bridge:typeof host.apis?.doAction,current:current?.id,dirty,visible },null,2));
  if(notify)logseq.UI.showMsg('长文档诊断已写入文档目录/.longdoc/diagnostic.json','success');
}
logseq.useSettingsSchema([
  {key:'enabled',type:'boolean',default:true,title:'自动收纳长文本',description:'仅接管外部文本粘贴；撤销收纳可从文档菜单执行'},
  {key:'directory',type:'string',default:'/Users/wangrundong/Documents/Logseq长文档',title:'Graph 外的文档目录',description:'独立 Markdown 文件与历史快照存放位置'},
  {key:'minChars',type:'number',default:2000,title:'字符阈值',description:'一次粘贴达到此长度时收纳'},
  {key:'minLines',type:'number',default:30,title:'非空行阈值',description:'一次粘贴达到此行数时收纳'}
]);
logseq.ready(async()=>{
  try{
    host=window.parent;if(!host?.document||!host.apis?.doAction)throw Error('当前环境没有可用的桌面文件桥接');
    const call=(...args)=>host.apis.doAction(args);
    io=desktopIO(call,()=>graph);
    await ensureStore();width=Number(logseq.settings.width)||Math.round(host.innerWidth*.43);
    logseq.provideModel({openLongdoc:()=>library().catch(fail)});
    logseq.App.registerUIItem('toolbar',{key:'longdoc-library',template:'<a class="button" data-on-click="openLongdoc" title="长文档库">📄</a>'});
    logseq.App.registerCommandPalette({key:'library',label:'长文档：打开文档库'},()=>library().catch(fail));
    logseq.App.registerCommandPalette({key:'diagnostic',label:'长文档：写入诊断记录'},()=>diagnostic().catch(fail));
    logseq.Editor.registerBlockContextMenuItem('长文档：打开',async({uuid})=>{const b=await logseq.Editor.getBlock(uuid);const id=idFrom(b?.content);if(id)await openDoc(id);});
    logseq.Editor.registerBlockContextMenuItem('长文档：撤销收纳，恢复原文',async({uuid})=>{try{const b=await logseq.Editor.getBlock(uuid),id=idFrom(b?.content);if(id)await restore(await store.record(id));}catch(e){fail(e);logseq.UI.showMsg(String(e.message),'warning');}});
    const createTestPage=async()=>{
      await close();
      const title=`长文档验收 ${new Date().toISOString().replace(/[:.]/g,'-')}`;
      const page=await logseq.Editor.createPage(title,{}, {redirect:false});
      const block=await logseq.Editor.appendBlockInPage(page.name,'在下一块粘贴测试 Markdown：');
      const blank=await logseq.Editor.insertBlock(block.uuid,'',{sibling:true});
      logseq.App.pushState('page',{name:page.name});await logseq.Editor.editBlock(blank.uuid);
    };
    logseq.App.registerCommandPalette({key:'test-page',label:'长文档：创建独立验收页面'},createTestPage);
    host.document.addEventListener('paste',onPaste,true);host.document.addEventListener('click',onClick,true);host.document.addEventListener('mousedown',onClick,true);
    const launcher=host.document.createElement('button');launcher.id='longdoc-launcher';launcher.textContent='长文档';launcher.title='打开长文档库';launcher.style.cssText='position:fixed;left:155px;top:9px;z-index:70;border:1px solid #cdd8cc;border-radius:6px;background:#f4f7f1;color:#34513c;padding:4px 10px;font-size:12px;cursor:pointer';launcher.onclick=()=>library().catch(fail);host.document.body.append(launcher);
    $('library').onclick=()=>library().catch(fail);$('close').onclick=close;
    $('format').onclick=()=>{const on=document.body.classList.toggle('formatting');$('format').textContent=on?'隐藏格式工具':'显示格式工具';$('format').setAttribute('aria-pressed',String(on));$('more').open=false;};
    document.addEventListener('click',e=>{if(!e.target.closest('#more'))$('more').open=false;});
    $('search').oninput=()=>search();$('restore').onclick=()=>restore().catch(fail);
    $('external').onclick=async()=>{if(!current)return;$('more').open=false;try{await host.apis.openPath(store.file(current.id));}catch(e){fail(e);}};
    $('source').onclick=async()=>{if(!current?.sourceUuid)return;const b=await logseq.Editor.getBlock(current.sourceUuid);if(!b)return fail(Error('来源块已删除'));const p=await logseq.Editor.getPage(b.page.id);logseq.Editor.scrollToBlockInPage(p.originalName||p.name,b.uuid);};
    $('copy').onclick=async()=>{try{const text=editor.getValue();const doc=await store.create(text,{graph,original:text,title:current.title+' · 草稿副本',recoveredFrom:current.id});retireDraft();await openDoc(doc.id);status('草稿已另存为独立副本');}catch(e){fail(e);}};
    $('reload').onclick=async()=>{try{const id=current.id,text=editor.getValue();await store.create(text,{graph,original:text,title:current.title+' · 草稿副本',recoveredFrom:id});retireDraft();await openDoc(id,true);status('已加载外部版本 · 草稿副本可在文档库找回');}catch(e){fail(e);}};
    document.addEventListener('compositionstart',()=>{composing=true;clearTimeout(saveTimer);});document.addEventListener('compositionend',()=>{composing=false;if(dirty)saveTimer=setTimeout(()=>save().catch(fail),900);});
    for(const type of ['beforeinput','input','paste'])$('editor').addEventListener(type,()=>{if(!suppress)inputUntil=Date.now()+1500;},true);
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();save().catch(fail);}});
    $('resize').onpointerdown=e=>{const target=e.currentTarget;target.setPointerCapture(e.pointerId);const move=x=>{width=Math.max(320,Math.min(host.innerWidth-300,x.clientX));layout(true);};const end=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);logseq.updateSettings({width});};target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);};
    $('resize').onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();width=Math.max(320,Math.min(host.innerWidth-300,width+(e.key==='ArrowRight'?32:-32)));layout(true);logseq.updateSettings({width});};
    const resize=()=>{if(visible){width=Math.max(320,Math.min(width,host.innerWidth-300));layout(true);}};host.addEventListener('resize',resize);cleanups.push(()=>host.removeEventListener('resize',resize));
    cleanups.push(logseq.App.onCurrentGraphChanged(()=>{preserveDraft();epoch++;current=null;dirty=false;store=null;close();}));
    pollTimer=setInterval(()=>poll().catch(fail),650);buttons();
    logseq.beforeunload(()=>{stopping=true;preserveDraft();clearInterval(pollTimer);clearTimeout(saveTimer);host.document.removeEventListener('paste',onPaste,true);host.document.removeEventListener('click',onClick,true);host.document.removeEventListener('mousedown',onClick,true);host.document.getElementById('longdoc-layout')?.remove();launcher.remove();for(const off of cleanups)if(typeof off==='function')off();});
    await diagnostic(false);
  }catch(e){fail(e);logseq.UI.showMsg(`长文档启动失败：${e.message}`,'error');}
});
