/** Generic directed structure layout. Business modules own meaning, records and permissions. */
export function structureRows(nodes, edges, collapsed = new Set()) {
  const known = new Map(nodes.map(node => [node.id, node])), children = new Map(), parents = new Set();
  for (const edge of edges) if (known.has(edge.from) && known.has(edge.to)) {
    const list = children.get(edge.from) ?? []; list.push(edge.to); children.set(edge.from, list); parents.add(edge.to);
  }
  const rows = [], visited = new Set();
  function visit(id, depth) {
    if (visited.has(id)) return; visited.add(id);
    rows.push({ ...known.get(id), depth, hasChildren: !!children.get(id)?.length, collapsed: collapsed.has(id) });
    if (!collapsed.has(id)) for (const child of children.get(id) ?? []) visit(child, depth + 1);
  }
  for (const node of nodes) if (!parents.has(node.id)) visit(node.id, 0);
  // Cycles/orphans still have an inspectable entry; hidden descendants stay hidden.
  if (!rows.length) for (const node of nodes) visit(node.id, 0);
  return rows;
}
