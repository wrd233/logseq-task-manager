/* global document, window */
import React, { useState, useRef, useSyncExternalStore } from 'react';
import { SupplementDraft } from './supplement.mjs';
import { insertEvidence } from './draft.mjs';
export const inject = ['connection', 'slots'];
const labels = { GIT_FAILED: '无法读取 Git 仓库，请检查目录。', ENOENT: '目录或记录已失效。', HISTORY_LIMIT: '记录数量已达到首版上限，请使用新的专属状态目录。', INVALID_SELECTION: '请选择 1 至 50 项证据。', SOURCE_CHANGED: '来源已变化，请重新观察后查看当前差异。', GIT_TIMEOUT: '观察超时，可稍后重试。', RESULT_LIMIT: '结果超过上限，本次结果不完整。', TEXT_DIFF_RESTRICTED: '此项只提供元数据。', STATE_DIRECTORY_RESTRICTED: '专属存储路径不可用或不安全。', NOTE_KEY_REUSED: '原保存请求内容不一致，请保留输入并核对。', OBSERVATION_UNAVAILABLE_OR_SCOPE_MISMATCH: '记录已失联或不属于所选目录。', SYMLINK_RESTRICTED: '符号链接正文不可读取。', SELECT_REPOSITORY_ROOT: '请选择 Git 仓库根目录。', FILE_SIZE_LIMIT: '文件超过正文读取上限。' };
export function apply(ctx) {
  const style = document.createElement('style');
  style.textContent = `.we{position:relative;font-size:13px}.we button,.we input,.we textarea,.we select{font:inherit}.we button{min-height:28px;padding:3px 8px;cursor:pointer}.we button:focus-visible,.we input:focus-visible,.we textarea:focus-visible{outline:2px solid #708ed5;outline-offset:2px}.we-panel{position:fixed;right:20px;top:64px;z-index:40;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);border:1px solid #737373;border-radius:8px;padding:14px;width:min(560px,88vw);max-height:75vh;overflow:auto;box-shadow:0 12px 40px #0005}.we-panel h3{font-size:15px;margin:0 0 10px}.we-panel p{line-height:1.5;margin:8px 0;overflow-wrap:anywhere}.we-panel label{display:block;margin:8px 0}.we-panel input[type=text],.we-panel select,.we-panel textarea{width:100%;box-sizing:border-box;background:inherit;color:inherit;border:1px solid #888;border-radius:4px;padding:5px}.we-row{border-top:1px solid #7775;padding:6px 0;overflow-wrap:anywhere}.we-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace;max-height:280px;overflow:auto}.we-tools{display:flex;gap:6px;flex-wrap:wrap}.we-muted{opacity:.8}.we-panel summary{cursor:pointer;padding:6px 0}`;
  document.head.append(style); ctx.on('dispose', () => style.remove());
  async function rpc(method, payload = {}) {
    const answer = await ctx.connection.rpc.call('/api', `work-evidence/${method}`, payload);
    if (!answer.ok) throw Object.assign(Error(answer.error.code), { code: answer.error.code }); return answer.value;
  }
  const drafts = new Map();
  const protectReload = event => {
    if ([...drafts.values()].some(draft => draft.hasUnconfirmedInput())) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', protectReload);
  ctx.on('dispose', () => window.removeEventListener('beforeunload', protectReload));
  const emptyList = () => ({ items: [], complete: true, problems: [] });
  function Problems({ collection, title }) {
    return !collection.complete && <details><summary role="status">{title}部分可用：{collection.problems.length} 条记录不可用，已隔离</summary><p>可用记录仍能读取；缺失部分不视为没有变化。</p><pre>{JSON.stringify(collection.problems, null, 2)}</pre></details>;
  }
  function Supplement({ scopeId, observationId, busy, action, onSaved }) {
    const key = `${scopeId}:${observationId}`;
    if (!drafts.has(key)) drafts.set(key, new SupplementDraft({ scopeId, observationId }));
    const draft = drafts.get(key), state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
    return <>
      <label>这次主要想解决什么（可选）<textarea maxLength={2000} value={state.text} onChange={event => draft.edit(event.target.value)} /></label>
      <button type="button" disabled={busy || !state.text.trim() && !state.attempt} onClick={() => void action(async () => {
        const saved = await draft.save(payload => rpc('note', payload));
        if (saved) await onSaved(saved.receipt);
      })}>{state.attempt && state.status !== 'saving' ? '重查并重试原补充' : '保存补充'}</button>
      <p role="status" aria-live="polite">{state.status === 'saving' ? '正在保存，可继续输入。' : state.status === 'unknown' ? '保存结果未确认，输入仍保留。请重查并重试原补充；同一请求不会重复保存。' : state.status === 'saved' ? state.text ? '原补充已保存，当前新输入仍保留、尚未保存。' : '用户补充已独立保存。' : ''}</p>
    </>;
  }
  function Evidence({ inputActions }) {
    const [open, setOpen] = useState(false), [scopes, setScopes] = useState(emptyList), [scope, setScope] = useState(''), [directory, setDirectory] = useState('');
    const [history, setHistory] = useState(emptyList), [saved, setSaved] = useState(null), [notes, setNotes] = useState(emptyList);
    const [selected, setSelected] = useState([]), [diff, setDiff] = useState(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const pending = useRef(false), o = saved?.value;
    async function action(fn) {
      if (pending.current) return;
      pending.current = true; setBusy(true); setNotice('');
      try { await fn(); } catch (error) { setNotice(labels[error.code] ?? `操作失败：${error.code ?? 'WORK_EVIDENCE_FAILED'}`); }
      finally { pending.current = false; setBusy(false); }
    }
    async function choose(scopeId) {
      setScope(scopeId); setSaved(null); setSelected([]); setNotes(emptyList()); setDiff(null); setHistory(emptyList());
      setHistory(await rpc('history', { scopeId }));
    }
    async function read(observationId) {
      const result = await rpc('read', { scopeId: scope, observationId });
      setSaved(result.observation); setNotes(result.notes); setSelected([]); setDiff(null);
    }
    const args = () => ({ scopeId: scope, observationId: o.id });
    const retained = [...drafts.values()].filter(draft => draft.context.scopeId === scope && draft.context.observationId !== o?.id && draft.hasUnconfirmedInput());
    return <div className="we">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void action(async () => setScopes(await rpc('scopes'))); }}>工作变化</button>
      {open && <section className="we-panel" aria-label="外部工作证据">
        <div className="we-tools"><h3>哪里变了</h3><button type="button" onClick={() => setOpen(false)}>收起</button></div>
        <form onSubmit={event => { event.preventDefault(); void action(async () => { const chosen = await rpc('select', { directory }); setScopes(await rpc('scopes')); await choose(chosen.id); }); }}>
          <label>明确选择 Git 根目录<input type="text" value={directory} onChange={event => setDirectory(event.target.value)} placeholder="/绝对路径/工作目录" required /></label><button disabled={busy}>选择目录</button>
        </form>
        <label>已选择范围<select disabled={busy} value={scope} onChange={event => void action(() => choose(event.target.value))}>
          <option value="" disabled>选择一个工作目录</option>{scopes.items.map(({ value }) => <option key={value.id} value={value.id}>{value.directory}</option>)}
        </select></label>
        <Problems collection={scopes} title="目录记录" />
        <p className="we-muted">此选择只用于观察。元数据和补充保存在独立本机记录中；不保存历史正文。</p>
        <button type="button" disabled={busy || !scope} onClick={() => void action(async () => {
          const result = await rpc('observe', { scopeId: scope }); setSaved(result); setSelected([]); setNotes(emptyList()); setDiff(null);
          setHistory(await rpc('history', { scopeId: scope })); setNotice('观察记录已保存。');
        })}>{busy ? '正在处理…' : '查看工作变化并保存'}</button>
        {retained.map(draft => <p key={draft.context.observationId}><button type="button" disabled={busy} onClick={() => void action(() => read(draft.context.observationId))}>返回仍有未保存补充的记录</button></p>)}
        {!o && <p>尚未观察{history.items.length ? '，可展开历史读回旧记录。' : '。'}</p>}
        {o && <>
          <p>{o.state === 'failed' ? `观察失败：${labels[o.error] ?? o.error}` : o.state === 'clean' ? '未观察到变化' : `${o.files.length} 项变化`} · {o.observedAt}</p>
          <p>分支：{o.branch ?? '未知'} · HEAD：{o.head?.slice(0, 12) ?? '尚无提交'}</p>
          {o.truncated && <p role="status">结果截断，缺失部分无法确定。</p>}
          {!o.consistent && o.state !== 'failed' && <p role="status">观察期间来源发生变化，本次不是一致快照。</p>}
          {o.historyIncomplete && <p role="status">此前历史有缺失，本次与上次的比较无法确定；当前 Git 观察仍可查看。</p>}
          <p>新增或发生变化 {o.comparison.new.length} · 已有变化 {o.comparison.existing.length} · 无法确定 {o.comparison.uncertain.length}</p>
          {o.comparison.absent.length > 0 && <details><summary>{o.comparison.absent.length} 项已不在变化列表中</summary><pre>{JSON.stringify(o.comparison.absent, null, 2)}</pre></details>}
          <details><summary>展开文件与证据</summary>{o.files.map(file => <div className="we-row" key={file.path}>
            <label><input type="checkbox" checked={selected.includes(file.path)} onChange={event => setSelected(event.target.checked ? [...selected, file.path] : selected.filter(path => path !== file.path))} /> {JSON.stringify(file.path)}{file.originalPath ? ` ← ${JSON.stringify(file.originalPath)}` : ''}</label>
            <span>已暂存 {file.staged} · 未暂存 {file.unstaged}{file.untracked ? ' · 未跟踪，仅元数据' : ''}{file.restricted ? ' · 敏感路径，仅元数据' : ''}</span>
            {!file.restricted && !file.untracked && <div className="we-tools">{['staged', 'unstaged'].map(side => <button key={side} type="button" disabled={busy} onClick={() => void action(async () => { setDiff(null); setDiff(await rpc('diff', { ...args(), path: file.path, side })); })}>{side === 'staged' ? '暂存差异' : '未暂存差异'}</button>)}</div>}
          </div>)}</details>
          {diff && <div><p>{diff.state === 'truncated' ? '差异截断，未返回正文。' : diff.state === 'restricted' ? '二进制或敏感正文已排除。' : '当前文本差异（不存档）'}</p>{diff.text && <pre>{diff.text}</pre>}</div>}
          <Supplement key={`${scope}:${o.id}`} scopeId={scope} observationId={o.id} busy={busy} action={action} onSaved={async receipt => {
            setNotes(current => ({ ...current, items: [...current.items.filter(item => item.value.id !== receipt.value.id), receipt] }));
            try { setNotes((await rpc('read', args())).notes); }
            catch { setNotice('补充已确认保存；列表暂未刷新，可稍后重读。当前输入不会被清空。'); }
          }} />
          {notes.items.map(note => <p key={note.value.id}>据用户补充 · {note.value.createdAt}：{note.value.text}</p>)}
          <Problems collection={notes} title="用户补充" />
          <p><button type="button" disabled={busy || !selected.length} onClick={() => void action(async () => { await insertEvidence(inputActions, () => rpc('quote', { ...args(), paths: selected })); setNotice('引用已插入原生草稿，由你决定是否发送。'); })}>引用所选证据到草稿（{selected.length}）</button></p>
          <details><summary>来源与保存边界</summary><p>{o.caveat}</p><pre>{JSON.stringify({ reference: `work-evidence:v1:${scope}:${o.id}`, recordHash: saved.hash, sourceVersion: o.sourceVersion }, null, 2)}</pre></details>
        </>}
        <Problems collection={history} title="历史观察" />
        <details><summary>历史观察（最近 100 条）</summary>{history.items.map(item => <p key={item.value.id}><button disabled={busy} type="button" onClick={() => void action(() => read(item.value.id))}>{item.value.observedAt} · {item.value.state} · {item.value.files.length} 项</button></p>)}</details>
        <p role="status" aria-live="polite">{notice}</p>
      </section>}
    </div>;
  }
  ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'work-evidence-hero', order: 30 }, Evidence));
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'work-evidence', order: 30 }, Evidence));
}
