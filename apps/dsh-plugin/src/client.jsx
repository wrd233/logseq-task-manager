import { applyHistoryClient } from './structure-history/client.jsx';
import { applyEvidenceClient } from './work-evidence/client.jsx';
import { SingleFlight } from './single-flight.mjs';
/* global window, document, AbortController, setInterval, clearInterval, setTimeout, clearTimeout, URLSearchParams, crypto */
import { createPlanner } from './planner.jsx';
import { plannerStyles } from './planner-styles.mjs';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { styles, discoveryStyles } from './styles.mjs';
import { workbenchStyles } from './work-experience/styles.mjs';
import { createWorkbench } from './work-experience/workbench.jsx';
import { readerReferenceSource, readerReferenceCodec } from './reader-draft.mjs';
import { inboxReferenceSource, inboxReferenceCodec } from './personal-inbox/reference.mjs';
import { createPersonalInbox } from './personal-inbox/client.jsx';
import { personalInboxStyles } from './personal-inbox/styles.mjs';
import { workFocus } from './work-experience/focus-store.mjs';
import { workKey } from '@task-copilot/contracts';

export const inject = ['connection', 'slots', 'sidebarRight', 'sidebarRightTabs', 'conversation', 'uiWorkspace', 'sessions', 'inputTriggers'];
const errorText = error => ({
  SESSION_NOT_BOUND: '先关联此会话的 Logseq 工作目录。', WORKSPACE_NOT_BOUND: '此目录没有 Logseq 连接。请在 Logseq 关联目录并允许 agent 连接当前工作。',
  WORKSPACE_OFFLINE: 'Logseq 工作连接已离线，请在 Logseq 重新连接。', CONNECTION_STALE: '连接已改变，请在 Logseq 重新连接。',
  DESCRIPTOR_STALE: '本地服务已重启，请在 Logseq 重新允许连接。', WORK_SCOPE_CHANGED: '目录对应的工作已改变，请重新关联。',
  ENOENT: '没有找到工作目录或本地连接。', FILE_UNAVAILABLE: '文件已失联或不可用，请刷新列表。',
  INPUT_BUSY: '输入框正在提交，请稍后再引用。', BINDING_CHANGED: '会话关联已改变，请重新读取。',
  SESSION_CWD_MISMATCH: '会话目录与工作目录不同。原对话和输入已保留，请在工作目录新开对话。',
  SESSION_WORK_CONFLICT: '此会话已属于另一件工作，请新开工作对话。',
  WORK_REF_MISMATCH: '连接来源与此会话工作不一致，请在 Logseq 对目标工作显式只读重连。',
  SCOPE_MISMATCH: '来源范围不一致，已停止读取。',
  DSH_HANDOFF_EXPIRED: '这次协作入口已过期，请在 Logseq 再点一次 DSH 协作。',
}[error?.code] ?? '暂时无法读取，请检查本地服务与 Logseq 连接。');

