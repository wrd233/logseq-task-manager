/* global document, window */
import React, { useEffect, useSyncExternalStore } from 'react';
import { SupplementDraft } from './supplement.mjs';
import { insertEvidence } from './draft.mjs';
export const inject = ['connection', 'slots'];
const labels = { GIT_FAILED: '无法读取 Git 仓库，请检查目录。', ENOENT: '目录或记录已失效。', HISTORY_LIMIT: '记录数量已达到上限，请使用新的专属状态目录。', INVALID_SELECTION: '最多选择 50 项证据。', SOURCE_CHANGED: '来源已变化，请重新观察后查看当前差异。', GIT_TIMEOUT: '观察超时，可稍后重试。', RESULT_LIMIT: '结果超过上限，本次结果不完整。', TEXT_DIFF_RESTRICTED: '此项只提供元数据。', STATE_DIRECTORY_RESTRICTED: '专属存储路径不可用或不安全。', NOTE_KEY_REUSED: '原保存请求内容不一致，请保留输入并核对。', OBSERVATION_UNAVAILABLE_OR_SCOPE_MISMATCH: '记录已失联或不属于所选目录，请重读历史列表。', RECORD_INTEGRITY_FAILED: '记录校验失败，未将其当作有效内容。请查看历史中的其他记录。', INPUT_BUSY: '草稿位置已变化或正在提交，原草稿未替换。请确认位置后重试插入。', SYMLINK_RESTRICTED: '符号链接正文不可读取。', SELECT_REPOSITORY_ROOT: '请选择 Git 仓库根目录。', FILE_SIZE_LIMIT: '文件超过正文读取上限。' };
const emptyList = () => ({ items: [], complete: true, problems: [] });
const changeLabel = code => ({ M: '修改', A: '新增', D: '删除', R: '重命名', C: '复制', U: '冲突', T: '类型变化', '?': '未跟踪', '.': '无' })[code] ?? code;
const preferenceKey = 'work-evidence:selection:v1';
export function apply(ctx) {
  const style = document.createElement('style');
  style.textContent = `.we{position:relative;font-size:13px}.we button,.we input,.we textarea,.we select{font:inherit}.we button{min-height:28px;padding:3px 8px;cursor:pointer}.we button:focus-visible,.we input:focus-visible,.we textarea:focus-visible{outline:2px solid #708ed5;outline-offset:2px}.we-panel{position:fixed;right:20px;top:64px;z-index:40;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);border:1px solid #737373;border-radius:8px;padding:14px;width:min(560px,88vw);max-height:75vh;overflow:auto;box-shadow:0 12px 40px #0005}.we-panel h3{font-size:15px;margin:0 0 10px}.we-panel p{line-height:1.5;margin:8px 0;overflow-wrap:anywhere}.we-panel label{display:block;margin:8px 0}.we-panel input[type=text],.we-panel select,.we-panel textarea{width:100%;box-sizing:border-box;background:inherit;color:inherit;border:1px solid #888;border-radius:4px;padding:5px}.we-row{border-top:1px solid #7775;padding:6px 0;overflow-wrap:anywhere}.we-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace;max-height:280px;overflow:auto}.we-tools{display:flex;gap:6px;flex-wrap:wrap}.we-muted{opacity:.8}.we-panel summary{cursor:pointer;padding:6px 0}`;
  style.textContent += '.we-context{border-left:3px solid #8192b0;padding-left:10px}.we-panel h4{font-size:13px;margin:14px 0 6px}.we-panel code{overflow-wrap:anywhere}.we-panel .we-active{font-weight:600}.we-panel textarea{min-height:72px}.we-preview{border:1px solid #8886;border-radius:6px;padding:8px}.we-panel :disabled{cursor:default;opacity:.55}';
  document.head.append(style); ctx.on('dispose', () => style.remove());
  async function rpc(method, payload = {}) {
    const answer = await ctx.connection.rpc.call('/api', `work-evidence/${method}`, payload);
    if (!answer.ok) throw Object.assign(Error(answer.error.code), { code: answer.error.code }); return answer.value;
  }
  const drafts = new Map(), panelValues = new Map(), pending = { current: false };
  // DSH may remount a slot while initializing the conversation. Keep its in-flight view in the plugin.
  function usePanelState(key, initial) {
    if (!panelValues.has(key)) {
      let value = typeof initial === 'function' ? initial() : initial;
      const listeners = new Set();
      panelValues.set(key, { read: () => value, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, set: next => { value = typeof next === 'function' ? next(value) : next; if (key === 'open') { try { window.localStorage.setItem('work-evidence:panel-open:v1', JSON.stringify(value)); } catch { /* Optional view preference. */ } } for (const listener of listeners) listener(); } });
    }
    const state = panelValues.get(key);
    return [useSyncExternalStore(state.subscribe, state.read), state.set];
  }
  function getDraft(scopeId, observationId) {
    const key = `${scopeId}:${observationId}`;
    if (!drafts.has(key)) drafts.set(key, new SupplementDraft({ scopeId, observationId }, undefined, {
      read: () => JSON.parse(window.localStorage.getItem(`work-evidence:draft:v1:${key}`) ?? 'null'),
      write: value => window.localStorage.setItem(`work-evidence:draft:v1:${key}`, JSON.stringify(value)),
    }));
    return drafts.get(key);
  }
  function remember(scopeId, observationId = null) { try { window.localStorage.setItem(preferenceKey, JSON.stringify({ scopeId, observationId })); } catch { /* Navigation is optional; saved records remain on disk. */ } }
  const protectReload = event => {
    if ([...drafts.values()].some(draft => draft.hasUnconfirmedInput())) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', protectReload);
  ctx.on('dispose', () => window.removeEventListener('beforeunload', protectReload));
  function Problems({ collection, title }) {
    return !collection.complete && <details><summary role="status">{title}部分可用：{collection.problems.length} 条记录不可用，已隔离</summary><p>可用记录仍能读取；缺失部分不视为没有变化。</p><pre>{JSON.stringify(collection.problems, null, 2)}</pre></details>;
  }
  function Supplement({ scopeId, observationId, busy, action, onSaved, notes }) {
    const draft = getDraft(scopeId, observationId), state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
    const superseded = new Set(notes.items.map(note => note.value.supersedesId));
    return <>
      <h4>我的意图</h4>
      {state.editingId && <p>正在修订已保存的意图；保存后追加新版，保留原文。</p>}
      <label>这次主要想解决什么（可选）<textarea maxLength={2000} value={state.text} onChange={event => draft.edit(event.target.value)} /></label>
      <div className="we-tools"><button type="button" disabled={busy || !state.text.trim() && !state.attempt} onClick={() => void action(async () => {
        const saved = await draft.save(payload => rpc('note', payload));
        if (saved) await onSaved(saved.receipt);
      })}>{state.attempt && state.status !== 'saving' ? '重查并重试原补充' : '保存补充'}</button>
      <button type="button" disabled={busy || !!state.attempt || !state.text && !state.editingId} onClick={() => draft.cancel()}>取消本次编辑</button></div>
      <p role="status" aria-live="polite">{state.status === 'saving' ? '正在保存已提交的文字，可继续输入。' : state.status === 'unknown' ? '保存结果未确认，输入仍保留。请重查并重试原补充；同一请求不会重复保存。' : state.status === 'saved' ? state.text ? '原补充已保存，当前新输入仍保留、尚未保存。' : '用户补充已独立保存。' : state.text ? '当前文字尚未保存。' : '可跳过意图，直接讨论观察结果。'}</p>
      {state.attempt && <details><summary>本次已提交、等待确认的文字</summary><p>{state.attempt.text}</p></details>}
      {state.backupFailed ? <p role="alert">浏览器临时备份不可用，请保留本页或复制未保存文字。</p> : state.text && <p className="we-muted">未保存文字已暂存在本浏览器；正式记录以“保存补充”的回执为准。</p>}
      {notes.items.map(note => <div className="we-row" key={note.value.id}>
        <p>{superseded.has(note.value.id) ? '意图旧版' : '据用户补充'} · {note.value.createdAt}：{note.value.text}</p>
        {!superseded.has(note.value.id) && <button type="button" disabled={busy || draft.hasUnconfirmedInput()} onClick={() => draft.beginEdit(note.value)}>修改这条意图</button>}
      </div>)}
      <Problems collection={notes} title="用户补充" />
    </>;
  }
  function Evidence({ inputActions }) {
    const [open, setOpen] = usePanelState('open', () => { try { return window.localStorage.getItem('work-evidence:panel-open:v1') === 'true'; } catch { return false; } }), [scopes, setScopes] = usePanelState('scopes', emptyList), [scope, setScope] = usePanelState('scope', ''), [directory, setDirectory] = usePanelState('directory', '');
    const [history, setHistory] = usePanelState('history', emptyList), [saved, setSaved] = usePanelState('saved', null), [notes, setNotes] = usePanelState('notes', emptyList), [view, setView] = usePanelState('view', 'history');
    const [selected, setSelected] = usePanelState('selected', []), [diff, setDiff] = usePanelState('diff', null), [notice, setNotice] = usePanelState('notice', ''), [busy, setBusy] = usePanelState('busy', false), [operation, setOperation] = usePanelState('operation', '');
    const [preview, setPreview] = usePanelState('preview', null), [sourceChanged, setSourceChanged] = usePanelState('sourceChanged', false);
    const o = saved?.value;
    async function action(fn, label = '正在处理…') {
      if (pending.current) return;
      pending.current = true; setBusy(true); setOperation(label); setNotice('');
      try { await fn(); } catch (error) { if (error.code === 'SOURCE_CHANGED') setSourceChanged(true); setNotice(labels[error.code] ?? `操作未完成：${error.code ?? '连接失败'}。请保留输入并重试。`); }
      finally { pending.current = false; setBusy(false); setOperation(''); }
    }
    async function choose(scopeId) {
      setScope(scopeId); setSaved(null); setSelected([]); setNotes(emptyList()); setDiff(null); setHistory(emptyList()); setPreview(null); setSourceChanged(false); remember(scopeId);
      setHistory(await rpc('history', { scopeId }));
    }
    async function read(observationId, scopeId = scope) {
      const result = await rpc('read', { scopeId, observationId });
      setSaved(result.observation); setView('history'); setNotes(result.notes); setSelected([]); setDiff(null); setPreview(null); setSourceChanged(false); remember(scopeId, observationId);
    }
    async function loadScopes() {
      const list = await rpc('scopes'); setScopes(list);
      if (!scope) {
        let previous; try { previous = JSON.parse(window.localStorage.getItem(preferenceKey)); } catch { /* Optional navigation preference. */ }
        if (previous && list.items.some(item => item.value.id === previous.scopeId)) { await choose(previous.scopeId); if (previous.observationId) await read(previous.observationId, previous.scopeId); }
      }
    }
    useEffect(() => { if (open && !scope && !scopes.items.length) void action(loadScopes, '正在恢复已保存的工作目录…'); }, [open]);
    const args = () => ({ scopeId: scope, observationId: o.id });
    const retained = [...drafts.values()].filter(draft => draft.context.scopeId === scope && draft.context.observationId !== o?.id && draft.hasUnconfirmedInput());
    return <div className="we">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void action(loadScopes, '正在读取已保存的目录…'); }}>工作变化</button>
      {open && <section className="we-panel" aria-label="外部工作证据" aria-busy={busy}>
        <div className="we-tools"><h3>哪里变了</h3><button type="button" onClick={() => setOpen(false)}>收起</button></div>
        <details open={!scope}><summary>{scope ? '选择其他仓库' : '选择工作目录'}</summary><form onSubmit={event => { event.preventDefault(); void action(async () => { const chosen = await rpc('select', { directory }); setScopes(await rpc('scopes')); await choose(chosen.id); }, '正在检查所选仓库…'); }}>
          <label>明确选择 Git 根目录<input type="text" value={directory} onChange={event => setDirectory(event.target.value)} placeholder="/绝对路径/工作目录" required /></label><button disabled={busy}>选择目录</button>
        </form></details>
        <label>已选择范围<select disabled={busy} value={scope} onChange={event => void action(() => choose(event.target.value))}>
          <option value="" disabled>选择一个工作目录</option>{scopes.items.map(({ value }) => <option key={value.id} value={value.id}>{value.directory}</option>)}
        </select></label>
        <Problems collection={scopes} title="目录记录" />
        <p className="we-muted">只观察你选择的仓库，不切换 DSH 执行目录。仅保存元数据与个人意图，差异正文不存档。</p>
        <button type="button" disabled={busy || !scope} onClick={() => void action(async () => {
          const result = await rpc('observe', { scopeId: scope }); setSaved(result); setView('new'); setSelected([]); setNotes(emptyList()); setDiff(null); setPreview(null); setSourceChanged(false); remember(scope, result.value.id);
          setNotice(result.value.state === 'failed' ? '失败结果已记录，可重新观察。' : '观察记录已保存。');
          try { setHistory(await rpc('history', { scopeId: scope })); } catch { setNotice('观察已保存，历史列表暂未刷新，请重试读取历史。'); }
        }, '正在观察 Git 并保存记录…')}>查看工作变化并保存</button>
        {retained.map(draft => <p key={draft.context.observationId}><button type="button" disabled={busy} onClick={() => void action(() => read(draft.context.observationId))}>返回仍有未保存补充的记录</button></p>)}
        {!o && <p>{!scope ? '先选择一个 Git 仓库，再查看哪里变了。' : '尚未观察' + (history.items.length ? '，可展开历史读回旧记录。' : '。')}</p>}
        {o && <>
          <div className="we-context"><p className="we-active">{view === 'new' ? '刚保存的观察' : '历史记录'} · {o.observedAt}</p>
          <p>记录对应：<code>{o.directory}</code></p>
          <p>{o.state === 'failed' ? `观察失败：${labels[o.error] ?? o.error}` : o.state === 'clean' ? '未观察到变化' : `${o.files.length} 项变化`} · 分支：{o.branch ?? '未知'} · HEAD：{o.head?.slice(0, 12) ?? '尚无提交'}</p>
          <p>{sourceChanged ? '已确认当前来源发生变化。旧记录保持原样，请重新观察。' : '这是当时保存的记录，并非实时状态。工作区可能已变化，可重新观察核对。'}</p></div>
          {o.truncated && <p role="status">结果截断，缺失部分无法确定。</p>}
          {!o.consistent && o.state !== 'failed' && <p role="status">观察期间来源发生变化，本次不是一致快照。</p>}
          {o.historyIncomplete && <p role="status">此前历史有缺失，本次与上次的比较无法确定；当前 Git 观察仍可查看。</p>}
          <p>新增或发生变化 {o.comparison.new.length} · 已有变化 {o.comparison.existing.length} · 无法确定 {o.comparison.uncertain.length}</p>
          {o.comparison.absent.length > 0 && <details><summary>{o.comparison.absent.length} 项已不在变化列表中</summary><pre>{JSON.stringify(o.comparison.absent, null, 2)}</pre></details>}
          <details><summary>展开文件与证据（{o.files.length}）</summary>
            {o.files.length === 0 && <p>{o.state === 'failed' ? '本次未取得文件列表。' : '本次没有变化文件，仍可引用这条观察。'}</p>}
            {o.files.map(file => <div className="we-row" key={file.path}>
              <label><input type="checkbox" checked={selected.includes(file.path)} disabled={busy} onChange={event => { setSelected(event.target.checked ? [...selected, file.path] : selected.filter(path => path !== file.path)); setPreview(null); }} /> {JSON.stringify(file.path)}{file.originalPath ? ` ← ${JSON.stringify(file.originalPath)}` : ''}</label>
              <span>已暂存：{changeLabel(file.staged)} · 未暂存：{changeLabel(file.unstaged)}{file.untracked ? ' · 未跟踪，仅元数据' : ''}{file.restricted ? ' · 敏感路径，仅元数据' : ''}</span>
              {!file.restricted && !file.untracked && <div className="we-tools">{['staged', 'unstaged'].map(side => <button key={side} type="button" disabled={busy} onClick={() => void action(async () => { setDiff(null); setDiff({ ...(await rpc('diff', { ...args(), path: file.path, side })), path: file.path, side }); }, '正在核对来源并读取差异…')}>{side === 'staged' ? '暂存差异' : '未暂存差异'}</button>)}</div>}
            </div>)}
          </details>
          {diff && <div aria-label="文件差异"><h4>{JSON.stringify(diff.path)} · {diff.side === 'staged' ? '暂存差异' : '未暂存差异'}</h4><p>{diff.state === 'truncated' ? '差异截断，未返回正文。' : diff.state === 'restricted' ? '二进制或敏感正文已排除。' : diff.text ? '当前文本差异（不存档）' : '这一侧没有文本差异。'}</p>{diff.text && <pre>{diff.text}</pre>}</div>}
          <Supplement key={`${scope}:${o.id}`} scopeId={scope} observationId={o.id} busy={busy} action={action} notes={notes} onSaved={async receipt => {
            setPreview(null); setNotes(current => ({ ...current, items: [...current.items.filter(item => item.value.id !== receipt.value.id), receipt] }));
            try { setNotes((await rpc('read', args())).notes); }
            catch { setNotice('补充已确认保存；列表暂未刷新，可稍后重读。当前输入不会被清空。'); }
          }} />
          <h4>带入讨论</h4><p className="we-muted">引用只包含已保存的意图和选中的文件元数据；未保存文字不会带入。先预览，再插入草稿。</p>
          <button type="button" disabled={busy || selected.length > 50 || !!o.files.length && !selected.length} onClick={() => void action(async () => { setPreview(null); const text = await rpc('quote', { ...args(), paths: selected }); setPreview({ text, inserted: false }); }, '正在准备引用…')}>{preview?.inserted ? '再次准备引用' : `准备草稿引用（${selected.length}）`}</button>
          {!!o.files.length && !selected.length && <p>展开文件并勾选要讨论的变化。</p>}
          {preview && <div className="we-preview" aria-label="引用预览"><p>{preview.inserted ? '引用已插入原生草稿，本次不会重复插入。由你决定是否发送。' : '请检查这条观察与意图；确认只插入草稿。'}</p><details><summary>查看将插入的内容</summary><pre>{preview.text}</pre></details>
            <div className="we-tools"><button type="button" disabled={busy || preview.inserted} onClick={() => void action(async () => { await insertEvidence(inputActions, async () => preview.text); setPreview({ ...preview, inserted: true }); setNotice('引用已插入原生草稿，由你决定是否发送。'); })}>确认插入原生草稿</button><button type="button" disabled={busy} onClick={() => { setPreview(null); setNotice('已关闭引用预览，原生草稿保持原样。'); }}>关闭引用预览</button></div>
          </div>}
          <details><summary>来源与保存边界</summary><p>{o.caveat}</p><pre>{JSON.stringify({ reference: `work-evidence:v1:${scope}:${o.id}`, recordHash: saved.hash, sourceVersion: o.sourceVersion }, null, 2)}</pre></details>
        </>}
        <Problems collection={history} title="历史观察" />
        <details><summary>历史观察（最近 100 条）</summary>{history.items.length === 0 && <p>还没有可用记录。可重新观察，或检查上方异常提示。</p>}{history.items.map(item => <p key={item.value.id}><button disabled={busy} type="button" onClick={() => void action(() => read(item.value.id), '正在读取历史记录…')}>{item.value.observedAt} · {item.value.state === 'clean' ? '无变化' : item.value.state === 'failed' ? '观察失败' : '有变化'} · {item.value.files.length} 项</button></p>)}</details>
        <button type="button" disabled={busy || !scope} onClick={() => void action(async () => setHistory(await rpc('history', { scopeId: scope })))}>重读历史列表</button>
        <p role="status" aria-live="polite">{busy ? operation : notice}</p>
      </section>}
    </div>;
  }
  ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'work-evidence-hero', order: 30 }, Evidence));
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'work-evidence', order: 30 }, Evidence));
}
