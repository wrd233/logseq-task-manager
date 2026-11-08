/* global document, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame, AbortController */
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { observeCurrentStructure } from '../current-structure-client.mjs';
import { WorkDiscovery } from '../discovery.jsx';
import { insertReaderReferences } from '../reader-draft.mjs';
import { Reader } from './reader.jsx';
import { workFocus, readWorkFocus, saveWorkFocus } from './focus-store.mjs';
import {
  connectionCopy, mergeSelections, previewText,
  selectionKey, statusLabel, statusTone, workTypeLabel,
} from './model.mjs';

const errorText = error => ({
  SESSION_NOT_BOUND: '这个对话还没有关联 Logseq 工作。',
  WORKSPACE_NOT_BOUND: '这个目录还没有 Logseq 连接。',
  WORKSPACE_OFFLINE: 'Logseq 工作连接暂时不可用。',
  CONNECTION_STALE: '工作连接已变化，请重试。',
  DESCRIPTOR_STALE: 'Logseq 工作服务已更新，请重试。',
  WORK_SCOPE_CHANGED: '目录对应的工作已改变，请重新关联。',
  SESSION_CWD_MISMATCH: '当前对话目录与工作目录不一致。',
  SOURCE_OUTSIDE_SCOPE: '这些内容不在当前授权范围内。',
  REFERENCE_SOURCE_CHANGED: '内容已在 Logseq 更新，请重新选择标灰的引用。',
  REFERENCE_SELECTION_INVALID: '这次选择无法可靠引用，请重新选择。',
  INPUT_BUSY: '输入框正在提交，请稍后再加入引用。',
  STRUCTURE_FOCUS_MISSING: '这件工作已不在当前结构中。',
  REQUEST_ABORTED: '读取已取消，请重试。',
  ENOENT: '工作目录或本地连接暂时不可用。',
}[error?.code] ?? '暂时无法读取这件工作，请稍后重试。');

const timeText = value => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
};
const basename = value => typeof value === 'string' && value ? value.split('/').filter(Boolean).at(-1) ?? value : '';

function Skeleton() {
  return <div className="wx-skeleton" aria-hidden="true"><span /><span /><span /><span /></div>;
}

function StatusBadge({ status }) {
  return status ? <span className={`wx-status is-${statusTone(status)}`} title={statusLabel(status)}>{status}</span> : null;
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return <p className={`wx-notice is-${notice.tone ?? 'info'}`} role="status"><span>{notice.text}</span><button type="button" aria-label="关闭提示" onClick={onClose}>×</button></p>;
}

function Recovery({ connection, busy, workUrl, onRetry, onRebind, onChoose }) {
  const copy = connectionCopy(connection) ?? { title: '工作连接暂时不可用', body: '稍后会再试一次；你不需要重新开始。', action: 'retry' };
  return <div className="wx-recovery" role="status">
    <span className="wx-recovery-dot" aria-hidden="true" />
    <div className="wx-recovery-copy"><strong>{copy.title}</strong><p>{copy.body}</p></div>
    <div className="wx-recovery-actions">
      {copy.action === 'rebind' ? <button type="button" className="wx-button" onClick={onRebind}>重新关联</button> : null}
      <button type="button" className="wx-button" disabled={busy} onClick={onRetry}>重试</button>
      {workUrl ? <a className="wx-text" href={workUrl} target="_blank" rel="noreferrer">在 Logseq 打开</a> : null}
      <button type="button" className="wx-text" onClick={onChoose}>选择其他工作</button>
    </div>
  </div>;
}

