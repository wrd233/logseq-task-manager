import React, {useEffect, useRef, useState} from 'react';
import {workKey} from '@task-copilot/contracts';
/* global document, setInterval, clearInterval */

export function WorkDiscovery({rpc, currentRef, onEnter, onGeneral, onClose}) {
  const dialog = useRef(null), input = useRef(null);
  const [catalog, setCatalog] = useState(null), [query, setQuery] = useState(''), [selected, setSelected] = useState(0);
  const [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const operations = useRef(new Map());
  useEffect(() => {
    const previous = document.activeElement, node = dialog.current; node.showModal(); input.current.focus();
    let active = true;
    const refresh = () => rpc('catalog', {}).then(value => {if (active) setCatalog(value);}).catch(() => {if (active) setError('工作目录暂不可用，请稍后重试。');});
    void refresh(); const timer = setInterval(() => void refresh(), 10000);
    return () => {active = false; clearInterval(timer); node.close(); previous?.focus?.();};
  }, []);
  const recent = new Map(catalog?.recent.map(row => [row.key, row.lastOpenedAt]) ?? []);
  const unique = new Map();
  for (const graph of catalog?.graphs ?? []) for (const work of graph.works) unique.set(workKey(work.workRef), {...work, refreshedAt: graph.refreshedAt});
  const all = [...unique.values()];
  const needle = query.trim().toLocaleLowerCase(), tokens = needle.split(/\s+/u).filter(Boolean);
  const rows = all.filter(work => tokens.every(token => `${work.title} ${work.objectType} ${work.location}`.toLocaleLowerCase().includes(token)))
    .sort((a,b) => (recent.get(workKey(b.workRef)) ?? 0) - (recent.get(workKey(a.workRef)) ?? 0) || a.title.localeCompare(b.title, 'zh-CN'));
  const groups = needle ? [['搜索结果', rows]] : [
    ['当前工作', rows.filter(work => currentRef && workKey(work.workRef) === workKey(currentRef))],
    ['最近使用', rows.filter(work => recent.has(workKey(work.workRef)) && (!currentRef || workKey(work.workRef) !== workKey(currentRef)))],
    ['所有工作', rows.filter(work => !recent.has(workKey(work.workRef)) && (!currentRef || workKey(work.workRef) !== workKey(currentRef)))],
  ];
  const visible = groups.flatMap(([,rows]) => rows).slice(0,100);
  const choose = async work => {
    if (busy) return;
    setBusy(true); setError(null);
    try {await onEnter(work, operations.current); onClose();}
    catch (error) {setError(error.code === 'SESSION_CWD_MISMATCH' ? '原会话目录已改变，请使用“新建此工作对话”。' : '暂未进入工作，保留当前输入。请再试一次。');}
    finally {setBusy(false);}
  };
  let index = 0;
  return <dialog ref={dialog} className="lq-discovery" aria-label="切换工作" onCancel={onClose} onClick={event => {if(event.target === dialog.current) onClose();}}>
    <div className="lq-discovery-top"><span>切换工作</span><button type="button" aria-label="关闭工作搜索" onClick={onClose}>Esc</button></div>
    <div className="lq-discovery-search"><span aria-hidden="true">⌕</span><input ref={input} aria-label="搜索工作" placeholder="搜索工作名称或来源位置…" value={query} onChange={event => {setQuery(event.target.value);setSelected(0);}} onKeyDown={event => {
      if(event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); const next = (selected + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(visible.length,1)) % Math.max(visible.length,1);setSelected(next);dialog.current.querySelector(`[data-work-index="${next}"]`)?.scrollIntoView({block:'nearest'});}
      if(event.key === 'Enter' && visible[selected]) {event.preventDefault();void choose(visible[selected]);}
    }}/></div>
    <div className="lq-discovery-list" aria-busy={busy}>
      {!needle ? <button className="lq-discovery-general" type="button" disabled={busy} onClick={async () => {setBusy(true);try {await onGeneral();onClose();} catch {setError('暂未切换到 General，请重试。');} finally {setBusy(false);}}}><span>○</span><span><strong>General</strong><small>通用对话</small></span>{!currentRef ? <em>当前</em> : null}</button> : null}
      {!catalog && !error ? <p className="lq-discovery-empty">正在读取工作目录…</p> : null}
      {groups.map(([label, works]) => {const shown = works.filter(work => visible.includes(work)); return shown.length ? <section key={label}><h3>{label}<span>{shown.length}</span></h3>{shown.map(work => {
        const key = workKey(work.workRef), position = index++, current = currentRef && key === workKey(currentRef);
        const identity = work.workRef.kind === 'kernel' ? work.workRef.objectId : work.workRef.rootUuid;
        const duplicate = all.some(other => other !== work && other.title === work.title && other.location === work.location);
        return <button type="button" data-work-index={position} className={`lq-discovery-row ${position === selected ? 'is-selected' : ''}`} key={key} disabled={busy} onMouseEnter={() => setSelected(position)} onClick={() => {void choose(work);}} title={`${work.location}\n${identity}`}>
          <span className="lq-discovery-icon" aria-hidden="true">{work.objectType === '页面' ? '▤' : work.objectType.includes('Project') || work.objectType.includes('PROJECT') ? '◇' : '•'}</span>
          <span className="lq-discovery-copy"><strong>{work.title}</strong><small>{work.location}{duplicate ? ` · ${identity}` : ''}</small></span><span className="lq-discovery-type">{current ? '当前' : work.objectType}</span>
        </button>;
      })}</section> : null;})}
      {catalog && !visible.length ? <p className="lq-discovery-empty">{needle ? '没有找到这件工作。试试其他名称或来源位置。' : '还没有收录工作。在 Logseq 保存带 [事务]、[Project] 等标记的工作，或将页面加入工作搜索。'}</p> : null}
      {rows.length > 100 ? <p className="lq-discovery-empty">输入名称，继续缩小范围。</p> : null}
    </div>
    {error ? <p className="lq-discovery-error" role="alert">{error}</p> : null}
    <footer><span>{busy ? '正在进入工作…' : '↑ ↓ 选择 · Enter 进入'}</span><span title={catalog?.graphs.map(graph => `${graph.graphName}：${new Date(graph.refreshedAt).toLocaleString('zh-CN')}`).join('\n')}>{catalog?.graphs.length ? `${catalog.graphs.every(graph => Date.now() - graph.refreshedAt > 35000) ? '离线快照' : '保存的目录'} · 更新于 ${new Date(Math.max(...catalog.graphs.map(graph => graph.refreshedAt))).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}` : '等待 Logseq 同步'}</span></footer>
  </dialog>;
}
