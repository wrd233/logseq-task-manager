/* global document, AbortController, ResizeObserver, requestAnimationFrame */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compare, origins, quote, outline } from './model.mjs';
import { historyStyles } from './styles.mjs';
const tabId = '@task-copilot/work-history';
const trackName = t => !t || t === 'work-structure' ? '工作结构' : t === 'git-changes' ? 'Git 实际变更' : 'Logseq 来源结构';
const time = r => new Date(r.occurredAt ?? r.recordedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const issue = e => ({ HISTORY_PROJECT_REQUIRED: '此会话还没有工作目录。选择 DSH 工作目录后，历史会自动归属到这里。', HISTORY_RECORD_CORRUPT: '这条历史记录已损坏，无法可靠展示。其他记录仍可浏览。', HISTORY_DIFFERENT_TRACKS: '请选择同一种结构的两个时点进行比较。', ENOENT: '当前来源已删除或不可用；保存的历史仍保留。', BINDING_CHANGED: '会话工作范围已改变，请重新读取。', HISTORY_LOGSEQ_CONNECTION_CHANGED: '此来源属于另一个 Logseq 工作连接。' }[e?.code] ?? e?.message ?? '暂时无法读取历史。');
const depth = (node, map) => { let d = 0; for (let p = node.parentId; p && map.has(p); p = map.get(p).parentId)
    d++; return d; };
/** A virtual canvas and directory share the same node selection and stable identity slots. */
function Structure({ after, before, changes, selected, onSelect, query, mode, zoom, slots }) {
    const viewport = useRef(null), [scroll, setScroll] = useState(0), [height, setHeight] = useState(500);
    const nodes = useMemo(() => { const map = new Map(after.nodes.map(n => [n.id, n])); for (const c of changes)
        if (!c.after)
            map.set(c.id, c.before); return [...map.values()]; }, [after, changes]);
    const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]), afterMap = useMemo(() => new Map(after.nodes.map(n => [n.id, n])), [after]), beforeMap = useMemo(() => new Map((before?.nodes ?? []).map(n => [n.id, n])), [before]), level = n => depth(n, afterMap.has(n.id) ? afterMap : beforeMap), changed = useMemo(() => new Map(changes.map(c => [c.id, c])), [changes]);
    const shown = useMemo(() => (mode === 'outline' ? [...outline(after.nodes), ...outline(before?.nodes ?? []).filter(n => !afterMap.has(n.id))] : [...nodes].sort((a, b) => slots.get(a.id) - slots.get(b.id))).filter(n => !query || `${n.title}\n${n.body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [nodes, after, before, afterMap, query, slots, mode]);
    const rowHeight = mode === 'graph' ? 86 * zoom : 54, rows = shown.map((n, i) => ({ n, slot: query || mode !== 'graph' ? i : slots.get(n.id) })), maxSlot = Math.max(0, ...rows.map(r => r.slot));
    const start = Math.max(0, Math.floor(scroll / rowHeight) - 4), end = Math.ceil((scroll + height) / rowHeight) + 4, visible = rows.filter(r => r.slot >= start && r.slot <= end);
    useEffect(() => { const el = viewport.current, observer = new ResizeObserver(() => setHeight(el.clientHeight)); observer.observe(el); return () => observer.disconnect(); }, []);
    useEffect(() => { setScroll(viewport.current.scrollTop); }, [mode, zoom]);
    const locate = () => { const slot = rows.find(r => r.n.id === selected)?.slot; if (slot !== undefined)
        viewport.current.scrollTo({ top: Math.max(0, slot * rowHeight - height / 3), behavior: 'auto' }); };
    const width = mode === 'graph' ? Math.max(580, ...visible.map(({ n }) => Math.min(level(n), 12) * 240 * zoom + 230 * zoom)) : undefined;
    const x = n => Math.min(level(n), 12) * 240 * zoom;
    return <section className="wh-structure"><div className="wh-canvas-caption"><span>{shown.length} 个节点{query ? ' · 搜索结果' : ''} · {mode === 'graph' ? '实线归属 / 虚线依赖' : '目录'}</span><button onClick={locate} disabled={!selected}>定位选中项</button></div>
    <div className={`wh-viewport wh-${mode}`} ref={viewport} onScroll={e => setScroll(e.currentTarget.scrollTop)} role="region" aria-label={mode === 'graph' ? '历史结构图' : '历史目录'}>
      <div style={{ position: 'relative', height: (maxSlot + 1) * rowHeight, width: width ?? '100%' }}>
        {mode === 'graph' ? <svg className="wh-edges" width={width} height={height + 8 * rowHeight} style={{ top: start * rowHeight }} aria-hidden="true">
          {visible.flatMap(({ n, slot }) => [{ id: n.parentId, dependency: false }, ...n.dependencies.map(id => ({ id, dependency: true }))].filter(e => e.id).map(({ id, dependency }, i) => { const target = byId.get(id), targetRow = rows.find(r => r.n.id === id); if (!target || !targetRow)
            return null; const a = (slot - start) * rowHeight + 32 * zoom, b = Math.max(0, Math.min(height + 8 * rowHeight, (targetRow.slot - start) * rowHeight + 32 * zoom)); return <path key={`${n.id}:${i}:${id}`} d={`M${x(n)} ${a} C${x(n) - 24 * zoom} ${a}, ${x(target) + 230 * zoom} ${b}, ${x(target) + 210 * zoom} ${b}`} fill="none" stroke="currentColor" strokeDasharray={dependency ? '5 4' : undefined}/>; }))}
        </svg> : null}
        {visible.map(({ n, slot }) => {
            const c = changed.get(n.id), ghost = c && !c.after;
            return <button key={n.id} className={`wh-node ${c ? 'is-changed' : ''} ${ghost ? 'is-ghost' : ''} ${selected === n.id ? 'is-selected' : ''}`} aria-pressed={selected === n.id} data-history-node={n.id} onClick={() => onSelect(n.id)} style={{ top: slot * rowHeight, left: mode === 'graph' ? x(n) : Math.min(level(n), 12) * 12, width: mode === 'graph' ? 220 * zoom : `calc(100% - ${Math.min(level(n), 12) * 12}px)`, height: rowHeight - 8, fontSize: mode === 'graph' ? 12 * zoom : 12 }}>
          <span className="wh-node-title">{n.title || '未命名节点'}</span><span className="wh-node-meta">{c?.kinds.join(' · ') || n.status || '已保存'}{level(n) > 12 ? ` · 层级 ${level(n)}` : ''}</span>
        </button>;
        })}
      </div>
      {!shown.length ? <div className="wh-empty">{query ? '没有匹配的节点。' : '此时点没有保存结构节点。查看下方变更证据，或请 Agent 整理工作结构。'}</div> : null}
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
        const info = props.useTabInfo(), sessionId = props.sessionId, root = useRef(null), detail = useRef(null), cache = useRef(new Map()), slots = useRef(new Map()), request = useRef(null), sourceRequest = useRef(null);
        const [catalog, setCatalog] = useState(null), [track, setTrack] = useState('default'), [selectedId, setSelectedId] = useState(null), [baselineId, setBaselineId] = useState(''), [frame, setFrame] = useState(null), [baseline, setBaseline] = useState(null), [selectedNode, setSelectedNode] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(false), [notice, setNotice] = useState(''), [query, setQuery] = useState(''), [mode, setMode] = useState(null), [zoom, setZoom] = useState(1), [width, setWidth] = useState(400), [source, setSource] = useState(null);
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
                    slots.current.clear();
                    const current = result.records.find(r => r.id === result.preferredId) ?? result.records[0];
                    setSelectedId(current?.id ?? null);
                    setBaselineId(result.records.find(r => r.sequence < current?.sequence && r.origin !== 'reconstructed')?.id ?? '');
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
        useEffect(() => { cache.current.clear(); slots.current.clear(); setCatalog(null); setFrame(null); setBaseline(null); setSelectedId(null); setBaselineId(''); setSelectedNode(null); }, [sessionId]);
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
                for (const n of value.nodes)
                    if (!slots.current.has(n.id))
                        slots.current.set(n.id, slots.current.size);
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
        const effectiveMode = mode ?? (width >= 720 ? 'graph' : 'outline');
        const selectNode = id => {
            setSelectedNode(id);
            setSource(null);
            sourceRequest.current?.abort();
            if (width < 720)
                requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'nearest' }));
        };
        const choose = id => { if (id === baselineId)
            setBaselineId(''); setSelectedId(id); setSource(null); sourceRequest.current?.abort(); };
        const insert = (kind = 'snapshot') => {
            if (loading || kind !== 'organize' && (!frame || frame.id !== selectedId || baselineId && baseline?.id !== baselineId))
                return;
            if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) {
                setNotice('会话已切换，未修改草稿。');
                return;
            }
            const text = kind === 'organize' ? '\n请根据当前项目实际情况整理工作结构，使用 work_history_snapshot 保存有意义的结构快照，保留稳定节点身份与来源。不要修改正式任务状态。\n' : quote({ snapshot: kind === 'node' || kind === 'source' ? nodeFrame : frame, ...(kind === 'node' ? { node } : {}), ...(kind === 'source' ? { node, source } : {}), ...(kind === 'diff' ? { baseline, changes } : {}) });
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
        return <section ref={root} className={`wh-workbench ${width < 720 ? 'is-compact' : ''}`} aria-label="工作结构历史工作台" aria-busy={loading}>
      <header className="wh-heading"><div><small>工作历史 · {catalog?.project?.split('/').at(-1) ?? '当前工作'}</small><h2>{trackName(catalog?.track)}</h2></div><div><button onClick={() => void refresh.current()} disabled={loading} aria-label="刷新并记录检查点">↻</button><button onClick={fullScreen} aria-label="切换历史画布全屏">{info.sidebar.fullscreen ? '收起画布' : '展开画布'}</button></div></header>
      {catalog ? <div className="wh-track"><select aria-label="历史投影" value={catalog.track ?? track} onChange={e => setTrack(e.target.value)}>{catalog.tracks.map(t => <option key={t} value={t}>{trackName(t)}</option>)}</select><span>只读探索 · 不改变项目文件或正式状态</span></div> : null}
      {error ? <p className="wh-alert" role="alert">{issue(error)}{catalog ? ' · 已载入记录仍保留。' : ''}</p> : null}
      {notice ? <p className="wh-notice" role="status">{notice}</p> : null}
      {catalog?.issues.length ? <details className="wh-problems"><summary>来源情况 · {catalog.issues.length} 项</summary>{catalog.issues.map((p, i) => <p key={i}>{p}</p>)}</details> : null}
      <div className="wh-work-area">
        <aside className="wh-timeline" aria-label="历史时间线"><div className="wh-rail-title"><strong>已保存时点</strong><span>{records.length}{catalog?.more ? '+' : ''}</span></div>
          {!records.length && !loading ? <p className="wh-empty">还没有保存的历史。工作目录的 Git 和已有 Logseq 修订会在工作检查点自动记录。</p> : null}
          {[...records].reverse().map(r => <button key={r.id} className={selectedId === r.id ? 'is-current' : ''} onClick={() => choose(r.id)} aria-pressed={selectedId === r.id}><small>记录 {r.sequence} · {time(r)} <span className={`wh-origin ${r.origin}`}>{origins[r.origin]}</span></small><strong>{r.title}</strong><span>{r.nodeCount} 节点{r.explanations?.length ? ' · 有 Agent 解释' : ''}</span></button>)}
          {catalog?.more ? <button className="wh-load-more" disabled={loading} onClick={() => void fetchList({ more: true })}>加载更早记录</button> : null}
        </aside>
        <main className="wh-main">
          <div className="wh-time-controls"><button aria-label="上一个历史时点" disabled={index <= 0 || loading} onClick={() => choose(records[index - 1].id)}>‹</button><input type="range" min="0" max={Math.max(0, records.length - 1)} value={Math.max(0, index)} aria-label="历史时点" disabled={!records.length} onChange={e => choose(records[Number(e.target.value)].id)}/><button aria-label="下一个历史时点" disabled={index < 0 || index >= records.length - 1 || loading} onClick={() => choose(records[index + 1].id)}>›</button>
            <select aria-label="比较基准时点" value={baselineId} onChange={e => setBaselineId(e.target.value)}><option value="">不比较 · 浏览此时点</option>{records.filter(r => r.id !== selectedId).map(r => <option key={r.id} value={r.id}>对比记录 {r.sequence} · {time(r)} · {r.title}</option>)}</select>
          </div>
          {frame ? <><div className="wh-frame-title"><div><span className={`wh-origin ${frame.origin}`}>{origins[frame.origin]}</span><h3>{frame.title}</h3><p>{frame.summary}</p></div><button onClick={() => insert()} disabled={loading}>带入草稿 ↗</button></div>
            {catalog.records.find(r => r.id === frame.id)?.explanations?.map((e, i) => <details key={i} className="wh-explanation"><summary>Agent 解释 · {new Date(e.recordedAt).toLocaleString()}</summary><p>{e.text}</p></details>)}
            {baseline ? <div className="wh-diff-summary"><strong>{changes.length ? `${changes.length} 个节点有变化` : '两个快照没有结构差异'}</strong><span>记录 {baseline.sequence} → 记录 {frame.sequence} · {baseline.title} → {frame.title}</span><button onClick={() => insert('diff')} disabled={loading}>引用比较</button></div> : null}
            <div className="wh-canvas-tools"><label><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索节点与正文" aria-label="搜索历史节点"/></label><div><button aria-pressed={effectiveMode === 'graph'} onClick={() => setMode('graph')}>结构图</button><button aria-pressed={effectiveMode === 'outline'} onClick={() => setMode('outline')}>目录</button>{effectiveMode === 'graph' ? <><button aria-label="缩小历史图" onClick={() => setZoom(Math.max(.55, zoom - .15))}>−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="放大历史图" onClick={() => setZoom(Math.min(1.6, zoom + .15))}>＋</button></> : null}</div></div>
            <CanvasBoundary resetKey={`${frame.id}:${effectiveMode}`} onOutline={() => setMode('outline')}><Structure after={frame} before={baseline} changes={changes} selected={selectedNode} onSelect={selectNode} query={query} mode={effectiveMode} zoom={zoom} slots={slots.current}/></CanvasBoundary>
            {frame.facts?.patch || frame.facts?.since ? <details className="wh-evidence"><summary>Git 原始证据{frame.facts.truncated ? ' · 部分内容未保存' : ''}</summary><p>{frame.facts.contentRetention}</p><pre>{frame.facts.since || frame.facts.patch}</pre></details> : null}
            <details className="wh-provenance"><summary>时间、来源与覆盖范围</summary><p>记录时间：{frame.recordedAt}</p>{frame.facts?.head ? <p>Git 提交：{frame.facts.head.slice(0, 12)} · {frame.facts.commit.split('\n').slice(2).join(' ')}</p> : null}{frame.facts?.revisionId ? <p>来源：Logseq 阶段修订 <code>{frame.facts.revisionId}</code></p> : null}<p>事件时间：{frame.occurredAt ?? '未指定 / 无法由观察确定'}</p>{frame.sourceRecordedAt ? <p>来源原记录时间：{frame.sourceRecordedAt}</p> : null}{frame.reconstructedAt ? <p>重建时间：{frame.reconstructedAt}；依据：{frame.facts.reconstructedFrom.join('、')}</p> : null}<p>{frame.coverage === 'partial' ? '只记录部分范围，未出现不等于删除。' : '此快照按其来源保存完整结构；不代表整个项目的正式对象树。'}</p><p>结构快照与来源声明不自动成为 Kernel 正式事实。缺失的中间状态没有补造。</p><code>{frame.id}</code></details>
          </> : <div className="wh-empty">{loading ? '正在读取真实历史…' : '此投影还没有可展示的快照。'}</div>}
          {catalog?.activity?.length ? <details className="wh-activity"><summary>最近工具观察</summary>{catalog.activity.map(r => <button key={r.id} onClick={() => setTrack(r.track)}><span>{r.title}</span><small>{time(r)} · {trackName(r.track)}</small></button>)}</details> : null}
          {catalog && (!frame || frame.track !== 'work-structure') ? <button className="wh-organize" onClick={() => insert('organize')}>让 Agent 整理工作结构 · 写入草稿</button> : null}
        </main>
        <aside ref={detail} className="wh-detail" aria-label="历史节点详情">{node ? <>
          <div className="wh-detail-title"><h3>{node.title}</h3><button onClick={() => insert('node')} disabled={loading}>引用节点 ↗</button></div>
          {change ? <p className="wh-change-label">{change.kinds.join(' · ')}{!change.after ? ' · 以下为上一时点保存的内容' : ''}</p> : null}
          <details className="wh-node-id"><summary>节点身份与定位</summary><code>{node.id}</code></details><p>声明状态：{node.status ?? '未记录'} · {node.availability === 'available' ? '原文可用' : '原文未保存 / 不可用'}</p>
          {node.parentId ? <button className="wh-relation" disabled={!nodeFrame.nodes.some(n => n.id === node.parentId)} onClick={() => selectNode(node.parentId)}>上级：{nodeFrame.nodes.find(n => n.id === node.parentId)?.title ?? node.parentId}</button> : null}
          {node.dependencies.length ? <div className="wh-relations"><small>声明依赖</small>{node.dependencies.map(id => <button key={id} disabled={!nodeFrame.nodes.some(n => n.id === id)} onClick={() => selectNode(id)}>{nodeFrame.nodes.find(n => n.id === id)?.title ?? `${id}（此快照未包含）`}</button>)}</div> : null}
          <Fields change={change} before={baseline} after={frame}/>{baseline && change ? <div className="wh-text-diff"><div><h4>比较前</h4><pre>{savedBody(change.before)}</pre></div><div><h4>比较后</h4><pre>{change.inline ? <>{change.inline.prefix}<mark>{change.inline.inserted}</mark>{change.inline.suffix}</> : savedBody(change.after)}</pre></div></div> : <pre className="wh-body">{node.availability === 'available' ? node.body : '该时点的正文未知，不用今天的内容补填。'}</pre>}
          <h4>来源</h4>{node.sources.length ? node.sources.map((s, i) => <button key={i} className="wh-source" disabled={loading} onClick={() => void readSource(i)}><strong>{s.kind === 'logseq' ? 'Logseq 原文' : s.kind === 'file' ? '工作文件' : 'Git 证据'}</strong><span>{s.kind === 'logseq' ? node.title : s.ref}</span><small>{s.version ? `历史版本 ${s.version.slice(0, 12)} · ` : ''}核对今天的来源 ↗</small></button>) : <p className="wh-muted">此节点未附来源定位；内容为记录者声明。</p>}
          {source ? <section className="wh-current-source">{source.loading ? <p>正在核对今天的来源…</p> : source.error ? <p role="alert">{source.error}</p> : <><p>{source.notice}</p><button disabled={loading} onClick={() => insert('source')}>引用来源与核对结果 ↗</button><pre>{source.current?.content ?? source.source?.excerpt ?? '未保存正文'}</pre>{source.current?.truncated ? <small>当前来源预览已节选。</small> : null}</>}</section> : null}

        </> : <div className="wh-empty"><span>↖</span><h3>从一个节点开始</h3><p>查看保存的正文、结构关系、差异及来源。历史内容与今天的来源分开呈现。</p></div>}</aside>
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
