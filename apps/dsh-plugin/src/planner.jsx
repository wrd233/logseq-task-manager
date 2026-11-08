/* global document, window, setInterval, clearInterval, setTimeout, clearTimeout */
import React, { useEffect, useRef, useState } from 'react';
import {
  compactMinutes, dateKey, dateLabel, dayTotals, dueLabel, durationLabel, insertPlanDraft,
  referenceKindLabel, relativeDateLabel, shortDateLabel, slotRangeLabel, visibleDates,
} from './planner-model.mjs';
import { localNow, timeOf, dateOf } from './work-experience/model.mjs';

const errorMessage = code => ({
  PLANNER_CONFLICT: '规划已在别处更新，已载入最新版。你的编辑仍在，请确认后再保存。',
  PLANNER_INVALID: '请检查标题、日期、时段或投入分钟数。',
  PLANNER_MISSING: '这项安排已经不存在，已载入最新规划。',
  PLANNER_REFERENCE_MISSING: '这个工作引用已不在当前工作范围。请重新选择，或移除引用后保存。',
  PLANNER_FIXED_EDIT_REQUIRED: '固定安排不能拖动；请打开编辑修改开始和结束时间。',
  PLANNER_CORRUPT: '规划文件无法读取。文件没有被覆盖，请检查本机数据。',
  PLANNER_VERSION: '规划文件版本较新，请更新 DSH 插件。',
  SESSION_NOT_BOUND: '先在当前会话关联 Logseq 工作，才能选择已有工作。自由活动可以直接保存。',
  WORKSPACE_NOT_BOUND: '当前目录还没有 Logseq 连接。',
  WORKSPACE_OFFLINE: 'Logseq 工作连接已离线。',
  CONNECTION_STALE: '工作连接已改变，请重新关联。',
  INPUT_BUSY: '输入框正忙，请稍后再试。',
  SESSION_CWD_MISMATCH: '对话目录与这件工作的目录不同，请从工作入口进入。',
}[code] ?? '暂时无法完成，请稍后重试。');

const isFree = entry => !entry.reference;
const isFixed = entry => entry.schedule === 'fixed';
const dayName = (date, today) => {
  const label = relativeDateLabel(date, today);
  return ['今天', '明天', '昨天'].includes(label) ? label : shortDateLabel(date);
};
const plannerSummary = summary => summary.count
  ? [`${summary.count} 项`, summary.planned ? `计划 ${compactMinutes(summary.planned)}` : null, summary.actual ? `实际 ${compactMinutes(summary.actual)}` : null].filter(Boolean).join(' · ')
  : '还没有安排';
const fixedRange = entry => {
  if (!entry?.startAt || !entry?.endAt) return '';
  const next = dateOf(entry.endAt) !== dateOf(entry.startAt) ? '次日 ' : '';
  return `${timeOf(entry.startAt)}–${next}${timeOf(entry.endAt)}`;
};
const activeFixed = (entry, localAt) => Boolean(localAt && entry.startAt <= localAt && localAt < entry.endAt);
const fixedOnDate = (entry, date) => isFixed(entry) && dateOf(entry.startAt) <= date && dateOf(entry.endAt) >= date;
const localInput = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
function defaultFixedStart(date) {
  if (date !== dateKey()) return `${date}T09:00`;
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil((start.getMinutes() + 5) / 30) * 30);
  return localInput(start);
}
const addMinutes = (value, minutes) => {
  const date = new Date(`${value}:00`);
  date.setMinutes(date.getMinutes() + minutes);
  return localInput(date);
};

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
    <div className="sp-chooser-head"><input autoFocus aria-label="搜索已有工作" placeholder="搜索已有工作" value={search} onChange={event => setSearch(event.target.value)} /><button type="button" onClick={onClose}>取消</button></div>
    {error ? <p className="sp-chooser-note">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></p> : null}
    {items === null ? <p className="sp-chooser-note">正在读取当前会话的工作…</p> : null}
    {items && !filtered.length && !error ? <p className="sp-chooser-note">{items.length ? '没有匹配的工作。' : '当前工作里还没有可引用的事项。'}</p> : null}
    <div className="sp-chooser-list">{filtered.map(item => <button type="button" key={`${item.graphId}:${item.blockUuid}`} onClick={() => onPick(item)}>
      <span className="sp-kind">{referenceKindLabel(item.kind)}{item.objectId ? '' : ' · 工作标记'}</span>
      <span className="sp-chooser-title">{item.title}</span>
    </button>)}</div>
  </div>;
}

function ReferenceChip({ reference, onRemove }) {
  return <span className="sp-ref-chip"><span className="sp-ref-kind">↗ {referenceKindLabel(reference.kind)}</span><span className="sp-ref-title">{reference.title}</span><button type="button" aria-label="移除工作引用" onClick={onRemove}>×</button></span>;
}

