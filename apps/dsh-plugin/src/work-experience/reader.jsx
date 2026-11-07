/* global window, requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildTree, flattenTree, semanticTone, statusLabel, statusTone, workTypeLabel } from './model.mjs';
import { Markdown, rangesFromSelection } from './markdown.jsx';

function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`wx-status is-${statusTone(status)}`} title={statusLabel(status)}>{status}</span>;
}

function SemanticBadge({ semantic }) {
  if (!semantic) return null;
  return <span className={`wx-semantic is-${semanticTone(semantic.kind)}`}>{semantic.label}</span>;
}

function Properties({ properties }) {
  if (!properties?.length) return null;
  return <div className="wx-props" aria-label="来源属性">{properties.map((property, index) => (
    <span className="wx-prop" key={`${property.name}:${index}`}><span className="wx-prop-name">{property.name}</span><span className="wx-prop-value">{property.value || '—'}</span></span>
  ))}</div>;
}

function Block({ node, tree, collapsed, onToggle, focusUuid, workTypes, onAdd, onNotice }) {
  const children = tree.children.get(node.blockUuid) ?? [];
  const open = !collapsed.has(node.blockUuid);
  const body = node.body ?? {};
  const work = workTypes?.get(node.blockUuid);
  const focus = focusUuid === node.blockUuid;
  const object = /^(?:\*\*)?\[(Project|MiniProject|事务|事项|任务)\](?:\*\*)?[ \t]*/u.exec(body.markdown ?? '');
  const objectLabel = object ? ({ Project: 'Project', MiniProject: 'MiniProject' }[object[1]] ?? 'Task') : null;
  const skip = object ? object[0].length : 0;
  const whole = () => onAdd([{ blockUuid: node.blockUuid, sourceId: node.sourceId, contentVersion: node.contentVersion, range: null, excerpt: body.markdown ?? '' }]);
  return <article className={`wx-block${focus ? ' is-focus' : ''}${work ? ' is-work' : ''}`} data-block-uuid={node.blockUuid}>
    <div className="wx-block-row">
      <div className="wx-block-gutter">
        {children.length ? <button type="button" className="wx-fold" aria-label={open ? '收起下级内容' : '展开下级内容'} aria-expanded={open} onClick={() => onToggle(node.blockUuid)}>{open ? '▾' : '▸'}</button> : <span className="wx-leaf" aria-hidden="true" />}
      </div>
      <div className="wx-block-main">
        <div className="wx-block-head">
          <StatusBadge status={body.status} />
          <SemanticBadge semantic={body.semantic} />
          {objectLabel ? <span className="wx-type">{objectLabel}</span> : work ? <span className="wx-type">{workTypeLabel(work.type)}</span> : null}
          {focus ? <span className="wx-focus-chip">当前工作</span> : null}
          {node.availability !== 'available' ? <span className="wx-unavailable">原文暂不可用</span> : null}
          <div className="wx-block-actions">
            <button type="button" aria-label="把这一段加入引用" title="加入引用" onClick={whole}>＋</button>
            {node.logseqUrl ? <a href={node.logseqUrl} target="_blank" rel="noreferrer" aria-label="在 Logseq 打开这一段" title="在 Logseq 打开">↗</a> : null}
          </div>
        </div>
        {body.markdown?.trim() ? (body.tokens?.length ? <Markdown tokens={body.tokens} source={body.markdown} skip={skip} /> : <div className="wx-md wx-md-plain">{body.markdown.slice(skip)}</div>) : null}
        <Properties properties={body.properties} />
        {children.length && !open ? <button type="button" className="wx-collapsed-hint" onClick={() => onToggle(node.blockUuid)}>{children.length} 条下级内容</button> : null}
      </div>
    </div>
    {children.length && open ? <div className="wx-children">{children.map(child => <Block key={child.blockUuid} node={child} tree={tree} collapsed={collapsed} onToggle={onToggle} focusUuid={focusUuid} workTypes={workTypes} onAdd={onAdd} onNotice={onNotice} />)}</div> : null}
  </article>;
}