export function apply(ctx) {
  applyHistoryClient(ctx);
  applyEvidenceClient(ctx);
  const style = document.createElement('style');
  style.textContent = styles + discoveryStyles + plannerStyles + workbenchStyles + personalInboxStyles;
  document.head.append(style);
  const rows = new Map(), listeners = new Set();
  let disposed = false, handoff = null, handoffController = null, toast = null, toastTimer = null;
  const emit = () => { for (const listener of listeners) listener(); };
  const rpc = async (method, payload, signal) => {
    const answer = await ctx.connection.rpc.call('/api', `logseq-workbench/${method}`, payload, signal);
    if (!answer.ok) throw Object.assign(Error(answer.error.message), { code: answer.error.code, details: answer.error.details });
    return answer.value;
  };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const get = sessionId => rows.get(sessionId) ?? empty;
  const empty = Object.freeze({ status: null, view: null, files: [], fileTruncation: [], filesLoaded:false, error: null, busy: false, opening: [], revision: 0 });
  const update = (sessionId, patch) => { rows.set(sessionId, { ...get(sessionId), ...patch }); emit(); };
  const flash = (text, tone = 'ok') => {
    toast = { text, tone };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = null; emit(); }, 3200);
    emit();
  };
  const openWorkTabSoon = () => setTimeout(() => { try { ctx.sidebarRight.openTab('work'); } catch { /* The next session's sidebar may still be minting. */ } }, 60);
  // Public owner snapshot changes only for on-screen navigation, not data refreshes.
  let navigationQueue = Promise.resolve();
  let lastMounted;
  const observeNavigation = (force = false) => {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot();
    if (!force && sessionId === lastMounted) return;
    lastMounted = sessionId;
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
    if (get(sessionId).busy) return false;
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
      if (disposed) return false;
      if (ctx.sidebarRight.mounted.getSnapshot() !== result.sessionId) ctx.uiWorkspace.openSession(result.sessionId);
      clearHandoff();
      if (method !== 'general') openWorkTabSoon();
      if (method === 'newWork') {
        newOperations.delete(sessionId);
        if (result.bound !== false) flash('已新建此工作对话。');
      }
      if (result.warnings?.length) flash('已进入对话；辅助引用尚未保存，可稍后重试。', 'error');
      return true;
    } catch (error) {update(sessionId, {error}); return false;}
    finally {update(sessionId, {busy: false});}
  }
  async function enterWork(work, operations) {
    handoffController?.abort();
    await navigationQueue;
    const key = workKey(work.workRef);
    if (!operations.has(key)) operations.set(key, crypto.randomUUID());
    const result = await rpc('enterWork', {workRef: work.workRef, operationId: operations.get(key)});
    await ctx.sessions.refresh();
    if (disposed) return;
    if (ctx.sidebarRight.mounted.getSnapshot() !== result.sessionId) ctx.uiWorkspace.openSession(result.sessionId);
    clearHandoff();
    openWorkTabSoon();
    return result;
  }
  async function enterHandoff() {
    if(!handoff || disposed)return;
    handoffController?.abort(); const controller = handoffController = new AbortController();
    const ticket=handoff.ticket;
    handoff={...handoff,busy:true,error:null};emit();
    try {
      await navigationQueue;
      const result=await rpc('handoff',{ticket},controller.signal);
      if(disposed||controller.signal.aborted)return;
      await ctx.sessions.refresh();if(disposed||controller.signal.aborted)return;
      if(ctx.sidebarRight.mounted.getSnapshot() !== result.sessionId) ctx.uiWorkspace.openSession(result.sessionId);
      openWorkTabSoon();
      clearHandoff();
      flash(result.warnings?.length ? '已进入这件工作；辅助引用尚未保存。' : '已恢复这件工作的最近对话。', result.warnings?.length ? 'error' : 'ok');
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
        const status=await rpc('status',{sessionId},controller.signal);
        if(get(sessionId).revision!==revision)return;update(sessionId,{status});
        if(status.cwdMismatch)throw Object.assign(Error('SESSION_CWD_MISMATCH'),{code:'SESSION_CWD_MISMATCH'});
        const value=kind==='files'||status.bound?await rpc(kind==='files'?'files':'read',{sessionId},controller.signal):null;
        if(!disposed && get(sessionId).revision===revision)update(sessionId,kind==='files'
          ? {files:value?.files??[],fileTruncation:value?.fileTruncation??[],filesLoaded:true,fileError:null,fileWarning:value?.warning??null,filesReadAt:Date.now()}
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
      const first=setTimeout(reread,kind==='files'?150:0);
      const timer=setInterval(reread,kind==='files'?15000:5000);
      window.addEventListener('focus',reread);
      return ()=>{clearTimeout(first);clearInterval(timer);window.removeEventListener('focus',reread);};
    },[sessionId,active,kind]);
    return row;
  }
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
  function WorkHeader() {
    return <button type="button" className="lq-header" aria-label="打开当前工作" title="当前工作、原文与结构" onClick={openWorkTabSoon}>◈ 工作</button>;
  }
  function PlannerHeader() {
    return <button type="button" className="lq-header" aria-label="打开时间规划" onClick={() => ctx.sidebarRight.openTab('semantic-planner')}>◷ 规划</button>;
  }
  function InboxHeader() {
    return <button type="button" className="lq-header" aria-label="打开个人收集箱" onClick={() => ctx.sidebarRight.openTab('personal-inbox')}>▤ 收集箱</button>;
  }
  function RowAction({ sessionId }) {
    const mounted = useSyncExternalStore(listener => ctx.sidebarRight.mounted.subscribe(listener), () => ctx.sidebarRight.mounted.getSnapshot(), () => undefined);
    if (sessionId !== mounted) return null;
    return <button type="button" className="lq-row-action" aria-label="查看此会话的当前工作" onClick={event => { event.stopPropagation(); openWorkTabSoon(); }}>◈</button>;
  }
  function Files(props) {
    const tab = props.useTabInfo();
    const row = useRow(props.sessionId, tab.tab.visible, 'files'), [menu, setMenu] = useState(null);
    useEffect(() => tab.tab.actions.bindCommands({ refresh: () => { void refresh(props.sessionId,'files'); } }), [props.sessionId, tab.tab.actions]);
    useEffect(() => { setMenu(null); }, [props.sessionId]);
    let previous = '';
    return <section className="lq-files" aria-label="Logseq 工作文件"><div className="lq-file-title"><span>{row.view?.title ?? 'Logseq 工作文件'}</span><button type="button" aria-label="打开工作目录" onClick={() => { void openFile(props.sessionId, 'directory'); }} disabled={row.opening.includes('directory')}>↗</button></div>
      {row.fileWarning ? <p className="lq-muted">Logseq 来源暂不可用；当前会话目录文件 · 读取于 {new Date(row.filesReadAt).toLocaleTimeString()}。关联材料需重新连接。</p> : null}
      {row.fileError ? <p className="lq-error" role="status">{errorText(row.fileError)}</p> : null}
      {row.status && !row.status.bound ? <button type="button" className="lq-link" onClick={() => ctx.sidebarRight.openTab('work')}>关联 Logseq 工作</button> : null}
      {row.notice ? <p className="lq-muted" role="status">{row.notice}</p> : null}
      {row.files.map(file => { const group = previous !== file.group ? <h3>{file.group}</h3> : null; previous = file.group; return <React.Fragment key={file.key}>{group}<div className="lq-file-row"><button type="button" className="lq-file-open" title={file.relativePath} disabled={file.availability !== 'available'||row.opening.includes(file.key)} aria-busy={row.opening.includes(file.key)} onClick={() => { setMenu(null); void openFile(props.sessionId, file.key); }}><span aria-hidden="true">▤</span><span>{file.name}</span>{row.opening.includes(file.key)?<small className="lq-opening" role="status">正在打开…</small>:null}</button><button type="button" className="lq-more" aria-label={`${file.name}的更多操作`} aria-expanded={menu === file.key} onClick={() => setMenu(menu === file.key ? null : file.key)}>···</button></div>{menu === file.key ? <div className="lq-file-menu"><button type="button" disabled={row.opening.includes(file.key)} onClick={() => { setMenu(null); void openFile(props.sessionId, file.key); }}>外部打开</button><button type="button" disabled={row.opening.includes(file.key)} onClick={() => { setMenu(null); void openFile(props.sessionId, file.key, true); }}>在访达显示</button><Quote sessionId={props.sessionId} inputActions={props.inputActions} item={{ file: file.key, path: file.relativePath, materialId: file.materialId, version: file.version }} /></div> : null}</React.Fragment>; })}
      {!row.filesLoaded&&!row.fileError?<p className="lq-muted">正在读取文件列表…</p>:null}{row.filesLoaded && !row.files.length ? <p className="lq-muted">此工作暂无文件。</p> : null}{row.fileTruncation.length ? <p className="lq-muted">部分文件或目录暂未列出，请检查权限或范围限制。</p> : null}
    </section>;
  }
  function HandoffHost() {
    const entry = useSyncExternalStore(subscribe, () => handoff, () => null);
    const message = useSyncExternalStore(subscribe, () => toast, () => null);
    if (!entry && !message) return null;
    if (entry) return <section className={`wx-toast${entry.error ? ' is-error' : ''}`} role="status" aria-label="进入 DSH 协作">
      <span>{entry.busy ? '正在进入这件工作的最近对话…' : errorText(entry.error)}</span>
      {!entry.busy && entry.error?.code==='SESSION_CWD_MISMATCH'&&entry.error.details?.sessionId?<button type="button" onClick={()=>{void navigate('newWork',entry.error.details.sessionId);}}>在正确目录新建</button>:null}
      {!entry.busy?<button type="button" onClick={()=>{void enterHandoff();}}>重试</button>:null}
      {!entry.busy?<button type="button" onClick={()=>{handoffController?.abort();handoff=null;emit();}}>关闭</button>:null}
    </section>;
    return <section className={`wx-toast${message.tone === 'error' ? ' is-error' : ''}`} role="status"><span>{message.text}</span></section>;
  }
  const focusWork = (sessionId, uuid) => { workFocus.request(sessionId, uuid); openWorkTabSoon(); };
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '@', name: readerReferenceSource, showGroupTitle: false,
    candidates: async () => [], onPick: () => 'handled', codec: readerReferenceCodec,
  }));
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '@', name: inboxReferenceSource, showGroupTitle: false,
    candidates: async () => [], onPick: () => 'handled', codec: inboxReferenceCodec,
  }));
  const insertReference = (sessionId, reference, span) => ctx.sessions.using(sessionId, {source: 'controllerOperation'}, async retained => {
    const binding = await retained.ready;
    return binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', {reference, span}) === true;
  });
  const Workbench = createWorkbench({ ctx, rpc, refresh, invalidate, navigate, enterWork, insertReference });
  const Planner = createPlanner({ rpc, focusWork });
  const Inbox = createPersonalInbox({rpc, insertReference, onOpenPlanner: () => ctx.sidebarRight.openTab('semantic-planner'),
    onOpenSession: async sessionId => {await ctx.sessions.refresh();if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) ctx.uiWorkspace.openSession(sessionId);openWorkTabSoon();} });
  ctx.effect(() => ctx.sidebarRightTabs.register({id:'@task-copilot/personal-inbox',kind:'personal-inbox',title:()=>'收集箱',priority:'extension',keepMounted:true,guide:[{id:'personal-inbox',order:320,title:()=>'个人收集箱'}]}));
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: '@task-copilot/work', kind: 'work', title: () => '工作', priority: 'extension', keepMounted: true, guide: [{ id: 'work', order: 300, title: () => '当前工作' }] }));
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: '@task-copilot/semantic-planner', kind: 'semantic-planner', title: () => '时间规划', priority: 'extension', keepMounted: true, guide: [{ id: 'semantic-planner', order: 330, title: () => '个人时间规划' }] }));
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: '@task-copilot/dsh-logseq-workbench', kind: 'logseq-files', title: () => '工作文件', priority: 'extension', guide: [{ id: 'logseq-files', order: 350, title: () => 'Logseq 工作文件' }] }));
  const register = (slot, spec, component) => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...spec }, component));
  register('conversation.session.header.utilities', { id: '@task-copilot/work', order: 9 }, WorkHeader);
  register('conversation.session.header.utilities', { id: 'semantic-planner', order: 10 }, PlannerHeader);
  register('conversation.session.header.utilities', { id: 'personal-inbox', order: 11 }, InboxHeader);
  register('sidebar.workspaces.session.row.action', { id: '@task-copilot/work', order: 100 }, RowAction);
  register('shell.overlay', { id: 'logseq-workbench' }, HandoffHost);
  register('sidebar.right.pane.tab', { key: '@task-copilot/work' }, Workbench);
  register('sidebar.right.pane.tab', { key: '@task-copilot/dsh-logseq-workbench' }, Files);
  register('sidebar.right.pane.tab', { key: '@task-copilot/semantic-planner' }, Planner);
  register('sidebar.right.pane.tab', {key:'@task-copilot/personal-inbox'}, Inbox);
  window.addEventListener('hashchange',readHandoff);readHandoff();
  const pendingHandoff = new AbortController();
  // A waiting RPC survives background timer throttling. Retry timers are only needed after disconnection.
  let handoffRetry;
  const checkHandoff = async () => {
    try {
      const {ticket} = await rpc('handoff-pending', {}, pendingHandoff.signal);
      if (disposed || pendingHandoff.signal.aborted) return;
      if (ticket) {
        handoff = {ticket, busy: true};
        emit();
        await enterHandoff();
        window.focus();
      }
      if (!disposed) void checkHandoff();
    } catch {
      if (!disposed && !pendingHandoff.signal.aborted) handoffRetry = setTimeout(checkHandoff, 1000);
    }
  };
  void checkHandoff();
  ctx.on('dispose', () => { pendingHandoff.abort(); clearTimeout(handoffRetry); clearTimeout(toastTimer); });
  ctx.on('dispose', () => { disposed = true; stopNavigation(); window.removeEventListener('focus', observeFocus); document.removeEventListener('visibilitychange', observeFocus); handoffController?.abort();window.removeEventListener('hashchange',readHandoff);style.remove(); for (const request of pending.values()) request.controller.abort(); pending.clear(); listeners.clear(); rows.clear(); workFocus.dispose(); });
  ctx.on('connection/reset', () => { for (const sessionId of rows.keys()) invalidate(sessionId); if(handoff&&!handoff.busy)void enterHandoff(); });
}
