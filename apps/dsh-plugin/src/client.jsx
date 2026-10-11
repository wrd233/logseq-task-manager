/* global window, document, AbortController, setInterval, clearInterval */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { styles } from './styles.mjs';

export const inject = ['connection', 'slots', 'sidebarRight', 'sidebarRightTabs', 'conversation'];
const errorText = error => ({
  SESSION_NOT_BOUND: '先关联此会话的 Logseq 工作目录。', WORKSPACE_NOT_BOUND: '此目录没有 Logseq 连接。请在 Logseq 关联目录并允许 agent 连接当前工作。',
  WORKSPACE_OFFLINE: 'Logseq 工作连接已离线，请在 Logseq 重新连接。', CONNECTION_STALE: '连接已改变，请在 Logseq 重新连接。',
  DESCRIPTOR_STALE: '本地服务已重启，请在 Logseq 重新允许连接。', WORK_SCOPE_CHANGED: '目录对应的工作已改变，请重新关联。',
  ENOENT: '没有找到工作目录或本地连接。', FILE_UNAVAILABLE: '文件已失联或不可用，请刷新列表。',
  INPUT_BUSY: '输入框正在提交，请稍后再引用。', BINDING_CHANGED: '会话关联已改变，请重新读取。',
}[error?.code] ?? '暂时无法读取，请检查本地服务与 Logseq 连接。');

