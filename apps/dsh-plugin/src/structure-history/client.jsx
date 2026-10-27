/* global document, AbortController, ResizeObserver, requestAnimationFrame */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compare, quote } from './model.mjs';
import { Structure, Fields } from '../structure-view/view.jsx';
import { historyStyles } from './styles.mjs';
const tabId = '@task-copilot/work-history';
const trackName = t => !t || t === 'work-structure' ? '工作结构' : t === 'git-changes' ? 'Git 实际变更' : 'Logseq 来源结构';
const time = r => new Date(r.occurredAt ?? r.recordedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const issue = e => ({ HISTORY_PROJECT_REQUIRED: '此会话还没有工作目录。选择 DSH 工作目录后，历史会自动归属到这里。', HISTORY_RECORD_CORRUPT: '这条历史记录已损坏，无法可靠展示。其他记录仍可浏览。', HISTORY_DIFFERENT_TRACKS: '请选择同一种结构的两个时点进行比较。', ENOENT: '当前来源已删除或不可用；保存的历史仍保留。', BINDING_CHANGED: '会话工作范围已改变，请重新读取。', HISTORY_LOGSEQ_CONNECTION_CHANGED: '此来源属于另一个 Logseq 工作连接。' }[e?.code] ?? e?.message ?? '暂时无法读取历史。');
const savedBody = n => !n ? '此时点未记录该节点' : n.availability === 'available' ? n.body : '此时点的正文未知';
class CanvasBoundary extends React.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidUpdate(previous) { if (previous.resetKey !== this.props.resetKey && this.state.failed)
        this.setState({ failed: false }); }
    render() { return this.state.failed ? <div className="wh-alert">结构画布暂不可显示。<button onClick={this.props.onOutline}>使用目录浏览</button></div> : this.props.children; }
}
export function applyHistoryClient(ctx) {
    const style = document.createElement('style');
    style.textContent = historyStyles;
    document.head.append(style);
    const refreshers = new Set();
    const rpc = async (method, payload, signal) => { const answer = await ctx.connection.rpc.call('/api', `logseq-workbench/history-${method}`, payload, signal); if (!answer.ok)
        throw Object.assign(Error(answer.error.message), { code: answer.error.code }); return answer.value; };
    function Header() { return <button type="button" className="wh-entry" aria-label="打开工作历史" onClick={() => ctx.sidebarRight.openTab('work-history')}>◴ 工作历史</button>; }
    function Panel(props) {
        const info = props.useTabInfo(), sessionId = props.sessionId, root = useRef(null), detail = useRef(null), cache = useRef(new Map()), request = useRef(null), sourceRequest = useRef(null);
        const [catalog, setCatalog] = useState(null), [track, setTrack] = useState('default'), [selectedId, setSelectedId] = useState(null), [baselineId, setBaselineId] = useState(''), [frame, setFrame] = useState(null), [baseline, setBaseline] = useState(null), [selectedNode, setSelectedNode] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(false), [notice, setNotice] = useState(''), [query, setQuery] = useState(''), [mode, setMode] = useState('graph'), [changedOnly, setChangedOnly] = useState(false), [zoom, setZoom] = useState(1), [width, setWidth] = useState(400), [source, setSource] = useState(null);
        const fetchList = useCallback(async ({ more = false } = {}) => {
            request.current?.abort();
            const controller = new AbortController();
            request.current = controller;
            setLoading(true);
            setError(null);
            try {
                const result = await rpc('list', { sessionId, track, ...(more ? { before: catalog.next } : {}) }, controller.signal);
                if (controller.signal.aborted)
                    return;
                if (!catalog || catalog.project !== result.project || catalog.track !== result.track) {
                    cache.current.clear();
                    const current = result.records.find(r => r.id === result.preferredId) ?? result.records[0];
                    setSelectedId(current?.id ?? null);
                    setBaselineId('');
                    setChangedOnly(false);
                    setSelectedNode(null);
                    setQuery('');
                    setFrame(null);
                    setBaseline(null);
                }
                setCatalog(previous => {
                    const same = previous?.project === result.project && previous?.track === result.track;
                    const retained = same ? (more ? previous.records : previous.records.filter(r => r.id === selectedId || r.id === baselineId)) : [];
                    return { ...result, records: [...new Map([...retained, ...result.records].map(r => [r.id, r])).values()] };
                });
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setError(e);
            }
            finally {
                if (request.current === controller)
                    setLoading(false);
            }
        }, [sessionId, track, catalog?.project, catalog?.track, catalog?.next, selectedId, baselineId]);
        const refresh = useRef(fetchList);
        refresh.current = fetchList;
        useEffect(() => { if (!info.tab.visible)
            return; void refresh.current(); const run = () => void refresh.current(); refreshers.add(run); return () => { refreshers.delete(run); request.current?.abort(); sourceRequest.current?.abort(); }; }, [sessionId, info.tab.visible, track]);
        useEffect(() => { cache.current.clear(); setCatalog(null); setFrame(null); setBaseline(null); setSelectedId(null); setBaselineId(''); setSelectedNode(null); }, [sessionId]);
        useEffect(() => { const observer = new ResizeObserver(() => setWidth(root.current.clientWidth)); observer.observe(root.current); return () => observer.disconnect(); }, []);
        useEffect(() => info.tab.actions.bindCommands({ refresh: () => void refresh.current() }), [info.tab.actions]);
        useEffect(() => {
            if (!selectedId || !info.tab.visible)
                return;
            const controller = new AbortController();
            setLoading(true);
            setError(null);
            setSource(null);
            sourceRequest.current?.abort();
            const read = async (id) => { if (cache.current.has(id))
                return cache.current.get(id); const value = await rpc('read', { sessionId, id }, controller.signal); if (!controller.signal.aborted) {
                cache.current.set(id, value);
                if (cache.current.size > 8) {
                    const discard = [...cache.current.keys()].find(key => key !== selectedId && key !== baselineId);
                    cache.current.delete(discard);
                }
            } return value; };
            void Promise.all([read(selectedId), baselineId ? read(baselineId) : Promise.resolve(null)]).then(([a, b]) => { if (!controller.signal.aborted) {
                setFrame(a);
                setBaseline(b);
                setNotice('');
            } }).catch(e => { if (!controller.signal.aborted) {
                setError(e);
                setFrame(null);
                setBaseline(null);
            } }).finally(() => { if (!controller.signal.aborted)
                setLoading(false); });
            return () => controller.abort();
        }, [sessionId, selectedId, baselineId, info.tab.visible]);
        const records = useMemo(() => [...(catalog?.records ?? [])].sort((a, b) => a.sequence - b.sequence), [catalog]), index = records.findIndex(r => r.id === selectedId);
        const changes = useMemo(() => frame && baseline ? compare(baseline, frame) : [], [frame, baseline]), change = changes.find(c => c.id === selectedNode), node = frame?.nodes.find(n => n.id === selectedNode) ?? change?.before ?? null;
        const nodeFrame = frame?.nodes.some(n => n.id === selectedNode) ? frame : baseline;
        const effectiveMode = mode;
        const selectNode = id => {
            setSelectedNode(id);
            setSource(null);
            sourceRequest.current?.abort();
        };
        const closeDetail = () => {
            setSelectedNode(null); setSource(null); sourceRequest.current?.abort();
            requestAnimationFrame(() => [...root.current.querySelectorAll('[data-history-node]')].find(el => el.dataset.historyNode === selectedNode)?.focus());
        };
        useEffect(() => { if (selectedNode && width < 900) detail.current?.querySelector('button')?.focus(); }, [selectedNode]);
        const choose = id => { if (id === baselineId) setBaselineId(''); setSelectedId(id); setSource(null); sourceRequest.current?.abort(); };
        const toggleCompare = () => { setChangedOnly(false); setBaselineId(baselineId ? '' : records[index - 1]?.id ?? records.find(r => r.id !== selectedId)?.id ?? ''); };
        const insert = (kind = 'snapshot') => {
            if (loading || kind !== 'organize' && (!frame || frame.id !== selectedId || baselineId && baseline?.id !== baselineId))
                return;
            if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) {
                setNotice('会话已切换，未修改草稿。');
                return;
            }
            const text = kind === 'organize' ? '\n请先用 work_history_list/read 读取当前工作结构，核对本项目材料，再构建或更新节点、层级和依赖。沿用已有节点 ID，保留来源 ref 和已核对的 version；用 work_history_snapshot 明确保存完整选定结构为新版本，不改旧历史或正式任务状态。\n' : quote({ snapshot: kind === 'node' || kind === 'source' ? nodeFrame : frame, ...(kind === 'node' ? { node } : {}), ...(kind === 'source' ? { node, source } : {}), ...(kind === 'diff' ? { baseline, changes } : {}) });
            const span = props.inputActions.captureInsertion();
            if (props.inputActions.insertText(text, span))
                setNotice('已带入当前草稿，尚未发送。');
            else
                setNotice('草稿正在变化或提交，未插入。现有输入保持原样。');
        };
        const readSource = async (sourceIndex) => {
            sourceRequest.current?.abort();
            const controller = new AbortController();
            sourceRequest.current = controller;
            setSource({ loading: true });
            try {
                const value = await rpc('source', { sessionId, snapshotId: nodeFrame.id, nodeId: node.id, sourceIndex }, controller.signal);
                if (!controller.signal.aborted)
                    setSource(value);
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setSource({ error: issue(e) });
            }
        };
        const fullScreen = e => { const target = ctx.sidebarRight.focusedTarget(e.currentTarget); if (target)
            ctx.sidebarRight.toggleFullscreen(target); };
        const versionLabel = r => `#${r.sequence} · ${time(r)} · ${r.title}`;
        return <section ref={root} className={`wh-workbench ${width < 900 ? 'is-compact' : ''}`} aria-label="工作结构历史工作台" aria-busy={loading}>
      <header className="wh-heading"><strong title={catalog?.project}>工作历史 <small>{catalog?.project?.split('/').at(-1)}</small></strong><div><button onClick={() => insert('organize')} disabled={loading}>更新结构 ↗</button><button onClick={() => void refresh.current()} disabled={loading} aria-label="刷新历史">↻</button><button onClick={fullScreen} aria-label="切换历史画布全屏">{info.sidebar.fullscreen ? '收起' : '全屏'}</button></div></header>
      {error ? <p className="wh-alert" role="alert">{issue(error)}</p> : null}
      {notice ? <p className="wh-notice" role="status">{notice}</p> : null}
      {catalog?.issues.length ? <p className="wh-alert" role="status">{catalog.issues.join('；')}</p> : null}
      {catalog ? <div className="wh-versions">
        <select aria-label="历史投影" value={catalog.track ?? track} onChange={e => setTrack(e.target.value)}>{[...new Set([catalog.track, ...catalog.tracks])].filter(Boolean).map(t => <option key={t} value={t}>{trackName(t)}</option>)}</select>
        <select aria-label="查看历史版本" value={selectedId ?? ''} disabled={loading || !records.length} onChange={e => choose(e.target.value)}>{!records.length ? <option value="">暂无版本</option> : [...records].reverse().map(r => <option key={r.id} value={r.id}>{versionLabel(r)}</option>)}</select>
        <button aria-pressed={!!baselineId} disabled={records.length < 2 || loading} onClick={toggleCompare}>比较</button>
        {baselineId ? <><span>←</span><select aria-label="比较基准时点" value={baselineId} disabled={loading} onChange={e => setBaselineId(e.target.value)}>{[...records].reverse().filter(r => r.id !== selectedId).map(r => <option key={r.id} value={r.id}>{versionLabel(r)}</option>)}</select></> : null}
        {catalog.more ? <button disabled={loading} onClick={() => void fetchList({ more: true })}>更早版本</button> : null}
      </div> : null}
      <div className={`wh-work-area ${node ? 'has-detail' : ''}`}>
        <main className="wh-main">
          {frame ? <>
            <div className="wh-canvas-tools"><label><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索节点" aria-label="搜索历史节点"/></label><div>
              <button aria-pressed={effectiveMode === 'graph'} onClick={() => setMode('graph')}>结构图</button><button aria-pressed={effectiveMode === 'outline'} onClick={() => setMode('outline')}>目录</button>
              {effectiveMode === 'graph' ? <><button aria-label="缩小历史图" disabled={zoom <= .55} onClick={() => setZoom(Math.max(.55, zoom - .15))}>−</button><button aria-label="重置历史图缩放" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="放大历史图" disabled={zoom >= 1.6} onClick={() => setZoom(Math.min(1.6, zoom + .15))}>＋</button></> : null}
              <button disabled={loading} onClick={() => insert(baseline ? 'diff' : 'snapshot')}>{baseline ? '引用比较 ↗' : '引用结构 ↗'}</button>
            </div></div>
            {baseline ? <div className="wh-diff-summary"><strong>#{baseline.sequence} → #{frame.sequence}</strong><span>{changes.length ? `${changes.length} 个节点变化` : '无变化'}</span><button aria-pressed={changedOnly} onClick={() => setChangedOnly(!changedOnly)}>只看变化</button>{changes.length ? <select aria-label="定位变化节点" value={change?.id ?? ''} onChange={e => selectNode(e.target.value)}><option value="" disabled>选择变化节点</option>{changes.map(c => <option key={c.id} value={c.id}>{(c.after ?? c.before).title} · {c.kinds.join('、')}</option>)}</select> : null}</div> : null}

            <CanvasBoundary resetKey={`${frame.id}:${effectiveMode}`} onOutline={() => setMode('outline')}><Structure after={frame} before={baseline} changes={changes} selected={selectedNode} onSelect={selectNode} query={query} changedOnly={!!baseline && changedOnly} mode={effectiveMode} zoom={zoom}/></CanvasBoundary>
            {frame.facts?.patch || frame.facts?.since ? <details className="wh-evidence"><summary>Git patch{frame.facts.truncated ? ' · 已节选' : ''}</summary><pre>{frame.facts.since || frame.facts.patch}</pre></details> : null}
          </> : <div className="wh-empty">{loading ? '正在读取历史…' : '暂无结构，点击「更新结构」交给 DSH 整理。'}</div>}
        </main>
        {node ? <aside ref={detail} className="wh-detail" aria-label="历史节点详情" onKeyDown={e => { if (e.key === 'Escape') closeDetail(); }}>
          <div className="wh-detail-title"><h3>{node.title}</h3><button onClick={closeDetail} aria-label="关闭节点详情">×</button></div>
          <div className="wh-detail-actions"><span>{node.status ?? ''}{change ? `${node.status ? ' · ' : ''}${change.kinds.join(' · ')}` : ''}</span><button onClick={() => insert('node')} disabled={loading}>引用节点 ↗</button></div>
          {node.parentId ? <button className="wh-relation" disabled={!nodeFrame.nodes.some(n => n.id === node.parentId)} onClick={() => selectNode(node.parentId)}>↑ {nodeFrame.nodes.find(n => n.id === node.parentId)?.title ?? node.parentId}</button> : null}
          {node.dependencies.length ? <div className="wh-relations"><small>依赖</small>{node.dependencies.map(id => <button key={id} disabled={!nodeFrame.nodes.some(n => n.id === id)} onClick={() => selectNode(id)}>{nodeFrame.nodes.find(n => n.id === id)?.title ?? id}</button>)}</div> : null}
          <Fields change={change} before={baseline} after={frame}/>{baseline && change ? <div className="wh-text-diff"><div><h4>#{baseline.sequence} 比较前</h4><pre>{savedBody(change.before)}</pre></div><div><h4>#{frame.sequence} 比较后</h4><pre>{change.inline ? <>{change.inline.prefix}<mark>{change.inline.inserted}</mark>{change.inline.suffix}</> : savedBody(change.after)}</pre></div></div> : <pre className="wh-body">{savedBody(node)}</pre>}
          {node.sources.length ? <div className="wh-sources"><h4>核对来源</h4>{node.sources.map((s, i) => <button key={i} className="wh-source" disabled={loading} onClick={() => void readSource(i)} title={s.version ? `历史版本 ${s.version}` : '历史版本未知'}><span>{s.kind === 'logseq' ? 'Logseq 原文' : s.ref}</span><span>核对 ↗</span></button>)}</div> : null}
          {source ? <section className="wh-current-source">{source.loading ? <p>正在核对…</p> : source.error ? <p role="alert">{source.error}</p> : <><p>{source.notice}</p><button disabled={loading} onClick={() => insert('source')}>引用核对结果 ↗</button><pre>{source.current?.content ?? source.source?.excerpt ?? '未保存正文'}</pre>{source.current?.truncated ? <small>当前来源已节选</small> : null}</>}</section> : null}
        </aside> : null}
      </div>
    </section>;
    }
    ctx.effect(() => ctx.sidebarRightTabs.register({ id: tabId, kind: 'work-history', title: () => '工作历史', priority: 'extension', guide: [{ id: 'work-history', order: 360, title: () => '工作结构与历史' }] }));
    const register = (slot, spec, component) => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...spec }, component));
    register('conversation.session.header.utilities', { id: 'work-history', order: 12 }, Header);
    register('sidebar.right.pane.tab', { key: tabId }, Panel);
    ctx.on('connection/reset', () => { for (const refresh of refreshers)
        refresh(); });
    ctx.on('dispose', () => { style.remove(); refreshers.clear(); });
}
