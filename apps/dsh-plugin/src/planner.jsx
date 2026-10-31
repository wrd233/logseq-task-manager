/* global setInterval, clearInterval, setTimeout, clearTimeout */
import React, { useEffect, useState } from 'react';
import {
  compactMinutes, dateKey, dateLabel, dayTotals, dueLabel, durationLabel, handoffText,
  referenceKindLabel, relativeDateLabel, shortDateLabel, slotRangeLabel, visibleDates,
} from './planner-model.mjs';

const errorMessage = code => ({
  PLANNER_CONFLICT: '规划已在别处更新，已载入最新版。你的编辑仍在，请确认后再保存。',
  PLANNER_INVALID: '请检查标题、日期、时段或投入分钟数。',
  PLANNER_MISSING: '这项安排已经不存在，已载入最新规划。',
  PLANNER_REFERENCE_MISSING: '这个工作引用已不在当前工作范围。请重新选择，或移除引用后保存。',
  PLANNER_CORRUPT: '规划文件无法读取。文件没有被覆盖，请检查本机数据。',
  PLANNER_VERSION: '规划文件版本较新，请更新 DSH 插件。',
  SESSION_NOT_BOUND: '先在当前会话关联 Logseq 工作，才能选择已有工作。自由活动可以直接保存。',
  WORKSPACE_NOT_BOUND: '当前目录还没有 Logseq 连接。',
  WORKSPACE_OFFLINE: 'Logseq 工作连接已离线。',
  CONNECTION_STALE: '工作连接已改变，请重新关联。',
  INPUT_BUSY: '输入框正忙，请稍后再试。',
}[code] ?? '暂时无法完成，请稍后重试。');

const isFree = entry => !entry.reference;

function ReferenceChooser({ sessionId, rpc, onPick, onClose }) {
  const [items, setItems] = useState(null), [error, setError] = useState(''), [search, setSearch] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setItems(null); setError('');
    rpc('planner-references', { sessionId }).then(list => {
      if (active) setItems(list.filter((item, index, all) => all.findIndex(other => other.graphId === item.graphId && other.blockUuid === item.blockUuid) === index));
    }).catch(failure => { if (active) { setItems([]); setError(errorMessage(failure.code)); } });
    return () => { active = false; };
  }, [sessionId, rpc, attempt]);
  const filtered = (items ?? []).filter(item => item.title.toLowerCase().includes(search.toLowerCase()));
  return <div className="sp-chooser" aria-label="选择已有工作">
    <div className="sp-chooser-head"><input autoFocus aria-label="搜索已有工作" placeholder="搜索 Task、MiniProject、Project" value={search} onChange={event => setSearch(event.target.value)} /><button type="button" onClick={onClose}>取消</button></div>
    {error ? <p className="sp-chooser-note">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></p> : null}
    {items === null ? <p className="sp-chooser-note">正在读取当前会话的工作…</p> : null}
    {items && !filtered.length && !error ? <p className="sp-chooser-note">{items.length ? '没有匹配的工作。' : '当前工作里还没有可引用的事项。'}</p> : null}
    <div className="sp-chooser-list">{filtered.map(item => <button type="button" key={`${item.graphId}:${item.blockUuid}`} onClick={() => onPick(item)}>
      <span className="sp-kind">{referenceKindLabel(item.kind)}{item.objectId ? '' : ' · 工作标记'}</span>
      <span className="sp-chooser-title">{item.title}</span>
    </button>)}</div>
  </div>;
}