function Composer({ date, slot, sessionId, rpc, busy, onSave, onClose }) {
  const [title, setTitle] = useState(''), [planned, setPlanned] = useState(null), [reference, setReference] = useState(null);
  const [choosing, setChoosing] = useState(false), [localError, setLocalError] = useState('');
  return <form className="sp-composer" onSubmit={event => {
    event.preventDefault();
    if (!title.trim()) { setLocalError('写点什么，再留出时间。'); return; }
    onSave({ title: title.trim(), schedule: 'flexible', date, slotId: slot.id, reference, plannedMinutes: planned, actualMinutes: null, dueAt: null });
  }}>
    <input className="sp-title-input" autoFocus aria-label="安排内容" placeholder="这段时间想做什么？" maxLength={300} value={title} onChange={event => { setTitle(event.target.value); setLocalError(''); }} />
    <div className="sp-composer-row">
      <span className="sp-label">计划投入</span>
      {[[30, '30 分'], [60, '1 小时'], [90, '1.5 小时']].map(([value, label]) => <button type="button" className="sp-chip" key={value} aria-pressed={planned === value} onClick={() => setPlanned(planned === value ? null : value)}>{label}</button>)}
      {reference ? <ReferenceChip reference={reference} onRemove={() => setReference(null)} /> : <button type="button" className="sp-link" onClick={() => setChoosing(!choosing)}>↗ 关联工作</button>}
    </div>
    {choosing ? <ReferenceChooser sessionId={sessionId} rpc={rpc} onPick={value => { setReference(value); if (!title.trim()) setTitle(value.title); setChoosing(false); }} onClose={() => setChoosing(false)} /> : null}
    {localError ? <p className="sp-form-error">{localError}</p> : null}
    <div className="sp-form-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '留出时间'}</button></div>
  </form>;
}

function FixedComposer({ date, sessionId, rpc, busy, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ title: '', startAt: defaultFixedStart(date), endAt: addMinutes(defaultFixedStart(date), 60), plannedMinutes: null, reference: null }));
  const [choosing, setChoosing] = useState(false), [localError, setLocalError] = useState('');
  const set = patch => { setForm(value => ({ ...value, ...patch })); setLocalError(''); };
  return <form className="sp-composer sp-fixed-composer" onSubmit={event => {
    event.preventDefault();
    if (!form.title.trim()) { setLocalError('固定安排需要一个标题。'); return; }
    if (!form.startAt || !form.endAt || form.startAt >= form.endAt) { setLocalError('结束时间需要晚于开始时间。'); return; }
    onSave({ title: form.title.trim(), schedule: 'fixed', startAt: form.startAt, endAt: form.endAt, date: form.startAt.slice(0, 10), slotId: null,
      reference: form.reference, plannedMinutes: form.plannedMinutes, actualMinutes: null, dueAt: null });
  }}>
    <div className="sp-fixed-form-head"><span className="sp-fixed-badge">固定时间</span><span>有明确的开始与结束；不会随拖动移动。</span></div>
    <input className="sp-title-input" autoFocus aria-label="固定安排内容" placeholder="例如：与团队评审方案" maxLength={300} value={form.title} onChange={event => set({ title: event.target.value })} />
    <div className="sp-fixed-form-row">
      <label>开始<input type="datetime-local" step="60" value={form.startAt} onChange={event => set({ startAt: event.target.value })} /></label>
      <label>结束<input type="datetime-local" step="60" value={form.endAt} onChange={event => set({ endAt: event.target.value })} /></label>
    </div>
    <div className="sp-composer-row">
      <span className="sp-label">计划投入</span>
      {[[30, '30 分'], [60, '1 小时'], [90, '1.5 小时']].map(([value, label]) => <button type="button" className="sp-chip" key={value} aria-pressed={form.plannedMinutes === value} onClick={() => set({ plannedMinutes: form.plannedMinutes === value ? null : value })}>{label}</button>)}
      {form.reference ? <ReferenceChip reference={form.reference} onRemove={() => set({ reference: null })} /> : <button type="button" className="sp-link" onClick={() => setChoosing(!choosing)}>↗ 关联工作</button>}
    </div>
    {choosing ? <ReferenceChooser sessionId={sessionId} rpc={rpc} onPick={value => { set({ reference: value, title: form.title.trim() || value.title }); setChoosing(false); }} onClose={() => setChoosing(false)} /> : null}
    {localError ? <p className="sp-form-error">{localError}</p> : null}
    <div className="sp-form-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '固定下来'}</button></div>
  </form>;
}

