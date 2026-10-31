/* global window */
import React, { useEffect, useSyncExternalStore } from 'react';
import { RecordDraft } from './record-draft.mjs';
import { EvidenceStructure } from './structure-view.jsx';
const statusLabels = { pending: '待分析', 'needs-reanalysis': '说明已保存，待更新解释', analyzing: '正在分析', reanalyzing: '正在更新解释', interpreted: '已形成解释', 'needs-clarification': '有一个关键问题', interrupted: '上次分析已中断，可重试', failed: '分析未完成，可重试' };
const active = item => ['analyzing','reanalyzing'].includes(item.state);
const internalFile = item => item.fact.path.split('/').includes('.task-workspace');
const changeSummary = fact => {
  const file = fact.workspace, codes = `${file?.staged ?? ''}${file?.unstaged ?? ''}`, changes = [];
  if (file) changes.push(file.untracked ? '新增（未跟踪）' : /A/.test(codes) ? '新增' : /D/.test(codes) ? '删除' : /R/.test(codes) ? '重命名' : /C/.test(codes) ? '复制' : '修改');
  if (fact.commits.length) changes.push(`${fact.commits.length} 个提交`);
  if (fact.restricted) changes.push('正文受限');
  return changes.join(' · ') || '暂无变化';
};
const errorText = error => ({ MODEL_NOT_CONFIGURED: '尚未配置模型，观察和交接保存仍可使用。', MISSING_CREDENTIAL: '模型凭据不可用，请在 DSH 中配置模型后重试；文件和交接仍可查看。', EACCES: '保存位置不可写，输入已保留；恢复权限后可重试。', MODEL_CONSENT_REQUIRED: '请先确认允许分析所选内容。', SOURCE_CHANGED: '来源已变化，请重新同步后读取当前差异。', INTERPRETATION_CHANGED: '解释版本已变化，输入已保留，请核对当前问题。', WORK_HISTORY_INCOMPLETE: '部分历史不可用，已保留有效记录；请先核对历史。' })[error.code] ?? `未完成：${error.code ?? '连接失败'}。输入仍保留，可重试。`;
export function reconstructionComponent({ rpc, usePanelState }) {
  const drafts = new Map(), counters = new Map(), startAttempts = new Map();
  function draftFor(key) {
    if (!drafts.has(key)) drafts.set(key, new RecordDraft(key, {
      read: () => JSON.parse(window.localStorage.getItem(`work-evidence:reconstruction:${key}`) ?? 'null'),
      write: value => window.localStorage.setItem(`work-evidence:reconstruction:${key}`, JSON.stringify(value)),
    }));
    return drafts.get(key);
  }
  function FileItem({ item, base, p, localBusy, consent, operation, analyze, refresh, showDiff, diff, closeDiff, selectedPaths, selectFile, setNotice, events }) {
      const { fact, interpretation, clarification } = item, draft = draftFor(`${base}:answer:${fact.id}`), input = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
      const busy = !!localBusy[fact.id] || active(item), answer = interpretation?.interpretation;
      async function clarify(skipped) {
        const saved = await draft.save({ ...p, itemId: fact.id, interpretationId: interpretation.id, skipped, ...(skipped ? { text: '' } : {}) }, payload => rpc('clarify', payload));
        if (saved) {
          await refresh(); setNotice(skipped ? '已跳过，未知信息会保留在交接中。' : consent ? '回答已保存。' : '回答已保存；确认分析范围后可更新此条解释。');
          if (!skipped && consent) await analyze(item);
        }
      }
      return <article className="we-row" aria-label={`文件 ${fact.path}`}>
        <div className="we-file-title"><label><input type="checkbox" checked={selectedPaths.includes(fact.path)} onChange={event => selectFile(fact.path, event.target.checked)} /> <strong>{fact.path}</strong></label>{item.state !== 'pending' && <span role="status">{statusLabels[item.state] ?? item.state}</span>}</div>
        <p className="we-muted">{changeSummary(fact)}</p>
        {answer && <><p>{answer.explanation}</p><p className="we-muted">主题（Agent）：{answer.group}</p></>}
        {item.error && <p role="alert">{errorText({ code: item.error })}</p>}
        <div className="we-tools"><button type="button" disabled={busy || !consent} onClick={() => void operation(fact.id, () => analyze(item))}>{interpretation ? '重新分析此条' : '分析此条'}</button></div>
        {answer?.question && <div className="we-question"><p><strong>待澄清：</strong>{answer.question}</p>
          {clarification && <p>{clarification.skipped ? '已跳过，仍待确认。' : `据用户说明：${clarification.text}`}</p>}
          <button type="button" disabled={busy || draft.hasInput()} onClick={() => draft.edit(answer.explanation)}>基于当前解释修订</button>
          <label>回答或修订这条解释<textarea maxLength={2000} value={input.text} onChange={event => draft.edit(event.target.value)} placeholder="补充系统无法从变化中判断的信息" /></label>
          <div className="we-tools"><button type="button" disabled={busy || input.text.length > 2000 || !input.text.trim() && !input.attempt} onClick={() => void operation(fact.id, () => clarify(false))}>{input.attempt ? '重查并重试原回答' : '保存回答并局部更新'}</button><button type="button" disabled={busy || !!input.attempt || clarification?.skipped && clarification.interpretationId === interpretation.id} onClick={() => void operation(fact.id, () => clarify(true))}>跳过这个问题</button></div>
        </div>}
        {!answer?.question && interpretation && <details><summary>补充或修订理解</summary>{clarification && <p>此前用户说明：{clarification.skipped ? '已跳过' : clarification.text}</p>}
          <button type="button" disabled={busy || draft.hasInput()} onClick={() => draft.edit(answer.explanation)}>基于当前解释修订</button>
          <label>我的补充<textarea maxLength={2000} value={input.text} onChange={event => draft.edit(event.target.value)} /></label><button type="button" disabled={busy || input.text.length > 2000 || !input.text.trim() && !input.attempt} onClick={() => void operation(fact.id, () => clarify(false))}>保存补充并局部更新</button>
        </details>}
        {input.text.length > 2000 && <p role="alert">这条说明最多保存 2000 字，请精简后保存；原解释仍会保留。</p>}
        {(input.text || input.attempt) && <p className="we-muted">{input.status === 'unknown' ? '保存结果未确认，重试会核对原请求。' : '未确认文字保留在本浏览器，保存期间可以继续输入。'}{input.backupFailed ? '浏览器备份失败，请保留本页或复制文字。' : ''}</p>}
        <details><summary>差异与依据</summary>
          <p className="we-muted">{fact.commits.length ? `${fact.commits.length} 个新提交` : '无新提交'}{fact.workspace ? ' · 工作区有变化' : ''}{fact.workspace?.untracked ? ' · 未跟踪文件仅记录元数据' : ''}</p>
          {fact.aliases.length > 1 && <p>路径来源：{fact.aliases.join(' ← ')}</p>}
          {!fact.restricted && <div className="we-tools">{fact.commits.map(sha => <button type="button" key={sha} onClick={() => void operation(`diff:${fact.id}`, () => showDiff(item, null, sha))}>提交 {sha.slice(0, 8)}</button>)}
            {fact.workspace && !fact.workspace.untracked && ['staged','unstaged'].filter(side => fact.workspace[side] !== '.').map(side => <button type="button" key={side} onClick={() => void operation(`diff:${fact.id}`, () => showDiff(item, side))}>{side === 'staged' ? '暂存差异' : '未暂存差异'}</button>)}</div>}
          {(events.find(e => e.id === item.runId)?.sourceProblems ?? []).map((code,i) => <p key={i}>上下文不可用：{code}</p>)}
          {(events.find(e => e.id === item.runId)?.sources ?? []).map(source => <p key={source.ref}><code>{source.ref}</code> · {source.hash.slice(0,12)}{source.truncated ? ' · 截断' : ''}</p>)}
          {answer && <><p>Agent 解释来源（不等于完成证明）：</p>{answer.evidenceRefs.map(ref => <p key={ref}><code>{ref}</code></p>)}{answer.uncertainties.map((u,i) => <p key={i}>未知：{u}</p>)}</>}
          {diff?.path === fact.path && <div className="we-preview" aria-label="还原文件差异"><h4>{diff.label}</h4><p>{diff.text ? '按需读取，正文不存档。' : diff.state === 'truncated' ? '差异超过上限，正文未返回。' : '没有可展示的文本，受限或无差异。'}</p>{diff.text && <pre>{diff.text}</pre>}<button type="button" onClick={closeDiff}>关闭差异</button></div>}
        </details>
      </article>;
    }
  function Reconstruction({ scopeId, observation, sessionId, prepareQuote, selectedPaths, selectFile }) {
    const base = `${scopeId}:${observation.id}`, p = { scopeId, observationId: observation.id };
    const state = (name, initial) => usePanelState(`reconstruct:${base}:${name}`, initial);
    const [view, setView] = state('data', null), [notice, setNotice] = state('notice', ''), [localBusy, setLocalBusy] = state('busy', {});
    const [consent, setConsent] = state('consent', false), [sessionContext, setSessionContext] = state('sessionContext', false), [logseqContext, setLogseqContext] = state('logseqContext', false);
    const [mode, setMode] = state('mode', 'list'), [diff, setDiff] = state('diff', null);
    const handoff = draftFor(`${base}:handoff`), handoffState = useSyncExternalStore(handoff.subscribe, handoff.getSnapshot);
    async function refresh() {
      const count = (counters.get(base) ?? 0) + 1; counters.set(base, count);
      const value = await rpc('reconstruction', p);
      if (counters.get(base) === count) setView(value);
    }
    async function operation(key, fn) {
      setLocalBusy(prior => ({ ...prior, [key]: true })); setNotice('');
      try { await fn(); } catch (error) { setNotice(errorText(error)); }
      finally { setLocalBusy(prior => ({ ...prior, [key]: false })); }
    }
    useEffect(() => { void refresh().catch(error => setNotice(errorText(error))); }, [base]);
    const canAnalyze = consent && view?.modelConfigured !== false;
    const hasActive = view?.items.some(active) ?? false;
    useEffect(() => {
      if (!hasActive) return;
      const timer = globalThis.setInterval(() => { void refresh().catch(error => setNotice(errorText(error))); }, 900); timer.unref?.();
      return () => globalThis.clearInterval(timer);
    }, [base, hasActive]);
    async function analyze(item) {
      const key = `${base}:${item.fact.id}`;
      let attempt = startAttempts.get(key);
      if (!attempt) {
        try { attempt = JSON.parse(window.localStorage.getItem(`work-evidence:analysis-request:${key}`) ?? 'null'); } catch { /* Request metadata only. */ }
      }
      if (!attempt) attempt = { ...p, itemId: item.fact.id, allowModel: consent,
        context: { ...(sessionContext && sessionId ? { sessionId } : {}), logseq: logseqContext }, requestId: globalThis.crypto.randomUUID() };
      startAttempts.set(key, attempt); window.localStorage.setItem(`work-evidence:analysis-request:${key}`, JSON.stringify(attempt));
      await rpc('analyze', attempt);
      startAttempts.delete(key); window.localStorage.removeItem(`work-evidence:analysis-request:${key}`);
      await refresh();
    }
    async function showDiff(item, side, sha) {
      setDiff(null);
      const value = sha ? await rpc('commitDiff', { ...p, itemId: item.fact.id, sha }) : await rpc('diff', { ...p, path: item.fact.path, side });
      setDiff({ ...value, path: item.fact.path, label: sha ? `提交 ${sha.slice(0, 10)}` : side === 'staged' ? '暂存差异' : '未暂存差异' });
    }
    const groups = new Map(), internal = (view?.items ?? []).filter(internalFile);
    for (const item of (view?.items ?? []).filter(item => !internalFile(item))) { const name = item.interpretation?.interpretation.group ?? '尚未归组'; const list = groups.get(name) ?? []; list.push(item); groups.set(name,list); }
    const fileRow = item => <FileItem key={item.fact.id} item={item} {...{ base, p, localBusy, consent: canAnalyze, operation, analyze, refresh, showDiff, diff, closeDiff: () => setDiff(null), selectedPaths, selectFile, setNotice, events: view.events }} />;
    return <section aria-label="工作还原"><div className="we-section-title"><h4>这次的变化{view ? ` · ${view.items.length - internal.length} 个文件` : ''}</h4><button type="button" onClick={() => setMode(mode === 'list' ? 'structure' : 'list')}>{mode === 'list' ? '查看结构变化' : '返回文件列表'}</button></div>
      <details><summary>分析范围与相关上下文</summary><p>分析会把允许读取的有限 Git 差异、已保存意图和所选上下文发给当前 DSH 模型。正文不在观察历史中存档；未跟踪文件只用元数据。</p>
        <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />允许使用当前 DSH 模型分析本轮来源</label>
        {sessionId && <label><input type="checkbox" checked={sessionContext} onChange={event => setSessionContext(event.target.checked)} />结合当前会话的最近文本（仅当会话目录与所选仓库相同）</label>}
        <label><input type="checkbox" checked={logseqContext} onChange={event => setLogseqContext(event.target.checked)} />结合此目录已有授权的 Logseq 工作结构（不建立新绑定）</label>
      </details>
      {view?.modelConfigured === false && <p className="we-muted" role="status">尚未配置或选择模型，分析暂不可用。观察、Diff、交接保存和引用仍可使用。</p>}
      {!consent && view?.modelConfigured !== false && <p className="we-muted">需要分析时，在上方确认发送范围。</p>}
      {!view && <p>正在读取文件条目…</p>}
      {view && !view.complete && <p role="alert">部分分析记录不可用，已隔离；缺失内容保持未知。</p>}
      {view?.modelConfigured === false && <button type="button" onClick={() => void operation('refresh', refresh)}>刷新分析状态</button>}
      {mode === 'structure' ? <EvidenceStructure rpc={rpc} scopeId={scopeId} observationId={observation.id} /> : <>{[...groups].map(([group,items]) => <section key={group}>{group !== '尚未归组' && <h4>{group}</h4>}{items.map(fileRow)}</section>)}{internal.length > 0 && <details><summary>工作区内部记录（{internal.length}）</summary><p className="we-muted">这些是工作台生成的文件，观察仍保留；正文可能包含内部来源。</p>{internal.map(fileRow)}</details>}</>}
      {view?.items.length === 0 && <p>这次没有可用的文件条目；仍可保存带范围说明的交接。</p>}
      <h4>工作交接</h4><p className="we-muted">随时整理，不要求回答所有问题。未分析、失败或跳过的内容保留为未知。</p>
      <button type="button" disabled={!!localBusy.handoff || handoff.hasInput()} onClick={() => void operation('handoff', async () => { const draft = await rpc('handoffDraft', p); handoff.edit(draft.text, { sourceEventIds: draft.sourceEventIds }); })}>整理交接草稿</button>
      {handoff.hasInput() && <><label>检查并编辑交接<textarea aria-label="交接文本" maxLength={24000} value={handoffState.text} onChange={event => handoff.edit(event.target.value)} rows={9} /></label><div className="we-tools">
        <button type="button" disabled={!!localBusy.handoff || !handoffState.text.trim() && !handoffState.attempt} onClick={() => void operation('handoff', async () => {
          const receipt = await handoff.save({ ...p, ...handoffState.meta }, payload => rpc('saveHandoff', payload));
          if (receipt) { await refresh(); setNotice('交接已保存，可从下方历史重新打开或引用。'); }
        })}>{handoffState.attempt ? '重查并重试原交接' : '保存交接记录'}</button>
        <button type="button" disabled={!!handoffState.attempt} onClick={() => handoff.edit('', {})}>取消本次交接编辑</button></div>
        <p className="we-muted">{handoffState.status === 'unknown' ? '保存结果未确认，文字仍保留。' : '未保存交接已暂存本浏览器。'}{handoffState.backupFailed ? '临时备份失败，请复制文字。' : ''}</p></>}
      <details><summary>已保存交接（{view?.handoffs.length ?? 0}）</summary>{view?.handoffs.map(record => <div className="we-row" key={record.id}><p>{record.createdAt}{record.supersedesId ? ' · 修订版' : ''}</p><details><summary>重新打开交接</summary><pre>{record.text}</pre></details><div className="we-tools">
        <button type="button" disabled={handoff.hasInput()} onClick={() => handoff.edit(record.text, { sourceEventIds: record.sourceEventIds, supersedesId: record.id })}>修订这份交接</button>
        <button type="button" onClick={() => void operation('quote', async () => prepareQuote(await rpc('quoteHandoff', { ...p, handoffId: record.id })))}>准备交接引用</button>
      </div></div>)}</details>
      <p role="status" aria-live="polite">{notice}</p>
    </section>;
  }
  return { Component: Reconstruction, hasInput: () => [...drafts.values()].some(draft => draft.hasInput()),
    retained: (scopeId, observationId) => [...new Set([...drafts].filter(([key,draft]) => key.startsWith(`${scopeId}:`) && key.split(':')[1] !== observationId && draft.hasInput()).map(([key]) => key.split(':')[1]))],
  };
}
