import React, { useEffect, useRef } from 'react';
import { captureInboxStyles } from './styles.mjs';

const saveLabel = { idle: '', pending: '正在保存，仍可继续输入。', saved: '已可靠保存。', unknown: '保存结果未知，输入已保留。', partial: '保存尚未完成，输入已保留。', failed: '保存失败，输入已保留。', conflict: '存在版本冲突，输入已保留。' };
const date = value => new Date(value).toLocaleString();
export function CaptureInboxView({ state, actions }) {
  const root = useRef(null), input = useRef(null), editInput = useRef(null), search = useRef(null);
  const list = useRef(null), detail = useRef(null);
  useEffect(() => {
    if (state.visible && state.mode === 'inbox' && list.current) list.current.scrollTop = state.listScroll ?? 0;
  }, [state.visible, state.mode, state.query]);
  useEffect(() => {
    if (state.visible && detail.current) detail.current.scrollTop = state.detailScroll ?? 0;
  }, [state.visible, state.mode, state.activeId, state.editOpen]);
  useEffect(() => {
    if (state.visible && state.mode === 'capture') input.current?.focus();
    else if (state.visible && state.mode === 'inbox') search.current?.focus();
  }, [state.visible, state.mode]);
  useEffect(() => {
    if (state.visible && state.mode === 'capture' && state.captureStatus === 'saved' && !state.text) input.current?.focus();
  }, [state.visible, state.mode, state.captureStatus, state.text]);
  useEffect(() => { if (state.visible && state.editOpen && state.mode === 'inbox') editInput.current?.focus(); }, [state.visible, state.editOpen, state.edit?.id, state.mode]);
  if (!state.visible) return null;
  const active = state.records.find(row => row.id === state.activeId) ?? state.records[0];
  const edit = state.editOpen && state.edit;
  const keyDown = event => {
    if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); actions.onClose(); }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); if (state.mode === 'capture') actions.onSave(); else if (edit) actions.onEditSave();
    }
    if (event.key === 'Tab' && !state.pinned) {
      const nodes = [...root.current.querySelectorAll('button:not(:disabled),textarea,input,select,summary,[tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1), focused = root.current.ownerDocument.activeElement;
      if (event.shiftKey && focused === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && focused === last) { event.preventDefault(); first?.focus(); }
    }
  };
  return <section ref={root} className="tc-capture-inbox" role="dialog" aria-modal={!state.pinned} aria-label={state.mode === 'capture' ? '快速记录' : 'Inbox'} onKeyDown={keyDown}>
    <style>{captureInboxStyles}</style>
    <header><h2>{state.mode === 'capture' ? '快速记录' : 'Inbox'}</h2><div className="ci-tools">
      <button type="button" onClick={() => actions.onMode(state.mode === 'capture' ? 'inbox' : 'capture')}>{state.mode === 'capture' ? '回看 Inbox' : '写一条'}</button>
      <button type="button" onClick={actions.onClose}>关闭并返回</button>
    </div></header>
    {(state.origin?.block || state.origin?.material) && <p className="ci-note" title={JSON.stringify(state.origin)}>来源：{state.origin.block ? `Logseq 块 · ${state.origin.block.contentVersion?.slice(0, 8)}` : `材料 · ${state.origin.material.version}`}</p>}
    <div role="status" aria-live="polite">
      {state.problem && <p className="ci-status">{state.problem}</p>}
      {state.draftStatus !== 'saved' && <p className="ci-note">{state.draftStatus === 'pending' ? '正在保护草稿…' : '草稿尚未确认，请保留当前窗口。'}{['unknown', 'conflict'].includes(state.draftStatus) && <button type="button" onClick={actions.onRecoverDraft}>重查草稿保存</button>}</p>}
    </div>
    {state.otherDraft && <details open><summary>核对磁盘中的另一份草稿 · v{state.otherDraft.version}</summary><p className="ci-body">{state.otherDraft.draft?.text}</p>{state.otherDraft.draft?.edit && <p className="ci-body">编辑草稿：{state.otherDraft.draft.edit.text}</p>}{state.otherDraft.draft?.quote && <p className="ci-body">待引用：{state.otherDraft.draft.quote}</p>}<button type="button" onClick={actions.onKeepLocalDraft}>保留当前输入，另存为草稿新版本</button></details>}
    {state.mode === 'capture' ? <div className="ci-capture">
      <label htmlFor="ci-capture-body">先留下一句话</label>
      <textarea ref={input} id="ci-capture-body" value={state.text} onChange={event => actions.onText(event.target.value)} placeholder="不必先想标题或归属。" />
      <div className="ci-tools"><label className="ci-check"><input type="checkbox" checked={state.pinned} onChange={event => actions.onPin(event.target.checked)} />在 DSH 内钉住</label>
        <button type="button" className="ci-primary" disabled={state.captureStatus === 'pending' || (!state.text.trim() && !['unknown', 'partial', 'failed', 'conflict'].includes(state.captureStatus))} onClick={actions.onSave}>{state.captureStatus === 'pending' ? '正在保存…' : ['unknown', 'partial', 'failed', 'conflict'].includes(state.captureStatus) ? '核对并重试原请求' : '保存'}</button>
      </div><p role="status" aria-live="polite" className="ci-note">{saveLabel[state.captureStatus]} Ctrl / ⌘ + Enter 保存；Escape 保留草稿并返回。</p>
    </div> : <>
      <label className="ci-search">搜索全部正文与历史<input ref={search} type="search" value={state.query} onChange={event => actions.onQuery(event.target.value)} /></label>
      <div className="ci-tools"><button type="button" onClick={actions.onToday}>选择今天</button><button type="button" onClick={actions.onSelectAll}>全选当前结果</button><button type="button" onClick={actions.onClearSelection}>清空选择</button><label className="ci-check"><input type="checkbox" checked={state.includeArchived} onChange={event => actions.onIncludeArchived(event.target.checked)} />显示归档</label><button type="button" onClick={actions.onRefresh}>刷新</button></div>
      <div className="ci-tools"><button type="button" disabled={!state.selected.length || state.editStatus === 'pending'} onClick={() => actions.onArchiveSelected(true)}>归档所选</button><button type="button" disabled={!state.selected.length || state.editStatus === 'pending'} onClick={() => actions.onArchiveSelected(false)}>撤销所选归档</button></div>
      <p className="ci-note">{state.records.length} 条 · 已选 {state.selected.length} 条{state.query ? ' · 搜索包含归档和旧正文' : ''}</p>
      <div className="ci-grid"><ul ref={list} aria-label="记录列表" onScroll={event => actions.onListScroll(event.currentTarget.scrollTop)}>{state.records.map(row => <li key={row.id}><div className="ci-row">
        <input type="checkbox" aria-label={`选择 ${row.text.slice(0, 30)}`} checked={state.selected.includes(row.id)} onChange={event => actions.onSelect(row.id, event.target.checked)} />
        <button type="button" aria-current={active?.id === row.id} onClick={() => actions.onActive(row.id)} onDoubleClick={() => actions.onEdit(row.id)}><time dateTime={row.createdAt}>{date(row.createdAt)}{row.archived ? ' · 已归档' : ''}</time><span className="ci-preview">{row.text || '（空正文）'}</span></button>
      </div></li>)}{!state.records.length && <li>这里还没有记录。</li>}</ul>
      <div>{edit ? <><label htmlFor="ci-edit-body">编辑正文 · 基于 v{edit.expectedVersion}</label><textarea ref={editInput} id="ci-edit-body" value={edit.text} onChange={event => actions.onEditText(event.target.value)} /><div className="ci-tools"><button type="button" disabled={state.editStatus === 'pending'} onClick={actions.onEditSave}>保存编辑</button><button type="button" onClick={actions.onEditCancel}>收起并保留草稿</button>{state.editStatus === 'conflict' && <button type="button" onClick={actions.onRebaseEdit}>保留我的正文，基于最新版本继续</button>}</div><p className="ci-note" role="status">{saveLabel[state.editStatus]}</p>{state.editStatus === 'conflict' && state.records.find(row => row.id === edit.id) && <details open><summary>核对当前已保存正文</summary><p className="ci-body">{state.records.find(row => row.id === edit.id).text}</p></details>}</> : active ? <>
        <time dateTime={active.createdAt}>{date(active.createdAt)} · v{active.version}{active.archived ? ' · 已归档' : ''}</time>
        <p ref={detail} className="ci-body" onScroll={event => actions.onDetailScroll(event.currentTarget.scrollTop)} onDoubleClick={() => actions.onEdit(active.id)}>{active.text || '（空正文）'}</p>
        <div className="ci-tools"><button type="button" onClick={() => actions.onEdit(active.id)}>编辑正文</button><button type="button" disabled={state.editStatus === 'pending'} onClick={() => actions.onArchive(active.id, !active.archived)}>{active.archived ? '撤销归档' : '归档'}</button></div>
        <details><summary>原始正文与 {active.history.length} 个版本</summary>{active.history.map(row => <div className="ci-history" key={row.version}><time dateTime={row.at}>v{row.version} · {date(row.at)}{row.restoredFrom ? ` · 恢复自 v${row.restoredFrom}` : ''}</time><pre>{row.text}</pre><button type="button" disabled={state.editStatus === 'pending'} onClick={() => actions.onRestore(active.id, row.version)}>以此正文新增版本</button></div>)}</details>
      </> : null}</div></div>
      {['unknown', 'partial', 'failed'].includes(state.editStatus) && <button type="button" onClick={actions.onRetryEdit}>核对并重试原编辑操作</button>}
      {state.editStatus === 'conflict' && !state.edit && <button type="button" onClick={actions.onCancelConflictOperation}>取消冲突操作并重新核对</button>}
      <div className="ci-tools"><button className="ci-primary" type="button" disabled={!state.selected.length || state.quoteStatus === 'pending'} onClick={actions.onQuote}>带去 DSH 草稿</button><span className="ci-note">仅插入原文引用，由你决定何时发送。</span></div>
    </>}
    {state.quote && <div className="ci-quote"><details open={state.quoteStatus !== 'inserted'}><summary>{state.quoteStatus === 'inserted' ? '引用已插入原生草稿' : '待引用原文已保留'}</summary><label>原文引用<textarea readOnly value={state.quote} /></label><button type="button" disabled={['pending', 'inserted'].includes(state.quoteStatus)} onClick={actions.onRetryQuote}>在当前选区重试引用</button></details></div>}
  </section>;
}
