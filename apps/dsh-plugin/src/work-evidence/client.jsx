/* global document */
import React, { useState } from 'react';
import { insertEvidence } from './draft.mjs';
export const inject = ['connection', 'slots'];
const labels = { GIT_FAILED: '无法读取 Git 仓库，请检查目录。', ENOENT: '目录或记录已失效。', HISTORY_LIMIT: '记录数量已达到首版上限，请使用新的专属状态目录。', INVALID_SELECTION: '请选择 1 至 50 项证据。', SOURCE_CHANGED: '来源已变化，请重新观察后查看当前差异。', GIT_TIMEOUT: '观察超时，可稍后重试。', RESULT_LIMIT: '结果超过上限，本次结果不完整。', TEXT_DIFF_RESTRICTED: '此项只提供元数据。', SYMLINK_RESTRICTED: '符号链接正文不可读取。', SELECT_REPOSITORY_ROOT: '请选择 Git 仓库根目录。', FILE_SIZE_LIMIT: '文件超过正文读取上限。' };
export function apply(ctx) {
  const style = document.createElement('style');
  style.textContent = `.we{position:relative;font-size:13px}.we button,.we input,.we textarea,.we select{font:inherit}.we button{min-height:28px;padding:3px 8px;cursor:pointer}.we button:focus-visible,.we input:focus-visible,.we textarea:focus-visible{outline:2px solid #708ed5;outline-offset:2px}.we-panel{position:fixed;right:20px;top:64px;z-index:40;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);border:1px solid #737373;border-radius:8px;padding:14px;width:min(560px,88vw);max-height:75vh;overflow:auto;box-shadow:0 12px 40px #0005}.we-panel h3{font-size:15px;margin:0 0 10px}.we-panel p{line-height:1.5;margin:8px 0;overflow-wrap:anywhere}.we-panel label{display:block;margin:8px 0}.we-panel input[type=text],.we-panel select,.we-panel textarea{width:100%;box-sizing:border-box;background:inherit;color:inherit;border:1px solid #888;border-radius:4px;padding:5px}.we-row{border-top:1px solid #7775;padding:6px 0;overflow-wrap:anywhere}.we-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace;max-height:280px;overflow:auto}.we-tools{display:flex;gap:6px;flex-wrap:wrap}.we-muted{opacity:.8}.we-panel summary{cursor:pointer;padding:6px 0}`;
  document.head.append(style); ctx.on('dispose', () => style.remove());
  async function rpc(method, payload = {}) {
    const answer = await ctx.connection.rpc.call('/api', `work-evidence/${method}`, payload);
    if (!answer.ok) throw Object.assign(Error(answer.error.code), { code: answer.error.code }); return answer.value;
  }
  function Evidence({ inputActions }) {
    const [open,setOpen] = useState(false), [scopes,setScopes] = useState([]), [scope,setScope] = useState(''), [directory,setDirectory] = useState('');
    const [history,setHistory] = useState([]), [saved,setSaved] = useState(null), [notes,setNotes] = useState([]), [note,setNote] = useState(''), [selected,setSelected] = useState([]), [diff,setDiff] = useState(null), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false);
    const o = saved?.value;
    async function action(fn) { if (busy) return; setBusy(true); setNotice(''); try { await fn(); } catch(e) { setNotice(labels[e.code] ?? `操作失败：${e.code ?? 'WORK_EVIDENCE_FAILED'}`); } finally { setBusy(false); } }
    async function choose(id) { setScope(id); setSaved(null); setSelected([]); setNotes([]); setNote(''); setDiff(null); setHistory(await rpc('history',{scopeId:id})); }
    async function read(id) { const r = await rpc('read',{scopeId:scope,observationId:id}); setSaved(r.observation); setNotes(r.notes); setSelected([]); setDiff(null); setNote(''); }
    const args = () => ({ scopeId:scope,observationId:o.id });
    return <div className="we"><button type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void action(async () => setScopes(await rpc('scopes'))); }}>工作变化</button>{open && <section className="we-panel" aria-label="外部工作证据">
      <div className="we-tools"><h3>哪里变了</h3><button type="button" onClick={() => setOpen(false)}>收起</button></div>
      <form onSubmit={e => { e.preventDefault(); void action(async () => { const s = await rpc('select',{directory}); setScopes(await rpc('scopes')); await choose(s.id); }); }}><label>明确选择 Git 根目录<input type="text" value={directory} onChange={e => setDirectory(e.target.value)} placeholder="/绝对路径/工作目录" required /></label><button disabled={busy}>选择目录</button></form>
      <label>已选择范围<select disabled={busy} value={scope} onChange={e => void action(() => choose(e.target.value))}><option value="" disabled>选择一个工作目录</option>{scopes.map(s => <option key={s.id} value={s.id}>{s.directory}</option>)}</select></label>
      <p className="we-muted">此选择只用于观察。元数据和补充保存在独立本机记录中；不保存历史正文。</p>
      <button type="button" disabled={busy || !scope} onClick={() => void action(async () => { const r = await rpc('observe',{scopeId:scope}); setSaved(r); setSelected([]); setNotes([]); setDiff(null); setHistory(await rpc('history',{scopeId:scope})); setNotice('观察记录已保存。'); })}>{busy ? '正在处理…' : '查看工作变化并保存'}</button>
      {!o && <p>尚未观察{history.length ? '，可展开历史读回旧记录。' : '。'}</p>}
      {o && <><p>{o.state === 'failed' ? `观察失败：${labels[o.error] ?? o.error}` : o.state === 'clean' ? '未观察到变化' : `${o.files.length} 项变化`} · {o.observedAt}</p><p>分支：{o.branch ?? '未知'} · HEAD：{o.head?.slice(0,12) ?? '尚无提交'}</p>
        {o.truncated && <p role="status">结果截断，缺失部分无法确定。</p>}{!o.consistent && o.state !== 'failed' && <p role="status">观察期间来源发生变化，本次不是一致快照。</p>}
        <p>新增或发生变化 {o.comparison.new.length} · 已有变化 {o.comparison.existing.length} · 无法确定 {o.comparison.uncertain.length}</p>
        {o.comparison.absent.length > 0 && <details><summary>{o.comparison.absent.length} 项已不在变化列表中</summary><pre>{JSON.stringify(o.comparison.absent,null,2)}</pre></details>}
        <details><summary>展开文件与证据</summary>{o.files.map(f => <div className="we-row" key={f.path}><label><input type="checkbox" checked={selected.includes(f.path)} onChange={e => setSelected(e.target.checked ? [...selected,f.path] : selected.filter(p => p !== f.path))} /> {JSON.stringify(f.path)}{f.originalPath ? ` ← ${JSON.stringify(f.originalPath)}` : ''}</label><span>已暂存 {f.staged} · 未暂存 {f.unstaged}{f.untracked ? ' · 未跟踪，仅元数据' : ''}{f.restricted ? ' · 敏感路径，仅元数据' : ''}</span>{!f.restricted && !f.untracked && <div className="we-tools">{['staged','unstaged'].map(side => <button key={side} type="button" disabled={busy} onClick={() => void action(async () => setDiff(await rpc('diff',{...args(),path:f.path,side})))}>{side === 'staged' ? '暂存差异' : '未暂存差异'}</button>)}</div>}</div>)}</details>
        {diff && <div><p>{diff.state === 'truncated' ? '差异截断，未返回正文。' : diff.state === 'restricted' ? '二进制或敏感正文已排除。' : '当前文本差异（不存档）'}</p>{diff.text && <pre>{diff.text}</pre>}</div>}
        <label>这次主要想解决什么（可选）<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><button type="button" disabled={busy || !note.trim()} onClick={() => void action(async () => { await rpc('note',{...args(),text:note}); setNotes((await rpc('read',args())).notes); setNote(''); setNotice('用户补充已独立保存。'); })}>保存补充</button>
        {notes.map(n => <p key={n.value.id}>据用户补充 · {n.value.createdAt}：{n.value.text}</p>)}
        <p><button type="button" disabled={busy || !selected.length} onClick={() => void action(async () => { await insertEvidence(inputActions, () => rpc('quote',{...args(),paths:selected})); setNotice('引用已插入原生草稿，由你决定是否发送。'); })}>引用所选证据到草稿（{selected.length}）</button></p>
        <details><summary>来源与保存边界</summary><p>{o.caveat}</p><pre>{JSON.stringify({reference:`work-evidence:v1:${scope}:${o.id}`,recordHash:saved.hash,sourceVersion:o.sourceVersion},null,2)}</pre></details>
      </>}
      <details><summary>历史观察（最近 100 条）</summary>{history.map(h => <p key={h.value.id}><button disabled={busy} type="button" onClick={() => void action(() => read(h.value.id))}>{h.value.observedAt} · {h.value.state} · {h.value.files.length} 项</button></p>)}</details>
      <p role="status" aria-live="polite">{notice}</p>
    </section>}</div>;
  }
  ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({name:'conversation.hero.options',id:'work-evidence-hero',order:30}, Evidence));
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name:'conversation.session.header.utilities',id:'work-evidence',order:30 }, Evidence));
}