function EntryEditor({ entry, slots, today, sessionId, rpc, busy, onSave, onDelete, onReorder, onClose }) {
  const [form, setForm] = useState(() => ({ schedule: entry.schedule ?? 'flexible', ...entry, plannedMinutes: entry.plannedMinutes ?? '', actualMinutes: entry.actualMinutes ?? '', dueAt: entry.dueAt ?? '' }));
  const [showWhen, setShowWhen] = useState(false), [showDue, setShowDue] = useState(false);
  const [choosing, setChoosing] = useState(false), [localError, setLocalError] = useState('');
  const set = patch => { setForm(value => ({ ...value, ...patch })); setLocalError(''); };
  const number = value => value === '' ? null : Number(value);
  const slot = slots.find(value => value.id === form.slotId), fixed = form.schedule === 'fixed';
  return <form className="sp-editor" aria-label="编辑安排" onSubmit={event => {
    event.preventDefault();
    if (!form.title.trim()) { setLocalError('安排需要一个标题。'); return; }
    if (fixed && (!form.startAt || !form.endAt || form.startAt >= form.endAt)) { setLocalError('结束时间需要晚于开始时间。'); return; }
    const planned = number(form.plannedMinutes), actual = number(form.actualMinutes);
    if ((planned !== null && (!Number.isInteger(planned) || planned < 0 || planned > 1440)) || (actual !== null && (!Number.isInteger(actual) || actual < 0 || actual > 1440))) {
      setLocalError('投入分钟需要是 0 到 1440 之间的整数。'); return;
    }
    onSave({ ...form, title: form.title.trim(), plannedMinutes: planned, actualMinutes: actual, dueAt: form.dueAt || null,
      ...(fixed ? { date: form.startAt.slice(0, 10), slotId: null } : {}) });
  }}>
    <input className="sp-title-input" autoFocus aria-label="安排标题" maxLength={300} value={form.title} onChange={event => set({ title: event.target.value })} />
    {fixed ? <div className="sp-fixed-edit">
      <div className="sp-fixed-form-head"><span className="sp-fixed-badge">固定时间</span><span>{fixedRange(form)} · 只有编辑才能调整</span></div>
      <div className="sp-fixed-form-row">
        <label>开始<input type="datetime-local" step="60" value={form.startAt} onChange={event => set({ startAt: event.target.value })} /></label>
        <label>结束<input type="datetime-local" step="60" value={form.endAt} onChange={event => set({ endAt: event.target.value })} /></label>
      </div>
    </div> : null}
    <div className="sp-edit-metrics">
      <label className="sp-metric"><span>计划</span><input type="number" min="0" max="1440" step="5" value={form.plannedMinutes} placeholder="—" onChange={event => set({ plannedMinutes: event.target.value })} /><em>分</em></label>
      <label className="sp-metric"><span>实际</span><input type="number" min="0" max="1440" step="5" value={form.actualMinutes} placeholder="0" onChange={event => set({ actualMinutes: event.target.value })} /><em>分</em></label>
      <div className="sp-quick">{[15, 30, 45].map(value => <button type="button" className="sp-chip" key={value} disabled={busy} onClick={() => set({ actualMinutes: (number(form.actualMinutes) ?? 0) + value })}>＋{value}</button>)}</div>
    </div>
    <div className="sp-edit-meta">
      {fixed ? <span className="sp-when-static">固定安排 · {fixedRange(form)}</span> : <button type="button" className="sp-when" aria-expanded={showWhen} title="修改日期或时段" onClick={() => setShowWhen(!showWhen)}>
        {dayName(form.date, today)} · {slot?.name ?? '未分时段'}<span className="sp-chev">{showWhen ? '⌃' : '⌄'}</span>
      </button>}
      {!showDue ? (form.dueAt
        ? <button type="button" className="sp-due-chip" onClick={() => setShowDue(true)}>截止 {dueLabel(form.dueAt, today)}</button>
        : <button type="button" className="sp-link" onClick={() => setShowDue(true)}>＋ 截止</button>) : null}
      {form.reference ? <ReferenceChip reference={form.reference} onRemove={() => set({ reference: null })} /> : <button type="button" className="sp-link" onClick={() => setChoosing(!choosing)}>↗ 关联工作</button>}
      {!fixed ? <div className="sp-order"><button type="button" disabled={busy} aria-label="上移安排" title="上移" onClick={() => onReorder(entry, -1)}>↑</button><button type="button" disabled={busy} aria-label="下移安排" title="下移" onClick={() => onReorder(entry, 1)}>↓</button></div> : null}
    </div>
    {showWhen && !fixed ? <div className="sp-advanced">
      <label>日期<input type="date" required value={form.date} onChange={event => set({ date: event.target.value })} /></label>
      <label>时段<select value={form.slotId} onChange={event => set({ slotId: event.target.value })}>{slots.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
    </div> : null}
    {showDue ? <div className="sp-advanced">
      <label>截止<input type="datetime-local" step="60" value={form.dueAt} onChange={event => set({ dueAt: event.target.value })} /></label>
      <button type="button" className="sp-link" onClick={() => setShowDue(false)}>完成</button>
      {form.dueAt ? <button type="button" className="sp-link" onClick={() => set({ dueAt: '' })}>清除</button> : null}
    </div> : null}
    {choosing ? <ReferenceChooser sessionId={sessionId} rpc={rpc} onPick={value => { set({ reference: value, title: form.title.trim() || value.title }); setChoosing(false); }} onClose={() => setChoosing(false)} /> : null}
    {localError ? <p className="sp-form-error">{localError}</p> : null}
    <div className="sp-form-actions"><button type="button" className="sp-danger" disabled={busy} onClick={() => onDelete(entry)}>删除</button><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button></div>
  </form>;
}

function SlotSettings({ slots, busy, onSave, onClose }) {
  const [list, setList] = useState(() => slots.map(value => ({ ...value, start: value.start ?? '', end: value.end ?? '' })));
  const [openRange, setOpenRange] = useState(null), [localError, setLocalError] = useState('');
  const update = (index, patch) => setList(value => value.map((item, position) => position === index ? { ...item, ...patch } : item));
  const move = (index, delta) => { setList(value => { const next = [...value]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); setOpenRange(null); };
  const remove = index => { setList(value => value.filter((_, position) => position !== index)); setOpenRange(null); };
  const rangeText = item => item.start && item.end ? `${item.start}–${item.end}` : '＋ 时间';
  return <form className="sp-settings" aria-label="编辑时间段" onSubmit={event => {
    event.preventDefault();
    if (list.some(item => !item.name.trim())) { setLocalError('每个时间段都需要一个名字。'); return; }
    for (const item of list) {
      if (Boolean(item.start) !== Boolean(item.end)) { setLocalError('时间范围要么都填，要么都留空。'); return; }
      if (item.start && item.end && item.end <= item.start) { setLocalError('结束时间需要晚于开始时间。'); return; }
    }
    onSave(list.map(item => ({ id: item.id || undefined, name: item.name.trim(), start: item.start || null, end: item.end || null })));
  }}>
    <div className="sp-settings-head"><div><h3>时间段</h3><p>按一天顺序排列 · 时间范围可选</p></div><button type="button" aria-label="关闭时间段设置" onClick={onClose}>×</button></div>
    <div className="sp-settings-list">{list.map((item, index) => <div className="sp-settings-item" key={item.id || `new-${index}`}>
      <div className="sp-settings-row">
        <input className="sp-settings-name" aria-label={`时间段 ${index + 1} 名称`} maxLength={40} placeholder="例如：上午核心时间" value={item.name} onChange={event => update(index, { name: event.target.value })} />
        <button type="button" className="sp-range-button" aria-label={`${item.name || '时间段'}时间范围`} onClick={() => setOpenRange(openRange === index ? null : index)}>{rangeText(item)}</button>
        <div className="sp-settings-actions"><button type="button" disabled={index === 0 || busy} aria-label="上移时间段" onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === list.length - 1 || busy} aria-label="下移时间段" onClick={() => move(index, 1)}>↓</button><button type="button" disabled={list.length === 1 || busy} aria-label={`删除${item.name || '时间段'}`} onClick={() => remove(index)}>×</button></div>
      </div>
      {openRange === index ? <div className="sp-range-edit">
        <label>开始<input type="time" step="60" value={item.start} onChange={event => update(index, { start: event.target.value })} /></label>
        <label>结束<input type="time" step="60" value={item.end} onChange={event => update(index, { end: event.target.value })} /></label>
        <button type="button" className="sp-link" onClick={() => update(index, { start: '', end: '' })}>清除</button>
        <button type="button" className="sp-link" onClick={() => setOpenRange(null)}>完成</button>
      </div> : null}
    </div>)}</div>
    <button type="button" className="sp-link" disabled={list.length >= 12 || busy} onClick={() => setList(value => [...value, { id: '', name: '', start: '', end: '' }])}>＋ 添加时间段</button>
    <p className="sp-hint">删除时间段时，其中的安排会移到第一个时间段。</p>
    {localError ? <p className="sp-form-error">{localError}</p> : null}
    <div className="sp-form-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '保存时间段'}</button></div>
  </form>;
}

function EntryActions({ entry, sessionId, rpc, onEdit, onFocus, onHandoff }) {
  const details = useRef(null);
  const requested = useRef(false);
  const [open, setOpen] = useState(false), [url, setUrl] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!open || !entry.reference || url || requested.current) return;
    requested.current = true;
    let active = true;
    setLoading(true); setError('');
    rpc('planner-navigate', { sessionId, id: entry.id, action: 'logseq' }).then(value => { if (active) setUrl(value.logseqUrl); })
      .catch(failure => { if (active) setError(errorMessage(failure.code)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, entry.id, entry.reference, sessionId, rpc, url]);
  const close = () => { if (details.current) details.current.open = false; setOpen(false); };
  return <details ref={details} className="sp-actions" onToggle={event => { setOpen(event.currentTarget.open); if (!event.currentTarget.open) { requested.current = false; setError(''); } }}>
    <summary aria-label="安排操作" title="继续工作、打开原文或带入对话">↗</summary>
    <div className="sp-menu-pop" role="menu">
      <button type="button" role="menuitem" onClick={() => { close(); onEdit(entry); }}>编辑安排</button>
      {entry.reference ? <>
        <button type="button" role="menuitem" onClick={() => { close(); onFocus(entry); }}>在工作结构中查看</button>
        {url ? <a role="menuitem" href={url} target="_blank" rel="noreferrer" onClick={close}>在 Logseq 打开原文</a>
          : <button type="button" role="menuitem" disabled={loading} onClick={() => void 0}>{loading ? '正在定位原文…' : '在 Logseq 打开原文'}</button>}
        {error ? <span className="sp-menu-error">{error}</span> : null}
        <span className="sp-menu-sep" />
      </> : null}
      <button type="button" role="menuitem" onClick={() => { close(); onHandoff(entry); }}>带入对话草稿</button>
    </div>
  </details>;
}

function EntryCard({ entry, today, canDrag, dragging, busy, onEdit, onHandoff, onFocus, onRecord, onPointerDown, sessionId, rpc }) {
  const planned = entry.plannedMinutes, actual = entry.actualMinutes ?? 0;
  const ratio = planned && actual ? Math.min(100, (actual / planned) * 100) : 0;
  return <article className={`sp-entry ${isFree(entry) ? 'sp-free' : 'sp-work'}${dragging ? ' sp-dragging' : ''}`} data-entry-schedule="flexible" data-entry-id={entry.id}>
    <button type="button" className="sp-grip" draggable={false} aria-disabled={!canDrag} disabled={busy} aria-label="拖动安排" title="拖动调整时段或顺序" onPointerDown={onPointerDown}>⠿</button>
    <div className="sp-entry-body">
      <div className="sp-entry-head">
        <button type="button" className="sp-entry-title" onClick={() => onEdit(entry)}>{entry.title}</button>
        <div className="sp-entry-actions">
          <button type="button" className="sp-action" disabled={busy} aria-label="记录 15 分钟实际投入" title="记录 15 分钟" onClick={() => onRecord(entry)}>＋15</button>
          <EntryActions entry={entry} sessionId={sessionId} rpc={rpc} onEdit={onEdit} onFocus={onFocus} onHandoff={onHandoff} />
        </div>
      </div>
      {entry.reference ? <div className="sp-entry-ref"><span className="sp-ref-kind">↗ {referenceKindLabel(entry.reference.kind)}</span><span className="sp-ref-dot">·</span><span className="sp-ref-title">{entry.reference.title}</span></div> : null}
      {(planned || actual || entry.dueAt) ? <div className="sp-entry-meta">
        {planned ? <span>计划 {compactMinutes(planned)}</span> : null}
        {actual ? <span>实际 {compactMinutes(actual)}</span> : null}
        {planned && actual ? <span className="sp-mini" role="img" aria-label={`计划 ${durationLabel(planned)}，实际 ${durationLabel(actual)}`}><span style={{ width: `${ratio}%` }} /></span> : null}
        {entry.dueAt ? <span className="sp-due">截止 {dueLabel(entry.dueAt, today)}</span> : null}
      </div> : null}
    </div>
  </article>;
}

function FixedRow({ entry, today, localAt, busy, compact, sessionId, rpc, onEdit, onHandoff, onFocus, onRecord }) {
  const now = activeFixed(entry, localAt);
  const planned = entry.plannedMinutes, actual = entry.actualMinutes ?? 0;
  const ratio = planned && actual ? Math.min(100, (actual / planned) * 100) : 0;
  return <article className={`sp-fixed-row${now ? ' is-now' : ''}${compact ? ' is-compact' : ''}`} data-entry-schedule="fixed" data-entry-id={entry.id}>
    <div className="sp-fixed-time"><b>{timeOf(entry.startAt)}</b><span>{timeOf(entry.endAt)}{dateOf(entry.endAt) !== dateOf(entry.startAt) ? ' 次日' : ''}</span></div>
    <div className="sp-fixed-body">
      <div className="sp-fixed-row-head">
        <button type="button" className="sp-entry-title" onClick={() => onEdit(entry)}>{entry.title}</button>
        <span className="sp-fixed-badge" title="固定安排不能拖动；请通过编辑修改开始和结束时间">固定</span>
        {now ? <span className="sp-now-chip">现在</span> : null}
        <div className="sp-entry-actions">
          <button type="button" className="sp-action" disabled={busy} aria-label="记录 15 分钟实际投入" title="记录 15 分钟" onClick={() => onRecord(entry)}>＋15</button>
          <EntryActions entry={entry} sessionId={sessionId} rpc={rpc} onEdit={onEdit} onFocus={onFocus} onHandoff={onHandoff} />
        </div>
      </div>
      {!compact && entry.reference ? <div className="sp-entry-ref"><span className="sp-ref-kind">↗ {referenceKindLabel(entry.reference.kind)}</span><span className="sp-ref-dot">·</span><span className="sp-ref-title">{entry.reference.title}</span></div> : null}
      {!compact && (planned || actual || entry.dueAt) ? <div className="sp-entry-meta">
        {planned ? <span>计划 {compactMinutes(planned)}</span> : null}
        {actual ? <span>实际 {compactMinutes(actual)}</span> : null}
        {planned && actual ? <span className="sp-mini" role="img" aria-label={`计划 ${durationLabel(planned)}，实际 ${durationLabel(actual)}`}><span style={{ width: `${ratio}%` }} /></span> : null}
        {entry.dueAt ? <span className="sp-due">截止 {dueLabel(entry.dueAt, today)}</span> : null}
      </div> : null}
    </div>
  </article>;
}

function FixedSection({ label, entries, today, localAt, busy, compact, sessionId, rpc, editor, slots, onEdit, onHandoff, onFocus, onRecord, onSave, onDelete, onClose, onReorder }) {
  if (!entries.length) return null;
  return <section className={`sp-fixed-section${compact ? ' is-compact' : ''}`} aria-label={label}>
    <header className="sp-fixed-section-head"><span>{label}</span><span>{entries.length} 项固定时间</span></header>
    {entries.map(entry => editor && !editor.isNew && editor.entry.id === entry.id
      ? <EntryEditor key={`edit:${entry.id}`} entry={entry} slots={slots} today={today} sessionId={sessionId} rpc={rpc} busy={busy} onSave={onSave} onDelete={onDelete} onReorder={onReorder} onClose={onClose} />
      : <FixedRow key={entry.id} entry={entry} today={today} localAt={localAt} busy={busy} compact={compact} sessionId={sessionId} rpc={rpc}
        onEdit={onEdit} onHandoff={onHandoff} onFocus={onFocus} onRecord={onRecord} />)}
  </section>;
}

export function createPlanner({ rpc, focusWork }) {
  return function Planner(props) {
    const tab = props.useTabInfo(), sessionId = props.sessionId;
    const [state, setState] = useState(null), [current, setCurrent] = useState(null), [mode, setMode] = useState('focus'), [today, setToday] = useState(dateKey);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(null);
    const [editor, setEditor] = useState(null), [settingsOpen, setSettingsOpen] = useState(false), [fixedComposer, setFixedComposer] = useState(null);
    const [drag, setDrag] = useState(null), [over, setOver] = useState(null);
    const pointerDrag = useRef(null);

    const refreshCurrent = async () => {
      try { setCurrent(await rpc('planner-current', { sessionId, localAt: localNow() })); }
      catch { /* The full-day plan stays usable; the focus bar can retry on the next tick. */ }
    };
    async function load() {
      try {
        const [next, now] = await Promise.all([rpc('planner-read', { sessionId }), rpc('planner-current', { sessionId, localAt: localNow() })]);
        setState(next); setCurrent(now); setError('');
      } catch (failure) { setError(errorMessage(failure.code)); }
    }
    useEffect(() => { const timer = setInterval(() => setToday(dateKey()), 30000); return () => clearInterval(timer); }, []);
    useEffect(() => { if (tab.tab.visible) void load(); }, [tab.tab.visible, sessionId]);
    useEffect(() => {
      if (!tab.tab.visible) return;
      const timer = setInterval(() => { setToday(dateKey()); void refreshCurrent(); }, 30000);
      return () => clearInterval(timer);
    }, [tab.tab.visible, sessionId]);
    useEffect(() => tab.tab.actions.bindCommands({ refresh: () => { void load(); } }), [sessionId, tab.tab.actions]);
    useEffect(() => { setEditor(null); setSettingsOpen(false); setFixedComposer(null); setNotice(null); setError(''); }, [sessionId]);
    useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); }, [notice]);
    useEffect(() => {
      if (!editor) return;
      const close = event => { if (event.key === 'Escape') setEditor(null); };
      window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
    }, [editor]);

    const locked = busy || Boolean(editor) || settingsOpen || Boolean(fixedComposer);
    async function change(payload, message) {
      if (!state || busy) return false;
      setBusy(true); setError('');
      try {
        const next = await rpc('planner-change', { sessionId, revision: state.revision, ...payload });
        const { undoneLabel, ...doc } = next;
        setState(doc);
        setNotice({ text: undoneLabel ? `已撤销：${undoneLabel}` : message, undo: !undoneLabel && payload.action !== 'undo' });
        void refreshCurrent();
        return true;
      } catch (failure) {
        if (['PLANNER_CONFLICT', 'PLANNER_MISSING'].includes(failure.code)) await load();
        setError(errorMessage(failure.code));
        return false;
      } finally { setBusy(false); }
    }
    function openNew(date, slotId) {
      if (locked) return;
      setFixedComposer(null);
      setEditor({ isNew: true, entry: { title: '', schedule: 'flexible', date, slotId, reference: null, plannedMinutes: null, actualMinutes: null, dueAt: null } });
      setNotice(null); setError('');
    }
    function openFixed(date) {
      if (locked) return;
      setEditor(null); setSettingsOpen(false);
      setFixedComposer({ date });
      setNotice(null); setError('');
    }
    function openEdit(entry) { if (busy || settingsOpen || editor || fixedComposer) return; setEditor({ isNew: false, entry: { ...entry, schedule: entry.schedule ?? 'flexible' } }); setNotice(null); setError(''); }
    async function saveEntry(entry) { if (await change({ action: 'save', entry }, entry.id ? '已保存' : (entry.schedule === 'fixed' ? '已固定时间' : '已添加'))) { setEditor(null); setFixedComposer(null); } }
    async function deleteEntry(entry) { if (await change({ action: 'delete', id: entry.id }, '已删除')) setEditor(null); }
    async function record(entry, minutes) { await change({ action: 'record', id: entry.id, minutes }, `已记录 ${minutes} 分钟`); }
    async function reorder(entry, direction) { if (isFixed(entry)) { setError(errorMessage('PLANNER_FIXED_EDIT_REQUIRED')); return; } await change({ action: 'reorder', id: entry.id, direction }, '顺序已调整'); }
    async function undo() { if (locked) return; await change({ action: 'undo' }, '已撤销'); }
    async function saveSlots(slots) { if (await change({ action: 'slots', slots }, '时间段已更新')) setSettingsOpen(false); }
    const canDragEntry = entry => !busy && !editor && !settingsOpen && !fixedComposer && entry.schedule !== 'fixed';
    function beginPointerDrag(event, entry) {
      if (event.button !== 0 || !canDragEntry(entry)) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerDrag.current = {id: entry.id, x: event.clientX, y: event.clientY, started: false};
    }
    function pointerTarget(event) {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const slot = element?.closest('[data-planner-slot]');
      if (!slot || !event.currentTarget.contains(slot)) return null;
      return {date: slot.dataset.plannerDate, slotId: slot.dataset.plannerSlot,
        beforeId: element.closest('[data-entry-id]')?.dataset.entryId ?? null};
    }
    function movePointerDrag(event) {
      const active = pointerDrag.current;
      if (!active) return;
      if (!active.started && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 4) return;
      active.started = true;
      setDrag(active.id);
      setOver(pointerTarget(event));
    }
    function finishPointerDrag(event) {
      const active = pointerDrag.current, target = pointerTarget(event);
      pointerDrag.current = null;
      setDrag(null); setOver(null);
      if (active?.started && target) void drop(event, target.date, target.slotId, target.beforeId, active.id);
    }
    function cancelPointerDrag() { pointerDrag.current = null; setDrag(null); setOver(null); }
    async function drop(event, date, slotId, beforeId, draggedId) {
      event?.preventDefault(); event?.stopPropagation();
      const id = draggedId; setDrag(null); setOver(null);
      if (!id || busy || !state) return;
      const entry = state.entries.find(item => item.id === id);
      if (!entry || isFixed(entry)) return;
      if (entry.date === date && entry.slotId === slotId) {
        const group = state.entries.filter(item => item.schedule !== 'fixed' && item.date === date && item.slotId === slotId);
        const position = group.findIndex(item => item.id === id);
        if (beforeId === id) return;
        if (beforeId === null && position === group.length - 1) return;
        if (beforeId && group.findIndex(item => item.id === beforeId) === position + 1) return;
      }
      await change({ action: 'move', id, date, slotId, beforeId }, '已移动');
    }
    function handoff(entry) {
      if (!props.inputActions) { setNotice({ text: '请先打开一个对话，再带入安排。' }); return; }
      const slot = state.slots.find(item => item.id === entry.slotId);
      try {
        if (!insertPlanDraft(props.inputActions, entry, slot, today)) { setNotice({ text: '输入框正在提交或内容已变化，没有放入。请稍后再试。' }); return; }
        props.inputActions.focus?.();
        setNotice({ text: '已放入输入框，未发送。' });
      } catch { setNotice({ text: '当前输入框不可用，没有放入。' }); }
    }
    function focusEntryWork(entry) {
      if (!entry.reference) return;
      focusWork?.(sessionId, entry.reference.blockUuid);
      setNotice({ text: '已在当前工作中定位这件安排对应的工作对象。' });
    }

    if (!state) return <section className="sp" aria-label="个人时间规划"><header className="sp-head"><h1>时间规划</h1></header><p className="sp-muted" role="status">{error || '正在打开你的时间规划…'}</p>{error ? <button type="button" className="sp-primary" onClick={() => void load()}>重新读取</button> : null}</section>;

    const dates = visibleDates(mode === 'focus' ? 'today' : mode, today), week = mode === 'week';
    const focusFallback = mode === 'focus' && !current?.slot && !current?.fixed?.length;
    const shown = mode === 'focus' ? state.entries.filter(entry => entry.date === today) : state.entries.filter(entry => dates.includes(entry.date));
    const summary = dayTotals(shown);
    const title = mode === 'focus' ? '现在' : week ? '本周' : mode === 'tomorrow' ? '明天' : '今天';
    const subtitle = mode === 'focus' ? dateLabel(today) : week ? `${shortDateLabel(dates[0])} – ${shortDateLabel(dates[6])}` : dateLabel(dates[0]);
    const currentSlotName = current?.slot?.name ?? '';

    function renderSlot(date, slot, entries, compact, now = false) {
      const composing = editor?.isNew && editor.entry.date === date && editor.entry.slotId === slot.id;
      const overHere = drag && over?.date === date && over?.slotId === slot.id;
      const range = slotRangeLabel(slot);
      const empty = !entries.length && !composing;
      return <section key={slot.id} className={`sp-slot${empty ? ' sp-slot-empty' : ''}${now ? ' sp-slot-now' : ''}${overHere ? ' sp-over' : ''}`} aria-label={`${dateLabel(date)} ${slot.name}`}
        data-planner-slot={slot.id} data-planner-date={date}>
        {empty ? <button type="button" className={`sp-empty-slot${drag ? ' sp-drop-target' : ''}`} disabled={locked} aria-label={`在${slot.name}留出时间`} onClick={() => openNew(date, slot.id)}>
          <span className="sp-slot-name">{slot.name}</span>{range ? <span className="sp-range">{range}</span> : null}<span className="sp-slot-cta">{drag ? '放到这里' : '＋ 留出时间'}</span>
        </button> : <header className="sp-slot-head"><h3>{slot.name}</h3>{range ? <span className="sp-range">{range}</span> : null}{now ? <span className="sp-now-chip">正在进行</span> : null}{!compact ? <button type="button" className="sp-add" disabled={locked} aria-label={`添加到${slot.name}`} onClick={() => openNew(date, slot.id)}>＋</button> : null}</header>}
        {composing ? <Composer date={date} slot={slot} sessionId={sessionId} rpc={rpc} busy={busy} onSave={saveEntry} onClose={() => setEditor(null)} /> : null}
        {entries.map(entry => {
          const editing = editor && !editor.isNew && editor.entry.id === entry.id;
          return <React.Fragment key={entry.id}>
            {overHere && over.beforeId === entry.id ? <div className="sp-drop-line" aria-hidden="true" /> : null}
            {editing ? <EntryEditor key={entry.id} entry={entry} slots={state.slots} today={today} sessionId={sessionId} rpc={rpc} busy={busy} onSave={saveEntry} onDelete={deleteEntry} onReorder={reorder} onClose={() => setEditor(null)} /> : <EntryCard entry={entry} today={today} canDrag={canDragEntry(entry)} dragging={drag === entry.id} busy={busy}
              onEdit={openEdit} onHandoff={handoff} onFocus={focusEntryWork} onRecord={() => void record(entry, 15)} sessionId={sessionId} rpc={rpc}
              onPointerDown={event => beginPointerDrag(event, entry)} />}
          </React.Fragment>;
        })}
        {overHere && !over.beforeId ? <div className="sp-drop-line" aria-hidden="true" /> : null}
      </section>;
    }

    function fixedEntriesFor(date) {
      return state.entries.filter(entry => fixedOnDate(entry, date)).sort((a, b) => a.startAt.localeCompare(b.startAt));
    }

    function renderDay(date, compact) {
      const entries = state.entries.filter(entry => entry.date === date);
      const fixed = fixedEntriesFor(date);
      const flexible = entries.filter(entry => entry.schedule !== 'fixed');
      const totals = dayTotals([...fixed, ...flexible]), composing = editor?.isNew && editor.entry.date === date;
      const used = new Set(flexible.map(entry => entry.slotId)); if (composing) used.add(editor.entry.slotId);
      const slots = compact ? state.slots.filter(slot => used.has(slot.id) || Boolean(drag) || (current?.slot?.id === slot.id && date === today)) : state.slots;
      const label = relativeDateLabel(date, today);
      return <section key={date} className={`sp-day${date === today ? ' sp-today' : ''}${compact ? ' sp-compact' : ' sp-solo'}`} aria-label={dateLabel(date)}>
        <header className="sp-day-head"><div className="sp-day-title"><h2>{compact ? label : '今天的安排'}</h2><span>{compact ? dateLabel(date) : `${label} · ${dateLabel(date)}`}</span></div>
          <div className="sp-day-totals">{totals.count ? `${totals.count} 项` : '空闲'}{totals.planned ? ` · 计划 ${compactMinutes(totals.planned)}` : ''}{totals.actual ? ` · 实际 ${compactMinutes(totals.actual)}` : ''}</div>
          <div className="sp-day-actions">
            <button type="button" className="sp-day-add" disabled={locked} aria-label={`在${dateLabel(date)}添加固定安排`} title="添加固定安排" onClick={() => openFixed(date)}>＋ 固定</button>
            {compact ? <button type="button" className="sp-day-add" disabled={locked} aria-label={`在${dateLabel(date)}添加安排`} onClick={() => openNew(date, state.slots[0].id)}>＋</button> : null}
          </div>
        </header>
        {fixedComposer?.date === date ? <FixedComposer date={date} sessionId={sessionId} rpc={rpc} busy={busy} onSave={saveEntry} onClose={() => setFixedComposer(null)} /> : null}
        <FixedSection label="固定安排" entries={fixed} today={today} localAt={current?.localAt} busy={busy} compact={compact} sessionId={sessionId} rpc={rpc} editor={editor} slots={state.slots}
          onEdit={openEdit} onHandoff={handoff} onFocus={focusEntryWork} onRecord={entry => void record(entry, 15)} onSave={saveEntry} onDelete={deleteEntry} onClose={() => setEditor(null)} onReorder={reorder} />
        {slots.map(slot => renderSlot(date, slot, flexible.filter(entry => entry.slotId === slot.id), compact))}
        {compact && !fixed.length && !flexible.length ? <p className="sp-day-empty">空闲 · <button type="button" className="sp-link" disabled={locked} onClick={() => openNew(date, state.slots[0].id)}>留出时间</button></p> : null}
      </section>;
    }

    function renderFocus() {
      const slot = current?.slot, focusEntries = slot ? state.entries.filter(entry => entry.schedule !== 'fixed' && entry.date === today && entry.slotId === slot.id) : [];
      const fixedNow = current?.fixed ?? [];
      const upcoming = fixedEntriesFor(today).filter(entry => current?.localAt ? entry.startAt > current.localAt : false);
      if (focusFallback) return <>
        <div className="sp-focus-banner"><span>此刻没有对应的语义时间段</span><button type="button" className="sp-link" onClick={() => setMode('today')}>查看今天全部安排</button></div>
        {renderDay(today, false)}
      </>;
      return <>
        <div className="sp-focus-meta"><span className="sp-focus-now">{timeOf(localNow())}</span>{slot ? <span>{currentSlotName}</span> : <span>不在语义时间段内</span>}<button type="button" className="sp-link" onClick={() => setMode('today')}>今天全部</button></div>
        {fixedComposer?.date === today ? <FixedComposer date={today} sessionId={sessionId} rpc={rpc} busy={busy} onSave={saveEntry} onClose={() => setFixedComposer(null)} /> : null}
        <FixedSection label="正在进行" entries={fixedNow} today={today} localAt={current?.localAt} busy={busy} sessionId={sessionId} rpc={rpc} editor={editor} slots={state.slots}
          onEdit={openEdit} onHandoff={handoff} onFocus={focusEntryWork} onRecord={entry => void record(entry, 15)} onSave={saveEntry} onDelete={deleteEntry} onClose={() => setEditor(null)} onReorder={reorder} />
        {slot ? renderSlot(today, slot, focusEntries, false, true) : <div className="sp-focus-empty"><p>现在可以留出一点时间，或者查看今天的固定安排。</p><button type="button" className="sp-button" onClick={() => setMode('today')}>查看今天</button></div>}
        {upcoming.length ? <FixedSection label="接下来" entries={upcoming} today={today} localAt={current?.localAt} busy={busy} compact sessionId={sessionId} rpc={rpc} editor={editor} slots={state.slots}
          onEdit={openEdit} onHandoff={handoff} onFocus={focusEntryWork} onRecord={entry => void record(entry, 15)} onSave={saveEntry} onDelete={deleteEntry} onClose={() => setEditor(null)} onReorder={reorder} /> : null}
        <div className="sp-focus-foot"><button type="button" className="sp-link" onClick={() => openFixed(today)}>＋ 添加固定安排</button>{upcoming.length ? <span>接下来的固定事项已保留在上方</span> : null}</div>
      </>;
    }

    return <section className="sp" aria-label="个人时间规划" onPointerMove={movePointerDrag} onPointerUp={finishPointerDrag} onPointerCancel={cancelPointerDrag}>
      <header className="sp-head">
        <div className="sp-head-row">
          <div className="sp-head-title"><span className="sp-eyebrow">个人时间规划</span><h1>{title}</h1></div>
          <div className="sp-head-actions">
            <nav className="sp-view" aria-label="查看范围">{[['focus', '现在'], ['today', '今天'], ['tomorrow', '明天'], ['week', '本周']].map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key} disabled={locked} onClick={() => setMode(key)}>{label}</button>)}</nav>
            <button type="button" className="sp-icon" disabled={locked || !state.canUndo} title={state.undoLabel ? `撤销：${state.undoLabel}` : '暂无可撤销的操作'} aria-label="撤销上一步" onClick={() => void undo()}>↶</button>
            <button type="button" className="sp-icon" disabled={locked} title="编辑时间段" aria-label="编辑时间段" onClick={() => { setEditor(null); setFixedComposer(null); setSettingsOpen(true); }}>⋯</button>
          </div>
        </div>
        <p className="sp-date">{subtitle} · {plannerSummary(summary)}</p>
      </header>
      {error ? <p className="sp-error" role="alert">{error}<button type="button" onClick={() => void load()}>重新读取</button></p> : null}
      {busy || notice ? <div className="sp-status" role="status"><span>{busy ? '保存中…' : notice?.text}</span>{notice?.undo && !locked ? <button type="button" onClick={() => void undo()}>撤销</button> : null}</div> : null}
      {settingsOpen ? <SlotSettings slots={state.slots} busy={busy} onSave={saveSlots} onClose={() => setSettingsOpen(false)} /> : null}
      {mode === 'focus' ? renderFocus() : <div className={week ? 'sp-week' : 'sp-days'}>{dates.map(date => renderDay(date, week))}</div>}
      {week ? <p className="sp-hint sp-week-hint">固定安排按真实时间显示；灵活安排可以在时间段之间拖动。</p> : null}
    </section>;
  };
}