export function apply(ctx) {
  const style = document.createElement('style'); style.textContent = styles; document.head.append(style);
  const rows = new Map(), listeners = new Set();
  let overlay = null, disposed = false;
  const emit = () => { for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const get = sessionId => rows.get(sessionId) ?? empty;
  const empty = Object.freeze({ status: null, view: null, error: null, busy: false, revision: 0 });
  const update = (sessionId, patch) => { rows.set(sessionId, { ...get(sessionId), ...patch }); emit(); };
  const rpc = async (method, payload, signal) => {
    const answer = await ctx.connection.rpc.call('/api', `logseq-workbench/${method}`, payload, signal);
    if (!answer.ok) throw Object.assign(Error(answer.error.message), { code: answer.error.code });
    return answer.value;
  };
  const pending = new Map();
  async function refresh(sessionId) {
    if (disposed || pending.has(sessionId)) return pending.get(sessionId)?.promise;
    const controller = new AbortController(), revision = get(sessionId).revision;
    const promise = (async () => {
      try {
        const status = await rpc('status', { sessionId }, controller.signal);
        const view = status.bound ? await rpc('read', { sessionId }, controller.signal) : null;
        if (!disposed && get(sessionId).revision === revision) update(sessionId, { status, view, error: null, ...(!status.bound ? { notice: null } : {}) });
      } catch (error) {
        if (!controller.signal.aborted && !disposed && get(sessionId).revision === revision) update(sessionId, { view: null, error });
      } finally { if (pending.get(sessionId)?.controller === controller) pending.delete(sessionId); }
    })();
    pending.set(sessionId, { promise, controller }); return promise;
  }
  function invalidate(sessionId) {
    pending.get(sessionId)?.controller.abort(); pending.delete(sessionId);
    update(sessionId, { revision: get(sessionId).revision + 1, view: null, error: null, notice: null });
  }
  function useRow(sessionId, active = false) {
    const row = useSyncExternalStore(subscribe, () => get(sessionId), () => empty);
    useEffect(() => {
      if (!active) return;
      void refresh(sessionId);
      const timer = setInterval(() => { void refresh(sessionId); }, 5000);
      return () => clearInterval(timer);
    }, [sessionId, active]);
    return row;
  }
  function show(sessionId) { overlay = { sessionId }; emit(); void refresh(sessionId); }
  function close() { overlay = null; emit(); }
  async function openFile(sessionId, key, reveal = false) {
    try { await rpc('open', { sessionId, key, reveal }); update(sessionId, { notice: reveal ? '已在访达显示。' : '已交给系统打开。', error: null }); }
    catch (error) { update(sessionId, { error, notice: null }); }
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
    const row = useRow(props.sessionId);
    return <button type="button" className="lq-header" aria-label="查看关联的 Logseq 工作" onClick={() => {
      show(props.sessionId); ctx.sidebarRight.openTab('logseq-files');
    }}>↗ Logseq{row.view ? <span className="lq-dot" aria-label="已关联" /> : null}</button>;
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
  function WorkPanel({ sessionId, inputActions }) {
    const row = useRow(sessionId, true), [more, setMore] = useState(false);
    return <section className="lq-source" aria-label="关联的 Logseq 原文"><header><span>Logseq 原文</span><div>{row.view ? <a href={row.view.logseqUrl} aria-label="在 Logseq 打开原文">↗</a> : null}<button type="button" aria-label="更多工作操作" onClick={() => setMore(!more)}>···</button><button type="button" aria-label="收起 Logseq 原文" onClick={close}>×</button></div></header>
      {more ? <div className="lq-source-menu"><button type="button" onClick={() => { void refresh(sessionId); setMore(false); }}>刷新原文</button><button type="button" onClick={() => { ctx.sidebarRight.openTab('logseq-files'); setMore(false); }}>工作文件</button>{row.status?.bound ? <button type="button" disabled={row.busy} onClick={async () => {
        invalidate(sessionId); update(sessionId, { busy: true });
        try { await rpc('unbind', { sessionId }); await refresh(sessionId); }
        catch (error) { update(sessionId, { error }); } finally { update(sessionId, { busy: false }); }
      }}>解除此会话关联</button> : null}</div> : null}
      {row.error ? <p className="lq-error" role="status">{errorText(row.error)}</p> : null}
      {!row.status ? <p className="lq-muted">正在检查工作连接…</p> : !row.status.bound ? <Binding sessionId={sessionId} row={row} /> : row.view ? <><h2>{row.view.title}</h2><div className="lq-body">{row.view.blocks.map(block => <div key={block.sourceId} className={`lq-block ${block.depth === 0 ? 'lq-root-block' : ''}`} style={{ paddingInlineStart: Math.min(block.depth, 6) * 8 }}><p>{block.content ?? '来源暂不可用'}</p><Quote sessionId={sessionId} inputActions={inputActions} item={{ sourceId: block.sourceId, contentVersion: block.contentVersion }} title="引用此段" /></div>)}</div>{row.view.truncated ? <p className="lq-muted">较长原文已截断，可在 Logseq 查看完整内容。</p> : null}</> : <p className="lq-muted">等待 Logseq 原文…</p>}
    </section>;
  }
  function Overlay(props) {
    const seat = useRef(null);
    const current = useSyncExternalStore(subscribe, () => overlay, () => null);
    const mounted = useSyncExternalStore(listener => ctx.sidebarRight.mounted.subscribe(listener), () => ctx.sidebarRight.mounted.getSnapshot(), () => undefined);
    useEffect(() => { if (current && mounted && current.sessionId !== mounted) show(mounted); }, [mounted, current?.sessionId]);
    useEffect(() => { const escape = event => { if (event.key === 'Escape') close(); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, []);
    useEffect(() => {
      if (!current || !mounted || current.sessionId !== mounted) return;
      // The additive overlay has no public left-column geometry setter in DSH rc.2.
      // This temporary adapter uses the frame landmark and cleans up on close.
      const frame = seat.current?.closest('[data-shell-overlay]')?.parentElement;
      if (!frame?.style.gridTemplateColumns) return;
      frame.classList.add('lq-frame-open');
      return () => frame.classList.remove('lq-frame-open');
    }, [mounted, current?.sessionId]);
    if (!current || !mounted || current.sessionId !== mounted) return null;
    return <div ref={seat}>{props.renderSlot('logseq.work.source', {})}</div>;
  }
  function Files(props) {
    const tab = props.useTabInfo();
    const row = useRow(props.sessionId, tab.tab.visible), [menu, setMenu] = useState(null);
    useEffect(() => tab.tab.actions.bindCommands({ refresh: () => { void refresh(props.sessionId); } }), [props.sessionId, tab.tab.actions]);
    useEffect(() => { setMenu(null); }, [props.sessionId]);
    let previous = '';
    return <section className="lq-files" aria-label="Logseq 工作文件"><div className="lq-file-title"><span>{row.view?.title ?? 'Logseq 工作文件'}</span><button type="button" aria-label="打开工作目录" onClick={() => { void openFile(props.sessionId, 'directory'); }}>↗</button></div>
      {row.error ? <p className="lq-error" role="status">{errorText(row.error)}</p> : null}
      {row.status && !row.status.bound ? <button type="button" className="lq-link" onClick={() => show(props.sessionId)}>关联 Logseq 工作</button> : null}
      {row.notice ? <p className="lq-muted" role="status">{row.notice}</p> : null}
      {row.view?.files.map(file => { const group = previous !== file.group ? <h3>{file.group}</h3> : null; previous = file.group; return <React.Fragment key={file.key}>{group}<div className="lq-file-row"><button type="button" className="lq-file-open" title={file.relativePath} disabled={file.availability !== 'available'} onClick={() => { setMenu(null); void openFile(props.sessionId, file.key); }}><span aria-hidden="true">▤</span><span>{file.name}</span></button><button type="button" className="lq-more" aria-label={`${file.name}的更多操作`} aria-expanded={menu === file.key} onClick={() => setMenu(menu === file.key ? null : file.key)}>···</button></div>{menu === file.key ? <div className="lq-file-menu"><button type="button" onClick={() => { setMenu(null); void openFile(props.sessionId, file.key); }}>外部打开</button><button type="button" onClick={() => { setMenu(null); void openFile(props.sessionId, file.key, true); }}>在访达显示</button><Quote sessionId={props.sessionId} inputActions={props.inputActions} item={{ file: file.key, path: file.relativePath, materialId: file.materialId, version: file.version }} /></div> : null}</React.Fragment>; })}
      {row.view && !row.view.files.length ? <p className="lq-muted">此工作暂无文件。</p> : null}{row.view?.fileTruncation.length ? <p className="lq-muted">文件扫描达到范围限制，部分目录未列出。</p> : null}
    </section>;
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: '@task-copilot/dsh-logseq-workbench', kind: 'logseq-files', title: () => '工作文件', priority: 'extension', guide: [{ id: 'logseq-files', order: 350, title: () => 'Logseq 工作文件' }] }));
  const register = (slot, spec, component) => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...spec }, component));
  register('conversation.session.header.utilities', { id: 'logseq-workbench', order: 10 }, Header);
  register('sidebar.workspaces.session.row.action', { id: 'logseq-workbench', order: 100 }, RowAction);
  register('shell.overlay', { id: 'logseq-workbench', children: { 'logseq.work.source': { kind: 'single', scope: 'session' } } }, Overlay);
  register('logseq.work.source', { id: 'logseq-workbench' }, WorkPanel);
  register('sidebar.right.pane.tab', { key: '@task-copilot/dsh-logseq-workbench' }, Files);
  ctx.on('dispose', () => { disposed = true; style.remove(); for (const request of pending.values()) request.controller.abort(); pending.clear(); listeners.clear(); rows.clear(); });
  ctx.on('connection/reset', () => { for (const sessionId of rows.keys()) invalidate(sessionId); if (overlay) void refresh(overlay.sessionId); });
}