function Onboarding({ status, busy, directory, setDirectory, error, onBind, onChoose, onRetry, waiting }) {
  return <div className="wx-onboarding">
    <div className="wx-onboarding-mark" aria-hidden="true">◈</div>
    <h2>{waiting ? '还缺一步：在 Logseq 允许只读连接' : '把一件工作带进这个对话'}</h2>
    <p>{waiting ? 'Logseq 还没有允许这个对话读取工作。允许后点重试即可继续；不会扩大权限。' : '选择一件已收录的 Logseq 工作，或直接关联这个对话所在的工作目录。阅读、结构和引用都会使用同一份工作身份。'}</p>
    <div className="wx-onboarding-actions">
      <button type="button" className="wx-button wx-button-primary" disabled={busy} onClick={onChoose}>选择一件工作</button>
      {waiting ? <button type="button" className="wx-button" disabled={busy} onClick={onRetry}>重试</button> : null}
      {status?.cwd && !waiting ? <button type="button" className="wx-button" disabled={busy} onClick={() => onBind(status.cwd)}>关联当前目录</button> : null}
    </div>
    {status?.cwd ? <p className="wx-onboarding-path" title={status.cwd}>当前对话目录 · {basename(status.cwd)}</p> : null}
    {!waiting ? <details className="wx-onboarding-more">
      <summary>关联其他目录</summary>
      <form className="wx-bind" onSubmit={event => { event.preventDefault(); onBind(directory.trim()); }}>
        <label>Logseq 工作目录<input value={directory} onChange={event => setDirectory(event.target.value)} placeholder={status?.cwd ?? '/工作目录'} disabled={busy} /></label>
        <button type="submit" className="wx-button" disabled={busy || !directory.trim()}>关联</button>
        <p>目录需要与这个对话的工作目录一致。</p>
      </form>
    </details> : null}
    {error ? <p className="wx-inline-error" role="alert">{error}</p> : null}
  </div>;
}

