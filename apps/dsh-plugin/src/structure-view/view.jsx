import React, { useState } from 'react';
import { structureRows } from './model.mjs';
/** Shared node/edge presentation with selection and expansion, independent of evidence/history. */
export function StructureView({ nodes, edges, selectedId, onSelect }) {
  const [collapsed, setCollapsed] = useState(new Set());
  return <div className="we-structure" role="tree" aria-label="工作结构关系">{structureRows(nodes, edges, collapsed).map(row => <div role="treeitem" aria-level={row.depth + 1} aria-selected={selectedId === row.id} aria-expanded={row.hasChildren ? !row.collapsed : undefined} key={row.id} style={{ marginLeft: `${row.depth * 18}px`, borderLeft: row.depth ? '1px solid #8886' : undefined, padding: '3px 8px' }}>
    {row.hasChildren && <button type="button" aria-label={`${row.collapsed ? '展开' : '收起'}${row.label}`} onClick={() => setCollapsed(prior => { const next = new Set(prior); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })}>{row.collapsed ? '+' : '−'}</button>}
    <button type="button" onClick={() => onSelect(row.id)} aria-current={selectedId === row.id ? 'true' : undefined}>{row.label}</button>{row.detail && <span className="we-muted"> · {row.detail}</span>}
  </div>)}</div>;
}
