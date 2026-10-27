/* global document, localStorage, crypto, setInterval, clearInterval, AbortController */
import React, { useEffect, useRef, useState } from 'react';
import { Structure, Fields } from '../structure-view/view.jsx';
import { historyStyles } from '../structure-view/styles.mjs';
import { styles } from './styles.mjs';

const time = at => new Date(at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const labels = { commit: '提交', staged: '已暂存', unstaged: '未暂存', untracked: '未跟踪' };
const statuses = { pending: '待理解', queued: '等待分析', analyzing: '正在理解…', question: '有一个问题', skipped: '已跳过问题', stale: '说明已更新 · 待重新理解', failed: '分析未完成', interrupted: '分析已中断', complete: '已理解' };
export const errorText = e => ({
  EVIDENCE_PROJECT_REQUIRED: '先在 DSH 为此会话选择工作目录。', EVIDENCE_GIT_UNAVAILABLE: '暂时无法读取 Git。请确认此目录属于一个 Git 仓库。',
  EVIDENCE_SOURCE_CHANGED: '采集时文件发生变化。这次未推进起点，请稍后重新同步。',
  EVIDENCE_HISTORY_DIVERGED: 'Git 历史已改变，无法可靠接续上次同步。可以保留旧记录并重新建立起点。',
  EVIDENCE_GIT_LIMIT: '变化超出本次读取范围。这次未推进起点，请先缩小工作目录范围。',
  EVIDENCE_MODEL_NOT_CONFIGURED: '尚未配置可用模型。请在 DSH 选择模型后重试；Diff 和交接仍可使用。',
  EVIDENCE_MODEL_OUTPUT: '模型未返回可信的分析结果，可以重试。', EVIDENCE_MODEL_INCOMPLETE: '模型没有完成分析，可以重试。',
  EVIDENCE_MODEL_CONTEXT_LIMIT: '这组内容较长，超过模型输入范围。文件 Diff 与交接仍可使用。',
  EVIDENCE_ANALYSIS_INTERRUPTED: '分析已中断，可以重试。', EVIDENCE_ANALYSIS_BUSY: '正在理解这批文件，请稍候。',
  EVIDENCE_EDIT_CONFLICT: '此记录已有新版本。你的输入已保留，请重新打开最新记录后再保存。',
  EVIDENCE_BINDING_CHANGED: '此会话的工作范围已改变，请重新打开回顾。', INPUT_BUSY: '草稿正在提交或插入位置已变化，请重试引用。',
  HISTORY_STORAGE_NEEDS_ATTENTION: '保存记录中存在损坏文件。已保存内容不会被覆盖，请检查本机记录。',
  EVIDENCE_STORAGE_NEEDS_ATTENTION: '保存记录中存在损坏文件，请检查本机记录后再同步。',
}[e?.code] ?? '暂时未能完成，请重试。已输入的内容保留在这里。');

/** User text survives panel/session switches; saved records remain the host's authority. */
function useDraft(key, initial = '') {
  const [draft, setDraft] = useState(() => { try { return localStorage.getItem(key) ?? initial; } catch { return initial; } });
  const [localError, setLocalError] = useState(false);
  useEffect(() => { try { localStorage.setItem(key, draft); } catch { setLocalError(true); } }, [key, draft]);
  return [draft, setDraft, localError];
}

export function applyEvidenceClient(ctx) {
  const style = document.createElement('style'); style.textContent = historyStyles + styles; document.head.append(style);
  const rpc = async (method, payload, signal) => {
    const result = await ctx.connection.rpc.call('/api', `logseq-workbench/evidence-${method}`, payload, signal);
    if (!result.ok) throw Object.assign(Error(result.error.message), { code: result.error.code });
    return result.value;
  };
  function Clarification({ item, act, draftKey }) {
    const [answer, setAnswer, localError] = useDraft(`${draftKey}:answer:${item.id}`, item.clarification?.text ?? '');
    const originalQuestion = item.clarification?.question || item.analysis?.result.question;
    const [question, setQuestion] = useDraft(`${draftKey}:question:${item.id}:${item.analysis?.id ?? 'initial'}`, originalQuestion ?? '');
    const [editingQuestion, setEditingQuestion] = useState(question !== (originalQuestion ?? '')), [busy, setBusy] = useState(false);
    const save = async skipped => {
      setBusy(true);
      try { const saved = await act('clarify', { itemId: item.id, text: answer, skipped, ...(editingQuestion ? { question } : {}), expectedId: item.clarification?.id ?? null });
        if (saved && !skipped && item.status !== 'queued') await act('analyze', { itemIds: [item.id] });
      } finally { setBusy(false); }
    };
    const content = <form className="we-answer" onSubmit={e => { e.preventDefault(); void save(false); }}>
      {editingQuestion ? <label>调整问题<textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} maxLength={1000}/></label> : originalQuestion ? <p>{originalQuestion} <button type="button" className="we-text-button" onClick={() => setEditingQuestion(true)}>编辑问题</button></p> : null}
      <label>{originalQuestion ? '你的回答' : '补充影响理解的信息'}<textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="例如这次调整的目的、实际检查结果或还没解决的问题" rows={3} maxLength={6000}/></label>
      <div className="we-actions"><button disabled={busy || (!answer.trim() && !(editingQuestion && question.trim())) || item.status === 'analyzing'}>保存并更新理解</button><button type="button" className="we-text-button" disabled={busy} onClick={() => void save(true)}>暂时跳过</button></div>
      {localError ? <p role="status">浏览器暂存不可用，请保存说明后再关闭。</p> : null}
    </form>;
    return item.status === 'question' ? content : <details className="we-note"><summary>{item.clarification ? item.clarification.skipped ? '已跳过 · 可以补充' : '你的说明 · 编辑' : '补充说明'}</summary>{item.clarification?.text ? <p>{item.clarification.text}</p> : null}{content}</details>;
  }
  function File({ item, act, draftKey }) {
    const kinds = [...new Set(item.parts.map(p => labels[p.kind]))];
    return <article className="we-file" data-file={item.path}>
      <div className="we-file-heading"><h3>{item.path}</h3><span className={`we-state we-${item.status}`}>{statuses[item.status]}</span></div>
      <p className="we-file-meta">{kinds.join(' · ')}{item.originalPath ? ` · 原路径 ${item.originalPath}` : ''}{!item.changed ? ' · 同步前已存在，未改变' : ''}</p>
      {item.analysis ? <div className="we-explanation"><span className="we-eyebrow">Agent 解释</span><p>{item.analysis.result.explanation}</p></div> : <p className="we-muted">{item.status === 'analyzing' ? '正在结合变化和工作上下文理解这个文件。' : '可以先查看变化，再让 Agent 帮你理解。'}</p>}
      {item.error && item.status === 'failed' ? <p className="we-error" role="status">{errorText({ code: item.error })}</p> : null}
      {item.analysis?.result.uncertainties.length ? <details className="we-note"><summary>尚待确认</summary>{item.analysis.result.uncertainties.map((s, i) => <p key={i}>{s}</p>)}</details> : null}
      <Clarification key={item.analysis?.id ?? 'initial'} item={item} act={act} draftKey={draftKey}/>
      <div className="we-file-footer"><details className="we-diff"><summary>查看 Diff 与来源</summary>{item.parts.map((part, index) => <details key={index}><summary>{labels[part.kind]}{part.sha ? ` · ${part.sha.slice(0, 8)}` : ''}{part.existed ? ' · 已存在' : ''}</summary>
        <pre>{part.state === 'text' ? part.text || '没有文本差异（可能只有模式或冲突状态变化）。' : part.state === 'too-large' ? '正文较大，本次只记录文件状态。' : '此内容受限或为二进制，仅保留来源元数据。'}</pre><small>证据 {index + 1} · {part.status ?? item.code}</small></details>)}
        {item.analysis ? <small>模型 {item.analysis.model.provider} / {item.analysis.model.model}<br/>依据：{item.analysis.result.evidenceRefs.join('、')}</small> : null}</details>
        <button type="button" className="we-text-button" disabled={item.status === 'analyzing'} onClick={() => void act('analyze', { itemIds: [item.id] })}>{item.analysis ? '重新理解' : '理解此文件'}</button></div>
    </article>;
  }
  function StructureChanges({ syncId, sessionId }) {
    const [frame, setFrame] = useState(null), [error, setError] = useState(null), [selected, setSelected] = useState(null), [side, setSide] = useState('after'), [source, setSource] = useState(null);
    useEffect(() => { const c = new AbortController(); void rpc('structure', { sessionId, syncId }, c.signal).then(setFrame).catch(e => { if (!c.signal.aborted) setError(e); }); return () => c.abort(); }, [sessionId, syncId]);
    const change = frame?.changes?.find(c => c.id === selected), node = frame?.[side]?.nodes.find(n => n.id === selected) ?? change?.before;
    if (error) return <p className="we-error">{errorText(error)}</p>;
    if (!frame) return <p className="we-muted">正在读取可信结构快照…</p>;
    if (frame.state !== 'comparable') return <p className="we-muted">{frame.notice}</p>;
    return <div className="we-structure"><p className="we-muted">{frame.changes.length ? `${frame.changes.length} 个节点有变化` : '两个可信快照之间没有结构变化'} · {time(frame.before.recordedAt)} → {time(frame.after.recordedAt)}</p>
      <div className="we-actions"><button aria-pressed={side === 'before'} onClick={() => setSide('before')}>变化前</button><button aria-pressed={side === 'after'} onClick={() => setSide('after')}>变化后</button></div>
      <Structure after={frame[side]} before={side === 'after' ? frame.before : null} changes={side === 'after' ? frame.changes : []} selected={selected} onSelect={id => { setSelected(id); setSource(null); }} query="" changedOnly={false} mode="graph" zoom={1}/>
      {node ? <section className="we-node-detail"><h4>{node.title}</h4>{change ? <Fields change={change} before={frame.before} after={frame.after}/> : null}<pre>{node.body}</pre>
        {change?.inline ? <p className="we-inline">{change.inline.prefix}<ins>{change.inline.inserted}</ins>{change.inline.suffix}</p> : null}
        <button type="button" onClick={async () => { try { setSource(await rpc('source', { sessionId, syncId: side === 'before' ? frame.before.id : syncId, nodeId: node.id })); } catch (e) { setError(e); } }}>核对当前来源</button>
        {source ? <p role="status">{source.matches ? '来源版本一致。' : '来源已变化或不可用；历史正文保持原样。'}</p> : null}
        <details><summary>稳定身份与版本</summary><pre>{node.id}{'\n'}{node.sources.map(s => s.version).join('\n')}</pre></details>
      </section> : <p className="we-muted">选择节点查看正文、前后位置与来源。</p>}
    </div>;
  }
  function HandoffEditor({ record, draftKey, act, sessionId, inputActions, onSaved }) {
    const [body, setBody, localError] = useDraft(`${draftKey}:handoff:${record?.id ?? 'new'}`, record?.text ?? '');
    const [saved, setSaved] = useState(record), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const lastBody = useRef(body); lastBody.current = body;
    const generate = async () => { setBusy(true); try { const result = await act('handoff'); if (result && !lastBody.current) setBody(result.text); } finally { setBusy(false); } };
    return <div className="we-handoff-editor">{!body ? <div className="we-handoff-empty"><p>留下主要变化、验证结果和未决问题，下次可以直接接着工作。</p><button disabled={busy} onClick={() => void generate()}>形成交接初稿</button><button className="we-text-button" onClick={() => setBody('# 工作交接\n\n')}>直接书写</button></div> : <>
      <label>工作交接<textarea aria-label="工作交接正文" value={body} maxLength={60000} onChange={e => setBody(e.target.value)} rows={14}/></label>
      <div className="we-actions"><button disabled={busy || !body.trim() || body === saved?.text} onClick={async () => {
        const submitted = body; setBusy(true);
        try { const value = await act('save', { text: submitted, parent: saved?.id ?? null }); if (value) {
          setSaved(value); setNotice('交接已保存。');
          // Move the editor to the saved revision, carrying any typing during the request.
          try { localStorage.setItem(`${draftKey}:handoff:${value.id}`, lastBody.current); localStorage.removeItem(`${draftKey}:handoff:${record?.id ?? 'new'}`); onSaved(value); }
          catch { setNotice('交接已保存。浏览器暂存不可用，请保留此窗口中的新输入。'); }
        } } finally { setBusy(false); }
      }}>保存交接</button><button disabled={!saved || busy || body !== saved.text} onClick={async () => {
        const span = inputActions.captureInsertion(); setBusy(true);
        try { const quote = await rpc('quote', { sessionId, id: saved.id }); if (!inputActions.insertText(quote.text, span)) throw { code: 'INPUT_BUSY' }; setNotice('已引用到原生草稿，保留原有内容。'); }
        catch (e) { setNotice(errorText(e)); } finally { setBusy(false); }
      }}>引用到 DSH 草稿</button></div>{body !== saved?.text ? <p className="we-muted">{saved ? '有未保存的编辑。保存后可引用这个版本。' : '初稿可直接编辑；请补充实际验证结果。'}</p> : null}
    </>}{localError ? <p className="we-error">浏览器暂存不可用，请保存交接后再关闭。</p> : null}{notice ? <p className="we-muted" role="status">{notice}</p> : null}</div>;
  }
  function Board({ initial, sessionId, inputActions }) {
    const [view, setView] = useState(initial), [error, setError] = useState(null), [busy, setBusy] = useState(false), [record, setRecord] = useState(null), [structureOpen, setStructureOpen] = useState(false);
    const selected = useRef(view.sync?.id), active = useRef(true), readVersion = useRef(0), pending = useRef(new Map()); selected.current = view.sync?.id;
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const load = async syncId => {
      const version = ++readVersion.current, next = await rpc('view', { sessionId, ...(syncId ? { syncId } : {}) });
      if (next.project !== initial.project) throw { code: 'EVIDENCE_BINDING_CHANGED' };
      if (active.current && readVersion.current === version) setView(next);
      return next;
    };
    const act = async (method, payload = {}) => {
      setError(null);
      const syncId = selected.current;
      const key = JSON.stringify([method, syncId, payload]);
      if (!pending.current.has(key)) pending.current.set(key, crypto.randomUUID());
      try { const result = await rpc(method, { sessionId, syncId, requestId: pending.current.get(key), ...payload });
        pending.current.delete(key);
        if (active.current && selected.current === syncId) await load(method === 'sync' ? null : syncId).catch(setError);
        return result;
      } catch (e) { if (active.current) setError(e); return null; }
    };
    const analyzing = view.items.some(i => ['analyzing', 'queued'].includes(i.status));
    useEffect(() => { if (!analyzing) return; const timer = setInterval(() => { void load(selected.current).catch(setError); }, 1200); return () => clearInterval(timer); }, [analyzing]);
    const draftKey = `work-evidence:${view.project}:${view.sync?.id ?? 'start'}`;
    const files = new Map(view.items.map(i => [i.id, i])), grouped = new Set(view.groups.flatMap(g => g.itemIds));
    const file = item => <File key={`${view.sync.id}:${item.id}`} item={item} act={act} draftKey={draftKey}/>;
    return <section className="we-page" aria-label="工作回顾"><header className="we-heading"><span className="we-eyebrow">WORK EVIDENCE</span><h1>回顾刚才的工作</h1><p title={view.project}>{view.project.split('/').at(-1)}</p>
      <button className="we-primary" disabled={busy || analyzing} onClick={async () => { setBusy(true); const result = await act('sync'); if (result) { setRecord(null); setStructureOpen(false); } setBusy(false); }}>{busy ? '正在同步…' : view.sync ? '同步刚才的工作' : '建立同步起点'}</button>
      {!view.sync ? <p className="we-muted">先记住现在。从下一次同步起，回顾此后的提交和文件变化。</p> : null}</header>
      {error ? <div className="we-error" role="alert">{errorText(error)}{error.code === 'EVIDENCE_HISTORY_DIVERGED' ? <button onClick={() => void act('sync', { resetBaseline: true })}>保留旧记录，重新建立起点</button> : null}</div> : null}{view.issues.map((s, i) => <p className="we-error" key={i}>{s}</p>)}
      {view.sync ? <><div className="we-period"><select aria-label="同步记录" disabled={busy || analyzing} value={view.sync.id} onChange={async e => { setRecord(null); setStructureOpen(false); try { await load(e.target.value); } catch (err) { setError(err); } }}>{view.syncs.map(s => <option key={s.id} value={s.id}>{time(s.at)} · {s.title}</option>)}</select>
        {analyzing ? <button className="we-text-button" onClick={() => void act('cancel')}>停止分析</button> : view.items.some(i => i.status === 'pending') ? <button className="we-text-button" title="使用当前 DSH 模型理解本次 Diff、工作结构和当前会话的文字上下文" onClick={() => void act('analyze')}>理解这些变化</button> : null}</div>
        {view.sync.git.baseline ? <p className="we-empty">同步起点已记住。已有的 {view.sync.git.dirty.length} 个文件改动保留为基线，接下来可以自然工作，再回来同步。</p> : !view.items.length ? <p className="we-empty">这次没有发现新的提交或未提交变化。</p> : <div className="we-files">{view.groups.map(g => <section key={g.title}><h2 className="we-group-title">{g.title}<small>Agent 归组</small></h2>{g.itemIds.filter(id => files.has(id)).map(id => file(files.get(id)))}</section>)}{view.items.filter(i => !grouped.has(i.id)).map(file)}</div>}
        <details key={view.sync.id} className="we-structure-disclosure" onToggle={e => setStructureOpen(e.currentTarget.open)}><summary>查看 Logseq 结构变化</summary>{structureOpen ? <StructureChanges key={view.sync.id} sessionId={sessionId} syncId={view.sync.id}/> : null}</details>
        <section className="we-handoff"><div className="we-section-title"><h2>留一份工作交接</h2><select aria-label="已保存的交接" value={record?.id ?? ''} onChange={async e => { if (!e.target.value) { setRecord(null); return; } try { const r = await rpc('read-handoff', { sessionId, id: e.target.value }); if (r.syncId !== selected.current) await load(r.syncId); setRecord(r); } catch (err) { setError(err); } }}><option value="">新的交接</option>{view.handoffs.map(r => <option key={r.id} value={r.id}>{time(r.at)} · {r.title}</option>)}</select></div>
          <HandoffEditor key={`${view.sync.id}:${record?.id ?? 'new'}`} record={record} draftKey={draftKey} sessionId={sessionId} inputActions={inputActions} act={act} onSaved={setRecord}/>
        </section><details className="we-source-details"><summary>同步依据</summary><p>上次成功同步 → 本次 HEAD</p><pre>{view.sync.git.fromHead ?? '首次建立起点'}{'\n'}→ {view.sync.git.head ?? '尚无提交'}</pre>{view.sync.git.commits.map(c => <p key={c.sha}>{c.sha.slice(0, 8)} {c.subject}</p>)}<p>Diff 为同步时保留的版本；没有运行任何验证。</p></details>
      </> : null}</section>;
  }
  function Panel(props) {
    const info = props.useTabInfo(), [initial, setInitial] = useState(null), [error, setError] = useState(null), [version, setVersion] = useState(0);
    useEffect(() => { if (!info.tab.visible) return; const c = new AbortController(); setInitial(null); setError(null);
      void rpc('view', { sessionId: props.sessionId }, c.signal).then(value => { if (!c.signal.aborted) setInitial(value); }).catch(e => { if (!c.signal.aborted) setError(e); }); return () => c.abort();
    }, [props.sessionId, info.tab.visible, version]);
    useEffect(() => info.tab.actions.bindCommands({ refresh: () => setVersion(v => v + 1) }), [info.tab.actions]);
    return initial ? <Board key={`${props.sessionId}:${initial.project}:${version}`} initial={initial} sessionId={props.sessionId} inputActions={props.inputActions}/> : <section className="we-page"><h1>回顾刚才的工作</h1><p role="status">{error ? errorText(error) : '正在读取工作记录…'}</p>{error ? <button onClick={() => setVersion(v => v + 1)}>重新读取</button> : null}</section>;
  }
  function Header() { return <button className="wh-entry" onClick={() => ctx.sidebarRight.openTab('work-evidence')} aria-label="打开工作回顾">回顾工作</button>; }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: '@task-copilot/work-evidence', kind: 'work-evidence', title: () => '工作回顾', priority: 'extension', guide: [{ id: 'work-evidence', order: 340, title: () => '工作回顾' }] }));
  const register = (slot, spec, component) => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...spec }, component));
  register('conversation.session.header.utilities', { id: 'work-evidence', order: 12 }, Header);
  register('sidebar.right.pane.tab', { key: '@task-copilot/work-evidence' }, Panel);
  ctx.on('dispose', () => style.remove());
}