export function createWorkbench({ ctx, rpc, refresh, invalidate, navigate, enterWork, insertReference }) {
  return function Workbench(props) {
    const info = props.useTabInfo(), sessionId = props.sessionId, visible = info.tab.visible;
    const [status, setStatus] = useState(null), [connection, setConnection] = useState(null);
    const [structure, setStructure] = useState(null), [structureError, setStructureError] = useState(null);
    const [reader, setReader] = useState(null), [readerError, setReaderError] = useState(null);
    const [focus, setFocus] = useState(null), [view, setView] = useState('structure');
    const [loading, setLoading] = useState(true), [reload, setReload] = useState(0), [readerTick, setReaderTick] = useState(0);
    const [selected, setSelected] = useState([]), [notice, setNotice] = useState(null), [busy, setBusy] = useState(false);
    const [discovery, setDiscovery] = useState(false), [menu, setMenu] = useState(false), [confirmUnbind, setConfirmUnbind] = useState(false), [binding, setBinding] = useState(false);
    const [directory, setDirectory] = useState(''), [bindingError, setBindingError] = useState('');
    const scroll = useRef(null), scrollPositions = useRef(new Map()), menuRef = useRef(null);
    const readerVersion = useRef(null), mountedRef = useRef(true), sessionRef = useRef(sessionId);
    readerVersion.current = reader?.sourceSetVersion ?? null;
    sessionRef.current = sessionId;
    const connected = connection?.state === 'connected';
    const requestedFocus = useSyncExternalStore(workFocus.subscribe, () => workFocus.peek(sessionId), () => undefined);

    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
    useEffect(() => {
      setStatus(null); setConnection(null); setStructure(null); setStructureError(null); setReader(null); setReaderError(null);
      setFocus(readWorkFocus(sessionId)); setView('structure'); setSelected([]); setNotice(null); setLoading(true); setDiscovery(false); setMenu(false);
      setBinding(false); setBindingError(''); setDirectory(''); setConfirmUnbind(false); scrollPositions.current = new Map();
    }, [sessionId]);
    useEffect(() => {
      if (!notice) return;
      const timer = setTimeout(() => setNotice(null), 6500);
      return () => clearTimeout(timer);
    }, [notice]);
    useEffect(() => {
      if (!menu) return;
      const close = event => { if (!menuRef.current?.contains(event.target)) setMenu(false); };
      const timer = setTimeout(() => document.addEventListener('pointerdown', close), 0);
      return () => { clearTimeout(timer); document.removeEventListener('pointerdown', close); };
    }, [menu]);

    // Session identity and whether reading is currently authorized are separate questions.
    useEffect(() => {
      if (!visible || !sessionId) return;
      const controller = new AbortController();
      let active = true;
      setLoading(true);
      (async () => {
        try {
          const [nextStatus, nextConnection] = await Promise.all([
            rpc('status', { sessionId }, controller.signal),
            rpc('connection', { sessionId }, controller.signal),
          ]);
          if (!active || controller.signal.aborted) return;
          setStatus(nextStatus); setConnection(nextConnection); setLoading(false);
          if (nextStatus.bound) void refresh(sessionId);
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          setConnection({ state: 'unavailable', error }); setLoading(false);
        }
      })();
      return () => { active = false; controller.abort(); };
    }, [sessionId, visible, reload, refresh, rpc]);

    // Retry quietly while offline. No repeated toast and no new identity.
    useEffect(() => {
      if (!visible || !connection || connected || connection.state === 'unassociated') return;
      const timer = setTimeout(() => setReload(value => value + 1), 8000);
      return () => clearTimeout(timer);
    }, [visible, connected, connection?.state, reload]);

    useEffect(() => {
      if (!visible || !connected || !sessionId) return;
      const handle = observeCurrentStructure(rpc, { sessionId, ...(focus ? { focusUuid: focus } : {}) }, event => {
        if (!mountedRef.current) return;
        if (event.type === 'currentStructure.changed') {
          setStructure(event.value); setStructureError(null); setLoading(false);
          if (event.value.sourceSetVersion !== readerVersion.current) setReaderTick(value => value + 1);
          return;
        }
        if (event.error?.code === 'STRUCTURE_FOCUS_MISSING') {
          saveWorkFocus(sessionId, null);
          setFocus(null);
          setNotice({ text: '这件工作已不在当前结构中，已回到工作根。', tone: 'info' });
          return;
        }
        setStructureError(event.error);
        void checkConnection();
      });
      return () => handle.dispose();
    }, [sessionId, visible, connected, focus, reload, rpc]);

    useEffect(() => {
      if (!visible || !connected || !sessionId) return;
      const controller = new AbortController();
      rpc('reader', { sessionId }, controller.signal).then(value => {
        if (controller.signal.aborted || !mountedRef.current) return;
        setReader(value); setReaderError(null);
      }).catch(error => {
        if (!controller.signal.aborted && mountedRef.current) setReaderError(error);
      });
      return () => controller.abort();
    }, [sessionId, visible, connected, reload, readerTick, rpc]);

    // Preserve where the reader was when moving between a parent and a child work object.
    useEffect(() => {
      const element = scroll.current;
      if (!element) return;
      const frame = requestAnimationFrame(() => {
        element.scrollTop = scrollPositions.current.get(`${view}:${focus ?? 'root'}`) ?? 0;
      });
      return () => cancelAnimationFrame(frame);
    }, [focus, view, structure?.root?.uuid, sessionId, loading]);

    const path = structure?.path ?? [], root = structure?.root ?? null;
    const workTypes = useMemo(() => {
      const map = new Map();
      for (const item of path) map.set(item.uuid, item);
      for (const item of structure?.children ?? []) map.set(item.uuid, item);
      return map;
    }, [structure, path]);
    const readerByUuid = useMemo(() => new Map((reader?.nodes ?? []).map(node => [node.blockUuid, node])), [reader]);
    const selectionVersions = useMemo(() => new Map((reader?.nodes ?? []).map(node => [node.sourceId, node.contentVersion])), [reader]);
    const saveScroll = () => { if (scroll.current) scrollPositions.current.set(`${view}:${focus ?? 'root'}`, scroll.current.scrollTop); };
    const rememberScroll = event => { if (visible) scrollPositions.current.set(`${view}:${focus ?? 'root'}`, event.currentTarget.scrollTop); };
    const changeFocus = uuid => { if (uuid === focus) return; saveScroll(); saveWorkFocus(sessionId, uuid); setFocus(uuid ?? null); setStructure(null); setStructureError(null); };
    const changeView = next => { if (next === view) return; saveScroll(); setView(next); setMenu(false); };

    useEffect(() => {
      if (!requestedFocus) return;
      workFocus.take(sessionId);
      const rootUuid = structure?.scope?.rootUuid;
      const next = requestedFocus === rootUuid ? null : requestedFocus;
      setView('structure');
      if (next === focus) return;
      saveScroll();
      saveWorkFocus(sessionId, next);
      setFocus(next);
      setStructure(null);
      setStructureError(null);
    }, [requestedFocus, sessionId, structure?.scope?.rootUuid]);

    const addSelection = items => {
      const next = mergeSelections(selected, items, 32);
      if (next.length === selected.length) { setNotice({ text: '这些内容已经在引用里了。', tone: 'info' }); return; }
      setSelected(next);
      setNotice({ text: next.length >= 32 ? '引用已满 32 处，请先加入对话或移除一些。' : `已选 ${next.length} 处，加入对话前仍可调整。`, tone: 'info' });
    };
    const removeSelection = key => setSelected(previous => previous.filter(item => selectionKey(item) !== key));
    const insertSelection = async () => {
      if (!selected.length) return;
      if (!props.inputActions) { setNotice({ text: '先打开一个对话，再把引用加入草稿。', tone: 'error' }); return; }
      const currentSession = sessionId, actions = props.inputActions;
      setBusy(true);
      try {
        const references = await rpc('reader-references', { sessionId, selections: selected.map(item => ({
          sourceId: item.sourceId, contentVersion: item.contentVersion, ...(item.range ? { range: item.range } : {}),
        })) });
        if (sessionRef.current !== currentSession) return;
        if (!await insertReaderReferences(actions, references, (reference, span) => insertReference(currentSession, reference, span))) throw Object.assign(Error('busy'), { code: 'INPUT_BUSY' });
        setSelected([]);
        setNotice({ text: `已把 ${references.length} 处引用加入草稿，未发送。`, tone: 'ok' });
      } catch (error) {
        if (error.code === 'REFERENCE_SOURCE_CHANGED') setReaderTick(value => value + 1);
        setNotice({ text: errorText(error), tone: 'error' });
      } finally { setBusy(false); }
    };

    const checkConnection = async () => {
      const currentSession = sessionId;
      try { const value = await rpc('connection', { sessionId }); if (mountedRef.current && sessionRef.current === currentSession) setConnection(value); }
      catch { /* The observer retries; a failed probe does not create another state machine. */ }
    };

    const bind = async target => {
      const currentSession = sessionId;
      setBusy(true); setBindingError('');
      try {
        await rpc('bind', { sessionId, directory: target || status?.cwd || '' });
        if (sessionRef.current !== currentSession) return;
        invalidate(sessionId);
        setBinding(false);
        setReload(value => value + 1);
        setNotice({ text: '已关联当前工作。', tone: 'ok' });
      } catch (error) { setBindingError(errorText(error)); }
      finally { setBusy(false); }
    };

    const openTab = kind => { setMenu(false); ctx.sidebarRight.openTab(kind); };
    const unbind = async () => {
      const currentSession = sessionId;
      setBusy(true);
      try {
        await rpc('unbind', { sessionId });
        if (sessionRef.current !== currentSession) return;
        invalidate(sessionId);
        saveWorkFocus(sessionId, null);
        setConfirmUnbind(false); setMenu(false); setFocus(null); setReader(null); setStructure(null); setSelected([]);
        setReload(value => value + 1);
        setNotice({ text: '已解除关联；原对话和草稿保留。', tone: 'ok' });
      } catch (error) { setNotice({ text: errorText(error), tone: 'error' }); }
      finally { setBusy(false); }
    };
    const startNewConversation = async () => {
      setMenu(false);
      if (!(await navigate('newWork', sessionId))) setNotice({ text: '暂时无法新建对话，当前对话和草稿已保留。', tone: 'error' });
    };
    const onEnterWork = async (work, ops) => enterWork(work, ops);
    const onGeneral = async () => { if (!(await navigate('general', sessionId))) throw Error('GENERAL_NAVIGATION_FAILED'); };

    const staleCount = selected.filter(item => {
      const version = selectionVersions.get(item.sourceId);
      return version && version !== item.contentVersion;
    }).length;
    const headerTime = timeText(structure?.capturedAt);

    const shellStyle = visible ? undefined : { display: 'none' };
    if (!sessionId) return <section className="wx-page" style={shellStyle}><p className="wx-empty-line">先选择一个对话。</p></section>;
    if (loading && !status) return <section className="wx-page" style={shellStyle}><Skeleton /></section>;

    const waiting = !status?.bound && connection?.state === 'read_confirmation_required';
    const needsRecovery = status?.bound && !connected;
    const cwdMismatch = Boolean(status?.cwdMismatch);
    const showWork = status?.bound && connected;

    return <section className="wx-page" aria-label="当前工作" style={shellStyle}>
      {discovery ? <WorkDiscovery rpc={rpc} currentRef={status?.workRef} onEnter={onEnterWork} onGeneral={onGeneral} onClose={() => setDiscovery(false)} /> : null}
      <header className="wx-head">
        <div className="wx-head-top">
          <span className="wx-eyebrow"><span className={`wx-live-dot${connected ? ' is-on' : ''}`} />当前工作</span>
          <div className="wx-head-actions">
            {root?.source?.logseqUrl ? <a className="wx-icon" href={root.source.logseqUrl} target="_blank" rel="noreferrer" title="在 Logseq 打开这件工作" aria-label="在 Logseq 打开这件工作">↗</a> : null}
            <button type="button" className="wx-icon" aria-label="刷新当前结构与原文" title="刷新" onClick={() => setReload(value => value + 1)}>↻</button>
            <div className="wx-menu-wrap" ref={menuRef}>
              <button type="button" className="wx-icon" aria-label="更多工作操作" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(value => !value)}>⋯</button>
              {menu ? <div className="wx-menu-pop" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setDiscovery(true); }}>切换工作</button>
                {status?.workRef ? <button type="button" role="menuitem" disabled={busy} onClick={startNewConversation}>新建此工作对话</button> : null}
                <button type="button" role="menuitem" onClick={() => openTab('logseq-files')}>工作文件</button>
                {status?.bound ? <button type="button" role="menuitem" onClick={() => setConfirmUnbind(true)}>解除此会话关联</button> : null}
                {confirmUnbind ? <div className="wx-confirm"><span>解除后仍保留原对话和草稿；需要时再关联。</span><div><button type="button" disabled={busy} onClick={unbind}>确认解除</button><button type="button" onClick={() => setConfirmUnbind(false)}>取消</button></div></div> : null}
              </div> : null}
            </div>
          </div>
        </div>
        <div className="wx-title-row">
          <h1>{root?.title ?? (status?.workRef ? '当前工作' : '工作')}</h1>
          {root?.status ? <StatusBadge status={root.status} /> : null}
          {root ? <span className="wx-kind">{workTypeLabel(root.type)}</span> : null}
        </div>
        {path.length > 1 ? <nav className="wx-path" aria-label="当前工作路径">
          <button type="button" className="wx-back" title="返回上一级工作" onClick={() => changeFocus(path[path.length - 2].uuid)}>←</button>
          {path.map((item, index) => index === path.length - 1
            ? <span key={item.uuid} className="wx-path-current" aria-current="page">{item.title}</span>
            : <React.Fragment key={item.uuid}><button type="button" className="wx-path-link" onClick={() => changeFocus(item.uuid)}>{item.title}</button><span className="wx-path-sep">/</span></React.Fragment>)}
        </nav> : null}
        {showWork ? <div className="wx-subline">
          <span>{headerTime ? `读取于 ${headerTime}` : '正在读取'}</span>
          <span className="wx-subline-sep">·</span>
          <span>实时更新</span>
        </div> : null}
      </header>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {cwdMismatch ? <div className="wx-recovery" role="status">
        <div className="wx-recovery-copy"><strong>这个对话的目录已经变化</strong><p>原对话和草稿会保留。可在工作目录中新开一个对话继续这件工作。</p></div>
        <div className="wx-recovery-actions"><button type="button" className="wx-button" disabled={busy} onClick={startNewConversation}>新建此工作对话</button><button type="button" className="wx-text" onClick={() => setDiscovery(true)}>选择其他工作</button></div>
      </div> : null}

      {!status && !loading ? <div className="wx-empty"><p>{errorText(connection?.error)}</p><button type="button" className="wx-button" onClick={() => setReload(value => value + 1)}>重试</button></div> : null}
      {status && !status.bound && !cwdMismatch ? (waiting ? <Recovery connection={connection} busy={busy} onRetry={async () => { setBusy(true); await checkConnection(); setReload(value => value + 1); setBusy(false); }}
        onRebind={() => setBinding(true)} workUrl={root?.source?.logseqUrl} onChoose={() => setDiscovery(true)} />
        : <Onboarding status={status} busy={busy} directory={directory} setDirectory={setDirectory} error={bindingError}
          onBind={bind} onChoose={() => setDiscovery(true)} onRetry={() => setReload(value => value + 1)} waiting={waiting} />) : null}
      {needsRecovery && !cwdMismatch ? <Recovery connection={connection} busy={busy}
        onRetry={async () => { setBusy(true); await checkConnection(); setReload(value => value + 1); setBusy(false); }}
        onRebind={() => { setBinding(true); setBindingError(''); }}
        workUrl={root?.source?.logseqUrl} onChoose={() => setDiscovery(true)} /> : null}
      {binding && needsRecovery ? <form className="wx-inline-bind" onSubmit={event => { event.preventDefault(); void bind(directory.trim()); }}>
        <input autoFocus value={directory} onChange={event => setDirectory(event.target.value)} placeholder={status?.cwd ?? '/工作目录'} aria-label="Logseq 工作目录" />
        <button type="submit" className="wx-button" disabled={busy || !directory.trim()}>重新关联</button>
        <button type="button" className="wx-text" onClick={() => setBinding(false)}>取消</button>
        {bindingError ? <span className="wx-inline-error">{bindingError}</span> : null}
      </form> : null}

      {showWork && !cwdMismatch ? <>
        <nav className="wx-modes" aria-label="工作查看方式">
          <div className="wx-seg" role="group" aria-label="当前工作视图">
            <button type="button" aria-pressed={view === 'structure'} onClick={() => changeView('structure')}>结构</button>
            <button type="button" aria-pressed={view === 'reader'} onClick={() => changeView('reader')}>原文</button>
          </div>
          <span className="wx-modes-spacer" />
          <button type="button" className="wx-text" onClick={() => openTab('work-history')}>历史回看</button>
          <button type="button" className="wx-text" onClick={() => openTab('work-evidence')}>变更回顾</button>
        </nav>
        {structureError && structure ? <p className="wx-inline-error" role="status">{errorText(structureError)} · 显示上次读取的结构。<button type="button" onClick={() => setReload(value => value + 1)}>重试</button></p> : null}
        <div className="wx-scroll" ref={scroll} onScroll={rememberScroll}>
          {!structure && !structureError ? <Skeleton /> : null}
          {!structure && structureError ? <div className="wx-empty" role="alert"><p>{errorText(structureError)}</p><button type="button" className="wx-button" onClick={() => setReload(value => value + 1)}>重试</button></div> : null}
          {structure && view === 'structure' ? <StructureBody structure={structure} reader={reader} readerError={readerError} workTypes={workTypes}
            readerByUuid={readerByUuid} sessionId={sessionId} onEnter={changeFocus} onRetry={() => setReload(value => value + 1)} onAdd={addSelection} onNotice={text => setNotice({ text, tone: 'info' })} /> : null}
          {structure && view === 'reader' ? (reader
            ? <Reader nodes={reader.nodes} focusUuid={root?.uuid} workTypes={workTypes} onAdd={addSelection} onNotice={text => setNotice({ text, tone: 'info' })} resetKey={`${sessionId}:${root?.uuid ?? 'root'}:reader`} />
            : readerError ? <div className="wx-empty" role="alert"><p>{errorText(readerError)}</p><button type="button" className="wx-button" onClick={() => setReaderTick(value => value + 1)}>重试</button></div>
              : <Skeleton />) : null}
        </div>
        {selected.length ? <aside className="wx-tray" aria-label="已选引用">
          <div className="wx-tray-head"><strong>{selected.length} 处引用</strong>{staleCount ? <span className="wx-warn">{staleCount} 处已变化</span> : null}<span className="wx-tray-note">加入草稿，不发送</span><button type="button" className="wx-text" onClick={() => setSelected([])}>清空</button><button type="button" className="wx-button wx-button-primary" disabled={busy} onClick={insertSelection}>{busy ? '加入中…' : '加入对话'}</button></div>
          <div className="wx-tray-list">{selected.map(item => {
            const key = selectionKey(item), stale = selectionVersions.get(item.sourceId) && selectionVersions.get(item.sourceId) !== item.contentVersion;
            return <span className={`wx-ref-chip${stale ? ' is-stale' : ''}`} key={key} title={item.excerpt}>
              <span className="wx-ref-kind">{item.range ? '选段' : '整块'}</span><span className="wx-ref-text">{previewText(item.excerpt, 44)}</span>
              <button type="button" aria-label="移除这条引用" onClick={() => removeSelection(key)}>×</button>
            </span>;
          })}</div>
        </aside> : null}
      </> : null}
    </section>;
  };
}

