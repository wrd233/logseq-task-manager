import { WorkDiscovery } from './discovery.jsx';
import { workKey } from '@task-copilot/contracts';
import { applyHistoryClient } from './structure-history/client.jsx';
import { applyEvidenceClient } from './work-evidence/client.jsx';
import { SingleFlight } from './single-flight.mjs';
/* global window, document, AbortController, setInterval, clearInterval, setTimeout, clearTimeout, URLSearchParams, crypto */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { styles, readingStyles, workSwitchStyles, discoveryStyles } from './styles.mjs';
import { renderMarkdown } from '../../logseq-plugin/src/features/work-view/markdown.ts';
import { reportProjection } from '../../logseq-plugin/src/features/work-view/report-body.ts';

export const inject = ['connection', 'slots', 'sidebarRight', 'sidebarRightTabs', 'conversation', 'uiWorkspace', 'sessions'];
const errorText = error => ({
  SESSION_NOT_BOUND: '先关联此会话的 Logseq 工作目录。', WORKSPACE_NOT_BOUND: '此目录没有 Logseq 连接。请在 Logseq 关联目录并允许 agent 连接当前工作。',
  WORKSPACE_OFFLINE: 'Logseq 工作连接已离线，请在 Logseq 重新连接。', CONNECTION_STALE: '连接已改变，请在 Logseq 重新连接。',
  DESCRIPTOR_STALE: '本地服务已重启，请在 Logseq 重新允许连接。', WORK_SCOPE_CHANGED: '目录对应的工作已改变，请重新关联。',
  ENOENT: '没有找到工作目录或本地连接。', FILE_UNAVAILABLE: '文件已失联或不可用，请刷新列表。',
  INPUT_BUSY: '输入框正在提交，请稍后再引用。', BINDING_CHANGED: '会话关联已改变，请重新读取。',
  SESSION_CWD_MISMATCH: '会话目录与工作目录不同。原对话和输入已保留，请在工作目录新开对话。',
  SESSION_WORK_CONFLICT: '此会话已属于另一件工作，请新开工作对话。',
  DSH_HANDOFF_EXPIRED: '这次协作入口已过期，请在 Logseq 再点一次 DSH 协作。',
}[error?.code] ?? '暂时无法读取，请检查本地服务与 Logseq 连接。');