function Composer({ date, slot, today, sessionId, rpc, busy, onSave, onClose }) {
  const [title, setTitle] = useState(''), [planned, setPlanned] = useState(null), [reference, setReference] = useState(null);
  const [choosing, setChoosing] = useState(false), [localError, setLocalError] = useState('');
  return <form className="sp-composer" onSubmit={event => {
    event.preventDefault();
    if (!title.trim()) { setLocalError('写点什么，再留出时间。'); return; }
    onSave({ title: title.trim(), date, slotId: slot.id, reference, plannedMinutes: planned, actualMinutes: null, dueAt: null });
  }}>
    <p className="sp-composer-context">{relativeDateLabel(date, today)} · {slot.name}{slotRangeLabel(slot) ? ` ${slotRangeLabel(slot)}` : ''}</p>
    <input className="sp-title-input" autoFocus aria-label="安排内容" placeholder="这段时间想做什么？" maxLength={300} value={title} onChange={event => { setTitle(event.target.value); setLocalError(''); }} />
    <div className="sp-composer-row">
      <span className="sp-label">计划投入</span>
      {[30, 60, 90].map(value => <button type="button" className="sp-chip" key={value} aria-pressed={planned === value} onClick={() => setPlanned(planned === value ? null : value)}>{value} 分</button>)}
      {reference ? <span className="sp-ref-inline"><span className="sp-kind">{referenceKindLabel(reference.kind)}</span>{reference.title}<button type="button" aria-label="移除工作引用" onClick={() => setReference(null)}>×</button></span> : <button type="button" className="sp-link" onClick={() => setChoosing(!choosing)}>↗ 关联已有工作</button>}
    </div>
    {choosing ? <ReferenceChooser sessionId={sessionId} rpc={rpc} onPick={value => { setReference(value); if (!title.trim()) setTitle(value.title); setChoosing(false); }} onClose={() => setChoosing(false)} /> : null}
    {localError ? <p className="sp-form-error">{localError}</p> : null}
    <div className="sp-form-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '留出时间'}</button></div>
  </form>;
}

function EntryEditor({ entry, slots, sessionId, rpc, busy, onSave, onDelete, onReorder, onClose }) {
  const [form, setForm] = useState(() => ({ ...entry, plannedMinutes: entry.plannedMinutes ?? '', actualMinutes: entry.actualMinutes ?? '', dueAt: entry.dueAt ?? '' }));
  const [choosing, setChoosing] = useState(false), [localError, setLocalError] = useState('');
  const set = patch => { setForm(value => ({ ...value, ...patch })); setLocalError(''); };
  const number = value => value === '' ? null : Number(value);
  return <form className="sp-editor" aria-label="编辑安排" onSubmit={event => {
    event.preventDefault();
    if (!form.title.trim()) { setLocalError('安排需要一个标题。'); return; }
    const planned = number(form.plannedMinutes), actual = number(form.actualMinutes);
    if ((planned !== null && (!Number.isInteger(planned) || planned < 0 || planned > 1440)) || (actual !== null && (!Number.isInteger(actual) || actual < 0 || actual > 1440))) {
      setLocalError('投入分钟需要是 0 到 1440 之间的整数。'); return;
    }
    onSave({ ...form, title: form.title.trim(), plannedMinutes: planned, actualMinutes: actual, dueAt: form.dueAt || null });
  }}>
    <div className="sp-editor-head">
      <input className="sp-title-input" autoFocus aria-label="安排标题" maxLength={300} value={form.title} onChange={event => set({ title: event.target.value })} />
      <div className="sp-order"><button type="button" disabled={busy} aria-label="上移安排" title="上移" onClick={() => onReorder(entry, -1)}>↑</button><button type="button" disabled={busy} aria-label="下移安排" title="下移" onClick={() => onReorder(entry, 1)}>↓</button></div>
    </div>
    <div className="sp-fields">
      <label>计划日期<input type="date" required value={form.date} onChange={event => set({ date: event.target.value })} /></label>
      <label>计划时段<select value={form.slotId} onChange={event => set({ slotId: event.target.value })}>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></label>
      <label>计划投入（分钟）<input type="number" min="0" max="1440" step="5" value={form.plannedMinutes} placeholder="未设计划" onChange={event => set({ plannedMinutes: event.target.value })} /></label>
      <label>截止时间<input type="datetime-local" step="60" value={form.dueAt} onChange={event => set({ dueAt: event.target.value })} /></label>
    </div>
    <div className="sp-actual-row">
      <label>实际投入（分钟）<input type="number" min="0" max="1440" step="5" value={form.actualMinutes} placeholder="0" onChange={event => set({ actualMinutes: event.target.value })} /></label>
      <div className="sp-quick"><span className="sp-label">快速记录</span>{[15, 30, 45].map(value => <button type="button" className="sp-chip" key={value} disabled={busy} onClick={() => set({ actualMinutes: (number(form.actualMinutes) ?? 0) + value })}>＋{value}</button>)}</div>
    </div>
    <p className="sp-hint">计划与实际分开记录。它们不会改变 Task 状态、截止时间或 Logseq 正文。</p>
    {form.reference ? <div className="sp-reference"><span className="sp-kind">{referenceKindLabel(form.reference.kind)}</span><span>{form.reference.title}</span><button type="button" aria-label="移除工作引用" onClick={() => set({ reference: null })}>移除</button></div> : <button type="button" className="sp-link" onClick={() => setChoosing(!choosing)}>↗ 关联已有工作（可选）</button>}
    {choosing ? <ReferenceChooser sessionId={sessionId} rpc={rpc} onPick={value => { set({ reference: value, title: form.title.trim() || value.title }); setChoosing(false); }} onClose={() => setChoosing(false)} /> : null}
    {localError ? <p className="sp-form-error">{localError}</p> : null}
    <div className="sp-form-actions"><button type="button" className="sp-danger" disabled={busy} onClick={() => onDelete(entry)}>删除安排</button><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '保存安排'}</button></div>
  </form>;
}