function StructureBody({ structure, reader, readerError, workTypes, readerByUuid, sessionId, onEnter, onRetry, onAdd, onNotice }) {
  const root = structure.root;
  if (structure.children.length) {
    return <div className="wx-structure">
      <div className="wx-section-head"><span>下级工作对象</span><span className="wx-section-count">{structure.children.length}</span></div>
      <ul className="wx-child-list">{structure.children.map(child => {
        const node = readerByUuid.get(child.uuid);
        const lines = String(node?.body?.markdown ?? '').split('\n').map(line => line.trim()).filter(Boolean);
        const preview = lines.length > 1 ? previewText(lines.slice(1).join(' '), 96) : '';
        return <li key={child.uuid}><button type="button" className="wx-child-row" onClick={() => onEnter(child.uuid)}>
          <span className={`wx-kind is-${String(child.type).toLowerCase()}`}>{workTypeLabel(child.type)}</span>
          <span className="wx-child-copy"><span className="wx-child-title">{child.title}</span>{preview ? <span className="wx-child-preview">{preview}</span> : null}</span>
          <StatusBadge status={child.status} />
          <span className="wx-child-arrow" aria-hidden="true">›</span>
        </button></li>;
      })}</ul>
      <p className="wx-hint">进入一件工作后，它的下级工作对象会成为新的浏览根。</p>
    </div>;
  }
  if (reader) {
    const content = structure.content ?? [];
    const visible = content.length > 1 ? content.filter(node => node.blockUuid !== root.uuid) : content;
    if (!visible.length) return <div className="wx-empty"><p>这件工作下还没有可读的普通内容。</p><a className="wx-button" href={root.source?.logseqUrl} target="_blank" rel="noreferrer">在 Logseq 查看</a></div>;
    if (visible.length === 1 && previewText(visible[0].body.markdown) === root.title && !visible[0].body.properties?.length && !visible[0].body.semantic) {
      return <div className="wx-empty"><p>这件工作只有标题，没有更多正文。</p><a className="wx-button" href={root.source?.logseqUrl} target="_blank" rel="noreferrer">在 Logseq 查看</a></div>;
    }
    const ids = new Set(visible.map(node => node.blockUuid));
    return <Reader nodes={reader.nodes} onlyIds={ids} focusUuid={root.uuid} workTypes={workTypes} onAdd={onAdd} onNotice={onNotice} resetKey={`${sessionId}:${root.uuid}:structure`} toolbar={false} />;
  }
  if (readerError) return <div className="wx-empty" role="alert"><p>{errorText(readerError)}</p><button type="button" className="wx-button" onClick={onRetry}>重试</button></div>;
  return <Skeleton />;
}
