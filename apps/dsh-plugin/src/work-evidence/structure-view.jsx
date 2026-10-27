import React, { useEffect, useState } from 'react';
import { treeLayout, visibleTree } from '../structure-history/layout.mjs';

const labels = { unavailable: '本轮没有可比较的真实结构快照：来源未连接、未授权、已变化或读取失败。文件变化仍可使用。', baseline: '首次取得可信结构，仅建立基线；此前结构变化未知。', 'previous-unavailable': '所选同步记录没有可信结构快照，不能比较。', 'scope-changed': 'Graph 或工作范围已改变，不能比较这两个快照。', 'invalid-time': '请选择较早的同步记录。' };
export function EvidenceStructure({ rpc, scopeId, observationId }) {
  const [data, setData] = useState(null), [selected, setSelected] = useState(''), [baseline, setBaseline] = useState(''), [history, setHistory] = useState([]), [source, setSource] = useState(null);
  useEffect(() => { let current = true; rpc('history', { scopeId }).then(value => { if (current) setHistory(value.items.map(item => item.value)); }, () => {}); return () => { current = false; }; }, [scopeId]);
  useEffect(() => { let current = true; setData(null); setSelected(''); rpc('structure', { scopeId, observationId, ...(baseline ? { beforeObservationId: baseline } : {}) }).then(value => { if (current) setData(value); }, () => { if (current) setData({ state: 'unavailable' }); }); return () => { current = false; }; }, [scopeId, observationId, baseline]);
  if (!data) return <p>正在读取结构快照…</p>;
  const currentObservation = history.find(item => item.id === observationId);
  const selector = <label>比较基准 <select value={baseline} onChange={event => setBaseline(event.target.value)}><option value="">上次成功同步</option>{history.filter(item => item.id !== observationId && currentObservation && item.observedAt <= currentObservation.observedAt).map(item => <option key={item.id} value={item.id}>{item.observedAt}</option>)}</select></label>;
  if (data.state !== 'comparable') return <>{selector}<p role="status">{labels[data.state]}</p></>;
  const { before, after, changes } = data, tree = visibleTree(after, changes), layout = treeLayout(tree.nodes, 620);
  const byChange = new Map(changes.map(change => [change.id, change]));
  const node = tree.nodes.find(item => item.id === selected), change = byChange.get(selected);
  const position = (item, snapshot) => {
    if (!item) return '此时点没有此节点';
    const map = new Map(snapshot.nodes.map(n => [n.id, n])); let depth = 0, parent = item.parentId;
    while (parent && map.has(parent)) { depth++; parent = map.get(parent).parentId; }
    return `${item.parentId ? map.get(item.parentId)?.title ?? item.parentId : '根级'} · 第 ${item.order + 1} 位 · 第 ${depth + 1} 层`;
  };
  return <section aria-label="真实结构变化">
    {selector}
    <p className="we-muted">比较 Logseq 已保存来源：{before.capturedAt} → {after.capturedAt}。这是来源采集时间，可能早于同步；并非两个时点间的完整操作过程。</p>
    <p>{changes.length} 个节点有变化 · 选中节点查看前后位置、正文与来源</p>
    <div style={{ overflow: 'auto', maxHeight: 480 }} role="region" aria-label="结构变化图">
      <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
        <svg width={layout.width} height={layout.height} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">{layout.edges.map(edge => { const a = layout.positions.get(edge.from), b = layout.positions.get(edge.to); return <path key={`${edge.from}:${edge.to}`} d={`M${a.x + a.width / 2} ${a.y + a.height} V${edge.bus} H${b.x + b.width / 2} V${b.y}`} fill="none" stroke="currentColor" opacity=".4" />; })}</svg>
        {tree.nodes.map(item => { const p = layout.positions.get(item.id), c = byChange.get(item.id); return <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} style={{ position: 'absolute', left: p.x, top: p.y, width: p.width, height: p.height, overflow: 'hidden' }}>{item.title || '未命名节点'}{c && <><br /><small>{c.kinds.join('、')}</small></>}</button>; })}
      </div>
    </div>
    {node && <div className="we-row"><strong>{node.title}</strong><p>{change?.kinds.join('、') || '结构未变化'}</p>
      {[['比较前', change ? change.before : before.nodes.find(n => n.id === selected), before], ['比较后', change ? change.after : after.nodes.find(n => n.id === selected), after]].map(([label, item, snapshot]) => <div key={label}><p><strong>{label}</strong>：{position(item, snapshot)}</p>{item && <><pre>{item.body}</pre>{item.sources.map(source => <p key={source.ref}>来源：<code>{source.ref}</code> · 版本 {source.version ?? '未知'}</p>)}</>}</div>)}
      <button type="button" onClick={() => { const nodeId = selected, target = change && !change.after ? data.beforeObservationId : observationId; setSource(null); void rpc('structureSource', { scopeId, observationId: target, nodeId }).then(value => setSource({ nodeId, target, value }), () => setSource({ nodeId, target, error: true })); }}>核对当前来源</button>
      {source?.nodeId === selected && source.target === (change && !change.after ? data.beforeObservationId : observationId) && (source.error ? <p role="status">当前来源不可用、已移出范围或工作连接已改变；历史正文保持不变。</p> : <div><p>{source.value.matches ? '当前来源版本与所选快照一致。' : '当前来源版本已变化或不可用；历史正文保持不变。'}</p><pre>{source.value.content}</pre></div>)}
    </div>}
  </section>;
}