function SlotSettings({ slots, busy, onSave, onClose }) {
  const [list, setList] = useState(() => slots.map(value => ({ ...value, start: value.start ?? '', end: value.end ?? '' })));
  const [localError, setLocalError] = useState('');
  const update = (index, patch) => setList(value => value.map((item, position) => position === index ? { ...item, ...patch } : item));
  const move = (index, delta) => setList(value => { const next = [...value]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  return <form className="sp-settings" aria-label="编辑时间段" onSubmit={event => {
    event.preventDefault();
    if (list.some(item => !item.name.trim())) { setLocalError('每个时间段都需要一个名字。'); return; }
    for (const item of list) {
      if (Boolean(item.start) !== Boolean(item.end)) { setLocalError('时间范围要么都填，要么都留空。'); return; }
      if (item.start && item.end && item.end <= item.start) { setLocalError('结束时间需要晚于开始时间。'); return; }
    }
    onSave(list.map(item => ({ id: item.id || undefined, name: item.name.trim(), start: item.start || null, end: item.end || null })));
  }}>
    <div className="sp-settings-head"><div><h3>你的日常节奏</h3><p>按从早到晚排列。时间范围可选，不用于自动排程。</p></div><button type="button" aria-label="关闭时间段设置" onClick={onClose}>×</button></div>
    <div className="sp-settings-list">{list.map((item, index) => <div className="sp-settings-row" key={item.id || `new-${index}`}>
      <input aria-label={`时间段 ${index + 1} 名称`} maxLength={40} placeholder="例如：上午核心时间" value={item.name} onChange={event => update(index, { name: event.target.value })} />
      <input type="time" step="60" aria-label={`${item.name || '时间段'}开始时间`} value={item.start} onChange={event => update(index, { start: event.target.value })} />
      <input type="time" step="60" aria-label={`${item.name || '时间段'}结束时间`} value={item.end} onChange={event => update(index, { end: event.target.value })} />
      <div className="sp-settings-actions"><button type="button" disabled={index === 0 || busy} aria-label="上移时间段" onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === list.length - 1 || busy} aria-label="下移时间段" onClick={() => move(index, 1)}>↓</button><button type="button" disabled={list.length === 1 || busy} aria-label={`删除${item.name || '时间段'}`} onClick={() => setList(value => value.filter((_, position) => position !== index))}>×</button></div>
    </div>)}</div>
    <button type="button" className="sp-link" disabled={list.length >= 12 || busy} onClick={() => setList(value => [...value, { id: '', name: '', start: '', end: '' }])}>＋ 添加时间段</button>
    <p className="sp-hint">删除时间段时，其中安排会移到第一个时间段。所有改动都可以撤销。</p>
    {localError ? <p className="sp-form-error">{localError}</p> : null}
    <div className="sp-form-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '保存时间段'}</button></div>
  </form>;
}

function EntryCard({ entry, today, canDrag, dragging, canHandoff, busy, onEdit, onHandoff, onRecord, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const planned = entry.plannedMinutes, actual = entry.actualMinutes ?? 0;
  const ratio = planned ? Math.min(100, (actual / planned) * 100) : 0;
  return <article className={`sp-card ${isFree(entry) ? 'sp-free' : 'sp-work'}${dragging ? ' sp-dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
    <div className="sp-card-head">
      <button type="button" className="sp-grip" draggable={canDrag} disabled={busy} aria-label="拖动安排" title="拖动调整时段或顺序" onDragStart={onDragStart} onDragEnd={onDragEnd}>⠿</button>
      <button type="button" className="sp-card-title" onClick={onEdit}>{entry.title}</button>
      {canHandoff ? <button type="button" className="sp-handoff" aria-label={`把「${entry.title}」带入 DSH 输入框`} title="带入 DSH 输入框，不发送" onClick={onHandoff}>↗ 对话</button> : null}
    </div>
    {entry.reference ? <div className="sp-reference"><span className="sp-kind">{referenceKindLabel(entry.reference.kind)}</span><span className="sp-reference-title">{entry.reference.title}</span></div> : null}
    <div className="sp-meta">
      <span>{planned === null ? <span className="sp-muted">未设计划</span> : `计划 ${compactMinutes(planned)}`}</span>
      <span className="sp-actual">实际 {actual ? compactMinutes(actual) : '0'}<button type="button" className="sp-plus" disabled={busy} aria-label="记录 15 分钟实际投入" title="记录 15 分钟实际投入" onClick={onRecord}>＋15</button></span>
      {entry.dueAt ? <span className="sp-due">截止 {dueLabel(entry.dueAt, today)}</span> : null}
    </div>
    {planned ? <div className="sp-progress" role="img" aria-label={`计划 ${durationLabel(planned)}，实际 ${durationLabel(actual)}`}><span style={{ width: `${ratio}%` }} /></div> : null}
  </article>;
}

export function createPlanner({ rpc }) {
  return function Planner(props) {
    const tab = props.useTabInfo(), sessionId = props.sessionId;
    const [state, setState] = useState(null), [mode, setMode] = useState('today'), [today, setToday] = useState(dateKey);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(null);
    const [editor, setEditor] = useState(null), [settingsOpen, setSettingsOpen] = useState(false);
    const [drag, setDrag] = useState(null), [over, setOver] = useState(null);

    async function load() {
      try {
        const next = await rpc('planner-read', { sessionId });
        setState(next); setError('');
      } catch (failure) { setError(errorMessage(failure.code)); }
    }
    useEffect(() => { const timer = setInterval(() => setToday(dateKey()), 30000); return () => clearInterval(timer); }, []);
    useEffect(() => { if (tab.tab.visible) void load(); }, [tab.tab.visible, sessionId]);
    useEffect(() => tab.tab.actions.bindCommands({ refresh: () => { void load(); } }), [sessionId, tab.tab.actions]);
    useEffect(() => { setEditor(null); setSettingsOpen(false); setNotice(null); setError(''); }, [sessionId]);
    useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 7000); return () => clearTimeout(timer); }, [notice]);

    const locked = busy || Boolean(editor) || settingsOpen;
    async function change(payload, message) {
      if (!state || busy) return false;
      setBusy(true); setError('');
      try {
        const next = await rpc('planner-change', { sessionId, revision: state.revision, ...payload });
        const { undoneLabel, ...doc } = next;
        setState(doc);
        setNotice({ text: undoneLabel ? `已撤销：${undoneLabel}` : message, undo: !undoneLabel && payload.action !== 'undo' });
        return true;
      } catch (failure) {
        if (['PLANNER_CONFLICT', 'PLANNER_MISSING'].includes(failure.code)) await load();
        setError(errorMessage(failure.code));
        return false;
      } finally { setBusy(false); }
    }
    function openNew(date, slotId) {
      if (locked) return;
      setEditor({ isNew: true, entry: { title: '', date, slotId, reference: null, plannedMinutes: null, actualMinutes: null, dueAt: null } });
      setNotice(null); setError('');
    }
    function openEdit(entry) { if (busy || settingsOpen || editor) return; setEditor({ isNew: false, entry: { ...entry } }); setNotice(null); setError(''); }
    async function saveEntry(entry) { if (await change({ action: 'save', entry }, entry.id ? '安排已更新' : '已留出时间')) setEditor(null); }
    async function deleteEntry(entry) { if (await change({ action: 'delete', id: entry.id }, `已删除「${entry.title}」，可撤销`)) setEditor(null); }
    async function record(entry, minutes) { await change({ action: 'record', id: entry.id, minutes }, `记录了 ${minutes} 分钟实际投入`); }
    async function reorder(entry, direction) { await change({ action: 'reorder', id: entry.id, direction }, '顺序已调整'); }
    async function undo() { if (locked) return; await change({ action: 'undo' }, '已撤销'); }
    async function saveSlots(slots) { if (await change({ action: 'slots', slots }, '时间段已更新')) setSettingsOpen(false); }
    function startDrag(event, entry) {
      if (!canDragEntry()) { event.preventDefault(); return; }
      setDrag(entry.id); setOver(null); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id);
    }
    const canDragEntry = () => !busy && !editor && !settingsOpen;
    function endDrag() { setDrag(null); setOver(null); }
    async function drop(event, date, slotId, beforeId) {
      event?.preventDefault(); event?.stopPropagation();
      const id = drag; setDrag(null); setOver(null);
      if (!id || busy || !state) return;
      const entry = state.entries.find(item => item.id === id);
      if (!entry) return;
      if (entry.date === date && entry.slotId === slotId) {
        const group = state.entries.filter(item => item.date === date && item.slotId === slotId);
        const position = group.findIndex(item => item.id === id);
        if (beforeId === id) return;
        if (beforeId === null && position === group.length - 1) return;
        if (beforeId && group.findIndex(item => item.id === beforeId) === position + 1) return;
      }
      await change({ action: 'move', id, date, slotId, beforeId }, '安排已移动');
    }
    function handoff(entry) {
      if (!props.inputActions) { setNotice({ text: '请先打开一个对话，再带入安排。' }); return; }
      const slot = state.slots.find(item => item.id === entry.slotId);
      try {
        const span = props.inputActions.captureInsertion();
        const prefix = span?.start > 0 ? '\n' : '';
        if (!props.inputActions.insertText(prefix + handoffText(entry, slot, today), span)) { setNotice({ text: '输入框正在提交或内容已变化，没有放入。请稍后再试。' }); return; }
        props.inputActions.focus?.();
        setNotice({ text: `已把「${entry.title}」放入 DSH 输入框，未发送。` });
      } catch { setNotice({ text: '当前输入框不可用，没有放入。' }); }
    }

    if (!state) return <section className="sp" aria-label="个人时间规划"><header className="sp-loading"><span className="sp-eyebrow">个人时间规划</span><h1>时间规划</h1></header><p className="sp-muted" role="status">{error || '正在打开你的时间规划…'}</p>{error ? <button type="button" className="sp-primary" onClick={() => void load()}>重新读取</button> : null}</section>;

    const dates = visibleDates(mode, today), week = mode === 'week';
    const shown = state.entries.filter(entry => dates.includes(entry.date));
    const summary = dayTotals(shown);
    const title = week ? '本周' : mode === 'tomorrow' ? '明天' : '今天';
    const subtitle = week ? `${shortDateLabel(dates[0])} – ${shortDateLabel(dates[6])}` : dateLabel(dates[0]);

    function renderSlot(date, slot, entries) {
      const composing = editor?.isNew && editor.entry.date === date && editor.entry.slotId === slot.id;
      const overHere = drag && over?.slotId === slot.id;
      return <section key={slot.id} className={`sp-slot${overHere ? ' sp-over' : ''}`} aria-label={`${dateLabel(date)} ${slot.name}`}
        onDragOver={event => { if (drag) { event.preventDefault(); setOver({ slotId: slot.id, beforeId: null }); } }}
        onDrop={event => void drop(event, date, slot.id, null)}>
        <header className="sp-slot-head"><h3>{slot.name}</h3>{slotRangeLabel(slot) ? <span className="sp-range">{slotRangeLabel(slot)}</span> : null}<button type="button" className="sp-add" disabled={locked} aria-label={`添加到${dateLabel(date)} ${slot.name}`} onClick={() => openNew(date, slot.id)}>＋</button></header>
        {composing ? <Composer date={date} slot={slot} today={today} sessionId={sessionId} rpc={rpc} busy={busy} onSave={saveEntry} onClose={() => setEditor(null)} /> : null}
        {entries.map(entry => {
          const editing = editor && !editor.isNew && editor.entry.id === entry.id;
          return <React.Fragment key={entry.id}>
            {overHere && over.beforeId === entry.id ? <div className="sp-drop-line" aria-hidden="true" /> : null}
            {editing ? <EntryEditor key={entry.id} entry={entry} slots={state.slots} sessionId={sessionId} rpc={rpc} busy={busy} onSave={saveEntry} onDelete={deleteEntry} onReorder={reorder} onClose={() => setEditor(null)} /> : <EntryCard entry={entry} today={today} canDrag={canDragEntry()} dragging={drag === entry.id} canHandoff={Boolean(props.inputActions)} busy={busy}
              onEdit={() => openEdit(entry)} onHandoff={() => handoff(entry)} onRecord={() => void record(entry, 15)}
              onDragStart={event => startDrag(event, entry)} onDragEnd={endDrag}
              onDragOver={event => { if (!drag) return; event.preventDefault(); event.stopPropagation(); setOver({ slotId: slot.id, beforeId: entry.id }); }}
              onDrop={event => void drop(event, date, slot.id, entry.id)} />}
          </React.Fragment>;
        })}
        {overHere && !over.beforeId ? <div className="sp-drop-line" aria-hidden="true" /> : null}
        {!entries.length && !composing && !drag ? <button type="button" className="sp-empty" disabled={locked} onClick={() => openNew(date, slot.id)}>留一点时间给…</button> : null}
      </section>;
    }

    function renderDay(date, compact) {
      const entries = state.entries.filter(entry => entry.date === date);
      const totals = dayTotals(entries), composing = editor?.isNew && editor.entry.date === date;
      const used = new Set(entries.map(entry => entry.slotId)); if (composing) used.add(editor.entry.slotId);
      const slots = compact && date !== today ? state.slots.filter(slot => used.has(slot.id)) : state.slots;
      const label = relativeDateLabel(date, today);
      return <section key={date} className={`sp-day${date === today ? ' sp-today' : ''}${compact ? ' sp-compact' : ' sp-solo'}`} aria-label={dateLabel(date)}>
        {compact ? <header className="sp-day-head"><div className="sp-day-title"><h2>{label}</h2><span>{label === '今天' || label === '明天' || label === '昨天' ? dateLabel(date) : shortDateLabel(date)}</span></div>
          <div className="sp-day-totals">{entries.length ? `${entries.length} 项` : '空闲'}{totals.planned ? ` · 计划 ${compactMinutes(totals.planned)}` : ''}{totals.actual ? ` · 实际 ${compactMinutes(totals.actual)}` : ''}</div>
          <button type="button" className="sp-day-add" disabled={locked} aria-label={`在${dateLabel(date)}添加安排`} onClick={() => openNew(date, state.slots[0].id)}>＋</button></header> : null}
        {slots.map(slot => renderSlot(date, slot, entries.filter(entry => entry.slotId === slot.id)))}
      </section>;
    }

    return <section className="sp" aria-label="个人时间规划">
      <header className="sp-head">
        <div><span className="sp-eyebrow">个人时间规划</span><h1>{title}</h1><p className="sp-date">{subtitle}</p></div>
        <div className="sp-head-actions">
          <button type="button" className="sp-icon" disabled={locked || !state.canUndo} title={state.undoLabel ? `撤销：${state.undoLabel}` : '暂无可撤销的操作'} aria-label="撤销上一步" onClick={() => void undo()}>↶</button>
          <button type="button" className="sp-icon" disabled={locked} title="编辑时间段" aria-label="编辑时间段" onClick={() => { setEditor(null); setSettingsOpen(true); }}>⋯</button>
        </div>
      </header>
      <nav className="sp-modes" aria-label="查看范围">{[['today', '今天'], ['tomorrow', '明天'], ['week', '本周']].map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key} disabled={locked} onClick={() => setMode(key)}>{label}</button>)}</nav>
      <div className="sp-summary"><span>{summary.count ? `${summary.count} 项安排` : week ? '本周还没有安排' : '还没有安排 · 从下面任一时段开始'}</span>{summary.planned ? <span>计划 {durationLabel(summary.planned)}</span> : null}{summary.actual ? <span>实际 {durationLabel(summary.actual)}</span> : null}</div>
      {error ? <p className="sp-error" role="alert">{error}<button type="button" onClick={() => void load()}>重新读取</button></p> : null}
      <div className="sp-status" role="status">{busy ? '正在保存…' : notice?.text ?? ''}{notice?.undo && !locked ? <button type="button" onClick={() => void undo()}>撤销</button> : null}</div>
      {settingsOpen ? <SlotSettings slots={state.slots} busy={busy} onSave={saveSlots} onClose={() => setSettingsOpen(false)} /> : null}
      <div className={week ? 'sp-week' : 'sp-days'}>{dates.map(date => renderDay(date, week))}</div>
      <footer className="sp-footer">拖动 ⠿ 调整顺序与时段 · 点击标题编辑 · 计划不改动工作状态</footer>
    </section>;
  };
}
