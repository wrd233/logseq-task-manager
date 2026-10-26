/* global document, AbortController, ResizeObserver, requestAnimationFrame */
import React, { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import { compare, origins, quote, outline } from './model.mjs';
import { treeLayout, visibleTree } from './layout.mjs';
import { historyStyles } from './styles.mjs';
const tabId = '@task-copilot/work-history';
const trackName = t => !t || t === 'work-structure' ? '工作结构' : t === 'git-changes' ? 'Git 实际变更' : 'Logseq 来源结构';
const time = r => new Date(r.occurredAt ?? r.recordedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const issue = e => ({ HISTORY_PROJECT_REQUIRED: '此会话还没有工作目录。选择 DSH 工作目录后，历史会自动归属到这里。', HISTORY_RECORD_CORRUPT: '这条历史记录已损坏，无法可靠展示。其他记录仍可浏览。', HISTORY_DIFFERENT_TRACKS: '请选择同一种结构的两个时点进行比较。', ENOENT: '当前来源已删除或不可用；保存的历史仍保留。', BINDING_CHANGED: '会话工作范围已改变，请重新读取。', HISTORY_LOGSEQ_CONNECTION_CHANGED: '此来源属于另一个 Logseq 工作连接。' }[e?.code] ?? e?.message ?? '暂时无法读取历史。');
const depth = (node, map) => { let d = 0; for (let p = node.parentId; p && map.has(p); p = map.get(p).parentId)
    d++; return d; };
/** Two-dimensional viewport culling keeps large saved trees usable. */
function Structure({ after, before, changes, selected, onSelect, query, changedOnly, mode, zoom }) {
    const viewport = useRef(null), marker = useId().replaceAll(':', ''), [bounds, setBounds] = useState({ width: 600, height: 500, top: 0, left: 0 });
    const { nodes, matches } = useMemo(() => visibleTree(after, changes, query, changedOnly), [after, before, changes, query, changedOnly]);
    const changed = useMemo(() => new Map(changes.map(c => [c.id, c])), [changes]);
    const layout = useMemo(() => treeLayout(nodes, bounds.width, zoom), [nodes, bounds.width, zoom]);
    const ordered = useMemo(() => outline(nodes), [nodes]);
    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const positions = mode === 'graph' ? layout.positions : new Map(ordered.map((n, i) => [n.id, { x: depth(n, nodeMap) * 14, y: i * 48, width: bounds.width - 28, height: 44 }]));
    const visible = nodes.filter(n => { const p = positions.get(n.id); return p && p.y + p.height >= bounds.top - 100 && p.y <= bounds.top + bounds.height + 100 && p.x + p.width >= bounds.left - 200 && p.x <= bounds.left + bounds.width + 200; });
    const visibleIds = new Set(visible.map(n => n.id));
    useEffect(() => { const el = viewport.current, observer = new ResizeObserver(() => setBounds(b => ({ ...b, width: el.clientWidth, height: el.clientHeight }))); observer.observe(el); return () => observer.disconnect(); }, []);
    const locate = id => { const p = positions.get(id); if (p) viewport.current.scrollTo({ top: Math.max(0, p.y - bounds.height / 3), left: Math.max(0, p.x + p.width / 2 - bounds.width / 2), behavior: 'auto' }); };
    useEffect(() => { if (query || changedOnly) { const first = nodes.find(n => matches.has(n.id)); if (first) locate(first.id); } else viewport.current.scrollTo({ top: 0, left: 0 }); }, [query, changedOnly, after.id, before?.id, mode]);
    useEffect(() => { locate(selected); }, [selected, bounds.width, mode]);
    const relationPath = (from, to, lane, bus) => {
        const a = positions.get(from), b = positions.get(to); if (!a || !b) return '';
        const x = a.x + a.width / 2, y = a.y + a.height, end = b.x + b.width / 2;
        return lane == null ? `M${x} ${y} V${bus} H${end} V${b.y}` : `M${x} ${y} v${12 * zoom} H${lane} V${bus} H${end} V${b.y}`;
    };
    return <section className="wh-structure"><div className="wh-canvas-caption"><span>{query || changedOnly ? `${matches.size} / ` : ''}{after.nodes.length + changes.filter(c => !c.after).length} 节点 <span className="wh-legend">─ 归属 · ⇢ 依赖</span><span className={`wh-origin ${after.origin}`} title={`记录于 ${after.recordedAt}${after.occurredAt ? ' · 事件时间 ' + after.occurredAt : ''}${after.reconstructedAt ? ' · 重建于 ' + after.reconstructedAt : ''}`}> · {origins[after.origin]}{after.coverage === 'partial' ? ' · 部分范围' : ''}</span></span><button onClick={() => locate(selected)} disabled={!positions.has(selected)}>定位选中</button></div>
      <div className={`wh-viewport wh-${mode}`} ref={viewport} onScroll={e => { const el = e.currentTarget; setBounds(b => ({ ...b, top: el.scrollTop, left: el.scrollLeft })); }} role="region" aria-label={mode === 'graph' ? '历史结构图' : '历史目录'}>
        <div style={{ position: 'relative', height: mode === 'graph' ? layout.height : ordered.length * 48, width: mode === 'graph' ? layout.width : '100%', minHeight: '100%' }}>
          {mode === 'graph' ? <svg className="wh-edges" width={layout.width} height={layout.height} aria-hidden="true">
            <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="none" stroke="currentColor"/></marker></defs>
            {layout.edges.filter(e => visibleIds.has(e.from) || visibleIds.has(e.to)).map(e => <path key={`${e.from}:${e.to}`} className={`wh-parent-edge ${changed.get(e.to)?.after === null ? 'is-historical' : ''}`} d={relationPath(e.from, e.to, e.lane, e.bus)}/>)}
            {nodes.flatMap(n => n.dependencies.filter(id => positions.has(id) && (visibleIds.has(n.id) || visibleIds.has(id)) && (nodes.length <= 80 || selected === id || selected === n.id)).map(id => {
                const a = positions.get(n.id), b = positions.get(id), x = a.x + a.width, end = b.x + b.width;
                return <path key={`${n.id}:dep:${id}`} className={`wh-dependency ${selected === n.id || selected === id ? 'is-active' : ''}`} markerEnd={`url(#${marker})`} d={`M${x} ${a.y + a.height / 2} C${Math.max(x, end) + 20} ${a.y + a.height / 2},${Math.max(x, end) + 20} ${b.y + b.height / 2},${end} ${b.y + b.height / 2}`}/>;
            }))}
          </svg> : null}
          {visible.map(n => { const c = changed.get(n.id), p = positions.get(n.id), ghost = c && !c.after;
              return <button key={n.id} className={`wh-node ${c ? 'is-changed' : ''} ${ghost ? 'is-ghost' : ''} ${c && !c.before ? 'is-added' : ''} ${selected === n.id ? 'is-selected' : ''} ${!matches.has(n.id) ? 'is-context' : ''}`} aria-pressed={selected === n.id} data-history-node={n.id} title={`${n.title}${c ? ' · ' + c.kinds.join('、') : ''}`} onClick={() => onSelect(n.id)} style={{ top: p.y, left: p.x, width: mode === 'graph' ? p.width : `calc(100% - ${p.x}px)`, height: p.height, fontSize: mode === 'graph' ? 12 * zoom : 12 }}>
                <span className="wh-node-title">{n.title || '未命名节点'}</span><span className="wh-node-meta">{c ? <b>{!c.before ? '+ ' : ghost ? '− ' : 'Δ '}{c.kinds.join(' · ')}</b> : null}{n.status ? <span>{n.status}</span> : null}{n.availability !== 'available' ? <span>正文未知</span> : null}</span>
              </button>;
          })}
          {!nodes.length ? <div className="wh-empty">{query || changedOnly ? '没有匹配的节点' : '尚无结构节点'}</div> : null}
        </div>
      </div>
    </section>;
}
class CanvasBoundary extends React.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidUpdate(previous) { if (previous.resetKey !== this.props.resetKey && this.state.failed)
        this.setState({ failed: false }); }
    render() { return this.state.failed ? <div className="wh-alert">结构画布暂不可显示。<button onClick={this.props.onOutline}>使用目录浏览</button></div> : this.props.children; }
}
const savedBody = n => !n ? '此时点未记录该节点' : n.availability === 'available' ? n.body : '此时点的正文未知';
function Fields({ change, before, after }) {
    if (!change?.before || !change.after)
        return null;
    const reference = (id, snapshot) => snapshot.nodes.find(n => n.id === id)?.title ?? id;
    const value = (node, key, snapshot) => {
        if (key === 'parentId')
            return node.parentId ? reference(node.parentId, snapshot) : '根级';
        if (key === 'dependencies')
            return node.dependencies.map(id => reference(id, snapshot)).join('、') || '未声明';
        if (key === 'sources')
            return node.sources.map(s => `${s.kind} · ${s.kind === 'logseq' ? reference(node.id, snapshot) : s.ref} · ${s.version?.slice(0, 12) ?? '未存版本'}`).join('；') || '未附来源';
        if (key === 'order')
            return `第 ${node.order + 1} 位`;
        if (key === 'depth')
            return `第 ${depth(node, new Map(snapshot.nodes.map(n => [n.id, n]))) + 1} 层`;
        if (key === 'availability')
            return node.availability === 'available' ? '可用' : '当时不可用';
        return node[key] ?? '未声明';
    };
    const fields = [['title', '改名'], ['parentId', '归属'], ['order', '顺序'], ['status', '声明状态'], ['dependencies', '依赖'], ['sources', '来源'], ['availability', '可用性'], ['depth', '深度']].filter(([, label]) => change.kinds.includes(label));
    return fields.length ? <table className="wh-fields"><thead><tr><th>变化</th><th>比较前</th><th>比较后</th></tr></thead><tbody>{fields.map(([key, label]) => <tr key={key}><th>{label}</th><td>{value(change.before, key, before)}</td><td>{value(change.after, key, after)}</td></tr>)}</tbody></table> : null;
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
