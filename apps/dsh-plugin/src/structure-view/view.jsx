/* global ResizeObserver */
import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import { origins, outline } from './model.mjs';
import { treeLayout, visibleTree } from './layout.mjs';
const depth = (node, map) => { let d = 0; for (let p = node.parentId; p && map.has(p); p = map.get(p).parentId)
    d++; return d; };
/** Two-dimensional viewport culling keeps large saved trees usable. */
export function Structure({ after, before, changes, selected, onSelect, query, changedOnly, mode, zoom }) {
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
export function Fields({ change, before, after }) {
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
