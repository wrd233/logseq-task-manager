/* global setInterval, clearInterval */
import React, { useEffect, useState } from 'react';
import { dateKey, offsetDate, visibleDates, dateLabel } from './planner-model.mjs';

export function createPlanner({ rpc }) {
  return function Planner(props) {
    const tab = props.useTabInfo();
    const [state, setState] = useState(null), [mode, setMode] = useState('today');
    const [today, setToday] = useState(dateKey), [draft, setDraft] = useState(null), [settings, setSettings] = useState(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [references, setReferences] = useState([]), [referenceError, setReferenceError] = useState('');
    const [search, setSearch] = useState(''), [choosing, setChoosing] = useState(false), [dragging, setDragging] = useState(null);
    async function reload() { try { setState(await rpc('planner-read', { sessionId: props.sessionId })); setError(''); } catch { setError('无法读取规划，请重试。'); } }
    useEffect(() => { const timer = setInterval(() => setToday(dateKey()), 30000); return () => clearInterval(timer); }, []);
    useEffect(() => { if (tab.tab.visible && !draft && !settings) void reload(); }, [tab.tab.visible]);
    useEffect(() => tab.tab.actions.bindCommands({ refresh: reload }), [props.sessionId, tab.tab.actions]);
    async function change(change, message) {
      setBusy(true); setError('');
      try { const next = await rpc('planner-change', { sessionId: props.sessionId, revision: state.revision, ...change }); setState(next); setNotice(message); return true; }
      catch (e) {
        if (e.code === 'PLANNER_CONFLICT') { await reload(); setError('另一处已更新规划，已载入最新版。你的输入仍在，请检查后再保存。'); }
        else setError(e.code === 'PLANNER_INVALID' ? '请填写有效内容、日期和时段。输入已保留。' : e.code === 'PLANNER_REFERENCE_MISSING' ? '此事项已不在当前工作中。请重新选择，或解除引用后保存活动。' : '保存失败，输入已保留。请检查连接后重试。');
        return false;
      } finally { setBusy(false); }
    }
    function edit(entry) { setDraft({ ...entry }); setChoosing(false); setSearch(''); setNotice(''); }
    async function chooseReference() {
      setChoosing(!choosing); setReferenceError('正在读取当前工作…');
      try { setReferences(await rpc('planner-references', { sessionId: props.sessionId })); setReferenceError(''); }
      catch { setReferences([]); setReferenceError('请先在此会话关联 Logseq 工作，再选择其中的事项。自由活动可直接保存。'); }
    }
    const dates = visibleDates(mode, today);
    if (!state) return <section className="sp"><p role="status">{error || '正在打开你的时间规划…'}</p>{error ? <button onClick={reload}>重试</button> : null}</section>;
    const newEntry = (date, slotId) => edit({ title: '', date, slotId, reference: null });
    return <section className="sp" aria-label="个人时间规划">
      <header className="sp-heading"><div><span className="sp-eyebrow">留出时间 · 从容推进</span><h2>时间规划</h2></div><button className="sp-icon" title="设置时段" aria-label="设置时段" disabled={busy || !!draft || !!settings} onClick={() => { setSettings(state.slots.map(s => ({ ...s }))); setDraft(null); }}>⚙</button></header>
      <p className="sp-caption">按自己的节奏安排。这里的计划不改变任务状态或截止日。</p>
      <nav className="sp-tabs" aria-label="规划范围">{[['today', '今天'], ['tomorrow', '明天'], ['week', '本周']].map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}</nav>
      <div className="sp-status"><span role="status">{busy ? '正在保存…' : notice || '已保存在此 DSH 本机'}</span><button disabled={busy || !!draft || !!settings || !state.canUndo} onClick={() => { void change({ action: 'undo' }, '已撤销上一步'); }}>撤销</button></div>
      {error ? <p className="sp-error" role="alert">{error}<button onClick={reload}>重新读取</button></p> : null}
      {settings ? <form className="sp-editor" onSubmit={async e => { e.preventDefault(); if (await change({ action: 'slots', slots: settings }, '时段已更新')) setSettings(null); }}>
        <fieldset disabled={busy}><h3>你的日常节奏</h3><p className="sp-caption">按从早到晚排列；删除时段时，安排会移到第一个时段。可撤销。</p>
        {settings.map((s, i) => <div className="sp-slot-edit" key={s.id}><input aria-label={`时段 ${i + 1}`} required maxLength={40} value={s.name} onChange={e => setSettings(settings.map((v, j) => j === i ? { ...v, name: e.target.value } : v))} /><button type="button" disabled={!i || busy} aria-label={`上移${s.name}`} onClick={() => { const next = [...settings]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setSettings(next); }}>↑</button><button type="button" disabled={settings.length === 1 || busy} aria-label={`删除${s.name}`} onClick={() => setSettings(settings.filter((_, j) => i !== j))}>×</button></div>)}
        <button type="button" className="sp-link" disabled={settings.length >= 12 || busy} onClick={() => setSettings([...settings, { id: `slot-${Date.now()}`, name: '' }])}>＋ 添加时段</button>
        <div className="sp-form-actions"><button type="button" disabled={busy} onClick={() => setSettings(null)}>取消</button><button className="sp-primary" disabled={busy}>保存时段</button></div></fieldset>
      </form> : null}
      {draft ? <form className="sp-editor" aria-label="编辑安排" onSubmit={async e => { e.preventDefault(); if (await change({ action: 'save', entry: draft }, draft.id ? '安排已调整' : '已为你留出时间')) setDraft(null); }}>
        <fieldset disabled={busy}><div className="sp-editor-heading"><h3>{draft.id ? '调整安排' : '想留时间做什么？'}</h3><button type="button" aria-label="关闭编辑" disabled={busy} onClick={() => setDraft(null)}>×</button></div>
        <input autoFocus aria-label="活动内容" placeholder="例如：研究一下项目架构" required maxLength={500} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
        <div className="sp-quickdates" aria-label="快捷日期">{[[today, '今天'], [offsetDate(today, 1), '明天']].map(([date, label]) => <button type="button" key={date} aria-pressed={draft.date === date} onClick={() => setDraft({ ...draft, date })}>{label}</button>)}</div>
        <div className="sp-fields"><label>哪一天<input type="date" aria-label="安排日期" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label><label>哪个时段<select aria-label="安排时段" value={draft.slotId} onChange={e => setDraft({ ...draft, slotId: e.target.value })}>{state.slots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
        {draft.reference ? <div className="sp-reference">↗ {draft.reference.title}<button type="button" aria-label="解除事项引用" onClick={() => setDraft({ ...draft, reference: null })}>×</button></div> : <button type="button" className="sp-link" onClick={chooseReference}>↗ 从当前工作选择事项</button>}
        {choosing ? <div className="sp-chooser"><input aria-label="搜索工作事项" placeholder="搜索 Project、MiniProject、Task" value={search} onChange={e => setSearch(e.target.value)} />{referenceError ? <p>{referenceError}</p> : null}{references.filter(r => r.title.toLowerCase().includes(search.toLowerCase())).map(r => <button type="button" key={r.blockUuid} onClick={() => { setDraft({ ...draft, title: draft.title || r.title, reference: r }); setChoosing(false); }}><span>{r.kind === 'MINI_PROJECT' ? 'MiniProject' : r.kind === 'PROJECT' ? 'Project' : 'Task'}{!r.objectId ? ' · 工作标记' : ''}</span>{r.title}</button>)}{!references.length && !referenceError ? <p>当前工作中暂无可引用的事项。可切换会话选择其他工作。</p> : null}</div> : null}
        <div className="sp-form-actions">{draft.id ? <button className="sp-danger" type="button" disabled={busy} onClick={async () => { if (await change({ action: 'delete', id: draft.id }, '安排已删除，可撤销')) setDraft(null); }}>删除安排</button> : null}<button type="button" disabled={busy} onClick={() => setDraft(null)}>取消</button><button className="sp-primary" disabled={busy}>{busy ? '保存中…' : '保存安排'}</button></div></fieldset>
      </form> : null}
      <div className={`sp-days ${mode === 'week' ? 'sp-week' : ''}`}>{dates.map(date => <section key={date} className={`sp-day ${date === today ? 'sp-today' : ''}`} aria-label={date}>
        <div className="sp-day-heading"><h3>{date === today ? '今天' : date === offsetDate(today, 1) ? '明天' : new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</h3><span>{dateLabel(date)}</span><small>{state.entries.filter(e => e.date === date).length} 项安排</small>{mode === 'week' ? <button disabled={busy || !!draft || !!settings} aria-label={`添加到${date}`} onClick={() => newEntry(date, state.slots[0].id)}>＋</button> : null}</div>
        {mode === 'week' && !dragging && !state.entries.some(e => e.date === date) ? <button className="sp-week-empty" disabled={busy || !!draft || !!settings} onClick={() => newEntry(date, state.slots[0].id)}>还没有安排，留一点时间给…</button> : null}
        {state.slots.filter(slot => mode !== 'week' || dragging || state.entries.some(e => e.date === date && e.slotId === slot.id)).map(slot => { const entries = state.entries.filter(e => e.date === date && e.slotId === slot.id); return <section key={slot.id} className={`sp-period ${dragging ? 'sp-drop-ready' : ''}`} aria-label={`${date} ${slot.name}`} onDragOver={e => { if (dragging) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const entry = state.entries.find(v => v.id === dragging); setDragging(null); if (entry && !busy) void change({ action: 'save', entry: { ...entry, date, slotId: slot.id } }, '安排已移动'); }}>
          <header><h4>{slot.name}</h4><button disabled={busy || !!draft || !!settings} aria-label={`添加到${date} ${slot.name}`} onClick={() => newEntry(date, slot.id)}>＋</button></header>
          {entries.map(entry => <article className="sp-card" draggable={!busy && !draft && !settings} key={entry.id} onDragStart={e => { setDragging(entry.id); e.dataTransfer.setData('text/plain', entry.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragging(null)}>
            <button className="sp-card-title" disabled={busy || !!draft || !!settings} onClick={() => edit(entry)}>{entry.title}</button>
            {entry.reference ? <a className="sp-card-ref" href={`logseq://graph/${encodeURIComponent(entry.reference.graphId.split(':')[0])}?block-id=${encodeURIComponent(entry.reference.blockUuid)}`} title="在 Logseq 打开引用">↗ {entry.reference.kind === 'PROJECT' ? 'Project' : entry.reference.kind === 'MINI_PROJECT' ? 'MiniProject' : 'Task'} · {entry.reference.title}</a> : null}
          </article>)}
          {!entries.length ? <button className="sp-empty" disabled={busy || !!draft || !!settings} onClick={() => newEntry(date, slot.id)}>留一点时间给…</button> : null}
        </section>; })}
      </section>)}</div>
      <footer className="sp-footer">点击安排可编辑或移动 · 拖到另一个时段也可以</footer>
    </section>;
  };
}