export function apply(ctx) {
  applyHistoryClient(ctx);
  applyEvidenceClient(ctx);
  const style = document.createElement('style'); style.textContent = styles + readingStyles + workSwitchStyles + discoveryStyles; document.head.append(style);
  const rows = new Map(), listeners = new Set();
  let overlay = null, disposed = false, handoff = null, handoffController = null;
  const emit = () => { for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const get = sessionId => rows.get(sessionId) ?? empty;
  const empty = Object.freeze({ status: null, view: null, files: [], fileTruncation: [], filesLoaded:false, error: null, busy: false, opening: [], revision: 0 });
  const update = (sessionId, patch) => { rows.set(sessionId, { ...get(sessionId), ...patch }); emit(); };
  const rpc = async (method, payload, signal) => {
    const answer = await ctx.connection.rpc.call('/api', `logseq-workbench/${method}`, payload, signal);
    if (!answer.ok) throw Object.assign(Error(answer.error.message), { code: answer.error.code });
    return answer.value;
  };
  // Public owner snapshot changes only for on-screen navigation, not data refreshes.
  let navigationQueue = Promise.resolve();
  let lastMounted, navigationGeneration = 0;
  const observeNavigation = (force = false) => {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot();
    if (!force && sessionId === lastMounted) return;
    lastMounted = sessionId; navigationGeneration++;
    if (document.visibilityState === 'hidden') return;
    if (sessionId) navigationQueue = navigationQueue.catch(() => {}).then(() => rpc('opened', {sessionId})).catch(error => {
      if (!disposed) update(sessionId, {error});
    });
  };
  const stopNavigation = ctx.sidebarRight.mounted.subscribe(() => observeNavigation());
  observeNavigation();
  const observeFocus = () => observeNavigation(true);
  window.addEventListener('focus', observeFocus);
  document.addEventListener('visibilitychange', observeFocus);
  const newOperations = new Map();
  function clearHandoff() {
    handoffController?.abort(); handoff=null;
    const hash=new URLSearchParams(window.location.hash.slice(1));hash.delete('logseq-work');
    window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search+(hash.size?`#${hash}`:''));
    emit();
  }
  async function navigate(method, sessionId) {
    const navigation = ++navigationGeneration;
    if (get(sessionId).busy) return;
    handoffController?.abort();
    update(sessionId, {busy: true, error: null});
    try {
      await navigationQueue;
      let payload = {};
      if (method === 'newWork') {
        if (!newOperations.has(sessionId)) newOperations.set(sessionId, crypto.randomUUID());
        payload = {sessionId, operationId: newOperations.get(sessionId)};
      }
      const result = await rpc(method, payload);
      await ctx.sessions.refresh();
      if (disposed || navigation !== navigationGeneration) return;
      ctx.uiWorkspace.openSession(result.sessionId);
      clearHandoff();
      if (method === 'newWork') {newOperations.delete(sessionId); if(result.bound !== false) show(result.sessionId);}
      else close();
      if (result.warnings?.length) update(result.sessionId,{referencePending:true,notice:'已进入原生会话；辅助引用尚未保存。'});
      return true;
    } catch (error) {update(sessionId, {error}); return false;}
    finally {update(sessionId, {busy: false});}
  }
  async function enterHandoff() {
    if(!handoff || disposed)return;
    handoffController?.abort(); const controller = handoffController = new AbortController();
    const ticket=handoff.ticket, navigation = ++navigationGeneration;
    handoff={...handoff,busy:true,error:null};emit();
    try {
      await navigationQueue;
      const result=await rpc('handoff',{ticket},controller.signal);
      if(disposed||controller.signal.aborted)return;
      await ctx.sessions.refresh();if(disposed||controller.signal.aborted)return;
      if(navigation !== navigationGeneration)return;
      ctx.uiWorkspace.openSession(result.sessionId);show(result.sessionId,true);
      update(result.sessionId,{referencePending:!!result.warnings?.length,notice:result.warnings?.length ? "已进入原生会话；辅助引用尚未保存，可重试。" : null});
      clearHandoff();
    }catch(error){if(!controller.signal.aborted&&!disposed){handoff={ticket,busy:false,error};emit();}}
  }
  function readHandoff(){
    const ticket=new URLSearchParams(window.location.hash.slice(1)).get('logseq-work');
    if(ticket && ticket!==handoff?.ticket){handoff={ticket,busy:true};emit();void enterHandoff();}
  }
  const pending = new Map();
  async function refresh(sessionId, kind = 'source') {
    const key = `${sessionId}:${kind}`;
    if (disposed || pending.has(key)) return pending.get(key)?.promise;
    const controller = new AbortController(), revision = get(sessionId).revision;
    const promise = (async () => {
      try {
        let status=get(sessionId).status;
        if(!status){status=await rpc('status',{sessionId},controller.signal);if(get(sessionId).revision!==revision)return;update(sessionId,{status});}
        const value=status.bound?await rpc(kind==='files'?'files':'read',{sessionId},controller.signal):null;
        if(!disposed && get(sessionId).revision===revision)update(sessionId,kind==='files'
          ? {files:value?.files??[],fileTruncation:value?.fileTruncation??[],filesLoaded:true,fileError:null}
          : {view:value,error:null,...(!status.bound?{notice:null}:{})});
      }catch(error){
        // Keep the last successful content visible while it updates; it is not Agent authority.
        if(!controller.signal.aborted&&!disposed&&get(sessionId).revision===revision)update(sessionId,kind==='files'?{fileError:error}:{error});
      }finally{if(pending.get(key)?.controller===controller)pending.delete(key);}
    })();
    pending.set(key,{promise,controller});return promise;
  }
  function cancelReads(sessionId) {
    for(const [key,request] of pending)if(key.startsWith(`${sessionId}:`)){request.controller.abort();pending.delete(key);}
  }
  function invalidate(sessionId) {
    cancelReads(sessionId);
    update(sessionId,{revision:get(sessionId).revision+1,status:null,view:null,files:[],filesLoaded:false,opening:[],fileError:null,error:null,notice:null});
  }
  function useRow(sessionId, active = false, kind = 'source') {
    const row=useSyncExternalStore(subscribe,()=>get(sessionId),()=>empty);
    useEffect(()=>{
      if(!active)return;
      const reread=()=>{if(document.visibilityState!=='hidden')void refresh(sessionId,kind);};
      // Give the initial source request the first turn; a directory scan cannot delay first paint.
      const first=setTimeout(reread,kind==='files'?150:0);
      const timer=setInterval(reread,kind==='files'?15000:5000);
      window.addEventListener('focus',reread);
      return ()=>{clearTimeout(first);clearInterval(timer);window.removeEventListener('focus',reread);};
    },[sessionId,active,kind]);
    return row;
  }
  function show(sessionId,files=false) { overlay = { sessionId, files }; emit(); void refresh(sessionId); }
  function close() { overlay = null; emit(); }
  const fileActions=new SingleFlight(1200);
  function openFile(sessionId,key,reveal=false) {
    const action=JSON.stringify([sessionId,get(sessionId).revision,key,reveal]);
    const revision=get(sessionId).revision;
    return fileActions.run(action,async()=>{
      update(sessionId,{opening:[...get(sessionId).opening,key],fileError:null,notice:null});
      try{await rpc('open',{sessionId,key,reveal});if(get(sessionId).revision===revision)update(sessionId,{notice:reveal?'已在访达显示。':'已交给系统打开。'});}
      catch(error){if(get(sessionId).revision===revision)update(sessionId,{fileError:error,notice:null});}
      finally{if(get(sessionId).revision===revision)update(sessionId,{opening:get(sessionId).opening.filter(value=>value!==key)});}
    });
  }
  function Quote({ sessionId, inputActions, item, title = '引用到对话' }) {
    return <button type="button" className="lq-link" onClick={() => {
      const row = get(sessionId);
      if (!row.view) return;
      const text = `[Logseq 引用 ${JSON.stringify({ binding: row.view.binding, ...item })}]\n`;
      const span = inputActions.captureInsertion();
      if (!inputActions.insertText(text, span)) update(sessionId, { error: { code: 'INPUT_BUSY' } });
    }}>{title}</button>;
  }
  function Header(props) {
    const row = useRow(props.sessionId, true);
    return <button type="button" className="lq-header" aria-label="查看关联的 Logseq 工作" onClick={() => {
      show(props.sessionId); ctx.sidebarRight.openTab('logseq-files');
    }}>↗ Logseq{row.view ? <span className="lq-dot" aria-label="已关联" /> : null}</button>;
  }
  function WorkSwitch({sessionId}) {
    const row = useRow(sessionId), [open, setOpen] = useState(false), [title, setTitle] = useState('');
    useEffect(() => {
      let active = true;
      if(sessionId) void rpc('status', {sessionId}).then(status => {if (active && !disposed) update(sessionId, {status});}).catch(error => {if(active && !disposed) update(sessionId,{error});});
      void rpc('catalog', {}).then(catalog => {if(active) setTitle(catalog.graphs.flatMap(graph => graph.works).find(work => row.status?.workRef && workKey(work.workRef) === workKey(row.status.workRef))?.title ?? '');}).catch(()=>{});
      return () => {active=false;};
    },[sessionId,row.revision,row.status?.workRef && workKey(row.status.workRef)]);
    useEffect(() => {
      const key = event => {if((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'k') {event.preventDefault(); setOpen(value=>!value);}};
      window.addEventListener('keydown',key); return ()=>window.removeEventListener('keydown',key);
    },[]);
    const enterWork = async (work, operations) => {
      const navigation = ++navigationGeneration; handoffController?.abort();
      await navigationQueue;
      const key = workKey(work.workRef);
      if(!operations.has(key)) operations.set(key, crypto.randomUUID());
      const result = await rpc('enterWork', {workRef:work.workRef, operationId:operations.get(key)});
      await ctx.sessions.refresh();
      if(disposed || navigation !== navigationGeneration) return;
      ctx.uiWorkspace.openSession(result.sessionId); clearHandoff(); close();
    };
    return <><nav className="lq-work-switch" aria-label="工作与通用对话">
      <button type="button" className="lq-switch-trigger" aria-label="搜索和切换工作" aria-haspopup="dialog" aria-expanded={open} title="搜索工作 ⌘⇧K" onClick={()=>setOpen(true)}><span aria-hidden="true">⌕</span><span>{row.status?.workRef ? title || '当前工作' : 'General'}</span><span aria-hidden="true">⌄</span></button>
      {row.status?.workRef ? <><button type="button" disabled={row.busy} onClick={() => {void navigate('newWork',sessionId);}}>新建此工作对话</button><button type="button" onClick={() => show(sessionId)}>查看工作</button></> : null}
    </nav>{open ? <WorkDiscovery rpc={rpc} currentRef={row.status?.workRef} onEnter={enterWork} onGeneral={async()=>{if(!await navigate('general',sessionId)) throw Error('GENERAL_NAVIGATION_FAILED');}} onClose={()=>setOpen(false)}/> : null}</>;
  }

  function RowAction({ sessionId }) {
    const mounted = useSyncExternalStore(listener => ctx.sidebarRight.mounted.subscribe(listener), () => ctx.sidebarRight.mounted.getSnapshot(), () => undefined);
    if (sessionId !== mounted) return null;
    return <button type="button" className="lq-row-action" aria-label="查看此会话的 Logseq 工作" onClick={event => { event.stopPropagation(); show(sessionId); }}>↗</button>;
  }
  function Binding({ sessionId, row }) {
    const [directory, setDirectory] = useState('');
    return <form className="lq-binding" onSubmit={async event => {
      event.preventDefault(); invalidate(sessionId); update(sessionId, { busy: true });
      try {
        await rpc('bind', { sessionId, directory: directory.trim() || row.status?.cwd || '' });
        await refresh(sessionId);
      } catch (error) { update(sessionId, { error }); }
      finally { update(sessionId, { busy: false }); }
    }}><label htmlFor={`lq-directory-${sessionId}`}>Logseq 工作目录</label><input id={`lq-directory-${sessionId}`} value={directory} onChange={event => setDirectory(event.target.value)} placeholder={row.status?.cwd ?? '/工作目录'} disabled={row.busy} /><button type="submit" disabled={row.busy}>关联当前会话</button><p>使用已在 Logseq 允许连接的工作目录。</p></form>;
  }
  async function selectReading(sessionId, selection) {
    cancelReads(sessionId);
    const revision = get(sessionId).revision + 1;
    update(sessionId, { revision, busy: true, opening: [], error: null });
    try {
      const view = await rpc('select', { sessionId, ...selection });
      if (get(sessionId).revision === revision) update(sessionId, { view });
    } catch (error) { if (get(sessionId).revision === revision) update(sessionId, { error }); }
    finally { if (get(sessionId).revision === revision) update(sessionId, { busy: false }); }
  }
  function ReadingBody({ sessionId, inputActions, view }) {
    const [selection,setSelection]=useState(null);
    useEffect(()=>setSelection(null),[view.version]);
    const selectedText=()=>{
      const selected=window.getSelection();
      const element=selected?.anchorNode?.parentElement?.closest('[data-source-id]');
      const end=selected?.focusNode?.parentElement?.closest('[data-source-id]');
      const text=selected?.toString().trim();
      setSelection(text&&element===end?{text:text.slice(0,4000),sourceId:element?.dataset.sourceId}:null);
    };
    const blocks = new Map(view.blocks.map(block => [block.sourceId, block]));
    const reading = view.reading, files=get(sessionId).files;
    const block = (id, context = false) => {
      const value = blocks.get(id); if (!value) return null;
      const projection = reportProjection(value.content ?? '来源暂不可用');
      return <div key={id} className="lq-block" data-source-id={id} style={!reading?.document && reading?.mode === 'structure' ? { marginInlineStart: Math.min(value.depth, 6) * 10 } : undefined}>
        {projection.label || projection.task ? <span className="lq-marker">{[projection.task, projection.label].filter(Boolean).join(' · ')}</span> : null}
        <div className="lq-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(projection.markdown) }} />
        {!context ? <span className="lq-block-action"><Quote sessionId={sessionId} inputActions={inputActions} item={{ sourceId: id, contentVersion: value.contentVersion }} title="引用" /></span> : null}
      </div>;
    };
    const context = ids => ids?.length ? <aside className="lq-reading-context"><span>来源上下文</span>{ids.map(id => block(id, true))}</aside> : null;
    const unit = value => <section key={value.key} className="lq-reading-unit" data-reading-unit={value.key}>
      {value.title ? <h3>{value.title}</h3> : null}{context(value.contextSourceIds)}
      {value.sourceIds?.map(id => block(id))}{value.children?.map(unit)}
      {value.columns?.map(column => <section key={column.key} className="lq-reading-unit"><h3>{column.title}</h3>{context(column.contextSourceIds)}{column.children.map(unit)}</section>)}
      {value.materialId ? <button type="button" className="lq-reading-material" onClick={() => { void openFile(sessionId, files.find(file => file.materialId === value.materialId)?.key ?? `material:${value.materialId}`); }}>{files.find(file => file.materialId === value.materialId)?.name ?? '打开关联材料'}</button> : null}
    </section>;
    return <div onMouseUp={selectedText} onKeyUp={selectedText} className={`lq-body ${reading?.mode === 'structure' ? 'lq-structure' : ''}`}>{selection?<div className="lq-selection-action"><Quote sessionId={sessionId} inputActions={inputActions} item={{sourceId:selection.sourceId,contentVersion:blocks.get(selection.sourceId)?.contentVersion,selectedText:selection.text}} title="引用选中文字" /></div>:null}{reading?.document ? reading.document.map(unit) : view.blocks.map(value => block(value.sourceId))}</div>;
  }
  function WorkPanel({ sessionId, inputActions }) {
    const row = useRow(sessionId, true), [more, setMore] = useState(false);
    return <section className="lq-source" aria-label="关联的 Logseq 原文"><header><span>Logseq 阅读</span><div>{row.view ? <a href={row.view.logseqUrl} aria-label="在 Logseq 打开原文">↗</a> : null}<button type="button" aria-label="更多工作操作" onClick={() => setMore(!more)}>···</button><button type="button" aria-label="收起 Logseq 原文" onClick={close}>×</button></div></header>
      {row.notice ? <p className="lq-muted" role="status">{row.notice}{row.referencePending ? <button type="button" onClick={async()=>{try{await rpc('reference',{sessionId});update(sessionId,{referencePending:false,notice:'辅助引用已保存。'});}catch(error){update(sessionId,{error});}}}>重试保存引用</button> : null}</p> : null}
      {more ? <div className="lq-source-menu"><button type="button" onClick={() => { void refresh(sessionId); setMore(false); }}>刷新阅读</button><button type="button" onClick={() => { ctx.sidebarRight.openTab('logseq-files'); setMore(false); }}>工作文件</button>{row.view?.reading?.plans.find(plan => plan.planId === row.view.reading.activePlanId)?.canRestore ? <button type="button" disabled={row.busy} onClick={() => { void selectReading(sessionId, { planId: row.view.reading.activePlanId, restore: true }); setMore(false); }}>恢复当前读法上一版</button> : null}{row.status?.bound ? <button type="button" disabled={row.busy} onClick={async () => {
        invalidate(sessionId); update(sessionId, { busy: true });
        try { await rpc('unbind', { sessionId }); await refresh(sessionId); }
        catch (error) { update(sessionId, { error }); } finally { update(sessionId, { busy: false }); }
      }}>解除此会话关联</button> : null}</div> : null}
      {row.error ? <p className="lq-error" role="status">{errorText(row.error)}{row.view ? ` · 上次成功读取：${row.view.capturedAt}` : ''}</p> : null}{row.view?.warnings?.length ? <p className="lq-muted">辅助来源暂不可读；正文已保留。</p> : null}
      {!row.status ? <p className="lq-muted">正在检查工作连接…</p> : !row.status.bound ? <Binding sessionId={sessionId} row={row} /> : row.view ? <><h2>{row.view.title}</h2>{row.view.reading ? <><div className="lq-reading-picker"><select aria-label="当前工作读法" disabled={row.busy} value={row.view.reading.selectedPlanId ? `plan:${row.view.reading.selectedPlanId}` : `mode:${row.view.reading.mode ?? 'report'}`} onChange={event => {
        const value = event.target.value; void selectReading(sessionId, value.startsWith('mode:') ? { mode: value.slice(5) } : { planId: value.slice(5) });
      }}><option value="mode:report">连续阅读</option><option value="mode:structure">原结构</option>{row.view.reading.plans.map(plan => <option key={plan.planId} value={`plan:${plan.planId}`} disabled={plan.status !== 'current'}>{plan.name}{plan.status === 'current' ? '' : ' · 需重新整理'}</option>)}</select></div><span className="lq-reading-version" title={row.error?"暂时离线，显示上次读取内容":row.view.reading.persistenceError?"读法同步保存失败":`与 Logseq 同步${row.view.reading.activePlanId?" · 读法 v"+(row.view.reading.plans.find(plan=>plan.planId===row.view.reading.activePlanId)?.revision??1):""}`}>{row.error?'离线':row.view.reading.persistenceError?'未保存':'同步'}</span></> : <p className="lq-muted">在 Logseq 打开此工作后，可同步读法。</p>}<ReadingBody sessionId={sessionId} inputActions={inputActions} view={row.view} />{row.view.truncated ? <p className="lq-muted">较长原文已截断，可在 Logseq 查看完整内容。</p> : null}</> : <p className="lq-muted">等待 Logseq 原文…</p>}
    </section>;
  }
  function Overlay(props) {
    const seat = useRef(null);
    const [reference,setReference]=useState(null);
    const current = useSyncExternalStore(subscribe, () => overlay, () => null);
    const entry = useSyncExternalStore(subscribe, () => handoff, () => null);
    const mounted = useSyncExternalStore(listener => ctx.sidebarRight.mounted.subscribe(listener), () => ctx.sidebarRight.mounted.getSnapshot(), () => undefined);
    useEffect(()=>{
      if(!current||mounted!==current.sessionId){setReference(null);return;}
      const held=ctx.sessions.retain(current.sessionId,{source:'controllerOperation'});setReference(held);
      return ()=>held.release();
    },[mounted,current?.sessionId]);
    useEffect(() => { if (current && !current.files && mounted && current.sessionId !== mounted) show(mounted); }, [mounted, current?.sessionId,current?.files]);
    useEffect(()=>{
      if(current?.files&&mounted===current.sessionId){
        ctx.sidebarRight.openTab('logseq-files');
        overlay={...current,files:false};emit();
        void ctx.sessions.using(mounted,{source:'controllerOperation'},async reference=>{const binding=await reference.ready;ctx.conversation.input.for(binding.ctx).focus();}).catch(()=>{});
      }
    },[mounted,current]);
    useEffect(() => { const escape = event => { if (event.key === 'Escape') close(); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, []);
    useEffect(() => {
      if (!current || !mounted || current.sessionId !== mounted) return;
      // The additive overlay has no public left-column geometry setter in DSH rc.2.
      // This temporary adapter uses the frame landmark and cleans up on close.
      const frame = seat.current?.closest('[data-shell-overlay]')?.parentElement;
      if (!frame?.style.gridTemplateColumns) return;
      frame.classList.add('lq-frame-open');
      return () => frame.classList.remove('lq-frame-open');
    }, [mounted, current?.sessionId,reference?.sessionId]);
    return <><WorkSwitch sessionId={mounted} />{entry ? <section className="lq-source lq-handoff" aria-label="进入 DSH 协作" role="status">
      {entry.busy?<p>正在进入此工作的 DSH 会话…</p>:<><p>{errorText(entry.error)}</p>{entry.error?.code==='SESSION_CWD_MISMATCH'?<p>可使用“新建此工作对话”，或回 Logseq 新开。</p>:null}<button type="button" onClick={()=>{void enterHandoff();}}>重试</button></>}
      {!entry.busy?<button type="button" onClick={()=>{handoffController?.abort();handoff=null;emit();}}>关闭</button>:null}
    </section>:null}{current&&mounted&&current.sessionId===mounted&&reference?.sessionId===mounted?<div ref={seat}><props.SessionProvider session={reference}>{props.renderSlot('logseq.work.source', {})}</props.SessionProvider></div>:null}</>;
  }
  function Files(props) {
    const tab = props.useTabInfo();
    const row = useRow(props.sessionId, tab.tab.visible, 'files'), [menu, setMenu] = useState(null);
    useEffect(() => tab.tab.actions.bindCommands({ refresh: () => { void refresh(props.sessionId,'files'); } }), [props.sessionId, tab.tab.actions]);
    useEffect(() => { setMenu(null); }, [props.sessionId]);
    let previous = '';
    return <section className="lq-files" aria-label="Logseq 工作文件"><div className="lq-file-title"><span>{row.view?.title ?? 'Logseq 工作文件'}</span><button type="button" aria-label="打开工作目录" onClick={() => { void openFile(props.sessionId, 'directory'); }} disabled={row.opening.includes('directory')}>↗</button></div>
      {row.fileError ? <p className="lq-error" role="status">{errorText(row.fileError)}</p> : null}
      {row.status && !row.status.bound ? <button type="button" className="lq-link" onClick={() => show(props.sessionId)}>关联 Logseq 工作</button> : null}
      {row.notice ? <p className="lq-muted" role="status">{row.notice}</p> : null}
      {row.files.map(file => { const group = previous !== file.group ? <h3>{file.group}</h3> : null; previous = file.group; return <React.Fragment key={file.key}>{group}<div className="lq-file-row"><button type="button" className="lq-file-open" title={file.relativePath} disabled={file.availability !== 'available'||row.opening.includes(file.key)} aria-busy={row.opening.includes(file.key)} onClick={() => { setMenu(null); void openFile(props.sessionId, file.key); }}><span aria-hidden="true">▤</span><span>{file.name}</span>{row.opening.includes(file.key)?<small className="lq-opening" role="status">正在打开…</small>:null}</button><button type="button" className="lq-more" aria-label={`${file.name}的更多操作`} aria-expanded={menu === file.key} onClick={() => setMenu(menu === file.key ? null : file.key)}>···</button></div>{menu === file.key ? <div className="lq-file-menu"><button type="button" disabled={row.opening.includes(file.key)} onClick={() => { setMenu(null); void openFile(props.sessionId, file.key); }}>外部打开</button><button type="button" disabled={row.opening.includes(file.key)} onClick={() => { setMenu(null); void openFile(props.sessionId, file.key, true); }}>在访达显示</button><Quote sessionId={props.sessionId} inputActions={props.inputActions} item={{ file: file.key, path: file.relativePath, materialId: file.materialId, version: file.version }} /></div> : null}</React.Fragment>; })}
      {!row.filesLoaded&&!row.fileError?<p className="lq-muted">正在读取文件列表…</p>:null}{row.filesLoaded && !row.files.length ? <p className="lq-muted">此工作暂无文件。</p> : null}{row.fileTruncation.length ? <p className="lq-muted">部分文件或目录暂未列出，请检查权限或范围限制。</p> : null}
    </section>;
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: '@task-copilot/dsh-logseq-workbench', kind: 'logseq-files', title: () => '工作文件', priority: 'extension', guide: [{ id: 'logseq-files', order: 350, title: () => 'Logseq 工作文件' }] }));
  const register = (slot, spec, component) => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...spec }, component));
  register('conversation.session.header.utilities', { id: 'logseq-workbench', order: 10 }, Header);
  register('sidebar.workspaces.session.row.action', { id: 'logseq-workbench', order: 100 }, RowAction);
  register('shell.overlay', { id: 'logseq-workbench', children: { 'logseq.work.source': { kind: 'single', scope: 'session' } } }, Overlay);
  register('logseq.work.source', { id: 'logseq-workbench' }, WorkPanel);
  register('sidebar.right.pane.tab', { key: '@task-copilot/dsh-logseq-workbench' }, Files);
  window.addEventListener('hashchange',readHandoff);readHandoff();
  ctx.on('dispose', () => { disposed = true; stopNavigation(); window.removeEventListener('focus', observeFocus); document.removeEventListener('visibilitychange', observeFocus); handoffController?.abort();window.removeEventListener('hashchange',readHandoff);style.remove(); for (const request of pending.values()) request.controller.abort(); pending.clear(); listeners.clear(); rows.clear(); });
  ctx.on('connection/reset', () => { for (const sessionId of rows.keys()) invalidate(sessionId); if (overlay) void refresh(overlay.sessionId); if(handoff&&!handoff.busy)void enterHandoff(); });
}