/** Logseq's real block hierarchy, readable at any width. No permanent per-block buttons. */
export function Reader({ nodes, onlyIds, focusUuid, workTypes, onAdd, onNotice, resetKey = '', toolbar = true }) {
  const root = useRef(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [popup, setPopup] = useState(null);
  const initialized = useRef(null);
  const nodeByUuid = useMemo(() => new Map(nodes.map(node => [node.blockUuid, node])), [nodes]);
  const visible = useMemo(() => onlyIds ? nodes.filter(node => onlyIds.has(node.blockUuid)) : nodes, [nodes, onlyIds]);
  const tree = useMemo(() => buildTree(visible), [visible]);
  const rows = useMemo(() => flattenTree(tree), [tree]);

  useEffect(() => {
    if (initialized.current === resetKey) return;
    initialized.current = resetKey;
    setPopup(null);
    if (visible.length <= 48) { setCollapsed(new Set()); return; }
    const next = new Set();
    for (const { node, depth } of rows) if (depth >= 2 && (tree.children.get(node.blockUuid)?.length ?? 0)) next.add(node.blockUuid);
    setCollapsed(next);
  }, [resetKey, visible.length, rows, tree]);

  useEffect(() => { if (!collapsed.size) return; setPopup(null); }, [collapsed]);

  useEffect(() => {
    const rootNode = root.current;
    if (!rootNode) return;
    const hide = () => setPopup(null);
    rootNode.closest('.wx-scroll')?.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
    return () => { rootNode.closest('.wx-scroll')?.removeEventListener('scroll', hide); window.removeEventListener('resize', hide); };
  }, []);

  useEffect(() => {
    if (!focusUuid) return;
    const frame = requestAnimationFrame(() => {
      const element = [...(root.current?.querySelectorAll('[data-block-uuid]') ?? [])].find(node => node.dataset.blockUuid === focusUuid);
      element?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusUuid, resetKey]);

  const toggle = uuid => setCollapsed(previous => { const next = new Set(previous); if (next.has(uuid)) next.delete(uuid); else next.add(uuid); return next; });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const next = new Set();
    for (const { node } of rows) if (tree.children.get(node.blockUuid)?.length) next.add(node.blockUuid);
    setCollapsed(next);
  };
  const readSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !root.current) { setPopup(null); return; }
    const range = selection.getRangeAt(0);
    if (!root.current.contains(range.commonAncestorContainer)) { setPopup(null); return; }
    const ranges = rangesFromSelection(root.current, range, nodeByUuid);
    if (!ranges.length) { setPopup(null); if (String(selection).trim()) onNotice?.('这段内容没有可映射的正文位置，请改为引用整块。'); return; }
    const items = ranges.map(item => {
      const node = nodeByUuid.get(item.blockUuid);
      return { ...item, excerpt: node.body.markdown.slice(item.range.start, item.range.end) };
    });
    const rect = range.getBoundingClientRect(), box = root.current.getBoundingClientRect();
    setPopup({ items, top: Math.max(4, rect.top - box.top - 38), left: Math.max(68, Math.min(rect.left - box.left + rect.width / 2, box.width - 68)) });
  };
  const addSelection = () => {
    if (!popup) return;
    onAdd(popup.items);
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  };
  const focusBlock = () => {
    if (!focusUuid) return;
    const element = [...(root.current?.querySelectorAll('[data-block-uuid]') ?? [])].find(node => node.dataset.blockUuid === focusUuid);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return <div className="wx-reader" ref={root}>
    {toolbar ? <div className="wx-reader-tools">
      <span className="wx-reader-count">{rows.length} 个来源块</span>
      <button type="button" onClick={expandAll} disabled={!collapsed.size}>展开</button>
      <button type="button" onClick={collapseAll} disabled={!rows.some(({ node }) => tree.children.get(node.blockUuid)?.length)}>收起</button>
      {focusUuid ? <button type="button" onClick={focusBlock}>定位当前</button> : null}
    </div> : null}
    <div onMouseUp={readSelection} onKeyUp={readSelection} className="wx-reader-body">
      {tree.roots.length ? tree.roots.map(node => <Block key={node.blockUuid} node={node} tree={tree} collapsed={collapsed} onToggle={toggle} focusUuid={focusUuid} workTypes={workTypes} onAdd={onAdd} onNotice={onNotice} />)
        : <p className="wx-empty-line">这里还没有可读的原文。</p>}
    </div>
    {popup ? <button type="button" className="wx-select-action" style={{ top: popup.top, left: popup.left }} onMouseDown={event => event.preventDefault()} onClick={addSelection}>
      {popup.items.length > 1 ? `引用选中的 ${popup.items.length} 处` : '引用选中文字'}
    </button> : null}
  </div>;
}
