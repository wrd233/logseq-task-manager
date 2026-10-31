/* global document, AbortController, ResizeObserver, requestAnimationFrame, setTimeout, clearTimeout */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compare, quote, historyChain, lineage } from './model.mjs';
import { Structure, Fields } from '../structure-view/view.jsx';
import { historyStyles } from './styles.mjs';
const tabId = '@task-copilot/work-history';
const trackName = t => !t || t === 'work-structure' ? '工作结构' : t === 'git-changes' ? 'Git 实际变更' : 'Logseq 来源结构';
const time = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '时间未知'; };
const pointTime = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '时间未知'; };
const fullTime = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '时间未知'; };
const issue = e => ({
    HISTORY_PROJECT_REQUIRED: '此会话还没有工作目录。选择 DSH 工作目录后，历史会自动归属到这里。',
    HISTORY_RECORD_CORRUPT: '这条历史记录已损坏，无法可靠展示。其他记录仍可浏览。',
    HISTORY_RECORD_MISSING: '没有找到这条历史记录；它可能已被移走。',
    HISTORY_DIFFERENT_TRACKS: '这两个时点来自不同的历史线，不能放在一起比较。',
    HISTORY_SNAPSHOTS_REQUIRED: '只有结构快照可以比较。',
    HISTORY_PARENT_CHANGED: '历史链在读取时发生了变化，请刷新后重试。',
    HISTORY_SOURCE_MISSING: '这个节点没有保存可核对的来源。',
    HISTORY_SOURCE_INVALID: '保存的来源身份无法核验，因此不读取也不跳转。历史正文仍来自保存的快照。',
    ENOENT: '当前来源已删除或不可用；保存的历史正文仍保留。',
    EACCES: '当前来源没有读取权限；保存的历史正文仍保留。',
    SOURCE_OUTSIDE_SCOPE: '当前来源已移出已授权范围；不会扩大读取范围。',
    BINDING_CHANGED: '会话工作范围已改变，请重新读取。',
    HISTORY_LOGSEQ_CONNECTION_CHANGED: '这个节点的 Logseq 来源没有可核验的工作范围，或属于另一个工作连接；当前会话不会读取或跳转。历史正文仍来自保存的快照。',
    WORKSPACE_OFFLINE: '工作连接当前不可用；历史快照仍可浏览，但不能核对今天的来源。',
    DESCRIPTOR_STALE: '工作连接已更新，请重试。',
    CONNECTION_STALE: '工作连接已变化，请重试。',
    REQUEST_ABORTED: '读取已取消，请重试。',
}[e?.code] ?? e?.message ?? '暂时无法读取历史。');
const savedBody = n => !n ? '此时点未记录该节点。' : n.availability !== 'available' ? '此时点未记录正文。历史面板不会用今天的内容补写。' : n.body?.trim() ? n.body : '（保存的历史正文为空。）';
const kindLabel = k => ({ '新增': '新增', '首次观察': '首次观察', '删除': '删除', '未再观察': '未再观察', '改名': '改名', '正文': '正文修改', '归属': '移动', '顺序': '顺序', '深度': '层级', '声明状态': '状态', '依赖': '依赖', '来源': '来源', '可用性': '可用性' }[k] ?? k);
const recordKind = r => r?.facts?.revisionId ? (r.facts.parentRevision === null ? '阶段起点' : '阶段修订') : r?.origin === 'reconstructed' ? '历史重建' : r?.origin === 'agent' ? 'Agent 整理' : r?.origin === 'observed' ? '工具观察' : '历史记录';
const shortVersion = value => value ? String(value).slice(0, 10) : '未保存';
const sourceName = source => {
    if (source.kind !== 'logseq') return source.ref;
    try { const [, graphId, blockUuid] = JSON.parse(source.ref); return `块 ${String(blockUuid).slice(0, 8)} · ${String(graphId).split(':')[0]}`; }
    catch { return source.ref; }
};
const pathOf = (node, nodes) => lineage(node, nodes).map(n => n.title || '未命名节点').join(' / ');
const markOf = change => {
    if (!change) return null;
    if (!change.before) return { kind: 'add', label: '新增' };
    if (!change.after) return { kind: 'del', label: change.kinds.includes('未再观察') ? '未再观察' : '删除' };
    if (change.kinds.includes('归属')) return { kind: 'move', label: '移动' };
    if (change.kinds.includes('深度')) return { kind: 'move', label: '层级' };
    if (change.kinds.includes('改名')) return { kind: 'mod', label: '改名' };
    if (change.kinds.includes('正文')) return { kind: 'mod', label: '正文' };
    return { kind: 'mod', label: '变化' };
};
const marksOf = change => {
    if (!change) return [];
    if (!change.before) return [{ kind: 'add', label: '新增' }];
    if (!change.after) return [];
    const marks = [];
    if (change.kinds.includes('归属')) marks.push({ kind: 'move', label: '移动' });
    else if (change.kinds.includes('深度')) marks.push({ kind: 'move', label: '层级' });
    if (change.kinds.includes('改名')) marks.push({ kind: 'mod', label: '改名' });
    else if (change.kinds.includes('正文')) marks.push({ kind: 'mod', label: '正文' });
    if (!marks.length) marks.push({ kind: 'mod', label: '变化' });
    return marks;
};
const describeChange = (change, before, after) => {
    if (!change) return [];
    const lines = [];
    if (!change.before) lines.push(`新位置：${pathOf(change.after, after.nodes)}`);
    else if (!change.after) { lines.push(`原位置：${pathOf(change.before, before.nodes)}`); lines.push('删除前的历史正文仍可查看'); }
    else {
        if (change.kinds.includes('归属')) lines.push(`旧位置：${pathOf(change.before, before.nodes)}`, `新位置：${pathOf(change.after, after.nodes)}`);
        else if (change.kinds.includes('深度')) lines.push(`层级变化：${pathOf(change.before, before.nodes)} → ${pathOf(change.after, after.nodes)}`);
        if (change.kinds.includes('改名')) lines.push(`旧标题「${change.before.title}」→「${change.after.title}」`);
        if (change.kinds.includes('正文')) lines.push(`正文 ${(change.before.body ?? '').length} 字 → ${(change.after.body ?? '').length} 字`);
        if (change.kinds.includes('声明状态')) lines.push(`声明状态 ${change.before.status ?? '未声明'} → ${change.after.status ?? '未声明'}`);
        if (change.kinds.includes('依赖')) lines.push(`依赖 ${change.before.dependencies.length} 项 → ${change.after.dependencies.length} 项`);
        if (change.kinds.includes('来源')) lines.push(`来源 ${change.before.sources.length} 项 → ${change.after.sources.length} 项`);
        if (!lines.length) lines.push(`变化：${change.kinds.map(kindLabel).join('、')}`);
    }
    return lines.slice(0, 3);
};
class CanvasBoundary extends React.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidUpdate(previous) { if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
    render() { return this.state.failed ? <div className="wh-alert">结构图暂不可显示。<button onClick={this.props.onTree}>改用结构树</button></div> : this.props.children; }
}
function Skeleton() {
    return <div className="sh-skeleton" aria-hidden="true"><span /><span /><span /><span /><span /></div>;
}
/** The tree is the primary view: real parent/child hierarchy, disclosure, stable IDs and factual marks. */
function TreeView({ frame, changes, selectedId, onSelect, onToggle, collapsed, query }) {
    const changeById = useMemo(() => new Map(changes.map(c => [c.id, c])), [changes]);
    const { rows, matches } = useMemo(() => {
        const nodes = frame?.nodes ?? [];
        const byId = new Map(nodes.map(n => [n.id, n])), children = new Map();
        for (const node of nodes) {
            const parent = byId.has(node.parentId) ? node.parentId : null;
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(node);
        }
        for (const group of children.values()) group.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'));
        const term = query.trim().toLocaleLowerCase();
        let matchSet = null, include = null;
        if (term) {
            matchSet = new Set(); include = new Set();
            for (const node of nodes) if (`${node.title}\n${node.body}`.toLocaleLowerCase().includes(term)) {
                matchSet.add(node.id);
                let current = node;
                while (current && !include.has(current.id)) { include.add(current.id); current = byId.get(current.parentId); }
            }
        }
        const result = [];
        const visit = (parent, depth) => {
            for (const node of children.get(parent) ?? []) {
                if (include && !include.has(node.id)) continue;
                const kids = (children.get(node.id) ?? []).filter(kid => !include || include.has(kid.id));
                const open = term ? true : !collapsed.has(node.id);
                result.push({ node, depth, hasChildren: kids.length > 0, open });
                if (open && kids.length) visit(node.id, depth + 1);
            }
        };
        visit(null, 0);
        return { rows: result, matches: matchSet };
    }, [frame, query, collapsed]);
    if (!frame) return null;
    return <div className="sh-tree" role="tree" aria-label="历史结构树">
      {rows.length ? rows.map(({ node, depth, hasChildren, open }) => {
        const change = changeById.get(node.id), marks = marksOf(change).slice(0, 2), selected = selectedId === node.id, context = matches ? !matches.has(node.id) : false;
        return <div key={node.id} role="treeitem" aria-level={depth + 1} aria-selected={selected} aria-expanded={hasChildren ? open : undefined} className={`sh-tree-item ${selected ? 'is-selected' : ''} ${context ? 'is-context' : ''}`}>
            <div className="sh-node-row" style={{ paddingLeft: 6 + Math.min(depth, 12) * 16 }}>
              {hasChildren ? <button type="button" className="sh-disclosure" aria-label={open ? '收起子节点' : '展开子节点'} aria-expanded={open} onClick={() => onToggle(node.id)}>{open ? '▾' : '▸'}</button> : <span className="sh-disclosure" aria-hidden="true" />}
              <button type="button" className="sh-node-main" data-node-id={node.id} onClick={() => onSelect(node.id)} title={node.title || '未命名节点'}>
                <span className="sh-node-title">{node.title || '未命名节点'}</span>
                <span className="sh-node-marks">{marks.map(mark => <span key={mark.label} className={`sh-mark ${mark.kind}`}>{mark.label}</span>)}</span>
                <span className="sh-node-side">
                  {node.status ? <span className="sh-status">{node.status}</span> : null}
                  {node.availability !== 'available' ? <span className="sh-unknown">正文未知</span> : null}
                </span>
              </button>
            </div>
          </div>;
    }) : <div className="sh-empty">{query ? '没有匹配的节点' : '这个快照没有结构节点'}</div>}
    </div>;
}
export function applyHistoryClient(ctx) {
    const style = document.createElement('style');
    style.textContent = historyStyles;
    document.head.append(style);
    const refreshers = new Set();
    const rpc = async (method, payload, signal) => { const answer = await ctx.connection.rpc.call('/api', `logseq-workbench/history-${method}`, payload, signal); if (!answer.ok) throw Object.assign(Error(answer.error.message), { code: answer.error.code }); return answer.value; };
    function Header() { return <button type="button" className="wh-entry" aria-label="打开工作历史" onClick={() => ctx.sidebarRight.openTab('work-history')}>◴ 工作历史</button>; }
    function Panel(props) {
        const info = props.useTabInfo(), sessionId = props.sessionId, root = useRef(null), rail = useRef(null), detail = useRef(null), cache = useRef(new Map()), listRequest = useRef(null), frameRequest = useRef(null), sourceRequest = useRef(null), catalogRef = useRef(null);
        const [catalog, setCatalog] = useState(null), [track, setTrack] = useState('default'), [selectedId, setSelectedId] = useState(null), [frame, setFrame] = useState(null), [parentFrame, setParentFrame] = useState(null);
        const [loadingList, setLoadingList] = useState(true), [loadingFrame, setLoadingFrame] = useState(false), [error, setError] = useState(null), [frameError, setFrameError] = useState(null), [parentError, setParentError] = useState(null);
        const [notice, setNotice] = useState(''), [reload, setReload] = useState(0), [query, setQuery] = useState(''), [mode, setMode] = useState('tree'), [zoom, setZoom] = useState(1), [collapsed, setCollapsed] = useState(() => new Set());
        const [selectedNodeId, setSelectedNodeId] = useState(null), [changesOpen, setChangesOpen] = useState(false), [sourceState, setSourceState] = useState(null), [width, setWidth] = useState(400);
        catalogRef.current = catalog;
        const loadList = useCallback(async ({ more = false } = {}) => {
            listRequest.current?.abort();
            const controller = new AbortController();
            listRequest.current = controller;
            setLoadingList(true);
            try {
                const before = more ? catalogRef.current?.next : undefined;
                const result = await rpc('list', { sessionId, track, ...(before ? { before } : {}) }, controller.signal);
                if (controller.signal.aborted) return;
                setCatalog(previous => {
                    const same = more && previous && previous.project === result.project && previous.track === result.track;
                    const records = same ? [...previous.records, ...result.records] : result.records;
                    return { ...result, records: [...new Map(records.map(r => [r.id, r])).values()] };
                });
                setError(null);
            }
            catch (e) { if (!controller.signal.aborted) setError(e); }
            finally { if (listRequest.current === controller) setLoadingList(false); }
        }, [sessionId, track]);
        const refresh = useCallback(() => { cache.current.clear(); setReload(value => value + 1); }, []);
        useEffect(() => { if (!info.tab.visible) return; void loadList(); return () => { listRequest.current?.abort(); }; }, [sessionId, track, reload, info.tab.visible, loadList]);
        useEffect(() => { cache.current.clear(); setCatalog(null); setFrame(null); setParentFrame(null); setSelectedId(null); setSelectedNodeId(null); setQuery(''); setSourceState(null); setChangesOpen(false); setCollapsed(new Set()); setError(null); setFrameError(null); setParentError(null); }, [sessionId, track]);
        useEffect(() => { const run = () => refresh(); refreshers.add(run); return () => { refreshers.delete(run); }; }, [refresh]);
        useEffect(() => info.tab.actions.bindCommands({ refresh: () => refresh() }), [info.tab.actions, refresh]);
        useEffect(() => { const element = root.current, observer = new ResizeObserver(() => setWidth(element.clientWidth)); observer.observe(element); setWidth(element.clientWidth); return () => observer.disconnect(); }, []);
        useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
        const chain = useMemo(() => historyChain(catalog?.records ?? []), [catalog]);
        const ordered = chain.records, index = ordered.findIndex(r => r.id === selectedId), selectedRecord = ordered[index] ?? null, latestRecord = ordered.at(-1) ?? null;
        const isLatest = Boolean(selectedRecord && latestRecord && selectedRecord.id === latestRecord.id);
        const previousRecord = index > 0 ? ordered[index - 1] : null, nextRecord = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
        useEffect(() => {
            if (!catalog) return;
            if (!ordered.length) { setSelectedId(null); return; }
            setSelectedId(previous => previous && ordered.some(r => r.id === previous) ? previous : (catalog.preferredId && ordered.some(r => r.id === catalog.preferredId) ? catalog.preferredId : ordered.at(-1).id));
        }, [catalog, ordered]);
        useEffect(() => {
            if (!selectedId || !info.tab.visible) return;
            const controller = new AbortController();
            frameRequest.current?.abort(); frameRequest.current = controller;
            setLoadingFrame(true); setFrameError(null); setParentError(null); setSourceState(null); setSelectedNodeId(null); setNotice('');
            setFrame(null); setParentFrame(null);
            const read = async id => {
                if (cache.current.has(id)) return cache.current.get(id);
                const value = await rpc('read', { sessionId, id }, controller.signal);
                if (!controller.signal.aborted) {
                    cache.current.set(id, value);
                    if (cache.current.size > 12) { const discard = [...cache.current.keys()].find(key => key !== selectedId); if (discard) cache.current.delete(discard); }
                }
                return value;
            };
            void read(selectedId).then(record => {
                if (controller.signal.aborted) return null;
                setFrame(record);
                // Compare against the same causal parent used by the timeline, not an
                // arbitrary append neighbour. A missing parent stays unavailable.
                const parentId = previousRecord?.id ?? null;
                if (!parentId) return null;
                return read(parentId).then(parent => { if (!controller.signal.aborted) setParentFrame(parent); }).catch(parentFailure => { if (!controller.signal.aborted) setParentError(parentFailure); });
            }).catch(failure => { if (!controller.signal.aborted) { setFrameError(failure); setFrame(null); } }).finally(() => { if (!controller.signal.aborted) setLoadingFrame(false); });
            return () => controller.abort();
        }, [selectedId, sessionId, info.tab.visible, reload, previousRecord?.id]);
        useEffect(() => {
            if (!frame) return;
            if (frame.nodes.length > 160) {
                const byId = new Map(frame.nodes.map(n => [n.id, n])), next = new Set();
                for (const node of frame.nodes) { let depth = 0; for (let p = node.parentId; p && byId.has(p); p = byId.get(p).parentId) depth++; if (depth >= 1) next.add(node.id); }
                setCollapsed(next);
            }
            else setCollapsed(new Set());
        }, [frame?.id]);
        useEffect(() => { if (!selectedId) return; const point = [...(rail.current?.querySelectorAll('[data-point-id]') ?? [])].find(el => el.dataset.pointId === selectedId); point?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }, [selectedId, ordered.length]);
        useEffect(() => { if (selectedNodeId && width < 900) requestAnimationFrame(() => detail.current?.querySelector('[data-detail-close]')?.focus()); }, [selectedNodeId, width]);
        useEffect(() => () => { listRequest.current?.abort(); frameRequest.current?.abort(); sourceRequest.current?.abort(); }, []);
        const comparison = useMemo(() => {
            if (!frame || !parentFrame) return { changes: [] };
            if (frame.track !== parentFrame.track) return { changes: [], error: Error('HISTORY_DIFFERENT_TRACKS') };
            try { return { changes: compare(parentFrame, frame) }; }
            catch (error) { return { changes: [], error }; }
        }, [frame, parentFrame]);
        const changes = comparison.changes, liveChanges = useMemo(() => changes.filter(change => change.after), [changes]);
        const changeById = useMemo(() => new Map(changes.map(change => [change.id, change])), [changes]);
        const nodeById = useMemo(() => new Map((frame?.nodes ?? []).map(node => [node.id, node])), [frame]);
        const selectedLive = selectedNodeId ? nodeById.get(selectedNodeId) : null, selectedChange = selectedNodeId ? changeById.get(selectedNodeId) : null;
        const detailNode = selectedLive ?? (selectedChange?.after === null ? selectedChange.before : null);
        const detailSnapshot = selectedLive ? frame : selectedChange?.after === null ? parentFrame : null;
        const detailDeleted = Boolean(selectedNodeId && !selectedLive && selectedChange && !selectedChange.after), detailNotObserved = Boolean(detailDeleted && selectedChange.kinds.includes('未再观察'));
        const detailPath = detailNode && detailSnapshot ? lineage(detailNode, detailSnapshot.nodes) : [];
        const summaryText = useMemo(() => {
            const counts = { add: 0, del: 0, move: 0, mod: 0 };
            for (const change of changes) {
                if (!change.before) counts.add++;
                else if (!change.after) counts.del++;
                else if (change.kinds.some(kind => kind === '归属' || kind === '深度')) counts.move++;
                else counts.mod++;
            }
            return [counts.add && `新增 ${counts.add}`, counts.del && `删除 ${counts.del}`, counts.move && `移动 ${counts.move}`, counts.mod && `修改 ${counts.mod}`].filter(Boolean).join(' · ');
        }, [changes]);
        const tracks = useMemo(() => [...new Set([catalog?.track, ...(catalog?.tracks ?? [])])].filter(Boolean), [catalog]);
        const issues = useMemo(() => [...new Set(catalog?.issues ?? [])], [catalog]);
        const projectName = catalog?.project?.split('/').filter(Boolean).at(-1) ?? '当前工作';
        const selectTime = id => { if (id && id !== selectedId) setSelectedId(id); };
        const goLatest = () => latestRecord && selectTime(latestRecord.id);
        const selectNode = useCallback(id => {
            if (!id) return;
            setSelectedNodeId(id); setSourceState(null); sourceRequest.current?.abort();
            if (frame?.nodes.some(node => node.id === id)) {
                const node = frame.nodes.find(item => item.id === id);
                const ancestors = new Set(lineage(node, frame.nodes).map(item => item.id));
                setCollapsed(previous => { const next = new Set(previous); for (const ancestor of ancestors) next.delete(ancestor); return next; });
                requestAnimationFrame(() => {
                    const element = [...(root.current?.querySelectorAll('[data-node-id]') ?? [])].find(item => item.dataset.nodeId === id);
                    element?.scrollIntoView({ block: 'nearest' });
                    element?.focus?.();
                });
            }
        }, [frame]);
        const closeDetail = () => {
            const id = selectedNodeId;
            setSelectedNodeId(null); setSourceState(null); sourceRequest.current?.abort();
            requestAnimationFrame(() => {
                const node = [...(root.current?.querySelectorAll('[data-node-id]') ?? [])].find(item => item.dataset.nodeId === id);
                const row = [...(root.current?.querySelectorAll('[data-change-id]') ?? [])].find(item => item.dataset.changeId === id);
                (node ?? row)?.focus?.();
            });
        };
        const toggleNode = id => setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
        const expandAll = () => setCollapsed(new Set());
        const collapseAll = () => { if (!frame) return; const parents = new Set(frame.nodes.filter(node => frame.nodes.some(child => child.parentId === node.id)).map(node => node.id)); setCollapsed(parents); };
        const loadMore = () => { if (!loadingList && catalog?.more) void loadList({ more: true }); };
        const insert = (text, message) => {
            if (loadingList || loadingFrame) return false;
            if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) { setNotice('会话已切换，未修改草稿。'); return false; }
            const span = props.inputActions.captureInsertion();
            if (props.inputActions.insertText(text, span)) { setNotice(message); return true; }
            setNotice('草稿正在变化或提交，未插入。现有输入保持原样。');
            return false;
        };
        const insertOrganize = () => insert('\n请先用 work_history_list/read 读取当前工作结构，核对本项目材料，再构建或更新节点、层级和依赖。沿用已有节点 ID，保留来源 ref 和已核对的 version；用 work_history_snapshot 明确保存完整选定结构为新版本，不改旧历史或正式任务状态。\n', '已把结构整理提示带入草稿，尚未发送。');
        const insertSnapshot = () => frame && insert(quote({ snapshot: frame }), '已把当前快照引用带入草稿，尚未发送。');
        const insertNode = () => detailNode && detailSnapshot && insert(quote({ snapshot: detailSnapshot, node: detailNode }), '已把节点引用带入草稿，尚未发送。');
        const insertChanges = () => frame && parentFrame && insert(quote({ snapshot: frame, baseline: parentFrame, changes }), '已把变化引用带入草稿，尚未发送。');
        const explain = () => {
            if (!frame || !parentFrame) return;
            const facts = changes.map(change => {
                const node = change.after ?? change.before, moved = change.kinds.includes('归属') || change.kinds.includes('深度') || !change.before || !change.after;
                return `- ${node.title}：${change.kinds.map(kindLabel).join('、')}${moved && change.before ? `；旧位置：${pathOf(change.before, parentFrame.nodes)}` : ''}${moved && change.after ? `；新位置：${pathOf(change.after, frame.nodes)}` : ''}`;
            }).join('\n');
            const text = `\n请只依据下面已保存的真实历史事实，解释本阶段的结构变化。不要推测用户当时的动机或未记录的决定；请区分“已记录事实”和“你的解释”。\n\n基线：${parentFrame.title}（#${parentFrame.sequence}，记录于 ${fullTime(parentFrame.recordedAt)}）\n当前：${frame.title}（#${frame.sequence}，记录于 ${fullTime(frame.recordedAt)}）\n\n真实变化：\n${facts || '无结构变化'}\n`;
            insert(text, '已把解释请求带入草稿；发送后 DSH 才会解释，未自动调用模型。');
        };
        const verifySource = async sourceIndex => {
            if (!detailNode || !detailSnapshot) return;
            sourceRequest.current?.abort();
            const controller = new AbortController(); sourceRequest.current = controller;
            setSourceState({ loading: true, index: sourceIndex });
            try {
                const value = await rpc('source', { sessionId, snapshotId: detailSnapshot.id, nodeId: detailNode.id, sourceIndex }, controller.signal);
                if (!controller.signal.aborted) setSourceState({ value, index: sourceIndex });
            }
            catch (failure) { if (!controller.signal.aborted) setSourceState({ error: failure, index: sourceIndex }); }
        };
        const tryFullscreen = element => { const target = ctx.sidebarRight.focusedTarget(element); if (target) ctx.sidebarRight.toggleFullscreen(target); };
        const onRailKeyDown = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? ordered.length - 1 : Math.max(0, Math.min(ordered.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
            const target = ordered[nextIndex]; if (!target) return;
            selectTime(target.id);
            requestAnimationFrame(() => { const point = [...(rail.current?.querySelectorAll('[data-point-id]') ?? [])].find(el => el.dataset.pointId === target.id); point?.focus(); });
        };
        const compact = width < 860;
        return <section ref={root} className={`sh-workbench ${compact ? 'is-compact' : ''}`} aria-label="工作结构历史" aria-busy={loadingList || loadingFrame}>
          <header className="sh-head">
            <div className="sh-head-title"><strong>工作历史</strong><span className="sh-project" title={catalog?.project}>{projectName}</span><span className="sh-readonly">只读</span></div>
            <div className="sh-head-actions">
              <button type="button" className="sh-icon" onClick={refresh} disabled={loadingList} aria-label="刷新历史" title="刷新历史">↻</button>
              <button type="button" className="sh-icon" onClick={event => tryFullscreen(event.currentTarget)} aria-label={info.sidebar.fullscreen ? '退出全屏' : '进入全屏'} title={info.sidebar.fullscreen ? '退出全屏' : '全屏'}>{info.sidebar.fullscreen ? '⤡' : '⤢'}</button>
              <details className="sh-menu">
                <summary className="sh-icon" aria-label="更多历史操作" title="更多">⋯</summary>
                <div className="sh-menu-pop"><button type="button" onClick={insertOrganize}>更新结构 ↗</button><button type="button" onClick={insertSnapshot} disabled={!frame}>引用本快照 ↗</button></div>
              </details>
            </div>
          </header>
          {notice ? <p className="sh-notice" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={() => setNotice('')}>×</button></p> : null}
          {error ? <div className="sh-error" role="alert"><span>{issue(error)}</span><button type="button" onClick={refresh}>重试</button></div> : null}
          {ordered.length ? <div className="sh-history">
            <div className="sh-history-head">
              <div className="sh-history-title"><span className="sh-kicker">历史时间轴</span><span className="sh-latest">最新已记录 <b>#{latestRecord?.sequence}</b> · {time(latestRecord?.recordedAt)}</span><span className="sh-live" title="历史面板只读；实时结构请在 Logseq 中查看">实时结构未读取</span></div>
              <div className="sh-history-actions">
                {tracks.length > 1 ? <label className="sh-track"><span>历史线</span><select aria-label="历史线" value={catalog?.track ?? track} onChange={event => { if (event.target.value !== (catalog?.track ?? track)) setTrack(event.target.value); }}>{tracks.map(value => <option key={value} value={value}>{trackName(value)}</option>)}</select></label> : null}
                {!isLatest ? <button type="button" className="sh-latest-button" onClick={goLatest}>回到最新</button> : null}
              </div>
            </div>
            <div className="sh-rail-wrap">
              <button type="button" className="sh-rail-nav" disabled={!previousRecord} onClick={() => previousRecord && selectTime(previousRecord.id)} aria-label="上一个历史时点">‹</button>
              <div className="sh-rail" ref={rail} role="tablist" aria-label="历史时点" onKeyDown={onRailKeyDown}>
                {catalog?.more ? <button type="button" className="sh-load-more" onClick={loadMore} disabled={loadingList}>{loadingList ? '读取中…' : '载入更早'}</button> : null}
                {ordered.map(record => <button key={record.id} type="button" role="tab" data-point-id={record.id} tabIndex={record.id === selectedId ? 0 : -1} aria-selected={record.id === selectedId} className={`sh-point ${record.id === selectedId ? 'is-selected' : ''}`} onClick={() => selectTime(record.id)} title={`${record.title} · ${recordKind(record)} · 记录于 ${fullTime(record.recordedAt)}`}>
                  <span className="sh-point-dot" aria-hidden="true" />
                  <span className="sh-point-top"><span>#{record.sequence}</span>{record.id === latestRecord?.id ? <span className="sh-point-latest">最新</span> : null}</span>
                  <span className="sh-point-title">{record.title || '未命名阶段'}</span>
                  <span className="sh-point-bottom"><span>{pointTime(record.recordedAt)}</span></span>
                </button>)}
              </div>
              <button type="button" className="sh-rail-nav" disabled={!nextRecord} onClick={() => nextRecord && selectTime(nextRecord.id)} aria-label="下一个历史时点">›</button>
            </div>
            {chain.omitted.length || (chain.broken && !catalog?.more) ? <p className="sh-chain-note">{chain.omitted.length ? `另有 ${chain.omitted.length} 条记录不在这条因果链上；这里只按保存的父链展示。` : '更早的记录缺失或父链不完整；没有按时间戳重排。'}</p> : null}
          </div> : null}
          {frame ? <div className="sh-snapshot-note">
            <span className={`sh-snapshot-kind ${frame.origin}`}>{isLatest ? '最新已记录快照' : `历史快照 #${frame.sequence}`}</span>
            <span className="sh-snapshot-title">{frame.title}</span>
            <span className="sh-muted">{recordKind(frame)}</span>
            <span className="sh-muted">记录于 {time(frame.recordedAt)}</span>
            {frame.occurredAt ? <span className="sh-muted">事件 {time(frame.occurredAt)}</span> : null}
            {frame.reconstructedAt ? <span className="sh-warn">重建于 {time(frame.reconstructedAt)}</span> : null}
            {frame.coverage === 'partial' ? <span className="sh-warn" title="未观察到的节点不等于已删除">部分范围</span> : null}
            <span className="sh-muted sh-live-note">{isLatest ? '此后的实时修改不会出现在这里' : '当前实时结构可能已不同于此快照'}</span>
          </div> : null}
          {issues.length ? <details className="sh-issues"><summary>存储与来源提示 · {issues.length}</summary><ul>{issues.map((item, i) => <li key={i}>{item}</li>)}</ul></details> : null}
          <div className="sh-body">
            <main className="sh-main">
              {frame ? <>
                <div className="sh-tree-head">
                  <div className="sh-tree-title"><strong>结构树</strong><span>{frame.nodes.length} 节点</span>{parentFrame ? <span className="sh-change-count">{changes.length} 处变化</span> : null}</div>
                  <div className="sh-tree-tools">
                    <label className="sh-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索节点" aria-label="搜索历史节点" />{query ? <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}>×</button> : null}</label>
                    <button type="button" className="sh-text" disabled={!query && !collapsed.size} onClick={expandAll}>展开</button>
                    <button type="button" className="sh-text" onClick={collapseAll}>收起</button>
                    <div className="sh-seg" role="group" aria-label="结构视图"><button type="button" aria-pressed={mode === 'tree'} onClick={() => setMode('tree')}>树</button><button type="button" aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}>图</button></div>
                    {mode === 'graph' ? <div className="sh-zoom"><button type="button" aria-label="缩小结构图" disabled={zoom <= .55} onClick={() => setZoom(Math.max(.55, zoom - .15))}>−</button><button type="button" aria-label="重置结构图缩放" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="放大结构图" disabled={zoom >= 1.6} onClick={() => setZoom(Math.min(1.6, zoom + .15))}>＋</button></div> : null}
                  </div>
                </div>
                {mode === 'tree' ? <div className="sh-tree-scroll"><TreeView frame={frame} changes={changes} selectedId={detailNode && selectedLive ? selectedNodeId : null} onSelect={selectNode} onToggle={toggleNode} collapsed={collapsed} query={query} /></div>
                  : <div className="sh-graph-wrap"><CanvasBoundary resetKey={`${frame.id}:${mode}`} onTree={() => setMode('tree')}><Structure after={frame} before={parentFrame} changes={liveChanges} selected={selectedLive ? selectedNodeId : null} onSelect={selectNode} query={query} changedOnly={false} mode="graph" zoom={zoom} /></CanvasBoundary></div>}
                <section className={`sh-changes ${changesOpen ? 'is-open' : ''}`}>
                  <div className="sh-changes-head">
                    <button type="button" className="sh-changes-toggle" aria-expanded={changesOpen} onClick={() => setChangesOpen(value => !value)}>
                      <span className="sh-chev" aria-hidden="true">{changesOpen ? '▾' : '▸'}</span><strong>真实变化</strong>
                      {parentFrame ? <span className="sh-compared">较 #{parentFrame.sequence}</span> : <span className="sh-compared">阶段起点</span>}
                      {parentFrame ? <span className="sh-change-total">{changes.length} 处</span> : null}
                      {summaryText ? <span className="sh-change-summary">{summaryText}</span> : null}
                    </button>
                    <div className="sh-changes-actions">
                      {parentFrame && changes.length ? <button type="button" className="sh-explain" onClick={explain} title="带入草稿，不会自动调用模型">解释本阶段</button> : null}
                      {parentFrame ? <button type="button" className="sh-icon" onClick={insertChanges} aria-label="引用变化" title="引用变化">↗</button> : null}
                    </div>
                  </div>
                  {changesOpen ? <div className="sh-changes-body">
                    {!parentFrame ? <div className="sh-changes-empty">{parentError ? issue(parentError) : catalog?.more ? '更早记录尚未载入；载入后就能比较。' : '这是当前历史线的起点，没有更早记录可比较。'}{catalog?.more ? <button type="button" onClick={loadMore}>载入更早记录</button> : null}</div>
                      : comparison.error ? <div className="sh-changes-empty" role="alert">{issue(comparison.error)}</div>
                      : !changes.length ? <div className="sh-changes-empty">与 #{parentFrame.sequence} 相比，没有结构、正文或来源变化。</div>
                      : <ul className="sh-change-list">{changes.map(change => { const mark = markOf(change), node = change.after ?? change.before, lines = describeChange(change, parentFrame, frame); return <li key={change.id}><button type="button" data-change-id={change.id} className={`sh-change-row is-${mark.kind} ${selectedNodeId === change.id ? 'is-selected' : ''}`} onClick={() => selectNode(change.id)}>
                        <span className={`sh-change-mark ${mark.kind}`}>{mark.label}</span>
                        <span className="sh-change-content"><span className="sh-change-title">{node.title || '未命名节点'}</span><span className="sh-change-desc">{lines.map((line, i) => <span key={i}>{line}</span>)}</span></span>
                        <span className="sh-change-kinds">{[...new Set(change.kinds.map(kindLabel))].join(' · ')}</span>
                      </button></li>; })}</ul>}
                    {selectedRecord?.explanations?.length ? <details className="sh-ai"><summary>Agent 解释 · {selectedRecord.explanations.length} 条 <span>非历史事实</span></summary>{selectedRecord.explanations.map((explanation, i) => <p key={i}>{explanation.text}</p>)}</details> : null}
                  </div> : null}
                </section>
              </> : <div className="sh-main-loading">{frameError ? <div className="sh-error" role="alert"><span>{issue(frameError)}</span><button type="button" onClick={refresh}>重试</button></div> : loadingFrame || loadingList || ordered.length ? <><p className="sh-loading-label">正在读取历史快照…</p><Skeleton /></> : <div className="sh-no-history"><strong>还没有可回看的工作结构</strong><p>DSH 保存的结构，或已连接 Logseq 的阶段修订，会出现在这里。</p><button type="button" onClick={refresh}>刷新历史</button></div>}</div>}
            </main>
            {detailNode && detailSnapshot ? <aside ref={detail} className="sh-detail" aria-label="历史节点详情" onKeyDown={event => { if (event.key === 'Escape') closeDetail(); }}>
              <div className="sh-detail-head">
                <div><div className="sh-detail-kicker"><span>{detailDeleted ? detailNotObserved ? '未再观察' : '删除前' : selectedChange && !selectedChange.before ? '新增于' : '历史节点'}</span><span>#{detailSnapshot.sequence} · {detailSnapshot.title}</span></div><h2>{detailNode.title || '未命名节点'}</h2></div>
                <button type="button" className="sh-icon sh-detail-close" data-detail-close aria-label="关闭节点详情" onClick={closeDetail}>×</button>
              </div>
              {detailDeleted ? <div className={`sh-detail-banner ${detailNotObserved ? 'is-unknown' : 'is-deleted'}`}>{detailNotObserved ? <>这个节点在 #{frame?.sequence} 未再观察，不能判定为删除。正文来自 #{detailSnapshot.sequence}。</> : <>这个节点已从 #{frame?.sequence} 的结构中删除，不在当前结构树里。下面显示删除前的历史正文。</>}</div> : selectedChange && !selectedChange.before ? <div className="sh-detail-banner is-added">此节点新增于 #{detailSnapshot.sequence}。</div> : null}
              <div className="sh-lineage" aria-label="当时父级路径">{detailPath.map((node, i) => <React.Fragment key={node.id}>{i ? <span className="sh-sep">/</span> : null}<span className={i === detailPath.length - 1 ? 'is-current' : ''}>{node.title || '未命名节点'}</span></React.Fragment>)}</div>
              <div className="sh-detail-meta">
                <span>状态 {detailNode.status ?? '未声明'}</span><span>第 {detailPath.length} 层</span><span>同级第 {detailNode.order + 1} 位</span>
                {detailNode.dependencies.length ? <span>依赖 {detailNode.dependencies.map(id => detailSnapshot.nodes.find(node => node.id === id)?.title ?? id).join('、')}</span> : null}
              </div>
              {selectedChange ? <div className="sh-change-line"><span className={`sh-change-mark ${markOf(selectedChange).kind}`}>{markOf(selectedChange).label}</span><span>较 #{parentFrame?.sequence}：{selectedChange.kinds.map(kindLabel).join(' · ')}</span></div> : null}
              <section className="sh-detail-section">
                <div className="sh-section-head"><h3>历史正文</h3><span className="sh-section-source">{detailDeleted ? `删除前 · #${detailSnapshot.sequence}` : `保存于 #${detailSnapshot.sequence}`}</span></div>
                <pre className="sh-history-body">{savedBody(detailNode)}</pre>
                {detailNode.availability !== 'available' ? <p className="sh-warn">当时未记录正文；这里不会用今天的内容补写。</p> : null}
              </section>
              {selectedChange?.before && selectedChange?.after && (selectedChange.kinds.includes('正文') || selectedChange.kinds.includes('改名') || selectedChange.kinds.includes('归属') || selectedChange.kinds.includes('深度') || selectedChange.kinds.includes('声明状态') || selectedChange.kinds.includes('依赖') || selectedChange.kinds.includes('顺序')) ? <details className="sh-fields"><summary>与 #{parentFrame.sequence} 的字段差异</summary><Fields change={selectedChange} before={parentFrame} after={frame} />{selectedChange.inline ? <div className="sh-inline"><span>{selectedChange.inline.prefix}</span><mark>{selectedChange.inline.inserted}</mark><span>{selectedChange.inline.suffix}</span></div> : null}</details> : null}
              {deletionNotes(selectedChange).map((line, i) => <p key={i} className="sh-detail-note">{line}</p>)}
              <section className="sh-detail-section sh-sources">
                <div className="sh-section-head"><h3>来源</h3><span className="sh-section-source">历史正文与今天的内容分开</span></div>
                {detailNode.sources.length ? detailNode.sources.map((source, i) => {
                    const active = sourceState?.index === i, result = active ? sourceState : null;
                    return <div key={i} className="sh-source-item">
                      <div className="sh-source-row"><span className={`sh-source-kind ${source.kind}`}>{source.kind === 'logseq' ? 'Logseq' : source.kind === 'file' ? '文件' : '历史来源'}</span><span className="sh-source-name" title={source.ref}>{sourceName(source)}</span><span className="sh-source-version">历史版本 {shortVersion(source.version)}</span><button type="button" className="sh-source-check" disabled={sourceState?.loading} title="只读核对；不修改历史" onClick={() => void verifySource(i)}>{result?.loading ? '核对中…' : '核对当前来源'}</button></div>
                      {result?.error ? <div className="sh-source-result is-error" role="alert"><p>{issue(result.error)}</p><p className="sh-muted">历史正文仍来自 #{detailSnapshot.sequence}，没有改动。</p></div> : null}
                      {result?.value ? <div className="sh-source-result">
                        <p className={result.value.current?.availability === 'available' ? 'sh-source-notice' : 'sh-source-notice is-warn'}>{result.value.notice}</p>
                        <div className="sh-version-row"><span>历史 {shortVersion(result.value.source?.version)}</span><span>当前 {shortVersion(result.value.current?.version)}</span>{result.value.current?.availability ? <span>{result.value.current.availability === 'available' ? '当前可读' : '当前不可用'}</span> : null}</div>
                        {result.value.current?.content ? <details className="sh-current-source"><summary>查看今天的内容（不是历史正文）</summary><pre>{result.value.current.content}</pre>{result.value.current.truncated ? <small>当前来源已节选</small> : null}</details> : null}
                        {result.value.navigation ? <a className="sh-logseq-link" href={result.value.navigation.url} target="_blank" rel="noreferrer">{result.value.source?.version && result.value.current?.version && result.value.source.version === result.value.current.version ? '在 Logseq 中打开原文 ↗' : '在 Logseq 中定位今天的块 ↗'}</a> : source.kind === 'logseq' ? <p className="sh-muted sh-no-jump">来源身份或版本未能核验到可跳转状态，因此不提供原文入口。</p> : null}
                      </div> : null}
                    </div>;
                }) : <p className="sh-muted">这个节点没有保存来源。</p>}
              </section>
              <footer className="sh-detail-foot"><button type="button" className="sh-secondary" onClick={insertNode}>带入草稿</button><span>只读历史 · 不会修改 Graph</span></footer>
            </aside> : null}
          </div>
        </section>;
    }
    ctx.effect(() => ctx.sidebarRightTabs.register({ id: tabId, kind: 'work-history', title: () => '工作历史', priority: 'extension', guide: [{ id: 'work-history', order: 360, title: () => '工作结构与历史' }] }));
    const register = (slot, spec, component) => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...spec }, component));
    register('conversation.session.header.utilities', { id: 'work-history', order: 12 }, Header);
    register('sidebar.right.pane.tab', { key: tabId }, Panel);
    ctx.on('connection/reset', () => { for (const refresh of refreshers) refresh(); });
    ctx.on('dispose', () => { style.remove(); refreshers.clear(); });
}
function deletionNotes(change) {
    if (!change || change.after) return [];
    return [change.kinds.includes('未再观察') ? '未再观察不能当作删除；旧正文和旧位置仍按保存的父修订展示。' : '删除节点只出现在变化列表和详情中，不会被伪造进当前结构树。'];
}
